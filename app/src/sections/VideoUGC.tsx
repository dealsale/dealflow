import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { confirmar, notificar } from '../components/dialogs';
import {
  apiUgc, apiUgcBorrar, apiUgcBorrarActor, apiUgcGenerar, apiUgcGuardar, apiUgcGuion, apiUgcMontar, apiUgcNuevo, apiUgcRehacer, apiUgcSubirActor, apiUgcPersonajeBytePlus, apiUgcCodigoActor, apiUgcVideo,
  type ActorUgc, type ConfigUgc, type EstadoUgc, type ParteGuionUgc, type VideoUgc,
} from '../lib/api';
import { comprimirImagen } from '../components/PhotoUpload';
import { Icono } from '../components/Icono';

/**
 * Video UGC con Seedance (Marketing IA): producto → personaje y voz → guion → generar.
 * Cada paso se puede personalizar; el video se arma por tomas (Seedance), DealFlow pone voz,
 * subtítulos y la oferta, y queda en el Estudio para lanzarlo a Meta. Se paga con créditos.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 };
const lb: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', minWidth: 0 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)', fontWeight: 500 };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', minHeight: 42, fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '0 13px', minHeight: 36, fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
const pill = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? 'var(--df-brand)' : 'var(--df-border-strong)'}`, background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface)', color: on ? 'var(--df-brand-dark)' : 'var(--df-text-body)', borderRadius: 999, padding: '0 12px', minHeight: 34, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' });
const tarjeta = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: 10, minHeight: 64, borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--df-text)', border: `2px solid ${on ? 'var(--df-brand)' : 'var(--df-border)'}`, background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface)' });
const PASOS = [['Producto', 'Qué vas a mostrar'], ['Personaje y voz', 'Quién lo presenta'], ['Guion', 'Qué dice cada toma'], ['Generar', 'Formato y video']] as const;
const TONOS = ['cercano', 'energético', 'elegante', 'divertido', 'tranquilo'];
const OBJETIVOS = ['vender', 'presentar el producto', 'anunciar la oferta', 'resolver una duda', 'mostrar cómo se usa'];
const fotosDe = (p: { fotosSubidas?: string[]; fotos?: string[] }) => [...(p.fotosSubidas || []), ...(p.fotos || [])].filter((u) => typeof u === 'string' && /^(data:image\/|\/api\/media\/|https?:\/\/)/.test(u));
const ESTADO_TXT: Record<VideoUgc['estado'], [string, string]> = {
  borrador: ['Borrador', 'var(--df-text-muted)'], generando: ['Generando…', 'var(--df-purple)'], montando: ['Armando el video…', 'var(--df-purple)'],
  parcial: ['Falta rehacer una toma', 'var(--df-warning)'], listo: ['Listo', 'var(--df-brand-dark)'], fallido: ['No se pudo armar', 'var(--df-danger-dark)'],
};

export function VideoUGC({ df, onIrEstudio }: { df: DealFlowState; onIrEstudio: () => void }) {
  const [est, setEst] = useState<EstadoUgc | null>(null);
  const [v, setV] = useState<VideoUgc | null>(null);
  const [paso, setPaso] = useState(1);
  const cargar = () => apiUgc().then((r) => { if (r.data) setEst(r.data); });
  useEffect(() => { void cargar(); }, []);

  // Autoguardado del borrador (los cambios se mandan al servidor a los 0,6 s).
  const pendiente = useRef<Parameters<typeof apiUgcGuardar>[1] | null>(null);
  const timer = useRef<number>(0);
  const guardarYa = async () => {
    window.clearTimeout(timer.current);
    if (!v || !pendiente.current) return;
    const cambios = pendiente.current; pendiente.current = null;
    const r = await apiUgcGuardar(v.id, cambios);
    if (r.error) notificar(r.error, 'error');
  };
  const cambiar = (c: { config?: Partial<ConfigUgc>; guion?: ParteGuionUgc[]; actorId?: string }) => {
    if (!v) return;
    const nuevo: VideoUgc = { ...v, ...(c.actorId !== undefined ? { actorId: c.actorId } : {}), config: { ...v.config, ...(c.config || {}) }, guion: c.guion || v.guion };
    setV(nuevo);
    pendiente.current = { ...(pendiente.current || {}), ...(c.config ? { config: nuevo.config } : {}), ...(c.guion ? { guion: c.guion } : {}), ...(c.actorId !== undefined ? { actorId: c.actorId } : {}) };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void guardarYa(), 600);
  };
  const irPaso = async (n: number) => { await guardarYa(); setPaso(n); };

  // Mientras se genera: se consulta cada 5 s.
  useEffect(() => {
    if (!v || !['generando', 'montando'].includes(v.estado)) return;
    const t = window.setInterval(() => void apiUgcVideo(v.id).then((r) => { if (r.data) setV(r.data.video); if (r.data && !['generando', 'montando'].includes(r.data.video.estado)) { void cargar(); void df.reloadCreditos(); } }), 5000);
    return () => window.clearInterval(t);
  }, [v?.id, v?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const nuevo = async () => {
    const r = await apiUgcNuevo({});
    if (r.error || !r.data) return notificar(r.error || 'No se pudo crear.', 'error');
    setV(r.data.video); setPaso(1);
  };
  const abrir = (x: VideoUgc) => { setV(x); setPaso(['borrador'].includes(x.estado) ? 1 : 4); };
  const cerrar = async () => { await guardarYa(); setV(null); void cargar(); };

  if (!est) return <div style={card}>Cargando…</div>;
  const avisoActivo = !est.activo.seedance && (
    <div style={{ ...card, background: 'var(--df-warning-subtle-2)', borderColor: 'var(--df-warning-border)', color: 'var(--df-warning)', fontSize: 13 }}>
      <b>El video UGC todavía no está activo.</b> Falta conectar Seedance (BytePlus) en el servidor. Puedes preparar el producto, el personaje y el guion; generar el video se habilita cuando esté conectado.
    </div>
  );

  if (!v) {
    return (
      <div>
        {avisoActivo}
        <div style={{ ...card, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', background: '#0F172A', borderColor: '#0F172A', color: '#fff' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Video UGC</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3, lineHeight: 1.5 }}>Una persona habla de tu producto y lo muestra en uso, con voz en español, subtítulos y tu oferta. En 4 pasos.</div>
          </div>
          <button onClick={() => void nuevo()} style={{ ...btn, background: '#fff', color: '#0F172A' }}>+ Nuevo video UGC</button>
        </div>
        {est.videos.length > 0 && (
          <div style={card}>
            <b style={{ fontSize: 14 }}>Tus videos UGC</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
              {est.videos.map((x) => (
                <div key={x.id} style={{ border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => abrir(x)} style={{ border: 'none', padding: 0, cursor: 'pointer', background: '#0F172A', aspectRatio: '9 / 12', display: 'grid', placeItems: 'center', overflow: 'hidden' }} aria-label={`Abrir ${x.nombre}`}>
                    {x.miniatura ? <img src={x.miniatura} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#94A3B8', fontSize: 12, fontWeight: 700 }}>{ESTADO_TXT[x.estado]?.[0]}</span>}
                  </button>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</b>
                    <span style={{ fontSize: 12, fontWeight: 700, color: ESTADO_TXT[x.estado]?.[1] }}>{ESTADO_TXT[x.estado]?.[0]}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => abrir(x)} style={{ ...btnGris, minHeight: 32, flex: 1 }}>Abrir</button>
                      {!['generando', 'montando'].includes(x.estado) && <button aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: 'Eliminar este video', mensaje: 'Se borra de la lista (si ya está en el Estudio, ahí sigue).', aceptar: 'Eliminar', peligro: true })) { await apiUgcBorrar(x.id); void cargar(); } }} style={{ ...btnGris, minHeight: 32, color: 'var(--df-danger-dark)' }}>✕</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const bloqueado = ['generando', 'montando'].includes(v.estado);
  return (
    <div>
      {avisoActivo}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => void cerrar()} style={btnGris}>← Mis videos UGC</button>
        <b style={{ fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</b>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ESTADO_TXT[v.estado]?.[1] }}>{ESTADO_TXT[v.estado]?.[0]}</span>
      </div>
      <nav aria-label="Pasos" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 6, marginBottom: 12 }}>
        {PASOS.map(([t, s], i) => {
          const n = i + 1, on = paso === n;
          return (
            <button key={t} onClick={() => void irPaso(n)} aria-current={on ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', minHeight: 50, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--df-text)', border: `1px solid ${on ? 'var(--df-brand)' : 'var(--df-border)'}`, background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface)' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: on || paso > n ? 'var(--df-brand)' : 'var(--df-border)', color: on || paso > n ? '#fff' : 'var(--df-text-muted)' }}>{paso > n ? '✓' : n}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><b style={{ fontSize: 13 }}>{t}</b><span style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{s}</span></span>
            </button>
          );
        })}
      </nav>
      {bloqueado && paso !== 4 && <div style={{ ...card, fontSize: 13, color: 'var(--df-text-muted)' }}>El video se está generando: los cambios quedan bloqueados hasta que termine.</div>}
      {paso === 1 && <PasoProducto df={df} v={v} cambiar={cambiar} bloqueado={bloqueado} />}
      {paso === 2 && <PasoPersonaje est={est} v={v} cambiar={cambiar} bloqueado={bloqueado} onActores={(a) => setEst({ ...est, actores: a })} onSaldo={() => void df.reloadCreditos()} />}
      {paso === 3 && <PasoGuion est={est} v={v} cambiar={cambiar} bloqueado={bloqueado} onVideo={setV} guardarYa={guardarYa} onSaldo={() => void df.reloadCreditos()} />}
      {paso === 4 && <PasoGenerar est={est} v={v} cambiar={cambiar} bloqueado={bloqueado} onVideo={(x) => { setV(x); void df.reloadCreditos(); }} guardarYa={guardarYa} onIrEstudio={onIrEstudio} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        {paso > 1 ? <button onClick={() => void irPaso(paso - 1)} style={{ ...btnGris, minHeight: 42 }}>← {PASOS[paso - 2][0]}</button> : <span />}
        {paso < 4 && <button onClick={() => void irPaso(paso + 1)} style={{ ...btn, background: '#0F172A' }}>Siguiente: {PASOS[paso][0]} →</button>}
      </div>
    </div>
  );
}

type Cambiar = (c: { config?: Partial<ConfigUgc>; guion?: ParteGuionUgc[]; actorId?: string }) => void;

function PasoProducto({ df, v, cambiar, bloqueado }: { df: DealFlowState; v: VideoUgc; cambiar: Cambiar; bloqueado: boolean }) {
  const productos = df.products.filter((p) => p.tipo !== 'servicio');
  const prod = productos.find((p) => String(p.id) === v.config.producto.id);
  const fotos = prod ? fotosDe(prod) : [];
  const elegir = (id: string) => {
    const p = productos.find((x) => String(x.id) === id);
    if (!p) return;
    const notas = [p.descripcion, p.caracteristicas].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 400);
    cambiar({ config: { producto: { id: String(p.id), nombre: p.nombre, fotos: fotosDe(p).slice(0, 3), notas, precio: p.precioPromo || p.precio } } });
  };
  const sel = new Set(v.config.producto.fotos);
  const toggle = (f: string) => {
    const l = sel.has(f) ? v.config.producto.fotos.filter((x) => x !== f) : [...v.config.producto.fotos, f].slice(0, 4);
    cambiar({ config: { producto: { ...v.config.producto, fotos: l } } });
  };
  return (
    <section style={card} aria-labelledby="ugc1">
      <h2 id="ugc1" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>1. ¿Qué producto vas a mostrar?</h2>
      <label style={lb}>Producto
        <Dropdown ariaLabel="Producto" placeholder="Elige un producto…" value={v.config.producto.id} onChange={(x) => !bloqueado && elegir(x)} options={productos.map((p) => ({ value: String(p.id), label: p.nombre }))} />
      </label>
      {prod && (
        <>
          <div style={lb}>Fotos que usa la IA (hasta 4; con varios ángulos el producto sale más fiel). Elige fotos SIN caras de personas (solo el producto o la prenda): Seedance bloquea las fotos con caras.
            {fotos.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {fotos.map((f) => {
                  const on = sel.has(f);
                  return (
                    <button key={f.slice(-40)} onClick={() => !bloqueado && toggle(f)} aria-pressed={on} style={{ width: 84, height: 84, borderRadius: 10, padding: 0, overflow: 'hidden', cursor: 'pointer', border: `3px solid ${on ? 'var(--df-brand)' : 'var(--df-border)'}`, opacity: on ? 1 : 0.55, background: 'var(--df-bg)' }}>
                      <img src={f} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  );
                })}
              </div>
            ) : <span style={{ fontWeight: 500, color: 'var(--df-warning)' }}>Este producto no tiene fotos. Súbelas en Productos para poder hacer el video.</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
            <label style={lb}>Lo que lo hace especial (lo usa la IA para el guion)
              <textarea rows={3} value={v.config.producto.notas} disabled={bloqueado} onChange={(e) => cambiar({ config: { producto: { ...v.config.producto, notas: e.target.value } } })} placeholder="Ej: tela fría, no se arruga, tallas S a XL" style={{ ...input, resize: 'vertical' }} />
            </label>
            <label style={lb}>Precio que se menciona
              <input type="number" min={0} value={v.config.producto.precio || ''} disabled={bloqueado} onChange={(e) => cambiar({ config: { producto: { ...v.config.producto, precio: Number(e.target.value) || 0 } } })} style={input} />
              <span style={{ fontWeight: 500, fontSize: 11.5 }}>Déjalo vacío si no quieres decir el precio.</span>
            </label>
          </div>
        </>
      )}
    </section>
  );
}

/** Video sin persona en cámara: solo el producto, con voz en off. */
const SIN_PERSONA = 'sin-persona';
const DONDE_CODIGO = 'En BytePlus: ModelArk → Playground de Seedance 2.0 → pestaña «Digital Character Library». Elige la persona y copia su Asset ID (empieza por «asset-»).';

