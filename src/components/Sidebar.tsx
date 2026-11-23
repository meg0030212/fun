import React, { useEffect, useMemo, useState } from 'react';
import type { Page } from '../types';
import {
  createPage, deletePageForever, duplicatePage, emptyTrash, getState, isTrashed, movePage, patchPage, restorePage, trashPage,
  updateSettings, useStore,
} from '../store';
import { navigate, pageLink, setUI, toast, useUI } from '../ui';
import { Icon } from './Icons';
import { PageIcon } from './EmojiPicker';
import { MenuItem, MenuSep, Popover, MenuHeader, Anchor } from './Popover';
import { timeAgo, pickFile, readFileAsText } from '../utils';
import { markdownToBlocks } from '../markdown';

const EXP_KEY = 'lumen-sidebar-expanded';
function loadExpanded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(EXP_KEY) || '{}'); } catch { return {}; }
}

export function childrenOf(pages: Record<string, Page>, parentId: string | null) {
  return Object.values(pages).filter((p) => p.parentId === parentId && !p.rowOf && !p.trashed).sort((a, b) => a.sort - b.sort);
}

export async function importMarkdown(parentId: string | null) {
  const f = await pickFile('.md,.markdown,.txt,text/markdown,text/plain');
  if (!f) return;
  const text = await readFileAsText(f);
  let title = f.name.replace(/\.(md|markdown|txt)$/i, '');
  const m = /^#\s+(.+)\n/.exec(text);
  let body = text;
  if (m) { title = m[1].trim(); body = text.slice(m[0].length); }
  const blocks = markdownToBlocks(body);
  const id = createPage({ parentId, title, blocks: blocks.length ? blocks : undefined, addLinkInParent: true });
  navigate(id);
  toast('已匯入「' + title + '」');
}

