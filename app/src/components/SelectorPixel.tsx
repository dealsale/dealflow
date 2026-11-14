import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiCrearPixelMeta, apiPixelesMeta, type ListaPixeles } from '../lib/api';
import { notificar, pedirTexto } from './dialogs';

/**
 * Campo «ID del píxel de Meta». Con la cuenta de Anuncios conectada muestra los píxeles de la
 * cuenta para elegir (o crear uno nuevo) sin copiar números; sin ella, es el campo de siempre.
 */
let cache: Promise<ListaPixeles | null> | null = null;
const cargarLista = (forzar = false) => {
  if (!cache || forzar) cache = apiPixelesMeta().then((r) => r.data || null);
  return cache;
};

const inpBase: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-strong, var(--df-text))' };
const btn: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-strong, var(--df-text))', whiteSpace: 'nowrap' };

export function SelectorPixel({ valor, onChange, vacio, estilo }: { valor: string; onChange: (id: string) => void; vacio?: string; estilo?: CSSProperties }) {
  const [lista, setLista] = useState<ListaPixeles | null>(null);
  const [manual, setManual] = useState(false);
  const [creando, setCreando] = useState(false);
  useEffect(() => { let vivo = true; void cargarLista().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);
  // Si el píxel elegido no está en la lista (p. ej. se acaba de crear en otra pantalla), se refresca una vez.
  const [refrescada, setRefrescada] = useState(false);
  useEffect(() => {
    if (!lista?.conectada || refrescada || !valor || lista.pixeles.some((p) => p.id === valor)) return;
    setRefrescada(true);
    void cargarLista(true).then((l) => { if (l) setLista(l); });
  }, [lista, valor, refrescada]);
  const inp = { ...inpBase, ...estilo };
  const pixeles = lista?.pixeles || [];
  const enLista = !valor || pixeles.some((p) => p.id === valor);

  // Sin Anuncios conectado (o Meta no respondió): el campo de siempre.
  if (!lista?.conectada || lista.error) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <input value={valor} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ej: 1234567890123456" style={inp} aria-label="ID del píxel de Meta" />
        {lista && !lista.conectada && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Conecta tu cuenta de Anuncios (Integraciones → Meta Ads) para elegir o crear el píxel aquí mismo.</span>}
      </div>
    );
  }

  const crear = async () => {
    const nombre = await pedirTexto({ titulo: 'Crear píxel de Meta', mensaje: 'Se crea en tu cuenta publicitaria. Usa un nombre que reconozcas, por ejemplo el de tu tienda.', placeholder: 'Mi tienda · DealFlow', aceptar: 'Crear' });
    if (!nombre?.trim()) return;
    setCreando(true);
    const r = await apiCrearPixelMeta(nombre.trim());
    setCreando(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo crear el píxel.', 'error', 7000);
    setLista({ conectada: true, pixeles: r.data.pixeles });
    void cargarLista(true);
    setManual(false);
    onChange(r.data.id);
    const base = r.data.existente ? 'Meta solo permite un píxel en esta cuenta: elegimos el que ya tienes.' : '✓ Píxel creado y elegido.';
    notificar(`${base} ${r.data.conectado ? 'Ya quedó conectado y Meta recibió un evento de prueba.' : r.data.conexion || ''} Guarda los cambios para que tu tienda lo use.`, r.data.conectado ? 'ok' : 'error', 9000);
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {manual || !enLista ? (
          <input value={valor} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ID del píxel (solo números)" style={{ ...inp, flex: 1, minWidth: 0 }} aria-label="ID del píxel de Meta" />
        ) : (
          <select value={valor} onChange={(e) => { if (e.target.value === '__otro') { setManual(true); return; } onChange(e.target.value); }} style={{ ...inp, flex: 1, minWidth: 0 }} aria-label="Píxel de Meta">
            <option value="">{vacio || 'Elige un píxel…'}</option>
            {pixeles.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.id}{p.conectado ? ' · ✓ conectado' : ''}{!p.ultimoEvento ? ' · sin eventos aún' : ''}</option>)}
            <option value="__otro">Otro (escribir el ID)…</option>
          </select>
        )}
        <button type="button" onClick={() => void crear()} disabled={creando} title="Crear un píxel nuevo en tu cuenta publicitaria" aria-label="Crear píxel nuevo" style={btn}>{creando ? 'Creando…' : '+ Nuevo'}</button>
      </div>
      {(manual || !enLista) && <button type="button" onClick={() => { setManual(false); if (!enLista) onChange(''); }} style={{ ...btn, justifySelf: 'start', padding: '3px 8px', fontSize: 11.5 }}>Elegir de mis píxeles</button>}
    </div>
  );
}
