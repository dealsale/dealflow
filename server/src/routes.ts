import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, j, pj, uid, registrarLog } from './db.js';
import { esImportBloqueado, productosBloqueados, MASTER_STORE_ID, asegurarMasterStore, duenoMasterStore, sincronizarSnapshotMaster, eliminarLibraryDeMaster } from './biblioteca.js';
import { clearAuthCookie, esDuenoDeTienda, hashPassword, requireAdmin, requireAuth, requireOwner, requireStore, requireSuperAdmin, setAuthCookie, verifyPassword } from './auth.js';
import type { AuthUser } from './auth.js';
import { handleIncomingWebhook, marcarEnviado, sendWhatsappMedia, sendWhatsappText, verifyWhatsappCredentials } from './wa.js';
import { mediaPath, saveOutgoingMedia, saveOutgoingMessage, tipoDeMime } from './media.js';
import { existsSync, readFileSync } from 'node:fs';

export const api = Router();
export const webhooks = Router();

const ESTADOS = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado'] as const;

/** Hora local de Bogotá (GMT-5) a partir del datetime UTC que guarda SQLite. */
function horaBogota(dt: unknown): string {
  const d = new Date(String(dt || '').replace(' ', 'T') + 'Z');
  return isNaN(+d)
    ? String(dt || '').slice(11, 16)
    : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' });
}

// ── Auth ──────────────────────────────────────────────────────────────
api.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  const row = db.prepare('SELECT id, email, password_hash, nombre, role, store_id, foto FROM users WHERE email = ?').get(String(email).toLowerCase().trim()) as
    | { id: string; email: string; password_hash: string; nombre: string; role: 'VENDEDOR' | 'ADMIN'; store_id: string | null; foto: string }
    | undefined;
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  if (row.role === 'VENDEDOR' && row.store_id) {
    const store = db.prepare('SELECT activa FROM stores WHERE id = ?').get(row.store_id) as { activa: number } | undefined;
    if (!store?.activa) return res.status(403).json({ error: 'Tu cuenta está desactivada. Escríbenos para reactivarla.' });
  }
  const user: AuthUser = { id: row.id, email: row.email, nombre: row.nombre, role: row.role, storeId: row.store_id, foto: row.foto || undefined };
  setAuthCookie(res, user);
  res.json({ user: { ...user, esDueno: esDuenoDeTienda(user) } });
});

// Auto-registro público: cualquiera crea su cuenta. Queda SIN plan (bloqueada)
// hasta que compre el valor inicial de un plan.
api.post('/auth/registro', (req, res) => {
  const { nombre, negocio, correo, password } = req.body || {};
  if (!nombre?.trim() || !correo?.trim() || !password) {
    return res.status(400).json({ error: 'Escribe tu nombre, tu correo y una contraseña.' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const email = String(correo).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

  const storeId = uid();
  const nombreTienda = (negocio?.trim() || nombre.trim());
  const userId = uid();
  // Nace sin plan: plan_estado 'sin_plan', inicial_pagado 0. Activa=1 para poder entrar y ver el muro de pago.
  db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, inicial_pagado, activa, owner_user_id) VALUES (?,?,?,?, 'sin_plan', 0, 1, ?)")
    .run(storeId, nombreTienda, email, '', userId);
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)')
    .run(userId, email, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', storeId);
  db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId);
  db.prepare('INSERT INTO assistants (store_id) VALUES (?)').run(storeId);
  // Créditos de bienvenida para probar el Marketing IA.
  void import('./creditos.js').then(({ abonar, CREDITOS_BIENVENIDA }) => abonar(storeId, CREDITOS_BIENVENIDA, 'Créditos de bienvenida'));

  const user: AuthUser = { id: userId, email, nombre: nombre.trim(), role: 'VENDEDOR', storeId };
  setAuthCookie(res, user);
  res.json({ user: { ...user, esDueno: true } });
});

api.post('/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  const impersonando = !!req.user!.imp;
  const tiendaNombre = impersonando && req.user!.storeId
    ? (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(req.user!.storeId) as { nombre: string } | undefined)?.nombre || ''
    : '';
  res.json({ user: { ...req.user, esDueno: esDuenoDeTienda(req.user), impersonando, tiendaNombre } });
});

// ── Perfil de la cuenta (cualquier rol: vendedor, admin o superadmin) ──
// Cambia el nombre visible. Reemite la cookie para que el cambio se vea de inmediato.
api.patch('/me', requireAuth, (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre.' });
  if (nombre.length > 60) return res.status(400).json({ error: 'El nombre es muy largo.' });
  db.prepare('UPDATE users SET nombre = ? WHERE id = ?').run(nombre, req.user!.id);
  const user: AuthUser = { ...req.user!, nombre };
  setAuthCookie(res, user);
  res.json({ user: { ...user, esDueno: esDuenoDeTienda(user) } });
});

// Foto de perfil: se guarda en un espacio propio de "cuentas" (no depende de la
// tienda), así sirve igual para VENDEDOR, ADMIN o SUPERADMIN.
api.post('/me/foto', requireAuth, (req, res) => {
  const { dataUrl } = req.body || {};
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Sube una imagen válida.' });
  const saved = saveOutgoingMedia('__cuentas__', dataUrl, 'avatar');
  if (!saved) return res.status(400).json({ error: 'No pudimos guardar la foto.' });
  const url = saved.url.replace('/api/media/__cuentas__/', '/api/me/media/');
  db.prepare('UPDATE users SET foto = ? WHERE id = ?').run(url, req.user!.id);
  const user: AuthUser = { ...req.user!, foto: url };
  setAuthCookie(res, user);
  res.json({ ok: true, foto: url, user: { ...user, esDueno: esDuenoDeTienda(user) } });
});

// Sirve las fotos de perfil (cualquier usuario autenticado puede verlas, como en
// cualquier avatar de equipo; no es información sensible).
api.get('/me/media/:file', requireAuth, (req, res) => {
  const file = mediaPath('__cuentas__', req.params.file);
  if (!existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// Cambiar la contraseña. Solo para cuentas de tienda (VENDEDOR): la de
// ADMIN/SUPERADMIN se sincroniza siempre desde ADMIN_PASSWORD/SUPERADMIN_PASSWORD
// en cada arranque, así que cambiarla aquí se perdería en el próximo despliegue.
api.post('/me/password', requireAuth, (req, res) => {
  if (req.user!.role !== 'VENDEDOR') {
    return res.status(400).json({ error: 'Esta cuenta usa una contraseña fija por variable de entorno (ADMIN_PASSWORD/SUPERADMIN_PASSWORD). Pide al equipo técnico cambiarla ahí.' });
  }
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) return res.status(400).json({ error: 'Escribe tu contraseña actual y la nueva.' });
  if (String(nueva).length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(String(actual), row.password_hash)) return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(nueva)), req.user!.id);
  res.json({ ok: true });
});

// El admin vuelve a su panel después de "entrar" a una tienda (impersonar).
api.post('/auth/stop-impersonate', requireAuth, (req, res) => {
  const adminId = req.user!.imp;
  if (!adminId) return res.status(400).json({ error: 'No estás dentro de ninguna tienda.' });
  // Puede volver tanto un ADMIN como un SUPERADMIN (antes solo ADMIN: el superadmin quedaba atrapado).
  const row = db.prepare("SELECT id, email, nombre, role, store_id, foto FROM users WHERE id = ? AND role IN ('ADMIN','SUPERADMIN')").get(adminId) as
    | { id: string; email: string; nombre: string; role: 'VENDEDOR' | 'ADMIN' | 'SUPERADMIN'; store_id: string | null; foto: string }
    | undefined;
  if (!row) return res.status(403).json({ error: 'No pudimos volver a tu sesión de administrador.' });
  setAuthCookie(res, { id: row.id, email: row.email, nombre: row.nombre, role: row.role, storeId: row.store_id, foto: row.foto || undefined });
  res.json({ ok: true });
});

// ── Multi-tienda por cuenta (un dueño puede tener varias tiendas) ─────
api.get('/mis-tiendas', requireAuth, requireStore, async (req, res) => {
  if (!esDuenoDeTienda(req.user)) return res.json({ tiendas: [] });
  const { estadoSuscripcion } = await import('./suscripcion.js');
  const stores = db.prepare('SELECT id, nombre FROM stores WHERE owner_user_id = ? OR (owner_user_id = \'\' AND correo = ?) ORDER BY created_at').all(req.user!.id, req.user!.email) as { id: string; nombre: string }[];
  const tiendas = stores.map((s) => {
    const sus = estadoSuscripcion(s.id);
    return { id: s.id, nombre: s.nombre, activa: s.id === req.user!.storeId, estado: sus?.estado || 'activa', bloqueada: !!sus?.bloqueado };
  });
  res.json({ tiendas });
});

api.post('/cambiar-tienda/:id', requireAuth, requireStore, (req, res) => {
  if (!esDuenoDeTienda(req.user)) return res.status(403).json({ error: 'Solo el dueño puede cambiar de tienda.' });
  const s = db.prepare('SELECT id, correo, owner_user_id FROM stores WHERE id = ?').get(req.params.id) as { id: string; correo: string; owner_user_id: string } | undefined;
  const esMia = !!s && (s.owner_user_id === req.user!.id || s.correo === req.user!.email);
  if (!esMia) return res.status(404).json({ error: 'Esa tienda no es tuya.' });
  db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run(s.id, req.user!.id);
  setAuthCookie(res, { ...req.user!, storeId: s.id });
  res.json({ ok: true });
});

