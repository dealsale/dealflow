import { useMemo, useState } from 'react';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { OrigenBadge } from '../components/OrigenPedido';
import { valorPedido } from '../components/PedidosFiltros';
import { claseEstado, colorEstado, confirmacionDe, diaBogota, diaCorto, fechaLarga, haceCuanto, iniciales, miles, pesos } from '../lib/noche';
import skyMascota from '../assets/sky-mascota.png';

/**
 * Resumen del rediseño: saludo con cómo va el día, KPIs del periodo (hoy / 7 días /
 * 30 días), ventas por día, pedidos por estado, pedidos recientes, chats que necesitan
 * una persona y la sugerencia de SKY. Todo sale de los pedidos y chats reales.
 */
type Periodo = 'hoy' | 'semana' | 'mes';
const DIAS: Record<Periodo, number> = { hoy: 1, semana: 7, mes: 30 };
const cuenta = (o: DecoratedOrder) => o.estado !== 'Cancelado' && o.estado !== 'Devuelto';

export function Resumen({ df }: { df: DealFlowState }) {
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [suscAbierta, setSuscAbierta] = useState(false);
  const hoy = diaBogota();

  const datos = useMemo(() => {
    const n = DIAS[periodo];
    const desde = diaBogota(n - 1);
    const desdeAnt = diaBogota(2 * n - 1);
    const enRango = (f: string | undefined, a: string, b: string) => !!f && f >= a && f <= b;
    const pedidos = df.allOrders.filter((o) => enRango(o.fecha, desde, hoy));
    const anteriores = df.allOrders.filter((o) => enRango(o.fecha, desdeAnt, diaBogota(n)));
    const ventas = pedidos.filter(cuenta).reduce((a, o) => a + valorPedido(o), 0);
    const ventasAnt = anteriores.filter(cuenta).reduce((a, o) => a + valorPedido(o), 0);
    const delta = ventasAnt > 0 ? Math.round(((ventas - ventasAnt) / ventasAnt) * 100) : null;
    const conf = pedidos.map((o) => o.confirmacion || '');
    const confirmados = conf.filter((c) => c === 'si').length;
    const esperando = conf.filter((c) => c === 'esperando').length;
    const dijeronNo = conf.filter((c) => c === 'no').length;
    const preguntados = confirmados + esperando + dijeronNo;
    const chats = df.crmChats.filter((c) => enRango(c.fechaISO, desde, hoy));
    const chatsBot = chats.filter((c) => c.live).length;
    const porAsistente = pedidos.filter((o) => !['manual', 'shopify'].includes(o.origen || '')).length;
    // Barras: últimos 7 días, o 5 semanas en el mes.
    const barras = periodo === 'mes'
      ? Array.from({ length: 5 }, (_, i) => {
        const fin = diaBogota((4 - i) * 7); const ini = diaBogota((4 - i) * 7 + 6);
        return { nombre: `S${i + 1}`, valor: df.allOrders.filter((o) => cuenta(o) && enRango(o.fecha, ini, fin)).reduce((a, o) => a + valorPedido(o), 0) };
      })
      : Array.from({ length: 7 }, (_, i) => {
        const f = diaBogota(6 - i);
        return { nombre: diaCorto(f), valor: df.allOrders.filter((o) => cuenta(o) && o.fecha === f).reduce((a, o) => a + valorPedido(o), 0) };
      });
    const maxBarra = Math.max(1, ...barras.map((b) => b.valor));
    const estados = ['Nuevo', 'Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'Novedad', 'Entregado', 'Devuelto', 'Cancelado']
      .map((e) => ({ nombre: e, n: pedidos.filter((o) => o.estado === e).length }))
      .filter((e) => e.n > 0);
    const maxEstado = Math.max(1, ...estados.map((e) => e.n));
    return { desde, pedidos, ventas, delta, confirmados, esperando, dijeronNo, preguntados, chats: chats.length, chatsBot, porAsistente, barras, maxBarra, estados, maxEstado };
  }, [df.allOrders, df.crmChats, periodo, hoy]);

  const necesitan = useMemo(() => [...df.crmChats].filter((c) => !c.live && c.sinResponder > 0).sort((a, b) => String(b.ultimoIso || '').localeCompare(String(a.ultimoIso || ''))).slice(0, 4), [df.crmChats]);
  const recientes = df.allOrders.slice(0, 5);
  const rango = periodo === 'hoy' ? 'Últimos 7 días' : periodo === 'semana' ? `Del ${fechaCortaEs(datos.desde)} al ${fechaCortaEs(hoy)}` : 'Últimas 5 semanas';
  const frase = datos.delta !== null && datos.delta > 0 ? 'Hoy vas bien.' : datos.pedidos.length > 0 ? 'Vas con todo.' : 'Todo listo para vender.';

  // Sugerencia de SKY: lo más útil que falta por activar en esta tienda.
  const sugerencia = !df.waConnected
    ? { titulo: 'Conecta tu WhatsApp', texto: 'Sin WhatsApp conectado el asistente no puede atender ni confirmar pedidos. Toma 5 minutos con la conexión oficial.', accion: 'Conectar', ir: () => df.go('whatsapp') }
    : df.productCount === 0
      ? { titulo: 'Agrega tu primer producto', texto: 'El asistente vende lo que está en tu catálogo: con fotos, precio y variantes responde solo cada chat.', accion: 'Ir a Productos', ir: () => df.go('productos') }
      : !df.effiApi?.conectado && !df.dropiConectado
        ? { titulo: 'Conecta Effi o Dropi', texto: 'Con la logística conectada, cada pedido confirmado se despacha con su guía y el cliente la recibe por WhatsApp.', accion: 'Ir a Integraciones', ir: () => df.go('integraciones') }
        : df.effiApi?.conectado && !df.effiApi?.autoDespacho
          ? { titulo: 'Activa el despacho automático', texto: 'Los pedidos confirmados salen a Effi a mano. Con “Enviar solo a Effi” se crean solos al recibir el Sí del cliente.', accion: 'Activarlo', ir: () => df.go('integraciones') }
          : !df.seguimientoActivo
            ? { titulo: 'Activa el seguimiento automático', texto: 'Si un cliente deja de responder, el asistente le vuelve a escribir a las 3 h y al día siguiente, sin sonar insistente.', accion: 'Activarlo', ir: () => df.go('asistente') }
            : { titulo: 'Revisa tus estadísticas', texto: 'Mira qué productos y qué canales están vendiendo más este mes para pautar donde sí convierte.', accion: 'Ver estadísticas', ir: () => df.go('estadisticas') };

  return (
    <section data-screen-label="Resumen">
      <div className="encabezado">
        <div className="encabezado-txt" style={{ gap: 6 }}>
          <span className="eti">{fechaLarga()}</span>
          <h1>Hola, {df.saludoNombre}. <span className="grad-txt">{frase}</span></h1>
          <p className="sub">
            {datos.pedidos.length} pedido{datos.pedidos.length === 1 ? '' : 's'} {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}, {datos.confirmados} confirmado{datos.confirmados === 1 ? '' : 's'} por los clientes y {datos.esperando} esperando respuesta.
            {datos.porAsistente > 0 ? ` El asistente creó ${datos.porAsistente} solo.` : ''}
          </p>
        </div>
        <div className="fila" role="group" aria-label="Periodo">
          {([['hoy', 'Hoy'], ['semana', '7 días'], ['mes', '30 días']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`chip${periodo === k ? ' activa' : ''}`} onClick={() => setPeriodo(k)}>{l}</button>
          ))}
        </div>
      </div>

      {df.antibaneo && df.antibaneo.nivel !== 'ok' && !df.esAgente && (
        <div className={`aviso-caja ${df.antibaneo.nivel === 'alerta' ? 'mal' : 'aviso'}`}>
          <b>{df.antibaneo.nivel === 'alerta' ? '🚨' : '⚠️'} Monitor anti-baneo de WhatsApp</b>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--niebla)', lineHeight: 1.55 }}>{df.antibaneo.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {df.suscMsg && <div className="aviso-caja ok">{df.suscMsg}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eti">Ventas</span><span className="valor">{pesos(datos.ventas)}</span><span className="delta">{datos.delta === null ? <span>sin periodo anterior para comparar</span> : <><b className={datos.delta < 0 ? 'baja' : ''}>{datos.delta > 0 ? '+' : ''}{datos.delta} %</b> vs. periodo anterior</>}</span></div>
        <div className="kpi clic" onClick={() => df.go('pedidos')}><span className="eti">Pedidos</span><span className="valor">{datos.pedidos.length}</span><span className="delta">{datos.confirmados} confirmados · {datos.esperando} esperando{datos.dijeronNo ? ` · ${datos.dijeronNo} no` : ''}</span></div>
        <div className="kpi clic" onClick={() => df.go('crm')}><span className="eti">Chats atendidos</span><span className="valor">{datos.chats}</span><span className="delta">{datos.chatsBot} por el asistente · {datos.chats - datos.chatsBot} por tu equipo</span></div>
        <div className="kpi"><span className="eti">Confirmación</span><span className="valor">{datos.preguntados ? Math.round((datos.confirmados / datos.preguntados) * 100) + ' %' : '—'}</span><span className="delta">de los pedidos confirmados por el cliente</span></div>
      </div>

      <div className="g3" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <section className="tarjeta">
          <div className="tarjeta-cab">
            <div><h2>Ventas por día</h2><p className="suave-t" style={{ fontSize: 12.5 }}>{rango} · pago contra entrega y pagado</p></div>
            <span className="pill info sin">Total {pesos(datos.barras.reduce((a, b) => a + b.valor, 0))}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${datos.barras.length}, minmax(0, 1fr))`, gap: 10, alignItems: 'end', height: 190, paddingTop: 10 }}>
            {datos.barras.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--niebla)' }}>{b.valor ? miles(b.valor) : ''}</span>
                <div title={`${b.nombre}: ${pesos(b.valor)}`} style={{ width: '100%', maxWidth: 54, borderRadius: '8px 8px 4px 4px', background: 'linear-gradient(180deg, #2E8BFF, #7658FF)', height: Math.max(3, Math.round((b.valor / datos.maxBarra) * 140)), opacity: i === datos.barras.length - 1 ? 1 : 0.7 }} />
                <span style={{ fontSize: 12, color: 'var(--niebla)', fontWeight: 600 }}>{b.nombre}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="tarjeta">
          <div className="tarjeta-cab"><h2>Pedidos por estado</h2><a href="#pedidos" onClick={(e) => { e.preventDefault(); df.go('pedidos'); }} style={{ fontSize: 12.5, fontWeight: 700 }}>Ver todos →</a></div>
          {datos.estados.length === 0 ? <p className="tenue" style={{ fontSize: 13 }}>Sin pedidos en este periodo.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {datos.estados.map((e) => (
                <div key={e.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: colorEstado(e.nombre), display: 'inline-block' }} />{e.nombre}</span><b className="mono" style={{ fontSize: 12 }}>{e.n}</b></div>
                  <div className="barra-prog"><i style={{ width: `${Math.round((e.n / datos.maxEstado) * 100)}%`, background: colorEstado(e.nombre) }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="g3" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <section className="tarjeta">
          <div className="tarjeta-cab"><h2>Pedidos recientes</h2><button type="button" className="btn btn-sec btn-chico" onClick={() => df.go('pedidos')}>Abrir Pedidos</button></div>
          {recientes.length === 0 ? <p className="tenue" style={{ fontSize: 13 }}>Todavía no hay pedidos. Cuando el asistente cierre una venta, aparece aquí.</p> : (
            <div className="scroll-x">
              <table className="tabla" style={{ minWidth: 560 }}>
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Estado</th></tr></thead>
                <tbody>
                  {recientes.map((o) => (
                    <tr key={o.id} className="clic" onClick={o.open}>
                      <td className="mono"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><OrigenBadge origen={o.origen} size={16} />{o.id}</span></td>
                      <td><b>{o.cliente}</b><div className="tenue" style={{ fontSize: 12 }}>{o.ciudad || '—'} · {o.fechaLabel}{o.hora ? ` ${o.hora}` : ''}</div></td>
                      <td style={{ maxWidth: 240 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.itemsResumen}>{o.itemsResumen}</span></td>
                      <td className="mono">{o.totalFmt}</td>
                      <td><span className={`pill ${o.estado === 'Nuevo' ? confirmacionDe(o).clase : claseEstado(o.estado)}`}>{o.estado === 'Nuevo' ? confirmacionDe(o).texto : o.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="tarjeta">
            <div className="tarjeta-cab"><h2>Necesitan una persona</h2><span className={`pill ${necesitan.length ? 'aviso' : 'ok'}`}>{necesitan.length}</span></div>
            {necesitan.length === 0 ? <p className="tenue" style={{ fontSize: 13 }}>Ningún chat espera a tu equipo. El asistente tiene todo al día.</p> : (
              <div className="lista">
                {necesitan.map((c) => (
                  <a key={c.id} href="#inbox" onClick={(e) => { e.preventDefault(); df.abrirChat(c.id); }} style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                    <span className="avatar ne">{iniciales(c.nombre)}</span>
                    <div style={{ minWidth: 0 }}><b style={{ fontSize: 13 }}>{c.nombre}</b><div className="tenue" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} translate="no">“{c.ultimo}”</div></div>
                    <span className="pill mal sin" style={{ marginLeft: 'auto' }}>{haceCuanto(c.ultimoIso) || c.fechaHoraLabel}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
          <section className="tarjeta borde-ia" style={{ gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img src={skyMascota} alt="" style={{ width: 44, height: 44 }} /><div><span className="eti" style={{ color: '#D9C6FF' }}>SKY te sugiere</span><h3>{sugerencia.titulo}</h3></div></div>
            <p className="suave-t" style={{ fontSize: 13 }}>{sugerencia.texto}</p>
            <div className="fila"><button type="button" className="btn btn-pri btn-chico" onClick={sugerencia.ir}>{sugerencia.accion}</button><button type="button" className="btn btn-fant btn-chico" onClick={() => window.dispatchEvent(new CustomEvent('df:abrir-sky'))}>Preguntarle a SKY</button></div>
          </section>
          {df.suscripcion && !df.esAgente && (
            <section className="tarjeta" style={{ gap: 8 }}>
              <button type="button" onClick={() => setSuscAbierta((v) => !v)} className="tarjeta-cab" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600 }}>Tu plan: <b style={{ color: 'var(--tinta)', fontSize: 15 }}>{df.suscripcion.plan}</b></span>
                <span className="pill ok">Activa</span>
              </button>
              {suscAbierta && (
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <span className="tenue" style={{ fontSize: 12.5 }}>
                    Renta {pesos(df.suscripcion.mensual)}/mes{df.suscripcion.vence ? ` · próximo pago: ${df.suscripcion.vence}${df.suscripcion.diasRestantes !== null && df.suscripcion.diasRestantes >= 0 ? ` (en ${df.suscripcion.diasRestantes} días)` : ''}` : ''}
                  </span>
                  <button type="button" className="btn btn-sec btn-chico" onClick={() => df.pagarSuscripcion()}>Pagar renta · {pesos(df.suscripcion.mensual)}</button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCortaEs = (f: string) => { const [, m, d] = f.split('-').map(Number); return m && d ? `${d} de ${MESES[m - 1]}` : f; };
