import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '../types';
import { deletePageForever, getState, isTrashed, newBlock, patchPage, restorePage, setBlocks, useStore } from '../store';
import { navigate, setUI, useUI } from '../ui';
import { pickFile, readFileAsDataURL, setCaret } from '../utils';

/** focus a block's editable as soon as React has committed it */
function focusEditable(pageId: string, blockId: string, pos: 'start' | 'end') {
  const tryFocus = (n: number) => {
    const el = document.querySelector<HTMLElement>(`.editor[data-page-id="${pageId}"] [data-block-id="${blockId}"] .editable`);
    if (el) setCaret(el, pos);
    else if (n > 0) setTimeout(() => tryFocus(n - 1), 16);
  };
  queueMicrotask(() => tryFocus(8));
}
import { Editor } from './Editor';
import { Editable } from './Editable';
import { EmojiPicker, CoverPicker, coverStyle, PageIcon, randomEmoji } from './EmojiPicker';
import { Icon } from './Icons';
import { DatabaseView } from './db/DatabaseView';
import { AddPropertyMenu, PropIcon, PropValue, PropertyMenu } from './db/Property';
import { TEXT_TYPES } from '../blockTypes';

export function PageView({ pageId, peek }: { pageId: string; peek?: boolean }) {
  const page = useStore((s) => s.pages[pageId]);
  const pages = useStore((s) => s.pages);
  const [iconPick, setIconPick] = useState<HTMLElement | null>(null);
  const [coverPick, setCoverPick] = useState<HTMLElement | null>(null);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const commentsOpen = useUI((u) => u.comments);
  const titleRef = useRef<HTMLDivElement | null>(null);

  // focus the title of freshly created, empty pages
  useEffect(() => {
    if (!page || page.title || page.locked) return;
    if (Date.now() - page.createdAt > 4000) return;
    if (page.blocks.some((b) => b.html || b.type !== 'text')) return;
    const t = setTimeout(() => titleRef.current && setCaret(titleRef.current, 'end'), 30);
    return () => clearTimeout(t);
  }, [pageId]); // eslint-disable-line

  const backlinks = useMemo(() => {
    if (!page) return [];
    const needle = `data-page-id="${page.id}"`;
    return Object.values(pages).filter((p) => p.id !== page.id && !p.trashed && p.blocks.some((b) => b.html && b.html.includes(needle)));
  }, [pages, page]);

  if (!page) {
    return (
      <div className="page-missing">
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2>找不到此頁面</h2>
        <p className="muted">頁面可能已被永久刪除。</p>
        <button className="btn-primary" onClick={() => navigate('home')}>回到首頁</button>
      </div>
    );
  }

  const trashed = isTrashed(page.id);
  const readOnly = !!page.locked || trashed;
  const isDbPage = !!page.dbId;

  const focusFirstBlock = () => {
    if (isDbPage) return;
    const first = page.blocks[0];
    if (first && TEXT_TYPES.includes(first.type)) {
      const el = document.querySelector<HTMLElement>(`.editor[data-page-id="${page.id}"] [data-block-id="${first.id}"] .editable`);
      if (el) setCaret(el, 'start');
    } else {
      const nb = newBlock();
      setBlocks(page.id, (bs) => { bs.unshift(nb); });
      focusEditable(page.id, nb.id, 'start');
    }
  };

  const clickBottom = () => {
    if (readOnly || isDbPage) return;
    const last = page.blocks[page.blocks.length - 1];
    let id = last?.id;
    if (!last || last.type !== 'text' || last.html) {
      const nb = newBlock();
      id = nb.id;
      setBlocks(page.id, (bs) => { bs.push(nb); });
    }
    if (id) focusEditable(page.id, id, 'end');
  };

  const uploadCover = async () => {
    const f = await pickFile('image/*');
    if (f) patchPage(page.id, { cover: await readFileAsDataURL(f) });
  };

  const cls = ['page', 'font-' + (page.font || 'default')];
  if (page.smallText) cls.push('small-text');
  if (page.fullWidth || isDbPage) cls.push('full-width');
  if (peek) cls.push('peek');

  return (
    <div className={cls.join(' ')}>
      {trashed && (
        <div className="trash-banner">
          此頁面在垃圾桶中。
          <button className="btn-outline-light" onClick={() => {
            let cur: Page | undefined = page;
            const s = getState();
            while (cur) { if (cur.trashed) { restorePage(cur.id); break; } cur = cur.parentId ? s.pages[cur.parentId] : (cur.rowOf ? s.pages[s.dbs[cur.rowOf]?.hostPageId] : undefined); }
          }}>還原頁面</button>
          {page.trashed && <button className="btn-outline-light" onClick={() => { if (confirm('確定永久刪除？此操作無法復原。')) { deletePageForever(page.id); navigate('home'); } }}>永久刪除</button>}
        </div>
      )}
      {page.cover && (
        <div className="cover" style={coverStyle(page.cover)}>
          {!readOnly && (
            <div className="cover-actions">
              <button className="btn-chip" onClick={(e) => setCoverPick(e.currentTarget)}>更換封面</button>
              <button className="btn-chip" onClick={() => patchPage(page.id, { cover: undefined })}>移除</button>
            </div>
          )}
        </div>
      )}
      <div className="page-content">
        <div className={'page-header' + (page.cover ? ' has-cover' : '') + (page.icon ? ' has-icon' : '')}>
          {page.icon && (
            <div className="page-big-icon" onClick={(e) => !readOnly && setIconPick(e.currentTarget)}>
              <PageIcon icon={page.icon} size={page.cover ? 78 : 70} />
            </div>
          )}
          {!readOnly && (
            <div className="page-controls">
              {!page.icon && <button className="btn-ghost sm muted" onClick={() => patchPage(page.id, { icon: randomEmoji() })}><Icon.smile size={14} /> 新增圖示</button>}
              {!page.cover && <button className="btn-ghost sm muted" onClick={() => patchPage(page.id, { cover: 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)' })}><Icon.image size={14} /> 新增封面</button>}
              <button className="btn-ghost sm muted" onClick={() => setUI({ comments: true })}><Icon.comment size={14} /> 新增留言</button>
            </div>
          )}
        </div>
        <Editable
          ref={titleRef}
          html={page.title}
          plain
          className="page-title"
          placeholder={isDbPage ? '未命名資料庫' : '未命名'}
          readOnly={readOnly}
          onChange={(t) => patchPage(page.id, { title: t.replace(/\n/g, '') }, 'typing')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); focusFirstBlock(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); focusFirstBlock(); }
          }}
        />
        {page.rowOf && <RowProperties page={page} readOnly={readOnly} />}
        {!commentsOpen && page.comments.length > 0 && (
          <div className="comments-hint" onClick={() => setUI({ comments: true })}>
            <Icon.comment size={14} /> {page.comments.length} 則留言
          </div>
        )}
        {backlinks.length > 0 && (
          <div className="backlinks">
            <button className="btn-ghost sm muted" onClick={() => setShowBacklinks((s) => !s)}>
              <Icon.arrowUpRight size={14} /> {backlinks.length} 個反向連結
            </button>
            {showBacklinks && backlinks.map((b) => (
              <div key={b.id} className="backlink" onClick={() => navigate(b.id)}><PageIcon icon={b.icon} size={14} /> {b.title || '未命名'}</div>
            ))}
          </div>
        )}
        {page.rowOf && <div className="row-divider" />}
      </div>
      {isDbPage ? (
        <div className="page-db"><DatabaseView dbId={page.dbId!} /></div>
      ) : (
        <div className="page-content">
          <Editor page={page} readOnly={readOnly} />
          <div className="page-bottom" onClick={clickBottom} />
        </div>
      )}
      {iconPick && (
        <EmojiPicker anchor={iconPick} onClose={() => setIconPick(null)} onSelect={(e) => patchPage(page.id, { icon: e })} onRemove={() => patchPage(page.id, { icon: undefined })} />
      )}
      {coverPick && (
        <CoverPicker anchor={coverPick} onClose={() => setCoverPick(null)} onSelect={(c) => patchPage(page.id, { cover: c })} onRemove={() => patchPage(page.id, { cover: undefined })} onUpload={uploadCover} />
      )}
    </div>
  );
}

