/**
 * Contabilidad de DealFlow (administración): ingresos y egresos de la empresa para el
 * control interno y lo tributario. Los pagos aprobados por la pasarela (Bold, Wompi o Shopify) se
 * registran solos como ingresos, en el momento en que se aprueban y con su comprobante en PDF; lo demás (ventas offline, compras, gastos, pagos a socios, impuestos…)
 * se registra a mano, con sus comprobantes adjuntos. Nada se borra en silencio: un
 * movimiento se anula (queda en el historial) y solo los manuales se pueden eliminar.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, db, uid } from './db.js';
import { cifradoActivo, cifrarArchivoSync, leerArchivoDescifrado } from './cifrado.js';

db.exec(`CREATE TABLE IF NOT EXISTS contabilidad_movimientos (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,                 -- ingreso | egreso
  categoria TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL,                -- YYYY-MM-DD
  concepto TEXT NOT NULL DEFAULT '',
  tercero TEXT NOT NULL DEFAULT '',
  tercero_doc TEXT NOT NULL DEFAULT '',
  store_id TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL DEFAULT 0,   -- total en COP
  base INTEGER NOT NULL DEFAULT 0,
  iva INTEGER NOT NULL DEFAULT 0,
  retencion INTEGER NOT NULL DEFAULT 0,
  medio TEXT NOT NULL DEFAULT '',
  documento TEXT NOT NULL DEFAULT '', -- número de factura, recibo o comprobante
  origen TEXT NOT NULL DEFAULT 'manual', -- manual | wompi | bold | shopify
  referencia TEXT NOT NULL DEFAULT '',
  notas TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'vigente', -- vigente | anulado
  motivo_anulacion TEXT NOT NULL DEFAULT '',
  creado_por TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_conta_fecha ON contabilidad_movimientos(fecha)');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_conta_ref ON contabilidad_movimientos(origen, referencia) WHERE referencia != ''");
db.exec(`CREATE TABLE IF NOT EXISTS contabilidad_adjuntos (
  id TEXT PRIMARY KEY,
  movimiento_id TEXT NOT NULL REFERENCES contabilidad_movimientos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  tamano INTEGER NOT NULL DEFAULT 0,
  subido_por TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const DIR = path.join(DATA_DIR, 'contabilidad');

export const CATEGORIAS = {
  ingreso: ['Instalación de plan', 'Renta mensual', 'Tienda en línea', 'Biblioteca', 'Créditos Marketing IA', 'Venta de servicio', 'Aporte de socios', 'Intereses y rendimientos', 'Otros ingresos'],
  egreso: ['Compras', 'Servidores e infraestructura', 'Software y suscripciones', 'Publicidad y marketing', 'Nómina', 'Honorarios y contratistas', 'Pago a socios / aliados', 'Comisiones de pasarela', 'Impuestos', 'Arriendo y servicios', 'Gastos bancarios', 'Otros gastos'],
} as const;
export const MEDIOS = ['Bold', 'Wompi', 'Shopify', 'Transferencia', 'Consignación', 'Efectivo', 'Nequi', 'Daviplata', 'Tarjeta', 'Otro'];

const CATEGORIA_PAGO: Record<string, string> = { inicial: 'Instalación de plan', renta: 'Renta mensual', tienda_online: 'Tienda en línea', biblioteca: 'Biblioteca', creditos: 'Créditos Marketing IA', landing: 'Tienda en línea' };

const MEDIO_PASARELA: Record<string, string> = { bold: 'Bold', wompi: 'Wompi', shopify: 'Shopify' };
const ORIGENES_PASARELA = ['wompi', 'bold', 'shopify'];
const cop = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
/** Fecha y hora de la base (UTC, «YYYY-MM-DD HH:MM:SS») en hora de Colombia. */
const horaCO = (utc: string) => { const t = Date.parse(utc.replace(' ', 'T') + (utc.includes('Z') ? '' : 'Z')); return Number.isNaN(t) ? '' : new Date(t - 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); };

/**
 * Registra en la contabilidad un pago aprobado de la pasarela (idempotente): el ingreso con su
 * categoría, la tienda, el medio real (Bold/Wompi/Shopify) y, como SOPORTE, el comprobante en PDF
 * y la respuesta de la pasarela con la que se confirmó el pago.
 */
