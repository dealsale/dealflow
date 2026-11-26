import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icono, IconoColor, type NombreIcono } from './Icono';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';
import { fmt } from '../lib/format';
import { fmtCO } from '../lib/fechaCO';
import {
  apiAjusteBilleteraDF, apiAjustesDF, apiBodegaDFAdmin, apiBodegaProveedorDF, apiDespacharDFAdmin, apiProductoDF, apiResolverRetiroDF, apiVerificarCuentaDF,
  type AjustesDF, type BodegaDFAdmin, type BodegaProvDF, type ProductoDFAdmin,
} from '../lib/api';

/*
 * Administración → Proveedores → Bodega DealFlow: la cuenta de Skydropx de DealFlow (variables
 * de Railway), los ajustes de cobro, qué productos de la Biblioteca despacha DealFlow, las
 * bodegas de los proveedores, las billeteras de las tiendas (retiros y ajustes) y los despachos.
 */

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 10px', font: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 9, padding: '8px 12px', font: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPri: CSSProperties = { ...btn, background: 'var(--df-brand)', color: '#fff', border: 'none' };
const etiqueta: CSSProperties = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' };
const fecha = (s: string) => { if (!s) return ''; const d = new Date(/[zZ]$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? s : fmtCO('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d); };
const soloNum = (v: string) => v.replace(/[^\d.]/g, '');

type Sub = 'productos' | 'bodegas' | 'billeteras' | 'despachos';

export function BodegaDFAdminPanel({ alCrear }: { alCrear?: () => void }) {
  const [d, setD] = useState<BodegaDFAdmin | null>(null);
  const [error, setError] = useState('');
  const [sub, setSub] = useState<Sub>('productos');
  const cargar = () => void apiBodegaDFAdmin().then((r) => { if (r.data) { setD(r.data); setError(''); } else setError(r.error || 'No se pudo cargar.'); });
  useEffect(cargar, []);
  if (error) return <div style={{ ...card, padding: 20, color: 'var(--df-danger)' }}>{error}</div>;
  if (!d) return <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--df-text-muted)' }}>Cargando la bodega…</div>;
  const activos = d.productos.filter((p) => p.activo).length;
  const pendRetiros = d.billeteras ? d.billeteras.retiros.filter((r) => r.estado === 'pendiente').length : 0;
  const conProblema = d.despachos.filter((p) => ['error', 'sin_saldo', 'mixto', 'sin_activar'].includes(p.dfEstado)).length;
  const sa = !!d.esSuper;
  const subTab = (id: Sub, texto: string, icono: NombreIcono, color: string, badge?: number) => (
    <button onClick={() => setSub(id)} style={{ ...btn, borderRadius: 999, padding: '7px 13px', borderColor: sub === id ? 'var(--df-brand)' : 'var(--df-border)', background: sub === id ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)' }}>
      <IconoColor color={color}><Icono nombre={icono} tam={15} /></IconoColor>{texto}
      {!!badge && <span style={{ background: color, color: '#0B1020', borderRadius: 999, padding: '0 7px', fontSize: 11, fontWeight: 800 }}>{badge}</span>}
    </button>
  );
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px', flex: 1 }}>DealShop</h1>
          {alCrear && <button className="df-btn-primary" style={btnPri} onClick={alCrear} title="Abre el editor completo de la Biblioteca: crea el producto con fotos, variantes y reglas, agrégalo a la Biblioteca y márcalo aquí como DealShop."><Icono nombre="agregar" tam={14} />Crear producto</button>}
        </div>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>Productos que vende DealFlow: las tiendas los desbloquean (gratis o con pago único), DealFlow genera la guía con Envíos DealFlow desde la bodega del proveedor, recauda el contraentrega y le abona a la tienda. El producto se crea igual que en la Biblioteca y aquí se le asigna la bodega y el costo.</p>
      </div>
      {sa && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <Cuenta cuenta={d.cuenta} onCambio={(c) => setD({ ...d, cuenta: c })} />
          <Ajustes ajustes={d.ajustes} onGuardado={(a) => setD({ ...d, ajustes: a })} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Kpi titulo="Productos activos" valor={String(activos)} color="#A78BFA" icono="paquete" />
        {d.billeteras && <Kpi titulo="Dinero en custodia" valor={fmt(d.billeteras.enCustodia)} color="#34D399" icono="billetera" />}
        {d.billeteras && <Kpi titulo="Retiros por pagar" valor={String(pendRetiros)} color="#F472B6" icono="pago" />}
        <Kpi titulo="Despachos con problema" valor={String(conProblema)} color="#F87171" icono="alerta" />
        {d.ganancia && <Kpi titulo={`Ganancia por guías (30 días · ${d.ganancia.guiasMes})`} valor={fmt(d.ganancia.mes)} color="#818CF8" icono="dinero" />}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {subTab('productos', 'Productos', 'paquete', '#A78BFA')}
        {subTab('bodegas', 'Bodegas', 'bodega', '#60A5FA', d.bodegas.filter((b) => b.productos > 0 && b.faltan.length).length)}
        {d.billeteras && subTab('billeteras', 'Billeteras y retiros', 'billetera', '#34D399', pendRetiros)}
        {subTab('despachos', 'Despachos', 'despachar', '#FB923C', conProblema)}
      </div>
      {sub === 'productos' && <Productos d={d} onCambio={cargar} />}
      {sub === 'bodegas' && <Bodegas d={d} onCambio={cargar} />}
      {sub === 'billeteras' && d.billeteras && <Billeteras d={d} onCambio={cargar} />}
      {sub === 'despachos' && <Despachos d={d} onCambio={cargar} />}
    </div>
  );
}

function Cuenta({ cuenta, onCambio }: { cuenta: BodegaDFAdmin['cuenta']; onCambio: (c: BodegaDFAdmin['cuenta']) => void }) {
  const [verificando, setVerificando] = useState(false);
  const ok = cuenta.configurada;
  return (
    <section style={{ ...card, padding: '16px 18px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
        <IconoColor color={ok ? '#34D399' : '#FBBF24'}><Icono nombre="antena" tam={17} /></IconoColor>Cuenta de envíos de DealFlow (Skydropx)
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color: ok ? '#10B981' : '#D97706', background: ok ? 'rgba(16,185,129,.14)' : 'rgba(251,191,36,.16)' }}>{ok ? `Conectada · ${cuenta.ambiente === 'sandbox' ? 'pruebas' : 'producción'}` : 'Sin configurar'}</span>
      </div>
      {ok ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Client ID <b style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{cuenta.clientId}</b> (de las variables de Railway).</div>
          {cuenta.webhook && (
            <div style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
              <span style={{ color: 'var(--df-text-muted)' }}>Pega esta URL en Skydropx → Conexiones → Webhooks para recibir los estados al instante:</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={cuenta.webhook} style={{ ...input, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
                <button style={btn} onClick={() => { void navigator.clipboard?.writeText(cuenta.webhook); notificar('URL copiada.', 'ok'); }}><Icono nombre="copiar" tam={14} /></button>
              </div>
            </div>
          )}
          {cuenta.verificacion && <div style={{ fontSize: 13, fontWeight: 700, color: cuenta.verificacion.ok ? '#10B981' : 'var(--df-danger)' }}>{cuenta.verificacion.ok ? '✓ Skydropx aceptó las credenciales.' : cuenta.verificacion.error}</div>}
          <div><button style={btn} disabled={verificando} onClick={async () => { setVerificando(true); const r = await apiVerificarCuentaDF(); setVerificando(false); if (r.data) onCambio(r.data); else notificar(r.error || 'No se pudo verificar.', 'error'); }}><IconoColor color="#60A5FA"><Icono nombre="ok" tam={14} /></IconoColor>{verificando ? 'Verificando…' : 'Probar conexión'}</button></div>
        </>
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Crea estas variables en Railway (servicio de DealFlow → Variables) y vuelve a desplegar:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}>
            <li>SKYDROPX_DF_CLIENT_ID</li><li>SKYDROPX_DF_CLIENT_SECRET</li><li>SKYDROPX_DF_AMBIENTE = produccion</li>
          </ul>
        </div>
      )}
    </section>
  );
}

function Ajustes({ ajustes, onGuardado }: { ajustes: AjustesDF; onGuardado: (a: AjustesDF) => void }) {
  const [a, setA] = useState<Record<keyof AjustesDF, string>>(() => Object.fromEntries(Object.entries(ajustes).map(([k, v]) => [k, String(v)])) as Record<keyof AjustesDF, string>);
  const campo = (k: keyof AjustesDF, texto: string, ayuda: string) => (
    <label style={etiqueta}>{texto}<input value={a[k]} onChange={(e) => setA({ ...a, [k]: soloNum(e.target.value) })} inputMode="decimal" style={input} title={ayuda} /></label>
  );
  return (
    <section style={{ ...card, padding: '16px 18px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><IconoColor color="#FBBF24"><Icono nombre="ajustes" tam={17} /></IconoColor>Cobros de Envíos DealFlow</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {campo('comisionPct', 'Comisión de recaudo (%)', 'Se descuenta del valor que paga el cliente contra entrega')}
        {campo('comisionFija', 'Comisión fija ($)', 'Valor fijo por pedido entregado contra entrega')}
        {campo('fleteDevolucionPct', 'Flete de devolución (% del envío)', '100 = se cobra lo mismo que costó el envío de ida')}
        {campo('tarifaTienda', 'Guía DealShop · a la tienda ($)', 'Se descuenta de la billetera de la tienda en cada guía de DealShop')}
        {campo('tarifaProveedor', 'Guía DealShop · al proveedor ($)', 'Se descuenta de lo que DealFlow le paga al proveedor')}
        {campo('tarifaPropia', 'Guía de productos propios ($)', 'Servicio por guía cuando la tienda despacha sus propios productos con Envíos DealFlow')}
        {campo('recargaMin', 'Recarga mínima ($)', '')}
        {campo('retiroMin', 'Retiro mínimo ($)', '')}
      </div>
      <div><button className="df-btn-primary" style={btnPri} onClick={async () => {
        const r = await apiAjustesDF(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Number(v)])) as Partial<AjustesDF>);
        if (r.data) { onGuardado(r.data); notificar('Ajustes guardados.', 'ok'); } else notificar(r.error || 'No se guardó.', 'error');
      }}>Guardar ajustes</button></div>
    </section>
  );
}

function Productos({ d, onCambio }: { d: BodegaDFAdmin; onCambio: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const lista = d.productos.filter((p) => !q.trim() || p.nombre.toLowerCase().includes(q.trim().toLowerCase())).sort((x, y) => Number(y.activo) - Number(x.activo));
  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--df-border)' }}>
        <span style={{ fontSize: 13.5, color: 'var(--df-text-muted)', flex: 1 }}>Marca qué productos de la Biblioteca son de DealShop, de qué bodega salen y cuánto cuestan. Las tiendas los ven en DealShop con su costo por unidad.</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" style={{ ...input, maxWidth: 240, borderRadius: 999 }} />
      </div>
      {!lista.length && <div style={{ padding: 30, textAlign: 'center', color: 'var(--df-text-muted)' }}>No hay productos en la Biblioteca todavía.</div>}
      {lista.map((p) => <FilaProducto key={p.id} p={p} d={d} abierto={abierto === p.id} onAbrir={() => setAbierto(abierto === p.id ? null : p.id)} onGuardado={() => { setAbierto(null); onCambio(); }} />)}
    </section>
  );
}

function FilaProducto({ p, d, abierto, onAbrir, onGuardado }: { p: ProductoDFAdmin; d: BodegaDFAdmin; abierto: boolean; onAbrir: () => void; onGuardado: () => void }) {
  const [f, setF] = useState(() => ({ activo: p.activo, proveedorId: p.proveedorId, costo: p.costo ? String(p.costo) : '', costos: Object.fromEntries(p.variantes.map((v) => [v, p.costos[v] ? String(p.costos[v]) : ''])), paquete: { largo: String(p.paquete.largo), ancho: String(p.paquete.ancho), alto: String(p.paquete.alto), peso: String(p.paquete.peso), contenido: p.paquete.contenido } }));
  const prov = d.bodegas.find((b) => b.id === p.proveedorId);
  const guardar = async () => {
    const r = await apiProductoDF(p.id, {
      activo: f.activo, proveedorId: f.proveedorId, costo: Number(f.costo) || 0,
      costos: Object.fromEntries(Object.entries(f.costos).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])),
      paquete: { largo: Number(f.paquete.largo), ancho: Number(f.paquete.ancho), alto: Number(f.paquete.alto), peso: Number(f.paquete.peso), contenido: f.paquete.contenido },
    });
    if (r.error) notificar(r.error, 'error'); else { notificar(f.activo ? `«${p.nombre}» ya lo despacha DealFlow.` : 'Guardado.', 'ok'); onGuardado(); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--df-border)' }}>
      <button onClick={onAbrir} className="df-row-hover" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '12px 16px', background: 'none', border: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.nombre}
            {p.activo ? <Chip color="#A78BFA" icono="despachar">Despacha DealFlow</Chip> : <Chip color="#94A3B8" icono="pausa">Solo importar</Chip>}
            {!p.visible && <Chip color="#94A3B8" icono="oculto">Oculto en la Biblioteca</Chip>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginTop: 2 }}>
            Venta sugerida {fmt(p.precio)}{p.activo ? ` · costo ${fmt(p.costo)}${Object.keys(p.costos).length ? ` (${Object.keys(p.costos).length} variantes con su costo)` : ''} · ${prov?.nombre || 'sin proveedor'}${prov?.bodega.ciudad ? `, ${prov.bodega.ciudad}` : ''}` : ''} · {p.importos} tienda{p.importos === 1 ? '' : 's'} lo tienen
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--df-text-faint)', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>
      {abierto && (
        <div className="df-pop" style={{ padding: '4px 16px 16px', display: 'grid', gap: 12 }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Es de DealShop (lo despacha DealFlow)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label style={etiqueta}>Proveedor (bodega)
              <Dropdown ariaLabel="Proveedor" value={f.proveedorId} onChange={(v) => setF({ ...f, proveedorId: v })} placeholder="Elige el proveedor"
                options={d.bodegas.map((b) => ({ value: b.id, label: `${b.nombre}${b.bodega.ciudad ? ` · ${b.bodega.ciudad}` : ''}${b.faltan.length ? ' (bodega incompleta)' : ''}` }))} />
            </label>
            <label style={etiqueta}>Costo por unidad ($)<input value={f.costo} onChange={(e) => setF({ ...f, costo: soloNum(e.target.value) })} inputMode="numeric" placeholder="Lo que cobra DealFlow por unidad" style={input} /></label>
          </div>
          {p.variantes.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={etiqueta}>Costo por variante (vacío = el costo general)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {p.variantes.map((v) => (
                  <label key={v} style={{ ...etiqueta, fontWeight: 600 }}>{v}<input value={f.costos[v] || ''} onChange={(e) => setF({ ...f, costos: { ...f.costos, [v]: soloNum(e.target.value) } })} inputMode="numeric" placeholder={f.costo || '—'} style={input} /></label>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={etiqueta}>Paquete de UNA unidad (para cotizar el envío)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {([['peso', 'Peso (kg)'], ['largo', 'Largo (cm)'], ['ancho', 'Ancho (cm)'], ['alto', 'Alto (cm)']] as const).map(([k, t]) => (
                <label key={k} style={{ ...etiqueta, fontWeight: 600 }}>{t}<input value={f.paquete[k]} onChange={(e) => setF({ ...f, paquete: { ...f.paquete, [k]: soloNum(e.target.value) } })} inputMode="decimal" style={input} /></label>
              ))}
              <label style={{ ...etiqueta, fontWeight: 600, gridColumn: 'span 2' }}>Contenido (va en la guía)<input value={f.paquete.contenido} onChange={(e) => setF({ ...f, paquete: { ...f.paquete, contenido: e.target.value } })} placeholder={p.nombre} style={input} /></label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={btn} onClick={onAbrir}>Cancelar</button>
            <button className="df-btn-primary" style={btnPri} onClick={() => void guardar()}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bodegas({ d, onCambio }: { d: BodegaDFAdmin; onCambio: () => void }) {
  if (!d.bodegas.length) return <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--df-text-muted)' }}>Primero crea la cuenta del proveedor en «Accesos y convenios». Después pon aquí la dirección de su bodega.</div>;
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>{d.bodegas.map((b) => <FormBodega key={b.id} b={b} onCambio={onCambio} />)}</div>;
}
function FormBodega({ b, onCambio }: { b: BodegaDFAdmin['bodegas'][number]; onCambio: () => void }) {
  const [f, setF] = useState<BodegaProvDF>(b.bodega);
  const campo = (k: keyof BodegaProvDF, t: string, ph = '') => <label style={etiqueta}>{t}<input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} style={input} /></label>;
  return (
    <section style={{ ...card, padding: '14px 16px', display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
        <IconoColor color="#60A5FA"><Icono nombre="bodega" tam={17} /></IconoColor>{b.nombre}
        <span style={{ marginLeft: 'auto' }}>{b.faltan.length ? <Chip color="#FBBF24" icono="alerta">Falta {b.faltan.join(', ')}</Chip> : <Chip color="#34D399" icono="ok">Lista</Chip>}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{b.email} · {b.productos} producto{b.productos === 1 ? '' : 's'} de DealShop</div>
      {b.cuentas && b.cuentas.guias > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { t: 'Guías', v: String(b.cuentas.guias), c: '#60A5FA' },
            { t: 'Entregados', v: String(b.cuentas.entregados), c: '#34D399' },
            { t: 'Le debemos', v: fmt(b.cuentas.debemos), c: b.cuentas.debemos < 0 ? '#F87171' : '#A78BFA' },
          ].map((x) => (
            <div key={x.t} style={{ borderRadius: 9, padding: '6px 8px', background: `color-mix(in srgb, ${x.c} 10%, transparent)` }}>
              <div style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 700 }}>{x.t}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: x.c }}>{x.v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {campo('empresa', 'Empresa', b.nombre)}{campo('telefono', 'Celular de la bodega', '3001234567')}
        {campo('departamento', 'Departamento')}{campo('ciudad', 'Ciudad')}
      </div>
      {campo('direccion', 'Dirección de recogida', 'Calle 10 # 20-30')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{campo('referencia', 'Referencia', 'Bodega 3, local 2')}{campo('email', 'Correo (opcional)', b.email)}</div>
      {campo('nit', 'NIT (opcional)')}
      <div style={{ textAlign: 'right' }}><button className="df-btn-primary" style={btnPri} onClick={async () => { const r = await apiBodegaProveedorDF(b.id, f); if (r.error) notificar(r.error, 'error'); else { notificar('Bodega guardada.', 'ok'); onCambio(); } }}>Guardar bodega</button></div>
    </section>
  );
}

function Billeteras({ d: d0, onCambio }: { d: BodegaDFAdmin; onCambio: () => void }) {
  const d = { ...d0, billeteras: d0.billeteras! };
  const [aj, setAj] = useState({ storeId: '', monto: '', motivo: '' });
  const [nota, setNota] = useState<Record<string, string>>({});
  const resolver = async (id: string, estado: 'pagado' | 'rechazado', monto: number, tienda: string) => {
    if (!(await confirmar({ titulo: estado === 'pagado' ? 'Marcar retiro como pagado' : 'Rechazar retiro', mensaje: estado === 'pagado' ? `¿Ya le transferiste ${fmt(monto)} a ${tienda}? Esto solo lo anota: no mueve dinero.` : `Los ${fmt(monto)} vuelven al saldo de ${tienda}.`, aceptar: estado === 'pagado' ? 'Sí, ya pagué' : 'Rechazar', peligro: estado === 'rechazado' }))) return;
    const r = await apiResolverRetiroDF(id, estado, nota[id] || '');
    if (r.error) notificar(r.error, 'error'); else { notificar('Listo.', 'ok'); onCambio(); }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}><IconoColor color="#F472B6"><Icono nombre="pago" tam={16} /></IconoColor>Retiros</div>
        {!d.billeteras.retiros.length && <div style={{ padding: '18px 16px', color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)', fontSize: 13.5 }}>Ninguna tienda ha pedido retiros.</div>}
        {d.billeteras.retiros.map((r) => (
          <div key={r.id} style={{ padding: '12px 16px', borderTop: '1px solid var(--df-border)', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>{fmt(r.monto)}</b><span>{r.tienda}</span><span style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>{fecha(r.fecha)}</span>
              <span style={{ marginLeft: 'auto' }}><Chip color={r.estado === 'pagado' ? '#34D399' : r.estado === 'rechazado' ? '#F87171' : '#FBBF24'} icono={r.estado === 'pagado' ? 'ok' : r.estado === 'rechazado' ? 'error' : 'pendiente'}>{r.estado === 'pendiente' ? 'Por pagar' : r.estado === 'pagado' ? 'Pagado' : 'Rechazado'}</Chip></span>
            </div>
            <div style={{ fontSize: 13, background: 'var(--df-surface-2)', borderRadius: 8, padding: '7px 10px', overflowWrap: 'anywhere' }}>{r.datos}</div>
            {r.estado === 'pendiente' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={nota[r.id] || ''} onChange={(e) => setNota({ ...nota, [r.id]: e.target.value })} placeholder="Nota (ej. número de la transferencia)" style={input} />
                <button style={{ ...btn, color: 'var(--df-danger)' }} onClick={() => void resolver(r.id, 'rechazado', r.monto, r.tienda)}>Rechazar</button>
                <button className="df-btn-primary" style={btnPri} onClick={() => void resolver(r.id, 'pagado', r.monto, r.tienda)}>Ya lo pagué</button>
              </div>
            ) : r.nota ? <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{r.nota}</div> : null}
          </div>
        ))}
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}><IconoColor color="#34D399"><Icono nombre="billetera" tam={16} /></IconoColor>Saldos de las tiendas</div>
          {!d.billeteras.tiendas.length && <div style={{ padding: '18px 16px', color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)', fontSize: 13.5 }}>Ninguna tienda ha recargado todavía.</div>}
          {d.billeteras.tiendas.map((t) => (
            <div key={t.storeId} style={{ padding: '10px 16px', borderTop: '1px solid var(--df-border)', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tienda}</span>
              <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{fecha(t.ultimo)}</span>
              <b style={{ color: t.saldo < 0 ? 'var(--df-danger)' : undefined }}>{fmt(t.saldo)}</b>
            </div>
          ))}
        </section>
        <section style={{ ...card, padding: '14px 16px', display: 'grid', gap: 9 }}>
          <div style={{ fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}><IconoColor color="#FBBF24"><Icono nombre="ajustes" tam={16} /></IconoColor>Ajustar una billetera</div>
          <Dropdown ariaLabel="Tienda" value={aj.storeId} onChange={(v) => setAj({ ...aj, storeId: v })} placeholder="Elige la tienda" options={d.billeteras.todasLasTiendas.map((t) => ({ value: t.id, label: t.nombre }))} />
          <input value={aj.monto} onChange={(e) => setAj({ ...aj, monto: e.target.value.replace(/[^\d-]/g, '') })} placeholder="Valor (negativo para descontar)" style={input} />
          <input value={aj.motivo} onChange={(e) => setAj({ ...aj, motivo: e.target.value })} placeholder="Motivo (lo ve la tienda)" style={input} />
          <div style={{ textAlign: 'right' }}><button className="df-btn-primary" style={btnPri} onClick={async () => {
            const m = Number(aj.monto);
            if (!aj.storeId || !m) return notificar('Elige la tienda y el valor.', 'info');
            const t = d.billeteras.todasLasTiendas.find((x) => x.id === aj.storeId)?.nombre || '';
            if (!(await confirmar({ titulo: 'Ajustar billetera', mensaje: `${m > 0 ? 'Sumar' : 'Descontar'} ${fmt(Math.abs(m))} ${m > 0 ? 'a' : 'de'} ${t}. Motivo: ${aj.motivo || '(sin motivo)'}.`, aceptar: 'Ajustar' }))) return;
            const r = await apiAjusteBilleteraDF(aj.storeId, m, aj.motivo);
            if (r.error) notificar(r.error, 'error'); else { notificar(`Nuevo saldo: ${fmt(r.data!.saldo)}`, 'ok'); setAj({ storeId: '', monto: '', motivo: '' }); onCambio(); }
          }}>Aplicar ajuste</button></div>
        </section>
      </div>
    </div>
  );
}

const EST: Record<string, { color: string; icono: NombreIcono }> = {
  pendiente: { color: '#60A5FA', icono: 'pendiente' }, sin_saldo: { color: '#FBBF24', icono: 'billetera' }, error: { color: '#F87171', icono: 'alerta' },
  mixto: { color: '#FB923C', icono: 'alerta' }, despachado: { color: '#A78BFA', icono: 'despachar' }, liquidado: { color: '#34D399', icono: 'entregado' }, cancelado: { color: '#94A3B8', icono: 'error' },
};
function Despachos({ d, onCambio }: { d: BodegaDFAdmin; onCambio: () => void }) {
  const [filtro, setFiltro] = useState<'todos' | 'problema'>('todos');
  const lista = d.despachos.filter((p) => filtro === 'todos' || ['error', 'sin_saldo', 'mixto'].includes(p.dfEstado));
  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
        {(['todos', 'problema'] as const).map((f) => <button key={f} onClick={() => setFiltro(f)} style={{ ...btn, borderRadius: 999, borderColor: filtro === f ? 'var(--df-brand)' : 'var(--df-border)', background: filtro === f ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)' }}>{f === 'todos' ? 'Todos' : 'Con problema'}</button>)}
      </div>
      {!lista.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)' }}>Nada por aquí.</div>}
      {lista.map((p) => {
        const e = EST[p.dfEstado] || { color: '#94A3B8', icono: 'paquete' as NombreIcono };
        return (
          <div key={p.id} style={{ padding: '11px 16px', borderTop: '1px solid var(--df-border)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{p.codigo}</b><span style={{ fontSize: 13 }}>{p.tienda}</span><span style={{ color: 'var(--df-text-muted)', fontSize: 12.5 }}>{p.cliente} · {p.ciudad}</span><Chip color={e.color} icono={e.icono}>{p.dfEstadoTexto}</Chip>{p.escalado && !p.escalado.resuelto && <Chip color="#F87171" icono="novedad">Novedad escalada</Chip>}</div>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginTop: 2 }}>{p.guia ? `${p.transportadora} · ${p.guia} · ` : ''}{p.producto ? `producto ${fmt(p.producto)} + envío ${fmt(p.envio)}${p.servicio ? ` · DealFlow ${fmt(p.servicio)}` : ''}${p.cod ? ` · recaudo ${fmt(p.recaudo)}` : ''}` : fecha(p.fecha)}</div>
              {p.detalle && <div style={{ fontSize: 12.5, color: e.color, fontWeight: 600, marginTop: 2 }}>{p.detalle}</div>}
            </div>
            {['error', 'sin_saldo', 'cancelado'].includes(p.dfEstado) && !p.guia && p.estado !== 'Cancelado' && (
              <button style={btn} onClick={async () => { const r = await apiDespacharDFAdmin(p.storeId, p.id); if (r.error) notificar(r.error, 'error'); else notificar(`Despachado · guía ${r.data?.guia || ''}`, 'ok'); onCambio(); }}><IconoColor color="#60A5FA"><Icono nombre="actualizar" tam={14} /></IconoColor>Reintentar</button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Chip({ color, icono, children }: { color: string; icono: NombreIcono; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, whiteSpace: 'nowrap' }}><Icono nombre={icono} tam={12} />{children}</span>;
}
function Kpi({ titulo, valor, color, icono }: { titulo: string; valor: string; color: string; icono: NombreIcono }) {
  return (
    <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 11, alignItems: 'center' }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${color} 16%, transparent)`, flexShrink: 0 }}><IconoColor color={color}><Icono nombre={icono} tam={18} /></IconoColor></span>
      <div><div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600 }}>{titulo}</div><div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{valor}</div></div>
    </div>
  );
}
