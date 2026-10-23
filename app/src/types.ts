export type EstadoPedido = 'Nuevo' | 'Confirmado' | 'Guía generada' | 'En tránsito' | 'En reparto' | 'Novedad' | 'Entregado' | 'Devuelto' | 'Cancelado';

export interface OrderItem {
  qty: number;
  nombre: string;
  precio: number;
}

export interface Order {
  id: string;
  /** id de la fila en el servidor (para avanzar estado / Dropi en modo API) */
  rowId?: string;
  cliente: string;
  ciudad: string;
  tel: string;
  direccion: string;
  estado: EstadoPedido;
  hora: string;
  /** Fecha del pedido en Bogotá (YYYY-MM-DD), para métricas de hoy/ayer. */
  fecha?: string;
  departamento?: string;
  transportadora: string;
  /** Número de guía generado al enviar el pedido a Dropi */
  guia?: string;
  /** id del pedido en WooCommerce (si ya se despachó) */
  wooId?: string;
  /** id de la orden en Dropi (despacho por API directa) */
  dropiOrderId?: string;
  /** PDF de la guía (Dropi API o subido) */
  guiaUrl?: string;
  /** imagen de la guía (para mandarla por WhatsApp) */
  guiaImg?: string;
  /** la guía ya se creó en Effi (aunque la transportadora no haya asignado el número) */
  effiGuiaCreada?: boolean;
  /** proveedor por el que se despachó: 'dropi' | 'effi' */
  despachoProveedor?: string;
  /** último estado leído del WooCommerce del proveedor (Effi/Dropi) */
  estadoWoo?: string;
  /** remisión de venta creada en Effi por API (ej. PPAL-270) */
  effiRemision?: string;
  /** novedad de envío de la transportadora (Effi), la más reciente */
  novedad?: import('./lib/api').NovedadPedido | null;
  /** devolución de venta registrada en Effi (ej. DV-12) */
  effiDevolucion?: string;
  /** Pedidos de Shopify: '' | 'esperando' | 'si' | 'no' (confirmación por WhatsApp). */
  confirmacion?: string;
  shopifyEnviado?: boolean;
  /** canal del que vino: whatsapp | instagram | messenger | shopify | web | manual */
  origen?: string;
  /** Chat del que vino el pedido (Inbox). */
  leadId?: string;
  /** Id de la guía en Effi (p. ej. GT-12), aunque la transportadora aún no dé el número. */
  effiGuiaTx?: string;
  /** Resultado del último aviso de la guía al cliente. */
  guiaAviso?: { ok: boolean; chat: string; contacto: string; con: string; detalle: string; at: string } | null;
  envio: number;
  nota: string;
  /** Total del pedido acordado por el asistente (si no hay precios por ítem) */
  total?: number;
  items: OrderItem[];
}

export interface Variante {
  id?: string;
  label: string;
  stock: number;
  fotos?: number;
  /** Fotos subidas por el vendedor, como data URLs */
  fotosSubidas?: string[];
  /** SKU/código legado de esta variante (fallback para el despacho). */
  sku?: string;
  /** Referencia por integración: { dropi, effi, shopify }. Un producto puede estar en varias. */
  refs?: Record<string, string>;
}

export interface FaqItem {
  pregunta: string;
  respuesta: string;
}

/** Un valor de opción, con foto propia opcional (ej: { valor: 'Blanco', foto: '/api/media/…' }) */
export interface OpcionValor {
  valor: string;
  foto?: string;
}
/** Un grupo de opciones del producto, ej: { nombre: 'Color', valores: [{valor:'Negro'}, ...] } */
export interface Opcion {
  nombre: string;
  valores: OpcionValor[];
}

/** Un combo/bundle del producto: llevar N por un precio especial. */
export interface Bundle {
  cantidad: number;
  precio: number;
  etiqueta?: string;
}

export type BloqueTipo = 'texto' | 'imagen' | 'video' | 'audio';

/**
 * Un bloque del mensaje inicial. Un bloque de texto trae `valor`; uno de
 * imagen/video puede traer VARIAS piezas en `valores` (varias imágenes en el
 * mismo bloque de imagen, varios videos en el de video). `valor` se conserva
 * para bloques antiguos de una sola pieza.
 */
export interface MensajeBloque {
  tipo: BloqueTipo;
  valor?: string;
  valores?: string[];
}

export interface MensajeInicialVar { id: string; nombre: string; activo: boolean; bloques: MensajeBloque[] }

export interface Product {
  id: number | string;
  nombre: string;
  precio: number;
  stock: number;
  color: string;
  txt: string;
  tipo?: 'producto' | 'servicio';
  duracion?: string;
  /** SKU para mapear con WooCommerce/Effi */
  sku?: string;
  /** Por cuál se despacha: 'dropi' | 'effi' | '' (sin definir, se muestran las dos integraciones). */
  despachoProveedor?: string;
  /** 'dropi' = las variantes las define Dropi (se sincronizan desde su ID), no las opciones. */
  variantesFuente?: string;
  /** Producto de biblioteca gratuito: estructura bloqueada (solo precio/SKU editables). */
  bloqueado?: boolean;
  reglas: string[];
  descripcion?: string;
  caracteristicas?: string;
  mensajeInicial?: string;
  faqs?: FaqItem[];
  /** Capturas de testimonios de clientes, como data URLs */
  testimonios?: string[];
  modosUso?: string;
  /** Videos del producto, como data URLs */
  videos?: string[];
  /** Mensaje inicial como construcción de bloques (texto/imagen/video). Es el
   *  que se está editando: el de `mensajes[mensajeSel]`. */
  mensajeBloques?: MensajeBloque[];
  /** Todos los mensajes iniciales del producto (varios encendidos → se envían al azar). */
  mensajes?: MensajeInicialVar[];
  /** Índice del mensaje que se edita en el panel (solo UI). */
  mensajeSel?: number;
  /** Combos/bundles: llevar N por un precio especial */
  bundles?: Bundle[];
  /** Grupos de opciones: Color (negro, azul…), Talla (S, M, L…) */
  opciones?: Opcion[];
  /** Qué trae el paquete (texto que usa el asistente) */
  contenidoPaquete?: string;
  /** Frase que dispara el envío del mensaje inicial (ej: "Me interesan los Bota recta ámbar") */
  disparador?: string;
  /** Si el mensaje inicial (estructura completa) está encendido para este producto */
  mensajeInicialActivo?: boolean;
  fotos?: string[];
  /** Fotos principales subidas por el vendedor, como data URLs */
  fotosSubidas?: string[];
  variantes: Variante[];
}

