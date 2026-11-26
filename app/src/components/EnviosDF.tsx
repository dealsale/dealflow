import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import logo from '../assets/logo.png';
import { Icono, IconoColor } from './Icono';
import { confirmar, notificar } from './dialogs';
import { fmt } from '../lib/format';
import {
  apiEnviosDF, apiActivarEnviosDF, apiDesactivarEnviosDF, apiOrigenEnviosDF, apiCotizarEnviosDF, apiDespacharEnviosDF,
  type EstadoEnviosDF, type OrigenEnviosDF, type PaqueteEnviosDF, type TarifaEnviosDF,
} from '../lib/api';

/** Logo de DealFlow para los envíos (nunca se muestra la marca de la cuenta de envíos que hay detrás). */
export function LogoDealFlow({ px = 28 }: { px?: number }) {
  return (
    <span style={{ width: px, height: px, borderRadius: px * 0.28, background: 'linear-gradient(140deg, #0b1220, #1e293b)', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(46,139,255,.25)' }}>
      <img src={logo} alt="DealFlow" style={{ width: px * 0.72, height: px * 0.64, objectFit: 'contain' }} />
    </span>
  );
}

let cache: EstadoEnviosDF | null = null;
const oyentes = new Set<(e: EstadoEnviosDF | null) => void>();
async function refrescar() {
  const r = await apiEnviosDF();
  if (r.data) { cache = r.data; oyentes.forEach((f) => f(cache)); }
  return r.data || null;
}
/** Estado de Envíos DealFlow de la tienda (compartido entre pantallas). */
export function useEnviosDF(): [EstadoEnviosDF | null, () => Promise<EstadoEnviosDF | null>] {
  const [e, setE] = useState<EstadoEnviosDF | null>(cache);
  useEffect(() => { oyentes.add(setE); if (!cache) void refrescar(); return () => { oyentes.delete(setE); }; }, []);
  return [e, useCallback(refrescar, [])];
}

const GRAD = 'linear-gradient(120deg, #10b981, #2e8bff 55%, #7658ff)';
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };

/**
 * Tarjeta de la integración: activar (aceptando los términos), ver el estado y la dirección de
 * recogida de la bodega de la tienda (para despachar sus productos propios).
 */
export function EnviosDFCard({ origenAbierto = false, irBilletera }: { origenAbierto?: boolean; irBilletera?: () => void }) {
  const [e, recargar] = useEnviosDF();
  const [terminos, setTerminos] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [verOrigen, setVerOrigen] = useState(origenAbierto);
  if (!e) return null;

  const activar = async () => {
    setOcupado(true);
    const r = await apiActivarEnviosDF();
    setOcupado(false);
    if (r.error) return notificar(r.error, 'error');
    setTerminos(false); setAcepto(false);
    notificar('✓ Envíos DealFlow activado.');
    await recargar();
  };
  const desactivar = async () => {
    if (!(await confirmar({ titulo: '¿Desactivar Envíos DealFlow?', mensaje: 'Los productos de DealShop dejan de despacharse y no podrás generar guías con DealFlow. Las guías que ya salieron se terminan de liquidar normalmente.', aceptar: 'Desactivar', peligro: true }))) return;
    await apiDesactivarEnviosDF();
    await recargar();
  };

  return (
    <div style={{ border: '1px solid color-mix(in srgb, #2e8bff 35%, var(--df-border))', borderRadius: 14, overflow: 'hidden', background: 'var(--df-surface)', marginBottom: 16 }}>
      <div style={{ background: GRAD, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <LogoDealFlow px={38} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            Envíos DealFlow
            <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', background: e.activo ? 'rgba(255,255,255,.95)' : 'rgba(0,0,0,.25)', color: e.activo ? '#059669' : '#fff' }}>
              {e.activo ? '● Activo' : e.disponible ? 'Sin activar' : 'Muy pronto'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.92 }}>Guías con Servientrega, Coordinadora, Interrapidísimo y más. DealFlow recauda el contraentrega y te lo abona.</div>
        </div>
        {e.activo && (
          <button onClick={irBilletera} disabled={!irBilletera} title="Ir a mi billetera"
            style={{ textAlign: 'right', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 10, padding: '5px 11px', color: '#fff', fontFamily: 'inherit', cursor: irBilletera ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Billetera{irBilletera ? ' ▸' : ''}</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{fmt(e.saldo)}</div>
          </button>
        )}
      </div>

      <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
        {!e.activo ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              {[
                { i: 'bolsa' as const, c: '#A78BFA', t: 'Vende productos de DealShop', d: 'Salen solos de la bodega del proveedor.' },
                { i: 'despachar' as const, c: '#2e8bff', t: 'Despacha tus productos', d: 'Cotiza y genera la guía desde el pedido.' },
                { i: 'dinero' as const, c: '#10b981', t: 'DealFlow recauda', d: 'Lo que paga el cliente llega a tu billetera.' },
              ].map((x) => (
                <div key={x.t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--df-surface-2)', borderRadius: 10, padding: '9px 10px' }}>
                  <IconoColor color={x.c}><Icono nombre={x.i} tam={16} /></IconoColor>
                  <span style={{ display: 'grid', gap: 1 }}><b style={{ fontSize: 13 }}>{x.t}</b><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{x.d}</span></span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
              Servicio de guía: <b>{fmt(e.tarifas.propio)}</b> por guía de tus productos y <b>{fmt(e.tarifas.dealshop)}</b> en DealShop, más el valor del envío. Sin claves ni mensualidad.
            </div>
            <div>
              <button onClick={() => setTerminos(true)} disabled={!e.disponible} className="df-btn-primary"
                style={{ ...btn, border: 'none', background: e.disponible ? 'var(--df-brand)' : 'var(--df-surface-2)', color: e.disponible ? '#fff' : 'var(--df-text-muted)', cursor: e.disponible ? 'pointer' : 'not-allowed' }}>
                {e.disponible ? 'Activar Envíos DealFlow' : 'Disponible muy pronto'}
              </button>
            </div>
          </>
        ) : (
          <>
            {e.terminosNuevos && (
              <div style={{ fontSize: 12.5, background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>Actualizamos los términos de Envíos DealFlow.</span>
                <button onClick={() => setTerminos(true)} style={{ ...btn, padding: '5px 10px' }}>Leer y aceptar</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--df-text-muted)' }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                {e.aceptado ? <>Términos aceptados por <b>{e.aceptado.por}</b> el {new Date(e.aceptado.at.replace(' ', 'T') + 'Z').toLocaleDateString('es-CO')}. </> : null}
                <button onClick={() => setTerminos(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--df-brand-dark)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>Ver términos</button>
              </span>
              <button onClick={() => setVerOrigen((v) => !v)} style={btn}>
                <Icono nombre="casa" tam={14} style={{ marginRight: 5, verticalAlign: '-0.15em' }} />
                {e.faltaOrigen.length ? 'Completa tu bodega' : 'Mi bodega'} {verOrigen ? '▴' : '▾'}
              </button>
              <button onClick={() => void desactivar()} style={{ ...btn, color: 'var(--df-danger-dark)', borderColor: 'transparent', background: 'transparent' }}>Desactivar</button>
            </div>
            {e.faltaOrigen.length > 0 && !verOrigen && (
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Para despachar <b>tus propios productos</b> con DealFlow, dinos desde dónde los recoge la transportadora (falta: {e.faltaOrigen.join(', ')}). Para DealShop no hace falta.</div>
            )}
            {verOrigen && <FormOrigen e={e} alGuardar={async () => { await recargar(); setVerOrigen(false); }} />}
          </>
        )}
      </div>

      {terminos && (
        <div onClick={() => setTerminos(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div role="dialog" aria-label="Términos de Envíos DealFlow" onClick={(ev) => ev.stopPropagation()} className="df-pop"
            style={{ background: 'var(--df-surface)', borderRadius: 16, width: 560, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)' }}>
            <div style={{ background: GRAD, color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoDealFlow px={30} />
              <div><div style={{ fontWeight: 800, fontSize: 16 }}>Términos de Envíos DealFlow</div><div style={{ fontSize: 11.5, opacity: 0.9 }}>Versión {e.terminos.version}</div></div>
            </div>
            <ol style={{ margin: 0, padding: '14px 18px 14px 36px', overflowY: 'auto', display: 'grid', gap: 8, fontSize: 13.5, lineHeight: 1.55, color: 'var(--df-text-body)' }}>
              {e.terminos.texto.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
            <div style={{ borderTop: '1px solid var(--df-border)', padding: '12px 18px', display: 'grid', gap: 10 }}>
              {(!e.activo || e.terminosNuevos) ? (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={acepto} onChange={(ev) => setAcepto(ev.target.checked)} style={{ marginTop: 3 }} />
                    <span>Leí y acepto los términos de Envíos DealFlow.</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setTerminos(false)} style={btn}>Cancelar</button>
                    <button onClick={() => void activar()} disabled={!acepto || ocupado} className="df-btn-primary"
                      style={{ ...btn, border: 'none', background: acepto ? 'var(--df-brand)' : 'var(--df-surface-2)', color: acepto ? '#fff' : 'var(--df-text-muted)' }}>
                      {ocupado ? 'Activando…' : e.activo ? 'Aceptar' : 'Aceptar y activar'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setTerminos(false)} style={btn}>Cerrar</button></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormOrigen({ e, alGuardar }: { e: EstadoEnviosDF; alGuardar: () => Promise<void> }) {
  const [o, setO] = useState<OrigenEnviosDF>(e.origen);
  const [p, setP] = useState<PaqueteEnviosDF>(e.paquete);
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof OrigenEnviosDF, label: string, ph = '') => (
    <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--df-text-muted)' }}>
      {label}
      <input value={o[k]} onChange={(ev) => setO({ ...o, [k]: ev.target.value })} placeholder={ph} style={inp} />
    </label>
  );
  const medida = (k: keyof PaqueteEnviosDF, label: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--df-text-muted)' }}>
      {label}
      <input type="number" min={0} step="0.1" value={p[k] as number} onChange={(ev) => setP({ ...p, [k]: Number(ev.target.value) })} style={inp} />
    </label>
  );
  const guardar = async () => {
    setGuardando(true);
    const r = await apiOrigenEnviosDF(o, p);
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Bodega guardada.');
    await alGuardar();
  };
  return (
    <div style={{ background: 'var(--df-surface-2)', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Desde aquí recoge la transportadora <b>tus productos propios</b>. La guía sale a nombre de tu tienda.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        {campo('nombre', 'Quién entrega el paquete', 'Ej. Laura Gómez')}
        {campo('empresa', 'Nombre de la tienda')}
        {campo('telefono', 'Celular', '300 000 0000')}
        {campo('email', 'Correo')}
        {campo('direccion', 'Dirección', 'Cra 10 # 20-30')}
        {campo('referencia', 'Referencia', 'Local 2, bodega azul')}
        {campo('ciudad', 'Ciudad')}
        {campo('departamento', 'Departamento')}
        {campo('nit', 'NIT o cédula (opcional)')}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-body)' }}>Paquete típico</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        {medida('largo', 'Largo (cm)')}{medida('ancho', 'Ancho (cm)')}{medida('alto', 'Alto (cm)')}{medida('peso', 'Peso (kg)')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => void guardar()} disabled={guardando} className="df-btn-primary" style={{ ...btn, border: 'none', background: 'var(--df-brand)', color: '#fff' }}>{guardando ? 'Guardando…' : 'Guardar bodega'}</button>
      </div>
    </div>
  );
}

/** Despacho de un pedido con Envíos DealFlow (desde el detalle del pedido). */
export function EnviosDFDespacho({ rowId, onHecho }: { rowId: string; onHecho: () => void }) {
  const [e, recargar] = useEnviosDF();
  const [paso, setPaso] = useState<'idle' | 'cotizando' | 'lista' | 'creando'>('idle');
  const [tarifas, setTarifas] = useState<TarifaEnviosDF[]>([]);
  const [info, setInfo] = useState<{ ciudad: string; saldo: number; cod: boolean; no: { nombre: string; motivo: string }[] } | null>(null);
  const [elegida, setElegida] = useState('');
  const [msg, setMsg] = useState('');
  const [dealshop, setDealshop] = useState(false);
  if (!e?.activo) return null;

  const cotizar = async () => {
    setPaso('cotizando'); setMsg(''); setDealshop(false);
    const r = await apiCotizarEnviosDF(rowId);
    if (r.error || !r.data) {
      setPaso('idle'); setMsg(r.error || 'No se pudo cotizar.');
      if (/DealShop/.test(r.error || '')) setDealshop(true);
      return;
    }
    setTarifas(r.data.tarifas); setInfo({ ciudad: r.data.ciudad, saldo: r.data.saldo, cod: r.data.cod, no: r.data.noDisponibles });
    setElegida(r.data.tarifas[0]?.id || '');
    setPaso('lista');
    if (!r.data.tarifas.length) setMsg(`Ninguna transportadora llega a ${r.data.ciudad}.`);
  };
  const despachar = async (tarifaId: string) => {
    setPaso('creando'); setMsg('');
    const r = await apiDespacharEnviosDF(rowId, tarifaId);
    if (r.error) { setPaso(tarifaId ? 'lista' : 'idle'); setMsg(r.error); return; }
    notificar(r.data?.guia ? `✓ Guía ${r.data.guia} generada con DealFlow. Se le avisa al cliente por WhatsApp.` : '✓ Envío creado con DealFlow. La guía llega en unos minutos.', 'ok', 7000);
    void recargar();
    onHecho();
  };
  const t = tarifas.find((x) => x.id === elegida);
  const alcanza = !t || (info?.saldo ?? 0) >= t.total;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {paso === 'idle' || paso === 'cotizando' ? (
        <>
          {e.faltaOrigen.length > 0 && !dealshop && <div style={{ fontSize: 12.5, color: 'var(--df-warning)' }}>Primero completa tu bodega en Integraciones → Envíos DealFlow (falta: {e.faltaOrigen.join(', ')}).</div>}
          <button onClick={() => void cotizar()} disabled={paso === 'cotizando'} className="df-btn-primary"
            style={{ ...btn, border: 'none', background: 'var(--df-brand)', color: '#fff', padding: '10px 14px' }}>
            {paso === 'cotizando' ? 'Buscando transportadoras…' : 'Cotizar con DealFlow'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            Destino: <b>{info?.ciudad}</b> · {info?.cod ? 'Contraentrega: DealFlow recauda y te lo abona al entregarse' : 'Pedido ya pagado'} · Billetera: <b>{fmt(info?.saldo || 0)}</b>
          </div>
          <div role="radiogroup" aria-label="Transportadora" style={{ display: 'grid', gap: 5 }}>
            {tarifas.map((x) => (
              <button key={x.id} role="radio" aria-checked={x.id === elegida} onClick={() => setElegida(x.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--df-text-body)',
                  border: `1.5px solid ${x.id === elegida ? 'var(--df-brand)' : 'var(--df-border)'}`, background: x.id === elegida ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)' }}>
                <IconoColor color="#2e8bff"><Icono nombre="despachar" tam={15} /></IconoColor>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{x.transportadora}</b>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--df-text-muted)' }}>{x.servicio}{x.dias != null ? ` · ${x.dias} día${x.dias === 1 ? '' : 's'}` : ''} · envío {fmt(x.precio)} + guía {fmt(x.servicio_df)}</span>
                </span>
                <b style={{ fontSize: 14 }}>{fmt(x.total)}</b>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={() => { setPaso('idle'); setTarifas([]); }} style={btn}>Volver</button>
            <button onClick={() => void despachar(elegida)} disabled={!t || !alcanza || paso === 'creando'} className="df-btn-primary"
              style={{ ...btn, border: 'none', background: t && alcanza ? 'var(--df-brand)' : 'var(--df-surface-2)', color: t && alcanza ? '#fff' : 'var(--df-text-muted)' }}>
              {paso === 'creando' ? 'Generando guía…' : !alcanza ? 'Saldo insuficiente' : `Generar guía · ${t ? fmt(t.total) : ''}`}
            </button>
          </div>
          {!alcanza && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', textAlign: 'right' }}>Recarga tu billetera: toca tu perfil (arriba) → Billetera.</div>}
        </>
      )}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{msg}</div>}
      {dealshop && (
        <button onClick={() => void despachar('')} disabled={paso === 'creando'} style={{ ...btn, borderColor: '#A78BFA', color: '#7C3AED' }}>
          {paso === 'creando' ? 'Despachando…' : 'Despachar ahora desde la bodega del proveedor'}
        </button>
      )}
    </div>
  );
}
