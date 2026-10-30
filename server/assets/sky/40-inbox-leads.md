# Inbox (chats en vivo) y Leads

## El Inbox: filtros y lista de chats
Sección: inbox, crm
Claves: inbox, chats, conversaciones, crm, filtros, no leidos, esperando, en vivo, buscar chat, etiqueta, fecha
En **Inbox · Chats en vivo** ves lo que pasa ahora en tu WhatsApp (y Messenger, Instagram y chat web).
- Pestañas: **Todos**, **No leídos**, **Esperando** (el cliente espera respuesta) y **En vivo** (lo atiende una persona).
- **Buscar por nombre o teléfono**, filtro de **Etiqueta** y de **Fecha** (Hoy, Ayer, Últimos 7 días o rango personalizado).
- Cada chat muestra su canal (WhatsApp, Messenger, Instagram DM, chat web), si **📢 Vino del anuncio**, los mensajes sin leer y quién lo atiende.
- **🩺 Registro general**: actividad y errores de toda la tienda (envíos fallidos, pedidos no creados, pases a humano, etc.).

## Atender un chat: intervenir y devolver al asistente
Sección: inbox
Claves: intervenir, tomar el chat, responder yo, devolver al asistente, pausar bot, apagar bot en un chat, reiniciar chat, eliminar chat
- **Intervenir yo**: el asistente deja de responder en ese chat y lo atiendes tú.
- Escribe en la caja (puedes pegar imágenes, audios o videos, adjuntar archivos 📎 o grabar una **nota de voz** 🎤).
- **Devolver al asistente**: el bot sigue vendiendo desde donde quedó.
- **Reiniciar**: borra el historial y devuelve el chat al asistente (empieza de cero).
- **Eliminar**: borra el chat por completo (pide confirmar).
- **🩺 Registro**: el registro de actividad de ESTE chat (qué envió, qué falló y por qué).
- **Reenviar** un mensaje tuyo que falló ("Solo se pueden reenviar los mensajes que envías tú").
- Si sale "Guardado en el CRM, pero no salió por WhatsApp: …", el mensaje quedó en DealFlow pero WhatsApp lo rechazó; el motivo aparece al lado (ventana de 24 h, número sin WhatsApp, etc.).
- Mensaje con "⚠ no enviado" o "⛔ no enviado": toca el aviso para ver el motivo y **Reenviar**.

## Panel de información del cliente (acciones rápidas)
Sección: inbox
Claves: informacion del cliente, etiquetar, notas internas, asignar chat, crear pedido desde el chat, completar pedido, ver pedidos del cliente, promociones, opt in
Toca el nombre del cliente (**Ver información del cliente**):
- **Etiqueta** de la conversación.
- **🛒 Ver pedidos de este cliente**.
- **🧾 Crear pedido para él/ella**: abre "Crear pedido desde el chat" y la IA lee la conversación para autocompletar nombre, celular, ciudad, dirección y productos. Revísalo antes de guardar.
- **✅ Completar pedido desde el chat**: lee el chat con IA y corrige/completa el pedido que ya existe. "Este cliente no tiene un pedido existente para completar": usa Crear pedido.
- Marca si el cliente **aceptó recibir promociones** (para saber a quién escribirle con ofertas sin generar reportes).
- **Asignar a…** un agente del equipo.
- **Notas internas**: solo las ve tu equipo.

## Enviar una plantilla o un mensaje inicial desde el chat
Sección: inbox
Claves: enviar plantilla, plantilla aprobada, reactivar cliente, mensaje inicial manual, flujos, rayo
En el chat toca **⚡ / Enviar mensaje inicial o plantilla**:
- **Mensaje inicial**: envía la presentación de un producto (elige el producto).
- **Plantillas aprobadas**: mensajes que llegan aun pasadas las 24 h. Salen las de DealFlow y también las que **creaste tú directo en Meta** (marcadas "· Meta").
- ¿Te aprobaron una plantilla en Meta y no aparece? Toca **↻ Actualizar desde Meta** (también se actualizan solas cada hora). Dice cuántas están aprobadas, en revisión o rechazadas.
- Si la plantilla tiene datos (variables {{1}}, foto/video/documento arriba o un botón con enlace), se abre un formulario para llenarlos antes de enviarla, con la vista previa.
Con el chat bloqueado por la ventana de 24 h solo funcionan las plantillas.

