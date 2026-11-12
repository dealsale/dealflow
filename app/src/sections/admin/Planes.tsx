import { useEffect, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { apiAdminOverview, apiCambiarPrecioServicio, apiCreatePlan, apiDeletePlan, apiPreciosServicios, apiUpdatePlan, type AdminPlan, type PrecioServicio } from '../../lib/api';

const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const soloNum = (v: string) => v.replace(/\D/g, '');
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };
const lbl: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };

interface Form { nombre: string; precio: string; mensual: string; incluyeTienda: boolean; visible: boolean; features: string }
const VACIO: Form = { nombre: '', precio: '', mensual: '', incluyeTienda: false, visible: true, features: '' };
const aForm = (p: AdminPlan): Form => ({ nombre: p.nombre, precio: String(p.precio || 0), mensual: String(p.mensual || 0), incluyeTienda: !!p.incluyeTienda, visible: p.visible !== false, features: p.features.join(', ') });

/**
 * Planes de DealFlow. Cada plan cobra dos cosas: la INSTALACIÓN (una sola vez, incluye los
 * primeros 30 días) y la MENSUALIDAD. Un plan puede incluir la Tienda en línea (así no se paga
 * aparte). Los planes ocultos no se ofrecen a tiendas nuevas pero siguen sirviendo a las que ya los tienen.
 */
