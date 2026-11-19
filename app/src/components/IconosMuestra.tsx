import type { CSSProperties, ReactNode } from 'react';
import { ICONOS, Icono, type NombreIcono } from './Icono';

/**
 * Muestra de los íconos de DealFlow (/iconos): todos los íconos en tema claro y oscuro, normales y con el
 * degradado de marca, y ejemplos de cómo quedan los botones y la Logística al cambiar los emojis.
 */
const GRUPOS: { titulo: string; nombres: NombreIcono[] }[] = [
  { titulo: 'Pedidos', nombres: ['editar', 'eliminar', 'copiar', 'enlace', 'ver', 'buscar', 'agregar', 'cerrar'] },
  { titulo: 'Envíos y logística', nombres: ['despachar', 'paquete', 'entregado', 'devuelto', 'guia', 'ubicacion', 'oficina', 'novedad', 'pendiente', 'devolver'] },
  { titulo: 'Estados', nombres: ['ok', 'error', 'alerta', 'listo', 'siguiente', 'actualizar'] },
  { titulo: 'Ventas y chats', nombres: ['chat', 'llamar', 'enviar', 'bot', 'tienda', 'bolsa', 'carrito', 'campana', 'objetivo', 'regalo', 'rapido', 'etiqueta', 'aliado', 'pago', 'billetera'] },
  { titulo: 'Contenido', nombres: ['imagen', 'foto', 'video', 'documento', 'adjunto', 'descargar', 'subir', 'ia'] },
  { titulo: 'Cuenta y ajustes', nombres: ['candado', 'notificacion', 'ajustes', 'equipo', 'estadisticas', 'web'] },
];

const claro = { fondo: '#F8FAFC', tarjeta: '#FFFFFF', borde: '#E2E8F0', texto: '#0F172A', suave: '#64748B' };
const oscuro = { fondo: '#050713', tarjeta: '#0D1730', borde: '#1E2A4A', texto: '#EEF3FF', suave: '#9AA8C9' };
type Tema = typeof claro;

function Celda({ n, t, degradado }: { n: NombreIcono; t: Tema; degradado: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 12, background: t.tarjeta, border: `1px solid ${t.borde}`, color: t.texto }}>
      <Icono nombre={n} tam={26} degradado={degradado} />
      <span style={{ fontSize: 11, color: t.suave }}>{n}</span>
    </div>
  );
}

const boton = (t: Tema, principal: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  ...(principal
    ? { border: 'none', color: '#fff', background: 'linear-gradient(120deg, #10b981 0%, #2e8bff 50%, #7658ff 100%)', textShadow: '0 0 1px rgba(3,32,40,.55), 0 1px 2px rgba(3,32,40,.45)', boxShadow: '0 8px 22px -10px rgba(46,139,255,.75)' }
    : { background: t.tarjeta, color: t.texto, border: `1px solid ${t.borde}` }),
});

function Ejemplos({ t }: { t: Tema }) {
  const fila = (antes: ReactNode, despues: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${t.borde}` }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{antes}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{despues}</div>
    </div>
  );
  const kpi = (icono: ReactNode, titulo: string, valor: string) => (
    <div style={{ background: t.tarjeta, border: `1px solid ${t.borde}`, borderRadius: 12, padding: '10px 12px', minWidth: 110 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.suave }}>{icono}{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.texto }}>{valor}</div>
    </div>
  );
  return (
    <div style={{ background: t.fondo, border: `1px solid ${t.borde}`, borderRadius: 16, padding: 16, color: t.texto }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, fontWeight: 800, color: t.suave, textTransform: 'uppercase', letterSpacing: '.05em', paddingBottom: 6 }}>
        <span>Hoy (emojis)</span><span>Con los íconos DealFlow</span>
      </div>
      {fila(
        <><button style={boton(t, false)}>✏️ Editar pedido</button><button style={boton(t, false)}>🗑 Eliminar</button></>,
        <><button style={boton(t, false)}><Icono nombre="editar" tam={16} /> Editar pedido</button><button style={{ ...boton(t, false), color: '#DC2626' }}><Icono nombre="eliminar" tam={16} /> Eliminar</button></>,
      )}
      {fila(
        <button style={boton(t, true)}>📦 Cotizar y generar guía</button>,
        <button style={boton(t, true)}><Icono nombre="despachar" tam={17} /> Cotizar y generar guía</button>,
      )}
      {fila(
        <>{kpi('📦', 'Pedidos', '128')}{kpi('🚚', 'En camino', '34')}{kpi('⚠', 'Novedades', '5')}{kpi('✅', 'Entregados', '82')}</>,
        <>{kpi(<Icono nombre="paquete" tam={15} degradado />, 'Pedidos', '128')}{kpi(<Icono nombre="despachar" tam={15} degradado />, 'En camino', '34')}{kpi(<Icono nombre="novedad" tam={15} color="#F59E0B" />, 'Novedades', '5')}{kpi(<Icono nombre="entregado" tam={15} color="#10B981" />, 'Entregados', '82')}</>,
      )}
      {fila(
        <span style={{ fontSize: 13 }}>🧾 Guía 240012345678 · 📍 Cali</span>,
        <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icono nombre="guia" tam={15} /> Guía 240012345678 · <Icono nombre="ubicacion" tam={15} /> Cali</span>,
      )}
    </div>
  );
}

export function IconosMuestra() {
  const total = Object.keys(ICONOS).length;
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', padding: '28px 16px 60px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: '#0F172A' }}>Íconos DealFlow</h1>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 14 }}>{total} íconos con el mismo estilo. Normales toman el color del texto (se adaptan al tema); los de degradado llevan el verde → azul → violeta de la marca.</p>
        </div>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
          <div><h2 style={{ fontSize: 15, color: '#0F172A' }}>Así cambiaría el panel · tema claro</h2><Ejemplos t={claro} /></div>
          <div><h2 style={{ fontSize: 15, color: '#0F172A' }}>Así cambiaría el panel · tema oscuro</h2><Ejemplos t={oscuro} /></div>
        </section>
        {GRUPOS.map((g) => (
          <section key={g.titulo}>
            <h2 style={{ fontSize: 15, color: '#0F172A', margin: '0 0 10px' }}>{g.titulo}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
              {[claro, oscuro].map((t, i) => (
                <div key={i} style={{ background: t.fondo, borderRadius: 16, padding: 12, border: `1px solid ${t.borde}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11.5, color: t.suave, fontWeight: 700 }}>{i ? 'Oscuro' : 'Claro'} · normal</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>{g.nombres.map((n) => <Celda key={n} n={n} t={t} degradado={false} />)}</div>
                  <div style={{ fontSize: 11.5, color: t.suave, fontWeight: 700 }}>{i ? 'Oscuro' : 'Claro'} · degradado de marca</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>{g.nombres.map((n) => <Celda key={n} n={n} t={t} degradado />)}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
