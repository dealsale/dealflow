import { useEffect, useMemo, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from './Dropdown';
import { fmt } from '../lib/format';

interface Fila {
  productId: string;
  opciones: Record<string, string>; // grupo -> valor
  qty: number;
  precio: number;
}

/**
 * Creador de pedidos MANUAL: el dueño mete los datos del cliente (los mismos que
 * pide el bot) y OBLIGA a elegir producto + variantes + cantidad. Sirve para la
 * logística manual (pedidos que no llegaron por el bot).
 */
export function ManualOrderModal({ df, open, onClose, prefill }: { df: DealFlowState; open: boolean; onClose: () => void; prefill?: { cliente?: string; tel?: string } | null }) {
  const [cliente, setCliente] = useState('');
  const [tel, setTel] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [nota, setNota] = useState('');
  const [envio, setEnvio] = useState('');
  const [filas, setFilas] = useState<Fila[]>([{ productId: '', opciones: {}, qty: 1, precio: 0 }]);
  const [error, setError] = useState('');

  // El modal vive montado siempre (para poder abrirlo desde el Inbox con el
  // cliente ya puesto): cada vez que se abre, arranca limpio con el prefill.
  useEffect(() => {
    if (open) {
      setCliente(prefill?.cliente || '');
      setTel(prefill?.tel || '');
      setDepartamento(''); setCiudad(''); setDireccion(''); setNota(''); setEnvio('');
      setFilas([{ productId: '', opciones: {}, qty: 1, precio: 0 }]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const productos = df.products;
  const opcionesProducto = [{ value: '', label: 'Selecciona un producto…' }, ...productos.map((p) => ({ value: String(p.id), label: `${p.nombre} · ${fmt(p.precio)}` }))];

  const setFila = (i: number, patch: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const elegirProducto = (i: number, pid: string) => {
    const p = productos.find((x) => String(x.id) === pid);
    setFila(i, { productId: pid, opciones: {}, precio: p ? p.precio : 0 });
  };
  const quitarFila = (i: number) => setFilas((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs));
  const agregarFila = () => setFilas((fs) => [...fs, { productId: '', opciones: {}, qty: 1, precio: 0 }]);

  const nombreItem = (f: Fila): string => {
    const p = productos.find((x) => String(x.id) === f.productId);
    if (!p) return '';
    const vals = (p.opciones || []).map((g) => f.opciones[g.nombre]).filter(Boolean);
    return vals.length ? `${p.nombre} (${vals.join(' · ')})` : p.nombre;
  };

  const totalItems = useMemo(
    () => filas.reduce((a, f) => a + (f.productId ? Math.max(1, f.qty) * Math.max(0, f.precio) : 0), 0),
    [filas],
  );
  const envioNum = Math.max(0, parseInt(envio.replace(/[^0-9]/g, ''), 10) || 0);
  const total = totalItems + envioNum;

  if (!open) return null;

  const guardar = async () => {
    setError('');
    if (!cliente.trim()) { setError('Escribe el nombre del cliente.'); return; }
    const conProd = filas.filter((f) => f.productId);
    if (!conProd.length) { setError('Elige al menos un producto.'); return; }
    // Toda variante del producto debe estar elegida (obliga a seleccionar variantes).
    for (const f of conProd) {
      const p = productos.find((x) => String(x.id) === f.productId);
      const faltan = (p?.opciones || []).filter((g) => (g.valores?.length || 0) > 0 && !f.opciones[g.nombre]);
      if (faltan.length) { setError(`Elige ${faltan.map((g) => g.nombre.toLowerCase()).join(', ')} de "${p?.nombre}".`); return; }
    }
    const items = conProd.map((f) => ({ qty: Math.max(1, f.qty), nombre: nombreItem(f), precio: Math.max(0, f.precio) }));
    const id = await df.crearPedidoManual({ cliente: cliente.trim(), tel, ciudad, departamento, direccion, nota, envio: envioNum, total, items });
    if (id) {
      // Reinicia y cierra.
      setCliente(''); setTel(''); setDepartamento(''); setCiudad(''); setDireccion(''); setNota(''); setEnvio('');
      setFilas([{ productId: '', opciones: {}, qty: 1, precio: 0 }]);
      onClose();
    }
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5 };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', width: 'min(640px, 100%)', maxHeight: '88vh', borderRadius: 16, boxShadow: '0 20px 60px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontSize: 18 }}>🧾</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Crear pedido manual</div>
            <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Para pedidos que no llegaron por el bot (logística manual).</div>
          </div>
          <span onClick={onClose} title="Cerrar" style={{ cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 20, padding: 4, lineHeight: 1 }}>✕</span>
        </div>

        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Datos del cliente</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Nombre *</label><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y apellido" style={inp} /></div>
            <div><label style={lbl}>Teléfono</label><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="300 000 0000" style={inp} /></div>
            <div><label style={lbl}>Departamento</label><input value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="Cundinamarca" style={inp} /></div>
            <div><label style={lbl}>Ciudad</label><input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Bogotá" style={inp} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle 1 #2-3, apto…" style={inp} /></div>
          </div>

          <div style={{ borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Productos</span>
          </div>
          {filas.map((f, i) => {
            const p = productos.find((x) => String(x.id) === f.productId);
            return (
              <div key={i} style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--df-bg)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Dropdown ariaLabel="Producto" value={f.productId} onChange={(v) => elegirProducto(i, v)} options={opcionesProducto} placeholder="Selecciona un producto…" />
                  </div>
                  {filas.length > 1 && (
                    <button onClick={() => quitarFila(i)} title="Quitar" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-danger-border)', color: 'var(--df-danger)', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
                  )}
                </div>
                {p && (p.opciones || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(p.opciones || []).map((g) => (
                      <div key={g.nombre}>
                        <label style={lbl}>{g.nombre}</label>
                        <Dropdown
                          ariaLabel={g.nombre}
                          value={f.opciones[g.nombre] || ''}
                          onChange={(v) => setFila(i, { opciones: { ...f.opciones, [g.nombre]: v } })}
                          options={[{ value: '', label: `Elige ${g.nombre.toLowerCase()}…` }, ...(g.valores || []).map((val) => ({ value: val.valor, label: val.valor }))]}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ width: 90 }}><label style={lbl}>Cantidad</label><input type="number" min={1} value={f.qty} onChange={(e) => setFila(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={inp} /></div>
                  <div style={{ flex: 1 }}><label style={lbl}>Precio unitario</label><input type="number" min={0} value={f.precio} onChange={(e) => setFila(i, { precio: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={inp} /></div>
                  <div style={{ textAlign: 'right', paddingBottom: 10, minWidth: 90 }}>
                    <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>Subtotal</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(Math.max(1, f.qty) * Math.max(0, f.precio))}</div>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={agregarFila} style={{ alignSelf: 'flex-start', background: 'var(--df-surface)', border: '1px dashed var(--df-border-strong)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Agregar otro producto</button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
            <div><label style={lbl}>Envío</label><input type="number" min={0} value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="0" style={inp} /></div>
            <div style={{ textAlign: 'right', alignSelf: 'end' }}>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Total del pedido</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--df-text)' }}>{fmt(total)}</div>
            </div>
          </div>
          <div><label style={lbl}>Nota (opcional)</label><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Punto de referencia, indicaciones…" style={inp} /></div>

          {(error || df.crearPedidoMsg) && (
            <div style={{ color: error ? 'var(--df-danger-dark)' : 'var(--df-text-muted)', fontSize: 13, background: error ? 'var(--df-danger-subtle)' : 'var(--df-bg)', border: `1px solid ${error ? 'var(--df-danger-border)' : 'var(--df-border)'}`, borderRadius: 10, padding: '9px 12px' }}>{error || df.crearPedidoMsg}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--df-border)' }}>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} style={{ background: 'var(--df-brand)', border: 'none', color: '#fff', borderRadius: 10, padding: '11px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Crear pedido</button>
        </div>
      </div>
    </div>
  );
}
