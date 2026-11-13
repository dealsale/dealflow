import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { comprimirImagen } from '../components/PhotoUpload';
import { confirmar, notificar } from '../components/dialogs';
import {
  apiEstudio, apiEstudioAgregar, apiEstudioBorrar, apiEstudioEditarPieza, apiEstudioGenerar, apiEstudioGuardar, apiEstudioPaquete, apiEstudioProyecto, apiRecargarCreditos,
  type BriefEstudio, type PiezaEstudio, type PreciosEstudio, type ProyectoEstudio, type ProyectoEstudioResumen,
} from '../lib/api';

/**
 * Estudio de videos y fotos (Marketing IA). La tienda describe su producto (y sube una foto
 * real), la IA propone videos UGC y fotos de e-commerce con ángulos distintos, y cada pieza se
 * genera aparte mostrando antes cuántos créditos cuesta. Solo se cobra con créditos.
 */

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5, display: 'block' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');

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
  borrador: { t: 'Idea', c: 'var(--df-text-muted)', bg: 'var(--df-bg)' },
  generando: { t: 'Generando…', c: 'var(--df-indigo, #4F46E5)', bg: 'var(--df-purple-subtle)' },
  listo: { t: 'Listo', c: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' },
  aprobado: { t: '✓ Aprobado', c: '#fff', bg: 'var(--df-brand)' },
  fallido: { t: 'Falló', c: 'var(--df-danger-dark)', bg: 'var(--df-danger-subtle)' },
  descartado: { t: 'Descartado', c: 'var(--df-text-faint)', bg: 'var(--df-bg)' },
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
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🎬 Estudio de videos y fotos</div>
        <div style={{ fontSize: 13, color: 'var(--df-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
          Videos UGC y fotos de producto para vender lo que sea. Solo pagas con créditos lo que generas; si algo falla, los créditos vuelven solos.
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 700 }}>CRÉDITOS</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: saldo > 100 ? 'var(--df-brand-dark)' : 'var(--df-warning)' }}>{saldo.toLocaleString('es-CO')}</div>
      </div>
      <button onClick={() => setRecarga(!recarga)} style={btn}>Recargar créditos</button>
      {recarga && <Recarga df={df} />}
      {precios && (
        <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--df-text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>💡 Ideas y guiones: <b>{precios.paquete}</b></span>
          <span>🖼️ Foto: <b>{precios.imagen.medium}</b> (alta calidad {precios.imagen.high})</span>
          <span>🎥 Video 8 s: <b>{precios.video['sora-2']?.['8']}</b> (pro {precios.video['sora-2-pro']?.['8']})</span>
          {!precios.disponible && <span style={{ color: 'var(--df-danger)' }}>⚠️ La IA no está configurada en el servidor.</span>}
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
        !nuevo && <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>Todavía no tienes productos en el estudio. Crea el primero: con una foto real del producto salen mucho mejor.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {proyectos.map((p) => (
            <button key={p.id} onClick={() => setAbierto(p.id)} style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ height: 130, background: 'var(--df-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.foto ? <img src={p.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 34 }}>📦</span>}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--df-text)' }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 2 }}>{p.videos} video{p.videos === 1 ? '' : 's'} · {p.imagenes} foto{p.imagenes === 1 ? '' : 's'}{p.generando ? ` · ⏳ ${p.generando} generando` : ''}</div>
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
    <div style={{ flexBasis: '100%', borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {df.paquetesCreditos.map((p) => (
          <button key={p.id} onClick={() => void pagar(p.id)} style={{ ...btnGris, textAlign: 'left', padding: 12 }}>
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

function FormBrief({ titulo, inicial, foto: fotoInicial, nombre: nombreInicial, id, onGuardado, onCancelar }: {
  titulo: string; inicial?: BriefEstudio; foto?: string; nombre?: string; id?: string; onGuardado: (id: string) => void; onCancelar: () => void;
}) {
  const [b, setB] = useState<BriefEstudio>({ ...BRIEF_VACIO, ...(inicial || {}) });
  const [beneficios, setBeneficios] = useState((inicial?.beneficios || []).join('\n'));
  const foto = fotoInicial || '';
  const [fotoNueva, setFotoNueva] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (p: Partial<BriefEstudio>) => setB((x) => ({ ...x, ...p }));
  const guardar = async () => {
    if (!b.producto.trim()) { setError('Escribe el nombre del producto.'); return; }
    setGuardando(true);
    const r = await apiEstudioGuardar(id || null, { nombre: nombreInicial && id ? nombreInicial : b.producto, brief: { ...b, beneficios: beneficios.split('\n').map((x) => x.trim()).filter(Boolean) }, ...(fotoNueva ? { fotoDataUrl: fotoNueva } : {}) });
    setGuardando(false);
    if (r.error || !r.data) { setError(r.error || 'No se pudo guardar.'); return; }
    onGuardado(r.data.id);
  };
  const opcion = (activo: boolean): React.CSSProperties => ({ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 10, padding: '8px 12px', border: '1px solid ' + (activo ? 'var(--df-brand)' : 'var(--df-border)'), background: activo ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: 'var(--df-text)' });
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{titulo}</div>
      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, marginBottom: 12 }}>
        <label style={{ cursor: 'pointer' }}>
          <span style={label}>Foto real del producto</span>
          <div style={{ width: 160, height: 160, border: '1px dashed var(--df-border-strong, var(--df-border))', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--df-bg)' }}>
            {fotoNueva || foto ? <img src={fotoNueva || foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', textAlign: 'center', padding: 10 }}>📷 Sube la foto del proveedor<br />(sale mucho más fiel)</span>}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void comprimirImagen(f, 1600, 0.9).then(setFotoNueva); }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignContent: 'start' }}>
          <div><span style={label}>Producto *</span><input value={b.producto} onChange={(e) => set({ producto: e.target.value })} placeholder="Ej: Faja reductora Andrea, Licuadora portátil…" style={input} /></div>
          <div><span style={label}>Categoría</span><input value={b.categoria} onChange={(e) => set({ categoria: e.target.value })} placeholder="Ej: Hogar, Belleza, Tecnología…" style={input} /></div>
          <div><span style={label}>Precio de venta (COP)</span><input inputMode="numeric" value={b.precio ? b.precio.toLocaleString('es-CO') : ''} onChange={(e) => set({ precio: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="89.900" style={input} /></div>
          <div><span style={label}>Oferta</span><input value={b.oferta} onChange={(e) => set({ oferta: e.target.value })} placeholder="Contraentrega, envío gratis, 2x…" style={input} /></div>
          <div><span style={label}>Público</span><input value={b.publico} onChange={(e) => set({ publico: e.target.value })} placeholder="Ej: Mamás 25–45 en Colombia" style={input} /></div>
          <div><span style={label}>Variantes (colores, tallas, presentaciones)</span><input value={b.variantes} onChange={(e) => set({ variantes: e.target.value })} placeholder="Negro, beige, vino tinto" style={input} /></div>
        </div>
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
      <div style={{ marginBottom: 14 }}><span style={label}>Notas para la IA (opcional)</span><input value={b.notas} onChange={(e) => set({ notas: e.target.value })} placeholder="Ej: que se vea en una cocina colombiana; nada de modelos con rostro" style={input} /></div>
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
    const t = setInterval(() => void cargar.current(), 10_000);
    return () => clearInterval(t);
  }, [generando]);

  if (!p) return <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>;
  if (editando) return <FormBrief titulo="Editar producto" id={p.id} nombre={p.nombre} inicial={p.brief} foto={p.foto} onCancelar={() => setEditando(false)} onGuardado={() => { setEditando(false); void cargar.current(); }} />;

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
  const hayListas = p.piezas.some((x) => x.url && ['listo', 'aprobado'].includes(x.estado));
  const hayAprobadas = p.piezas.some((x) => x.url && x.estado === 'aprobado');
  const b = p.brief;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onCerrar} style={btnGris}>← Mis productos</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 17, minWidth: 160 }}>{p.nombre}</div>
        <button onClick={() => setEditando(true)} style={btnGris}>Editar producto</button>
        {hayListas && <a href={`/api/estudio/proyectos/${p.id}/zip`} style={{ ...btnGris, textDecoration: 'none' }}>⬇️ Descargar todo (.zip)</a>}
        {hayAprobadas && <a href={`/api/estudio/proyectos/${p.id}/zip?aprobados=1`} style={{ ...btnGris, textDecoration: 'none' }}>⬇️ Solo aprobados</a>}
        <button onClick={() => void borrar()} style={{ ...btnGris, color: 'var(--df-danger-dark)' }}>Borrar</button>
      </div>

      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.foto ? <img src={p.foto} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} /> : <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--df-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📦</div>}
        <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>
          <div><b style={{ color: 'var(--df-text)' }}>{b.producto}</b>{b.precio ? ` · ${money(b.precio)}` : ''}{b.categoria ? ` · ${b.categoria}` : ''}</div>
          <div>{b.oferta}{b.variantes ? ` · ${b.variantes}` : ''} · estilo {b.estilo === 'ugc' ? 'UGC' : b.estilo === 'ecommerce' ? 'e-commerce' : 'mixto'} · {b.formato}</div>
          {!p.foto && <div style={{ color: 'var(--df-warning)' }}>Sin foto real: el producto puede salir distinto. Súbela en «Editar producto».</div>}
        </div>
        <button onClick={() => void pedirIdeas()} style={btn}>✨ {p.piezas.length ? 'Pedir más ideas' : 'Pedir ideas a la IA'} ({precios?.paquete ?? '…'} créditos)</button>
        {msg && <div style={{ flexBasis: '100%', fontSize: 13, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)' }}>{msg}</div>}
      </div>

      {p.piezas.length === 0 && <div style={{ ...card, color: 'var(--df-text-muted)', fontSize: 13.5 }}>Pide ideas a la IA: te propone {b.videos} videos y {b.imagenes} fotos, cada uno con un ángulo distinto (problema → solución, unboxing contraentrega, demostración, testimonio UGC…), su guion y sus textos de anuncio. Luego generas solo los que te gusten.</div>}

      {videos.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 10px' }}>🎥 Videos ({videos.length})</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }}>
        {videos.map((x) => <Pieza key={x.id} x={x} precios={precios} onCambio={() => void cargar.current()} />)}
      </div>
      {fotos.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 10px' }}>🖼️ Fotos ({fotos.length})</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
        {fotos.map((x) => <Pieza key={x.id} x={x} precios={precios} onCambio={() => void cargar.current()} />)}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Agregar una pieza con tu propia idea</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {(['video', 'imagen'] as const).map((t) => <button key={t} onClick={() => setNuevaTipo(t)} style={{ ...btnGris, background: nuevaTipo === t ? 'var(--df-brand)' : 'var(--df-surface)', color: nuevaTipo === t ? '#fff' : 'var(--df-text-body)' }}>{t === 'video' ? '🎥 Video' : '🖼️ Foto'}</button>)}
        </div>
        <textarea value={nuevaPrompt} onChange={(e) => setNuevaPrompt(e.target.value)} rows={3} placeholder={nuevaTipo === 'video' ? 'Ej: Una mujer abre el paquete en la puerta de su casa, saca el producto y lo muestra a la cámara del celular, sonriendo. Luz natural.' : 'Ej: El producto sobre una mesa de madera en una cocina luminosa, con espacio arriba para el precio.'} style={{ ...input, resize: 'vertical', marginBottom: 8 }} />
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

function Pieza({ x, precios, onCambio }: { x: PiezaEstudio; precios: PreciosEstudio | null; onCambio: () => void }) {
  const [verPrompt, setVerPrompt] = useState(x.estado === 'borrador');
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
  const vertical = x.formato !== '16:9';
  const sel: React.CSSProperties = { ...input, width: 'auto', padding: '6px 8px', fontSize: 12.5 };
  return (
    <div style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0F172A', height: x.tipo === 'video' ? (vertical ? 380 : 200) : 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {x.url && x.tipo === 'video' && <video src={x.url} poster={x.miniatura || undefined} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {x.url && x.tipo === 'imagen' && <a href={x.url} target="_blank" rel="noreferrer" style={{ width: '100%', height: '100%' }}><img src={x.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></a>}
        {!x.url && x.estado !== 'generando' && <div style={{ color: '#94A3B8', fontSize: 13, padding: 16, textAlign: 'center' }}>{x.tipo === 'video' ? '🎥' : '🖼️'}<br />{x.hook || x.uso || 'Idea lista para generar'}</div>}
        {x.estado === 'generando' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.75)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}>
            <div>⏳ {x.tipo === 'video' ? `Creando el video… ${x.progreso ? x.progreso + '%' : ''}` : 'Creando la foto…'}</div>
            {x.tipo === 'video' && <div style={{ width: '60%', height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 3 }}><div style={{ width: `${Math.max(5, x.progreso)}%`, height: '100%', background: 'var(--df-brand-light, #4ADE80)', borderRadius: 3 }} /></div>}
            {x.tipo === 'video' && <div style={{ fontSize: 11.5, opacity: 0.8 }}>Tarda unos minutos. Puedes salir y volver.</div>}
          </div>
        )}
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{x.tipo === 'video' ? `V${x.orden} · ${x.angulo || 'Video'}` : `F${x.orden} · ${x.uso || 'Foto'}`}</span>
          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', color: st.c, background: st.bg, whiteSpace: 'nowrap' }}>{st.t}</span>
        </div>
        {x.titular && <div style={{ fontSize: 12.5 }}><b>{x.titular}</b></div>}
        {x.texto && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'pre-wrap' }}>{x.texto}</div>}
        {x.error && x.estado === 'fallido' && <div style={{ fontSize: 12, color: 'var(--df-danger-dark)' }}>{x.error} Los créditos se devolvieron.</div>}
        <button onClick={() => setVerPrompt(!verPrompt)} style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 12, color: 'var(--df-text-muted)', cursor: 'pointer' }}>{verPrompt ? '▾ Ocultar guion' : '▸ Ver / editar el guion'}</button>
        {verPrompt && <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => { if (prompt !== x.prompt) void editar({ prompt }); }} rows={6} disabled={x.estado === 'generando'} style={{ ...input, fontSize: 12, resize: 'vertical' }} />}
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
