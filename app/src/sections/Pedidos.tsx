import { useEffect, useMemo, useState } from 'react';
import { clicAparte } from '../components/EnlaceApp';
import { urlDe } from '../lib/rutas';
import { OrigenBadge } from '../components/OrigenPedido';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { IcoBuscar } from '../components/iconosNoche';
import { Dropdown } from '../components/Dropdown';
import { confirmar } from '../components/dialogs';
import { useFiltrosPedidos, PanelFiltros, ORDENES, fechaCorta, valorPedido, type Orden } from '../components/PedidosFiltros';
import { ESTADOS_TODOS } from '../lib/style';
import { claseEstado, confirmacionDe, pesos } from '../lib/noche';

const POR_PAGINA = 50;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Pedidos (diseño "Noche"): chips por estado, buscador, tabla con lo que dijo el
 * cliente y el estado real del envío, y el detalle del pedido fijo a la derecha.
 */
export function Pedidos({ df }: { df: DealFlowState }) {
  const fp = useFiltrosPedidos(df.allOrders, df.orderQuery);
  const [trayendo, setTrayendo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [pagina, setPagina] = useState(0);
  const n = fp.activos.length;
  const mes = MESES[new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getMonth()];

  // Chips de estado: "Todos" y los estados con pedidos (varios a la vez).
  const estadosConPedidos = ESTADOS_TODOS.filter((e) => (fp.conteoEstados[e] || 0) > 0);
  const paginas = Math.max(1, Math.ceil(fp.filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const visibles = useMemo(() => fp.filtrados.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA), [fp.filtrados, pag]);
  useEffect(() => { setPagina(0); }, [df.orderQuery, fp.f]);

  // Encabezado ordenable: un toque ordena por esa columna; otro invierte.
  const ordenarPor = (asc: Orden, desc: Orden) => fp.set({ orden: fp.f.orden === desc ? asc : desc });
  const flecha = (asc: Orden, desc: Orden) => (fp.f.orden === desc ? ' ↓' : fp.f.orden === asc ? ' ↑' : '');
  const th = (label: string, sort?: [Orden, Orden]) => (
    <th>{sort ? <button type="button" onClick={() => ordenarPor(sort[0], sort[1])} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer' }}>{label}{flecha(sort[0], sort[1])}</button> : label}</th>
  );

  return (
    <section data-screen-label="Pedidos" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Pedidos · {mes}</span>
          <h1>Pedidos</h1>
          <p className="sub">Cada pedido con su confirmación del cliente, su estado real de envío y su despacho a Effi o Dropi.</p>
        </div>
        <div className="fila">
          {df.shopifyConectado && (
            <button type="button" className="btn btn-sec" disabled={trayendo} onClick={() => { setTrayendo(true); void df.traerPedidosShopify(() => setTrayendo(false)); }} title="Trae de Shopify los pedidos de la última semana que aún no estén en DealFlow (también se revisa solo cada 5 minutos)">
              {trayendo ? 'Revisando Shopify…' : '🛍️ Traer de Shopify'}
            </button>
          )}
          <button type="button" className="btn btn-sec" onClick={() => df.exportarPedidos(fp.filtrados.map((o) => o.id))} title="Descarga en Excel (CSV) los pedidos que estás viendo con los filtros actuales">⬇ Exportar {fp.filtrados.length}</button>
          <button type="button" className="btn btn-pri" onClick={() => df.abrirCrearPedido()}>＋ Crear pedido</button>
        </div>
      </div>

      <div className="fila">
        <button type="button" className={`chip${fp.f.estados.length === 0 ? ' activa' : ''}`} onClick={() => fp.set({ estados: [] })}>Todos <span className="n">{fp.totalBase}</span></button>
        {estadosConPedidos.map((e) => (
          <button key={e} type="button" className={`chip${fp.f.estados.includes(e) ? ' activa' : ''}`} onClick={() => fp.alternar('estados', e)}>{e} <span className="n">{fp.conteoEstados[e] || 0}</span></button>
        ))}
        <button type="button" className={`chip${abierto || n ? ' activa' : ''}`} onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}>⚙ Más filtros{n ? ` (${n})` : ''} {abierto ? '▴' : '▾'}</button>
        <div className="buscar" style={{ flex: '1 1 260px', maxWidth: 380, marginLeft: 'auto' }}>
          <IcoBuscar />
          <input type="search" value={df.orderQuery} onChange={(e) => df.setOrderQuery(e.target.value)} placeholder="Cliente, teléfono, número, producto o guía…" aria-label="Buscar pedido" />
        </div>
        <Dropdown ariaLabel="Ordenar pedidos" value={fp.f.orden} onChange={(v) => fp.set({ orden: v as Orden })} options={ORDENES.map((o) => ({ value: o.id, label: o.label }))} width={160} />
      </div>
      {abierto && <PanelFiltros fp={fp} />}
      {n > 0 && (
        <div className="fila" style={{ gap: 8, fontSize: 13 }}>
          <span className="suave-t"><b style={{ color: 'var(--tinta)' }}>{fp.filtrados.length}</b> de {fp.totalBase} pedidos · <b style={{ color: 'var(--tinta)' }}>{pesos(fp.totalValor)}</b></span>
          {fp.activos.map((a) => <button key={a.label} type="button" className="chip chica activa" onClick={a.quitar} title="Quitar este filtro">{a.label} ✕</button>)}
          <button type="button" className="enlace" onClick={fp.limpiar} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}>Limpiar filtros</button>
        </div>
      )}

      <div className="lateral">
        <section className="tarjeta scroll-x" style={{ padding: '4px 6px' }}>
          <table className="tabla" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                {th('Pedido', ['antiguos', 'recientes'])}
                {th('Cliente', ['cliente', 'cliente'])}
                <th>Productos</th>
                {th('Total', ['menor', 'mayor'])}
                <th>Cliente dijo</th>
                <th>Estado</th>
                <th>Guía</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((o) => <Fila key={o.id} o={o} sel={df.sel?.id === o.id} />)}
            </tbody>
          </table>
          {fp.filtrados.length === 0 && (
            <div className="vacio" style={{ margin: 8 }}>
              {df.orderQuery.trim() || n ? 'Ningún pedido coincide con la búsqueda o los filtros.' : 'Todavía no hay pedidos. Los que lleguen por WhatsApp, la tienda en línea o Shopify aparecen aquí.'}
              {n > 0 && <div style={{ marginTop: 10 }}><button type="button" className="btn btn-sec btn-chico" onClick={fp.limpiar}>Limpiar filtros</button></div>}
            </div>
          )}
          <div className="fila" style={{ padding: '10px 8px', justifyContent: 'space-between' }}>
            <span className="tenue" style={{ fontSize: 12 }}>Mostrando {visibles.length} de {fp.filtrados.length} pedidos{fp.filtrados.length ? ` · ${pesos(fp.totalValor)}` : ''}</span>
            {paginas > 1 && (
              <div className="fila" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sec btn-chico" disabled={pag === 0} onClick={() => setPagina(pag - 1)} aria-label="Página anterior">‹</button>
                <span className="mono" style={{ fontSize: 12 }}>{pag + 1} / {paginas}</span>
                <button type="button" className="btn btn-sec btn-chico" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)} aria-label="Página siguiente">›</button>
              </div>
            )}
          </div>
        </section>
        <OrderDetailPanel df={df} inline />
      </div>
    </section>
  );
}

