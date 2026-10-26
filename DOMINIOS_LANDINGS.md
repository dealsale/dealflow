# Tienda en línea en dflw.store (configuración única en Cloudflare)

Con esto cada tienda tiene gratis `sutienda.dflw.store/<landing>` y, si quiere, conecta su
propio dominio (CNAME a `landings.dflw.store`). `dealflow.sbs` no se toca.

El código ya está listo: se activa poniendo `LANDINGS_RAIZ=dflw.store` en Railway (paso 5).
Mientras esa variable no exista, las landings siguen en `app.dealflow.sbs/l/…`.

## 1. Registros DNS de dflw.store (todos con la nube NARANJA, proxy)

| Tipo  | Nombre     | Contenido                 |
|-------|------------|---------------------------|
| CNAME | `@`        | `sjd7oora.up.railway.app` |
| CNAME | `*`        | `sjd7oora.up.railway.app` |
| CNAME | `landings` | `sjd7oora.up.railway.app` |

(`sjd7oora.up.railway.app` es el destino que hoy usa `app.dealflow.sbs` en Railway.)

## 2. Worker (en vez de reglas de origen: el Host header es solo para Enterprise)
Workers & Pages → Create → Worker → nombre `dflw-landings` → Deploy → Edit code →
pega `infra/cloudflare-worker-landings.js` → Deploy.
Luego en el Worker → Settings → Domains & Routes → Add → **Route** (dos rutas, zona `dflw.store`):
- `*dflw.store/*` → para `dflw.store` y los subdominios gratis.
- `*/*` → para los dominios propios de las tiendas (Custom Hostnames). Sin esta ruta, el
  dominio de la tienda llega a Cloudflare pero no a DealFlow.

Gratis hasta 100.000 visitas al día (plan Workers Paid: USD 5/mes por 10 millones).

## 3. SSL/TLS → Nombres de host personalizados (Custom Hostnames)
- Habilitar Cloudflare for SaaS (pide un método de pago; los primeros 100 dominios son gratis,
  después ~USD 0,10 por dominio al mes).
- Origen de respaldo (Fallback Origin): `landings.dflw.store`.

Este paso solo hace falta para los dominios propios de las tiendas. Los subdominios
`sutienda.dflw.store` funcionan sin él.

## 4. Token de API
Mi perfil → Tokens de API → Crear token → *Plantilla personalizada*:
- Permiso: **Zona → SSL y certificados → Editar**
- Recursos de zona: **dflw.store**

Copia también el **ID de zona** (Zone ID), que está en la página de Descripción general de
dflw.store, columna derecha.

## 5. Variables nuevas en Railway (servicio de la app; no se cambia ninguna existente)
- `LANDINGS_RAIZ` = `dflw.store`
- `CF_API_TOKEN` = el token del paso 4
- `CF_ZONE_ID` = el ID de zona

## Prueba
- `https://dflw.store` → redirige a dealflow.sbs.
- `https://<subdominio-de-una-tienda>.dflw.store` → su tienda (con la membresía al día y al
  menos un producto publicado; el subdominio se ve y se cambia en Tienda en línea →
  Dirección de tu tienda).
- Dominio propio: la tienda lo conecta en Tienda en línea → Dirección de tu tienda, crea el
  CNAME `www` → `landings.dflw.store` en su proveedor y le da «Verificar».
- `https://dflw.store/l/ping` → `{"df":"landings", …}`.