api.post('/crear-tienda', requireAuth, requireStore, (req, res) => {
  if (!esDuenoDeTienda(req.user)) return res.status(403).json({ error: 'Solo el dueño puede crear tiendas.' });
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre a la nueva tienda.' });
  const storeId = uid();
  // Tienda extra: sin instalación, plana 250k/mes. Nace pendiente de la primera renta (estado vencida).
  db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, plan_vence, inicial_pagado, activa, owner_user_id) VALUES (?,?,?, 'Básico', 'vencida', date('now','-40 day'), 1, 1, ?)")
    .run(storeId, nombre, req.user!.email, req.user!.id);
  db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId);
  db.prepare('INSERT INTO assistants (store_id) VALUES (?)').run(storeId);
  void import('./creditos.js').then(({ abonar, CREDITOS_BIENVENIDA }) => abonar(storeId, CREDITOS_BIENVENIDA, 'Créditos de bienvenida'));
  // Deja al dueño parado en la tienda nueva.
  db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run(storeId, req.user!.id);
  setAuthCookie(res, { ...req.user!, storeId });
  res.json({ ok: true, storeId });
});

// ── Estado completo de la tienda (una llamada para pintar el panel) ───
api.get('/state', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const storeRow = db.prepare('SELECT id, nombre, plan, tema_premium FROM stores WHERE id = ?').get(sid) as { id: string; nombre: string; plan: string; tema_premium: number };
  const store = { id: storeRow.id, nombre: storeRow.nombre, plan: storeRow.plan, temaPremium: !!storeRow.tema_premium };
  const bloqueados = productosBloqueados(sid); // productos de biblioteca gratuitos (estructura no editable)
  const products = (db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[]).map((p) => ({
    id: p.id, nombre: p.nombre, precio: p.precio, color: p.color, txt: p.txt, bloqueado: bloqueados.has(String(p.id)),
    tipo: p.tipo || 'producto', duracion: p.duracion || '', sku: p.sku || '', plantillaId: p.plantilla_id || '',
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
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, departamento: o.departamento || '', tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, wooId: o.woo_id || '', despachoProveedor: o.despacho_proveedor || '', estadoWoo: o.estado_woo || '', envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
    items: (db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(o.id as string)),
  }));
  // Resumen (sin todos los mensajes de cada chat): la carga inicial del panel no
  // debe descargar la conversación completa de cientos de chats. Cada chat carga
  // sus mensajes al abrirlo (GET /leads/:id/mensajes).
  const leads = listarLeads(sid, true);
  const assistant = db.prepare('SELECT instrucciones, reglas, nombre, seguimiento_off, estilo FROM assistants WHERE store_id = ?').get(sid) as { instrucciones: string; reglas: string; nombre: string; seguimiento_off: number; estilo: string } | undefined;
  const wa = db.prepare('SELECT waba_id, phone_number_id, numero, conectado, access_token, modo, pin FROM whatsapp WHERE store_id = ?').get(sid) as
    | { waba_id: string; phone_number_id: string; numero: string; conectado: number; access_token: string; modo: string; pin: string }
    | undefined;

  const { estadoSuscripcion } = await import('./suscripcion.js');
  res.json({
    store,
    products,
    promos,
    orders,
    leads,
    suscripcion: estadoSuscripcion(sid),
    assistant: { instrucciones: assistant?.instrucciones || '', reglas: pj(assistant?.reglas || '[]', []), nombre: assistant?.nombre || '', seguimientoActivo: !assistant?.seguimiento_off, estilo: pj(assistant?.estilo || '', {}) },
    whatsapp: {
      conectado: !!wa?.conectado,
      modo: wa?.modo || 'cloud',
      wabaId: wa?.waba_id || '',
      phoneNumberId: wa?.phone_number_id || '',
      numero: wa?.numero || '',
      tokenGuardado: !!wa?.access_token,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'dealflow-verify',
      // Datos públicos del popup de Facebook (no son secretos; el secret nunca sale del servidor).
      signup: (await import('./metaSignup.js')).metaSignupConfig(),
      // Conectado por el flujo automático: el webhook ya quedó puesto, la tienda no configura nada.
      signupAuto: !!wa?.pin,
    },
  });
});

// Mensajes completos de un lead (para el conversación).
const mapMensaje = (m: Record<string, unknown>) => ({
  id: m.id, de: m.de, texto: m.texto, hora: horaBogota(m.created_at), createdAt: m.created_at,
  tipo: m.tipo || 'texto', mediaUrl: m.media_url || null, mediaMime: m.media_mime || null, mediaNombre: m.media_nombre || null, estado: m.estado || '',
});
const mensajesDe = (leadId: string) =>
  (db.prepare('SELECT id, de, texto, created_at, tipo, media_url, media_mime, media_nombre, estado FROM messages WHERE lead_id = ? ORDER BY created_at').all(leadId) as Record<string, unknown>[]).map(mapMensaje);

/**
 * Lista de leads para el Inbox. En modo `resumen` NO trae todos los mensajes de
 * cada chat (eso pesa MB y volvía lento el Inbox al recargarse cada pocos
 * segundos): solo el último mensaje + cuántos van sin responder. Solo el chat
 * ABIERTO trae su conversación completa, para que se actualice en vivo.
 */
function listarLeads(sid: string, resumen: boolean, abierto?: string) {
  const rows = db.prepare('SELECT * FROM leads WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[];
  return rows.map((l) => {
    const base = {
      id: l.id, nombre: l.nombre, tel: l.tel, etapa: l.etapa, asignado: l.asignado,
      etiqueta: l.etiqueta || '', canal: l.canal || 'whatsapp', notaInterna: l.nota_interna || '',
    };
    if (!resumen) return { ...base, mensajes: mensajesDe(l.id as string) };
    const ult = db.prepare('SELECT texto, created_at FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(l.id as string) as Record<string, unknown> | undefined;
    const cola = db.prepare('SELECT de FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 40').all(l.id as string) as Record<string, unknown>[];
    let sinResponder = 0;
    for (const m of cola) { if (m.de === 'cliente') sinResponder++; else break; }
    const esAbierto = !!abierto && String(l.id) === String(abierto);
    return {
      ...base,
      mensajes: esAbierto ? mensajesDe(l.id as string) : [],
      ultimo: ult ? ult.texto : '', ultimoIso: ult ? ult.created_at : null,
      hora: ult ? horaBogota(ult.created_at) : '', sinResponder,
    };
  });
}

// Leads en vivo (para que el CRM refresque sin recargar toda la tienda).
// ?resumen=1 → liviano (sin todos los mensajes); &abierto=<id> → ese chat sí completo.
api.get('/leads', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const resumen = req.query.resumen === '1';
  const abierto = typeof req.query.abierto === 'string' ? req.query.abierto : undefined;
  res.json({ leads: listarLeads(sid, resumen, abierto) });
});

// Conversación completa de UN chat (al abrirlo, para no depender del sondeo).
api.get('/leads/:id/mensajes', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json({ mensajes: mensajesDe(req.params.id) });
});

// Pedidos en vivo (para refrescar sin recargar toda la tienda).
api.get('/orders', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const orders = (db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY numero DESC').all(sid) as Record<string, unknown>[]).map((o) => ({
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, departamento: o.departamento || '', tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, wooId: o.woo_id || '', despachoProveedor: o.despacho_proveedor || '', estadoWoo: o.estado_woo || '', envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
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
  const { nombre, precio, stock = 0, color = '#E0E7FF', txt = '#4338CA', tipo = 'producto', duracion = '' } = req.body || {};
  // Un servicio puede ser gratis ($0); un producto exige precio.
  const esServicio = tipo === 'servicio';
  if (!nombre?.trim() || (!esServicio && !Number(precio))) return res.status(400).json({ error: 'Falta el nombre o el precio.' });
  const id = uid();
  db.prepare('INSERT INTO products (id, store_id, nombre, precio, color, txt, tipo, duracion) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.user!.storeId, nombre.trim(), Number(precio) || 0, color, txt, esServicio ? 'servicio' : 'producto', esServicio ? String(duracion || '') : '');
  db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?,?,?,0)').run(uid(), id, 'Única', esServicio ? 0 : Number(stock) || 0);
  if (req.user!.storeId === MASTER_STORE_ID) sincronizarSnapshotMaster(id); // producto de biblioteca
  res.json({ id });
});

function ownProduct(req: { user?: AuthUser }, id: string) {
  return db.prepare('SELECT id FROM products WHERE id = ? AND store_id = ?').get(id, req.user!.storeId) as { id: string } | undefined;
}

api.patch('/products/:id', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  // Producto de biblioteca gratuito: la ESTRUCTURA está bloqueada (para que el
  // cliente no la dañe). Solo dejamos cambiar el precio y el SKU de su tienda.
  if (esImportBloqueado(req.params.id)) {
    if (req.body?.precio !== undefined) db.prepare('UPDATE products SET precio = ? WHERE id = ?').run(Number(req.body.precio) || 0, req.params.id);
    if (req.body?.sku !== undefined) db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(String(req.body.sku).trim(), req.params.id);
    return res.json({ ok: true, bloqueado: true });
  }
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
  if (req.body?.tipo !== undefined) db.prepare('UPDATE products SET tipo = ? WHERE id = ?').run(req.body.tipo === 'servicio' ? 'servicio' : 'producto', req.params.id);
  if (req.body?.duracion !== undefined) db.prepare('UPDATE products SET duracion = ? WHERE id = ?').run(String(req.body.duracion), req.params.id);
  if (req.body?.sku !== undefined) db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(String(req.body.sku).trim(), req.params.id);
  if (Array.isArray(faqs)) db.prepare('UPDATE products SET faqs = ? WHERE id = ?').run(j(faqs), req.params.id);
  if (precio !== undefined) db.prepare('UPDATE products SET precio = ? WHERE id = ?').run(Number(precio) || 0, req.params.id);
  if (Array.isArray(reglas)) db.prepare('UPDATE products SET reglas = ? WHERE id = ?').run(j(reglas), req.params.id);
  if (Array.isArray(fotosSubidas)) db.prepare('UPDATE products SET fotos_subidas = ? WHERE id = ?').run(j(fotosSubidas), req.params.id);
  if (req.user!.storeId === MASTER_STORE_ID) sincronizarSnapshotMaster(req.params.id); // producto de biblioteca
  res.json({ ok: true });
});

