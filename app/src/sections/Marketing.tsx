import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { Campana } from '../lib/api';
import { comprimirImagen } from '../components/PhotoUpload';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const label: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5 };
const btn: React.CSSProperties = { background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnGris: React.CSSProperties = { background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

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
          <span key={i} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#334155' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Barra de pasos del asistente. */
function Pasos({ paso, onIr }: { paso: number; onIr: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {PASOS.map((p, i) => {
        const n = i + 1;
        const activo = n === paso;
        const hecho = n < paso;
        return (
          <button
            key={p}
            onClick={() => onIr(n)}
            style={{
              flex: '1 1 130px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid ' + (activo ? '#059669' : '#E2E8F0'),
              background: activo ? '#ECFDF5' : '#fff', borderRadius: 10, padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: hecho ? '#059669' : activo ? '#047857' : '#94A3B8' }}>
              {hecho ? '✓ LISTO' : `PASO ${n}`}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: activo ? '#047857' : '#1E293B' }}>{p}</div>
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
      <div style={{ color: '#64748B', fontSize: 12.5, marginBottom: 8 }}>{ayuda}</div>
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
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
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
          {imagen && <img src={imagen} alt="" style={{ marginTop: 10, height: 80, borderRadius: 8, border: '1px solid #E2E8F0' }} />}
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
        <div style={{ ...card, borderColor: '#A7F3D0', background: '#F0FDF4' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#047857', marginBottom: 10 }}>Esto entendió la IA</div>
          <div style={{ fontSize: 14, marginBottom: 4 }}><b>{b.producto}</b></div>
          <div style={{ color: '#334155', fontSize: 13.5, lineHeight: 1.6 }}>{b.descripcion}</div>
          {b.propuesta && <div style={{ marginTop: 10, fontSize: 13.5, color: '#047857', fontStyle: 'italic' }}>“{b.propuesta}”</div>}
          {b.publico && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>PÚBLICO OBJETIVO</div>
              <div style={{ fontSize: 13.5, color: '#334155' }}>{b.publico}</div>
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
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
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
            <select value={tamano} onChange={(e) => setTamano(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="feed">Cuadrado · feed</option>
              <option value="historia">Vertical · historias y reels</option>
              <option value="horizontal">Horizontal · ancho</option>
            </select>
          </div>
          <div>
            <div style={label}>Cuántos</div>
            <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
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
          <span style={{ color: '#64748B', fontSize: 12.5 }}>Cuesta {costo} créditos · tienes {df.creditos}</span>
        </div>
      </div>

      {c.creativos.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Tus creativos ({c.creativos.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {c.creativos.map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid #E2E8F0', display: 'block' }} />
                <button
                  onClick={() => df.editarCampana(c.id, { creativos: c.creativos.filter((_, k) => k !== i) })}
                  title="Quitar este creativo"
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,.94)', border: '1px solid #E2E8F0', borderRadius: 7, padding: '3px 8px', fontFamily: 'inherit', fontSize: 12, color: '#B91C1C', cursor: 'pointer' }}
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
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Con la estructura exacta de Meta: <b>texto principal</b>, <b>título</b> y <b>descripción</b>. Cada uno con un ángulo distinto para que pruebes cuál vende más.
        </div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Tono</div>
            <select value={tono} onChange={(e) => setTono(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option>Cercano y vendedor</option>
              <option>Directo y sin rodeos</option>
              <option>Elegante y premium</option>
              <option>Divertido y juvenil</option>
              <option>Serio y profesional</option>
            </select>
          </div>
          <div>
            <div style={label}>Variantes de cada uno</div>
            <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
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
          <div style={{ color: '#94A3B8', fontSize: 12.5 }}>Puedes editar cualquiera aquí mismo: se guarda solo.</div>
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
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>Estas son las cuentas y páginas de tu Facebook.</div>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Cuenta publicitaria</div>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            <option value="">Elige una…</option>
            {ops.cuentas.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.moneda})</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Página de Facebook (el anuncio sale a nombre de ella)</div>
          <select value={pagina} onChange={(e) => setPagina(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            <option value="">Elige una…</option>
            {ops.paginas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
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
        {df.mkError && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
      </div>
    );
  }

  // Sin conectar todavía.
  if (!ads?.conectada) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Conecta tu Administrador de anuncios</div>
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Conecta tu cuenta publicitaria de Meta para publicar desde aquí. <b>Tú pagas la pauta directamente a Meta</b> con tu propio método de pago.
        </div>
        <button onClick={df.conectarAds} disabled={df.mkLoading} style={{ ...btn, background: '#1877F2', opacity: df.mkLoading ? 0.7 : 1 }}>
          {df.mkLoading ? 'Conectando…' : 'Conectar con Facebook'}
        </button>
        {df.mkError && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
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
      <select value={i} onChange={(e) => set(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
        {arr.map((t, k) => <option key={k} value={k}>{t.slice(0, 70)}{t.length > 70 ? '…' : ''}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div style={{ ...card, background: '#F0FDF4', borderColor: '#A7F3D0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>✓ Conectado a {ads.adAccountNombre}</span>
          {ads.pageNombre && <span style={{ color: '#047857', fontSize: 13 }}>· página {ads.pageNombre}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={df.desconectarAds} style={{ ...btnGris, color: '#B91C1C', borderColor: '#FECACA' }}>Desconectar</button>
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
                style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '3px solid ' + (sel.creativo === i ? '#059669' : '#E2E8F0') }}
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

        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: '#B45309', fontSize: 13, lineHeight: 1.6 }}>
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
        {df.mkError && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}
        {publicado && (
          <div style={{ marginTop: 12, color: '#047857', fontSize: 13.5, fontWeight: 600 }}>
            ✓ ¡Listo! La campaña quedó creada en pausa dentro de tu Administrador de anuncios.
          </div>
        )}
      </div>
    </>
  );
}

// ── Lista de campañas ─────────────────────────────────────────────────
function ListaCampanas({ df }: { df: DealFlowState }) {
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('mensajes');

  return (
    <>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Nueva campaña</div>
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
          La IA te guía en 3 pasos: primero estudia tu producto, luego crea las imágenes y al final escribe los textos.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Nombre de la campaña</div>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Fajas — septiembre" style={{ ...input, maxWidth: 380 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>¿Qué quieres lograr?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {OBJETIVOS.map((o) => (
              <button
                key={o.id} onClick={() => setObjetivo(o.id)}
                style={{
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 10, padding: '9px 13px',
                  border: '1px solid ' + (objetivo === o.id ? '#059669' : '#E2E8F0'),
                  background: objetivo === o.id ? '#ECFDF5' : '#fff',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: objetivo === o.id ? '#047857' : '#1E293B' }}>{o.nombre}</div>
                <div style={{ color: '#64748B', fontSize: 12 }}>{o.sub}</div>
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { void df.crearCampana(nombre, objetivo); setNombre(''); }} style={btn}>Crear campaña →</button>
      </div>

      {df.campanas.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Tus campañas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {df.campanas.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 14px', flexWrap: 'wrap' }}>
                {c.creativos[0] && <img src={c.creativos[0]} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 7 }} />}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.nombre}</div>
                  <div style={{ color: '#64748B', fontSize: 12.5 }}>
                    Paso {Math.min(c.paso, 4)} de 4 · {c.creativos.length} creativo{c.creativos.length === 1 ? '' : 's'}
                  </div>
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px',
                  background: c.estado === 'publicada' ? '#DCFCE7' : c.estado === 'lista' ? '#DBEAFE' : '#F1F5F9',
                  color: c.estado === 'publicada' ? '#047857' : c.estado === 'lista' ? '#1D4ED8' : '#64748B',
                }}>
                  {c.estado === 'publicada' ? 'Publicada' : c.estado === 'lista' ? 'Lista' : 'Borrador'}
                </span>
                <button onClick={() => void df.abrirCampana(c.id)} style={btnGris}>Abrir</button>
                <button onClick={() => df.borrarCampana(c.id)} style={{ ...btnGris, color: '#B91C1C', borderColor: '#FECACA' }}>Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Sección ───────────────────────────────────────────────────────────
export function Marketing({ df }: { df: DealFlowState }) {
  const c = df.campana;
  const [paso, setPaso] = useState(1);
  // Al entrar refrescamos campañas y saldo (por ref: las funciones se recrean en cada render).
  const recargar = useRef({ campanas: df.reloadCampanas, creditos: df.reloadCreditos });
  recargar.current = { campanas: df.reloadCampanas, creditos: df.reloadCreditos };
  useEffect(() => { void recargar.current.campanas(); void recargar.current.creditos(); }, []);
  // Al abrir una campaña, saltamos al paso donde se quedó.
  useEffect(() => { if (c) setPaso(Math.min(Math.max(c.paso, 1), 4)); }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section data-screen-label="Marketing IA" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Marketing IA</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>
            {c ? 'Arma tu campaña paso a paso y publícala en Meta.' : 'Crea campañas completas: la IA estudia tu producto, crea los creativos y escribe los anuncios.'}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 14px', textAlign: 'center' }}>
          <div style={{ color: '#64748B', fontSize: 11.5, fontWeight: 600 }}>CRÉDITOS</div>
          <div style={{ fontWeight: 800, fontSize: 17, color: df.creditos > 20 ? '#047857' : '#B45309' }}>{df.creditos}</div>
        </div>
      </div>

      {df.mkSinCreditos && (
        <div style={{ ...card, background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#B45309' }}>Te quedaste sin créditos</div>
          <div style={{ color: '#B45309', fontSize: 13, marginTop: 4 }}>Recarga desde la sección de créditos para seguir generando.</div>
        </div>
      )}

      {!c ? (
        <ListaCampanas df={df} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={df.cerrarCampana} style={btnGris}>← Mis campañas</button>
            <input
              value={c.nombre}
              onChange={(e) => df.renombrarCampana(c.id, e.target.value)}
              style={{ ...input, maxWidth: 320, fontWeight: 700 }}
            />
          </div>

          <Pasos paso={paso} onIr={setPaso} />

          {df.mkError && paso !== 4 && (
            <div style={{ ...card, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', fontSize: 13.5 }}>{df.mkError}</div>
          )}

          {paso === 1 && <PasoProducto df={df} c={c} />}
          {paso === 2 && <PasoCreativos df={df} c={c} />}
          {paso === 3 && <PasoTextos df={df} c={c} />}
          {paso === 4 && <PasoPublicar df={df} c={c} />}

          {paso < 4 && (
            <button onClick={() => setPaso(paso + 1)} style={{ ...btn, background: '#0F172A' }}>
              Siguiente paso: {PASOS[paso]} →
            </button>
          )}
        </>
      )}
    </section>
  );
}
