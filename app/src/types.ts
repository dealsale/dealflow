export type EstadoPedido = 'Nuevo' | 'Confirmado' | 'Empacado' | 'Despachado' | 'Entregado';

export interface OrderItem {
  qty: number;
  nombre: string;
  precio: number;
}

export interface Order {
  id: string;
  cliente: string;
  ciudad: string;
  tel: string;
  direccion: string;
  estado: EstadoPedido;
  hora: string;
  transportadora: string;
  envio: number;
  nota: string;
  items: OrderItem[];
}

export interface Variante {
  label: string;
  stock: number;
  fotos?: number;
}

export interface Product {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
  color: string;
  txt: string;
  regla: string;
  fotos?: string[];
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
}

export type Etapa = 'Explorando' | 'Cotizando' | 'Listo para comprar' | 'Postventa';

export interface Lead {
  id: number;
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
  id: number;
  nombre: string;
  precio: number;
  cuentas: number;
  features: string[];
}

export interface Account {
  id: number;
  tienda: string;
  correo: string;
  plan: string;
  ventas: number;
  activa: boolean;
}

export type VendedorSection =
  | 'resumen'
  | 'productos'
  | 'promos'
  | 'asistente'
  | 'whatsapp'
  | 'pedidos'
  | 'leads'
  | 'crm'
  | 'integraciones';

export type AdminSection = 'ventas' | 'planes' | 'cuentas';

export type Mode = 'vendedor' | 'admin';