export function Sidebar() {
  const pages = useStore((s) => s.pages);
  const settings = useStore((s) => s.settings);
  const route = useUI((u) => u.route);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded);
  const [wsMenu, setWsMenu] = useState<HTMLElement | null>(null);
  const [trashPop, setTrashPop] = useState<HTMLElement | null>(null);
  const [privateOpen, setPrivateOpen] = useState(true);
  const [favOpen, setFavOpen] = useState(true);

  useEffect(() => { try { localStorage.setItem(EXP_KEY, JSON.stringify(expanded)); } catch { /* ignore */ } }, [expanded]);

  // auto-expand ancestors of current page
  useEffect(() => {
    const s = getState();
    let cur = s.pages[route];
    if (cur?.rowOf) cur = s.pages[s.dbs[cur.rowOf]?.hostPageId];
    const add: Record<string, boolean> = {};
    let guard = 0;
    while (cur && cur.parentId && guard++ < 50) { add[cur.parentId] = true; cur = s.pages[cur.parentId]; }
    if (Object.keys(add).some((k) => !expanded[k])) setExpanded((e) => ({ ...e, ...add }));
  }, [route]); // eslint-disable-line

  const roots = useMemo(() => childrenOf(pages, null), [pages]);
  const favs = useMemo(() => Object.values(pages).filter((p) => p.favorite && !isTrashed(p.id)).sort((a, b) => a.sort - b.sort), [pages]);

  const newPage = (parentId: string | null = null) => {
    const id = createPage({ parentId, addLinkInParent: true });
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
    navigate(id);
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = settings.sidebarWidth;
    const move = (ev: MouseEvent) => updateSettings({ sidebarWidth: Math.max(200, Math.min(480, w0 + ev.clientX - x0)) });
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); };
    document.body.classList.add('resizing');
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return (
    <aside className="sidebar" style={{ width: settings.sidebarWidth }}>
      <div className="sb-top">
        <div className="ws-switch" onClick={(e) => setWsMenu(e.currentTarget)}>
          <span className="ws-avatar">{(settings.workspaceName || 'L').slice(0, 1)}</span>
          <span className="ws-name">{settings.workspaceName}</span>
          <Icon.chevronDown size={12} />
        </div>
        <button className="btn-icon sb-collapse" title="關閉側邊欄 (Ctrl+\)" onClick={() => updateSettings({ sidebarOpen: false })}><Icon.chevronsLeft size={16} /></button>
        <button className="btn-icon" title="新增頁面" onClick={() => newPage(null)}><Icon.edit size={16} /></button>
      </div>
      <div className="sb-nav">
        <SbItem icon={<Icon.search />} label="搜尋" onClick={() => setUI({ search: true })} right={<span className="kbd">Ctrl K</span>} />
        <SbItem icon={<Icon.home />} label="首頁" active={route === 'home'} onClick={() => navigate('home')} />
        <SbItem icon={<Icon.settings />} label="設定" onClick={() => setUI({ settings: true })} />
      </div>
      <div className="sb-scroll">
        {favs.length > 0 && (
          <div className="sb-section">
            <div className="sb-section-head" onClick={() => setFavOpen((o) => !o)}><span>我的最愛</span></div>
            {favOpen && favs.map((p) => <TreeItem key={'fav' + p.id} page={p} depth={0} expanded={expanded} setExpanded={setExpanded} onAdd={newPage} keyPrefix="fav" />)}
          </div>
        )}
        <div className="sb-section">
          <div className="sb-section-head" onClick={() => setPrivateOpen((o) => !o)}>
            <span>私人</span>
            <span className="sb-section-actions">
              <button className="btn-icon xs" title="新增頁面" onClick={(e) => { e.stopPropagation(); newPage(null); }}><Icon.plus size={14} /></button>
            </span>
          </div>
          {privateOpen && (
            <RootDropZone>
              {roots.map((p) => <TreeItem key={p.id} page={p} depth={0} expanded={expanded} setExpanded={setExpanded} onAdd={newPage} />)}
              {roots.length === 0 && <div className="sb-empty">尚無頁面</div>}
              <SbItem icon={<Icon.plus />} label="新增頁面" muted onClick={() => newPage(null)} />
            </RootDropZone>
          )}
        </div>
        <div className="sb-nav bottom">
          <SbItem icon={<Icon.template />} label="範本" onClick={() => setUI({ templates: true })} />
          <SbItem icon={<Icon.import />} label="匯入" onClick={() => importMarkdown(null)} />
          <SbItem icon={<Icon.trash />} label="垃圾桶" onClick={(e) => setTrashPop(e.currentTarget as HTMLElement)} />
        </div>
      </div>
      <div className="sb-resizer" onMouseDown={startResize} onDoubleClick={() => updateSettings({ sidebarWidth: 240 })} />
      {wsMenu && (
        <Popover anchor={wsMenu} onClose={() => setWsMenu(null)} width={260}>
          <div className="ws-menu-head">
            <span className="ws-avatar lg">{(settings.workspaceName || 'L').slice(0, 1)}</span>
            <div>
              <div className="strong">{settings.workspaceName}</div>
              <div className="muted small">免費方案 · 1 位成員 · 本機儲存</div>
            </div>
          </div>
          <MenuSep />
          <MenuItem icon={<Icon.settings />} label="設定" onClick={() => { setUI({ settings: true }); setWsMenu(null); }} />
          <MenuItem icon={settings.theme === 'dark' ? <Icon.sun /> : <Icon.moon />} label={settings.theme === 'dark' ? '淺色模式' : '深色模式'} right="Ctrl+Shift+L"
            onClick={() => { updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }); setWsMenu(null); }} />
        </Popover>
      )}
      {trashPop && <TrashPopover anchor={trashPop} onClose={() => setTrashPop(null)} />}
    </aside>
  );
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  return <div className="sb-tree">{children}</div>;
}

export function SbItem({ icon, label, onClick, active, right, muted }: { icon: React.ReactNode; label: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; right?: React.ReactNode; muted?: boolean }) {
  return (
    <div className={'sb-item' + (active ? ' active' : '') + (muted ? ' muted' : '')} onClick={onClick}>
      <span className="sb-icon">{icon}</span>
      <span className="sb-label">{label}</span>
      {right && <span className="sb-right">{right}</span>}
    </div>
  );
}

let dragId: string | null = null;

