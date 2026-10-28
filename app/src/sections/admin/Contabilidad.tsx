import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { fmt } from '../../lib/format';
import { Dropdown } from '../../components/Dropdown';
import { confirmar, notificar, pedirTexto } from '../../components/dialogs';
import {
  apiContabilidad, apiContaMovimiento, apiContaCrear, apiContaEditar, apiContaAnular, apiContaEliminar, apiContaAdjuntar, apiContaQuitarAdjunto,
  type Contabilidad as DatosConta, type MovimientoConta,
} from '../../lib/api';

/*
 * Contabilidad de DealFlow: ingresos y egresos de la empresa (pagos de la pasarela que entran
 * solos + ventas offline, compras, gastos, pagos a socios, impuestos…) con sus comprobantes,
 * para el control interno y la contabilidad tributaria. Se exporta en CSV para el contador.
 */

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const lbl: CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn = (primario = false): CSSProperties => ({ background: primario ? 'var(--df-brand)' : 'var(--df-surface)', color: primario ? '#fff' : 'var(--df-text-body)', border: primario ? 'none' : '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' });

const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
function rangoDe(p: string): { desde: string; hasta: string } {
  const h = hoy(); const [y, m] = h.split('-').map(Number);
  const mes = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}`;
  const fin = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  if (p === 'mes') return { desde: `${mes(y, m)}-01`, hasta: h };
  if (p === 'mesPasado') { const yy = m === 1 ? y - 1 : y; const mm = m === 1 ? 12 : m - 1; return { desde: `${mes(yy, mm)}-01`, hasta: fin(yy, mm) }; }
  if (p === 'anio') return { desde: `${y}-01-01`, hasta: h };
  if (p === 'anioPasado') return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
  return { desde: '', hasta: '' };
}

const leerArchivo = (f: File) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mal(r.error); r.readAsDataURL(f); });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1] || ''} ${k.slice(0, 4)}`;

