# Catálogo de errores y mensajes (qué significan y cómo resolverlos)

## Errores de entrega de WhatsApp (códigos de Meta)
Sección: inbox, whatsapp
Claves: codigo, error meta, no se entrego, no enviado, mensaje fallido, 131047, 131026, 131049, 131050, 131056, 131048, 130429, 130472, 131031, 131042, 131051, 131052, 131053, 131021, 131000, 131005, 131008, 131009, 132000, 132001, 132015, 132016, 368, 100, 190, 470
Cuando un mensaje dice "no enviado", el motivo aparece con su código:
- **131047 / 470**: pasaron más de 24 h desde el último mensaje del cliente; solo se le pueden enviar plantillas aprobadas (⚡ Enviar plantilla).
- **131026**: WhatsApp no pudo entregarlo: el cliente bloqueó tu número, no tiene WhatsApp activo, usa una versión muy vieja o no aceptó los términos nuevos. Llámalo o escríbele por otro medio.
- **131049**: Meta frenó el mensaje para cuidar la experiencia del cliente (recibió demasiados mensajes de empresas). Intenta más tarde; no reenvíes en bucle.
- **131050**: el cliente pidió no recibir mensajes de marketing de tu número.
- **131056**: demasiados mensajes seguidos al mismo cliente; espera un momento.
- **131048**: Meta limitó tu número porque varios mensajes fueron marcados como spam; baja el ritmo (ver protección de la calidad del número).
- **130429**: se superó el límite de velocidad de envío; espera unos minutos.
- **130472**: el cliente está en un experimento de Meta que limita mensajes de marketing.
- **131031**: la cuenta de WhatsApp Business está bloqueada o restringida por Meta; revisa business.facebook.com → Calidad de la cuenta y apela si aplica.
- **131042**: Meta no pudo cobrar el mensaje: problema con el método de pago de tu cuenta de WhatsApp Business (business.facebook.com → Cuentas de WhatsApp → Configuración de pago). Las respuestas gratis dentro de 24 h sí salen; las plantillas no.
- **131051**: tipo de mensaje no soportado. **131052**: no se pudo descargar el archivo que envió el cliente. **131053**: el archivo no se pudo subir (formato o tamaño no válido; prueba JPG/PNG, MP4 pequeño o PDF).
- **131021**: el número de destino es el mismo número de la tienda.
- **131000**: error interno de WhatsApp; reintenta en unos minutos. **131005**: permisos insuficientes del token (reconecta WhatsApp). **131008 / 131009 / 100**: un dato del mensaje o el número no es válido.
- **132000**: la plantilla no coincide con sus variables. **132001**: la plantilla no existe o no está aprobada en ese idioma. **132015 / 132016**: la plantilla está pausada o desactivada por baja calidad (avisa a soporte para rehacerla).
- **368**: tu número está restringido temporalmente por incumplir políticas de WhatsApp; espera el tiempo de la restricción y baja los mensajes no solicitados.
- **190**: el token de WhatsApp venció o no es válido: reconecta WhatsApp en la sección WhatsApp.
- "WhatsApp no está conectado": reconecta el número. "Bloqueado por ventana de 24 h: no se envió texto libre": usa una plantilla. "Ese número no tiene WhatsApp o no está disponible" (conexión QR).

## Errores de cuenta, sesión y permisos
Sección: general, cuenta
Claves: inicia sesion para continuar, sesion vencio, cuenta no existe, cuenta desactivada, solo el dueño, solo el equipo dealflow, no tiene tienda asignada, no puedo entrar
- "Inicia sesión para continuar" / "Tu sesión venció. Vuelve a iniciar sesión": entra de nuevo.
- "Tu cuenta ya no existe": el usuario fue eliminado; pide al dueño que te agregue de nuevo en Equipo.
- "Tu cuenta está desactivada. Escríbenos para reactivarla": escribe a soporte de DealFlow (suele ser por pago).
- "Solo el dueño de la tienda puede hacer esto": esa acción (integraciones, conexiones, equipo) la hace el dueño; los agentes no.
- "Tu usuario no tiene tienda asignada": pide al dueño o a soporte que te asignen a la tienda.
- "Solo el equipo DealFlow puede entrar aquí": es una sección de administración interna.
- "Escribe tu nombre" / "El nombre es muy largo" (perfil); "Sube una imagen válida" / "No pudimos guardar la foto" (foto de perfil).

