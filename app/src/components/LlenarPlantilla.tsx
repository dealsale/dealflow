import { useState } from 'react';
import type { ExtraPlantilla, PlantillaAprobada } from '../lib/api';

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', margin: '6px 0 3px' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const MEDIA: Record<string, string> = { IMAGE: 'Enlace de la foto', VIDEO: 'Enlace del video', DOCUMENT: 'Enlace del documento (PDF)' };

/** Campos de una plantilla: encabezado, foto/video/documento, variables del cuerpo y enlace del botón. */
export function CamposPlantilla({ p, params, setParams, extra, setExtra, nombreCliente = '' }: {
  p: PlantillaAprobada; params: string[]; setParams: (v: string[]) => void; extra: ExtraPlantilla; setExtra: (v: ExtraPlantilla) => void; nombreCliente?: string;
}) {
  const tipo = p.encabezadoTipo || '';
  const vista = p.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => (params[Number(n) - 1] || `{{${n}}}`).replace(/\{nombre\}/gi, nombreCliente || 'Ana'));
  return (
    <>
      {!!p.varsEncabezado && (<><label style={lbl}>Encabezado: {p.encabezado}</label><input value={extra.encabezado || ''} onChange={(e) => setExtra({ ...extra, encabezado: e.target.value })} style={inp} /></>)}
      {MEDIA[tipo] && (
        <>
          <label style={lbl}>{MEDIA[tipo]} (va arriba del mensaje)</label>
          <input value={extra.media || ''} onChange={(e) => setExtra({ ...extra, media: e.target.value })} placeholder="https://…" style={inp} />
          {!!p.mediaEjemplo && !extra.media && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 3 }}>Si lo dejas vacío, sale el de ejemplo que subiste en Meta.</div>}
        </>
      )}
      {params.map((v, i) => (
        <div key={i}><label style={lbl}>{`{{${i + 1}}}`}</label><input value={v} onChange={(e) => setParams(params.map((x, k) => (k === i ? e.target.value : x)))} placeholder={p.ejemplos[i] ? `Ej. ${p.ejemplos[i]}` : ''} style={inp} /></div>
      ))}
      {p.botonVariable && (<><label style={lbl}>Final del enlace del botón</label><input value={extra.boton || ''} onChange={(e) => setExtra({ ...extra, boton: e.target.value })} placeholder="Ej. el código del pedido" style={inp} /></>)}
      <div style={{ marginTop: 8, background: 'var(--df-brand-subtle-2, #ECFDF5)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--df-text)' }}>
        {p.encabezado && !p.varsEncabezado && <b>{p.encabezado}{'\n'}</b>}{vista}{p.pie && <span style={{ color: 'var(--df-text-muted)' }}>{'\n'}{p.pie}</span>}
      </div>
    </>
  );
}

/** Llenar y enviar una plantilla al chat abierto (dentro del menú ⚡). */
export function LlenarPlantilla({ p, nombreCliente, onEnviar, onVolver }: { p: PlantillaAprobada; nombreCliente: string; onEnviar: (params: string[], extra: ExtraPlantilla) => void; onVolver: () => void }) {
  // Vacías: el ejemplo de Meta sale solo como guía (no se le manda "Juan" a otro cliente).
  const [params, setParams] = useState<string[]>(() => Array.from({ length: p.variables }, () => ''));
  const [extra, setExtra] = useState<ExtraPlantilla>({});
  const falta = params.some((v) => !v.trim()) || (!!p.varsEncabezado && !extra.encabezado?.trim()) || (!!p.botonVariable && !extra.boton?.trim());
  return (
    <div style={{ padding: '4px 6px 6px' }}>
      <button onClick={onVolver} style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ {p.nombre}</button>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.4 }}>Revisa los datos: salen tal cual al cliente.</div>
      <CamposPlantilla p={p} params={params} setParams={setParams} extra={extra} setExtra={setExtra} nombreCliente={nombreCliente} />
      <button onClick={() => !falta && onEnviar(params, extra)} disabled={falta} title={falta ? 'Llena todos los datos' : ''} style={{ marginTop: 8, width: '100%', background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: falta ? 'not-allowed' : 'pointer', opacity: falta ? 0.55 : 1 }}>{falta ? 'Llena los datos para enviar' : 'Enviar plantilla'}</button>
    </div>
  );
}
