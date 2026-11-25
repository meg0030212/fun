/* Spreadsheet-style arrow-key navigation for grids of cells.
   Mark each cell with data-gr (row) and data-gc (column) and call handleGridKey from the
   grid container's onKeyDown. Inside a text field, ↑/↓ move between cells when the caret is
   on the first/last line and ←/→ when it is at the start/end; elsewhere they move the caret. */
import React from 'react';
import { caretOnFirstLine, caretOnLastLine, getCaretOffset, setCaret } from './utils';
import { isImeKey } from './ime';

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function editorOf(el: HTMLElement): HTMLElement | null {
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type))) return el;
  if (el.isContentEditable) return el.closest('[contenteditable="true"],[contenteditable="plaintext-only"]') as HTMLElement;
  return null;
}

/** may the caret leave the editor in this direction? */
function atEdge(ed: HTMLElement, dir: Dir): boolean {
  if (ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA') {
    const f = ed as HTMLInputElement | HTMLTextAreaElement;
    let s: number | null = null, e: number | null = null;
    try { s = f.selectionStart; e = f.selectionEnd; } catch { /* number inputs have no selection */ }
    if (s === null || e === null) return true;
    const v = f.value;
    if (dir === 'left') return s === 0 && e === 0;
    if (dir === 'right') return s === v.length && e === v.length;
    if (dir === 'up') return !v.slice(0, s).includes('\n');
    return !v.slice(e).includes('\n');
  }
  const sel = window.getSelection();
  const collapsed = !sel || sel.isCollapsed;
  const len = (ed.textContent || '').length;
  if (dir === 'left') return collapsed && getCaretOffset(ed) === 0;
  if (dir === 'right') return collapsed && getCaretOffset(ed) >= len;
  if (dir === 'up') return caretOnFirstLine(ed);
  return caretOnLastLine(ed);
}

export function focusCell(cell: HTMLElement, caret: 'start' | 'end' = 'end') {
  const ed = cell.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (ed) {
    ed.focus({ preventScroll: true });
    if (ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA') {
      const f = ed as HTMLInputElement;
      try { const n = caret === 'start' ? 0 : f.value.length; f.setSelectionRange(n, n); } catch { /* ignore */ }
    } else setCaret(ed, caret);
  } else cell.focus({ preventScroll: true });
  cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** handles arrows (and Enter/Space/Escape on cells); returns true when it took the key */
export function handleGridKey(e: React.KeyboardEvent, root: HTMLElement): boolean {
  if (e.defaultPrevented || isImeKey(e) || e.altKey || e.ctrlKey || e.metaKey) return false;
  const target = e.target as HTMLElement;
  if (!root.contains(target)) return false; // keys from popovers rendered elsewhere
  const cell = target.closest<HTMLElement>('[data-gc]');
  if (!cell || !root.contains(cell)) return false;
  const ed = editorOf(target);

  if (!ed && target === cell && (e.key === 'Enter' || e.key === ' ')) {
    // open the cell: start typing, or click its control (select, date, checkbox…)
    const inner = cell.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, [contenteditable="true"]');
    if (inner && e.key === 'Enter') focusCell(cell);
    else {
      const ctl = cell.querySelector<HTMLElement>('[data-gclick], .clickable, .checkbox');
      if (ctl) ctl.click(); else cell.click();
    }
    e.preventDefault();
    return true;
  }
  if (ed && e.key === 'Escape' && cell.hasAttribute('tabindex')) {
    // leave the text field but stay on the cell, so arrows keep moving between cells
    cell.focus({ preventScroll: true });
    e.preventDefault();
    return true;
  }

  if (ed && e.key === 'Enter' && !e.shiftKey) {
    // Enter finishes typing but stays in this cell, caret right after the text (Shift+Enter = new line)
    e.preventDefault();
    if (ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA') {
      const f = ed as HTMLInputElement;
      try { f.setSelectionRange(f.value.length, f.value.length); } catch { /* ignore */ }
    } else setCaret(ed, 'end');
    return true;
  }

  const dir = DIRS[e.key];
  if (!dir || e.shiftKey) return false;
  if (ed && !atEdge(ed, dir)) return false;

  const r = Number(cell.dataset.gr), c = Number(cell.dataset.gc);
  const find = (rr: number, cc: number) => root.querySelector<HTMLElement>(`[data-gr="${rr}"][data-gc="${cc}"]`);
  let next: HTMLElement | null = null;
  if (dir === 'up') next = find(r - 1, c);
  else if (dir === 'down') next = find(r + 1, c);
  else {
    const dc = dir === 'left' ? -1 : 1;
    next = find(r, c + dc);
    if (!next) {
      // wrap to the previous/next row like reading order (month grids)
      if (root.dataset.gwrap) {
        const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-gc]'));
        next = cells[cells.indexOf(cell) + dc] || null;
      }
    }
  }
  e.preventDefault(); // never scroll the view sideways
  if (next) focusCell(next, dir === 'left' ? 'end' : dir === 'right' ? 'start' : 'end');
  return true;
}

