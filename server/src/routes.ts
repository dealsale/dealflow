import { mensajesDe as mensajesInicialesDe, normalizarMensajes, principal } from './mensajesIniciales.js';
import { Router } from 'express';
import type { Request as ExRequest, Response as ExResponse } from 'express';
import { trazar, conPedido } from './trazabilidad.js';
import { idsDeItem } from './emparejar.js';
import { idiomaDe, MSG_ESTADO } from './idioma.js';
import { ESTADOS_PEDIDO } from './estadosPedido.js';
import { novedadesPorPedido } from './novedades.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, j, pj, uid, registrarLog, PLAN_UNICO } from './db.js';
import { urlTienda } from './tiendaPublica.js';
import * as sa from './shopifyApp.js';
import { registrarAccesosEquipo, registrarAccionEquipo, listarAccesos, claveInvalida, estadoSeguridad } from './seguridad.js';
import { moverAPapelera, listarPapelera, restaurarDePapelera, listarRespaldos, prepararDescarga, copiaDiaria, DIAS_PAPELERA, eliminarRespaldo, eliminarDePapelera, espacioDisco } from './papelera.js';
import { esImportBloqueado, productosBloqueados, MASTER_STORE_ID, asegurarMasterStore, duenoMasterStore, sincronizarSnapshotMaster, eliminarLibraryDeMaster } from './biblioteca.js';
import { clearAuthCookie, esDuenoDeTienda, hashPassword, requireAdmin, requireAuth, requireOwner, requireStore, requireSuperAdmin, setAuthCookie, verifyPassword } from './auth.js';
import type { AuthUser } from './auth.js';
import { handleIncomingWebhook, marcarEnviado, sendWhatsappMedia, sendWhatsappText, sendWhatsappTemplate, verifyWhatsappCredentials } from './wa.js';
import { mediaPath, saveOutgoingMedia, saveOutgoingMessage, tipoDeMime } from './media.js';
import { existsSync, readFileSync } from 'node:fs';
import type * as DropiApi from './dropiApi.js';
import { problemaVariables } from './seedPlantillas.js';
import { listarProveedores, crearProveedor, editarProveedor, borrarProveedor } from './proveedores.js';

export const api = Router();
// Registro de accesos del equipo (administradores y soporte dentro de una tienda).
api.use(registrarAccesosEquipo);
// Al crear/editar productos o variantes (o marcarlos de Effi), se vinculan solos con Effi.
api.use((req, res, next) => {
  if (req.method !== 'GET' && /^\/(products|variants|effi-api\/producto-proveedor)/.test(req.path)) {
    res.on('finish', () => {
      const sid = (req as { user?: { storeId?: string } }).user?.storeId;
      if (res.statusCode < 400 && sid) void import('./effiApi.js').then((m) => m.autoVincularPronto(sid)).catch(() => {});
    });
  }
  next();
});
export const webhooks = Router();

const ESTADOS = ['Nuevo', 'Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'Entregado'] as const;

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
  if ((row.role as string) === 'ADMIN' || (row.role as string) === 'SUPERADMIN') registrarAccionEquipo(row.email, `Inicio de sesión (${String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()})`);
  setAuthCookie(res, user, req.hostname);
  res.json({ user: { ...user, esDueno: esDuenoDeTienda(user) } });
});

// Auto-registro público: cualquiera crea su cuenta. Queda SIN plan (bloqueada)
// hasta que compre el valor inicial de un plan.
api.post('/auth/registro', (req, res) => {
  const { nombre, negocio, correo, password } = req.body || {};
  if (!nombre?.trim() || !correo?.trim() || !password) {
    return res.status(400).json({ error: 'Escribe tu nombre, tu correo y una contraseña.' });
  }
  { const e = claveInvalida(String(password), false); if (e) return res.status(400).json({ error: e }); }
  const email = String(correo).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

  const storeId = uid();
  const nombreTienda = (negocio?.trim() || nombre.trim());
  const userId = uid();
  // Todo en UNA transacción: si algo falla, no queda una tienda "huérfana" con el
  // correo del cliente que luego choque (UNIQUE) y dé "error interno" al reintentar.
  try {
    // Limpieza defensiva: si un intento anterior dejó una tienda sin dueño con este
    // correo (pero sin usuario, porque falló a mitad), la quitamos para no chocar.
    const huerfana = db.prepare("SELECT s.id FROM stores s WHERE s.correo = ? AND NOT EXISTS (SELECT 1 FROM users u WHERE u.store_id = s.id)").get(email) as { id: string } | undefined;
    if (huerfana) db.prepare('DELETE FROM stores WHERE id = ?').run(huerfana.id);
    const crear = db.transaction(() => {
      // Nace sin plan: plan_estado 'sin_plan', inicial_pagado 0. Activa=1 para poder entrar y ver el muro de pago.
      db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, inicial_pagado, activa, owner_user_id) VALUES (?,?,?,?, 'sin_plan', 0, 1, ?)")
        .run(storeId, nombreTienda, email, '', userId);
      db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)')
        .run(userId, email, hashPassword(String(password)), nombre.trim(), 'VENDEDOR', storeId);
      db.prepare('INSERT OR IGNORE INTO whatsapp (store_id) VALUES (?)').run(storeId);
      db.prepare('INSERT OR IGNORE INTO assistants (store_id) VALUES (?)').run(storeId);
    });
    crear();
  } catch (e) {
    console.error('[registro] error', e);
    return res.status(500).json({ error: 'No pudimos crear tu cuenta. Intenta de nuevo; si sigue fallando, escríbenos.' });
  }
  // Créditos de bienvenida (no crítico: si falla, la cuenta ya quedó creada).
  void import('./creditos.js').then(({ abonar, CREDITOS_BIENVENIDA }) => abonar(storeId, CREDITOS_BIENVENIDA, 'Créditos de bienvenida')).catch(() => {});

  void import('./correo.js').then((c) => c.correoBienvenida(email, nombre.trim(), storeId)).catch(() => {});

  const user: AuthUser = { id: userId, email, nombre: nombre.trim(), role: 'VENDEDOR', storeId };
  setAuthCookie(res, user, req.hostname);
  res.json({ user: { ...user, esDueno: true } });
});

// Recuperar contraseña por correo: siempre responde igual (no revela si la cuenta existe).
api.post('/auth/olvide', async (req, res) => {
  const correo = String(req.body?.correo || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  const c = await import('./correo.js');
  if (!c.proveedorCorreo()) return res.status(503).json({ error: 'El envío de correos aún no está activo. Escríbenos por WhatsApp para recuperar tu cuenta.' });
  await c.solicitarRecuperacion(correo).catch((e) => console.warn('[olvide]', e));
  res.json({ ok: true });
});
api.get('/auth/restablecer/:token', async (req, res) => {
  const c = await import('./correo.js');
  const r = c.validarToken(req.params.token, false);
  if ('error' in r) return res.status(400).json({ error: r.error });
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(r.userId) as { email: string } | undefined;
  res.json({ ok: true, correo: u?.email || '' });
});
api.post('/auth/restablecer', async (req, res) => {
  const { token, password } = req.body || {};
  const u0 = await import('./correo.js');
  const v = u0.validarToken(String(token || ''), false);
  if ('error' in v) return res.status(400).json({ error: v.error });
  const u = db.prepare('SELECT id, email, nombre, role, store_id, foto FROM users WHERE id = ?').get(v.userId) as { id: string; email: string; nombre: string; role: string; store_id: string | null; foto: string } | undefined;
  if (!u) return res.status(400).json({ error: 'La cuenta ya no existe.' });
  const equipo = u.role === 'ADMIN' || u.role === 'SUPERADMIN';
  { const e = claveInvalida(String(password || ''), equipo); if (e) return res.status(400).json({ error: e }); }
  u0.validarToken(String(token), true);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), u.id);
  if (equipo) registrarAccionEquipo(u.email, 'Cambió su contraseña con el enlace de recuperación');
  void u0.enviarCorreo({ para: u.email, tipo: 'clave_cambiada', storeId: u.store_id, asunto: 'Tu contraseña de DealFlow cambió', html: u0.plantillaCorreo('Tu contraseña cambió', ['La contraseña de tu cuenta de DealFlow se cambió hace un momento.', 'Si no fuiste tú, escríbenos de inmediato.']) });
  res.json({ ok: true });
});

// Avisos por correo de la tienda (pedido nuevo, novedades, alertas).
api.get('/correo/prefs', requireAuth, requireStore, async (req, res) => {
  const c = await import('./correo.js');
  res.json({ ...c.prefsCorreo(req.user!.storeId!), activo: !!c.proveedorCorreo() });
});
api.post('/correo/prefs', requireAuth, requireStore, async (req, res) => {
  const c = await import('./correo.js');
  try { res.json({ ...c.guardarPrefsCorreo(req.user!.storeId!, req.body || {}), activo: !!c.proveedorCorreo() }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo guardar.' }); }
});
api.post('/correo/prueba', requireAuth, requireStore, async (req, res) => {
  const c = await import('./correo.js');
  const p = c.prefsCorreo(req.user!.storeId!);
  const para = p.para || p.correoCuenta || req.user!.email;
  const r = await c.enviarCorreo({ para, tipo: 'prueba', storeId: req.user!.storeId, asunto: 'Correo de prueba de DealFlow ✅', html: c.plantillaCorreo('¡Los correos funcionan! ✅', ['Si lees esto, los avisos por correo de DealFlow te van a llegar a este buzón.', 'Revisa también la carpeta de spam la primera vez y marca el correo como "No es spam".']) });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, para });
});

api.post('/auth/logout', (req, res) => {
  clearAuthCookie(res, req.hostname);
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
  setAuthCookie(res, user, req.hostname);
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
  setAuthCookie(res, user, req.hostname);
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
  { const e = claveInvalida(String(nueva), false); if (e) return res.status(400).json({ error: e }); }
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
  setAuthCookie(res, { id: row.id, email: row.email, nombre: row.nombre, role: row.role, storeId: row.store_id, foto: row.foto || undefined }, req.hostname);
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
  setAuthCookie(res, { ...req.user!, storeId: s.id }, req.hostname);
  res.json({ ok: true });
});

api.post('/crear-tienda', requireAuth, requireStore, (req, res) => {
  if (!esDuenoDeTienda(req.user)) return res.status(403).json({ error: 'Solo el dueño puede crear tiendas.' });
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre a la nueva tienda.' });
  const storeId = uid();
  try {
    // Tienda extra: sin instalación, plana 250k/mes. Nace pendiente de la primera renta (estado vencida).
    const crear = db.transaction(() => {
      db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, plan_vence, inicial_pagado, activa, owner_user_id) VALUES (?,?,?, 'DealFlow', 'vencida', date('now','-40 day'), 1, 1, ?)")
        .run(storeId, nombre, req.user!.email, req.user!.id);
      db.prepare('INSERT OR IGNORE INTO whatsapp (store_id) VALUES (?)').run(storeId);
      db.prepare('INSERT OR IGNORE INTO assistants (store_id) VALUES (?)').run(storeId);
      db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run(storeId, req.user!.id);
    });
    crear();
  } catch (e) {
    console.error('[crear-tienda] error', e);
    return res.status(500).json({ error: 'No pudimos crear la tienda. ' + (e instanceof Error ? e.message : '') });
  }
  void import('./creditos.js').then(({ abonar, CREDITOS_BIENVENIDA }) => abonar(storeId, CREDITOS_BIENVENIDA, 'Créditos de bienvenida')).catch(() => {});
  // Deja al dueño parado en la tienda nueva.
  setAuthCookie(res, { ...req.user!, storeId }, req.hostname);
  res.json({ ok: true, storeId });
});

// El dueño elimina una de SUS tiendas (para limpiar tiendas de más). No puede
// borrar la tienda en la que está parado (que cambie primero) ni su única tienda.
api.delete('/mis-tiendas/:id', requireAuth, requireStore, (req, res) => {
  if (!esDuenoDeTienda(req.user)) return res.status(403).json({ error: 'Solo el dueño puede eliminar tiendas.' });
  if (req.params.id === req.user!.storeId) return res.status(400).json({ error: 'No puedes eliminar la tienda en la que estás. Cámbiate a otra primero.' });
  const mias = db.prepare("SELECT id FROM stores WHERE owner_user_id = ? OR (owner_user_id = '' AND correo = ?)").all(req.user!.id, req.user!.email) as { id: string }[];
  if (mias.length <= 1) return res.status(400).json({ error: 'No puedes eliminar tu única tienda.' });
  const esMia = mias.some((s) => s.id === req.params.id);
  if (!esMia) return res.status(404).json({ error: 'Esa tienda no es tuya.' });
  try {
    moverAPapelera(req.params.id, req.user!.email); // queda 30 días en la papelera (el superadmin la puede restaurar)
  } catch (e) {
    console.error('[eliminar-tienda] error', e);
    return res.status(500).json({ error: 'No pudimos eliminar la tienda. Intenta de nuevo.' });
  }
  res.json({ ok: true });
});

// ── Estado completo de la tienda (una llamada para pintar el panel) ───
api.get('/state', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const storeRow = db.prepare('SELECT id, nombre, plan, tema_premium FROM stores WHERE id = ?').get(sid) as { id: string; nombre: string; plan: string; tema_premium: number };
  const store = { id: storeRow.id, nombre: storeRow.nombre, plan: storeRow.plan, temaPremium: !!storeRow.tema_premium };
  const bloqueados = productosBloqueados(sid); // productos de biblioteca gratuitos (estructura no editable)
  const products = (db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[]).map((p) => ({
    id: p.id, nombre: p.nombre, precio: p.precio, precioPromo: Number(p.precio_promo) || 0, color: p.color, txt: p.txt, bloqueado: bloqueados.has(String(p.id)),
    tipo: p.tipo || 'producto', duracion: p.duracion || '', sku: p.sku || '', plantillaId: p.plantilla_id || '',
    despachoProveedor: p.despacho_proveedor || '', variantesFuente: p.variantes_fuente || '',
    reglas: pj(p.reglas as string, []), fotos: pj(p.fotos as string, []), fotosSubidas: pj(p.fotos_subidas as string, []),
    descripcion: p.descripcion || '', caracteristicas: p.caracteristicas || '', mensajeInicial: p.mensaje_inicial || '',
    faqs: pj(p.faqs as string, []), testimonios: pj(p.testimonios as string, []), modosUso: p.modos_uso || '',
    videos: pj(p.videos as string, []), mensajeBloques: pj(p.mensaje_bloques as string, []), mensajes: mensajesInicialesDe(p),
    bundles: pj(p.bundles as string, []), opciones: pj(p.opciones as string, []),
    contenidoPaquete: p.contenido_paquete || '', disparador: p.disparador || '', mensajeInicialActivo: p.mensaje_inicial_activo !== 0,
    variantes: (db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY orden').all(p.id as string) as Record<string, unknown>[]).map((v) => ({
      id: v.id, label: v.label, stock: v.stock, fotos: v.fotos, fotosSubidas: pj(v.fotos_subidas as string, []), sku: v.sku || '',
      refs: pj<Record<string, string>>(v.refs as string, {}),
    })),
  }));
  const promos = (db.prepare('SELECT * FROM promos WHERE store_id = ?').all(sid) as Record<string, unknown>[]).map((p) => ({
    id: p.id, tipo: p.tipo, titulo: p.titulo, desc: p.descripcion, vigencia: p.vigencia, activa: !!p.activa,
  }));
  const itemsTienda = itemsPorPedido(sid);
  const novTienda = novedadesPorPedido(sid);
  const orders = (db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY numero DESC').all(sid) as Record<string, unknown>[]).map((o) => ({
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, departamento: o.departamento || '', effiRemision: o.effi_remision || '', origen: o.origen || '', leadId: o.lead_id || '', guiaAviso: o.guia_aviso ? pj(String(o.guia_aviso), null) : null, tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, wooId: o.woo_id || '', dropiOrderId: o.dropi_order_id || '', guiaUrl: o.guia_url || '', guiaImg: o.guia_img || '', effiGuiaCreada: !!o.effi_guia, effiGuiaTx: o.effi_guia ? String(pj<Record<string, unknown>>(String(o.effi_guia), {}).id_transaccion || '') : '', despachoProveedor: o.despacho_proveedor || '', estadoWoo: o.estado_woo || '', effiDevolucion: o.effi_devolucion || '', confirmacion: o.confirmacion || '', confirmacionError: o.confirmacion_error || '', shopifyEnviado: !!o.shopify_fulfilled, envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
    items: itemsTienda.get(o.id as string) || [], novedad: novTienda.get(o.id as string) || null,
  }));
  // Resumen (sin todos los mensajes de cada chat): la carga inicial del panel no
  // debe descargar la conversación completa de cientos de chats. Cada chat carga
  // sus mensajes al abrirlo (GET /leads/:id/mensajes).
  const leads = listarLeads(sid, true);
  const assistant = db.prepare('SELECT instrucciones, reglas, nombre, seguimiento_on, estilo FROM assistants WHERE store_id = ?').get(sid) as { instrucciones: string; reglas: string; nombre: string; seguimiento_on: number; estilo: string } | undefined;
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
    assistant: { instrucciones: assistant?.instrucciones || '', reglas: pj(assistant?.reglas || '[]', []), nombre: assistant?.nombre || '', seguimientoActivo: !!assistant?.seguimiento_on, estilo: pj(assistant?.estilo || '', {}) },
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

// Ítems de TODOS los pedidos de la tienda en una sola consulta (antes era una
// consulta por pedido en cada sondeo de 5 s, y con miles de pedidos frenaba el
// servidor, que es el mismo que procesa los mensajes de WhatsApp).
function itemsPorPedido(sid: string): Map<string, { qty: number; nombre: string; precio: number }[]> {
  const m = new Map<string, { qty: number; nombre: string; precio: number }[]>();
  const rows = db.prepare('SELECT i.order_id, i.qty, i.nombre, i.precio FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.store_id = ?').all(sid) as { order_id: string; qty: number; nombre: string; precio: number }[];
  for (const r of rows) { const l = m.get(r.order_id); const it = { qty: r.qty, nombre: r.nombre, precio: r.precio }; if (l) l.push(it); else m.set(r.order_id, [it]); }
  return m;
}

// Mensajes completos de un lead (para el conversación).
const mapMensaje = (m: Record<string, unknown>) => ({
  id: m.id, de: m.de, texto: m.texto, hora: horaBogota(m.created_at), createdAt: m.created_at,
  tipo: m.tipo || 'texto', mediaUrl: m.media_url || null, mediaMime: m.media_mime || null, mediaNombre: m.media_nombre || null, estado: m.estado || '', error: m.error || '',
  // Respuesta citada (si el cliente respondió citando un mensaje).
  citaTexto: m.cita_texto || '', citaDe: m.cita_de || '',
});
const mensajesDe = (leadId: string) =>
  (db.prepare('SELECT id, de, texto, created_at, tipo, media_url, media_mime, media_nombre, estado, error, cita_texto, cita_de FROM messages WHERE lead_id = ? ORDER BY created_at').all(leadId) as Record<string, unknown>[]).map(mapMensaje);

/**
 * Lista de leads para el Inbox. En modo `resumen` NO trae todos los mensajes de
 * cada chat (eso pesa MB y volvía lento el Inbox al recargarse cada pocos
 * segundos): solo el último mensaje + cuántos van sin responder. Solo el chat
 * ABIERTO trae su conversación completa, para que se actualice en vivo.
 */
// "No leídos" estilo WhatsApp: mensajes del cliente que llegaron después de la última
// vez que alguien del equipo abrió el chat (aunque el bot ya los haya respondido).
try {
  db.exec("ALTER TABLE leads ADD COLUMN visto_equipo_at TEXT");
  db.exec("UPDATE leads SET visto_equipo_at = datetime('now')"); // arranque: lo viejo cuenta como leído
} catch { /* ya existe */ }
const marcarVisto = (sid: string, leadId: string) => db.prepare("UPDATE leads SET visto_equipo_at = datetime('now') WHERE id = ? AND store_id = ?").run(leadId, sid);

function listarLeads(sid: string, resumen: boolean, abierto?: string) {
  if (abierto) marcarVisto(sid, abierto); // el chat abierto en pantalla se va leyendo
  // Una sola consulta: datos del chat + su último mensaje + cuántos mensajes del
  // cliente no ha leído el equipo (antes eran 2 consultas por chat en cada sondeo).
  const rows = db.prepare(resumen
    ? `SELECT l.*,
         (SELECT texto FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_texto,
         (SELECT tipo FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_tipo,
         (SELECT created_at FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_at,
         (SELECT created_at FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente' ORDER BY m.created_at DESC LIMIT 1) AS ult_cliente_at,
         (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente'
            AND m.created_at > COALESCE(l.visto_equipo_at, '')) AS sin_responder
       FROM leads l WHERE l.store_id = ? ORDER BY l.created_at DESC`
    : 'SELECT * FROM leads WHERE store_id = ? ORDER BY created_at DESC').all(sid) as Record<string, unknown>[];
  const etiquetaMedia: Record<string, string> = { image: '📷 Foto', audio: '🎤 Nota de voz', video: '🎬 Video', document: '📄 Documento' };
  return rows.map((l) => {
    const base = {
      id: l.id, nombre: l.nombre, tel: l.tel, etapa: l.etapa, asignado: l.asignado,
      etiqueta: l.etiqueta || '', canal: l.canal || 'whatsapp', notaInterna: l.nota_interna || '',
      anuncio: l.ad_ref ? pj<Record<string, unknown>>(l.ad_ref as string, null as never) : null,
      promosOptin: Number(l.promos_optin) === 1,
      // Ventana de 24 h (solo WhatsApp): el Inbox bloquea la caja de escribir cuando vence.
      ventana24h: process.env.WA_BLOQUEO_24H !== 'off' && (!l.canal || l.canal === 'whatsapp') && !String(l.wa_id || l.tel || '').startsWith('web:'),
      ultClienteIso: l.ult_cliente_at ?? (db.prepare("SELECT created_at FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(l.id as string) as { created_at: string } | undefined)?.created_at ?? null,
    };
    if (!resumen) return { ...base, mensajes: mensajesDe(l.id as string) };
    const esAbierto = !!abierto && String(l.id) === String(abierto);
    const hay = l.ult_at != null;
    return {
      ...base,
      mensajes: esAbierto ? mensajesDe(l.id as string) : [],
      ultimo: hay ? (String(l.ult_texto || '').trim() || etiquetaMedia[String(l.ult_tipo)] || '') : '', ultimoIso: hay ? l.ult_at : null,
      hora: hay ? horaBogota(l.ult_at) : '', sinResponder: Math.min(40, Number(l.sin_responder) || 0),
    };
  });
}

// ── Leads por estado (embudo) ─────────────────────────────────────────
// El estado se CALCULA de la conversación y los pedidos (venta > datos completos >
// faltan datos > interesado > preguntando); el dueño puede fijarlo a mano.
export const ESTADOS_LEAD = ['preguntando', 'interesado', 'faltan_datos', 'datos_completos', 'venta', 'perdido'] as const;
const likeAny = (col: string, pats: string[]) => '(' + pats.map((p) => `lower(${col}) LIKE '%${p}%'`).join(' OR ') + ')';
const INTENCION = ['precio', 'cuanto', 'cuánto', 'vale', 'valor', 'quiero', 'talla', 'color', 'envio', 'envío', 'comprar', 'compro', 'pedido', 'disponible', 'contraentrega', 'contra entrega', 'lo llevo', 'me lo', 'domicilio', 'pago'];
const PIDE_DATOS = ['dirección', 'direccion', 'nombre completo', 'ciudad', 'barrio', 'punto de referencia'];
const DIO_DATOS = ['calle', 'carrera', 'cra ', 'cll', 'barrio', 'avenida', 'apto', 'apartamento', 'conjunto', 'manzana', 'diagonal', 'transversal'];

// El cálculo revisa todas las conversaciones: se guarda 15 s por tienda para que
// varias pestañas abiertas no lo repitan (se invalida al mover un lead a mano).
const cacheEstados = new Map<string, { t: number; leads: unknown[] }>();
api.get('/leads/estados', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const c = cacheEstados.get(sid);
  if (c && Date.now() - c.t < 15_000) return res.json({ leads: c.leads });
  const rows = db.prepare(`SELECT l.id, l.nombre, l.tel, l.canal, l.asignado, l.estado_manual, l.created_at,
      (SELECT texto FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_texto,
      (SELECT tipo FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_tipo,
      (SELECT created_at FROM messages m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ult_at,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id) AS n_msgs,
      EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.de != 'cliente' AND (lower(m.texto) LIKE '%resumen de tu pedido%' OR lower(m.texto) LIKE '%order summary%')) AS resumen,
      EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.de != 'cliente' AND ${likeAny('m.texto', PIDE_DATOS)}) AS pidio_datos,
      EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente' AND ${likeAny('m.texto', DIO_DATOS)}) AS dio_datos,
      EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente' AND ${likeAny('m.texto', INTENCION)}) AS intencion
    FROM leads l WHERE l.store_id = ?`).all(sid) as Record<string, unknown>[];
  rows.sort((a, b) => String(b.ult_at || b.created_at).localeCompare(String(a.ult_at || a.created_at)));
  // Pedidos de la tienda en UNA consulta: por chat (lead_id) y por celular (últimos 10 dígitos).
  const diez = (t: unknown) => String(t || '').replace(/\D/g, '').slice(-10);
  const porLead = new Map<string, string>(); const porTel = new Map<string, string>();
  for (const o of db.prepare("SELECT lead_id, tel, numero, total, estado FROM orders WHERE store_id = ? AND estado != 'Cancelado' ORDER BY created_at").all(sid) as Record<string, unknown>[]) {
    const v = `${o.numero}|${o.total}|${o.estado}`;
    if (o.lead_id) porLead.set(String(o.lead_id), v);
    if (diez(o.tel).length >= 7) porTel.set(diez(o.tel), v);
  }
  for (const l of rows) l.pedido = porLead.get(String(l.id)) || (diez(l.tel).length >= 7 ? porTel.get(diez(l.tel)) : undefined) || '';
  const etiquetaMedia: Record<string, string> = { image: '📷 Foto', audio: '🎤 Nota de voz', video: '🎬 Video', document: '📄 Documento' };
  const leads = rows.map((l) => {
    const [num, total, estadoPedido] = String(l.pedido || '').split('|');
    let auto: (typeof ESTADOS_LEAD)[number] = 'preguntando';
    if (l.pedido) auto = 'venta';
    else if (l.resumen) auto = 'datos_completos';
    else if (l.pidio_datos || l.dio_datos) auto = 'faltan_datos';
    else if (l.intencion) auto = 'interesado';
    const manual = String(l.estado_manual || '');
    // Una venta real siempre gana; si no, manda lo que el dueño fijó a mano.
    const estado = auto === 'venta' ? 'venta' : (ESTADOS_LEAD as readonly string[]).includes(manual) ? manual : auto;
    return {
      id: l.id, nombre: l.nombre, tel: l.tel, canal: l.canal || 'whatsapp', asignado: l.asignado,
      estado, auto, manual: !!manual && estado === manual && manual !== auto,
      ultimo: l.ult_at ? (String(l.ult_texto || '').trim() || etiquetaMedia[String(l.ult_tipo)] || '') : '',
      ultimoIso: l.ult_at || l.created_at, hora: l.ult_at ? horaBogota(l.ult_at) : '', mensajes: Number(l.n_msgs) || 0,
      pedido: num ? { numero: Number(num), total: Number(total) || 0, estado: estadoPedido } : null,
    };
  });
  cacheEstados.set(sid, { t: Date.now(), leads });
  res.json({ leads });
});

api.post('/leads/:id/estado', requireAuth, requireStore, (req, res) => {
  const e = String(req.body?.estado || '');
  if (e && !(ESTADOS_LEAD as readonly string[]).includes(e)) return res.status(400).json({ error: 'Estado no válido.' });
  const r = db.prepare('UPDATE leads SET estado_manual = ? WHERE id = ? AND store_id = ?').run(e, req.params.id, req.user!.storeId);
  if (!r.changes) return res.status(404).json({ error: 'Chat no encontrado.' });
  cacheEstados.delete(req.user!.storeId!);
  res.json({ ok: true });
});

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
  marcarVisto(req.user!.storeId!, req.params.id);
  res.json({ mensajes: mensajesDe(req.params.id) });
});

