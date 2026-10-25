import { Dropdown } from './Dropdown';
import { useEffect, useMemo, useState } from 'react';
import { IntegracionFila, LogoInteg } from './IntegracionFila';
import type { DealFlowState } from '../hooks/useDealFlowState';
import {
  apiEffiApiConectar, apiEffiAutoconfigurar, apiEffiApiConfig, apiEffiApiDesconectar, apiEffiApiEventos, apiEffiApiListas,
  apiEffiApiSecreto, apiEffiConvenios,
  type EffiApiEstado, type EffiEvento, type EffiGuiaCfg, type EffiListas,
} from '../lib/api';

/**
 * Effi por API directa: la tienda pega la API key de su usuario de Effi, elige
 * de qué sucursal/bodega salen las remisiones y con qué forma de pago, vincula
 * sus productos con los artículos de Effi y registra los webhooks.
 */

// Eventos de Effi que conviene registrar (cada uno es un webhook con la misma URL).
const EVENTOS_RECOMENDADOS = [
  'Creación de Remisión de venta',
  'Anulación de Remisión de venta',
  'Creación de Guía de transporte',
  'Modificación de Guía de transporte',
  'Cambio de estado de Guía de transporte',
  'Creación de Novedad de guía de transporte',
];

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { display: 'block', color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 700, marginBottom: 5 };
const btn: React.CSSProperties = { background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnSec: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };
const seccion: React.CSSProperties = { borderTop: '1px solid var(--df-border)', paddingTop: 16, marginTop: 4 };
const titulo: React.CSSProperties = { fontWeight: 800, fontSize: 13.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 };
const ayuda: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' };

function Select({ label, value, onChange, opciones, vacio = 'Selecciona…' }: { label: string; value: string; onChange: (v: string) => void; opciones: { id: string; nombre: string }[]; vacio?: string }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <Dropdown value={value} onChange={onChange} ariaLabel={label} placeholder={vacio} options={[{ value: '', label: vacio }, ...opciones.map((o) => ({ value: o.id, label: o.nombre || `#${o.id}` }))]} />
    </div>
  );
}

