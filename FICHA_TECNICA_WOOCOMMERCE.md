# Ficha técnica — Integración DealFlow ↔ WooCommerce (WordPress) ↔ Effi/Dropi

**Propósito:** documento de referencia para la reunión técnica sobre los "llamados de regreso" (actualización de estado y guía desde el operador logístico hacia DealFlow). Describe cómo está implementada HOY la integración, qué endpoints usa, cómo fluye la información en ambos sentidos, dónde están los problemas conocidos y qué opciones hay para resolverlos.

**Sistema:** DealFlow (DEALFLOW S.A.S.) — SaaS multi-tienda de ventas por WhatsApp.
**Stack relevante:** Node.js + TypeScript (ESM), Express, better-sqlite3. Cliente HTTP: `fetch` nativo.
**Fecha:** 2026-09-25.

---

## 1. Arquitectura general

DealFlow **no se integra directamente con Effi**. Effi (ERP/logística) no expone una API pública, pero **sí se sincroniza con tiendas WooCommerce**. Por eso el diseño usa WooCommerce como **capa puente**:

```
  DealFlow  ──(REST WC v3)──▶  WooCommerce (WordPress)  ◀──(sync propio de Effi)──▶  Effi / Dropi
     ▲                                    │
     └──────── polling cada 4 min ────────┘   (lee estado + guía)
```

- **Ida (DealFlow → Woo):** DealFlow crea el pedido y empuja el catálogo/stock a WooCommerce vía la REST API oficial.
- **Puente (Woo ↔ Effi):** Effi recoge el pedido desde Woo, genera la guía, despacha y **escribe de vuelta** el estado y el número de guía en el pedido de Woo (mediante su propio conector/plugin).
- **Regreso (Woo → DealFlow):** DealFlow **consulta periódicamente (polling)** el pedido en Woo para leer el estado y la guía. **Hoy NO hay webhook entrante desde Woo.** ← *este es el punto central de la reunión.*

**Multi-proveedor:** cada tienda puede tener **dos** conexiones WooCommerce independientes: una para **Dropi** y otra para **Effi** (`woocommerce_dropi`, `woocommerce_effi`). Existe además un "proveedor preferido" para auto-despacho.

---

## 2. Autenticación y configuración

- **API:** WooCommerce REST API **v3**.
- **Base URL:** `https://{dominio-tienda}/wp-json/wc/v3`
  - DealFlow normaliza la URL que ingresa el usuario: si no termina en `/wp-json/wc/v3`, la reescribe a esa base.
- **Auth:** `consumer_key` + `consumer_secret` de WooCommerce, enviados como **query params** sobre HTTPS (`?consumer_key=...&consumer_secret=...`).
  - *Nota de seguridad:* WooCommerce permite auth básica por header (Basic Auth) o por query string. DealFlow usa query string sobre HTTPS. Requiere **HTTPS válido** en la tienda; sin TLS, WooCommerce puede rechazar o exponer las llaves.
  - Las llaves deben tener permiso **Read/Write** (se crean órdenes y productos).
- **Almacenamiento en DealFlow:** tabla `store_integrations`, una fila por proveedor:
  - `tipo`: `woocommerce_effi` | `woocommerce_dropi` (o `woocommerce` legado).
  - `config` (JSON): `{ url, consumerKey, consumerSecret }`.
  - Preferencia de despacho: `tipo = 'despacho_pref'`, `config = { proveedor: 'effi' | 'dropi' }`.

---

## 3. Endpoints de WooCommerce que DealFlow consume

Todos sobre `{base}/wp-json/wc/v3`.

| Acción | Método | Ruta | Uso en DealFlow |
|---|---|---|---|
| Verificar credenciales | GET | `/orders?per_page=1` | Probar conexión al conectar la tienda |
| Crear pedido | POST | `/orders` | Enviar el pedido a despacho (Effi/Dropi lo recogen) |
| Leer pedido | GET | `/orders/{id}` | **Polling**: leer estado + guía de regreso |
| Listar productos | GET | `/products?per_page=100&page=N` | Leer inventario / mapear SKU→id |
| Buscar producto | GET | `/products?sku=...` o `?search=...` | Vincular SKU desde la ficha del producto |
| Crear/actualizar productos | POST | `/products/batch` | Empujar catálogo (lotes de 100) |

**Paginación:** hasta 5–10 páginas de 100 productos, con corte anticipado si la página trae menos de 100.

---

## 4. Flujo de IDA — creación del pedido (DealFlow → Woo)

Función: `crearPedido()` en `server/src/woocommerce.ts`.

