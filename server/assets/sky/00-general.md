# Base de conocimiento de SKY: general, cuenta y panel
<!-- Cada artículo empieza con "## ". "Sección:" y "Claves:" ayudan al buscador de SKY. -->

## Qué es DealFlow y cómo funciona
Sección: resumen, general
Claves: que es dealflow, para que sirve, como funciona, bot, asistente ia, vender por whatsapp
DealFlow (app.dealflow.sbs) es un panel donde un asistente con inteligencia artificial atiende el WhatsApp de la tienda (también Messenger, Instagram y el chat web), responde con el catálogo, cierra la venta y deja el pedido listo para despachar con Effi, Dropi o Shopify. Está pensado para ventas contra entrega en Colombia.
Flujo normal:
1. El cliente escribe a tu WhatsApp (muchas veces desde un anuncio de Meta).
2. El asistente responde con tus productos, fotos, combos y reglas, y le pide los datos de envío.
3. Cuando tiene todo, crea el pedido en **Pedidos** y le manda al cliente el resumen.
4. Tú (o la automatización) despachas con Effi o Dropi; la guía le llega al cliente por WhatsApp y el estado se actualiza solo.
Para que funcione necesitas: WhatsApp conectado (sección **WhatsApp**), al menos un producto (sección **Productos**) y el asistente configurado (sección **Asistente**). La IA ya viene incluida con la clave de DealFlow; opcionalmente cada tienda pone su propia clave de DeepSeek/OpenAI en **Integraciones**.

## El menú del panel (qué hay en cada sección)
Sección: general
Claves: menu, secciones, donde esta, navegar, barra lateral, menu lateral
- **Resumen**: ventas del mes, pedidos nuevos por confirmar, ventas de hoy, leads activos, productos, pedidos recientes y el monitor anti-baneo de WhatsApp.
- **Estadísticas**: análisis de ventas, conversión por anuncio, gasto en Meta, ROAS, ciudades, productos más vendidos, recaudos de Effi.
- **Productos**: catálogo que usa la IA (precio, variantes, combos, mensaje inicial, reglas, preguntas frecuentes, fotos y videos).
- **Tienda en línea**: páginas de venta (landings) por producto y tu tienda web con dirección propia.
- **Asistente**: personalidad, información del negocio, cómo vende, reglas y pase a humano; chat de prueba.
- **WhatsApp**: conectar el número, estado y calidad del número, enlaces a Meta.
- **Logística Effi**: tablero de todas tus guías de Effi por etapa.
- **Pedidos**: lista y detalle de pedidos, despacho, guías, novedades.
- **Leads**: en qué etapa va cada cliente (preguntando, con intención, faltan datos, datos completos, ventas, no compró).
- **Inbox**: los chats en vivo; puedes intervenir, enviar plantillas, crear pedidos desde el chat.
- **Biblioteca**: productos ya armados para importar (gratis o de pago).
- **DealShop**: plantillas para configurar el asistente con un clic.
- **Equipo**: agentes que entran con su propio usuario.
- **Integraciones**: IA (DeepSeek, OpenAI), canales (Messenger/Instagram, WhatsApp), envíos (Effi, Dropi, Shopify) y publicidad (Meta Ads, API de Conversiones).
- **Tutoriales**: guías interactivas paso a paso.
Ctrl + clic en cualquier sección o producto lo abre en otra pestaña. El botón ☰ de arriba oculta o muestra el menú lateral. En el menú del perfil puedes activar un **menú flotante**.

## Crear cuenta, iniciar sesión y recuperar la contraseña
Sección: general, cuenta
Claves: registrarme, crear cuenta, login, iniciar sesion, olvide contraseña, recuperar cuenta, restablecer, no puedo entrar, contraseña incorrecta
- **Crear cuenta**: en la pantalla de entrada elige **Crear cuenta**, escribe tu nombre, el nombre de tu tienda, correo y una contraseña de mínimo 8 caracteres.
- **Olvidé mi contraseña**: toca **¿Olvidaste tu contraseña?**, escribe tu correo y dale **Enviarme el enlace**. Llega un correo (revisa spam) con un enlace que vence en **1 hora**; ahí eliges la contraseña nueva. Si sale "El envío de correos aún no está activo", escríbele a soporte de DealFlow por WhatsApp para recuperarla.
- "El enlace no es válido o ya se usó" / "El enlace venció": pide uno nuevo desde **¿Olvidaste tu contraseña?**.
- "Tu sesión venció. Vuelve a iniciar sesión": entra de nuevo; las sesiones se cierran por seguridad después de un tiempo.
- "Tu cuenta está desactivada. Escríbenos para reactivarla": la desactivó el equipo de DealFlow (por ejemplo por falta de pago); escribe a soporte.
- "Ya existe una cuenta con ese correo": usa **Iniciar sesión** o recupera la contraseña.
- Cambiar la contraseña estando dentro: menú del perfil (arriba a la derecha) → **Cambiar contraseña** (contraseña actual, nueva y confirmarla). Si dice "Tu contraseña actual no es correcta", revisa mayúsculas y vuelve a intentar.

