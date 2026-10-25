# Revisión de Meta · Messenger (envío de octubre 2026)

Guía para la solicitud que tienes **"No enviada"** en *Revisión de la app → Solicitudes*. Todo está escrito según lo que DealFlow hace HOY, porque Meta rechaza cuando el texto o el video no coinciden con la app.

---

## 1. Antes de enviar: limpia la solicitud

En "Nuevas solicitudes" tienes 6 permisos. **Envía solo 4.** Cada permiso de más es otro motivo para que rechacen todo el paquete.

| Permiso | ¿Enviar? | Por qué |
|---|---|---|
| `pages_messaging` | ✅ Sí | Es el que hace llegar los mensajes de Messenger al Inbox. El importante. |
| `pages_show_list` | ✅ Sí | Lista las páginas para elegir cuál conectar. |
| `pages_manage_metadata` | ✅ Sí | Suscribe la página a los webhooks (sin esto no llega nada). |
| `pages_read_engagement` | ✅ Sí | Lee el nombre y los datos de la página conectada. |
| `pages_utility_messaging` | ❌ Quítalo (🗑) | Es para plantillas de utilidad en Messenger. DealFlow no lo usa. |
| `business_management` | ❌ Quítalo (🗑) | Ya te lo rechazaron una vez y DealFlow no lo necesita para Messenger. Si se vuelve a pedir, se pide aparte. |

"Acceso existente para revisar" (`whatsapp_business_messaging`, `whatsapp_business_management`, `public_profile`, `email`) es una **renovación** de lo que ya tienes aprobado. No hay que hacer nada nuevo; si te pide confirmar el uso, es el mismo de antes.

> Si te deja eliminar los dos permisos solo desde el caso de uso: *Casos de uso → Messenger from Meta → Permisos y funciones* → en cada uno, Acciones → **Quitar**.

---

## 2. Antes de grabar: comprueba que funciona

Meta tiene que VER el mensaje llegando y la respuesta saliendo. Revisa esto antes de grabar:

1. En DealFlow → **Integraciones → Messenger e Instagram** → la página aparece conectada.
2. Botón **"¿No llegan los mensajes? Revisar conexión"** → la página sale con ✅ *"DealFlow está suscrito a los mensajes de esta página"*.
3. Desde **otra cuenta de Facebook que tenga rol en la app** (agrégala como *Evaluador* en *Roles de la app → Roles*), escríbele a la página. El mensaje debe aparecer en el **Inbox** de DealFlow.
4. Respóndele desde DealFlow y confirma que la respuesta llega a Messenger.

Si el paso 3 no funciona, **no envíes todavía**: avísame y lo revisamos.

**Cuenta para el revisor.** Crea en DealFlow una cuenta solo para Meta (por ejemplo `revision-meta@dealflow.sbs`) con plan activo y la página de prueba conectada. Las credenciales van en las instrucciones de cada permiso. No uses tu cuenta personal.

---

## 3. Textos para cada permiso (copiar y pegar)

### `pages_messaging`

**¿Cómo usará la app este permiso?**
```
DealFlow es una plataforma de atención y ventas para comercios. Usamos
pages_messaging para recibir en la bandeja de entrada de DealFlow los mensajes
que los clientes le envían a la página del comercio por Messenger y para que el
comercio (o el asistente automático que él mismo configura) les responda desde
ahí. Respondemos solo a conversaciones que inicia el cliente y dentro de la
ventana de mensajería permitida; no enviamos mensajes promocionales no
solicitados. Sin este permiso el comercio no podría atender sus conversaciones
de Messenger desde DealFlow.
```
**Instrucciones para el revisor:**
```
1. Entra a https://app.dealflow.sbs con el usuario revision-meta@dealflow.sbs
   y la contraseña [CONTRASEÑA].
2. Ve a Integraciones → "Messenger e Instagram": la página [NOMBRE DE LA PÁGINA]
   ya está conectada.
3. Desde una cuenta de Facebook, envía un mensaje a la página
   https://facebook.com/[PAGINA].
4. En DealFlow abre "Inbox": el mensaje aparece en la conversación.
5. Escribe una respuesta y envíala: llega al remitente en Messenger.
```

### `pages_show_list`

```
Usamos pages_show_list para mostrarle al comercio, después de iniciar sesión
con Facebook, la lista de páginas que administra, de modo que pueda elegir qué
página conectar a DealFlow para atender sus mensajes de Messenger. Solo leemos
la lista para esa selección.
```
**Instrucciones para el revisor:**
```
Integraciones → "Messenger e Instagram" → "Conectar con Facebook" → después de
autorizar, Facebook muestra las páginas del usuario para elegir cuál conectar,
y DealFlow muestra la página conectada en esa misma tarjeta.
```

