import React, { useState } from 'react';
import type { FontStyle, Page } from '../types';
import { duplicatePage, getState, patchPage, trashPage, undo, updateSettings, useStore } from '../store';
import { navigate, pageLink, setUI, toast, useUI } from '../ui';
import { Icon } from './Icons';
import { PageIcon } from './EmojiPicker';
import { MenuItem, MenuSep, Popover, Toggle } from './Popover';
import { downloadFile, formatDateTime, htmlToText, timeAgo } from '../utils';
import { blocksToHtmlDoc, blocksToMarkdown } from '../markdown';
import { MoveToPopover, importMarkdown } from './Sidebar';

export function ancestors(id: string): Page[] {
  const s = getState();
  const out: Page[] = [];
  let cur: Page | undefined = s.pages[id];
  let guard = 0;
  while (cur && guard++ < 50) {
    out.unshift(cur);
    if (cur.rowOf) { cur = s.pages[s.dbs[cur.rowOf]?.hostPageId]; continue; }
    cur = cur.parentId ? s.pages[cur.parentId] : undefined;
  }
  return out;
}

export function Topbar() {
  const route = useUI((u) => u.route);
  const sidebarOpen = useStore((s) => s.settings.sidebarOpen);
  const page = useStore((s) => s.pages[route]);
  useStore((s) => s.pages); // re-render on title changes
  const commentsOpen = useUI((u) => u.comments);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [share, setShare] = useState<HTMLElement | null>(null);

  const crumbs = page ? ancestors(page.id) : [];
  const shown = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs;

  return (
    <header className="topbar">
      {!sidebarOpen && (
        <button className="btn-icon" title="開啟側邊欄 (Ctrl+\)" onClick={() => updateSettings({ sidebarOpen: true })}><Icon.menu size={16} /></button>
      )}
      <nav className="crumbs">
        {route === 'home' && <span className="crumb static"><Icon.home size={14} /> 首頁</span>}
        {shown.map((p, i) => (
          <React.Fragment key={p ? p.id : 'ellipsis'}>
            {i > 0 && <span className="crumb-sep">/</span>}
            {p ? (
              <span className="crumb" onClick={() => navigate(p.id)}>
                <PageIcon icon={p.icon} size={14} fallback={false} />
                <span className="crumb-title">{p.title || '未命名'}</span>
              </span>
            ) : <span className="crumb static">…</span>}
          </React.Fragment>
        ))}
        {page?.locked && <span className="lock-badge"><Icon.lock size={12} /> 已鎖定</span>}
      </nav>
      <span className="spacer" />
      {page && (
        <div className="top-actions">
          <span className="edited muted small hide-sm" title={formatDateTime(page.updatedAt)}>編輯於 {timeAgo(page.updatedAt)}</span>
          <button className="btn-ghost sm" onClick={(e) => setShare(e.currentTarget)}>分享</button>
          <button className={'btn-icon' + (commentsOpen ? ' on' : '')} title="留言" onClick={() => setUI({ comments: !commentsOpen })}>
            <Icon.comment size={16} />
          </button>
          <button className="btn-icon" title={page.favorite ? '從我的最愛中移除' : '加入我的最愛'} onClick={() => patchPage(page.id, { favorite: !page.favorite }, 'silent')}>
            {page.favorite ? <Icon.starFilled size={16} /> : <Icon.star size={16} />}
          </button>
          <button className="btn-icon" title="樣式、匯出等更多操作" onClick={(e) => setMenu(e.currentTarget)}><Icon.more size={18} /></button>
        </div>
      )}
      {menu && page && <PageMenu page={page} anchor={menu} onClose={() => setMenu(null)} />}
      {share && page && (
        <Popover anchor={share} onClose={() => setShare(null)} width={360} align="right">
          <div className="share-pop">
            <div className="strong">分享「{page.title || '未命名'}」</div>
            <div className="muted small" style={{ margin: '6px 0 12px' }}>此工作區儲存在你的瀏覽器中。連結可用於在此裝置上快速開啟頁面；若要分享內容給他人，請匯出為 Markdown 或 HTML。</div>
            <div className="share-row">
              <input className="input" readOnly value={pageLink(page.id)} onFocus={(e) => e.target.select()} />
              <button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(pageLink(page.id)); toast('已複製連結'); }}>複製連結</button>
            </div>
            <div className="share-row" style={{ marginTop: 10 }}>
              <button className="btn-outline sm" onClick={() => downloadFile(`${page.title || '未命名'}.md`, blocksToMarkdown(page, getState()), 'text/markdown')}>匯出 Markdown</button>
              <button className="btn-outline sm" onClick={() => downloadFile(`${page.title || '未命名'}.html`, blocksToHtmlDoc(page, getState()), 'text/html')}>匯出 HTML</button>
              <button className="btn-outline sm" onClick={() => { setShare(null); setTimeout(() => window.print(), 100); }}>列印 / PDF</button>
            </div>
          </div>
        </Popover>
      )}
    </header>
  );
}

