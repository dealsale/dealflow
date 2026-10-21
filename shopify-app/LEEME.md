# Configuración de la app DealFlow en Shopify

Este folder solo sirve para subir la configuración de la app a Shopify
(URLs, permisos y webhooks de privacidad). El código de la app vive en `server/`.

## Subirla (una vez, desde tu computador)

1. Instala Node.js 20 o más nuevo: https://nodejs.org
2. Abre una terminal en este folder (`shopify-app`).
3. Ejecuta:

   ```
   npx @shopify/cli@latest app deploy
   ```

4. Te pide iniciar sesión con tu cuenta de Shopify Partners: hazlo en el navegador.
5. Si pregunta a qué app conectarlo, elige **dealflow**.
6. Confirma con `Yes` para lanzar la nueva versión.

Después, en el Partner Dashboard → Distribución → "Comprobaciones automáticas",
toca **Ejecutar** otra vez.