// Pedidos en vivo (para refrescar sin recargar toda la tienda).
api.get('/orders', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const items = itemsPorPedido(sid);
  const novs = novedadesPorPedido(sid);
  const orders = (db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY numero DESC').all(sid) as Record<string, unknown>[]).map((o) => ({
    id: 'DF-' + o.numero, rowId: o.id, cliente: o.cliente, ciudad: o.ciudad, departamento: o.departamento || '', effiRemision: o.effi_remision || '', origen: o.origen || '', leadId: o.lead_id || '', guiaAviso: o.guia_aviso ? pj(String(o.guia_aviso), null) : null, tel: o.tel, direccion: o.direccion,
    estado: o.estado, transportadora: o.transportadora, guia: o.guia || undefined, wooId: o.woo_id || '', dropiOrderId: o.dropi_order_id || '', guiaUrl: o.guia_url || '', guiaImg: o.guia_img || '', effiGuiaCreada: !!o.effi_guia, effiGuiaTx: o.effi_guia ? String(pj<Record<string, unknown>>(String(o.effi_guia), {}).id_transaccion || '') : '', despachoProveedor: o.despacho_proveedor || '', estadoWoo: o.estado_woo || '', effiDevolucion: o.effi_devolucion || '', confirmacion: o.confirmacion || '', confirmacionError: o.confirmacion_error || '', shopifyEnviado: !!o.shopify_fulfilled, envio: o.envio, nota: o.nota, total: o.total, createdAt: o.created_at,
    items: items.get(o.id as string) || [], novedad: novs.get(o.id as string) || null,
  }));
  res.json({ orders });
});

// ── Estadísticas / Rendimiento ────────────────────────────────────────
// Agregaciones de chats, campañas (anuncios) y ventas en un rango de fechas.
// Fechas en zona horaria de Colombia (created_at se guarda en UTC → -5h).
api.get('/stats', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD
  const reFecha = /^\d{4}-\d{2}-\d{2}$/;
  let desde = String(req.query.desde || '');
  let hasta = String(req.query.hasta || '');
  if (!reFecha.test(desde)) desde = hoy;
  if (!reFecha.test(hasta)) hasta = hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  // BETWEEN sobre la fecha local (Bogotá) del registro.
  const F = "date(created_at, '-5 hours')";
  const FO = "date(o.created_at, '-5 hours')";

  // Valor real de un pedido = el TOTAL que paga el cliente (o.total), que ya
  // contempla combos/promos (ej. "3 x $99.900"). Solo si no hay total guardado se
  // cae a la suma de ítems + envío. NUNCA cantidad × precio (triplicaría un combo).
  const VAL = "(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END)";
  const num = (r: unknown) => Number((r as { n?: number })?.n || 0);
  const chats = num(db.prepare(`SELECT COUNT(*) n FROM leads WHERE store_id = ? AND ${F} BETWEEN ? AND ?`).get(sid, desde, hasta));
  const chatsAnuncio = num(db.prepare(`SELECT COUNT(*) n FROM leads WHERE store_id = ? AND ad_id != '' AND ${F} BETWEEN ? AND ?`).get(sid, desde, hasta));
  const pedidos = num(db.prepare(`SELECT COUNT(*) n FROM orders o WHERE store_id = ? AND ${FO} BETWEEN ? AND ?`).get(sid, desde, hasta));
  const ventas = Number((db.prepare(
    `SELECT COALESCE(SUM(${VAL}),0) t FROM orders o WHERE o.store_id = ? AND ${FO} BETWEEN ? AND ?`,
  ).get(sid, desde, hasta) as { t: number }).t);

  // Chats por canal.
  const porCanal = (db.prepare(
    `SELECT COALESCE(NULLIF(canal,''),'whatsapp') canal, COUNT(*) n FROM leads WHERE store_id = ? AND ${F} BETWEEN ? AND ? GROUP BY canal ORDER BY n DESC`,
  ).all(sid, desde, hasta) as { canal: string; n: number }[]);

  // ── Estadística de anuncios: chats Y ventas por pauta ──
  // Chats por anuncio (en el rango).
  const chatsPorAd = new Map<string, number>();
  for (const r of db.prepare(
    `SELECT ad_id, COUNT(*) n FROM leads WHERE store_id = ? AND ad_id != '' AND ${F} BETWEEN ? AND ? GROUP BY ad_id`,
  ).all(sid, desde, hasta) as { ad_id: string; n: number }[]) chatsPorAd.set(r.ad_id, r.n);
  // Datos del anuncio (titular, miniatura, link…): el ref más reciente de cada uno.
  const refDeAd = new Map<string, string>();
  const telAAd = new Map<string, string>(); // teléfono normalizado → anuncio (para atribuir ventas)
  const normTel = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);
  for (const l of db.prepare("SELECT tel, wa_id, ad_id, ad_ref FROM leads WHERE store_id = ? AND ad_id != '' ORDER BY created_at").all(sid) as { tel: string; wa_id: string; ad_id: string; ad_ref: string }[]) {
    refDeAd.set(l.ad_id, l.ad_ref);
    const k = normTel(l.tel) || normTel(l.wa_id);
    if (k.length >= 7) telAAd.set(k, l.ad_id); // el último que clicó ese anuncio con ese teléfono
  }
  // Ventas atribuidas: cada pedido del rango se asigna al anuncio del que vino su
  // cliente. Se usa el anuncio guardado en el pedido (enlace exacto al chat) y, si
  // el pedido es viejo y no lo tiene, se cae al emparejamiento por teléfono.
  const ventasPorAd = new Map<string, number>();
  const pedidosPorAd = new Map<string, number>();
  let ventasAnuncioTotal = 0;
  for (const o of db.prepare(
    `SELECT o.ad_id adId, o.ad_ref adRef, o.tel tel, ${VAL} val FROM orders o WHERE o.store_id = ? AND ${FO} BETWEEN ? AND ?`,
  ).all(sid, desde, hasta) as { adId: string; adRef: string; tel: string; val: number }[]) {
    const ad = o.adId || telAAd.get(normTel(o.tel));
    if (!ad) continue;
    if (o.adRef && !refDeAd.has(ad)) refDeAd.set(ad, o.adRef); // por si el anuncio ya no tiene chats en el rango
    ventasPorAd.set(ad, (ventasPorAd.get(ad) || 0) + o.val);
    pedidosPorAd.set(ad, (pedidosPorAd.get(ad) || 0) + 1);
    ventasAnuncioTotal += o.val;
  }
  // Une los anuncios con chats y/o ventas en el rango.
  const idsAnuncios = new Set<string>([...chatsPorAd.keys(), ...ventasPorAd.keys()]);
  const topAnuncios = [...idsAnuncios].map((id) => {
    const a = pj<{ titular?: string; canal?: string; url?: string; media?: string }>(refDeAd.get(id) || '', {});
    return {
      id,
      titular: a.titular || 'Anuncio',
      canal: a.canal || '',
      url: a.url || '',
      media: a.media || '',
      chats: chatsPorAd.get(id) || 0,
      ventas: ventasPorAd.get(id) || 0,
      pedidos: pedidosPorAd.get(id) || 0,
    };
  }).sort((x, y) => y.chats - x.chats || y.ventas - x.ventas).slice(0, 20);

  // Series diarias (para los gráficos): chats, pedidos y ventas por día.
  const serieChats = new Map<string, number>();
  for (const r of db.prepare(`SELECT ${F} d, COUNT(*) n FROM leads WHERE store_id = ? AND ${F} BETWEEN ? AND ? GROUP BY d`).all(sid, desde, hasta) as { d: string; n: number }[]) serieChats.set(r.d, r.n);
  const seriePedidos = new Map<string, number>();
  for (const r of db.prepare(`SELECT ${FO} d, COUNT(*) n FROM orders o WHERE store_id = ? AND ${FO} BETWEEN ? AND ? GROUP BY d`).all(sid, desde, hasta) as { d: string; n: number }[]) seriePedidos.set(r.d, r.n);
  const serieVentas = new Map<string, number>();
  for (const r of db.prepare(`SELECT ${FO} d, COALESCE(SUM(${VAL}),0) v FROM orders o WHERE o.store_id = ? AND ${FO} BETWEEN ? AND ? GROUP BY d`).all(sid, desde, hasta) as { d: string; v: number }[]) serieVentas.set(r.d, r.v);

  // Lista continua de días del rango (con ceros donde no hubo actividad). Tope 366.
  const dias: { fecha: string; chats: number; pedidos: number; ventas: number }[] = [];
  const dIni = new Date(desde + 'T12:00:00Z');
  const dFin = new Date(hasta + 'T12:00:00Z');
  for (let t = dIni.getTime(), i = 0; t <= dFin.getTime() && i < 366; t += 86400000, i++) {
    const f = new Date(t).toISOString().slice(0, 10);
    dias.push({ fecha: f, chats: serieChats.get(f) || 0, pedidos: seriePedidos.get(f) || 0, ventas: serieVentas.get(f) || 0 });
  }

  res.json({
    rango: { desde, hasta },
    totales: {
      chats,
      chatsAnuncio,
      chatsOrganicos: Math.max(0, chats - chatsAnuncio),
      pedidos,
      ventas,
      ventasAnuncio: ventasAnuncioTotal, // ventas atribuidas a anuncios (por teléfono)
      ticketPromedio: pedidos ? Math.round(ventas / pedidos) : 0,
      conversion: chats ? Math.round((pedidos / chats) * 1000) / 10 : 0, // % con 1 decimal
    },
    serie: dias,
    porCanal,
    topAnuncios,
  });
});

// Conversión por anuncio: chats → respondieron → pedidos → despachados → entregados, ventas y productos.
api.get('/stats/anuncios', requireAuth, requireStore, async (req, res) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let desde = String(req.query.desde || ''); let hasta = String(req.query.hasta || '');
  if (!re.test(desde)) desde = hoy;
  if (!re.test(hasta)) hasta = hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const { conversionPorAnuncio } = await import('./statsAnuncios.js');
  const { estadoInsights } = await import('./metaInsights.js');
  res.json({ rango: { desde, hasta }, ...conversionPorAnuncio(req.user!.storeId!, desde, hasta), meta: estadoInsights(req.user!.storeId!) });
});
// Trae ya el gasto/impresiones/clics de Meta (hasta 90 días atrás).
// Análisis con filtros cruzados (canal, origen, producto, campaña, anuncio, ciudad, estado).
api.get('/stats/analisis', requireAuth, requireStore, async (req, res) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let desde = String(req.query.desde || ''); let hasta = String(req.query.hasta || '');
  if (!re.test(desde)) desde = hoy;
  if (!re.test(hasta)) hasta = hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const q = (k: string) => String(req.query[k] || '').slice(0, 120) || undefined;
  const { analisis } = await import('./statsAnalisis.js');
  res.json(analisis(req.user!.storeId!, desde, hasta, { canal: q('canal'), origen: q('origen'), producto: q('producto'), campana: q('campana'), ad: q('ad'), ciudad: q('ciudad'), estado: q('estado') }));
});

// ── Extensión de Chrome "DealFlow x Shopify" ──
// Códigos de conexión (los administra el dueño desde Integraciones → Shopify).
api.get('/ext/codigos', requireAuth, requireStore, requireOwner, async (req, res) => {
  res.json({ codigos: (await import('./extShopify.js')).listarCodigos(req.user!.storeId!) });
});
api.post('/ext/codigos', requireAuth, requireStore, requireOwner, async (req, res) => {
  res.json((await import('./extShopify.js')).crearCodigo(req.user!.storeId!, String(req.body?.nombre || '')));
});
api.delete('/ext/codigos/:id', requireAuth, requireStore, requireOwner, async (req, res) => {
  (await import('./extShopify.js')).borrarCodigo(req.user!.storeId!, req.params.id);
  res.json({ ok: true });
});
// Lo que llama la extensión (autenticada con el código, sin cookie de sesión).
const tiendaExt = async (req: { headers: Record<string, unknown> }) => (await import('./extShopify.js')).tiendaDeCodigo(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim());
api.get('/ext/yo', async (req, res) => {
  const t = await tiendaExt(req);
  if (!t) return res.status(401).json({ error: 'Código no válido. Genera uno en DealFlow → Integraciones → Shopify → Extensión.' });
  res.json({ tienda: t.nombre });
});
api.post('/ext/shopify/pedido', async (req, res) => {
  const t = await tiendaExt(req);
  if (!t) return res.status(401).json({ error: 'Código no válido. Genera uno en DealFlow → Integraciones → Shopify → Extensión.' });
  const r = await (await import('./extShopify.js')).recibirPedido(t.storeId, req.body || {});
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ...r, id: `DF-${r.numero}`, tienda: t.nombre });
});

// Anuncios de Meta con su producto vinculado (para vincular a mano desde Integraciones).
api.get('/ads/anuncios', requireAuth, requireStore, async (req, res) => {
  const { anunciosConProducto } = await import('./metaInsights.js');
  res.json({ anuncios: anunciosConProducto(req.user!.storeId!) });
});
api.post('/stats/anuncios/sincronizar', requireAuth, requireStore, async (req, res) => {
  const { sincronizarInsights, estadoInsights } = await import('./metaInsights.js');
  const r = await sincronizarInsights(req.user!.storeId!, Math.min(90, Math.max(1, Number(req.body?.dias) || 30)));
  if ('error' in r) return res.status(400).json({ error: r.error, meta: estadoInsights(req.user!.storeId!) });
  res.json({ ok: true, filas: r.filas, meta: estadoInsights(req.user!.storeId!) });
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
    if (req.body?.precioPromo !== undefined) db.prepare('UPDATE products SET precio_promo = ? WHERE id = ?').run(Math.max(0, Math.round(Number(req.body.precioPromo) || 0)), req.params.id);
    if (req.body?.sku !== undefined) db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(String(req.body.sku).trim(), req.params.id);
    return res.json({ ok: true, bloqueado: true });
  }
  const { nombre, precio, reglas, fotosSubidas, descripcion, caracteristicas, mensajeInicial, faqs, testimonios, modosUso, videos, mensajeBloques, bundles, opciones, contenidoPaquete, disparador, mensajeInicialActivo } = req.body || {};
  if (Array.isArray(bundles)) db.prepare('UPDATE products SET bundles = ? WHERE id = ?').run(j(bundles), req.params.id);
  if (Array.isArray(opciones)) {
    db.prepare('UPDATE products SET opciones = ? WHERE id = ?').run(j(opciones), req.params.id);
    // Al cambiar las opciones, las variantes se ajustan SOLAS al producto cartesiano
    // exacto (crea las que falten, quita repetidas/sobrantes). Sin duplicar.
    sincronizarVariantes(req.params.id);
  }
  if (contenidoPaquete !== undefined) db.prepare('UPDATE products SET contenido_paquete = ? WHERE id = ?').run(String(contenidoPaquete), req.params.id);
  if (disparador !== undefined) db.prepare('UPDATE products SET disparador = ? WHERE id = ?').run(String(disparador), req.params.id);
  if (mensajeInicialActivo !== undefined) db.prepare('UPDATE products SET mensaje_inicial_activo = ? WHERE id = ?').run(mensajeInicialActivo ? 1 : 0, req.params.id);
  if (modosUso !== undefined) db.prepare('UPDATE products SET modos_uso = ? WHERE id = ?').run(String(modosUso), req.params.id);
  if (Array.isArray(testimonios)) db.prepare('UPDATE products SET testimonios = ? WHERE id = ?').run(j(testimonios), req.params.id);
  if (Array.isArray(videos)) db.prepare('UPDATE products SET videos = ? WHERE id = ?').run(j(videos), req.params.id);
  if (Array.isArray(mensajeBloques)) {
    db.prepare('UPDATE products SET mensaje_bloques = ? WHERE id = ?').run(j(mensajeBloques), req.params.id);
    // Cliente viejo que solo conoce un mensaje: lo reflejamos en el primero de la lista.
    const fila = db.prepare('SELECT mensajes_iniciales FROM products WHERE id = ?').get(req.params.id) as { mensajes_iniciales: string } | undefined;
    const lista = pj<{ bloques: unknown[] }[]>(fila?.mensajes_iniciales || '', []);
    if (lista.length) { lista[0].bloques = mensajeBloques; db.prepare('UPDATE products SET mensajes_iniciales = ? WHERE id = ?').run(j(lista), req.params.id); }
  }
  // Varios mensajes iniciales: se guarda la lista y mensaje_bloques queda con el
  // principal (lo usan la IA como guion y la imagen de referencia del producto).
  if (req.body?.mensajes !== undefined) {
    const lista = normalizarMensajes(req.body.mensajes);
    if (lista) {
      db.prepare('UPDATE products SET mensajes_iniciales = ?, mensaje_bloques = ? WHERE id = ?').run(j(lista), j(principal(lista).bloques), req.params.id);
    }
  }
  if (nombre !== undefined) db.prepare('UPDATE products SET nombre = ? WHERE id = ?').run(String(nombre), req.params.id);
  if (descripcion !== undefined) db.prepare('UPDATE products SET descripcion = ? WHERE id = ?').run(String(descripcion), req.params.id);
  if (caracteristicas !== undefined) db.prepare('UPDATE products SET caracteristicas = ? WHERE id = ?').run(String(caracteristicas), req.params.id);
  if (mensajeInicial !== undefined) db.prepare('UPDATE products SET mensaje_inicial = ? WHERE id = ?').run(String(mensajeInicial), req.params.id);
  if (req.body?.tipo !== undefined) db.prepare('UPDATE products SET tipo = ? WHERE id = ?').run(req.body.tipo === 'servicio' ? 'servicio' : 'producto', req.params.id);
  if (req.body?.duracion !== undefined) db.prepare('UPDATE products SET duracion = ? WHERE id = ?').run(String(req.body.duracion), req.params.id);
  if (req.body?.sku !== undefined) db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(String(req.body.sku).trim(), req.params.id);
  if (req.body?.despachoProveedor !== undefined) {
    const dp = req.body.despachoProveedor === 'dropi' || req.body.despachoProveedor === 'effi' ? req.body.despachoProveedor : '';
    db.prepare('UPDATE products SET despacho_proveedor = ? WHERE id = ?').run(dp, req.params.id);
  }
  if (Array.isArray(faqs)) db.prepare('UPDATE products SET faqs = ? WHERE id = ?').run(j(faqs), req.params.id);
  if (precio !== undefined) db.prepare('UPDATE products SET precio = ? WHERE id = ?').run(Number(precio) || 0, req.params.id);
  if (req.body?.precioPromo !== undefined) db.prepare('UPDATE products SET precio_promo = ? WHERE id = ?').run(Math.max(0, Math.round(Number(req.body.precioPromo) || 0)), req.params.id);
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

/**
 * Sincroniza las variantes de un producto para que sean EXACTAMENTE el producto
 * cartesiano de sus Opciones (talla × color × …): ni de más ni de menos.
 *  - Clave canónica = tokens del label ordenados alfabéticamente, así "M · Verde"
 *    y "Verde · M" (o con otra separación) cuentan como LA MISMA variante.
 *  - Crea las combinaciones que falten.
 *  - Deja UNA sola por combinación (borra repetidas), conservando la que ya tenga
 *    SKU (para no perder el vínculo con Dropi/Effi) o, si no, la de más stock.
 *  - Borra las variantes "huérfanas" (que ya no corresponden a ninguna opción).
 * Si el producto no tiene opciones con valores, NO toca nada (variantes manuales).
 * Es idempotente: correrla dos veces no cambia nada.
 */
function sincronizarVariantes(productId: string): { creadas: number; eliminadas: number; total: number } {
  const prod = db.prepare("SELECT opciones, COALESCE(variantes_fuente,'') fuente FROM products WHERE id = ?").get(productId) as { opciones: string; fuente: string } | undefined;
  if (!prod) return { creadas: 0, eliminadas: 0, total: 0 };
  // Variantes definidas por Dropi (sincronizadas desde su ID): no se arman combinando opciones.
  if (prod.fuente === 'dropi') return { creadas: 0, eliminadas: 0, total: (db.prepare('SELECT COUNT(*) n FROM variants WHERE product_id = ?').get(productId) as { n: number }).n };
  const grupos = pj<{ nombre: string; valores: { valor: string }[] }[]>(prod.opciones, []);
  const conValores = grupos.filter((g) => (g.valores || []).some((v) => (v.valor || '').trim()));
  const actual = (db.prepare('SELECT COUNT(*) n FROM variants WHERE product_id = ?').get(productId) as { n: number }).n;
  if (conValores.length < 1) return { creadas: 0, eliminadas: 0, total: actual }; // sin opciones: no tocar variantes manuales

  // Producto cartesiano (valores únicos por grupo).
  let combos: string[][] = [[]];
  for (const g of conValores) {
    const vals = [...new Set((g.valores || []).map((v) => (v.valor || '').trim()).filter(Boolean))];
    combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  }
  combos = combos.filter((c) => c.length);
  if (!combos.length) return { creadas: 0, eliminadas: 0, total: actual };

  const canon = (label: string) => String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean).sort().join('|');
  const labelDe = (combo: string[]) => combo.join(' · ');
  // clave canónica → label "bonito" objetivo
  const objetivo = new Map<string, string>();
  for (const combo of combos) objetivo.set(canon(labelDe(combo)), labelDe(combo));

  // "sku" aquí = tiene algún vínculo (legado o por integración), para no perderlo al quitar repetidas.
  const existentes = db.prepare("SELECT id, label, CASE WHEN COALESCE(sku,'') != '' OR COALESCE(refs,'{}') NOT IN ('{}','') THEN 'x' ELSE '' END sku, stock FROM variants WHERE product_id = ? ORDER BY orden")
    .all(productId) as { id: string; label: string; sku: string; stock: number }[];
  const porClave = new Map<string, typeof existentes>();
  for (const v of existentes) { const k = canon(v.label); if (!porClave.has(k)) porClave.set(k, []); porClave.get(k)!.push(v); }

  let creadas = 0;
  let eliminadas = 0;
  let orden = (db.prepare('SELECT COALESCE(MAX(orden),0) AS o FROM variants WHERE product_id = ?').get(productId) as { o: number }).o;
  const insert = db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden) VALUES (?,?,?,0,0,?)');
  const del = db.prepare('DELETE FROM variants WHERE id = ?');

  const tx = db.transaction(() => {
    // 1) Cada combinación objetivo: asegurar exactamente UNA variante.
    for (const [clave] of objetivo) {
      const grupo = porClave.get(clave) || [];
      if (grupo.length === 0) { orden += 1; insert.run(uid(), productId, objetivo.get(clave)!, orden); creadas++; }
      else if (grupo.length > 1) {
        // Conservar la mejor (con SKU primero, luego más stock); borrar el resto.
        const ordenadas = [...grupo].sort((a, b) => (b.sku ? 1 : 0) - (a.sku ? 1 : 0) || (b.stock || 0) - (a.stock || 0));
        for (const dup of ordenadas.slice(1)) { del.run(dup.id); eliminadas++; }
      }
    }
    // 2) Huérfanas: variantes que ya no corresponden a ninguna combinación → borrar.
    for (const [clave, grupo] of porClave) {
      if (!objetivo.has(clave)) for (const v of grupo) { del.run(v.id); eliminadas++; }
    }
  });
  tx();
  return { creadas, eliminadas, total: objetivo.size };
}