export function Planes({ df }: { df: DealFlowState }) {
  void df;
  const [planes, setPlanes] = useState<AdminPlan[] | null>(null);
  const [editando, setEditando] = useState('');
  const [form, setForm] = useState<Form>(VACIO);
  const [nuevo, setNuevo] = useState<Form>(VACIO);
  const [msg, setMsg] = useState('');
  const [armado, setArmado] = useState('');
  const cargar = () => apiAdminOverview().then((r) => { if (r.data) setPlanes(r.data.plans); });
  useEffect(() => { void cargar(); }, []);

  const datos = (f: Form) => ({
    nombre: f.nombre.trim(), precio: Number(f.precio) || 0, mensual: Number(f.mensual) || 0,
    incluyeTienda: f.incluyeTienda, visible: f.visible, features: f.features.split(',').map((x) => x.trim()).filter(Boolean),
  });
  const guardar = async () => {
    const r = await apiUpdatePlan(editando, datos(form));
    if (r.error) { setMsg(r.error); return; }
    setMsg('✓ Plan guardado. Las tiendas de este plan pagan la nueva mensualidad desde su próxima renovación.');
    setEditando(''); void cargar();
  };
  const crear = async () => {
    const d = datos(nuevo);
    if (!d.nombre || (!d.precio && !d.mensual)) { setMsg('Falta el nombre y al menos la instalación o la mensualidad.'); return; }
    const r = await apiCreatePlan(d);
    if (r.error) { setMsg(r.error); return; }
    setMsg('✓ Plan creado.'); setNuevo(VACIO); void cargar();
  };
  const eliminar = async (id: string) => {
    if (armado !== id) { setArmado(id); return; }
    setArmado('');
    const r = await apiDeletePlan(id);
    setMsg(r.error || '✓ Plan eliminado.'); if (!r.error) void cargar();
  };

  const campos = (f: Form, set: (f: Form) => void) => (
    <>
      <div style={{ marginBottom: 8 }}><div style={lbl}>Nombre del plan</div><input className="df-input" value={f.nombre} onChange={(e) => set({ ...f, nombre: e.target.value })} placeholder="Ej: Bot + Tienda" style={inp} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><div style={lbl}>Instalación (una vez)</div><input className="df-input" inputMode="numeric" value={f.precio ? Number(f.precio).toLocaleString('es-CO') : ''} onChange={(e) => set({ ...f, precio: soloNum(e.target.value) })} placeholder="0" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} /></div>
        <div><div style={lbl}>Mensualidad</div><input className="df-input" inputMode="numeric" value={f.mensual ? Number(f.mensual).toLocaleString('es-CO') : ''} onChange={(e) => set({ ...f, mensual: soloNum(e.target.value) })} placeholder="0" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 6px', cursor: 'pointer' }}><input type="checkbox" checked={f.incluyeTienda} onChange={(e) => set({ ...f, incluyeTienda: e.target.checked })} /> Incluye la Tienda en línea (no la pagan aparte)</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8, cursor: 'pointer' }}><input type="checkbox" checked={f.visible} onChange={(e) => set({ ...f, visible: e.target.checked })} /> Mostrarlo a las tiendas nuevas</label>
      <div style={lbl}>Qué incluye (separado por comas)</div>
      <textarea className="df-input" value={f.features} onChange={(e) => set({ ...f, features: e.target.value })} rows={3} placeholder="Ej: Bot de WhatsApp 24/7, Integración con Dropi, Soporte" style={{ ...inp, resize: 'vertical', marginBottom: 10 }} />
    </>
  );
  const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
  const btn2: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
  const link: React.CSSProperties = { background: 'transparent', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 };

  return (
    <section data-screen-label="Admin Planes">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Planes</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px', lineHeight: 1.5 }}>
        Lo que pagan las tiendas: la <b>instalación</b> (una sola vez, incluye los primeros 30 días) y la <b>mensualidad</b>. Puedes armar varios planes, por ejemplo uno solo con el bot y otro con el bot y la Tienda en línea.
      </p>
      {msg && <div style={{ background: msg.startsWith('✓') ? 'var(--df-brand-subtle)' : 'var(--df-danger-subtle)', border: '1px solid ' + (msg.startsWith('✓') ? 'var(--df-brand-border, var(--df-border))' : 'var(--df-danger-border)'), color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{msg}</div>}

      {!planes ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 22 }}>
          {planes.map((pl) => {
            const ed = editando === pl.id;
            return (
              <div key={pl.id} style={{ background: 'var(--df-surface)', border: '1px solid ' + (ed ? 'var(--df-purple-border)' : 'var(--df-border)'), borderRadius: 12, padding: 18, opacity: pl.visible === false && !ed ? 0.75 : 1 }}>
                {ed ? (
                  <>
                    {campos(form, setForm)}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void guardar()} className="df-btn-primary" style={btn}>Guardar</button>
                      <button onClick={() => setEditando('')} style={btn2}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{pl.nombre}</span>
                      {pl.incluyeTienda && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)' }}>+ Tienda en línea</span>}
                      {pl.visible === false && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', color: 'var(--df-text-muted)', background: 'var(--df-bg)' }}>Oculto</span>}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{money(pl.mensual || 0)}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--df-text-muted)' }}> /mes</span></div>
                    <div style={{ fontSize: 13, color: 'var(--df-text-muted)', margin: '2px 0 4px' }}>Instalación: <b style={{ color: 'var(--df-text-strong)' }}>{money(pl.precio)}</b> (una vez)</div>
                    <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>{pl.cuentas} cuenta{pl.cuentas === 1 ? '' : 's'} en este plan</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                      {pl.features.map((ft, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--df-text-strong)' }}><span style={{ color: 'var(--df-brand)' }}>✓</span><span>{ft}</span></div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--df-border)', paddingTop: 10 }}>
                      <button onClick={() => { setEditando(pl.id); setForm(aForm(pl)); setMsg(''); }} style={{ ...link, color: 'var(--df-text-body)' }}>Editar</button>
                      <button onClick={() => void eliminar(pl.id)} style={{ ...link, color: 'var(--df-danger-dark)' }}>{armado === pl.id ? '¿Seguro?' : 'Eliminar'}</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, maxWidth: 520 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Crear plan</div>
        {campos(nuevo, setNuevo)}
        <button onClick={() => void crear()} className="df-btn-primary" style={{ ...btn, padding: '10px 18px', fontSize: 14 }}>Crear plan</button>
      </div>
      <PreciosServicios />
    </section>
  );
}

/**
 * Precios de los servicios que se cobran aparte del plan (hoy la membresía de Tienda en
 * línea; luego, microtransacciones). Cada tienda los paga en línea (Bold o Wompi) con el precio de aquí.
 */
function PreciosServicios() {
  const [lista, setLista] = useState<PrecioServicio[] | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => { void apiPreciosServicios().then((r) => { if (r.data) setLista(r.data.precios); }); }, []);
  const guardar = async (p: PrecioServicio) => {
    const r = await apiCambiarPrecioServicio(p.clave, Number(borrador[p.clave] ?? p.precio) || 0);
    setMsg((m) => ({ ...m, [p.clave]: r.error || '✓ Guardado' }));
    if (r.data) { setLista((l) => l && l.map((x) => (x.clave === p.clave ? r.data!.precio : x))); setBorrador((b) => { const n = { ...b }; delete n[p.clave]; return n; }); }
  };
  const unidad = { mes: '/mes', unico: 'pago único', uso: 'por uso' } as const;
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Servicios adicionales</h2>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 13.5, margin: '0 0 14px' }}>Lo que las tiendas pagan aparte de su plan. Precio 0 = gratis. Si el plan incluye la Tienda en línea, esa tienda no la paga.</p>
      {!lista ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {lista.map((p) => {
            const v = borrador[p.clave] ?? String(p.precio);
            const cambio = v !== String(p.precio);
            return (
              <div key={p.clave} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '3px 0 12px' }}>{p.descripcion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--df-text-faint)' }}>$</span>
                  <input className="df-input" inputMode="numeric" value={Number(v || 0).toLocaleString('es-CO')} onChange={(e) => setBorrador((b) => ({ ...b, [p.clave]: e.target.value.replace(/\D/g, '') }))}
                    style={{ flex: 1, border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 14 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'nowrap' }}>{unidad[p.unidad] || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <button onClick={() => void guardar(p)} disabled={!cambio} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: cambio ? 'pointer' : 'default', opacity: cambio ? 1 : 0.5 }}>Guardar</button>
                  {msg[p.clave] && <span style={{ fontSize: 12.5, color: msg[p.clave].startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg[p.clave]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
