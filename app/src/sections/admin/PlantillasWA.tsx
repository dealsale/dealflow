import { useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { apiPlantillaMetaTiendas, type PlantillaMeta, type NuevaPlantilla, type BotonPlantilla, type EstadoPlantillaTienda } from '../../lib/api';
import { Dropdown } from '../../components/Dropdown';
import { confirmar } from '../../components/dialogs';

const vacia: NuevaPlantilla = { nombre: '', categoria: 'UTILITY', idioma: 'es', encabezado: '', cuerpo: '', pie: '', botones: [], ejemplos: [] };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };
const label: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'block' };
const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, color, background: bg, borderRadius: 6, padding: '2px 8px' });

function nvars(t: string): number {
  let m = 0; for (const x of t.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) m = Math.max(m, Number(x[1])); return m;
}

export function PlantillasWA({ df }: { df: DealFlowState }) {
  const [form, setForm] = useState<NuevaPlantilla | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const set = (k: keyof NuevaPlantilla, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const abrirNueva = () => { setForm({ ...vacia }); setEditId(null); };
  const abrirEditar = (p: PlantillaMeta) => {
    setForm({ nombre: p.nombre, categoria: p.categoria, idioma: p.idioma, encabezado: p.encabezado, cuerpo: p.cuerpo, pie: p.pie, botones: p.botones, ejemplos: p.ejemplos });
    setEditId(p.id);
  };
  const guardar = () => {
    if (!form) return;
    const cb = () => { setForm(null); setEditId(null); };
    if (editId) df.actualizarPlantillaMeta(editId, form, cb);
    else df.crearPlantillaMeta(form, cb);
  };

  const nBody = form ? nvars(form.cuerpo) : 0;

  return (
    <section data-screen-label="Plantillas WA">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: '1 1 380px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Plantillas de WhatsApp</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            Crea la plantilla una sola vez y publícala en <b>todas las tiendas</b> a la vez. Sin nombre de tienda: solo texto genérico con variables <code>{'{{1}}'}</code>.
          </p>
        </div>
        {!form && df.tiendasCloudCount > 0 && df.plantillasMeta.length > 0 && (<>
          <button onClick={df.refrescarTodasPlantillasMeta} disabled={df.enviandoPlantillas} title="Consulta a Meta el estado real de todas las plantillas en todas las tiendas" style={{ background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>🔄 Actualizar estados</button>
          <button onClick={df.publicarTodasPlantillasMeta} disabled={df.enviandoPlantillas} title="Envía TODAS las plantillas a verificación en todas las tiendas donde aún no están aprobadas (no toca las aprobadas)" style={{ background: 'var(--df-surface)', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand)', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: df.enviandoPlantillas ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: df.enviandoPlantillas ? 0.6 : 1 }}>{df.enviandoPlantillas ? '⏳ Enviando…' : '📤 Enviar todas a verificación'}</button>
        </>)}
        {!form && <button onClick={abrirNueva} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Nueva plantilla</button>}
      </div>
      {df.tiendasCloudCount === 0 ? (
        <div style={{ background: 'var(--df-danger-subtle-2)', border: '1px solid var(--df-danger-border, rgba(220,38,38,.3))', borderRadius: 10, padding: '11px 13px', marginBottom: 16, fontSize: 12.5, color: 'var(--df-danger-dark)' }}>
          ⚠️ <b>No hay tiendas conectadas por WhatsApp Cloud API.</b> Las plantillas de Meta solo se publican en cuentas <b>Cloud API (oficial)</b>; las tiendas conectadas por <b>QR</b> no tienen sistema de plantillas. Por eso «Publicar en todas» no envía a ninguna. Conecta al menos una tienda por Cloud API.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 16 }}>
          Se publicará en <b>{df.tiendasCloudCount}</b> tienda(s) conectada(s) por Cloud API. Cada tienda recibe su copia y Meta la verifica por separado.
        </div>
      )}

      {df.plantillasMeta.length > 0 && df.tiendasCloudCount > 0 && <ResumenGlobal plantillas={df.plantillasMeta} tiendas={df.tiendasCloudCount} />}

      {df.plantillasMetaMsg && (
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12, color: df.plantillasMetaMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.plantillasMetaMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.plantillasMetaMsg}</div>
      )}

      {form && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>{editId ? 'Editar plantilla' : 'Nueva plantilla'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Nombre técnico (minúsculas_guionbajo)</label>
              <input style={input} value={form.nombre} disabled={!!editId} onChange={(e) => set('nombre', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="confirmacion_pedido" />
            </div>
            <div>
              <label style={label}>Categoría</label>
              <Dropdown ariaLabel="Categoría" value={form.categoria} onChange={(v) => set('categoria', v)} options={[{ value: 'UTILITY', label: 'Utilidad (pedido, envío, pago)' }, { value: 'MARKETING', label: 'Marketing (promos) — requiere opt-in' }]} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Encabezado (opcional)</label>
            <input style={input} value={form.encabezado} onChange={(e) => set('encabezado', e.target.value)} placeholder="Ej. Confirmación de tu pedido" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Cuerpo del mensaje · usa <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>… para lo que cambia</label>
            <textarea style={{ ...input, minHeight: 110, resize: 'vertical' }} value={form.cuerpo} onChange={(e) => set('cuerpo', e.target.value)} placeholder={'Hola {{1}} 👋 Gracias por comprar con nosotros. Tu pedido {{2}} está confirmado.'} />
          </div>
          {nBody > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Ejemplos para las variables (uno por variable, en orden — Meta los exige)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Array.from({ length: nBody }).map((_, i) => (
                  <input key={i} style={{ ...input, width: 150 }} value={form.ejemplos[i] || ''} placeholder={`{{${i + 1}}} ej.`}
                    onChange={(e) => { const ej = [...form.ejemplos]; ej[i] = e.target.value; set('ejemplos', ej); }} />
                ))}
              </div>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Pie (opcional) · en marketing, pon la salida</label>
            <input style={input} value={form.pie} onChange={(e) => set('pie', e.target.value)} placeholder="Responde BAJA para no recibir promociones." />
          </div>
          <BotonesEditor botones={form.botones} onChange={(b) => set('botones', b)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={guardar} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{editId ? 'Guardar cambios' : 'Crear plantilla'}</button>
            <button onClick={() => { setForm(null); setEditId(null); }} style={{ background: 'transparent', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--df-text-faint)' }}>💡 Al crear la plantilla no se publica sola. Después dale «Publicar en todas» para enviarla a verificación de Meta en cada tienda.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {df.plantillasMeta.length === 0 && !form && (
          <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
            Aún no hay plantillas. Crea la primera con «+ Nueva plantilla».
          </div>
        )}
        {df.plantillasMeta.map((p) => (
          <div key={p.id} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13 }}>{p.nombre}</span>
              <span style={chip(p.categoria === 'MARKETING' ? 'var(--df-purple-subtle)' : 'var(--df-brand-subtle)', p.categoria === 'MARKETING' ? 'var(--df-purple)' : 'var(--df-brand-dark)')}>{p.categoria === 'MARKETING' ? 'Marketing' : 'Utilidad'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{p.idioma}</span>
              <div style={{ flex: 1 }} />
              {(p.publicadas > 0 || df.tiendasCloudCount > 0) && (
                <div style={{ display: 'flex', gap: 5 }}>
                  {df.tiendasCloudCount - p.publicadas > 0 && <span title="Tiendas donde aún no se ha enviado" style={chip('var(--df-surface-2)', 'var(--df-text-muted)')}>○ {df.tiendasCloudCount - p.publicadas} sin enviar</span>}
                  {p.resumen.aprobada > 0 && <span style={chip('var(--df-brand-subtle)', 'var(--df-brand-dark)')}>✓ {p.resumen.aprobada}</span>}
                  {p.resumen.pendiente > 0 && <span style={chip('rgba(245,158,11,.12)', '#B45309')}>⏳ {p.resumen.pendiente}</span>}
                  {p.resumen.rechazada > 0 && <span style={chip('var(--df-danger-subtle-2)', 'var(--df-danger-dark)')}>✕ {p.resumen.rechazada}</span>}
                  {p.resumen.error > 0 && <span style={chip('var(--df-danger-subtle-2)', 'var(--df-danger-dark)')}>⚠ {p.resumen.error}</span>}
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--df-text-body)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', marginBottom: 10 }}>
              {p.encabezado && <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.encabezado}</div>}
              {p.cuerpo}
              {p.pie && <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginTop: 4 }}>{p.pie}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => df.publicarPlantillaMeta(p.id)} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>📤 Publicar en todas ({df.tiendasCloudCount})</button>
              {p.publicadas > 0 && <button onClick={() => df.refrescarPlantillaMeta(p.id)} style={{ background: 'var(--df-surface-2)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>🔄 Refrescar estado</button>}
              <PorTienda id={p.id} />
              <button onClick={() => abrirEditar(p)} style={{ background: 'transparent', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Editar</button>
              <button onClick={async () => { if (await confirmar({ titulo: 'Eliminar plantilla', mensaje: `¿Eliminar la plantilla "${p.nombre}" de DealFlow? No la borra de las tiendas donde ya está aprobada en Meta.`, aceptar: 'Eliminar', peligro: true })) df.eliminarPlantillaMeta(p.id); }} style={{ background: 'transparent', color: 'var(--df-danger-dark)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BotonesEditor({ botones, onChange }: { botones: BotonPlantilla[]; onChange: (b: BotonPlantilla[]) => void }) {
  const add = () => onChange([...botones, { tipo: 'QUICK_REPLY', texto: '' }]);
  const upd = (i: number, patch: Partial<BotonPlantilla>) => onChange(botones.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const del = (i: number) => onChange(botones.filter((_, j) => j !== i));
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={label}>Botones (opcional)</label>
      {botones.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <Dropdown ariaLabel="Tipo de botón" width={170} value={b.tipo} onChange={(v) => upd(i, { tipo: v as BotonPlantilla['tipo'] })} options={[{ value: 'QUICK_REPLY', label: 'Respuesta rápida' }, { value: 'URL', label: 'Enlace (URL)' }]} />
          <input style={{ ...input, flex: 1 }} value={b.texto} onChange={(e) => upd(i, { texto: e.target.value })} placeholder="Texto del botón" />
          {b.tipo === 'URL' && <input style={{ ...input, flex: 1 }} value={b.url || ''} onChange={(e) => upd(i, { url: e.target.value })} placeholder="https://…" />}
          <button onClick={() => del(i)} style={{ background: 'transparent', border: 'none', color: 'var(--df-danger-dark)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      ))}
      {botones.length < 3 && <button onClick={add} style={{ background: 'transparent', border: '1px dashed var(--df-border)', color: 'var(--df-text-muted)', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>+ Agregar botón</button>}
    </div>
  );
}

/** Totales de todas las plantillas: cuántas faltan por aprobar en total. */
function ResumenGlobal({ plantillas, tiendas }: { plantillas: PlantillaMeta[]; tiendas: number }) {
  const t = { aprobada: 0, pendiente: 0, rechazada: 0, sin: 0 };
  for (const p of plantillas) {
    t.aprobada += p.resumen.aprobada; t.pendiente += p.resumen.pendiente;
    t.rechazada += p.resumen.rechazada + p.resumen.error; t.sin += Math.max(0, tiendas - p.publicadas);
  }
  const total = plantillas.length * tiendas;
  const caja = (n: number, l: string, c: string) => (
    <div style={{ flex: 1, minWidth: 110, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{n}</div>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>{l}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {caja(t.aprobada, `aprobadas de ${total}`, 'var(--df-brand-dark)')}
        {caja(t.pendiente, 'en revisión de Meta', '#B45309')}
        {caja(t.rechazada, 'rechazadas o con error', 'var(--df-danger-dark)')}
        {caja(t.sin, 'sin enviar', 'var(--df-text-muted)')}
      </div>
      {(t.pendiente > 0 || t.sin > 0) && (
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 6 }}>
          «En revisión» es normal: Meta tarda de minutos a 24 h. DealFlow vuelve a preguntar solo cada 30 min; las rechazadas muestran el motivo en «Ver por tienda».
        </div>
      )}
    </div>
  );
}

const ETQ: Record<string, [string, string, string]> = {
  aprobada: ['✓ Aprobada', 'var(--df-brand-subtle)', 'var(--df-brand-dark)'],
  pendiente: ['⏳ En revisión', 'rgba(245,158,11,.12)', '#B45309'],
  rechazada: ['✕ Rechazada', 'var(--df-danger-subtle-2)', 'var(--df-danger-dark)'],
  error: ['⚠ Error', 'var(--df-danger-subtle-2)', 'var(--df-danger-dark)'],
  sin_enviar: ['○ Sin enviar', 'var(--df-surface-2)', 'var(--df-text-muted)'],
};

/** Estado de la plantilla en cada tienda, con el motivo cuando no quedó aprobada. */
function PorTienda({ id }: { id: string }) {
  const [filas, setFilas] = useState<EstadoPlantillaTienda[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const abrir = () => {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true); setFilas(null);
    void apiPlantillaMetaTiendas(id).then((r) => setFilas(r.data?.tiendas || []));
  };
  return (
    <>
      <button onClick={abrir} style={{ background: 'transparent', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>{abierto ? 'Ocultar tiendas' : 'Ver por tienda'}</button>
      {abierto && (
        <div style={{ flexBasis: '100%', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
          {filas === null && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--df-text-muted)' }}>Cargando…</div>}
          {filas?.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--df-text-muted)' }}>No hay tiendas Cloud API.</div>}
          {filas?.map((f) => {
            const [l, bg, c] = ETQ[f.estado] || ETQ.pendiente;
            return (
              <div key={f.store_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: '1px solid var(--df-border)', fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, minWidth: 0, flex: '0 1 200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} translate="no">{f.nombre}</span>
                <span style={chip(bg, c)}>{l}</span>
                <span style={{ flex: 1, color: 'var(--df-text-muted)', fontSize: 12 }}>{f.motivo}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
