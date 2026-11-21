import { useEffect, useState } from 'react';
import { IntegracionFila, LogoInteg } from './IntegracionFila';
import { Dropdown } from './Dropdown';
import { BodegasProveedores } from './BodegasProveedores';
import { SkydropxProductos } from './SkydropxProductos';
import { confirmar, notificar } from './dialogs';
import { apiSkydropxEstado, apiSkydropxConectar, apiSkydropxDesconectar, type EstadoSkydropx, type OrigenSkydropx, type PaqueteSkydropx } from '../lib/api';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 600, marginBottom: 4 };
const btnPrimary: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', minHeight: 40, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };

// Estado compartido entre la tarjeta de Integraciones y el despacho del pedido.
let cache: EstadoSkydropx | null = null;
const oyentes = new Set<(e: EstadoSkydropx | null) => void>();
export async function recargarSkydropx(): Promise<EstadoSkydropx | null> {
  const r = await apiSkydropxEstado();
  cache = r.data || null;
  oyentes.forEach((f) => f(cache));
  return cache;
}
/** ¿Está conectado Skydropx en esta tienda? (lo pide una vez y lo comparte). */
export function useSkydropx(): EstadoSkydropx | null {
  const [e, setE] = useState<EstadoSkydropx | null>(cache);
  useEffect(() => {
    oyentes.add(setE);
    if (!cache) void recargarSkydropx();
    return () => { oyentes.delete(setE); };
  }, []);
  return e;
}

export const LogoSkydropx = ({ px = 40 }: { px?: number }) => px >= 40
  ? <LogoInteg fondo="#2E1A87"><span style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>S</span></LogoInteg>
  : <span style={{ width: px, height: px, borderRadius: 7, background: '#2E1A87', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: Math.round(px * 0.55), flexShrink: 0 }}>S</span>;

const ORIGEN_VACIO: OrigenSkydropx = { nombre: '', empresa: '', telefono: '', email: '', direccion: '', referencia: '', departamento: '', ciudad: '', nit: '' };

