import { useState } from 'react';
import { apiBorrarRespuestaRapida, apiGuardarRespuestaRapida, type RespuestaRapida } from '../lib/api';
import { recargarRespuestas, useRespuestasRapidas } from '../lib/respuestasRapidas';

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--df-text)' };

/** Crear, editar y borrar los mensajes rápidos de la tienda (se usan con "/" en el chat). */
export function RespuestasRapidasModal({ onCerrar, atajoInicial = '' }: { onCerrar: () => void; atajoInicial?: string }) {
  const lista = useRespuestasRapidas();
  const [edit, setEdit] = useState<{ id?: string; atajo: string; texto: string } | null>(atajoInicial || !lista.length ? { atajo: atajoInicial, texto: '' } : null);
  const [msg, setMsg] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (!edit) return;
    setGuardando(true); setMsg('');
    const r = await apiGuardarRespuestaRapida(edit);
    setGuardando(false);
    if (r.error) { setMsg(r.error); return; }
    await recargarRespuestas();
    setEdit(null); setMsg('✓ Guardado.');
  };
  const borrar = async (x: RespuestaRapida) => {
    if (!window.confirm(`¿Borrar el mensaje rápido /${x.atajo}?`)) return;
    await apiBorrarRespuestaRapida(x.id);
    await recargarRespuestas();
    if (edit?.id === x.id) setEdit(null);
  };
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(2,6,23,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Mensajes rápidos" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--df-surface)', color: 'var(--df-text)', borderRadius: 16, padding: 18, boxShadow: '0 30px 70px -20px rgba(2,6,23,.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16.5, flex: 1 }}>⚡ Mensajes rápidos</div>
          <button onClick={onCerrar} aria-label="Cerrar" style={btn}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          En el chat escribe <b>/</b> y el atajo (ej. <b>/envio</b>) para pegar el mensaje. Escribe <b>{'{nombre}'}</b> donde quieras el nombre del cliente. Los ve y los usa todo tu equipo.
        </p>
        {edit ? (
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Atajo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>/</span>
              <input autoFocus value={edit.atajo} onChange={(e) => setEdit({ ...edit, atajo: e.target.value })} placeholder="envio" style={inp} />
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginTop: 10 }}>Mensaje</label>
            <textarea value={edit.texto} onChange={(e) => setEdit({ ...edit, texto: e.target.value })} rows={5} placeholder={'Hola {nombre} 😊 El envío es gratis y llega en 2 a 4 días hábiles. Pagas al recibir.'} style={{ ...inp, marginTop: 4, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => void guardar()} disabled={guardando} style={{ ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none', fontWeight: 700 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              <button onClick={() => { setEdit(null); setMsg(''); }} style={btn}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setEdit({ atajo: '', texto: '' }); setMsg(''); }} style={{ ...btn, marginBottom: 12, color: 'var(--df-brand-dark)', fontWeight: 700 }}>＋ Nuevo mensaje rápido</button>
        )}
        {msg && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)' }}>{msg}</div>}
        {!lista.length && !edit && <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Todavía no tienes mensajes rápidos.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((x) => (
            <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--df-border)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>/{x.atajo}</div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'pre-wrap', maxHeight: 54, overflow: 'hidden' }}>{x.texto}</div>
              </div>
              <button onClick={() => { setEdit({ id: x.id, atajo: x.atajo, texto: x.texto }); setMsg(''); }} style={btn}>Editar</button>
              <button onClick={() => void borrar(x)} aria-label={`Borrar /${x.atajo}`} style={{ ...btn, color: 'var(--df-danger-dark)' }}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
