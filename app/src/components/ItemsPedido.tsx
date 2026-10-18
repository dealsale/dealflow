import type { Product } from '../types';
import { Dropdown } from './Dropdown';
import { fmt } from '../lib/format';

/**
 * Filas de productos de un pedido con SELECTOR (producto + variantes), compartidas
 * por crear, editar y completar pedido. Así el nombre del ítem siempre sale del
 * catálogo ("Producto (Talla · Color)") y casa con Effi/Dropi al despachar.
 * Un ítem viejo que no casa con el catálogo queda como `libre` hasta que se elija.
 */
export interface FilaItem {
  productId: string;
  opciones: Record<string, string>; // grupo -> valor
  qty: number;
  precio: number;
  /** Texto original de un ítem que no se encontró en el catálogo. */
  libre?: string;
}

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const conPalabra = (txt: string, palabra: string) => !!palabra && new RegExp(`(^|[^a-z0-9])${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(txt);

export const filaVacia = (): FilaItem => ({ productId: '', opciones: {}, qty: 1, precio: 0 });

/** El producto del catálogo cuyo nombre aparece en el texto (gana el más largo). */
export function productoDeTexto(texto: string, productos: Product[]): Product | undefined {
  const t = norm(texto.split('(')[0]) || norm(texto);
  const full = norm(texto);
  const cands = productos.filter((p) => { const n = norm(p.nombre); return n && (full.includes(n) || n.includes(t)); });
  return cands.sort((a, b) => b.nombre.length - a.nombre.length)[0];
}

/** Convierte un ítem guardado ("Jogger (M · Gris)") en una fila con producto y opciones elegidas. */
export function filaDesdeItem(it: { qty: number; nombre: string; precio: number }, productos: Product[]): FilaItem {
  const p = productoDeTexto(it.nombre, productos);
  if (!p) return { productId: '', opciones: {}, qty: Math.max(1, it.qty || 1), precio: Math.max(0, it.precio || 0), libre: it.nombre };
  const txt = norm(it.nombre);
  const opciones: Record<string, string> = {};
  for (const g of p.opciones || []) {
    const val = (g.valores || []).map((x) => x.valor).filter((v) => conPalabra(txt, norm(v))).sort((a, b) => b.length - a.length)[0];
    if (val) opciones[g.nombre] = val;
  }
  return { productId: String(p.id), opciones, qty: Math.max(1, it.qty || 1), precio: it.precio > 0 ? it.precio : p.precio };
}

/** Nombre con el que se guarda el ítem: "Producto (Valor · Valor)". */
export function nombreFila(f: FilaItem, productos: Product[]): string {
  const p = productos.find((x) => String(x.id) === f.productId);
  if (!p) return (f.libre || '').trim();
  const vals = (p.opciones || []).map((g) => f.opciones[g.nombre]).filter(Boolean);
  return vals.length ? `${p.nombre} (${vals.join(' · ')})` : p.nombre;
}

/** '' si todo está bien; si no, el mensaje de lo que falta. */
export function validarFilas(filas: FilaItem[], productos: Product[]): string {
  const usadas = filas.filter((f) => f.productId || (f.libre || '').trim());
  if (!usadas.length) return 'Elige al menos un producto.';
  for (const f of usadas) {
    if (!f.productId) continue; // ítem libre que el dueño decidió conservar
    const p = productos.find((x) => String(x.id) === f.productId);
    const faltan = (p?.opciones || []).filter((g) => (g.valores?.length || 0) > 0 && !f.opciones[g.nombre]);
    if (faltan.length) return `Elige ${faltan.map((g) => g.nombre.toLowerCase()).join(', ')} de "${p?.nombre}".`;
  }
  return '';
}

/** Ítems listos para guardar. */
export function itemsDeFilas(filas: FilaItem[], productos: Product[]): { qty: number; nombre: string; precio: number }[] {
  return filas
    .map((f) => ({ qty: Math.max(1, f.qty), nombre: nombreFila(f, productos), precio: Math.max(0, f.precio) }))
    .filter((it) => it.nombre);
}

export function totalFilas(filas: FilaItem[]): number {
  return filas.reduce((a, f) => a + (f.productId || f.libre ? Math.max(1, f.qty) * Math.max(0, f.precio) : 0), 0);
}

export function ItemsPedido({ productos, filas, setFilas }: { productos: Product[]; filas: FilaItem[]; setFilas: (fn: (fs: FilaItem[]) => FilaItem[]) => void }) {
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5, display: 'block' };
  const opcionesProducto = [{ value: '', label: 'Selecciona un producto…' }, ...productos.map((p) => ({ value: String(p.id), label: `${p.nombre} · ${fmt(p.precio)}` }))];
  const setFila = (i: number, patch: Partial<FilaItem>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const elegirProducto = (i: number, pid: string) => {
    const p = productos.find((x) => String(x.id) === pid);
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, productId: pid, opciones: {}, precio: p ? (f.libre && f.precio > 0 ? f.precio : p.precio) : 0, libre: undefined } : f)));
  };
  const quitar = (i: number) => setFilas((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs));
  const agregar = () => setFilas((fs) => [...fs, filaVacia()]);

  return (
    <>
      {filas.map((f, i) => {
        const p = productos.find((x) => String(x.id) === f.productId);
        return (
          <div key={i} style={{ border: '1px solid ' + (f.libre && !f.productId ? 'var(--df-warning-border)' : 'var(--df-border)'), borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--df-bg)' }}>
            {f.libre && !f.productId && (
              <div style={{ fontSize: 12, color: 'var(--df-warning)', lineHeight: 1.45 }}>
                No encontramos <b>“{f.libre}”</b> en tu catálogo. Elige el producto para que case al despachar; si no, se guarda tal cual.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Dropdown ariaLabel="Producto" value={f.productId} onChange={(v) => elegirProducto(i, v)} options={opcionesProducto} placeholder="Selecciona un producto…" />
              </div>
              {filas.length > 1 && (
                <button onClick={() => quitar(i)} title="Quitar" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-danger-border)', color: 'var(--df-danger)', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
              )}
            </div>
            {p && (p.opciones || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {(p.opciones || []).map((g) => (
                  <div key={g.nombre}>
                    <label style={lbl}>{g.nombre}</label>
                    <Dropdown
                      ariaLabel={g.nombre}
                      value={f.opciones[g.nombre] || ''}
                      onChange={(v) => setFila(i, { opciones: { ...f.opciones, [g.nombre]: v } })}
                      options={[{ value: '', label: `Elige ${g.nombre.toLowerCase()}…` }, ...(g.valores || []).map((val) => ({ value: val.valor, label: val.valor }))]}
                    />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ width: 90 }}><label style={lbl}>Cantidad</label><input type="number" min={1} value={f.qty} onChange={(e) => setFila(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={inp} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Precio unitario</label><input type="number" min={0} value={f.precio} onChange={(e) => setFila(i, { precio: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={inp} /></div>
              <div style={{ textAlign: 'right', paddingBottom: 10, minWidth: 90 }}>
                <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>Subtotal</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(Math.max(1, f.qty) * Math.max(0, f.precio))}</div>
              </div>
            </div>
          </div>
        );
      })}
      <button onClick={agregar} style={{ alignSelf: 'flex-start', background: 'var(--df-surface)', border: '1px dashed var(--df-border-strong)', color: 'var(--df-text-secondary)', borderRadius: 10, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Agregar otro producto</button>
    </>
  );
}
