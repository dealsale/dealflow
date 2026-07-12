import { Router } from 'express';
import { db, j, pj, uid } from './db.js';
import { clearAuthCookie, hashPassword, requireAdmin, requireAuth, requireStore, setAuthCookie, verifyPassword } from './auth.js';
import type { AuthUser } from './auth.js';
import { handleIncomingWebhook, sendWhatsappMedia, sendWhatsappText, verifyWhatsappCredentials } from './wa.js';
import { mediaPath, saveOutgoingMedia, saveOutgoingMessage } from './media.js';
import { existsSync } from 'node:fs';

export const api = Router();
export const webhooks = Router();

const ESTADOS = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado'] as const;

// ── Auth ──────────────────────────────────────────────────────────────
api.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  const row = db.prepare('SELECT id, email, password_hash, nombre, role, store_id FROM users WHERE email = ?').get(String(email).toLowerCase().trim()) as
    | { id: string; email: string; password_hash: string; nombre: string; role: 'VENDEDOR' | 'ADMIN'; store_id: string | null }
    | undefined;
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  if (row.role === 'VENDEDOR' && row.store_id) {
    const store = db.prepare('SELECT activa FROM stores WHERE id = ?').get(row.store_id) as { activa: number } | undefined;
    if (!store?.activa) return res.status(403).json({ error: 'Tu cuenta está desactivada. Escríbenos para reactivarla.' });
  }
  const user: AuthUser = { id: row.id, email: row.email, nombre: row.nombre, role: row.role, storeId: row.store_id };
  setAuthCookie(res, user);
  res.json({ user });
});

api.post('/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Estado completo de la tienda (una llamada para pintar el panel) ───
api.get('/state', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const store = db.prepare('SELECT id, nombre, plan FROM stores WHERE id = ?').get(sid);
  const products = (db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[]).map((p) => ({
    id: p.id, nombre: p.nombre, precio: p.precio, color: p.color, txt: p.txt,
    reglas: pj(p.reglas as string, []), fotos: pj(p.fotos as string, []), fotosSubidas: pj(p.fotos_subidas as string, []),
    descripcion: p.descripcion || '', caracteristicas: p.caracteristicas || '', mensajeInicial: p.mensaje_inicial || '',
    faqs: pj(p.faqs as string, []), testimonios: pj(p.testimonios as string, []), modosUso: p.modos_uso || '',
    videos: pj(p.videos as string, []), mensajeBloques: pj(p.mensaje_bloques as string, []),
    bundles: pj(p.bundles as string, []), opciones: pj(p.opciones as string, []),
    contenidoPaquete: p.contenido_paquete || '', disparador: p.disparador || '', mensajeInicialActivo: p.mensaje_inicial_activo !== 0,
    variantes: (db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY orden').all(p.id as string) as Record<string, unknown>[]).map((v) => ({
      id: v.id, label: v.label, stock: v.stock, fotos: v.fotos, fotosSubidas: pj(v.fotos_subidas as string, []),
    })),
  }));
  const promos = (db.prepare('SELECT * FROM promos WHERE store_id = ?').all(sid) as Record<string, unknown>[]).map((p) => ({
    id: p.id, tipo: p.tipo, titulo: p.titulo, desc: p.descripcion, vigencia: p.vigencia, activa: !!p.activa,
  }));
  const orders = (db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY numero DESC').all(sid) as Record<string, unknown>[]).map((o) => ({
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
    items: (db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(o.id as string)),
  }));
  const leads = (db.prepare('SELECT * FROM leads WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[]).map((l) => ({
    id: l.id, nombre: l.nombre, tel: l.tel, etapa: l.etapa, asignado: l.asignado,
    mensajes: (db.prepare('SELECT de, texto, created_at, tipo, media_url, media_mime, media_nombre FROM messages WHERE lead_id = ? ORDER BY created_at').all(l.id as string) as Record<string, unknown>[]).map((m) => ({
      de: m.de, texto: m.texto, hora: String(m.created_at).slice(11, 16), tipo: m.tipo || 'texto', mediaUrl: m.media_url || null, mediaMime: m.media_mime || null, mediaNombre: m.media_nombre || null,
    })),
  }));
  const assistant = db.prepare('SELECT instrucciones, reglas FROM assistants WHERE store_id = ?').get(sid) as { instrucciones: string; reglas: string } | undefined;
  const wa = db.prepare('SELECT waba_id, phone_number_id, numero, conectado, access_token, modo FROM whatsapp WHERE store_id = ?').get(sid) as
    | { waba_id: string; phone_number_id: string; numero: string; conectado: number; access_token: string; modo: string }
    | undefined;

  res.json({
    store,
    products,
    promos,
    orders,
    leads,
    assistant: { instrucciones: assistant?.instrucciones || '', reglas: pj(assistant?.reglas || '[]', []) },
    whatsapp: {
      conectado: !!wa?.conectado,
      modo: wa?.modo || 'cloud',
      wabaId: wa?.waba_id || '',
      phoneNumberId: wa?.phone_number_id || '',
      numero: wa?.numero || '',
      tokenGuardado: !!wa?.access_token,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'dealflow-verify',
    },
  });
});

