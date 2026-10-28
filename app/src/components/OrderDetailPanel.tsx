import { OrigenBadge } from './OrigenPedido';
import { NovedadCard } from './Novedades';
import { DevolucionEffi, RastreoGuia } from './EnvioEffi';
import { useState, useEffect } from 'react';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { Dropdown } from './Dropdown';
import { OrdenarDireccion } from './DireccionPedido';
import { HistorialClienteCard } from './HistorialCliente';
import { confirmar, pedirTexto, notificar } from './dialogs';
import { enProceso, ProcesoPedido } from './Proceso';
import { apiEffiAnular, apiShopifyReenviarConfirmacion, apiGuiaManual, apiEffiConveniosConocidos, apiVariantesFaltantes, apiCorregirVariante, type VarianteFaltante } from '../lib/api';
import { apiDropiCotizar, apiDropiCrear, apiEffiPreview, apiEffiDespachar, apiEffiOpcionesGuia, apiEffiGuia, apiGuiaDocumento, apiGuiaEnviar, type DropiTransportadora, type EffiPreview, type OpcionesGuia, type DatosGuia } from '../lib/api';

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-CO');

/**
 * Despacho por la API directa de Dropi: cotiza las transportadoras para el
 * destino del pedido, el operador elige una (o deja que Dropi decida) y se crea
 * la orden en Dropi con la elegida.
 */
