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
  apiAssignLead,
  apiCreatePlan,
  apiCreateProduct,
  apiDeleteProduct,
  apiDeleteVariant,
  apiPatchProduct,
  apiPatchVariant,
  apiPutAssistant,
  apiCreateStore,
  apiLeads,
  // apiAssignLead disponible para asignación desde el CRM (próximo)
  apiLogin,
  apiLogout,
  apiMe,
  apiDeleteLead,
  apiResetLead,
  apiSendLeadMedia,
  apiSendLeadMessage,
  apiState,
  apiUpload,
  apiOrders,
  apiOrderAdvance,
  apiOrderDropi,
  apiTeamList,
  apiTeamCreate,
  apiTeamDelete,
  apiMarketingCopy,
  apiMarketingImagen,
  apiPlantillas,
  apiInstalarPlantilla,
  apiToggleStore,
  apiUpdateStore,
  apiDeleteStore,
  apiStoreDetalle,
  apiImpersonate,
  apiStopImpersonate,
  apiUpdatePlan,
  apiDeletePlan,
  apiWaLinkCloud,
  apiWaQrStart,
  apiWaQrStatus,
  apiWaUnlink,
  apiSetLeadEtiqueta,
  apiSuperStores,
  apiToggleHideStore,
  apiIntegraciones,
  apiGuardarIntegracion,
  apiEliminarIntegracion,
  apiSetIaPredeterminada,
} from '../lib/api';
import type { ApiLead, ApiOrder, ApiProduct, Plantilla, TeamMember, AdminStoreDetalle, SuperStore } from '../lib/api';
import { fmt } from '../lib/format';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '../lib/persist';
import { playOrderChime } from '../lib/sound';
import { AVATAR_COLORS, ESTADOS, ESTADO_ORDER, ETAPA_CFG, initials, pill, stockPillCfg, swatch } from '../lib/style';
import type {
  Account,
  AdminSection,
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

export interface DecoratedOrder extends Order {
  totalFmt: string;
  envioFmt: string;
  itemsResumen: string;
  itemsDecorated: (OrderItem & { precioFmt: string })[];
  pillStyle: CSSProperties;
  hasNext: boolean;
  isDone: boolean;
  advanceLabel: string;
  hasNota: boolean;
  hasGuia: boolean;
  advance: () => void;
  open: () => void;
  sendToDropi: () => void;
  timeline: { estado: string; dotStyle: CSSProperties; labelStyle: CSSProperties }[];
}

export interface DecoratedMensaje extends Mensaje {
  rowStyle: CSSProperties;
  bubbleStyle: CSSProperties;
  horaStyle: CSSProperties;
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
  reglasDecoradas: { texto: string; remove: () => void }[];
  addRegla: () => void;
  save: () => void;
  saved: boolean;
  addVariante: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
  setNombre: (v: string) => void;
  setPrecio: (v: string) => void;
  setDescripcion: (v: string) => void;
  setCaracteristicas: (v: string) => void;
  setMensajeInicial: (v: string) => void;
  setModosUso: (v: string) => void;
  faqsDecoradas: { pregunta: string; respuesta: string; remove: () => void }[];
  addFaq: () => void;
  testimoniosList: string[];
  addTestimonios: (files: File[]) => void;
  removeTestimonio: (index: number) => void;
  videosList: string[];
  addVideos: (files: File[]) => void;
  removeVideo: (index: number) => void;
  bloquesDecorados: (MensajeBloque & { remove: () => void })[];
  addBloqueTexto: () => void;
  addBloqueImagen: (files: File[]) => void;
  addBloqueVideo: (files: File[]) => void;
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
  setDropiId: (v: string) => void;
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
}

export interface OrderFilterOption {
  key: string;
  label: string;
  set: () => void;
  style: CSSProperties;
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
    ultimo: l.mensajes.length ? l.mensajes[l.mensajes.length - 1].texto : '',
    hora: l.mensajes.length ? l.mensajes[l.mensajes.length - 1].hora : '',
    etapa: (ETAPAS_VALIDAS.includes(l.etapa) ? l.etapa : 'Explorando') as Lead['etapa'],
    asignado: l.asignado,
    etiqueta: l.etiqueta || '',
    canal: l.canal || 'whatsapp',
    mensajes: l.mensajes.map((m) => ({
      de: (m.de === 'bot' || m.de === 'vendedor' ? m.de : 'cliente') as Mensaje['de'],
      texto: m.texto,
      hora: m.hora,
      tipo: m.tipo,
      mediaUrl: m.mediaUrl,
      mediaMime: m.mediaMime,
      mediaNombre: m.mediaNombre,
    })),
  }));
}

