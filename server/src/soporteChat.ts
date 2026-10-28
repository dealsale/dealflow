/**
 * Asistente de soporte flotante del panel (SKY, para las tiendas): dudas de DealFlow, Meta,
 * marketing… Lo configura el equipo de DealFlow en Administración → Cuentas → "Asistente de soporte":
 *   - modo "deepseek" (por defecto): DeepSeek con las instrucciones de SKY. Si la tienda activó
 *     en Integraciones "usar mi clave también para SKY", paga ella con su clave; si no, se usa la
 *     clave guardada aquí o la DEEPSEEK_API_KEY del servidor. El historial se guarda aquí;
 *   - modo "dify": API de chat de Dify (POST {url}/chat-messages, response_mode blocking);
 *   - modo "webhook": cualquier endpoint propio que reciba el mensaje y devuelva la respuesta.
 * El navegador nunca ve la URL ni la clave: todo pasa por este servidor.
 */
import { db } from './db.js';
import { randomUUID } from 'node:crypto';
import { cifrarTexto, descifrarTexto } from './cifrado.js';
import { CONOCIMIENTO_SKY } from './skyConocimiento.js';

db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");
// Historial de las conversaciones con DeepSeek (Dify guarda el suyo).
db.exec("CREATE TABLE IF NOT EXISTS soporte_conversaciones (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mensajes TEXT NOT NULL DEFAULT '[]', actualizado INTEGER NOT NULL)");

type Modo = 'deepseek' | 'dify' | 'webhook';
export interface CfgSoporte { activo: boolean; modo: Modo; url: string; token: string; nombre: string; bienvenida: string; instrucciones: string }

export const INSTRUCCIONES_SKY = `Eres SKY, el asistente de soporte de DealFlow. Hablas con dueños y equipos de tiendas en Colombia que venden por WhatsApp con pago contra entrega. Respondes en español, cercano y claro, en pocas líneas, con pasos numerados cuando expliques cómo hacer algo. Usa **negrita** para nombres de botones y secciones. No uses tablas ni HTML.

Qué es DealFlow (app.dealflow.sbs): un panel donde un asistente con IA atiende el WhatsApp de la tienda, cierra los pedidos y los deja listos para despachar.

Secciones del menú del panel:
- Resumen: ventas del mes, pedidos nuevos, ventas de hoy y pedidos recientes.
- Estadísticas: ventas por día, conversión por anuncio, gasto y resultados de Meta Ads, recaudos contra entrega de Effi.
- Productos: catálogo que usa la IA (precios, variantes, combos y ofertas). La IA solo vende lo que está aquí.
- Tienda en línea: páginas de venta por producto (landings) con ofertas tipo "Paga 1 lleva 2" y precio normal tachado, formulario contra entrega con departamento y ciudad, dirección gratis tutienda.dflw.store o dominio propio, Píxel de Meta y SEO. Tutorial: https://app.dealflow.sbs/tutorial-tienda-en-linea
- Asistente: personalidad, reglas y mensajes de la IA que atiende el WhatsApp.
- WhatsApp: conexión del número (API oficial de Meta) y plantillas aprobadas.
- Logística Effi: tablero de todas las guías por etapa (por recoger, en tránsito, llega hoy, novedades, entregadas, devueltas), recaudos y efectividad; las novedades se resuelven desde ahí o desde el pedido.
- Pedidos: cada pedido con datos de envío, historial de devoluciones del cliente (riesgo), botón 🌐 para dejar la dirección en formato de guía (CRA, CL, APTO, BRR…), despacho a Effi o Dropi, anular y volver a enviar en Effi.
- Leads: conversaciones abiertas que aún no compran.
- Inbox: chats en vivo; puedes tomar el control, bloquear o devolver el chat al asistente. Pasadas 24 horas desde el último mensaje del cliente solo se puede escribir con una plantilla aprobada (botón ⚡).
- Biblioteca: imágenes y archivos que la IA puede enviar.
- DealShop: catálogo de productos de proveedores para dropshipping.
- Equipo: usuarios de la tienda y sus permisos.
- Integraciones: Effi (API key, sucursal, bodega, remitente), Dropi, Shopify (los pedidos entran solos, se confirman por WhatsApp y la guía vuelve a Shopify), Meta Ads, y claves de IA propias.
- Tutoriales: videos y guías.
En el menú del perfil (arriba a la derecha) se puede mostrar u ocultar a SKY.

También ayudas con Meta (Business Manager, Events Manager, Píxel/conjunto de datos, campañas de ventas y mensajes a WhatsApp, públicos, presupuestos), anuncios, creativos, textos de venta y marketing para ecommerce contra entrega en Colombia.

Cómo respondes las dudas de "cómo se hace":
- Usa primero la BASE DE CONOCIMIENTO de abajo: da los pasos en orden, con los nombres exactos de las secciones y botones como aparecen ahí. No inventes botones, menús ni pasos que no estén.
- Si la persona está en una sección del panel, asume que la duda es de esa sección.
- Si la base no cubre lo que preguntan, dilo con honestidad, da la orientación general que sí sepas y sugiere ver **Tutoriales** o escribir al equipo de soporte de DealFlow.
- Termina, si ayuda, con una pregunta corta para saber si quedó resuelto.

Reglas:
- Si no sabes algo concreto de DealFlow (un precio, un plan, un error puntual o algo de la cuenta del usuario), no lo inventes: dilo y sugiere escribir al equipo de soporte de DealFlow.
- No tienes acceso a los datos de la tienda ni puedes hacer cambios en ella; explica cómo hacerlo.
- Nunca pidas contraseñas, claves de API ni códigos de verificación. Si alguien te los comparte, dile que no los envíe por el chat.`;