**Payload `POST /orders`:**
```json
{
  "payment_method": "cod",
  "payment_method_title": "Pago contra entrega",
  "set_paid": false,
  "status": "processing",
  "billing":  { "first_name": "...", "last_name": "...", "address_1": "...", "city": "...", "state": "...", "phone": "..." },
  "shipping": { "first_name": "...", "last_name": "...", "address_1": "...", "city": "...", "state": "..." },
  "line_items": [ { "product_id": 123, "quantity": 2, "subtotal": "120000.00", "total": "120000.00" } ],
  "fee_lines": [ { "name": "1× Producto sin SKU", "total": "35000.00" } ],
  "shipping_lines": [ { "method_id": "flat_rate", "method_title": "Envío", "total": "12000.00" } ],
  "customer_note": "Nota del cliente · Productos: ..."
}
```

**Detalles importantes de negocio:**
- **Contra entrega:** siempre `payment_method: cod`, `set_paid: false`, `status: processing`.
- **Mapeo por SKU:** cada ítem se intenta casar con un producto de Woo por **SKU** (búsqueda `GET /products?sku=`). El casado es flexible: nombre exacto → nombre base (sin talla/color entre paréntesis) → coincidencia por prefijo/inclusión.
  - Ítems **con** SKU casado → `line_items` con `product_id` (Effi/Dropi **sí** los despacha).
  - Ítems **sin** SKU casado → van como `fee_lines` (cargo) + anotados en `customer_note` (Effi/Dropi **NO** los despacha; quedan para referencia/total).
- **Precio negociado, no de catálogo:** el pedido se cierra por un **total** (combos/descuentos). DealFlow reparte ese total entre las líneas (proporcional al valor de catálogo, o a la cantidad si no hay precios) y envía `subtotal`/`total` por línea; WooCommerce calcula el unitario = total ÷ qty. El remanente por redondeo se asigna a la última línea para que la suma cuadre exactamente.
- **Respuesta relevante:** `{ id, number }`. DealFlow guarda `woo_id` (= `id`) en su tabla `orders` y devuelve `sinMapear` (ítems sin SKU) y `mapeados` (líneas reales).

---

## 5. Flujo de REGRESO — estado y guía (Woo → DealFlow) ⭐ (tema de la reunión)

**Cómo funciona HOY: POLLING (no webhooks).**

Módulo: `server/src/syncWoo.ts`. Corre en segundo plano (arranca ~20 s después del boot):
- **Despachos:** `sincronizarDespachos()` cada **`WOO_SYNC_DESPACHO_MIN` (default 4 min)**.
- **Inventario:** `sincronizarInventarios()` cada **`WOO_SYNC_INVENTARIO_MIN` (default 30 min)**.

**Ciclo de despachos:**
1. Selecciona pedidos locales con `woo_id` y `despacho_proveedor` definidos y estado `NOT IN ('Entregado','Cancelado')` (límite 150, más recientes primero).
2. Por cada uno: `GET /orders/{woo_id}` → lee `status` y `meta_data`.
3. **Extracción de la guía:** recorre `meta_data[]` buscando una `key` que matchee la regex `/gu[ií]a|guide|tracking|rastreo|numero_guia|shipment/i`; toma su `value` (string o número). ← *Punto frágil: depende de cómo Effi nombre el meta.*
4. **Mapeo de estado** (`status` de Woo → pipeline DealFlow):
   - `entregado/completed/delivered` → **Entregado**
   - `cancelled/refunded/failed` → **Cancelado**
   - `shipped/enviado` **o hay guía** → **Despachado**
   - Estados de Woo mapeados: `pending, processing, on-hold, completed, cancelled, refunded, failed, shipped, delivered`.
5. **Auto-avance seguro:** el estado del pedido solo avanza hacia adelante en el pipeline `Nuevo → Confirmado → Empacado → Despachado → Entregado → Cancelado` (nunca retrocede uno puesto a mano).
6. **Aviso al cliente:** cuando la guía aparece **por primera vez** (`guia_avisada = 0`), DealFlow envía UN WhatsApp al cliente con la guía + transportadora y lo marca como avisado. Si el envío falla (p. ej. ventana de 24 h de WhatsApp cerrada), **no** se marca avisado y se reintenta al siguiente ciclo.

**Sincronización manual:** el botón "Sincronizar" del panel llama `sincronizarPedido(storeId, rowId)` → `procesarOrden()` (mismo flujo, un pedido).

---

## 6. Problema conocido / foco de la reunión

**Síntoma:** los "llamados de regreso" (estado/guía desde Effi/Dropi) no llegan de forma confiable o a tiempo.

**Causa raíz de diseño:** el regreso es por **polling cada 4 min**, no por **webhook en tiempo real**. Eso implica:
- **Latencia:** hasta ~4 min entre que Effi escribe la guía en Woo y que DealFlow la ve.
- **Dependencia del meta_data:** la guía se lee heurísticamente de `meta_data` por nombre de clave. Si Effi cambia el nombre de la clave, la guía **no se detecta** aunque el pedido esté despachado.
- **Dependencia del `status`:** si Effi no cambia el `status` del pedido en Woo (solo agrega la guía en meta), DealFlow igual lo pasa a "Despachado" por la presencia de guía; pero si no escribe ni guía ni status, no hay señal.
- **No hay webhook entrante:** DealFlow **no expone** hoy un endpoint para que WooCommerce le notifique cambios (`order.updated`). Todo el regreso depende de que DealFlow pregunte.

