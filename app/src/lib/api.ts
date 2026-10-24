import { conEspera, textoDeUrl } from '../components/Proceso';
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
  /** Foto de perfil (URL), opcional. */
  foto?: string;
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
  return fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
}

export async function apiUpdateMe(nombre: string): Promise<{ user?: ApiUser; error?: string }> {
  try {
    const r = await fetch('/api/me', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) });
    const b = (await r.json()) as { user?: ApiUser; error?: string };
    if (!r.ok) return { error: b.error || 'No pudimos guardar el nombre.' };
    return { user: b.user };
  } catch {
    return { error: 'No pudimos hablar con el servidor. Revisa tu conexión.' };
  }
}

export async function apiUploadAvatar(dataUrl: string): Promise<{ foto?: string; user?: ApiUser; error?: string }> {
  try {
    const r = await fetch('/api/me/foto', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      // El servidor (o un proxy delante) rechazó la petición antes de que
      // nuestro código respondiera JSON — lo típico cuando la foto pesa
      // demasiado. Mensaje claro en vez del genérico "revisa tu conexión".
      return { error: r.status === 413 || r.status === 0 ? 'Esa foto pesa demasiado para subirla. Prueba con una más liviana.' : 'El servidor rechazó la foto. Prueba con una más liviana o en otro formato.' };
    }
    const b = (await r.json()) as { foto?: string; user?: ApiUser; error?: string };
    if (!r.ok) return { error: b.error || 'No pudimos subir la foto.' };
    return { foto: b.foto, user: b.user };
  } catch {
    return { error: 'No pudimos hablar con el servidor. Revisa tu conexión.' };
  }
}

export const apiChangePassword = (actual: string, nueva: string) => req<{ ok: true }>('/api/me/password', 'POST', { actual, nueva });

async function req<T>(url: string, method: string, body?: unknown): Promise<{ data?: T; error?: string }> {
  // Guardados y procesos: ventana de "procesando" que bloquea la pantalla si tarda.
  const texto = method === 'GET' ? null : textoDeUrl(url, method);
  return texto ? conEspera(texto, reqBase<T>(url, method, body)) : reqBase<T>(url, method, body);
}

async function reqBase<T>(url: string, method: string, body?: unknown): Promise<{ data?: T; error?: string }> {
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
  temaPremium?: boolean;
  oculta?: boolean;
}
export interface AdminPlan {
  id: string;
  nombre: string;
  precio: number;
  features: string[];
  cuentas: number;
}

export interface ApiMensaje {
  id?: string;
  de: string;
  texto: string;
  hora: string;
  createdAt?: string;
  estado?: string;
  error?: string;
  tipo?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaNombre?: string | null;
  citaTexto?: string;
  citaDe?: string;
}

// Anuncio del que llegó un chat (atribución de campaña). Solo viene cuando el
// cliente entró por una pauta (Click-to-WhatsApp / Click-to-Messenger/Instagram).
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

export interface ApiLead {
  id: string;
  nombre: string;
  tel: string;
  etapa: string;
  asignado: string;
  etiqueta?: string;
  canal?: string;
  notaInterna?: string;
  anuncio?: Anuncio | null;
  promosOptin?: boolean;
  mensajes: ApiMensaje[];
  // Solo en modo resumen (sondeo liviano del Inbox): el servidor manda estos
  // en vez de todos los mensajes de cada chat.
  ultimo?: string;
  ultimoIso?: string | null;
  hora?: string;
  /** Aplica la ventana de 24 h de WhatsApp y cuándo escribió el cliente por última vez (UTC). */
  ventana24h?: boolean;
  ultClienteIso?: string | null;
  sinResponder?: number;
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
  primeraVez: boolean; // true = nunca tuvo pago aprobado (tienda nueva, no "vencida" real)
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
  precioPromo?: number;
  color: string;
  txt: string;
  tipo?: 'producto' | 'servicio';
  duracion?: string;
  sku?: string;
  /** Por cuál se despacha este producto: 'dropi' | 'effi' | '' (sin definir, se muestran ambos). */
  despachoProveedor?: string;
  variantesFuente?: string;
  bloqueado?: boolean;
  plantillaId?: string;
  reglas: string[];
  descripcion: string;
  caracteristicas: string;
  mensajeInicial: string;
  faqs: { pregunta: string; respuesta: string }[];
  testimonios: string[];
  modosUso: string;
  videos: string[];
  mensajeBloques: { tipo: string; valor?: string; valores?: string[] }[];
  mensajes?: { id: string; nombre: string; activo: boolean; bloques: { tipo: string; valor?: string; valores?: string[] }[] }[];
  bundles: { cantidad: number; precio: number; etiqueta?: string }[];
  opciones: { nombre: string; valores: ({ valor: string; foto?: string } | string)[] }[];
  contenidoPaquete: string;
  disparador: string;
  mensajeInicialActivo: boolean;
  fotos: string[];
  fotosSubidas: string[];
  variantes: { id: string; label: string; stock: number; fotos: number; fotosSubidas: string[]; sku?: string; refs?: Record<string, string> }[];
}

