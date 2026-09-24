# Plantillas de mensajes para Meta (WhatsApp) — DealFlow

Plantillas listas para crear en **WhatsApp Manager → Herramientas de la cuenta → Plantillas de mensajes** y enviar a verificación. Una vez aprobadas, sirven para escribirle al cliente **fuera de la ventana de 24 h** (que es cuando WhatsApp exige plantilla).

> **Cómo crearlas:** En cada plantilla eliges **Categoría** (Utilidad / Marketing), **Idioma** (`Español` o `Español (COL)`), y llenas los componentes (Encabezado, Cuerpo, Pie, Botones). Las variables se escriben `{{1}}`, `{{2}}`, etc.

---

## ⚠️ Lo más importante (anti-baneo)

1. **UTILIDAD vs MARKETING.** Las de **utilidad** (confirmar pedido, envío, pago) se aprueban fácil y molestan poco → bajísimo riesgo de reporte. Las de **marketing** (promos, colecciones) **solo pueden ir a clientes con opt-in** (por eso agregué el registro de consentimiento en el bot). Enviar marketing a quien no lo pidió = reportes = baneo.
2. **Categoría correcta.** Si pones contenido promocional en una plantilla de "utilidad", Meta la recategoriza o la rechaza, y eso baja la calidad. Cada plantilla de abajo ya trae su categoría correcta.
3. **La ventana de 24 h.** Los flujos de remarketing con texto/foto libres del constructor **solo llegan si el cliente escribió en las últimas 24 h**. Para reactivar a alguien que lleva días sin escribir, **hay que usar una de estas plantillas aprobadas** (no texto libre).
4. **Siempre da salida.** En las de marketing, ofrece cómo dejar de recibirlas. Reduce reportes.

---

## PARTE A · Plantillas de UTILIDAD (recomendadas, aprobación fácil)

### 1) `confirmacion_pedido` · Categoría: Utilidad

**Cuerpo:**
```
Hola {{1}} 👋 ¡Gracias por tu compra en Urban Supply!
Tu pedido quedó confirmado:
{{2}}
Total: {{3}}
Te avisamos apenas salga para entrega. Cualquier duda, respóndenos por aquí.
```
- `{{1}}` nombre · `{{2}}` resumen del pedido · `{{3}}` total

### 2) `pedido_en_camino` · Categoría: Utilidad

**Cuerpo:**
```
¡Buenas noticias, {{1}}! 🚚 Tu pedido de Urban Supply ya va en camino.
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
Hola {{1}} 👋 Notamos que dejaste tu pedido de Urban Supply a medias.
Aún tenemos disponible: {{2}}
¿Quieres que lo dejemos listo para envío? Respóndenos y lo terminamos en un minuto.
```
- `{{1}}` nombre · `{{2}}` producto(s) de interés

**Botones (opcional, Respuesta rápida):** `Sí, quiero terminarlo` · `Ahora no`

---

## PARTE B · Plantillas de MARKETING (solo a clientes con opt-in)

### 5) `nueva_coleccion` · Categoría: Marketing

**Encabezado:** Imagen (subes una foto de la colección al crear la plantilla)

**Cuerpo:**
```
{{1}}, ya llegó lo nuevo a Urban Supply 🔥
Estrenamos {{2}} y sabemos que te va a encantar.
Míralo antes de que se agote y aparta el tuyo respondiéndonos por aquí.
```
**Pie:** `Responde BAJA para no recibir más novedades.`

- `{{1}}` nombre · `{{2}}` nombre de la colección/prenda

**Botones (opcional, URL):** `Ver la colección` → tu link

### 6) `te_extranamos` · Categoría: Marketing

**Cuerpo:**
```
¡Hola {{1}}! Hace rato no sabemos de ti y en Urban Supply llegaron prendas nuevas 😍
Tenemos algo especial para ti: {{2}}.
Escríbenos por aquí y te asesoramos con gusto.
```
**Pie:** `Responde BAJA para no recibir promociones.`

- `{{1}}` nombre · `{{2}}` beneficio/oferta (ej. "10% en tu próxima compra")

### 7) `promo_tiempo_limitado` · Categoría: Marketing

**Cuerpo:**
```
{{1}}, solo por hoy en Urban Supply: {{2}} 🛍️
Aprovecha antes de que termine {{3}}.
Responde por aquí y te ayudamos a elegir tu talla y color.
```
**Pie:** `Responde BAJA para no recibir promociones.`

- `{{1}}` nombre · `{{2}}` la promo (ej. "20% en toda la tienda") · `{{3}}` fecha/hora límite

**Botones (opcional, Respuesta rápida):** `Quiero aprovechar` · `BAJA`

### 8) `carrito_abandonado` · Categoría: Marketing

**Cuerpo:**
```
{{1}}, ¿te quedaste pensando en {{2}}? 👀
En Urban Supply todavía lo tenemos disponible para ti.
Respóndenos y lo dejamos apartado hoy mismo.
```
**Pie:** `Responde BAJA para no recibir promociones.`

- `{{1}}` nombre · `{{2}}` producto que miró

---

## PARTE C · Reglas rápidas para que TE APRUEBEN

- **Nombre de plantilla:** minúsculas y guion bajo (`nueva_coleccion`), sin tildes ni espacios.
- **Nada de mayúsculas sostenidas** tipo "COMPRA YA!!!", ni exceso de emojis o signos (`!!!`, `$$$`) → Meta lo lee como spam.
- **Variables con ejemplo:** al crear la plantilla, Meta te pide un valor de ejemplo para cada `{{n}}`. Pon ejemplos reales (ej. `{{1}}` = "Camila").
- **No prometas lo que no cumples** ni uses marcas de terceros sin permiso.
- **Marketing = con opt-in y con salida** (el "Responde BAJA"). Ya dejé en DealFlow el registro de opt-in y el bloqueo del remarketing para quien no lo aceptó.

---

*DEALFLOW S.A.S. · Comercio: Urban Supply · Plantillas para WhatsApp Business Platform (Cloud API).*