// Leads en vivo (para que el CRM refresque sin recargar toda la tienda).
api.get('/leads', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const leads = (db.prepare('SELECT * FROM leads WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[]).map((l) => ({
    id: l.id, nombre: l.nombre, tel: l.tel, etapa: l.etapa, asignado: l.asignado,
    mensajes: (db.prepare('SELECT de, texto, created_at, tipo, media_url, media_mime, media_nombre FROM messages WHERE lead_id = ? ORDER BY created_at').all(l.id as string) as Record<string, unknown>[]).map((m) => ({
      de: m.de, texto: m.texto, hora: String(m.created_at).slice(11, 16), tipo: m.tipo || 'texto', mediaUrl: m.media_url || null, mediaMime: m.media_mime || null, mediaNombre: m.media_nombre || null,
    })),
  }));
  res.json({ leads });
});

// Pedidos en vivo (para refrescar sin recargar toda la tienda).
api.get('/orders', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const orders = (db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY numero DESC').all(sid) as Record<string, unknown>[]).map((o) => ({
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
    items: db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(o.id as string),
  }));
  res.json({ orders });
});

// Sube un archivo (foto/video) y devuelve su enlace, para guardarlo liviano en el producto.
api.post('/upload', requireAuth, requireStore, (req, res) => {
  const { dataUrl, nombre } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'No recibimos el archivo.' });
  const saved = saveOutgoingMedia(req.user!.storeId!, String(dataUrl), String(nombre || ''));
  if (!saved) return res.status(400).json({ error: 'El archivo no es válido.' });
  res.json({ url: saved.url });
});

// ── Productos ─────────────────────────────────────────────────────────
api.post('/products', requireAuth, requireStore, (req, res) => {
  const { nombre, precio, stock = 0, color = '#E0E7FF', txt = '#4338CA' } = req.body || {};
  if (!nombre?.trim() || !Number(precio)) return res.status(400).json({ error: 'Falta el nombre o el precio.' });
  const id = uid();
  db.prepare('INSERT INTO products (id, store_id, nombre, precio, color, txt) VALUES (?,?,?,?,?,?)').run(id, req.user!.storeId, nombre.trim(), Number(precio), color, txt);
  db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?,?,?,0)').run(uid(), id, 'Única', Number(stock) || 0);
  res.json({ id });
});

function ownProduct(req: { user?: AuthUser }, id: string) {
  return db.prepare('SELECT id FROM products WHERE id = ? AND store_id = ?').get(id, req.user!.storeId) as { id: string } | undefined;
}