## Mensajes rápidos (/) y emojis en el chat
Sección: inbox
Claves: mensajes rapidos, respuestas rapidas, atajos, barra, slash, /, plantillas internas, textos guardados, emojis, emoticones, caritas
- En la caja del chat escribe **/** y salen tus mensajes rápidos; sigue escribiendo para buscar (ej. **/envio**) y toca uno o presiona **Enter** / **Tab** para pegarlo. **Esc** cierra la lista.
- Para crearlos: escribe **/** → **＋ Crear mensaje rápido** (o **⚙ Crear y editar mensajes rápidos**). Ponle un atajo y el texto; **{nombre}** se cambia por el nombre del cliente. Los usa todo el equipo.
- **😊** abre los emojis (en el celular usa los del teclado). **Shift+Enter** hace una nueva línea; **Enter** envía.
- Los mensajes rápidos son texto libre: solo se pueden enviar dentro de las 24 h. Fuera de la ventana usa una plantilla aprobada.

## Leads: en qué va cada cliente
Sección: leads
Claves: leads, etapas, embudo, prospectos, conversion, mover lead, perdido, no compro, datos completos
**Leads** muestra cada cliente por etapa (se mueven solas según el chat):
- **Preguntando**: escribió pero aún no muestra intención de compra.
- **Con intención de compra**: preguntó precio, talla, envío o dijo que lo quiere.
- **Faltan datos**: está dando sus datos de envío pero faltan algunos.
- **Datos completos**: ya tiene el resumen del pedido; falta que confirme.
- **Ventas**: ya tiene un pedido creado.
- **No compró**: lo marcaste como perdido (no cuenta en el embudo).
Arriba ves la **Conversión**. Busca por nombre, teléfono o mensaje y filtra por **Actividad** (Todo, Hoy, 7 o 30 días). Con **⇄ Mover** lo pasas a otra etapa (queda "✋ manual"); **↺ Automático** lo devuelve a moverse solo. Toca una tarjeta para ir al chat.

## Iniciar conversaciones con plantilla (clientes de otro bot o de una base propia)
Sección: inbox, crm
Claves: iniciar conversacion, escribir primero, nuevo chat, contactos migrados, otro bot, base de clientes, enviar plantilla masiva, mensaje saliente, crear contacto
WhatsApp solo deja escribirle primero a un cliente con una **plantilla aprobada**. En **Inbox** toca **＋ Iniciar conversación**:
1. Elige la plantilla aprobada y llena sus variables (escribe **{nombre}** para poner el nombre de cada cliente). Abajo ves cómo queda el mensaje.
2. Pega los clientes, uno por línea: celular y nombre (ej. "3001234567, Ana Ruiz"). También sirve pegar dos columnas copiadas de Excel; los repetidos se quitan solos. Celulares de 10 dígitos se toman como de Colombia (+57).
3. Deja marcado **Que el asistente atienda cuando respondan** si quieres que el bot siga la conversación.
4. **Enviar**: va por tandas, con pausas, para cuidar tu número. Al final ves cuáles salieron y cuáles no (con el motivo) y puedes **Abrir chat**.
No se envía a clientes bloqueados ni a quien pidió que no le escribieran. Escríbele solo a clientes que ya compraron o aceptaron que los contactes: si muchos bloquean o reportan, Meta baja la calidad del número. Meta cobra cada plantilla. Solo el dueño de la tienda puede usarlo. Si no tienes plantillas aprobadas, pide al equipo de DealFlow que publique una.