export function registrarPagoEnContabilidad(referencia: string): boolean {
  const p = db.prepare(`SELECT p.*, s.nombre tienda, s.correo FROM pagos p LEFT JOIN stores s ON s.id = p.store_id WHERE p.referencia = ? AND p.estado = 'aprobado'`).get(referencia) as Record<string, string | number | null> | undefined;
  if (!p || !(Number(p.monto) > 0)) return false;
  const gateway = String(p.gateway || 'wompi');
  const origen = ORIGENES_PASARELA.includes(gateway) ? gateway : 'wompi';
  const ya = db.prepare(`SELECT id FROM contabilidad_movimientos WHERE referencia = ? AND origen IN (${ORIGENES_PASARELA.map(() => '?').join(',')})`).get(referencia, ...ORIGENES_PASARELA) as { id: string } | undefined;
  let movId = ya?.id;
  if (!movId) {
    const tipo = String(p.tipo || 'renta');
    const cat = CATEGORIA_PAGO[tipo] || 'Otros ingresos';
    const concepto = `${cat}${p.plan && (tipo === 'inicial' || tipo === 'renta') ? ` · plan ${p.plan}` : ''}`;
    const medio = MEDIO_PASARELA[gateway] || 'Otro';
    const notas = [p.transaccion ? `Transacción ${medio} ${p.transaccion}` : '', p.externo ? `Link de pago ${p.externo}` : '', p.cupon ? `Cupón ${p.cupon}` : ''].filter(Boolean).join(' · ');
    movId = uid();
    const fecha = horaCO(String(p.aprobado_at || p.created_at || '')).slice(0, 10) || horaCO(new Date().toISOString()).slice(0, 10);
    const r = db.prepare(`INSERT OR IGNORE INTO contabilidad_movimientos (id, tipo, categoria, fecha, concepto, tercero, tercero_doc, store_id, valor, base, medio, documento, origen, referencia, notas, creado_por)
      VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pasarela')`)
      .run(movId, cat, fecha, concepto, String(p.tienda || ''), String(p.correo || ''), String(p.store_id || ''), Number(p.monto) || 0, Number(p.monto) || 0, medio, String(p.transaccion || referencia), origen, referencia, notas);
    if (!r.changes) return false;
  }
  adjuntarSoportePago(movId, p);
  return true;
}

/** Comprobante PDF + respuesta de la pasarela, si el movimiento todavía no tiene soporte. */
function adjuntarSoportePago(movId: string, p: Record<string, string | number | null>): void {
  if ((db.prepare('SELECT COUNT(*) n FROM contabilidad_adjuntos WHERE movimiento_id = ?').get(movId) as { n: number }).n) return;
  const medio = MEDIO_PASARELA[String(p.gateway || 'wompi')] || 'Pasarela';
  const tipo = String(p.tipo || 'renta');
  const cat = CATEGORIA_PAGO[tipo] || 'Otros ingresos';
  const ajuste = db.prepare("SELECT despues FROM plan_ajustes WHERE referencia = ? AND tipo = 'pago' LIMIT 1").get(String(p.referencia)) as { despues: string } | undefined;
  const aprobado = String(p.aprobado_at || p.created_at || '');
  const lineas: [string, string][] = [
    ['Comprobante N.º', String(p.referencia)],
    ['Fecha del pago', aprobado ? `${horaCO(aprobado)} (hora de Colombia)` : '—'],
    ['Cliente (tienda)', String(p.tienda || '—')],
    ['Correo', String(p.correo || '—')],
    ['ID de la tienda', String(p.store_id || '')],
    ['Concepto', `${cat}${p.plan && (tipo === 'inicial' || tipo === 'renta') ? ` · plan ${p.plan}` : ''}`],
    ...(ajuste ? [['Servicio pagado hasta', ajuste.despues] as [string, string]] : []),
    ...(p.cupon ? [['Cupón aplicado', String(p.cupon)] as [string, string]] : []),
    ['Valor pagado', `${cop(Number(p.monto))} COP`],
    ['Medio de pago', medio],
    ['Transacción', String(p.transaccion || '—')],
    ...(p.externo ? [['Link de pago', String(p.externo)] as [string, string]] : []),
    ['Estado', 'APROBADO'],
  ];
  const pdf = pdfComprobante('DealFlow · Comprobante de pago recibido', lineas, [
    `Pago confirmado consultando directamente a ${medio}. Este comprobante es un soporte interno`,
    'del ingreso; no reemplaza la factura electrónica.',
  ]);
  adjuntar(movId, 'data:application/pdf;base64,' + pdf.toString('base64'), `Comprobante ${p.referencia}.pdf`, 'Pasarela');
  if (p.detalle) {
    let txt = String(p.detalle);
    try { txt = JSON.stringify(JSON.parse(txt), null, 2); } catch { /* tal cual */ }
    adjuntar(movId, 'data:text/plain;base64,' + Buffer.from(`Respuesta de ${medio} al confirmar el pago ${p.referencia}\n\n${txt}\n`).toString('base64'), `Respuesta ${medio} ${p.referencia}.txt`, 'Pasarela');
  }
}

