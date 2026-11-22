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
