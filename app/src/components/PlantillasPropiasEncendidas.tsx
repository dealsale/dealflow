import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Superadmin: tiendas con las plantillas propias de WhatsApp encendidas (constructor, por
 * automatización, con documento), qué plantilla eligieron, quién lo encendió y cuándo.
 * Sirve para encontrar una tienda donde se encendió por error y apagarla.
 */
interface Fila {
  id: string; nombre: string; crear: boolean; automatizaciones: boolean; documentos: boolean;
  elegidas: { clave: string; plantilla: string; estado: string }[];
  historial: { usuario: string; ruta: string; at: string }[];
}
const AUTOS: Record<string, string> = { confirmacion: 'Confirmación', guia: 'Guía', estado: 'Estado del envío', novedad: 'Novedad' };
const chip = (on: boolean): CSSProperties => ({ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: on ? 'var(--df-brand-subtle)' : 'var(--df-surface-2, #f1f5f9)', color: on ? 'var(--df-brand-dark)' : 'var(--df-text-faint)' });
const fecha = (s: string) => { try { return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } };

export function PlantillasPropiasEncendidas() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [msg, setMsg] = useState('');
  const cargar = () => void fetch('/api/superadmin/plantillas-propias', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => setFilas(d?.tiendas || [])).catch(() => setFilas([]));
  useEffect(cargar, []);
  const apagar = async (f: Fila) => {
    setMsg('');
    const r = await fetch(`/api/superadmin/plantillas-propias/${f.id}/apagar`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    if (r?.ok) { setMsg(`✓ Plantillas propias apagadas en ${f.nombre}: vuelve a usar las de DealFlow.`); cargar(); } else setMsg('No se pudo apagar. Intenta de nuevo.');
  };
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>💬 Tiendas con plantillas propias de WhatsApp encendidas</div>
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Si alguna no debería estar aquí, apágala: sus mensajes vuelven a salir con las plantillas de DealFlow.</div>
      </div>
      {filas === null ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>
        : !filas.length ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Ninguna tienda las tiene encendidas.</div>
        : filas.map((f) => (
          <div key={f.id} style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14, flex: 1, minWidth: 160 }}>{f.nombre}</b>
              <span style={chip(f.crear)}>Constructor</span>
              <span style={chip(f.automatizaciones)}>Por automatización</span>
              <span style={chip(f.documentos)}>Con documento</span>
              <button onClick={() => void apagar(f)} style={{ border: '1px solid var(--df-danger-dark, #b91c1c)', color: 'var(--df-danger-dark, #b91c1c)', background: 'var(--df-surface)', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Apagar todo</button>
            </div>
            {f.elegidas.length > 0 && <div style={{ fontSize: 12.5 }}>Plantillas elegidas: {f.elegidas.map((e) => `${AUTOS[e.clave] || e.clave} → "${e.plantilla}"${e.estado !== 'activa' ? ` (${e.estado})` : ''}`).join(' · ')}</div>}
            {f.historial.length > 0
              ? <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{f.historial.map((h, i) => <div key={i}>{fecha(h.at)} · {h.usuario}: {h.ruta}</div>)}</div>
              : <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Sin registro de quién lo encendió.</div>}
          </div>
        ))}
      {msg && <div role="status" style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}