function PasoPersonaje({ est, v, cambiar, bloqueado, onActores }: { est: EstadoUgc; v: VideoUgc; cambiar: Cambiar; bloqueado: boolean; onActores: (a: ActorUgc[]) => void; onSaldo: () => void }) {
  // Seedance no acepta fotos de caras reales: las personas entran por su código de BytePlus.
  const [abierto, setAbierto] = useState<'' | 'byteplus' | 'modelo'>('');
  const [guardando, setGuardando] = useState(false);
  const [bp, setBp] = useState({ nombre: '', genero: 'mujer', edad: '25 a 35', voz: 'coral', assetId: '', imagen: '' });
  const [m, setM] = useState({ nombre: '', genero: 'mujer', edad: '25 a 35', voz: 'coral', imagen: '', permiso: false, assetId: '' });
  const [editando, setEditando] = useState('');
  const [codigo, setCodigo] = useState('');
  const elegir = (a: ActorUgc) => cambiar({ actorId: a.id, config: { voz: { ...v.config.voz, id: a.voz || v.config.voz.id } } });
  const listo = (a: ActorUgc) => { onActores([a, ...est.actores.filter((x) => x.id !== a.id)]); elegir(a); setAbierto(''); };
  const guardarBp = async () => {
    setGuardando(true);
    const r = await apiUgcPersonajeBytePlus(bp);
    setGuardando(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo guardar.', 'error');
    listo(r.data.actor); setBp({ nombre: '', genero: 'mujer', edad: '25 a 35', voz: 'coral', assetId: '', imagen: '' });
    notificar('✓ Personaje guardado y listo para tus videos.');
  };
  const subirModelo = async () => {
    setGuardando(true);
    const r = await apiUgcSubirActor(m);
    setGuardando(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo subir.', 'error');
    listo(r.data.actor); setM({ nombre: '', genero: 'mujer', edad: '25 a 35', voz: 'coral', imagen: '', permiso: false, assetId: '' });
    notificar(r.data.actor.assetId ? '✓ Modelo guardado y listo para tus videos.' : 'Modelo guardado. Cuando BytePlus lo autorice, agrégale su código para usarlo en videos.');
  };
  const guardarCodigo = async (a: ActorUgc) => {
    const r = await apiUgcCodigoActor(a.id, codigo);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo guardar.', 'error');
    onActores(est.actores.map((x) => (x.id === a.id ? r.data!.actor : x)));
    setEditando(''); setCodigo('');
    notificar('✓ Código guardado.');
  };
  const fotoInput = (alElegir: (img: string) => void) => (
    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) void comprimirImagen(file, 1536, 0.9).then(alElegir); e.target.value = ''; }} />
  );
  const cuadroFoto: React.CSSProperties = { width: 96, height: 120, borderRadius: 10, border: '1.5px dashed var(--df-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', textAlign: 'center', fontSize: 11.5, color: 'var(--df-text-muted)', background: 'var(--df-bg)', flexShrink: 0 };
  const datosPersona = (d: { nombre: string; genero: string; edad: string; voz: string }, set: (p: Partial<typeof d>) => void, ej: string) => (
    <>
      <label style={lb}>Nombre<input value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder={ej} style={input} /></label>
      <div style={lb}>Es
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['mujer', 'hombre'].map((g) => <button key={g} onClick={() => set({ genero: g })} aria-pressed={d.genero === g} style={pill(d.genero === g)}>{g === 'mujer' ? 'Mujer' : 'Hombre'}</button>)}</div>
      </div>
      <div style={lb}>Edad
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['18 a 24', '25 a 35', '36 a 50', 'más de 50'].map((e) => <button key={e} onClick={() => set({ edad: e })} aria-pressed={d.edad === e} style={pill(d.edad === e)}>{e}</button>)}</div>
      </div>
      <label style={lb}>Voz (para la voz en off)
        <Dropdown ariaLabel="Voz" value={d.voz} onChange={(x) => set({ voz: x })} options={est.voces.map((x) => ({ value: x.id, label: x.nombre }))} />
      </label>
    </>
  );
  return (
    <section style={card} aria-labelledby="ugc2">
      <h2 id="ugc2" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>2. ¿Quién lo presenta y cómo suena?</h2>
      <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Seedance (BytePlus) no acepta fotos de caras reales, ni de personas hechas con IA que parezcan reales. Por eso las personas se usan con su <b>código de BytePlus</b>: un personaje de su biblioteca (gratis) o tu modelo, ya autorizado en BytePlus.</span>
      <div role="radiogroup" aria-label="Personaje" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 10 }}>
        <button role="radio" aria-checked={v.actorId === SIN_PERSONA} disabled={bloqueado} onClick={() => cambiar({ actorId: SIN_PERSONA, config: { voz: { ...v.config.voz, modo: 'locutor' } } })} style={tarjeta(v.actorId === SIN_PERSONA)}>
          <span style={{ width: 52, height: 64, borderRadius: 9, background: 'var(--df-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icono nombre="paquete" tam={24} degradado /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><b style={{ fontSize: 14 }}>Sin persona</b><span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Solo el producto (y manos), con voz en off</span></span>
        </button>
        {est.actores.map((a) => (
          <div key={a.id} style={{ position: 'relative' }}>
            <button role="radio" aria-checked={v.actorId === a.id} disabled={bloqueado} onClick={() => elegir(a)} style={{ ...tarjeta(v.actorId === a.id), opacity: a.assetId ? 1 : 0.8 }}>
              {a.imagen ? <img src={a.imagen} alt="" style={{ width: 52, height: 64, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 52, height: 64, borderRadius: 9, background: 'var(--df-border)', flexShrink: 0 }} />}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, paddingRight: 22 }}>
                <b style={{ fontSize: 14 }}>{a.nombre}</b>
                <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{a.origen === 'propio' ? 'Tu modelo · ' : a.origen === 'byteplus' ? 'BytePlus · ' : 'Personaje IA · '}{a.genero} · {a.edad}</span>
                {a.assetId
                  ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-brand-dark)' }}>✓ Listo para video</span>
                  : <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-warning)' }}>Falta su código de BytePlus</span>}
              </span>
            </button>
            {!a.assetId && editando !== a.id && <button onClick={() => { setEditando(a.id); setCodigo(''); }} style={{ ...btnGris, marginTop: 6, padding: '5px 10px', fontSize: 12 }}>Agregar código de BytePlus</button>}
            {editando === a.id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="asset-2026…" style={{ ...input, padding: '6px 9px', fontSize: 12.5 }} />
                <button onClick={() => void guardarCodigo(a)} style={{ ...btn, padding: '6px 11px', fontSize: 12 }}>Guardar</button>
                <button onClick={() => setEditando('')} style={{ ...btnGris, padding: '6px 9px', fontSize: 12 }}>✕</button>
              </div>
            )}
            <button aria-label={`Borrar ${a.nombre}`} onClick={async () => { if (await confirmar({ titulo: `Borrar a ${a.nombre}`, mensaje: 'Los videos que ya hiciste con este personaje no se borran.', aceptar: 'Borrar', peligro: true })) { await apiUgcBorrarActor(a.id); onActores(est.actores.filter((x) => x.id !== a.id)); } }}
              style={{ position: 'absolute', top: 6, right: 6, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: 'var(--df-text-muted)' }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setAbierto(abierto === 'byteplus' ? '' : 'byteplus')} style={{ ...btnGris, borderColor: abierto === 'byteplus' ? 'var(--df-brand)' : undefined }}>+ Personaje de BytePlus · gratis</button>
        <button onClick={() => setAbierto(abierto === 'modelo' ? '' : 'modelo')} style={{ ...btnGris, borderColor: abierto === 'modelo' ? 'var(--df-brand)' : undefined }}>+ Mi modelo (persona real autorizada)</button>
      </div>

      {abierto === 'byteplus' && (
        <div style={{ border: '1px dashed var(--df-border-strong)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontSize: 13.5 }}>Personaje de la biblioteca de BytePlus</b>
          <span style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>BytePlus tiene más de 10.000 personas digitales listas para video, gratis. {DONDE_CODIGO}</span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={cuadroFoto} title="Foto de muestra (opcional): una captura para reconocerla">
              {bp.imagen ? <img src={bp.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ padding: 8 }}>Foto de muestra (opcional)</span>}
              {fotoInput((img) => setBp((x) => ({ ...x, imagen: img })))}
            </label>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
              <label style={lb}>Código de BytePlus *<input value={bp.assetId} onChange={(e) => setBp((x) => ({ ...x, assetId: e.target.value }))} placeholder="asset-20260410114236-8cdfz" style={input} /></label>
              {datosPersona(bp, (p) => setBp((x) => ({ ...x, ...p })), 'Ej: Valentina')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void guardarBp()} disabled={guardando || !bp.assetId.trim()} style={{ ...btn, opacity: guardando || !bp.assetId.trim() ? 0.55 : 1 }}>{guardando ? 'Guardando…' : 'Guardar personaje'}</button>
            <button onClick={() => setAbierto('')} style={btnGris}>Cancelar</button>
          </div>
        </div>
      )}

      {abierto === 'modelo' && (
        <div style={{ border: '1px dashed var(--df-border-strong)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontSize: 13.5 }}>Mi modelo (persona real)</b>
          <span style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Para que Seedance acepte a una persona real, ella tiene que <b>verificarse y dar su autorización en BytePlus</b> (ModelArk → Asset library → real-human assets). Al terminar, BytePlus da su código («asset-…»). Puedes guardarla ya y agregar el código después.</span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={cuadroFoto}>
              {m.imagen ? <img src={m.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ padding: 8 }}>Toca para elegir la foto</span>}
              {fotoInput((img) => setM((x) => ({ ...x, imagen: img })))}
            </label>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
              <label style={lb}>Código de BytePlus (si ya lo tienes)<input value={m.assetId} onChange={(e) => setM((x) => ({ ...x, assetId: e.target.value }))} placeholder="asset-…" style={input} /></label>
              {datosPersona(m, (p) => setM((x) => ({ ...x, ...p })), 'Ej: Daniela')}
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={m.permiso} onChange={(e) => setM((x) => ({ ...x, permiso: e.target.checked }))} style={{ marginTop: 2 }} />
            <span>Tengo el permiso de esta persona para usar su imagen en anuncios. No es un famoso ni un menor de edad.</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void subirModelo()} disabled={guardando || !m.imagen || !m.permiso} style={{ ...btn, opacity: guardando || !m.imagen || !m.permiso ? 0.55 : 1 }}>{guardando ? 'Guardando…' : 'Guardar modelo'}</button>
            <button onClick={() => setAbierto('')} style={btnGris}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--df-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b style={{ fontSize: 13.5 }}>¿Cómo suena?</b>
        <div role="radiogroup" aria-label="Voz" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
          <button role="radio" aria-checked={v.config.voz.modo === 'persona'} disabled={bloqueado} onClick={() => cambiar({ config: { voz: { ...v.config.voz, modo: 'persona' } } })} style={tarjeta(v.config.voz.modo === 'persona')}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 13.5 }}>La persona habla a cámara</b><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Seedance genera la voz con los labios sincronizados. Más natural.</span></span>
          </button>
          <button role="radio" aria-checked={v.config.voz.modo === 'locutor'} disabled={bloqueado} onClick={() => cambiar({ config: { voz: { ...v.config.voz, modo: 'locutor' } } })} style={tarjeta(v.config.voz.modo === 'locutor')}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 13.5 }}>Voz en off</b><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>La persona aparece usando el producto y una voz narra. Eliges la voz.</span></span>
          </button>
        </div>
        {v.config.voz.modo === 'locutor' && (
          <label style={{ ...lb, maxWidth: 320 }}>Voz del narrador
            <Dropdown ariaLabel="Voz del narrador" value={v.config.voz.id} onChange={(x) => cambiar({ config: { voz: { ...v.config.voz, id: x } } })} options={est.voces.map((x) => ({ value: x.id, label: x.nombre }))} />
          </label>
        )}
      </div>
    </section>
  );
}

