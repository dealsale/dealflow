# Dominios propios para las landings (configuración única)

Cada tienda conecta su dominio en **Landings → Dominio propio**. DealFlow le dice qué
CNAME crear (`www` → `landings.dealflow.sbs`) y luego verifica que el dominio ya cargue
con HTTPS. El código ya enruta por dominio: en `tutienda.com/<landing>` solo se ven las
landings de esa tienda (nada del panel responde ahí).

Lo único que falta es la pieza de red que reciba esos dominios y les ponga certificado.
Railway no sirve para esto: su plan Hobby permite 2 dominios por servicio y el Pro 20.

## Opción recomendada: Cloudflare for SaaS (una sola vez)

Requisito: que el DNS de `dealflow.sbs` esté en Cloudflare (plan gratis sirve).

1. **Origen de respaldo.** En Cloudflare → DNS de `dealflow.sbs`, crea
   `landings` como CNAME hacia el dominio de Railway del servicio
   (`xxxx.up.railway.app`), **con la nube naranja (proxy) encendida**.
2. **Activar Custom Hostnames.** Cloudflare → `dealflow.sbs` → SSL/TLS → Custom
   Hostnames → *Enable* y pon `landings.dealflow.sbs` como *Fallback Origin*.
   Los primeros 100 dominios son gratis; después ~USD 0,10 por dominio al mes.
3. **Railway responde por un solo nombre.** Cloudflare → Rules → Origin Rules → nueva
   regla «Todo lo de custom hostnames» (cuando *Hostname* no termina en `dealflow.sbs`):
   - *Host Header* → reescribir a `xxxx.up.railway.app`.
4. **Pasar el dominio original.** Rules → Transform Rules → *Modify Request Header* →
   agregar `X-DF-Host` con el valor dinámico `http.host`, con la misma condición.
   DealFlow usa ese encabezado para saber de qué tienda es la visita.
5. **Token para DealFlow.** Cloudflare → My Profile → API Tokens → *Create Token* con el
   permiso *Zone → SSL and Certificates → Edit* sobre `dealflow.sbs`.
6. **Variables nuevas en Railway** (no se toca ninguna de las existentes):
   - `CF_API_TOKEN` = el token del paso 5
   - `CF_ZONE_ID` = el *Zone ID* de `dealflow.sbs` (Cloudflare → Overview, columna derecha)
   - `LANDINGS_CNAME` = `landings.dealflow.sbs` (opcional, es el valor por defecto)

Con eso, cuando una tienda conecta su dominio, DealFlow lo registra solo en Cloudflare,
Cloudflare emite el certificado en cuanto el CNAME apunta y el botón «Verificar» lo
marca como **Activo**.

## Sin Cloudflare (pocas tiendas)

Agrega el dominio de la tienda a mano en Railway → servicio → Settings → Domains y
pídele que cree el CNAME que Railway indique. Sirve para 1 o 2 dominios (límite de Railway).

## Lo que ve la tienda

1. Escribe `www.sutienda.com` → DealFlow le muestra el registro CNAME a crear.
2. Lo crea en GoDaddy, Hostinger, etc. (y redirige `sutienda.com` → `www.sutienda.com`).
3. Le da a «Verificar». Cuando quede **Activo**, sus enlaces pasan a ser
   `https://www.sutienda.com/<landing>` y puede elegir qué landing se abre en la raíz.
