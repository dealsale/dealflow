import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { archivosDePortapapeles } from '../lib/clipboard';

// Borradores por chat: si cambias de chat y vuelves, el texto sigue ahí.
const borradores = new Map<string, string>();

/**
 * Caja de texto del Inbox. El texto vive AQUÍ (estado local), no en el estado
 * global de la app: antes cada tecla recalculaba toda la aplicación (pedidos,
 * productos, chats…) y escribir se sentía lento con muchos datos.
 */
export function CajaMensaje({ chatId, onSend, onFile, placeholder, inputStyle, botonStyle, enviarConEnter = true }: {
  chatId: string; onSend: (texto: string) => void; onFile: (f: File) => void; placeholder: string;
  inputStyle: CSSProperties; botonStyle: CSSProperties; enviarConEnter?: boolean;
}) {
  const [texto, setTexto] = useState(() => borradores.get(chatId) || '');
  useEffect(() => { setTexto(borradores.get(chatId) || ''); }, [chatId]);
  const cambiar = (v: string) => { setTexto(v); borradores.set(chatId, v); };
  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    onSend(t);
    cambiar('');
  };
  return (
    <>
      <input
        className="df-input"
        value={texto}
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={(e) => { if (enviarConEnter && e.key === 'Enter') enviar(); }}
        onPaste={(e) => { const fs = archivosDePortapapeles(e); if (fs.length) { e.preventDefault(); fs.forEach(onFile); } }}
        placeholder={placeholder}
        style={inputStyle}
      />
      <button onClick={enviar} className="df-btn-primary" style={botonStyle}>Enviar</button>
    </>
  );
}
