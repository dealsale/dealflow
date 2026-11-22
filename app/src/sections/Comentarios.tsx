import { useEffect, useState } from 'react';
import { IcoTexto } from '../components/Icono';
import { notificar } from '../components/dialogs';
import {
  apiComentarios, apiConfigComentarios, apiIgnorarComentario, apiOcultarComentario, apiResponderComentario, apiSincronizarComentarios, apiSugerirComentario,
  type CfgComentarios, type ComentarioMeta, type ListaComentarios,
} from '../lib/api';

/**
 * Comentarios de Facebook e Instagram (publicaciones y anuncios): responderlos en público,
 * escribirle al privado a quien comentó (el chat sigue en el Inbox con el asistente), ocultar
 * groserías y, si se quiere, que DealFlow los responda solo.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14 };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body, var(--df-text))', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnP: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const activo: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', borderColor: 'var(--df-brand)' };
const ESTADOS: { k: string; label: string; n?: keyof ListaComentarios['resumen'] }[] = [
  { k: 'nuevo', label: 'Sin responder', n: 'nuevos' }, { k: 'respondido', label: 'Respondidos', n: 'respondidos' },
  { k: 'oculto', label: 'Ocultos', n: 'ocultos' }, { k: 'ignorado', label: 'Ignorados', n: 'ignorados' }, { k: '', label: 'Todos', n: 'total' },
];
const hace = (f: string) => {
  const d = new Date(f.replace(' ', 'T') + 'Z');
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};
/** «Laura Gómez» → Laura; «@maria.p_92» → Maria (igual que el servidor). */
const primerNombre = (a: string) => {
  const usuario = a.trim().startsWith('@');
  let x = a.replace(/^@/, '').trim().split(/\s+/)[0] || '';
  if (usuario) x = x.split(/[._\d]/)[0] || '';
  return x.length < 2 ? '' : x.charAt(0).toUpperCase() + x.slice(1);
};

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      style={{ position: 'relative', width: 40, height: 23, borderRadius: 999, border: 0, cursor: 'pointer', background: on ? 'var(--df-brand, #10B981)' : 'var(--df-border)', flex: '0 0 auto' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

export function Comentarios() {
  const [d, setD] = useState<ListaComentarios | null>(null);
  const [estado, setEstado] = useState('nuevo');
  const [canal, setCanal] = useState('');
  const [q, setQ] = useState('');
  const [ajustes, setAjustes] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const cargar = () => void apiComentarios({ estado, canal, q: q.trim() }).then((r) => { if (r.data) setD(r.data); });
  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar(); }, 30_000);
    return () => clearInterval(t);
  }, [estado, canal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(cargar, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const traer = async () => {
    setTrayendo(true);
    const r = await apiSincronizarComentarios();
    setTrayendo(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo.', 'error');
    if (r.data.errores.length) notificar(r.data.errores.join(' · '), 'error', 9000);
    else notificar(r.data.nuevos ? `✓ ${r.data.nuevos} comentario(s) nuevos.` : '✓ No hay comentarios nuevos en tus últimas publicaciones.');
    cargar();
  };

  if (!d) return <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando comentarios…</div>;
  const sinPaginas = !d.paginas.length;

  return (
    <section data-screen-label="Comentarios" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 2px' }}>Comentarios</h1>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            Facebook e Instagram{d.paginas.length ? ` · ${d.paginas.map((p) => p.nombre + (p.instagram ? ' + Instagram' : '')).join(', ')}` : ''}{d.config.auto ? ' · respondiendo solo' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => void traer()} disabled={trayendo || sinPaginas} style={{ ...btnS, opacity: sinPaginas ? 0.5 : 1 }}>{trayendo ? 'Trayendo…' : '↻ Traer comentarios'}</button>
          <button onClick={() => setAjustes(!ajustes)} aria-expanded={ajustes} style={{ ...btnS, ...(ajustes ? activo : {}) }}><IcoTexto n="ajustes" />Respuestas automáticas</button>
        </div>
      </div>

      {sinPaginas && (
        <div style={{ ...card, background: 'var(--df-warning-subtle, #fff7e6)', fontSize: 13, lineHeight: 1.5 }}>
          Conecta tu página de Facebook (y su Instagram) en <b>Integraciones → Messenger e Instagram</b> para recibir aquí los comentarios de tus publicaciones y anuncios.
        </div>
      )}
      {!sinPaginas && !d.resumen.total && (
        <div style={{ ...card, fontSize: 12.5, lineHeight: 1.55, color: 'var(--df-text-muted)' }}>
          Aún no llega ningún comentario. Toca <b>↻ Traer comentarios</b> para buscar los de tus últimas publicaciones. Para que lleguen solos, la app de Meta necesita los permisos <b>pages_read_user_content</b>, <b>pages_manage_engagement</b> e <b>instagram_manage_comments</b>, y los avisos (webhooks) <b>feed</b> de la página y <b>comments</b> de Instagram. Después de agregarlos, vuelve a conectar en Integraciones.
        </div>
      )}

      {ajustes && <Ajustes cfg={d.config} onGuardado={(config) => setD({ ...d, config })} />}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {ESTADOS.map((x) => (
          <button key={x.k} onClick={() => setEstado(x.k)} aria-pressed={estado === x.k} style={{ ...btnS, padding: '5px 10px', ...(estado === x.k ? activo : {}) }}>
            {x.label}{x.n ? ` (${d.resumen[x.n]})` : ''}
          </button>
        ))}
        <select value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Red social" style={{ ...inp, width: 'auto' }}>
          <option value="">Facebook e Instagram</option><option value="facebook">Solo Facebook</option><option value="instagram">Solo Instagram</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar comentario" style={{ ...inp, width: 180, flex: '1 1 140px', maxWidth: 260 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!d.comentarios.length && <div style={{ ...card, fontSize: 13, color: 'var(--df-text-faint)' }}>{estado === 'nuevo' ? <><IcoTexto n="fiesta" />No hay comentarios sin responder.</> : 'No hay comentarios con este filtro.'}</div>}
        {d.comentarios.map((c) => <Tarjeta key={c.id} c={c} cfg={d.config} onCambio={cargar} />)}
      </div>
    </section>
  );
}

function Tarjeta({ c, cfg, onCambio }: { c: ComentarioMeta; cfg: CfgComentarios; onCambio: () => void }) {
  const [texto, setTexto] = useState('');
  const [conPrivado, setConPrivado] = useState(!c.privado && cfg.enviarPrivado);
  const [privado, setPrivado] = useState(cfg.privado.replace(/\{nombre\}/g, primerNombre(c.autor)));
  const [ocupado, setOcupado] = useState('');
  const [abierta, setAbierta] = useState(c.estado === 'nuevo');
  const ig = c.canal === 'instagram';
  const responder = async () => {
    if (!texto.trim() && !(conPrivado && privado.trim())) return;
    setOcupado('resp');
    const r = await apiResponderComentario(c.id, texto.trim(), conPrivado && !c.privado ? privado.trim() : '');
    setOcupado('');
    if (r.error) { notificar(r.error, 'error', 9000); onCambio(); return; }
    notificar(conPrivado && !c.privado ? '✓ Respondido y enviado al privado.' : '✓ Respondido.');
    setTexto(''); onCambio();
  };
  const sugerir = async () => {
    setOcupado('ia');
    const r = await apiSugerirComentario(c.id);
    setOcupado('');
    if (r.error || !r.data) return notificar(r.error || 'No se pudo.', 'error');
    setTexto(r.data.texto);
  };
  const ocultar = async () => {
    setOcupado('ocu');
    const r = await apiOcultarComentario(c.id, !c.oculto);
    setOcupado('');
    if (r.error) return notificar(r.error, 'error', 9000);
    notificar(c.oculto ? '✓ Volvió a ser visible.' : '✓ Comentario oculto: solo lo ven quien lo escribió y sus amigos.');
    onCambio();
  };
  const ignorar = async () => { await apiIgnorarComentario(c.id, c.estado !== 'ignorado'); onCambio(); };
  const badge = c.estado === 'nuevo' ? ['Sin responder', 'var(--df-warning-subtle, #fff7e6)', 'var(--df-warning-dark, #92400e)']
    : c.estado === 'respondido' ? [c.auto ? 'Respondido solo' : 'Respondido', 'var(--df-brand-subtle, #dcfce7)', 'var(--df-brand-dark, #166534)']
    : c.estado === 'oculto' ? ['Oculto', 'var(--df-danger-subtle, #fee2e2)', 'var(--df-danger-dark, #991b1b)'] : ['Ignorado', 'var(--df-bg)', 'var(--df-text-muted)'];

  return (
    <article style={{ ...card, opacity: c.estado === 'ignorado' ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span aria-label={ig ? 'Instagram' : 'Facebook'} style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, background: ig ? 'linear-gradient(45deg,#f58529,#dd2a7b,#8134af)' : '#1877F2' }}>{ig ? '◎' : 'f'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13.5 }}>{c.autor || 'Alguien'}</b>
            <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{hace(c.creado)}</span>
            {c.adId && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--df-bg)', color: 'var(--df-text-muted)' }}><IcoTexto n="campana" />Anuncio</span>}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: badge[1], color: badge[2] }}>{badge[0]}</span>
          </div>
          <div style={{ fontSize: 14, margin: '4px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.texto || <i style={{ color: 'var(--df-text-faint)' }}>(sin texto: foto o sticker)</i>}</div>
          {(c.postTexto || c.postUrl) && (
            <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              En: {c.postTexto ? `«${c.postTexto.slice(0, 90)}${c.postTexto.length > 90 ? '…' : ''}»` : 'tu publicación'}
              {c.postUrl && <> · <a href={c.postUrl} target="_blank" rel="noreferrer">Ver publicación ↗</a></>}
            </div>
          )}
          {c.respuesta && <div style={{ fontSize: 12.5, marginTop: 6, paddingLeft: 10, borderLeft: '3px solid var(--df-brand)' }}><b>Respuesta:</b> {c.respuesta}</div>}
          {c.privado && <div style={{ fontSize: 12.5, marginTop: 4, paddingLeft: 10, borderLeft: '3px solid #1877F2' }}><b>Al privado:</b> {c.privado} <span style={{ color: 'var(--df-text-faint)' }}>· si contesta, sigue en el Inbox</span></div>}
          {c.oculto && c.motivo && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--df-text-muted)' }}>Oculto: {c.motivo}</div>}
          {c.error && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--df-danger-dark, #b91c1c)' }}><IcoTexto n="alerta" />{c.error}</div>}

          {!abierta && c.estado !== 'oculto' && <button onClick={() => setAbierta(true)} style={{ ...btnS, marginTop: 8, padding: '4px 9px' }}>Responder</button>}
          {abierta && c.estado !== 'oculto' && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`Responder en público a ${primerNombre(c.autor) || 'esta persona'}…`} aria-label="Respuesta pública" style={{ ...inp, resize: 'vertical' }} />
              {!c.privado && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                  <input type="checkbox" checked={conPrivado} onChange={(e) => setConPrivado(e.target.checked)} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1 }}>También escribirle al privado {ig ? '(Instagram Direct)' : '(Messenger)'}
                    {conPrivado && <textarea value={privado} onChange={(e) => setPrivado(e.target.value)} rows={2} aria-label="Mensaje privado" style={{ ...inp, resize: 'vertical', marginTop: 4 }} />}
                  </span>
                </label>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => void responder()} disabled={ocupado === 'resp' || (!texto.trim() && !(conPrivado && !c.privado && privado.trim()))} style={{ ...btnP, opacity: !texto.trim() && !(conPrivado && !c.privado && privado.trim()) ? 0.5 : 1 }}>{ocupado === 'resp' ? 'Enviando…' : 'Responder'}</button>
                <button onClick={() => void sugerir()} disabled={ocupado === 'ia'} style={btnS}>{ocupado === 'ia' ? 'Pensando…' : <><IcoTexto n="ia" tam={13} />Sugerir con IA</>}</button>
                <button onClick={() => void ocultar()} disabled={ocupado === 'ocu'} style={btnS}>Ocultar</button>
                <button onClick={() => void ignorar()} style={btnS}>{c.estado === 'ignorado' ? 'Quitar de ignorados' : 'Ignorar'}</button>
              </div>
            </div>
          )}
          {c.estado === 'oculto' && <button onClick={() => void ocultar()} disabled={ocupado === 'ocu'} style={{ ...btnS, marginTop: 8, padding: '4px 9px' }}>Mostrar de nuevo</button>}
        </div>
      </div>
    </article>
  );
}

