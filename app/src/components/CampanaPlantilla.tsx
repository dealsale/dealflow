import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';
import { PlantillasWhatsAppTienda } from './PlantillasWhatsAppTienda';
import { SearchInput } from './Filters';
import { SubirArchivo } from './LlenarPlantilla';
import {
  apiRemarketingAudiencia, apiRemarketingBuscar, apiRemarketingCampanaPlantilla,
  type DestinatarioRmk, type FiltroRmk, type PanelRemarketing, type SegmentoRmk, type VariableRmk,
} from '../lib/api';

/** Estado del último pedido del cliente ('sin_pedido' = nunca ha pedido). */
const ESTADOS_PEDIDO: [string, string][] = [
  ['sin_pedido', 'Nunca ha pedido'], ['Nuevo', 'Nuevo'], ['Confirmado', 'Confirmado'], ['Guía generada', 'Guía generada'], ['En tránsito', 'En tránsito'],
  ['En reparto', 'En reparto'], ['En oficina', 'En oficina'], ['Novedad', 'Novedad'], ['Entregado', 'Entregado'], ['Devuelto', 'Devuelto'], ['Cancelado', 'Cancelado'],
];

/**
 * Campaña de remarketing con una plantilla PROPIA de la tienda aprobada por Meta (la única que se
 * puede enviar). A quién: leads por estado y/o contactos con una etiqueta (también importados).
 * Desde aquí también se crea la plantilla y se manda a aprobación.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
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
  const [extra, setExtra] = useState<{ encabezado: string; media: string; mediaNombre?: string; boton: string }>({ encabezado: '', media: '', boton: '' });
  /** Vista previa local de la foto o el video que se subió (el archivo en DealFlow necesita sesión). */
  const [previa, setPrevia] = useState('');
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);
  const [fechaModo, setFechaModo] = useState<'' | 'hoy' | 'ayer' | 'horas' | 'rango'>('');
  const [fechaCampo, setFechaCampo] = useState<'llegada' | 'ultimo'>('llegada');
  const [horas, setHoras] = useState(24);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [segmentos, setSegmentos] = useState<SegmentoRmk[]>([]);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [anuncios, setAnuncios] = useState<string[]>([]);
  const [estadosPedido, setEstadosPedido] = useState<string[]>([]);
  const [combinar, setCombinar] = useState<'todos' | 'alguno'>('todos');
  const [modo, setModo] = useState<'filtros' | 'manual'>('filtros');
  const [buscaAd, setBuscaAd] = useState('');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<DestinatarioRmk[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegidos, setElegidos] = useState<DestinatarioRmk[]>([]);
  const [dias, setDias] = useState(60);
  // Excluir: por defecto NO le llega a quien ya te compró (era el error más caro: mandarle promo al que ya compró).
  const [exCompraron, setExCompraron] = useState(true);
  const [exDias, setExDias] = useState(0);
  const [exEtiquetas, setExEtiquetas] = useState<string[]>([]);
  const [exClientes, setExClientes] = useState<DestinatarioRmk[]>([]);
  const [exBusca, setExBusca] = useState('');
  const [exResultados, setExResultados] = useState<DestinatarioRmk[]>([]);
  const [limite, setLimite] = useState(500);
  const [aud, setAud] = useState<{ total: number; aptos: number; importados: number; muestra: DestinatarioRmk[] } | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const plantilla = p.plantillas.find((x) => x.id === plantillaId);
  useEffect(() => { if (!plantilla && p.plantillas.length) setPlantillaId(p.plantillas[0].id); }, [p.plantillas]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cada {{n}}: por defecto el primero es el nombre del cliente y el resto texto que escribe la tienda.
  useEffect(() => { setVars(Array.from({ length: plantilla?.variables || 0 }, (_, i) => (i === 0 ? { tipo: 'nombre' } : { tipo: 'texto', valor: '' }))); setExtra({ encabezado: '', media: '', boton: '' }); setPrevia(''); }, [plantillaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = [anuncios, segmentos, estadosPedido, etiquetas].filter((x) => x.length > 0).length;
  const fecha = useMemo<FiltroRmk['fecha']>(() => {
    if (fechaModo === 'hoy' || fechaModo === 'ayer') return { campo: fechaCampo, modo: fechaModo };
    if (fechaModo === 'horas' && horas > 0) return { campo: fechaCampo, modo: 'horas', horas };
    if (fechaModo === 'rango' && (desde || hasta)) return { campo: fechaCampo, modo: 'rango', desde, hasta };
    return undefined;
  }, [fechaModo, fechaCampo, horas, desde, hasta]);
  const hayAQuien = modo === 'manual' ? elegidos.length > 0 : grupos > 0 || !!fecha;
  const excluir = useMemo<FiltroRmk['excluir']>(() => ({ compraron: exCompraron, compraronDias: exDias, etiquetas: exEtiquetas, claves: exClientes.map((d) => d.clave) }), [exCompraron, exDias, exEtiquetas, exClientes]);
  const filtro = useMemo<FiltroRmk>(() => (modo === 'manual'
    ? { segmentos: [], etiquetas: [], dias, claves: elegidos.map((d) => d.clave), excluir }
    : { segmentos, etiquetas, dias, anuncios, estadosPedido, combinar, fecha, excluir }), [modo, segmentos, etiquetas, dias, anuncios, estadosPedido, combinar, elegidos, fecha, excluir]);
  const nExcluir = (exCompraron ? 1 : 0) + exEtiquetas.length + exClientes.length;
  const textoFecha = !fecha ? '' : `${fechaCampo === 'ultimo' ? 'escribieron' : 'llegaron'} ${fecha.modo === 'hoy' ? 'hoy' : fecha.modo === 'ayer' ? 'ayer' : fecha.modo === 'horas' ? `en las últimas ${horas} h` : desde && hasta && desde !== hasta ? `del ${desde.split('-').reverse().slice(0, 2).join('/')} al ${hasta.split('-').reverse().slice(0, 2).join('/')}` : `el ${(desde || hasta).split('-').reverse().slice(0, 2).join('/')}`}`;
  useEffect(() => {
    if (!hayAQuien) { setAud(null); return; }
    const t = setTimeout(() => void apiRemarketingAudiencia(filtro).then((r) => setAud(r.data || null)), 350);
    return () => clearTimeout(t);
  }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscador de clientes (modo "Elegir clientes").
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setResultados([]); return; }
    setBuscando(true);
    let vivo = true;
    const t = setTimeout(() => void apiRemarketingBuscar(q).then((r) => { if (vivo) { setResultados(r.data?.clientes || []); setBuscando(false); } }), 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);
  // Buscador de clientes para EXCLUIR uno por uno.
  useEffect(() => {
    const q = exBusca.trim();
    if (q.length < 2) { setExResultados([]); return; }
    let vivo = true;
    const t = setTimeout(() => void apiRemarketingBuscar(q).then((r) => { if (vivo) setExResultados(r.data?.clientes || []); }), 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [exBusca]);
  const agregar = (ds: DestinatarioRmk[]) => setElegidos((xs) => [...xs, ...ds.filter((d) => !xs.some((x) => x.clave === d.clave))]);
  const quitar = (clave: string) => setElegidos((xs) => xs.filter((x) => x.clave !== clave));
  const limpiarFiltros = () => { setAnuncios([]); setSegmentos([]); setEstadosPedido([]); setEtiquetas([]); setFechaModo(''); setDesde(''); setHasta(''); };
  const hoyCO = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const tipoMedia = plantilla?.encabezadoTipo || '';
  const subible = tipoMedia === 'IMAGE' || tipoMedia === 'VIDEO' || (tipoMedia === 'DOCUMENT' && !!p.puedeAdjuntarDocumentos);
  const adsVisibles = useMemo(() => {
    const q = buscaAd.trim().toLowerCase();
    const xs = q ? p.anuncios.filter((a) => `${a.nombre} ${a.campana}`.toLowerCase().includes(q)) : p.anuncios;
    // Los elegidos siempre arriba, para verlos aunque la lista sea larga.
    return [...xs.filter((a) => anuncios.includes(a.id)), ...xs.filter((a) => !anuncios.includes(a.id))].slice(0, 80);
  }, [p.anuncios, buscaAd, anuncios]);

  const muestra = (v: VariableRmk) => (v.tipo === 'nombre' ? 'Camila' : v.tipo === 'tienda' ? 'tu tienda' : v.valor?.trim() || '…');
  const vista = plantilla ? plantilla.cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_x, n) => (vars[Number(n) - 1] ? muestra(vars[Number(n) - 1]) : `{{${n}}}`)) : '';
  const media = plantilla && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(plantilla.encabezadoTipo);
  const botonVar = plantilla?.botones.find((b) => b.variable);
  const falta = !plantilla ? 'Elige la plantilla'
    : vars.some((v) => v.tipo === 'texto' && !v.valor?.trim()) ? 'Llena los textos de la plantilla'
      : plantilla.varsEncabezado > 0 && !extra.encabezado.trim() ? 'Llena el encabezado'
        : botonVar && !extra.boton.trim() ? 'Llena el enlace del botón'
          : !hayAQuien ? (modo === 'manual' ? 'Elige al menos un cliente' : 'Elige a quién enviarlo')
            : !aud?.aptos ? 'No hay contactos con ese filtro' : '';
  const n = Math.min(aud?.aptos || 0, limite);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const enviar = async () => {
    if (!plantilla || falta) return;
    if (!(await confirmar({
      titulo: `¿Enviar "${plantilla.nombre}" a ${n} contacto${n === 1 ? '' : 's'}?`,
      mensaje: `Sale con tu plantilla aprobada por Meta, de a pocos (unos 5 por minuto, de 8 a. m. a 8 p. m.) y con un máximo de ${p.cfg.topeDiario} al día. Nunca a quien pidió la baja ni a quien ya recibió remarketing esta semana${exCompraron ? ', ni a quien ya te compró' : ''}. Si Meta avisa límite o spam, se pausa sola.${aud?.importados ? ` ${aud.importados} son contactos importados: su chat aparece en el Inbox cuando se les envíe.` : ''}`,
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
        Solo se envían <b>plantillas tuyas aprobadas por Meta</b>. Elige a quién combinando filtros (anuncio por el que llegaron, estado del lead, estado del pedido, etiqueta) o busca y elige los clientes uno por uno.
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
                {media && (extra.media.startsWith('/api/media/') ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--df-border)', borderRadius: 8, padding: 6 }}>
                    {previa && tipoMedia === 'IMAGE' ? <img src={previa} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6 }} />
                      : <span style={{ fontSize: 22, width: 46, textAlign: 'center' }}>{tipoMedia === 'VIDEO' ? '🎬' : '📄'}</span>}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.mediaNombre || 'Archivo subido'}</span>
                    <button type="button" onClick={() => { setExtra({ ...extra, media: '', mediaNombre: '' }); setPrevia(''); }} style={{ ...btnS, padding: '4px 9px' }}>Quitar</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {subible && <SubirArchivo tipo={tipoMedia} texto={tipoMedia === 'IMAGE' ? '📷 Subir foto' : tipoMedia === 'VIDEO' ? '🎬 Subir video' : '📄 Subir PDF'}
                        onListo={(url, nombre, f) => { setExtra({ ...extra, media: url, mediaNombre: nombre }); setPrevia(tipoMedia === 'DOCUMENT' ? '' : URL.createObjectURL(f)); }} />}
                      <input value={extra.media} onChange={(e) => setExtra({ ...extra, media: e.target.value })} placeholder={`${subible ? 'o pega el enlace' : 'Enlace'} de ${tipoMedia === 'IMAGE' ? 'la foto' : tipoMedia === 'VIDEO' ? 'el video' : 'el documento'}`} style={inp} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 3 }}>
                      {tipoMedia === 'IMAGE' ? 'JPG o PNG, hasta 5 MB.' : tipoMedia === 'VIDEO' ? 'MP4, hasta 16 MB.' : 'PDF, hasta 15 MB.'} Si lo dejas vacío, sale el que registraste en Meta.
                    </div>
                  </div>
                ))}
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
              <label style={lbl}>3 · A quién</label>
              <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, padding: 2, gap: 2, marginBottom: 10 }}>
                {([['filtros', '🎯 Por filtros'], ['manual', '🔍 Elegir clientes']] as const).map(([m, t]) => (
                  <button key={m} type="button" onClick={() => setModo(m)}
                    style={{ border: 'none', borderRadius: 7, padding: '6px 12px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: modo === m ? 'var(--df-purple)' : 'transparent', color: modo === m ? '#fff' : 'var(--df-text-body)' }}>{t}</button>
                ))}
              </div>
            </div>

            {modo === 'filtros' ? (
              <>
                {grupos >= 2 && (
                  <div style={{ fontSize: 12.5, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>Combinar los filtros:</span>
                    <button type="button" onClick={() => setCombinar('todos')} style={chip(combinar === 'todos')}>Que cumplan todos (Y)</button>
                    <button type="button" onClick={() => setCombinar('alguno')} style={chip(combinar === 'alguno')}>Cualquiera (O)</button>
                  </div>
                )}

                <div>
                  <label style={lbl}>Fecha {fecha && <span style={{ color: 'var(--df-purple)' }}>· {textoFecha}</span>}</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Dropdown variant="pill" value={fechaCampo} onChange={(v) => setFechaCampo(v as 'llegada' | 'ultimo')} ariaLabel="Qué fecha"
                      options={[{ value: 'llegada', label: 'Llegaron (primer mensaje)' }, { value: 'ultimo', label: 'Su último mensaje' }]} />
                    {([['', 'Cualquier fecha'], ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['horas', 'Últimas horas'], ['rango', 'De tal día a tal día']] as const).map(([m, t]) => (
                      <button key={m || 'todas'} type="button" onClick={() => { setFechaModo(m); if (m === 'rango' && !desde && !hasta) { setDesde(hoyCO); setHasta(hoyCO); } }} style={chip(fechaModo === m)}>{t}</button>
                    ))}
                  </div>
                  {fechaModo === 'horas' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                      <span>En las últimas</span>
                      <input type="number" min={1} max={2160} value={horas} onChange={(e) => setHoras(Math.max(1, Math.min(2160, Math.round(Number(e.target.value) || 1))))} style={{ ...inp, width: 80 }} />
                      <span>horas</span>
                      {[6, 12, 24, 48, 72].map((h) => <button key={h} type="button" onClick={() => setHoras(h)} style={{ ...chip(horas === h), padding: '4px 9px' }}>{h} h</button>)}
                    </div>
                  )}
                  {fechaModo === 'rango' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                      <span>Del</span>
                      <input type="date" value={desde} max={hasta || hoyCO} onChange={(e) => setDesde(e.target.value)} style={{ ...inp, width: 150 }} />
                      <span>al</span>
                      <input type="date" value={hasta} min={desde || undefined} max={hoyCO} onChange={(e) => setHasta(e.target.value)} style={{ ...inp, width: 150 }} />
                    </div>
                  )}
                  {fecha && fechaCampo === 'ultimo' && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 4 }}>Los contactos importados que nunca han escrito no entran con esta fecha.</div>}
                </div>

                <div>
                  <label style={lbl}>Llegaron por el anuncio {anuncios.length > 0 && <span style={{ color: 'var(--df-purple)' }}>· {anuncios.length} elegido{anuncios.length === 1 ? '' : 's'}</span>}</label>
                  {p.anuncios.length ? (
                    <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
                      {p.anuncios.length > 6 && (
                        <input value={buscaAd} onChange={(e) => setBuscaAd(e.target.value)} placeholder="Buscar anuncio o campaña…" style={{ ...inp, border: 'none', borderBottom: '1px solid var(--df-border)', borderRadius: 0 }} />
                      )}
                      <div style={{ maxHeight: 190, overflowY: 'auto' }}>
                        {adsVisibles.map((a) => (
                          <label key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--df-border)', fontSize: 12.5, cursor: 'pointer', background: anuncios.includes(a.id) ? 'var(--df-purple-subtle, rgba(124,58,237,.08))' : 'transparent' }}>
                            <input type="checkbox" checked={anuncios.includes(a.id)} onChange={() => setAnuncios(toggle(anuncios, a.id))} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.id === 'organico' ? '🌱 ' : '📣 '}{a.nombre}</span>
                              {a.campana && <span style={{ color: 'var(--df-text-muted)', fontSize: 11.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.campana}</span>}
                            </span>
                            <span style={{ color: 'var(--df-text-muted)', whiteSpace: 'nowrap' }}>{a.chats.toLocaleString('es-CO')} chats</span>
                          </label>
                        ))}
                        {!adsVisibles.length && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--df-text-faint)' }}>Ningún anuncio con ese nombre.</div>}
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Todavía no han llegado chats por anuncios.</div>}
                </div>

                <div>
                  <label style={lbl}>Estado del lead</label>
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
                  <label style={lbl}>Estado de su último pedido</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ESTADOS_PEDIDO.map(([id, t]) => <button key={id} type="button" onClick={() => setEstadosPedido(toggle(estadosPedido, id))} style={chip(estadosPedido.includes(id))}>{t}</button>)}
                  </div>
                </div>

                <div>
                  <label style={lbl}>Etiqueta</label>
                  {p.etiquetas.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.etiquetas.map((e) => <button key={e.etiqueta} type="button" onClick={() => setEtiquetas(toggle(etiquetas, e.etiqueta))} style={chip(etiquetas.includes(e.etiqueta))}>🏷️ {e.etiqueta} <span style={{ color: 'var(--df-text-muted)' }}>{e.n}</span></button>)}
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Ponle una etiqueta a los chats en el Inbox o importa contactos con una etiqueta (arriba) para elegirlos aquí.</div>}
                </div>

                {(grupos > 0 || fecha) && (
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>
                      {grupos >= 2 ? (combinar === 'todos' ? 'Les llega a quienes cumplen todos los filtros a la vez.' : 'Les llega a quienes cumplen al menos uno (sin repetir a nadie).') : grupos === 1 ? 'Dentro de un mismo filtro basta con una de las opciones.' : `Les llega a todos los que ${textoFecha}.`}
                      {grupos > 0 && fecha ? ` Y además ${textoFecha}.` : ''}
                    </span>
                    <button type="button" onClick={limpiarFiltros} style={{ ...btnS, padding: '3px 8px' }}>Limpiar filtros</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nombre o celular…" width="100%" />
                {busca.trim().length >= 2 && (
                  <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
                    {resultados.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--df-bg)', borderBottom: '1px solid var(--df-border)', fontSize: 12 }}>
                        <span style={{ color: 'var(--df-text-muted)' }}>{resultados.length}{resultados.length >= 40 ? '+' : ''} encontrados</span>
                        <button type="button" onClick={() => agregar(resultados)} style={{ ...btnS, padding: '3px 8px' }}>＋ Agregar todos</button>
                      </div>
                    )}
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {buscando && !resultados.length && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--df-text-faint)' }}>Buscando…</div>}
                      {!buscando && !resultados.length && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--df-text-faint)' }}>No hay clientes con ese nombre o celular.</div>}
                      {resultados.map((d) => {
                        const ya = elegidos.some((x) => x.clave === d.clave);
                        return (
                          <div key={d.clave} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--df-border)', fontSize: 12.5, opacity: d.excluido ? 0.6 : 1 }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b>{d.nombre || d.tel}</b> <span style={{ color: 'var(--df-text-faint)' }}>{d.nombre ? d.tel : ''}</span>
                              {(d.detalle || d.excluido) && <span style={{ display: 'block', fontSize: 11.5, color: d.excluido ? '#B45309' : 'var(--df-text-muted)' }}>{d.excluido || d.detalle}</span>}
                            </span>
                            <button type="button" onClick={() => (ya ? quitar(d.clave) : agregar([d]))} style={{ ...btnS, padding: '3px 9px', ...(ya ? { background: 'var(--df-brand)', color: '#fff', borderColor: 'var(--df-purple)' } : {}) }}>{ya ? '✓ Elegido' : '＋'}</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label style={lbl}>Elegidos ({elegidos.length})</label>
                  {elegidos.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {elegidos.map((d) => (
                        <span key={d.clave} title={d.excluido || d.detalle} style={{ ...chip(true), cursor: 'default', display: 'inline-flex', gap: 6, alignItems: 'center', opacity: d.excluido ? 0.6 : 1 }}>
                          {d.nombre || d.tel}
                          <button type="button" onClick={() => quitar(d.clave)} aria-label={`Quitar a ${d.nombre || d.tel}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--df-text-muted)' }}>✕</button>
                        </span>
                      ))}
                      <button type="button" onClick={() => setElegidos([])} style={{ ...btnS, padding: '3px 8px' }}>Quitar todos</button>
                    </div>
                  ) : <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Busca arriba y toca ＋ para agregar cada cliente.</div>}
                </div>
              </div>
            )}
            <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--df-bg)' }}>
              <label style={{ ...lbl, marginBottom: 0 }}>🚫 Excluir {nExcluir > 0 && <span style={{ color: 'var(--df-purple)' }}>· {nExcluir} regla{nExcluir === 1 ? '' : 's'}</span>}</label>
              <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: -6 }}>Aunque cumplan los filtros (o los elijas a mano), a estos no les llega.</div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}>
                <input type="checkbox" checked={exCompraron} onChange={(e) => setExCompraron(e.target.checked)} />
                <b>Quienes ya me compraron</b>
                {exCompraron && (
                  <Dropdown variant="pill" value={String(exDias)} onChange={(v) => setExDias(Number(v))} ariaLabel="Desde cuándo"
                    options={[{ value: '0', label: 'Cualquier compra' }, { value: '30', label: 'Compraron en los últimos 30 días' }, { value: '60', label: 'Últimos 60 días' }, { value: '90', label: 'Últimos 90 días' }, { value: '180', label: 'Últimos 6 meses' }]} />
                )}
              </label>
              {exCompraron && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: -6 }}>Cuenta cualquier pedido que no se canceló ni se devolvió (también los que van en camino).</div>}
              {p.etiquetas.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Con la etiqueta</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.etiquetas.map((e) => <button key={e.etiqueta} type="button" onClick={() => setExEtiquetas(toggle(exEtiquetas, e.etiqueta))} style={{ ...chip(exEtiquetas.includes(e.etiqueta)), ...(exEtiquetas.includes(e.etiqueta) ? { borderColor: '#B45309', background: 'rgba(245,158,11,.12)' } : {}) }}>🚫 {e.etiqueta}</button>)}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Clientes puntuales</div>
                <SearchInput value={exBusca} onChange={setExBusca} placeholder="Buscar por nombre o celular para excluirlo…" width="100%" />
                {exBusca.trim().length >= 2 && (
                  <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, maxHeight: 170, overflowY: 'auto', marginTop: 6, background: 'var(--df-surface)' }}>
                    {!exResultados.length && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--df-text-faint)' }}>Nadie con ese nombre o celular.</div>}
                    {exResultados.map((d) => {
                      const ya = exClientes.some((x) => x.clave === d.clave);
                      return (
                        <div key={d.clave} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--df-border)', fontSize: 12.5 }}>
                          <span style={{ flex: 1, minWidth: 0 }}><b>{d.nombre || d.tel}</b> <span style={{ color: 'var(--df-text-faint)' }}>{d.nombre ? d.tel : ''}</span></span>
                          <button type="button" onClick={() => setExClientes((xs) => (ya ? xs.filter((x) => x.clave !== d.clave) : [...xs, d]))} style={{ ...btnS, padding: '3px 9px', ...(ya ? { background: '#B45309', color: '#fff', borderColor: '#B45309' } : {}) }}>{ya ? '✓ Excluido' : 'Excluir'}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {exClientes.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {exClientes.map((d) => (
                      <span key={d.clave} style={{ ...chip(true), borderColor: '#B45309', background: 'rgba(245,158,11,.12)', cursor: 'default', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        🚫 {d.nombre || d.tel}
                        <button type="button" onClick={() => setExClientes((xs) => xs.filter((x) => x.clave !== d.clave))} aria-label={`Volver a incluir a ${d.nombre || d.tel}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--df-text-muted)' }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                    <span style={{ flex: 1, color: 'var(--df-text-muted)' }}>{d.origen === 'importado' && modo !== 'manual' ? '📇 ' : ''}{modo === 'manual' ? d.detalle : d.motivo}</span>
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
                {media && (previa && tipoMedia === 'IMAGE' ? <img src={previa} alt="" style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 7, marginBottom: 6 }} />
                  : previa && tipoMedia === 'VIDEO' ? <video src={previa} muted style={{ display: 'block', width: '100%', maxHeight: 260, borderRadius: 7, marginBottom: 6 }} />
                    : /^https?:\/\//.test(extra.media) && tipoMedia === 'IMAGE' ? <img src={extra.media} alt="" style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 7, marginBottom: 6 }} />
                      : <div style={{ fontSize: 11.5, color: '#54656F', marginBottom: 4 }}>[{tipoMedia === 'IMAGE' ? 'foto' : tipoMedia === 'VIDEO' ? 'video' : 'documento'}{extra.mediaNombre ? `: ${extra.mediaNombre}` : ''}]</div>)}
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