/**
 * PDF de una página (sin librerías): título, pares «campo: valor» y una nota al pie.
 * Helvetica con WinAnsiEncoding (tildes y ñ en latin1).
 */
function pdfComprobante(titulo: string, campos: [string, string][], pie: string[]): Buffer {
  const esc = (t: string) => t.replace(/[^\x20-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const ops: string[] = [];
  const texto = (x: number, y: number, f: string, tam: number, t: string) => ops.push(`BT /${f} ${tam} Tf ${x} ${y} Td (${esc(t)}) Tj ET`);
  ops.push('0.09 0.64 0.29 rg 0 802 595 40 re f'); // franja de color arriba
  ops.push('1 1 1 rg'); texto(50, 816, 'F2', 15, titulo); ops.push('0 0 0 rg');
  let y = 760;
  for (const [k, v] of campos) {
    ops.push('0.4 0.45 0.5 rg'); texto(50, y, 'F1', 10, k); ops.push('0 0 0 rg');
    let resto = v;
    while (resto.length) { texto(200, y, k === 'Valor pagado' ? 'F2' : 'F1', k === 'Valor pagado' ? 13 : 11, resto.slice(0, 62)); resto = resto.slice(62); if (resto) y -= 15; }
    y -= 24;
  }
  ops.push(`0.85 0.87 0.9 RG 50 ${y + 6} m 545 ${y + 6} l S`);
  y -= 14;
  ops.push('0.4 0.45 0.5 rg');
  for (const l of pie) { texto(50, y, 'F1', 9, l); y -= 13; }
  texto(50, 40, 'F1', 8, `Generado automáticamente por DealFlow el ${horaCO(new Date().toISOString())} (hora de Colombia).`);
  const contenido = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offs: number[] = [];
  let pos = partes[0].length;
  const agregar = (b: Buffer) => { partes.push(b); pos += b.length; };
  objs.forEach((o, i) => { offs.push(pos); agregar(Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')); });
  offs.push(pos);
  agregar(Buffer.concat([Buffer.from(`6 0 obj\n<< /Length ${contenido.length} >>\nstream\n`, 'latin1'), contenido, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
  const xref = pos;
  agregar(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

/** Pasa a la contabilidad los pagos aprobados que aún no estén y completa el soporte que falte. */
export function sincronizarPagosPasarela(): number {
  // Pagos de Bold que quedaron marcados como Wompi (antes de esta versión).
  db.prepare("UPDATE contabilidad_movimientos SET origen = 'bold', medio = 'Bold' WHERE origen = 'wompi' AND referencia IN (SELECT referencia FROM pagos WHERE gateway = 'bold')").run();
  const refs = db.prepare(`SELECT p.referencia FROM pagos p WHERE p.estado = 'aprobado' AND p.monto > 0 AND (
      NOT EXISTS (SELECT 1 FROM contabilidad_movimientos m WHERE m.referencia = p.referencia AND m.origen IN ('wompi','bold','shopify'))
      OR EXISTS (SELECT 1 FROM contabilidad_movimientos m WHERE m.referencia = p.referencia AND m.origen IN ('wompi','bold','shopify')
                 AND NOT EXISTS (SELECT 1 FROM contabilidad_adjuntos x WHERE x.movimiento_id = m.id)))`).all() as { referencia: string }[];
  let n = 0;
  for (const r of refs) { try { if (registrarPagoEnContabilidad(r.referencia)) n++; } catch (e) { console.error('[contabilidad] pago', r.referencia, e); } }
  return n;
}

export interface Filtros { desde?: string; hasta?: string; tipo?: string; categoria?: string; q?: string; anulados?: boolean }

export function listarMovimientos(f: Filtros) {
  sincronizarPagosPasarela();
  const w: string[] = []; const a: unknown[] = [];
  if (f.desde) { w.push('m.fecha >= ?'); a.push(f.desde); }
  if (f.hasta) { w.push('m.fecha <= ?'); a.push(f.hasta); }
  if (f.tipo === 'ingreso' || f.tipo === 'egreso') { w.push('m.tipo = ?'); a.push(f.tipo); }
  if (f.categoria) { w.push('m.categoria = ?'); a.push(f.categoria); }
  if (!f.anulados) w.push("m.estado = 'vigente'");
  if (f.q) { w.push("(m.concepto LIKE ? OR m.tercero LIKE ? OR m.tercero_doc LIKE ? OR m.documento LIKE ? OR m.referencia LIKE ? OR m.notas LIKE ?)"); const q = `%${f.q}%`; a.push(q, q, q, q, q, q); }
  const movimientos = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM contabilidad_adjuntos x WHERE x.movimiento_id = m.id) adjuntos
    FROM contabilidad_movimientos m ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.fecha DESC, m.created_at DESC LIMIT 5000`).all(...a) as Record<string, unknown>[];
  const vig = movimientos.filter((m) => m.estado === 'vigente');
  const suma = (t: string, k: string) => vig.filter((m) => m.tipo === t).reduce((s, m) => s + (Number(m[k]) || 0), 0);
  const porCategoria: Record<string, { tipo: string; valor: number; n: number }> = {};
  for (const m of vig) { const k = `${m.tipo}|${m.categoria}`; porCategoria[k] ||= { tipo: String(m.tipo), valor: 0, n: 0 }; porCategoria[k].valor += Number(m.valor) || 0; porCategoria[k].n++; }
  const porMes: Record<string, { ingresos: number; egresos: number }> = {};
  for (const m of vig) { const k = String(m.fecha).slice(0, 7); porMes[k] ||= { ingresos: 0, egresos: 0 }; porMes[k][m.tipo === 'ingreso' ? 'ingresos' : 'egresos'] += Number(m.valor) || 0; }
  const adj = movimientos.length ? db.prepare(`SELECT id, movimiento_id, nombre, mime, tamano, created_at FROM contabilidad_adjuntos WHERE movimiento_id IN (${movimientos.map(() => '?').join(',')})`).all(...movimientos.map((m) => m.id)) as Record<string, unknown>[] : [];
  return {
    movimientos: movimientos.map((m) => ({ ...m, archivos: adj.filter((x) => x.movimiento_id === m.id) }) as Record<string, unknown> & { archivos: Record<string, unknown>[] }),
    resumen: {
      ingresos: suma('ingreso', 'valor'), egresos: suma('egreso', 'valor'),
      utilidad: suma('ingreso', 'valor') - suma('egreso', 'valor'),
      ivaGenerado: suma('ingreso', 'iva'), ivaDescontable: suma('egreso', 'iva'),
      retencionesPracticadas: suma('egreso', 'retencion'), retencionesQueTeHicieron: suma('ingreso', 'retencion'),
      sinComprobante: vig.filter((m) => m.origen === 'manual' && !Number(m.adjuntos)).length,
    },
    porCategoria: Object.entries(porCategoria).map(([k, v]) => ({ categoria: k.split('|')[1], ...v })).sort((x, y) => y.valor - x.valor),
    porMes: Object.entries(porMes).map(([mes, v]) => ({ mes, ...v })).sort((x, y) => x.mes.localeCompare(y.mes)),
  };
}

// Pesos sin decimales: "119.000", "$119,000" y 119000 valen lo mismo.
const ent = (v: unknown) => (typeof v === 'number' ? Math.max(0, Math.round(v)) : Number(String(v ?? '').replace(/\D/g, '')) || 0);
const tx = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n);

/** Valida y normaliza lo que llega del formulario. */
function datosMovimiento(b: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const tipo = b.tipo === 'egreso' ? 'egreso' : b.tipo === 'ingreso' ? 'ingreso' : '';
  if (!tipo) return { error: 'Elige si es un ingreso o un egreso.' };
  const fecha = tx(b.fecha, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Pon la fecha del movimiento.' };
  const valor = ent(b.valor);
  if (!valor) return { error: 'Pon el valor del movimiento.' };
  const concepto = tx(b.concepto, 200);
  if (!concepto) return { error: 'Escribe el concepto (qué fue).' };
  const iva = ent(b.iva); const retencion = ent(b.retencion);
  const base = b.base !== undefined && b.base !== '' ? ent(b.base) : Math.max(0, valor - iva);
  return {
    tipo, fecha, valor, concepto, iva, retencion, base,
    categoria: tx(b.categoria, 60) || (tipo === 'ingreso' ? 'Otros ingresos' : 'Otros gastos'),
    tercero: tx(b.tercero, 120), tercero_doc: tx(b.tercero_doc, 30), store_id: tx(b.store_id, 60),
    medio: tx(b.medio, 40), documento: tx(b.documento, 60), notas: tx(b.notas, 2000),
  };
}

export function obtenerMovimiento(id: string) {
  const m = db.prepare('SELECT * FROM contabilidad_movimientos WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!m) return null;
  return { ...m, archivos: db.prepare('SELECT id, movimiento_id, nombre, mime, tamano, created_at FROM contabilidad_adjuntos WHERE movimiento_id = ? ORDER BY created_at').all(id) };
}

export function crearMovimiento(b: Record<string, unknown>, quien: string): { id: string } | { error: string } {
  const d = datosMovimiento(b);
  if ('error' in d) return d as { error: string };
  const id = uid();
  db.prepare(`INSERT INTO contabilidad_movimientos (id, tipo, categoria, fecha, concepto, tercero, tercero_doc, store_id, valor, base, iva, retencion, medio, documento, notas, origen, creado_por)
    VALUES (@id, @tipo, @categoria, @fecha, @concepto, @tercero, @tercero_doc, @store_id, @valor, @base, @iva, @retencion, @medio, @documento, @notas, 'manual', @quien)`).run({ ...d, id, quien });
  return { id };
}

export function editarMovimiento(id: string, b: Record<string, unknown>): { ok: true } | { error: string } {
  const m = db.prepare('SELECT origen, tipo, valor, fecha FROM contabilidad_movimientos WHERE id = ?').get(id) as { origen: string; tipo: string; valor: number; fecha: string } | undefined;
  if (!m) return { error: 'Movimiento no encontrado.' };
  // De la pasarela no se cambian el tipo, el valor ni la fecha (vienen de Wompi).
  const d = datosMovimiento(m.origen === 'manual' ? b : { ...b, tipo: m.tipo, valor: m.valor, fecha: m.fecha });
  if ('error' in d) return d as { error: string };
  db.prepare(`UPDATE contabilidad_movimientos SET tipo=@tipo, categoria=@categoria, fecha=@fecha, concepto=@concepto, tercero=@tercero, tercero_doc=@tercero_doc, store_id=@store_id,
    valor=@valor, base=@base, iva=@iva, retencion=@retencion, medio=@medio, documento=@documento, notas=@notas, updated_at=datetime('now') WHERE id=@id`).run({ ...d, id });
  return { ok: true };
}

export function anularMovimiento(id: string, motivo: string, anular = true): { ok: true } | { error: string } {
  const r = db.prepare("UPDATE contabilidad_movimientos SET estado = ?, motivo_anulacion = ?, updated_at = datetime('now') WHERE id = ?").run(anular ? 'anulado' : 'vigente', anular ? tx(motivo, 300) : '', id);
  return r.changes ? { ok: true } : { error: 'Movimiento no encontrado.' };
}

export function eliminarMovimiento(id: string): { ok: true } | { error: string } {
  const m = db.prepare('SELECT origen FROM contabilidad_movimientos WHERE id = ?').get(id) as { origen: string } | undefined;
  if (!m) return { error: 'Movimiento no encontrado.' };
  if (m.origen !== 'manual') return { error: 'Los pagos de la pasarela no se eliminan: anúlalo si no corresponde.' };
  for (const a of db.prepare('SELECT id FROM contabilidad_adjuntos WHERE movimiento_id = ?').all(id) as { id: string }[]) try { unlinkSync(path.join(DIR, a.id)); } catch { /* ya no está */ }
  db.prepare('DELETE FROM contabilidad_movimientos WHERE id = ?').run(id);
  return { ok: true };
}

const TIPOS_ADJUNTO = /^(application\/pdf|image\/(png|jpe?g|webp|heic)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|msword|xml|zip)|text\/(xml|csv|plain))$/i;

/** Guarda un comprobante (data URL) del movimiento; queda cifrado si el servidor tiene llave. */
export function adjuntar(movimientoId: string, dataUrl: string, nombre: string, quien: string): { id: string } | { error: string } {
  if (!db.prepare('SELECT 1 FROM contabilidad_movimientos WHERE id = ?').get(movimientoId)) return { error: 'Movimiento no encontrado.' };
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m || !m[2]) return { error: 'El archivo no es válido.' };
  const mime = m[1].toLowerCase();
  if (!TIPOS_ADJUNTO.test(mime)) return { error: 'Sube el comprobante en PDF, imagen, Excel, Word, XML (factura electrónica) o ZIP.' };
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 15 * 1024 * 1024) return { error: 'El archivo pesa más de 15 MB.' };
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const id = uid();
  const ruta = path.join(DIR, id);
  writeFileSync(ruta, buf);
  if (cifradoActivo()) cifrarArchivoSync(ruta);
  db.prepare('INSERT INTO contabilidad_adjuntos (id, movimiento_id, nombre, mime, tamano, subido_por) VALUES (?,?,?,?,?,?)')
    .run(id, movimientoId, tx(nombre, 160).replace(/[\\/]/g, '-') || 'comprobante', mime, buf.length, quien);
  return { id };
}

export function leerAdjunto(id: string): { nombre: string; mime: string; datos: Buffer } | null {
  const a = db.prepare('SELECT nombre, mime FROM contabilidad_adjuntos WHERE id = ?').get(id) as { nombre: string; mime: string } | undefined;
  const ruta = path.join(DIR, id);
  if (!a || !existsSync(ruta)) return null;
  return { nombre: a.nombre, mime: a.mime, datos: leerArchivoDescifrado(ruta) };
}

export function quitarAdjunto(id: string): void {
  db.prepare('DELETE FROM contabilidad_adjuntos WHERE id = ?').run(id);
  try { unlinkSync(path.join(DIR, id)); } catch { /* ya no está */ }
}

/** CSV para el contador (separado por punto y coma, como lo abre Excel en español). */
export function exportarCsv(f: Filtros): string {
  const { movimientos } = listarMovimientos(f);
  const tiendas = new Map((db.prepare('SELECT id, nombre FROM stores').all() as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre]));
  const cab = ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Tercero', 'NIT/CC', 'Tienda', 'Base', 'IVA', 'Retención', 'Total', 'Medio de pago', 'Documento', 'Origen', 'Referencia', 'Estado', 'Comprobantes', 'Notas'];
  const filas = movimientos.map((m) => [m.fecha, m.tipo, m.categoria, m.concepto, m.tercero, m.tercero_doc, tiendas.get(String(m.store_id)) || '', m.base, m.iva, m.retencion, m.valor, m.medio, m.documento, m.origen === 'manual' ? 'Manual' : `Pasarela (${m.medio || m.origen})`, m.referencia, m.estado, (m.archivos as { nombre: string }[]).map((x) => x.nombre).join(' | '), m.notas]);
  return '﻿' + [cab, ...filas].map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