api.delete('/products/:id', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (req.user!.storeId === MASTER_STORE_ID) eliminarLibraryDeMaster(req.params.id); // quita su entrada de biblioteca
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
  if (req.user!.storeId === MASTER_STORE_ID) sincronizarSnapshotMaster(req.params.id);
  res.json({ id });
});

api.patch('/variants/:id', requireAuth, requireStore, (req, res) => {
  const v = db.prepare('SELECT v.id, v.product_id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(req.params.id, req.user!.storeId) as { id: string; product_id: string } | undefined;
  if (!v) return res.status(404).json({ error: 'Variante no encontrada.' });
  const { stock, fotosSubidas } = req.body || {};
  if (stock !== undefined) db.prepare('UPDATE variants SET stock = ? WHERE id = ?').run(Math.max(0, Number(stock) || 0), req.params.id);
  if (Array.isArray(fotosSubidas)) db.prepare('UPDATE variants SET fotos_subidas = ? WHERE id = ?').run(j(fotosSubidas), req.params.id);
  if (req.user!.storeId === MASTER_STORE_ID) sincronizarSnapshotMaster(v.product_id);
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
  Cancelado: (n) => `❌ Tu pedido #DF-${n} fue cancelado. Si fue un error o quieres retomarlo, escríbenos y con gusto te ayudamos. 🙏`,
};

// Todos los estados posibles (incluye Cancelado). El dueño puede cambiar de
// cualquiera a cualquiera; no es un flujo forzado sin retroceso.
const ESTADOS_VALIDOS = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado', 'Cancelado'] as const;

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

// Cambia el estado del pedido a CUALQUIER estado (seleccionable, se puede
// retroceder e incluye Cancelado). Avisa al cliente si el estado tiene mensaje.
api.post('/orders/:rowId/estado', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const nuevo = String(req.body?.estado || '').trim();
  if (!ESTADOS_VALIDOS.includes(nuevo as (typeof ESTADOS_VALIDOS)[number])) return res.status(400).json({ error: 'Estado no válido.' });
  const o = db.prepare('SELECT id, estado, numero, tel FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as
    | { id: string; estado: string; numero: number; tel: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (o.estado === nuevo) return res.json({ estado: nuevo });
  db.prepare('UPDATE orders SET estado = ? WHERE id = ?').run(nuevo, o.id);
  res.json({ estado: nuevo });
  // Solo notificamos cuando el estado tiene un mensaje pensado para el cliente.
  const msg = MSG_ESTADO[nuevo]?.(o.numero);
  if (msg && o.tel) {
    const lead = db.prepare("SELECT id, wa_id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(sid, o.tel) as { id: string; wa_id: string | null } | undefined;
    if (lead) db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'bot', msg);
    void sendWhatsappText(sid, lead?.wa_id || o.tel, msg, o.tel).catch(() => {});
  }
});

// Crea un pedido MANUALMENTE (logística manual): el dueño mete los datos del
// cliente y elige productos/variantes. No se autoenvía a WooCommerce; se despacha
// a mano desde el detalle. Queda en estado "Nuevo".
api.post('/orders', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const b = req.body || {};
  const cliente = String(b.cliente || '').trim();
  type ItemIn = { qty: number; nombre: string; precio: number };
  const crudos: { qty?: unknown; nombre?: unknown; precio?: unknown }[] = Array.isArray(b.items) ? b.items : [];
  const limpios: ItemIn[] = crudos
    .map((it): ItemIn => ({
      qty: Math.max(1, parseInt(String(it.qty), 10) || 1),
      nombre: String(it.nombre || '').trim(),
      precio: Math.max(0, Math.round(Number(it.precio) || 0)),
    }))
    .filter((it) => it.nombre);
  if (!cliente) return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  if (!limpios.length) return res.status(400).json({ error: 'Agrega al menos un producto al pedido.' });
  const envio = Math.max(0, Math.round(Number(b.envio) || 0));
  const totalItems = limpios.reduce((a, it) => a + it.qty * it.precio, 0);
  const total = b.total != null && Number(b.total) > 0 ? Math.round(Number(b.total)) : totalItems + envio;
  const numero = ((db.prepare('SELECT MAX(numero) n FROM orders WHERE store_id = ?').get(sid) as { n: number | null }).n || 1048) + 1;
  const oid = uid();
  db.prepare('INSERT INTO orders (id, store_id, numero, cliente, ciudad, tel, direccion, estado, total, departamento, envio, nota) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(oid, sid, numero, cliente, String(b.ciudad || ''), String(b.tel || ''), String(b.direccion || ''), 'Nuevo', total, String(b.departamento || ''), envio, String(b.nota || ''));
  for (const it of limpios) db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio) VALUES (?,?,?,?,?)').run(uid(), oid, it.qty, it.nombre, it.precio);
  registrarLog(sid, 'info', 'pedido', `Pedido manual DF-${numero} creado para ${cliente} (${limpios.map((i) => i.qty + 'x ' + i.nombre).join(', ')}).`);
  {
    const nprod = limpios.reduce((a, i) => a + i.qty, 0);
    void import('./push.js').then((p) => p.enviarPush(sid, 'pedidos', `Nuevo pedido DF-${numero} 🛒`, `${cliente} · $${total.toLocaleString('es-CO')} · ${nprod} producto${nprod === 1 ? '' : 's'}`, { url: '/' })).catch(() => {});
  }
  res.json({ ok: true, id: 'DF-' + numero, rowId: oid });
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

// ── Effi (vía WooCommerce): crea el pedido en Woo para que Effi lo despache ──
// Normaliza el proveedor recibido del cliente.
function wooProv(v: unknown): 'dropi' | 'effi' | undefined {
  return v === 'dropi' ? 'dropi' : v === 'effi' ? 'effi' : undefined;
}

// Despacha un pedido a WooCommerce por el proveedor elegido (Dropi o Effi).
api.post('/orders/:rowId/despachar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sid = req.user!.storeId!;
  const prov = wooProv(req.body?.proveedor);
  if (!prov) return res.status(400).json({ error: 'Elige el proveedor (Dropi o Effi).' });
  // reintentar = volver a enviarlo aunque ya tenga woo_id (algo salió mal en el
  // proveedor y el dueño quiere reenviarlo). Crea un pedido NUEVO en WooCommerce.
  const reintentar = req.body?.reintentar === true;
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as Record<string, unknown> | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (o.woo_id && !reintentar) return res.json({ ok: true, guia: o.guia || '', wooId: o.woo_id, proveedor: o.despacho_proveedor || prov, aviso: 'Este pedido ya fue despachado.' });
  const items = db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(o.id) as { qty: number; nombre: string; precio: number }[];
  const skus: Record<string, string> = {};
  for (const p of db.prepare("SELECT nombre, sku FROM products WHERE store_id = ? AND sku != ''").all(sid) as { nombre: string; sku: string }[]) skus[p.nombre] = p.sku;
  const { crearPedido } = await import('./woocommerce.js');
  const r = await crearPedido(sid, {
    cliente: String(o.cliente || ''), ciudad: String(o.ciudad || ''), departamento: String(o.departamento || ''),
    tel: String(o.tel || ''), direccion: String(o.direccion || ''), nota: String(o.nota || ''), envio: Number(o.envio || 0),
    total: Number(o.total || 0),
  }, items, skus, prov);
  if ('error' in r) return res.status(400).json({ error: r.error });
  const nombreProv = prov === 'dropi' ? 'Dropi' : 'Effi';
  // Al reenviar reseteamos la guía vieja (el pedido nuevo trae la suya cuando el proveedor la genere).
  db.prepare('UPDATE orders SET woo_id = ?, despacho_proveedor = ?, transportadora = ?, guia = ? WHERE id = ?').run(r.wooId, prov, nombreProv, reintentar ? '' : String(o.guia || ''), o.id);
  const numDF = `DF-${String(o.numero || '')}`;
  if (r.sinMapear.length) {
    // Diagnóstico clave: si un ítem no casó por SKU, quedó como "cargo" y el proveedor NO lo despachará.
    registrarLog(sid, 'warn', 'despacho',
      `${numDF} llegó a WooCommerce, pero ${r.sinMapear.length} producto(s) NO coinciden por SKU con un producto de ${nombreProv} y NO se van a despachar: ${r.sinMapear.join(', ')}. Ponles el MISMO SKU del producto de ${nombreProv} en la sección Productos.`);
  } else {
    registrarLog(sid, 'info', 'despacho', `${numDF} enviado a ${nombreProv} (WooCommerce #${r.numero}) con ${r.mapeados} producto(s) mapeado(s) por SKU.`);
  }
  res.json({ ok: true, wooId: r.wooId, numeroWoo: r.numero, proveedor: prov, reenviado: reintentar, sinMapear: r.sinMapear, mapeados: r.mapeados });
});

// Sincroniza estado y guía del pedido desde el WooCommerce del proveedor usado.
// Reutiliza la misma lógica del sync automático (actualiza estado, guía y avisa al cliente).
api.post('/orders/:rowId/despachar/sync', requireAuth, requireStore, async (req, res) => {
  const { sincronizarPedido } = await import('./syncWoo.js');
  const r = await sincronizarPedido(req.user!.storeId!, req.params.rowId);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ estado: r.estado, guia: r.guia });
});

// Qué proveedores WooCommerce tiene conectados la tienda (para mostrar los botones)
// y cuál es el preferido para auto-despacho (sin botón).
api.get('/woo/proveedores', requireAuth, requireStore, async (req, res) => {
  const { proveedoresConectados, proveedorPreferido } = await import('./woocommerce.js');
  const sid = req.user!.storeId!;
  res.json({ proveedores: proveedoresConectados(sid), preferido: proveedorPreferido(sid) || '' });
});

// Define el proveedor por el que se despacha AUTOMÁTICAMENTE (sin botón). '' = preguntar por pedido.
api.post('/woo/preferido', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const prov = wooProv(req.body?.proveedor) || '';
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'despacho_pref', ?, datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(sid, JSON.stringify({ proveedor: prov }));
  res.json({ ok: true, preferido: prov });
});

