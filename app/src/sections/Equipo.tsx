import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiTeamList, apiTeamCreate, apiTeamDelete, apiTeamEditar, apiRolGuardar, apiRolBorrar, type TeamMember, type RolEquipo, type PermisoDef } from '../lib/api';
import { confirmar, notificar } from '../components/dialogs';
import { Dropdown } from '../components/Dropdown';

const label: CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 16 };
const btn: CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff', fontWeight: 700 };

/**
 * Equipo: las personas que entran a la tienda y su ROL. Cada rol define qué puede
 * hacer (responder chats, ver o editar pedidos, despachar, editar productos, ver
 * estadísticas…). El dueño crea y edita los roles y se los asigna a cada persona.
 */
export function Equipo(_props: { df: DealFlowState }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [roles, setRoles] = useState<RolEquipo[]>([]);
  const [permisos, setPermisos] = useState<PermisoDef[]>([]);
  const [editRol, setEditRol] = useState<RolEquipo | null>(null);
  const [editMiembro, setEditMiembro] = useState<TeamMember | null>(null);
  const cargar = async () => {
    const r = await apiTeamList();
    if (r.data) { setTeam(r.data.team); setRoles(r.data.roles || []); setPermisos(r.data.permisos || []); }
    else notificar(r.error || 'No se pudo cargar el equipo.', 'error');
  };
  useEffect(() => { void cargar(); }, []);
  const quitar = async (m: TeamMember) => {
    if (!(await confirmar({ titulo: `¿Quitar a ${m.nombre} del equipo?`, mensaje: 'Ya no podrá entrar a la tienda. Los chats y pedidos que atendió se conservan.', aceptar: 'Quitar', peligro: true }))) return;
    const r = await apiTeamDelete(m.id);
    if (r.error) notificar(r.error, 'error'); else void cargar();
  };
  const opcionesRol = [{ value: '', label: 'Agente (acceso básico)' }, ...roles.map((r) => ({ value: r.id, label: r.nombre }))];

  return (
    <section data-screen-label="Equipo">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Equipo</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Cada persona entra con su correo y contraseña y solo ve y hace lo que le permite su <b>rol</b>. En el Inbox se ve quién tiene abierto cada chat y quién está escribiendo.
        </p>
      </div>

      {/* Personas */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {team === null && <div style={{ padding: '28px 18px', color: 'var(--df-text-muted)', fontSize: 13.5, textAlign: 'center' }}>Cargando tu equipo…</div>}
        {(team || []).map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--df-border)', flexWrap: 'wrap' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: m.esDueno ? 'var(--df-warning)' : 'var(--df-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {m.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {m.nombre}
                {m.esTu && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px' }}>Tú</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: m.esDueno ? 'var(--df-warning)' : 'var(--df-indigo)', background: m.esDueno ? 'var(--df-warning-subtle)' : 'var(--df-indigo-subtle)', borderRadius: 6, padding: '2px 8px' }}>{m.esDueno ? 'Dueño · acceso total' : m.rol || 'Agente'}</span>
              </div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginTop: 1 }}>{m.email}</div>
            </div>
            {!m.esDueno && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 200 }}>
                  <Dropdown ariaLabel={`Rol de ${m.nombre}`} value={m.roleId || ''} options={opcionesRol}
                    onChange={(v) => void apiTeamEditar(m.id, { roleId: v }).then((r) => { if (r.error) notificar(r.error, 'error'); else { notificar(`✓ ${m.nombre} ahora es ${opcionesRol.find((o) => o.value === v)?.label}. Lo verá al recargar.`); void cargar(); } })} />
                </div>
                <button onClick={() => setEditMiembro(m)} style={btn}>✏️ Editar</button>
                {!m.esTu && <button onClick={() => void quitar(m)} style={{ ...btn, color: 'var(--df-danger)', borderColor: 'var(--df-danger-border)' }}>Quitar</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      <NuevoMiembro roles={roles} opcionesRol={opcionesRol} onCreado={() => void cargar()} />

      {/* Roles */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Roles y permisos</div>
          <button onClick={() => setEditRol({ id: '', nombre: '', permisos: ['chats'], miembros: 0 })} style={btnPri}>＋ Nuevo rol</button>
        </div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginBottom: 14 }}>
          Lo de la conexión de WhatsApp, el Asistente, las Integraciones, los pagos y el Equipo lo maneja solo el dueño.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {roles.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 14, flex: 1 }}>{r.nombre}</b>
                <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{r.miembros} persona{r.miembros === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {permisos.filter((p) => r.permisos.includes(p.id)).map((p) => (
                  <span key={p.id} style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 8px', background: p.id === 'despachar' ? 'var(--df-warning-subtle)' : 'var(--df-brand-subtle)', color: p.id === 'despachar' ? 'var(--df-warning)' : 'var(--df-brand-dark)' }}>{p.nombre}</span>
                ))}
                {!r.permisos.length && <span style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Sin permisos</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                <button onClick={() => setEditRol(r)} style={btn}>✏️ Editar permisos</button>
                <button onClick={() => void (async () => {
                  if (!(await confirmar({ titulo: `¿Borrar el rol "${r.nombre}"?`, mensaje: 'Solo se puede borrar si nadie lo tiene.', aceptar: 'Borrar', peligro: true }))) return;
                  const x = await apiRolBorrar(r.id); if (x.error) notificar(x.error, 'error'); else void cargar();
                })()} style={{ ...btn, color: 'var(--df-danger)' }}>Borrar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editRol && <EditorRol rol={editRol} permisos={permisos} onCerrar={() => setEditRol(null)} onGuardado={() => { setEditRol(null); void cargar(); }} />}
      {editMiembro && <EditorMiembro m={editMiembro} onCerrar={() => setEditMiembro(null)} onGuardado={() => { setEditMiembro(null); void cargar(); }} />}
    </section>
  );
}

function NuevoMiembro({ roles, opcionesRol, onCreado }: { roles: RolEquipo[]; opcionesRol: { value: string; label: string }[]; onCreado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!roleId && roles.length) setRoleId(roles[0].id); }, [roles.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const crear = async () => {
    setError(''); setGuardando(true);
    const r = await apiTeamCreate({ nombre: nombre.trim(), email: email.trim(), password, roleId });
    setGuardando(false);
    if (r.error) { setError(r.error); return; }
    notificar(`✓ ${nombre.trim()} ya puede entrar con su correo.`);
    setNombre(''); setEmail(''); setPassword(''); onCreado();
  };
  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Agregar persona al equipo</div>
      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div><div style={label}>Nombre</div><input className="df-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Andrés" style={input} /></div>
        <div><div style={label}>Correo</div><input className="df-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="andres@correo.com" style={input} /></div>
        <div><div style={label}>Contraseña</div><input className="df-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }} placeholder="Mínimo 8 caracteres" style={input} /></div>
        <div><div style={label}>Rol</div><Dropdown ariaLabel="Rol" value={roleId} onChange={setRoleId} options={opcionesRol} /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => void crear()} disabled={guardando || !nombre.trim() || !email.trim() || !password} className="df-btn-primary" style={{ ...btnPri, padding: '10px 18px', fontSize: 14, opacity: guardando ? 0.7 : 1 }}>{guardando ? 'Agregando…' : 'Agregar al equipo'}</button>
        {error && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}

function Modal({ titulo, children, onCerrar }: { titulo: string; children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 14, width: 'min(560px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{titulo}</div>
        {children}
      </div>
    </div>
  );
}

function EditorRol({ rol, permisos, onCerrar, onGuardado }: { rol: RolEquipo; permisos: PermisoDef[]; onCerrar: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(rol.nombre);
  const [sel, setSel] = useState<string[]>(rol.permisos);
  const [guardando, setGuardando] = useState(false);
  const alternar = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const guardar = async () => {
    setGuardando(true);
    const r = await apiRolGuardar(rol.id || null, nombre, sel);
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar(`✓ Rol "${nombre}" guardado. Quien lo tenga lo verá al recargar la página.`);
    onGuardado();
  };
  return (
    <Modal titulo={rol.id ? `Editar rol: ${rol.nombre}` : 'Nuevo rol'} onCerrar={onCerrar}>
      <div style={label}>Nombre del rol</div>
      <input className="df-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Despachador" style={{ ...input, marginBottom: 14 }} />
      <div style={label}>Qué puede hacer</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {permisos.map((p) => (
          <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${sel.includes(p.id) ? 'var(--df-brand-border)' : 'var(--df-border)'}`, background: sel.includes(p.id) ? 'var(--df-brand-subtle-2, var(--df-bg))' : 'var(--df-surface)', borderRadius: 9, padding: '9px 11px', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(p.id)} onChange={() => alternar(p.id)} style={{ marginTop: 3 }} />
            <span><b style={{ fontSize: 13 }}>{p.nombre}</b><br /><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{p.desc}</span></span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCerrar} style={btn}>Cancelar</button>
        <button onClick={() => void guardar()} disabled={guardando || !nombre.trim()} style={{ ...btnPri, opacity: guardando || !nombre.trim() ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar rol'}</button>
      </div>
    </Modal>
  );
}

function EditorMiembro({ m, onCerrar, onGuardado }: { m: TeamMember; onCerrar: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(m.nombre);
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    const r = await apiTeamEditar(m.id, { nombre, ...(password ? { password } : {}) });
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Cambios guardados.');
    onGuardado();
  };
  return (
    <Modal titulo={`Editar a ${m.nombre}`} onCerrar={onCerrar}>
      <div style={label}>Nombre (así sale en los chats que atiende)</div>
      <input className="df-input" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...input, marginBottom: 12 }} />
      <div style={label}>Correo</div>
      <input className="df-input" value={m.email} disabled style={{ ...input, marginBottom: 12, opacity: 0.7 }} />
      <div style={label}>Contraseña nueva (opcional)</div>
      <input className="df-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Déjala vacía para no cambiarla" style={{ ...input, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCerrar} style={btn}>Cancelar</button>
        <button onClick={() => void guardar()} disabled={guardando || !nombre.trim()} style={{ ...btnPri, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}
