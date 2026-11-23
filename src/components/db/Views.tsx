import React, { useRef, useState } from 'react';
import type { Database, Page, Property, View } from '../../types';
import { duplicatePage, makeProp, setRowProp, trashPage, update, updateDb, updateView } from '../../store';
import { openPeek } from '../../ui';
import { COLORS, htmlToText, parseISODate, toISODate, uid } from '../../utils';
import { Icon } from '../Icons';
import { MenuItem, Popover, MenuSep } from '../Popover';
import { PageIcon, coverStyle } from '../EmojiPicker';
import { AddPropertyMenu, Chip, PropIcon, PropValue, PropertyMenu, StatusChip } from './Property';
import { CALCS, calculate, getValue, isEmpty, visibleProps } from './dbutils';

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
      <div className="tbl" style={{ minWidth: total + 40 }}>
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
        {rows.map((r) => (
          <div key={r.id} className={'tbl-row' + (dragRow === r.id ? ' dragging' : '') + (dropRow?.id === r.id ? (dropRow.after ? ' drop-after' : ' drop-before') : '')}
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
            {props.map((p) => (
              <div key={p.id} className={'td td-' + p.type} style={{ width: width(p) }}>
                <PropValue db={db} prop={p} row={r} mode="table" onOpen={p.type === 'title' ? () => openPeek(r.id) : undefined} />
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
              if (e.key === 'Enter' && groupName.trim()) {
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
export function CalendarView({ db, view, rows, newRow }: VP) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const prop = db.properties.find((p) => p.id === view.dateProp);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const start = new Date(month);
  start.setDate(1 - month.getDay());
  const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = toISODate(new Date());
  const byDay = new Map<string, Page[]>();
  rows.forEach((r) => {
    const v = getValue(r, prop);
    if (isEmpty(v)) return;
    const d = typeof v === 'number' ? new Date(v) : parseISODate(v);
    if (!d) return;
    const k = toISODate(d);
    byDay.set(k, [...(byDay.get(k) || []), r]);
  });
  const noDate = rows.filter((r) => isEmpty(getValue(r, prop)));

  return (
    <div className="calendar" ref={scrollRef}>
      <div className="cal-head">
        <div className="cal-month">{month.getFullYear()}年{month.getMonth() + 1}月</div>
        <span className="spacer" />
        {noDate.length > 0 && <span className="muted small" style={{ marginRight: 8 }}>{noDate.length} 筆未設定日期</span>}
        <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon.chevronLeft size={14} /></button>
        <button className="btn-ghost sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>今天</button>
        <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon.chevronRight size={14} /></button>
      </div>
      <div className="cal-grid">
        {['週日', '週一', '週二', '週三', '週四', '週五', '週六'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((d) => {
          const iso = toISODate(d);
          const items = byDay.get(iso) || [];
          return (
            <div key={iso} className={'cal-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (over === iso ? ' over' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')}
              onDragOver={(e) => { if (drag && editable) { e.preventDefault(); setOver(iso); } }}
              onDrop={(e) => { e.preventDefault(); if (drag) setRowProp(drag, prop.id, iso); setDrag(null); setOver(null); }}>
              <div className="cal-day-head">
                {editable && <button className="cal-add btn-icon sm" onClick={() => newRow({ [prop.id]: iso })}><Icon.plus size={12} /></button>}
                <span className={'cal-num' + (iso === today ? ' today' : '')}>{d.getDate() === 1 ? `${d.getMonth() + 1}月${d.getDate()}日` : d.getDate()}</span>
              </div>
              {items.map((r) => (
                <div key={r.id} className="cal-item" draggable={editable}
                  onDragStart={(e) => { setDrag(r.id); e.dataTransfer.setData('text/plain', r.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => openPeek(r.id)}>
                  <CardTitle row={r} />
                  <CardProps db={db} view={view} row={r} exclude={[prop.id]} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