// WooCommerce por proveedor: verificar conexión, inventario y productos.
api.post('/woo/verificar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { verificar } = await import('./woocommerce.js');
  const r = await verificar(req.user!.storeId!, wooProv(req.body?.proveedor));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

api.post('/woo/inventario/sync', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { sincronizarInventario } = await import('./woocommerce.js');
  const r = await sincronizarInventario(req.user!.storeId!, wooProv(req.body?.proveedor));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ actualizados: r.actualizados });
});

api.post('/woo/productos/sync', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { empujarProductos } = await import('./woocommerce.js');
  const r = await empujarProductos(req.user!.storeId!, wooProv(req.body?.proveedor));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});

// Busca productos en el WooCommerce conectado (por código/SKU o nombre) para
// vincular el SKU desde la ficha del producto. Solo lectura → basta requireStore.
api.get('/woo/productos/buscar', requireAuth, requireStore, async (req, res) => {
  const { buscarProductos } = await import('./woocommerce.js');
  const r = await buscarProductos(req.user!.storeId!, String(req.query.q || ''), wooProv(req.query.proveedor));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});

// ── Leads / CRM ───────────────────────────────────────────────────────
api.patch('/leads/:id', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  const { asignado, etapa, etiqueta, notaInterna } = req.body || {};
  if (asignado) db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(String(asignado), req.params.id);
  if (etapa) db.prepare('UPDATE leads SET etapa = ? WHERE id = ?').run(String(etapa), req.params.id);
  if (etiqueta !== undefined) db.prepare('UPDATE leads SET etiqueta = ? WHERE id = ?').run(String(etiqueta), req.params.id);
  if (notaInterna !== undefined) db.prepare('UPDATE leads SET nota_interna = ? WHERE id = ?').run(String(notaInterna).slice(0, 2000), req.params.id);
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

// ── DealShop · plantillas de tienda ──────────────────────────────────
api.get('/plantillas', requireAuth, requireStore, async (req, res) => {
  const { listarPlantillas } = await import('./plantillas.js');
  res.json({ plantillas: listarPlantillas(req.user!.storeId!) });
});

api.post('/plantillas/:id/instalar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { instalarPlantilla } = await import('./plantillas.js');
  const force = !!(req.body && (req.body as { force?: boolean }).force);
  const r = instalarPlantilla(req.user!.storeId!, req.params.id, force);
  if (r.error) return res.status(r.yaInstalada ? 409 : 400).json({ error: r.error });
  res.json({ ok: true });
});

api.post('/plantillas/:id/desinstalar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { desinstalarPlantilla } = await import('./plantillas.js');
  const borrarDatos = !!(req.body && (req.body as { borrarDatos?: boolean }).borrarDatos);
  const r = desinstalarPlantilla(req.user!.storeId!, req.params.id, borrarDatos);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, borrados: r.borrados });
});

// ── Campañas con IA (producto → creativos → textos → publicar) ───────
api.get('/campanas', requireAuth, requireStore, async (req, res) => {
  const { listar } = await import('./campanas.js');
  const { estadoCuenta } = await import('./metaAds.js');
  res.json({ campanas: listar(req.user!.storeId!), ads: estadoCuenta(req.user!.storeId!) });
});

api.get('/campanas/:id', requireAuth, requireStore, async (req, res) => {
  const { obtener } = await import('./campanas.js');
  const c = obtener(req.user!.storeId!, req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada.' });
  res.json({ campana: c });
});

api.post('/campanas', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { crear } = await import('./campanas.js');
  res.json({ id: crear(req.user!.storeId!, String(req.body?.nombre || ''), String(req.body?.objetivo || 'mensajes')) });
});

api.put('/campanas/:id', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { renombrar, guardarPartes } = await import('./campanas.js');
  const sid = req.user!.storeId!;
  if (req.body?.nombre !== undefined) renombrar(sid, req.params.id, String(req.body.nombre));
  const { brief, creativos, copys } = req.body || {};
  if (brief || creativos || copys) {
    if (!guardarPartes(sid, req.params.id, { brief, creativos, copys })) return res.status(404).json({ error: 'Campaña no encontrada.' });
  }
  res.json({ ok: true });
});

api.delete('/campanas/:id', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { borrar } = await import('./campanas.js');
  borrar(req.user!.storeId!, req.params.id);
  res.json({ ok: true });
});

// Paso 1: la IA estudia el producto y arma el brief.
api.post('/campanas/:id/producto', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const { COSTO, saldo, cobrar } = await import('./creditos.js');
  if (saldo(sid) < COSTO.texto) return res.status(402).json({ error: `Necesitas ${COSTO.texto} créditos. Recarga para continuar.`, sinCreditos: true });
  const { analizarProducto } = await import('./campanas.js');
  const { idea, precio, imagen, publico } = req.body || {};
  const r = await analizarProducto(sid, req.params.id, {
    idea: String(idea || ''), precio: String(precio || ''), publico: String(publico || ''),
    imagen: typeof imagen === 'string' ? imagen : undefined,
  });
  if (r.error) return res.status(400).json({ error: r.error });
  cobrar(sid, COSTO.texto, 'Estudio del producto'); // solo si salió bien
  res.json({ brief: r.brief, creditos: saldo(sid) });
});

// Paso 2: creativos (imágenes) a partir del brief.
api.post('/campanas/:id/creativos', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const n = Math.min(4, Math.max(1, Number(req.body?.cantidad) || 1));
  const { COSTO, saldo, cobrar } = await import('./creditos.js');
  const costo = COSTO.imagen * n;
  if (saldo(sid) < costo) return res.status(402).json({ error: `Necesitas ${costo} créditos para ${n} creativo${n > 1 ? 's' : ''}. Recarga para continuar.`, sinCreditos: true });
  const { crearCreativos } = await import('./campanas.js');
  const r = await crearCreativos(sid, req.params.id, {
    instruccion: String(req.body?.instruccion || ''), cantidad: n, tamano: String(req.body?.tamano || 'feed'),
  });
  if (r.error) return res.status(400).json({ error: r.error });
  cobrar(sid, costo, `Creativos del anuncio (${n})`);
  res.json({ creativos: r.creativos, creditos: saldo(sid) });
});

// Paso 3: textos principales, títulos y descripciones (estructura de Meta).
api.post('/campanas/:id/textos', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const { COSTO, saldo, cobrar } = await import('./creditos.js');
  if (saldo(sid) < COSTO.texto) return res.status(402).json({ error: `Necesitas ${COSTO.texto} créditos. Recarga para continuar.`, sinCreditos: true });
  const { crearTextos } = await import('./campanas.js');
  const r = await crearTextos(sid, req.params.id, { tono: String(req.body?.tono || ''), cantidad: Number(req.body?.cantidad) || 4 });
  if (r.error) return res.status(400).json({ error: r.error });
  cobrar(sid, COSTO.texto, 'Textos del anuncio');
  res.json({ copys: r.copys, creditos: saldo(sid) });
});

// ── Administrador de anuncios del cliente (Meta Marketing API) ────────
api.post('/ads/conectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { opcionesDeConexion } = await import('./metaAds.js');
  const r = await opcionesDeConexion(req.user!.storeId!, String(req.body?.code || ''));
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ opciones: r.opciones });
});

api.post('/ads/seleccionar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { guardarSeleccion, estadoCuenta } = await import('./metaAds.js');
  const b = req.body || {};
  const r = guardarSeleccion(req.user!.storeId!, {
    adAccountId: String(b.adAccountId || ''), adAccountNombre: String(b.adAccountNombre || ''), moneda: String(b.moneda || ''),
    pageId: String(b.pageId || ''), pageNombre: String(b.pageNombre || ''),
  });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ads: estadoCuenta(req.user!.storeId!) });
});

api.delete('/ads', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { desconectar, estadoCuenta } = await import('./metaAds.js');
  desconectar(req.user!.storeId!);
  res.json({ ads: estadoCuenta(req.user!.storeId!) });
});

api.post('/campanas/:id/publicar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { publicar } = await import('./metaAds.js');
  const b = req.body || {};
  const r = await publicar(req.user!.storeId!, req.params.id, {
    presupuesto: Number(b.presupuesto) || 0,
    textoIdx: Number(b.textoIdx) || 0, tituloIdx: Number(b.tituloIdx) || 0,
    descripcionIdx: Number(b.descripcionIdx) || 0, creativoIdx: Number(b.creativoIdx) || 0,
  });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, ids: r.ids });
});

// ── Créditos del Marketing IA (saldo, paquetes, recarga por Wompi) ────
api.get('/creditos', requireAuth, requireStore, async (req, res) => {
  const { saldo, movimientos, PAQUETES, COSTO } = await import('./creditos.js');
  res.json({ saldo: saldo(req.user!.storeId!), movimientos: movimientos(req.user!.storeId!), paquetes: PAQUETES, costo: COSTO });
});

api.post('/creditos/recargar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { crearRecargaCheckout } = await import('./suscripcion.js');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const base = `${proto}://${req.get('host')}`;
  const r = crearRecargaCheckout(req.user!.storeId!, req.user!.email, base, String(req.body?.paquete || ''));
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ url: r.url });
});

api.post('/admin/stores/:id/creditos', requireAuth, requireAdmin, async (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const cantidad = Math.round(Number(req.body?.cantidad));
  if (!Number.isFinite(cantidad) || cantidad === 0) return res.status(400).json({ error: 'Indica cuántos créditos dar (o quitar con negativo).' });
  const { abonar, cobrar } = await import('./creditos.js');
  if (cantidad > 0) abonar(s.id, cantidad, 'Ajuste del administrador');
  else cobrar(s.id, -cantidad, 'Ajuste del administrador');
  res.json({ ok: true });
});

