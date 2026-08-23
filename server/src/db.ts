import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'dealflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'Inicio',
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VENDEDOR',
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  precio INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#E0E7FF',
  txt TEXT NOT NULL DEFAULT '#4338CA',
  reglas TEXT NOT NULL DEFAULT '[]',
  fotos TEXT NOT NULL DEFAULT '[]',
  fotos_subidas TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  fotos INTEGER NOT NULL DEFAULT 0,
  fotos_subidas TEXT NOT NULL DEFAULT '[]',
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS promos (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'Promoción',
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  vigencia TEXT NOT NULL DEFAULT 'Sin fecha de vencimiento',
  activa INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  cliente TEXT NOT NULL,
  ciudad TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'Nuevo',
  transportadora TEXT NOT NULL DEFAULT 'Dropi',
  guia TEXT,
  envio INTEGER NOT NULL DEFAULT 0,
  nota TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  precio INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tel TEXT NOT NULL,
  etapa TEXT NOT NULL DEFAULT 'Explorando',
  asignado TEXT NOT NULL DEFAULT 'Asistente (bot)',
  wa_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  de TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assistants (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  instrucciones TEXT NOT NULL DEFAULT '',
  reglas TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS whatsapp (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL DEFAULT '',
  phone_number_id TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  conectado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  precio INTEGER NOT NULL,
  features TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS templates_content (
  template_id TEXT PRIMARY KEY,
  source_store_id TEXT,
  instrucciones TEXT NOT NULL DEFAULT '',
  reglas TEXT NOT NULL DEFAULT '[]',
  productos TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS installed_templates (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, template_id)
);
CREATE TABLE IF NOT EXISTS sent_presentations (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_leads_wa ON leads(store_id, wa_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_leads_store ON leads(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp(phone_number_id);
`);

// Migraciones suaves: agregar columnas nuevas sin romper bases existentes.
// Devuelve true solo si la columna se acaba de crear (útil para backfills únicos).
function addColumn(table: string, colDef: string): boolean {
  const col = colDef.split(' ')[0];
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === col)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  return true;
}
addColumn('whatsapp', "modo TEXT NOT NULL DEFAULT 'cloud'");
addColumn('products', "descripcion TEXT NOT NULL DEFAULT ''");
addColumn('products', "caracteristicas TEXT NOT NULL DEFAULT ''");
addColumn('products', "mensaje_inicial TEXT NOT NULL DEFAULT ''");
addColumn('products', "faqs TEXT NOT NULL DEFAULT '[]'");
addColumn('products', "testimonios TEXT NOT NULL DEFAULT '[]'");
addColumn('products', "modos_uso TEXT NOT NULL DEFAULT ''");
addColumn('products', "videos TEXT NOT NULL DEFAULT '[]'");
addColumn('products', "mensaje_bloques TEXT NOT NULL DEFAULT '[]'");
addColumn('products', "bundles TEXT NOT NULL DEFAULT '[]'");
addColumn('products', "opciones TEXT NOT NULL DEFAULT '[]'"); // [{nombre:'Color',valores:[{valor:'Negro',foto:'...'}]}]
addColumn('products', "contenido_paquete TEXT NOT NULL DEFAULT ''");
addColumn('products', "disparador TEXT NOT NULL DEFAULT ''");
addColumn('products', 'mensaje_inicial_activo INTEGER NOT NULL DEFAULT 1');
addColumn('orders', 'total INTEGER NOT NULL DEFAULT 0');
addColumn('orders', "departamento TEXT NOT NULL DEFAULT ''");
addColumn('assistants', "ia_proveedor TEXT NOT NULL DEFAULT ''"); // deepseek | openai | grok ('' = el del servidor)
db.exec(`CREATE TABLE IF NOT EXISTS store_integrations (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, tipo)
)`);
// Suscripción de cada tienda a DealFlow (la pagan las tiendas por usar la plataforma).
// Modelo: valor INICIAL una sola vez (activa la cuenta) + RENTA mensual recurrente.
addColumn('stores', "plan_estado TEXT NOT NULL DEFAULT 'prueba'"); // sin_plan | activa | vencida
addColumn('stores', 'plan_vence TEXT'); // fecha ISO del próximo cobro de la renta
addColumn('plans', 'mensual INTEGER NOT NULL DEFAULT 0'); // renta mensual (precio = valor inicial una vez)
const nuevaColInicial = addColumn('stores', 'inicial_pagado INTEGER NOT NULL DEFAULT 0'); // 1 = ya pagó el valor inicial

// Planes canónicos de DealFlow: Básico y Premium (valor inicial + renta mensual).
export function ensurePlanesCanonicos(): void {
  const planes: [string, number, number, string[]][] = [
    ['Básico', 2000000, 250000, [
      'Configuración completa del agente IA',
      'WhatsApp Business, Instagram y Facebook Messenger',
      'Respuestas automáticas inteligentes',
      'Atención 24/7',
      'Entrenamiento inicial del bot',
      '30 días de soporte incluido',
    ]],
    ['Premium', 2500000, 250000, [
      'Todo lo del plan Básico +',
      'Primera campaña de marketing',
      'Configuración de anuncios',
      'Estrategia para conseguir clientes',
      'Seguimiento personalizado',
      'Optimización del bot durante el primer mes',
    ]],
  ];
  for (const [nombre, precio, mensual, features] of planes) {
    const ex = db.prepare('SELECT id FROM plans WHERE nombre = ?').get(nombre) as { id: string } | undefined;
    if (ex) db.prepare('UPDATE plans SET precio = ?, mensual = ?, features = ? WHERE id = ?').run(precio, mensual, JSON.stringify(features), ex.id);
    else db.prepare('INSERT INTO plans (id, nombre, precio, mensual, features) VALUES (?,?,?,?,?)').run(crypto.randomUUID(), nombre, precio, mensual, JSON.stringify(features));
  }
}
if (nuevaColInicial) {
  const hayTiendas = (db.prepare('SELECT COUNT(*) AS n FROM stores').get() as { n: number }).n > 0;
  if (hayTiendas) {
    // Migración única al activar el modelo de valor inicial + renta:
    // las tiendas que ya existían siguen con acceso (se consideran "al día").
    db.exec('UPDATE stores SET inicial_pagado = 1 WHERE COALESCE(inicial_pagado,0) = 0');
    ensurePlanesCanonicos();
    // Mueve tiendas de planes viejos (Inicio/Crecimiento/Pro) a Premium y limpia esos planes.
    db.exec("UPDATE stores SET plan = 'Premium' WHERE plan IN ('Inicio','Crecimiento','Pro')");
    db.exec("DELETE FROM plans WHERE nombre IN ('Inicio','Crecimiento','Pro')");
  }
}
db.exec(`CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT '',
  monto INTEGER NOT NULL DEFAULT 0,
  referencia TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  gateway TEXT NOT NULL DEFAULT 'wompi',
  transaccion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_ref ON pagos(referencia)');
addColumn('pagos', "tipo TEXT NOT NULL DEFAULT 'renta'"); // inicial | renta
addColumn('pagos', "cupon TEXT NOT NULL DEFAULT ''"); // código de cupón usado en este pago (si hubo)
// Cupones de descuento que crea el admin de DealFlow para el pago de los planes
// (aplican a la instalación y a la renta). 100% = gratis (activa sin cobrar).
db.exec(`CREATE TABLE IF NOT EXISTS cupones (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  descuento INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  vence TEXT,
  max_usos INTEGER,
  usos INTEGER NOT NULL DEFAULT 0,
  nota TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Cupón de precio fijo: si monto_fijo no es NULL, el pago cuesta ese valor exacto
// (ej: $1.000) en vez de aplicar un porcentaje.
addColumn('cupones', 'monto_fijo INTEGER');
addColumn('leads', "etiqueta TEXT NOT NULL DEFAULT ''"); // Seguimiento, Venta, Garantía…
addColumn('leads', "canal TEXT NOT NULL DEFAULT 'whatsapp'"); // whatsapp | web (multicanal)
addColumn('stores', 'oculta INTEGER NOT NULL DEFAULT 0'); // tienda fantasma: invisible para el admin normal
addColumn('sent_presentations', 'created_at TEXT');
addColumn('messages', "tipo TEXT NOT NULL DEFAULT 'texto'");
addColumn('messages', 'media_url TEXT');
addColumn('messages', 'media_mime TEXT');
addColumn('messages', 'media_nombre TEXT');

export const uid = () => crypto.randomUUID();
export const j = (v: unknown) => JSON.stringify(v);
export const pj = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