## Errores al subir archivos
Sección: productos, inbox, general
Claves: no sube la foto, archivo no valido, pesa mucho, subir imagen, subir video, no recibimos el archivo, formato
- "No recibimos el archivo" / "El archivo no es válido": vuelve a seleccionarlo; usa JPG, PNG o WEBP para fotos, MP4 para videos y MP3/OGG para audios.
- Tienda en línea: "Sube una imagen JPG, PNG, WEBP o GIF" y "La imagen pesa más de 10 MB" (comprímela, por ejemplo con tinypng.com).
- Guía del pedido: máximo 15 MB, PDF o PNG/JPG.
- WhatsApp rechaza videos muy pesados (más de 16 MB) e imágenes de más de 5 MB.

## Errores del asistente y de la IA
Sección: asistente
Claves: ia fallo, error ia, http 401, http 402, sin saldo, la ia no respondio, respuesta vacia, error inesperado
- "El asistente NO respondió: no hay IA configurada": falta la clave de IA; escribe a soporte o pon tu clave de DeepSeek en Integraciones.
- "La IA (deepseek/openai) falló (HTTP 401)": clave inválida → corrígela en Integraciones. **HTTP 402**: sin saldo → recarga en la plataforma de la IA. **HTTP 429**: límite de uso → espera o sube tu límite. **HTTP 5xx**: la IA está caída; se reintenta.
- "La IA respondió vacío" / "Error inesperado generando la respuesta del asistente": falla puntual; el chat pasó al equipo. Responde tú y devuélvelo al asistente.
- "El asistente pasó este chat a una persona del equipo": se activó el pase a humano (el cliente pidió asesor, hubo queja o algo que no sabía). Atiéndelo y **Devolver al asistente**.
- "Chat pasado al equipo automáticamente: …": DealFlow lo pasó porque el asistente no pudo responder (el motivo va en el mensaje).
- "La configuración del asistente es demasiado larga": resume Tu negocio o las preguntas frecuentes.
- Dirección 🌐: "La IA no devolvió una dirección" / "La IA no respondió" (reintenta) y "La IA agregó números que no estaban; no se usa" (se descarta para no cambiar la dirección).

## Errores de pedidos y despacho (generales)
Sección: pedidos
Claves: pedido no encontrado, no se pudo crear el pedido, no se pudo guardar, conecta effi para despachar, despachar error, pedido ocupado
- "Conecta Effi por API en Integraciones para despachar" / "Conecta Effi, Dropi en Integraciones para despachar este pedido con un toque".
- "Este pedido está ocupado. Puedes seguir usando el resto de DealFlow": hay una acción en curso (creando remisión, guía, etc.); espera a que termine.
- "No se pudo crear el pedido" / "No se pudo guardar el pedido": revisa nombre y productos, y que tengas conexión.
- "Elige una variante del producto" / "Producto del pedido no encontrado" (corrección de variante).
- "Escribe el número del pedido (ej. 1049)" / "No existe el pedido DF-…" (unir novedad).
- "Elige una solución" (novedad sin opción elegida).
- Para errores de Effi y Dropi mira sus artículos específicos.

## Errores del Inbox y mensajes
Sección: inbox
Claves: escribe el mensaje primero, mensaje no encontrado, no se puede reenviar, plantilla no aprobada, lead no encontrado, estado no valido
- "Escribe el mensaje primero".
- "Mensaje no encontrado" / "Solo se pueden reenviar los mensajes que envías tú" / "No encontramos el archivo del mensaje para reenviarlo" (vuelve a adjuntarlo).
- "Esa plantilla no está aprobada para tu tienda todavía": espera la aprobación de Meta.
- "Lead no encontrado" / "Estado no válido": recarga la página (el chat pudo eliminarse).
- "Chat no encontrado" / "Producto no encontrado en esta tienda" (mensaje inicial manual).

## Errores de SKY (este asistente de soporte)
Sección: general
Claves: sky no responde, vas muy rapido, asistente no disponible
- "Vas muy rápido. Espera un momento y vuelve a preguntar": máximo 20 preguntas por minuto.
- "SKY no pudo responder ahora" / "SKY tardó demasiado": intenta de nuevo en un momento; si usas tu clave de DeepSeek para SKY, revisa su saldo.
- "El asistente todavía no está disponible": el equipo de DealFlow aún no lo activa.

## Errores del servidor y de conexión
Sección: general
Claves: error del servidor, ocurrio un error, no carga, pantalla en blanco, lento, sin conexion, intenta de nuevo, no pudimos conectar
- "Ocurrió un error en el servidor. Intenta de nuevo": falla puntual; recarga la página (Ctrl + F5). Si se repite, avisa a soporte con la hora y la acción que hacías.
- "No pudimos hablar con Meta / con Effi / con Dropi / con Shopify": el servicio externo no respondió; casi siempre se arregla reintentando en unos minutos.
- Pantalla en blanco o el panel no carga: recarga, borra la caché del navegador o prueba en incógnito; revisa tu internet.
- Si la app instalada se ve vieja después de una actualización, ciérrala y ábrela de nuevo.
