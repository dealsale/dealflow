import { useEffect, useRef } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { WA_NUMBER } from '../data';

const label: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };

function MethodTab({ active, onClick, titulo, sub }: { active: boolean; onClick: () => void; titulo: string; sub: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        cursor: 'pointer',
        border: '1px solid ' + (active ? '#059669' : '#E2E8F0'),
        background: active ? '#ECFDF5' : '#fff',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: active ? '#047857' : '#1E293B' }}>{titulo}</div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const SEMAFORO = {
  ok: { punto: '#10B981', fondo: '#ECFDF5', borde: '#A7F3D0', texto: '#047857' },
  aviso: { punto: '#F59E0B', fondo: '#FFFBEB', borde: '#FDE68A', texto: '#B45309' },
  problema: { punto: '#EF4444', fondo: '#FEF2F2', borde: '#FECACA', texto: '#B91C1C' },
  desconocido: { punto: '#94A3B8', fondo: '#F8FAFC', borde: '#E2E8F0', texto: '#475569' },
} as const;

const CALIDAD: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Media', RED: 'Baja' };
const LIMITE: Record<string, string> = {
  TIER_50: '50 clientes nuevos al día',
  TIER_250: '250 clientes nuevos al día',
  TIER_1K: '1.000 clientes nuevos al día',
  TIER_10K: '10.000 clientes nuevos al día',
  TIER_100K: '100.000 clientes nuevos al día',
  TIER_UNLIMITED: 'Sin límite',
};

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div style={{ color: '#64748B', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', marginTop: 3 }}>{valor}</div>
    </div>
  );
}

