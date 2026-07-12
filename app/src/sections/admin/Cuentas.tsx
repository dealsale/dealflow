import type { DealFlowState } from '../../hooks/useDealFlowState';
import { fmt } from '../../lib/format';

const labelStyle: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };
const linkBtn = (color: string): React.CSSProperties => ({ background: 'transparent', border: 'none', color, fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: '4px 6px' });

export function Cuentas({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Cuentas">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Cuentas</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Crea tiendas, edítalas, entra a dar soporte o desactívalas.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={df.toggleNewAccount}
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nueva cuenta
        </button>
      </div>

      {df.newAccountOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
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
              <select value={df.accForm.plan} onChange={(e) => df.setAccForm({ plan: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', background: '#fff' }}>
                {df.planNames.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={df.crearCuenta} disabled={df.accSaving} className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: df.accSaving ? 0.7 : 1 }}>
              {df.accSaving ? 'Creando…' : 'Crear cuenta'}
            </button>
            <button onClick={df.toggleNewAccount} style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            {df.accError && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.accError}</span>}
          </div>
        </div>
      )}

      {df.accCreated && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>✓ {df.accCreated}</div>
      )}

      {/* Panel de edición de una tienda */}
      {df.editStoreId && (
        <div style={{ background: '#fff', border: '1px solid #C7D2FE', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
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
              <select value={df.editStoreForm.plan} onChange={(e) => df.setEditStoreForm({ plan: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', background: '#fff' }}>
                {df.planNames.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Nueva contraseña (opcional)</div>
              <input className="df-input" type="password" value={df.editStoreForm.password} onChange={(e) => df.setEditStoreForm({ password: e.target.value })} placeholder="Déjalo vacío para no cambiarla" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={df.guardarEditarStore} className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Guardar cambios</button>
            <button onClick={df.cerrarPanelStore} style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            {df.editStoreMsg && <span style={{ color: df.editStoreMsg === 'Guardando…' ? '#64748B' : '#DC2626', fontSize: 13 }}>{df.editStoreMsg}</span>}
          </div>
        </div>
      )}

      {/* Panel de detalle de una tienda */}
      {(df.detalleLoading || df.detalleStore) && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          {df.detalleLoading || !df.detalleStore ? (
            <div style={{ color: '#64748B', fontSize: 13 }}>Cargando detalle…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{df.detalleStore.nombre}</div>
                  <div style={{ color: '#94A3B8', fontSize: 12 }}>{df.detalleStore.correo} · Plan {df.detalleStore.plan} · creada {df.detalleStore.creada}</div>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={df.cerrarPanelStore} style={linkBtn('#64748B')}>Cerrar ✕</button>
              </div>
              <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { k: 'Productos', v: df.detalleStore.productos },
                  { k: 'Pedidos', v: df.detalleStore.pedidos },
                  { k: 'Leads', v: df.detalleStore.leads },
                  { k: 'Agentes', v: df.detalleStore.agentes },
                  { k: 'Ventas del mes', v: fmt(df.detalleStore.ventasMes) },
                ].map((x) => (
                  <div key={x.k} style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10, padding: 12 }}>
                    <div style={{ color: '#64748B', fontSize: 11.5, fontWeight: 600 }}>{x.k}</div>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: df.detalleStore.whatsapp.conectado ? '#047857' : '#B91C1C', background: df.detalleStore.whatsapp.conectado ? '#D1FAE5' : '#FEE2E2', borderRadius: 6, padding: '3px 9px' }}>
                  WhatsApp {df.detalleStore.whatsapp.conectado ? 'conectado' : 'desconectado'}{df.detalleStore.whatsapp.numero ? ` · ${df.detalleStore.whatsapp.numero}` : ''}
                </span>
                {df.detalleStore.porEstado.map((e) => (
                  <span key={e.estado} style={{ fontSize: 12.5, color: '#475569' }}>{e.estado}: <b>{e.n}</b></span>
                ))}
              </div>
              {df.detalleStore.recientes.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Últimos pedidos</div>
                  {df.detalleStore.recientes.map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B' }}>{o.id}</span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente}</span>
                      <span style={{ color: '#64748B' }}>{o.estado}</span>
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
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#64748B', fontSize: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          Aún no hay tiendas. Crea la primera con «+ Nueva cuenta».
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {df.accounts.map((a) => {
            const id = String(a.id);
            const armed = df.armedDeleteStoreId === id;
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px auto 44px', gap: 14, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tienda}</div>
                  <div style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.correo} · Plan {a.plan}</div>
                </div>
                <span style={a.estadoStyle}>{a.estadoLabel}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => df.abrirDetalleStore(id)} style={linkBtn('#334155')}>Detalle</button>
                  <button onClick={() => df.abrirEditarStore(id)} style={linkBtn('#334155')}>Editar</button>
                  <button onClick={() => df.entrarATienda(id)} style={linkBtn('#4338CA')}>Entrar</button>
                  <button onClick={() => df.eliminarStore(id)} style={linkBtn(armed ? '#DC2626' : '#B91C1C')}>{armed ? '¿Seguro?' : 'Eliminar'}</button>
                </div>
                <div onClick={a.toggle} style={a.switchStyle}>
                  <div style={a.knobStyle} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
