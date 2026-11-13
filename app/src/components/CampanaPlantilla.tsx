import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';
import { PlantillasWhatsAppTienda } from './PlantillasWhatsAppTienda';
import {
  apiRemarketingAudiencia, apiRemarketingCampanaPlantilla,
  type DestinatarioRmk, type PanelRemarketing, type SegmentoRmk, type VariableRmk,
} from '../lib/api';

/**
 * Campaña de remarketing con una plantilla PROPIA de la tienda aprobada por Meta (la única que se
 * puede enviar). A quién: leads por estado y/o contactos con una etiqueta (también importados).
 * Desde aquí también se crea la plantilla y se manda a aprobación.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 };
const chip = (on: boolean): React.CSSProperties => ({
  border: `1.5px solid ${on ? 'var(--df-purple)' : 'var(--df-border)'}`, background: on ? 'var(--df-purple-subtle, rgba(124,58,237,.08))' : 'var(--df-bg)',
  borderRadius: 999, padding: '6px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--df-text-body)',
});

export function CampanaPlantilla({ p, onEnviada }: { p: PanelRemarketing; onEnviada: () => void }) {
  const [crear, setCrear] = useState(false);
  const [plantillaId, setPlantillaId] = useState('');
  const [vars, setVars] = useState<VariableRmk[]>([]);
  const [extra, setExtra] = useState<{ encabezado: string; media: string; boton: string }>({ encabezado: '', media: '', boton: '' });
  const [segmentos, setSegmentos] = useState<SegmentoRmk[]>([]);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [dias, setDias] = useState(60);
  const [limite, setLimite] = useState(500);
  const [aud, setAud] = useState<{ total: number; aptos: number; importados: number; muestra: DestinatarioRmk[] } | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const plantilla = p.plantillas.find((x) => x.id === plantillaId);
  useEffect(() => { if (!plantilla && p.plantillas.length) setPlantillaId(p.plantillas[0].id); }, [p.plantillas]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cada {{n}}: por defecto el primero es el nombre del cliente y el resto texto que escribe la tienda.
  useEffect(() => { setVars(Array.from({ length: plantilla?.variables || 0 }, (_, i) => (i === 0 ? { tipo: 'nombre' } : { tipo: 'texto', valor: '' }))); setExtra({ encabezado: '', media: '', boton: '' }); }, [plantillaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtro = useMemo(() => ({ segmentos, etiquetas, dias }), [segmentos, etiquetas, dias]);
  useEffect(() => {
    if (!segmentos.length && !etiquetas.length) { setAud(null); return; }
    const t = setTimeout(() => void apiRemarketingAudiencia(filtro).then((r) => setAud(r.data || null)), 350);
    return () => clearTimeout(t);
  }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const muestra = (v: VariableRmk) => (v.tipo === 'nombre' ? 'Camila' : v.tipo === 'tienda' ? 'tu tienda' : v.valor?.trim() || '…');
  const vista = plantilla ? plantilla.cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_x, n) => (vars[Number(n) - 1] ? muestra(vars[Number(n) - 1]) : `{{${n}}}`)) : '';
  const media = plantilla && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(plantilla.encabezadoTipo);
  const botonVar = plantilla?.botones.find((b) => b.variable);
  const falta = !plantilla ? 'Elige la plantilla'
    : vars.some((v) => v.tipo === 'texto' && !v.valor?.trim()) ? 'Llena los textos de la plantilla'
      : plantilla.varsEncabezado > 0 && !extra.encabezado.trim() ? 'Llena el encabezado'
        : botonVar && !extra.boton.trim() ? 'Llena el enlace del botón'
          : !segmentos.length && !etiquetas.length ? 'Elige a quién enviarlo'
            : !aud?.aptos ? 'No hay contactos con ese filtro' : '';
  const n = Math.min(aud?.aptos || 0, limite);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const enviar = async () => {
    if (!plantilla || falta) return;
    if (!(await confirmar({
      titulo: `¿Enviar "${plantilla.nombre}" a ${n} contacto${n === 1 ? '' : 's'}?`,
      mensaje: `Sale con tu plantilla aprobada por Meta, de a pocos (unos 5 por minuto, de 8 a. m. a 8 p. m.) y con un máximo de ${p.cfg.topeDiario} al día. Nunca a quien pidió la baja ni a quien ya recibió remarketing esta semana. Si Meta avisa límite o spam, se pausa sola.${aud?.importados ? ` ${aud.importados} son contactos importados: su chat aparece en el Inbox cuando se les envíe.` : ''}`,
      aceptar: 'Enviar',
    }))) return;
    setEnviando(true);
    const r = await apiRemarketingCampanaPlantilla({ ...filtro, plantillaId: plantilla.id, variables: vars, extra, limite });
    setEnviando(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo.', 'error', 8000);
    notificar(`✓ ${r.data.encolados} en cola${r.data.excluidos ? ` (${r.data.excluidos} excluidos)` : ''}. Van saliendo de a pocos.`);
    onEnviada();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>📣 Campaña con tu plantilla</div>
        {p.puedeCrearPlantillas && <button onClick={() => setCrear(!crear)} style={btnS}>{crear ? 'Cerrar' : '＋ Crear plantilla y enviarla a Meta'}</button>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Solo se envían <b>plantillas tuyas aprobadas por Meta</b>. Elige a quién: por el estado del lead, por etiqueta, o las dos (se suman sin repetir a nadie).
      </p>
      {crear && <div style={{ marginBottom: 14 }}><PlantillasWhatsAppTienda /></div>}

      {!p.plantillas.length ? (
        <div style={{ fontSize: 12.5, background: 'rgba(245,158,11,.1)', border: '1px solid var(--df-warning, #F59E0B)', borderRadius: 8, padding: '9px 11px', lineHeight: 1.5 }}>
          Todavía no tienes plantillas aprobadas por Meta.{' '}
          {p.puedeCrearPlantillas ? 'Créala con el botón de arriba y espera a que Meta la apruebe (suele tardar de minutos a unas horas).' : 'El constructor de plantillas aún no está activo en tu tienda: pídele a DealFlow que te lo active.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>1 · Plantilla aprobada</label>
              <Dropdown value={plantillaId} onChange={setPlantillaId} ariaLabel="Plantilla" options={p.plantillas.map((x) => ({ value: x.id, label: `${x.nombre} · ${x.categoria === 'MARKETING' ? 'Marketing' : x.categoria === 'UTILITY' ? 'Utilidad' : x.categoria}` }))} />
            </div>
            {plantilla && (vars.length > 0 || plantilla.varsEncabezado > 0 || media || botonVar) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>2 · Datos de la plantilla</label>
                {plantilla.varsEncabezado > 0 && <input value={extra.encabezado} onChange={(e) => setExtra({ ...extra, encabezado: e.target.value })} placeholder={`Encabezado: ${plantilla.encabezado}`} style={inp} />}
                {media && <input value={extra.media} onChange={(e) => setExtra({ ...extra, media: e.target.value })} placeholder={`Enlace de ${plantilla.encabezadoTipo === 'IMAGE' ? 'la foto' : plantilla.encabezadoTipo === 'VIDEO' ? 'el video' : 'el documento'} (vacío = el que registraste en Meta)`} style={inp} />}
                {vars.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 150px 1fr', gap: 6, alignItems: 'center' }}>
                    <b style={{ fontSize: 12.5 }}>{`{{${i + 1}}}`}</b>
                    <Dropdown value={v.tipo} onChange={(t) => setVars(vars.map((x, k) => (k === i ? { tipo: t as VariableRmk['tipo'], valor: x.valor } : x)))} ariaLabel={`Dato ${i + 1}`}
                      options={[{ value: 'nombre', label: 'Nombre del cliente' }, { value: 'tienda', label: 'Nombre de la tienda' }, { value: 'texto', label: 'Texto que escribo' }]} />
                    {v.tipo === 'texto'
                      ? <input value={v.valor || ''} onChange={(e) => setVars(vars.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)))} placeholder={plantilla.ejemplos[i] ? `Ej. ${plantilla.ejemplos[i]}` : 'Texto'} maxLength={200} style={inp} />
                      : <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{v.tipo === 'nombre' ? 'Sale el de cada cliente' : 'Sale el de tu tienda'}</span>}
                  </div>
                ))}
                {botonVar && <input value={extra.boton} onChange={(e) => setExtra({ ...extra, boton: e.target.value })} placeholder={`Final del enlace del botón "${botonVar.texto}"`} style={inp} />}
              </div>
            )}

            <div>
              <label style={lbl}>3 · A quién · por estado del lead</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.segmentos.map((s) => <button key={s.id} type="button" title={s.ayuda} onClick={() => setSegmentos(toggle(segmentos, s.id))} style={chip(segmentos.includes(s.id))}>{s.titulo} <span style={{ color: 'var(--df-text-muted)' }}>{s.aptos}</span></button>)}
              </div>
              {segmentos.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <Dropdown variant="pill" label="Escribieron en" value={String(dias)} onChange={(v) => setDias(Number(v))}
                    options={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: '60', label: 'Últimos 60 días' }, { value: '90', label: 'Últimos 90 días' }, { value: '365', label: 'Último año' }]} />
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>… y/o por etiqueta</label>
              {p.etiquetas.length ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {p.etiquetas.map((e) => <button key={e.etiqueta} type="button" onClick={() => setEtiquetas(toggle(etiquetas, e.etiqueta))} style={chip(etiquetas.includes(e.etiqueta))}>🏷️ {e.etiqueta} <span style={{ color: 'var(--df-text-muted)' }}>{e.n}</span></button>)}
                </div>
              ) : <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Importa contactos con una etiqueta (arriba) para elegirlos aquí.</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <div><label style={lbl}>Máximo de contactos</label><input type="number" min={1} max={5000} value={limite} onChange={(e) => setLimite(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} style={{ ...inp, width: 130 }} /></div>
              {aud && (
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', paddingBottom: 9 }}>
                  <b style={{ color: 'var(--df-text-strong)', fontSize: 15 }}>{aud.aptos.toLocaleString('es-CO')}</b> pueden recibirla{aud.total > aud.aptos ? ` de ${aud.total.toLocaleString('es-CO')}` : ''}{aud.importados ? ` · ${aud.importados} importados` : ''}{' '}
                  <button onClick={() => setVerLista(!verLista)} style={{ ...btnS, padding: '3px 8px' }}>{verLista ? 'Ocultar' : 'Ver'}</button>
                </div>
              )}
            </div>
            {verLista && aud && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--df-border)', borderRadius: 8 }}>
                {aud.muestra.map((d) => (
                  <div key={d.clave} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderBottom: '1px solid var(--df-border)', fontSize: 12.5, opacity: d.excluido ? 0.55 : 1 }}>
                    <b style={{ minWidth: 120 }}>{d.nombre || d.tel}</b>
                    <span style={{ flex: 1, color: 'var(--df-text-muted)' }}>{d.origen === 'importado' ? '📇 ' : ''}{d.motivo}</span>
                    {d.excluido && <span style={{ color: '#B45309', fontWeight: 600 }}>{d.excluido}</span>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => void enviar()} disabled={!!falta || enviando || p.whatsapp !== 'oficial'} title={falta} style={{ ...btn, alignSelf: 'flex-start', opacity: falta || enviando || p.whatsapp !== 'oficial' ? 0.5 : 1 }}>
              {enviando ? 'Poniendo en cola…' : falta || `Enviar a ${n.toLocaleString('es-CO')} contacto${n === 1 ? '' : 's'}`}
            </button>
          </div>
          {plantilla && (
            <div>
              <label style={lbl}>Así le llega (ejemplo)</label>
              <div style={{ background: '#E7FFDB', color: '#111B21', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(0,0,0,.1)' }}>
                {plantilla.encabezado && <b style={{ display: 'block', marginBottom: 4 }}>{plantilla.varsEncabezado ? plantilla.encabezado.replace(/\{\{\s*1\s*\}\}/, extra.encabezado || '…') : plantilla.encabezado}</b>}
                {media && <div style={{ fontSize: 11.5, color: '#54656F', marginBottom: 4 }}>[{plantilla.encabezadoTipo === 'IMAGE' ? 'foto' : plantilla.encabezadoTipo === 'VIDEO' ? 'video' : 'documento'}]</div>}
                {vista}
                {plantilla.pie && <div style={{ fontSize: 11.5, color: '#667781', marginTop: 4 }}>{plantilla.pie}</div>}
                {plantilla.botones.length > 0 && <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', marginTop: 8, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>{plantilla.botones.map((b, i) => <span key={i} style={{ color: '#027EB5', textAlign: 'center', fontWeight: 600 }}>{b.texto}</span>)}</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
