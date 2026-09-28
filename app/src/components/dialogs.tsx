import { useEffect, useState, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Sistema global de avisos y diálogos DENTRO de la web (pop-ups), para no usar los
 * cuadros nativos del navegador (window.confirm / alert / prompt), que se ven feos
 * y dicen "app.dealflow.sbs dice…". Se usa desde cualquier parte:
 *   notificar('Guardado ✓')                        → pop-up flotante que se va solo
 *   if (await confirmar({ mensaje: '¿Seguro?' }))  → modal Aceptar/Cancelar
 *   const nombre = await pedirTexto({ titulo: '…' })→ modal con un campo de texto
 * y el <DialogHost/> (montado una vez en la app) los pinta.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────
type ToastTipo = 'ok' | 'error' | 'info';
export interface Toast { id: number; texto: string; tipo: ToastTipo }
interface ConfirmOpts { titulo?: string; mensaje: string; aceptar?: string; cancelar?: string; peligro?: boolean }
interface PromptOpts { titulo?: string; mensaje?: string; placeholder?: string; valor?: string; aceptar?: string; cancelar?: string; multilinea?: boolean }
type Modal =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void };

// ── Store mínimo (patrón suscripción) ──────────────────────────────────────────
let toasts: Toast[] = [];
let modal: Modal | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
let seq = 1;

export function notificar(texto: string, tipo: ToastTipo = 'ok', ms = 3600): void {
  const id = seq++;
  toasts = [...toasts, { id, texto, tipo }];
  avisar();
  if (ms > 0) setTimeout(() => cerrarToast(id), ms);
}
function cerrarToast(id: number) { toasts = toasts.filter((t) => t.id !== id); avisar(); }

export function confirmar(opts: ConfirmOpts | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { mensaje: opts } : opts;
  return new Promise((resolve) => {
    modal = { kind: 'confirm', opts: o, resolve: (v) => { modal = null; avisar(); resolve(v); } };
    avisar();
  });
}

export function pedirTexto(opts: PromptOpts | string): Promise<string | null> {
  const o = typeof opts === 'string' ? { titulo: opts } : opts;
  return new Promise((resolve) => {
    modal = { kind: 'prompt', opts: o, resolve: (v) => { modal = null; avisar(); resolve(v); } };
    avisar();
  });
}

// ── Host visual (se monta una sola vez) ────────────────────────────────────────
export function DialogHost() {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = () => forzar((n) => n + 1);
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, []);
  return (
    <>
      <ToastStack toasts={toasts} onClose={cerrarToast} />
      {modal && <ModalHost modal={modal} />}
    </>
  );
}

const COLOR: Record<ToastTipo, { barra: string; icono: string }> = {
  ok: { barra: 'var(--df-brand)', icono: '✓' },
  error: { barra: 'var(--df-danger)', icono: '!' },
  info: { barra: 'var(--df-purple)', icono: 'i' },
};

function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: '50%', transform: 'translateX(-50%)', zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 10, width: 'min(380px, calc(100vw - 24px))', pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const c = COLOR[t.tipo];
        return (
          <div key={t.id} role="status" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderLeft: `4px solid ${c.barra}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,.22)', padding: '12px 14px', animation: 'dfPopIn .22s cubic-bezier(.2,.9,.3,1.2) both' }}>
            <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: c.barra, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, marginTop: 1 }}>{c.icono}</span>
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, color: 'var(--df-text-body)', fontWeight: 600 }}>{t.texto}</div>
            <span onClick={() => onClose(t.id)} className="df-close-hover" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 }}>✕</span>
          </div>
        );
      })}
    </div>
  );
}

function ModalHost({ modal }: { modal: Modal }) {
  const [texto, setTexto] = useState(modal.kind === 'prompt' ? (modal.opts.valor || '') : '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t); }, []);
  // Escape cancela; Enter confirma (en prompt de una línea).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelar();
      if (e.key === 'Enter' && modal.kind === 'confirm') aceptar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, texto]);

  const cancelar = () => { modal.kind === 'prompt' ? modal.resolve(null) : modal.resolve(false); };
  const aceptar = () => {
    if (modal.kind === 'prompt') { const v = texto.trim(); if (!v) return; modal.resolve(v); }
    else modal.resolve(true);
  };
  const o = modal.opts;
  const peligro = modal.kind === 'confirm' && modal.opts.peligro;
  const btnBase: CSSProperties = { borderRadius: 9, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', border: '1px solid var(--df-border)' };
  return (
    <div onClick={cancelar} style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', padding: 20, animation: 'dfFadeIn .15s ease both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.4)', padding: '22px 22px 18px', animation: 'dfPopIn .2s cubic-bezier(.2,.9,.3,1.2) both' }}>
        {o.titulo && <div style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: '-0.01em', marginBottom: 8, color: 'var(--df-text)' }}>{o.titulo}</div>}
        {'mensaje' in o && o.mensaje && <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--df-text-body)', marginBottom: modal.kind === 'prompt' ? 12 : 20 }}>{o.mensaje}</div>}
        {modal.kind === 'prompt' && (
          modal.opts.multilinea
            ? <textarea ref={(el) => { inputRef.current = el; }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={modal.opts.placeholder || ''} rows={3} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, marginBottom: 18, resize: 'vertical' }} />
            : <input ref={(el) => { inputRef.current = el; }} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aceptar(); }} placeholder={modal.opts.placeholder || ''} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, marginBottom: 18 }} />
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={cancelar} style={{ ...btnBase, background: 'var(--df-surface)', color: 'var(--df-text-body)' }}>{o.cancelar || 'Cancelar'}</button>
          <button onClick={aceptar} style={{ ...btnBase, background: peligro ? 'var(--df-danger)' : 'var(--df-brand)', color: '#fff', border: 'none' }}>{o.aceptar || (modal.kind === 'prompt' ? 'Aceptar' : 'Aceptar')}</button>
        </div>
      </div>
    </div>
  );
}
