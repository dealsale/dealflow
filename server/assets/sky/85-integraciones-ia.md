# Integraciones de IA (DeepSeek, Claude y OpenAI)

## Claves de IA propias: DeepSeek y OpenAI
Sección: integraciones
Claves: deepseek, openai, api key ia, clave ia, agente predeterminado, notas de voz, imagenes, transcribir audio, saldo deepseek, ia propia, grok
En **Integraciones → Inteligencia artificial** cada tienda puede poner sus propias llaves y pagar solo lo que consume:
- **DeepSeek**: escribe las respuestas del asistente (la más económica). Clave sk-… de platform.deepseek.com.
- **OpenAI**: le da oído y vista al asistente: transcribe las notas de voz y entiende las imágenes que mandan los clientes. Conéctala junto con DeepSeek.
- Con **Usar como agente predeterminado** (o **Hacer agente**) eliges cuál responde los chats (sale 🤖 Agente). **Desconectar** quita la clave y vuelve a la IA de DealFlow.
- Las claves nunca se muestran completas (solo los últimos 4 caracteres).
- Si no pones claves, el asistente usa la IA de DealFlow.
Problemas: si en el registro sale "La IA (deepseek) falló (HTTP 401)" la clave está mal; **HTTP 402** = sin saldo en DeepSeek (recarga en platform.deepseek.com); **HTTP 429** = demasiadas peticiones o límite de la cuenta. Mientras tanto el chat pasa al equipo. Sin OpenAI, el asistente le pide al cliente que escriba en texto cuando manda audios o imágenes.

## Claude (Anthropic) como IA del asistente: clave, modelo y costo
Sección: integraciones
Claves: claude, anthropic, haiku, sonnet, opus, modelo claude, cambiar modelo, modelo mas potente, sk-ant, api key claude, cache, caché, cuanto cuesta claude, saldo claude, claude no responde
En **Integraciones → Inteligencia artificial → Claude (Anthropic)** la tienda conecta su propia cuenta de Claude:
1. Crea la clave en la consola de Anthropic (platform.claude.com → API keys; empieza por sk-ant-) y recarga saldo allí (Billing). Se paga por uso, sin mensualidad.
2. Pégala en **API Key de Claude**, elige el **Modelo** y dale **Guardar**. DealFlow comprueba la clave antes de guardarla: si sale "La API key de Claude no es válida o fue revocada", cópiala de nuevo completa.
3. Deja marcado **Usar como agente predeterminado** (o dale **Hacer agente**) para que Claude responda los chats (sale 🤖 Agente). Si la tienda también tiene DeepSeek, responde el que tenga 🤖 Agente.
Modelos (se cambia cuando quieras: eliges otro y **Guardar**, sin volver a pegar la clave):
- **Claude Haiku 5.5** (recomendado, viene por defecto): el más rápido y económico; cuesta parecido o menos que DeepSeek.
- **Claude Sonnet 5.5**: más potente, para catálogos grandes o reglas de venta complejas; cuesta unas 10 veces más por chat.
- **Claude Opus 5.5**: el más potente; unas 20 veces más por chat que el recomendado.
Qué cambia con Claude:
- **Pedidos, fotos y pase a una persona** se registran con datos ordenados (menos pedidos mal leídos). Las validaciones son las mismas: celular que el cliente escribió, tallas y colores que existen, total del catálogo y pedidos repetidos.
- **Ve las fotos** que manda el cliente (comprobantes, capturas, prendas) sin necesitar OpenAI. Para las **notas de voz** sí sigue haciendo falta OpenAI.
- **Caché**: tus instrucciones y tu catálogo se guardan 5 minutos en Anthropic y, mientras haya chats seguidos, esa parte se cobra a cerca de la décima parte. No hay que activar nada.
Problemas (salen en el registro y el chat pasa al equipo): "no es válida o fue revocada" = clave mal copiada o borrada; "no tiene saldo" = recarga en Billing; "límite de uso" = la cuenta de Anthropic es nueva y tiene un tope bajo, se sube en la consola; "no tiene permiso para usar este modelo" = elige otro modelo.

## SKY con la clave DeepSeek de la tienda
Sección: integraciones
Claves: sky, soporte, usar mi clave para sky, cobrar sky
En **Integraciones → DeepSeek → Configurar** (con tu clave guardada) está el interruptor **Usar mi clave de DeepSeek también para SKY**. Encendido: las preguntas que tu equipo le haga a SKY (este asistente de soporte) se cobran a tu cuenta de DeepSeek. Apagado: las paga DealFlow. SKY se oculta o se muestra desde el menú del perfil.
