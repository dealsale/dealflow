import { useState } from 'react';
import { IcoTexto, type NombreIcono } from './Icono';
import { PhotoAddChip } from './PhotoUpload';
import { AutoTextarea } from './AutoTextarea';
import { archivosDePortapapeles } from '../lib/clipboard';
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

// Cada tipo de bloque con su color e icono, para distinguirlos de un vistazo.
const TIPO: Record<string, { nombre: string; icono: NombreIcono; color: string }> = {
  texto: { nombre: 'Texto', icono: 'chat', color: '#38BDF8' },
  imagen: { nombre: 'Imagen', icono: 'imagen', color: '#C084FC' },
  video: { nombre: 'Video', icono: 'video', color: '#F87171' },
  audio: { nombre: 'Audio', icono: 'microfono', color: '#FBBF24' },
};
const accionBloque: React.CSSProperties = { background: 'none', border: '1px solid var(--df-border)', borderRadius: 7, padding: '3px 8px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-body)', cursor: 'pointer' };

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
                  background: 'var(--df-bg)',
                  border: '1px solid ' + (esObjetivo ? 'var(--df-brand)' : 'var(--df-border)'),
                  borderLeft: `4px solid ${TIPO[b.tipo]?.color || 'var(--df-border)'}`,
                  boxShadow: esObjetivo ? '0 -2px 0 var(--df-brand) inset' : 'none',
                  borderRadius: 10, padding: '8px 10px 10px', opacity: drag === i ? 0.4 : 1,
                }}
              >
                {/* Encabezado del bloque: orden, tipo (con su color) y acciones. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <span draggable onDragStart={() => setDrag(i)} title="Arrastra para cambiar el orden"
                    style={{ color: 'var(--df-text-muted)', fontSize: 16, cursor: 'grab', lineHeight: 1 }}>⠿</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text-strong)' }}>Bloque {i + 1}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', color: TIPO[b.tipo]?.color, background: `color-mix(in srgb, ${TIPO[b.tipo]?.color || '#888'} 16%, transparent)` }}>
                    {TIPO[b.tipo] && <IcoTexto n={TIPO[b.tipo].icono} tam={13} color={TIPO[b.tipo].color} />}{TIPO[b.tipo]?.nombre || b.tipo}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button onClick={b.duplicate} className="df-copy-hover" title="Duplicar este bloque" style={accionBloque}>⧉ Duplicar</button>
                  <button onClick={b.remove} className="df-danger-hover" title="Quitar este bloque" style={accionBloque}>✕ Quitar</button>
                </div>
                {b.tipo === 'texto' ? (
                  <AutoTextarea
                    value={b.valor || ''}
                    onChange={(v) => b.editText(v)}
                    placeholder="Escribe el texto de este mensaje…"
                    style={{ width: '100%', minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.55, minHeight: 40, boxSizing: 'border-box', background: 'var(--df-surface)', color: 'var(--df-text-strong)' }}
                  />
                ) : (
                  <MediaEnBloque b={b} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text-body)', margin: `${bloques.length ? 14 : 2}px 0 6px` }}>{bloques.length ? '＋ Agregar otro bloque' : '＋ Agrega el primer bloque'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1.5px dashed var(--df-border-strong)', borderRadius: 10, padding: 8 }}>
        <input
          className="df-input"
          value={textoDraft}
          onChange={(e) => setTextoDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAddTexto(); }}
          onPaste={(e) => {
            const fs = archivosDePortapapeles(e);
            if (!fs.length) return; // texto normal: dejar pegar
            e.preventDefault();
            const imgs = fs.filter((f) => f.type.startsWith('image/'));
            const vids = fs.filter((f) => f.type.startsWith('video/'));
            const auds = fs.filter((f) => f.type.startsWith('audio/'));
            if (imgs.length) onAddImagen(imgs);
            if (vids.length) onAddVideo(vids);
            if (auds.length) onAddAudio(auds);
          }}
          placeholder={placeholderTexto || 'Escribe un bloque de texto… (o pega una imagen/audio/video)'}
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
