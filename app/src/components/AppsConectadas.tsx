import { useEffect, useState } from 'react';
import { apiActivarRecepcion, apiAppsConectadas, type AppConectada } from '../lib/api';

/**
 * Qué apps siguen recibiendo los mensajes de tu número (suscritas a tu cuenta de
 * WhatsApp en Meta). Sirve para encontrar una plataforma anterior que siga
 * enganchada y contestando aunque ya la hayas "desinstalado".
 */
export function AppsConectadas() {
  const [apps, setApps] = useState<AppConectada[] | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [falta, setFalta] = useState(false);
  const [activando, setActivando] = useState(false);
  const [msg, setMsg] = useState('');
  const revisar = async () => {
    setCargando(true); setError(''); setMsg('');
    const r = await apiAppsConectadas();
    setCargando(false);
    if (r.error || !r.data) { setError(r.error || 'No se pudo consultar.'); setApps(null); return; }
    setApps(r.data.apps); setFalta(!!r.data.faltaDealflow);
  };
  // Se revisa sola al abrir: si DealFlow no recibe los mensajes, el aviso tiene que verse sin buscarlo.
  useEffect(() => { void revisar(); }, []);
  const activar = async () => {
    setActivando(true); setMsg('');
    const r = await apiActivarRecepcion();
    setActivando(false);
    if (r.data?.apps) { setApps(r.data.apps); setFalta(!!r.data.faltaDealflow); }
    if (r.error || !r.data?.ok) { setMsg(r.error || r.data?.error || 'No se pudo activar.'); return; }
    setMsg('✓ Listo: Meta ya le manda tus mensajes a DealFlow. Escríbele a tu número para probar.');
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
      {apps && falta && (
        <div style={{ marginTop: 12, border: '1px solid var(--df-danger-border)', background: 'var(--df-danger-subtle, rgba(239,68,68,.06))', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--df-danger)' }}>⚠️ Los mensajes que te escriben NO están llegando a DealFlow</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--df-text-body)' }}>
            Tu número está conectado y puede enviar, pero Meta no le está avisando a DealFlow cuando un cliente te escribe; por eso el Inbox no recibe nada. Toca el botón para activarlo.
          </div>
          <button onClick={() => void activar()} disabled={activando} style={{ alignSelf: 'flex-start', background: 'var(--df-danger)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: activando ? 0.6 : 1 }}>
            {activando ? 'Activando…' : 'Activar la recepción de mensajes'}
          </button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)', lineHeight: 1.5 }}>{msg}</div>}
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
