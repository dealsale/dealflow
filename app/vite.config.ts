import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// En desarrollo (`npm run dev`), el panel se ve EN VIVO en http://localhost:5173 y las
// llamadas al servidor local (http://localhost:3001) pasan por aquí. No afecta producción.
const servidor = process.env.DF_SERVER || 'http://localhost:3001'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: servidor, ws: true },
      '/webhooks': servidor,
      '/l': servidor,
      '/salud': servidor,
    },
  },
})
