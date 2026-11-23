import React, { useState } from 'react';
import { Popover, Anchor } from './Popover';

const CATS: [string, string][] = [
  ['常用', '📄 📝 📌 ✅ 📚 💡 🚀 🎯 📊 📅 🗂️ 📁 🏠 ⭐ 🔥 ❤️ 🎨 🧠 💼 🛒 ✈️ 🍀 🌱 🌙'],
  ['表情', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 👻 👽 🤖 💩'],
  ['人物', '👋 🤚 ✋ 🖖 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 👏 🙌 👐 🤲 🙏 ✍️ 💪 🧠 👀 👁️ 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👮 🕵️ 👷 🤴 👸 🧑‍💻 🧑‍🎨 🧑‍🍳 🧑‍🏫 🧑‍🔬 🧑‍🚀 🦸 🧙 🧚 🧛 🧜 🧝 🚶 🏃 💃 🕺 👯 🧘'],
  ['動物', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🦒 🦘 🐃 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🕊️ 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🍃 🍂 🍁 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻'],
  ['食物', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥜 🍯 🥛 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🍸 🍹'],
  ['活動', '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🥍 🏏 ⛳ 🏹 🎣 🥊 🥋 🎽 🛹 ⛸️ 🎿 🏂 🏋️ 🤸 ⛹️ 🤺 🏌️ 🏇 🧘 🏄 🏊 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩'],
  ['旅遊', '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁'],
  ['物品', '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏱️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🔪 🗡️ ⚔️ 🛡️ 🔮 🧿 💈 ⚗️ 🔭 🔬 💊 💉 🩺 🧬 🦠 🧪 🌡️ 🧹 🧺 🧻 🚽 🛁 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🎊 🎉 🎎 🏮 🎐 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓'],
  ['符號', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ ⚠️ 🚸 ⛔ 🚫 ❌ ⭕ 🛑 💯 💢 ♨️ ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚜️ 🔱 📛 🔰 ✅ ☑️ ✔️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 ♿ 🅿️ 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 ◀️ 🔼 🔽 ⏫ ⏬ ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ 🔄 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 🔚 🔙 🔛 🔝 🔜 〰️ ➰ ➿ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄 🕐 🕑 🕒 🕓 🕔 🕕 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ ☂️ 🌊 🌫️ ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 🌞 🌝 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐'],
];

const ALL = CATS.flatMap(([, s]) => s.split(' '));

export function randomEmoji() {
  const pool = CATS[0][1].split(' ').concat(CATS[3][1].split(' ').slice(0, 40), CATS[7][1].split(' ').slice(100, 160));
  return pool[Math.floor(Math.random() * pool.length)];
}

export function EmojiPicker({ anchor, onSelect, onRemove, onClose }: {
  anchor: Anchor; onSelect: (e: string) => void; onRemove?: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'emoji' | 'link'>('emoji');
  return (
    <Popover anchor={anchor} onClose={onClose} width={408} className="emoji-picker">
      <div className="picker-tabs">
        <span className={mode === 'emoji' ? 'active' : ''} onClick={() => setMode('emoji')}>表情符號</span>
        <span className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>連結</span>
        <span className="spacer" />
        <button className="btn-ghost sm" onClick={() => { onSelect(ALL[Math.floor(Math.random() * ALL.length)]); onClose(); }}>隨機</button>
        {onRemove && <button className="btn-ghost sm" onClick={() => { onRemove(); onClose(); }}>移除</button>}
      </div>
      {mode === 'emoji' ? (
        <>
          <div className="emoji-cats">
            {CATS.map(([n], i) => (
              <span key={n} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>{n}</span>
            ))}
          </div>
          <div className="emoji-grid">
            {CATS[tab][1].split(' ').map((e, i) => (
              <span key={i} className="emoji-cell" onClick={() => { onSelect(e); onClose(); }}>{e}</span>
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: 12 }}>
          <input className="input" placeholder="貼上圖片連結…" value={url} autoFocus onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && url) { onSelect(url); onClose(); } }} />
          <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => { if (url) { onSelect(url); onClose(); } }}>提交</button>
        </div>
      )}
    </Popover>
  );
}

export function PageIcon({ icon, size = 18, fallback = true, className }: { icon?: string; size?: number; fallback?: boolean; className?: string }) {
  if (!icon) return fallback ? <span className={'page-icon ' + (className || '')} style={{ fontSize: size, width: size * 1.2, height: size * 1.2 }}>
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ opacity: .55 }}><path d="M5 2.5h7l3.5 3.5v11.5h-10.5z" /><path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5" /></svg>
  </span> : null;
  if (/^(https?:|data:)/.test(icon)) return <img className={'page-icon img ' + (className || '')} src={icon} style={{ width: size * 1.1, height: size * 1.1 }} alt="" />;
  return <span className={'page-icon ' + (className || '')} style={{ fontSize: size, width: size * 1.2, height: size * 1.2 }}>{icon}</span>;
}

export const COVERS = [
  'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(120deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(120deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(120deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(120deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(120deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(120deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(120deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(120deg, #ee9ca7 0%, #ffdde1 100%)',
  '#e03e3e', '#ffa344', '#ffdc49', '#4dab9a', '#529cca', '#9a6dd7', '#e255a1', '#37352f',
];

export function coverStyle(cover?: string): React.CSSProperties {
  if (!cover) return {};
  if (/^(https?:|data:)/.test(cover)) return { backgroundImage: `url("${cover.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { background: cover };
}

export function CoverPicker({ anchor, onSelect, onRemove, onClose, onUpload }: {
  anchor: Anchor; onSelect: (c: string) => void; onRemove: () => void; onClose: () => void; onUpload: () => void;
}) {
  const [tab, setTab] = useState<'gallery' | 'upload' | 'link'>('gallery');
  const [url, setUrl] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} width={460} align="right">
      <div className="picker-tabs">
        <span className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>圖庫</span>
        <span className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>上傳</span>
        <span className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>連結</span>
        <span className="spacer" />
        <button className="btn-ghost sm" onClick={() => { onRemove(); onClose(); }}>移除</button>
      </div>
      {tab === 'gallery' && (
        <div className="cover-grid">
          {COVERS.map((c) => <div key={c} className="cover-swatch" style={coverStyle(c)} onClick={() => { onSelect(c); onClose(); }} />)}
        </div>
      )}
      {tab === 'upload' && (
        <div style={{ padding: 16 }}>
          <button className="btn-outline" style={{ width: '100%' }} onClick={() => { onUpload(); onClose(); }}>上傳檔案</button>
          <div className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>建議寬度 1500 像素以上的圖片</div>
        </div>
      )}
      {tab === 'link' && (
        <div style={{ padding: 12 }}>
          <input className="input" placeholder="貼上圖片連結…" autoFocus value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && url) { onSelect(url); onClose(); } }} />
          <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => { if (url) { onSelect(url); onClose(); } }}>提交</button>
        </div>
      )}
    </Popover>
  );
}