function Ajustes({ cfg, onGuardado }: { cfg: CfgComentarios; onGuardado: (c: CfgComentarios) => void }) {
  const [c, setC] = useState(cfg);
  const [publicas, setPublicas] = useState(cfg.publicas.join('\n'));
  const [palabras, setPalabras] = useState(cfg.palabras.join(', '));
  const guardar = async () => {
    const r = await apiConfigComentarios({ ...c, publicas: publicas.split('\n').map((x) => x.trim()).filter(Boolean), palabras: palabras.split(',').map((x) => x.trim()).filter(Boolean) });
    if (r.error || !r.data) return notificar(r.error || 'No se pudo guardar.', 'error');
    onGuardado(r.data.config);
    notificar('✓ Guardado.');
  };
  const fila = (on: boolean, set: () => void, titulo: string, ayuda: string) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Switch on={on} onChange={set} label={titulo} />
      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{titulo}</div><div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{ayuda}</div></div>
    </div>
  );
  return (
    <div style={{ ...card, display: 'grid', gap: 12 }}>
      <b style={{ fontSize: 14 }}>Respuestas automáticas</b>
      {fila(c.auto, () => setC({ ...c, auto: !c.auto }), 'Responder solo los comentarios nuevos', 'Responde en público y le escribe al privado. Una sola vez por persona en cada publicación; las respuestas dentro de un hilo no se contestan solas. Espera unos segundos para que se vea natural.')}
      {c.auto && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
          Respuesta pública:
          <button onClick={() => setC({ ...c, modo: 'plantilla' })} aria-pressed={c.modo === 'plantilla'} style={{ ...btnS, padding: '5px 10px', ...(c.modo === 'plantilla' ? activo : {}) }}>Mis textos (se turnan)</button>
          <button onClick={() => setC({ ...c, modo: 'ia' })} aria-pressed={c.modo === 'ia'} style={{ ...btnS, padding: '5px 10px', ...(c.modo === 'ia' ? activo : {}) }}><IcoTexto n="ia" />La IA según el comentario</button>
        </div>
      )}
      <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
        Textos para responder en público <span style={{ fontWeight: 400, color: 'var(--df-text-muted)' }}>Uno por línea; se turnan para no repetir siempre lo mismo. {'{nombre}'} = primer nombre de quien comentó.</span>
        <textarea value={publicas} onChange={(e) => setPublicas(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', fontWeight: 400 }} />
      </label>
      {fila(c.enviarPrivado, () => setC({ ...c, enviarPrivado: !c.enviarPrivado }), 'Escribirle al privado', 'Meta deja enviar UN mensaje privado por comentario (hasta 7 días después). Cuando la persona contesta, el chat sigue en el Inbox con tu asistente.')}
      {c.enviarPrivado && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
          Mensaje privado
          <textarea value={c.privado} onChange={(e) => setC({ ...c, privado: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical', fontWeight: 400 }} />
        </label>
      )}
      {fila(c.ocultarGroserias, () => setC({ ...c, ocultarGroserias: !c.ocultarGroserias }), 'Ocultar groserías e insultos', 'Se ocultan solos (quien lo escribió no se entera). Lo ves en «Ocultos» y puedes mostrarlo de nuevo.')}
      <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
        Ocultar también si dicen… <span style={{ fontWeight: 400, color: 'var(--df-text-muted)' }}>Separadas por comas: nombres de la competencia, enlaces, palabras que no quieres en tus publicaciones.</span>
        <input value={palabras} onChange={(e) => setPalabras(e.target.value)} placeholder="ej: tiendax, más barato en, wa.me" style={{ ...inp, fontWeight: 400 }} />
      </label>
      {fila(c.avisar, () => setC({ ...c, avisar: !c.avisar }), 'Avisarme al celular', 'Notificación por cada comentario nuevo que quede sin responder.')}
      <div><button onClick={() => void guardar()} style={btnP}>Guardar</button></div>
    </div>
  );
}
