import { useEffect, useRef, useState } from 'react';
import { AttachButton, MediaContent } from '../components/MediaBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { SearchInput, FilterSelect } from '../components/Filters';
import { Dropdown } from '../components/Dropdown';
import { ActivityLog } from '../components/ActivityLog';
import { useLazyList } from '../hooks/useLazyList';
import { archivosDePortapapeles } from '../lib/clipboard';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { Anuncio } from '../types';

type EstadoPill = 'todos' | 'noleidos' | 'envivo' | 'esperando';

/**
 * Etiqueta de atribución de campaña: muestra de qué anuncio (pauta) llegó el chat,
 * con miniatura y un botón para abrir el anuncio directo. Solo aparece cuando el
 * cliente entró por una pauta (Click-to-WhatsApp / Messenger / Instagram).
 */
export function AnuncioCard({ anuncio }: { anuncio: Anuncio }) {
  const titulo = anuncio.titular || 'Anuncio de campaña';
  return (
    <div style={{ display: 'flex', alignSelf: 'center', gap: 10, alignItems: 'center', maxWidth: 460, width: '100%', background: 'var(--df-brand-subtle)', border: '1px solid var(--df-brand-border)', borderRadius: 10, padding: 10, marginBottom: 4 }}>
      {anuncio.media && (
        <img src={anuncio.media} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--df-surface-2)' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-brand-dark)', letterSpacing: '0.02em' }}>📢 Vino del anuncio</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--df-text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={titulo}>{titulo}</div>
        {anuncio.texto && <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{anuncio.texto}</div>}
      </div>
      {anuncio.url && (
        <a href={anuncio.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, textDecoration: 'none', background: 'var(--df-brand)', color: '#fff', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>Ver anuncio</a>
      )}
    </div>
  );
}

/**
 * Botón de "Flujos" del inbox: dispara manualmente un flujo. El principal es el
 * "Mensaje inicial": despliega los productos y, al elegir uno, envía su
 * presentación al cliente y deja al asistente esperando la respuesta.
 */