export type PromoTipo = 'Promoción' | 'Combo';

export interface Promo {
  id: number;
  tipo: PromoTipo;
  titulo: string;
  desc: string;
  vigencia: string;
  activa: boolean;
}

export type MensajeDe = 'cliente' | 'bot' | 'vendedor';

export interface Mensaje {
  id?: string;
  de: MensajeDe;
  texto: string;
  hora: string;
  createdAt?: string;
  /** Estado de entrega (salientes Cloud API): '' | enviado | entregado | visto | fallido. */
  estado?: string;
  /** Motivo del fallo de entrega (explicado), si Meta lo rechazó. */
  error?: string;
  tipo?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaNombre?: string | null;
  /** Respuesta citada: instantánea del mensaje al que responde el cliente. */
  citaTexto?: string;
  citaDe?: string;
}

export type Etapa = 'Explorando' | 'Cotizando' | 'Listo para comprar' | 'Postventa';

export interface Lead {
  id: number | string;
  nombre: string;
  tel: string;
  ultimo: string;
  hora: string;
  /** ISO (UTC) del último mensaje, para mostrar/filtrar por fecha. */
  ultimoIso?: string;
  etapa: Etapa;
  asignado: string;
  etiqueta?: string;
  /** Canal de la conversación: whatsapp (default) o web. */
  ventana24h?: boolean;
  ultClienteIso?: string | null;
  canal?: string;
  /** Nota interna del equipo sobre este chat (nunca la ve el cliente). */
  notaInterna?: string;
  /** Anuncio del que llegó el chat (atribución de campaña); null si es orgánico. */
  anuncio?: Anuncio | null;
  /** El cliente aceptó recibir promociones (opt-in): habilita el remarketing. */
  promosOptin?: boolean;
  /** Mensajes seguidos del cliente al final (lo calcula el servidor en modo resumen). */
  sinResponder?: number;
  mensajes: Mensaje[];
}

/** Anuncio del que vino un chat (pauta Click-to-WhatsApp / Messenger / Instagram). */
export interface Anuncio {
  id: string;
  titular: string;
  texto: string;
  media: string;
  mediaTipo: string;
  url: string;
  canal: string;
  ts: string;
}

export type IntegrationEstado = 'conectado' | 'pronto' | 'disponible';

export interface Integration {
  id: string;
  nombre: string;
  logoText: string;
  logoBg: string;
  logoTxt: string;
  desc: string;
  estado: IntegrationEstado;
  /** Campos que pide el formulario de configuración (API keys, tokens, IDs…). */
  campos?: { key: string; label: string; placeholder?: string; secreto?: boolean }[];
  /** true si es un proveedor de IA que puede ser el agente predeterminado. */
  esIA?: boolean;
  /** Grupo para agrupar las tarjetas en la sección. */
  grupo?: 'ia' | 'canales' | 'envios' | 'publicidad';
  /** true si se conecta por un flujo especial (popup de Facebook), no por formulario. */
  especial?: 'meta-ads';
}

export interface Plan {
  id: number | string;
  nombre: string;
  precio: number;
  cuentas: number;
  features: string[];
}

export interface Account {
  id: number | string;
  tienda: string;
  correo: string;
  plan: string;
  ventas: number;
  activa: boolean;
  planEstado?: string;
  planVence?: string | null;
  creditos?: number;
  temaPremium?: boolean;
  oculta?: boolean;
}

export type VendedorSection =
  | 'resumen'
  | 'estadisticas'
  | 'productos'
  | 'asistente'
  | 'whatsapp'
  | 'logistica'
  | 'pedidos'
  | 'leads'
  | 'crm'
  | 'equipo'
  | 'marketing'
  | 'dealshop'
  | 'biblioteca'
  | 'integraciones';

export type AdminSection = 'ventas' | 'planes' | 'cuentas' | 'cupones' | 'superadmin' | 'biblioteca' | 'plantillas' | 'trazabilidad';

/** Etiquetas de conversación en el CRM. '' = sin etiqueta. */
export const ETIQUETAS_CRM = ['Seguimiento', 'Venta', 'Garantía', 'Reclamo', 'Mayorista', 'Postventa'] as const;
export const COLOR_ETIQUETA: Record<string, { bg: string; color: string }> = {
  Seguimiento: { bg: 'var(--df-info-subtle)', color: 'var(--df-info)' },
  Venta: { bg: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)' },
  'Garantía': { bg: 'var(--df-warning-subtle)', color: 'var(--df-warning)' },
  Reclamo: { bg: 'var(--df-danger-subtle-2)', color: 'var(--df-danger-dark)' },
  Mayorista: { bg: 'var(--df-purple-subtle)', color: 'var(--df-purple)' },
  Postventa: { bg: 'var(--df-indigo-subtle)', color: 'var(--df-indigo)' },
};

export type Mode = 'vendedor' | 'admin';
