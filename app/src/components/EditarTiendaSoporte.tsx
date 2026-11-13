import { useEffect, useState } from 'react';
import {
  apiTiendaSoporte, apiTiendaSoporteClave, apiTiendaSoporteCreditos, apiTiendaSoporteEditar, apiTiendaSoporteSuscripcion,
  type TiendaSoporte,
} from '../lib/api';

/**
 * Panel que se despliega desde la barra de soporte (cuando el equipo está dentro de una
 * tienda): créditos, nombre, correo, plan, días de plan, contraseñas y estado de la cuenta,
 * sin volver al panel administrativo. Cada cambio queda en el registro del equipo.
 */
const campo: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--df-border)', background: 'var(--df-bg)', color: 'var(--df-text)', minWidth: 0, width: '100%', boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 0, borderRadius: 8, padding: '8px 12px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnS: React.CSSProperties = { ...btn, background: 'var(--df-surface-2)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)' };
const tit: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--df-text-muted)', margin: '0 0 8px' };
const caja: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, background: 'var(--df-surface)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, alignContent: 'start', minWidth: 0 };
const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 };

export function EditarTiendaSoporte({ onCerrar }: { onCerrar: () => void }) {
  const [d, setD] = useState<TiendaSoporte | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [creditos, setCreditos] = useState('');
  const [dias, setDias] = useState('30');
  const [claves, setClaves] = useState<Record<string, string>>({});

  const cargar = () => void apiTiendaSoporte().then((r) => {
    if (!r.data) { setError(r.error || 'No se pudo leer la tienda.'); return; }
    setD(r.data); setNombre(r.data.tienda.nombre); setCorreo(r.data.tienda.correo);
  });
  useEffect(() => { cargar(); }, []);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onCerrar]);

  const hacer = async (clave: string, fn: () => Promise<{ error?: string }>, ok: string, recargarPagina = false) => {
    setOcupado(clave); setError(''); setAviso('');
    const r = await fn();
    setOcupado('');
    if (r.error) { setError(r.error); return; }
    setAviso(ok);
    if (recargarPagina) { setTimeout(() => window.location.reload(), 700); return; }
    cargar();
  };

  const t = d?.tienda;
  const vence = t?.planVence ? new Date(t.planVence + (t.planVence.length <= 10 ? 'T12:00:00' : '')).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(2,6,23,.35)' }}>
      <div role="dialog" aria-label="Editar tienda" onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 30, left: 0, right: 0, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: 'var(--df-bg)', borderBottom: '3px solid var(--df-alert-brown)', boxShadow: '0 24px 50px -20px rgba(2,6,23,.6)', padding: '16px max(16px, env(safe-area-inset-right)) 18px max(16px, env(safe-area-inset-left))', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: 'var(--df-text)', whiteSpace: 'normal', textAlign: 'left' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ ...fila, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t ? t.nombre : 'Cargando…'}</div>
              {t && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
                {t.correo} · Plan {t.plan || '—'} ({t.planEstado}{vence ? `, vence ${vence}` : ''}) · {t.creditos.toLocaleString('es-CO')} créditos · WhatsApp {t.whatsapp.conectado ? `conectado ${t.whatsapp.numero}` : 'sin conectar'} · desde {t.creada}
              </div>}
            </div>
            <button type="button" onClick={onCerrar} style={btnS}>Cerrar ✕</button>
          </div>
          {(error || aviso) && <div role="status" style={{ fontSize: 13, fontWeight: 700, color: error ? 'var(--df-danger, #B91C1C)' : '#047857' }}>{error || aviso}</div>}

          {t && d && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
              <div style={caja}>
                <p style={tit}>Datos de la tienda</p>
                <label style={{ fontSize: 12, fontWeight: 700 }} htmlFor="sop-nombre">Nombre</label>
                <input id="sop-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={campo} />
                <label style={{ fontSize: 12, fontWeight: 700 }} htmlFor="sop-correo">Correo de acceso del dueño</label>
                <input id="sop-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} style={campo} />
                <button type="button" disabled={ocupado === 'datos' || (nombre === t.nombre && correo === t.correo)} style={{ ...btn, justifySelf: 'start', opacity: nombre === t.nombre && correo === t.correo ? 0.5 : 1 }}
                  onClick={() => void hacer('datos', () => apiTiendaSoporteEditar({ nombre, correo }), 'Datos guardados. El nombre nuevo se ve en el encabezado al recargar.')}>{ocupado === 'datos' ? 'Guardando…' : 'Guardar datos'}</button>
              </div>

              {d.esSuperadmin && <div style={caja}>
                <p style={tit}>Créditos IA</p>
                <div style={{ fontSize: 13 }}>Tiene <b>{t.creditos.toLocaleString('es-CO')}</b> créditos.</div>
                <div style={fila}>
                  <input id="sop-creditos" type="number" inputMode="numeric" value={creditos} onChange={(e) => setCreditos(e.target.value)} placeholder="Ej: 500 o -100" aria-label="Créditos a dar o quitar" style={campo} />
                  <button type="button" disabled={ocupado === 'cred' || !Number(creditos)} style={btn}
                    onClick={() => void hacer('cred', () => apiTiendaSoporteCreditos(Number(creditos)), `${Number(creditos) > 0 ? 'Se dieron' : 'Se quitaron'} ${Math.abs(Number(creditos))} créditos.`).then(() => setCreditos(''))}>Aplicar</button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[100, 500, 1500].map((n) => <button key={n} type="button" style={btnS} onClick={() => setCreditos(String(n))}>+{n}</button>)}
                </div>
              </div>}

              <div style={caja}>
                <p style={tit}>Plan</p>
                <label style={{ fontSize: 12, fontWeight: 700 }} htmlFor="sop-plan">Plan</label>
                <select id="sop-plan" value={t.plan} onChange={(e) => void hacer('plan', () => apiTiendaSoporteEditar({ plan: e.target.value }), `Plan cambiado a ${e.target.value}.`)} style={campo}>
                  {[...new Set([t.plan, ...d.planes].filter(Boolean))].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {d.esSuperadmin && <>
                <label style={{ fontSize: 12, fontWeight: 700 }} htmlFor="sop-dias">Extender el plan (días)</label>
                <div style={fila}>
                  <input id="sop-dias" type="number" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} style={campo} />
                  <button type="button" disabled={ocupado === 'dias' || !Number(dias)} style={btn}
                    onClick={() => void hacer('dias', () => apiTiendaSoporteSuscripcion(Number(dias)), `Plan ${Number(dias) > 0 ? 'extendido' : 'recortado'} ${Math.abs(Number(dias))} días.`)}>Aplicar</button>
                </div>
                </>}
              </div>

              <div style={caja}>
                <p style={tit}>Contraseñas</p>
                {d.usuarios.map((u) => (
                  <div key={u.id} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nombre || u.email} {u.dueno && <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}>· dueño</span>}<span style={{ color: 'var(--df-text-muted)', fontWeight: 500 }}> · {u.email}</span></div>
                    <div style={fila}>
                      <input id={`sop-clave-${u.id}`} type="text" autoComplete="new-password" value={claves[u.id] || ''} onChange={(e) => setClaves((c) => ({ ...c, [u.id]: e.target.value }))} placeholder="Nueva contraseña" aria-label={`Nueva contraseña de ${u.email}`} style={campo} />
                      <button type="button" disabled={ocupado === 'clave' + u.id || !(claves[u.id] || '').trim()} style={btn}
                        onClick={() => void hacer('clave' + u.id, () => apiTiendaSoporteClave(u.id, claves[u.id] || ''), `Contraseña de ${u.email} cambiada.`).then(() => setClaves((c) => ({ ...c, [u.id]: '' })))}>Cambiar</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={caja}>
                <p style={tit}>Cuenta</p>
                <label style={{ ...fila, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={t.activa} onChange={(e) => void hacer('activa', () => apiTiendaSoporteEditar({ activa: e.target.checked }), e.target.checked ? 'Cuenta activada.' : 'Cuenta desactivada: la tienda ya no puede entrar.')} />
                  <span style={{ minWidth: 0 }}>Cuenta activa (si la apagas, la tienda no puede entrar)</span>
                </label>
                <label style={{ ...fila, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={t.temaPremium} onChange={(e) => void hacer('tema', () => apiTiendaSoporteEditar({ temaPremium: e.target.checked }), 'Tema actualizado.', true)} />
                  <span style={{ minWidth: 0 }}>Tema premium</span>
                </label>
              </div>

              <div style={caja}>
                <p style={tit}>Módulos en prueba</p>
                <label style={{ ...fila, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={t.marketingIA ?? false} disabled={ocupado === 'mkia'}
                    onChange={(e) => void hacer('mkia', () => apiTiendaSoporteEditar({ marketingIA: e.target.checked }), `Marketing IA: ${e.target.checked ? 'encendido' : 'apagado'}.`, true)} />
                  <span style={{ minWidth: 0 }}><b style={{ fontWeight: 700 }}>Marketing IA</b><br /><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Estudio de videos y fotos con IA y campañas en Meta. Apagado: la tienda ve la sección con el aviso «en etapa de pruebas, solicita una demo».</span></span>
                </label>
              </div>

              <div style={caja}>
                <p style={tit}>Plantillas de WhatsApp</p>
                {([
                  ['crear', 'Constructor de plantillas', 'La tienda crea plantillas y las manda a aprobar a SU cuenta de Meta (con revisión de riesgo de Marketing).'],
                  ['automatizaciones', 'Plantilla propia por automatización', 'Elige qué plantilla aprobada (solo Utilidad) usa el bot en confirmación, guía, estado y novedad.'],
                  ['documentos', 'Plantillas con documento (PDF)', 'Crear y enviar plantillas con un PDF arriba (p. ej. la guía) y adjuntarlo al enviar.'],
                ] as const).map(([k, titulo, ayuda]) => (
                  <label key={k} style={{ ...fila, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={t.plantillas?.[k] ?? false} disabled={ocupado === 'tpl' + k}
                      onChange={(e) => void hacer('tpl' + k, () => apiTiendaSoporteEditar({ plantillas: { [k]: e.target.checked } }), `${titulo}: ${e.target.checked ? 'encendido' : 'apagado'}.`)} />
                    <span style={{ minWidth: 0 }}><b style={{ fontWeight: 700 }}>{titulo}</b><br /><span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{ayuda}</span></span>
                  </label>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Apagado por defecto. Las de Utilidad que Meta pase a Marketing se pausan solas en las automatizaciones.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
