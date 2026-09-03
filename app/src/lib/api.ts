export interface ApiUser {
  id: string;
  email: string;
  nombre: string;
  role: 'VENDEDOR' | 'ADMIN' | 'SUPERADMIN';
  storeId: string | null;
  /** true si es el dueño de la tienda; false si es un agente con permisos limitados */
  esDueno?: boolean;
  /** true si un admin está "entrando" a esta tienda (modo soporte) */
  impersonando?: boolean;
  /** nombre de la tienda cuando se está impersonando */
  tiendaNombre?: string;
}

/**
 * Detecta si el panel está servido por el backend (misma URL) y si hay
 * sesión activa. Si no hay API (demo estática o dev sin servidor),
 * devuelve available=false y el panel usa el modo demo local.
 */
export async function apiMe(): Promise<{ available: boolean; user: ApiUser | null }> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { available: false, user: null };
    if (r.ok) {
      const b = (await r.json()) as { user: ApiUser };
      return { available: true, user: b.user };
    }
    if (r.status === 401) return { available: true, user: null };
    return { available: false, user: null };
  } catch {
    return { available: false, user: null };
  }
}

export async function apiLogin(email: string, password: string): Promise<{ user?: ApiUser; error?: string }> {
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const b = (await r.json()) as { user?: ApiUser; error?: string };
    if (!r.ok) return { error: b.error || 'No pudimos iniciar sesión. Intenta de nuevo.' };
    return { user: b.user };
  } catch {
    return { error: 'No pudimos hablar con el servidor. Revisa tu conexión.' };
  }
}

export function apiLogout() {
  void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
}

async function req<T>(url: string, method: string, body?: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = r.headers.get('content-type') || '';
    const b = ct.includes('application/json') ? await r.json() : {};
    if (!r.ok) return { error: (b as { error?: string }).error || 'Algo salió mal. Intenta de nuevo.' };
    return { data: b as T };
  } catch {
    return { error: 'No pudimos hablar con el servidor. Revisa tu conexión.' };
  }
}

export interface AdminStore {
  id: string;
  tienda: string;
  correo: string;
  plan: string;
  ventas: number;
  activa: boolean;
  planEstado?: string;
  planVence?: string | null;
  creditos?: number;
}
export interface AdminPlan {
  id: string;
  nombre: string;
  precio: number;
  features: string[];
  cuentas: number;
}

export interface ApiMensaje {
  de: string;
  texto: string;
  hora: string;
  tipo?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaNombre?: string | null;
}

export interface ApiLead {
  id: string;
  nombre: string;
  tel: string;
  etapa: string;
  asignado: string;
  etiqueta?: string;
  canal?: string;
  mensajes: ApiMensaje[];
}

// ── Suscripción (pago de la tienda a DealFlow) ──
export interface Suscripcion {
  plan: string;
  precioInicial: number; // valor inicial (una vez)
  mensual: number; // renta mensual
  estado: 'sin_plan' | 'activa' | 'vencida';
  inicialPagado: boolean;
  vence: string | null;
  diasRestantes: number | null;
  bloqueado: boolean; // true = la tienda no puede usar la plataforma todavía
}
export interface PlanPublico {
  nombre: string;
  precio: number; // valor inicial
  mensual: number; // renta mensual
  features: string[];
}
export interface Cupon {
  id: string;
  codigo: string;
  descuento: number;
  montoFijo: number | null; // si no es null, es cupón de precio fijo
  activo: boolean;
  vence: string | null;
  maxUsos: number | null;
  usos: number;
  nota: string;
}
export interface NuevoCupon {
  codigo: string;
  tipo: 'porcentaje' | 'monto';
  descuento?: number;
  montoFijo?: number;
  vence: string | null;
  maxUsos: number | null;
  nota: string;
}
export const apiSuscripcion = () => req<{ suscripcion: Suscripcion | null }>('/api/suscripcion', 'GET');
export const apiPlanes = () => req<{ planes: PlanPublico[] }>('/api/planes', 'GET');
export const apiCheckoutSuscripcion = (plan?: string, cupon?: string) =>
  req<{ url?: string; gratis?: boolean }>('/api/suscripcion/checkout', 'POST', { ...(plan ? { plan } : {}), ...(cupon ? { cupon } : {}) });
