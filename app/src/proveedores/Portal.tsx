import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import logo from '../assets/logo.png';
import { Donut, HBars, LineChart } from '../components/Charts';

/*
 * Portal de proveedores (proveedores.<dominio> o /proveedores). El proveedor entra con
 * el acceso que le creó la tienda y ve solo los pedidos hechos con sus convenios de
 * Effi: estadísticas, el detalle de cada pedido, la guía y su recorrido. Usa su propia
 * sesión (/api/proveedor/*), separada de la del panel.
 */

type Etapa = 'por_despachar' | 'por_recoger' | 'transito' | 'reparto' | 'novedad' | 'entregado' | 'devuelto' | 'cancelado';
interface Yo { nombre: string; email: string; tienda: string; convenios: { id: string; nombre: string }[] }
interface Pedido {
  id: string; codigo: string; numero: number; fecha: string; dia: string; cliente: string; tel: string; ciudad: string; departamento: string; direccion: string;
  estado: string; estadoTransportadora: string; etapa: Etapa; convenio: string; guia: string; guiaUrl: string; transportadora: string; remision: string;
  total: number; items: { qty: number; nombre: string }[]; unidades: number; ultimoMovimiento: { fecha: string; estado: string; observacion: string } | null;
}
interface Detalle extends Pedido {
  entregaEstimada: string;
  recorrido: { fecha: string; estado: string; observacion: string; foto: string }[];
  novedades: { motivo: string; detalle: string; estado: string; fecha: string; abierta: boolean; gestion: string }[];
  traza: { etapa: string; titulo: string; fecha: string }[];
}
interface Tablero {
  desde: string; hasta: string; hoy: string;
  resumen: { pedidos: number; unidades: number; valor: number; porDespachar: number; enCamino: number; novedades: number; entregados: number; devueltos: number; valorEntregado: number; efectividad: number | null };
  serie: { fecha: string; valor: number }[];
  porEtapa: { id: Etapa; label: string; color: string; valor: number }[];
  topProductos: { label: string; valor: number }[];
  topCiudades: { label: string; valor: number }[];
  pedidos: Pedido[];
}

const ETAPA: Record<Etapa, { label: string; color: string; bg: string }> = {
  por_despachar: { label: 'Por despachar', color: '#475569', bg: 'rgba(148,163,184,.18)' },
  por_recoger: { label: 'Guía generada', color: '#4F46E5', bg: 'rgba(99,102,241,.14)' },
  transito: { label: 'En tránsito', color: '#0369A1', bg: 'rgba(14,165,233,.14)' },
  reparto: { label: 'En reparto', color: '#B45309', bg: 'rgba(245,158,11,.16)' },
  novedad: { label: 'Novedad', color: '#DC2626', bg: 'rgba(239,68,68,.14)' },
  entregado: { label: 'Entregado', color: '#047857', bg: 'rgba(16,185,129,.15)' },
  devuelto: { label: 'Devuelto', color: '#9D174D', bg: 'rgba(236,72,153,.13)' },
  cancelado: { label: 'Cancelado', color: '#64748B', bg: 'rgba(100,116,139,.14)' },
};

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const pesosCorto = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : pesos(n));
const fechaHora = (s: string) => {
  if (!s) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
};
// Fechas de la transportadora: ya vienen en hora de Colombia.
const fechaLocal = (s: string) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const masDias = (iso: string, n: number) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 86400e3).toISOString().slice(0, 10);

async function api<T>(ruta: string, opts?: { method?: string; body?: unknown }): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const r = await fetch('/api/proveedor' + ruta, {
      method: opts?.method || 'GET', credentials: 'same-origin',
      headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const b = await r.json().catch(() => ({}));
    return r.ok ? { data: b as T, status: r.status } : { error: (b as { error?: string }).error || 'No se pudo completar.', status: r.status };
  } catch {
    return { error: 'Sin conexión. Revisa tu internet.', status: 0 };
  }
}

