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
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_leads_store ON leads(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp(phone_number_id);
`);

export const uid = () => crypto.randomUUID();
export const j = (v: unknown) => JSON.stringify(v);
export const pj = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
