import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Academy } from './academy/Academy.tsx'

// El subdominio academy.<dominio> sirve el mismo bundle pero muestra el portal
// educativo (Academy), no el panel de la tienda. La sesión se comparte por la
// cookie en .dealflow.sbs, así que las mismas credenciales de admin sirven acá.
const esAcademy = /^academy\./i.test(window.location.hostname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {esAcademy ? <Academy /> : <App />}
  </StrictMode>,
)
