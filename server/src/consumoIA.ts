import { db } from './db.js';

/**
 * Consumo de IA por tienda (DeepSeek / OpenAI / Grok / Claude con la clave de la tienda).
 * Cada respuesta de la API trae `usage`: aquí se suma por día y tipo de llamada, y por chat,
 * para poder ver qué está gastando (más mensajes, un catálogo más grande, un chat en bucle…).
 */
db.exec(`CREATE TABLE IF NOT EXISTS ia_consumo (
  store_id TEXT NOT NULL, dia TEXT NOT NULL, tipo TEXT NOT NULL,
  llamadas INTEGER NOT NULL DEFAULT 0, entrada INTEGER NOT NULL DEFAULT 0, cache INTEGER NOT NULL DEFAULT 0, salida INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, dia, tipo))`);
db.exec(`CREATE TABLE IF NOT EXISTS ia_consumo_chat (
  store_id TEXT NOT NULL, lead_id TEXT NOT NULL, dia TEXT NOT NULL,
  llamadas INTEGER NOT NULL DEFAULT 0, entrada INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, lead_id, dia))`);

export type TipoIA = 'respuesta' | 'seguimiento' | 'clasificar' | 'extraer' | 'imagen' | 'sky' | 'otros';
export const NOMBRE_TIPO: Record<TipoIA, string> = {
  respuesta: 'Respuestas del bot en el chat', seguimiento: 'Mensajes de seguimiento', clasificar: 'Leer el «sí / no» de la confirmación',
  extraer: 'Sacar el pedido del chat (botón)', imagen: 'Entender fotos (OpenAI)', sky: 'SKY (asistente de ayuda)', otros: 'Otras tareas (ordenar direcciones, importar productos y pedidos)',
};

// Precio estimado en USD por millón de tokens (DeepSeek chat). Se puede ajustar en Railway si cambia.
const PRECIO = () => ({
  entrada: Number(process.env.IA_USD_M_ENTRADA || 0.28),
  cache: Number(process.env.IA_USD_M_CACHE || 0.028),
  salida: Number(process.env.IA_USD_M_SALIDA || 0.42),
});
export function costoUSD(entrada: number, cache: number, salida: number): number {
  const p = PRECIO();
  return ((Math.max(0, entrada - cache) * p.entrada) + (cache * p.cache) + (salida * p.salida)) / 1e6;
}

// Costo en USD de cada llamada, guardado con el precio del modelo que la atendió (DeepSeek y Claude
// cobran distinto, y en Claude cada modelo tiene su precio). Lo anterior a esta columna se rellena
// una sola vez con el precio de DeepSeek, que era el único que se medía.
if (!(db.prepare('PRAGMA table_info(ia_consumo)').all() as { name: string }[]).some((c) => c.name === 'usd')) {
  db.exec('ALTER TABLE ia_consumo ADD COLUMN usd REAL NOT NULL DEFAULT 0');
  const p = PRECIO();
  db.prepare('UPDATE ia_consumo SET usd = ((MAX(0, entrada - cache) * ?) + (cache * ?) + (salida * ?)) / 1000000.0').run(p.entrada, p.cache, p.salida);
}

const insDia = db.prepare(`INSERT INTO ia_consumo (store_id, dia, tipo, llamadas, entrada, cache, salida, usd) VALUES (?, date('now'), ?, 1, ?, ?, ?, ?)
  ON CONFLICT(store_id, dia, tipo) DO UPDATE SET llamadas = llamadas + 1, entrada = entrada + excluded.entrada, cache = cache + excluded.cache, salida = salida + excluded.salida, usd = usd + excluded.usd`);
const insChat = db.prepare(`INSERT INTO ia_consumo_chat (store_id, lead_id, dia, llamadas, entrada) VALUES (?, ?, date('now'), 1, ?)
  ON CONFLICT(store_id, lead_id, dia) DO UPDATE SET llamadas = llamadas + 1, entrada = entrada + excluded.entrada`);

/** Registra el `usage` de una respuesta de la API y devuelve el mismo cuerpo (para envolver `await res.json()`). Nunca lanza. */
export function medirIA<T>(storeId: string, tipo: TipoIA, leadId: string, body: T): T {
  try {
    const u = (body as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } })?.usage;
    if (!storeId || !u) return body;
    const entrada = Number(u.prompt_tokens) || 0;
    const cache = Number(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens) || 0;
    const salida = Number(u.completion_tokens) || 0;
    insDia.run(storeId, tipo, entrada, cache, salida, costoUSD(entrada, cache, salida));
    if (leadId) insChat.run(storeId, leadId, entrada);
  } catch (e) { console.error('[ia] midiendo consumo', e); }
  return body;
}