/* ================= range selection (Shift+click, Shift+arrows, drag) ================= */

export interface GridApi {
  /** plain text of a cell (for copying) */
  get(r: number, c: number): string;
  /** write many cells at once (one undo step); v === null clears the cell */
  apply(changes: { r: number; c: number; v: string | null }[]): void;
}

type Pt = { r: number; c: number };
const ranges = new WeakMap<HTMLElement, { a: Pt; f: Pt }>();
const painted = new Set<HTMLElement>();

const ptOf = (cell: HTMLElement): Pt => ({ r: Number(cell.dataset.gr), c: Number(cell.dataset.gc) });
const cellAt = (root: HTMLElement, p: Pt) => root.querySelector<HTMLElement>(`[data-gr="${p.r}"][data-gc="${p.c}"]`);

function rect(a: Pt, f: Pt) {
  return { r0: Math.min(a.r, f.r), r1: Math.max(a.r, f.r), c0: Math.min(a.c, f.c), c1: Math.max(a.c, f.c) };
}

/** selected points, row by row (only cells that exist) */
export function selectedPts(root: HTMLElement): Pt[] {
  const s = ranges.get(root);
  if (!s) return [];
  const { r0, r1, c0, c1 } = rect(s.a, s.f);
  const out: Pt[] = [];
  root.querySelectorAll<HTMLElement>('[data-gc]').forEach((el) => {
    const p = ptOf(el);
    if (p.r >= r0 && p.r <= r1 && p.c >= c0 && p.c <= c1) out.push(p);
  });
  return out.sort((x, y) => x.r - y.r || x.c - y.c);
}

function paint(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-gsel]').forEach((el) => el.removeAttribute('data-gsel'));
  const s = ranges.get(root);
  if (!s || (s.a.r === s.f.r && s.a.c === s.f.c)) {
    ranges.delete(root); painted.delete(root); root.removeAttribute('data-grange');
    root.dispatchEvent(new CustomEvent('gridrange', { detail: null }));
    return;
  }
  const pts = selectedPts(root);
  pts.forEach((p) => cellAt(root, p)?.setAttribute('data-gsel', '1'));
  root.setAttribute('data-grange', String(pts.length));
  painted.add(root);
  root.dispatchEvent(new CustomEvent('gridrange', { detail: rect(s.a, s.f) }));
}

/** the selected block of a grid (null when only one cell is selected) */
export function getRangeRect(root: HTMLElement) {
  const s = ranges.get(root);
  return s ? rect(s.a, s.f) : null;
}

/** select a block programmatically (e.g. the cells a fill just wrote) */
export function setRange(root: HTMLElement, a: { r: number; c: number }, f: { r: number; c: number }) {
  ranges.set(root, { a, f });
  paint(root);
}

export function clearRange(root: HTMLElement) { ranges.delete(root); paint(root); }
const hasRange = (root: HTMLElement) => ranges.has(root);

function activeCell(root: HTMLElement): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  const c = a?.closest<HTMLElement>('[data-gc]');
  return c && root.contains(c) ? c : null;
}

// clicking anywhere outside a grid drops its selection
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => {
    painted.forEach((root) => { if (!root.isConnected || !root.contains(e.target as Node)) clearRange(root); });
  }, true);
}

function rangeText(root: HTMLElement, api: GridApi): string {
  const s = ranges.get(root);
  const pts = s ? selectedPts(root) : (() => { const c = activeCell(root); return c ? [ptOf(c)] : []; })();
  const rows = new Map<number, string[]>();
  pts.forEach((p) => rows.set(p.r, [...(rows.get(p.r) || []), api.get(p.r, p.c).replace(/\t/g, ' ').replace(/\n/g, ' ')]));
  return [...rows.values()].map((r) => r.join('\t')).join('\n');
}

