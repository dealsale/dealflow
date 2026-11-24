import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icono, IconoColor, type NombreIcono } from './Icono';
import { notificar, confirmar } from './dialogs';
import { fmt } from '../lib/format';
import { fmtCO } from '../lib/fechaCO';
import { apiBodegaDF, apiDespacharDF, apiRecargarBilletera, apiResolverEscaladoDF, apiRetiroBilletera, type BodegaDFTienda, type PedidoDF } from '../lib/api';

/*
 * Bodega DealFlow (vista de la tienda): billetera en pesos, recarga con Bold, retiros y los
 * pedidos que despacha DealFlow con sus productos de la Biblioteca.
 */

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', font: 'inherit', fontSize: 14, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 10, padding: '9px 14px', font: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 };
const fecha = (s: string) => { if (!s) return ''; const d = new Date(/[zZ]$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? s : fmtCO('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d); };

/** Color e ícono de cada movimiento de la billetera. */
const MOV: Record<string, { color: string; icono: NombreIcono }> = {
  recarga: { color: '#34D399', icono: 'billetera' }, recaudo: { color: '#10B981', icono: 'dinero' }, reintegro: { color: '#60A5FA', icono: 'devolver' },
  despacho: { color: '#A78BFA', icono: 'despachar' }, servicio: { color: '#818CF8', icono: 'guia' }, devolucion: { color: '#FB923C', icono: 'devuelto' }, retiro: { color: '#F472B6', icono: 'pago' },
  retiro_reverso: { color: '#60A5FA', icono: 'devolver' }, ajuste: { color: '#FBBF24', icono: 'ajustes' },
};
/** Color del estado de cada pedido de la bodega. */
const EST: Record<string, { color: string; icono: NombreIcono }> = {
  pendiente: { color: '#60A5FA', icono: 'pendiente' }, sin_saldo: { color: '#FBBF24', icono: 'billetera' }, error: { color: '#F87171', icono: 'alerta' },
  mixto: { color: '#FB923C', icono: 'alerta' }, despachado: { color: '#A78BFA', icono: 'despachar' }, liquidado: { color: '#34D399', icono: 'entregado' }, cancelado: { color: '#94A3B8', icono: 'error' },
};

export function BodegaDFTiendaPanel() {
  const [d, setD] = useState<BodegaDFTienda | null>(null);
  const [error, setError] = useState('');
  const [monto, setMonto] = useState('');
  const [retiro, setRetiro] = useState<{ monto: string; datos: string } | null>(null);
  const [vista, setVista] = useState<'pedidos' | 'movimientos'>('pedidos');
  const [ocupado, setOcupado] = useState('');
  const [respuesta, setRespuesta] = useState<Record<string, string>>({});

  const cargar = () => void apiBodegaDF().then((r) => { if (r.data) { setD(r.data); setError(''); } else setError(r.error || 'No se pudo cargar la bodega.'); });
  useEffect(() => {
    cargar();
    // Al volver de pagar la recarga, el saldo se actualiza solo en cuanto Bold confirma.
    const volvioDePagar = new URLSearchParams(window.location.search).get('pago') === 'ok';
    if (volvioDePagar) notificar('Recibimos tu pago: el saldo se actualiza en cuanto Bold lo confirme.', 'ok', 6000);
    const iv = setInterval(() => { if (!document.hidden) cargar(); }, volvioDePagar ? 8000 : 30000);
    return () => clearInterval(iv);
  }, []);

  const recargar = async (valor: number) => {
    if (!d) return;
    if (!valor || valor < d.ajustes.recargaMin) { notificar(`La recarga mínima es ${fmt(d.ajustes.recargaMin)}.`, 'info'); return; }
    setOcupado('recarga');
    const r = await apiRecargarBilletera(Math.round(valor));
    setOcupado('');
    if (r.error || !r.data?.url) { notificar(r.error || 'No pudimos abrir el pago.', 'error'); return; }
    window.location.href = r.data.url;
  };
  const pedirRetiro = async () => {
    if (!retiro) return;
    setOcupado('retiro');
    const r = await apiRetiroBilletera(Math.round(Number(retiro.monto.replace(/\D/g, '')) || 0), retiro.datos);
    setOcupado('');
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar('Retiro solicitado. DealFlow te transfiere y te avisamos aquí.', 'ok');
    setRetiro(null); cargar();
  };
  const despachar = async (p: PedidoDF) => {
    if (!(await confirmar({ titulo: `Despachar ${p.codigo}`, mensaje: 'Se cotiza el envío, se descuenta de tu billetera el producto + el envío y se genera la guía.', aceptar: 'Despachar' }))) return;
    setOcupado(p.id);
    const r = await apiDespacharDF(p.id);
    setOcupado('');
    if (r.error) notificar(r.error, 'error'); else notificar(`${p.codigo} despachado${r.data?.guia ? ` · guía ${r.data.guia}` : ''}.`, 'ok');
    cargar();
  };
  const resolver = async (p: PedidoDF) => {
    setOcupado(p.id);
    const r = await apiResolverEscaladoDF(p.id, respuesta[p.id] || '');
    setOcupado('');
    if (r.error) notificar(r.error, 'error'); else { notificar('Le avisamos al proveedor.', 'ok'); cargar(); }
  };

  const abiertos = useMemo(() => (d?.pedidos || []).filter((p) => p.escalado && !p.escalado.resuelto), [d]);
  if (error) return <div style={{ ...card, padding: 24, color: 'var(--df-danger)' }}>{error}</div>;
  if (!d) return <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--df-text-muted)' }}>Cargando tu bodega…</div>;
  const enCamino = d.pedidos.filter((p) => p.dfEstado === 'despachado').length;
  const esperando = d.pedidos.filter((p) => p.dfEstado === 'sin_saldo').length;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!d.listo && (
        <div style={{ ...card, padding: '12px 16px', borderColor: 'var(--df-warning-border, var(--df-border))', background: 'var(--df-warning-subtle)', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
          <IconoColor color="#FBBF24"><Icono nombre="pendiente" tam={18} /></IconoColor>
          La Bodega DealFlow se está activando. Ya puedes recargar tu billetera; los despachos salen en cuanto quede lista.
        </div>
      )}

      {/* Saldo + recarga */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={{ borderRadius: 16, padding: '20px 22px', color: '#fff', background: 'linear-gradient(125deg, #059669 0%, #2e8bff 55%, #7658ff 100%)', boxShadow: '0 18px 40px -20px rgba(46,139,255,.75)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(ellipse at 85% 20%, #000 10%, transparent 65%)', WebkitMaskImage: 'radial-gradient(ellipse at 85% 20%, #000 10%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', opacity: 0.9 }}><Icono nombre="billetera" tam={16} />Tu billetera</div>
          <div style={{ position: 'relative', fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', margin: '6px 0 2px', textShadow: '0 2px 10px rgba(0,0,0,.18)' }}>{fmt(d.saldo)}</div>
          <div style={{ position: 'relative', fontSize: 13, opacity: 0.9 }}>Con esto se pagan el producto y el envío de cada despacho. Lo que pagan tus clientes contra entrega vuelve aquí.</div>
          <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setRetiro(retiro ? null : { monto: '', datos: '' })} style={{ ...btn, background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }}><Icono nombre="pago" tam={15} />Retirar</button>
          </div>
        </div>
        <div style={{ ...card, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15 }}><IconoColor color="#34D399"><Icono nombre="agregar" tam={17} /></IconoColor>Recargar saldo</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            {[50000, 100000, 200000, 500000].filter((v) => v >= d.ajustes.recargaMin).map((v) => (
              <button key={v} onClick={() => void recargar(v)} disabled={ocupado === 'recarga'} style={{ ...btn, borderColor: 'color-mix(in srgb, #34D399 45%, var(--df-border))' }}>{fmt(v)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ''))} placeholder={`Otro valor (mín. ${fmt(d.ajustes.recargaMin)})`} inputMode="numeric" style={input} />
            <button onClick={() => void recargar(Number(monto))} disabled={ocupado === 'recarga'} className="df-btn-primary" style={{ ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none' }}>{ocupado === 'recarga' ? 'Abriendo…' : 'Pagar'}</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--df-text-faint)', marginTop: 8 }}>Pago seguro con Bold. El saldo aparece en cuanto se confirma.</div>
        </div>
      </div>

      {retiro && (
        <div className="df-pop" style={{ ...card, padding: '16px 18px', display: 'grid', gap: 10, borderColor: 'color-mix(in srgb, #F472B6 45%, var(--df-border))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><IconoColor color="#F472B6"><Icono nombre="pago" tam={17} /></IconoColor>Pedir un retiro</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,180px) minmax(0,1fr)', gap: 10 }}>
            <input value={retiro.monto} onChange={(e) => setRetiro({ ...retiro, monto: e.target.value.replace(/[^\d]/g, '') })} placeholder={`Valor (mín. ${fmt(d.ajustes.retiroMin)})`} inputMode="numeric" style={input} />
            <input value={retiro.datos} onChange={(e) => setRetiro({ ...retiro, datos: e.target.value })} placeholder="Banco, tipo de cuenta, número y titular (o Nequi / Daviplata)" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setRetiro(null)} style={btn}>Cancelar</button>
            <button onClick={() => void pedirRetiro()} disabled={ocupado === 'retiro'} className="df-btn-primary" style={{ ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none' }}>Pedir retiro</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>El valor se aparta de tu saldo y DealFlow te lo transfiere. Si hay un problema con los datos, vuelve a tu saldo.</div>
        </div>
      )}

      {/* Números del mes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Dato titulo="En camino" valor={String(enCamino)} color="#A78BFA" icono="despachar" />
        <Dato titulo="Esperando saldo" valor={String(esperando)} color="#FBBF24" icono="billetera" />
        <Dato titulo="Cobrado a clientes (30 días)" valor={fmt(d.mes.cobrado)} color="#34D399" icono="dinero" />
        <Dato titulo="Gastado en despachos (30 días)" valor={fmt(d.mes.despachos)} color="#60A5FA" icono="paquete" />
      </div>

      {/* Novedades que escaló el proveedor */}
      {abiertos.map((p) => (
        <div key={p.id} className="df-pop" style={{ ...card, padding: '14px 16px', borderColor: 'rgba(248,113,113,.45)', background: 'color-mix(in srgb, #F87171 7%, var(--df-surface))', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><IconoColor color="#F87171"><Icono nombre="novedad" tam={17} /></IconoColor>Novedad en {p.codigo} · {p.cliente}</div>
          <div style={{ fontSize: 13.5 }}>{p.escalado!.nota}</div>
          <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>El proveedor la reportó {fecha(p.escalado!.at)}. El chat del cliente pasó a tu equipo para que le escribas.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={respuesta[p.id] || ''} onChange={(e) => setRespuesta({ ...respuesta, [p.id]: e.target.value })} placeholder="¿Qué se hace? (ej. nueva dirección, volver a intentar el lunes)" style={input} />
            <button onClick={() => void resolver(p)} disabled={ocupado === p.id} className="df-btn-primary" style={{ ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none' }}>Responder al proveedor</button>
          </div>
        </div>
      ))}

      {/* Pedidos / movimientos */}
      <section style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, padding: '12px 14px', borderBottom: '1px solid var(--df-border)', alignItems: 'center', flexWrap: 'wrap' }}>
          {([['pedidos', `Pedidos de la bodega · ${d.pedidos.length}`, 'paquete', '#A78BFA'], ['movimientos', `Movimientos · ${d.movimientos.length}`, 'billetera', '#34D399']] as const).map(([v, t, ic, col]) => (
            <button key={v} onClick={() => setVista(v)} style={{ ...btn, borderRadius: 999, padding: '7px 13px', background: vista === v ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', borderColor: vista === v ? 'var(--df-brand)' : 'var(--df-border)' }}>
              <IconoColor color={col}><Icono nombre={ic} tam={15} /></IconoColor>{t}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={cargar} style={{ ...btn, padding: '7px 11px' }} aria-label="Actualizar"><IconoColor color="#60A5FA"><Icono nombre="actualizar" tam={15} /></IconoColor></button>
        </div>
        {vista === 'pedidos' ? (
          d.pedidos.length ? d.pedidos.map((p) => {
            const e = EST[p.dfEstado] || { color: '#94A3B8', icono: 'paquete' as NombreIcono };
            const puedeDespachar = ['sin_saldo', 'error', 'cancelado', 'pendiente'].includes(p.dfEstado) && !p.guia && p.estado !== 'Cancelado';
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--df-border)', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b>{p.codigo}</b><span style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>{p.cliente} · {p.ciudad}</span>
                    <Chip color={e.color} icono={e.icono}>{p.dfEstadoTexto}</Chip>
                    {p.estadoTransportadora && <Chip color="#60A5FA" icono="moto">{p.estadoTransportadora}</Chip>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginTop: 3 }}>
                    {p.guia ? <>{p.transportadora} · guía <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.guia}</span> · </> : null}
                    {p.producto ? <>producto {fmt(p.producto)} + envío {fmt(p.envio)}{p.servicioTienda ? ` + guía ${fmt(p.servicioTienda)}` : ''}{p.cod ? ` · cobra al cliente ${fmt(p.recaudo)}` : ' · ya pagado'}</> : fecha(p.fecha)}
                  </div>
                  {p.detalle && <div style={{ fontSize: 12.5, color: e.color, marginTop: 3, fontWeight: 600 }}>{p.detalle}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.guiaUrl && <a href={p.guiaUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}><IconoColor color="#A78BFA"><Icono nombre="guia" tam={15} /></IconoColor>Guía</a>}
                  {puedeDespachar && <button onClick={() => void despachar(p)} disabled={ocupado === p.id} className="df-btn-primary" style={{ ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none' }}>{ocupado === p.id ? 'Despachando…' : 'Despachar ahora'}</button>}
                </div>
              </div>
            );
          }) : <Vacio icono="paquete" texto="Todavía no tienes pedidos de la bodega. Importa un producto marcado «Despacha DealFlow» y véndelo: cuando el cliente confirme, sale solo." />
        ) : (
          d.movimientos.length ? d.movimientos.map((m) => {
            const c = MOV[m.tipo] || { color: '#94A3B8', icono: 'billetera' as NombreIcono };
            return (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 10, padding: '11px 16px', borderTop: '1px solid var(--df-border)', alignItems: 'center' }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${c.color} 16%, transparent)` }}><IconoColor color={c.color}><Icono nombre={c.icono} tam={16} /></IconoColor></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.nombre}{m.pedido ? <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}> · {m.pedido}</span> : null}</div>
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.detalle || ' '} · {fecha(m.fecha)}</div>
                </div>
                <b style={{ color: m.monto >= 0 ? '#10B981' : 'var(--df-text-body)', fontSize: 14.5 }}>{m.monto >= 0 ? '+' : '−'}{fmt(Math.abs(m.monto))}</b>
              </div>
            );
          }) : <Vacio icono="billetera" texto="Aún no hay movimientos. Recarga tu billetera para empezar a despachar." />
        )}
      </section>

      {d.retiros.length > 0 && (
        <section style={{ ...card, padding: '12px 16px' }}>
          <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}><IconoColor color="#F472B6"><Icono nombre="pago" tam={16} /></IconoColor>Tus retiros</div>
          {d.retiros.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--df-border)', fontSize: 13.5 }}>
              <b>{fmt(r.monto)}</b><span style={{ color: 'var(--df-text-muted)' }}>{fecha(r.fecha)}</span><div style={{ flex: 1 }} />
              <Chip color={r.estado === 'pagado' ? '#34D399' : r.estado === 'rechazado' ? '#F87171' : '#FBBF24'} icono={r.estado === 'pagado' ? 'ok' : r.estado === 'rechazado' ? 'error' : 'pendiente'}>{r.estado === 'pagado' ? 'Pagado' : r.estado === 'rechazado' ? 'Rechazado' : 'En proceso'}</Chip>
            </div>
          ))}
        </section>
      )}

      <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)', lineHeight: 1.55 }}>
        <b>Cómo funciona:</b> al despachar se descuentan el costo del producto, el envío{d.ajustes.tarifaTienda ? ` y ${fmt(d.ajustes.tarifaTienda)} por la generación de la guía` : ''}. Si el cliente paga contra entrega, al entregarse se te abona lo que pagó
        {d.ajustes.comisionPct || d.ajustes.comisionFija ? ` (menos la comisión de recaudo: ${d.ajustes.comisionPct ? `${d.ajustes.comisionPct}%` : ''}${d.ajustes.comisionPct && d.ajustes.comisionFija ? ' + ' : ''}${d.ajustes.comisionFija ? fmt(d.ajustes.comisionFija) : ''})` : ''}.
        Si se devuelve, te reintegramos el producto y se cobra el flete de regreso. Si se cancela antes de salir, te devolvemos todo.
      </div>
    </div>
  );
}

function Chip({ color, icono, children }: { color: string; icono: NombreIcono; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, whiteSpace: 'nowrap' }}>
      <Icono nombre={icono} tam={12} />{children}
    </span>
  );
}
function Dato({ titulo, valor, color, icono }: { titulo: string; valor: string; color: string; icono: NombreIcono }) {
  return (
    <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 11, alignItems: 'center' }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${color} 16%, transparent)`, flexShrink: 0 }}><IconoColor color={color}><Icono nombre={icono} tam={18} /></IconoColor></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600 }}>{titulo}</div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{valor}</div>
      </div>
    </div>
  );
}
function Vacio({ icono, texto }: { icono: NombreIcono; texto: string }) {
  return (
    <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 13.5, borderTop: '1px solid var(--df-border)' }}>
      <div style={{ marginBottom: 8 }}><IconoColor color="#A78BFA"><Icono nombre={icono} tam={28} /></IconoColor></div>{texto}
    </div>
  );
}
