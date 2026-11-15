/**
 * Alertas de anuncios al celular del dueño (notificación push del panel + correo).
 *
 * Cada 30 minutos se revisa, por tienda con Meta Ads conectado:
 *  - gasto_sin_venta: una campaña gastó $X hoy y no tiene ninguna venta.
 *  - cpa_alto: el costo por venta de hoy supera el doble del promedio de los últimos 7 días.
 *  - rechazado: Meta rechazó un anuncio (o lo marcó con problemas).
 *  - cuenta: la cuenta publicitaria no puede pagar o está deshabilitada (sin saldo, pago fallido…).
 *  - pixel: hubo ventas en las últimas 24 h pero el píxel / API de Conversiones no recibió ninguna
 *    (o todo lo enviado dio error).
 *  - resumen: resumen del día anterior a las 8 a. m. (hora Colombia), si se activa.
 * Cada alerta sale como mucho una vez al día por motivo y campaña (no se repite cada 30 min).
 */
import { db, registrarLog } from './db.js';
import { cuenta, graph, panel } from './adsManager.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');

export type TipoAlerta = 'gasto_sin_venta' | 'cpa_alto' | 'rechazado' | 'cuenta' | 'pixel' | 'resumen';
export const TIPOS_ALERTA: Record<TipoAlerta, string> = {
  gasto_sin_venta: 'Una campaña gasta sin vender',
  cpa_alto: 'El costo por venta se dispara',
  rechazado: 'Meta rechaza un anuncio',
  cuenta: 'La cuenta se queda sin saldo o falla el pago',
  pixel: 'El píxel o la API de Conversiones dejan de recibir',
  resumen: 'Resumen diario a las 8 a. m.',
};

db.exec(`CREATE TABLE IF NOT EXISTS ads_alertas_cfg (
  store_id TEXT PRIMARY KEY, activas TEXT NOT NULL DEFAULT '["gasto_sin_venta","cpa_alto","rechazado","cuenta","pixel"]',
  gasto_sin_venta REAL NOT NULL DEFAULT 30000, correo INTEGER NOT NULL DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ads_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL, tipo TEXT NOT NULL, clave TEXT NOT NULL, dia TEXT NOT NULL,
  titulo TEXT NOT NULL, detalle TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (store_id, clave, dia)
)`);

export interface CfgAlertas { activas: TipoAlerta[]; gastoSinVenta: number; correo: boolean }
export function cfgAlertas(storeId: string): CfgAlertas {
  const r = db.prepare('SELECT * FROM ads_alertas_cfg WHERE store_id = ?').get(storeId) as Fila | undefined;
  let activas: TipoAlerta[] = ['gasto_sin_venta', 'cpa_alto', 'rechazado', 'cuenta', 'pixel'];
  try { if (r) activas = (JSON.parse(txt(r.activas)) as string[]).filter((x): x is TipoAlerta => x in TIPOS_ALERTA); } catch { /* por defecto */ }
  return { activas, gastoSinVenta: r ? Number(r.gasto_sin_venta) || 30000 : 30000, correo: r ? !!r.correo : true };
}
export function guardarCfgAlertas(storeId: string, p: Partial<CfgAlertas>): CfgAlertas {
  const a = { ...cfgAlertas(storeId), ...p };
  const activas = (Array.isArray(a.activas) ? a.activas : []).filter((x) => x in TIPOS_ALERTA);
  db.prepare(`INSERT INTO ads_alertas_cfg (store_id, activas, gasto_sin_venta, correo) VALUES (?,?,?,?)
    ON CONFLICT(store_id) DO UPDATE SET activas = excluded.activas, gasto_sin_venta = excluded.gasto_sin_venta, correo = excluded.correo`)
    .run(storeId, JSON.stringify(activas), Math.max(1000, Number(a.gastoSinVenta) || 30000), a.correo ? 1 : 0);
  return cfgAlertas(storeId);
}
export function ultimasAlertas(storeId: string, n = 20) {
  return db.prepare('SELECT tipo, titulo, detalle, creado FROM ads_alertas WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, n) as { tipo: TipoAlerta; titulo: string; detalle: string; creado: string }[];
}

const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const menos = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
const horaCO = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })) % 24;

/** Envía la alerta si no salió hoy con la misma clave. Devuelve true si salió. */
function avisar(storeId: string, cfg: CfgAlertas, tipo: TipoAlerta, clave: string, titulo: string, detalle: string): boolean {
  const r = db.prepare('INSERT OR IGNORE INTO ads_alertas (store_id, tipo, clave, dia, titulo, detalle) VALUES (?,?,?,?,?,?)').run(storeId, tipo, clave, hoyCO(), titulo.slice(0, 160), detalle.slice(0, 500));
  if (!r.changes) return false;
  notificar(storeId, titulo, detalle, cfg.correo);
  return true;
}

