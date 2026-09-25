import { useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import type { PlantillaMeta, NuevaPlantilla, BotonPlantilla } from '../../lib/api';
import { Dropdown } from '../../components/Dropdown';

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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Plantillas de WhatsApp</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            Crea la plantilla una sola vez y publícala en <b>todas las tiendas</b> a la vez. Sin nombre de tienda: solo texto genérico con variables <code>{'{{1}}'}</code>.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!form && <button onClick={abrirNueva} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Nueva plantilla</button>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 16 }}>
        Se publicará en <b>{df.tiendasCloudCount}</b> tienda(s) conectada(s) por Cloud API. Cada tienda recibe su copia y Meta la verifica por separado.
      </div>

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
              {p.publicadas > 0 && (
                <div style={{ display: 'flex', gap: 5 }}>
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
              <button onClick={() => abrirEditar(p)} style={{ background: 'transparent', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Editar</button>
              <button onClick={() => { if (confirm(`¿Eliminar la plantilla "${p.nombre}" de DealFlow? (No la borra de las tiendas donde ya está aprobada en Meta.)`)) df.eliminarPlantillaMeta(p.id); }} style={{ background: 'transparent', color: 'var(--df-danger-dark)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Eliminar</button>
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
          <select value={b.tipo} onChange={(e) => upd(i, { tipo: e.target.value as BotonPlantilla['tipo'] })} style={{ ...input, width: 150 }}>
            <option value="QUICK_REPLY">Respuesta rápida</option>
            <option value="URL">Enlace (URL)</option>
          </select>
          <input style={{ ...input, flex: 1 }} value={b.texto} onChange={(e) => upd(i, { texto: e.target.value })} placeholder="Texto del botón" />
          {b.tipo === 'URL' && <input style={{ ...input, flex: 1 }} value={b.url || ''} onChange={(e) => upd(i, { url: e.target.value })} placeholder="https://…" />}
          <button onClick={() => del(i)} style={{ background: 'transparent', border: 'none', color: 'var(--df-danger-dark)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      ))}
      {botones.length < 3 && <button onClick={add} style={{ background: 'transparent', border: '1px dashed var(--df-border)', color: 'var(--df-text-muted)', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>+ Agregar botón</button>}
    </div>
  );
}
