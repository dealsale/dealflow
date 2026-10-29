import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiCodigoLanding, apiExportarCodigoLanding, apiGuardarCodigoLanding, apiVistaCodigoLanding, type CodigoLanding } from '../lib/api';
import { confirmar, notificar } from './dialogs';

const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff', fontWeight: 700 };

/**
 * Modo código: la tienda reemplaza el diseño del editor por su propio HTML (hecho a mano
 * o con Claude, Astra…) para la página del producto y la de gracias. Los pedidos siguen
 * entrando a DealFlow con <form data-dealflow="pedido">. `onVista` pone en la vista previa
 * lo que se está editando (o null para volver a la del editor).
 */
export function LandingCodigo({ id, onVista, onModo }: { id: string; onVista: (html: string | null) => void; onModo?: (on: boolean) => void }) {
  const [c, setC] = useState<CodigoLanding | null>(null);
  const [pag, setPag] = useState<'landing' | 'gracias'>('landing');
  const [texto, setTexto] = useState<{ landing: string; gracias: string }>({ landing: '', gracias: '' });
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [verInstr, setVerInstr] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const cambiado = !!c && (texto.landing !== c.codigo || texto.gracias !== c.gracias);

  useEffect(() => { void apiCodigoLanding(id).then((r) => { if (r.data) { setC(r.data); setTexto({ landing: r.data.codigo, gracias: r.data.gracias }); } }); }, [id]);
  // Vista previa del código que se está editando (0,7 s después de escribir).
  useEffect(() => {
    if (!c) return;
    const actual = texto[pag];
    if (!c.modo && !actual.trim()) { onVista(null); setAvisos([]); return; }
    const t = setTimeout(() => void apiVistaCodigoLanding(id, actual, pag).then((r) => { if (r.data) { onVista(r.data.html); setAvisos(r.data.avisos); } }), 700);
    return () => clearTimeout(t);
  }, [texto, pag, c?.modo, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onVista(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Cargando…</div>;

  const guardar = async (extra?: { modo?: boolean }) => {
    setGuardando(true);
    const r = await apiGuardarCodigoLanding(id, { codigo: texto.landing, gracias: texto.gracias, ...extra });
    setGuardando(false);
    if (r.error || !r.data) { notificar(r.error || 'No se pudo guardar.', 'error'); return false; }
    setC(r.data); setAvisos(r.data.avisos);
    return true;
  };
  const activar = async (on: boolean) => {
    if (on && !texto.landing.trim()) return notificar('Primero pega o sube el código de la página (o descarga el diseño actual para empezar).', 'error');
    if (!on && !(await confirmar({ titulo: 'Volver al diseño del editor', mensaje: 'La página vuelve a mostrarse con el diseño del editor. Tu código queda guardado por si quieres volver a usarlo.', aceptar: 'Volver al editor' }))) return;
    if (!(await guardar({ modo: on }))) return;
    onModo?.(on);
    notificar(on ? '✓ Modo código activo: la página publicada usa tu código.' : '✓ La página vuelve a usar el diseño del editor.');
  };
  const descargar = async () => {
    const r = await apiExportarCodigoLanding(id, pag);
    if (!r.data) return notificar(r.error || 'No se pudo descargar.', 'error');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.data.html], { type: 'text/html' }));
    a.download = r.data.nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const subir = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_500_000) return notificar('El archivo pesa más de 1,5 MB. Deja las imágenes por URL en vez de pegarlas dentro del HTML.', 'error');
    void f.text().then((t) => { setTexto((x) => ({ ...x, [pag]: t })); notificar(`✓ ${f.name} cargado. Revisa la vista previa y dale Guardar.`); });
  };
  const copiarInstr = () => { void navigator.clipboard?.writeText(c.instrucciones || '').then(() => notificar('✓ Instrucciones copiadas: pégalas en Claude o Astra junto con el código.')); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>
        Usa tu propio HTML (hecho a mano o con una IA como Claude o Astra) en vez del diseño del editor. Los pedidos siguen llegando a DealFlow con la confirmación por WhatsApp, el despacho y el píxel, siempre que el formulario tenga <code>data-dealflow="pedido"</code>.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: c.modo ? 'var(--df-brand-subtle)' : 'var(--df-bg)', border: `1px solid ${c.modo ? 'var(--df-brand-border)' : 'var(--df-border)'}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: c.modo ? 'var(--df-brand-dark)' : 'var(--df-text-body)' }}>{c.modo ? '✓ La página publicada usa tu código' : 'La página usa el diseño del editor'}</span>
        {c.modo ? <button onClick={() => void activar(false)} style={btn}>Volver al editor</button> : <button onClick={() => void activar(true)} disabled={guardando} style={btnPri}>Usar mi código</button>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['landing', 'gracias'] as const).map((p) => (
          <button key={p} onClick={() => setPag(p)} style={{ ...btn, flex: 1, ...(pag === p ? { borderColor: 'var(--df-purple)', color: 'var(--df-purple)' } : {}) }}>{p === 'landing' ? '🛍️ Página del producto' : '🎉 Página de gracias'}</button>
        ))}
      </div>
      {pag === 'gracias' && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Opcional. Si la subes, después de comprar el cliente pasa a esta página (para un upsell, un video o tu mensaje). Si no, ve el mensaje de gracias en el mismo formulario.</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => void descargar()} style={btn}>⬇ Descargar {texto[pag].trim() ? 'mi código' : pag === 'landing' ? 'el diseño actual' : 'la de gracias'}</button>
        <button onClick={() => archivo.current?.click()} style={btn}>⬆ Subir .html</button>
        <input ref={archivo} type="file" accept=".html,.htm,text/html" style={{ display: 'none' }} onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
        <button onClick={() => setVerInstr((v) => !v)} style={btn}>🤖 Instrucciones para la IA</button>
      </div>
      {verInstr && (
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, padding: 10, background: 'var(--df-bg)' }}>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 6 }}>Pégale esto a Claude o Astra junto con el código que descargaste, y dile qué quieres cambiar.</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, margin: 0, maxHeight: 220, overflow: 'auto', fontFamily: "'JetBrains Mono',monospace" }}>{c.instrucciones}</pre>
          <button onClick={copiarInstr} style={{ ...btn, marginTop: 8 }}>📋 Copiar instrucciones</button>
        </div>
      )}

      <textarea value={texto[pag]} onChange={(e) => setTexto((x) => ({ ...x, [pag]: e.target.value }))} spellCheck={false}
        placeholder={pag === 'landing' ? 'Pega aquí el HTML completo de la página (<!doctype html> … </html>), o descarga el diseño actual para empezar.' : 'Pega aquí el HTML de la página de gracias (opcional).'}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 300, resize: 'vertical', border: '1px solid var(--df-border)', borderRadius: 8, padding: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, lineHeight: 1.45, background: '#0f172a', color: '#e2e8f0', tabSize: 2 }} />
      <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{(texto[pag].length / 1024).toFixed(0)} KB de 1.500 KB</div>

      {avisos.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border)', borderRadius: 8, padding: '7px 10px' }}>⚠️ {a}</div>)}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => void guardar().then((ok) => ok && notificar('✓ Código guardado.'))} disabled={guardando || !cambiado} style={{ ...btnPri, opacity: guardando || !cambiado ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar código'}</button>
        {cambiado && <span style={{ fontSize: 12, color: 'var(--df-warning)' }}>Cambios sin guardar</span>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.45 }}>
        Por seguridad, dentro de app.dealflow.sbs el código corre aislado (sin acceso a tu cuenta). En tu dominio (o el de dflw.store) funciona completo, con píxeles y scripts externos.
      </div>
    </div>
  );
}