/** Notificación al celular (push del panel) + correo opcional + registro. Sin anti-repetición. */
export function notificar(storeId: string, titulo: string, detalle: string, correo = cfgAlertas(storeId).correo): void {
  registrarLog(storeId, 'warn', 'anuncios', `🔔 ${titulo}. ${detalle}`);
  void import('./push.js').then((m) => m.enviarPush(storeId, 'dueno', `📣 ${titulo}`, detalle.slice(0, 180), { url: '/anuncios' })).catch(() => {});
  if (correo) void import('./correo.js').then((m) => m.correoATienda(storeId, 'alertas', `Anuncios: ${titulo}`, titulo, [detalle], { texto: 'Abrir Anuncios', url: `${m.APP_URL}/anuncios` })).catch(() => {});
}

const ESTADO_CUENTA: Record<number, string> = {
  2: 'está deshabilitada', 3: 'tiene un pago pendiente que Meta no pudo cobrar (saldo sin liquidar)', 7: 'está en revisión de riesgo de Meta',
  8: 'tiene un pago pendiente por liquidar', 9: 'está en periodo de gracia por un pago', 100: 'está por cerrarse', 101: 'está cerrada',
};

/** Revisa todas las alertas de una tienda. Devuelve cuántas salieron. */
export async function revisarAlertas(storeId: string): Promise<number> {
  const cfg = cfgAlertas(storeId);
  const c = cuenta(storeId);
  if (!c || !cfg.activas.length) return 0;
  const on = (t: TipoAlerta) => cfg.activas.includes(t);
  let n = 0;
  const hoy = hoyCO();

  if (on('gasto_sin_venta') || on('cpa_alto')) {
    const d = await panel(storeId, hoy, hoy);
    const semana = on('cpa_alto') ? await panel(storeId, menos(hoy, 7), menos(hoy, 1)) : null;
    for (const cp of d.campanas.filter((x) => x.activa)) {
      const ventas = cp.pedidos - cp.cancelados;
      if (on('gasto_sin_venta') && ventas === 0 && !cp.comprasMeta && cp.gasto >= cfg.gastoSinVenta) {
        if (avisar(storeId, cfg, 'gasto_sin_venta', `gsv:${cp.id}`, `${cp.nombre} gastó ${pesos(cp.gasto)} sin vender`, `Hoy lleva ${pesos(cp.gasto)}, ${cp.chats} chats y ninguna venta. Revisa el anuncio o pausa la campaña en Anuncios.`)) n++;
      }
      const antes = semana?.campanas.find((x) => x.id === cp.id);
      if (on('cpa_alto') && antes && ventas >= 1 && antes.cpa > 0 && antes.pedidos - antes.cancelados >= 3 && cp.cpa > antes.cpa * 2 && cp.gasto >= cfg.gastoSinVenta) {
        if (avisar(storeId, cfg, 'cpa_alto', `cpa:${cp.id}`, `Se disparó el costo por venta de ${cp.nombre}`, `Hoy va en ${pesos(cp.cpa)} por venta; el promedio de la última semana era ${pesos(antes.cpa)}.`)) n++;
      }
    }
  }

  if (on('rechazado')) {
    const filtro = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['DISAPPROVED', 'WITH_ISSUES'] }]);
    const r = await graph<{ data?: { id?: string; name?: string; effective_status?: string; ad_review_feedback?: { global?: Record<string, string> } }[] }>(c, `${c.act}/ads`, 'GET', { fields: 'id,name,effective_status,ad_review_feedback', filtering: filtro, limit: '50' });
    if (r.ok) for (const a of r.body.data || []) {
      const motivo = Object.values(a.ad_review_feedback?.global || {})[0] || (a.effective_status === 'WITH_ISSUES' ? 'Meta lo marcó con problemas.' : 'Meta no dio el motivo.');
      if (avisar(storeId, cfg, 'rechazado', `rech:${a.id}`, `Meta ${a.effective_status === 'DISAPPROVED' ? 'rechazó' : 'marcó con problemas'} el anuncio «${txt(a.name)}»`, String(motivo).slice(0, 300))) n++;
    }
  }

  if (on('cuenta')) {
    const r = await graph<{ account_status?: number; disable_reason?: number; name?: string }>(c, c.act, 'GET', { fields: 'account_status,disable_reason,name' });
    if (r.ok && r.body.account_status && r.body.account_status !== 1 && ESTADO_CUENTA[r.body.account_status]) {
      if (avisar(storeId, cfg, 'cuenta', `cuenta:${r.body.account_status}`, `Tu cuenta publicitaria ${ESTADO_CUENTA[r.body.account_status]}`, 'Tus anuncios pueden estar detenidos. Revisa la facturación en el Administrador de anuncios de Meta (Configuración de pagos).')) n++;
    }
  }

  if (on('pixel')) {
    // Solo si la tienda reporta ventas a Meta (API de Conversiones activa o compras de landing en el último mes).
    const { cfgCapi } = await import('./metaCapi.js');
    const capi = cfgCapi(storeId);
    const usaPixel = capi.activo || !!db.prepare("SELECT 1 FROM pixel_eventos WHERE store_id = ? AND evento = 'Purchase' AND created_at > datetime('now','-30 days') LIMIT 1").get(storeId);
    if (usaPixel) {
      // Si la compra se reporta al entregar, no hay forma fiable de contar entregas recientes: solo se avisa por errores.
      const ventas = capi.compra === 'entregado' ? 0 : (db.prepare("SELECT COUNT(*) n FROM orders WHERE store_id = ? AND estado != 'Cancelado' AND total > 0 AND created_at > datetime('now','-48 hours')").get(storeId) as { n: number }).n;
      const px = db.prepare("SELECT SUM(estado = 'enviado') ok, SUM(estado = 'error') err FROM pixel_eventos WHERE store_id = ? AND evento = 'Purchase' AND created_at > datetime('now','-48 hours')").get(storeId) as { ok: number | null; err: number | null };
      const ds = db.prepare("SELECT SUM(estado = 'enviado') ok, SUM(estado = 'error') err FROM capi_eventos WHERE store_id = ? AND evento = 'Purchase' AND created_at > datetime('now','-48 hours')").get(storeId) as { ok: number | null; err: number | null };
      const ok = (px.ok || 0) + (ds.ok || 0), err = (px.err || 0) + (ds.err || 0);
      if (!ok && (ventas >= 3 || err >= 3)) {
        const det = err
          ? `Las ${err} compras que se intentaron enviar en las últimas 48 h dieron error. Revisa el token en Integraciones → Reportar ventas a Meta.`
          : `Hubo ${ventas} ventas en las últimas 48 h y ninguna llegó a Meta. Revisa el píxel y su token en Integraciones → Reportar ventas a Meta.`;
        if (avisar(storeId, cfg, 'pixel', 'pixel', 'Meta no está recibiendo tus ventas', det)) n++;
      }
    }
  }

  if (on('resumen') && horaCO() >= 8) {
    const ayer = menos(hoy, 1);
    const d = await panel(storeId, ayer, ayer);
    const s = d.resumen;
    if (s.gasto > 0 || s.pedidos > 0) {
      const top = d.campanas.filter((x) => x.gasto > 0).sort((a, b) => b.roasNeto - a.roasNeto)[0];
      const det = `Ayer: gasto ${pesos(s.gasto)} · ventas ${pesos(s.ventas)} (${s.pedidos - s.cancelados} pedidos) · ROAS esperado ${s.roasNeto} · utilidad estimada ${pesos(s.utilidad)}.${top ? ` La mejor: ${top.nombre} (ROAS esperado ${top.roasNeto}).` : ''}${d.sugerencias.length ? ` Hay ${d.sugerencias.length} sugerencia(s) en Anuncios.` : ''}`;
      if (avisar(storeId, cfg, 'resumen', 'resumen', 'Resumen de tus anuncios de ayer', det)) n++;
    }
  }
  return n;
}

let iniciado = false;
export function iniciarAlertasAds(): void {
  if (iniciado) return;
  iniciado = true;
  const ronda = async () => {
    const tiendas = db.prepare('SELECT store_id FROM ads_cuentas WHERE conectada = 1').all() as { store_id: string }[];
    for (const t of tiendas) {
      await revisarAlertas(t.store_id).catch((e) => console.warn('[anuncios] alertas', e));
      await import('./atribucion.js').then((m) => m.reatribuirRecientes(t.store_id, 7)).catch((e) => console.warn('[anuncios] atribución', e));
      const { revisarPruebas } = await import('./adsPruebas.js');
      await revisarPruebas(t.store_id).catch((e) => console.warn('[anuncios] pruebas', e));
    }
  };
  setTimeout(() => void ronda(), 7 * 60_000).unref?.();
  setInterval(() => void ronda(), 30 * 60_000).unref?.();
}