// Texto literal de la transportadora, solo si dice algo más que el estado.
// ("Generada" con estado "Guía generada", o "EN TRANSITO" con "En tránsito", no se repiten).
const sinTildes = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const textoGuia = (o: DecoratedOrder) => {
  const w = sinTildes(o.estadoWoo || ''); const e = sinTildes(o.estado);
  return w && w !== e && !e.includes(w) && !w.includes(e) ? o.estadoWoo || '' : '';
};

function Fila({ o, sel }: { o: DecoratedOrder; sel: boolean }) {
  const prov = o.despachoProveedor === 'effi' ? 'Effi' : o.despachoProveedor === 'dropi' ? 'Dropi' : '';
  const conf = confirmacionDe(o);
  const detalle = textoGuia(o);
  return (
    <tr {...clicAparte(urlDe({ mode: 'vendedor', section: 'pedidos', pedido: String(o.id) }), o.open)} className={`clic${sel ? ' fila-sel' : ''}`} style={{ cursor: 'pointer' }}>
      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><OrigenBadge origen={o.origen} size={16} /><b>{o.id}</b></div>
        <div className="tenue" style={{ fontSize: 10.5 }}>{fechaCorta(o.fecha)}{o.hora ? ` · ${o.hora}` : ''}</div>
      </td>
      <td title={`${o.cliente}${o.tel ? ` · ${o.tel}` : ''}`} style={{ maxWidth: 170 }}>
        <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente}</b>
        <div className="tenue" style={{ fontSize: 12 }}>{o.ciudad || '—'}{o.departamento ? ` · ${o.departamento}` : ''}</div>
      </td>
      <td style={{ maxWidth: 220 }}><span title={o.itemsResumen} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.itemsResumen}</span></td>
      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{pesos(valorPedido(o))}</td>
      <td><span className={`pill ${conf.clase} chica`} title={conf.nota}>{conf.texto}</span></td>
      <td title={o.estadoWoo ? `Transportadora: ${o.estadoWoo}` : undefined}>
        <span className={`pill ${claseEstado(o.estado)} chica`}>{o.estado}</span>
        {detalle && <div className="tenue" style={{ fontSize: 11, marginTop: 3 }}>{detalle}</div>}
      </td>
      <td className="mono tenue" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {prov ? (
          <>
            <div style={{ color: 'var(--niebla)' }}>{prov}{o.transportadora && o.transportadora !== prov ? ` · ${o.transportadora}` : ''}</div>
            <div>{o.hasGuia ? o.guia : 'esperando guía'}</div>
          </>
        ) : '—'}
      </td>
      <td style={{ width: 28 }}>
        <button
          type="button" aria-label={`Eliminar ${o.id}`} title="Eliminar pedido" className="icono-btn" style={{ width: 26, height: 26, fontSize: 13 }}
          onClick={async (e) => { e.stopPropagation(); if (await confirmar({ titulo: `Eliminar ${o.id}`, mensaje: 'Esto solo lo quita del panel; no cancela nada en Dropi/Effi.', aceptar: 'Eliminar', peligro: true })) o.eliminar(); }}
        >🗑</button>
      </td>
    </tr>
  );
}