**Puntos a validar con el otro ingeniero:**
1. ¿Con qué **`key` exacta** escribe Effi el número de guía en el `meta_data` del pedido de Woo? (Para dejar de depender de la regex y leer la clave exacta.)
2. ¿Effi actualiza el **`status`** del pedido en Woo al despachar/entregar, o solo agrega meta? ¿Con qué valores exactos?
3. ¿El WooCommerce de la tienda puede emitir **webhooks** (`order.updated`) hacia una URL de DealFlow? (Ver §7.)
4. ¿Hay **rate limits** o caché (p. ej. plugins de seguridad/CDN) que estén bloqueando o cacheando las respuestas de `/wp-json/wc/v3/orders/{id}`?
5. ¿El pedido en Woo conserva el **mismo `id`** que DealFlow guardó como `woo_id`? (Si Effi recrea el pedido, el id cambia y el polling apunta a un pedido viejo.)

---

## 7. Opción recomendada: WebHooks de WooCommerce (regreso en tiempo real)

WooCommerce puede enviar **webhooks** salientes cuando cambia un pedido, evitando el polling:

- **Configuración en Woo:** WooCommerce → Ajustes → Avanzado → Webhooks → *Add webhook*.
  - **Topic:** `Order updated` (`order.updated`).
  - **Delivery URL:** un endpoint nuevo en DealFlow, p. ej. `https://dealflow.sbs/webhooks/woocommerce`.
  - **Secret:** WooCommerce firma cada entrega con HMAC-SHA256 del cuerpo usando ese secret, en el header **`X-WC-Webhook-Signature`** (base64). DealFlow debe validarlo (igual que ya hace con la firma de Meta y de Wompi).
- **Payload:** JSON del pedido (incluye `id`, `status`, `meta_data`, etc.).
- **Ventaja:** actualización **inmediata** de estado/guía, sin latencia ni carga de polling.
- **Consideración:** el webhook debe identificar **a qué tienda** pertenece el pedido. Como una sola URL recibe de muchas WABAs/tiendas, se resuelve por:
  - el dominio de origen (`X-WC-Webhook-Source` header), o
  - buscar el `order.id` recibido contra `orders.woo_id` + `despacho_proveedor` en la base.
- **Híbrido recomendado:** dejar el **polling como respaldo** (cada 10–15 min) y el **webhook como vía principal**. Así, si un webhook se pierde, el polling lo recupera.

> *Estado actual en el código:* DealFlow ya tiene el patrón de validación de firma HMAC para webhooks entrantes (`firmaMetaValida` para Meta, checksum para Wompi en `routes.ts`). Añadir `/webhooks/woocommerce` con validación `X-WC-Webhook-Signature` es directo y reutiliza ese patrón.

---

## 8. Inventario y catálogo (contexto de apoyo)

- **Empujar catálogo:** `empujarProductos()` — casa por SKU (genera SKU automático a los que no tengan) y usa `POST /products/batch` con `create`/`update` en lotes de 100.
- **Leer inventario:** `inventario()` — `GET /products?per_page=100` paginado; devuelve `{ sku, name, stock_quantity }`.
- **Sincronizar stock:** `sincronizarInventario()` — actualiza `variants.stock` local por SKU con lo que reporta Woo.
- Un solo proveedor basta para el stock (el catálogo es el mismo).

---

## 9. Manejo de errores y resiliencia (actual)

- Toda llamada a Woo captura errores de red y devuelve `{ error }` legible; nunca tumba el proceso.
- Los ciclos de fondo usan flags (`corriendoDespachos`, `corriendoInventario`) para **evitar solapamiento** si un ciclo tarda más que el intervalo.
- El auto-avance de estado es **monótono** (solo hacia adelante): respeta cambios manuales del dueño.
- El aviso de guía al cliente es **idempotente** (`guia_avisada`): se manda una sola vez y se reintenta si el WhatsApp falla.

---

## 10. Resumen para la reunión (checklist)

1. Confirmar la **`key` exacta** del número de guía en `meta_data` de Effi/Dropi.
2. Confirmar los **valores de `status`** que Effi/Dropi escriben en Woo y cuándo.
3. Decidir migrar el regreso a **webhooks `order.updated`** (tiempo real) + polling de respaldo.
4. Verificar **HTTPS, rate limits, caché y plugins de seguridad** en el WordPress de la tienda.
5. Verificar que el **`woo_id`** del pedido no cambie tras la intervención de Effi.
6. Definir cómo el webhook **identifica la tienda** (dominio origen o lookup por `woo_id`).

---

*DEALFLOW S.A.S. · NIT 902.087.359-4 · Ficha técnica de integración WooCommerce. Basada en el código en producción (`woocommerce.ts`, `syncWoo.ts`).*
