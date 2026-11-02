import { db, uid, j, pj } from './db.js';
import { ID_V2, VERSION_V2, INSTRUCCIONES_V2, REGLAS_V2, ESTILO_V2, CAMPOS_ESTILO_V2 } from './plantillaEcommerceV2.js';

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number; // 0 = gratis
  features: string[];
  /** Versión del contenido (las tiendas con una versión vieja ven «Actualización disponible»). */
  version?: string;
  /** Plantillas a las que reemplaza: al instalar esta, aquellas dejan de figurar como instaladas. */
  reemplaza?: string[];
  nuevo?: boolean;
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: ID_V2,
    nombre: 'E-commerce V2 · Cierre profesional',
    descripcion: 'La versión mejorada del asistente de ventas: vende por etapas como un asesor experto, detecta cuándo el cliente está listo, maneja objeciones y cierra sin presionar. Se instala encima de lo que tienes y conserva tu información del negocio, tus preguntas frecuentes, tus productos y tus reglas propias.',
    precio: 0,
    version: VERSION_V2,
    reemplaza: ['ecommerce-v10'],
    nuevo: true,
    features: [
      'Método de venta por etapas: apertura, descubrimiento, recomendación, cierre y posventa',
      'Señales de compra y técnicas de cierre honestas',
      'Respuestas listas para «está caro», «lo voy a pensar», «¿es confiable?» y más',
      `${REGLAS_V2.length} reglas de venta y trato, sin reglas de un negocio en particular`,
      'Tono, saludo, despedida, temas prohibidos y pase a una persona ya configurados',
      'Se puede deshacer: vuelve a como estaba tu asistente con un clic',
    ],
  },
  {
    id: 'ecommerce-v10',
    nombre: 'Ecomerce v.10',
    descripcion: 'Deja tu asistente listo para vender ropa por WhatsApp en minutos: instrucciones y reglas de venta profesionales. Los productos los agregas tú desde la Biblioteca de productos (unos gratis, otros de pago único) o creando los tuyos.',
    precio: 0,
    features: [
      'Instrucciones del asistente listas para vender',
      'Todas las reglas de venta ya cargadas',
      'Tono y flujo de cierre profesional para ropa',
      'Luego importa productos desde la Biblioteca',
    ],
  },
];

const ECOMMERCE_INSTRUCCIONES = `Eres el asistente de ventas de una tienda de ropa que vende por WhatsApp en Colombia. Atiende con calidez, en tono cercano de "tú", con respuestas cortas y claras. Tu meta es ayudar al cliente a elegir y cerrar la venta sin presionar. Presenta el producto que le interesa, resuelve dudas de tallas, colores y envío, ofrece los combos cuando pidan 2 o más, y cuando el cliente confirme que quiere comprar, pídele nombre, ciudad y dirección para registrar el pedido. El envío es contra entrega (paga al recibir).`;

const ECOMMERCE_REGLAS = [
  'El envío es contra entrega por Dropi: el cliente paga cuando recibe el pedido.',
  'Antes de cerrar el pedido, confirma siempre talla, color, ciudad y dirección.',
  'Si el cliente pide 2 o más unidades, ofrece el combo correspondiente.',
  'No inventes productos, precios ni promociones que no estén en el catálogo.',
];

// Plantillas de asistente basadas en SERVICIOS (soporte, atención, reservas, educación).
// Contenido de fábrica: instrucciones + reglas + servicios de ejemplo.
/**
 * Tienda maestra desde la que se CONGELA (una sola vez) el contenido de la
 * plantilla. Se resuelve por la variable de entorno TEMPLATE_MASTER_STORE
 * (id, correo o nombre) y, por defecto, por la tienda llamada "Samy Store".
 */
