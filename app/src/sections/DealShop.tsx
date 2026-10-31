import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { degradadoDe, iniciales, pesos } from '../lib/noche';
import skyMascota from '../assets/sky-mascota.png';

/**
 * DealShop (diseño "Noche"): plantillas y complementos que se instalan con un clic.
 * Las de pago se cobran a la cuenta DealFlow; se desinstalan cuando quieras.
 */
export function DealShop({ df }: { df: DealFlowState }) {
  const [desinst, setDesinst] = useState<{ id: string; nombre: string } | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'instaladas' | 'gratis' | 'pago'>('todas');
  const lista = df.plantillas.filter((p) => filtro === 'todas' ? true : filtro === 'instaladas' ? p.instalada : filtro === 'gratis' ? p.precio === 0 : p.precio > 0);
  const destacada = df.plantillas.find((p) => !p.instalada) || df.plantillas[0] || null;
  const ocupada = (id: string) => df.instalando === id || df.instalando === 'reinstalar:' + id;

  return (
    <section data-screen-label="DealShop" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Apps y complementos</span>
          <h1>DealShop</h1>
          <p className="sub">Plantillas y funciones extra que instalas con un clic: tu asistente queda configurado para vender sin escribir nada. Las de pago se cobran a tu cuenta DealFlow; las desinstalas cuando quieras.</p>
        </div>
        <div className="fila">
          {([['todas', 'Todas'], ['instaladas', 'Instaladas'], ['gratis', 'Gratis'], ['pago', 'De pago']] as const).map(([f, t]) => (
            <button key={f} type="button" className={`chip${filtro === f ? ' activa' : ''}`} onClick={() => setFiltro(f)}>{t}</button>
          ))}
        </div>
      </div>

      {df.plantillaMsg && <div className="aviso-caja ok" style={{ fontWeight: 600 }}>{df.plantillaMsg}</div>}

      {destacada && (
        <section className="portada">
          <img src={skyMascota} alt="" style={{ width: 84, height: 84, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eti" style={{ color: '#D9C6FF' }}>{destacada.instalada ? 'Ya la tienes' : 'Recomendada para empezar'}</span>
            <h2 style={{ fontSize: 22 }}>{destacada.nombre}</h2>
            <p className="suave-t" style={{ fontSize: 13.5, maxWidth: 560 }}>{destacada.descripcion}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <b className="mono" style={{ fontSize: 18 }}>{destacada.precio === 0 ? 'Gratis' : pesos(destacada.precio)}</b>
            {destacada.instalada
              ? <span className="pill ok">Instalada</span>
              : <button type="button" className="btn btn-pri" disabled={ocupada(destacada.id)} onClick={() => !ocupada(destacada.id) && df.instalarPlantilla(destacada.id)}>{df.instalando === destacada.id ? 'Instalando…' : 'Instalar con un clic'}</button>}
          </div>
        </section>
      )}

      {lista.length === 0 && <div className="vacio">No hay plantillas en esta categoría todavía.</div>}
      <div className="apps">
        {lista.map((p) => (
          <article key={p.id} className="app-c">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="logo-a" style={{ background: degradadoDe(p.nombre) }}>{iniciales(p.nombre)}</span>
              <div style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{p.nombre}</b><div className="tenue" style={{ fontSize: 11.5 }}>Plantilla de tienda · {p.features.length} funciones</div></div>
              <span className={`pill ${p.precio === 0 ? 'ok' : 'aviso'} sin`} style={{ marginLeft: 'auto', fontSize: 10.5 }}>{p.precio === 0 ? 'Gratis' : pesos(p.precio)}</span>
            </div>
            <p className="suave-t" style={{ fontSize: 12.5 }}>{p.descripcion}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              {p.features.map((f, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span className="ok" style={{ fontWeight: 700, flexShrink: 0 }}>✓</span><span>{f}</span></div>)}
            </div>
            <div className="fila" style={{ gap: 6 }}>
              {p.instalada ? (
                <>
                  <span className="pill ok">Instalada</span>
                  <button type="button" className="btn btn-fant btn-chico" disabled={ocupada(p.id)} onClick={() => !ocupada(p.id) && df.instalarPlantilla(p.id, true)} title="Vuelve a dejar tu asistente y el producto de ejemplo tal cual la plantilla (úsalo si tu tienda quedó vacía)." style={{ marginLeft: 'auto' }}>{df.instalando === 'reinstalar:' + p.id ? 'Reinstalando…' : '↻ Reinstalar'}</button>
                  <button type="button" className="btn btn-fant btn-chico" onClick={() => setDesinst({ id: p.id, nombre: p.nombre })} style={{ color: 'var(--coral)' }}>Desinstalar</button>
                </>
              ) : (
                <button type="button" className="btn btn-sec btn-chico" disabled={ocupada(p.id)} onClick={() => !ocupada(p.id) && df.instalarPlantilla(p.id)} style={{ marginLeft: 'auto' }}>{df.instalando === p.id ? 'Instalando…' : 'Instalar'}</button>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="tenue" style={{ fontSize: 12.5 }}>Pronto habrá más plantillas y complementos (algunos premium) para distintos tipos de negocio.</p>

      {desinst && (
        <div onClick={() => setDesinst(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,16,.65)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="tarjeta" style={{ width: 440, maxWidth: '100%' }}>
            <h2>Desinstalar «{desinst.nombre}»</h2>
            <p className="suave-t" style={{ fontSize: 13.5 }}>¿Quieres borrar también los <b>productos/servicios</b> que trajo esta plantilla? En ambos casos se limpian el prompt, las reglas y las instrucciones del asistente.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" className="btn btn-mal" onClick={() => { df.desinstalarPlantilla(desinst.id, true); setDesinst(null); }}>🗑️ Sí, borrar todo (asistente + productos)</button>
              <button type="button" className="btn btn-sec" onClick={() => { df.desinstalarPlantilla(desinst.id, false); setDesinst(null); }}>No, solo quitar el asistente (conserva mis productos)</button>
              <button type="button" className="btn btn-fant" onClick={() => setDesinst(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
