import { PresenciaEnLista } from '../../components/PresenciaChat';
import { useLazyList } from '../../hooks/useLazyList';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { IniciarConversacion } from '../../components/IniciarConversacion';
import { AvatarCanal, ChipsCanal, canalDe } from '../../components/CanalChat';
import { useRecordado } from '../../lib/rutas';
import { useState } from 'react';

export function MCRM({ df }: { df: DealFlowState }) {
  // Carga por tandas: solo los primeros ~15 chats montados, más al bajar.
  const [canal, setCanal] = useRecordado<string>('inbox:canal', '');
  const [noLeidos, setNoLeidos] = useState(false);
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const conteo: Record<string, number> = {};
  for (const c of df.crmChats) { const k = canalDe(c); conteo[k] = (conteo[k] || 0) + 1; }
  const chats = df.crmChats.filter((c) => (!canal || canalDe(c) === canal) && (!noLeidos || c.sinResponder > 0) && (!q || c.nombre.toLowerCase().includes(q) || c.tel.toLowerCase().includes(q)));
  const { count: visibles, rootRef } = useLazyList(chats.length, `movil-crm|${canal}|${noLeidos}|${q}`);
  const chatsVisibles = chats.slice(0, visibles);
  return (
    <section data-screen-label="Móvil CRM">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Inbox · Chats en vivo</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 13, margin: '0 0 12px' }}>Toca un chat para verlo y tomar el control si quieres.</p>
      {df.puede('iniciar_conversacion') && <div style={{ marginBottom: 12 }}><IniciarConversacion onAbrirChat={(id) => df.openMobileChat(id)} /></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, minWidth: 0 }}>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar chats"
          style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 14, background: 'var(--df-surface)', color: 'var(--df-text)', width: '100%', boxSizing: 'border-box' }} />
        <ChipsCanal conteo={conteo} valor={canal} onChange={setCanal} compacto />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-secondary)' }}>
          <input type="checkbox" checked={noLeidos} onChange={(e) => setNoLeidos(e.target.checked)} /> Solo no leídos
        </label>
      </div>
      <div ref={rootRef} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, overflow: 'hidden' }}>
        {chatsVisibles.map((c) => (
          <div key={c.id} onClick={() => df.openMobileChat(c.id)} style={{ display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}>
            <AvatarCanal avatarStyle={c.avatarStyle} iniciales={c.iniciales} canal={canalDe(c)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
                <span style={{ color: c.sinResponder ? '#25D366' : 'var(--df-text-faint)', fontWeight: c.sinResponder ? 700 : 400, fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{c.fechaHoraLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ color: c.sinResponder ? 'var(--df-text)' : 'var(--df-text-muted)', fontWeight: c.sinResponder ? 600 : 400, fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.ultimo}</div>
                {c.sinResponder > 0 && (
                  <span title={`${c.sinResponder} mensaje(s) sin leer`} style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 999, background: '#25D366', color: '#fff', fontSize: 11.5, fontWeight: 800, boxShadow: '0 0 0 2px var(--df-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.sinResponder}</span>
                )}
              </div>
              <div style={c.liveStyle}>
                <span style={c.liveDot} />
                <span>{c.liveLabel}</span>
                <span style={{ color: 'var(--df-text-faint)', fontWeight: 500 }}>· atiende {c.asignado}</span>
                <span style={{ marginLeft: 'auto' }}><PresenciaEnLista chatId={String(c.id)} /></span>
              </div>
            </div>
          </div>
        ))}
        {chats.length > visibles && (
          <div style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 12 }}>
            Baja para ver {chats.length - visibles} chat{chats.length - visibles === 1 ? '' : 's'} más…
          </div>
        )}
      </div>
    </section>
  );
}
