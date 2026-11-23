import { useEffect, useRef, useState } from 'react';
import { Icono, IcoTexto } from '../components/Icono';
import { confirmar, notificar } from '../components/dialogs';
import { apiMkBiblioteca, apiMkBibliotecaBorrar, apiMkBibliotecaSubir, type MedioBiblioteca } from '../lib/api';

/**
 * Biblioteca de Marketing IA: todo lo que la tienda generó (fotos IA, videos UGC, modelos,
 * imágenes de campañas) y lo que sube (fotos y videos propios). También sirve para elegir
 * archivos para una campaña (modo «elegir»).
 */

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };
const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnGris: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 };

const FILTROS = [
  { id: 'todo', t: 'Todo' },
  { id: 'imagen', t: 'Fotos' },
  { id: 'video', t: 'Videos' },
  { id: 'subido', t: 'Subidos por ti' },
  { id: 'modelo', t: 'Modelos' },
] as const;
type Filtro = typeof FILTROS[number]['id'];
const ORIGEN: Record<MedioBiblioteca['origen'], string> = { fotos: 'Fotos IA', ugc: 'Video UGC', subido: 'Subido por ti', modelo: 'Modelo', campana: 'Campaña', video: 'Video IA' };
const fecha = (f: string) => { const d = new Date(f.replace(' ', 'T') + (f.includes('Z') || f.includes('+') ? '' : 'Z')); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }); };

export function BibliotecaMarketing({ onElegir, soloElegir = false }: { onElegir?: (m: MedioBiblioteca) => void; soloElegir?: boolean }) {
  const [medios, setMedios] = useState<MedioBiblioteca[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [subiendo, setSubiendo] = useState<{ nombre: string; pct: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cargar = () => apiMkBiblioteca().then((r) => { if (r.data) setMedios(r.data.medios); else if (r.error) notificar(r.error, 'error'); });
  useEffect(() => { void cargar(); }, []);

  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 10)) {
      setSubiendo({ nombre: f.name, pct: 0 });
      const r = await apiMkBibliotecaSubir(f, (pct) => setSubiendo({ nombre: f.name, pct }));
      if (r.error || !r.data) { notificar(`${f.name}: ${r.error}`, 'error'); continue; }
      setMedios((m) => [r.data!.medio, ...(m || [])]);
    }
    setSubiendo(null);
  };
  const borrar = async (m: MedioBiblioteca) => {
    if (!(await confirmar({ titulo: `¿Borrar «${m.nombre}»?`, mensaje: m.origen === 'subido' ? 'Se borra el archivo de DealFlow. Las campañas ya publicadas en Meta no cambian.' : 'Sale de tu Biblioteca y del Estudio. Los créditos usados no se devuelven.', aceptar: 'Borrar', peligro: true }))) return;
    const r = await apiMkBibliotecaBorrar(m.id);
    if (r.error) { notificar(r.error, 'error'); return; }
    setMedios((l) => (l || []).filter((x) => x.id !== m.id));
  };

  const lista = (medios || []).filter((m) => filtro === 'todo' || (filtro === 'imagen' || filtro === 'video' ? m.tipo === filtro : m.origen === filtro));
  const cuenta = (f: Filtro) => (medios || []).filter((m) => f === 'todo' || (f === 'imagen' || f === 'video' ? m.tipo === f : m.origen === f)).length;

  return (
    <>
      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="df-est-flota" style={{ display: 'inline-flex' }}><Icono nombre="biblioteca" tam={34} degradado /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>{soloElegir ? 'Elige de tu Biblioteca' : 'Tu Biblioteca'}</div>
          <div style={{ fontSize: 13, color: 'var(--df-text-muted)', marginTop: 2, lineHeight: 1.5 }}>
            {soloElegir ? 'Toca «Usar» en la foto o el video que quieras para la campaña.' : 'Tus videos UGC, tus modelos y lo que subes. Descárgalo o úsalo en tus campañas de Meta.'}
          </div>
        </div>
        <button onClick={() => input.current?.click()} disabled={!!subiendo} style={{ ...btn, opacity: subiendo ? 0.7 : 1 }}><Icono nombre="subir" tam={16} color="#fff" />Subir fotos o videos</button>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={(e) => { void subir(e.target.files); e.target.value = ''; }} />
      </div>

      {subiendo && (
        <div style={{ ...card, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Subiendo «{subiendo.nombre}»… {subiendo.pct}%</div>
          <div style={{ height: 6, background: 'var(--df-bg)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.max(4, subiendo.pct)}%`, height: '100%', background: 'var(--df-brand)', transition: 'width .3s' }} /></div>
          {subiendo.pct === 100 && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 6 }}>Procesando el archivo…</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)} style={{ ...btnGris, padding: '7px 12px', fontSize: 12.5, borderRadius: 999, background: filtro === f.id ? 'var(--df-brand-subtle-2)' : 'var(--df-surface)', borderColor: filtro === f.id ? 'var(--df-brand)' : 'var(--df-border)', color: filtro === f.id ? 'var(--df-brand-dark)' : 'var(--df-text-body)' }}>
            {f.t} <span style={{ opacity: 0.6 }}>{medios ? cuenta(f.id) : ''}</span>
          </button>
        ))}
      </div>

      {!medios ? <div className="df-est-cargando" style={{ height: 160, borderRadius: 14 }} /> : lista.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '34px 20px', color: 'var(--df-text-muted)', fontSize: 13.5 }}>
          {medios.length === 0 ? 'Todavía no hay nada. Haz videos en «Video UGC» o sube tus propias fotos y videos.' : 'No hay archivos en este filtro.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {lista.map((m) => (
            <div key={m.id} className="df-est-tarjeta" style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#0B1220' }}>
                {m.tipo === 'video'
                  ? <video src={m.url} poster={m.miniatura || undefined} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></a>}
                <span style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 7px' }}>
                  <IcoTexto n={m.tipo === 'video' ? 'video' : 'imagen'} tam={11} />{ORIGEN[m.origen]}
                </span>
              </div>
              <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={m.nombre}>{m.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{fecha(m.fecha)}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                  {onElegir && <button onClick={() => onElegir(m)} style={{ ...btn, padding: '6px 11px', fontSize: 12 }}>Usar</button>}
                  {!soloElegir && <a href={m.url} download style={btnGris}><Icono nombre="descargar" tam={13} />Descargar</a>}
                  {!soloElegir && m.borrable && <button onClick={() => void borrar(m)} title="Borrar" style={{ ...btnGris, color: 'var(--df-danger-dark)' }}><Icono nombre="eliminar" tam={13} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
