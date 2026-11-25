import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isImeKey } from '../ime';
import katex from 'katex';
import type { Block } from '../types';
import { useStore } from '../store';
import { navigate } from '../ui';
import { hostname, htmlToText, pickFile, readFileAsDataURL, safeUrl, youtubeEmbed } from '../utils';
import { PageIcon } from './EmojiPicker';
import { Icon } from './Icons';
import { DatabaseView } from './db/DatabaseView';
import { Editable } from './Editable';
import { handleGridKey } from '../gridNav';

interface Props {
  block: Block;
  pageId: string;
  readOnly: boolean;
  update: (patch: Partial<Block>) => void;
  select: () => void;
}

export function BlockContentExtra(props: Props) {
  const { block } = props;
  switch (block.type) {
    case 'page': return <PageLinkBlock {...props} />;
    case 'database': return block.dbId ? <DatabaseView dbId={block.dbId} inline /> : null;
    case 'image': return <ImageBlock {...props} />;
    case 'bookmark': case 'embed': case 'video': return <MediaBlock {...props} />;
    case 'equation': return <EquationBlock {...props} />;
    case 'toc': return <TocBlock {...props} />;
    case 'table': return <SimpleTable {...props} />;
    default: return null;
  }
}

function PageLinkBlock({ block }: Props) {
  const p = useStore((s) => (block.pageId ? s.pages[block.pageId] : undefined));
  if (!p) return null;
  return (
    <div className="blk-page" onClick={() => navigate(p.id)}>
      <PageIcon icon={p.icon} size={18} />
      <span className="blk-page-title">{p.title || '未命名'}</span>
    </div>
  );
}

function UrlInput({ placeholder, button, onSubmit, upload }: { placeholder: string; button: string; onSubmit: (v: string) => void; upload?: () => void }) {
  const [v, setV] = useState('');
  const [tab, setTab] = useState<'upload' | 'link'>(upload ? 'upload' : 'link');
  return (
    <div className="url-input-box">
      {upload && (
        <div className="picker-tabs">
          <span className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>上傳</span>
          <span className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>嵌入連結</span>
        </div>
      )}
      {tab === 'upload' && upload ? (
        <button className="btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={upload}>選擇檔案</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: upload ? 8 : 0 }}>
          <input className="input" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeKey(e)) && v.trim()) onSubmit(v.trim()); }} />
          <button className="btn-primary" onClick={() => v.trim() && onSubmit(v.trim())}>{button}</button>
        </div>
      )}
    </div>
  );
}

function Placeholder({ icon, label, children, readOnly }: { icon: React.ReactNode; label: string; children: React.ReactNode; readOnly: boolean }) {
  const [open, setOpen] = useState(!readOnly);
  return (
    <div className="media-placeholder-wrap">
      <div className="media-placeholder" onClick={() => !readOnly && setOpen((o) => !o)}>{icon}<span>{label}</span></div>
      {open && !readOnly && children}
    </div>
  );
}