export const apiValidarCupon = (codigo: string) => req<{ valido: boolean; descuento: number; montoFijo: number | null; mensaje: string; codigo?: string }>('/api/suscripcion/cupon', 'POST', { codigo });
export const apiVerificarPago = (id: string) => req<{ activado: boolean; estado?: string }>('/api/suscripcion/verificar', 'POST', { id });
export const apiExtenderSuscripcion = (id: string, dias: number) => req<{ ok: true }>(`/api/admin/stores/${id}/suscripcion`, 'POST', { dias });
// Cupones (admin)
export const apiCupones = () => req<{ cupones: Cupon[] }>('/api/admin/cupones', 'GET');
export const apiCrearCupon = (c: NuevoCupon) => req<{ id: string; codigo: string }>('/api/admin/cupones', 'POST', c);
export const apiToggleCupon = (id: string, activo: boolean) => req<{ ok: true }>(`/api/admin/cupones/${id}`, 'PATCH', { activo });
export const apiEliminarCupon = (id: string) => req<{ ok: true }>(`/api/admin/cupones/${id}`, 'DELETE');
export async function apiRegistro(nombre: string, negocio: string, correo: string, password: string): Promise<{ user?: ApiUser; error?: string }> {
  try {
    const r = await fetch('/api/auth/registro', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, negocio, correo, password }),
    });
    const b = (await r.json()) as { user?: ApiUser; error?: string };
    if (!r.ok) return { error: b.error || 'No pudimos crear tu cuenta. Intenta de nuevo.' };
    return { user: b.user };
  } catch {
    return { error: 'No pudimos hablar con el servidor. Revisa tu conexión.' };
  }
}

// ── Integraciones por tienda ──
export interface IntegracionConfigurada {
  tipo: string;
  campos: Record<string, string>; // valores enmascarados (••••1234)
}
export const apiIntegraciones = () => req<{ configuradas: IntegracionConfigurada[]; iaPredeterminada: string }>('/api/integraciones', 'GET');
export const apiGuardarIntegracion = (tipo: string, config: Record<string, string>, predeterminada?: boolean) =>
  req<{ ok: true }>(`/api/integraciones/${tipo}`, 'PUT', { config, predeterminada });
export const apiEliminarIntegracion = (tipo: string) => req<{ ok: true }>(`/api/integraciones/${tipo}`, 'DELETE');
export const apiSetIaPredeterminada = (proveedor: string) => req<{ ok: true }>('/api/integraciones-ia/predeterminada', 'PUT', { proveedor });

// ── Webchat (canal web, sin sesión de usuario) ──
export const apiWebchatSend = (storeId: string, session: string, texto: string, nombre?: string) =>
  req<{ ok: true }>(`/api/webchat/${storeId}/messages`, 'POST', { session, texto, nombre });
export const apiWebchatList = (storeId: string, session: string) =>
  req<{ tienda: string; mensajes: ApiMensaje[] }>(`/api/webchat/${storeId}/messages?session=${encodeURIComponent(session)}`, 'GET');

export interface ApiProduct {
  id: string;
  nombre: string;
  precio: number;
  color: string;
  txt: string;
  tipo?: 'producto' | 'servicio';
  duracion?: string;
  plantillaId?: string;
  reglas: string[];
  descripcion: string;
  caracteristicas: string;
  mensajeInicial: string;
  faqs: { pregunta: string; respuesta: string }[];
  testimonios: string[];
  modosUso: string;
  videos: string[];
  mensajeBloques: { tipo: string; valor: string }[];
  bundles: { cantidad: number; precio: number; etiqueta?: string }[];
  opciones: { nombre: string; valores: ({ valor: string; foto?: string } | string)[] }[];
  contenidoPaquete: string;
  disparador: string;
  mensajeInicialActivo: boolean;
  fotos: string[];
  fotosSubidas: string[];
  variantes: { id: string; label: string; stock: number; fotos: number; fotosSubidas: string[] }[];
}

