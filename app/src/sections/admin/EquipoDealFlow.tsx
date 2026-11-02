import { useEffect, useState } from 'react';
import { apiEquipoDF, apiEquipoDFCambiar, apiEquipoDFCrear, apiEquipoDFEliminar, type UsuarioEquipo } from '../../lib/api';
import { confirmar, notificar, pedirTexto } from '../../components/dialogs';
import { fmtCO } from '../../lib/fechaCO';

/**
 * Cuentas del equipo DealFlow (solo el superadmin): administradores (todo el panel, menos lo
 * exclusivo del superadmin) y soporte (solo Soporte en vivo y Trazabilidad).
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 };
const btn: React.CSSProperties = { border: 0, borderRadius: 9, padding: '10px 16px', background: 'var(--df-purple)', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const btnS: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 10px', background: 'var(--df-surface)', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };
const ROL: Record<string, [string, string, string]> = {
  SUPERADMIN: ['Administrador', '#7C3AED', 'Cuenta principal: todo, incluido crear cuentas del equipo y llamar a las tiendas.'],
  ADMIN: ['Administrador', '#1D4ED8', 'Todo el panel: tiendas, planes, cuentas, contabilidad, cupones, biblioteca, soporte.'],
  SOPORTE: ['Soporte', '#047857', 'Solo Soporte en vivo (atender llamadas), Trazabilidad y el Drive del equipo.'],
  MARKETING: ['Marketing', '#DB2777', 'Solo el Drive del equipo (app.dealflow.sbs/drive): subir, organizar y compartir archivos. No entra al panel.'],
};
type RolEquipo = 'ADMIN' | 'SOPORTE' | 'MARKETING';
const fecha = (s: string) => (s ? fmtCO('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(Date.parse(s.replace(' ', 'T') + 'Z')) : 'Nunca');

export function EquipoDealFlow() {
  const [lista, setLista] = useState<UsuarioEquipo[] | null>(null);
  const [f, setF] = useState({ nombre: '', email: '', password: '', role: 'SOPORTE' as RolEquipo });
  const [msg, setMsg] = useState('');
  const cargar = () => void apiEquipoDF().then((r) => setLista(r.data?.usuarios || []));
  useEffect(cargar, []);

  const crear = async () => {
    setMsg('');
    const r = await apiEquipoDFCrear(f);
    if (r.error) { setMsg(r.error); return; }
    notificar(`✓ Cuenta de ${ROL[f.role][0].toLowerCase()} creada para ${f.email}. Pásale su correo y contraseña por un canal privado.`, 'ok', 6000);
    setF({ nombre: '', email: '', password: '', role: f.role });
    cargar();
  };
  const clave = async (u: UsuarioEquipo) => {
    const p = await pedirTexto({ titulo: `Nueva contraseña para ${u.nombre}`, mensaje: 'Mínimo 12 caracteres, con letras y números. Su sesión abierta se mantiene.', placeholder: 'Nueva contraseña', aceptar: 'Guardar' });
    if (!p) return;
    const r = await apiEquipoDFCambiar(u.id, { password: p });
    if (r.error) notificar(r.error, 'error', 6000); else notificar('✓ Contraseña cambiada.');
  };
  const rol = async (u: UsuarioEquipo, role: RolEquipo) => {
    if (!(await confirmar({ titulo: `¿Cambiar a ${u.nombre} a ${ROL[role][0]}?`, mensaje: `${ROL[role][2]} Tendrá que volver a iniciar sesión.`, aceptar: 'Cambiar' }))) return;
    const r = await apiEquipoDFCambiar(u.id, { role });
    if (r.error) notificar(r.error, 'error'); else cargar();
  };
  const eliminar = async (u: UsuarioEquipo) => {
    if (!(await confirmar({ titulo: `¿Eliminar la cuenta de ${u.nombre}?`, mensaje: `${u.email} ya no podrá entrar a DealFlow (su sesión se cierra de inmediato).`, aceptar: 'Eliminar', peligro: true }))) return;
    const r = await apiEquipoDFEliminar(u.id);
    if (r.error) notificar(r.error, 'error'); else cargar();
  };

  return (
    <section data-screen-label="Equipo DealFlow" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Equipo DealFlow</h1>
        <a href={'/drive'} target="_blank" rel="noopener" style={{ ...btnS, display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>☁️ Abrir el Drive del equipo</a>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Cuentas de las personas que administran DealFlow o atienden el soporte. Cada quien entra con su propio correo (queda registrado quién hizo qué).</p>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>➕ Crear cuenta</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Laura Gómez" style={inp} /></div>
          <div><label style={lbl}>Correo</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="laura@dealflow.sbs" style={inp} autoComplete="off" /></div>
          <div><label style={lbl}>Contraseña (12+ con letras y números)</label><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Contraseña inicial" style={inp} autoComplete="new-password" /></div>
          <div>
            <label style={lbl}>Rol</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['SOPORTE', 'MARKETING', 'ADMIN'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setF({ ...f, role: r })} style={{ ...btnS, flex: 1, padding: '9px 10px', background: f.role === r ? ROL[r][1] : 'var(--df-surface)', color: f.role === r ? '#fff' : 'var(--df-text-body)', borderColor: f.role === r ? ROL[r][1] : 'var(--df-border)' }}>{ROL[r][0]}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '8px 0 12px' }}><b>{ROL[f.role][0]}:</b> {ROL[f.role][2]}</div>
        <button onClick={() => void crear()} disabled={!f.nombre.trim() || !f.email.trim() || !f.password} style={{ ...btn, opacity: !f.nombre.trim() || !f.email.trim() || !f.password ? 0.5 : 1 }}>Crear cuenta</button>
        {msg && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--df-danger-dark, #B91C1C)' }}>{msg}</div>}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>👥 Cuentas {lista && <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}>({lista.length})</span>}</div>
        {!lista && <div style={{ fontSize: 13, color: 'var(--df-text-faint)' }}>Cargando…</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(lista || []).map((u) => (
            <div key={u.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--df-border)' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{u.nombre} <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: ROL[u.role]?.[1] || '#64748B', borderRadius: 999, padding: '2px 8px', marginLeft: 4 }}>{ROL[u.role]?.[0] || u.role}</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{u.email} · último acceso: {fecha(u.ultimoAcceso)}</div>
              </div>
              {u.role !== 'SUPERADMIN' && (
                <>
                  <select value="" aria-label={`Cambiar el rol de ${u.nombre}`} onChange={(e) => { if (e.target.value) void rol(u, e.target.value as RolEquipo); }} style={{ ...btnS, padding: '6px 8px' }}>
                    <option value="">Cambiar rol…</option>
                    {(['ADMIN', 'SOPORTE', 'MARKETING'] as const).filter((r) => r !== u.role).map((r) => <option key={r} value={r}>Pasar a {ROL[r][0]}</option>)}
                  </select>
                  <button onClick={() => void clave(u)} style={btnS}>Cambiar contraseña</button>
                  <button onClick={() => void eliminar(u)} style={{ ...btnS, color: '#B91C1C' }}>Eliminar</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
