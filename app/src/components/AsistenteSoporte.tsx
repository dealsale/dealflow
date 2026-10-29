import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { apiSoporteChat, apiSoporteConfig } from '../lib/api';

/*
 * Asistente de soporte flotante SKY (web chat): botón abajo a la derecha que abre un chat con
 * el agente de DealFlow (dudas de la plataforma, Meta, anuncios, marketing). Se oculta con
 * el botón del propio chat y se vuelve a mostrar desde el menú del perfil. La conversación
 * se recuerda en este navegador.
 */

// ── Mostrar / ocultar (compartido con el menú del perfil) ───────────────────
const CLAVE_VISIBLE = 'df:soporte:visible';
const oyentes = new Set<() => void>();
const leerVisible = () => { try { return localStorage.getItem(CLAVE_VISIBLE) !== '0'; } catch { return true; } };
let visible = leerVisible();
export function setAsistenteVisible(v: boolean): void {
  visible = v;
  try { localStorage.setItem(CLAVE_VISIBLE, v ? '1' : '0'); } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f());
}
export function useAsistenteVisible(): boolean {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => visible, () => true);
}

// ¿Está configurado el agente? (se pregunta una vez por sesión)
let cfgCache: Promise<{ listo: boolean; nombre: string; bienvenida: string } | null> | null = null;
export function useSoporteConfig() {
  const [cfg, setCfg] = useState<{ listo: boolean; nombre: string; bienvenida: string } | null>(null);
  useEffect(() => {
    cfgCache ||= apiSoporteConfig().then((r) => r.data || null);
    let vivo = true;
    void cfgCache.then((c) => { if (vivo) setCfg(c); });
    return () => { vivo = false; };
  }, []);
  return cfg;
}

interface Msg { de: 'yo' | 'asistente' | 'error'; texto: string; t: number }

const SUGERENCIAS = [
  '¿Cómo conecto el Píxel de Meta a mi tienda?',
  '¿Cómo creo una campaña de ventas en Meta?',
  '¿Cómo despacho un pedido con Effi?',
  'Dame ideas para vender más por WhatsApp',
];

// Texto simple con **negrita**, enlaces y saltos de línea (sin HTML).
function Texto({ t }: { t: string }) {
  const partes: ReactNode[] = [];
  t.split('\n').forEach((linea, i) => {
    if (i) partes.push(<br key={`br${i}`} />);
    linea.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).forEach((p, k) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) partes.push(<b key={`${i}-${k}`}>{p.slice(2, -2)}</b>);
      else if (/^https?:\/\//.test(p)) partes.push(<a key={`${i}-${k}`} href={p} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{p}</a>);
      else if (p) partes.push(p);
    });
  });
  return <>{partes}</>;
}

