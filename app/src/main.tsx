import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PagoOffline } from './components/PagoOffline.tsx'
import { Academy } from './academy/Academy.tsx'
import { PortalProveedores } from './proveedores/Portal.tsx'
import { iniciarAutoActualizacion } from './lib/autoUpdate'
import { iniciarTraduccion } from './i18n/traductor'

iniciarAutoActualizacion()

// El subdominio academy.<dominio> muestra el portal educativo (Academy). También
// se puede abrir por la ruta /academy en el host actual (útil para probarlo antes
// de configurar el subdominio). La sesión se comparte por la cookie.
const esAcademy = /^academy\./i.test(window.location.hostname) || /^\/academy(\/|$)/i.test(window.location.pathname);
// Portal de proveedores: proveedores.<dominio> o la ruta /proveedores (sesión propia).
const esProveedores = /^proveedores\./i.test(window.location.hostname) || /^\/proveedores(\/|$)/i.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {esProveedores ? <PortalProveedores /> : esAcademy ? <Academy /> : <><App /><PagoOffline /></>}
  </StrictMode>,
)

// Interfaz en inglés si el usuario lo eligió (traduce en vivo lo que se pinta).
iniciarTraduccion()
