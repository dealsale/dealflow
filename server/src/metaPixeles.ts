/**
 * Píxeles de Meta desde DealFlow, con la cuenta de Anuncios conectada (sin copiar números ni tokens):
 *  - listar los píxeles de la cuenta publicitaria (GET act_X/adspixels),
 *  - crear uno nuevo (POST act_X/adspixels con su nombre; Meta puede responder 6200 = «ya existe
 *    un píxel para esta cuenta»: entonces se usa el que hay),
 *  - usarlo en «Mi tienda» (y con eso en todas las landings sin píxel propio) y para las ventas
 *    por WhatsApp, y conectarlo a la API de Conversiones con el acceso de Anuncios (se prueba con
 *    Meta en ese momento; si no lo acepta, se pide el token del píxel como antes).
 */
import { db, registrarLog } from './db.js';
import { cuenta, graph } from './adsManager.js';

export interface PixelMeta { id: string; nombre: string; ultimoEvento: string; disponible: boolean; usos: string[]; conectado: boolean; auto: boolean }

async function usosDe(storeId: string): Promise<Map<string, string[]>> {
  const L = await import('./landings.js');
  const { cfgCapi } = await import('./metaCapi.js');
  const usos = new Map<string, string[]>();
  const add = (id: string, u: string) => { const k = String(id || '').replace(/\D/g, ''); if (k) usos.set(k, [...(usos.get(k) || []), u]); };
  const tienda = L.configTienda(storeId).pixelMeta;
  add(tienda, 'Mi tienda');
  add(cfgCapi(storeId).pixelVentas || tienda, 'Ventas de WhatsApp');
  const filas = db.prepare('SELECT datos FROM landings WHERE store_id = ?').all(storeId) as { datos: string }[];
  let n = 0;
  const conPropio = new Map<string, number>();
  for (const f of filas) {
    let px = '';
    try { px = String((JSON.parse(f.datos) as { pixelMeta?: string }).pixelMeta || '').replace(/\D/g, ''); } catch { /* datos dañados */ }
    if (px) conPropio.set(px, (conPropio.get(px) || 0) + 1); else n++;
  }
  for (const [px, k] of conPropio) add(px, `${k} landing${k === 1 ? '' : 's'}`);
  if (tienda && n) add(tienda, `${n} landing${n === 1 ? '' : 's'} (por «Mi tienda»)`);
  return usos;
}

export async function listarPixeles(storeId: string): Promise<{ conectada: boolean; pixeles: PixelMeta[]; error?: string }> {
  const c = cuenta(storeId);
  if (!c) return { conectada: false, pixeles: [] };
  const r = await graph<{ data?: { id?: string; name?: string; last_fired_time?: string; is_unavailable?: boolean }[] }>(c, `${c.act}/adspixels`, 'GET', { fields: 'id,name,last_fired_time,is_unavailable', limit: '50' });
  if (!r.ok) return { conectada: true, pixeles: [], error: r.error };
  const { tokenDePixel, estado } = await import('./metaPixelWeb.js');
  const usos = await usosDe(storeId);
  const est = estado(storeId, []);
  return {
    conectada: true,
    pixeles: (r.body.data || []).filter((p) => p.id).map((p) => {
      const id = String(p.id);
      return {
        id, nombre: String(p.name || id), ultimoEvento: String(p.last_fired_time || ''), disponible: !p.is_unavailable,
        usos: usos.get(id) || [], conectado: !!tokenDePixel(storeId, id), auto: !!est.pixeles.find((x) => x.pixelId === id)?.auto,
      };
    }),
  };
}

