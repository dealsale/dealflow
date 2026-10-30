/**
 * Variables de las plantillas de WhatsApp con los datos REALES del cliente.
 *
 * Una plantilla de Meta solo trae "{{1}}, {{2}}…" y unos ejemplos de prueba. Aquí se
 * deduce qué es cada variable leyendo el texto que la rodea ("Hola {{1}}" = nombre,
 * "Total: {{5}}" = total, "guía {{3}}" = número de guía…) y se llena con el chat y el
 * último pedido del cliente. Los ejemplos de Meta NUNCA se le mandan a un cliente.
 */
import { db } from './db.js';

export type Campo = 'nombre' | 'nombre_completo' | 'tienda' | 'pedido' | 'productos' | 'total' | 'celular' | 'direccion' | 'ciudad' | 'departamento' | 'transportadora' | 'guia' | 'novedad' | '';

export const NOMBRE_CAMPO: Record<Exclude<Campo, ''>, string> = {
  nombre: 'nombre del cliente', nombre_completo: 'nombre completo', tienda: 'nombre de tu tienda', pedido: 'número del pedido',
  productos: 'productos del pedido', total: 'total del pedido', celular: 'celular', direccion: 'dirección', ciudad: 'ciudad',
  departamento: 'departamento', transportadora: 'transportadora', guia: 'número de guía', novedad: 'novedad del envío',
};

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Qué es cada {{n}} del texto (índice 0 = {{1}}), según lo que tiene antes y el ejemplo. */
export function inferirCampos(texto: string, ejemplos: string[] = []): Campo[] {
  const n = Math.max(0, ...[...String(texto || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
  const out: Campo[] = Array.from({ length: n }, () => '');
  const t = String(texto || '');
  for (const m of t.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const i = Number(m[1]) - 1;
    if (i < 0 || out[i]) continue;
    const antes = t.slice(0, m.index);
    const linea = norm(antes.split('\n').pop() || '').replace(/\{\{\s*\d+\s*\}\}/g, ' ').trimEnd();
    const lineaAnterior = norm(antes.split('\n').slice(-2, -1)[0] || '');
    const ej = String(ejemplos[i] || '').trim();
    const c: Campo =
      /(nombre|name)\W*$/.test(linea) ? 'nombre_completo'
      : /(hola|hi|hello|buenas noticias|buen dia|buenas tardes|buenas noches|querid[oa]|gracias|bienvenid[oa]),?\s*!?$/.test(linea) ? 'nombre'
      : /(celular|telefono|tel|whatsapp|numero de contacto)\W*$/.test(linea) ? 'celular'
      : /direccion\W*$/.test(linea) ? 'direccion'
      : /ciudad\W*$/.test(linea) ? 'ciudad'
      : /departamento\W*$/.test(linea) ? 'departamento'
      : /(transportadora|empresa de envio|mensajeria)\W*$/.test(linea) ? 'transportadora'
      : /(guia|rastreo|seguimiento|tracking)( de rastreo| de envio| de transporte)?\W*$/.test(linea) ? 'guia'
      : /(total|valor|pago de|por un valor de|\$)\W*$/.test(linea) ? 'total'
      : /novedad[^.]*:\s*$/.test(linea) ? 'novedad'
      : /(pediste|compraste|productos?|articulos?|tu compra)\W*$/.test(linea) ? 'productos'
      : /(pedido|orden|order)( no\.?| numero| #)?\s*#?$/.test(linea) ? 'pedido'
      : /(pensando en|interesad[oa] en|antojaste de|quedaste con)\s*$/.test(linea) ? 'productos'
      : /(escribimos de|somos de|te saluda|desde|tienda|pedido en|compra en|en)\s*$/.test(linea) && !/(en camino|llega en)\s*$/.test(linea) ? 'tienda'
      // Sola en su línea, después de "…pedido…:" → la lista de productos.
      : !linea.trim() && /(pedido|compra|confirmado)[^\n]*:\s*$/.test(lineaAnterior) ? 'productos'
      // Por la forma del ejemplo.
      : /^(df-?)?#?\d{3,7}$/i.test(ej) && /pedido|orden/.test(norm(antes)) ? 'pedido'
      : /^\$\s?\d|^\d{1,3}(\.\d{3})+$/.test(ej) ? 'total'
      : /^3\d{9}$/.test(ej.replace(/\D/g, '')) && ej.replace(/\D/g, '').length === 10 ? 'celular'
      : '';
    out[i] = c;
  }
  return out;
}

/** Campo de la parte variable de un botón con enlace (p. ej. https://tienda.co/rastreo/{{1}}). */
export function campoDeBoton(url: string): Campo {
  const u = norm(url);
  return /rastre|track|guia|seguim/.test(u) ? 'guia' : /pedido|orden|order/.test(u) ? 'pedido' : '';
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const unaLinea = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
type Fila = Record<string, unknown>;

export interface DatosCliente { valores: Partial<Record<Exclude<Campo, ''>, string>>; pedido: string }

/** Datos reales del chat: el cliente y su último pedido (por chat o por celular). */
export function datosDelCliente(storeId: string, leadId: string): DatosCliente {
  const lead = db.prepare('SELECT nombre, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { nombre: string; tel: string; wa_id: string } | undefined;
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const d10 = String(lead?.tel || lead?.wa_id || '').replace(/\D/g, '').slice(-10);
  const o = db.prepare(`SELECT * FROM orders WHERE store_id = ? AND (lead_id = ? ${d10.length === 10 ? "OR REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ?" : ''})
    ORDER BY CASE WHEN estado = 'Cancelado' THEN 1 ELSE 0 END, created_at DESC LIMIT 1`).get(storeId, leadId, ...(d10.length === 10 ? [`%${d10}`] : [])) as Fila | undefined;
  const nombreLead = String(lead?.nombre || '').trim();
  const nombreValido = (s: string) => !!s && !/^\+?\d[\d\s-]*$/.test(s);
  const completo = String(o?.cliente || '').trim() || (nombreValido(nombreLead) ? nombreLead : '');
  const v: DatosCliente['valores'] = { tienda };
  if (completo) { v.nombre_completo = unaLinea(completo, 80); v.nombre = completo.split(/\s+/)[0]; }
  if (o) {
    const items = db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(String(o.id)) as { qty: number; nombre: string }[];
    v.pedido = `DF-${String(o.numero)}`;
    if (items.length) v.productos = unaLinea(items.map((i) => `${i.qty}× ${i.nombre}`).join(', '), 300);
    if (Number(o.total)) v.total = pesos(Number(o.total));
    const cel = String(o.tel || '').replace(/\D/g, '').slice(-10);
    if (cel) v.celular = cel;
    for (const k of ['direccion', 'ciudad', 'departamento', 'transportadora', 'guia'] as const) if (String(o[k] || '').trim()) v[k] = unaLinea(o[k], 200);
    const nov = db.prepare('SELECT estado_txt, aclaracion FROM novedades WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(String(o.id)) as { estado_txt: string; aclaracion: string } | undefined;
    if (nov) v.novedad = unaLinea(nov.aclaracion || nov.estado_txt, 200);
  } else if (d10.length === 10) v.celular = d10;
  return { valores: v, pedido: v.pedido || '' };
}

/** Llena las variables con los datos del cliente ('' = no se sabe: hay que escribirla). */
export function llenar(campos: Campo[], datos: DatosCliente): string[] {
  return campos.map((c) => (c ? datos.valores[c] || '' : ''));
}