export function EffiApiCard({ df }: { df: DealFlowState }) {
  const est = df.effiApi;
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listas, setListas] = useState<EffiListas | null>(null);
  const [cfg, setCfg] = useState<EffiApiEstado>({ conectado: false });
  const [secreto, setSecreto] = useState('');
  const [eventos, setEventos] = useState<EffiEvento[]>([]);
  const [verEventos, setVerEventos] = useState(false);
  const [copiado, setCopiado] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [convenios, setConvenios] = useState<{ id: string; nombre: string; manual?: boolean }[] | null>(null);
  const [nuevoConv, setNuevoConv] = useState({ id: '', nombre: '' });
  const [buscandoConv, setBuscandoConv] = useState(false);

  useEffect(() => { void df.cargarEffiApi(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCfg(est); }, [est]);
  useEffect(() => {
    if (!est.conectado || !abierta || listas) return;
    void apiEffiApiListas().then((r) => { if (r.data) setListas(r.data); else setMsg(r.error || 'No pudimos leer tu configuración de Effi.'); });
  }, [est.conectado, abierta]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<EffiApiEstado>) => setCfg((c) => ({ ...c, ...patch }));
  const guia: EffiGuiaCfg = { activa: false, transportadora: '', servicio: '', formaPagoFlete: '', remitente: '', peso: 1, volumen: 1, alto: 10, ancho: 10, largo: 10, ...(cfg.guia || {}) };
  const setGuia = (patch: Partial<EffiGuiaCfg>) => set({ guia: { ...guia, ...patch } });
  const transp = listas?.transportadoras.find((t) => t.id === guia.transportadora);
  const bodegas = useMemo(() => (listas?.bodegas || []).filter((b) => !cfg.sucursal || b.sucursal === cfg.sucursal), [listas, cfg.sucursal]);
  const forma = listas?.formasPago.find((f) => f.id === cfg.formaPago);
  const copiar = (t: string, q: string) => { void navigator.clipboard?.writeText(t); setCopiado(q); setTimeout(() => setCopiado(''), 1500); };

  // Conexión automática: se corren los pasos uno por uno y se ven avanzar.
  type EstadoPaso = 'espera' | 'corriendo' | 'ok' | 'aviso';
  const PASOS_AUTO: { id: 'config' | 'convenios' | 'productos'; titulo: string; icono: string }[] = [
    { id: 'config', titulo: 'Configurando de dónde salen tus remisiones', icono: '🏬' },
    { id: 'convenios', titulo: 'Buscando tus convenios dropshipping', icono: '🤝' },
    { id: 'productos', titulo: 'Conectando tus productos y su stock', icono: '📦' },
  ];
  const [auto, setAuto] = useState<Record<string, { estado: EstadoPaso; detalle: string }> | null>(null);
  const autoconfigurar = async () => {
    const st: Record<string, { estado: EstadoPaso; detalle: string }> = Object.fromEntries(PASOS_AUTO.map((p) => [p.id, { estado: 'espera' as EstadoPaso, detalle: '' }]));
    setAuto({ ...st });
    for (const p of PASOS_AUTO) {
      st[p.id] = { estado: 'corriendo', detalle: '' }; setAuto({ ...st });
      const r = await apiEffiAutoconfigurar(p.id);
      st[p.id] = { estado: r.data?.ok ? 'ok' : 'aviso', detalle: r.data?.detalle || r.error || 'No se pudo completar.' }; setAuto({ ...st });
    }
    void apiEffiApiListas().then((r) => { if (r.data) setListas(r.data); }); // recarga las listas
    await df.cargarEffiApi();
    setMsg('✓ Listo. Revisa abajo lo que elegimos y cámbialo si quieres.');
  };
  const sincronizarYa = async () => {
    setCargando(true); setMsg('Leyendo tus artículos de Effi y vinculando…');
    const r = await apiEffiAutoconfigurar('productos');
    setCargando(false);
    setMsg(r.data ? `${r.data.ok ? '✓ ' : ''}${r.data.detalle}` : r.error || 'No se pudo.');
  };
  const conectar = async () => {
    setCargando(true); setMsg('Verificando la API key con Effi…');
    const r = await apiEffiApiConectar(apiKey.trim());
    setCargando(false);
    if (r.error) { setMsg(r.error); return; }
    setApiKey(''); setMsg(''); setAbierta(true);
    await df.cargarEffiApi();
    await autoconfigurar();
  };
  const guardar = async () => {
    setCargando(true); setMsg('Guardando…');
    const r = await apiEffiApiConfig({ ...cfg, formaPagoContado: !!forma?.contado });
    setCargando(false);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo guardar.'); return; }
    setMsg(r.data.listo ? '✓ Configuración guardada. Ya puedes despachar pedidos a Effi.' : 'Guardado. Falta elegir sucursal, bodega, centro de costos y forma de pago.');
    await df.cargarEffiApi();
  };
  const guardarSecreto = async () => {
    const r = await apiEffiApiSecreto(secreto.trim());
    if (r.error) { setMsg(r.error); return; }
    setSecreto(''); setMsg(`✓ Secreto guardado (${r.data?.secretos || 1} en total). Los avisos de Effi se verifican con ellos.`);
    await df.cargarEffiApi();
  };
  const desconectar = async () => {
    if (!confirm('¿Desconectar Effi? Los pedidos ya enviados conservan su remisión.')) return;
    await apiEffiApiDesconectar();
    setListas(null); setMsg('Effi desconectado.');
    await df.cargarEffiApi();
  };
  // Busca en Effi los convenios dropshipping que la tienda ya usó (no hay listado en la API).
  const detectarConvenios = async () => {
    setBuscandoConv(true);
    const r = await apiEffiConvenios();
    setBuscandoConv(false);
    if (r.error || !r.data) { setMsg(r.error || 'No pudimos consultar los convenios.'); return; }
    setConvenios(r.data.convenios);
    // Los detectados quedan guardados en el servidor (aparecen al despachar y en cada producto).
    setCfg((c) => ({ ...c, convenios: [...(c.convenios || []), ...r.data!.convenios.filter((x) => !(c.convenios || []).some((g) => g.id === x.id)).map(({ id, nombre }) => ({ id, nombre }))] }));
    if (r.data.convenios.length === 1 && !cfg.convenioDropshipping) set({ convenioDropshipping: r.data.convenios[0].id });
    setMsg(`✓ ${r.data.convenios.length} convenio${r.data.convenios.length === 1 ? '' : 's'} encontrados y guardados.`);
  };
  const cargarEventos = async () => {
    setVerEventos((v) => !v);
    const r = await apiEffiApiEventos();
    if (r.data) setEventos(r.data.eventos);
  };


  return (
    <IntegracionFila
      logo={<LogoInteg src="/logos/effi.png" alt="Effi" />}
      nombre="Effi"
      desc="Crea el cliente y la remisión de venta en Effi (con la guía si quieres) y recibe los estados por webhook."
      estado={est.listo ? 'on' : est.conectado ? 'pendiente' : 'off'}
      estadoTexto={est.listo ? 'Listo para despachar' : undefined}
      abierta={abierta}
      onToggle={() => setAbierta((v) => !v)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {!est.conectado && (
        <div>
          <p style={ayuda}>En Effi ve a <b>Administración → Usuarios del sistema → Ver más detalles</b> del usuario que usará DealFlow y copia su <b>API key</b>. Ese usuario necesita permisos de clientes, artículos, remisiones de venta y guías.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key de Effi (32 a 40 caracteres)" style={{ ...inp, flex: 1, minWidth: 240, fontFamily: "'JetBrains Mono',monospace" }} />
            <button onClick={conectar} disabled={cargando || apiKey.trim().length < 32} style={{ ...btn, opacity: cargando || apiKey.trim().length < 32 ? 0.6 : 1 }}>Conectar Effi</button>
          </div>
        </div>
      )}

      {auto && (
        <div style={{ border: '1px solid var(--df-purple-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--df-purple-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <style>{`@keyframes dfAutoGira { to { transform: rotate(360deg) } } @keyframes dfAutoEntra { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } } @keyframes dfAutoBarra { 0% { background-position: 0 0 } 100% { background-position: 40px 0 } }`}</style>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--df-purple)' }}>⚡ Conexión automática</div>
          {PASOS_AUTO.map((p, i) => {
            const e = auto[p.id];
            const ico = e.estado === 'corriendo' ? <span style={{ display: 'inline-block', animation: 'dfAutoGira .9s linear infinite' }}>⟳</span> : e.estado === 'ok' ? '✅' : e.estado === 'aviso' ? '⚠️' : '○';
            return (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: e.estado === 'espera' ? 0.5 : 1, animation: `dfAutoEntra .4s ${i * 0.08}s both` }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 15 }}>{ico}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.icono} {p.titulo}</div>
                  {e.estado === 'corriendo' && <div style={{ marginTop: 5, height: 4, borderRadius: 999, background: 'repeating-linear-gradient(90deg, var(--df-purple) 0 20px, transparent 20px 40px)', animation: 'dfAutoBarra .6s linear infinite', opacity: 0.6 }} />}
                  {e.detalle && <div style={{ fontSize: 12, color: e.estado === 'aviso' ? 'var(--df-warning)' : 'var(--df-text-muted)', marginTop: 2, lineHeight: 1.45 }}>{e.detalle}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}

      {est.conectado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void autoconfigurar()} disabled={!!auto && Object.values(auto).some((x) => x.estado === 'corriendo')} style={{ ...btn, background: 'linear-gradient(90deg, var(--df-purple), #6366F1)' }}>⚡ Configurar todo automático</button>
            <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Elige la configuración, detecta tus convenios y conecta tus productos con su stock. No cambia lo que ya elegiste.</span>
          </div>
          {!listas ? <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>Leyendo tu configuración de Effi…</div> : (
            <>
              {/* 1. Remisión */}
              <div>
                <div style={titulo}>1 · De dónde sale la remisión</div>
                <p style={ayuda}>Cada pedido se crea en Effi como <b>remisión de venta</b>. El cliente se registra con tipo de documento <b>Cédula</b> y su <b>celular</b> como número.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <Select label="Sucursal" value={cfg.sucursal || ''} onChange={(v) => set({ sucursal: v, bodega: '' })} opciones={listas.sucursales} />
                  <Select label="Bodega" value={cfg.bodega || ''} onChange={(v) => set({ bodega: v })} opciones={bodegas} />
                  <Select label="Centro de costos" value={cfg.centroCostos || ''} onChange={(v) => set({ centroCostos: v })} opciones={listas.centrosCostos} />
                  <Select label="Forma de pago (contra entrega)" value={cfg.formaPago || ''} onChange={(v) => set({ formaPago: v })} opciones={listas.formasPago.map((f) => ({ id: f.id, nombre: `${f.nombre} · ${f.contado ? 'contado' : 'crédito'}` }))} />
                  {forma?.contado && <Select label="Medio de pago" value={cfg.medioPago || ''} onChange={(v) => set({ medioPago: v })} opciones={listas.mediosPago} />}
                  {forma?.contado && <Select label="Caja" value={cfg.caja || ''} onChange={(v) => set({ caja: v })} opciones={listas.cajas} vacio="(si el medio es efectivo)" />}
                  {forma?.contado && <Select label="Cuenta bancaria" value={cfg.cuenta || ''} onChange={(v) => set({ cuenta: v })} opciones={listas.cuentas} vacio="(si el medio es banco)" />}
                  <div>
                    <label style={lbl}>Artículo flete (ID en Effi)</label>
                    <input value={cfg.articuloFlete || ''} onChange={(e) => set({ articuloFlete: e.target.value.replace(/\D/g, '') })} placeholder="Opcional: cobra el envío" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Días para la entrega</label>
                    <input type="number" min={0} value={cfg.diasEntrega ?? 3} onChange={(e) => set({ diasEntrega: Number(e.target.value) })} style={inp} />
                  </div>
                </div>
                {forma && !forma.contado && <p style={{ ...ayuda, margin: '10px 0 0' }}>Con forma de pago a <b>crédito</b> la remisión queda con saldo por cobrar, y ese saldo es el valor del recaudo de la guía.</p>}
                <div style={{ marginTop: 14, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Convenio dropshipping</div>
                  <p style={{ ...ayuda, margin: '0 0 10px' }}>Si vendes artículos de un <b>proveedor dropshipping</b> en Effi, la remisión debe llevar el convenio: así Effi <b>no exige stock en tu bodega</b> (lo despacha el proveedor). DealFlow elige <b>solo</b> el convenio de cada producto según sus ventas anteriores en Effi (y lo aprende de cada envío); el que pongas aquí se usa solo para productos de proveedor que todavía no tienen ventas. Los tuyos siguen como mercancía propia.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={cfg.convenioDropshipping || ''} onChange={(e) => set({ convenioDropshipping: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} placeholder="Código del convenio" style={{ ...inp, width: 200, flex: '0 0 auto' }} />
                    <button onClick={detectarConvenios} disabled={buscandoConv} style={btnSec}>{buscandoConv ? 'Buscando…' : '🔍 Detectar en Effi'}</button>
                  </div>
                  {(() => {
                    // Todos los convenios: los agregados a mano + los detectados en Effi (sin repetir).
                    const propios = cfg.convenios || [];
                    const todos = [...propios.map((c) => ({ ...c, manual: true })), ...(convenios || []).filter((c) => !propios.some((p) => p.id === c.id))];
                    // Los convenios se guardan AL INSTANTE (antes solo con "Guardar" y no llegaban al pedido).
                    const guardarConvenios = (convenios: { id: string; nombre: string }[], extra: Partial<EffiApiEstado> = {}) => {
                      set({ convenios, ...extra });
                      void apiEffiApiConfig({ convenios, ...extra }).then((r) => setMsg(r.error ? r.error : '✓ Convenios guardados.'));
                    };
                    const quitar = (id: string) => guardarConvenios(propios.filter((p) => p.id !== id), cfg.convenioDropshipping === id ? { convenioDropshipping: '' } : {});
                    const agregar = () => {
                      const id = nuevoConv.id.replace(/[^A-Za-z0-9_-]/g, '');
                      if (!id || propios.some((p) => p.id === id)) return;
                      guardarConvenios([...propios, { id, nombre: nuevoConv.nombre.trim() || `Convenio ${id}` }]);
                      setNuevoConv({ id: '', nombre: '' });
                    };
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Tus convenios {todos.length ? `(${todos.length})` : ''}</div>
                        {convenios && convenios.length === 0 && !propios.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 6 }}>No encontramos remisiones con convenio en tu Effi. Agrégalos abajo (los ves en Effi → Dropshipping → Convenios).</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {todos.map((c) => (
                            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${cfg.convenioDropshipping === c.id ? 'var(--df-purple)' : 'var(--df-border)'}`, borderRadius: 8, padding: '3px 4px 3px 9px', fontSize: 12, background: 'var(--df-surface)' }}>
                              <button onClick={() => guardarConvenios(propios.some((x) => x.id === c.id) ? propios : [...propios, { id: c.id, nombre: c.nombre }], { convenioDropshipping: c.id })} title="Usar por defecto para productos de proveedor sin ventas" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--df-text)' }}>{cfg.convenioDropshipping === c.id ? '★ ' : ''}{c.nombre} · <b>{c.id}</b></button>
                              {c.manual ? <button onClick={() => quitar(c.id)} title="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 13, padding: '0 3px' }}>×</button> : <span style={{ fontSize: 10.5, color: 'var(--df-text-faint)', padding: '0 4px' }}>detectado</span>}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          <input value={nuevoConv.nombre} onChange={(e) => setNuevoConv((v) => ({ ...v, nombre: e.target.value }))} placeholder="Nombre (ej. Proveedor Ana)" style={{ ...inp, width: 190, flex: '0 0 auto' }} />
                          <input value={nuevoConv.id} onChange={(e) => setNuevoConv((v) => ({ ...v, id: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') }))} onKeyDown={(e) => e.key === 'Enter' && agregar()} placeholder="Código del convenio" style={{ ...inp, width: 160, flex: '0 0 auto' }} />
                          <button onClick={agregar} disabled={!nuevoConv.id} style={{ ...btnSec, opacity: nuevoConv.id ? 1 : 0.6 }}>＋ Agregar convenio</button>
                        </div>
                        <p style={{ ...ayuda, margin: '6px 0 0', fontSize: 11.5 }}>Toca un convenio para dejarlo <b>por defecto</b> (★). Se guardan solos.</p>
                      </div>
                    );
                  })()}
                  <p style={{ ...ayuda, margin: '8px 0 0', fontSize: 11.5 }}>Si lo dejas vacío y el pedido trae artículos de proveedor, DealFlow intenta detectarlo solo la primera vez.</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!cfg.autoDespacho} onChange={(e) => set({ autoDespacho: e.target.checked })} />
                  <span><b>Enviar solo a Effi</b> cada pedido que cierre el bot, sin tocar ningún botón.</span>
                </label>
              </div>

              {/* 2. Guía */}
              <div style={seccion}>
                <div style={titulo}>
                  2 · Guía de transporte
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5, marginLeft: 'auto', cursor: 'pointer' }}>
                    <input type="checkbox" checked={guia.activa} onChange={(e) => setGuia({ activa: e.target.checked })} /> Crear la guía automáticamente
                  </label>
                </div>
                <p style={ayuda}>Si la activas, apenas se crea la remisión DealFlow también crea la guía con la transportadora que elijas, y le avisa la guía al cliente por WhatsApp. Si no, la generas tú dentro de Effi.</p>
                {guia.activa && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                    <Select label="Transportadora" value={guia.transportadora} onChange={(v) => setGuia({ transportadora: v, servicio: '', formaPagoFlete: '' })} opciones={listas.transportadoras.map((t) => ({ id: t.id, nombre: t.effi ? `${t.nombre} (Effi: ${t.effi})` : t.nombre }))} />
                    <Select label="Servicio" value={guia.servicio} onChange={(v) => setGuia({ servicio: v })} opciones={transp?.servicios || []} />
                    <Select label="Pago del flete" value={guia.formaPagoFlete} onChange={(v) => setGuia({ formaPagoFlete: v })} opciones={transp?.formasPago || []} />
                    <Select label="Remitente" value={guia.remitente} onChange={(v) => setGuia({ remitente: v })} opciones={listas.remitentes} />
                    <div><label style={lbl}>Peso (kg)</label><input type="number" min={0.1} step={0.1} value={guia.peso} onChange={(e) => setGuia({ peso: Number(e.target.value) })} style={inp} /></div>
                    <div><label style={lbl}>Peso volumétrico (kg)</label><input type="number" min={0.1} step={0.1} value={guia.volumen} onChange={(e) => setGuia({ volumen: Number(e.target.value) })} style={inp} /></div>
                    <div><label style={lbl}>Alto × ancho × largo (cm)</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['alto', 'ancho', 'largo'] as const).map((k) => <input key={k} type="number" min={1} value={guia[k]} onChange={(e) => setGuia({ [k]: Number(e.target.value) })} style={{ ...inp, padding: '9px 6px' }} />)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={guardar} disabled={cargando} style={btn}>Guardar configuración</button>
              </div>

              {/* Novedades de envío */}
              <div style={seccion}>
                <div style={titulo}>⚠️ Novedades de envío</div>
                <p style={ayuda}>Cuando la transportadora no puede entregar (cliente ausente, dirección errada…), DealFlow lo detecta en Effi, pone el pedido en <b>Novedad</b> y te lo muestra en Pedidos.</p>
                {([
                  ['avisarCliente', 'Avisarle al cliente por WhatsApp', 'Si pasaron más de 24 h desde su último mensaje, va con la plantilla aprobada «novedad_envio_pedido».'],
                  ['botGestiona', 'Que el asistente resuelva la novedad con el cliente', 'Le pregunta si se lo vuelven a llevar, a qué dirección y qué día, y deja la solución lista.'],
                  ['autoEnviar', 'Enviar la solución a Effi automáticamente', 'Si lo apagas, la solución queda lista en el pedido y tú la confirmas con un botón.'],
                ] as const).map(([k, t, d]) => {
                  const nv = cfg.novedades || { avisarCliente: true, botGestiona: true, autoEnviar: false };
                  return (
                    <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 8, fontSize: 13, cursor: 'pointer', opacity: k === 'autoEnviar' && !nv.botGestiona ? 0.5 : 1 }}>
                      <input type="checkbox" style={{ marginTop: 3 }} checked={!!nv[k]} disabled={k === 'autoEnviar' && !nv.botGestiona} onChange={(e) => set({ novedades: { ...nv, [k]: e.target.checked } })} />
                      <span><b>{t}</b><br /><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{d}</span></span>
                    </label>
                  );
                })}
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '-4px 0 14px', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" style={{ marginTop: 3 }} checked={!!cfg.devolucionAuto} onChange={(e) => set({ devolucionAuto: e.target.checked })} />
                <span><b>Registrar la devolución en Effi automáticamente</b><br /><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Cuando un pedido quede «Devuelto», DealFlow crea la devolución de venta y la mercancía vuelve a tu bodega. Si lo apagas, lo haces con un botón dentro del pedido.</span></span>
              </label>

              {/* 3. Productos: el vínculo se hace en cada producto (Productos → Variantes). */}
              <div style={seccion}>
                <div style={titulo}>3 · Productos</div>
                <div style={{ display: 'flex', gap: 6, margin: '4px 0 10px', flexWrap: 'wrap' }}>
                  {([[true, '✋ Manual (recomendado)'], [false, '⚡ Automático']] as [boolean, string][]).map(([v, t]) => (
                    <button key={t} onClick={() => set({ vinculoManual: v })} style={{ ...btnSec, background: (cfg.vinculoManual !== false) === v ? 'var(--df-purple)' : 'var(--df-surface)', color: (cfg.vinculoManual !== false) === v ? '#fff' : 'var(--df-text-body)', borderColor: (cfg.vinculoManual !== false) === v ? 'var(--df-purple)' : 'var(--df-border)' }}>{t}</button>
                  ))}
                </div>
                {cfg.vinculoManual !== false
                  ? <p style={ayuda}><b>Manual:</b> cada variante se despacha EXACTAMENTE con el artículo de Effi que tú le pongas (por su <b>ID</b> o buscándolo), en <b>Productos → el producto → Variantes → Vínculo con Effi</b>. DealFlow nunca lo cambia ni lo busca solo. El stock sí llega de Effi cada 30 min.</p>
                  : <p style={ayuda}><b>Automático:</b> DealFlow vincula solo por nombre y variante, y si un artículo propio no tiene stock usa el del proveedor. Úsalo solo si cada variante tiene un único artículo en Effi.</p>}
                <button onClick={() => void sincronizarYa()} disabled={cargando} style={btnSec}>{cfg.vinculoManual !== false ? '↻ Traer catálogo y stock de Effi ahora' : '↻ Volver a vincular y traer stock ahora'}</button>
              </div>

              {/* 4. Webhooks */}
              <div style={seccion}>
                <div style={titulo}>4 · Webhooks <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--df-text-faint)' }}>(opcional)</span></div>
                <p style={{ ...ayuda, background: 'var(--df-purple-subtle)', borderRadius: 8, padding: '8px 10px', color: 'var(--df-text-body)' }}>✓ <b>No necesitas crearlos.</b> DealFlow consulta a Effi solo: el estado de tus guías y las novedades cada 4 min, y el registro de todas tus guías cada 20 min. Effi no deja que otra app cree webhooks por ti; si los creas tú, los cambios llegan <b>al instante</b> en vez de cada pocos minutos.</p>
                <p style={ayuda}>En Effi ve a <b>Integraciones → Webhooks → Crear webhook</b> y crea uno por cada evento de la lista con esta misma URL (usa <b>Duplicar</b>). Plataforma destino: <b>Otra</b>. Cada webhook trae su propio <b>secreto</b>, que Effi muestra una sola vez al crearlo: pega aquí el de cada uno.</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <code style={{ flex: 1, minWidth: 0, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontSize: 12, wordBreak: 'break-all' }}>{est.webhookUrl}</code>
                  <button onClick={() => copiar(est.webhookUrl || '', 'url')} style={btnSec}>{copiado === 'url' ? '✓ Copiada' : 'Copiar'}</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {EVENTOS_RECOMENDADOS.map((e) => <span key={e} style={{ fontSize: 11.5, fontWeight: 600, background: 'var(--df-purple-subtle)', color: 'var(--df-purple)', borderRadius: 999, padding: '4px 10px' }}>{e}</span>)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={secreto} onChange={(e) => setSecreto(e.target.value)} placeholder={est.webhookSecretos ? `${est.webhookSecretos} secreto(s) guardado(s) ✓ · pega el de otro webhook` : 'Secreto del webhook (64 caracteres)'} style={{ ...inp, flex: 1, minWidth: 220, fontFamily: "'JetBrains Mono',monospace" }} />
                  <button onClick={guardarSecreto} disabled={secreto.trim().length < 32} style={{ ...btnSec, opacity: secreto.trim().length < 32 ? 0.6 : 1 }}>Guardar secreto</button>
                  <button onClick={cargarEventos} style={{ ...btnSec, border: 'none', color: 'var(--df-purple)', textDecoration: 'underline' }}>{verEventos ? 'Ocultar avisos' : 'Ver últimos avisos'}</button>
                </div>
                {verEventos && (
                  <div style={{ marginTop: 10, border: '1px solid var(--df-border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                    {eventos.length === 0 ? <div style={{ padding: 12, fontSize: 12.5, color: 'var(--df-text-muted)' }}>Todavía no ha llegado ningún aviso de Effi.</div> : eventos.map((e) => (
                      <div key={e.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--df-border)', fontSize: 12 }}>
                        <span style={{ color: 'var(--df-text-faint)', fontFamily: "'JetBrains Mono',monospace" }}>{e.created_at.slice(5, 16)}</span> · {e.resumen || e.evento}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...seccion, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--df-text-faint)', flex: 1 }}>API key ····{est.apiKeyFin} · vence cada 360 días: si Effi responde 401, renuévala en Effi y vuelve a conectar.</span>
                <button onClick={desconectar} style={{ ...btnSec, color: 'var(--df-danger)', borderColor: 'var(--df-danger-border)' }}>Desconectar</button>
              </div>
            </>
          )}
        </div>
      )}
      </div>
    </IntegracionFila>
  );
}
