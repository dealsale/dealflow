import { useEffect, useState } from 'react';
import { apiDatosPlantilla, apiUpload, NOMBRE_CAMPO_PLANTILLA, type ExtraPlantilla, type PlantillaAprobada } from '../lib/api';

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', margin: '6px 0 3px' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const MEDIA: Record<string, string> = { IMAGE: 'Enlace de la foto', VIDEO: 'Enlace del video', DOCUMENT: 'Enlace del documento (PDF)' };
const normE = (v: string) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
/** ¿El valor es el dato de EJEMPLO de la plantilla (y no el real del cliente)? Ese nunca se envía. */
export function esDatoEjemplo(p: PlantillaAprobada, valor: string, real = ''): boolean {
  const v = normE(valor);
  if (v.length < 2 || v === normE(real)) return false;
  return p.ejemplos.some((e) => normE(e) === v);
}

const ACEPTA: Record<string, string> = { IMAGE: 'image/jpeg,image/png', VIDEO: 'video/mp4', DOCUMENT: 'application/pdf' };
const MAX_MB: Record<string, number> = { IMAGE: 5, VIDEO: 16, DOCUMENT: 15 };
/** Botón para adjuntar el archivo del encabezado desde el equipo (se sube a DealFlow y de ahí a Meta al enviar). */
function SubirArchivo({ tipo, onListo }: { tipo: string; onListo: (url: string, nombre: string) => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const elegir = (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (f.size > (MAX_MB[tipo] || 5) * 1024 * 1024) { setError(`Pesa más de ${MAX_MB[tipo] || 5} MB.`); return; }
    setSubiendo(true);
    const fr = new FileReader();
    fr.onload = () => void apiUpload(String(fr.result), f.name).then((r) => {
      setSubiendo(false);
      if (!r.data) { setError(r.error || 'No se pudo subir.'); return; }
      onListo(r.data.url, f.name);
    });
    fr.onerror = () => { setSubiendo(false); setError('No se pudo leer el archivo.'); };
    fr.readAsDataURL(f);
  };
  return (
    <span style={{ display: 'inline-grid', gap: 2, flexShrink: 0 }}>
      <label style={{ border: '1px solid var(--df-border)', background: 'var(--df-surface-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 700, cursor: subiendo ? 'wait' : 'pointer', whiteSpace: 'nowrap', color: 'var(--df-text)' }}>
        {subiendo ? 'Subiendo…' : '📎 Adjuntar'}
        <input type="file" accept={ACEPTA[tipo] || '*/*'} disabled={subiendo} onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
      </label>
      {error && <span style={{ fontSize: 11, color: 'var(--df-danger, #dc2626)' }}>{error}</span>}
    </span>
  );
}

/** Campos de una plantilla: encabezado, foto/video/documento, variables del cuerpo y enlace del botón. */
export function CamposPlantilla({ p, params, setParams, extra, setExtra, nombreCliente = '', variosClientes = false, reales = [] }: {
  p: PlantillaAprobada; params: string[]; setParams: (v: string[]) => void; extra: ExtraPlantilla; setExtra: (v: ExtraPlantilla) => void; nombreCliente?: string;
  /** Datos reales que trajo el servidor (un ejemplo que coincide con el dato real sí vale). */
  reales?: string[];
  /** Iniciar conversación: los datos de cada cliente se llenan solos al enviar. */
  variosClientes?: boolean;
}) {
  const que = (c?: string) => (c && NOMBRE_CAMPO_PLANTILLA[c]) || '';
  const ph = (c: string | undefined, ej: string) => (variosClientes && que(c) ? `Automático: ${que(c)} de cada cliente` : ej ? `Ej. ${ej}` : '');
  const tipo = p.encabezadoTipo || '';
  const vista = p.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => (params[Number(n) - 1] || `{{${n}}}`).replace(/\{nombre\}/gi, nombreCliente || 'Ana'));
  return (
    <>
      {!!p.varsEncabezado && (<><label style={lbl}>Encabezado: {p.encabezado}{que(p.campoEncabezado) && ` · ${que(p.campoEncabezado)}`}</label><input value={extra.encabezado || ''} onChange={(e) => setExtra({ ...extra, encabezado: e.target.value })} placeholder={ph(p.campoEncabezado, '')} style={inp} /></>)}
      {MEDIA[tipo] && (
        <>
          <label style={lbl}>{MEDIA[tipo]} (va arriba del mensaje)</label>
          {extra.media?.startsWith('/api/media/') ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {extra.mediaNombre || 'Archivo adjunto'}</span>
              <button type="button" onClick={() => setExtra({ ...extra, media: '', mediaNombre: '' })} style={{ border: '1px solid var(--df-border)', background: 'var(--df-surface)', borderRadius: 7, padding: '4px 8px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', color: 'var(--df-text)' }}>Quitar</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={extra.media || ''} onChange={(e) => setExtra({ ...extra, media: e.target.value })} placeholder="https://…" style={inp} />
              {p.adjuntable && <SubirArchivo tipo={tipo} onListo={(url, nombre) => setExtra({ ...extra, media: url, mediaNombre: nombre })} />}
            </div>
          )}
          {!!p.mediaEjemplo && !extra.media && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 3 }}>Si lo dejas vacío, sale el de ejemplo que subiste en Meta.</div>}
        </>
      )}
      {params.map((v, i) => {
        const ej = esDatoEjemplo(p, v, reales[i]);
        return (
          <div key={i}>
            <label style={lbl}>{`{{${i + 1}}}`}{que(p.campos?.[i]) && ` · ${que(p.campos?.[i])}`}</label>
            <input value={v} onChange={(e) => setParams(params.map((x, k) => (k === i ? e.target.value : x)))} placeholder={ph(p.campos?.[i], p.ejemplos[i] || '')} style={{ ...inp, ...(ej || (!variosClientes && !v.trim()) ? { borderColor: 'var(--df-danger, #dc2626)' } : {}) }} />
            {ej && <div style={{ fontSize: 11, color: 'var(--df-danger, #dc2626)', marginTop: 2 }}>Ese es el dato de EJEMPLO de la plantilla. Escribe el dato real del cliente.</div>}
            {!ej && !variosClientes && !v.trim() && <div style={{ fontSize: 11, color: 'var(--df-danger, #dc2626)', marginTop: 2 }}>No está en el chat ni en el pedido: escríbelo.</div>}
          </div>
        );
      })}
      {p.botonVariable && (<><label style={lbl}>Final del enlace del botón{que(p.campoBoton) && ` · ${que(p.campoBoton)}`}</label><input value={extra.boton || ''} onChange={(e) => setExtra({ ...extra, boton: e.target.value })} placeholder={ph(p.campoBoton, 'el código del pedido')} style={inp} /></>)}
      <div style={{ marginTop: 8, background: 'var(--df-brand-subtle-2, #ECFDF5)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--df-text)' }}>
        {p.encabezado && !p.varsEncabezado && <b>{p.encabezado}{'\n'}</b>}{vista}{p.pie && <span style={{ color: 'var(--df-text-muted)' }}>{'\n'}{p.pie}</span>}
      </div>
    </>
  );
}

