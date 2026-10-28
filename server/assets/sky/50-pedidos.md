# Pedidos

## La lista de pedidos: buscar, filtrar, ordenar y exportar
Sección: pedidos
Claves: pedidos, buscar pedido, filtros, filtrar, exportar, excel, csv, ordenar, con guia, sin despachar, por ciudad, por producto
- Buscador: cliente, teléfono, número (DF-…), producto o guía.
- **Filtros**: Estado, Fecha del pedido (Hoy, Ayer, 7 días, 30 días, Este mes o rango), Canal (WhatsApp, Instagram, Messenger, Chat web, Shopify, Tienda en línea, Manual), Despacho (Sin despachar / Con guía), Ciudad, Producto y Valor mínimo/máximo. **Limpiar filtros** los quita.
- **Ordenar**: Más recientes, Más antiguos, Mayor valor, Menor valor, Cliente A-Z.
- **Exportar** descarga en Excel (CSV) justo los pedidos que estás viendo con los filtros actuales.
- Con Shopify conectado hay un botón para traer los pedidos de la última semana que no estén en DealFlow (también se revisa solo cada 5 minutos).
- La columna de estado muestra el estado REAL de la guía (se actualiza solo con Effi y Dropi); desde la lista no se cambia.
- El ícono de origen indica de dónde vino el pedido (WhatsApp, Instagram, Messenger, Shopify, Chat web, Tienda en línea o Manual).

## Estados del pedido y cómo cambian
Sección: pedidos
Claves: estados, estado del pedido, nuevo, confirmado, guia generada, en transito, en reparto, novedad, entregado, devuelto, cancelado, cambiar estado
Flujo: **Nuevo → Confirmado → Guía generada → En tránsito → En reparto → Entregado**. Aparte: **Novedad** (problema en la entrega), **Devuelto** y **Cancelado**.
- Con guía, el estado lo pone sola la sincronización con Effi/Dropi (Effi se revisa cada pocos minutos). Un pedido entregado, devuelto o cancelado ya no cambia solo.
- A mano: abre el pedido → abajo en **Estado del pedido** elige el estado. Si ese estado tiene mensaje para el cliente, se le envía por WhatsApp.
- "Este pedido ya está entregado": no se puede avanzar más.

## Crear un pedido a mano
Sección: pedidos
Claves: crear pedido, pedido manual, registrar pedido, pedido por fuera del bot, agregar pedido
1. En **Pedidos** toca **＋ Crear pedido**.
2. **Datos del cliente**: Nombre (obligatorio), Teléfono, Departamento, Ciudad y Dirección.
3. **Productos**: busca el producto, elige su talla/color, cantidad y precio unitario (**+ Agregar otro producto**). El total se calcula solo; puedes poner **Envío** y una **Nota**.
4. **Crear pedido**. Aparece de primero en estado **Nuevo**.
Errores: "Falta el nombre del cliente" / "Escribe el nombre del cliente"; "Agrega al menos un producto al pedido". Si un producto del chat no está en tu catálogo sale "No encontramos … en tu catálogo": elige el producto para que case al despachar; si no, se guarda tal cual.
También desde el Inbox: **🧾 Crear pedido para él/ella** (autocompleta con IA leyendo el chat).

## El detalle del pedido
Sección: pedidos
Claves: detalle, abrir pedido, datos de envio, que pidio, total, editar pedido, eliminar pedido, abrir chat, metodo de pago
Al tocar un pedido se abre el detalle:
- Fecha y hora, **Abrir chat ↗** del cliente.
- **Confirmación por WhatsApp**: el estado de la confirmación Sí/No (ver artículo de confirmación).
- **Datos de envío**: nombre, contacto, departamento, ciudad, dirección (con el botón 🌐) y método de pago (Contraentrega).
- **Historial del cliente** (riesgo de devolución).
- **Qué pidió**: una línea por variante, envío y total.
- **Despacho**: Effi o Dropi, remisión, guía, rastreo, novedades.
- **Estado del pedido**, **✏️ Editar** y **🗑 Eliminar**.
- **✏️ Editar**: corrige datos del cliente, productos, envío, total y nota → **Guardar cambios** ("El pedido debe tener al menos un producto").
- **🗑 Eliminar** solo lo quita del panel; **no cancela nada en Dropi/Effi** (anúlalo allá o con **Anular en Effi** primero).
- **🧩 Corrige la talla o el color**: aparece si un producto del pedido pide una variante que no existe; elige la correcta (pregúntale al cliente si hace falta). "No encontramos el producto: corrígelo con ✏️ Editar".