function TreeItem({ page, depth, expanded, setExpanded, onAdd, keyPrefix = '' }: {
  page: Page; depth: number; expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onAdd: (pid: string) => void; keyPrefix?: string;
}) {
  const pages = useStore((s) => s.pages);
  const route = useUI((u) => u.route);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [rename, setRename] = useState<HTMLElement | null>(null);
  const [moveTo, setMoveTo] = useState<HTMLElement | null>(null);
  const [drop, setDrop] = useState<'before' | 'inside' | 'after' | null>(null);
  const k = keyPrefix + page.id;
  const open = !!expanded[k];
  const kids = useMemo(() => (open ? childrenOf(pages, page.id) : []), [open, pages, page.id]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const d = drop;
    setDrop(null);
    const id = dragId;
    dragId = null;
    if (!id || id === page.id) return;
    if (d === 'inside') { movePage(id, page.id); setExpanded((x) => ({ ...x, [page.id]: true })); }
    else if (d === 'before') movePage(id, page.parentId, page.id);
    else {
      const sibs = childrenOf(getState().pages, page.parentId).filter((s) => s.id !== id);
      const i = sibs.findIndex((s) => s.id === page.id);
      movePage(id, page.parentId, sibs[i + 1]?.id ?? null);
    }
  };

  return (
    <>
      <div
        className={'sb-item tree' + (route === page.id ? ' active' : '') + (drop ? ' drop-' + drop : '')}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => navigate(page.id)}
        draggable={!keyPrefix}
        onDragStart={(e) => { dragId = page.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', page.id); }}
        onDragEnd={() => { dragId = null; setDrop(null); }}
        onDragOver={(e) => {
          if (!dragId || keyPrefix) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - r.top;
          setDrop(y < r.height * 0.25 ? 'before' : y > r.height * 0.75 ? 'after' : 'inside');
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onContextMenu={(e) => { e.preventDefault(); setMenu(e.currentTarget as HTMLElement); }}
      >
        <span className="tree-icon-wrap">
          <span className="tree-icon"><PageIcon icon={page.icon} size={16} /></span>
          <span className={'tree-arrow' + (open ? ' open' : '')} onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [k]: !open })); }}>
            <Icon.chevronRight size={12} />
          </span>
        </span>
        <span className="sb-label">{page.title || (page.dbId ? '未命名資料庫' : '未命名')}</span>
        <span className="tree-actions">
          <button className="btn-icon xs" title="刪除、複製等更多操作" onClick={(e) => { e.stopPropagation(); setMenu(e.currentTarget); }}><Icon.more size={14} /></button>
          {!page.dbId && <button className="btn-icon xs" title="在內部新增頁面" onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [k]: true })); onAdd(page.id); }}><Icon.plus size={14} /></button>}
        </span>
      </div>
      {open && (
        <>
          {kids.map((c) => <TreeItem key={c.id} page={c} depth={depth + 1} expanded={expanded} setExpanded={setExpanded} onAdd={onAdd} keyPrefix={keyPrefix} />)}
          {kids.length === 0 && <div className="sb-empty" style={{ paddingLeft: 30 + depth * 12 }}>{page.dbId ? '資料庫' : '沒有頁面'}</div>}
        </>
      )}
      {menu && (
        <PageActionsMenu page={page} anchor={menu} onClose={() => setMenu(null)}
          onRename={() => { setRename(menu); setMenu(null); }} onMove={() => { setMoveTo(menu); setMenu(null); }} />
      )}
      {rename && <RenamePopover page={page} anchor={rename} onClose={() => setRename(null)} />}
      {moveTo && <MoveToPopover page={page} anchor={moveTo} onClose={() => setMoveTo(null)} />}
    </>
  );
}

export function PageActionsMenu({ page, anchor, onClose, onRename, onMove }: { page: Page; anchor: Anchor; onClose: () => void; onRename?: () => void; onMove?: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <MenuItem icon={page.favorite ? <Icon.starFilled /> : <Icon.star />} label={page.favorite ? '從我的最愛中移除' : '加入我的最愛'}
        onClick={() => { patchPage(page.id, { favorite: !page.favorite }, 'silent'); onClose(); }} />
      <MenuSep />
      <MenuItem icon={<Icon.link />} label="複製連結" onClick={() => { navigator.clipboard?.writeText(pageLink(page.id)); toast('已複製連結'); onClose(); }} />
      <MenuItem icon={<Icon.duplicate />} label="建立副本" right="Ctrl+D" onClick={() => { const id = duplicatePage(page.id); onClose(); if (id) navigate(id); }} />
      {onRename && <MenuItem icon={<Icon.edit />} label="重新命名" onClick={onRename} />}
      {onMove && <MenuItem icon={<Icon.move />} label="移至" onClick={onMove} />}
      <MenuItem icon={<Icon.trash />} label="移至垃圾桶" danger onClick={() => { trashPage(page.id); toast('已移至垃圾桶'); onClose(); }} />
      <MenuSep />
      <MenuItem icon={<Icon.arrowUpRight />} label="在新分頁中開啟" onClick={() => { window.open(pageLink(page.id), '_blank'); onClose(); }} />
      <div className="menu-foot">上次編輯：{timeAgo(page.updatedAt)}</div>
    </Popover>
  );
}

