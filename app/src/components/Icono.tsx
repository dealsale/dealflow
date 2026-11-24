import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Pencil, Trash2, Truck, Package, PackageCheck, PackageX, ReceiptText, MapPin, Store, TriangleAlert, CircleCheck, CircleX,
  Clock, MessageCircle, Phone, ShoppingBag, ShoppingCart, Megaphone, Image, Sparkles, Lock, Search, Copy, Link2,
  Bell, Tag, Camera, Video, FileText, Download, Upload, RefreshCw, Eye, Settings, Users, BarChart3, Gift, Zap,
  CreditCard, Globe, Target, Paperclip, Handshake, Plus, X, Check, ArrowRight, Undo2, Send, Bot, Wallet, Building2,
  User, Calendar, Mountain, Building, House, BellOff, Warehouse, Puzzle, Repeat2, StickyNote, Mail,
  MessageSquareText, UsersRound, Headset, Route, Cloud, Clapperboard, TicketPercent, GraduationCap,
  Stethoscope, PenLine, Mic, Ban,
  Bike, Banknote, Lightbulb, Rocket, Pause, PartyPopper, FlaskConical, Palette,
  Drama, ShieldCheck, Smile, Briefcase, Brain, Sprout, Scale, Flame, RefreshCcw, Clock3, CircleHelp, HandHelping, Languages,
  EyeOff, DatabaseBackup, History, Laptop, Vibrate, PhoneOutgoing, Plug, RadioTower, Compass,
  MousePointer2, Hand, MicOff, ScreenShare, Square, Volume2,
  BookOpen, Library, Code, Smartphone, Monitor,
  Info, Trophy, Sun, Scissors,
  Folder, KeyRound, Coffee, Film, Contact, Dices, Siren, Star, MonitorDown,
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
  // Datos del cliente y pedidos
  usuario: User, calendario: Calendar, departamento: Mountain, ciudad: Building, casa: House, silenciado: BellOff,
  bodega: Warehouse, variante: Puzzle, repetido: Repeat2, nota: StickyNote, correo: Mail,
  // Menú de administración
  plantillas: MessageSquareText, equipoDF: UsersRound, soporte: Headset, ruta: Route, nube: Cloud, estudio: Clapperboard,
  cupon: TicketPercent, tutoriales: GraduationCap,
  // Inbox
  registro: Stethoscope, escribiendo: PenLine, microfono: Mic, bloquear: Ban,
  // Logística y Marketing
  moto: Bike, dinero: Banknote, idea: Lightbulb, cohete: Rocket, pausa: Pause, fiesta: PartyPopper, experimento: FlaskConical, paleta: Palette,
  // Asistente
  personalidad: Drama, escudo: ShieldCheck, sonrisa: Smile, maletin: Briefcase, cerebro: Brain, brote: Sprout, balanza: Scale,
  fuego: Flame, cambio: RefreshCcw, reloj: Clock3, pregunta: CircleHelp, ayudaHumana: HandHelping, idiomas: Languages,
  // Administración
  oculto: EyeOff, respaldo: DatabaseBackup, historial: History, computador: Laptop, timbre: Vibrate, llamarSaliente: PhoneOutgoing,
  api: Plug, antena: RadioTower, brujula: Compass,
  // Llamadas de soporte
  puntero: MousePointer2, soltar: Hand, silenciarMic: MicOff, compartirPantalla: ScreenShare, detener: Square, altavoz: Volume2,
  // Tienda en línea
  libro: BookOpen, biblioteca: Library, codigo: Code, celular: Smartphone, pantalla: Monitor,
  // Anuncios
  info: Info, trofeo: Trophy, sol: Sun, tijera: Scissors,
  // Varios
  carpeta: Folder, llave: KeyRound, cafe: Coffee, pelicula: Film, contacto: Contact, dados: Dices, sirena: Siren, estrella: Star, instalar: MonitorDown,
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

/** Ícono pequeño dentro de un texto o botón (toma el color del texto y deja un espacio a la derecha). */
export function IcoTexto({ n, tam = 14, color, degradado }: { n: NombreIcono; tam?: number; color?: string; degradado?: boolean }) {
  return <Icono nombre={n} tam={tam} color={color} degradado={degradado} style={{ marginRight: 5, verticalAlign: '-0.18em' }} />;
}

/** Punto de color para estados (en línea, conectado, gravedad…), en vez de los emojis 🟢 ⚪ 🔴. */
export function Punto({ color, tam = 8 }: { color: string; tam?: number }) {
  return <span aria-hidden style={{ display: 'inline-block', width: tam, height: tam, borderRadius: '50%', background: color, marginRight: 6, verticalAlign: 'middle', flexShrink: 0 }} />;
}

/** Ícono de color con un brillo suave (como los del menú lateral), para menús de opciones. */
export function IconoColor({ color, children }: { color: string; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', width: 18, justifyContent: 'center', flexShrink: 0, color, filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 40%, transparent))` }}>{children}</span>;
}
