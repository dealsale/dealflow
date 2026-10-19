import { Dropdown } from './Dropdown';
import { useEffect, useMemo, useState } from 'react';
import { EffiProductos } from './EffiProductos';
import type { DealFlowState } from '../hooks/useDealFlowState';
import {
  apiEffiApiConectar, apiEffiApiConfig, apiEffiApiDesconectar, apiEffiApiEventos, apiEffiApiListas,
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
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[] | null>(null);
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

  const conectar = async () => {
    setCargando(true); setMsg('Verificando la API key con Effi…');
    const r = await apiEffiApiConectar(apiKey.trim());
    setCargando(false);
    if (r.error) { setMsg(r.error); return; }
    setApiKey(''); setMsg('✓ Effi conectado. Ahora elige de dónde salen tus remisiones.'); setAbierta(true);
    await df.cargarEffiApi();
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
    if (r.data.convenios.length === 1 && !cfg.convenioDropshipping) set({ convenioDropshipping: r.data.convenios[0].id });
  };
  const cargarEventos = async () => {
    setVerEventos((v) => !v);
    const r = await apiEffiApiEventos();
    if (r.data) setEventos(r.data.eventos);
  };


  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid ' + (est.listo ? 'var(--df-purple-border)' : 'var(--df-border)'), borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: '#fff', border: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5, boxSizing: 'border-box' }}>
          <img src="/logos/effi.png" alt="Effi" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Effi · conexión directa (API)</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5 }}>Crea el cliente y la remisión de venta en Effi, con la guía si quieres, y recibe los estados por webhook.</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: est.listo ? 'var(--df-purple-subtle)' : est.conectado ? 'var(--df-warning-subtle)' : 'var(--df-surface-2)', color: est.listo ? 'var(--df-purple)' : est.conectado ? 'var(--df-warning)' : 'var(--df-text-muted)' }}>
          {est.listo ? '● Listo para despachar' : est.conectado ? '● Falta configurar' : 'Sin conectar'}
        </span>
        {est.conectado && <button onClick={() => setAbierta((v) => !v)} style={btnSec}>{abierta ? 'Cerrar' : 'Configurar'}</button>}
      </div>

      {!est.conectado && (
        <div style={{ marginTop: 16 }}>
          <p style={ayuda}>En Effi ve a <b>Administración → Usuarios del sistema → Ver más detalles</b> del usuario que usará DealFlow y copia su <b>API key</b>. Ese usuario necesita permisos de clientes, artículos, remisiones de venta y guías.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key de Effi (32 a 40 caracteres)" style={{ ...inp, flex: 1, minWidth: 240, fontFamily: "'JetBrains Mono',monospace" }} />
            <button onClick={conectar} disabled={cargando || apiKey.trim().length < 32} style={{ ...btn, opacity: cargando || apiKey.trim().length < 32 ? 0.6 : 1 }}>Conectar Effi</button>
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}

      {est.conectado && abierta && (
        <div className="df-expand" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
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
                  <p style={{ ...ayuda, margin: '0 0 10px' }}>Si vendes artículos de un <b>proveedor dropshipping</b> en Effi, la remisión debe llevar el convenio: así Effi <b>no exige stock en tu bodega</b> (lo despacha el proveedor). DealFlow lo usa solo con los artículos vinculados a un proveedor; los tuyos siguen como mercancía propia.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={cfg.convenioDropshipping || ''} onChange={(e) => set({ convenioDropshipping: e.target.value.replace(/\D/g, '') })} placeholder="Código del convenio (ej: 12)" style={{ ...inp, width: 200, flex: '0 0 auto' }} />
                    <button onClick={detectarConvenios} disabled={buscandoConv} style={btnSec}>{buscandoConv ? 'Buscando…' : '🔍 Detectar en Effi'}</button>
                  </div>
                  {convenios && (
                    <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--df-text-muted)' }}>
                      {convenios.length === 0
                        ? 'No encontramos remisiones con convenio en tu Effi. Búscalo en Effi → Dropshipping → Convenios y escribe su código.'
                        : <>Encontrados: {convenios.map((c) => (
                          <button key={c.id} onClick={() => set({ convenioDropshipping: c.id })} style={{ ...btnSec, padding: '3px 9px', fontSize: 12, marginLeft: 6, borderColor: cfg.convenioDropshipping === c.id ? 'var(--df-purple)' : undefined }}>{c.nombre} · {c.id}</button>
                        ))}</>}
                    </div>
                  )}
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

              {/* 3. Productos */}
              <div style={seccion}>
                <div style={titulo}>3 · Productos ↔ artículos de Effi</div>
                <EffiProductos onMsg={setMsg} />
              </div>

              {/* 4. Webhooks */}
              <div style={seccion}>
                <div style={titulo}>4 · Webhooks (avisos de Effi a DealFlow)</div>
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
  );
}
