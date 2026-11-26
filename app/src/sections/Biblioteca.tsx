import type { DealFlowState } from '../hooks/useDealFlowState';
import { Icono, IconoColor } from '../components/Icono';
import { fmt } from '../lib/format';

type ItemBiblioteca = DealFlowState['bibliotecaItems'][number];

/**
 * Biblioteca de productos: productos ya armados por DealFlow (con reglas, fotos y estructura) que la
 * tienda puede importar a su catálogo. Unos son gratis; otros tienen un pago único. Los que despacha
 * DealFlow viven en DealShop.
 */
export function Biblioteca({ df }: { df: DealFlowState }) {
  const lista = df.bibliotecaItems.filter((p) => !p.bodegaDF);
  return (
    <section data-screen-label="Biblioteca">
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Biblioteca de productos</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Productos ya armados —con reglas, fotos, combos y mensaje inicial— listos para importar a tu catálogo. Unos son gratis; otros tienen un pago único.
        </p>
      </div>
      <MensajeBiblioteca df={df} />
      {lista.length === 0 ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
          Todavía no hay productos en la biblioteca. Vuelve pronto: iremos agregando productos listos para vender.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {lista.map((p) => <TarjetaBiblioteca key={p.id} df={df} p={p} />)}
        </div>
      )}
    </section>
  );
}

export function MensajeBiblioteca({ df }: { df: DealFlowState }) {
  if (!df.bibliotecaMsg) return null;
  const ok = df.bibliotecaMsg.startsWith('✓');
  return (
    <div style={{ marginBottom: 14, background: ok ? 'var(--df-brand-subtle-2)' : 'var(--df-danger-subtle)', border: '1px solid ' + (ok ? 'var(--df-brand-border)' : 'var(--df-danger-border, var(--df-danger))'), color: ok ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5 }}>
      {df.bibliotecaMsg}
    </div>
  );
}

/** Tarjeta de un producto de la Biblioteca o de DealShop. bloqueado: texto del botón cuando aún no se puede importar. */
export function TarjetaBiblioteca({ df, p, bloqueado }: { df: DealFlowState; p: ItemBiblioteca; bloqueado?: string }) {
  return (
    <div style={{ background: 'var(--df-surface)', border: `1px solid ${p.bodegaDF ? 'color-mix(in srgb, #A78BFA 45%, var(--df-border))' : 'var(--df-border)'}`, borderRadius: 12, overflow: 'hidden', boxShadow: p.bodegaDF ? '0 10px 26px -18px rgba(118,88,255,.8)' : '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 150, background: 'var(--df-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {p.portada
          ? <img src={p.portada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ display: 'inline-flex' }}><Icono nombre="bolsa" tam={30} style={{ opacity: 0.35 }} /></span>}
        {p.bodegaDF && (
          <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#fff', background: 'linear-gradient(120deg, #10b981, #2e8bff 55%, #7658ff)', borderRadius: 999, padding: '3px 9px', boxShadow: '0 6px 16px -6px rgba(46,139,255,.8)' }}>
            <Icono nombre="despachar" tam={12} />Despacha DealFlow
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1, lineHeight: 1.3 }}>{p.nombre}</span>
          {p.gratis
            ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>GRATIS</span>
            : <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-purple)', background: 'var(--df-purple-subtle)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{fmt(p.precioImportacion)}</span>}
        </div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Precio de venta sugerido: <b style={{ color: 'var(--df-text-body)' }}>{fmt(p.precio)}</b></div>
        {p.bodegaDF && (
          <div style={{ fontSize: 12.5, display: 'grid', gap: 3, background: 'color-mix(in srgb, #A78BFA 9%, transparent)', border: '1px solid color-mix(in srgb, #A78BFA 28%, transparent)', borderRadius: 9, padding: '7px 9px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconoColor color="#A78BFA"><Icono nombre="paquete" tam={13} /></IconoColor>Costo por unidad: <b>{p.bodegaDF.costo === p.bodegaDF.costoMax ? fmt(p.bodegaDF.costo) : `${fmt(p.bodegaDF.costo)} – ${fmt(p.bodegaDF.costoMax)}`}</b></span>
            {p.precio > p.bodegaDF.costoMax && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconoColor color="#34D399"><Icono nombre="dinero" tam={13} /></IconoColor>Ganas hasta <b>{fmt(p.precio - p.bodegaDF.costo)}</b> por unidad (antes del envío)</span>}
            {p.bodegaDF.ciudad && <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--df-text-muted)' }}><IconoColor color="#60A5FA"><Icono nombre="ubicacion" tam={13} /></IconoColor>Sale desde {p.bodegaDF.ciudad}</span>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {bloqueado ? (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface-2)', border: '1px dashed var(--df-border-strong)', borderRadius: 8, padding: '9px 12px', textAlign: 'center' }}>
            {bloqueado}
          </div>
        ) : p.adquirido ? (
          <button
            onClick={() => df.importarDeBiblioteca(p.id)}
            style={{ background: 'var(--df-surface)', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            ✓ Ya adquirido · Importar de nuevo
          </button>
        ) : (
          <button
            onClick={() => df.importarDeBiblioteca(p.id)}
            className="df-btn-primary"
            style={{ background: p.gratis ? 'var(--df-brand)' : 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {p.bodegaDF ? (p.gratis ? 'Vender este producto' : `Desbloquear y vender · ${fmt(p.precioImportacion)}`) : p.gratis ? 'Importar gratis' : `Comprar e importar · ${fmt(p.precioImportacion)}`}
          </button>
        )}
      </div>
    </div>
  );
}
