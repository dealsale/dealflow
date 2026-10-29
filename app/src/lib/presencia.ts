import { useEffect, useState } from 'react';

/**
 * Presencia del equipo en el Inbox: esta pantalla avisa cada 2,5 s en qué chat está
 * y si está escribiendo; el servidor responde quién más está en cada chat.
 */
export interface Presente { nombre: string; escribiendo: boolean }
interface Estado { aqui: Presente[]; chats: Record<string, Presente[]> }

let chatActual = '';
let ultimaTecla = 0;
let estado: Estado = { aqui: [], chats: {} };
const oyentes = new Set<(e: Estado) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let usuarios = 0;

async function avisar() {
  if (document.hidden) return;
  try {
    const r = await fetch('/api/presencia', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: chatActual, escribiendo: !!chatActual && Date.now() - ultimaTecla < 4000 }),
    });
    if (!r.ok) return;
    estado = (await r.json()) as Estado;
    oyentes.forEach((f) => f(estado));
  } catch { /* sin conexión: se reintenta en el próximo ciclo */ }
}

/** La caja de texto llama esto en cada tecla (el aviso sale de una vez la primera vez). */
export function marcarEscribiendo(chatId: string) {
  const antes = Date.now() - ultimaTecla >= 4000;
  ultimaTecla = Date.now();
  if (chatId && chatId === chatActual && antes) void avisar();
}

/** Quién más está en el chat abierto y en cada chat (para la lista). */
export function usePresencia(chatId: string | null | undefined): Estado {
  const [e, setE] = useState(estado);
  useEffect(() => {
    usuarios++;
    oyentes.add(setE);
    if (!timer) timer = setInterval(() => void avisar(), 2500);
    return () => {
      oyentes.delete(setE);
      if (--usuarios <= 0 && timer) { clearInterval(timer); timer = null; chatActual = ''; void avisar(); }
    };
  }, []);
  useEffect(() => {
    if (chatId === undefined) return; // solo lectura (lista de chats)
    chatActual = chatId ? String(chatId) : '';
    void avisar();
    return () => { if (chatActual === String(chatId || '')) chatActual = ''; };
  }, [chatId]);
  return e;
}

/** Texto del aviso: "Andrés está escribiendo…" / "Andrés también tiene abierto este chat". */
export function textoPresencia(ps: Presente[]): { texto: string; escribiendo: boolean } | null {
  if (!ps.length) return null;
  const escriben = ps.filter((p) => p.escribiendo).map((p) => p.nombre);
  const lista = (xs: string[]) => (xs.length <= 2 ? xs.join(' y ') : `${xs.slice(0, 2).join(', ')} y ${xs.length - 2} más`);
  if (escriben.length) return { texto: `${lista(escriben)} ${escriben.length === 1 ? 'está' : 'están'} escribiendo…`, escribiendo: true };
  const nombres = ps.map((p) => p.nombre);
  return { texto: `${lista(nombres)} también ${nombres.length === 1 ? 'tiene' : 'tienen'} abierto este chat`, escribiendo: false };
}