api.patch('/products/:id', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { nombre, precio, reglas, fotosSubidas, descripcion, caracteristicas, mensajeInicial, faqs, testimonios, modosUso, videos, mensajeBloques, bundles, opciones, contenidoPaquete, disparador, mensajeInicialActivo } = req.body || {};
  if (Array.isArray(bundles)) db.prepare('UPDATE products SET bundles = ? WHERE id = ?').run(j(bundles), req.params.id);
  if (Array.isArray(opciones)) db.prepare('UPDATE products SET opciones = ? WHERE id = ?').run(j(opciones), req.params.id);
  if (contenidoPaquete !== undefined) db.prepare('UPDATE products SET contenido_paquete = ? WHERE id = ?').run(String(contenidoPaquete), req.params.id);
  if (disparador !== undefined) db.prepare('UPDATE products SET disparador = ? WHERE id = ?').run(String(disparador), req.params.id);
  if (mensajeInicialActivo !== undefined) db.prepare('UPDATE products SET mensaje_inicial_activo = ? WHERE id = ?').run(mensajeInicialActivo ? 1 : 0, req.params.id);
  if (modosUso !== undefined) db.prepare('UPDATE products SET modos_uso = ? WHERE id = ?').run(String(modosUso), req.params.id);
  if (Array.isArray(testimonios)) db.prepare('UPDATE products SET testimonios = ? WHERE id = ?').run(j(testimonios), req.params.id);
  if (Array.isArray(videos)) db.prepare('UPDATE products SET videos = ? WHERE id = ?').run(j(videos), req.params.id);
  if (Array.isArray(mensajeBloques)) db.prepare('UPDATE products SET mensaje_bloques = ? WHERE id = ?').run(j(mensajeBloques), req.params.id);
  if (nombre !== undefined) db.prepare('UPDATE products SET nombre = ? WHERE id = ?').run(String(nombre), req.params.id);
  if (descripcion !== undefined) db.prepare('UPDATE products SET descripcion = ? WHERE id = ?').run(String(descripcion), req.params.id);
  if (caracteristicas !== undefined) db.prepare('UPDATE products SET caracteristicas = ? WHERE id = ?').run(String(caracteristicas), req.params.id);
  if (mensajeInicial !== undefined) db.prepare('UPDATE products SET mensaje_inicial = ? WHERE id = ?').run(String(mensajeInicial), req.params.id);
  if (Array.isArray(faqs)) db.prepare('UPDATE products SET faqs = ? WHERE id = ?').run(j(faqs), req.params.id);
  if (precio !== undefined) db.prepare('UPDATE products SET precio = ? WHERE id = ?').run(Number(precio) || 0, req.params.id);
  if (Array.isArray(reglas)) db.prepare('UPDATE products SET reglas = ? WHERE id = ?').run(j(reglas), req.params.id);
  if (Array.isArray(fotosSubidas)) db.prepare('UPDATE products SET fotos_subidas = ? WHERE id = ?').run(j(fotosSubidas), req.params.id);
  res.json({ ok: true });
});

api.delete('/products/:id', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

api.post('/products/:id/variants', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { label, stock = 0 } = req.body || {};
  if (!label?.trim()) return res.status(400).json({ error: 'Falta la talla o el color de la variante.' });
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 AS o FROM variants WHERE product_id = ?').get(req.params.id) as { o: number }).o;
  const id = uid();
  db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden) VALUES (?,?,?,?,0,?)').run(id, req.params.id, label.trim(), Number(stock) || 0, orden);
  res.json({ id });
});

