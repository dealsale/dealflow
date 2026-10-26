import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiBorrarProveedor, apiCrearProveedor, apiEditarProveedor, apiProveedores, apiVerComoProveedor, type ConvenioConocido, type ProveedorAcceso } from '../../lib/api';
import { confirmar, notificar } from '../../components/dialogs';

/**
 * Administración → Proveedores: el equipo de DealFlow crea una cuenta por proveedor y le
 * vincula sus códigos de convenio de Effi. El proveedor entra a app.<dominio>/proveedores
 * y ve todos los pedidos (de cualquier tienda) que salen con esos convenios.
 */
const URL_PORTAL = `${window.location.origin}/proveedores`;

const claveAleatoria = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(10); crypto.getRandomValues(a);
  return [...a].map((n) => abc[n % abc.length]).join('');
};
const fechaCorta = (s: string) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : '');

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14 };
const input: CSSProperties = { width: '100%', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px', font: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)', boxSizing: 'border-box' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 9, padding: '8px 12px', font: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' };

interface Form { id?: string; nombre: string; email: string; password: string; convenios: string[] }

export function Proveedores() {
  const [lista, setLista] = useState<ProveedorAcceso[] | null>(null);
  const [convenios, setConvenios] = useState<ConvenioConocido[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [creado, setCreado] = useState<{ nombre: string; email: string; password: string } | null>(null);
  const [q, setQ] = useState('');

  const cargar = () => { void apiProveedores().then((r) => { if (r.data) { setLista(r.data.proveedores); setConvenios(r.data.convenios); } else setError(r.error || 'No se pudo cargar.'); }); };
  useEffect(cargar, []);
  const infoConv = (id: string) => convenios.find((c) => c.id === id);
  // Convenios ya vinculados a OTRO proveedor (para avisar si se repite).
  const duenoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of lista || []) for (const c of p.convenios) m.set(c, p.id === form?.id ? '' : p.nombre);
    return m;
  }, [lista, form?.id]);
  const sugeridos = convenios.filter((c) => !form?.convenios.includes(c.id) && (!codigo || `${c.id} ${c.nombre} ${c.tiendas.join(' ')}`.toLowerCase().includes(codigo.toLowerCase()))).slice(0, 12);

  const agregarCodigo = (c: string) => {
    const limpio = c.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (!form || !limpio || form.convenios.includes(limpio)) return;
    setForm({ ...form, convenios: [...form.convenios, limpio] });
    setCodigo('');
  };
  const guardar = async () => {
    if (!form) return;
    setError('');
    const conCodigo = codigo.trim() ? [...form.convenios, codigo.replace(/[^A-Za-z0-9_-]/g, '')] : form.convenios;
    const r = form.id
      ? await apiEditarProveedor(form.id, { nombre: form.nombre, email: form.email, convenios: conCodigo, ...(form.password ? { password: form.password } : {}) })
      : await apiCrearProveedor({ nombre: form.nombre, email: form.email, password: form.password, convenios: conCodigo });
    if (r.error) return setError(r.error);
    if (!form.id || form.password) setCreado({ nombre: form.nombre, email: form.email.trim().toLowerCase(), password: form.password });
    else notificar('✓ Proveedor actualizado.');
    setForm(null); setCodigo(''); cargar();
  };
  const copiarDatos = (d: { nombre: string; email: string; password: string }) => {
    const texto = `Hola ${d.nombre}, este es tu acceso al Portal de proveedores de DealFlow, donde ves los pedidos de tus convenios y su envío:\n\n${URL_PORTAL}\nCorreo: ${d.email}\nContraseña: ${d.password}`;
    void navigator.clipboard?.writeText(texto).then(() => notificar('✓ Datos copiados. Pégalos en WhatsApp o en un correo.'), () => notificar('No se pudo copiar.', 'error'));
  };
  const verComo = async (p: ProveedorAcceso) => {
    // La pestaña se abre antes de la llamada para que el navegador no la bloquee.
    const w = window.open('about:blank', '_blank');
    const r = await apiVerComoProveedor(p.id);
    if (r.error) { w?.close(); return notificar(r.error, 'error'); }
    if (w) w.location.href = '/proveedores'; else window.location.href = '/proveedores';
  };

  const visibles = (lista || []).filter((p) => !q.trim() || `${p.nombre} ${p.email} ${p.convenios.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section data-screen-label="Proveedores">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Proveedores</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>
            Crea la cuenta de cada proveedor y vincúlale sus códigos de convenio de Effi. Todos los pedidos de cualquier tienda que salgan con esos convenios le aparecen en su portal, con estadísticas y el seguimiento del envío. Las tiendas no tienen que hacer nada.
          </p>
        </div>
        <a href={URL_PORTAL} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', padding: '10px 14px' }}>Portal: {URL_PORTAL.replace(/^https?:\/\//, '')} ↗</a>
        <button style={{ ...btnPri, padding: '10px 16px', fontSize: 13.5 }} onClick={() => { setCreado(null); setError(''); setCodigo(''); setForm({ nombre: '', email: '', password: claveAleatoria(), convenios: [] }); }}>＋ Nuevo proveedor</button>
      </div>

      {creado && (
        <div style={{ ...card, borderColor: 'var(--df-brand-border)', background: 'var(--df-brand-subtle-2)', padding: 14, marginBottom: 14, display: 'grid', gap: 8, fontSize: 13.5 }}>
          <b>✓ Cuenta lista para {creado.nombre}. Envíale estos datos:</b>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.7 }}>{URL_PORTAL}<br />Correo: {creado.email}<br />Contraseña: {creado.password}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnPri} onClick={() => copiarDatos(creado)}>📋 Copiar datos</button>
            <button style={btn} onClick={() => setCreado(null)}>Listo</button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>La contraseña no se vuelve a mostrar. Si la pierde, edita la cuenta y ponle una nueva.</span>
        </div>
      )}

      {form && (
        <div style={{ ...card, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
          <b style={{ fontSize: 15 }}>{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>Nombre del proveedor
              <input style={input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Textiles Andina" />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>Correo para entrar
              <input style={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="proveedor@correo.com" />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'grid', gap: 4 }}>{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              <span style={{ display: 'flex', gap: 6 }}>
                <input style={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? 'Vacía = no se cambia' : 'Mínimo 6 caracteres'} />
                <button type="button" style={btn} title="Generar una contraseña" onClick={() => setForm({ ...form, password: claveAleatoria() })}>🎲</button>
              </span>
            </label>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Códigos de convenio de Effi</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 30 }}>
              {!form.convenios.length && <span style={{ fontSize: 12.5, color: 'var(--df-text-faint)', alignSelf: 'center' }}>Aún no hay convenios. Escribe el código abajo o elige uno de la lista.</span>}
              {form.convenios.map((c) => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand-border)', borderRadius: 999, padding: '4px 6px 4px 11px', fontSize: 12.5, fontWeight: 700 }}>
                  {c}{infoConv(c)?.tiendas.length ? <span style={{ fontWeight: 500, opacity: 0.8 }}>· {infoConv(c)!.tiendas.length} {infoConv(c)!.tiendas.length === 1 ? 'tienda' : 'tiendas'}</span> : null}
                  {duenoDe.get(c) && <span title={`También está vinculado a ${duenoDe.get(c)}`}>⚠️</span>}
                  <button type="button" aria-label={`Quitar ${c}`} onClick={() => setForm({ ...form, convenios: form.convenios.filter((x) => x !== c) })} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, maxWidth: 460 }}>
              <input style={input} value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCodigo(codigo); } }} placeholder="Escribe o busca el código del convenio" />
              <button type="button" style={btn} disabled={!codigo.trim()} onClick={() => agregarCodigo(codigo)}>Agregar</button>
            </div>
            {sugeridos.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Convenios que ya aparecen en DealFlow:</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sugeridos.map((c) => (
                    <button key={c.id} type="button" onClick={() => agregarCodigo(c.id)} title={c.tiendas.join(', ')} style={{ ...btn, borderRadius: 999, fontWeight: 600, textAlign: 'left' }}>
                      ＋ {c.id}{c.nombre !== `Convenio ${c.id}` ? ` · ${c.nombre}` : ''} <span style={{ color: 'var(--df-text-faint)', fontWeight: 500 }}>({c.tiendas.slice(0, 2).join(', ')}{c.tiendas.length > 2 ? ` +${c.tiendas.length - 2}` : ''}{c.pedidos ? ` · ${c.pedidos} pedidos` : ''})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <div style={{ color: 'var(--df-danger)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnPri} onClick={() => void guardar()}>{form.id ? 'Guardar cambios' : 'Crear proveedor'}</button>
            <button style={btn} onClick={() => { setForm(null); setError(''); setCodigo(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--df-border)' }}>
          <b style={{ flex: 1, fontSize: 14.5 }}>Cuentas de proveedor {lista ? <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}>({lista.length})</span> : null}</b>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar proveedor o convenio" style={{ ...input, width: 260, borderRadius: 999 }} />
        </div>
        {lista === null && !error && <div style={{ padding: 20, fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>}
        {error && !form && <div style={{ padding: 20, fontSize: 13, color: 'var(--df-danger)' }}>{error}</div>}
        {lista && !visibles.length && <div style={{ padding: 28, textAlign: 'center', fontSize: 13.5, color: 'var(--df-text-muted)' }}>{lista.length ? 'Ningún proveedor coincide.' : 'Todavía no hay proveedores. Crea el primero con «＋ Nuevo proveedor».'}</div>}
        {visibles.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderTop: i ? '1px solid var(--df-border)' : 0, opacity: p.activo ? 1 : 0.6 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{p.nombre.slice(0, 1).toUpperCase()}</span>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.nombre} {!p.activo && <span style={{ fontSize: 11.5, color: 'var(--df-danger)', fontWeight: 700 }}>· desactivado</span>}</div>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{p.email} · {p.ultimoAcceso ? `último ingreso ${fechaCorta(p.ultimoAcceso)}` : 'aún no ha entrado'}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {p.convenios.map((c) => <span key={c} title={infoConv(c)?.tiendas.join(', ')} style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace', background: 'var(--df-surface-2)', borderRadius: 999, padding: '2px 9px' }}>{c}</span>)}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 90 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{p.pedidos30}</div>
              <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>pedidos en 30 días</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={btn} onClick={() => void verComo(p)} title="Abre su portal tal como lo ve el proveedor">👁 Ver portal</button>
              <button style={btn} onClick={() => { setCreado(null); setError(''); setCodigo(''); setForm({ id: p.id, nombre: p.nombre, email: p.email, password: '', convenios: p.convenios }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
              <button style={btn} onClick={() => void apiEditarProveedor(p.id, { activo: !p.activo }).then((r) => (r.error ? notificar(r.error, 'error') : cargar()))}>{p.activo ? 'Desactivar' : 'Activar'}</button>
              <button style={{ ...btn, color: 'var(--df-danger)' }} onClick={() => void confirmar({ titulo: 'Borrar proveedor', mensaje: `${p.nombre} ya no podrá entrar al portal. Los pedidos no se tocan.`, aceptar: 'Borrar' }).then((ok) => { if (ok) void apiBorrarProveedor(p.id).then(cargar); })}>Borrar</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
