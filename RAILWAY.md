# Desplegar DealFlow en Railway

Railway construye el `Dockerfile` del repo (panel + API en un contenedor) y le
da HTTPS y un dominio automático. La base de datos SQLite vive en un volumen
para que no se borre en cada despliegue.

## 1. Crear el proyecto

1. Entra a [railway.app](https://railway.app) e inicia sesión con GitHub.
2. **New Project → Deploy from GitHub repo → dealsale/dealflow**.
3. En el servicio, pestaña **Settings → Source**, pon la rama **`dealflow-app`**.

Railway detecta el `Dockerfile` y el `railway.json` solos. El primer build
tarda unos minutos.

## 2. Agregar el volumen (¡importante!)

Sin esto, la base de datos se borra en cada despliegue.

1. En el servicio: **New → Volume** (o botón **+** → Volume).
2. **Mount path:** `/srv/data`
3. Guarda. Railway reinicia el servicio con el disco persistente.

## 3. Variables de entorno

En el servicio → pestaña **Variables**, agrega:

| Variable | Valor | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Activa cookies seguras y sirve el panel |
| `JWT_SECRET` | una frase larga y secreta tuya | Firma las sesiones |
| `ADMIN_EMAIL` | tu correo de admin | Con esto entras al panel |
| `ADMIN_PASSWORD` | una contraseña fuerte | La de tu admin |
| `WHATSAPP_VERIFY_TOKEN` | inventa una palabra | La misma que pegarás en Meta |
| `SEED_DEMO` | `0` | Arranca sin la tienda de demo |

> `PORT` y `DATA_DIR` los maneja Railway/el Dockerfile solos, no los pongas.

Guarda: Railway vuelve a desplegar con esos valores.

## 4. Sacar el dominio

En **Settings → Networking → Public Networking → Generate Domain**.
Te queda algo como `dealflow-production.up.railway.app`.

- Pruébalo: `https://TU-DOMINIO/salud` debe responder `{"ok":true}`.
- Entra a `https://TU-DOMINIO` e inicia sesión con el `ADMIN_EMAIL` y la
  `ADMIN_PASSWORD` que pusiste.

(Si tienes un dominio propio, en esa misma sección puedes agregar un
**Custom Domain** y Railway te da el CNAME a configurar.)

## 5. Crear las tiendas

Como arrancaste con `SEED_DEMO=0`, solo existe tu admin. Desde el panel de
administración creas cada tienda con su correo y contraseña, y esa persona ya
puede entrar a su propio panel.

## 6. Conectar WhatsApp (cuando tengas la app de Meta)

El webhook es uno solo para todas las tiendas:

- **URL del webhook:** `https://TU-DOMINIO/webhooks/whatsapp`
- **Token de verificación:** el `WHATSAPP_VERIFY_TOKEN` que pusiste

Eso se pega **una vez** en la config de tu app de Meta (y te suscribes al campo
`messages`). Después, cada tienda pega su WABA ID + Phone Number ID + Access
Token en su sección WhatsApp del panel. Los pasos completos están en
`DESPLIEGUE.md`.

## Actualizar

Cada vez que hagamos `git push` a `dealflow-app`, Railway redespliega solo.
No tienes que hacer nada.

## Costo

El plan Hobby de Railway es ~$5 USD/mes de uso incluido; una app pequeña como
esta suele caber ahí. El volumen de la base de datos cuenta aparte pero es
mínimo (centavos por unos MB).

## 9. Entorno de prueba: `test.dealflow.sbs` (rama `test`)

Un segundo servicio en Railway, con el **mismo repo** pero la rama **`test`**, donde
se trabaja el diseño nuevo (tema "Noche", la identidad de la landing) sin tocar a
nadie. Tiene **su propia base de datos** (su propio volumen): lo que pase ahí no
afecta a las tiendas reales.

1. En el proyecto de Railway: **New → GitHub Repo → dealsale/dealflow**.
2. En ese servicio nuevo: **Settings → Source → Branch: `test`**.
3. **New → Volume**, mount path `/srv/data` (igual que el principal).
4. **Variables**: copia las del servicio principal (`JWT_SECRET`, `ADMIN_*`,
   `SUPERADMIN_PASSWORD`, claves de IA, etc.). Cambia:
   - `PUBLIC_APP_URL` → `https://test.dealflow.sbs`
   - `SEED_DEMO` → `1` si quieres arrancar con la tienda de prueba
     (karla@lunaaccesorios.co / demo123) para ver el diseño con datos.
   - NO pongas el token de WhatsApp de producción si no quieres que el entorno
     de prueba responda chats reales (Meta solo manda los mensajes al webhook
     configurado en Meta, así que por defecto el de prueba no recibe nada).
5. **Settings → Networking → Custom Domain**: `test.dealflow.sbs`. Railway te
   da un CNAME; agrégalo en el DNS del dominio.
6. Abre `https://test.dealflow.sbs/salud`: debe responder `{"ok":true,...}`.

El servidor reconoce `test.<dominio>` y sirve la app; la app arranca con el tema
"Noche" en ese host (en el principal sigue el tema de siempre, y "Noche" aparece
como opción en el menú de perfil cuando se fusione la rama).

Para pasar el diseño al principal: `git checkout dealflow-app && git merge test`.