function RenamePopover({ page, anchor, onClose }: { page: Page; anchor: Anchor; onClose: () => void }) {
  const [v, setV] = useState(page.title);
  return (
    <Popover anchor={anchor} onClose={() => { patchPage(page.id, { title: v }); onClose(); }} width={300}>
      <div className="rename-row">
        <PageIcon icon={page.icon} size={18} />
        <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { patchPage(page.id, { title: v }); onClose(); } }} />
      </div>
    </Popover>
  );
}

export function MoveToPopover({ page, anchor, onClose }: { page: Page; anchor: Anchor; onClose: () => void }) {
  const pages = useStore((s) => s.pages);
  const [q, setQ] = useState('');
  const isDesc = (id: string) => {
    let cur: string | null = id;
    while (cur) { if (cur === page.id) return true; cur = pages[cur]?.parentId ?? null; }
    return false;
  };
  const list = Object.values(pages)
    .filter((p) => !p.rowOf && !p.dbId && !isTrashed(p.id) && !isDesc(p.id) && (p.title || '未命名').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <div className="menu-search"><input className="input" autoFocus placeholder="將頁面移至…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="menu-list" style={{ maxHeight: 320 }}>
        <MenuHeader>建議</MenuHeader>
        <MenuItem icon={<Icon.home />} label="私人（最上層）" onClick={() => { movePage(page.id, null); toast('已移動'); onClose(); }} />
        {list.map((p) => (
          <MenuItem key={p.id} icon={<PageIcon icon={p.icon} size={16} />} label={p.title || '未命名'}
            onClick={() => { movePage(page.id, p.id); toast(`已移至「${p.title || '未命名'}」`); onClose(); }} />
        ))}
      </div>
    </Popover>
  );
}

function TrashPopover({ anchor, onClose }: { anchor: Anchor; onClose: () => void }) {
  const pages = useStore((s) => s.pages);
  const [q, setQ] = useState('');
  const trashed = Object.values(pages).filter((p) => p.trashed && (p.title || '未命名').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
  return (
    <Popover anchor={anchor} onClose={onClose} width={380} placement="right">
      <div className="menu-search"><input className="input" autoFocus placeholder="在垃圾桶中搜尋頁面" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="menu-list" style={{ maxHeight: 360 }}>
        {trashed.length === 0 && <div className="menu-empty">垃圾桶是空的</div>}
        {trashed.map((p) => (
          <div key={p.id} className="menu-item trash-item" onClick={() => { navigate(p.id); onClose(); }}>
            <span className="menu-icon"><PageIcon icon={p.icon} size={16} /></span>
            <span className="menu-label">
              {p.title || '未命名'}
              <span className="muted small"> · {p.trashedAt ? timeAgo(p.trashedAt) : ''}</span>
            </span>
            <span className="menu-right">
              <button className="btn-icon xs" title="還原" onClick={(e) => { e.stopPropagation(); restorePage(p.id); toast('已還原'); }}><Icon.undo size={14} /></button>
              <button className="btn-icon xs" title="永久刪除" onClick={(e) => { e.stopPropagation(); if (confirm(`確定要永久刪除「${p.title || '未命名'}」嗎？`)) deletePageForever(p.id); }}><Icon.trash size={14} /></button>
            </span>
          </div>
        ))}
      </div>
      {trashed.length > 0 && (
        <div className="trash-foot">
          <span className="muted small">垃圾桶中的頁面可隨時還原</span>
          <button className="btn-ghost sm danger" onClick={() => { if (confirm('確定要清空垃圾桶嗎？此操作無法復原。')) emptyTrash(); }}>清空垃圾桶</button>
        </div>
      )}
    </Popover>
  );
}
