import { useEffect, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { fmt } from '../../lib/format';
import { Dropdown } from '../../components/Dropdown';

const labelStyle: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };
const linkBtn = (color: string): React.CSSProperties => ({ background: 'transparent', border: 'none', color, fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: '4px 6px' });

export function Cuentas({ df }: { df: DealFlowState }) {
  // Ajustes de créditos y días de renta: acciones puntuales dentro de Editar
  // (no son parte del formulario nombre/correo/plan que guarda "Guardar cambios").
  const [creditosDelta, setCreditosDelta] = useState('');
  const [diasDelta, setDiasDelta] = useState('');
  const [ajusteMsg, setAjusteMsg] = useState('');
  useEffect(() => {
    setCreditosDelta('');
    setDiasDelta('');
    setAjusteMsg('');
  }, [df.editStoreId]);
  const cuentaEditando = df.accounts.find((x) => String(x.id) === df.editStoreId);

  return (
    <section data-screen-label="Admin Cuentas">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Cuentas</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Crea tiendas, edítalas, entra a dar soporte o desactívalas.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={df.toggleNewAccount}
          className="df-btn-primary"
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nueva cuenta
        </button>
      </div>

      {df.newAccountOpen && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nueva cuenta de tienda</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={labelStyle}>Nombre de la tienda</div>
              <input className="df-input" value={df.accForm.nombre} onChange={(e) => df.setAccForm({ nombre: e.target.value })} placeholder="Ej: Moda Urbana MDE" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Correo (con este entra)</div>
              <input className="df-input" value={df.accForm.correo} onChange={(e) => df.setAccForm({ correo: e.target.value })} placeholder="hola@modaurbana.co" style={inputStyle} />
            </div>
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={labelStyle}>Contraseña</div>
              <input className="df-input" type="password" value={df.accForm.password} onChange={(e) => df.setAccForm({ password: e.target.value })} placeholder="Mínimo 6 caracteres" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Plan</div>
              <Dropdown value={df.accForm.plan} onChange={(v) => df.setAccForm({ plan: v })} options={df.planNames.map((p) => ({ value: p, label: p }))} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={df.crearCuenta} disabled={df.accSaving} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: df.accSaving ? 0.7 : 1 }}>
              {df.accSaving ? 'Creando…' : 'Crear cuenta'}
            </button>
            <button onClick={df.toggleNewAccount} style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            {df.accError && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>{df.accError}</span>}
          </div>
        </div>
      )}

      {df.accCreated && (
        <div style={{ background: 'var(--df-brand-subtle-2)', border: '1px solid var(--df-brand-border)', color: 'var(--df-brand-dark)', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>✓ {df.accCreated}</div>
      )}

      {/* Panel de edición de una tienda */}
      {df.editStoreId && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Editar tienda</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={labelStyle}>Nombre de la tienda</div>
              <input className="df-input" value={df.editStoreForm.nombre} onChange={(e) => df.setEditStoreForm({ nombre: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Correo (con este entra)</div>
              <input className="df-input" value={df.editStoreForm.correo} onChange={(e) => df.setEditStoreForm({ correo: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={labelStyle}>Plan</div>
              <Dropdown value={df.editStoreForm.plan} onChange={(v) => df.setEditStoreForm({ plan: v })} options={df.planNames.map((p) => ({ value: p, label: p }))} />
            </div>
            <div>
              <div style={labelStyle}>Nueva contraseña (opcional)</div>
              <input className="df-input" type="password" value={df.editStoreForm.password} onChange={(e) => df.setEditStoreForm({ password: e.target.value })} placeholder="Déjalo vacío para no cambiarla" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <button onClick={df.guardarEditarStore} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Guardar cambios</button>
            <button onClick={df.cerrarPanelStore} style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            {df.editStoreMsg && <span style={{ color: df.editStoreMsg === 'Guardando…' ? 'var(--df-text-muted)' : 'var(--df-danger)', fontSize: 13 }}>{df.editStoreMsg}</span>}
          </div>

          {cuentaEditando && (
            <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, borderTop: '1px solid var(--df-border)', paddingTop: 16 }}>
              <div>
                <div style={labelStyle}>Créditos ({(cuentaEditando.creditos ?? 0).toLocaleString('es-CO')} actuales)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={creditosDelta}
                    onChange={(e) => setCreditosDelta(e.target.value)}
                    placeholder="Ej: 500 o -200"
                    style={{ ...inputStyle, width: 110 }}
                  />
                  <button
                    onClick={() => { if (creditosDelta) { df.darCreditos(df.editStoreId!, Number(creditosDelta)); setAjusteMsg('✓ Créditos ajustados'); setCreditosDelta(''); } }}
                    disabled={!creditosDelta}
                    style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', color: 'var(--df-purple)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: creditosDelta ? 'pointer' : 'default', opacity: creditosDelta ? 1 : 0.5, whiteSpace: 'nowrap' }}
                  >
                    Ajustar
                  </button>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Días de renta ({cuentaEditando.facturacionDias || cuentaEditando.facturacionFecha})</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={diasDelta}
                    onChange={(e) => setDiasDelta(e.target.value)}
                    placeholder="Ej: 30 o -15"
                    style={{ ...inputStyle, width: 110 }}
                  />
                  <button
                    onClick={() => { if (diasDelta) { df.extenderSuscripcion(df.editStoreId!, Number(diasDelta)); setAjusteMsg('✓ Renta ajustada'); setDiasDelta(''); } }}
                    disabled={!diasDelta}
                    style={{ background: 'var(--df-surface)', border: '1px solid var(--df-brand-border)', color: 'var(--df-brand-dark)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: diasDelta ? 'pointer' : 'default', opacity: diasDelta ? 1 : 0.5, whiteSpace: 'nowrap' }}
                  >
                    Ajustar
                  </button>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Tema Premium (upsell)</div>
                <button
                  onClick={cuentaEditando.togglePremium}
                  style={{ background: cuentaEditando.temaPremium ? 'linear-gradient(135deg,#7C3AED,#2563EB)' : 'var(--df-surface)', border: '1px solid ' + (cuentaEditando.temaPremium ? 'transparent' : 'var(--df-border)'), color: cuentaEditando.temaPremium ? '#fff' : 'var(--df-text-body)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', width: '100%' }}
                >
                  💎 {cuentaEditando.temaPremium ? 'Premium activado' : 'Activar Premium'}
                </button>
              </div>
              {ajusteMsg && <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--df-brand-dark)', fontWeight: 600 }}>{ajusteMsg}</div>}
            </div>
          )}
        </div>
      )}

      {/* Panel de detalle de una tienda */}
      {(df.detalleLoading || df.detalleStore) && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          {df.detalleLoading || !df.detalleStore ? (
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>Cargando detalle…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{df.detalleStore.nombre}</div>
                  <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{df.detalleStore.correo} · Plan {df.detalleStore.plan} · creada {df.detalleStore.creada}</div>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={df.cerrarPanelStore} style={linkBtn('var(--df-text-muted)')}>Cerrar ✕</button>
              </div>
              <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { k: 'Productos', v: df.detalleStore.productos },
                  { k: 'Pedidos', v: df.detalleStore.pedidos },
                  { k: 'Leads', v: df.detalleStore.leads },
                  { k: 'Agentes', v: df.detalleStore.agentes },
                  { k: 'Ventas del mes', v: fmt(df.detalleStore.ventasMes) },
                ].map((x) => (
                  <div key={x.k} style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 12 }}>
                    <div style={{ color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 600 }}>{x.k}</div>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: df.detalleStore.whatsapp.conectado ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', background: df.detalleStore.whatsapp.conectado ? 'var(--df-brand-subtle)' : 'var(--df-danger-subtle-2)', borderRadius: 6, padding: '3px 9px' }}>
                  WhatsApp {df.detalleStore.whatsapp.conectado ? 'conectado' : 'desconectado'}{df.detalleStore.whatsapp.numero ? ` · ${df.detalleStore.whatsapp.numero}` : ''}
                </span>
                <button
                  onClick={() => df.sincronizarWhatsapp(df.detalleStore!.id)}
                  title="Consulta a Meta el número actual de esta WABA y actualiza el que usa DealFlow"
                  style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-brand-dark)', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  🔄 Sincronizar número con Meta
                </button>
                {df.detalleStore.porEstado.map((e) => (
                  <span key={e.estado} style={{ fontSize: 12.5, color: 'var(--df-text-secondary)' }}>{e.estado}: <b>{e.n}</b></span>
                ))}
              </div>
              {df.waSyncStoreId === df.detalleStore.id && (df.waSyncMsg || df.waSyncNumeros.length > 0) && (
                <div style={{ background: 'var(--df-surface-2)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                  {df.waSyncMsg && <div style={{ fontSize: 12.5, fontWeight: 600, color: df.waSyncMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.waSyncMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-text-body)' }}>{df.waSyncMsg}</div>}
                  {df.waSyncNumeros.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {df.waSyncNumeros.map((n) => (
                        <button key={n.id} onClick={() => df.sincronizarWhatsapp(df.detalleStore!.id, n.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontWeight: 700 }}>{n.numero || '(sin número visible)'}</span>
                          {n.nombre && <span style={{ color: 'var(--df-text-muted)' }}>· {n.nombre}</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ color: 'var(--df-brand-dark)', fontWeight: 700 }}>Usar este</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {df.detalleStore.recientes.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Últimos pedidos</div>
                  {df.detalleStore.recientes.map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--df-border)', fontSize: 13 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)' }}>{o.id}</span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente}</span>
                      <span style={{ color: 'var(--df-text-muted)' }}>{o.estado}</span>
                      <span style={{ fontWeight: 700 }}>{fmt(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {df.accounts.length === 0 ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          Aún no hay tiendas. Crea la primera con «+ Nueva cuenta».
        </div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', minWidth: 620 }}>
          {df.accounts.map((a) => {
            const id = String(a.id);
            const armed = df.armedDeleteStoreId === id;
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.9fr 90px auto 44px', gap: 14, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--df-border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tienda}</span>
                    {a.oculta && <span title="Oculta para el admin normal; solo tú (superadmin) la ves" style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: 'var(--df-purple)', background: 'var(--df-purple-subtle)', borderRadius: 6, padding: '1px 7px', letterSpacing: '.02em' }}>👻 Oculta</span>}
                  </div>
                  <div style={{ color: 'var(--df-text-faint)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.correo} · Plan {a.plan}
                    <span style={{ color: 'var(--df-purple)', fontWeight: 700 }}> · 🎨 {(a.creditos ?? 0).toLocaleString('es-CO')} créditos</span>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: a.facturacionColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.facturacionFecha}</div>
                  {a.facturacionDias && <div style={{ fontSize: 11.5, color: a.facturacionColor, marginTop: 1 }}>{a.facturacionDias}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                  <span style={a.estadoStyle}>{a.estadoLabel}</span>
                  {a.temaPremium && <span title="Tema Premium habilitado" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-purple)' }}>💎 Premium</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => df.abrirDetalleStore(id)} style={linkBtn('var(--df-text-body)')}>Detalle</button>
                  <button onClick={() => df.abrirEditarStore(id)} style={linkBtn('var(--df-text-body)')}>Editar</button>
                  <button onClick={() => df.entrarATienda(id)} style={linkBtn('var(--df-indigo)')}>Entrar</button>
                  <button onClick={() => df.eliminarStore(id)} style={linkBtn(armed ? 'var(--df-danger)' : 'var(--df-danger-dark)')}>{armed ? '¿Seguro?' : 'Eliminar'}</button>
                </div>
                <div onClick={a.toggle} style={a.switchStyle}>
                  <div style={a.knobStyle} />
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}
    </section>
  );
}
