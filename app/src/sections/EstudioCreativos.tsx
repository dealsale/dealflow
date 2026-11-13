import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { comprimirImagen } from '../components/PhotoUpload';
import { confirmar, notificar } from '../components/dialogs';
import {
  apiEstudio, apiEstudioAgregar, apiEstudioBorrar, apiEstudioEditarPieza, apiEstudioGenerar, apiEstudioGuardar, apiEstudioLanzar, apiEstudioLanzEstado,
  apiEstudioLanzReintentar, apiEstudioMeta, apiEstudioPaquete, apiEstudioProyecto, apiRecargarCreditos,
  type BriefEstudio, type LanzamientoEstudio, type OpcionesLanzar, type PiezaEstudio, type PreciosEstudio, type ProyectoEstudio, type ProyectoEstudioResumen,
} from '../lib/api';

/**
 * Estudio de videos y fotos (Marketing IA). La tienda describe su producto (con varias fotos
 * reales: la IA entiende mejor con más ángulos), la IA propone videos UGC y fotos de e-commerce
 * con ángulos distintos, cada pieza se genera aparte mostrando antes cuántos créditos cuesta, y
 * las piezas listas se lanzan a Meta desde aquí. Solo se cobra con créditos.
 */

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5, display: 'block' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const MAX_FOTOS = 6;

const BRIEF_VACIO: BriefEstudio = { producto: '', categoria: '', precio: 0, publico: '', variantes: '', oferta: 'Pago contraentrega y envío gratis', beneficios: [], estilo: 'mixto', formato: '9:16', videos: 6, imagenes: 4, notas: '' };
const ESTILOS = [
  { id: 'ugc', nombre: 'UGC', sub: 'Como si lo grabara un cliente con su celular' },
  { id: 'ecommerce', nombre: 'E-commerce', sub: 'Producto limpio, tipo catálogo' },
  { id: 'mixto', nombre: 'Mixto', sub: 'Un poco de los dos (recomendado)' },
] as const;
const FORMATOS = [
  { id: '9:16', nombre: 'Vertical 9:16', sub: 'Reels, TikTok, historias' },
  { id: '1:1', nombre: 'Cuadrado', sub: 'Feed (los videos salen verticales)' },
  { id: '16:9', nombre: 'Horizontal', sub: 'YouTube, web' },
] as const;
const ESTADOS: Record<PiezaEstudio['estado'], { t: string; c: string; bg: string }> = {
  borrador: { t: 'Idea', c: '#CBD5E1', bg: 'rgba(15,23,42,.55)' },
  generando: { t: 'Generando', c: '#fff', bg: 'rgba(79,70,229,.85)' },
  listo: { t: 'Listo', c: '#fff', bg: 'rgba(5,150,105,.9)' },
  aprobado: { t: '✓ Aprobado', c: '#fff', bg: 'var(--df-brand)' },
  fallido: { t: 'Falló', c: '#fff', bg: 'rgba(220,38,38,.9)' },
  descartado: { t: 'Descartado', c: '#fff', bg: 'rgba(100,116,139,.8)' },
};

function costo(p: PiezaEstudio, pr: PreciosEstudio | null): number {
  if (!pr) return 0;
  if (p.tipo === 'video') return pr.video[p.modelo || 'sora-2']?.[String(p.segundos || 8)] || 0;
  return p.calidad === 'high' ? pr.imagen.high : pr.imagen.medium;
}

