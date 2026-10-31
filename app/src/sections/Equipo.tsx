import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiTeamList, apiTeamCreate, apiTeamDelete, apiTeamEditar, apiRolGuardar, apiRolBorrar, type TeamMember, type RolEquipo, type PermisoDef } from '../lib/api';
import { confirmar, notificar } from '../components/dialogs';
import { Dropdown } from '../components/Dropdown';
import { iniciales } from '../lib/noche';

/**
 * Equipo (diseño "Noche"): las personas que entran a la tienda y su ROL. A la
 * izquierda las personas (y el formulario para agregar); a la derecha los roles
 * con sus permisos, editables en el mismo panel.
 */
export function Equipo({ df }: { df: DealFlowState }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [roles, setRoles] = useState<RolEquipo[]>([]);
  const [permisos, setPermisos] = useState<PermisoDef[]>([]);
  const [rolSel, setRolSel] = useState<RolEquipo | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [editMiembro, setEditMiembro] = useState<TeamMember | null>(null);
  const cargar = async () => {
    const r = await apiTeamList();
    if (r.data) {
      setTeam(r.data.team); setRoles(r.data.roles || []); setPermisos(r.data.permisos || []);
      setRolSel((s) => (s && s.id ? (r.data!.roles || []).find((x) => x.id === s.id) || null : s) || (r.data!.roles || [])[0] || null);
    } else notificar(r.error || 'No se pudo cargar el equipo.', 'error');
  };
  useEffect(() => { void cargar(); }, []);
  const quitar = async (m: TeamMember) => {
    if (!(await confirmar({ titulo: `¿Quitar a ${m.nombre} del equipo?`, mensaje: 'Ya no podrá entrar a la tienda. Los chats y pedidos que atendió se conservan.', aceptar: 'Quitar', peligro: true }))) return;
    const r = await apiTeamDelete(m.id);
    if (r.error) notificar(r.error, 'error'); else void cargar();
  };
  const opcionesRol = [{ value: '', label: 'Agente (acceso básico)' }, ...roles.map((r) => ({ value: r.id, label: r.nombre }))];
  const chatsDe = (nombre: string) => df.crmChats.filter((c) => c.asignado === nombre && c.sinResponder > 0).length;

  return (
    <section data-screen-label="Equipo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">{df.tiendaImpersonada || 'Tu tienda'} · {team ? `${team.length} ${team.length === 1 ? 'persona' : 'personas'}` : '…'}</span>
          <h1>Equipo</h1>
          <p className="sub">Quién entra a tu tienda y qué puede hacer. Cada persona tiene un rol; lo sensible (WhatsApp, Asistente, Integraciones, pagos) siempre queda contigo.</p>
        </div>
        <button type="button" className="btn btn-pri" onClick={() => setNuevo((v) => !v)}>＋ Agregar persona</button>
      </div>

      <div className="lateral ancho">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {nuevo && <NuevoMiembro roles={roles} opcionesRol={opcionesRol} onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); void cargar(); }} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team === null && <div className="vacio">Cargando tu equipo…</div>}
            {(team || []).map((m) => {
              const pendientes = chatsDe(m.nombre);
              return (
                <article key={m.id} className="miembro">
                  <span className={`avatar${m.esDueno ? '' : ' ne'}`} style={m.esDueno ? { background: 'var(--grad)', color: '#fff' } : undefined}>{iniciales(m.nombre)}</span>
                  <span style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{m.nombre}{m.esTu ? <span className="tenue" style={{ fontWeight: 500 }}> · tú</span> : null}</b><span className="tenue" style={{ fontSize: 12 }}>{m.email}</span></span>
                  <span style={{ minWidth: 0 }}>
                    {m.esDueno ? <span className="pill aviso sin">Dueño · acceso total</span> : (
                      <div style={{ maxWidth: 200 }}>
                        <Dropdown ariaLabel={`Rol de ${m.nombre}`} value={m.roleId || ''} options={opcionesRol}
                          onChange={(v) => void apiTeamEditar(m.id, { roleId: v }).then((r) => { if (r.error) notificar(r.error, 'error'); else { notificar(`✓ ${m.nombre} ahora es ${opcionesRol.find((o) => o.value === v)?.label}. Lo verá al recargar.`); void cargar(); } })} />
                      </div>
                    )}
                    <span className="tenue" style={{ display: 'block', fontSize: 11.5, marginTop: 3 }}>{pendientes ? `${pendientes} chat${pendientes === 1 ? '' : 's'} sin responder` : 'al día en el Inbox'}</span>
                  </span>
                  <span className={`pill ${pendientes ? 'aviso' : 'ok'}`}>{pendientes ? 'Con pendientes' : 'Al día'}</span>
                  <span className="fila" style={{ gap: 4 }}>
                    {!m.esDueno && <button type="button" className="btn btn-fant btn-chico" onClick={() => setEditMiembro(m)}>Editar</button>}
                    {!m.esDueno && !m.esTu && <button type="button" className="btn btn-fant btn-chico" onClick={() => void quitar(m)} style={{ color: 'var(--coral)' }}>Quitar</button>}
                  </span>
                </article>
              );
            })}
          </div>

          <section className="tarjeta">
            <div className="tarjeta-cab"><h2>Quién atiende ahora</h2><span className="tenue" style={{ fontSize: 12 }}>chats asignados en el Inbox</span></div>
            <div className="fila" style={{ gap: 8 }}>
              {(team || []).map((m) => { const n = df.crmChats.filter((c) => c.asignado === m.nombre && !c.live).length; return <span key={m.id} className={`pill ${n ? 'ok' : 'neutro'}`}>{m.nombre} · {n} chat{n === 1 ? '' : 's'}</span>; })}
              <span className="pill ia sin">✦ Asistente · {df.crmChats.filter((c) => c.live).length} chats</span>
            </div>
          </section>
        </div>

        <aside className="tarjeta" style={{ gap: 12, position: 'sticky', top: 0 }} aria-label="Roles y permisos">
          <div className="tarjeta-cab"><h2>Roles y permisos</h2><button type="button" className="btn btn-sec btn-chico" onClick={() => setRolSel({ id: '', nombre: '', permisos: ['chats'], miembros: 0 })}>＋ Nuevo rol</button></div>
          <p className="tenue" style={{ fontSize: 12 }}>Lo de la conexión de WhatsApp, el Asistente, las Integraciones, los pagos y el Equipo lo maneja solo el dueño.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {roles.map((r) => (
              <button key={r.id} type="button" className={`rol-b${rolSel?.id === r.id ? ' sel' : ''}`} onClick={() => setRolSel(r)}>
                <b>{r.nombre}</b><span>{r.miembros} persona{r.miembros === 1 ? '' : 's'} · {r.permisos.length} permisos</span>
              </button>
            ))}
            {!roles.length && <div className="tenue" style={{ fontSize: 12.5, gridColumn: 'span 2' }}>Aún no hay roles. Crea el primero.</div>}
          </div>
          {rolSel && <EditorRol key={rolSel.id || 'nuevo'} rol={rolSel} permisos={permisos} onGuardado={() => void cargar()} onBorrado={() => { setRolSel(null); void cargar(); }} />}
        </aside>
      </div>

      {editMiembro && <EditorMiembro m={editMiembro} onCerrar={() => setEditMiembro(null)} onGuardado={() => { setEditMiembro(null); void cargar(); }} />}
    </section>
  );
}

