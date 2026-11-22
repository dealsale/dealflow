/**
 * Clientes que piden que los contacten después («te escribo luego», «escríbeme mañana»,
 * «déjame pensarlo», «cuando me paguen»…): el chat queda con la etiqueta «Seguimiento»
 * para que el equipo los retome. Se revisa con reglas (sin IA, sin costo) en cada mensaje
 * que entra, lo atienda el bot o una persona.
 *
 * Nunca pisa otra etiqueta que el equipo ya puso (Venta, Reclamo, Garantía…).
 */
import { db, registrarLog } from './db.js';

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Cuándo: «más tarde», «mañana», «el lunes», «la otra semana», «en la quincena»…
const CUANDO = String.raw`(mas tarde|mas tardecito|luego|despues|manana|en un rato|en un ratico|ahorita no|otro dia|la otra semana|la proxima semana|el fin de semana|este fin de semana|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)|en la (quincena|noche|tarde)|fin de mes|el otro mes|el proximo mes|cuando (me paguen|tenga|pueda))`;

const PATRONES: RegExp[] = [
  // «te escribo / te confirmo / le aviso … más tarde»
  new RegExp(String.raw`\b(te|le|les|los|las)\s+(escribo|aviso|confirmo|hablo|llamo|digo|contacto|respondo|marco|cuento|pido|compro)\b.{0,40}\b${CUANDO}\b`),
  // «más tarde te escribo», «mañana le confirmo»
  new RegExp(String.raw`\b${CUANDO}\b.{0,25}\b(te|le|les)\s+(escribo|aviso|confirmo|hablo|llamo|digo|contacto|respondo|marco|cuento|pido|compro)\b`),
  // «escríbeme mañana», «me llamas luego», «recuérdame el viernes»
  new RegExp(String.raw`\b(escribeme|escribame|escribanme|escribenos|llamame|llameme|contactame|contacteme|contactenme|hablame|hableme|avisame|aviseme|recuerdame|recuerdeme|me (escribes|escribe|escriben|llamas|llama|llaman|contactas|contacta|contactan|recuerdas|recuerda|avisas|avisa))\b.{0,30}\b${CUANDO}\b`),
  // «déjame pensarlo», «lo voy a pensar», «lo consulto con mi esposo»
  /\b(dejame|dejeme|dejenme|voy a|tengo que)\s+(pensarlo|pensar|consultarlo|consultar|mirarlo|revisarlo)\b/,
  /\blo\s+(pienso|pensare|voy a pensar|consulto|consultare|miro y te|reviso y te)\b/,
  // «cuando me paguen», «para la quincena»
  /\b(cuando|apenas|ya que)\s+me\s+(paguen|pagan|llegue la plata|consignen)\b/,
  /\b(para|en) la quincena\b/,
];

/** ¿El texto pide que lo contacten después? */
export function pideContactoDespues(texto: string): boolean {
  const t = sinTildes(String(texto || ''));
  if (t.length < 6 || t.length > 600) return false;
  return PATRONES.some((re) => re.test(t));
}

/** Al llegar un mensaje del cliente: si pide contacto después, el chat queda en «Seguimiento». */
export function revisarPideSeguimiento(storeId: string, leadId: string, texto: string): boolean {
  try {
    if (!pideContactoDespues(texto)) return false;
    const r = db.prepare("UPDATE leads SET etiqueta = 'Seguimiento' WHERE id = ? AND store_id = ? AND COALESCE(etiqueta,'') = ''").run(leadId, storeId);
    if (r.changes) registrarLog(storeId, 'info', 'seguimiento', `El cliente pidió que lo contacten después («${String(texto).trim().slice(0, 80)}»): el chat quedó con la etiqueta Seguimiento.`, leadId);
    return r.changes > 0;
  } catch (e) {
    console.warn('[seguimiento] no se pudo revisar si pide contacto después', e);
    return false;
  }
}

/**
 * Chats VIEJOS (una sola vez, al arrancar): si entre los 3 últimos mensajes del cliente pidió que
 * lo contacten después y no compró (sin pedido activo), el chat queda en «Seguimiento».
 * Solo toca chats sin etiqueta y que no pidieron que no les escribamos. Va por tandas para no
 * frenar el servidor.
 */
db.exec('CREATE TABLE IF NOT EXISTS tareas_unicas (nombre TEXT PRIMARY KEY, hecho_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
const TAREA_VIEJOS = 'seguimiento-chats-viejos-v1';

export async function repasarChatsViejos(): Promise<{ revisados: number; marcados: number }> {
  const res = { revisados: 0, marcados: 0 };
  if (db.prepare('SELECT 1 FROM tareas_unicas WHERE nombre = ?').get(TAREA_VIEJOS)) return res;
  // Quien compró (pedido activo) no va a Seguimiento: por chat o por celular (últimos 10 dígitos).
  const diez = (t: unknown) => String(t || '').replace(/\D/g, '').slice(-10);
  const compraron = new Set<string>();
  for (const o of db.prepare("SELECT store_id, tel FROM orders WHERE estado NOT IN ('Cancelado','Devuelto')").all() as { store_id: string; tel: string }[]) if (diez(o.tel).length >= 7) compraron.add(o.store_id + '|' + diez(o.tel));
  const ids = (db.prepare(`SELECT l.id, l.store_id, l.tel FROM leads l
    WHERE COALESCE(l.etiqueta,'') = '' AND COALESCE(l.no_contactar,0) = 0
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.lead_id = l.id AND o.estado NOT IN ('Cancelado','Devuelto'))`).all()) as { id: string; store_id: string; tel: string }[];
  const ultimos = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 3");
  const marcar = db.prepare("UPDATE leads SET etiqueta = 'Seguimiento' WHERE id = ? AND COALESCE(etiqueta,'') = ''");
  const porTienda = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    for (const l of ids.slice(i, i + 300)) {
      res.revisados++;
      if (diez(l.tel).length >= 7 && compraron.has(l.store_id + '|' + diez(l.tel))) continue;
      const textos = (ultimos.all(l.id) as { texto: string }[]).map((m) => m.texto);
      if (textos.some((t) => pideContactoDespues(t)) && marcar.run(l.id).changes) {
        res.marcados++;
        porTienda.set(l.store_id, (porTienda.get(l.store_id) || 0) + 1);
      }
    }
    await new Promise((r) => setTimeout(r, 25)); // deja respirar al servidor entre tandas
  }
  for (const [sid, n] of porTienda) registrarLog(sid, 'info', 'seguimiento', `Repaso de chats anteriores: ${n} chat${n === 1 ? '' : 's'} quedaron con la etiqueta Seguimiento porque el cliente pidió que lo contactaran después y no compró.`);
  db.prepare('INSERT OR IGNORE INTO tareas_unicas (nombre) VALUES (?)').run(TAREA_VIEJOS);
  console.log(`[seguimiento] chats viejos: ${res.revisados} revisados, ${res.marcados} quedaron en Seguimiento`);
  return res;
}

if (process.env.SEGUIMIENTO_VIEJOS !== 'off') {
  setTimeout(() => { void repasarChatsViejos().catch((e) => console.warn('[seguimiento] repaso de chats viejos falló', e)); }, 20_000).unref();
}
