import React, { useRef, useState } from 'react';
import { isImeKey } from '../../ime';
import type { Database, Page, Property, View } from '../../types';
import { duplicatePage, makeProp, setRowProp, trashPage, update, updateDb, updateView } from '../../store';
import { openPeek } from '../../ui';
import { COLORS, htmlToText, monthLabel, uid } from '../../utils';
import { handleGridKey, useGrid } from '../../gridNav';
import { isRocEra } from '../../utils';
import { DateVal, datePart, daysCovered, endTime, formatTime, hasTime, moveDate, parseDateValue, serializeDate, timePart, toDate, toLocalIso } from '../../dates';
import { Icon } from '../Icons';
import { MenuItem, Popover, MenuSep } from '../Popover';
import { PageIcon, coverStyle } from '../EmojiPicker';
import { AddPropertyMenu, Chip, PropIcon, PropValue, PropertyMenu, StatusChip } from './Property';
import { CALCS, calculate, displayText, getValue, isEmpty, visibleProps } from './dbutils';
import { applyFill, canFill, seriesValue, writeCells } from './fill';

interface VP {
  db: Database;
  view: View;
  rows: Page[];
  newRow: (extra?: Record<string, any>, open?: boolean) => string;
}

function reorderRows(rows: Page[], dragId: string, targetId: string, after: boolean) {
  const ids = rows.map((r) => r.id).filter((id) => id !== dragId);
  let i = ids.indexOf(targetId);
  if (i < 0) return;
  if (after) i++;
  ids.splice(i, 0, dragId);
  update((d) => { ids.forEach((id, k) => { if (d.pages[id]) d.pages[id].sort = k; }); });
}

function RowMenu({ row, anchor, onClose }: { row: Page; anchor: HTMLElement; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={200}>
      <MenuItem icon={<Icon.expand />} label="開啟" onClick={() => { openPeek(row.id); onClose(); }} />
      <MenuItem icon={<Icon.duplicate />} label="複製" onClick={() => { duplicatePage(row.id); onClose(); }} />
      <MenuSep />
      <MenuItem icon={<Icon.trash />} label="刪除" danger onClick={() => { trashPage(row.id); onClose(); }} />
    </Popover>
  );
}