/** `oculto`: hay un panel abierto encima (detalle del pedido, chat en el celular): el botón no lo tapa. */
export function AsistenteSoporte({ usuario, seccion, mobile, oculto }: { usuario: string; seccion: string; mobile?: boolean; oculto?: boolean }) {
  const cfg = useSoporteConfig();
  const mostrar = useAsistenteVisible();
  const clave = `df:soporte:chat:${usuario}`;
  const [abierto, setAbierto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(clave) || '{}').msgs || []; } catch { return []; } });
  const [conv, setConv] = useState<string>(() => { try { return JSON.parse(localStorage.getItem(clave) || '{}').conv || ''; } catch { return ''; } });
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { localStorage.setItem(clave, JSON.stringify({ msgs: msgs.slice(-60), conv })); } catch { /* sin almacenamiento */ } }, [msgs, conv, clave]);
  useEffect(() => { if (abierto) { fin.current?.scrollIntoView({ block: 'end' }); entrada.current?.focus(); } }, [abierto, msgs.length, pensando]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto]);

  if (!cfg?.listo || !mostrar) return null;

  const enviar = async (t = texto) => {
    const m = t.trim();
    if (!m || pensando) return;
    setTexto('');
    setMsgs((x) => [...x, { de: 'yo', texto: m, t: Date.now() }]);
    setPensando(true);
    const r = await apiSoporteChat(m, conv, seccion);
    setPensando(false);
    if (r.data) { setConv(r.data.conversacion || conv); setMsgs((x) => [...x, { de: 'asistente', texto: r.data!.respuesta, t: Date.now() }]); }
    else setMsgs((x) => [...x, { de: 'error', texto: r.error || 'No se pudo enviar. Intenta de nuevo.', t: Date.now() }]);
  };
  const nueva = () => { setMsgs([]); setConv(''); };

  const abajo = mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 84px)' : '20px';
  return (
    <>
      <style>{`
        @keyframes dfSopEntra { from { opacity: 0; transform: translateY(12px) scale(.97) } }
        @keyframes dfSopPunto { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
        @keyframes dfSopFlota { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        .df-sop-boton { animation: dfSopFlota 3.2s ease-in-out infinite; transition: scale .15s }
        .df-sop-boton:hover { scale: 1.06 }
        .df-sop-punto { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; animation: dfSopPunto 1.2s infinite }
        @media (prefers-reduced-motion: reduce) { .df-sop-panel, .df-sop-punto, .df-sop-boton { animation: none !important } }
      `}</style>
      {!abierto && !oculto && (
        <button type="button" onClick={() => setAbierto(true)} aria-label={`Abrir ${cfg.nombre}`} title={cfg.nombre}
          className="df-sop-boton" style={{ position: 'fixed', right: mobile ? 12 : 20, bottom: abajo, zIndex: 46, width: mobile ? 62 : 70, height: mobile ? 62 : 70, padding: 0, borderRadius: '50%', border: 0, cursor: 'pointer', background: 'transparent', filter: 'drop-shadow(0 12px 18px rgba(37,99,235,.45))' }}>
          <img src="/sky.webp" alt="" width={70} height={70} style={{ width: '100%', height: '100%', display: 'block' }} />
        </button>
      )}
      {abierto && (
        <div className="df-sop-panel" role="dialog" aria-label={cfg.nombre}
          style={{ position: 'fixed', right: mobile ? 8 : 22, left: mobile ? 8 : 'auto', bottom: abajo, zIndex: 46, width: mobile ? 'auto' : 390, height: mobile ? 'min(72vh, 560px)' : 'min(620px, calc(100vh - 110px))', display: 'flex', flexDirection: 'column', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 18, boxShadow: '0 30px 70px -24px rgba(2,6,23,.55)', overflow: 'hidden', animation: 'dfSopEntra .22s cubic-bezier(.2,.8,.2,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', color: '#fff', background: 'linear-gradient(135deg, #047857, #1D4ED8)' }}>
            <img src="/sky.webp" alt="" width={40} height={40} style={{ flexShrink: 0, margin: '-4px 0' }} />
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{cfg.nombre}</div>
              <div style={{ fontSize: 11.5, opacity: 0.8 }}>Soporte, Meta y marketing</div>
            </div>
            {msgs.length > 0 && <button type="button" onClick={nueva} title="Nueva conversación" style={botonCab}>↺</button>}
            <button type="button" onClick={() => { setAbierto(false); setAsistenteVisible(false); }} title="Ocultar el asistente (lo vuelves a mostrar desde tu perfil)" style={{ ...botonCab, fontSize: 11.5, width: 'auto', padding: '0 8px' }}>Ocultar</button>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" style={botonCab}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--df-bg)' }}>
            <Burbuja de="asistente"><Texto t={cfg.bienvenida} /></Burbuja>
            {!msgs.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {SUGERENCIAS.map((s) => (
                  <button key={s} type="button" onClick={() => void enviar(s)} style={{ textAlign: 'left', font: 'inherit', fontSize: 13, padding: '8px 11px', borderRadius: 11, border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => <Burbuja key={i} de={m.de}><Texto t={m.texto} /></Burbuja>)}
            {pensando && <Burbuja de="asistente"><span style={{ display: 'inline-flex', gap: 4, color: 'var(--df-text-muted)' }}><i className="df-sop-punto" /><i className="df-sop-punto" style={{ animationDelay: '.15s' }} /><i className="df-sop-punto" style={{ animationDelay: '.3s' }} /></span></Burbuja>}
            <div ref={fin} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--df-border)', background: 'var(--df-surface)' }}>
            <textarea ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              style={{ flex: 1, resize: 'none', font: 'inherit', fontSize: 14, maxHeight: 110, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--df-border)', background: 'var(--df-bg)', color: 'var(--df-text)' }} />
            <button type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar"
              style={{ width: 42, borderRadius: 12, border: 0, background: 'var(--df-brand)', color: '#fff', fontSize: 17, cursor: 'pointer', opacity: !texto.trim() || pensando ? 0.5 : 1 }}>➤</button>
          </form>
        </div>
      )}
    </>
  );
}

const botonCab = { width: 30, height: 30, borderRadius: 9, border: 0, background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: 14 } as const;

function Burbuja({ de, children }: { de: Msg['de']; children: ReactNode }) {
  const yo = de === 'yo';
  return (
    <div style={{ alignSelf: yo ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '9px 12px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, overflowWrap: 'anywhere',
      background: yo ? 'var(--df-brand)' : de === 'error' ? 'var(--df-danger-subtle, #FEF2F2)' : 'var(--df-surface)',
      color: yo ? '#fff' : de === 'error' ? 'var(--df-danger-dark, #B91C1C)' : 'var(--df-text-body)',
      border: yo ? 0 : '1px solid var(--df-border)', borderBottomRightRadius: yo ? 4 : 14, borderBottomLeftRadius: yo ? 14 : 4 }}>
      {children}
    </div>
  );
}
