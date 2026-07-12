import { useRef, useState } from 'react';

/** Botón de micrófono que graba una nota de voz y la entrega como archivo. */
export function VoiceRecorder({ onRecorded, size = 40 }: { onRecorded: (f: File) => void; size?: number }) {
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cancelRef = useRef(false);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Tu navegador no permite grabar audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setRec(false);
        setSecs(0);
        if (cancelRef.current) return;
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 800) return; // grabación demasiado corta
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        onRecorded(new File([blob], 'nota-de-voz.' + ext, { type }));
      };
      mr.start();
      mrRef.current = mr;
      setRec(true);
      setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      alert('No pudimos usar el micrófono. Revisa los permisos del navegador.');
    }
  }

  function stop(cancel: boolean) {
    cancelRef.current = cancel;
    mrRef.current?.stop();
  }

  const mm = String(Math.floor(secs / 60));
  const ss = String(secs % 60).padStart(2, '0');

  if (!rec) {
    return (
      <span
        onClick={start}
        className="df-close-hover"
        title="Grabar nota de voz"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, minWidth: size, borderRadius: 8, cursor: 'pointer', color: '#64748B', flexShrink: 0 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '4px 8px', height: size, boxSizing: 'border-box' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#DC2626', animation: 'dfpulse 1.2s infinite', flexShrink: 0 }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#DC2626', fontWeight: 600, minWidth: 40 }}>
        {mm}:{ss}
      </span>
      <span onClick={() => stop(true)} title="Cancelar" className="df-close-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>
        Cancelar
      </span>
      <span
        onClick={() => stop(false)}
        title="Enviar nota de voz"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: '#059669', color: '#fff', cursor: 'pointer', flexShrink: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path d="M5 12l5 5L20 6" />
        </svg>
      </span>
    </div>
  );
}
