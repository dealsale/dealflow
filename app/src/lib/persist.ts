import type { Account, Lead, Order, Plan, Product, Promo } from '../types';

const KEY = 'dealflow:demo:v1';

export interface Snapshot {
  orders: Order[];
  products: Product[];
  promos: Promo[];
  leads: Lead[];
  rules: string[];
  assistantText: string;
  plans: Plan[];
  accounts: Account[];
  waConnected: boolean;
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(s: Snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Sin espacio o sin localStorage (p. ej. modo privado): la app sigue, solo no persiste.
  }
}

export function clearSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada que limpiar */
  }
}