function NuevoMiembro({ roles, opcionesRol, onCreado, onCerrar }: { roles: RolEquipo[]; opcionesRol: { value: string; label: string }[]; onCreado: () => void; onCerrar: () => void }) {
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
    <section className="tarjeta borde-ia">
      <div className="tarjeta-cab"><h2>Agregar persona al equipo</h2><button type="button" className="btn btn-fant btn-chico" onClick={onCerrar}>Cancelar</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div className="campo"><label htmlFor="n-nombre">Nombre (así sale en los chats que atiende)</label><input id="n-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Andrés" /></div>
        <div className="campo"><label htmlFor="n-correo">Correo</label><input id="n-correo" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="andres@correo.com" /></div>
        <div className="campo"><label htmlFor="n-clave">Contraseña</label><input id="n-clave" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }} placeholder="Mínimo 8 caracteres" /></div>
        <div className="campo"><label>Rol</label><Dropdown ariaLabel="Rol" value={roleId} onChange={setRoleId} options={opcionesRol} /></div>
      </div>
      <div className="fila" style={{ gap: 12 }}>
        <button type="button" className="btn btn-pri" onClick={() => void crear()} disabled={guardando || !nombre.trim() || !email.trim() || !password}>{guardando ? 'Creando…' : 'Crear acceso'}</button>
        {error && <span className="mal" style={{ fontSize: 13 }}>{error}</span>}
      </div>
    </section>
  );
}

