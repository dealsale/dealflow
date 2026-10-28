/**
 * Base de conocimiento de SKY (asistente de soporte): cómo se hace cada cosa en DealFlow.
 * Sale de los tutoriales del panel (public/tutoriales.html), del tutorial de Tienda en línea
 * y de las pantallas actuales. Al cambiar un flujo del panel, actualiza aquí sus pasos.
 */
export const CONOCIMIENTO_SKY = `## Guías paso a paso de DealFlow
### Conectar WhatsApp (Primeros pasos)
Conecta el número donde tu asistente va a atender y vender.
1. Abre WhatsApp: En el menú de la izquierda entra a **WhatsApp**.
2. Elige la API oficial: La **API oficial de Meta** es la recomendada: es estable y permite plantillas para escribir después de 24 horas.
3. Inicia sesión con Facebook: Se abre la ventana de Meta: eliges tu negocio y tu número, y aceptas.
4. ¡Conectado!: Arriba ya dice **WhatsApp conectado**. Las plantillas de mensajes se mandan a verificación solas.
Resultado: El número queda conectado a tu asistente. Las plantillas (guía, novedades…) se verifican en Meta automáticamente.

### Crear un producto (Primeros pasos)
Crea un producto con tallas y colores para que el asistente lo venda.
1. Abre Productos: Entra a **Productos** en el menú.
2. Nuevo producto: Toca **＋ Nuevo producto**.
3. Nombre y precio: Escribe el nombre y el precio.
4. Tallas y colores: Agrega las **opciones**: tallas y colores. DealFlow crea una variante por combinación, cada una con su stock.
5. Guarda: Toca **Guardar producto**. Desde ya el asistente lo puede ofrecer y mandar sus fotos.
Resultado: Cada talla y color es una variante con su propio stock. El asistente usa el precio, los combos y las reglas exactas del producto.

### Personalizar el asistente (Primeros pasos)
Dale personalidad, cuéntale de tu negocio y define cuándo pasa el chat a una persona.
1. Abre Asistente: Entra a **Asistente**.
2. Recorre las pestañas: Personalidad, Tu negocio, **Preguntas frecuentes**, Cómo vende y Prohibido. Abre las preguntas frecuentes.
3. Respuestas exactas: Lo que escribas aquí el asistente lo responde tal cual. Ahora abre **Pasar a una persona**.
4. Activa el pase a humano: Enciéndelo y escribe cuándo debe pasar el chat a tu equipo y qué le dice al cliente.
5. Guarda: Toca **Guardar**. Cuando pase, el chat aparece en el Inbox para que lo atiendas.
Resultado: La personalidad y tu negocio guían cada respuesta. Si el cliente lo pide, el asistente te pasa el chat.

### Leads por etapas (Ventas)
Mira en qué va cada cliente y muévelo de etapa si hace falta.
1. Abre Leads: Entra a **Leads**.
2. Las etapas: Preguntando, Interesado, Faltan datos, Datos completos, Venta y Perdido. Se mueven solas según lo que pasa en el chat.
3. Moverlo a mano: Si sabes algo que el chat no dice, toca **Etapa**.
4. Elige la etapa: Elige la etapa, por ejemplo **Datos completos**. Con "Automático" vuelve a moverse solo.
5. Ve al chat: **Ir al chat** te lleva directo a la conversación.
Resultado: Las etapas se actualizan solas con cada mensaje. Puedes fijar una etapa a mano y volver a automático.

### Atender un chat (Ventas)
Toma un chat cuando el cliente quiere hablar con una persona y devuélvelo al asistente.
1. Abre el Inbox: Entra a **Inbox**: ahí están todas las conversaciones.
2. Toma el chat: Toca **Tomar el chat**: el asistente deja de responder.
3. Escríbele: Escribe tu mensaje y toca **Enviar**.
4. Devuélvelo: Cuando termines, **Devolver al asistente** para que siga vendiendo.
Resultado: Mientras lo atiendes tú, el asistente no responde. Devuélvelo y retoma solo.

### Crear un pedido a mano (Ventas)
Registra un pedido que te llegó por otro lado (llamada, Instagram…).
1. Abre Pedidos: Entra a **Pedidos**.
2. Crear pedido: Toca **＋ Crear pedido**.
3. Datos del cliente: Nombre, celular, ciudad y dirección.
4. Producto: Busca el producto y elige talla y color. El total se calcula solo.
5. Guarda: Toca **Guardar pedido**.
6. Ahí está: El pedido aparece de primero, en estado **Nuevo**.
Resultado: El pedido entra como Nuevo, listo para despachar. Desde el detalle lo envías a Effi o Dropi.

### Conectar Effi (Effi y despachos)
Conecta Effi por API para crear remisiones y guías sin salir de DealFlow.
1. Abre Integraciones: Entra a **Integraciones**.
2. Effi: Toca la fila de **Effi**.
3. Pega la API key: En Effi: Administración → Usuarios → Ver más. Cópiala y pégala aquí.
4. Conecta: Toca **Conectar Effi**. DealFlow verifica la llave.
5. Configura: Elige sucursal, bodega y forma de pago. Si vendes artículos de un proveedor, pon el **convenio dropshipping**: así Effi no te pide stock propio.
6. Guarda: Toca **Guardar configuración**. Ahí mismo activas las novedades de envío.
Resultado: Effi queda listo para crear remisiones. Con el convenio, los artículos del proveedor no exigen stock propio.

### Vincular productos con Effi (Effi y despachos)
Dile a Effi qué artículo corresponde a cada talla y color.
1. Productos vinculados: En Integraciones → Effi, abre el producto (es un acordeón).
2. Falta una variante: Si una variante está sin vincular, Toca **Buscar en Effi**.
3. Elige el artículo: Ves **todos** los artículos de tu Effi y puedes filtrar por nombre o referencia. Elige el correcto.
Resultado: Cada variante queda unida a su artículo en Effi. DealFlow también empareja solo: "Talla M · Negro" encuentra "Negro Unicolor · M".

### Despachar y crear la guía (Effi y despachos)
Envía el pedido a Effi, crea la guía y avísale al cliente.
1. Abre el pedido: Toca el pedido en la lista.
2. Elige Effi: En **Despacho** elige Effi.
3. Revisa y envía: Ves cómo va a Effi: cada producto con su artículo. Toca **Enviar a Effi**: se crea la remisión.
4. Transportadora: Elige transportadora y servicio.
5. Crea la guía: Toca **Crear guía**.
6. Avísale al cliente: Llega el número y la imagen de la guía. Toca **Enviar guía al cliente**. Si pasaron más de 24 h, sale con la plantilla aprobada.
Resultado: Remisión y guía se crean desde el pedido. El cliente recibe la guía con el nombre real de la transportadora. Si activas "crear la guía automáticamente", todo esto pasa solo.

### Estados del envío (Effi y despachos)
Lee el estado real de cada guía y cámbialo a mano solo cuando haga falta.
1. Columna Estado guía: Cada pedido muestra el estado **real** de su guía: Guía generada, En tránsito, En reparto, Novedad, Entregado o Devuelto. Se actualiza solo con Effi y Dropi.
2. Cambiarlo a mano: Desde la lista no se cambia. Si necesitas hacerlo (por ejemplo, un pedido sin guía), abre el pedido.
3. Abajo, en el detalle: En **Estado del pedido**, abajo del detalle, elige el estado.
4. Elige: Elige el estado, por ejemplo **Confirmado**. Si tiene mensaje para el cliente, se lo enviamos por WhatsApp.
Resultado: Con guía, el estado lo pone la transportadora (cada 4 min y al instante con Effi). A mano, solo desde el detalle del pedido.

### Resolver una novedad (Effi y despachos)
Cuando la transportadora no pudo entregar, resuélvelo antes de que devuelva el pedido.
1. Novedades por resolver: Arriba de los pedidos aparecen las novedades, de la más vieja a la más nueva. DealFlow ya le escribió al cliente.
2. Abre la novedad: Toca la fila del pedido con novedad.
3. El cliente ya eligió: El asistente ya habló con el cliente y propone una solución (volver a ofrecer, otra dirección o devolver). Revísala.
4. Envíala a Effi: Fecha (de mañana a 5 días), quién recibe, dirección y celular ya vienen llenos. Toca **Enviar solución a Effi**.
Resultado: DealFlow detecta la novedad, avisa al cliente y el asistente recoge la solución. Puedes dejar que la envíe a Effi solo (Integraciones → Effi). Ves si Effi la aprobó o la rechazó.

### Filtrar y exportar pedidos (Cuenta y reportes)
Encuentra pedidos por estado, guía o ciudad y descárgalos en Excel.
1. Abre los filtros: Toca **Filtros**.
2. Con guía: Filtra por estado, por guía, ciudad o producto. Toca **Con guía**.
3. Exporta: **Exportar** descarga en Excel justo los pedidos que estás viendo.
Resultado: Los filtros se combinan entre sí. El Excel sale con los pedidos filtrados.

### Panel en inglés (Cuenta y reportes)
Cambia el idioma del panel y el del asistente.
1. Tu perfil: Arriba a la derecha toca tu nombre.
2. Idioma: Elige **EN**: todo el panel pasa a inglés al instante.
3. Y el asistente: El idioma del asistente es aparte: en Asistente → Personalidad eliges Español, Inglés o **Automático** (responde en el idioma del cliente).
Resultado: El panel cambia solo para ti. El asistente puede responder en el idioma de cada cliente.

### Tienda en línea (landings): de cero a vender
1. Entra a **Tienda en línea** en el menú. Puedes armar productos desde ya; para publicarlos necesitas la membresía activa.
2. Dale a **Activar membresía**: pagas con Wompi y se suman 30 días. Si vence, hay **3 días de gracia**; después las páginas se apagan hasta renovar (no se borra nada).
3. Dale a **+ Agregar producto**: **De mi catálogo** (trae fotos, variantes, precio y combos; los pedidos quedan ligados para despachar con Effi o Dropi) o **Producto nuevo** (solo para la tienda).
4. Arma la página: a la izquierda los bloques y a la derecha la vista previa (celular o computador). Todo se guarda solo. Bloques: producto (nombre, precio, estrellas, fotos sin recorte), **Ofertas (bundles)** con unidades, título tipo "Paga 1 Lleva 2", precio, precio tachado y cinta "Más vendida 🔥"; el **precio normal por unidad** tacha solo el precio de cada oferta; variantes de color y talla por unidad; botón, barra de anuncios y fechas de entrega; imágenes de abajo; testimonios.
5. **SEO y vista al compartir**: título (60), descripción (160) e imagen 1200×630. Vacíos se arman solos.
6. Arriba a la derecha dale a **Publicar**. Debajo del nombre está la dirección del producto; **Ver página** la abre como la ve el cliente.
7. **Mi tienda**: nombre, logo, favicon, portada, colores, WhatsApp y píxel de la página de inicio con todos los productos. Dirección gratis **tu-nombre.dflw.store** (se puede cambiar).
8. Dominio propio: escríbelo con www y dale a **Conectar dominio**; en el proveedor del dominio (Hostinger, GoDaddy…) crea un registro **CNAME**, nombre **www**, apuntando a **landings.dflw.store**. Espera unos minutos y dale a **Verificar** hasta que diga **Activo**.
9. Los pedidos llegan a **Pedidos** con el ícono de DealFlow y se despachan como cualquier otro. DealFlow le envía al cliente la confirmación por WhatsApp (Sí/No). Si sale "No se pudo enviar la confirmación", revisa que WhatsApp esté conectado y la plantilla **confirmacion_pedido_tienda** aprobada, y dale a **Reenviar confirmación**.
10. En **Pedidos y seguimiento** se puede activar "Despachar solo cuando el cliente confirme": la remisión o guía se crea al recibir el "Sí".
Guía completa con capturas: https://app.dealflow.sbs/tutorial-tienda-en-linea

### Conectar el Píxel de Meta a la tienda en línea
1. En business.facebook.com abre **Administrador de eventos** → Orígenes de datos. Elige tu píxel o conjunto de datos (si no tienes: **Conectar orígenes de datos → Web**).
2. En **Configuración** copia el **Identificador** (15 o 16 dígitos).
3. En DealFlow, en el editor del producto abre **Pedidos y seguimiento** y pégalo en **ID del Píxel de Meta**. Hazlo en cada producto que pautes. Para la página de inicio, pégalo también en **Mi tienda → ID del Píxel de Meta**. Si un producto no tiene píxel, usa el de Mi tienda.
4. Eventos que se envían: PageView, ViewContent, InitiateCheckout (abre el formulario) y Purchase (pedido, con valor en COP).
5. Prueba: en Administrador de eventos → **Probar eventos**, escribe la dirección del producto publicado, haz un pedido de prueba y bórralo después. La vista previa del editor no dispara el píxel. Los bloqueadores de anuncios pueden frenarlo; prueba desde el celular.
6. Campaña: objetivo **Ventas**, conversión en **Sitio web**, tu píxel y evento **Compra**; el enlace del anuncio es la dirección del producto.

### Logística Effi (tablero de envíos)
1. Entra a **Logística Effi**: ves todas las guías de tu Effi (también las hechas por fuera de DealFlow) en columnas: Sin guía, Por recoger, En tránsito, Llega hoy, Novedad, y entregadas/devueltas.
2. Arriba: guías activas, llegan hoy, novedades, entregadas, por recaudar, fletes y efectividad.
3. El recuadro amarillo muestra las **novedades por resolver**: resuélvelas antes de que la transportadora devuelva el pedido. **Revisar en Effi** trae lo último.
4. Filtra por pedido, cliente, guía o ciudad, por transportadora y por periodo; **Ocultar entregadas y devueltas** deja solo lo activo. **Actualizar desde Effi** sincroniza todo.

### Resolver una novedad desde el pedido
En el pedido, bloque **Despacho**: sale la novedad (por ejemplo "Dirección incompleta"). Puedes **Avisar al cliente por WhatsApp** y elegir **Volver a ofrecer** (misma dirección, otro día), **Otra dirección** (misma ciudad) o **Devolver**. Llena fecha (de mañana a 5 días), quién recibe, dirección y celular, y toca **Enviar solución a Effi**.

### Anular en Effi y volver a despachar
Si un pedido salió con un dato malo: abre el pedido y en **Despacho** toca **Anular en Effi** y escribe el motivo. DealFlow anula primero la guía y luego la remisión (Effi no deja anular una remisión con guía vigente). Corrige el pedido con **Editar** (el nombre del cliente también se corrige en Effi) y vuelve a **Enviar a Effi**. Si la guía ya fue recogida por la transportadora, Effi puede no dejar anularla; en ese caso se gestiona en Effi o con la transportadora.

### Errores comunes al enviar a Effi
- Effi pide correo del cliente: DealFlow pone uno técnico automático, no hay que hacer nada.
- Error de sucursal del remitente: en **Integraciones → Effi** revisa la sucursal y el remitente elegidos (prueba con otro remitente de la lista) y guarda.
- Productos sin vincular: en **Integraciones → Effi** abre el producto y usa **Buscar en Effi** en cada variante. Si vendes de un proveedor, pon el **convenio dropshipping**.
- Combos y descuentos: DealFlow reparte el total entre los artículos, así que el recaudo queda exacto.

### Direcciones listas para la guía (botón 🌐)
En el pedido, al lado de **Dirección**, toca **🌐**. DealFlow la deja en formato de guía: mayúsculas y nomenclatura oficial (CRA, CL, AV, DG, TV, KM, APTO, INT, CS, TO, CJ, BRR, LOC), sin inventar números y con las referencias intactas. Revisa la propuesta, **Ver en el mapa** si quieres, y toca **Usar esta dirección**.

### Historial de devoluciones del cliente
En el detalle del pedido sale una tarjeta con el riesgo del cliente según su celular: entregados, devoluciones y % de efectividad, con datos de la red DealFlow (de otras tiendas solo se ven conteos, nunca datos) y de tu propio Effi. Si el cliente ya te devolvió un pedido a ti, sale un aviso rojo y una confirmación antes de crear la remisión en Effi o el pedido en Dropi. Recomendación: confirma por llamada o pide un anticipo del envío.

### Shopify
1. **Integraciones → Shopify**: **Instalar en Shopify** (un clic) o, si instalaste DealFlow desde Shopify, pega el código que te muestra la app y toca **Vincular**.
2. Mientras Shopify aprueba la app: crea una app en dev.shopify.com con los permisos read_products, read_orders, write_orders, read_merchant_managed_fulfillment_orders y write_merchant_managed_fulfillment_orders, instálala y pega **Client ID y Secret** (o el **Admin API token** que empieza por shpat_).
3. Los pedidos entran solos (se revisa cada 5 minutos), se confirman por WhatsApp y la guía vuelve a Shopify. Los packs ("Pack x6") se cuentan como unidades.

### Dropi
En **Integraciones → Dropi**: en Dropi entra a **Mis Integraciones**, crea una integración tipo WooCommerce y pega la URL de integración que te da DealFlow, idéntica; copia el **Token de integración** en DealFlow y elige la transportadora por defecto. Al despachar, el pedido sale con las variantes correctas y la guía en PDF le llega al cliente por WhatsApp.

### Meta Ads y Estadísticas
1. **Integraciones → Meta Ads**: inicia sesión con Facebook, elige **Cuenta publicitaria** y **Página de Facebook** y toca **Guardar conexión**. Si entra con la cuenta equivocada: **Usar otra cuenta de Facebook**, o cierra sesión en facebook.com / usa incógnito. Se actualiza cada 30 minutos.
2. **Estadísticas**: ventas por día, chats, pedidos, **Conversión por anuncio** (qué anuncio trae chats, pedidos y entregas, con su gasto) y recaudos contra entrega de Effi. Filtra por día o rango.

### WhatsApp: conexión y plantillas
- En **WhatsApp**: **Conectar con Facebook** (inicias sesión, eliges o creas la cuenta de WhatsApp Business, registras el número y confirmas el código). También se puede **Vincular por API oficial** con WABA ID, Phone Number ID y Access Token permanente, configurando el webhook en Meta (campo «messages»).
- Pasadas 24 horas desde el último mensaje del cliente, WhatsApp solo deja escribir con una **plantilla aprobada** (botón ⚡ en el Inbox).
- El método de pago de los mensajes de WhatsApp va en la cuenta de Meta del negocio.

### Equipo
En **Equipo** el dueño agrega agentes con **Agregar agente al equipo** (nombre, correo y contraseña). El dueño tiene acceso total.

### Notificaciones y app
Instala DealFlow en el celular (desde el navegador, "Agregar a pantalla de inicio" o el aviso de instalar) y acepta las notificaciones: cada pedido nuevo suena.`;
