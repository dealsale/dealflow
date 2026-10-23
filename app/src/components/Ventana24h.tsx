import { useEffect, useState, type ReactNode } from 'react';

/**
 * Ventana de 24 h de WhatsApp en el Inbox: si el cliente no escribe hace más de
 * 24 h, no se le puede mandar texto libre (solo plantillas aprobadas). Se recalcula
 * cada 30 s para que el bloqueo aparezca justo cuando vence.
 */
export function useVentana24h(chat: { ventana24h?: boolean; ultClienteIso?: string | null; mensajes?: { de: string; createdAt?: string }[] } | null) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!chat || !chat.ventana24h) return { cerrada: false, restante: null as number | null };
  // Lo más reciente entre lo que mandó el servidor y los mensajes ya cargados del chat.
  const delChat = [...(chat.mensajes || [])].reverse().find((m) => m.de === 'cliente' && m.createdAt)?.createdAt;
  const iso = [chat.ultClienteIso, delChat].filter(Boolean).sort().pop();
  if (!iso) return { cerrada: true, restante: null };
  const t = Date.parse(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  const restante = t + 24 * 3600e3 - ahora;
  return { cerrada: restante <= 0, restante };
}

const fmt = (ms: number) => { const h = Math.floor(ms / 3600e3); const m = Math.floor((ms % 3600e3) / 60e3); return h ? `${h} h ${m} min` : `${m} min`; };

/** Reemplaza la caja de escribir cuando la ventana está cerrada. */
export function BarraVentanaCerrada({ plantillas, extra }: { plantillas: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border, var(--df-border))', borderRadius: 10, padding: '10px 12px' }}>
      <style>{`
        @keyframes dfRayoAnillo { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.55) } 70% { box-shadow: 0 0 0 10px rgba(245,158,11,0) } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0) } }
        @keyframes dfRayoSalto { 0%, 100% { transform: translateY(0) scale(1) } 12% { transform: translateY(-3px) scale(1.12) rotate(-8deg) } 24% { transform: translateY(0) scale(1) rotate(6deg) } 32% { transform: rotate(0) } }
        @keyframes dfRayoFlecha { 0%, 100% { transform: translateX(0); opacity: .75 } 50% { transform: translateX(-4px); opacity: 1 } }
        .df-rayo-destacado { position: relative; border-radius: 12px; animation: dfRayoAnillo 1.8s ease-out infinite }
        .df-rayo-destacado > div > button { animation: dfRayoSalto 2.4s ease-in-out infinite; border-color: var(--df-warning) !important; background: #FFFBEB !important }
        .df-rayo-flecha { animation: dfRayoFlecha 1.2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .df-rayo-destacado, .df-rayo-destacado > div > button, .df-rayo-flecha { animation: none !important } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="df-rayo-destacado">{plantillas}</span>
        <span className="df-rayo-flecha" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--df-warning)', whiteSpace: 'nowrap' }}>← Enviar plantilla</span>
      </div>
      <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.45, color: 'var(--df-text-body)' }}>
        <b>🔒 No puedes escribir en este chat.</b> Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo permite enviarle una <b>plantilla aprobada</b> (botón ⚡). Cuando el cliente responda, se desbloquea.
      </div>
      {extra}
    </div>
  );
}

/** Aviso pequeño cuando a la ventana le quedan menos de 4 h. */
export function AvisoVentana({ restante }: { restante: number | null }) {
  if (restante == null || restante <= 0 || restante > 4 * 3600e3) return null;
  return <div style={{ fontSize: 11.5, color: 'var(--df-warning)', marginTop: 6 }}>⏳ La ventana de 24 h de WhatsApp se cierra en {fmt(restante)}. Después solo podrás enviar plantillas aprobadas.</div>;
}