export function FlujosButton({ df, size = 40 }: { df: DealFlowState; size?: number }) {
  const [open, setOpen] = useState(false);
  const [verProductos, setVerProductos] = useState(false);
  const [verRemk, setVerRemk] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setVerProductos(false); setVerRemk(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', color: 'var(--df-text-strong)' };
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Enviar un flujo (mensaje inicial o remarketing)"
        style={{ width: size, height: size, borderRadius: 10, border: '1px solid var(--df-border)', background: open ? 'var(--df-surface-2)' : 'var(--df-surface)', color: 'var(--df-brand)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
      >⚡</button>
      {open && (
        <div style={{ position: 'absolute', bottom: size + 8, left: 0, width: 268, maxHeight: 320, overflowY: 'auto', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 10px 34px rgba(15,23,42,.28)', zIndex: 60, padding: 6 }}>
          {verProductos ? (
            <>
              <button onClick={() => setVerProductos(false)} style={{ ...item, fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ Elige el producto</button>
              {df.flujoProductos.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--df-text-muted)' }}>No tienes productos aún.</div>}
              {df.flujoProductos.map((p) => (
                <button key={p.id} onClick={() => { df.enviarFlujoInicial(p.id); setOpen(false); setVerProductos(false); }} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--df-surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 15 }}>🛍️</span>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
                </button>
              ))}
            </>
          ) : verRemk ? (
            <>
              <button onClick={() => setVerRemk(false)} style={{ ...item, fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ Elige el flujo</button>
              {df.flujos.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--df-text-muted)' }}>Aún no creaste flujos. Ve a “Flujos” en el menú.</div>}
              {df.flujos.map((f) => (
                <button key={f.id} onClick={() => { df.enviarFlujoRemarketing(f.id); setOpen(false); setVerRemk(false); }} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--df-surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 15 }}>🔁</span>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-faint)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '8px 10px 6px' }}>Flujos</div>
              <button onClick={() => setVerProductos(true)} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--df-surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 17 }}>📣</span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Mensaje inicial</div>
                  <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Envía la presentación de un producto</div>
                </div>
                <span style={{ color: 'var(--df-text-faint)' }}>›</span>
              </button>
              <button onClick={() => setVerRemk(true)} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--df-surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 17 }}>🔁</span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Remarketing</div>
                  <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Envía uno de tus flujos de ofertas</div>
                </div>
                <span style={{ color: 'var(--df-text-faint)' }}>›</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CRM({ df }: { df: DealFlowState }) {
  const chat = df.crmChat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [busca, setBusca] = useState('');
  const [rangoFecha, setRangoFecha] = useState<'Todas' | 'Hoy' | 'Ayer' | '7 días' | 'Personalizado'>('Todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estadoPill, setEstadoPill] = useState<EstadoPill>('todos');
  const [nota, setNota] = useState('');
  const [panelCliente, setPanelCliente] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.tel, chat?.mensajesDecorated.length]);
  useEffect(() => {
    setNota(chat?.notaInterna || '');
    setPanelCliente(false);
  }, [chat?.id]);
  const q = busca.trim().toLowerCase();

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const hace7 = new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const custom = rangoFecha === 'Personalizado';
  const pasaFecha = (fechaISO: string) => {
    if (custom) return !!fechaISO && (!desde || fechaISO >= desde) && (!hasta || fechaISO <= hasta);
    if (!fechaISO) return rangoFecha === 'Todas'; // chats sin fecha: solo en "Todas"
    if (rangoFecha === 'Hoy') return fechaISO === hoy;
    if (rangoFecha === 'Ayer') return fechaISO === ayer;
    if (rangoFecha === '7 días') return fechaISO >= hace7;
    return true;
  };
  const pasaEstado = (c: (typeof df.crmChats)[number]) => {
    if (estadoPill === 'noleidos') return c.sinResponder > 0;
    if (estadoPill === 'envivo') return c.live;
    if (estadoPill === 'esperando') return !c.live;
    return true;
  };
  const chatsFiltrados = df.crmChats.filter(
    (c) => (!filtroEtiqueta || c.etiqueta === filtroEtiqueta) && (!q || c.nombre.toLowerCase().includes(q) || c.tel.toLowerCase().includes(q)) && pasaFecha(c.fechaISO) && pasaEstado(c),
  );
  // Carga por tandas: solo montamos los primeros ~15 chats y vamos agregando al
  // bajar (ver useLazyList). Con muchos chats esto es lo que evita la lentitud.
  const { count: visibles, rootRef: listaRef } = useLazyList(
    chatsFiltrados.length,
    `${q}|${filtroEtiqueta}|${rangoFecha}|${desde}|${hasta}|${estadoPill}`,
  );
  const chatsVisibles = chatsFiltrados.slice(0, visibles);
  const cuentaEtiqueta = (et: string) => df.crmChats.filter((c) => c.etiqueta === et).length;
  const pillsEstado: { key: EstadoPill; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: df.crmChats.length },
    { key: 'noleidos', label: 'No leídos', count: df.crmChats.filter((c) => c.sinResponder > 0).length },
    { key: 'esperando', label: 'Esperando', count: df.crmChats.filter((c) => !c.live).length },
    { key: 'envivo', label: 'En vivo', count: df.crmChats.filter((c) => c.live).length },
  ];
  return (
    <section data-screen-label="CRM">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Inbox · Chats en vivo</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 14px' }}>Lo que pasa ahora mismo en tu WhatsApp. Entra a un chat si quieres tomar el control.</p>

      {/* Estado del chat, de un vistazo: cuántos, cuántos sin leer, cuántos esperan. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {pillsEstado.map((p) => {
          const activo = estadoPill === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setEstadoPill(p.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid ' + (activo ? 'var(--df-brand)' : 'var(--df-border)'),
                background: activo ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', color: activo ? 'var(--df-brand-dark)' : 'var(--df-text-secondary)',
                borderRadius: 999, padding: '6px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              }}
            >
              {p.label}
              <span style={{ background: activo ? 'var(--df-brand)' : 'var(--df-surface-2)', color: activo ? '#fff' : 'var(--df-text-muted)', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{p.count}</span>
            </button>
          );
        })}
      </div>

      {/* Todos los filtros en una sola fila compacta: búsqueda + menús desplegables. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nombre o teléfono…" width={240} />
        <FilterSelect
          label="Etiqueta"
          value={filtroEtiqueta}
          onChange={setFiltroEtiqueta}
          options={[{ value: '', label: 'Todas' }, ...df.etiquetasCrm.map((et) => ({ value: et, label: et, count: cuentaEtiqueta(et) }))]}
        />
        <FilterSelect
          label="Fecha"
          value={rangoFecha}
          onChange={(v) => { if (v !== 'Personalizado') { setDesde(''); setHasta(''); } setRangoFecha(v as typeof rangoFecha); }}
          options={[
            { value: 'Todas', label: 'Todas' },
            { value: 'Hoy', label: 'Hoy' },
            { value: 'Ayer', label: 'Ayer' },
            { value: '7 días', label: 'Últimos 7 días' },
            { value: 'Personalizado', label: 'Rango personalizado…' },
          ]}
        />
        {custom && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} title="Desde"
              style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--df-text-body)' }} />
            <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>→</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} title="Hasta"
              style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--df-text-body)' }} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* Registro GENERAL de la tienda (todos los chats). El de un chat puntual está dentro del chat. */}
        <button
          onClick={() => df.abrirLogs()}
          title="Ver el registro de actividad y errores de toda la tienda"
          style={{ background: 'transparent', border: 'none', color: 'var(--df-text-faint)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 6px' }}
        >
          🩺 Registro general
        </button>
      </div>

      <ActivityLog df={df} />

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
        <div ref={listaRef} style={{ minWidth: 0, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'auto', maxHeight: 'min(70vh, 620px)', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {chatsFiltrados.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 13 }}>
              Ningún chat coincide con el filtro.
            </div>
          )}
          {chatsVisibles.map((c) => (
            <div key={c.id} onClick={c.select} style={c.crmRowStyle}>
              <div style={c.avatarStyle}>{c.iniciales}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
                  {c.canal === 'web' && <span title="Llegó por el chat web" style={{ fontSize: 11 }}>🌐</span>}
                  {c.canal === 'messenger' && <span title="Facebook Messenger" style={{ fontSize: 11 }}>💬</span>}
                  {c.canal === 'instagram' && <span title="Instagram DM" style={{ fontSize: 11 }}>📸</span>}
                  {c.anuncio && (c.anuncio.titular || c.anuncio.id || c.anuncio.url) && <span title={`Vino del anuncio: ${c.anuncio.titular || 'campaña'}`} style={{ fontSize: 11 }}>📢</span>}
                  {c.etiquetaStyle && <span style={c.etiquetaStyle}>{c.etiqueta}</span>}
                  <span style={{ color: c.sinResponder ? 'var(--df-brand)' : 'var(--df-text-faint)', fontWeight: c.sinResponder ? 700 : 400, fontSize: 11.5, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{c.fechaHoraLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ color: c.sinResponder ? 'var(--df-text)' : 'var(--df-text-muted)', fontWeight: c.sinResponder ? 600 : 400, fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.ultimo}</div>
                  {c.sinResponder > 0 && (
                    <span title={`${c.sinResponder} mensaje(s) sin responder`} style={{ flexShrink: 0, minWidth: 18, height: 18, borderRadius: 999, background: 'var(--df-brand-mid)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.sinResponder}</span>
                  )}
                </div>
                <div style={c.liveStyle}>
                  <span style={c.liveDot} />
                  <span>{c.liveLabel}</span>
                  <span style={{ color: 'var(--df-text-faint)', fontWeight: 500 }}>· atiende {c.asignado}</span>
                </div>
              </div>
            </div>
          ))}
          {chatsFiltrados.length > visibles && (
            <div style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 12 }}>
              Baja para ver {chatsFiltrados.length - visibles} chat{chatsFiltrados.length - visibles === 1 ? '' : 's'} más…
            </div>
          )}
        </div>

        {chat && (
          <div style={{ position: 'relative', minWidth: 0 }}>
          <div style={{ minWidth: 0, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', height: 'min(70vh, 620px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--df-border)' }}>
              <div
                onClick={() => setPanelCliente((v) => !v)}
                title="Ver información del cliente"
                className="df-row-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderRadius: 8, padding: '4px 6px', margin: '-4px -6px' }}
              >
                <div style={chat.avatarStyle}>{chat.iniciales}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{chat.nombre}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: 'var(--df-text-muted)' }}>{chat.tel}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--df-text-faint)', transform: panelCliente ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </div>
              <div style={chat.liveStyle}>
                <span style={chat.liveDot} />
                <span>{chat.liveLabel}</span>
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => df.abrirLogs(String(chat.id), chat.nombre)}
                title="Ver el registro de actividad de ESTE chat"
                style={{ background: 'var(--df-surface)', color: 'var(--df-text-secondary)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                🩺 Registro
              </button>
              <button
                onClick={df.resetChat}
                title="Borra el historial y devuelve el chat al asistente"
                style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                Reiniciar
              </button>
              <button
                onClick={df.requestDeleteChat}
                title="Elimina este chat por completo"
                style={
                  df.crmDeleteArmed
                    ? { background: 'var(--df-danger)', color: '#fff', border: '1px solid var(--df-danger)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                    : { background: 'var(--df-surface)', color: 'var(--df-danger)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                }
              >
                {df.crmDeleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar'}
              </button>
            </div>

            <div ref={scrollRef} style={{ flex: 1, background: 'var(--df-bg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {chat.anuncio && (chat.anuncio.titular || chat.anuncio.id || chat.anuncio.url) && <AnuncioCard anuncio={chat.anuncio} />}
              {chat.mensajesDecorated.map((m, i) => {
                const prev = chat.mensajesDecorated[i - 1];
                const nuevoDia = !!m.fecha && m.fecha !== (prev?.fecha || '');
                return (
                  <div key={i}>
                    {nuevoDia && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 10px' }}>
                        <span style={{ background: 'var(--df-border)', color: 'var(--df-text-secondary)', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 12px' }}>{m.fechaEtiqueta}</span>
                      </div>
                    )}
                    <div style={m.rowStyle}>
                      <div style={m.bubbleStyle}>
                        <MediaContent m={m} />
                        <span style={m.horaStyle}>
                          {m.hora}
                          {m.estadoInfo && <span title={m.estadoInfo.titulo} style={{ color: m.estadoInfo.color, marginLeft: 5, fontWeight: 700 }}>{m.estadoInfo.texto}</span>}
                          {m.estado === 'fallido' && m.id && (
                            <span
                              onClick={() => df.reenviarMensaje(m.id!)}
                              title="Reenviar este mensaje"
                              style={{ marginLeft: 8, cursor: 'pointer', fontWeight: 700, color: m.de === 'vendedor' ? '#fff' : 'var(--df-danger)', textDecoration: 'underline' }}
                            >
                              {df.reenviandoMsg === m.id ? 'Reenviando…' : '↻ Reenviar'}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {df.crmTyping && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ background: 'var(--df-brand-subtle)', border: '1px solid var(--df-brand-border)', borderRadius: '12px 12px 4px 12px', padding: '9px 14px', fontSize: 13, color: 'var(--df-brand-dark)' }}>
                    El asistente está escribiendo…
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--df-border)' }}>
              {df.crmNotIntervening && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--df-text-muted)', fontSize: 13, flex: 1 }}>El asistente está atendiendo este chat.</span>
                  <button
                    onClick={df.intervene}
                    style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Intervenir yo
                  </button>
                </div>
              )}
              {df.crmIntervening && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AttachButton onFile={df.sendCrmMedia} size={40} />
                  <FlujosButton df={df} size={40} />
                  <VoiceRecorder onRecorded={df.sendCrmMedia} size={40} />
                  <input
                    className="df-input"
                    value={df.crmDraft}
                    onChange={(e) => df.setCrmDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') df.sendCrm();
                    }}
                    onPaste={(e) => { const fs = archivosDePortapapeles(e); if (fs.length) { e.preventDefault(); fs.forEach(df.sendCrmMedia); } }}
                    placeholder="Escribe tu mensaje… (o pega una imagen/audio/video)"
                    style={{ flex: 1, border: '1px solid var(--df-border)', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={df.sendCrm}
                    className="df-btn-primary"
                    style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Enviar
                  </button>
                  <button
                    onClick={df.backToBot}
                    style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '11px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Devolver al asistente
                  </button>
                </div>
              )}
              {df.crmSendWarn && (
                <div style={{ color: 'var(--df-warning)', fontSize: 12.5, marginTop: 8 }}>
                  Guardado en el CRM, pero no salió por WhatsApp: {df.crmSendWarn}
                </div>
              )}
              {df.flujoMsg && (
                <div style={{ color: df.flujoMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.flujoMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)', fontSize: 12.5, marginTop: 8 }}>
                  {df.flujoMsg}
                </div>
              )}
            </div>
          </div>

          {/* Panel del cliente: se despliega al hacer clic en el nombre, flotando SOBRE
              el chat (no le quita ancho) — se cierra con la ✕, clic afuera o el nombre de nuevo. */}
          {panelCliente && (
            <>
              <div onClick={() => setPanelCliente(false)} style={{ position: 'absolute', inset: 0, zIndex: 24 }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 280, zIndex: 25, minWidth: 0, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 20px 50px -15px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', gap: 16, padding: 16, height: 'min(70vh, 620px)', overflowY: 'auto' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Información del cliente</div>
                <div style={{ flex: 1 }} />
                <span onClick={() => setPanelCliente(false)} title="Cerrar" style={{ cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 15, lineHeight: 1 }}>✕</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={chat.avatarStyle}>{chat.iniciales}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.nombre}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: 'var(--df-text-muted)' }}>{chat.tel}</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8 }}>Etiqueta</div>
              <Dropdown
                ariaLabel="Etiqueta esta conversación"
                value={chat.etiqueta || ''}
                onChange={(v) => df.setLeadEtiqueta(chat.id, v)}
                options={[{ value: '', label: '🏷️ Sin etiqueta' }, ...df.etiquetasCrm.map((et) => ({ value: et, label: et }))]}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8 }}>Acciones rápidas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <button
                  onClick={() => { df.setOrderQuery(chat.tel); df.go('pedidos'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-body)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                >
                  🛒 Ver pedidos de este cliente
                </button>
                <button
                  onClick={() => df.abrirCrearPedido({ cliente: chat.nombre, tel: chat.tel })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-body)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                >
                  🧾 Crear pedido para él/ella
                </button>
                <button
                  onClick={() => { setPanelCliente(false); df.abrirCompletarPedido(chat.id); }}
                  title="Lee el pedido de este chat con IA y completa/corrige el pedido existente"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-body)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                >
                  ✅ Completar pedido desde el chat
                </button>
                <button
                  onClick={() => df.setLeadOptin(chat.id, !df.crmOptin)}
                  title="Marca si este cliente aceptó recibir promociones. El remarketing solo se envía a quien dio su consentimiento (evita reportes y baneos)."
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: df.crmOptin ? 'var(--df-brand-soft, rgba(52,211,153,.12))' : 'var(--df-surface)', border: `1px solid ${df.crmOptin ? 'var(--df-brand)' : 'var(--df-border)'}`, color: 'var(--df-text-body)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                >
                  {df.crmOptin ? '🔔 Acepta promociones (opt-in ✓)' : '🔕 Sin opt-in de promociones'}
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginBottom: 5 }}>Asignar a…</div>
                <Dropdown
                  ariaLabel="Asignar este chat a"
                  value={chat.asignado}
                  onChange={(v) => df.asignarChatCrm(chat.id, v)}
                  options={df.team.map((m) => ({ value: m.nombre, label: m.nombre }))}
                  placeholder={chat.asignado}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8 }}>Notas internas</div>
              <textarea
                className="df-input"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={() => { if (chat && nota !== (chat.notaInterna || '')) df.guardarNotaInterna(chat.id, nota); }}
                placeholder="Solo la ve tu equipo, nunca el cliente…"
                rows={5}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: 10, fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }}
              />
              {df.notaInternaMsg && <div style={{ fontSize: 11.5, color: 'var(--df-brand-dark)', marginTop: 4 }}>{df.notaInternaMsg}</div>}
            </div>
              </div>
            </>
          )}
          </div>
        )}
      </div>
    </section>
  );
}
