# DealFlow — reglas para Claude

DealFlow es una plataforma SaaS para tiendas online y dropshippers en Colombia: un bot de ventas con IA por WhatsApp/Instagram/Messenger que toma el pedido, lo confirma y lo despacha con Effi, Dropi o Shopify. Producción: app.dealflow.sbs (Railway).

> El `README.md` de la raíz es de un paquete de diseño viejo: ignóralo. Esta es la guía vigente.

## Cómo trabajar con el dueño

- **Responde siempre en español**, claro y sin jerga. Él no es programador de oficio: explica qué cambió y qué tiene que hacer, no cómo está hecho el código.
- **Los mensajes que le llegan a los clientes finales**: simples, como para alguien de 12 años (dónde está su pedido y qué sigue).
- **Secretos**: nunca pegues ni pidas tokens o claves en el chat. Van directo en Railway o en el panel de admin. No cambies credenciales existentes.
- No pongas identificadores de modelos de IA en el código ni en los commits.
- **No crees Pull Requests** salvo que lo pida.
- Si la petición contradice algo de esta lista, pregunta antes.

## Ramas y despliegue

- Se trabaja en `dealflow-app` y se une a `main`. **Railway despliega `main` automáticamente.** La rama `test` es el rediseño «Noche» (test.dealflow.sbs); no la toques sin que lo pida.
- **Antes de empezar: `git pull origin main`**. Hubo trabajo de varias sesiones/cuentas a la vez y se pisaron cambios; no trabajes en paralelo con otra sesión.
- Flujo de publicación (desde la raíz):
  1. Cambia el `build:` de `server/src/index.ts` (ej. `build: 'tema-MMDDHHMM'`).
  2. `cd server && npm run build` y `cd app && npm run build` (ambos deben compilar sin errores).
  3. Commit en `dealflow-app`, `git push -u origin dealflow-app`, luego `git checkout main && git pull origin main && git merge --no-edit dealflow-app && git push origin main && git checkout dealflow-app`.
  4. Revisa el despliegue: `gh api repos/dealsale/dealflow/commits/<sha>/status --jq .state` hasta `success`.
- Mensajes de commit en español, explicando el porqué.

## Estructura

- `server/` — Express + better-sqlite3 (TypeScript, Node 22). Todo vive en una base SQLite (`DATA_DIR/dealflow.db`); las tablas se crean/migran al importar cada módulo (`CREATE TABLE IF NOT EXISTS` / `addColumn`).
  - `routes.ts` (API), `auth.ts` (roles: SUPERADMIN, ADMIN, SOPORTE, VENDEDOR; `requireSuperAdmin`, `requireAdmin`, `requireOwner`).
  - Bot: `ai.ts` (respuestas, catálogo, pedidos), `claude.ts`, `consumoIA.ts` (medidor de tokens), `seguimiento.ts` («¿sigues ahí?»), `pasoHumano.ts`.
  - WhatsApp: `wa.ts`, `plantillasWA.ts`, `metaTemplates.ts` (plantillas de DealFlow en la WABA de cada tienda), `seedPlantillas.ts`, `calidad.ts` (anti-baneo).
  - Envíos: `despachos.ts` (ciclo de Dropi/Effi), `effiApi.ts`, `dropiApi.ts`, `avisoGuia.ts` (número de guía al cliente), `avisosEstado.ts` + `mensajesEstado.ts` (avisos de estado), `trazabilidad.ts` (línea de tiempo del pedido, tabla `order_eventos`).
  - Shopify: `shopify.ts`, `shopifyApp.ts` (app pública), `shopifyPedidos.ts`.
  - Remarketing: `remarketing.ts` (audiencias, exclusiones, cola de envíos).
- `app/` — React + Vite. Estado central en `src/hooks/useDealFlowState.ts`, llamadas en `src/lib/api.ts`, pantallas en `src/sections/`.
- `desktop/` (app Electron de soporte), `extension-shopify/`, `extension-importar/`, `shopify-app/`.

## Reglas de negocio ya decididas (no las cambies sin preguntar)

- **IA de cada tienda: solo con la clave de la tienda** (DeepSeek, OpenAI, Grok o Claude). Nunca caer a una clave de DealFlow. Sin clave → el bot no responde y pasa el chat al equipo. Excepciones que son servicios de DealFlow: SKY (asistente de ayuda) y Marketing IA.
- **Costo de IA**: el seguimiento revisa si puede enviar ANTES de llamar a la IA; con catálogo grande (>12.000 caracteres) va completo solo el producto de la conversación; si el bot manda 60 mensajes en una hora a un chat, se pausa (posible bot) y avisa a la tienda.
- **Anti-baneo de WhatsApp**: máximo 2 mensajes proactivos por cliente al día, nada entre 9 p. m. y 7 a. m., con calidad del número media/baja se pausan recordatorios y remarketing (los avisos de pedido sí salen).
- **Guía al cliente (Dropi y Effi)**: el número sale apenas aparece, sin esperar el PDF, aunque el chat lo atienda una persona; la foto llega después. Si pasaron 24 h sin que el cliente escriba, va con plantilla.
- **Créditos**: solo el superadmin los da o quita. Días de plan: hoy los ajustan admin y superadmin con motivo e historial (pendiente de confirmar con el dueño si vuelve a ser solo superadmin).
- **Remarketing**: por defecto se excluye a quien ya compró (pedido no cancelado ni devuelto).
- **Shopify**: un pedido eliminado en DealFlow no se vuelve a importar (`shopify_descartados`).
- **Plantillas retiradas**: `pedido_en_oficina` y `pedido_en_oficina_v2` (rechazadas por Meta); se usa `pedido_en_oficina_v3`. Para retirar otra, agrégala a `PLANTILLAS_RETIRADAS` en `metaTemplates.ts`.

## Probar sin tocar producción

- Nunca arranques el servidor con una copia de la base de producción: tiene claves reales y los ciclos automáticos les escribirían a clientes reales.
- Arranque local seguro (PowerShell), con base nueva vacía. El servidor sirve el panel ya compilado (`app/dist`):
  ```
  cd app; npm run build; cd ..
  cd server; $env:DATA_DIR="./data-local"; $env:SUPERADMIN_PASSWORD="prueba123"; npm run dev
  ```
  Abre http://localhost:3001 y entra con `superadmin@dealflow.sbs` / `prueba123`.
- **Modo en vivo (para programar):** con el servidor anterior prendido, en otra terminal `cd app; npm run dev` y abre **http://localhost:5173**: los cambios de pantallas se ven al instante y `/api` va al servidor local (proxy en `app/vite.config.ts`). El servidor (`tsx watch`) también se recarga solo.
- Flujo con el dueño: haces el cambio → él lo prueba en `localhost:5173` → solo cuando diga «súbelo» se publica a producción.
- En el PC del dueño hay una tienda de prueba «Moda Prueba» (`tienda@prueba.co` / `prueba123`) con productos, chats y pedidos de ejemplo en `server/data-local` (no se sube a git).
- Para pruebas automáticas se simulan los servicios externos con variables: `GRAPH_URL` (WhatsApp/Meta), `DROPI_BASE_URL`, `EFFI_BASE_URL`, `SHOPIFY_TEST_BASE`, y se reemplaza `globalThis.fetch` en un script que importa los módulos de `server/dist/`.
- Para cerrar servidores de prueba, mata por PID (`ps aux | grep "node .*dist/index.js"`), nunca con `pkill -f`.
