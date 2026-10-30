import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiPlantillasAprobadas, apiIniciarConPlantilla, apiSincronizarPlantillas, type PlantillaAprobada, type ExtraPlantilla } from '../lib/api';
import { CamposPlantilla } from './LlenarPlantilla';
import { Dropdown } from './Dropdown';

/*
 * Iniciar conversaciones con plantilla: para escribirle primero a clientes que no tienen chat
 * abierto (vienen de otro bot, de una base propia…). WhatsApp solo deja escribirle primero a
 * alguien con una plantilla aprobada. Se envía por tandas, con pausa, para cuidar el número.
 */

interface Contacto { tel: string; nombre: string }
interface Resultado { tel: string; nombre: string; ok: boolean; error?: string; leadId?: string }

const lbl: CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text)' };

/** "3001234567, Ana Ruiz" · "Ana Ruiz;573001234567" · "+57 300 123 4567" (uno por línea). */
export function leerContactos(texto: string): Contacto[] {
  const vistos = new Set<string>();
  const out: Contacto[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
    if (!partes.length) continue;
    const iTel = partes.findIndex((p) => (p.replace(/\D/g, '').length >= 10));
    if (iTel < 0) continue;
    const tel = partes[iTel];
    const clave = tel.replace(/\D/g, '').slice(-10);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ tel, nombre: partes.filter((_, i) => i !== iTel).join(' ').replace(/[^\p{L}\s.'-]/gu, '').trim() });
  }
  return out;
}

export function IniciarConversacion({ onAbrirChat }: { onAbrirChat: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [plantillas, setPlantillas] = useState<PlantillaAprobada[] | null>(null);
  const [pid, setPid] = useState('');
  const [texto, setTexto] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [extra, setExtra] = useState<ExtraPlantilla>({});
  const [syncMsg, setSyncMsg] = useState('');
  const actualizar = async () => {
    setSyncMsg('Consultando Meta…');
    const r = await apiSincronizarPlantillas();
    if (r.data?.plantillas) setPlantillas(r.data.plantillas);
    setSyncMsg(r.error || !r.data ? `⚠ ${r.error || 'No pudimos leer tus plantillas de Meta.'}` : `✓ ${r.data.aprobadas} aprobada${r.data.aprobadas === 1 ? '' : 's'} en Meta${r.data.pendientes ? ` · ${r.data.pendientes} en revisión` : ''}${r.data.rechazadas ? ` · ${r.data.rechazadas} rechazada${r.data.rechazadas === 1 ? '' : 's'}` : ''}.`);
  };
  const [asistente, setAsistente] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [hechos, setHechos] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { if (abierto && !plantillas) void apiPlantillasAprobadas().then((r) => setPlantillas(r.data?.plantillas || [])); }, [abierto, plantillas]);
  const pl = plantillas?.find((p) => p.id === pid);
  useEffect(() => { if (pl) { setParams(Array.from({ length: pl.variables }, (_, i) => (i === 0 ? '{nombre}' : pl.ejemplos[i] || ''))); setExtra({}); } }, [pl]);
  const contactos = leerContactos(texto);

  const enviar = async () => {
    if (!pl || !contactos.length) return;
    setEnviando(true); setError(''); setResultados([]); setHechos(0);
    const todos: Resultado[] = [];
    for (let i = 0; i < contactos.length; i += 20) {
      const r = await apiIniciarConPlantilla({ plantillaId: pl.id, params, extra, asistente, contactos: contactos.slice(i, i + 20) });
      if (r.error || !r.data) { setError(r.error || 'No se pudo enviar.'); break; }
      todos.push(...r.data.resultados);
      setResultados([...todos]); setHechos(todos.length);
    }
    setEnviando(false);
  };
  const cerrar = () => { if (enviando) return; setAbierto(false); setResultados([]); setHechos(0); setError(''); };
  const okN = resultados.filter((x) => x.ok).length;

  return (
    <>
      <button onClick={() => setAbierto(true)} title="Escríbele primero a un cliente con una plantilla aprobada"
        style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
        ＋ Iniciar conversación
      </button>
      {abierto && (
        <div onClick={cerrar} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(2,6,23,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div role="dialog" aria-label="Iniciar conversación" onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(620px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--df-surface)', borderRadius: 16, padding: 20, boxShadow: '0 30px 70px -20px rgba(2,6,23,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>Iniciar conversación con plantilla</div>
              <button onClick={cerrar} aria-label="Cerrar" style={{ background: 'none', border: '1px solid var(--df-border)', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', color: 'var(--df-text)' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--df-text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Para clientes que no tienen chat abierto (por ejemplo, los que vienen de otro bot). WhatsApp solo deja escribirle primero a alguien con una <b>plantilla aprobada</b>. Cuando el cliente responda, el chat queda abierto como cualquier otro.
            </p>

            {plantillas && !plantillas.length && <div style={{ fontSize: 13, color: 'var(--df-danger-dark)', marginBottom: 12 }}>No tienes plantillas aprobadas todavía. Si ya te las aprobaron en Meta, toca <b>↻ Actualizar desde Meta</b>.</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ ...lbl, flex: 1 }}>Plantilla</div>
              <button onClick={() => void actualizar()} style={{ background: 'none', border: '1px solid var(--df-border)', borderRadius: 7, padding: '4px 9px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--df-brand-dark)', cursor: 'pointer' }}>↻ Actualizar desde Meta</button>
            </div>
            {syncMsg && <div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0', color: syncMsg.startsWith('⚠') ? 'var(--df-danger-dark)' : 'var(--df-brand-dark)' }}>{syncMsg}</div>}
            <Dropdown value={pid} onChange={setPid} ariaLabel="Plantilla" placeholder={plantillas ? 'Elige una plantilla aprobada…' : 'Cargando…'} options={(plantillas || []).map((p) => ({ value: p.id, label: `${p.nombre} · ${/marketing/i.test(p.categoria) ? 'Marketing' : 'Utilidad'}${p.origen === 'meta' ? ' · creada en Meta' : ''}` }))} />
            {pl && (
              <>
                <CamposPlantilla p={pl} params={params} setParams={setParams} extra={extra} setExtra={setExtra} nombreCliente={contactos[0]?.nombre.split(' ')[0] || ''} />
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 4 }}>Escribe <b>{'{nombre}'}</b> para poner el nombre de cada cliente.</div>
              </>
            )}

            <div style={{ ...lbl, marginTop: 14 }}>Clientes (uno por línea: celular y nombre)</div>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder={'3001234567, Ana Ruiz\n3109876543, Carlos Pérez\n+57 315 555 1234'} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 4 }}>{contactos.length} cliente{contactos.length === 1 ? '' : 's'} · también puedes pegar dos columnas copiadas de Excel. Los repetidos se quitan solos.</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={asistente} onChange={(e) => setAsistente(e.target.checked)} /> Que el asistente atienda cuando respondan
            </label>
            <div style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '9px 11px', marginTop: 12, lineHeight: 1.5 }}>
              ⚠️ Escríbele solo a clientes que ya compraron o aceptaron que los contactes. Si muchos bloquean o reportan, Meta baja la calidad de tu número. Meta cobra cada plantilla a tu cuenta.
            </div>

            {enviando && <div style={{ fontSize: 13, marginTop: 12 }}>Enviando… {hechos} de {contactos.length}</div>}
            {error && <div style={{ fontSize: 13, color: 'var(--df-danger)', marginTop: 12 }}>{error}</div>}
            {resultados.length > 0 && !enviando && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>✓ {okN} enviada{okN === 1 ? '' : 's'}{resultados.length - okN ? ` · ${resultados.length - okN} no salieron` : ''}</div>
                <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
                  {resultados.map((r) => (
                    <div key={r.tel} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--df-border)' }}>
                      <span>{r.ok ? '✅' : '⚠️'}</span>
                      <span style={{ flex: 1 }}>{r.nombre || r.tel} <span style={{ color: 'var(--df-text-faint)' }}>{r.tel}</span>{r.error && <div style={{ color: 'var(--df-danger-dark)' }}>{r.error}</div>}</span>
                      {r.leadId && <button onClick={() => { onAbrirChat(r.leadId!); cerrar(); }} style={{ background: 'none', border: 0, color: 'var(--df-brand-dark)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Abrir chat</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => void enviar()} disabled={!pl || !contactos.length || enviando}
                style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: !pl || !contactos.length || enviando ? 0.5 : 1 }}>
                {enviando ? 'Enviando…' : `Enviar a ${contactos.length || ''} cliente${contactos.length === 1 ? '' : 's'}`}
              </button>
              <button onClick={cerrar} disabled={enviando} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--df-text)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
