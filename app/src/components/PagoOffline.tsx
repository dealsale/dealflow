import { useEffect, useState } from 'react';

/*
 * Aviso de "pago offline": cuando los pagos en línea (Wompi) están apagados y alguien
 * intenta pagar, el servidor responde { offline, error, whatsapp } y aquí se abre un
 * pop-up con el botón para escribirle a DealFlow por WhatsApp y hacer el pago.
 */
interface Aviso { mensaje: string; whatsapp: string }
let actual: Aviso | null = null;
const oyentes = new Set<() => void>();

export function avisarPagoOffline(a: Aviso): void { actual = a; oyentes.forEach((f) => f()); }

export function PagoOffline() {
  const [a, setA] = useState<Aviso | null>(actual);
  useEffect(() => { const f = () => setA(actual); oyentes.add(f); return () => { oyentes.delete(f); }; }, []);
  useEffect(() => {
    if (!a) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [a]);
  if (!a) return null;
  function cerrar() { actual = null; setA(null); }
  return (
    <div onClick={cerrar} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(2,6,23,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Pago offline" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(420px, 100%)', background: 'var(--df-surface, #fff)', color: 'var(--df-text, #0F172A)', borderRadius: 18, padding: 24, boxShadow: '0 30px 70px -20px rgba(2,6,23,.6)', textAlign: 'center' }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>💬</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>Pago offline</div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--df-text-muted, #475569)', margin: '8px 0 18px' }}>{a.mensaje}</p>
        {a.whatsapp ? (
          <a href={a.whatsapp} target="_blank" rel="noreferrer" onClick={cerrar}
            style={{ display: 'block', background: '#25D366', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 15, padding: '13px 16px', borderRadius: 12 }}>
            Escribir por WhatsApp
          </a>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--df-text-muted, #475569)' }}>Escríbele al equipo de DealFlow para hacer tu pago.</div>
        )}
        <button type="button" onClick={cerrar} style={{ marginTop: 10, background: 'none', border: 0, color: 'var(--df-text-muted, #64748B)', font: 'inherit', fontSize: 13, cursor: 'pointer', padding: 8 }}>Cerrar</button>
      </div>
    </div>
  );
}
