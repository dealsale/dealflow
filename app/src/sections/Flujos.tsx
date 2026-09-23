import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { BloquesBuilder } from '../components/BloquesBuilder';

const card: React.CSSProperties = {
  background: 'var(--df-surface)',
  border: '1px solid var(--df-border)',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,.04)',
};

/**
 * Constructor de flujos de remarketing: la tienda arma "flujos" (secuencias de
 * texto/imagen/video/audio, como el mensaje inicial) con ofertas para reenganchar
 * clientes. Se envían a un chat desde el Inbox (botón Flujos).
 */
export function Flujos({ df }: { df: DealFlowState }) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const flujos = df.flujos;

  const crear = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    const id = await df.crearFlujo(nombre);
    setNuevoNombre('');
    if (id) setAbierto(id);
  };

  const inp: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', color: 'var(--df-text-body)' };

  return (
    <section data-screen-label="Flujos">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Flujos de remarketing 🔁</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px' }}>Arma flujos con texto, imágenes, audio y video (ofertas, recordatorios, novedades) y envíalos a tus clientes desde el Inbox para reengancharlos.</p>

      {/* Crear un flujo nuevo */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }}
          placeholder="Nombre del flujo · ej: Oferta relámpago fin de semana"
          style={{ ...inp, flex: 1, minWidth: 240 }}
        />
        <button onClick={() => void crear()} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Crear flujo</button>
        {df.flujoMsgRemk && !df.flujoMsgRemk.startsWith('✓') && !df.flujoMsgRemk.includes('Enviando') && (
          <div style={{ width: '100%', color: 'var(--df-danger-dark)', fontSize: 12.5, marginTop: 2 }}>{df.flujoMsgRemk}</div>
        )}
      </div>

      {flujos.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', padding: '40px 24px', fontSize: 14 }}>
          Aún no tienes flujos. Crea el primero arriba (por ejemplo, una oferta de fin de semana) y agrégale bloques de texto, imagen, audio o video.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {flujos.map((f) => {
            const open = abierto === f.id;
            const piezas = f.bloques?.length || 0;
            return (
              <div key={f.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setAbierto(open ? null : f.id)}>
                  <span style={{ fontSize: 18 }}>🔁</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</div>
                    <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>{piezas} bloque{piezas === 1 ? '' : 's'}{f.descripcion ? ` · ${f.descripcion}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--df-text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </div>

                {open && (
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--df-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 }}>Nombre</div>
                        <input value={f.nombre} onChange={(e) => f.setNombre(e.target.value)} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 }}>Descripción (para ti)</div>
                        <input value={f.descripcion} onChange={(e) => f.setDescripcion(e.target.value)} placeholder="¿Para qué sirve este flujo?" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 8 }}>Contenido del flujo</div>
                      <BloquesBuilder
                        bloques={f.bloquesDecorados}
                        moverBloque={f.moverBloque}
                        textoDraft={df.flujoTextoDraft}
                        setTextoDraft={df.setFlujoTextoDraft}
                        onAddTexto={f.addBloqueTexto}
                        onAddImagen={f.addBloqueImagen}
                        onAddVideo={f.addBloqueVideo}
                        onAddAudio={f.addBloqueAudio}
                        placeholderTexto="Escribe un bloque de texto · ej: 🔥 Solo por hoy: 3 x $99.900 con envío gratis…"
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Se envía desde el Inbox → botón Flujos, dentro de cada chat.</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => { if (confirm(`¿Eliminar el flujo "${f.nombre}"?`)) { f.remove(); setAbierto(null); } }}
                        style={{ background: 'var(--df-surface)', color: 'var(--df-danger)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                        Eliminar flujo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
