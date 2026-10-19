import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Academy } from './academy/Academy.tsx'
import { iniciarAutoActualizacion } from './lib/autoUpdate'
import { iniciarTraduccion } from './i18n/traductor'

iniciarAutoActualizacion()

// El subdominio academy.<dominio> muestra el portal educativo (Academy). También
// se puede abrir por la ruta /academy en el host actual (útil para probarlo antes
// de configurar el subdominio). La sesión se comparte por la cookie.
const esAcademy = /^academy\./i.test(window.location.hostname) || /^\/academy(\/|$)/i.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {esAcademy ? <Academy /> : <App />}
  </StrictMode>,
)

// Interfaz en inglés si el usuario lo eligió (traduce en vivo lo que se pinta).
iniciarTraduccion()
