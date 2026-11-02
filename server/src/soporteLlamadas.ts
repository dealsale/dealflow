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
// Llamadas SALIENTES: el superadmin llama a una tienda (la tienda ve «El administrador de DealFlow te está llamando»).
try { db.exec("ALTER TABLE soporte_llamadas ADD COLUMN direccion TEXT NOT NULL DEFAULT 'entrante'"); } catch { /* ya existe */ }
db.exec('CREATE INDEX IF NOT EXISTS idx_soporte_llamadas_saliente ON soporte_llamadas(store_id, direccion, estado)');
/** Cómo se presenta el equipo ante la tienda (nunca «superadmin»). */
export const NOMBRE_ADMIN = 'Administrador de DealFlow';
const TIMBRE_SEG = 60; // cuánto timbra una llamada saliente antes de darla por no contestada
// Las llamadas viejas que atendió el superadmin quedaron con su nombre de cuenta: se muestran como «Administrador de DealFlow».
try { db.prepare("UPDATE soporte_llamadas SET atendido_por = ? WHERE LOWER(REPLACE(REPLACE(atendido_por,' ',''),'-','')) LIKE '%superadmin%'").run(NOMBRE_ADMIN); } catch { /* nada */ }

// ── Configuración (horario de atención) ─────────────────────────────────────
// Horario semanal por franjas (hora Colombia): cada día tiene sus propias franjas, y los
// huecos entre ellas son los descansos. Además: días sin atención (festivos, vacaciones) y
// una pausa rápida ("vuelvo en 30 min") que el equipo activa cuando se levanta.
export type Franja = [number, number]; // minutos desde la medianoche: [inicio, fin)
export interface CfgLlamadas { activo: boolean; semana: Franja[][]; cerrados: string[]; pausaHasta: string | null; pausaMotivo: string; aviso: string }