/* ============================== TABLE ============================== */
export function TableView({ db, view, rows, newRow }: VP) {
  const props = visibleProps(db, view);
  const [propMenu, setPropMenu] = useState<{ prop: Property; anchor: HTMLElement } | null>(null);
  const [addProp, setAddProp] = useState<HTMLElement | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: Page; anchor: HTMLElement } | null>(null);
  const [calcMenu, setCalcMenu] = useState<{ prop: Property; anchor: HTMLElement } | null>(null);
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropRow, setDropRow] = useState<{ id: string; after: boolean } | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [active, setActive] = useState<{ ri: number; ci: number } | null>(null);
  const [fill, setFill] = useState<{ ri: number; ci: number; to: number } | null>(null);
  const tblRef = useRef<HTMLDivElement>(null);

  /* Excel-style fill handle: drag the corner of the selected cell up or down */
  const startFill = (e: React.MouseEvent, ri: number, ci: number) => {
    e.preventDefault();
    e.stopPropagation();
    const scroller = tblRef.current?.closest('.page-scroller') as HTMLElement | null;
    let cur = { ri, ci, to: ri };
    const rowH = 34;
    const targetOf = (y: number) => {
      const els = Array.from(tblRef.current?.querySelectorAll<HTMLElement>('.tbl-row[data-ri]') || []);
      if (!els.length) return ri;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (y < r.bottom) return Math.max(0, i);
      }
      const last = els[els.length - 1].getBoundingClientRect();
      return els.length - 1 + Math.min(200, Math.ceil((y - last.bottom) / rowH));
    };
    const move = (ev: MouseEvent) => {
      cur = { ri, ci, to: targetOf(ev.clientY) };
      setFill(cur);
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (ev.clientY > r.bottom - 40) scroller.scrollBy(0, 16);
        if (ev.clientY < r.top + 40) scroller.scrollBy(0, -16);
      }
    };
    const up = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('filling');
      setFill(null);
      // select the source cell (not its text box) so Ctrl+Z undoes the whole fill at once
      tblRef.current?.querySelector<HTMLElement>(`[data-gr="${ri}"][data-gc="${ci}"]`)?.focus({ preventScroll: true });
      const prop = props[ci];
      const src = rows[ri];
      if (!prop || !src || cur.to === ri) return;
      const copyOnly = ev.ctrlKey || ev.metaKey || ev.altKey;
      if (cur.to > ri) {
        const targets = rows.slice(ri + 1, Math.min(rows.length, cur.to + 1));
        const extra = Math.max(0, cur.to - (rows.length - 1));
        applyFill(db, prop, src, targets, 1, extra, copyOnly, view);
      } else {
        const targets = rows.slice(cur.to, ri).reverse();
        applyFill(db, prop, src, targets, -1, 0, copyOnly, view);
      }
    };
    document.body.classList.add('filling');
    setFill(cur);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const inFill = (ri: number, ci: number) => !!fill && fill.ci === ci && fill.to !== fill.ri && (fill.to > fill.ri ? ri > fill.ri && ri <= fill.to : ri < fill.ri && ri >= fill.to);
  const fillPreview = (k: number) => {
    if (!fill) return '';
    const prop = props[fill.ci];
    const src = rows[fill.ri];
    const v = seriesValue(prop, prop.type === 'title' ? src.title : src.props?.[prop.id], k, false);
    const fake = { ...src, title: prop.type === 'title' ? v : src.title, props: { ...(src.props || {}), [prop.id]: v } } as Page;
    return displayText(fake, prop);
  };
  const extraRows = fill && fill.to > rows.length - 1 ? fill.to - (rows.length - 1) : 0;
  const grid = useGrid({
    get: (r, c) => (rows[r] && props[c] ? displayText(rows[r], props[c]) : ''),
    apply: (changes) => writeCells(db, changes.filter((x) => rows[x.r] && props[x.c]).map((x) => ({ row: rows[x.r], prop: props[x.c], text: x.v })),
      isRocEra() || props.some((p) => p.dateFormat === 'roc' || p.dateFormat === 'roc-slash')),
  });
  const width = (p: Property) => liveWidths[p.id] ?? view.widths[p.id] ?? (p.type === 'title' ? 280 : 180);

  const startResize = (e: React.MouseEvent, p: Property) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = width(p);
    let w = w0;
    const move = (ev: MouseEvent) => { w = Math.max(80, w0 + ev.clientX - x0); setLiveWidths((s) => ({ ...s, [p.id]: w })); };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      updateView(db.id, view.id, (v) => { v.widths[p.id] = w; });
      setLiveWidths({});
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const total = props.reduce((a, p) => a + width(p), 0) + 40;

  return (
    <div className="tbl-scroll">
      <div className="tbl" ref={tblRef} style={{ minWidth: total + 40 }} {...grid}
        onFocusCapture={(e) => {
          const c = (e.target as HTMLElement).closest<HTMLElement>('[data-gc]');
          if (c) setActive({ ri: Number(c.dataset.gr), ci: Number(c.dataset.gc) });
        }}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActive(null); }}>
        <div className="tbl-row tbl-head">
          <div className="tbl-gutter" />
          {props.map((p) => (
            <div key={p.id} className={'th' + (dragCol === p.id ? ' dragging' : '')} style={{ width: width(p) }}
              draggable onDragStart={(e) => { setDragCol(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }}
              onDragOver={(e) => { if (dragCol) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragCol || dragCol === p.id) return;
                updateDb(db.id, (d) => {
                  const from = d.properties.findIndex((x) => x.id === dragCol);
                  const [m] = d.properties.splice(from, 1);
                  const to = d.properties.findIndex((x) => x.id === p.id);
                  d.properties.splice(to, 0, m);
                });
                setDragCol(null);
              }}
              onDragEnd={() => setDragCol(null)}
              onClick={(e) => setPropMenu({ prop: p, anchor: e.currentTarget as HTMLElement })}>
              <PropIcon type={p.type} /><span className="th-name">{p.name}</span>
              <span className="th-resize" onMouseDown={(e) => startResize(e, p)} onClick={(e) => e.stopPropagation()} />
            </div>
          ))}
          <div className="th th-add" onClick={(e) => setAddProp(e.currentTarget as HTMLElement)}><Icon.plus size={14} /></div>
        </div>
        {rows.map((r, ri) => (
          <div key={r.id} data-ri={ri} className={'tbl-row' + (dragRow === r.id ? ' dragging' : '') + (dropRow?.id === r.id ? (dropRow.after ? ' drop-after' : ' drop-before') : '')}
            onDragOver={(e) => {
              if (!dragRow) return;
              e.preventDefault();
              const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setDropRow({ id: r.id, after: e.clientY > rc.top + rc.height / 2 });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragRow && dropRow && dragRow !== r.id) {
                if (view.sorts.length) updateView(db.id, view.id, (v) => { v.sorts = []; });
                reorderRows(rows, dragRow, r.id, dropRow.after);
              }
              setDragRow(null); setDropRow(null);
            }}>
            <div className="tbl-gutter">
              <span className="row-handle" draggable
                onDragStart={(e) => { setDragRow(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                onDragEnd={() => { setDragRow(null); setDropRow(null); }}
                onClick={(e) => setRowMenu({ row: r, anchor: e.currentTarget as HTMLElement })}><Icon.drag size={12} /></span>
            </div>
            {props.map((p, ci) => (
              <div key={p.id} className={'td td-' + p.type + (inFill(ri, ci) ? ' fill-preview' : '') + (fill && fill.ri === ri && fill.ci === ci ? ' fill-source' : '')} style={{ width: width(p) }} data-gr={ri} data-gc={ci} tabIndex={-1}>
                <PropValue db={db} prop={p} row={r} mode="table" onOpen={p.type === 'title' ? () => openPeek(r.id) : undefined} />
                {inFill(ri, ci) && <span className="fill-ghost-text">{fillPreview(fill!.to > fill!.ri ? ri - fill!.ri : ri - fill!.ri)}</span>}
                {((active && active.ri === ri && active.ci === ci) || (fill && fill.ri === ri && fill.ci === ci)) && canFill(p) && (
                  <span className="fill-handle" title="往上或往下拖曳以填入（按住 Ctrl 只複製不遞增）" onMouseDown={(e) => startFill(e, ri, ci)} />
                )}
              </div>
            ))}
            <div className="td td-fill" />
          </div>
        ))}
        {extraRows > 0 && Array.from({ length: Math.min(extraRows, 200) }, (_, i) => (
          <div key={'ghost' + i} className="tbl-row ghost">
            <div className="tbl-gutter" />
            {props.map((p, ci) => (
              <div key={p.id} className={'td' + (ci === fill!.ci ? ' fill-preview' : '')} style={{ width: width(p) }}>
                {ci === fill!.ci && <span className="fill-ghost-text">{fillPreview(rows.length - fill!.ri + i)}</span>}
                {i === 0 && ci === (fill!.ci === 0 ? 1 : 0) && <span className="fill-new-label">＋ 放開後新增 {extraRows} 列</span>}
              </div>
            ))}
            <div className="td td-fill" />
          </div>
        ))}
        <div className="tbl-new" onClick={() => newRow({}, false)}><Icon.plus size={14} /> 新增</div>
        <div className="tbl-row tbl-calc">
          <div className="tbl-gutter" />
          {props.map((p) => {
            const kind = view.calcs?.[p.id] || 'none';
            return (
              <div key={p.id} className="td calc" style={{ width: width(p) }} onClick={(e) => setCalcMenu({ prop: p, anchor: e.currentTarget as HTMLElement })}>
                {kind === 'none' ? <span className="calc-hint">計算 <Icon.chevronDown size={10} /></span> : <><span className="calc-label">{CALCS[kind].label}</span> <span>{calculate(kind, rows, p)}</span></>}
              </div>
            );
          })}
        </div>
      </div>
      {propMenu && <PropertyMenu db={db} view={view} prop={db.properties.find((p) => p.id === propMenu.prop.id) || propMenu.prop} anchor={propMenu.anchor} onClose={() => setPropMenu(null)} />}
      {addProp && <AddPropertyMenu db={db} anchor={addProp} onClose={() => setAddProp(null)} />}
      {rowMenu && <RowMenu row={rowMenu.row} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
      {calcMenu && (
        <Popover anchor={calcMenu.anchor} onClose={() => setCalcMenu(null)} width={200} placement="top">
          {Object.entries(CALCS).filter(([, c]) => !c.types || c.types.includes(calcMenu.prop.type)).map(([k, c]) => (
            <MenuItem key={k} label={c.label} right={(view.calcs?.[calcMenu.prop.id] || 'none') === k ? <Icon.check size={14} /> : undefined}
              onClick={() => { updateView(db.id, view.id, (v) => { v.calcs = { ...(v.calcs || {}), [calcMenu.prop.id]: k }; }); setCalcMenu(null); }} />
          ))}
        </Popover>
      )}
    </div>
  );
}

/* ============================== CARD ============================== */
function CardProps({ db, view, row, exclude }: { db: Database; view: View; row: Page; exclude?: string[] }) {
  const props = visibleProps(db, view).filter((p) => p.type !== 'title' && !exclude?.includes(p.id) && !isEmpty(getValue(row, p)) && !(p.type === 'checkbox' && !getValue(row, p)));
  if (!props.length) return null;
  return (
    <div className="card-props">
      {props.map((p) => <div key={p.id} className="card-prop"><PropValue db={db} prop={p} row={row} mode="card" /></div>)}
    </div>
  );
}

function CardTitle({ row }: { row: Page }) {
  return (
    <div className="card-title">
      {row.icon && <PageIcon icon={row.icon} size={14} />}
      <span>{row.title || '未命名'}</span>
    </div>
  );
}

/* ============================== BOARD ============================== */
export function BoardView({ db, view, rows, newRow }: VP) {
  const prop = db.properties.find((p) => p.id === view.groupBy && (p.type === 'select' || p.type === 'status'));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [cardMenu, setCardMenu] = useState<{ row: Page; anchor: HTMLElement } | null>(null);

  if (!prop) {
    const candidates = db.properties.filter((p) => p.type === 'select' || p.type === 'status');
    return (
      <div className="db-empty">
        <div>看板需要「選取」或「狀態」屬性來分組。</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {candidates.map((c) => <button key={c.id} className="btn-outline sm" onClick={() => updateView(db.id, view.id, (v) => { v.groupBy = c.id; })}>依「{c.name}」分組</button>)}
          <button className="btn-primary sm" onClick={() => {
            const p = makeProp('status', '狀態');
            updateDb(db.id, (d) => { d.properties.push(p); d.views.find((v) => v.id === view.id)!.groupBy = p.id; });
          }}>建立狀態屬性</button>
        </div>
      </div>
    );
  }

  const groups: { id: string | null; name: string; opt?: any }[] = [
    { id: null, name: '無' + prop.name },
    ...(prop.options || []).map((o) => ({ id: o.id, name: o.name, opt: o })),
  ];
  const byGroup = (gid: string | null) => rows.filter((r) => {
    const v = getValue(r, prop);
    if (gid === null) return !v || !(prop.options || []).some((o) => o.id === v);
    return v === gid;
  });

  const dropTo = (gid: string | null, beforeRow?: Page) => {
    if (!drag) return;
    setRowProp(drag, prop.id, gid);
    if (beforeRow) {
      const col = byGroup(gid).filter((r) => r.id !== drag);
      const idx = col.findIndex((r) => r.id === beforeRow.id);
      const prevSort = idx > 0 ? col[idx - 1].sort : beforeRow.sort - 1;
      update((d) => { if (d.pages[drag]) d.pages[drag].sort = (prevSort + beforeRow.sort) / 2; }, 'silent');
    }
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="board">
      {groups.map((g) => {
        const items = byGroup(g.id);
        if (g.id === null && items.length === 0 && !drag) return null;
        return (
          <div key={g.id ?? 'none'} className={'board-col' + (over === (g.id ?? 'none') ? ' over' : '')}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(g.id ?? 'none'); } }}
            onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); dropTo(g.id); }}>
            <div className="board-col-head">
              {g.opt ? (prop.type === 'status' ? <StatusChip opt={g.opt} /> : <Chip opt={g.opt} />) : <span className="chip tag-default">{g.name}</span>}
              <span className="board-count">{items.length}</span>
              <span className="spacer" />
              <button className="btn-icon sm" onClick={() => newRow({ [prop.id]: g.id })}><Icon.plus size={14} /></button>
            </div>
            <div className={'board-cards' + (g.opt ? ' tagbg-' + g.opt.color : '')}>
              {items.map((r) => (
                <div key={r.id} className={'card' + (drag === r.id ? ' dragging' : '')} draggable
                  onDragStart={(e) => { setDrag(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { if (drag) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropTo(g.id, r); }}
                  onClick={() => openPeek(r.id)}>
                  {r.cover && <div className="card-cover" style={coverStyle(r.cover)} />}
                  <div className="card-inner">
                    <CardTitle row={r} />
                    <CardProps db={db} view={view} row={r} exclude={[prop.id]} />
                  </div>
                  <button className="card-more btn-icon sm" onClick={(e) => { e.stopPropagation(); setCardMenu({ row: r, anchor: e.currentTarget }); }}><Icon.more size={14} /></button>
                </div>
              ))}
              <div className="board-new" onClick={() => newRow({ [prop.id]: g.id })}><Icon.plus size={14} /> 新增</div>
            </div>
          </div>
        );
      })}
      <div className="board-col add-group">
        {adding ? (
          <input className="input sm" autoFocus placeholder="群組名稱" value={groupName} onChange={(e) => setGroupName(e.target.value)}
            onBlur={() => { setAdding(false); setGroupName(''); }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' && !isImeKey(e)) && groupName.trim()) {
                const opt = { id: uid(), name: groupName.trim(), color: COLORS[1 + Math.floor(Math.random() * 9)] };
                updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id)!; p.options = [...(p.options || []), opt]; });
                setGroupName('');
                setAdding(false);
              }
              if (e.key === 'Escape') setAdding(false);
            }} />
        ) : (
          <button className="btn-ghost sm muted" onClick={() => setAdding(true)}><Icon.plus size={14} /> 新增群組</button>
        )}
      </div>
      {cardMenu && <RowMenu row={cardMenu.row} anchor={cardMenu.anchor} onClose={() => setCardMenu(null)} />}
    </div>
  );
}

