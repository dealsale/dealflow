import makeWASocket, { Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { db, uid } from './db.js';
import { saveIncomingMessage } from './wa.js';
import { mediaExt } from './media.js';

const DATA_DIR = process.env.DATA_DIR || './data';

type Estado = 'iniciando' | 'qr' | 'conectado' | 'desconectado' | 'error';

interface Session {
  sock: WASocket | null;
  estado: Estado;
  qrDataUrl: string | null;
  numero: string;
  error: string;
  intentos: number;
  cerrando: boolean;
}

const sessions = new Map<string, Session>();

// Logger silencioso (Baileys espera algo tipo pino).
const silentLogger = {
  level: 'silent',
  child() {
    return silentLogger;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

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
  const prev = sessions.get(storeId);
  if (prev && prev.estado !== 'error' && prev.estado !== 'desconectado') return;

  const session: Session = { sock: null, estado: 'iniciando', qrDataUrl: null, numero: '', error: '', intentos: 0, cerrando: false };
  sessions.set(storeId, session);
  await connect(storeId, session);
}

/** Crea un socket y engancha sus eventos. Se vuelve a llamar para reconectar. */
async function connect(storeId: string, session: Session): Promise<void> {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir(storeId));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      browser: Browsers.appropriate('Chrome'),
      logger: silentLogger as never,
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.estado = 'qr';
          session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          console.log(`[wa-qr] ${storeId}: código QR generado`);
        } catch {
          session.estado = 'error';
          session.error = 'No pudimos dibujar el código QR.';
        }
      }

      if (connection === 'open') {
        session.estado = 'conectado';
        session.qrDataUrl = null;
        session.intentos = 0;
        session.numero = sock.user?.id ? '+' + sock.user.id.split(':')[0].split('@')[0] : '';
        setConnected(storeId, session.numero);
        console.log(`[wa-qr] ${storeId}: conectado como ${session.numero}`);
      }

      if (connection === 'close') {
        if (session.cerrando) return; // desvinculación manual: no reconectar
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          session.estado = 'desconectado';
          markDisconnected(storeId);
          try { rmSync(authDir(storeId), { recursive: true, force: true }); } catch { /* nada */ }
          sessions.delete(storeId);
          console.log(`[wa-qr] ${storeId}: sesión cerrada desde el teléfono`);
          return;
        }

        // 515 (restart requerido tras vincular) y caídas temporales: reconectar
        // reutilizando las credenciales, con el MISMO objeto de sesión (sin
        // crear sockets en paralelo).
        session.intentos += 1;
        if (session.intentos > 8) {
          session.estado = 'error';
          session.error = 'No pudimos mantener la conexión con WhatsApp. Intenta de nuevo.';
          sessions.delete(storeId);
          console.log(`[wa-qr] ${storeId}: demasiados reintentos, me detengo`);
          return;
        }
        console.log(`[wa-qr] ${storeId}: conexión cerrada (code ${code}), reconectando (intento ${session.intentos})`);
        setTimeout(() => void connect(storeId, session).catch(() => {}), 1200);
      }
    });

    sock.ev.on('messages.upsert', (ev) => {
      if (ev.type !== 'notify') return;
      for (const m of ev.messages) {
        if (m.key.fromMe || !m.key.remoteJid || m.key.remoteJid.endsWith('@g.us') || m.key.remoteJid === 'status@broadcast') continue;
        void handleIncoming(storeId, sock, m).catch((e) => console.error('[wa-qr] error mensaje entrante', e));
      }
    });
  } catch (e) {
    session.estado = 'error';
    session.error = 'No pudimos iniciar la conexión con WhatsApp. Intenta de nuevo.';
    console.error(`[wa-qr] ${storeId}: error al iniciar`, e);
  }
}