// ── Equipo (usuarios de la tienda que pueden entrar y responder) ──────
api.get('/team', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const store = db.prepare('SELECT correo FROM stores WHERE id = ?').get(sid) as { correo: string } | undefined;
  const users = db.prepare('SELECT id, nombre, email FROM users WHERE store_id = ? ORDER BY rowid').all(sid) as { id: string; nombre: string; email: string }[];
  res.json({ team: users.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, esDueno: u.email === store?.correo, esTu: u.id === req.user!.id })) });
});

api.post('/team', requireAuth, requireStore, requireOwner, (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Faltan el nombre, el correo o la contraseña.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const correo = String(email).toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(correo)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const id = uid();
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(id, correo, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', req.user!.storeId);
  res.json({ id });
});

api.delete('/team/:id', requireAuth, requireStore, requireOwner, (req, res) => {
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
  const mid = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, l.id, 'vendedor', texto);
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);
  const wa = await sendWhatsappText(req.user!.storeId!, l.wa_id || l.tel, texto, l.tel);
  marcarEnviado(mid, wa);
  res.json({ ok: true, enviadoPorWhatsapp: wa.ok, aviso: wa.ok ? undefined : wa.error });
});

// Disparar MANUALMENTE el mensaje inicial de un producto en este chat (flujo).
// Envía la presentación y deja el chat esperando al cliente (a cargo del asistente).
api.post('/leads/:id/flujo-inicial', requireAuth, requireStore, async (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Chat no encontrado.' });
  const { enviarMensajeInicialManual } = await import('./ai.js');
  const r = await enviarMensajeInicialManual(req.user!.storeId!, req.params.id, String(req.body?.productId || ''));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
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
  const mid = saveOutgoingMessage(l.id, String(caption || ''), saved.tipo, saved.url, saved.mime, String(nombre || ''));
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);

  const r = await sendWhatsappMedia(req.user!.storeId!, l.wa_id || l.tel, { buffer: saved.buffer, mime: saved.mime, tipo: saved.tipo }, String(caption || ''), String(nombre || ''), l.tel);
  marcarEnviado(mid, r);
  res.json({ ok: true, enviadoPorWhatsapp: r.ok, aviso: r.ok ? undefined : r.error });
});

// Reintenta enviar un mensaje SALIENTE que falló (o cualquiera del bot/vendedor).
api.post('/messages/:id/reenviar', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const m = db.prepare(
    'SELECT m.id, m.de, m.texto, m.tipo, m.media_url, m.media_mime, l.wa_id, l.tel FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.id = ? AND l.store_id = ?',
  ).get(req.params.id, sid) as { id: string; de: string; texto: string; tipo: string; media_url: string | null; media_mime: string | null; wa_id: string | null; tel: string } | undefined;
  if (!m) return res.status(404).json({ error: 'Mensaje no encontrado.' });
  if (m.de === 'cliente') return res.status(400).json({ error: 'Solo se pueden reenviar los mensajes que envías tú.' });
  const destino = m.wa_id || m.tel;

  let r: { ok: boolean; error?: string; wamid?: string };
  if (m.tipo && m.tipo !== 'texto' && m.media_url) {
    const archivo = mediaPath(sid, String(m.media_url).split('/').pop() || '');
    if (!existsSync(archivo)) return res.status(400).json({ error: 'No encontramos el archivo del mensaje para reenviarlo.' });
    const mime = m.media_mime || 'application/octet-stream';
    r = await sendWhatsappMedia(sid, destino, { buffer: readFileSync(archivo), mime, tipo: tipoDeMime(mime) }, m.texto || '', '', m.tel);
  } else {
    r = await sendWhatsappText(sid, destino, m.texto || '', m.tel);
  }
  marcarEnviado(m.id, r); // actualiza wa_msg_id + estado (enviado / fallido)
  res.json({ ok: r.ok, estado: r.ok ? 'enviado' : 'fallido', error: r.ok ? undefined : r.error });
});

// ── Asistente ─────────────────────────────────────────────────────────
api.put('/assistant', requireAuth, requireStore, requireOwner, (req, res) => {
  const { instrucciones, reglas, nombre, seguimientoActivo, estilo } = req.body || {};
  // seguimientoActivo por defecto true (encendido); se guarda como seguimiento_off invertido.
  const off = seguimientoActivo === false ? 1 : 0;
  const estiloJson = estilo && typeof estilo === 'object' ? j(estilo) : '';
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas, nombre, seguimiento_off, estilo) VALUES (?,?,?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas, nombre = excluded.nombre, seguimiento_off = excluded.seguimiento_off, estilo = excluded.estilo`,
  ).run(req.user!.storeId, String(instrucciones || ''), j(Array.isArray(reglas) ? reglas : []), String(nombre || '').trim(), off, estiloJson);
  res.json({ ok: true });
});

// ── Meta Messaging: Messenger + Instagram DM ─────────────────────────
api.get('/meta/estado', requireAuth, requireStore, async (req, res) => {
  const { metaConectado } = await import('./meta.js');
  res.json(metaConectado(req.user!.storeId!));
});

// Alta en un clic: recibe el `code` del popup de Facebook y conecta las páginas.
api.post('/meta/conectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { conectarPaginasMeta } = await import('./meta.js');
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Falta el código de autorización de Meta.' });
  const r = await conectarPaginasMeta(req.user!.storeId!, String(code));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, paginas: r.paginas });
});

// Desconectar Messenger/Instagram.
api.delete('/meta', requireAuth, requireStore, requireOwner, (req, res) => {
  db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'meta_paginas'").run(req.user!.storeId);
  res.json({ ok: true });
});

// ── WhatsApp: conexión en un clic (Embedded Signup de Meta) ──────────
// El popup de Facebook nos devuelve un código y los IDs del número elegido;
// aquí completamos el alta contra Meta sin que la tienda toque nada técnico.
api.post('/whatsapp/embedded', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { code, wabaId, phoneNumberId } = req.body || {};
  const { conectarPorSignup } = await import('./metaSignup.js');
  const r = await conectarPorSignup(req.user!.storeId!, String(code || '').trim(), String(wabaId || '').trim(), String(phoneNumberId || '').trim());
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ conectado: true, numero: r.numero, aviso: r.aviso });
});

// Chequeo del número contra Meta (calidad, límites, verificación) + enlaces al
// panel de Meta, incluido el de facturación: cada tienda pone su propio pago.
api.get('/whatsapp/estado', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { estadoNumero } = await import('./waEstado.js');
  res.json(await estadoNumero(req.user!.storeId!));
});

// ── WhatsApp (vinculación por WABA ID + token) ───────────────────────
api.put('/whatsapp', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { wabaId, phoneNumberId, accessToken } = req.body || {};
  if (!wabaId?.trim() || !phoneNumberId?.trim() || !accessToken?.trim()) {
    return res.status(400).json({ error: 'Faltan datos: WABA ID, Phone Number ID y Access Token.' });
  }
  const check = await verifyWhatsappCredentials(phoneNumberId.trim(), accessToken.trim());
  if (!check.ok) return res.status(400).json({ error: check.error });
  // Un número solo puede estar ACTIVO en una tienda: si estaba conectado en otra,
  // lo desconectamos ahí para que el webhook enrute a esta (la última en conectarlo).
  db.prepare("UPDATE whatsapp SET conectado = 0 WHERE phone_number_id = ? AND store_id != ?").run(phoneNumberId.trim(), req.user!.storeId);
  db.prepare(
    `INSERT INTO whatsapp (store_id, waba_id, phone_number_id, access_token, numero, conectado, modo) VALUES (?,?,?,?,?,1,'cloud')
     ON CONFLICT(store_id) DO UPDATE SET waba_id = excluded.waba_id, phone_number_id = excluded.phone_number_id,
       access_token = excluded.access_token, numero = excluded.numero, conectado = 1, modo = 'cloud'`,
  ).run(req.user!.storeId, wabaId.trim(), phoneNumberId.trim(), accessToken.trim(), check.numero);
  console.log(`[whatsapp] tienda ${req.user!.storeId} conectó phone_number_id=${phoneNumberId.trim()} (${check.numero})`);
  res.json({ conectado: true, numero: check.numero });
});

api.delete('/whatsapp', requireAuth, requireStore, requireOwner, async (req, res) => {
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
api.post('/whatsapp/qr/start', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { startQrSession } = await import('./waqr.js');
  await startQrSession(req.user!.storeId!);
  res.json({ ok: true });
});

api.get('/whatsapp/qr/status', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { getQrStatus } = await import('./waqr.js');
  res.json(getQrStatus(req.user!.storeId!));
});

// ── Admin ─────────────────────────────────────────────────────────────
api.get('/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  // Las tiendas ocultas (fantasma) no aparecen para el admin normal.
  const stores = (db.prepare('SELECT * FROM stores WHERE COALESCE(oculta,0) = 0 ORDER BY created_at').all() as Record<string, unknown>[]).map((s) => {
    const ventas = db.prepare(
      `SELECT COALESCE(SUM(oi.qty * oi.precio), 0) + COALESCE((SELECT SUM(envio) FROM orders WHERE store_id = ? AND created_at >= date('now','start of month')), 0) AS total
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
    ).get(s.id, s.id) as { total: number };
    return { id: s.id, tienda: s.nombre, correo: s.correo, plan: s.plan, ventas: ventas.total, activa: !!s.activa, planEstado: s.plan_estado || 'prueba', planVence: s.plan_vence || null, creditos: s.creditos || 0, temaPremium: !!s.tema_premium };
  });
  const plans = (db.prepare('SELECT * FROM plans').all() as Record<string, unknown>[]).map((p) => ({
    id: p.id, nombre: p.nombre, precio: p.precio, features: pj(p.features as string, []),
    cuentas: (db.prepare('SELECT COUNT(*) AS n FROM stores WHERE plan = ? AND COALESCE(oculta,0) = 0').get(p.nombre) as { n: number }).n,
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
  const s = db.prepare('SELECT id, nombre, correo, activa FROM stores WHERE id = ?').get(req.params.id) as
    | { id: string; nombre: string; correo: string; activa: number }
    | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const { nombre, correo, plan, password, activa, temaPremium } = req.body || {};
  // El usuario dueño de la tienda (su correo coincide con el de la tienda).
  const dueno = db.prepare("SELECT id FROM users WHERE store_id = ? AND email = ?").get(s.id, s.correo) as { id: string } | undefined;

  if (activa !== undefined) db.prepare('UPDATE stores SET activa = ? WHERE id = ?').run(activa ? 1 : 0, s.id);
  if (temaPremium !== undefined) db.prepare('UPDATE stores SET tema_premium = ? WHERE id = ?').run(temaPremium ? 1 : 0, s.id);
  if (typeof nombre === 'string' && nombre.trim()) {
    db.prepare('UPDATE stores SET nombre = ? WHERE id = ?').run(nombre.trim(), s.id);
    if (dueno) db.prepare('UPDATE users SET nombre = ? WHERE id = ?').run(nombre.trim(), dueno.id);
  }
  if (typeof correo === 'string' && correo.trim()) {
    const nuevo = correo.toLowerCase().trim();
    if (nuevo !== s.correo) {
      const existe = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(nuevo, dueno?.id || '') as { id: string } | undefined;
      if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
      db.prepare('UPDATE stores SET correo = ? WHERE id = ?').run(nuevo, s.id);
      if (dueno) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(nuevo, dueno.id);
    }
  }
  if (typeof plan === 'string' && plan.trim()) db.prepare('UPDATE stores SET plan = ? WHERE id = ?').run(plan.trim(), s.id);
  if (typeof password === 'string' && password) {
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    if (dueno) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), dueno.id);
  }
  res.json({ ok: true });
});

