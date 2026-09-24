# DealFlow · Guía completa para el Acceso Avanzado de Meta (App Review)

Todo lo que necesitas para pedirle a Meta el **Acceso Avanzado** de los 7 permisos, con textos listos para copiar y pegar y los guiones de video.

> **Idioma:** los textos están en español. Meta acepta español para apps de LATAM y así son coherentes con tu app, tu política de privacidad y el video (que también estarán en español). Si algún revisor te pide inglés, avísame y te los traduzco.

---

## PARTE 0 · URLs que vas a pegar (Configuración → Configuración básica)

| Campo en Meta | Valor a pegar |
|---|---|
| **Dominio de la app (App Domains)** | `dealflow.sbs` |
| **URL de la política de privacidad** | `https://dealflow.sbs/legal/privacidad.html` |
| **URL de las condiciones del servicio** | `https://dealflow.sbs/legal/terminos.html` |
| **Categoría** | Empresas y páginas / Mensajería (Business messaging) |
| **URL de eliminación de datos (callback)** | `https://dealflow.sbs/webhooks/meta/data-deletion` |
| **URL de instrucciones de eliminación de datos** | `https://dealflow.sbs/legal/eliminar-datos.html` |
| **Deauthorize Callback URL** (Facebook Login → Configuración) | `https://dealflow.sbs/webhooks/meta/deauthorize` |

> Ya construí y desplegué los 3 endpoints de eliminación/desautorización. El callback valida la firma con tu App Secret, borra los datos del usuario y responde a Meta como exige. La página de instrucciones ya existía.

---

## PARTE 1 · Verificación del negocio (Business Verification)

Se hace **una sola vez** y es la base para que aprueben los permisos. Ve a **Centro de empresas → Seguridad / Verificación del negocio**.

Documentos de DEALFLOW S.A.S. que te pedirán (ten a mano):
- **Certificado de Cámara de Comercio** (documento oficial con el nombre legal DEALFLOW S.A.S. y el NIT 902.087.359-4).
- **RUT** (opcional pero ayuda).
- Un **comprobante de dirección** del negocio (recibo de servicio público o extracto bancario a nombre de la empresa, si lo piden).
- Un **número de teléfono y correo del dominio** para recibir el código de verificación (usa `admin@dealflow.sbs`).

Datos que deben coincidir EXACTAMENTE con los documentos:
- Nombre legal: **DEALFLOW S.A.S.**
- NIT: **902.087.359-4**
- Sitio web: **https://dealflow.sbs**

---

## PARTE 2 · Justificaciones por permiso (copiar y pegar)

Para cada permiso, en App Review verás un campo tipo *"Cuéntanos cómo usa tu app este permiso"*. Pega el texto correspondiente. Incluyo también los **pasos para el revisor** (algunos permisos tienen un campo aparte de "instrucciones de prueba"; si no lo ves, agrégalos al final de la justificación).

### 1) `pages_show_list`

```
DealFlow es una plataforma de atención y ventas por mensajería para comercios.
Usamos pages_show_list para mostrarle al comercio la lista de las páginas de
Facebook que administra, de modo que pueda elegir cuál de ellas quiere conectar
a DealFlow para atender sus mensajes de Messenger. Sin este permiso, el comercio
no podría seleccionar su página y no podríamos vincular el canal correcto.
```
**Pasos para el revisor:** Inicia sesión en DealFlow → Integraciones → Messenger → botón "Conectar con Facebook" → tras autorizar, la app muestra la lista de páginas para elegir cuál conectar.

### 2) `pages_messaging`

```
Usamos pages_messaging para recibir los mensajes que los clientes le envían al
comercio por Messenger y para responderlos desde DealFlow. Los mensajes entrantes
llegan a la bandeja de entrada unificada del comercio, donde su asistente de
ventas (humano o el asistente automatizado que el comercio configura) responde a
las consultas de producto, precios y pedidos. Este permiso es el núcleo de la
integración con Messenger: sin él no podríamos leer ni contestar las
conversaciones de la página.
```
**Pasos para el revisor:** Con la página conectada, envía un mensaje a la página desde otra cuenta de Facebook → el mensaje aparece en la bandeja de DealFlow → el comercio responde desde DealFlow → la respuesta llega al remitente en Messenger.

### 3) `pages_manage_metadata`

```
Usamos pages_manage_metadata para suscribir la página del comercio a los webhooks
de Meta. Esa suscripción es lo que permite que DealFlow reciba en tiempo real los
eventos de mensajes nuevos de Messenger. Sin este permiso no llegarían los avisos
de mensajes entrantes y la bandeja de entrada no funcionaría en tiempo real.
```
**Pasos para el revisor:** Al conectar la página (paso del permiso pages_messaging), DealFlow suscribe automáticamente la página a los webhooks; los mensajes entrantes aparecen en tiempo real sin recargar.

### 4) `pages_read_engagement`

```
Usamos pages_read_engagement para leer la información básica de la página
conectada (nombre, foto e identidad de la página) y el contexto necesario para
mostrar correctamente cada conversación en la bandeja de entrada del comercio,
identificando con qué página está hablando cada cliente. Solo leemos la
información de las páginas que el comercio nos autoriza.
```
**Pasos para el revisor:** En la bandeja de DealFlow, cada conversación de Messenger muestra el nombre y la foto de la página conectada, junto al hilo del cliente.

