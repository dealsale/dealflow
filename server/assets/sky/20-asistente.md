# El asistente (bot de ventas con IA)

## Configurar el asistente: las cuatro pestañas
Sección: asistente
Claves: configurar bot, personalidad, tono, nombre del bot, saludo, despedida, idioma del bot, emojis, usted, tu, respuestas cortas, colombiano, instrucciones
En **Asistente** hay cuatro pestañas. Las opciones de tarjetas y botones se guardan solas; el nombre, los textos, las instrucciones y las reglas se guardan con **Guardar cambios** ("✓ Guardado. El asistente ya responde así").
**🎭 Personalidad**
- **Nombre del asistente**: con ese nombre se presenta (si lo dejas vacío usa el nombre de la tienda).
- **Personalidad**: Amigable, Profesional, Divertido, Asesor experto o Directo.
- **Idioma**: Español, English o Automático (responde en el idioma del cliente). Aplica también a los mensajes automáticos (confirmación, estados y guía).
- **Tono y estilo**: Trato (Tú / Usted), Emojis (sin, pocos, muchos), Respuestas (cortas, medias, detalladas) y Forma de hablar (neutral o colombiana).
- **Saludo** (si no se envía un mensaje inicial de producto) y **Despedida**.
**🏪 Tu negocio** — lo que escribas aquí lo responde **tal cual**; lo que dejes vacío no lo menciona ni lo inventa:
- 🚚 Envíos (tiempos, costo, ciudades), 💳 Formas de pago, 🔄 Cambios y garantía, 🕘 Horario de atención, 📍 Ubicación / redes, 📝 Otra información.
- ❓ **Preguntas frecuentes**: pregunta + respuesta exacta (**+ Agregar pregunta**).
**💰 Cómo vende**
- **Qué tanto insiste**: Suave (informa y deja decidir), Equilibrada (resuelve y propone el siguiente paso) o Persuasiva (resalta beneficios y maneja objeciones).
- **Sugerir combos y complementos**: cuando el cliente ya eligió, le ofrece una vez un combo o un producto que combine.
- **Instrucciones de venta**: escríbelo como se lo explicarías a un empleado nuevo (qué ofrecer, cómo responder precios, qué destacar).
- **Mensaje automático de actividad 💬**: si el cliente deja de responder, le vuelve a escribir a los 5 min, 30 min y 1 hora según lo que hablaban. Se detiene apenas responde, respeta la ventana de 24 h y nunca escribe en chats que atiende una persona.
**🛡️ Reglas y límites**
- **Reglas**: se cumplen siempre (agrega todas las que necesites).
- **🚫 Nunca debe…**: temas, palabras o promesas prohibidas (competencia, fechas exactas, descuentos, política…).
- **🙋 Pasar el chat a una persona**: cuándo (si lo dejas vacío: cuando pidan un asesor, tengan una queja o pregunten algo que no sabe) y el mensaje al pasar el chat. El chat queda en el Inbox como "Equipo (pidió asesor)".
Si "La configuración del asistente es demasiado larga", resume la información del negocio o las preguntas frecuentes (hay un límite de tamaño).

## Probar el asistente sin usar WhatsApp
Sección: asistente
Claves: probar bot, chat de prueba, simular cliente, test, como responde
En **Asistente**, al lado derecho está **🧪 Prueba tu asistente**: chateas como si fueras un cliente ("hola", "tienes joggers?", "mándame fotos", "quiero 2"). No usa WhatsApp, así que funciona aunque Meta esté caído. **↻ Empezar de nuevo** borra la conversación de prueba. Los cambios que guardes se reflejan en la siguiente respuesta. Si dice "El chat de prueba está disponible cuando tu tienda está conectada", la tienda aún no está activa en el servidor (por ejemplo, en la demo).

## El asistente no responde: causas y solución
Sección: asistente, inbox
Claves: bot no responde, no contesta, asistente no responde, no responde los mensajes, se quedo callado, no atiende, sin respuesta, bot apagado
Revisa en este orden:
1. **WhatsApp desconectado**: arriba en rojo "WhatsApp desconectado". Reconéctalo en **WhatsApp**.
2. **El chat lo atiende una persona**: en el Inbox el chat dice "Equipo (pidió asesor)", "Equipo (requiere atención)" o el nombre de un agente. El bot no responde hasta que toques **Devolver al asistente**.
3. **Pase automático**: si la IA falló, respondió vacío, quiso vender algo que no está en el catálogo o Meta no entregó su respuesta, DealFlow pasa el chat al equipo y lo anota en el **🩺 Registro** del chat. Resuelve y devuelve el chat al asistente.
4. **Sin IA**: el registro dice "El asistente NO respondió: no hay IA configurada" o "La IA (deepseek) falló (HTTP 401/402)". Si usas tu propia clave en **Integraciones → DeepSeek**, revisa que sea correcta y tenga **saldo** (402 = sin saldo). Si no tienes clave propia, escribe a soporte.
5. **Contacto bloqueado** o el cliente pidió que no le escriban: DealFlow ya no le escribe.
6. **Ventana de 24 h**: si el último mensaje del cliente tiene más de 24 h, el bot no puede escribir texto libre (pero sí responde apenas el cliente escriba).
7. **Otra plataforma conectada** al mismo número puede estar recibiendo los mensajes (revisa **WhatsApp → Apps conectadas**).
8. **Plan vencido**: si la cuenta está bloqueada por pago, renueva.
Usa siempre el **🩺 Registro general** (Inbox) o el **🩺 Registro** de cada chat: ahí sale el motivo exacto.