## Activar la cuenta, planes, pagos y renovación
Sección: general, cuenta, plan
Claves: pagar, plan, mensualidad, renta, instalacion, activar cuenta, cupon, wompi, vencio, renovar, pago pendiente, suscripcion, factura
- **Ahora mismo los pagos son offline**: al tocar cualquier botón de pago (plan, renta, Tienda en línea, Biblioteca o créditos) sale el aviso "Pago offline" con el botón **Escribir por WhatsApp**: ahí el equipo de DealFlow te da los datos para pagar (transferencia o consignación) y te activa la cuenta o el servicio. Lo gratis (cupón al 100 %, membresías en $0) se activa solo.
- Para usar DealFlow la tienda activa un plan: se paga una **instalación única** (incluye 30 días de servicio) y luego una **renta mensual**. El pago es por **Wompi** (tarjeta, PSE, Nequi, etc.).
- En la pantalla "Activa tu cuenta DealFlow" eliges el plan y das **Activar por $…**. Si tienes **cupón**, escríbelo y dale **Aplicar** (si el cupón deja el precio en 0 aparece **Activar gratis con el cupón**). "Cupón inválido" = no existe, venció o ya se usó.
- Si la renta vence, sale "Tu renta mensual venció" y el botón **Pagar renta $…**: al pagar se suman 30 días desde la fecha de vencimiento (no se pierde tiempo).
- En **Resumen** ves "Tu plan: … Activa" y al desplegarlo la fecha de vencimiento.
- "La pasarela de pagos no está configurada todavía" o "Tu plan no tiene renta mensual configurada": es un tema del lado de DealFlow; escribe a soporte.
- Si pagaste y no se activó: espera 1 o 2 minutos y recarga; Wompi avisa el pago en segundos. Si sigue igual, envía a soporte el comprobante de Wompi.
- La membresía de **Tienda en línea** es aparte (ver el artículo de Tienda en línea).

## Varias tiendas en una misma cuenta
Sección: general, cuenta
Claves: otra tienda, segunda tienda, varias tiendas, cambiar de tienda, eliminar tienda, mis tiendas
- Arriba, al lado del nombre de la tienda, se abre **MIS TIENDAS**: ahí cambias de tienda o das **+ Crear otra tienda**. Cada tienda extra tiene su propio número de WhatsApp y catálogo y cuesta $250.000/mes (la primera renta se paga al crearla, sin instalación).
- Solo el dueño puede crear, cambiar o eliminar tiendas. No puedes eliminar la tienda en la que estás (cámbiate a otra primero) ni tu única tienda.
- Al eliminar una tienda se borra todo su contenido; si fue un error, escribe a soporte en los siguientes 30 días y se puede recuperar.

## Menú del perfil: nombre, foto, tema, idioma, app y cerrar sesión
Sección: general, perfil
Claves: perfil, foto de perfil, cambiar nombre, tema oscuro, modo oscuro, premium, idioma ingles, english, cerrar sesion, instalar app, menu flotante, ocultar sky, mostrar sky
Arriba a la derecha toca tu nombre:
- **Cambiar foto de perfil** y **Editar nombre**.
- **Tema**: Claro, Dark System (sigue al sistema) o Premium (el Premium lo habilita el equipo de DealFlow).
- **Idioma** del panel: Español o English (solo cambia para ti). El idioma en que el asistente habla con los clientes se elige aparte en **Asistente → Personalidad → Idioma** (Español, English o Automático).
- **Cambiar contraseña**.
- **Menú flotante**: un botón flotante para navegar (útil en pantallas pequeñas).
- **Asistente SKY**: mostrar u ocultar este chat de soporte.
- **Instalar la app** y **Cerrar sesión**.
- El punto de color junto a tu foto indica si WhatsApp está conectado.

## Instalar DealFlow como app y activar notificaciones con sonido
Sección: general, notificaciones
Claves: app, instalar, celular, iphone, android, notificaciones, sonido, timbre, avisos, push, no me suenan, no llegan notificaciones, correo de pedidos
- **Instalar**: cuando aparezca "Instala DealFlow" dale **📲 Instalar ahora**, o desde el menú del perfil → **Instalar la app**. En iPhone (Safari): botón **Compartir** → **Agregar a inicio**.
- **Notificaciones**: toca la campana 🔔 arriba → **Activar notificaciones** y acepta el permiso del navegador. Puedes elegir qué avisar: **Pedidos nuevos**, **Contactos nuevos** y **Sonido de pedidos** (un timbre al entrar un pedido). Se activan por dispositivo: hazlo en cada celular/computador.
- "Están bloqueadas en el navegador": abre el candado 🔒 de la barra de direcciones → Notificaciones → Permitir, y vuelve a activarlas.
- En iPhone las notificaciones solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior).
- **Por correo**: en la misma campana puedes pedir correos de pedidos nuevos, novedades de envío y alertas importantes, y **Enviarme un correo de prueba** (revisa spam).