/* ============================== LIST ============================== */
export function ListView({ db, view, rows, newRow }: VP) {
  const [rowMenu, setRowMenu] = useState<{ row: Page; anchor: HTMLElement } | null>(null);
  return (
    <div className="list-view">
      {rows.map((r) => (
        <div key={r.id} className="list-row" onClick={() => openPeek(r.id)}>
          <PageIcon icon={r.icon} size={16} />
          <span className="list-title">{r.title || '未命名'}</span>
          <span className="spacer" />
          <div className="list-props"><CardProps db={db} view={view} row={r} /></div>
          <button className="btn-icon sm list-more" onClick={(e) => { e.stopPropagation(); setRowMenu({ row: r, anchor: e.currentTarget }); }}><Icon.more size={14} /></button>
        </div>
      ))}
      <div className="tbl-new" onClick={() => newRow()}><Icon.plus size={14} /> 新增</div>
      {rowMenu && <RowMenu row={rowMenu.row} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
    </div>
  );
}

/* ============================== GALLERY ============================== */
function CardPreview({ row, mode }: { row: Page; mode: View['cardPreview'] }) {
  if (mode === 'none') return null;
  if (mode === 'cover') return <div className="gal-preview" style={coverStyle(row.cover)} />;
  if (row.cover) return <div className="gal-preview" style={coverStyle(row.cover)} />;
  const img = row.blocks.find((b) => b.type === 'image' && b.url);
  if (img) return <div className="gal-preview" style={coverStyle(img.url)} />;
  const lines = row.blocks.filter((b) => b.html && b.type !== 'code').slice(0, 6);
  return (
    <div className="gal-preview text">
      {lines.map((b) => <div key={b.id} className={'gp-line gp-' + b.type}>{htmlToText(b.html)}</div>)}
    </div>
  );
}

export function GalleryView({ db, view, rows, newRow }: VP) {
  const [cardMenu, setCardMenu] = useState<{ row: Page; anchor: HTMLElement } | null>(null);
  return (
    <div className="gallery">
      {rows.map((r) => (
        <div key={r.id} className="gal-card" onClick={() => openPeek(r.id)}>
          <CardPreview row={r} mode={view.cardPreview || 'content'} />
          <div className="card-inner">
            <CardTitle row={r} />
            <CardProps db={db} view={view} row={r} />
          </div>
          <button className="card-more btn-icon sm" onClick={(e) => { e.stopPropagation(); setCardMenu({ row: r, anchor: e.currentTarget }); }}><Icon.more size={14} /></button>
        </div>
      ))}
      <div className="gal-card gal-new" onClick={() => newRow()}><Icon.plus size={16} /> 新增</div>
      {cardMenu && <RowMenu row={cardMenu.row} anchor={cardMenu.anchor} onClose={() => setCardMenu(null)} />}
    </div>
  );
}

/* ============================== CALENDAR ============================== */
const HOUR_PX = 44;

function weekStart(d: Date) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; }