const ESTADOS_PEDIDO = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado'];
/** Fecha (YYYY-MM-DD) en Bogotá a partir del datetime UTC del servidor. */
function fechaBogota(iso?: string): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (!iso) return hoy;
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  return isNaN(+d) ? hoy : d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
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
    color: p.color || '#E0E7FF',
    txt: p.txt || '#4338CA',
    reglas: p.reglas || [],
    descripcion: p.descripcion || '',
    caracteristicas: p.caracteristicas || '',
    mensajeInicial: p.mensajeInicial || '',
    faqs: p.faqs || [],
    testimonios: p.testimonios || [],
    modosUso: p.modosUso || '',
    videos: p.videos || [],
    mensajeBloques: (p.mensajeBloques || []).filter((b): b is MensajeBloque => b.tipo === 'texto' || b.tipo === 'imagen' || b.tipo === 'video'),
    bundles: p.bundles || [],
    opciones: (p.opciones || []).filter((o) => o && typeof o.nombre === 'string' && Array.isArray(o.valores)).map((o) => ({
      nombre: o.nombre,
      valores: o.valores.map((v) => (typeof v === 'string' ? { valor: v } : { valor: v.valor, foto: v.foto })),
    })),
    contenidoPaquete: p.contenidoPaquete || '',
    disparador: p.disparador || '',
    mensajeInicialActivo: p.mensajeInicialActivo !== false,
    dropiId: p.dropiId || '',
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
    color: active ? '#fff' : '#94A3B8',
    background: active ? 'rgba(5,150,105,.32)' : 'transparent',
  };
}

