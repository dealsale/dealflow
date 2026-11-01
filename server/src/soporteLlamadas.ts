/**
 * Soporte en vivo: la tienda toca "Llamar a soporte" y la llamada (audio y pantalla compartida)
 * ocurre DENTRO de DealFlow, de navegador a navegador (WebRTC): sin otra plataforma, sin otra
 * pestaña ni cuentas externas. Este servidor solo pasa las "señales" para conectarse (oferta,
 * respuesta y candidatos de red); el audio y la pantalla van directo entre los dos navegadores.
 * Para redes muy cerradas se puede configurar un TURN propio con TURN_URLS, TURN_USER y TURN_PASS.
 * Al equipo le aparece al instante en Administración → Soporte en vivo (con sonido) y un correo.
 */
import { randomBytes } from 'node:crypto';
import { db, uid, registrarLog } from './db.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");
db.exec(`CREATE TABLE IF NOT EXISTS soporte_llamadas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, user_id TEXT NOT NULL, usuario TEXT NOT NULL DEFAULT '', tienda TEXT NOT NULL DEFAULT '',
  sala TEXT NOT NULL, motivo TEXT NOT NULL DEFAULT '', seccion TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'esperando',
  atendido_por TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now')), atendido_at TEXT, fin_at TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_soporte_llamadas_estado ON soporte_llamadas(estado, creado)');

// ── Configuración (horario de atención) ─────────────────────────────────────
export interface CfgLlamadas { activo: boolean; dias: number[]; desde: number; hasta: number; aviso: string }
const CFG_DEF: CfgLlamadas = { activo: true, dias: [1, 2, 3, 4, 5, 6], desde: 8, hasta: 18, aviso: '' };
export function cfgLlamadas(): CfgLlamadas {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'soporte_llamadas'").get() as { valor: string } | undefined;
  try { return { ...CFG_DEF, ...(r ? JSON.parse(r.valor) : {}) }; } catch { return CFG_DEF; }
}
export function guardarCfgLlamadas(p: Partial<CfgLlamadas>): CfgLlamadas {
  const c = { ...cfgLlamadas(), ...p };
  c.dias = [...new Set((c.dias || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  c.desde = Math.max(0, Math.min(23, Math.round(Number(c.desde) || 0)));
  c.hasta = Math.max(c.desde + 1, Math.min(24, Math.round(Number(c.hasta) || 24)));
  c.aviso = String(c.aviso || '').slice(0, 300);
  db.prepare("INSERT INTO config_global (clave, valor) VALUES ('soporte_llamadas', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(c));
  return c;
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const hora12 = (h: number) => (h === 0 || h === 24 ? '12 a. m.' : h === 12 ? '12 m.' : h < 12 ? `${h} a. m.` : `${h - 12} p. m.`);
export function horarioTexto(c = cfgLlamadas()): string {
  const d = c.dias;
  const rango = d.length === 7 ? 'todos los días' : d.join(',') === '1,2,3,4,5' ? 'de lunes a viernes' : d.join(',') === '1,2,3,4,5,6' ? 'de lunes a sábado' : d.map((x) => DIAS[x]).join(', ');
  return c.desde === 0 && c.hasta === 24 ? `${rango}, a toda hora` : `${rango}, de ${hora12(c.desde)} a ${hora12(c.hasta)} (hora Colombia)`;
}
/** ¿Hay atención en este momento? (hora Colombia, UTC-5). */
export function abiertoAhora(c = cfgLlamadas()): boolean {
  if (!c.activo) return false;
  const co = new Date(Date.now() - 5 * 3600e3);
  const h = co.getUTCHours() + co.getUTCMinutes() / 60;
  return c.dias.includes(co.getUTCDay()) && h >= c.desde && h < c.hasta;
}
export function estadoServicio() {
  const c = cfgLlamadas();
  return { activo: c.activo, abierto: abiertoAhora(c), horario: horarioTexto(c), aviso: c.aviso };
}

// ── Llamadas ────────────────────────────────────────────────────────────────
const vista = (r: Fila, _quien = '') => ({
  id: txt(r.id), estado: txt(r.estado), atendidoPor: txt(r.atendido_por), creado: txt(r.creado), atendidoAt: txt(r.atendido_at),
});

/** Cierra solas las que nadie atendió en 30 min y las que siguen "en curso" después de 3 h. */
function vencer() {
  db.prepare("UPDATE soporte_llamadas SET estado = 'sin_atender', fin_at = datetime('now') WHERE estado = 'esperando' AND creado < datetime('now','-30 minutes')").run();
  db.prepare("UPDATE soporte_llamadas SET estado = 'terminada', fin_at = datetime('now') WHERE estado = 'en_curso' AND atendido_at < datetime('now','-3 hours')").run();
}

export async function crearLlamada(u: { id: string; nombre: string; email: string; storeId: string }, motivo: string, seccion: string):
  Promise<ReturnType<typeof vista> | { error: string }> {
  vencer();
  const c = cfgLlamadas();
  if (!abiertoAhora(c)) return { error: `Ahora no hay atención por llamada. Horario: ${horarioTexto(c)}. Mientras tanto, escríbele a SKY.` };
  // Una llamada activa por persona: si ya tiene una, se le devuelve la misma.
  const ya = db.prepare("SELECT * FROM soporte_llamadas WHERE user_id = ? AND estado IN ('esperando','en_curso') ORDER BY creado DESC LIMIT 1").get(u.id) as Fila | undefined;
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(u.storeId) as { nombre: string } | undefined)?.nombre || 'Tienda';
  const quien = `${u.nombre || u.email} · ${tienda}`;
  if (ya) return vista(ya, quien);
  const id = uid();
  const sala = `DealFlowSoporte${randomBytes(9).toString('hex')}`;
  db.prepare('INSERT INTO soporte_llamadas (id, store_id, user_id, usuario, tienda, sala, motivo, seccion) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, u.storeId, u.id, (u.nombre || u.email).slice(0, 80), tienda.slice(0, 80), sala, motivo.slice(0, 300), seccion.slice(0, 40));
  registrarLog(u.storeId, 'info', 'soporte', `Pidió soporte por llamada${motivo ? `: ${motivo.slice(0, 120)}` : ''}.`);
  // Correo al equipo (ADMIN y SUPERADMIN): por si no tienen el panel abierto.
  try {
    const { enviarCorreo, plantillaCorreo, APP_URL } = await import('./correo.js');
    const equipo = db.prepare("SELECT email FROM users WHERE role IN ('ADMIN','SUPERADMIN','SOPORTE') AND COALESCE(email,'') != ''").all() as { email: string }[];
    for (const e of equipo) {
      void enviarCorreo({ para: e.email, tipo: 'soporte_llamada', asunto: `📞 ${tienda} está esperando en soporte`, html: plantillaCorreo(`📞 ${tienda} pidió soporte por llamada`,
        [`<b>${u.nombre || u.email}</b> está esperando en la sala de llamada.`, motivo ? `Motivo: ${motivo}` : 'No escribió el motivo.', 'Entra desde Administración → Soporte en vivo (así queda registrado quién la atendió).'],
        { texto: 'Atender en DealFlow', url: `${APP_URL}/admin/soporte` }) });
    }
  } catch { /* el correo no es crítico */ }
  return vista(db.prepare('SELECT * FROM soporte_llamadas WHERE id = ?').get(id) as Fila, quien);
}

export function llamadaDeUsuario(id: string, userId: string) {
  vencer();
  const r = db.prepare('SELECT * FROM soporte_llamadas WHERE id = ? AND user_id = ?').get(id, userId) as Fila | undefined;
  if (!r) return null;
  return vista(r, `${txt(r.usuario)} · ${txt(r.tienda)}`);
}
export function cancelarLlamada(id: string, userId: string): boolean {
  const ok = db.prepare("UPDATE soporte_llamadas SET estado = CASE WHEN estado = 'en_curso' THEN 'terminada' ELSE 'cancelada' END, fin_at = datetime('now') WHERE id = ? AND user_id = ? AND estado IN ('esperando','en_curso')").run(id, userId).changes > 0;
  if (ok) enviarSenal(id, 'tienda', 'colgar', null);
  return ok;
}

// ── Panel del equipo ────────────────────────────────────────────────────────
export function llamadasEquipo(_agente = '') {
  vencer();
  const filas = db.prepare(`SELECT * FROM soporte_llamadas WHERE estado IN ('esperando','en_curso') OR creado > datetime('now','-7 days')
    ORDER BY CASE estado WHEN 'esperando' THEN 0 WHEN 'en_curso' THEN 1 ELSE 2 END, creado DESC LIMIT 80`).all() as Fila[];
  return filas.map((r) => ({
    id: txt(r.id), storeId: txt(r.store_id), tienda: txt(r.tienda), usuario: txt(r.usuario), motivo: txt(r.motivo), seccion: txt(r.seccion),
    estado: txt(r.estado), atendidoPor: txt(r.atendido_por), creado: txt(r.creado), atendidoAt: txt(r.atendido_at), finAt: txt(r.fin_at),
  }));
}
export function atenderLlamada(id: string, agente: string): boolean {
  return db.prepare("UPDATE soporte_llamadas SET estado = 'en_curso', atendido_por = ?, atendido_at = COALESCE(atendido_at, datetime('now')) WHERE id = ? AND estado IN ('esperando','en_curso','sin_atender')").run(agente.slice(0, 80), id).changes > 0;
}
export function terminarLlamada(id: string): boolean {
  const ok = db.prepare("UPDATE soporte_llamadas SET estado = 'terminada', fin_at = datetime('now') WHERE id = ? AND estado IN ('esperando','en_curso')").run(id).changes > 0;
  if (ok) enviarSenal(id, 'soporte', 'colgar', null);
  return ok;
}

// ── Señales de la llamada (WebRTC) ──────────────────────────────────────────
// En memoria: solo sirven mientras dura la llamada (si el servidor se reinicia, se reconecta).
type Rol = 'tienda' | 'soporte';
interface Senal { n: number; de: Rol; tipo: string; data: unknown; t: number }
const senales = new Map<string, { n: number; lista: Senal[]; t: number }>();
setInterval(() => { const lim = Date.now() - 4 * 3600e3; for (const [k, v] of senales) if (v.t < lim) senales.delete(k); }, 30 * 60e3).unref?.();

/** ¿Quién es este usuario en la llamada? (la tienda que llamó o alguien del equipo). */
export function rolEnLlamada(id: string, u: { id: string; role: string }): Rol | null {
  const r = db.prepare("SELECT user_id, estado FROM soporte_llamadas WHERE id = ?").get(id) as { user_id: string; estado: string } | undefined;
  if (!r) return null;
  if (['ADMIN', 'SUPERADMIN', 'SOPORTE'].includes(u.role)) return 'soporte';
  return r.user_id === u.id ? 'tienda' : null;
}
export function enviarSenal(id: string, de: Rol, tipo: string, data: unknown): void {
  const c = senales.get(id) || { n: 0, lista: [], t: Date.now() };
  c.n++; c.t = Date.now();
  c.lista.push({ n: c.n, de, tipo, data, t: Date.now() });
  if (c.lista.length > 400) c.lista.splice(0, c.lista.length - 400);
  senales.set(id, c);
}
export function leerSenales(id: string, para: Rol, desde: number) {
  const c = senales.get(id);
  const r = db.prepare('SELECT estado, atendido_por FROM soporte_llamadas WHERE id = ?').get(id) as { estado: string; atendido_por: string } | undefined;
  return {
    senales: (c?.lista || []).filter((x) => x.de !== para && x.n > desde).map((x) => ({ n: x.n, tipo: x.tipo, data: x.data })),
    ultimo: c?.n || 0, estado: r?.estado || 'terminada', atendidoPor: r?.atendido_por || '',
  };
}
/** Servidores para encontrar la ruta de red entre los dos navegadores (STUN público + TURN propio si hay). */
export function servidoresIce(): { urls: string | string[]; username?: string; credential?: string }[] {
  const lista: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = (process.env.TURN_URLS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (turn.length) lista.push({ urls: turn, username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
  return lista;
}