export function CalendarView({ db, view, rows, newRow }: VP) {
  const mode = view.calMode || 'month';
  const [anchor, setAnchor] = useState(() => new Date());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const prop = db.properties.find((p) => p.id === view.dateProp);
  const gridRef = useRef<HTMLDivElement>(null);

  // scroll the week grid to the morning on open
  React.useEffect(() => {
    if (mode === 'week' && gridRef.current) gridRef.current.scrollTop = HOUR_PX * 7.5;
  }, [mode]);

  if (!prop) {
    return (
      <div className="db-empty">
        <div>行事曆需要「日期」屬性。</div>
        <button className="btn-primary sm" style={{ marginTop: 10 }} onClick={() => {
          const existing = db.properties.find((p) => p.type === 'date');
          if (existing) { updateView(db.id, view.id, (v) => { v.dateProp = existing.id; }); return; }
          const p = makeProp('date', '日期');
          updateDb(db.id, (d) => { d.properties.push(p); d.views.find((v) => v.id === view.id)!.dateProp = p.id; });
        }}>{db.properties.some((p) => p.type === 'date') ? '使用日期屬性' : '建立日期屬性'}</button>
      </div>
    );
  }
  const editable = prop.type === 'date';
  const today = toLocalIso(new Date(), false);

  // collect items with their parsed dates
  const items: { row: Page; d: DateVal }[] = [];
  rows.forEach((r) => {
    const v = getValue(r, prop);
    if (isEmpty(v)) return;
    const d = typeof v === 'number' ? { start: toLocalIso(new Date(v), true) } : parseDateValue(v);
    if (d) items.push({ row: r, d });
  });
  items.sort((a, b) => toDate(a.d.start).getTime() - toDate(b.d.start).getTime());
  const byDay = new Map<string, { row: Page; d: DateVal }[]>();
  items.forEach((it) => daysCovered(it.d).forEach((day) => byDay.set(day, [...(byDay.get(day) || []), it])));
  const noDate = rows.length - items.length;

  const dropAt = (target: string) => {
    if (!drag || !editable) return;
    const it = items.find((x) => x.row.id === drag);
    const next = it ? moveDate(it.d, target) : { start: target };
    setRowProp(drag, prop.id, serializeDate(next));
    setDrag(null);
    setOver(null);
  };

  const label = (it: { row: Page; d: DateVal }, day: string) => {
    const t = hasTime(it.d.start) && datePart(it.d.start) === day ? formatTime(timePart(it.d.start), prop.timeFormat) : '';
    return t;
  };

  const step = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (mode === 'month') d.setMonth(d.getMonth() + dir, 1); else d.setDate(d.getDate() + dir * 7);
    setAnchor(d);
  };

  const header = (
    <div className="cal-head">
      <div className="cal-month">
        {mode === 'month' ? monthLabel(anchor) : (() => {
          const s0 = weekStart(anchor); const e0 = new Date(s0); e0.setDate(s0.getDate() + 6);
          return `${monthLabel(s0)}${s0.getDate()}日 – ${e0.getMonth() + 1}月${e0.getDate()}日`;
        })()}
      </div>
      <span className="spacer" />
      {noDate > 0 && <span className="muted small hide-sm" style={{ marginRight: 8 }}>{noDate} 筆未設定日期</span>}
      <div className="seg">
        <button className={mode === 'month' ? 'on' : ''} onClick={() => updateView(db.id, view.id, (v) => { v.calMode = 'month'; })}>月</button>
        <button className={mode === 'week' ? 'on' : ''} onClick={() => updateView(db.id, view.id, (v) => { v.calMode = 'week'; })}>週</button>
      </div>
      <button className="btn-icon" onClick={() => step(-1)}><Icon.chevronLeft size={14} /></button>
      <button className="btn-ghost sm" onClick={() => setAnchor(new Date())}>今天</button>
      <button className="btn-icon" onClick={() => step(1)}><Icon.chevronRight size={14} /></button>
    </div>
  );

  if (mode === 'week') {
    const s0 = weekStart(anchor);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(s0); d.setDate(s0.getDate() + i); return toLocalIso(d, false); });
    const allDay = (day: string) => (byDay.get(day) || []).filter((it) => !hasTime(it.d.start) || (it.d.end && datePart(it.d.start) !== datePart(it.d.end)));
    const timed = (day: string) => (byDay.get(day) || []).filter((it) => hasTime(it.d.start) && !(it.d.end && datePart(it.d.start) !== datePart(it.d.end)) && datePart(it.d.start) === day);
    const nowD = new Date();
    const nowTop = (nowD.getHours() + nowD.getMinutes() / 60) * HOUR_PX;
    const slotFromY = (el: HTMLElement, y: number) => {
      const r = el.getBoundingClientRect();
      const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor(((y - r.top) / HOUR_PX) * 2) * 30));
      return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    };
    return (
      <div className="calendar week">
        {header}
        <div className="wk-head">
          <div className="wk-gutter" />
          {days.map((day) => {
            const d = toDate(day);
            return <div key={day} className={'wk-dayname' + (day === today ? ' today' : '')}>週{'日一二三四五六'[d.getDay()]} <span className="cal-num">{d.getDate()}</span></div>;
          })}
        </div>
        <div className="wk-allday">
          <div className="wk-gutter muted small">全天</div>
          {days.map((day) => (
            <div key={day} className={'wk-allday-cell' + (over === day ? ' over' : '')}
              onDragOver={(e) => { if (drag && editable) { e.preventDefault(); setOver(day); } }}
              onDrop={(e) => { e.preventDefault(); dropAt(day); }}
              onDoubleClick={() => editable && newRow({ [prop.id]: day })}>
              {allDay(day).map((it) => (
                <div key={it.row.id} className="cal-item" draggable={editable}
                  onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => openPeek(it.row.id)}><CardTitle row={it.row} /></div>
              ))}
            </div>
          ))}
        </div>
        <div className="wk-grid" ref={gridRef}>
          <div className="wk-hours">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="wk-hour-label" style={{ height: HOUR_PX }}>{h === 0 ? '' : prop.timeFormat === '12h' ? `${h < 12 ? '上午' : '下午'} ${h % 12 === 0 ? 12 : h % 12}` : `${String(h).padStart(2, '0')}:00`}</div>)}
          </div>
          {days.map((day) => {
            const list = timed(day);
            // simple overlap layout: assign columns
            const cols: number[] = [];
            const placed = list.map((it) => {
              const s = toDate(it.d.start); const e = new Date(endTime(it.d));
              const top = (s.getHours() + s.getMinutes() / 60) * HOUR_PX;
              const h = Math.max(HOUR_PX / 2, ((e.getTime() - s.getTime()) / 3600_000) * HOUR_PX);
              let c = cols.findIndex((end) => end <= top);
              if (c < 0) { c = cols.length; cols.push(0); }
              cols[c] = top + h;
              return { it, top, h, c };
            });
            const n = Math.max(1, cols.length);
            return (
              <div key={day} className={'wk-col' + (day === today ? ' today' : '') + (over?.startsWith(day + 'T') ? ' over' : '')}
                style={{ height: HOUR_PX * 24 }}
                onDragOver={(e) => { if (drag && editable) { e.preventDefault(); setOver(`${day}T${slotFromY(e.currentTarget, e.clientY)}`); } }}
                onDrop={(e) => { e.preventDefault(); dropAt(`${day}T${slotFromY(e.currentTarget, e.clientY)}`); }}
                onClick={(e) => {
                  if (!editable || (e.target as HTMLElement).closest('.wk-event')) return;
                  const t = slotFromY(e.currentTarget, e.clientY);
                  const end = toDate(`${day}T${t}`); end.setHours(end.getHours() + 1);
                  newRow({ [prop.id]: serializeDate({ start: `${day}T${t}`, end: toLocalIso(end, true) }) });
                }}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="wk-line" style={{ top: h * HOUR_PX }} />)}
                {day === today && <div className="wk-now" style={{ top: nowTop }} />}
                {over?.startsWith(day + 'T') && <div className="wk-drop" style={{ top: (+over.slice(11, 13) + +over.slice(14, 16) / 60) * HOUR_PX }} />}
                {placed.map(({ it, top, h, c }) => (
                  <div key={it.row.id} className="wk-event" draggable={editable}
                    style={{ top, height: h - 2, left: `calc(${(c / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                    onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => openPeek(it.row.id)}>
                    <div className="wk-ev-title">{it.row.icon && !/^(https?:|data:)/.test(it.row.icon) ? it.row.icon + ' ' : ''}{it.row.title || '未命名'}</div>
                    <div className="wk-ev-time">{formatTime(timePart(it.d.start), prop.timeFormat)}{it.d.end ? ` – ${formatTime(timePart(it.d.end), prop.timeFormat)}` : ''}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // month view
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(month);
  start.setDate(1 - month.getDay());
  const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });

  return (
    <div className="calendar">
      {header}
      <div className="cal-grid">
        {['週日', '週一', '週二', '週三', '週四', '週五', '週六'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((d) => {
          const iso = toLocalIso(d, false);
          const list = byDay.get(iso) || [];
          return (
            <div key={iso} className={'cal-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (over === iso ? ' over' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')}
              onDragOver={(e) => { if (drag && editable) { e.preventDefault(); setOver(iso); } }}
              onDrop={(e) => { e.preventDefault(); dropAt(iso); }}>
              <div className="cal-day-head">
                {editable && <button className="cal-add btn-icon sm" onClick={() => newRow({ [prop.id]: iso })}><Icon.plus size={12} /></button>}
                <span className={'cal-num' + (iso === today ? ' today' : '')}>{d.getDate() === 1 ? `${d.getMonth() + 1}月${d.getDate()}日` : d.getDate()}</span>
              </div>
              {list.map((it) => {
                const multi = !!it.d.end && datePart(it.d.start) !== datePart(it.d.end);
                const t = label(it, iso);
                return (
                  <div key={it.row.id} className={'cal-item' + (multi ? ' multi' : '') + (multi && datePart(it.d.start) !== iso ? ' cont' : '')} draggable={editable}
                    onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => openPeek(it.row.id)}>
                    <div className="card-title">
                      {t && <span className="cal-time">{t}</span>}
                      {it.row.icon && <PageIcon icon={it.row.icon} size={12} />}
                      <span>{it.row.title || '未命名'}</span>
                    </div>
                    {!multi && <CardProps db={db} view={view} row={it.row} exclude={[prop.id]} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
