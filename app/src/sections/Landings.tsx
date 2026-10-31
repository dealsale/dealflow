import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import {
  apiBorrarLanding, apiCrearLanding, apiDespublicarLanding, apiDuplicarLanding, apiGuardarLanding, apiImagenLanding, apiLanding, apiLandings,
  apiPagarMembresia, apiGuardarTienda, apiVistaTienda, apiPublicarLanding, apiVistaLanding, apiConectarDominio, apiVerificarDominio, apiEstadoDominio, apiQuitarDominio, apiInicioDominio, apiSubdominio,
} from '../lib/api';
import type { MembresiaTienda, TiendaConfig, DominioLandings, Landing, LandingBundle, LandingDatos, LandingResumen } from '../lib/api';
import { confirmar, notificar } from '../components/dialogs';
import { BibliotecaLandingsModal } from '../components/BibliotecaLandings';
import { LandingCodigo } from '../components/LandingCodigo';
import { PlantillasModal, DisenoLanding } from '../components/PlantillasTienda';
import { apiVistaPlantillaTienda, apiPlantillasTienda } from '../lib/api';

/**
 * Tienda en línea: una página de inicio con todos los productos publicados y una
 * landing por producto (galería, variantes, ofertas por cantidad, formulario contra
 * entrega, imágenes largas y testimonios). Membresía mensual; los pedidos caen a DealFlow.
 */
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' };
const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12 };

// La landing abierta va en la URL (?landing=…) para que F5 deje al usuario en el editor.
const leerAbierta = () => { try { return new URLSearchParams(window.location.search).get('landing') || ''; } catch { return ''; } };
function escribirAbierta(id: string) {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('landing', id); else u.searchParams.delete('landing');
    u.searchParams.delete('pago');
    window.history.replaceState(null, '', u.pathname + u.search);
  } catch { /* nada */ }
}

/** Prepara una imagen para la landing: ancho máximo ~1500 px (las largas conservan su alto). */
function prepararImagen(file: File, conservarPng = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const src = String(r.result);
      if (file.type === 'image/gif' || (conservarPng && file.type === 'image/png' && file.size < 1.5e6)) return resolve(src);
      const img = new Image();
      img.onload = () => {
        const max = 1500;
        const k = img.width > max ? max / img.width : 1;
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}
async function subir(files: File[], conservarPng = false): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files.filter((x) => x.type.startsWith('image/'))) {
    const r = await apiImagenLanding(await prepararImagen(f, conservarPng));
    if (r.data?.url) urls.push(r.data.url); else notificar(r.error || 'No se pudo subir la imagen.', 'error');
  }
  return urls;
}

export function Landings({ df }: { df: DealFlowState }) {
  const [abierta, setAbierta] = useState(leerAbierta);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('pago') === 'ok') notificar('✓ Pago recibido. Tu Tienda en línea queda activa en unos segundos.', 'ok', 6000);
  }, []);
  const abrir = (id: string) => { setAbierta(id); escribirAbierta(id); };
  return abierta ? <Editor id={abierta} df={df} onSalir={() => abrir('')} /> : <Lista df={df} onAbrir={abrir} />;
}