const POR_DEFECTO: CfgSoporte = { activo: false, modo: 'deepseek', url: '', token: '', nombre: 'SKY', bienvenida: '¡Hola! 👋 Soy **SKY**, tu asistente de DealFlow. Pregúntame lo que quieras: cómo usar la plataforma, Meta, anuncios, marketing o ventas por WhatsApp.', instrucciones: INSTRUCCIONES_SKY };
const claveDeepseek = (c: CfgSoporte) => c.token || process.env.DEEPSEEK_API_KEY || '';

/** Clave DeepSeek de la tienda, solo si la tienda aceptó usarla también para SKY. */
export function claveSkyTienda(storeId: string): string {
  if (!storeId) return '';
  const a = db.prepare('SELECT sky_clave_propia FROM assistants WHERE store_id = ?').get(storeId) as { sky_clave_propia: number } | undefined;
  if (!a?.sky_clave_propia) return '';
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'deepseek'").get(storeId) as { config: string } | undefined;
  try { return String((row ? JSON.parse(row.config) : {}).apiKey || '').trim(); } catch { return ''; }
}

export function cfgSoporte(): CfgSoporte {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'soporte_chat'").get() as { valor: string } | undefined;
  let c: Partial<CfgSoporte> = {};
  try { c = r?.valor ? JSON.parse(r.valor) : {}; } catch { c = {}; }
  const cfg = { ...POR_DEFECTO, ...c };
  // Lo que se guardó con la primera versión (Dify sin conectar) pasa a SKY con DeepSeek.
  if (cfg.modo === 'dify' && !cfg.url) cfg.modo = 'deepseek';
  if (cfg.nombre === 'Asistente DealFlow') cfg.nombre = POR_DEFECTO.nombre;
  if (cfg.bienvenida.startsWith('¡Hola! 👋 Soy el asistente de DealFlow.')) cfg.bienvenida = POR_DEFECTO.bienvenida;
  // Instrucciones vacías o las por defecto de una versión anterior = las por defecto de ahora.
  if (!cfg.instrucciones || (cfg.instrucciones.startsWith('Eres SKY, el asistente de soporte de DealFlow.') && !cfg.instrucciones.includes('BASE DE CONOCIMIENTO'))) cfg.instrucciones = INSTRUCCIONES_SKY;
  try { cfg.token = cfg.token ? descifrarTexto(cfg.token) : ''; } catch { cfg.token = ''; }
  return cfg;
}