function tiendaMaestraId(): string | undefined {
  const cfg = (process.env.TEMPLATE_MASTER_STORE || '').trim();
  if (cfg) {
    const r = db.prepare('SELECT id FROM stores WHERE id = ? OR correo = ? OR nombre = ? COLLATE NOCASE').get(cfg, cfg, cfg) as { id: string } | undefined;
    if (r) return r.id;
  }
  const r = db.prepare("SELECT id FROM stores WHERE nombre = 'Samy Store' COLLATE NOCASE ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  return r?.id;
}

interface Snapshot { source_store_id: string; instrucciones: string; reglas: string; productos: string; estilo?: string }
try { db.exec("ALTER TABLE templates_content ADD COLUMN estilo TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
const SNAP_COLS = 'source_store_id, instrucciones, reglas, productos, estilo';

/** ¿El snapshot congelado tiene contenido usable (al menos un producto o instrucciones)? */
function snapshotUtil(snap: Snapshot | undefined): snap is Snapshot {
  if (!snap) return false;
  const prods = pj<unknown[]>(snap.productos || '[]', []);
  return (Array.isArray(prods) && prods.length > 0) || (snap.instrucciones || '').trim().length > 0;
}

/**
 * CONGELA la versión actual de la tienda maestra dentro de la plantilla.
 * Guarda una copia (asistente + productos + variantes) que NO cambia después,
 * aunque la tienda maestra agregue productos o creativos nuevos.
 * Devuelve false si la maestra no tiene contenido.
 */
export function congelarPlantilla(templateId: string, masterId: string): boolean {
  const a = (db.prepare('SELECT instrucciones, reglas, estilo FROM assistants WHERE store_id = ?').get(masterId) as { instrucciones: string; reglas: string; estilo: string } | undefined) || { instrucciones: '', reglas: '[]', estilo: '' };
  const productos = (db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at').all(masterId) as Record<string, unknown>[]).map((row) => ({
    row,
    variants: db.prepare('SELECT label, stock, fotos, fotos_subidas, orden FROM variants WHERE product_id = ? ORDER BY orden').all(row.id as string),
  }));
  if (productos.length === 0 && !(a.instrucciones || '').trim()) return false;
  db.prepare(
    `INSERT INTO templates_content (template_id, source_store_id, instrucciones, reglas, productos, estilo, updated_at)
     VALUES (?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(template_id) DO UPDATE SET source_store_id = excluded.source_store_id, instrucciones = excluded.instrucciones,
       reglas = excluded.reglas, productos = excluded.productos, estilo = excluded.estilo, updated_at = datetime('now')`,
  ).run(templateId, masterId, a.instrucciones, a.reglas, j(productos), a.estilo || '');
  return true;
}

/**
 * Al arrancar el servidor: si la plantilla aún no está congelada y existe la
 * tienda maestra con contenido, congela AHORA la versión actual. A partir de
 * ese momento queda fija; los productos nuevos de la maestra no la afectan.
 */
export function congelarSiFalta() {
  for (const p of PLANTILLAS) {
    const snap = db.prepare(`SELECT ${SNAP_COLS} FROM templates_content WHERE template_id = ?`).get(p.id) as Snapshot | undefined;
    if (snapshotUtil(snap)) continue; // ya congelada
    const master = tiendaMaestraId();
    if (master) congelarPlantilla(p.id, master);
  }
}

/**
 * Aplica el snapshot congelado a la tienda destino. Instala SOLO el asistente
 * (instrucciones y reglas): las plantillas ya NO instalan productos. Los
 * productos se agregan después desde la Biblioteca de productos del admin.
 */
function aplicarSnapshot(snap: Snapshot, storeId: string, _plantillaId: string) {
  // Configuración del asistente (personalidad, forma de vender, saludo, prohibido,
  // pase a humano, preguntas frecuentes…). Lo propio de la tienda maestra (medios de
  // pago, horario, ubicación) NO se copia: se conserva lo que tenga la tienda.
  const actual = pj<Record<string, unknown>>((db.prepare('SELECT estilo FROM assistants WHERE store_id = ?').get(storeId) as { estilo: string } | undefined)?.estilo || '', {});
  const tpl = pj<Record<string, unknown>>(snap.estilo || '', {});
  const negTpl = (tpl.negocio || {}) as Record<string, string>;
  const negAct = (actual.negocio || {}) as Record<string, string>;
  const estilo = {
    ...actual,
    ...Object.fromEntries(Object.entries(tpl).filter(([k]) => k !== 'negocio')),
    negocio: { ...negAct, ...(negTpl.envios ? { envios: negTpl.envios } : {}), ...(negTpl.cambios ? { cambios: negTpl.cambios } : {}) },
  };
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas, estilo) VALUES (?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas, estilo = excluded.estilo`,
  ).run(storeId, snap.instrucciones, snap.reglas, j(estilo));
}

// ── Respaldo del asistente (para deshacer una instalación) y versión instalada ──
db.exec(`CREATE TABLE IF NOT EXISTS assistant_respaldos (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  instrucciones TEXT NOT NULL DEFAULT '',
  reglas TEXT NOT NULL DEFAULT '[]',
  estilo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_asist_respaldos ON assistant_respaldos(store_id, template_id, created_at)');
try { db.exec("ALTER TABLE installed_templates ADD COLUMN version TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
for (const col of ["instaladas TEXT NOT NULL DEFAULT '[]'", "gestion TEXT NOT NULL DEFAULT '{}'"]) {
  try { db.exec(`ALTER TABLE assistant_respaldos ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
// Espacio GESTIONADO por la plantilla, aparte de lo que escribe la tienda: el método de venta,
// las reglas de la plantilla y qué valores de estilo puso la plantilla. Al actualizarla solo
// cambia esto; las instrucciones, reglas e información del negocio de la tienda no se tocan.
for (const col of ["plantilla_id TEXT NOT NULL DEFAULT ''", "plantilla_version TEXT NOT NULL DEFAULT ''", "plantilla_metodo TEXT NOT NULL DEFAULT ''", "plantilla_reglas TEXT NOT NULL DEFAULT '[]'", "plantilla_estilo TEXT NOT NULL DEFAULT '{}'"]) {
  try { db.exec(`ALTER TABLE assistants ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
const COLS_GESTION = ['plantilla_id', 'plantilla_version', 'plantilla_metodo', 'plantilla_reglas', 'plantilla_estilo'] as const;
type FilaAsist = { instrucciones: string; reglas: string; estilo: string; plantilla_id: string; plantilla_version: string; plantilla_metodo: string; plantilla_reglas: string; plantilla_estilo: string };
const leerAsistente = (storeId: string) => db.prepare(`SELECT instrucciones, reglas, estilo, ${COLS_GESTION.join(', ')} FROM assistants WHERE store_id = ?`).get(storeId) as FilaAsist | undefined;
/** Quita la parte gestionada por plantilla (al instalar otra plantilla, desinstalar o volver atrás). */
function limpiarGestion(storeId: string): void {
  db.prepare("UPDATE assistants SET plantilla_id = '', plantilla_version = '', plantilla_metodo = '', plantilla_reglas = '[]', plantilla_estilo = '{}' WHERE store_id = ?").run(storeId);
}

function respaldarAsistente(storeId: string, templateId: string): void {
  const a = leerAsistente(storeId);
  const instaladas = db.prepare('SELECT template_id, version FROM installed_templates WHERE store_id = ?').all(storeId);
  const gestion = a ? Object.fromEntries(COLS_GESTION.map((c) => [c, a[c]])) : {};
  db.prepare('INSERT INTO assistant_respaldos (id, store_id, template_id, instrucciones, reglas, estilo, instaladas, gestion) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid(), storeId, templateId, a?.instrucciones || '', a?.reglas || '[]', a?.estilo || '', j(instaladas), j(gestion));
  // Se guardan los 5 más recientes por tienda y plantilla.
  db.prepare(`DELETE FROM assistant_respaldos WHERE store_id = ? AND template_id = ? AND id NOT IN (
    SELECT id FROM assistant_respaldos WHERE store_id = ? AND template_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 5)`).run(storeId, templateId, storeId, templateId);
}

/** Normaliza un texto para compararlo (sin mayúsculas, acentos, signos ni espacios de más). */
const normTxt = (r: string) => String(r || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const igualJSON = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Lo que vino de plantillas anteriores (v10 de fábrica y lo congelado de la tienda maestra). */
function contenidoDePlantillas(): { reglas: Set<string>; instrucciones: string[]; estilos: Record<string, unknown>[] } {
  const reglas = new Set<string>(ECOMMERCE_REGLAS.map(normTxt));
  const instrucciones = [ECOMMERCE_INSTRUCCIONES];
  const estilos: Record<string, unknown>[] = [];
  for (const sn of db.prepare('SELECT instrucciones, reglas, estilo FROM templates_content').all() as { instrucciones: string; reglas: string; estilo: string }[]) {
    for (const r of pj<string[]>(sn.reglas || '[]', [])) reglas.add(normTxt(r));
    if ((sn.instrucciones || '').trim()) instrucciones.push(sn.instrucciones);
    estilos.push(pj<Record<string, unknown>>(sn.estilo || '', {}));
  }
  return { reglas, instrucciones, estilos };
}

/** ¿Un campo de estilo está vacío (la tienda nunca lo configuró)? */
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/**
 * Instala o ACTUALIZA la V2 sin tocar lo de la tienda:
 * - método de venta y reglas de la V2 → espacio gestionado (plantilla_metodo / plantilla_reglas);
 * - instrucciones de la tienda: se quita SOLO el texto que vino de una plantilla anterior
 *   (si la tienda escribió algo propio, se conserva);
 * - reglas de la tienda: se quitan SOLO las que vinieron de una plantilla anterior, tal cual;
 * - estilo: cada campo se cambia solo si está vacío o si sigue con el valor que puso una
 *   plantilla (si la tienda lo cambió, se respeta). Información del negocio y preguntas
 *   frecuentes nunca se tocan.
 * Antes guarda un respaldo para poder deshacer.
 */
/** Qué haría la instalación de la V2, sin escribir nada (para mostrarlo antes de confirmar). */
export function previaV2(storeId: string): { reemplazar: string[]; conservar: string[]; quitaInstrucciones: boolean; respetado: string[] } {
  const a = leerAsistente(storeId);
  const prev = contenidoDePlantillas();
  const todas = pj<string[]>(a?.reglas || '[]', []).filter((r) => String(r || '').trim());
  const estilo = pj<Record<string, unknown>>(a?.estilo || '', {});
  const puestoAntes = pj<Record<string, unknown>>(a?.plantilla_estilo || '{}', {});
  const instr = a?.instrucciones || '';
  return {
    reemplazar: todas.filter((r) => prev.reglas.has(normTxt(r))),
    conservar: todas.filter((r) => !prev.reglas.has(normTxt(r))),
    quitaInstrucciones: prev.instrucciones.some((t) => normTxt(instr) === normTxt(t) || (t.trim().length > 200 && instr.includes(t.trim()))),
    respetado: CAMPOS_ESTILO_V2.filter((k) => {
      const cur = estilo[k]; const nuevo = (ESTILO_V2 as Record<string, unknown>)[k];
      const dePlantilla = (k in puestoAntes && igualJSON(cur, puestoAntes[k])) || prev.estilos.some((e) => k in e && igualJSON(cur, e[k]));
      return !(vacio(cur) || dePlantilla || igualJSON(cur, nuevo));
    }),
  };
}

function instalarV2(storeId: string, conservarDePlantilla: string[] = []): { reglasConservadas: number; reglasQuitadas: number; estiloRespetado: string[] } {
  respaldarAsistente(storeId, ID_V2);
  db.prepare("INSERT OR IGNORE INTO assistants (store_id, instrucciones, reglas) VALUES (?, '', '[]')").run(storeId);
  const a = leerAsistente(storeId)!;
  const prev = contenidoDePlantillas();

  // Reglas: fuera las que vinieron de una plantilla (salvo las que la tienda eligió conservar);
  // las propias se quedan.
  const guardar = new Set(conservarDePlantilla.map(normTxt));
  const todas = pj<string[]>(a.reglas || '[]', []).filter((r) => String(r || '').trim());
  const propias = todas.filter((r) => !prev.reglas.has(normTxt(r)) || guardar.has(normTxt(r)));

  // Instrucciones: se quita el texto de una plantilla anterior (completo o contenido dentro).
  let instr = a.instrucciones || '';
  for (const t of prev.instrucciones) {
    if (normTxt(instr) === normTxt(t)) { instr = ''; break; }
    if (t.trim().length > 200 && instr.includes(t.trim())) instr = instr.replace(t.trim(), '').trim();
  }

  // Estilo: solo los campos vacíos o que siguen como los dejó una plantilla.
  const estilo = pj<Record<string, unknown>>(a.estilo || '', {});
  const puestoAntes = pj<Record<string, unknown>>(a.plantilla_estilo || '{}', {});
  const aplicado: Record<string, unknown> = {};
  const respetado: string[] = [];
  for (const k of CAMPOS_ESTILO_V2) {
    const nuevo = (ESTILO_V2 as Record<string, unknown>)[k];
    const cur = estilo[k];
    const dePlantilla = (k in puestoAntes && igualJSON(cur, puestoAntes[k])) || prev.estilos.some((e) => k in e && igualJSON(cur, e[k]));
    if (vacio(cur) || dePlantilla || igualJSON(cur, nuevo)) { estilo[k] = nuevo; aplicado[k] = nuevo; }
    else respetado.push(k);
  }

  db.prepare(`UPDATE assistants SET instrucciones = ?, reglas = ?, estilo = ?, plantilla_id = ?, plantilla_version = ?, plantilla_metodo = ?, plantilla_reglas = ?, plantilla_estilo = ? WHERE store_id = ?`)
    .run(instr, j(propias), j(estilo), ID_V2, VERSION_V2, INSTRUCCIONES_V2, j(REGLAS_V2), j(aplicado), storeId);
  return { reglasConservadas: propias.length, reglasQuitadas: todas.length - propias.length, estiloRespetado: respetado };
}

/** Desinstala la V2: quita solo lo suyo (método, reglas y el estilo que sigue como lo dejó). */
function desinstalarV2(storeId: string): void {
  const a = leerAsistente(storeId);
  if (a) {
    const estilo = pj<Record<string, unknown>>(a.estilo || '', {});
    for (const [k, v] of Object.entries(pj<Record<string, unknown>>(a.plantilla_estilo || '{}', {}))) if (igualJSON(estilo[k], v)) delete estilo[k];
    db.prepare('UPDATE assistants SET estilo = ? WHERE store_id = ?').run(j(estilo), storeId);
  }
  limpiarGestion(storeId);
}

/** Deshace la última instalación: deja el asistente exactamente como estaba antes. */
export function restaurarPlantilla(storeId: string, plantillaId: string): { ok?: boolean; error?: string } {
  const r = db.prepare('SELECT id, instrucciones, reglas, estilo, instaladas, gestion FROM assistant_respaldos WHERE store_id = ? AND template_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get(storeId, plantillaId) as { id: string; instrucciones: string; reglas: string; estilo: string; instaladas: string; gestion: string } | undefined;
  if (!r) return { error: 'No hay una versión anterior guardada para volver.' };
  const g = pj<Partial<FilaAsist>>(r.gestion || '{}', {});
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas, estilo) VALUES (?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas, estilo = excluded.estilo`,
  ).run(storeId, r.instrucciones, r.reglas, r.estilo);
  db.prepare('UPDATE assistants SET plantilla_id = ?, plantilla_version = ?, plantilla_metodo = ?, plantilla_reglas = ?, plantilla_estilo = ? WHERE store_id = ?')
    .run(g.plantilla_id || '', g.plantilla_version || '', g.plantilla_metodo || '', g.plantilla_reglas || '[]', g.plantilla_estilo || '{}', storeId);
  db.prepare('DELETE FROM assistant_respaldos WHERE id = ?').run(r.id);
  // Vuelven a figurar instaladas las plantillas que había antes.
  db.prepare('DELETE FROM installed_templates WHERE store_id = ?').run(storeId);
  for (const t of pj<{ template_id: string; version: string }[]>(r.instaladas || '[]', [])) {
    db.prepare('INSERT OR IGNORE INTO installed_templates (store_id, template_id, version) VALUES (?,?,?)').run(storeId, t.template_id, t.version || '');
  }
  return { ok: true };
}

/** Lo gestionado por plantilla, para el prompt del asistente y la pantalla del Asistente. */
export function gestionPlantilla(storeId: string): { id: string; nombre: string; version: string; metodo: string; reglas: string[] } | null {
  const a = db.prepare('SELECT plantilla_id, plantilla_version, plantilla_metodo, plantilla_reglas FROM assistants WHERE store_id = ?').get(storeId) as Pick<FilaAsist, 'plantilla_id' | 'plantilla_version' | 'plantilla_metodo' | 'plantilla_reglas'> | undefined;
  if (!a?.plantilla_id) return null;
  return { id: a.plantilla_id, nombre: PLANTILLAS.find((p) => p.id === a.plantilla_id)?.nombre || a.plantilla_id, version: a.plantilla_version, metodo: a.plantilla_metodo, reglas: pj<string[]>(a.plantilla_reglas || '[]', []) };
}

/** Instala una plantilla en la tienda: deja el asistente y los productos listos. */
export function instalarPlantilla(storeId: string, plantillaId: string, force = false, conservar: string[] = []): { ok?: boolean; error?: string; yaInstalada?: boolean; reglasConservadas?: number; reglasQuitadas?: number; estiloRespetado?: string[] } {
  const p = PLANTILLAS.find((x) => x.id === plantillaId);
  if (!p) return { error: 'Plantilla no encontrada.' };
  const ya = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (ya && !force) return { yaInstalada: true, error: 'Esta plantilla ya está instalada en tu tienda.' };

  if (plantillaId === ID_V2) {
    const det = instalarV2(storeId, conservar);
    marcarInstalada(storeId, p);
    return { ok: true, ...det };
  }

  // Contenido CONGELADO de la plantilla (no cambia aunque la tienda maestra agregue productos después).
  let snap = db.prepare(`SELECT ${SNAP_COLS} FROM templates_content WHERE template_id = ?`).get(plantillaId) as Snapshot | undefined;
  // Se instala la versión ACTUAL del asistente de la tienda maestra (lo último que
  // configuraste ahí: reglas, prohibido, pase a humano…). Si no hay maestra, la congelada.
  {
    const master = tiendaMaestraId();
    if (master && master !== storeId && congelarPlantilla(plantillaId, master)) {
      snap = db.prepare(`SELECT ${SNAP_COLS} FROM templates_content WHERE template_id = ?`).get(plantillaId) as Snapshot | undefined;
    }
  }

  respaldarAsistente(storeId, plantillaId);
  limpiarGestion(storeId); // otra plantilla manda ahora
  if (snapshotUtil(snap)) {
    aplicarSnapshot(snap, storeId, plantillaId);
  } else if (plantillaId === 'ecommerce-v10') {
    // Respaldo de fábrica si no hay tienda maestra con contenido: solo el
    // asistente (instrucciones + reglas). Los productos van por la Biblioteca.
    db.prepare(
      `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
    ).run(storeId, ECOMMERCE_INSTRUCCIONES, j(ECOMMERCE_REGLAS));
  }

  marcarInstalada(storeId, p);
  return { ok: true };
}

/** Marca la plantilla como instalada (con su versión). Las demás plantillas de asistente dejan de figurar: una sola manda. */
function marcarInstalada(storeId: string, p: Plantilla): void {
  const otras = PLANTILLAS.filter((x) => x.id !== p.id).map((x) => x.id);
  if (otras.length) db.prepare(`DELETE FROM installed_templates WHERE store_id = ? AND template_id IN (${otras.map(() => '?').join(',')})`).run(storeId, ...otras);
  db.prepare(`INSERT INTO installed_templates (store_id, template_id, version) VALUES (?,?,?)
    ON CONFLICT(store_id, template_id) DO UPDATE SET version = excluded.version, created_at = datetime('now')`).run(storeId, p.id, p.version || '');
}

/**
 * Desinstala una plantilla. Si borrarDatos=true, elimina los productos/servicios
 * que trajo esa plantilla y limpia el asistente. Si false, solo limpia el
 * asistente (instrucciones, reglas y prompt) y conserva los productos.
 */
export function desinstalarPlantilla(storeId: string, plantillaId: string, borrarDatos: boolean): { ok?: boolean; error?: string; borrados?: number } {
  const inst = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (!inst) return { error: 'Esa plantilla no está instalada.' };
  if (plantillaId === ID_V2) {
    // La V2 no trae productos ni toca lo de la tienda: se quita solo lo suyo.
    desinstalarV2(storeId);
    db.prepare('DELETE FROM installed_templates WHERE store_id = ? AND template_id = ?').run(storeId, plantillaId);
    return { ok: true, borrados: 0 };
  }
  let borrados = 0;
  if (borrarDatos) {
    const r = db.prepare('DELETE FROM products WHERE store_id = ? AND plantilla_id = ?').run(storeId, plantillaId);
    borrados = r.changes;
  }
  // Limpia el asistente (instrucciones, reglas y prompt principal) en ambos casos.
  db.prepare("UPDATE assistants SET instrucciones = '', reglas = '[]' WHERE store_id = ?").run(storeId);
  db.prepare('DELETE FROM installed_templates WHERE store_id = ? AND template_id = ?').run(storeId, plantillaId);
  return { ok: true, borrados };
}

/** Lista las plantillas con su estado (instalada o no) para la tienda. */
export function listarPlantillas(storeId: string) {
  const inst = new Map(
    (db.prepare('SELECT template_id, version FROM installed_templates WHERE store_id = ?').all(storeId) as { template_id: string; version: string }[]).map((r) => [r.template_id, r.version]),
  );
  const respaldos = new Set((db.prepare('SELECT DISTINCT template_id FROM assistant_respaldos WHERE store_id = ?').all(storeId) as { template_id: string }[]).map((r) => r.template_id));
  return PLANTILLAS.map((p) => ({
    ...p,
    instalada: inst.has(p.id),
    // Instalada con una versión anterior: se ofrece actualizar.
    actualizacion: inst.has(p.id) && !!p.version && inst.get(p.id) !== p.version,
    // Tiene instalada una plantilla que esta reemplaza: se ofrece «Actualizar a esta».
    mejoraDe: (p.reemplaza || []).find((id) => inst.has(id)) || null,
    puedeDeshacer: respaldos.has(p.id),
    detalle: p.id === ID_V2 ? { instrucciones: INSTRUCCIONES_V2, reglas: REGLAS_V2, estilo: ESTILO_V2 } : null,
  }));
}