export async function crearPixel(storeId: string, nombre: string): Promise<{ ok: true; id: string; existente?: boolean } | { error: string }> {
  const c = cuenta(storeId);
  if (!c) return { error: 'Conecta primero tu cuenta de Anuncios (Integraciones → Meta Ads).' };
  const n = String(nombre || '').trim().slice(0, 100);
  if (n.length < 2) return { error: 'Escribe un nombre para el píxel.' };
  const r = await graph<{ id?: string }>(c, `${c.act}/adspixels`, 'POST', { name: n });
  if (!r.ok) {
    // 6200: la cuenta ya tiene un píxel y Meta no deja crear otro desde ella → se usa el existente.
    if (r.codigo === 6200 || /already exists|ya existe/i.test(r.error)) {
      const l = await listarPixeles(storeId);
      if (l.pixeles[0]) return { ok: true, id: l.pixeles[0].id, existente: true };
    }
    return { error: r.error };
  }
  if (!r.body.id) return { error: 'Meta no devolvió el píxel creado.' };
  registrarLog(storeId, 'info', 'meta', `Se creó el píxel «${n}» (${r.body.id}) desde DealFlow.`);
  return { ok: true, id: String(r.body.id) };
}

/**
 * Usa un píxel de la cuenta: en «Mi tienda» (todas las landings sin píxel propio), para las
 * ventas por WhatsApp, y lo conecta a la API de Conversiones si aún no tiene token.
 */
export async function usarPixel(storeId: string, pixelId: string, d: { tienda?: boolean; ventas?: boolean; conectar?: boolean }): Promise<{ ok: true; conectado: boolean; mensaje: string } | { error: string }> {
  const id = String(pixelId || '').replace(/\D/g, '');
  const l = await listarPixeles(storeId);
  if (!l.conectada) return { error: 'Conecta primero tu cuenta de Anuncios (Integraciones → Meta Ads).' };
  if (l.error) return { error: l.error };
  if (!l.pixeles.some((p) => p.id === id)) return { error: 'Ese píxel no es de tu cuenta publicitaria.' };
  const partes: string[] = [];
  if (d.tienda) {
    const L = await import('./landings.js');
    L.guardarConfigTienda(storeId, { pixelMeta: id });
    partes.push('Mi tienda y sus landings');
  }
  if (d.ventas) {
    const { guardarCfgCapi } = await import('./metaCapi.js');
    guardarCfgCapi(storeId, { pixelVentas: id });
    partes.push('las ventas de WhatsApp');
  }
  const { tokenDePixel, conectarAuto } = await import('./metaPixelWeb.js');
  let conectado = !!tokenDePixel(storeId, id);
  let extra = '';
  if (!conectado && d.conectar !== false) {
    const r = await conectarAuto(storeId, id);
    conectado = 'ok' in r;
    extra = 'ok' in r ? ' Conectado a la API de Conversiones.' : ` ${r.error}`;
  }
  return { ok: true, conectado, mensaje: `✓ Píxel ${id} en ${partes.join(' y ') || 'DealFlow'}.${extra}` };
}

/** Todo en un clic: usa el píxel de la cuenta (o crea uno) y lo deja conectado. */
export async function configurarTodo(storeId: string): Promise<{ ok: true; id: string; creado: boolean; conectado: boolean; mensaje: string } | { error: string }> {
  const l = await listarPixeles(storeId);
  if (!l.conectada) return { error: 'Conecta primero tu cuenta de Anuncios (Integraciones → Meta Ads).' };
  if (l.error) return { error: l.error };
  // Preferir el que ya recibe eventos más recientes.
  const lista = [...l.pixeles].filter((p) => p.disponible).sort((a, b) => b.ultimoEvento.localeCompare(a.ultimoEvento));
  // Si «Mi tienda» ya usa un píxel de esta cuenta, se respeta.
  const L = await import('./landings.js');
  const actual = String(L.configTienda(storeId).pixelMeta || '').replace(/\D/g, '');
  let id = lista.find((p) => p.id === actual)?.id || lista[0]?.id || '';
  let creado = false;
  if (!id) {
    const nombre = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'Mi tienda';
    const c = await crearPixel(storeId, `${nombre} · DealFlow`);
    if ('error' in c) return c;
    id = c.id; creado = !c.existente;
  }
  const u = await usarPixel(storeId, id, { tienda: true, ventas: true, conectar: true });
  if ('error' in u) return u;
  return { ok: true, id, creado, conectado: u.conectado, mensaje: `${creado ? '✓ Creamos tu píxel. ' : ''}${u.mensaje}` };
}