function PasoGuion({ est, v, cambiar, bloqueado, onVideo, guardarYa, onSaldo }: { est: EstadoUgc; v: VideoUgc; cambiar: Cambiar; bloqueado: boolean; onVideo: (x: VideoUgc) => void; guardarYa: () => Promise<void>; onSaldo: () => void }) {
  const escribir = async (parte?: number) => {
    await guardarYa();
    const r = await apiUgcGuion(v.id, parte);
    onSaldo();
    if (r.error || !r.data) return notificar(r.error || 'No se pudo escribir el guion.', 'error');
    onVideo(r.data.video);
  };
  const setParte = (i: number, c: Partial<ParteGuionUgc>) => cambiar({ guion: v.guion.map((p, k) => (k === i ? { ...p, ...c } : p)) });
  const vacio = v.guion.every((p) => !p.texto && !p.escena);
  const COLOR = ['var(--df-warning)', 'var(--df-danger-dark)', 'var(--df-brand-dark)', 'var(--df-info)'];
  return (
    <section style={card} aria-labelledby="ugc3">
      <h2 id="ugc3" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>3. El guion</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
        <div style={lb}>Duración
          <div style={{ display: 'flex', gap: 6 }}>{([15, 30] as const).map((d) => <button key={d} disabled={bloqueado} onClick={() => cambiar({ config: { duracion: d }, guion: v.guion.map((p, i) => ({ ...p, segundos: (d === 15 ? [4, 4, 4, 4] : [7, 8, 8, 7])[i] })) })} aria-pressed={v.config.duracion === d} style={pill(v.config.duracion === d)}>{d} segundos</button>)}</div>
        </div>
        <label style={lb}>Tono<Dropdown ariaLabel="Tono" value={v.config.tono} onChange={(x) => cambiar({ config: { tono: x } })} options={TONOS.map((t) => ({ value: t, label: t }))} /></label>
        <label style={lb}>Objetivo<Dropdown ariaLabel="Objetivo" value={v.config.objetivo} onChange={(x) => cambiar({ config: { objetivo: x } })} options={OBJETIVOS.map((t) => ({ value: t, label: t }))} /></label>
        <label style={lb}>Oferta<input value={v.config.oferta} disabled={bloqueado} onChange={(e) => cambiar({ config: { oferta: e.target.value } })} placeholder="Ej: paga al recibir y envío gratis" style={input} /></label>
        <label style={lb}>Llamado a la acción<input value={v.config.cta} disabled={bloqueado} onChange={(e) => cambiar({ config: { cta: e.target.value } })} placeholder="Ej: escríbenos por WhatsApp" style={input} /></label>
      </div>
      <button onClick={() => void escribir()} disabled={bloqueado || !v.config.producto.nombre} style={{ ...btn, alignSelf: 'flex-start', opacity: bloqueado || !v.config.producto.nombre ? 0.6 : 1 }}>{vacio ? 'Escribir el guion con IA' : 'Escribir otro guion completo'} · {est.precios.guion} créditos</button>
      {!v.config.producto.nombre && <span style={{ fontSize: 12, color: 'var(--df-warning)' }}>Primero elige el producto (paso 1).</span>}
      {!vacio && v.guion.map((p, i) => (
        <div key={p.etiqueta} style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: COLOR[i] }}>Toma {i + 1} · {p.etiqueta}</b>
            <span style={{ flex: 1 }} />
            <button disabled={bloqueado} onClick={() => void escribir(i)} style={{ ...btnGris, minHeight: 30, fontSize: 11.5 }}>Otra idea para esta toma · {est.precios.guion}</button>
          </div>
          <label style={lb}>Lo que se dice
            <textarea rows={2} value={p.texto} disabled={bloqueado} onChange={(e) => setParte(i, { texto: e.target.value })} style={{ ...input, resize: 'vertical' }} />
          </label>
          <label style={lb}>Qué se ve (escena)
            <textarea rows={2} value={p.escena} disabled={bloqueado} onChange={(e) => setParte(i, { escena: e.target.value })} style={{ ...input, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ ...lb, flex: '1 1 180px' }}>Plano<Dropdown ariaLabel="Plano" value={p.camara} onChange={(x) => setParte(i, { camara: x })} options={est.camaras.map((c) => ({ value: c, label: c }))} /></label>
            <label style={{ ...lb, width: 110 }}>Segundos<input type="number" min={4} max={12} value={p.segundos} disabled={bloqueado} onChange={(e) => setParte(i, { segundos: Math.min(12, Math.max(4, Number(e.target.value) || 4)) })} style={input} /></label>
            {v.config.voz.modo === 'persona' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, minHeight: 38, cursor: 'pointer' }}>
                <input type="checkbox" checked={p.habla} disabled={bloqueado} onChange={(e) => setParte(i, { habla: e.target.checked })} style={{ width: 17, height: 17 }} /> La persona habla en esta toma
              </label>
            )}
          </div>
        </div>
      ))}
      <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Habla como vocera de la marca. Meta no permite presentar a un personaje de IA como un cliente real que «lo compró y le funcionó».</span>
    </section>
  );
}