// Sincroniza las variantes con las opciones (crea las que falten, quita repetidas
// y sobrantes). Es lo mismo que corre solo al guardar las opciones.
api.post('/products/:id/variants/generar', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  const prod = db.prepare('SELECT opciones FROM products WHERE id = ?').get(req.params.id) as { opciones: string } | undefined;
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado.' });
  const grupos = pj<{ nombre: string; valores: { valor: string }[] }[]>(prod.opciones, []);
  if (!grupos.some((g) => (g.valores || []).some((v) => (v.valor || '').trim()))) {
    return res.status(400).json({ error: 'Primero agrega las opciones del producto (ej. Talla, Color) con sus valores.' });
  }
  const r = sincronizarVariantes(req.params.id);
  if (req.user!.storeId === MASTER_STORE_ID) sincronizarSnapshotMaster(req.params.id);
  res.json({ ok: true, ...r });
});

api.patch('/variants/:id', requireAuth, requireStore, (req, res) => {
  const v = db.prepare('SELECT v.id, v.product_id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(req.params.id, req.user!.storeId) as { id: string; product_id: string } | undefined;
  if (!v) return res.status(404).json({ error: 'Variante no encontrada.' });
  const { stock, fotosSubidas, sku, integracion, ref } = req.body || {};
  if (stock !== undefined) db.prepare('UPDATE variants SET stock = ? WHERE id = ?').run(Math.max(0, Number(stock) || 0), req.params.id);
  if (Array.isArray(fotosSubidas)) db.prepare('UPDATE variants SET fotos_subidas = ? WHERE id = ?').run(j(fotosSubidas), req.params.id);
  if (sku !== undefined) db.prepare('UPDATE variants SET sku = ? WHERE id = ?').run(String(sku).trim(), req.params.id);
  // Referencia POR INTEGRACIÓN (dropi | effi | shopify): se guarda en refs.<integracion>.
  if (integracion && ['dropi', 'effi', 'shopify'].includes(String(integracion))) {
    const fila = db.prepare('SELECT refs FROM variants WHERE id = ?').get(req.params.id) as { refs: string } | undefined;
    const refs = pj<Record<string, string>>(fila?.refs || '{}', {});
    refs[String(integracion)] = String(ref ?? '').trim();
    db.prepare('UPDATE variants SET refs = ? WHERE id = ?').run(JSON.stringify(refs), req.params.id);
  }
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
// Mensajes al cliente por cambio de estado: en el idioma del asistente (ver idioma.ts).

// Todos los estados posibles (incluye Cancelado). El dueño puede cambiar de
// cualquiera a cualquiera; no es un flujo forzado sin retroceso.
const ESTADOS_VALIDOS = ESTADOS_PEDIDO;

api.post('/orders/:rowId/advance', requireAuth, requireStore, async (req, res) => {
  const o = db.prepare('SELECT id, estado, numero, tel FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, req.user!.storeId) as
    | { id: string; estado: string; numero: number; tel: string }
    | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const idx = ESTADOS.indexOf(o.estado as (typeof ESTADOS)[number]);
  if (idx < 0 || idx >= ESTADOS.length - 1) return res.status(400).json({ error: 'Este pedido ya está entregado.' });
  const nuevo = ESTADOS[idx + 1];
  db.prepare('UPDATE orders SET estado = ? WHERE id = ?').run(nuevo, o.id);
  trazar(req.user!.storeId!, o.id, { etapa: 'estado', titulo: `Estado: ${o.estado} → ${nuevo}`, detalle: `Por ${req.user!.nombre}` });
  res.json({ estado: nuevo });

  // Avísale al cliente por WhatsApp del nuevo estado (y déjalo en el chat).
  const leadA = o.tel ? db.prepare("SELECT id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(req.user!.storeId, o.tel) as { id: string } | undefined : undefined;
  const msg = MSG_ESTADO[idiomaDe(req.user!.storeId!, leadA?.id)][nuevo]?.(o.numero);
  const { puedeEscribirle, contarProactivo } = await import('./calidad.js');
  if (msg && o.tel && puedeEscribirle(req.user!.storeId!, o.tel, leadA?.id).ok) {
    const lead = db.prepare("SELECT id, wa_id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(req.user!.storeId, o.tel) as { id: string; wa_id: string | null } | undefined;
    if (lead) db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'bot', msg);
    void sendWhatsappText(req.user!.storeId!, lead?.wa_id || o.tel, msg, o.tel).then((r) => { if (r.ok) contarProactivo(req.user!.storeId!, o.tel); }).catch(() => {});
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
  trazar(sid, o.id, { etapa: 'estado', nivel: nuevo === 'Cancelado' ? 'warn' : 'info', titulo: `Estado: ${o.estado} → ${nuevo}`, detalle: `Por ${req.user!.nombre}` });
  res.json({ estado: nuevo });
  // Solo notificamos cuando el estado tiene un mensaje pensado para el cliente.
  const leadB = o.tel ? db.prepare("SELECT id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(sid, o.tel) as { id: string } | undefined : undefined;
  const msg = MSG_ESTADO[idiomaDe(sid, leadB?.id)][nuevo]?.(o.numero);
  const cal = await import('./calidad.js');
  if (msg && o.tel && cal.puedeEscribirle(sid, o.tel, leadB?.id).ok) {
    const lead = db.prepare("SELECT id, wa_id FROM leads WHERE store_id = ? AND tel = ? ORDER BY created_at DESC LIMIT 1").get(sid, o.tel) as { id: string; wa_id: string | null } | undefined;
    if (lead) db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'bot', msg);
    void sendWhatsappText(sid, lead?.wa_id || o.tel, msg, o.tel).then((r) => { if (r.ok) cal.contarProactivo(sid, o.tel); }).catch(() => {});
  }
});

// ── Calidad del número de WhatsApp ──
api.get('/calidad', requireAuth, requireStore, async (req, res) => {
  const { resumenCalidad } = await import('./calidad.js');
  res.json(resumenCalidad(req.user!.storeId!));
});
api.post('/calidad', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { guardarCalidadCfg } = await import('./calidad.js');
  const b = req.body || {};
  res.json(guardarCalidadCfg(req.user!.storeId!, 'avisarContacto' in b ? { avisarContacto: b.avisarContacto === true } : {}));
});

// ── Effi: rastreo, cobertura, devolución y recaudos ──
api.get('/orders/:rowId/rastreo', requireAuth, requireStore, async (req, res) => {
  const { rastrearGuia } = await import('./effiExtras.js');
  const r = await rastrearGuia(req.user!.storeId!, String(req.params.rowId), req.query.forzar ? 0 : 10);
  if (!Array.isArray(r)) return res.status(400).json({ error: r.error });
  res.json({ pasos: r });
});
api.get('/orders/:rowId/cobertura', requireAuth, requireStore, async (req, res) => {
  const { coberturaCiudad, textoCobertura } = await import('./effiExtras.js');
  const o = db.prepare('SELECT ciudad, departamento FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, req.user!.storeId) as { ciudad: string; departamento: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const cb = await coberturaCiudad(req.user!.storeId!, o.departamento || '', o.ciudad || '');
  if (!cb) return res.json({ cobertura: null });
  res.json({ cobertura: cb, texto: textoCobertura(cb) });
});
api.post('/orders/:rowId/devolucion-effi', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { registrarDevolucion } = await import('./effiExtras.js');
  const r = await registrarDevolucion(req.user!.storeId!, String(req.params.rowId));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
api.get('/effi-api/recaudos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { recaudosMes } = await import('./effiExtras.js');
  const r = await recaudosMes(req.user!.storeId!, String(req.query.mes || ''));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});

// ── Novedades de envío (Effi) ──
// Última revisión de novedades (con error de Effi si lo hubo) y las que no encontraron su pedido.
api.get('/novedades/estado', requireAuth, requireStore, async (req, res) => {
  const { estadoNovedades } = await import('./novedades.js');
  res.json(estadoNovedades(req.user!.storeId!));
});
api.post('/novedades/:id/ocultar', requireAuth, requireStore, async (req, res) => {
  const { ocultarNovedad } = await import('./novedades.js');
  res.json({ ok: ocultarNovedad(req.user!.storeId!, String(req.params.id)) });
});
api.post('/novedades/:id/vincular', requireAuth, requireStore, async (req, res) => {
  const { vincularNovedad } = await import('./novedades.js');
  const numero = Number(String(req.body?.numero || '').replace(/\D/g, ''));
  if (!numero) return res.status(400).json({ error: 'Escribe el número del pedido (ej. 1049).' });
  const r = vincularNovedad(req.user!.storeId!, String(req.params.id), numero);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
// Revisa ya en Effi (además del ciclo automático).
api.post('/novedades/sync', requireAuth, requireStore, async (req, res) => {
  const { sincronizarNovedades } = await import('./novedades.js');
  const r = await sincronizarNovedades(req.user!.storeId!, true);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, ...r });
});
// Envía a Effi la solución de una novedad (desde el pedido).
api.post('/novedades/:id/solucion', requireAuth, requireStore, async (req, res) => {
  const { enviarSolucion } = await import('./novedades.js');
  const b = req.body || {};
  const solucion = ['ofrecer', 'redireccionar', 'devolver'].includes(b.solucion) ? b.solucion : '';
  if (!solucion) return res.status(400).json({ error: 'Elige una solución.' });
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const r = await enviarSolucion(req.user!.storeId!, String(req.params.id), {
    solucion, fecha: s(b.fecha, 10), recibe: s(b.recibe, 50), direccion: s(b.direccion, 100), telefono: s(b.telefono, 40), nota: s(b.nota, 500), origen: 'panel',
  });
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
// Vuelve a escribirle al cliente sobre la novedad.
api.post('/novedades/:id/avisar', requireAuth, requireStore, async (req, res) => {
  const { avisarNovedadCliente } = await import('./novedades.js');
  const r = await avisarNovedadCliente(req.user!.storeId!, String(req.params.id));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});

// Elimina un pedido por completo (y sus ítems). No toca el pedido en Dropi/Woo:
// solo lo quita del panel de DealFlow.
api.delete('/orders/:rowId', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT id FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { id: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(o.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
  res.json({ ok: true });
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
  // Atribución: si hay un chat con ese teléfono que vino de un anuncio, lo copiamos.
  const telNorm = String(b.tel || '').replace(/\D/g, '').slice(-10);
  const adLead = telNorm.length >= 7
    ? db.prepare("SELECT ad_id, ad_ref FROM leads WHERE store_id = ? AND ad_id != '' AND replace(replace(replace(replace(tel,'+',''),' ',''),'-',''),'(','') LIKE ? ORDER BY created_at DESC LIMIT 1").get(sid, '%' + telNorm) as { ad_id: string; ad_ref: string } | undefined
    : undefined;
  // Chat del que sale el pedido (si se creó desde la conversación): para avisarle la guía ahí.
  const leadChat = b.leadId ? db.prepare('SELECT id, canal FROM leads WHERE id = ? AND store_id = ?').get(String(b.leadId), sid) as { id: string; canal: string } | undefined : undefined;
  const leadId = leadChat?.id || '';
  // Origen: el canal del chat del que se creó; si se creó a mano en Pedidos, 'manual'.
  const origen = leadChat ? (['messenger', 'instagram', 'web'].includes(leadChat.canal) ? leadChat.canal : 'whatsapp') : 'manual';
  db.prepare('INSERT INTO orders (id, store_id, numero, cliente, ciudad, tel, direccion, estado, total, departamento, envio, nota, ad_id, ad_ref, lead_id, origen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(oid, sid, numero, cliente, String(b.ciudad || ''), String(b.tel || ''), String(b.direccion || ''), 'Nuevo', total, String(b.departamento || ''), envio, String(b.nota || ''), adLead?.ad_id || '', adLead?.ad_ref || '', leadId, origen);
  for (const it of limpios) { const ids = idsDeItem(sid, it.nombre); db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio, product_id, variant_id) VALUES (?,?,?,?,?,?,?)').run(uid(), oid, it.qty, it.nombre, it.precio, ids.productId, ids.variantId); }
  registrarLog(sid, 'info', 'pedido', `Pedido manual DF-${numero} creado para ${cliente} (${limpios.map((i) => i.qty + 'x ' + i.nombre).join(', ')}).`);
  trazar(sid, oid, { etapa: 'pedido', nivel: 'ok', titulo: `Pedido DF-${numero} creado a mano por ${req.user!.nombre}`, detalle: `Origen: ${origen}`, datos: { cliente, tel: b.tel, ciudad: b.ciudad, departamento: b.departamento, direccion: b.direccion, total, envio, items: limpios } });
  {
    const nprod = limpios.reduce((a, i) => a + i.qty, 0);
    void import('./push.js').then((p) => p.enviarPush(sid, 'pedidos', `Nuevo pedido DF-${numero} 🛒`, `${cliente} · $${total.toLocaleString('es-CO')} · ${nprod} producto${nprod === 1 ? '' : 's'}`, { url: '/' })).catch(() => {});
    void import('./correo.js').then((c) => c.correoPedidoNuevo(sid, oid, `creado a mano (${origen})`)).catch(() => {});
    void import('./metaCapi.js').then((c) => c.avisarCapi(sid)).catch(() => {});
  }
  res.json({ ok: true, id: 'DF-' + numero, rowId: oid });
});

api.post('/orders/:rowId/despachar', requireAuth, requireStore, requireOwner, async (req, res) => {
  // Despacho a Effi por API (Dropi tiene las suyas: /orders/:rowId/dropi/cotizar y /crear).
  const sid = req.user!.storeId!;
  const reintentar = req.body?.reintentar === true;
  const o = db.prepare('SELECT id FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { id: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const ef = await import('./effiApi.js');
  if (!ef.effiApiListo(sid)) return res.status(400).json({ error: 'Conecta Effi por API en Integraciones para despachar.' });
  const r = await ef.despacharEffi(sid, o.id, reintentar);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, proveedor: 'effi', remision: r.remision, guia: r.guia, avisos: r.avisos, api: true });
});

// Actualiza estado y guía del pedido: Effi por API o Dropi por API.
api.post('/orders/:rowId/despachar/sync', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const eo = db.prepare('SELECT effi_doc FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { effi_doc: string } | undefined;
  if (eo?.effi_doc) {
    const ef = await import('./effiApi.js');
    const r = await ef.consultarEstadoEffi(sid, req.params.rowId);
    if ('error' in r) return res.status(400).json({ error: r.error });
    return res.json(r);
  }
  const { sincronizarPedidoDropi } = await import('./despachos.js');
  const r = await sincronizarPedidoDropi(sid, req.params.rowId);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ estado: r.estado, guia: r.guia });
});

// ── Dropi API directa (transportadoras + crear pedido + guía) ─────────────
/**
 * Ayudantes para el despacho por API de Dropi. Mapea los ítems del pedido a
 * productos de Dropi: el SKU del producto en DealFlow es el ID del producto en
 * Dropi, y la variación (talla/color) se empareja por atributos.
 */
const dropiHelpers = {
  credOrDie(sid: string, dropi: typeof DropiApi): DropiApi.DropiCred | null { return dropi.credDropi(sid); },
  async resolverProductosDropi(
    sid: string, o: Record<string, unknown>, _cred: DropiApi.DropiCred, _dropi: typeof DropiApi,
  ): Promise<{ cotProductos: DropiApi.CotProducto[]; ordenProductos: CrearOrdenInputProducto[] } | { error: string }> {
    { const { separarItemsPedido } = await import('./emparejar.js'); separarItemsPedido(sid, String(o.id)); }
    const items = db.prepare("SELECT qty, nombre, precio, COALESCE(product_id,'') product_id, COALESCE(variant_id,'') variant_id FROM order_items WHERE order_id = ?").all(o.id) as { qty: number; nombre: string; precio: number; product_id: string; variant_id: string }[];
    if (!items.length) return { error: 'El pedido no tiene productos.' };
    // Producto: SKU = ID del producto en Dropi. Variante: SKU = ID de la VARIACIÓN
    // en Dropi (se vincula a mano en Productos → Variantes). Emparejamos el ítem
    // contra NUESTRAS propias etiquetas de variante (fiable: el nombre del ítem se
    // arma con esa etiqueta), y usamos el id de variación que el dueño ya vinculó.
    const prodRows = db.prepare("SELECT id, nombre, sku FROM products WHERE store_id = ? AND sku != ''").all(sid) as { id: string; nombre: string; sku: string }[];
    const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const totalQty = items.reduce((a, it) => a + Math.max(1, it.qty), 0);
    const total = Number(o.total || 0);
    const cotProductos: DropiApi.CotProducto[] = [];
    const ordenProductos: CrearOrdenInputProducto[] = [];
    for (const it of items) {
      const base = it.nombre.split('(')[0].split('—')[0].trim();
      const nItem = norm(it.nombre);
      const prod = (it.product_id ? prodRows.find((p) => p.id === it.product_id) : undefined)
        || prodRows.find((p) => norm(p.nombre) === norm(base))
        || prodRows.filter((p) => p.nombre && nItem.includes(norm(p.nombre))).sort((a, b) => b.nombre.length - a.nombre.length)[0];
      if (!prod) return { error: `El producto "${base}" no tiene vinculado su ID de Dropi. Vincúlalo en Productos (SKU = ID del producto en Dropi).` };
      const pid = Number(String(prod.sku).replace(/[^0-9]/g, ''));
      if (!pid) return { error: `El ID de Dropi de "${base}" no es válido: "${prod.sku}".` };

      // Variantes reales de ESTE producto en DealFlow (con su id de variación de Dropi en `sku`).
      // El código de Dropi va en refs.dropi (panel de conexiones) o, si es viejo, en sku.
      const variantes = (db.prepare("SELECT id, label, sku, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ? AND COALESCE(label,'') != '' AND lower(label) != 'única'").all(prod.id) as { id: string; label: string; sku: string; refs: string }[])
        .map((v) => ({ ...v, sku: String(pj<Record<string, string>>(v.refs, {}).dropi || v.sku || '') }));
      let variationId: number | undefined;
      const exacta = it.variant_id ? variantes.find((v) => v.id === it.variant_id) : undefined;
      if (exacta) {
        const vid = Number(String(exacta.sku).replace(/[^0-9]/g, ''));
        if (!vid) return { error: `La variante "${exacta.label}" de "${base}" no está vinculada con Dropi. En Productos → Variantes, toca "Traer variantes de Dropi".` };
        variationId = vid;
      } else if (variantes.length) {
        // Emparejamos el ítem con la etiqueta de variante (todos sus tokens presentes; gana la más larga).
        let mejor: { sku: string; len: number } | null = null;
        for (const v of variantes) {
          const tks = norm(v.label).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
          if (tks.length && tks.every((t) => nItem.includes(t))) {
            const len = norm(v.label).length;
            if (!mejor || len > mejor.len) mejor = { sku: (v.sku || '').trim(), len };
          }
        }
        if (!mejor) return { error: `No supimos cuál variante es "${it.nombre}". Revisa las variantes del producto.` };
        const vid = Number(String(mejor.sku).replace(/[^0-9]/g, ''));
        if (!vid) return { error: `La variante de "${it.nombre}" no está vinculada con Dropi. En Productos → Variantes, toca "Traer variantes de Dropi".` };
        variationId = vid;
      }
      const tipo: 'SIMPLE' | 'VARIABLE' = variationId ? 'VARIABLE' : 'SIMPLE';
      const precioUnit = it.precio > 0 ? it.precio : Math.round(total / Math.max(1, totalQty));
      cotProductos.push({ id: pid, quantity: it.qty, type: tipo, variation_id: variationId });
      ordenProductos.push({ id: pid, name: it.nombre, type: tipo, variation_id: variationId, quantity: it.qty, price: precioUnit });
    }
    return { cotProductos, ordenProductos };
  },
};
type CrearOrdenInputProducto = DropiApi.CrearOrdenInput['productos'][number];
// Añade al mensaje de error las opciones válidas que devolvió Dropi (para que el
// dueño vea cómo se escribe la ciudad/departamento en Dropi).
function errConOpciones(msg: string, opciones?: string[]): string {
  if (!opciones || !opciones.length) return msg;
  return `${msg} · Cómo lo tiene Dropi: ${opciones.slice(0, 15).join(', ')}${opciones.length > 15 ? '…' : ''}`;
}

// Estado de la conexión Dropi API (sin exponer el token).
api.get('/dropi/estado', requireAuth, requireStore, (req, res) => {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'dropi_api'").get(req.user!.storeId!) as { config: string } | undefined;
  const cfg = row ? JSON.parse(row.config || '{}') : {};
  res.json({
    conectado: !!(cfg.token && cfg.integrationUrl),
    integrationUrl: cfg.integrationUrl || '',
    // URL propia de la tienda en DealFlow, para registrarla en Dropi sin tener página web.
    urlSugerida: urlTienda(req.user!.storeId!),
    preferencia: cfg.preferencia || 'operador',
  });
});

// Conecta/actualiza la integración Dropi API (guarda token + URL) y la prueba.
api.post('/dropi/conectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sid = req.user!.storeId!;
  const token = String(req.body?.token || '').trim();
  const integrationUrl = String(req.body?.integrationUrl || '').trim().replace(/\/+$/, '');
  const preferencia = ['operador', 'cheapest', 'auto', 'fixed'].includes(String(req.body?.preferencia)) ? String(req.body.preferencia) : 'operador';
  const transportadoraFija = String(req.body?.transportadoraFija || '').slice(0, 40);
  if (!token || !integrationUrl) return res.status(400).json({ error: 'Falta el token o la URL de integración.' });
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'dropi_api', ?, datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(sid, JSON.stringify({ token, integrationUrl, preferencia, transportadoraFija }));
  const { verificarDropi } = await import('./dropiApi.js');
  const r = await verificarDropi(sid);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

// Guarda solo la preferencia de transportadora (sin re-pegar el token).
api.post('/dropi/preferencia', requireAuth, requireStore, requireOwner, (req, res) => {
  const sid = req.user!.storeId!;
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'dropi_api'").get(sid) as { config: string } | undefined;
  if (!row) return res.status(400).json({ error: 'Conecta Dropi API primero.' });
  const cfg = JSON.parse(row.config || '{}');
  cfg.preferencia = ['operador', 'cheapest', 'auto', 'fixed'].includes(String(req.body?.preferencia)) ? String(req.body.preferencia) : 'operador';
  if (req.body?.transportadoraFija !== undefined) cfg.transportadoraFija = String(req.body.transportadoraFija).slice(0, 40);
  db.prepare("UPDATE store_integrations SET config = ?, updated_at = datetime('now') WHERE store_id = ? AND tipo = 'dropi_api'").run(JSON.stringify(cfg), sid);
  res.json({ ok: true, preferencia: cfg.preferencia });
});

// ── Shopify (Admin API) ──────────────────────────────────────────────
// Estado de la conexión (sin exponer el token).
api.get('/shopify/estado', requireAuth, requireStore, (req, res) => {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(req.user!.storeId!) as { config: string } | undefined;
  const cfg = row ? JSON.parse(row.config || '{}') : {};
  res.json({ conectado: !!(cfg.shop && cfg.token), shop: cfg.shop || '', nombre: cfg.nombre || '', via: cfg.via || 'manual', appDisponible: sa.appDisponible() });
});

// ── App pública de Shopify (instalación con un clic) ──
// La app incrustada manda el id token de App Bridge; no usa la cookie de DealFlow.
api.post('/shopify/app/sesion', async (req, res) => {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const r = await sa.abrirSesion(t).catch((e) => ({ error: `Error interno: ${e instanceof Error ? e.message : e}` }));
  if ('error' in r) return res.status(401).json({ error: r.error });
  res.json(r);
});
api.post('/shopify/app/instalar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { normalizarShop } = await import('./shopify.js');
  const r = sa.iniciarInstalacion(req.user!.storeId!, normalizarShop(String(req.body?.shop || '')));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
api.post('/shopify/app/vincular', requireAuth, requireStore, requireOwner, (req, res) => {
  const r = sa.vincularConCodigo(req.user!.storeId!, String(req.body?.codigo || ''));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, ...r });
});
// Pedidos de Shopify: confirmar por WhatsApp, despachar solo al confirmar y modo prueba.
api.get('/shopify/pedidos-config', requireAuth, requireStore, async (req, res) => {
  const { cfgPedidosShopify } = await import('./shopifyPedidos.js');
  res.json(cfgPedidosShopify(req.user!.storeId!));
});
api.post('/shopify/pedidos-config', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { guardarCfgPedidosShopify } = await import('./shopifyPedidos.js');
  const r = guardarCfgPedidosShopify(req.user!.storeId!, req.body || {});
  if (!r) return res.status(400).json({ error: 'Conecta Shopify primero.' });
  res.json(r);
});
// Traer ya los pedidos recientes de Shopify que no hayan llegado por webhook.
api.post('/shopify/pedidos/traer', requireAuth, requireStore, async (req, res) => {
  const { traerPedidosRecientes } = await import('./shopifyPedidos.js');
  const r = await traerPedidosRecientes(req.user!.storeId!, true);
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
// Reenviar la confirmación por WhatsApp de un pedido de Shopify.
api.post('/orders/:rowId/shopify/confirmacion', requireAuth, requireStore, async (req, res) => {
  const { enviarConfirmacion } = await import('./shopifyPedidos.js');
  const r = await enviarConfirmacion(req.user!.storeId!, req.params.rowId);
  if (!r.ok) {
    const e = (db.prepare('SELECT confirmacion_error FROM orders WHERE id = ?').get(req.params.rowId) as { confirmacion_error: string } | undefined)?.confirmacion_error;
    return res.status(400).json({ error: e || r.detalle || 'No se pudo enviar.' });
  }
  res.json({ ok: true });
});
// Por si Shopify usa la URL de redirección (instalación heredada): volver a la app dentro de Shopify.
api.get('/shopify/oauth/callback', (req, res) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!sa.esShopValido(shop) || !sa.KEY()) return res.status(400).send('Tienda no válida.');
  res.redirect(302, `https://${shop}/admin/apps/${encodeURIComponent(sa.KEY())}`);
});

// Conecta/actualiza Shopify (dominio + Admin API token) y prueba la conexión.
api.post('/shopify/conectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sid = req.user!.storeId!;
  const { normalizarShop, probarShopify, olvidarTokenShopify } = await import('./shopify.js');
  const shop = normalizarShop(String(req.body?.shop || ''));
  const token = String(req.body?.token || '').trim();
  const clientId = String(req.body?.clientId || '').trim();
  const clientSecret = String(req.body?.clientSecret || '').trim();
  if (!shop) return res.status(400).json({ error: 'Falta el dominio de la tienda (mitienda.myshopify.com).' });
  if (!token && !(clientId && clientSecret)) return res.status(400).json({ error: 'Pon el Admin API token, o el Client ID + Client Secret de la app.' });
  olvidarTokenShopify(shop); // por si cambió los scopes: forzar token nuevo
  const prueba = await probarShopify(shop, { token, clientId, clientSecret });
  if (!prueba.ok) return res.status(400).json({ error: prueba.error });
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'shopify', ?, datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(sid, JSON.stringify({ shop, token, clientId, clientSecret, nombre: prueba.nombre }));
  res.json({ ok: true, nombre: prueba.nombre, shop });
});

api.post('/shopify/desconectar', requireAuth, requireStore, requireOwner, (req, res) => {
  db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").run(req.user!.storeId!);
  res.json({ ok: true });
});

// Prueba de vinculación: busca una variante por SKU en Shopify.
api.get('/shopify/producto', requireAuth, requireStore, async (req, res) => {
  const { credShopify, buscarVarPorSku } = await import('./shopify.js');
  const c = credShopify(req.user!.storeId!);
  if (!c) return res.status(400).json({ error: 'Conecta Shopify primero en Integraciones.' });
  const sku = String(req.query.sku || '').trim();
  if (!sku) return res.status(400).json({ error: 'Falta el SKU a buscar.' });
  const v = await buscarVarPorSku(c, sku);
  res.json({ encontrado: !!v, variante: v });
});

// Crea/publica un producto de DealFlow EN Shopify (productSet) y guarda el SKU
// resultante en refs.shopify de cada variante (para que los pedidos la encuentren).
api.post('/shopify/publicar-producto', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sid = req.user!.storeId!;
  const { credShopify, crearProductoEnShopify } = await import('./shopify.js');
  const c = credShopify(sid);
  if (!c) return res.status(400).json({ error: 'Conecta Shopify primero en Integraciones.' });
  const productId = String(req.body?.productId || '');
  const activar = !!req.body?.activar;
  const prow = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, sid) as Record<string, unknown> | undefined;
  if (!prow) return res.status(404).json({ error: 'Producto no encontrado.' });
  const variantes = (db.prepare('SELECT id, label, sku, stock, refs FROM variants WHERE product_id = ? ORDER BY orden').all(productId) as Record<string, unknown>[]).map((v) => ({
    id: String(v.id), label: String(v.label || ''), sku: String(v.sku || ''), stock: Number(v.stock) || 0,
    refs: pj<Record<string, string>>(v.refs as string, {}),
  }));
  const producto = {
    id: String(prow.id), nombre: String(prow.nombre || ''), precio: Number(prow.precio) || 0,
    descripcion: String(prow.descripcion || ''), caracteristicas: String(prow.caracteristicas || ''),
    fotos: pj<string[]>(prow.fotos as string, []),
    opciones: pj<{ nombre: string; valores: { valor: string }[] }[]>(prow.opciones as string, []),
    variantes,
  };
  const r = await crearProductoEnShopify(c, producto, { activar });
  if (!r.ok) return res.status(400).json({ error: r.error });
  // Guardar el SKU usado en refs.shopify de cada variante (si no lo tenían ya).
  const upd = db.prepare("UPDATE variants SET refs = json_set(COALESCE(NULLIF(refs,''),'{}'), '$.shopify', ?) WHERE id = ? AND product_id = ?");
  const tx = db.transaction(() => { for (const m of r.mapSku) upd.run(m.sku, m.dfVariantId, productId); });
  tx();
  res.json({ ok: true, productId: r.productId, status: r.status, variantes: r.variantes, imagenes: r.imagenes, vinculadas: r.mapSku.length });
});

// Valida un ID de producto de Dropi (para vincularlo): trae nombre y variaciones.
// Trae de Dropi todas las variaciones del producto y las crea/vincula en DealFlow.
api.post('/products/:id/dropi/sincronizar', requireAuth, requireStore, async (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { sincronizarProductoDropi } = await import('./dropiSync.js');
  const r = await sincronizarProductoDropi(req.user!.storeId!, req.params.id, String(req.body?.dropiId || ''));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
// Volver a armar las variantes con las opciones (deja de usar las de Dropi).
api.post('/products/:id/dropi/soltar-variantes', requireAuth, requireStore, (req, res) => {
  if (!ownProduct(req, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  db.prepare("UPDATE products SET variantes_fuente = '' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
api.get('/dropi/producto/:id', requireAuth, requireStore, async (req, res) => {
  const { credDropi, productoDropi } = await import('./dropiApi.js');
  const c = credDropi(req.user!.storeId!);
  if (!c) return res.status(400).json({ error: 'Conecta Dropi API primero en Integraciones.' });
  const r = await productoDropi(c, req.params.id);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});

// Cotiza un pedido en Dropi: resuelve destino, arma los productos y devuelve las
// transportadoras con su precio para que el operador elija.
api.post('/orders/:rowId/dropi/cotizar', requireAuth, requireStore, requireOwner, async (req, res) => {
  try {
  const { resolverProductosDropi, credOrDie } = dropiHelpers;
  const sid = req.user!.storeId!;
  const dropi = await import('./dropiApi.js');
  const c = credOrDie(sid, dropi);
  if (!c) return res.status(400).json({ error: 'Conecta Dropi API primero en Integraciones.' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as Record<string, unknown> | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const conRecaudo = req.body?.recaudo !== 'sin'; // 'sin' = prepagado; por defecto contra entrega
  const destino = await dropi.resolverDestino(c, String(o.departamento || ''), String(o.ciudad || ''), conRecaudo);
  if ('error' in destino) return res.status(400).json({ error: errConOpciones(destino.error, destino.opciones), opciones: destino.opciones });
  const prods = await resolverProductosDropi(sid, o, c, dropi);
  if ('error' in prods) return res.status(400).json({ error: prods.error });
  const monto = Number(o.total || 0);
  const cot = await dropi.cotizar(c, destino.ciudad, prods.cotProductos, monto, conRecaudo);
  if ('error' in cot) return res.status(400).json({ error: cot.error });
  res.json({ ciudad: destino.ciudad.name, ...cot });
  } catch (e) {
    console.error('[dropi] cotizar', e);
    res.status(500).json({ error: `No pudimos cotizar en Dropi: ${e instanceof Error ? e.message : e}` });
  }
});

// Crea el pedido en Dropi con la transportadora elegida (o sin ella si auto).
api.post('/orders/:rowId/dropi/crear', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sidT = req.user!.storeId!;
  trazar(sidT, req.params.rowId, { etapa: 'despacho', titulo: 'Creación en Dropi iniciada', datos: { opciones: req.body } });
  // El resultado (éxito o error) queda en la línea de tiempo del pedido.
  const jsonOrig = res.json.bind(res);
  res.json = (b: { error?: string; dropiId?: string; aviso?: string }) => {
    if (res.statusCode >= 400) trazar(sidT, req.params.rowId, { etapa: 'despacho', nivel: 'error', titulo: 'Creación en Dropi falló', detalle: String(b?.error || '') });
    else trazar(sidT, req.params.rowId, { etapa: 'despacho', nivel: 'ok', titulo: b?.aviso || `Pedido creado en Dropi (orden ${b?.dropiId || ''})` });
    return jsonOrig(b);
  };
  await conPedido(sidT, req.params.rowId, async () => {
  const { resolverProductosDropi, credOrDie } = dropiHelpers;
  const sid = req.user!.storeId!;
  const dropi = await import('./dropiApi.js');
  const c = credOrDie(sid, dropi);
  if (!c) return res.status(400).json({ error: 'Conecta Dropi API primero en Integraciones.' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as Record<string, unknown> | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (o.dropi_order_id && req.body?.reintentar !== true) return res.json({ ok: true, dropiId: o.dropi_order_id, aviso: 'Este pedido ya se creó en Dropi.' });
  const conRecaudo = req.body?.recaudo !== 'sin'; // 'sin' = prepagado; por defecto contra entrega
  const destino = await dropi.resolverDestino(c, String(o.departamento || ''), String(o.ciudad || ''), conRecaudo);
  if ('error' in destino) return res.status(400).json({ error: errConOpciones(destino.error, destino.opciones), opciones: destino.opciones });
  const prods = await resolverProductosDropi(sid, o, c, dropi);
  if ('error' in prods) return res.status(400).json({ error: prods.error });

  const t = req.body?.transportadora as { id: number; nombre: string; service: string; precio: number } | undefined;
  // Nombre real del cliente (el que escribió en el chat), no el de perfil ni un correo.
  const nombreReal = (await import('./nombres.js')).resolverNombreCliente(String(o.lead_id || ''), String(o.cliente || ''), '');
  const [nombre, ...resto] = nombreReal.split(' ');
  const crear = await dropi.crearOrden(c, {
    total: Number(o.total || 0), notas: `DealFlow DF-${o.numero || ''}${o.nota ? ' · ' + o.nota : ''}`,
    nombre: nombre || nombreReal, apellido: resto.join(' '),
    direccion: String(o.direccion || ''), departamento: destino.depto.name, ciudad: destino.ciudad.name,
    telefono: String(o.tel || ''), conRecaudo, shopOrderId: `df-${o.id}`,
    productos: prods.ordenProductos, transportadora: t, ciudadDropi: destino.ciudad,
  });
  if ('error' in crear) return res.status(400).json({ error: crear.error });
  const nombreTransp = t?.nombre || '';
  // Al crear en Dropi limpiamos cualquier despacho previo por WooCommerce (si el
  // pedido había quedado enviado por Effi por error, esto lo "cambia" a Dropi).
  db.prepare("UPDATE orders SET dropi_order_id = ?, despacho_proveedor = 'dropi', transportadora = ?, woo_id = '', estado_woo = '', guia = ? WHERE id = ?")
    .run(crear.id, nombreTransp, req.body?.reintentar === true ? '' : String(o.guia || ''), o.id);
  registrarLog(sid, 'info', 'despacho', `DF-${o.numero} creado en Dropi (orden ${crear.id})${nombreTransp ? ' por ' + nombreTransp : ''}.`);
  res.json({ ok: true, dropiId: crear.id, transportadora: nombreTransp });
  });
});

// ── Effi por API directa (reemplaza el puente WooCommerce) ──
// URL pública del webhook de la tienda (la que se pega en Effi → Webhooks).
function urlWebhookEffi(req: import('express').Request, token: string): string {
  const base = (process.env.PUBLIC_APP_URL || `https://${req.get('host') || 'app.dealflow.sbs'}`).replace(/\/+$/, '');
  return `${base}/webhooks/effi/${token}`;
}
api.get('/effi-api/estado', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = req.user!.storeId!;
  const c = ef.cfgEffi(sid);
  if (!c?.apiKey) return res.json({ conectado: false });
  const { apiKey, webhookSecret, ...resto } = c;
  const nSecretos = webhookSecret ? webhookSecret.split('\n').filter((s) => s.trim()).length : 0;
  const nArt = (db.prepare('SELECT COUNT(*) n FROM effi_articulos WHERE store_id = ?').get(sid) as { n: number }).n;
  res.json({
    conectado: true, listo: ef.effiApiListo(sid), apiKeyFin: apiKey.slice(-4), webhookSecreto: nSecretos > 0, webhookSecretos: nSecretos,
    webhookUrl: urlWebhookEffi(req, c.webhookToken), articulosEnCache: nArt, ...resto,
  });
});
api.post('/effi-api/conectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const apiKey = String(req.body?.apiKey || '').trim();
  if (apiKey.length < 32 || apiKey.length > 40) return res.status(400).json({ error: 'La API key de Effi tiene entre 32 y 40 caracteres. Cópiala completa desde Administración → Usuarios → Ver más.' });
  const v = await ef.verificarEffi(apiKey);
  if (!v.ok) return res.status(400).json({ error: v.error });
  ef.guardarCfgEffi(req.user!.storeId!, { apiKey });
  registrarLog(req.user!.storeId!, 'info', 'integracion', 'Effi conectado por API.');
  res.json({ ok: true });
});
// Conexión automática: un paso a la vez (para mostrar el avance).
api.post('/effi-api/autoconfigurar/:paso', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const paso = String(req.params.paso);
  if (!['config', 'convenios', 'productos'].includes(paso)) return res.status(400).json({ error: 'Paso no válido.' });
  try { res.json(await ef.autoconfigurarEffi(req.user!.storeId!, paso as 'config' | 'convenios' | 'productos')); }
  catch (e) { res.json({ ok: false, listo: ef.effiApiListo(req.user!.storeId!), detalle: `Error: ${String((e as Error)?.message || e).slice(0, 160)}` }); }
});
// Convenios Dropshipping que la tienda ya usó en Effi (para elegir el de las remisiones).
// ── Logística Effi: tablero de guías ──
api.get('/logistica/effi', requireAuth, requireStore, async (req, res) => {
  const { tableroLogistica } = await import('./logistica.js');
  res.json(tableroLogistica(req.user!.storeId!, Number(req.query.dias) || 45));
});
api.post('/logistica/effi/actualizar', requireAuth, requireStore, async (req, res) => {
  const { refrescarLogistica, tableroLogistica } = await import('./logistica.js');
  const r = await refrescarLogistica(req.user!.storeId!);
  res.json({ ...tableroLogistica(req.user!.storeId!, Number(req.body?.dias) || 45), revisadas: r.revisadas });
});
// Convenios ya conocidos (rápido, sin consultar Effi): para elegir uno al despachar.
// Portal de proveedores: accesos por convenio que el dueño crea para sus proveedores.
api.get('/proveedores', requireAuth, requireStore, requireOwner, (req, res) => res.json(listarProveedores(req.user!.storeId!)));
api.post('/proveedores', requireAuth, requireStore, requireOwner, (req, res) => {
  const r = crearProveedor(req.user!.storeId!, req.body || {});
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
api.put('/proveedores/:id', requireAuth, requireStore, requireOwner, (req, res) => {
  const r = editarProveedor(req.user!.storeId!, String(req.params.id), req.body || {});
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
api.delete('/proveedores/:id', requireAuth, requireStore, requireOwner, (req, res) => {
  if (!borrarProveedor(req.user!.storeId!, String(req.params.id))) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  res.json({ ok: true });
});

api.get('/effi-api/convenios-conocidos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  res.json({ convenios: ef.conveniosConocidos(req.user!.storeId!), porDefecto: ef.cfgEffi(req.user!.storeId!)?.convenioDropshipping || '' });
});
api.get('/effi-api/convenios', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const c = ef.cfgEffi(req.user!.storeId!);
  if (!c?.apiKey) return res.status(400).json({ error: 'Conecta Effi primero.' });
  const lista = await ef.conveniosDropshipping(c.apiKey, c.convenios, req.user!.storeId!);
  // Lo detectado queda guardado: así aparece también al despachar y en cada producto.
  const nuevos = lista.filter((x) => !c.convenios.some((g) => g.id === x.id)).map(({ id, nombre }) => ({ id, nombre }));
  if (nuevos.length) ef.guardarCfgEffi(req.user!.storeId!, { convenios: [...c.convenios, ...nuevos] });
  res.json({ convenios: lista, actual: c.convenioDropshipping });
});

api.get('/effi-api/listas', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const c = ef.cfgEffi(req.user!.storeId!);
  if (!c?.apiKey) return res.status(400).json({ error: 'Conecta Effi primero.' });
  const l = await ef.listasEffi(c.apiKey);
  if ('error' in l) return res.status(400).json({ error: l.error });
  res.json(l);
});
api.post('/effi-api/config', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = req.user!.storeId!;
  if (!ef.cfgEffi(sid)?.apiKey) return res.status(400).json({ error: 'Conecta Effi primero.' });
  const b = req.body || {};
  const s = (v: unknown) => String(v ?? '').trim().slice(0, 40);
  const parcial: Record<string, unknown> = {};
  for (const k of ['sucursal', 'bodega', 'centroCostos', 'formaPago', 'medioPago', 'caja', 'cuenta', 'vendedor', 'articuloFlete']) if (k in b) parcial[k] = s(b[k]);
  if ('convenioDropshipping' in b) parcial.convenioDropshipping = s(b.convenioDropshipping).replace(/[^A-Za-z0-9_-]/g, '');
  if (Array.isArray(b.convenios)) {
    parcial.convenios = (b.convenios as Record<string, unknown>[]).slice(0, 50)
      .map((x) => ({ id: String(x?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), nombre: String(x?.nombre ?? '').trim().slice(0, 80) }))
      .filter((x) => x.id);
  }
  if ('formaPagoContado' in b) parcial.formaPagoContado = b.formaPagoContado === true;
  if ('autoDespacho' in b) parcial.autoDespacho = b.autoDespacho === true;
  if ('diasEntrega' in b) parcial.diasEntrega = Math.min(60, Math.max(0, Math.round(Number(b.diasEntrega) || 3)));
  if (b.guia && typeof b.guia === 'object') {
    const g = b.guia as Record<string, unknown>;
    const num = (v: unknown, d: number) => (Number(v) > 0 ? Number(v) : d);
    parcial.guia = {
      activa: g.activa === true, transportadora: s(g.transportadora), servicio: s(g.servicio), formaPagoFlete: s(g.formaPagoFlete), remitente: s(g.remitente),
      peso: num(g.peso, 1), volumen: num(g.volumen, 1), alto: num(g.alto, 10), ancho: num(g.ancho, 10), largo: num(g.largo, 10),
    };
  }
  if (b.novedades && typeof b.novedades === 'object') {
    const n = b.novedades as Record<string, unknown>;
    const actual = ef.cfgEffi(sid)!.novedades;
    parcial.novedades = {
      avisarCliente: 'avisarCliente' in n ? n.avisarCliente === true : actual.avisarCliente,
      botGestiona: 'botGestiona' in n ? n.botGestiona === true : actual.botGestiona,
      autoEnviar: 'autoEnviar' in n ? n.autoEnviar === true : actual.autoEnviar,
    };
  }
  if ('devolucionAuto' in b) parcial.devolucionAuto = b.devolucionAuto === true;
  if ('vinculoManual' in b) parcial.vinculoManual = b.vinculoManual !== false;
  ef.guardarCfgEffi(sid, parcial);
  res.json({ ok: true, listo: ef.effiApiListo(sid) });
});
// El secreto lo genera Effi al crear el webhook (se muestra una sola vez): el dueño lo pega aquí.
api.post('/effi-api/webhook-secreto', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const secreto = String(req.body?.secreto || '').trim();
  if (secreto.length < 32) return res.status(400).json({ error: 'Pega el secreto completo que te mostró Effi al crear el webhook (64 caracteres).' });
  const n = ef.agregarSecretoEffi(req.user!.storeId!, secreto);
  res.json({ ok: true, secretos: n });
});
api.post('/effi-api/desconectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  ef.borrarCfgEffi(req.user!.storeId!);
  res.json({ ok: true });
});
api.post('/effi-api/articulos/sync', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const r = await ef.sincronizarArticulos(req.user!.storeId!);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
api.get('/effi-api/articulos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = req.user!.storeId!;
  const arts = ef.articulosCache(sid);
  const variantes = (db.prepare("SELECT v.id, p.id pid, p.nombre producto, v.label, COALESCE(p.despacho_proveedor,'') proveedor, COALESCE(json_extract(v.refs,'$.effi_id'),'') effi_id, COALESCE(json_extract(v.refs,'$.effi_auto'),0) effi_auto, COALESCE(json_extract(v.refs,'$.effi_prov_id'),'') prov_id FROM variants v JOIN products p ON p.id = v.product_id WHERE p.store_id = ? AND (? = '' OR p.id = ?) ORDER BY p.nombre, v.label").all(sid, String(req.query.productId || ''), String(req.query.productId || '')) as { id: string; pid: string; producto: string; label: string; proveedor: string; effi_id: string; effi_auto: number; prov_id: string }[])
    .map((v) => ({ variantId: v.id, productId: v.pid, producto: v.producto, proveedor: v.proveedor, nombre: v.label && v.label.toLowerCase() !== 'única' ? `${v.producto} (${v.label})` : v.producto, effiId: String(v.effi_id || ''), auto: Number(v.effi_auto) === 1, provId: String(v.prov_id || '') }));
  // El nombre del artículo vinculado (aunque no esté en la caché), para mostrarlo.
  const nombres: Record<string, string> = {};
  for (const a of arts) nombres[a.id] = a.descripcion + (a.referencia ? ` [${a.referencia}]` : '');
  // Convenio de cada producto (a mano) y los convenios que la tienda conoce.
  const conveniosProducto = Object.fromEntries((db.prepare("SELECT id, effi_convenio FROM products WHERE store_id = ? AND effi_convenio != ''").all(sid) as { id: string; effi_convenio: string }[]).map((r) => [r.id, r.effi_convenio]));
  res.json({ articulos: arts, variantes, nombres, conveniosProducto, convenios: ef.conveniosConocidos(sid) });
});
api.get('/effi-api/articulos/todos', requireAuth, requireStore, async (req, res) => {
  const ef = await import('./effiApi.js');
  res.json({ articulos: await ef.todosLosArticulos(req.user!.storeId!, req.query.refrescar === '1') });
});
api.get('/effi-api/articulos/buscar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const r = await ef.buscarArticulosEffi(req.user!.storeId!, String(req.query.q || ''));
  if (!Array.isArray(r)) return res.status(400).json({ error: r.error });
  res.json({ articulos: r });
});
// Marca por quién se despacha un producto (effi | dropi | '').
api.post('/effi-api/producto-proveedor', requireAuth, requireStore, requireOwner, (req, res) => {
  const dp = req.body?.proveedor === 'dropi' || req.body?.proveedor === 'effi' ? req.body.proveedor : '';
  const ids: string[] = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : [String(req.body?.productId || '')];
  const upd = db.prepare('UPDATE products SET despacho_proveedor = ? WHERE id = ? AND store_id = ?');
  let n = 0;
  for (const id of ids) n += upd.run(dp, id, req.user!.storeId!).changes;
  res.json({ ok: true, actualizados: n });
});
// Convenio de un producto: '' = automático, 'propio' = mercancía propia, o el código del convenio.
api.post('/effi-api/producto-convenio', requireAuth, requireStore, requireOwner, (req, res) => {
  const raw = String(req.body?.convenio ?? '').trim();
  const conv = raw === 'propio' ? 'propio' : raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const ids: string[] = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : [String(req.body?.productId || '')];
  const upd = db.prepare('UPDATE products SET effi_convenio = ? WHERE id = ? AND store_id = ?');
  let n = 0;
  for (const id of ids) n += upd.run(conv, id, req.user!.storeId!).changes;
  res.json({ ok: true, actualizados: n });
});
// Revisión rápida de vínculos de un producto: actual vs. sugerido, y aplicar varios de una vez.
api.get('/effi-api/producto/:id/vinculos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const r = await ef.revisarVinculosProducto(req.user!.storeId!, String(req.params.id));
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
api.post('/effi-api/producto/:id/vinculos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = req.user!.storeId!;
  const cambios = (Array.isArray(req.body?.cambios) ? req.body.cambios : []) as { variantId?: string; effiId?: string }[];
  let n = 0;
  for (const c of cambios.slice(0, 500)) {
    const vid = String(c.variantId || '');
    const own = db.prepare('SELECT 1 FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.id = ? AND p.store_id = ?').get(vid, String(req.params.id), sid);
    if (!own) continue;
    const eid = String(c.effiId || '').replace(/\D/g, '');
    if (eid) { if (ef.vincularArticulo(sid, vid, eid)) n++; }
    else { db.prepare("UPDATE variants SET refs = json_remove(COALESCE(refs,'{}'), '$.effi_id', '$.effi_auto') WHERE id = ?").run(vid); n++; }
  }
  registrarAccionEquipo(req.user!.email, `Vínculos Effi del producto ${String(req.params.id)}: ${n} cambio(s)`, sid);
  res.json({ ok: true, cambios: n });
});
api.get('/effi-api/articulo/:id', requireAuth, requireStore, async (req, res) => {
  const ef = await import('./effiApi.js');
  const a = await ef.verArticuloEffi(req.user!.storeId!, String(req.params.id).replace(/\D/g, ''));
  if (!a) return res.status(404).json({ error: 'No existe ese artículo en Effi.' });
  res.json({ articulo: { id: a.id, descripcion: a.descripcion, referencia: a.referencia, stock: a.stock, drop: a.drop } });
});
// Sugerencia del artículo del proveedor para un artículo propio (no se aplica sola).
api.get('/effi-api/proveedor-sugerido/:id', requireAuth, requireStore, async (req, res) => {
  const ef = await import('./effiApi.js');
  const a = await ef.proveedorSugerido(req.user!.storeId!, String(req.params.id).replace(/\D/g, ''));
  res.json({ articulo: a ? { id: a.id, descripcion: a.descripcion, referencia: a.referencia, stock: a.stock, drop: 1 } : null });
});
api.post('/effi-api/articulos/vincular', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const id = String(req.body?.effiId || '').replace(/\D/g, '');
  // Vínculo a mano por ID: se verifica en Effi que el artículo exista antes de guardarlo.
  let articulo: Awaited<ReturnType<typeof ef.verArticuloEffi>>;
  if (id) {
    articulo = await ef.verArticuloEffi(req.user!.storeId!, id);
    if (!articulo) return res.status(400).json({ error: `En Effi no existe el artículo #${id} (o tu API key no lo puede ver). Revisa el ID en Effi → Inventario → Artículos.` });
  }
  if (articulo && req.body?.tipo === 'proveedor' && articulo.drop !== 1) return res.status(400).json({ error: `El artículo #${id} (${articulo.descripcion}) es tuyo, no de un proveedor dropshipping. Pon aquí el ID del artículo del PROVEEDOR.` });
  const ok = req.body?.tipo === 'proveedor'
    ? ef.vincularProveedor(req.user!.storeId!, String(req.body?.variantId || ''), id)
    : ef.vincularArticulo(req.user!.storeId!, String(req.body?.variantId || ''), id);
  if (!ok) return res.status(404).json({ error: 'Variante no encontrada.' });
  res.json({ ok: true, articulo: articulo ? { id: articulo.id, descripcion: articulo.descripcion, referencia: articulo.referencia, stock: articulo.stock, drop: articulo.drop } : null });
});
api.get('/effi-api/eventos', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  res.json({ eventos: ef.eventosEffi(req.user!.storeId!, 80) });
});
// Lo necesario para el formulario de guía: transportadoras (con servicios y pago del flete),
// remitentes y los valores por defecto (la última elección).
api.get('/effi-api/opciones-guia', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const c = ef.cfgEffi(req.user!.storeId!);
  if (!c?.apiKey) return res.status(400).json({ error: 'Conecta Effi primero.' });
  const r = await ef.opcionesGuiaEffi(c.apiKey);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ...r, defaults: c.guia });
});
api.post('/orders/:rowId/effi/guia', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const b = req.body || {};
  const s = (v: unknown) => String(v ?? '').trim().slice(0, 40);
  const n = (v: unknown, d: number) => (Number(v) > 0 ? Number(v) : d);
  const r = await ef.generarGuiaPedido(req.user!.storeId!, req.params.rowId, {
    activa: true, transportadora: s(b.transportadora), servicio: s(b.servicio), formaPagoFlete: s(b.formaPagoFlete), remitente: s(b.remitente),
    peso: n(b.peso, 1), volumen: n(b.volumen, 1), alto: n(b.alto, 10), ancho: n(b.ancho, 10), largo: n(b.largo, 10),
    cantPaquetes: n(b.cantPaquetes, 1), contenido: String(b.contenido || '').trim().slice(0, 80), nota: String(b.nota || '').trim().slice(0, 255),
    recibeSabado: b.recibeSabado !== false, valorDeclarado: Number(b.valorDeclarado) > 0 ? Number(b.valorDeclarado) : undefined,
  }, b.reintentar === true);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, ...r });
});
// Transportadoras cuya guía en PDF viene "acostada" en la hoja (hay que enderezarla).
// Documento de la guía (PDF o imagen) que el dueño sube al pedido. Si es PDF,
// guardamos también la primera página como PNG para mandarla por WhatsApp.
api.post('/orders/:rowId/guia-documento', requireAuth, requireStore, requireOwner, async (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT id, numero, transportadora FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { id: string; numero: number; transportadora: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const dataUrl = String(req.body?.dataUrl || '');
  const i = dataUrl.indexOf(';base64,');
  if (!dataUrl.startsWith('data:') || i < 0) return res.status(400).json({ error: 'Archivo inválido.' });
  const mime = dataUrl.slice(5, i).split(';')[0].trim();
  const buf = Buffer.from(dataUrl.slice(i + 8), 'base64');
  if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'El archivo pesa más de 15 MB.' });
  const { guardarArchivo, pdfAPng, guiaAcostada } = await import('./media.js');
  const base = `guia-DF${o.numero}-${uid().slice(0, 6)}`;
  let url = ''; let img = '';
  if (mime === 'application/pdf') {
    url = guardarArchivo(sid, `${base}.pdf`, buf);
    const png = pdfAPng(buf, { enderezar: guiaAcostada(o) });
    if (png) img = guardarArchivo(sid, `${base}.png`, png);
  } else if (/^image\/(png|jpe?g|webp)$/.test(mime)) {
    img = guardarArchivo(sid, `${base}.${mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'}`, buf);
    url = img;
  } else return res.status(400).json({ error: 'Sube la guía en PDF o como imagen (PNG/JPG).' });
  db.prepare('UPDATE orders SET guia_url = ?, guia_img = ? WHERE id = ?').run(url, img, o.id);
  res.json({ ok: true, guiaUrl: url, guiaImg: img, convertida: mime === 'application/pdf' ? !!img : true });
});
// Guía puesta a mano (p.ej. Dropi la generó pero no llegó por la API): se guarda, el
// pedido pasa a "Guía generada" y se le avisa al cliente por WhatsApp.
api.post('/orders/:rowId/guia-manual', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT id, estado, guia_avisada, transportadora FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { id: string; estado: string; guia_avisada: number; transportadora: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const guia = String(req.body?.guia || '').trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{5,40}$/.test(guia)) return res.status(400).json({ error: 'Escribe un número de guía válido (solo letras, números o guiones).' });
  const transp = String(req.body?.transportadora || '').trim().slice(0, 60);
  db.prepare("UPDATE orders SET guia = ?, transportadora = CASE WHEN ? != '' THEN ? ELSE transportadora END, estado = CASE WHEN estado IN ('Nuevo','Confirmado','Despachado','') THEN 'Guía generada' ELSE estado END WHERE id = ?")
    .run(guia, transp, transp, o.id);
  const { trazar } = await import('./trazabilidad.js');
  trazar(sid, o.id, { etapa: 'despacho', nivel: 'ok', titulo: `Guía ${guia} puesta a mano`, detalle: `Por ${req.user!.nombre || req.user!.email}.` });
  let aviso = '';
  if (req.body?.avisar !== false) {
    const { avisarGuia } = await import('./avisoGuia.js');
    const r = await avisarGuia(sid, o.id, { conArchivo: true });
    aviso = r.chat === 'enviado' || r.chat === 'plantilla' || r.contacto === 'plantilla' ? 'Se le envió la guía al cliente por WhatsApp.' : (r.detalle.join(' ') || 'No se pudo avisar al cliente.');
  }
  res.json({ ok: true, guia, aviso });
});
// Envía la guía al cliente: al chat (imagen/PDF/texto) y, si dejó otro celular de
// contacto, a ese número con la plantilla aprobada (ver avisoGuia.ts).
api.post('/orders/:rowId/guia-enviar', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as Record<string, unknown> | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const guia = String(o.guia || '').trim();
  if (!guia) return res.status(400).json({ error: 'El pedido todavía no tiene número de guía.' });
  const { guardarArchivo, pdfAPng, guiaAcostada } = await import('./media.js');
  let img = String(o.guia_img || '');
  const url = String(o.guia_url || '');
  // Guía externa (enlace que mandó Effi): la bajamos y la convertimos una vez.
  if (!img && /^https?:\/\//.test(url)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const png = ct.includes('pdf') || /\.pdf(\?|$)/i.test(url) ? pdfAPng(buf, { enderezar: guiaAcostada({ ...o, guia_url: url }) }) : /image\//.test(ct) ? buf : null;
      if (png) { img = guardarArchivo(sid, `guia-DF${o.numero}-${uid().slice(0, 6)}.png`, png); db.prepare('UPDATE orders SET guia_img = ? WHERE id = ?').run(img, o.id); }
    } catch { /* seguimos con texto */ }
  }
  const { avisarGuia } = await import('./avisoGuia.js');
  const r = await avisarGuia(sid, String(o.id), { conArchivo: true });
  const ok = r.chat === 'enviado' || r.chat === 'plantilla' || r.contacto === 'plantilla';
  if (!ok) return res.status(400).json({ error: r.detalle.join(' ') || 'No se encontró el chat del cliente ni un número de contacto.' });
  res.json({ ok: true, ...r });
});
// Ítems del pedido cuya talla/color no existe en el producto, con las variantes que sí hay
// (para corregirlos desde el mismo pedido con un selector).
api.get('/orders/:rowId/variantes-faltantes', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT id FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const { variantesBase, emparejarItem } = await import('./emparejar.js');
  const todas = variantesBase(sid);
  const items = db.prepare("SELECT id, qty, nombre, COALESCE(variant_id,'') variant_id FROM order_items WHERE order_id = ?").all(req.params.rowId) as { id: string; qty: number; nombre: string; variant_id: string }[];
  const faltan = [];
  for (const it of items) {
    if (it.variant_id && todas.some((v) => v.variantId === it.variant_id)) continue;
    const r = emparejarItem(it.nombre, todas);
    if (r.v) continue;
    const prod = r.parecidos[0] && r.parecidos[0].puntaje >= 0.6 ? r.parecidos[0].producto : '';
    const opciones = todas.filter((v) => v.producto === prod && v.variantId).map((v) => ({ variantId: v.variantId!, label: v.label }));
    faltan.push({ itemId: it.id, qty: it.qty, nombre: it.nombre, producto: prod, opciones });
  }
  res.json({ faltan });
});
// Corrige la variante de un ítem del pedido (el nombre queda "Producto (Variante)").
api.post('/orders/:rowId/items/:itemId/variante', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const it = db.prepare('SELECT i.id, i.nombre FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ? AND o.id = ? AND o.store_id = ?').get(req.params.itemId, req.params.rowId, sid) as { id: string; nombre: string } | undefined;
  if (!it) return res.status(404).json({ error: 'Producto del pedido no encontrado.' });
  const v = db.prepare('SELECT v.id, v.label, p.id pid, p.nombre FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(String(req.body?.variantId || ''), sid) as { id: string; label: string; pid: string; nombre: string } | undefined;
  if (!v) return res.status(400).json({ error: 'Elige una variante del producto.' });
  const nombre = v.label && v.label.toLowerCase() !== 'única' ? `${v.nombre} (${v.label})` : v.nombre;
  db.prepare('UPDATE order_items SET nombre = ?, product_id = ?, variant_id = ? WHERE id = ?').run(nombre, v.pid, v.id, it.id);
  trazar(sid, String(req.params.rowId), { etapa: 'pedido', nivel: 'info', titulo: `Variante corregida: ${it.nombre} → ${nombre}`, detalle: `Por ${req.user!.nombre || req.user!.email}.` });
  res.json({ ok: true, nombre });
});
// Vista previa: lo que se le mandaría a Effi para este pedido (no crea nada).
api.get('/orders/:rowId/effi/preview', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const forzado = String(req.query.convenio || '').trim() === 'propio' ? 'propio' : String(req.query.convenio || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const convenios = ef.conveniosConocidos(req.user!.storeId!);
  const r = await ef.prepararRemision(req.user!.storeId!, req.params.rowId, false, 'revision', forzado);
  if ('error' in r) return res.status(400).json({ error: r.error, convenios });
  res.json({ lineas: r.lineas, ubicacion: r.ubic.nombre, avisos: r.avisos, total: (r.body.valor_forma_pago as number[])[0], remision: r.body, convenio: String(r.body.convenio_dropshipping ?? ''), convenios });
});
api.post('/orders/:rowId/effi/despachar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT effi_remision FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { effi_remision: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const reintentar = req.body?.reintentar === true;
  if (o.effi_remision && !o.effi_remision.includes('anulada') && !reintentar) return res.json({ ok: true, remision: o.effi_remision, aviso: 'Este pedido ya tiene remisión en Effi.' });
  const raw = String(req.body?.convenio || '').trim();
  const forzado = raw === 'propio' ? 'propio' : raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const r = await ef.despacharEffi(sid, req.params.rowId, reintentar, forzado);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, ...r });
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
// Bloquear / desbloquear el contacto de un chat (DealFlow no le envía nada; y en Meta, si se puede).
api.get('/leads/:id/bloqueo', requireAuth, requireStore, async (req, res) => {
  const { estadoBloqueo } = await import('./bloqueos.js');
  res.json(estadoBloqueo(req.user!.storeId!, req.params.id));
});
api.post('/leads/:id/bloquear', requireAuth, requireStore, async (req, res) => {
  const { bloquearContacto } = await import('./bloqueos.js');
  const r = await bloquearContacto(req.user!.storeId!, req.params.id, req.user!.email);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
api.post('/leads/:id/desbloquear', requireAuth, requireStore, async (req, res) => {
  const { desbloquearContacto } = await import('./bloqueos.js');
  const r = await desbloquearContacto(req.user!.storeId!, req.params.id);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
// Qué apps siguen conectadas (reciben los mensajes) a la cuenta de WhatsApp de la tienda.
api.get('/whatsapp/apps-conectadas', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { appsConectadas } = await import('./bloqueos.js');
  const r = await appsConectadas(req.user!.storeId!);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
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
  const r = await opcionesDeConexion(req.user!.storeId!, { code: String(req.body?.code || '') || undefined, accessToken: String(req.body?.accessToken || '') || undefined });
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
  // Recién conectada: trae de una vez los últimos 30 días de gasto y resultados.
  void import('./metaInsights.js').then((m) => m.sincronizarInsights(req.user!.storeId!, 30)).catch(() => {});
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
  { const e = claveInvalida(String(password), false); if (e) return res.status(400).json({ error: e }); }
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
  // Ventana de 24 h cerrada: no se guarda ni se envía (solo plantillas aprobadas).
  { const { ventanaDeLead, MSG_VENTANA_CERRADA } = await import('./wa.js'); const v = ventanaDeLead(req.user!.storeId!, l.id); if (v.aplica && !v.abierta) return res.status(409).json({ error: MSG_VENTANA_CERRADA, ventanaCerrada: true }); }
  const mid = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, l.id, 'vendedor', texto);
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);
  const wa = await sendWhatsappText(req.user!.storeId!, l.wa_id || l.tel, texto, l.tel);
  marcarEnviado(mid, wa);
  res.json({ ok: true, enviadoPorWhatsapp: wa.ok, aviso: wa.ok ? undefined : wa.error });
});

// Anuncio → producto: para enviar el mensaje inicial correcto aunque no escriban el disparador.
api.get('/anuncios/:adId/producto', requireAuth, requireStore, async (req, res) => {
  const { productoDeAnuncio } = await import('./campana.js');
  const v = productoDeAnuncio(req.user!.storeId!, String(req.params.adId));
  res.json({ productId: v?.productId || '', auto: !!v?.auto });
});
api.post('/anuncios/:adId/producto', requireAuth, requireStore, async (req, res) => {
  const { vincularAnuncio } = await import('./campana.js');
  const pid = String(req.body?.productId || '');
  if (pid && !db.prepare('SELECT 1 FROM products WHERE id = ? AND store_id = ?').get(pid, req.user!.storeId)) return res.status(404).json({ error: 'Producto no encontrado.' });
  vincularAnuncio(req.user!.storeId!, String(req.params.adId), pid, String(req.body?.titular || ''), false);
  res.json({ ok: true });
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

// Plantillas APROBADAS de esta tienda (para enviarlas desde el chat, incluso
// fuera de la ventana de 24 h — para eso sirven las plantillas de Meta).
api.get('/plantillas-aprobadas', requireAuth, requireStore, (req, res) => {
  const rows = db.prepare(
    `SELECT t.id, t.nombre, t.idioma, t.categoria, t.encabezado, t.cuerpo, t.pie, t.ejemplos
       FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id
      WHERE p.store_id = ? AND p.estado = 'aprobada'
      ORDER BY t.categoria, t.nombre`,
  ).all(req.user!.storeId) as Record<string, unknown>[];
  const plantillas = rows.map((t) => {
    const vars = [...new Set([...String(t.cuerpo || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    return {
      id: t.id, nombre: t.nombre, idioma: t.idioma, categoria: t.categoria,
      encabezado: t.encabezado, cuerpo: t.cuerpo, pie: t.pie,
      variables: vars.length, ejemplos: pj<string[]>(t.ejemplos as string, []),
    };
  });
  res.json({ plantillas });
});

// Enviar una plantilla APROBADA a un chat. Funciona aunque hayan pasado 24 h.
api.post('/leads/:id/enviar-plantilla', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, sid) as
    | { id: string; tel: string; wa_id: string | null } | undefined;
  if (!l) return res.status(404).json({ error: 'Chat no encontrado.' });
  const t = db.prepare(
    `SELECT t.nombre, t.idioma, t.encabezado, t.cuerpo, t.ejemplos
       FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id
      WHERE p.store_id = ? AND p.template_id = ? AND p.estado = 'aprobada'`,
  ).get(sid, String(req.body?.plantillaId || '')) as
    | { nombre: string; idioma: string; encabezado: string; cuerpo: string; ejemplos: string } | undefined;
  if (!t) return res.status(400).json({ error: 'Esa plantilla no está aprobada para tu tienda todavía.' });
  // Parámetros: los que manden, o los ejemplos de la plantilla como respaldo.
  const nVars = [...new Set([...String(t.cuerpo || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].length;
  const ejemplos = pj<string[]>(t.ejemplos, []);
  const dados = Array.isArray(req.body?.params) ? (req.body.params as unknown[]).map((x) => String(x)) : [];
  const params = Array.from({ length: nVars }, (_, i) => dados[i] || ejemplos[i] || '');
  const r = await sendWhatsappTemplate(sid, l.wa_id || l.tel, { nombre: t.nombre, idioma: t.idioma, encabezado: t.encabezado, cuerpo: t.cuerpo }, params, l.tel);
  if (!r.ok) return res.status(400).json({ error: r.error });
  // Guarda el mensaje en el chat (texto renderizado) para que quede el registro.
  const mid = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, l.id, 'vendedor', r.textoRender || `[Plantilla: ${t.nombre}]`);
  marcarEnviado(mid, { ok: true, wamid: r.wamid });
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(req.user!.nombre, l.id);
  registrarLog(sid, 'info', 'envio', `Plantilla "${t.nombre}" enviada al chat.`);
  res.json({ ok: true });
});

// Marca (o desmarca) el consentimiento del cliente para recibir promociones.
api.post('/leads/:id/optin', requireAuth, requireStore, (req, res) => {
  const l = db.prepare('SELECT id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId);
  if (!l) return res.status(404).json({ error: 'Chat no encontrado.' });
  const optin = req.body?.optin === false ? 0 : 1;
  db.prepare('UPDATE leads SET promos_optin = ?, optin_at = CASE WHEN ? = 1 THEN datetime(\'now\') ELSE optin_at END WHERE id = ?')
    .run(optin, optin, req.params.id);
  res.json({ ok: true, optin: optin === 1 });
});

// Extrae (con IA + el resumen del chat) el pedido de una conversación para
// REVISAR y completar un pedido existente. No escribe nada.
api.post('/leads/:id/extraer-pedido', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const l = db.prepare('SELECT id, nombre, tel FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, sid) as { id: string; nombre: string; tel: string } | undefined;
  if (!l) return res.status(404).json({ error: 'Chat no encontrado.' });
  const { extraerPedidoDelChat, parsearPedidoInner } = await import('./ai.js');
  const inner = await extraerPedidoDelChat(sid, l.id);
  const p = inner ? parsearPedidoInner(sid, inner) : null;
  // Pedido existente del mismo cliente (por teléfono, últimos 10 dígitos).
  const telNorm = String(l.tel || '').replace(/\D/g, '').slice(-10);
  const orden = telNorm.length >= 7
    ? db.prepare("SELECT id, numero FROM orders WHERE store_id = ? AND replace(replace(replace(replace(tel,'+',''),' ',''),'-',''),'(','') LIKE ? ORDER BY numero DESC LIMIT 1").get(sid, '%' + telNorm) as { id: string; numero: number } | undefined
    : undefined;
  res.json({
    propuesta: p ? { cliente: (await import('./nombres.js')).resolverNombreCliente(l.id, p.cliente, l.nombre || ''), tel: l.tel || '', departamento: p.departamento, ciudad: p.ciudad, direccion: p.direccion, items: p.items, total: p.total } : null,
    ordenExistente: orden ? { rowId: orden.id, id: 'DF-' + orden.numero } : null,
  });
});

// Actualiza un pedido existente (datos de envío + ítems). Se usa desde "completar
// pedido desde el chat" tras la revisión del dueño.
api.put('/orders/:rowId', requireAuth, requireStore, (req, res) => {
  const sid = req.user!.storeId!;
  const o = db.prepare('SELECT id FROM orders WHERE id = ? AND store_id = ?').get(req.params.rowId, sid) as { id: string } | undefined;
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const b = req.body || {};
  const items = Array.isArray(b.items)
    ? b.items.map((it: { qty?: unknown; nombre?: unknown; precio?: unknown }) => ({ qty: Math.max(1, parseInt(String(it.qty), 10) || 1), nombre: String(it.nombre || '').trim(), precio: Math.max(0, Math.round(Number(it.precio) || 0)) })).filter((it: { nombre: string }) => it.nombre)
    : null;
  if (!String(b.cliente || '').trim()) return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  if (items && !items.length) return res.status(400).json({ error: 'El pedido debe tener al menos un producto.' });
  const envio = Math.max(0, Math.round(Number(b.envio) || 0));
  const totalItems = (items || []).reduce((a: number, it: { qty: number; precio: number }) => a + it.qty * it.precio, 0);
  const total = b.total != null && Number(b.total) > 0 ? Math.round(Number(b.total)) : totalItems + envio;
  db.prepare('UPDATE orders SET cliente = ?, tel = ?, ciudad = ?, departamento = ?, direccion = ?, nota = ?, envio = ?, total = ? WHERE id = ?')
    .run(String(b.cliente).trim(), String(b.tel || ''), String(b.ciudad || ''), String(b.departamento || ''), String(b.direccion || ''), String(b.nota || ''), envio, total, o.id);
  if (items) {
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(o.id);
    for (const it of items) { const ids = idsDeItem(sid, it.nombre); db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio, product_id, variant_id) VALUES (?,?,?,?,?,?,?)').run(uid(), o.id, it.qty, it.nombre, it.precio, ids.productId, ids.variantId); }
  }
  const numero = (db.prepare('SELECT numero FROM orders WHERE id = ?').get(o.id) as { numero: number }).numero;
  registrarLog(sid, 'info', 'pedido', `Pedido DF-${numero} completado/corregido desde el chat.`);
  res.json({ ok: true, id: 'DF-' + numero });
});

// Enviar un adjunto (imagen, video, audio o archivo) al lead.
api.post('/leads/:id/media', requireAuth, requireStore, async (req, res) => {
  const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(req.params.id, req.user!.storeId) as
    | { id: string; tel: string; wa_id: string | null }
    | undefined;
  if (!l) return res.status(404).json({ error: 'Lead no encontrado.' });
  { const { ventanaDeLead, MSG_VENTANA_CERRADA } = await import('./wa.js'); const v = ventanaDeLead(req.user!.storeId!, l.id); if (v.aplica && !v.abierta) return res.status(409).json({ error: MSG_VENTANA_CERRADA, ventanaCerrada: true }); }
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
  // Anti-baneo: el seguimiento automático viene APAGADO. Solo se enciende si el
  // dueño lo activa a propósito (seguimiento_on = 1).
  const on = seguimientoActivo === true ? 1 : 0;
  const estiloJson = estilo && typeof estilo === 'object' ? j(estilo) : '';
  if (estiloJson.length > 60_000) return res.status(400).json({ error: 'La configuración del asistente es demasiado larga. Resume la información del negocio o las preguntas frecuentes.' });
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas, nombre, seguimiento_on, estilo) VALUES (?,?,?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas, nombre = excluded.nombre, seguimiento_on = excluded.seguimiento_on, estilo = excluded.estilo`,
  ).run(req.user!.storeId, String(instrucciones || ''), j(Array.isArray(reglas) ? reglas : []), String(nombre || '').trim(), on, estiloJson);
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
  const { code, accessToken } = req.body || {};
  if (!code && !accessToken) return res.status(400).json({ error: 'Falta la autorización de Meta.' });
  const r = await conectarPaginasMeta(req.user!.storeId!, { code: code ? String(code) : undefined, accessToken: accessToken ? String(accessToken) : undefined });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, paginas: r.paginas });
});

// Diagnóstico de Messenger/Instagram: suscripción de cada página y último aviso de Meta.
api.get('/meta/diagnostico', requireAuth, requireStore, async (req, res) => {
  const m = await import('./meta.js');
  res.json({ ...(await m.diagnosticoMeta(req.user!.storeId!)), urlWebhook: `${(process.env.PUBLIC_APP_URL || `https://${req.get('host')}`).replace(/\/+$/, '')}/webhooks/whatsapp`, webhookSalud: { ultimoRecibido: webhookSalud.ultimoRecibido, rechazadosFirma: webhookSalud.rechazadosFirma } });
});
api.post('/meta/resuscribir', requireAuth, requireStore, requireOwner, async (req, res) => {
  const m = await import('./meta.js');
  res.json(await m.resuscribirPaginas(req.user!.storeId!));
});

// Fase C: API de Conversiones (reportar ventas y chats calificados a Meta).
api.get('/meta/capi', requireAuth, requireStore, async (req, res) => {
  res.json((await import('./metaCapi.js')).estadoCapi(req.user!.storeId!));
});
api.post('/meta/capi', requireAuth, requireStore, requireOwner, async (req, res) => {
  const c = await import('./metaCapi.js');
  c.guardarCfgCapi(req.user!.storeId!, req.body || {});
  res.json(c.estadoCapi(req.user!.storeId!));
});
api.post('/meta/capi/detectar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const c = await import('./metaCapi.js');
  const r = await c.detectarDataset(req.user!.storeId!);
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(c.estadoCapi(req.user!.storeId!));
});
api.post('/meta/capi/enviar', requireAuth, requireStore, requireOwner, async (req, res) => {
  const c = await import('./metaCapi.js');
  const n = await c.procesarCapi(req.user!.storeId!);
  res.json({ ...c.estadoCapi(req.user!.storeId!), enviados: n });
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
  try {
    const { conectarPorSignup } = await import('./metaSignup.js');
    const sid = req.user!.storeId!;
    const r = await conectarPorSignup(sid, String(code || '').trim(), String(wabaId || '').trim(), String(phoneNumberId || '').trim());
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ conectado: true, numero: r.numero, aviso: r.aviso });
    // En segundo plano: publica las plantillas maestras en la WABA recién conectada,
    // para que las tiendas nuevas reciban las plantillas sin republicar a mano.
    void import('./metaTemplates.js').then((m) => m.publicarTodasEnTienda(sid)).then((res2) => {
      if (res2.total) registrarLog(sid, 'info', 'plantilla', `Plantillas publicadas en la WABA nueva: ${res2.exitosas}/${res2.total}.`);
    }).catch(() => {});
  } catch (e) {
    // No dejamos que un fallo (red con Meta, respuesta rara, BD) reviente como 500
    // sin explicación: lo logueamos y devolvemos un error legible a la tienda.
    console.error('[whatsapp/embedded] excepción:', e instanceof Error ? e.stack || e.message : e,
      '· datos:', JSON.stringify({ code: !!code, wabaId: wabaId || '(vacío)', phoneNumberId: phoneNumberId || '(vacío)' }));
    res.status(500).json({ error: 'No pudimos completar la conexión con Meta. ' + (e instanceof Error ? e.message : 'Intenta de nuevo.') });
  }
});

// Chequeo del número contra Meta (calidad, límites, verificación) + enlaces al
// panel de Meta, incluido el de facturación: cada tienda pone su propio pago.
api.get('/whatsapp/estado', requireAuth, requireStore, requireOwner, async (req, res) => {
  const { estadoNumero } = await import('./waEstado.js');
  res.json(await estadoNumero(req.user!.storeId!));
});

// Monitor anti-baneo: combina el ritmo de envío (en memoria) con la calidad del
// número (Meta) para avisar en el panel cuando la calidad baja o cuando la cola
// del freno es tan larga que las respuestas se demoran.
api.get('/antibaneo/estado', requireAuth, requireStore, async (req, res) => {
  const sid = req.user!.storeId!;
  const { estadisticasEnvio } = await import('./ratelimit.js');
  const env = estadisticasEnvio(sid);
  let calidad = ''; let limite = '';
  try { const est = await import('./waEstado.js').then((m) => m.estadoNumero(sid)); calidad = est.calidad; limite = est.limite; } catch { /* la calidad es opcional */ }
  const avisos: string[] = [];
  let nivel: 'ok' | 'aviso' | 'alerta' = 'ok';
  const subir = (n: 'aviso' | 'alerta') => { if (nivel === 'ok' || (nivel === 'aviso' && n === 'alerta')) nivel = n; };
  // El freno por minuto y el espaciado anti-ráfaga son AUTOMÁTICOS: llegar al tope
  // no es culpa de la tienda ni un riesgo (el sistema ya está espaciando), así que
  // no se avisa. Solo se informa si la cola es larga y las respuestas se demoran.
  if (env.colaMs > 120_000) { subir('aviso'); avisos.push(`Muchos chats a la vez: el sistema está espaciando los envíos para proteger tu número, así que algunas respuestas pueden tardar hasta ${Math.ceil(env.colaMs / 60_000)} min.`); }
  if (calidad === 'YELLOW') { subir('aviso'); avisos.push('La calidad de tu número bajó a MEDIA. Cuida el tono y la frecuencia de los mensajes.'); }
  if (calidad === 'RED') { subir('alerta'); avisos.push('La calidad de tu número está en ROJO: tus clientes están bloqueando o reportando. Escribe solo a quien te escribió y usa plantillas aprobadas.'); }
  res.json({ nivel, porMinuto: env.porMinuto, tope: env.tope, cerca: env.cerca, calidad, limite, avisos });
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
  // En segundo plano: publica las plantillas maestras en la WABA recién conectada.
  const sidWa = req.user!.storeId!;
  void import('./metaTemplates.js').then((m) => m.publicarTodasEnTienda(sidWa)).then((res2) => {
    if (res2.total) registrarLog(sidWa, 'info', 'plantilla', `Plantillas publicadas en la WABA nueva: ${res2.exitosas}/${res2.total}.`);
  }).catch(() => {});
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
api.get('/admin/overview', requireAuth, requireAdmin, (req, res) => {
  // Las tiendas ocultas (fantasma) no aparecen para el admin normal. El SUPERADMIN
  // sí las ve (marcadas como ocultas) para poder entrar sin tener que desocultarlas.
  const esSuper = req.user!.role === 'SUPERADMIN';
  const filtro = esSuper
    ? "WHERE id != '" + MASTER_STORE_ID + "'" // ve todas menos la tienda interna de la biblioteca
    : 'WHERE COALESCE(oculta,0) = 0';
  const stores = (db.prepare(`SELECT * FROM stores ${filtro} ORDER BY created_at`).all() as Record<string, unknown>[]).map((s) => {
    const ventas = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END), 0) AS total
       FROM orders o WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
    ).get(s.id) as { total: number };
    return { id: s.id, tienda: s.nombre, correo: s.correo, plan: s.plan, ventas: ventas.total, activa: !!s.activa, planEstado: s.plan_estado || 'prueba', planVence: s.plan_vence || null, creditos: s.creditos || 0, temaPremium: !!s.tema_premium, oculta: !!s.oculta };
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
    { const e = claveInvalida(password, false); if (e) return res.status(400).json({ error: e }); }
    if (dueno) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), dueno.id);
  }
  res.json({ ok: true });
});

api.delete('/admin/stores/:id', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  // A la papelera (30 días): se guarda lo que la cascada borra y luego se borra.
  try { moverAPapelera(s.id, req.user!.email); } catch (e) { console.error('[papelera]', e); return res.status(500).json({ error: 'No pudimos eliminar la cuenta. Intenta de nuevo.' }); }
  res.json({ ok: true });
});

// ── Papelera de tiendas y copias diarias (solo superadmin) ──
api.get('/admin/papelera', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json({ tiendas: listarPapelera(), dias: DIAS_PAPELERA, respaldos: listarRespaldos(), espacio: espacioDisco() });
});
api.delete('/admin/papelera/:archivo', requireAuth, requireSuperAdmin, (req, res) => {
  registrarAccionEquipo(req.user!.email, `Eliminar definitivamente de la papelera (${String(req.params.archivo)})`);
  if (!eliminarDePapelera(String(req.params.archivo))) return res.status(404).json({ error: 'No está en la papelera.' });
  res.json({ ok: true, tiendas: listarPapelera(), espacio: espacioDisco() });
});
api.delete('/admin/respaldos/:archivo', requireAuth, requireSuperAdmin, (req, res) => {
  registrarAccionEquipo(req.user!.email, `Eliminar copia de la base (${String(req.params.archivo)})`);
  if (!eliminarRespaldo(String(req.params.archivo))) return res.status(404).json({ error: 'Copia no encontrada.' });
  res.json({ ok: true, respaldos: listarRespaldos(), espacio: espacioDisco() });
});
api.post('/admin/papelera/:archivo/restaurar', requireAuth, requireSuperAdmin, (req, res) => {
  registrarAccionEquipo(req.user!.email, `Restaurar tienda de la papelera (${String(req.params.archivo)})`);
  const r = restaurarDePapelera(String(req.params.archivo));
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json(r);
});
api.post('/admin/respaldos/ahora', requireAuth, requireSuperAdmin, async (req, res) => {
  registrarAccionEquipo(req.user!.email, 'Crear copia manual de la base');
  const r = await copiaDiaria(true);
  if ('error' in r) return res.status(400).json({ error: r.error, respaldos: listarRespaldos(), espacio: espacioDisco() });
  res.json({ ok: true, archivo: r.archivo, respaldos: listarRespaldos(), espacio: espacioDisco() });
});
api.get('/admin/respaldos/:archivo', requireAuth, requireSuperAdmin, async (req, res) => {
  registrarAccionEquipo(req.user!.email, `Descargar copia de la base (${String(req.params.archivo)})`);
  // Se entrega descifrada (lista para abrir); el archivo temporal se borra al terminar.
  const d = await prepararDescarga(String(req.params.archivo)).catch((e) => { console.error('[respaldos] descarga', e); return null; });
  if (!d) return res.status(404).json({ error: 'Copia no encontrada o no se pudo descifrar.' });
  res.download(d.ruta, String(req.params.archivo), () => d.limpiar());
});
// Seguridad: estado de los secretos del servidor y registro de accesos del equipo.
api.get('/admin/correo', requireAuth, requireSuperAdmin, async (_req, res) => {
  res.json((await import('./correo.js')).estadoCorreo());
});
api.post('/admin/correo/prueba', requireAuth, requireSuperAdmin, async (req, res) => {
  const c = await import('./correo.js');
  const para = String(req.body?.para || req.user!.email).trim();
  const r = await c.enviarCorreo({ para, tipo: 'prueba', asunto: 'Prueba de correos de DealFlow ✅', html: c.plantillaCorreo('¡Los correos de DealFlow funcionan! ✅', [`Proveedor: <b>${c.proveedorCorreo() || 'sin configurar'}</b>.`, 'Si este correo cayó en spam, revisa los registros SPF, DKIM y DMARC del dominio.']) });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

api.get('/admin/seguridad', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json({ estado: estadoSeguridad(), accesos: listarAccesos(200) });
});
// Estado del cifrado propio y una llave nueva para configurarlo (no se guarda en ningún lado).
api.get('/admin/cifrado', requireAuth, requireSuperAdmin, async (_req, res) => {
  const { cifradoActivo, llaveNueva } = await import('./cifrado.js');
  const activo = cifradoActivo();
  res.json({ activo, llaveSugerida: activo ? '' : llaveNueva() });
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
    `SELECT COALESCE(SUM(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END),0) t
     FROM orders o WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
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

// Onboarding: configura de un tirón el asistente de una tienda (nombre, tono,
// instrucciones, reglas) y crea sus productos por nombre. Para dar de alta un
// cliente desde su cuestionario. No pisa lo que no se envíe.
api.post('/admin/stores/:id/onboarding', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const sid = req.params.id;
  const { nombre, estilo, instrucciones, reglas, productos } = req.body || {};
  const reglasArr = Array.isArray(reglas) ? reglas.map((r) => String(r).trim()).filter(Boolean) : [];
  const estiloJson = estilo && typeof estilo === 'object' ? j(estilo) : '';
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas, nombre, estilo) VALUES (?,?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas, nombre = excluded.nombre, estilo = excluded.estilo`,
  ).run(sid, String(instrucciones || ''), j(reglasArr), String(nombre || '').trim(), estiloJson);
  // Productos por nombre (salta los que ya existan por nombre).
  let creados = 0;
  for (const raw of Array.isArray(productos) ? productos : []) {
    const nom = String(raw || '').trim();
    if (!nom) continue;
    const existe = db.prepare('SELECT 1 FROM products WHERE store_id = ? AND lower(nombre) = lower(?)').get(sid, nom);
    if (existe) continue;
    const pid = uid();
    db.prepare("INSERT INTO products (id, store_id, nombre, precio, tipo) VALUES (?,?,?,0,'producto')").run(pid, sid, nom);
    db.prepare("INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?, 'Única', 0, 0)").run(uid(), pid);
    creados++;
  }
  res.json({ ok: true, productosCreados: creados });
});

// Entrar a una tienda (impersonar) para dar soporte. Lo usan el panel del admin y
// el selector de la barra de soporte (cambiar de tienda sin volver al panel).
function entrarATiendaComo(res: ExResponse, hostname: string, storeId: string, adminId: string): string | null {
  const s = db.prepare('SELECT id, correo, owner_user_id FROM stores WHERE id = ?').get(storeId) as { id: string; correo: string; owner_user_id: string | null } | undefined;
  if (!s) return 'Cuenta no encontrada.';
  // Buscamos al dueño por owner_user_id (fuente de verdad) y, si no, por correo.
  // NO exigimos que su store_id apunte a esta tienda: en cuentas con varias
  // tiendas, el usuario "vive" en una a la vez, pero es dueño de todas.
  type Dueno = { id: string; email: string; nombre: string; role: 'VENDEDOR' | 'ADMIN' };
  const dueno = (s.owner_user_id
    ? db.prepare("SELECT id, email, nombre, role FROM users WHERE id = ?").get(s.owner_user_id) as Dueno | undefined
    : undefined)
    || (db.prepare("SELECT id, email, nombre, role FROM users WHERE email = ? ORDER BY (role = 'VENDEDOR') DESC, created_at LIMIT 1").get(s.correo) as Dueno | undefined);
  if (!dueno) return 'Esta tienda no tiene un dueño para entrar.';
  // Entramos EN esta tienda (storeId = s.id), sin importar dónde estuviera parado el dueño.
  setAuthCookie(res, { id: dueno.id, email: dueno.email, nombre: dueno.nombre, role: dueno.role, storeId: s.id, imp: adminId }, hostname);
  return null;
}

api.post('/admin/stores/:id/impersonate', requireAuth, requireAdmin, (req, res) => {
  const err = entrarATiendaComo(res, req.hostname, req.params.id, req.user!.id);
  if (err) return res.status(404).json({ error: err });
  res.json({ ok: true });
});

// ── Trazabilidad de pedidos (equipo DealFlow) ─────────────────────────
// Lista de eventos de todas las tiendas con filtros, y la línea de tiempo de un pedido.
api.get('/admin/trazabilidad', requireAuth, requireAdmin, (req, res) => {
  const q = req.query as Record<string, string>;
  const where: string[] = []; const args: unknown[] = [];
  if (req.user!.role !== 'SUPERADMIN') where.push('COALESCE(s.oculta,0) = 0');
  if (q.store) { where.push('e.store_id = ?'); args.push(q.store); }
  if (q.nivel === 'problemas') where.push("e.nivel IN ('warn','error')");
  else if (q.nivel) { where.push('e.nivel = ?'); args.push(q.nivel); }
  if (q.etapa) { where.push('e.etapa = ?'); args.push(q.etapa); }
  if (q.antes) { where.push('e.id < ?'); args.push(Number(q.antes)); }
  if (q.desde) { where.push('e.created_at >= ?'); args.push(String(q.desde)); }
  const texto = String(q.q || '').trim();
  if (texto) {
    const num = texto.replace(/^df-?/i, '').replace(/\D/g, '');
    const like = '%' + texto.replace(/[%_]/g, '') + '%';
    where.push('(o.cliente LIKE ? OR o.tel LIKE ? OR o.guia LIKE ? OR o.effi_remision LIKE ? OR e.titulo LIKE ? OR e.detalle LIKE ?' + (num ? ' OR o.numero = ?' : '') + ')');
    args.push(like, like, like, like, like, like, ...(num ? [Number(num)] : []));
  }
  const lim = Math.min(300, Math.max(20, Number(q.limit) || 100));
  const rows = db.prepare(`SELECT e.id, e.store_id, s.nombre tienda, e.order_id, o.numero, o.cliente, o.estado, e.etapa, e.nivel, e.titulo, e.detalle, e.created_at, (e.datos != '') tieneDatos
    FROM order_eventos e LEFT JOIN orders o ON o.id = e.order_id LEFT JOIN stores s ON s.id = e.store_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT ${lim}`).all(...args);
  // Resumen de las últimas 24 h para la cabecera.
  const resumen = db.prepare(`SELECT
      SUM(CASE WHEN e.etapa = 'pedido' THEN 1 ELSE 0 END) pedidos,
      SUM(CASE WHEN e.etapa = 'despacho' AND e.nivel = 'ok' THEN 1 ELSE 0 END) despachos,
      SUM(CASE WHEN e.etapa IN ('despacho','guia') AND e.nivel = 'error' THEN 1 ELSE 0 END) fallos,
      SUM(CASE WHEN e.etapa = 'api' AND e.nivel = 'error' THEN 1 ELSE 0 END) apiFallos
    FROM order_eventos e LEFT JOIN stores s ON s.id = e.store_id
    WHERE e.created_at >= datetime('now','-1 day')${req.user!.role !== 'SUPERADMIN' ? ' AND COALESCE(s.oculta,0) = 0' : ''}${q.store ? ' AND e.store_id = ?' : ''}`).get(...(q.store ? [q.store] : []));
  res.json({ eventos: rows, resumen });
});

api.get('/admin/trazabilidad/pedido/:orderId', requireAuth, requireAdmin, (req, res) => {
  const o = db.prepare(`SELECT o.id, o.store_id, s.nombre tienda, o.numero, o.cliente, o.tel, o.ciudad, o.departamento, o.direccion, o.estado, o.total, o.envio,
      o.origen, o.despacho_proveedor, o.effi_remision, o.dropi_order_id, o.guia, o.transportadora, o.estado_woo, o.created_at
    FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = ?`).get(req.params.orderId) as Record<string, unknown> | undefined;
  const eventos = (db.prepare('SELECT id, etapa, nivel, titulo, detalle, datos, created_at FROM order_eventos WHERE order_id = ? ORDER BY id').all(req.params.orderId) as Record<string, unknown>[])
    .map((e) => ({ ...e, datos: e.datos ? pj(String(e.datos), String(e.datos)) : null }));
  const items = o ? db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(req.params.orderId) : [];
  res.json({ pedido: o || null, items, eventos });
});

// Barra de soporte: el admin que está DENTRO de una tienda puede listar las tiendas
// y saltar a otra directamente. Se valida contra el admin original (imp).
function adminDeSoporte(req: ExRequest): { id: string; role: string } | undefined {
  const adminId = req.user?.imp;
  if (!adminId) return undefined;
  return db.prepare("SELECT id, role FROM users WHERE id = ? AND role IN ('ADMIN','SUPERADMIN')").get(adminId) as { id: string; role: string } | undefined;
}
api.get('/auth/soporte/tiendas', requireAuth, (req, res) => {
  const admin = adminDeSoporte(req);
  if (!admin) return res.status(403).json({ error: 'Solo el equipo DealFlow en modo soporte.' });
  const filtro = admin.role === 'SUPERADMIN' ? "WHERE id != '" + MASTER_STORE_ID + "'" : "WHERE COALESCE(oculta,0) = 0 AND id != '" + MASTER_STORE_ID + "'";
  const tiendas = db.prepare(`SELECT id, nombre FROM stores ${filtro} ORDER BY nombre COLLATE NOCASE`).all() as { id: string; nombre: string }[];
  res.json({ tiendas, actual: req.user!.storeId });
});
api.post('/auth/soporte/cambiar/:id', requireAuth, (req, res) => {
  const admin = adminDeSoporte(req);
  if (!admin) return res.status(403).json({ error: 'Solo el equipo DealFlow en modo soporte.' });
  if (admin.role !== 'SUPERADMIN') {
    const oculta = db.prepare('SELECT COALESCE(oculta,0) AS o FROM stores WHERE id = ?').get(req.params.id) as { o: number } | undefined;
    if (oculta?.o) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  }
  const err = entrarATiendaComo(res, req.hostname, req.params.id, admin.id);
  if (err) return res.status(404).json({ error: err });
  res.json({ ok: true });
});

// Poner TODOS los chats de una tienda en intervención humana (que los atienda una
// persona y NO el asistente). Útil para pausar el bot en una tienda de golpe.
api.post('/admin/stores/:id/intervenir-todos', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare('SELECT id, correo, nombre FROM stores WHERE id = ?').get(req.params.id) as { id: string; correo: string; nombre: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const dueno = db.prepare('SELECT nombre FROM users WHERE store_id = ? AND email = ?').get(s.id, s.correo) as { nombre: string } | undefined;
  const nombre = (String(req.body?.nombre || '').trim() || dueno?.nombre || 'Equipo').slice(0, 60);
  // Un chat "atendido por humano" es cualquier asignado que NO sea el asistente/bot.
  const info = db.prepare("UPDATE leads SET asignado = ? WHERE store_id = ?").run(nombre, s.id);
  registrarLog(s.id, 'info', 'inbox', `Todos los chats (${info.changes}) puestos en intervención humana: ahora atiende ${nombre}, no el asistente.`);
  res.json({ ok: true, intervenidos: info.changes, nombre });
});

// Auditoría anti-baneo: recorre todos los chats de la tienda y reporta las
// posibles infracciones a la política de WhatsApp (por qué Meta pudo banear).
api.get('/admin/stores/:id/auditoria-baneo', requireAuth, requireAdmin, async (req, res) => {
  const s = db.prepare('SELECT id FROM stores WHERE id = ?').get(req.params.id) as { id: string } | undefined;
  if (!s) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const { auditarBaneo } = await import('./auditoria.js');
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined;
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : undefined;
  const reporte = auditarBaneo(s.id, desde, hasta);
  if (!reporte) return res.status(404).json({ error: 'No se pudo auditar la tienda.' });
  res.json({ reporte });
});

// Barrido contra la API de Meta: consulta los números que HOY tiene la WABA de la
// tienda y actualiza el phone_number_id/numero guardado (para cuando la tienda
// cambió de número en Meta pero DealFlow seguía con el anterior). requireAdmin.
api.post('/admin/stores/:id/whatsapp/sync', requireAuth, requireAdmin, async (req, res) => {
  const sid = req.params.id;
  const wa = db.prepare('SELECT waba_id, phone_number_id, access_token, numero FROM whatsapp WHERE store_id = ?').get(sid) as
    | { waba_id: string; phone_number_id: string; access_token: string; numero: string }
    | undefined;
  if (!wa || !wa.access_token) return res.status(400).json({ error: 'Esta tienda no tiene WhatsApp conectado (sin token). Conéctalo primero en Integraciones.' });
  if (!wa.waba_id) return res.status(400).json({ error: 'No hay WABA ID guardado para esta tienda. Reconéctala en Integraciones para poder sincronizar.' });
  const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
  let numeros: { id: string; numero: string; nombre: string }[] = [];
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(wa.waba_id)}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(wa.access_token)}`);
    const b = (await r.json()) as { data?: { id: string; display_phone_number?: string; verified_name?: string }[]; error?: { message?: string } };
    if (!r.ok || b.error) return res.status(400).json({ error: b.error?.message || 'Meta no aceptó la consulta (¿el token sigue vigente?).' });
    numeros = (b.data || []).map((n) => ({ id: n.id, numero: n.display_phone_number || '', nombre: n.verified_name || '' }));
  } catch {
    return res.status(502).json({ error: 'No pudimos hablar con Meta. Intenta de nuevo.' });
  }
  if (!numeros.length) return res.status(400).json({ error: 'Meta no devolvió ningún número para esta WABA.' });

  // Aplica un número: el que pidió el admin, o el único, o (si hay varios y ninguno
  // coincide con el guardado) se devuelve la lista para que elija.
  const pedido = String(req.body?.phoneNumberId || '').trim();
  let elegido = numeros.find((n) => n.id === pedido);
  if (!elegido && numeros.length === 1) elegido = numeros[0];
  if (!elegido) {
    const yaEsta = numeros.some((n) => n.id === wa.phone_number_id);
    return res.json({ ok: false, needsChoice: true, actual: { phoneNumberId: wa.phone_number_id, numero: wa.numero, sigueEnMeta: yaEsta }, numeros });
  }
  // Un número solo puede estar activo en una tienda: desconéctalo en otras.
  db.prepare("UPDATE whatsapp SET conectado = 0 WHERE phone_number_id = ? AND store_id != ?").run(elegido.id, sid);
  db.prepare("UPDATE whatsapp SET phone_number_id = ?, numero = ?, conectado = 1 WHERE store_id = ?").run(elegido.id, elegido.numero, sid);
  registrarLog(sid, 'info', 'whatsapp', `Número sincronizado con Meta: ahora ${elegido.numero} (phone_number_id ${elegido.id}).`);
  res.json({ ok: true, aplicado: { phoneNumberId: elegido.id, numero: elegido.numero, nombre: elegido.nombre }, numeros, anterior: { phoneNumberId: wa.phone_number_id, numero: wa.numero } });
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
  const { nombre, correo, plan = PLAN_UNICO, password } = req.body || {};
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
// Tiendas ocultas (del superadmin): un admin normal no las ve ni puede operar en ellas.
const tiendaVedada = (req: ExRequest, storeId: string): boolean => {
  if (req.user!.role === 'SUPERADMIN') return false;
  const s = db.prepare('SELECT COALESCE(oculta,0) o FROM stores WHERE id = ?').get(storeId) as { o: number } | undefined;
  return !!s?.o;
};

api.get('/superadmin/stores', requireAuth, requireAdmin, (req, res) => {
  // Excluimos la tienda interna "master" de la biblioteca (no es una tienda real) y,
  // para el admin normal, las tiendas ocultas del superadmin.
  const soloVisibles = req.user!.role !== 'SUPERADMIN' ? ' AND COALESCE(oculta,0) = 0' : '';
  const stores = (db.prepare(`SELECT * FROM stores WHERE id != ?${soloVisibles} ORDER BY created_at`).all(MASTER_STORE_ID) as Record<string, unknown>[]).map((s) => {
    const ventas = (db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END),0) t
       FROM orders o WHERE o.store_id = ? AND o.created_at >= date('now','start of month')`,
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

// ── Plantillas de mensajes de Meta (superadmin, para TODAS las tiendas) ──
// Lista las plantillas maestras + un resumen del estado de publicación por tienda.
api.get('/superadmin/meta-templates', requireAuth, requireSuperAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM meta_templates ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const plantillas = rows.map((r) => {
    const est = db.prepare(
      "SELECT estado, COUNT(*) n FROM meta_template_pub WHERE template_id = ? GROUP BY estado",
    ).all(r.id) as { estado: string; n: number }[];
    const resumen = { aprobada: 0, pendiente: 0, rechazada: 0, error: 0 } as Record<string, number>;
    for (const e of est) resumen[e.estado] = e.n;
    return {
      id: r.id, nombre: r.nombre, categoria: r.categoria, idioma: r.idioma,
      encabezado: r.encabezado || '', cuerpo: r.cuerpo, pie: r.pie || '',
      botones: pj(r.botones as string, []), ejemplos: pj(r.ejemplos as string, []),
      publicadas: (est.reduce((a, e) => a + e.n, 0)), resumen,
    };
  });
  const tiendasCloud = (db.prepare("SELECT COUNT(*) n FROM whatsapp WHERE conectado = 1 AND modo = 'cloud' AND COALESCE(waba_id,'') != ''").get() as { n: number }).n;
  res.json({ plantillas, tiendasCloud });
});

const NOMBRE_TPL = /^[a-z0-9_]{1,60}$/;
api.post('/superadmin/meta-templates', requireAuth, requireSuperAdmin, (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim().toLowerCase();
  if (!NOMBRE_TPL.test(nombre)) return res.status(400).json({ error: 'El nombre debe ser minúsculas, números y guion bajo (sin espacios ni tildes).' });
  if (!String(b.cuerpo || '').trim()) return res.status(400).json({ error: 'El cuerpo del mensaje es obligatorio.' });
  { const malo = problemaVariables(String(b.cuerpo)); if (malo) return res.status(400).json({ error: malo }); }
  if (db.prepare('SELECT 1 FROM meta_templates WHERE nombre = ?').get(nombre)) return res.status(400).json({ error: 'Ya existe una plantilla con ese nombre.' });
  const id = uid();
  db.prepare(
    `INSERT INTO meta_templates (id, nombre, categoria, idioma, encabezado, cuerpo, pie, botones, ejemplos)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, nombre, b.categoria === 'MARKETING' ? 'MARKETING' : 'UTILITY', String(b.idioma || 'es'),
    String(b.encabezado || ''), String(b.cuerpo), String(b.pie || ''),
    JSON.stringify(Array.isArray(b.botones) ? b.botones : []), JSON.stringify(Array.isArray(b.ejemplos) ? b.ejemplos : []));
  res.json({ ok: true, id });
});

api.put('/superadmin/meta-templates/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const t = db.prepare('SELECT id FROM meta_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  const b = req.body || {};
  if (!String(b.cuerpo || '').trim()) return res.status(400).json({ error: 'El cuerpo del mensaje es obligatorio.' });
  { const malo = problemaVariables(String(b.cuerpo)); if (malo) return res.status(400).json({ error: malo }); }
  db.prepare(
    `UPDATE meta_templates SET categoria = ?, idioma = ?, encabezado = ?, cuerpo = ?, pie = ?, botones = ?, ejemplos = ? WHERE id = ?`,
  ).run(b.categoria === 'MARKETING' ? 'MARKETING' : 'UTILITY', String(b.idioma || 'es'),
    String(b.encabezado || ''), String(b.cuerpo), String(b.pie || ''),
    JSON.stringify(Array.isArray(b.botones) ? b.botones : []), JSON.stringify(Array.isArray(b.ejemplos) ? b.ejemplos : []), req.params.id);
  res.json({ ok: true });
});

api.delete('/superadmin/meta-templates/:id', requireAuth, requireSuperAdmin, (req, res) => {
  db.prepare('DELETE FROM meta_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Publica la plantilla en la WABA de TODAS las tiendas Cloud API (una acción).
api.post('/superadmin/meta-templates/:id/publicar', requireAuth, requireSuperAdmin, async (req, res) => {
  const t = db.prepare('SELECT id FROM meta_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  const { publicarEnTodas } = await import('./metaTemplates.js');
  const r = await publicarEnTodas(req.params.id);
  res.json({ ok: true, ...r });
});

// Envía TODAS las plantillas a verificación en TODAS las tiendas que aún NO las
// tienen aprobadas (un clic). Corre en segundo plano; el panel consulta el progreso.
api.post('/superadmin/meta-templates/publicar-todas', requireAuth, requireSuperAdmin, async (_req, res) => {
  const { enviarTodasEnSegundoPlano } = await import('./metaTemplates.js');
  res.json({ ok: true, ...enviarTodasEnSegundoPlano() });
});
api.get('/superadmin/meta-templates/progreso', requireAuth, requireSuperAdmin, async (_req, res) => {
  const { progresoEnvio } = await import('./metaTemplates.js');
  res.json({ ok: true, ...progresoEnvio });
});
// Consulta a Meta el estado real de TODAS las plantillas en todas las tiendas.
api.post('/superadmin/meta-templates/refrescar-todas', requireAuth, requireSuperAdmin, async (_req, res) => {
  const { sincronizarTodas } = await import('./metaTemplates.js');
  res.json({ ok: true, ...(await sincronizarTodas(false)) });
});
// Estado de UNA plantilla en cada tienda (para ver cuál falta y por qué).
api.get('/superadmin/meta-templates/:id/tiendas', requireAuth, requireSuperAdmin, (req, res) => {
  const filas = db.prepare(
    `SELECT s.id store_id, s.nombre, COALESCE(p.estado,'sin_enviar') estado, COALESCE(p.motivo,'') motivo, COALESCE(p.updated_at,'') updated_at
       FROM whatsapp w JOIN stores s ON s.id = w.store_id
       LEFT JOIN meta_template_pub p ON p.store_id = w.store_id AND p.template_id = ?
      WHERE w.conectado = 1 AND w.modo = 'cloud' AND COALESCE(w.waba_id,'') != ''
      ORDER BY CASE COALESCE(p.estado,'sin_enviar') WHEN 'aprobada' THEN 9 ELSE 0 END, s.nombre`,
  ).all(req.params.id);
  res.json({ tiendas: filas });
});

// Refresca el estado de aprobación consultando a Meta por cada tienda.
api.post('/superadmin/meta-templates/:id/refrescar', requireAuth, requireSuperAdmin, async (req, res) => {
  const t = db.prepare('SELECT id FROM meta_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  const { sincronizarEstado } = await import('./metaTemplates.js');
  const r = await sincronizarEstado(req.params.id);
  res.json({ ok: true, ...r });
});

// ── Academy (portal educativo) ───────────────────────────────────────
// Lectura: cualquier usuario logueado. Escritura: admin/superadmin.
const mapCurso = (c: Record<string, unknown>) => ({
  id: c.id, titulo: c.titulo, descripcion: c.descripcion, portada: c.portada || '',
  nivel: c.nivel || 'Básico', orden: c.orden ?? 0, publicado: Number(c.publicado) === 1,
});
const mapLeccion = (l: Record<string, unknown>) => ({
  id: l.id, cursoId: l.curso_id, seccionId: l.seccion_id || '', titulo: l.titulo, tipo: l.tipo || 'video',
  videoUrl: l.video_url || '', contenido: l.contenido || '', duracion: l.duracion || '',
  orden: l.orden ?? 0, publicado: Number(l.publicado) === 1,
  // Guía paso a paso con capturas: [{url, caption}]. Independiente del tipo (video o artículo).
  imagenes: pj<{ url: string; caption?: string }[]>(l.imagenes as string, []),
  // Varios videos por lección: [{url, titulo}]. Compat: si está vacío y hay video_url, se usa ese.
  videos: pj<{ url: string; titulo?: string }[]>(l.videos as string, []),
});
const mapSeccion = (s: Record<string, unknown>) => ({
  id: s.id, cursoId: s.curso_id, titulo: s.titulo || '', orden: s.orden ?? 0,
});

/** Devuelve las secciones de un curso con sus lecciones anidadas y ordenadas.
 *  `soloPublicado` filtra lecciones ocultas (portal); en admin se ve todo. */
function seccionesDeCurso(cursoId: string, soloPublicado: boolean) {
  const secs = db.prepare('SELECT * FROM academy_secciones WHERE curso_id = ? ORDER BY orden, created_at')
    .all(cursoId) as Record<string, unknown>[];
  const filtro = soloPublicado ? ' AND publicado = 1' : '';
  return secs.map((s) => ({
    ...mapSeccion(s),
    lecciones: (db.prepare(`SELECT * FROM academy_lecciones WHERE seccion_id = ?${filtro} ORDER BY orden, created_at`)
      .all(s.id) as Record<string, unknown>[]).map(mapLeccion),
  }));
}

api.get('/academy/cursos', requireAuth, (_req, res) => {
  const cursos = db.prepare("SELECT * FROM academy_cursos WHERE publicado = 1 ORDER BY orden, created_at").all() as Record<string, unknown>[];
  res.json({
    cursos: cursos.map((c) => ({
      ...mapCurso(c),
      lecciones: (db.prepare("SELECT COUNT(*) n FROM academy_lecciones WHERE curso_id = ? AND publicado = 1").get(c.id) as { n: number }).n,
    })),
  });
});
api.get('/academy/cursos/:id', requireAuth, (req, res) => {
  const c = db.prepare("SELECT * FROM academy_cursos WHERE id = ? AND publicado = 1").get(req.params.id) as Record<string, unknown> | undefined;
  if (!c) return res.status(404).json({ error: 'Curso no encontrado.' });
  const secciones = seccionesDeCurso(req.params.id, true);
  // Lecciones que ESTE usuario ya marcó como completadas (para el progreso).
  const completadas = (db.prepare(
    `SELECT p.leccion_id id FROM academy_progreso p
       JOIN academy_lecciones l ON l.id = p.leccion_id
      WHERE p.user_id = ? AND p.completado = 1 AND l.curso_id = ?`,
  ).all(req.user!.id, req.params.id) as { id: string }[]).map((r) => r.id);
  // Compat: lecciones planas (por si algún cliente viejo aún las espera).
  const lecciones = secciones.flatMap((s) => s.lecciones);
  res.json({ curso: { ...mapCurso(c), secciones, lecciones, completadas } });
});

// Admin: ve TODO (incluye no publicados) con sus lecciones anidadas.
api.get('/admin/academy/cursos', requireAuth, requireAdmin, (_req, res) => {
  const cursos = db.prepare("SELECT * FROM academy_cursos ORDER BY orden, created_at").all() as Record<string, unknown>[];
  res.json({
    cursos: cursos.map((c) => {
      const secciones = seccionesDeCurso(c.id as string, false);
      return {
        ...mapCurso(c),
        secciones,
        // Compat: lista plana de todas las lecciones del curso.
        lecciones: secciones.flatMap((s) => s.lecciones),
      };
    }),
  });
});
api.post('/admin/academy/cursos', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!String(b.titulo || '').trim()) return res.status(400).json({ error: 'El título es obligatorio.' });
  const id = uid();
  const orden = (db.prepare("SELECT COALESCE(MAX(orden),0)+1 n FROM academy_cursos").get() as { n: number }).n;
  db.prepare("INSERT INTO academy_cursos (id, titulo, descripcion, portada, nivel, orden, publicado) VALUES (?,?,?,?,?,?,?)")
    .run(id, String(b.titulo).trim(), String(b.descripcion || ''), String(b.portada || ''), String(b.nivel || 'Básico'), orden, b.publicado ? 1 : 0);
  // Modelo Udemy: todo curso arranca con una sección para colgar sus lecciones.
  db.prepare("INSERT INTO academy_secciones (id, curso_id, titulo, orden) VALUES (?,?,?,0)")
    .run(uid(), id, 'Contenido del curso');
  res.json({ ok: true, id });
});
api.put('/admin/academy/cursos/:id', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare("SELECT id FROM academy_cursos WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Curso no encontrado.' });
  const b = req.body || {};
  db.prepare("UPDATE academy_cursos SET titulo = ?, descripcion = ?, portada = ?, nivel = ?, orden = ?, publicado = ? WHERE id = ?")
    .run(String(b.titulo || '').trim(), String(b.descripcion || ''), String(b.portada || ''), String(b.nivel || 'Básico'), Number(b.orden) || 0, b.publicado ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
api.delete('/admin/academy/cursos/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM academy_lecciones WHERE curso_id = ?").run(req.params.id);
  db.prepare("DELETE FROM academy_cursos WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
api.post('/admin/academy/cursos/:id/lecciones', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare("SELECT id FROM academy_cursos WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Curso no encontrado.' });
  const b = req.body || {};
  if (!String(b.titulo || '').trim()) return res.status(400).json({ error: 'El título de la lección es obligatorio.' });
  // La lección vive dentro de una sección del curso. Si no llega seccionId (o no
  // es de este curso), la colgamos de la primera sección; si el curso no tiene
  // ninguna todavía, se crea una por defecto.
  let seccionId = String(b.seccionId || '');
  const secOk = seccionId && db.prepare('SELECT 1 FROM academy_secciones WHERE id = ? AND curso_id = ?').get(seccionId, req.params.id);
  if (!secOk) {
    const primera = db.prepare('SELECT id FROM academy_secciones WHERE curso_id = ? ORDER BY orden, created_at LIMIT 1').get(req.params.id) as { id: string } | undefined;
    if (primera) seccionId = primera.id;
    else { seccionId = uid(); db.prepare("INSERT INTO academy_secciones (id, curso_id, titulo, orden) VALUES (?,?,?,0)").run(seccionId, req.params.id, 'Contenido del curso'); }
  }
  const id = uid();
  const orden = (db.prepare("SELECT COALESCE(MAX(orden),0)+1 n FROM academy_lecciones WHERE seccion_id = ?").get(seccionId) as { n: number }).n;
  db.prepare("INSERT INTO academy_lecciones (id, curso_id, seccion_id, titulo, tipo, video_url, contenido, duracion, orden, publicado, imagenes, videos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, req.params.id, seccionId, String(b.titulo).trim(), b.tipo === 'articulo' ? 'articulo' : 'video', String(b.videoUrl || ''), String(b.contenido || ''), String(b.duracion || ''), orden, b.publicado === false ? 0 : 1, j(Array.isArray(b.imagenes) ? b.imagenes : []), j(Array.isArray(b.videos) ? b.videos : []));
  res.json({ ok: true, id });
});
api.put('/admin/academy/lecciones/:id', requireAuth, requireAdmin, (req, res) => {
  const l = db.prepare("SELECT id, curso_id FROM academy_lecciones WHERE id = ?").get(req.params.id) as { id: string; curso_id: string } | undefined;
  if (!l) return res.status(404).json({ error: 'Lección no encontrada.' });
  const b = req.body || {};
  const imagenes = j(Array.isArray(b.imagenes) ? b.imagenes : []);
  const videos = j(Array.isArray(b.videos) ? b.videos : []);
  // Permitir mover la lección a otra sección del MISMO curso (drag entre secciones).
  let seccionId: string | undefined;
  if (b.seccionId !== undefined) {
    const ok = db.prepare('SELECT 1 FROM academy_secciones WHERE id = ? AND curso_id = ?').get(String(b.seccionId), l.curso_id);
    if (ok) seccionId = String(b.seccionId);
  }
  if (seccionId) {
    db.prepare("UPDATE academy_lecciones SET titulo = ?, tipo = ?, video_url = ?, contenido = ?, duracion = ?, orden = ?, publicado = ?, seccion_id = ?, imagenes = ?, videos = ? WHERE id = ?")
      .run(String(b.titulo || '').trim(), b.tipo === 'articulo' ? 'articulo' : 'video', String(b.videoUrl || ''), String(b.contenido || ''), String(b.duracion || ''), Number(b.orden) || 0, b.publicado === false ? 0 : 1, seccionId, imagenes, videos, req.params.id);
  } else {
    db.prepare("UPDATE academy_lecciones SET titulo = ?, tipo = ?, video_url = ?, contenido = ?, duracion = ?, orden = ?, publicado = ?, imagenes = ?, videos = ? WHERE id = ?")
      .run(String(b.titulo || '').trim(), b.tipo === 'articulo' ? 'articulo' : 'video', String(b.videoUrl || ''), String(b.contenido || ''), String(b.duracion || ''), Number(b.orden) || 0, b.publicado === false ? 0 : 1, imagenes, videos, req.params.id);
  }
  res.json({ ok: true });
});
api.delete('/admin/academy/lecciones/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM academy_lecciones WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Secciones (admin): crear, renombrar, reordenar, borrar.
api.post('/admin/academy/cursos/:id/secciones', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare("SELECT id FROM academy_cursos WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Curso no encontrado.' });
  const b = req.body || {};
  const id = uid();
  const orden = (db.prepare("SELECT COALESCE(MAX(orden),0)+1 n FROM academy_secciones WHERE curso_id = ?").get(req.params.id) as { n: number }).n;
  db.prepare("INSERT INTO academy_secciones (id, curso_id, titulo, orden) VALUES (?,?,?,?)")
    .run(id, req.params.id, String(b.titulo || 'Nueva sección').trim() || 'Nueva sección', orden);
  res.json({ ok: true, id });
});
api.put('/admin/academy/secciones/:id', requireAuth, requireAdmin, (req, res) => {
  const s = db.prepare("SELECT id FROM academy_secciones WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sección no encontrada.' });
  const b = req.body || {};
  db.prepare("UPDATE academy_secciones SET titulo = ?, orden = ? WHERE id = ?")
    .run(String(b.titulo || '').trim(), Number(b.orden) || 0, req.params.id);
  res.json({ ok: true });
});
api.delete('/admin/academy/secciones/:id', requireAuth, requireAdmin, (req, res) => {
  // Al borrar una sección se borran sus lecciones (deja el curso consistente).
  db.prepare("DELETE FROM academy_lecciones WHERE seccion_id = ?").run(req.params.id);
  db.prepare("DELETE FROM academy_secciones WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
// Reordenar en lote (drag & drop): { secciones:[{id,orden}], lecciones:[{id,orden,seccionId}] }.
api.put('/admin/academy/cursos/:id/orden', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const tx = db.transaction(() => {
    for (const s of (Array.isArray(b.secciones) ? b.secciones : [])) {
      db.prepare("UPDATE academy_secciones SET orden = ? WHERE id = ? AND curso_id = ?").run(Number(s.orden) || 0, String(s.id), req.params.id);
    }
    for (const l of (Array.isArray(b.lecciones) ? b.lecciones : [])) {
      const okSec = db.prepare('SELECT 1 FROM academy_secciones WHERE id = ? AND curso_id = ?').get(String(l.seccionId), req.params.id);
      if (okSec) db.prepare("UPDATE academy_lecciones SET orden = ?, seccion_id = ? WHERE id = ? AND curso_id = ?").run(Number(l.orden) || 0, String(l.seccionId), String(l.id), req.params.id);
    }
  });
  tx();
  res.json({ ok: true });
});

// Progreso del alumno: marcar/desmarcar una lección como completada.
api.post('/academy/progreso/:leccionId', requireAuth, (req, res) => {
  const l = db.prepare("SELECT id FROM academy_lecciones WHERE id = ?").get(req.params.leccionId);
  if (!l) return res.status(404).json({ error: 'Lección no encontrada.' });
  const completado = (req.body || {}).completado === false ? 0 : 1;
  if (completado) {
    db.prepare("INSERT INTO academy_progreso (user_id, leccion_id, completado, updated_at) VALUES (?,?,1,datetime('now')) ON CONFLICT(user_id, leccion_id) DO UPDATE SET completado = 1, updated_at = datetime('now')")
      .run(req.user!.id, req.params.leccionId);
  } else {
    db.prepare("DELETE FROM academy_progreso WHERE user_id = ? AND leccion_id = ?").run(req.user!.id, req.params.leccionId);
  }
  res.json({ ok: true, completado: !!completado });
});

// ── Biblioteca de productos (superadmin) ─────────────────────────────
api.get('/superadmin/biblioteca', requireAuth, requireAdmin, async (_req, res) => {
  const { listarBibliotecaAdmin } = await import('./biblioteca.js');
  res.json({ productos: listarBibliotecaAdmin() });
});

// Lista los productos de una tienda (para elegir cuál clonar a la biblioteca).
api.get('/superadmin/stores/:storeId/products', requireAuth, requireAdmin, (req, res) => {
  if (tiendaVedada(req, req.params.storeId)) return res.status(404).json({ error: 'Tienda no encontrada.' });
  const rows = db.prepare('SELECT id, nombre, precio, tipo FROM products WHERE store_id = ? ORDER BY created_at').all(req.params.storeId) as
    { id: string; nombre: string; precio: number; tipo: string }[];
  res.json({ productos: rows });
});

api.post('/superadmin/biblioteca/from-product', requireAuth, requireAdmin, async (req, res) => {
  const { agregarProductoABiblioteca } = await import('./biblioteca.js');
  const { productId, gratis, precioImportacion, editable } = req.body || {};
  const dueña = db.prepare('SELECT store_id FROM products WHERE id = ?').get(String(productId || '')) as { store_id: string } | undefined;
  if (dueña && tiendaVedada(req, dueña.store_id)) return res.status(404).json({ error: 'Producto no encontrado.' });
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
  setAuthCookie(res, { id: dueno.id, email: dueno.email, nombre: dueno.nombre, role: 'VENDEDOR', storeId: dueno.store_id, imp: req.user!.id }, req.hostname);
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

// Editar un producto de la biblioteca con el editor completo: lo hace editable
// (materializa el snapshot en la tienda master si hace falta), impersona la master
// y devuelve el id del producto para abrirlo.
api.post('/superadmin/biblioteca/:id/editar', requireAuth, requireAdmin, async (req, res) => {
  const { materializarLibraryEnMaster } = await import('./biblioteca.js');
  const r = materializarLibraryEnMaster(req.params.id);
  if ('error' in r) return res.status(400).json({ error: r.error });
  asegurarMasterStore();
  const dueno = duenoMasterStore();
  if (!dueno) return res.status(500).json({ error: 'No pudimos preparar la biblioteca.' });
  setAuthCookie(res, { id: dueno.id, email: dueno.email, nombre: dueno.nombre, role: 'VENDEDOR', storeId: dueno.store_id, imp: req.user!.id }, req.hostname);
  res.json({ ok: true, productId: r.productId });
});

// Enviar un producto de la biblioteca directamente a una tienda (clonarlo ahí).
api.post('/superadmin/biblioteca/:id/enviar-a-tienda', requireAuth, requireAdmin, async (req, res) => {
  const { getLibraryProduct, importarLibraryEnTienda } = await import('./biblioteca.js');
  const storeId = String(req.body?.storeId || '');
  if (!storeId) return res.status(400).json({ error: 'Elige la tienda destino.' });
  const existe = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
  if (!existe || tiendaVedada(req, storeId)) return res.status(404).json({ error: 'La tienda destino no existe.' });
  const lib = getLibraryProduct(req.params.id);
  if (!lib) return res.status(404).json({ error: 'Producto de biblioteca no encontrado.' });
  const r = importarLibraryEnTienda(req.params.id, storeId, true); // admin: se envía como adquirido
  if ('error' in r) return res.status(400).json({ error: r.error });
  res.json({ ok: true, productId: r.productId });
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

// ── Tienda en línea (landings por producto) ──────────────────────────
// Armar y previsualizar es libre; publicar y conectar dominios exige la membresía al día.
const conLandings = async (req: ExRequest, res: ExResponse, next: () => void) => {
  if ((await import('./landings.js')).landingsHabilitadas(req.user!.storeId!)) return next();
  res.status(402).json({ error: 'Activa tu membresía de Tienda en línea para hacer esto.', requierePago: true });
};
const sinMembresia = (_req: ExRequest, _res: ExResponse, next: () => void) => next();
// Dominio propio de las landings de la tienda.
api.get('/landings/dominio', requireAuth, requireStore, sinMembresia, async (req, res) => {
  res.json((await import('./landings.js')).estadoDominio(req.user!.storeId!));
});
api.post('/landings/dominio', requireAuth, requireStore, requireOwner, conLandings, async (req, res) => {
  const L = await import('./landings.js');
  const r = await L.conectarDominio(req.user!.storeId!, String(req.body?.dominio || ''));
  if ('error' in r) return res.status(400).json(r);
  res.json(await L.verificarDominio(req.user!.storeId!));
});
api.post('/landings/dominio/verificar', requireAuth, requireStore, conLandings, async (req, res) => {
  res.json(await (await import('./landings.js')).verificarDominio(req.user!.storeId!));
});
api.delete('/landings/dominio', requireAuth, requireStore, requireOwner, sinMembresia, async (req, res) => {
  const L = await import('./landings.js');
  await L.quitarDominio(req.user!.storeId!);
  res.json(L.estadoDominio(req.user!.storeId!));
});
api.put('/landings/dominio/sub', requireAuth, requireStore, requireOwner, conLandings, async (req, res) => {
  const L = await import('./landings.js');
  const r = L.cambiarSubdominio(req.user!.storeId!, String(req.body?.sub || ''));
  if ('error' in r) return res.status(400).json(r);
  res.json(L.estadoDominio(req.user!.storeId!));
});
api.put('/landings/dominio/inicio', requireAuth, requireStore, conLandings, async (req, res) => {
  const L = await import('./landings.js');
  if (!L.elegirInicio(req.user!.storeId!, String(req.body?.landingId || ''))) return res.status(404).json({ error: 'Landing no encontrada.' });
  res.json(L.estadoDominio(req.user!.storeId!));
});
api.get('/landings', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const L = await import('./landings.js');
  const sid = req.user!.storeId!;
  res.json({ landings: L.listarLandings(sid), membresia: L.membresiaTienda(sid), dominio: L.estadoDominio(sid), tienda: L.configTienda(sid) });
});
api.post('/landings', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const L = await import('./landings.js');
  res.json({ landing: L.crearLanding(req.user!.storeId!, String(req.body?.nombre || ''), String(req.body?.productId || '')) });
});
// Datos de la tienda (página de inicio con todos los productos).
api.put('/landings/tienda', requireAuth, requireStore, async (req, res) => {
  res.json({ tienda: (await import('./landings.js')).guardarConfigTienda(req.user!.storeId!, req.body?.tienda) });
});
api.post('/landings/tienda/vista', requireAuth, requireStore, async (req, res) => {
  const L = await import('./landings.js');
  const sid = req.user!.storeId!;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ html: L.renderCatalogo({ ...L.configTienda(sid), ...(req.body?.tienda || {}) }, L.catalogoTienda(sid), '#', true) });
});
// Membresía mensual de la Tienda en línea (Wompi): suma 30 días.
api.post('/landings/membresia/pagar', requireAuth, requireStore, async (req, res) => {
  const L = await import('./landings.js');
  const { crearCheckoutTiendaOnline } = await import('./suscripcion.js');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const r = crearCheckoutTiendaOnline(req.user!.storeId!, req.user!.email, `${proto}://${req.get('host')}`, L.membresiaTienda(req.user!.storeId!).precio);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ url: r.url });
});
api.get('/landings/:id', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const l = (await import('./landings.js')).verLanding(req.user!.storeId!, req.params.id);
  if (!l) return res.status(404).json({ error: 'Landing no encontrada.' });
  res.json({ landing: l });
});
api.put('/landings/:id', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const r = (await import('./landings.js')).guardarLanding(req.user!.storeId!, req.params.id, req.body || {});
  if ('error' in r) return res.status(400).json(r);
  res.json({ landing: r });
});
api.delete('/landings/:id', requireAuth, requireStore, sinMembresia, async (req, res) => {
  if (!(await import('./landings.js')).borrarLanding(req.user!.storeId!, req.params.id)) return res.status(404).json({ error: 'Landing no encontrada.' });
  res.json({ ok: true });
});
api.post('/landings/:id/duplicar', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const l = (await import('./landings.js')).duplicarLanding(req.user!.storeId!, req.params.id);
  if (!l) return res.status(404).json({ error: 'Landing no encontrada.' });
  res.json({ landing: l });
});
// Vista previa en vivo del editor (con lo que aún no se ha guardado).
api.post('/landings/:id/vista', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const L = await import('./landings.js');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ html: L.renderLanding(L.limpiarDatos(req.body?.datos), { id: req.params.id, vista: true }) });
});
api.post('/landings/imagen', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const r = (await import('./landings.js')).subirImagen(req.user!.storeId!, String(req.body?.dataUrl || ''));
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
api.post('/landings/:id/publicar', requireAuth, requireStore, sinMembresia, async (req, res) => {
  const r = (await import('./landings.js')).publicarLanding(req.user!.storeId!, req.params.id);
  if ('error' in r) return res.status(400).json(r);
  res.json(r);
});
api.post('/landings/:id/despublicar', requireAuth, requireStore, sinMembresia, async (req, res) => {
  (await import('./landings.js')).despublicarLanding(req.user!.storeId!, req.params.id);
  res.json({ ok: true });
});
// Precios de los servicios aparte del plan (Tienda en línea y, luego, microtransacciones).
api.get('/admin/precios', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ precios: (await import('./preciosServicios.js')).listarPrecios() });
});
api.put('/admin/precios/:clave', requireAuth, requireAdmin, async (req, res) => {
  const p = (await import('./preciosServicios.js')).cambiarPrecio(req.params.clave, Number(req.body?.precio));
  if (!p) return res.status(404).json({ error: 'Servicio no encontrado.' });
  registrarAccionEquipo(req.user!.email, `Cambió el precio de ${p.nombre} a ${p.precio}`);
  res.json({ precio: p });
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
api.get('/media/:storeId/:file', requireAuth, (req, res) => {
  // Cada tienda ve lo suyo; el equipo DealFlow (admin/superadmin, sin tienda) ve
  // cualquiera, para poder mostrar las fotos de la biblioteca y al mover productos.
  const esAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
  if (!esAdmin && req.params.storeId !== req.user!.storeId) return res.status(403).end();
  const file = mediaPath(req.params.storeId, req.params.file);
  if (!existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// Multimedia de la Biblioteca: visible para cualquier usuario autenticado —tiendas
// y el equipo DealFlow (que no tiene tienda)— para mostrar las fotos del catálogo.
api.get('/library/media/:file', requireAuth, (req, res) => {
  const file = mediaPath('__biblioteca__', req.params.file);
  if (!existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// Capturas de pantalla para las guías paso a paso de Academy. Solo admin/
// superadmin las sube (no requireStore: el equipo DealFlow no tiene tienda);
// las lee cualquier usuario logueado (VENDEDOR incluido, son quienes ven el portal).
api.post('/academy/media', requireAuth, requireAdmin, (req, res) => {
  const { dataUrl, nombre } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'No recibimos el archivo.' });
  const saved = saveOutgoingMedia('__academy__', String(dataUrl), String(nombre || ''));
  if (!saved) return res.status(400).json({ error: 'El archivo no es válido.' });
  res.json({ url: saved.url.replace('/api/media/__academy__/', '/api/academy/media/') });
});
api.get('/academy/media/:file', requireAuth, (req, res) => {
  const file = mediaPath('__academy__', req.params.file);
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

// Salud del webhook entrante de WhatsApp (en memoria, para diagnosticar caídas de
// recepción: si "recibidos" sube pero "rechazadosFirma" también, el App Secret no
// cuadra; si "recibidos" no sube, Meta no está entregando (suscripción/URL/servidor).
const webhookSalud = { recibidos: 0, procesados: 0, rechazadosFirma: 0, errores: 0, ultimoRecibido: '', ultimoRechazo: '', ultimoError: '', desde: new Date().toISOString() };

// Diagnóstico para el equipo DealFlow: estado de recepción de webhooks de WhatsApp.
api.get('/admin/webhook-salud', requireAuth, requireAdmin, (_req, res) => {
  res.json({
    ...webhookSalud,
    firmaActiva: !!process.env.META_APP_SECRET,
    modoSoft: process.env.WHATSAPP_WEBHOOK_SOFT === '1',
  });
});

webhooks.get('/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'dealflow-verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

webhooks.post('/whatsapp', (req, res) => {
  webhookSalud.recibidos++;
  webhookSalud.ultimoRecibido = new Date().toISOString();
  // Verificamos que el mensaje venga de verdad de Meta: firma HMAC-SHA256 del
  // cuerpo crudo con el App Secret. Sin esto, cualquiera que conozca la URL
  // podría inyectar mensajes falsos en el Inbox de una tienda.
  // Escotilla de emergencia: WHATSAPP_WEBHOOK_SOFT=1 procesa igual aunque la firma
  // no cuadre (p. ej. si rotaron el App Secret), para no perder mensajes mientras
  // se corrige META_APP_SECRET. Deja rastro en la salud del webhook.
  const secret = process.env.META_APP_SECRET;
  const soft = process.env.WHATSAPP_WEBHOOK_SOFT === '1';
  if (secret) {
    const firma = String(req.headers['x-hub-signature-256'] || '');
    const raw = (req as { rawBody?: Buffer }).rawBody;
    if (!firmaMetaValida(secret, raw, firma)) {
      webhookSalud.rechazadosFirma++;
      webhookSalud.ultimoRechazo = new Date().toISOString();
      console.warn(`[webhook] firma de Meta inválida o ausente — ${soft ? 'SOFT: se procesa igual' : 'se IGNORA la entrada'}. ¿Rotaron el App Secret? Revisa META_APP_SECRET. (rechazos: ${webhookSalud.rechazadosFirma})`);
      if (!soft) return res.sendStatus(403);
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
    webhookSalud.procesados++;
  } catch (e) {
    webhookSalud.errores++;
    webhookSalud.ultimoError = `${new Date().toISOString()} · ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    console.error('[webhook] error procesando entrada', e);
  }
  res.sendStatus(200);
});

// ── Webhook de Wompi: confirma el pago de la suscripción ──────────────
// Webhooks de la app de Shopify (firmados con HMAC del secret de la app).
webhooks.post('/shopify', (req, res) => {
  const raw = (req as { rawBody?: Buffer }).rawBody;
  if (!sa.firmaWebhookValida(raw, String(req.headers['x-shopify-hmac-sha256'] || ''))) return res.status(401).send('firma no válida');
  res.status(200).send('ok'); // responder rápido; procesar después
  const topic = String(req.headers['x-shopify-topic'] || '');
  const shop = String(req.headers['x-shopify-shop-domain'] || '').toLowerCase();
  const id = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');
  try { sa.procesarWebhook(topic, shop, id, (req.body || {}) as Record<string, unknown>); } catch (e) { console.error('[shopify-app] webhook', topic, e); }
});

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

// Webhooks de Effi ERP: un token por tienda en la URL y firma HMAC-SHA256 del
// cuerpo en X-Effi-Signature (con el secreto que Effi mostró al crear el webhook).
// Effi exige 2xx en < 5 s: respondemos de inmediato y procesamos después.
webhooks.post('/effi/:token', async (req, res) => {
  const ef = await import('./effiApi.js');
  const sid = ef.tiendaPorWebhookToken(String(req.params.token || ''));
  if (!sid) return res.sendStatus(404);
  const c = ef.cfgEffi(sid);
  const raw = (req as { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const firma = String(req.headers['x-effi-signature'] || '');
  if (c?.webhookSecret && !ef.firmaEffiValida(c.webhookSecret, raw, firma)) {
    console.warn(`[effi-webhook] firma inválida para la tienda ${sid}`);
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  const evento = String(req.headers['x-effi-event'] || (req.body as { evento?: string })?.evento || '');
  const entrega = String(req.headers['x-effi-delivery'] || '');
  ef.procesarWebhookEffi(sid, evento, entrega, req.body).catch((e) => console.warn('[effi-webhook] error procesando', e));
});

// ── Eliminación de datos de Meta (requisito de Facebook Login) ─────────
// Cuando una persona quita nuestra app desde sus ajustes de Facebook, Meta
// envía aquí un `signed_request` firmado con el App Secret. Debemos borrar sus
// datos y responder con una URL de estado + un código de confirmación.
// https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

/** Decodifica y valida el signed_request de Meta (base64url `firma.payload`). */
function parseSignedRequest(signed: string, secret: string): Record<string, unknown> | null {
  if (!signed || !signed.includes('.')) return null;
  const [firma, payload] = signed.split('.', 2);
  try {
    const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const esperado = createHmac('sha256', secret).update(payload).digest();
    const recibido = b64(firma);
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;
    return JSON.parse(b64(payload).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Base pública para construir las URLs que devolvemos a Meta. */
function baseUrl(req: { headers: Record<string, unknown>; protocol: string; get: (h: string) => string | undefined }): string {
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'dealflow.sbs');
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https');
  return `${proto}://${host}`;
}

/** Borra lo que podamos asociar a ese usuario de Facebook/Instagram (best-effort). */
function borrarDatosUsuarioMeta(userId: string): number {
  if (!userId) return 0;
  let borrados = 0;
  try {
    // Los chats de Messenger/Instagram se guardan con wa_id `fb:<id>` / `ig:<id>`.
    const leads = db.prepare("SELECT id FROM leads WHERE tel IN (?,?) OR tel = ?").all(`fb:${userId}`, `ig:${userId}`, userId) as { id: string }[];
    for (const l of leads) {
      db.prepare('DELETE FROM messages WHERE lead_id = ?').run(l.id);
      db.prepare('DELETE FROM leads WHERE id = ?').run(l.id);
      borrados++;
    }
  } catch (e) {
    console.error('[data-deletion] error borrando', e);
  }
  return borrados;
}

webhooks.post('/meta/data-deletion', (req, res) => {
  const secret = process.env.META_APP_SECRET || '';
  const signed = String((req.body as { signed_request?: string })?.signed_request || '');
  const datos = secret ? parseSignedRequest(signed, secret) : null;
  if (!datos) return res.status(400).json({ error: 'signed_request inválido' });
  const userId = String(datos.user_id || '');
  const code = uid().replace(/-/g, '').slice(0, 16);
  const borrados = borrarDatosUsuarioMeta(userId);
  console.log(`[data-deletion] solicitud user_id=${userId} code=${code} leads_borrados=${borrados}`);
  // Meta exige: { url: <página de estado>, confirmation_code: <código> }
  res.json({ url: `${baseUrl(req)}/webhooks/meta/data-deletion?code=${code}`, confirmation_code: code });
});

// Página de estado que abre la persona para verificar su solicitud.
webhooks.get('/meta/data-deletion', (req, res) => {
  const code = String(req.query.code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || '—';
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solicitud de eliminación de datos · DealFlow</title>
<style>body{margin:0;background:#0C1422;color:#E8EFEA;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.6}
.w{max-width:640px;margin:0 auto;padding:56px 22px}h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}
p{color:#D3DEE6}code{font-family:ui-monospace,monospace;background:#111F32;border:1px solid rgba(255,255,255,.1);padding:3px 8px;border-radius:7px;color:#34D399}
a{color:#34D399}</style></head><body><div class="w">
<h1>Solicitud de eliminación recibida ✔</h1>
<p>Registramos tu solicitud de eliminación de datos en DealFlow. Estamos borrando la información asociada a tu cuenta de Facebook/Instagram.</p>
<p>Código de confirmación: <code>${code}</code></p>
<p>La eliminación se completa dentro de los <strong>30 días</strong> siguientes. Si tienes dudas, escríbenos a <a href="mailto:admin@dealflow.sbs">admin@dealflow.sbs</a>.</p>
<p style="margin-top:28px"><a href="/legal/eliminar-datos.html">Ver la política completa de eliminación de datos →</a></p>
</div></body></html>`);
});

// Callback de desautorización: Meta lo llama cuando alguien quita la app.
// No requiere respuesta con cuerpo; solo confirmamos recepción.
webhooks.post('/meta/deauthorize', (req, res) => {
  const secret = process.env.META_APP_SECRET || '';
  const signed = String((req.body as { signed_request?: string })?.signed_request || '');
  const datos = secret ? parseSignedRequest(signed, secret) : null;
  if (datos) {
    const userId = String(datos.user_id || '');
    const borrados = borrarDatosUsuarioMeta(userId);
    console.log(`[deauthorize] user_id=${userId} leads_borrados=${borrados}`);
  }
  res.sendStatus(200);
});