export const apiUpload = (dataUrl: string, nombre?: string) => req<{ url: string }>('/api/upload', 'POST', { dataUrl, nombre });
export const apiCreateProduct = (b: { nombre: string; precio: number; stock: number; tipo?: string; duracion?: string }) => req<{ id: string }>('/api/products', 'POST', b);
export const apiPatchProduct = (id: string, patch: Record<string, unknown>) => req<{ ok: true }>(`/api/products/${id}`, 'PATCH', patch);
export const apiDeleteProduct = (id: string) => req<{ ok: true }>(`/api/products/${id}`, 'DELETE');
export const apiAddVariant = (productId: string, b: { label: string; stock: number }) => req<{ id: string }>(`/api/products/${productId}/variants`, 'POST', b);
export const apiPatchVariant = (id: string, patch: Record<string, unknown>) => req<{ ok: true }>(`/api/variants/${id}`, 'PATCH', patch);
export const apiDeleteVariant = (id: string) => req<{ ok: true }>(`/api/variants/${id}`, 'DELETE');
export const apiPutAssistant = (b: { instrucciones: string; reglas: string[] }) => req<{ ok: true }>('/api/assistant', 'PUT', b);

export interface ApiOrder {
  id: string;
  rowId: string;
  cliente: string;
  ciudad: string;
  departamento?: string;
  tel: string;
  direccion: string;
  estado: string;
  transportadora: string;
  guia?: string;
  envio: number;
  nota: string;
  total: number;
  createdAt: string;
  items: { qty: number; nombre: string; precio: number }[];
}
export const apiState = () => req<{ store: { id: string; nombre: string; plan: string }; assistant: { instrucciones: string; reglas: string[] }; products: ApiProduct[]; orders: ApiOrder[]; whatsapp: { conectado: boolean; modo: string; wabaId: string; phoneNumberId: string; numero: string; tokenGuardado: boolean; verifyToken: string; signup?: MetaSignupCfg; signupAuto?: boolean }; leads: ApiLead[]; suscripcion: Suscripcion | null }>('/api/state', 'GET');
export const apiOrders = () => req<{ orders: ApiOrder[] }>('/api/orders', 'GET');
export const apiOrderAdvance = (rowId: string) => req<{ estado: string }>(`/api/orders/${rowId}/advance`, 'POST');
export const apiOrderDropi = (rowId: string) => req<{ guia: string }>(`/api/orders/${rowId}/dropi`, 'POST');
export const apiLeads = () => req<{ leads: ApiLead[] }>('/api/leads', 'GET');
export const apiSendLeadMessage = (id: string, texto: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/messages`, 'POST', { texto });
export const apiSendLeadMedia = (id: string, dataUrl: string, nombre: string, caption: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/media`, 'POST', { dataUrl, nombre, caption });
export const apiAssignLead = (id: string, asignado: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { asignado });
export const apiSetLeadEtiqueta = (id: string, etiqueta: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { etiqueta });
export const apiDeleteLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}`, 'DELETE');
export const apiResetLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}/reset`, 'POST');

export const apiWaLinkCloud = (b: { wabaId: string; phoneNumberId: string; accessToken: string }) =>
  req<{ conectado: boolean; numero: string }>('/api/whatsapp', 'PUT', b);
export const apiWaUnlink = () => req<{ conectado: boolean }>('/api/whatsapp', 'DELETE');
/** Conexión en un clic: datos que devuelve el popup de Facebook (Embedded Signup). */
export interface MetaSignupCfg { disponible: boolean; appId: string; configId: string }
export const apiWaEmbedded = (b: { code: string; wabaId: string; phoneNumberId: string }) =>
  req<{ conectado: boolean; numero: string; aviso?: string }>('/api/whatsapp/embedded', 'POST', b);

