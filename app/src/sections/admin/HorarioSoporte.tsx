import { useEffect, useState } from 'react';
import { apiAdminSoporteConfig, apiAdminSoportePausa, type CfgLlamadas, type FranjaSoporte, type ServicioLlamadas } from '../../lib/api';
import { notificar } from '../../components/dialogs';

/**
 * Horario del soporte por llamada: cada día con sus propias franjas (los huecos entre
 * franjas son descansos), días sin atención (festivos, vacaciones) y la pausa rápida
 * que usa el equipo cuando se levanta un momento. Todo en hora Colombia.
 */
const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const pad = (n: number) => String(n).padStart(2, '0');
const aHHMM = (m: number) => (m >= 1440 ? '23:59' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
const deHHMM = (v: string, esFin: boolean) => {
  const [h, mm] = v.split(':').map(Number);
  if (!Number.isFinite(h)) return NaN;
  const t = h * 60 + (mm || 0);
  return esFin && t >= 1439 ? 1440 : t;
};
const COPIAS: Record<string, { t: string; dias: number[] }> = {
  lv: { t: 'Lunes a viernes', dias: [1, 2, 3, 4, 5] },
  ls: { t: 'Lunes a sábado', dias: [1, 2, 3, 4, 5, 6] },
  todos: { t: 'Todos los días', dias: [0, 1, 2, 3, 4, 5, 6] },
};

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btnS: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', background: 'var(--df-surface)', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const campo: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '5px 7px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-bg)', color: 'var(--df-text)', fontVariantNumeric: 'tabular-nums' };

type Cambio = (cfg: CfgLlamadas, servicio: ServicioLlamadas) => void;

/** Errores de un día: franjas al revés o que se cruzan. */
function erroresDia(fr: FranjaSoporte[]): string {
  if (fr.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b))) return 'Completa las horas.';
  if (fr.some(([a, b]) => b <= a)) return 'Cada franja tiene que terminar después de empezar.';
  const o = [...fr].sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < o.length; i++) if (o[i][0] < o[i - 1][1]) return 'Hay franjas que se cruzan.';
  return '';
}

