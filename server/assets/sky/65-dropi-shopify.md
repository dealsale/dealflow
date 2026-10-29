# Dropi y Shopify

## Conectar Dropi
Sección: integraciones, dropi
Claves: conectar dropi, token dropi, url de integracion, woocommerce dropi, mis integraciones, dropi api
1. En Dropi entra a **Mis Integraciones** y crea una integración tipo **WooCommerce**. Cuando Dropi te pida la **URL de la tienda**, pega la que te muestra DealFlow en **Integraciones → Dropi** (es la página de tu tienda en DealFlow; no necesitas WordPress ni Dropify).
2. Copia el **Token de integración** (JWT) que genera Dropi.
3. En DealFlow pega el token y la **URL de integración (idéntica a la que pegaste en Dropi)**, elige la **Transportadora por defecto** y dale **Guardar y probar** ("✓ Dropi conectado por API").
Preferencia de transportadora: **La elige el operador (al enviar)**, **La más barata**, **Que Dropi decida** o **Una fija**.
Errores:
- "Faltan el token y la URL de integración de Dropi".
- "Dropi rechazó el token (401). Revisa el token y que la URL de integración sea la misma que registraste en Dropi" → la URL debe ser exactamente igual (con o sin www, con https) a la de Dropi; si cambiaste algo, genera un token nuevo.
- "No pudimos conectar con Dropi. Intenta de nuevo" → Dropi caído o lento.

## Despachar un pedido con Dropi
Sección: pedidos, dropi
Claves: despachar dropi, generar en dropi, cotizar dropi, transportadoras dropi, crear orden dropi, recaudo, sin recaudo
1. Abre el pedido → **Despacho** → **Dropi** (cotiza y elige transportadora).
2. Elige **Con recaudo (contra entrega)** o **Sin recaudo (pagado)** y toca **📦 Generar en Dropi**.
3. DealFlow cotiza: "Transportadoras para [ciudad] — elige una" o **Que Dropi elija (automático)**.
4. **Crear en Dropi**. La guía llega sola y se le envía al cliente por WhatsApp (en PDF/imagen).
Los productos deben estar vinculados con Dropi (ID del producto y variantes: Productos → el producto → **Traer variantes de Dropi**).

## Errores de Dropi
Sección: pedidos, dropi
Claves: error dropi, dropi no reconoce, ciudad dropi, departamento dropi, no acepta contra entrega, ninguna transportadora, no tiene vinculado su id de dropi, variante no vinculada dropi
- "El producto … no tiene vinculado su ID de Dropi. Vincúlalo en Productos" → pon el ID del producto en Dropi en el producto.
- "La variante … no está vinculada con Dropi. En Productos → Variantes, toca «Traer variantes de Dropi»".
- "No supimos cuál variante es …" → revisa que la variante del pedido exista en el producto (usa 🧩 Corrige la talla o el color o ✏️ Editar).
- "Dropi no reconoce el departamento/la ciudad …. Escríbela como en Dropi" → edita el pedido con el nombre oficial (ej. "Bogotá D.C." / "Cundinamarca").
- "La ciudad … no trae código DANE en Dropi; no se puede cotizar" → prueba con la ciudad principal más cercana o pregunta a Dropi.
- "La ciudad … no acepta pago contra entrega (recaudo) en Dropi" → solo sirve **Sin recaudo** (pago anticipado).
- "Ninguna transportadora de Dropi puede llevar este pedido con recaudo…" → prueba "Sin recaudo" si el cliente ya pagó, o revisa peso y destino.
- "No pudimos cotizar el envío en Dropi" / "No pudimos crear la orden en Dropi" → Dropi falló; reintenta en unos minutos. Si persiste, revisa en Dropi el saldo y el stock del producto.
- "Dropi respondió … al consultar la orden" / "No se pudo leer el pedido en Dropi" → estado temporalmente no disponible; se reintenta solo.

## Conectar Shopify
Sección: integraciones, shopify
Claves: conectar shopify, app shopify, instalar en shopify, codigo shopify, vincular shopify, client id, secret, shpat, admin api token, myshopify
En **Integraciones → Shopify**:
- **Instalar en Shopify** (un clic): escribe tu dominio **mitienda.myshopify.com**, acepta en Shopify y queda conectada.
- ¿Instalaste DealFlow desde Shopify? Pega el **código de 6 caracteres** que te muestra la app → **Vincular**. "Código no válido o vencido": abre de nuevo la app DealFlow en Shopify para ver uno nuevo.
- **Conexión manual (avanzado)** mientras Shopify aprueba la app: en dev.shopify.com (Dev Dashboard) crea una app con los permisos read_products, read_orders, write_orders, read_merchant_managed_fulfillment_orders y write_merchant_managed_fulfillment_orders, instálala en tu tienda y pega el **Client ID y el Secret** (pestaña Credenciales) o el **Admin API access token** (empieza por shpat_).
Errores: "Falta el dominio de la tienda (mitienda.myshopify.com)" (usa el dominio .myshopify.com, no el dominio propio); "Pon el Admin API token, o el Client ID + Client Secret"; "No pudimos conectar con Shopify para obtener el token" (credenciales erradas o app sin instalar); "Shopify no dejó leer los pedidos" (faltan permisos read_orders); "La sesión de Shopify venció. Recarga la app".
Si se desinstala la app en Shopify, la conexión queda desactivada (sale en el registro).

