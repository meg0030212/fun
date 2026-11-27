/* Copy / paste whole blocks (keeps type, colour, icon, nesting…), with Markdown and HTML for other apps. */
import type { Block } from './types';
import { uid } from './utils';

const MIME = 'web application/x-lumen-blocks';
const ATTR = 'data-lumen-blocks';
let last: { text: string; blocks: Block[] } | null = null;

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));
const clone = (bs: Block[]) => JSON.parse(JSON.stringify(bs)) as Block[];

/** put blocks on the clipboard; must run inside the key / click handler (synchronous copy) */
export function copyBlocks(blocks: Block[], text: string, html: string): boolean {
  const json = JSON.stringify(blocks);
  last = { text: text.replace(/\r\n?/g, '\n').trim(), blocks: clone(blocks) };
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const dt = e.clipboardData!;
    dt.setData('text/plain', text);
    dt.setData('text/html', `<div ${ATTR}="${enc(json)}">${html}</div>`);
    try { dt.setData(MIME, json); } catch { /* custom formats unsupported */ }
  };
  // a hidden, selected textarea makes every browser fire the copy event
  const prev = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text || ' ';
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.addEventListener('copy', onCopy, true);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.removeEventListener('copy', onCopy, true);
  ta.remove();
  if (prev && prev !== document.body) prev.focus({ preventScroll: true });
  if (!ok) navigator.clipboard?.writeText(text).catch(() => {});
  return ok;
}

/** blocks copied from Lumen, with fresh ids; null when the clipboard holds something else */
export function pastedBlocks(dt: DataTransfer | null): Block[] | null {
  if (!dt) return null;
  let bs: Block[] | null = null;
  try { const j = dt.getData(MIME); if (j) bs = JSON.parse(j); } catch { /* ignore */ }
  if (!bs) {
    const m = dt.getData('text/html').match(new RegExp(ATTR + '="([^"]+)"'));
    if (m) { try { bs = JSON.parse(dec(m[1])); } catch { /* ignore */ } }
  }
  if (!bs && last && dt.getData('text/plain').replace(/\r\n?/g, '\n').trim() === last.text) bs = last.blocks;
  if (!Array.isArray(bs) || !bs.length) return null;
  return clone(bs).map((b) => ({ ...b, id: uid() }));
}
