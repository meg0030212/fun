import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, BlockType, Page } from '../types';
import {
  createDatabasePage, createInlineDatabase, createPage, duplicatePage, getState, isTrashed, newBlock, setBlocks, useStore,
} from '../store';
import {
  caretOnFirstLine, caretOnLastLine, caretRect, cleanHtml, deleteTextRange, escapeHtml, formatDate, getCaretOffset,
  htmlToText, rangeFromOffsets, readFileAsDataURL, setCaret, splitAtCaret, toISODate, uid,
} from '../utils';
import { filterSlash, LIST_TYPES, PLACEHOLDERS, SlashItem, TEXT_TYPES } from '../blockTypes';
import { Editable } from './Editable';
import { SlashMenu, MentionMenu, MentionItem } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { Icon } from './Icons';
import { BlockContentExtra } from './Blocks';
import { navigate, toast } from '../ui';
import { blocksToMarkdown, markdownToBlocks } from '../markdown';
import { EmojiPicker } from './EmojiPicker';

interface MenuState {
  kind: 'slash' | 'mention';
  blockId: string;
  start: number;
  query: string;
  rect: DOMRect;
}

const BULLETS = ['•', '◦', '▪'];
function numberLabel(n: number, depth: number) {
  const d = depth % 3;
  if (d === 0) return n + '.';
  if (d === 1) return String.fromCharCode(96 + ((n - 1) % 26) + 1) + '.';
  const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  return (romans[n - 1] || String(n)) + '.';
}

function subtreeEnd(arr: Block[], i: number) {
  let j = i + 1;
  while (j < arr.length && arr[j].indent > arr[i].indent) j++;
  return j;
}

