# Productos (catálogo que usa la IA)

## Crear un producto o servicio
Sección: productos
Claves: crear producto, nuevo producto, agregar producto, servicio, catalogo, subir producto, primer producto
1. En **Productos** toca **+ Nuevo producto** (o **+ Crear mi primer producto**).
2. Elige el **Tipo**: Producto o **Servicio** (los servicios tienen **Duración** opcional, ej. 45 minutos, y no se despachan).
3. Escribe **Nombre** y **Precio (COP)**. "Falta el nombre o el precio" si dejas alguno vacío.
4. Al abrirlo agregas fotos, videos, opciones (Color, Talla…), combos, mensaje inicial y reglas. Toca **Guardar producto** ("✓ Producto guardado. El asistente ya lo ofrece así").
Consejo: escribe el nombre como lo busca tu cliente ("Jogger jaspeado"). Ctrl + clic en un producto lo abre en otra pestaña. **Eliminar producto** pide confirmar.

## El editor del producto: todos los campos
Sección: productos
Claves: editar producto, descripcion, caracteristicas, modo de uso, contenido del paquete, sku, referencia, fotos, videos, testimonios, reglas del producto, preguntas del producto
- **Producto**: tipo, nombre, precio, **Referencia / SKU** (opcional; si es igual a la Referencia del artículo en Effi, se vincula solo).
- **🏷️ Precio de promoción** (por unidad, opcional): el asistente cobra ese precio mientras esté puesto. Úsalo para promos de precio por unidad en vez de escribirlas solo en las reglas.
- **Información** (la usa el asistente para vender): Descripción, Características, Modo de uso y Contenido del paquete.
- **Mensaje inicial**: fotos, textos, videos y audios que se envían solos (con su **Disparador** y su interruptor de encendido).
- **Combos**: cantidad + precio total + etiqueta opcional ("¡El más pedido!"). Ej: 3 por $109.900. El asistente los ofrece para subir el ticket.
- **Multimedia**: **Fotos principales** (las que envía al ofrecer el producto), **Testimonios** (capturas de clientes felices) y **Videos del producto**.
- **Variantes**: opciones (Color, Talla…) y sus combinaciones con stock y vínculos con Effi/Dropi/Shopify.
- **Reglas y preguntas**: reglas solo de este producto y preguntas frecuentes con su respuesta.
- **🚚 Se despacha por**: Effi, Dropi o ninguno; define con qué proveedor sale el pedido.

## Variantes: tallas, colores y combinaciones
Sección: productos
Claves: variantes, tallas, colores, opciones, combinaciones, generar combinaciones, stock, agotado, faltan variantes, sabor
1. En **Variantes** crea un grupo por cada tipo de opción: **Nuevo grupo** (ej. Color) → **+ Agregar grupo**, y agrega sus valores (Negro, Azul…). Puedes ponerle foto a cada opción (**+ foto**).
2. Toca **Generar combinaciones desde Opciones**: DealFlow crea una variante por combinación (5 tallas × 3 colores = 15), cada una con su stock. Si no salen todas, revisa que cada grupo tenga sus valores y vuelve a generar ("Primero agrega las opciones del producto (ej. Talla, Color) con sus valores").
3. Ordena con **Ordenar: Por defecto / Por color / Por talla**.
4. **Volver a armarlas con las opciones** rehace la lista si cambiaste las opciones. Las variantes que sobran no se borran solas: elimínalas si ya no las vendes, o el asistente podría ofrecerlas.
El asistente ofrece solo las variantes que existen y con stock; si el cliente pide una que no existe, le muestra las disponibles.

## Vincular las variantes con Effi, Dropi y Shopify
Sección: productos, integraciones
Claves: vincular, referencia effi, id dropi, sku shopify, conexiones por variante, articulo de effi, codigo, sin vincular
En **Variantes → 🔗 Conexiones por variante** pones el código de cada variante si vendes ese producto por allá (se guarda al salir del campo):
- **Referencia de Effi** (ej. 35) o el artículo de Effi de cada variante.
- **ID / código en Dropi**.
- **SKU en Shopify**.
"Primero genera las variantes (arriba) para poder vincularlas". El resumen de arriba muestra cuántas variantes están vinculadas con Effi y con Dropi. Para Effi también puedes vincular todo desde **Integraciones → Effi → 3 · Productos**.

