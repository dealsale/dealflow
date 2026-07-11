import { useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';

/** Lee archivos de un tipo dado (image/, video/…) como data URLs. */
export function readFilesAsDataUrls(files: File[], mimePrefix: string): Promise<string[]> {
  const list = files.filter((f) => f.type.startsWith(mimePrefix));
  return Promise.all(
    list.map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        }),
    ),
  );
}

/** Lee imágenes como data URLs para guardarlas en el estado. */
export function readImagesAsDataUrls(files: File[]): Promise<string[]> {
  return readFilesAsDataUrls(files, 'image/');
}

/**
 * Reduce una imagen (máx ~1600px, JPEG) antes de subirla: las fotos de celular
 * pesan varios MB y así el envío es liviano y no falla. Si el navegador no la
 * puede decodificar, devuelve la original.
 */
export function comprimirImagen(file: File, max = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const fallback = () => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    };
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > max || height > max) {
          if (width >= height) { height = Math.round((height * max) / width); width = max; }
          else { width = Math.round((width * max) / height); height = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { fallback(); return; }
        ctx.drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); } catch { fallback(); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); fallback(); };
      img.src = url;
    } catch {
      fallback();
    }
  });
}

function useFilePick(onFiles: (files: File[]) => void, accept = 'image/*') {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const dragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple
      style={{ display: 'none' }}
      onChange={(e) => {
        if (e.target.files?.length) onFiles(Array.from(e.target.files));
        e.target.value = '';
      }}
    />
  );

  return { open: () => inputRef.current?.click(), over, dragProps, input };
}

/** Casilla punteada "Subir foto": clic para elegir o arrastra y suelta. */
export function PhotoDropTile({ size = 64, label = 'Subir foto', accept = 'image/*', onFiles }: { size?: number; label?: string; accept?: string; onFiles: (files: File[]) => void }) {
  const { open, over, dragProps, input } = useFilePick(onFiles, accept);
  return (
    <div
      onClick={open}
      {...dragProps}
      className={over ? '' : 'df-upload-tile'}
      style={{
        width: size,
        height: size,
        border: '1px dashed ' + (over ? '#059669' : '#CBD5E1'),
        background: over ? '#ECFDF5' : 'transparent',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        color: over ? '#059669' : '#64748B',
        fontSize: size < 64 ? 9.5 : 10.5,
        fontWeight: 600,
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: size < 64 ? 15 : 16, lineHeight: 1 }}>＋</span>
      <span>{label}</span>
      {input}
    </div>
  );
}

/** Chip "+ Foto" para variantes: clic para elegir o arrastra y suelta. */
export function PhotoAddChip({ onFiles, label = '+ Foto', accept = 'image/*' }: { onFiles: (files: File[]) => void; label?: string; accept?: string }) {
  const { open, over, dragProps, input } = useFilePick(onFiles, accept);
  return (
    <span
      onClick={open}
      {...dragProps}
      className={over ? '' : 'df-upload-tile'}
      style={{
        border: '1px dashed ' + (over ? '#059669' : '#CBD5E1'),
        background: over ? '#ECFDF5' : 'transparent',
        color: over ? '#059669' : '#64748B',
        borderRadius: 6,
        padding: '4px 9px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {input}
    </span>
  );
}

/** Miniatura de una foto subida, con botón para quitarla. */
export function UploadedThumb({ src, size, onRemove, style }: { src: string; size: number; onRemove: () => void; style?: CSSProperties }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: size >= 40 ? 10 : 5, border: '1px solid rgba(15,23,42,.1)', display: 'block' }} />
      <span
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Quitar foto"
        style={{
          position: 'absolute',
          top: -5,
          right: -5,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#0F172A',
          color: '#fff',
          fontSize: 9,
          lineHeight: '16px',
          textAlign: 'center',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(15,23,42,.3)',
        }}
      >
        ✕
      </span>
    </div>
  );
}
