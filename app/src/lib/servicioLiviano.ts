/**
 * Servicio de transportadora más liviano (Effi): el de menos kilos según su nombre
 * («Paquete 6 kg», «Caja 20 KG», «Hasta 3 kilos»…). Así la guía no sale por defecto con
 * 6 o 20 kg y la tienda no paga flete de más (lencería, joyas, accesorios pesan poco).
 * Si ningún servicio dice su peso, devuelve '' y se deja la elección como estaba.
 */
export function kgDeServicio(nombre: string): number | null {
  const m = String(nombre || '').toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|kilogramo|kilogramos)\b/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function servicioMasLiviano(servicios: { id: string; nombre: string }[] | undefined): string {
  let mejor: { id: string; kg: number } | null = null;
  for (const s of servicios || []) {
    const kg = kgDeServicio(s.nombre);
    if (kg != null && (!mejor || kg < mejor.kg)) mejor = { id: s.id, kg };
  }
  return mejor?.id || '';
}
