/**
 * Dirección lista para la guía, con la IA de la tienda y las reglas de DealFlow:
 * MAYÚSCULAS, abreviaturas oficiales, BRR (y LOC en Bogotá) y orden claro, sin inventar.
 * Como control, la respuesta no puede traer números que no estuvieran en la dirección.
 */
import { resolverTexto } from './ai.js';

const REGLAS = `Corrige y organiza la siguiente dirección en Colombia cumpliendo estas reglas:
- Todo debe ir en MAYÚSCULA.
- Usar abreviaturas oficiales: CARRERA = CRA, CALLE = CL, AVENIDA = AV, DIAGONAL = DG, TRANSVERSAL = TV, KILÓMETRO = KM, APARTAMENTO = APTO, INTERIOR = INT, CASA = CS, TORRE = TO, CONJUNTO = CJ, BARRIO = BRR, LOCALIDAD = LOC.
- Agregar la palabra BRR si no está incluida (identificando el barrio por la ubicación).
- Si la ciudad es BOGOTÁ, agregar también la LOC (localidad).
- Organizar la dirección en orden claro y listo para guía de envío: vía y placa (ej. CRA 14 # 2 - 32), luego torre, interior, apartamento o casa, luego conjunto, luego BRR, luego LOC (solo Bogotá) y al final los puntos de referencia.
- No inventar información, solo corregir y estructurar basándose en la nomenclatura real. Si no puedes identificar el barrio o la localidad con seguridad, NO los agregues.
- Los puntos de referencia (frente a, al lado de, cerca de, diagonal a…) se conservan con el mismo contenido, solo en mayúscula, al final.
- NO incluyas la ciudad ni el departamento (van en otro campo).
Responde SOLO con la dirección final en una línea, sin comillas ni explicaciones.`;

const numeros = (s: string) => (s.match(/\d+/g) || []).map((n) => String(Number(n)));

export async function ordenarDireccionIA(storeId: string, direccion: string, ciudad: string, departamento: string): Promise<{ sugerida: string } | { error: string }> {
  const ia = resolverTexto(storeId);
  if (!ia) return { error: 'sin_ia' };
  try {
    const r = await fetch(ia.url, {
      method: 'POST', headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, temperature: 0, max_tokens: 200, messages: [
        { role: 'system', content: REGLAS },
        { role: 'user', content: `Dirección: ${direccion}\nCiudad: ${ciudad || '(sin dato)'}\nDepartamento: ${departamento || '(sin dato)'}` },
      ] }),
      signal: AbortSignal.timeout(30_000),
    });
    const b = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    let out = String(b.choices?.[0]?.message?.content || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
    out = out.replace(/^["'`«]+|["'`»]+$/g, '').replace(/^(direcci[oó]n( final)?|resultado)\s*:\s*/i, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');
    if (!out || out.length > 300) return { error: 'La IA no devolvió una dirección.' };
    // Control: ningún número nuevo (placas, aptos, torres…) que el cliente no escribió.
    const originales = new Set(numeros(direccion));
    const nuevos = numeros(out).filter((n) => !originales.has(n));
    if (nuevos.length) return { error: `La IA agregó números que no estaban (${nuevos.join(', ')}); no se usa.` };
    return { sugerida: out };
  } catch {
    return { error: 'La IA no respondió. Intenta de nuevo.' };
  }
}
