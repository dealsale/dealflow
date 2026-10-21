/**
 * Papelera de tiendas (30 días) y copias automáticas diarias de la base.
 *
 * Papelera: antes de borrar una tienda se guarda en un archivo aparte
 * (DATA_DIR/papelera/<id>-<fecha>.db) EXACTAMENTE lo que el borrado en cascada se
 * va a llevar: se recorren las llaves foráneas con ON DELETE CASCADE desde
 * `stores` (usuarios, productos, variantes, pedidos, leads, mensajes…). Así el
 * resto del sistema no tiene que filtrar "tiendas borradas" en ningún lado: la
 * tienda sale de verdad, y restaurarla es volver a insertar esas filas. Lo que no
 * cuelga de una llave foránea (logs, cachés de Effi…) no se borra con la tienda,
 * así que sigue ahí al restaurar. A los 30 días el archivo se elimina.
 *
 * Copias: una vez al día, copia completa y consistente de la base
 * (DATA_DIR/respaldos/dealflow-AAAA-MM-DD.db); se guardan las últimas 3.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { db, DATA_DIR } from './db.js';
import { cifradoActivo, cifrarArchivo, cifrarArchivoSync, descifrarArchivo, descifrarArchivoSync, esArchivoCifrado } from './cifrado.js';

/** Si el archivo está cifrado, da una copia descifrada temporal (y cómo borrarla). */
function abrirPlano(ruta: string): { ruta: string; limpiar: () => void } {
  if (!esArchivoCifrado(ruta)) return { ruta, limpiar: () => {} };
  const tmp = path.join(tmpdir(), `dfpap-${randomBytes(6).toString('hex')}.db`);
  descifrarArchivoSync(ruta, tmp);
  return { ruta: tmp, limpiar: () => { try { unlinkSync(tmp); } catch { /* */ } } };
}

const DIR_PAPELERA = path.join(DATA_DIR, 'papelera');
const DIR_RESPALDOS = path.join(DATA_DIR, 'respaldos');
mkdirSync(DIR_PAPELERA, { recursive: true });
mkdirSync(DIR_RESPALDOS, { recursive: true });
export const DIAS_PAPELERA = 30;
const COPIAS = 3;

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

interface Nodo { tabla: string; cond: string }
/** Tablas que se borran en cascada con una tienda, en orden padre → hijo, con su condición SQL. */
function planCascada(): Nodo[] {
  const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
  const fks = new Map<string, { from: string; table: string; to: string }[]>();
  for (const t of tablas) {
    const lista = (db.prepare(`PRAGMA foreign_key_list(${q(t)})`).all() as { from: string; table: string; to: string; on_delete: string }[])
      .filter((f) => f.on_delete.toUpperCase() === 'CASCADE' && f.table !== t);
    if (lista.length) fks.set(t, lista);
  }
  const plan: Nodo[] = [{ tabla: 'stores', cond: 'id = @sid' }];
  const incluidas = new Map<string, string>([['stores', 'id = @sid']]);
  // Se agregan tablas cuando TODOS sus padres en cascada ya se evaluaron (orden topológico).
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const [t, lista] of fks) {
      if (incluidas.has(t)) continue;
      const padres = lista.filter((f) => incluidas.has(f.table));
      if (!padres.length) continue;
      if (lista.some((f) => !incluidas.has(f.table) && dependeDeStores(f.table, fks))) continue; // falta un padre que también cae
      const cond = padres.map((f) => `${q(f.from)} IN (SELECT ${q(f.to)} FROM main.${q(f.table)} WHERE ${incluidas.get(f.table)})`).join(' OR ');
      incluidas.set(t, cond);
      plan.push({ tabla: t, cond });
      cambio = true;
    }
  }
  return plan;
}
function dependeDeStores(t: string, fks: Map<string, { table: string }[]>, vistos = new Set<string>()): boolean {
  if (t === 'stores') return true;
  if (vistos.has(t)) return false;
  vistos.add(t);
  return (fks.get(t) || []).some((f) => dependeDeStores(f.table, fks, vistos));
}

const fecha = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export interface EnPapelera { archivo: string; storeId: string; nombre: string; correo: string; eliminadaAt: string; eliminadaPor: string; venceAt: string; pedidos: number; leads: number; productos: number; tamanoKb: number }

