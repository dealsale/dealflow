import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };

const GRUPOS: { id: string; titulo: string; sub: string }[] = [
  { id: 'ia', titulo: 'Inteligencia artificial', sub: 'El cerebro de tu asistente. Cada tienda pone sus llaves y paga solo lo que consume.' },
  { id: 'canales', titulo: 'Canales', sub: 'Por dónde atiende y vende tu asistente.' },
  { id: 'envios', titulo: 'Envíos', sub: 'Genera guías y sigue el estado de tus pedidos.' },
  // Publicidad (anuncios) retirada temporalmente: por ahora la integración de Meta es solo WhatsApp.
];

/** Punto + etiqueta de estado (conectada / sin conectar). */
function Estado({ on }: { on: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: on ? 'var(--df-brand-dark)' : 'var(--df-text-faint)', background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface-2)', borderRadius: 999, padding: '3px 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? 'var(--df-brand-mid)' : 'var(--df-border-strong)' }} />
      {on ? 'Conectada' : 'Sin conectar'}
    </span>
  );
}

/** Conexión de Dropi por su API directa (token de integración + URL). Con esto
 *  DealFlow cotiza transportadoras y crea el pedido en Dropi sin usar WooCommerce. */
function DropiApiCard({ df }: { df: DealFlowState }) {
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setUrl(df.dropiIntegrationUrl || ''); }, [df.dropiIntegrationUrl]);
  const conectada = df.dropiConectado;
  const guardar = () => {
    if (!token.trim() || !url.trim()) return;
    setGuardando(true);
    df.conectarDropi(token.trim(), url.trim(), (ok) => { setGuardando(false); if (ok) { setAbierto(false); setToken(''); } });
  };
  return (
    <div style={{ background: 'var(--df-surface)', border: `1px solid ${conectada ? 'var(--df-brand)' : 'var(--df-border)'}`, borderRadius: 14, padding: 18, marginTop: 4, marginBottom: 14, maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>Dr</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Dropi (API directa)</div>
        <div style={{ flex: 1 }} />
        <Estado on={conectada} />
      </div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 13, lineHeight: 1.5, margin: '8px 0 12px' }}>
        Conecta Dropi con su API para <b>cotizar transportadoras</b>, crear el pedido eligiendo transportadora y traer la <b>guía</b>. El token se genera en <b>Dropi → Mis Integraciones</b> (tipo WooCommerce). Con esto, Dropi ya no necesita WooCommerce.
      </div>
      {conectada && !abierto && (
        <div style={{ fontSize: 12.5, color: 'var(--df-brand-dark)', marginBottom: 10 }}>✓ Conectado · URL: <b>{df.dropiIntegrationUrl}</b> · transportadora: <b>{
          df.dropiPreferencia === 'operador' ? 'la elige el operador' : df.dropiPreferencia === 'cheapest' ? 'la más barata' : df.dropiPreferencia === 'auto' ? 'Dropi decide' : 'una fija'
        }</b></div>
      )}
      {!abierto ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setAbierto(true)} style={{ background: conectada ? 'var(--df-surface)' : 'var(--df-warning)', color: conectada ? 'var(--df-warning)' : '#fff', border: conectada ? '1px solid var(--df-warning)' : 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{conectada ? 'Cambiar token' : 'Conectar Dropi'}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Token de integración (Dropi → Mis Integraciones)</div>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega aquí el token (JWT)" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>URL de integración (la que registraste en Dropi)</div>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mitienda.com" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Transportadora por defecto</div>
            <Dropdown ariaLabel="Preferencia de transportadora" value={df.dropiPreferencia} onChange={df.guardarDropiPreferencia}
              options={[
                { value: 'operador', label: 'La elige el operador (al enviar)' },
                { value: 'cheapest', label: 'La más barata' },
                { value: 'auto', label: 'Que Dropi decida' },
                { value: 'fixed', label: 'Una fija' },
              ]} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={guardar} disabled={guardando || !token.trim() || !url.trim()} style={{ background: 'var(--df-warning)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: guardando || !token.trim() || !url.trim() ? 0.6 : 1 }}>{guardando ? 'Conectando…' : 'Guardar y probar'}</button>
            <button onClick={() => { setAbierto(false); setToken(''); }} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-muted)', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
      {df.integracionMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: df.integracionMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.integracionMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.integracionMsg}</div>}
    </div>
  );
}

/** Tarjeta especial: Administrador de anuncios de Meta (se conecta con el popup de Facebook). */
function MetaAdsCard({ df, i }: { df: DealFlowState; i: DealFlowState['integrations'][number] }) {
  const ads = df.adsCuenta;
  const ops = df.adsOpciones;
  const [cuenta, setCuenta] = useState('');
  const [pagina, setPagina] = useState('');
  const conectada = !!ads?.conectada;

  return (
    <div style={cardBase(conectada)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={i.logoStyle}>{i.logoText}</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{i.nombre}</div>
        <div style={{ flex: 1 }} />
        <Estado on={conectada} />
      </div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>

      {conectada ? (
        <div style={{ background: 'var(--df-brand-subtle-3)', border: '1px solid var(--df-brand-border)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--df-brand-dark)' }}>
          ✓ {ads!.adAccountNombre}{ads!.pageNombre ? ` · página ${ads!.pageNombre}` : ''}
        </div>
      ) : ops ? (
        <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div>
            <div style={lbl}>Cuenta publicitaria</div>
            <Dropdown value={cuenta} onChange={setCuenta} placeholder="Elige una…"
              options={[{ value: '', label: 'Elige una…' }, ...ops.cuentas.map((a) => ({ value: a.id, label: `${a.nombre} (${a.moneda})` }))]} />
          </div>
          <div>
            <div style={lbl}>Página de Facebook</div>
            <Dropdown value={pagina} onChange={setPagina} placeholder="Elige una…"
              options={[{ value: '', label: 'Elige una…' }, ...ops.paginas.map((p) => ({ value: p.id, label: p.nombre }))]} />
          </div>
          <button
            onClick={() => {
              const a = ops.cuentas.find((x) => x.id === cuenta);
              const p = ops.paginas.find((x) => x.id === pagina);
              df.elegirCuentaAds({ adAccountId: cuenta, adAccountNombre: a?.nombre || '', moneda: a?.moneda || '', pageId: pagina, pageNombre: p?.nombre || '' });
            }}
            disabled={!cuenta}
            style={{ ...btnPrimary, opacity: cuenta ? 1 : 0.6, alignSelf: 'flex-start' }}
          >
            Guardar conexión
          </button>
        </div>
      ) : null}

      {df.mkError && !conectada && <div style={{ color: 'var(--df-danger-dark)', fontSize: 12.5 }}>{df.mkError}</div>}

      {conectada ? (
        <button onClick={df.desconectarAds} style={btnGhostRed}>Desconectar</button>
      ) : (
        <button onClick={df.conectarAds} disabled={df.mkLoading} style={{ ...btnFacebook, opacity: df.mkLoading ? 0.7 : 1 }}>
          {df.mkLoading ? 'Conectando…' : 'Conectar con Facebook'}
        </button>
      )}
    </div>
  );
}

// (MetaCanalesCard — Messenger + Instagram — retirada temporalmente: por ahora
//  la integración de Meta es solo WhatsApp.)

const lbl: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 600, marginBottom: 4 };
const cardBase = (on: boolean): React.CSSProperties => ({ background: 'var(--df-surface)', border: '1px solid ' + (on ? 'var(--df-brand-border)' : 'var(--df-border)'), borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', gap: 10 });
const btnPrimary: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnFacebook: React.CSSProperties = { background: '#1877F2', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnGhostRed: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-danger-dark)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' };

export function Integraciones({ df }: { df: DealFlowState }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [predeterminada, setPredeterminada] = useState(false);

  // Al entrar cargamos el estado de la cuenta publicitaria (para la tarjeta de Meta Ads).
  const cargarAds = useRef(df.reloadCampanas);
  cargarAds.current = df.reloadCampanas;
  useEffect(() => { void cargarAds.current(); }, []);

  function abrir(id: string) {
    setAbierta(abierta === id ? null : id);
    setForm({});
    setPredeterminada(false);
  }

  return (
    <section data-screen-label="Integraciones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Integraciones</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 8px' }}>
        Conecta DealFlow con las herramientas que ya usas. Cada tienda pone sus propias claves y paga solo lo que consume.
      </p>
      <div style={{ background: 'var(--df-brand-subtle-3)', border: '1px solid #BBF7D0', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#166534', margin: '0 0 18px', lineHeight: 1.6 }}>
        🧠 <b>Tu asistente usa dos IA para ahorrar:</b> conecta <b>DeepSeek</b> (escribe los textos, más económico) y <b>OpenAI</b> (transcribe las notas de voz y entiende las imágenes de tus clientes). Con las dos, tu asistente lee, oye y ve.
      </div>
      {df.integracionMsg && (
        <div style={{ background: df.integracionMsg.startsWith('✓') ? 'var(--df-brand-subtle-2)' : 'var(--df-danger-subtle)', border: '1px solid ' + (df.integracionMsg.startsWith('✓') ? 'var(--df-brand-border)' : 'var(--df-danger-border)'), color: df.integracionMsg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {df.integracionMsg}
        </div>
      )}

      {GRUPOS.map((g) => {
        const items = df.integrations.filter((i) => (i.grupo || 'canales') === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} style={{ marginBottom: 26 }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>{g.titulo}</h2>
              <p style={{ color: 'var(--df-text-faint)', fontSize: 12.5, margin: '2px 0 0' }}>{g.sub}</p>
            </div>
            <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'start' }}>
              {items.map((i) => {
                if (i.especial === 'meta-ads') return <MetaAdsCard key={i.id} df={df} i={i} />;
                const abiertaEsta = abierta === i.id;
                const configurada = !!df.integracionesCfg[i.id];
                const conectado = i.id === 'wa' ? df.waConnected : configurada;
                const esAgente = i.esIA && df.iaPredeterminada === i.id;
                return (
                  <div key={i.id} style={cardBase(abiertaEsta || conectado)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={i.logoStyle}>{i.logoText}</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{i.nombre}</div>
                      <div style={{ flex: 1 }} />
                      {esAgente && <span title="Este es el agente que responde tus chats" style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 7px' }}>🤖 Agente</span>}
                      <Estado on={conectado} />
                    </div>
                    <div style={{ color: 'var(--df-text-muted)', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>

                    {abiertaEsta && i.campos && (
                      <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {configurada && (
                          <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>
                            Guardado: {Object.entries(df.integracionesCfg[i.id]).map(([k, v]) => `${k} ${v}`).join(' · ')}
                          </div>
                        )}
                        {i.campos.map((c) => (
                          <div key={c.key}>
                            <div style={lbl}>{c.label}</div>
                            <input
                              className="df-input"
                              type={c.secreto ? 'password' : 'text'}
                              value={form[c.key] || ''}
                              onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                              placeholder={c.placeholder || ''}
                              style={inputStyle}
                            />
                          </div>
                        ))}
                        {i.esIA && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--df-text-body)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={predeterminada} onChange={(e) => setPredeterminada(e.target.checked)} />
                            Usar como agente predeterminado (responde los chats)
                          </label>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { df.guardarIntegracion(i.id, form, predeterminada); setAbierta(null); }} style={btnPrimary}>Guardar</button>
                          {i.esIA && configurada && !esAgente && (
                            <button onClick={() => df.elegirIaPredeterminada(i.id)} style={{ background: 'var(--df-surface)', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Hacer agente</button>
                          )}
                          {configurada && (
                            <button onClick={() => { df.eliminarIntegracion(i.id); setAbierta(null); }} style={{ background: 'var(--df-surface)', color: 'var(--df-danger-dark)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Desconectar</button>
                          )}
                          <button onClick={() => setAbierta(null)} style={{ background: 'transparent', color: 'var(--df-text-muted)', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Cancelar</button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => (i.campos ? abrir(i.id) : i.action())}
                        style={conectado && !abiertaEsta
                          ? { background: 'var(--df-surface)', color: 'var(--df-text-strong)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
                          : btnPrimary}
                      >
                        {abiertaEsta ? 'Cerrar' : i.id === 'wa' ? 'Ir a WhatsApp' : conectado ? 'Configurar' : 'Conectar'}
                      </button>
                      {i.especial === 'woo' && conectado && !abiertaEsta && (
                        <>
                          <button onClick={() => df.verificarWoo(i.id.replace('woocommerce_', ''))} style={{ background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Probar conexión</button>
                          <button onClick={() => df.sincronizarProductosWoo(i.id.replace('woocommerce_', ''))} style={{ background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Enviar productos →</button>
                          <button onClick={() => df.sincronizarInventarioWoo(i.id.replace('woocommerce_', ''))} style={{ background: 'var(--df-surface)', color: 'var(--df-purple)', border: '1px solid var(--df-purple-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Traer inventario</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Dropi por API directa (transportadoras + guía sin usar WooCommerce). */}
      <DropiApiCard df={df} />

      {/* Despacho: manual por defecto; se puede activar el auto-envío y elegir transportadora. */}
      {df.wooProveedores.length > 0 && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18, marginTop: 4, maxWidth: 620 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Envío de pedidos</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, margin: '4px 0 14px' }}>
            Por defecto los pedidos se envían <b>a mano</b> desde el detalle de cada pedido (así revisas antes de despachar). Si prefieres, actívalo para que se envíen solos al confirmarse.
          </div>

          {/* Switch de auto-envío */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: df.wooAuto ? 14 : 0 }}>
            <span
              onClick={() => df.guardarDespacho({ auto: !df.wooAuto })}
              style={{ width: 42, height: 24, borderRadius: 999, background: df.wooAuto ? 'var(--df-brand)' : 'var(--df-border)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}
            >
              <span style={{ position: 'absolute', top: 2, left: df.wooAuto ? 20 : 2, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Enviar pedidos automáticamente al confirmarse</span>
          </label>

          {df.wooAuto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ maxWidth: 340 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 }}>Enviar por</div>
                <Dropdown
                  ariaLabel="Proveedor de despacho automático"
                  value={df.wooPreferido}
                  onChange={(v) => df.guardarDespacho({ proveedor: v })}
                  options={[
                    { value: '', label: df.wooProveedores.length === 1 ? `${df.wooProveedores[0] === 'effi' ? 'Effi' : 'Dropi'} (el único conectado)` : 'Elige un proveedor…' },
                    ...(df.wooProveedores.includes('effi') ? [{ value: 'effi', label: 'Effi' }] : []),
                    ...(df.wooProveedores.includes('dropi') ? [{ value: 'dropi', label: 'Dropi' }] : []),
                  ]}
                />
              </div>
              <div style={{ maxWidth: 340 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 }}>Transportadora por defecto</div>
                <Dropdown
                  ariaLabel="Transportadora por defecto"
                  value={df.wooTransportadora}
                  onChange={(v) => df.guardarDespacho({ transportadora: v })}
                  options={[{ value: '', label: 'Sin especificar' }, ...df.wooTransportadoras.map((t) => ({ value: t, label: t }))]}
                />
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 6 }}>Se anota en el pedido para que Dropi la vea. La transportadora final se confirma en el panel de Dropi.</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle-3)', border: '1px solid var(--df-brand-border)', borderRadius: 8, padding: '8px 11px' }}>
                ✓ Los pedidos nuevos se enviarán solos a <b>{df.wooPreferido === 'effi' ? 'Effi' : df.wooPreferido === 'dropi' ? 'Dropi' : (df.wooProveedores[0] === 'effi' ? 'Effi' : 'Dropi')}</b>{df.wooTransportadora ? <> por <b>{df.wooTransportadora}</b></> : ''}.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
