import type { Account, Integration, Lead, Order, Plan, Product, Promo } from './types';

export const ASSISTANT_TEXT_DEFAULT =
  'Vende como una asesora amable de Luna Accesorios. Saluda por el nombre si lo sabes. Recomienda máximo 2 productos por mensaje. Si preguntan por tallas, pide la talla habitual antes de sugerir. Cierra siempre preguntando la ciudad para cotizar el envío.';

export const RULES_DEFAULT: string[] = [
  'Si preguntan por envío, pide la ciudad antes de dar el precio.',
  'Nunca ofrezcas más del 10% de descuento.',
  'Si el cliente está listo, pide nombre, dirección y método de pago en un solo mensaje.',
];

export const ORDERS: Order[] = [
  { id: 'DF-1048', cliente: 'Mariana López', ciudad: 'Bogotá', tel: '+57 310 442 8811', direccion: 'Cra 15 # 82-40, apto 302', estado: 'Nuevo', hora: 'hace 8 min', transportadora: 'Dropi', envio: 9900, nota: 'Pagó por Nequi. Comprobante recibido.', items: [{ qty: 2, nombre: 'Camiseta oversize algodón', precio: 59900 }, { qty: 1, nombre: 'Gorra bordada logo', precio: 39900 }] },
  { id: 'DF-1047', cliente: 'Julián Pérez', ciudad: 'Medellín', tel: '+57 301 887 2245', direccion: 'Cl 10 # 43E-31, Torre 2', estado: 'Nuevo', hora: 'hace 25 min', transportadora: 'Dropi', envio: 12000, nota: '', items: [{ qty: 1, nombre: 'Jean mom fit tiro alto', precio: 129900 }] },
  { id: 'DF-1046', cliente: 'Sofía Ramírez', ciudad: 'Cali', tel: '+57 315 662 9034', direccion: 'Av 6N # 25-30', estado: 'Confirmado', hora: 'hace 1 h', transportadora: 'Dropi', envio: 12000, nota: 'Pide entrega antes del viernes.', items: [{ qty: 1, nombre: 'Vestido midi floral', precio: 149900 }] },
  { id: 'DF-1045', cliente: 'Andrés Castro', ciudad: 'Bogotá', tel: '+57 320 118 7752', direccion: 'Cl 147 # 19-64', estado: 'Empacado', hora: 'hace 3 h', transportadora: 'Dropi', envio: 9900, nota: '', items: [{ qty: 1, nombre: 'Bolso tote cuero vegano', precio: 89900 }, { qty: 1, nombre: 'Collar acero dorado', precio: 34900 }] },
  { id: 'DF-1044', cliente: 'Valentina Ruiz', ciudad: 'Barranquilla', tel: '+57 300 954 1120', direccion: 'Cra 53 # 79-140', estado: 'Despachado', hora: 'ayer', transportadora: 'Dropi', guia: '402118', envio: 14000, nota: '', items: [{ qty: 3, nombre: 'Camiseta oversize algodón', precio: 59900 }] },
  { id: 'DF-1043', cliente: 'Camilo Torres', ciudad: 'Bucaramanga', tel: '+57 311 240 6673', direccion: 'Cl 36 # 26-48', estado: 'Entregado', hora: 'ayer', transportadora: 'Dropi', guia: '401984', envio: 12000, nota: '', items: [{ qty: 1, nombre: 'Gorra bordada logo', precio: 39900 }] },
  { id: 'DF-1042', cliente: 'Laura Gómez', ciudad: 'Bogotá', tel: '+57 316 778 3390', direccion: 'Cra 7 # 45-22, apto 801', estado: 'Entregado', hora: 'hace 2 días', transportadora: 'Dropi', guia: '401877', envio: 9900, nota: '', items: [{ qty: 1, nombre: 'Jean mom fit tiro alto', precio: 129900 }, { qty: 1, nombre: 'Camiseta oversize algodón', precio: 59900 }] },
];

