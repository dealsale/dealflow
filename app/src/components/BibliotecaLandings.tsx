import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import {
  apiBibliotecaLandings, apiImportarBibliotecaLanding, apiCheckoutBibliotecaLanding, apiSuperBibliotecaLandings, apiSuperLandingsDeTienda,
  apiSuperAgregarLandingBiblioteca, apiSuperBibliotecaLandingPatch, apiSuperBibliotecaLandingDelete, apiSuperBibliotecaLandingEnviar,
  type LibraryLanding, type LibraryLandingAdmin,
} from '../lib/api';
import { fmt } from '../lib/format';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';

/**
 * Biblioteca de landings: páginas de venta ya armadas por DealFlow que cualquier tienda
 * importa a su Tienda en línea (quedan como borrador con los datos de la tienda).
 * El superadmin las agrega desde la landing de una tienda, igual que con los productos.
 */
const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };
const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' };
const Portada = ({ src }: { src: string | null }) => (
  <div style={{ aspectRatio: '16/10', background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
    {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30, color: 'var(--df-border-strong)' }}>🛍️</span>}
  </div>
);

/** Ventana para la tienda: elegir una landing de la biblioteca e importarla. */
export function BibliotecaLandingsModal({ onCerrar, onImportada }: { onCerrar: () => void; onImportada: (landingId: string) => void }) {
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
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 14, width: 'min(920px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 18, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>📚 Biblioteca de landings</div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2 }}>Páginas de venta ya armadas (fotos, ofertas, testimonios y textos). Se importan como borrador con el nombre, logo y WhatsApp de tu tienda; tú eliges el producto y la publicas.</div>
          </div>
          <button onClick={onCerrar} style={btn}>Cerrar</button>
        </div>
        {items === null ? <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>Cargando…</div>
          : !items.length ? <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>Todavía no hay landings en la biblioteca. Vuelve pronto.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {items.map((l) => (
                <div key={l.id} style={card}>
                  <Portada src={l.portada} />
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, lineHeight: 1.3 }}>{l.nombre}</span>
                      {l.gratis
                        ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px' }}>GRATIS</span>
                        : <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-purple)', background: 'var(--df-purple-subtle)', borderRadius: 6, padding: '2px 8px' }}>{fmt(l.precioImportacion)}</span>}
                    </div>
                    {l.precio > 0 && <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Precio en la página: <b style={{ color: 'var(--df-text-body)' }}>{fmt(l.precio)}</b></div>}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => void importar(l)} disabled={!!ocupado} className="df-btn-primary"
                      style={{ ...btn, background: l.adquirida ? 'var(--df-surface)' : l.gratis ? 'var(--df-brand)' : 'var(--df-purple)', color: l.adquirida ? 'var(--df-brand-dark)' : '#fff', border: l.adquirida ? '1px solid var(--df-brand-border)' : 'none', fontWeight: 700, opacity: ocupado && ocupado !== l.id ? 0.6 : 1 }}>
                      {ocupado === l.id ? 'Importando…' : l.adquirida ? '✓ Ya adquirida · Importar de nuevo' : l.gratis ? 'Importar gratis' : `Comprar e importar · ${fmt(l.precioImportacion)}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** Pestaña del superadmin: agregar landings desde una tienda y administrarlas. */
export function BibliotecaLandingsAdmin({ df }: { df: DealFlowState }) {
  const [items, setItems] = useState<LibraryLandingAdmin[]>([]);
  const [tienda, setTienda] = useState('');
  const [deTienda, setDeTienda] = useState<{ id: string; nombre: string; estado: string }[]>([]);
  const [landing, setLanding] = useState('');
  const [gratis, setGratis] = useState(true);
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cargar = () => void apiSuperBibliotecaLandings().then((r) => setItems(r.data?.landings || []));
  useEffect(cargar, []);
  const elegirTienda = (id: string) => { setTienda(id); setLanding(''); setDeTienda([]); if (id) void apiSuperLandingsDeTienda(id).then((r) => setDeTienda(r.data?.landings || [])); };
  const agregar = async () => {
    if (!landing) return;
    setEnviando(true);
    const r = await apiSuperAgregarLandingBiblioteca(tienda, landing, gratis, gratis ? 0 : parseInt(precio.replace(/\D/g, ''), 10) || 0);
    setEnviando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Landing agregada a la biblioteca.'); setLanding(''); setPrecio(''); cargar();
  };
  const patch = async (id: string, p: Parameters<typeof apiSuperBibliotecaLandingPatch>[1]) => { const r = await apiSuperBibliotecaLandingPatch(id, p); if (r.error) notificar(r.error, 'error'); cargar(); };
  const eliminar = async (l: LibraryLandingAdmin) => {
    if (!(await confirmar({ titulo: `¿Quitar "${l.nombre}" de la biblioteca?`, mensaje: 'Las tiendas que ya la importaron conservan su copia.', aceptar: 'Quitar', peligro: true }))) return;
    await apiSuperBibliotecaLandingDelete(l.id); cargar();
  };
  const tiendas = [{ value: '', label: 'Elige una tienda…' }, ...df.superStores.map((s) => ({ value: s.id, label: s.tienda }))];
  return (
    <>
      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Agregar una landing a la biblioteca desde una tienda</div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginBottom: 12 }}>Se copia completa (diseño, fotos, ofertas, testimonios y textos). Al importarla, cada tienda la recibe como borrador con su propio nombre, logo, WhatsApp y píxel.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Tienda</div>
            <Dropdown value={tienda} onChange={elegirTienda} placeholder="Elige una tienda…" options={tiendas} />
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Landing</div>
            <Dropdown value={landing} onChange={setLanding}
              placeholder={tienda ? (deTienda.length ? 'Elige una landing…' : 'Esta tienda no tiene landings') : 'Primero elige la tienda'}
              options={[{ value: '', label: tienda ? (deTienda.length ? 'Elige una landing…' : 'Esta tienda no tiene landings') : 'Primero elige la tienda' }, ...deTienda.map((l) => ({ value: l.id, label: `${l.nombre}${l.estado === 'publicada' ? ' · publicada' : ''}` }))]} />
          </div>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Tipo</div>
            <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
              {([[true, 'Gratis'], [false, 'De pago']] as const).map(([g, label]) => (
                <button key={label} onClick={() => setGratis(g)} style={{ background: gratis === g ? '#0F172A' : 'var(--df-surface)', color: gratis === g ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
          {!gratis && (
            <div style={{ width: 170 }}>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio de importación</div>
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 49900" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            </div>
          )}
          <button onClick={() => void agregar()} disabled={!landing || enviando} className="df-btn-primary"
            style={{ background: landing ? 'var(--df-purple)' : '#C4B5FD', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: landing ? 'pointer' : 'default' }}>
            {enviando ? 'Copiando…' : 'Enviar a biblioteca'}
          </button>
        </div>
      </div>
      {!items.length ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>La biblioteca de landings está vacía. Agrega la primera arriba.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {items.map((l) => <CardAdmin key={l.id} l={l} df={df} patch={patch} eliminar={eliminar} />)}
        </div>
      )}
    </>
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
    <div style={card}>
      <Portada src={l.portada} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input defaultValue={l.nombre} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== l.nombre) void patch(l.id, { nombre: e.target.value }); }}
          style={{ fontWeight: 700, fontSize: 14, border: '1px solid transparent', borderRadius: 6, padding: '3px 4px', fontFamily: 'inherit', background: 'transparent', color: 'var(--df-text)' }} />
        {l.origen && <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Copiada de {l.origen}{l.precio > 0 ? ` · ${fmt(l.precio)}` : ''}</div>}
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