## Equipo: agregar personas, roles y permisos
Sección: equipo
Claves: equipo, agente, agregar agente, roles, permisos, rol, despachador, supervisor, vendedor, quitar agente, cambiar contraseña agente, no tiene permiso, tu rol no tiene permiso
Solo el dueño entra a **Equipo**.
1. **Agregar persona al equipo**: nombre, correo, contraseña (mínimo 8 caracteres) y **Rol** → **Agregar al equipo**. Entra con su propio correo.
2. En la lista, cambia el **rol** de cada persona con el selector; **✏️ Editar** cambia su nombre o le pone una contraseña nueva; **Quitar** le quita el acceso.
3. **Roles y permisos**: vienen 4 listos (**Agente de chat**, **Vendedor**, **Despachador**, **Supervisor**). **✏️ Editar permisos** o **＋ Nuevo rol** para armar el tuyo marcando qué puede hacer: Responder chats, Iniciar conversaciones, Ver leads, Ver pedidos, Crear y editar pedidos, **Despachar** (Effi/Dropi y Logística), Ver productos, Editar productos y Ver estadísticas.
- Cada persona solo ve las secciones de sus permisos. Lo de WhatsApp, el Asistente, las Integraciones, los pagos y el Equipo es solo del dueño.
- Los cambios de rol se ven cuando la persona recarga la página.
- "Tu rol no tiene permiso para esto…": esa persona necesita ese permiso en su rol; el dueño lo activa en Equipo.
- Un rol solo se puede borrar si nadie lo tiene.

## Inbox: ver quién está en el chat y quién está escribiendo
Sección: inbox
Claves: escribiendo, quien esta en el chat, dos agentes mismo chat, intervenir, colaborador escribiendo, presencia, typing
- Arriba de la caja de texto sale **👀 Andrés también tiene abierto este chat** o **✍️ Andrés está escribiendo…** (con su nombre). Si alguien está escribiendo, espera para no repetirle al cliente.
- En la lista de chats, al lado de "atiende…", aparece quién está dentro de cada chat (👀) o escribiendo (✍️).
- Se actualiza cada pocos segundos; si la otra persona cierra el chat, el aviso desaparece solo.

## Resumen: qué significa cada número
Sección: resumen
Claves: resumen, ventas del mes, ticket promedio, producto estrella, pedidos nuevos, ventas de hoy, leads activos, monitor anti baneo
- **Ventas de [mes]**: suma de los pedidos del mes (y % contra el mes pasado). **Pedidos del mes**, **Ticket promedio** y **Producto estrella**.
- **Pedidos nuevos (por confirmar)**, **Ventas de hoy** (y diferencia con ayer), **Leads activos** (conversaciones abiertas) y **Productos** en el catálogo.
- **Pedidos recientes** con su estado; **Ver todos** abre Pedidos.
- **Monitor anti-baneo de WhatsApp**: muestra la calidad del número y cuántos mensajes no solicitados se han enviado (ver el artículo de calidad del número).

## Tutoriales y Academia
Sección: tutoriales
Claves: tutorial, aprender, guia, video, curso, academy, academia, como empiezo
- **Tutoriales** (menú izquierdo): guías interactivas sobre conectar WhatsApp, crear productos, personalizar el asistente, Leads, Inbox, crear pedidos, conectar y despachar con Effi, estados del envío, resolver novedades, filtrar/exportar pedidos y cambiar el idioma.
- Guía completa de Tienda en línea con capturas: https://app.dealflow.sbs/tutorial-tienda-en-linea
- Primeros pasos recomendados: 1) conectar WhatsApp, 2) crear tus productos con variantes, combos y mensaje inicial, 3) ajustar el Asistente y probarlo en su chat de prueba, 4) conectar Effi o Dropi en Integraciones, 5) activar notificaciones.

## Biblioteca de productos y DealShop
Sección: biblioteca, dealshop
Claves: biblioteca, importar producto, producto listo, dealshop, plantilla, instalar plantilla, desinstalar, producto bloqueado
- **Biblioteca**: productos ya armados (reglas, fotos, combos, mensaje inicial) listos para importar. Unos son **GRATIS** (**Importar gratis**) y otros tienen pago único (**Comprar e importar · $…**). Ya comprados dicen **Ya adquirido · Importar de nuevo**. Se importan a **Productos**.
- Un producto de biblioteca puede venir **bloqueado** (🔒 BIBLIOTECA): su estructura (mensaje inicial, reglas, descripción, combos, variantes) no se edita para proteger la venta; solo puedes cambiar tu **precio** y tu **SKU**.
- "Activa tu membresía de Tienda en línea para hacer esto" al comprar: algunos productos piden esa membresía.
- **DealShop**: plantillas que configuran el asistente con un clic (**Instalar con un clic**). Para quitar una: **Desinstalar** y eliges si borrar también sus productos o solo el asistente. "Esta plantilla ya está instalada en tu tienda": ya la tienes; usa reinstalar si tu tienda quedó vacía.