export function Editor({ page, readOnly }: { page: Page; readOnly?: boolean }) {
  const pageId = page.id;
  const blocks = page.blocks;
  const pages = useStore((s) => s.pages);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuIdx, setMenuIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const [blockMenu, setBlockMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [iconPicker, setIconPicker] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const draggingRef = useRef<string | null>(null);

  /* ---------- visible block computation ---------- */
  const visible = useMemo(() => {
    const out: { b: Block; idx: number; num: number; hasChildren: boolean }[] = [];
    let hideBelow = Infinity;
    const counters: number[] = [];
    blocks.forEach((b, i) => {
      if (b.indent > hideBelow) return;
      hideBelow = Infinity;
      counters.length = b.indent + 1;
      if (b.type === 'numbered') counters[b.indent] = (counters[b.indent] || 0) + 1;
      else counters[b.indent] = 0;
      if (b.type === 'page' && (!b.pageId || !pages[b.pageId] || isTrashed(b.pageId))) return;
      const hasChildren = i + 1 < blocks.length && blocks[i + 1].indent > b.indent;
      out.push({ b, idx: i, num: counters[b.indent], hasChildren });
      if (b.type === 'toggle' && b.collapsed) hideBelow = b.indent;
    });
    return out;
  }, [blocks, pages]);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /* ---------- helpers ---------- */
  const elOf = useCallback((id: string) => rootRef.current?.querySelector<HTMLDivElement>(`[data-block-id="${id}"] .editable`) ?? null, []);

  const focusBlock = useCallback((id: string, pos: number | 'start' | 'end' = 'end') => {
    const tryFocus = (n: number) => {
      const el = rootRef.current?.querySelector<HTMLDivElement>(`[data-block-id="${id}"] .editable`);
      if (el) setCaret(el, pos);
      else if (n > 0) setTimeout(() => tryFocus(n - 1), 16);
    };
    queueMicrotask(() => tryFocus(8));
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<Block>, kind: 'structural' | 'typing' | 'silent' = 'structural') => {
    setBlocks(pageId, (bs) => {
      const b = bs.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    }, kind);
  }, [pageId]);

  const insertAfter = useCallback((id: string | null, nb: Block | Block[], focus = true) => {
    const list = Array.isArray(nb) ? nb : [nb];
    setBlocks(pageId, (bs) => {
      const i = id ? bs.findIndex((x) => x.id === id) : -1;
      if (i < 0) { bs.push(...list); return; }
      const b = bs[i];
      let at = i + 1;
      if (b.type === 'toggle' && b.collapsed) at = subtreeEnd(bs as Block[], i);
      bs.splice(at, 0, ...list);
    });
    if (focus) focusBlock(list[0].id, 'start');
  }, [pageId, focusBlock]);

  const removeBlocks = useCallback((ids: string[], withChildren = true) => {
    setBlocks(pageId, (bs) => {
      const del = new Set<number>();
      ids.forEach((id) => {
        const i = bs.findIndex((x) => x.id === id);
        if (i < 0) return;
        const end = withChildren ? subtreeEnd(bs as Block[], i) : i + 1;
        for (let k = i; k < end; k++) del.add(k);
      });
      const res = (bs as Block[]).filter((_, k) => !del.has(k));
      if (!res.length) res.push(newBlock());
      return res;
    });
  }, [pageId]);

  const navEls = () => Array.from(rootRef.current?.querySelectorAll<HTMLDivElement>('.block-row > .block-body .editable.nav') ?? []);
  const focusSibling = (el: HTMLElement, dir: -1 | 1, pos: 'start' | 'end') => {
    const els = navEls();
    const i = els.indexOf(el as HTMLDivElement);
    const t = els[i + dir];
    if (t) { setCaret(t, pos); return true; }
    return false;
  };

  /* ---------- turn into ---------- */
  const turnInto = useCallback((id: string, type: BlockType) => {
    setBlocks(pageId, (bs) => {
      const b = bs.find((x) => x.id === id);
      if (!b) return;
      if (b.type === 'code' && type !== 'code') b.html = escapeHtml(b.html).replace(/\n/g, '<br>');
      else if (type === 'code' && b.type !== 'code') b.html = htmlToText(b.html);
      if (!TEXT_TYPES.includes(b.type)) b.html = '';
      b.type = type;
      if (type === 'todo' && b.checked === undefined) b.checked = false;
      if (type === 'callout') { b.icon = b.icon || '💡'; b.color = b.color || 'gray_bg'; }
      if (type === 'code') b.lang = b.lang || 'plain';
    });
    focusBlock(id, 'end');
  }, [pageId, focusBlock]);

  /* ---------- slash commands ---------- */
  const applySlash = (item: SlashItem) => {
    if (!menu) return;
    const blockId = menu.blockId;
    const el = elOf(blockId);
    const cur = blocksRef.current.find((b) => b.id === blockId);
    setMenu(null);
    if (!el || !cur) return;
    deleteTextRange(el, menu.start, Math.max(menu.start, getCaretOffset(el)));
    const html = cleanHtml(el.innerHTML);
    if (item.special === 'mention') {
      updateBlock(blockId, { html }, 'silent');
      setTimeout(() => { el.focus(); document.execCommand('insertText', false, '@'); }, 0);
      return;
    }
    if (item.special === 'date-today') {
      insertInlineHtml(el, blockId, `<span class="mention-date" contenteditable="false">@${formatDate(toISODate(new Date()))}</span>`);
      return;
    }
    const empty = !htmlToText(html).trim() && cur.type !== 'code';
    let targetId = blockId;
    const base = cur.type === 'code' ? 'code' : cur.type;
    if (empty) {
      updateBlock(blockId, { html: '' }, 'silent');
    } else {
      updateBlock(blockId, { html }, 'silent');
      const nb = newBlock('text', { indent: cur.indent });
      targetId = nb.id;
      setBlocks(pageId, (bs) => { const i = bs.findIndex((x) => x.id === blockId); bs.splice(i + 1, 0, nb); });
    }
    void base;
    transform(targetId, item);
  };

  const ensureTextAfter = (id: string, focus = true) => {
    const bs = blocksRef.current;
    const i = bs.findIndex((x) => x.id === id);
    const next = bs[i + 1];
    if (next && next.type === 'text' && !next.html) { if (focus) focusBlock(next.id, 'start'); return; }
    const nb = newBlock('text', { indent: bs[i]?.indent ?? 0 });
    setBlocks(pageId, (b2) => { const j = b2.findIndex((x) => x.id === id); b2.splice(j + 1, 0, nb); }, 'silent');
    if (focus) focusBlock(nb.id, 'start');
  };

  const transform = (id: string, item: SlashItem) => {
    if (item.special === 'page') {
      const pid = createPage({ parentId: pageId });
      updateBlock(id, { type: 'page', pageId: pid, html: '' });
      navigate(pid);
      return;
    }
    if (item.special === 'page-db') {
      const pid = createDatabasePage(pageId, item.view || 'table', false);
      updateBlock(id, { type: 'page', pageId: pid, html: '' });
      navigate(pid);
      return;
    }
    if (item.special === 'inline-db') {
      const dbId = createInlineDatabase(pageId, item.view || 'table');
      updateBlock(id, { type: 'database', dbId, html: '' });
      ensureTextAfter(id);
      return;
    }
    const type = item.type!;
    const fresh = newBlock(type);
    const patch: Partial<Block> = { type, ...item.extra };
    if (type === 'todo') patch.checked = false;
    if (type === 'callout') patch.icon = patch.icon || '💡';
    if (type === 'table') { patch.rows = fresh.rows; patch.headerRow = true; }
    if (type === 'code') patch.lang = 'plain';
    if (!TEXT_TYPES.includes(type)) patch.html = '';
    updateBlock(id, patch);
    if (TEXT_TYPES.includes(type)) focusBlock(id, 'end');
    else {
      // blocks with their own input (equation editor, url box) keep focus; others move to a text block after
      const ownInput = ['equation', 'image', 'bookmark', 'embed', 'video'].includes(type);
      if (ownInput) (document.activeElement as HTMLElement | null)?.blur();
      ensureTextAfter(id, !ownInput);
    }
  };

  /* ---------- mention ---------- */
  const insertInlineHtml = (el: HTMLElement, blockId: string, html: string) => {
    el.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const node = tmp.firstChild!;
    r.insertNode(node);
    const space = document.createTextNode(' ');
    node.parentNode!.insertBefore(space, node.nextSibling);
    const r2 = document.createRange();
    r2.setStartAfter(space);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    updateBlock(blockId, { html: el.innerHTML });
  };

  const mentionItems: MentionItem[] = useMemo(() => {
    if (!menu || menu.kind !== 'mention') return [];
    const q = menu.query.toLowerCase();
    const today = new Date();
    const d = (n: number) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };
    const dates: MentionItem[] = [
      { kind: 'date', label: '今天', sub: formatDate(toISODate(today)), date: toISODate(today) },
      { kind: 'date', label: '明天', sub: formatDate(toISODate(d(1))), date: toISODate(d(1)) },
      { kind: 'date', label: '昨天', sub: formatDate(toISODate(d(-1))), date: toISODate(d(-1)) },
    ].filter((x) => !q || x.label.includes(q) || 'today tomorrow yesterday date 日期'.includes(q)) as MentionItem[];
    const ps: MentionItem[] = Object.values(pages)
      .filter((p) => !isTrashed(p.id) && (p.title || '未命名').toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((p) => ({ kind: 'page', label: p.title || '未命名', icon: p.icon, pageId: p.id }));
    const create: MentionItem[] = q ? [{ kind: 'new', label: `新增子頁面「${menu.query}」`, title: menu.query }] : [];
    return [...ps, ...dates, ...create];
  }, [menu, pages]);

  const applyMention = (item: MentionItem) => {
    if (!menu) return;
    const el = elOf(menu.blockId);
    const blockId = menu.blockId;
    setMenu(null);
    if (!el) return;
    deleteTextRange(el, menu.start, Math.max(menu.start, getCaretOffset(el)));
    if (item.kind === 'date') {
      insertInlineHtml(el, blockId, `<span class="mention-date" contenteditable="false">@${formatDate(item.date)}</span>`);
      return;
    }
    let pid = item.pageId;
    if (item.kind === 'new') pid = createPage({ parentId: pageId, title: item.title, addLinkInParent: false });
    const p = getState().pages[pid!];
    const icon = p?.icon && !/^(https?:|data:)/.test(p.icon) ? p.icon : '📄';
    insertInlineHtml(el, blockId, `<a class="mention" contenteditable="false" data-page-id="${pid}" href="#/${pid}"><span class="mention-icon">${icon}</span><span class="mention-title">${escapeHtml(p?.title || '未命名')}</span></a>`);
  };

  /* ---------- inline markdown ---------- */
  const tryInlineMarkdown = (el: HTMLElement, blockId: string) => {
    const caret = getCaretOffset(el);
    const before = (el.textContent || '').slice(0, caret);
    const pats: [RegExp, string][] = [
      [/\*\*([^*]+)\*\*$/, 'b'], [/~~([^~]+)~~$/, 's'], [/`([^`]+)`$/, 'code'], [/(^|[^*])\*([^*\s][^*]*)\*$/, 'i'],
    ];
    for (const [re, tag] of pats) {
      const m = re.exec(before);
      if (!m) continue;
      const inner = tag === 'i' ? m[2] : m[1];
      const full = tag === 'i' ? m[0].slice(m[1].length) : m[0];
      const r = rangeFromOffsets(el, caret - full.length, caret);
      if (!r) return;
      r.deleteContents();
      const node = document.createElement(tag);
      node.textContent = inner;
      r.insertNode(node);
      const sel = window.getSelection()!;
      const r2 = document.createRange();
      const next = node.nextSibling;
      if (next && next.nodeType === 3 && (next.textContent || '').length) {
        r2.setStart(next, 0);
      } else {
        const anchor = document.createTextNode('\u200B');
        node.parentNode!.insertBefore(anchor, node.nextSibling);
        r2.setStart(anchor, 1);
      }
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
      updateBlock(blockId, { html: el.innerHTML }, 'typing');
      return;
    }
  };

  /* ---------- input ---------- */
  const stripZwsp = (el: HTMLElement) => {
    if (!el.innerHTML.includes('\u200B')) return;
    const sel = window.getSelection();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = n as Text;
      if (!t.data.includes('\u200B') || t.data.length < 2) continue;
      const caret = sel && sel.anchorNode === t ? sel.anchorOffset : -1;
      const before = caret >= 0 ? (t.data.slice(0, caret).match(/\u200B/g) || []).length : 0;
      t.data = t.data.replace(/\u200B/g, '');
      if (caret >= 0 && sel) {
        const r = document.createRange();
        r.setStart(t, Math.max(0, caret - before));
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
  };

  const handleInput = (b: Block, rawHtml: string, e: React.FormEvent<HTMLDivElement>, el: HTMLDivElement) => {
    let html = rawHtml;
    if (b.type !== 'code' && html.includes('\u200B')) { stripZwsp(el); html = el.innerHTML; }
    updateBlock(b.id, { html }, 'typing');
    const ie = e.nativeEvent as InputEvent;
    const text = el.textContent || '';
    if (b.type === 'text') {
      if (text === '---' || text === '———') {
        updateBlock(b.id, { type: 'divider', html: '' });
        ensureTextAfter(b.id);
        return;
      }
      if (text === '```' || text === '···') {
        updateBlock(b.id, { type: 'code', html: '', lang: 'plain' });
        focusBlock(b.id, 'start');
        return;
      }
    }
    if (b.type !== 'code' && ie.inputType === 'insertText' && ie.data && /[*`~]$/.test(ie.data)) tryInlineMarkdown(el, b.id);

    if (menu && menu.blockId === b.id) {
      const caret = getCaretOffset(el);
      if (caret <= menu.start || text[menu.start] !== (menu.kind === 'slash' ? text[menu.start] : '@')) { setMenu(null); return; }
      const q = text.slice(menu.start + 1, caret);
      if (q.length > 30 || (menu.kind === 'slash' && /\s\s$/.test(q)) || (menu.kind === 'slash' && /\s$/.test(q) && !filterSlash(q).length)) { setMenu(null); return; }
      setMenu({ ...menu, query: q });
      setMenuIdx(0);
      return;
    }
    if (b.type === 'code') return;
    if (ie.data === '/' || (ie.data === '、' && text.trim() === '、')) {
      const caret = getCaretOffset(el);
      const rect = caretRect() || el.getBoundingClientRect();
      setMenu({ kind: 'slash', blockId: b.id, start: caret - 1, query: '', rect });
      setMenuIdx(0);
    } else if (ie.data === '@') {
      const caret = getCaretOffset(el);
      const rect = caretRect() || el.getBoundingClientRect();
      setMenu({ kind: 'mention', blockId: b.id, start: caret - 1, query: '', rect });
      setMenuIdx(0);
    }
  };

  /* ---------- indent ---------- */
  const indentBlock = (id: string, delta: 1 | -1) => {
    setBlocks(pageId, (bs) => {
      const i = bs.findIndex((x) => x.id === id);
      if (i < 0) return;
      const b = bs[i];
      if (delta === 1) {
        if (i === 0) return;
        const vis = visibleRef.current;
        const vi = vis.findIndex((v) => v.b.id === id);
        const prev = vi > 0 ? vis[vi - 1].b : bs[i - 1];
        if (b.indent >= prev.indent + 1) return;
      } else if (b.indent === 0) return;
      const end = subtreeEnd(bs as Block[], i);
      for (let k = i; k < end; k++) bs[k].indent = Math.max(0, bs[k].indent + delta);
    });
  };

  /* ---------- key handling ---------- */
  const handleKeyDown = (b: Block, e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    const native = e.nativeEvent;
    if (native.isComposing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey;

    // menu navigation
    if (menu && menu.blockId === b.id) {
      const count = menu.kind === 'slash' ? filterSlash(menu.query).length : mentionItems.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIdx((i) => (count ? (i + 1) % count : 0)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIdx((i) => (count ? (i - 1 + count) % count : 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (menu.kind === 'slash') { const it = filterSlash(menu.query)[menuIdx]; if (it) applySlash(it); else setMenu(null); }
        else { const it = mentionItems[menuIdx]; if (it) applyMention(it); else setMenu(null); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); return; }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      el.blur();
      window.getSelection()?.removeAllRanges();
      setSelected([b.id]);
      return;
    }

    // shortcuts
    if (mod && e.altKey && /^Digit[0-9]$/.test(e.code)) {
      e.preventDefault();
      const map: BlockType[] = ['text', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'code', 'quote'];
      turnInto(b.id, map[+e.code.slice(5)]);
      return;
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateBlocks([b.id]); return; }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (b.type === 'todo') updateBlock(b.id, { checked: !b.checked });
      if (b.type === 'toggle') updateBlock(b.id, { collapsed: !b.collapsed });
      return;
    }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveBlockByKey(b.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (b.type !== 'code') {
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        wrapSelection('code');
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); document.execCommand('strikeThrough'); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k' && !window.getSelection()?.isCollapsed) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('lumen:link'));
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (b.type === 'code' && !e.shiftKey) { document.execCommand('insertText', false, '  '); return; }
      const off = getCaretOffset(el);
      indentBlock(b.id, e.shiftKey ? -1 : 1);
      focusBlock(b.id, off);
      return;
    }

    // markdown block shortcuts
    if (e.key === ' ' && b.type === 'text') {
      const off = getCaretOffset(el);
      const prefix = (el.textContent || '').slice(0, off);
      const map: Record<string, Partial<Block>> = {
        '#': { type: 'h1' }, '##': { type: 'h2' }, '###': { type: 'h3' },
        '-': { type: 'bulleted' }, '*': { type: 'bulleted' }, '+': { type: 'bulleted' },
        '1.': { type: 'numbered' }, '1、': { type: 'numbered' }, '[]': { type: 'todo', checked: false }, '【】': { type: 'todo', checked: false }, '[x]': { type: 'todo', checked: true },
        '>': { type: 'toggle' }, '》': { type: 'toggle' }, '"': { type: 'quote' }, '“': { type: 'quote' }, '」': { type: 'quote' }, '|': { type: 'quote' },
      };
      if (map[prefix]) {
        e.preventDefault();
        deleteTextRange(el, 0, off);
        const patch = { ...map[prefix], html: cleanHtml(el.innerHTML) };
        updateBlock(b.id, patch);
        focusBlock(b.id, 'start');
        return;
      }
    }

    const sel = window.getSelection();
    const collapsed = !!sel && sel.isCollapsed;

    if (e.key === 'Enter' && !e.shiftKey) {
      if (b.type === 'code') return; // newline in code
      e.preventDefault();
      const text = el.textContent || '';
      const isList = LIST_TYPES.includes(b.type);
      if (isList && !text && !el.querySelector('a.mention,.mention-date')) {
        if (b.indent > 0) indentBlock(b.id, -1);
        else updateBlock(b.id, { type: 'text' });
        focusBlock(b.id, 'start');
        return;
      }
      const offset = getCaretOffset(el);
      if (offset === 0 && collapsed && text.length > 0) {
        // insert empty block above
        const nb = newBlock(isList ? b.type : 'text', { indent: b.indent });
        setBlocks(pageId, (bs) => { const i = bs.findIndex((x) => x.id === b.id); bs.splice(i, 0, nb); });
        focusBlock(b.id, 'start');
        return;
      }
      const { before, after } = splitAtCaret(el);
      const bs = blocksRef.current;
      const i = bs.findIndex((x) => x.id === b.id);
      const hasChildren = i + 1 < bs.length && bs[i + 1].indent > b.indent;
      const nextType: BlockType = isList ? b.type : 'text';
      let indent = b.indent;
      if ((hasChildren || b.type === 'toggle') && !(b.type === 'toggle' && b.collapsed)) indent = b.indent + 1;
      const nb = newBlock(b.type === 'toggle' && indent > b.indent ? 'text' : nextType, { indent, html: after });
      setBlocks(pageId, (arr) => {
        const j = arr.findIndex((x) => x.id === b.id);
        arr[j].html = before;
        let at = j + 1;
        if (arr[j].type === 'toggle' && arr[j].collapsed) at = subtreeEnd(arr as Block[], j);
        arr.splice(at, 0, nb);
      });
      focusBlock(nb.id, 'start');
      return;
    }

    if (e.key === 'Enter' && e.shiftKey && b.type !== 'code') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }

    if (e.key === 'Backspace' && collapsed && getCaretOffset(el) === 0) {
      if (b.type === 'code' && el.textContent) return;
      e.preventDefault();
      if (b.type !== 'text') { updateBlock(b.id, { type: 'text', html: b.type === 'code' ? escapeHtml(b.html) : b.html }); focusBlock(b.id, 'start'); return; }
      if (b.indent > 0) { indentBlock(b.id, -1); focusBlock(b.id, 'start'); return; }
      const vis = visibleRef.current;
      const vi = vis.findIndex((v) => v.b.id === b.id);
      const prev = vi > 0 ? vis[vi - 1].b : null;
      if (!prev) return;
      if (TEXT_TYPES.includes(prev.type)) {
        const prevEl = elOf(prev.id);
        const len = prevEl ? (prevEl.textContent || '').length : htmlToText(prev.html).length;
        const merged = prev.type === 'code' ? prev.html + (el.textContent || '') : cleanHtml(prev.html + el.innerHTML);
        setBlocks(pageId, (arr) => {
          const pi = arr.findIndex((x) => x.id === prev.id);
          arr[pi].html = merged;
          const ci = arr.findIndex((x) => x.id === b.id);
          arr.splice(ci, 1);
        });
        focusBlock(prev.id, len);
      } else {
        if (!el.textContent) removeBlocks([b.id], false);
        el.blur();
        setSelected([prev.id]);
      }
      return;
    }

    if (e.key === 'Delete' && collapsed && getCaretOffset(el) === (el.textContent || '').length) {
      const vis = visibleRef.current;
      const vi = vis.findIndex((v) => v.b.id === b.id);
      const next = vis[vi + 1]?.b;
      if (!next || !TEXT_TYPES.includes(next.type) || b.type === 'code') return;
      e.preventDefault();
      const len = (el.textContent || '').length;
      setBlocks(pageId, (arr) => {
        const ci = arr.findIndex((x) => x.id === b.id);
        arr[ci].html = cleanHtml(arr[ci].html + (next.type === 'code' ? escapeHtml(next.html) : next.html));
        const ni = arr.findIndex((x) => x.id === next.id);
        arr.splice(ni, 1);
      });
      focusBlock(b.id, len);
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && caretOnFirstLine(el)) {
      if (focusSibling(el, -1, 'end')) e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && caretOnLastLine(el)) {
      if (focusSibling(el, 1, 'start')) e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && collapsed && !e.shiftKey && getCaretOffset(el) === 0) {
      if (focusSibling(el, -1, 'end')) e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' && collapsed && !e.shiftKey && getCaretOffset(el) === (el.textContent || '').length) {
      if (focusSibling(el, 1, 'start')) e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a' && el.textContent && window.getSelection()?.toString() === el.textContent) {
      // second Ctrl+A selects all blocks
      e.preventDefault();
      el.blur();
      setSelected(visibleRef.current.map((v) => v.b.id));
    }
  };

  const wrapSelection = (tag: string) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const host = (r.commonAncestorContainer as HTMLElement).nodeType === 1 ? r.commonAncestorContainer as HTMLElement : r.commonAncestorContainer.parentElement;
    const existing = host?.closest(tag);
    if (existing) {
      const parent = existing.parentNode!;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
    } else {
      const node = document.createElement(tag);
      node.appendChild(r.extractContents());
      r.insertNode(node);
      sel.removeAllRanges();
      const r2 = document.createRange();
      r2.selectNodeContents(node);
      sel.addRange(r2);
    }
    const ed = (host?.closest('.editable') as HTMLElement | null);
    ed?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /* ---------- paste ---------- */
  const handlePaste = (b: Block, e: React.ClipboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    if (b.type === 'code') {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      return;
    }
    const files = Array.from(e.clipboardData.files || []);
    const img = files.find((f) => f.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      readFileAsDataURL(img).then((url) => {
        const nb = newBlock('image', { url, indent: b.indent });
        if (!el.textContent) updateBlock(b.id, { type: 'image', url, html: '' });
        else insertAfter(b.id, nb, false);
      });
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const trimmed = text.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      if (!window.getSelection()?.isCollapsed) document.execCommand('createLink', false, trimmed);
      else document.execCommand('insertHTML', false, `<a href="${escapeHtml(trimmed)}">${escapeHtml(trimmed)}</a>&nbsp;`);
      return;
    }
    if (!text.includes('\n')) { document.execCommand('insertText', false, text); return; }
    const parsed = markdownToBlocks(text);
    if (!parsed.length) return;
    parsed.forEach((p) => (p.indent += b.indent));
    if (!el.textContent && b.type === 'text') {
      setBlocks(pageId, (arr) => {
        const i = arr.findIndex((x) => x.id === b.id);
        arr.splice(i, 1, ...parsed);
      });
    } else {
      setBlocks(pageId, (arr) => {
        const i = arr.findIndex((x) => x.id === b.id);
        arr.splice(i + 1, 0, ...parsed);
      });
    }
    const last = parsed[parsed.length - 1];
    if (TEXT_TYPES.includes(last.type)) focusBlock(last.id, 'end');
  };

  /* ---------- duplicate / move ---------- */
  const duplicateBlocks = (ids: string[]) => {
    const bs = blocksRef.current;
    let lastId: string | null = null;
    const pagesToDup: string[] = [];
    setBlocks(pageId, (arr) => {
      ids.forEach((id) => {
        const i = arr.findIndex((x) => x.id === id);
        if (i < 0) return;
        const end = subtreeEnd(arr as Block[], i);
        const copies = (arr.slice(i, end) as Block[]).filter((x) => x.type !== 'database').map((x) => {
          if (x.type === 'page' && x.pageId) { pagesToDup.push(x.pageId); return null; }
          return { ...JSON.parse(JSON.stringify(x)), id: uid() } as Block;
        }).filter(Boolean) as Block[];
        arr.splice(end, 0, ...copies);
        if (copies[0]) lastId = copies[0].id;
      });
    });
    pagesToDup.forEach((p) => duplicatePage(p));
    if (bs.some((x) => ids.includes(x.id) && x.type === 'database')) toast('資料庫區塊無法直接複製');
    if (lastId) {
      const nb = getState().pages[pageId].blocks.find((x) => x.id === lastId);
      if (nb && TEXT_TYPES.includes(nb.type) && selectedRef.current.length === 0) focusBlock(lastId, 'end');
      else setSelected([lastId]);
    }
  };

  const moveGroup = (id: string, targetId: string, pos: 'before' | 'after') => {
    if (id === targetId) return;
    setBlocks(pageId, (arr) => {
      const i = arr.findIndex((x) => x.id === id);
      if (i < 0) return;
      const end = subtreeEnd(arr as Block[], i);
      const group = arr.slice(i, end) as Block[];
      if (group.some((g) => g.id === targetId)) return;
      const rest = [...arr.slice(0, i), ...arr.slice(end)] as Block[];
      const j = rest.findIndex((x) => x.id === targetId);
      if (j < 0) return;
      const target = rest[j];
      let at = j;
      let indent = target.indent;
      if (pos === 'after') {
        at = (target.type === 'toggle' && !target.collapsed) || !(j + 1 < rest.length && rest[j + 1].indent > target.indent) ? j + 1 : subtreeEnd(rest, j);
        if (target.type === 'toggle' && !target.collapsed && at === j + 1) indent = target.indent + 1;
        else if (j + 1 < rest.length && rest[j + 1].indent > target.indent && at === j + 1) indent = rest[j + 1].indent;
      }
      const delta = indent - group[0].indent;
      group.forEach((g) => (g.indent = Math.max(0, g.indent + delta)));
      rest.splice(at, 0, ...group);
      return rest;
    });
  };

  const moveBlockByKey = (id: string, dir: -1 | 1) => {
    const vis = visibleRef.current.filter((v) => v.b.indent <= (visibleRef.current.find((x) => x.b.id === id)?.b.indent ?? 0));
    const vi = vis.findIndex((v) => v.b.id === id);
    const t = vis[vi + dir];
    if (!t) return;
    const el = elOf(id);
    const off = el ? getCaretOffset(el) : 0;
    moveGroup(id, t.b.id, dir < 0 ? 'before' : 'after');
    if (el) focusBlock(id, off);
  };

  /* ---------- block selection keyboard ---------- */
  useEffect(() => {
    if (!selected.length) return;
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (document.querySelector('.modal-backdrop .modal') && !rootRef.current?.closest('.modal')) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = selectedRef.current;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const vis = visibleRef.current;
        const firstIdx = vis.findIndex((v) => sel.includes(v.b.id));
        removeBlocks(sel);
        setSelected([]);
        const prev = vis[firstIdx - 1];
        if (prev && TEXT_TYPES.includes(prev.b.type)) focusBlock(prev.b.id, 'end');
      } else if (e.key === 'Escape') {
        setSelected([]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const b = blocksRef.current.find((x) => x.id === sel[sel.length - 1]);
        setSelected([]);
        if (b && TEXT_TYPES.includes(b.type)) focusBlock(b.id, 'end');
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const vis = visibleRef.current;
        const cur = sel[sel.length - 1];
        const vi = vis.findIndex((v) => v.b.id === cur);
        const t = vis[vi + (e.key === 'ArrowUp' ? -1 : 1)];
        if (!t) return;
        if (e.shiftKey) setSelected([...sel.filter((s) => s !== t.b.id), t.b.id]);
        else setSelected([t.b.id]);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateBlocks(sel);
      } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
        e.preventDefault();
        const p = getState().pages[pageId];
        const picked = { ...p, title: '', blocks: p.blocks.filter((b) => sel.includes(b.id)) };
        navigator.clipboard?.writeText(blocksToMarkdown(picked as Page, getState())).catch(() => {});
        if (e.key.toLowerCase() === 'x') { removeBlocks(sel); setSelected([]); }
        else toast('已複製區塊');
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(visibleRef.current.map((v) => v.b.id));
      } else if (e.key === 'Tab') {
        e.preventDefault();
        sel.forEach((id) => indentBlock(id, e.shiftKey ? -1 : 1));
      }
    };
    // attach on next tick so the key event that created the selection doesn't reach it
    const t = window.setTimeout(() => document.addEventListener('keydown', onKey), 0);
    return () => { window.clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [selected.length > 0]); // eslint-disable-line

  /* ---------- clear selection / rectangle select ---------- */
  useEffect(() => {
    if (readOnly) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.popover') || t.closest('.block-handle') || t.closest('.format-toolbar')) return;
      const scroller = rootRef.current?.closest('.page-scroller');
      if (selectedRef.current.length) setSelected([]);
      if (e.button !== 0 || !scroller || !scroller.contains(t)) return;
      if (t.closest('[contenteditable="true"],[contenteditable="plaintext-only"],button,input,textarea,a,.db,.page-header,.page-title,.block-body,select,.page-props,.comments-section,.cover')) return;
      const x0 = e.clientX, y0 = e.clientY;
      let started = false;
      const onMove = (ev: MouseEvent) => {
        if (!started && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
        started = true;
        ev.preventDefault();
        const rect = { x0, y0, x1: ev.clientX, y1: ev.clientY };
        setBox(rect);
        const top = Math.min(y0, ev.clientY), bottom = Math.max(y0, ev.clientY);
        const left = Math.min(x0, ev.clientX), right = Math.max(x0, ev.clientX);
        const ids: string[] = [];
        rootRef.current?.querySelectorAll<HTMLElement>(':scope > .block-row').forEach((row) => {
          const r = row.getBoundingClientRect();
          if (r.bottom > top && r.top < bottom && r.right > left && r.left < right) ids.push(row.dataset.blockId!);
        });
        setSelected(ids);
      };
      const onUp = () => {
        setBox(null);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [readOnly]);

  // close menu on blur
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.slash-menu')) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  /* ---------- drag & drop ---------- */
  const onDragStartHandle = (e: React.DragEvent, b: Block) => {
    draggingRef.current = b.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-lumen-block', JSON.stringify({ pageId, id: b.id }));
    const row = (e.currentTarget as HTMLElement).closest('.block-row') as HTMLElement;
    if (row) e.dataTransfer.setDragImage(row, 20, 12);
  };
  const onRowDragOver = (e: React.DragEvent, b: Block) => {
    if (!draggingRef.current && !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (!dragOver || dragOver.id !== b.id || dragOver.pos !== pos) setDragOver({ id: b.id, pos });
  };
  const onRowDrop = (e: React.DragEvent, b: Block) => {
    e.preventDefault();
    const pos = dragOver?.pos || 'after';
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      Promise.all(files.map(readFileAsDataURL)).then((urls) => {
        const nbs = urls.map((url) => newBlock('image', { url, indent: b.indent }));
        setBlocks(pageId, (arr) => {
          const i = arr.findIndex((x) => x.id === b.id);
          arr.splice(pos === 'before' ? i : i + 1, 0, ...nbs);
        });
      });
      return;
    }
    const id = draggingRef.current;
    draggingRef.current = null;
    if (id) moveGroup(id, b.id, pos);
  };

  /* ---------- render ---------- */
  const openSlashAt = (id: string) => {
    const el = elOf(id);
    if (!el) return;
    setCaret(el, 'end');
    document.execCommand('insertText', false, '/');
  };

  const addBelow = (b: Block, e: React.MouseEvent) => {
    const nb = newBlock('text', { indent: b.indent });
    const isEmptyText = b.type === 'text' && !b.html;
    if (e.altKey) {
      setBlocks(pageId, (arr) => { const i = arr.findIndex((x) => x.id === b.id); arr.splice(i, 0, nb); });
      focusBlock(nb.id, 'start');
      return;
    }
    if (isEmptyText) { setTimeout(() => openSlashAt(b.id), 0); return; }
    insertAfter(b.id, nb, false);
    setTimeout(() => openSlashAt(nb.id), 30);
  };

  const renderEditable = (b: Block, className: string, extra: React.ReactNode = null) => (
    <>
      {extra}
      <Editable
        html={b.html}
        className={className + ' nav'}
        plain={b.type === 'code'}
        readOnly={readOnly}
        spellCheck={b.type !== 'code'}
        placeholder={PLACEHOLDERS[b.type]}
        onChange={(html, e, el) => handleInput(b, html, e, el)}
        onKeyDown={(e, el) => handleKeyDown(b, e, el)}
        onPaste={(e, el) => handlePaste(b, e, el)}
      />
    </>
  );

  const renderContent = (v: { b: Block; num: number; hasChildren: boolean }) => {
    const { b, num } = v;
    const depth = b.indent;
    switch (b.type) {
      case 'text': return renderEditable(b, 'blk-text');
      case 'h1': case 'h2': case 'h3': return renderEditable(b, 'blk-' + b.type);
      case 'quote': return <div className="blk-quote">{renderEditable(b, '')}</div>;
      case 'bulleted': return <div className="blk-list"><span className="list-marker bullet"><span>{BULLETS[depth % 3]}</span></span>{renderEditable(b, '')}</div>;
      case 'numbered': return <div className="blk-list"><span className="list-marker num">{numberLabel(num, depth)}</span>{renderEditable(b, '')}</div>;
      case 'todo':
        return (
          <div className={'blk-list blk-todo' + (b.checked ? ' checked' : '')}>
            <span className="list-marker">
              <span className={'checkbox' + (b.checked ? ' on' : '')} onClick={() => !readOnly && updateBlock(b.id, { checked: !b.checked })}>
                {b.checked && <Icon.check size={12} />}
              </span>
            </span>
            {renderEditable(b, '')}
          </div>
        );
      case 'toggle':
        return (
          <div className="blk-list blk-toggle">
            <span className="list-marker">
              <span className={'toggle-arrow' + (b.collapsed ? '' : ' open')} onClick={() => updateBlock(b.id, { collapsed: !b.collapsed }, 'silent')}>
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2.5l4.5 3.5L4 9.5z" fill="currentColor" /></svg>
              </span>
            </span>
            {renderEditable(b, '')}
          </div>
        );
      case 'callout':
        return (
          <div className={'blk-callout ' + (b.color?.endsWith('_bg') ? '' : 'bordered')}>
            <span className="callout-icon" onClick={(e) => !readOnly && setIconPicker({ id: b.id, anchor: e.currentTarget as HTMLElement })}>{b.icon || '💡'}</span>
            {renderEditable(b, '')}
          </div>
        );
      case 'code':
        return (
          <div className="blk-code">
            <div className="code-head">
              <select value={b.lang || 'plain'} disabled={readOnly} onChange={(e) => updateBlock(b.id, { lang: e.target.value })}>
                {['plain', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'html', 'css', 'json', 'sql', 'bash', 'markdown', 'php', 'ruby', 'swift', 'kotlin', 'yaml'].map((l) => <option key={l} value={l}>{l === 'plain' ? '純文字' : l}</option>)}
              </select>
              <button className="btn-ghost sm code-copy" onClick={() => { navigator.clipboard?.writeText(b.html); toast('已複製程式碼'); }}><Icon.copy size={13} /> 複製</button>
            </div>
            {renderEditable(b, 'code-area')}
          </div>
        );
      case 'divider':
        return <div className="blk-divider" onClick={() => setSelected([b.id])}><hr /></div>;
      default:
        return <BlockContentExtra block={b} pageId={pageId} readOnly={!!readOnly} update={(patch) => updateBlock(b.id, patch)} select={() => setSelected([b.id])} />;
    }
  };

  const slashItems = menu?.kind === 'slash' ? filterSlash(menu.query) : [];

  return (
    <div className="editor" ref={rootRef} data-page-id={pageId}>
      {visible.map((v) => {
        const b = v.b;
        const colorCls = b.color ? (b.color.endsWith('_bg') ? ' bg-' + b.color.replace('_bg', '') : ' c-' + b.color) : '';
        const isSel = selected.includes(b.id);
        return (
          <div
            key={b.id}
            className={`block-row t-${b.type}${isSel ? ' selected' : ''}${colorCls}`}
            data-block-id={b.id}
            style={{ marginLeft: b.indent * 26 }}
            onDragOver={(e) => onRowDragOver(e, b)}
            onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver((d) => (d?.id === b.id ? null : d)); }}
            onDrop={(e) => onRowDrop(e, b)}
          >
            {!readOnly && (
              <div className="block-handle" contentEditable={false}>
                <button className="handle-btn" title="點擊在下方新增區塊，Alt+點擊在上方新增" onClick={(e) => addBelow(b, e)}><Icon.plus size={16} /></button>
                <div
                  className="handle-btn drag"
                  draggable
                  title="拖曳以移動，點擊開啟選單"
                  onDragStart={(e) => onDragStartHandle(e, b)}
                  onDragEnd={() => { draggingRef.current = null; setDragOver(null); }}
                  onClick={(e) => {
                    if (e.shiftKey) setSelected((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id]));
                    else { setSelected([b.id]); setBlockMenu({ id: b.id, anchor: e.currentTarget as HTMLElement }); }
                  }}
                >
                  <Icon.drag size={14} />
                </div>
              </div>
            )}
            <div className="block-body">{renderContent(v)}</div>
            {b.type === 'toggle' && !b.collapsed && !v.hasChildren && !readOnly && (
              <div className="toggle-empty" onClick={() => insertAfter(b.id, newBlock('text', { indent: b.indent + 1 }))}>空的切換清單。點擊以新增區塊。</div>
            )}
            {dragOver?.id === b.id && <div className={'drop-line ' + dragOver.pos} />}
          </div>
        );
      })}
      {menu?.kind === 'slash' && (
        <SlashMenu rect={menu.rect} items={slashItems} active={menuIdx} onHover={setMenuIdx} onPick={applySlash} />
      )}
      {menu?.kind === 'mention' && (
        <MentionMenu rect={menu.rect} items={mentionItems} active={menuIdx} onHover={setMenuIdx} onPick={applyMention} />
      )}
      {blockMenu && (() => {
        const b = blocks.find((x) => x.id === blockMenu.id);
        if (!b) return null;
        return (
          <BlockMenu
            block={b}
            pageId={pageId}
            anchor={blockMenu.anchor}
            onClose={() => setBlockMenu(null)}
            onDelete={() => { removeBlocks(selected.length > 1 ? selected : [b.id]); setSelected([]); setBlockMenu(null); }}
            onDuplicate={() => { duplicateBlocks(selected.length > 1 ? selected : [b.id]); setBlockMenu(null); }}
            onTurnInto={(t) => { turnInto(b.id, t); setBlockMenu(null); setSelected([]); }}
            onColor={(c) => { (selected.length > 1 ? selected : [b.id]).forEach((id) => updateBlock(id, { color: c === 'default' ? undefined : c })); setBlockMenu(null); }}
          />
        );
      })()}
      {iconPicker && (
        <EmojiPicker anchor={iconPicker.anchor} onClose={() => setIconPicker(null)} onSelect={(e) => updateBlock(iconPicker.id, { icon: e })} />
      )}
      {box && (
        <div className="select-box" style={{
          left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1),
          width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0),
        }} />
      )}
    </div>
  );
}