export function EstudioCreativos({ df }: { df: DealFlowState }) {
  const [proyectos, setProyectos] = useState<ProyectoEstudioResumen[] | null>(null);
  const [precios, setPrecios] = useState<PreciosEstudio | null>(null);
  const [saldo, setSaldo] = useState(df.creditos);
  const [abierto, setAbierto] = useState<string>('');
  const [nuevo, setNuevo] = useState(false);
  const [recarga, setRecarga] = useState(false);
  const cargar = () => apiEstudio().then((r) => { if (r.data) { setProyectos(r.data.proyectos); setPrecios(r.data.precios); setSaldo(r.data.saldo); } });
  useEffect(() => { void cargar(); void df.reloadCreditos(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cabecera = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div className="df-est-idea" style={{ padding: '18px 20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div className="df-est-flota" style={{ fontSize: 34, lineHeight: 1 }}>🎬</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Estudio de videos y fotos</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3, lineHeight: 1.5 }}>Videos UGC con voz y fotos de producto para vender lo que sea. Pagas con créditos solo lo que generas; si algo falla, vuelven solos.</div>
        </div>
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '8px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, letterSpacing: '.06em' }}>CRÉDITOS</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: saldo > 100 ? '#6EE7B7' : '#FCD34D' }}>{saldo.toLocaleString('es-CO')}</div>
        </div>
        <button onClick={() => setRecarga(!recarga)} style={{ ...btn, background: '#fff', color: '#0F172A' }}>{recarga ? 'Cerrar' : 'Recargar créditos'}</button>
      </div>
      {(recarga || precios) && (
        <div style={{ padding: '12px 20px' }}>
          {recarga && <Recarga df={df} />}
          {precios && (
            <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: recarga ? 10 : 0 }}>
              <span>💡 Ideas y guiones: <b>{precios.paquete}</b></span>
              <span>🖼️ Foto: <b>{precios.imagen.medium}</b> · alta calidad <b>{precios.imagen.high}</b></span>
              <span>🎥 Video 8 s: <b>{precios.video['sora-2']?.['8']}</b> · pro <b>{precios.video['sora-2-pro']?.['8']}</b></span>
              {!precios.disponible && <span style={{ color: 'var(--df-danger)' }}>⚠️ La IA no está configurada en el servidor.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (abierto) return (<>{cabecera}<Proyecto id={abierto} precios={precios} onSaldo={setSaldo} onCerrar={() => { setAbierto(''); void cargar(); }} /></>);

  return (
    <>
      {cabecera}
      {nuevo ? (
        <FormBrief titulo="Nuevo producto" onCancelar={() => setNuevo(false)} onGuardado={(id) => { setNuevo(false); setAbierto(id); }} />
      ) : (
        <button onClick={() => setNuevo(true)} style={{ ...btn, marginBottom: 14 }}>+ Nuevo producto</button>
      )}
      {!proyectos ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div> : proyectos.length === 0 ? (
        !nuevo && (
          <div style={{ ...card, textAlign: 'center', padding: '34px 20px' }}>
            <div className="df-est-flota" style={{ fontSize: 40 }}>📦</div>
            <div style={{ fontWeight: 800, fontSize: 15, margin: '8px 0 4px' }}>Tu primer producto en el estudio</div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13.5, maxWidth: 440, margin: '0 auto' }}>Sube varias fotos reales del producto (de frente, de lado, en uso, detalles): con más fotos la IA lo entiende mejor y lo dibuja más fiel.</div>
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {proyectos.map((p) => (
            <button key={p.id} onClick={() => setAbierto(p.id)} className="df-est-tarjeta" style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div className={p.foto ? '' : 'df-est-idea'} style={{ height: 150, background: p.foto ? 'var(--df-bg)' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {p.foto ? <img src={p.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 38 }}>📦</span>}
                {p.generando > 0 && <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(79,70,229,.9)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px' }}>⏳ {p.generando} generando</span>}
              </div>
              <div style={{ padding: '11px 13px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--df-text)' }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 2 }}>🎥 {p.videos} video{p.videos === 1 ? '' : 's'} · 🖼️ {p.imagenes} foto{p.imagenes === 1 ? '' : 's'}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Recarga({ df }: { df: DealFlowState }) {
  const [msg, setMsg] = useState('');
  const pagar = async (id: string) => {
    setMsg('Abriendo el pago…');
    const r = await apiRecargarCreditos(id);
    if (r.error || !r.data?.url) { setMsg(r.error || 'No pudimos abrir la recarga.'); return; }
    window.location.href = r.data.url;
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {df.paquetesCreditos.map((p) => (
          <button key={p.id} onClick={() => void pagar(p.id)} className="df-est-tarjeta" style={{ ...btnGris, textAlign: 'left', padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.nombre}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--df-brand-dark)', margin: '2px 0' }}>{p.creditos.toLocaleString('es-CO')} créditos</div>
            <div style={{ fontSize: 13 }}>{money(p.precio)} <span style={{ color: 'var(--df-text-faint)', fontSize: 11.5 }}>({money(p.precio / p.creditos)} c/u)</span></div>
          </button>
        ))}
      </div>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('Abriendo') ? 'var(--df-text-muted)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}

/** Varias fotos del producto: la primera es la principal (primer cuadro de los videos). */
function FotosProducto({ fotos, onCambiar }: { fotos: string[]; onCambiar: (f: string[]) => void }) {
  const agregar = async (files: FileList | null) => {
    if (!files) return;
    const nuevas: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_FOTOS - fotos.length)) nuevas.push(await comprimirImagen(f, 1600, 0.9));
    onCambiar([...fotos, ...nuevas].slice(0, MAX_FOTOS));
  };
  return (
    <div>
      <span style={label}>Fotos reales del producto ({fotos.length}/{MAX_FOTOS}) · la primera es la principal</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {fotos.map((u, i) => (
          <div key={u.slice(-40) + i} style={{ position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden', border: i === 0 ? '2px solid var(--df-brand)' : '1px solid var(--df-border)', background: 'var(--df-bg)' }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {i === 0 && <span style={{ position: 'absolute', left: 4, bottom: 4, background: 'var(--df-brand)', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 5, padding: '1px 5px' }}>PRINCIPAL</span>}
            <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 3 }}>
              {i > 0 && <button title="Hacerla principal" onClick={() => onCambiar([u, ...fotos.filter((_, k) => k !== i)])} style={{ border: 'none', borderRadius: 6, background: 'rgba(15,23,42,.7)', color: '#fff', fontSize: 11, cursor: 'pointer', padding: '2px 5px' }}>★</button>}
              <button title="Quitar" onClick={() => onCambiar(fotos.filter((_, k) => k !== i))} style={{ border: 'none', borderRadius: 6, background: 'rgba(15,23,42,.7)', color: '#fff', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
            </div>
          </div>
        ))}
        {fotos.length < MAX_FOTOS && (
          <label style={{ width: 92, height: 92, borderRadius: 10, border: '1.5px dashed var(--df-border-strong, var(--df-border))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--df-text-muted)', fontSize: 11.5, textAlign: 'center', gap: 2 }}>
            <span style={{ fontSize: 22 }}>📷</span>Agregar fotos
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { void agregar(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-faint)', marginTop: 6 }}>Mientras más ángulos (frente, lado, en uso, detalle, empaque), más fiel sale el producto.</div>
    </div>
  );
}

function FormBrief({ titulo, inicial, fotos: fotosIniciales, nombre: nombreInicial, id, onGuardado, onCancelar }: {
  titulo: string; inicial?: BriefEstudio; fotos?: string[]; nombre?: string; id?: string; onGuardado: (id: string) => void; onCancelar: () => void;
}) {
  const [b, setB] = useState<BriefEstudio>({ ...BRIEF_VACIO, ...(inicial || {}) });
  const [beneficios, setBeneficios] = useState((inicial?.beneficios || []).join('\n'));
  const [fotos, setFotos] = useState<string[]>(fotosIniciales || []);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (p: Partial<BriefEstudio>) => setB((x) => ({ ...x, ...p }));
  const guardar = async () => {
    if (!b.producto.trim()) { setError('Escribe el nombre del producto.'); return; }
    setGuardando(true);
    // Las que ya estaban se mandan por su URL (en el orden elegido); las nuevas, como datos.
    const r = await apiEstudioGuardar(id || null, {
      nombre: nombreInicial && id ? nombreInicial : b.producto,
      brief: { ...b, beneficios: beneficios.split('\n').map((x) => x.trim()).filter(Boolean) },
      fotos: fotos.filter((u) => u.startsWith('/api/')), fotosNuevas: fotos.filter((u) => u.startsWith('data:')),
    });
    setGuardando(false);
    if (r.error || !r.data) { setError(r.error || 'No se pudo guardar.'); return; }
    onGuardado(r.data.id);
  };
  const opcion = (activo: boolean): React.CSSProperties => ({ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 10, padding: '8px 12px', border: '1px solid ' + (activo ? 'var(--df-brand)' : 'var(--df-border)'), background: activo ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: 'var(--df-text)' });
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{titulo}</div>
      <div style={{ marginBottom: 14 }}><FotosProducto fotos={fotos} onCambiar={setFotos} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div><span style={label}>Producto *</span><input value={b.producto} onChange={(e) => set({ producto: e.target.value })} placeholder="Ej: Faja reductora, licuadora portátil…" style={input} /></div>
        <div><span style={label}>Categoría</span><input value={b.categoria} onChange={(e) => set({ categoria: e.target.value })} placeholder="Ej: Hogar, Belleza, Tecnología…" style={input} /></div>
        <div><span style={label}>Precio de venta (COP)</span><input inputMode="numeric" value={b.precio ? b.precio.toLocaleString('es-CO') : ''} onChange={(e) => set({ precio: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="89.900" style={input} /></div>
        <div><span style={label}>Oferta</span><input value={b.oferta} onChange={(e) => set({ oferta: e.target.value })} placeholder="Contraentrega, envío gratis, 2x…" style={input} /></div>
        <div><span style={label}>Público</span><input value={b.publico} onChange={(e) => set({ publico: e.target.value })} placeholder="Ej: Mamás 25–45 en Colombia" style={input} /></div>
        <div><span style={label}>Variantes (colores, tallas, presentaciones)</span><input value={b.variantes} onChange={(e) => set({ variantes: e.target.value })} placeholder="Negro, beige, vino tinto" style={input} /></div>
      </div>
      <div style={{ marginBottom: 12 }}><span style={label}>Beneficios (uno por línea)</span><textarea value={beneficios} onChange={(e) => setBeneficios(e.target.value)} rows={3} placeholder={'No se calienta\nCabe en la cartera\nCarga en 2 horas'} style={{ ...input, resize: 'vertical' }} /></div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Estilo</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ESTILOS.map((o) => <button key={o.id} onClick={() => set({ estilo: o.id })} style={opcion(b.estilo === o.id)}><div style={{ fontWeight: 700, fontSize: 13 }}>{o.nombre}</div><div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{o.sub}</div></button>)}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Formato</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{FORMATOS.map((o) => <button key={o.id} onClick={() => set({ formato: o.id })} style={opcion(b.formato === o.id)}><div style={{ fontWeight: 700, fontSize: 13 }}>{o.nombre}</div><div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{o.sub}</div></button>)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div><span style={label}>Ideas de video</span><input type="number" min={0} max={13} value={b.videos} onChange={(e) => set({ videos: Math.min(13, Math.max(0, Number(e.target.value) || 0)) })} style={input} /></div>
        <div><span style={label}>Ideas de foto</span><input type="number" min={0} max={10} value={b.imagenes} onChange={(e) => set({ imagenes: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} style={input} /></div>
      </div>
      <div style={{ marginBottom: 14 }}><span style={label}>Notas para la IA (opcional)</span><input value={b.notas} onChange={(e) => set({ notas: e.target.value })} placeholder="Ej: que se vea en una cocina colombiana; voz de mujer joven" style={input} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void guardar()} disabled={guardando} style={{ ...btn, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button onClick={onCancelar} style={btnGris}>Cancelar</button>
        {error && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}

function Proyecto({ id, precios, onSaldo, onCerrar }: { id: string; precios: PreciosEstudio | null; onSaldo: (n: number) => void; onCerrar: () => void }) {
  const [p, setP] = useState<ProyectoEstudio | null>(null);
  const [editando, setEditando] = useState(false);
  const [lanzar, setLanzar] = useState(false);
  const [fotoGrande, setFotoGrande] = useState(0);
  const [msg, setMsg] = useState('');
  const [nuevaTipo, setNuevaTipo] = useState<'video' | 'imagen'>('video');
  const [nuevaPrompt, setNuevaPrompt] = useState('');
  const cargar = useRef(() => Promise.resolve());
  cargar.current = () => apiEstudioProyecto(id).then((r) => { if (r.data) { setP(r.data.proyecto); onSaldo(r.data.saldo); } });
  useEffect(() => { void cargar.current(); }, [id]);
  // Mientras haya piezas generándose, se refresca solo.
  const generando = !!p?.piezas.some((x) => x.estado === 'generando');
  useEffect(() => {
    if (!generando) return;
    const t = setInterval(() => void cargar.current(), 8_000);
    return () => clearInterval(t);
  }, [generando]);

  if (!p) return <div className="df-est-cargando" style={{ height: 180, borderRadius: 14 }} />;
  if (editando) return <FormBrief titulo="Editar producto" id={p.id} nombre={p.nombre} inicial={p.brief} fotos={p.fotos} onCancelar={() => setEditando(false)} onGuardado={() => { setEditando(false); void cargar.current(); }} />;

  const pedirIdeas = async () => {
    setMsg('');
    const r = await apiEstudioPaquete(p.id);
    if (r.error) setMsg(r.error); else setMsg(`✓ La IA propuso ${r.data?.videos} videos y ${r.data?.imagenes} fotos. Revisa cada idea y genera las que te gusten.`);
    void cargar.current();
  };
  const borrar = async () => {
    if (!(await confirmar({ titulo: `¿Borrar «${p.nombre}» del estudio?`, mensaje: 'Se borran las ideas y la lista de piezas. Los créditos ya usados no se devuelven.', aceptar: 'Borrar', peligro: true }))) return;
    await apiEstudioBorrar(p.id); onCerrar();
  };
  const agregar = async () => {
    const r = await apiEstudioAgregar(p.id, { tipo: nuevaTipo, prompt: nuevaPrompt });
    if (r.error) { notificar(r.error, 'error'); return; }
    setNuevaPrompt(''); void cargar.current();
  };
  const videos = p.piezas.filter((x) => x.tipo === 'video');
  const fotos = p.piezas.filter((x) => x.tipo === 'imagen');
  const listas = p.piezas.filter((x) => x.url && ['listo', 'aprobado'].includes(x.estado));
  const hayAprobadas = p.piezas.some((x) => x.url && x.estado === 'aprobado');
  const b = p.brief;
  const fotoActual = p.fotos[Math.min(fotoGrande, p.fotos.length - 1)] || '';

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onCerrar} style={btnGris}>← Mis productos</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditando(true)} style={btnGris}>Editar producto</button>
        {listas.length > 0 && <a href={`/api/estudio/proyectos/${p.id}/zip`} style={{ ...btnGris, textDecoration: 'none' }}>⬇️ Todo (.zip)</a>}
        {hayAprobadas && <a href={`/api/estudio/proyectos/${p.id}/zip?aprobados=1`} style={{ ...btnGris, textDecoration: 'none' }}>⬇️ Aprobados</a>}
        <button onClick={() => void borrar()} style={{ ...btnGris, color: 'var(--df-danger-dark)' }}>Borrar</button>
      </div>

      {/* Producto: foto grande + miniaturas + datos */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(0, 220px) 1fr', gap: 18 }} className="df-collapse">
        <div>
          <div className={fotoActual ? '' : 'df-est-idea'} style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: fotoActual ? 'var(--df-bg)' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {fotoActual ? <img src={fotoActual} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 40 }}>📦</span>}
          </div>
          {p.fotos.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {p.fotos.map((u, i) => <button key={u} onClick={() => setFotoGrande(i)} style={{ width: 40, height: 40, padding: 0, borderRadius: 7, overflow: 'hidden', cursor: 'pointer', border: i === fotoGrande ? '2px solid var(--df-brand)' : '1px solid var(--df-border)', background: 'var(--df-bg)' }}><img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button>)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em' }}>{p.nombre}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {b.precio ? <Chip>{money(b.precio)}</Chip> : null}
            {b.categoria && <Chip>{b.categoria}</Chip>}
            <Chip>{b.estilo === 'ugc' ? 'UGC' : b.estilo === 'ecommerce' ? 'E-commerce' : 'Mixto'}</Chip>
            <Chip>{b.formato}</Chip>
            <Chip>📷 {p.fotos.length} foto{p.fotos.length === 1 ? '' : 's'}</Chip>
          </div>
          <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>{b.oferta}{b.variantes ? ` · ${b.variantes}` : ''}</div>
          {p.fotos.length < 2 && <div style={{ fontSize: 12.5, color: 'var(--df-warning)' }}>{p.fotos.length ? 'Agrega más fotos (otros ángulos, en uso) para que la IA lo entienda mejor.' : 'Sin fotos: el producto puede salir distinto. Súbelas en «Editar producto».'}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
            <button onClick={() => void pedirIdeas()} style={btn}>✨ {p.piezas.length ? 'Pedir más ideas' : 'Pedir ideas a la IA'} · {precios?.paquete ?? '…'} cr</button>
            {listas.length > 0 && <button onClick={() => setLanzar(!lanzar)} style={{ ...btn, background: '#1877F2' }}>📣 Lanzar en Meta</button>}
          </div>
          {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)' }}>{msg}</div>}
        </div>
      </div>

      <Lanzamientos proyecto={p} abierto={lanzar} onCerrar={() => setLanzar(false)} />

      {p.piezas.length === 0 && <div style={{ ...card, color: 'var(--df-text-muted)', fontSize: 13.5 }}>Pide ideas a la IA: te propone {b.videos} videos y {b.imagenes} fotos, cada uno con un ángulo distinto (problema → solución, unboxing contraentrega, demostración, testimonio UGC…), su guion con la voz y sus textos de anuncio. Luego generas solo los que te gusten.</div>}

      {videos.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 10px' }}>🎥 Videos ({videos.length})</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, marginBottom: 16 }}>
        {videos.map((x) => <Pieza key={x.id} x={x} precios={precios} onCambio={() => void cargar.current()} />)}
      </div>
      {fotos.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 10px' }}>🖼️ Fotos ({fotos.length})</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14, marginBottom: 16 }}>
        {fotos.map((x) => <Pieza key={x.id} x={x} precios={precios} onCambio={() => void cargar.current()} />)}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Agregar una pieza con tu propia idea</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {(['video', 'imagen'] as const).map((t) => <button key={t} onClick={() => setNuevaTipo(t)} style={{ ...btnGris, background: nuevaTipo === t ? 'var(--df-brand)' : 'var(--df-surface)', color: nuevaTipo === t ? '#fff' : 'var(--df-text-body)' }}>{t === 'video' ? '🎥 Video' : '🖼️ Foto'}</button>)}
        </div>
        <textarea value={nuevaPrompt} onChange={(e) => setNuevaPrompt(e.target.value)} rows={3} placeholder={nuevaTipo === 'video' ? 'Ej: Una mujer abre el paquete en la puerta de su casa y dice «¡Llegó y pagué al recibir!», saca el producto y lo muestra a la cámara del celular. Luz natural.' : 'Ej: El producto sobre una mesa de madera en una cocina luminosa, con espacio arriba para el precio.'} style={{ ...input, resize: 'vertical', marginBottom: 8 }} />
        <button onClick={() => void agregar()} disabled={nuevaPrompt.trim().length < 10} style={{ ...btn, opacity: nuevaPrompt.trim().length < 10 ? 0.5 : 1 }}>Agregar (gratis; pagas al generar)</button>
      </div>

      {(p.copys.textos?.length || p.copys.titulares?.length) ? (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Textos de anuncio sugeridos</div>
          {p.copys.titulares?.length ? <div style={{ fontSize: 13, marginBottom: 8 }}><b>Titulares:</b> {p.copys.titulares.join(' · ')}</div> : null}
          {p.copys.textos?.map((t, i) => <div key={i} style={{ fontSize: 13, background: 'var(--df-bg)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{t}</div>)}
          {p.copys.descripciones?.length ? <div style={{ fontSize: 13, marginTop: 6 }}><b>Descripciones:</b> {p.copys.descripciones.join(' · ')}</div> : null}
        </div>
      ) : null}
    </>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '3px 10px', color: 'var(--df-text-body)' }}>{children}</span>
);

function Pieza({ x, precios, onCambio }: { x: PiezaEstudio; precios: PreciosEstudio | null; onCambio: () => void }) {
  const [verPrompt, setVerPrompt] = useState(false);
  const [prompt, setPrompt] = useState(x.prompt);
  const [error, setError] = useState('');
  useEffect(() => { setPrompt(x.prompt); }, [x.prompt]);
  const st = ESTADOS[x.estado] || ESTADOS.borrador;
  const c = costo(x, precios);
  const editar = async (b: Parameters<typeof apiEstudioEditarPieza>[1]) => { const r = await apiEstudioEditarPieza(x.id, b); if (r.error) setError(r.error); onCambio(); };
  const generar = async () => {
    setError('');
    if (prompt !== x.prompt) { const r = await apiEstudioEditarPieza(x.id, { prompt }); if (r.error) { setError(r.error); return; } }
    if (x.url && !(await confirmar({ titulo: 'Volver a generar', mensaje: `Se genera una versión nueva por ${c} créditos y reemplaza la actual.`, aceptar: 'Generar' }))) return;
    const r = await apiEstudioGenerar(x.id);
    if (r.error) setError(r.error);
    onCambio();
  };
  const alto = x.tipo === 'video' ? (x.formato === '16:9' ? 180 : 360) : x.formato === '16:9' ? 170 : x.formato === '1:1' ? 230 : 300;
  const sel: React.CSSProperties = { ...input, width: 'auto', padding: '6px 8px', fontSize: 12.5 };
  return (
    <div className="df-est-tarjeta" style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className={x.estado === 'generando' ? 'df-est-cargando' : x.url ? '' : 'df-est-idea'} style={{ background: x.url && x.estado !== 'generando' ? '#0B1220' : undefined, height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {x.url && x.estado !== 'generando' && x.tipo === 'video' && <video src={x.url} poster={x.miniatura || undefined} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {x.url && x.estado !== 'generando' && x.tipo === 'imagen' && <a href={x.url} target="_blank" rel="noreferrer" style={{ width: '100%', height: '100%' }}><img src={x.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></a>}
        {/* Idea sin generar: tarjeta con el gancho, no un recuadro vacío. */}
        {!x.url && x.estado !== 'generando' && (
          <div style={{ color: '#E2E8F0', padding: '18px 18px', textAlign: 'left', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="df-est-flota" style={{ fontSize: 30 }}>{x.tipo === 'video' ? '🎬' : '🖼️'}</span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: '#6EE7B7' }}>{x.tipo === 'video' ? (x.angulo || 'VIDEO').toUpperCase() : (x.uso || 'FOTO').toUpperCase()}</span>
            {x.hook && <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>“{x.hook}”</span>}
            {!x.hook && x.titular && <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{x.titular}</span>}
            <span style={{ fontSize: 12, color: '#94A3B8' }}>{x.estado === 'fallido' ? 'No salió: ajusta el guion y vuelve a intentar.' : 'Idea lista. Revisa el guion y genérala.'}</span>
          </div>
        )}
        {x.estado === 'generando' && (
          <div style={{ color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontSize: 13, textAlign: 'center', padding: 16 }}>
            <div className="df-est-giro" />
            <div style={{ fontWeight: 700 }}>{x.tipo === 'video' ? 'Creando tu video' : 'Creando tu foto'}{x.progreso ? ` · ${x.progreso}%` : ''}</div>
            {x.tipo === 'video' && <div style={{ width: 160, height: 6, background: 'rgba(255,255,255,.15)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.max(6, x.progreso)}%`, height: '100%', background: 'linear-gradient(90deg,#34D399,#60A5FA)', borderRadius: 3, transition: 'width .6s ease' }} /></div>}
            <div style={{ fontSize: 11.5, opacity: 0.75 }}>{x.tipo === 'video' ? 'Tarda unos minutos. Puedes salir y volver.' : 'Menos de un minuto.'}</div>
          </div>
        )}
        <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', color: st.c, background: st.bg, backdropFilter: 'blur(4px)' }}>{st.t}</span>
      </div>
      <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{x.tipo === 'video' ? `V${x.orden} · ${x.angulo || 'Video'}` : `F${x.orden} · ${x.uso || 'Foto'}`}</div>
        {x.titular && <div style={{ fontSize: 12.5 }}><b>{x.titular}</b></div>}
        {x.texto && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.texto}</div>}
        {x.error && x.estado === 'fallido' && <div style={{ fontSize: 12, color: 'var(--df-danger-dark)' }}>{x.error} Los créditos se devolvieron.</div>}
        <button onClick={() => setVerPrompt(!verPrompt)} style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 12, color: 'var(--df-text-muted)', cursor: 'pointer' }}>{verPrompt ? '▾ Ocultar guion' : '▸ Ver / editar el guion y la voz'}</button>
        {verPrompt && <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => { if (prompt !== x.prompt) void editar({ prompt }); }} rows={7} disabled={x.estado === 'generando'} style={{ ...input, fontSize: 12, resize: 'vertical' }} />}
        {x.estado !== 'generando' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto' }}>
            {x.tipo === 'video' ? (
              <>
                <select value={x.modelo || 'sora-2'} onChange={(e) => void editar({ modelo: e.target.value })} style={sel} title="Modelo de video"><option value="sora-2">Normal</option><option value="sora-2-pro">Pro (más realista)</option></select>
                <select value={String(x.segundos || 8)} onChange={(e) => void editar({ segundos: Number(e.target.value) })} style={sel} title="Duración"><option value="4">4 s</option><option value="8">8 s</option><option value="12">12 s</option></select>
              </>
            ) : (
              <select value={x.calidad || 'medium'} onChange={(e) => void editar({ calidad: e.target.value })} style={sel} title="Calidad"><option value="medium">Calidad normal</option><option value="high">Alta calidad</option></select>
            )}
            <button onClick={() => void generar()} style={{ ...btn, padding: '7px 12px', fontSize: 12.5 }}>{x.url ? '↻ Rehacer' : '✨ Generar'} · {c} cr</button>
          </div>
        )}
        {x.url && x.estado !== 'generando' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {x.estado === 'aprobado'
              ? <button onClick={() => void editar({ estado: 'listo' })} style={{ ...btnGris, padding: '6px 10px', fontSize: 12 }}>Quitar aprobación</button>
              : <button onClick={() => void editar({ estado: 'aprobado' })} style={{ ...btnGris, padding: '6px 10px', fontSize: 12, color: 'var(--df-brand-dark)', borderColor: 'var(--df-brand)' }}>✓ Aprobar</button>}
            <a href={x.url} download style={{ ...btnGris, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>⬇️ Descargar</a>
          </div>
        )}
        {x.estado !== 'generando' && <button onClick={() => void editar({ estado: 'descartado' })} style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 11.5, color: 'var(--df-text-faint)', cursor: 'pointer' }}>Descartar</button>}
        {error && <div style={{ fontSize: 12, color: 'var(--df-danger)' }}>{error}</div>}
      </div>
    </div>
  );
}

// ── Lanzar en Meta ─────────────────────────────────────────────────────────
const OBJETIVOS = [
  { id: 'mensajes', nombre: '💬 Mensajes a WhatsApp', sub: 'Te escriben y el bot cierra la venta' },
  { id: 'ventas', nombre: '🛒 Ventas en la web', sub: 'Optimiza por compras (necesita el píxel)' },
  { id: 'trafico', nombre: '🔗 Tráfico', sub: 'Visitas a tu tienda o landing' },
] as const;
const ESTADO_L: Record<LanzamientoEstudio['estado'], { t: string; c: string; bg: string }> = {
  creando: { t: 'Creando en Meta…', c: 'var(--df-indigo, #4F46E5)', bg: 'var(--df-purple-subtle)' },
  en_pausa: { t: 'En pausa', c: 'var(--df-warning)', bg: 'var(--df-warning-subtle-2, #FEF3C7)' },
  activa: { t: '● Activa', c: '#fff', bg: 'var(--df-brand)' },
  error: { t: 'Error', c: 'var(--df-danger-dark)', bg: 'var(--df-danger-subtle)' },
};

function Lanzamientos({ proyecto, abierto, onCerrar }: { proyecto: ProyectoEstudio; abierto: boolean; onCerrar: () => void }) {
  const [op, setOp] = useState<OpcionesLanzar | null>(null);
  const [lista, setLista] = useState<LanzamientoEstudio[]>([]);
  const cargar = useRef(() => Promise.resolve());
  cargar.current = () => apiEstudioMeta(proyecto.id).then((r) => { if (r.data) { setOp(r.data.opciones); setLista(r.data.lanzamientos); } });
  useEffect(() => { void cargar.current(); }, [proyecto.id]);
  const creando = lista.some((l) => l.estado === 'creando');
  useEffect(() => {
    if (!creando) return;
    const t = setInterval(() => void cargar.current(), 10_000);
    return () => clearInterval(t);
  }, [creando]);
  const accion = async (l: LanzamientoEstudio, activar: boolean) => {
    if (activar && !(await confirmar({ titulo: 'Activar la campaña', mensaje: `Meta empezará a gastar hasta ${money(l.presupuesto)} al día de tu cuenta publicitaria.`, aceptar: 'Activar' }))) return;
    const r = await apiEstudioLanzEstado(l.id, activar);
    if (r.error) notificar(r.error, 'error'); else notificar(activar ? 'Campaña activada en Meta.' : 'Campaña pausada.');
    void cargar.current();
  };
  const reintentar = async (l: LanzamientoEstudio) => { const r = await apiEstudioLanzReintentar(l.id); if (r.error) notificar(r.error, 'error'); void cargar.current(); };

  return (
    <>
      {abierto && op && <FormLanzar proyecto={proyecto} op={op} onCerrar={onCerrar} onCreado={() => { onCerrar(); void cargar.current(); }} />}
      {lista.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>📣 Campañas en Meta de este producto</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lista.map((l) => {
              const st = ESTADO_L[l.estado];
              return (
                <div key={l.id} style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 180 }}>{l.nombre}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 10px', color: st.c, background: st.bg }}>{st.t}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 8px' }}>
                    {OBJETIVOS.find((o) => o.id === l.objetivo)?.nombre} · {money(l.presupuesto)}/día · {l.anuncios.length} anuncio{l.anuncios.length === 1 ? '' : 's'}
                  </div>
                  {l.estado === 'creando' && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--df-text-body)' }}>
                      <div className="df-est-giro" style={{ width: 18, height: 18, borderWidth: 2, borderColor: 'var(--df-border)', borderTopColor: 'var(--df-brand)' }} />{l.paso || 'Preparando…'}
                    </div>
                  )}
                  {l.estado === 'error' && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)', marginBottom: 8 }}>{l.error}</div>}
                  {(l.estado === 'en_pausa' || l.estado === 'activa') && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
                      {[['Gasto', money(l.metricas.gasto)], ['Impresiones', l.metricas.impresiones.toLocaleString('es-CO')], ['Clics', l.metricas.clics.toLocaleString('es-CO')], [l.objetivo === 'ventas' ? 'Compras' : 'Conversaciones', (l.objetivo === 'ventas' ? l.metricas.compras : l.metricas.conversaciones).toLocaleString('es-CO')]].map(([k, v]) => (
                        <div key={k} style={{ background: 'var(--df-bg)', borderRadius: 9, padding: '8px 10px' }}><div style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 600 }}>{k}</div><div style={{ fontWeight: 800, fontSize: 15 }}>{v}</div></div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {l.estado === 'en_pausa' && <button onClick={() => void accion(l, true)} style={{ ...btn, padding: '7px 13px', fontSize: 12.5 }}>▶ Activar</button>}
                    {l.estado === 'activa' && <button onClick={() => void accion(l, false)} style={{ ...btnGris, padding: '7px 13px', fontSize: 12.5 }}>⏸ Pausar</button>}
                    {l.estado === 'error' && <button onClick={() => void reintentar(l)} style={{ ...btnGris, padding: '7px 13px', fontSize: 12.5 }}>↻ Reintentar</button>}
                    {l.enlaceMeta && <a href={l.enlaceMeta} target="_blank" rel="noreferrer" style={{ ...btnGris, padding: '7px 13px', fontSize: 12.5, textDecoration: 'none' }}>Ver en Ads Manager ↗</a>}
                  </div>
                  {l.anuncios.some((a) => a.estadoMeta && !['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(a.estadoMeta)) && (
                    <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 8 }}>
                      {l.anuncios.filter((a) => a.estadoMeta && !['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(a.estadoMeta)).map((a) => `${a.nombre}: ${a.estadoMeta === 'PENDING_REVIEW' ? 'en revisión de Meta' : a.estadoMeta === 'DISAPPROVED' ? 'rechazado por Meta' : a.estadoMeta.toLowerCase()}`).join(' · ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function FormLanzar({ proyecto, op, onCerrar, onCreado }: { proyecto: ProyectoEstudio; op: OpcionesLanzar; onCerrar: () => void; onCreado: () => void }) {
  const listas = proyecto.piezas.filter((x) => x.url && ['listo', 'aprobado'].includes(x.estado));
  const aprobadas = listas.filter((x) => x.estado === 'aprobado');
  const [sel, setSel] = useState<Record<string, { texto: string; titular: string }>>(() => Object.fromEntries((aprobadas.length ? aprobadas : listas).slice(0, 5).map((x) => [x.id, { texto: x.texto, titular: x.titular }])));
  const [objetivo, setObjetivo] = useState<'mensajes' | 'ventas' | 'trafico'>(op.whatsapp ? 'mensajes' : 'trafico');
  const [presupuesto, setPresupuesto] = useState(30000);
  const [enlace, setEnlace] = useState(op.enlace);
  const [pixel, setPixel] = useState(op.pixeles[0] || '');
  const [advantage, setAdvantage] = useState(true);
  const [edad, setEdad] = useState<[number, number]>([18, 65]);
  const [genero, setGenero] = useState('todos');
  const [error, setError] = useState('');
  if (!op.conectada || !op.tienePagina) {
    return (
      <div style={{ ...card, borderColor: '#1877F2' }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 6 }}>📣 Conecta tu Administrador de anuncios</div>
        <div style={{ fontSize: 13, color: 'var(--df-text-muted)', marginBottom: 10 }}>Para lanzar en Meta, conecta primero tu cuenta publicitaria y tu página de Facebook en la pestaña <b>«Campañas en Meta»</b> (arriba). Solo se hace una vez; el dinero de los anuncios lo pagas directo a Meta.</div>
        <button onClick={onCerrar} style={btnGris}>Entendido</button>
      </div>
    );
  }
  const alternar = (x: PiezaEstudio) => setSel((s) => { const n = { ...s }; if (n[x.id]) delete n[x.id]; else n[x.id] = { texto: x.texto, titular: x.titular }; return n; });
  const elegidas = listas.filter((x) => sel[x.id]);
  const lanzar = async () => {
    setError('');
    const r = await apiEstudioLanzar(proyecto.id, {
      objetivo, presupuesto, enlace, pixelId: pixel, publico: { advantage, edadMin: edad[0], edadMax: edad[1], genero },
      piezas: elegidas.map((x) => ({ id: x.id, texto: sel[x.id].texto, titular: sel[x.id].titular })),
    });
    if (r.error) { setError(r.error); return; }
    notificar('Listo: estamos creando la campaña en Meta (en pausa). Te avisamos aquí cuando esté.');
    onCreado();
  };
  const opcion = (activo: boolean): React.CSSProperties => ({ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 10, padding: '9px 12px', border: '1px solid ' + (activo ? '#1877F2' : 'var(--df-border)'), background: activo ? 'rgba(24,119,242,.08)' : 'var(--df-surface)', color: 'var(--df-text)', flex: '1 1 180px' });
  return (
    <div style={{ ...card, borderColor: '#1877F2', boxShadow: '0 8px 30px rgba(24,119,242,.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>📣 Lanzar en Meta</div>
        <button onClick={onCerrar} style={{ ...btnGris, padding: '5px 10px' }}>✕</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 14 }}>Cuenta {op.cuenta} · página {op.pagina}. Se crea <b>en pausa</b>: tú la activas cuando quieras. El gasto lo cobra Meta directo a tu cuenta.</div>

      <span style={label}>1. Elige los anuncios ({elegidas.length} de máx. 10)</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
        {listas.map((x) => (
          <button key={x.id} onClick={() => alternar(x)} style={{ padding: 0, border: sel[x.id] ? '2px solid #1877F2' : '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#0B1220', position: 'relative', height: 150 }}>
            {x.tipo === 'video' ? (x.miniatura ? <img src={x.miniatura} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <video src={x.url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : <img src={x.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(15,23,42,.75)', borderRadius: 6, padding: '2px 6px' }}>{x.tipo === 'video' ? `🎥 V${x.orden}` : `🖼️ F${x.orden}`}</span>
            <span style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 6, background: sel[x.id] ? '#1877F2' : 'rgba(255,255,255,.85)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sel[x.id] ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      {elegidas.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-muted)' }}>Editar el texto de cada anuncio</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {elegidas.map((x) => (
              <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8, alignItems: 'start' }}>
                <span style={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }}>{x.tipo === 'video' ? `V${x.orden}` : `F${x.orden}`}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input value={sel[x.id].titular} onChange={(e) => setSel((s) => ({ ...s, [x.id]: { ...s[x.id], titular: e.target.value } }))} placeholder="Titular" style={{ ...input, fontSize: 12.5 }} />
                  <textarea value={sel[x.id].texto} onChange={(e) => setSel((s) => ({ ...s, [x.id]: { ...s[x.id], texto: e.target.value } }))} rows={2} placeholder="Texto principal" style={{ ...input, fontSize: 12.5, resize: 'vertical' }} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <span style={label}>2. ¿Qué quieres lograr?</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {OBJETIVOS.map((o) => <button key={o.id} onClick={() => setObjetivo(o.id)} style={opcion(objetivo === o.id)}><div style={{ fontWeight: 700, fontSize: 13 }}>{o.nombre}</div><div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{o.sub}</div></button>)}
      </div>
      {objetivo === 'mensajes' && <div style={{ fontSize: 12.5, color: op.whatsapp ? 'var(--df-text-muted)' : 'var(--df-danger)', marginBottom: 12 }}>{op.whatsapp ? `Los clientes llegan a tu WhatsApp (+${op.whatsapp}) y el asistente les responde.` : 'Conecta tu número en la sección WhatsApp para usar este objetivo.'}</div>}
      {objetivo !== 'mensajes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div><span style={label}>Página de destino</span><input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://tutienda.com/producto" style={input} /></div>
          {objetivo === 'ventas' && <div><span style={label}>Píxel de Meta</span>{op.pixeles.length > 1 ? <select value={pixel} onChange={(e) => setPixel(e.target.value)} style={input}>{op.pixeles.map((x) => <option key={x}>{x}</option>)}</select> : <input value={pixel} onChange={(e) => setPixel(e.target.value.replace(/\D/g, ''))} placeholder="ID del píxel" style={input} />}</div>}
        </div>
      )}

      <span style={label}>3. Presupuesto y público</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div><span style={label}>Presupuesto diario (COP)</span><input inputMode="numeric" value={presupuesto ? presupuesto.toLocaleString('es-CO') : ''} onChange={(e) => setPresupuesto(Number(e.target.value.replace(/\D/g, '')) || 0)} style={input} /></div>
        <div><span style={label}>Género</span><select value={genero} onChange={(e) => setGenero(e.target.value)} style={input} disabled={advantage}><option value="todos">Todos</option><option value="mujeres">Mujeres</option><option value="hombres">Hombres</option></select></div>
        <div><span style={label}>Edad</span><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="number" min={18} max={65} value={edad[0]} disabled={advantage} onChange={(e) => setEdad([Number(e.target.value) || 18, edad[1]])} style={input} /> – <input type="number" min={18} max={65} value={edad[1]} disabled={advantage} onChange={(e) => setEdad([edad[0], Number(e.target.value) || 65])} style={input} /></div></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}><input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Público Advantage+ (Meta busca a los compradores; recomendado para empezar)</label>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void lanzar()} disabled={!elegidas.length || presupuesto < 5000} style={{ ...btn, background: '#1877F2', opacity: !elegidas.length || presupuesto < 5000 ? 0.5 : 1 }}>Crear en Meta (en pausa)</button>
        <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{elegidas.length} anuncio{elegidas.length === 1 ? '' : 's'} · {money(presupuesto)}/día</span>
        {error && <span style={{ color: 'var(--df-danger)', fontSize: 13, flexBasis: '100%' }}>{error}</span>}
      </div>
    </div>
  );
}
