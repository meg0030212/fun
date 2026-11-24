export function uid(): string {
  return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 9);
}

export const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export const COLOR_NAMES: Record<string, string> = {
  default: '預設', gray: '灰色', brown: '棕色', orange: '橘色', yellow: '黃色',
  green: '綠色', blue: '藍色', purple: '紫色', pink: '粉紅色', red: '紅色',
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function htmlToText(html: string): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

export function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '剛剛';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString('zh-TW');
}

/* ---------- era: 西元 or 民國 ---------- */
let rocEra = false;
export function setRocEra(on: boolean) { rocEra = on; }
export function isRocEra() { return rocEra; }
/** "2026年" or "民國115年" depending on the workspace setting (or forced) */
export function yearLabel(y: number, roc = rocEra): string {
  if (!roc) return `${y}年`;
  return y > 1911 ? `民國${y - 1911}年` : `民國前${1912 - y}年`;
}
/** "2026年11月" / "民國115年11月" */
export function monthLabel(d: Date): string { return `${yearLabel(d.getFullYear())}${d.getMonth() + 1}月`; }

export function formatDate(v: string | number | undefined | null): string {
  if (v === undefined || v === null || v === '') return '';
  const d = typeof v === 'number' ? new Date(v) : parseISODate(v);
  if (!d || isNaN(d.getTime())) return String(v);
  return `${yearLabel(d.getFullYear())}${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateTime(t: number): string {
  const d = new Date(t);
  return `${formatDate(t)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- caret helpers for contenteditable ---------- */

export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}

function locate(el: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n: Node | null;
  let last: Node | null = null;
  while ((n = walker.nextNode())) {
    const len = (n.textContent || '').length;
    if (acc + len >= offset) return { node: n, offset: offset - acc };
    acc += len;
    last = n;
  }
  if (last) return { node: last, offset: (last.textContent || '').length };
  return null;
}

export function setCaret(el: HTMLElement, pos: number | 'start' | 'end') {
  el.focus({ preventScroll: false });
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (pos === 'start' || pos === 'end') {
    range.selectNodeContents(el);
    range.collapse(pos === 'start');
  } else {
    const loc = locate(el, pos);
    if (loc) {
      range.setStart(loc.node, loc.offset);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function rangeFromOffsets(el: HTMLElement, from: number, to: number): Range | null {
  const a = locate(el, from);
  const b = locate(el, to);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

export function deleteTextRange(el: HTMLElement, from: number, to: number) {
  const r = rangeFromOffsets(el, from, to);
  if (!r) return;
  r.deleteContents();
  const sel = window.getSelection();
  sel?.removeAllRanges();
  r.collapse(true);
  sel?.addRange(r);
}

export function cleanHtml(html: string): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  if (!d.textContent && !d.querySelector('img,a.mention')) return '';
  return html;
}

export function splitAtCaret(el: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { before: el.innerHTML, after: '' };
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(r.endContainer, r.endOffset);
  const frag = after.extractContents();
  const div = document.createElement('div');
  div.appendChild(frag);
  return { before: cleanHtml(el.innerHTML), after: cleanHtml(div.innerHTML) };
}

export function caretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  const rects = r.getClientRects();
  if (rects.length) return rects[0];
  const node = r.startContainer as HTMLElement;
  if (node.nodeType === 1 && node.getBoundingClientRect) return node.getBoundingClientRect();
  return null;
}

function lineHeight(el: HTMLElement) {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  return isNaN(lh) ? 24 : lh;
}

export function caretOnFirstLine(el: HTMLElement): boolean {
  if (!el.textContent) return true;
  const rect = caretRect();
  if (!rect || (rect.top === 0 && rect.height === 0)) return getCaretOffset(el) === 0;
  const er = el.getBoundingClientRect();
  return rect.top - er.top < lineHeight(el) * 0.75;
}

export function caretOnLastLine(el: HTMLElement): boolean {
  if (!el.textContent) return true;
  const rect = caretRect();
  if (!rect || (rect.top === 0 && rect.height === 0)) return getCaretOffset(el) >= (el.textContent || '').length;
  const er = el.getBoundingClientRect();
  return er.bottom - rect.bottom < lineHeight(el) * 0.75;
}

export function selectionInside(el: HTMLElement): boolean {
  const sel = window.getSelection();
  return !!sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
}

export function downloadFile(name: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsText(file);
  });
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => res(inp.files?.[0] ?? null);
    inp.click();
  });
}

export function youtubeEmbed(url: string): string | null {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/.exec(url);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  const v = /vimeo\.com\/(\d+)/.exec(url);
  if (v) return `https://player.vimeo.com/video/${v[1]}`;
  return null;
}

export function safeUrl(url: string): string {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:|data:image\/)/i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return 'https://' + u;
  return '#';
}

export function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
