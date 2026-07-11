import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { db } from './db.js';
import { saveIncomingMessage } from './wa.js';

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
        const texto = m.message?.conversation || m.message?.extendedTextMessage?.text;
        if (!texto) continue;
        const waId = m.key.remoteJid.split('@')[0];
        saveIncomingMessage(storeId, waId, m.pushName || '', texto);
      }
    });
  } catch (e) {
    session.estado = 'error';
    session.error = 'No pudimos iniciar la conexión con WhatsApp. Intenta de nuevo.';
    console.error(`[wa-qr] ${storeId}: error al iniciar`, e);
  }
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