// ── Lista (diseño "Noche") ───────────────────────────────────────────────
type TabTienda = 'landings' | 'inicio' | 'dominio' | 'plantillas';
function Lista({ df, onAbrir }: { df: DealFlowState; onAbrir: (id: string) => void }) {
  const [lista, setLista] = useState<LandingResumen[] | null>(null);
  const [membresia, setMembresia] = useState<MembresiaTienda | null>(null);
  const [tienda, setTienda] = useState<TiendaConfig | null>(null);
  const [creando, setCreando] = useState(false);
  const [biblioteca, setBiblioteca] = useState(false);
  const [plantillas, setPlantillas] = useState(false);
  const [dominio, setDominio] = useState<DominioLandings | null>(null);
  const [tab, setTab] = useState<TabTienda>('landings');
  const [vista, setVista] = useState('');
  const cargar = async () => { const r = await apiLandings(); if (r.data) { setLista(r.data.landings); setMembresia(r.data.membresia); setDominio(r.data.dominio); setTienda(r.data.tienda); } else notificar(r.error || 'No se pudo cargar tu tienda.', 'error'); };
  useEffect(() => { void cargar(); }, []);
  const copiar = (u: string) => { void navigator.clipboard?.writeText(u).then(() => notificar('✓ Enlace copiado.')).catch(() => {}); };
  const borrar = async (l: LandingResumen) => {
    const ok = await confirmar({ titulo: `¿Eliminar "${l.nombre}"?`, mensaje: 'Sale de tu tienda y su enlace deja de funcionar. Esto no se puede deshacer.', aceptar: 'Eliminar', peligro: true });
    if (!ok) return;
    const r = await apiBorrarLanding(l.id);
    if (r.error) notificar(r.error, 'error'); else void cargar();
  };
  const duplicar = async (l: LandingResumen) => { const r = await apiDuplicarLanding(l.id); if (r.data) onAbrir(r.data.landing.id); else notificar(r.error || 'No se pudo duplicar.', 'error'); };

  const enLinea = !!membresia && (membresia.activa || membresia.enGracia);
  const urlTienda = dominio ? (dominio.estado === 'activo' && dominio.dominio ? `https://${dominio.dominio}` : dominio.raiz ? `https://${dominio.sub}.${dominio.raiz}` : '') : '';
  const host = urlTienda.replace(/^https?:\/\//, '');
  const publicadas = (lista || []).filter((l) => l.estado === 'publicada');
  const vistas = (lista || []).reduce((a, l) => a + l.vistas, 0);
  const pedidos = (lista || []).reduce((a, l) => a + l.pedidos, 0);
  const conv = vistas > 0 ? `${((pedidos / vistas) * 100).toFixed(1)} % de conversión` : 'sin visitas todavía';
  const membresiaTxt = !membresia ? '' : membresia.cortesia ? 'cortesía activa' : membresia.activa ? `membresía activa · ${membresia.diasRestantes} días` : membresia.enGracia ? 'membresía vencida · en gracia' : 'membresía vencida';
  const vistaActual = vista || (publicadas[0]?.url || urlTienda);
  const TABS: { id: TabTienda; t: string }[] = [{ id: 'landings', t: 'Landings' }, { id: 'inicio', t: 'Página de inicio' }, { id: 'dominio', t: 'Dominio y membresía' }, { id: 'plantillas', t: '🎨 Mis plantillas' }];

  return (
    <section data-screen-label="Tienda en línea" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">{host ? <span className="mono">{host}</span> : 'Tienda en línea'}{membresiaTxt ? ` · ${membresiaTxt}` : ''}</span>
          <h1>Tienda en línea</h1>
          <p className="sub">Tu página de inicio y una landing por producto, con el formulario de pago contra entrega. Cada pedido llega al Inbox y el cliente lo confirma por WhatsApp.</p>
        </div>
        <div className="fila">
          <a className="btn btn-fant" href="/tutorial-tienda-en-linea" target="_blank" rel="noreferrer">📘 Tutorial</a>
          {urlTienda && enLinea && <a className="btn btn-sec" href={urlTienda} target="_blank" rel="noreferrer">Ver mi tienda ↗</a>}
          <button type="button" className="btn btn-sec" onClick={() => setBiblioteca(true)}>📚 Biblioteca</button>
          <button type="button" className="btn btn-pri" onClick={() => setCreando(true)}>＋ Nueva landing</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="eti">Visitas</span><span className="valor">{lista ? vistas.toLocaleString('es-CO') : '…'}</span><span className="delta">en todas tus landings</span></div>
        <div className="kpi"><span className="eti">Pedidos desde la tienda</span><span className="valor">{lista ? pedidos : '…'}</span><span className="delta">{conv}</span></div>
        <div className="kpi"><span className="eti">Landings publicadas</span><span className="valor">{lista ? publicadas.length : '…'}</span><span className="delta">de {lista?.length ?? '…'} creadas</span></div>
        <div className="kpi"><span className="eti">Membresía</span><span className={`valor ${membresia ? (enLinea ? 'ok' : 'mal') : ''}`} style={{ fontSize: 22 }}>{!membresia ? '…' : membresia.cortesia ? 'Cortesía' : membresia.activa ? 'Activa' : membresia.enGracia ? 'En gracia' : 'Vencida'}</span><span className="delta">{membresia ? (membresia.vence ? `vence ${membresia.vence}` : `${pesos(membresia.precio)} al mes`) : ''}</span></div>
      </div>

      <div className="lateral">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="tabs">
            {TABS.map((x) => <button key={x.id} type="button" className={`tab${tab === x.id ? ' sel' : ''}`} onClick={() => setTab(x.id)}>{x.t}</button>)}
          </div>

          {tab === 'landings' && (
            lista === null ? <div className="vacio">Cargando…</div>
              : !lista.length ? (
                <div className="vacio" style={{ padding: '34px 20px' }}>
                  <div style={{ fontSize: 40 }}>🛍️</div>
                  <div style={{ fontWeight: 800, fontSize: 16, margin: '6px 0 4px', color: 'var(--tinta)' }}>Agrega tu primer producto</div>
                  <div style={{ maxWidth: 460, margin: '0 auto 14px' }}>Tráelo de tu catálogo de DealFlow (con fotos, variantes y combos) o crea uno solo para la tienda. Cada producto tiene su propia página y su enlace para pautar.</div>
                  <button type="button" className="btn btn-pri" onClick={() => setCreando(true)}>＋ Nueva landing</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lista.map((l) => {
                    const pub = l.estado === 'publicada';
                    return (
                      <article key={l.id} className={`landing${vistaActual === l.url ? ' sel' : ''}`} onClick={() => setVista(l.url)}>
                        <button type="button" className="mini" onClick={() => onAbrir(l.id)} style={{ position: 'relative', border: 0, padding: 6, cursor: 'pointer', background: 'var(--panel2)', overflow: 'hidden' }} aria-label={`Editar ${l.nombre}`}>
                          <Miniatura id={l.id} />
                          <span style={{ position: 'relative', background: 'rgba(5,7,19,.65)', borderRadius: 6, padding: '1px 5px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{l.slug}</span>
                        </button>
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <b style={{ fontSize: 14 }}>{l.nombre}</b>
                            <span className={`pill ${pub ? 'ok' : 'neutro'} chica`}>{pub ? 'Publicada' : 'Borrador'}</span>
                            {l.modoCodigo && <span className="pill info sin chica" title="Usa su propio código">💻 Código</span>}
                            {dominio?.inicio === l.id && <span className="pill info sin chica">PRINCIPAL</span>}
                          </div>
                          {pub ? <a href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mono" style={{ fontSize: 12, color: 'var(--cian)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url.replace(/^https?:\/\//, '')}</a>
                            : <span className="suave-t" style={{ fontSize: 12.5 }}>Publícala desde el editor para que tenga enlace.</span>}
                          <span className="tenue mono" style={{ fontSize: 11 }}>{l.vistas.toLocaleString('es-CO')} visitas · {l.pedidos} pedidos{l.vistas > 0 ? ` · ${((l.pedidos / l.vistas) * 100).toFixed(1)} %` : ''}</span>
                        </div>
                        <div className="fila" style={{ gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-sec btn-chico" onClick={() => onAbrir(l.id)}>Editar</button>
                          {pub && <button type="button" className="btn btn-fant btn-chico" onClick={() => copiar(l.url)}>Copiar enlace</button>}
                          <button type="button" className="btn btn-fant btn-chico" onClick={() => void duplicar(l)}>Duplicar</button>
                          <button type="button" className="btn btn-fant btn-chico" onClick={() => void borrar(l)} style={{ color: 'var(--coral)' }}>Eliminar</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
          )}

          {tab === 'inicio' && (tienda ? <TiendaCard t={tienda} onGuardada={setTienda} /> : <div className="vacio">Cargando…</div>)}

          {tab === 'dominio' && (
            <>
              {membresia && <MembresiaCard m={membresia} />}
              {dominio && <DominioCard d={dominio} landings={lista || []} enLinea={enLinea} onCambio={(x) => { setDominio(x); void cargar(); }} />}
            </>
          )}

          {tab === 'plantillas' && (
            <section className="tarjeta">
              <div className="tarjeta-cab"><h2>Mis plantillas</h2><button type="button" className="btn btn-pri btn-chico" onClick={() => setPlantillas(true)}>Abrir mis plantillas</button></div>
              <p className="suave-t" style={{ fontSize: 13 }}>Diseños propios para tus landings: crea una plantilla con tu estilo, aplícala a varias landings y cámbiala en un solo lugar.</p>
            </section>
          )}
        </div>

        <aside className="tarjeta" aria-label="Vista previa" style={{ gap: 12, position: 'sticky', top: 0 }}>
          <div className="tarjeta-cab"><h3>Así se ve en el celular</h3>{vistaActual && <a className="btn btn-fant btn-chico" href={vistaActual} target="_blank" rel="noreferrer">Abrir ↗</a>}</div>
          {vistaActual && enLinea
            ? <div className="celu"><iframe title="Vista previa" src={vistaActual} style={{ width: '100%', height: 480, border: 0, display: 'block', background: '#fff' }} /></div>
            : <div className="vacio">{enLinea ? 'Publica una landing para verla aquí.' : 'Activa la membresía para que tu tienda esté en línea y verla aquí.'}</div>}
          <p className="tenue" style={{ fontSize: 11.5 }}>Toca una landing de la lista para verla aquí. El formulario de pago contra entrega crea el pedido y el asistente lo confirma por WhatsApp.</p>
        </aside>
      </div>

      {creando && <CrearModal df={df} onCerrar={() => setCreando(false)} onCreada={(id) => { setCreando(false); onAbrir(id); }} />}
      {plantillas && <PlantillasModal landings={lista || []} onCerrar={() => { setPlantillas(false); void cargar(); }} />}
      {biblioteca && <BibliotecaLandingsModal onCerrar={() => setBiblioteca(false)} onImportada={(id) => { setBiblioteca(false); onAbrir(id); }} />}
    </section>
  );
}

function Estado({ l }: { l: { estado: string; desbloqueada: boolean } }) {
  const pub = l.estado === 'publicada';
  return <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px', background: pub ? 'var(--df-success-subtle, #dcfce7)' : 'var(--df-surface-2, #f4f4f5)', color: pub ? 'var(--df-success, #16a34a)' : 'var(--df-text-muted)', whiteSpace: 'nowrap' }}>{pub ? '● Publicado' : 'Borrador'}</span>;
}

// Miniatura: la primera foto de la galería (se pide la landing completa una vez).
const fotos = new Map<string, string>();
function Miniatura({ id }: { id: string }) {
  const [src, setSrc] = useState(fotos.get(id) || '');
  useEffect(() => {
    if (fotos.has(id)) return;
    void apiLanding(id).then((r) => { const f = r.data?.landing.datos.galeria[0] || ''; fotos.set(id, f); setSrc(f); });
  }, [id]);
  return src ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 22, opacity: 0.5 }}>🖼️</span>;
}

function CrearModal({ df, onCerrar, onCreada }: { df: DealFlowState; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [origen, setOrigen] = useState<'catalogo' | 'nuevo'>('catalogo');
  const [pid, setPid] = useState('');
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const productos = df.products.filter((p) => p.tipo !== 'servicio');
  const crear = async () => {
    if (origen === 'catalogo' && !pid) return notificar('Elige el producto de tu catálogo.', 'error');
    if (origen === 'nuevo' && !nombre.trim()) return notificar('Escribe el nombre del producto.', 'error');
    setEnviando(true);
    const r = await apiCrearLanding(nombre, origen === 'catalogo' ? pid : '');
    setEnviando(false);
    if (r.data) onCreada(r.data.landing.id); else notificar(r.error || 'No se pudo crear.', 'error');
  };
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(460px, 100%)', padding: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Agregar producto a la tienda</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {([['catalogo', '📦 De mi catálogo', 'Trae fotos, variantes, precio y combos. Los pedidos quedan ligados al producto para despacharlos.'], ['nuevo', '✨ Producto nuevo', 'Solo para la tienda en línea. Lo armas desde cero.']] as const).map(([k, t, dsc]) => (
            <button key={k} type="button" onClick={() => setOrigen(k)} style={{ textAlign: 'left', border: `1.5px solid ${origen === k ? 'var(--df-purple)' : 'var(--df-border)'}`, background: origen === k ? 'var(--df-purple-subtle, var(--df-surface))' : 'var(--df-surface)', borderRadius: 10, padding: '10px 11px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--df-text)' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t}</div>
              <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 3 }}>{dsc}</div>
            </button>
          ))}
        </div>
        {origen === 'catalogo' && (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Producto de DealFlow</label>
            <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ ...inp, margin: '5px 0 12px' }}>
              <option value="">Elige un producto…</option>
              {productos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
            </select>
          </>
        )}
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Nombre en la tienda {origen === 'catalogo' && <span style={{ color: 'var(--df-text-faint)', fontWeight: 400 }}>(opcional)</span>}</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Blusa Valery Manga Larga" style={{ ...inp, margin: '5px 0 16px' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={btn}>Cancelar</button>
          <button onClick={() => void crear()} disabled={enviando} style={{ ...btnPri, opacity: enviando ? 0.6 : 1 }}>{enviando ? 'Creando…' : 'Agregar y editar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────
function Editor({ id, df, onSalir }: { id: string; df: DealFlowState; onSalir: () => void }) {
  const [l, setL] = useState<Landing | null>(null);
  const [d, setD] = useState<LandingDatos | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<'' | 'pendiente' | 'guardando' | 'ok' | 'error'>('');
  const [html, setHtml] = useState('');
  const [disp, setDisp] = useState<'cel' | 'pc'>('cel');
  const [pestana, setPestana] = useState<'editar' | 'ver'>('editar');
  const [slug, setSlug] = useState('');
  // Vista previa del modo código (null = la del diseño del editor).
  const [htmlCodigo, setHtmlCodigo] = useState<string | null>(null);
  const [htmlPlantilla, setHtmlPlantilla] = useState<string | null>(null);
  const [verPlantillas, setVerPlantillas] = useState(false);
  const ultimo = useRef('');
  const angosto = typeof window !== 'undefined' && window.innerWidth < 980;

  useEffect(() => {
    void apiLanding(id).then((r) => {
      if (!r.data) { notificar(r.error || 'Landing no encontrada.', 'error'); onSalir(); return; }
      setL(r.data.landing); setD(r.data.landing.datos); setSlug(r.data.landing.slug); ultimo.current = JSON.stringify(r.data.landing.datos);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoguardado (1,2 s después del último cambio) y vista previa (0,5 s).
  useEffect(() => {
    if (!d) return;
    const s = JSON.stringify(d);
    const tv = setTimeout(() => { void apiVistaLanding(id, d).then((r) => { if (r.data) setHtml(r.data.html); }); }, 450);
    if (s === ultimo.current) return () => clearTimeout(tv);
    setEstadoGuardado('pendiente');
    const tg = setTimeout(async () => {
      setEstadoGuardado('guardando');
      const r = await apiGuardarLanding(id, { datos: d });
      if (r.data) { ultimo.current = s; setL(r.data.landing); setEstadoGuardado('ok'); fotos.set(id, d.galeria[0] || ''); } else { setEstadoGuardado('error'); notificar(r.error || 'No se pudo guardar.', 'error'); }
    }, 1200);
    return () => { clearTimeout(tv); clearTimeout(tg); };
  }, [d, id]);

  // Con plantilla propia, la vista previa es la plantilla llena con estos datos (se refresca al guardar).
  const plantillaUsada = l?.plantillaId || '';
  useEffect(() => {
    if (!plantillaUsada || l?.modoCodigo) { setHtmlPlantilla(null); return; }
    let vivo = true;
    void apiPlantillasTienda().then((r) => {
      const p = r.data?.plantillas.find((x) => x.id === plantillaUsada);
      if (!p || !vivo) return;
      void apiVistaPlantillaTienda(p.html, 'landing', id).then((v) => { if (vivo && v.data) setHtmlPlantilla(v.data.html); });
    });
    return () => { vivo = false; };
  }, [plantillaUsada, l?.updatedAt, l?.modoCodigo, id, verPlantillas]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!l || !d) return <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>Cargando la landing…</div>;
  const set = (p: Partial<LandingDatos>) => setD((x) => (x ? { ...x, ...p } : x));

  const guardarYa = async () => {
    const s = JSON.stringify(d);
    if (s === ultimo.current) return true;
    const r = await apiGuardarLanding(id, { datos: d });
    if (r.data) { ultimo.current = s; setL(r.data.landing); setEstadoGuardado('ok'); return true; }
    notificar(r.error || 'No se pudo guardar.', 'error'); return false;
  };
  const publicar = async () => {
    if (!(await guardarYa())) return;
    const r = await apiPublicarLanding(id);
    if (r.error) return notificar(r.error, 'error');
    if (r.data?.requierePago) {
      const ok = await confirmar({ titulo: 'Activa tu Tienda en línea', mensaje: `Para publicar necesitas la membresía de Tienda en línea: ${pesos(r.data.precio || 0)} al mes, con todos los productos y landings que quieras, tu dirección gratis y tu propio dominio. Te llevamos al pago seguro de Wompi.`, aceptar: 'Activar membresía' });
      if (!ok) return;
      const p = await apiPagarMembresia();
      if (p.data?.url) window.location.href = p.data.url; else notificar(p.error || 'No se pudo abrir el pago.', 'error');
      return;
    }
    if (r.data?.landing) { setL({ ...l, ...r.data.landing }); notificar('✓ ¡Publicado! Ya aparece en tu tienda y puedes pautar su enlace.', 'ok', 5000); }
  };
  const despublicar = async () => {
    const ok = await confirmar({ titulo: '¿Despublicar este producto?', mensaje: 'Sale de tu tienda y su enlace deja de mostrar la página hasta que lo publiques de nuevo.', aceptar: 'Despublicar' });
    if (!ok) return;
    const r = await apiDespublicarLanding(id);
    if (r.error) notificar(r.error, 'error'); else setL({ ...l, estado: 'borrador' });
  };
  const guardarSlug = async () => {
    if (slug === l.slug) return;
    const r = await apiGuardarLanding(id, { slug });
    if (r.data) { setL(r.data.landing); setSlug(r.data.landing.slug); notificar('✓ Dirección actualizada.'); } else { notificar(r.error || 'No se pudo cambiar.', 'error'); setSlug(l.slug); }
  };
  const vincular = async (productId: string) => {
    const r = await apiGuardarLanding(id, { productId });
    if (r.data) setL(r.data.landing);
  };
  const base = l.url.slice(0, l.url.length - l.slug.length);

  const formularios = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Bloque titulo={l.plantillaId ? 'Diseño: mi plantilla' : 'Diseño de la página'} icono="🎨">
        <DisenoLanding landingId={id} plantillaId={l.plantillaId || ''} modoCodigo={!!l.modoCodigo} onCambio={(plantillaId) => setL((x) => (x ? { ...x, plantillaId } : x))} onAdministrar={() => setVerPlantillas(true)} />
      </Bloque>
      <Bloque titulo={l.modoCodigo ? 'Modo código (activo)' : 'Modo código (HTML propio)'} icono="💻">
        <LandingCodigo id={id} onVista={(h) => { setHtmlCodigo(h); }} onModo={(modoCodigo) => setL((x) => (x ? { ...x, modoCodigo } : x))} />
      </Bloque>
      <Bloque titulo="Producto y precio" icono="🏷️" abierto>
        <Campo label="Nombre del producto"><input value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} style={inp} /></Campo>
        <Dos>
          <Campo label="Precio (1 unidad)"><Dinero valor={d.precio} onChange={(v) => set({ precio: v })} /></Campo>
          <Campo label="Precio antes (tachado)"><Dinero valor={d.precioAntes} onChange={(v) => set({ precioAntes: v })} /></Campo>
        </Dos>
        <Dos>
          <Campo label="Calificación (0 a 5)"><input type="number" min={0} max={5} step={0.1} value={d.calificacion} onChange={(e) => set({ calificacion: Number(e.target.value) })} style={inp} /></Campo>
          <Campo label="Texto junto a las estrellas"><input value={d.resenas} onChange={(e) => set({ resenas: e.target.value })} placeholder="+1.200 clientes felices" style={inp} /></Campo>
        </Dos>
        <Campo label="Frase destacada (con ✓ al lado)"><input value={d.destacado} onChange={(e) => set({ destacado: e.target.value })} placeholder="100% textura premium | Calidad garantizada" style={inp} /></Campo>
        <Interruptor valor={d.mostrarTitulo} onChange={(mostrarTitulo) => set({ mostrarTitulo })} titulo="Mostrar el nombre del producto" ayuda="Apágalo si la foto principal ya trae el nombre (como en las tiendas de Shopify)." />
        <Campo label="Producto de DealFlow" ayuda="Los pedidos de esta página quedan ligados a este producto (para despacharlos con Effi o Dropi).">
          <select value={l.productId} onChange={(e) => void vincular(e.target.value)} style={inp}>
            <option value="">Producto solo de la tienda en línea</option>
            {df.products.filter((p) => p.tipo !== 'servicio').map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
          </select>
        </Campo>
      </Bloque>

      <Bloque titulo="Fotos del producto" icono="📸" abierto>
        <ListaImagenes titulo="Galería (la primera es la principal)" urls={d.galeria} onChange={(galeria) => set({ galeria })} max={15} cuadrada />
        <UnaImagen titulo="Banner de arriba (opcional, encima del producto)" url={d.bannerSuperior} onChange={(bannerSuperior) => set({ bannerSuperior })} />
      </Bloque>

      <Bloque titulo="Variantes" icono="🎨">
        <Opciones d={d} set={set} />
      </Bloque>

      <Bloque titulo="Ofertas (bundles)" icono="🎁">
        <Bundles d={d} set={set} />
      </Bloque>

      <Bloque titulo="Botón, beneficios y envío" icono="🛒">
        <Dos>
          <Campo label="Texto del botón"><input value={d.boton} onChange={(e) => set({ boton: e.target.value })} placeholder="ENVÍO GRATIS PAGO CONTRA ENTREGA" style={inp} /></Campo>
          <Campo label="Segunda línea del botón"><input value={d.botonSub} onChange={(e) => set({ botonSub: e.target.value })} placeholder="Aquí eliges tallas y colores" style={inp} /></Campo>
        </Dos>
        <Campo label="Barra de anuncios (se mueve arriba de todo)">
          <ListaTextos valores={d.anuncios} onChange={(anuncios) => set({ anuncios })} max={6} placeholder="ENVÍO GRATIS" />
        </Campo>
        <Campo label="Beneficios bajo el botón (máx. 6)">
          <ListaTextos valores={d.beneficios} onChange={(beneficios) => set({ beneficios })} max={6} placeholder="🚚 Envío gratis" />
        </Campo>
        <Dos>
          <Campo label="Entrega desde (días)"><input type="number" min={0} max={60} value={d.envioMin} onChange={(e) => set({ envioMin: Number(e.target.value) })} style={inp} /></Campo>
          <Campo label="Hasta (días)" ayuda="0 = no mostrar las fechas"><input type="number" min={0} max={60} value={d.envioMax} onChange={(e) => set({ envioMax: Number(e.target.value) })} style={inp} /></Campo>
        </Dos>
        <Campo label="Descripción" ayuda="Deja una línea en blanco entre párrafos. Líneas que empiezan con - o ✓ se vuelven lista. **texto** = negrita.">
          <textarea value={d.descripcion} onChange={(e) => set({ descripcion: e.target.value })} rows={7} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
        </Campo>
      </Bloque>

      <Bloque titulo="Imágenes de abajo" icono="🖼️">
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 8 }}>Las imágenes largas que van debajo del producto (beneficios, tallas, antes y después…). Se muestran a lo ancho, una tras otra.</div>
        <ListaImagenes titulo="" urls={d.imagenes} onChange={(imagenes) => set({ imagenes })} max={30} />
      </Bloque>

      <Bloque titulo="Testimonios" icono="💬">
        <Testimonios d={d} set={set} />
      </Bloque>

      <Bloque titulo="Marca y colores" icono="✨">
        <Campo label="Nombre de la tienda"><input value={d.nombreTienda} onChange={(e) => set({ nombreTienda: e.target.value })} style={inp} /></Campo>
        <UnaImagen titulo="Logo (si no hay, se muestra el nombre)" url={d.logo} onChange={(logo) => set({ logo })} png />
        <Dos>
          <Campo label="Barra de anuncios"><Color valor={d.colorPrincipal} onChange={(colorPrincipal) => set({ colorPrincipal })} opciones={['#121212', '#6d388b', '#1e3a8a', '#0f766e', '#9f1239']} /></Campo>
          <Campo label="Botón y etiquetas verdes"><Color valor={d.colorBoton} onChange={(colorBoton) => set({ colorBoton })} opciones={['#16a34a', '#00af19', '#f01111', '#ea580c', '#7c3aed']} /></Campo>
        </Dos>
        <Campo label="Cintas y oferta elegida"><Color valor={d.colorAcento} onChange={(colorAcento) => set({ colorAcento })} opciones={['#0f3a3f', '#121212', '#7c2d12', '#4c1d95', '#be123c']} /></Campo>
      </Bloque>

      <Bloque titulo="SEO y vista al compartir" icono="🔎">
        <SeoCampos titulo={d.seoTitulo} descripcion={d.seoDescripcion} imagen={d.seoImagen}
          autoTitulo={`${d.nombre}${d.nombreTienda ? ' | ' + d.nombreTienda : ''}`}
          autoDescripcion={[d.destacado, d.descripcion.replace(/\*\*/g, '')].filter(Boolean).join('. ') || `${d.nombre}. Pago contra entrega y envío a toda Colombia.`}
          autoImagen={d.galeria[0] || ''} url={l.url}
          onChange={(p) => set(p)} />
      </Bloque>

      <Bloque titulo="Pedidos y seguimiento" icono="📦">
        <Interruptor valor={d.confirmarWhatsapp} onChange={(confirmarWhatsapp) => set({ confirmarWhatsapp })} titulo="Pedir confirmación por WhatsApp" ayuda="Al llegar el pedido, el cliente recibe la plantilla de confirmación (Sí / No)." />
        <Interruptor valor={d.autoDespacho} onChange={(autoDespacho) => set({ autoDespacho })} titulo="Despachar solo cuando el cliente confirme" ayuda="Crea la remisión/guía automáticamente al recibir el «Sí»." />
        <Interruptor valor={d.pedirCorreo} onChange={(pedirCorreo) => set({ pedirCorreo })} titulo="Pedir correo en el formulario (opcional para el cliente)" />
        <Dos>
          <Campo label="Título del formulario"><input value={d.tituloForm} onChange={(e) => set({ tituloForm: e.target.value })} style={inp} /></Campo>
          <Campo label="Botón del formulario"><input value={d.botonForm} onChange={(e) => set({ botonForm: e.target.value })} style={inp} /></Campo>
        </Dos>
        <Campo label="Mensaje al terminar el pedido"><textarea value={d.gracias} onChange={(e) => set({ gracias: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} /></Campo>
        <Dos>
          <Campo label="WhatsApp del botón flotante" ayuda="Con indicativo, ej. 573001234567. Vacío = sin botón."><input value={d.whatsapp} onChange={(e) => set({ whatsapp: e.target.value.replace(/\D/g, '') })} inputMode="numeric" style={inp} /></Campo>
          <Campo label="ID del Píxel de Meta" ayuda="Registra visitas, inicio de compra y compras."><input value={d.pixelMeta} onChange={(e) => set({ pixelMeta: e.target.value.replace(/\D/g, '') })} inputMode="numeric" style={inp} /></Campo>
        </Dos>
      </Bloque>
    </div>
  );

  const vista = (
    <div style={{ ...card, padding: 10, position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', height: angosto ? '78vh' : 'calc(100vh - 170px)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', flex: 1 }}>Vista previa{htmlCodigo !== null ? ' · tu código' : htmlPlantilla !== null ? ' · tu plantilla' : ''}</span>
        <button onClick={() => setDisp('cel')} style={{ ...btn, ...(disp === 'cel' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>📱 Celular</button>
        <button onClick={() => setDisp('pc')} style={{ ...btn, ...(disp === 'pc' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>🖥️ Computador</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: 'var(--df-surface-2, #f4f4f5)', borderRadius: 10, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <iframe title="Vista previa de la landing" srcDoc={htmlCodigo ?? htmlPlantilla ?? html} sandbox="allow-scripts"
          style={{ width: disp === 'cel' ? 390 : '100%', maxWidth: '100%', height: '100%', border: 'none', background: '#fff', boxShadow: disp === 'cel' ? '0 0 0 1px var(--df-border)' : 'none' }} />
      </div>
    </div>
  );

  return (
    <section data-screen-label="Editor de landing">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={onSalir} style={btn}>← Tienda en línea</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre}</h1>
            <Estado l={l} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--df-text-muted)', marginTop: 3, flexWrap: 'wrap' }}>
            <span>{base.replace(/^https?:\/\//, '')}</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} onBlur={() => void guardarSlug()} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Dirección de la landing" style={{ ...inp, width: 190, padding: '2px 6px', fontSize: 12 }} />
          </div>
        </div>
        <span style={{ fontSize: 12, color: estadoGuardado === 'error' ? 'var(--df-danger)' : 'var(--df-text-muted)', minWidth: 90, textAlign: 'right' }}>
          {estadoGuardado === 'pendiente' || estadoGuardado === 'guardando' ? 'Guardando…' : estadoGuardado === 'ok' ? '✓ Guardado' : estadoGuardado === 'error' ? 'Sin guardar' : ''}
        </span>
        {l.estado === 'publicada' && <a href={l.url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Ver página ↗</a>}
        {l.estado === 'publicada' ? <button onClick={() => void despublicar()} style={btn}>Despublicar</button>
          : <button onClick={() => void publicar()} className="df-btn-primary" style={{ ...btnPri, padding: '8px 16px' }}>Publicar</button>}
      </div>

      {angosto ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button onClick={() => setPestana('editar')} style={{ ...btn, flex: 1, ...(pestana === 'editar' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>✏️ Editar</button>
            <button onClick={() => setPestana('ver')} style={{ ...btn, flex: 1, ...(pestana === 'ver' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>👁 Vista previa</button>
          </div>
          {pestana === 'editar' ? formularios : vista}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 460px) 1fr', gap: 16, alignItems: 'start' }}>
          <div>{formularios}</div>
          {vista}
        </div>
      )}
      {verPlantillas && <PlantillasModal landings={[l]} onCerrar={() => setVerPlantillas(false)} />}
    </section>
  );
}

// ── Piezas del formulario ──────────────────────────────────────────────
function Bloque({ titulo, icono, abierto = false, children }: { titulo: string; icono: string; abierto?: boolean; children: ReactNode }) {
  const [a, setA] = useState(abierto);
  return (
    <div style={card}>
      <button onClick={() => setA(!a)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: '12px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--df-text-strong)', textAlign: 'left' }}>
        <span>{icono}</span><span style={{ flex: 1 }}>{titulo}</span><span style={{ color: 'var(--df-text-faint)', fontSize: 11, transform: a ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {a && <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
}
function Campo({ label, ayuda, children }: { label: ReactNode; ayuda?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--df-text-body)' }}>{label}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--df-text-faint)', lineHeight: 1.4 }}>{ayuda}</span>}
    </label>
  );
}
const Dos = ({ children }: { children: ReactNode }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
function Dinero({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--df-text-faint)' }}>$</span>
      <input inputMode="numeric" value={valor ? valor.toLocaleString('es-CO') : ''} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} style={{ ...inp, paddingLeft: 22, fontFamily: "'JetBrains Mono',monospace" }} />
    </div>
  );
}
function Color({ valor, onChange, opciones }: { valor: string; onChange: (c: string) => void; opciones: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} style={{ width: 34, height: 30, border: '1px solid var(--df-border)', borderRadius: 6, padding: 1, background: 'none' }} />
      {opciones.map((c) => <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} style={{ width: 20, height: 20, borderRadius: '50%', border: valor.toLowerCase() === c ? '2px solid var(--df-text-strong)' : '1px solid var(--df-border)', background: c, cursor: 'pointer', padding: 0 }} />)}
    </div>
  );
}
function Interruptor({ valor, onChange, titulo, ayuda }: { valor: boolean; onChange: (v: boolean) => void; titulo: string; ayuda?: string }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--df-purple)' }} />
      <span><span style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</span>{ayuda && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--df-text-faint)' }}>{ayuda}</span>}</span>
    </label>
  );
}
function ListaTextos({ valores, onChange, max, placeholder }: { valores: string[]; onChange: (v: string[]) => void; max: number; placeholder: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {valores.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input value={v} onChange={(e) => onChange(valores.map((x, k) => (k === i ? e.target.value : x)))} style={inp} />
          <button type="button" onClick={() => onChange(valores.filter((_, k) => k !== i))} style={{ ...btn, color: 'var(--df-danger)' }} aria-label="Quitar">✕</button>
        </div>
      ))}
      {valores.length < max && <button type="button" onClick={() => onChange([...valores, ''])} style={{ ...btn, alignSelf: 'flex-start' }}>+ Agregar {placeholder ? `(ej. ${placeholder})` : ''}</button>}
    </div>
  );
}

function SubirBoton({ onArchivos, multiple = false, texto, png = false }: { onArchivos: (urls: string[]) => void; multiple?: boolean; texto: string; png?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple={multiple} hidden onChange={async (e) => {
        const fs = Array.from(e.target.files || []);
        e.target.value = '';
        if (!fs.length) return;
        setSubiendo(true);
        const urls = await subir(fs, png);
        setSubiendo(false);
        if (urls.length) onArchivos(urls);
      }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} style={{ ...btn, opacity: subiendo ? 0.6 : 1 }}>{subiendo ? 'Subiendo…' : texto}</button>
    </>
  );
}
function UnaImagen({ titulo, url, onChange, png = false }: { titulo: string; url: string; onChange: (u: string) => void; png?: boolean }) {
  return (
    <div>
      {titulo && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{titulo}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {url && <img src={url} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--df-border)' }} />}
        <SubirBoton texto={url ? 'Cambiar' : 'Subir imagen'} onArchivos={(u) => onChange(u[0])} png={png} />
        {url && <button type="button" onClick={() => onChange('')} style={{ ...btn, color: 'var(--df-danger)' }}>Quitar</button>}
      </div>
    </div>
  );
}
function ListaImagenes({ titulo, urls, onChange, max, cuadrada = false }: { titulo: string; urls: string[]; onChange: (u: string[]) => void; max: number; cuadrada?: boolean }) {
  const mover = (i: number, k: number) => { const n = [...urls]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + k)), 0, x); onChange(n); };
  return (
    <div>
      {titulo && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{titulo}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 8 }}>
        {urls.map((u, i) => (
          <div key={u + i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--df-border)', aspectRatio: cuadrada ? '1/1' : '3/4', background: 'var(--df-surface-2, #f4f4f5)' }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,.55)' }}>
              <button type="button" onClick={() => mover(i, -1)} disabled={!i} style={miniBtn} aria-label="Mover a la izquierda">‹</button>
              <button type="button" onClick={() => onChange(urls.filter((_, k) => k !== i))} style={miniBtn} aria-label="Quitar">✕</button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === urls.length - 1} style={miniBtn} aria-label="Mover a la derecha">›</button>
            </div>
            {i === 0 && cuadrada && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9.5, fontWeight: 800, background: 'var(--df-purple)', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>PRINCIPAL</span>}
          </div>
        ))}
      </div>
      {urls.length < max && <SubirBoton multiple texto="+ Subir imágenes" onArchivos={(u) => onChange([...urls, ...u].slice(0, max))} />}
    </div>
  );
}
const miniBtn: CSSProperties = { flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', padding: '3px 0' };

function Opciones({ d, set }: { d: LandingDatos; set: (p: Partial<LandingDatos>) => void }) {
  const ops = d.opciones;
  const cambiar = (i: number, o: LandingDatos['opciones'][number]) => set({ opciones: ops.map((x, k) => (k === i ? o : x)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Ej. Color (Negro, Blanco…) y Talla (S, M, L…). Si el cliente lleva varias unidades, elige la variante de cada una en el formulario.</div>
      {ops.map((o, i) => (
        <div key={i} style={{ border: '1px dashed var(--df-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={o.nombre} onChange={(e) => cambiar(i, { ...o, nombre: e.target.value })} placeholder="Nombre (ej. Color)" style={{ ...inp, fontWeight: 600 }} />
            <button type="button" onClick={() => set({ opciones: ops.filter((_, k) => k !== i) })} style={{ ...btn, color: 'var(--df-danger)' }}>Quitar</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {o.valores.map((v, vi) => (
              <span key={vi} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--df-border)', borderRadius: 999, padding: '3px 6px 3px 4px', fontSize: 12.5 }}>
                <FotoValor url={v.foto} onChange={(foto) => cambiar(i, { ...o, valores: o.valores.map((x, k) => (k === vi ? { ...x, foto } : x)) })} />
                <input value={v.valor} onChange={(e) => cambiar(i, { ...o, valores: o.valores.map((x, k) => (k === vi ? { ...x, valor: e.target.value } : x)) })} style={{ border: 'none', background: 'none', width: Math.max(36, v.valor.length * 7.5), fontFamily: 'inherit', fontSize: 12.5, color: 'var(--df-text)', padding: 0 }} />
                <button type="button" onClick={() => cambiar(i, { ...o, valores: o.valores.filter((_, k) => k !== vi) })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--df-text-faint)', padding: 0 }} aria-label="Quitar valor">✕</button>
              </span>
            ))}
            <input placeholder="+ valor y Enter" onKeyDown={(e) => {
              const t = e.currentTarget;
              if (e.key === 'Enter' && t.value.trim()) { e.preventDefault(); cambiar(i, { ...o, valores: [...o.valores, ...t.value.split(',').map((x) => ({ valor: x.trim(), foto: '' })).filter((x) => x.valor)] }); t.value = ''; }
            }} style={{ ...inp, width: 130, padding: '4px 8px', fontSize: 12.5 }} />
          </div>
        </div>
      ))}
      {ops.length < 3 && <button type="button" onClick={() => set({ opciones: [...ops, { nombre: ops.length ? 'Talla' : 'Color', valores: [] }] })} style={{ ...btn, alignSelf: 'flex-start' }}>+ Agregar variante</button>}
    </div>
  );
}
function FotoValor({ url, onChange }: { url: string; onChange: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => { const f = Array.from(e.target.files || []); e.target.value = ''; const u = await subir(f); if (u[0]) onChange(u[0]); }} />
      <button type="button" title={url ? 'Cambiar foto (clic derecho para quitar)' : 'Foto de esta variante (opcional)'} onClick={() => ref.current?.click()} onContextMenu={(e) => { e.preventDefault(); onChange(''); }}
        style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--df-border)', padding: 0, cursor: 'pointer', overflow: 'hidden', background: 'var(--df-surface-2, #f4f4f5)', fontSize: 10 }}>
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
      </button>
    </>
  );
}

function Bundles({ d, set }: { d: LandingDatos; set: (p: Partial<LandingDatos>) => void }) {
  const bs = d.bundles;
  const unidad = d.precioUnidadAntes || 0;
  const auto = !!d.antesAuto && unidad > 0;
  // Con el cálculo automático, el tachado de cada oferta = unidades × precio normal por unidad.
  const conAntes = (lista: LandingBundle[], u = unidad, a = auto) => (a ? lista.map((x) => ({ ...x, precioAntes: x.cantidad * u })) : lista);
  const cambiar = (i: number, p: Partial<LandingBundle>) => set({ bundles: conAntes(bs.map((x, k) => (k === i ? { ...x, ...p } : x))) });
  const nuevo = (): LandingBundle => {
    const n = (bs[bs.length - 1]?.cantidad || 0) + 1;
    return { cantidad: n, titulo: `Lleva ${n}`, subtitulo: '', precio: Math.round((d.precio * n * (n > 1 ? 0.8 : 1)) / 100) * 100, precioAntes: auto ? unidad * n : d.precioAntes * n || 0, insignia: '', imagen: '' };
  };
  const sumario = useMemo(() => bs.map((b) => (b.cantidad > 0 ? Math.round(b.precio / b.cantidad) : 0)), [bs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Campo label="Título de las ofertas"><input value={d.tituloOfertas} onChange={(e) => set({ tituloOfertas: e.target.value })} placeholder="¡Aprovecha nuestras ofertas!" style={inp} /></Campo>
      <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Campo label="Precio normal por unidad (antes de la promo)" ayuda="El precio de UNA unidad sin descuento. Sirve para calcular el precio tachado de cada oferta.">
          <Dinero valor={unidad} onChange={(v) => { const a = v > 0 && (unidad === 0 || !!d.antesAuto); set({ precioUnidadAntes: v, antesAuto: a, bundles: conAntes(bs, v, a) }); }} />
        </Campo>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: unidad ? 'pointer' : 'default', opacity: unidad ? 1 : 0.55 }}>
          <input type="checkbox" disabled={!unidad} checked={auto} onChange={(e) => set({ antesAuto: e.target.checked, bundles: conAntes(bs, unidad, e.target.checked && unidad > 0) })} style={{ accentColor: 'var(--df-purple)' }} />
          Calcular solo el precio tachado de cada oferta (unidades × {unidad ? pesos(unidad) : 'precio por unidad'})
        </label>
      </div>
      {!bs.length && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Sin ofertas se vende 1 unidad al precio del producto. Agrega ofertas tipo «Lleva 2 por…».</div>}
      {bs.map((b, i) => (
        <div key={i} style={{ border: `1px ${d.bundleInicial === i ? 'solid var(--df-purple)' : 'dashed var(--df-border)'}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 600, flex: 1, cursor: 'pointer' }}>
              <input type="radio" checked={d.bundleInicial === i} onChange={() => set({ bundleInicial: i })} style={{ accentColor: 'var(--df-purple)' }} /> Seleccionada al entrar
            </label>
            <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{pesos(sumario[i])} c/u</span>
            <button type="button" onClick={() => set({ bundles: bs.filter((_, k) => k !== i), bundleInicial: Math.max(0, Math.min(d.bundleInicial, bs.length - 2)) })} style={{ ...btn, color: 'var(--df-danger)', padding: '4px 8px' }}>Quitar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
            <Campo label="Unidades"><input type="number" min={1} max={20} value={b.cantidad} onChange={(e) => cambiar(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} style={inp} /></Campo>
            <Campo label="Título"><input value={b.titulo} onChange={(e) => cambiar(i, { titulo: e.target.value })} placeholder="Lleva 2" style={inp} /></Campo>
          </div>
          <Campo label="Etiqueta verde (al lado del título)"><input value={b.subtitulo} onChange={(e) => cambiar(i, { subtitulo: e.target.value })} placeholder="$99.950 cada uno · Envío gratis" style={inp} /></Campo>
          <Dos>
            <Campo label="Precio total"><Dinero valor={b.precio} onChange={(precio) => cambiar(i, { precio })} /></Campo>
            <Campo label={auto ? `Precio antes (auto: ${b.cantidad} × ${pesos(unidad)})` : 'Precio antes (tachado)'}>
              {auto ? <div style={{ ...inp, background: 'var(--df-surface-2)', color: 'var(--df-text-muted)', textDecoration: 'line-through' }}>{pesos(b.precioAntes)}</div> : <Dinero valor={b.precioAntes} onChange={(precioAntes) => cambiar(i, { precioAntes })} />}
            </Campo>
          </Dos>
          {b.precioAntes > b.precio && <div style={{ fontSize: 11.5, color: 'var(--df-brand-dark)', fontWeight: 600, marginTop: -2 }}>Ahorra {pesos(b.precioAntes - b.precio)} ({Math.round((1 - b.precio / b.precioAntes) * 100)}% menos)</div>}
          <Campo label="Cinta de arriba (opcional, el emoji se anima)"><input value={b.insignia} onChange={(e) => cambiar(i, { insignia: e.target.value })} placeholder="Más vendida 🔥" style={inp} /></Campo>
          <UnaImagen titulo="" url={b.imagen} onChange={(imagen) => cambiar(i, { imagen })} />
        </div>
      ))}
      {bs.length < 6 && <button type="button" onClick={() => set({ bundles: [...bs, nuevo()] })} style={{ ...btn, alignSelf: 'flex-start' }}>+ Agregar oferta</button>}
    </div>
  );
}

function Testimonios({ d, set }: { d: LandingDatos; set: (p: Partial<LandingDatos>) => void }) {
  const ts = d.testimonios;
  const cambiar = (i: number, p: Partial<LandingDatos['testimonios'][number]>) => set({ testimonios: ts.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Campo label="Título"><input value={d.tituloTestimonios} onChange={(e) => set({ tituloTestimonios: e.target.value })} style={inp} /></Campo>
      {ts.map((t, i) => (
        <div key={i} style={{ border: '1px dashed var(--df-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 6, alignItems: 'end' }}>
            <Campo label="Nombre"><input value={t.autor} onChange={(e) => cambiar(i, { autor: e.target.value })} style={inp} /></Campo>
            <Campo label="Cuándo"><input value={t.tiempo} onChange={(e) => cambiar(i, { tiempo: e.target.value })} placeholder="Hace 2 días" style={inp} /></Campo>
            <button type="button" onClick={() => set({ testimonios: ts.filter((_, k) => k !== i) })} style={{ ...btn, color: 'var(--df-danger)' }}>✕</button>
          </div>
          <Campo label="Comentario"><textarea value={t.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} /></Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, alignItems: 'end' }}>
            <Campo label="Reacciones"><input value={t.reacciones} onChange={(e) => cambiar(i, { reacciones: e.target.value })} placeholder="39" style={inp} /></Campo>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <UnaImagen titulo="Foto de perfil" url={t.avatar} onChange={(avatar) => cambiar(i, { avatar })} />
              <UnaImagen titulo="Foto del producto" url={t.imagen} onChange={(imagen) => cambiar(i, { imagen })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8 }}>
            <Campo label="Respuesta de (opcional)"><input value={t.comentarioAutor} onChange={(e) => cambiar(i, { comentarioAutor: e.target.value })} placeholder="María Nieto" style={inp} /></Campo>
            <Campo label="Comentario debajo"><input value={t.comentarioTexto} onChange={(e) => cambiar(i, { comentarioTexto: e.target.value })} placeholder="¡Te queda hermoso amiga! 😍" style={inp} /></Campo>
          </div>
        </div>
      ))}
      {ts.length < 20 && <button type="button" onClick={() => set({ testimonios: [...ts, { autor: '', avatar: '', tiempo: 'Hace 1 día', texto: '', imagen: '', reacciones: '', comentarioAutor: '', comentarioAvatar: '', comentarioTexto: '' }] })} style={{ ...btn, alignSelf: 'flex-start' }}>+ Agregar testimonio</button>}
    </div>
  );
}

// ── Dominio propio ─────────────────────────────────────────────────────
function DominioCard({ d, landings, enLinea, onCambio }: { d: DominioLandings; landings: LandingResumen[]; enLinea: boolean; onCambio: (d: DominioLandings) => void }) {
  const [abierto, setAbierto] = useState(!!d.dominio && d.estado !== 'activo');
  const [valor, setValor] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const accion = async (f: () => Promise<{ data?: DominioLandings; error?: string }>) => {
    setOcupado(true);
    const r = await f();
    setOcupado(false);
    if (r.data) onCambio(r.data); else notificar(r.error || 'No se pudo completar.', 'error');
  };
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Desconectar ${d.dominio}?`, mensaje: 'Tu tienda vuelve a la dirección gratis. Los enlaces con tu dominio dejan de funcionar.', aceptar: 'Desconectar', peligro: true }))) return;
    await accion(apiQuitarDominio);
  };
  const activo = d.estado === 'activo';
  // Mientras esté pendiente: el servidor lo revisa solo cada 2 min; aquí se refresca lo que
  // va encontrando (cada 20 s) y, con la tarjeta abierta, se pide una revisión cada minuto.
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => {
    if (!d.dominio || activo) return;
    let n = 0;
    const t = setInterval(() => {
      if (document.hidden) return;
      n++;
      void (abierto && n % 3 === 0 ? apiVerificarDominio() : apiEstadoDominio()).then((r) => {
        if (!r.data) return;
        if (r.data.estado === 'activo') notificar(`✓ ¡Tu dominio ${r.data.dominio} ya está activo!`);
        if (r.data.estado !== d.estado || r.data.detalle !== d.detalle || r.data.diag?.revisado !== d.diag?.revisado) onCambioRef.current(r.data);
      });
    }, 20_000);
    return () => clearInterval(t);
  }, [d.dominio, d.estado, d.detalle, d.diag?.revisado, activo, abierto]);
  const [sub, setSub] = useState(d.sub);
  useEffect(() => { setSub(d.sub); }, [d.sub]);
  const publicadas = landings.filter((l) => l.estado === 'publicada');
  const fila = (k: string, v: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--df-border)' }}>
      <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}>{k}</span>
      <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, overflowWrap: 'anywhere' }}>{v}</code>
      <button onClick={() => { void navigator.clipboard?.writeText(v).then(() => notificar('✓ Copiado.')).catch(() => {}); }} style={{ ...btn, padding: '3px 8px', fontSize: 11.5 }}>Copiar</button>
    </div>
  );
  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <button onClick={() => setAbierto(!abierto)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '12px 14px', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', color: 'var(--df-text-strong)' }}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{d.raiz ? 'Dirección de tu tienda' : 'Dominio propio'}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--df-text-muted)' }}>{d.dominio ? <>{d.dominio} · {activo ? <b style={{ color: 'var(--df-success, #16a34a)' }}>Activo</b> : <b style={{ color: 'var(--df-warning)' }}>Pendiente</b>}</> : d.raiz ? <><b style={{ color: 'var(--df-text-body)' }}>{d.sub}.{d.raiz}</b> · gratis · o conecta tu propio dominio</> : 'Muestra tus landings en tutienda.com/producto'}</span>
        </span>
        <span style={{ color: 'var(--df-text-faint)', fontSize: 11, transform: abierto ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {abierto && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {d.raiz && (
            <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>🎁 Tu dirección gratis</div>
              {!enLinea && <div style={{ fontSize: 12.5, background: 'var(--df-warning-subtle-2, #FFFBEB)', border: '1px solid var(--df-warning-border, #FDE68A)', borderRadius: 8, padding: '7px 10px', color: 'var(--df-text-body)' }}>⏸️ Tu tienda está en pausa: quien abra la dirección ve «Tienda en pausa». Se enciende sola cuando actives la membresía (arriba). Para cambiar el nombre de la dirección también necesitas la membresía activa.</div>}
              {enLinea && !publicadas.length && <div style={{ fontSize: 12.5, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', color: 'var(--df-text-body)' }}>Aún no tienes productos publicados: tu dirección muestra «Pronto tendremos productos disponibles». Publica al menos uno.</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ color: 'var(--df-text-muted)' }}>https://</span>
                <input value={sub} onChange={(e) => setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} aria-label="Nombre de tu tienda en la dirección" style={{ ...inp, width: 170, padding: '5px 8px' }} />
                <b>.{d.raiz}</b>
                {sub !== d.sub
                  ? <button onClick={() => void accion(() => apiSubdominio(sub))} disabled={ocupado || sub.length < 3 || !enLinea} title={enLinea ? undefined : 'Activa la membresía para cambiar la dirección'} style={{ ...btnPri, padding: '5px 10px', opacity: ocupado || sub.length < 3 || !enLinea ? 0.6 : 1 }}>Guardar</button>
                  : <a href={`https://${d.sub}.${d.raiz}`} target="_blank" rel="noreferrer" style={{ ...btn, padding: '5px 10px', textDecoration: 'none' }}>Abrir ↗</a>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Tu tienda queda en {d.sub}.{d.raiz} y cada producto en {d.sub}.{d.raiz}/nombre-del-producto. Si cambias el nombre, los enlaces anteriores dejan de funcionar.</div>
            </div>
          )}
          {d.raiz && !d.dominio && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>🌐 ¿Tienes tu propio dominio? (opcional)</div>}
          {!d.dominio ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--df-text-body)' }}>Escribe el dominio que compraste (te recomendamos usar <b>www</b>, por ejemplo <b>www.tutienda.com</b>).</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="www.tutienda.com" style={{ ...inp, flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === 'Enter' && valor.trim()) void accion(() => apiConectarDominio(valor)); }} />
                <button onClick={() => void accion(() => apiConectarDominio(valor))} disabled={ocupado || !valor.trim()} style={{ ...btnPri, opacity: ocupado || !valor.trim() ? 0.6 : 1 }}>{ocupado ? 'Conectando…' : 'Conectar dominio'}</button>
              </div>
            </>
          ) : (
            <>
              {!activo && (
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>1. En tu proveedor del dominio (GoDaddy, Hostinger, Namecheap…) crea este registro DNS:</div>
                  {fila('Tipo', 'CNAME')}
                  {fila('Nombre', d.nombreRegistro)}
                  {fila('Apunta a', d.cname)}
                  <div style={{ fontSize: 12, color: 'var(--df-text-faint)', marginTop: 6 }}>Si usas Cloudflare, pon ese registro con la nube <b>gris</b> («Solo DNS»). Si usaste www, en tu proveedor redirige también tutienda.com (sin www) hacia www.tutienda.com.</div>
                  {d.apex && <div style={{ fontSize: 12, marginTop: 6, background: 'var(--df-warning-subtle-2, #FFFBEB)', border: '1px solid var(--df-warning-border, #FDE68A)', borderRadius: 8, padding: '7px 10px' }}>⚠️ Conectaste el dominio sin <b>www</b>. Muchos proveedores (GoDaddy, Hostinger…) no dejan crear un CNAME ahí y por eso nunca se activa. Si en 15 minutos sigue pendiente, desconéctalo y conecta <b>www.{d.dominio}</b>.</div>}
                  <div style={{ fontWeight: 700, margin: '10px 0 0' }}>2. Listo: lo revisamos solos cada par de minutos (preguntando directo a tu proveedor, así vemos los cambios al instante) y te avisamos. También puedes tocar «Verificar».</div>
                  {d.diag && (
                    <div style={{ marginTop: 10, border: '1px solid var(--df-border)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        ['Tu dominio apunta a DealFlow (DNS)', d.diag.dns, d.diag.dnsDetalle],
                        ['Certificado de seguridad (HTTPS)', d.diag.dns !== 'ok' ? 'espera' : d.diag.ssl, d.diag.dns !== 'ok' ? 'Se genera solo apenas el DNS apunte bien.' : d.diag.sslDetalle],
                      ] as const).map(([t, est, det]) => (
                        <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                          <span style={{ fontSize: 14, lineHeight: 1.2 }}>{est === 'ok' ? '✅' : est === 'error' ? '❌' : '⏳'}</span>
                          <span><b>{t}</b>{det ? <span style={{ display: 'block', color: 'var(--df-text-muted)' }}>{det}</span> : null}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>Última revisión: {new Date(d.diag.revisado).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  )}
                  {!!d.diag?.extra?.length && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{d.diag.extra.some((x) => x.obligatorio) ? '3. Crea también este registro (obligatorio)' : 'Opcional, para que quede más rápido: crea también estos registros'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>En «Nombre» escribe exactamente lo que sale aquí: tu proveedor (Hostinger, GoDaddy…) le agrega el dominio solo.</div>
                      {d.diag.extra.map((x) => (
                        <div key={x.nombre + x.valor} style={{ marginTop: 6, ...(x.obligatorio ? { border: '1px solid var(--df-warning-border, #FDE68A)', background: 'var(--df-warning-subtle-2, #FFFBEB)', borderRadius: 8, padding: '6px 8px' } : {}) }}>
                          <div style={{ fontSize: 11.5, color: x.obligatorio ? 'var(--df-warning, #b45309)' : 'var(--df-text-muted)', fontWeight: x.obligatorio ? 700 : 400 }}>{x.para}</div>
                          {fila('Tipo', x.tipo)}
                          {fila('Nombre', x.nombre)}
                          {fila('Valor', x.valor)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {d.detalle && (activo || !d.diag || d.detalle !== d.diag.dnsDetalle) && <div style={{ fontSize: 12.5, borderRadius: 8, padding: '8px 10px', background: activo ? 'var(--df-success-subtle, #dcfce7)' : 'var(--df-warning-subtle, #fef3c7)', color: activo ? 'var(--df-success, #166534)' : 'var(--df-text-body)' }}>{d.detalle}</div>}
              {activo && (
                <Campo label="Página que se abre en tu dominio sin nada después (tutienda.com)">
                  <select value={d.inicio} onChange={(e) => void accion(() => apiInicioDominio(e.target.value))} style={inp}>
                    <option value="">Todos mis productos (recomendado)</option>
                    {publicadas.map((l) => <option key={l.id} value={l.id}>{l.nombre} (/{l.slug})</option>)}
                  </select>
                </Campo>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!activo && <button onClick={() => void accion(apiVerificarDominio)} disabled={ocupado} style={{ ...btnPri, opacity: ocupado ? 0.6 : 1 }}>{ocupado ? 'Verificando…' : 'Verificar'}</button>}
                {activo && <a href={`https://${d.dominio}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Abrir {d.dominio} ↗</a>}
                <button onClick={() => void quitar()} disabled={ocupado} style={{ ...btn, color: 'var(--df-danger)' }}>Desconectar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Membresía ──────────────────────────────────────────────────────────
function MembresiaCard({ m }: { m: MembresiaTienda }) {
  const [ocupado, setOcupado] = useState(false);
  const pagar = async () => {
    setOcupado(true);
    const r = await apiPagarMembresia();
    setOcupado(false);
    if (r.data?.gratis) { notificar('✓ La Tienda en línea está activa.'); window.location.reload(); return; }
    if (r.data?.url) window.location.href = r.data.url; else notificar(r.error || 'No se pudo abrir el pago.', 'error');
  };
  const fecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  if (m.cortesia) return null;
  if (m.activa) {
    const pronto = m.diasRestantes <= 5;
    return (
      <div style={{ ...card, padding: '11px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderColor: pronto ? 'var(--df-warning)' : 'var(--df-border)' }}>
        <span style={{ fontSize: 18 }}>{pronto ? '⏳' : '✅'}</span>
        <div style={{ fontSize: 13.5, flex: 1, minWidth: 220 }}>Membresía activa hasta el <b>{fecha(m.vence)}</b>{pronto ? <> · vence en {m.diasRestantes} día{m.diasRestantes === 1 ? '' : 's'}</> : ''}.</div>
        <button onClick={() => void pagar()} disabled={ocupado} style={pronto ? btnPri : btn}>{ocupado ? 'Abriendo…' : `Renovar · ${pesos(m.precio)}`}</button>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: '18px 18px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(135deg, var(--df-purple-subtle, #f5f3ff), var(--df-surface))', borderColor: 'var(--df-purple-border, var(--df-border))' }}>
      <span style={{ fontSize: 34 }}>🛍️</span>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{m.enGracia ? 'Tu membresía venció: renuévala para que tu tienda siga en línea' : 'Activa tu Tienda en línea'}</div>
        <div style={{ fontSize: 13, color: 'var(--df-text-body)', marginTop: 3 }}>
          <b>{pesos(m.precio)} al mes.</b> Productos y landings ilimitados, dirección gratis para tu tienda, tu propio dominio y pedidos directo a DealFlow.
          {!m.enGracia && ' Puedes armar tus productos desde ya; se publican al activar.'}
        </div>
      </div>
      <button onClick={() => void pagar()} disabled={ocupado} className="df-btn-primary" style={{ ...btnPri, padding: '11px 18px', fontSize: 14 }}>{ocupado ? 'Abriendo…' : 'Activar membresía'}</button>
    </div>
  );
}

// ── Datos de la tienda (página de inicio) ─────────────────────────────
function TiendaCard({ t, onGuardada }: { t: TiendaConfig; onGuardada: (t: TiendaConfig) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [c, setC] = useState(t);
  const [html, setHtml] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setC(t); }, [t]);
  useEffect(() => {
    if (!abierto) return;
    const tv = setTimeout(() => { void apiVistaTienda(c).then((r) => { if (r.data) setHtml(r.data.html); }); }, 400);
    return () => clearTimeout(tv);
  }, [c, abierto]);
  const set = (p: Partial<TiendaConfig>) => setC((x) => ({ ...x, ...p }));
  const guardar = async () => {
    setGuardando(true);
    const r = await apiGuardarTienda(c);
    setGuardando(false);
    if (r.data) { onGuardada(r.data.tienda); notificar('✓ Tienda guardada.'); } else notificar(r.error || 'No se pudo guardar.', 'error');
  };
  const cambios = JSON.stringify(c) !== JSON.stringify(t);
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <button onClick={() => setAbierto(!abierto)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '12px 14px', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', color: 'var(--df-text-strong)' }}>
        {t.logo ? <img src={t.logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} /> : <span style={{ fontSize: 18 }}>🏪</span>}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Mi tienda · página de inicio</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--df-text-muted)' }}>{t.nombre} · logo, portada, colores y textos de la página con todos tus productos</span>
        </span>
        <span style={{ color: 'var(--df-text-faint)', fontSize: 11, transform: abierto ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {abierto && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Campo label="Nombre de la tienda"><input value={c.nombre} onChange={(e) => set({ nombre: e.target.value })} style={inp} /></Campo>
            <UnaImagen titulo="Logo" url={c.logo} onChange={(logo) => set({ logo })} png />
            <UnaImagen titulo="Favicon (el iconito de la pestaña del navegador; cuadrado, si no se usa el logo)" url={c.favicon} onChange={(favicon) => set({ favicon })} png />
            <UnaImagen titulo="Portada (banner ancho, opcional)" url={c.banner} onChange={(banner) => set({ banner })} />
            <Campo label="Título"><input value={c.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Nueva colección · Envío gratis a toda Colombia" style={inp} /></Campo>
            <Campo label="Descripción corta"><textarea value={c.descripcion} onChange={(e) => set({ descripcion: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} /></Campo>
            <Campo label="Barra de anuncios (se mueve)"><ListaTextos valores={c.anuncios} onChange={(anuncios) => set({ anuncios })} max={6} placeholder="ENVÍO GRATIS" /></Campo>
            <Dos>
              <Campo label="Barra y pie"><Color valor={c.colorPrincipal} onChange={(colorPrincipal) => set({ colorPrincipal })} opciones={['#121212', '#6d388b', '#1e3a8a', '#0f766e', '#9f1239']} /></Campo>
              <Campo label="Botones y descuentos"><Color valor={c.colorBoton} onChange={(colorBoton) => set({ colorBoton })} opciones={['#16a34a', '#00af19', '#f01111', '#ea580c', '#7c3aed']} /></Campo>
            </Dos>
            <Dos>
              <Campo label="WhatsApp (botón flotante)"><input value={c.whatsapp} onChange={(e) => set({ whatsapp: e.target.value.replace(/\D/g, '') })} placeholder="573001234567" inputMode="numeric" style={inp} /></Campo>
              <Campo label="ID del Píxel de Meta"><input value={c.pixelMeta} onChange={(e) => set({ pixelMeta: e.target.value.replace(/\D/g, '') })} inputMode="numeric" style={inp} /></Campo>
            </Dos>
            <div style={{ borderTop: '1px solid var(--df-border)', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔎 SEO de la página de inicio</div>
              <SeoCampos titulo={c.seoTitulo} descripcion={c.seoDescripcion} imagen={c.seoImagen}
                autoTitulo={`${c.nombre}${c.titulo ? ' | ' + c.titulo : ''}`} autoDescripcion={c.descripcion || `${c.nombre}: pago contra entrega y envío a toda Colombia.`}
                autoImagen={c.banner || c.logo} url="" onChange={(p) => set(p)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void guardar()} disabled={guardando || !cambios} style={{ ...btnPri, opacity: guardando || !cambios ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar tienda'}</button>
              {cambios && <button onClick={() => setC(t)} style={btn}>Descartar</button>}
            </div>
          </div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden', height: 520, background: '#fff' }}>
            <iframe title="Vista previa de la tienda" srcDoc={html} sandbox="allow-scripts" style={{ width: '100%', height: '100%', border: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SEO: lo que sale en Google y al compartir el enlace ───────────────
function SeoCampos({ titulo, descripcion, imagen, autoTitulo, autoDescripcion, autoImagen, url, onChange }: {
  titulo: string; descripcion: string; imagen: string; autoTitulo: string; autoDescripcion: string; autoImagen: string; url: string;
  onChange: (p: { seoTitulo?: string; seoDescripcion?: string; seoImagen?: string }) => void;
}) {
  const t = titulo || autoTitulo;
  const dsc = (descripcion || autoDescripcion).replace(/\s+/g, ' ').trim();
  const img = imagen || autoImagen;
  const dominio = url ? url.replace(/^https?:\/\//, '').split('/')[0] : 'tutienda.dflw.store';
  const cuenta = (n: number, max: number) => <span style={{ color: n > max ? 'var(--df-danger)' : 'var(--df-text-faint)', fontWeight: 400 }}> · {n}/{max}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Si los dejas vacíos se arman solos con el nombre, la descripción y la primera foto.</div>
      <Campo label={<>Título para Google{cuenta(t.length, 60)}</>}><input value={titulo} onChange={(e) => onChange({ seoTitulo: e.target.value })} placeholder={autoTitulo} style={inp} /></Campo>
      <Campo label={<>Descripción para Google{cuenta(dsc.length, 160)}</>}><textarea value={descripcion} onChange={(e) => onChange({ seoDescripcion: e.target.value })} placeholder={autoDescripcion.slice(0, 160)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Campo>
      <UnaImagen titulo="Imagen al compartir (WhatsApp, Facebook; ideal 1200×630)" url={imagen} onChange={(seoImagen) => onChange({ seoImagen })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', background: '#fff', color: '#202124' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5f6368', marginBottom: 5 }}>ASÍ SE VE EN GOOGLE</div>
          <div style={{ fontSize: 12, color: '#4d5156', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dominio}</div>
          <div style={{ fontSize: 16, color: '#1a0dab', lineHeight: 1.3, margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</div>
          <div style={{ fontSize: 12.5, color: '#4d5156', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{dsc.slice(0, 160)}</div>
        </div>
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden', background: '#e7ffdb', color: '#111' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5f6368', padding: '8px 10px 6px' }}>ASÍ SE VE EN WHATSAPP</div>
          <div style={{ margin: '0 8px 8px', background: '#f7f8fa', borderRadius: 8, overflow: 'hidden' }}>
            {img ? <img src={img} alt="" style={{ width: '100%', aspectRatio: '1.91/1', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '1.91/1', display: 'grid', placeItems: 'center', fontSize: 12, color: '#999' }}>Sin imagen</div>}
            <div style={{ padding: '7px 9px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</div>
              <div style={{ fontSize: 11.5, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dsc}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{dominio}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
