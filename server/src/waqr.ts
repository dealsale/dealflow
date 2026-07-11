import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { db } from './db.js';
import { saveIncomingMessage } from './wa.js';

const DATA_DIR = process.env.DATA_DIR || './data';

type Estado = 'iniciando' | 'qr' | 'conectado' | 'desconectado';

interface Session {
  sock: WASocket | null;
  estado: Estado;
  qrDataUrl: string | null;
  numero: string;
  starting: boolean;
}

const sessions = new Map<string, Session>();

function authDir(storeId: string) {
  return path.join(DATA_DIR, 'wa', storeId);
}

function setConnected(storeId: string, numero: string) {
  db.prepare(
    `INSERT INTO whatsapp (store_id, modo, numero, conectado) VALUES (?, 'qr', ?, 1)
     ON CONFLICT(store_id) DO UPDATE SET modo='qr', numero=excluded.numero, conectado=1`,
  ).run(storeId, numero);
}

function markDisconnected(storeId: string) {
  db.prepare('UPDATE whatsapp SET conectado = 0 WHERE store_id = ?').run(storeId);
}

/** Inicia (o reutiliza) la sesión por QR de una tienda. */
export async function startQrSession(storeId: string): Promise<void> {
  const existing = sessions.get(storeId);
  if (existing && (existing.starting || existing.estado === 'conectado')) return;

  const session: Session = { sock: null, estado: 'iniciando', qrDataUrl: null, numero: '', starting: true };
  sessions.set(storeId, session);

  const { state, saveCreds } = await useMultiFileAuthState(authDir(storeId));
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, syncFullHistory: false });
  session.sock = sock;
  session.starting = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      session.estado = 'qr';
      session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    }
    if (connection === 'open') {
      session.estado = 'conectado';
      session.qrDataUrl = null;
      session.numero = sock.user?.id ? '+' + sock.user.id.split(':')[0].split('@')[0] : '';
      setConnected(storeId, session.numero);
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // El usuario cerró sesión desde el teléfono: limpiar credenciales.
        session.estado = 'desconectado';
        markDisconnected(storeId);
        try { rmSync(authDir(storeId), { recursive: true, force: true }); } catch { /* nada */ }
        sessions.delete(storeId);
      } else {
        // Caída temporal: reintentar.
        session.estado = 'desconectado';
        sessions.delete(storeId);
        void startQrSession(storeId).catch(() => {});
      }
    }
  });

  sock.ev.on('messages.upsert', (ev) => {
    if (ev.type !== 'notify') return;
    for (const m of ev.messages) {
      if (m.key.fromMe || !m.key.remoteJid || m.key.remoteJid.endsWith('@g.us')) continue;
      const texto = m.message?.conversation || m.message?.extendedTextMessage?.text;
      if (!texto) continue;
      const waId = m.key.remoteJid.split('@')[0];
      saveIncomingMessage(storeId, waId, m.pushName || '', texto);
    }
  });
}

export function getQrStatus(storeId: string): { estado: Estado; qr: string | null; numero: string } {
  const s = sessions.get(storeId);
  if (!s) {
    const row = db.prepare("SELECT conectado, numero FROM whatsapp WHERE store_id = ? AND modo = 'qr'").get(storeId) as
      | { conectado: number; numero: string }
      | undefined;
    if (row?.conectado) return { estado: 'conectado', qr: null, numero: row.numero };
    return { estado: 'desconectado', qr: null, numero: '' };
  }
  return { estado: s.estado, qr: s.qrDataUrl, numero: s.numero };
}

export async function sendViaQr(storeId: string, to: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const s = sessions.get(storeId);
  if (!s?.sock || s.estado !== 'conectado') return { ok: false, error: 'La sesión de WhatsApp por QR no está conectada.' };
  try {
    const jid = to.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await s.sock.sendMessage(jid, { text: texto });
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos enviar el mensaje por WhatsApp.' };
  }
}

export async function stopQrSession(storeId: string): Promise<void> {
  const s = sessions.get(storeId);
  try { await s?.sock?.logout(); } catch { /* nada */ }
  try { rmSync(authDir(storeId), { recursive: true, force: true }); } catch { /* nada */ }
  sessions.delete(storeId);
  markDisconnected(storeId);
}

/** Al arrancar el servidor, reconecta las tiendas que ya estaban en modo QR. */
export function restoreQrSessions() {
  const rows = db.prepare("SELECT store_id FROM whatsapp WHERE modo = 'qr' AND conectado = 1").all() as { store_id: string }[];
  for (const r of rows) void startQrSession(r.store_id).catch(() => {});
}
