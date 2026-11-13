import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { Campana } from '../lib/api';
import { Dropdown } from '../components/Dropdown';
import { comprimirImagen } from '../components/PhotoUpload';
import { EstudioCreativos } from './EstudioCreativos';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const META = '#1877F2';
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');

const OBJETIVOS = [
  { id: 'mensajes', icono: '💬', nombre: 'Mensajes a WhatsApp', sub: 'Que te escriban para comprar' },
  { id: 'ventas', icono: '🛒', nombre: 'Ventas', sub: 'Que compren el producto' },
  { id: 'trafico', icono: '🔗', nombre: 'Tráfico', sub: 'Que visiten tu tienda' },
  { id: 'reconocimiento', icono: '📢', nombre: 'Reconocimiento', sub: 'Que conozcan tu marca' },
];
const objetivoDe = (id: string) => OBJETIVOS.find((o) => o.id === id) || OBJETIVOS[0];

const PASOS = [
  { n: 1, t: 'Producto', s: 'La IA lo estudia' },
  { n: 2, t: 'Creativos', s: 'Imágenes del anuncio' },
  { n: 3, t: 'Textos', s: 'Copys para Meta' },
  { n: 4, t: 'Publicar', s: 'En tu cuenta de anuncios' },
];
/** ¿Qué pasos están hechos de verdad? (no basta con haber pasado por ellos). */
const hechos = (c: Campana) => [!!c.brief, c.creativos.length > 0, !!c.copys?.textos.length, c.estado === 'publicada'];

/** Rueda pequeña para los botones mientras la IA trabaja. */
const Rueda = ({ claro = true }: { claro?: boolean }) => (
  <span className="df-est-giro" style={{ width: 15, height: 15, borderWidth: 2, borderColor: claro ? 'rgba(255,255,255,.35)' : 'var(--df-border)', borderTopColor: claro ? '#fff' : 'var(--df-brand)', display: 'inline-block' }} />
);

function Chips({ titulo, items, color }: { titulo: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ ...label, fontSize: 11, letterSpacing: '.06em' }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((t, i) => (
          <span key={i} style={{ background: color, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: 'var(--df-text-strong)', fontWeight: 500 }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Indicador de pasos: círculos numerados unidos por una línea; ✓ solo si el paso está hecho. */
function Pasos({ c, paso, onIr }: { c: Campana; paso: number; onIr: (n: number) => void }) {
  const ok = hechos(c);
  return (
    <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto' }}>
      {PASOS.map((p, i) => {
        const activo = p.n === paso;
        const hecho = ok[i];
        return (
          <div key={p.n} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 130 }}>
            <button onClick={() => onIr(p.n)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left' }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13.5,
                background: hecho ? 'var(--df-brand)' : activo ? 'var(--df-brand-subtle-2)' : 'var(--df-bg)',
                color: hecho ? '#fff' : activo ? 'var(--df-brand-dark)' : 'var(--df-text-faint)',
                border: activo ? '2px solid var(--df-brand)' : hecho ? '2px solid var(--df-brand)' : '2px solid var(--df-border)',
                boxShadow: activo ? '0 0 0 4px rgba(16,185,129,.15)' : 'none',
              }}>{hecho ? '✓' : p.n}</span>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: activo ? 'var(--df-brand-dark)' : 'var(--df-text-strong)' }}>{p.t}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--df-text-faint)' }}>{p.s}</span>
              </span>
            </button>
            {i < PASOS.length - 1 && <span style={{ flex: 1, height: 2, margin: '15px 10px 0', minWidth: 14, background: hecho ? 'var(--df-brand)' : 'var(--df-border)', borderRadius: 2 }} />}
          </div>
        );
      })}
    </div>
  );
}

/** Encabezado de cada paso: ícono, título y ayuda. */
function Titulo({ icono, titulo, ayuda }: { icono: string; titulo: string; ayuda: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--df-brand-subtle-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icono}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{titulo}</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2, lineHeight: 1.55 }}>{ayuda}</div>
      </div>
    </div>
  );
}

