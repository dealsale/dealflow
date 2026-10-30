import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { archivosDePortapapeles } from '../lib/clipboard';
import { marcarEscribiendo } from '../lib/presencia';
import { apiUsoRespuestaRapida, type RespuestaRapida } from '../lib/api';
import { llenarRespuesta, useRespuestasRapidas } from '../lib/respuestasRapidas';
import { EmojiPicker } from './EmojiPicker';
import { RespuestasRapidasModal } from './RespuestasRapidas';

// Borradores por chat: si cambias de chat y vuelves, el texto sigue ahí.
const borradores = new Map<string, string>();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Caja de texto del Inbox. El texto vive AQUÍ (estado local), no en el estado
 * global de la app: antes cada tecla recalculaba toda la aplicación (pedidos,
 * productos, chats…) y escribir se sentía lento con muchos datos.
 * Escribiendo "/" salen los mensajes rápidos de la tienda; 😊 abre los emojis.
 */
export function CajaMensaje({ chatId, onSend, onFile, placeholder, inputStyle, botonStyle, enviarConEnter = true, nombreCliente = '', botonSize = 40, conEmojis = true }: {
  chatId: string; onSend: (texto: string) => void; onFile: (f: File) => void; placeholder: string;
  inputStyle: CSSProperties; botonStyle: CSSProperties; enviarConEnter?: boolean; nombreCliente?: string; botonSize?: number;
  /** En el celular no hace falta: el teclado ya trae emojis. */
  conEmojis?: boolean;
}) {
  const [texto, setTexto] = useState(() => borradores.get(chatId) || '');
  const [pos, setPos] = useState(0);
  const [sel, setSel] = useState(0);
  const [cerrada, setCerrada] = useState(false);
  const [gestionar, setGestionar] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const respuestas = useRespuestasRapidas();
  useEffect(() => { setTexto(borradores.get(chatId) || ''); }, [chatId]);
  // Crece con el texto (hasta ~6 líneas).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 150)}px`;
  }, [texto]);
  const cambiar = (v: string, caret?: number) => {
    setTexto(v); borradores.set(chatId, v); setCerrada(false); setSel(0);
    if (caret !== undefined) {
      setPos(caret);
      requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(caret, caret); } });
    }
    if (v) marcarEscribiendo(chatId);
  };
  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    onSend(t);
    cambiar('');
  };

  // "/" al inicio o después de un espacio: lo que sigue (hasta el cursor) es la búsqueda.
  const m = cerrada ? null : /(^|\s)\/([^\s/]*)$/.exec(texto.slice(0, pos));
  const q = m ? norm(m[2]) : null;
  const opciones = q === null ? [] : respuestas.filter((r) => !q || r.atajo.includes(q) || norm(r.texto).includes(q)).slice(0, 8);
  const usar = (r: RespuestaRapida) => {
    if (!m) return;
    const inicio = pos - m[2].length - 1;
    const pegado = llenarRespuesta(r.texto, nombreCliente);
    cambiar(texto.slice(0, inicio) + pegado + texto.slice(pos), inicio + pegado.length);
    void apiUsoRespuestaRapida(r.id);
  };
  const emoji = (e: string) => {
    const el = ref.current;
    const a = el ? el.selectionStart : texto.length;
    const b = el ? el.selectionEnd : texto.length;
    cambiar(texto.slice(0, a) + e + texto.slice(b), a + e.length);
  };

  return (
    <>
      {conEmojis && <EmojiPicker onEmoji={emoji} size={botonSize} />}
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
        {q !== null && (
          <div role="listbox" aria-label="Mensajes rápidos"
            style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, minWidth: '100%', width: 'min(420px, calc(100vw - 32px))', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 10px 34px rgba(15,23,42,.28)', zIndex: 60, padding: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-faint)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 8px' }}>Mensajes rápidos</div>
            {!opciones.length && (
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', padding: '6px 8px' }}>
                {respuestas.length ? `Ninguno coincide con "/${m![2]}".` : 'Todavía no tienes mensajes rápidos.'}
              </div>
            )}
            {opciones.map((r, i) => (
              <button key={r.id} type="button" role="option" aria-selected={i === sel}
                onMouseDown={(e) => { e.preventDefault(); usar(r); }} onMouseEnter={() => setSel(i)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: i === sel ? 'var(--df-surface-2)' : 'transparent', border: 'none', borderRadius: 8, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--df-text)' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>/{r.atajo}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{llenarRespuesta(r.texto, nombreCliente)}</span>
              </button>
            ))}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); setGestionar(opciones.length ? '' : (m?.[2] || '')); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--df-border)', marginTop: 4, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--df-brand-dark)' }}>
              {opciones.length ? '⚙ Crear y editar mensajes rápidos' : `＋ Crear mensaje rápido${m?.[2] ? ` /${m[2]}` : ''}`}
            </button>
          </div>
        )}
        <textarea
          ref={ref}
          className="df-input"
          rows={1}
          value={texto}
          onChange={(e) => { cambiar(e.target.value); setPos(e.target.selectionStart); }}
          onSelect={(e) => setPos(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (q !== null && opciones.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % opciones.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + opciones.length) % opciones.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); usar(opciones[Math.min(sel, opciones.length - 1)]); return; }
            }
            if (q !== null && e.key === 'Escape') { e.preventDefault(); setCerrada(true); return; }
            if (enviarConEnter && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
          onBlur={() => setTimeout(() => setCerrada(true), 150)}
          onFocus={() => setCerrada(false)}
          onPaste={(e) => { const fs = archivosDePortapapeles(e); if (fs.length) { e.preventDefault(); fs.forEach(onFile); } }}
          placeholder={placeholder}
          style={{ ...inputStyle, flex: 1, width: '100%', boxSizing: 'border-box', resize: 'none', lineHeight: 1.4, overflowY: 'auto', display: 'block' }}
        />
      </div>
      <button onClick={enviar} className="df-btn-primary" style={botonStyle}>Enviar</button>
      {gestionar !== null && <RespuestasRapidasModal atajoInicial={gestionar} onCerrar={() => { setGestionar(null); ref.current?.focus(); }} />}
    </>
  );
}
