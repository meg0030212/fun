/* Remembers the last style the user picked, so the next callout / colour starts from it (per browser). */

const CALLOUT_KEY = 'lumen.lastCallout';
const COLORS_KEY = 'lumen.recentColors';

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

/** icon + colour for a new callout: the ones last chosen on any callout */
export function calloutDefaults(): { icon: string; color: string } {
  const v = read(CALLOUT_KEY, { icon: '💡', color: 'gray_bg' });
  return { icon: v.icon || '💡', color: v.color || 'gray_bg' };
}
export function rememberCallout(patch: { icon?: string; color?: string }) {
  const cur = calloutDefaults();
  write(CALLOUT_KEY, { ...cur, ...patch, color: patch.color === 'default' ? 'default' : patch.color ?? cur.color });
}

/** recently used colours, newest first, in block form: 'red' (text) or 'red_bg' (background); 'default' clears */
export function recentColors(): string[] {
  try { const v = JSON.parse(localStorage.getItem(COLORS_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
export function rememberColor(c: string) {
  if (!c || c === 'default') return;
  write(COLORS_KEY, [c, ...recentColors().filter((x) => x !== c)].slice(0, 5));
}
/** 'red' → 'c-red', 'red_bg' → 'bg-red' (inline span classes) */
export const inlineClass = (c: string) => (c.endsWith('_bg') ? 'bg-' + c.slice(0, -3) : 'c-' + c);
