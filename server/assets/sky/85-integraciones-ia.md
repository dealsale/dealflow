# Integraciones de IA (DeepSeek y OpenAI)

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

## SKY con la clave DeepSeek de la tienda
Sección: integraciones
Claves: sky, soporte, usar mi clave para sky, cobrar sky
En **Integraciones → DeepSeek → Configurar** (con tu clave guardada) está el interruptor **Usar mi clave de DeepSeek también para SKY**. Encendido: las preguntas que tu equipo le haga a SKY (este asistente de soporte) se cobran a tu cuenta de DeepSeek. Apagado: las paga DealFlow. SKY se oculta o se muestra desde el menú del perfil.
