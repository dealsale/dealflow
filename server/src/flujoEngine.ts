import { db, uid, pj } from './db.js';
import { sendWhatsappText } from './wa.js';

/**
 * Motor de flujos: ejecuta el chatbot que la tienda armó en el constructor.
 * Cuando un flujo está activo, TOMA EL CONTROL de la conversación (la IA se
 * pausa) hasta que termine o un nodo "Fin" devuelva el chat al asistente.
 * procesarFlujo() devuelve true si un flujo manejó el mensaje (para que quien
 * llama NO invoque a la IA).
 */

interface Nodo { id: string; tipo: string; data: Record<string, unknown>; next?: string | null }
interface Flow { id: string; nombre: string; disparador: string; nodos: string }
interface Lead { id: string; wa_id: string | null; tel: string; asignado: string; flow_id: string; flow_nodo: string; flow_vars: string }

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const nodos = (f: Flow) => pj<Nodo[]>(f.nodos, []);
const nodo = (f: Flow, id: string | null | undefined) => nodos(f).find((n) => n.id === id) || null;

function flowsActivos(storeId: string): Flow[] {
  return db.prepare('SELECT id, nombre, disparador, nodos FROM flows WHERE store_id = ? AND activo = 1').all(storeId) as Flow[];
}
function flowPorId(storeId: string, id: string): Flow | undefined {
  return db.prepare('SELECT id, nombre, disparador, nodos FROM flows WHERE store_id = ? AND id = ?').get(storeId, id) as Flow | undefined;
}
function flowPorNombre(storeId: string, nombre: string): Flow | undefined {
  return db.prepare('SELECT id, nombre, disparador, nodos FROM flows WHERE store_id = ? AND nombre = ? COLLATE NOCASE AND activo = 1').get(storeId, nombre) as Flow | undefined;
}

function guardarEstado(leadId: string, flowId: string, nodoId: string, vars: Record<string, unknown>) {
  db.prepare('UPDATE leads SET flow_id = ?, flow_nodo = ?, flow_vars = ? WHERE id = ?').run(flowId, nodoId, JSON.stringify(vars), leadId);
}
function limpiar(leadId: string) {
  db.prepare("UPDATE leads SET flow_id = '', flow_nodo = '', flow_vars = '{}' WHERE id = ?").run(leadId);
}

/** Reemplaza {variable} por su valor guardado. */
function rellenar(texto: string, vars: Record<string, unknown>): string {
  return String(texto || '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '').trim() || `{${k}}`);
}
function textoOpciones(n: Nodo): string {
  const ops = (n.data.opciones as { label: string }[]) || [];
  return `${n.data.texto || 'Elige una opción:'}\n\n${ops.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`;
}

async function enviar(storeId: string, lead: Lead, texto: string) {
  if (!texto.trim()) return;
  db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,'bot',?)").run(uid(), lead.id, texto);
  await sendWhatsappText(storeId, lead.wa_id || lead.tel, texto, lead.tel).catch(() => {});
}

function aplicarAccion(storeId: string, lead: Lead, n: Nodo) {
  const acc = String(n.data.accion || '');
  if (acc === 'asignar') db.prepare("UPDATE leads SET asignado = 'Agente' WHERE id = ?").run(lead.id); // pausa la IA, lo toma un humano
  else if (acc === 'etiquetar') db.prepare('UPDATE leads SET etiqueta = ? WHERE id = ?').run(String(n.data.valor || ''), lead.id);
}

/** Ejecuta el flujo desde un nodo, enviando mensajes hasta que necesite esperar respuesta o termine. */
async function ejecutar(storeId: string, lead: Lead, flow: Flow, desde: string | null | undefined, vars: Record<string, unknown>) {
  let actual = desde;
  let guard = 0;
  while (actual && guard++ < 30) {
    const n = nodo(flow, actual);
    if (!n) break;
    if (n.tipo === 'mensaje') { await enviar(storeId, lead, rellenar(String(n.data.texto || ''), vars)); actual = n.next; }
    else if (n.tipo === 'pregunta') { await enviar(storeId, lead, rellenar(String(n.data.texto || ''), vars)); guardarEstado(lead.id, flow.id, n.id, vars); return; }
    else if (n.tipo === 'opciones') { await enviar(storeId, lead, textoOpciones(n)); guardarEstado(lead.id, flow.id, n.id, vars); return; }
    else if (n.tipo === 'condicion') { const hit = norm(String(vars.__ultima || '')).includes(norm(String(n.data.contiene || ''))); actual = (hit ? n.data.siNext : n.data.noNext) as string | null; }
    else if (n.tipo === 'accion') {
      aplicarAccion(storeId, lead, n);
      if (n.data.accion === 'ir_flujo') {
        const otro = flowPorNombre(storeId, String(n.data.valor || ''));
        const first = otro && nodos(otro)[0];
        if (otro && first) { await ejecutar(storeId, lead, otro, first.id, vars); return; }
      }
      actual = n.next;
    } else if (n.tipo === 'fin') {
      if (n.data.volverIA) db.prepare("UPDATE leads SET asignado = 'Asistente (bot)' WHERE id = ?").run(lead.id);
      limpiar(lead.id);
      return;
    } else actual = n.next;
  }
  limpiar(lead.id); // terminó sin nodo Fin
}