export function Contabilidad() {
  const [periodo, setPeriodo] = useState('mes');
  const [rango, setRango] = useState(rangoDe('mes'));
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [q, setQ] = useState('');
  const [anulados, setAnulados] = useState(false);
  const [d, setD] = useState<DatosConta | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<Partial<MovimientoConta> | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      void apiContabilidad({ ...rango, tipo, categoria, q, anulados: anulados ? '1' : '' }).then((r) => { if (r.data) { setD(r.data); setError(''); } else setError(r.error || 'No se pudo cargar.'); });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [rango, tipo, categoria, q, anulados, recarga]);

  const elegirPeriodo = (p: string) => { setPeriodo(p); if (p !== 'rango') setRango(rangoDe(p)); };
  const exportar = () => { window.location.href = `/api/admin/contabilidad/exportar?${new URLSearchParams({ ...rango, tipo, categoria, q, anulados: anulados ? '1' : '' })}`; };
  const nuevo = (t: 'ingreso' | 'egreso') => setEditando({ tipo: t, fecha: hoy(), categoria: '', valor: 0, iva: 0, retencion: 0, medio: 'Transferencia', archivos: [], origen: 'manual', estado: 'vigente' });
  const tiendaDe = useMemo(() => new Map((d?.tiendas || []).map((t) => [t.id, t.nombre])), [d]);
  const cats = d ? (tipo === 'egreso' ? d.categorias.egreso : tipo === 'ingreso' ? d.categorias.ingreso : [...d.categorias.ingreso, ...d.categorias.egreso]) : [];
  const r = d?.resumen;
  const maxCat = Math.max(1, ...(d?.porCategoria || []).map((c) => c.valor));

  return (
    <section data-screen-label="Admin Contabilidad">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Contabilidad</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>Ingresos y egresos de DealFlow con sus comprobantes. Los pagos de la pasarela entran solos; lo demás lo registras aquí.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => nuevo('ingreso')} style={{ ...btn(true), background: '#059669' }}>+ Ingreso</button>
          <button onClick={() => nuevo('egreso')} style={{ ...btn(true), background: '#DC2626' }}>+ Egreso</button>
          <button onClick={exportar} style={btn()}>⬇ Exportar para el contador</button>
        </div>
      </div>

      <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div style={{ minWidth: 150 }}><div style={lbl}>Periodo</div>
          <Dropdown value={periodo} onChange={elegirPeriodo} ariaLabel="Periodo" options={[{ value: 'mes', label: 'Este mes' }, { value: 'mesPasado', label: 'Mes pasado' }, { value: 'anio', label: 'Este año' }, { value: 'anioPasado', label: 'Año pasado' }, { value: 'todo', label: 'Todo' }, { value: 'rango', label: 'Rango…' }]} /></div>
        {periodo === 'rango' && <>
          <div><div style={lbl}>Desde</div><input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>Hasta</div><input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} style={inp} /></div>
        </>}
        <div style={{ minWidth: 140 }}><div style={lbl}>Tipo</div>
          <Dropdown value={tipo} onChange={(v) => { setTipo(v); setCategoria(''); }} ariaLabel="Tipo" options={[{ value: '', label: 'Todos' }, { value: 'ingreso', label: 'Ingresos' }, { value: 'egreso', label: 'Egresos' }]} /></div>
        <div style={{ minWidth: 200 }}><div style={lbl}>Categoría</div>
          <Dropdown value={categoria} onChange={setCategoria} ariaLabel="Categoría" buscar options={[{ value: '', label: 'Todas' }, ...cats.map((c) => ({ value: c, label: c }))]} /></div>
        <div style={{ flex: '1 1 200px' }}><div style={lbl}>Buscar</div><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Concepto, tercero, NIT, factura, referencia…" style={inp} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, paddingBottom: 9, cursor: 'pointer' }}><input type="checkbox" checked={anulados} onChange={(e) => setAnulados(e.target.checked)} /> Ver anulados</label>
      </div>

      {error && <div style={{ color: 'var(--df-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {r && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
          <Tarjeta titulo="Ingresos" valor={fmt(r.ingresos)} color="#059669" />
          <Tarjeta titulo="Egresos" valor={fmt(r.egresos)} color="#DC2626" />
          <Tarjeta titulo="Utilidad" valor={fmt(r.utilidad)} color={r.utilidad >= 0 ? '#059669' : '#DC2626'} sub="ingresos − egresos" />
          <Tarjeta titulo={r.ivaGenerado - r.ivaDescontable >= 0 ? "IVA por pagar" : "IVA a favor"} valor={fmt(Math.abs(r.ivaGenerado - r.ivaDescontable))} sub={`generado ${fmt(r.ivaGenerado)} · descontable ${fmt(r.ivaDescontable)}`} />
          <Tarjeta titulo="Retenciones" valor={fmt(r.retencionesPracticadas)} sub={`practicadas · te hicieron ${fmt(r.retencionesQueTeHicieron)}`} />
          <Tarjeta titulo="Sin comprobante" valor={String(r.sinComprobante)} color={r.sinComprobante ? '#D97706' : undefined} sub="movimientos manuales" />
        </div>
      )}

      {d && (d.porCategoria.length > 0 || d.porMes.length > 1) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Por categoría</div>
            {d.porCategoria.slice(0, 12).map((c) => (
              <div key={c.tipo + c.categoria} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{c.categoria} <span style={{ color: 'var(--df-text-faint)' }}>· {c.n}</span></span><b>{fmt(c.valor)}</b></div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--df-bg)', marginTop: 3 }}><div style={{ width: `${(c.valor / maxCat) * 100}%`, height: '100%', borderRadius: 4, background: c.tipo === 'ingreso' ? '#10B981' : '#F87171' }} /></div>
              </div>
            ))}
          </div>
          {d.porMes.length > 1 && (
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Por mes</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ color: 'var(--df-text-muted)', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: 4 }}>Mes</th><th style={{ padding: 4 }}>Ingresos</th><th style={{ padding: 4 }}>Egresos</th><th style={{ padding: 4 }}>Utilidad</th></tr></thead>
                <tbody>{d.porMes.slice().reverse().map((m) => (
                  <tr key={m.mes} style={{ textAlign: 'right', borderTop: '1px solid var(--df-border)' }}>
                    <td style={{ textAlign: 'left', padding: 4 }}>{nombreMes(m.mes)}</td><td style={{ padding: 4, color: '#059669' }}>{fmt(m.ingresos)}</td><td style={{ padding: 4, color: '#DC2626' }}>{fmt(m.egresos)}</td><td style={{ padding: 4, fontWeight: 700 }}>{fmt(m.ingresos - m.egresos)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {!d ? <div style={{ padding: 20, color: 'var(--df-text-muted)' }}>Cargando…</div>
          : !d.movimientos.length ? <div style={{ padding: 24, color: 'var(--df-text-muted)', textAlign: 'center' }}>No hay movimientos en este periodo. Registra uno con <b>+ Ingreso</b> o <b>+ Egreso</b>.</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--df-text-muted)', fontSize: 11.5, background: 'var(--df-bg)' }}>
                  <th style={th}>Fecha</th><th style={th}>Concepto</th><th style={th}>Categoría</th><th style={th}>Tercero</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={th}>Medio</th><th style={th}>📎</th>
                </tr></thead>
                <tbody>{d.movimientos.map((m) => (
                  <tr key={m.id} onClick={() => setEditando(m)} style={{ cursor: 'pointer', borderTop: '1px solid var(--df-border)', opacity: m.estado === 'anulado' ? 0.5 : 1 }}>
                    <td style={td}>{m.fecha}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700, textDecoration: m.estado === 'anulado' ? 'line-through' : undefined }}>{m.concepto}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>
                        {m.origen === 'wompi' && <span style={chip('#EDE9FE', '#6D28D9')}>Pasarela</span>}
                        {m.estado === 'anulado' && <span style={chip('#FEE2E2', '#B91C1C')}>Anulado</span>}
                        {m.documento && <> Doc. {m.documento}</>}{m.store_id && tiendaDe.get(m.store_id) ? ` · ${tiendaDe.get(m.store_id)}` : ''}
                      </div>
                    </td>
                    <td style={td}>{m.categoria}</td>
                    <td style={td}>{m.tercero || '—'}{m.tercero_doc && <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{m.tercero_doc}</div>}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: m.tipo === 'ingreso' ? '#059669' : '#DC2626', whiteSpace: 'nowrap' }}>{m.tipo === 'ingreso' ? '+' : '−'}{fmt(m.valor)}</td>
                    <td style={td}>{m.medio || '—'}</td>
                    <td style={td}>{m.archivos.length ? m.archivos.length : m.origen === 'manual' ? <span title="Sin comprobante" style={{ color: '#D97706' }}>!</span> : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </div>

      {editando && d && <EditorMovimiento m={editando} datos={d} onCerrar={() => setEditando(null)} onCambio={() => setRecarga((x) => x + 1)} />}
    </section>
  );
}

const th: CSSProperties = { padding: '9px 10px', fontWeight: 700 };
const td: CSSProperties = { padding: '9px 10px', verticalAlign: 'top' };
const chip = (bg: string, c: string): CSSProperties => ({ background: bg, color: c, borderRadius: 5, padding: '1px 6px', fontSize: 10.5, fontWeight: 800, marginRight: 5 });

function Tarjeta({ titulo, valor, sub, color }: { titulo: string; valor: string; sub?: string; color?: string }) {
  return (
    <div style={card}>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ color: 'var(--df-text-faint)', fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EditorMovimiento({ m, datos, onCerrar, onCambio }: { m: Partial<MovimientoConta>; datos: DatosConta; onCerrar: () => void; onCambio: () => void }) {
  const [f, setF] = useState<Partial<MovimientoConta>>(m);
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [archivos, setArchivos] = useState(m.archivos || []);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const nuevo = !m.id;
  const deWompi = m.origen === 'wompi';
  const set = (p: Partial<MovimientoConta>) => setF((x) => ({ ...x, ...p }));
  const cats = f.tipo === 'egreso' ? datos.categorias.egreso : datos.categorias.ingreso;
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;

  const subir = async (id: string, files: File[]) => {
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) { notificar(`${file.name} pesa más de 15 MB.`, 'error'); continue; }
      const r = await apiContaAdjuntar(id, await leerArchivo(file), file.name);
      if (r.error) notificar(`${file.name}: ${r.error}`, 'error');
    }
  };
  const guardar = async () => {
    setGuardando(true); setMsg('');
    const r = nuevo ? await apiContaCrear(f) : await apiContaEditar(m.id!, f);
    if (r.error) { setGuardando(false); setMsg(r.error); return; }
    const id = nuevo ? (r.data as { id: string }).id : m.id!;
    if (pendientes.length) await subir(id, pendientes);
    setGuardando(false);
    notificar(nuevo ? 'Movimiento registrado.' : 'Cambios guardados.');
    onCambio(); onCerrar();
  };
  const agregarArchivos = async (lista: FileList | null) => {
    const files = Array.from(lista || []);
    if (!files.length) return;
    if (nuevo) { setPendientes((x) => [...x, ...files]); return; }
    await subir(m.id!, files);
    onCambio();
    const r = await apiContaMovimiento(m.id!);
    if (r.data) setArchivos(r.data.movimiento.archivos);
  };
  const quitar = async (id: string) => {
    if (!(await confirmar({ mensaje: '¿Quitar este comprobante?', aceptar: 'Quitar', peligro: true }))) return;
    await apiContaQuitarAdjunto(id); setArchivos((x) => x.filter((a) => a.id !== id)); onCambio();
  };
  const anular = async () => {
    if (m.estado === 'anulado') { await apiContaAnular(m.id!, '', true); onCambio(); onCerrar(); return; }
    const motivo = await pedirTexto({ titulo: 'Anular movimiento', mensaje: 'Queda en el historial como anulado y no suma en los totales.', placeholder: 'Motivo (ej. registrado dos veces)', aceptar: 'Anular' });
    if (motivo === null) return;
    await apiContaAnular(m.id!, motivo); onCambio(); onCerrar();
  };
  const eliminar = async () => {
    if (!(await confirmar({ mensaje: 'Se elimina el movimiento y sus comprobantes. No se puede deshacer.', aceptar: 'Eliminar', peligro: true }))) return;
    const r = await apiContaEliminar(m.id!);
    if (r.error) { setMsg(r.error); return; }
    onCambio(); onCerrar();
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(2,6,23,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Movimiento" style={{ width: 'min(640px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--df-surface)', borderRadius: 16, padding: 20, boxShadow: '0 30px 70px -20px rgba(2,6,23,.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{nuevo ? (f.tipo === 'egreso' ? 'Nuevo egreso' : 'Nuevo ingreso') : f.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}{deWompi && <span style={{ ...chip('#EDE9FE', '#6D28D9'), marginLeft: 8 }}>Pasarela</span>}</div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ ...btn(), padding: '5px 10px' }}>✕</button>
        </div>
        {deWompi && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 12 }}>Pago aprobado por Wompi (ref. {m.referencia}). El valor y la fecha vienen de la pasarela; puedes completar los datos del tercero, el IVA y adjuntar la factura.</div>}
        {m.estado === 'anulado' && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)', marginBottom: 12 }}>Anulado{m.motivo_anulacion ? `: ${m.motivo_anulacion}` : ''}.</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {nuevo && <div><div style={lbl}>Tipo</div><Dropdown value={f.tipo || 'ingreso'} onChange={(v) => set({ tipo: v as 'ingreso' | 'egreso', categoria: '' })} ariaLabel="Tipo" options={[{ value: 'ingreso', label: 'Ingreso' }, { value: 'egreso', label: 'Egreso' }]} /></div>}
          <div><div style={lbl}>Fecha</div><input type="date" value={f.fecha || ''} disabled={deWompi} onChange={(e) => set({ fecha: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>Categoría</div><Dropdown value={f.categoria || ''} onChange={(v) => set({ categoria: v })} ariaLabel="Categoría" placeholder="Elige…" options={cats.map((c) => ({ value: c, label: c }))} /></div>
          <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Concepto</div><input value={f.concepto || ''} onChange={(e) => set({ concepto: e.target.value })} placeholder={f.tipo === 'egreso' ? 'Ej. Servidor Railway octubre' : 'Ej. Renta mensual Luna Accesorios (pago por transferencia)'} style={inp} /></div>
          <div><div style={lbl}>Valor total (COP)</div><input inputMode="numeric" value={f.valor ? Number(f.valor).toLocaleString('es-CO') : ''} disabled={deWompi} onChange={(e) => set({ valor: num(e.target.value) })} placeholder="0" style={inp} /></div>
          <div><div style={lbl}>IVA incluido</div><input inputMode="numeric" value={f.iva ? Number(f.iva).toLocaleString('es-CO') : ''} onChange={(e) => set({ iva: num(e.target.value) })} placeholder="0" style={inp} /></div>
          <div><div style={lbl}>Retención</div><input inputMode="numeric" value={f.retencion ? Number(f.retencion).toLocaleString('es-CO') : ''} onChange={(e) => set({ retencion: num(e.target.value) })} placeholder="0" style={inp} /></div>
          <div><div style={lbl}>Base (sin IVA)</div><div style={{ ...inp, background: 'var(--df-bg)' }}>{fmt(Math.max(0, (Number(f.valor) || 0) - (Number(f.iva) || 0)))}</div></div>
          <div><div style={lbl}>{f.tipo === 'egreso' ? 'Proveedor / beneficiario' : 'Cliente'}</div><input value={f.tercero || ''} onChange={(e) => set({ tercero: e.target.value })} placeholder="Nombre o razón social" style={inp} /></div>
          <div><div style={lbl}>NIT / CC</div><input value={f.tercero_doc || ''} onChange={(e) => set({ tercero_doc: e.target.value })} placeholder="900123456-7" style={inp} /></div>
          <div><div style={lbl}>Tienda relacionada (opcional)</div><Dropdown value={f.store_id || ''} onChange={(v) => set({ store_id: v })} ariaLabel="Tienda" buscar options={[{ value: '', label: 'Ninguna' }, ...datos.tiendas.map((t) => ({ value: t.id, label: t.nombre }))]} /></div>
          <div><div style={lbl}>Medio de pago</div><Dropdown value={f.medio || ''} onChange={(v) => set({ medio: v })} ariaLabel="Medio de pago" placeholder="Elige…" options={datos.medios.map((x) => ({ value: x, label: x }))} /></div>
          <div><div style={lbl}>N.º factura / comprobante</div><input value={f.documento || ''} onChange={(e) => set({ documento: e.target.value })} placeholder="FE-1024" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Notas</div><textarea value={f.notas || ''} onChange={(e) => set({ notas: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Comprobantes (factura, recibo, soporte de pago, XML de factura electrónica…)</div>
          {[...archivos.map((a) => ({ id: a.id, nombre: a.nombre, guardado: true })), ...pendientes.map((p, i) => ({ id: `p${i}`, nombre: p.name, guardado: false }))].map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--df-border)' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {a.nombre}{!a.guardado && <span style={{ color: 'var(--df-text-faint)' }}> · se sube al guardar</span>}</span>
              {a.guardado ? <>
                <a href={`/api/admin/contabilidad/adjuntos/${a.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>Ver</a>
                <a href={`/api/admin/contabilidad/adjuntos/${a.id}?descargar=1`} style={{ fontSize: 12.5, fontWeight: 700 }}>Descargar</a>
                <button onClick={() => void quitar(a.id)} style={{ background: 'none', border: 0, color: 'var(--df-danger)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Quitar</button>
              </> : <button onClick={() => setPendientes((x) => x.filter((_, i) => `p${i}` !== a.id))} style={{ background: 'none', border: 0, color: 'var(--df-danger)', cursor: 'pointer', fontSize: 12.5 }}>Quitar</button>}
            </div>
          ))}
          <label style={{ ...btn(), display: 'inline-block', marginTop: 8 }}>
            + Adjuntar comprobantes
            <input type="file" multiple accept=".pdf,image/*,.xml,.zip,.xlsx,.xls,.docx,.doc,.csv,.txt" style={{ display: 'none' }} onChange={(e) => { void agregarArchivos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>

        {msg && <div style={{ color: 'var(--df-danger)', fontSize: 13, marginTop: 10 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={() => void guardar()} disabled={guardando} style={{ ...btn(true), opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : nuevo ? 'Registrar' : 'Guardar cambios'}</button>
          {!nuevo && <button onClick={() => void anular()} style={btn()}>{m.estado === 'anulado' ? 'Restaurar' : 'Anular'}</button>}
          {!nuevo && !deWompi && <button onClick={() => void eliminar()} style={{ ...btn(), color: 'var(--df-danger)' }}>Eliminar</button>}
          <span style={{ flex: 1 }} />
          {!nuevo && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)', alignSelf: 'center' }}>Registrado por {m.creado_por || '—'}</span>}
        </div>
      </div>
    </div>
  );
}