/** Conexión de Skydropx: credenciales de la API, datos de quien envía y caja por defecto. */
export function SkydropxCard() {
  const est = useSkydropx();
  const [abierta, setAbierta] = useState(false);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [ambiente, setAmbiente] = useState<'sandbox' | 'produccion'>('produccion');
  const [origen, setOrigen] = useState<OrigenSkydropx>(ORIGEN_VACIO);
  const [paquete, setPaquete] = useState<PaqueteSkydropx>({ largo: 20, ancho: 15, alto: 10, peso: 1, contenido: 'Productos de la tienda' });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    if (!est) return;
    setClientId(est.clientId); setAmbiente(est.ambiente); setOrigen({ ...ORIGEN_VACIO, ...est.origen }); setPaquete(est.paquete);
  }, [est]);

  const conectada = !!est?.conectado;
  const o = (k: keyof OrigenSkydropx) => ({ value: origen[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOrigen((x) => ({ ...x, [k]: e.target.value })) });
  const p = (k: 'largo' | 'ancho' | 'alto' | 'peso') => ({ value: String(paquete[k] || ''), inputMode: 'decimal' as const, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPaquete((x) => ({ ...x, [k]: Number(e.target.value.replace(',', '.')) || 0 })) });
  const listo = !!clientId.trim() && (conectada || !!secret.trim()) && !!origen.nombre.trim() && !!origen.telefono.trim() && !!origen.email.trim() && !!origen.direccion.trim() && !!origen.ciudad.trim();

  const guardar = async () => {
    setGuardando(true); setMsg('');
    const r = await apiSkydropxConectar({ clientId: clientId.trim(), clientSecret: secret.trim(), ambiente, origen, paquete });
    setGuardando(false);
    if (r.error) { setMsg(r.error); return; }
    setSecret('');
    await recargarSkydropx();
    notificar('✓ Skydropx conectado. Ya puedes despachar pedidos con Skydropx.');
  };
  const desconectar = async () => {
    if (!(await confirmar({ titulo: 'Desconectar Skydropx', mensaje: 'Se borran las credenciales de Skydropx de DealFlow. Los envíos ya creados no se tocan en Skydropx.', aceptar: 'Desconectar' }))) return;
    await apiSkydropxDesconectar();
    await recargarSkydropx();
    setClientId(''); setSecret('');
  };
  const copiar = () => { if (!est?.webhookUrl) return; void navigator.clipboard?.writeText(est.webhookUrl).then(() => { setCopiada(true); setTimeout(() => setCopiada(false), 1800); }).catch(() => {}); };
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };

  return (
    <IntegracionFila
      logo={<LogoSkydropx />}
      nombre="Skydropx"
      desc={conectada ? <>Conectada{est?.ambiente === 'sandbox' ? <> · <b>modo pruebas</b></> : ''} · envía desde <b>{est?.origen.ciudad || 'sin ciudad'}</b></> : 'Cotiza con varias transportadoras (Interrapidísimo, Coordinadora, Servientrega…) y genera la guía.'}
      estado={conectada ? 'on' : 'off'}
      abierta={abierta}
      onToggle={() => { setAbierta((v) => !v); setSecret(''); setMsg(''); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
          Las credenciales están en <b>Skydropx → Conexiones → API</b> (Client ID y Client Secret). Para probar sin gastar saldo usa las de <b>pruebas (sandbox)</b>.
        </div>
        <div style={grid2}>
          <div>
            <div style={lbl}>Ambiente</div>
            <Dropdown ariaLabel="Ambiente de Skydropx" value={ambiente} onChange={(v) => setAmbiente(v === 'sandbox' ? 'sandbox' : 'produccion')}
              options={[{ value: 'produccion', label: 'Producción (guías reales)' }, { value: 'sandbox', label: 'Pruebas (sandbox)' }]} />
          </div>
          <div>
            <div style={lbl}>Client ID</div>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" style={inputStyle} autoComplete="off" />
          </div>
          <div>
            <div style={lbl}>Client Secret</div>
            <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder={conectada ? 'Déjalo vacío para no cambiarlo' : 'Client Secret'} style={inputStyle} autoComplete="new-password" />
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>¿Desde dónde envías?</div>
        <div style={grid2}>
          <div><div style={lbl}>Nombre de quien envía *</div><input {...o('nombre')} maxLength={30} style={inputStyle} /></div>
          <div><div style={lbl}>Empresa o tienda</div><input {...o('empresa')} maxLength={60} style={inputStyle} /></div>
          <div><div style={lbl}>Celular *</div><input {...o('telefono')} inputMode="tel" style={inputStyle} /></div>
          <div><div style={lbl}>Correo *</div><input {...o('email')} type="email" style={inputStyle} /></div>
          <div><div style={lbl}>Dirección de recogida *</div><input {...o('direccion')} maxLength={100} style={inputStyle} /></div>
          <div><div style={lbl}>Referencia (barrio, local…)</div><input {...o('referencia')} maxLength={30} style={inputStyle} /></div>
          <div><div style={lbl}>Departamento</div><input {...o('departamento')} placeholder="Ej. Antioquia" style={inputStyle} /></div>
          <div><div style={lbl}>Ciudad / municipio *</div><input {...o('ciudad')} placeholder="Ej. Medellín" style={inputStyle} /></div>
          <div><div style={lbl}>NIT o cédula (opcional)</div><input {...o('nit')} style={inputStyle} /></div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>Caja por defecto</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10 }}>
          <div><div style={lbl}>Largo (cm)</div><input {...p('largo')} style={inputStyle} /></div>
          <div><div style={lbl}>Ancho (cm)</div><input {...p('ancho')} style={inputStyle} /></div>
          <div><div style={lbl}>Alto (cm)</div><input {...p('alto')} style={inputStyle} /></div>
          <div><div style={lbl}>Peso (kg)</div><input {...p('peso')} style={inputStyle} /></div>
        </div>
        <div><div style={lbl}>¿Qué contiene? (sale en la guía)</div><input value={paquete.contenido} onChange={(e) => setPaquete((x) => ({ ...x, contenido: e.target.value }))} maxLength={60} style={inputStyle} /></div>

        {conectada && est?.webhookUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Para que los estados lleguen al instante, pega esta URL en <b>Skydropx → Conexiones → Webhooks</b> (si no, igual se consultan cada pocos minutos):</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px dashed var(--df-purple-border)', background: 'var(--df-purple-subtle)', borderRadius: 10, padding: '8px 10px' }}>
              <code style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--df-purple)', overflowWrap: 'anywhere' }}>{est.webhookUrl}</code>
              <button onClick={copiar} style={{ ...btnPrimary, padding: '6px 12px', minHeight: 32, fontSize: 12 }}>{copiada ? '✓ Copiada' : 'Copiar'}</button>
            </div>
          </div>
        )}

        {msg &&<div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => void guardar()} disabled={guardando || !listo} style={{ ...btnPrimary, opacity: guardando || !listo ? 0.6 : 1 }}>{guardando ? 'Conectando…' : conectada ? 'Guardar cambios' : 'Conectar y probar'}</button>
          {!listo && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Completa las credenciales y los campos con *</span>}
          {conectada && <button onClick={() => void desconectar()} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--df-danger)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Desconectar</button>}
        </div>

        {conectada && <BodegasProveedores />}
        {conectada && <SkydropxProductos />}
      </div>
    </IntegracionFila>
  );
}
