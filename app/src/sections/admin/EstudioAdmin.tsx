import { useEffect, useRef, useState } from 'react';
import { confirmar, notificar } from '../../components/dialogs';
import {
  apiAdminEstudio, apiAdminEstudioAnalizar, apiAdminEstudioBorrar, apiAdminEstudioEditar, apiAdminEstudioIndicaciones, apiAdminEstudioSubir,
  type ReferenciaEstudio,
} from '../../lib/api';

/**
 * Admin → Estudio IA: el equipo DealFlow le enseña a la IA cómo deben verse y sonar los videos.
 * Sube videos de referencia (DealFlow saca cuadros y transcribe el audio, y la IA escribe una
 * guía de estilo editable) y escribe indicaciones generales. Todo eso se le pasa a la IA cada vez
 * que una tienda pide ideas en el Estudio de videos y fotos.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18, marginBottom: 14 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ESTILOS = [['ugc', 'UGC'], ['ecommerce', 'E-commerce'], ['general', 'General (todos)']] as const;

const leerVideo = (f: File) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(f); });

export function EstudioAdmin() {
  const [indicaciones, setIndicaciones] = useState('');
  const [guardadas, setGuardadas] = useState('');
  const [refs, setRefs] = useState<ReferenciaEstudio[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [estilo, setEstilo] = useState<'ugc' | 'ecommerce' | 'general'>('ugc');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const cargar = useRef(() => Promise.resolve());
  cargar.current = () => apiAdminEstudio().then((r) => { if (r.data) { setRefs(r.data.referencias); setIndicaciones((v) => (v === guardadas ? r.data!.indicaciones : v)); setGuardadas(r.data.indicaciones); } });
  useEffect(() => { void cargar.current(); }, []);
  const analizando = !!refs?.some((r) => r.estado === 'analizando');
  useEffect(() => {
    if (!analizando) return;
    const t = setInterval(() => void cargar.current(), 6000);
    return () => clearInterval(t);
  }, [analizando]);

  const subir = async () => {
    if (!archivo) return;
    if (archivo.size > 18 * 1024 * 1024) { notificar('El video pesa más de 18 MB. Usa uno más corto.', 'error'); return; }
    setSubiendo(true);
    const r = await apiAdminEstudioSubir({ titulo: titulo || archivo.name.replace(/\.[^.]+$/, ''), estilo, videoDataUrl: await leerVideo(archivo) });
    setSubiendo(false);
    if (r.error) { notificar(r.error, 'error'); return; }
    setTitulo(''); setArchivo(null);
    notificar('Video subido. La IA lo está analizando (cuadros + audio).');
    void cargar.current();
  };
  const guardarIndicaciones = async () => {
    const r = await apiAdminEstudioIndicaciones(indicaciones);
    if (r.error) notificar(r.error, 'error'); else { setGuardadas(indicaciones); notificar('Indicaciones guardadas.'); }
  };

  return (
    <section data-screen-label="Admin Estudio IA" style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Estudio IA · cómo deben verse los videos</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px', lineHeight: 1.5 }}>
        Enséñale a la IA el estilo de DealFlow. Sube videos de ejemplo (UGC, e-commerce…): sacamos cuadros y transcribimos el audio, y la IA escribe una guía (escenas, cámara, ritmo, <b>voz y audio</b>, guion). Esas guías y tus indicaciones se usan cada vez que una tienda pide ideas en el Estudio.
      </p>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Indicaciones generales</div>
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>Reglas que siempre deben cumplir los videos. Ej.: voz femenina joven con acento paisa, hablar en tuteo; gancho en los primeros 2 segundos; música suave de fondo; terminar mostrando el producto y diciendo «pagas al recibir».</div>
        <textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} rows={5} style={{ ...input, resize: 'vertical', marginBottom: 8 }} placeholder="Escribe las reglas de estilo, voz y audio…" />
        <button onClick={() => void guardarIndicaciones()} disabled={indicaciones === guardadas} style={{ ...btn, opacity: indicaciones === guardadas ? 0.5 : 1 }}>Guardar indicaciones</button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Subir video de referencia</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre (ej: Unboxing faja que vendió mucho)" style={input} />
          <select value={estilo} onChange={(e) => setEstilo(e.target.value as typeof estilo)} style={input}>{ESTILOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          <label style={{ ...btnGris, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px' }}>
            🎞️ {archivo ? archivo.name.slice(0, 28) : 'Elegir video (MP4, MOV · máx. 18 MB)'}
            <input type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          </label>
        </div>
        <button onClick={() => void subir()} disabled={!archivo || subiendo} style={{ ...btn, opacity: !archivo || subiendo ? 0.5 : 1 }}>{subiendo ? 'Subiendo…' : 'Subir y analizar'}</button>
        <span style={{ fontSize: 12, color: 'var(--df-text-faint)', marginLeft: 10 }}>Videos de 15–60 s funcionan mejor. El análisis lo paga DealFlow (no gasta créditos de nadie).</span>
      </div>

      {!refs ? <div className="df-est-cargando" style={{ height: 120, borderRadius: 14 }} /> : refs.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 13.5 }}>Todavía no hay videos de referencia.</div>
      ) : refs.map((r) => <Referencia key={r.id} r={r} onCambio={() => void cargar.current()} />)}
    </section>
  );
}

function Referencia({ r, onCambio }: { r: ReferenciaEstudio; onCambio: () => void }) {
  const [guia, setGuia] = useState(r.guia);
  const [verTx, setVerTx] = useState(false);
  useEffect(() => { setGuia(r.guia); }, [r.guia]);
  const editar = async (b: Parameters<typeof apiAdminEstudioEditar>[1]) => { const x = await apiAdminEstudioEditar(r.id, b); if (x.error) notificar(x.error, 'error'); onCambio(); };
  const borrar = async () => { if (await confirmar({ titulo: 'Borrar referencia', mensaje: `¿Borrar «${r.titulo}»? La IA dejará de usar su guía.`, aceptar: 'Borrar', peligro: true })) { await apiAdminEstudioBorrar(r.id); onCambio(); } };
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(0, 200px) 1fr', gap: 16, opacity: r.activa ? 1 : 0.65 }} className="df-collapse">
      <div>
        <video src={r.video} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 340, borderRadius: 10, background: '#0B1220' }} />
        {r.cuadros.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, marginTop: 6 }}>{r.cuadros.map((c) => <img key={c} src={c} alt="" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 4 }} />)}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14.5, flex: 1, minWidth: 160 }}>{r.titulo}</span>
          <select value={r.estilo} onChange={(e) => void editar({ estilo: e.target.value as ReferenciaEstudio['estilo'] })} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>{ESTILOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={r.activa} onChange={(e) => void editar({ activa: e.target.checked })} /> Activa</label>
        </div>
        {r.estado === 'analizando' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><div className="df-est-giro" style={{ width: 18, height: 18, borderWidth: 2, borderColor: 'var(--df-border)', borderTopColor: 'var(--df-brand)' }} /> Analizando cuadros y audio…</div>}
        {r.estado === 'error' && <div style={{ fontSize: 13, color: 'var(--df-danger-dark)' }}>{r.error} <button onClick={() => void apiAdminEstudioAnalizar(r.id).then(onCambio)} style={{ ...btnGris, marginLeft: 6 }}>Reintentar</button></div>}
        {r.estado === 'listo' && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Guía de estilo que usa la IA (puedes corregirla)</div>
            <textarea value={guia} onChange={(e) => setGuia(e.target.value)} rows={9} style={{ ...input, fontSize: 12.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void editar({ guia })} disabled={guia === r.guia} style={{ ...btn, padding: '7px 12px', opacity: guia === r.guia ? 0.5 : 1 }}>Guardar guía</button>
              <button onClick={() => void apiAdminEstudioAnalizar(r.id).then(onCambio)} style={btnGris}>↻ Volver a analizar</button>
              {r.transcripcion && <button onClick={() => setVerTx(!verTx)} style={btnGris}>{verTx ? 'Ocultar' : 'Ver'} lo que dice el audio</button>}
              <button onClick={() => void borrar()} style={{ ...btnGris, color: 'var(--df-danger-dark)' }}>Borrar</button>
            </div>
            {verTx && <div style={{ fontSize: 12.5, background: 'var(--df-bg)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>🎙️ {r.transcripcion}</div>}
          </>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Subido por {r.creadoPor || '—'}</div>
      </div>
    </div>
  );
}
