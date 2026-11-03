# DealFlow Soporte (app de escritorio para Windows)

App para que el equipo de DealFlow entre a **todo el computador** de una tienda, siempre con su permiso.

## Cómo funciona

- La app es una **carcasa**: abre `https://app.dealflow.sbs/escritorio`. El inicio de sesión, el permiso, la conexión y los textos viven en DealFlow (`app/src/escritorio/`), así que se actualizan con cada despliegue sin reinstalar la app.
- La app le da a esa página, y solo a ella:
  - **Pantalla:** compartir la pantalla principal sin el selector, solo durante una sesión permitida.
  - **Ratón y teclado:** controlarlos en Windows con `entrada.ps1`, que usa PowerShell y `SendInput`. No necesita módulos nativos.
  - **Bandeja:** quedarse en la bandeja y abrir con Windows, para estar «en línea».
- **Servidor:** `server/src/escritorioRemoto.ts` y `server/src/escritorioRutas.ts`.
- **Visor del equipo:** `app/src/components/VisorEscritorio.tsx`, que se abre desde la llamada con «Conectar a su computador».

## Armar el instalador (desde Linux, sin Wine)

```bash
cd desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install
npm run dist:win        # → dist/DealFlowSoporte-Setup.exe
```

`compilar/instalador.sh` corre `electron-builder --win dir`; el hook `compilar/icono-exe.cjs` pone el ícono con resedit. Después `makensis` arma el instalador con `compilar/instalador.nsi`.

- **Instalación:** queda en `%LOCALAPPDATA%\Programs\DealFlow Soporte`, sin permisos de administrador, con accesos directos y desinstalador.
- **Publicar:** en DealFlow, *Administración → Soporte en vivo → App DealFlow Soporte → Subir instalador*. Las tiendas lo descargan en `/escritorio` o desde la llamada.

Para probar contra otro servidor: `DEALFLOW_URL=http://localhost:4876 npm start`. Hace falta descargar Electron para el sistema donde se corra.

## Pendiente

- **Firma de código:** sin certificado, Windows SmartScreen muestra «Windows protegió su PC», y hay que tocar *Más información → Ejecutar de todas formas*.
- **Ventanas de administrador:** Windows no deja que una app normal maneje las ventanas de administrador (UAC) ni Ctrl+Alt+Supr.
- **Varios monitores:** se comparte solo el monitor principal.
- **Mac:** todavía no hay versión.
