# Landings en dflw.store (configuración única en Cloudflare)

Con esto cada tienda tiene gratis `sutienda.dflw.store/<landing>` y, si quiere, conecta su
propio dominio (CNAME a `landings.dflw.store`). `dealflow.sbs` no se toca.

El código ya está listo: se activa poniendo `LANDINGS_RAIZ=dflw.store` en Railway (paso 7).
Mientras esa variable no exista, las landings siguen en `app.dealflow.sbs/l/…`.

## 1. Registros DNS de dflw.store (todos con la nube NARANJA, proxy)

| Tipo  | Nombre     | Contenido                 |
|-------|------------|---------------------------|
| CNAME | `@`        | `sjd7oora.up.railway.app` |
| CNAME | `*`        | `sjd7oora.up.railway.app` |
| CNAME | `landings` | `sjd7oora.up.railway.app` |

(`sjd7oora.up.railway.app` es el destino que hoy usa `app.dealflow.sbs` en Railway.)

## 2. SSL/TLS → Descripción general
Modo de cifrado: **Completo (Full)**.

## 3. Reglas → Reglas de origen (Origin Rules) → Crear regla
- Nombre: `DealFlow`
- Si: **Todas las solicitudes entrantes**
- Encabezado de host (Host Header) → **Reescribir a** `app.dealflow.sbs`

## 4. Reglas → Reglas de transformación → Modificar encabezado de la solicitud → Crear regla
- Nombre: `Host original`
- Si: **Todas las solicitudes entrantes**
- **Establecer dinámico**: nombre `X-DF-Host`, valor `http.host`

## 5. SSL/TLS → Nombres de host personalizados (Custom Hostnames)
- Habilitar Cloudflare for SaaS (pide un método de pago; los primeros 100 dominios son gratis,
  después ~USD 0,10 por dominio al mes).
- Origen de respaldo (Fallback Origin): `landings.dflw.store`.

Este paso solo hace falta para los dominios propios de las tiendas. Los subdominios
`sutienda.dflw.store` funcionan sin él.

## 6. Token de API
Mi perfil → Tokens de API → Crear token → *Plantilla personalizada*:
- Permiso: **Zona → SSL y certificados → Editar**
- Recursos de zona: **dflw.store**

Copia también el **ID de zona** (Zone ID), que está en la página de Descripción general de
dflw.store, columna derecha.

## 7. Variables nuevas en Railway (servicio de la app; no se cambia ninguna existente)
- `LANDINGS_RAIZ` = `dflw.store`
- `CF_API_TOKEN` = el token del paso 6
- `CF_ZONE_ID` = el ID de zona

## Prueba
- `https://dflw.store` → redirige a dealflow.sbs.
- `https://<subdominio-de-una-tienda>.dflw.store` → su landing (la tienda debe tener
  Landings activado y al menos una publicada; su subdominio se ve y se cambia en
  Landings → Dirección de tus landings).
- `https://dflw.store/l/ping` → `{"df":"landings", …}`.
