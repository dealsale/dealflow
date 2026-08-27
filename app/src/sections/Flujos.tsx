import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { Flujo, FlujoNodo, NodoTipo } from '../lib/api';

const NODE_W = 210;
const uid = () => Math.random().toString(36).slice(2, 10);

const TIPOS: { tipo: NodoTipo; icono: string; titulo: string; color: string }[] = [
  { tipo: 'mensaje', icono: '💬', titulo: 'Mensaje', color: '#059669' },
  { tipo: 'pregunta', icono: '❓', titulo: 'Pregunta', color: '#2563EB' },
  { tipo: 'opciones', icono: '🔘', titulo: 'Botones', color: '#7C3AED' },
  { tipo: 'condicion', icono: '🔀', titulo: 'Condición', color: '#B45309' },
  { tipo: 'accion', icono: '⚙️', titulo: 'Acción', color: '#0891B2' },
  { tipo: 'fin', icono: '🏁', titulo: 'Fin', color: '#334155' },
];
const meta = (t: NodoTipo) => TIPOS.find((x) => x.tipo === t) || TIPOS[0];

/** Resumen corto de un nodo, para pintarlo en el lienzo. */
function resumen(n: FlujoNodo): string {
  const d = n.data as Record<string, string>;
  if (n.tipo === 'mensaje' || n.tipo === 'pregunta') return String(d.texto || '(vacío)').slice(0, 60);
  if (n.tipo === 'opciones') return `${((n.data.opciones as unknown[]) || []).length} opción(es)`;
  if (n.tipo === 'condicion') return `Si contiene: "${d.contiene || '…'}"`;
  if (n.tipo === 'accion') return d.accion === 'asignar' ? 'Asignar a agente' : d.accion === 'etiquetar' ? `Etiquetar: ${d.valor || ''}` : 'Ir a otro flujo';
  if (n.tipo === 'fin') return d.volverIA ? 'Vuelve al asistente' : 'Termina la conversación';
  return '';
}

/** Puertos de salida de un nodo (para dibujar conexiones y conectar). */
function salidas(n: FlujoNodo): { key: string; label: string; next: string | null }[] {
  if (n.tipo === 'fin') return [];
  if (n.tipo === 'opciones') return ((n.data.opciones as { label: string; next: string | null }[]) || []).map((o, i) => ({ key: 'op' + i, label: o.label || 'Opción', next: o.next || null }));
  if (n.tipo === 'condicion') return [
    { key: 'si', label: 'Sí', next: (n.data.siNext as string) || null },
    { key: 'no', label: 'No', next: (n.data.noNext as string) || null },
  ];
  return [{ key: 'next', label: '', next: n.next || null }];
}

