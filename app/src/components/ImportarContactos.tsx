import { useMemo, useState } from 'react';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';
import { apiBorrarEtiqueta, apiImportarContactos, type ResultadoImportacion } from '../lib/api';

/**
 * Importar contactos desde un CSV (por ejemplo, el exporte de otro bot) y dejarlos con una
 * etiqueta para usarlos en campañas de remarketing. Los importados no llenan el Inbox: su chat
 * se crea cuando se les envía la campaña o cuando escriben.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 };

/** CSV a filas: separador «,» o «;» (Excel en español), comillas, saltos de línea dentro de comillas y BOM. */
export function leerCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : primera.includes('\t') && !primera.includes(',') ? '\t' : ',';
  const filas: string[][] = [];
  let fila: string[] = []; let campo = ''; let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo.trim()); campo = '';
      if (fila.some((c) => c)) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo.trim());
  if (fila.some((c) => c)) filas.push(fila);
  return filas;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pareceTel = (s: string) => /^\+?[\d\s().-]{10,16}$/.test(s.trim());
/** Adivina las columnas de nombre, celular y etiquetas por el encabezado (o por el contenido). */
function adivinar(cab: string[], ejemplo: string[]): { nombre: number; tel: number; etiquetas: number } {
  const i = (re: RegExp) => cab.findIndex((c) => re.test(norm(c)));
  let tel = i(/(tel|cel|phone|whats|movil|numero|wa_id|contacto)/);
  if (tel < 0) tel = ejemplo.findIndex(pareceTel);
  let nombre = i(/^(nombre|name|full.?name|cliente|first.?name|nombres)/);
  if (nombre < 0) nombre = i(/(nombre|name)/);
  return { nombre, tel, etiquetas: i(/(etiqueta|tag|label)/) };
}

