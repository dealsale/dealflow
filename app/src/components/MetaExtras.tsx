import { useEffect, useState } from 'react';
import { apiMetaDiagnostico, apiMetaResuscribir, apiCapi, apiGuardarCapi, apiCapiDetectar, apiCapiEnviar, apiAnunciosMeta, apiVincularAnuncio, type DiagnosticoMeta, type EstadoCapi, type AnuncioMeta } from '../lib/api';
import { Dropdown } from './Dropdown';
import { IntegracionFila, LogoInteg } from './IntegracionFila';
import { fmt } from '../lib/format';

const btn: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const btnP: React.CSSProperties = { ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none', fontWeight: 700 };
const hora = (iso: string) => (iso ? new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '');

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
      <button onClick={() => void revisar()} disabled={cargando} style={btn}>{cargando ? 'Revisando…' : '🔍 ¿No llegan los mensajes? Revisar conexión'}</button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</div>}
      {d && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
          {d.paginas.map((p) => (
            <div key={p.pageId} style={{ border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px' }}>
              <b>{p.nombre}</b>{p.ig ? ' · con Instagram' : ''}
              <div>{p.error ? `⚠️ ${p.error}` : p.suscrita ? (p.faltan.length ? `⚠️ Suscrita, pero faltan los avisos: ${p.faltan.join(', ')}.` : '✅ DealFlow está suscrito a los mensajes de esta página.') : '❌ DealFlow NO está suscrito a esta página.'}</div>
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

/** Fase C: reportar a Meta las ventas y los chats calificados de sus anuncios. */
export function CapiCard() {
  const [e, setE] = useState<EstadoCapi | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [msg, setMsg] = useState('');
  const [dataset, setDataset] = useState('');
  const [test, setTest] = useState('');
  useEffect(() => { void apiCapi().then((r) => { if (r.data) { setE(r.data); setDataset(r.data.datasetId); setTest(r.data.testCode); } }); }, []);
  if (!e) return null;
  const guardar = async (c: Partial<EstadoCapi>) => { setMsg(''); const r = await apiGuardarCapi(c); if (r.data) setE(r.data); else setMsg(`⚠️ ${r.error}`); };
  const detectar = async () => { setMsg(''); const r = await apiCapiDetectar(); if (r.data) { setE(r.data); setDataset(r.data.datasetId); setMsg('✓ Dataset encontrado.'); } else setMsg(`⚠️ ${r.error}`); };
  const enviar = async () => { setMsg(''); const r = await apiCapiEnviar(); if (r.data) { setE(r.data); setMsg(`✓ Revisado: ${r.data.enviados} evento(s) enviados ahora.`); } else setMsg(`⚠️ ${r.error}`); };
  const listo = e.activo && !!e.datasetId;
  const inp: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)', minWidth: 0, flex: '1 1 180px' };
  const radio = (v: 'pedido' | 'entregado', t: string, sub: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
      <input type="radio" checked={e.compra === v} onChange={() => void guardar({ compra: v })} style={{ marginTop: 3 }} />
      <span><b>{t}</b><br /><span style={{ color: 'var(--df-text-muted)' }}>{sub}</span></span>
    </label>
  );
  return (
    <IntegracionFila
      logo={<LogoInteg fondo="linear-gradient(135deg,#1877F2,#10B981)">🎯</LogoInteg>}
      nombre="Reportar ventas a Meta (API de Conversiones)"
      desc={listo ? `✓ Activo · ${e.compras30} compras (${fmt(e.valor30)}) y ${e.leads30} chats calificados reportados en 30 días${e.errores30 ? ` · ${e.errores30} con error` : ''}` : 'Meta aprende quién COMPRA (no solo quién escribe) y muestra tus anuncios a más gente parecida.'}
      estado={listo ? 'on' : 'off'}
      abierta={abierta}
      onToggle={() => setAbierta((v) => !v)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.55 }}>
          Cada pedido de un cliente que llegó por un anuncio (Click a WhatsApp o Messenger) se le reporta a Meta con su valor. Los chats orgánicos no se envían. Es automático: cada venta se reporta unos 2 minutos después de entrar (y se revisa cada minuto).
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>1. Dataset de Meta</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={dataset} onChange={(x) => setDataset(x.target.value)} onBlur={() => dataset !== e.datasetId && void guardar({ datasetId: dataset })} placeholder="ID del dataset" style={inp} />
            {e.whatsapp && <button onClick={() => void detectar()} style={btn}>Buscarlo automáticamente</button>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 4 }}>{e.whatsapp ? 'Lo buscamos (o lo creamos) en tu cuenta de WhatsApp Business. ' : ''}También lo encuentras en business.facebook.com → Administrador de eventos → tu dataset → Configuración.</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>2. ¿Cuándo cuenta como compra?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {radio('pedido', 'Cuando se crea el pedido (recomendado)', 'Meta recibe la señal rápido y aprende más. Los pedidos cancelados no se reportan.')}
            {radio('entregado', 'Cuando el pedido se entrega', 'Solo cuenta lo que de verdad se cobró contra entrega. Menos señales y más tarde (máx. 7 días después del clic).')}
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={e.leads} onChange={(x) => void guardar({ leads: x.target.checked })} /> Reportar también los chats calificados (el cliente respondió)
        </label>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Código de prueba <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>· opcional, de «Probar eventos» en el Administrador de eventos</span></div>
          <input value={test} onChange={(x) => setTest(x.target.value)} onBlur={() => test !== e.testCode && void guardar({ testCode: test })} placeholder="TEST12345" style={{ ...inp, maxWidth: 220 }} />
          {e.testCode && <div style={{ fontSize: 11.5, color: 'var(--df-warning-mid)', marginTop: 4 }}>Con código de prueba los eventos solo se ven en «Probar eventos» y Meta no los usa para optimizar. Bórralo cuando termines de probar.</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => void guardar({ activo: !e.activo })} disabled={!e.datasetId && !e.activo} style={{ ...(e.activo ? btn : btnP), opacity: !e.datasetId && !e.activo ? 0.5 : 1 }}>{e.activo ? 'Pausar' : 'Activar'}</button>
          {listo && <button onClick={() => void enviar()} style={btn}>↻ Enviar pendientes ahora</button>}
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</span>}
        </div>
        {e.ultimos.length > 0 && (
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, maxHeight: 220, overflowY: 'auto' }}>
            {e.ultimos.map((u, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '6px 10px', borderTop: i ? '1px solid var(--df-border)' : 'none' }}>
                <span>{u.estado === 'enviado' ? '✅' : '⚠️'}</span>
                <b>{u.evento === 'Purchase' ? `Compra ${fmt(u.valor)}` : 'Chat calificado'}</b>
                <span style={{ color: 'var(--df-text-muted)' }}>{u.canal}</span>
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
        <b style={{ fontSize: 13 }}>🏷️ Anuncios y productos</b>
        <span style={{ fontSize: 12, color: sinVinculo ? 'var(--df-warning-mid)' : 'var(--df-success)', fontWeight: 700 }}>{sinVinculo ? `${sinVinculo} sin producto` : 'Todos vinculados'}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar anuncio…" style={{ marginLeft: 'auto', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 12, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>El bot usa este vínculo para mandar el mensaje inicial del producto correcto. «Auto» = DealFlow lo vinculó por el nombre del anuncio; si eliges uno a mano, se respeta siempre.</div>
      {visibles.map((a) => (
        <div key={a.adId} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--df-border)', borderRadius: 9, padding: 7, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, borderRadius: 7, overflow: 'hidden', background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {a.thumb ? <img src={a.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>📢</span>}
          </span>
          <span style={{ flex: '1 1 180px', minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--df-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[a.campana, a.estado === 'ACTIVE' ? '🟢 activo' : a.estado ? '⏸ ' + a.estado.toLowerCase() : '', a.gasto ? `${fmt(a.gasto)} en 60 días` : ''].filter(Boolean).join(' · ')}
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