## Traer las variantes de Dropi
Sección: productos, dropi
Claves: dropi variantes, traer variantes, id del producto en dropi, sincronizar dropi, stock dropi
En el producto (con **Se despacha por: Dropi**) escribe el **ID del producto en Dropi** (el número del detalle del producto en Dropi, ej. 48213) y toca **Traer variantes de Dropi**: DealFlow trae todas sus tallas y colores, vincula las que ya tienes, crea las que falten y toma el stock de Dropi. Después se actualiza solo cada 6 horas. Si en Dropi no tiene variantes, queda vinculado como producto simple.
Errores: "Conecta Dropi en Integraciones primero"; "Escribe el ID del producto en Dropi"; "No pudimos consultar el producto en Dropi" (ID errado o Dropi caído).

## Crear el producto en Shopify desde DealFlow
Sección: productos, shopify
Claves: subir a shopify, crear en shopify, borrador shopify, sku shopify
Si el producto no existe en tu Shopify, en el editor usa la opción de crearlo allá: DealFlow sube nombre, descripción, variantes con su precio y un SKU, y deja el vínculo listo. Se crea como **borrador** para que lo revises antes de publicarlo. Requiere Shopify conectado ("Conecta Shopify primero en Integraciones"). "Shopify no devolvió el producto": reintenta; revisa los permisos de la app.

## Productos duplicados
Sección: productos
Claves: duplicado, repetido, dos productos iguales, envia version vieja
Si arriba en Productos sale **Hay productos duplicados** (mismo disparador o nombre), el bot puede enviar la versión vieja o importada en vez de la que editaste. Deja solo uno de cada grupo y elimina el repetido. **Vista agrupada** ayuda a ver los productos por grupo.

## Importar productos desde LucidSales (Lucid Bot)
Sección: productos
Claves: importar, lucid, lucidsales, lucid bot, migrar productos, pasar productos, extension importar, traer productos de otro bot, copiar producto
Con la extensión **DealFlow · Importar productos** (Chrome, Chromium, Edge, Brave y Firefox) traes un producto de LucidSales con su estructura completa:
1. En **Integraciones → Envíos y tiendas → Importar productos (LucidSales)** toca **⬇ Descargar extensión** y descomprime el archivo.
2. **Chrome/Chromium/Edge/Brave**: `chrome://extensions` → enciende **Modo de desarrollador** → **Cargar descomprimida** → elige la carpeta `dealflow-importar-productos`. **Firefox**: `about:debugging#/runtime/this-firefox` → **Cargar complemento temporal…** → elige el `manifest.json` (Firefox lo quita al cerrarse; vuelve a cargarlo cuando lo necesites).
3. En la misma tarjeta toca **🔑 Generar código de conexión**, abre el ícono de la extensión, pega el código y dale **Guardar y probar**.
4. En LucidSales abre **Editar producto** y toca **Importar a DealFlow** (abajo a la derecha). La extensión abre cada sección, lee nombre, precio, descripción, modo de uso, características, contenido del paquete, bundles, variantes, reglas, preguntas frecuentes, multimedia y mensaje inicial; sube las fotos y videos y crea el producto en tu tienda.
5. Al final sale el resumen y **Abrir en DealFlow ↗**. Revisa el producto antes de vender (sobre todo combos, variantes y stock, que queda en 0).
- Con IA conectada (DeepSeek u OpenAI) los combos, variantes, reglas y preguntas quedan ordenados; sin IA se copian los datos básicos y lo demás lo completas tú.
- No cambia nada en LucidSales: solo abre y cierra secciones para leerlas.
Errores: "Código no válido" → genera un código nuevo y pégalo otra vez en la extensión. "No encontramos el nombre del producto" → abre el producto en modo **Editar producto** y vuelve a intentar. "N archivo(s) no se pudieron traer" → esas fotos o videos súbelos a mano en el producto.
