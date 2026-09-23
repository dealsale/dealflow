import { useState } from 'react';
import { PhotoAddChip } from './PhotoUpload';
import { AutoTextarea } from './AutoTextarea';
import type { MensajeBloque } from '../types';

/** Un bloque con sus acciones ya "cableadas" (viene decorado del hook). */
export interface BloqueEditable extends MensajeBloque {
  mediaLista: string[];
  remove: () => void;
  editText: (valor: string) => void;
  duplicate: () => void;
  addMedia: (files: File[]) => void;
  removeMedia: (mediaIndex: number) => void;
  moverMedia: (from: number, to: number) => void;
}

/** Contenido de un bloque de imagen/video/audio: varias piezas, cada una con quitar y mover. */
function MediaEnBloque({ b }: { b: BloqueEditable }) {
  const esVideo = b.tipo === 'video';
  const esAudio = b.tipo === 'audio';
  return (
    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {b.mediaLista.map((src, k) => (
        <div key={k} style={{ position: 'relative', flexShrink: 0 }}>
          {esVideo
            ? <video src={src} controls style={{ width: 150, maxWidth: '100%', borderRadius: 8, background: '#0F172A', display: 'block' }} />
            : esAudio
            ? <audio src={src} controls style={{ height: 40, maxWidth: '100%', display: 'block' }} />
            : <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(15,23,42,.1)', display: 'block' }} />}
          <span
            onClick={() => b.removeMedia(k)}
            title="Quitar esta pieza"
            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#0F172A', color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }}
          >✕</span>
          <div style={{ position: 'absolute', bottom: 3, left: 3, display: 'flex', gap: 3 }}>
            {k > 0 && (
              <span onClick={() => b.moverMedia(k, k - 1)} title="Mover a la izquierda"
                style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', cursor: 'pointer' }}>◀</span>
            )}
            {k < b.mediaLista.length - 1 && (
              <span onClick={() => b.moverMedia(k, k + 1)} title="Mover a la derecha"
                style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', cursor: 'pointer' }}>▶</span>
            )}
          </div>
        </div>
      ))}
      <PhotoAddChip label={esVideo ? '+ Video' : esAudio ? '+ Audio' : '+ Imagen'} accept={esVideo ? 'video/*' : esAudio ? 'audio/*' : undefined} onFiles={b.addMedia} />
    </div>
  );
}

/**
 * Editor de bloques (texto/imagen/video/audio) con arrastrar-para-reordenar y una
 * fila para agregar bloques. Lo comparten el "mensaje inicial" del producto y los
 * flujos de remarketing.
 */
export function BloquesBuilder({ bloques, moverBloque, textoDraft, setTextoDraft, onAddTexto, onAddImagen, onAddVideo, onAddAudio, placeholderTexto }: {
  bloques: BloqueEditable[];
  moverBloque: (from: number, to: number) => void;
  textoDraft: string;
  setTextoDraft: (v: string) => void;
  onAddTexto: () => void;
  onAddImagen: (files: File[]) => void;
  onAddVideo: (files: File[]) => void;
  onAddAudio: (files: File[]) => void;
  placeholderTexto?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <>
      {bloques.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bloques.map((b, i) => {
            const esObjetivo = over === i && drag !== null && drag !== i;
            return (
              <div
                key={i}
                onDragEnter={() => setOver(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null) moverBloque(drag, i); setDrag(null); setOver(null); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-surface)',
                  border: '1px solid ' + (esObjetivo ? 'var(--df-brand)' : 'var(--df-border)'),
                  boxShadow: esObjetivo ? '0 -2px 0 var(--df-brand) inset' : 'none',
                  borderRadius: 10, padding: '9px 12px', opacity: drag === i ? 0.4 : 1,
                }}
              >
                <span
                  draggable
                  onDragStart={() => setDrag(i)}
                  title="Arrastra para reordenar"
                  style={{ color: 'var(--df-border-strong)', fontSize: 16, flexShrink: 0, cursor: 'grab', lineHeight: 1, marginTop: 6 }}
                >⠿</span>
                <span style={{ background: 'var(--df-surface-2)', color: 'var(--df-text-muted)', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", marginTop: 4 }}>{i + 1}</span>
                <span style={{ color: 'var(--df-text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', width: 52, flexShrink: 0, marginTop: 5 }}>
                  {b.tipo === 'texto' ? 'Texto' : b.tipo === 'imagen' ? 'Imagen' : b.tipo === 'audio' ? 'Audio' : 'Video'}
                </span>
                {b.tipo === 'texto' ? (
                  <AutoTextarea
                    value={b.valor || ''}
                    onChange={(v) => b.editText(v)}
                    placeholder="Escribe el texto de este bloque…"
                    style={{ flex: 1, minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, minHeight: 38, boxSizing: 'border-box' }}
                  />
                ) : (
                  <MediaEnBloque b={b} />
                )}
                <span onClick={b.duplicate} className="df-copy-hover" title="Duplicar este bloque" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2, alignSelf: 'flex-start', marginTop: 4 }}>⧉</span>
                <span onClick={b.remove} className="df-danger-hover" title="Quitar bloque" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2, alignSelf: 'flex-start', marginTop: 4 }}>✕</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="df-input"
          value={textoDraft}
          onChange={(e) => setTextoDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAddTexto(); }}
          placeholder={placeholderTexto || 'Escribe un bloque de texto…'}
          style={{ flex: 1, minWidth: 220, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
        />
        <button onClick={onAddTexto} className="df-btn-outline-green" style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Texto</button>
        <PhotoAddChip label="+ Imagen" onFiles={onAddImagen} />
        <PhotoAddChip label="+ Video" accept="video/*" onFiles={onAddVideo} />
        <PhotoAddChip label="+ Audio" accept="audio/*" onFiles={onAddAudio} />
      </div>
    </>
  );
}
