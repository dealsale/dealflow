import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiPlantillasTienda, apiGuardarPlantillaTienda, apiBorrarPlantillaTienda, apiVistaPlantillaTienda, apiUsarPlantilla, type PlantillaTienda, type LandingResumen } from '../lib/api';
import { confirmar, notificar } from './dialogs';

const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff', fontWeight: 700 };
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const fecha = (s: string) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '');
const descargar = (nombre: string, html: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const archivoSeguro = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plantilla';

/**
 * Mis plantillas: diseños HTML de la tienda (tipo temas de Shopify) con marcas como
 * {{producto.nombre}} que se llenan con los datos de cada landing que los use.
 */
export function PlantillasModal({ landings, onCerrar }: { landings: LandingResumen[]; onCerrar: () => void }) {
  const [lista, setLista] = useState<PlantillaTienda[] | null>(null);
  const [ejemplo, setEjemplo] = useState('');
  const [guia, setGuia] = useState('');
  const [editando, setEditando] = useState<PlantillaTienda | null>(null);
  const cargar = () => void apiPlantillasTienda().then((r) => { if (r.data) { setLista(r.data.plantillas); setEjemplo(r.data.ejemplo); setGuia(r.data.guia); } else notificar(r.error || 'No se pudieron cargar las plantillas.', 'error'); });
  useEffect(cargar, []);
  const borrar = async (p: PlantillaTienda) => {
    if (!(await confirmar({ titulo: `¿Borrar la plantilla "${p.nombre}"?`, mensaje: 'Esto no se puede deshacer.', aceptar: 'Borrar', peligro: true }))) return;
    const r = await apiBorrarPlantillaTienda(p.id); if (r.error) notificar(r.error, 'error'); else cargar();
  };
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 14, width: editando ? 'min(1280px, 100%)' : 'min(820px, 100%)', height: editando ? '92vh' : 'auto', maxHeight: '92vh', overflow: 'auto', padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        {editando ? (
          <EditorPlantilla p={editando} landings={landings} guia={guia} onVolver={() => { setEditando(null); cargar(); }} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>🎨 Mis plantillas</div>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>Diseños propios en HTML, como los temas de Shopify. Haces (o le pides a una IA) la plantilla una vez con marcas como <code>{'{{producto.nombre}}'}</code>, <code>{'{{precio}}'}</code> o <code>{'{{formulario}}'}</code>, y cualquier landing la usa llenándose con su producto, sus fotos, variantes y ofertas.</div>
              </div>
              <button onClick={() => setEditando({ id: '', nombre: '', html: ejemplo, gracias: '', usos: 0, updatedAt: '' })} style={btnPri}>＋ Nueva plantilla</button>
              <button onClick={onCerrar} style={btn}>Cerrar</button>
            </div>
            {lista === null ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>
              : !lista.length ? <div style={{ padding: '26px 10px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 13.5 }}>Todavía no tienes plantillas. Toca <b>＋ Nueva plantilla</b>: arranca con un ejemplo que trae todas las marcas.</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lista.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div>
                        <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>{p.usos} landing{p.usos === 1 ? '' : 's'} la usa{p.usos === 1 ? '' : 'n'} · editada {fecha(p.updatedAt)}{p.gracias.trim() ? ' · con página de gracias' : ''}</div>
                      </div>
                      <button onClick={() => setEditando(p)} style={btn}>✏️ Editar</button>
                      <button onClick={() => descargar(`${archivoSeguro(p.nombre)}.html`, p.html)} style={btn}>⬇ Descargar</button>
                      <button onClick={() => void borrar(p)} style={{ ...btn, color: 'var(--df-danger)' }}>Borrar</button>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

function EditorPlantilla({ p, landings, guia, onVolver }: { p: PlantillaTienda; landings: LandingResumen[]; guia: string; onVolver: () => void }) {
  const [id, setId] = useState(p.id);
  const [nombre, setNombre] = useState(p.nombre);
  const [pag, setPag] = useState<'landing' | 'gracias'>('landing');
  const [texto, setTexto] = useState({ landing: p.html, gracias: p.gracias });
  const [guardado, setGuardado] = useState({ landing: p.html, gracias: p.gracias, nombre: p.nombre });
  const [conLanding, setConLanding] = useState(landings[0]?.id || '');
  const [vista, setVista] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [verGuia, setVerGuia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [disp, setDisp] = useState<'cel' | 'pc'>('cel');
  const archivo = useRef<HTMLInputElement>(null);
  const cambiado = texto.landing !== guardado.landing || texto.gracias !== guardado.gracias || nombre !== guardado.nombre;

  useEffect(() => {
    const t = setTimeout(() => void apiVistaPlantillaTienda(texto[pag], pag, conLanding || undefined).then((r) => { if (r.data) { setVista(r.data.html); setAvisos(r.data.avisos); } else { setVista(''); setAvisos([r.error || 'No se pudo armar la vista previa.']); } }), 600);
    return () => clearTimeout(t);
  }, [texto, pag, conLanding]);

  const guardar = async () => {
    if (!nombre.trim()) return notificar('Ponle un nombre a la plantilla.', 'error');
    setGuardando(true);
    const r = await apiGuardarPlantillaTienda(id || null, { nombre, html: texto.landing, gracias: texto.gracias });
    setGuardando(false);
    if (!r.data) return notificar(r.error || 'No se pudo guardar.', 'error');
    setId(r.data.plantilla.id); setGuardado({ landing: texto.landing, gracias: texto.gracias, nombre });
    notificar(`✓ Plantilla guardada.${r.data.plantilla.usos ? ` Las ${r.data.plantilla.usos} landings que la usan ya se ven así.` : ' Elígela en cualquier landing → 🎨 Diseño de la página.'}`);
  };
  const volver = async () => { if (cambiado && !(await confirmar({ titulo: 'Tienes cambios sin guardar', mensaje: '¿Salir sin guardar?', aceptar: 'Salir sin guardar', peligro: true }))) return; onVolver(); };
  const subir = (f?: File) => {
    if (!f) return;
    if (f.size > 1_500_000) return notificar('El archivo pesa más de 1,5 MB.', 'error');
    void f.text().then((t) => { setTexto((x) => ({ ...x, [pag]: t })); if (!nombre.trim()) setNombre(f.name.replace(/\.html?$/i, '')); notificar(`✓ ${f.name} cargado. Revisa la vista previa y guarda.`); });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void volver()} style={btn}>← Mis plantillas</button>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la plantilla (ej. Moda premium)" style={{ ...inp, flex: 1, minWidth: 200, fontWeight: 700 }} />
        <button onClick={() => void guardar()} disabled={guardando || !cambiado} style={{ ...btnPri, opacity: guardando || !cambiado ? 0.6 : 1 }}>{guardando ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear plantilla'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['landing', 'gracias'] as const).map((x) => <button key={x} onClick={() => setPag(x)} style={{ ...btn, ...(pag === x ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>{x === 'landing' ? '🛍️ Página del producto' : '🎉 Página de gracias'}</button>)}
            <button onClick={() => archivo.current?.click()} style={btn}>⬆ Subir .html</button>
            <input ref={archivo} type="file" accept=".html,.htm,text/html" style={{ display: 'none' }} onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => descargar(`${archivoSeguro(nombre)}${pag === 'gracias' ? '-gracias' : ''}.html`, texto[pag])} style={btn}>⬇ Descargar</button>
            <button onClick={() => setVerGuia((v) => !v)} style={btn}>🤖 Guía para la IA</button>
          </div>
          {verGuia && (
            <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, padding: 10, background: 'var(--df-bg)' }}>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 6 }}>Pégale esto a Claude, Astra u otra IA junto con el diseño que quieres (una captura, un enlace o esta plantilla) y te devuelve la plantilla lista para subir.</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, margin: 0, maxHeight: 200, overflow: 'auto', fontFamily: "'JetBrains Mono',monospace" }}>{guia}</pre>
              <button onClick={() => void navigator.clipboard?.writeText(guia).then(() => notificar('✓ Guía copiada.'))} style={{ ...btn, marginTop: 8 }}>📋 Copiar guía</button>
            </div>
          )}
          {pag === 'gracias' && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Opcional: después de comprar, el cliente pasa a esta página (upsell, video, mensaje). Usa <code>{'<b data-dealflow="numero"></b>'}</code> y <code>{'<span data-dealflow="total"></span>'}</code> para el número y el total.</div>}
          <textarea value={texto[pag]} onChange={(e) => setTexto((x) => ({ ...x, [pag]: e.target.value }))} spellCheck={false}
            placeholder={pag === 'landing' ? 'HTML de la plantilla con marcas {{…}}' : 'HTML de la página de gracias (opcional)'}
            style={{ flex: 1, minHeight: 320, resize: 'none', border: '1px solid var(--df-border)', borderRadius: 8, padding: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, lineHeight: 1.45, background: '#0f172a', color: '#e2e8f0' }} />
          {avisos.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border)', borderRadius: 8, padding: '6px 9px' }}>⚠️ {a}</div>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Vista previa con:</span>
            <select value={conLanding} onChange={(e) => setConLanding(e.target.value)} style={{ ...inp, width: 'auto', flex: 1, minWidth: 140, padding: '5px 8px' }}>
              {!landings.length && <option value="">(crea una landing para ver datos reales)</option>}
              {landings.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <button onClick={() => setDisp('cel')} style={{ ...btn, ...(disp === 'cel' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>📱</button>
            <button onClick={() => setDisp('pc')} style={{ ...btn, ...(disp === 'pc' ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>🖥️</button>
          </div>
          <div style={{ flex: 1, minHeight: 360, background: 'var(--df-surface-2, #f4f4f5)', borderRadius: 10, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
            <iframe title="Vista previa de la plantilla" srcDoc={vista} sandbox="allow-scripts" style={{ width: disp === 'cel' ? 390 : '100%', maxWidth: '100%', height: '100%', border: 'none', background: '#fff' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** En cada landing: qué diseño usa (el del editor o una de mis plantillas). */
export function DisenoLanding({ landingId, plantillaId, modoCodigo, onCambio, onAdministrar }: { landingId: string; plantillaId: string; modoCodigo: boolean; onCambio: (plantillaId: string) => void; onAdministrar: () => void }) {
  const [lista, setLista] = useState<PlantillaTienda[]>([]);
  useEffect(() => { void apiPlantillasTienda().then((r) => setLista(r.data?.plantillas || [])); }, []);
  const elegir = async (pid: string) => {
    const r = await apiUsarPlantilla(landingId, pid);
    if (r.error) return notificar(r.error, 'error');
    onCambio(pid);
    notificar(pid ? '✓ La página usa ahora tu plantilla, llena con los datos de este producto.' : '✓ La página vuelve al diseño del editor.');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Elige con qué diseño se muestra esta página. Con una plantilla, lo que escribas aquí (nombre, precio, fotos, variantes, ofertas, testimonios) la llena sola.</div>
      <select value={plantillaId} onChange={(e) => void elegir(e.target.value)} style={inp}>
        <option value="">Diseño del editor (DealFlow)</option>
        {lista.map((p) => <option key={p.id} value={p.id}>🎨 {p.nombre}</option>)}
      </select>
      {modoCodigo && <div style={{ fontSize: 12, color: 'var(--df-warning)' }}>⚠️ Esta landing tiene activo el <b>Modo código</b> (su propio HTML), que manda sobre la plantilla. Para usar la plantilla, toca «Volver al editor» en Modo código.</div>}
      <button onClick={onAdministrar} style={{ ...btn, alignSelf: 'flex-start' }}>🎨 Administrar mis plantillas</button>
    </div>
  );
}
