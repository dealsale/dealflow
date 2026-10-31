import { PresenciaChat, PresenciaEnLista } from '../components/PresenciaChat';
import { clicAparte } from '../components/EnlaceApp';
import { IniciarConversacion } from '../components/IniciarConversacion';
import { apiAnuncioProducto, apiVincularAnuncio, plantillaPideDatos, type PlantillaAprobada } from '../lib/api';
import { LlenarPlantilla } from '../components/LlenarPlantilla';
import { CargandoChat } from '../components/CargandoChat';
import { urlDe, useRecordado } from '../lib/rutas';
import { useVentana24h, BarraVentanaCerrada, AvisoVentana } from '../components/Ventana24h';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import skyMascota from '../assets/sky-mascota.png';
import { IcoBuscar, IcoRayo } from '../components/iconosNoche';
import { claseEstado, confirmacionDe } from '../lib/noche';
import { AttachButton, MediaContent } from '../components/MediaBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Dropdown } from '../components/Dropdown';
import { ActivityLog } from '../components/ActivityLog';
import { useLazyList } from '../hooks/useLazyList';
import { CajaMensaje } from '../components/CajaMensaje';
import { BloquearContacto } from '../components/BloquearContacto';
import type { DealFlowState, DecoratedMensaje } from '../hooks/useDealFlowState';
import type { Anuncio } from '../types';

type EstadoPill = 'todos' | 'noleidos' | 'envivo' | 'esperando';

/**
 * Etiqueta de atribución de campaña: muestra de qué anuncio (pauta) llegó el chat,
 * con miniatura y un botón para abrir el anuncio directo. Solo aparece cuando el
 * cliente entró por una pauta (Click-to-WhatsApp / Messenger / Instagram).
 */
