export interface ApiUser {
  id: string;
  email: string;
  nombre: string;
  role: 'VENDEDOR' | 'ADMIN';
  storeId: string | null;
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

export const apiState = () => req<{ whatsapp: { conectado: boolean; modo: string; wabaId: string; phoneNumberId: string; numero: string; tokenGuardado: boolean }; leads: ApiLead[] }>('/api/state', 'GET');
export const apiLeads = () => req<{ leads: ApiLead[] }>('/api/leads', 'GET');
export const apiSendLeadMessage = (id: string, texto: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/messages`, 'POST', { texto });
export const apiSendLeadMedia = (id: string, dataUrl: string, nombre: string, caption: string) =>
  req<{ ok: true; enviadoPorWhatsapp: boolean; aviso?: string }>(`/api/leads/${id}/media`, 'POST', { dataUrl, nombre, caption });
export const apiAssignLead = (id: string, asignado: string) => req<{ ok: true }>(`/api/leads/${id}`, 'PATCH', { asignado });

export const apiWaLinkCloud = (b: { wabaId: string; phoneNumberId: string; accessToken: string }) =>
  req<{ conectado: boolean; numero: string }>('/api/whatsapp', 'PUT', b);
export const apiWaUnlink = () => req<{ conectado: boolean }>('/api/whatsapp', 'DELETE');
export const apiWaQrStart = () => req<{ ok: true }>('/api/whatsapp/qr/start', 'POST');
export const apiWaQrStatus = () => req<{ estado: string; qr: string | null; numero: string; error: string }>('/api/whatsapp/qr/status', 'GET');

export const apiAdminOverview = () => req<{ stores: AdminStore[]; plans: AdminPlan[] }>('/api/admin/overview', 'GET');
export const apiCreateStore = (b: { nombre: string; correo: string; password: string; plan: string }) =>
  req<{ storeId: string }>('/api/admin/stores', 'POST', b);
export const apiToggleStore = (id: string, activa: boolean) => req<{ ok: true }>(`/api/admin/stores/${id}`, 'PATCH', { activa });
export const apiCreatePlan = (b: { nombre: string; precio: number; features: string[] }) => req<{ id: string }>('/api/admin/plans', 'POST', b);