function RowProperties({ page, readOnly }: { page: Page; readOnly: boolean }) {
  const db = useStore((s) => s.dbs[page.rowOf!]);
  const [propMenu, setPropMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [add, setAdd] = useState<HTMLElement | null>(null);
  if (!db) return null;
  return (
    <div className="page-props">
      {db.properties.filter((p) => p.type !== 'title').map((p) => (
        <div key={p.id} className="prop-row">
          <div className="prop-name" onClick={(e) => !readOnly && setPropMenu({ id: p.id, anchor: e.currentTarget as HTMLElement })}>
            <PropIcon type={p.type} /> <span>{p.name}</span>
          </div>
          <div className="prop-val">
            {readOnly ? <PropValue db={db} prop={p} row={page} mode="card" /> : <PropValue db={db} prop={p} row={page} mode="page" />}
          </div>
        </div>
      ))}
      {!readOnly && <button className="btn-ghost sm muted add-prop" onClick={(e) => setAdd(e.currentTarget)}><Icon.plus size={14} /> 新增屬性</button>}
      {propMenu && db.properties.find((p) => p.id === propMenu.id) && (
        <PropertyMenu db={db} prop={db.properties.find((p) => p.id === propMenu.id)!} anchor={propMenu.anchor} onClose={() => setPropMenu(null)} />
      )}
      {add && <AddPropertyMenu db={db} anchor={add} onClose={() => setAdd(null)} />}
    </div>
  );
}
