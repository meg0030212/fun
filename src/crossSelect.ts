/* Text selection across blocks.
   Every block is its own contenteditable, and browsers cannot select across two editing hosts.
   When a selection needs to continue into another block (Shift+arrow at the edge, Shift+click,
   or dragging the mouse into another block), the editor root temporarily becomes the editing
   host so one selection can span several blocks. Deleting, typing, pasting, cutting and copying
   that selection are handled here, then the root goes back to normal. */
import { cleanHtml, setCaret } from './utils';

export interface CrossOpts {
  /** replace the first block's html and remove the other selected blocks, in one undo step */
  commit: (startId: string | null, html: string, removeIds: string[]) => void;
  /** save every block whose DOM differs from the store (after native formatting such as Ctrl+B) */
  syncAll: () => void;
}

const ROW = ':scope > .block-row';
const ED = '.block-body .editable.nav';

function caretPoint(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as any;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

function lineHeight(el: HTMLElement) {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  return isNaN(lh) ? 24 : lh;
}

export function attachCrossSelect(root: HTMLElement, o: CrossOpts): () => void {
  let cross = false;
  let drag: { x: number; y: number; ed: HTMLElement } | null = null;

  const edOf = (n: Node | null) => {
    const el = (n instanceof Element ? n : n?.parentElement) as HTMLElement | null;
    const ed = el?.closest<HTMLElement>('.editable.nav');
    return ed && root.contains(ed) ? ed : null;
  };
  const rowOf = (el: Element) => el.closest<HTMLElement>('.block-row');
  const allEds = () => Array.from(root.querySelectorAll<HTMLElement>(`${ROW} > ${ED}`));

  const enter = () => {
    if (cross) return;
    cross = true;
    root.setAttribute('contenteditable', 'true');
    root.classList.add('cross-select');
  };
  const exit = () => {
    if (!cross) return;
    cross = false;
    root.removeAttribute('contenteditable');
    root.classList.remove('cross-select');
  };

  const rowsIn = (range: Range) => Array.from(root.querySelectorAll<HTMLElement>(ROW)).filter((r) => range.intersectsNode(r));

  /** plain text of the selection, one line per block */
  const selText = (range: Range) => rowsIn(range).map((row) => {
    const ed = row.querySelector<HTMLElement>(ED);
    if (!ed) return null;
    const r = document.createRange();
    r.selectNodeContents(ed);
    if (ed.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
    if (ed.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
    return r.toString();
  }).filter((x): x is string => x !== null).join('\n');

  const fragHtml = (r: Range) => { const d = document.createElement('div'); d.appendChild(r.cloneContents()); return d.innerHTML; };

  /** delete the selection; returns false when it lies inside one block (native editing handles it) */
  const deleteSel = (): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const rows = rowsIn(range);
    if (rows.length < 2) return false;
    const edRows = rows.filter((r) => r.querySelector(ED));
    const first = edRows[0];
    const last = edRows[edRows.length - 1];
    let html = '';
    let caret = 0;
    let startEl: HTMLElement | null = null;
    if (first) {
      startEl = first.querySelector<HTMLElement>(ED)!;
      const endEl = last.querySelector<HTMLElement>(ED)!;
      const pre = document.createRange();
      pre.selectNodeContents(startEl);
      if (startEl.contains(range.startContainer)) pre.setEnd(range.startContainer, range.startOffset); else pre.collapse(true);
      const post = document.createRange();
      post.selectNodeContents(endEl);
      if (endEl.contains(range.endContainer)) post.setStart(range.endContainer, range.endOffset); else post.collapse(false);
      caret = pre.toString().length;
      html = cleanHtml(fragHtml(pre) + (endEl === startEl ? '' : fragHtml(post)));
    }
    const removeIds = rows.filter((r) => r !== first).map((r) => r.dataset.blockId!).filter(Boolean);
    exit();
    if (startEl) {
      // update the DOM first so the typed character (if any) lands right where the selection was
      startEl.innerHTML = html;
      setCaret(startEl, caret);
    }
    o.commit(first?.dataset.blockId ?? null, html, removeIds);
    return true;
  };

  const extendTo = (node: Node, offset: number) => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    const a = { node: sel.anchorNode, offset: sel.anchorOffset };
    enter();
    sel.setBaseAndExtent(a.node, a.offset, node, offset);
  };

  /* ---------- keyboard ---------- */
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!cross) {
      // Shift+arrow at the edge of a block continues the selection into the next block
      if (!e.shiftKey || mod || e.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const sel = window.getSelection();
      if (!sel || !sel.focusNode) return;
      const ed = edOf(sel.focusNode);
      if (!ed || ed.closest('.blk-code')) return;
      const r = document.createRange();
      r.setStart(sel.focusNode, sel.focusOffset);
      const pre = document.createRange();
      pre.selectNodeContents(ed);
      pre.setEnd(sel.focusNode, sel.focusOffset);
      const off = pre.toString().length;
      const len = (ed.textContent || '').length;
      const rect = r.getClientRects()[0] || r.getBoundingClientRect();
      const er = ed.getBoundingClientRect();
      const lh = lineHeight(ed);
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const atEdge = e.key === 'ArrowLeft' ? off === 0 : e.key === 'ArrowRight' ? off >= len
        : e.key === 'ArrowUp' ? (!len || !rect || rect.height === 0 ? off === 0 : rect.top - er.top < lh * 0.75)
        : (!len || !rect || rect.height === 0 ? off >= len : er.bottom - rect.bottom < lh * 0.75);
      if (!atEdge) return;
      const eds = allEds();
      const next = eds[eds.indexOf(ed) + (back ? -1 : 1)];
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      const t = document.createRange();
      t.selectNodeContents(next);
      t.collapse(!back);
      extendTo(t.startContainer, t.startOffset);
      return;
    }

    // ----- a cross-block selection is active -----
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return;
    if (e.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return; // native moves
    if (mod && ['c', 'x', 'b', 'i', 'u'].includes(e.key.toLowerCase())) return; // copy/cut events, native formatting
    if (mod && e.key.toLowerCase() === 'z') { exit(); return; } // global undo
    if (e.key === 'Escape') {
      e.preventDefault();
      const sel = window.getSelection();
      const ed = edOf(sel?.focusNode ?? null);
      exit();
      if (ed && sel?.focusNode) { const f = { n: sel.focusNode, o: sel.focusOffset }; ed.focus(); sel.collapse(f.n, f.o); }
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      deleteSel();
      return;
    }
    if (mod) { e.preventDefault(); return; }
    // a typed character (or the start of an IME composition) replaces the selection
    if (e.key.length === 1 || e.key === 'Process' || e.keyCode === 229) {
      e.stopPropagation();
      deleteSel();
    }
  };

  /* ---------- clipboard ---------- */
  const onCopy = (e: ClipboardEvent) => {
    if (!cross) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', selText(sel.getRangeAt(0)));
  };
  const onCut = (e: ClipboardEvent) => {
    if (!cross) return;
    onCopy(e);
    deleteSel();
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!cross) return;
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    e.stopPropagation();
    deleteSel();
    if (text) document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n').replace(/\n+/g, ' '));
  };

  /* ---------- formatting / other native edits while spanning blocks ---------- */
  const onInput = () => { if (cross) o.syncAll(); };

  /* ---------- mouse ---------- */
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const ed = edOf(target);
    if (e.shiftKey) {
      // Shift+click in another block extends the selection there
      const sel = window.getSelection();
      const from = edOf(sel?.anchorNode ?? null);
      const row = rowOf(target);
      if (!from || !row || !root.contains(row) || (ed && ed === from && !cross)) return;
      const p = caretPoint(e.clientX, e.clientY);
      if (!p || !root.contains(p.node)) return;
      e.preventDefault();
      extendTo(p.node, p.offset);
      return;
    }
    if (cross) exit();
    drag = ed ? { x: e.clientX, y: e.clientY, ed } : null;
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!drag || !(e.buttons & 1)) { drag = null; return; }
    const over = edOf(document.elementFromPoint(e.clientX, e.clientY));
    if (!over || (over === drag.ed && !cross)) return;
    // dragged from one block into another: select across them
    const a = caretPoint(drag.x, drag.y);
    const f = caretPoint(e.clientX, e.clientY);
    if (!a || !f || !root.contains(a.node) || !root.contains(f.node)) return;
    enter();
    window.getSelection()?.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  };
  const onMouseUp = () => { drag = null; };

  /* ---------- leave cross mode when the selection collapses or leaves ---------- */
  const onSelectionChange = () => {
    if (!cross) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { exit(); return; }
    if (sel.isCollapsed) {
      const ed = edOf(sel.focusNode);
      const at = { n: sel.focusNode!, o: sel.focusOffset };
      exit();
      if (ed) { ed.focus({ preventScroll: true }); sel.collapse(at.n, at.o); }
    } else if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) exit();
  };

  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('copy', onCopy, true);
  root.addEventListener('cut', onCut, true);
  root.addEventListener('paste', onPaste, true);
  root.addEventListener('input', onInput);
  root.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    exit();
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('copy', onCopy, true);
    root.removeEventListener('cut', onCut, true);
    root.removeEventListener('paste', onPaste, true);
    root.removeEventListener('input', onInput);
    root.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('selectionchange', onSelectionChange);
  };
}
