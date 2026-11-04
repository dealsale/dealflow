import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PagoOffline } from './components/PagoOffline.tsx'
import { Academy } from './academy/Academy.tsx'
import { PortalProveedores } from './proveedores/Portal.tsx'
import { iniciarAutoActualizacion } from './lib/autoUpdate'
const Drive = lazy(() => import('./drive/Drive').then((m) => ({ default: m.Drive })))
const PaginaEscritorio = lazy(() => import('./escritorio/PaginaEscritorio').then((m) => ({ default: m.PaginaEscritorio })))
const PaginaLlamada = lazy(() => import('./components/PaginaLlamada').then((m) => ({ default: m.PaginaLlamada })))
import { iniciarTraduccion } from './i18n/traductor'
import { instalarPestanaTienda } from './lib/pestanaTienda'

// Antes que nada: cada pestaña recuerda su tienda (no guardar en la tienda equivocada).
instalarPestanaTienda()

// Ventana aparte de la llamada de soporte (/llamada): solo la llamada, sin recargas automáticas.
const esLlamada = /^\/llamada(\/|$)/.test(window.location.pathname)
// App de escritorio «DealFlow Soporte» (/escritorio): tampoco se recarga sola (podría cortar una sesión).
const esEscritorio = /^\/escritorio(\/|$)/.test(window.location.pathname)
if (!esLlamada && !esEscritorio) iniciarAutoActualizacion()

// El subdominio academy.<dominio> muestra el portal educativo (Academy). También
// se puede abrir por la ruta /academy en el host actual (útil para probarlo antes
// de configurar el subdominio). La sesión se comparte por la cookie.
const esAcademy = /^academy\./i.test(window.location.hostname) || /^\/academy(\/|$)/i.test(window.location.pathname);
// Portal de proveedores: proveedores.<dominio> o la ruta /proveedores (sesión propia).
const esProveedores = /^proveedores\./i.test(window.location.hostname) || /^\/proveedores(\/|$)/i.test(window.location.pathname);
// Drive del equipo DealFlow: drive.<dominio> o la ruta /drive (misma sesión).
const esDrive = /^drive\./i.test(window.location.hostname) || /^\/drive(\/|$)/i.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {esEscritorio ? <Suspense fallback={null}><PaginaEscritorio /></Suspense> : esLlamada ? <Suspense fallback={null}><PaginaLlamada /></Suspense> : esDrive ? <Suspense fallback={null}><Drive /></Suspense> : esProveedores ? <PortalProveedores /> : esAcademy ? <Academy /> : <><App /><PagoOffline /></>}
  </StrictMode>,
)

// Interfaz en inglés si el usuario lo eligió (traduce en vivo lo que se pinta).
iniciarTraduccion()