/** Chequeo del número contra Meta + enlaces rápidos al panel de Meta. */
export interface EnlaceRapido { id: string; titulo: string; sub: string; url: string }
export interface EstadoNumero {
  disponible: boolean;
  motivo?: string;
  semaforo: 'ok' | 'aviso' | 'problema' | 'desconocido';
  titulo: string;
  numero: string;
  nombreVerificado: string;
  calidad: string;
  limite: string;
  verificado: boolean;
  revisionCuenta: string;
  avisos: string[];
  enlaces: EnlaceRapido[];
}
export const apiWaEstado = () => req<EstadoNumero>('/api/whatsapp/estado', 'GET');
export const apiWaQrStart = () => req<{ ok: true }>('/api/whatsapp/qr/start', 'POST');
export const apiWaQrStatus = () => req<{ estado: string; qr: string | null; numero: string; error: string }>('/api/whatsapp/qr/status', 'GET');

export interface TeamMember {
  id: string;
  nombre: string;
  email: string;
  esDueno: boolean;
  esTu: boolean;
}
export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  features: string[];
  instalada: boolean;
}
export const apiPlantillas = () => req<{ plantillas: Plantilla[] }>('/api/plantillas', 'GET');
export const apiInstalarPlantilla = (id: string, force = false) => req<{ ok: true }>(`/api/plantillas/${id}/instalar`, 'POST', force ? { force: true } : undefined);
export const apiDesinstalarPlantilla = (id: string, borrarDatos: boolean) => req<{ ok: true; borrados?: number }>(`/api/plantillas/${id}/desinstalar`, 'POST', { borrarDatos });

// ── Flujos (constructor de chatbot) ──
export type NodoTipo = 'mensaje' | 'pregunta' | 'opciones' | 'condicion' | 'accion' | 'fin';
export interface FlujoNodo {
  id: string;
  tipo: NodoTipo;
  x: number;
  y: number;
  data: Record<string, unknown>;
  next?: string | null;
}
export interface FlujoDisparador { tipo: 'palabra' | 'lead_nuevo' | 'manual'; palabras: string[] }
export interface Flujo { id: string; nombre: string; activo: boolean; disparador: FlujoDisparador; nodos: FlujoNodo[] }
export interface FlujoResumen { id: string; nombre: string; activo: boolean; disparador: FlujoDisparador; nodos: number }
export const apiFlujos = () => req<{ flujos: FlujoResumen[] }>('/api/flujos', 'GET');
export const apiFlujo = (id: string) => req<{ flujo: Flujo }>(`/api/flujos/${id}`, 'GET');
export const apiCrearFlujo = (nombre: string) => req<{ id: string }>('/api/flujos', 'POST', { nombre });
export const apiGuardarFlujo = (id: string, patch: Partial<Flujo>) => req<{ ok: true }>(`/api/flujos/${id}`, 'PUT', patch);
export const apiEliminarFlujo = (id: string) => req<{ ok: true }>(`/api/flujos/${id}`, 'DELETE');

// ── Multi-tienda por cuenta ──
export interface MiTienda { id: string; nombre: string; activa: boolean; estado: string; bloqueada: boolean }
export const apiMisTiendas = () => req<{ tiendas: MiTienda[] }>('/api/mis-tiendas', 'GET');
export const apiCambiarTienda = (id: string) => req<{ ok: true }>(`/api/cambiar-tienda/${id}`, 'POST');
export const apiCrearTienda = (nombre: string) => req<{ ok: true; storeId: string }>('/api/crear-tienda', 'POST', { nombre });

export interface CopyAnuncio {
  titulo: string;
  descripcion: string;
  texto: string;
}
export const apiMarketingCopy = (b: { idea: string; plataforma: string; tono: string; objetivo: string; cantidad: number; imagen?: string; formato?: string }) =>
  req<{ copys: CopyAnuncio[]; creditos?: number; error?: string; sinCreditos?: boolean }>('/api/marketing/copy', 'POST', b);
export const apiMarketingImagen = (prompt: string, cantidad: number, tamano?: string) =>
  req<{ urls?: string[]; creditos?: number; error?: string; sinConfigurar?: boolean; sinCreditos?: boolean }>('/api/marketing/imagen', 'POST', { prompt, cantidad, tamano });

