/**
 * Asistente de soporte flotante del panel (para las tiendas): dudas de DealFlow, Meta,
 * marketing… Las respuestas las da un agente externo que configura el equipo de DealFlow en
 * Administración → Cuentas → "Asistente de soporte":
 *   - modo "dify": API de chat de Dify (POST {url}/chat-messages, response_mode blocking);
 *   - modo "webhook": cualquier endpoint propio que reciba el mensaje y devuelva la respuesta.
 * El navegador nunca ve la URL ni la clave: todo pasa por este servidor.
 */
import { db } from './db.js';
import { cifrarTexto, descifrarTexto } from './cifrado.js';

db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");

export interface CfgSoporte { activo: boolean; modo: 'dify' | 'webhook'; url: string; token: string; nombre: string; bienvenida: string }
const POR_DEFECTO: CfgSoporte = { activo: false, modo: 'dify', url: '', token: '', nombre: 'Asistente DealFlow', bienvenida: '¡Hola! 👋 Soy el asistente de DealFlow. Pregúntame lo que quieras: cómo usar la plataforma, Meta, anuncios, marketing o ventas por WhatsApp.' };

export function cfgSoporte(): CfgSoporte {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'soporte_chat'").get() as { valor: string } | undefined;
  let c: Partial<CfgSoporte> = {};
  try { c = r?.valor ? JSON.parse(r.valor) : {}; } catch { c = {}; }
  const cfg = { ...POR_DEFECTO, ...c };
  try { cfg.token = cfg.token ? descifrarTexto(cfg.token) : ''; } catch { cfg.token = ''; }
  return cfg;
}

export function guardarCfgSoporte(b: Partial<CfgSoporte>): CfgSoporte {
  const actual = cfgSoporte();
  const url = 'url' in b ? String(b.url || '').trim().replace(/\/+$/, '') : actual.url;
  if (url && !/^https:\/\/[^\s]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) throw new Error('La URL debe empezar por https://');
  const nuevo: CfgSoporte = {
    activo: 'activo' in b ? !!b.activo : actual.activo,
    modo: b.modo === 'webhook' ? 'webhook' : b.modo === 'dify' ? 'dify' : actual.modo,
    url,
    // La clave solo se cambia si se manda una nueva (vacía = se conserva).
    token: typeof b.token === 'string' && b.token.trim() ? b.token.trim() : actual.token,
    nombre: 'nombre' in b ? String(b.nombre || '').trim().slice(0, 40) || POR_DEFECTO.nombre : actual.nombre,
    bienvenida: 'bienvenida' in b ? String(b.bienvenida || '').trim().slice(0, 400) || POR_DEFECTO.bienvenida : actual.bienvenida,
  };
  db.prepare("INSERT INTO config_global (clave, valor) VALUES ('soporte_chat', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
    .run(JSON.stringify({ ...nuevo, token: nuevo.token ? cifrarTexto(nuevo.token) : '' }));
  return nuevo;
}

/** Lo que ve la administración (la clave solo como "puesta / no puesta"). */
export const cfgSoportePublica = (c = cfgSoporte()) => ({ activo: c.activo, modo: c.modo, url: c.url, tokenPuesto: !!c.token, nombre: c.nombre, bienvenida: c.bienvenida, listo: c.activo && !!c.url });

export interface ContextoSoporte { userId: string; nombre: string; email: string; rol: string; storeId: string; tienda: string; plan: string; seccion: string }

/** Envía el mensaje al agente y devuelve su respuesta (y el id de conversación para seguirla). */
export async function preguntarSoporte(mensaje: string, conversacion: string, ctx: ContextoSoporte, prueba = false): Promise<{ respuesta: string; conversacion: string } | { error: string }> {
  const c = cfgSoporte();
  if ((!c.activo && !prueba) || !c.url) return { error: 'El asistente todavía no está disponible.' };
  const texto = String(mensaje || '').trim().slice(0, 4000);
  if (!texto) return { error: 'Escribe tu pregunta.' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (c.token) headers.Authorization = `Bearer ${c.token}`;
  const quien = { id: ctx.userId, nombre: ctx.nombre, email: ctx.email, rol: ctx.rol };
  const tienda = { id: ctx.storeId, nombre: ctx.tienda, plan: ctx.plan };
  const url = c.modo === 'dify' ? `${c.url}/chat-messages` : c.url;
  const cuerpo = c.modo === 'dify'
    ? { inputs: { tienda: ctx.tienda, plan: ctx.plan, usuario: ctx.nombre, seccion: ctx.seccion }, query: texto, response_mode: 'blocking', conversation_id: conversacion || '', user: `df-${ctx.userId}` }
    : { mensaje: texto, conversacion: conversacion || '', usuario: quien, tienda, seccion: ctx.seccion };
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(90_000) });
    const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      console.warn('[soporte] el agente respondió', r.status, JSON.stringify(b).slice(0, 300));
      // Dify: si la conversación ya no existe, se empieza una nueva.
      if (c.modo === 'dify' && conversacion && r.status === 404) return preguntarSoporte(mensaje, '', ctx, prueba);
      return { error: 'El asistente no pudo responder ahora. Intenta de nuevo en un momento.' };
    }
    const respuesta = String(b.answer ?? b.respuesta ?? b.reply ?? b.text ?? b.message ?? b.output ?? '').trim();
    const conv = String(b.conversation_id ?? b.conversacion ?? conversacion ?? '');
    if (!respuesta) return { error: 'El asistente no devolvió respuesta.' };
    return { respuesta: respuesta.slice(0, 8000), conversacion: conv };
  } catch {
    return { error: 'El asistente tardó demasiado o no está disponible. Intenta de nuevo.' };
  }
}