export const apiUpload = (dataUrl: string, nombre?: string) => req<{ url: string }>('/api/upload', 'POST', { dataUrl, nombre });
export const apiCreateProduct = (b: { nombre: string; precio: number; stock: number; tipo?: string; duracion?: string }) => req<{ id: string }>('/api/products', 'POST', b);
export const apiPatchProduct = (id: string, patch: Record<string, unknown>) => req<{ ok: true }>(`/api/products/${id}`, 'PATCH', patch);
export const apiDeleteProduct = (id: string) => req<{ ok: true }>(`/api/products/${id}`, 'DELETE');
export const apiAddVariant = (productId: string, b: { label: string; stock: number }) => req<{ id: string }>(`/api/products/${productId}/variants`, 'POST', b);
export const apiGenerarVariantes = (productId: string) => req<{ ok: true; creadas: number; eliminadas: number; total: number }>(`/api/products/${productId}/variants/generar`, 'POST');
export const apiPatchVariant = (id: string, patch: Record<string, unknown>) => req<{ ok: true }>(`/api/variants/${id}`, 'PATCH', patch);
export const apiDeleteVariant = (id: string) => req<{ ok: true }>(`/api/variants/${id}`, 'DELETE');
export interface EstiloAsistente {
  idioma?: 'es' | 'en' | 'auto';
  trato?: 'tu' | 'usted'; emojis?: boolean; emojiNivel?: 'nada' | 'pocos' | 'muchos'; largo?: 'corto' | 'medio' | 'detallado';
  personalidad?: 'amigable' | 'profesional' | 'divertido' | 'experto' | 'directo'; modismos?: 'neutro' | 'colombiano';
  insistencia?: 'suave' | 'equilibrada' | 'persuasiva'; sugerirCombos?: boolean;
  saludo?: string; despedida?: string; prohibido?: string;
  negocio?: { envios?: string; pagos?: string; cambios?: string; horario?: string; ubicacion?: string; extra?: string };
  faqs?: { pregunta: string; respuesta: string }[];
  humano?: { activo?: boolean; cuando?: string; mensaje?: string };
}
export const apiPutAssistant = (b: { instrucciones: string; reglas: string[]; nombre?: string; seguimientoActivo?: boolean; estilo?: EstiloAsistente }) => req<{ ok: true }>('/api/assistant', 'PUT', b);

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
  wooId?: string;
  dropiOrderId?: string;
  guiaUrl?: string;
  guiaImg?: string;
  effiGuiaCreada?: boolean;
  despachoProveedor?: string;
  estadoWoo?: string;
  effiRemision?: string;
  origen?: string;
  leadId?: string;
  effiGuiaTx?: string;
  guiaAviso?: { ok: boolean; chat: string; contacto: string; con: string; detalle: string; at: string } | null;
  envio: number;
  nota: string;
  total: number;
  createdAt: string;
  items: { qty: number; nombre: string; precio: number }[];
  novedad?: NovedadPedido | null;
  effiDevolucion?: string;
  confirmacion?: string;
  shopifyEnviado?: boolean;
}
/** Novedad de envío reportada por la transportadora (Effi). */
export interface PropuestaNovedad { solucion: 'ofrecer' | 'redireccionar' | 'devolver'; fecha?: string; recibe?: string; direccion?: string; telefono?: string; nota?: string; origen?: 'bot' | 'panel' }
export interface NovedadPedido {
  id: string; orderId: string; nombre: string; aclaracion: string; estado: string; est: number; abierta: boolean; transportadora: string;
  fechaReporte: string; foto: string; aviso: string; propuesta: PropuestaNovedad | null; propuestaEstado: string;
  gestionTxt: string; gestionEst: number; gestionMsg: string; cantGestion: number; dias: number;
  tipo: number; guia: string; destinatario: string;
}
export interface PasoRastreo { fecha: string; estado: string; estadoGlobal: string; observacion: string; foto: string }
export interface CoberturaCiudad { destino: string; transportadoras: { nombre: string; recaudo: boolean; dias: number }[]; conRecaudo: boolean; dias: number | null; error?: string }
export const apiRastreo = (rowId: string, forzar = false) => req<{ pasos: PasoRastreo[] }>(`/api/orders/${rowId}/rastreo${forzar ? '?forzar=1' : ''}`, 'GET');
export const apiCobertura = (rowId: string) => req<{ cobertura: CoberturaCiudad | null; texto?: string }>(`/api/orders/${rowId}/cobertura`, 'GET');
export const apiDevolucionEffi = (rowId: string) => req<{ ok: true; devolucion: string }>(`/api/orders/${rowId}/devolucion-effi`, 'POST');
export interface ResumenRecaudos {
  mes: string; recaudado: number; descuentos: number; retirado: number; neto: number; movimientos: number;
  pendientes: { orderId: string; numero: number; cliente: string; guia: string; total: number; entregado: string }[];
  pagados: { orderId: string; numero: number; cliente: string; guia: string; total: number; recaudo: number; descuentos: number; fecha: string }[];
}
export const apiRecaudos = (mes: string) => req<ResumenRecaudos>(`/api/effi-api/recaudos?mes=${encodeURIComponent(mes)}`, 'GET');
export interface ResumenCalidad { cfg: { avisarContacto: boolean }; bajas: number; proactivos7d: number; tope: number }
export const apiCalidad = () => req<ResumenCalidad>('/api/calidad', 'GET');
export const apiGuardarCalidad = (c: { avisarContacto: boolean }) => req<{ avisarContacto: boolean }>('/api/calidad', 'POST', c);
export interface EstadoNovedades { ts: string; error: string; leidas: number; sinPedido: NovedadPedido[] }
export const apiNovedadOcultar = (id: string) => req<{ ok: boolean }>(`/api/novedades/${encodeURIComponent(id)}/ocultar`, 'POST');
export const apiNovedadVincular = (id: string, numero: string) => req<{ ok: true; orderId: string }>(`/api/novedades/${encodeURIComponent(id)}/vincular`, 'POST', { numero });
export const apiNovedadesEstado = () => req<EstadoNovedades>('/api/novedades/estado', 'GET');
export const apiNovedadesSync = () => req<{ ok: true; abiertas: number; nuevas: number }>('/api/novedades/sync', 'POST');
export const apiNovedadSolucion = (id: string, p: PropuestaNovedad) => req<{ ok: true; estado: string }>(`/api/novedades/${encodeURIComponent(id)}/solucion`, 'POST', p);
export const apiNovedadAvisar = (id: string) => req<{ ok: true; via: string }>(`/api/novedades/${encodeURIComponent(id)}/avisar`, 'POST');
export const apiState = () => req<{ store: { id: string; nombre: string; plan: string; temaPremium?: boolean }; assistant: { instrucciones: string; reglas: string[]; nombre?: string; seguimientoActivo?: boolean; estilo?: EstiloAsistente }; products: ApiProduct[]; orders: ApiOrder[]; whatsapp: { conectado: boolean; modo: string; wabaId: string; phoneNumberId: string; numero: string; tokenGuardado: boolean; verifyToken: string; signup?: MetaSignupCfg; signupAuto?: boolean }; leads: ApiLead[]; suscripcion: Suscripcion | null }>('/api/state', 'GET');
export const apiOrders = () => req<{ orders: ApiOrder[] }>('/api/orders', 'GET');
export const apiOrderAdvance = (rowId: string) => req<{ estado: string }>(`/api/orders/${rowId}/advance`, 'POST');
export const apiOrderEstado = (rowId: string, estado: string) => req<{ estado: string }>(`/api/orders/${rowId}/estado`, 'POST', { estado });
export const apiDeleteOrder = (rowId: string) => req<{ ok: true }>(`/api/orders/${rowId}`, 'DELETE');
export interface CrearPedidoItem { qty: number; nombre: string; precio: number }
export const apiCrearPedido = (body: { cliente: string; tel?: string; ciudad?: string; departamento?: string; direccion?: string; nota?: string; envio?: number; total?: number; items: CrearPedidoItem[]; leadId?: string }) =>
  req<{ ok: true; id: string; rowId: string }>('/api/orders', 'POST', body);