## El asistente responde mal o inventa: cómo corregirlo
Sección: asistente, productos
Claves: responde mal, inventa, precio equivocado, ofrece lo que no hay, dice cosas falsas, no sigue reglas, mejora respuestas, bot dice otro precio
- El asistente solo sabe lo que está en **Productos** (precio, variantes, combos, descripción, reglas y preguntas frecuentes del producto) y en **Asistente** (negocio, reglas, instrucciones). Si algo no está escrito, puede no saberlo.
- **Precios y promos**: pon las promos de precio por unidad en **🏷️ Precio de promoción** del producto y los "lleva 3 por…" en **Combos**, no solo en las reglas; así el asistente no puede cobrar el precio normal por error. DealFlow revisa el total de cada pedido contra el catálogo y lo corrige ("Precio corregido: el asistente puso $… y según el catálogo es $…").
- **Variantes**: si el cliente pide una talla/color que no existe, el asistente no crea el pedido y le ofrece las que sí hay.
- **Productos duplicados**: si en Productos sale "Hay productos duplicados", deja solo uno: el bot puede enviar la versión vieja.
- Agrega **Reglas** concretas ("Nunca ofrezcas envío gratis", "Si preguntan por mayor, pasa el chat") y **Preguntas frecuentes** con la respuesta exacta.
- Prueba cada cambio en **🧪 Prueba tu asistente**.

## Cómo crea el asistente los pedidos (y por qué a veces no lo crea)
Sección: asistente, pedidos
Claves: no crea pedido, pedido no se creo, nombre invalido, celular invalido, el mismo numero, pide nombre otra vez, faltan datos, pedido repetido, pedido duplicado
Cuando el cliente confirma, el asistente crea el pedido en **Pedidos** con sus datos y le manda el resumen. Antes de crearlo DealFlow verifica:
- **Nombre real**: si el "nombre" parece una frase o un número ("claro cuántos días", "Si L"), no crea el pedido y le pregunta "¿A nombre de quién enviamos el pedido? (nombre y apellido)".
- **Celular**: debe ser uno que el cliente escribió en el chat o que confirmó con "el mismo". El asistente nunca inventa un número. Si falta, le pregunta.
- **Producto y variante**: deben existir en el catálogo. Si no, le muestra las opciones o pasa el chat al equipo.
- **Precio**: se recalcula con el catálogo (combos y promo incluidos).
- Si el asistente repite el pedido no se crea otro ("El asistente repitió el pedido: no se creó otro"); si el cliente cambia algo, se actualiza el mismo pedido.
Todo queda anotado en el **🩺 Registro** del chat con el motivo exacto.

## Mensaje inicial y disparadores (lo que se envía cuando preguntan por un producto)
Sección: productos, asistente
Claves: mensaje inicial, disparador, saludo del producto, fotos automaticas, no se envio el mensaje inicial, anuncio, me interesa, presentacion del producto
- Cada producto tiene un **Mensaje inicial**: bloques de texto, imágenes, videos y audios que se envían solos cuando el cliente pregunta por ese producto (pieza por pieza, con pausas de persona).
- **Disparador**: si el primer mensaje del cliente se parece a ese texto (ej. "¡Hola! Me interesan los Bota recta ámbar", que es el texto del botón del anuncio), se envía todo el mensaje inicial.
- Puedes tener **varios mensajes iniciales** por producto (**+ Nuevo mensaje**, **⧉ Duplicar**, **Renombrar**): enciende uno para enviar siempre ese; si enciendes varios, cada cliente recibe uno al azar (sirve para probar cuál vende más).
- **Anuncios sin disparador**: si el cliente llega desde un anuncio de Meta, DealFlow liga el anuncio con su producto (en **Integraciones → Meta Ads → 🏷️ Anuncios y productos**, "AUTO" o elegido a mano) y envía su mensaje inicial. En el Inbox puedes vincularlo desde "📢 Vino del anuncio".
- Enviarlo a mano: en el Inbox → **Enviar mensaje inicial o plantilla** → **Mensaje inicial** → elige el producto ("✓ Mensaje inicial enviado").
Problemas:
- "Este producto no tiene mensaje inicial cargado": agrégale bloques en el producto.
- Registro "Una foto o video de … no se envió porque su archivo ya no está en el servidor": vuelve a subir esa pieza en el producto.
- "Se activó … pero NO se envió ninguna pieza": revisa la conexión de WhatsApp.
- Recomendación anti-baneo: mensaje inicial corto (saludo, 2-3 fotos y una pregunta).
