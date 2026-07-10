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