/** Continúa un flujo que estaba esperando la respuesta del cliente. */
async function resumir(storeId: string, lead: Lead, flow: Flow, vars: Record<string, unknown>, mensaje: string): Promise<boolean> {
  const n = nodo(flow, lead.flow_nodo);
  if (!n) { limpiar(lead.id); return false; }
  let siguiente: string | null | undefined;
  if (n.tipo === 'pregunta') {
    if (n.data.guardar) vars[String(n.data.guardar)] = mensaje;
    vars.__ultima = mensaje;
    siguiente = n.next;
  } else if (n.tipo === 'opciones') {
    const ops = (n.data.opciones as { label: string; next: string | null }[]) || [];
    let idx = -1;
    const num = parseInt(mensaje, 10);
    if (num >= 1 && num <= ops.length) idx = num - 1;
    else idx = ops.findIndex((o) => o.label && (norm(mensaje).includes(norm(o.label)) || norm(o.label).includes(norm(mensaje))));
    if (idx < 0) { await enviar(storeId, lead, textoOpciones(n)); return true; } // no entendió: repite las opciones
    vars.__ultima = mensaje;
    siguiente = ops[idx].next;
  } else {
    siguiente = n.next;
  }
  await ejecutar(storeId, lead, flow, siguiente, vars);
  return true;
}

/**
 * Punto de entrada: se llama al llegar un mensaje del cliente. Devuelve true si
 * un flujo lo manejó (para que NO responda la IA).
 */
export async function procesarFlujo(storeId: string, leadId: string): Promise<boolean> {
  const lead = db.prepare('SELECT id, wa_id, tel, asignado, flow_id, flow_nodo, flow_vars FROM leads WHERE id = ?').get(leadId) as Lead | undefined;
  if (!lead) return false;
  const ultimo = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY rowid DESC LIMIT 1").get(leadId) as { texto: string } | undefined;
  const mensaje = String(ultimo?.texto || '').trim();

  // Flujo en curso → continuarlo.
  if (lead.flow_id) {
    const flow = flowPorId(storeId, lead.flow_id);
    if (!flow) { limpiar(leadId); return false; }
    return resumir(storeId, lead, flow, pj<Record<string, unknown>>(lead.flow_vars, {}), mensaje);
  }

  // Si un humano ya atiende el chat, no arrancamos flujos.
  if (lead.asignado && !/asistente|bot/i.test(lead.asignado)) return false;

  const flows = flowsActivos(storeId);
  if (!flows.length) return false;
  const nClientes = (db.prepare("SELECT COUNT(*) n FROM messages WHERE lead_id = ? AND de = 'cliente'").get(leadId) as { n: number }).n;

  let elegido: Flow | undefined;
  // 1) Palabra clave.
  for (const f of flows) {
    const disp = pj<{ tipo: string; palabras: string[] }>(f.disparador, { tipo: 'palabra', palabras: [] });
    if (disp.tipo === 'palabra' && mensaje) {
      const pals = (disp.palabras || []).map(norm).filter(Boolean);
      if (pals.some((p) => norm(mensaje).includes(p))) { elegido = f; break; }
    }
  }
  // 2) Lead nuevo (primer mensaje del cliente).
  if (!elegido && nClientes <= 1) {
    elegido = flows.find((f) => pj<{ tipo: string }>(f.disparador, { tipo: 'palabra' }).tipo === 'lead_nuevo');
  }
  if (!elegido) return false;

  const first = nodos(elegido)[0];
  if (!first) return false;
  await ejecutar(storeId, lead, elegido, first.id, {});
  return true;
}

/** Envía un flujo manualmente a un lead (desde el Inbox). */
export async function lanzarFlujoManual(storeId: string, leadId: string, flowId: string): Promise<{ ok?: boolean; error?: string }> {
  const lead = db.prepare('SELECT id, wa_id, tel, asignado, flow_id, flow_nodo, flow_vars FROM leads WHERE id = ?').get(leadId) as Lead | undefined;
  if (!lead) return { error: 'Lead no encontrado.' };
  const flow = flowPorId(storeId, flowId);
  if (!flow) return { error: 'Flujo no encontrado.' };
  const first = nodos(flow)[0];
  if (!first) return { error: 'El flujo está vacío.' };
  await ejecutar(storeId, lead, flow, first.id, {});
  return { ok: true };
}