## Pedidos de Shopify: confirmación, despacho automático y packs
Sección: integraciones, shopify, pedidos
Claves: pedidos shopify, confirmar pedido shopify, despachar al confirmar, modo prueba, packs, pack x6, unidades, shopify sin telefono, traer pedidos
Con Shopify conectado los pedidos entran solos (se revisa cada 5 minutos, o al momento con el botón de traer pedidos). Opciones:
- **Confirmar cada pedido por WhatsApp**: al comprador le llega la plantilla de confirmación Sí/No.
- **Despachar solo cuando el cliente confirma**: con Effi se crea la remisión (y la guía si la tienes activa); al salir la guía, el pedido se marca enviado en Shopify con su número de guía ("🛍️ Marcado como enviado en Shopify con su guía").
- **Modo prueba (no crea envíos reales)**: simula el despacho con una guía de prueba (para pruebas o la revisión de Shopify).
- **Packs**: un producto tipo "Pack x6" se convierte en 6 unidades del producto real ("Pack corregido: …").
- "El pedido de Shopify llegó sin teléfono": no se puede confirmar por WhatsApp; complétalo a mano.
- "Pedido antiguo: no se envió confirmación automática": solo se confirman pedidos recientes.
- "Sin pedidos nuevos (revisados N de la última semana)": todo ya está en DealFlow.
Vincula los productos por **SKU** (el SKU de la variante en Shopify = el de DealFlow).

## Extensión de Chrome DealFlow x Shopify
Sección: integraciones, shopify
Claves: extension, chrome, enviar a dealflow, boton en shopify, codigo de conexion
Pone un botón **Enviar a DealFlow** en cada pedido de tu panel de Shopify (funciona sin la app aprobada):
1. **⬇ Descargar extensión** y descomprímela (carpeta dealflow-x-shopify).
2. En Chrome abre chrome://extensions, enciende **Modo de desarrollador** y dale **Cargar descomprimida** → elige esa carpeta.
3. En DealFlow genera un **código de conexión** (🔑, cópialo: no se vuelve a mostrar), haz clic en el ícono de DealFlow en Chrome, pégalo y dale **Guardar y probar**.
4. Abre un pedido en Shopify y toca **Enviar a DealFlow**: se crea con sus productos y variantes (si es de las últimas 24 h se le envía la confirmación).
Errores: "Código no válido. Genera uno en DealFlow → Integraciones → Shopify → Extensión"; "No encontramos el número del pedido en la página de Shopify" (abre el pedido, no la lista); "Conecta una IA en Integraciones para leer el pedido"; "La IA no pudo leer el pedido. Intenta de nuevo".

## Dropi: vincular las variantes (talla y color) y el error "No supimos cuál talla/color es"
Sección: productos
Claves: dropi variantes, vincular variantes dropi, verifica las variantes, revisa las variantes, no supimos cual talla, codigo dropi variante, variantes repetidas, s/m, l/xl, traer variantes de dropi
- Todo lo de Dropi está en el producto → bloque **Dropi**: pon el **ID del producto en Dropi** y toca **⬇ Traer variantes** (o **↻ Actualizar desde Dropi**). Trae cada variación con su talla **y** su color, la vincula y toma el stock.
- **Ver vínculos de cada variante** muestra una tabla con la talla, el color y el **código en Dropi** de cada variante (✓ vinculada). Puedes corregir un código a mano; se guarda al salir del campo.
- Si las variantes salen solo con la talla ("S/M" repetido sin color), toca **↻ Actualizar desde Dropi**: los nombres se completan ("S/M · Negro") sin perder los vínculos.
- Al despachar, DealFlow encuentra la variante aunque el pedido venga de Shopify con otro formato ("Enterizo - S/M / Beige") y la deja guardada en el pedido. Si la variante no tiene código, intenta traerlo de Dropi solo.
- "No supimos cuál talla/color es…": el pedido no dice la talla o el color, o pide una que el producto no tiene. Corrígelo ahí mismo con **🧩 Corrige la talla o el color** (o ✏️ Editar) y vuelve a tocar **Generar en Dropi**.
- Abajo en el pedido, **🧾 Registro del pedido** muestra todo lo que pasó: cotización, creación en Dropi, respuestas de Dropi y errores.

## Dropi: enviar solo el pedido (sin guía) para revisar la huella
Sección: pedidos
Claves: huella, huella dropi, solo pedido, sin guia, pendiente confirmacion, generar guia en dropi, revisar cliente dropi, historial transportadora
En el pedido → **Despacho con Dropi** hay dos botones:
- **📦 Generar en Dropi (con guía)**: cotizas, eliges transportadora y Dropi genera la guía.
- **📝 Solo enviar el pedido (la guía la hago en Dropi)**: el pedido se crea en Dropi como **Pendiente confirmación**, sin transportadora ni guía. En Dropi revisas la **huella** del cliente (su historial con las transportadoras), confirmas y generas la guía. Cuando la generes, la guía llega sola a DealFlow (se revisa cada pocos minutos) y se le avisa al cliente por WhatsApp.
La huella de Dropi no se puede consultar desde DealFlow (Dropi no la entrega por la integración). Como apoyo, el **Historial del cliente** del pedido muestra sus devoluciones en tu tienda, en la Red DealFlow y en tu Effi.
