# WhatsApp, Messenger e Instagram

## Conectar WhatsApp: las tres formas
Sección: whatsapp
Claves: conectar whatsapp, vincular numero, api oficial, cloud api, qr, codigo qr, embedded signup, facebook, waba, phone number id, access token, numero nuevo
En **WhatsApp** eliges cómo conectar el número:
1. **Conexión automática (Conectar con Facebook)** · recomendada. Se abre la ventana de Facebook: inicias sesión con el Facebook del negocio, eliges (o creas) tu cuenta de WhatsApp Business, registras el número y confirmas el código que te llega. DealFlow hace el resto (sin crear apps ni tokens).
   - El número debe tener WhatsApp activo hoy o haberse dado de baja antes. Si el número está en la app de WhatsApp Business del celular, Meta te pedirá migrarlo o borrarlo de la app.
   - Si tienes un **bloqueador de anuncios** encendido, la ventana de Facebook no abre: apágalo para app.dealflow.sbs.
2. **Por código QR**: en el celular abre WhatsApp → **Dispositivos vinculados** → **Vincular un dispositivo** y escanea el código (**Generar código QR**). Es rápido pero menos estable y **no permite plantillas**, así que no puedes escribirle a un cliente pasadas 24 h. Úsalo solo para probar.
3. **Por API oficial (manual)**: pegas **WABA ID**, **Phone Number ID** y **Access Token (permanente)** de tu app en developers.facebook.com → WhatsApp, y das **Vincular número**. Luego en tu app de Meta → WhatsApp → Configuration pegas la **URL del webhook** y el **Token de verificación** que muestra DealFlow y te suscribes al campo **messages** (se hace una sola vez).
Cuando queda conectado, arriba dice **WhatsApp conectado**. Prueba escribiéndole a tu número desde otro teléfono: el chat aparece en **Inbox**. Para cambiar de número usa **Desvincular** y conecta el nuevo.

## Problemas al conectar WhatsApp
Sección: whatsapp
Claves: no conecta, error al conectar, no abre facebook, ventana facebook, no me deja conectar, codigo de verificacion, numero ya registrado, embedded, no pudimos completar la conexion con meta
- **La ventana de Facebook no abre o se cierra sola**: desactiva el bloqueador de anuncios y permite ventanas emergentes para app.dealflow.sbs; prueba en Chrome.
- **"No pudimos completar la conexión con Meta"**: el proceso en Facebook no terminó (se cerró la ventana, no se eligió número o Meta rechazó el registro). Vuelve a **Conectar con Facebook** y termina todos los pasos. Si Facebook entra con la cuenta equivocada, cierra sesión en facebook.com o usa una ventana de incógnito.
- **"Meta no devolvió los datos del número"**: repite la conexión; si persiste, revisa en business.facebook.com → Cuentas de WhatsApp que el número quedó agregado y verificado.
- **No llega el código de verificación**: elige recibirlo por llamada; el número debe poder recibir SMS/llamadas y no estar activo en otra cuenta de WhatsApp Business API.
- **"Faltan datos: WABA ID, Phone Number ID y Access Token"** (manual): llena los tres. Si dice que no pudo validar con Meta, revisa que el token sea **permanente** (usuario del sistema) y tenga permisos whatsapp_business_messaging y whatsapp_business_management.
- **"La conexión automática no está configurada en el servidor"** o **"Falta configurar META_APP_ID / META_APP_SECRET"**: es configuración de DealFlow; escribe a soporte.
- **QR: "No pudimos generar el código"**: toca **Reintentar**. "La conexión de WhatsApp se está estabilizando": espera unos segundos tras escanear.

## Estado del número, calidad y enlaces a Meta
Sección: whatsapp
Claves: estado del numero, calidad, verificacion, limite de mensajes, nombre que ven, revisar ahora, numero restringido, calidad baja, calidad media, metodo de pago meta
En **WhatsApp** (conexión oficial) aparece **Estado del número** con **Revisar ahora**:
- **Verificación** (si el negocio está verificado), **Calidad** (alta, media o baja según bloqueos y reportes de los últimos 7 días), **Puedes escribirle a** (cuántos clientes nuevos al día te deja iniciar Meta) y **Nombre que ven** (nombre visible aprobado).
- Si todo está bien: "Tu número está verificado, con buena calidad y sin restricciones de Meta".
- **Enlaces rápidos a Meta**: Meta te cobra a ti directamente la mensajería (plantillas y conversaciones que no inició el cliente), así que el **método de pago va en tu propia cuenta** de WhatsApp Business; desde ahí llegas a la configuración de pago con un clic.