export function AnuncioCard({ anuncio, productos }: { anuncio: Anuncio; productos?: { id: number | string; nombre: string }[] }) {
  const titulo = anuncio.titular || 'Anuncio de campaña';
  // Producto del anuncio: con esto el bot manda su mensaje inicial aunque el cliente no escriba el disparador.
  const [prod, setProd] = useState<{ productId: string; auto: boolean } | null>(null);
  const [guardado, setGuardado] = useState(false);
  useEffect(() => { if (anuncio.id) void apiAnuncioProducto(anuncio.id).then((r) => r.data && setProd(r.data)); }, [anuncio.id]);
  const elegir = (pid: string) => {
    if (!anuncio.id) return;
    setProd({ productId: pid, auto: false });
    void apiVincularAnuncio(anuncio.id, pid, anuncio.titular || '').then((r) => { if (!r.error) { setGuardado(true); setTimeout(() => setGuardado(false), 1600); } });
  };
  return (
    <div style={{ alignSelf: 'center', maxWidth: 460, width: '100%', background: 'var(--df-brand-subtle)', border: '1px solid var(--df-brand-border)', borderRadius: 10, padding: 10, marginBottom: 4, boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
    {anuncio.id && productos && productos.length > 0 && prod && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--df-brand-border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-brand-dark)' }}>Producto del anuncio:</span>
        <div style={{ flex: 1, minWidth: 170 }}>
          <Dropdown ariaLabel="Producto de este anuncio" value={prod.productId} onChange={elegir}
            options={[{ value: '', label: 'Sin vincular' }, ...productos.map((p) => ({ value: String(p.id), label: p.nombre }))]} />
        </div>
        <span style={{ fontSize: 11, color: guardado ? 'var(--df-brand-dark)' : 'var(--df-text-faint)', fontWeight: guardado ? 700 : 400 }}>
          {guardado ? '✓ Guardado' : prod.productId ? (prod.auto ? '⚡ detectado solo' : 'Llegan sin disparador → su mensaje inicial') : 'Vincúlalo para enviar su mensaje inicial'}
        </span>
      </div>
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
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [llenar, setLlenar] = useState<PlantillaAprobada | null>(null);
  const [syncMsg, setSyncMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const actualizar = () => { setSyncMsg('Consultando Meta…'); void df.actualizarPlantillasMeta().then(setSyncMsg); };
  const cerrar = () => { setOpen(false); setVerProductos(false); setVerPlantillas(false); setLlenar(null); };
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cerrar(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', color: 'var(--tinta)', fontFamily: 'inherit' };
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Enviar mensaje inicial o plantilla"
        aria-label="Flujos y plantillas"
        className={`icono-btn${open ? ' on' : ''}`}
        style={{ width: size, height: size, color: 'var(--ambar)' }}
      ><IcoRayo /></button>
      {open && (
        <div style={{ position: 'absolute', bottom: size + 8, left: 0, width: llenar ? 300 : 300, maxHeight: llenar ? 460 : 340, overflowY: 'auto', background: 'var(--noche2)', border: '1px solid var(--linea2)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,.5)', zIndex: 60, padding: 6 }}>
          {verProductos ? (
            <>
              <button onClick={() => setVerProductos(false)} style={{ ...item, fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ Elige el producto</button>
              {df.flujoProductos.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--df-text-muted)' }}>No tienes productos aún.</div>}
              {df.flujoProductos.map((p) => (
                <button key={p.id} onClick={() => { df.enviarFlujoInicial(p.id); setOpen(false); setVerProductos(false); }} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(154,168,201,.1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 15 }}>🛍️</span>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
                </button>
              ))}
            </>
          ) : llenar ? (
            <LlenarPlantilla p={llenar} leadId={String(df.crmChat?.id ?? '')} nombreCliente={(df.crmChat?.nombre || '').split(' ')[0]} onVolver={() => setLlenar(null)}
              onEnviar={(params, extra) => { df.enviarPlantillaAChat(llenar.id, params, extra); cerrar(); }} />
          ) : verPlantillas ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button onClick={() => setVerPlantillas(false)} style={{ ...item, width: 'auto', flex: 1, fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ Elige la plantilla</button>
                <button onClick={actualizar} title="Trae las plantillas que aprobaste en Meta" style={{ background: 'none', border: '1px solid var(--df-border)', borderRadius: 7, padding: '4px 7px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--df-brand-dark)', cursor: 'pointer', whiteSpace: 'nowrap' }}>↻ Actualizar desde Meta</button>
              </div>
              {syncMsg && <div style={{ padding: '2px 10px 6px', fontSize: 11.5, fontWeight: 600, color: syncMsg.startsWith('⚠') ? 'var(--df-danger-dark)' : 'var(--df-brand-dark)' }}>{syncMsg}</div>}
              <div style={{ padding: '2px 10px 8px', fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.45 }}>Las plantillas aprobadas SÍ se pueden enviar aunque hayan pasado las 24 h.</div>
              {df.plantillasAprobadas.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--df-text-muted)' }}>No tienes plantillas aprobadas todavía. Si ya te las aprobaron en Meta, toca <b>↻ Actualizar desde Meta</b>.</div>}
              {df.plantillasAprobadas.map((t) => (
                <button key={t.id} onClick={() => { if (plantillaPideDatos(t)) { setLlenar(t); return; } df.enviarPlantillaAChat(t.id); cerrar(); }} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(154,168,201,.1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 15 }}>{t.encabezadoTipo === 'IMAGE' ? '🖼️' : t.encabezadoTipo === 'VIDEO' ? '🎬' : t.encabezadoTipo === 'DOCUMENT' ? '📄' : '📋'}</span>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nombre}{t.origen === 'meta' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--df-text-faint)', marginLeft: 5 }}>· Meta</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.cuerpo}</div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              <span className="eti" style={{ display: 'block', padding: '6px 10px 4px', fontSize: 10 }}>Flujos</span>
              <button onClick={() => setVerProductos(true)} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(154,168,201,.1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 17 }}>📣</span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Mensaje inicial</div>
                  <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Envía la presentación de un producto</div>
                </div>
                <span style={{ color: 'var(--df-text-faint)' }}>›</span>
              </button>
              <button onClick={() => setVerPlantillas(true)} style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(154,168,201,.1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 17 }}>📋</span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Plantillas aprobadas</div>
                  <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Mensajes que llegan aun pasadas las 24 h</div>
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

const ORIGEN_CHAT: Record<string, string> = { whatsapp: 'WhatsApp', web: 'Chat web', messenger: 'Messenger', instagram: 'Instagram' };
const ICONO_CANAL: Record<string, string> = { web: '🌐', messenger: '💬', instagram: '📸' };
const ultimos10 = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);

/**
 * Inbox (diseño "Noche"): chips de estado + buscador, y tres columnas: lista de
 * chats, conversación y datos del cliente (último pedido, acciones, notas).
 */
export function CRM({ df }: { df: DealFlowState }) {
  const chat = df.crmChat;
  const ventana = useVentana24h(chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [busca, setBusca] = useState('');
  const [rangoFecha, setRangoFecha] = useState<'Todas' | 'Hoy' | 'Ayer' | '7 días' | 'Personalizado'>('Todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estadoPill, setEstadoPill] = useRecordado<EstadoPill>('inbox:estado', 'todos');
  const [nota, setNota] = useState('');
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.tel, chat?.mensajesDecorated.length]);
  useEffect(() => { setNota(chat?.notaInterna || ''); }, [chat?.id]);
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

  // Último pedido de este cliente (por chat o por celular), para la columna de la derecha.
  const ultimoPedido = useMemo(() => {
    if (!chat) return null;
    const tel = ultimos10(chat.tel);
    const mios = df.allOrders.filter((o) => (o.leadId && String(o.leadId) === String(chat.id)) || (tel && ultimos10(o.tel) === tel));
    return mios.sort((a, b) => `${b.fecha || ''} ${b.hora || ''}`.localeCompare(`${a.fecha || ''} ${a.hora || ''}`))[0] || null;
  }, [chat?.id, chat?.tel, df.allOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombreDe = (m: DecoratedMensaje) => (m.de === 'cliente' ? '' : m.de === 'bot' ? ' · asistente' : ' · tú');

  return (
    <section data-screen-label="CRM" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Inbox</span>
          <h1>Chats en vivo</h1>
          <p className="sub">Lo que pasa ahora mismo en tu WhatsApp, Messenger e Instagram. Entra a un chat si quieres tomar el control.</p>
        </div>
        <div className="fila">
          {df.puede('iniciar_conversacion') && <IniciarConversacion onAbrirChat={(id) => df.abrirChat(id)} />}
          {/* Registro GENERAL de la tienda (todos los chats). El de un chat puntual está dentro del chat. */}
          <button type="button" className="btn btn-sec" onClick={() => df.abrirLogs()} title="Ver el registro de actividad y errores de toda la tienda">🩺 Registro general</button>
        </div>
      </div>

      <div className="fila" role="group" aria-label="Filtros">
        {pillsEstado.map((p) => (
          <button key={p.key} type="button" className={`chip${estadoPill === p.key ? ' activa' : ''}`} onClick={() => setEstadoPill(p.key)}>{p.label} <span className="n">{p.count}</span></button>
        ))}
        <div className="buscar" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <IcoBuscar />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar chat" />
        </div>
        <Dropdown ariaLabel="Filtrar por etiqueta" value={filtroEtiqueta} onChange={setFiltroEtiqueta} width={150}
          options={[{ value: '', label: 'Todas las etiquetas' }, ...df.etiquetasCrm.map((et) => ({ value: et, label: `${et} (${cuentaEtiqueta(et)})` }))]} />
        <Dropdown ariaLabel="Filtrar por fecha" value={rangoFecha} width={150}
          onChange={(v) => { if (v !== 'Personalizado') { setDesde(''); setHasta(''); } setRangoFecha(v as typeof rangoFecha); }}
          options={[{ value: 'Todas', label: 'Todas las fechas' }, { value: 'Hoy', label: 'Hoy' }, { value: 'Ayer', label: 'Ayer' }, { value: '7 días', label: 'Últimos 7 días' }, { value: 'Personalizado', label: 'Rango personalizado…' }]} />
        {custom && (
          <div className="fila" style={{ gap: 6 }}>
            <input className="entrada" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} title="Desde" style={{ width: 150 }} />
            <span className="tenue" style={{ fontSize: 12 }}>→</span>
            <input className="entrada" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} title="Hasta" style={{ width: 150 }} />
          </div>
        )}
      </div>

      <ActivityLog df={df} />

      <div className={`inbox${chat ? '' : ' sin-lateral'}`}>
        <section ref={listaRef} className="tarjeta" style={{ padding: '6px 0', gap: 0, maxHeight: 'min(72vh, 680px)', overflowY: 'auto' }} aria-label="Lista de chats">
          {chatsFiltrados.length === 0 && <div className="vacio" style={{ margin: 10 }}>Ningún chat coincide con el filtro.</div>}
          {chatsVisibles.map((c) => (
            <button key={c.id} type="button" {...clicAparte(urlDe({ mode: 'vendedor', section: 'crm', chat: String(c.id) }), c.select)} className={`chat-item${chat?.id === c.id ? ' sel' : ''}`} title="Ctrl + clic para abrir en otra pestaña">
              <span className="avatar ne" style={c.avatarStyle}>{c.iniciales}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.sinResponder ? 800 : 600 }}>{c.nombre}</b>
                  {ICONO_CANAL[c.canal || ''] && <span title={ORIGEN_CHAT[c.canal || '']} style={{ fontSize: 11 }}>{ICONO_CANAL[c.canal || '']}</span>}
                  {c.anuncio && (c.anuncio.titular || c.anuncio.id || c.anuncio.url) && <span title={`Vino del anuncio: ${c.anuncio.titular || 'campaña'}`} style={{ fontSize: 11 }}>📢</span>}
                  {c.etiqueta && <span className="pill neutro sin" style={{ padding: '1px 7px', fontSize: 10.5 }}>{c.etiqueta}</span>}
                  <span className={`mono ${c.sinResponder ? 'ok' : 'tenue'}`} style={{ marginLeft: 'auto', fontSize: 10.5, whiteSpace: 'nowrap' }}>{c.fechaHoraLabel}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={c.sinResponder ? '' : 'suave-t'} style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, fontWeight: c.sinResponder ? 600 : 400 }} translate="no">{c.ultimo}</span>
                  {c.sinResponder > 0 && <span className="sinleer" title={`${c.sinResponder} mensaje(s) sin leer`}>{c.sinResponder}</span>}
                </span>
                <span className="tenue" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 6, height: 6, borderRadius: '50%', background: c.live ? 'var(--esm2)' : 'var(--ambar)', display: 'inline-block' }} />{c.liveLabel} · atiende {c.asignado}
                  <span style={{ marginLeft: 'auto' }}><PresenciaEnLista chatId={String(c.id)} /></span>
                </span>
              </span>
            </button>
          ))}
          {chatsFiltrados.length > visibles && (
            <div className="tenue" style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12 }}>Baja para ver {chatsFiltrados.length - visibles} chat{chatsFiltrados.length - visibles === 1 ? '' : 's'} más…</div>
          )}
        </section>

        {!chat && (
          <section className="tarjeta" style={{ minHeight: 420, justifyContent: 'center' }} aria-label="Conversación">
            <div className="vacio" style={{ border: 0 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>💬</div>
              Elige un chat de la lista para leerlo. El asistente sigue atendiendo mientras tanto.
            </div>
          </section>
        )}

        {chat && (
          <section className="tarjeta" style={{ padding: 0, gap: 0, height: 'min(72vh, 680px)', overflow: 'hidden', position: 'relative' }} aria-label="Conversación">
            <div className="fila" style={{ gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--linea)' }}>
              <span className="avatar ne" style={chat.avatarStyle}>{chat.iniciales}</span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{chat.nombre}</b>
                <div className="tenue mono" style={{ fontSize: 11 }}>{chat.tel} · {ORIGEN_CHAT[chat.canal || 'whatsapp'] || chat.canal}</div>
              </div>
              <span className={`pill ${chat.live ? 'ok' : 'aviso'} chica`}>{chat.liveLabel}</span>
              <div className="fila" style={{ marginLeft: 'auto', gap: 6 }}>
                <button type="button" className="btn btn-sec btn-chico" onClick={() => df.abrirLogs(String(chat.id), chat.nombre)} title="Ver el registro de actividad de ESTE chat">🩺 Registro</button>
                <BloquearContacto leadId={String(chat.id)} />
                <button type="button" className="btn btn-sec btn-chico" onClick={df.resetChat} title="Borra el historial y devuelve el chat al asistente">Reiniciar</button>
                <button type="button" className={`btn btn-chico ${df.crmDeleteArmed ? 'btn-mal' : 'btn-fant'}`} onClick={df.requestDeleteChat} title="Elimina este chat por completo" style={df.crmDeleteArmed ? undefined : { color: 'var(--coral)' }}>
                  {df.crmDeleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar'}
                </button>
              </div>
            </div>

            <div ref={scrollRef} translate="no" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 16px', overflowY: 'auto', background: 'radial-gradient(circle at 70% 0%, rgba(46,139,255,.08), transparent 55%)' }}>
              {chat.anuncio && (chat.anuncio.titular || chat.anuncio.id || chat.anuncio.url) && <AnuncioCard anuncio={chat.anuncio} productos={df.flujoProductos} />}
              {chat.mensajesDecorated.map((m, i) => {
                const prev = chat.mensajesDecorated[i - 1];
                const nuevoDia = !!m.fecha && m.fecha !== (prev?.fecha || '');
                const clase = m.de === 'bot' ? 'b-bot' : m.de === 'vendedor' ? 'b-vendedor' : 'b-cliente';
                return (
                  <Fragment key={m.id || i}>
                    {nuevoDia && <span className="mono tenue" style={{ alignSelf: 'center', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' }}>{m.fechaEtiqueta}</span>}
                    <div className={`burbuja ${clase}`}>
                      {m.citaTexto && (
                        <div style={{ borderLeft: '3px solid ' + (m.de === 'vendedor' ? 'rgba(255,255,255,.6)' : 'var(--cian)'), background: 'rgba(0,0,0,.18)', borderRadius: 6, padding: '4px 8px', marginBottom: 6, fontSize: 12, opacity: 0.9 }}>
                          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 1 }}>{m.citaDe === 'cliente' ? 'Cliente' : m.citaDe === 'bot' ? 'Asistente' : 'Tú'}</div>
                          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 260 }}>{m.citaTexto}</div>
                        </div>
                      )}
                      <MediaContent m={m} />
                      <span className="hora">
                        {m.hora}{nombreDe(m)}
                        {m.estadoInfo && <span title={m.estadoInfo.titulo} style={{ marginLeft: 5, fontWeight: 700 }}>{m.estadoInfo.texto}</span>}
                        {m.estado === 'fallido' && m.id && (
                          <span onClick={() => df.reenviarMensaje(m.id!)} title="Reenviar este mensaje" style={{ marginLeft: 8, cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}>
                            {df.reenviandoMsg === m.id ? 'Reenviando…' : '↻ Reenviar'}
                          </span>
                        )}
                      </span>
                      {(m.estado === 'fallido' || m.estado === 'bloqueado') && m.error && (
                        <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.4, padding: '5px 8px', borderRadius: 6, background: 'rgba(255,107,138,.18)', color: m.de === 'vendedor' ? '#fff' : 'var(--coral)', maxWidth: 320 }}>⚠ {m.error}</div>
                      )}
                    </div>
                  </Fragment>
                );
              })}
              {df.crmTyping && <div className="burbuja b-bot" style={{ fontSize: 13 }}>El asistente está escribiendo…</div>}
            </div>

            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--linea)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {df.crmNotIntervening && (
                <div className="fila" style={{ gap: 12, background: 'rgba(118,88,255,.12)', border: '1px solid rgba(183,93,255,.3)', borderRadius: 12, padding: '10px 14px' }}>
                  <img src={skyMascota} alt="" style={{ width: 30, height: 30 }} />
                  <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>El asistente está atendiendo este chat. Si intervienes, él deja de responder hasta que se lo devuelvas.</span>
                  <button type="button" className="btn btn-sec btn-chico" onClick={df.intervene}>Intervenir yo</button>
                </div>
              )}
              <PresenciaChat chatId={String(chat.id)} />
              {df.crmIntervening && ventana.cerrada && (
                <BarraVentanaCerrada plantillas={<FlujosButton df={df} size={40} />} extra={<button type="button" className="btn btn-fant btn-chico" onClick={df.backToBot}>Devolver al asistente</button>} />
              )}
              {df.crmIntervening && !ventana.cerrada && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AttachButton onFile={df.sendCrmMedia} size={36} />
                  <FlujosButton df={df} size={36} />
                  <VoiceRecorder onRecorded={df.sendCrmMedia} size={36} />
                  <CajaMensaje
                    chatId={String(chat.id)}
                    onSend={df.sendCrm}
                    onFile={df.sendCrmMedia}
                    nombreCliente={chat.nombre}
                    botonSize={36}
                    placeholder="Escribe tu mensaje… ( / mensajes rápidos · Shift+Enter nueva línea)"
                    inputStyle={{ background: 'var(--noche)', border: '1px solid var(--linea2)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--tinta)' }}
                    botonStyle={{ background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  />
                </div>
              )}
              {df.crmIntervening && !ventana.cerrada && (
                <div className="fila" style={{ gap: 10 }}>
                  <button type="button" className="btn btn-fant btn-chico" onClick={df.backToBot}>↩ Devolver al asistente</button>
                  <AvisoVentana restante={ventana.restante} />
                </div>
              )}
              {df.crmSendWarn && !(ventana.cerrada && df.crmSendWarn.startsWith('⛔')) && (
                <div className="aviso" style={{ fontSize: 12.5 }}>
                  {df.crmSendWarn.startsWith('⛔') ? df.crmSendWarn : `Guardado en el CRM, pero no salió por WhatsApp: ${df.crmSendWarn}`}
                </div>
              )}
              <CargandoChat texto={df.flujoMsg} />
            </div>
          </section>
        )}

        {chat && (
          <aside className="tarjeta" style={{ gap: 14, maxHeight: 'min(72vh, 680px)', overflowY: 'auto' }} aria-label="Datos del cliente">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="avatar ne" style={{ ...chat.avatarStyle, width: 44, height: 44, fontSize: 16 }}>{chat.iniciales}</span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15, fontFamily: 'var(--display)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.nombre}</b>
                <div className="tenue" style={{ fontSize: 12 }}>{ORIGEN_CHAT[chat.canal || 'whatsapp'] || chat.canal}{chat.anuncio?.titular ? ` · 📢 ${chat.anuncio.titular}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Celular</span><b className="mono">{chat.tel}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Etapa</span><b>{chat.etapa}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="suave-t">Atiende</span>
                <div style={{ width: 150 }}><Dropdown ariaLabel="Asignar este chat a" value={chat.asignado} onChange={(v) => df.asignarChatCrm(chat.id, v)} options={df.team.map((m) => ({ value: m.nombre, label: m.nombre }))} placeholder={chat.asignado} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="suave-t">Etiqueta</span>
                <div style={{ width: 150 }}><Dropdown ariaLabel="Etiqueta esta conversación" value={chat.etiqueta || ''} onChange={(v) => df.setLeadEtiqueta(chat.id, v)} options={[{ value: '', label: '🏷️ Sin etiqueta' }, ...df.etiquetasCrm.map((et) => ({ value: et, label: et }))]} /></div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--linea)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="tarjeta-cab"><h3>Último pedido</h3>{ultimoPedido && <button type="button" className="mono enlace" onClick={ultimoPedido.open} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{ultimoPedido.id} →</button>}</div>
              {ultimoPedido ? (
                <>
                  <p style={{ fontSize: 13 }}>{ultimoPedido.itemsResumen}<br /><span className="suave-t">{ultimoPedido.ciudad}{ultimoPedido.direccion ? ` · ${ultimoPedido.direccion}` : ''}</span></p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <b className="mono">{ultimoPedido.totalFmt}</b>
                    <span className="fila" style={{ gap: 4 }}>
                      <span className={`pill ${confirmacionDe(ultimoPedido).clase} chica`}>{confirmacionDe(ultimoPedido).texto}</span>
                      <span className={`pill ${claseEstado(ultimoPedido.estado)} chica`}>{ultimoPedido.estado}</span>
                    </span>
                  </div>
                </>
              ) : <p className="tenue" style={{ fontSize: 12.5 }}>Este cliente todavía no tiene pedidos.</p>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" className="btn btn-pri" onClick={() => df.abrirCompletarPedido(chat.id)} title="Lee el pedido de este chat con IA y completa/corrige el pedido existente">Completar pedido desde el chat</button>
              <button type="button" className="btn btn-sec" onClick={() => df.abrirCrearPedido({ cliente: chat.nombre, tel: chat.tel }, chat.id)}>🧾 Crear pedido</button>
              <button type="button" className="btn btn-fant" onClick={() => { df.setOrderQuery(chat.tel); df.go('pedidos'); }}>🛒 Ver todos sus pedidos</button>
              <button type="button" className={`toggle${df.crmOptin ? ' on' : ''}`} onClick={() => df.setLeadOptin(chat.id, !df.crmOptin)} title="Marca si este cliente aceptó recibir promociones. Sirve para saber a quién puedes escribirle con ofertas sin generar reportes." style={{ fontSize: 12.5 }}>
                <i /><span>{df.crmOptin ? 'Acepta promociones (opt-in ✓)' : 'Sin opt-in de promociones'}</span>
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
              <span className="eti" style={{ fontSize: 10 }}>Nota interna · solo tu equipo</span>
              <textarea
                className="entrada"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={() => { if (chat && nota !== (chat.notaInterna || '')) df.guardarNotaInterna(chat.id, nota); }}
                placeholder="Solo la ve tu equipo, nunca el cliente…"
                rows={4}
                style={{ width: '100%', marginTop: 6, resize: 'vertical', lineHeight: 1.5 }}
              />
              {df.notaInternaMsg && <div className="ok" style={{ fontSize: 11.5, marginTop: 4 }}>{df.notaInternaMsg}</div>}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
