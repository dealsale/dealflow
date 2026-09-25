# Plantillas de mensajes para Meta (WhatsApp) — DealFlow (genéricas, multi-tienda)

Set **genérico** de plantillas que sirve para **todas las tiendas**. Se crean en la WABA de cada tienda (WhatsApp Manager → Plantillas de mensajes, o automáticamente vía DealFlow) y, una vez aprobadas, sirven para escribirle al cliente **fuera de la ventana de 24 h**.

---

## ⚠️ Cómo funcionan los marcadores (leer primero)

Hay **dos** tipos de "hueco" en estas plantillas — no los confundas:

- **`[NOMBRE_TIENDA]`** → es el nombre del negocio. **NO es una variable de Meta.** Se reemplaza **al crear** la plantilla en cada tienda (DealFlow pone el nombre real de esa tienda, o lo pones tú a mano). Queda **fijo** en el texto aprobado.
  - *¿Por qué no `{{ }}`?* Meta rechaza plantillas donde la marca es variable. El nombre debe ir **fijo** en el texto.
- **`{{1}}`, `{{2}}`, `{{3}}`…** → son las **variables de Meta**, lo único que cambia en cada envío (nombre del cliente, producto, total…).

> **Regla:** antes de mandar a aprobar, cambia `[NOMBRE_TIENDA]` por el nombre real de la tienda. Deja los `{{n}}` tal cual.

## ⚠️ Anti-baneo (recordatorio)

1. **Utilidad** (pedido, envío, pago) = aprobación fácil, bajo riesgo. **Marketing** (promos) = **solo a clientes con opt-in**.
2. **Categoría correcta** en cada una (ya viene indicada abajo).
3. Fuera de las 24 h **solo** se puede con estas plantillas aprobadas (no texto libre).
4. En marketing, **siempre da salida** ("Responde BAJA…").

---

## PARTE A · Plantillas de UTILIDAD (aprobación fácil)

### 1) `confirmacion_pedido` · Categoría: Utilidad
**Cuerpo:**
```
Hola {{1}} 👋 ¡Gracias por tu compra en [NOMBRE_TIENDA]!
Tu pedido quedó confirmado:
{{2}}
Total: {{3}}
Te avisamos apenas salga para entrega. Cualquier duda, respóndenos por aquí.
```
- `{{1}}` nombre del cliente · `{{2}}` resumen del pedido · `{{3}}` total

### 2) `pedido_en_camino` · Categoría: Utilidad
**Cuerpo:**
```
¡Buenas noticias, {{1}}! 🚚 Tu pedido de [NOMBRE_TIENDA] ya va en camino.
Transportadora: {{2}}
Guía de rastreo: {{3}}
Llega en un estimado de {{4}}. ¡Gracias por confiar en nosotros!
```
- `{{1}}` nombre · `{{2}}` transportadora · `{{3}}` número de guía · `{{4}}` tiempo estimado

### 3) `recordatorio_abono` · Categoría: Utilidad
**Cuerpo:**
```
Hola {{1}}, te recordamos que tu pedido {{2}} está apartado.
Para despacharlo necesitamos confirmar el pago de {{3}}.
Cuando quieras, respóndenos por aquí y te ayudamos a completarlo. 🙌
```
- `{{1}}` nombre · `{{2}}` referencia del pedido · `{{3}}` monto

### 4) `pedido_incompleto` · Categoría: Utilidad
**Cuerpo:**
```
Hola {{1}} 👋 Notamos que dejaste tu pedido de [NOMBRE_TIENDA] a medias.
Aún tenemos disponible: {{2}}
¿Quieres que lo dejemos listo para envío? Respóndenos y lo terminamos en un minuto.
```
- `{{1}}` nombre · `{{2}}` producto(s) de interés
- **Botones (opcional, Respuesta rápida):** `Sí, quiero terminarlo` · `Ahora no`

---

## PARTE B · Plantillas de MARKETING (solo a clientes con opt-in)

### 5) `nueva_coleccion` · Categoría: Marketing
**Encabezado:** Imagen (subes una foto al crear la plantilla)
**Cuerpo:**
```
{{1}}, ya llegó lo nuevo a [NOMBRE_TIENDA] 🔥
Estrenamos {{2}} y sabemos que te va a encantar.
Míralo antes de que se agote y aparta el tuyo respondiéndonos por aquí.
```
**Pie:** `Responde BAJA para no recibir más novedades.`
- `{{1}}` nombre · `{{2}}` nombre de la colección/prenda
- **Botones (opcional, URL):** `Ver la colección` → link de la tienda

### 6) `te_extranamos` · Categoría: Marketing
**Cuerpo:**
```
¡Hola {{1}}! Hace rato no sabemos de ti y en [NOMBRE_TIENDA] llegaron prendas nuevas 😍
Tenemos algo especial para ti: {{2}}.
Escríbenos por aquí y te asesoramos con gusto.
```
**Pie:** `Responde BAJA para no recibir promociones.`
- `{{1}}` nombre · `{{2}}` beneficio/oferta (ej. "10% en tu próxima compra")

### 7) `promo_tiempo_limitado` · Categoría: Marketing
**Cuerpo:**
```
{{1}}, solo por hoy en [NOMBRE_TIENDA]: {{2}} 🛍️
Aprovecha antes de que termine {{3}}.
Responde por aquí y te ayudamos a elegir tu talla y color.
```
**Pie:** `Responde BAJA para no recibir promociones.`
- `{{1}}` nombre · `{{2}}` la promo (ej. "20% en toda la tienda") · `{{3}}` fecha/hora límite
- **Botones (opcional, Respuesta rápida):** `Quiero aprovechar` · `BAJA`

### 8) `carrito_abandonado` · Categoría: Marketing
**Cuerpo:**
```
{{1}}, ¿te quedaste pensando en {{2}}? 👀
En [NOMBRE_TIENDA] todavía lo tenemos disponible para ti.
Respóndenos y lo dejamos apartado hoy mismo.
```
**Pie:** `Responde BAJA para no recibir promociones.`
- `{{1}}` nombre · `{{2}}` producto que miró

---

## PARTE C · Reglas para que TE APRUEBEN

- **Nombre de plantilla:** minúsculas y guion bajo (`nueva_coleccion`), sin tildes ni espacios. (El nombre es el mismo en todas las tiendas; el contenido cambia solo en `[NOMBRE_TIENDA]`.)
- **Reemplaza `[NOMBRE_TIENDA]`** por el nombre real antes de enviar a aprobación (o deja que DealFlow lo haga).
- **Variables con ejemplo:** Meta pide un valor de ejemplo para cada `{{n}}`. Pon ejemplos reales (`{{1}}` = "Camila").
- **Nada de mayúsculas sostenidas, `!!!` ni `$$$`** → parece spam.
- **Marketing = con opt-in y con salida** ("Responde BAJA").

---

*Plantillas genéricas para la plataforma DealFlow (DEALFLOW S.A.S.). Sirven para cualquier tienda: solo cambia `[NOMBRE_TIENDA]`.*
