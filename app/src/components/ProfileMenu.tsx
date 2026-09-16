import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

/** Avatar redondo: la foto de perfil si hay, si no las iniciales. */
function Avatar({ foto, iniciales, size }: { foto: string; iniciales: string; size: number }) {
  return foto ? (
    <img src={foto} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--df-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
      {iniciales}
    </div>
  );
}

/** Botones de dos opciones (usados para elegir el tema). */
function Pills<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; icon?: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: value === o.v ? 'var(--df-text)' : 'var(--df-surface)',
            color: value === o.v ? 'var(--df-surface)' : 'var(--df-text-secondary)',
            border: 'none', padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
          }}
        >
          {o.icon && <span>{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Formulario para cambiar la contraseña (solo cuentas de tienda). */
function PasswordForm({ df }: { df: DealFlowState }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [localMsg, setLocalMsg] = useState('');

  const enviar = async () => {
    setLocalMsg('');
    if (nueva !== confirmar) { setLocalMsg('Las contraseñas nuevas no coinciden.'); return; }
    const ok = await df.cambiarPasswordPerfil(actual, nueva);
    if (ok) { setActual(''); setNueva(''); setConfirmar(''); }
  };

  const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
      <input type="password" placeholder="Contraseña actual" value={actual} onChange={(e) => setActual(e.target.value)} style={fieldStyle} />
      <input type="password" placeholder="Nueva contraseña" value={nueva} onChange={(e) => setNueva(e.target.value)} style={fieldStyle} />
      <input
        type="password"
        placeholder="Confirmar nueva contraseña"
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); }}
        style={fieldStyle}
      />
      <button
        onClick={() => void enviar()}
        disabled={df.passBusy || !actual || nueva.length < 6}
        style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: df.passBusy ? 0.7 : 1 }}
      >
        {df.passBusy ? 'Guardando…' : 'Actualizar contraseña'}
      </button>
      {(localMsg || df.passMsg) && (
        <div style={{ fontSize: 12, color: (df.passMsg || '').startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)' }}>{localMsg || df.passMsg}</div>
      )}
    </div>
  );
}

/**
 * Menú de la cuenta: se abre desde el avatar. Trae editar perfil (nombre y
 * foto), cambiar contraseña, elegir el tema (Claro / Dark System) y cerrar sesión.
 *
 * `onDarkBar`: para cuando el botón vive sobre una barra SIEMPRE oscura (el
 * header móvil, que no cambia con el tema); ahí el gatillo usa colores claros
 * fijos en vez de los del tema, para que se vea bien sobre ese fondo. El panel
 * desplegable siempre usa los colores del tema (es una tarjeta flotante normal).
 */
export function ProfileMenu({ df, onDarkBar }: { df: DealFlowState; onDarkBar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState(df.sessionUser?.nombre || '');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const cerrar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [open]);

  useEffect(() => {
    if (open) { setNombreDraft(df.sessionUser?.nombre || ''); setEditandoNombre(false); setMostrarPassword(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const guardarNombre = () => {
    const v = nombreDraft.trim();
    setEditandoNombre(false);
    if (v && v !== df.sessionUser?.nombre) void df.actualizarNombrePerfil(v);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '4px 6px', borderRadius: 10 }} className={onDarkBar ? undefined : 'df-row-hover'}>
        <Avatar foto={df.userFoto} iniciales={df.userInitials} size={32} />
        {!onDarkBar && (
          <div style={{ lineHeight: 1.25, display: window.innerWidth < 720 ? 'none' : 'block' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--df-text)' }}>{df.userLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{df.userRoleLabel}</div>
          </div>
        )}
        <span style={{ fontSize: 10, color: onDarkBar ? 'rgba(255,255,255,.6)' : 'var(--df-text-faint)' }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 296, zIndex: 61,
            background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14,
            boxShadow: '0 24px 60px -18px rgba(0,0,0,.35)', overflow: 'hidden',
          }}
        >
          {/* Encabezado: avatar (clic para cambiar foto) + nombre editable + correo */}
          <div style={{ padding: '16px 16px 14px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--df-border)' }}>
            <div
              onClick={() => fileRef.current?.click()}
              title="Cambiar foto de perfil"
              style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            >
              <Avatar foto={df.userFoto} iniciales={df.userInitials} size={52} />
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: 'var(--df-text)', color: 'var(--df-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, border: '2px solid var(--df-surface)' }}>
                📷
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void df.subirFotoPerfil(f);
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              {editandoNombre ? (
                <input
                  autoFocus
                  value={nombreDraft}
                  onChange={(ev) => setNombreDraft(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') guardarNombre(); if (ev.key === 'Escape') setEditandoNombre(false); }}
                  onBlur={guardarNombre}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 7, padding: '5px 7px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: 'var(--df-surface)', color: 'var(--df-text)' }}
                />
              ) : (
                <div onClick={() => setEditandoNombre(true)} title="Editar nombre" style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--df-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{df.sessionUser?.nombre || df.userLabel}</span>
                  <span style={{ fontSize: 11, color: 'var(--df-text-faint)', flexShrink: 0 }}>✎</span>
                </div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{df.sessionUser?.email}</div>
            </div>
          </div>

          {df.perfilMsg && (
            <div style={{ padding: '8px 16px 0', fontSize: 12, color: df.perfilMsg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger)' }}>{df.perfilMsg}</div>
          )}

          {/* Tema */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--df-border)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>Tema</div>
            <Pills
              value={df.theme}
              onChange={df.setTheme}
              options={[
                { v: 'light', label: 'Claro', icon: '☀️' },
                { v: 'dark', label: 'Dark System', icon: '🌙' },
              ]}
            />
          </div>

          {/* Cambiar contraseña */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--df-border)' }}>
            <div
              onClick={() => setMostrarPassword((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--df-text)' }}
            >
              <span>🔒</span>
              <span style={{ flex: 1 }}>Cambiar contraseña</span>
              <span style={{ fontSize: 10, color: 'var(--df-text-faint)', transform: mostrarPassword ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
            </div>
            {mostrarPassword && (
              df.isVendedor ? (
                <PasswordForm df={df} />
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>
                  Esta cuenta usa una contraseña fija por variable de entorno. Pide al equipo técnico cambiarla ahí.
                </div>
              )
            )}
          </div>

          <div
            onClick={() => { setOpen(false); df.logout(); }}
            className="df-danger-hover"
            style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: 'var(--df-danger)', cursor: 'pointer' }}
          >
            Cerrar sesión
          </div>
        </div>
      )}
    </div>
  );
}
