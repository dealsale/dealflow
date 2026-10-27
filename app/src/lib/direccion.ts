/**
 * Ordena una dirección colombiana con la nomenclatura abreviada de siempre:
 *   "calle 45 n° 23 10 apto 301 frente al parque" → "Cl 45 # 23 - 10 apto 301 frente al parque"
 * Solo se reescribe la parte de la vía y la placa (tipo de vía, número, letras, bis,
 * cuadrante, # y guion). Todo lo que viene después (apartamento, torre, barrio, puntos
 * de referencia) se deja EXACTAMENTE como lo escribió el cliente.
 * Si no reconoce una dirección urbana completa (vía + placa), devuelve null.
 */

const TIPOS: [RegExp, string][] = [
  [/(?:avenida|av\.?|avda\.?)\s*(?:carrera|cra\.?|kra\.?|kr\.?|cr\.?)(?![a-z])|\bak(?![a-z])\.?/iy, 'Ak'],
  [/(?:avenida|av\.?|avda\.?)\s*(?:calle|cll\.?|cl\.?)(?![a-z])|\bac(?![a-z])\.?/iy, 'Ac'],
  [/(?:calle|cll|clle|cale|cl)(?![a-z])\.?/iy, 'Cl'],
  [/(?:carrera|carerra|carrea|carr|cra|crr|kra|kr|cr)(?![a-z])\.?/iy, 'Cra'],
  [/(?:diagonal|diag|dg)(?![a-z])\.?/iy, 'Dg'],
  [/(?:transversal|transv|trans|tv|tr)(?![a-z])\.?/iy, 'Tv'],
  [/(?:circular|circ|cir)(?![a-z])\.?/iy, 'Cir'],
  [/(?:autopista|aut)(?![a-z])\.?/iy, 'Aut'],
  [/(?:avenida|avda|av)(?![a-z])\.?/iy, 'Av'],
];

const CUADRANTE: Record<string, string> = { sur: 'Sur', este: 'Este', norte: 'Norte', oeste: 'Oeste', occidente: 'Oeste', oriente: 'Este' };
const cuad = (s?: string) => (s ? CUADRANTE[s.toLowerCase()] || '' : '');

// Número de vía o de placa: "45", "45A", "45 a", "7 bis", "7A bis B", "45 sur".
const NUM = String.raw`(\d{1,3})\s*([a-h])?(?![a-z\d])(?:\s*(bis))?(?:\s*([a-h])(?![a-z\d]))?(?:\s+(sur|este|norte|oeste|occidente|oriente)(?![a-z]))?`;
const VIA = new RegExp(String.raw`\s*${NUM}`, 'iy');
// Separador de la placa: "#", "No.", "N°", "Nro", "numero" (o nada).
const SEP = /\s*(?:#|n[°ºo]\.?|nro\.?|num(?:ero)?\.?|n\.|n(?=\s))?\s*/iy;
const PLACA = new RegExp(String.raw`(\d{1,3})\s*([a-h])?(?![a-z\d])(?:\s*(bis))?(?:\s+(sur|este)(?![a-z]))?\s*(?:[-–—]|\s)\s*(\d{1,3})(?![\d])(?:\s+(sur|este|norte|oeste)(?![a-z]))?`, 'iy');

function numero(m: RegExpExecArray, i: number): string {
  const [n, l1, bis, l2, c] = [m[i], m[i + 1], m[i + 2], m[i + 3], m[i + 4]];
  return `${n}${l1 ? l1.toUpperCase() : ''}${bis ? ' Bis' : ''}${l2 ? ` ${l2.toUpperCase()}` : ''}${c ? ` ${cuad(c)}` : ''}`;
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
      const placa = `${p[1]}${p[2] ? p[2].toUpperCase() : ''}${p[3] ? ' Bis' : ''}${p[4] ? ` ${cuad(p[4])}` : ''} - ${p[5]}${p[6] ? ` ${cuad(p[6])}` : ''}`;
      const antes = original.slice(0, inicio).replace(/[\s,;-]+$/, '');
      // Lo que sigue (apto, barrio, referencias) va tal cual, con su coma si la tenía.
      const cola = original.slice(PLACA.lastIndex);
      const resto = cola.replace(/^[\s,;.]+/, '');
      const via = `${abrev} ${numero(v, 1)} # ${placa}`;
      return [antes, via + (resto ? `${/^\s*[,;]/.test(cola) ? ',' : ''} ${resto}` : '')].filter(Boolean).join(', ');
    }
  }
  return null;
}

/** Enlace a Google Maps con la dirección y la ciudad (para revisar dónde queda). */
export function enlaceMapa(direccion: string, ciudad = '', departamento = ''): string {
  const q = [direccion, ciudad, departamento, 'Colombia'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
