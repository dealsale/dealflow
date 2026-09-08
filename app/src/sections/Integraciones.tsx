import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };

const GRUPOS: { id: string; titulo: string; sub: string }[] = [
  { id: 'ia', titulo: 'Inteligencia artificial', sub: 'El cerebro de tu asistente. Cada tienda pone sus llaves y paga solo lo que consume.' },
  { id: 'canales', titulo: 'Canales', sub: 'Por dónde atiende y vende tu asistente.' },
  { id: 'envios', titulo: 'Envíos', sub: 'Genera guías y sigue el estado de tus pedidos.' },
  { id: 'publicidad', titulo: 'Publicidad', sub: 'Conecta tu cuenta para publicar anuncios desde el Marketing IA.' },
];

/** Punto + etiqueta de estado (conectada / sin conectar). */
function Estado({ on }: { on: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: on ? '#047857' : '#94A3B8', background: on ? '#D1FAE5' : '#F1F5F9', borderRadius: 999, padding: '3px 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? '#10B981' : '#CBD5E1' }} />
      {on ? 'Conectada' : 'Sin conectar'}
    </span>
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
      <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>

      {conectada ? (
        <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#047857' }}>
          ✓ {ads!.adAccountNombre}{ads!.pageNombre ? ` · página ${ads!.pageNombre}` : ''}
        </div>
      ) : ops ? (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div>
            <div style={lbl}>Cuenta publicitaria</div>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Elige una…</option>
              {ops.cuentas.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.moneda})</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Página de Facebook</div>
            <select value={pagina} onChange={(e) => setPagina(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Elige una…</option>
              {ops.paginas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
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

      {df.mkError && !conectada && <div style={{ color: '#B91C1C', fontSize: 12.5 }}>{df.mkError}</div>}

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

const lbl: React.CSSProperties = { color: '#64748B', fontSize: 11.5, fontWeight: 600, marginBottom: 4 };
const cardBase = (on: boolean): React.CSSProperties => ({ background: '#fff', border: '1px solid ' + (on ? '#A7F3D0' : '#E2E8F0'), borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', gap: 10 });
const btnPrimary: React.CSSProperties = { background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnFacebook: React.CSSProperties = { background: '#1877F2', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnGhostRed: React.CSSProperties = { background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' };

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
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 8px' }}>
        Conecta DealFlow con las herramientas que ya usas. Cada tienda pone sus propias claves y paga solo lo que consume.
      </p>
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#166534', margin: '0 0 18px', lineHeight: 1.6 }}>
        🧠 <b>Tu asistente usa dos IA para ahorrar:</b> conecta <b>DeepSeek</b> (escribe los textos, más económico) y <b>OpenAI</b> (transcribe las notas de voz y entiende las imágenes de tus clientes). Con las dos, tu asistente lee, oye y ve.
      </div>
      {df.integracionMsg && (
        <div style={{ background: df.integracionMsg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (df.integracionMsg.startsWith('✓') ? '#A7F3D0' : '#FECACA'), color: df.integracionMsg.startsWith('✓') ? '#047857' : '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
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
              <p style={{ color: '#94A3B8', fontSize: 12.5, margin: '2px 0 0' }}>{g.sub}</p>
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
                      {esAgente && <span title="Este es el agente que responde tus chats" style={{ fontSize: 11, fontWeight: 800, color: '#047857', background: '#D1FAE5', borderRadius: 6, padding: '2px 7px' }}>🤖 Agente</span>}
                      <Estado on={conectado} />
                    </div>
                    <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>

                    {abiertaEsta && i.campos && (
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {configurada && (
                          <div style={{ fontSize: 12, color: '#64748B' }}>
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
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                            <input type="checkbox" checked={predeterminada} onChange={(e) => setPredeterminada(e.target.checked)} />
                            Usar como agente predeterminado (responde los chats)
                          </label>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { df.guardarIntegracion(i.id, form, predeterminada); setAbierta(null); }} style={btnPrimary}>Guardar</button>
                          {i.esIA && configurada && !esAgente && (
                            <button onClick={() => df.elegirIaPredeterminada(i.id)} style={{ background: '#fff', color: '#047857', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Hacer agente</button>
                          )}
                          {configurada && (
                            <button onClick={() => { df.eliminarIntegracion(i.id); setAbierta(null); }} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Desconectar</button>
                          )}
                          <button onClick={() => setAbierta(null)} style={{ background: 'transparent', color: '#64748B', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Cancelar</button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => (i.campos ? abrir(i.id) : i.action())}
                        style={conectado && !abiertaEsta
                          ? { background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
                          : btnPrimary}
                      >
                        {abiertaEsta ? 'Cerrar' : i.id === 'wa' ? 'Ir a WhatsApp' : conectado ? 'Configurar' : 'Conectar'}
                      </button>
                      {i.especial === 'woo' && conectado && !abiertaEsta && (
                        <>
                          <button onClick={df.verificarWoo} style={{ background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Probar conexión</button>
                          <button onClick={df.sincronizarInventarioWoo} style={{ background: '#fff', color: '#6D28D9', border: '1px solid #DDD6FE', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Sincronizar inventario</button>
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
    </section>
  );
}