/** Llenar y enviar una plantilla al chat abierto (dentro del menú ⚡). */
export function LlenarPlantilla({ p, leadId, nombreCliente, onEnviar, onVolver }: { p: PlantillaAprobada; leadId: string; nombreCliente: string; onEnviar: (params: string[], extra: ExtraPlantilla) => void; onVolver: () => void }) {
  // Se llenan con los datos REALES del chat y de su último pedido; el ejemplo de Meta solo
  // sale como guía en lo que no se sepa (no se le manda "Juan" a otro cliente).
  const [params, setParams] = useState<string[]>(() => Array.from({ length: p.variables }, () => ''));
  const [extra, setExtra] = useState<ExtraPlantilla>({});
  const [pedido, setPedido] = useState<string | null>(null);
  const [reales, setReales] = useState<string[]>([]);
  useEffect(() => {
    void apiDatosPlantilla(leadId, p.id).then((r) => {
      if (!r.data) { setPedido(''); return; }
      setParams(Array.from({ length: p.variables }, (_, i) => r.data!.params[i] || ''));
      setReales(r.data.params);
      setExtra((x) => ({ ...x, encabezado: x.encabezado || r.data!.encabezado, boton: x.boton || r.data!.boton }));
      setPedido(r.data.pedido);
    });
  }, [leadId, p.id, p.variables]);
  const conEjemplo = params.some((v, i) => esDatoEjemplo(p, v, reales[i]));
  const falta = conEjemplo || params.some((v) => !v.trim()) || (!!p.varsEncabezado && !extra.encabezado?.trim()) || (!!p.botonVariable && !extra.boton?.trim());
  return (
    <div style={{ padding: '4px 6px 6px' }}>
      <button onClick={onVolver} style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ {p.nombre}</button>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.4 }}>
        {pedido === null ? 'Cargando los datos del cliente…' : pedido ? `Datos tomados del chat y del pedido ${pedido}. Revísalos: salen tal cual.` : 'Este cliente no tiene pedidos: llena lo que falte. Salen tal cual.'}
      </div>
      <CamposPlantilla p={p} params={params} setParams={setParams} extra={extra} setExtra={setExtra} nombreCliente={nombreCliente} reales={reales} />
      <button onClick={() => !falta && onEnviar(params, extra)} disabled={falta} title={falta ? 'Llena todos los datos' : ''} style={{ marginTop: 8, width: '100%', background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: falta ? 'not-allowed' : 'pointer', opacity: falta ? 0.55 : 1 }}>{conEjemplo ? 'Cambia el dato de ejemplo' : falta ? 'Llena los datos que faltan' : 'Enviar plantilla'}</button>
    </div>
  );
}