export const PRODUCTS: Product[] = [
  { id: 7, nombre: 'Jogger jaspeado', precio: 44900, stock: 21, color: '#D1FAE5', txt: '#047857', reglas: ['Si piden 2 o más, ofrece la promo "3 joggers por $109.900" sin que la pidan.', 'Si preguntan por talla, envía la guía de medidas antes de confirmar.'], fotos: ['Frente', 'Espalda', 'Detalle tela'], variantes: [{ label: 'M · Verde', stock: 6, fotos: 2 }, { label: 'L · Verde', stock: 4, fotos: 2 }, { label: 'M · Negro', stock: 7, fotos: 3 }, { label: 'L · Negro', stock: 4, fotos: 3 }] },
  { id: 1, nombre: 'Camiseta oversize algodón', precio: 59900, stock: 24, color: '#E0E7FF', txt: '#4338CA', reglas: ['Si compran 2 o más, aplica la promo "2 por $99.900" sin que la pidan.'], variantes: [{ label: 'S · Blanco', stock: 8 }, { label: 'M · Blanco', stock: 6 }, { label: 'M · Negro', stock: 7 }, { label: 'L · Negro', stock: 3 }] },
  { id: 2, nombre: 'Jean mom fit tiro alto', precio: 129900, stock: 12, color: '#DBEAFE', txt: '#1D4ED8', reglas: ['Sugiere la guía de tallas antes de confirmar. No hay cambios por talla en promoción.'], variantes: [{ label: '6 · Azul claro', stock: 4 }, { label: '8 · Azul claro', stock: 5 }, { label: '10 · Azul oscuro', stock: 3 }] },
  { id: 3, nombre: 'Bolso tote cuero vegano', precio: 89900, stock: 8, color: '#FEF3C7', txt: '#B45309', reglas: ['Combínalo con el collar dorado cuando pregunten por regalos.'], variantes: [{ label: 'Único · Camel', stock: 5 }, { label: 'Único · Negro', stock: 3 }] },
  { id: 4, nombre: 'Gorra bordada logo', precio: 39900, stock: 30, color: '#DCFCE7', txt: '#15803D', reglas: ['Producto de entrada: ofrécela como complemento de cualquier compra.'], variantes: [{ label: 'Única · Negra', stock: 18 }, { label: 'Única · Beige', stock: 12 }] },
  { id: 5, nombre: 'Vestido midi floral', precio: 149900, stock: 5, color: '#FCE7F3', txt: '#BE185D', reglas: ['Stock bajo: avisa que quedan pocas unidades, sin presionar.'], variantes: [{ label: 'S', stock: 2 }, { label: 'M', stock: 3 }] },
  { id: 6, nombre: 'Collar acero dorado', precio: 34900, stock: 0, color: '#F1F5F9', txt: '#475569', reglas: ['Agotado: ofrece avisar cuando llegue y sugiere el bolso tote.'], variantes: [{ label: 'Único · Dorado', stock: 0 }] },
];

export const PROMOS: Promo[] = [
  { id: 1, tipo: 'Promoción', titulo: '2 camisetas por $99.900', desc: 'Aplica a la camiseta oversize en cualquier talla y color. El asistente la ofrece cuando piden 2 o más.', vigencia: 'Vence el 31 de julio', activa: true },
  { id: 2, tipo: 'Combo', titulo: 'Jean + camiseta por $169.900', desc: 'Un jean mom fit y una camiseta oversize. Ahorro de $19.900 frente al precio por separado.', vigencia: 'Sin fecha de vencimiento', activa: true },
  { id: 3, tipo: 'Promoción', titulo: 'Envío gratis desde $150.000', desc: 'En compras desde $150.000 el envío va por cuenta de la tienda, a cualquier ciudad.', vigencia: 'Vence el 15 de agosto', activa: true },
  { id: 4, tipo: 'Combo', titulo: 'Bolso + collar por $109.900', desc: 'El tote de cuero vegano con el collar dorado. Pausado mientras llega stock del collar.', vigencia: 'Pausado', activa: false },
  { id: 5, tipo: 'Promoción', titulo: '3 joggers por $109.900', desc: 'Tres joggers jaspeados en cualquier talla y color. Ahorro de $24.800 frente al precio por unidad.', vigencia: 'Sin fecha de vencimiento', activa: true },
];

