import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icono, IcoTexto } from '../../components/Icono';
import { notificar, confirmar, pedirTexto } from '../../components/dialogs';
import { ESTADO_REFERIDA, fechaCorta } from '../../components/ReferidosTienda';
import { fmt } from '../../lib/format';
import {
  apiReferidosAdmin, apiActivarReferidor, apiEditarReferidor, apiAgregarARed, apiQuitarDeRed, linkReferido,
  type ReferidosAdmin, type ReferidorAdmin,
} from '../../lib/api';

/*
 * Superadmin · Referidos: qué cuentas tienen el programa, cuánto ganan por cada pago de su red,
 * y quién está en la red de quién (se puede meter o sacar a mano).
 */

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px', font: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 9, padding: '8px 12px', font: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrin: CSSProperties = { ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Tienda = ReferidosAdmin['tiendas'][number];

/** Buscador de tiendas: escribe el nombre o correo y elige una. */
function BuscarTienda({ tiendas, excluir, placeholder, alElegir }: { tiendas: Tienda[]; excluir: Set<string>; placeholder: string; alElegir: (t: Tienda) => void }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => {
    const n = norm(q.trim());
    if (n.length < 2) return [];
    return tiendas.filter((t) => !excluir.has(t.id) && (norm(t.nombre).includes(n) || norm(t.correo).includes(n))).slice(0, 8);
  }, [q, tiendas, excluir]);
  return (
    <div style={{ position: 'relative' }}>
      <input style={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', ...card, padding: 4, maxHeight: 280, overflow: 'auto' }}>
          {res.map((t) => (
            <button key={t.id} onClick={() => { alElegir(t); setQ(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', font: 'inherit', color: 'var(--df-text-body)' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{t.correo}</div>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && res.length === 0 && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 5 }}>No hay cuentas con ese nombre o correo.</div>}
    </div>
  );
}

export function Referidos() {
  const [d, setD] = useState<ReferidosAdmin | null>(null);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<Tienda | null>(null);
  const [monto, setMonto] = useState('50000');
  const [abierta, setAbierta] = useState('');

  const cargar = () => void apiReferidosAdmin().then((r) => { if (r.data) { setD(r.data); setError(''); } else setError(r.error || 'No se pudo cargar.'); });
  useEffect(cargar, []);

  const nombreDe = (id: string) => d?.tiendas.find((t) => t.id === id)?.nombre || '';
  const enPrograma = useMemo(() => new Set((d?.cuentas || []).map((c) => c.storeId)), [d]);

  const activar = async () => {
    if (!nueva) return;
    const r = await apiActivarReferidor(nueva.id, Math.round(Number(monto.replace(/\D/g, '')) || 0));
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar(`${nueva.nombre} ya tiene su link de referidos (código ${r.data?.codigo}).`, 'ok');
    setAbierta(nueva.id); setNueva(null); cargar();
  };
  const editar = async (c: ReferidorAdmin, cambios: { monto?: number; activo?: boolean; codigo?: string }, ok: string) => {
    const r = await apiEditarReferidor(c.storeId, cambios);
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar(ok, 'ok'); cargar();
  };
  const cambiarMonto = async (c: ReferidorAdmin) => {
    const v = await pedirTexto({ titulo: `Valor por referido · ${c.nombre}`, mensaje: 'Lo que se le abona por cada activación y cada mensualidad que pague una cuenta de su red. Aplica desde el próximo pago.', valor: String(c.monto), aceptar: 'Guardar' });
    if (v == null) return;
    const n = Math.round(Number(v.replace(/\D/g, '')) || 0);
    void editar(c, { monto: n }, `Ahora ${c.nombre} gana ${fmt(n)} por cada pago de su red.`);
  };
  const cambiarCodigo = async (c: ReferidorAdmin) => {
    const v = await pedirTexto({ titulo: `Código del link · ${c.nombre}`, mensaje: 'Solo letras y números. Ojo: el link anterior deja de funcionar.', valor: c.codigo, aceptar: 'Guardar' });
    if (v == null || v.trim().toUpperCase() === c.codigo) return;
    void editar(c, { codigo: v }, 'Código actualizado.');
  };
  const pausar = async (c: ReferidorAdmin) => {
    if (c.activo && !(await confirmar({ titulo: `Pausar a ${c.nombre}`, mensaje: 'Su link deja de funcionar y los próximos pagos de su red no le abonan nada. Lo que ya ganó se queda en su billetera. Puedes reactivarlo cuando quieras.', aceptar: 'Pausar', peligro: true }))) return;
    void editar(c, { activo: !c.activo }, c.activo ? `${c.nombre} quedó en pausa.` : `${c.nombre} volvió a ganar por sus referidos.`);
  };
  const agregar = async (c: ReferidorAdmin, t: Tienda) => {
    const otra = t.red && t.red !== c.storeId ? nombreDe(t.red) : '';
    if (!(await confirmar({ titulo: `Agregar ${t.nombre} a la red de ${c.nombre}`, mensaje: `${otra ? `Hoy está en la red de ${otra}: pasará a la de ${c.nombre}. ` : ''}Desde su próxima activación o mensualidad, a ${c.nombre} se le abonan ${fmt(c.monto)}. Los pagos que ya hizo no cuentan.`, aceptar: 'Agregar' }))) return;
    const r = await apiAgregarARed(c.storeId, t.id);
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar(`${t.nombre} ya está en la red de ${c.nombre}.`, 'ok'); cargar();
  };
  const quitar = async (c: ReferidorAdmin, id: string, nombre: string) => {
    if (!(await confirmar({ titulo: `Sacar a ${nombre}`, mensaje: `Sale de la red de ${c.nombre}: sus próximos pagos ya no le abonan. Lo ya ganado no se toca.`, aceptar: 'Sacar', peligro: true }))) return;
    const r = await apiQuitarDeRed(id);
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar(`${nombre} salió de la red.`, 'ok'); cargar();
  };
  const copiar = (codigo: string) => { const l = linkReferido(codigo); void navigator.clipboard?.writeText(l).then(() => notificar('Link copiado.', 'ok')).catch(() => notificar(l, 'info', 8000)); };

  return (
    <section data-screen-label="Admin Referidos">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}><IcoTexto n="regalo" tam={22} degradado />Referidos</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px', lineHeight: 1.55 }}>
        Solo las cuentas que agregues aquí tienen link de referidos. Cada vez que una cuenta de su red <b>activa su bot o paga una mensualidad</b> (aunque sea con cupón gratis), se le abona su valor en la billetera y lo puede retirar. Los días que se dan a mano no cuentan. También puedes meter a mano cuentas que ya existen en la red de alguien.
      </p>
      {error && <div style={{ ...card, color: 'var(--df-danger-dark)', marginBottom: 14 }}>{error}</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { t: 'Cuentas con el programa', v: String(d.cuentas.filter((c) => c.activo).length) },
              { t: 'Cuentas referidas', v: String(d.cuentas.reduce((s, c) => s + c.red.length, 0)) },
              { t: 'Abonado (30 días)', v: fmt(d.abonadoMes) },
              { t: 'Abonado en total', v: fmt(d.totalAbonado) },
            ].map((x) => (
              <div key={x.t} style={card}>
                <div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600 }}>{x.t}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{x.v}</div>
              </div>
            ))}
          </div>

          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Darle el programa a una cuenta</div>
            {nueva ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600, marginBottom: 4 }}>Cuenta</div>
                  <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 8 }}><Icono nombre="tienda" tam={15} /><b>{nueva.nombre}</b><span style={{ color: 'var(--df-text-muted)', fontSize: 12 }}>{nueva.correo}</span></div>
                </div>
                <div style={{ flex: '0 1 170px' }}>
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600, marginBottom: 4 }}>Gana por cada pago</div>
                  <input style={inp} inputMode="numeric" value={monto ? Number(monto.replace(/\D/g, '') || 0).toLocaleString('es-CO') : ''} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button style={btnPrin} onClick={() => void activar()}><Icono nombre="listo" tam={15} color="#fff" />Activar</button>
                <button style={btn} onClick={() => setNueva(null)}>Cancelar</button>
              </div>
            ) : (
              <BuscarTienda tiendas={d.tiendas} excluir={enPrograma} placeholder="Busca la cuenta por nombre o correo…" alElegir={(t) => { setNueva(t); setMonto(String(d.montoPorDefecto)); }} />
            )}
          </div>

          {d.cuentas.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14, padding: '26px 16px' }}>Todavía ninguna cuenta tiene el programa de referidos.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {d.cuentas.map((c) => {
              const abierto = abierta === c.storeId;
              return (
                <div key={c.storeId} style={{ ...card, opacity: c.activo ? 1 : 0.75 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => setAbierta(abierto ? '' : c.storeId)} style={{ flex: '1 1 220px', minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{c.nombre}</span>
                        {!c.activo && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,.18)', color: 'var(--df-text-muted)' }}>En pausa</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{c.correo} · gana {fmt(c.monto)} por pago · {c.red.length} en su red</div>
                    </button>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Ganado</div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{fmt(c.ganado)}</div>
                    </div>
                    <button style={btn} onClick={() => setAbierta(abierto ? '' : c.storeId)}>{abierto ? 'Cerrar' : 'Ver red'}</button>
                  </div>

                  {abierto && (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--df-border)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ flex: '1 1 240px', minWidth: 0, border: '1px dashed var(--df-border)', borderRadius: 9, padding: '8px 11px', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkReferido(c.codigo)}</div>
                        <button style={btn} onClick={() => copiar(c.codigo)}><Icono nombre="copiar" tam={14} />Copiar</button>
                        <button style={btn} onClick={() => void cambiarCodigo(c)}><Icono nombre="editar" tam={14} />Código</button>
                        <button style={btn} onClick={() => void cambiarMonto(c)}><Icono nombre="dinero" tam={14} />Valor</button>
                        <button style={btn} onClick={() => void pausar(c)}><Icono nombre={c.activo ? 'pausa' : 'listo'} tam={14} />{c.activo ? 'Pausar' : 'Reactivar'}</button>
                      </div>

                      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Agregar una cuenta a su red</div>
                      <div style={{ marginBottom: 14 }}>
                        <BuscarTienda tiendas={d.tiendas} excluir={new Set([c.storeId, ...c.red.map((x) => x.id)])} placeholder="Busca la cuenta por nombre o correo…" alElegir={(t) => void agregar(c, t)} />
                      </div>

                      {c.red.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Su red está vacía: nadie se ha registrado con su link todavía.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {c.red.map((x) => {
                            const e = ESTADO_REFERIDA[x.estado];
                            return (
                              <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--df-border)', borderRadius: 10, fontSize: 13, flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                                  <div style={{ fontWeight: 700 }}>{x.nombre}</div>
                                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{x.correo} · {x.origen === 'manual' ? 'agregada a mano' : 'llegó por el link'} el {fechaCorta(x.desde)}</div>
                                </div>
                                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: e.color, background: `${e.color}22` }}>{e.texto}{x.estado !== 'sin_activar' && x.vence ? ` · vence ${x.vence}` : ''}</span>
                                <div style={{ minWidth: 110, textAlign: 'right' }}><b>{fmt(x.ganado)}</b><div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{x.pagos} pago{x.pagos === 1 ? '' : 's'}</div></div>
                                <button style={{ ...btn, padding: '6px 9px' }} title="Sacar de la red" onClick={() => void quitar(c, x.id, x.nombre)}><Icono nombre="cerrar" tam={14} /></button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