/** Semáforo del número + enlaces al panel de Meta (ahí ponen su método de pago). */
function EstadoNumeroCard({ df }: { df: DealFlowState }) {
  const est = df.waEstado;
  const c = SEMAFORO[est?.semaforo ?? 'desconocido'];
  const enlaces = est?.enlaces ?? [];

  return (
    <>
      <div style={{ ...card, background: c.fondo, borderColor: c.borde }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: c.punto, marginTop: 4, flexShrink: 0, boxShadow: `0 0 0 4px ${c.punto}22` }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: c.texto }}>
              {df.waEstadoCargando && !est ? 'Consultando a Meta…' : est?.disponible ? est.titulo : 'Estado del número'}
            </div>
            <div style={{ color: c.texto, fontSize: 13, marginTop: 3, lineHeight: 1.6, opacity: 0.9 }}>
              {est?.disponible
                ? est.semaforo === 'ok'
                  ? 'Tu número está verificado, con buena calidad y sin restricciones de Meta.'
                  : 'Revisa los puntos de abajo para que tu número siga vendiendo sin problemas.'
                : est?.motivo || 'Aquí te decimos si Meta tiene tu número limitado o con algo pendiente.'}
            </div>
          </div>
          <button
            onClick={df.revisarNumero}
            disabled={df.waEstadoCargando}
            style={{ background: '#fff', border: `1px solid ${c.borde}`, color: c.texto, borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: df.waEstadoCargando ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {df.waEstadoCargando ? 'Revisando…' : 'Revisar ahora'}
          </button>
        </div>

        {est?.disponible && (
          <>
            <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${c.borde}` }}>
              <Dato titulo="Verificación" valor={est.verificado ? 'Verificado' : 'Pendiente'} />
              <Dato titulo="Calidad" valor={CALIDAD[est.calidad] || 'Sin datos aún'} />
              <Dato titulo="Puedes escribirle a" valor={LIMITE[est.limite] || 'Sin datos aún'} />
              {est.nombreVerificado && <Dato titulo="Nombre que ven" valor={est.nombreVerificado} />}
            </div>
            {est.avisos.length > 0 && (
              <ul style={{ margin: '14px 0 0', paddingLeft: 18, color: c.texto, fontSize: 13, lineHeight: 1.75 }}>
                {est.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {enlaces.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Enlaces rápidos a Meta</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
            Meta te cobra a ti directamente la mensajería, así que el <b>método de pago va en tu propia cuenta</b>. Aquí llegas de un clic.
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
            {enlaces.map((e) => (
              <a
                key={e.id}
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', textDecoration: 'none', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid ' + (e.id === 'pago' ? '#BFDBFE' : '#E2E8F0'),
                  background: e.id === 'pago' ? '#EFF6FF' : '#fff',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13.5, color: e.id === 'pago' ? '#1D4ED8' : '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {e.titulo}
                  <span style={{ color: '#94A3B8', fontSize: 12 }}>↗</span>
                </div>
                <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{e.sub}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function WhatsAppSection({ df }: { df: DealFlowState }) {
  // El chequeo trae el número tal como lo tiene Meta; ese manda sobre el guardado.
  const numero = df.waEstado?.numero || df.waCfg?.numero || WA_NUMBER;
  const { waConnected, waModo } = df;

  // Al abrir la pantalla con el número conectado, preguntamos por su estado.
  // Por ref: la función se recrea en cada render y dispararía el efecto en bucle.
  const revisar = useRef(df.revisarNumero);
  revisar.current = df.revisarNumero;
  useEffect(() => {
    if (waConnected && waModo === 'cloud') revisar.current();
  }, [waConnected, waModo]);

  return (
    <section data-screen-label="WhatsApp" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>WhatsApp</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Conecta el WhatsApp de tu negocio para atender y vender desde aquí.</p>

      <div style={df.waCardStyleResolved}>
        <span style={df.waBigDot} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{df.waStatusTitle}</div>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>
            {df.waConnected ? (
              <>
                {df.waModo === 'qr' ? 'Vinculado por QR' : 'API oficial de Meta'} · Número:{' '}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}>{numero}</span>
              </>
            ) : (
              'Elige cómo conectar tu número.'
            )}
          </div>
        </div>
        {df.waConnected && (
          <button onClick={df.desvincularWa} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Desvincular
          </button>
        )}
      </div>

      {!df.waConnected && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {df.waSignup?.disponible && (
              <MethodTab active={df.waMethod === 'auto'} onClick={() => df.setWaMethod('auto')} titulo="Conexión automática" sub="Un clic con Facebook · recomendado" />
            )}
            <MethodTab active={df.waMethod === 'qr'} onClick={() => df.setWaMethod('qr')} titulo="Por código QR" sub="Rápido, escaneas como WhatsApp Web" />
            <MethodTab active={df.waMethod === 'cloud'} onClick={() => df.setWaMethod('cloud')} titulo="Por API oficial" sub="WABA ID + Access Token de Meta" />
          </div>

          {df.waMethod === 'auto' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Conectar con Facebook</div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
                Se abre una ventana de Facebook donde eliges tu cuenta de WhatsApp Business y tu número. Nosotros hacemos el resto:
                sin crear apps, sin tokens y sin configurar nada en Meta.
              </div>
              <ol style={{ color: '#475569', fontSize: 13, lineHeight: 1.9, margin: '0 0 16px', paddingLeft: 18 }}>
                <li>Inicia sesión con el Facebook del negocio.</li>
                <li>Elige (o crea) tu cuenta de WhatsApp Business.</li>
                <li>Registra el número y confirma el código que te llega.</li>
              </ol>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={df.conectarConFacebook}
                  disabled={df.waLinking}
                  className="df-btn-primary"
                  style={{ background: '#1877F2', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: df.waLinking ? 'default' : 'pointer', opacity: df.waLinking ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 9 }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
                  </svg>
                  {df.waLinking ? 'Conectando con Meta…' : 'Conectar con Facebook'}
                </button>
                {df.waError && <span style={{ color: '#DC2626', fontSize: 13, flex: 1, minWidth: 200 }}>{df.waError}</span>}
              </div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
                Necesitas un número que <b>no</b> tenga WhatsApp activo hoy (o dalo de baja antes). Si tu bloqueador de anuncios está encendido, la ventana de Facebook no abrirá.
              </div>
            </div>
          )}

          {df.waMethod === 'qr' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Vincular por QR</div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanea el código.
              </div>

              {df.qrEstado === 'inactivo' && (
                <button
                  onClick={df.iniciarQr}
                  className="df-btn-primary"
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Generar código QR
                </button>
              )}

              {df.qrEstado === 'iniciando' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748B', fontSize: 14 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid #E2E8F0', borderTopColor: '#059669', borderRadius: '50%', display: 'inline-block', animation: 'dfspin .8s linear infinite' }} />
                  Preparando la conexión… en segundos aparece el código.
                </div>
              )}

              {df.qrEstado === 'error' && (
                <div>
                  <div style={{ color: '#DC2626', fontSize: 13.5, marginBottom: 12 }}>{df.qrError || 'No pudimos generar el código. Intenta de nuevo.'}</div>
                  <button
                    onClick={df.iniciarQr}
                    className="df-btn-primary"
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {df.qrEstado === 'qr' && (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ width: 220, height: 220, border: '1px solid #E2E8F0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                    {df.qrImg === 'demo' ? (
                      <span style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 16 }}>
                        (Demo) Aquí aparece tu código QR real cuando el panel corre en el servidor.
                      </span>
                    ) : (
                      <img src={df.qrImg} alt="Código QR de WhatsApp" style={{ width: 200, height: 200 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Escanéalo desde tu teléfono</div>
                    <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
                      El código se actualiza solo. En cuanto lo escanees, esta pantalla pasa a «Conectado» y empiezan a entrar los chats en el CRM.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {df.waMethod === 'cloud' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Vincular por API oficial</div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                Los tres datos salen de tu app en developers.facebook.com → WhatsApp. Los validamos con Meta antes de guardar.
              </div>
              <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={label}>WABA ID</div>
                  <input className="df-input" value={df.waForm.wabaId} onChange={(e) => df.setWaForm({ wabaId: e.target.value })} placeholder="Ej: 102290129340398" style={input} />
                </div>
                <div>
                  <div style={label}>Phone Number ID</div>
                  <input className="df-input" value={df.waForm.phoneNumberId} onChange={(e) => df.setWaForm({ phoneNumberId: e.target.value })} placeholder="Ej: 106540352242922" style={input} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={label}>Access Token (permanente)</div>
                <input className="df-input" type="password" value={df.waForm.accessToken} onChange={(e) => df.setWaForm({ accessToken: e.target.value })} placeholder="EAAG…" style={input} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={df.vincularWa}
                  disabled={df.waLinking}
                  className="df-btn-primary"
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: df.waLinking ? 0.7 : 1 }}
                >
                  {df.waLinking ? 'Validando con Meta…' : 'Vincular número'}
                </button>
                {df.waError && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.waError}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {df.waConnected && df.waModo === 'cloud' && <EstadoNumeroCard df={df} />}

      {df.waConnected && df.waModo === 'cloud' && !df.waSignupAuto && (
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Webhook en Meta · se configura una sola vez</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>En tu app de Meta → WhatsApp → Configuration, pega estos dos datos y suscríbete al campo «messages».</div>
          <div style={label}>URL del webhook</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ ...input, width: 'auto', flex: 1, background: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{df.webhookUrl}</div>
            <button onClick={df.copyWebhook} className="df-copy-btn" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {df.webhookBtnLabel}
            </button>
          </div>
          <div style={label}>Token de verificación</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...input, width: 'auto', flex: 1, background: '#F8FAFC', letterSpacing: '0.1em' }}>{df.waCode}</div>
            <button onClick={df.copyCode} className="df-copy-btn" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {df.codeBtnLabel}
            </button>
          </div>
        </div>
      )}

      {df.waConnected && df.waModo === 'qr' && (
        <div style={{ ...card, marginBottom: 0, background: '#ECFDF5', borderColor: '#A7F3D0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>Listo para probar</div>
          <div style={{ color: '#047857', fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
            Escríbele un mensaje a tu número desde otro teléfono y aparecerá en <b>Inbox · Chats en vivo</b>. Desde ahí puedes responder tú mismo.
          </div>
        </div>
      )}
    </section>
  );
}