export const LEADS: Lead[] = [
  { id: 1, nombre: 'Mariana López', tel: '+57 310 442 8811', ultimo: 'Listo, entonces 2 en talla M y la gorra 🙌', hora: '10:42', etapa: 'Listo para comprar', asignado: 'Asistente (bot)', mensajes: [
    { de: 'cliente', texto: 'Hola! ¿Tienen la camiseta oversize en talla M?', hora: '10:31' },
    { de: 'bot', texto: '¡Hola Mariana! Sí, la tenemos en M en blanco y negro, a $59.900. Y ojo: 2 camisetas te quedan en $99.900 😉 ¿Te muestro fotos?', hora: '10:31' },
    { de: 'cliente', texto: '¿Y si llevo 2 y una gorra?', hora: '10:38' },
    { de: 'bot', texto: 'Te quedaría así: 2 camisetas $99.900 + gorra $39.900 = $139.700 + envío. ¿A qué ciudad te lo enviamos?', hora: '10:39' },
    { de: 'cliente', texto: 'Listo, entonces 2 en talla M y la gorra 🙌', hora: '10:42' },
  ] },
  { id: 2, nombre: 'Daniela Mora', tel: '+57 314 220 9987', ultimo: '¿Cuánto vale el envío a Pasto?', hora: '10:15', etapa: 'Cotizando', asignado: 'Asistente (bot)', mensajes: [
    { de: 'cliente', texto: 'Me interesa el vestido midi floral', hora: '10:12' },
    { de: 'bot', texto: '¡Buena elección! Está a $149.900 y quedan pocas unidades en S y M. ¿Cuál es tu talla?', hora: '10:12' },
    { de: 'cliente', texto: '¿Cuánto vale el envío a Pasto?', hora: '10:15' },
  ] },
  { id: 3, nombre: 'Esteban Vargas', tel: '+57 305 671 4432', ultimo: '¿Hay descuento si llevo 2 jeans?', hora: '09:48', etapa: 'Cotizando', asignado: 'Karla', mensajes: [
    { de: 'cliente', texto: '¿Hay descuento si llevo 2 jeans?', hora: '09:48' },
    { de: 'bot', texto: 'Por ahora el jean no tiene promo, pero el combo jean + camiseta queda en $169.900. Le paso tu chat a Karla para ver qué se puede hacer 😉', hora: '09:49' },
  ] },
  { id: 4, nombre: 'Jorge Rivas', tel: '+57 322 908 1276', ultimo: 'Me interesa el combo del bolso', hora: '09:20', etapa: 'Explorando', asignado: 'Asistente (bot)', mensajes: [
    { de: 'cliente', texto: 'Hola, vi el bolso tote en Instagram', hora: '09:18' },
    { de: 'bot', texto: '¡Hola Jorge! El tote de cuero vegano está a $89.900, en camel y negro. ¿Es para ti o para regalo?', hora: '09:18' },
    { de: 'cliente', texto: 'Me interesa el combo del bolso', hora: '09:20' },
  ] },
  { id: 5, nombre: 'Paola Sierra', tel: '+57 318 445 6210', ultimo: 'Aún no me llega el pedido de la semana pasada', hora: '08:55', etapa: 'Postventa', asignado: 'Andrés', mensajes: [
    { de: 'cliente', texto: 'Aún no me llega el pedido de la semana pasada', hora: '08:55' },
    { de: 'bot', texto: 'Lo siento, Paola. Tu pedido DF-1031 salió con Dropi el jueves. Ya le avisé a Andrés para que revise la guía y te escriba en un momento.', hora: '08:56' },
  ] },
];