/** Guarda la tienda en la papelera y la borra. Devuelve el archivo creado. */
export function moverAPapelera(storeId: string, por: string): string {
  const s = db.prepare('SELECT nombre, correo FROM stores WHERE id = ?').get(storeId) as { nombre: string; correo: string } | undefined;
  if (!s) throw new Error('Tienda no encontrada');
  const archivo = `${storeId.replace(/[^a-zA-Z0-9-]/g, '')}-${fecha()}.db`;
  const ruta = path.join(DIR_PAPELERA, archivo);
  const plan = planCascada();
  db.prepare('ATTACH DATABASE ? AS pap').run(ruta);
  try {
    db.transaction(() => {
      for (const n of plan) db.prepare(`CREATE TABLE pap.${q(n.tabla)} AS SELECT * FROM main.${q(n.tabla)} WHERE ${n.cond}`).run({ sid: storeId });
      db.exec('CREATE TABLE pap._meta (clave TEXT PRIMARY KEY, valor TEXT)');
      const m = db.prepare('INSERT INTO pap._meta (clave, valor) VALUES (?, ?)');
      m.run('store_id', storeId); m.run('nombre', s.nombre); m.run('correo', s.correo);
      m.run('eliminada_at', new Date().toISOString()); m.run('eliminada_por', por);
      m.run('orden', JSON.stringify(plan.map((n) => n.tabla)));
      db.prepare('DELETE FROM main.stores WHERE id = ?').run(storeId); // la cascada hace el resto
    })();
  } catch (e) {
    try { db.exec('DETACH DATABASE pap'); } catch { /* */ }
    try { unlinkSync(ruta); } catch { /* */ }
    throw e;
  }
  db.exec('DETACH DATABASE pap');
  try { cifrarArchivoSync(ruta); } catch (e) { console.error('[papelera] no se pudo cifrar (queda sin cifrar):', e); }
  console.log(`[papelera] tienda ${s.nombre} (${storeId}) a la papelera por ${por}: ${archivo}`);
  return archivo;
}

const archivoValido = (a: string) => /^[a-zA-Z0-9-]+\.db$/.test(a) && existsSync(path.join(DIR_PAPELERA, a));

export function listarPapelera(): EnPapelera[] {
  const out: EnPapelera[] = [];
  for (const archivo of readdirSync(DIR_PAPELERA).filter((f) => f.endsWith('.db')).sort().reverse()) {
    let plano: ReturnType<typeof abrirPlano> | null = null;
    try {
      plano = abrirPlano(path.join(DIR_PAPELERA, archivo));
      const p = new Database(plano.ruta, { readonly: true, fileMustExist: true });
      const meta = Object.fromEntries((p.prepare('SELECT clave, valor FROM _meta').all() as { clave: string; valor: string }[]).map((r) => [r.clave, r.valor]));
      const n = (t: string) => { try { return (p.prepare(`SELECT COUNT(*) n FROM ${q(t)}`).get() as { n: number }).n; } catch { return 0; } };
      const vence = new Date(new Date(meta.eliminada_at).getTime() + DIAS_PAPELERA * 86400e3).toISOString();
      out.push({ archivo, storeId: meta.store_id, nombre: meta.nombre, correo: meta.correo, eliminadaAt: meta.eliminada_at, eliminadaPor: meta.eliminada_por || '', venceAt: vence, pedidos: n('orders'), leads: n('leads'), productos: n('products'), tamanoKb: Math.round(statSync(path.join(DIR_PAPELERA, archivo)).size / 1024) });
      p.close();
    } catch (e) { console.warn('[papelera] archivo ilegible', archivo, e); } finally { plano?.limpiar(); }
  }
  return out;
}

/** Vuelve a meter la tienda tal como estaba. Si ya existe una tienda con ese id, no hace nada. */
export function restaurarDePapelera(archivo: string): { ok: true; nombre: string; filas: number } | { error: string } {
  if (!archivoValido(archivo)) return { error: 'Archivo de papelera no encontrado.' };
  const ruta = path.join(DIR_PAPELERA, archivo);
  let plano: ReturnType<typeof abrirPlano>;
  try { plano = abrirPlano(ruta); } catch (e) { return { error: `No se pudo abrir el archivo: ${e instanceof Error ? e.message : e}` }; }
  db.prepare('ATTACH DATABASE ? AS pap').run(plano.ruta);
  try {
    const meta = Object.fromEntries((db.prepare('SELECT clave, valor FROM pap._meta').all() as { clave: string; valor: string }[]).map((r) => [r.clave, r.valor]));
    if (db.prepare('SELECT 1 FROM stores WHERE id = ?').get(meta.store_id)) { db.exec('DETACH DATABASE pap'); plano.limpiar(); return { error: 'Esa tienda ya existe (ya fue restaurada).' }; }
    const orden = JSON.parse(meta.orden || '[]') as string[];
    let filas = 0;
    db.transaction(() => {
      for (const t of orden) {
        // Columnas en común (la tabla actual pudo ganar columnas nuevas desde el borrado).
        const enPap = (db.prepare(`PRAGMA pap.table_info(${q(t)})`).all() as { name: string }[]).map((c) => c.name);
        const enMain = new Set((db.prepare(`PRAGMA main.table_info(${q(t)})`).all() as { name: string }[]).map((c) => c.name));
        const cols = enPap.filter((c) => enMain.has(c)).map(q).join(', ');
        if (!cols) continue;
        // OR IGNORE: si algo único ya se reutilizó (p. ej. el correo de un usuario), se salta esa fila.
        filas += db.prepare(`INSERT OR IGNORE INTO main.${q(t)} (${cols}) SELECT ${cols} FROM pap.${q(t)}`).run().changes;
      }
    })();
    db.exec('DETACH DATABASE pap');
    plano.limpiar();
    unlinkSync(ruta);
    console.log(`[papelera] tienda ${meta.nombre} restaurada (${filas} filas)`);
    return { ok: true, nombre: meta.nombre, filas };
  } catch (e) {
    try { db.exec('DETACH DATABASE pap'); } catch { /* */ }
    plano.limpiar();
    return { error: `No se pudo restaurar: ${e instanceof Error ? e.message : e}` };
  }
}

