/**
 * Protección de la calidad del número de WhatsApp.
 *
 * Meta baja la calidad (y luego limita o bloquea el número) cuando los clientes
 * bloquean o reportan los mensajes. Lo que más lo provoca: escribirle a quien
 * pidió que no, mensajes en frío a números que nunca escribieron, y muchos
 * mensajes no pedidos seguidos. Aquí:
 *  - "Baja": si el cliente pide que no le escriban, se le responde UNA vez con
 *    respeto y no se le vuelve a escribir por iniciativa nuestra (hasta que él
 *    vuelva a escribir).
 *  - Tope de mensajes PROACTIVOS (los que no responden a algo del cliente:
 *    recordatorios, cambios de estado, avisos): máximo 2 por cliente al día.
 *  - Celular de contacto distinto al del chat: solo si la tienda lo activa.
 */
import { db, pj, registrarLog } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS proactivos (
  store_id TEXT NOT NULL, tel TEXT NOT NULL, fecha TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, tel, fecha)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS proactivos_tipo (
  store_id TEXT NOT NULL, fecha TEXT NOT NULL, tipo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, fecha, tipo)
)`);
// Última calidad que reportó Meta para el número (GREEN | YELLOW | RED) y cuándo se leyó.
for (const col of ["calidad_meta TEXT NOT NULL DEFAULT ''", 'calidad_at TEXT']) { try { db.exec(`ALTER TABLE whatsapp ADD COLUMN ${col}`); } catch { /* ya existe */ } }

export const TOPE_DIARIO = 2;

/**
 * Qué clase de mensaje por iniciativa propia se envió. Los "avisos" son del pedido que el
 * cliente hizo (los espera); los "opcionales" son de venta o recordatorio: son los que el
 * cliente puede sentir como spam y los que se pausan solos si Meta baja la calidad.
 */
export type TipoProactivo = 'confirmacion' | 'guia' | 'estado' | 'novedad' | 'seguimiento_pedido' | 'recordatorio' | 'remarketing';
export const TIPOS_OPCIONALES: TipoProactivo[] = ['seguimiento_pedido', 'recordatorio', 'remarketing'];
const diez = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);
const hoyCO = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// "Baja": frases claras de que no quiere más mensajes (no un simple "no").
const RE_BAJA = /^(baja|stop|parar|unsubscribe)$|\b(no me (vuelvan a |vuelvas a |sigan |sigas )?(escriban|escribas|escribir|contacten|contactes|llamen|manden|envien|mandes)|deje(n)? de (escribirme|escribir|enviarme|mandarme|molestar)|no (quiero|deseo) (recibir|mas mensajes|que me escriban)|no me interesa(n)? (mas|nada)|borr(a|en)me|sa(c|qu)(a|en|e)me de (la lista|sus listas|su lista|tu lista|tus listas)|es spam|voy a (reportar|denunciar|bloquear)|los voy a (reportar|denunciar|bloquear)|no autorice)\b/;
export const esBaja = (texto: string) => RE_BAJA.test(norm(texto));

export interface CalidadCfg { avisarContacto: boolean; frenoAuto: boolean }
export function calidadCfg(storeId: string): CalidadCfg {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'calidad'").get(storeId) as { config: string } | undefined;
  const c = pj<Record<string, unknown>>(r?.config || '', {});
  // Freno automático encendido por defecto: con la calidad en media o baja se pausan los opcionales.
  return { avisarContacto: c.avisarContacto === true, frenoAuto: c.frenoAuto !== false };
}

/** Última calidad conocida del número según Meta ('' si nunca se leyó o no es la API oficial). */
export function calidadMeta(storeId: string): string {
  return (db.prepare('SELECT calidad_meta FROM whatsapp WHERE store_id = ?').get(storeId) as { calidad_meta: string } | undefined)?.calidad_meta || '';
}

/** Guarda la calidad que reportó Meta y deja constancia cuando cambia (y si el freno se activa o se suelta). */
export function guardarCalidadMeta(storeId: string, calidad: string): void {
  const c = String(calidad || '').toUpperCase();
  if (!['GREEN', 'YELLOW', 'RED'].includes(c)) return;
  const antes = calidadMeta(storeId);
  db.prepare("UPDATE whatsapp SET calidad_meta = ?, calidad_at = datetime('now') WHERE store_id = ?").run(c, storeId);
  if (!antes || antes === c) return;
  const nombre: Record<string, string> = { GREEN: 'alta', YELLOW: 'media', RED: 'baja' };
  const freno = calidadCfg(storeId).frenoAuto;
  if (c !== 'GREEN') registrarLog(storeId, 'warn', 'calidad', `Meta bajó la calidad del número a ${nombre[c]}.${freno ? ' DealFlow pausó solo los recordatorios, el seguimiento de pedidos y el remarketing hasta que vuelva a alta; los avisos de los pedidos (confirmación, guía, entrega) siguen saliendo.' : ''}`);
  else registrarLog(storeId, 'info', 'calidad', `La calidad del número volvió a alta.${freno ? ' Los recordatorios, el seguimiento de pedidos y el remarketing vuelven a salir.' : ''}`);
}

/** ¿Están pausados los mensajes opcionales (recordatorios, seguimiento de pedidos, remarketing)? */
export function frenoActivo(storeId: string): boolean {
  const c = calidadMeta(storeId);
  return (c === 'YELLOW' || c === 'RED') && calidadCfg(storeId).frenoAuto;
}
export const MOTIVO_FRENO = 'pausado: la calidad del número en Meta está en media o baja (se reanuda solo cuando vuelva a alta)';
export function guardarCalidadCfg(storeId: string, parcial: Partial<CalidadCfg>): CalidadCfg {
  const nuevo = { ...calidadCfg(storeId), ...parcial };
  db.prepare("INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'calidad', ?, datetime('now')) ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at").run(storeId, JSON.stringify(nuevo));
  return nuevo;
}

/**
 * Al llegar un mensaje del cliente: si pide la baja, lo marca y devuelve el texto
 * de despedida a enviar (una sola vez). Si ya estaba de baja y escribe otra cosa,
 * se la quita (volvió a escribir por su cuenta). Devuelve null si no aplica.
 */
export function revisarBaja(storeId: string, leadId: string, texto: string): string | null {
  const l = db.prepare('SELECT no_contactar, nombre FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { no_contactar: number; nombre: string } | undefined;
  if (!l) return null;
  if (esBaja(texto)) {
    if (Number(l.no_contactar)) return ''; // ya estaba: no repetimos la despedida
    db.prepare("UPDATE leads SET no_contactar = 1, no_contactar_at = datetime('now'), seguimiento_nivel = 3 WHERE id = ?").run(leadId);
    registrarLog(storeId, 'warn', 'calidad', 'Un cliente pidió que no le escribamos más. DealFlow no le volverá a escribir por su cuenta (solo si él escribe primero).', leadId);
    const n = String(l.nombre || '').split(' ')[0];
    return `Entendido${n ? ', ' + n : ''} 🙏 No te escribiremos más. Si algún día necesitas algo, aquí estamos.`;
  }
  if (Number(l.no_contactar)) db.prepare('UPDATE leads SET no_contactar = 0, no_contactar_at = NULL WHERE id = ?').run(leadId);
  return null;
}

/** ¿Podemos escribirle por iniciativa nuestra? (no pidió la baja y no pasó el tope del día). */
export function puedeEscribirle(storeId: string, tel: string, leadId?: string | null): { ok: boolean; motivo: string } {
  const t = diez(tel);
  const lead = leadId
    ? db.prepare('SELECT no_contactar FROM leads WHERE id = ?').get(leadId) as { no_contactar: number } | undefined
    : t ? db.prepare("SELECT no_contactar FROM leads WHERE store_id = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? ORDER BY created_at DESC LIMIT 1").get(storeId, `%${t}`) as { no_contactar: number } | undefined : undefined;
  if (lead && Number(lead.no_contactar)) return { ok: false, motivo: 'el cliente pidió que no le escribamos' };
  if (!t) return { ok: true, motivo: '' };
  const n = (db.prepare('SELECT n FROM proactivos WHERE store_id = ? AND tel = ? AND fecha = ?').get(storeId, t, hoyCO()) as { n: number } | undefined)?.n || 0;
  if (n >= TOPE_DIARIO) return { ok: false, motivo: `ya le escribimos ${n} veces hoy sin que lo pidiera (tope para cuidar el número)` };
  return { ok: true, motivo: '' };
}

/** Cuenta un mensaje proactivo enviado (por cliente para el tope diario, y por tipo para el panel). */
export function contarProactivo(storeId: string, tel: string, tipo: TipoProactivo): void {
  const t = diez(tel);
  if (!t) return;
  const hoy = hoyCO();
  db.prepare('INSERT INTO proactivos (store_id, tel, fecha, n) VALUES (?,?,?,1) ON CONFLICT(store_id, tel, fecha) DO UPDATE SET n = n + 1').run(storeId, t, hoy);
  db.prepare('INSERT INTO proactivos_tipo (store_id, fecha, tipo, n) VALUES (?,?,?,1) ON CONFLICT(store_id, fecha, tipo) DO UPDATE SET n = n + 1').run(storeId, hoy, tipo);
  db.prepare("DELETE FROM proactivos WHERE fecha < date('now','-8 days')").run();
  db.prepare("DELETE FROM proactivos_tipo WHERE fecha < date('now','-8 days')").run();
}

/**
 * Una sola vez: reconstruye por tipo los mensajes de los últimos días (antes solo se contaba el
 * total) con lo que quedó registrado en cada módulo. Lo que no se puede reconstruir (recordatorios
 * del asistente) queda como "otros" en el panel: la diferencia con el total.
 */
function reconstruirTipos(): void {
  const k = 'calidad_tipos_v1';
  try {
    const ya = db.prepare('SELECT 1 FROM config_global WHERE clave = ?').get(k);
    if (ya) return;
  } catch { return; }
  const ins = db.prepare('INSERT INTO proactivos_tipo (store_id, fecha, tipo, n) VALUES (?,?,?,?) ON CONFLICT(store_id, fecha, tipo) DO UPDATE SET n = n + excluded.n');
  const sumar = (filas: { store_id: string; fecha: string; tipo: string; n: number }[]) => { for (const f of filas) if (f.fecha) ins.run(f.store_id, f.fecha, f.tipo, f.n); };
  const q = (sql: string) => { try { return db.prepare(sql).all() as { store_id: string; fecha: string; tipo: string; n: number }[]; } catch { return []; } };
  db.transaction(() => {
    sumar(q(`SELECT store_id, date(enviado_at,'-5 hours') fecha, CASE WHEN origen LIKE 'seguimiento%' THEN 'seguimiento_pedido' ELSE 'estado' END tipo, COUNT(*) n
               FROM avisos_estado WHERE resultado IN ('enviado','plantilla') AND enviado_at >= datetime('now','-8 days') GROUP BY 1,2,3`));
    sumar(q(`SELECT store_id, date(enviado_at,'-5 hours') fecha, 'remarketing' tipo, COUNT(*) n
               FROM remarketing_envios WHERE estado = 'enviado' AND enviado_at >= datetime('now','-8 days') GROUP BY 1,2`));
    sumar(q(`SELECT store_id, date(substr(json_extract(guia_aviso,'$.at'),1,19),'-5 hours') fecha, 'guia' tipo, COUNT(*) n
               FROM orders WHERE guia_aviso LIKE '{%' AND json_extract(guia_aviso,'$.ok') = 1 AND json_extract(guia_aviso,'$.at') >= strftime('%Y-%m-%dT%H:%M:%S', 'now','-8 days') GROUP BY 1,2`));
    sumar(q(`SELECT store_id, date(created_at,'-5 hours') fecha, 'confirmacion' tipo, COUNT(*) n
               FROM orders WHERE confirmacion IN ('esperando','si','no') AND created_at >= datetime('now','-8 days') GROUP BY 1,2`));
    db.prepare("INSERT INTO config_global (clave, valor) VALUES (?, datetime('now'))").run(k);
  })();
}
db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");
let reconstruido = false;

/** Para el panel: cuántos pidieron la baja, cuántos mensajes por iniciativa propia van en 7 días y de qué tipo. */
export function resumenCalidad(storeId: string) {
  // Se reconstruye al primer uso (cuando ya existen las tablas de todos los módulos).
  if (!reconstruido) { reconstruido = true; try { reconstruirTipos(); } catch (e) { console.warn('[calidad] no se pudo reconstruir el detalle por tipo:', e); } }
  const bajas = (db.prepare('SELECT COUNT(*) n FROM leads WHERE store_id = ? AND no_contactar = 1').get(storeId) as { n: number }).n;
  // 7 días contando hoy (fechas de Colombia).
  const desde = new Date(Date.now() - 5 * 3600_000 - 6 * 86400_000).toISOString().slice(0, 10);
  const proactivos7d = (db.prepare('SELECT COALESCE(SUM(n),0) n FROM proactivos WHERE store_id = ? AND fecha >= ?').get(storeId, desde) as { n: number }).n;
  const filas = db.prepare('SELECT tipo, SUM(n) n FROM proactivos_tipo WHERE store_id = ? AND fecha >= ? GROUP BY tipo').all(storeId, desde) as { tipo: string; n: number }[];
  const porTipo: Record<string, number> = {};
  for (const f of filas) porTipo[f.tipo] = f.n;
  const clasificados = filas.reduce((a, f) => a + f.n, 0);
  if (proactivos7d > clasificados) porTipo.otros = proactivos7d - clasificados;
  const total = Math.max(proactivos7d, clasificados);
  const opcionales = TIPOS_OPCIONALES.reduce((a, t) => a + (porTipo[t] || 0), 0);
  const wa = db.prepare('SELECT calidad_meta, calidad_at FROM whatsapp WHERE store_id = ?').get(storeId) as { calidad_meta: string; calidad_at: string | null } | undefined;
  return {
    cfg: calidadCfg(storeId), bajas, proactivos7d: total, tope: TOPE_DIARIO, porTipo, opcionales,
    calidadMeta: wa?.calidad_meta || '', calidadAt: wa?.calidad_at || null, freno: frenoActivo(storeId),
  };
}

/**
 * Vigila la calidad del número cada 3 horas (Meta la recalcula con los últimos 7 días), para
 * que el freno automático se active o se suelte aunque nadie abra el panel de WhatsApp.
 */
export function iniciarVigilanciaCalidad(): void {
  const correr = async () => {
    const tiendas = db.prepare("SELECT store_id FROM whatsapp WHERE conectado = 1 AND modo = 'cloud' AND COALESCE(access_token,'') != ''").all() as { store_id: string }[];
    const { estadoNumero } = await import('./waEstado.js');
    for (const t of tiendas) {
      try { await estadoNumero(t.store_id); } catch { /* se intenta en la próxima vuelta */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
  };
  setTimeout(() => { void correr(); }, 90_000);
  setInterval(() => { void correr(); }, 3 * 3600_000);
}

