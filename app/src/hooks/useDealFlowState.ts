import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ACCOUNTS,
  ASSISTANT_TEXT_DEFAULT,
  INTEGRATIONS,
  LEADS,
  ORDERS,
  PLANS,
  PROMOS,
  PRODUCTS,
  RULES_DEFAULT,
  WA_CODE,
  WEBHOOK_URL,
} from '../data';
import { comprimirImagen, readFilesAsDataUrls } from '../components/PhotoUpload';
import {
  apiAddVariant,
  apiAdminOverview,
  apiCreatePlan,
  apiCreateProduct,
  apiDeleteProduct,
  apiDeleteVariant,
  apiPatchProduct,
  apiPatchVariant,
  apiPutAssistant,
  apiCreateStore,
  apiLeadsResumen,
  apiLeadMensajes,
  apiLogin,
  apiLogout,
  apiMe,
  apiUpdateMe,
  apiUploadAvatar,
  apiChangePassword,
  apiDeleteLead,
  apiResetLead,
  apiEnviarFlujoInicial,
  apiFlows,
  apiCrearFlujo,
  apiActualizarFlujo,
  apiEliminarFlujo,
  apiEnviarFlujoRemarketing,
  apiExtraerPedido,
  apiActualizarPedido,
  apiSendLeadMedia,
  apiSendLeadMessage,
  apiState,
  apiUpload,
  apiOrders,
  apiOrderAdvance,
  apiOrderEstado,
  apiCrearPedido,
  apiOrderDropi,
  apiOrderDespachar,
  apiOrderDespacharSync,
  apiWooProveedores,
  apiWooPreferido,
  apiWooVerificar,
  apiWooSyncInventario,
  apiWooSyncProductos,
  apiTeamList,
  apiTeamCreate,
  apiTeamDelete,
  apiCampanas,
  apiCampana,
  apiCrearCampana,
  apiGuardarCampana,
  apiBorrarCampana,
  apiCampanaProducto,
  apiCampanaCreativos,
  apiCampanaTextos,
  apiAdsConectar,
  apiMetaEstado,
  apiMetaConectar,
  apiMetaDesconectar,
  apiAdsSeleccionar,
  apiAdsDesconectar,
  apiPublicarCampana,
  apiCreditos,
  apiRecargarCreditos,
  apiDarCreditos,
  apiPlantillas,
  apiInstalarPlantilla,
  apiDesinstalarPlantilla,
  apiMisTiendas,
  apiCambiarTienda,
  apiCrearTienda,
  apiToggleStore,
  apiTogglePremiumTema,
  apiUpdateStore,
  apiDeleteStore,
  apiStoreDetalle,
  apiSyncWhatsapp,
  apiIntervenirTodos,
  apiStats,
  apiImpersonate,
  apiOnboardingTienda,
  apiEntrarBiblioteca,
  apiStopImpersonate,
  apiUpdatePlan,
  apiDeletePlan,
  apiWaLinkCloud,
  apiWaQrStart,
  apiWaQrStatus,
  apiWaUnlink,
  apiWaEmbedded,
  apiWaEstado,
  apiSetLeadEtiqueta,
  apiSetLeadAsignado,
  apiSetLeadNotaInterna,
  apiSuperStores,
  apiToggleHideStore,
  apiLogs,
  apiClearLogs,
  apiPushVapid,
  apiPushSubscribe,
  apiPushUnsubscribe,
  apiReenviarMensaje,
  apiBiblioteca,
  apiImportarBiblioteca,
  apiCheckoutBiblioteca,
  apiSuperBiblioteca,
  apiSuperStoreProducts,
  apiSuperBibliotecaFromProduct,
  apiSuperBibliotecaPatch,
  apiSuperBibliotecaDelete,
  apiIntegraciones,
  apiGuardarIntegracion,
  apiEliminarIntegracion,
  apiSetIaPredeterminada,
  apiCheckoutSuscripcion,
  apiExtenderSuscripcion,
  apiSuscripcion,
  apiPlanes,
  apiRegistro,
  apiValidarCupon,
  apiVerificarPago,
  apiCupones,
  apiCrearCupon,
  apiToggleCupon,
  apiEliminarCupon,
} from '../lib/api';
import type { ApiLead, ApiOrder, ApiProduct, Plantilla, TeamMember, AdminStoreDetalle, SuperStore, Campana, Brief, CopysAnuncio, CuentaAds, OpcionesAds, Suscripcion, PlanPublico, Cupon, NuevoCupon, PaqueteCreditos, MovimientoCredito, MiTienda, MetaSignupCfg, EstadoNumero, LibraryItem, LibraryAdminItem, SuperStoreProduct, EventoLog, Estadisticas, PropuestaPedido } from '../lib/api';
import type { Flujo } from '../types';
import { fmt } from '../lib/format';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '../lib/persist';
import { playOrderChime } from '../lib/sound';
import { AVATAR_COLORS, ESTADOS, ESTADO_ORDER, ESTADOS_TODOS, ETAPA_CFG, initials, pill, stockPillCfg, swatch } from '../lib/style';
import type {
  Account,
  AdminSection,
  EstadoPedido,
  Integration,
  Lead,
  Mensaje,
  Mode,
  Order,
  OrderItem,
  Plan,
  Product,
  Promo,
  VendedorSection,
} from '../types';
import { COLOR_ETIQUETA, ETIQUETAS_CRM } from '../types';
import type { Bundle, MensajeBloque } from '../types';

/** Piezas de un bloque de imagen/video (normaliza el `valor` antiguo de una sola pieza). */
function mediaDeBloque(b: MensajeBloque): string[] {
  if (Array.isArray(b.valores) && b.valores.length) return b.valores;
  return b.valor ? [b.valor] : [];
}

/**
 * Imagen de previsualización de un producto: la primera foto principal; si no
 * hay, la primera imagen del mensaje inicial; si no, la primera foto de una
 * opción. Devuelve null si el producto no tiene ninguna imagen.
 */
function previewDeProducto(p: Product): string | null {
  const fotos = p.fotosSubidas || [];
  if (fotos.length) return fotos[0];
  for (const b of p.mensajeBloques || []) {
    if (b.tipo === 'imagen') { const m = mediaDeBloque(b); if (m.length) return m[0]; }
  }
  for (const o of p.opciones || []) {
    for (const v of o.valores || []) {
      if (typeof v !== 'string' && v.foto) return v.foto;
    }
  }
  return null;
}

export interface DecoratedOrder extends Order {
  totalFmt: string;
  envioFmt: string;
  /** Fecha legible del pedido ("Hoy", "Ayer", "17 sept 2026"). */
  fechaLabel: string;
  itemsResumen: string;
  itemsDecorated: (OrderItem & { precioFmt: string })[];
  pillStyle: CSSProperties;
  hasNext: boolean;
  isDone: boolean;
  advanceLabel: string;
  hasNota: boolean;
  hasGuia: boolean;
  advance: () => void;
  setEstado: (estado: EstadoPedido) => void;
  estadosDisponibles: EstadoPedido[];
  open: () => void;
  sendToDropi: () => void;
  despachar: (proveedor: 'dropi' | 'effi') => void;
  reenviarDespacho: (proveedor: 'dropi' | 'effi') => void;
  sincronizarEffi: () => void;
  despachado: boolean;
  despachoProveedor: string;
  timeline: { estado: string; dotStyle: CSSProperties; labelStyle: CSSProperties }[];
}

export interface DecoratedMensaje extends Mensaje {
  rowStyle: CSSProperties;
  bubbleStyle: CSSProperties;
  horaStyle: CSSProperties;
  /** Fecha (YYYY-MM-DD, Bogotá) del mensaje; vacío si no hay timestamp. */
  fecha: string;
  /** Etiqueta legible de la fecha para separadores ("Hoy", "Ayer", "10 sept 2026"). */
  fechaEtiqueta: string;
  /** Indicador de estado del mensaje saliente (✓ / ✓✓ / visto / falló); null si no aplica. */
  estadoInfo: { texto: string; color: string; titulo: string } | null;
}

/** Usuario con sesión activa (dueño, agente, admin o superadmin). */
export interface SessionUser {
  nombre: string;
  email: string;
  role: 'vendedor' | 'admin' | 'superadmin';
  esDueno?: boolean;
  impersonando?: boolean;
  tiendaNombre?: string;
  /** Foto de perfil (URL), opcional. */
  foto?: string;
}

export interface DecoratedLead extends Lead {
  iniciales: string;
  avatarStyle: CSSProperties;
  etapaStyle: CSSProperties;
  etiquetaStyle: CSSProperties | null;
  rowStyle: CSSProperties;
  select: () => void;
  mensajesDecorated: DecoratedMensaje[];
}

export interface DecoratedCrmChat extends DecoratedLead {
  live: boolean;
  liveLabel: string;
  liveStyle: CSSProperties;
  liveDot: CSSProperties;
  crmRowStyle: CSSProperties;
  /** Fecha (YYYY-MM-DD, Bogotá) del último mensaje, para filtrar por fechas. */
  fechaISO: string;
  /** Lo que se muestra a la derecha del nombre: hora si es hoy, si no la fecha. */
  fechaHoraLabel: string;
  /** Mensajes del cliente sin responder al final del chat (badge tipo WhatsApp). */
  sinResponder: number;
}

export interface DecoratedVariante {
  label: string;
  swatchStyle: CSSProperties;
  labelStyle: CSSProperties;
  stockPill: CSSProperties;
  stockLabel: string;
  fotosLabel: string;
  thumbs: CSSProperties[];
  uploaded: string[];
  addFotos: (files: File[]) => void;
  removeFoto: (index: number) => void;
  stock: number;
  incStock: () => void;
  decStock: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
}

export interface DecoratedProduct extends Product {
  iniciales: string;
  fotoStyle: CSSProperties;
  previewImg: string | null;
  precioFmt: string;
  variantesLabel: string;
  stockLabel: string;
  stockPill: CSSProperties;
  expanded: boolean;
  chevron: string;
  toggle: () => void;
  fotosMain: { label: string; tileStyle: CSSProperties }[];
  uploadedMain: string[];
  addMainFotos: (files: File[]) => void;
  removeMainFoto: (index: number) => void;
  reglasDecoradas: { texto: string; remove: () => void; editar: (nuevo: string) => void }[];
  addRegla: () => void;
  save: () => void;
  saved: boolean;
  addVariante: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
  setNombre: (v: string) => void;
  setPrecio: (v: string) => void;
  setSku: (v: string) => void;
  setTipo: (v: 'producto' | 'servicio') => void;
  setDuracion: (v: string) => void;
  setDescripcion: (v: string) => void;
  setCaracteristicas: (v: string) => void;
  setMensajeInicial: (v: string) => void;
  setModosUso: (v: string) => void;
  faqsDecoradas: { pregunta: string; respuesta: string; remove: () => void; editar: (campo: 'pregunta' | 'respuesta', valor: string) => void }[];
  addFaq: () => void;
  testimoniosList: string[];
  addTestimonios: (files: File[]) => void;
  removeTestimonio: (index: number) => void;
  videosList: string[];
  addVideos: (files: File[]) => void;
  removeVideo: (index: number) => void;
  bloquesDecorados: (MensajeBloque & {
    mediaLista: string[];
    remove: () => void;
    editText: (valor: string) => void;
    duplicate: () => void;
    addMedia: (files: File[]) => void;
    removeMedia: (mediaIndex: number) => void;
    moverMedia: (from: number, to: number) => void;
  })[];
  moverBloque: (from: number, to: number) => void;
  addBloqueTexto: () => void;
  addBloqueImagen: (files: File[]) => void;
  addBloqueVideo: (files: File[]) => void;
  addBloqueAudio: (files: File[]) => void;
  bundlesDecorados: (Bundle & { precioFmt: string; remove: () => void })[];
  addBundle: () => void;
  opcionesDecoradas: {
    nombre: string;
    valores: { valor: string; foto?: string }[];
    addValor: (v: string) => void;
    removeValor: (i: number) => void;
    setValorFoto: (i: number, files: File[]) => void;
    removeValorFoto: (i: number) => void;
    remove: () => void;
  }[];
  addOpcion: (nombre: string) => void;
  setContenidoPaquete: (v: string) => void;
  setDisparador: (v: string) => void;
  toggleMensajeInicial: () => void;
  variantesDecorated: DecoratedVariante[];
}

export interface DecoratedPromo extends Promo {
  badgeStyle: CSSProperties;
  estadoLabel: string;
  estadoStyle: CSSProperties;
  toggle: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
}

export interface DecoratedIntegration extends Integration {
  logoStyle: CSSProperties;
  badgeLabel: string;
  badgeStyle: CSSProperties;
  btnLabel: string;
  btnStyle: CSSProperties;
  action: () => void;
}

export interface DecoratedPlan extends Plan {
  precioFmt: string;
  cuentasLabel: string;
}

export interface DecoratedAccount extends Account {
  ventasFmt: string;
  estadoLabel: string;
  estadoStyle: CSSProperties;
  switchStyle: CSSProperties;
  knobStyle: CSSProperties;
  toggle: () => void;
  togglePremium: () => void;
  /** Columna de facturación: fecha de vencimiento + cuántos días faltan (o pasaron). */
  facturacionFecha: string;
  facturacionDias: string;
  facturacionColor: string;
}

export interface OrderFilterOption {
  key: string;
  label: string;
  count: number;
  active: boolean;
  set: () => void;
}

const CLIENTES_ENTRANTES = [
  { cliente: 'Camila Duarte', ciudad: 'Bogotá', tel: '+57 312 884 2210', direccion: 'Cl 63 # 11-24, apto 501' },
  { cliente: 'Andrés Felipe Gil', ciudad: 'Medellín', tel: '+57 300 218 7743', direccion: 'Cra 43A # 1-50, Torre 1' },
  { cliente: 'Luisa Cárdenas', ciudad: 'Cali', tel: '+57 316 405 9912', direccion: 'Cl 5 # 38-25' },
  { cliente: 'Óscar Peña', ciudad: 'Cartagena', tel: '+57 311 720 5568', direccion: 'Cl 30 # 8B-15' },
  { cliente: 'Natalia Reyes', ciudad: 'Pereira', tel: '+57 313 662 4471', direccion: 'Cra 7 # 21-33' },
  { cliente: 'Felipe Osorio', ciudad: 'Bucaramanga', tel: '+57 315 908 3324', direccion: 'Cl 45 # 27-10' },
];

function generateIncomingOrder(orders: Order[], products: Product[]): Order {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const c = pick(CLIENTES_ENTRANTES);
  const disponibles = products.filter((p) => p.stock > 0);
  const base = disponibles.length ? disponibles : [{ nombre: 'Camiseta oversize algodón', precio: 59900 } as Product];
  const n = Math.random() < 0.35 ? 2 : 1;
  const items: OrderItem[] = [];
  for (let i = 0; i < n; i++) {
    const p = pick(base);
    if (items.some((it) => it.nombre === p.nombre)) continue;
    items.push({ qty: Math.random() < 0.3 ? 2 : 1, nombre: p.nombre, precio: p.precio });
  }
  const maxNum = orders.reduce((m, o) => Math.max(m, parseInt(o.id.replace(/\D/g, ''), 10) || 0), 1000);
  return {
    id: 'DF-' + (maxNum + 1),
    cliente: c.cliente,
    ciudad: c.ciudad,
    tel: c.tel,
    direccion: c.direccion,
    estado: 'Nuevo',
    hora: 'ahora',
    transportadora: 'Dropi',
    envio: pick([9900, 12000, 14000]),
    nota: Math.random() < 0.3 ? 'Pagó por Nequi. Comprobante recibido.' : '',
    items,
  };
}

const ETAPAS_VALIDAS = ['Explorando', 'Cotizando', 'Listo para comprar', 'Postventa'];

function mapApiLeads(leads: ApiLead[]): Lead[] {
  return leads.map((l) => ({
    id: l.id,
    nombre: l.nombre,
    tel: l.tel,
    // En modo resumen el servidor manda ultimo/hora/ultimoIso/sinResponder
    // directamente (sin todos los mensajes). Si no, se derivan del último mensaje.
    ultimo: l.ultimo !== undefined ? l.ultimo : (l.mensajes.length ? l.mensajes[l.mensajes.length - 1].texto : ''),
    hora: l.hora !== undefined ? l.hora : (l.mensajes.length ? l.mensajes[l.mensajes.length - 1].hora : ''),
    ultimoIso: l.ultimoIso !== undefined ? (l.ultimoIso || undefined) : (l.mensajes.length ? l.mensajes[l.mensajes.length - 1].createdAt : undefined),
    sinResponder: l.sinResponder,
    etapa: (ETAPAS_VALIDAS.includes(l.etapa) ? l.etapa : 'Explorando') as Lead['etapa'],
    asignado: l.asignado,
    etiqueta: l.etiqueta || '',
    canal: l.canal || 'whatsapp',
    notaInterna: l.notaInterna || '',
    anuncio: l.anuncio || null,
    mensajes: mapApiMensajes(l.mensajes),
  }));
}

function mapApiMensajes(mensajes: ApiLead['mensajes']): Mensaje[] {
  return mensajes.map((m) => ({
    id: m.id,
    de: (m.de === 'bot' || m.de === 'vendedor' ? m.de : 'cliente') as Mensaje['de'],
    texto: m.texto,
    hora: m.hora,
    createdAt: m.createdAt,
    estado: m.estado,
    tipo: m.tipo,
    mediaUrl: m.mediaUrl,
    mediaMime: m.mediaMime,
    mediaNombre: m.mediaNombre,
  }));
}

const ESTADOS_PEDIDO = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado', 'Cancelado'];
/** Fecha (YYYY-MM-DD) en Bogotá a partir del datetime UTC del servidor. */
function fechaBogota(iso?: string): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (!iso) return hoy;
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  return isNaN(+d) ? hoy : d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Fecha (YYYY-MM-DD) de HOY en Bogotá. */
function hoyBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Etiqueta legible de una fecha: "Hoy", "Ayer" o "10 sept 2026" (Bogotá). */
function etiquetaFecha(iso?: string): string {
  if (!iso) return '';
  const f = fechaBogota(iso);
  const hoy = hoyBogota();
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (f === hoy) return 'Hoy';
  if (f === ayer) return 'Ayer';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  if (isNaN(+d)) return f;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
}

/** Etiqueta legible a partir de una fecha 'YYYY-MM-DD' (Bogotá): "Hoy", "Ayer" o "17 sept 2026". */
function etiquetaFechaYMD(ymd?: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const hoy = hoyBogota();
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (ymd === hoy) return 'Hoy';
  if (ymd === ayer) return 'Ayer';
  // Mediodía UTC para que el formateo no corra la fecha por zona horaria.
  const d = new Date(ymd + 'T12:00:00Z');
  return isNaN(+d) ? ymd : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Indicador de estado de un mensaje SALIENTE (bot/vendedor), estilo WhatsApp:
 * ✓ enviado · ✓✓ entregado · ✓✓ (azul) visto · ⚠ no enviado. Los mensajes del
 * cliente, del chat web o sin estado no muestran nada.
 */
function estadoDeMensaje(m: Mensaje): { texto: string; color: string; titulo: string } | null {
  if (m.de === 'cliente' || !m.estado) return null;
  const vend = m.de === 'vendedor'; // burbuja verde con texto blanco
  const gris = vend ? 'rgba(255,255,255,.85)' : 'var(--df-text-faint)';
  switch (m.estado) {
    case 'enviado': return { texto: '✓', color: gris, titulo: 'Enviado' };
    case 'entregado': return { texto: '✓✓', color: gris, titulo: 'Entregado' };
    case 'visto': return { texto: '✓✓', color: '#38BDF8', titulo: 'Visto' };
    case 'fallido': return { texto: '⚠ no enviado', color: vend ? 'var(--df-danger-border)' : 'var(--df-danger)', titulo: 'No se pudo enviar' };
    default: return null;
  }
}

/** Hora local de Bogotá (HH:MM) a partir del datetime UTC del servidor. */
function horaBogotaDe(iso: string): string {
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  return isNaN(+d)
    ? String(iso).slice(11, 16)
    : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' });
}

function mapApiOrders(items: ApiOrder[]): Order[] {
  return items.map((o) => ({
    id: o.id,
    rowId: o.rowId,
    cliente: o.cliente,
    ciudad: o.ciudad,
    tel: o.tel,
    direccion: o.direccion,
    estado: (ESTADOS_PEDIDO.includes(o.estado) ? o.estado : 'Nuevo') as Order['estado'],
    hora: o.createdAt ? horaBogotaDe(o.createdAt) : 'ahora',
    fecha: fechaBogota(o.createdAt),
    departamento: o.departamento || '',
    transportadora: o.transportadora || 'Dropi',
    guia: o.guia,
    wooId: o.wooId || '',
    despachoProveedor: o.despachoProveedor || '',
    estadoWoo: o.estadoWoo || '',
    envio: o.envio || 0,
    nota: o.nota || '',
    total: o.total || 0,
    items: o.items || [],
  }));
}

function mapApiProducts(items: ApiProduct[]): Product[] {
  return items.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    stock: p.variantes.reduce((a, v) => a + v.stock, 0),
    color: p.color || 'var(--df-indigo-subtle)',
    txt: p.txt || 'var(--df-indigo)',
    tipo: p.tipo || 'producto',
    duracion: p.duracion || '',
    sku: p.sku || '',
    bloqueado: !!p.bloqueado,
    reglas: p.reglas || [],
    descripcion: p.descripcion || '',
    caracteristicas: p.caracteristicas || '',
    mensajeInicial: p.mensajeInicial || '',
    faqs: p.faqs || [],
    testimonios: p.testimonios || [],
    modosUso: p.modosUso || '',
    videos: p.videos || [],
    mensajeBloques: (p.mensajeBloques || []).filter((b): b is MensajeBloque => b.tipo === 'texto' || b.tipo === 'imagen' || b.tipo === 'video' || b.tipo === 'audio'),
    bundles: p.bundles || [],
    opciones: (p.opciones || []).filter((o) => o && typeof o.nombre === 'string' && Array.isArray(o.valores)).map((o) => ({
      nombre: o.nombre,
      valores: o.valores.map((v) => (typeof v === 'string' ? { valor: v } : { valor: v.valor, foto: v.foto })),
    })),
    contenidoPaquete: p.contenidoPaquete || '',
    disparador: p.disparador || '',
    mensajeInicialActivo: p.mensajeInicialActivo !== false,
    fotos: p.fotos?.length ? p.fotos : undefined,
    fotosSubidas: p.fotosSubidas || [],
    variantes: p.variantes.map((v) => ({ id: v.id, label: v.label, stock: v.stock, fotos: v.fotos, fotosSubidas: v.fotosSubidas || [] })),
  }));
}

function navStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 11px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13.5px',
    fontWeight: active ? 600 : 500,
    color: active ? '#fff' : 'var(--df-text-faint)',
    background: active ? 'rgba(5,150,105,.32)' : 'transparent',
  };
}

export function useDealFlowState() {
  // ¿El panel lo sirve el backend real? Lo recordamos en localStorage para saberlo
  // SÍNCRONAMENTE al recargar (apiMode se confirma async y llegaría tarde). Cuando
  // hay backend NO sembramos datos de la demo (ni el snapshot ni los de ejemplo):
  // así al recargar no parpadea una tienda vieja/aleatoria; se muestra vacío hasta
  // que llega /state. El snapshot es solo para el modo demo (sin backend).
  const bootServed = (() => { try { return localStorage.getItem('dealflow:apimode') === '1'; } catch { return false; } })();
  const [snap] = useState(() => (bootServed ? null : loadSnapshot()));
  // Valores iniciales: los de ejemplo en demo, vacíos cuando hay backend real.
  const DEF_ORDERS = bootServed ? [] : ORDERS;
  const DEF_PRODUCTS = bootServed ? [] : PRODUCTS;
  const DEF_PROMOS = bootServed ? [] : PROMOS;
  const DEF_LEADS = bootServed ? [] : LEADS;
  const DEF_PLANS = bootServed ? [] : PLANS;
  const DEF_ACCOUNTS = bootServed ? [] : ACCOUNTS;
  const DEF_ASSISTANT = bootServed ? '' : ASSISTANT_TEXT_DEFAULT;
  const DEF_RULES = bootServed ? [] : RULES_DEFAULT;
  const [mode, setMode] = useState<Mode>('vendedor');
  const [section, setSection] = useState<VendedorSection>('resumen');
  const [adminSection, setAdminSection] = useState<AdminSection>('ventas');
  // ── Estadísticas / Rendimiento ──
  type StatsPreset = 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'mesPasado' | 'rango';
  const [statsPreset, setStatsPreset] = useState<StatsPreset>('7d');
  const [statsRango, setStatsRango] = useState<{ desde: string; hasta: string }>(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const hace6 = new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    return { desde: hace6, hasta: hoy };
  });
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [statsCargando, setStatsCargando] = useState(false);
  // ── Flujos de remarketing ──
  const [flujos, setFlujos] = useState<Flujo[]>([]);
  const [flujoTextoDraft, setFlujoTextoDraft] = useState('');
  const [flujoMsgRemk, setFlujoMsgRemk] = useState('');
  const rangoDePreset = (preset: StatsPreset): { desde: string; hasta: string } => {
    const bog = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const hoy = bog(Date.now());
    const ayer = bog(Date.now() - 86400000);
    if (preset === 'hoy') return { desde: hoy, hasta: hoy };
    if (preset === 'ayer') return { desde: ayer, hasta: ayer };
    if (preset === '7d') return { desde: bog(Date.now() - 6 * 86400000), hasta: hoy };
    if (preset === '30d') return { desde: bog(Date.now() - 29 * 86400000), hasta: hoy };
    if (preset === 'mes') return { desde: hoy.slice(0, 7) + '-01', hasta: hoy };
    if (preset === 'mesPasado') {
      const [y, m] = hoy.split('-').map(Number);
      const ini = new Date(y, m - 2, 1);
      const fin = new Date(y, m - 1, 0);
      const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { desde: f(ini), hasta: f(fin) };
    }
    return statsRango; // 'rango' personalizado: usa lo que ya está
  };
  const elegirStatsPreset = (preset: StatsPreset) => {
    setStatsPreset(preset);
    if (preset !== 'rango') setStatsRango(rangoDePreset(preset));
  };
  const setStatsFechas = (desde: string, hasta: string) => {
    setStatsPreset('rango');
    setStatsRango({ desde, hasta });
  };
  const [filter, setFilter] = useState<string>('Todos');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | string | null>(7);
  const [selectedLeadId, setSelectedLeadId] = useState<number | string>(1);
  const [crmSelectedId, setCrmSelectedId] = useState<number | string>(1);
  // El sondeo liviano necesita saber qué chat está abierto (para traer SOLO ese
  // con su conversación completa); un ref para leerlo desde el intervalo.
  const crmSelectedIdRef = useRef<number | string>(1);
  crmSelectedIdRef.current = crmSelectedId;
  const [crmDraft, setCrmDraft] = useState<string>('');
  const [flujoMsg, setFlujoMsg] = useState<string>(''); // aviso del menú de "Flujos" del inbox
  const [copied, setCopied] = useState<'webhook' | 'code' | 'guia' | null>(null);
  const [avisoLead, setAvisoLead] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<string>('');
  const [assistantSaved, setAssistantSaved] = useState<boolean>(false);
  const [planNombre, setPlanNombre] = useState<string>('');
  const [planPrecio, setPlanPrecio] = useState<string>('');
  const [planDesc, setPlanDesc] = useState<string>('');
  const [planError, setPlanError] = useState<boolean>(false);
  const [waConnected, setWaConnected] = useState<boolean>(snap?.waConnected ?? !bootServed);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [mobileChatOpen, setMobileChatOpen] = useState<boolean>(false);
  // Vista web: mostrar/ocultar el menú lateral y activar un botón flotante de menú.
  // Se recuerdan en el navegador (por dispositivo).
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try { return localStorage.getItem('dealflow:sidebar') !== '0'; } catch { return true; }
  });
  const [floatingNav, setFloatingNav] = useState<boolean>(() => {
    try { return localStorage.getItem('dealflow:floatnav') === '1'; } catch { return false; }
  });
  // Tema visual: 'light' (por defecto), 'dark' ("Dark System") o 'premium'
  // (look neón/glass, solo si el Admin lo habilitó para esta tienda). Se
  // recuerda por dispositivo y se aplica como atributo data-theme en <html>.
  const [theme, setThemeState] = useState<'light' | 'dark' | 'premium'>(() => {
    try {
      const v = localStorage.getItem('dealflow:theme');
      return v === 'dark' || v === 'premium' ? v : 'light';
    } catch { return 'light'; }
  });
  useEffect(() => {
    // Cambio de tema INSTANTÁNEO (nada de fundido): repintar toda la app con
    // una transición de color de por medio es justo lo que se sentía lento
    // en equipos modestos. Mejor un cambio seco pero inmediato.
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('dealflow:theme', theme); } catch { /* modo privado */ }
  }, [theme]);
  function setTheme(t: 'light' | 'dark' | 'premium') { setThemeState(t); }
  const [assistantText, setAssistantText] = useState<string>(snap?.assistantText ?? DEF_ASSISTANT);
  const [assistantNombre, setAssistantNombre] = useState<string>('');
  const [seguimientoActivo, setSeguimientoActivo] = useState<boolean>(true); // el mensaje automático de actividad viene encendido
  const [estilo, setEstilo] = useState<{ trato: 'tu' | 'usted'; emojis: boolean; largo: 'corto' | 'detallado' }>({ trato: 'tu', emojis: true, largo: 'corto' });
  const [rules, setRules] = useState<string[]>(snap?.rules ?? DEF_RULES);
  const [orders, setOrders] = useState<Order[]>(snap?.orders ?? DEF_ORDERS);
  const [products, setProducts] = useState<Product[]>(snap?.products ?? DEF_PRODUCTS);
  const [productRuleDraft, setProductRuleDraft] = useState<string>('');
  const [faqP, setFaqP] = useState('');
  const [faqR, setFaqR] = useState('');
  const [bloqueTexto, setBloqueTexto] = useState('');
  const [videoWarn, setVideoWarn] = useState('');
  const [mediaWarn, setMediaWarn] = useState('');
  const [bundleCantidad, setBundleCantidad] = useState('');
  const [bundlePrecio, setBundlePrecio] = useState('');
  const [bundleEtiqueta, setBundleEtiqueta] = useState('');
  const [newProductOpen, setNewProductOpen] = useState<boolean>(false);
  const [newProdNombre, setNewProdNombre] = useState<string>('');
  const [newProdPrecio, setNewProdPrecio] = useState<string>('');
  const [newProdStock, setNewProdStock] = useState<string>('');
  const [newProdTipo, setNewProdTipo] = useState<'producto' | 'servicio'>('producto');
  const [newProdDuracion, setNewProdDuracion] = useState<string>('');
  const [newProdError, setNewProdError] = useState<boolean>(false);
  // Notificaciones del navegador (web/PWA): activar/desactivar y qué tipos recibir.
  const [notifPrefs, setNotifPrefs] = useState<{ on: boolean; pedidos: boolean; contactos: boolean }>(() => {
    try { return { on: false, pedidos: true, contactos: true, ...JSON.parse(localStorage.getItem('dealflow:notif') || '{}') }; }
    catch { return { on: false, pedidos: true, contactos: true }; }
  });
  const [notifPermiso, setNotifPermiso] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [variantFormOpen, setVariantFormOpen] = useState<boolean>(false);
  const [variantLabel, setVariantLabel] = useState<string>('');
  const [variantStock, setVariantStock] = useState<string>('');
  const [savedProductId, setSavedProductId] = useState<number | string | null>(null);
  const [newPromoOpen, setNewPromoOpen] = useState<boolean>(false);
  const [promoTipo, setPromoTipo] = useState<'Promoción' | 'Combo'>('Promoción');
  const [promoTitulo, setPromoTitulo] = useState<string>('');
  const [promoDesc, setPromoDesc] = useState<string>('');
  const [promoVigencia, setPromoVigencia] = useState<string>('');
  const [promoError, setPromoError] = useState<boolean>(false);
  const [promos, setPromos] = useState<Promo[]>(snap?.promos ?? DEF_PROMOS);
  const [leads, setLeads] = useState<Lead[]>(snap?.leads ?? DEF_LEADS);
  const [integrations] = useState<Integration[]>(INTEGRATIONS);
  const [plans, setPlans] = useState<Plan[]>(snap?.plans ?? DEF_PLANS);
  const [accounts, setAccounts] = useState<Account[]>(snap?.accounts ?? DEF_ACCOUNTS);
  const [armedDeleteProductId, setArmedDeleteProductId] = useState<number | string | null>(null);
  const [armedDeletePromoId, setArmedDeletePromoId] = useState<number | string | null>(null);
  const [armedDeleteVariant, setArmedDeleteVariant] = useState<{ productId: number | string; index: number } | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(snap?.soundOn ?? true);
  const [orderQuery, setOrderQuery] = useState<string>('');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => {
    try {
      const raw = localStorage.getItem('dealflow:session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loginError, setLoginError] = useState<string>('');
  const [apiMode, setApiMode] = useState<boolean>(false);
  const [storeNombre, setStoreNombre] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');
  // Tema Premium: solo lo puede elegir la tienda si el Admin se lo habilitó —
  // EXCEPTO el propio Admin/Superadmin, que siempre lo tiene disponible (además
  // de Claro/Dark System) en su propia cuenta.
  const [premiumHabilitado, setPremiumHabilitado] = useState(false);
  const premiumPermitido = premiumHabilitado || sessionUser?.role === 'admin' || sessionUser?.role === 'superadmin';
  useEffect(() => {
    if (theme === 'premium' && !premiumPermitido && apiMode) setThemeState('dark');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiumPermitido]);
  const [integracionesCfg, setIntegracionesCfg] = useState<Record<string, Record<string, string>>>({});
  const [iaPredeterminada, setIaPredeterminada] = useState('deepseek');
  const [integracionMsg, setIntegracionMsg] = useState('');
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [suscMsg, setSuscMsg] = useState('');
  const [misTiendas, setMisTiendas] = useState<MiTienda[]>([]);
  const [planes, setPlanes] = useState<PlanPublico[]>([]);
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [cuponMsg, setCuponMsg] = useState('');
  const [creditos, setCreditos] = useState(0);
  const [creditosMov, setCreditosMov] = useState<MovimientoCredito[]>([]);
  const [paquetesCreditos, setPaquetesCreditos] = useState<PaqueteCreditos[]>([]);
  const [costoCreditos, setCostoCreditos] = useState<{ texto: number; imagen: number }>({ texto: 2, imagen: 20 });
  // PWA: el navegador avisa cuándo se puede instalar (index.html captura el prompt).
  const [pwaDisponible, setPwaDisponible] = useState<boolean>(() => typeof window !== 'undefined' && !!(window as unknown as { dfPwaPrompt?: unknown }).dfPwaPrompt);
  const [waVerifyToken, setWaVerifyToken] = useState<string>('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  // ── Campañas del Marketing IA ──
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campana, setCampana] = useState<Campana | null>(null);
  const [adsCuenta, setAdsCuenta] = useState<CuentaAds | null>(null);
  const [adsOpciones, setAdsOpciones] = useState<OpcionesAds | null>(null);
  const [mkLoading, setMkLoading] = useState(false);
  const [mkError, setMkError] = useState('');
  const [mkSinCreditos, setMkSinCreditos] = useState(false);
  const [mkCopied, setMkCopied] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [instalando, setInstalando] = useState<string | null>(null);
  const [plantillaMsg, setPlantillaMsg] = useState('');
  const [teamForm, setTeamFormState] = useState({ nombre: '', email: '', password: '' });
  const [teamError, setTeamError] = useState('');
  const [teamSaving, setTeamSaving] = useState(false);
  const [armedDeleteTeamId, setArmedDeleteTeamId] = useState<string | null>(null);
  const [crmDeleteArmed, setCrmDeleteArmed] = useState<boolean>(false);
  const crmDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [accForm, setAccForm] = useState({ nombre: '', correo: '', password: '', plan: 'Inicio' });
  const [accError, setAccError] = useState('');
  const [accSaving, setAccSaving] = useState(false);
  const [accCreated, setAccCreated] = useState('');
  // Admin: edición/detalle de cuentas y planes.
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editStoreForm, setEditStoreForm] = useState({ nombre: '', correo: '', plan: '', password: '' });
  const [editStoreMsg, setEditStoreMsg] = useState('');
  const [armedDeleteStoreId, setArmedDeleteStoreId] = useState<string | null>(null);
  const [detalleStore, setDetalleStore] = useState<AdminStoreDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editPlanForm, setEditPlanForm] = useState({ nombre: '', precio: '', features: '' });
  const [armedDeletePlanId, setArmedDeletePlanId] = useState<string | null>(null);
  const [planMsg, setPlanMsg] = useState('');
  const [waCfg, setWaCfg] = useState<{ wabaId: string; phoneNumberId: string; numero: string } | null>(snap?.waCfg ?? null);
  const [waForm, setWaForm] = useState({ wabaId: '', phoneNumberId: '', accessToken: '' });
  const [waLinking, setWaLinking] = useState(false);
  const [waError, setWaError] = useState('');
  const [waMethod, setWaMethod] = useState<'qr' | 'cloud' | 'auto'>('qr');
  // Conexión en un clic con Meta (Embedded Signup); null = el servidor no la tiene configurada.
  const [waSignup, setWaSignup] = useState<MetaSignupCfg | null>(null);
  const [waSignupAuto, setWaSignupAuto] = useState(false); // conectada por el flujo automático
  const [waEstado, setWaEstado] = useState<EstadoNumero | null>(null);
  const [waEstadoCargando, setWaEstadoCargando] = useState(false);
  const [waModo, setWaModo] = useState<'cloud' | 'qr'>('cloud');
  const [qrEstado, setQrEstado] = useState<'inactivo' | 'iniciando' | 'qr' | 'conectado' | 'error'>('inactivo');
  const [qrImg, setQrImg] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');
  const [apiLeadsState, setApiLeadsState] = useState<Lead[] | null>(null);
  const [crmSendWarn, setCrmSendWarn] = useState('');

  // Guarda los datos SOLO en modo demo (sin backend). Con backend real no se guarda:
  // los datos de una tienda no deben quedar cacheados y reaparecer al recargar (era
  // el origen del bug de "entra a una tienda aleatoria con nombres cambiados").
  useEffect(() => {
    if (apiMode) return;
    saveSnapshot({ orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn, waCfg });
  }, [apiMode, orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn, waCfg]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const assistantTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedProductTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armedDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const patchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingPatch = useRef<Record<string, Record<string, unknown>>>({});

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const productsRef = useRef(products);
  productsRef.current = products;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  // "Firma" de la última tanda de leads/pedidos que sí se puso en pantalla:
  // evita rehacer todo el Inbox/Pedidos cada 5s cuando el sondeo trae
  // exactamente lo mismo de antes (rendimiento — ver el setInterval de abajo).
  const lastLeadsSigRef = useRef<string>('');
  const lastOrdersSigRef = useRef<string>('');
  const notifPrefsRef = useRef(notifPrefs);
  notifPrefsRef.current = notifPrefs;

  /** Muestra una notificación del navegador si el tipo está activado y hay permiso. */
  function notificar(tipo: 'pedidos' | 'contactos', titulo: string, cuerpo: string, tag?: string) {
    const p = notifPrefsRef.current;
    if (!p.on || !p[tipo]) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const opts = { body: cuerpo, icon: '/icon-192.png', badge: '/icon-192.png', tag: tag || tipo } as NotificationOptions;
    try {
      // En PWA/móvil el service worker es más confiable; si no, notificación directa.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then((reg) => reg.showNotification(titulo, opts)).catch(() => { try { new Notification(titulo, opts); } catch { /* no-op */ } });
      } else {
        new Notification(titulo, opts);
      }
    } catch { /* el navegador no soporta notificaciones */ }
  }

  function guardarNotifPrefs(next: { on: boolean; pedidos: boolean; contactos: boolean }) {
    setNotifPrefs(next);
    try { localStorage.setItem('dealflow:notif', JSON.stringify(next)); } catch { /* modo privado */ }
    void sincronizarPush(next);
  }
  // Convierte la llave VAPID (base64url) al formato que pide pushManager.subscribe.
  function urlBase64ToUint8Array(base64: string): Uint8Array {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  // Suscribe/da de baja el Web Push según las preferencias (para recibir avisos
  // con la app CERRADA). Si el navegador no soporta push, no pasa nada.
  async function sincronizarPush(prefs: { on: boolean; pedidos: boolean; contactos: boolean }) {
    if (!apiMode || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const actual = await reg.pushManager.getSubscription();
      if (!prefs.on || Notification.permission !== 'granted') {
        if (actual) { await apiPushUnsubscribe(actual.endpoint); await actual.unsubscribe().catch(() => {}); }
        return;
      }
      const { data } = await apiPushVapid();
      if (!data?.disponible || !data.key) return; // el servidor aún no tiene VAPID configurado
      const sub = actual || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.key) as BufferSource });
      await apiPushSubscribe(sub.toJSON(), { pedidos: prefs.pedidos, contactos: prefs.contactos });
    } catch (e) { console.warn('[push] no se pudo sincronizar', e); }
  }
  // Activa/desactiva las notificaciones. Al activar, pide el permiso del navegador.
  async function toggleNotificaciones() {
    if (notifPrefsRef.current.on) { guardarNotifPrefs({ ...notifPrefsRef.current, on: false }); return; }
    let permiso = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
    if (permiso === 'default' && typeof Notification !== 'undefined') {
      permiso = await Notification.requestPermission();
      setNotifPermiso(permiso);
    }
    if (permiso !== 'granted') { setNotifPermiso(permiso); guardarNotifPrefs({ ...notifPrefsRef.current, on: false }); return; }
    guardarNotifPrefs({ ...notifPrefsRef.current, on: true });
  }
  function setNotifTipo(tipo: 'pedidos' | 'contactos', val: boolean) {
    guardarNotifPrefs({ ...notifPrefsRef.current, [tipo]: val });
  }

  // Simula la llegada de pedidos desde el asistente de WhatsApp: el primero
  // entra a los ~15 s y luego cada 35–70 s, con notificación y timbre.
  useEffect(() => {
    if (apiMode) return; // en modo servidor no se simulan pedidos
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const arrive = () => {
      if (cancelled) return;
      const nuevo = generateIncomingOrder(ordersRef.current, productsRef.current);
      setOrders((st) => [nuevo, ...st]);
      setIncomingOrder(nuevo);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setIncomingOrder(null), 8000);
      if (soundOnRef.current) playOrderChime();
      timer = setTimeout(arrive, 35000 + Math.random() * 35000);
    };
    timer = setTimeout(arrive, 15000 + Math.random() * 10000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(toastTimer.current);
    };
  }, [apiMode]);

  const isAdmin = mode === 'admin';
  const isSuperadmin = sessionUser?.role === 'superadmin';

  // Roles de tienda: el dueño ve todo; el agente solo estas secciones.
  const AGENTE_SECCIONES: VendedorSection[] = ['productos', 'crm', 'leads', 'pedidos', 'marketing'];
  const esAgente = apiMode && sessionUser?.role === 'vendedor' && sessionUser?.esDueno === false;
  const puedeVerSeccion = (sec: VendedorSection) => !esAgente || AGENTE_SECCIONES.includes(sec);

  function go(id: VendedorSection) {
    if (!puedeVerSeccion(id)) return; // el agente no entra a secciones bloqueadas
    setMode('vendedor');
    setSection(id);
    setSelectedOrderId(null);
    setMenuOpen(false);
  }

  function goAdmin(id: AdminSection) {
    setMode('admin');
    setAdminSection(id);
    setSelectedOrderId(null);
    setMenuOpen(false);
  }

  function toggleMode() {
    if (isAdmin) {
      setMode('vendedor');
      setSection('resumen');
    } else {
      setMode('admin');
      setAdminSection('ventas');
    }
    setSelectedOrderId(null);
  }

  function advanceOrder(id: string) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o) return;
    const next = ESTADOS[o.estado].nextEstado;
    if (!next) return;
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, estado: next } : x)));
    if (apiMode && o.rowId) void apiOrderAdvance(o.rowId).then((r) => { if (r.error) void apiOrders().then(({ data }) => { if (data) setOrders(mapApiOrders(data.orders)); }); });
  }

  // Cambia el estado del pedido a CUALQUIER estado (seleccionable, con retroceso
  // y con Cancelado). Optimista: refleja de una y refresca del servidor si falla.
  function cambiarEstadoPedido(id: string, estado: EstadoPedido) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o || o.estado === estado) return;
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, estado } : x)));
    if (apiMode && o.rowId) void apiOrderEstado(o.rowId, estado).then((r) => { if (r.error) void apiOrders().then(({ data }) => { if (data) setOrders(mapApiOrders(data.orders)); }); });
  }

  // Crear pedido manual: un solo modal global (antes vivía duplicado dentro de
  // Pedidos/MPedidos), para poder abrirlo también desde el Inbox con el
  // cliente del chat ya puesto.
  const [crearPedidoAbierto, setCrearPedidoAbierto] = useState(false);
  const [crearPedidoPrefill, setCrearPedidoPrefill] = useState<{ cliente?: string; tel?: string } | null>(null);
  function abrirCrearPedido(prefill?: { cliente?: string; tel?: string }) {
    setCrearPedidoPrefill(prefill || null);
    setCrearPedidoAbierto(true);
  }
  function cerrarCrearPedido() {
    setCrearPedidoAbierto(false);
    setCrearPedidoMsg('');
  }

  // Crea un pedido MANUALMENTE (logística manual). Devuelve el id creado o ''.
  const [crearPedidoMsg, setCrearPedidoMsg] = useState('');
  async function crearPedidoManual(body: { cliente: string; tel?: string; ciudad?: string; departamento?: string; direccion?: string; nota?: string; envio?: number; total?: number; items: { qty: number; nombre: string; precio: number }[] }): Promise<string> {
    setCrearPedidoMsg('Creando el pedido…');
    const r = await apiCrearPedido(body);
    if (r.error || !r.data) { setCrearPedidoMsg(r.error || 'No se pudo crear el pedido.'); return ''; }
    setCrearPedidoMsg('');
    const { data } = await apiOrders();
    if (data) setOrders(mapApiOrders(data.orders));
    return r.data.id;
  }

  // ── Completar pedido desde el chat (revisar y corregir un pedido incompleto) ──
  const [completarAbierto, setCompletarAbierto] = useState(false);
  const [completarCargando, setCompletarCargando] = useState(false);
  const [completarMsg, setCompletarMsg] = useState('');
  const [completarDatos, setCompletarDatos] = useState<{ propuesta: PropuestaPedido | null; ordenExistente: { rowId: string; id: string } | null } | null>(null);
  async function abrirCompletarPedido(leadId: number | string) {
    setCompletarAbierto(true);
    setCompletarCargando(true);
    setCompletarMsg('');
    setCompletarDatos(null);
    const r = await apiExtraerPedido(String(leadId));
    setCompletarCargando(false);
    if (r.error || !r.data) { setCompletarMsg(r.error || 'No pudimos leer el pedido del chat.'); return; }
    setCompletarDatos(r.data);
    if (!r.data.propuesta) setCompletarMsg('No encontramos datos de un pedido en esta conversación.');
    else if (!r.data.ordenExistente) setCompletarMsg('Leímos el pedido del chat, pero este cliente no tiene un pedido existente para completar. Puedes crear uno nuevo desde “Crear pedido”.');
  }
  function cerrarCompletarPedido() { setCompletarAbierto(false); setCompletarMsg(''); setCompletarDatos(null); }
  async function guardarPedidoCompletado(rowId: string, body: { cliente: string; tel?: string; departamento?: string; ciudad?: string; direccion?: string; nota?: string; envio?: number; total?: number; items: { qty: number; nombre: string; precio: number }[] }): Promise<boolean> {
    setCompletarMsg('Guardando…');
    const r = await apiActualizarPedido(rowId, body);
    if (r.error || !r.data) { setCompletarMsg(r.error || 'No se pudo guardar el pedido.'); return false; }
    const { data } = await apiOrders();
    if (data) setOrders(mapApiOrders(data.orders));
    cerrarCompletarPedido();
    return true;
  }

  function sendToDropi(id: string) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o || o.guia) return;
    const guia = String(402000 + Math.floor(Math.random() * 900) + 100);
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, guia } : x)));
    if (apiMode && o.rowId) void apiOrderDropi(o.rowId).then((r) => {
      if (r.data?.guia) setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, guia: r.data!.guia } : x)));
    });
  }

  // Despacha el pedido por el proveedor elegido (creándolo en su WooCommerce).
  const [effiMsg, setEffiMsg] = useState('');
  function despacharPedido(id: string, proveedor: 'dropi' | 'effi', reintentar = false) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o?.rowId) return;
    const nombre = proveedor === 'dropi' ? 'Dropi' : 'Effi';
    setEffiMsg(reintentar ? `Volviendo a enviar a ${nombre}…` : `Enviando a ${nombre}…`);
    void apiOrderDespachar(o.rowId, proveedor, reintentar).then((r) => {
      if (r.error || !r.data) { setEffiMsg(r.error || `No se pudo enviar a ${nombre}.`); return; }
      const noMap = r.data.sinMapear || [];
      if (noMap.length) {
        setEffiMsg(`⚠ El pedido llegó a WooCommerce, pero ${noMap.length} producto(s) NO coinciden por SKU con un producto de ${nombre}, así que ${nombre} NO los va a despachar: ${noMap.join(', ')}. Ponles el mismo SKU del producto de ${nombre} en Productos y vuelve a enviar.`);
      } else {
        setEffiMsg(r.data.aviso || `✓ Pedido ${reintentar ? 'reenviado' : 'enviado'} a ${nombre}. La guía llega cuando lo despachen.`);
      }
      setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, wooId: r.data!.wooId, despachoProveedor: proveedor, transportadora: nombre, guia: reintentar ? '' : x.guia } : x)));
    });
  }
  function sincronizarEffi(id: string) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o?.rowId) return;
    setEffiMsg('Consultando estado…');
    void apiOrderDespacharSync(o.rowId).then((r) => {
      if (r.error || !r.data) { setEffiMsg(r.error || 'No se pudo sincronizar.'); return; }
      setEffiMsg(`Estado: ${r.data.estado || 'sin cambios'}${r.data.guia ? ` · guía ${r.data.guia}` : ''}`);
      if (r.data.guia) setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, guia: r.data!.guia } : x)));
    });
  }

  function decorateOrder(o: Order): DecoratedOrder {
    const cfg = ESTADOS[o.estado];
    // Total del pedido: el que acordó el asistente, o la suma si hay precios.
    const total = o.total && o.total > 0 ? o.total : o.items.reduce((a, it) => a + it.qty * it.precio, 0) + o.envio;
    return {
      ...o,
      totalFmt: fmt(total),
      envioFmt: fmt(o.envio),
      fechaLabel: etiquetaFechaYMD(o.fecha),
      itemsResumen: o.items.map((it) => it.qty + '× ' + it.nombre).join(' · '),
      itemsDecorated: o.items.map((it) => ({ ...it, precioFmt: '' })), // solo mostramos el total del pedido
      pillStyle: pill(cfg),
      hasNext: !!cfg.next,
      isDone: !cfg.next,
      advanceLabel: cfg.next || '',
      hasNota: !!o.nota,
      hasGuia: !!o.guia,
      advance: () => advanceOrder(o.id),
      // Estado seleccionable: cambiar a cualquiera (incluye Cancelado).
      setEstado: (estado: EstadoPedido) => cambiarEstadoPedido(o.id, estado),
      estadosDisponibles: ESTADOS_TODOS,
      open: () => {
        setSelectedOrderId(o.id);
        setSection('pedidos');
      },
      sendToDropi: () => sendToDropi(o.id),
      despachar: (proveedor: 'dropi' | 'effi') => despacharPedido(o.id, proveedor),
      reenviarDespacho: (proveedor: 'dropi' | 'effi') => despacharPedido(o.id, proveedor, true),
      sincronizarEffi: () => sincronizarEffi(o.id),
      despachado: !!o.wooId,
      despachoProveedor: o.despachoProveedor || '',
      timeline: ESTADO_ORDER.map((est) => {
        const done = ESTADO_ORDER.indexOf(est) <= ESTADO_ORDER.indexOf(o.estado);
        return {
          estado: est,
          dotStyle: { width: '10px', height: '10px', borderRadius: '50%', background: done ? ESTADOS[est].color : 'var(--df-border)', flexShrink: 0 },
          labelStyle: { fontSize: '13px', fontWeight: done ? 600 : 400, color: done ? 'var(--df-text-strong)' : 'var(--df-text-faint)' },
        };
      }),
    };
  }

  function copy(key: 'webhook' | 'code' | 'guia', text: string) {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(key);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  }

  function decorateMensaje(m: Mensaje): DecoratedMensaje {
    return {
      ...m,
      rowStyle: { display: 'flex', justifyContent: m.de === 'cliente' ? 'flex-start' : 'flex-end' },
      bubbleStyle: {
        maxWidth: '78%',
        padding: '9px 12px',
        borderRadius: m.de === 'cliente' ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
        background: m.de === 'cliente' ? 'var(--df-surface)' : m.de === 'vendedor' ? 'var(--df-brand)' : 'var(--df-brand-subtle)',
        color: m.de === 'vendedor' ? '#fff' : 'var(--df-text-strong)',
        border: m.de === 'vendedor' ? 'none' : '1px solid ' + (m.de === 'cliente' ? 'var(--df-border)' : 'var(--df-brand-border)'),
        fontSize: '13px',
        lineHeight: 1.5,
      },
      horaStyle: {
        display: 'block',
        fontSize: '10.5px',
        color: m.de === 'vendedor' ? 'rgba(255,255,255,.75)' : 'var(--df-text-faint)',
        marginTop: '3px',
        textAlign: 'right',
      },
      fecha: m.createdAt ? fechaBogota(m.createdAt) : '',
      fechaEtiqueta: etiquetaFecha(m.createdAt),
      estadoInfo: estadoDeMensaje(m),
    };
  }

  function decorateLead(l: Lead, i: number, selectedId: number | string, onSelect: (id: number | string) => void): DecoratedLead {
    const [bg, txt] = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const selL = l.id === selectedId;
    return {
      ...l,
      iniciales: initials(l.nombre),
      avatarStyle: { width: '38px', height: '38px', borderRadius: '50%', background: bg, color: txt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 },
      etapaStyle: { ...pill(ETAPA_CFG[l.etapa]), marginTop: '5px', fontSize: '11px' },
      etiquetaStyle: l.etiqueta && COLOR_ETIQUETA[l.etiqueta]
        ? { display: 'inline-block', fontSize: '10.5px', fontWeight: 700, borderRadius: '5px', padding: '1px 7px', background: COLOR_ETIQUETA[l.etiqueta].bg, color: COLOR_ETIQUETA[l.etiqueta].color }
        : null,
      rowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer', background: selL ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', borderLeft: selL ? '3px solid var(--df-brand)' : '3px solid transparent' },
      select: () => onSelect(l.id),
      mensajesDecorated: l.mensajes.map(decorateMensaje),
    };
  }

  // En modo servidor, los leads vienen de la API; en demo, del estado local.
  const leadsSource = apiMode && apiLeadsState ? apiLeadsState : leads;

  const leadsDecorated = useMemo(
    () => leadsSource.map((l, i) => decorateLead(l, i, selectedLeadId, (id) => { setSelectedLeadId(id); setAvisoLead(null); cargarMensajesChat(id); })),
    [leadsSource, selectedLeadId],
  );
  const lead = leadsDecorated.find((l) => l.id === selectedLeadId) || null;

  const crmChats: DecoratedCrmChat[] = useMemo(
    () =>
      // Orden tipo WhatsApp: el chat con actividad más reciente va PRIMERO.
      [...leadsSource]
      .sort((a, b) => String(b.ultimoIso || '').localeCompare(String(a.ultimoIso || '')))
      .map((l, i) => {
        const d = decorateLead(l, i, crmSelectedId, (id) => { setCrmSelectedId(id); setCrmSendWarn(''); cargarMensajesChat(id); });
        // En modo servidor, "en vivo" = el bot lo atiende; en demo, los dos primeros.
        const live = apiMode && apiLeadsState ? l.asignado.includes('bot') || l.asignado.includes('Asistente') : l.id === 1 || l.id === 2;
        const selC = l.id === crmSelectedId;
        const fechaISO = l.ultimoIso ? fechaBogota(l.ultimoIso) : '';
        // Sin responder = mensajes seguidos del cliente al final (nadie —bot ni
        // vendedor— ha contestado después). En modo resumen lo calcula el servidor
        // (l.sinResponder); si no, se cuenta de los mensajes. Si el chat está abierto, no molesta el badge.
        let sinResponder = l.sinResponder;
        if (sinResponder === undefined) {
          sinResponder = 0;
          for (let k = l.mensajes.length - 1; k >= 0; k--) {
            if (l.mensajes[k].de === 'cliente') sinResponder++;
            else break;
          }
        }
        if (selC) sinResponder = 0;
        return {
          ...d,
          live,
          sinResponder,
          fechaISO,
          fechaHoraLabel: l.ultimoIso ? (fechaISO === hoyBogota() ? l.hora : etiquetaFecha(l.ultimoIso)) : l.hora,
          liveLabel: live ? 'En vivo' : 'Esperando',
          liveStyle: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: live ? 'var(--df-brand-dark)' : 'var(--df-text-faint)', marginTop: '5px' },
          liveDot: { width: '7px', height: '7px', borderRadius: '50%', background: live ? 'var(--df-brand-mid)' : 'var(--df-border-strong)', animation: live ? 'dfpulse 1.8s infinite' : 'none', flexShrink: 0 },
          crmRowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer', background: selC ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', borderLeft: selC ? '3px solid var(--df-brand)' : '3px solid transparent' },
        };
      }),
    [leadsSource, crmSelectedId, apiMode, apiLeadsState],
  );
  const crmChat = crmChats.find((c) => c.id === crmSelectedId) || null;
  // ¿El chat seleccionado lo atiende el asistente? (fuente de verdad: su "asignado")
  const crmChatBot = crmChat ? /asistente|bot/i.test(String(crmChat.asignado || '')) : true;

  function crearProducto() {
    const nombre = newProdNombre.trim();
    const esServicio = newProdTipo === 'servicio';
    const precio = parseInt(newProdPrecio, 10) || 0;
    const stock = parseInt(newProdStock, 10) || 0;
    if (!nombre || (!esServicio && !precio)) { // un servicio puede ser gratis
      setNewProdError(true);
      return;
    }
    if (apiMode) {
      void apiCreateProduct({ nombre, precio, stock, tipo: newProdTipo, duracion: esServicio ? newProdDuracion : '' }).then((r) => {
        if (r.error || !r.data) {
          setNewProdError(true);
          return;
        }
        void reloadProducts().then(() => setExpandedProductId(r.data!.id));
        setNewProdNombre('');
        setNewProdPrecio('');
        setNewProdStock('');
        setNewProdDuracion('');
        setNewProdTipo('producto');
        setNewProdError(false);
        setNewProductOpen(false);
      });
      return;
    }
    const [bg, txt] = AVATAR_COLORS[products.length % AVATAR_COLORS.length];
    const id = Date.now();
    setProducts((st) => [{ id, nombre, precio, stock, color: bg, txt, reglas: [], variantes: [{ label: 'Única', stock, fotos: 0 }] }, ...st]);
    setExpandedProductId(id);
    setNewProdNombre('');
    setNewProdPrecio('');
    setNewProdStock('');
    setNewProdError(false);
    setNewProductOpen(false);
  }

  function addVariante(productId: number | string) {
    const label = variantLabel.trim();
    const stock = parseInt(variantStock, 10) || 0;
    if (!label) return;
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: [...p.variantes, { label, stock, fotos: 0 }], stock: p.variantes.reduce((a, v) => a + v.stock, 0) + stock }
          : p,
      ),
    );
    setVariantLabel('');
    setVariantStock('');
    setVariantFormOpen(false);
    if (apiMode && typeof productId === 'string') void apiAddVariant(productId, { label, stock }).then(() => reloadProducts());
  }

  function queuePatch(id: number | string, patch: Record<string, unknown>) {
    if (!apiMode || typeof id === 'number') return; // los ids numéricos son de la demo local
    const k = String(id);
    pendingPatch.current[k] = { ...pendingPatch.current[k], ...patch };
    clearTimeout(patchTimers.current[k]);
    patchTimers.current[k] = setTimeout(() => {
      const body = pendingPatch.current[k];
      delete pendingPatch.current[k];
      void apiPatchProduct(k, body);
    }, 500);
  }

  async function reloadProducts() {
    const { data } = await apiState();
    if (data?.products) setProducts(mapApiProducts(data.products));
  }

  /** Manda ya cualquier cambio de producto pendiente (al recargar/cerrar). */
  function flushPatches() {
    for (const k of Object.keys(pendingPatch.current)) {
      clearTimeout(patchTimers.current[k]);
      const body = pendingPatch.current[k];
      delete pendingPatch.current[k];
      void apiPatchProduct(k, body);
    }
  }
  useEffect(() => {
    const h = () => flushPatches();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateProduct(id: number | string, patch: Partial<Product>) {
    setProducts((st) => st.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    queuePatch(id, patch as Record<string, unknown>);
  }

  function changeVariantStock(productId: number | string, variantIndex: number, delta: number) {
    let vid: string | undefined;
    let nuevo = 0;
    setProducts((st) =>
      st.map((p) => {
        if (p.id !== productId) return p;
        const variantes = p.variantes.map((v, i) => {
          if (i !== variantIndex) return v;
          nuevo = Math.max(0, v.stock + delta);
          vid = v.id;
          return { ...v, stock: nuevo };
        });
        return { ...p, variantes, stock: variantes.reduce((a, v) => a + v.stock, 0) };
      }),
    );
    if (apiMode && vid) void apiPatchVariant(vid, { stock: nuevo });
  }

  function saveProduct(id: number | string) {
    setSavedProductId(id);
    clearTimeout(savedProductTimer.current);
    savedProductTimer.current = setTimeout(() => setSavedProductId(null), 2500);
  }

  function armDeleteTimer() {
    clearTimeout(armedDeleteTimer.current);
    armedDeleteTimer.current = setTimeout(() => {
      setArmedDeleteProductId(null);
      setArmedDeletePromoId(null);
      setArmedDeleteVariant(null);
    }, 3500);
  }

  function armDelete(kind: 'product' | 'promo', id: number | string) {
    if (kind === 'product') setArmedDeleteProductId(id);
    else setArmedDeletePromoId(id);
    armDeleteTimer();
  }

  function deleteVariant(productId: number | string, index: number) {
    const armed = armedDeleteVariant;
    if (!armed || armed.productId !== productId || armed.index !== index) {
      setArmedDeleteVariant({ productId, index });
      armDeleteTimer();
      return;
    }
    let vid: string | undefined;
    setProducts((st) =>
      st.map((p) => {
        if (p.id !== productId) return p;
        vid = p.variantes[index]?.id;
        const variantes = p.variantes.filter((_, i) => i !== index);
        return { ...p, variantes, stock: variantes.reduce((a, v) => a + v.stock, 0) };
      }),
    );
    setArmedDeleteVariant(null);
    if (apiMode && vid) void apiDeleteVariant(vid);
  }

  function deleteProduct(id: number | string) {
    if (armedDeleteProductId !== id) {
      armDelete('product', id);
      return;
    }
    setProducts((st) => st.filter((p) => p.id !== id));
    setExpandedProductId((cur) => (cur === id ? null : cur));
    setArmedDeleteProductId(null);
    if (apiMode && typeof id === 'string') void apiDeleteProduct(id);
  }

  function deletePromo(id: number) {
    if (armedDeletePromoId !== id) {
      armDelete('promo', id);
      return;
    }
    setPromos((st) => st.filter((p) => p.id !== id));
    setArmedDeletePromoId(null);
  }

  // Al arrancar, detecta si el panel está servido por el backend real.
  // Si es así, la sesión viene del servidor; si no (demo), del navegador.
  useEffect(() => {
    void apiMe().then(({ available, user }) => {
      setApiMode(available);
      // Recuerda si hay backend (para el próximo arranque) y purga el snapshot de la
      // demo, que en modo servidor no debe usarse nunca.
      try {
        if (available) { localStorage.setItem('dealflow:apimode', '1'); clearSnapshot(); }
        else localStorage.removeItem('dealflow:apimode');
      } catch { /* modo privado */ }
      if (available) {
        const rol = user ? (user.role === 'ADMIN' ? 'admin' : user.role === 'SUPERADMIN' ? 'superadmin' : 'vendedor') : 'vendedor';
        setSessionUser(user ? { nombre: user.nombre, email: user.email, role: rol, esDueno: user.esDueno, impersonando: user.impersonando, tiendaNombre: user.tiendaNombre, foto: user.foto } : null);
        if (user) setMode(rol === 'vendedor' ? 'vendedor' : 'admin');
        if (rol === 'superadmin') setAdminSection('superadmin');
        if (user && user.role === 'VENDEDOR' && user.esDueno === false) setSection('crm'); // el agente arranca en su CRM
      }
    });
  }, []);

  // Cuentas de la demo estática (sin backend).
  const DEMO_ACCOUNTS: Record<string, { password: string; nombre: string; role: 'vendedor' | 'admin' }> = {
    'karla@lunaaccesorios.co': { password: 'demo123', nombre: 'Karla', role: 'vendedor' },
    'admin@dealflow.co': { password: 'admin123', nombre: 'Equipo DealFlow', role: 'admin' },
  };

  function completeLogin(user: SessionUser) {
    setSessionUser(user);
    setMode(user.role === 'vendedor' ? 'vendedor' : 'admin');
    setSection(user.role === 'vendedor' && user.esDueno === false ? 'crm' : 'resumen');
    setAdminSection(user.role === 'superadmin' ? 'superadmin' : 'ventas');
    setLoginError('');
  }

  async function login(email: string, password: string) {
    // Si el panel lo sirve el backend, el login SIEMPRE va contra el servidor
    // (aunque la detección inicial aún no haya terminado, la reconfirmamos).
    let usarApi = apiMode;
    if (!usarApi) {
      const me = await apiMe();
      if (me.available) {
        usarApi = true;
        setApiMode(true);
      }
    }
    if (usarApi) {
      const r = await apiLogin(email.trim().toLowerCase(), password);
      if (r.error || !r.user) {
        setLoginError(r.error || 'No pudimos iniciar sesión.');
        return;
      }
      completeLogin({ nombre: r.user.nombre, email: r.user.email, role: r.user.role === 'ADMIN' ? 'admin' : r.user.role === 'SUPERADMIN' ? 'superadmin' : 'vendedor', esDueno: r.user.esDueno, foto: r.user.foto });
      return;
    }
    const e = email.trim().toLowerCase();
    const acc = DEMO_ACCOUNTS[e];
    if (!acc || acc.password !== password) {
      setLoginError('Correo o contraseña incorrectos.');
      return;
    }
    const user = { nombre: acc.nombre, email: e, role: acc.role };
    try {
      localStorage.setItem('dealflow:session', JSON.stringify(user));
    } catch { /* sin almacenamiento */ }
    completeLogin(user);
  }

  async function registrar(nombre: string, negocio: string, email: string, password: string) {
    let usarApi = apiMode;
    if (!usarApi) {
      const me = await apiMe();
      if (me.available) { usarApi = true; setApiMode(true); }
    }
    if (!usarApi) { setLoginError('El registro solo está disponible en la app en vivo.'); return; }
    const r = await apiRegistro(nombre.trim(), negocio.trim(), email.trim().toLowerCase(), password);
    if (r.error || !r.user) { setLoginError(r.error || 'No pudimos crear tu cuenta.'); return; }
    completeLogin({ nombre: r.user.nombre, email: r.user.email, role: 'vendedor', esDueno: true });
  }

  function logout() {
    if (apiMode) apiLogout();
    try {
      localStorage.removeItem('dealflow:session');
      clearSnapshot(); // que no quede data de una tienda cacheada tras salir
    } catch { /* nada */ }
    setSessionUser(null);
    setMode('vendedor');
    setSection('resumen');
    setSelectedOrderId(null);
    setMenuOpen(false);
  }

  // ── Perfil de la cuenta (nombre, foto, contraseña) ──
  const [perfilMsg, setPerfilMsg] = useState('');
  const [perfilBusy, setPerfilBusy] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  async function actualizarNombrePerfil(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio || limpio === sessionUser?.nombre) return;
    setPerfilBusy(true);
    setPerfilMsg('');
    const r = await apiUpdateMe(limpio);
    setPerfilBusy(false);
    if (r.error || !r.user) { setPerfilMsg(r.error || 'No pudimos guardar el nombre.'); return; }
    setSessionUser((u) => (u ? { ...u, nombre: r.user!.nombre } : u));
    setPerfilMsg('✓ Nombre actualizado.');
    setTimeout(() => setPerfilMsg(''), 3000);
  }

  async function subirFotoPerfil(file: File) {
    setPerfilBusy(true);
    setPerfilMsg('');
    try {
      const dataUrl = await comprimirImagen(file, 480, 0.85);
      if (!dataUrl) { setPerfilMsg('No pudimos leer esa foto. Intenta con otra.'); return; }
      // Salvavidas: si el navegador no pudo comprimirla (formatos raros, ej. HEIC
      // de iPhone), comprimirImagen manda el archivo tal cual — puede pesar varios
      // MB y el servidor/proxy la rechaza con un error que antes se veía como
      // "problema de conexión". Mejor avisar claro ANTES de intentar subirla.
      if (dataUrl.length > 4_000_000) {
        setPerfilMsg('Esa foto pesa mucho y no la pudimos comprimir (a veces pasa con fotos HEIC de iPhone). Prueba con otra foto o cambia el formato de la cámara a "Más compatible" en Ajustes → Cámara → Formatos.');
        return;
      }
      const r = await apiUploadAvatar(dataUrl);
      if (r.error || !r.foto) { setPerfilMsg(r.error || 'No pudimos subir la foto.'); return; }
      setSessionUser((u) => (u ? { ...u, foto: r.foto } : u));
      setPerfilMsg('✓ Foto actualizada.');
      setTimeout(() => setPerfilMsg(''), 3000);
    } finally {
      setPerfilBusy(false);
    }
  }

  async function cambiarPasswordPerfil(actual: string, nueva: string): Promise<boolean> {
    setPassBusy(true);
    setPassMsg('');
    const r = await apiChangePassword(actual, nueva);
    setPassBusy(false);
    if (r.error) { setPassMsg(r.error); return false; }
    setPassMsg('✓ Contraseña actualizada.');
    setTimeout(() => setPassMsg(''), 3000);
    return true;
  }

  /** Le pregunta a Meta cómo está el número (calidad, límites, verificación). */
  async function revisarNumero() {
    if (!apiMode) return;
    setWaEstadoCargando(true);
    const r = await apiWaEstado();
    setWaEstado(r.data ?? null);
    setWaEstadoCargando(false);
  }

  /** Conexión en un clic: popup de Facebook y el servidor termina el alta con Meta. */
  async function conectarConFacebook() {
    if (!waSignup?.disponible) return;
    setWaError('');
    setWaLinking(true);
    try {
      const { abrirSignupMeta } = await import('../lib/metaSignup');
      const datos = await abrirSignupMeta(waSignup.appId, waSignup.configId);
      const r = await apiWaEmbedded(datos);
      if (r.error || !r.data) throw new Error(r.error || 'No pudimos completar la conexión con Meta.');
      setWaModo('cloud');
      setWaConnected(true);
      setWaSignupAuto(true);
      setWaCfg({ wabaId: datos.wabaId, phoneNumberId: datos.phoneNumberId, numero: r.data.numero });
      if (r.data.aviso) setWaError(r.data.aviso);
    } catch (e) {
      setWaError(e instanceof Error ? e.message : 'No pudimos completar la conexión.');
    } finally {
      setWaLinking(false);
    }
  }

  function vincularWa() {
    if (!waForm.wabaId.trim() || !waForm.phoneNumberId.trim() || !waForm.accessToken.trim()) {
      setWaError('Faltan datos: WABA ID, Phone Number ID y Access Token.');
      return;
    }
    setWaError('');
    setWaLinking(true);
    if (apiMode) {
      void apiWaLinkCloud({ wabaId: waForm.wabaId.trim(), phoneNumberId: waForm.phoneNumberId.trim(), accessToken: waForm.accessToken.trim() }).then((r) => {
        setWaLinking(false);
        if (r.error || !r.data) {
          setWaError(r.error || 'No pudimos validar las credenciales.');
          return;
        }
        setWaModo('cloud');
        setWaConnected(true);
        setWaCfg({ wabaId: waForm.wabaId.trim(), phoneNumberId: waForm.phoneNumberId.trim(), numero: r.data.numero });
        setWaForm({ wabaId: '', phoneNumberId: '', accessToken: '' });
      });
      return;
    }
    // Demo: validación simulada.
    setTimeout(() => {
      setWaModo('cloud');
      setWaCfg({ wabaId: waForm.wabaId.trim(), phoneNumberId: waForm.phoneNumberId.trim(), numero: '+57 300 123 4567' });
      setWaConnected(true);
      setWaForm({ wabaId: '', phoneNumberId: '', accessToken: '' });
      setWaLinking(false);
    }, 900);
  }

  function iniciarQr() {
    setWaError('');
    setQrError('');
    setQrEstado('iniciando');
    setQrImg('');
    if (apiMode) {
      void apiWaQrStart().then((r) => {
        if (r.error) {
          setQrEstado('error');
          setQrError(r.error);
        }
      });
      return;
    }
    // Demo: muestra un QR de ejemplo y "conecta" a los pocos segundos.
    setTimeout(() => {
      setQrEstado('qr');
      setQrImg('demo');
    }, 700);
    setTimeout(() => {
      setWaModo('qr');
      setQrEstado('conectado');
      setQrImg('');
      setWaConnected(true);
      setWaCfg({ wabaId: '', phoneNumberId: '', numero: '+57 300 123 4567' });
    }, 4500);
  }

  function desvincularWa() {
    if (apiMode) void apiWaUnlink();
    setWaCfg(null);
    setWaConnected(false);
    setWaModo('cloud');
    setQrEstado('inactivo');
    setQrImg('');
  }

  // Polling del estado del QR mientras se está escaneando (solo modo servidor).
  useEffect(() => {
    if (!apiMode || (qrEstado !== 'iniciando' && qrEstado !== 'qr')) return;
    const inicio = Date.now();
    const t = setInterval(() => {
      // Si en 40 s no apareció el código, avisamos en vez de dejarlo pegado.
      if (qrEstado === 'iniciando' && Date.now() - inicio > 40000) {
        setQrEstado('error');
        setQrError('WhatsApp está tardando en responder. Vuelve a intentar en un momento.');
        return;
      }
      void apiWaQrStatus().then(({ data }) => {
        if (!data) return;
        if (data.estado === 'qr' && data.qr) {
          setQrEstado('qr');
          setQrImg(data.qr);
        } else if (data.estado === 'conectado') {
          setWaModo('qr');
          setQrEstado('conectado');
          setQrImg('');
          setWaConnected(true);
          setWaCfg({ wabaId: '', phoneNumberId: '', numero: data.numero });
        } else if (data.estado === 'error') {
          setQrEstado('error');
          setQrError(data.error || 'No pudimos generar el código. Intenta de nuevo.');
        }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [apiMode, qrEstado]);

  // Aplica un resumen de leads CONSERVANDO los mensajes que ya teníamos de cada
  // chat (el resumen solo trae los del chat abierto, para ahorrar datos).
  function aplicarResumenLeads(leads: Lead[]) {
    setApiLeadsState((prev) => {
      const antes = new Map((prev || []).map((l) => [String(l.id), l]));
      return leads.map((l) => (l.mensajes.length ? l : { ...l, mensajes: antes.get(String(l.id))?.mensajes || [] }));
    });
  }
  // Refresca la lista del Inbox de forma liviana (usado tras una acción).
  function refrescarLeadsLiviano() {
    if (!apiMode) return;
    void apiLeadsResumen(crmSelectedIdRef.current != null ? String(crmSelectedIdRef.current) : undefined).then(({ data }) => {
      if (data) aplicarResumenLeads(mapApiLeads(data.leads));
    });
  }
  // Al abrir un chat, trae su conversación completa al instante (sin esperar el sondeo).
  function cargarMensajesChat(id: number | string) {
    if (!apiMode) return;
    void apiLeadMensajes(String(id)).then(({ data }) => {
      if (!data) return;
      const msgs = mapApiMensajes(data.mensajes);
      setApiLeadsState((prev) => (prev || []).map((l) => (String(l.id) === String(id) ? { ...l, mensajes: msgs } : l)));
    });
  }

  // En modo servidor, el panel del vendedor carga WhatsApp real y los leads,
  // y refresca el CRM cada 5 s para ver los mensajes que van llegando.
  useEffect(() => {
    if (!apiMode || isAdmin) return;
    const load = () => {
      void apiState().then(({ data }) => {
        if (!data) return;
        setWaConnected(data.whatsapp.conectado);
        setWaModo(data.whatsapp.modo === 'qr' ? 'qr' : 'cloud');
        if (data.whatsapp.conectado) {
          setWaCfg({ wabaId: data.whatsapp.wabaId, phoneNumberId: data.whatsapp.phoneNumberId, numero: data.whatsapp.numero });
        }
        if (data.store?.nombre) setStoreNombre(data.store.nombre);
        if (data.store?.id) setStoreId(data.store.id);
        setPremiumHabilitado(!!data.store?.temaPremium);
        setSuscripcion(data.suscripcion ?? null);
        if (data.whatsapp.verifyToken) setWaVerifyToken(data.whatsapp.verifyToken);
        setWaSignup(data.whatsapp.signup ?? null);
        setWaSignupAuto(!!data.whatsapp.signupAuto);
        // Si la conexión en un clic está lista, es la opción que se ofrece primero.
        if (data.whatsapp.signup?.disponible && !data.whatsapp.conectado) setWaMethod((m) => (m === 'qr' ? 'auto' : m));
        // Datos reales de la tienda: nada de textos demo de "Luna Accesorios".
        setAssistantText(data.assistant?.instrucciones || '');
        setAssistantNombre(data.assistant?.nombre || '');
        setSeguimientoActivo(data.assistant?.seguimientoActivo !== false);
        setEstilo({
          trato: data.assistant?.estilo?.trato === 'usted' ? 'usted' : 'tu',
          emojis: data.assistant?.estilo?.emojis !== false,
          largo: data.assistant?.estilo?.largo === 'detallado' ? 'detallado' : 'corto',
        });
        setRules(data.assistant?.reglas || []);
        setApiLeadsState(mapApiLeads(data.leads));
        if (data.orders) setOrders(mapApiOrders(data.orders));
        if (data.products) setProducts(mapApiProducts(data.products));
      });
    };
    if (!sessionUser) return;
    load();
    // La primera carga siembra los pedidos conocidos SIN notificar (evita avisar
    // de pedidos viejos al entrar). Luego, cada pedido nuevo dispara el pop-up.
    let sembrado = false;
    let sembradoLeads = false;
    const t = setInterval(() => {
      // Sondeo LIVIANO: solo el resumen de cada chat (último mensaje + sin
      // responder), y la conversación completa SOLO del chat abierto. Antes esto
      // descargaba TODOS los mensajes de TODOS los chats cada 5s (varios MB),
      // que era lo que ponía lento todo el Inbox.
      void apiLeadsResumen(crmSelectedIdRef.current != null ? String(crmSelectedIdRef.current) : undefined).then(({ data }) => {
        if (!data) return;
        const leads = mapApiLeads(data.leads);
        if (!sembradoLeads) {
          leads.forEach((l) => knownLeadIdsRef.current.add(String(l.id)));
          sembradoLeads = true;
        } else {
          for (const l of leads) {
            if (!knownLeadIdsRef.current.has(String(l.id))) {
              knownLeadIdsRef.current.add(String(l.id));
              const nombre = (l.nombre || 'Un cliente').split(' ')[0];
              notificar('contactos', 'Nuevo contacto 👋', `${nombre} le escribió a tu tienda.`, `lead-${l.id}`);
            }
          }
        }
        // La firma es barata: en resumen los mensajes vienen vacíos (salvo el chat
        // abierto), así que casi no hay texto que serializar.
        const sig = JSON.stringify(leads);
        if (sig !== lastLeadsSigRef.current) {
          lastLeadsSigRef.current = sig;
          aplicarResumenLeads(leads);
        }
      });
      void apiOrders().then(({ data }) => {
        if (!data) return;
        const nuevos = mapApiOrders(data.orders);
        if (!sembrado) {
          nuevos.forEach((o) => knownOrderIdsRef.current.add(String(o.rowId ?? o.id)));
          sembrado = true;
        } else {
          const recienLlegado = nuevos.find((o) => o.estado === 'Nuevo' && !knownOrderIdsRef.current.has(String(o.rowId ?? o.id)));
          nuevos.forEach((o) => knownOrderIdsRef.current.add(String(o.rowId ?? o.id)));
          if (recienLlegado) {
            setIncomingOrder(recienLlegado);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setIncomingOrder(null), 8000);
            if (soundOnRef.current) playOrderChime();
            // Notificación de pedido con resumen corto.
            const d = decorateOrder(recienLlegado);
            const nprod = recienLlegado.items.reduce((a, it) => a + it.qty, 0);
            notificar('pedidos', `Nuevo pedido ${recienLlegado.id} 🛒`, `${recienLlegado.cliente} · ${d.totalFmt} · ${nprod} producto${nprod === 1 ? '' : 's'}`, recienLlegado.id);
          }
        }
        // Mismo criterio que arriba: sin cambios reales, no repintamos Pedidos.
        const sig = JSON.stringify(nuevos);
        if (sig !== lastOrdersSigRef.current) {
          lastOrdersSigRef.current = sig;
          setOrders(nuevos);
        }
      });
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, isAdmin, sessionUser]);

  function resetDemo() {
    clearSnapshot();
    window.location.reload();
  }

  function crearPromo() {
    const titulo = promoTitulo.trim();
    const desc = promoDesc.trim();
    if (!titulo || !desc) {
      setPromoError(true);
      return;
    }
    setPromos((st) => [{ id: Date.now(), tipo: promoTipo, titulo, desc, vigencia: promoVigencia.trim() || 'Sin fecha de vencimiento', activa: true }, ...st]);
    setPromoTitulo('');
    setPromoDesc('');
    setPromoVigencia('');
    setPromoTipo('Promoción');
    setPromoError(false);
    setNewPromoOpen(false);
  }

  /** Sube archivos al servidor y devuelve sus enlaces (livianos). Comprime las
   *  imágenes antes de subir. En demo usa data URLs. */
  async function subir(files: File[], mimePrefix: string): Promise<string[]> {
    setMediaWarn('');
    const validos = files.filter((f) => f.type.startsWith(mimePrefix));
    const dataUrls: string[] = [];
    for (const f of validos) {
      if (f.type.startsWith('image/')) {
        const d = await comprimirImagen(f);
        if (d) dataUrls.push(d);
      } else {
        const [d] = await readFilesAsDataUrls([f], mimePrefix);
        if (d) dataUrls.push(d);
      }
    }
    if (!apiMode) return dataUrls; // demo local: sin servidor, se guarda el data URL
    const urls: string[] = [];
    for (const d of dataUrls) {
      const { data, error } = await apiUpload(d);
      if (data?.url) urls.push(data.url);
      else if (error) setMediaWarn('No pudimos subir un archivo: ' + error);
    }
    return urls;
  }

  async function addMainPhotos(productId: number | string, files: File[]) {
    const urls = await subir(files, 'image/');
    if (!urls.length) return;
    const prod = productsRef.current.find((p) => p.id === productId);
    const nuevas = [...(prod?.fotosSubidas || []), ...urls];
    setProducts((st) => st.map((p) => (p.id === productId ? { ...p, fotosSubidas: nuevas } : p)));
    queuePatch(productId, { fotosSubidas: nuevas });
  }

  function removeMainPhoto(productId: number | string, index: number) {
    const prod = productsRef.current.find((p) => p.id === productId);
    const nuevas = (prod?.fotosSubidas || []).filter((_, i) => i !== index);
    setProducts((st) => st.map((p) => (p.id === productId ? { ...p, fotosSubidas: nuevas } : p)));
    queuePatch(productId, { fotosSubidas: nuevas });
  }

  /**
   * Actualiza una lista (testimonios, videos, bloques, combos, opciones) y la
   * sincroniza. Calcula el nuevo valor desde el estado actual (productsRef), NO
   * desde dentro del updater de setProducts: en un manejador de evento ese
   * updater corre después, y leer la variable ahí daba undefined → no se
   * guardaba (por eso se perdían textos, combos y opciones).
   */
  function patchProductList<K extends 'testimonios' | 'videos' | 'mensajeBloques' | 'bundles' | 'opciones'>(
    productId: number | string,
    key: K,
    mutate: (actual: NonNullable<Product[K]>) => Product[K],
  ) {
    const prod = productsRef.current.find((p) => p.id === productId);
    const nueva = mutate((prod?.[key] || []) as NonNullable<Product[K]>);
    setProducts((st) => st.map((p) => (p.id === productId ? { ...p, [key]: nueva } : p)));
    queuePatch(productId, { [key]: nueva });
  }

  async function addTestimonios(productId: number | string, files: File[]) {
    const urls = await subir(files, 'image/');
    if (urls.length) patchProductList(productId, 'testimonios', (t) => [...t, ...urls]);
  }

  /** Descarta videos de más de 10 MB (el servidor acepta hasta 15 MB por guardado). */
  function filtrarVideos(files: File[]): File[] {
    const ok = files.filter((f) => !f.type.startsWith('video/') || f.size <= 10 * 1024 * 1024);
    setVideoWarn(ok.length < files.length ? 'Los videos deben pesar máximo 10 MB. Sube una versión más liviana.' : '');
    return ok;
  }

  async function addProductVideos(productId: number | string, files: File[]) {
    const urls = await subir(filtrarVideos(files), 'video/');
    if (urls.length) patchProductList(productId, 'videos', (v) => [...v, ...urls]);
  }

  // Crea UN bloque nuevo con todas las piezas subidas (varias imágenes en un
  // bloque de imagen, varios videos en uno de video).
  async function addBloqueMedia(productId: number | string, files: File[], tipo: 'imagen' | 'video' | 'audio') {
    const prefijo = tipo === 'imagen' ? 'image/' : tipo === 'audio' ? 'audio/' : 'video/';
    const urls = await subir(tipo === 'video' ? filtrarVideos(files) : files, prefijo);
    if (urls.length) patchProductList(productId, 'mensajeBloques', (b) => [...b, { tipo, valores: urls }]);
  }

  // Agrega más piezas a un bloque de imagen/video/audio ya existente.
  async function addMediaABloque(productId: number | string, index: number, files: File[], tipo: 'imagen' | 'video' | 'audio') {
    const prefijo = tipo === 'imagen' ? 'image/' : tipo === 'audio' ? 'audio/' : 'video/';
    const urls = await subir(tipo === 'video' ? filtrarVideos(files) : files, prefijo);
    if (!urls.length) return;
    patchProductList(productId, 'mensajeBloques', (bl) =>
      bl.map((b, j) => (j === index ? { ...b, valores: [...mediaDeBloque(b), ...urls], valor: undefined } : b)),
    );
  }

  async function addVariantPhotos(productId: number | string, variantIndex: number, files: File[]) {
    const urls = await subir(files, 'image/');
    if (!urls.length) return;
    let vid: string | undefined;
    let nuevas: string[] = [];
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: p.variantes.map((v, i) => {
              if (i !== variantIndex) return v;
              vid = v.id;
              nuevas = [...(v.fotosSubidas || []), ...urls];
              return { ...v, fotosSubidas: nuevas };
            }) }
          : p,
      ),
    );
    if (apiMode && vid) void apiPatchVariant(vid, { fotosSubidas: nuevas });
  }

  function removeVariantPhoto(productId: number | string, variantIndex: number, index: number) {
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: p.variantes.map((v, i) => (i === variantIndex ? { ...v, fotosSubidas: (v.fotosSubidas || []).filter((_, j) => j !== index) } : v)) }
          : p,
      ),
    );
  }

  const productsDecorated: DecoratedProduct[] = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        iniciales: initials(p.nombre).toUpperCase(),
        fotoStyle: { width: '44px', height: '44px', borderRadius: '10px', background: p.color, color: p.txt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' },
        previewImg: previewDeProducto(p),
        precioFmt: fmt(p.precio),
        variantesLabel: (p.opciones && p.opciones.length)
          ? p.opciones.filter((o) => o.valores.length).map((o) => o.nombre + ': ' + o.valores.map((v) => v.valor).join(', ')).join('  ·  ') || 'Opciones sin valores'
          : 'Sin opciones aún',
        stockLabel: (p.opciones && p.opciones.length) ? p.opciones.reduce((a, o) => a + o.valores.length, 0) + ' opciones' : '',
        stockPill: pill({ color: 'var(--df-text-secondary)', bg: 'var(--df-surface-2)' }),
        expanded: expandedProductId === p.id,
        chevron: expandedProductId === p.id ? '▲' : '▼',
        toggle: () => {
          setExpandedProductId((cur) => (cur === p.id ? null : p.id));
          setProductRuleDraft('');
          setVariantFormOpen(false);
          setVariantLabel('');
          setVariantStock('');
        },
        save: () => saveProduct(p.id),
        saved: savedProductId === p.id,
        addVariante: () => addVariante(p.id),
        requestDelete: () => deleteProduct(p.id),
        deleteArmed: armedDeleteProductId === p.id,
        setNombre: (v: string) => updateProduct(p.id, { nombre: v }),
        setPrecio: (v: string) => updateProduct(p.id, { precio: parseInt(v.replace(/[^0-9]/g, ''), 10) || 0 }),
        setSku: (v: string) => updateProduct(p.id, { sku: v }),
        setTipo: (v: 'producto' | 'servicio') => updateProduct(p.id, { tipo: v }),
        setDuracion: (v: string) => updateProduct(p.id, { duracion: v }),
        fotosMain: (p.fotos || ['Principal', 'Detalle']).map((fl) => ({
          label: fl,
          tileStyle: { width: '64px', height: '64px', borderRadius: '10px', background: p.color, color: p.txt, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: '10px', fontWeight: 600, paddingBottom: '5px', boxSizing: 'border-box' },
        })),
        uploadedMain: p.fotosSubidas || [],
        addMainFotos: (files: File[]) => void addMainPhotos(p.id, files),
        removeMainFoto: (index: number) => removeMainPhoto(p.id, index),
        reglasDecoradas: p.reglas.map((texto, i) => ({
          texto,
          remove: () => {
            const nuevas = p.reglas.filter((_, j) => j !== i);
            setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, reglas: nuevas } : x)));
            queuePatch(p.id, { reglas: nuevas });
          },
          editar: (nuevo: string) => {
            const nuevas = p.reglas.map((t, j) => (j === i ? nuevo : t));
            setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, reglas: nuevas } : x)));
            queuePatch(p.id, { reglas: nuevas });
          },
        })),
        addRegla: () => {
          const t = productRuleDraft.trim();
          if (!t) return;
          const nuevas = [...p.reglas, t];
          setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, reglas: nuevas } : x)));
          queuePatch(p.id, { reglas: nuevas });
          setProductRuleDraft('');
        },
        setDescripcion: (v: string) => updateProduct(p.id, { descripcion: v }),
        setCaracteristicas: (v: string) => updateProduct(p.id, { caracteristicas: v }),
        setMensajeInicial: (v: string) => updateProduct(p.id, { mensajeInicial: v }),
        setModosUso: (v: string) => updateProduct(p.id, { modosUso: v }),
        testimoniosList: p.testimonios || [],
        addTestimonios: (files: File[]) => void addTestimonios(p.id, files),
        removeTestimonio: (index: number) => patchProductList(p.id, 'testimonios', (t) => t.filter((_, j) => j !== index)),
        videosList: p.videos || [],
        addVideos: (files: File[]) => void addProductVideos(p.id, files),
        removeVideo: (index: number) => patchProductList(p.id, 'videos', (v) => v.filter((_, j) => j !== index)),
        bloquesDecorados: (p.mensajeBloques || []).map((b, i) => ({
          ...b,
          mediaLista: mediaDeBloque(b),
          remove: () => patchProductList(p.id, 'mensajeBloques', (bl) => bl.filter((_, j) => j !== i)),
          // Edita el texto de un bloque de texto (edición en línea).
          editText: (valor: string) =>
            patchProductList(p.id, 'mensajeBloques', (bl) => bl.map((bloque, j) => (j === i ? { ...bloque, valor } : bloque))),
          // Duplica el bloque (copiar/pegar): inserta una copia justo después.
          duplicate: () =>
            patchProductList(p.id, 'mensajeBloques', (bl) => bl.flatMap((bloque, j) => (j === i ? [bloque, { ...bloque }] : [bloque]))),
          addMedia: (files: File[]) => {
            if (b.tipo === 'imagen' || b.tipo === 'video' || b.tipo === 'audio') void addMediaABloque(p.id, i, files, b.tipo);
          },
          // Quita una pieza del bloque; si queda vacío, elimina el bloque entero.
          removeMedia: (mediaIndex: number) =>
            patchProductList(p.id, 'mensajeBloques', (bl) =>
              bl.flatMap((bloque, j) => {
                if (j !== i) return [bloque];
                const restantes = mediaDeBloque(bloque).filter((_, k) => k !== mediaIndex);
                return restantes.length ? [{ ...bloque, valores: restantes, valor: undefined }] : [];
              }),
            ),
          // Mueve una pieza dentro del bloque (reordenar imágenes/videos).
          moverMedia: (from: number, to: number) =>
            patchProductList(p.id, 'mensajeBloques', (bl) =>
              bl.map((bloque, j) => {
                if (j !== i) return bloque;
                const piezas = [...mediaDeBloque(bloque)];
                if (from === to || from < 0 || to < 0 || from >= piezas.length || to >= piezas.length) return bloque;
                const [x] = piezas.splice(from, 1);
                piezas.splice(to, 0, x);
                return { ...bloque, valores: piezas, valor: undefined };
              }),
            ),
        })),
        moverBloque: (from: number, to: number) =>
          patchProductList(p.id, 'mensajeBloques', (bl) => {
            if (from === to || from < 0 || to < 0 || from >= bl.length || to >= bl.length) return bl;
            const copia = [...bl];
            const [x] = copia.splice(from, 1);
            copia.splice(to, 0, x);
            return copia;
          }),
        addBloqueTexto: () => {
          const t = bloqueTexto.trim();
          if (!t) return;
          patchProductList(p.id, 'mensajeBloques', (bl) => [...bl, { tipo: 'texto' as const, valor: t }]);
          setBloqueTexto('');
        },
        addBloqueImagen: (files: File[]) => void addBloqueMedia(p.id, files, 'imagen'),
        addBloqueVideo: (files: File[]) => void addBloqueMedia(p.id, files, 'video'),
        addBloqueAudio: (files: File[]) => void addBloqueMedia(p.id, files, 'audio'),
        bundlesDecorados: (p.bundles || []).map((b, i) => ({
          ...b,
          precioFmt: fmt(b.precio),
          remove: () => patchProductList(p.id, 'bundles', (bl) => bl.filter((_, j) => j !== i)),
        })),
        addBundle: () => {
          const cantidad = parseInt(bundleCantidad, 10) || 0;
          const precio = parseInt(bundlePrecio.replace(/[^0-9]/g, ''), 10) || 0;
          if (cantidad < 2 || !precio) return;
          patchProductList(p.id, 'bundles', (bl) => [...bl, { cantidad, precio, etiqueta: bundleEtiqueta.trim() || undefined }]);
          setBundleCantidad('');
          setBundlePrecio('');
          setBundleEtiqueta('');
        },
        opcionesDecoradas: (p.opciones || []).map((o, gi) => ({
          nombre: o.nombre,
          valores: o.valores,
          addValor: (v: string) => {
            const t = v.trim();
            if (!t) return;
            patchProductList(p.id, 'opciones', (ops) => ops.map((x, i) => (i === gi && !x.valores.some((w) => w.valor === t) ? { ...x, valores: [...x.valores, { valor: t }] } : x)));
          },
          removeValor: (idx: number) => patchProductList(p.id, 'opciones', (ops) => ops.map((x, i) => (i === gi ? { ...x, valores: x.valores.filter((_, j) => j !== idx) } : x))),
          setValorFoto: async (idx: number, files: File[]) => {
            const [url] = await subir(files, 'image/');
            if (!url) return;
            patchProductList(p.id, 'opciones', (ops) => ops.map((x, i) => (i === gi ? { ...x, valores: x.valores.map((v, j) => (j === idx ? { ...v, foto: url } : v)) } : x)));
          },
          removeValorFoto: (idx: number) => patchProductList(p.id, 'opciones', (ops) => ops.map((x, i) => (i === gi ? { ...x, valores: x.valores.map((v, j) => (j === idx ? { valor: v.valor } : v)) } : x))),
          remove: () => patchProductList(p.id, 'opciones', (ops) => ops.filter((_, i) => i !== gi)),
        })),
        addOpcion: (nombre: string) => {
          const t = nombre.trim();
          if (!t) return;
          patchProductList(p.id, 'opciones', (ops) => [...ops, { nombre: t, valores: [] }]);
        },
        setContenidoPaquete: (v: string) => updateProduct(p.id, { contenidoPaquete: v }),
        setDisparador: (v: string) => updateProduct(p.id, { disparador: v }),
        toggleMensajeInicial: () => updateProduct(p.id, { mensajeInicialActivo: !(p.mensajeInicialActivo !== false) }),
        faqsDecoradas: (p.faqs || []).map((f, i) => ({
          ...f,
          remove: () => {
            const nuevas = (p.faqs || []).filter((_, j) => j !== i);
            setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, faqs: nuevas } : x)));
            queuePatch(p.id, { faqs: nuevas });
          },
          // Edición en línea de la pregunta y/o la respuesta.
          editar: (campo: 'pregunta' | 'respuesta', valor: string) => {
            const nuevas = (p.faqs || []).map((x, j) => (j === i ? { ...x, [campo]: valor } : x));
            setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, faqs: nuevas } : x)));
            queuePatch(p.id, { faqs: nuevas });
          },
        })),
        addFaq: () => {
          const pq = faqP.trim();
          const rr = faqR.trim();
          if (!pq || !rr) return;
          const nuevas = [...(p.faqs || []), { pregunta: pq, respuesta: rr }];
          setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, faqs: nuevas } : x)));
          queuePatch(p.id, { faqs: nuevas });
          setFaqP('');
          setFaqR('');
        },
        variantesDecorated: p.variantes.map((v, vIndex) => {
          const nf = v.fotos == null ? 2 : v.fotos;
          const uploaded = v.fotosSubidas || [];
          const total = nf + uploaded.length;
          const sw = swatch(v.label, p.txt);
          return {
            label: v.label,
            swatchStyle: { width: '16px', height: '16px', borderRadius: '5px', background: sw, border: '1px solid rgba(15,23,42,.12)', flexShrink: 0 },
            labelStyle: { fontSize: '13px', fontWeight: 600, minWidth: '110px', color: v.stock === 0 ? 'var(--df-text-faint)' : 'var(--df-text-strong)', textDecoration: v.stock === 0 ? 'line-through' : 'none' },
            stockPill: pill(stockPillCfg(v.stock)),
            stockLabel: v.stock === 0 ? 'Agotado' : v.stock + ' en stock',
            fotosLabel: total + (total === 1 ? ' foto' : ' fotos'),
            thumbs: Array.from({ length: Math.min(nf, 3) }, (_, k) => ({ width: '22px', height: '22px', borderRadius: '5px', background: sw, opacity: 1 - k * 0.28, border: '1px solid rgba(15,23,42,.1)' })),
            uploaded,
            addFotos: (files: File[]) => void addVariantPhotos(p.id, vIndex, files),
            removeFoto: (index: number) => removeVariantPhoto(p.id, vIndex, index),
            stock: v.stock,
            incStock: () => changeVariantStock(p.id, vIndex, 1),
            decStock: () => changeVariantStock(p.id, vIndex, -1),
            requestDelete: () => deleteVariant(p.id, vIndex),
            deleteArmed: !!armedDeleteVariant && armedDeleteVariant.productId === p.id && armedDeleteVariant.index === vIndex,
          };
        }),
      })),
    [products, expandedProductId, productRuleDraft, savedProductId, variantLabel, variantStock, armedDeleteProductId, armedDeleteVariant, faqP, faqR, bloqueTexto, bundleCantidad, bundlePrecio, bundleEtiqueta],
  );

  const promosDecorated: DecoratedPromo[] = useMemo(
    () =>
      promos.map((pr) => ({
        ...pr,
        badgeStyle: pill(pr.tipo === 'Combo' ? { color: 'var(--df-warning)', bg: 'var(--df-warning-subtle)' } : { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' }),
        estadoLabel: pr.activa ? 'Activa' : 'Pausada',
        estadoStyle: { ...pill(pr.activa ? { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' } : { color: 'var(--df-text-muted)', bg: 'var(--df-surface-2)' }), cursor: 'pointer' },
        toggle: () => setPromos((st) => st.map((x) => (x.id === pr.id ? { ...x, activa: !x.activa } : x))),
        requestDelete: () => deletePromo(pr.id),
        deleteArmed: armedDeletePromoId === pr.id,
      })),
    [promos, armedDeletePromoId],
  );

  const rulesDecorated = useMemo(
    () => rules.map((texto, i) => ({
      texto,
      remove: () => setRules((st) => st.filter((_, j) => j !== i)),
      editar: (nuevo: string) => setRules((st) => st.map((t, j) => (j === i ? nuevo : t))),
    })),
    [rules],
  );

  const integrationsDecorated: DecoratedIntegration[] = useMemo(
    () =>
      integrations.map((i) => {
        // Conectada = la tienda guardó sus credenciales; WhatsApp usa el estado del número y Meta Ads su cuenta publicitaria.
        const conectado = i.id === 'wa' ? waConnected : i.especial === 'meta-ads' ? !!adsCuenta?.conectada : !!integracionesCfg[i.id];
        return {
          ...i,
          logoStyle: { width: '38px', height: '38px', borderRadius: '10px', background: i.logoBg, color: i.logoTxt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' },
          badgeLabel: conectado ? 'Conectada' : 'Disponible',
          badgeStyle: pill(conectado ? { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' } : { color: 'var(--df-text-muted)', bg: 'var(--df-surface-2)' }),
          btnLabel: conectado ? 'Configurar' : 'Conectar',
          btnStyle: conectado
            ? { background: 'var(--df-surface)', color: 'var(--df-text-strong)', border: '1px solid var(--df-border)', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }
            : { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
          // WhatsApp se configura en su propia sección; el resto abre su formulario en la tarjeta.
          action: i.id === 'wa' ? () => go('whatsapp') : () => {},
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [integrations, integracionesCfg, waConnected, adsCuenta],
  );

  const plansDecorated: DecoratedPlan[] = useMemo(
    () => plans.map((pl) => ({ ...pl, precioFmt: fmt(pl.precio), cuentasLabel: pl.cuentas + ' cuentas en este plan' })),
    [plans],
  );

  // En modo servidor, el panel admin carga cuentas y planes reales.
  async function reloadAdmin() {
    const { data } = await apiAdminOverview();
    if (!data) return;
    setAccounts(data.stores.map((s) => ({ id: s.id, tienda: s.tienda, correo: s.correo, plan: s.plan, ventas: s.ventas, activa: s.activa, planEstado: s.planEstado, planVence: s.planVence, creditos: s.creditos, temaPremium: s.temaPremium, oculta: s.oculta })));
    setPlans(data.plans.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, cuentas: p.cuentas, features: p.features })));
  }
  useEffect(() => {
    if (apiMode && isAdmin && sessionUser) void reloadAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, isAdmin, sessionUser]);

  // Estadísticas: carga cuando se entra a la pestaña o cambia el rango de fechas.
  useEffect(() => {
    if (!apiMode || !sessionUser || section !== 'estadisticas') return;
    let vivo = true;
    setStatsCargando(true);
    void apiStats(statsRango.desde, statsRango.hasta).then((r) => {
      if (!vivo) return;
      setStatsCargando(false);
      if (r.data) setStats(r.data);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, section, statsRango.desde, statsRango.hasta]);

  // Flujos de remarketing: carga la lista al entrar a la pestaña o al abrir el
  // menú de Flujos del Inbox.
  async function recargarFlujos() {
    if (!apiMode) return;
    const { data } = await apiFlows();
    if (data && Array.isArray(data.flows)) setFlujos(data.flows);
  }
  useEffect(() => {
    if (apiMode && sessionUser && (section === 'flujos' || section === 'crm')) void recargarFlujos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, section]);

  // Persiste los bloques de un flujo (local + servidor).
  function patchFlujoBloques(id: string, fn: (b: MensajeBloque[]) => MensajeBloque[]) {
    let nuevos: MensajeBloque[] = [];
    setFlujos((st) => st.map((f) => {
      if (f.id !== id) return f;
      nuevos = fn(f.bloques || []);
      return { ...f, bloques: nuevos };
    }));
    if (apiMode) void apiActualizarFlujo(id, { bloques: nuevos }).then((r) => { if (r.error) void recargarFlujos(); });
  }
  async function addBloqueFlujoMedia(id: string, files: File[], tipo: 'imagen' | 'video' | 'audio') {
    const prefijo = tipo === 'imagen' ? 'image/' : tipo === 'audio' ? 'audio/' : 'video/';
    const urls = await subir(tipo === 'video' ? filtrarVideos(files) : files, prefijo);
    if (urls.length) patchFlujoBloques(id, (b) => [...b, { tipo, valores: urls }]);
  }
  async function addMediaAFlujoBloque(id: string, index: number, files: File[], tipo: 'imagen' | 'video' | 'audio') {
    const prefijo = tipo === 'imagen' ? 'image/' : tipo === 'audio' ? 'audio/' : 'video/';
    const urls = await subir(tipo === 'video' ? filtrarVideos(files) : files, prefijo);
    if (!urls.length) return;
    patchFlujoBloques(id, (bl) => bl.map((b, j) => (j === index ? { ...b, valores: [...mediaDeBloque(b), ...urls], valor: undefined } : b)));
  }
  async function crearFlujo(nombre: string): Promise<string> {
    if (!nombre.trim()) return '';
    setFlujoMsgRemk('');
    if (apiMode) {
      const { data, error } = await apiCrearFlujo({ nombre: nombre.trim() });
      if (data?.id) {
        // Optimista: lo mostramos YA en la lista, sin depender de que el refresco
        // llegue a tiempo. Luego reconciliamos con el servidor.
        const nuevo = { id: data.id, nombre: nombre.trim(), descripcion: '', bloques: [], activo: true };
        setFlujos((st) => [nuevo, ...st.filter((f) => f.id !== data.id)]);
        void recargarFlujos();
        return data.id;
      }
      setFlujoMsgRemk(error || 'No se pudo crear el flujo. Recarga la página (F5) e intenta de nuevo.');
      return '';
    }
    const id = 'flow_' + Date.now();
    setFlujos((st) => [{ id, nombre: nombre.trim(), descripcion: '', bloques: [], activo: true }, ...st]);
    return id;
  }
  function actualizarFlujoMeta(id: string, patch: { nombre?: string; descripcion?: string; activo?: boolean }) {
    setFlujos((st) => st.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    if (apiMode) void apiActualizarFlujo(id, patch);
  }
  function eliminarFlujo(id: string) {
    setFlujos((st) => st.filter((f) => f.id !== id));
    if (apiMode) void apiEliminarFlujo(id);
  }
  function enviarFlujoRemarketing(flowId: string) {
    const leadId = crmSelectedId;
    setFlujoMsgRemk('Enviando el flujo…');
    void apiEnviarFlujoRemarketing(String(leadId), flowId).then((r) => {
      if (r.error || !r.data) { setFlujoMsgRemk(r.error || 'No se pudo enviar el flujo.'); return; }
      setFlujoMsgRemk(`✓ Flujo enviado (${r.data.enviadas} pieza${r.data.enviadas === 1 ? '' : 's'}).`);
      if (apiMode) cargarMensajesChat(leadId);
    });
  }
  // Flujos decorados: cada uno con sus bloques listos para el BloquesBuilder.
  const flujosDecorados = flujos.map((f) => ({
    ...f,
    bloquesDecorados: (f.bloques || []).map((b, i) => ({
      ...b,
      mediaLista: mediaDeBloque(b),
      remove: () => patchFlujoBloques(f.id, (bl) => bl.filter((_, j) => j !== i)),
      editText: (valor: string) => patchFlujoBloques(f.id, (bl) => bl.map((bloque, j) => (j === i ? { ...bloque, valor } : bloque))),
      duplicate: () => patchFlujoBloques(f.id, (bl) => bl.flatMap((bloque, j) => (j === i ? [bloque, { ...bloque }] : [bloque]))),
      addMedia: (files: File[]) => { if (b.tipo === 'imagen' || b.tipo === 'video' || b.tipo === 'audio') void addMediaAFlujoBloque(f.id, i, files, b.tipo); },
      removeMedia: (mediaIndex: number) => patchFlujoBloques(f.id, (bl) => bl.flatMap((bloque, j) => {
        if (j !== i) return [bloque];
        const restantes = mediaDeBloque(bloque).filter((_, k) => k !== mediaIndex);
        return restantes.length ? [{ ...bloque, valores: restantes, valor: undefined }] : [];
      })),
      moverMedia: (from: number, to: number) => patchFlujoBloques(f.id, (bl) => bl.map((bloque, j) => {
        if (j !== i) return bloque;
        const piezas = [...mediaDeBloque(bloque)];
        if (from === to || from < 0 || to < 0 || from >= piezas.length || to >= piezas.length) return bloque;
        const [x] = piezas.splice(from, 1);
        piezas.splice(to, 0, x);
        return { ...bloque, valores: piezas, valor: undefined };
      })),
    })),
    moverBloque: (from: number, to: number) => patchFlujoBloques(f.id, (bl) => {
      if (from === to || from < 0 || to < 0 || from >= bl.length || to >= bl.length) return bl;
      const copia = [...bl];
      const [x] = copia.splice(from, 1);
      copia.splice(to, 0, x);
      return copia;
    }),
    addBloqueTexto: () => { const t = flujoTextoDraft.trim(); if (t) { patchFlujoBloques(f.id, (bl) => [...bl, { tipo: 'texto', valor: t }]); setFlujoTextoDraft(''); } },
    addBloqueImagen: (files: File[]) => void addBloqueFlujoMedia(f.id, files, 'imagen'),
    addBloqueVideo: (files: File[]) => void addBloqueFlujoMedia(f.id, files, 'video'),
    addBloqueAudio: (files: File[]) => void addBloqueFlujoMedia(f.id, files, 'audio'),
    remove: () => eliminarFlujo(f.id),
    setNombre: (v: string) => actualizarFlujoMeta(f.id, { nombre: v }),
    setDescripcion: (v: string) => actualizarFlujoMeta(f.id, { descripcion: v }),
  }));


  // ── Superadmin: todas las tiendas + ocultar del admin ──
  const [superStores, setSuperStores] = useState<SuperStore[]>([]);
  async function reloadSuper() {
    const { data } = await apiSuperStores();
    if (data) setSuperStores(data.stores);
  }
  useEffect(() => {
    // La lista de tiendas se usa tanto en el panel del superadmin como en la
    // biblioteca del administrador (para clonar productos desde una tienda).
    if (apiMode && sessionUser && (adminSection === 'superadmin' || adminSection === 'biblioteca')) void reloadSuper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, adminSection]);
  function toggleHideStore(id: string, oculta: boolean) {
    setSuperStores((st) => st.map((s) => (s.id === id ? { ...s, oculta: !oculta } : s)));
    void apiToggleHideStore(id, !oculta).then((r) => { if (r.error) void reloadSuper(); });
  }

  // ── Biblioteca de productos (tienda cliente) ──
  const [bibliotecaItems, setBibliotecaItems] = useState<LibraryItem[]>([]);
  const [bibliotecaMsg, setBibliotecaMsg] = useState('');
  async function reloadBiblioteca() {
    const { data } = await apiBiblioteca();
    if (data) setBibliotecaItems(data.productos);
  }
  useEffect(() => {
    if (apiMode && sessionUser && section === 'biblioteca') void reloadBiblioteca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, section]);
  function importarDeBiblioteca(id: string) {
    setBibliotecaMsg('');
    void apiImportarBiblioteca(id).then((r) => {
      if (r.error) { setBibliotecaMsg(r.error); return; }
      if (r.data?.requierePago) {
        // Producto de pago: abrimos el checkout de Wompi.
        void apiCheckoutBiblioteca(id).then((c) => {
          if (c.error || !c.data?.url) { setBibliotecaMsg(c.error || 'No pudimos abrir el pago.'); return; }
          window.location.href = c.data.url;
        });
        return;
      }
      setBibliotecaMsg('✓ Producto importado a tu catálogo. Ya lo puedes editar en Productos.');
      void reloadBiblioteca();
      void reloadProducts();
    });
  }

  // ── Registro de actividad / errores (diagnóstico del Inbox) ──
  // Puede ser GENERAL (toda la tienda) o POR CHAT (solo de ese lead).
  const [logs, setLogs] = useState<EventoLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLeadId, setLogsLeadId] = useState<string>('');
  const [logsTitulo, setLogsTitulo] = useState<string>('');
  const logsLeadRef = useRef<string>('');
  logsLeadRef.current = logsLeadId;
  async function reloadLogs() {
    const { data } = await apiLogs(logsLeadRef.current || undefined);
    if (data) setLogs(data.logs);
  }
  // abrirLogs() sin argumentos = registro general; con leadId = solo ese chat.
  function abrirLogs(leadId?: string, titulo?: string) {
    setLogsLeadId(leadId || '');
    logsLeadRef.current = leadId || '';
    setLogsTitulo(leadId ? (titulo || 'este chat') : '');
    setLogsOpen(true);
    void reloadLogs();
  }
  function cerrarLogs() { setLogsOpen(false); }
  function limpiarLogs() { setLogs([]); void apiClearLogs().then(() => reloadLogs()); }

  // Reintenta enviar un mensaje que falló. Marca el mensaje como "reenviando…"
  // mientras tanto y refresca desde el servidor al terminar.
  const [reenviandoMsg, setReenviandoMsg] = useState<string | null>(null);
  function reenviarMensaje(id: string) {
    if (!id) return;
    setReenviandoMsg(id);
    void apiReenviarMensaje(id).then((r) => {
      setReenviandoMsg(null);
      if (!r.error && r.data) {
        // Refleja el nuevo estado al instante y refresca desde el servidor.
        setApiLeadsState((st) => (st || []).map((l) => ({ ...l, mensajes: l.mensajes.map((m) => (m.id === id ? { ...m, estado: r.data!.estado } : m)) })));
      }
      refrescarLeadsLiviano();
    });
  }

  // ── Biblioteca de productos (superadmin) ──
  const [superBiblioteca, setSuperBiblioteca] = useState<LibraryAdminItem[]>([]);
  const [superStoreProducts, setSuperStoreProducts] = useState<SuperStoreProduct[]>([]);
  async function reloadSuperBiblioteca() {
    const { data } = await apiSuperBiblioteca();
    if (data) setSuperBiblioteca(data.productos);
  }
  useEffect(() => {
    // La biblioteca la gestiona el administrador (sección 'biblioteca') y también
    // el superadmin (sección 'superadmin').
    if (apiMode && sessionUser && (adminSection === 'superadmin' || adminSection === 'biblioteca')) void reloadSuperBiblioteca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, adminSection]);
  function cargarProductosDeTienda(storeId: string) {
    setSuperStoreProducts([]);
    if (!storeId) return;
    void apiSuperStoreProducts(storeId).then(({ data }) => { if (data) setSuperStoreProducts(data.productos); });
  }
  function enviarProductoABiblioteca(productId: string, gratis: boolean, precioImportacion: number, editable = true) {
    void apiSuperBibliotecaFromProduct(productId, gratis, precioImportacion, editable).then((r) => { if (!r.error) void reloadSuperBiblioteca(); });
  }
  function actualizarBibliotecaItem(id: string, patch: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean; editable?: boolean }) {
    setSuperBiblioteca((st) => st.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    void apiSuperBibliotecaPatch(id, patch).then((r) => { if (r.error) void reloadSuperBiblioteca(); });
  }
  function eliminarBibliotecaItem(id: string) {
    setSuperBiblioteca((st) => st.filter((p) => p.id !== id));
    void apiSuperBibliotecaDelete(id).then((r) => { if (r.error) void reloadSuperBiblioteca(); });
  }

  // ── PWA: instalar la app ──
  useEffect(() => {
    const listo = () => setPwaDisponible(true);
    const instalada = () => setPwaDisponible(false);
    window.addEventListener('df-pwa-listo', listo);
    window.addEventListener('df-pwa-instalada', instalada);
    return () => {
      window.removeEventListener('df-pwa-listo', listo);
      window.removeEventListener('df-pwa-instalada', instalada);
    };
  }, []);
  function instalarPwa() {
    const w = window as unknown as { dfPwaPrompt?: { prompt: () => void; userChoice?: Promise<unknown> } };
    const p = w.dfPwaPrompt;
    if (!p) return;
    p.prompt();
    void p.userChoice?.then(() => {
      w.dfPwaPrompt = undefined;
      setPwaDisponible(false);
    });
  }

  // ── Suscripción de la tienda (pago a DealFlow) ──
  // Sin plan → se pasa el plan elegido (cobra el valor inicial). Con plan activo → renovación de renta.
  // Se puede pasar un cupón; si el cupón deja el monto en 0 (100%), activa gratis sin pasar por Wompi.
  function pagarSuscripcion(plan?: string, cupon?: string) {
    setSuscMsg('Abriendo el pago…');
    void apiCheckoutSuscripcion(plan, cupon).then((r) => {
      if (r.error) { setSuscMsg(r.error); return; }
      if (r.data?.gratis) {
        setSuscMsg('¡Listo! Tu cupón activó la cuenta. Cargando tu tienda…');
        setTimeout(() => location.reload(), 1200); // recarga ya desbloqueada
        return;
      }
      if (r.data?.url) { window.location.href = r.data.url; return; } // redirige al checkout
      setSuscMsg('No pudimos abrir el pago. Intenta de nuevo.');
    });
  }
  // Valida un cupón y devuelve el descuento para previsualizar el precio en el muro de pago.
  function validarCupon(codigo: string) { return apiValidarCupon(codigo); }

  // ── Multi-tienda por cuenta ──
  async function reloadMisTiendas() { const { data } = await apiMisTiendas(); if (data) setMisTiendas(data.tiendas); }
  function cambiarTienda(id: string) {
    void apiCambiarTienda(id).then((r) => { if (!r.error) location.reload(); }); // recarga con la tienda activa nueva
  }
  function crearTienda(nombre: string) {
    setSuscMsg('Creando tu tienda…');
    void apiCrearTienda(nombre).then((r) => {
      if (r.error) { setSuscMsg(r.error); return; }
      location.reload(); // aterriza en la tienda nueva (pendiente de pago)
    });
  }

  // ── Cupones (gestión del admin de DealFlow) ──
  async function reloadCupones() { const { data } = await apiCupones(); if (data) setCupones(data.cupones); }
  function crearCupon(nuevo: NuevoCupon) {
    setCuponMsg('');
    void apiCrearCupon(nuevo).then((r) => {
      if (r.error) { setCuponMsg(r.error); return; }
      void reloadCupones();
    });
  }
  function toggleCupon(id: string, activo: boolean) { void apiToggleCupon(id, activo).then((r) => { if (!r.error) void reloadCupones(); }); }
  function eliminarCupon(id: string) { void apiEliminarCupon(id).then((r) => { if (!r.error) void reloadCupones(); }); }
  function extenderSuscripcion(storeId: string, dias: number) {
    void apiExtenderSuscripcion(storeId, dias).then((r) => { if (!r.error) void reloadAdmin(); });
  }
  // Carga los planes disponibles cuando la tienda está bloqueada (para el muro de pago).
  useEffect(() => {
    if (suscripcion?.bloqueado && planes.length === 0) {
      void apiPlanes().then(({ data }) => { if (data?.planes) setPlanes(data.planes); });
    }
  }, [suscripcion?.bloqueado, planes.length]);

  // Carga "mis tiendas" (multi-tienda) cuando hay sesión de vendedor.
  useEffect(() => {
    if (apiMode && sessionUser?.role === 'vendedor' && sessionUser?.esDueno !== false) void reloadMisTiendas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser]);

  // Cuando la tienda vuelve del pago (?pago=ok&id=<tx>), verificamos con Wompi y refrescamos.
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.search);
    if (params.get('pago') !== 'ok') return;
    const txId = params.get('id') || ''; // Wompi agrega el id de la transacción a la URL de retorno
    setSuscMsg('¡Gracias! Estamos confirmando tu pago… tu plan se activa en unos segundos.');
    history.replaceState(null, '', location.pathname);
    const refrescar = () => apiSuscripcion().then(({ data }) => {
      if (data?.suscripcion) {
        setSuscripcion(data.suscripcion);
        if (!data.suscripcion.bloqueado) location.reload(); // ya activa → carga la app completa
      }
    });
    // Red de seguridad: preguntamos directo a Wompi si la transacción fue aprobada (no depende del webhook).
    if (txId) void apiVerificarPago(txId).then(() => void refrescar());
    const t = setInterval(() => void refrescar(), 3000);
    setTimeout(() => clearInterval(t), 30000);
    return () => clearInterval(t);
  }, []);

  // ── Integraciones por tienda (API keys propias + IA predeterminada) ──
  async function reloadIntegraciones() {
    const { data } = await apiIntegraciones();
    if (!data) return;
    const map: Record<string, Record<string, string>> = {};
    for (const c of data.configuradas) map[c.tipo] = c.campos;
    setIntegracionesCfg(map);
    setIaPredeterminada(data.iaPredeterminada || 'deepseek');
  }
  useEffect(() => {
    if (apiMode && sessionUser && !isAdmin && section === 'integraciones') { void reloadIntegraciones(); void reloadMetaEstado(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, isAdmin, section]);

  // ── Canales Meta: Messenger + Instagram DM ──
  const [metaEstado, setMetaEstado] = useState<{ messenger: boolean; instagram: boolean; paginas: string[] }>({ messenger: false, instagram: false, paginas: [] });
  const [metaMsg, setMetaMsg] = useState('');
  const [metaLoading, setMetaLoading] = useState(false);
  async function reloadMetaEstado() {
    const { data } = await apiMetaEstado();
    if (data) setMetaEstado(data);
  }
  async function conectarMeta() {
    if (!waSignup?.disponible) { setMetaMsg('La conexión con Meta no está configurada en el servidor.'); return; }
    setMetaMsg(''); setMetaLoading(true);
    try {
      const cfg = waSignup.messagingConfigId || waSignup.configId;
      if (!cfg) { setMetaLoading(false); setMetaMsg('Falta configurar META_MESSAGING_CONFIG_ID en el servidor.'); return; }
      const { abrirLoginConfig } = await import('../lib/metaSignup');
      const code = await abrirLoginConfig(waSignup.appId, cfg);
      const r = await apiMetaConectar(code);
      setMetaLoading(false);
      if (r.error || !r.data) { setMetaMsg(r.error || 'No pudimos conectar tus páginas.'); return; }
      setMetaMsg(`✓ Conectadas ${r.data.paginas.length} página(s).`);
      void reloadMetaEstado();
    } catch (e) {
      setMetaLoading(false);
      setMetaMsg(e instanceof Error ? e.message : 'No pudimos conectar con Meta.');
    }
  }
  function desconectarMeta() {
    void apiMetaDesconectar().then(() => { setMetaMsg(''); void reloadMetaEstado(); });
  }
  function guardarIntegracion(tipo: string, config: Record<string, string>, predeterminada?: boolean) {
    setIntegracionMsg('Guardando…');
    void apiGuardarIntegracion(tipo, config, predeterminada).then((r) => {
      if (r.error) { setIntegracionMsg(r.error); return; }
      setIntegracionMsg('✓ Integración guardada.');
      setTimeout(() => setIntegracionMsg(''), 3500);
      void reloadIntegraciones();
    });
  }
  function eliminarIntegracion(tipo: string) {
    void apiEliminarIntegracion(tipo).then(() => void reloadIntegraciones());
  }
  // Proveedores WooCommerce conectados (dropi/effi) para mostrar los botones de despacho.
  const [wooProveedores, setWooProveedores] = useState<string[]>([]);
  const [wooPreferido, setWooPreferido] = useState<string>('');
  async function reloadWooProveedores() {
    const { data } = await apiWooProveedores();
    if (data) { setWooProveedores(data.proveedores); setWooPreferido(data.preferido || ''); }
  }
  // Define el proveedor de auto-despacho (sin botón). '' = preguntar por pedido.
  function elegirWooPreferido(proveedor: string) {
    setWooPreferido(proveedor); // optimista
    void apiWooPreferido(proveedor).then((r) => { if (r.error) void reloadWooProveedores(); });
  }
  useEffect(() => {
    if (apiMode && sessionUser) void reloadWooProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser]);

  // WooCommerce por proveedor (Dropi/Effi): probar conexión, inventario, productos.
  const nombreProv = (p: string) => (p === 'dropi' ? 'Dropi' : 'Effi');
  function verificarWoo(proveedor: string) {
    setIntegracionMsg(`Probando la conexión con WooCommerce (${nombreProv(proveedor)})…`);
    void apiWooVerificar(proveedor).then((r) => {
      setIntegracionMsg(r.error ? r.error : `✓ Conexión con WooCommerce (${nombreProv(proveedor)}) correcta.`);
      void reloadWooProveedores();
      setTimeout(() => setIntegracionMsg(''), 4000);
    });
  }
  function sincronizarInventarioWoo(proveedor: string) {
    setIntegracionMsg(`Sincronizando inventario desde WooCommerce (${nombreProv(proveedor)})…`);
    void apiWooSyncInventario(proveedor).then((r) => {
      if (r.error || !r.data) { setIntegracionMsg(r.error || 'No se pudo sincronizar.'); return; }
      setIntegracionMsg(`✓ Inventario sincronizado (${r.data.actualizados} productos).`);
      if (apiMode) void reloadProducts();
      setTimeout(() => setIntegracionMsg(''), 4500);
    });
  }
  // Empuja el catálogo de DealFlow al WooCommerce del proveedor elegido.
  function sincronizarProductosWoo(proveedor: string) {
    setIntegracionMsg(`Enviando tus productos a WooCommerce (${nombreProv(proveedor)})…`);
    void apiWooSyncProductos(proveedor).then((r) => {
      if (r.error || !r.data) { setIntegracionMsg(r.error || 'No se pudieron sincronizar los productos.'); return; }
      const { creados, actualizados, skusGenerados } = r.data;
      setIntegracionMsg(`✓ Productos sincronizados: ${creados} creados, ${actualizados} actualizados en WooCommerce${skusGenerados ? ` · ${skusGenerados} SKU generados automáticamente` : ''}.`);
      setTimeout(() => setIntegracionMsg(''), 7000);
    });
  }
  function elegirIaPredeterminada(proveedor: string) {
    setIaPredeterminada(proveedor);
    void apiSetIaPredeterminada(proveedor).then((r) => { if (r.error) { setIntegracionMsg(r.error); void reloadIntegraciones(); } });
  }

  // Etiqueta de conversación en el CRM (manual). La "Venta" también la pone el bot solo.
  function setLeadEtiqueta(id: number | string, etiqueta: string) {
    setApiLeadsState((st) => (st || []).map((l) => (l.id === id ? { ...l, etiqueta } : l)));
    setLeads((st) => st.map((l) => (l.id === id ? { ...l, etiqueta } : l)));
    if (apiMode) void apiSetLeadEtiqueta(String(id), etiqueta);
  }

  // Asignar el chat a un miembro del equipo desde el Inbox (acción rápida).
  function asignarChatCrm(id: number | string, asignado: string) {
    setApiLeadsState((st) => (st || []).map((l) => (l.id === id ? { ...l, asignado } : l)));
    setLeads((st) => st.map((l) => (l.id === id ? { ...l, asignado } : l)));
    if (apiMode) void apiSetLeadAsignado(String(id), asignado);
  }

  // Nota interna del chat (solo la ve el equipo). Se guarda al salir del campo.
  const [notaInternaMsg, setNotaInternaMsg] = useState('');
  function guardarNotaInterna(id: number | string, notaInterna: string) {
    setApiLeadsState((st) => (st || []).map((l) => (l.id === id ? { ...l, notaInterna } : l)));
    setLeads((st) => st.map((l) => (l.id === id ? { ...l, notaInterna } : l)));
    if (apiMode) {
      void apiSetLeadNotaInterna(String(id), notaInterna).then((r) => {
        setNotaInternaMsg(r.error ? 'No se pudo guardar la nota.' : '✓ Nota guardada');
        setTimeout(() => setNotaInternaMsg(''), 2000);
      });
    }
  }

  async function reloadTeam() {
    const { data } = await apiTeamList();
    if (data) setTeam(data.team);
  }
  useEffect(() => {
    if (apiMode && !isAdmin && sessionUser && (section === 'equipo' || section === 'crm')) void reloadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, isAdmin, sessionUser, section]);

  function addTeamMember() {
    const nombre = teamForm.nombre.trim();
    const email = teamForm.email.trim();
    const password = teamForm.password;
    if (!nombre || !email || !password) { setTeamError('Completa nombre, correo y contraseña.'); return; }
    if (password.length < 6) { setTeamError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setTeamSaving(true);
    setTeamError('');
    void apiTeamCreate({ nombre, email, password }).then((r) => {
      setTeamSaving(false);
      if (r.error) { setTeamError(r.error); return; }
      setTeamFormState({ nombre: '', email: '', password: '' });
      void reloadTeam();
    });
  }

  function removeTeamMember(id: string) {
    if (armedDeleteTeamId !== id) {
      setArmedDeleteTeamId(id);
      setTimeout(() => setArmedDeleteTeamId((cur) => (cur === id ? null : cur)), 3500);
      return;
    }
    setArmedDeleteTeamId(null);
    setTeam((st) => st.filter((m) => m.id !== id));
    void apiTeamDelete(id).then((r) => { if (r.error) { setTeamError(r.error); void reloadTeam(); } });
  }

  // ── Créditos del Marketing IA ──
  async function reloadCreditos() {
    const { data } = await apiCreditos();
    if (data) { setCreditos(data.saldo); setCreditosMov(data.movimientos); setPaquetesCreditos(data.paquetes); setCostoCreditos(data.costo); }
  }
  function recargarCreditos(paquete: string) {
    void apiRecargarCreditos(paquete).then((r) => {
      if (r.error || !r.data?.url) { setMkError(r.error || 'No pudimos abrir la recarga.'); return; }
      window.location.href = r.data.url; // checkout de Wompi
    });
  }
  function darCreditos(storeId: string, cantidad: number) {
    void apiDarCreditos(storeId, cantidad).then((r) => { if (!r.error) void reloadAdmin(); });
  }

  async function reloadCampanas() {
    const { data } = await apiCampanas();
    if (data) { setCampanas(data.campanas); setAdsCuenta(data.ads); }
  }
  async function abrirCampana(id: string) {
    setMkError('');
    const { data } = await apiCampana(id);
    setCampana(data?.campana || null);
  }
  function cerrarCampana() { setCampana(null); setMkError(''); }
  function crearCampana(nombre: string, objetivo: string) {
    return apiCrearCampana(nombre, objetivo).then(async (r) => {
      if (r.data?.id) { await reloadCampanas(); await abrirCampana(r.data.id); }
      return r.data?.id;
    });
  }
  function borrarCampana(id: string) {
    void apiBorrarCampana(id).then(() => { setCampana((c) => (c?.id === id ? null : c)); void reloadCampanas(); });
  }
  function renombrarCampana(id: string, nombre: string) {
    setCampana((c) => (c && c.id === id ? { ...c, nombre } : c));
    void apiGuardarCampana(id, { nombre }).then(() => void reloadCampanas());
  }
  /** Guarda ediciones manuales del dueño sobre lo generado. */
  function editarCampana(id: string, patch: { brief?: Brief; creativos?: string[]; copys?: CopysAnuncio }) {
    setCampana((c) => (c && c.id === id ? { ...c, ...patch } : c));
    void apiGuardarCampana(id, patch);
  }

  // Manejo común de las tres llamadas de IA (créditos y errores).
  function trasPaso<T extends { creditos?: number; error?: string; sinCreditos?: boolean }>(
    r: { data?: T; error?: string },
    aplicar: (d: T) => void,
  ) {
    setMkLoading(false);
    if (r.error || !r.data || r.data.error) {
      setMkError(r.data?.error || r.error || 'No se pudo generar. Intenta de nuevo.');
      if (r.data?.sinCreditos) setMkSinCreditos(true);
      return;
    }
    aplicar(r.data);
    if (typeof r.data.creditos === 'number') setCreditos(r.data.creditos);
    void reloadCampanas();
  }

  function pasoProducto(id: string, b: { idea: string; precio?: string; publico?: string; imagen?: string }) {
    setMkLoading(true); setMkError('');
    void apiCampanaProducto(id, b).then((r) =>
      trasPaso(r, (d) => setCampana((c) => (c ? { ...c, brief: d.brief, paso: Math.max(c.paso, 2) } : c))),
    );
  }
  function pasoCreativos(id: string, b: { instruccion?: string; cantidad?: number; tamano?: string }) {
    setMkLoading(true); setMkError('');
    void apiCampanaCreativos(id, b).then((r) =>
      trasPaso(r, (d) => setCampana((c) => (c ? { ...c, creativos: d.creativos, paso: Math.max(c.paso, 3) } : c))),
    );
  }
  function pasoTextos(id: string, b: { tono?: string; cantidad?: number }) {
    setMkLoading(true); setMkError('');
    void apiCampanaTextos(id, b).then((r) =>
      trasPaso(r, (d) => setCampana((c) => (c ? { ...c, copys: d.copys, paso: Math.max(c.paso, 4), estado: 'lista' } : c))),
    );
  }

  // ── Administrador de anuncios del cliente ──
  async function conectarAds() {
    if (!waSignup?.disponible) { setMkError('La conexión con Meta no está configurada en el servidor.'); return; }
    setMkError(''); setMkLoading(true);
    try {
      const cfg = waSignup.messagingConfigId || waSignup.configId;
      if (!cfg) { setMkLoading(false); setMkError('Falta configurar META_MESSAGING_CONFIG_ID en el servidor.'); return; }
      const { abrirLoginConfig } = await import('../lib/metaSignup');
      const code = await abrirLoginConfig(waSignup.appId, cfg);
      const r = await apiAdsConectar(code);
      setMkLoading(false);
      if (r.error || !r.data) { setMkError(r.error || 'No pudimos leer tus cuentas publicitarias.'); return; }
      setAdsOpciones(r.data.opciones);
    } catch (e) {
      setMkLoading(false);
      setMkError(e instanceof Error ? e.message : 'No pudimos conectar con Meta.');
    }
  }
  function elegirCuentaAds(sel: { adAccountId: string; adAccountNombre: string; moneda: string; pageId: string; pageNombre: string }) {
    void apiAdsSeleccionar(sel).then((r) => {
      if (r.error || !r.data) { setMkError(r.error || 'No pudimos guardar la cuenta.'); return; }
      setAdsCuenta(r.data.ads); setAdsOpciones(null);
    });
  }
  function desconectarAds() {
    void apiAdsDesconectar().then((r) => { if (r.data) setAdsCuenta(r.data.ads); });
  }
  function publicarCampana(id: string, b: { presupuesto: number; textoIdx?: number; tituloIdx?: number; descripcionIdx?: number; creativoIdx?: number }) {
    setMkLoading(true); setMkError('');
    return apiPublicarCampana(id, b).then((r) => {
      setMkLoading(false);
      if (r.error || !r.data) { setMkError(r.error || 'Meta no aceptó la publicación.'); return false; }
      setCampana((c) => (c && c.id === id ? { ...c, estado: 'publicada' } : c));
      void reloadCampanas();
      return true;
    });
  }

  function copiarCopy(clave: string, texto: string) {
    try { navigator.clipboard?.writeText(texto); } catch { /* nada */ }
    setMkCopied(clave);
    setTimeout(() => setMkCopied((c) => (c === clave ? null : c)), 1600);
  }

  function reloadPlantillas() {
    void apiPlantillas().then(({ data }) => { if (data) setPlantillas(data.plantillas); });
  }
  useEffect(() => {
    if (apiMode && sessionUser && section === 'dealshop') reloadPlantillas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, section]);


  function instalarPlantilla(id: string, force = false) {
    setInstalando(force ? 'reinstalar:' + id : id);
    setPlantillaMsg('');
    void apiInstalarPlantilla(id, force).then((r) => {
      setInstalando(null);
      if (r.error) { setPlantillaMsg(r.error); return; }
      setPlantillaMsg('¡Plantilla instalada! Tu asistente y el producto de ejemplo ya están listos.');
      reloadPlantillas();
      void reloadProducts();
      void apiState().then(({ data }) => {
        if (data) { setAssistantText(data.assistant?.instrucciones || ''); setRules(data.assistant?.reglas || []); }
      });
    });
  }

  function desinstalarPlantilla(id: string, borrarDatos: boolean) {
    setInstalando('desinstalar:' + id);
    setPlantillaMsg('');
    void apiDesinstalarPlantilla(id, borrarDatos).then((r) => {
      setInstalando(null);
      if (r.error) { setPlantillaMsg(r.error); return; }
      setPlantillaMsg(borrarDatos ? `Plantilla desinstalada. Se borraron ${r.data?.borrados || 0} ítem(s).` : 'Plantilla desinstalada. Tus productos se conservaron.');
      reloadPlantillas();
      void reloadProducts();
      void apiState().then(({ data }) => {
        if (data) { setAssistantText(data.assistant?.instrucciones || ''); setRules(data.assistant?.reglas || []); }
      });
    });
  }

  function toggleAccount(id: number | string, activa: boolean) {
    setAccounts((st) => st.map((x) => (x.id === id ? { ...x, activa: !x.activa } : x)));
    if (apiMode) void apiToggleStore(String(id), !activa).then((r) => { if (r.error) void reloadAdmin(); });
  }

  // Tema Premium (look neón/glass): lo enciende/apaga el Admin por tienda, como upsell.
  function togglePremiumTema(id: number | string, actual: boolean) {
    setAccounts((st) => st.map((x) => (x.id === id ? { ...x, temaPremium: !x.temaPremium } : x)));
    if (apiMode) void apiTogglePremiumTema(String(id), !actual).then((r) => { if (r.error) void reloadAdmin(); });
  }

  const accountsDecorated: DecoratedAccount[] = useMemo(
    () =>
      accounts.map((a) => {
        // Columna de facturación: cuándo vence la renta y cuántos días faltan (o pasaron).
        const venceMs = a.planVence ? new Date(a.planVence + 'T00:00:00').getTime() : null;
        const diffDias = venceMs != null ? Math.ceil((venceMs - Date.now()) / 86400000) : null;
        let facturacionFecha = a.planVence || '—';
        let facturacionDias = '';
        let facturacionColor = 'var(--df-text-muted)';
        if (a.planEstado === 'sin_plan') {
          facturacionFecha = 'Sin plan';
          facturacionColor = 'var(--df-warning)';
        } else if (a.planEstado === 'vencida') {
          facturacionColor = 'var(--df-danger-dark)';
          facturacionDias = diffDias != null && diffDias < 0 ? `Vencida hace ${-diffDias} día${-diffDias === 1 ? '' : 's'}` : 'Vencida';
        } else if (diffDias != null) {
          facturacionColor = diffDias <= 5 ? 'var(--df-warning)' : 'var(--df-brand-dark)';
          facturacionDias = diffDias >= 0 ? `Vence en ${diffDias} día${diffDias === 1 ? '' : 's'}` : `Vencida hace ${-diffDias} día${-diffDias === 1 ? '' : 's'}`;
        }
        return {
          ...a,
          ventasFmt: a.ventas > 0 ? fmt(a.ventas) : '—',
          estadoLabel: a.activa ? 'Activa' : 'Inactiva',
          estadoStyle: pill(a.activa ? { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' } : { color: 'var(--df-danger-dark)', bg: 'var(--df-danger-subtle-2)' }),
          switchStyle: { width: '40px', height: '23px', borderRadius: '999px', background: a.activa ? 'var(--df-brand)' : 'var(--df-border-strong)', padding: '2.5px', cursor: 'pointer', transition: 'background .15s', boxSizing: 'border-box' },
          knobStyle: { width: '18px', height: '18px', borderRadius: '50%', background: 'var(--df-surface)', transform: a.activa ? 'translateX(17px)' : 'translateX(0)', transition: 'transform .15s', boxShadow: '0 1px 2px rgba(15,23,42,.25)' },
          toggle: () => toggleAccount(a.id, a.activa),
          togglePremium: () => togglePremiumTema(a.id, !!a.temaPremium),
          facturacionFecha,
          facturacionDias,
          facturacionColor,
        };
      }),
    [accounts, apiMode],
  );

  const newOrders = orders.filter((o) => o.estado === 'Nuevo');
  // Valor de un pedido = el TOTAL que realmente paga el cliente (o.total). Ese total
  // ya contempla combos y promos (ej. "3 x $99.900"), así que NO se puede recalcular
  // como cantidad × precio (eso triplicaría un combo). Solo si no hay total guardado
  // se cae a la suma de los ítems + envío. Es el mismo valor que muestra Pedidos.
  const totalPedido = (o: Order) => (o.total && o.total > 0 ? o.total : o.items.reduce((x, it) => x + it.qty * it.precio, 0) + (o.envio || 0));
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const ayerStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const pedidosHoy = orders.filter((o) => (o.fecha || hoyStr) === hoyStr);
  const pedidosAyer = orders.filter((o) => o.fecha === ayerStr);
  const ventasHoy = pedidosHoy.reduce((a, o) => a + totalPedido(o), 0);
  const difAyer = pedidosHoy.length - pedidosAyer.length;
  const ventasComparacion = pedidosHoy.length === 0 && pedidosAyer.length === 0
    ? 'aún sin pedidos hoy'
    : difAyer > 0 ? `↑ ${difAyer} pedido${difAyer === 1 ? '' : 's'} más que ayer`
    : difAyer < 0 ? `↓ ${-difAyer} pedido${difAyer === -1 ? '' : 's'} menos que ayer`
    : 'igual que ayer';
  const resumenFecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });

  // ── Métricas del MES (motivante del resumen) ──
  const mesStr = hoyStr.slice(0, 7); // 'YYYY-MM' del mes en curso (Bogotá)
  const mesNombre = new Date(hoyStr + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', timeZone: 'America/Bogota' });
  const [anioAct, mesAct] = mesStr.split('-').map(Number);
  const dPrev = new Date(anioAct, mesAct - 2, 1); // mes anterior (mesAct es 1-based)
  const mesAntStr = `${dPrev.getFullYear()}-${String(dPrev.getMonth() + 1).padStart(2, '0')}`;
  const pedidosMesArr = orders.filter((o) => (o.fecha || hoyStr).slice(0, 7) === mesStr);
  const pedidosMesAntArr = orders.filter((o) => (o.fecha || '').slice(0, 7) === mesAntStr);
  const ventasMesRaw = pedidosMesArr.reduce((a, o) => a + totalPedido(o), 0);
  const ventasMesAntRaw = pedidosMesAntArr.reduce((a, o) => a + totalPedido(o), 0);
  const pedidosMesCount = pedidosMesArr.length;
  const ticketPromRaw = pedidosMesCount ? Math.round(ventasMesRaw / pedidosMesCount) : 0;
  const difMesPct = ventasMesAntRaw > 0 ? Math.round(((ventasMesRaw - ventasMesAntRaw) / ventasMesAntRaw) * 100) : null;
  const ventasMesComparacion =
    ventasMesRaw === 0 ? 'aún sin ventas este mes'
    : difMesPct === null ? '¡tu primer mes con ventas! 🎉'
    : difMesPct > 0 ? `↑ ${difMesPct}% vs. ${mesAntStr === mesStr ? 'el mes pasado' : 'el mes pasado'}`
    : difMesPct < 0 ? `↓ ${-difMesPct}% vs. el mes pasado`
    : 'igual que el mes pasado';
  // Producto estrella del mes: el más pedido (por unidades).
  const conteoProd = new Map<string, number>();
  for (const o of pedidosMesArr) for (const it of o.items) conteoProd.set(it.nombre, (conteoProd.get(it.nombre) || 0) + (it.qty || 0));
  let prodTopNombre = ''; let prodTopQty = 0;
  for (const [n, q] of conteoProd) if (q > prodTopQty) { prodTopNombre = n; prodTopQty = q; }

  const filterList = ['Todos', ...ESTADOS_TODOS];
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Filtro por fecha del pedido (zona horaria de Bogot\u00e1).
  const [fechaFilter, setFechaFilter] = useState<'Todas' | 'Hoy' | 'Ayer' | '7 d\u00edas'>('Todas');
  const hace7 = new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const pasaFecha = (o: Order) => {
    const f = o.fecha || hoyStr;
    if (fechaFilter === 'Hoy') return f === hoyStr;
    if (fechaFilter === 'Ayer') return f === ayerStr;
    if (fechaFilter === '7 d\u00edas') return f >= hace7;
    return true;
  };
  const filteredOrders: DecoratedOrder[] = useMemo(() => {
    const q = norm(orderQuery.trim());
    return orders
      .filter((o) => filter === 'Todos' || o.estado === filter)
      .filter(pasaFecha)
      .filter((o) => !q || norm(o.cliente).includes(q) || norm(o.id).includes(q) || o.items.some((it) => norm(it.nombre).includes(q)))
      .map(decorateOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, orderQuery, fechaFilter]);
  const orderDateFilters = (['Todas', 'Hoy', 'Ayer', '7 d\u00edas'] as const).map((f) => ({
    key: f,
    label: f,
    active: fechaFilter === f,
    set: () => setFechaFilter(f),
  }));
  const recentOrders: DecoratedOrder[] = useMemo(() => orders.slice(0, 4).map(decorateOrder), [orders]);
  const selRaw = orders.find((o) => o.id === selectedOrderId) || null;
  const sel = selRaw ? decorateOrder(selRaw) : null;

  const orderFilters: OrderFilterOption[] = filterList.map((f) => ({
    key: f,
    label: f,
    count: f === 'Todos' ? orders.length : orders.filter((o) => o.estado === f).length,
    active: filter === f,
    set: () => setFilter(f),
  }));

  function assignLead(v: string) {
    setLeads((st) => st.map((l) => (l.id === selectedLeadId ? { ...l, asignado: v } : l)));
    setAvisoLead('Chat asignado a ' + v + ' ✓');
  }

  function addRule() {
    if (ruleDraft.trim()) {
      setRules((st) => [...st, ruleDraft.trim()]);
      setRuleDraft('');
    }
  }

  function saveAssistant() {
    if (apiMode) void apiPutAssistant({ instrucciones: assistantText, reglas: rules, nombre: assistantNombre, seguimientoActivo, estilo });
    setAssistantSaved(true);
    clearTimeout(assistantTimer.current);
    assistantTimer.current = setTimeout(() => setAssistantSaved(false), 2500);
  }

  function sendCrm() {
    const txt = crmDraft.trim();
    if (!txt) return;
    setCrmDraft('');
    setCrmSendWarn('');
    if (apiMode && apiLeadsState) {
      // Optimista: muestra el mensaje ya, y lo confirma/refresca contra el servidor.
      setApiLeadsState((st) =>
        (st || []).map((l) => (l.id === crmSelectedId ? { ...l, asignado: sessionUser?.nombre || 'Yo', mensajes: [...l.mensajes, { de: 'vendedor' as const, texto: txt, hora: 'ahora' }] } : l)),
      );
      void apiSendLeadMessage(String(crmSelectedId), txt).then((r) => {
        if (r.data && !r.data.enviadoPorWhatsapp && r.data.aviso) setCrmSendWarn(r.data.aviso);
        refrescarLeadsLiviano();
      });
      return;
    }
    setLeads((st) =>
      st.map((l) => (l.id === crmSelectedId ? { ...l, asignado: 'Karla', mensajes: [...l.mensajes, { de: 'vendedor' as const, texto: txt, hora: 'ahora' }] } : l)),
    );
  }

  function sendCrmMedia(file: File) {
    setCrmSendWarn('');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const tipo = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document';
      if (apiMode && apiLeadsState) {
        setApiLeadsState((st) =>
          (st || []).map((l) =>
            l.id === crmSelectedId
              ? { ...l, asignado: sessionUser?.nombre || 'Yo', mensajes: [...l.mensajes, { de: 'vendedor' as const, texto: '', hora: 'ahora', tipo, mediaUrl: dataUrl, mediaMime: file.type, mediaNombre: file.name }] }
              : l,
          ),
        );
        void apiSendLeadMedia(String(crmSelectedId), dataUrl, file.name, '').then((r) => {
          if (r.data && !r.data.enviadoPorWhatsapp && r.data.aviso) setCrmSendWarn(r.data.aviso);
          refrescarLeadsLiviano();
        });
      } else {
        // Demo: solo lo muestra localmente.
        setLeads((st) =>
          st.map((l) =>
            l.id === crmSelectedId
              ? { ...l, mensajes: [...l.mensajes, { de: 'vendedor' as const, texto: '', hora: 'ahora', tipo, mediaUrl: dataUrl, mediaMime: file.type, mediaNombre: file.name }] }
              : l,
          ),
        );
      }
    };
    reader.readAsDataURL(file);
  }

  function crearPlan() {
    if (!planNombre.trim() || !planPrecio) {
      setPlanError(true);
      return;
    }
    const features = planDesc.split(',').map((x) => x.trim()).filter(Boolean);
    if (apiMode) {
      void apiCreatePlan({ nombre: planNombre.trim(), precio: parseInt(planPrecio, 10), features }).then((r) => {
        if (r.error) {
          setPlanError(true);
          return;
        }
        void reloadAdmin();
        setPlanNombre('');
        setPlanPrecio('');
        setPlanDesc('');
        setPlanError(false);
      });
      return;
    }
    setPlans((st) => [
      ...st,
      { id: Date.now(), nombre: planNombre.trim(), precio: parseInt(planPrecio, 10), cuentas: 0, features: features.length ? features : ['Plan nuevo, sin cuentas todavía'] },
    ]);
    setPlanNombre('');
    setPlanPrecio('');
    setPlanDesc('');
    setPlanError(false);
  }

  function crearCuenta() {
    const nombre = accForm.nombre.trim();
    const correo = accForm.correo.trim().toLowerCase();
    if (!nombre || !correo || !accForm.password) {
      setAccError('Faltan el nombre de la tienda, el correo o la contraseña.');
      return;
    }
    if (apiMode) {
      setAccSaving(true);
      setAccError('');
      void apiCreateStore({ nombre, correo, password: accForm.password, plan: accForm.plan }).then((r) => {
        setAccSaving(false);
        if (r.error) {
          setAccError(r.error);
          return;
        }
        void reloadAdmin();
        setAccCreated(`Cuenta creada. ${correo} ya puede entrar con la contraseña que definiste.`);
        setAccForm({ nombre: '', correo: '', password: '', plan: 'Inicio' });
        setNewAccountOpen(false);
        setTimeout(() => setAccCreated(''), 5000);
      });
      return;
    }
    // Modo demo: la cuenta vive solo en el navegador.
    setAccounts((st) => [...st, { id: Date.now(), tienda: nombre, correo, plan: accForm.plan, ventas: 0, activa: true }]);
    setAccCreated(`Cuenta creada para ${correo} (demo).`);
    setAccForm({ nombre: '', correo: '', password: '', plan: 'Inicio' });
    setNewAccountOpen(false);
    setTimeout(() => setAccCreated(''), 5000);
  }

  // ── Admin: editar / eliminar / detalle / impersonar ──
  function abrirEditarStore(id: string) {
    const a = accounts.find((x) => String(x.id) === id);
    if (!a) return;
    setEditStoreId(id);
    setEditStoreForm({ nombre: a.tienda, correo: a.correo, plan: a.plan, password: '' });
    setEditStoreMsg('');
    setDetalleStore(null);
  }
  function guardarEditarStore() {
    if (!editStoreId) return;
    const patch = {
      nombre: editStoreForm.nombre.trim(),
      correo: editStoreForm.correo.trim().toLowerCase(),
      plan: editStoreForm.plan,
      ...(editStoreForm.password ? { password: editStoreForm.password } : {}),
    };
    setEditStoreMsg('Guardando…');
    void apiUpdateStore(editStoreId, patch).then((r) => {
      if (r.error) { setEditStoreMsg(r.error); return; }
      setEditStoreId(null);
      setEditStoreMsg('');
      void reloadAdmin();
    });
  }
  function eliminarStore(id: string) {
    if (armedDeleteStoreId !== id) {
      setArmedDeleteStoreId(id);
      setTimeout(() => setArmedDeleteStoreId((cur) => (cur === id ? null : cur)), 3500);
      return;
    }
    setArmedDeleteStoreId(null);
    setAccounts((st) => st.filter((x) => String(x.id) !== id));
    void apiDeleteStore(id).then((r) => { if (r.error) void reloadAdmin(); });
  }
  function abrirDetalleStore(id: string) {
    setDetalleLoading(true);
    setDetalleStore(null);
    setEditStoreId(null);
    void apiStoreDetalle(id).then((r) => {
      setDetalleLoading(false);
      if (r.data) setDetalleStore(r.data.detalle);
    });
  }
  function cerrarPanelStore() {
    setDetalleStore(null);
    setEditStoreId(null);
  }
  // Pone TODOS los chats de una tienda en intervención humana (que atienda una persona).
  const [intervenirMsg, setIntervenirMsg] = useState('');
  function intervenirTodosLosChats(storeId: string, nombre?: string) {
    setIntervenirMsg('Poniendo todos los chats en intervención humana…');
    void apiIntervenirTodos(storeId, nombre).then((r) => {
      if (r.error || !r.data) { setIntervenirMsg(r.error || 'No se pudo.'); return; }
      setIntervenirMsg(`✓ ${r.data.intervenidos} chat(s) quedaron atendidos por ${r.data.nombre} (el asistente ya no responde en esta tienda).`);
    });
  }
  // Barrido de WhatsApp: sincroniza el número guardado con el que hay hoy en Meta.
  const [waSyncMsg, setWaSyncMsg] = useState('');
  const [waSyncNumeros, setWaSyncNumeros] = useState<{ id: string; numero: string; nombre: string }[]>([]);
  const [waSyncStoreId, setWaSyncStoreId] = useState('');
  function sincronizarWhatsapp(storeId: string, phoneNumberId?: string) {
    setWaSyncStoreId(storeId);
    setWaSyncMsg('Consultando a Meta…');
    setWaSyncNumeros([]);
    void apiSyncWhatsapp(storeId, phoneNumberId).then((r) => {
      if (r.error || !r.data) { setWaSyncMsg(r.error || 'No se pudo sincronizar.'); return; }
      if (r.data.aplicado) {
        setWaSyncMsg(`✓ Número actualizado a ${r.data.aplicado.numero}${r.data.anterior?.numero && r.data.anterior.numero !== r.data.aplicado.numero ? ` (antes ${r.data.anterior.numero})` : ''}.`);
        setWaSyncNumeros([]);
        if (detalleStore && detalleStore.id === storeId) void apiStoreDetalle(storeId).then((d) => { if (d.data) setDetalleStore(d.data.detalle); });
        return;
      }
      if (r.data.needsChoice) {
        setWaSyncMsg('Esta WABA tiene varios números. Elige cuál usar:');
        setWaSyncNumeros(r.data.numeros || []);
      }
    });
  }
  function entrarATienda(id: string) {
    void apiImpersonate(id).then((r) => {
      if (r.error) { setEditStoreMsg(r.error); return; }
      window.location.reload();
    });
  }
  function volverAlAdmin() {
    void apiStopImpersonate().then((r) => {
      if (r.error) return;
      window.location.reload();
    });
  }
  // Entra a la tienda interna "master" para crear/editar productos de la biblioteca
  // con el editor completo (se sale con "Volver al panel de admin").
  function entrarBiblioteca() {
    void apiEntrarBiblioteca().then((r) => {
      if (r.error) return;
      window.location.reload();
    });
  }

  // ── Admin: editar / eliminar planes ──
  function abrirEditarPlan(id: string) {
    const p = plans.find((x) => String(x.id) === id);
    if (!p) return;
    setEditPlanId(id);
    setEditPlanForm({ nombre: p.nombre, precio: String(p.precio), features: (p.features || []).join(', ') });
    setPlanMsg('');
  }
  function guardarEditarPlan() {
    if (!editPlanId) return;
    const features = editPlanForm.features.split(',').map((x) => x.trim()).filter(Boolean);
    setPlanMsg('Guardando…');
    void apiUpdatePlan(editPlanId, { nombre: editPlanForm.nombre.trim(), precio: parseInt(editPlanForm.precio, 10) || 0, features }).then((r) => {
      if (r.error) { setPlanMsg(r.error); return; }
      setEditPlanId(null);
      setPlanMsg('');
      void reloadAdmin();
    });
  }
  function eliminarPlan(id: string) {
    if (armedDeletePlanId !== id) {
      setArmedDeletePlanId(id);
      setPlanMsg('');
      setTimeout(() => setArmedDeletePlanId((cur) => (cur === id ? null : cur)), 3500);
      return;
    }
    setArmedDeletePlanId(null);
    void apiDeletePlan(id).then((r) => {
      if (r.error) { setPlanMsg(r.error); return; }
      void reloadAdmin();
    });
  }

  // Exporta los pedidos a CSV para Excel (BOM UTF-8 + ';' que es el separador
  // que Excel usa con configuración regional de Colombia).
  function exportarPedidos() {
    const lista = ordersRef.current;
    if (!lista.length) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[";\n]/.test(s) ? `"${s}"` : s;
    };
    const filas = [
      ['Pedido', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Departamento', 'Ciudad', 'Dirección', 'Productos', 'Total', 'Envío', 'Estado', 'Transportadora', 'Guía', 'Nota'],
      ...lista.map((o) => [
        o.id, o.fecha || '', o.hora, o.cliente, o.tel, o.departamento || '', o.ciudad, o.direccion,
        o.items.map((it) => `${it.qty}x ${it.nombre}`).join(' + '),
        o.total && o.total > 0 ? o.total : o.items.reduce((x, it) => x + it.qty * it.precio, 0),
        o.envio || 0, o.estado, o.transportadora, o.guia || '', o.nota || '',
      ]),
    ];
    const csv = '\uFEFF' + filas.map((f) => f.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos-dealflow-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const waPill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', background: waConnected ? 'var(--df-brand-subtle-2)' : 'var(--df-danger-subtle)', border: '1px solid ' + (waConnected ? 'var(--df-brand-border)' : 'var(--df-danger-border)'), color: waConnected ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', borderRadius: '999px', padding: '4px 11px', fontSize: '12px', fontWeight: 700 };
  const waDot: CSSProperties = { width: '8px', height: '8px', borderRadius: '50%', background: waConnected ? 'var(--df-brand-mid)' : 'var(--df-danger-mid)' };

  return {
    mode,
    isAdmin,
    isVendedor: !isAdmin,
    isSuperadmin,
    superStores,
    toggleHideStore,
    // ── Registro de actividad ──
    logs,
    logsOpen,
    logsLeadId,
    logsTitulo,
    abrirLogs,
    cerrarLogs,
    reloadLogs,
    limpiarLogs,
    crearPedidoManual,
    crearPedidoMsg,
    setCrearPedidoMsg,
    crearPedidoAbierto,
    crearPedidoPrefill,
    abrirCrearPedido,
    cerrarCrearPedido,
    // Completar pedido desde el chat
    completarAbierto,
    completarCargando,
    completarMsg,
    completarDatos,
    abrirCompletarPedido,
    cerrarCompletarPedido,
    guardarPedidoCompletado,
    reenviarMensaje,
    reenviandoMsg,
    // ── Biblioteca de productos ──
    bibliotecaItems,
    bibliotecaMsg,
    importarDeBiblioteca,
    superBiblioteca,
    superStoreProducts,
    cargarProductosDeTienda,
    enviarProductoABiblioteca,
    actualizarBibliotecaItem,
    eliminarBibliotecaItem,
    setLeadEtiqueta,
    asignarChatCrm,
    guardarNotaInterna,
    notaInternaMsg,
    etiquetasCrm: ETIQUETAS_CRM,
    section,
    adminSection,
    storeId,
    // Estadísticas / Rendimiento
    stats,
    statsCargando,
    statsPreset,
    statsRango,
    elegirStatsPreset,
    setStatsFechas,
    // Flujos de remarketing
    flujos: flujosDecorados,
    flujoTextoDraft,
    setFlujoTextoDraft,
    crearFlujo,
    flujoMsgRemk,
    enviarFlujoRemarketing,
    go,
    goAdmin,
    toggleMode,
    modeBtnLabel: isAdmin ? 'Volver al panel vendedor' : 'Panel de administración',
    headerTitle: isAdmin ? 'DealFlow · Administración' : apiMode ? storeNombre || 'Mi tienda' : 'Luna Accesorios',
    userLabel: apiMode ? sessionUser?.nombre || (isAdmin ? 'Equipo DealFlow' : 'Vendedor') : isAdmin ? 'Equipo DealFlow' : 'Karla',
    userInitials: apiMode ? initials(sessionUser?.nombre || (isAdmin ? 'DealFlow' : 'V')).toUpperCase() : isAdmin ? 'DF' : 'K',
    userRoleLabel: isSuperadmin ? 'Superadmin' : isAdmin ? 'Administrador' : esAgente ? 'Agente' : 'Dueño de la tienda',
    userFoto: sessionUser?.foto || '',
    saludoNombre: apiMode ? (sessionUser?.nombre?.split(' ')[0] || 'Vendedor') : 'Karla',
    storeNombre: storeNombre || 'Tu tienda',
    navStyle,

    waConnected,
    waPill,
    waDot,
    waLabel: waConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado',
    waCardStyleResolved: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: 'var(--df-surface)',
      border: '1px solid ' + (waConnected ? 'var(--df-brand-border)' : 'var(--df-danger-border)'),
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 14,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    } as CSSProperties,
    waBigDot: { width: 12, height: 12, borderRadius: '50%', background: waConnected ? 'var(--df-brand-mid)' : 'var(--df-danger-mid)', flexShrink: 0 } as CSSProperties,
    waStatusTitle: waConnected ? 'Conectado y respondiendo' : 'Sin conexión',
    waToggleBtn: (waConnected
      ? { background: 'var(--df-surface)', color: 'var(--df-danger-dark)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
      : { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }) as CSSProperties,
    waToggleLabel: waConnected ? 'Desconectar' : 'Conectar',
    toggleWa: () => setWaConnected((c) => !c),
    // En el servidor real, el webhook es tu propio dominio; en demo, el de ejemplo.
    webhookUrl: apiMode ? window.location.origin + '/webhooks/whatsapp' : WEBHOOK_URL,
    waCode: apiMode ? waVerifyToken || WA_CODE : WA_CODE,
    copied,
    copyWebhook: () => copy('webhook', apiMode ? window.location.origin + '/webhooks/whatsapp' : WEBHOOK_URL),
    copyCode: () => copy('code', apiMode ? waVerifyToken || WA_CODE : WA_CODE),
    webhookBtnLabel: copied === 'webhook' ? '✓ Copiado' : 'Copiar',
    codeBtnLabel: copied === 'code' ? '✓ Copiado' : 'Copiar',

    newOrdersCount: newOrders.length,
    hasNewOrders: newOrders.length > 0,
    ventasHoy: fmt(ventasHoy),
    pedidosHoyCount: pedidosHoy.length,
    ventasComparacion,
    ventasComparacionColor: difAyer > 0 ? 'var(--df-brand)' : difAyer < 0 ? 'var(--df-danger)' : 'var(--df-text-muted)',
    resumenFecha,
    // Métricas del mes (motivante del resumen).
    mesNombre,
    ventasMes: fmt(ventasMesRaw),
    ventasMesComparacion,
    ventasMesComparacionColor: difMesPct === null ? 'var(--df-brand)' : difMesPct > 0 ? 'var(--df-brand)' : difMesPct < 0 ? 'var(--df-danger)' : 'var(--df-text-muted)',
    pedidosMesCount,
    ticketPromedio: fmt(ticketPromRaw),
    productoTopMes: prodTopNombre,
    productoTopUnidades: prodTopQty,
    leadsCount: leadsSource.length,
    productCount: products.length,
    recentOrders,
    exportarPedidos,

    orderFilters,
    orderDateFilters,
    filter,
    filteredOrders,
    noOrders: filteredOrders.length === 0,
    orderQuery,
    setOrderQuery,

    hasSelectedOrder: !!sel,
    sel,
    closeOrder: () => setSelectedOrderId(null),
    selAdvance: () => sel && advanceOrder(sel.id),
    selAdvanceLabel: sel && sel.hasNext ? sel.advanceLabel + ' este pedido' : '',
    selHasNext: !!(sel && sel.hasNext),
    selIsDone: !!(sel && sel.isDone),

    leads: leadsDecorated,
    hasLead: !!lead,
    lead,
    leadAsignado: lead ? lead.asignado : 'Asistente (bot)',
    assignLead,
    avisoLead: avisoLead || '',
    hasAvisoLead: !!avisoLead,

    crmChats,
    hasCrmChat: !!crmChat,
    crmChat,
    liveCount: crmChats.filter((c) => c.live).length,

    menuOpen,
    openMenu: () => setMenuOpen(true),
    closeMenu: () => setMenuOpen(false),
    mobileChatOpen,
    openMobileChat: (id: number | string) => {
      setCrmSelectedId(id);
      setMobileChatOpen(true);
    },
    closeMobileChat: () => {
      setMobileChatOpen(false);
    },
    // El estado de intervención se DERIVA del chat real (su "asignado"), no de un
    // booleano suelto: así queda guardado y no se desincroniza al cambiar de chat.
    crmTyping: !apiMode && !!(crmChat && crmChat.live && crmChatBot),
    crmIntervening: !!crmChat && !crmChatBot,
    crmNotIntervening: !crmChat || crmChatBot,
    intervene: () => {
      if (crmSelectedId != null) asignarChatCrm(crmSelectedId, sessionUser?.nombre || 'Vendedor');
    },
    backToBot: () => {
      if (crmSelectedId != null) asignarChatCrm(crmSelectedId, 'Asistente (bot)');
    },
    // Lista mínima de productos (id + nombre) para el menú de "Flujos" del inbox.
    flujoProductos: productsDecorated.map((p) => ({ id: p.id, nombre: p.nombre })),
    flujoMsg,
    // Dispara manualmente el mensaje inicial de un producto en el chat actual y deja
    // al asistente esperando la respuesta (para cuando Meta/el disparador falla).
    enviarFlujoInicial: (productId: number | string) => {
      if (crmSelectedId == null || !apiMode) return;
      setFlujoMsg('Enviando mensaje inicial…');
      void apiEnviarFlujoInicial(String(crmSelectedId), String(productId)).then((r) => {
        if (r.error) { setFlujoMsg(r.error); return; }
        setFlujoMsg('✓ Mensaje inicial enviado. El asistente queda esperando la respuesta.');
        cargarMensajesChat(crmSelectedId);
        refrescarLeadsLiviano();
        setTimeout(() => setFlujoMsg(''), 4000);
      });
    },
    crmDeleteArmed,
    requestDeleteChat: () => {
      if (!crmDeleteArmed) {
        setCrmDeleteArmed(true);
        clearTimeout(crmDeleteTimer.current);
        crmDeleteTimer.current = setTimeout(() => setCrmDeleteArmed(false), 3500);
        return;
      }
      clearTimeout(crmDeleteTimer.current);
      setCrmDeleteArmed(false);
      const id = crmSelectedId;
      if (apiMode) void apiDeleteLead(String(id));
      const restantesApi = (apiLeadsState || []).filter((l) => l.id !== id);
      setApiLeadsState(apiLeadsState ? restantesApi : null);
      setLeads((st) => st.filter((l) => l.id !== id));
      const siguiente = restantesApi[0]?.id ?? leads.filter((l) => l.id !== id)[0]?.id;
      if (siguiente !== undefined) {
        setCrmSelectedId(siguiente);
        setSelectedLeadId(siguiente);
      }
      setMobileChatOpen(false);
    },
    resetChat: () => {
      const id = crmSelectedId;
      if (apiMode) void apiResetLead(String(id));
      setApiLeadsState((st) => (st || []).map((l) => (l.id === id ? { ...l, asignado: 'Asistente (bot)', etapa: 'Explorando', mensajes: [], ultimo: '', hora: '' } : l)));
      setLeads((st) => st.map((l) => (l.id === id ? { ...l, asignado: 'Asistente (bot)', mensajes: [], ultimo: '' } : l)));
    },
    crmDraft,
    setCrmDraft,
    sendCrm,
    sendCrmMedia,
    crmSendWarn,
    clearCrmSendWarn: () => setCrmSendWarn(''),

    // ── Equipo ──
    team: team.map((m) => ({
      ...m,
      armed: armedDeleteTeamId === m.id,
      remove: () => removeTeamMember(m.id),
    })),
    teamForm,
    setTeamNombre: (v: string) => { setTeamFormState((f) => ({ ...f, nombre: v })); setTeamError(''); },
    setTeamEmail: (v: string) => { setTeamFormState((f) => ({ ...f, email: v })); setTeamError(''); },
    setTeamPassword: (v: string) => { setTeamFormState((f) => ({ ...f, password: v })); setTeamError(''); },
    teamError,
    teamSaving,
    addTeamMember,

    // ── Marketing IA ──
    campanas, campana, reloadCampanas, abrirCampana, cerrarCampana,
    crearCampana, borrarCampana, renombrarCampana, editarCampana,
    pasoProducto, pasoCreativos, pasoTextos,
    mkLoading, mkError, setMkError,
    mkCopied, copiarCopy,
    adsCuenta, adsOpciones, conectarAds, elegirCuentaAds, desconectarAds, publicarCampana,
    metaEstado, metaMsg, metaLoading, conectarMeta, desconectarMeta,
    mkSinCreditos,
    creditos,
    creditosMov,
    paquetesCreditos,
    costoCreditos,
    reloadCreditos,
    recargarCreditos,
    darCreditos,
    limpiarSinCreditos: () => setMkSinCreditos(false),

    // ── DealShop (plantillas) ──
    plantillas,
    instalando,
    plantillaMsg,
    instalarPlantilla,
    desinstalarPlantilla,

    products: productsDecorated,
    productRuleDraft,
    setProductRuleDraft,
    faqP,
    setFaqP,
    faqR,
    setFaqR,
    bloqueTexto,
    setBloqueTexto,
    videoWarn,
    mediaWarn,
    bundleCantidad,
    setBundleCantidad: (v: string) => setBundleCantidad(v.replace(/[^0-9]/g, '')),
    bundlePrecio,
    setBundlePrecio: (v: string) => setBundlePrecio(v.replace(/[^0-9]/g, '')),
    bundleEtiqueta,
    setBundleEtiqueta,

    newProductOpen,
    toggleNewProduct: () => {
      setNewProductOpen((o) => !o);
      setNewProdError(false);
    },
    newProdNombre,
    setNewProdNombre: (v: string) => {
      setNewProdNombre(v);
      setNewProdError(false);
    },
    newProdPrecio,
    setNewProdPrecio: (v: string) => {
      setNewProdPrecio(v.replace(/[^0-9]/g, ''));
      setNewProdError(false);
    },
    newProdStock,
    setNewProdStock: (v: string) => setNewProdStock(v.replace(/[^0-9]/g, '')),
    newProdTipo,
    setNewProdTipo,
    newProdDuracion,
    setNewProdDuracion,
    newProdError,
    crearProducto,

    variantFormOpen,
    openVariantForm: () => setVariantFormOpen(true),
    cancelVariantForm: () => {
      setVariantFormOpen(false);
      setVariantLabel('');
      setVariantStock('');
    },
    variantLabel,
    setVariantLabel,
    variantStock,
    setVariantStock: (v: string) => setVariantStock(v.replace(/[^0-9]/g, '')),

    resetDemo,

    isLoggedIn: !!sessionUser,
    sessionUser,
    canAdmin: sessionUser?.role === 'admin',
    esAgente,
    esDueno: !esAgente && sessionUser?.role === 'vendedor',
    puedeVerSeccion,
    apiMode,
    login: (email: string, password: string) => void login(email, password),
    registrar: (nombre: string, negocio: string, email: string, password: string) => void registrar(nombre, negocio, email, password),
    logout,
    loginError,
    clearLoginError: () => setLoginError(''),

    waCfg,
    waForm,
    setWaForm: (patch: Partial<typeof waForm>) => {
      setWaForm((f) => ({ ...f, ...patch }));
      setWaError('');
    },
    waLinking,
    waError,
    vincularWa,
    desvincularWa,
    waSignup,
    waSignupAuto,
    waEstado,
    waEstadoCargando,
    revisarNumero: () => void revisarNumero(),
    conectarConFacebook: () => void conectarConFacebook(),
    waMethod,
    setWaMethod,
    waModo,
    qrEstado,
    qrImg,
    qrError,
    iniciarQr,

    incoming: incomingOrder ? decorateOrder(incomingOrder) : null,
    dismissToast: () => {
      clearTimeout(toastTimer.current);
      setIncomingOrder(null);
    },
    soundOn,
    toggleSound: () => {
      setSoundOn((s) => {
        if (!s) playOrderChime();
        return !s;
      });
    },

    // Notificaciones del navegador (web/PWA).
    notifPrefs,
    notifPermiso,
    toggleNotificaciones,
    setNotifTipo,

    // Menú lateral (vista web): mostrar/ocultar + botón flotante opcional.
    sidebarVisible,
    toggleSidebar: () => {
      setSidebarVisible((v) => {
        const nv = !v;
        try { localStorage.setItem('dealflow:sidebar', nv ? '1' : '0'); } catch { /* modo privado */ }
        return nv;
      });
    },
    floatingNav,
    toggleFloatingNav: () => {
      setFloatingNav((v) => {
        const nv = !v;
        try { localStorage.setItem('dealflow:floatnav', nv ? '1' : '0'); } catch { /* modo privado */ }
        return nv;
      });
    },

    // Tema visual: 'light' | 'dark' ("Dark System") | 'premium' (si el Admin lo habilitó,
    // o siempre para las cuentas de Admin/Superadmin).
    theme,
    setTheme,
    premiumHabilitado: premiumPermitido,

    // Perfil de la cuenta: nombre, foto, contraseña.
    actualizarNombrePerfil,
    subirFotoPerfil,
    cambiarPasswordPerfil,
    perfilMsg,
    perfilBusy,
    passMsg,
    passBusy,

    newPromoOpen,
    toggleNewPromo: () => {
      setNewPromoOpen((o) => !o);
      setPromoError(false);
    },
    promoTipo,
    setPromoTipo,
    promoTitulo,
    setPromoTitulo: (v: string) => {
      setPromoTitulo(v);
      setPromoError(false);
    },
    promoDesc,
    setPromoDesc: (v: string) => {
      setPromoDesc(v);
      setPromoError(false);
    },
    promoVigencia,
    setPromoVigencia,
    promoError,
    crearPromo,

    copyGuia: (guia: string) => copy('guia', guia),
    guiaBtnLabel: copied === 'guia' ? '✓ Copiado' : 'Copiar',
    promos: promosDecorated,
    rules: rulesDecorated,
    ruleDraft,
    setRuleDraft,
    addRule,

    assistantText,
    setAssistantText: (v: string) => {
      setAssistantText(v);
      setAssistantSaved(false);
    },
    assistantNombre,
    setAssistantNombre: (v: string) => {
      setAssistantNombre(v);
      setAssistantSaved(false);
    },
    seguimientoActivo,
    // El interruptor de actividad automática se guarda al instante.
    toggleSeguimientoActivo: () => {
      const nuevo = !seguimientoActivo;
      setSeguimientoActivo(nuevo);
      if (apiMode) void apiPutAssistant({ instrucciones: assistantText, reglas: rules, nombre: assistantNombre, seguimientoActivo: nuevo, estilo });
    },
    estilo,
    // Cambia un aspecto del tono/estilo y lo guarda al instante.
    setEstiloCampo: (patch: Partial<{ trato: 'tu' | 'usted'; emojis: boolean; largo: 'corto' | 'detallado' }>) => {
      const nuevo = { ...estilo, ...patch };
      setEstilo(nuevo);
      if (apiMode) void apiPutAssistant({ instrucciones: assistantText, reglas: rules, nombre: assistantNombre, seguimientoActivo, estilo: nuevo });
    },
    saveAssistant,
    assistantSaved,

    integrations: integrationsDecorated,
    suscripcion,
    suscMsg,
    misTiendas,
    cambiarTienda,
    crearTienda,
    planes,
    pagarSuscripcion,
    validarCupon,
    extenderSuscripcion,
    cupones,
    cuponMsg,
    reloadCupones,
    crearCupon,
    toggleCupon,
    eliminarCupon,
    clearCuponMsg: () => setCuponMsg(''),
    pwaDisponible,
    instalarPwa,
    integracionesCfg,
    iaPredeterminada,
    integracionMsg,
    effiMsg,
    verificarWoo,
    sincronizarInventarioWoo,
    sincronizarProductosWoo,
    wooProveedores,
    wooPreferido,
    elegirWooPreferido,
    guardarIntegracion,
    eliminarIntegracion,
    elegirIaPredeterminada,
    plans: plansDecorated,
    accounts: accountsDecorated,
    planNames: plansDecorated.map((p) => p.nombre),
    newAccountOpen,
    toggleNewAccount: () => {
      setNewAccountOpen((o) => !o);
      setAccError('');
    },
    accForm,
    setAccForm: (patch: Partial<typeof accForm>) => {
      setAccForm((f) => ({ ...f, ...patch }));
      setAccError('');
    },
    accError,
    accSaving,
    accCreated,
    crearCuenta,

    // Admin: gestión de cuentas
    abrirEditarStore,
    guardarEditarStore,
    editStoreId,
    editStoreForm,
    setEditStoreForm: (patch: Partial<typeof editStoreForm>) => setEditStoreForm((f) => ({ ...f, ...patch })),
    editStoreMsg,
    eliminarStore,
    armedDeleteStoreId,
    abrirDetalleStore,    cerrarPanelStore,
    detalleStore,
    detalleLoading,
    entrarATienda,
    // Barrido de WhatsApp con Meta
    sincronizarWhatsapp,
    waSyncMsg,
    waSyncNumeros,
    waSyncStoreId,
    // Intervención humana masiva
    intervenirTodosLosChats,
    intervenirMsg,
    volverAlAdmin,
    entrarBiblioteca,
    // Onboarding: configura el asistente + crea productos de una tienda (para dar de alta un cliente).
    onboardingAsistente: (storeId: string, body: { nombre?: string; estilo?: { trato?: string; emojis?: boolean; largo?: string }; instrucciones?: string; reglas?: string[]; productos?: string[] }) => apiOnboardingTienda(storeId, body),
    impersonando: !!sessionUser?.impersonando,
    tiendaImpersonada: sessionUser?.tiendaNombre || storeNombre || '',
    // Admin: gestión de planes
    abrirEditarPlan,
    guardarEditarPlan,
    editPlanId,
    editPlanForm,
    setEditPlanForm: (patch: Partial<typeof editPlanForm>) => setEditPlanForm((f) => ({ ...f, ...patch })),
    eliminarPlan,
    armedDeletePlanId,
    planMsg,

    planNombre,
    setPlanNombre: (v: string) => {
      setPlanNombre(v);
      setPlanError(false);
    },
    planPrecio,
    setPlanPrecio: (v: string) => {
      setPlanPrecio(v.replace(/[^0-9]/g, ''));
      setPlanError(false);
    },
    planDesc,
    setPlanDesc,
    planError,
    crearPlan,
  };
}

export type DealFlowState = ReturnType<typeof useDealFlowState>;