/** Borra de verdad los archivos de papelera con más de 30 días. */
function vaciarVencidos(): void {
  for (const t of listarPapelera()) {
    if (new Date(t.venceAt).getTime() < Date.now()) {
      try { unlinkSync(path.join(DIR_PAPELERA, t.archivo)); console.log(`[papelera] vencida y eliminada: ${t.nombre}`); } catch { /* */ }
    }
  }
}

// ── Copias diarias ─────────────────────────────────────────────────────────

export function listarRespaldos(): { archivo: string; tamanoMb: number; fecha: string; cifrado: boolean }[] {
  return readdirSync(DIR_RESPALDOS).filter((f) => /^dealflow-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse()
    .map((archivo) => { const r = path.join(DIR_RESPALDOS, archivo); const st = statSync(r); return { archivo, tamanoMb: Math.round(st.size / 1048576 * 10) / 10, fecha: st.mtime.toISOString(), cifrado: esArchivoCifrado(r) }; });
}
/** Para descargar: la copia descifrada (temporal si estaba cifrada) y cómo limpiarla. */
export async function prepararDescarga(archivo: string): Promise<{ ruta: string; limpiar: () => void } | null> {
  const r = rutaRespaldo(archivo);
  if (!r) return null;
  if (!esArchivoCifrado(r)) return { ruta: r, limpiar: () => {} };
  const tmp = path.join(tmpdir(), `dfresp-${randomBytes(6).toString('hex')}.db`);
  await descifrarArchivo(r, tmp);
  return { ruta: tmp, limpiar: () => { try { unlinkSync(tmp); } catch { /* */ } } };
}
export const rutaRespaldo = (archivo: string) => (/^dealflow-\d{4}-\d{2}-\d{2}\.db$/.test(archivo) && existsSync(path.join(DIR_RESPALDOS, archivo)) ? path.join(DIR_RESPALDOS, archivo) : null);

let copiando = false;
/** Hace la copia del día (si no existe) y deja solo las últimas 3. */
export async function copiaDiaria(): Promise<void> {
  if (copiando) return;
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // día de Colombia
  const destino = path.join(DIR_RESPALDOS, `dealflow-${hoy}.db`);
  if (existsSync(destino)) return;
  copiando = true;
  try {
    await db.backup(`${destino}.tmp`); // copia consistente aunque la base esté en uso
    const { renameSync } = await import('node:fs');
    if (cifradoActivo()) {
      // Se cifra la copia antes de dejarla con su nombre final; la versión sin cifrar se borra.
      await cifrarArchivo(`${destino}.tmp`, `${destino}.enc`);
      unlinkSync(`${destino}.tmp`);
      renameSync(`${destino}.enc`, destino);
    } else renameSync(`${destino}.tmp`, destino);
    for (const r of listarRespaldos().slice(COPIAS)) unlinkSync(path.join(DIR_RESPALDOS, r.archivo));
    console.log(`[respaldos] copia del ${hoy} lista`);
  } catch (e) {
    console.error('[respaldos] falló la copia diaria', e);
    try { unlinkSync(`${destino}.tmp`); } catch { /* */ }
    try { unlinkSync(`${destino}.enc`); } catch { /* */ }
  } finally { copiando = false; }
}

/** Cifra los archivos que quedaron sin cifrar (de antes de configurar la llave). */
async function cifrarPendientes(): Promise<void> {
  if (!cifradoActivo()) return;
  for (const f of readdirSync(DIR_PAPELERA).filter((x) => x.endsWith('.db'))) { try { cifrarArchivoSync(path.join(DIR_PAPELERA, f)); } catch (e) { console.error('[cifrado] papelera', f, e); } }
  for (const r of listarRespaldos().filter((x) => !x.cifrado)) {
    const ruta = path.join(DIR_RESPALDOS, r.archivo);
    try { await cifrarArchivo(ruta, `${ruta}.enc`); const { renameSync } = await import('node:fs'); renameSync(`${ruta}.enc`, ruta); } catch (e) { console.error('[cifrado] copia', r.archivo, e); try { unlinkSync(`${ruta}.enc`); } catch { /* */ } }
  }
}

export function iniciarRespaldos(): void {
  const tarea = () => { void cifrarPendientes().then(() => copiaDiaria()); try { vaciarVencidos(); } catch (e) { console.error('[papelera]', e); } };
  setTimeout(tarea, 2 * 60_000); // poco después de arrancar
  setInterval(tarea, 3 * 3600_000); // cada 3 h revisa si ya toca la del día
}
