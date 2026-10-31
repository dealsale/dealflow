import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import {
  apiBibliotecaLandings, apiImportarBibliotecaLanding, apiCheckoutBibliotecaLanding, apiSuperBibliotecaLandings, apiSuperTodasLasLandings,
  apiSuperAgregarLandingBiblioteca, apiSuperBibliotecaLandingPatch, apiSuperBibliotecaLandingDelete, apiSuperBibliotecaLandingEnviar,
  apiSuperEnviarLandingATienda, urlVistaSuperLanding, apiImpersonate,
  type LibraryLanding, type LibraryLandingAdmin, type SuperLandingTienda,
} from '../lib/api';
import { fmt } from '../lib/format';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';

/**
 * Biblioteca de landings: páginas de venta ya armadas por DealFlow que cualquier tienda
 * importa a su Tienda en línea (quedan como borrador con los datos de la tienda).
 * El superadmin ve TODAS las landings de todas las tiendas y manda cualquiera a la
 * biblioteca o directo a otra tienda, igual que con los productos.
 */
const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };
const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' };
const Portada = ({ src }: { src: string | null }) => (
  <div style={{ aspectRatio: '16/10', background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
    {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span style={{ fontSize: 30, color: 'var(--df-border-strong)' }}>🛍️</span>}
  </div>
);

/** Lista de la biblioteca de landings (diseño "Noche"): la usa la sección Biblioteca y la ventana de Tienda en línea. */
export function BibliotecaLandingsLista({ onImportada, filtro = '' }: { onImportada: (landingId: string) => void; filtro?: string }) {
  const [items, setItems] = useState<LibraryLanding[] | null>(null);
  const [ocupado, setOcupado] = useState('');
  useEffect(() => { void apiBibliotecaLandings().then((r) => setItems(r.data?.landings || [])); }, []);
  const importar = async (l: LibraryLanding) => {
    setOcupado(l.id);
    const r = await apiImportarBibliotecaLanding(l.id);
    if (r.data?.requierePago) {
      const c = await apiCheckoutBibliotecaLanding(l.id);
      setOcupado('');
      if (c.data?.url) window.location.href = c.data.url;
      else if (c.error) notificar(c.error, 'error');
      return;
    }
    setOcupado('');
    if (r.data?.landingId) { notificar('✓ Landing importada como borrador. Elige su producto y publícala.'); onImportada(r.data.landingId); }
    else notificar(r.error || 'No se pudo importar.', 'error');
  };
  const nq = filtro.trim().toLowerCase();
  const lista = (items || []).filter((l) => !nq || l.nombre.toLowerCase().includes(nq));
  if (items === null) return <div className="vacio">Cargando…</div>;
  if (!items.length) return <div className="vacio">Todavía no hay landings en la biblioteca. Vuelve pronto.</div>;
  if (!lista.length) return <div className="vacio">Ninguna landing coincide con la búsqueda.</div>;
  return (
    <div className="rej">
      {lista.map((l) => (
        <article key={l.id} className="item-b">
          <div className="foto" style={{ position: 'relative', background: 'var(--panel2)' }}>
            {l.portada && <img src={l.portada} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
            <span className={`pill ${l.gratis ? 'ok' : 'ia'} sin`} style={{ position: 'relative', background: 'rgba(5,7,19,.7)', fontSize: 10.5 }}>{l.gratis ? 'Gratis' : fmt(l.precioImportacion)}</span>
            {l.adquirida && <span className="pill sin" style={{ position: 'relative', background: 'rgba(5,7,19,.7)', color: 'var(--esm2)', fontSize: 10.5 }}>✓ Adquirida</span>}
          </div>
          <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div><b style={{ fontSize: 14, lineHeight: 1.3 }}>{l.nombre}</b><p className="tenue" style={{ fontSize: 11.5 }}>Landing lista: fotos, ofertas, testimonios y textos</p></div>
            {l.precio > 0 && <div style={{ fontSize: 12.5 }}><span className="suave-t">Precio en la página</span> <b className="mono">{fmt(l.precio)}</b></div>}
            <button type="button" className={`btn btn-chico ${l.adquirida ? 'btn-sec' : 'btn-pri'}`} onClick={() => void importar(l)} disabled={!!ocupado} style={{ marginTop: 'auto', opacity: ocupado && ocupado !== l.id ? 0.6 : 1 }}>
              {ocupado === l.id ? 'Importando…' : l.adquirida ? '✓ Ya adquirida · Importar de nuevo' : l.gratis ? 'Importar gratis' : `Comprar e importar · ${fmt(l.precioImportacion)}`}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Ventana para la tienda: elegir una landing de la biblioteca e importarla. */
export function BibliotecaLandingsModal({ onCerrar, onImportada }: { onCerrar: () => void; onImportada: (landingId: string) => void }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.65)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="tarjeta" style={{ width: 'min(1040px, 100%)', maxHeight: '88vh', overflow: 'auto', boxSizing: 'border-box' }}>
        <div className="tarjeta-cab">
          <div><h2>📚 Biblioteca de landings</h2><p className="suave-t" style={{ fontSize: 13, marginTop: 2 }}>Páginas de venta ya armadas (fotos, ofertas, testimonios y textos). Se importan como borrador con el nombre, logo y WhatsApp de tu tienda; tú eliges el producto y la publicas.</p></div>
          <button type="button" className="btn btn-sec btn-chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <BibliotecaLandingsLista onImportada={onImportada} />
      </div>
    </div>
  );
}

/** Pestaña del superadmin: todas las landings de las tiendas + las que ya están en la biblioteca. */
export function BibliotecaLandingsAdmin({ df }: { df: DealFlowState }) {
  const [vista, setVista] = useState<'tiendas' | 'biblioteca'>('tiendas');
  const [items, setItems] = useState<LibraryLandingAdmin[]>([]);
  const [todas, setTodas] = useState<SuperLandingTienda[] | null>(null);
  const cargar = () => {
    void apiSuperBibliotecaLandings().then((r) => setItems(r.data?.landings || []));
    void apiSuperTodasLasLandings().then((r) => setTodas(r.data?.landings || []));
  };
  useEffect(cargar, []);
  const patch = async (id: string, p: Parameters<typeof apiSuperBibliotecaLandingPatch>[1]) => { const r = await apiSuperBibliotecaLandingPatch(id, p); if (r.error) notificar(r.error, 'error'); cargar(); };
  const eliminar = async (l: LibraryLandingAdmin) => {
    if (!(await confirmar({ titulo: `¿Quitar "${l.nombre}" de la biblioteca?`, mensaje: 'Las tiendas que ya la importaron conservan su copia.', aceptar: 'Quitar', peligro: true }))) return;
    await apiSuperBibliotecaLandingDelete(l.id); cargar();
  };
  const pestana = (id: typeof vista, label: string) => (
    <button key={id} onClick={() => setVista(id)}
      style={{ border: '1px solid ' + (vista === id ? 'var(--df-brand)' : 'var(--df-border)'), background: vista === id ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: vista === id ? 'var(--df-brand-dark)' : 'var(--df-text-secondary)', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
      {label}
    </button>
  );
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {pestana('tiendas', `🏬 Landings de las tiendas · ${todas ? todas.length : '…'}`)}
        {pestana('biblioteca', `📚 En la biblioteca · ${items.length}`)}
      </div>
      {vista === 'tiendas' ? (
        <CatalogoTiendas df={df} todas={todas} alCambiar={cargar} />
      ) : !items.length ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
          La biblioteca de landings está vacía. Ve a <b>Landings de las tiendas</b>, elige una y mándala a la biblioteca.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {items.map((l) => <CardAdmin key={l.id} l={l} df={df} patch={patch} eliminar={eliminar} />)}
        </div>
      )}
    </>
  );
}

const fechaCorta = (iso: string) => { const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }); };
const Insignia = ({ children, tono = 'gris' }: { children: ReactNode; tono?: 'gris' | 'verde' | 'morado' | 'ambar' }) => {
  const c = { gris: ['var(--df-surface-2)', 'var(--df-text-muted)'], verde: ['var(--df-brand-subtle)', 'var(--df-brand-dark)'], morado: ['var(--df-purple-subtle)', 'var(--df-purple)'], ambar: ['var(--df-warning-subtle-2)', 'var(--df-warning)'] }[tono];
  return <span style={{ fontSize: 10.5, fontWeight: 800, background: c[0], color: c[1], borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{children}</span>;
};

/** Catálogo: todas las landings de todas las tiendas, con filtros y acciones por tarjeta. */
function CatalogoTiendas({ df, todas, alCambiar }: { df: DealFlowState; todas: SuperLandingTienda[] | null; alCambiar: () => void }) {
  const [q, setQ] = useState('');
  const [tienda, setTienda] = useState('');
  const [estado, setEstado] = useState<'todas' | 'publicada' | 'borrador'>('todas');
  const [sinBiblioteca, setSinBiblioteca] = useState(false);
  const texto = q.trim().toLowerCase();
  const lista = (todas || []).filter((l) =>
    (!tienda || l.storeId === tienda)
    && (estado === 'todas' || (estado === 'publicada' ? l.estado === 'publicada' : l.estado !== 'publicada'))
    && (!sinBiblioteca || !l.enBiblioteca)
    && (!texto || l.nombre.toLowerCase().includes(texto) || l.tienda.toLowerCase().includes(texto)));
  // Tiendas con landings (para el filtro), en orden alfabético.
  const tiendas = Array.from(new Map((todas || []).map((l) => [l.storeId, l.tienda])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const campo: CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
  return (
    <>
      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Todas las landings de las tiendas</div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginBottom: 12 }}>Mira cualquier landing, mándala a la biblioteca (gratis o de pago) o directo a otra tienda como borrador. Se copia completa: diseño, fotos, ofertas, testimonios, código propio y plantilla. La tienda que la recibe la ve con su propio nombre, logo, WhatsApp y píxel.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por landing o tienda…" style={{ ...campo, width: 240 }} />
          <div style={{ minWidth: 220 }}>
            <Dropdown value={tienda} onChange={setTienda} placeholder="Todas las tiendas" options={[{ value: '', label: 'Todas las tiendas' }, ...tiendas.map(([id, nombre]) => ({ value: id, label: nombre }))]} />
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['todas', 'Todas'], ['publicada', 'Publicadas'], ['borrador', 'Borradores']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setEstado(v)} style={{ background: estado === v ? '#0F172A' : 'var(--df-surface)', color: estado === v ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--df-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={sinBiblioteca} onChange={(e) => setSinBiblioteca(e.target.checked)} /> Solo las que no están en la biblioteca
          </label>
          <span style={{ marginLeft: 'auto', color: 'var(--df-text-faint)', fontSize: 12.5 }}>{todas ? `${lista.length} de ${todas.length}` : 'Cargando…'}</span>
        </div>
      </div>
      {todas && !todas.length ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>Ninguna tienda ha creado landings todavía.</div>
      ) : todas && !lista.length ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '30px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>Ninguna landing coincide con los filtros.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {lista.map((l) => <CardTienda key={l.id} l={l} df={df} alCambiar={alCambiar} />)}
        </div>
      )}
    </>
  );
}

/** Tarjeta de una landing de una tienda: ver, abrir en la tienda, enviar a biblioteca, enviar a otra tienda. */
function CardTienda({ l, df, alCambiar }: { l: SuperLandingTienda; df: DealFlowState; alCambiar: () => void }) {
  const [abrirBib, setAbrirBib] = useState(false);
  const [gratis, setGratis] = useState(true);
  const [precio, setPrecio] = useState('');
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState('');
  const vista = urlVistaSuperLanding(l.storeId, l.id);
  const aBiblioteca = async () => {
    setOcupado('bib');
    const r = await apiSuperAgregarLandingBiblioteca(l.storeId, l.id, gratis, gratis ? 0 : parseInt(precio.replace(/\D/g, ''), 10) || 0);
    setOcupado('');
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Landing agregada a la biblioteca.'); setAbrirBib(false); setPrecio(''); alCambiar();
  };
  const aTienda = async () => {
    if (!destino) return;
    const nombreDestino = df.superStores.find((s) => s.id === destino)?.tienda || 'esa tienda';
    if (!(await confirmar({ titulo: `¿Enviar "${l.nombre}" a ${nombreDestino}?`, mensaje: 'Le llega como borrador en su Tienda en línea, con su propio nombre, logo y WhatsApp. Ellos eligen el producto y la publican.', aceptar: 'Enviar' }))) return;
    setOcupado('tienda');
    const r = await apiSuperEnviarLandingATienda(l.storeId, l.id, destino);
    setOcupado('');
    if (r.error) notificar(r.error, 'error'); else { notificar(`✓ Landing enviada a ${nombreDestino} como borrador.`); setDestino(''); alCambiar(); }
  };
  // Abrir el editor de esa landing dentro de la tienda (entrando como la tienda; se vuelve con "Volver al panel de admin").
  const abrirEnTienda = async () => {
    setOcupado('abrir');
    const r = await apiImpersonate(l.storeId);
    if (r.error) { setOcupado(''); return notificar(r.error, 'error'); }
    window.location.href = `/tienda-en-linea?landing=${encodeURIComponent(l.id)}`;
  };
  const botonChico: CSSProperties = { ...btn, padding: '6px 9px', fontSize: 12, flex: 1, textAlign: 'center', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 };
  return (
    <div style={card} data-landing={l.id}>
      <a href={vista} target="_blank" rel="noreferrer" title="Ver la landing" style={{ display: 'block' }}><Portada src={l.portada} /></a>
      <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{l.nombre}</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginTop: 2 }}>🏬 {l.tienda}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {l.estado === 'publicada' ? <Insignia tono="verde">PUBLICADA</Insignia> : <Insignia>BORRADOR</Insignia>}
          {l.enBiblioteca && <Insignia tono="morado">📚 EN BIBLIOTECA</Insignia>}
          {l.modoCodigo && <Insignia tono="ambar">💻 CÓDIGO PROPIO</Insignia>}
          {l.conPlantilla && <Insignia tono="ambar">🧩 PLANTILLA</Insignia>}
        </div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {l.precio > 0 && <span>Precio <b style={{ color: 'var(--df-text-body)' }}>{fmt(l.precio)}</b></span>}
          <span>{l.vistas} vistas</span><span>{l.pedidos} pedidos</span>
          {l.updatedAt && <span>· {fechaCorta(l.updatedAt)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={vista} target="_blank" rel="noreferrer" style={botonChico}>👁 Ver</a>
          {l.url && <a href={l.url} target="_blank" rel="noreferrer" style={botonChico} title={l.url}>🔗 Pública</a>}
          <button onClick={() => void abrirEnTienda()} disabled={!!ocupado} style={botonChico} title="Abrir el editor de esta landing entrando a la tienda">{ocupado === 'abrir' ? '…' : '✏️ Editar'}</button>
        </div>
        <div style={{ flex: 1 }} />
        {!abrirBib ? (
          <button onClick={() => setAbrirBib(true)} disabled={!!ocupado}
            style={{ border: '1px solid var(--df-purple-border)', background: 'var(--df-purple-subtle)', color: 'var(--df-purple)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            📚 {l.enBiblioteca ? 'Enviar otra vez a la biblioteca' : 'Enviar a la biblioteca'}
          </button>
        ) : (
          <div style={{ border: '1px solid var(--df-purple-border)', background: 'var(--df-purple-subtle)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 7, overflow: 'hidden' }}>
                {([[true, 'Gratis'], [false, 'De pago']] as const).map(([g, label]) => (
                  <button key={label} onClick={() => setGratis(g)} style={{ background: gratis === g ? '#0F172A' : 'var(--df-surface)', color: gratis === g ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '6px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              {!gratis && <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio" style={{ flex: 1, minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 7, padding: '5px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }} />}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => void aBiblioteca()} disabled={!!ocupado || (!gratis && !precio.trim())} style={{ flex: 1, border: 'none', background: 'var(--df-purple)', color: '#fff', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{ocupado === 'bib' ? 'Copiando…' : 'Confirmar'}</button>
              <button onClick={() => setAbrirBib(false)} style={{ ...btn, padding: '6px 10px', fontSize: 12 }}>Cancelar</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Dropdown value={destino} onChange={setDestino} placeholder="Enviar a una tienda…" options={[{ value: '', label: 'Enviar a una tienda…' }, ...df.superStores.filter((s) => s.id !== l.storeId).map((s) => ({ value: s.id, label: s.tienda }))]} />
          </div>
          <button onClick={() => void aTienda()} disabled={!destino || !!ocupado}
            style={{ border: 'none', background: destino ? 'var(--df-brand)' : 'var(--df-border-strong)', color: '#fff', borderRadius: 8, padding: '0 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: destino ? 'pointer' : 'default' }}>{ocupado === 'tienda' ? '…' : 'Enviar'}</button>
        </div>
      </div>
    </div>
  );
}

function CardAdmin({ l, df, patch, eliminar }: { l: LibraryLandingAdmin; df: DealFlowState; patch: (id: string, p: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean }) => Promise<void>; eliminar: (l: LibraryLandingAdmin) => Promise<void> }) {
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!destino) return;
    setEnviando(true);
    const r = await apiSuperBibliotecaLandingEnviar(l.id, destino);
    setEnviando(false);
    if (r.error) notificar(r.error, 'error'); else { notificar('✓ Landing enviada a la tienda como borrador.'); setDestino(''); }
  };
  return (
    <div style={card} data-biblioteca={l.id}>
      <Portada src={l.portada} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input defaultValue={l.nombre} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== l.nombre) void patch(l.id, { nombre: e.target.value }); }}
          style={{ fontWeight: 700, fontSize: 14, border: '1px solid transparent', borderRadius: 6, padding: '3px 4px', fontFamily: 'inherit', background: 'transparent', color: 'var(--df-text)' }} />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {l.origen && <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Copiada de {l.origen}{l.precio > 0 ? ` · ${fmt(l.precio)}` : ''}</span>}
          {l.modoCodigo && <Insignia tono="ambar">💻 CÓDIGO PROPIO</Insignia>}
          {l.conPlantilla && <Insignia tono="ambar">🧩 PLANTILLA</Insignia>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Dropdown value={destino} onChange={setDestino} placeholder="Enviar a una tienda…" options={[{ value: '', label: 'Enviar a una tienda…' }, ...df.superStores.map((s) => ({ value: s.id, label: s.tienda }))]} />
          </div>
          <button onClick={() => void enviar()} disabled={!destino || enviando}
            style={{ border: 'none', background: destino ? 'var(--df-purple)' : '#C4B5FD', color: '#fff', borderRadius: 8, padding: '0 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: destino ? 'pointer' : 'default' }}>{enviando ? '…' : 'Enviar'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void patch(l.id, { gratis: !l.gratis })}
            style={{ border: '1px solid ' + (l.gratis ? 'var(--df-brand-border)' : 'var(--df-purple-border)'), background: l.gratis ? 'var(--df-brand-subtle-2)' : 'var(--df-purple-subtle)', color: l.gratis ? 'var(--df-brand-dark)' : 'var(--df-purple)', borderRadius: 7, padding: '4px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            {l.gratis ? 'Gratis' : 'De pago'}
          </button>
          {!l.gratis && (
            <input defaultValue={l.precioImportacion || ''} placeholder="Precio"
              onBlur={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; if (v !== l.precioImportacion) void patch(l.id, { precioImportacion: v }); }}
              style={{ width: 100, border: '1px solid var(--df-border)', borderRadius: 7, padding: '5px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }} />
          )}
        </div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{l.importos} {l.importos === 1 ? 'tienda la importó' : 'tiendas la importaron'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => void patch(l.id, { activo: !l.activo })}
            style={{ flex: 1, border: '1px solid ' + (l.activo ? 'var(--df-border)' : 'var(--df-warning-border)'), background: l.activo ? 'var(--df-surface)' : 'var(--df-warning-subtle-2)', color: l.activo ? 'var(--df-text-body)' : 'var(--df-warning)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
            {l.activo ? 'Visible · ocultar' : 'Oculta · mostrar'}
          </button>
          <span onClick={() => void eliminar(l)} title="Quitar de la biblioteca" className="df-danger-hover" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, padding: 4 }}>🗑</span>
        </div>
      </div>
    </div>
  );
}