function ImageBlock({ block, update, readOnly, select }: Props) {
  const [resizing, setResizing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  if (!block.url) {
    return (
      <Placeholder icon={<Icon.image />} label="新增圖片" readOnly={readOnly}>
        <UrlInput placeholder="貼上圖片連結…" button="嵌入圖片" onSubmit={(url) => update({ url: safeUrl(url) })}
          upload={async () => { const f = await pickFile('image/*'); if (f) update({ url: await readFileAsDataURL(f) }); }} />
      </Placeholder>
    );
  }
  const startResize = (e: React.MouseEvent, side: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const w0 = ref.current!.offsetWidth;
    const maxW = ref.current!.parentElement!.offsetWidth;
    setResizing(true);
    const move = (ev: MouseEvent) => {
      const w = Math.max(80, Math.min(maxW, w0 + (ev.clientX - startX) * side * 2));
      ref.current!.style.width = w + 'px';
    };
    const up = () => {
      setResizing(false);
      update({ width: ref.current!.offsetWidth });
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return (
    <figure className="blk-image">
      <div className={'img-wrap' + (resizing ? ' resizing' : '')} ref={ref} style={{ width: block.width || undefined }} onClick={select}>
        <img src={block.url} alt={block.caption || ''} draggable={false} />
        {!readOnly && <>
          <span className="img-resize left" onMouseDown={(e) => startResize(e, -1)} />
          <span className="img-resize right" onMouseDown={(e) => startResize(e, 1)} />
          <div className="img-tools">
            <button className="btn-chip" onClick={(e) => { e.stopPropagation(); window.open(block.url, '_blank'); }} title="原始圖片"><Icon.expand size={13} /></button>
            <button className="btn-chip" onClick={(e) => { e.stopPropagation(); update({ url: undefined, width: undefined }); }} title="更換"><Icon.edit size={13} /></button>
          </div>
        </>}
      </div>
      {(!readOnly || block.caption) && (
        <Editable html={block.caption || ''} className="caption" placeholder="寫個說明…" readOnly={readOnly}
          onChange={(h) => update({ caption: h })} />
      )}
    </figure>
  );
}

function MediaBlock({ block, update, readOnly }: Props) {
  const t = block.type;
  if (!block.url) {
    const label = t === 'bookmark' ? '新增網頁書籤' : t === 'video' ? '嵌入影片' : '嵌入網頁';
    return (
      <Placeholder icon={t === 'bookmark' ? <Icon.link /> : <Icon.expand />} label={label} readOnly={readOnly}>
        <UrlInput placeholder={t === 'video' ? '貼上 YouTube / Vimeo 影片連結…' : '貼上連結…'}
          button={t === 'bookmark' ? '建立書籤' : '嵌入'} onSubmit={(url) => update({ url: safeUrl(url) })} />
      </Placeholder>
    );
  }
  if (t === 'bookmark') {
    return (
      <a className="blk-bookmark" href={block.url} target="_blank" rel="noopener noreferrer">
        <div className="bm-main">
          <div className="bm-title">{hostname(block.url)}</div>
          <div className="bm-url"><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname(block.url))}&sz=32`} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />{block.url}</div>
        </div>
        {!readOnly && <button className="btn-chip bm-edit" onClick={(e) => { e.preventDefault(); update({ url: undefined }); }}><Icon.edit size={13} /></button>}
      </a>
    );
  }
  const src = t === 'video' ? (youtubeEmbed(block.url) || block.url) : (youtubeEmbed(block.url) || block.url);
  const isFile = t === 'video' && /\.(mp4|webm|ogg)(\?|$)/i.test(block.url);
  return (
    <div className="blk-embed">
      {isFile ? <video src={block.url} controls /> : <iframe src={src} title="embed" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />}
      {!readOnly && <button className="btn-chip embed-edit" onClick={() => update({ url: undefined })}><Icon.edit size={13} /></button>}
    </div>
  );
}

function EquationBlock({ block, update, readOnly }: Props) {
  const [editing, setEditing] = useState(!block.html && !readOnly);
  const [val, setVal] = useState(block.html);
  const rendered = useMemo(() => {
    try { return katex.renderToString(block.html || '\\text{輸入公式}', { displayMode: true, throwOnError: false }); } catch { return block.html; }
  }, [block.html]);
  useEffect(() => setVal(block.html), [block.html]);
  return (
    <div className="blk-equation">
      <div className="eq-render" onClick={() => !readOnly && setEditing(true)} dangerouslySetInnerHTML={{ __html: rendered }} />
      {editing && (
        <div className="eq-editor">
          <textarea className="input mono" autoFocus rows={3} value={val} placeholder="E = mc^2" onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeKey(e)) && !e.shiftKey) { e.preventDefault(); update({ html: val }); setEditing(false); } if (e.key === 'Escape') setEditing(false); }} />
          <div className="eq-actions">
            <span className="muted small">Enter 完成，Shift+Enter 換行</span>
            <button className="btn-primary sm" onClick={() => { update({ html: val }); setEditing(false); }}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TocBlock({ pageId }: Props) {
  const blocks = useStore((s) => s.pages[pageId]?.blocks || []);
  const heads = blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3');
  if (!heads.length) return <div className="blk-toc muted">新增標題以建立目錄。</div>;
  return (
    <div className="blk-toc">
      {heads.map((h) => (
        <div key={h.id} className={'toc-item toc-' + h.type} onClick={() => {
          document.querySelector(`[data-block-id="${h.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}>{htmlToText(h.html) || '未命名'}</div>
      ))}
    </div>
  );
}

