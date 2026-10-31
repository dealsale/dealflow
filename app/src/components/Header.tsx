import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { NotificationsMenu } from './NotificationsMenu';
import { ProfileMenu } from './ProfileMenu';
import { pedirTexto, confirmar } from './dialogs';
import { IcoChevron, IcoFoco, IcoMenu } from './iconosNoche';

/** Selector de tienda (.tienda del artifact): cambia entre las tiendas del dueño y crea otra. */
function StoreSwitcher({ df }: { df: DealFlowState }) {
  const [open, setOpen] = useState(false);
  const tiendas = df.misTiendas;
  const varias = tiendas.length > 1;
  const nuevaTienda = async () => {
    const nombre = await pedirTexto({
      titulo: 'Crear otra tienda',
      mensaje: 'Cada tienda extra tiene su propio número y catálogo, y cuesta $250.000/mes. ¿Cómo se va a llamar?',
      placeholder: 'Ej: Urban Supply Medellín',
      aceptar: 'Crear tienda',
    });
    if (nombre && nombre.trim()) df.crearTienda(nombre.trim());
  };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="tienda" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {df.headerTitle}
        <IcoChevron />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--noche2)', border: '1px solid var(--linea2)', borderRadius: 12, boxShadow: '0 20px 50px -15px rgba(0,0,0,.6)', padding: 6, minWidth: 250, zIndex: 41 }}>
            {varias && <span className="eti" style={{ display: 'block', padding: '6px 10px 4px', fontSize: 10 }}>Mis tiendas</span>}
            {tiendas.map((t) => (
              <div
                key={t.id}
                onClick={() => { if (!t.activa) df.cambiarTienda(t.id); else setOpen(false); }}
                className="opcion"
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: t.activa ? 'default' : 'pointer', background: t.activa ? 'rgba(46,139,255,.12)' : undefined }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{t.nombre}</span>
                {t.bloqueada && <span className="pill mal sin chica">pago pendiente</span>}
                {t.activa && <span className="ok" style={{ fontSize: 12 }}>✓</span>}
                {!t.activa && varias && (
                  <span
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirmar({ titulo: `Eliminar "${t.nombre}"`, mensaje: 'Se elimina esta tienda y todo su contenido (productos, pedidos, chats). Si fue un error, escríbenos en los próximos 30 días y la recuperamos.', aceptar: 'Eliminar', peligro: true })) df.eliminarMiTienda(t.id);
                    }}
                    className="df-danger-hover"
                    title="Eliminar esta tienda"
                    style={{ color: 'var(--niebla2)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 3 }}
                  >🗑</span>
                )}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--linea)', margin: '4px 0' }} />
            <button type="button" className="opcion" onClick={() => { setOpen(false); void nuevaTienda(); }} style={{ color: 'var(--cian)', fontWeight: 700, fontSize: 13.5 }}>
              + Crear otra tienda
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Barra superior del rediseño (.topbar): menú, tienda, píldoras de estado (WhatsApp,
 * asistente, Effi) y, a la derecha, notificaciones y el perfil.
 */
export function Header({ df }: { df: DealFlowState }) {
  const atendiendo = df.isVendedor ? df.crmChats.filter((c) => c.live).length : 0;
  return (
    <header className="topbar">
      <button type="button" className="icono-btn" onClick={df.toggleSidebar} aria-label={df.sidebarVisible ? 'Ocultar el menú' : 'Mostrar el menú'} title={df.sidebarVisible ? 'Ocultar el menú lateral' : 'Mostrar el menú lateral'}>
        <IcoMenu />
      </button>
      {df.isVendedor && !df.esAgente ? <StoreSwitcher df={df} /> : <span className="tienda" style={{ cursor: 'default' }}>{df.headerTitle}</span>}
      {df.isVendedor && <span className={`pill ${df.waConnected ? 'ok' : 'mal'}`}>{df.waLabel}</span>}
      {df.isVendedor && atendiendo > 0 && <span className="pill ia sin">✦ Asistente atendiendo {atendiendo} chat{atendiendo === 1 ? '' : 's'}</span>}
      {df.isVendedor && df.effiApi?.conectado && <span className="pill info">Effi listo para despachar</span>}
      {df.esTest && <span className="pill aviso sin" title="test.dealflow.sbs: aquí se trabaja el diseño nuevo con datos de prueba">Versión de prueba</span>}
      <div className="usuario">
        <button
          type="button"
          onClick={df.toggleFloatingNav}
          className={`icono-btn${df.floatingNav ? ' on' : ''}`}
          title={df.floatingNav ? 'Botón flotante de menú: activado. Toca para desactivarlo.' : 'Botón flotante de menú: desactivado. Toca para activarlo.'}
          aria-label="Botón flotante de menú"
        >
          <IcoFoco />
        </button>
        <NotificationsMenu df={df} />
        <ProfileMenu df={df} />
      </div>
    </header>
  );
}
