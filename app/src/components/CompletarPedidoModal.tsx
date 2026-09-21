import { useEffect, useMemo, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { fmt } from '../lib/format';

interface ItemFila { qty: number; nombre: string; precio: number }

/**
 * Revisa y COMPLETA un pedido existente con los datos leídos del chat (IA + el
 * resumen). El dueño confirma/corrige antes de guardar; nunca escribe sin revisión.
 */
export function CompletarPedidoModal({ df }: { df: DealFlowState }) {
  const abierto = df.completarAbierto;
  const datos = df.completarDatos;
  const orden = datos?.ordenExistente || null;
  const [cliente, setCliente] = useState('');
  const [tel, setTel] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [nota, setNota] = useState('');
  const [envio, setEnvio] = useState('');
  const [totalManual, setTotalManual] = useState('');
  const [filas, setFilas] = useState<ItemFila[]>([]);

  // Cuando llega la propuesta del backend, precargamos los campos.
  useEffect(() => {
    const p = datos?.propuesta;
    if (!p) { return; }
    setCliente(p.cliente || '');
    setTel(p.tel || '');
    setDepartamento(p.departamento || '');
    setCiudad(p.ciudad || '');
    setDireccion(p.direccion || '');
    setNota('');
    setEnvio('');
    setTotalManual(p.total ? String(p.total) : '');
    setFilas(p.items?.length ? p.items.map((it) => ({ qty: it.qty, nombre: it.nombre, precio: it.precio })) : [{ qty: 1, nombre: '', precio: 0 }]);
  }, [datos]);

  const totalItems = useMemo(() => filas.reduce((a, f) => a + Math.max(1, f.qty) * Math.max(0, f.precio), 0), [filas]);
  const envioNum = Math.max(0, parseInt(envio.replace(/[^0-9]/g, ''), 10) || 0);
  const totalNum = totalManual.trim() ? Math.max(0, parseInt(totalManual.replace(/[^0-9]/g, ''), 10) || 0) : totalItems + envioNum;

  if (!abierto) return null;

  const setFila = (i: number, patch: Partial<ItemFila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const quitar = (i: number) => setFilas((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs));
  const agregar = () => setFilas((fs) => [...fs, { qty: 1, nombre: '', precio: 0 }]);

  const guardar = () => {
    if (!orden) return;
    const items = filas.map((f) => ({ qty: Math.max(1, f.qty), nombre: f.nombre.trim(), precio: Math.max(0, f.precio) })).filter((f) => f.nombre);
    void df.guardarPedidoCompletado(orden.rowId, { cliente: cliente.trim(), tel, departamento, ciudad, direccion, nota, envio: envioNum, total: totalNum, items });
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5, display: 'block' };
  const cargando = df.completarCargando;

  return (
    <div onClick={df.cerrarCompletarPedido} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', width: 'min(640px, 100%)', maxHeight: '88vh', borderRadius: 16, boxShadow: '0 20px 60px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontSize: 18 }}>🧾</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Completar pedido desde el chat</div>
            <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{orden ? `Vas a actualizar el pedido ${orden.id}. Revisa y corrige antes de guardar.` : 'Datos leídos de la conversación.'}</div>
          </div>
          <span onClick={df.cerrarCompletarPedido} title="Cerrar" style={{ cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 20, padding: 4, lineHeight: 1 }}>✕</span>
        </div>

        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cargando ? (
            <div style={{ textAlign: 'center', color: 'var(--df-text-muted)', padding: '30px 0', fontSize: 14 }}>Leyendo el chat con IA…</div>
          ) : !datos?.propuesta ? (
            <div style={{ color: 'var(--df-text-muted)', fontSize: 14, padding: '16px 0' }}>{df.completarMsg || 'No encontramos datos de un pedido en esta conversación.'}</div>
          ) : (
            <>
              {!orden && (
                <div style={{ background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border, var(--df-border))', color: 'var(--df-warning)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>
                  Este cliente no tiene un pedido existente para completar. Si quieres registrarlo, usa “Crear pedido”.
                </div>
              )}
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Datos del cliente</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Nombre *</label><input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Teléfono</label><input value={tel} onChange={(e) => setTel(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Departamento</label><input value={departamento} onChange={(e) => setDepartamento(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Ciudad</label><input value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={inp} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} style={inp} /></div>
              </div>

              <div style={{ borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Productos (con talla y color)</span>
              </div>
              {filas.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ width: 66 }}><label style={lbl}>Cant.</label><input type="number" min={1} value={f.qty} onChange={(e) => setFila(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={inp} /></div>
                  <div style={{ flex: 1 }}><label style={lbl}>Producto</label><input value={f.nombre} onChange={(e) => setFila(i, { nombre: e.target.value })} placeholder="Ej: Bodys con Manga (Talla M · Negro)" style={inp} /></div>
                  <div style={{ width: 110 }}><label style={lbl}>Precio unit.</label><input type="number" min={0} value={f.precio} onChange={(e) => setFila(i, { precio: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={inp} /></div>
                  {filas.length > 1 && <button onClick={() => quitar(i)} title="Quitar" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-danger-border)', color: 'var(--df-danger)', borderRadius: 8, width: 36, height: 38, cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>}
                </div>
              ))}
              <button onClick={agregar} style={{ alignSelf: 'flex-start', background: 'var(--df-surface)', border: '1px dashed var(--df-border-strong)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Agregar producto</button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
                <div><label style={lbl}>Envío</label><input type="number" min={0} value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>Total del pedido</label><input type="number" min={0} value={totalManual} onChange={(e) => setTotalManual(e.target.value)} placeholder={String(totalItems + envioNum)} style={inp} /></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--df-text-muted)' }}>Total a guardar: <strong style={{ color: 'var(--df-text)', fontSize: 16 }}>{fmt(totalNum)}</strong></div>
              <div><label style={lbl}>Nota (opcional)</label><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Punto de referencia, método de pago…" style={inp} /></div>
            </>
          )}
          {df.completarMsg && !cargando && datos?.propuesta && (
            <div style={{ color: df.completarMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)', fontSize: 13 }}>{df.completarMsg}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--df-border)' }}>
          <div style={{ flex: 1 }} />
          <button onClick={df.cerrarCompletarPedido} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={!orden || cargando || !cliente.trim()} style={{ background: !orden || !cliente.trim() ? 'var(--df-border-strong)' : 'var(--df-brand)', border: 'none', color: '#fff', borderRadius: 10, padding: '11px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: !orden || !cliente.trim() ? 'not-allowed' : 'pointer' }}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
