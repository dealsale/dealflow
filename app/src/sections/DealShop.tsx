import { useEffect, useState } from 'react';
import { apiPreviaPlantilla, type PreviaPlantilla } from '../lib/api';
import type { DealFlowState } from '../hooks/useDealFlowState';

const ICONO: Record<string, string> = {
  'ecommerce-v10': '🛍️',
  'ecommerce-v2': '🚀',
};
const NOMBRE_CAMPO: Record<string, string> = {
  trato: 'Trato (tú / usted)', emojis: 'Emojis', emojiNivel: 'Cantidad de emojis', largo: 'Largo de respuestas', personalidad: 'Personalidad',
  modismos: 'Forma de hablar', insistencia: 'Forma de vender', sugerirCombos: 'Sugerir combos', saludo: 'Saludo', despedida: 'Despedida',
  prohibido: 'Temas prohibidos', humano: 'Pase a una persona',
};
const valorCampo = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (v && typeof v === 'object') { const h = v as { cuando?: string; mensaje?: string }; return [h.cuando && `Cuándo: ${h.cuando}`, h.mensaje && `Mensaje: «${h.mensaje}»`].filter(Boolean).join(' · '); }
  return String(v ?? '');
};

export function DealShop({ df }: { df: DealFlowState }) {
  const [desinst, setDesinst] = useState<{ id: string; nombre: string } | null>(null);
  const [verDetalle, setVerDetalle] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ id: string; nombre: string; force: boolean } | null>(null);
  const [previa, setPrevia] = useState<PreviaPlantilla | null>(null);
  const [guardar, setGuardar] = useState<Set<string>>(new Set());
  useEffect(() => {
    setPrevia(null); setGuardar(new Set());
    if (confirmar) void apiPreviaPlantilla(confirmar.id).then((r) => { if (r.data) setPrevia(r.data); });
  }, [confirmar]);
  return (
    <section data-screen-label="DealShop">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>DealShop</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Plantillas listas para tu tienda. Instálalas con un clic y tu asistente queda configurado para vender, sin escribir nada.
        </p>
      </div>

      {df.plantillaMsg && (
        <div style={{ background: 'var(--df-brand-subtle-2)', border: '1px solid var(--df-brand-border)', color: 'var(--df-brand-dark)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, marginBottom: 14 }}>
          {df.plantillaMsg}
        </div>
      )}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {df.plantillas.map((p) => (
          <div key={p.id} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(140deg,var(--df-brand-light),var(--df-brand))', color: '#052018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                {ICONO[p.id] || '🛍️'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{p.nombre}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: p.precio === 0 ? 'var(--df-brand-dark)' : 'var(--df-warning)', background: p.precio === 0 ? 'var(--df-brand-subtle)' : 'var(--df-warning-subtle)', borderRadius: 6, padding: '2px 8px' }}>
                    {p.precio === 0 ? 'Gratis' : '$' + p.precio.toLocaleString('es-CO')}
                  </span>
                  {p.instalada && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-indigo)', background: 'var(--df-indigo-subtle)', borderRadius: 6, padding: '2px 8px' }}>Instalada</span>}
                  {p.version && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface-2)', borderRadius: 6, padding: '2px 8px' }}>v{p.version}</span>}
                  {p.nuevo && !p.instalada && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--df-brand)', borderRadius: 6, padding: '2px 8px' }}>Nuevo</span>}
                  {p.actualizacion && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', borderRadius: 6, padding: '2px 8px' }}>Actualización disponible</span>}
                </div>
              </div>
            </div>

            <p style={{ color: 'var(--df-text-muted)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 14px' }}>{p.descripcion}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {p.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13 }}>
                  <span style={{ color: 'var(--df-brand)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'var(--df-text-body)', lineHeight: 1.45 }}>{f}</span>
                </div>
              ))}
            </div>

            {p.detalle && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" onClick={() => setVerDetalle(verDetalle === p.id ? null : p.id)} aria-expanded={verDetalle === p.id}
                  style={{ background: 'none', border: 0, padding: 0, color: 'var(--df-brand-dark)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {verDetalle === p.id ? '▾ Ocultar lo que incluye' : '▸ Ver qué incluye (método, reglas y estilo)'}
                </button>
                {verDetalle === p.id && (
                  <div style={{ marginTop: 10, border: '1px solid var(--df-border)', borderRadius: 10, background: 'var(--df-surface-2)', padding: 12, maxHeight: 420, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.55, color: 'var(--df-text-body)' }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Método de venta</div>
                    <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{p.detalle.instrucciones}</div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Reglas de venta y trato ({p.detalle.reglas.length})</div>
                    <ol style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 4 }}>{p.detalle.reglas.map((r, i) => <li key={i}>{r}</li>)}</ol>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Estilo del asistente</div>
                    <div style={{ display: 'grid', gap: 4 }}>{Object.entries(p.detalle.estilo).map(([k, v]) => <div key={k}><b>{NOMBRE_CAMPO[k] || k}:</b> {valorCampo(v)}</div>)}</div>
                  </div>
                )}
              </div>
            )}

            {p.detalle && (
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.5, background: 'var(--df-brand-subtle-2, var(--df-surface-2))', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                🔒 No toca tu información del negocio (envíos, pagos, cambios, horario), tus preguntas frecuentes, tus productos ni las reglas que escribiste tú. Solo actualiza lo de la plantilla.
              </div>
            )}

            <div style={{ flex: 1 }} />
            {p.actualizacion && (
              <button onClick={() => setConfirmar({ id: p.id, nombre: p.nombre, force: true })} disabled={!!df.instalando} className="df-btn-primary"
                style={{ width: '100%', background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ⬆️ Actualizar a la versión {p.version}
              </button>
            )}
            {p.instalada ? (
              <button
                onClick={() => df.instalando !== 'reinstalar:' + p.id && (p.detalle ? setConfirmar({ id: p.id, nombre: p.nombre, force: true }) : df.instalarPlantilla(p.id, true))}
                disabled={df.instalando === 'reinstalar:' + p.id}
                title="Vuelve a dejar tu asistente y el producto de ejemplo tal cual la plantilla (úsalo si tu tienda quedó vacía)."
                style={{
                  width: '100%',
                  background: 'var(--df-surface-2)',
                  color: 'var(--df-text-body)',
                  border: '1px solid var(--df-border)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: df.instalando === 'reinstalar:' + p.id ? 'default' : 'pointer',
                }}
              >
                {df.instalando === 'reinstalar:' + p.id ? 'Reinstalando…' : '↻ Reinstalar plantilla'}
              </button>
            ) : null}
            {p.instalada && (
              <button
                onClick={() => setDesinst({ id: p.id, nombre: p.nombre })}
                style={{ width: '100%', background: 'transparent', color: 'var(--df-danger-dark)', border: 'none', borderRadius: 10, padding: '9px 16px', marginTop: 6, fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Desinstalar
              </button>
            )}
            {p.puedeDeshacer && (
              <button onClick={() => df.restaurarPlantilla(p.id)} disabled={df.instalando === 'restaurar:' + p.id}
                title="Deja tu asistente exactamente como estaba antes de la última instalación de esta plantilla."
                style={{ width: '100%', background: 'transparent', color: 'var(--df-text-muted)', border: 'none', borderRadius: 10, padding: '6px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                {df.instalando === 'restaurar:' + p.id ? 'Volviendo…' : '↩ Deshacer: volver a como estaba mi asistente'}
              </button>
            )}
            {!p.instalada && (
              <button
                onClick={() => df.instalando !== p.id && (p.detalle ? setConfirmar({ id: p.id, nombre: p.nombre, force: false }) : df.instalarPlantilla(p.id))}
                disabled={df.instalando === p.id}
                className="df-btn-primary"
                style={{
                  width: '100%',
                  background: 'var(--df-brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: df.instalando === p.id ? 'default' : 'pointer',
                }}
              >
                {df.instalando === p.id ? 'Instalando…' : p.mejoraDe ? '⬆️ Actualizar mi asistente a esta versión' : 'Instalar con un clic'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginTop: 16 }}>
        Pronto habrá más plantillas (algunas premium) para distintos tipos de negocio.
      </div>

      {confirmar && (
        <div onClick={() => setConfirmar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div role="dialog" aria-label={`Instalar ${confirmar.nombre}`} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 16, padding: 24, width: 480, maxWidth: '100%', boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>{confirmar.force ? 'Actualizar' : 'Instalar'} «{confirmar.nombre}»</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--df-text-body)', display: 'grid', gap: 10, marginBottom: 18 }}>
              <div><b>Se actualiza:</b> el método de venta, las reglas de venta y trato de la plantilla, y el estilo del asistente (tono, saludo, despedida, temas prohibidos y pase a una persona) en los campos que no hayas cambiado tú.</div>
              <div><b>No se toca:</b> tu información del negocio (envíos, pagos, cambios, horario, ubicación), tus preguntas frecuentes, tus productos, tus instrucciones propias ni las reglas que escribiste tú.</div>
              {!previa ? <div style={{ color: 'var(--df-text-muted)' }}>Revisando tu asistente…</div> : (
                <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', background: 'var(--df-surface-2)', display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  <div>✅ Se conservan <b>{previa.conservar.length}</b> regla(s) que escribiste tú.</div>
                  {previa.quitaInstrucciones && <div>🔁 Tus instrucciones tienen el texto de la plantilla anterior: se quita ese texto y se deja lo que agregaste tú.</div>}
                  {previa.respetado.length > 0 && <div>🔒 Respetamos lo que cambiaste en: {previa.respetado.join(', ')}.</div>}
                  {previa.reemplazar.length > 0 && (
                    <div>
                      <div style={{ marginBottom: 6 }}>🔁 Estas <b>{previa.reemplazar.length}</b> regla(s) venían de la plantilla anterior y se reemplazan. Marca las que quieras conservar como tuyas:</div>
                      <div style={{ display: 'grid', gap: 5 }}>
                        {previa.reemplazar.map((r) => (
                          <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
                            <input type="checkbox" checked={guardar.has(r)} onChange={(e) => setGuardar((g) => { const n = new Set(g); if (e.target.checked) n.add(r); else n.delete(r); return n; })} style={{ marginTop: 3 }} />
                            <span>{r}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ color: 'var(--df-text-muted)' }}>Guardamos una copia: puedes volver a como estaba con «Deshacer».</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => { df.instalarPlantilla(confirmar.id, confirmar.force, [...guardar]); setConfirmar(null); }} disabled={!previa} className="df-btn-primary"
                style={{ flex: 1, background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {confirmar.force ? 'Sí, actualizar' : 'Sí, instalar'}
              </button>
              <button onClick={() => setConfirmar(null)} style={{ background: 'var(--df-surface)', color: 'var(--df-text)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {desinst && (
        <div onClick={() => setDesinst(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 16, padding: 26, width: 440, maxWidth: '100%', boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Desinstalar «{desinst.nombre}»</div>
            {desinst.id === 'ecommerce-v2' ? (
              <>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
                  Se quitan el método de venta y las reglas de la plantilla, y el estilo vuelve a lo que tenías en los campos que no cambiaste. Tus instrucciones, tus reglas, la información de tu negocio y tus productos se quedan como están.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => { df.desinstalarPlantilla(desinst.id, false); setDesinst(null); }}
                    style={{ background: 'var(--df-danger)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Sí, desinstalar</button>
                  <button onClick={() => setDesinst(null)} style={{ background: 'transparent', color: 'var(--df-text-muted)', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '4px' }}>Cancelar</button>
                </div>
              </>
            ) : (<>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
              ¿Quieres borrar también los <b>productos/servicios</b> que trajo esta plantilla? En ambos casos se limpian el prompt, las reglas y las instrucciones del asistente.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, true); setDesinst(null); }}
                style={{ background: 'var(--df-danger)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                🗑️ Sí, borrar todo (asistente + productos)
              </button>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, false); setDesinst(null); }}
                style={{ background: 'var(--df-surface)', color: 'var(--df-text)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                No, solo quitar el asistente (conserva mis productos)
              </button>
              <button onClick={() => setDesinst(null)} style={{ background: 'transparent', color: 'var(--df-text-muted)', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '4px' }}>Cancelar</button>
            </div>
            </>)}
          </div>
        </div>
      )}
    </section>
  );
}