function gridKeyDown(e: React.KeyboardEvent, root: HTMLElement, api: GridApi) {
  if (isImeKey(e) || !root.contains(e.target as Node)) return;
  const mod = e.ctrlKey || e.metaKey;
  const dir = DIRS[e.key];
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-gc]');

  if (hasRange(root)) {
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      api.apply(selectedPts(root).map((p) => ({ ...p, v: null })));
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); clearRange(root); return; }
  }

  if (dir && e.shiftKey && !mod && !e.altKey && cell) {
    const ed = editorOf(e.target as HTMLElement);
    if (ed && !hasRange(root) && !atEdge(ed, dir)) return; // let Shift+arrow select text inside the field
    // keep extending the current range only if this cell is part of it; otherwise start from here
    const prev = ranges.get(root);
    const here = ptOf(cell);
    const inside = prev && (() => { const q = rect(prev.a, prev.f); return here.r >= q.r0 && here.r <= q.r1 && here.c >= q.c0 && here.c <= q.c1; })();
    const s = inside ? prev! : { a: here, f: here };
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    const next = { r: s.f.r + d[0], c: s.f.c + d[1] };
    e.preventDefault();
    if (!cellAt(root, next)) return;
    ranges.set(root, { a: s.a, f: next });
    paint(root);
    cellAt(root, next)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  // any other key ends the range selection, then the normal cell keys apply
  if (hasRange(root) && !mod && e.key !== 'Shift') clearRange(root);
  handleGridKey(e, root);
}

function gridMouseDown(e: React.MouseEvent, root: HTMLElement) {
  if (e.button !== 0) return;
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-gc]');
  if (!cell || !root.contains(cell)) return;
  if (e.shiftKey) {
    // Shift+click: from the current cell (or range start) to here
    const from = ranges.get(root)?.a || (activeCell(root) ? ptOf(activeCell(root)!) : ptOf(cell));
    ranges.set(root, { a: from, f: ptOf(cell) });
    paint(root);
    e.preventDefault();
    // a Shift+click only selects: swallow the click so the cell's menu (option, date…) does not open
    const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 500);
    return;
  }
  clearRange(root);
  // press and drag across cells to select a block
  const start = ptOf(cell);
  const move = (ev: MouseEvent) => {
    const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-gc]');
    if (!over || !root.contains(over)) return;
    const p = ptOf(over);
    if (p.r === start.r && p.c === start.c && !ranges.has(root)) return;
    window.getSelection()?.removeAllRanges();
    document.body.classList.add('grid-selecting');
    ranges.set(root, { a: start, f: p });
    paint(root);
  };
  const up = () => {
    document.body.classList.remove('grid-selecting');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function parseClip(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  return t.split('\n').map((l) => l.split('\t'));
}

/** props for a grid container: arrow keys, range selection and copy/cut/paste/delete */
export function useGrid(api: GridApi) {
  const ref = React.useRef(api);
  ref.current = api;
  return {
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => gridKeyDown(e, e.currentTarget, ref.current),
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => gridMouseDown(e, e.currentTarget),
    onCopy: (e: React.ClipboardEvent<HTMLElement>) => {
      const root = e.currentTarget;
      if (!hasRange(root) && editorOf(e.target as HTMLElement)) return; // normal text copy
      e.preventDefault();
      e.clipboardData.setData('text/plain', rangeText(root, ref.current));
    },
    onCut: (e: React.ClipboardEvent<HTMLElement>) => {
      const root = e.currentTarget;
      if (!hasRange(root)) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', rangeText(root, ref.current));
      ref.current.apply(selectedPts(root).map((p) => ({ ...p, v: null })));
    },
    onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
      const root = e.currentTarget;
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      const m = parseClip(text);
      const multi = m.length > 1 || m[0].length > 1;
      const inEditor = !!editorOf(e.target as HTMLElement);
      if (!hasRange(root) && !multi && inEditor) return; // ordinary paste into the field
      const cell = activeCell(root) || (e.target as HTMLElement).closest<HTMLElement>('[data-gc]');
      e.preventDefault();
      const changes: { r: number; c: number; v: string | null }[] = [];
      if (hasRange(root) && !multi) {
        // one value into every selected cell
        selectedPts(root).forEach((p) => changes.push({ ...p, v: m[0][0] }));
      } else {
        const s = ranges.get(root);
        const origin = s ? { r: Math.min(s.a.r, s.f.r), c: Math.min(s.a.c, s.f.c) } : cell ? ptOf(cell) : null;
        if (!origin) return;
        m.forEach((row, i) => row.forEach((v, j) => {
          const p = { r: origin.r + i, c: origin.c + j };
          if (cellAt(root, p)) changes.push({ ...p, v });
        }));
      }
      ref.current.apply(changes);
    },
  };
}