export const apiOrderDespacharSync = (rowId: string) => req<{ estado: string; guia: string }>(`/api/orders/${rowId}/despachar/sync`, 'POST');
// Dropi (API directa): cotizar transportadoras y crear la orden con la elegida.
export const apiDropiEstado = () => req<{ conectado: boolean; integrationUrl: string; preferencia: string; urlSugerida?: string }>('/api/dropi/estado', 'GET');
export const apiDropiConectar = (token: string, integrationUrl: string, preferencia = 'operador') => req<{ ok: true }>('/api/dropi/conectar', 'POST', { token, integrationUrl, preferencia });
export const apiDropiPreferencia = (preferencia: string, transportadoraFija = '') => req<{ ok: true; preferencia: string }>('/api/dropi/preferencia', 'POST', { preferencia, transportadoraFija });
export interface DropiVariacion { id: number; atributos: string; sku: string }
export interface DropiProducto { id: number; name: string; tipo: string; userId: number; variaciones: DropiVariacion[] }
export const apiDropiProducto = (id: string) => req<DropiProducto>(`/api/dropi/producto/${encodeURIComponent(id)}`, 'GET');
export interface DropiTransportadora { id: number; nombre: string; service: string; precio: number }
export const apiDropiCotizar = (rowId: string, recaudo: 'con' | 'sin' = 'con') => req<{ ciudad: string; disponibles: DropiTransportadora[]; noDisponibles: { nombre: string; motivo: string }[] }>(`/api/orders/${rowId}/dropi/cotizar`, 'POST', { recaudo });
export const apiDropiCrear = (rowId: string, transportadora?: DropiTransportadora, reintentar = false, recaudo: 'con' | 'sin' = 'con') => req<{ ok: true; dropiId: string; transportadora: string; aviso?: string }>(`/api/orders/${rowId}/dropi/crear`, 'POST', { transportadora, reintentar, recaudo });

// ── Shopify (Admin API) ──
export const apiShopifyEstado = () => req<{ conectado: boolean; shop: string; nombre: string; via?: string; appDisponible?: boolean }>('/api/shopify/estado', 'GET');
export interface TiendaPapelera { archivo: string; storeId: string; nombre: string; correo: string; eliminadaAt: string; eliminadaPor: string; venceAt: string; pedidos: number; leads: number; productos: number; tamanoKb: number }
export interface Respaldo { archivo: string; tamanoMb: number; fecha: string; cifrado?: boolean; manual?: boolean }
export interface EspacioDisco { totalMb: number; libreMb: number; baseMb: number; copiasMb: number; papeleraMb: number; archivosMb: number }
export const apiRespaldoEliminar = (archivo: string) => req<{ ok: true; respaldos: Respaldo[]; espacio: EspacioDisco }>(`/api/admin/respaldos/${encodeURIComponent(archivo)}`, 'DELETE');
export const apiPapeleraEliminar = (archivo: string) => req<{ ok: true; tiendas: TiendaPapelera[]; espacio: EspacioDisco }>(`/api/admin/papelera/${encodeURIComponent(archivo)}`, 'DELETE');
export const apiCifrado = () => req<{ activo: boolean; llaveSugerida: string }>('/api/admin/cifrado', 'GET');
export const apiPapelera = () => req<{ tiendas: TiendaPapelera[]; dias: number; respaldos: Respaldo[]; espacio?: EspacioDisco }>('/api/admin/papelera', 'GET');
export const apiPapeleraRestaurar = (archivo: string) => req<{ ok: true; nombre: string; filas: number }>(`/api/admin/papelera/${encodeURIComponent(archivo)}/restaurar`, 'POST');
export const apiRespaldoAhora = () => req<{ ok: true; archivo: string; respaldos: Respaldo[]; espacio: EspacioDisco }>('/api/admin/respaldos/ahora', 'POST');
export const apiShopifyAppInstalar = (shop: string) => req<{ url: string }>('/api/shopify/app/instalar', 'POST', { shop });
export const apiShopifyAppVincular = (codigo: string) => req<{ ok: true; shop: string }>('/api/shopify/app/vincular', 'POST', { codigo });
export const apiShopifyConectar = (shop: string, creds: { token?: string; clientId?: string; clientSecret?: string }) =>
  req<{ ok: true; nombre: string; shop: string }>('/api/shopify/conectar', 'POST', { shop, ...creds });
export const apiShopifyPublicarProducto = (productId: string, activar?: boolean) =>
  req<{ ok: true; productId: string; status: string; variantes: number; imagenes: number; vinculadas: number }>('/api/shopify/publicar-producto', 'POST', { productId, activar: !!activar });
export const apiShopifyDesconectar = () => req<{ ok: true }>('/api/shopify/desconectar', 'POST');

export interface EventoLog { nivel: string; evento: string; detalle: string; leadId: string | null; createdAt: string }
export const apiLogs = (leadId?: string) => req<{ logs: EventoLog[] }>(`/api/logs${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`, 'GET');
// Web Push
export const apiPushVapid = () => req<{ key: string; disponible: boolean }>('/api/push/vapid', 'GET');
export const apiPushSubscribe = (sub: unknown, prefs: { pedidos: boolean; contactos: boolean }) => req<{ ok: true }>('/api/push/subscribe', 'POST', { sub, prefs });
export const apiPushUnsubscribe = (endpoint: string) => req<{ ok: true }>('/api/push/unsubscribe', 'POST', { endpoint });
export const apiClearLogs = () => req<{ ok: true }>('/api/logs', 'DELETE');
export const apiReenviarMensaje = (id: string) => req<{ ok: boolean; estado: string; error?: string }>(`/api/messages/${id}/reenviar`, 'POST');
export const apiLeads = () => req<{ leads: ApiLead[] }>('/api/leads', 'GET');
// Sondeo liviano del Inbox: resumen de todos los chats (sin todos sus mensajes),
// y la conversación completa solo del chat abierto (`abierto`).
export const apiLeadsResumen = (abierto?: string) =>
  req<{ leads: ApiLead[] }>(`/api/leads?resumen=1${abierto ? `&abierto=${encodeURIComponent(abierto)}` : ''}`, 'GET');
// Conversación completa de un chat (al abrirlo).
export const apiLeadMensajes = (id: string) => req<{ mensajes: ApiMensaje[] }>(`/api/leads/${id}/mensajes`, 'GET');
export const apiAnuncioProducto = (adId: string) => req<{ productId: string; auto: boolean }>(`/api/anuncios/${encodeURIComponent(adId)}/producto`, 'GET');
export const apiVincularAnuncio = (adId: string, productId: string, titular = '') => req<{ ok: true }>(`/api/anuncios/${encodeURIComponent(adId)}/producto`, 'POST', { productId, titular });
export const apiSendLeadMessage = (id: string, texto: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/messages`, 'POST', { texto });
export const apiSendLeadMedia = (id: string, dataUrl: string, nombre: string, caption: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/media`, 'POST', { dataUrl, nombre, caption });
export const apiAssignLead = (id: string, asignado: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { asignado });
export const apiSetLeadEtiqueta = (id: string, etiqueta: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { etiqueta });
export const apiSetLeadAsignado = (id: string, asignado: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { asignado });
export const apiSetLeadNotaInterna = (id: string, notaInterna: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { notaInterna });
export const apiDeleteLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}`, 'DELETE');
export const apiResetLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}/reset`, 'POST');
export const apiEnviarFlujoInicial = (id: string, productId: string) => req<{ ok: true }>(`/api/leads/${id}/flujo-inicial`, 'POST', { productId });

export const apiSetOptin = (leadId: string, optin: boolean) => req<{ ok: true; optin: boolean }>(`/api/leads/${leadId}/optin`, 'POST', { optin });

export interface AntibaneoEstado { nivel: 'ok' | 'aviso' | 'alerta'; porMinuto: number; tope: number; cerca: boolean; calidad: string; limite: string; avisos: string[] }
export const apiAntibaneoEstado = () => req<AntibaneoEstado>('/api/antibaneo/estado', 'GET');

