import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { getCaretOffset, setCaret } from '../utils';
import { getState } from '../store';
import { navigate } from '../ui';

interface Props {
  html: string;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  plain?: boolean;
  onChange?: (html: string, e: React.FormEvent<HTMLDivElement>, el: HTMLDivElement) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>, el: HTMLDivElement) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
  spellCheck?: boolean;
}

function refreshMentions(el: HTMLElement) {
  const s = getState();
  el.querySelectorAll('a.mention[data-page-id]').forEach((a) => {
    const p = s.pages[(a as HTMLElement).dataset.pageId!];
    const label = a.querySelector('.mention-title');
    if (p && label && label.textContent !== (p.title || '未命名')) label.textContent = p.title || '未命名';
    if (!p) a.classList.add('deleted');
  });
}

export const Editable = forwardRef<HTMLDivElement | null, Props>(function Editable(
  { html, className, placeholder, readOnly, plain, onChange, onKeyDown, onPaste, onFocus, onBlur, style, spellCheck = true }, fwd,
) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  // true while an input method (注音、拼音…) is composing: never touch the DOM then
  const composing = useRef(false);
  useImperativeHandle(fwd, () => ref.current as HTMLDivElement);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (last.current === html) return;
    if (composing.current) return; // rewriting now would make the IME insert its text again
    const cur = plain ? el.textContent : el.innerHTML;
    if (cur === html) { last.current = html; return; }
    const focused = document.activeElement === el;
    const off = focused ? getCaretOffset(el) : 0;
    if (plain) el.textContent = html; else el.innerHTML = html;
    if (!plain) refreshMentions(el);
    last.current = html;
    if (focused) setCaret(el, Math.min(off, (el.textContent || '').length));
  }, [html, plain]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = ref.current!;
    // save once, after the candidate is confirmed (see onCompositionEnd)
    if (composing.current || (e.nativeEvent as InputEvent).isComposing) return;
    if (!plain && (el.innerHTML === '<br>' || el.innerHTML === '<div><br></div>')) el.innerHTML = '';
    const v = plain ? (el.textContent || '') : el.innerHTML;
    last.current = v;
    onChange?.(v, e, el);
  };

  const handleClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const a = t.closest('a') as HTMLAnchorElement | null;
    if (a) {
      e.preventDefault();
      if (a.classList.contains('mention') && a.dataset.pageId) navigate(a.dataset.pageId);
      else if (a.getAttribute('href')) window.open(a.href, '_blank', 'noopener');
    }
  };

  return (
    <div
      ref={ref}
      className={'editable' + (plain ? ' plain' : '') + (className ? ' ' + className : '')}
      contentEditable={readOnly ? false : (plain ? ('plaintext-only' as any) : true)}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      spellCheck={spellCheck}
      onInput={handleInput}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => {
        composing.current = false;
        // the browser has inserted the confirmed text by now: save it once
        handleInput(e as unknown as React.FormEvent<HTMLDivElement>);
      }}
      onKeyDown={(e) => onKeyDown?.(e, ref.current!)}
      onPaste={(e) => onPaste?.(e, ref.current!)}
      onClick={handleClick}
      onFocus={onFocus}
      onBlur={onBlur}
      style={style}
    />
  );
});
