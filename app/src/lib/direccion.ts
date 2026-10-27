/**
 * Dirección lista para guía (sin IA), con las reglas de DealFlow:
 *   - todo en MAYÚSCULA;
 *   - abreviaturas oficiales: CRA, CL, AV, DG, TV, KM, APTO, INT, CS, TO, CJ, BRR, LOC;
 *   - vía y placa primero ("CRA 14 # 2 - 32"); lo que el cliente puso antes de la vía
 *     ("Urbanización los Alcones, …") pasa después de la placa.
 * No agrega barrio ni localidad (eso lo hace la versión con IA) ni inventa nada: los
 * complementos y puntos de referencia conservan su contenido, solo en mayúscula.
 * Devuelve null si no hay dirección.
 */

const TIPOS: [RegExp, string][] = [
  [/(?:avenida|av\.?|avda\.?)\s*(?:carrera|cra\.?|kra\.?|kr\.?|cr\.?)(?![a-z])|\bak(?![a-z])\.?/iy, 'AV CRA'],
  [/(?:avenida|av\.?|avda\.?)\s*(?:calle|cll\.?|cl\.?)(?![a-z])|\bac(?![a-z])\.?/iy, 'AV CL'],
  [/(?:calle|cll|clle|cale|cl)(?![a-z])\.?/iy, 'CL'],
  [/(?:carrera|carerra|carrea|carr|cra|crr|kra|kr|cr)(?![a-z])\.?/iy, 'CRA'],
  [/(?:diagonal|diag|dg)(?![a-z])\.?/iy, 'DG'],
  [/(?:transversal|transv|trans|tv|tr)(?![a-z])\.?/iy, 'TV'],
  [/(?:circular|circ|cir)(?![a-z])\.?/iy, 'CIR'],
  [/(?:autopista|aut)(?![a-z])\.?/iy, 'AUT'],
  [/(?:avenida|avda|av)(?![a-z])\.?/iy, 'AV'],
];

// Complementos con su abreviatura oficial (se aplican fuera de la vía y la placa).
const COMPLEMENTOS: [RegExp, string][] = [
  // APTO, INT, CS y TO solo cuando llevan su número o letra ("casa 5", "torre B"), para
  // no tocar referencias como "la casa azul".
  [/\b(?:apartamento|apartam|apto|apt|ap)\b\.?(?=\s*(?:#|no\.?)?\s*(?:\d|[a-z]\b))/gi, 'APTO'],
  [/\b(?:interior|int)\b\.?(?=\s*(?:#|no\.?)?\s*(?:\d|[a-z]\b))/gi, 'INT'],
  [/\b(?:casa|cs)\b\.?(?=\s*(?:#|no\.?)?\s*(?:\d|[a-z]\b))/gi, 'CS'],
  [/\b(?:torre|tor|to)\b\.?(?=\s*(?:#|no\.?)?\s*(?:\d|[a-z]\b))/gi, 'TO'],
  [/\b(?:conjunto|conj|cj)\b\.?/gi, 'CJ'],
  [/\b(?:barrio|bario|brr|br|b\/)(?=\s|$)\.?/gi, 'BRR'],
  [/\b(?:localidad|loc)\b\.?/gi, 'LOC'],
  [/\b(?:avenida|avda|av)\b\.?/gi, 'AV'],
  [/\b(?:kil[oó]metro|kilometro|km)\b\.?/gi, 'KM'],
];

const CUADRANTE: Record<string, string> = { sur: 'SUR', este: 'ESTE', norte: 'NORTE', oeste: 'OESTE', occidente: 'OESTE', oriente: 'ESTE' };
const cuad = (s?: string) => (s ? CUADRANTE[s.toLowerCase()] || '' : '');

// Número de vía: "45", "45A", "45 a", "7 bis", "7A bis B", "45 sur".
const NUM = String.raw`(\d{1,3})\s*([a-h])?(?![a-z\d])(?:\s*(bis))?(?:\s*([a-h])(?![a-z\d]))?(?:\s+(sur|este|norte|oeste|occidente|oriente)(?![a-z]))?`;
const VIA = new RegExp(String.raw`\s*${NUM}`, 'iy');
// Separador de la placa: "#", "No.", "N°", "Nro", "numero" (o nada).
const SEP = /\s*(?:#|n[°ºo]\.?|nro\.?|num(?:ero)?\.?|n\.|n(?=\s))?\s*/iy;
const PLACA = new RegExp(String.raw`(\d{1,3})\s*([a-h])?(?![a-z\d])(?:\s*(bis))?(?:\s+(sur|este)(?![a-z]))?\s*(?:[-–—]|\s)\s*(\d{1,3})(?![\d])(?:\s+(sur|este|norte|oeste)(?![a-z]))?`, 'iy');

function numero(m: RegExpExecArray, i: number): string {
  const [n, l1, bis, l2, c] = [m[i], m[i + 1], m[i + 2], m[i + 3], m[i + 4]];
  return `${n}${l1 ? l1.toUpperCase() : ''}${bis ? ' BIS' : ''}${l2 ? ` ${l2.toUpperCase()}` : ''}${c ? ` ${cuad(c)}` : ''}`;
}

/** Complementos y referencias: abreviaturas oficiales y mayúscula, sin cambiar su contenido. */
function complementos(s: string): string {
  let out = s;
  for (const [re, abrev] of COMPLEMENTOS) out = out.replace(re, abrev);
  return out.replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');
}

export function ordenarDireccion(direccion: string): string | null {
  const original = String(direccion || '').replace(/\s+/g, ' ').trim();
  if (!original) return null;
  // La vía puede no estar al inicio ("Barrio Centro, calle 5 # 3-2"): se busca la primera.
  for (let inicio = 0; inicio < original.length; inicio++) {
    if (inicio > 0 && /[a-z0-9]/i.test(original[inicio - 1])) continue;
    for (const [re, abrev] of TIPOS) {
      re.lastIndex = inicio;
      const t = re.exec(original);
      if (!t) continue;
      VIA.lastIndex = re.lastIndex;
      const v = VIA.exec(original);
      if (!v) continue;
      SEP.lastIndex = VIA.lastIndex;
      SEP.exec(original);
      PLACA.lastIndex = SEP.lastIndex || VIA.lastIndex;
      const p = PLACA.exec(original);
      if (!p) continue;
      const placa = `${p[1]}${p[2] ? p[2].toUpperCase() : ''}${p[3] ? ' BIS' : ''}${p[4] ? ` ${cuad(p[4])}` : ''} - ${p[5]}${p[6] ? ` ${cuad(p[6])}` : ''}`;
      const via = `${abrev} ${numero(v, 1)} # ${placa}`;
      // Lo de antes de la vía (urbanización, barrio…) va después de la placa; luego lo que seguía.
      const antes = complementos(original.slice(0, inicio).replace(/[\s,;-]+$/, ''));
      const resto = complementos(original.slice(PLACA.lastIndex).replace(/^[\s,;.]+/, ''));
      return [via, antes, resto].filter(Boolean).join(' ');
    }
  }
  // Sin vía urbana reconocible (rural, manzana-casa, avenida con nombre): solo mayúscula y abreviaturas.
  return complementos(original);
}

/** Enlace a Google Maps con la dirección y la ciudad (para revisar dónde queda). */
export function enlaceMapa(direccion: string, ciudad = '', departamento = ''): string {
  const q = [direccion, ciudad, departamento, 'Colombia'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
