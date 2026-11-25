/* Spreadsheet-style arrow-key navigation for grids of cells.
   Mark each cell with data-gr (row) and data-gc (column) and call handleGridKey from the
   grid container's onKeyDown. Inside a text field, ↑/↓ move between cells when the caret is
   on the first/last line and ←/→ when it is at the start/end; elsewhere they move the caret. */
import type React from 'react';
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
