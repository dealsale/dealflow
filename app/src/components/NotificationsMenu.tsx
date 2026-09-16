import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { IconBell } from './icons';

function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? 'var(--df-brand)' : 'var(--df-border-strong)', position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: 'background .15s' }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--df-surface)', transition: 'left .15s', boxShadow: '0 1px 2px rgba(15,23,42,.3)' }} />
    </span>
  );
}

/** Campanita con panel para activar/desactivar notificaciones y elegir sus tipos. */
export function NotificationsMenu({ df }: { df: DealFlowState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const cerrar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [open]);

  const p = df.notifPrefs;
  const activo = p.on && df.notifPermiso === 'granted';
  const bloqueado = df.notifPermiso === 'denied';

  const fila = (titulo: string, sub: string, on: boolean, onClick: () => void, disabled?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--df-text-strong)' }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{sub}</div>
      </div>
      <Switch on={on} onClick={onClick} disabled={disabled} />
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen((o) => !o)}
        className="df-close-hover"
        title="Notificaciones"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: activo ? 'var(--df-brand)' : 'var(--df-text-muted)', position: 'relative' }}
      >
        <IconBell muted={!activo} />
        {activo && <span style={{ position: 'absolute', top: 5, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)', border: '1.5px solid var(--df-surface)' }} />}
      </span>

      {open && (
        <div style={{ position: 'absolute', top: '130%', right: 0, width: 288, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 20px 50px -15px rgba(15,23,42,.3)', padding: 14, zIndex: 60 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 2 }}>Notificaciones</div>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 8 }}>Avisos en este dispositivo (web y app).</div>

          {fila('Activar notificaciones', activo ? 'Activadas en este dispositivo' : 'Recibe avisos aunque no mires la pantalla', activo, () => void df.toggleNotificaciones())}

          {bloqueado && (
            <div style={{ background: 'var(--df-danger-subtle)', border: '1px solid var(--df-danger-border)', color: 'var(--df-danger-dark)', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.45, margin: '2px 0 6px' }}>
              Están bloqueadas en el navegador. Ábrelas desde el candado 🔒 de la barra de direcciones y vuelve a activarlas.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--df-border)', margin: '4px 0' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-text-faint)', letterSpacing: '.04em', textTransform: 'uppercase', padding: '6px 4px 2px' }}>Qué avisar</div>
          {fila('Pedidos nuevos', 'Cuando entra un pedido, con su resumen', p.pedidos, () => df.setNotifTipo('pedidos', !p.pedidos), !activo)}
          {fila('Contactos nuevos', 'Cuando un cliente nuevo te escribe', p.contactos, () => df.setNotifTipo('contactos', !p.contactos), !activo)}

          <div style={{ borderTop: '1px solid var(--df-border)', margin: '4px 0' }} />
          {fila('Sonido de pedidos', 'Un timbre al entrar un pedido', df.soundOn, df.toggleSound)}
        </div>
      )}
    </div>
  );
}