## Protección de la calidad del número (anti-baneo)
Sección: whatsapp, resumen
Claves: baneo, ban, bloqueo de numero, spam, reportes, calidad bajo, proteger numero, mensajes no solicitados, anti baneo, rafaga
DealFlow cuida tu número automáticamente (tarjeta **🛡️ Protección de la calidad del número** en WhatsApp):
- Máximo de **mensajes no solicitados por cliente al día** (recordatorios, cambios de estado y avisos cuentan; las respuestas a lo que el cliente pregunta no).
- **Sin ráfagas en el mensaje inicial**: se envía pieza por pieza con pausas de persona y los textos seguidos van en un solo mensaje.
- Interruptor **Escribirle al celular de contacto cuando es otro número**: si el cliente deja otro celular para la entrega, se le manda la guía con plantilla a ese número. Ese número nunca le escribió a la tienda y es lo que más reportes de spam genera: **recomendado apagado**.
- Si un cliente pide que no le escriban más, DealFlow se despide una vez y no le vuelve a escribir por su cuenta.
**Si tu calidad bajó, así la recuperas**: deja apagado el seguimiento automático (Asistente) hasta que vuelva a "Alta"; no mandes plantillas de promoción a quien no las pidió ni difusiones masivas por unos días; deja el mensaje inicial corto (un saludo, 2 o 3 fotos y una pregunta); responde rápido. La calidad se recalcula con los últimos 7 días: si nadie bloquea ni reporta, sube sola.
Buenas prácticas: no escribas primero a quien no te contactó, fuera de 24 h usa solo plantillas aprobadas y pide permiso antes de mandar promociones.

## Apps conectadas a tu número (otra plataforma sigue respondiendo)
Sección: whatsapp
Claves: otra plataforma, doble respuesta, responde otro bot, apps conectadas, integraciones empresariales, lucidbot, chatbot anterior, mensajes duplicados
En **WhatsApp → 🔌 Apps conectadas a tu número** DealFlow le pregunta a Meta qué apps reciben los mensajes de tu WhatsApp. Si aparece una plataforma que ya no usas, puede ser la que sigue contestando:
1. En Meta Business Suite → **Configuración del negocio → Integraciones → Integraciones empresariales**, elimina esa app.
2. En **Cuentas → Apps**, quítala también.
3. Si sigue apareciendo, escríbele al soporte de esa plataforma para que desconecte tu número.
Si solo aparece DealFlow pero otra plataforma aún envía mensajes, puede tener un token guardado (revisa Integraciones empresariales) o, si usaba código QR, cierra los **dispositivos vinculados** en el WhatsApp del celular.
Errores: "Conecta WhatsApp por la conexión oficial para ver las apps conectadas" (no funciona con QR); "No tenemos el id de tu cuenta de WhatsApp Business (WABA). Reconecta WhatsApp".

## La ventana de 24 horas y las plantillas
Sección: whatsapp, inbox
Claves: 24 horas, ventana, no puedo escribir, chat bloqueado, plantilla, plantilla aprobada, candado, 131047, mensaje no enviado fuera de ventana, re-engagement
Regla de WhatsApp (no de DealFlow): pasadas **24 horas desde el último mensaje del cliente** solo se le puede enviar una **plantilla aprobada** por Meta. Dentro de las 24 h se escribe libre.
- En el Inbox sale **🔒 No puedes escribir en este chat** y el botón **⚡ Enviar plantilla**. Cuando el cliente responda, se desbloquea.
- Las plantillas solo funcionan con la **conexión oficial** (no con QR): "Las plantillas de Meta solo se envían por la conexión oficial de WhatsApp (no por QR)".
- DealFlow crea y manda a verificación las plantillas que usa sola: **confirmacion_pedido** y **confirmacion_pedido_tienda** (confirmar pedido Sí/No), **guia_envio_pedido** (enviar la guía), **novedad_envio_pedido** (avisar una novedad) y **confirmar_contacto_pedido** (avisar al celular de contacto cuando es otro número). Meta tarda de minutos a 24 h en aprobarlas.
- "Esa plantilla no está aprobada para tu tienda todavía": espera la aprobación de Meta. Si fue rechazada, escribe a soporte para revisarla.
- Las plantillas cuestan (Meta las cobra a tu cuenta). Si el método de pago falla, no salen (error 131042).

## Bloquear y desbloquear un contacto
Sección: inbox
Claves: bloquear, desbloquear, spam, cliente molesto, no escribirle, bloquear numero
En el chat (Inbox) usa **Bloquear contacto**: DealFlow no le enviará NADA más (bot, recordatorios, plantillas ni guías) y además le pide a Meta que tu número lo bloquee, así no le llega nada desde tu número aunque haya otra plataforma conectada. Para revertir: **Desbloquear contacto**. "Este chat no tiene un número de WhatsApp para bloquear": es un chat de Messenger/Instagram/web.

## Messenger e Instagram en el mismo Inbox
Sección: integraciones, inbox
Claves: messenger, instagram, facebook, dm, mensajes directos, pagina de facebook, no llegan mensajes de instagram, suscribir pagina
1. En **Integraciones → Messenger e Instagram** dale **Conectar con Facebook** y autoriza tus páginas (y la cuenta de Instagram vinculada a la página).
2. Los mensajes directos llegan al **Inbox** y el asistente responde igual que en WhatsApp.
Si no llegan mensajes: abre el diagnóstico de la tarjeta. "Suscrita, pero faltan los avisos" → **Suscribir de nuevo**. "El acceso de la página venció" → reconecta. Si las páginas están bien suscritas pero Meta no manda nada: mientras el permiso **pages_messaging** no tenga acceso avanzado en la app de Meta, Meta solo entrega mensajes de personas con rol en la app (es un tema de revisión de la app de DealFlow; avisa a soporte).
Para Instagram: la cuenta debe ser profesional, estar vinculada a la página de Facebook y en Instagram → Configuración → Mensajes debe estar permitido el acceso a mensajes de herramientas conectadas.
