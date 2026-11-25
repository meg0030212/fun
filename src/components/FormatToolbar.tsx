import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isImeKey } from '../ime';
import { createPortal } from 'react-dom';
import type { BlockType } from '../types';
import { setBlocks, getState } from '../store';
import { COLORS, COLOR_NAMES, escapeHtml, htmlToText, safeUrl } from '../utils';
import { TURN_INTO, TEXT_TYPES } from '../blockTypes';
import { Icon } from './Icons';

interface TB { rect: DOMRect; ed: HTMLElement }

function editableOfSelection(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const node = r.commonAncestorContainer;
  const host = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
  const ed = host?.closest('.editable') as HTMLElement | null;
  if (!ed || ed.classList.contains('plain') || ed.getAttribute('contenteditable') !== 'true') return null;
  if (!sel.toString().trim()) return null;
  return ed;
}

function fire(ed: HTMLElement) {
  ed.dispatchEvent(new Event('input', { bubbles: true }));
}

function unwrapColors(root: ParentNode) {
  root.querySelectorAll('span').forEach((s) => {
    if (Array.from(s.classList).some((c) => /^(c|bg)-/.test(c))) {
      const p = s.parentNode!;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
    }
  });
}

export function FormatToolbar() {
  const [tb, setTb] = useState<TB | null>(null);
  const [mode, setMode] = useState<'main' | 'link' | 'color' | 'turn'>('main');
  const [url, setUrl] = useState('');
  const [, force] = useState(0);
  const saved = useRef<Range | null>(null);
  const mouseDown = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const recompute = () => {
      if (modeRef.current === 'link') return;
      if (mouseDown.current) return;
      const ed = editableOfSelection();
      if (!ed) { setTb(null); setMode('main'); return; }
      const r = window.getSelection()!.getRangeAt(0);
      setTb({ rect: r.getBoundingClientRect(), ed });
      force((x) => x + 1);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      mouseDown.current = true;
      if (modeRef.current !== 'main') setMode('main');
      setTb(null);
    };
    const onUp = () => { mouseDown.current = false; setTimeout(recompute, 0); };
    const onLink = () => {
      const ed = editableOfSelection();
      if (!ed) return;
      saved.current = window.getSelection()!.getRangeAt(0).cloneRange();
      setTb({ rect: saved.current.getBoundingClientRect(), ed });
      setUrl('');
      setMode('link');
    };
    document.addEventListener('selectionchange', recompute);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('lumen:link', onLink);
    const onScroll = () => { if (modeRef.current === 'main') recompute(); };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('selectionchange', recompute);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('lumen:link', onLink);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tb || !ref.current) { setPos(null); return; }
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let left = tb.rect.left + tb.rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = tb.rect.top - h - 8;
    if (top < 8) top = tb.rect.bottom + 8;
    setPos({ left, top });
  }, [tb, mode]);

  if (!tb) return null;

  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); fire(tb.ed); force((x) => x + 1); };
  const state = (cmd: string) => { try { return document.queryCommandState(cmd); } catch { return false; } };
  const inCode = () => {
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    return !!(n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)?.closest('code'));
  };

  const toggleCode = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const n = r.commonAncestorContainer;
    const existing = (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)?.closest('code');
    if (existing && tb.ed.contains(existing)) {
      const p = existing.parentNode!;
      while (existing.firstChild) p.insertBefore(existing.firstChild, existing);
      p.removeChild(existing);
    } else {
      const code = document.createElement('code');
      code.textContent = r.toString();
      r.deleteContents();
      r.insertNode(code);
      const r2 = document.createRange();
      r2.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(r2);
    }
    fire(tb.ed);
  };

  const applyColor = (cls: string | null) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const frag = r.extractContents();
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    unwrapColors(wrap);
    const nodes = Array.from(wrap.childNodes);
    if (cls) {
      const span = document.createElement('span');
      span.className = cls;
      nodes.forEach((n) => span.appendChild(n));
      r.insertNode(span);
      const r2 = document.createRange();
      r2.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      const f2 = document.createDocumentFragment();
      nodes.forEach((n) => f2.appendChild(n));
      r.insertNode(f2);
    }
    fire(tb.ed);
    setMode('main');
  };

  const submitLink = () => {
    const sel = window.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    if (url.trim()) document.execCommand('createLink', false, safeUrl(url.trim()));
    else document.execCommand('unlink');
    fire(tb.ed);
    setMode('main');
    setTb(null);
  };

  const blockEl = tb.ed.closest('[data-block-id]') as HTMLElement | null;
  const pageEl = tb.ed.closest('[data-page-id]') as HTMLElement | null;
  const blockId = blockEl?.dataset.blockId;
  const pageId = pageEl?.dataset.pageId;
  const block = blockId && pageId ? getState().pages[pageId]?.blocks.find((b) => b.id === blockId) : undefined;
  const canTurn = !!block && TEXT_TYPES.includes(block.type) && tb.ed.classList.contains('nav');

  const turnInto = (t: BlockType) => {
    if (!pageId || !blockId) return;
    setBlocks(pageId, (bs) => {
      const b = bs.find((x) => x.id === blockId);
      if (!b) return;
      if (t === 'code' && b.type !== 'code') b.html = htmlToText(b.html);
      if (b.type === 'code' && t !== 'code') b.html = escapeHtml(b.html);
      b.type = t;
      if (t === 'todo' && b.checked === undefined) b.checked = false;
      if (t === 'callout') { b.icon = b.icon || '💡'; b.color = b.color || 'gray_bg'; }
    });
    setTb(null);
    setMode('main');
  };

  const linkHref = (() => {
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    const a = n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)?.closest('a');
    return a?.getAttribute('href') || '';
  })();

  return createPortal(
    <div ref={ref} className="format-toolbar" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault(); }}>
      {mode === 'link' ? (
        <div className="ft-link">
          <input className="input sm" autoFocus placeholder="貼上連結或留空以移除" value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeKey(e))) { e.preventDefault(); submitLink(); } if (e.key === 'Escape') { setMode('main'); setTb(null); } }} />
          <button className="btn-primary sm" onClick={submitLink}>{url.trim() ? '確定' : '移除'}</button>
        </div>
      ) : (
        <div className="ft-row">
          {canTurn && (
            <button className="ft-btn text" onClick={() => setMode(mode === 'turn' ? 'main' : 'turn')}>
              {TURN_INTO.find((t) => t.type === block!.type)?.label || '文字'} <Icon.chevronDown size={10} />
            </button>
          )}
          <button className="ft-btn text" onClick={() => {
            const sel = window.getSelection();
            if (sel?.rangeCount) saved.current = sel.getRangeAt(0).cloneRange();
            setUrl(linkHref);
            setMode('link');
          }}><Icon.link size={14} /> 連結</button>
          <span className="ft-sep" />
          <button className={'ft-btn' + (state('bold') ? ' on' : '')} title="粗體 Ctrl+B" onClick={() => exec('bold')}><b>B</b></button>
          <button className={'ft-btn' + (state('italic') ? ' on' : '')} title="斜體 Ctrl+I" onClick={() => exec('italic')}><i style={{ fontFamily: 'Georgia, serif' }}>i</i></button>
          <button className={'ft-btn' + (state('underline') ? ' on' : '')} title="底線 Ctrl+U" onClick={() => exec('underline')}><u>U</u></button>
          <button className={'ft-btn' + (state('strikeThrough') ? ' on' : '')} title="刪除線 Ctrl+Shift+S" onClick={() => exec('strikeThrough')}><s>S</s></button>
          <button className={'ft-btn' + (inCode() ? ' on' : '')} title="行內程式碼 Ctrl+E" onClick={toggleCode}><span className="mono" style={{ fontSize: 12 }}>&lt;/&gt;</span></button>
          <span className="ft-sep" />
          <button className="ft-btn text" title="文字顏色" onClick={() => setMode(mode === 'color' ? 'main' : 'color')}><span className="color-a">A</span><Icon.chevronDown size={10} /></button>
          <button className="ft-btn" title="清除格式" onClick={() => { exec('removeFormat'); exec('unlink'); applyColor(null); }}><Icon.x size={13} /></button>
        </div>
      )}
      {mode === 'color' && (
        <div className="ft-drop">
          <div className="menu-header">文字顏色</div>
          {COLORS.map((c) => (
            <div key={c} className="menu-item" onClick={() => applyColor(c === 'default' ? null : 'c-' + c)}>
              <span className={'color-a c-' + c}>A</span><span className="menu-label">{COLOR_NAMES[c]}</span>
            </div>
          ))}
          <div className="menu-header">背景顏色</div>
          {COLORS.slice(1).map((c) => (
            <div key={c + 'bg'} className="menu-item" onClick={() => applyColor('bg-' + c)}>
              <span className={'color-a bgbox bg-' + c}>A</span><span className="menu-label">{COLOR_NAMES[c]}背景</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'turn' && (
        <div className="ft-drop">
          <div className="menu-header">轉換成</div>
          {TURN_INTO.map((t) => (
            <div key={t.type} className="menu-item" onClick={() => turnInto(t.type)}>
              <span className="thumb-sm">{t.thumb}</span><span className="menu-label">{t.label}</span>
              {block?.type === t.type && <span className="menu-right"><Icon.check size={13} /></span>}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
