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

## Cobro con Shopify (requisito 1.2 de la App Store)

Las tiendas que instalan DealFlow desde Shopify **pagan con la facturación de Shopify**.
Nunca ven Wompi ni el pago "offline" por WhatsApp.

- **Plan mensual: Shopify App Pricing (planes administrados).**
  1. En el Partner Dashboard → la app → Distribución → **Precios**, elige **Planes administrados (Managed pricing)**.
  2. Crea los planes con su precio en USD y, si quieres, días de prueba. Si el nombre coincide con un plan de DealFlow (por ejemplo "DealFlow"), DealFlow usa ese plan; si no, usa el primero.
  3. Shopify muestra la página para elegir, subir o bajar de plan: `https://admin.shopify.com/store/<tienda>/charges/<handle>/pricing_plans`.
  4. DealFlow lee la suscripción activa al abrir la app, cuando llega el webhook `app_subscriptions/update` y cada 6 h. Con eso activa la cuenta y pone el vencimiento en el fin del periodo cobrado.
- **Extras: cargos únicos de la Billing API.** Aplica a créditos, productos y landings de la Biblioteca y la Tienda en línea. El precio en pesos se convierte a USD y la tienda lo aprueba en Shopify. En tiendas de desarrollo el cargo sale en modo prueba.

Variables opcionales en Railway:
- `SHOPIFY_APP_HANDLE`: el handle de la app en la URL de Shopify. Por defecto `dealflow`.
- `SHOPIFY_TASA_COP_USD`: pesos por dólar para los extras. Por defecto `4000`.
- `SHOPIFY_BILLING_TEST=1`: fuerza cargos de prueba.

## Tokens que vencen (requisito 3.1.2)

DealFlow pide tokens offline **que vencen** (`expiring=1`) y los renueva solo con el refresh token.
Los tokens viejos, que no vencían, se convierten automáticamente la primera vez que se usan.

Después de cambiar este archivo hay que volver a ejecutar `npx @shopify/cli@latest app deploy` desde esta carpeta. Así se suscribe el webhook `app_subscriptions/update`.