export const INTEGRATIONS: Integration[] = [
  { id: 'meta', nombre: 'Meta Business', logoText: 'M', logoBg: '#E7F0FF', logoTxt: '#0866FF', desc: 'Tu WhatsApp Business API y tus catálogos de Facebook e Instagram, desde Meta.', estado: 'disponible' },
  { id: 'wa', nombre: 'WhatsApp Business', logoText: 'WA', logoBg: '#DCFCE7', logoTxt: '#15803D', desc: 'El canal donde tu asistente atiende y vende. Se configura en la sección WhatsApp.', estado: 'disponible' },
  { id: 'deepseek', nombre: 'DeepSeek', logoText: 'DS', logoBg: '#EAEEFF', logoTxt: '#4D6BFE', desc: 'Motor de IA para responder y cerrar ventas. Pon tu propia API key y tu tienda paga solo lo que consume.', estado: 'disponible', esIA: true, campos: [{ key: 'apiKey', label: 'API Key de DeepSeek', placeholder: 'sk-…', secreto: true }] },
  { id: 'openai', nombre: 'OpenAI', logoText: 'AI', logoBg: '#E6F6F0', logoTxt: '#0A8F6E', desc: 'IA para responder chats y generar imágenes de anuncios, con tu clave de OpenAI.', estado: 'disponible', esIA: true, campos: [{ key: 'apiKey', label: 'API Key de OpenAI', placeholder: 'sk-…', secreto: true }] },
  { id: 'grok', nombre: 'Grok (xAI)', logoText: 'G', logoBg: '#E8EAED', logoTxt: '#0F172A', desc: 'Motor de IA de xAI para respuestas y generación de contenido, con tu propia clave.', estado: 'disponible', esIA: true, campos: [{ key: 'apiKey', label: 'API Key de xAI', placeholder: 'xai-…', secreto: true }] },
  { id: 'dropi', nombre: 'Dropi', logoText: 'Dr', logoBg: '#FEF3C7', logoTxt: '#B45309', desc: 'Envía tus pedidos a Dropi: genera la guía, asigna transportadora y sincroniza el estado del envío.', estado: 'disponible', campos: [{ key: 'token', label: 'Token de la API de Dropi', secreto: true }] },
  { id: 'effi', nombre: 'Effi ERP', logoText: 'Ef', logoBg: '#EDE9FE', logoTxt: '#6D28D9', desc: 'Sincroniza inventario, pedidos y facturación con tu ERP Effi.', estado: 'disponible', campos: [{ key: 'url', label: 'URL de tu Effi', placeholder: 'https://mi-empresa.effi.co' }, { key: 'apiKey', label: 'API Key', secreto: true }] },
  { id: 'mastershop', nombre: 'Master Shop', logoText: 'MS', logoBg: '#FEF2E7', logoTxt: '#C2410C', desc: 'Conecta tu tienda Master Shop para sincronizar catálogo y pedidos.', estado: 'disponible', campos: [{ key: 'apiKey', label: 'API Key de Master Shop', secreto: true }] },
  { id: 'shopify', nombre: 'Shopify', logoText: 'Sh', logoBg: '#EAF3E0', logoTxt: '#5E8E3E', desc: 'Sincroniza tu catálogo y tus pedidos con tu tienda Shopify.', estado: 'disponible', campos: [{ key: 'dominio', label: 'Dominio de la tienda', placeholder: 'mitienda.myshopify.com' }, { key: 'accessToken', label: 'Access Token', secreto: true }] },
  { id: 'ig', nombre: 'Instagram DM', logoText: 'IG', logoBg: '#FCE7F3', logoTxt: '#BE185D', desc: 'Guarda tu token para que el asistente también responda los directos de Instagram.', estado: 'disponible', campos: [{ key: 'accessToken', label: 'Access Token de Instagram', secreto: true }] },
  { id: 'mp', nombre: 'Mercado Pago', logoText: 'MP', logoBg: '#E0F2FE', logoTxt: '#0284C7', desc: 'Cobra con link de pago y confirma pedidos automáticamente al recibir el pago.', estado: 'disponible', campos: [{ key: 'publicKey', label: 'Public Key' }, { key: 'accessToken', label: 'Access Token', secreto: true }] },
];

export const PLANS: Plan[] = [
  { id: 1, nombre: 'Inicio', precio: 49900, cuentas: 52, features: ['1 número de WhatsApp', 'Hasta 100 pedidos al mes', 'Asistente con catálogo y promos'] },
  { id: 2, nombre: 'Crecimiento', precio: 99900, cuentas: 48, features: ['1 número de WhatsApp', 'Pedidos ilimitados', 'Flujos y asignación de chats', 'Integración con Dropi'] },
  { id: 3, nombre: 'Pro', precio: 199900, cuentas: 18, features: ['3 números de WhatsApp', 'Todo lo de Crecimiento', 'Varios usuarios por cuenta', 'Acceso por API'] },
];

export const ACCOUNTS: Account[] = [
  { id: 1, tienda: 'Luna Accesorios', correo: 'karla@lunaaccesorios.co', plan: 'Crecimiento', ventas: 8200000, activa: true },
  { id: 2, tienda: 'Moda Urbana MDE', correo: 'hola@modaurbana.co', plan: 'Pro', ventas: 21400000, activa: true },
  { id: 3, tienda: 'Dulce Hogar', correo: 'ventas@dulcehogar.com.co', plan: 'Inicio', ventas: 3100000, activa: true },
  { id: 4, tienda: 'TecnoCel Cali', correo: 'tecnocel@gmail.com', plan: 'Crecimiento', ventas: 0, activa: false },
  { id: 5, tienda: 'Variedades Sara', correo: 'sara.variedades@gmail.com', plan: 'Inicio', ventas: 1900000, activa: true },
];

export const WEBHOOK_URL = 'https://panel.dealflow.co/webhooks/whatsapp';
export const WA_CODE = 'dealflow-verify';
export const WA_NUMBER = '+57 300 123 4567';