export function Flujos({ df }: { df: DealFlowState }) {
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => { void df.reloadFlujos(); }, []);

  if (editId) return <Editor df={df} id={editId} onClose={() => { setEditId(null); void df.reloadFlujos(); }} />;

  const nuevo = () => {
    const nombre = window.prompt('Nombre del flujo (ej: Bienvenida, Soporte, Recuperar carrito):');
    if (nombre && nombre.trim()) void df.crearFlujo(nombre.trim()).then((id) => { if (id) setEditId(id); });
  };

  return (
    <section data-screen-label="Flujos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Flujos 🔀</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Arma tu propio chatbot con bloques: mensajes, preguntas, botones y condiciones.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={nuevo} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>+ Nuevo flujo</button>
      </div>

      {df.flujos.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>
          Aún no tienes flujos. Crea uno y arma tu chatbot arrastrando bloques.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {df.flujos.map((f) => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 15.5, flex: 1 }}>{f.nombre}</span>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', color: f.activo ? '#047857' : '#64748B', background: f.activo ? '#D1FAE5' : '#F1F5F9' }}>{f.activo ? 'Activo' : 'Borrador'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#94A3B8', marginBottom: 14 }}>
                {f.nodos} bloque(s) · Disparador: {f.disparador.tipo === 'palabra' ? `palabra clave (${(f.disparador.palabras || []).join(', ') || 'sin definir'})` : f.disparador.tipo === 'lead_nuevo' ? 'lead nuevo' : 'manual'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditId(f.id)} style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Editar</button>
                <button onClick={() => { if (window.confirm('¿Eliminar este flujo?')) df.eliminarFlujo(f.id); }} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Editor visual: lienzo con nodos arrastrables + panel de edición. */
function Editor({ df, id, onClose }: { df: DealFlowState; id: string; onClose: () => void }) {
  const [flujo, setFlujo] = useState<Flujo | null>(null);
  const [nodos, setNodos] = useState<FlujoNodo[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [conectando, setConectando] = useState<{ from: string; key: string } | null>(null);
  const [msg, setMsg] = useState('');
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => { void df.cargarFlujo(id).then((f) => { if (f) { setFlujo(f); setNodos(f.nodos); } }); }, [id]);

  // Arrastre de nodos (listeners globales, registrados una sola vez).
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      const { id: did, dx, dy } = drag.current;
      setNodos((ns) => ns.map((n) => (n.id === did ? { ...n, x: Math.max(0, e.clientX - dx), y: Math.max(0, e.clientY - dy) } : n)));
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  if (!flujo) return <div style={{ padding: 40, color: '#64748B' }}>Cargando flujo…</div>;

  const updData = (nid: string, patch: Record<string, unknown>) => setNodos((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n)));

  const agregar = (tipo: NodoTipo) => {
    const base: Record<NodoTipo, Record<string, unknown>> = {
      mensaje: { texto: 'Escribe tu mensaje…' },
      pregunta: { texto: '¿Cuál es tu pregunta?', guardar: '' },
      opciones: { texto: 'Elige una opción:', opciones: [{ label: 'Opción 1', next: null }, { label: 'Opción 2', next: null }] },
      condicion: { contiene: '', siNext: null, noNext: null },
      accion: { accion: 'asignar', valor: '' },
      fin: { volverIA: true },
    };
    const n: FlujoNodo = { id: uid(), tipo, x: 80 + Math.random() * 80, y: 90 + Math.random() * 80, data: base[tipo], next: null };
    setNodos((ns) => [...ns, n]);
    setSel(n.id);
  };

  const setNext = (target: string) => {
    if (!conectando) return;
    const { from, key } = conectando;
    if (from === target) { setConectando(null); return; }
    setNodos((ns) => ns.map((n) => {
      if (n.id !== from) return n;
      if (key === 'next') return { ...n, next: target };
      if (key === 'si') return { ...n, data: { ...n.data, siNext: target } };
      if (key === 'no') return { ...n, data: { ...n.data, noNext: target } };
      if (key.startsWith('op')) { const i = +key.slice(2); const ops = [...((n.data.opciones as { label: string; next: string | null }[]) || [])]; ops[i] = { ...ops[i], next: target }; return { ...n, data: { ...n.data, opciones: ops } }; }
      return n;
    }));
    setConectando(null);
  };

  const guardar = () => { setMsg('Guardando…'); void df.guardarFlujo(id, { nombre: flujo.nombre, activo: flujo.activo, disparador: flujo.disparador, nodos }).then((ok) => setMsg(ok ? 'Guardado ✓' : 'No se pudo guardar')); };

  // Arrastre de nodos.
  const onDown = (e: React.MouseEvent, nid: string) => {
    if (conectando) { setNext(nid); return; }
    const n = nodos.find((x) => x.id === nid)!;
    drag.current = { id: nid, dx: e.clientX - n.x, dy: e.clientY - n.y, moved: false };
    setSel(nid);
  };

  const nodoById = (nid: string | null) => nodos.find((n) => n.id === nid) || null;
  const seleccionado = nodoById(sel);

  return (
    <section data-screen-label="Editor de flujo" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={{ background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>← Volver</button>
        <input value={flujo.nombre} onChange={(e) => setFlujo({ ...flujo, nombre: e.target.value })} style={{ fontWeight: 800, fontSize: 17, border: '1px solid transparent', borderRadius: 8, padding: '4px 8px', fontFamily: 'inherit' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
          <input type="checkbox" checked={flujo.activo} onChange={(e) => setFlujo({ ...flujo, activo: e.target.checked })} /> Activo
        </label>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: msg.includes('✓') ? '#059669' : '#64748B' }}>{msg}</span>}
        <button onClick={guardar} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Guardar</button>
      </div>

      {/* Disparador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, fontSize: 13, color: '#334155' }}>
        <span style={{ fontWeight: 700 }}>Se activa por:</span>
        <select value={flujo.disparador.tipo} onChange={(e) => setFlujo({ ...flujo, disparador: { ...flujo.disparador, tipo: e.target.value as 'palabra' } })} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13 }}>
          <option value="palabra">Palabra clave</option>
          <option value="lead_nuevo">Lead nuevo (bienvenida)</option>
          <option value="manual">Manual (desde el Inbox)</option>
        </select>
        {flujo.disparador.tipo === 'palabra' && (
          <input value={(flujo.disparador.palabras || []).join(', ')} onChange={(e) => setFlujo({ ...flujo, disparador: { ...flujo.disparador, palabras: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} placeholder="Palabras separadas por coma: soporte, ayuda, agendar" style={{ flex: 1, minWidth: 260, border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13 }} />
        )}
      </div>

      {/* Paleta */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', alignSelf: 'center' }}>Agregar:</span>
        {TIPOS.map((t) => (
          <button key={t.tipo} onClick={() => agregar(t.tipo)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 999, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: t.color }}>{t.icono} {t.titulo}</button>
        ))}
      </div>

      {conectando && <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 8 }}>Conectando… toca el bloque destino. <button onClick={() => setConectando(null)} style={{ background: 'none', border: 'none', color: '#92400E', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>cancelar</button></div>}

      <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 300px)', minHeight: 460 }}>
        {/* Lienzo */}
        <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto', position: 'relative' }}>
          <div style={{ position: 'relative', width: 2200, height: 1400 }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {nodos.flatMap((n) => salidas(n).filter((s) => s.next).map((s, i, arr) => {
                const t = nodoById(s.next);
                if (!t) return null;
                const sx = n.x + (arr.length > 1 ? (NODE_W / (arr.length + 1)) * (i + 1) : NODE_W / 2);
                const sy = n.y + 66;
                const tx = t.x + NODE_W / 2;
                const ty = t.y;
                return <path key={n.id + s.key} d={`M ${sx} ${sy} C ${sx} ${sy + 50}, ${tx} ${ty - 50}, ${tx} ${ty}`} stroke="#94A3B8" strokeWidth={2} fill="none" markerEnd="url(#arrow)" />;
              }))}
              <defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#94A3B8" /></marker></defs>
            </svg>

            {nodos.map((n) => {
              const m = meta(n.tipo);
              const outs = salidas(n);
              return (
                <div key={n.id} style={{ position: 'absolute', left: n.x, top: n.y, width: NODE_W, background: '#fff', border: '2px solid ' + (sel === n.id ? m.color : '#E2E8F0'), borderRadius: 12, boxShadow: '0 4px 12px -4px rgba(15,23,42,.15)', userSelect: 'none' }}>
                  <div onMouseDown={(e) => onDown(e, n.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderBottom: '1px solid #F1F5F9', cursor: conectando ? 'pointer' : 'grab', color: m.color }}>
                    <span>{m.icono}</span><span style={{ fontWeight: 800, fontSize: 12.5 }}>{m.titulo}</span>
                  </div>
                  <div onClick={() => (conectando ? setNext(n.id) : setSel(n.id))} style={{ padding: '9px 10px', fontSize: 12, color: '#475569', lineHeight: 1.4, cursor: 'pointer', minHeight: 20 }}>{resumen(n)}</div>
                  {outs.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '0 8px 8px' }}>
                      {outs.map((s) => (
                        <button key={s.key} onClick={() => setConectando({ from: n.id, key: s.key })}
                          style={{ background: s.next ? '#ECFDF5' : '#F8FAFC', border: '1px solid ' + (s.next ? '#A7F3D0' : '#E2E8F0'), color: s.next ? '#047857' : '#64748B', borderRadius: 999, padding: '3px 9px', fontFamily: 'inherit', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                          {s.label ? s.label + ' ' : ''}{s.next ? '✓→' : '→'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel de edición del nodo */}
        {seleccionado && (
          <div style={{ width: 300, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, overflow: 'auto' }}>
            <NodeEditor n={seleccionado} updData={updData} />
            <button onClick={() => { setNodos((ns) => ns.filter((x) => x.id !== seleccionado.id)); setSel(null); }} style={{ width: '100%', marginTop: 14, background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Eliminar bloque</button>
          </div>
        )}
      </div>
    </section>
  );
}

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };
const lbl: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, margin: '0 0 5px' };

function NodeEditor({ n, updData }: { n: FlujoNodo; updData: (id: string, patch: Record<string, unknown>) => void }) {
  const d = n.data as Record<string, string>;
  const m = meta(n.tipo);
  const set = (patch: Record<string, unknown>) => updData(n.id, patch);
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: m.color }}>{m.icono} {m.titulo}</div>
      {(n.tipo === 'mensaje' || n.tipo === 'pregunta') && (
        <>
          <div style={lbl}>Texto que envía</div>
          <textarea value={d.texto || ''} onChange={(e) => set({ texto: e.target.value })} rows={4} style={{ ...inp, resize: 'vertical' }} />
          {n.tipo === 'pregunta' && (<><div style={{ ...lbl, marginTop: 10 }}>Guardar respuesta en (opcional)</div><input value={d.guardar || ''} onChange={(e) => set({ guardar: e.target.value })} placeholder="ej: ciudad, nombre" style={inp} /></>)}
        </>
      )}
      {n.tipo === 'opciones' && (
        <>
          <div style={lbl}>Texto de la pregunta</div>
          <textarea value={d.texto || ''} onChange={(e) => set({ texto: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical', marginBottom: 10 }} />
          <div style={lbl}>Opciones (conecta cada una en el lienzo con →)</div>
          {((n.data.opciones as { label: string; next: string | null }[]) || []).map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={o.label} onChange={(e) => { const ops = [...(n.data.opciones as { label: string; next: string | null }[])]; ops[i] = { ...ops[i], label: e.target.value }; set({ opciones: ops }); }} style={inp} />
              <button onClick={() => { const ops = (n.data.opciones as unknown[]).filter((_, j) => j !== i); set({ opciones: ops }); }} style={{ background: '#fff', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '0 10px', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button onClick={() => set({ opciones: [...((n.data.opciones as unknown[]) || []), { label: 'Nueva opción', next: null }] })} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: '#334155' }}>+ Opción</button>
        </>
      )}
      {n.tipo === 'condicion' && (
        <>
          <div style={lbl}>Si la respuesta del cliente contiene…</div>
          <input value={d.contiene || ''} onChange={(e) => set({ contiene: e.target.value })} placeholder="ej: sí, comprar, factura" style={inp} />
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>Conecta las salidas <b>Sí</b> y <b>No</b> en el lienzo con →.</div>
        </>
      )}
      {n.tipo === 'accion' && (
        <>
          <div style={lbl}>Acción</div>
          <select value={d.accion || 'asignar'} onChange={(e) => set({ accion: e.target.value })} style={inp}>
            <option value="asignar">Asignar el chat a un agente</option>
            <option value="etiquetar">Etiquetar la conversación</option>
            <option value="ir_flujo">Ir a otro flujo</option>
          </select>
          {d.accion !== 'asignar' && (<><div style={{ ...lbl, marginTop: 10 }}>{d.accion === 'etiquetar' ? 'Etiqueta' : 'Nombre del flujo'}</div><input value={d.valor || ''} onChange={(e) => set({ valor: e.target.value })} style={inp} /></>)}
        </>
      )}
      {n.tipo === 'fin' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!n.data.volverIA} onChange={(e) => set({ volverIA: e.target.checked })} /> Al terminar, devolver el chat al asistente de IA
        </label>
      )}
    </div>
  );
}
