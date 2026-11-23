import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SlashItem } from '../blockTypes';
import { PageIcon } from './EmojiPicker';

function useMenuPos(rect: DOMRect, ref: React.RefObject<HTMLDivElement>) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight, w = el.offsetWidth;
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    let left = rect.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setPos({ left, top });
  }, [rect]);
  return pos;
}

export function SlashMenu({ rect, items, active, onHover, onPick }: {
  rect: DOMRect; items: SlashItem[]; active: number; onHover: (i: number) => void; onPick: (i: SlashItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMenuPos(rect, ref);
  useEffect(() => {
    ref.current?.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  let lastSection = '';
  return createPortal(
    <div ref={ref} className="popover slash-menu" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 && <div className="menu-empty">沒有結果</div>}
      {items.map((it, i) => {
        const header = it.section !== lastSection ? <div className="menu-header" key={'h' + it.section}>{it.section}</div> : null;
        lastSection = it.section;
        return (
          <React.Fragment key={it.key}>
            {header}
            <div className={'slash-item' + (i === active ? ' active' : '')} onMouseEnter={() => onHover(i)} onClick={() => onPick(it)}>
              <div className="slash-thumb">{it.thumb}</div>
              <div className="slash-text">
                <div className="slash-label">{it.label}</div>
                <div className="slash-desc">{it.desc}</div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
}

export type MentionItem =
  | { kind: 'page'; label: string; icon?: string; pageId: string }
  | { kind: 'date'; label: string; sub: string; date: string }
  | { kind: 'new'; label: string; title: string; pageId?: undefined };

export function MentionMenu({ rect, items, active, onHover, onPick }: {
  rect: DOMRect; items: MentionItem[]; active: number; onHover: (i: number) => void; onPick: (i: MentionItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMenuPos(rect, ref);
  let last = '';
  return createPortal(
    <div ref={ref} className="popover slash-menu mention-menu" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 && <div className="menu-empty">沒有結果</div>}
      {items.map((it, i) => {
        const sec = it.kind === 'page' ? '連結到頁面' : it.kind === 'date' ? '日期' : '新增';
        const header = sec !== last ? <div className="menu-header" key={'h' + sec}>{sec}</div> : null;
        last = sec;
        return (
          <React.Fragment key={i}>
            {header}
            <div className={'menu-item' + (i === active ? ' active' : '')} onMouseEnter={() => onHover(i)} onClick={() => onPick(it)}>
              <span className="menu-icon">{it.kind === 'page' ? <PageIcon icon={it.icon} size={16} /> : it.kind === 'date' ? '📅' : '＋'}</span>
              <span className="menu-label">{it.label}</span>
              {it.kind === 'date' && <span className="menu-right">{it.sub}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
}
