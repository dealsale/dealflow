import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { Campana } from '../lib/api';
import { Dropdown } from '../components/Dropdown';
import { comprimirImagen } from '../components/PhotoUpload';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5 };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

const OBJETIVOS = [
  { id: 'mensajes', nombre: 'Mensajes a WhatsApp', sub: 'Que te escriban para comprar' },
  { id: 'ventas', nombre: 'Ventas', sub: 'Que compren el producto' },
  { id: 'trafico', nombre: 'Tráfico', sub: 'Que visiten tu tienda' },
  { id: 'reconocimiento', nombre: 'Reconocimiento', sub: 'Que conozcan tu marca' },
];

const PASOS = ['Producto', 'Creativos', 'Textos', 'Publicar'];

function Chips({ titulo, items }: { titulo: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={label}>{titulo}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((t, i) => (
          <span key={i} style={{ background: 'var(--df-surface-2)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: 'var(--df-text-body)' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Barra de pasos del asistente (diseño "Noche"). */
function Pasos({ paso, onIr }: { paso: number; onIr: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {PASOS.map((p, i) => {
        const n = i + 1;
        return (
          <button key={p} type="button" className={`paso${n < paso ? ' hecho' : ''}`} onClick={() => onIr(n)} style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', color: n === paso ? 'var(--tinta)' : undefined }}>
            <i style={n === paso ? { borderColor: 'var(--magenta)', color: 'var(--tinta)' } : undefined}>{n < paso ? '✓' : n}</i>{p}
          </button>
        );
      })}
    </div>
  );
}

/** Lista de textos generados, cada uno copiable y editable. */
function ListaCopys({ df, titulo, ayuda, items, onCambio }: {
  df: DealFlowState; titulo: string; ayuda: string; items: string[]; onCambio: (v: string[]) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{titulo}</div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginBottom: 8 }}>{ayuda}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((t, i) => {
          const clave = titulo + i;
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={t}
                onChange={(e) => onCambio(items.map((x, k) => (k === i ? e.target.value : x)))}
                rows={t.length > 90 ? 3 : 1}
                style={{ ...input, resize: 'vertical', lineHeight: 1.5 }}
              />
              <button onClick={() => df.copiarCopy(clave, t)} style={{ ...btnGris, whiteSpace: 'nowrap' }}>
                {df.mkCopied === clave ? '¡Copiado!' : 'Copiar'}
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
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Cuéntale a la IA qué vendes</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Antes de crear nada, la IA estudia tu producto: a quién le sirve, qué problema resuelve y con qué ángulos se vende mejor.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>¿Qué vendes?</div>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            placeholder="Ej: Faja colombiana de compresión alta, reduce tallas al instante, para mujeres de 25 a 45 años"
            style={{ ...input, resize: 'vertical' }}
          />
        </div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={label}>Precio (opcional)</div>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$89.900" style={input} />
          </div>
          <div>
            <div style={label}>¿A quién se lo vendes? (opcional)</div>
            <input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Mujeres 25-45, Bogotá" style={input} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Foto del producto (opcional — la IA la analiza)</div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void comprimirImagen(f).then(setImagen); }}
            style={{ fontSize: 13 }}
          />
          {imagen && <img src={imagen} alt="" style={{ marginTop: 10, height: 80, borderRadius: 8, border: '1px solid var(--df-border)' }} />}
        </div>
        <button
          onClick={() => df.pasoProducto(c.id, { idea, precio, publico, imagen: imagen || undefined })}
          disabled={df.mkLoading}
          style={{ ...btn, opacity: df.mkLoading ? 0.7 : 1 }}
        >
          {df.mkLoading ? 'Estudiando el producto…' : b ? 'Volver a estudiar' : 'Estudiar mi producto →'}
        </button>
      </div>

      {b && (
        <div style={{ ...card, borderColor: 'var(--df-brand-border)', background: 'var(--df-brand-subtle-3)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--df-brand-dark)', marginBottom: 10 }}>Esto entendió la IA</div>
          <div style={{ fontSize: 14, marginBottom: 4 }}><b>{b.producto}</b></div>
          <div style={{ color: 'var(--df-text-body)', fontSize: 13.5, lineHeight: 1.6 }}>{b.descripcion}</div>
          {b.propuesta && <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--df-brand-dark)', fontStyle: 'italic' }}>“{b.propuesta}”</div>}
          {b.publico && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>PÚBLICO OBJETIVO</div>
              <div style={{ fontSize: 13.5, color: 'var(--df-text-body)' }}>{b.publico}</div>
            </div>
          )}
          <Chips titulo="PROBLEMAS QUE RESUELVE" items={b.dolores} />
          <Chips titulo="BENEFICIOS" items={b.beneficios} />
          <Chips titulo="ÁNGULOS DE VENTA" items={b.angulos} />
        </div>
      )}
    </>
  );
}

// ── Paso 2 · Creativos ────────────────────────────────────────────────
function PasoCreativos({ df, c }: { df: DealFlowState; c: Campana }) {
  const [instruccion, setInstruccion] = useState('');
  const [tamano, setTamano] = useState('feed');
  const [cantidad, setCantidad] = useState(1);
  const costo = (df.costoCreditos?.imagen || 20) * cantidad;

  if (!c.brief) return <div style={card}>Primero completa el paso 1 para que la IA sepa qué dibujar.</div>;

  return (
    <>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Crea los creativos del anuncio</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Las imágenes se generan a partir de lo que la IA entendió de <b>{c.brief.producto}</b>, así hablan del mismo producto.
        </div>
        {c.brief.ideasCreativo.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={label}>IDEAS QUE PROPONE LA IA (toca una para usarla)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.brief.ideasCreativo.map((idea, i) => (
                <button key={i} onClick={() => setInstruccion(idea)} style={{ ...btnGris, fontSize: 12.5, textAlign: 'left' }}>{idea}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={label}>¿Cómo quieres la imagen? (opcional)</div>
          <input value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="Ej: sobre fondo blanco, con luz natural" style={input} />
        </div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Formato</div>
            <Dropdown value={tamano} onChange={setTamano} options={[
              { value: 'feed', label: 'Cuadrado · feed' },
              { value: 'historia', label: 'Vertical · historias y reels' },
              { value: 'horizontal', label: 'Horizontal · ancho' },
            ]} />
          </div>
          <div>
            <div style={label}>Cuántos</div>
            <Dropdown value={String(cantidad)} onChange={(v) => setCantidad(Number(v))} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => df.pasoCreativos(c.id, { instruccion, cantidad, tamano })}
            disabled={df.mkLoading}
            style={{ ...btn, opacity: df.mkLoading ? 0.7 : 1 }}
          >
            {df.mkLoading ? 'Creando…' : `Generar ${cantidad} creativo${cantidad > 1 ? 's' : ''} →`}
          </button>
          <span style={{ color: 'var(--df-text-muted)', fontSize: 12.5 }}>Cuesta {costo} créditos · tienes {df.creditos}</span>
        </div>
      </div>

      {c.creativos.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Tus creativos ({c.creativos.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {c.creativos.map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--df-border)', display: 'block' }} />
                <button
                  onClick={() => df.editarCampana(c.id, { creativos: c.creativos.filter((_, k) => k !== i) })}
                  title="Quitar este creativo"
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,.94)', border: '1px solid var(--df-border)', borderRadius: 7, padding: '3px 8px', fontFamily: 'inherit', fontSize: 12, color: 'var(--df-danger-dark)', cursor: 'pointer' }}
                >
                  ✕
                </button>
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

  if (!c.brief) return <div style={card}>Primero completa el paso 1.</div>;

  const set = (k: 'textos' | 'titulos' | 'descripciones') => (v: string[]) =>
    df.editarCampana(c.id, { copys: { ...(copys || { textos: [], titulos: [], descripciones: [] }), [k]: v } });

  return (
    <>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Escribe los textos del anuncio</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Con la estructura exacta de Meta: <b>texto principal</b>, <b>título</b> y <b>descripción</b>. Cada uno con un ángulo distinto para que pruebes cuál vende más.
        </div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Tono</div>
            <Dropdown value={tono} onChange={setTono} options={['Cercano y vendedor', 'Directo y sin rodeos', 'Elegante y premium', 'Divertido y juvenil', 'Serio y profesional'].map((t) => ({ value: t, label: t }))} />
          </div>
          <div>
            <div style={label}>Variantes de cada uno</div>
            <Dropdown value={String(cantidad)} onChange={(v) => setCantidad(Number(v))} options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
        </div>
        <button
          onClick={() => df.pasoTextos(c.id, { tono, cantidad })}
          disabled={df.mkLoading}
          style={{ ...btn, opacity: df.mkLoading ? 0.7 : 1 }}
        >
          {df.mkLoading ? 'Escribiendo…' : copys ? 'Escribir otros textos' : 'Escribir los textos →'}
        </button>
      </div>

      {copys && (
        <div style={card}>
          <ListaCopys df={df} titulo="Textos principales" ayuda="El cuerpo del anuncio. Lo primero que lee tu cliente." items={copys.textos} onCambio={set('textos')} />
          <ListaCopys df={df} titulo="Títulos" ayuda="El titular en negrita, bajo la imagen. Máximo 40 caracteres." items={copys.titulos} onCambio={set('titulos')} />
          <ListaCopys df={df} titulo="Descripciones" ayuda="La línea de apoyo bajo el título. Máximo 30 caracteres." items={copys.descripciones} onCambio={set('descripciones')} />
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Puedes editar cualquiera aquí mismo: se guarda solo.</div>
        </div>
      )}
    </>
  );
}

// ── Paso 4 · Publicar ─────────────────────────────────────────────────
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
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Elige dónde publicar</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14 }}>Estas son las cuentas y páginas de tu Facebook.</div>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Cuenta publicitaria</div>
          <Dropdown value={cuenta} onChange={setCuenta} placeholder="Elige una…"
            options={[{ value: '', label: 'Elige una…' }, ...ops.cuentas.map((a) => ({ value: a.id, label: `${a.nombre} (${a.moneda})` }))]} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Página de Facebook (el anuncio sale a nombre de ella)</div>
          <Dropdown value={pagina} onChange={setPagina} placeholder="Elige una…"
            options={[{ value: '', label: 'Elige una…' }, ...ops.paginas.map((p) => ({ value: p.id, label: p.nombre }))]} />
        </div>
        <button
          onClick={() => {
            const a = ops.cuentas.find((x) => x.id === cuenta);
            const p = ops.paginas.find((x) => x.id === pagina);
            df.elegirCuentaAds({ adAccountId: cuenta, adAccountNombre: a?.nombre || '', moneda: a?.moneda || '', pageId: pagina, pageNombre: p?.nombre || '' });
          }}
          disabled={!cuenta}
          style={{ ...btn, opacity: cuenta ? 1 : 0.6 }}
        >
          Guardar y conectar
        </button>
        {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
      </div>
    );
  }

  // Sin conectar todavía.
  if (!ads?.conectada) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Conecta tu Administrador de anuncios</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Conecta tu cuenta publicitaria de Meta para publicar desde aquí. <b>Tú pagas la pauta directamente a Meta</b> con tu propio método de pago.
        </div>
        <button onClick={df.conectarAds} disabled={df.mkLoading} style={{ ...btn, background: '#1877F2', opacity: df.mkLoading ? 0.7 : 1 }}>
          {df.mkLoading ? 'Conectando…' : 'Conectar con Facebook'}
        </button>
        {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
      </div>
    );
  }

  if (!listo) {
    return <div style={card}>Para publicar necesitas al menos un creativo (paso 2) y los textos (paso 3).</div>;
  }

  const cp = c.copys!;
  const opcion = (arr: string[], i: number, set: (n: number) => void, titulo: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={label}>{titulo}</div>
      <Dropdown value={String(i)} onChange={(v) => set(Number(v))} options={arr.map((t, k) => ({ value: String(k), label: t.slice(0, 70) + (t.length > 70 ? '…' : '') }))} />
    </div>
  );

  return (
    <>
      <div style={{ ...card, background: 'var(--df-brand-subtle-3)', borderColor: 'var(--df-brand-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--df-brand-dark)' }}>✓ Conectado a {ads.adAccountNombre}</span>
          {ads.pageNombre && <span style={{ color: 'var(--df-brand-dark)', fontSize: 13 }}>· página {ads.pageNombre}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={df.desconectarAds} style={{ ...btnGris, color: 'var(--df-danger-dark)', borderColor: 'var(--df-danger-border)' }}>Desconectar</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Arma el anuncio que se va a publicar</div>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Creativo</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.creativos.map((url, i) => (
              <img
                key={i} src={url} alt="" onClick={() => setSel((s) => ({ ...s, creativo: i }))}
                style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '3px solid ' + (sel.creativo === i ? 'var(--df-brand)' : 'var(--df-border)') }}
              />
            ))}
          </div>
        </div>
        {opcion(cp.textos, sel.texto, (n) => setSel((s) => ({ ...s, texto: n })), 'TEXTO PRINCIPAL')}
        {cp.titulos.length > 0 && opcion(cp.titulos, sel.titulo, (n) => setSel((s) => ({ ...s, titulo: n })), 'TÍTULO')}
        {cp.descripciones.length > 0 && opcion(cp.descripciones, sel.descripcion, (n) => setSel((s) => ({ ...s, descripcion: n })), 'DESCRIPCIÓN')}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Presupuesto diario ({ads.moneda || 'COP'})</div>
          <input type="number" value={presupuesto} onChange={(e) => setPresupuesto(Number(e.target.value))} min={1000} step={1000} style={{ ...input, maxWidth: 220 }} />
        </div>

        <div style={{ background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: 'var(--df-warning)', fontSize: 13, lineHeight: 1.6 }}>
          ⚠️ El anuncio se crea <b>en pausa</b>. No se gasta ni un peso hasta que tú entres a tu Administrador de anuncios y le des play.
        </div>

        <button
          onClick={() => {
            void df.publicarCampana(c.id, {
              presupuesto, textoIdx: sel.texto, tituloIdx: sel.titulo, descripcionIdx: sel.descripcion, creativoIdx: sel.creativo,
            }).then((ok) => setPublicado(!!ok));
          }}
          disabled={df.mkLoading}
          style={{ ...btn, opacity: df.mkLoading ? 0.7 : 1 }}
        >
          {df.mkLoading ? 'Publicando en Meta…' : 'Publicar en mi Administrador de anuncios →'}
        </button>
        {df.mkError && <div style={{ color: 'var(--df-danger-dark)', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
        {publicado && (
          <div style={{ marginTop: 12, color: 'var(--df-brand-dark)', fontSize: 13.5, fontWeight: 600 }}>
            ✓ ¡Listo! La campaña quedó creada en pausa dentro de tu Administrador de anuncios.
          </div>
        )}
      </div>
    </>
  );
}

// ── Lista de campañas ─────────────────────────────────────────────────
const ESTADO_CAMP: Record<string, { t: string; c: string }> = { publicada: { t: 'Publicada', c: 'ok' }, lista: { t: 'Lista', c: 'info' } };
const estadoCamp = (e: string) => ESTADO_CAMP[e] || { t: 'Borrador', c: 'neutro' };
const objetivoDe = (id: string) => OBJETIVOS.find((o) => o.id === id)?.nombre || id || '—';

/** Formulario de campaña nueva (en el panel lateral). */
function NuevaCampana({ df, onCreada }: { df: DealFlowState; onCreada: () => void }) {
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('mensajes');
  return (
    <>
      <div className="tarjeta-cab"><div><span className="eti" style={{ color: '#D9C6FF' }}>✦ Editor con IA</span><h2 style={{ fontSize: 17 }}>Nueva campaña</h2></div></div>
      <p className="suave-t" style={{ fontSize: 13 }}>La IA te guía en 4 pasos: estudia tu producto, crea las imágenes, escribe los textos y publica en Meta.</p>
      <div className="campo"><label htmlFor="mk-nombre">Nombre de la campaña</label><input id="mk-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Fajas — septiembre" /></div>
      <div>
        <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 8 }}>¿Qué quieres lograr?</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {OBJETIVOS.map((o) => <button key={o.id} type="button" className={`tono${objetivo === o.id ? ' sel' : ''}`} onClick={() => setObjetivo(o.id)}><b>{o.nombre}</b><span>{o.sub}</span></button>)}
        </div>
      </div>
      <button type="button" className="btn btn-pri" disabled={!nombre.trim()} onClick={() => { void df.crearCampana(nombre, objetivo); setNombre(''); onCreada(); }}>Crear campaña →</button>
    </>
  );
}

// ── Sección ───────────────────────────────────────────────────────────
/**
 * Marketing IA (diseño "Noche"): a la izquierda las campañas y los creativos de la
 * abierta; a la derecha el editor con IA (nueva campaña o el paso en que va).
 */
export function Marketing({ df }: { df: DealFlowState }) {
  const c = df.campana;
  const [paso, setPaso] = useState(1);
  const [nueva, setNueva] = useState(false);
  const [creativoSel, setCreativoSel] = useState(0);
  // Al entrar refrescamos campañas y saldo (por ref: las funciones se recrean en cada render).
  const recargar = useRef({ campanas: df.reloadCampanas, creditos: df.reloadCreditos });
  recargar.current = { campanas: df.reloadCampanas, creditos: df.reloadCreditos };
  useEffect(() => { void recargar.current.campanas(); void recargar.current.creditos(); }, []);
  // Al abrir una campaña, saltamos al paso donde se quedó.
  useEffect(() => { if (c) { setPaso(Math.min(Math.max(c.paso, 1), 4)); setNueva(false); setCreativoSel(0); } }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const publicadas = df.campanas.filter((x) => x.estado === 'publicada').length;
  const creativos = df.campanas.reduce((a, x) => a + x.creativos.length, 0);

  return (
    <section data-screen-label="Marketing IA" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Anuncios que llevan al chat</span>
          <h1>Marketing IA</h1>
          <p className="sub">Crea campañas de Meta con creativos hechos por IA a partir de tus fotos. Cada chat que llega se cruza con su anuncio para que sepas cuál vende.</p>
        </div>
        <div className="fila">
          <span className={`pill ${df.creditos > 20 ? 'ok' : 'aviso'}`} title="Créditos para generar con IA">✦ {df.creditos} créditos</span>
          <button type="button" className="btn btn-pri" onClick={() => { df.cerrarCampana(); setNueva(true); }}>✦ Nueva campaña</button>
        </div>
      </div>

      {df.mkSinCreditos && <div className="aviso-caja aviso"><b>Te quedaste sin créditos</b><span>Recarga desde la sección de créditos para seguir generando.</span></div>}

      <div className="kpis">
        <div className="kpi"><span className="eti">Campañas</span><span className="valor">{df.campanas.length}</span><span className="delta">{publicadas} publicada{publicadas === 1 ? '' : 's'} en Meta</span></div>
        <div className="kpi"><span className="eti">Creativos con IA</span><span className="valor">{creativos}</span><span className="delta">imágenes listas para pautar</span></div>
        <div className="kpi"><span className="eti">Cuenta publicitaria</span><span className="valor" style={{ fontSize: 20 }}>{df.adsCuenta?.conectada ? df.adsCuenta.adAccountNombre || 'Conectada' : 'Sin conectar'}</span><span className="delta">{df.adsCuenta?.conectada ? df.adsCuenta.pageNombre || 'Meta Ads' : <a href="#" onClick={(e) => { e.preventDefault(); df.go('integraciones'); }}>conéctala en Integraciones</a>}</span></div>
        <div className="kpi"><span className="eti">Créditos</span><span className={`valor ${df.creditos > 20 ? '' : 'aviso'}`}>{df.creditos}</span><span className="delta">cada imagen o texto con IA gasta créditos</span></div>
      </div>

      <div className="lateral ancho">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="tarjeta-cab"><h2>Campañas</h2><span className="tenue" style={{ fontSize: 12 }}>Toca una para ver sus creativos y seguir editándola</span></div>
          {df.campanas.length === 0 && <div className="vacio">Todavía no tienes campañas. Crea la primera con «✦ Nueva campaña».</div>}
          {df.campanas.length > 0 && <div className="camp cab"><span>Campaña</span><span>Objetivo</span><span>Creativos</span><span>Paso</span><span>Estado</span><span /></div>}
          {df.campanas.map((x) => {
            const e = estadoCamp(x.estado);
            return (
              <div key={x.id} className={`camp${c?.id === x.id ? ' sel' : ''}`} onClick={() => void df.abrirCampana(x.id)} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') void df.abrirCampana(x.id); }}>
                <span style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                  {x.creativos[0] && <img src={x.creativos[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                  <span style={{ minWidth: 0 }}><b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.nombre}</b><span className="tenue" style={{ fontSize: 11.5 }}>{x.brief?.producto || 'Sin producto aún'}</span></span>
                </span>
                <span style={{ fontSize: 12.5 }}>{objetivoDe(x.objetivo)}</span>
                <span className="mono">{x.creativos.length}</span>
                <span className="mono">{Math.min(x.paso, 4)} / 4</span>
                <span className={`pill ${e.c} chica`}>{e.t}</span>
                <button type="button" className="btn btn-fant btn-chico" onClick={(ev) => { ev.stopPropagation(); df.borrarCampana(x.id); }} style={{ color: 'var(--coral)' }} aria-label={`Eliminar ${x.nombre}`}>✕</button>
              </div>
            );
          })}

          {c && (
            <section className="tarjeta" style={{ marginTop: 6 }}>
              <div className="tarjeta-cab"><h2>Creativos de “{c.nombre}”</h2><button type="button" className="btn btn-sec btn-chico" onClick={() => setPaso(2)}>✦ Generar más</button></div>
              {c.creativos.length === 0 ? <div className="vacio">Aún no hay creativos. En el paso «Creativos» la IA los crea a partir de tus fotos.</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {c.creativos.map((url, i) => (
                    <button key={i} type="button" className={`creativo${creativoSel === i ? ' sel' : ''}`} onClick={() => setCreativoSel(i)} style={{ padding: 0, textAlign: 'left', color: 'var(--tinta)', cursor: 'pointer' }}>
                      <div className="arte" style={{ position: 'relative', background: 'var(--panel2)' }}><img src={url} alt="" /><small style={{ position: 'relative' }}>Creativo {i + 1}</small></div>
                      <div style={{ padding: '10px 12px', fontSize: 12 }}><span className="suave-t" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.copys?.textos?.[i] || c.copys?.textos?.[0] || 'Texto del anuncio en el paso «Textos».'}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="tarjeta borde-ia" style={{ gap: 12, position: 'sticky', top: 0, maxHeight: 'calc(100vh - 92px)', overflowY: 'auto' }} aria-label="Editor de campaña">
          {!c && (nueva || df.campanas.length === 0) && <NuevaCampana df={df} onCreada={() => setNueva(false)} />}
          {!c && !nueva && df.campanas.length > 0 && <div className="vacio">Toca una campaña para seguir editándola, o crea una nueva.</div>}
          {c && (
            <>
              <div className="tarjeta-cab" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="eti" style={{ color: '#D9C6FF' }}>✦ Editor con IA</span>
                  <input className="entrada" value={c.nombre} onChange={(e) => df.renombrarCampana(c.id, e.target.value)} style={{ fontWeight: 700, marginTop: 4 }} aria-label="Nombre de la campaña" />
                </div>
                <span className={`pill ${estadoCamp(c.estado).c}`}>{estadoCamp(c.estado).t}</span>
              </div>
              <Pasos paso={paso} onIr={setPaso} />
              {df.mkError && paso !== 4 && <div className="aviso-caja mal">{df.mkError}</div>}
              {paso === 1 && <PasoProducto df={df} c={c} />}
              {paso === 2 && <PasoCreativos df={df} c={c} />}
              {paso === 3 && <PasoTextos df={df} c={c} />}
              {paso === 4 && <PasoPublicar df={df} c={c} />}
              <div className="fila" style={{ gap: 8, borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
                {paso < 4 && <button type="button" className="btn btn-pri" onClick={() => setPaso(paso + 1)} style={{ flex: 1 }}>Siguiente: {PASOS[paso]} →</button>}
                <button type="button" className="btn btn-fant" onClick={df.cerrarCampana}>← Mis campañas</button>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
