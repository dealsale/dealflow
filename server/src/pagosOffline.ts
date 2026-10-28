/**
 * Pagos en línea (Wompi) encendidos o apagados. Mientras estén apagados, ningún pago abre
 * Wompi: la tienda ve que el pago es offline y un botón para escribirle a DealFlow por
 * WhatsApp (el mismo número de la landing, LANDING_WA, o el que ponga la administración).
 * Lo gratis (cupón al 100 %, membresía en $0) sigue funcionando igual.
 */
import { db } from './db.js';

db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");

export interface CfgPagos { offline: boolean; whatsapp: string }

export function cfgPagos(): CfgPagos {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'pagos'").get() as { valor: string } | undefined;
  let c: Partial<CfgPagos> = {};
  try { c = r?.valor ? JSON.parse(r.valor) : {}; } catch { c = {}; }
  // Apagados por defecto hasta que la administración vuelva a encender Wompi.
  return { offline: c.offline ?? true, whatsapp: String(c.whatsapp || '').replace(/\D/g, '') };
}

export function guardarCfgPagos(b: Partial<CfgPagos>): CfgPagos {
  const a = cfgPagos();
  const nuevo = { offline: 'offline' in b ? !!b.offline : a.offline, whatsapp: 'whatsapp' in b ? String(b.whatsapp || '').replace(/\D/g, '').slice(0, 15) : a.whatsapp };
  db.prepare("INSERT INTO config_global (clave, valor) VALUES ('pagos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(nuevo));
  return nuevo;
}

/** Número que se usa: el de la administración o, si no hay, el de la landing (LANDING_WA). */
export const whatsappPagos = () => cfgPagos().whatsapp || (process.env.LANDING_WA || '').replace(/\D/g, '');

/** Respuesta para la tienda cuando quiso pagar con los pagos en línea apagados. */
export function respuestaOffline(concepto: string, tienda: string) {
  const num = whatsappPagos();
  const texto = `Hola, soy de la tienda ${tienda || 'en DealFlow'}. Quiero pagar ${concepto} y activar el servicio.`;
  return {
    offline: true,
    error: 'Por ahora los pagos se hacen solo de forma offline. Escríbenos por WhatsApp para hacer tu pago y activar tu cuenta o servicio.',
    whatsapp: num ? `https://wa.me/${num}?text=${encodeURIComponent(texto)}` : '',
  };
}
