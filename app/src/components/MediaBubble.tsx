import { useEffect, useState } from 'react';
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
    return <AudioChat url={url} />;
  }
  if (tipo === 'document' && url) {
    const linkColor: CSSProperties = { color: m.de === 'vendedor' ? '#fff' : 'var(--df-brand)', textDecoration: 'underline' };
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
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, minWidth: size, borderRadius: 8, cursor: 'pointer', color: 'var(--df-text-muted)', flexShrink: 0 }}
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

/**
 * Nota de voz del chat. En el celular (sobre todo iPhone y la app instalada) el reproductor no
 * suena con webm/ogg —lo que graban Chrome/Android y lo que manda WhatsApp— y a veces pide el
 * archivo sin la sesión. Por eso se descarga la versión .m4a (suena en todos) con la sesión y se
 * reproduce desde memoria. Los audios recién grabados (data:/blob:) se reproducen tal cual.
 */
const audiosListos = new Map<string, Promise<string>>();
function urlEscuchable(url: string): Promise<string> {
  let p = audiosListos.get(url);
  if (!p) {
    p = fetch(url + (url.includes('?') ? '&' : '?') + 'formato=m4a', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => audiosListos.delete(url)); // si falla, se reintenta la próxima vez
    audiosListos.set(url, p);
  }
  return p;
}
export function AudioChat({ url, ancho = 240 }: { url: string; ancho?: number }) {
  const directo = url.startsWith('data:') || url.startsWith('blob:') || !url.startsWith('/api/media/');
  const [src, setSrc] = useState(directo ? url : '');
  const [error, setError] = useState(false);
  useEffect(() => {
    if (directo) { setSrc(url); return; }
    let vivo = true;
    setError(false);
    urlEscuchable(url).then((u) => { if (vivo) setSrc(u); }).catch(() => { if (vivo) { setError(true); setSrc(url); } });
    return () => { vivo = false; };
  }, [url, directo]);
  if (!src) return <div style={{ fontSize: 12, opacity: 0.7, padding: '6px 2px', minWidth: 160 }}>🎤 Cargando audio…</div>;
  return (
    <div>
      <audio src={src} controls preload="metadata" playsInline style={{ maxWidth: ancho, display: 'block' }} />
      {error && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'inherit', textDecoration: 'underline' }}>Abrir audio</a>}
    </div>
  );
}
