import type { CSSProperties } from 'react';
import type { DecoratedMensaje } from '../hooks/useDealFlowState';

/** Contenido de una burbuja de chat: texto o adjunto (imagen/video/audio/archivo). */
export function MediaContent({ m }: { m: DecoratedMensaje }) {
  const tipo = m.tipo || 'texto';
  const url = m.mediaUrl || '';

  if (tipo === 'image' && url) {
    return (
      <div>
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={m.mediaNombre || 'imagen'} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block' }} />
        </a>
        {m.texto && <div style={{ marginTop: 6 }}>{m.texto}</div>}
      </div>
    );
  }
  if (tipo === 'video' && url) {
    return (
      <div>
        <video src={url} controls style={{ maxWidth: 240, borderRadius: 8, display: 'block' }} />
        {m.texto && <div style={{ marginTop: 6 }}>{m.texto}</div>}
      </div>
    );
  }
  if (tipo === 'audio' && url) {
    return <audio src={url} controls style={{ maxWidth: 240 }} />;
  }
  if (tipo === 'document' && url) {
    const linkColor: CSSProperties = { color: m.de === 'vendedor' ? '#fff' : '#059669', textDecoration: 'underline' };
    return (
      <a href={url} target="_blank" rel="noreferrer" download={m.mediaNombre || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...linkColor }}>
        <span style={{ fontSize: 16 }}>📎</span>
        <span>{m.mediaNombre || 'Descargar archivo'}</span>
      </a>
    );
  }
  return <>{m.texto}</>;
}

/** Botón de adjuntar (clip) que abre el selector de archivos. */
export function AttachButton({ onFile, size = 44 }: { onFile: (f: File) => void; size?: number }) {
  return (
    <label
      className="df-close-hover"
      title="Adjuntar imagen, video o archivo"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, minWidth: size, borderRadius: 8, cursor: 'pointer', color: '#64748B', flexShrink: 0 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.42l8.48-8.48" />
      </svg>
      <input
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
