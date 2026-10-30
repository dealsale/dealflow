import { useEffect, useState } from 'react';
import { apiDatosPlantilla, NOMBRE_CAMPO_PLANTILLA, type ExtraPlantilla, type PlantillaAprobada } from '../lib/api';

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', margin: '6px 0 3px' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const MEDIA: Record<string, string> = { IMAGE: 'Enlace de la foto', VIDEO: 'Enlace del video', DOCUMENT: 'Enlace del documento (PDF)' };

/** Campos de una plantilla: encabezado, foto/video/documento, variables del cuerpo y enlace del botón. */
export function CamposPlantilla({ p, params, setParams, extra, setExtra, nombreCliente = '', variosClientes = false }: {
  p: PlantillaAprobada; params: string[]; setParams: (v: string[]) => void; extra: ExtraPlantilla; setExtra: (v: ExtraPlantilla) => void; nombreCliente?: string;
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
          <input value={extra.media || ''} onChange={(e) => setExtra({ ...extra, media: e.target.value })} placeholder="https://…" style={inp} />
          {!!p.mediaEjemplo && !extra.media && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 3 }}>Si lo dejas vacío, sale el de ejemplo que subiste en Meta.</div>}
        </>
      )}
      {params.map((v, i) => (
        <div key={i}><label style={lbl}>{`{{${i + 1}}}`}{que(p.campos?.[i]) && ` · ${que(p.campos?.[i])}`}</label><input value={v} onChange={(e) => setParams(params.map((x, k) => (k === i ? e.target.value : x)))} placeholder={ph(p.campos?.[i], p.ejemplos[i] || '')} style={inp} /></div>
      ))}
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
  useEffect(() => {
    void apiDatosPlantilla(leadId, p.id).then((r) => {
      if (!r.data) { setPedido(''); return; }
      setParams(Array.from({ length: p.variables }, (_, i) => r.data!.params[i] || ''));
      setExtra((x) => ({ ...x, encabezado: x.encabezado || r.data!.encabezado, boton: x.boton || r.data!.boton }));
      setPedido(r.data.pedido);
    });
  }, [leadId, p.id, p.variables]);
  const falta = params.some((v) => !v.trim()) || (!!p.varsEncabezado && !extra.encabezado?.trim()) || (!!p.botonVariable && !extra.boton?.trim());
  return (
    <div style={{ padding: '4px 6px 6px' }}>
      <button onClick={onVolver} style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, color: 'var(--df-text-muted)' }}>‹ {p.nombre}</button>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.4 }}>
        {pedido === null ? 'Cargando los datos del cliente…' : pedido ? `Datos tomados del chat y del pedido ${pedido}. Revísalos: salen tal cual.` : 'Este cliente no tiene pedidos: llena lo que falte. Salen tal cual.'}
      </div>
      <CamposPlantilla p={p} params={params} setParams={setParams} extra={extra} setExtra={setExtra} nombreCliente={nombreCliente} />
      <button onClick={() => !falta && onEnviar(params, extra)} disabled={falta} title={falta ? 'Llena todos los datos' : ''} style={{ marginTop: 8, width: '100%', background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: falta ? 'not-allowed' : 'pointer', opacity: falta ? 0.55 : 1 }}>{falta ? 'Llena los datos para enviar' : 'Enviar plantilla'}</button>
    </div>
  );
}
