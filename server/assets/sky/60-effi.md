# Effi (remisiones, guías, novedades y logística)

## Conectar Effi (API key)
Sección: integraciones, effi
Claves: conectar effi, api key effi, llave effi, effi integracion, usuario effi, permisos effi
1. En Effi ve a **Administración → Usuarios del sistema → Ver más detalles** del usuario que usará DealFlow y copia su **API key** (32 a 40 caracteres). Ese usuario necesita permisos de clientes, artículos, remisiones de venta, guías y novedades de guías.
2. En DealFlow: **Integraciones → Effi → Configurar** → pega la API key → **Conectar Effi** (DealFlow la verifica).
3. Toca **⚡ Configurar todo automático**: elige la configuración, detecta tus convenios y conecta tus productos con su stock (no cambia lo que ya elegiste). Revisa lo que eligió y cámbialo si quieres.
4. **Guardar configuración** → "✓ Configuración guardada. Ya puedes despachar pedidos a Effi". Si dice "Falta elegir sucursal, bodega, centro de costos y forma de pago", complétalos.
Errores: "La API key de Effi tiene entre 32 y 40 caracteres. Cópiala completa"; "Effi rechazó la API key (401): revisa que esté bien copiada y vigente (Administración → Usuarios → Ver más → Renovar API Key)"; "El usuario de la API key no tiene permiso para esta función en Effi (403)" → dale ese permiso al usuario en Effi.
**Desconectar** Effi no afecta los pedidos ya enviados (conservan su remisión).

## Configuración de Effi: 1 · De dónde sale la remisión
Sección: integraciones, effi
Claves: sucursal, bodega, centro de costos, forma de pago, medio de pago, caja, cuenta bancaria, flete, dias de entrega, credito, contado
Cada pedido se crea en Effi como **remisión de venta**. El cliente se registra con tipo de documento **Cédula** y su **celular** como número. Eliges:
- **Sucursal**, **Bodega** y **Centro de costos**.
- **Forma de pago (contra entrega)**: con forma de pago a **crédito** la remisión queda con saldo por cobrar, y ese saldo es el valor del recaudo de la guía (lo normal en contra entrega). Si eliges una de **contado**, también debes elegir **Medio de pago** y **Caja** o **Cuenta bancaria** ("La forma de pago elegida es de contado: elige también el medio de pago").
- **Artículo flete (ID en Effi)**: opcional, para cobrar el envío.
- **Días para la entrega**.
- **Enviar solo a Effi**: cada pedido que cierre el bot sale a Effi sin tocar ningún botón.

## Convenios dropshipping en Effi
Sección: integraciones, effi
Claves: convenio, dropshipping, proveedor, codigo de convenio, sin stock, mercancia propia, convenio por defecto
Si vendes artículos de un **proveedor dropshipping** en Effi, la remisión debe llevar el convenio: así Effi no exige stock en tu bodega (lo despacha el proveedor).
- DealFlow elige solo el convenio de cada producto según sus ventas anteriores en Effi y lo aprende de cada envío.
- En **Convenio dropshipping** agrega tus convenios (nombre + código; los ves en Effi → Dropshipping → Convenios) con **＋ Agregar convenio**. Toca uno para dejarlo **por defecto (★)**: se usa solo para productos de proveedor que todavía no tienen ventas.
- En **3 · Productos** puedes fijar el convenio de cada producto: Automático (según sus ventas en Effi), Mercancía propia (sin convenio) o un convenio concreto.
- Al despachar también puedes elegir el **Convenio para este envío**.
Errores típicos:
- "Estos productos son de un proveedor dropshipping en Effi, pero falta el código del convenio" → escríbelo en Integraciones → Effi → Convenio dropshipping.
- "Este producto de proveedor dropshipping todavía no tiene ventas en Effi, así que no sabemos a cuál de tus convenios pertenece" → fija el convenio del producto o elige uno por defecto.
- "Este pedido tiene productos de proveedores dropshipping distintos y Effi exige un solo convenio por remisión" → divide el pedido en uno por proveedor.
- "Effi no tiene stock para este pedido y estos artículos no están vinculados a ningún proveedor dropshipping" → 1) si los despacha un proveedor, en Effi → Dropshipping vincula esos artículos a los del proveedor y elige ese convenio; o 2) si son tuyos, carga el inventario en tu bodega.
- "Sin stock propio: se reintenta como dropshipping (convenio …)" es un aviso: DealFlow lo resolvió solo.

