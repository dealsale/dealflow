import { useEffect, useState } from 'react';
import { Icono, IcoTexto } from './Icono';
import { confirmar, notificar } from './dialogs';
import { apiBodegas, apiBodegaGuardar, apiBodegaBorrar, type BodegaProveedor } from '../lib/api';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 600, marginBottom: 4 };
const btnPrimary: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', minHeight: 40, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnSec: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', minHeight: 40, fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

// Lista compartida entre Integraciones, Productos y el despacho del pedido.
let cache: BodegaProveedor[] | null = null;
const oyentes = new Set<(b: BodegaProveedor[]) => void>();
export async function recargarBodegas(): Promise<BodegaProveedor[]> {
  const r = await apiBodegas();
  cache = r.data?.bodegas || [];
  oyentes.forEach((f) => f(cache!));
  return cache;
}
/** Bodegas de los proveedores de la tienda (las pide una vez y las comparte). */
export function useBodegas(): BodegaProveedor[] {
  const [b, setB] = useState<BodegaProveedor[]>(cache || []);
  useEffect(() => {
    oyentes.add(setB);
    if (!cache) void recargarBodegas();
    return () => { oyentes.delete(setB); };
  }, []);
  return b;
}

const VACIA: BodegaProveedor = { id: '', nombre: '', empresa: '', telefono: '', email: '', direccion: '', referencia: '', departamento: '', ciudad: '', nit: '', avisar: true };

/**
 * Dropshipping: bodegas de los proveedores. La transportadora recoge el paquete ahí y la guía
 * le llega al proveedor por WhatsApp con el PDF.
 */
export function BodegasProveedores() {
  const bodegas = useBodegas();
  const [editando, setEditando] = useState<BodegaProveedor | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const f = (k: keyof BodegaProveedor) => ({
    value: String(editando?.[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEditando((x) => (x ? { ...x, [k]: e.target.value } : x)),
  });
  const guardar = async () => {
    if (!editando) return;
    setGuardando(true); setMsg('');
    const r = await apiBodegaGuardar(editando);
    setGuardando(false);
    if (r.error) { setMsg(r.error); return; }
    await recargarBodegas();
    notificar(`✓ Bodega de ${editando.nombre} guardada. Ahora elige en cada producto si sale desde aquí.`);
    setEditando(null);
  };
  const borrar = async (b: BodegaProveedor) => {
    if (!(await confirmar({ titulo: `Borrar la bodega de ${b.nombre}`, mensaje: 'Los productos que salían desde esta bodega vuelven a salir desde tu dirección. Los envíos ya creados no cambian.', aceptar: 'Borrar' }))) return;
    await apiBodegaBorrar(b.id);
    await recargarBodegas();
  };
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--df-border)', paddingTop: 12, marginTop: 4 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Bodegas de tus proveedores (dropshipping)</div>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>
          Si un proveedor tiene el producto, agrega aquí su bodega y en el producto elige <b>«Sale desde»</b>. La transportadora recoge el paquete en la bodega del proveedor
          y a él le llega la guía por WhatsApp con el PDF para que la pegue en el paquete.
        </div>
      </div>

      {bodegas.map((b) => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
          <Icono nombre="bodega" tam={18} degradado />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{b.nombre}{b.empresa ? <span style={{ color: 'var(--df-text-muted)', fontWeight: 500 }}> · {b.empresa}</span> : null}</div>
            <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{b.direccion}, {b.ciudad} · <IcoTexto n="celular" tam={12} />{b.telefono}{b.avisar ? ' · recibe la guía por WhatsApp' : ' · sin aviso por WhatsApp'}</div>
          </div>
          <button onClick={() => { setEditando({ ...b }); setMsg(''); }} style={{ ...btnSec, minHeight: 32, padding: '5px 12px', fontSize: 12 }}>Editar</button>
          <button onClick={() => void borrar(b)} style={{ background: 'transparent', border: 'none', color: 'var(--df-danger)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Borrar</button>
        </div>
      ))}

      {editando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px dashed var(--df-border-strong)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{editando.id ? `Editar bodega de ${editando.nombre}` : 'Nueva bodega de proveedor'}</div>
          <div style={grid2}>
            <div><div style={lbl}>Nombre de quien entrega *</div><input {...f('nombre')} maxLength={30} placeholder="Ej. Carlos Gómez" style={inputStyle} /></div>
            <div><div style={lbl}>Empresa del proveedor</div><input {...f('empresa')} maxLength={60} style={inputStyle} /></div>
            <div><div style={lbl}>Celular con WhatsApp *</div><input {...f('telefono')} inputMode="tel" placeholder="3001234567" style={inputStyle} /></div>
            <div><div style={lbl}>Correo (opcional)</div><input {...f('email')} type="email" style={inputStyle} /></div>
            <div><div style={lbl}>Dirección de la bodega *</div><input {...f('direccion')} maxLength={100} style={inputStyle} /></div>
            <div><div style={lbl}>Referencia (barrio, local…)</div><input {...f('referencia')} maxLength={30} style={inputStyle} /></div>
            <div><div style={lbl}>Departamento</div><input {...f('departamento')} placeholder="Ej. Antioquia" style={inputStyle} /></div>
            <div><div style={lbl}>Ciudad / municipio *</div><input {...f('ciudad')} placeholder="Ej. Medellín" style={inputStyle} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={editando.avisar} onChange={(e) => setEditando((x) => (x ? { ...x, avisar: e.target.checked } : x))} />
            Mandarle la guía por WhatsApp apenas se genere
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.5 }}>
            La guía sale a nombre de tu tienda; la transportadora recoge en esta dirección y llama a este celular. Si el proveedor no le ha escrito a tu WhatsApp en las últimas 24 horas,
            le llega un aviso para que responda y, apenas responda, le llegan las guías. El bot no le contesta a este número.
          </div>
          {msg && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void guardar()} disabled={guardando} style={{ ...btnPrimary, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar bodega'}</button>
            <button onClick={() => { setEditando(null); setMsg(''); }} style={btnSec}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setEditando({ ...VACIA }); setMsg(''); }} style={{ ...btnSec, alignSelf: 'flex-start', color: 'var(--df-brand-dark)', borderColor: 'var(--df-brand)' }}>+ Agregar bodega de proveedor</button>
      )}
    </div>
  );
}
