import { useEffect, useState } from 'react';
import { apiCalidad, apiGuardarCalidad, type ResumenCalidad } from '../lib/api';

/**
 * Protección de la calidad del número: qué hace DealFlow para que Meta no baje
 * la calidad (bloqueos y reportes de spam) y qué puede hacer la tienda.
 */
export function CalidadCard({ calidad }: { calidad?: string }) {
  const [r, setR] = useState<ResumenCalidad | null>(null);
  useEffect(() => { void apiCalidad().then((x) => { if (x.data) setR(x.data); }); }, []);
  if (!r) return null;
  const baja = calidad === 'YELLOW' || calidad === 'RED' || calidad === 'MEDIUM' || calidad === 'LOW';
  const alternar = async () => {
    const v = !r.cfg.avisarContacto;
    setR({ ...r, cfg: { ...r.cfg, avisarContacto: v } });
    await apiGuardarCalidad({ avisarContacto: v });
  };
  const fila = (txt: string, sub: string) => (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--df-brand-dark)', fontWeight: 800, lineHeight: '20px' }}>✓</span>
      <span><b style={{ fontSize: 13.5 }}>{txt}</b><br /><span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{sub}</span></span>
    </li>
  );
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🛡️ Protección de la calidad del número</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}><b style={{ color: 'var(--df-text-strong)' }}>{r.bajas}</b> cliente{r.bajas === 1 ? '' : 's'} pidieron no recibir mensajes · <b style={{ color: 'var(--df-text-strong)' }}>{r.proactivos7d}</b> mensajes no solicitados en 7 días</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fila('Respeta la "baja"', 'Si el cliente escribe "no me escriban", "baja" o "es spam", el asistente se despide una vez y DealFlow no le vuelve a escribir por su cuenta.')}
        {fila(`Máximo ${r.tope} mensajes no solicitados por cliente al día`, 'Recordatorios, cambios de estado y avisos cuentan; las respuestas a lo que el cliente pregunta no.')}
        {fila('Sin ráfagas en el mensaje inicial', 'Se envían máximo 5 piezas (textos, fotos o videos) cuando alguien escribe por un anuncio.')}
      </ul>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--df-border)', cursor: 'pointer' }}>
        <input type="checkbox" checked={r.cfg.avisarContacto} onChange={alternar} style={{ marginTop: 3 }} />
        <span><b style={{ fontSize: 13.5 }}>Escribirle al celular de contacto cuando es otro número</b><br /><span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Si el cliente deja otro celular para la entrega, se le manda la guía con plantilla. Ese número nunca le escribió a la tienda: es lo que más reportes de spam genera. Recomendado: apagado.</span></span>
      </label>
      {baja && (
        <div style={{ marginTop: 14, background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--df-warning)' }}>Tu calidad bajó: así la recuperas</b>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Deja <b>apagado el seguimiento automático</b> (Asistente) hasta que vuelva a "Alta".</li>
            <li>No mandes <b>plantillas de promoción</b> a quien no las pidió ni difusiones masivas por unos días.</li>
            <li>Revisa que el <b>mensaje inicial</b> sea corto: un saludo, 2 o 3 fotos y una pregunta.</li>
            <li>Responde rápido: los chats sin respuesta y los mensajes repetidos generan bloqueos.</li>
            <li>La calidad se recalcula con los últimos 7 días: si nadie bloquea ni reporta, sube sola.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
