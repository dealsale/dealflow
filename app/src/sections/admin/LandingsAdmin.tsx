import { useEffect, useState } from 'react';
import { apiAdminExtenderTienda, apiAdminGuardarLandings, apiAdminHabilitarLandings, apiAdminLandings, apiAdminTiendasLandings } from '../../lib/api';
import type { TiendaLandings } from '../../lib/api';
import { notificar } from '../../components/dialogs';

/**
 * Superadmin → Tienda en línea: la mensualidad, qué tiendas tienen la membresía al día,
 * cortesías (sin pago) y días de membresía sumados a mano.
 */
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const vigente = (t: TiendaLandings) => t.habilitado || (!!t.vence && t.vence >= hoy());
export function LandingsAdmin() {
  const [tiendas, setTiendas] = useState<TiendaLandings[] | null>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'activas' | 'inactivas'>('todas');
  useEffect(() => { void apiAdminTiendasLandings().then((r) => { if (r.data) setTiendas(r.data.tiendas); else notificar(r.error || 'No se pudieron cargar las tiendas.', 'error'); }); }, []);
  const cambiar = async (t: TiendaLandings) => {
    const nuevo = !t.habilitado;
    setTiendas((ts) => ts && ts.map((x) => (x.id === t.id ? { ...x, habilitado: nuevo } : x)));
    const r = await apiAdminHabilitarLandings(t.id, nuevo);
    if (r.error) {
      setTiendas((ts) => ts && ts.map((x) => (x.id === t.id ? { ...x, habilitado: !nuevo } : x)));
      notificar(r.error, 'error');
    } else notificar(`Cortesía ${nuevo ? 'activada' : 'quitada'} para ${t.tienda}.`);
  };
  const extender = async (t: TiendaLandings) => {
    const r = await apiAdminExtenderTienda(t.id, 30);
    if (r.data) { setTiendas((ts) => ts && ts.map((x) => (x.id === t.id ? { ...x, vence: r.data!.vence } : x))); notificar(`+30 días para ${t.tienda} (vence ${r.data.vence}).`); }
    else notificar(r.error || 'No se pudo.', 'error');
  };
  const nq = q.trim().toLowerCase();
  const visibles = (tiendas || []).filter((t) => (filtro === 'todas' || (filtro === 'activas') === vigente(t)) && (!nq || `${t.tienda} ${t.correo}`.toLowerCase().includes(nq)));
  const activas = (tiendas || []).filter(vigente).length;
  const chip = (id: typeof filtro, label: string) => (
    <button onClick={() => setFiltro(id)} style={{ border: '1px solid ' + (filtro === id ? 'var(--df-purple)' : 'var(--df-border)'), color: filtro === id ? 'var(--df-purple)' : 'var(--df-text-body)', background: 'var(--df-surface)', borderRadius: 999, padding: '5px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>{label}</button>
  );

  return (
    <section data-screen-label="Admin Landings">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Tienda en línea</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px' }}>Membresía mensual que cada tienda paga por Wompi. Aquí cambias el precio, das cortesías (sin pago) o sumas días a mano.</p>

      <PrecioLandings />

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 160 }}>Tiendas <span style={{ color: 'var(--df-text-muted)', fontWeight: 500, fontSize: 13 }}>· {activas} con membresía activa</span></div>
          {chip('todas', 'Todas')}{chip('activas', 'Activas')}{chip('inactivas', 'Sin membresía')}
          <input className="df-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tienda o correo…" style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, width: 220 }} />
        </div>
        {tiendas === null ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>
          : !visibles.length ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)', padding: 8 }}>Ninguna tienda coincide.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibles.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid var(--df-border)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.tienda}{!t.activa && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--df-text-faint)', fontWeight: 600 }}>(inactiva)</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{t.correo}{t.plan ? ` · ${t.plan}` : ''}</div>
                    {t.dominio && <div style={{ fontSize: 12, color: t.dominioEstado === 'activo' ? 'var(--df-success, #16a34a)' : 'var(--df-warning)' }}>🌐 {t.dominio} · {t.dominioEstado === 'activo' ? 'activo' : 'pendiente'}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)', minWidth: 170 }}>{t.landings ? `${t.landings} landing${t.landings === 1 ? '' : 's'} · ${t.publicadas} publicada${t.publicadas === 1 ? '' : 's'} · ${t.pedidos} pedidos` : 'Sin landings'}</div>
                  <div style={{ fontSize: 12, minWidth: 150, color: vigente(t) ? 'var(--df-success, #16a34a)' : 'var(--df-text-muted)', fontWeight: 600 }}>
                    {t.habilitado ? 'Cortesía' : t.vence ? (t.vence >= hoy() ? `Activa hasta ${t.vence}` : `Venció el ${t.vence}`) : 'Sin membresía'}
                  </div>
                  <button onClick={() => void extender(t)} title="Sumar 30 días de membresía" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer', color: 'var(--df-text-body)' }}>+30 días</button>
                  <label title="Cortesía: la tienda la usa sin pagar" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: t.habilitado ? 'var(--df-success, #16a34a)' : 'var(--df-text-muted)', minWidth: 112 }}>
                    <span role="switch" aria-checked={t.habilitado} tabIndex={0} onClick={() => void cambiar(t)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void cambiar(t); } }}
                      style={{ width: 38, height: 22, borderRadius: 999, background: t.habilitado ? 'var(--df-success, #16a34a)' : 'var(--df-border)', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 2, left: t.habilitado ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s' }} />
                    </span>
                    Cortesía
                  </label>
                </div>
              ))}
            </div>
          )}
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 10 }}>Si la membresía vence, la tienda tiene 3 días de gracia; después sus páginas dejan de mostrarse hasta que renueve. Puede seguir armando productos sin publicarlos.</div>
      </div>
    </section>
  );
}

/** Mensualidad de la Tienda en línea. */
function PrecioLandings() {
  const [precio, setPrecio] = useState('');
  const [stats, setStats] = useState<{ total: number; publicadas: number | null; pedidos: number | null; miembros: number } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void apiAdminLandings().then((r) => { if (r.data) { setPrecio(String(r.data.ajustes.mensualidad)); setStats(r.data.stats); } });
  }, []);
  const guardar = async () => {
    const r = await apiAdminGuardarLandings({ mensualidad: Number(precio) || 0 });
    setMsg(r.error || '✓ Guardado');
    if (r.data) setPrecio(String(r.data.ajustes.mensualidad));
  };
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 };
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, maxWidth: 640 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>🛍️ Mensualidad</div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginBottom: 14 }}>Lo que paga cada tienda al mes por su Tienda en línea (productos y landings ilimitados). 0 = gratis para todas.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 12, maxWidth: 260 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Precio mensual (COP)<input className="df-input" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ''))} style={{ ...inp, marginTop: 4 }} /></label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => void guardar()} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Guardar</button>
        {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</span>}
        {stats && <span style={{ fontSize: 12, color: 'var(--df-text-muted)', marginLeft: 'auto' }}>{stats.miembros} membresías al día · {stats.publicadas || 0} productos publicados · {stats.pedidos || 0} pedidos</span>}
      </div>
    </div>
  );
}