export function HorarioSoporte({ cfg, servicio, onCambio }: { cfg: CfgLlamadas; servicio: ServicioLlamadas | null; onCambio: Cambio }) {
  const [semana, setSemana] = useState<FranjaSoporte[][]>(() => cfg.semana.map((d) => d.map((f) => [f[0], f[1]] as FranjaSoporte)));
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState('');
  useEffect(() => { if (!sucio) setSemana(cfg.semana.map((d) => d.map((f) => [f[0], f[1]] as FranjaSoporte))); }, [cfg.semana, sucio]);

  const editar = (d: number, fn: (fr: FranjaSoporte[]) => FranjaSoporte[]) => {
    setSemana((s) => s.map((fr, i) => (i === d ? fn(fr.map((f) => [f[0], f[1]] as FranjaSoporte)) : fr)));
    setSucio(true);
  };
  const agregar = (d: number) => editar(d, (fr) => {
    const ult = fr[fr.length - 1];
    if (!ult) return [[480, 1080]];
    const ini = Math.min(1380, ult[1] + 60);
    return ult[1] >= 1440 ? fr : [...fr, [ini, Math.min(1440, ini + 180)]];
  });
  const copiar = (d: number, clave: string) => {
    const destino = COPIAS[clave]?.dias || [];
    setSemana((s) => s.map((fr, i) => (destino.includes(i) ? s[d].map((f) => [f[0], f[1]] as FranjaSoporte) : fr)));
    setSucio(true);
  };
  const errores = semana.map(erroresDia);
  const hayError = errores.some(Boolean);

  const guardar = async (p: Parameters<typeof apiAdminSoporteConfig>[0]) => {
    const r = await apiAdminSoporteConfig(p);
    if (r.error || !r.data) { notificar(r.error || 'No se pudo guardar.', 'error'); return false; }
    onCambio(r.data.cfg, r.data.servicio);
    return true;
  };
  const guardarSemana = async () => {
    setGuardando(true);
    const ok = await guardar({ semana });
    setGuardando(false);
    if (ok) { setSucio(false); notificar('Horario guardado.', 'ok'); }
  };
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const fechaBonita = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🕐 Horario de atención</div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 12 }}>Cada día puede tener varias franjas (hora Colombia). El tiempo entre una franja y otra es descanso: ahí el botón aparece como no disponible y la tienda ve a qué hora vuelven.</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={cfg.activo} onChange={(e) => void guardar({ activo: e.target.checked })} /> Mostrar el botón «Llamar a soporte» a las tiendas
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden' }}>
        {ORDEN.map((d, k) => {
          const fr = semana[d];
          return (
            <div key={d} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '10px 12px', borderTop: k ? '1px solid var(--df-border)' : 0, background: fr.length ? 'transparent' : 'var(--df-bg)' }}>
              <div style={{ width: 92, fontWeight: 800, fontSize: 13, color: fr.length ? 'var(--df-text-strong)' : 'var(--df-text-muted)' }}>{NOMBRES[d]}</div>
              <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {!fr.length && <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Sin atención</span>}
                {fr.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--df-border)', borderRadius: 9, padding: '3px 4px 3px 6px', background: 'var(--df-surface)' }}>
                    <input type="time" step={900} aria-label={`${NOMBRES[d]}, franja ${i + 1}, desde`} value={aHHMM(f[0])} onChange={(e) => editar(d, (x) => { x[i][0] = deHHMM(e.target.value, false); return x; })} style={campo} />
                    <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>a</span>
                    <input type="time" step={900} aria-label={`${NOMBRES[d]}, franja ${i + 1}, hasta`} value={aHHMM(f[1])} onChange={(e) => editar(d, (x) => { x[i][1] = deHHMM(e.target.value, true); return x; })} style={campo} />
                    <button type="button" onClick={() => editar(d, (x) => x.filter((_, j) => j !== i))} aria-label="Quitar franja" title="Quitar franja" style={{ ...btnS, border: 0, padding: '4px 7px', color: 'var(--df-text-muted)' }}>✕</button>
                  </span>
                ))}
                <button type="button" onClick={() => agregar(d)} style={{ ...btnS, borderStyle: 'dashed' }}>+ Franja</button>
              </div>
              {fr.length > 0 && (
                <select value="" onChange={(e) => { if (e.target.value) copiar(d, e.target.value); }} aria-label={`Copiar el horario del ${NOMBRES[d].toLowerCase()}`} style={{ ...btnS, padding: '6px 8px', fontWeight: 600 }}>
                  <option value="">Copiar a…</option>
                  {Object.entries(COPIAS).map(([v, c]) => <option key={v} value={v}>{c.t}</option>)}
                </select>
              )}
              {errores[d] && <div style={{ flexBasis: '100%', fontSize: 12, fontWeight: 700, color: 'var(--df-danger-dark, #B91C1C)' }}>{errores[d]}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" disabled={!sucio || hayError || guardando} onClick={() => void guardarSemana()}
          style={{ border: 0, borderRadius: 9, padding: '9px 16px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: !sucio || hayError || guardando ? 0.5 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
        {sucio && <button type="button" onClick={() => setSucio(false)} style={btnS}>Descartar cambios</button>}
        {sucio && !hayError && <span style={{ fontSize: 12, color: 'var(--df-warning, #B45309)', fontWeight: 700 }}>Tienes cambios sin guardar.</span>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--df-border)' }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 4 }}>📅 Días sin atención</div>
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>Festivos, vacaciones o un día que no van a atender. Ese día el botón aparece como no disponible aunque el horario diga otra cosa.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {cfg.cerrados.map((f) => (
            <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '4px 4px 4px 11px', fontSize: 12.5, fontWeight: 700, background: 'var(--df-bg)', border: '1px solid var(--df-border)' }}>
              {fechaBonita(f)}
              <button type="button" aria-label={`Quitar ${fechaBonita(f)}`} onClick={() => void guardar({ cerrados: cfg.cerrados.filter((x) => x !== f) })} style={{ ...btnS, border: 0, padding: '2px 7px', borderRadius: 999, background: 'transparent', color: 'var(--df-text-muted)' }}>✕</button>
            </span>
          ))}
          <input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha sin atención" style={campo} />
          <button type="button" disabled={!fecha} onClick={() => { void guardar({ cerrados: [...cfg.cerrados, fecha] }).then((ok) => ok && setFecha('')); }} style={{ ...btnS, opacity: fecha ? 1 : 0.5 }}>Agregar</button>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--df-border)' }}>
        <input defaultValue={cfg.aviso} onBlur={(e) => { if (e.target.value !== cfg.aviso) void guardar({ aviso: e.target.value }); }} maxLength={300} placeholder="Aviso opcional fuera de horario (ej. «Escríbenos por WhatsApp al …»)"
          aria-label="Aviso fuera de horario" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
        {servicio && (
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Las tiendas ven: «Soporte por llamada: {servicio.horario}».<br />
            {servicio.abierto ? `🟢 Ahora está disponible.${servicio.hasta ? ` ${servicio.hasta}` : ''}` : `⚪ Ahora no está disponible.${servicio.siguiente ? ` ${servicio.siguiente}` : ''}`}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pausa rápida para un descanso que no está en el horario. La puede usar todo el equipo de soporte. */
export function PausaSoporte({ servicio, onCambio }: { servicio: ServicioLlamadas | null; onCambio: Cambio }) {
  const [ocupado, setOcupado] = useState(false);
  if (!servicio?.activo) return null;
  const pausar = async (p: { minutos?: number; restoDelDia?: boolean }) => {
    setOcupado(true);
    const r = await apiAdminSoportePausa(p);
    setOcupado(false);
    if (r.error || !r.data) { notificar(r.error || 'No se pudo.', 'error'); return; }
    onCambio(r.data.cfg, r.data.servicio);
  };
  if (servicio.pausa) {
    return (
      <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--df-warning-subtle-2, #FFFBEB)', borderColor: 'var(--df-warning-border, #FDE68A)' }}>
        <span style={{ fontSize: 13, flex: '1 1 260px', minWidth: 0, lineHeight: 1.45 }}>
          <b>⏸ Soporte {servicio.pausa.charAt(0).toLowerCase() + servicio.pausa.slice(1)}</b><br />
          <span style={{ color: 'var(--df-text-muted)' }}>Las tiendas ven el botón como no disponible{servicio.siguiente ? ` y el aviso «${servicio.siguiente}»` : ''}</span>
        </span>
        <button type="button" disabled={ocupado} onClick={() => void pausar({ minutos: 0 })} style={{ ...btnS, background: '#047857', color: '#fff', borderColor: '#047857' }}>Reanudar ahora</button>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 700, flex: '1 1 200px', minWidth: 0 }}>☕ ¿Un descanso fuera del horario? Pausa el soporte:</span>
      {[[15, '15 min'], [30, '30 min'], [60, '1 hora'], [120, '2 horas']].map(([m, t]) => (
        <button key={m} type="button" disabled={ocupado} onClick={() => void pausar({ minutos: Number(m) })} style={btnS}>{t}</button>
      ))}
      <button type="button" disabled={ocupado} onClick={() => void pausar({ restoDelDia: true })} style={btnS}>Resto del día</button>
    </div>
  );
}
