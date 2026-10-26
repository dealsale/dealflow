import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiBorrarProveedor, apiCrearProveedor, apiEditarProveedor, apiProveedores, type ProveedorAcceso } from '../lib/api';
import { confirmar, notificar } from './dialogs';

/**
 * Accesos al Portal de proveedores: el dueño crea un usuario por proveedor y le asigna
 * sus convenios de Effi. El proveedor entra en proveedores.<dominio> y ve solo esos pedidos.
 */
export function urlPortalProveedores(): string {
  const h = window.location.hostname;
  return /^app\./i.test(h) ? `https://${h.replace(/^app\./i, 'proveedores.')}` : `${window.location.origin}/proveedores`;
}

const claveAleatoria = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(10); crypto.getRandomValues(a);
  return [...a].map((n) => abc[n % abc.length]).join('');
};

const input: CSSProperties = { width: '100%', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 11px', font: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)', boxSizing: 'border-box' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 9, padding: '7px 12px', font: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' };

interface Form { id?: string; nombre: string; email: string; password: string; convenios: string[] }

export function ProveedoresPortal() {
  const [lista, setLista] = useState<ProveedorAcceso[] | null>(null);
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [otro, setOtro] = useState('');
  const [error, setError] = useState('');
  const [creado, setCreado] = useState<{ nombre: string; email: string; password: string } | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = () => { void apiProveedores().then((r) => { if (r.data) { setLista(r.data.proveedores); setConvenios(r.data.convenios); } else setError(r.error || 'No se pudo cargar.'); }); };
  useEffect(cargar, []);
  const url = urlPortalProveedores();
  const nombreConv = (id: string) => convenios.find((c) => c.id === id)?.nombre || `Convenio ${id}`;
  const opciones = [...convenios, ...(form?.convenios || []).filter((c) => !convenios.some((x) => x.id === c)).map((id) => ({ id, nombre: `Convenio ${id}` }))];

  const guardar = async () => {
    if (!form) return;
    setError('');
    const r = form.id
      ? await apiEditarProveedor(form.id, { nombre: form.nombre, email: form.email, convenios: form.convenios, ...(form.password ? { password: form.password } : {}) })
      : await apiCrearProveedor({ nombre: form.nombre, email: form.email, password: form.password, convenios: form.convenios });
    if (r.error) return setError(r.error);
    if (!form.id || form.password) setCreado({ nombre: form.nombre, email: form.email.trim().toLowerCase(), password: form.password });
    else notificar('✓ Acceso actualizado.');
    setForm(null); cargar();
  };
  const copiarDatos = (d: { nombre: string; email: string; password: string }) => {
    const texto = `Hola ${d.nombre.split(' ')[0]}, este es tu acceso al Portal de proveedores para ver los pedidos de tu convenio:\n\n${url}\nCorreo: ${d.email}\nContraseña: ${d.password}`;
    void navigator.clipboard?.writeText(texto).then(() => notificar('✓ Datos copiados. Pégalos en WhatsApp o en un correo.'), () => notificar('No se pudo copiar.', 'error'));
  };

  return (
    <section style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, margin: '14px 0', overflow: 'hidden' }}>
      <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--df-brand-subtle)', display: 'grid', placeItems: 'center', fontSize: 17 }}>🤝</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5 }}>Portal de proveedores</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--df-text-muted)' }}>Tus proveedores entran a <b>{url.replace(/^https?:\/\//, '')}</b> y ven los pedidos de su convenio, sus estadísticas y el envío.</span>
        </span>
        {lista && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface-2)', borderRadius: 999, padding: '2px 9px' }}>{lista.length} {lista.length === 1 ? 'acceso' : 'accesos'}</span>}
        <span style={{ color: 'var(--df-text-faint)', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {abierto && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnPri} onClick={() => { setCreado(null); setError(''); setForm({ nombre: '', email: '', password: claveAleatoria(), convenios: convenios.length === 1 ? [convenios[0].id] : [] }); }}>＋ Nuevo acceso</button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Abrir el portal ↗</a>
          </div>

          {creado && (
            <div style={{ border: '1px solid var(--df-brand-border)', background: 'var(--df-brand-subtle-2)', borderRadius: 12, padding: 12, fontSize: 13.5, display: 'grid', gap: 6 }}>
              <b>✓ Acceso listo para {creado.nombre}. Envíale estos datos:</b>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6 }}>{url}<br />Correo: {creado.email}<br />Contraseña: {creado.password}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPri} onClick={() => copiarDatos(creado)}>📋 Copiar datos</button>
                <button style={btn} onClick={() => setCreado(null)}>Listo</button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>La contraseña no se vuelve a mostrar. Si la pierde, edita el acceso y ponle una nueva.</span>
            </div>
          )}

          {form && (
            <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, display: 'grid', gap: 10, background: 'var(--df-bg)' }}>
              <b style={{ fontSize: 14 }}>{form.id ? 'Editar acceso' : 'Nuevo acceso de proveedor'}</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>Nombre del proveedor
                  <input style={input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Textiles Andina" />
                </label>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>Correo para entrar
                  <input style={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="proveedor@correo.com" />
                </label>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input style={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? 'Déjala vacía para no cambiarla' : 'Mínimo 6 caracteres'} />
                    <button type="button" style={btn} title="Generar una contraseña" onClick={() => setForm({ ...form, password: claveAleatoria() })}>🎲</button>
                  </span>
                </label>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Convenios que puede ver</div>
              {!opciones.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Aún no hay convenios de Effi en tu tienda. Escribe el código del convenio abajo.</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {opciones.map((c) => {
                  const on = form.convenios.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => setForm({ ...form, convenios: on ? form.convenios.filter((x) => x !== c.id) : [...form.convenios, c.id] })}
                      style={{ ...btn, borderRadius: 999, fontWeight: 600, background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface)', borderColor: on ? 'var(--df-brand)' : 'var(--df-border)', color: on ? 'var(--df-brand-dark)' : 'var(--df-text-body)' }}>
                      {on ? '✓ ' : ''}{c.nombre}{c.nombre.includes(c.id) ? '' : ` (${c.id})`}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, maxWidth: 360 }}>
                <input style={input} value={otro} onChange={(e) => setOtro(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))} placeholder="Otro código de convenio" />
                <button type="button" style={btn} disabled={!otro} onClick={() => { if (!form.convenios.includes(otro)) setForm({ ...form, convenios: [...form.convenios, otro] }); setOtro(''); }}>Agregar</button>
              </div>
              {error && <div style={{ color: 'var(--df-danger)', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPri} onClick={() => void guardar()}>{form.id ? 'Guardar cambios' : 'Crear acceso'}</button>
                <button style={btn} onClick={() => { setForm(null); setError(''); }}>Cancelar</button>
              </div>
            </div>
          )}

          {lista === null && <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>}
          {lista && !lista.length && !form && <div style={{ fontSize: 13, color: 'var(--df-text-muted)', padding: '6px 0' }}>Todavía no has creado accesos. Crea uno por proveedor y elige sus convenios.</div>}
          {lista?.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--df-border)', borderRadius: 12, padding: '10px 12px', opacity: p.activo ? 1 : 0.6 }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre} {!p.activo && <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>· desactivado</span>}</div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{p.email} · {p.ultimoAcceso ? `entró ${new Date(p.ultimoAcceso.replace(' ', 'T') + 'Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : 'aún no ha entrado'}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                  {p.convenios.map((c) => <span key={c} style={{ fontSize: 11.5, fontWeight: 600, background: 'var(--df-surface-2)', borderRadius: 999, padding: '2px 8px' }}>{nombreConv(c)}</span>)}
                </div>
              </div>
              <button style={btn} onClick={() => { setCreado(null); setError(''); setForm({ id: p.id, nombre: p.nombre, email: p.email, password: '', convenios: p.convenios }); }}>Editar</button>
              <button style={btn} onClick={() => void apiEditarProveedor(p.id, { activo: !p.activo }).then((r) => (r.error ? notificar(r.error, 'error') : cargar()))}>{p.activo ? 'Desactivar' : 'Activar'}</button>
              <button style={{ ...btn, color: 'var(--df-danger)' }} onClick={() => void confirmar({ titulo: 'Borrar acceso', mensaje: `${p.nombre} ya no podrá entrar al portal.`, aceptar: 'Borrar' }).then((ok) => { if (ok) void apiBorrarProveedor(p.id).then(cargar); })}>Borrar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
