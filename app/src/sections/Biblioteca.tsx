import type { DealFlowState } from '../hooks/useDealFlowState';
import { fmt } from '../lib/format';

/**
 * Biblioteca de productos: productos ya armados por DealFlow (con reglas, fotos
 * y estructura) que la tienda puede importar a su catálogo. Unos son gratis;
 * otros tienen un pago único para importarlos.
 */
export function Biblioteca({ df }: { df: DealFlowState }) {
  const items = df.bibliotecaItems;
  return (
    <section data-screen-label="Biblioteca">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Biblioteca de productos</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>
          Productos ya armados —con reglas, fotos, combos y mensaje inicial— listos para importar a tu catálogo. Unos son gratis; otros tienen un pago único.
        </p>
      </div>

      {df.bibliotecaMsg && (
        <div style={{ marginBottom: 14, background: df.bibliotecaMsg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (df.bibliotecaMsg.startsWith('✓') ? '#A7F3D0' : '#FECACA'), color: df.bibliotecaMsg.startsWith('✓') ? '#047857' : '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontWeight: 600 }}>
          {df.bibliotecaMsg}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#64748B', fontSize: 14 }}>
          Todavía no hay productos en la biblioteca. Vuelve pronto: iremos agregando productos listos para vender.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {items.map((p) => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 150, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.portada
                  ? <img src={p.portada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: '#CBD5E1', fontSize: 30 }}>🛍️</span>}
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1, lineHeight: 1.3 }}>{p.nombre}</span>
                  {p.gratis
                    ? <span style={{ fontSize: 11, fontWeight: 800, color: '#047857', background: '#D1FAE5', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>GRATIS</span>
                    : <span style={{ fontSize: 11, fontWeight: 800, color: '#6D28D9', background: '#EDE9FE', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{fmt(p.precioImportacion)}</span>}
                </div>
                <div style={{ color: '#94A3B8', fontSize: 12.5 }}>Precio de venta sugerido: <b style={{ color: '#334155' }}>{fmt(p.precio)}</b></div>
                <div style={{ flex: 1 }} />
                {p.adquirido ? (
                  <button
                    onClick={() => df.importarDeBiblioteca(p.id)}
                    style={{ background: '#fff', color: '#047857', border: '1px solid #A7F3D0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    ✓ Ya adquirido · Importar de nuevo
                  </button>
                ) : (
                  <button
                    onClick={() => df.importarDeBiblioteca(p.id)}
                    className="df-btn-primary"
                    style={{ background: p.gratis ? '#059669' : '#6D28D9', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    {p.gratis ? 'Importar gratis' : `Comprar e importar · ${fmt(p.precioImportacion)}`}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