/** Procesa un mensaje entrante: texto y/o adjunto (lo descarga y guarda). */
async function handleIncoming(storeId: string, sock: WASocket, m: WAMessage) {
  const waId = m.key.remoteJid!.split('@')[0];
  const nombre = m.pushName || '';
  const msg = m.message;
  const texto = msg?.conversation || msg?.extendedTextMessage?.text;
  const mediaMsg = msg?.imageMessage || msg?.videoMessage || msg?.audioMessage || msg?.documentMessage;

  if (mediaMsg) {
    const mime = (mediaMsg as { mimetype?: string }).mimetype || 'application/octet-stream';
    const tipo = tipoDeMime(mime);
    const caption = (msg?.imageMessage?.caption || msg?.videoMessage?.caption || msg?.documentMessage?.caption || '') as string;
    const nombreArch = (msg?.documentMessage?.fileName || '') as string;
    try {
      const buffer = (await downloadMediaMessage(m, 'buffer', {})) as Buffer;
      const file = uid() + '.' + mediaExt(tipo, mime);
      mkdirSync(path.join(DATA_DIR, 'media', storeId), { recursive: true });
      writeFileSync(path.join(DATA_DIR, 'media', storeId, file), buffer);
      saveIncomingMessage(storeId, waId, nombre, caption, { tipo, url: '/api/media/' + storeId + '/' + file, mime, nombre: nombreArch });
    } catch (e) {
      console.error('[wa-qr] no se pudo descargar el adjunto', e);
      saveIncomingMessage(storeId, waId, nombre, caption || '[adjunto no disponible]');
    }
    return;
  }

  if (texto) saveIncomingMessage(storeId, waId, nombre, texto);
}

function tipoDeMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export function getQrStatus(storeId: string): { estado: Estado; qr: string | null; numero: string; error: string } {
  const s = sessions.get(storeId);
  if (!s) {
    const row = db.prepare("SELECT conectado, numero FROM whatsapp WHERE store_id = ? AND modo = 'qr'").get(storeId) as
      | { conectado: number; numero: string }
      | undefined;
    if (row?.conectado) return { estado: 'conectado', qr: null, numero: row.numero, error: '' };
    return { estado: 'desconectado', qr: null, numero: '', error: '' };
  }
  return { estado: s.estado, qr: s.qrDataUrl, numero: s.numero, error: s.error };
}

export async function sendViaQr(storeId: string, to: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const s = sessions.get(storeId);
  if (!s?.sock || s.estado !== 'conectado') return { ok: false, error: 'La conexión de WhatsApp se está estabilizando. Intenta en unos segundos.' };
  try {
    const jid = to.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await s.sock.sendMessage(jid, { text: texto });
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos enviar el mensaje por WhatsApp.' };
  }
}

export async function sendMediaViaQr(
  storeId: string,
  to: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = sessions.get(storeId);
  if (!s?.sock || s.estado !== 'conectado') return { ok: false, error: 'La conexión de WhatsApp se está estabilizando. Intenta en unos segundos.' };
  try {
    const jid = to.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    if (media.tipo === 'image') await s.sock.sendMessage(jid, { image: media.buffer, caption: caption || undefined });
    else if (media.tipo === 'video') await s.sock.sendMessage(jid, { video: media.buffer, caption: caption || undefined });
    else if (media.tipo === 'audio') await s.sock.sendMessage(jid, { audio: media.buffer, mimetype: media.mime });
    else await s.sock.sendMessage(jid, { document: media.buffer, mimetype: media.mime, fileName: nombre || 'archivo' });
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos enviar el adjunto por WhatsApp.' };
  }
}

export async function stopQrSession(storeId: string): Promise<void> {
  const s = sessions.get(storeId);
  if (s) s.cerrando = true;
  try { await s?.sock?.logout(); } catch { /* nada */ }
  try { s?.sock?.end(undefined); } catch { /* nada */ }
  try { rmSync(authDir(storeId), { recursive: true, force: true }); } catch { /* nada */ }
  sessions.delete(storeId);
  markDisconnected(storeId);
}

/** Al arrancar el servidor, reconecta las tiendas que ya estaban en modo QR. */
export function restoreQrSessions() {
  const rows = db.prepare("SELECT store_id FROM whatsapp WHERE modo = 'qr' AND conectado = 1").all() as { store_id: string }[];
  for (const r of rows) void startQrSession(r.store_id).catch(() => {});
}
