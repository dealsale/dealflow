import { useEffect, useState } from 'react';
import { apiLeadBloqueo, apiLeadBloquear, apiLeadDesbloquear, type EstadoBloqueo } from '../lib/api';
import { confirmar, notificar } from './dialogs';

/**
 * Bloquear el contacto de un chat: DealFlow no le vuelve a enviar nada (bot,
 * recordatorios, plantillas, guías) y, si Meta lo permite, el número también lo
 * bloquea, así tampoco le llega nada de otra plataforma conectada al número.
 */
export function BloquearContacto({ leadId, compacto = false }: { leadId: string; compacto?: boolean }) {
  const [e, setE] = useState<EstadoBloqueo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setE(null); if (leadId) void apiLeadBloqueo(leadId).then((r) => r.data && setE(r.data)); }, [leadId]);
  if (!leadId || !e) return null;
  const alternar = async () => {
    if (e.bloqueado) {
      if (!(await confirmar({ titulo: 'Desbloquear contacto', mensaje: 'DealFlow (y el número en Meta, si estaba bloqueado ahí) vuelve a poder escribirle.', aceptar: 'Desbloquear' }))) return;
      setOcupado(true);
      const r = await apiLeadDesbloquear(leadId);
      setOcupado(false);
      if (r.error) { notificar(r.error, 'error'); return; }
      setE({ bloqueado: false, enMeta: false, nota: '' });
      notificar('Contacto desbloqueado.', 'ok');
      return;
    }
    if (!(await confirmar({
      titulo: 'Bloquear contacto',
      mensaje: 'DealFlow no le enviará NADA más a este contacto (bot, recordatorios, plantillas ni guías). También le pedimos a Meta que tu número lo bloquee: así deja de llegarle cualquier mensaje desde tu número, incluso de otra plataforma conectada.',
      aceptar: 'Bloquear', peligro: true,
    }))) return;
    setOcupado(true);
    const r = await apiLeadBloquear(leadId);
    setOcupado(false);
    if (r.error || !r.data) { notificar(r.error || 'No se pudo bloquear.', 'error'); return; }
    setE({ bloqueado: true, enMeta: r.data.enMeta, nota: r.data.nota });
    notificar(r.data.enMeta ? 'Contacto bloqueado en DealFlow y en tu número de WhatsApp.' : `Bloqueado en DealFlow. ${r.data.nota}`, r.data.enMeta ? 'ok' : 'info');
  };
  const titulo = e.bloqueado
    ? `Bloqueado${e.enMeta ? ' en DealFlow y en tu número (Meta)' : ' en DealFlow'}${e.nota ? `. ${e.nota}` : ''}. Toca para desbloquear.`
    : 'Bloquear: que no se le envíe nada más a este contacto';
  if (compacto) {
    return (
      <div onClick={() => !ocupado && void alternar()} title={titulo} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: e.bloqueado ? '#F87171' : 'var(--df-text-faint)', fontSize: 17 }}>
        ⛔
      </div>
    );
  }
  return (
    <button onClick={() => void alternar()} disabled={ocupado} title={titulo}
      style={{ background: e.bloqueado ? 'var(--df-danger)' : 'var(--df-surface)', color: e.bloqueado ? '#fff' : 'var(--df-danger)', border: `1px solid ${e.bloqueado ? 'var(--df-danger)' : 'var(--df-danger-border)'}`, borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', opacity: ocupado ? 0.6 : 1 }}>
      {e.bloqueado ? '⛔ Bloqueado' : '⛔ Bloquear'}
    </button>
  );
}