export function useDealFlowState() {
  const [snap] = useState(loadSnapshot);
  const [mode, setMode] = useState<Mode>('vendedor');
  const [section, setSection] = useState<VendedorSection>('resumen');
  const [adminSection, setAdminSection] = useState<AdminSection>('ventas');
  const [filter, setFilter] = useState<string>('Todos');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | string | null>(7);
  const [selectedLeadId, setSelectedLeadId] = useState<number | string>(1);
  const [crmSelectedId, setCrmSelectedId] = useState<number | string>(1);
  const [crmIntervening, setCrmIntervening] = useState<boolean>(false);
  const [crmDraft, setCrmDraft] = useState<string>('');
  const [copied, setCopied] = useState<'webhook' | 'code' | 'guia' | null>(null);
  const [flowMsg, setFlowMsg] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<string>('');
  const [assistantSaved, setAssistantSaved] = useState<boolean>(false);
  const [flowSel, setFlowSel] = useState<string>('Recuperar carrito');
  const [planNombre, setPlanNombre] = useState<string>('');
  const [planPrecio, setPlanPrecio] = useState<string>('');
  const [planDesc, setPlanDesc] = useState<string>('');
  const [planError, setPlanError] = useState<boolean>(false);
  const [waConnected, setWaConnected] = useState<boolean>(snap?.waConnected ?? true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [mobileChatOpen, setMobileChatOpen] = useState<boolean>(false);
  const [assistantText, setAssistantText] = useState<string>(snap?.assistantText ?? ASSISTANT_TEXT_DEFAULT);
  const [rules, setRules] = useState<string[]>(snap?.rules ?? RULES_DEFAULT);
  const [orders, setOrders] = useState<Order[]>(snap?.orders ?? ORDERS);
  const [products, setProducts] = useState<Product[]>(snap?.products ?? PRODUCTS);
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
  const [newProdError, setNewProdError] = useState<boolean>(false);
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
  const [promos, setPromos] = useState<Promo[]>(snap?.promos ?? PROMOS);
  const [leads, setLeads] = useState<Lead[]>(snap?.leads ?? LEADS);
  const [integrations] = useState<Integration[]>(INTEGRATIONS);
  const [plans, setPlans] = useState<Plan[]>(snap?.plans ?? PLANS);
  const [accounts, setAccounts] = useState<Account[]>(snap?.accounts ?? ACCOUNTS);
  const [armedDeleteProductId, setArmedDeleteProductId] = useState<number | string | null>(null);
  const [armedDeletePromoId, setArmedDeletePromoId] = useState<number | string | null>(null);
  const [armedDeleteVariant, setArmedDeleteVariant] = useState<{ productId: number | string; index: number } | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(snap?.soundOn ?? true);
  const [orderQuery, setOrderQuery] = useState<string>('');
  const [sessionUser, setSessionUser] = useState<{ nombre: string; email: string; role: 'vendedor' | 'admin' | 'superadmin'; esDueno?: boolean; impersonando?: boolean; tiendaNombre?: string } | null>(() => {
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
  const [integracionesCfg, setIntegracionesCfg] = useState<Record<string, Record<string, string>>>({});
  const [iaPredeterminada, setIaPredeterminada] = useState('deepseek');
  const [integracionMsg, setIntegracionMsg] = useState('');
  // PWA: el navegador avisa cuándo se puede instalar (index.html captura el prompt).
  const [pwaDisponible, setPwaDisponible] = useState<boolean>(() => typeof window !== 'undefined' && !!(window as unknown as { dfPwaPrompt?: unknown }).dfPwaPrompt);
  const [waVerifyToken, setWaVerifyToken] = useState<string>('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [mkIdea, setMkIdea] = useState('');
  const [mkPlataforma, setMkPlataforma] = useState('Instagram/Facebook');
  const [mkTono, setMkTono] = useState('Cercano y vendedor');
  const [mkObjetivo, setMkObjetivo] = useState('Que escriban por WhatsApp para comprar');
  const [mkCopys, setMkCopys] = useState<string[]>([]);
  const [mkLoading, setMkLoading] = useState(false);
  const [mkError, setMkError] = useState('');
  const [mkImgPrompt, setMkImgPrompt] = useState('');
  const [mkImgUrl, setMkImgUrl] = useState('');
  const [mkImgLoading, setMkImgLoading] = useState(false);
  const [mkImgError, setMkImgError] = useState('');
  const [mkCopied, setMkCopied] = useState<number | null>(null);
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
  const [waMethod, setWaMethod] = useState<'qr' | 'cloud'>('qr');
  const [waModo, setWaModo] = useState<'cloud' | 'qr'>('cloud');
  const [qrEstado, setQrEstado] = useState<'inactivo' | 'iniciando' | 'qr' | 'conectado' | 'error'>('inactivo');
  const [qrImg, setQrImg] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');
  const [apiLeadsState, setApiLeadsState] = useState<Lead[] | null>(null);
  const [crmSendWarn, setCrmSendWarn] = useState('');

  // Guarda los datos de la demo en el navegador: los cambios sobreviven al refrescar.
  useEffect(() => {
    saveSnapshot({ orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn, waCfg });
  }, [orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn, waCfg]);

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

  function sendToDropi(id: string) {
    const o = ordersRef.current.find((x) => x.id === id);
    if (!o || o.guia) return;
    const guia = String(402000 + Math.floor(Math.random() * 900) + 100);
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, guia } : x)));
    if (apiMode && o.rowId) void apiOrderDropi(o.rowId).then((r) => {
      if (r.data?.guia) setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, guia: r.data!.guia } : x)));
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
      itemsResumen: o.items.map((it) => it.qty + '× ' + it.nombre).join(' · '),
      itemsDecorated: o.items.map((it) => ({ ...it, precioFmt: '' })), // solo mostramos el total del pedido
      pillStyle: pill(cfg),
      hasNext: !!cfg.next,
      isDone: !cfg.next,
      advanceLabel: cfg.next || '',
      hasNota: !!o.nota,
      hasGuia: !!o.guia,
      advance: () => advanceOrder(o.id),
      open: () => {
        setSelectedOrderId(o.id);
        setSection('pedidos');
      },
      sendToDropi: () => sendToDropi(o.id),
      timeline: ESTADO_ORDER.map((est) => {
        const done = ESTADO_ORDER.indexOf(est) <= ESTADO_ORDER.indexOf(o.estado);
        return {
          estado: est,
          dotStyle: { width: '10px', height: '10px', borderRadius: '50%', background: done ? ESTADOS[est].color : '#E2E8F0', flexShrink: 0 },
          labelStyle: { fontSize: '13px', fontWeight: done ? 600 : 400, color: done ? '#1E293B' : '#94A3B8' },
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
        background: m.de === 'cliente' ? '#fff' : m.de === 'vendedor' ? '#059669' : '#D1FAE5',
        color: m.de === 'vendedor' ? '#fff' : '#1E293B',
        border: m.de === 'vendedor' ? 'none' : '1px solid ' + (m.de === 'cliente' ? '#E2E8F0' : '#A7F3D0'),
        fontSize: '13px',
        lineHeight: 1.5,
      },
      horaStyle: {
        display: 'block',
        fontSize: '10.5px',
        color: m.de === 'vendedor' ? 'rgba(255,255,255,.75)' : '#94A3B8',
        marginTop: '3px',
        textAlign: 'right',
      },
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
      rowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selL ? '#ECFDF5' : '#fff', borderLeft: selL ? '3px solid #059669' : '3px solid transparent' },
      select: () => onSelect(l.id),
      mensajesDecorated: l.mensajes.map(decorateMensaje),
    };
  }

  // En modo servidor, los leads vienen de la API; en demo, del estado local.
  const leadsSource = apiMode && apiLeadsState ? apiLeadsState : leads;

  const leadsDecorated = useMemo(
    () => leadsSource.map((l, i) => decorateLead(l, i, selectedLeadId, (id) => { setSelectedLeadId(id); setFlowMsg(null); })),
    [leadsSource, selectedLeadId],
  );
  const lead = leadsDecorated.find((l) => l.id === selectedLeadId) || null;

  const crmChats: DecoratedCrmChat[] = useMemo(
    () =>
      leadsSource.map((l, i) => {
        const d = decorateLead(l, i, crmSelectedId, (id) => { setCrmSelectedId(id); setCrmIntervening(false); setCrmSendWarn(''); });
        // En modo servidor, "en vivo" = el bot lo atiende; en demo, los dos primeros.
        const live = apiMode && apiLeadsState ? l.asignado.includes('bot') || l.asignado.includes('Asistente') : l.id === 1 || l.id === 2;
        const selC = l.id === crmSelectedId;
        return {
          ...d,
          live,
          liveLabel: live ? 'En vivo' : 'Esperando',
          liveStyle: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: live ? '#047857' : '#94A3B8', marginTop: '5px' },
          liveDot: { width: '7px', height: '7px', borderRadius: '50%', background: live ? '#10B981' : '#CBD5E1', animation: live ? 'dfpulse 1.8s infinite' : 'none', flexShrink: 0 },
          crmRowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selC ? '#ECFDF5' : '#fff', borderLeft: selC ? '3px solid #059669' : '3px solid transparent' },
        };
      }),
    [leadsSource, crmSelectedId, apiMode, apiLeadsState],
  );
  const crmChat = crmChats.find((c) => c.id === crmSelectedId) || null;

  function crearProducto() {
    const nombre = newProdNombre.trim();
    const precio = parseInt(newProdPrecio, 10);
    const stock = parseInt(newProdStock, 10) || 0;
    if (!nombre || !precio) {
      setNewProdError(true);
      return;
    }
    if (apiMode) {
      void apiCreateProduct({ nombre, precio, stock }).then((r) => {
        if (r.error || !r.data) {
          setNewProdError(true);
          return;
        }
        void reloadProducts().then(() => setExpandedProductId(r.data!.id));
        setNewProdNombre('');
        setNewProdPrecio('');
        setNewProdStock('');
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
      if (available) {
        const rol = user ? (user.role === 'ADMIN' ? 'admin' : user.role === 'SUPERADMIN' ? 'superadmin' : 'vendedor') : 'vendedor';
        setSessionUser(user ? { nombre: user.nombre, email: user.email, role: rol, esDueno: user.esDueno, impersonando: user.impersonando, tiendaNombre: user.tiendaNombre } : null);
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

  function completeLogin(user: { nombre: string; email: string; role: 'vendedor' | 'admin' | 'superadmin'; esDueno?: boolean }) {
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
      completeLogin({ nombre: r.user.nombre, email: r.user.email, role: r.user.role === 'ADMIN' ? 'admin' : r.user.role === 'SUPERADMIN' ? 'superadmin' : 'vendedor', esDueno: r.user.esDueno });
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

  function logout() {
    if (apiMode) apiLogout();
    try {
      localStorage.removeItem('dealflow:session');
    } catch { /* nada */ }
    setSessionUser(null);
    setMode('vendedor');
    setSection('resumen');
    setSelectedOrderId(null);
    setMenuOpen(false);
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
        if (data.whatsapp.verifyToken) setWaVerifyToken(data.whatsapp.verifyToken);
        // Datos reales de la tienda: nada de textos demo de "Luna Accesorios".
        setAssistantText(data.assistant?.instrucciones || '');
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
    const t = setInterval(() => {
      void apiLeads().then(({ data }) => {
        if (data) setApiLeadsState(mapApiLeads(data.leads));
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
          }
        }
        setOrders(nuevos);
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

  async function addBloqueMedia(productId: number | string, files: File[], tipo: 'imagen' | 'video') {
    const urls = await subir(tipo === 'video' ? filtrarVideos(files) : files, tipo === 'imagen' ? 'image/' : 'video/');
    if (urls.length) patchProductList(productId, 'mensajeBloques', (b) => [...b, ...urls.map((valor) => ({ tipo, valor }))]);
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
        precioFmt: fmt(p.precio),
        variantesLabel: (p.opciones && p.opciones.length)
          ? p.opciones.filter((o) => o.valores.length).map((o) => o.nombre + ': ' + o.valores.map((v) => v.valor).join(', ')).join('  ·  ') || 'Opciones sin valores'
          : 'Sin opciones aún',
        stockLabel: (p.opciones && p.opciones.length) ? p.opciones.reduce((a, o) => a + o.valores.length, 0) + ' opciones' : '',
        stockPill: pill({ color: '#475569', bg: '#F1F5F9' }),
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
          remove: () => patchProductList(p.id, 'mensajeBloques', (bl) => bl.filter((_, j) => j !== i)),
        })),
        addBloqueTexto: () => {
          const t = bloqueTexto.trim();
          if (!t) return;
          patchProductList(p.id, 'mensajeBloques', (bl) => [...bl, { tipo: 'texto' as const, valor: t }]);
          setBloqueTexto('');
        },
        addBloqueImagen: (files: File[]) => void addBloqueMedia(p.id, files, 'imagen'),
        addBloqueVideo: (files: File[]) => void addBloqueMedia(p.id, files, 'video'),
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
        setDropiId: (v: string) => updateProduct(p.id, { dropiId: v }),
        toggleMensajeInicial: () => updateProduct(p.id, { mensajeInicialActivo: !(p.mensajeInicialActivo !== false) }),
        faqsDecoradas: (p.faqs || []).map((f, i) => ({
          ...f,
          remove: () => {
            const nuevas = (p.faqs || []).filter((_, j) => j !== i);
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
            labelStyle: { fontSize: '13px', fontWeight: 600, minWidth: '110px', color: v.stock === 0 ? '#94A3B8' : '#1E293B', textDecoration: v.stock === 0 ? 'line-through' : 'none' },
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
        badgeStyle: pill(pr.tipo === 'Combo' ? { color: '#B45309', bg: '#FEF3C7' } : { color: '#047857', bg: '#D1FAE5' }),
        estadoLabel: pr.activa ? 'Activa' : 'Pausada',
        estadoStyle: { ...pill(pr.activa ? { color: '#047857', bg: '#D1FAE5' } : { color: '#64748B', bg: '#F1F5F9' }), cursor: 'pointer' },
        toggle: () => setPromos((st) => st.map((x) => (x.id === pr.id ? { ...x, activa: !x.activa } : x))),
        requestDelete: () => deletePromo(pr.id),
        deleteArmed: armedDeletePromoId === pr.id,
      })),
    [promos, armedDeletePromoId],
  );

  const rulesDecorated = useMemo(
    () => rules.map((texto, i) => ({ texto, remove: () => setRules((st) => st.filter((_, j) => j !== i)) })),
    [rules],
  );

  const integrationsDecorated: DecoratedIntegration[] = useMemo(
    () =>
      integrations.map((i) => {
        // Conectada = la tienda guardó sus credenciales; WhatsApp/Meta usan el estado real del número.
        const conectado = i.id === 'wa' || i.id === 'meta' ? waConnected : !!integracionesCfg[i.id];
        return {
          ...i,
          logoStyle: { width: '38px', height: '38px', borderRadius: '10px', background: i.logoBg, color: i.logoTxt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' },
          badgeLabel: conectado ? 'Conectada' : 'Disponible',
          badgeStyle: pill(conectado ? { color: '#047857', bg: '#D1FAE5' } : { color: '#64748B', bg: '#F1F5F9' }),
          btnLabel: conectado ? 'Configurar' : 'Conectar',
          btnStyle: conectado
            ? { background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }
            : { background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
          // WhatsApp/Meta se configuran en su propia sección; el resto abre su formulario en la tarjeta.
          action: i.id === 'wa' || i.id === 'meta' ? () => go('whatsapp') : () => {},
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [integrations, integracionesCfg, waConnected],
  );

  const plansDecorated: DecoratedPlan[] = useMemo(
    () => plans.map((pl) => ({ ...pl, precioFmt: fmt(pl.precio), cuentasLabel: pl.cuentas + ' cuentas en este plan' })),
    [plans],
  );

  // En modo servidor, el panel admin carga cuentas y planes reales.
  async function reloadAdmin() {
    const { data } = await apiAdminOverview();
    if (!data) return;
    setAccounts(data.stores.map((s) => ({ id: s.id, tienda: s.tienda, correo: s.correo, plan: s.plan, ventas: s.ventas, activa: s.activa })));
    setPlans(data.plans.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, cuentas: p.cuentas, features: p.features })));
  }
  useEffect(() => {
    if (apiMode && isAdmin && sessionUser) void reloadAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, isAdmin, sessionUser]);

  // ── Superadmin: todas las tiendas + ocultar del admin ──
  const [superStores, setSuperStores] = useState<SuperStore[]>([]);
  async function reloadSuper() {
    const { data } = await apiSuperStores();
    if (data) setSuperStores(data.stores);
  }
  useEffect(() => {
    if (apiMode && isSuperadmin && sessionUser && adminSection === 'superadmin') void reloadSuper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, isSuperadmin, sessionUser, adminSection]);
  function toggleHideStore(id: string, oculta: boolean) {
    setSuperStores((st) => st.map((s) => (s.id === id ? { ...s, oculta: !oculta } : s)));
    void apiToggleHideStore(id, !oculta).then((r) => { if (r.error) void reloadSuper(); });
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
    if (apiMode && sessionUser && !isAdmin && section === 'integraciones') void reloadIntegraciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, sessionUser, isAdmin, section]);
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

  async function reloadTeam() {
    const { data } = await apiTeamList();
    if (data) setTeam(data.team);
  }
  useEffect(() => {
    if (apiMode && !isAdmin && sessionUser && section === 'equipo') void reloadTeam();
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

  function generarCopys() {
    if (!mkIdea.trim()) { setMkError('Escribe de qué es el anuncio.'); return; }
    setMkLoading(true); setMkError(''); setMkCopys([]);
    void apiMarketingCopy({ idea: mkIdea, plataforma: mkPlataforma, tono: mkTono, objetivo: mkObjetivo }).then((r) => {
      setMkLoading(false);
      if (r.error) { setMkError(r.error); return; }
      setMkCopys(r.data?.copys || []);
    });
  }

  function generarImagen() {
    if (!mkImgPrompt.trim()) { setMkImgError('Describe la imagen que quieres.'); return; }
    setMkImgLoading(true); setMkImgError(''); setMkImgUrl('');
    void apiMarketingImagen(mkImgPrompt).then((r) => {
      setMkImgLoading(false);
      if (r.data?.url) { setMkImgUrl(r.data.url); return; }
      setMkImgError(r.data?.error || r.error || 'No se pudo generar la imagen.');
    });
  }

  function copiarCopy(i: number, texto: string) {
    try { navigator.clipboard?.writeText(texto); } catch { /* nada */ }
    setMkCopied(i);
    setTimeout(() => setMkCopied((c) => (c === i ? null : c)), 1600);
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

  function toggleAccount(id: number | string, activa: boolean) {
    setAccounts((st) => st.map((x) => (x.id === id ? { ...x, activa: !x.activa } : x)));
    if (apiMode) void apiToggleStore(String(id), !activa).then((r) => { if (r.error) void reloadAdmin(); });
  }

  const accountsDecorated: DecoratedAccount[] = useMemo(
    () =>
      accounts.map((a) => ({
        ...a,
        ventasFmt: a.ventas > 0 ? fmt(a.ventas) : '—',
        estadoLabel: a.activa ? 'Activa' : 'Inactiva',
        estadoStyle: pill(a.activa ? { color: '#047857', bg: '#D1FAE5' } : { color: '#B91C1C', bg: '#FEE2E2' }),
        switchStyle: { width: '40px', height: '23px', borderRadius: '999px', background: a.activa ? '#059669' : '#CBD5E1', padding: '2.5px', cursor: 'pointer', transition: 'background .15s', boxSizing: 'border-box' },
        knobStyle: { width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transform: a.activa ? 'translateX(17px)' : 'translateX(0)', transition: 'transform .15s', boxShadow: '0 1px 2px rgba(15,23,42,.25)' },
        toggle: () => toggleAccount(a.id, a.activa),
      })),
    [accounts, apiMode],
  );

  const newOrders = orders.filter((o) => o.estado === 'Nuevo');
  // Métricas REALES del día (zona horaria de Bogotá): total del pedido = total
  // acordado por la IA o, si no, la suma de los ítems.
  const totalPedido = (o: Order) => (o.total && o.total > 0 ? o.total : o.items.reduce((x, it) => x + it.qty * it.precio, 0));
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

  const filterList = ['Todos', ...ESTADO_ORDER];
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredOrders: DecoratedOrder[] = useMemo(() => {
    const q = norm(orderQuery.trim());
    return orders
      .filter((o) => filter === 'Todos' || o.estado === filter)
      .filter((o) => !q || norm(o.cliente).includes(q) || norm(o.id).includes(q))
      .map(decorateOrder);
  }, [orders, filter, orderQuery]);
  const recentOrders: DecoratedOrder[] = useMemo(() => orders.slice(0, 4).map(decorateOrder), [orders]);
  const selRaw = orders.find((o) => o.id === selectedOrderId) || null;
  const sel = selRaw ? decorateOrder(selRaw) : null;

  const orderFilters: OrderFilterOption[] = filterList.map((f) => {
    const active = filter === f;
    const count = f === 'Todos' ? orders.length : orders.filter((o) => o.estado === f).length;
    return {
      key: f,
      label: f + ' (' + count + ')',
      set: () => setFilter(f),
      style: {
        padding: '7px 14px',
        borderRadius: '999px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? '#0F172A' : '#fff',
        color: active ? '#fff' : '#64748B',
        border: '1px solid ' + (active ? '#0F172A' : '#E2E8F0'),
      },
    };
  });

  function assignLead(v: string) {
    setLeads((st) => st.map((l) => (l.id === selectedLeadId ? { ...l, asignado: v } : l)));
    setFlowMsg('Chat asignado a ' + v + ' ✓');
  }

  function sendFlow() {
    setFlowMsg((lead ? lead.nombre : 'El lead') + ' entró al flujo «' + flowSel + '» ✓');
  }

  function addRule() {
    if (ruleDraft.trim()) {
      setRules((st) => [...st, ruleDraft.trim()]);
      setRuleDraft('');
    }
  }

  function saveAssistant() {
    if (apiMode) void apiPutAssistant({ instrucciones: assistantText, reglas: rules });
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
        void apiLeads().then(({ data }) => { if (data) setApiLeadsState(mapApiLeads(data.leads)); });
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
          void apiLeads().then(({ data }) => { if (data) setApiLeadsState(mapApiLeads(data.leads)); });
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

  const waPill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', background: waConnected ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (waConnected ? '#A7F3D0' : '#FECACA'), color: waConnected ? '#047857' : '#B91C1C', borderRadius: '999px', padding: '4px 11px', fontSize: '12px', fontWeight: 700 };
  const waDot: CSSProperties = { width: '8px', height: '8px', borderRadius: '50%', background: waConnected ? '#10B981' : '#EF4444' };

  return {
    mode,
    isAdmin,
    isVendedor: !isAdmin,
    isSuperadmin,
    superStores,
    toggleHideStore,
    setLeadEtiqueta,
    etiquetasCrm: ETIQUETAS_CRM,
    section,
    adminSection,
    storeId,
    go,
    goAdmin,
    toggleMode,
    modeBtnLabel: isAdmin ? 'Volver al panel vendedor' : 'Panel de administración',
    headerTitle: isAdmin ? 'DealFlow · Administración' : apiMode ? storeNombre || 'Mi tienda' : 'Luna Accesorios',
    userLabel: isAdmin ? 'Equipo DealFlow' : apiMode ? sessionUser?.nombre || 'Vendedor' : 'Karla',
    userInitials: isAdmin ? 'DF' : apiMode ? initials(sessionUser?.nombre || 'V').toUpperCase() : 'K',
    saludoNombre: apiMode ? (sessionUser?.nombre?.split(' ')[0] || 'Vendedor') : 'Karla',
    navStyle,

    waConnected,
    waPill,
    waDot,
    waLabel: waConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado',
    waCardStyleResolved: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: '#fff',
      border: '1px solid ' + (waConnected ? '#A7F3D0' : '#FECACA'),
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 14,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    } as CSSProperties,
    waBigDot: { width: 12, height: 12, borderRadius: '50%', background: waConnected ? '#10B981' : '#EF4444', flexShrink: 0 } as CSSProperties,
    waStatusTitle: waConnected ? 'Conectado y respondiendo' : 'Sin conexión',
    waToggleBtn: (waConnected
      ? { background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
      : { background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }) as CSSProperties,
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
    ventasComparacionColor: difAyer > 0 ? '#059669' : difAyer < 0 ? '#DC2626' : '#64748B',
    resumenFecha,
    leadsCount: leadsSource.length,
    productCount: products.length,
    recentOrders,
    exportarPedidos,

    orderFilters,
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
    flowSel,
    setFlowSel,
    sendFlow,
    flowMsg: flowMsg || '',
    hasFlowMsg: !!flowMsg,

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
      setCrmIntervening(false);
      setMobileChatOpen(true);
    },
    closeMobileChat: () => {
      setMobileChatOpen(false);
      setCrmIntervening(false);
    },
    crmTyping: !apiMode && !!(crmChat && crmChat.live && !crmIntervening),
    crmIntervening,
    crmNotIntervening: !crmIntervening,
    intervene: () => {
      setCrmIntervening(true);
      if (apiMode) void apiAssignLead(String(crmSelectedId), sessionUser?.nombre || 'Vendedor');
    },
    backToBot: () => {
      setCrmIntervening(false);
      if (apiMode) void apiAssignLead(String(crmSelectedId), 'Asistente (bot)');
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
      setCrmIntervening(false);
      setMobileChatOpen(false);
    },
    resetChat: () => {
      const id = crmSelectedId;
      if (apiMode) void apiResetLead(String(id));
      setApiLeadsState((st) => (st || []).map((l) => (l.id === id ? { ...l, asignado: 'Asistente (bot)', etapa: 'Explorando', mensajes: [], ultimo: '', hora: '' } : l)));
      setLeads((st) => st.map((l) => (l.id === id ? { ...l, asignado: 'Asistente (bot)', mensajes: [], ultimo: '' } : l)));
      setCrmIntervening(false);
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
    mkIdea, setMkIdea,
    mkPlataforma, setMkPlataforma,
    mkTono, setMkTono,
    mkObjetivo, setMkObjetivo,
    mkCopys, mkLoading, mkError, generarCopys,
    mkCopied, copiarCopy,
    mkImgPrompt, setMkImgPrompt,
    mkImgUrl, mkImgLoading, mkImgError, generarImagen,

    // ── DealShop (plantillas) ──
    plantillas,
    instalando,
    plantillaMsg,
    instalarPlantilla,

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
    saveAssistant,
    assistantSaved,

    integrations: integrationsDecorated,
    pwaDisponible,
    instalarPwa,
    integracionesCfg,
    iaPredeterminada,
    integracionMsg,
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
    abrirDetalleStore,
    cerrarPanelStore,
    detalleStore,
    detalleLoading,
    entrarATienda,
    volverAlAdmin,
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