const CSS = `
.pp { min-height: 100vh; background: var(--df-bg); color: var(--df-text); font-family: inherit; }
.pp *, .pp *::before, .pp *::after { box-sizing: border-box; }
.pp-card { background: var(--df-surface); border: 1px solid var(--df-border); border-radius: 16px; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 10px 30px -22px rgba(15,23,42,.35); }
.pp-btn { font-family: inherit; cursor: pointer; border-radius: 10px; font-weight: 700; font-size: 13.5px; padding: 9px 14px; border: 1px solid var(--df-border); background: var(--df-surface); color: var(--df-text-body); }
.pp-btn:hover { background: var(--df-surface-2); }
.pp-chip { font-family: inherit; cursor: pointer; border-radius: 999px; font-weight: 600; font-size: 12.5px; padding: 6px 12px; border: 1px solid var(--df-border); background: var(--df-surface); color: var(--df-text-body); white-space: nowrap; }
.pp-chip[aria-pressed="true"] { background: var(--df-text); color: var(--df-surface); border-color: var(--df-text); }
.pp-fila { display: grid; grid-template-columns: 140px minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,1fr) 130px 110px; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--df-border); cursor: pointer; text-align: left; width: 100%; background: none; border-left: 0; border-right: 0; border-bottom: 0; font: inherit; color: inherit; }
.pp-fila:hover { background: var(--df-surface-2); }
.pp-cab { cursor: default; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--df-text-muted); border-top: 0; }
.pp-cab:hover { background: none; }
.pp-kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
.pp-graf { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(0,1fr); gap: 12px; }
.pp-dos { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.pp-cajon { position: fixed; inset: 0; z-index: 50; display: flex; justify-content: flex-end; background: rgba(2,6,23,.45); animation: ppFade .18s ease both; }
.pp-cajon > div { width: min(560px, 100%); height: 100%; overflow-y: auto; background: var(--df-bg); box-shadow: -20px 0 50px -20px rgba(0,0,0,.4); animation: ppEntra .25s cubic-bezier(.2,.8,.2,1) both; }
@keyframes ppFade { from { opacity: 0 } }
@keyframes ppEntra { from { transform: translateX(40px); opacity: .4 } }
.pp-login { min-height: 100vh; display: grid; grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); background: #050913; }
.pp-marca { position: relative; overflow: hidden; color: #E8F1EE; padding: 48px; display: flex; flex-direction: column; justify-content: space-between;
  background: radial-gradient(700px 420px at 90% 0%, rgba(37,99,235,.35), transparent 60%), radial-gradient(600px 460px at 0% 100%, rgba(16,185,129,.3), transparent 60%), linear-gradient(160deg, #06231C, #0B1730); }
.pp-marca::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(ellipse at 30% 50%, #000 15%, transparent 70%); -webkit-mask-image: radial-gradient(ellipse at 30% 50%, #000 15%, transparent 70%); pointer-events: none; }
.pp-form { background: #F8FAFC; display: grid; place-items: center; padding: 32px 20px; color: #0F172A; }
.pp-form input { width: 100%; font: inherit; font-size: 15px; padding: 12px 14px; border-radius: 11px; border: 1px solid #CBD5E1; background: #fff; color: #0F172A; }
.pp-form input:focus { outline: 2px solid #10B981; outline-offset: 1px; border-color: #10B981; }
@media (max-width: 1000px) {
  .pp-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .pp-graf, .pp-dos { grid-template-columns: minmax(0,1fr); }
  .pp-fila { grid-template-columns: minmax(0,1fr) auto; }
  .pp-fila .pp-solo-pc { display: none; }
  .pp-cab { display: none; }
}
@media (max-width: 560px) { .pp-quien { display: none; } }
@media (max-width: 820px) {
  .pp-login { grid-template-columns: minmax(0,1fr); }
  .pp-marca { padding: 28px 20px; min-height: 0; }
  .pp-marca .pp-solo-pc { display: none; }
}
@media (prefers-reduced-motion: reduce) { .pp-cajon, .pp-cajon > div { animation: none; } }
`;

