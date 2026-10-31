import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CalidadCard } from '../components/CalidadCard';
import { AppsConectadas } from '../components/AppsConectadas';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { WA_NUMBER } from '../data';

const CALIDAD: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Media', RED: 'Baja' };
const CLASE_CALIDAD: Record<string, string> = { GREEN: 'ok', YELLOW: 'aviso', RED: 'mal' };
const LIMITE: Record<string, string> = {
  TIER_50: '50', TIER_250: '250', TIER_1K: '1.000', TIER_10K: '10.000', TIER_100K: '100.000', TIER_UNLIMITED: 'Sin límite',
};
const CLASE_SEMAFORO: Record<string, string> = { ok: 'ok', aviso: 'aviso', problema: 'mal', desconocido: '' };

type Metodo = 'auto' | 'qr' | 'cloud';

/** Estado del número según Meta + enlaces al panel de Meta (ahí ponen su método de pago). */
function EstadoNumero({ df }: { df: DealFlowState }) {
  const est = df.waEstado;
  const clase = CLASE_SEMAFORO[est?.semaforo ?? 'desconocido'];
  return (
    <div className={`aviso-caja ${clase}`} style={{ gap: 10 }}>
      <div className="tarjeta-cab">
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>{df.waEstadoCargando && !est ? 'Consultando a Meta…' : est?.disponible ? est.titulo : 'Estado del número'}</b>
          <div className="suave-t" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>
            {est?.disponible
              ? est.semaforo === 'ok'
                ? 'Tu número está verificado, con buena calidad y sin restricciones de Meta.'
                : 'Revisa los puntos de abajo para que tu número siga vendiendo sin problemas.'
              : est?.motivo || 'Aquí te decimos si Meta tiene tu número limitado o con algo pendiente.'}
          </div>
        </div>
        <button type="button" className="btn btn-sec btn-chico" onClick={df.revisarNumero} disabled={df.waEstadoCargando}>{df.waEstadoCargando ? 'Revisando…' : 'Revisar ahora'}</button>
      </div>
      {est?.disponible && est.avisos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.75 }}>
          {est.avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}

function Kpi({ eti, valor, delta, claseValor }: { eti: string; valor: ReactNode; delta: ReactNode; claseValor?: string }) {
  return <div className="kpi"><span className="eti">{eti}</span><span className={`valor ${claseValor || ''}`} style={{ fontSize: 22 }}>{valor}</span><span className="delta">{delta}</span></div>;
}

/**
 * WhatsApp (diseño "Noche"): KPIs del número, formas de conectar (API oficial,
 * Facebook, QR), webhook, estado/calidad del número y enlaces rápidos a Meta.
 */
export function WhatsAppSection({ df }: { df: DealFlowState }) {
  // El chequeo trae el número tal como lo tiene Meta; ese manda sobre el guardado.
  const numero = df.waEstado?.numero || df.waCfg?.numero || WA_NUMBER;
  const { waConnected, waModo } = df;
  const est = df.waEstado;
  const [copiadoWh, setCopiadoWh] = useState(false);

  // Al abrir la pantalla con el número conectado, preguntamos por su estado.
  // Por ref: la función se recrea en cada render y dispararía el efecto en bucle.
  const revisar = useRef(df.revisarNumero);
  revisar.current = df.revisarNumero;
  useEffect(() => {
    if (waConnected && waModo === 'cloud') revisar.current();
  }, [waConnected, waModo]);

  const metodos: { id: Metodo; t: string }[] = [
    { id: 'cloud', t: 'Vincular por API oficial' },
    ...(df.waSignup?.disponible ? [{ id: 'auto' as Metodo, t: 'Conectar con Facebook' }] : []),
    { id: 'qr', t: 'Vincular por QR' },
  ];
  const enlaces = est?.enlaces ?? [];
  const plantillas = df.plantillasAprobadas.length;

  return (
    <section data-screen-label="WhatsApp" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Canal principal</span>
          <h1>WhatsApp</h1>
          <p className="sub">Conecta el WhatsApp de tu negocio para atender y vender desde aquí. También puedes sumar Messenger e Instagram en Integraciones.</p>
        </div>
        <div className="fila">
          {waConnected && <button type="button" className="btn btn-fant" onClick={df.desvincularWa} style={{ color: 'var(--coral)' }}>Desvincular</button>}
          <button type="button" className="btn btn-sec" onClick={() => df.go('crm')}>Ir al Inbox →</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi eti="Número conectado" valor={waConnected ? <span className="mono">{numero}</span> : 'Sin conectar'}
          delta={waConnected ? <span className={`pill ${waModo === 'qr' ? 'aviso' : 'ok'} chica`}>{waModo === 'qr' ? 'Vinculado por QR' : 'Conexión oficial (Cloud API)'}</span> : 'Elige abajo cómo conectar tu número'} />
        <Kpi eti="Calidad del número" valor={est?.disponible ? CALIDAD[est.calidad] || 'Sin datos' : '—'} claseValor={est?.disponible ? CLASE_CALIDAD[est.calidad] : ''}
          delta={est?.disponible ? (est.calidad === 'GREEN' ? 'Meta no reporta bloqueos ni reportes' : est.calidad ? 'Revisa los avisos de Meta abajo' : 'Meta aún no la ha medido') : 'Se consulta a Meta con la conexión oficial'} />
        <Kpi eti="Clientes nuevos al día" valor={est?.disponible ? LIMITE[est.limite] || '—' : '—'}
          delta={est?.disponible ? (est.verificado ? 'Número verificado por Meta' : 'Verificación pendiente en Meta') : 'Límite que Meta da a tu número'} />
        <Kpi eti="Plantillas aprobadas" valor={plantillas} delta={<span>para escribir fuera de las 24 h · <a href="#" onClick={(ev) => { ev.preventDefault(); void df.actualizarPlantillasMeta(); }}>actualizar desde Meta</a></span>} />
      </div>

      <div className="dos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {!waConnected && (
            <section className="tarjeta" style={{ gap: 0 }}>
              <div className="tabs">
                {metodos.map((m) => <button key={m.id} type="button" className={`tab${df.waMethod === m.id ? ' sel' : ''}`} onClick={() => df.setWaMethod(m.id)}>{m.t}</button>)}
              </div>

              {df.waMethod === 'cloud' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
                  <p className="suave-t" style={{ fontSize: 13 }}>La forma recomendada: estable, con plantillas aprobadas y sin depender de un celular prendido. Los tres datos salen de tu app en developers.facebook.com → WhatsApp. Los validamos con Meta antes de guardar.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <div className="campo"><label htmlFor="wa-pnid">Phone Number ID</label><input id="wa-pnid" className="mono" value={df.waForm.phoneNumberId} onChange={(e) => df.setWaForm({ phoneNumberId: e.target.value })} placeholder="Ej: 106540352242922" /></div>
                    <div className="campo"><label htmlFor="wa-waba">WABA ID</label><input id="wa-waba" className="mono" value={df.waForm.wabaId} onChange={(e) => df.setWaForm({ wabaId: e.target.value })} placeholder="Ej: 102290129340398" /></div>
                    <div className="campo" style={{ gridColumn: 'span 2' }}><label htmlFor="wa-token">Access Token (permanente)</label><input id="wa-token" className="mono" type="password" value={df.waForm.accessToken} onChange={(e) => df.setWaForm({ accessToken: e.target.value })} placeholder="EAAG…" /></div>
                  </div>
                  <div className="fila">
                    <button type="button" className="btn btn-pri" onClick={df.vincularWa} disabled={df.waLinking}>{df.waLinking ? 'Validando con Meta…' : 'Verificar y guardar'}</button>
                    {df.waError && <span className="mal" style={{ fontSize: 13 }}>{df.waError}</span>}
                  </div>
                </div>
              )}

              {df.waMethod === 'auto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
                  <p className="suave-t" style={{ fontSize: 13 }}>Sin copiar nada: inicias sesión con el Facebook del negocio y Meta crea todo por ti. Sin crear apps, sin tokens y sin configurar nada en Meta.</p>
                  <div className="paso-n"><i>1</i><span>Inicia sesión con el Facebook del negocio.</span></div>
                  <div className="paso-n"><i>2</i><span>Elige (o crea) tu cuenta de WhatsApp Business.</span></div>
                  <div className="paso-n"><i>3</i><span>Registra el número y confirma el código que te llega.</span></div>
                  <div className="fila">
                    <button type="button" className="btn btn-pri" onClick={df.conectarConFacebook} disabled={df.waLinking} style={{ background: '#1877F2' }}>{df.waLinking ? 'Conectando con Meta…' : 'Conectar con Facebook'}</button>
                    {df.waError && <span className="mal" style={{ fontSize: 13 }}>{df.waError}</span>}
                  </div>
                  <p className="tenue" style={{ fontSize: 12 }}>Necesitas un número que <b>no</b> tenga WhatsApp activo hoy (o dalo de baja antes). Si tu bloqueador de anuncios está encendido, la ventana de Facebook no abrirá.</p>
                </div>
              )}

              {df.waMethod === 'qr' && (
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 16, alignItems: 'center' }}>
                  <div style={{ width: 200, height: 200, borderRadius: 14, background: '#fff', border: '8px solid #EEF3FF', flex: '0 0 200px', display: 'grid', placeItems: 'center', color: '#050713', fontSize: 12, textAlign: 'center', padding: 8, boxSizing: 'border-box' }}>
                    {df.qrEstado === 'qr' ? (df.qrImg === 'demo' ? '(Demo) Aquí aparece tu código QR real cuando el panel corre en el servidor.' : <img src={df.qrImg} alt="Código QR de WhatsApp" style={{ width: 184, height: 184 }} />)
                      : df.qrEstado === 'iniciando' ? 'Preparando la conexión… en segundos aparece el código.'
                        : df.qrEstado === 'error' ? (df.qrError || 'No pudimos generar el código.')
                          : 'Toca «Generar código QR»'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, flex: 1 }}>
                    <b>Escanéalo desde tu teléfono</b>
                    <p className="suave-t" style={{ fontSize: 13 }}>WhatsApp → Dispositivos vinculados → Vincular un dispositivo. En cuanto lo escanees, esta pantalla pasa a «Conectado» y empiezan a entrar los chats. Sirve para probar; para vender todos los días usa la conexión oficial.</p>
                    <span className="pill aviso" style={{ alignSelf: 'flex-start' }}>Sin plantillas ni mensajes fuera de 24 h</span>
                    {(df.qrEstado === 'inactivo' || df.qrEstado === 'error') && <button type="button" className="btn btn-pri" onClick={df.iniciarQr} style={{ alignSelf: 'flex-start' }}>{df.qrEstado === 'error' ? 'Reintentar' : 'Generar código QR'}</button>}
                  </div>
                </div>
              )}
            </section>
          )}

          {waConnected && waModo === 'cloud' && <EstadoNumero df={df} />}
          {waConnected && waModo === 'cloud' && est?.disponible && <CalidadCard calidad={est.calidad} />}

          {waConnected && waModo === 'cloud' && !df.waSignupAuto && (
            <section className="tarjeta">
              <div className="tarjeta-cab"><h2>Webhook en Meta</h2><span className="pill ok">Se configura una sola vez</span></div>
              <p className="suave-t" style={{ fontSize: 13 }}>En tu app de Meta → WhatsApp → Configuration, pega estos dos datos y suscríbete al campo «messages».</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div className="campo"><label htmlFor="wa-wh">URL del webhook</label><div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}><input id="wa-wh" className="mono" readOnly value={df.webhookUrl} style={{ flex: 1, minWidth: 0 }} /><button type="button" className="btn btn-sec btn-chico" onClick={() => { df.copyWebhook(); setCopiadoWh(true); setTimeout(() => setCopiadoWh(false), 1500); }}>{copiadoWh ? 'Copiado ✓' : df.webhookBtnLabel}</button></div></div>
                <div className="campo"><label htmlFor="wa-tv">Token de verificación</label><div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}><input id="wa-tv" className="mono" readOnly value={df.waCode} style={{ flex: 1, minWidth: 0, letterSpacing: '.08em' }} /><button type="button" className="btn btn-sec btn-chico" onClick={df.copyCode}>{df.codeBtnLabel}</button></div></div>
              </div>
            </section>
          )}

          {waConnected && waModo === 'qr' && (
            <div className="aviso-caja ok">
              <b>Listo para probar</b>
              Escríbele un mensaje a tu número desde otro teléfono y aparecerá en <b>Inbox · Chats en vivo</b>. Desde ahí puedes responder tú mismo.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="tarjeta">
            <div className="tarjeta-cab"><h2>Estado de la conexión</h2><span className={`pill ${waConnected ? 'ok' : 'mal'}`}>{df.waStatusTitle}</span></div>
            <p className="suave-t" style={{ fontSize: 13 }}>
              {waConnected
                ? <>{waModo === 'qr' ? 'Vinculado por QR' : 'API oficial de Meta'} · Número <span className="mono">{numero}</span>{est?.nombreVerificado ? <> · los clientes ven «{est.nombreVerificado}»</> : null}.</>
                : 'Elige cómo conectar tu número. Con la conexión oficial el asistente responde 24/7 sin depender de un celular.'}
            </p>
            {waConnected && waModo === 'cloud' && est?.disponible && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, fontSize: 13 }}>
                <div><span className="eti">Verificación</span><div><b>{est.verificado ? 'Verificado' : 'Pendiente'}</b></div></div>
                <div><span className="eti">Calidad</span><div><b className={CLASE_CALIDAD[est.calidad] || ''}>{CALIDAD[est.calidad] || 'Sin datos aún'}</b></div></div>
              </div>
            )}
          </section>

          {enlaces.length > 0 && (
            <section className="tarjeta">
              <h2>Enlaces rápidos a Meta</h2>
              <p className="suave-t" style={{ fontSize: 13 }}>Meta te cobra a ti directamente la mensajería, así que el <b>método de pago va en tu propia cuenta</b>. Aquí llegas de un clic.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {enlaces.map((e) => <a key={e.id} className="enlace" href={e.url} target="_blank" rel="noopener noreferrer" title={e.sub}>{e.titulo}<span>↗</span></a>)}
              </div>
            </section>
          )}

          {waConnected && waModo === 'cloud' && est?.disponible && <AppsConectadas />}
        </div>
      </div>
    </section>
  );
}
