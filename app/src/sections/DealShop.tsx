import type { DealFlowState } from '../hooks/useDealFlowState';
import { Icono, IconoColor } from '../components/Icono';
import { EnviosDFCard, useEnviosDF } from '../components/EnviosDF';
import { TarjetaBiblioteca, MensajeBiblioteca } from './Biblioteca';

/**
 * DealShop: productos que vende DealFlow. La tienda los desbloquea (gratis o con un pago único) y los
 * vende con su asistente; DealFlow los despacha desde la bodega del proveedor, recauda el
 * contraentrega y le abona su ganancia en la billetera. Requiere Envíos DealFlow activo.
 */
export function DealShop({ df }: { df: DealFlowState }) {
  const [env] = useEnviosDF();
  const items = df.bibliotecaItems.filter((p) => p.bodegaDF);
  const activos = items.filter((p) => p.adquirido).length;
  return (
    <section data-screen-label="DealShop">
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>DealShop</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Vende productos sin tenerlos. DealFlow los despacha desde la bodega del proveedor, cobra el contraentrega y te abona tu ganancia.
        </p>
      </div>

      <EnviosDFCard irBilletera={() => df.go('billetera')} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <IconoColor color="#A78BFA"><Icono nombre="bolsa" tam={17} /></IconoColor>
        <b style={{ fontSize: 15, flex: 1 }}>Catálogo · {items.length}{activos ? ` (${activos} vendiendo)` : ''}</b>
        <button onClick={() => df.go('billetera')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '7px 14px', font: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)' }}>
          <IconoColor color="#34D399"><Icono nombre="billetera" tam={15} /></IconoColor>Ir a mi billetera
        </button>
      </div>

      {(
        <>
          <MensajeBiblioteca df={df} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { n: '1', c: '#A78BFA', t: 'Desbloquea', d: 'Gratis o con un pago único. Queda en tus productos y el asistente ya lo vende.' },
              { n: '2', c: '#2e8bff', t: 'Vende', d: 'Al confirmarse el pedido, DealFlow genera la guía y el proveedor lo empaca.' },
              { n: '3', c: '#10b981', t: 'Cobra', d: 'Al entregarse, lo que pagó el cliente llega a tu billetera. Retíralo cuando quieras.' },
            ].map((x) => (
              <div key={x.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '10px 12px' }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: x.c, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{x.n}</span>
                <span style={{ display: 'grid', gap: 2 }}><b style={{ fontSize: 13.5 }}>{x.t}</b><span style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.4 }}>{x.d}</span></span>
              </div>
            ))}
          </div>
          {items.length === 0 ? (
            <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
              Muy pronto habrá productos en DealShop. Activa Envíos DealFlow para estar listo.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {items.map((p) => <TarjetaBiblioteca key={p.id} df={df} p={p} bloqueado={env && !env.activo ? 'Activa Envíos DealFlow para venderlo' : undefined} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
