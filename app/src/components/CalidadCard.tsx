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
  const guardar = async (c: { avisarContacto?: boolean; frenoAuto?: boolean }) => {
    setR({ ...r, cfg: { ...r.cfg, ...c } });
    await apiGuardarCalidad(c);
  };
  const alternar = () => guardar({ avisarContacto: !r.cfg.avisarContacto });
  const fila = (txt: string, sub: string) => (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--df-brand-dark)', fontWeight: 800, lineHeight: '20px' }}>✓</span>
      <span><b style={{ fontSize: 13.5 }}>{txt}</b><br /><span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{sub}</span></span>
    </li>
  );
  const frenoOn = baja && r.cfg.frenoAuto;
  const n = (k: string) => r.porTipo?.[k] || 0;
  const avisos = [
    { k: 'confirmacion', t: 'Confirmación del pedido' }, { k: 'guia', t: 'Guía de envío' },
    { k: 'estado', t: 'Cambios de estado (reparto, entrega…)' }, { k: 'novedad', t: 'Novedades de la transportadora' },
  ];
  const opcionales = [
    { k: 'seguimiento_pedido', t: 'Seguimiento del pedido (día 1 y 2)' }, { k: 'recordatorio', t: 'Recordatorios del asistente (chat sin respuesta)' },
    { k: 'remarketing', t: 'Remarketing (rescate de 24 h y recuperación)' },
  ];
  const totAvisos = avisos.reduce((a, x) => a + n(x.k), 0);
  const totOpc = opcionales.reduce((a, x) => a + n(x.k), 0);
  const otros = n('otros');
  const max = Math.max(1, ...avisos.map((x) => n(x.k)), ...opcionales.map((x) => n(x.k)), otros);
  const barra = (t: string, v: number, color: string) => (
    <div key={t} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 54px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--df-text-body)', marginBottom: 3 }}>{t}</div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--df-border)' }}><div style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 99, background: color, minWidth: v ? 4 : 0 }} /></div>
      </div>
      <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--df-text-strong)' }}>{v.toLocaleString('es-CO')}</b>
    </div>
  );
  const grupo = (titulo: string, sub: string, total: number, children: React.ReactNode) => (
    <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <b style={{ fontSize: 13.5, flex: 1 }}>{titulo}</b>
        <b style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString('es-CO')}</b>
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: -6 }}>{sub}</div>
      {children}
    </div>
  );
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🛡️ Protección de la calidad del número</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}><b style={{ color: 'var(--df-text-strong)' }}>{r.bajas}</b> cliente{r.bajas === 1 ? '' : 's'} pidieron no recibir mensajes</span>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
        En los últimos 7 días DealFlow escribió <b>{r.proactivos7d.toLocaleString('es-CO')}</b> mensajes por su cuenta (sin que el cliente acabara de preguntar).
        Meta no baja la calidad por la cantidad: la baja cuando los clientes <b>bloquean o reportan</b>. Los avisos de un pedido que el cliente hizo casi nunca se reportan; los recordatorios y el remarketing sí.
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {grupo('Avisos de sus pedidos', 'El cliente compró y los espera.', totAvisos, avisos.map((x) => barra(x.t, n(x.k), 'var(--df-brand-mid, #10B981)')))}
        {grupo('Mensajes opcionales', frenoOn ? 'Pausados ahora por la calidad del número.' : 'Los que más bloqueos generan.', totOpc, <>
          {opcionales.map((x) => barra(x.t, n(x.k), '#F59E0B'))}
        </>)}
      </div>
      {otros > 0 && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: -6, marginBottom: 14 }}>Otros {otros.toLocaleString('es-CO')} mensajes son de días anteriores a esta medición y no se pueden separar por tipo. Desde hoy cada mensaje queda clasificado.</div>}

      {frenoOn && (
        <div style={{ marginBottom: 14, background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '11px 14px', fontSize: 13, lineHeight: 1.5 }}>
          <b style={{ color: 'var(--df-warning)' }}>⏸ Freno automático activo.</b> Como la calidad está en {calidad === 'RED' || calidad === 'LOW' ? 'baja' : 'media'}, DealFlow pausó el seguimiento de pedidos, los recordatorios del asistente y el remarketing. La confirmación, la guía y los avisos de entrega siguen saliendo. Todo se reanuda solo cuando Meta vuelva a poner la calidad en alta.
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fila('Respeta la "baja"', 'Si el cliente escribe "no me escriban", "baja" o "es spam", el asistente se despide una vez y DealFlow no le vuelve a escribir por su cuenta.')}
        {fila(`Máximo ${r.tope} mensajes no solicitados por cliente al día`, 'Recordatorios, cambios de estado y avisos cuentan; las respuestas a lo que el cliente pregunta no.')}
        {fila('Sin ráfagas en el mensaje inicial', 'Se envía completo, pieza por pieza con pausas de persona (más largas desde la 6.ª), y los textos seguidos van en un solo mensaje.')}
      </ul>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--df-border)', cursor: 'pointer' }}>
        <input type="checkbox" checked={r.cfg.frenoAuto} onChange={() => void guardar({ frenoAuto: !r.cfg.frenoAuto })} style={{ marginTop: 3 }} />
        <span><b style={{ fontSize: 13.5 }}>Pausar los mensajes opcionales si Meta baja la calidad</b><br /><span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Con la calidad en media o baja se detienen el seguimiento de pedidos, los recordatorios y el remarketing, y vuelven solos cuando la calidad sube a alta. Recomendado: encendido.</span></span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={r.cfg.avisarContacto} onChange={() => void alternar()} style={{ marginTop: 3 }} />
        <span><b style={{ fontSize: 13.5 }}>Escribirle al celular de contacto cuando es otro número</b><br /><span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Si el cliente deja otro celular para la entrega, se le manda la guía con plantilla. Ese número nunca le escribió a la tienda: es lo que más reportes de spam genera. Recomendado: apagado.</span></span>
      </label>
      {baja && (
        <div style={{ marginTop: 14, background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--df-warning)' }}>Tu calidad bajó: así la recuperas</b>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Deja <b>encendido el freno automático</b> (arriba): pausa los recordatorios y el remarketing hasta que vuelva a "Alta".</li>
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