function Modal({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.65)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="tarjeta" style={{ width: 'min(560px, 100%)', maxHeight: '88vh', overflow: 'auto', boxSizing: 'border-box' }}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** Editor del rol elegido, dentro del panel lateral (sin ventana). */
function EditorRol({ rol, permisos, onGuardado, onBorrado }: { rol: RolEquipo; permisos: PermisoDef[]; onGuardado: () => void; onBorrado: () => void }) {
  const [nombre, setNombre] = useState(rol.nombre);
  const [sel, setSel] = useState<string[]>(rol.permisos);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  useEffect(() => { setNombre(rol.nombre); setSel(rol.permisos); setGuardado(false); }, [rol.id, rol.nombre, rol.permisos]);
  const alternar = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const guardar = async () => {
    setGuardando(true);
    const r = await apiRolGuardar(rol.id || null, nombre, sel);
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    setGuardado(true); setTimeout(() => setGuardado(false), 2500);
    notificar(`✓ Rol "${nombre}" guardado. Quien lo tenga lo verá al recargar la página.`);
    onGuardado();
  };
  const borrar = async () => {
    if (!(await confirmar({ titulo: `¿Borrar el rol "${rol.nombre}"?`, mensaje: 'Solo se puede borrar si nadie lo tiene.', aceptar: 'Borrar', peligro: true }))) return;
    const x = await apiRolBorrar(rol.id); if (x.error) notificar(x.error, 'error'); else onBorrado();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
      <div className="campo"><label htmlFor="rol-nombre">Nombre del rol</label><input id="rol-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Despachador" /></div>
      <span className="eti" style={{ display: 'block', fontSize: 10 }}>Qué puede hacer</span>
      <div>
        {permisos.map((p) => (
          <label key={p.id} className="perm">
            <input type="checkbox" checked={sel.includes(p.id)} onChange={() => alternar(p.id)} />
            <span><b>{p.nombre}</b><span className="suave-t" style={{ display: 'block', fontSize: 12 }}>{p.desc}</span></span>
          </label>
        ))}
      </div>
      <div className="fila" style={{ gap: 8 }}>
        <button type="button" className="btn btn-pri" onClick={() => void guardar()} disabled={guardando || !nombre.trim()} style={{ flex: 1 }}>{guardando ? 'Guardando…' : rol.id ? 'Guardar rol' : 'Crear rol'}</button>
        {rol.id && <button type="button" className="btn btn-fant btn-chico" onClick={() => void borrar()} style={{ color: 'var(--coral)' }}>Borrar</button>}
        {guardado && <span className="ok" style={{ fontSize: 13, fontWeight: 600 }}>✓ Guardado</span>}
      </div>
    </div>
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
      <div className="campo"><label>Nombre (así sale en los chats que atiende)</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      <div className="campo"><label>Correo</label><input value={m.email} disabled style={{ opacity: 0.7 }} /></div>
      <div className="campo"><label>Contraseña nueva (opcional)</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Déjala vacía para no cambiarla" /></div>
      <div className="fila" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-fant" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-pri" onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}
