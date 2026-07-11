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


/** Construye el JID: respeta @lid/@s.whatsapp.net; los números largos son LID. */
function toJid(to: string): string {
  if (to.includes('@')) return to;
  const num = to.replace(/[^0-9]/g, '');
  return num + (num.length >= 14 ? '@lid' : '@s.whatsapp.net');
}

/**
 * Resuelve la dirección real de envío. Los chats con privacidad LID (@lid) se
 * responden tal cual: WhatsApp mapea internamente ese identificador. Para un
 * número normal le preguntamos a WhatsApp cuál es su JID canónico (así evitamos
 * enviar a un número mal formado que "se acepta" pero nunca llega).
 */
async function resolveSendJid(sock: WASocket, to: string): Promise<{ jid: string } | { error: string }> {
  if (to.endsWith('@lid') || to.endsWith('@g.us')) return { jid: to };
  const num = to.replace(/[^0-9]/g, '');
  if (!num) return { error: 'No hay un número al que enviar.' };
  try {
    const found = await sock.onWhatsApp(num);
    const hit = found?.find((f) => f.exists);
    if (hit?.jid) return { jid: hit.jid };
    // WhatsApp respondió y el número no tiene cuenta: no insistimos en silencio.
    if (found && found.length) return { error: 'Ese número no tiene WhatsApp o no está disponible para recibir mensajes.' };
  } catch {
    // Sin red para verificar: seguimos con la heurística de siempre.
  }
  return { jid: toJid(to) };
}

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

        // 515 (restart requerido tras vincular), 440 (conflicto durante un
        // redeploy: dos contenedores con la misma sesión) y caídas temporales:
        // reconectar con espera creciente, con el MISMO objeto de sesión (sin
        // crear sockets en paralelo). El vigilante de restoreQrSessions
        // levanta la sesión si aun así se agotan los reintentos.
        session.intentos += 1;
        if (session.intentos > 30) {
          session.estado = 'error';
          session.error = 'No pudimos mantener la conexión con WhatsApp. Intenta de nuevo.';
          sessions.delete(storeId);
          console.log(`[wa-qr] ${storeId}: demasiados reintentos, me detengo`);
          return;
        }
        const espera = Math.min(1500 * session.intentos, 30000);
        console.log(`[wa-qr] ${storeId}: conexión cerrada (code ${code}), reconectando en ${espera}ms (intento ${session.intentos})`);
        setTimeout(() => void connect(storeId, session).catch(() => {}), espera);
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
  // Respondemos SIEMPRE a la dirección exacta con la que llegó el mensaje
  // (m.key.remoteJid). Si es un chat con privacidad LID, WhatsApp mapea ese
  // @lid internamente; convertirlo a un número "normal" rompe el envío.
  // El número real (senderPn) solo lo usamos para mostrarlo en el CRM.
  const rawKey = m.key as unknown as { remoteJid?: string; senderPn?: string; remoteJidAlt?: string; participantPn?: string };
  const waId = m.key.remoteJid!;
  const pn = [rawKey.senderPn, rawKey.remoteJidAlt, rawKey.participantPn].find((x) => x && !x.endsWith('@lid'));
  const telSrc = pn || (waId.endsWith('@lid') ? '' : waId);
  const tel = telSrc ? '+' + telSrc.split('@')[0].replace(/[^0-9]/g, '') : '';
  const nombre = m.pushName || '';
  const msg = m.message;
  const texto = msg?.conversation || msg?.extendedTextMessage?.text;
  const mediaMsg = msg?.imageMessage || msg?.videoMessage || msg?.audioMessage || msg?.documentMessage;
  console.log(`[wa-qr] ${storeId}: mensaje entrante de ${waId}${tel ? ` (${tel})` : ''}${texto ? '' : mediaMsg ? ' [adjunto]' : ' [sin contenido legible]'}`);

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
      saveIncomingMessage(storeId, waId, nombre, caption, { tipo, url: '/api/media/' + storeId + '/' + file, mime, nombre: nombreArch }, tel);
    } catch (e) {
      console.error('[wa-qr] no se pudo descargar el adjunto', e);
      saveIncomingMessage(storeId, waId, nombre, caption || '[adjunto no disponible]', undefined, tel);
    }
    return;
  }

  if (texto) saveIncomingMessage(storeId, waId, nombre, texto, undefined, tel);
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
  const r = await resolveSendJid(s.sock, to);
  if ('error' in r) {
    console.warn(`[wa-qr] no envío texto a ${to}: ${r.error}`);
    return { ok: false, error: r.error };
  }
  try {
    await s.sock.sendMessage(r.jid, { text: texto });
    console.log(`[wa-qr] texto enviado a ${r.jid} (destino original ${to})`);
    return { ok: true };
  } catch (e) {
    console.error('[wa-qr] fallo enviando texto a', r.jid, e);
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
  const r = await resolveSendJid(s.sock, to);
  if ('error' in r) {
    console.warn(`[wa-qr] no envío adjunto a ${to}: ${r.error}`);
    return { ok: false, error: r.error };
  }
  const jid = r.jid;
  try {
    if (media.tipo === 'image') await s.sock.sendMessage(jid, { image: media.buffer, caption: caption || undefined });
    else if (media.tipo === 'video') await s.sock.sendMessage(jid, { video: media.buffer, caption: caption || undefined });
    else if (media.tipo === 'audio') await s.sock.sendMessage(jid, { audio: media.buffer, mimetype: media.mime });
    else await s.sock.sendMessage(jid, { document: media.buffer, mimetype: media.mime, fileName: nombre || 'archivo' });
    console.log(`[wa-qr] adjunto enviado a ${jid} (destino original ${to})`);
    return { ok: true };
  } catch (e) {
    console.error('[wa-qr] fallo enviando adjunto a', jid, e);
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

/**
 * Al arrancar, reconecta las tiendas que ya estaban en modo QR y deja un
 * vigilante que levanta cualquier sesión que se haya quedado muerta (por
 * ejemplo, tras un redeploy en el que se agotaron los reintentos).
 */
export function restoreQrSessions() {
  const revisar = (alArrancar = false) => {
    const rows = db.prepare("SELECT store_id FROM whatsapp WHERE modo = 'qr' AND conectado = 1").all() as { store_id: string }[];
    for (const r of rows) {
      const s = sessions.get(r.store_id);
      if (s && s.estado !== 'error' && s.estado !== 'desconectado') continue;
      if (!alArrancar) console.log(`[wa-qr] ${r.store_id}: la sesión estaba caída, la levanto de nuevo`);
      void startQrSession(r.store_id).catch(() => {});
    }
  };
  revisar(true);
  setInterval(() => revisar(), 60_000).unref();
}
