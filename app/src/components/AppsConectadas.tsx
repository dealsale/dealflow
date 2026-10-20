import { useState } from 'react';
import { apiAppsConectadas, type AppConectada } from '../lib/api';

/**
 * Qué apps siguen recibiendo los mensajes de tu número (suscritas a tu cuenta de
 * WhatsApp en Meta). Sirve para encontrar una plataforma anterior que siga
 * enganchada y contestando aunque ya la hayas "desinstalado".
 */
export function AppsConectadas() {
  const [apps, setApps] = useState<AppConectada[] | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const revisar = async () => {
    setCargando(true); setError('');
    const r = await apiAppsConectadas();
    setCargando(false);
    if (r.error || !r.data) { setError(r.error || 'No se pudo consultar.'); setApps(null); return; }
    setApps(r.data.apps);
  };
  const otras = (apps || []).filter((a) => !a.esDealFlow);
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🔌 Apps conectadas a tu número</div>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5, marginTop: 2 }}>
            Le preguntamos a Meta qué apps reciben los mensajes de tu WhatsApp. Si aparece una plataforma que ya no usas, puede ser la que sigue contestando.
          </div>
        </div>
        <button onClick={() => void revisar()} disabled={cargando} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: cargando ? 0.6 : 1 }}>
          {cargando ? 'Consultando…' : apps ? 'Volver a revisar' : 'Revisar'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--df-danger)', marginTop: 10 }}>{error}</div>}
      {apps && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!apps.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Meta no reporta apps conectadas.</div>}
          {apps.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px solid ${a.esDealFlow ? 'var(--df-border)' : 'var(--df-danger-border)'}`, background: a.esDealFlow ? 'var(--df-bg)' : 'var(--df-danger-subtle, rgba(239,68,68,.06))' }}>
              <span style={{ fontSize: 16 }}>{a.esDealFlow ? '✅' : '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.nombre}{a.esDealFlow ? ' (DealFlow)' : ''}</div>
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', fontFamily: "'JetBrains Mono', monospace" }}>App ID {a.id}{a.enlace ? ` · ${a.enlace}` : ''}</div>
              </div>
            </div>
          ))}
          {otras.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', lineHeight: 1.6, marginTop: 6 }}>
              <b>Para desconectar {otras.length === 1 ? 'esa app' : 'esas apps'}:</b> en Meta Business Suite → Configuración del negocio → <b>Integraciones → Integraciones empresariales</b>, elimina la app; y en <b>Cuentas → Apps</b> quítala también. Si sigue apareciendo aquí, escríbele al soporte de esa plataforma para que desconecte tu número.
            </div>
          )}
          {apps.length > 0 && !otras.length && (
            <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.6, marginTop: 6 }}>
              Solo DealFlow recibe tus mensajes. Si otra plataforma aún envía, puede tener un token guardado: revisa <b>Integraciones empresariales</b> en Meta, o cierra los <b>dispositivos vinculados</b> en el WhatsApp del celular si esa plataforma usaba código QR.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