export function guardarCfgSoporte(b: Partial<CfgSoporte>): CfgSoporte {
  const actual = cfgSoporte();
  const url = 'url' in b ? String(b.url || '').trim().replace(/\/+$/, '') : actual.url;
  if (url && !/^https:\/\/[^\s]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) throw new Error('La URL debe empezar por https://');
  const nuevo: CfgSoporte = {
    activo: 'activo' in b ? !!b.activo : actual.activo,
    modo: b.modo === 'webhook' || b.modo === 'dify' || b.modo === 'deepseek' ? b.modo : actual.modo,
    url,
    // La clave solo se cambia si se manda una nueva (vacía = se conserva).
    token: typeof b.token === 'string' && b.token.trim() ? b.token.trim() : actual.token,
    nombre: 'nombre' in b ? String(b.nombre || '').trim().slice(0, 40) || POR_DEFECTO.nombre : actual.nombre,
    bienvenida: 'bienvenida' in b ? String(b.bienvenida || '').trim().slice(0, 400) || POR_DEFECTO.bienvenida : actual.bienvenida,
    instrucciones: 'instrucciones' in b ? String(b.instrucciones || '').trim().slice(0, 12000) || INSTRUCCIONES_SKY : actual.instrucciones,
  };
  db.prepare("INSERT INTO config_global (clave, valor) VALUES ('soporte_chat', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
    .run(JSON.stringify({ ...nuevo, token: nuevo.token ? cifrarTexto(nuevo.token) : '', instrucciones: nuevo.instrucciones === INSTRUCCIONES_SKY ? '' : nuevo.instrucciones }));
  return nuevo;
}

/** Lo que ve la administración (la clave solo como "puesta / no puesta"). */
export const conectado = (c: CfgSoporte, storeId = '') => (c.modo === 'deepseek' ? !!(claveSkyTienda(storeId) || claveDeepseek(c)) : !!c.url);
export const cfgSoportePublica = (c = cfgSoporte()) => ({ activo: c.activo, modo: c.modo, url: c.url, tokenPuesto: !!c.token, claveServidor: !!process.env.DEEPSEEK_API_KEY, nombre: c.nombre, bienvenida: c.bienvenida, instrucciones: c.instrucciones, conectado: conectado(c), listo: c.activo && conectado(c) });

export interface ContextoSoporte { userId: string; nombre: string; email: string; rol: string; storeId: string; tienda: string; plan: string; seccion: string }

/** Envía el mensaje al agente y devuelve su respuesta (y el id de conversación para seguirla). */
export async function preguntarSoporte(mensaje: string, conversacion: string, ctx: ContextoSoporte, prueba = false): Promise<{ respuesta: string; conversacion: string } | { error: string }> {
  const c = cfgSoporte();
  if ((!c.activo && !prueba) || !conectado(c, ctx.storeId)) return { error: 'El asistente todavía no está disponible.' };
  const texto = String(mensaje || '').trim().slice(0, 4000);
  if (!texto) return { error: 'Escribe tu pregunta.' };
  if (c.modo === 'deepseek') return preguntarDeepseek(c, texto, conversacion, ctx);
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

/** SKY con DeepSeek: instrucciones + contexto del usuario + las últimas 20 vueltas de la conversación. */
async function preguntarDeepseek(c: CfgSoporte, texto: string, conversacion: string, ctx: ContextoSoporte): Promise<{ respuesta: string; conversacion: string } | { error: string }> {
  const fila = conversacion ? db.prepare('SELECT mensajes FROM soporte_conversaciones WHERE id = ? AND user_id = ?').get(conversacion, ctx.userId) as { mensajes: string } | undefined : undefined;
  let previos: { role: 'user' | 'assistant'; content: string }[] = [];
  try { previos = fila ? JSON.parse(fila.mensajes) : []; } catch { previos = []; }
  const id = fila ? conversacion : randomUUID();
  const quien = [`Usuario: ${ctx.nombre || 'sin nombre'} (${ctx.rol})`, ctx.tienda && `Tienda: ${ctx.tienda}${ctx.plan ? ` · plan ${ctx.plan}` : ''}`, ctx.seccion && `Está en la sección: ${ctx.seccion}`].filter(Boolean).join('\n');
  const base = (c.url || 'https://api.deepseek.com').replace(/\/chat\/completions$/, '');
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${claveSkyTienda(ctx.storeId) || claveDeepseek(c)}` },
      body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.4, max_tokens: 1200, messages: [{ role: 'system', content: `${c.instrucciones || INSTRUCCIONES_SKY}\n\n# BASE DE CONOCIMIENTO\n${CONOCIMIENTO_SKY}\n\nTu nombre es ${c.nombre}.\n${quien}` }, ...previos, { role: 'user', content: texto }] }),
      signal: AbortSignal.timeout(90_000),
    });
    const b = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    if (!r.ok) {
      console.warn('[soporte] DeepSeek respondió', r.status, JSON.stringify(b).slice(0, 300));
      return { error: 'SKY no pudo responder ahora. Intenta de nuevo en un momento.' };
    }
    const respuesta = String(b.choices?.[0]?.message?.content || '').trim();
    if (!respuesta) return { error: 'SKY no devolvió respuesta.' };
    const mensajes = [...previos, { role: 'user', content: texto }, { role: 'assistant', content: respuesta.slice(0, 8000) }].slice(-40);
    db.prepare('INSERT INTO soporte_conversaciones (id, user_id, mensajes, actualizado) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mensajes = excluded.mensajes, actualizado = excluded.actualizado')
      .run(id, ctx.userId, JSON.stringify(mensajes), Date.now());
    return { respuesta: respuesta.slice(0, 8000), conversacion: id };
  } catch {
    return { error: 'SKY tardó demasiado o no está disponible. Intenta de nuevo.' };
  }
}