export interface PlantillaAprobada { id: string; nombre: string; idioma: string; categoria: string; encabezado: string; cuerpo: string; pie: string; variables: number; ejemplos: string[] }
export const apiPlantillasAprobadas = () => req<{ plantillas: PlantillaAprobada[] }>('/api/plantillas-aprobadas', 'GET');
export const apiEnviarPlantilla = (leadId: string, plantillaId: string, params?: string[]) => req<{ ok: true }>(`/api/leads/${leadId}/enviar-plantilla`, 'POST', { plantillaId, params });

// ── Completar pedido desde el chat ──
export interface PropuestaPedido {
  cliente: string; tel: string; departamento: string; ciudad: string; direccion: string;
  items: { qty: number; nombre: string; precio: number }[]; total: number;
}
export const apiExtraerPedido = (leadId: string) =>
  req<{ propuesta: PropuestaPedido | null; ordenExistente: { rowId: string; id: string } | null }>(`/api/leads/${leadId}/extraer-pedido`, 'POST');
export const apiActualizarPedido = (rowId: string, body: { cliente: string; tel?: string; departamento?: string; ciudad?: string; direccion?: string; nota?: string; envio?: number; total?: number; items?: { qty: number; nombre: string; precio: number }[] }) =>
  req<{ ok: true; id: string }>(`/api/orders/${rowId}`, 'PUT', body);

export const apiWaLinkCloud = (b: { wabaId: string; phoneNumberId: string; accessToken: string }) =>
  req<{ conectado: boolean; numero: string }>('/api/whatsapp', 'PUT', b);
export const apiWaUnlink = () => req<{ conectado: boolean }>('/api/whatsapp', 'DELETE');
/** Conexión en un clic: datos que devuelve el popup de Facebook (Embedded Signup). */
export interface MetaSignupCfg { disponible: boolean; appId: string; configId: string; messagingConfigId?: string }
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

// ── Multi-tienda por cuenta ──
export interface MiTienda { id: string; nombre: string; activa: boolean; estado: string; bloqueada: boolean }
export const apiMisTiendas = () => req<{ tiendas: MiTienda[] }>('/api/mis-tiendas', 'GET');
export const apiCambiarTienda = (id: string) => req<{ ok: true }>(`/api/cambiar-tienda/${id}`, 'POST');
export const apiCrearTienda = (nombre: string) => req<{ ok: true; storeId: string }>('/api/crear-tienda', 'POST', { nombre });
export const apiEliminarMiTienda = (id: string) => req<{ ok: true }>(`/api/mis-tiendas/${id}`, 'DELETE');

