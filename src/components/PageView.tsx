import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isImeKey } from '../ime';
import type { Page } from '../types';
import { deletePageForever, getState, isTrashed, newBlock, patchPage, restorePage, setBlocks, useStore } from '../store';
import { askConfirm, navigate, setUI, useUI } from '../ui';
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
import { EmojiPicker, CoverPicker, coverStyle, isImageCover, PageIcon, randomEmoji } from './EmojiPicker';
import { Icon } from './Icons';
import { DatabaseView } from './db/DatabaseView';
import { AddPropertyMenu, PropIcon, PropValue, PropertyMenu } from './db/Property';
import { TEXT_TYPES } from '../blockTypes';
import { PlannerView } from './planner/PlannerView';

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
    if (titleRef.current) setCaret(titleRef.current, 'end');
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
  const isDbPage = !!page.dbId || !!page.planner;

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
    if (f) patchPage(page.id, { cover: await readFileAsDataURL(f), coverPos: undefined });
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
          {page.trashed && <button className="btn-outline-light" onClick={async () => { if (await askConfirm('確定要永久刪除此頁面嗎？此操作無法復原。', '永久刪除')) { deletePageForever(page.id); navigate('home'); } }}>永久刪除</button>}
        </div>
      )}
      {page.cover && <Cover page={page} readOnly={!!readOnly} onChange={(e) => setCoverPick(e)} />}
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
            if (e.key === 'Enter' && !isImeKey(e)) { e.preventDefault(); focusFirstBlock(); }
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
      {page.planner ? (
        <div className="page-db"><PlannerView page={page} readOnly={readOnly} /></div>
      ) : isDbPage ? (
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
        <CoverPicker anchor={coverPick} onClose={() => setCoverPick(null)} onSelect={(c) => patchPage(page.id, { cover: c, coverPos: undefined })} onRemove={() => patchPage(page.id, { cover: undefined, coverPos: undefined })} onUpload={uploadCover} />
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

/** page cover; an image cover can be dragged into place (調整位置 → drag → 儲存位置) */
function Cover({ page, readOnly, onChange }: { page: Page; readOnly: boolean; onChange: (anchor: HTMLElement) => void }) {
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const natural = useRef<{ url: string; w: number; h: number } | null>(null);
  const img = isImageCover(page.cover);
  const pos = draft || page.coverPos || [50, 50];

  // the image's own size tells how far it can move: background-size: cover leaves spare pixels on one axis
  useEffect(() => {
    if (!img || !page.cover) return;
    const url = page.cover;
    const im = new Image();
    im.onload = () => { natural.current = { url, w: im.naturalWidth, h: im.naturalHeight }; };
    im.src = url;
  }, [img, page.cover]);
  useEffect(() => { setDraft(null); }, [page.cover]);
  useEffect(() => {
    if (!draft) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
      if (e.key === 'Enter') { patchPage(page.id, { coverPos: draft }); setDraft(null); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [draft, page.id]);

  const startDrag = (e: React.PointerEvent) => {
    if (!draft || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const n = natural.current;
    // spare pixels the image has beyond the box on each axis
    let spareX = 0, spareY = 0;
    if (n && n.w && n.h) {
      const scale = Math.max(box.width / n.w, box.height / n.h);
      spareX = n.w * scale - box.width; spareY = n.h * scale - box.height;
    }
    const sx = e.clientX, sy = e.clientY, [px, py] = draft;
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
    const move = (ev: PointerEvent) => {
      // dragging the picture down shows more of its top, i.e. a smaller percentage
      const nx = spareX > 1 ? clamp(px - ((ev.clientX - sx) / spareX) * 100) : px;
      const ny = spareY > 1 ? clamp(py - ((ev.clientY - sy) / spareY) * 100) : py;
      setDraft([nx, ny]);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} className={'cover' + (draft ? ' repositioning' : '')} style={coverStyle(page.cover, pos)} onPointerDown={startDrag}>
      {draft && <div className="cover-hint">拖曳圖片調整位置</div>}
      {!readOnly && (
        <div className="cover-actions">
          {draft ? (
            <>
              <button className="btn-chip" onClick={() => { patchPage(page.id, { coverPos: draft }); setDraft(null); }}>儲存位置</button>
              <button className="btn-chip" onClick={() => setDraft(null)}>取消</button>
            </>
          ) : (
            <>
              <button className="btn-chip" onClick={(e) => onChange(e.currentTarget)}>更換封面</button>
              {img && <button className="btn-chip" onClick={() => setDraft(page.coverPos || [50, 50])}>調整位置</button>}
              <button className="btn-chip" onClick={() => patchPage(page.id, { cover: undefined, coverPos: undefined })}>移除</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
