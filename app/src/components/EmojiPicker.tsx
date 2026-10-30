import { useEffect, useRef, useState } from 'react';

const GRUPOS: { nombre: string; icono: string; emojis: string }[] = [
  { nombre: 'Caritas', icono: '😀', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤩 🥳 😏 😌 😴 🤗 🤭 🤫 🤔 😐 😶 🙄 😬 😮 😯 😲 🥺 😢 😭 😤 😡 🤯 😳 😱 🤒 🤧 😷 🤑 🤠' },
  { nombre: 'Gestos', icono: '👍', emojis: '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤙 👋 🙌 👏 🙏 🤝 💪 👆 👇 👉 👈 ☝️ ✋ 🤚 🖐️ 👊 ✊ 🫶 💅 👀 🧠 🙋‍♀️ 🙋‍♂️ 🤷‍♀️ 🤷‍♂️ 💁‍♀️ 🙆‍♀️ 🙅‍♀️' },
  { nombre: 'Corazones', icono: '❤️', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 ❣️ 💔 ❤️‍🔥 💯 ✨ ⭐ 🌟 💫 🔥 🎉 🎊 🥂 🎁 🎈' },
  { nombre: 'Compras', icono: '🛍️', emojis: '🛍️ 🛒 💳 💵 💰 🤑 🏷️ 📦 🚚 🛵 🏍️ ✈️ 📍 🗺️ 🏠 🏪 ⏰ 📅 📞 📱 💬 📸 🎥 🧾 ✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ 🔔 📣 🆕 🆓 🔝 💎 👑' },
  { nombre: 'Moda', icono: '👗', emojis: '👗 👚 👕 👖 🩳 👔 🧥 🥼 👙 🩱 🩲 👘 🥻 👠 👡 👢 👟 👞 🥿 🩴 👜 👛 👝 🎒 👒 🎩 🧢 👓 🕶️ 💍 📿 💄 💋 🧴 🧼 🪮' },
  { nombre: 'Naturaleza', icono: '🌸', emojis: '🌸 🌺 🌻 🌼 🌷 🌹 💐 🌿 🍀 🌴 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ 🌊 🐶 🐱 🦋 🐝 🍓 🍒 🍑 🍍 🥑 ☕ 🍰 🎂 🍫' },
];

const CLAVE = 'df-emojis-recientes';
const leerRecientes = (): string[] => { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch { return []; } };

/** Botón 😊 con un panel de emojis (sin librerías). */
export function EmojiPicker({ onEmoji, size = 40 }: { onEmoji: (e: string) => void; size?: number }) {
  const [abierto, setAbierto] = useState(false);
  const [grupo, setGrupo] = useState(0);
  const [recientes, setRecientes] = useState<string[]>(leerRecientes);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [abierto]);
  const elegir = (e: string) => {
    onEmoji(e);
    const r = [e, ...recientes.filter((x) => x !== e)].slice(0, 16);
    setRecientes(r);
    try { localStorage.setItem(CLAVE, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
  };
  const lista = grupo === -1 ? recientes : GRUPOS[grupo].emojis.split(' ');
  const pest = (activo: boolean): React.CSSProperties => ({ background: activo ? 'var(--df-surface-2)' : 'transparent', border: 'none', borderRadius: 7, padding: '4px 6px', fontSize: 17, cursor: 'pointer', lineHeight: 1 });
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setAbierto((a) => !a)} title="Emojis" aria-label="Emojis"
        style={{ width: size, height: size, borderRadius: 10, border: '1px solid var(--df-border)', background: abierto ? 'var(--df-surface-2)' : 'var(--df-surface)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>😊</button>
      {abierto && (
        <div style={{ position: 'absolute', bottom: size + 8, left: 0, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 10px 34px rgba(15,23,42,.28)', zIndex: 60, padding: 8 }}>
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--df-border)', paddingBottom: 6, marginBottom: 6, overflowX: 'auto' }}>
            {recientes.length > 0 && <button type="button" onClick={() => setGrupo(-1)} title="Recientes" style={pest(grupo === -1)}>🕘</button>}
            {GRUPOS.map((g, i) => <button type="button" key={g.nombre} onClick={() => setGrupo(i)} title={g.nombre} style={pest(grupo === i)}>{g.icono}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
            {lista.map((e) => (
              <button type="button" key={e} onClick={() => elegir(e)} style={{ background: 'none', border: 'none', borderRadius: 6, fontSize: 21, padding: 3, cursor: 'pointer', lineHeight: 1.1 }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--df-surface-2)')} onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}>{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