### `pages_manage_metadata`

```
Usamos pages_manage_metadata únicamente para suscribir la página conectada a los
webhooks de mensajes de nuestra app (messages, messaging_postbacks y
messaging_referrals). Esa suscripción es la que permite que los mensajes nuevos
lleguen en tiempo real a la bandeja de DealFlow. No modificamos ninguna otra
configuración de la página.
```
**Instrucciones para el revisor:**
```
Al conectar la página, DealFlow la suscribe automáticamente. En Integraciones →
"Messenger e Instagram" → "Revisar conexión" se ve el estado: "DealFlow está
suscrito a los mensajes de esta página".
```

### `pages_read_engagement`

```
Usamos pages_read_engagement para leer la información básica de la página que
el comercio conecta (nombre e identificador) y obtener su token de acceso, con
el fin de mostrarle en DealFlow qué página está conectada, asociar cada
conversación de Messenger a esa página y responder desde ella. No leemos ni
publicamos contenido de la página.
```
**Instrucciones para el revisor:**
```
Integraciones → "Messenger e Instagram": la tarjeta muestra el nombre de la
página conectada. En "Revisar conexión" se ve cada página con su estado.
```

---

## 4. Guion del video (uno solo, 2–3 minutos)

Grábalo en computador, en pantalla completa y con buena resolución. Puede ser sin voz, con subtítulos o con texto en pantalla. Súbelo como **no listado** en YouTube, o directo a Meta, y usa **el mismo video para los 4 permisos**.

| Tiempo | Qué mostrar | Qué decir o poner en pantalla | Permiso |
|---|---|---|---|
| 0:00–0:10 | Login en app.dealflow.sbs | "DealFlow: los comercios atienden sus mensajes de Messenger desde una sola bandeja." | — |
| 0:10–0:45 | Integraciones → Messenger e Instagram → **Conectar con Facebook** → la ventana de Facebook → elegir la página → aceptar | "El comercio conecta su página. Facebook le muestra sus páginas y elige cuál conectar." | `pages_show_list`, `pages_read_engagement` |
| 0:45–1:05 | La tarjeta con la página conectada → **Revisar conexión** → "✅ suscrito" | "DealFlow suscribe la página para recibir los mensajes en tiempo real." | `pages_manage_metadata` |
| 1:05–1:40 | En otra ventana, desde la otra cuenta: escribirle a la página en Messenger ("Hola, ¿tienen disponible…?") → volver a DealFlow → **Inbox** → aparece el mensaje | "Un cliente escribe a la página y el mensaje llega al Inbox." | `pages_messaging` |
| 1:40–2:15 | Responder desde DealFlow → volver a Messenger del cliente → se ve la respuesta | "El comercio responde desde DealFlow y el cliente la recibe en Messenger." | `pages_messaging` |
| 2:15–2:30 | Volver al Inbox | "Así el comercio atiende Messenger desde DealFlow." | — |

**Errores que causan rechazo:**
- que no se vea la ventana de inicio de sesión de Facebook con el permiso;
- que el mensaje llegue "por arte de magia": hay que mostrar las dos ventanas (cliente y DealFlow);
- que el video muestre funciones que no corresponden a los permisos pedidos.

---

## 5. Preguntas de "Tratamiento de datos" (si las pide)

- **¿Comparten datos con terceros?** No. Los mensajes se guardan en la cuenta del comercio dentro de DealFlow y se usan solo para atender la conversación.
- **¿Para qué usan los datos?** Para mostrar las conversaciones del comercio y responderlas.
- **Eliminación de datos:** URL `https://dealflow.sbs/webhooks/meta/data-deletion` e instrucciones en `https://dealflow.sbs/legal/eliminar-datos.html` (ya configuradas).
- **Responsable:** DEALFLOW S.A.S. · NIT 902.087.359-4.

---

## 6. Orden

1. Quita `pages_utility_messaging` y `business_management` de la solicitud.
2. Comprueba el paso 2 (un mensaje real llega y se responde).
3. Crea la cuenta de revisión en DealFlow y pon sus datos en las instrucciones.
4. Graba y sube el video.
5. Pega los textos de la sección 3 y el video en cada permiso → **Siguiente** → envía.
6. Meta suele responder en días. Si rechaza, mándame el comentario y ajustamos el texto o el video del permiso que señale.
