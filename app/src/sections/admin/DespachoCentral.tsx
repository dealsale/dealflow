import { useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import type { WooCentralProv } from '../../lib/api';

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'block' };

export function DespachoCentral({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Despacho central">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Despacho central (WooCommerce)</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 16px' }}>
        Un solo WooCommerce por operador (Dropi/Effi) que usan <b>todas las tiendas</b> para despachar. Se configura una vez aquí; a las tiendas no les pides nada. Cada pedido se etiqueta con su tienda y el estado/guía regresa por el webhook.
      </p>
      {df.wooCentralMsg && (
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12, color: df.wooCentralMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.wooCentralMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.wooCentralMsg}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        <ProvCard df={df} prov="dropi" nombre="Dropi" datos={df.wooCentral?.dropi} />
        <ProvCard df={df} prov="effi" nombre="Effi" datos={df.wooCentral?.effi} />
      </div>
      <div style={{ marginTop: 18, background: 'var(--df-surface-2)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: 'var(--df-text-secondary)', lineHeight: 1.6 }}>
        <b>Webhook de regreso (una sola vez):</b> en ese WooCommerce → Ajustes → Avanzado → Webhooks → «Order updated», Delivery URL <code>https://dealflow.sbs/webhooks/woocommerce</code>, Secret = <code>WOO_WEBHOOK_SECRET</code>. Así el estado y la guía vuelven en tiempo real (con polling de respaldo).
      </div>
    </section>
  );
}

function ProvCard({ df, prov, nombre, datos }: { df: DealFlowState; prov: string; nombre: string; datos?: WooCentralProv }) {
  const [url, setUrl] = useState('');
  const [ck, setCk] = useState('');
  const [cs, setCs] = useState('');
  const [tocado, setTocado] = useState(false);
  // Si aún no cargó, o al primer render, tomamos la URL guardada como valor inicial.
  const urlMostrada = tocado ? url : (datos?.url || '');
  const color = prov === 'dropi' ? 'var(--df-warning)' : 'var(--df-purple)';
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: prov === 'dropi' ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12 }}>{nombre.slice(0, 2)}</span>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{nombre}</span>
        {datos?.tieneKeys && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px' }}>Conectado</span>}
        {datos?.preferido && <span style={{ fontSize: 11, fontWeight: 800, color, background: prov === 'dropi' ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', borderRadius: 6, padding: '2px 8px' }}>Preferido</span>}
      </div>
      <label style={label}>URL de la tienda WooCommerce</label>
      <input style={input} value={urlMostrada} onChange={(e) => { setTocado(true); setUrl(e.target.value); }} placeholder="https://mi-tienda.com" />
      <div style={{ marginTop: 10 }}>
        <label style={label}>Consumer Key {datos?.tieneKeys && <span style={{ color: 'var(--df-text-faint)', fontWeight: 500 }}>(guardada — déjalo vacío para conservarla)</span>}</label>
        <input style={input} value={ck} onChange={(e) => setCk(e.target.value)} placeholder={datos?.tieneKeys ? '•••••••• (sin cambios)' : 'ck_...'} />
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={label}>Consumer Secret</label>
        <input style={input} value={cs} onChange={(e) => setCs(e.target.value)} placeholder={datos?.tieneKeys ? '•••••••• (sin cambios)' : 'cs_...'} type="password" />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--df-text-body)' }}>
        <input type="checkbox" defaultChecked={datos?.preferido} onChange={(e) => df.guardarWooCentral({ proveedor: prov, url: urlMostrada, preferido: e.target.checked })} />
        Preferido para auto-despacho (los pedidos nuevos salen solos por {nombre})
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          onClick={() => df.guardarWooCentral({ proveedor: prov, url: urlMostrada, consumerKey: ck || undefined, consumerSecret: cs || undefined }, () => { setCk(''); setCs(''); })}
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >Guardar</button>
        <button
          onClick={() => df.probarWooCentral(prov)}
          style={{ background: 'var(--df-surface-2)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >Probar conexión</button>
      </div>
    </div>
  );
}