const CO = 5 * 3600e3;
const enCO = (ms: number) => new Date(ms - CO); // leer con getUTC*
const ymdCO = (ms: number) => enCO(ms).toISOString().slice(0, 10);
const minutoCO = (ms: number) => { const d = enCO(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const medianocheCO = (ms: number) => { const d = enCO(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + CO; };

function normalizarSemana(s: unknown): Franja[][] {
  const dias = Array.isArray(s) ? s : [];
  return Array.from({ length: 7 }, (_, d) => {
    const crudas = Array.isArray(dias[d]) ? (dias[d] as unknown[]) : [];
    const limpias = crudas
      .map((f) => (Array.isArray(f) ? [Math.round(Number(f[0])), Math.round(Number(f[1]))] : [NaN, NaN]))
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
      .map(([a, b]) => [Math.max(0, Math.min(1440, a)), Math.max(0, Math.min(1440, b))] as Franja)
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);
    const unidas: Franja[] = [];
    for (const f of limpias) { const u = unidas[unidas.length - 1]; if (u && f[0] <= u[1]) u[1] = Math.max(u[1], f[1]); else unidas.push([f[0], f[1]]); }
    return unidas.slice(0, 8);
  });
}
function normalizarFechas(f: unknown): string[] {
  const hoy = ymdCO(Date.now());
  return [...new Set((Array.isArray(f) ? f : []).map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= hoy))].sort().slice(0, 60);
}

export function cfgLlamadas(): CfgLlamadas {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'soporte_llamadas'").get() as { valor: string } | undefined;
  let c: Record<string, unknown> = {};
  try { c = r ? JSON.parse(r.valor) : {}; } catch { c = {}; }
  // Formato anterior (mismos días y un solo rango por hora) → una franja por día.
  let semana = c.semana;
  if (!Array.isArray(semana)) {
    const dias = Array.isArray(c.dias) ? (c.dias as unknown[]).map(Number) : [1, 2, 3, 4, 5, 6];
    const desde = Number(c.desde ?? 8), hasta = Number(c.hasta ?? 18);
    semana = Array.from({ length: 7 }, (_, d) => (dias.includes(d) ? [[desde * 60, hasta * 60]] : []));
  }
  const pausa = typeof c.pausaHasta === 'string' && Date.parse(c.pausaHasta) > Date.now() ? c.pausaHasta : null;
  return { activo: c.activo !== false, semana: normalizarSemana(semana), cerrados: normalizarFechas(c.cerrados), pausaHasta: pausa, pausaMotivo: pausa ? String(c.pausaMotivo || '').slice(0, 120) : '', aviso: String(c.aviso || '').slice(0, 300) };
}
export function guardarCfgLlamadas(p: Partial<CfgLlamadas>): CfgLlamadas {
  const a = cfgLlamadas();
  const c: CfgLlamadas = {
    activo: typeof p.activo === 'boolean' ? p.activo : a.activo,
    semana: p.semana ? normalizarSemana(p.semana) : a.semana,
    cerrados: p.cerrados ? normalizarFechas(p.cerrados) : a.cerrados,
    pausaHasta: p.pausaHasta !== undefined ? p.pausaHasta : a.pausaHasta,
    pausaMotivo: p.pausaMotivo !== undefined ? String(p.pausaMotivo || '').slice(0, 120) : a.pausaMotivo,
    aviso: p.aviso !== undefined ? String(p.aviso || '').slice(0, 300) : a.aviso,
  };
  db.prepare("INSERT INTO config_global (clave, valor) VALUES ('soporte_llamadas', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(c));
  return cfgLlamadas();
}
/** Pausa rápida del equipo: `minutos` > 0, o hasta que termine el día; 0 la quita. */
export function pausarSoporte(minutos: number, restoDelDia: boolean, motivo: string): CfgLlamadas {
  if (!restoDelDia && !(minutos > 0)) return guardarCfgLlamadas({ pausaHasta: null, pausaMotivo: '' });
  const hasta = restoDelDia ? medianocheCO(Date.now()) + 86400e3 : Date.now() + Math.min(24 * 60, Math.round(minutos)) * 60e3;
  return guardarCfgLlamadas({ pausaHasta: new Date(hasta).toISOString(), pausaMotivo: motivo });
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const hora = (m: number) => {
  if (m === 720) return '12 m.';
  if (m === 0 || m === 1440) return '12 a. m.';
  const h = Math.floor(m / 60) % 24, mm = m % 60, h12 = h % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
const aLas = (m: number) => `${Math.floor(m / 60) % 12 === 1 ? 'a la' : 'a las'} ${hora(m)}`;
const punto = (t: string) => (t.endsWith('.') ? t : `${t}.`);
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const franjasTexto = (fr: Franja[]) => (fr.length === 1 && fr[0][0] === 0 && fr[0][1] === 1440 ? 'a toda hora' : lista(fr.map(([a, b]) => `de ${hora(a)} a ${hora(b)}`)));

export function horarioTexto(c = cfgLlamadas()): string {
  // Agrupa días seguidos (lunes → domingo) con las mismas franjas: "lunes a viernes de 8 a. m. a 12 m. y de 2 p. m. a 6 p. m.".
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const grupos: { dias: number[]; fr: Franja[] }[] = [];
  for (const d of orden) {
    const fr = c.semana[d];
    if (!fr.length) continue;
    const g = grupos[grupos.length - 1];
    const prev = g ? orden.indexOf(g.dias[g.dias.length - 1]) : -9;
    if (g && prev === orden.indexOf(d) - 1 && JSON.stringify(g.fr) === JSON.stringify(fr)) g.dias.push(d);
    else grupos.push({ dias: [d], fr });
  }
  if (!grupos.length) return 'sin horario de atención por ahora';
  const partes = grupos.map((g) => {
    const n = g.dias.length === 7 ? 'todos los días' : g.dias.length === 1 ? DIAS[g.dias[0]] : g.dias.length === 2 ? `${DIAS[g.dias[0]]} y ${DIAS[g.dias[1]]}` : `${DIAS[g.dias[0]]} a ${DIAS[g.dias[g.dias.length - 1]]}`;
    return `${n} ${franjasTexto(g.fr)}`;
  });
  return `${partes.join('; ')} (hora Colombia)`;
}

/** ¿Hay atención en ese momento? (hora Colombia, UTC-5). */
function abiertoEn(ms: number, c: CfgLlamadas): boolean {
  if (!c.activo) return false;
  if (c.pausaHasta && ms < Date.parse(c.pausaHasta)) return false;
  if (c.cerrados.includes(ymdCO(ms))) return false;
  const m = minutoCO(ms);
  return c.semana[enCO(ms).getUTCDay()].some(([a, b]) => m >= a && m < b);
}
export function abiertoAhora(c = cfgLlamadas()): boolean { return abiertoEn(Date.now(), c); }

/** Próximo momento con atención (o null si no hay ninguno en las próximas 2 semanas). */
function proximaApertura(c: CfgLlamadas, ahora = Date.now()): number | null {
  if (!c.activo) return null;
  const t = Math.max(ahora, c.pausaHasta ? Date.parse(c.pausaHasta) : 0);
  const base = medianocheCO(t);
  for (let i = 0; i < 15; i++) {
    const dia = base + i * 86400e3;
    if (c.cerrados.includes(ymdCO(dia))) continue;
    for (const [a, b] of c.semana[enCO(dia).getUTCDay()]) {
      if (dia + b * 60e3 <= t) continue;
      return Math.max(dia + a * 60e3, t);
    }
  }
  return null;
}
/** Cuándo termina la franja actual (con la siguiente pegada, si la hay). */
function cierreActual(c: CfgLlamadas, ahora = Date.now()): number | null {
  if (!abiertoEn(ahora, c)) return null;
  const dia = medianocheCO(ahora), m = minutoCO(ahora);
  const fr = c.semana[enCO(ahora).getUTCDay()].find(([a, b]) => m >= a && m < b);
  // Hasta la medianoche cuenta como "sin cierre cercano" (suele seguir al día siguiente).
  return fr && fr[1] < 1440 ? dia + fr[1] * 60e3 : null;
}
function cuando(ms: number, ahora = Date.now()): string {
  const dias = Math.round((medianocheCO(ms) - medianocheCO(ahora)) / 86400e3);
  const d = enCO(ms);
  const dia = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : dias < 7 ? `el ${DIAS[d.getUTCDay()]}` : `el ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return `${dia} ${aLas(minutoCO(ms))}`;
}

export function estadoServicio() {
  const c = cfgLlamadas();
  const ahora = Date.now();
  const abierto = abiertoEn(ahora, c);
  const prox = abierto ? null : proximaApertura(c, ahora);
  const cierre = abierto ? cierreActual(c, ahora) : null;
  const enPausa = !!c.pausaHasta && ahora < Date.parse(c.pausaHasta);
  return {
    activo: c.activo, abierto, horario: horarioTexto(c), aviso: c.aviso,
    // Para la tienda: cuándo vuelve (si no hay atención) o hasta cuándo hay (si la hay).
    siguiente: prox ? punto(`Vuelve ${cuando(prox, ahora)}`) : '',
    hasta: cierre && cierre - ahora < 3 * 3600e3 ? punto(`Disponible hasta ${hora(minutoCO(cierre))}`) : '',
    pausa: enPausa ? `En pausa hasta ${hora(minutoCO(Date.parse(c.pausaHasta!)))}${c.pausaMotivo ? ` (${c.pausaMotivo})` : ''}.` : '',
  };
}

// ── Llamadas ────────────────────────────────────────────────────────────────
const vista = (r: Fila, _quien = '') => ({
  id: txt(r.id), estado: txt(r.estado), atendidoPor: txt(r.atendido_por), creado: txt(r.creado), atendidoAt: txt(r.atendido_at),
});

/** Cierra solas las que nadie atendió en 30 min y las que siguen "en curso" después de 3 h. */
let ultVencer = 0;
function vencer() {
  // Se llama en cada consulta del panel (cada pocos segundos): basta con revisar cada 30 s.
  if (Date.now() - ultVencer < 30_000) return;
  ultVencer = Date.now();
  db.prepare("UPDATE soporte_llamadas SET estado = 'sin_atender', fin_at = datetime('now') WHERE estado = 'esperando' AND creado < datetime('now','-30 minutes')").run();
  db.prepare("UPDATE soporte_llamadas SET estado = 'terminada', fin_at = datetime('now') WHERE estado = 'en_curso' AND atendido_at < datetime('now','-3 hours')").run();
  vencerTimbres();
}
function vencerTimbres(id?: string) {
  db.prepare(`UPDATE soporte_llamadas SET estado = 'sin_respuesta', fin_at = datetime('now') WHERE estado = 'llamando' AND creado < datetime('now','-${TIMBRE_SEG + 5} seconds')${id ? ' AND id = ?' : ''}`).run(...(id ? [id] : []));
}

// ── Llamadas salientes (solo el superadmin) ─────────────────────────────────
// Última vez que cada tienda preguntó por llamadas entrantes: sirve para saber si tiene DealFlow abierto.
const ultimaConsulta = new Map<string, number>();
export const tiendaConectada = (storeId: string) => Date.now() - (ultimaConsulta.get(storeId) || 0) < 20_000;

/** El superadmin llama a una tienda. Si ya la está llamando, devuelve esa misma llamada. */
export function llamarTienda(storeId: string, motivo: string): { id: string; tienda: string } | { error: string } {
  vencerTimbres();
  const st = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  if (!st) return { error: 'Esa tienda no existe.' };
  const ya = db.prepare("SELECT id FROM soporte_llamadas WHERE store_id = ? AND direccion = 'saliente' AND estado IN ('llamando','en_curso') ORDER BY creado DESC LIMIT 1").get(storeId) as { id: string } | undefined;
  if (ya) return { id: ya.id, tienda: st.nombre };
  const id = uid();
  db.prepare(`INSERT INTO soporte_llamadas (id, store_id, user_id, usuario, tienda, sala, motivo, seccion, estado, atendido_por, direccion)
    VALUES (?,?,'','',?,?,?,'','llamando',?,'saliente')`).run(id, storeId, st.nombre.slice(0, 80), `DealFlowSoporte${randomBytes(9).toString('hex')}`, motivo.slice(0, 300), NOMBRE_ADMIN);
  return { id, tienda: st.nombre };
}

/** ¿Alguien de DealFlow está llamando a esta tienda ahora? (lo pregunta la app de la tienda cada pocos segundos). */
export function llamadaEntrante(storeId: string): { id: string; motivo: string; quien: string } | null {
  ultimaConsulta.set(storeId, Date.now());
  const r = db.prepare(`SELECT id, motivo FROM soporte_llamadas WHERE store_id = ? AND direccion = 'saliente' AND estado = 'llamando'
    AND creado > datetime('now','-${TIMBRE_SEG} seconds') ORDER BY creado DESC LIMIT 1`).get(storeId) as { id: string; motivo: string } | undefined;
  return r ? { id: r.id, motivo: r.motivo, quien: NOMBRE_ADMIN } : null;
}

/** La tienda contesta: queda como la persona en la llamada. */
export function contestarLlamada(id: string, u: { id: string; nombre: string; email: string; storeId: string }): boolean {
  vencerTimbres(id);
  const ok = db.prepare("UPDATE soporte_llamadas SET estado = 'en_curso', user_id = ?, usuario = ?, atendido_at = datetime('now') WHERE id = ? AND store_id = ? AND direccion = 'saliente' AND estado = 'llamando'")
    .run(u.id, (u.nombre || u.email).slice(0, 80), id, u.storeId).changes > 0;
  if (ok) registrarLog(u.storeId, 'info', 'soporte', `Contestó la llamada del ${NOMBRE_ADMIN}.`);
  return ok;
}
/** La tienda rechaza la llamada (al equipo se le corta con el aviso). */
export function rechazarLlamada(id: string, storeId: string): boolean {
  // Sin señal de «colgar»: el equipo lo ve por el estado y muestra «La tienda rechazó la llamada».
  return db.prepare("UPDATE soporte_llamadas SET estado = 'rechazada', fin_at = datetime('now') WHERE id = ? AND store_id = ? AND direccion = 'saliente' AND estado = 'llamando'").run(id, storeId).changes > 0;
}


export async function crearLlamada(u: { id: string; nombre: string; email: string; storeId: string }, motivo: string, seccion: string):
  Promise<ReturnType<typeof vista> | { error: string }> {
  vencer();
  const c = cfgLlamadas();
  if (!abiertoAhora(c)) { const e = estadoServicio(); return { error: `Ahora no hay atención por llamada.${e.siguiente ? ` ${e.siguiente}` : ''} Horario: ${horarioTexto(c)}. Mientras tanto, escríbele a SKY.` }; }
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
    // Tienda oculta: solo se avisa al superadmin (el resto del equipo no la ve).
    const oculta = !!(db.prepare('SELECT COALESCE(oculta,0) o FROM stores WHERE id = ?').get(u.storeId) as { o: number } | undefined)?.o;
    const equipo = db.prepare(`SELECT email FROM users WHERE role IN (${oculta ? "'SUPERADMIN'" : "'ADMIN','SUPERADMIN','SOPORTE'"}) AND COALESCE(email,'') != ''`).all() as { email: string }[];
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
/** ¿La hizo el superadmin hacia la tienda? (solo él la ve y la maneja). */
export function esSaliente(id: string): boolean {
  return !!db.prepare("SELECT 1 FROM soporte_llamadas WHERE id = ? AND direccion = 'saliente'").get(id);
}
/** ¿La llamada es de una tienda oculta por el superadmin? (solo él la ve). */
export function llamadaDeTiendaOculta(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM soporte_llamadas l JOIN stores s ON s.id = l.store_id WHERE l.id = ? AND COALESCE(s.oculta,0) = 1').get(id);
}
/** Llamadas para el panel del equipo. Las de tiendas ocultas solo las ve el superadmin. */
export function llamadasEquipo(verOcultas = false) {
  vencer();
  const filas = db.prepare(`SELECT * FROM soporte_llamadas l WHERE (l.estado IN ('esperando','en_curso','llamando') OR l.creado > datetime('now','-7 days'))
    ${verOcultas ? '' : "AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = l.store_id AND COALESCE(s.oculta,0) = 1) AND COALESCE(l.direccion,'entrante') = 'entrante'"}
    ORDER BY CASE l.estado WHEN 'esperando' THEN 0 WHEN 'en_curso' THEN 1 ELSE 2 END, l.creado DESC LIMIT 80`).all() as Fila[];
  return filas.map((r) => ({
    id: txt(r.id), storeId: txt(r.store_id), tienda: txt(r.tienda), usuario: txt(r.usuario), motivo: txt(r.motivo), seccion: txt(r.seccion),
    estado: txt(r.estado), atendidoPor: txt(r.atendido_por), creado: txt(r.creado), atendidoAt: txt(r.atendido_at), finAt: txt(r.fin_at),
    direccion: txt(r.direccion) || 'entrante',
  }));
}
export function atenderLlamada(id: string, agente: string): boolean {
  return db.prepare("UPDATE soporte_llamadas SET estado = 'en_curso', atendido_por = ?, atendido_at = COALESCE(atendido_at, datetime('now')) WHERE id = ? AND estado IN ('esperando','en_curso','sin_atender')").run(agente.slice(0, 80), id).changes > 0;
}
export function terminarLlamada(id: string): boolean {
  const ok = db.prepare("UPDATE soporte_llamadas SET estado = CASE WHEN estado = 'llamando' THEN 'cancelada' ELSE 'terminada' END, fin_at = datetime('now') WHERE id = ? AND estado IN ('esperando','en_curso','llamando')").run(id).changes > 0;
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
  if (u.role === 'SUPERADMIN') return 'soporte';
  if (['ADMIN', 'SOPORTE'].includes(u.role)) return llamadaDeTiendaOculta(id) || esSaliente(id) ? null : 'soporte';
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
  vencerTimbres(id);
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
