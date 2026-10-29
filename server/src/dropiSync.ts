/**
 * Sincronizar un producto con Dropi a partir de su ID.
 *
 * Con el ID del producto en Dropi se traen TODAS sus variaciones (talla, color…)
 * y en DealFlow:
 *  - cada variante que ya existe se vincula sola con su variación (por sus palabras,
 *    sin importar el orden ni "Blanca"/"Blanco"),
 *  - las variaciones que no existían se crean,
 *  - las opciones del producto (Talla, Color) se completan con los valores de Dropi,
 *  - el stock de cada variante se toma de Dropi cuando Dropi lo informa.
 * Desde ese momento las variantes del producto las define Dropi (variantes_fuente =
 * 'dropi'): ya no se arman combinando opciones, así no aparecen combinaciones que
 * Dropi no tiene. Las variantes de DealFlow que no existen en Dropi NO se borran
 * (pueden tener pedidos o fotos): se informan para que el dueño decida.
 */
import { db, pj, uid, registrarLog } from './db.js';
import { mismoToken, norm, tokensVariante } from './emparejar.js';
import { credDropi, productoDropi, type DropiVariacion } from './dropiApi.js';

try { db.exec("ALTER TABLE products ADD COLUMN variantes_fuente TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

const VACIAS = new Set(['y', 'con', 'de', 'unica', 'u']);
const tokens = (s: string) => tokensVariante(s).filter((t) => !VACIAS.has(t));
const iguales = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.some((x) => (t.length < 4 || x.length < 4 ? x === t : mismoToken(x, t))));

/** "TALLA" / "size" / "Talla " → "Talla"; "COLOR"/"colour" → "Color". */
function nombreGrupo(n: string): string {
  const k = norm(n);
  if (/^(talla|tallas|size|sizes|medida)$/.test(k)) return 'Talla';
  if (/^(color|colores|colour)$/.test(k)) return 'Color';
  const t = String(n || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Opción';
}
// Tallas en mayúscula (S, M, XL, 2XL, S/M, L-XL); lo demás con inicial mayúscula ("VERDE" → "Verde").
const esTalla = (t: string) => /^(\d*x{0,4}[sml]|\d+[a-z]?|unica)$/i.test(t);
const esTallaCompuesta = (t: string) => t.split(/\s*[/-]\s*/).every((x) => x && esTalla(x));
const bonito = (v: string) => { const t = String(v || '').trim(); return esTallaCompuesta(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); };

/**
 * Quita lo que dejó repetido una sincronización anterior:
 *  - grupos de opciones cuyos valores ya están en otro grupo ("Opción 2" con S, M, L
 *    cuando ya existe "Talla" con S, M, L);
 *  - variantes con la misma talla/color (se conserva la más antigua; el código de Dropi,
 *    el stock y los pedidos de la duplicada pasan a ella).
 * También limpia etiquetas con un valor repetido ("M · Negro · M" → "M · Negro").
 */
function repararDuplicados(productId: string, opciones: { nombre: string; valores: { valor: string; foto?: string }[] }[]): { opciones: typeof opciones; borradas: number; grupos: string[] } {
  const kv = (x: string) => [...new Set(tokensVariante(x))].sort().join(' ');
  const igualValor = (x: string, y: string) => norm(x) === norm(y) || (!!kv(x) && kv(x) === kv(y));
  const gruposQuitados: string[] = [];
  const quedan = opciones.filter((g, i) => {
    const vals = (g.valores || []).map((v) => v.valor);
    const otro = opciones.find((h, j) => j !== i && !gruposQuitados.includes(h.nombre) && vals.length > 0 && vals.every((v) => (h.valores || []).some((y) => igualValor(y.valor, v))));
    const generico = /^(opci[oó]n|opcion)\s*\d*$|\s\d+$/i.test(g.nombre.trim());
    if (otro && (generico || opciones.indexOf(otro) < i)) { gruposQuitados.push(g.nombre); return false; }
    return true;
  });
  const vs = db.prepare("SELECT id, label, stock, COALESCE(refs,'{}') refs, orden FROM variants WHERE product_id = ? ORDER BY orden, rowid").all(productId) as { id: string; label: string; stock: number; refs: string; orden: number }[];
  const limpiarLabel = (l: string) => { const vistas: string[] = []; return l.split(/\s*·\s*/).filter((x) => { const k = norm(x); if (!k || vistas.includes(k)) return false; vistas.push(k); return true; }).join(' · '); };
  const porClave = new Map<string, typeof vs[number]>();
  let borradas = 0;
  db.transaction(() => {
    for (const v of vs) {
      const lab = limpiarLabel(v.label);
      if (lab !== v.label) db.prepare('UPDATE variants SET label = ? WHERE id = ?').run(lab, v.id);
      const k = [...new Set(tokensVariante(lab))].sort().join(' ');
      const base = porClave.get(k);
      if (!k || !base) { porClave.set(k, v); continue; }
      const refsBase = pj<Record<string, string>>(base.refs, {}); const refsDup = pj<Record<string, string>>(v.refs, {});
      const juntos = { ...refsDup, ...Object.fromEntries(Object.entries(refsBase).filter(([, x]) => x)) };
      db.prepare('UPDATE variants SET refs = ?, sku = COALESCE(NULLIF(sku,\'\'), ?), stock = MAX(stock, ?) WHERE id = ?').run(JSON.stringify(juntos), String(juntos.dropi || ''), Number(v.stock) || 0, base.id);
      base.refs = JSON.stringify(juntos);
      db.prepare('UPDATE order_items SET variant_id = ? WHERE variant_id = ?').run(base.id, v.id);
      db.prepare('DELETE FROM variants WHERE id = ?').run(v.id);
      borradas++;
    }
    if (gruposQuitados.length) db.prepare('UPDATE products SET opciones = ? WHERE id = ?').run(JSON.stringify(quedan), productId);
  })();
  return { opciones: quedan, borradas, grupos: gruposQuitados };
}

export interface ResultadoSyncDropi { tipo: 'SIMPLE' | 'VARIABLE'; nombreDropi: string; vinculadas: number; creadas: number; conStock: number; sinDropi: string[]; total: number; renombradas?: number; repetidas?: string[]; sinVariante?: string[]; duplicadasQuitadas?: number; gruposQuitados?: string[] }

export async function sincronizarProductoDropi(storeId: string, productId: string, dropiIdBody?: string, silencioso = false): Promise<ResultadoSyncDropi | { error: string }> {
  const cred = credDropi(storeId);
  if (!cred) return { error: 'Conecta Dropi en Integraciones primero.' };
  const p = db.prepare('SELECT id, nombre, sku, opciones, despacho_proveedor FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as { id: string; nombre: string; sku: string; opciones: string; despacho_proveedor: string } | undefined;
  if (!p) return { error: 'Producto no encontrado.' };
  const dropiId = String(dropiIdBody || p.sku || '').replace(/\D/g, '');
  if (!dropiId) return { error: 'Escribe el ID del producto en Dropi (el número que sale en Dropi en el detalle del producto).' };
  const dp = await productoDropi(cred, dropiId);
  if ('error' in dp) return dp;

  // El producto queda vinculado a Dropi (SKU del producto = ID en Dropi).
  db.prepare("UPDATE products SET sku = ?, despacho_proveedor = CASE WHEN COALESCE(despacho_proveedor,'') = '' THEN 'dropi' ELSE despacho_proveedor END WHERE id = ?").run(dropiId, productId);
  if (dp.tipo === 'SIMPLE' || !dp.variaciones.length) {
    return { tipo: 'SIMPLE', nombreDropi: dp.name, vinculadas: 0, creadas: 0, conStock: 0, sinDropi: [], total: 0 };
  }

  type Grupo = { nombre: string; valores: { valor: string; foto?: string }[] };
  let opciones = pj<Grupo[]>(p.opciones, []);
  const igualValor = (x: string, y: string) => norm(x) === norm(y) || iguales([...new Set(tokens(x))], [...new Set(tokens(y))]);

  // 0) Reparación: una sincronización anterior pudo crear un grupo repetido ("Opción 2" con
  //    las mismas tallas) y variantes duplicadas. Se quitan sin perder vínculos ni pedidos.
  const reparadas = repararDuplicados(productId, opciones);
  opciones = reparadas.opciones;

  // Cada valor de Dropi va al grupo del producto que YA lo tiene (Talla, Color…), sin
  // importar cómo llame Dropi al atributo. Solo si no está en ninguno se usa el nombre
  // del atributo o se deduce (talla/color).
  const asignar = (v: DropiVariacion): { grupo: string; valor: string }[] => {
    const valores = v.attrs.length ? v.attrs : [{ nombre: '', valor: v.atributos }];
    const out: { grupo: string; valor: string }[] = [];
    valores.forEach((a0, i) => {
      // "TALLA S" / "Color: Negro" sin nombre de atributo: el rótulo dice el grupo.
      const m = /^\s*(tallas?|size|colou?r(?:es)?)\s*[:\-]?\s+(.+)$/i.exec(String(a0.valor || ''));
      const a = m && !a0.nombre.trim() ? { nombre: m[1], valor: m[2] } : a0;
      const val = bonito(a.valor);
      const libre = (g: string) => !out.some((o) => o.grupo === g);
      let g = opciones.find((gr) => libre(gr.nombre) && gr.valores.some((x) => igualValor(x.valor, val)))?.nombre
        || (a.nombre.trim() ? opciones.find((gr) => libre(gr.nombre) && nombreGrupo(gr.nombre) === nombreGrupo(a.nombre))?.nombre : undefined);
      if (!g) {
        const adivinado = a.nombre.trim() ? nombreGrupo(a.nombre) : esTallaCompuesta(val) ? 'Talla' : 'Color';
        g = opciones.find((gr) => libre(gr.nombre) && nombreGrupo(gr.nombre) === adivinado)?.nombre || (libre(adivinado) ? adivinado : opciones.find((gr) => libre(gr.nombre))?.nombre || `Opción ${i + 1}`);
      }
      out.push({ grupo: g, valor: val });
    });
    return out;
  };
  const ordenGrupos = opciones.map((g) => g.nombre);
  for (const v of dp.variaciones) for (const x of asignar(v)) if (!ordenGrupos.includes(x.grupo)) ordenGrupos.push(x.grupo);
  const etiquetaDe = (v: DropiVariacion) => {
    const gs = asignar(v);
    return ordenGrupos.filter((g) => gs.some((x) => x.grupo === g)).map((g) => gs.find((x) => x.grupo === g)!.valor).join(' · ') || bonito(v.atributos);
  };
  const etiquetas = new Map<number, string>();
  for (const v of dp.variaciones) etiquetas.set(v.id, etiquetaDe(v));
  const repetidas = (l: string) => dp.variaciones.filter((x) => etiquetas.get(x.id) === l).length > 1;
  const conRepetidas = [...new Set(etiquetas.values())].filter(repetidas);

  const existentes = db.prepare("SELECT id, label, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ? ORDER BY orden").all(productId) as { id: string; label: string; refs: string }[];
  const reales = existentes.filter((e) => norm(e.label) !== 'unica' && e.label.trim());
  // Con variantes ya armadas, sincronizar SOLO vincula: no crea variantes ni grupos nuevos.
  const soloVincular = reales.length > 0;
  const usadas = new Set<string>();
  let vinculadas = 0, creadas = 0, conStock = 0;
  const sinVariante: string[] = [];
  let orden = (db.prepare('SELECT COALESCE(MAX(orden),0) o FROM variants WHERE product_id = ?').get(productId) as { o: number }).o;
  const ponerRef = db.prepare("UPDATE variants SET refs = json_set(COALESCE(refs,'{}'), '$.dropi', ?), sku = ? WHERE id = ?");
  const ponerLabel = db.prepare('UPDATE variants SET label = ? WHERE id = ?');
  let renombradas = 0;
  const ponerStock = db.prepare('UPDATE variants SET stock = ? WHERE id = ?');
  const insertar = db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden, refs, sku) VALUES (?,?,?,?,0,?,?,?)');

  db.transaction(() => {
    for (const v of dp.variaciones) {
      const etiqueta = etiquetas.get(v.id)!;
      const tv = [...new Set(tokens(etiqueta))];
      // 1) Por vínculo ya guardado; 2) mismas palabras (cualquier orden); 3) la variante está contenida en lo de Dropi (única).
      let fila = existentes.find((e) => !usadas.has(e.id) && String(pj<Record<string, string>>(e.refs, {}).dropi || '') === String(v.id));
      if (!fila && tv.length) fila = existentes.find((e) => !usadas.has(e.id) && iguales([...new Set(tokens(e.label))], tv));
      if (!fila && tv.length) {
        const cands = reales.filter((e) => !usadas.has(e.id) && tokens(e.label).length && tokens(e.label).every((t) => tv.some((x) => igualValor(x, t))));
        if (cands.length === 1) fila = cands[0];
      }
      if (fila) {
        usadas.add(fila.id);
        ponerRef.run(String(v.id), String(v.id), fila.id);
        vinculadas++;
        // Variante con nombre incompleto ("S/M" cuando en Dropi es "S/M · Negro"): se completa.
        const te = [...new Set(tokens(fila.label))];
        if (tv.length > te.length && te.every((t) => tv.includes(t)) && !repetidas(etiqueta)) { ponerLabel.run(etiqueta, fila.id); renombradas++; }
        if (v.stock != null) { ponerStock.run(Math.max(0, Math.round(v.stock)), fila.id); conStock++; }
      } else if (soloVincular) {
        sinVariante.push(etiqueta);
      } else {
        orden += 1;
        insertar.run(uid(), productId, etiqueta, v.stock != null ? Math.max(0, Math.round(v.stock)) : 0, orden, JSON.stringify({ dropi: String(v.id) }), String(v.id));
        creadas++;
        if (v.stock != null) conStock++;
      }
    }

    // Opciones: con variantes ya armadas se respetan tal cual (solo se corrige "S/m" → "S/M");
    // en un producto nuevo se arman con los valores de Dropi.
    const grupos = new Map<string, Grupo>();
    for (const g of opciones) grupos.set(g.nombre, { nombre: g.nombre, valores: [...(g.valores || [])] });
    for (const v of dp.variaciones) for (const x of asignar(v)) {
      if (!grupos.has(x.grupo)) { if (soloVincular) continue; grupos.set(x.grupo, { nombre: x.grupo, valores: [] }); }
      const g = grupos.get(x.grupo)!;
      const igual = g.valores.find((y) => igualValor(y.valor, x.valor));
      if (!igual) { if (!soloVincular) g.valores.push({ valor: x.valor }); }
      else if (igual.valor !== x.valor && norm(igual.valor) === norm(x.valor)) igual.valor = x.valor;
    }
    const nuevas = ordenGrupos.filter((k) => grupos.has(k)).map((k) => grupos.get(k)!);
    db.prepare("UPDATE products SET opciones = ?, variantes_fuente = 'dropi' WHERE id = ?").run(JSON.stringify(nuevas), productId);
  })();

  const sinDropi = reales.filter((e) => !usadas.has(e.id)).map((e) => e.label);
  if (!silencioso || creadas || reparadas.borradas) registrarLog(storeId, 'info', 'dropi', `Producto "${p.nombre}" sincronizado con Dropi #${dropiId}: ${vinculadas} vinculadas, ${creadas} nuevas${sinDropi.length ? `, ${sinDropi.length} sin variación en Dropi` : ''}${sinVariante.length ? `, ${sinVariante.length} variaciones de Dropi sin variante en DealFlow` : ''}${reparadas.borradas ? `, ${reparadas.borradas} duplicadas quitadas` : ''}.`);
  if (conRepetidas.length) registrarLog(storeId, 'warn', 'dropi', `Producto "${p.nombre}": Dropi tiene variaciones que no se distinguen por sus atributos (${conRepetidas.slice(0, 5).join(', ')}). Muestra: ${JSON.stringify(dp.variaciones.slice(0, 2).map((v) => ({ id: v.id, nombre: v.nombre, attrs: v.attrs })))}`);
  return { tipo: 'VARIABLE', nombreDropi: dp.name, vinculadas, creadas, conStock, sinDropi, total: dp.variaciones.length, renombradas, repetidas: conRepetidas, sinVariante, duplicadasQuitadas: reparadas.borradas, gruposQuitados: reparadas.grupos };
}

/** Repaso periódico: re-sincroniza (stock y variaciones nuevas) los productos ya vinculados con Dropi. */
export function iniciarSyncDropi(): void {
  const vuelta = async () => {
    const prods = db.prepare("SELECT p.id, p.store_id FROM products p JOIN store_integrations s ON s.store_id = p.store_id AND s.tipo = 'dropi_api' WHERE p.variantes_fuente = 'dropi' AND p.sku != ''").all() as { id: string; store_id: string }[];
    for (const p of prods) {
      try { await sincronizarProductoDropi(p.store_id, p.id, undefined, true); } catch (e) { console.error('[dropi-sync]', e); }
      await new Promise((r) => setTimeout(r, 1500)); // sin ráfagas contra Dropi
    }
  };
  setTimeout(() => void vuelta(), 5 * 60_000);
  setInterval(() => void vuelta(), 6 * 3600_000);
}