export function ImportarContactos({ etiquetas, onCambio }: { etiquetas: { etiqueta: string; n: number }[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<string[][]>([]);
  const [conCabecera, setConCabecera] = useState(true);
  const [cols, setCols] = useState({ nombre: -1, tel: -1, etiquetas: -1 });
  const [etiqueta, setEtiqueta] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [res, setRes] = useState<ResultadoImportacion | null>(null);

  const cab = conCabecera ? filas[0] || [] : (filas[0] || []).map((_, k) => `Columna ${k + 1}`);
  const datos = useMemo(() => (conCabecera ? filas.slice(1) : filas), [filas, conCabecera]);
  const opciones = [{ value: '-1', label: '— Ninguna —' }, ...cab.map((c, k) => ({ value: String(k), label: c || `Columna ${k + 1}` }))];

  const cargarArchivo = (f: File | undefined) => {
    if (!f) return;
    setRes(null);
    const r = new FileReader();
    r.onload = () => {
      const fs = leerCSV(String(r.result || ''));
      if (fs.length < 1) { notificar('El archivo está vacío o no es un CSV.', 'error'); return; }
      const tieneCab = !fs[0].some(pareceTel);
      setFilas(fs); setConCabecera(tieneCab); setArchivo(f.name);
      setCols(adivinar(tieneCab ? fs[0] : [], (tieneCab ? fs[1] : fs[0]) || []));
      if (!etiqueta) setEtiqueta(f.name.replace(/\.[^.]+$/, '').slice(0, 40));
    };
    r.readAsText(f);
  };

  const importar = async () => {
    if (cols.tel < 0) return notificar('Elige la columna del celular.', 'error');
    const lista = datos.map((f) => ({ nombre: cols.nombre >= 0 ? f[cols.nombre] || '' : '', telefono: f[cols.tel] || '', etiquetas: cols.etiquetas >= 0 ? f[cols.etiquetas] || '' : '' }));
    setSubiendo(true);
    const r = await apiImportarContactos({ filas: lista, etiqueta, origen: archivo, consentimiento });
    setSubiendo(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo importar.', 'error', 7000);
    setRes(r.data); setFilas([]); setArchivo('');
    onCambio();
  };
  const borrar = async (e: string, n: number) => {
    if (!(await confirmar({ titulo: `¿Quitar la etiqueta "${e}"?`, mensaje: `Se le quita a ${n} contacto(s). Los importados que solo tenían esta etiqueta y nunca escribieron se borran de la lista. Los chats no se borran.`, aceptar: 'Quitar' }))) return;
    await apiBorrarEtiqueta(e); onCambio();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>📇 Contactos y etiquetas</div>
        <button onClick={() => setAbierto(!abierto)} style={btnS}>{abierto ? 'Cerrar' : '⬆️ Importar CSV'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 10px', lineHeight: 1.5 }}>
        Trae los contactos de otro bot (su exporte en CSV) con una etiqueta y úsalos en tus campañas. No aparecen en el Inbox hasta que les envíes una campaña o te escriban.
      </p>
      {etiquetas.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {etiquetas.map((e) => (
            <span key={e.etiqueta} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '4px 6px 4px 10px', fontSize: 12.5 }}>
              🏷️ <b>{e.etiqueta}</b> <span style={{ color: 'var(--df-text-muted)' }}>{e.n.toLocaleString('es-CO')}</span>
              <button onClick={() => void borrar(e.etiqueta, e.n)} aria-label={`Quitar etiqueta ${e.etiqueta}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 13, padding: '0 4px' }}>✕</button>
            </span>
          ))}
        </div>
      ) : <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Todavía no tienes etiquetas.</div>}

      {res && (
        <div style={{ marginTop: 10, fontSize: 12.5, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.35)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
          ✓ Etiqueta <b>{res.etiqueta}</b>: {res.creados} contactos nuevos{res.yaEran ? `, ${res.yaEran} ya estaban (se les puso la etiqueta)` : ''}{res.repetidos ? `, ${res.repetidos} repetidos en el archivo` : ''}.
          {res.invalidos > 0 && <div style={{ color: '#B45309' }}>{res.invalidos} sin celular colombiano válido (no se importaron){res.ejemplosInvalidos.length ? `: ${res.ejemplosInvalidos.join(', ')}` : ''}.</div>}
        </div>
      )}

      {abierto && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--df-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={lbl}>Archivo CSV</label>
            <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => cargarArchivo(e.target.files?.[0])} />
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 4 }}>Si lo tienes en Excel: Archivo → Guardar como → CSV. Necesita al menos la columna del celular.</div>
          </div>
          {filas.length > 0 && (
            <>
              <label style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={conCabecera} onChange={(e) => setConCabecera(e.target.checked)} /> La primera fila son los títulos de las columnas</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                <div><label style={lbl}>Celular *</label><Dropdown value={String(cols.tel)} onChange={(v) => setCols({ ...cols, tel: Number(v) })} options={opciones} ariaLabel="Columna del celular" /></div>
                <div><label style={lbl}>Nombre</label><Dropdown value={String(cols.nombre)} onChange={(v) => setCols({ ...cols, nombre: Number(v) })} options={opciones} ariaLabel="Columna del nombre" /></div>
                <div><label style={lbl}>Etiquetas del archivo (opcional)</label><Dropdown value={String(cols.etiquetas)} onChange={(v) => setCols({ ...cols, etiquetas: Number(v) })} options={opciones} ariaLabel="Columna de etiquetas" /></div>
              </div>
              <div style={{ border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'auto', maxHeight: 180 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{['Nombre', 'Celular', 'Etiquetas'].map((t) => <th key={t} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--df-border)', color: 'var(--df-text-muted)' }}>{t}</th>)}</tr></thead>
                  <tbody>{datos.slice(0, 6).map((f, k) => (
                    <tr key={k}>{[cols.nombre, cols.tel, cols.etiquetas].map((c, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid var(--df-border)' }}>{c >= 0 ? f[c] || '' : '—'}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{datos.length.toLocaleString('es-CO')} fila(s) en el archivo.</div>
              <div><label style={lbl}>Etiqueta para todos estos contactos *</label><input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value.slice(0, 40))} placeholder='Ej. "Bot anterior - octubre"' style={inp} /></div>
              <label style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'flex-start', lineHeight: 1.45 }}>
                <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Confirmo que estos contactos son clientes de mi tienda y aceptaron recibir mensajes de ella por WhatsApp. <span style={{ color: 'var(--df-text-muted)' }}>Meta lo exige; escribirle a quien no te conoce trae bloqueos.</span></span>
              </label>
              <button onClick={() => void importar()} disabled={subiendo || !consentimiento || !etiqueta.trim() || cols.tel < 0} style={{ ...btn, alignSelf: 'flex-start', opacity: subiendo || !consentimiento || !etiqueta.trim() || cols.tel < 0 ? 0.5 : 1 }}>
                {subiendo ? 'Importando…' : `Importar ${datos.length.toLocaleString('es-CO')} contacto(s)`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