export function PortalProveedores() {
  const [yo, setYo] = useState<Yo | null | false>(null);
  useEffect(() => {
    // El portal sigue el tema del sistema (no el que el usuario eligió en el panel).
    const oscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
    document.title = 'Portal Proveedores · DealFlow';
    void api<Yo>('/yo').then((r) => setYo(r.data || false));
  }, []);
  return (
    <div className="pp">
      <style>{CSS}</style>
      {yo === null ? <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--df-text-muted)' }}>Cargando…</div>
        : yo === false ? <Login onEntrar={() => void api<Yo>('/yo').then((r) => setYo(r.data || false))} />
          : <Panel yo={yo} onSalir={() => void api('/logout', { method: 'POST' }).then(() => setYo(false))} />}
    </div>
  );
}

function Login({ onEntrar }: { onEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [elegir, setElegir] = useState<{ id: string; tienda: string }[] | null>(null);
  const entrar = async (cuenta = '') => {
    setEnviando(true); setError('');
    const r = await api<{ ok?: boolean; elegir?: { id: string; tienda: string }[] }>('/login', { method: 'POST', body: { email, password, cuenta } });
    setEnviando(false);
    if (r.error) return setError(r.error);
    if (r.data?.elegir) return setElegir(r.data.elegir);
    onEntrar();
  };
  return (
    <div className="pp-login">
      <div className="pp-marca">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 17 }}>
          <img src={logo} alt="" width={34} height={34} style={{ borderRadius: 9 }} /> DealFlow
        </div>
        <div style={{ position: 'relative', margin: '40px 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A7F3D0', background: 'rgba(16,185,129,.14)', border: '1px solid rgba(110,231,183,.28)', padding: '6px 12px', borderRadius: 999 }}>Acceso para proveedores</div>
          <h1 style={{ fontSize: 'clamp(34px, 4.6vw, 54px)', lineHeight: 1.08, letterSpacing: '-0.03em', margin: '18px 0 14px', color: '#fff', fontWeight: 800 }}>Portal<br />Proveedores</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(232,241,238,.75)', maxWidth: 440, margin: 0 }}>Sigue en tiempo real los pedidos que se hacen con tu convenio: cuántos entran, cuáles van en camino y cuáles se entregaron.</p>
          <ul className="pp-solo-pc" style={{ listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'grid', gap: 12, fontSize: 15, color: 'rgba(232,241,238,.85)' }}>
            {['Estadísticas de tus pedidos por día', 'Datos de cada pedido y lo que se pidió', 'Guía, transportadora y recorrido del envío', 'Novedades de entrega al instante'].map((x) => (
              <li key={x} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(52,211,153,.18)', color: '#6EE7B7', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>✓</span>{x}</li>
            ))}
          </ul>
        </div>
        <div className="pp-solo-pc" style={{ position: 'relative', fontSize: 13, color: 'rgba(232,241,238,.5)' }}>© {new Date().getFullYear()} DealFlow</div>
      </div>
      <div className="pp-form">
        <form onSubmit={(e) => { e.preventDefault(); void entrar(); }} style={{ width: 'min(400px, 100%)', display: 'grid', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Inicia sesión</h2>
            <p style={{ margin: 0, color: '#64748B', fontSize: 14.5 }}>Usa el correo y la contraseña que te dio la tienda.</p>
          </div>
          {elegir ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Eres proveedor de varias tiendas. ¿A cuál quieres entrar?</div>
              {elegir.map((c) => (
                <button key={c.id} type="button" disabled={enviando} onClick={() => void entrar(c.id)} style={{ font: 'inherit', textAlign: 'left', padding: '12px 14px', borderRadius: 11, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#0F172A' }}>{c.tienda} →</button>
              ))}
              <button type="button" onClick={() => setElegir(null)} style={{ font: 'inherit', background: 'none', border: 0, color: '#64748B', cursor: 'pointer', fontSize: 13.5 }}>← Volver</button>
            </div>
          ) : (
            <>
              <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 700 }}>Correo
                <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@empresa.com" />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 700 }}>Contraseña
                <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </label>
              {error && <div role="alert" style={{ color: '#DC2626', fontSize: 13.5, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px' }}>{error}</div>}
              <button type="submit" disabled={enviando} style={{ font: 'inherit', fontWeight: 800, fontSize: 15, padding: '13px 16px', borderRadius: 11, border: 0, background: '#059669', color: '#fff', cursor: 'pointer', boxShadow: '0 10px 24px -12px #059669', opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Entrando…' : 'Entrar al portal'}
              </button>
              <p style={{ margin: 0, fontSize: 12.5, color: '#94A3B8', textAlign: 'center' }}>¿No tienes acceso o lo olvidaste? Pídeselo a la tienda con la que trabajas.</p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

const PERIODOS = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'rango', label: 'Rango' },
];

function Panel({ yo, onSalir }: { yo: Yo; onSalir: () => void }) {
  const [periodo, setPeriodo] = useState('30');
  const [rango, setRango] = useState<{ desde: string; hasta: string }>({ desde: '', hasta: '' });
  const [t, setT] = useState<Tablero | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [etapa, setEtapa] = useState<Etapa | ''>('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const fechas = (): { desde: string; hasta: string } | null => {
    const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    if (periodo === 'rango') return rango.desde && rango.hasta ? rango : null;
    if (periodo === 'mes') return { desde: hoy.slice(0, 8) + '01', hasta: hoy };
    return { desde: masDias(hoy, -(Number(periodo) - 1)), hasta: hoy };
  };
  const cargar = () => {
    const f = fechas();
    if (!f) return;
    void api<Tablero>(`/tablero?desde=${f.desde}&hasta=${f.hasta}`).then((r) => {
      if (r.status === 401) return onSalir();
      if (r.data) { setT(r.data); setError(''); } else setError(r.error || 'No se pudo cargar.');
    });
  };
  useEffect(() => {
    cargar();
    const iv = setInterval(() => { if (!document.hidden) cargar(); }, 120_000);
    return () => clearInterval(iv);
  }, [periodo, rango.desde, rango.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (t?.pedidos || []).filter((p) => (!etapa || p.etapa === etapa) && (!nq || `${p.codigo} ${p.cliente} ${p.tel} ${p.ciudad} ${p.guia} ${p.items.map((i) => i.nombre).join(' ')}`.toLowerCase().includes(nq)));
  }, [t, q, etapa]);

  const descargar = () => {
    const filas = [['Pedido', 'Fecha', 'Cliente', 'Teléfono', 'Ciudad', 'Departamento', 'Dirección', 'Productos', 'Unidades', 'Valor', 'Estado', 'Transportadora', 'Guía', 'Convenio']];
    for (const p of filtrados) filas.push([p.codigo, fechaHora(p.fecha), p.cliente, p.tel, p.ciudad, p.departamento, p.direccion, p.items.map((i) => `${i.qty} x ${i.nombre}`).join(' | '), String(p.unidades), String(p.total), ETAPA[p.etapa].label, p.transportadora, p.guia, p.convenio]);
    const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `pedidos-${t?.desde}-a-${t?.hasta}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const r = t?.resumen;
  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'color-mix(in srgb, var(--df-surface) 88%, transparent)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--df-border)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="" width={30} height={30} style={{ borderRadius: 8 }} />
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Portal Proveedores</div>
            <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pedidos de {yo.tienda}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="pp-quien" style={{ textAlign: 'right', lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{yo.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{yo.convenios.map((c) => c.nombre).join(' · ')}</div>
          </div>
          <button className="pp-btn" onClick={onSalir}>Salir</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 20px 60px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Hola, {yo.nombre.split(' ')[0]} 👋</h1>
            <p style={{ margin: 0, color: 'var(--df-text-muted)', fontSize: 14.5 }}>Estos son los pedidos hechos con tu convenio{t ? ` del ${new Date(t.desde + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} al ${new Date(t.hasta + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {PERIODOS.map((p) => <button key={p.id} className="pp-chip" aria-pressed={periodo === p.id} onClick={() => { setPeriodo(p.id); if (p.id === 'rango' && !rango.desde && t) setRango({ desde: t.desde, hasta: t.hasta }); }}>{p.label}</button>)}
            {periodo === 'rango' && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => setRango((x) => ({ ...x, desde: e.target.value }))} style={inputFecha} />
                a
                <input type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => setRango((x) => ({ ...x, hasta: e.target.value }))} style={inputFecha} />
              </span>
            )}
          </div>
        </div>

        {error && <div style={{ color: 'var(--df-danger)', fontSize: 13.5 }}>{error}</div>}
        {!t && !error && <div style={{ color: 'var(--df-text-muted)', padding: 30, textAlign: 'center' }}>Cargando tus pedidos…</div>}

        {t && r && (
          <>
            <div className="pp-kpis">
              <Kpi titulo="Pedidos" valor={r.pedidos.toLocaleString('es-CO')} sub={`${r.unidades.toLocaleString('es-CO')} unidades`} color="#10B981" />
              <Kpi titulo="Valor de los pedidos" valor={pesosCorto(r.valor)} sub={`${pesosCorto(r.valorEntregado)} entregado`} color="#3B82F6" />
              <Kpi titulo="En camino" valor={String(r.enCamino)} sub={`${r.porDespachar} por despachar`} color="#0EA5E9" />
              <Kpi titulo="Novedades" valor={String(r.novedades)} sub="por resolver" color="#EF4444" />
              <Kpi titulo="Entregados" valor={String(r.entregados)} color="#059669" />
              <Kpi titulo="Devueltos" valor={String(r.devueltos)} color="#B45309" />
              <Kpi titulo="Efectividad" valor={r.efectividad == null ? '—' : `${r.efectividad.toLocaleString('es-CO')}%`} sub="entregados vs. devueltos" color="#8B5CF6" />
              <Kpi titulo="Ticket promedio" valor={r.pedidos ? pesosCorto(r.valor / r.pedidos) : '—'} color="#F59E0B" />
            </div>

            <div className="pp-graf">
              <Caja titulo="Pedidos por día"><LineChart data={t.serie} alto={230} /></Caja>
              <Caja titulo="Estado de los pedidos"><Donut data={t.porEtapa.map((e) => ({ label: e.label, valor: e.valor, color: e.color }))} alto={160} /></Caja>
            </div>
            <div className="pp-dos">
              <Caja titulo="Productos más pedidos (unidades)"><HBars data={t.topProductos} /></Caja>
              <Caja titulo="Ciudades con más pedidos"><HBars data={t.topCiudades} /></Caja>
            </div>

            <section className="pp-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, flex: '1 1 auto' }}>Pedidos <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}>({filtrados.length})</span></h2>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar pedido, cliente, guía, ciudad…" style={{ flex: '1 1 240px', maxWidth: 360, minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 999, padding: '8px 14px', font: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' }} />
                <button className="pp-btn" onClick={descargar} disabled={!filtrados.length}>⬇ Descargar</button>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '0 16px 14px', overflowX: 'auto' }}>
                <button className="pp-chip" aria-pressed={etapa === ''} onClick={() => setEtapa('')}>Todos · {t.pedidos.length}</button>
                {t.porEtapa.filter((e) => e.valor > 0).map((e) => (
                  <button key={e.id} className="pp-chip" aria-pressed={etapa === e.id} onClick={() => setEtapa(etapa === e.id ? '' : e.id)}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: e.color, marginRight: 6 }} />{e.label} · {e.valor}
                  </button>
                ))}
              </div>
              <div className="pp-fila pp-cab"><span>Pedido</span><span>Cliente</span><span>Productos</span><span>Envío</span><span style={{ textAlign: 'right' }}>Valor</span><span>Estado</span></div>
              {!filtrados.length && <div style={{ padding: 30, textAlign: 'center', color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)', fontSize: 14 }}>{t.pedidos.length ? 'Ningún pedido coincide con la búsqueda.' : 'Todavía no hay pedidos con tu convenio en este periodo.'}</div>}
              {filtrados.slice(0, 400).map((p) => (
                <button key={p.id} className="pp-fila" onClick={() => setAbierto(p.id)}>
                  <span>
                    <b style={{ fontSize: 14 }}>{p.codigo}</b>
                    <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{fechaHora(p.fecha)}</div>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cliente}</div>
                    <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{[p.ciudad, p.departamento].filter(Boolean).join(', ')}</div>
                  </span>
                  <span className="pp-solo-pc" style={{ fontSize: 13, color: 'var(--df-text-body)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.items.map((i) => `${i.qty} × ${i.nombre}`).join(', ')}</span>
                  <span className="pp-solo-pc" style={{ fontSize: 12.5, minWidth: 0 }}>
                    {p.guia ? <><div style={{ fontWeight: 600 }}>{p.transportadora || 'Guía'}</div><div style={{ color: 'var(--df-text-muted)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.guia}</div></> : <span style={{ color: 'var(--df-text-faint)' }}>Sin guía aún</span>}
                  </span>
                  <span className="pp-solo-pc" style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{pesos(p.total)}</span>
                  <span><Pill e={p.etapa} /></span>
                </button>
              ))}
              {filtrados.length > 400 && <div style={{ padding: 12, textAlign: 'center', fontSize: 12.5, color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)' }}>Se muestran 400 de {filtrados.length}. Usa la búsqueda o descarga la lista completa.</div>}
            </section>
          </>
        )}
      </main>
      {abierto && <DetallePedido id={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

const inputFecha: CSSProperties = { font: 'inherit', fontSize: 13, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)' };

function Kpi({ titulo, valor, sub, color }: { titulo: string; valor: string; sub?: string; color: string }) {
  return (
    <div className="pp-card" style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3, background: color }} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--df-text-muted)' }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>{sub}</div>}
    </div>
  );
}

function Caja({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="pp-card" style={{ padding: 16, minWidth: 0 }}>
      <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 12px' }}>{titulo}</h2>
      {children}
    </section>
  );
}

function Pill({ e }: { e: Etapa }) {
  const c = ETAPA[e];
  return <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>{c.label}</span>;
}

function Dato({ k, v }: { k: string; v: ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 10, fontSize: 14, padding: '6px 0' }}>
      <span style={{ color: 'var(--df-text-muted)' }}>{k}</span><span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  );
}

function DetallePedido({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Detalle>(`/pedido/${encodeURIComponent(id)}`).then((r) => (r.data ? setD(r.data) : setError(r.error || 'No se pudo cargar.')));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pp-cajon" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }} role="dialog" aria-modal="true" aria-label="Detalle del pedido">
      <div>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{d?.codigo || 'Pedido'}</div>
            {d && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{fechaHora(d.fecha)} · Convenio {d.convenio}</div>}
          </div>
          {d && <Pill e={d.etapa} />}
          <button className="pp-btn" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          {error && <div style={{ color: 'var(--df-danger)' }}>{error}</div>}
          {!d && !error && <div style={{ color: 'var(--df-text-muted)' }}>Cargando…</div>}
          {d && (
            <>
              <Caja titulo="Cliente y entrega">
                <Dato k="Cliente" v={d.cliente} />
                <Dato k="Teléfono" v={d.tel} />
                <Dato k="Dirección" v={d.direccion} />
                <Dato k="Ciudad" v={[d.ciudad, d.departamento].filter(Boolean).join(', ')} />
                <Dato k="Valor a recaudar" v={pesos(d.total)} />
              </Caja>
              <Caja titulo="Productos">
                {d.items.map((i, n) => (
                  <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: n ? '1px solid var(--df-border)' : 0, fontSize: 14 }}>
                    <span style={{ minWidth: 34, height: 26, borderRadius: 8, background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{i.qty}×</span>
                    <span style={{ fontWeight: 600 }}>{i.nombre}</span>
                  </div>
                ))}
              </Caja>
              <Caja titulo="Envío">
                {d.guia ? (
                  <>
                    <Dato k="Transportadora" v={d.transportadora} />
                    <Dato k="Guía" v={<span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{d.guia}</span>} />
                    <Dato k="Estado" v={d.estadoTransportadora || ETAPA[d.etapa].label} />
                    <Dato k="Entrega estimada" v={d.entregaEstimada} />
                    <Dato k="Remisión Effi" v={d.remision} />
                    {d.guiaUrl && <a href={d.guiaUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--df-brand)' }}>Ver la guía ↗</a>}
                  </>
                ) : <div style={{ fontSize: 14, color: 'var(--df-text-muted)' }}>{d.etapa === 'cancelado' ? 'Este pedido se canceló.' : 'Aún no tiene guía. Aparece aquí en cuanto se despache.'}</div>}
              </Caja>
              {d.novedades.length > 0 && (
                <Caja titulo="Novedades de entrega">
                  {d.novedades.map((n, k) => (
                    <div key={k} style={{ padding: '10px 12px', borderRadius: 12, background: n.abierta ? 'rgba(239,68,68,.08)' : 'var(--df-surface-2)', border: `1px solid ${n.abierta ? 'rgba(239,68,68,.3)' : 'var(--df-border)'}`, marginTop: k ? 8 : 0, fontSize: 13.5 }}>
                      <div style={{ fontWeight: 700 }}>{n.motivo || 'Novedad'} {n.abierta ? <span style={{ color: '#DC2626' }}>· abierta</span> : <span style={{ color: 'var(--df-text-muted)' }}>· resuelta</span>}</div>
                      {n.detalle && <div style={{ color: 'var(--df-text-body)', marginTop: 2 }}>{n.detalle}</div>}
                      {n.gestion && <div style={{ color: 'var(--df-text-muted)', marginTop: 4 }}>Solución: {n.gestion}</div>}
                      {n.fecha && <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginTop: 4 }}>{fechaLocal(n.fecha)}</div>}
                    </div>
                  ))}
                </Caja>
              )}
              <Caja titulo="Recorrido del envío">
                {d.recorrido.length ? <Linea items={d.recorrido.map((h) => ({ titulo: h.estado, detalle: h.observacion, fecha: fechaLocal(h.fecha), foto: h.foto }))} /> : <div style={{ fontSize: 14, color: 'var(--df-text-muted)' }}>La transportadora todavía no reporta movimientos.</div>}
              </Caja>
              {d.traza.length > 0 && (
                <Caja titulo="Trazabilidad del pedido">
                  <Linea items={[...d.traza].reverse().map((e) => ({ titulo: e.titulo, fecha: fechaHora(e.fecha) }))} />
                </Caja>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Linea({ items }: { items: { titulo: string; detalle?: string; fecha: string; foto?: string }[] }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((x, i) => (
        <li key={i} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 10, position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 14 }}>
          {i < items.length - 1 && <span style={{ position: 'absolute', left: 8, top: 16, bottom: 0, width: 2, background: 'var(--df-border)' }} />}
          <span style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 4, marginLeft: 3, background: i === 0 ? 'var(--df-brand)' : 'var(--df-border-strong)', boxShadow: i === 0 ? '0 0 0 4px color-mix(in srgb, var(--df-brand) 20%, transparent)' : 'none' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: i === 0 ? 800 : 600, fontSize: 14 }}>{x.titulo}</div>
            {x.detalle && <div style={{ fontSize: 13, color: 'var(--df-text-body)' }}>{x.detalle}</div>}
            <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>{x.fecha}</div>
            {x.foto && <a href={x.foto} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-brand)' }}>Ver foto de la entrega ↗</a>}
          </div>
        </li>
      ))}
    </ol>
  );
}