## Configuración de Effi: 2 · Guía de transporte automática
Sección: integraciones, effi
Claves: guia automatica, transportadora, servicio, pago del flete, remitente, peso, dimensiones, crear guia sola
- **Crear la guía automáticamente**: apenas se crea la remisión, DealFlow también crea la guía con la transportadora que elijas y le avisa la guía al cliente por WhatsApp. Si la apagas, la generas al despachar (o dentro de Effi).
- Eliges **Transportadora**, **Servicio**, **Pago del flete**, **Remitente**, **Peso (kg)**, **Peso volumétrico (kg)** y **Alto × ancho × largo (cm)**.
- **Remitente = bodega de origen.** Muchas cuentas tienen varios remitentes con el mismo nombre (la tienda) en bodegas distintas: principal, garantías, devoluciones o la del proveedor. Por eso el selector los muestra con ciudad, dirección y código (#), y DealFlow nunca elige uno solo: al generar cada guía el campo **Remitente (bodega de origen) · obligatorio** arranca vacío y hay que escogerlo. Si intentas crear la guía sin elegirlo sale el aviso rojo "⚠️ Tienes que seleccionar el remitente". Para activar la guía automática también es obligatorio elegirlo en Integraciones → Effi. Todas las guías automáticas salen del remitente que esté guardado aquí; generar una guía a mano con otro remitente no cambia el de las automáticas. Si el remitente guardado se anuló en Effi, la guía no se crea y te avisa.
- Problema de sucursal del remitente: si Effi responde un error con la sucursal o el remitente, prueba con otro **Remitente** de la lista (cada remitente tiene su sucursal configurada en Effi) y guarda.

## Configuración de Effi: novedades y devoluciones automáticas
Sección: integraciones, effi
Claves: novedades automaticas, avisar al cliente novedad, asistente resuelve novedad, enviar solucion automatica, devolucion automatica
En **⚠️ Novedades de envío**: cuando la transportadora no puede entregar (cliente ausente, dirección errada…), DealFlow lo detecta en Effi, pone el pedido en **Novedad** y te lo muestra en Pedidos. Interruptores:
- **Avisarle al cliente por WhatsApp** (si pasaron más de 24 h, va con la plantilla «novedad_envio_pedido»).
- **Que el asistente resuelva la novedad con el cliente**: le pregunta si se lo vuelven a llevar, a qué dirección y qué día, y deja la solución lista.
- **Enviar la solución a Effi automáticamente** (si lo apagas, la confirmas tú con un botón en el pedido).
- **Registrar la devolución en Effi automáticamente**: cuando un pedido queda «Devuelto», DealFlow crea la devolución de venta y la mercancía vuelve a tu bodega (si lo apagas, lo haces con **Registrar devolución en Effi** dentro del pedido).

## Configuración de Effi: 3 · Productos (vincular artículos)
Sección: integraciones, effi, productos
Claves: vincular productos effi, articulo effi, sincronizar productos, manual, automatico, sin articulo de effi, stock effi, buscar en effi
- **Manual**: cada variante se despacha EXACTAMENTE con el artículo de Effi que tú le pongas, en Productos → el producto → Variantes → vínculo con Effi (o aquí). DealFlow nunca lo cambia. El stock sí llega de Effi cada 30 min.
- **Automático**: DealFlow vincula solo por nombre y variante (aunque las palabras estén en otro orden, ej. "Talla M · Negro" encuentra "Negro Unicolor · M") y si un artículo propio no tiene stock usa el del proveedor. Úsalo solo si cada variante tiene un único artículo en Effi.
- Lista de productos (acordeón): marca cada producto como **Effi** o **Dropi**; en cada variante sale "Artículo #…", "⚡ automático" o "Sin artículo de Effi" → **Buscar en Effi** (escribe nombre, referencia o ID).
- **↻ Sincronizar productos de Effi** trae artículos y stock al momento.
- **Revisar vínculos**: compara cada variante con el artículo de Effi del mismo nombre y muestra las que quedaron mal; marca y **Desvincular marcadas** para elegirlas a mano.
Errores: "No pudimos emparejar con Effi: … Revísalo en Productos → el producto → Variantes → Effi"; "En Effi no existe el artículo #… (o tu API key no lo puede ver)"; "El artículo #… es tuyo, no de un proveedor dropshipping. Pon aquí el ID del artículo del PROVEEDOR".

## Configuración de Effi: 4 · Webhooks (opcional)
Sección: integraciones, effi
Claves: webhook effi, secreto webhook, avisos effi, estados al instante
No necesitas crearlos: DealFlow consulta a Effi solo (estados de guías y novedades cada 4 min; registro de todas las guías cada 20 min). Si quieres los cambios al instante: en Effi → **Integraciones → Webhooks → Crear webhook**, crea uno por cada evento (creación/anulación de remisión, creación/modificación/cambio de estado de guía, creación de novedad) con la URL que muestra DealFlow (usa **Duplicar**), plataforma destino **Otra**, y pega en DealFlow el **secreto** (64 caracteres) de cada uno → **Guardar secreto**. **Ver últimos avisos** muestra lo que ha llegado.

## Despachar un pedido con Effi (remisión y guía)
Sección: pedidos, effi
Claves: despachar, enviar a effi, crear remision, crear guia, generar guia, despacho effi, revisar envio
1. Abre el pedido → **Despacho** → **Effi** (remisión + guía).
2. **Revisar envío a Effi →**: ves cómo va cada producto con su artículo de Effi y el convenio.
3. Si la guía automática está apagada, marca **🚚 Crear también la guía de transporte** y elige transportadora, servicio, pago del flete y remitente.
4. **Crear remisión y guía** (o **Crear solo la remisión**). "✓ Remisión … creada en Effi".
5. Cuando sale la guía, se le avisa al cliente por WhatsApp sola.
Generar la guía después: **🚚 Generar guía en Effi** (paquetes: peso, peso volumétrico, alto, ancho, largo; contenido; valor declarado; nota; "Recibe los sábados"). El recaudo contra entrega se toma del saldo de la remisión y la dirección es la del pedido.
Si el cliente ya te devolvió antes, primero sale la confirmación de riesgo.

## Errores al enviar a Effi (remisión)
Sección: pedidos, effi
Claves: effi no creo la remision, error effi, no se pudo crear el cliente en effi, ciudad effi, departamento, correo effi, celular valido, no tiene direccion
- "Effi no está configurado: conecta la API key y elige sucursal, bodega, centro de costos y forma de pago" → completa Integraciones → Effi.
- "El pedido no tiene un celular válido (se usa como documento del cliente en Effi)" → edita el pedido y pon un celular de 10 dígitos.
- "El pedido no tiene ciudad" / "El pedido no tiene dirección" / "El pedido no tiene productos" → **✏️ Editar** el pedido.
- "Effi no reconoce la ciudad …" o "La ciudad … existe en varios departamentos" → corrige ciudad y departamento en el pedido (escritos como en Effi).
- "Effi no respondió la lista de departamentos. No es un error de la dirección": Effi está lento; intenta en unos minutos.
- "No se pudo crear el cliente en Effi: …" → el motivo viene de Effi (documento, nombre o correo). Si Effi exige correo, DealFlow pone uno técnico automático ("Effi exige correo del cliente: se usó uno técnico").
- Nombre del cliente distinto en Effi: DealFlow lo corrige ("Nombre del cliente corregido en Effi: «…» → «…»").
- "Productos con varias variantes juntas: se separaron en un ítem por variante" es solo un aviso.
- Combos y descuentos: DealFlow reparte el total entre los artículos sin descuentos, así el recaudo queda exacto (diferencias de ±$1 por redondeo).
- Errores de convenio/stock: ver el artículo de convenios dropshipping.
- "DF-… confirmado pero no se pudo enviar a Effi: …" → despáchalo desde el pedido después de corregir.

## Errores al generar la guía en Effi
Sección: pedidos, effi
Claves: effi no creo la guia, no se genero la guia, transportadora no disponible, cobertura, remitente, guia fallo
- "Elige transportadora, servicio, pago del flete y remitente" → completa los cuatro.
- "Primero crea la remisión en Effi; la guía se genera sobre esa remisión".
- "Effi no creó la guía: …" → el motivo es de Effi o de la transportadora: sin cobertura en esa ciudad (prueba otra transportadora), peso/dimensiones inválidos, remitente sin sucursal válida (prueba otro remitente), saldo o configuración del convenio. Reintenta con **🚚 Generar guía en Effi**.
- La guía puede tardar en salir: "Se actualiza solo. Cuando salga la guía, se la avisamos al cliente por WhatsApp". Puedes tocar **↻ Buscar el número ahora**.

## Anular en Effi y volver a despachar
Sección: pedidos, effi
Claves: anular, anular remision, anular guia, corregir pedido despachado, volver a despachar, rehacer guia, remision equivocada
Si un pedido salió con un dato malo:
1. Abre el pedido → **Despacho** → **Anular en Effi** ("Anula en Effi la guía y la remisión para corregir el pedido y volver a despacharlo").
2. Escribe el **Motivo** (ej. corregir nombre del cliente) y confirma. DealFlow anula primero la guía y después la remisión (Effi no deja anular una remisión con guía vigente): "✓ Anulada en Effi: …".
3. Corrige el pedido con **✏️ Editar** (cliente, dirección, productos). El nombre del cliente también se corrige en Effi.
4. **Volver a despachar** con una remisión nueva.
Si la transportadora ya recogió el paquete, Effi no deja anular: gestiónalo en Effi o con la transportadora. Errores: "Este pedido no tiene remisión en Effi"; "No se pudo anular la guía/remisión: …" (motivo de Effi).

## Rastreo, evidencia y devolución
Sección: pedidos, effi
Claves: rastreo, rastrear guia, movimientos, evidencia, foto de entrega, devolucion, registrar devolucion, mercancia volvio
- **📍 Rastreo de la guía** → **Ver movimientos** / **↻ Actualizar**. "La transportadora todavía no reporta movimientos" es normal en las primeras horas.
- **📷 Evidencia**: foto de la entrega cuando la transportadora la reporta.
- **↩️ Pedido devuelto** → **Registrar devolución en Effi** para que los productos vuelvan al inventario de tu bodega (o automático si está activado). "La remisión no tiene productos para devolver".

## Resolver novedades de envío
Sección: pedidos, effi, logistica
Claves: novedad, novedades, cliente ausente, direccion incompleta, volver a ofrecer, redireccionar, devolver al remitente, solucion effi, novedad operativa
Arriba en **Pedidos** (y en Logística Effi) aparece **⚠️ N novedades por resolver** ("Resuélvelas antes de que la transportadora devuelva el pedido"). **↻ Revisar en Effi** trae lo último.
En el pedido, bloque de la novedad:
- **💬 Avisar al cliente por WhatsApp** (o ya lo hizo DealFlow: "Esperando respuesta del cliente"). "🤖 Lo acordó el asistente con el cliente; revísalo y envíalo".
- Elige la solución: **Volver a ofrecer** (misma dirección, otro día), **Otra dirección** (en la misma ciudad) o **Devolver** (regresa al remitente).
- Llena **Fecha de entrega** (entre mañana y 5 días), **Quién recibe**, **Dirección**, **Celular de contacto** y **Nota** → **Enviar solución a Effi**.
Mensajes:
- "Novedad operativa: la está gestionando la transportadora; no necesitas enviar solución".
- "Ya hay una solución enviada esperando respuesta de la transportadora".
- "Esta novedad ya está cerrada en Effi".
- "Effi rechazó la solución: …" → corrige el dato y reenvía.
- "No le escribimos: …" / "El cliente no escribe hace más de 24 h y la plantilla novedad_envio_pedido aún no está aprobada".
- "No pudimos leer las novedades de Effi … Revisa que el usuario de la API key tenga permiso de consulta en «Novedades de guías de transporte»".
- Novedad de una guía hecha por fuera de DealFlow ("Sin pedido en DealFlow"): **🔗 Unir a un pedido** con su número (ej. 1049) u **Ocultar**. "El pedido DF-… ya tiene otra guía".

## Logística Effi: el tablero de envíos
Sección: logistica
Claves: logistica, tablero, guias, envios, por recoger, en transito, llega hoy, entregadas, devueltas, solo effi, efectividad, por recaudar
**Logística Effi** muestra todas las guías de tu Effi (también las hechas por fuera de DealFlow, marcadas "SOLO EFFI") por etapa:
- **Sin guía** (remisión creada, falta la guía), **Por recoger** (la transportadora aún no la recoge), **En tránsito**, **Llega hoy** (en reparto), **Novedad**, **Entregado** y **Devuelto**.
- Arriba: Guías activas, Llegan hoy, Novedades, Entregadas, Por recaudar, Fletes y Efectividad.
- Filtros: buscar por pedido, cliente, guía o ciudad; **Origen** (Todas, Pedidos de DealFlow, Solo en Effi); **Transportadora**; **Periodo** (7, 15, 45 o 90 días); **Ocultar entregadas y devueltas**.
- Cada tarjeta: entrega estimada, copiar número de guía, **Ver la guía**, abrir el chat del cliente.
- **Actualizar desde Effi** sincroniza todo. "Todavía no hay pedidos enviados por Effi en este periodo".

## Recaudos contra entrega de Effi (Wallet)
Sección: estadisticas, effi
Claves: recaudo, wallet, consignacion, plata, dinero, pagos effi, retirado, pendiente de pago, fletes y comisiones
En **Estadísticas → 💵 Recaudos contraentrega · Effi** ves por mes lo que Effi ya consignó en tu Wallet por cada guía y lo que falta: **Fletes y comisiones** (descontado por Effi), **Retirado a tu banco**, **Pendiente de pago** y **Entregados sin pagar todavía**. "Effi no registra movimientos en tu Wallet este mes" si no hay.

## Remitente automático para los pedidos de un proveedor (convenio dropshipping)
Sección: effi
Claves: remitente proveedor, remitente automatico, bodega del proveedor, convenio, dropshipping, emprendedor, no carga el remitente, remitente por convenio
- Si el pedido sale con el **convenio de un proveedor**, la guía (manual o automática) toma sola la **bodega de ese proveedor** como remitente. En el pedido sale "✓ Se puso solo: …" con el motivo; revísalo antes de crear la guía.
- De dónde lo saca: 1) el que fijaste para ese convenio en **Integraciones → Effi → Guía de transporte → Remitente de cada proveedor**; 2) el que usaste la última vez con ese convenio; 3) el que usan otras tiendas de DealFlow con ese mismo proveedor, si ese remitente también existe en tu Effi.
- Si el remitente ya no existe en tu Effi, no se usa.
- Los pedidos con **inventario propio** (sin convenio) no se preseleccionan: eliges tú la bodega, como siempre.
- Para fijarlo: Integraciones → Effi → Guía de transporte → **Remitente de cada proveedor (convenio)** → elige la bodega. "Automático (aprendido)" lo deja en manos de DealFlow.

## Ponerle nombre a las bodegas (remitentes) para reconocerlas
Sección: effi
Claves: nombre remitente, nombre bodega, apodo remitente, todos los remitentes se llaman igual, remitentes solo direccion, reconocer bodega
Effi les pone a todos los remitentes el nombre de la tienda, así que solo se distinguen por la dirección. En DealFlow:
- Los remitentes de un proveedor salen como **🏭 Bodega de [proveedor]** (según los convenios con que se han usado).
- Puedes ponerle un nombre a cada uno: al crear la guía, elige el remitente y toca **✏️ Ponerle un nombre a esta bodega**, o en **Integraciones → Effi → Guía de transporte → Nombres de tus bodegas**. Sale como **📌 [tu nombre]**.
- En la lista salen primero los que tienen nombre, después los de proveedores y al final el resto (con ciudad y dirección). El nombre repetido de la tienda ya no se muestra.
