/**
 * Nombre limpio de la transportadora para mostrarle al cliente.
 * Effi devuelve nombres internos como "ENVIO FLETE EFFI - INTERRAPIDISIMO"; al
 * cliente solo le interesa la transportadora real (Interrapidísimo, Envía…).
 */
const CONOCIDAS: [RegExp, string][] = [
  [/inter\s*rapid/i, 'Interrapidísimo'],
  [/servi\s*entrega/i, 'Servientrega'],
  [/coordinadora/i, 'Coordinadora'],
  [/\benvia\b|\benv[ií]a\b|colvanes/i, 'Envía'],
  [/\btcc\b/i, 'TCC'],
  [/deprisa/i, 'Deprisa'],
  [/\b4-?72\b/i, '4-72'],
  [/domina/i, 'Domina'],
  [/saferbo/i, 'Saferbo'],
  [/mensajeros\s*urbanos/i, 'Mensajeros Urbanos'],
  [/99\s*minutos/i, '99 Minutos'],
  [/picap/i, 'Picap'],
  [/redetrans/i, 'Redetrans'],
  [/fedex/i, 'FedEx'],
  [/\bdhl\b/i, 'DHL'],
];

// Palabras que no son la transportadora (tipo de envío, plataforma, etc.).
const RELLENO = /\b(env[ií]os?|flete|fletes|effi|efficommerce|nacional|urbano|contra\s*entrega|contraentrega|recaudo|con|sin|mensajer[ií]a|paqueter[ií]a|carga|logistica|logística|transportadora|s\.?a\.?s?\.?)\b/gi;

export function nombreTransportadora(crudo: string): string {
  const t = String(crudo || '').trim();
  if (!t) return '';
  for (const [re, nombre] of CONOCIDAS) if (re.test(t)) return nombre;
  const limpio = t.replace(RELLENO, ' ').replace(/[-·|/_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  // "SERVIENTREGA" → "Servientrega"
  return limpio === limpio.toUpperCase() ? limpio.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : limpio;
}