// ── Effi por API directa ──
export interface EffiOpcion { id: string; nombre: string; [k: string]: unknown }
export interface EffiTransportadora { id: string; nombre: string; effi: string; servicios: EffiOpcion[]; formasPago: EffiOpcion[] }
export interface EffiListas {
  sucursales: EffiOpcion[]; bodegas: (EffiOpcion & { sucursal: string })[]; centrosCostos: EffiOpcion[];
  formasPago: (EffiOpcion & { contado: boolean })[]; mediosPago: EffiOpcion[]; cajas: EffiOpcion[]; cuentas: EffiOpcion[];
  transportadoras: EffiTransportadora[]; remitentes: EffiOpcion[]; ecommerce: (EffiOpcion & { plataforma: string })[];
}
export interface EffiGuiaCfg { activa: boolean; transportadora: string; servicio: string; formaPagoFlete: string; remitente: string; peso: number; volumen: number; alto: number; ancho: number; largo: number }
export interface EffiApiEstado {
  conectado: boolean; listo?: boolean; apiKeyFin?: string; webhookSecreto?: boolean; webhookSecretos?: number; webhookUrl?: string; articulosEnCache?: number;
  sucursal?: string; bodega?: string; centroCostos?: string; formaPago?: string; formaPagoContado?: boolean; medioPago?: string; caja?: string; cuenta?: string;
  vendedor?: string; articuloFlete?: string; diasEntrega?: number; autoDespacho?: boolean; guia?: EffiGuiaCfg;
  convenioDropshipping?: string;
  convenios?: { id: string; nombre: string }[];
  novedades?: { avisarCliente: boolean; botGestiona: boolean; autoEnviar: boolean };
  devolucionAuto?: boolean;
}
export interface EffiArticulo { id: string; descripcion: string; referencia: string; ecommerce: string; stock: number | null }
export interface EffiEvento { id: number; evento: string; entrega: string; resumen: string; payload: string; created_at: string }
export interface EffiPreview { lineas: { item: string; articulo: string }[]; ubicacion: string; avisos: string[]; total: number; convenio?: string }
export const apiEffiApiEstado = () => req<EffiApiEstado>('/api/effi-api/estado', 'GET');
export const apiEffiAutoconfigurar = (paso: 'config' | 'convenios' | 'productos') => req<{ ok: boolean; detalle: string; listo: boolean }>(`/api/effi-api/autoconfigurar/${paso}`, 'POST', {});
export const apiEffiApiConectar = (apiKey: string) => req<{ ok: true }>('/api/effi-api/conectar', 'POST', { apiKey });
export const apiEffiApiListas = () => req<EffiListas>('/api/effi-api/listas', 'GET');
export const apiEffiApiConfig = (cfg: Partial<EffiApiEstado>) => req<{ ok: true; listo: boolean }>('/api/effi-api/config', 'POST', cfg);
export const apiEffiApiSecreto = (secreto: string) => req<{ ok: true; secretos: number }>('/api/effi-api/webhook-secreto', 'POST', { secreto });
export const apiEffiApiDesconectar = () => req<{ ok: true }>('/api/effi-api/desconectar', 'POST');
export const apiEffiApiSyncArticulos = () => req<{ total: number; soloVinculados: boolean; vinculadas: number; sinVinculo: { variantId: string | null; nombre: string }[]; productosEffi: number; sinProveedor: number; marcados?: number; stockActualizado?: number }>('/api/effi-api/articulos/sync', 'POST');
export interface EffiVarianteDF { variantId: string; productId: string; producto: string; proveedor: string; nombre: string; effiId: string; auto?: boolean }
export const apiEffiApiArticulos = (productId = '') => req<{ articulos: EffiArticulo[]; variantes: EffiVarianteDF[]; nombres: Record<string, string>; conveniosProducto?: Record<string, string>; convenios?: { id: string; nombre: string }[] }>(`/api/effi-api/articulos${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, 'GET');
export const apiEffiApiBuscar = (q: string) => req<{ articulos: EffiArticulo[] }>(`/api/effi-api/articulos/buscar?q=${encodeURIComponent(q)}`, 'GET');
export const apiEffiApiProveedor = (productIds: string[], proveedor: 'effi' | 'dropi' | '') => req<{ ok: true; actualizados: number }>('/api/effi-api/producto-proveedor', 'POST', { productIds, proveedor });
export const apiEffiApiConvenioProducto = (productIds: string[], convenio: string) => req<{ ok: true; actualizados: number }>('/api/effi-api/producto-convenio', 'POST', { productIds, convenio });
export interface ArtVinculo { id: string; descripcion: string; drop: boolean; stock: number | null }
export interface SugerenciaVinculo { variantId: string; label: string; auto: boolean; actual: ArtVinculo | null; sugerido: ArtVinculo | null; estado: 'ok' | 'cambiar' | 'sin' | 'revisar' }
export const apiRevisarVinculos = (productId: string) => req<{ producto: string; filas: SugerenciaVinculo[] }>(`/api/effi-api/producto/${encodeURIComponent(productId)}/vinculos`, 'GET');
export const apiAplicarVinculos = (productId: string, cambios: { variantId: string; effiId: string }[]) => req<{ ok: true; cambios: number }>(`/api/effi-api/producto/${encodeURIComponent(productId)}/vinculos`, 'POST', { cambios });
export const apiEffiApiVincular = (variantId: string, effiId: string) => req<{ ok: true }>('/api/effi-api/articulos/vincular', 'POST', { variantId, effiId });
export const apiEffiApiEventos = () => req<{ eventos: EffiEvento[] }>('/api/effi-api/eventos', 'GET');
export interface OpcionesGuia { transportadoras: EffiTransportadora[]; remitentes: EffiOpcion[]; defaults: EffiGuiaCfg }
export interface DatosGuia { transportadora: string; servicio: string; formaPagoFlete: string; remitente: string; cantPaquetes: number; peso: number; volumen: number; alto: number; ancho: number; largo: number; contenido: string; valorDeclarado: number; nota: string; recibeSabado: boolean }
export const apiEffiOpcionesGuia = () => req<OpcionesGuia>('/api/effi-api/opciones-guia', 'GET');
export const apiEffiGuia = (rowId: string, d: DatosGuia) => req<{ ok: true; guia: string; transportadora: string; idTransaccion: string }>(`/api/orders/${rowId}/effi/guia`, 'POST', d);
export const apiGuiaDocumento = (rowId: string, dataUrl: string) => req<{ ok: true; guiaUrl: string; guiaImg: string; convertida: boolean }>(`/api/orders/${rowId}/guia-documento`, 'POST', { dataUrl });
export interface ResultadoAvisoGuia { chat: 'enviado' | 'plantilla' | 'bloqueado' | 'error' | 'sin_chat'; contacto: 'plantilla' | 'mismo' | 'sin_plantilla' | 'error' | 'no_aplica'; con: 'image' | 'document' | 'texto'; detalle: string[] }
export const apiGuiaManual = (rowId: string, guia: string, transportadora = '') => req<{ ok: true; guia: string; aviso: string }>(`/api/orders/${rowId}/guia-manual`, 'POST', { guia, transportadora });
export interface VarianteFaltante { itemId: string; qty: number; nombre: string; producto: string; opciones: { variantId: string; label: string }[] }
export const apiVariantesFaltantes = (rowId: string) => req<{ faltan: VarianteFaltante[] }>(`/api/orders/${rowId}/variantes-faltantes`, 'GET');
export const apiCorregirVariante = (rowId: string, itemId: string, variantId: string) => req<{ ok: true; nombre: string }>(`/api/orders/${rowId}/items/${itemId}/variante`, 'POST', { variantId });
export const apiGuiaEnviar = (rowId: string) => req<{ ok: true } & ResultadoAvisoGuia>(`/api/orders/${rowId}/guia-enviar`, 'POST');
export const apiEffiPreview = (rowId: string, convenio = '') => req<EffiPreview>(`/api/orders/${rowId}/effi/preview${convenio ? `?convenio=${encodeURIComponent(convenio)}` : ''}`, 'GET');
export interface GuiaLogistica {
  id: string; rowId: string; numero: number; cliente: string; tel: string; leadId: string; ciudad: string; departamento: string;
  total: number; envioCobrado: number; recaudo: number; flete: number; guia: string; guiaUrl: string; transportadora: string; remision: string;
  estado: string; estadoEffi: string; etapa: 'sin_guia' | 'por_recoger' | 'transito' | 'reparto' | 'novedad' | 'entregado' | 'devuelto'; creado: string;
  ultimoMovimiento: { fecha: string; estado: string; observacion: string } | null; entregaEstimada: string; llegaHoy: boolean; entregadoHoy: boolean;
  /** Guía que está en Effi pero no es de un pedido de DealFlow. */
  externa?: boolean;
}
export interface TableroLogistica {
  guias: GuiaLogistica[]; actualizado: string; revisadas?: number; guiasEffiAt?: string;
  resumen: { total: number; activas: number; llegaHoy: number; novedades: number; entregadas: number; devueltas: number; porRecaudar: number; fleteTotal: number; envioCobrado: number; efectividad: number | null; soloEffi?: number };
}
export const apiLogistica = (dias = 45) => req<TableroLogistica>(`/api/logistica/effi?dias=${dias}`, 'GET');
export const apiLogisticaActualizar = (dias = 45) => req<TableroLogistica>('/api/logistica/effi/actualizar', 'POST', { dias });
export const apiEffiConveniosConocidos = () => req<{ convenios: { id: string; nombre: string }[]; porDefecto: string }>('/api/effi-api/convenios-conocidos', 'GET');
export const apiEffiDespachar = (rowId: string, reintentar = false, convenio = '') => req<{ ok: true; remision: string; guia?: string; transportadora?: string; avisos?: string[]; aviso?: string }>(`/api/orders/${rowId}/effi/despachar`, 'POST', { reintentar, convenio });

// ── Campañas del Marketing IA ──
export interface Brief {
  producto: string; descripcion: string; precio: string; publico: string;
  dolores: string[]; beneficios: string[]; angulos: string[];
  propuesta: string; ideasCreativo: string[];
}
export interface CopysAnuncio { textos: string[]; titulos: string[]; descripciones: string[] }
export interface Campana {
  id: string; nombre: string; estado: string; paso: number; objetivo: string;
  brief: Brief | null; creativos: string[]; copys: CopysAnuncio | null;
  publicacion: Record<string, unknown> | null; fecha: string;
}
export interface CuentaAds {
  conectada: boolean; adAccountId: string; adAccountNombre: string;
  pageId: string; pageNombre: string; moneda: string;
}
export interface OpcionesAds {
  cuentas: { id: string; nombre: string; moneda: string }[];
  paginas: { id: string; nombre: string }[];
}
type ConCreditos<T> = T & { creditos?: number; error?: string; sinCreditos?: boolean };

export const apiCampanas = () => req<{ campanas: Campana[]; ads: CuentaAds }>('/api/campanas', 'GET');
export const apiCampana = (id: string) => req<{ campana: Campana }>(`/api/campanas/${id}`, 'GET');
export const apiCrearCampana = (nombre: string, objetivo: string) => req<{ id: string }>('/api/campanas', 'POST', { nombre, objetivo });
export const apiGuardarCampana = (id: string, patch: { nombre?: string; brief?: Brief; creativos?: string[]; copys?: CopysAnuncio }) =>
  req<{ ok: true }>(`/api/campanas/${id}`, 'PUT', patch);
export const apiBorrarCampana = (id: string) => req<{ ok: true }>(`/api/campanas/${id}`, 'DELETE');
// Los tres pasos
export const apiCampanaProducto = (id: string, b: { idea: string; precio?: string; publico?: string; imagen?: string }) =>
  req<ConCreditos<{ brief: Brief }>>(`/api/campanas/${id}/producto`, 'POST', b);
export const apiCampanaCreativos = (id: string, b: { instruccion?: string; cantidad?: number; tamano?: string }) =>
  req<ConCreditos<{ creativos: string[] }>>(`/api/campanas/${id}/creativos`, 'POST', b);
export const apiCampanaTextos = (id: string, b: { tono?: string; cantidad?: number }) =>
  req<ConCreditos<{ copys: CopysAnuncio }>>(`/api/campanas/${id}/textos`, 'POST', b);
// Administrador de anuncios del cliente
export const apiAdsConectar = (acceso: { code?: string; accessToken?: string }) => req<{ opciones: OpcionesAds }>('/api/ads/conectar', 'POST', acceso);
export const apiMetaEstado = () => req<{ messenger: boolean; instagram: boolean; paginas: string[] }>('/api/meta/estado', 'GET');
export const apiMetaConectar = (acceso: { code?: string; accessToken?: string }) => req<{ ok: true; paginas: { nombre: string; conIg: boolean }[] }>('/api/meta/conectar', 'POST', acceso);
export const apiMetaDesconectar = () => req<{ ok: true }>('/api/meta', 'DELETE');
export const apiAdsSeleccionar = (b: { adAccountId: string; adAccountNombre: string; moneda: string; pageId: string; pageNombre: string }) =>
  req<{ ads: CuentaAds }>('/api/ads/seleccionar', 'POST', b);
export const apiAdsDesconectar = () => req<{ ads: CuentaAds }>('/api/ads', 'DELETE');
export const apiPublicarCampana = (id: string, b: { presupuesto: number; textoIdx?: number; tituloIdx?: number; descripcionIdx?: number; creativoIdx?: number }) =>
  req<{ ok: true; ids: Record<string, string> }>(`/api/campanas/${id}/publicar`, 'POST', b);

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
export const apiTogglePremiumTema = (id: string, temaPremium: boolean) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', { temaPremium });
export const apiUpdateStore = (id: string, b: { nombre?: string; correo?: string; plan?: string; password?: string; activa?: boolean }) =>
  req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', b);
export const apiDeleteStore = (id: string) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'DELETE');
export const apiOnboardingTienda = (id: string, body: { nombre?: string; estilo?: { trato?: string; emojis?: boolean; largo?: string }; instrucciones?: string; reglas?: string[]; productos?: string[] }) =>
  req<{ ok: true; productosCreados: number }>(`/api/admin/stores/${id}/onboarding`, 'POST', body);
// ── Estadísticas / Rendimiento ──
export interface Estadisticas {
  rango: { desde: string; hasta: string };
  totales: {
    chats: number;
    chatsAnuncio: number;
    chatsOrganicos: number;
    pedidos: number;
    ventas: number;
    ventasAnuncio: number;
    ticketPromedio: number;
    conversion: number;
  };
  serie: { fecha: string; chats: number; pedidos: number; ventas: number }[];
  porCanal: { canal: string; n: number }[];
  topAnuncios: { id: string; titular: string; canal: string; url: string; media: string; chats: number; ventas: number; pedidos: number }[];
}
export const apiStats = (desde: string, hasta: string) =>
  req<Estadisticas>(`/api/stats?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, 'GET');

