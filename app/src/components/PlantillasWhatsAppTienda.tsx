import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apiSincronizarPlantillas, apiUpload, apiWaAutomatizacion, apiWaPlantillaCrear, apiWaPlantillaRevisar, apiWaPlantillas,
  type AutomatizacionWA, type BasePlantillaWA, type DefPlantillaWA, type EstadoPlantillasWA, type PlantillaTiendaWA, type RiesgoPlantilla,
} from '../lib/api';

/**
 * Plantillas de WhatsApp de la tienda (en la pantalla WhatsApp). Cada parte aparece solo si
 * el equipo de DealFlow la habilitó para esta tienda:
 *  - Automatizaciones: qué plantilla aprobada (Utilidad) usa el bot en cada aviso.
 *  - Constructor: crear plantillas desde una base y mandarlas a aprobar a la cuenta de Meta,
 *    con revisión de riesgo de que Meta la tome como Marketing.
 *  - Lista de las plantillas de la cuenta con su estado, categoría y calidad.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginTop: 16, minWidth: 0 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-bg)', color: 'var(--df-text)', minWidth: 0 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', margin: '10px 0 4px' };
const btn: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 14px', background: 'var(--df-brand)', color: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnS: React.CSSProperties = { ...btn, background: 'var(--df-surface-2)', color: 'var(--df-text)', border: '1px solid var(--df-border)' };
const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' });
const ESTADO: Record<string, [string, string, string]> = {
  aprobada: ['Aprobada', 'var(--df-brand-subtle)', 'var(--df-brand-dark)'], pendiente: ['En revisión', 'rgba(245,158,11,.14)', '#B45309'],
  rechazada: ['Rechazada', 'var(--df-danger-subtle-2)', 'var(--df-danger-dark)'], pausada: ['Pausada', 'var(--df-danger-subtle-2)', 'var(--df-danger-dark)'],
};
const RIESGO: Record<RiesgoPlantilla['nivel'], [string, string, string]> = {
  bajo: ['Riesgo bajo de Marketing', 'var(--df-brand-subtle)', 'var(--df-brand-dark)'], medio: ['Riesgo medio', 'rgba(245,158,11,.14)', '#B45309'], alto: ['Riesgo alto: Meta la tomaría como Marketing', 'var(--df-danger-subtle-2)', 'var(--df-danger-dark)'],
};
const catNombre = (c: string) => (c.toUpperCase() === 'MARKETING' ? 'Marketing' : c.toUpperCase() === 'UTILITY' ? 'Utilidad' : c.toUpperCase() === 'AUTHENTICATION' ? 'Autenticación' : c);

function subirArchivo(f: File): Promise<{ url?: string; error?: string }> {
  return new Promise((ok) => {
    const fr = new FileReader();
    fr.onload = () => void apiUpload(String(fr.result), f.name).then((r) => ok(r.data ? { url: r.data.url } : { error: r.error || 'No se pudo subir.' }));
    fr.onerror = () => ok({ error: 'No se pudo leer el archivo.' });
    fr.readAsDataURL(f);
  });
}

export function PlantillasWhatsAppTienda() {
  const [d, setD] = useState<EstadoPlantillasWA | null>(null);
  const [msg, setMsg] = useState('');
  const [sync, setSync] = useState(false);
  const cargar = () => void apiWaPlantillas().then((r) => { if (r.data) setD(r.data); });
  useEffect(() => { cargar(); }, []);
  if (!d) return null;
  const { permisos } = d;
  if (!permisos.crear && !permisos.automatizaciones) return null;
  const pausadas = d.automatizaciones.filter((a) => a.seleccion?.estado === 'pausada');
  const reclasificadas = d.propias.filter((p) => p.reclasificada);
  const actualizar = async () => {
    setSync(true); setMsg('');
    const r = await apiSincronizarPlantillas();
    setSync(false);
    setMsg(r.data ? `Listo: ${r.data.aprobadas} aprobadas, ${r.data.pendientes} en revisión, ${r.data.rechazadas} rechazadas o pausadas.` : r.error || 'No se pudo actualizar.');
    cargar();
  };
  return (
    <div style={card} data-testid="plantillas-tienda">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Plantillas de WhatsApp</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2 }}>Las que se usan cuando el cliente no ha escrito en 24 h. Viven en tu cuenta de WhatsApp (Meta las aprueba).</div>
        </div>
        <button type="button" onClick={() => void actualizar()} disabled={sync} style={btnS}>{sync ? 'Actualizando…' : '↻ Actualizar desde Meta'}</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 12.5, marginTop: 8, color: 'var(--df-text-muted)' }}>{msg}</div>}
      {(pausadas.length > 0 || reclasificadas.length > 0) && (
        <div role="alert" style={{ marginTop: 12, border: '1px solid var(--df-danger-border, #fecaca)', background: 'var(--df-danger-subtle-2, #fef2f2)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--df-danger-dark, #991b1b)', display: 'grid', gap: 4 }}>
          {pausadas.map((a) => <div key={a.clave}>⚠ <b>{a.titulo}</b>: {a.seleccion?.motivo} Mientras tanto se usa la plantilla de DealFlow.</div>)}
          {reclasificadas.map((p) => <div key={p.metaId}>⚠ Meta pasó <b>{p.nombre}</b> de Utilidad a Marketing: se cobra como Marketing y no sirve para las automatizaciones.</div>)}
        </div>
      )}
      {permisos.automatizaciones && <Automatizaciones d={d} onCambio={setD} />}
      {permisos.crear && <Constructor d={d} onCreada={() => { cargar(); setTimeout(cargar, 20000); }} />}
      <ListaPropias propias={d.propias} />
    </div>
  );
}

// ── Plantilla por automatización ───────────────────────────────────────
function Automatizaciones({ d, onCambio }: { d: EstadoPlantillasWA; onCambio: (d: EstadoPlantillasWA) => void }) {
  const utiles = d.propias.filter((p) => p.estado === 'aprobada' && p.categoria.toUpperCase() === 'UTILITY');
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>Plantilla por automatización</div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginTop: 2 }}>Si no eliges, el bot usa la de DealFlow. Solo aparecen tus plantillas <b>aprobadas como Utilidad</b>.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {d.automatizaciones.map((a) => <FilaAuto key={a.clave} a={a} utiles={utiles} campos={d.campos} docs={d.permisos.documentos} onCambio={onCambio} />)}
      </div>
    </div>
  );
}

function FilaAuto({ a, utiles, campos, docs, onCambio }: { a: AutomatizacionWA; utiles: PlantillaTiendaWA[]; campos: Record<string, string>; docs: boolean; onCambio: (d: EstadoPlantillasWA) => void }) {
  const [metaId, setMetaId] = useState(a.seleccion?.metaId || '');
  const [mapa, setMapa] = useState<string[]>(a.seleccion?.mapa || []);
  const [fuente, setFuente] = useState(a.seleccion?.doc?.fuente || '');
  const [archivo, setArchivo] = useState({ url: a.seleccion?.doc?.archivo || '', nombre: a.seleccion?.doc?.nombre || '' });
  const [estado, setEstado] = useState(''); const [ocupado, setOcupado] = useState(false);
  const p = utiles.find((x) => x.metaId === metaId);
  const media = p && ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(p.encabezadoTipo) ? p.encabezadoTipo : '';
  const total = p ? p.variables + (p.varsEncabezado ? 1 : 0) : 0;
  // Al elegir una plantilla: si la creaste aquí, ya sabemos qué dato va en cada {{n}}.
  const elegir = (id: string) => {
    setMetaId(id); setEstado('');
    const q = utiles.find((x) => x.metaId === id);
    if (!q) return;
    const n = q.variables + (q.varsEncabezado ? 1 : 0);
    const prev = id === a.seleccion?.metaId ? a.seleccion.mapa : q.campos;
    setMapa(Array.from({ length: n }, (_, i) => (a.campos.includes(prev[i]) ? prev[i] : '')));
    if (q.encabezadoTipo === 'DOCUMENT' && a.doc.includes('guia')) setFuente('guia');
  };
  const guardar = async () => {
    setOcupado(true); setEstado('');
    const r = await apiWaAutomatizacion(a.clave, { metaId, mapa, doc: media ? { fuente, archivo: archivo.url, nombre: archivo.nombre } : undefined });
    setOcupado(false);
    if (!r.data) { setEstado(r.error || 'No se pudo guardar.'); return; }
    setEstado(metaId ? 'Guardado: el bot usa esta plantilla.' : 'Listo: vuelve a la plantilla de DealFlow.');
    onCambio(r.data);
  };
  const cambiado = metaId !== (a.seleccion?.metaId || '') || JSON.stringify(mapa) !== JSON.stringify(a.seleccion?.mapa || []) || (!!media && (fuente !== (a.seleccion?.doc?.fuente || '') || archivo.url !== (a.seleccion?.doc?.archivo || '')));
  return (
    <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, background: 'var(--df-bg)', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5 }}>{a.titulo}</b>
        {a.seleccion?.estado === 'pausada' && <span style={chip('var(--df-danger-subtle-2)', 'var(--df-danger-dark)')}>Pausada</span>}
        {a.seleccion?.estado === 'activa' && <span style={chip('var(--df-brand-subtle)', 'var(--df-brand-dark)')}>Usando la tuya</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 8px' }}>{a.descripcion}</div>
      <select aria-label={`Plantilla para ${a.titulo}`} value={metaId} onChange={(e) => elegir(e.target.value)} style={inp}>
        <option value="">Plantilla de DealFlow (por defecto)</option>
        {utiles.filter((x) => x.encabezadoTipo !== 'DOCUMENT' || docs).map((x) => <option key={x.metaId} value={x.metaId}>{x.nombre}{x.encabezadoTipo === 'DOCUMENT' ? ' · 📄' : x.encabezadoTipo === 'IMAGE' ? ' · 🖼️' : ''}</option>)}
      </select>
      {metaId && a.seleccion?.metaId === metaId && !p && <div style={{ fontSize: 12, color: 'var(--df-danger-dark)', marginTop: 6 }}>«{a.seleccion.nombre}» ya no está aprobada como Utilidad.</div>}
      {p && (
        <>
          <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', marginTop: 8, color: 'var(--df-text-body)' }}>
            {p.encabezado && <b>{p.encabezado}{'\n'}</b>}{p.cuerpo}
          </div>
          {total > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginTop: 8 }}>
            {Array.from({ length: total }, (_, i) => (
              <label key={i} style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 700, minWidth: 0 }}>
                {i < p.variables ? `{{${i + 1}}}` : 'Encabezado'}
                <select value={mapa[i] || ''} onChange={(e) => setMapa(Array.from({ length: total }, (_, k) => (k === i ? e.target.value : mapa[k] || '')))} style={{ ...inp, ...(mapa[i] ? {} : { borderColor: 'var(--df-danger, #dc2626)' }) }}>
                  <option value="">Elige el dato…</option>
                  {a.campos.map((c) => <option key={c} value={c}>{campos[c] || c}</option>)}
                </select>
              </label>
            ))}
          </div>}
          {media && (
            <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 13 }}>
              <b style={{ fontSize: 12 }}>{media === 'DOCUMENT' ? 'Documento' : media === 'IMAGE' ? 'Foto' : 'Video'} que va arriba</b>
              {a.doc.includes('guia') && media !== 'VIDEO' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={fuente === 'guia'} onChange={() => setFuente('guia')} /> {media === 'DOCUMENT' ? 'El PDF de la guía de cada pedido (automático)' : 'La foto de la guía de cada pedido (automático)'}</label>}
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="radio" checked={fuente === 'archivo'} onChange={() => setFuente('archivo')} /> Siempre el mismo archivo
                {fuente === 'archivo' && <ArchivoFijo tipo={media} valor={archivo} onCambio={setArchivo} />}
              </label>
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void guardar()} disabled={ocupado || !cambiado} style={{ ...btn, opacity: cambiado ? 1 : 0.5 }}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        {estado && <span role="status" style={{ fontSize: 12.5, color: /Guardado|Listo/.test(estado) ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)' }}>{estado}</span>}
      </div>
    </div>
  );
}

function ArchivoFijo({ tipo, valor, onCambio }: { tipo: string; valor: { url: string; nombre: string }; onCambio: (v: { url: string; nombre: string }) => void }) {
  const [sub, setSub] = useState(false); const [err, setErr] = useState('');
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
      {valor.url && <span style={{ fontSize: 12.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {valor.nombre || 'archivo'}</span>}
      <label style={{ ...btnS, padding: '5px 10px', fontSize: 12 }}>
        {sub ? 'Subiendo…' : valor.url ? 'Cambiar' : 'Subir archivo'}
        <input type="file" accept={tipo === 'DOCUMENT' ? 'application/pdf' : tipo === 'IMAGE' ? 'image/jpeg,image/png' : 'video/mp4'} style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setSub(true); setErr(''); void subirArchivo(f).then((r) => { setSub(false); if (r.url) onCambio({ url: r.url, nombre: f.name }); else setErr(r.error || ''); }); }} />
      </label>
      {err && <span style={{ fontSize: 11.5, color: 'var(--df-danger-dark)' }}>{err}</span>}
    </span>
  );
}

// ── Constructor ─────────────────────────────────────────────────────────
const VACIA: DefPlantillaWA = { nombre: '', categoria: 'UTILITY', encabezadoTipo: '', encabezado: '', cuerpo: '', pie: '', botones: [] };
function Constructor({ d, onCreada }: { d: EstadoPlantillasWA; onCreada: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [def, setDef] = useState<DefPlantillaWA>(VACIA);
  const [rev, setRev] = useState<{ errores: string[]; riesgo: RiesgoPlantilla; nombre: string; vista: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const set = (p: Partial<DefPlantillaWA>) => { setDef((x) => ({ ...x, ...p })); setResultado(null); };
  // Revisión en vivo (formato + riesgo de Marketing), medio segundo después de dejar de escribir.
  useEffect(() => {
    if (!abierto || !def.cuerpo.trim()) { setRev(null); return; }
    const t = setTimeout(() => void apiWaPlantillaRevisar(def).then((r) => { if (r.data) setRev(r.data); }), 500);
    return () => clearTimeout(t);
  }, [def, abierto]);
  const usarBase = (b: BasePlantillaWA) => {
    set({ base: b.id, nombre: b.id, categoria: 'UTILITY', encabezadoTipo: b.encabezadoTipo, encabezado: b.encabezado, cuerpo: b.cuerpo, pie: b.pie, botones: b.botones.map((x) => ({ ...x })) });
  };
  const insertar = (campo: string) => {
    const el = area.current; const token = `{{${campo}}}`;
    if (!el) { set({ cuerpo: def.cuerpo + token }); return; }
    const a = el.selectionStart ?? def.cuerpo.length; const b = el.selectionEnd ?? a;
    set({ cuerpo: def.cuerpo.slice(0, a) + token + def.cuerpo.slice(b) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const bloqueada = !rev || rev.errores.length > 0 || (def.categoria === 'UTILITY' && rev.riesgo.nivel === 'alto');
  const enviar = async () => {
    setEnviando(true); setResultado(null);
    const r = await apiWaPlantillaCrear(def);
    setEnviando(false);
    if (!r.data) { setResultado({ ok: false, texto: r.error || 'Meta no la aceptó.' }); return; }
    setResultado({ ok: true, texto: `«${r.data.nombre}» se envió a revisión de Meta. Suele tardar de unos segundos a unas horas; aparece abajo con su estado.` });
    setDef(VACIA); onCreada();
  };
  const camposCuerpo = useMemo(() => Object.entries(d.campos).filter(([k]) => k !== 'estado' || def.base === 'estado'), [d.campos, def.base]);
  if (!abierto) return (
    <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => setAbierto(true)} style={btn}>+ Crear plantilla</button>
      <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Desde una base de DealFlow o desde cero. Se manda a aprobar a tu cuenta de Meta.</span>
    </div>
  );
  return (
    <div style={{ marginTop: 18, border: '1px solid var(--df-border)', borderRadius: 10, padding: 14, background: 'var(--df-bg)', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <b style={{ fontSize: 14 }}>Crear plantilla</b>
        <button type="button" onClick={() => { setAbierto(false); setDef(VACIA); setResultado(null); }} style={{ ...btnS, padding: '5px 10px', fontSize: 12 }}>Cerrar</button>
      </div>
      <label style={lbl}>Empezar desde una base (ya escrita para que Meta la apruebe como Utilidad)</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {d.bases.map((b) => <button key={b.id} type="button" onClick={() => usarBase(b)} style={{ ...btnS, padding: '6px 10px', fontSize: 12.5, ...(def.base === b.id ? { borderColor: 'var(--df-brand)', color: 'var(--df-brand-dark)' } : {}) }}>{b.documento ? '📄 ' : ''}{b.titulo}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div><label style={lbl} htmlFor="tpl-nombre">Nombre (solo para ti y Meta)</label><input id="tpl-nombre" value={def.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="confirmacion_pedido" style={inp} />{rev?.nombre && rev.nombre !== def.nombre && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 2 }}>Se guarda como «{rev.nombre}»</div>}</div>
        <div><label style={lbl} htmlFor="tpl-cat">Categoría</label>
          <select id="tpl-cat" value={def.categoria} onChange={(e) => set({ categoria: e.target.value as DefPlantillaWA['categoria'] })} style={inp}>
            <option value="UTILITY">Utilidad (sobre un pedido: confirmación, guía, estado)</option>
            <option value="MARKETING">Marketing (promociones, recuperar clientes)</option>
          </select></div>
        <div><label style={lbl} htmlFor="tpl-enc">Encabezado</label>
          <select id="tpl-enc" value={def.encabezadoTipo} onChange={(e) => set({ encabezadoTipo: e.target.value as DefPlantillaWA['encabezadoTipo'], archivoEjemplo: '' })} style={inp}>
            <option value="">Sin encabezado</option><option value="TEXT">Texto</option><option value="IMAGE">Foto</option>
            {d.permisos.documentos && <option value="DOCUMENT">Documento PDF (p. ej. la guía)</option>}
          </select></div>
      </div>
      {def.encabezadoTipo === 'TEXT' && <><label style={lbl} htmlFor="tpl-enct">Texto del encabezado (máx. 60)</label><input id="tpl-enct" value={def.encabezado || ''} maxLength={60} onChange={(e) => set({ encabezado: e.target.value })} style={inp} /></>}
      {(def.encabezadoTipo === 'IMAGE' || def.encabezadoTipo === 'DOCUMENT') && (
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {def.encabezadoTipo === 'DOCUMENT' ? 'El PDF real se pone al enviar (la guía de cada pedido o el que adjuntes). Meta pide uno de ejemplo:' : 'La foto real se pone al enviar. Meta pide una de ejemplo:'}
          <label style={{ ...btnS, padding: '5px 10px', fontSize: 12 }}>
            {subiendo ? 'Subiendo…' : def.archivoEjemplo ? '✓ Ejemplo subido · cambiar' : def.encabezadoTipo === 'DOCUMENT' ? 'Subir PDF de ejemplo (opcional)' : 'Subir foto de ejemplo'}
            <input type="file" accept={def.encabezadoTipo === 'DOCUMENT' ? 'application/pdf' : 'image/jpeg,image/png'} style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setSubiendo(true); void subirArchivo(f).then((r) => { setSubiendo(false); if (r.url) set({ archivoEjemplo: r.url }); }); }} />
          </label>
        </div>
      )}
      <label style={lbl} htmlFor="tpl-cuerpo">Mensaje</label>
      <textarea id="tpl-cuerpo" ref={area} value={def.cuerpo} onChange={(e) => set({ cuerpo: e.target.value })} rows={6} placeholder="Hola {{nombre}}, tu pedido {{pedido}}…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }} aria-label="Insertar dato del cliente">
        <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)', alignSelf: 'center' }}>Insertar dato:</span>
        {camposCuerpo.map(([k, n]) => <button key={k} type="button" onClick={() => insertar(k)} style={{ ...btnS, padding: '3px 8px', fontSize: 11.5, fontWeight: 600 }}>{n}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div><label style={lbl} htmlFor="tpl-pie">Pie (opcional, máx. 60)</label><input id="tpl-pie" value={def.pie || ''} maxLength={60} onChange={(e) => set({ pie: e.target.value })} style={inp} /></div>
        <div>
          <label style={lbl}>Botones de respuesta (máx. 3)</label>
          <div style={{ display: 'grid', gap: 6 }}>
            {(def.botones || []).map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input value={b.texto} maxLength={25} aria-label={`Botón ${i + 1}`} onChange={(e) => set({ botones: (def.botones || []).map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) })} style={inp} />
                <button type="button" aria-label="Quitar botón" onClick={() => set({ botones: (def.botones || []).filter((_, k) => k !== i) })} style={{ ...btnS, padding: '4px 10px' }}>✕</button>
              </div>
            ))}
            {(def.botones || []).length < 3 && <button type="button" onClick={() => set({ botones: [...(def.botones || []), { tipo: 'QUICK_REPLY', texto: '' }] })} style={{ ...btnS, padding: '6px 10px', fontSize: 12.5, justifySelf: 'start' }}>+ Botón</button>}
          </div>
        </div>
      </div>

      {rev && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Así lo verá el cliente (con datos de ejemplo)</div>
          <div style={{ background: 'var(--df-brand-subtle-2, #ECFDF5)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 11px', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--df-text)' }}>
            {def.encabezadoTipo === 'DOCUMENT' && <div>📄 Guia-DF-1049.pdf</div>}{def.encabezadoTipo === 'IMAGE' && <div>🖼️ Foto</div>}
            {def.encabezadoTipo === 'TEXT' && def.encabezado && <b>{def.encabezado}{'\n'}</b>}{rev.vista}{def.pie && <span style={{ color: 'var(--df-text-muted)' }}>{'\n'}{def.pie}</span>}
            {(def.botones || []).filter((b) => b.texto.trim()).map((b, i) => <div key={i} style={{ marginTop: 6, textAlign: 'center', color: '#0369A1', fontWeight: 600 }}>↩ {b.texto}</div>)}
          </div>
          {def.categoria === 'UTILITY' && (
            <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 11px', fontSize: 12.5, display: 'grid', gap: 4 }}>
              <span style={chip(RIESGO[rev.riesgo.nivel][1], RIESGO[rev.riesgo.nivel][2])}>{RIESGO[rev.riesgo.nivel][0]}</span>
              {rev.riesgo.motivos.map((m, i) => <div key={i}>• {m}</div>)}
              {rev.riesgo.sugerencias.map((m, i) => <div key={'s' + i} style={{ color: 'var(--df-brand-dark)' }}>→ {m}</div>)}
              {rev.riesgo.nivel === 'bajo' && <div style={{ color: 'var(--df-text-muted)' }}>Habla de un pedido concreto y no promociona nada: es lo que Meta aprueba como Utilidad.</div>}
            </div>
          )}
          {def.categoria === 'MARKETING' && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Las de Marketing se cobran más caro, tienen límites de envío y no se pueden usar en las automatizaciones del bot.</div>}
          {rev.errores.length > 0 && <div role="alert" style={{ fontSize: 12.5, color: 'var(--df-danger-dark)', display: 'grid', gap: 2 }}>{rev.errores.map((e, i) => <div key={i}>✕ {e}</div>)}</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void enviar()} disabled={enviando || bloqueada} style={{ ...btn, opacity: bloqueada ? 0.5 : 1 }}>{enviando ? 'Enviando a Meta…' : 'Enviar a aprobación de Meta'}</button>
        {resultado && <span role="status" style={{ fontSize: 12.5, color: resultado.ok ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)' }}>{resultado.texto}</span>}
      </div>
    </div>
  );
}

// ── Lista de plantillas de la cuenta ───────────────────────────────────
function ListaPropias({ propias }: { propias: PlantillaTiendaWA[] }) {
  const [ver, setVer] = useState(false);
  if (!propias.length) return <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--df-text-muted)' }}>Todavía no hay plantillas propias en tu cuenta de WhatsApp.</div>;
  const lista = ver ? propias : propias.slice(0, 6);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Tus plantillas en Meta ({propias.length})</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {lista.map((p) => {
          const e = ESTADO[p.estado] || ESTADO.pendiente;
          return (
            <div key={p.metaId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, minWidth: 0 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{p.nombre}</span>
              {p.encabezadoTipo === 'DOCUMENT' && <span title="Lleva un documento arriba">📄</span>}
              <span style={chip(e[1], e[2])}>{e[0]}</span>
              <span style={chip(p.categoria.toUpperCase() === 'MARKETING' ? 'var(--df-purple-subtle, #F3E8FF)' : 'var(--df-surface-2)', p.categoria.toUpperCase() === 'MARKETING' ? 'var(--df-purple, #7C3AED)' : 'var(--df-text-muted)')}>{catNombre(p.categoria)}</span>
              {p.reclasificada && <span style={chip('var(--df-danger-subtle-2)', 'var(--df-danger-dark)')}>Meta la pasó a Marketing</span>}
              {p.calidad && p.calidad !== 'UNKNOWN' && <span title="Calidad según Meta" style={chip(p.calidad === 'GREEN' ? 'var(--df-brand-subtle)' : p.calidad === 'YELLOW' ? 'rgba(245,158,11,.14)' : 'var(--df-danger-subtle-2)', p.calidad === 'GREEN' ? 'var(--df-brand-dark)' : p.calidad === 'YELLOW' ? '#B45309' : 'var(--df-danger-dark)')}>Calidad {p.calidad === 'GREEN' ? 'alta' : p.calidad === 'YELLOW' ? 'media' : 'baja'}</span>}
              {p.motivo && <span style={{ color: 'var(--df-text-muted)', flexBasis: '100%' }}>{p.motivo}</span>}
            </div>
          );
        })}
      </div>
      {propias.length > 6 && <button type="button" onClick={() => setVer(!ver)} style={{ ...btnS, padding: '5px 10px', fontSize: 12, marginTop: 8 }}>{ver ? 'Ver menos' : `Ver todas (${propias.length})`}</button>}
    </div>
  );
}
