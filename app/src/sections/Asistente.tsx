import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiWebchatList, apiWebchatSend } from '../lib/api';
import type { ApiMensaje } from '../lib/api';
import skyMascota from '../assets/sky-mascota.png';

/** Grupo de opciones tipo chips para el tono/estilo del asistente. */
function SegChips<T extends string | boolean>({ label, value, opciones, onPick }: { label: string; value: T | undefined; opciones: { v: T; t: string }[]; onPick: (v: T) => void }) {
  return (
    <div>
      <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>{label}</span>
      <div className="fila" style={{ gap: 6 }}>
        {opciones.map((o) => <button key={String(o.v)} type="button" className={`chip chica${value === o.v ? ' activa' : ''}`} onClick={() => onPick(o.v)}>{o.t}</button>)}
      </div>
    </div>
  );
}

/** Tarjetas de opción (personalidad, idioma, forma de vender). */
function Tonos<T extends string>({ value, opciones, onPick, columnas = 3 }: { value: T | undefined; opciones: { v: T; icono: string; t: string; d: string }[]; onPick: (v: T) => void; columnas?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${columnas >= 3 ? 150 : 180}px, 1fr))`, gap: 8 }}>
      {opciones.map((o) => (
        <button key={o.v} type="button" className={`tono${value === o.v ? ' sel' : ''}`} onClick={() => onPick(o.v)}>
          <b>{o.icono} {o.t}</b><span>{o.d}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, children, title }: { on: boolean; onChange: () => void; children: ReactNode; title?: string }) {
  return <button type="button" className={`toggle${on ? ' on' : ''}`} onClick={onChange} aria-pressed={on} title={title}><i /><span>{children}</span></button>;
}

/** Campo con título y ayuda. */
function Campo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="campo" style={{ gap: 6 }}>
      <label>{titulo}</label>
      {ayuda && <span className="tenue" style={{ fontSize: 12, lineHeight: 1.45 }}>{ayuda}</span>}
      {children}
    </div>
  );
}

/** Id de sesión de prueba (crypto.randomUUID solo existe en https). */
const sesionNueva = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')).replace(/-/g, '');

/** Chat de prueba: habla con TU asistente por el canal web, sin gastar WhatsApp. */
function PruebaAsistente({ storeId, nombre }: { storeId: string; nombre: string }) {
  const key = 'df:test-session:' + storeId;
  const [session, setSession] = useState(() => {
    let s = localStorage.getItem(key);
    if (!s) { s = sesionNueva(); localStorage.setItem(key, s); }
    return s;
  });
  const [mensajes, setMensajes] = useState<ApiMensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = () => void apiWebchatList(storeId, session).then((r) => { if (vivo && r.data) setMensajes(r.data.mensajes); });
    cargar();
    const t = setInterval(cargar, 2500);
    return () => { vivo = false; clearInterval(t); };
  }, [storeId, session]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  function enviar(t0?: string) {
    const t = (t0 ?? texto).trim();
    if (!t || enviando) return;
    setEnviando(true);
    setTexto('');
    setMensajes((st) => [...st, { de: 'cliente', texto: t, hora: '· ahora' }]);
    void apiWebchatSend(storeId, session, t, 'Prueba del dueño').then(() => {
      setEnviando(false);
      void apiWebchatList(storeId, session).then((r) => { if (r.data) setMensajes(r.data.mensajes); });
    });
  }

  function reiniciar() {
    const s = sesionNueva();
    localStorage.setItem(key, s);
    setSession(s);
    setMensajes([]);
  }

  return (
    <>
      <div className="tarjeta-cab">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <img src={skyMascota} alt="" style={{ width: 36, height: 36 }} />
          <div><h2 style={{ fontSize: 16 }}>Probar el asistente</h2><span className="tenue" style={{ fontSize: 11.5 }}>Escribe como si fueras el cliente</span></div>
        </div>
        <button type="button" className="btn btn-fant btn-chico" onClick={reiniciar} title="Empieza una conversación nueva desde cero">Empezar de cero</button>
      </div>
      <div ref={scrollRef} translate="no" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 380, maxHeight: 'min(56vh, 520px)', overflowY: 'auto', background: '#0A1022', borderRadius: 12, padding: 14 }}>
        {mensajes.length === 0 && (
          <div translate="yes" className="tenue" style={{ margin: 'auto', textAlign: 'center', fontSize: 13.5, lineHeight: 1.7 }}>
            Escríbele como lo haría un cliente:<br /><i>«hola», «tienes joggers?», «mándame fotos», «quiero 2»…</i>
          </div>
        )}
        {mensajes.map((m, i) => {
          const mio = m.de === 'cliente';
          return (
            <div key={i} className={`burbuja ${mio ? 'b-vendedor' : 'b-bot'}`} style={mio ? undefined : { alignSelf: 'flex-start', borderTopLeftRadius: 4, borderTopRightRadius: 14, maxWidth: '85%' }}>
              {m.tipo === 'image' && m.mediaUrl && <img src={m.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
              {m.tipo === 'video' && m.mediaUrl && <video src={m.mediaUrl} controls style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
              {m.tipo === 'audio' && m.mediaUrl && <audio src={m.mediaUrl} controls style={{ maxWidth: 220, display: 'block' }} />}
              {m.texto}
              <span className="hora">{m.hora}</span>
            </div>
          );
        })}
        {enviando && <div translate="yes" className="burbuja b-bot tenue" style={{ fontSize: 12, alignSelf: 'flex-start' }}>{nombre} está escribiendo…</div>}
      </div>
      <div className="fila" style={{ gap: 6 }}>
        {['hola', '¿qué productos tienes?', 'quiero 2'].map((s) => <button key={s} type="button" className="chip chica" onClick={() => enviar(s)} style={{ fontSize: 11.5 }}>{s}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }} placeholder="Escribe como si fueras el cliente…" style={{ flex: 1, minWidth: 0 }} aria-label="Mensaje de prueba" />
        <button type="button" className="btn btn-pri" onClick={() => enviar()}>Enviar</button>
      </div>
      <p className="tenue" style={{ fontSize: 11.5 }}>Lo que escribas aquí el asistente lo responde con tu catálogo y tus reglas. No le llega a ningún cliente ni usa WhatsApp.</p>
    </>
  );
}

type Pestana = 'personalidad' | 'negocio' | 'venta' | 'reglas';
const PESTANAS: { id: Pestana; t: string }[] = [
  { id: 'personalidad', t: 'Personalidad' },
  { id: 'negocio', t: 'Tu negocio' },
  { id: 'venta', t: 'Cómo vende' },
  { id: 'reglas', t: 'Reglas y límites' },
];

/**
 * Asistente (diseño "Noche"): a la izquierda su personalidad, negocio, forma de
 * vender y reglas; a la derecha el chat de prueba para verlo responder.
 */
export function Asistente({ df }: { df: DealFlowState }) {
  const [tab, setTab] = useState<Pestana>(() => { try { return (localStorage.getItem('dealflow:asist-tab') as Pestana) || 'personalidad'; } catch { return 'personalidad'; } });
  const elegirTab = (t: Pestana) => { setTab(t); try { localStorage.setItem('dealflow:asist-tab', t); } catch { /* modo privado */ } };
  const e = df.estilo;
  const set = df.setEstiloCampo;
  const negocio = e.negocio || {};
  const setNegocio = (patch: Partial<NonNullable<typeof e.negocio>>) => set({ negocio: { ...negocio, ...patch } });
  const faqs = e.faqs || [];
  const humano = e.humano || {};
  const setHumano = (patch: Partial<NonNullable<typeof e.humano>>) => set({ humano: { ...humano, ...patch } });
  const emojiNivel = e.emojiNivel || (e.emojis === false ? 'nada' : 'pocos');
  const nombre = df.assistantNombre.trim() || 'tu asistente';
  const g2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } as const;

  return (
    <section data-screen-label="Asistente" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Asistente de ventas</span>
          <h1>Así atiende <span className="grad-txt">{nombre}</span></h1>
          <p className="sub">Responde, muestra fotos, arma el pedido con el resumen y lo confirma con el cliente. Aquí le das su personalidad y sus reglas.</p>
        </div>
        <div className="fila">
          <Toggle on={df.seguimientoActivo} onChange={df.toggleSeguimientoActivo} title="Si el cliente deja de responder, le vuelve a escribir a los 5 min, 30 min y 1 hora">Volver a escribir si el cliente no responde</Toggle>
          <button type="button" className="btn btn-pri" onClick={df.saveAssistant}>Guardar cambios</button>
        </div>
      </div>
      {df.assistantSaved
        ? <p className="ok" style={{ fontSize: 13, fontWeight: 600 }}>✓ Guardado. El asistente ya responde así.</p>
        : <p className="tenue" style={{ fontSize: 12 }}>Las opciones se guardan solas; el nombre, las instrucciones y las reglas, con el botón «Guardar cambios».</p>}

      <div className="lateral ancho">
        <section className="tarjeta" style={{ gap: 16, minWidth: 0 }}>
          <div className="tabs">
            {PESTANAS.map((p) => <button key={p.id} type="button" className={`tab${tab === p.id ? ' sel' : ''}`} onClick={() => elegirTab(p.id)}>{p.t}</button>)}
          </div>

          {tab === 'personalidad' && (
            <>
              <div className="tarjeta-cab"><h2>Personalidad</h2><span className="pill ia sin">✦ IA</span></div>
              <div style={g2}>
                <Campo titulo="Cómo se llama" ayuda="Con este nombre se presenta al cliente. Vacío = el nombre de tu tienda.">
                  <input value={df.assistantNombre} onChange={(ev) => df.setAssistantNombre(ev.target.value)} placeholder="Ej: Sky" />
                </Campo>
                <Campo titulo="Idioma" ayuda="Incluye los mensajes automáticos (confirmación, estados y guía).">
                  <div className="fila" style={{ gap: 6 }}>
                    {([['es', '🇪🇸 Español'], ['en', '🇺🇸 English'], ['auto', '🌐 Automático']] as const).map(([v, t]) => <button key={v} type="button" className={`chip chica${(e.idioma || 'es') === v ? ' activa' : ''}`} onClick={() => set({ idioma: v })}>{t}</button>)}
                  </div>
                </Campo>
              </div>
              <div>
                <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 8 }}>Personalidad · cómo se siente hablar con él</span>
                <Tonos value={e.personalidad} onPick={(v) => set({ personalidad: v })} opciones={[
                  { v: 'amigable', icono: '😊', t: 'Amigable', d: 'Cálido y cercano, como un amigo que sabe.' },
                  { v: 'profesional', icono: '👔', t: 'Profesional', d: 'Claro, respetuoso y serio.' },
                  { v: 'divertido', icono: '🎉', t: 'Divertido', d: 'Buena energía y humor ligero.' },
                  { v: 'experto', icono: '🧠', t: 'Asesor experto', d: 'Explica beneficios con seguridad.' },
                  { v: 'directo', icono: '⚡', t: 'Directo', d: 'Al grano, facilita la compra.' },
                ]} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <SegChips label="Trato" value={e.trato} opciones={[{ v: 'tu', t: 'Tú (cercano)' }, { v: 'usted', t: 'Usted (formal)' }]} onPick={(v) => set({ trato: v })} />
                <SegChips label="Emojis" value={emojiNivel} opciones={[{ v: 'nada', t: 'Sin emojis' }, { v: 'pocos', t: 'Pocos' }, { v: 'muchos', t: 'Muchos' }]} onPick={(v) => set({ emojiNivel: v, emojis: v !== 'nada' })} />
                <SegChips label="Respuestas" value={e.largo || 'corto'} opciones={[{ v: 'corto', t: 'Cortas' }, { v: 'medio', t: 'Medias' }, { v: 'detallado', t: 'Detalladas' }]} onPick={(v) => set({ largo: v })} />
                <SegChips label="Forma de hablar" value={e.modismos || 'neutro'} opciones={[{ v: 'neutro', t: 'Neutral' }, { v: 'colombiano', t: 'Colombiana' }]} onPick={(v) => set({ modismos: v })} />
              </div>
              <div style={g2}>
                <Campo titulo="Saludo" ayuda="Primer mensaje si no se envía un mensaje inicial de producto. Vacío = saluda a su manera.">
                  <textarea rows={2} value={e.saludo || ''} onChange={(ev) => set({ saludo: ev.target.value })} placeholder="Ej: ¡Hola! Bienvenido a Luna Accesorios 💜 Soy Sky, ¿qué estás buscando hoy?" />
                </Campo>
                <Campo titulo="Despedida" ayuda="Cuando el cliente da las gracias o se va.">
                  <textarea rows={2} value={e.despedida || ''} onChange={(ev) => set({ despedida: ev.target.value })} placeholder="Ej: ¡Gracias por escribirnos! Aquí estamos cuando nos necesites 🙌" />
                </Campo>
              </div>
            </>
          )}

          {tab === 'negocio' && (
            <>
              <div className="tarjeta-cab"><h2>Tu negocio</h2><span className="tenue" style={{ fontSize: 12 }}>lo responde tal cual · lo vacío no lo inventa</span></div>
              <Campo titulo="🚚 Envíos" ayuda="Tiempos de entrega, costo del envío, a qué ciudades llegas.">
                <textarea rows={2} value={negocio.envios || ''} onChange={(ev) => setNegocio({ envios: ev.target.value })} placeholder="Ej: Enviamos a toda Colombia. Llega en 2 a 5 días hábiles. Envío gratis desde $150.000." />
              </Campo>
              <div style={g2}>
                <Campo titulo="💳 Formas de pago"><textarea rows={2} value={negocio.pagos || ''} onChange={(ev) => setNegocio({ pagos: ev.target.value })} placeholder="Ej: Pago contra entrega en efectivo. También Nequi y Bancolombia." /></Campo>
                <Campo titulo="🔄 Cambios y garantía"><textarea rows={2} value={negocio.cambios || ''} onChange={(ev) => setNegocio({ cambios: ev.target.value })} placeholder="Ej: Cambios por talla dentro de los 5 días siguientes a la entrega." /></Campo>
                <Campo titulo="🕘 Horario de atención"><input value={negocio.horario || ''} onChange={(ev) => setNegocio({ horario: ev.target.value })} placeholder="Ej: Lunes a sábado, 8 a.m. a 7 p.m." /></Campo>
                <Campo titulo="📍 Ubicación / redes"><input value={negocio.ubicacion || ''} onChange={(ev) => setNegocio({ ubicacion: ev.target.value })} placeholder="Ej: Solo tienda virtual · @lunaaccesorios" /></Campo>
              </div>
              <Campo titulo="📝 Otra información" ayuda="Quiénes son, materiales, promociones fijas, etc.">
                <textarea rows={3} value={negocio.extra || ''} onChange={(ev) => setNegocio({ extra: ev.target.value })} />
              </Campo>
              <div className="tarjeta-cab" style={{ marginTop: 4 }}><h3>Preguntas frecuentes</h3><button type="button" className="btn btn-sec btn-chico" onClick={() => set({ faqs: [...faqs, { pregunta: '', respuesta: '' }] })}>＋ Agregar</button></div>
              <div className="lista">
                {faqs.length === 0 && <div className="tenue" style={{ fontSize: 13 }}>Aún no hay preguntas. Agrega la primera: la respuesta exacta que quieres que dé.</div>}
                {faqs.map((f, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) 28px', gap: 10, alignItems: 'start' }}>
                    <input className="entrada" value={f.pregunta} placeholder="Pregunta (ej: ¿Hacen envíos el mismo día?)" onChange={(ev) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, pregunta: ev.target.value } : x)) })} style={{ fontWeight: 600 }} />
                    <textarea className="entrada" rows={2} value={f.respuesta} placeholder="Respuesta" onChange={(ev) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, respuesta: ev.target.value } : x)) })} />
                    <button type="button" className="icono-btn" onClick={() => set({ faqs: faqs.filter((_, j) => j !== i) })} title="Quitar" aria-label="Quitar pregunta" style={{ width: 28, height: 28 }}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'venta' && (
            <>
              <div className="tarjeta-cab"><h2>Cómo vende</h2><span className="pill ia sin">✦ IA</span></div>
              <div>
                <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 8 }}>Qué tanto insiste</span>
                <Tonos value={e.insistencia || 'equilibrada'} onPick={(v) => set({ insistencia: v })} opciones={[
                  { v: 'suave', icono: '🌱', t: 'Suave', d: 'Informa y deja decidir. Cero presión.' },
                  { v: 'equilibrada', icono: '⚖️', t: 'Equilibrada', d: 'Resuelve y propone el siguiente paso.' },
                  { v: 'persuasiva', icono: '🔥', t: 'Persuasiva', d: 'Resalta beneficios y maneja objeciones.' },
                ]} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                <Toggle on={!!e.sugerirCombos} onChange={() => set({ sugerirCombos: !e.sugerirCombos })} title="Cuando el cliente ya eligió, le ofrece una vez un combo o un producto que combine">Sugerir combos y complementos</Toggle>
                <Toggle on={df.seguimientoActivo} onChange={df.toggleSeguimientoActivo} title="Si el cliente deja de responder, le vuelve a escribir a los 5 min, 30 min y 1 hora según lo que hablaban. Se detiene apenas responde y respeta la ventana de 24 h.">Mensaje automático si deja de responder</Toggle>
              </div>
              <Campo titulo="Instrucciones de venta" ayuda="Escríbelo como se lo dirías a un empleado nuevo: qué ofrecer, cómo responder precios, qué destacar.">
                <textarea value={df.assistantText} onChange={(ev) => df.setAssistantText(ev.target.value)} rows={9} style={{ fontSize: 14, lineHeight: 1.6 }} />
              </Campo>
            </>
          )}

          {tab === 'reglas' && (
            <>
              <div className="tarjeta-cab"><h2>Reglas del negocio</h2><span className="tenue" style={{ fontSize: 12 }}>{df.rules.length} reglas · se cumplen siempre</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {df.rules.length === 0 && <div className="tenue" style={{ fontSize: 13 }}>Aún no hay reglas. Agrega la primera abajo.</div>}
                {df.rules.map((r, i) => (
                  <div key={i} className="regla">
                    <span style={{ color: 'var(--cian)' }}>◆</span>
                    <textarea value={r.texto} onChange={(ev) => r.editar(ev.target.value)} rows={1} style={{ flex: 1, background: 'transparent', border: 0, color: 'inherit', font: 'inherit', resize: 'vertical', outline: 'none', padding: 0 }} aria-label={`Regla ${i + 1}`} />
                    <button type="button" className="q" onClick={r.remove} aria-label="Quitar regla">×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="entrada" value={df.ruleDraft} onChange={(ev) => df.setRuleDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') df.addRule(); }} placeholder="Escribe una regla nueva… (ej: No prometer entrega el mismo día)" style={{ flex: '1 1 280px' }} aria-label="Nueva regla" />
                <button type="button" className="btn btn-sec" onClick={df.addRule}>Agregar regla</button>
              </div>
              <Campo titulo="🚫 Nunca debe…" ayuda="Temas, palabras o promesas que el asistente jamás debe tocar.">
                <textarea rows={3} value={e.prohibido || ''} onChange={(ev) => set({ prohibido: ev.target.value })} placeholder="Ej: Hablar de la competencia, prometer fechas exactas de entrega, dar descuentos, hablar de política." />
              </Campo>
              <div className="aviso-caja ia" style={{ gap: 10 }}>
                <div className="tarjeta-cab">
                  <div><b>🙋 Pasar el chat a una persona</b><div className="suave-t" style={{ fontSize: 12.5 }}>Cuando pase lo que indiques, avisa al cliente y deja de responder. El chat queda en el Inbox como “Equipo (pidió asesor)”.</div></div>
                  <Toggle on={humano.activo !== false} onChange={() => setHumano({ activo: humano.activo === false })}>{humano.activo !== false ? 'Activo' : 'Apagado'}</Toggle>
                </div>
                {humano.activo !== false && (
                  <div style={g2}>
                    <Campo titulo="¿Cuándo?" ayuda="Vacío: cuando pidan un asesor, tengan una queja o pregunten algo que no sabe.">
                      <textarea rows={2} value={humano.cuando || ''} onChange={(ev) => setHumano({ cuando: ev.target.value })} placeholder="Ej: pidan hablar con alguien, quieran comprar al por mayor, o tengan un reclamo." />
                    </Campo>
                    <Campo titulo="Mensaje al pasar el chat">
                      <input value={humano.mensaje || ''} onChange={(ev) => setHumano({ mensaje: ev.target.value })} placeholder="Ya mismo te comunico con una persona de nuestro equipo 🙌" />
                    </Campo>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="fila" style={{ gap: 12, borderTop: '1px solid var(--linea)', paddingTop: 14 }}>
            <button type="button" className="btn btn-pri" onClick={df.saveAssistant}>Guardar cambios</button>
            {df.assistantSaved && <span className="ok" style={{ fontSize: 13, fontWeight: 600 }}>✓ Guardado. El asistente ya responde así.</span>}
          </div>
        </section>

        <aside className="tarjeta borde-ia" style={{ gap: 12, position: 'sticky', top: 0 }} aria-label="Probar el asistente">
          {df.apiMode && df.storeId
            ? <PruebaAsistente storeId={df.storeId} nombre={nombre} />
            : <div className="vacio">🧪 El chat de prueba está disponible cuando tu tienda está conectada.</div>}
        </aside>
      </div>
    </section>
  );
}
