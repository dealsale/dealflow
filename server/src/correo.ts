/**
 * Correos de DealFlow: bienvenida, recuperar contraseña, pago del plan, plan por vencer
 * y avisos a la tienda (pedido nuevo, novedad, alertas como "Meta pide método de pago").
 *
 * Proveedor por variables de entorno (sin ellas no se envía nada y se anota en el log):
 *   - RESEND_API_KEY                         → API de Resend.
 *   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (SMTP_SECURE=1 para 465)
 *                                            → cualquier SMTP: Zoho, Brevo, SendGrid, SES, Google…
 *   - MAIL_FROM     (p. ej. "DealFlow <notificaciones@dealflow.sbs>")
 *   - MAIL_REPLY_TO (p. ej. soporte@dealflow.sbs)
 */
import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { db, uid } from './db.js';

const FROM = process.env.MAIL_FROM || 'DealFlow <notificaciones@dealflow.sbs>';
const REPLY_TO = process.env.MAIL_REPLY_TO || '';
export const APP_URL = (process.env.PUBLIC_APP_URL || 'https://app.dealflow.sbs').replace(/\/+$/, '');

db.exec(`CREATE TABLE IF NOT EXISTS correos_log (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  para TEXT NOT NULL,
  asunto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'enviado',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_correos_log_fecha ON correos_log(created_at)');
try { db.exec("ALTER TABLE stores ADD COLUMN correo_avisos TEXT NOT NULL DEFAULT '{}'"); } catch { /* ya existe */ }
try { db.exec("ALTER TABLE stores ADD COLUMN aviso_vence TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

export type Proveedor = 'resend' | 'smtp' | '';
export function proveedorCorreo(): Proveedor {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return '';
}
export function estadoCorreo() {
  const p = proveedorCorreo();
  const ult = db.prepare("SELECT para, asunto, estado, error, created_at FROM correos_log ORDER BY created_at DESC LIMIT 15").all();
  const hoy = db.prepare("SELECT COUNT(*) AS n, SUM(estado = 'error') AS e FROM correos_log WHERE created_at >= datetime('now', '-1 day')").get() as { n: number; e: number | null };
  return { proveedor: p, configurado: !!p, desde: FROM, responderA: REPLY_TO, host: p === 'smtp' ? process.env.SMTP_HOST : '', ultimos24h: hoy.n, errores24h: hoy.e || 0, ultimos: ult };
}

let smtp: nodemailer.Transporter | null = null;
function transporte(): nodemailer.Transporter {
  if (smtp) return smtp;
  const port = Number(process.env.SMTP_PORT) || 587;
  smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return smtp;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export { esc as escHtml };

/** Plantilla HTML de la marca: título, párrafos y un botón opcional. */
export function plantillaCorreo(titulo: string, parrafos: string[], boton?: { texto: string; url: string }, pie?: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#7c3aed;padding:18px 24px;color:#ffffff;font-weight:800;font-size:18px;letter-spacing:.2px">DealFlow</td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#111827">${esc(titulo)}</h1>
${parrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${p}</p>`).join('\n')}
${boton ? `<p style="margin:20px 0 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px">${esc(boton.texto)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px 22px;font-size:12px;color:#6b7280;line-height:1.5;border-top:1px solid #f0f0f3">${pie || 'Este correo lo envió DealFlow automáticamente.'}${REPLY_TO ? ` ¿Dudas? Escríbenos a <a href="mailto:${esc(REPLY_TO)}" style="color:#7c3aed">${esc(REPLY_TO)}</a>.` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const aTexto = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

export interface Correo { para: string; asunto: string; html: string; tipo: string; storeId?: string | null }

/** Envía un correo. Nunca lanza: devuelve ok/error y lo deja en correos_log. */
export async function enviarCorreo(c: Correo): Promise<{ ok: boolean; error?: string }> {
  const para = String(c.para || '').trim();
  const anotar = (estado: string, error = '') => {
    try { db.prepare('INSERT INTO correos_log (id, store_id, para, asunto, tipo, estado, error) VALUES (?,?,?,?,?,?,?)').run(uid(), c.storeId || null, para, c.asunto.slice(0, 200), c.tipo, estado, error.slice(0, 500)); } catch { /* el log no es crítico */ }
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) { anotar('error', 'Correo de destino inválido'); return { ok: false, error: 'Correo de destino inválido.' }; }
  const prov = proveedorCorreo();
  if (!prov) { anotar('sin_configurar', 'No hay proveedor de correo (RESEND_API_KEY o SMTP_*).'); return { ok: false, error: 'El envío de correos no está configurado en el servidor.' }; }
  const texto = aTexto(c.html.replace(/^[\s\S]*?<body[^>]*>/i, ''));
  try {
    if (prov === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [para], subject: c.asunto, html: c.html, text: texto, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(b.message || `Resend respondió ${r.status}`);
      }
    } else {
      await transporte().sendMail({ from: FROM, to: para, subject: c.asunto, html: c.html, text: texto, ...(REPLY_TO ? { replyTo: REPLY_TO } : {}) });
    }
    anotar('enviado');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[correo] no se pudo enviar', c.tipo, msg);
    anotar('error', msg);
    return { ok: false, error: msg };
  }
}

// ── Avisos a la tienda ───────────────────────────────────────────────
export type TipoAviso = 'pedidos' | 'novedades' | 'alertas';
export interface PrefsCorreo { pedidos: boolean; novedades: boolean; alertas: boolean; para: string }
const PREFS_DEF: PrefsCorreo = { pedidos: true, novedades: true, alertas: true, para: '' };

export function prefsCorreo(storeId: string): PrefsCorreo & { correoCuenta: string } {
  const s = db.prepare('SELECT correo, correo_avisos FROM stores WHERE id = ?').get(storeId) as { correo: string; correo_avisos: string } | undefined;
  let p: Partial<PrefsCorreo> = {};
  try { p = JSON.parse(s?.correo_avisos || '{}'); } catch { /* vacío */ }
  return { ...PREFS_DEF, ...p, correoCuenta: s?.correo || '' };
}
export function guardarPrefsCorreo(storeId: string, p: Partial<PrefsCorreo>): PrefsCorreo {
  const act = prefsCorreo(storeId);
  const para = p.para !== undefined ? String(p.para).trim().toLowerCase() : act.para;
  if (para && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw new Error('Escribe un correo válido.');
  const n: PrefsCorreo = {
    pedidos: p.pedidos !== undefined ? !!p.pedidos : act.pedidos,
    novedades: p.novedades !== undefined ? !!p.novedades : act.novedades,
    alertas: p.alertas !== undefined ? !!p.alertas : act.alertas,
    para,
  };
  db.prepare('UPDATE stores SET correo_avisos = ? WHERE id = ?').run(JSON.stringify(n), storeId);
  return n;
}

// Alertas repetidas (mismo asunto) a la misma tienda: máximo una cada 6 h.
const ultimaAlerta = new Map<string, number>();

/** Aviso por correo a la tienda, si lo tiene encendido. No bloquea ni lanza. */
export function correoATienda(storeId: string, tipo: TipoAviso, asunto: string, titulo: string, parrafos: string[], boton?: { texto: string; url: string }): void {
  try {
    if (!proveedorCorreo()) return;
    const p = prefsCorreo(storeId);
    if (!p[tipo]) return;
    const para = p.para || p.correoCuenta;
    if (!para) return;
    if (tipo === 'alertas') {
      const k = `${storeId}|${asunto}`;
      if (Date.now() - (ultimaAlerta.get(k) || 0) < 6 * 3600_000) return;
      ultimaAlerta.set(k, Date.now());
    }
    const pie = 'Recibes este aviso porque lo tienes encendido en DealFlow → 🔔 Notificaciones → Por correo.';
    void enviarCorreo({ para, asunto, tipo: `tienda_${tipo}`, storeId, html: plantillaCorreo(titulo, parrafos, boton || { texto: 'Abrir DealFlow', url: APP_URL }, pie) });
  } catch (e) { console.warn('[correo] aviso a tienda', e); }
}

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-CO');

/** Pedido nuevo (del asistente, manual o de Shopify). */
export function correoPedidoNuevo(storeId: string, orderId: string, origen: string): void {
  try {
    const o = db.prepare('SELECT numero, cliente, ciudad, total FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { numero: number; cliente: string; ciudad: string; total: number } | undefined;
    if (!o) return;
    const items = db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string }[];
    const lista = items.map((i) => `${i.qty}× ${esc(i.nombre)}`).join('<br>');
    correoATienda(storeId, 'pedidos', `Nuevo pedido DF-${o.numero} · ${o.cliente}`, `🛒 Nuevo pedido DF-${o.numero}`, [
      `<b>${esc(o.cliente)}</b>${o.ciudad ? ` · ${esc(o.ciudad)}` : ''} · <b>${pesos(o.total)}</b>`,
      lista || 'Sin productos',
      `Origen: ${esc(origen)}. Ábrelo en DealFlow para despacharlo.`,
    ]);
  } catch (e) { console.warn('[correo] pedido nuevo', e); }
}

// ── Recuperar contraseña ─────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const pedidosReset = new Map<string, number[]>();

/** Crea el enlace de recuperación y lo envía. Responde igual exista o no la cuenta. */
export async function solicitarRecuperacion(correo: string): Promise<void> {
  const email = String(correo || '').toLowerCase().trim();
  // Máximo 3 solicitudes por correo cada hora.
  const ahora = Date.now();
  const prev = (pedidosReset.get(email) || []).filter((t) => ahora - t < 3600_000);
  if (prev.length >= 3) return;
  pedidosReset.set(email, [...prev, ahora]);
  const u = db.prepare('SELECT id, nombre, store_id FROM users WHERE email = ?').get(email) as { id: string; nombre: string; store_id: string | null } | undefined;
  if (!u) return;
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM reset_tokens WHERE user_id = ? OR expires_at < ?').run(u.id, ahora);
  db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)').run(hashToken(token), u.id, ahora + 60 * 60_000);
  const url = `${APP_URL}/?restablecer=${token}`;
  await enviarCorreo({
    para: email, tipo: 'recuperar', storeId: u.store_id, asunto: 'Restablece tu contraseña de DealFlow',
    html: plantillaCorreo('Restablece tu contraseña', [
      `Hola ${esc(u.nombre.split(' ')[0] || '')}, pediste cambiar la contraseña de tu cuenta de DealFlow.`,
      'Toca el botón para elegir una nueva. El enlace sirve <b>una sola vez</b> y vence en <b>1 hora</b>.',
    ], { texto: 'Elegir contraseña nueva', url }, 'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.'),
  });
}

/** Valida el token; devuelve el usuario o un error. Si `usar`, lo marca como usado. */
export function validarToken(token: string, usar: boolean): { userId: string } | { error: string } {
  const f = db.prepare('SELECT user_id, expires_at, usado FROM reset_tokens WHERE token_hash = ?').get(hashToken(String(token || ''))) as { user_id: string; expires_at: number; usado: number } | undefined;
  if (!f || f.usado) return { error: 'El enlace no es válido o ya se usó. Pide uno nuevo.' };
  if (f.expires_at < Date.now()) return { error: 'El enlace venció. Pide uno nuevo.' };
  if (usar) db.prepare('UPDATE reset_tokens SET usado = 1 WHERE token_hash = ?').run(hashToken(String(token)));
  return { userId: f.user_id };
}

// ── Cuenta y plan ────────────────────────────────────────────────────
export function correoBienvenida(email: string, nombre: string, storeId: string): void {
  void enviarCorreo({
    para: email, tipo: 'bienvenida', storeId, asunto: '¡Bienvenido a DealFlow! 🎉',
    html: plantillaCorreo(`¡Hola ${nombre.split(' ')[0] || ''}, bienvenido a DealFlow!`, [
      'Tu cuenta ya está creada. Con DealFlow tu asistente vende por WhatsApp, crea los pedidos y los despacha con Effi o Dropi.',
      '<b>Primeros pasos:</b><br>1. Elige tu plan.<br>2. Conecta tu WhatsApp.<br>3. Crea tus productos y conecta Effi o Dropi.',
    ], { texto: 'Entrar a DealFlow', url: APP_URL }),
  });
}

export function correoPagoPlan(storeId: string, plan: string, vence: string): void {
  try {
    const s = db.prepare('SELECT correo, nombre FROM stores WHERE id = ?').get(storeId) as { correo: string; nombre: string } | undefined;
    if (!s?.correo) return;
    db.prepare("UPDATE stores SET aviso_vence = '' WHERE id = ?").run(storeId);
    void enviarCorreo({
      para: s.correo, tipo: 'pago', storeId, asunto: `Pago recibido · Plan ${plan || ''}`.trim(),
      html: plantillaCorreo('✅ Recibimos tu pago', [
        `Gracias, <b>${esc(s.nombre)}</b>. Tu plan <b>${esc(plan)}</b> quedó activo${vence ? ` hasta el <b>${esc(vence)}</b>` : ''}.`,
      ], { texto: 'Ir a DealFlow', url: APP_URL }),
    });
  } catch (e) { console.warn('[correo] pago', e); }
}

/** Una vez al día: aviso 3 días antes de vencer y el día que vence. */
function revisarVencimientos(): void {
  if (!proveedorCorreo()) return;
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10); // Bogotá
  const filas = db.prepare("SELECT id, nombre, correo, plan, plan_vence, aviso_vence FROM stores WHERE activa = 1 AND inicial_pagado = 1 AND plan_vence IS NOT NULL AND plan_vence != ''").all() as { id: string; nombre: string; correo: string; plan: string; plan_vence: string; aviso_vence: string }[];
  for (const s of filas) {
    const dias = Math.round((new Date(s.plan_vence + 'T12:00:00Z').getTime() - new Date(hoy + 'T12:00:00Z').getTime()) / 86400_000);
    const marca = dias === 3 ? `${s.plan_vence}:3` : dias === 0 ? `${s.plan_vence}:0` : dias === -1 ? `${s.plan_vence}:-1` : '';
    if (!marca || s.aviso_vence === marca) continue;
    db.prepare('UPDATE stores SET aviso_vence = ? WHERE id = ?').run(marca, s.id);
    const titulo = dias > 0 ? `Tu plan vence en ${dias} días` : dias === 0 ? 'Tu plan vence hoy' : 'Tu plan venció';
    void enviarCorreo({
      para: s.correo, tipo: 'vence', storeId: s.id, asunto: `${titulo} · DealFlow`,
      html: plantillaCorreo(`⏰ ${titulo}`, [
        `Hola <b>${esc(s.nombre)}</b>, tu plan <b>${esc(s.plan)}</b> ${dias >= 0 ? `vence el <b>${esc(s.plan_vence)}</b>` : `venció el <b>${esc(s.plan_vence)}</b> y tu asistente está en pausa`}.`,
        'Renuévalo para que tu asistente siga vendiendo sin interrupciones.',
      ], { texto: 'Renovar mi plan', url: APP_URL }),
    });
  }
}

let iniciado = false;
export function iniciarCorreos(): void {
  if (iniciado) return;
  iniciado = true;
  const p = proveedorCorreo();
  console.log(p ? `[correo] listo (${p}, desde ${FROM})` : '[correo] sin proveedor: define RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS para enviar correos');
  setTimeout(revisarVencimientos, 60_000);
  setInterval(revisarVencimientos, 3600_000);
  // El log de correos guarda 60 días.
  setInterval(() => { try { db.prepare("DELETE FROM correos_log WHERE created_at < datetime('now', '-60 days')").run(); } catch { /* */ } }, 24 * 3600_000);
}