export function DropiDespacho({ df, sel, onHecho }: { df: DealFlowState; sel: DecoratedOrder; onHecho?: () => void }) {
  const [paso, setPaso] = useState<'idle' | 'cargando' | 'elegir' | 'creando'>('idle');
  const [ciudad, setCiudad] = useState('');
  const [disponibles, setDisponibles] = useState<DropiTransportadora[]>([]);
  const [noDisp, setNoDisp] = useState<{ nombre: string; motivo: string }[]>([]);
  const [elegida, setElegida] = useState<DropiTransportadora | null>(null);
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState('');
  const [recaudo, setRecaudo] = useState<'con' | 'sin'>('con');

  const cotizar = () => {
    if (!sel.rowId) return;
    setPaso('cargando'); setMsg('');
    void enProceso('Cotizando transportadoras en Dropi…', () => apiDropiCotizar(sel.rowId!, recaudo), 'pedido').then((r) => {
      if (r.error || !r.data) { setPaso('idle'); setMsg(r.error || 'No pudimos cotizar.'); return; }
      setCiudad(r.data.ciudad); setDisponibles(r.data.disponibles); setNoDisp(r.data.noDisponibles);
      setElegida(r.data.disponibles[0] || null); setAuto(false);
      setPaso('elegir'); setMsg('');
    });
  };
  const crear = () => {
    if (!sel.rowId) return;
    setPaso('creando'); setMsg('');
    void enProceso('Creando la orden en Dropi…', () => apiDropiCrear(sel.rowId!, auto ? undefined : (elegida || undefined), false, recaudo), 'pedido').then((r) => {
      if (r.error || !r.data) { setPaso('elegir'); setMsg(r.error || 'No pudimos crear la orden.'); return; }
      df.marcarDropiCreado(sel.id, r.data.dropiId, r.data.transportadora || (auto ? '' : elegida?.nombre || ''));
      setMsg(''); onHecho?.();
    });
  };

  const btnP: React.CSSProperties = { background: 'var(--df-warning)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' };

  if (paso === 'idle' || paso === 'cargando') {
    return (
      <div>
        {/* Recaudo: contra entrega (Dropi cobra al entregar) vs prepagado (ya pagó). */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
          {(['con', 'sin'] as const).map((r) => (
            <button key={r} onClick={() => setRecaudo(r)} style={{
              background: recaudo === r ? 'var(--df-warning)' : 'var(--df-surface)', color: recaudo === r ? '#fff' : 'var(--df-warning)',
              border: '1px solid var(--df-warning)', borderRadius: 7, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>{r === 'con' ? 'Con recaudo (contra entrega)' : 'Sin recaudo (pagado)'}</button>
          ))}
        </div>
        <button onClick={cotizar} disabled={paso === 'cargando'} style={{ ...btnP, opacity: paso === 'cargando' ? 0.7 : 1 }}>
          {paso === 'cargando' ? 'Cotizando…' : '📦 Generar en Dropi'}
        </button>
        {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>Transportadoras para <b>{ciudad || 'el destino'}</b> — elige una:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {disponibles.map((t) => {
          const on = !auto && elegida?.id === t.id && elegida?.service === t.service;
          return (
            <button key={`${t.id}-${t.service}`} onClick={() => { setElegida(t); setAuto(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'var(--df-warning-subtle)' : 'var(--df-surface)', border: `1px solid ${on ? 'var(--df-warning)' : 'var(--df-border)'}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
              <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${on ? 'var(--df-warning)' : 'var(--df-border)'}`, background: on ? 'var(--df-warning)' : 'transparent', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t.nombre}{t.service && t.service !== 'normal' ? ` · ${t.service}` : ''}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{pesos(t.precio)}</span>
            </button>
          );
        })}
        <button onClick={() => setAuto(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: auto ? 'var(--df-warning-subtle)' : 'var(--df-surface)', border: `1px solid ${auto ? 'var(--df-warning)' : 'var(--df-border)'}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
          <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${auto ? 'var(--df-warning)' : 'var(--df-border)'}`, background: auto ? 'var(--df-warning)' : 'transparent', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Que Dropi elija (automático)</span>
        </button>
      </div>
      {!!noDisp.length && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--df-text-faint)' }}>
          Sin cobertura: {noDisp.map((n) => n.nombre).join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={crear} disabled={paso === 'creando' || (!auto && !elegida)} style={{ ...btnP, opacity: paso === 'creando' || (!auto && !elegida) ? 0.6 : 1 }}>
          {paso === 'creando' ? 'Creando…' : 'Crear en Dropi'}
        </button>
        <button onClick={() => { setPaso('idle'); setMsg(''); }} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-muted)', cursor: 'pointer' }}>Cancelar</button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}

const tarjetaProv = (activo: boolean, disponible: boolean): React.CSSProperties => ({
  flex: 1, minWidth: 0, textAlign: 'left', cursor: disponible ? 'pointer' : 'default', fontFamily: 'inherit',
  border: '1.5px solid ' + (activo ? 'var(--df-purple)' : 'var(--df-border)'), borderRadius: 12, padding: '12px 12px 11px',
  background: activo ? 'var(--df-purple-subtle)' : 'var(--df-surface)', opacity: disponible ? 1 : 0.55,
  boxShadow: activo ? '0 6px 18px -10px rgba(124,58,237,.6)' : 'none', transition: 'border-color .15s, background .15s',
  display: 'flex', flexDirection: 'column', gap: 6,
});
const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, color: fg, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' });
const btnP: React.CSSProperties = { width: '100%', background: 'var(--df-purple)', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5, color: '#fff', cursor: 'pointer' };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-text-body)', cursor: 'pointer', whiteSpace: 'nowrap' };

/** Effi por API: revisar lo que se va a enviar y crear la remisión (+ guía). */
function EffiApiDespacho({ df, sel, reintentar, onHecho }: { df: DealFlowState; sel: DecoratedOrder; reintentar: boolean; onHecho: () => void }) {
  const [paso, setPaso] = useState<'idle' | 'revisando' | 'listo' | 'enviando'>('idle');
  const [prev, setPrev] = useState<EffiPreview | null>(null);
  const [msg, setMsg] = useState('');
  const guiaAuto = !!df.effiApi.guia?.activa;
  // Guía en el MISMO paso: se elige la transportadora aquí y, al confirmar, se crea
  // la remisión y enseguida la guía (si la guía automática está apagada).
  const g = useGuiaEffi();
  const [conGuia, setConGuia] = useState(true);
  // Convenio para ESTE envío: '' = automático, 'propio' = sin convenio, o un código.
  const [convenio, setConvenio] = useState('');
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => { void apiEffiConveniosConocidos().then((r) => r.data && setConvenios(r.data.convenios)); }, []);
  const revisar = async (conv = convenio) => {
    if (!sel.rowId) return;
    void apiEffiConveniosConocidos().then((r) => r.data && setConvenios(r.data.convenios)); // por si agregaste uno nuevo
    setPaso('revisando'); setMsg('');
    if (!guiaAuto) void g.cargar();
    const r = await enProceso('Preparando el envío a Effi…', () => apiEffiPreview(sel.rowId!, conv), 'pedido');
    if (r.error || !r.data) { setPaso('idle'); setMsg(r.error || 'No pudimos preparar el envío.'); return; }
    setPrev(r.data); setPaso('listo');
  };
  const hacerGuia = !guiaAuto && conGuia;
  const enviar = async () => {
    if (!sel.rowId) return;
    if (hacerGuia && !g.listo) { setMsg('Elige transportadora, servicio, pago del flete y remitente (o desmarca "Crear también la guía").'); return; }
    setPaso('enviando'); setMsg('');
    // Todo el despacho en la ventana de "procesando": nadie puede tocar nada a mitad.
    const ok = await enProceso('Creando la remisión en Effi…', async (paso) => {
      const r = await apiEffiDespachar(sel.rowId!, reintentar, convenio);
      if (r.error || !r.data) { setPaso('listo'); setMsg(r.error || 'Effi no creó la remisión.'); return false; }
      let texto = `✓ Remisión ${r.data.remision} creada en Effi${r.data.guia ? ` · guía ${r.data.guia}` : ''}.${r.data.avisos?.length ? ' ' + r.data.avisos.join(' ') : ''}`;
      if (hacerGuia && !r.data.guia) {
        paso('Generando la guía de transporte…');
        const rg = await apiEffiGuia(sel.rowId!, g.d);
        texto += rg.error || !rg.data
          ? ` ⚠ La guía no se pudo crear: ${rg.error || 'Effi no respondió'}. Puedes intentarlo de nuevo abajo con "Generar guía en Effi".`
          : ` ✓ Guía ${rg.data.guia || rg.data.idTransaccion} creada${rg.data.transportadora ? ` con ${rg.data.transportadora}` : ''}.`;
      }
      setMsg(texto);
      paso('Actualizando el pedido…');
      await df.refrescarPedidos();
      return true;
    }, 'pedido');
    if (ok) onHecho();
  };
  const selectorConvenio = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Convenio:</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <Dropdown
          ariaLabel="Convenio para este envío"
          value={convenio}
          onChange={(v) => { setConvenio(v); if (paso === 'listo' || msg) void revisar(v); }}
          options={[
            { value: '', label: 'Automático (el de cada producto)' },
            { value: 'propio', label: 'Mercancía propia (sin convenio)' },
            ...convenios.map((c) => ({ value: c.id, label: `${c.nombre} · ${c.id}` })),
          ]}
        />
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {selectorConvenio}
      {paso === 'idle' || paso === 'revisando' ? (
        <button onClick={() => void revisar()} disabled={paso === 'revisando'} style={{ ...btnP, opacity: paso === 'revisando' ? 0.7 : 1 }}>
          {paso === 'revisando' ? 'Preparando…' : reintentar ? 'Revisar y crear otra remisión' : 'Revisar envío a Effi →'}
        </button>
      ) : prev && (
        <div className="df-expand" style={{ border: '1px solid var(--df-purple-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', background: 'var(--df-purple-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--df-purple)', display: 'flex', gap: 8 }}>
            <span>📍 {prev.ubicacion}</span><span style={{ marginLeft: 'auto' }}>{pesos(prev.total)}</span>
          </div>
          {prev.lineas.map((l, i) => (
            <div key={i} style={{ padding: '9px 12px', borderTop: '1px solid var(--df-border)', fontSize: 12.5 }}>
              <div style={{ fontWeight: 700 }}>{l.item}</div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 11.5, marginTop: 2 }}>→ {l.articulo}</div>
            </div>
          ))}
          {prev.avisos.map((a, i) => <div key={i} style={{ padding: '8px 12px', borderTop: '1px solid var(--df-border)', fontSize: 12, color: 'var(--df-warning)', background: 'var(--df-warning-subtle-2)' }}>⚠ {a}</div>)}
          {!guiaAuto && (
            <div style={{ padding: 12, borderTop: '1px solid var(--df-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={conGuia} onChange={(e) => setConGuia(e.target.checked)} /> 🚚 Crear también la guía de transporte
              </label>
              {conGuia && <CamposGuia g={g} items={sel.items} />}
            </div>
          )}
          <div style={{ padding: 12, borderTop: '1px solid var(--df-border)', display: 'flex', gap: 8 }}>
            <button onClick={() => { setPaso('idle'); setPrev(null); }} style={btnS}>Atrás</button>
            <button onClick={enviar} disabled={paso === 'enviando' || (hacerGuia && !g.listo)} style={{ ...btnP, flex: 1, opacity: paso === 'enviando' || (hacerGuia && !g.listo) ? 0.6 : 1 }}>
              {paso === 'enviando' ? 'Enviando…' : guiaAuto || hacerGuia ? 'Crear remisión y guía' : 'Crear solo la remisión'}
            </button>
          </div>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', lineHeight: 1.45 }}>
        Cliente en Effi: cédula = celular {sel.tel ? <b>{String(sel.tel).replace(/\D/g, '').slice(-10)}</b> : ''}. {guiaAuto ? 'La guía se crea sola con la transportadora configurada.' : 'La guía la eliges y creas aquí mismo, al revisar el envío.'}
      </div>
      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
      {/no tiene la variante|No pudimos emparejar/.test(msg) && <CorregirVariantes key={msg} df={df} sel={sel} onListo={() => void revisar()} />}
    </div>
  );
}

/** Pasos del envío para el pedido ya despachado. */
/**
 * El pedido trae una talla/color que el producto no tiene (p. ej. "Naranja"): un selector
 * por cada ítem para elegir la variante correcta ahí mismo, sin entrar a Editar.
 */
function CorregirVariantes({ df, sel, onListo }: { df: DealFlowState; sel: DecoratedOrder; onListo: () => void }) {
  const [faltan, setFaltan] = useState<VarianteFaltante[] | null>(null);
  const [elegida, setElegida] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (sel.rowId) void apiVariantesFaltantes(String(sel.rowId)).then((r) => r.data && setFaltan(r.data.faltan)); }, [sel.rowId]);
  if (!faltan || !faltan.length) return null;
  const listos = faltan.filter((f) => elegida[f.itemId]).length;
  const guardar = async () => {
    setGuardando(true); setMsg('');
    await enProceso('Corrigiendo las variantes del pedido…', async () => {
    for (const f of faltan) {
      if (!elegida[f.itemId]) continue;
      const r = await apiCorregirVariante(String(sel.rowId), f.itemId, elegida[f.itemId]);
      if (r.error) { setGuardando(false); setMsg(r.error); return; }
    }
    setGuardando(false);
    await df.refrescarPedidos();
    const r = await apiVariantesFaltantes(String(sel.rowId));
    setFaltan(r.data?.faltan || []); setElegida({});
    if (!(r.data?.faltan || []).length) onListo();
    }, 'pedido');
  };
  return (
    <div style={{ border: '1px solid var(--df-warning-border, var(--df-border))', background: 'var(--df-warning-subtle)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, lineHeight: 1.45 }}><b>🧩 Corrige la talla o el color</b> — estos productos del pedido piden una variante que no existe. Elige la correcta (pregúntale al cliente si hace falta):</div>
      {faltan.map((f) => (
        <div key={f.itemId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, minWidth: 160, flex: '1 1 160px' }}>{f.qty}× <s style={{ color: 'var(--df-text-muted)' }}>{f.nombre}</s></span>
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            {f.opciones.length
              ? <Dropdown ariaLabel={`Variante correcta de ${f.nombre}`} placeholder="Elige la variante…" buscar value={elegida[f.itemId] || ''} onChange={(v) => setElegida((m) => ({ ...m, [f.itemId]: v }))} options={f.opciones.map((o) => ({ value: o.variantId, label: o.label }))} />
              : <span style={{ fontSize: 12, color: 'var(--df-danger)' }}>No encontramos el producto: corrígelo con ✏️ Editar.</span>}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => void guardar()} disabled={guardando || !listos} style={{ ...btnP, opacity: guardando || !listos ? 0.6 : 1 }}>{guardando ? 'Guardando…' : `Guardar ${listos ? `(${listos})` : ''} y volver a revisar`}</button>
        {msg && <span style={{ fontSize: 12, color: 'var(--df-danger)' }}>{msg}</span>}
      </div>
    </div>
  );
}

/** Plan B: pegar a mano el número de guía (p.ej. Dropi la generó pero no la devolvió por la API). */
function GuiaManual({ df, sel, destacar, proveedor = 'Dropi' }: { df: DealFlowState; sel: DecoratedOrder; destacar: boolean; proveedor?: string }) {
  const [abierto, setAbierto] = useState(destacar);
  const [guia, setGuia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const guardar = async () => {
    if (!sel.rowId || !guia.trim()) return;
    setEnviando(true); setMsg('');
    const r = await apiGuiaManual(String(sel.rowId), guia.trim());
    setEnviando(false);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo guardar.'); return; }
    setMsg(`✓ Guía ${r.data.guia} guardada. ${r.data.aviso}`);
    await df.refrescarPedidos();
  };
  if (!abierto) return <button onClick={() => setAbierto(true)} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: 'var(--df-text-muted)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>¿Ya tienes el número de guía? Ponlo a mano</button>;
  return (
    <div style={{ marginTop: 12, background: destacar ? 'var(--df-warning-subtle)' : 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 8 }}>{destacar ? <><b>{proveedor} dice que la guía ya está generada</b>, pero no nos llegó el número. Cópialo de {proveedor} y pégalo aquí: se guarda y se le envía al cliente por WhatsApp.</> : `Pega el número de guía que te dio ${proveedor}: se guarda y se le envía al cliente por WhatsApp.`}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Número de guía" style={{ flex: 1, minWidth: 160, border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
        <button onClick={() => void guardar()} disabled={enviando || !guia.trim()} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: enviando || !guia.trim() ? 0.6 : 1 }}>{enviando ? 'Guardando…' : 'Guardar y enviar al cliente'}</button>
      </div>
      {msg && <div style={{ marginTop: 7, fontSize: 12, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}

function PasosEnvio({ sel }: { sel: DecoratedOrder }) {
  const hecho = [true, !!sel.hasGuia, ['En tránsito', 'En reparto', 'Novedad', 'Entregado'].includes(sel.estado) && !!sel.hasGuia, sel.estado === 'Entregado'];
  const nombres = [sel.despachoProveedor === 'dropi' ? 'Orden creada' : 'Remisión creada', 'Guía generada', 'En camino', 'Entregado'];
  const cancelado = sel.estado === 'Cancelado';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      {nombres.map((n, i) => (
        <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          {i > 0 && <span style={{ position: 'absolute', top: 9, right: '50%', width: '100%', height: 2, background: hecho[i] ? 'var(--df-purple)' : 'var(--df-border)' }} />}
          <span style={{ position: 'relative', width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: cancelado && i > 0 && !hecho[i] ? 'var(--df-danger-subtle)' : hecho[i] ? 'var(--df-purple)' : 'var(--df-surface-2)', color: hecho[i] ? '#fff' : 'var(--df-text-faint)', border: hecho[i] ? 'none' : '1px solid var(--df-border)' }}>{hecho[i] ? '✓' : i + 1}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: hecho[i] ? 'var(--df-text-strong)' : 'var(--df-text-faint)', marginTop: 5, textAlign: 'center', lineHeight: 1.2 }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Carga las transportadoras/remitentes de Effi y los valores por defecto de la tienda. */
function useGuiaEffi() {
  const [ops, setOps] = useState<OpcionesGuia | null>(null);
  const [d, setD] = useState<DatosGuia>({ transportadora: '', servicio: '', formaPagoFlete: '', remitente: '', cantPaquetes: 1, peso: 1, volumen: 1, alto: 10, ancho: 10, largo: 10, contenido: '', valorDeclarado: 0, nota: '', recibeSabado: true });
  const [cargaMsg, setCargaMsg] = useState('');
  const cargar = async () => {
    if (ops) return;
    setCargaMsg('Cargando transportadoras de Effi…');
    const r = await apiEffiOpcionesGuia();
    if (r.error || !r.data) { setCargaMsg(r.error || 'No se pudieron cargar las transportadoras.'); return; }
    setCargaMsg('');
    setOps(r.data);
    const g = r.data.defaults;
    setD((x) => ({ ...x, transportadora: g.transportadora || '', servicio: g.servicio || '', formaPagoFlete: g.formaPagoFlete || '', remitente: g.remitente || (r.data!.remitentes[0]?.id ?? ''), peso: g.peso || 1, volumen: g.volumen || 1, alto: g.alto || 10, ancho: g.ancho || 10, largo: g.largo || 10 }));
  };
  const listo = !!(d.transportadora && d.servicio && d.formaPagoFlete && d.remitente);
  return { ops, d, setD, cargar, cargaMsg, listo };
}

/**
 * Contenido abreviado del paquete a partir de los productos del pedido, para la guía:
 * "2 Blusa Verona, 1 Jogger Jaspeado" (sin tallas ni colores, sumando las variantes).
 */
function contenidoDeItems(items: { qty: number; nombre: string }[]): string {
  const grupos = new Map<string, number>();
  for (const it of items) {
    const base = it.nombre.replace(/\s*\(.*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim() || it.nombre;
    const corto = base.split(' ').slice(0, 3).join(' ');
    grupos.set(corto, (grupos.get(corto) || 0) + (Number(it.qty) || 1));
  }
  let t = [...grupos].map(([n, q]) => `${q} ${n}`).join(', ');
  if (t.length > 80) t = [...grupos].map(([n, q]) => `${q} ${n.split(' ')[0]}`).join(', ');
  return t.slice(0, 80);
}

/** Campos de la guía (transportadora, servicio, paquete…). */
function CamposGuia({ g, items = [] }: { g: ReturnType<typeof useGuiaEffi>; items?: { qty: number; nombre: string }[] }) {
  const { ops, d, setD } = g;
  if (!ops) return g.cargaMsg ? <div style={{ fontSize: 12.5, color: g.cargaMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{g.cargaMsg}</div> : null;
  const set = (p: Partial<DatosGuia>) => setD((x) => ({ ...x, ...p }));
  const t = ops.transportadoras.find((x) => x.id === d.transportadora);
  const sel_: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 9px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
  const lb: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 4 };
  return (
    <>
      {/* Una debajo de la otra: los nombres de servicio y pago son largos y en dos columnas se cortaban. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <div><label style={lb}>Transportadora</label>
          <Dropdown ariaLabel="Transportadora" placeholder="Elige…" value={d.transportadora} onChange={(v) => set({ transportadora: v, servicio: '', formaPagoFlete: '' })} options={ops.transportadoras.map((x) => ({ value: x.id, label: x.effi ? `${x.nombre} (Effi)` : x.nombre }))} /></div>
        <div><label style={lb}>Servicio</label>
          <Dropdown ariaLabel="Servicio" placeholder="Elige…" value={d.servicio} onChange={(v) => set({ servicio: v })} options={(t?.servicios || []).map((x) => ({ value: x.id, label: x.nombre }))} /></div>
        <div><label style={lb}>Pago del flete</label>
          <Dropdown ariaLabel="Pago del flete" placeholder="Elige…" value={d.formaPagoFlete} onChange={(v) => set({ formaPagoFlete: v })} options={(t?.formasPago || []).map((x) => ({ value: x.id, label: x.nombre }))} /></div>
        <div><label style={lb}>Remitente</label>
          <Dropdown ariaLabel="Remitente" placeholder="Elige…" value={d.remitente} onChange={(v) => set({ remitente: v })} options={ops.remitentes.map((x) => ({ value: x.id, label: x.nombre }))} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div><label style={lb}>Paquetes</label><input type="number" min={1} value={d.cantPaquetes} onChange={(e) => set({ cantPaquetes: Number(e.target.value) })} style={sel_} /></div>
        <div><label style={lb}>Peso (kg)</label><input type="number" min={0.1} step={0.1} value={d.peso} onChange={(e) => set({ peso: Number(e.target.value) })} style={sel_} /></div>
        <div><label style={lb}>Peso vol. (kg)</label><input type="number" min={0.1} step={0.1} value={d.volumen} onChange={(e) => set({ volumen: Number(e.target.value) })} style={sel_} /></div>
        <div><label style={lb}>Alto (cm)</label><input type="number" min={1} value={d.alto} onChange={(e) => set({ alto: Number(e.target.value) })} style={sel_} /></div>
        <div><label style={lb}>Ancho (cm)</label><input type="number" min={1} value={d.ancho} onChange={(e) => set({ ancho: Number(e.target.value) })} style={sel_} /></div>
        <div><label style={lb}>Largo (cm)</label><input type="number" min={1} value={d.largo} onChange={(e) => set({ largo: Number(e.target.value) })} style={sel_} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={lb}>Contenido (opcional)</label><input value={d.contenido} onChange={(e) => set({ contenido: e.target.value })} placeholder="Se copia de la remisión" style={sel_} />
          {items.length > 0 && <button type="button" onClick={() => set({ contenido: contenidoDeItems(items) })} title={contenidoDeItems(items)}
            style={{ marginTop: 5, background: 'none', border: '1px dashed var(--df-purple-border, var(--df-border))', borderRadius: 7, padding: '4px 8px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--df-purple)', cursor: 'pointer' }}>📋 Copiar de los artículos</button>}
        </div>
        <div><label style={lb}>Valor declarado (opcional)</label><input type="number" min={0} value={d.valorDeclarado || ''} onChange={(e) => set({ valorDeclarado: Number(e.target.value) })} placeholder="Del total de la remisión" style={sel_} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={lb}>Nota en la guía (opcional)</label><input value={d.nota} onChange={(e) => set({ nota: e.target.value })} placeholder="Ej: llamar antes de entregar" style={sel_} /></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={d.recibeSabado} onChange={(e) => set({ recibeSabado: e.target.checked })} /> Recibe los sábados
      </label>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>El recaudo contra entrega se toma del saldo de la remisión. La dirección es la del pedido.</div>
    </>
  );
}

/** Formulario para generar la guía en Effi desde DealFlow (sobre la remisión del pedido ya creada). */
function GuiaEffiForm({ df, sel }: { df: DealFlowState; sel: DecoratedOrder }) {
  const [abierto, setAbierto] = useState(false);
  const g = useGuiaEffi();
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const abrir = () => { setAbierto(true); void g.cargar(); };
  const crear = async () => {
    if (!sel.rowId || !g.listo) return;
    setEnviando(true); setMsg('');
    const r = await enProceso('Generando la guía de transporte…', () => apiEffiGuia(sel.rowId!, g.d), 'pedido');
    setEnviando(false);
    if (r.error || !r.data) { setMsg(r.error || 'Effi no creó la guía.'); return; }
    setMsg(`✓ Guía ${r.data.guia || r.data.idTransaccion} creada${r.data.transportadora ? ` con ${r.data.transportadora}` : ''}.`);
    await df.refrescarPedidos();
  };
  if (!abierto) return <button onClick={abrir} style={{ ...btnP, marginTop: 12 }}>🚚 Generar guía en Effi</button>;
  return (
    <div className="df-expand" style={{ marginTop: 12, border: '1px solid var(--df-purple-border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ fontSize: 13.5, flex: 1 }}>Guía de transporte</b>
        <button onClick={() => setAbierto(false)} style={{ ...btnS, padding: '5px 10px' }}>Cerrar</button>
      </div>
      <CamposGuia g={g} items={sel.items} />
      {g.ops && <button onClick={crear} disabled={!g.listo || enviando} style={{ ...btnP, opacity: !g.listo || enviando ? 0.6 : 1 }}>{enviando ? 'Creando…' : 'Crear guía en Effi'}</button>}
      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}

/** Guía generada: copiar, descargar el documento, subirlo y enviarlo al cliente por WhatsApp. */
function GuiaAcciones({ df, sel }: { df: DealFlowState; sel: DecoratedOrder }) {
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const subir = (file: File | undefined) => {
    if (!file || !sel.rowId) return;
    if (file.size > 15 * 1024 * 1024) { setMsg('El archivo pesa más de 15 MB.'); return; }
    const fr = new FileReader();
    fr.onload = async () => {
      setOcupado(true); setMsg('');
      const r = await enProceso('Subiendo la guía…', () => apiGuiaDocumento(sel.rowId!, String(fr.result)), 'pedido');
      setOcupado(false);
      if (r.error || !r.data) { setMsg(r.error || 'No se pudo subir.'); return; }
      setMsg(r.data.convertida ? '✓ Guía guardada. Ya puedes enviarla al cliente.' : '✓ PDF guardado (no se pudo convertir a imagen: se enviará como PDF).');
      await df.refrescarPedidos();
    };
    fr.readAsDataURL(file);
  };
  const enviar = async () => {
    if (!sel.rowId) return;
    setOcupado(true); setMsg('');
    const r = await enProceso('Enviándole la guía al cliente por WhatsApp…', () => apiGuiaEnviar(sel.rowId!), 'pedido');
    setOcupado(false);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo enviar.'); return; }
    const d = r.data;
    const partes = [
      d.chat === 'enviado' ? `al chat${d.con === 'image' ? ' con la imagen' : d.con === 'document' ? ' con el PDF' : ''}` : d.chat === 'plantilla' ? 'al chat (con plantilla, la ventana de 24 h estaba cerrada)' : '',
      d.contacto === 'plantilla' ? 'al celular de contacto con la plantilla aprobada' : '',
    ].filter(Boolean);
    setMsg(`✓ Guía enviada ${partes.join(' y ')}.${d.detalle.length ? ' ⚠ ' + d.detalle.join(' ') : ''}`);
    await df.refrescarPedidos();
  };
  const av = sel.guiaAviso;
  const fallo = !!av && !av.ok;
  const archivo = sel.guiaUrl || sel.guiaImg;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: 'var(--df-text-strong)' }}>Guía {sel.guia}</div>
        <button onClick={() => df.copyGuia(sel.guia!)} className="df-copy-btn" style={btnS}>{df.guiaBtnLabel}</button>
        {archivo && <a href={archivo} download={`Guia-${sel.id}`} target="_blank" rel="noreferrer" style={{ ...btnS, color: 'var(--df-purple)', textDecoration: 'none' }}>⬇ Descargar</a>}
      </div>
      {sel.guiaImg && <a href={sel.guiaImg} target="_blank" rel="noreferrer"><img src={sel.guiaImg} alt={`Guía ${sel.guia}`} style={{ width: '100%', maxHeight: 380, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--df-border)', background: '#fff' }} /></a>}
      {/* La guía se le envía sola al cliente: subir/enviar a mano solo aparece si ese envío falló. */}
      {fallo && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...btnS, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: ocupado ? 'progress' : 'pointer' }}>
          📎 {archivo ? 'Cambiar documento' : 'Subir guía (PDF o imagen)'}
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button onClick={enviar} disabled={ocupado} style={{ ...btnS, background: '#25D366', borderColor: '#25D366', color: '#05301a', fontWeight: 700 }}>💬 Volver a enviar la guía al cliente</button>
      </div>}
      {av && (
        <div style={{ fontSize: 12, lineHeight: 1.45, borderRadius: 8, padding: '8px 10px', background: av.ok ? 'rgba(37,211,102,.1)' : 'var(--df-warning-subtle)', color: av.ok ? '#047857' : 'var(--df-text-body)' }}>
          {av.ok
            ? <>✅ <b>La guía le llegó al cliente</b>{av.chat === 'plantilla' ? ' (con plantilla, la ventana de 24 h estaba cerrada)' : av.con === 'image' ? ' (con la imagen de la guía)' : av.con === 'document' ? ' (con el PDF)' : ''}.</>
            : <>⚠️ <b>No se le pudo enviar la guía al cliente.</b> {av.detalle || 'Revisa el registro del pedido.'} {/plantilla/i.test(av.detalle) && 'Publica y espera la aprobación de la plantilla «guia_envio_pedido» en WhatsApp → Plantillas.'}</>}
        </div>
      )}
      {!av && sel.hasGuia && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>📨 La guía se le está enviando sola al cliente por WhatsApp.</div>}
      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}

/** Bloque de despacho del pedido: elegir proveedor (Effi / Dropi) o ver el envío ya hecho. */
export function DespachoPedido({ df, sel }: { df: DealFlowState; sel: DecoratedOrder }) {
  const [redespachar, setRedespachar] = useState(false);
  const effiApiListo = !!df.effiApi.listo;
  const effiOk = effiApiListo;
  const dropiOk = !!df.dropiConectado;
  const [prov, setProv] = useState<'effi' | 'dropi' | ''>('');
  const elegido = prov || (effiOk ? 'effi' : dropiOk ? 'dropi' : '');
  const dropiCreado = sel.despachoProveedor === 'dropi';

  // Anula en Effi la guía y la remisión; el pedido queda listo para corregirlo y volver a enviarlo.
  const anularEffi = async () => {
    if (!sel.rowId) return;
    const motivo = await pedirTexto({ titulo: `¿Anular en Effi la remisión${sel.hasGuia || sel.effiGuiaCreada ? ' y la guía' : ''} de ${sel.id}?`, mensaje: 'Se anulan en Effi y el pedido queda listo para corregirlo (cliente, dirección, productos) y volver a despacharlo con una remisión nueva. Si la transportadora ya recogió el paquete, Effi no deja anular.', placeholder: 'Motivo (ej. corregir nombre del cliente)', valor: 'Corregir datos del pedido', aceptar: 'Anular en Effi' });
    if (motivo === null) return;
    const r = await enProceso('Anulando en Effi…', () => apiEffiAnular(sel.rowId!, motivo), 'pedido');
    if (r.error) return notificar(r.error, 'error', 9000);
    notificar(`✓ Anulada en Effi: ${[r.data!.remision, ...r.data!.guias].join(' + ')}. Corrige el pedido y vuelve a despacharlo.`, 'ok', 7000);
    await df.recargarPedidos();
  };

  if (sel.despachado && !redespachar) {
    const remision = sel.effiRemision || (sel.despachoProveedor === 'effi' ? sel.wooId : '');
    return (
      <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: '14px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {dropiCreado
            ? <img src="/logos/dropi.jpg" alt="Dropi" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} />
            : <span style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', border: '1px solid var(--df-border)', display: 'grid', placeItems: 'center', padding: 3, boxSizing: 'border-box' }}><img src="/logos/effi.png" alt="Effi" style={{ maxWidth: '100%', maxHeight: '100%' }} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Enviado a {dropiCreado ? 'Dropi' : 'Effi'}</div>
            <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Estado: <b style={{ color: 'var(--df-text-strong)' }}>{sel.estadoWoo || (sel.hasGuia ? 'guía generada' : 'esperando guía…')}</b></div>
          </div>
          <button onClick={sel.sincronizarEffi} style={{ ...btnS, color: 'var(--df-purple)', borderColor: 'var(--df-purple-border)' }}>↻ Actualizar</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {remision && <span style={chip('var(--df-purple-subtle)', 'var(--df-purple)')}>🧾 {remision}</span>}
          {sel.transportadora && !(sel.transportadora === 'Dropi' && !dropiCreado) && <span style={chip('var(--df-warning-subtle)', 'var(--df-warning)')}>🚚 {sel.transportadora}</span>}
        </div>
        <PasosEnvio sel={sel} />
        {sel.novedad && <div style={{ marginTop: 12 }}><NovedadCard df={df} sel={sel} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <RastreoGuia sel={sel} />
          <DevolucionEffi df={df} sel={sel} />
        </div>
        {!dropiCreado && !!sel.effiRemision && !sel.hasGuia && df.effiApi.conectado && !sel.effiGuiaCreada && <GuiaEffiForm df={df} sel={sel} />}
        {!sel.hasGuia && sel.effiGuiaCreada && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--df-text-muted)', background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>🚚 Guía creada en Effi{sel.effiGuiaTx ? <> (<b style={{ color: 'var(--df-text-strong)' }}>{sel.effiGuiaTx}</b>)</> : ''} · esperando que la transportadora asigne el número. Llega solo; apenas llegue se le envía al cliente.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(sel.guiaUrl || sel.guiaImg) && <a href={sel.guiaImg || sel.guiaUrl} target="_blank" rel="noreferrer" style={{ ...btnS, color: 'var(--df-purple)', textDecoration: 'none' }}>📄 Ver la guía</a>}
              <button onClick={sel.sincronizarEffi} style={{ ...btnS, color: 'var(--df-purple)' }}>↻ Buscar el número ahora</button>
            </div>
          </div>
        )}
        {sel.hasGuia && <GuiaAcciones df={df} sel={sel} />}
        {!sel.hasGuia && (dropiCreado || sel.effiGuiaCreada || !!sel.effiRemision) && <GuiaManual df={df} sel={sel} proveedor={dropiCreado ? 'Dropi' : 'Effi'} destacar={/guia|generad/i.test(sel.estadoWoo || '')} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--df-border)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)', flex: 1 }}>Se actualiza solo. Cuando salga la guía, se la avisamos al cliente por WhatsApp.</span>
          {!dropiCreado && !!sel.effiRemision && df.effiApi.conectado && (
            <button onClick={() => void anularEffi()} title="Anula en Effi la guía y la remisión para corregir el pedido y volver a despacharlo"
              style={{ background: 'transparent', border: 'none', color: 'var(--df-danger)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Anular en Effi</button>
          )}
          <button onClick={() => setRedespachar(true)} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-muted)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Volver a despachar</button>
        </div>
        {df.effiMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? 'var(--df-purple)' : df.effiMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.effiMsg}</div>}
      </div>
    );
  }

  if (!effiOk && !dropiOk) {
    return (
      <div style={{ border: '1px dashed var(--df-border-strong)', borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 13 }}>
        Conecta <b>Effi</b> o <b>Dropi</b> en <b>Integraciones</b> para despachar este pedido con un toque.
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {redespachar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 9, padding: '8px 10px' }}>
          <span style={{ fontSize: 12.5, color: 'var(--df-warning)', fontWeight: 600, flex: 1 }}>Vas a despachar otra vez este pedido.</span>
          <button onClick={() => setRedespachar(false)} style={btnS}>Cancelar</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => effiOk && setProv('effi')} style={tarjetaProv(elegido === 'effi', effiOk)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', border: '1px solid var(--df-border)', display: 'grid', placeItems: 'center', padding: 3, boxSizing: 'border-box' }}><img src="/logos/effi.png" alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /></span>
            <b style={{ fontSize: 14, color: 'var(--df-text-strong)' }}>Effi</b>
            {elegido === 'effi' && <span style={{ marginLeft: 'auto', color: 'var(--df-purple)', fontWeight: 800 }}>●</span>}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)', lineHeight: 1.35 }}>{effiOk ? 'Remisión + guía' : 'Conéctalo en Integraciones'}</span>
        </button>
        <button onClick={() => dropiOk && setProv('dropi')} style={tarjetaProv(elegido === 'dropi', dropiOk)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logos/dropi.jpg" alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover' }} />
            <b style={{ fontSize: 14, color: 'var(--df-text-strong)' }}>Dropi</b>
            {elegido === 'dropi' && <span style={{ marginLeft: 'auto', color: 'var(--df-purple)', fontWeight: 800 }}>●</span>}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)', lineHeight: 1.35 }}>{dropiOk ? 'Cotiza y elige transportadora' : 'Conéctalo en Integraciones'}</span>
        </button>
      </div>

      {elegido === 'effi' && effiApiListo && <EffiApiDespacho df={df} sel={sel} reintentar={redespachar} onHecho={() => setRedespachar(false)} />}
      {elegido === 'dropi' && <DropiDespacho df={df} sel={sel} onHecho={() => setRedespachar(false)} />}
    </div>
  );
}

export function OrderDetailPanel({ df }: { df: DealFlowState }) {
  useEffect(() => { void df.cargarEffiApi?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;
  const dropiCreado = sel.despachoProveedor === 'dropi'; // Dropi se despacha por API directa

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={df.closeOrder} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
      <div style={{ position: 'relative', width: 430, maxWidth: '92%', background: 'var(--df-surface)', height: '100%', boxShadow: '-12px 0 40px rgba(15,23,42,.18)', display: 'flex', flexDirection: 'column' }}>
        <ProcesoPedido />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => df.abrirChatDePedido({ leadId: sel.leadId, tel: sel.tel })} title="Abrir el chat de este cliente" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}><OrigenBadge origen={sel.origen || (sel.leadId ? 'whatsapp' : '')} texto /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-brand)' }}>Abrir chat ↗</span></button>
          <span onClick={df.closeOrder} className="df-close-hover" style={{ color: 'var(--df-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--df-text-muted)', fontSize: 12.5, marginBottom: 14 }}>
            <span>📅</span>
            <span>
              Pedido el <b style={{ color: 'var(--df-text-strong)' }}>{sel.fecha || 'hoy'}</b> a las <b style={{ color: 'var(--df-text-strong)' }}>{sel.hora}</b>
            </span>
          </div>

          {(sel.origen === 'shopify' || sel.origen === 'landing') && <ConfirmacionShopify sel={sel} />}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Datos de envío</div>
          <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 14, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { icono: '👤', k: 'Nombre', v: sel.cliente },
              { icono: '📞', k: 'Contacto', v: sel.tel, mono: true },
              { icono: '🏔️', k: 'Departamento', v: sel.departamento || '' },
              { icono: '🏙️', k: 'Ciudad', v: sel.ciudad },
              { icono: '🏡', k: 'Dirección', v: sel.direccion },
              { icono: '💳', k: 'Método de pago', v: 'Contraentrega' },
            ].filter((f) => f.v).map((f) => (
              <div key={f.k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, flexWrap: f.k === 'Dirección' ? 'wrap' : undefined }}>
                <span style={{ flexShrink: 0 }}>{f.icono}</span>
                <span style={{ color: 'var(--df-text-muted)', fontWeight: 600, minWidth: 118, flexShrink: 0 }}>{f.k}:</span>
                <span style={{ fontWeight: f.k === 'Nombre' ? 700 : 500, fontFamily: f.mono ? "'JetBrains Mono',monospace" : undefined, fontSize: f.mono ? 12.5 : undefined, flex: f.k === 'Dirección' ? '1 1 0' : undefined, minWidth: 0 }}>{f.v}</span>
                {f.k === 'Dirección' && <OrdenarDireccion rowId={sel.rowId} direccion={sel.direccion} ciudad={sel.ciudad} departamento={sel.departamento || ''} onCambio={() => void df.recargarPedidos()} />}
              </div>
            ))}
          </div>

          <HistorialClienteCard rowId={sel.rowId} tel={sel.tel} />

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Qué pidió</div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--df-border)' }}>
                <span style={{ background: 'var(--df-surface-2)', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 8px', color: 'var(--df-text-secondary)' }}>{it.qty}×</span>
                <span style={{ fontSize: 13.5, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 14px', background: 'var(--df-bg)', fontSize: 13, color: 'var(--df-text-muted)' }}>
              <span>Envío{sel.transportadora && !(sel.transportadora === 'Dropi' && sel.despachoProveedor !== 'dropi') ? ` (${sel.transportadora})` : ''}</span>
              <div style={{ flex: 1 }} />
              <span>{sel.envioFmt}</span>
            </div>
            <div style={{ display: 'flex', padding: '12px 14px', borderTop: '1px solid var(--df-border)', fontWeight: 800, fontSize: 15 }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          {sel.hasNota && (
            <div style={{ background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400E', marginBottom: 18 }}>
              📝 {sel.nota}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho</div>
          <DespachoPedido df={df} sel={sel} />

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Avance</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                <span style={t.dotStyle} />
                <span style={t.labelStyle}>{t.estado}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Estado del pedido: se actualiza SOLO desde Dropi/Effi, pero también lo
            puedes cambiar a mano aquí (o eliminar el pedido del panel). */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--df-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Estado del pedido</span>
            <div style={{ flex: 1 }} />
            {sel.despachado && <span style={{ color: 'var(--df-text-faint)', fontSize: 11 }}>se actualiza solo desde {dropiCreado ? 'Dropi' : 'Effi'}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Dropdown
                ariaLabel="Cambiar estado del pedido"
                value={sel.estado}
                onChange={(v) => sel.setEstado(v as typeof sel.estado)}
                options={sel.estadosDisponibles.map((e) => ({ value: e, label: e }))}
              />
            </div>
            <button
              onClick={() => df.abrirEditarPedido(sel)}
              title="Editar pedido"
              style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-strong)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >✏️ Editar</button>
            <button
              onClick={async () => { if (await confirmar({ titulo: `Eliminar ${sel.id}`, mensaje: 'Esto solo lo quita del panel; no cancela nada en Dropi/Effi.', aceptar: 'Eliminar', peligro: true })) sel.eliminar(); }}
              title="Eliminar pedido"
              style={{ background: 'var(--df-surface)', border: '1px solid var(--df-danger-border, var(--df-border))', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-danger-dark)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >🗑 Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pedido de Shopify: estado de la confirmación por WhatsApp (Sí / No) y reenvío. */
function ConfirmacionShopify({ sel }: { sel: DecoratedOrder }) {
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const c = enviada && sel.confirmacion !== 'si' && sel.confirmacion !== 'no' ? 'esperando' : sel.confirmacion || '';
  const info: Record<string, [string, string, string]> = {
    esperando: ['⏳', 'Esperando que el cliente confirme por WhatsApp', 'var(--df-warning)'],
    si: ['✅', 'El cliente confirmó el pedido por WhatsApp', 'var(--df-success)'],
    no: ['❌', 'El cliente respondió que NO: escríbele desde el Inbox', 'var(--df-danger)'],
    fallo: ['⚠️', 'No se pudo enviar la confirmación por WhatsApp', 'var(--df-danger)'],
    '': ['💬', 'Aún no se ha pedido confirmación por WhatsApp', 'var(--df-text-muted)'],
  };
  const [ico, texto, color] = info[c] || info[''];
  const reenviar = async () => {
    if (!sel.rowId) return;
    setEnviando(true); setMsg('');
    const r = await apiShopifyReenviarConfirmacion(sel.rowId);
    setEnviando(false);
    setMsg(r.error ? r.error : '✓ Confirmación enviada.');
    if (!r.error) setEnviada(true);
  };
  return (
    <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: '11px 13px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{ico}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, flex: 1, minWidth: 180 }}>{texto}</span>
        {c !== 'si' && <button onClick={() => void reenviar()} disabled={enviando} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer', color: 'var(--df-text-body)', opacity: enviando ? 0.6 : 1 }}>{enviando ? 'Enviando…' : c ? 'Reenviar confirmación' : 'Pedir confirmación'}</button>}
      </div>
      {c === 'fallo' && sel.confirmacionError && !msg && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.45 }}>{sel.confirmacionError}</div>}
      {sel.shopifyEnviado && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>🛍️ Marcado como enviado en Shopify con su guía.</div>}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}