function SimpleTable({ block, update, readOnly }: Props) {
  const rows = block.rows || [['']];
  const cols = rows[0]?.length || 1;
  const setCell = (r: number, c: number, html: string) => {
    const next = rows.map((row) => [...row]);
    next[r][c] = html;
    update({ rows: next });
  };
  const addRow = (n = 1) => update({ rows: [...rows, ...Array.from({ length: n }, () => Array(cols).fill(''))] });
  const addCol = (n = 1) => update({ rows: rows.map((r) => [...r, ...Array(n).fill('')]) });
  const [pending, setPending] = useState<{ axis: 'row' | 'col'; n: number } | null>(null);
  /** click adds one; press and drag down/right adds as many as you pull */
  const dragAdd = (e: React.MouseEvent, axis: 'row' | 'col') => {
    e.preventDefault();
    const start = axis === 'row' ? e.clientY : e.clientX;
    const step = axis === 'row' ? 34 : 120;
    let n = 1;
    let moved = false;
    setPending({ axis, n });
    const move = (ev: MouseEvent) => {
      const d = (axis === 'row' ? ev.clientY : ev.clientX) - start;
      if (Math.abs(d) > 4) moved = true;
      n = Math.max(1, Math.min(100, 1 + Math.floor(Math.max(0, d) / step)));
      setPending({ axis, n });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setPending(null);
      if (axis === 'row') addRow(moved ? n : 1); else addCol(moved ? n : 1);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const delRow = (i: number) => rows.length > 1 && update({ rows: rows.filter((_, k) => k !== i) });
  const delCol = (i: number) => cols > 1 && update({ rows: rows.map((r) => r.filter((_, k) => k !== i)) });
  return (
    <div className="blk-table-wrap">
      <div className="blk-table-scroll">
        <table className="blk-table" onKeyDown={(e) => handleGridKey(e, e.currentTarget)}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 && block.headerRow ? 'head' : ''}>
                {row.map((cell, c) => (
                  <td key={c} data-gr={r} data-gc={c}>
                    <Editable html={cell} readOnly={readOnly} onChange={(h) => setCell(r, c, h)}
                      onKeyDown={(e, el) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const all = Array.from(el.closest('table')!.querySelectorAll<HTMLElement>('.editable'));
                          const i = all.indexOf(el);
                          const t = all[i + (e.shiftKey ? -1 : 1)];
                          if (t) t.focus(); else if (!e.shiftKey) { addRow(); }
                        }
                      }} />
                    {!readOnly && r === 0 && <span className="col-del" title="刪除欄" onClick={() => delCol(c)}>×</span>}
                  </td>
                ))}
                {!readOnly && <td className="row-del-cell"><span className="row-del" title="刪除列" onClick={() => delRow(r)}>×</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && (
          <button className={'tbl-add-col' + (pending?.axis === 'col' ? ' pulling' : '')} onMouseDown={(e) => dragAdd(e, 'col')} title="點擊新增一欄，按住往右拖可一次新增多欄">
            {pending?.axis === 'col' ? <span className="pull-count">+{pending.n}</span> : <Icon.plus size={14} />}
          </button>
        )}
      </div>
      {!readOnly && (
        <div className="tbl-foot-row">
          <button className={'tbl-add-row' + (pending?.axis === 'row' ? ' pulling' : '')} onMouseDown={(e) => dragAdd(e, 'row')} title="點擊新增一列，按住往下拖可一次新增多列">
            <Icon.plus size={14} /> {pending?.axis === 'row' ? `放開以新增 ${pending.n} 列` : '新增列（可往下拖）'}
          </button>
          <label className="muted small tbl-header-toggle">
            <input type="checkbox" checked={!!block.headerRow} onChange={(e) => update({ headerRow: e.target.checked })} /> 標題列
          </label>
        </div>
      )}
    </div>
  );
}
