# Poner DealFlow en línea en tu VPS

Un solo contenedor sirve la API y el panel; Caddy pone el HTTPS automático.

## Requisitos

- Un VPS con Docker instalado (`curl -fsSL https://get.docker.com | sh`)
- Un dominio (o subdominio) apuntando con un registro **A** a la IP del VPS

## Pasos

```bash
# 1. Clona el repositorio en el VPS
git clone https://github.com/dealsale/dealflow.git
cd dealflow
git checkout dealflow-app

# 2. Configura tus secretos
cp .env.example .env
nano .env   # cambia DOMAIN, JWT_SECRET, ADMIN_PASSWORD y WHATSAPP_VERIFY_TOKEN

# 3. Levanta todo
docker compose up -d --build
```

Listo: entra a `https://tu-dominio` e inicia sesión con el correo y la
contraseña de admin que pusiste en `.env`. Desde el panel de administración
creas las cuentas de las tiendas (cada una con su correo y contraseña).

La base de datos (SQLite) vive en el volumen `dealflow-data`, así que
sobrevive a reinicios y actualizaciones.

## Actualizar a una versión nueva

```bash
cd dealflow
git pull
docker compose up -d --build
```

## Conectar WhatsApp: dos formas

Cada tienda elige en su panel (sección WhatsApp) cómo conectar su número:

### Opción A — Por código QR (rápido)

Toca «Generar código QR», y desde el teléfono: WhatsApp → Dispositivos
vinculados → Vincular un dispositivo, y escanea. En cuanto conecta, los
chats entran al CRM y puedes responder desde ahí.

> Nota: esta vía usa la conexión de WhatsApp Web (no oficial). Es la más
> rápida para empezar, pero Meta podría restringir el número; para volumen
> alto o algo formal, usa la Opción B.

### Opción B — Por API oficial de Meta (WABA ID + Access Token)

Cada tienda vincula su número con sus credenciales de la **WhatsApp Cloud API**:

1. En [developers.facebook.com](https://developers.facebook.com) crea una app
   de tipo Business y agrégale el producto **WhatsApp**.
2. De ahí salen los tres datos que pide el panel:
   - **WABA ID** (ID de la cuenta de WhatsApp Business)
   - **Phone Number ID** (ID del número de teléfono)
   - **Access Token** (token permanente de usuario de sistema, no el temporal)
3. Configura el webhook de la app (una sola vez, sirve para todas las tiendas):
   - **URL:** `https://tu-dominio/webhooks/whatsapp`
   - **Token de verificación:** el mismo `WHATSAPP_VERIFY_TOKEN` de tu `.env`
   - Suscríbete al campo **messages**
4. En el panel de la tienda → sección WhatsApp → pega los tres datos.
   El servidor valida las credenciales contra Meta antes de guardarlas.

Con eso, los mensajes que lleguen al número aparecen como leads con su
conversación, y lo que escribas al intervenir un chat sale por WhatsApp real.

## Salud del servicio

- `https://tu-dominio/salud` responde `{"ok":true}` si la API está arriba.
- Logs: `docker compose logs -f dealflow`