/**
 * Registra una llamada cuyo costo ya viene calculado (Claude: cada modelo tiene su precio y la
 * escritura en caché se cobra aparte). `entrada` es todo lo enviado; `cache`, lo que se leyó de caché.
 */
export function medirUso(storeId: string, tipo: TipoIA, leadId: string, uso: { entrada: number; cache: number; salida: number; usd: number }): void {
  try {
    if (!storeId) return;
    insDia.run(storeId, tipo, uso.entrada, uso.cache, uso.salida, uso.usd);
    if (leadId) insChat.run(storeId, leadId, uso.entrada);
  } catch (e) { console.error('[ia] midiendo consumo', e); }
}

interface FilaDia { dia: string; llamadas: number; entrada: number; cache: number; salida: number; usd: number }
/** Resumen de una tienda: por día, por tipo y los chats que más gastan. */
export function resumenConsumo(storeId: string, dias = 14) {
  const desde = `-${Math.max(1, Math.min(90, dias))} days`;
  const porDia = (db.prepare(`SELECT dia, SUM(llamadas) llamadas, SUM(entrada) entrada, SUM(cache) cache, SUM(salida) salida, SUM(usd) usd FROM ia_consumo
    WHERE store_id = ? AND dia >= date('now', ?) GROUP BY dia ORDER BY dia`).all(storeId, desde) as FilaDia[]);
  const porTipo = (db.prepare(`SELECT tipo, SUM(llamadas) llamadas, SUM(entrada) entrada, SUM(cache) cache, SUM(salida) salida, SUM(usd) usd FROM ia_consumo
    WHERE store_id = ? AND dia >= date('now', ?) GROUP BY tipo ORDER BY entrada DESC`).all(storeId, desde) as (FilaDia & { tipo: TipoIA })[])
    .map((t) => ({ ...t, nombre: NOMBRE_TIPO[t.tipo] || t.tipo, promedioEntrada: t.llamadas ? Math.round(t.entrada / t.llamadas) : 0 }));
  const chats = db.prepare(`SELECT c.lead_id, l.nombre, l.tel, SUM(c.llamadas) llamadas, SUM(c.entrada) entrada FROM ia_consumo_chat c LEFT JOIN leads l ON l.id = c.lead_id
    WHERE c.store_id = ? AND c.dia >= date('now', '-7 days') GROUP BY c.lead_id ORDER BY llamadas DESC LIMIT 10`).all(storeId) as { lead_id: string; nombre: string | null; tel: string | null; llamadas: number; entrada: number }[];
  const tot = porDia.reduce((a, d) => ({ llamadas: a.llamadas + d.llamadas, entrada: a.entrada + d.entrada, cache: a.cache + d.cache, salida: a.salida + d.salida, usd: a.usd + d.usd }), { llamadas: 0, entrada: 0, cache: 0, salida: 0, usd: 0 });
  return { dias, porDia, porTipo, chats, total: tot };
}

/** Todas las tiendas, de la que más gasta a la que menos (últimos N días). */
export function rankingConsumo(dias = 7) {
  const desde = `-${Math.max(1, Math.min(90, dias))} days`;
  return (db.prepare(`SELECT c.store_id, s.nombre, SUM(c.llamadas) llamadas, SUM(c.entrada) entrada, SUM(c.cache) cache, SUM(c.salida) salida, SUM(c.usd) usd,
      SUM(CASE WHEN c.tipo = 'respuesta' THEN c.llamadas ELSE 0 END) respuestas, SUM(CASE WHEN c.tipo = 'respuesta' THEN c.entrada ELSE 0 END) entradaRespuestas
    FROM ia_consumo c LEFT JOIN stores s ON s.id = c.store_id WHERE c.dia >= date('now', ?) GROUP BY c.store_id ORDER BY entrada DESC LIMIT 100`).all(desde) as
    { store_id: string; nombre: string | null; llamadas: number; entrada: number; cache: number; salida: number; usd: number; respuestas: number; entradaRespuestas: number }[])
    .map((r) => ({ ...r, promedioRespuesta: r.respuestas ? Math.round(r.entradaRespuestas / r.respuestas) : 0 }));
}
