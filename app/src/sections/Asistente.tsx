import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiWebchatList, apiWebchatSend } from '../lib/api';
import type { ApiMensaje } from '../lib/api';

/** Grupo de opciones tipo segmento para el tono/estilo del asistente. */
function SegChips<T extends string | boolean>({ label, value, opciones, onPick }: { label: string; value: T | undefined; opciones: { v: T; t: string }[]; onPick: (v: T) => void }) {
  return (
    <div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
        {opciones.map((o) => {
          const activo = value === o.v;
          return (
            <button key={String(o.v)} onClick={() => onPick(o.v)}
              style={{ background: activo ? 'var(--df-brand)' : 'var(--df-surface)', color: activo ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              {o.t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tarjetas de opción grandes (personalidad, forma de vender). */
function OpcionCards<T extends string>({ value, opciones, onPick, min = 150 }: { value: T | undefined; opciones: { v: T; icono: string; t: string; d: string }[]; onPick: (v: T) => void; min?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8 }}>
      {opciones.map((o) => {
        const activo = value === o.v;
        return (
          <button key={o.v} onClick={() => onPick(o.v)}
            style={{ textAlign: 'left', background: activo ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', border: `1.5px solid ${activo ? 'var(--df-brand)' : 'var(--df-border)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--df-text-body)', transition: 'border-color .15s, background .15s' }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{o.icono}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: activo ? 'var(--df-brand-dark)' : 'var(--df-text-strong)' }}>{o.t}</div>
            <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', lineHeight: 1.4, marginTop: 2 }}>{o.d}</div>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange, title }: { on: boolean; onChange: () => void; title?: string }) {
  return (
    <div onClick={onChange} role="switch" aria-checked={on} title={title || (on ? 'Encendido' : 'Apagado')} className="df-switch" data-on={on}
      style={{ width: 52, height: 30, borderRadius: 999, background: on ? 'var(--df-brand)' : 'var(--df-border-strong)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </div>
  );
}

const inputSt: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: 'var(--df-text-strong)', background: 'var(--df-surface)', resize: 'vertical' };

/** Campo con título y ayuda. */
function Campo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{titulo}</div>
      {ayuda && <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginBottom: 8, lineHeight: 1.45 }}>{ayuda}</div>}
      {children}
    </div>
  );
}

/** Chat de prueba: habla con TU asistente por el canal web, sin gastar WhatsApp. */
function PruebaAsistente({ storeId }: { storeId: string }) {
  const key = 'df:test-session:' + storeId;
  const [session, setSession] = useState(() => {
    let s = localStorage.getItem(key);
    if (!s) { s = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(key, s); }
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

  function enviar() {
    const t = texto.trim();
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
    const s = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(key, s);
    setSession(s);
    setMensajes([]);
  }

  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--df-border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🧪 Prueba tu asistente</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>Chatea aquí mismo con tu IA, como si fueras un cliente. No usa WhatsApp: funciona aunque Meta esté caído.</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={reiniciar}
          title="Empieza una conversación nueva desde cero"
          style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ↻ Empezar de nuevo
        </button>
      </div>

      <div ref={scrollRef} translate="no" style={{ height: 'min(56vh, 480px)', minHeight: 300, overflowY: 'auto', background: 'var(--df-bg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mensajes.length === 0 && (
          <div translate="yes" style={{ margin: 'auto', textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 13.5, lineHeight: 1.7 }}>
            Escríbele como lo haría un cliente:<br />
            <i>«hola», «tienes joggers?», «mándame fotos», «quiero 2»…</i>
          </div>
        )}
        {mensajes.map((m, i) => {
          const mio = m.de === 'cliente';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '72%', background: mio ? 'var(--df-green-subtle)' : 'var(--df-surface)', border: '1px solid ' + (mio ? '#BBF7D0' : 'var(--df-border)'), borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5 }}>
                {m.tipo === 'image' && m.mediaUrl && <img src={m.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
                {m.tipo === 'video' && m.mediaUrl && <video src={m.mediaUrl} controls style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
                {m.tipo === 'audio' && m.mediaUrl && <audio src={m.mediaUrl} controls style={{ maxWidth: 220, display: 'block' }} />}
                {m.texto && <span style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</span>}
                <span style={{ display: 'block', textAlign: 'right', color: 'var(--df-text-faint)', fontSize: 10.5, marginTop: 3 }}>{m.hora}</span>
              </div>
            </div>
          );
        })}
        {enviando && <div translate="yes" style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>El asistente está escribiendo…</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--df-border)' }}>
        <input
          className="df-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
          placeholder="Escribe como si fueras el cliente…"
          style={{ flex: 1, border: '1px solid var(--df-border)', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 13.5, minHeight: 44, boxSizing: 'border-box' }}
        />
        <button
          onClick={enviar}
          className="df-btn-primary"
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

type Pestana = 'personalidad' | 'negocio' | 'venta' | 'reglas';
const PESTANAS: { id: Pestana; t: string }[] = [
  { id: 'personalidad', t: '🎭 Personalidad' },
  { id: 'negocio', t: '🏪 Tu negocio' },
  { id: 'venta', t: '💰 Cómo vende' },
  { id: 'reglas', t: '🛡️ Reglas y límites' },
];

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
  const tarjeta: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', minWidth: 0 };

  return (
    <section data-screen-label="Asistente">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Asistente</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 16px' }}>Dale personalidad, enséñale tu negocio y dile cómo vender. Pruébalo al lado mientras lo ajustas.</p>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={tarjeta}>
          <div style={{ display: 'flex', gap: 4, padding: '10px 10px 0', borderBottom: '1px solid var(--df-border)', overflowX: 'auto' }}>
            {PESTANAS.map((p) => {
              const activo = tab === p.id;
              return (
                <button key={p.id} onClick={() => elegirTab(p.id)}
                  style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activo ? 'var(--df-brand)' : 'transparent'}`, color: activo ? 'var(--df-text-strong)' : 'var(--df-text-muted)', fontWeight: activo ? 800 : 600, fontSize: 13, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {p.t}
                </button>
              );
            })}
          </div>

          <div style={{ padding: 20 }}>
            {tab === 'personalidad' && (
              <>
                <Campo titulo="Nombre del asistente" ayuda="Con este nombre se presenta al cliente (ej: Sky). Si lo dejas vacío, usa el nombre de tu tienda.">
                  <input className="df-input" value={df.assistantNombre} onChange={(ev) => df.setAssistantNombre(ev.target.value)} placeholder="Ej: Sky" style={inputSt} />
                </Campo>
                <Campo titulo="Personalidad" ayuda="Cómo se siente hablar con él.">
                  <OpcionCards value={e.personalidad} onPick={(v) => set({ personalidad: v })} opciones={[
                    { v: 'amigable', icono: '😊', t: 'Amigable', d: 'Cálido y cercano, como un amigo que sabe.' },
                    { v: 'profesional', icono: '👔', t: 'Profesional', d: 'Claro, respetuoso y serio.' },
                    { v: 'divertido', icono: '🎉', t: 'Divertido', d: 'Buena energía y humor ligero.' },
                    { v: 'experto', icono: '🧠', t: 'Asesor experto', d: 'Explica beneficios con seguridad.' },
                    { v: 'directo', icono: '⚡', t: 'Directo', d: 'Al grano, facilita la compra.' },
                  ]} />
                </Campo>
                <Campo titulo="Idioma" ayuda="En qué idioma le habla a tus clientes. Incluye los mensajes automáticos (confirmación del pedido, estados y guía).">
                  <OpcionCards min={150} value={e.idioma || 'es'} onPick={(v) => set({ idioma: v })} opciones={[
                    { v: 'es', icono: '🇪🇸', t: 'Español', d: 'Siempre en español.' },
                    { v: 'en', icono: '🇺🇸', t: 'English', d: 'Always in English.' },
                    { v: 'auto', icono: '🌐', t: 'Automático', d: 'Responde en el idioma en que le escriben.' },
                  ]} />
                </Campo>
                <Campo titulo="Tono y estilo" ayuda="Se aplica a todas sus respuestas (incluido el seguimiento).">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    <SegChips label="Trato" value={e.trato} opciones={[{ v: 'tu', t: 'Tú (cercano)' }, { v: 'usted', t: 'Usted (formal)' }]} onPick={(v) => set({ trato: v })} />
                    <SegChips label="Emojis" value={emojiNivel} opciones={[{ v: 'nada', t: 'Sin emojis' }, { v: 'pocos', t: 'Pocos' }, { v: 'muchos', t: 'Muchos' }]} onPick={(v) => set({ emojiNivel: v, emojis: v !== 'nada' })} />
                    <SegChips label="Respuestas" value={e.largo || 'corto'} opciones={[{ v: 'corto', t: 'Cortas' }, { v: 'medio', t: 'Medias' }, { v: 'detallado', t: 'Detalladas' }]} onPick={(v) => set({ largo: v })} />
                    <SegChips label="Forma de hablar" value={e.modismos || 'neutro'} opciones={[{ v: 'neutro', t: 'Neutral' }, { v: 'colombiano', t: 'Colombiana' }]} onPick={(v) => set({ modismos: v })} />
                  </div>
                </Campo>
                <Campo titulo="Saludo" ayuda="Cómo saluda en el primer mensaje (si no se envía un mensaje inicial de producto). Déjalo vacío para que salude a su manera.">
                  <textarea className="df-input" rows={2} value={e.saludo || ''} onChange={(ev) => set({ saludo: ev.target.value })} placeholder="Ej: ¡Hola! Bienvenido a Luna Accesorios 💜 Soy Sky, ¿qué estás buscando hoy?" style={inputSt} />
                </Campo>
                <Campo titulo="Despedida" ayuda="Cómo se despide cuando el cliente da las gracias o se va.">
                  <textarea className="df-input" rows={2} value={e.despedida || ''} onChange={(ev) => set({ despedida: ev.target.value })} placeholder="Ej: ¡Gracias por escribirnos! Aquí estamos cuando nos necesites 🙌" style={inputSt} />
                </Campo>
              </>
            )}

            {tab === 'negocio' && (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 14, lineHeight: 1.5 }}>Lo que escribas aquí el asistente lo responde <b>tal cual</b> cuando le pregunten. Lo que dejes vacío, no lo menciona ni lo inventa.</div>
                <Campo titulo="🚚 Envíos" ayuda="Tiempos de entrega, costo del envío, a qué ciudades llegas.">
                  <textarea className="df-input" rows={2} value={negocio.envios || ''} onChange={(ev) => setNegocio({ envios: ev.target.value })} placeholder="Ej: Enviamos a toda Colombia. Llega en 2 a 5 días hábiles. Envío gratis desde $150.000." style={inputSt} />
                </Campo>
                <Campo titulo="💳 Formas de pago">
                  <textarea className="df-input" rows={2} value={negocio.pagos || ''} onChange={(ev) => setNegocio({ pagos: ev.target.value })} placeholder="Ej: Pago contra entrega en efectivo. También Nequi y Bancolombia." style={inputSt} />
                </Campo>
                <Campo titulo="🔄 Cambios y garantía">
                  <textarea className="df-input" rows={2} value={negocio.cambios || ''} onChange={(ev) => setNegocio({ cambios: ev.target.value })} placeholder="Ej: Cambios por talla dentro de los 5 días siguientes a la entrega." style={inputSt} />
                </Campo>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 12px' }}>
                  <Campo titulo="🕘 Horario de atención">
                    <input className="df-input" value={negocio.horario || ''} onChange={(ev) => setNegocio({ horario: ev.target.value })} placeholder="Ej: Lunes a sábado, 8 a.m. a 7 p.m." style={inputSt} />
                  </Campo>
                  <Campo titulo="📍 Ubicación / redes">
                    <input className="df-input" value={negocio.ubicacion || ''} onChange={(ev) => setNegocio({ ubicacion: ev.target.value })} placeholder="Ej: Solo tienda virtual · @lunaaccesorios" style={inputSt} />
                  </Campo>
                </div>
                <Campo titulo="📝 Otra información" ayuda="Cualquier otra cosa que deba saber: quiénes son, materiales, promociones fijas, etc.">
                  <textarea className="df-input" rows={3} value={negocio.extra || ''} onChange={(ev) => setNegocio({ extra: ev.target.value })} style={inputSt} />
                </Campo>
                <Campo titulo="❓ Preguntas frecuentes" ayuda="Preguntas que te hacen mucho, con la respuesta exacta que quieres que dé.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {faqs.length === 0 && <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Aún no hay preguntas. Agrega la primera.</div>}
                    {faqs.map((f, i) => (
                      <div key={i} style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input className="df-input" value={f.pregunta} placeholder="Pregunta (ej: ¿Hacen envíos el mismo día?)" onChange={(ev) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, pregunta: ev.target.value } : x)) })} style={{ ...inputSt, fontWeight: 600 }} />
                          <textarea className="df-input" rows={2} value={f.respuesta} placeholder="Respuesta" onChange={(ev) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, respuesta: ev.target.value } : x)) })} style={inputSt} />
                        </div>
                        <span onClick={() => set({ faqs: faqs.filter((_, j) => j !== i) })} className="df-danger-hover" title="Quitar" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</span>
                      </div>
                    ))}
                    <button onClick={() => set({ faqs: [...faqs, { pregunta: '', respuesta: '' }] })} className="df-btn-outline-green"
                      style={{ alignSelf: 'flex-start', background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      + Agregar pregunta
                    </button>
                  </div>
                </Campo>
              </>
            )}

            {tab === 'venta' && (
              <>
                <Campo titulo="Qué tanto insiste" ayuda="Qué tan activo es para llevar al cliente a comprar.">
                  <OpcionCards min={170} value={e.insistencia || 'equilibrada'} onPick={(v) => set({ insistencia: v })} opciones={[
                    { v: 'suave', icono: '🌱', t: 'Suave', d: 'Informa y deja decidir. Cero presión.' },
                    { v: 'equilibrada', icono: '⚖️', t: 'Equilibrada', d: 'Resuelve y propone el siguiente paso.' },
                    { v: 'persuasiva', icono: '🔥', t: 'Persuasiva', d: 'Resalta beneficios y maneja objeciones.' },
                  ]} />
                </Campo>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Sugerir combos y complementos</div>
                    <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Cuando el cliente ya eligió, le ofrece una vez un combo o un producto que combine.</div>
                  </div>
                  <Switch on={!!e.sugerirCombos} onChange={() => set({ sugerirCombos: !e.sugerirCombos })} />
                </div>
                <Campo titulo="Instrucciones de venta" ayuda="Escríbelo como se lo dirías a un empleado nuevo: qué ofrecer, cómo responder precios, qué destacar.">
                  <textarea className="df-input" value={df.assistantText} onChange={(ev) => df.setAssistantText(ev.target.value)} rows={9} style={{ ...inputSt, fontSize: 14, lineHeight: 1.6 }} />
                </Campo>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Mensaje automático de actividad 💬</div>
                    <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Si el cliente deja de responder, le vuelve a escribir a los <b>5 min</b>, <b>30 min</b> y <b>1 hora</b>, según lo que hablaban. Se detiene apenas responde y respeta la ventana de 24 h.</div>
                  </div>
                  <Switch on={df.seguimientoActivo} onChange={df.toggleSeguimientoActivo} />
                </div>
              </>
            )}

            {tab === 'reglas' && (
              <>
                <Campo titulo="Reglas" ayuda="Se cumplen siempre, pase lo que pase.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                    {df.rules.length === 0 && <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '4px 2px' }}>Aún no hay reglas. Agrega la primera abajo.</div>}
                    {df.rules.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px' }}>
                        <span style={{ color: 'var(--df-text-faint)', fontWeight: 700, flexShrink: 0, fontSize: 12, minWidth: 18, marginTop: 6 }}>{i + 1}</span>
                        <textarea value={r.texto} onChange={(ev) => r.editar(ev.target.value)} rows={1} className="df-input"
                          style={{ flex: 1, fontSize: 13, lineHeight: 1.5, border: '1px solid transparent', background: 'transparent', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', resize: 'vertical', color: 'var(--df-text-strong)' }}
                          onFocus={(ev) => { ev.currentTarget.style.background = 'var(--df-surface)'; ev.currentTarget.style.borderColor = 'var(--df-border)'; }}
                          onBlur={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.borderColor = 'transparent'; }} />
                        <span onClick={r.remove} className="df-danger-hover" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2, marginTop: 6 }}>✕</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="df-input" value={df.ruleDraft} onChange={(ev) => df.setRuleDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') df.addRule(); }} placeholder="Escribe una regla nueva…" style={{ ...inputSt, flex: 1 }} />
                    <button onClick={df.addRule} className="df-btn-outline-green" style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agregar regla</button>
                  </div>
                </Campo>
                <Campo titulo="🚫 Nunca debe…" ayuda="Temas, palabras o promesas que el asistente jamás debe tocar.">
                  <textarea className="df-input" rows={3} value={e.prohibido || ''} onChange={(ev) => set({ prohibido: ev.target.value })} placeholder="Ej: Hablar de la competencia, prometer fechas exactas de entrega, dar descuentos, hablar de política." style={inputSt} />
                </Campo>
                <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>🙋 Pasar el chat a una persona</div>
                      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Cuando pase lo que indiques, el asistente avisa al cliente y deja de responder. El chat queda en el Inbox como “Equipo (pidió asesor)” para que lo atiendas.</div>
                    </div>
                    <Switch on={humano.activo !== false} onChange={() => setHumano({ activo: humano.activo === false })} />
                  </div>
                  {humano.activo !== false && (
                    <div style={{ marginTop: 12 }}>
                      <Campo titulo="¿Cuándo?" ayuda="Si lo dejas vacío: cuando pidan un asesor, tengan una queja o pregunten algo que no sabe.">
                        <textarea className="df-input" rows={2} value={humano.cuando || ''} onChange={(ev) => setHumano({ cuando: ev.target.value })} placeholder="Ej: pidan hablar con alguien, quieran comprar al por mayor, o tengan un reclamo de un pedido." style={inputSt} />
                      </Campo>
                      <Campo titulo="Mensaje al pasar el chat">
                        <input className="df-input" value={humano.mensaje || ''} onChange={(ev) => setHumano({ mensaje: ev.target.value })} placeholder="Ya mismo te comunico con una persona de nuestro equipo 🙌" style={inputSt} />
                      </Campo>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--df-border)', background: 'var(--df-surface-2)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
            <button onClick={df.saveAssistant} className="df-btn-primary"
              style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Guardar cambios
            </button>
            {df.assistantSaved
              ? <span style={{ color: 'var(--df-brand)', fontSize: 13, fontWeight: 600 }}>✓ Guardado. El asistente ya responde así.</span>
              : <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Las opciones se guardan solas; el nombre, las instrucciones y las reglas, con este botón.</span>}
          </div>
        </div>

        <div style={{ position: 'sticky', top: 12, minWidth: 0 }}>
          {df.apiMode && df.storeId
            ? <PruebaAsistente storeId={df.storeId} />
            : <div style={{ ...tarjeta, padding: 20, color: 'var(--df-text-muted)', fontSize: 13 }}>🧪 El chat de prueba está disponible cuando tu tienda está conectada.</div>}
        </div>
      </div>
    </section>
  );
}