api.delete('/admin/stores/:id', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  // El borrado en cascada (FK ON DELETE CASCADE) limpia usuarios, productos, pedidos, leads, etc.
  db.prepare('DELETE FROM stores WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

// Detalle de una tienda para el admin.
api.get('/admin/stores/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const s = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const wa = db.prepare('SELECT conectado, numero, modo FROM whatsapp WHERE store_id = ?').get(id) as { conectado: number; numero: string; modo: string } | undefined;
  const productos = (db.prepare('SELECT COUNT(*) n FROM products WHERE store_id = ?').get(id) as { n: number }).n;
  const leads = (db.prepare('SELECT COUNT(*) n FROM leads WHERE store_id = ?').get(id) as { n: number }).n;
  const agentes = (db.prepare("SELECT COUNT(*) n FROM users WHERE store_id = ? AND email != ?").get(id, s.correo) as { n: number }).n;
  const porEstado = db.prepare('SELECT estado, COUNT(*) n FROM orders WHERE store_id = ? GROUP BY estado').all(id) as { estado: string; n: number }[];
  const pedidos = (db.prepare('SELECT COUNT(*) n FROM orders WHERE store_id = ?').get(id) as { n: number }).n;
  const ventasMes = (db.prepare(
    `SELECT COALESCE(SUM(oi.qty * oi.precio),0) t FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
  ).get(id) as { t: number }).t;
  const recientes = (db.prepare('SELECT numero, cliente, estado, total, created_at FROM orders WHERE store_id = ? ORDER BY numero DESC LIMIT 5').all(id) as Record<string, unknown>[])
    .map((o) => ({ id: 'DF-' + o.numero, cliente: o.cliente, estado: o.estado, total: o.total, fecha: String(o.created_at).slice(0, 10) }));
  res.json({
    detalle: {
      id: s.id, nombre: s.nombre, correo: s.correo, plan: s.plan, activa: !!s.activa, creada: String(s.created_at).slice(0, 10),
      whatsapp: { conectado: !!wa?.conectado, numero: wa?.numero || '', modo: wa?.modo || 'cloud' },
      productos, pedidos, leads, agentes, ventasMes, porEstado, recientes,
    },
  });
});

// Entrar a una tienda (impersonar) para dar soporte.
api.post('/admin/stores/:id/impersonate', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id, correo FROM stores WHERE id = ?').get(req.params.id) as { id: string; correo: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const dueno = db.prepare("SELECT id, email, nombre, role, store_id FROM users WHERE store_id = ? AND email = ?").get(s.id, s.correo) as
    | { id: string; email: string; nombre: string; role: 'VENDEDOR' | 'ADMIN'; store_id: string | null }
    | undefined;
  if (!dueno) return res.status(404).json({ error: 'Esta tienda no tiene un dueño para entrar.' });
  setAuthCookie(res, { id: dueno.id, email: dueno.email, nombre: dueno.nombre, role: dueno.role, storeId: dueno.store_id, imp: req.user!.id });
  res.json({ ok: true });
});

api.patch('/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id, nombre FROM plans WHERE id = ?').get(req.params.id) as { id: string; nombre: string } | undefined;
  if (!p) return res.status(404).json({ error: 'Plan no encontrado.' });
  const { nombre, precio, features } = req.body || {};
  if (typeof nombre === 'string' && nombre.trim() && nombre.trim() !== p.nombre) {
    const dup = db.prepare('SELECT id FROM plans WHERE nombre = ? AND id != ?').get(nombre.trim(), p.id);
    if (dup) return res.status(409).json({ error: 'Ya existe un plan con ese nombre.' });
    db.prepare('UPDATE plans SET nombre = ? WHERE id = ?').run(nombre.trim(), p.id);
    db.prepare('UPDATE stores SET plan = ? WHERE plan = ?').run(nombre.trim(), p.nombre); // reasigna las tiendas de ese plan
  }
  if (precio !== undefined && Number(precio) >= 0) db.prepare('UPDATE plans SET precio = ? WHERE id = ?').run(Number(precio), p.id);
  if (Array.isArray(features)) db.prepare('UPDATE plans SET features = ? WHERE id = ?').run(j(features), p.id);
  res.json({ ok: true });
});

api.delete('/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id, nombre FROM plans WHERE id = ?').get(req.params.id) as { id: string; nombre: string } | undefined;
  if (!p) return res.status(404).json({ error: 'Plan no encontrado.' });
  const enUso = (db.prepare('SELECT COUNT(*) n FROM stores WHERE plan = ?').get(p.nombre) as { n: number }).n;
  if (enUso > 0) return res.status(409).json({ error: `No puedes borrar "${p.nombre}": ${enUso} tienda(s) lo usan. Cámbialas de plan primero.` });
  db.prepare('DELETE FROM plans WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

api.post('/admin/stores', requireAuth, requireAdmin, (req, res) => {
  const { nombre, correo, plan = 'Básico', password } = req.body || {};
  if (!nombre?.trim() || !correo?.trim() || !password) return res.status(400).json({ error: 'Faltan el nombre de la tienda, el correo o la contraseña.' });
  const email = String(correo).toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const storeId = uid();
  // Las tiendas creadas por el admin quedan activadas (el admin las da de alta ya pagadas).
  db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, plan_vence, inicial_pagado) VALUES (?,?,?,?, 'activa', date('now','+30 days'), 1)")
    .run(storeId, nombre.trim(), email, String(plan));
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(uid(), email, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', storeId);
  db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId);
  db.prepare('INSERT INTO assistants (store_id) VALUES (?)').run(storeId);
  res.json({ storeId });
});

// ── Integraciones por tienda (API keys propias) ───────────────────────
const IA_TIPOS = ['deepseek', 'openai', 'grok'];

api.get('/integraciones', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const rows = db.prepare('SELECT tipo, config FROM store_integrations WHERE store_id = ?').all(sid) as { tipo: string; config: string }[];
  const configuradas = rows.map((r) => {
    const cfg = pj<Record<string, string>>(r.config, {});
    // Nunca devolvemos las claves completas: solo los últimos 4 caracteres.
    const resumen: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg)) resumen[k] = v.length > 8 ? '••••' + v.slice(-4) : '••••';
    return { tipo: r.tipo, campos: resumen };
  });
  const asst = db.prepare('SELECT ia_proveedor FROM assistants WHERE store_id = ?').get(sid) as { ia_proveedor: string } | undefined;
  res.json({ configuradas, iaPredeterminada: (asst?.ia_proveedor || '').trim() || 'deepseek' });
});

api.put('/integraciones/:tipo', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const tipo = String(req.params.tipo).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  if (!tipo) return res.status(400).json({ error: 'Integración inválida.' });
  const config: Record<string, string> = {};
  const body = (req.body?.config || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(body)) {
    const kk = String(k).slice(0, 40);
    const vv = String(v ?? '').trim().slice(0, 500);
    if (vv) config[kk] = vv;
  }
  if (!Object.keys(config).length) return res.status(400).json({ error: 'Completa los datos de la integración.' });
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(sid, tipo, j(config));
  // Si es un proveedor de IA y lo marcan como agente predeterminado, se activa.
  if (IA_TIPOS.includes(tipo) && req.body?.predeterminada) {
    db.prepare(
      `INSERT INTO assistants (store_id, ia_proveedor) VALUES (?,?)
       ON CONFLICT(store_id) DO UPDATE SET ia_proveedor = excluded.ia_proveedor`,
    ).run(sid, tipo);
  }
  res.json({ ok: true });
});

api.delete('/integraciones/:tipo', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const tipo = String(req.params.tipo).toLowerCase();
  db.prepare('DELETE FROM store_integrations WHERE store_id = ? AND tipo = ?').run(sid, tipo);
  // Si era la IA predeterminada, vuelve al valor por defecto (DeepSeek del servidor).
  const asst = db.prepare('SELECT ia_proveedor FROM assistants WHERE store_id = ?').get(sid) as { ia_proveedor: string } | undefined;
  if (asst?.ia_proveedor === tipo) db.prepare("UPDATE assistants SET ia_proveedor = '' WHERE store_id = ?").run(sid);
  res.json({ ok: true });
});

// Elegir el agente (proveedor de IA) predeterminado de la tienda.
api.put('/integraciones-ia/predeterminada', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const proveedor = String(req.body?.proveedor || '').toLowerCase();
  if (!IA_TIPOS.includes(proveedor)) return res.status(400).json({ error: 'Proveedor de IA no soportado.' });
  db.prepare(
    `INSERT INTO assistants (store_id, ia_proveedor) VALUES (?,?)
     ON CONFLICT(store_id) DO UPDATE SET ia_proveedor = excluded.ia_proveedor`,
  ).run(sid, proveedor);
  res.json({ ok: true });
});

// ── Suscripción (pago de las tiendas a DealFlow por Wompi) ────────────
api.get('/planes', requireAuth, async (_req, res) => {
  const { listarPlanes } = await import('./suscripcion.js');
  res.json({ planes: listarPlanes() });
});

api.get('/suscripcion', requireAuth, requireStore, async (req, res) => {
  const { estadoSuscripcion } = await import('./suscripcion.js');
  res.json({ suscripcion: estadoSuscripcion(req.user!.storeId!) });
});

api.post('/suscripcion/checkout', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { crearCheckout } = await import('./suscripcion.js');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const base = `${proto}://${req.get('host')}`;
  const r = crearCheckout(req.user!.storeId!, req.user!.email, base, req.body?.plan, req.body?.cupon);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ url: r.url, gratis: r.gratis });
});

// La tienda valida un cupón para ver el descuento antes de pagar.
api.post('/suscripcion/cupon', requireAuth, requireStore, async (req, res) => {
  const { validarCupon } = await import('./suscripcion.js');
  res.json(validarCupon(String(req.body?.codigo || '')));
});

// Al volver del pago: verifica la transacción directamente con Wompi y activa
// la cuenta si fue aprobada (red de seguridad si el webhook no llegó).
api.post('/suscripcion/verificar', requireAuth, requireStore, async (req, res) => {
  const { verificarTransaccion } = await import('./suscripcion.js');
  const r = await verificarTransaccion(req.user!.storeId!, String(req.body?.id || ''));
  res.json(r);
});

// ── Cupones de descuento (los administra el admin de DealFlow) ────────
api.get('/admin/cupones', requireAuth, requireAdmin, (_req, res) => {
  const cupones = (db.prepare('SELECT * FROM cupones ORDER BY created_at DESC').all() as Record<string, unknown>[]).map((c) => ({
    id: c.id, codigo: c.codigo, descuento: c.descuento, montoFijo: c.monto_fijo ?? null, activo: !!c.activo,
    vence: c.vence || null, maxUsos: c.max_usos ?? null, usos: c.usos, nota: c.nota,
  }));
  res.json({ cupones });
});

api.post('/admin/cupones', requireAuth, requireAdmin, (req, res) => {
  const codigo = String(req.body?.codigo || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!codigo) return res.status(400).json({ error: 'Escribe un código para el cupón.' });
  if (db.prepare('SELECT id FROM cupones WHERE codigo = ?').get(codigo)) return res.status(409).json({ error: 'Ya existe un cupón con ese código.' });

  // Dos tipos: precio fijo (paga solo $X) o porcentaje.
  const esFijo = req.body?.tipo === 'monto' || req.body?.montoFijo != null;
  let descuento = 0;
  let montoFijo: number | null = null;
  if (esFijo) {
    montoFijo = Math.round(Number(req.body?.montoFijo));
    if (!Number.isFinite(montoFijo) || montoFijo < 0) return res.status(400).json({ error: 'El precio fijo debe ser 0 o mayor (0 = gratis).' });
  } else {
    descuento = Math.round(Number(req.body?.descuento));
    if (!Number.isFinite(descuento) || descuento < 1 || descuento > 100) return res.status(400).json({ error: 'El descuento debe estar entre 1% y 100%.' });
  }
  const vence = req.body?.vence ? String(req.body.vence).slice(0, 10) : null;
  const maxUsos = req.body?.maxUsos != null && req.body.maxUsos !== '' ? Math.max(1, Math.round(Number(req.body.maxUsos))) : null;
  const id = uid();
  db.prepare('INSERT INTO cupones (id, codigo, descuento, monto_fijo, activo, vence, max_usos, nota) VALUES (?,?,?,?,1,?,?,?)')
    .run(id, codigo, descuento, montoFijo, vence, maxUsos, String(req.body?.nota || '').trim());
  res.json({ id, codigo });
});

api.patch('/admin/cupones/:id', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT id FROM cupones WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!c) return res.status(404).json({ error: 'Cupón no encontrado.' });
  if (req.body?.activo !== undefined) db.prepare('UPDATE cupones SET activo = ? WHERE id = ?').run(req.body.activo ? 1 : 0, c.id);
  if (req.body?.descuento !== undefined) {
    const d = Math.round(Number(req.body.descuento));
    if (Number.isFinite(d) && d >= 1 && d <= 100) db.prepare('UPDATE cupones SET descuento = ? WHERE id = ?').run(d, c.id);
  }
  res.json({ ok: true });
});

