import { useEffect, useState } from 'react';
import { apiBorrarCodigoExt, apiCodigosExt, apiCrearCodigoExt, type CodigoExt } from '../lib/api';

const btn: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 };
const fecha = (s: string) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

/**
 * Extensión de Chrome "DealFlow x Shopify": un botón "Enviar a DealFlow" en cada pedido
 * del panel de Shopify. No necesita la app aprobada por Shopify.
 */
export function ExtensionShopify() {
  const [codigos, setCodigos] = useState<CodigoExt[] | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [msg, setMsg] = useState('');
  const cargar = () => void apiCodigosExt().then((r) => setCodigos(r.data?.codigos || []));
  useEffect(cargar, []);
  const crear = async () => {
    setMsg('');
    const r = await apiCrearCodigoExt(`Computador ${(codigos?.length || 0) + 1}`);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo crear.'); return; }
    setNuevo(r.data.codigo); setCopiado(false); cargar();
  };
  const copiar = () => { try { void navigator.clipboard.writeText(nuevo); setCopiado(true); } catch { /* nada */ } };
  return (
    <div style={{ marginTop: 14, border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, background: 'var(--df-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <img src="/icon-192.png" alt="" style={{ width: 30, height: 30, borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Extensión DealFlow x Shopify</div>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Un botón <b>Enviar a DealFlow</b> en cada pedido de tu panel de Shopify. Funciona sin la app aprobada por Shopify.</div>
        </div>
        <a href="/descargas/dealflow-x-shopify.zip" download style={{ ...btn, background: 'var(--df-purple)', color: '#fff', border: 'none', fontWeight: 700 }}>⬇ Descargar extensión</a>
      </div>
      <ol style={{ fontSize: 12.5, lineHeight: 1.65, margin: '12px 0 10px', paddingLeft: 20 }}>
        <li>Descarga el archivo y <b>descomprímelo</b> (te queda la carpeta <code>dealflow-x-shopify</code>).</li>
        <li>En Chrome abre <code>chrome://extensions</code>, enciende <b>Modo de desarrollador</b> (arriba a la derecha) y dale <b>Cargar descomprimida</b> → elige esa carpeta.</li>
        <li>Genera abajo un <b>código de conexión</b>, haz clic en el ícono de DealFlow en Chrome, pégalo y dale <b>Guardar y probar</b>.</li>
        <li>Abre cualquier pedido en Shopify: abajo a la derecha sale <b>Enviar a DealFlow</b>. El pedido se crea con sus productos y variantes, y si es de las últimas 24 h se le envía la confirmación por WhatsApp como a los demás.</li>
      </ol>
      {nuevo ? (
        <div style={{ border: '1px solid var(--df-purple-border, var(--df-border))', background: 'var(--df-surface)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Tu código (cópialo ahora: por seguridad no se vuelve a mostrar)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 200, fontSize: 12, padding: '8px 10px', background: 'var(--df-bg)', borderRadius: 7, wordBreak: 'break-all' }}>{nuevo}</code>
            <button onClick={copiar} style={btn}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
            <button onClick={() => setNuevo('')} style={btn}>Listo</button>
          </div>
        </div>
      ) : (
        <button onClick={() => void crear()} style={btn}>🔑 Generar código de conexión</button>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--df-danger)', marginTop: 6 }}>{msg}</div>}
      {!!codigos?.length && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {codigos.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
              <span>🔑 <b>{c.nombre}</b></span>
              <span style={{ color: 'var(--df-text-muted)' }}>creado {fecha(c.created_at)} · último uso {fecha(c.ultimo_uso)}</span>
              <button onClick={() => void apiBorrarCodigoExt(c.id).then(cargar)} style={{ ...btn, padding: '4px 9px', color: 'var(--df-danger)', marginLeft: 'auto' }}>Desactivar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
