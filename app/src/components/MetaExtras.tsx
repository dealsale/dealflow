import { useEffect, useState } from 'react';
import { Icono, IcoTexto } from './Icono';
import { apiMetaDiagnostico, apiMetaResuscribir, apiCapi, apiConfigurarPixelMeta, apiGuardarCapi, apiCapiDetectar, apiCapiEnviar, apiAnunciosMeta, apiVincularAnuncio, type DiagnosticoMeta, type EstadoCapi, type AnuncioMeta } from '../lib/api';
import { Dropdown } from './Dropdown';
import { IntegracionFila, LogoInteg } from './IntegracionFila';
import { fmt } from '../lib/format';
import { ApiConversionesMeta } from './ApiConversionesMeta';
import { SelectorPixel } from './SelectorPixel';

import { fmtCO } from '../lib/fechaCO';
const btn: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const btnP: React.CSSProperties = { ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none', fontWeight: 700 };
const hora = (iso: string) => (iso ? fmtCO('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')) : '');

/** ¿Por qué no llegan los mensajes de Messenger? Revisa cada página y lo explica en simple. */
export function DiagnosticoMessenger() {
  const [d, setD] = useState<DiagnosticoMeta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const revisar = async (limpiar = true) => { setCargando(true); if (limpiar) setMsg(''); const r = await apiMetaDiagnostico(); setCargando(false); if (r.data) setD(r.data); else setMsg(r.error || 'No se pudo revisar.'); };
  // El resultado de suscribir se queda visible (antes "revisar" lo borraba al instante).
  const resuscribir = async () => { const r = await apiMetaResuscribir(); setMsg(r.data ? (r.data.errores.length ? `⚠️ ${r.data.errores.join(' · ')}` : `✓ ${r.data.ok} página(s) suscritas de nuevo.`) : r.error || ''); void revisar(false); };
  const algunaMal = d?.paginas.some((p) => !p.suscrita || p.faltan.length || p.error);
  return (
    <div style={{ marginTop: 12, borderTop: '1px dashed var(--df-border)', paddingTop: 12 }}>
      <button onClick={() => void revisar()} disabled={cargando} style={btn}>{cargando ? 'Revisando…' : <><IcoTexto n="buscar" tam={13} />¿No llegan los mensajes? Revisar conexión</>}</button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</div>}
      {d && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
          {d.paginas.map((p) => (
            <div key={p.pageId} style={{ border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px' }}>
              <b>{p.nombre}</b>{p.ig ? ' · con Instagram' : ''}
              <div><IcoTexto n={p.error || (p.suscrita && p.faltan.length) ? 'alerta' : p.suscrita ? 'ok' : 'error'} tam={13} color={p.error || (p.suscrita && p.faltan.length) ? '#B45309' : p.suscrita ? 'var(--df-success)' : 'var(--df-danger)'} />{p.error ? p.error : p.suscrita ? (p.faltan.length ? `Suscrita, pero faltan los avisos: ${p.faltan.join(', ')}.` : 'DealFlow está suscrito a los mensajes de esta página.') : 'DealFlow NO está suscrito a esta página.'}</div>
              {p.suscrita && !p.error && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}><IcoTexto n="chat" tam={12} />{p.campos.includes('feed') ? 'Comentarios de Facebook: activos.' : 'Comentarios de Facebook: no llegan (la app de Meta no tiene el campo «feed»). Dale «Volver a suscribir» cuando agregues el permiso.'}</div>}
              <div style={{ color: 'var(--df-text-muted)' }}>{p.ultimoAviso ? `Último aviso de Meta: ${hora(p.ultimoAviso)}` : 'Meta no ha mandado ningún aviso de esta página desde el último reinicio del servidor.'}</div>
            </div>
          ))}
          {algunaMal && <button onClick={() => void resuscribir()} style={{ ...btnP, alignSelf: 'flex-start' }}>Suscribir de nuevo</button>}
          {!algunaMal && !d.paginas.some((p) => p.ultimoAviso) && (
            <div style={{ background: 'var(--df-warning-subtle)', borderRadius: 9, padding: '10px 12px' }}>
              <b>Las páginas están bien suscritas, pero Meta no está mandando los mensajes.</b> Revisa en developers.facebook.com → tu app:
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li><b>Webhooks</b> → objeto <b>Page</b> (y <b>Instagram</b>) → URL <code>{d.urlWebhook}</code> con el mismo token de verificación de WhatsApp → suscribe <code>messages</code>, <code>messaging_postbacks</code> y <code>messaging_referrals</code>.</li>
                <li>Mientras <code>pages_messaging</code> no tenga <b>acceso avanzado</b>, Meta solo entrega los mensajes de personas con rol en la app. Prueba escribiéndole a tu página desde tu propia cuenta (administrador de la app): si ese sí llega, falta la revisión de la app para el resto de clientes.</li>
              </ol>
            </div>
          )}
          {d.ultimoMensaje && <div style={{ color: 'var(--df-text-muted)' }}>Último mensaje de Messenger/Instagram que llegó al Inbox: {hora(d.ultimoMensaje)}.</div>}
          {d.avisosDePaginasNoConectadas.length > 0 && <div style={{ color: 'var(--df-text-muted)' }}>Llegan avisos de páginas que no están conectadas en esta tienda ({d.avisosDePaginasNoConectadas.map((x) => x.id).join(', ')}): ¿conectaste otra página? Dale «Reconectar» y elígela.</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Reportar ventas a Meta (API de Conversiones). Dos caminos:
 *  1. Píxel + token (lo principal): TODA venta cerrada por chat (WhatsApp, Messenger, Instagram)
 *     llega a Meta como compra, con los datos del cliente cifrados. Funciona con QR o API oficial.
 *  2. Dataset de mensajería (opcional, solo WhatsApp API oficial): además amarra la venta al clic
 *     exacto del anuncio de «clic a WhatsApp» (más precisión en el ROAS).
 */
export function CapiCard() {
  const [e, setE] = useState<EstadoCapi | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [msg, setMsg] = useState('');
  const [dataset, setDataset] = useState('');
  const [test, setTest] = useState('');
  const [pixel, setPixel] = useState('');
  const [auto, setAuto] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');
  useEffect(() => { void apiCapi().then((r) => { if (r.data) { setE(r.data); setDataset(r.data.datasetId); setTest(r.data.testCode); setPixel(r.data.pixelVentas); } }); }, []);
  if (!e) return null;
  const guardar = async (c: Partial<EstadoCapi>) => { setMsg(''); const r = await apiGuardarCapi(c); if (r.data) setE(r.data); else setMsg(`⚠️ ${r.error}`); };
  const detectar = async () => { setMsg(''); const r = await apiCapiDetectar(); if (r.data) { setE(r.data); setDataset(r.data.datasetId); setMsg('✓ Dataset encontrado.'); } else setMsg(`⚠️ ${r.error}`); };
  const configurarAuto = async () => {
    setAuto(true); setAutoMsg('');
    const r = await apiConfigurarPixelMeta();
    setAuto(false);
    if (r.error || !r.data) { setAutoMsg(`⚠️ ${r.error || 'No se pudo configurar.'}`); return; }
    setAutoMsg(r.data.mensaje);
    const x = await apiCapi();
    if (x.data) { setE(x.data); setPixel(x.data.pixelVentas); }
  };
  const activarCtwa = async () => {
    setMsg('');
    if (!e.datasetId) {
      const r = await apiCapiDetectar();
      if (!r.data) { setMsg(`⚠️ ${r.error || 'No encontramos el conjunto de datos de tu WhatsApp. Pega su ID.'}`); return; }
      setDataset(r.data.datasetId);
    }
    await guardar({ activo: true });
    const x = await apiCapiEnviar();
    if (x.data) { setE(x.data); setMsg(`✓ Activo. ${x.data.enviados} evento(s) enviados ahora.`); }
  };
  const enviar = async () => { setMsg(''); const r = await apiCapiEnviar(); if (r.data) { setE(r.data); setMsg(`✓ Revisado: ${r.data.enviados} venta(s) enviadas ahora.`); } else setMsg(`⚠️ ${r.error}`); };
  const mensajeria = e.activo && !!e.datasetId;
  const porPixel = !!e.pixelActivo;
  const inp: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)', minWidth: 0, flex: '1 1 180px' };
  const paso: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 11, padding: 12 };
  const tit = (n: string, t: string, sub?: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}><span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', background: 'var(--df-brand)', color: '#fff', fontSize: 11, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>{n}</span>{t}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
  const radio = (v: 'pedido' | 'entregado', t: string, sub: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
      <input type="radio" checked={e.compra === v} onChange={() => void guardar({ compra: v })} style={{ marginTop: 3 }} />
      <span><b>{t}</b><br /><span style={{ color: 'var(--df-text-muted)' }}>{sub}</span></span>
    </label>
  );
  const desc = porPixel
    ? `✓ Ventas de WhatsApp → píxel ${e.pixelActivo} · ${e.ventasChat30} compras (${fmt(e.valorChat30)}) en 30 días${e.erroresChat30 ? ` · ${e.erroresChat30} con error` : ''}${mensajeria ? ' · + API de mensajería' : ''}`
    : 'Falta el píxel y su token: sin eso Meta no ve tus ventas de WhatsApp y el ROAS sale en cero.';
  return (
    <IntegracionFila
      logo={<LogoInteg fondo="linear-gradient(135deg,#1877F2,#10B981)"><Icono nombre="objetivo" tam={18} color="#fff" /></LogoInteg>}
      nombre="Reportar ventas a Meta (API de Conversiones)"
      desc={desc}
      estado={porPixel || mensajeria ? 'on' : 'off'}
      abierta={abierta}
      onToggle={() => setAbierta((v) => !v)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.55 }}>
          Cada venta que se cierra por WhatsApp, Messenger o Instagram se le reporta a Meta como <b>compra</b>, con su valor y los datos del cliente cifrados (celular, nombre, ciudad). Así Meta mide el <b>ROAS</b> y aprende a mostrar tus anuncios a gente que compra. Es automático (unos 2 minutos después de cada pedido). Las ventas de tus landings se reportan desde cada landing.
        </div>

        <div style={paso}>
          {tit('1', 'Píxel de Meta y su token', 'Es lo principal. Funciona con WhatsApp por QR o por la API oficial.')}
          {!porPixel && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--df-brand-subtle, rgba(16,185,129,.08))', border: '1px solid var(--df-brand, #10B981)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <button type="button" disabled={auto} onClick={() => void configurarAuto()} style={{ background: 'var(--df-brand)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{auto ? 'Configurando…' : <><IcoTexto n="rapido" tam={13} />Configurar mi píxel automáticamente</>}</button>
              <span style={{ fontSize: 12, color: 'var(--df-text-muted)', flex: '1 1 220px' }}>Usa el píxel de tu cuenta de Anuncios (o crea uno), lo pone en «Mi tienda» y en las ventas de WhatsApp, y lo conecta sin copiar tokens.</span>
            </div>
          )}
          {autoMsg && <div role="status" style={{ fontSize: 12.5, marginBottom: 10, color: autoMsg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{autoMsg}</div>}
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Píxel</div>
          <SelectorPixel valor={pixel} onChange={(id) => { setPixel(id); if (id !== e.pixelVentas && (id.length >= 8 || !id)) void guardar({ pixelVentas: id }); }} />
          <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', margin: '4px 0 10px' }}>Si ya lo pusiste en Tienda en línea → «Mi tienda», aparece aquí solo.</div>
          {pixel ? <ApiConversionesMeta key={pixel} pixelId={pixel} /> : <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}><IcoTexto n="rapido" tam={12} />Elige el píxel para conectarlo.</div>}
          {pixel && !porPixel && <div style={{ fontSize: 12, color: 'var(--df-warning-mid)', marginTop: 8 }}>Falta el token de este píxel: sin token no se envía nada.</div>}
        </div>

        <div style={paso}>
          {tit('2', '¿Cuándo cuenta como compra?')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {radio('pedido', 'Cuando se crea el pedido (recomendado)', 'Meta recibe la señal rápido y aprende más. Los pedidos cancelados no se reportan.')}
            {radio('entregado', 'Cuando el pedido se entrega', 'Solo cuenta lo que de verdad se cobró contra entrega. Menos señales y más tarde (máx. 7 días después).')}
          </div>
        </div>

        <div style={{ ...paso, borderColor: mensajeria ? 'var(--df-brand)' : e.whatsapp ? 'var(--df-warning-mid, #d97706)' : 'var(--df-border)' }}>
          {tit('3', 'Campañas de clic a WhatsApp', 'Meta solo le cuenta las ventas a un anuncio de clic a WhatsApp si le llegan al conjunto de datos de tu WhatsApp con el código del clic. El píxel web no sirve para eso.')}
          {!e.whatsapp ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.5, background: 'var(--df-warning-subtle, #fff7e6)', borderRadius: 8, padding: '8px 10px' }}>
              Tu WhatsApp está conectado <b>por QR</b>. DealFlow ya registra de qué anuncio llega cada chat, pero Meta solo acepta reportar ventas a campañas de clic a WhatsApp desde la <b>API oficial</b> de WhatsApp. Las ventas sí van a tu píxel (paso 1).
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: mensajeria ? 'var(--df-success)' : 'var(--df-warning-mid, #b45309)' }}>
                {mensajeria ? `✓ Activo · conjunto de datos ${e.datasetId}${e.testCode ? ' · ⚠ con código de prueba (no cuenta para las campañas)' : ''}` : e.activoManual && !e.activo ? 'Pausado por ti' : 'Sin activar: tus campañas de clic a WhatsApp no están recibiendo las ventas'}
              </div>
              {e.ctwa && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  {([['Chats de anuncios', e.ctwa.chats], ['Con código del clic', e.ctwa.chatsConClic], ['Ventas de esos chats', e.ctwa.ventasDeAnuncio], ['Enviadas a Meta', e.ctwa.enviadas]] as const).map(([t, v]) => (
                    <div key={t} style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 9px' }}>
                      <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{t} · 7 días</div>
                      <div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {e.ctwa && e.ctwa.chats > 0 && e.ctwa.chatsConClic === 0 && <div style={{ fontSize: 12, color: 'var(--df-warning-mid, #b45309)' }}>Los chats de anuncios no traen el código del clic. Pasa cuando el anuncio no es de «clic a WhatsApp» (por ejemplo, un enlace wa.me en un anuncio de tráfico): esas ventas no se pueden atribuir a la campaña.</div>}
              {e.ctwa && e.ctwa.errores > 0 && <div style={{ fontSize: 12, color: 'var(--df-danger)' }}>{e.ctwa.errores} venta(s) con error. Último: {e.ctwa.ultimoError}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!mensajeria && <button onClick={() => void activarCtwa()} style={btnP}>{e.datasetId ? 'Activar' : 'Buscar mi conjunto de datos y activar'}</button>}
                {mensajeria && <button onClick={() => void guardar({ activo: false })} style={btn}>Pausar</button>}
                <input value={dataset} onChange={(x) => setDataset(x.target.value)} onBlur={() => dataset !== e.datasetId && void guardar({ datasetId: dataset })} placeholder="ID del conjunto de datos de WhatsApp" style={inp} aria-label="ID del conjunto de datos de WhatsApp" />
                <button onClick={() => void detectar()} style={btn}>Buscarlo</button>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={e.leads} onChange={(x) => void guardar({ leads: x.target.checked })} /> Reportar también los chats calificados (el cliente respondió)
              </label>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Código de prueba (opcional)</summary>
                <input value={test} onChange={(x) => setTest(x.target.value)} onBlur={() => test !== e.testCode && void guardar({ testCode: test })} placeholder="TEST12345" style={{ ...inp, maxWidth: 220, marginTop: 6 }} />
                {e.testCode && <div style={{ fontSize: 11.5, color: 'var(--df-warning-mid)', marginTop: 4 }}>Con código de prueba Meta no usa los eventos para tus campañas. Bórralo cuando termines.</div>}
              </details>
              <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.5 }}>En el Administrador de anuncios, mira la columna «Compras» (o «Compras por mensajes») de la campaña; los eventos pueden tardar hasta una hora en verse. Se envían también las ventas de los últimos 7 días.</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(porPixel || mensajeria) && <button onClick={() => void enviar()} style={btn}>↻ Enviar pendientes ahora</button>}
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</span>}
        </div>
        {e.ultimos.length > 0 && (
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, maxHeight: 220, overflowY: 'auto' }}>
            {e.ultimos.map((u, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '6px 10px', borderTop: i ? '1px solid var(--df-border)' : 'none' }}>
                <Icono nombre={u.estado === 'enviado' ? 'ok' : 'alerta'} tam={14} color={u.estado === 'enviado' ? 'var(--df-success)' : '#B45309'} />
                <b>{u.evento === 'Purchase' ? `Compra ${fmt(u.valor)}` : 'Chat calificado'}</b>
                <span style={{ color: 'var(--df-text-muted)' }}>{u.canal} · mensajería</span>
                <span style={{ color: 'var(--df-text-faint)', marginLeft: 'auto' }}>{hora(u.created_at)}</span>
                {u.error && <span style={{ color: 'var(--df-danger)', flexBasis: '100%' }}>{u.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </IntegracionFila>
  );
}

/**
 * Anuncios de Meta ↔ productos: cada anuncio queda ligado a su producto para que el bot
 * mande el mensaje inicial correcto aunque el cliente no escriba la frase, y para que las
 * estadísticas sepan qué producto vende cada pauta.
 */
export function AnunciosProductos({ productos }: { productos: { id: string; nombre: string }[] }) {
  const [lista, setLista] = useState<AnuncioMeta[] | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { void apiAnunciosMeta().then((r) => r.data && setLista(r.data.anuncios)); }, []);
  if (!lista) return null;
  if (!lista.length) return <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Todavía no hay anuncios traídos de Meta. Ve a Estadísticas → Conversión por anuncio → «Traer ahora».</div>;
  const elegir = async (a: AnuncioMeta, productId: string) => {
    setLista((l) => (l || []).map((x) => (x.adId === a.adId ? { ...x, productId, auto: false } : x)));
    const r = await apiVincularAnuncio(a.adId, productId, a.nombre);
    setMsg(r.error ? `⚠️ ${r.error}` : productId ? `✓ «${a.nombre}» quedó con ${productos.find((p) => p.id === productId)?.nombre || 'el producto'}.` : `✓ «${a.nombre}» quedó sin producto.`);
  };
  const sinVinculo = lista.filter((a) => !a.productId).length;
  const filtrada = lista.filter((a) => !q || `${a.nombre} ${a.campana} ${a.conjunto}`.toLowerCase().includes(q.toLowerCase()));
  const visibles = verTodos || q ? filtrada : filtrada.slice(0, 8);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}><IcoTexto n="etiqueta" tam={14} degradado />Anuncios y productos</b>
        <span style={{ fontSize: 12, color: sinVinculo ? 'var(--df-warning-mid)' : 'var(--df-success)', fontWeight: 700 }}>{sinVinculo ? `${sinVinculo} sin producto` : 'Todos vinculados'}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar anuncio…" style={{ marginLeft: 'auto', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 12, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>El bot usa este vínculo para mandar el mensaje inicial del producto correcto. «Auto» = DealFlow lo vinculó por el nombre del anuncio; si eliges uno a mano, se respeta siempre.</div>
      {visibles.map((a) => (
        <div key={a.adId} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--df-border)', borderRadius: 9, padding: 7, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, borderRadius: 7, overflow: 'hidden', background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {a.thumb ? <img src={a.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icono nombre="campana" tam={16} degradado />}
          </span>
          <span style={{ flex: '1 1 180px', minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--df-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[a.campana, a.estado === 'ACTIVE' ? 'activo' : a.estado ? a.estado.toLowerCase() : '', a.gasto ? `${fmt(a.gasto)} en 60 días` : ''].filter(Boolean).join(' · ')}
              {a.url && <> · <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--df-brand-dark)' }}>ver ↗</a></>}
            </span>
          </span>
          <div style={{ flex: '1 1 200px', minWidth: 180, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <Dropdown ariaLabel={`Producto de ${a.nombre}`} buscar value={a.productId} onChange={(v) => void elegir(a, v)} placeholder="Sin producto"
                options={[{ value: '', label: 'Sin producto' }, ...productos.map((p) => ({ value: p.id, label: p.nombre }))]} />
            </div>
            {a.auto && a.productId && <span title="Vinculado automáticamente por el nombre del anuncio" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--df-purple)' }}>AUTO</span>}
          </div>
        </div>
      ))}
      {!q && filtrada.length > 8 && <button onClick={() => setVerTodos((v) => !v)} style={{ ...btn, alignSelf: 'flex-start' }}>{verTodos ? 'Ver menos' : `Ver los ${filtrada.length} anuncios`}</button>}
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}