export const apiImpersonate = (id: string) => req<{ ok: true }>(`/api/admin/stores/${id}/impersonate`, 'POST');
export const apiStopImpersonate = () => req<{ ok: true }>('/api/auth/stop-impersonate', 'POST');
export const apiSoporteTiendas = () => req<{ tiendas: { id: string; nombre: string }[]; actual: string | null }>('/api/auth/soporte/tiendas', 'GET');
export const apiSoporteCambiar = (id: string) => req<{ ok: true }>(`/api/auth/soporte/cambiar/${id}`, 'POST');
export const apiEntrarBiblioteca = () => req<{ ok: true }>('/api/superadmin/biblioteca/entrar', 'POST');

export interface AdminStoreDetalle {
  id: string; nombre: string; correo: string; plan: string; activa: boolean; creada: string;
  whatsapp: { conectado: boolean; numero: string; modo: string };
  productos: number; pedidos: number; leads: number; agentes: number; ventasMes: number;
  porEstado: { estado: string; n: number }[];
  recientes: { id: string; cliente: string; estado: string; total: number; fecha: string }[];
}
export const apiStoreDetalle = (id: string) => req<{ detalle: AdminStoreDetalle }>(`/api/admin/stores/${id}`, 'GET');

// Barrido: sincroniza el número de WhatsApp de una tienda con lo que hay HOY en su WABA de Meta.
export interface WaSyncResp {
  ok: boolean;
  needsChoice?: boolean;
  aplicado?: { phoneNumberId: string; numero: string; nombre: string };
  anterior?: { phoneNumberId: string; numero: string };
  actual?: { phoneNumberId: string; numero: string; sigueEnMeta: boolean };
  numeros?: { id: string; numero: string; nombre: string }[];
}
export const apiSyncWhatsapp = (id: string, phoneNumberId?: string) =>
  req<WaSyncResp>(`/api/admin/stores/${id}/whatsapp/sync`, 'POST', phoneNumberId ? { phoneNumberId } : {});
// Pone TODOS los chats de una tienda en intervención humana (los atiende una persona, no el bot).
export const apiIntervenirTodos = (id: string, nombre?: string) =>
  req<{ ok: true; intervenidos: number; nombre: string }>(`/api/admin/stores/${id}/intervenir-todos`, 'POST', nombre ? { nombre } : {});

// Auditoría anti-baneo: recorre todos los chats y reporta posibles infracciones.
export interface Hallazgo { gravedad: 'alta' | 'media' | 'baja' | 'ok'; titulo: string; detalle: string; dato?: string }
export interface ReporteBaneo {
  tienda: { id: string; nombre: string };
  rango: { desde: string; hasta: string; dias: number };
  totales: { chats: number; entrantes: number; salientes: number; mediaSalientes: number; fallidos: number; bloqueados?: number };
  senales: {
    iniciadosPorNegocio: number; ejemplosIniciados: string[]; fueraDe24h: number;
    rafagas: number; rafagaMax: number; gapMinSaliente: number; picoPorMinuto: number;
    difusion: { texto: string; chats: number }[]; respuestaPromSeg: number; respuestasInstantaneas: number;
  };
  volumenDiario: { dia: string; salientes: number }[];
  hallazgos: Hallazgo[];
  veredicto: string;
}

export const apiAuditoriaBaneo = (id: string, desde?: string, hasta?: string) => {
  const q = new URLSearchParams();
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const qs = q.toString();
  return req<{ reporte: ReporteBaneo }>(`/api/admin/stores/${id}/auditoria-baneo${qs ? '?' + qs : ''}`, 'GET');
};

