import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { fmt } from '../lib/format';
import { IcoBuscar } from '../components/iconosNoche';
import { BibliotecaLandingsLista } from '../components/BibliotecaLandings';
import { useRecordado } from '../lib/rutas';

/**
 * Biblioteca (diseño "Noche"): productos ya armados por DealFlow (con reglas, fotos
 * y estructura) y landings probadas que la tienda importa con un clic. Unos son
 * gratis; otros tienen un pago único.
 */
export function Biblioteca({ df }: { df: DealFlowState }) {
  const [tab, setTab] = useRecordado<'productos' | 'landings'>('biblioteca:tab', 'productos');
  const [filtro, setFiltro] = useState<'todos' | 'gratis' | 'pago' | 'mios'>('todos');
  const [q, setQ] = useState('');
  const nq = q.trim().toLowerCase();
  const items = df.bibliotecaItems.filter((p) =>
    (filtro === 'todos' ? true : filtro === 'gratis' ? p.gratis : filtro === 'pago' ? !p.gratis : p.adquirido) && (!nq || p.nombre.toLowerCase().includes(nq)));
  const cuenta = (f: typeof filtro) => df.bibliotecaItems.filter((p) => (f === 'todos' ? true : f === 'gratis' ? p.gratis : f === 'pago' ? !p.gratis : p.adquirido)).length;

  return (
    <section data-screen-label="Biblioteca" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Biblioteca DealFlow</span>
          <h1>Productos y landings <span className="grad-txt">listos para vender</span></h1>
          <p className="sub">Productos ganadores con fotos, descripción, variantes y mensaje inicial, y landings probadas. Impórtalos a tu tienda con un clic y el asistente los vende de una.</p>
        </div>
        <div className="buscar" style={{ flex: '0 1 320px' }}>
          <IcoBuscar />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la biblioteca…" aria-label="Buscar" />
        </div>
      </div>

      {df.bibliotecaMsg && <div className={`aviso-caja ${df.bibliotecaMsg.startsWith('✓') ? 'ok' : 'mal'}`} style={{ fontWeight: 600 }}>{df.bibliotecaMsg}</div>}

      <div className="tabs">
        <button type="button" className={`tab${tab === 'productos' ? ' sel' : ''}`} onClick={() => setTab('productos')}>Biblioteca de productos</button>
        <button type="button" className={`tab${tab === 'landings' ? ' sel' : ''}`} onClick={() => setTab('landings')}>📚 Biblioteca de landings</button>
        {tab === 'productos' && (
          <div className="fila" style={{ marginLeft: 'auto', gap: 6, paddingBottom: 6 }}>
            {([['todos', 'Todos'], ['gratis', 'Gratis'], ['pago', 'De pago'], ['mios', 'Ya adquiridos']] as const).map(([f, t]) => (
              <button key={f} type="button" className={`chip chica${filtro === f ? ' activa' : ''}`} onClick={() => setFiltro(f)}>{t} <span className="n">{cuenta(f)}</span></button>
            ))}
          </div>
        )}
      </div>

      {tab === 'landings' && <BibliotecaLandingsLista filtro={q} onImportada={() => df.go('landings')} />}

      {tab === 'productos' && (df.bibliotecaItems.length === 0 ? (
        <div className="vacio">Todavía no hay productos en la biblioteca. Vuelve pronto: iremos agregando productos listos para vender.</div>
      ) : !items.length ? <div className="vacio">Ningún producto coincide con la búsqueda o el filtro.</div> : (
        <div className="rej">
          {items.map((p) => (
            <article key={p.id} className="item-b">
              <div className="foto" style={{ position: 'relative', background: 'var(--panel2)' }}>
                {p.portada && <img src={p.portada} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span className={`pill ${p.gratis ? 'ok' : 'ia'} sin`} style={{ position: 'relative', background: 'rgba(5,7,19,.7)', fontSize: 10.5 }}>{p.gratis ? 'Gratis' : fmt(p.precioImportacion)}</span>
                {p.adquirido && <span className="pill sin" style={{ position: 'relative', background: 'rgba(5,7,19,.7)', color: 'var(--esm2)', fontSize: 10.5 }}>✓ En tu tienda</span>}
              </div>
              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div><b style={{ fontSize: 14, lineHeight: 1.3 }}>{p.nombre}</b><p className="tenue" style={{ fontSize: 11.5 }}>Con reglas, fotos, combos y mensaje inicial</p></div>
                <div style={{ fontSize: 12.5 }}><span className="suave-t">Precio sugerido</span> <b className="mono">{fmt(p.precio)}</b></div>
                <button type="button" className={`btn btn-chico ${p.adquirido ? 'btn-sec' : 'btn-pri'}`} onClick={() => df.importarDeBiblioteca(p.id)} style={{ marginTop: 'auto' }}>
                  {p.adquirido ? '✓ Ya adquirido · Importar de nuevo' : p.gratis ? 'Importar gratis' : `Comprar e importar · ${fmt(p.precioImportacion)}`}
                </button>
              </div>
            </article>
          ))}
        </div>
      ))}
      <p className="tenue" style={{ fontSize: 12 }}>Lo que importes queda como tuyo: edítalo en Productos o en Tienda en línea. Los de pago se cobran una sola vez a tu cuenta DealFlow.</p>
    </section>
  );
}
