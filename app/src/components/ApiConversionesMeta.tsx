import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiCodigoPruebaConversiones, apiConversiones, apiProbarConversiones, apiTokenConversiones } from '../lib/api';
import type { EstadoConversiones } from '../lib/api';

/**
 * «Token» de la API de Conversiones de Meta para el píxel de una landing (o de Mi tienda).
 * Con el token, DealFlow también le manda a Meta desde el servidor las vistas, los inicios de
 * compra y las COMPRAS (con el mismo ID que el píxel del navegador: Meta las cuenta una vez).
 * El token se guarda en DealFlow y no vuelve a mostrarse (solo sus últimos 4 caracteres).
 */
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-strong)' };
const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-strong)', whiteSpace: 'nowrap' };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' };
const NOMBRES: Record<string, string> = { Purchase: 'Compras', InitiateCheckout: 'Inicios de compra', ViewContent: 'Vistas del producto' };

export function ApiConversionesMeta({ pixelId }: { pixelId: string }) {
  const [e, setE] = useState<EstadoConversiones | null>(null);
  const [token, setToken] = useState('');
  const [cambiar, setCambiar] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = () => void apiConversiones().then((r) => { if (r.data) { setE(r.data); setCodigo(r.data.testCode); } });
  useEffect(cargar, []);
  const pixel = pixelId.replace(/\D/g, '');
  const fila = e?.pixeles.find((p) => p.pixelId === pixel);
  const conToken = !!fila?.tieneToken;

  const guardarToken = async (t: string) => {
    setOcupado(true); setMsg(null);
    const r = await apiTokenConversiones(pixel, t);
    setOcupado(false);
    if (r.error || !r.data) { setMsg({ ok: false, t: r.error || 'No se pudo guardar.' }); return; }
    setE(r.data); setToken(''); setCambiar(false);
    if (t) { setMsg({ ok: true, t: 'Token guardado. Probando con Meta…' }); await probar(); }
    else setMsg({ ok: true, t: 'Token quitado: queda solo el píxel del navegador.' });
  };
  const probar = async () => {
    setOcupado(true);
    const r = await apiProbarConversiones(pixel);
    setOcupado(false);
    setMsg(r.data ? { ok: r.data.ok, t: r.data.mensaje } : { ok: false, t: r.error || 'No se pudo probar.' });
  };
  const guardarCodigo = async () => {
    const r = await apiCodigoPruebaConversiones(codigo);
    if (r.data) { setE(r.data); setMsg({ ok: true, t: codigo ? 'Código de prueba guardado: los eventos saldrán en «Probar eventos» de Meta.' : 'Código de prueba quitado.' }); }
  };

  const caja: CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 10, padding: 10, display: 'grid', gap: 8, background: 'var(--df-surface-2, rgba(0,0,0,.02))' };
  if (!pixel) return <div style={{ ...caja, fontSize: 12.5, color: 'var(--df-text-muted)' }}>⚡ <b>API de Conversiones (token):</b> escribe primero el ID del píxel.</div>;
  const compras = e?.resumen.find((r) => r.evento === 'Purchase');
  const errores = (e?.ultimos || []).filter((u) => u.estado === 'error');

  return (
    <div style={caja} aria-label="API de Conversiones de Meta">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>⚡ API de Conversiones (token)</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: conToken ? '#dcfce7' : '#fef3c7', color: conToken ? '#166534' : '#92400e' }}>
          {conToken ? `Activa · token ····${fila!.final}` : 'Sin token: solo el píxel del navegador'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.45 }}>
        Con el token, DealFlow también le manda a Meta <b>desde el servidor</b> las vistas, los inicios de compra y las compras, con el celular, nombre y ciudad del formulario (cifrados). Así Meta recupera las compras que el navegador pierde (iPhone, bloqueadores) y optimiza mejor tus campañas.
        {' '}<button type="button" onClick={() => setAyuda(!ayuda)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--df-brand)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>{ayuda ? 'Ocultar' : '¿Dónde saco el token?'}</button>
      </div>
      {ayuda && (
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }}>
          <li>Entra a <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer">Administrador de eventos de Meta ↗</a> y elige el píxel <b>{pixel}</b>.</li>
          <li>Ve a <b>Configuración</b> y baja hasta <b>API de Conversiones</b>.</li>
          <li>Toca <b>Generar token de acceso</b> (no hace falta ningún socio ni app) y cópialo.</li>
          <li>Pégalo aquí y toca <b>Guardar token</b>. DealFlow lo prueba con Meta en ese momento.</li>
        </ol>
      )}
      {(!conToken || cambiar) && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="password" autoComplete="off" value={token} onChange={(x) => setToken(x.target.value.trim())} placeholder="Pega aquí el token (empieza por EAA…)" style={{ ...inp, flex: 1, minWidth: 0 }} aria-label="Token de la API de Conversiones" />
          <button type="button" disabled={ocupado || token.length < 40} onClick={() => void guardarToken(token)} style={{ ...btnPri, opacity: ocupado || token.length < 40 ? 0.55 : 1 }}>{ocupado ? 'Guardando…' : 'Guardar token'}</button>
          {cambiar && <button type="button" onClick={() => { setCambiar(false); setToken(''); }} style={btn}>Cancelar</button>}
        </div>
      )}
      {conToken && !cambiar && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupado} onClick={() => void probar()} style={btn}>{ocupado ? 'Probando…' : 'Probar envío'}</button>
          <button type="button" onClick={() => setCambiar(true)} style={btn}>Cambiar token</button>
          <button type="button" onClick={() => void guardarToken('')} style={{ ...btn, color: 'var(--df-danger-dark, #b91c1c)' }}>Quitar</button>
        </div>
      )}
      {conToken && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={codigo} onChange={(x) => setCodigo(x.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder="Código de «Probar eventos» (opcional, ej. TEST12345)" style={{ ...inp, flex: 1, minWidth: 0 }} aria-label="Código de prueba de Meta" />
          <button type="button" disabled={codigo === (e?.testCode || '')} onClick={() => void guardarCodigo()} style={{ ...btn, opacity: codigo === (e?.testCode || '') ? 0.55 : 1 }}>{codigo || !e?.testCode ? 'Guardar código' : 'Quitar código'}</button>
        </div>
      )}
      {conToken && e?.testCode && <div style={{ fontSize: 11.5, color: '#92400e' }}>⚠️ Con código de prueba, los eventos van a «Probar eventos» y <b>no cuentan para tus campañas</b>. Quítalo cuando termines de probar.</div>}
      {msg && <div role="status" style={{ fontSize: 12.5, color: msg.ok ? '#047857' : 'var(--df-danger-dark, #b91c1c)' }}>{msg.t}</div>}
      {conToken && !!e?.resumen.length && (
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>
          Últimos 7 días por el servidor: {['Purchase', 'InitiateCheckout', 'ViewContent'].map((k) => { const r = e.resumen.find((x) => x.evento === k); return r ? `${NOMBRES[k]} ${r.enviados}${r.errores ? ` (${r.errores} con error)` : ''}` : ''; }).filter(Boolean).join(' · ')}
        </div>
      )}
      {conToken && compras && errores.length > 0 && <div style={{ fontSize: 12, color: 'var(--df-danger-dark, #b91c1c)' }}>Última compra que Meta no recibió: {errores[0].error}</div>}
    </div>
  );
}