api.delete('/admin/cupones/:id', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT id FROM cupones WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!c) return res.status(404).json({ error: 'Cupón no encontrado.' });
  db.prepare('DELETE FROM cupones WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

api.post('/admin/stores/:id/suscripcion', requireAuth, requireAdmin, async (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  const { extenderManual } = await import('./suscripcion.js');
  const dias = Number(req.body?.dias);
  if (!Number.isFinite(dias) || dias === 0) return res.status(400).json({ error: 'Indica cuántos días extender.' });
  extenderManual(s.id, dias);
  res.json({ ok: true });
});

// ── Canal WEB (webchat) ───────────────────────────────────────────────
// Segundo canal de la tienda: sirve para probar la IA sin WhatsApp y como
// chat para visitantes. Sin sesión: se identifica por storeId + session.
const sesionLimpia = (s: unknown) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

api.post('/webchat/:storeId/messages', async (req, res) => {
  const store = db.prepare('SELECT id, activa FROM stores WHERE id = ?').get(req.params.storeId) as { id: string; activa: number } | undefined;
  if (!store || !store.activa) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const session = sesionLimpia(req.body?.session);
  const texto = String(req.body?.texto || '').trim().slice(0, 2000);
  if (!session || session.length < 8 || !texto) return res.status(400).json({ error: 'Faltan la sesión o el mensaje.' });
  const waId = 'web:' + session;
  let lead = db.prepare('SELECT id FROM leads WHERE store_id = ? AND wa_id = ?').get(store.id, waId) as { id: string } | undefined;
  let contactoNuevo = false;
  if (!lead) {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 60) || 'Visitante Web';
    const id = uid();
    db.prepare("INSERT INTO leads (id, store_id, nombre, tel, wa_id, canal) VALUES (?,?,?,?,?, 'web')").run(id, store.id, nombre, waId, waId);
    lead = { id };
    contactoNuevo = true;
  }
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'cliente', texto);
  db.prepare('UPDATE leads SET seguimiento_nivel = 0 WHERE id = ?').run(lead.id); // el cliente respondió
  if (contactoNuevo) {
    const quien = String(req.body?.nombre || '').trim().split(' ')[0] || 'Un cliente';
    void import('./push.js').then((p) => p.enviarPush(store.id, 'contactos', 'Nuevo contacto 👋', `${quien} le escribió a tu tienda.`, { url: '/' })).catch(() => {});
  }
  void (async () => {
    try {
      const { maybeAutoReply } = await import('./ai.js');
      await maybeAutoReply(store.id, lead!.id);
    } catch (e) { console.error('[webchat] error IA', e); }
  })();
  res.json({ ok: true });
});

api.get('/webchat/:storeId/messages', (req, res) => {
  const store = db.prepare('SELECT id, nombre, activa FROM stores WHERE id = ?').get(req.params.storeId) as { id: string; nombre: string; activa: number } | undefined;
  if (!store || !store.activa) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const session = sesionLimpia(req.query.session);
  if (!session) return res.status(400).json({ error: 'Falta la sesión.' });
  const lead = db.prepare('SELECT id FROM leads WHERE store_id = ? AND wa_id = ?').get(store.id, 'web:' + session) as { id: string } | undefined;
  const mensajes = lead
    ? (db.prepare('SELECT de, texto, created_at, tipo, media_url, media_mime FROM messages WHERE lead_id = ? ORDER BY created_at').all(lead.id) as Record<string, unknown>[]).map((m) => ({
        de: m.de, texto: m.texto, hora: horaBogota(m.created_at), tipo: m.tipo || 'texto', mediaUrl: m.media_url || null, mediaMime: m.media_mime || null,
      }))
    : [];
  res.json({ tienda: store.nombre, mensajes });
});