// ── Historial del Marketing IA ──
export interface MarketingItem {
  id: string;
  tipo: 'copy' | 'imagen';
  favorito: boolean;
  fecha: string;
  contenido: { titulo?: string; descripcion?: string; texto?: string; hashtags?: string; url?: string };
  meta: { formato?: string; plataforma?: string; idea?: string; tamano?: string; prompt?: string };
}
export const apiHistorialMarketing = () => req<{ items: MarketingItem[] }>('/api/marketing/historial', 'GET');
export const apiFavoritoMarketing = (id: string, favorito: boolean) => req<{ ok: true }>(`/api/marketing/historial/${id}`, 'PATCH', { favorito });
export const apiBorrarMarketing = (id: string) => req<{ ok: true }>(`/api/marketing/historial/${id}`, 'DELETE');

// ── Créditos del Marketing IA ──
export interface PaqueteCreditos { id: string; nombre: string; creditos: number; precio: number }
export interface MovimientoCredito { delta: number; motivo: string; fecha: string }
export const apiCreditos = () => req<{ saldo: number; movimientos: MovimientoCredito[]; paquetes: PaqueteCreditos[]; costo: { texto: number; imagen: number } }>('/api/creditos', 'GET');
export const apiRecargarCreditos = (paquete: string) => req<{ url: string }>('/api/creditos/recargar', 'POST', { paquete });
export const apiDarCreditos = (storeId: string, cantidad: number) => req<{ ok: true }>(`/api/admin/stores/${storeId}/creditos`, 'POST', { cantidad });

export const apiTeamList = () => req<{ team: TeamMember[] }>('/api/team', 'GET');
export const apiTeamCreate = (b: { nombre: string; email: string; password: string }) => req<{ id: string }>('/api/team', 'POST', b);
export const apiTeamDelete = (id: string) => req<{ ok: true }>(`/api/team/${id}`, 'DELETE');

export const apiAdminOverview = () => req<{ stores: AdminStore[]; plans: AdminPlan[] }>('/api/admin/overview', 'GET');
export const apiCreateStore = (b: { nombre: string; correo: string; password: string; plan: string }) =>
  req<{ storeId: string }>('/api/admin/stores', 'POST', b);
export const apiToggleStore = (id: string, activa: boolean) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', { activa });
export const apiUpdateStore = (id: string, b: { nombre?: string; correo?: string; plan?: string; password?: string; activa?: boolean }) =>
  req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', b);
export const apiDeleteStore = (id: string) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'DELETE');
export const apiImpersonate = (id: string) => req<{ ok: true }>(`/api/admin/stores/${id}/impersonate`, 'POST');
export const apiStopImpersonate = () => req<{ ok: true }>('/api/auth/stop-impersonate', 'POST');

export interface AdminStoreDetalle {
  id: string; nombre: string; correo: string; plan: string; activa: boolean; creada: string;
  whatsapp: { conectado: boolean; numero: string; modo: string };
  productos: number; pedidos: number; leads: number; agentes: number; ventasMes: number;
  porEstado: { estado: string; n: number }[];
  recientes: { id: string; cliente: string; estado: string; total: number; fecha: string }[];
}
export const apiStoreDetalle = (id: string) => req<{ detalle: AdminStoreDetalle }>(`/api/admin/stores/${id}`, 'GET');

// ── Superadmin ──
export interface SuperStore {
  id: string; tienda: string; correo: string; plan: string; ventas: number; activa: boolean; oculta: boolean;
}
export const apiSuperStores = () => req<{ stores: SuperStore[] }>('/api/superadmin/stores', 'GET');
export const apiToggleHideStore = (id: string, oculta: boolean) => req<{ ok: true }>(`/api/superadmin/stores/${id}/hide`, 'PATCH', { oculta });

export const apiCreatePlan = (b: { nombre: string; precio: number; features: string[] }) => req<{ id: string }>('/api/admin/plans', 'POST', b);
export const apiUpdatePlan = (id: string, b: { nombre?: string; precio?: number; features?: string[] }) =>
  req<{ ok: true }>(`/api/admin/plans/${id}`, 'PATCH', b);
export const apiDeletePlan = (id: string) => req<{ ok: true }>(`/api/admin/plans/${id}`, 'DELETE');
