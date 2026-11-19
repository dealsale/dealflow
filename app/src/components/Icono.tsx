import { useId } from 'react';
import type { CSSProperties } from 'react';
import {
  Pencil, Trash2, Truck, Package, PackageCheck, PackageX, ReceiptText, MapPin, Store, TriangleAlert, CircleCheck, CircleX,
  Clock, MessageCircle, Phone, ShoppingBag, ShoppingCart, Megaphone, Image, Sparkles, Lock, Search, Copy, Link2,
  Bell, Tag, Camera, Video, FileText, Download, Upload, RefreshCw, Eye, Settings, Users, BarChart3, Gift, Zap,
  CreditCard, Globe, Target, Paperclip, Handshake, Plus, X, Check, ArrowRight, Undo2, Send, Bot, Wallet, Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Íconos de DealFlow: un solo estilo (líneas redondeadas del mismo grosor) en lugar de emojis, que
 * se ven distintos en cada celular. Por defecto toman el color del texto (se adaptan al tema claro y
 * oscuro); con `degradado` llevan el degradado de marca verde → azul → violeta.
 */
export const ICONOS = {
  // Pedidos
  editar: Pencil, eliminar: Trash2, copiar: Copy, enlace: Link2, ver: Eye, buscar: Search, agregar: Plus, cerrar: X,
  // Envíos y logística
  despachar: Truck, paquete: Package, entregado: PackageCheck, devuelto: PackageX, guia: ReceiptText, ubicacion: MapPin,
  oficina: Building2, novedad: TriangleAlert, pendiente: Clock, devolver: Undo2,
  // Estados
  ok: CircleCheck, error: CircleX, alerta: TriangleAlert, listo: Check, siguiente: ArrowRight, actualizar: RefreshCw,
  // Ventas y chats
  chat: MessageCircle, llamar: Phone, enviar: Send, bot: Bot, tienda: Store, bolsa: ShoppingBag, carrito: ShoppingCart,
  campana: Megaphone, objetivo: Target, regalo: Gift, rapido: Zap, etiqueta: Tag, aliado: Handshake, pago: CreditCard, billetera: Wallet,
  // Contenido
  imagen: Image, foto: Camera, video: Video, documento: FileText, adjunto: Paperclip, descargar: Download, subir: Upload, ia: Sparkles,
  // Cuenta y ajustes
  candado: Lock, notificacion: Bell, ajustes: Settings, equipo: Users, estadisticas: BarChart3, web: Globe,
} satisfies Record<string, LucideIcon>;
export type NombreIcono = keyof typeof ICONOS;

export function Icono({ nombre, tam = 18, degradado = false, color, grosor = 2, style, titulo }: {
  nombre: NombreIcono; tam?: number; degradado?: boolean; color?: string; grosor?: number; style?: CSSProperties; titulo?: string;
}) {
  const Svg = ICONOS[nombre];
  const id = `df-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg size={tam} strokeWidth={grosor} stroke={degradado ? `url(#${id})` : color || 'currentColor'}
      aria-hidden={titulo ? undefined : true} aria-label={titulo} role={titulo ? 'img' : undefined}
      style={{ flexShrink: 0, verticalAlign: '-0.15em', ...style }}>
      {degradado && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#10B981" />
            <stop offset="0.5" stopColor="#2E8BFF" />
            <stop offset="1" stopColor="#7658FF" />
          </linearGradient>
        </defs>
      )}
    </Svg>
  );
}