function PageMenu({ page, anchor, onClose }: { page: Page; anchor: HTMLElement; onClose: () => void }) {
  const [moveTo, setMoveTo] = useState<HTMLElement | null>(null);
  const words = page.blocks.reduce((a, b) => a + htmlToText(b.html).replace(/\s+/g, '').length, 0);
  const fonts: { k: FontStyle; label: string; sample: string }[] = [
    { k: 'default', label: '預設', sample: 'Ag' }, { k: 'serif', label: '襯線', sample: 'Ag' }, { k: 'mono', label: '等寬', sample: 'Ag' },
  ];
  return (
    <Popover anchor={anchor} onClose={onClose} width={260} align="right">
      <div className="font-picker">
        {fonts.map((f) => (
          <div key={f.k} className={'font-opt' + ((page.font || 'default') === f.k ? ' active' : '')} onClick={() => patchPage(page.id, { font: f.k })}>
            <div className={'font-sample font-' + f.k}>{f.sample}</div>
            <div className="small muted">{f.label}</div>
          </div>
        ))}
      </div>
      <MenuSep />
      <MenuItem icon={<Icon.link />} label="複製連結" onClick={() => { navigator.clipboard?.writeText(pageLink(page.id)); toast('已複製連結'); onClose(); }} />
      <MenuItem icon={<Icon.duplicate />} label="建立副本" onClick={() => { const id = duplicatePage(page.id); onClose(); if (id) navigate(id); }} />
      {!page.rowOf && <MenuItem icon={<Icon.move />} label="移至" onClick={(e) => setMoveTo(e.currentTarget as HTMLElement)} />}
      <MenuItem icon={<Icon.trash />} label="移至垃圾桶" danger onClick={() => { trashPage(page.id); toast('已移至垃圾桶'); onClose(); }} />
      <MenuSep />
      <MenuItem icon={<span className="txt-icon">aA</span>} label="小字體" right={<Toggle on={!!page.smallText} />} onClick={() => patchPage(page.id, { smallText: !page.smallText })} />
      {!page.dbId && <MenuItem icon={<Icon.width />} label="全寬" right={<Toggle on={!!page.fullWidth} />} onClick={() => patchPage(page.id, { fullWidth: !page.fullWidth })} />}
      <MenuItem icon={page.locked ? <Icon.lock /> : <Icon.unlock />} label="鎖定頁面" right={<Toggle on={!!page.locked} />} onClick={() => patchPage(page.id, { locked: !page.locked })} />
      <MenuSep />
      <MenuItem icon={<Icon.undo />} label="復原" right="Ctrl+Z" onClick={() => { undo(); onClose(); }} />
      {!page.dbId && <MenuItem icon={<Icon.import />} label="匯入 Markdown 為子頁面" onClick={() => { importMarkdown(page.id); onClose(); }} />}
      <MenuItem icon={<Icon.export />} label="匯出為 Markdown" onClick={() => { downloadFile(`${page.title || '未命名'}.md`, blocksToMarkdown(page, getState()), 'text/markdown'); onClose(); }} />
      <MenuItem icon={<Icon.export />} label="匯出為 HTML" onClick={() => { downloadFile(`${page.title || '未命名'}.html`, blocksToHtmlDoc(page, getState()), 'text/html'); onClose(); }} />
      <MenuSep />
      <div className="menu-foot">
        字數：{words}<br />
        上次編輯：{formatDateTime(page.updatedAt)}<br />
        建立時間：{formatDateTime(page.createdAt)}
      </div>
      {moveTo && <MoveToPopover page={page} anchor={moveTo} onClose={() => { setMoveTo(null); onClose(); }} />}
    </Popover>
  );
}
