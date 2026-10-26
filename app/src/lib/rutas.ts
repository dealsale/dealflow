/**
 * Direcciones por página: cada pantalla tiene su URL, así F5 deja al usuario donde
 * estaba (misma sección, mismo pedido abierto, mismo chat, mismas fechas) y funcionan
 * atrás/adelante del navegador y abrir en otra pestaña.
 *
 *   /pedidos                      sección
 *   /pedidos?pedido=DF-1092       con el detalle de ese pedido abierto (en cualquier sección)
 *   /inbox?chat=<id>              el Inbox con ese chat abierto
 *   /estadisticas?desde=…&hasta=…&p=7d
 *   /admin/cuentas                secciones del equipo DealFlow
 */
import { useEffect, useState } from 'react';
import type { AdminSection, VendedorSection } from '../types';

const VENDEDOR: VendedorSection[] = ['resumen', 'estadisticas', 'productos', 'asistente', 'whatsapp', 'logistica', 'pedidos', 'leads', 'crm', 'equipo', 'marketing', 'dealshop', 'biblioteca', 'integraciones', 'landings'];
const ADMIN: AdminSection[] = ['ventas', 'planes', 'cuentas', 'cupones', 'superadmin', 'biblioteca', 'plantillas', 'trazabilidad', 'landings'];
// Nombre en la URL distinto al interno (más claro para el usuario).
const A_URL: Partial<Record<VendedorSection, string>> = { crm: 'inbox', landings: 'tienda-en-linea' };
const DE_URL: Record<string, VendedorSection> = { inbox: 'crm', 'tienda-en-linea': 'landings' };

export interface Ruta {
  mode?: 'vendedor' | 'admin';
  section?: VendedorSection;
  adminSection?: AdminSection;
  pedido?: string;
  chat?: string;
  producto?: string;
  desde?: string;
  hasta?: string;
  preset?: string;
}

/** Lee la ruta actual del navegador. Lo que no se reconoce queda vacío. */
export function leerRuta(loc: Location = window.location): Ruta {
  const partes = loc.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
  const q = new URLSearchParams(loc.search);
  const r: Ruta = {};
  if (partes[0] === 'admin' && ADMIN.includes(partes[1] as AdminSection)) { r.mode = 'admin'; r.adminSection = partes[1] as AdminSection; }
  else if (partes[0]) {
    const s = (DE_URL[partes[0]] || partes[0]) as VendedorSection;
    if (VENDEDOR.includes(s)) { r.mode = 'vendedor'; r.section = s; }
  }
  const pedido = q.get('pedido'); if (pedido && /^[\w-]{1,40}$/.test(pedido)) r.pedido = pedido;
  const chat = q.get('chat'); if (chat && /^[\w-]{1,64}$/.test(chat)) r.chat = chat;
  const producto = q.get('producto'); if (producto && /^[\w-]{1,64}$/.test(producto)) r.producto = producto;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const d = q.get('desde'); const h = q.get('hasta');
  if (d && h && re.test(d) && re.test(h)) { r.desde = d; r.hasta = h; }
  const p = q.get('p'); if (p) r.preset = p;
  return r;
}

/** Construye la URL de un estado de la app. */
export function urlDe(r: Ruta): string {
  const path = r.mode === 'admin' ? `/admin/${r.adminSection || 'ventas'}` : `/${A_URL[r.section || 'resumen'] || r.section || 'resumen'}`;
  const q = new URLSearchParams();
  if (r.pedido) q.set('pedido', r.pedido);
  if (r.chat && r.mode !== 'admin' && r.section === 'crm') q.set('chat', r.chat);
  if (r.producto && r.mode !== 'admin' && r.section === 'productos') q.set('producto', r.producto);
  if (r.mode !== 'admin' && r.section === 'estadisticas' && r.desde && r.hasta) {
    if (r.preset && r.preset !== 'rango') q.set('p', r.preset);
    else { q.set('desde', r.desde); q.set('hasta', r.hasta); }
  }
  // El editor de landings guarda la landing abierta en ?landing=… (la maneja la sección).
  if (r.mode !== 'admin' && r.section === 'landings') { try { const l = new URLSearchParams(window.location.search).get('landing'); if (l) q.set('landing', l); } catch { /* nada */ } }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Escribe la URL sin recargar. Cambio de pantalla o de pedido = entrada nueva en el
 * historial (atrás funciona); cambio de fechas o de chat = se reemplaza (no llena el historial).
 */
export function escribirRuta(r: Ruta): void {
  const nueva = urlDe(r);
  const actual = window.location.pathname + window.location.search;
  if (nueva === actual) return;
  const antes = leerRuta();
  // Misma pantalla = la sección (o la sección de admin) y el pedido abierto no cambian.
  const pantalla = (x: Ruta) => (x.mode === 'admin' ? `admin/${x.adminSection}` : `v/${x.section || 'resumen'}`) + `|${x.pedido || ''}`;
  const salto = pantalla(antes) !== pantalla(r);
  try {
    if (salto) window.history.pushState(null, '', nueva);
    else window.history.replaceState(null, '', nueva);
  } catch { /* navegadores muy viejos: no pasa nada */ }
}

// ── Memoria por sección (pestañas y filtros) ──
// Lo último que el usuario eligió en cada pantalla, en este navegador.
export function recordar<T>(clave: string, valor: T): void {
  try { localStorage.setItem(`dealflow:ui:${clave}`, JSON.stringify(valor)); } catch { /* modo privado */ }
}
export function recordado<T>(clave: string, def: T): T {
  try { const v = localStorage.getItem(`dealflow:ui:${clave}`); return v === null ? def : (JSON.parse(v) as T); } catch { return def; }
}

/** useState que se acuerda en este navegador (pestañas y filtros de cada pantalla). */
export function useRecordado<T>(clave: string, def: T): [T, (v: T | ((x: T) => T)) => void] {
  const [v, setV] = useState<T>(() => recordado(clave, def));
  useEffect(() => { recordar(clave, v); }, [clave, v]);
  return [v, setV];
}