function PasoGenerar({ est, v, cambiar, bloqueado, onVideo, guardarYa, onIrEstudio }: { est: EstadoUgc; v: VideoUgc; cambiar: Cambiar; bloqueado: boolean; onVideo: (x: VideoUgc) => void; guardarYa: () => Promise<void>; onIrEstudio: () => void }) {
  const seg = v.guion.reduce((a, p) => a + p.segundos, 0);
  const tarifa = v.config.calidad === 'rapida' ? est.precios.segundoRapido : est.precios.segundo;
  const costo = seg * tarifa;
  const faltan: string[] = [];
  if (!v.config.producto.nombre || !v.config.producto.fotos.length) faltan.push('el producto con fotos');
  if (!v.actorId) faltan.push('quién lo presenta');
  else if (v.actorId !== 'sin-persona' && !est.actores.find((a) => a.id === v.actorId)?.assetId) faltan.push('el código de BytePlus del personaje (paso 2)');
  if (v.guion.some((p) => !p.texto && !p.escena)) faltan.push('el guion');
  const generar = async () => {
    await guardarYa();
    const r = await apiUgcGenerar(v.id);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo generar.', 'error');
    onVideo(r.data.video); notificar('Listo: las 4 tomas van en camino. Tarda unos minutos.');
  };
  const rehacer = async (i: number) => {
    if (!(await confirmar({ titulo: `Rehacer la toma ${i + 1}`, mensaje: `Cuesta ${v.guion[i].segundos * tarifa} créditos. Si cambiaste lo que se dice o la escena en el guion, se usa lo nuevo.`, aceptar: 'Rehacer' }))) return;
    await guardarYa();
    const r = await apiUgcRehacer(v.id, i, { texto: v.guion[i].texto, escena: v.guion[i].escena, camara: v.guion[i].camara });
    if (r.error || !r.data) return notificar(r.error || 'No se pudo.', 'error');
    onVideo(r.data.video);
  };
  const ESTADO_TOMA: Record<string, [string, string]> = { pendiente: ['En cola', 'var(--df-text-muted)'], generando: ['Generando…', 'var(--df-purple)'], lista: ['Lista', 'var(--df-brand-dark)'], fallida: ['Falló (créditos devueltos)', 'var(--df-danger-dark)'] };
  return (
    <section style={card} aria-labelledby="ugc4">
      <h2 id="ugc4" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>4. Generar el video</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10 }}>
        <div style={lb}>Formato
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{([['9:16', 'Vertical'], ['1:1', 'Cuadrado'], ['16:9', 'Horizontal']] as const).map(([f, t]) => <button key={f} disabled={bloqueado} onClick={() => cambiar({ config: { formato: f } })} aria-pressed={v.config.formato === f} style={pill(v.config.formato === f)}>{t}</button>)}</div>
        </div>
        <div style={lb}>Subtítulos
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{([['blanco', 'Blancos'], ['caja', 'Con caja'], ['no', 'Sin subtítulos']] as const).map(([f, t]) => <button key={f} disabled={bloqueado} onClick={() => cambiar({ config: { subtitulos: f } })} aria-pressed={v.config.subtitulos === f} style={pill(v.config.subtitulos === f)}>{t}</button>)}</div>
        </div>
        <div style={lb}>Calidad
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{([['alta', `Alta · ${est.precios.segundo}/s`], ['rapida', `Rápida · ${est.precios.segundoRapido}/s`]] as const).map(([f, t]) => <button key={f} disabled={bloqueado} onClick={() => cambiar({ config: { calidad: f } })} aria-pressed={v.config.calidad === f} style={pill(v.config.calidad === f)}>{t}</button>)}</div>
        </div>
        <label style={lb}>Texto de la oferta al final<input value={v.config.textoFinal} disabled={bloqueado} maxLength={60} onChange={(e) => cambiar({ config: { textoFinal: e.target.value } })} placeholder="Ej: Paga al recibir · Envío gratis" style={input} /></label>
      </div>
      <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>{seg} segundos · 4 tomas · {v.config.voz.modo === 'persona' ? 'la persona habla' : 'voz en off'}</span>
        <b style={{ color: 'var(--df-brand-dark)' }}>{costo.toLocaleString('es-CO')} créditos</b>
      </div>
      {faltan.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--df-warning)' }}>Falta: {faltan.join(', ')}.</span>}
      {!bloqueado && (
        <button onClick={() => void generar()} disabled={faltan.length > 0 || !est.activo.seedance} style={{ ...btn, alignSelf: 'flex-start', opacity: faltan.length > 0 || !est.activo.seedance ? 0.6 : 1 }}>
          {v.estado === 'borrador' ? 'Generar video' : 'Generar todo otra vez'} · {costo.toLocaleString('es-CO')} créditos
        </button>
      )}
      {v.tomas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {v.tomas.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 0 }}>Toma {i + 1} · {v.guion[i]?.etiqueta}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: ESTADO_TOMA[t.estado]?.[1] }}>{ESTADO_TOMA[t.estado]?.[0]}</span>
                {!bloqueado && (t.estado === 'fallida' || t.estado === 'lista') && <button onClick={() => void rehacer(i)} style={{ ...btnGris, minHeight: 30, fontSize: 11.5 }}>Rehacer · {(v.guion[i]?.segundos || 4) * tarifa}</button>}
                {t.error && <span style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--df-danger-dark)' }}>{t.error}</span>}
              </div>
            ))}
            <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>Montaje: voz, subtítulos y oferta</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: v.estado === 'listo' ? 'var(--df-brand-dark)' : v.estado === 'montando' ? 'var(--df-purple)' : v.estado === 'fallido' ? 'var(--df-danger-dark)' : 'var(--df-text-muted)' }}>{v.estado === 'listo' ? 'Listo' : v.estado === 'montando' ? 'Armando…' : v.estado === 'fallido' ? 'Falló' : 'En espera'}</span>
            </div>
            {v.error && <span style={{ fontSize: 12, color: 'var(--df-warning)' }}>{v.error}</span>}
            {v.estado === 'fallido' && <button onClick={async () => { const r = await apiUgcMontar(v.id); if (r.data) onVideo(r.data.video); else notificar(r.error || 'No se pudo.', 'error'); }} style={{ ...btnGris, alignSelf: 'flex-start' }}>Reintentar el montaje (gratis)</button>}
            {bloqueado && <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Tarda unos minutos. Puedes salir y volver: sigue trabajando solo.</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            {v.video ? <video src={v.video} poster={v.miniatura || undefined} controls playsInline style={{ width: '100%', maxWidth: 300, borderRadius: 14, background: '#000' }} />
              : <div style={{ width: '100%', maxWidth: 300, aspectRatio: v.config.formato === '16:9' ? '16 / 9' : v.config.formato === '1:1' ? '1 / 1' : '9 / 16', borderRadius: 14, background: '#0F172A', display: 'grid', placeItems: 'center', color: '#94A3B8', fontSize: 12.5, fontWeight: 700 }}>{bloqueado ? 'Armando tu video…' : 'Aquí aparece tu video'}</div>}
            {v.video && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a href={v.video} download={`${v.nombre}.mp4`} style={{ ...btnGris, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Descargar</a>
                <button onClick={onIrEstudio} style={{ ...btn, background: '#1877F2', minHeight: 36 }}>Usarlo en una campaña de Meta</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
