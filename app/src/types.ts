export type EstadoPedido = 'Nuevo' | 'Confirmado' | 'Empacado' | 'Despachado' | 'Entregado';

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
  transportadora: string;
  /** Número de guía generado al enviar el pedido a Dropi */
  guia?: string;
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

export type BloqueTipo = 'texto' | 'imagen' | 'video';

/** Un bloque del mensaje inicial: texto, o una imagen/video como data URL. */
export interface MensajeBloque {
  tipo: BloqueTipo;
  valor: string;
}

export interface Product {
  id: number | string;
  nombre: string;
  precio: number;
  stock: number;
  color: string;
  txt: string;
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
  /** Mensaje inicial como construcción de bloques (texto/imagen/video) */
  mensajeBloques?: MensajeBloque[];
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
  de: MensajeDe;
  texto: string;
  hora: string;
  tipo?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaNombre?: string | null;
}

export type Etapa = 'Explorando' | 'Cotizando' | 'Listo para comprar' | 'Postventa';

export interface Lead {
  id: number | string;
  nombre: string;
  tel: string;
  ultimo: string;
  hora: string;
  etapa: Etapa;
  asignado: string;
  mensajes: Mensaje[];
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
}

export type VendedorSection =
  | 'resumen'
  | 'productos'
  | 'asistente'
  | 'whatsapp'
  | 'pedidos'
  | 'leads'
  | 'crm'
  | 'equipo'
  | 'marketing'
  | 'integraciones';

export type AdminSection = 'ventas' | 'planes' | 'cuentas';

export type Mode = 'vendedor' | 'admin';
