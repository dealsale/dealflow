export interface ApiUser {
  id: string;
  email: string;
  nombre: string;
  role: 'VENDEDOR' | 'ADMIN';
  storeId: string | null;
  /** true si es el dueño de la tienda; false si es un agente con permisos limitados */
  esDueno?: boolean;
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
  mensajes: ApiMensaje[];
}

export interface ApiProduct {
  id: string;
  nombre: string;
  precio: number;
  color: string;
  txt: string;
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
export const apiCreateProduct = (b: { nombre: string; precio: number; stock: number }) => req<{ id: string }>('/api/products', 'POST', b);
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
export const apiState = () => req<{ store: { id: string; nombre: string; plan: string }; assistant: { instrucciones: string; reglas: string[] }; products: ApiProduct[]; orders: ApiOrder[]; whatsapp: { conectado: boolean; modo: string; wabaId: string; phoneNumberId: string; numero: string; tokenGuardado: boolean; verifyToken: string }; leads: ApiLead[] }>('/api/state', 'GET');
export const apiOrders = () => req<{ orders: ApiOrder[] }>('/api/orders', 'GET');
export const apiOrderAdvance = (rowId: string) => req<{ estado: string }>(`/api/orders/${rowId}/advance`, 'POST');
export const apiOrderDropi = (rowId: string) => req<{ guia: string }>(`/api/orders/${rowId}/dropi`, 'POST');
export const apiLeads = () => req<{ leads: ApiLead[] }>('/api/leads', 'GET');
export const apiSendLeadMessage = (id: string, texto: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/messages`, 'POST', { texto });
export const apiSendLeadMedia = (id: string, dataUrl: string, nombre: string, caption: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/media`, 'POST', { dataUrl, nombre, caption });
export const apiAssignLead = (id: string, asignado: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { asignado });
export const apiDeleteLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}`, 'DELETE');
export const apiResetLead = (id: string) => req<{ ok: true }>(`/api/leads/${id}/reset`, 'POST');

export const apiWaLinkCloud = (b: { wabaId: string; phoneNumberId: string; accessToken: string }) =>
  req<{ conectado: boolean; numero: string }>('/api/whatsapp', 'PUT', b);
export const apiWaUnlink = () => req<{ conectado: boolean }>('/api/whatsapp', 'DELETE');
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

export const apiMarketingCopy = (b: { idea: string; plataforma: string; tono: string; objetivo: string }) => req<{ copys: string[] }>('/api/marketing/copy', 'POST', b);
export const apiMarketingImagen = (prompt: string) => req<{ url?: string; error?: string; sinConfigurar?: boolean }>('/api/marketing/imagen', 'POST', { prompt });

export const apiTeamList = () => req<{ team: TeamMember[] }>('/api/team', 'GET');
export const apiTeamCreate = (b: { nombre: string; email: string; password: string }) => req<{ id: string }>('/api/team', 'POST', b);
export const apiTeamDelete = (id: string) => req<{ ok: true }>(`/api/team/${id}`, 'DELETE');

export const apiAdminOverview = () => req<{ stores: AdminStore[]; plans: AdminPlan[] }>('/api/admin/overview', 'GET');
export const apiCreateStore = (b: { nombre: string; correo: string; password: string; plan: string }) =>
  req<{ storeId: string }>('/api/admin/stores', 'POST', b);
export const apiToggleStore = (id: string, activa: boolean) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', { activa });
export const apiCreatePlan = (b: { nombre: string; precio: number; features: string[] }) => req<{ id: string }>('/api/admin/plans', 'POST', b);