api.patch('/variants/:id', requireAuth, requireStore, (req, res) => {
  const v = db.prepare('SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(req.params.id, req.user!.storeId);
  if (!v) return res.status(404).json({ error: 'Variante no encontrada.' });
  const { stock, fotosSubidas } = req.body || {};
  if (stock !== undefined) db.prepare('UPDATE variants SET stock = ? WHERE id = ?').run(Math.max(0, Number(stock) || 0), req.params.id);
  if (Array.isArray(fotosSubidas)) db.prepare('UPDATE variants SET fotos_subidas = ? WHERE id = ?').run(j(fotosSubidas), req.params.id);
  res.json({ ok: true });
});

api.delete('/variants/:id', requireAuth, requireStore, (req, res) => {
  const v = db.prepare('SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(req.params.id, req.user!.storeId);
  if (!v) return res.status(404).json({ error: 'Variante no encontrada.' });
  db.prepare('DELETE FROM variants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Promos ────────────────────────────────────────────────────────────
api.post('/promos', requireAuth, requireStore, (req, res) => {
  const { tipo = 'Promoción', titulo, desc, vigencia } = req.body || {};
  if (!titulo?.trim() || !desc?.trim()) return res.status(400).json({ error: 'Falta el título o la descripción.' });
  const id = uid();
  db.prepare('INSERT INTO promos (id, store_id, tipo, titulo, descripcion, vigencia) VALUES (?,?,?,?,?,?)').run(
    id, req.user!.storeId, tipo === 'Combo' ? 'Combo' : 'Promoción', titulo.trim(), desc.trim(), vigencia?.trim() || 'Sin fecha de vencimiento',
  );
  res.json({ id });
});

api.patch('/promos/:id', requireAuth, requireStore, (req, res) => {
  const p = db.prepare('SELECT id, activa FROM promos WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId) as { id: string; activa: number } | undefined;
  if (!p) return res.status(404).json({ error: 'Promo no encontrada.' });
  const activa = req.body?.activa;
  db.prepare('UPDATE promos SET activa = ? WHERE id = ?').run(activa === undefined ? (p.activa ? 0 : 1) : activa ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

api.delete('/promos/:id', requireAuth, requireStore, (req, res) => {
  db.prepare('DELETE FROM promos WHERE id = ? AND store_id = ?').run(req.params.id, req.user!.storeId);
  res.json({ ok: true });
});

// ── Pedidos ───────────────────────────────────────────────────────────
const MSG_ESTADO: Record<string, (n: number) => string> = {
  Confirmado: (n) => `✅ ¡Tu pedido #DF-${n} quedó confirmado! Ya lo estamos preparando para enviártelo. 📦`,
  Empacado: (n) => `📦 Tu pedido #DF-${n} ya está empacado y listo para salir. 🚀`,
  Despachado: (n) => `🚚 ¡Tu pedido #DF-${n} va en camino! Pronto lo recibes. 🙌`,
  Entregado: (n) => `🎉 Tu pedido #DF-${n} fue entregado. ¡Muchas gracias por tu compra! 💚`,
};

api.post('/orders/:rowId/advance', requireAuth, requireStore, async (req, res) => {
  const o = db.prepare('SELECT id, estado, numero, tel FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, req.user!.storeId) as
    | { id: string; estado: string; numero: number; tel: string }
    | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const idx = ESTADOS.indexOf(o.estado as (typeof ESTADOS)[number]);
  if (idx < 0 || idx >= ESTADOS.length - 1) return res.status(400).json({ error: 'Este pedido ya está entregado.' });
  const nuevo = ESTADOS[idx + 1];
  db.prepare('UPDATE orders SET estado = ? WHERE id = ?').run(nuevo, o.id);
  res.json({ estado: nuevo });

  // Avísale al cliente por WhatsApp del nuevo estado (y déjalo en el chat).
  const msg = MSG_ESTADO[nuevo]?.(o.numero);
  if (msg && o.tel) {
    const lead = db.prepare("SELECT id, wa_id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(req.user!.storeId, o.tel) as { id: string; wa_id: string | null } | undefined;
    if (lead) db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'bot', msg);
    void sendWhatsappText(req.user!.storeId!, lead?.wa_id || o.tel, msg, o.tel).catch(() => {});
  }
});

api.post('/orders/:rowId/dropi', requireAuth, requireStore, (req, res) => {
  const o = db.prepare('SELECT id, guia FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, req.user!.storeId) as { id: string; guia: string | null } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (o.guia) return res.json({ guia: o.guia });
  // Integración real con Dropi pendiente: por ahora genera la guía localmente.
  const guia = String(402000 + Math.floor(Math.random() * 900) + 100);
  db.prepare('UPDATE orders SET guia = ? WHERE id = ?').run(guia, o.id);
  res.json({ guia });
});

// ── Leads / CRM ───────────────────────────────────────────────────────
api.patch('/leads/:id', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  const { asignado, etapa } = req.body || {};
  if (asignado) db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(String(asignado), req.params.id);
  if (etapa) db.prepare('UPDATE leads SET etapa = ? WHERE id = ?').run(String(etapa), req.params.id);
  res.json({ ok: true });
});

// Elimina el chat/contacto por completo (borra en cascada sus mensajes).
api.delete('/leads/:id', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Reinicia la conversación: borra el historial, la deja en manos del asistente
// y olvida qué presentaciones ya se enviaron (para que el bot empiece de cero).
api.post('/leads/:id/reset', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  db.prepare('DELETE FROM messages WHERE lead_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sent_presentations WHERE lead_id = ?').run(req.params.id);
  db.prepare("UPDATE leads SET asignado = 'Asistente (bot)', etapa = 'Explorando' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Equipo (usuarios de la tienda que pueden entrar y responder) ──────
api.get('/team', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const store = db.prepare('SELECT correo FROM stores WHERE id = ?').get(sid) as { correo: string } | undefined;
  const users = db.prepare('SELECT id, nombre, email FROM users WHERE store_id = ? ORDER BY rowid').all(sid) as { id: string; nombre: string; email: string }[];
  res.json({ team: users.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, esDueno: u.email === store?.correo, esTu: u.id === req.user!.id })) });
});

api.post('/team', requireAuth, requireStore, (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Faltan el nombre, el correo o la contraseña.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const correo = String(email).toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(correo)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const id = uid();
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(id, correo, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', req.user!.storeId);
  res.json({ id });
});

api.delete('/team/:id', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
  const u = db.prepare('SELECT id, email FROM users WHERE id = ? AND store_id = ?').get(req.params.id, sid) as { id: string; email: string } | undefined;
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const store = db.prepare('SELECT correo FROM stores WHERE id = ?').get(sid) as { correo: string } | undefined;
  if (u.email === store?.correo) return res.status(400).json({ error: 'No puedes eliminar al dueño de la tienda.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

api.post('/leads/:id/messages', requireAuth, requireStore, async (req, res) => {
  const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId) as
    | { id: string; tel: string; wa_id: string | null }
    | undefined;
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  const texto = String(req.body?.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe el mensaje primero.' });
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), l.id, 'vendedor', texto);
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);
  const wa = await sendWhatsappText(req.user!.storeId!, l.wa_id || l.tel, texto, l.tel);
  res.json({ ok: true, enviadoPorWhatsapp: wa.ok, aviso: wa.ok ? undefined : wa.error });
});

// Enviar un adjunto (imagen, video, audio o archivo) al lead.
api.post('/leads/:id/media', requireAuth, requireStore, async (req, res) => {
  const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId) as
    | { id: string; tel: string; wa_id: string | null }
    | undefined;
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  const { dataUrl, nombre, caption } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'No recibimos el archivo.' });
  const saved = saveOutgoingMedia(req.user!.storeId!, String(dataUrl), String(nombre || ''));
  if (!saved) return res.status(400).json({ error: 'El archivo no es válido.' });
  saveOutgoingMessage(l.id, String(caption || ''), saved.tipo, saved.url, saved.mime, String(nombre || ''));
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);

  const r = await sendWhatsappMedia(req.user!.storeId!, l.wa_id || l.tel, { buffer: saved.buffer, mime: saved.mime, tipo: saved.tipo }, String(caption || ''), String(nombre || ''), l.tel);
  res.json({ ok: true, enviadoPorWhatsapp: r.ok, aviso: r.ok ? undefined : r.error });
});

// ── Asistente ─────────────────────────────────────────────────────────
api.put('/assistant', requireAuth, requireStore, (req, res) => {
  const { instrucciones, reglas } = req.body || {};
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
  ).run(req.user!.storeId, String(instrucciones || ''), j(Array.isArray(reglas) ? reglas : []));
  res.json({ ok: true });
});

// ── WhatsApp (vinculación por WABA ID + token) ───────────────────────
api.put('/whatsapp', requireAuth, requireStore, async (req, res) => {
  const { wabaId, phoneNumberId, accessToken } = req.body || {};
  if (!wabaId?.trim() || !phoneNumberId?.trim() || !accessToken?.trim()) {
    return res.status(400).json({ error: 'Faltan datos: WABA ID, Phone Number ID y Access Token.' });
  }
  const check = await verifyWhatsappCredentials(phoneNumberId.trim(), accessToken.trim());
  if (!check.ok) return res.status(400).json({ error: check.error });
  db.prepare(
    `INSERT INTO whatsapp (store_id, waba_id, phone_number_id, access_token, numero, conectado, modo) VALUES (?,?,?,?,?,1,'cloud')
     ON CONFLICT(store_id) DO UPDATE SET waba_id = excluded.waba_id, phone_number_id = excluded.phone_number_id,
       access_token = excluded.access_token, numero = excluded.numero, conectado = 1, modo = 'cloud'`,
  ).run(req.user!.storeId, wabaId.trim(), phoneNumberId.trim(), accessToken.trim(), check.numero);
  res.json({ conectado: true, numero: check.numero });
});

api.delete('/whatsapp', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const cur = db.prepare('SELECT modo FROM whatsapp WHERE store_id = ?').get(sid) as { modo: string } | undefined;
  if (cur?.modo === 'qr') {
    const { stopQrSession } = await import('./waqr.js');
    await stopQrSession(sid);
  } else {
    db.prepare("UPDATE whatsapp SET conectado = 0, access_token = '' WHERE store_id = ?").run(sid);
  }
  res.json({ conectado: false });
});

// ── WhatsApp por QR (Baileys) ─────────────────────────────────────────
api.post('/whatsapp/qr/start', requireAuth, requireStore, async (req, res) => {
  const { startQrSession } = await import('./waqr.js');
  await startQrSession(req.user!.storeId!);
  res.json({ ok: true });
});

api.get('/whatsapp/qr/status', requireAuth, requireStore, async (req, res) => {
  const { getQrStatus } = await import('./waqr.js');
  res.json(getQrStatus(req.user!.storeId!));
});

// ── Admin ─────────────────────────────────────────────────────────────
api.get('/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  const stores = (db.prepare('SELECT * FROM stores ORDER BY created_at').all() as Record<string, unknown>[]).map((s) => {
    const ventas = db.prepare(
      `SELECT COALESCE(SUM(oi.qty * oi.precio), 0) + COALESCE((SELECT SUM(envio) FROM orders WHERE store_id = ? AND created_at >= date('now','start of month')), 0) AS total
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
    ).get(s.id, s.id) as { total: number };
    return { id: s.id, tienda: s.nombre, correo: s.correo, plan: s.plan, ventas: ventas.total, activa: !!s.activa };
  });
  const plans = (db.prepare('SELECT * FROM plans').all() as Record<string, unknown>[]).map((p) => ({
    id: p.id, nombre: p.nombre, precio: p.precio, features: pj(p.features as string, []),
    cuentas: (db.prepare('SELECT COUNT(*) AS n FROM stores WHERE plan = ?').get(p.nombre) as { n: number }).n,
  }));
  res.json({ stores, plans });
});

api.post('/admin/plans', requireAuth, requireAdmin, (req, res) => {
  const { nombre, precio, features } = req.body || {};
  if (!nombre?.trim() || !Number(precio)) return res.status(400).json({ error: 'Falta el nombre o el precio.' });
  const id = uid();
  db.prepare('INSERT INTO plans (id, nombre, precio, features) VALUES (?,?,?,?)').run(id, nombre.trim(), Number(precio), j(Array.isArray(features) ? features : []));
  res.json({ id });
});

api.patch('/admin/stores/:id', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id, activa FROM stores WHERE id = ?').get(req.params.id) as { id: string; activa: number } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const activa = req.body?.activa;
  db.prepare('UPDATE stores SET activa = ? WHERE id = ?').run(activa === undefined ? (s.activa ? 0 : 1) : activa ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

api.post('/admin/stores', requireAuth, requireAdmin, (req, res) => {
  const { nombre, correo, plan = 'Inicio', password } = req.body || {};
  if (!nombre?.trim() || !correo?.trim() || !password) return res.status(400).json({ error: 'Faltan el nombre de la tienda, el correo o la contraseña.' });
  const email = String(correo).toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const storeId = uid();
  db.prepare('INSERT INTO stores (id, nombre, correo, plan) VALUES (?,?,?,?)').run(storeId, nombre.trim(), email, String(plan));
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(uid(), email, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', storeId);
  db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId);
  db.prepare('INSERT INTO assistants (store_id) VALUES (?)').run(storeId);
  res.json({ storeId });
});

// ── Archivos de conversaciones (imágenes, videos, etc.) ──────────────
// Servidos bajo /api/media para que la sesión (cookie) los proteja: cada
// tienda solo ve los suyos.
api.get('/media/:storeId/:file', requireAuth, requireStore, (req, res) => {
  if (req.params.storeId !== req.user!.storeId) return res.status(403).end();
  const file = mediaPath(req.params.storeId, req.params.file);
  if (!existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// ── Webhook de Meta (una sola URL para todas las tiendas) ────────────
webhooks.get('/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'dealflow-verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

webhooks.post('/whatsapp', (req, res) => {
  // Meta exige responder rápido: procesamos y contestamos 200 siempre.
  try {
    handleIncomingWebhook(req.body);
  } catch (e) {
    console.error('[webhook] error procesando entrada', e);
  }
  res.sendStatus(200);
});