## Confirmación del pedido por WhatsApp (Sí / No)
Sección: pedidos
Claves: confirmacion, confirmar pedido, si no, pedir confirmacion, reenviar confirmacion, no se pudo enviar la confirmacion, cliente no confirmo
En el detalle del pedido sale uno de estos estados:
- "Aún no se ha pedido confirmación por WhatsApp" → **Pedir confirmación**.
- "Esperando que el cliente confirme por WhatsApp".
- "El cliente confirmó el pedido por WhatsApp".
- "El cliente respondió que NO: escríbele desde el Inbox".
- "No se pudo enviar la confirmación por WhatsApp" → **Reenviar confirmación**.
Se usa con pedidos de Shopify, Tienda en línea y creados a mano (los del bot ya quedan confirmados en el chat). Si no se pudo enviar: revisa que WhatsApp esté conectado (oficial) y que la plantilla **confirmacion_pedido** (o **confirmacion_pedido_tienda** para la Tienda en línea) esté aprobada; luego **Reenviar confirmación**. Los pedidos antiguos no reciben confirmación automática.
Con "Despachar solo cuando el cliente confirma" activo, la remisión/guía se crea sola al recibir el "Sí".

## Botón 🌐: dirección lista para la guía
Sección: pedidos
Claves: direccion, ordenar direccion, nomenclatura, georeferenciar, mapa, direccion mal escrita, calle carrera, globo
Al lado de **Dirección** en el detalle toca **🌐** ("Dejar la dirección lista para la guía y verla en el mapa"):
- DealFlow la deja en formato de guía: MAYÚSCULAS y nomenclatura oficial (CRA, CL, AV, DG, TV, KM, APTO, INT, CS, TO, CJ, BRR, LOC), ordenada para la transportadora, con el barrio (BRR) y la localidad (LOC, en Bogotá) cuando aplica, y las referencias intactas.
- Nunca inventa números: si la IA agrega un número que no estaba, se descarta esa propuesta.
- Revisa **Lista para la guía**, abre **🗺️ Ver en el mapa ↗** si quieres y toca **Usar esta dirección** ("✓ Dirección lista para la guía").
- "Sin IA conectada: se ordenó con las reglas básicas (sin barrio ni localidad)" = salió el ordenador básico; igual sirve.
- "La dirección no puede quedar vacía".

## Historial de devoluciones del cliente (riesgo)
Sección: pedidos
Claves: historial, devoluciones, riesgo, cliente devuelve, red dealflow, cliente nuevo, buen historial, riesgo alto, lucidbot, validar cliente
En el detalle del pedido sale la tarjeta del cliente según su celular:
- **Cliente nuevo**, **Buen historial**, **Ha devuelto pedidos** o **Riesgo alto de devolución**, con entregados, devoluciones y % de efectividad.
- **Red DealFlow**: pedidos de ese celular en todas las tiendas (de otras tiendas solo se ven conteos, nunca la tienda ni los datos).
- **Tu Effi**: guías de ese cliente en tu cuenta de Effi (también las hechas por fuera de DealFlow).
- Si ya te devolvió a TI, sale "⛔ 1 devolución con [tu tienda]" y, antes de crear la remisión en Effi o la orden en Dropi, una confirmación: "Muchas tiendas no le vuelven a despachar contra entrega a un cliente que ya devolvió, a menos que el pago sea anticipado. ¿Despachar de todas formas?".
- Recomendación: confírmalo por llamada o pide un anticipo del envío.

## Poner, subir y enviar la guía a mano
Sección: pedidos
Claves: numero de guia, guia manual, subir guia, pdf guia, enviar guia al cliente, reenviar guia, la guia no le llego
- **¿Ya tienes el número de guía? Ponlo a mano**: pega el número que te dio la transportadora → **Guardar y enviar al cliente** (se le envía por WhatsApp). "Escribe un número de guía válido (solo letras, números o guiones)".
- **Subir guía (PDF o imagen)**: máximo 15 MB, PDF o PNG/JPG. Si el PDF no se puede convertir a imagen se envía como PDF. **⬇ Descargar** y **Cambiar documento**.
- **💬 Volver a enviar la guía al cliente**: va al chat; si la ventana de 24 h está cerrada sale con la plantilla **guia_envio_pedido**.
- "No se le pudo enviar la guía al cliente": revisa el **Registro** del pedido; normalmente falta que Meta apruebe la plantilla **guia_envio_pedido** o WhatsApp está desconectado.
- "El pedido todavía no tiene número de guía": primero genera o pon la guía.

## Eliminar o cancelar un pedido
Sección: pedidos
Claves: borrar pedido, cancelar pedido, eliminar pedido, anular pedido
- **🗑 Eliminar** quita el pedido del panel, pero no cancela nada en Effi ni Dropi.
- Para cancelarlo de verdad: si ya salió a Effi usa **Anular en Effi** (o anúlalo dentro de Effi); en Dropi cancélalo en Dropi. Luego cambia el estado a **Cancelado** o elimínalo.