/** Lista de textos generados: cada uno en su tarjeta, editable, con contador y botón de copiar. */
function ListaCopys({ df, titulo, ayuda, items, max, onCambio }: {
  df: DealFlowState; titulo: string; ayuda: string; items: string[]; max?: number; onCambio: (v: string[]) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{titulo}</span>
        <span style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>{items.length} variante{items.length === 1 ? '' : 's'}</span>
      </div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginBottom: 10 }}>{ayuda}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((t, i) => {
          const clave = titulo + i;
          const largo = max && t.length > max;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'start', border: '1px solid var(--df-border)', borderRadius: 11, padding: '10px 10px 10px 12px', background: 'var(--df-surface)' }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--df-bg)', fontSize: 12, fontWeight: 800, color: 'var(--df-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>{i + 1}</span>
              <div>
                <textarea
                  value={t}
                  onChange={(e) => onCambio(items.map((x, k) => (k === i ? e.target.value : x)))}
                  rows={t.length > 90 ? 3 : 1}
                  style={{ ...input, border: 'none', padding: '4px 0', resize: 'vertical', lineHeight: 1.5, background: 'transparent' }}
                />
                {max ? <div style={{ fontSize: 11, color: largo ? 'var(--df-danger)' : 'var(--df-text-faint)', textAlign: 'right' }}>{t.length}/{max}</div> : null}
              </div>
              <button onClick={() => df.copiarCopy(clave, t)} style={{ ...btnGris, padding: '6px 11px', fontSize: 12, whiteSpace: 'nowrap', color: df.mkCopied === clave ? 'var(--df-brand-dark)' : 'var(--df-text-body)' }}>
                {df.mkCopied === clave ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Paso 1 · Producto ─────────────────────────────────────────────────
function PasoProducto({ df, c }: { df: DealFlowState; c: Campana }) {
  const [idea, setIdea] = useState(c.brief?.producto || '');
  const [precio, setPrecio] = useState(c.brief?.precio || '');
  const [publico, setPublico] = useState('');
  const [imagen, setImagen] = useState('');
  const b = c.brief;

  return (
    <>
      <div style={card}>
        <Titulo icono="🔎" titulo="Cuéntale a la IA qué vendes" ayuda="Antes de crear nada, la IA estudia tu producto: a quién le sirve, qué problema resuelve y con qué ángulos se vende mejor." />
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14, marginBottom: 12 }}>
          <div>
            <div style={label}>¿Qué vendes?</div>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={5}
              placeholder="Ej: Faja colombiana de compresión alta, reduce tallas al instante, para mujeres de 25 a 45 años"
              style={{ ...input, resize: 'vertical', height: 'calc(100% - 22px)' }} />
          </div>
          <label style={{ cursor: 'pointer' }}>
            <div style={label}>Foto (opcional)</div>
            <div style={{ height: 128, border: '1.5px dashed var(--df-border)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--df-bg)', textAlign: 'center' }}>
              {imagen ? <img src={imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, color: 'var(--df-text-muted)', padding: 8 }}><span style={{ fontSize: 24, display: 'block' }}>📷</span>La IA la analiza</span>}
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void comprimirImagen(f).then(setImagen); }} />
          </label>
        </div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><div style={label}>Precio (opcional)</div><input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$89.900" style={input} /></div>
          <div><div style={label}>¿A quién se lo vendes? (opcional)</div><input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Mujeres 25-45, Bogotá" style={input} /></div>
        </div>
        <button onClick={() => df.pasoProducto(c.id, { idea, precio, publico, imagen: imagen || undefined })} disabled={df.mkLoading} style={{ ...btn, opacity: df.mkLoading ? 0.8 : 1 }}>
          {df.mkLoading ? <><Rueda /> Estudiando el producto…</> : b ? '↻ Volver a estudiar' : '✨ Estudiar mi producto'}
        </button>
      </div>

      {b && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div className="df-est-idea" style={{ padding: '16px 20px', color: '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: '#6EE7B7' }}>ESTO ENTENDIÓ LA IA</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{b.producto}</div>
            {b.propuesta && <div style={{ marginTop: 6, fontSize: 14, opacity: 0.9, fontStyle: 'italic' }}>“{b.propuesta}”</div>}
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            {b.descripcion && <div style={{ color: 'var(--df-text-body)', fontSize: 13.5, lineHeight: 1.6 }}>{b.descripcion}</div>}
            {b.publico && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-bg)', borderRadius: 10, padding: '10px 12px' }}><span style={{ fontSize: 18 }}>🎯</span><div><div style={{ ...label, fontSize: 11, marginBottom: 2, letterSpacing: '.06em' }}>PÚBLICO OBJETIVO</div><div style={{ fontSize: 13.5 }}>{b.publico}</div></div></div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Chips titulo="PROBLEMAS QUE RESUELVE" items={b.dolores} color="rgba(239,68,68,.10)" />
              <Chips titulo="BENEFICIOS" items={b.beneficios} color="rgba(16,185,129,.12)" />
              <Chips titulo="ÁNGULOS DE VENTA" items={b.angulos} color="rgba(99,102,241,.12)" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Paso 2 · Creativos ────────────────────────────────────────────────
const FORMATOS = [
  { id: 'feed', t: 'Cuadrado', s: 'Feed', w: 22, h: 22 },
  { id: 'historia', t: 'Vertical', s: 'Historias y reels', w: 16, h: 28 },
  { id: 'horizontal', t: 'Horizontal', s: 'Ancho', w: 30, h: 18 },
];
function PasoCreativos({ df, c }: { df: DealFlowState; c: Campana }) {
  const [instruccion, setInstruccion] = useState('');
  const [tamano, setTamano] = useState('feed');
  const [cantidad, setCantidad] = useState(1);
  const costo = (df.costoCreditos?.imagen || 20) * cantidad;

  if (!c.brief) return <Falta icono="🔎" texto="Primero completa el paso 1 para que la IA sepa qué dibujar." />;

  return (
    <>
      <div style={card}>
        <Titulo icono="🎨" titulo="Crea las imágenes del anuncio" ayuda={<>Se generan a partir de lo que la IA entendió de <b>{c.brief.producto}</b>. ¿Quieres videos? Créalos en <b>🎬 Videos y fotos</b>.</>} />
        {c.brief.ideasCreativo.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Ideas de la IA · toca una para usarla</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.brief.ideasCreativo.map((idea, i) => (
                <button key={i} onClick={() => setInstruccion(idea)} style={{ ...btnGris, fontSize: 12.5, textAlign: 'left', borderRadius: 999, padding: '6px 12px', borderColor: instruccion === idea ? 'var(--df-brand)' : 'var(--df-border)', background: instruccion === idea ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)' }}>💡 {idea}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>¿Cómo quieres la imagen? (opcional)</div>
          <input value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="Ej: sobre fondo blanco, con luz natural" style={input} />
        </div>
        <div style={label}>Formato</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {FORMATOS.map((f) => (
            <button key={f.id} onClick={() => setTamano(f.id)} style={{ flex: '1 1 150px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 11, padding: '10px 12px', border: '1px solid ' + (tamano === f.id ? 'var(--df-brand)' : 'var(--df-border)'), background: tamano === f.id ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: 'var(--df-text)' }}>
              <span style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: f.w, height: f.h, borderRadius: 4, border: '2px solid ' + (tamano === f.id ? 'var(--df-brand)' : 'var(--df-text-faint)') }} /></span>
              <span><span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{f.t}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--df-text-muted)' }}>{f.s}</span></span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden' }}>
            {[1, 2, 3, 4].map((n) => <button key={n} onClick={() => setCantidad(n)} style={{ border: 'none', background: cantidad === n ? '#0F172A' : 'var(--df-surface)', color: cantidad === n ? '#fff' : 'var(--df-text-body)', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}
          </div>
          <button onClick={() => df.pasoCreativos(c.id, { instruccion, cantidad, tamano })} disabled={df.mkLoading} style={{ ...btn, opacity: df.mkLoading ? 0.8 : 1 }}>
            {df.mkLoading ? <><Rueda /> Creando…</> : `✨ Generar ${cantidad} imagen${cantidad > 1 ? 'es' : ''}`}
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', background: 'var(--df-bg)', borderRadius: 999, padding: '5px 11px' }}>{costo} créditos · tienes {df.creditos}</span>
        </div>
      </div>

      {(c.creativos.length > 0 || df.mkLoading) && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Tus imágenes ({c.creativos.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
            {df.mkLoading && Array.from({ length: cantidad }).map((_, i) => <div key={'c' + i} className="df-est-cargando" style={{ aspectRatio: '1 / 1', borderRadius: 12 }} />)}
            {c.creativos.map((url, i) => (
              <div key={i} className="df-est-tarjeta" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--df-border)', background: 'var(--df-bg)' }}>
                <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} /></a>
                <span style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(15,23,42,.7)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px' }}>#{i + 1}</span>
                <button onClick={() => df.editarCampana(c.id, { creativos: c.creativos.filter((_, k) => k !== i) })} title="Quitar esta imagen"
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,.95)', border: 'none', borderRadius: 8, width: 28, height: 28, fontFamily: 'inherit', fontSize: 13, color: 'var(--df-danger-dark)', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Paso 3 · Textos ───────────────────────────────────────────────────
function PasoTextos({ df, c }: { df: DealFlowState; c: Campana }) {
  const [tono, setTono] = useState('Cercano y vendedor');
  const [cantidad, setCantidad] = useState(4);
  const copys = c.copys;

  if (!c.brief) return <Falta icono="🔎" texto="Primero completa el paso 1." />;

  const set = (k: 'textos' | 'titulos' | 'descripciones') => (v: string[]) =>
    df.editarCampana(c.id, { copys: { ...(copys || { textos: [], titulos: [], descripciones: [] }), [k]: v } });

  return (
    <>
      <div style={card}>
        <Titulo icono="✍️" titulo="Escribe los textos del anuncio" ayuda={<>Con la estructura de Meta: <b>texto principal</b>, <b>título</b> y <b>descripción</b>. Cada variante con un ángulo distinto para que pruebes cuál vende más.</>} />
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={label}>Tono</div>
            <Dropdown value={tono} onChange={setTono} options={['Cercano y vendedor', 'Directo y sin rodeos', 'Elegante y premium', 'Divertido y juvenil', 'Serio y profesional'].map((t) => ({ value: t, label: t }))} />
          </div>
          <div>
            <div style={label}>Variantes de cada uno</div>
            <Dropdown value={String(cantidad)} onChange={(v) => setCantidad(Number(v))} options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
        </div>
        <button onClick={() => df.pasoTextos(c.id, { tono, cantidad })} disabled={df.mkLoading} style={{ ...btn, opacity: df.mkLoading ? 0.8 : 1 }}>
          {df.mkLoading ? <><Rueda /> Escribiendo…</> : copys ? '↻ Escribir otros textos' : '✨ Escribir los textos'}
        </button>
      </div>

      {df.mkLoading && !copys && <div className="df-est-cargando" style={{ height: 160, borderRadius: 14, marginBottom: 14 }} />}
      {copys && (
        <div style={card}>
          <ListaCopys df={df} titulo="Textos principales" ayuda="El cuerpo del anuncio. Lo primero que lee tu cliente." items={copys.textos} onCambio={set('textos')} />
          <ListaCopys df={df} titulo="Títulos" ayuda="El titular en negrita, bajo la imagen." max={40} items={copys.titulos} onCambio={set('titulos')} />
          <ListaCopys df={df} titulo="Descripciones" ayuda="La línea de apoyo bajo el título." max={30} items={copys.descripciones} onCambio={set('descripciones')} />
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Edita cualquiera aquí mismo: se guarda solo.</div>
        </div>
      )}
    </>
  );
}

// ── Paso 4 · Publicar ─────────────────────────────────────────────────
/** Vista previa tipo publicación de Facebook / Instagram con lo elegido. */
function VistaPrevia({ pagina, texto, titulo, descripcion, imagen, objetivo }: { pagina: string; texto: string; titulo: string; descripcion: string; imagen: string; objetivo: string }) {
  const cta = objetivo === 'mensajes' ? 'Enviar mensaje' : objetivo === 'ventas' ? 'Comprar' : 'Más información';
  return (
    <div style={{ border: '1px solid var(--df-border)', borderRadius: 14, background: '#fff', color: '#050505', overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,.08)', maxWidth: 380, width: '100%' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '10px 12px' }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#10B981,#6366F1)', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{(pagina || 'T').slice(0, 1).toUpperCase()}</span>
        <div style={{ lineHeight: 1.2 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{pagina || 'Tu página'}</div><div style={{ fontSize: 11.5, color: '#65676B' }}>Publicidad · 🌎</div></div>
      </div>
      <div style={{ padding: '0 12px 10px', fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{texto}</div>
      {imagen ? <img src={imagen} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '1 / 1', background: '#F0F2F5' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F0F2F5' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo || 'Título'}</div>
          {descripcion && <div style={{ fontSize: 12.5, color: '#65676B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{descripcion}</div>}
        </div>
        <span style={{ background: '#E4E6EB', borderRadius: 6, padding: '7px 12px', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{objetivo === 'mensajes' ? '🟢 ' : ''}{cta}</span>
      </div>
    </div>
  );
}

/** Elegir una de varias variantes de texto como «pastillas» numeradas. */
function Variantes({ titulo, items, sel, onSel }: { titulo: string; items: string[]; sel: number; onSel: (n: number) => void }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={label}>{titulo}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((t, k) => (
          <button key={k} onClick={() => onSel(k)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.45, border: '1px solid ' + (sel === k ? 'var(--df-brand)' : 'var(--df-border)'), background: sel === k ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: 'var(--df-text)' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, border: '2px solid ' + (sel === k ? 'var(--df-brand)' : 'var(--df-border)'), background: sel === k ? 'radial-gradient(circle, var(--df-brand) 45%, transparent 50%)' : 'transparent' }} />
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PasoPublicar({ df, c }: { df: DealFlowState; c: Campana }) {
  const ads = df.adsCuenta;
  const ops = df.adsOpciones;
  const [presupuesto, setPresupuesto] = useState(20000);
  const [sel, setSel] = useState({ texto: 0, titulo: 0, descripcion: 0, creativo: 0 });
  const [cuenta, setCuenta] = useState('');
  const [pagina, setPagina] = useState('');
  const [publicado, setPublicado] = useState(false);

  const listo = !!c.copys?.textos.length && c.creativos.length > 0;

  // Elegir cuenta publicitaria y página tras autorizar.
  if (ops) {
    return (
      <div style={card}>
        <Titulo icono="🔗" titulo="Elige dónde publicar" ayuda="Estas son las cuentas publicitarias y páginas de tu Facebook." />
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={label}>Cuenta publicitaria</div>
            <Dropdown value={cuenta} onChange={setCuenta} placeholder="Elige una…" options={[{ value: '', label: 'Elige una…' }, ...ops.cuentas.map((a) => ({ value: a.id, label: `${a.nombre} (${a.moneda})` }))]} />
          </div>
          <div>
            <div style={label}>Página de Facebook (el anuncio sale a su nombre)</div>
            <Dropdown value={pagina} onChange={setPagina} placeholder="Elige una…" options={[{ value: '', label: 'Elige una…' }, ...ops.paginas.map((p) => ({ value: p.id, label: p.nombre }))]} />
          </div>
        </div>
        <button
          onClick={() => {
            const a = ops.cuentas.find((x) => x.id === cuenta);
            const p = ops.paginas.find((x) => x.id === pagina);
            df.elegirCuentaAds({ adAccountId: cuenta, adAccountNombre: a?.nombre || '', moneda: a?.moneda || '', pageId: pagina, pageNombre: p?.nombre || '' });
          }}
          disabled={!cuenta} style={{ ...btn, background: META, opacity: cuenta ? 1 : 0.5 }}>Guardar y conectar</button>
        {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
      </div>
    );
  }

  // Sin conectar todavía.
  if (!ads?.conectada) {
    return (
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${META}, #4F46E5)`, color: '#fff', padding: '22px 22px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="df-est-flota" style={{ fontSize: 38 }}>📣</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Conecta tu Administrador de anuncios</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 4, lineHeight: 1.5 }}>Publica desde aquí en tu propia cuenta de Meta. <b>La pauta la pagas directo a Meta</b> con tu método de pago.</div>
          </div>
          <button onClick={df.conectarAds} disabled={df.mkLoading} style={{ ...btn, background: '#fff', color: META }}>
            {df.mkLoading ? <><Rueda claro={false} /> Conectando…</> : 'Conectar con Facebook'}
          </button>
        </div>
        {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, padding: '12px 20px' }}>{df.mkError}</div>}
      </div>
    );
  }

  if (!listo) {
    const ok = hechos(c);
    return <Falta icono="🧩" texto={`Para publicar te falta ${[!ok[1] && 'al menos una imagen (paso 2)', !ok[2] && 'los textos (paso 3)'].filter(Boolean).join(' y ')}.`} />;
  }

  const cp = c.copys!;
  const PRESETS = [10000, 20000, 50000, 100000];

  return (
    <>
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(24,119,242,.06)', borderColor: 'rgba(24,119,242,.25)' }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: META, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>f</span>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>Conectado a {ads.adAccountNombre}</span>
        {ads.pageNombre && <span style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>· página {ads.pageNombre}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={df.desconectarAds} style={{ ...btnGris, padding: '6px 11px', fontSize: 12, color: 'var(--df-danger-dark)', borderColor: 'var(--df-danger-border)' }}>Desconectar</button>
      </div>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,380px)', gap: 16, alignItems: 'start' }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <Titulo icono="🚀" titulo="Arma el anuncio" ayuda={<>Objetivo: <b>{objetivoDe(c.objetivo).icono} {objetivoDe(c.objetivo).nombre}</b>. Lo que elijas se ve al lado tal como saldrá.</>} />
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Imagen</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {c.creativos.map((url, i) => (
                <button key={i} onClick={() => setSel((s) => ({ ...s, creativo: i }))} style={{ padding: 0, border: '3px solid ' + (sel.creativo === i ? 'var(--df-brand)' : 'transparent'), borderRadius: 11, cursor: 'pointer', background: 'transparent', outline: sel.creativo === i ? 'none' : '1px solid var(--df-border)' }}>
                  <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                </button>
              ))}
            </div>
          </div>
          <Variantes titulo="Texto principal" items={cp.textos} sel={sel.texto} onSel={(n) => setSel((s) => ({ ...s, texto: n }))} />
          <Variantes titulo="Título" items={cp.titulos} sel={sel.titulo} onSel={(n) => setSel((s) => ({ ...s, titulo: n }))} />
          <Variantes titulo="Descripción" items={cp.descripciones} sel={sel.descripcion} onSel={(n) => setSel((s) => ({ ...s, descripcion: n }))} />
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Presupuesto diario ({ads.moneda || 'COP'})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESETS.map((v) => <button key={v} onClick={() => setPresupuesto(v)} style={{ ...btnGris, padding: '7px 11px', fontSize: 12.5, borderColor: presupuesto === v ? 'var(--df-brand)' : 'var(--df-border)', background: presupuesto === v ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)' }}>{money(v)}</button>)}
              <input inputMode="numeric" value={presupuesto ? presupuesto.toLocaleString('es-CO') : ''} onChange={(e) => setPresupuesto(Number(e.target.value.replace(/\D/g, '')) || 0)} style={{ ...input, width: 130 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--df-text-faint)', marginTop: 6 }}>≈ {money(presupuesto * 30)} al mes si la dejas activa todos los días.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 11, padding: '11px 13px', marginBottom: 16, color: 'var(--df-warning)', fontSize: 13, lineHeight: 1.55 }}>
            <span>⏸</span><span>El anuncio se crea <b>en pausa</b>. No se gasta ni un peso hasta que le des play en tu Administrador de anuncios.</span>
          </div>
          <button
            onClick={() => { void df.publicarCampana(c.id, { presupuesto, textoIdx: sel.texto, tituloIdx: sel.titulo, descripcionIdx: sel.descripcion, creativoIdx: sel.creativo }).then((ok) => setPublicado(!!ok)); }}
            disabled={df.mkLoading || presupuesto < 1000} style={{ ...btn, background: META, opacity: df.mkLoading ? 0.8 : 1, width: '100%', justifyContent: 'center' }}>
            {df.mkLoading ? <><Rueda /> Publicando en Meta…</> : 'Publicar en mi Administrador de anuncios'}
          </button>
          {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
          {(publicado || c.estado === 'publicada') && (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--df-brand-subtle-2)', borderRadius: 11, padding: '11px 13px', color: 'var(--df-brand-dark)', fontSize: 13.5, fontWeight: 600 }}>
              <span style={{ fontSize: 18 }}>🎉</span> La campaña quedó creada en pausa dentro de tu Administrador de anuncios.
            </div>
          )}
        </div>
        <div style={{ position: 'sticky', top: 12 }}>
          <div style={{ ...label, textAlign: 'center' }}>VISTA PREVIA</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <VistaPrevia pagina={ads.pageNombre} texto={cp.textos[sel.texto] || ''} titulo={cp.titulos[sel.titulo] || ''} descripcion={cp.descripciones[sel.descripcion] || ''} imagen={c.creativos[sel.creativo] || ''} objetivo={c.objetivo} />
          </div>
        </div>
      </div>
    </>
  );
}

function Falta({ icono, texto }: { icono: string; texto: string }) {
  return (
    <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ fontSize: 28 }}>{icono}</span>
      <span style={{ fontSize: 14, color: 'var(--df-text-body)' }}>{texto}</span>
    </div>
  );
}

// ── Lista de campañas ─────────────────────────────────────────────────
function ListaCampanas({ df }: { df: DealFlowState }) {
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('mensajes');

  return (
    <>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${META} 0%, #4F46E5 60%, #7C3AED 100%)`, color: '#fff', padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className="df-est-flota" style={{ fontSize: 34 }}>📣</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Nueva campaña para Meta</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>La IA estudia tu producto, crea las imágenes, escribe los textos y la publica en tu cuenta (en pausa).</div>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Nombre de la campaña</div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Fajas — noviembre" style={{ ...input, maxWidth: 420 }} />
          </div>
          <div style={label}>¿Qué quieres lograr?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 16 }}>
            {OBJETIVOS.map((o) => (
              <button key={o.id} onClick={() => setObjetivo(o.id)} style={{
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 12, padding: '12px 13px', display: 'flex', gap: 10, alignItems: 'flex-start',
                border: '1.5px solid ' + (objetivo === o.id ? 'var(--df-brand)' : 'var(--df-border)'), background: objetivo === o.id ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: 'var(--df-text)',
              }}>
                <span style={{ fontSize: 22 }}>{o.icono}</span>
                <span><span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: objetivo === o.id ? 'var(--df-brand-dark)' : 'var(--df-text-strong)' }}>{o.nombre}</span><span style={{ display: 'block', color: 'var(--df-text-muted)', fontSize: 12 }}>{o.sub}</span></span>
              </button>
            ))}
          </div>
          <button onClick={() => { void df.crearCampana(nombre, objetivo); setNombre(''); }} style={btn}>Crear campaña →</button>
        </div>
      </div>

      {df.campanas.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 15, margin: '6px 0 10px' }}>Tus campañas ({df.campanas.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {df.campanas.map((c) => {
              const ok = hechos(c);
              const n = ok.filter(Boolean).length;
              const st = c.estado === 'publicada' ? { t: '● Publicada', c: '#fff', bg: 'var(--df-brand)' } : ok[1] && ok[2] ? { t: 'Lista para publicar', c: '#fff', bg: META } : { t: 'Borrador', c: 'var(--df-text-body)', bg: 'rgba(255,255,255,.92)' };
              return (
                <div key={c.id} className="df-est-tarjeta" style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => void df.abrirCampana(c.id)} style={{ padding: 0, border: 'none', cursor: 'pointer', position: 'relative', height: 140, background: 'transparent' }} className={c.creativos[0] ? '' : 'df-est-idea'}>
                    {c.creativos[0] ? <img src={c.creativos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ fontSize: 34 }}>{objetivoDe(c.objetivo).icono}</span>}
                    <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', color: st.c, background: st.bg, boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}>{st.t}</span>
                    {c.creativos.length > 1 && <span style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', color: '#fff', background: 'rgba(15,23,42,.7)' }}>🖼️ {c.creativos.length}</span>}
                  </button>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.nombre}</div>
                      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5 }}>{objetivoDe(c.objetivo).icono} {objetivoDe(c.objetivo).nombre}</div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', gap: 4 }}>{ok.map((h, i) => <span key={i} title={PASOS[i].t} style={{ flex: 1, height: 5, borderRadius: 3, background: h ? 'var(--df-brand)' : 'var(--df-border)' }} />)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 4 }}>{n} de 4 pasos</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button onClick={() => void df.abrirCampana(c.id)} style={{ ...btn, padding: '8px 14px', fontSize: 13, flex: 1, justifyContent: 'center' }}>{c.estado === 'publicada' ? 'Ver' : 'Continuar'}</button>
                      <button onClick={() => df.borrarCampana(c.id)} title="Eliminar" style={{ ...btnGris, padding: '8px 11px', color: 'var(--df-danger-dark)' }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ── Sección ───────────────────────────────────────────────────────────
export function Marketing({ df }: { df: DealFlowState }) {
  const c = df.campana;
  const [paso, setPaso] = useState(1);
  // Dos espacios: el Estudio de videos y fotos (UGC / e-commerce) y las campañas para Meta.
  const [vista, setVista] = useState<'estudio' | 'campanas'>(() => { try { return (localStorage.getItem('df-mk-vista') as 'estudio' | 'campanas') || 'estudio'; } catch { return 'estudio'; } });
  const irA = (v: 'estudio' | 'campanas') => { setVista(v); try { localStorage.setItem('df-mk-vista', v); } catch { /* sin almacenamiento */ } };
  // Al entrar refrescamos campañas y saldo (por ref: las funciones se recrean en cada render).
  const recargar = useRef({ campanas: df.reloadCampanas, creditos: df.reloadCreditos });
  recargar.current = { campanas: df.reloadCampanas, creditos: df.reloadCreditos };
  useEffect(() => { void recargar.current.campanas(); void recargar.current.creditos(); }, []);
  // Al abrir una campaña, saltamos al paso donde se quedó.
  useEffect(() => { if (c) setPaso(Math.min(Math.max(c.paso, 1), 4)); }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section data-screen-label="Marketing IA" style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Marketing IA</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>
            {c ? 'Arma tu campaña paso a paso y publícala en Meta.' : vista === 'estudio' ? 'Crea videos UGC y fotos de producto con IA para vender en redes y en tu tienda.' : 'Campañas completas: la IA estudia tu producto, crea las imágenes, escribe los textos y la publica.'}
          </p>
        </div>
        {(c || vista !== 'estudio') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '7px 14px' }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: df.creditos > 20 ? 'var(--df-brand-dark)' : 'var(--df-warning)' }}>{df.creditos.toLocaleString('es-CO')}</span>
            <span style={{ color: 'var(--df-text-muted)', fontSize: 12.5 }}>créditos</span>
          </div>
        )}
      </div>

      {!c && (
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, marginBottom: 16 }}>
          {([['estudio', '🎬 Videos y fotos'], ['campanas', '📣 Campañas en Meta']] as const).map(([v, t]) => (
            <button key={v} onClick={() => irA(v)} style={{ background: vista === v ? 'var(--df-surface)' : 'transparent', color: vista === v ? 'var(--df-text)' : 'var(--df-text-muted)', border: 'none', borderRadius: 9, padding: '8px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: vista === v ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>{t}</button>
          ))}
        </div>
      )}

      {df.mkSinCreditos && (
        <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--df-warning-subtle-2)', borderColor: 'var(--df-warning-border)' }}>
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--df-warning)' }}>Te quedaste sin créditos</div>
            <div style={{ color: 'var(--df-warning)', fontSize: 13, marginTop: 2 }}>Recarga en «🎬 Videos y fotos» → Recargar créditos para seguir generando.</div>
          </div>
        </div>
      )}

      {!c && vista === 'estudio' ? (
        <EstudioCreativos df={df} />
      ) : !c ? (
        <ListaCampanas df={df} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={df.cerrarCampana} style={btnGris}>← Mis campañas</button>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '0 12px' }}>
              <span style={{ fontSize: 16 }}>{objetivoDe(c.objetivo).icono}</span>
              <input value={c.nombre} onChange={(e) => df.renombrarCampana(c.id, e.target.value)} style={{ ...input, border: 'none', padding: '10px 0', fontWeight: 800, fontSize: 15, background: 'transparent' }} title="Toca para cambiar el nombre" />
              <span style={{ fontSize: 12, color: 'var(--df-text-faint)', whiteSpace: 'nowrap' }}>✎</span>
            </div>
          </div>

          <Pasos c={c} paso={paso} onIr={setPaso} />

          {df.mkError && paso !== 4 && (
            <div style={{ ...card, background: 'var(--df-danger-subtle)', borderColor: 'var(--df-danger-border)', color: 'var(--df-danger-dark)', fontSize: 13.5 }}>{df.mkError}</div>
          )}

          {paso === 1 && <PasoProducto df={df} c={c} />}
          {paso === 2 && <PasoCreativos df={df} c={c} />}
          {paso === 3 && <PasoTextos df={df} c={c} />}
          {paso === 4 && <PasoPublicar df={df} c={c} />}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 4 }}>
            {paso > 1 ? <button onClick={() => setPaso(paso - 1)} style={btnGris}>← {PASOS[paso - 2].t}</button> : <span />}
            {paso < 4 && <button onClick={() => setPaso(paso + 1)} style={{ ...btn, background: '#0F172A' }}>Siguiente: {PASOS[paso].t} →</button>}
          </div>
        </>
      )}
    </section>
  );
}