// Plantillas de mensajes de Meta, definidas una vez y publicadas en todas las tiendas.
export interface BotonPlantilla { tipo: 'QUICK_REPLY' | 'URL'; texto: string; url?: string }
export interface PlantillaMeta {
  id: string; nombre: string; categoria: string; idioma: string;
  encabezado: string; cuerpo: string; pie: string; botones: BotonPlantilla[]; ejemplos: string[];
  publicadas: number; resumen: { aprobada: number; pendiente: number; rechazada: number; error: number };
}
export interface NuevaPlantilla {
  nombre?: string; categoria: string; idioma: string; encabezado: string; cuerpo: string; pie: string;
  botones: BotonPlantilla[]; ejemplos: string[];
}
export const apiMetaTemplates = () =>
  req<{ plantillas: PlantillaMeta[]; tiendasCloud: number }>(`/api/superadmin/meta-templates`, 'GET');
export const apiCrearPlantillaMeta = (p: NuevaPlantilla) =>
  req<{ ok: true; id: string }>(`/api/superadmin/meta-templates`, 'POST', p);
export const apiActualizarPlantillaMeta = (id: string, p: NuevaPlantilla) =>
  req<{ ok: true }>(`/api/superadmin/meta-templates/${id}`, 'PUT', p);
export const apiEliminarPlantillaMeta = (id: string) =>
  req<{ ok: true }>(`/api/superadmin/meta-templates/${id}`, 'DELETE');
export const apiPublicarPlantillaMeta = (id: string) =>
  req<{ ok: true; total: number; exitosas: number; errores: number }>(`/api/superadmin/meta-templates/${id}/publicar`, 'POST');
export interface ProgresoPlantillas { corriendo: boolean; plantillas: number; hechas: number; exitosas: number; errores: number; saltadas: number; inicio: string; fin: string }
export const apiPublicarTodasPlantillasMeta = () =>
  req<{ ok: true } & ProgresoPlantillas>(`/api/superadmin/meta-templates/publicar-todas`, 'POST');
export const apiProgresoPlantillasMeta = () =>
  req<{ ok: true } & ProgresoPlantillas>(`/api/superadmin/meta-templates/progreso`, 'GET');
export const apiRefrescarTodasPlantillasMeta = () =>
  req<{ ok: true; plantillas: number; actualizadas: number }>(`/api/superadmin/meta-templates/refrescar-todas`, 'POST');
export interface EstadoPlantillaTienda { store_id: string; nombre: string; estado: string; motivo: string; updated_at: string }
export const apiPlantillaMetaTiendas = (id: string) =>
  req<{ tiendas: EstadoPlantillaTienda[] }>(`/api/superadmin/meta-templates/${id}/tiendas`, 'GET');
export const apiRefrescarPlantillaMeta = (id: string) =>
  req<{ ok: true; actualizadas: number }>(`/api/superadmin/meta-templates/${id}/refrescar`, 'POST');

// ── Superadmin ──
export interface SuperStore {
  id: string; tienda: string; correo: string; plan: string; ventas: number; activa: boolean; oculta: boolean;
}
export const apiSuperStores = () => req<{ stores: SuperStore[] }>('/api/superadmin/stores', 'GET');
export const apiToggleHideStore = (id: string, oculta: boolean) => req<{ ok: true }>(`/api/superadmin/stores/${id}/hide`, 'PATCH', { oculta });

// ── Biblioteca de productos ──
export interface LibraryItem {
  id: string; nombre: string; precio: number; gratis: boolean; precioImportacion: number; portada: string | null; adquirido: boolean;
}
export interface LibraryAdminItem {
  id: string; nombre: string; precio: number; gratis: boolean; precioImportacion: number; activo: boolean; editable: boolean; portada: string | null; importos: number;
}
export interface SuperStoreProduct { id: string; nombre: string; precio: number; tipo: string }

export const apiBiblioteca = () => req<{ productos: LibraryItem[] }>('/api/biblioteca', 'GET');
export const apiImportarBiblioteca = (id: string) => req<{ ok?: true; productId?: string; requierePago?: boolean; precio?: number }>(`/api/biblioteca/${id}/importar`, 'POST');
export const apiCheckoutBiblioteca = (id: string) => req<{ url: string }>(`/api/biblioteca/${id}/checkout`, 'POST');

export const apiSuperBiblioteca = () => req<{ productos: LibraryAdminItem[] }>('/api/superadmin/biblioteca', 'GET');
export const apiSuperStoreProducts = (storeId: string) => req<{ productos: SuperStoreProduct[] }>(`/api/superadmin/stores/${storeId}/products`, 'GET');
export const apiSuperBibliotecaFromProduct = (productId: string, gratis: boolean, precioImportacion: number, editable: boolean) =>
  req<{ id: string }>('/api/superadmin/biblioteca/from-product', 'POST', { productId, gratis, precioImportacion, editable });
export const apiSuperBibliotecaPatch = (id: string, patch: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean; editable?: boolean }) =>
  req<{ ok: true }>(`/api/superadmin/biblioteca/${id}`, 'PATCH', patch);
export const apiSuperBibliotecaDelete = (id: string) => req<{ ok: true }>(`/api/superadmin/biblioteca/${id}`, 'DELETE');
export const apiSuperBibliotecaEditar = (id: string) => req<{ ok: true; productId: string }>(`/api/superadmin/biblioteca/${id}/editar`, 'POST');
export const apiSuperBibliotecaEnviarATienda = (id: string, storeId: string) =>
  req<{ ok: true; productId: string }>(`/api/superadmin/biblioteca/${id}/enviar-a-tienda`, 'POST', { storeId });

export const apiCreatePlan = (b: { nombre: string; precio: number; features: string[] }) => req<{ id: string }>('/api/admin/plans', 'POST', b);
export const apiUpdatePlan = (id: string, b: { nombre?: string; precio?: number; features?: string[] }) =>
  req<{ ok: true }>(`/api/admin/plans/${id}`, 'PATCH', b);
export const apiDeletePlan = (id: string) => req<{ ok: true }>(`/api/admin/plans/${id}`, 'DELETE');

