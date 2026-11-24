import { useEffect, useMemo, useState } from 'react';
import { Icono, IconoColor } from './Icono';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Combobox } from './Combobox';
import { DEPARTAMENTOS_CO, ciudadesDeDepto } from '../data/colombia';
import { fmt } from '../lib/format';
import { ItemsPedido, filaDesdeItem, filaVacia, itemsDeFilas, totalFilas, validarFilas, type FilaItem } from './ItemsPedido';

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
  const [filas, setFilas] = useState<FilaItem[]>([]);
  const [error, setError] = useState('');

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
    setFilas(p.items?.length ? p.items.map((it) => filaDesdeItem(it, df.products)) : [filaVacia()]);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  const totalItems = useMemo(() => totalFilas(filas), [filas]);
  const envioNum = Math.max(0, parseInt(envio.replace(/[^0-9]/g, ''), 10) || 0);
  const totalNum = totalManual.trim() ? Math.max(0, parseInt(totalManual.replace(/[^0-9]/g, ''), 10) || 0) : totalItems + envioNum;

  if (!abierto) return null;


  const guardar = () => {
    if (!orden) return;
    const err = validarFilas(filas, df.products);
    if (err) { setError(err); return; }
    setError('');
    const items = itemsDeFilas(filas, df.products);
    void df.guardarPedidoCompletado(orden.rowId, { cliente: cliente.trim(), tel, departamento, ciudad, direccion, nota, envio: envioNum, total: totalNum, items });
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5, display: 'block' };
  const cargando = df.completarCargando;
  const rec = df.completarReciente;
  const ped = rec?.pedido || null;
  const chip = (c: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color: c, background: `color-mix(in srgb, ${c} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 35%, transparent)` });
  const fechaCorta = (s: string) => { const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', width: 'min(640px, 100%)', maxHeight: '88vh', borderRadius: 16, boxShadow: '0 20px 60px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--df-border)' }}>
          <Icono nombre="guia" tam={18} degradado />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Completar pedido desde el chat</div>
            <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{datos ? (orden ? `Vas a actualizar el pedido ${orden.id}. Revisa y corrige antes de guardar.` : 'Datos leídos de la conversación.') : 'El resumen más reciente y el pedido de este cliente.'}</div>
          </div>
          <span onClick={df.cerrarCompletarPedido} title="Cerrar" style={{ cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 20, padding: 4, lineHeight: 1 }}>✕</span>
        </div>

        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Resumen más reciente del chat + su pedido, con el botón para confirmarlo. */}
          {rec && !datos && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, background: 'var(--df-surface-2)', display: 'grid', gap: 6, alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--df-text-muted)' }}><IconoColor color="#60A5FA"><Icono nombre="chat" tam={14} /></IconoColor>Último resumen del chat</div>
                  {rec.resumen
                    ? <><div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto' }}>{rec.resumen.texto}</div><div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{fechaCorta(rec.resumen.fecha)}</div></>
                    : <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>En este chat no se ha enviado ningún resumen de pedido.</div>}
                </div>
                <div style={{ border: `1px solid ${ped && ped.confirmacion !== 'si' ? 'color-mix(in srgb, #34D399 45%, var(--df-border))' : 'var(--df-border)'}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8, alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--df-text-muted)' }}><IconoColor color="#FBBF24"><Icono nombre="carrito" tam={14} /></IconoColor>Pedido más reciente</div>
                  {ped ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 16 }}>{ped.id}</b>
                        <span style={chip(ped.confirmacion === 'si' ? '#34D399' : '#FBBF24')}>{ped.confirmacion === 'si' ? '✓ Confirmado' : ped.confirmacion === 'esperando' ? 'Esperando el «sí»' : 'Sin confirmar'}</span>
                        <span style={chip('#60A5FA')}>{ped.estado}</span>
                      </div>
                      <div style={{ fontSize: 13, display: 'grid', gap: 2 }}>
                        {ped.items.map((it, i) => <span key={i}>{it.qty}× {it.nombre}</span>)}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{ped.cliente} · {[ped.direccion, ped.ciudad, ped.departamento].filter(Boolean).join(', ')}</div>
                      <div style={{ fontSize: 14 }}>Total: <b>{fmt(ped.total)}</b>{ped.guia ? <span style={{ color: 'var(--df-text-muted)' }}> · guía {ped.guia}</span> : null}</div>
                      {ped.confirmacion !== 'si' && !['Cancelado', 'Entregado', 'Devuelto'].includes(ped.estado) ? (
                        <button onClick={() => void df.confirmarPedidoDesdeChat(ped.rowId)} disabled={df.confirmandoChat} className="df-btn-primary"
                          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          {df.confirmandoChat ? 'Confirmando…' : '✓ Confirmar pedido'}
                        </button>
                      ) : null}
                      {ped.confirmacion !== 'si' && <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Queda como si el cliente hubiera dicho «Sí»: se le avisa por WhatsApp y sale a despacho.</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Este cliente todavía no tiene un pedido registrado.</div>
                      <button onClick={() => { df.cerrarCompletarPedido(); df.abrirCrearPedido({ cliente: df.crmChat?.nombre || '', tel: df.crmChat?.tel || '' }, df.crmChat?.id); }} className="df-btn-primary"
                        style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>Crear pedido</button>
                    </>
                  )}
                </div>
              </div>
              {ped && (
                <button onClick={() => void df.leerPedidoConIA()} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid var(--df-border)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <IconoColor color="#A78BFA"><Icono nombre="ia" tam={14} /></IconoColor>Corregir los datos del pedido con lo que dice el chat (IA)
                </button>
              )}
            </>
          )}
          {cargando ? (
            <div style={{ textAlign: 'center', color: 'var(--df-text-muted)', padding: '30px 0', fontSize: 14 }}>{rec ? 'Leyendo el chat con IA…' : 'Buscando el pedido del chat…'}</div>
          ) : !rec && !datos ? (
            <div style={{ color: 'var(--df-text-muted)', fontSize: 14, padding: '16px 0' }}>{df.completarMsg || 'No pudimos leer este chat.'}</div>
          ) : !datos ? null : !datos.propuesta ? (
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
                <div><label style={lbl}>Departamento</label><Combobox value={departamento} onChange={(v) => { setDepartamento(v); const cds = ciudadesDeDepto(v); if (ciudad && cds.length && !cds.includes(ciudad)) setCiudad(''); }} options={DEPARTAMENTOS_CO} placeholder="Cundinamarca" inputStyle={inp} /></div>
                <div><label style={lbl}>Ciudad</label><Combobox value={ciudad} onChange={setCiudad} options={ciudadesDeDepto(departamento)} placeholder="Bogotá" inputStyle={inp} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} style={inp} /></div>
              </div>

              <div style={{ borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Productos (con talla y color)</span>
              </div>
              <ItemsPedido productos={df.products} filas={filas} setFilas={setFilas} />
              {error && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, background: 'var(--df-danger-subtle)', border: '1px solid var(--df-danger-border)', borderRadius: 10, padding: '9px 12px' }}>{error}</div>}

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
          {datos?.propuesta && <button onClick={guardar} disabled={!orden || cargando || !cliente.trim()} style={{ background: !orden || !cliente.trim() ? 'var(--df-border-strong)' : 'var(--df-brand)', border: 'none', color: '#fff', borderRadius: 10, padding: '11px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: !orden || !cliente.trim() ? 'not-allowed' : 'pointer' }}>Guardar cambios</button>}
        </div>
      </div>
    </div>
  );
}