### 5) `business_management`

```
Usamos business_management para acceder, con autorización del comercio, a los
activos de su Centro de empresas (páginas y cuentas publicitarias) que él elige
conectar a DealFlow. Esto nos permite vincular de forma segura la página y la
cuenta publicitaria correctas del negocio y mantener el acceso continuo mediante
un usuario del sistema, sin pedirle al comercio que vuelva a iniciar sesión.
```
**Pasos para el revisor:** En "Conectar", el comercio elige su Centro de empresas y autoriza los activos (página, cuenta publicitaria); DealFlow los vincula a la cuenta del comercio.

### 6) `ads_read`

```
DealFlow atribuye las conversaciones y ventas a los anuncios que las originaron.
Usamos ads_read para leer las campañas, conjuntos de anuncios y anuncios del
comercio, junto con sus estadísticas, y así mostrarle en su panel de estadísticas
qué anuncio generó cada chat y cuánto dinero en ventas produjo cada pauta. Es
información clave para que el comercio sepa qué anuncios le funcionan.
```
**Pasos para el revisor:** DealFlow → Estadísticas → sección "Ventas por anuncio": se listan los anuncios del comercio (miniatura, chats generados y ventas), leídos de su cuenta publicitaria.

### 7) `ads_management`

```
Usamos ads_management para leer el detalle de los anuncios necesarios para la
atribución (incluidos anuncios de "clic para enviar mensaje") y, cuando el
comercio lo solicita, para crear o editar campañas publicitarias directamente
desde DealFlow. Todas las acciones sobre anuncios las inicia y autoriza el propio
comercio, dueño de la cuenta publicitaria.
```
**Pasos para el revisor:** DealFlow → Anuncios → el comercio conecta su cuenta publicitaria y puede ver/crear campañas; los datos de cada anuncio alimentan la atribución en Estadísticas.

---

## PARTE 3 · Guion del video (screencast)

Meta pide un video mostrando **cada permiso en uso real**. Graba UN video de 2–4 minutos que recorra todo, hablando lo que haces. Súbelo a YouTube como **"no listado"** y pega el enlace, o súbelo directo si te deja.

> **Regla de oro:** el revisor tiene que VER el permiso funcionando, no solo la pantalla de login. Muestra el dato/acción concreta que cada permiso habilita.

**Antes de grabar:** ten listas dos cuentas de Facebook (una es el "cliente" que escribe) y una página de Facebook con una cuenta publicitaria, ambas con rol en la app (recuerda: en Acceso Estándar solo funciona con cuentas que tengan rol; por eso graba con tu propia cuenta de admin/tester).

**Escaleta:**

1. **Intro (10 s).** "Soy DealFlow, una plataforma para que los comercios atiendan sus ventas por Messenger, Instagram y WhatsApp desde una sola bandeja." Muestra el panel principal.

2. **Conexión (pages_show_list, business_management) (30 s).** Ve a Integraciones → Messenger → "Conectar con Facebook". Autoriza. **Muestra en pantalla la lista de páginas** que aparece (eso es `pages_show_list`) y la selección del Centro de empresas/activos (eso es `business_management`). Elige la página.

3. **Suscripción y contexto (pages_manage_metadata, pages_read_engagement) (20 s).** Ya conectada la página, muestra que en la bandeja aparece **el nombre y la foto de la página** (`pages_read_engagement`) y menciona que la página quedó suscrita para recibir mensajes en tiempo real (`pages_manage_metadata`).

4. **Mensajería real (pages_messaging) (40 s).** Desde la OTRA cuenta de Facebook, envíale un mensaje a la página (ej. "Hola, ¿tienen disponible el producto X?"). **Muestra cómo entra el mensaje en tiempo real** a la bandeja de DealFlow. Responde desde DealFlow y **muestra la respuesta llegando en Messenger** del cliente. (Este es el clip más importante.)

5. **Anuncios y atribución (ads_read, ads_management) (40 s).** Ve a Anuncios → conecta la cuenta publicitaria. Muestra que se listan las campañas/anuncios (`ads_read`/`ads_management`). Luego ve a **Estadísticas → Ventas por anuncio** y muestra la tabla con miniaturas de anuncios, chats y ventas por pauta (la atribución en acción).

6. **Cierre (10 s).** "Así DealFlow le permite al comercio atender sus mensajes de Meta y saber qué anuncios le generan ventas." Fin.

---

## PARTE 4 · Orden recomendado

1. **Pon las URLs** de la Parte 0 en Configuración básica y en Facebook Login → Configuración. Guarda.
2. **Verifica el negocio** (Parte 1). Sin esto no aprueban lo demás.
3. **Graba el video** (Parte 3).
4. **Envía App Review** con las justificaciones de la Parte 2, permiso por permiso, adjuntando el mismo video.
5. Espera la respuesta (días a ~2 semanas). Si rechazan, casi siempre es por el video: ajusta el clip del permiso señalado y reenvía.

---

*DEALFLOW S.A.S. · NIT 902.087.359-4 · https://dealflow.sbs*