// ── Trazabilidad de pedidos (admin) ──
export interface EventoTraza { id: number; store_id: string; tienda: string | null; order_id: string; numero: number | null; cliente: string | null; estado: string | null; etapa: string; nivel: 'info' | 'ok' | 'warn' | 'error'; titulo: string; detalle: string; created_at: string; tieneDatos: number }
export interface ResumenTraza { pedidos: number | null; despachos: number | null; fallos: number | null; apiFallos: number | null }
export const apiTrazabilidad = (f: { store?: string; q?: string; nivel?: string; etapa?: string; antes?: number }) => {
  const qs = Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return req<{ eventos: EventoTraza[]; resumen: ResumenTraza }>(`/api/admin/trazabilidad${qs ? '?' + qs : ''}`, 'GET');
};
export interface PedidoTraza { id: string; store_id: string; tienda: string; numero: number; cliente: string; tel: string; ciudad: string; departamento: string; direccion: string; estado: string; total: number; envio: number; origen: string; despacho_proveedor: string; effi_remision: string; dropi_order_id: string; guia: string; transportadora: string; estado_woo: string; created_at: string }
export const apiTrazaPedido = (orderId: string) => req<{ pedido: PedidoTraza | null; items: { qty: number; nombre: string; precio: number }[]; eventos: (Omit<EventoTraza, 'store_id' | 'tienda' | 'order_id' | 'numero' | 'cliente' | 'estado' | 'tieneDatos'> & { datos: unknown })[] }>(`/api/admin/trazabilidad/pedido/${orderId}`, 'GET');
export const apiEffiConvenios = () => req<{ convenios: { id: string; nombre: string }[]; actual: string }>('/api/effi-api/convenios', 'GET');

// ── Leads por estado (embudo) ──
export type EstadoLead = 'preguntando' | 'interesado' | 'faltan_datos' | 'datos_completos' | 'venta' | 'perdido';
export interface LeadEstado { id: string; nombre: string; tel: string; canal: string; asignado: string; estado: EstadoLead; auto: EstadoLead; manual: boolean; ultimo: string; ultimoIso: string; hora: string; mensajes: number; pedido: { numero: number; total: number; estado: string } | null }
export const apiLeadsEstados = () => req<{ leads: LeadEstado[] }>('/api/leads/estados', 'GET');
export const apiSetLeadEstado = (id: string, estado: EstadoLead | '') => req<{ ok: true }>(`/api/leads/${id}/estado`, 'POST', { estado });
export interface EstadoBloqueo { bloqueado: boolean; enMeta: boolean; nota: string }
export const apiLeadBloqueo = (id: string) => req<EstadoBloqueo>(`/api/leads/${id}/bloqueo`, 'GET');
export const apiLeadBloquear = (id: string) => req<{ ok: true; enMeta: boolean; nota: string }>(`/api/leads/${id}/bloquear`, 'POST');
export const apiLeadDesbloquear = (id: string) => req<{ ok: true }>(`/api/leads/${id}/desbloquear`, 'POST');
export interface AppConectada { id: string; nombre: string; enlace: string; esDealFlow: boolean }
export const apiAppsConectadas = () => req<{ apps: AppConectada[]; waba: string }>('/api/whatsapp/apps-conectadas', 'GET');

export interface ResultadoSyncDropi { tipo: 'SIMPLE' | 'VARIABLE'; nombreDropi: string; vinculadas: number; creadas: number; conStock: number; sinDropi: string[]; total: number }
export const apiSincronizarDropi = (productId: string, dropiId: string) => req<ResultadoSyncDropi>(`/api/products/${encodeURIComponent(productId)}/dropi/sincronizar`, 'POST', { dropiId });
export const apiSoltarVariantesDropi = (productId: string) => req<{ ok: true }>(`/api/products/${encodeURIComponent(productId)}/dropi/soltar-variantes`, 'POST');

export interface CfgPedidosShopify { confirmar: boolean; autoDespacho: boolean; modoPrueba: boolean }
export const apiShopifyPedidosCfg = () => req<CfgPedidosShopify>('/api/shopify/pedidos-config', 'GET');
export const apiShopifyTraerPedidos = () => req<{ nuevos: number; revisados: number; aviso: string }>('/api/shopify/pedidos/traer', 'POST', {});
export const apiShopifyPedidosGuardar = (c: Partial<CfgPedidosShopify>) => req<CfgPedidosShopify>('/api/shopify/pedidos-config', 'POST', c);
export const apiShopifyReenviarConfirmacion = (rowId: string) => req<{ ok: true }>(`/api/orders/${encodeURIComponent(rowId)}/shopify/confirmacion`, 'POST');

export interface PuntoSeguridad { punto: string; ok: boolean; detalle: string }
export interface AccesoEquipo { usuario: string; rol: string; soporte: number; metodo: string; ruta: string; ip: string; at: string; tienda: string }
export const apiSeguridad = () => req<{ estado: PuntoSeguridad[]; accesos: AccesoEquipo[] }>('/api/admin/seguridad', 'GET');

// ── Correos ──
export const apiOlvide = (correo: string) => req<{ ok: true }>('/api/auth/olvide', 'POST', { correo });
export const apiValidarRestablecer = (token: string) => req<{ ok: true; correo: string }>(`/api/auth/restablecer/${encodeURIComponent(token)}`, 'GET');
export const apiRestablecer = (token: string, password: string) => req<{ ok: true }>('/api/auth/restablecer', 'POST', { token, password });
export interface PrefsCorreo { pedidos: boolean; novedades: boolean; alertas: boolean; para: string; correoCuenta: string; activo: boolean }
export const apiCorreoPrefs = () => req<PrefsCorreo>('/api/correo/prefs', 'GET');
export const apiGuardarCorreoPrefs = (p: Partial<PrefsCorreo>) => req<PrefsCorreo>('/api/correo/prefs', 'POST', p);
export const apiCorreoPrueba = () => req<{ ok: true; para: string }>('/api/correo/prueba', 'POST');
export interface EstadoCorreo { proveedor: '' | 'resend' | 'smtp'; configurado: boolean; desde: string; responderA: string; host: string; ultimos24h: number; errores24h: number; ultimos: { para: string; asunto: string; estado: string; error: string; created_at: string }[] }
export const apiAdminCorreo = () => req<EstadoCorreo>('/api/admin/correo', 'GET');
export const apiAdminCorreoPrueba = (para: string) => req<{ ok: true }>('/api/admin/correo/prueba', 'POST', { para });

// ── Conversión por anuncio ──
export interface ConversionAnuncio {
  id: string; titular: string; canal: string; url: string; media: string; producto: string;
  chats: number; respondieron: number; pedidos: number; conversion: number;
  confirmados: number; despachados: number; enCamino: number; entregados: number; devueltos: number; cancelados: number;
  ventas: number; ventasEntregadas: number; ticket: number; tasaEntrega: number;
  productos: { nombre: string; unidades: number; ventas: number }[];
  serie: { fecha: string; chats: number; pedidos: number; ventas: number; gasto: number }[];
  adName: string; campaignId: string; campaignName: string; adsetId: string; adsetName: string;
  gasto: number; impresiones: number; clics: number; conversacionesMeta: number;
  costoChat: number; costoPedido: number; costoEntregado: number; roas: number;
}
export interface EstadoMetaAds { conectada: boolean; cuenta: string; moneda: string; ultima: string; error: string; filas: number }
export const apiSincronizarAnuncios = (dias = 30) => req<{ ok: true; filas: number; meta: EstadoMetaAds }>('/api/stats/anuncios/sincronizar', 'POST', { dias });
export const apiStatsAnuncios = (desde: string, hasta: string) =>
  req<{ rango: { desde: string; hasta: string }; anuncios: ConversionAnuncio[]; organico: ConversionAnuncio | null; meta: EstadoMetaAds }>(`/api/stats/anuncios?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, 'GET');
