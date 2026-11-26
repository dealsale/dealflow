import type { DealFlowState } from '../hooks/useDealFlowState';
import { BodegaDFTiendaPanel } from '../components/BodegaDFTienda';

/**
 * Billetera de la tienda (se entra desde el perfil, arriba): saldo, recargas, retiros, movimientos y
 * los pedidos que despacha DealFlow (DealShop y Envíos DealFlow). Un solo lugar para todo el dinero.
 */
export function Billetera({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Billetera">
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Billetera</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Recarga, retira y mira cada movimiento. Aquí se descuentan las guías de DealShop y de Envíos DealFlow, y llega lo que pagan tus clientes contraentrega.
        </p>
      </div>
      {df.esDueno ? <BodegaDFTiendaPanel /> : (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '30px 20px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
          La billetera solo la ve el dueño de la tienda.
        </div>
      )}
    </section>
  );
}