// ── Superadmin: ve TODAS las tiendas y puede ocultarlas del admin ─────
api.get('/superadmin/stores', requireAuth, requireAdmin, (_req, res) => {
  // Excluimos la tienda interna "master" de la biblioteca (no es una tienda real).
  const stores = (db.prepare('SELECT * FROM stores WHERE id != ? ORDER BY created_at').all(MASTER_STORE_ID) as Record<string, unknown>[]).map((s) => {
    const ventas = (db.prepare(
      `SELECT COALESCE(SUM(oi.qty * oi.precio),0) t FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
    ).get(s.id) as { t: number }).t;
    return { id: s.id, tienda: s.nombre, correo: s.correo, plan: s.plan, ventas, activa: !!s.activa, oculta: !!s.oculta };
  });
  res.json({ stores });
});

api.patch('/superadmin/stores/:id/hide', requireAuth, requireSuperAdmin, (req, res) => {
  const s = db.prepare('SELECT id, oculta FROM stores WHERE id = ?').get(req.params.id) as { id: string; oculta: number } | undefined;
  if (!s) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const oculta = req.body?.oculta;
  db.prepare('UPDATE stores SET oculta = ? WHERE id = ?').run(oculta === undefined ? (s.oculta ? 0 : 1) : oculta ? 1 : 0, s.id);
  res.json({ ok: true });
});

// ── Biblioteca de productos (superadmin) ─────────────────────────────
api.get('/superadmin/biblioteca', requireAuth, requireAdmin, async (_req, res) => {
  const { listarBibliotecaAdmin } = await import('./biblioteca.js');
  res.json({ productos: listarBibliotecaAdmin() });
});

// Lista los productos de una tienda (para elegir cuál clonar a la biblioteca).
api.get('/superadmin/stores/:storeId/products', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, nombre, precio, tipo FROM products WHERE store_id = ? ORDER BY created_at').all(req.params.storeId) as
    { id: string; nombre: string; precio: number; tipo: string }[];
  res.json({ productos: rows });
});

api.post('/superadmin/biblioteca/from-product', requireAuth, requireAdmin, async (req, res) => {
  const { agregarProductoABiblioteca } = await import('./biblioteca.js');
  const { productId, gratis, precioImportacion, editable } = req.body || {};
  const r = agregarProductoABiblioteca(String(productId || ''), { gratis: !!gratis, precioImportacion: Number(precioImportacion) || 0, editable: editable !== false });
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});

// Entrar a la "Biblioteca de productos" para crear/editar con el editor completo:
// impersonamos la tienda master interna (el admin vuelve con "Volver al panel").
api.post('/superadmin/biblioteca/entrar', requireAuth, requireAdmin, (req, res) => {
  asegurarMasterStore();
  const dueno = duenoMasterStore();
  if (!dueno) return res.status(500).json({ error: 'No pudimos preparar la biblioteca.' });
  setAuthCookie(res, { id: dueno.id, email: dueno.email, nombre: dueno.nombre, role: 'VENDEDOR', storeId: dueno.store_id, imp: req.user!.id });
  res.json({ ok: true });
});

api.patch('/superadmin/biblioteca/:id', requireAuth, requireAdmin, async (req, res) => {
  const { actualizarLibraryProduct } = await import('./biblioteca.js');
  const { nombre, gratis, precioImportacion, activo, editable } = req.body || {};
  const r = actualizarLibraryProduct(req.params.id, {
    nombre: typeof nombre === 'string' ? nombre : undefined,
    gratis: typeof gratis === 'boolean' ? gratis : undefined,
    precioImportacion: typeof precioImportacion === 'number' ? precioImportacion : undefined,
    activo: typeof activo === 'boolean' ? activo : undefined,
    editable: typeof editable === 'boolean' ? editable : undefined,
  });
  if (!r.ok) return res.status(404).json({ error: 'Producto de biblioteca no encontrado.' });
  res.json({ ok: true });
});

api.delete('/superadmin/biblioteca/:id', requireAuth, requireAdmin, async (req, res) => {
  const { eliminarLibraryProduct } = await import('./biblioteca.js');
  eliminarLibraryProduct(req.params.id);
  res.json({ ok: true });
});

// ── Biblioteca de productos (tienda cliente) ─────────────────────────
api.get('/biblioteca', requireAuth, requireStore, async (req, res) => {
  const { listarBiblioteca } = await import('./biblioteca.js');
  res.json({ productos: listarBiblioteca(req.user!.storeId!) });
});

// Importa un producto: gratis o ya adquirido → lo clona ya; de pago sin adquirir → pide pago.
api.post('/biblioteca/:id/importar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { getLibraryProduct, yaAdquirido, importarLibraryEnTienda } = await import('./biblioteca.js');
  const lib = getLibraryProduct(req.params.id);
  if (!lib || !lib.activo) return res.status(404).json({ error: 'Producto de biblioteca no disponible.' });
  const storeId = req.user!.storeId!;
  if (!lib.gratis && !yaAdquirido(storeId, req.params.id)) {
    return res.json({ requierePago: true, precio: lib.precio_importacion });
  }
  const r = importarLibraryEnTienda(req.params.id, storeId, !lib.gratis);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, productId: r.productId });
});

// Inicia el pago único de un producto de biblioteca de pago.
api.post('/biblioteca/:id/checkout', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { crearCheckoutBiblioteca } = await import('./suscripcion.js');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const base = `${proto}://${req.get('host')}`;
  const r = crearCheckoutBiblioteca(req.user!.storeId!, req.user!.email, base, req.params.id);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ url: r.url });
});

// ── Registro de actividad / errores de la tienda (diagnóstico del Inbox) ──
api.get('/logs', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  // Con ?leadId=... devolvemos SOLO el registro de ese chat; sin él, todo el de la tienda.
  const leadId = typeof req.query.leadId === 'string' ? req.query.leadId.trim() : '';
  const rows = (leadId
    ? db.prepare('SELECT nivel, evento, detalle, lead_id, created_at FROM event_log WHERE store_id = ? AND lead_id = ? ORDER BY id DESC LIMIT 200').all(sid, leadId)
    : db.prepare('SELECT nivel, evento, detalle, lead_id, created_at FROM event_log WHERE store_id = ? ORDER BY id DESC LIMIT 200').all(sid)) as
    { nivel: string; evento: string; detalle: string; lead_id: string | null; created_at: string }[];
  res.json({ logs: rows.map((r) => ({ nivel: r.nivel, evento: r.evento, detalle: r.detalle, leadId: r.lead_id || null, createdAt: r.created_at })) });
});
api.delete('/logs', requireAuth, requireStore, requireOwner, (req, res) => {
  db.prepare('DELETE FROM event_log WHERE store_id = ?').run(req.user!.storeId);
  res.json({ ok: true });
});

// ── Web Push (notificaciones con la app cerrada) ─────────────────────
// Llave pública VAPID para que el navegador se suscriba (y si el push está listo).
api.get('/push/vapid', requireAuth, requireStore, async (_req, res) => {
  const { vapidPublicKey, pushDisponible } = await import('./push.js');
  res.json({ key: vapidPublicKey(), disponible: pushDisponible() });
});
// Guarda/actualiza la suscripción del navegador con sus preferencias de tipo.
api.post('/push/subscribe', requireAuth, requireStore, async (req, res) => {
  const { guardarSuscripcion } = await import('./push.js');
  const ok = guardarSuscripcion(req.user!.storeId!, req.body?.sub || {}, req.body?.prefs || {});
  if (!ok) return res.status(400).json({ error: 'Suscripción inválida.' });
  res.json({ ok: true });
});
// Elimina la suscripción (al desactivar las notificaciones).
api.post('/push/unsubscribe', requireAuth, requireStore, async (req, res) => {
  const { eliminarSuscripcion } = await import('./push.js');
  eliminarSuscripcion(String(req.body?.endpoint || ''));
  res.json({ ok: true });
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

// Multimedia de la Biblioteca: visible para CUALQUIER tienda autenticada
// (para poder mostrar las fotos de los productos antes de importarlos).
api.get('/library/media/:file', requireAuth, requireStore, (req, res) => {
  const file = mediaPath('__biblioteca__', req.params.file);
  if (!existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// ── Webhook de Meta (una sola URL para todas las tiendas) ────────────
/** Compara la firma X-Hub-Signature-256 de Meta con la calculada, sin filtrar tiempos. */
function firmaMetaValida(secret: string, raw: Buffer | undefined, firma: string): boolean {
  if (!raw || !firma.startsWith('sha256=')) return false;
  try {
    const esperado = createHmac('sha256', secret).update(raw).digest('hex');
    const recibido = firma.slice('sha256='.length);
    const a = Buffer.from(esperado, 'hex');
    const b = Buffer.from(recibido, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

webhooks.get('/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'dealflow-verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

webhooks.post('/whatsapp', (req, res) => {
  // Verificamos que el mensaje venga de verdad de Meta: firma HMAC-SHA256 del
  // cuerpo crudo con el App Secret. Sin esto, cualquiera que conozca la URL
  // podría inyectar mensajes falsos en el Inbox de una tienda.
  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const firma = String(req.headers['x-hub-signature-256'] || '');
    const raw = (req as { rawBody?: Buffer }).rawBody;
    if (!firmaMetaValida(secret, raw, firma)) {
      console.warn('[webhook] firma de Meta inválida o ausente — se ignora la entrada');
      return res.sendStatus(403);
    }
  }
  // Meta exige responder rápido: procesamos y contestamos 200 siempre.
  // La MISMA URL recibe WhatsApp, Messenger (page) e Instagram (instagram);
  // se enruta por el campo `object`.
  try {
    const obj = (req.body as { object?: string })?.object;
    if (obj === 'page' || obj === 'instagram') {
      void import('./meta.js').then((m) => m.handleMetaWebhook(obj, req.body)).catch((e) => console.error('[webhook] meta', e));
    } else {
      handleIncomingWebhook(req.body);
    }
  } catch (e) {
    console.error('[webhook] error procesando entrada', e);
  }
  res.sendStatus(200);
});

// ── Webhook de Wompi: confirma el pago de la suscripción ──────────────
webhooks.post('/wompi', async (req, res) => {
  try {
    const evento = (req.body || {}) as { event?: string; data?: { transaction?: Record<string, unknown> }; signature?: { checksum?: string; properties?: string[] }; timestamp?: number };
    const tx = evento.data?.transaction;
    if (evento.event === 'transaction.updated' && tx) {
      // Validación de firma (si está configurado el secreto de eventos de Wompi).
      const secret = process.env.WOMPI_EVENTS_SECRET;
      let firmaOk = true;
      if (secret && evento.signature?.properties) {
        const { createHash } = await import('node:crypto');
        const concat = evento.signature.properties.map((p) => p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tx as unknown)).join('');
        const calc = createHash('sha256').update(`${concat}${evento.timestamp}${secret}`).digest('hex');
        firmaOk = calc === evento.signature.checksum;
        if (!firmaOk) console.warn('[wompi] firma inválida en el webhook — se ignora el evento');
      }
      if (firmaOk && tx.status === 'APPROVED' && tx.reference) {
        const { aplicarPagoAprobado } = await import('./suscripcion.js');
        aplicarPagoAprobado(String(tx.reference), String(tx.id || ''));
      }
    }
  } catch (e) {
    console.error('[wompi] error procesando webhook', e);
  }
  res.sendStatus(200);
});
