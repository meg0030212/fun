import React, { useRef, useState } from 'react';
import { isImeKey } from '../../ime';
import type { Database, Page, Property, View } from '../../types';
import { duplicatePage, makeProp, setRowProp, trashPage, trashPages, update, updateDb, updateView } from '../../store';
import { toast } from '../../ui';
import { openPeek } from '../../ui';
import { COLORS, htmlToText, monthLabel, uid } from '../../utils';
import { clearRange, getRangeRect, handleGridKey, setRange, useGrid } from '../../gridNav';
import { isRocEra } from '../../utils';
import { DateVal, datePart, daysCovered, endTime, formatTime, hasTime, moveDate, parseDateValue, serializeDate, timePart, toDate, toLocalIso } from '../../dates';
import { Icon } from '../Icons';
import { MenuItem, Popover, MenuSep } from '../Popover';
import { PageIcon, coverStyle } from '../EmojiPicker';
import { AddPropertyMenu, Chip, PropIcon, PropValue, PropertyMenu, StatusChip } from './Property';
import { CALCS, calculate, displayText, getValue, isEmpty, visibleProps } from './dbutils';
import { applyFillRange, canFill, fillPreviewText, FillRect, writeCells } from './fill';

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

/** floating bar for actions on several rows at once */
function BatchBar({ db, rows, byTicks, onDelete, onClear, onClearCells }: {
  db: Database; rows: Page[]; byTicks: boolean; onDelete: () => void; onClear: () => void; onClearCells?: () => void;
}) {
  const [setProp, setSetProp] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const n = rows.length;
  return (
    <div className="batch-bar" role="toolbar" aria-label="批量操作" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input, select')) e.preventDefault(); }}>
      <span className="batch-count">已選取 {n} 列</span>
      <button className="batch-btn" onClick={(e) => setSetProp(e.currentTarget)}><Icon.edit size={13} /> 設定屬性</button>
      <button className="batch-btn" onClick={() => { rows.forEach((r) => duplicatePage(r.id)); toast(`已建立 ${n} 列副本`); }}><Icon.duplicate size={13} /> 建立副本</button>
      {onClearCells && <button className="batch-btn" onClick={onClearCells}><Icon.x size={13} /> 清除內容</button>}
      {confirm ? (
        <span className="batch-confirm">
          確定刪除 {n} 列？
          <button className="batch-btn danger" onClick={() => { setConfirm(false); onDelete(); }}>刪除</button>
          <button className="batch-btn" onClick={() => setConfirm(false)}>取消</button>
        </span>
      ) : (
        <button className="batch-btn danger" onClick={() => (n > 1 ? setConfirm(true) : onDelete())}><Icon.trash size={13} /> 刪除</button>
      )}
      <button className="batch-close" title={byTicks ? '取消選取（Esc）' : '取消選取'} aria-label="取消選取" onClick={onClear}><Icon.x size={14} /></button>
      {setProp && <BatchSetProp db={db} rows={rows} anchor={setProp} onClose={() => setSetProp(null)} />}
    </div>
  );
}

/** set one property to the same value on every selected row */
function BatchSetProp({ db, rows, anchor, onClose }: { db: Database; rows: Page[]; anchor: HTMLElement; onClose: () => void }) {
  const editable = db.properties.filter((p) => !['formula', 'created_time', 'last_edited_time'].includes(p.type));
  const [propId, setPropId] = useState(editable.find((p) => p.type !== 'title')?.id || editable[0]?.id || '');
  const [text, setText] = useState('');
  const prop = editable.find((p) => p.id === propId);
  const apply = (value: string) => {
    if (!prop) return;
    writeCells(db, rows.map((row) => ({ row, prop, text: value })), isRocEra() || prop.dateFormat === 'roc' || prop.dateFormat === 'roc-slash');
    toast(`已更新 ${rows.length} 列的「${prop.name}」`);
    onClose();
  };
  const choices = prop?.type === 'checkbox' ? [{ name: '勾選', value: 'true', color: 'green' }, { name: '取消勾選', value: '', color: 'gray' }]
    : prop && ['select', 'status', 'multi_select'].includes(prop.type) ? (prop.options || []).map((o) => ({ name: o.name, value: o.name, color: o.color })) : null;
  return (
    <Popover anchor={anchor} onClose={onClose} width={300} placement="top">
      <div className="pl-form">
        <div className="strong small">把 {rows.length} 列的屬性設成同一個值</div>
        <select className="select-sm" aria-label="屬性" value={propId} onChange={(e) => { setPropId(e.target.value); setText(''); }}>
          {editable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {choices ? (
          <div className="pl-tag-pills">
            {choices.map((c) => <button key={c.name} className={`tag tag-${c.color} pl-tag-pill`} onClick={() => apply(c.value)}>{c.name}</button>)}
            <button className="btn-ghost sm muted" onClick={() => apply('')}>清空</button>
          </div>
        ) : (
          <div className="pl-edit-row">
            <input className="input sm" autoFocus value={text} aria-label="新的值" onChange={(e) => setText(e.target.value)}
              placeholder={prop?.type === 'date' ? '例如 2026-12-01' : prop?.type === 'number' ? '數字' : '輸入內容（留空＝清空）'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isImeKey(e)) apply(text); }} />
            <button className="btn-primary sm" onClick={() => apply(text)}>套用</button>
          </div>
        )}
      </div>
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
  const [fill, setFill] = useState<FillRect | null>(null);
  const [sel, setSel] = useState<{ r0: number; r1: number; c0: number; c1: number } | null>(null);
  const tblRef = useRef<HTMLDivElement>(null);
  // rows ticked in the gutter (batch actions)
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastPick = useRef<number | null>(null);
  const togglePick = (ri: number, shift: boolean) => {
    const next = new Set(picked);
    if (shift && lastPick.current != null) {
      const [a, b] = [Math.min(lastPick.current, ri), Math.max(lastPick.current, ri)];
      const on = !picked.has(rows[ri].id);
      for (let i = a; i <= b; i++) { if (on) next.add(rows[i].id); else next.delete(rows[i].id); }
    } else if (next.has(rows[ri].id)) next.delete(rows[ri].id); else next.add(rows[ri].id);
    lastPick.current = ri;
    setPicked(next);
  };
  // rows the batch bar acts on: ticked rows, else the rows a multi-row cell block covers
  const rangeRows = sel && sel.r1 > sel.r0 ? rows.slice(sel.r0, sel.r1 + 1) : [];
  const batchRows = picked.size ? rows.filter((r) => picked.has(r.id)) : rangeRows;
  const clearBatch = () => { setPicked(new Set()); lastPick.current = null; if (tblRef.current) clearRange(tblRef.current); };
  // drop ticks of rows that disappeared (deleted, filtered out)
  React.useEffect(() => {
    if (!picked.size) return;
    const ids = new Set(rows.map((r) => r.id));
    if ([...picked].some((id) => !ids.has(id))) setPicked(new Set([...picked].filter((id) => ids.has(id))));
  }, [rows]); // eslint-disable-line
  const deleteBatch = () => {
    const ids = batchRows.map((r) => r.id);
    if (!ids.length) return;
    trashPages(ids);
    clearBatch();
    toast(`已刪除 ${ids.length} 列（可按 Ctrl+Z 復原）`);
  };
  // Delete / Backspace removes ticked rows; Escape clears the ticks
  React.useEffect(() => {
    if (!picked.size) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"], .popover')) return;
      if (e.key === 'Escape') clearBatch();
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteBatch(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line
  // follow the grid's block selection so the fill handle sits on its last cell
  React.useEffect(() => {
    const el = tblRef.current;
    if (!el) return;
    const on = (e: Event) => setSel((e as CustomEvent).detail);
    el.addEventListener('gridrange', on);
    return () => el.removeEventListener('gridrange', on);
  }, []);

  /* Excel-style fill handle: drag the corner of the selected cell (or block) up or down */
  const startFill = (e: React.MouseEvent, r0: number, r1: number, c0: number, c1: number) => {
    e.preventDefault();
    e.stopPropagation();
    const scroller = tblRef.current?.closest('.page-scroller') as HTMLElement | null;
    let cur: FillRect = { r0, r1, c0, c1, to: r1 };
    const rowH = 34;
    const targetOf = (y: number) => {
      const els = Array.from(tblRef.current?.querySelectorAll<HTMLElement>('.tbl-row[data-ri]') || []);
      if (!els.length) return r1;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (y < r.bottom) return Math.max(0, i);
      }
      const last = els[els.length - 1].getBoundingClientRect();
      return els.length - 1 + Math.min(200, Math.ceil((y - last.bottom) / rowH));
    };
    const move = (ev: MouseEvent) => {
      const t = targetOf(ev.clientY);
      cur = { r0, r1, c0, c1, to: t >= r0 && t <= r1 ? r1 : t };
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
      const root = tblRef.current;
      // keep the keyboard on a cell (not its text box) so Ctrl+Z undoes the whole fill at once
      root?.querySelector<HTMLElement>(`[data-gr="${r0}"][data-gc="${c0}"]`)?.focus({ preventScroll: true });
      if (cur.to >= r0 && cur.to <= r1) return;
      applyFillRange(db, props, rows, cur, ev.ctrlKey || ev.metaKey || ev.altKey, view);
      // select everything the fill covered, like a spreadsheet
      if (root) requestAnimationFrame(() => setRange(root, { r: Math.min(r0, cur.to), c: c0 }, { r: Math.max(r1, cur.to), c: c1 }));
    };
    document.body.classList.add('filling');
    setFill(cur);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const inFill = (ri: number, ci: number) => !!fill && ci >= fill.c0 && ci <= fill.c1 && canFill(props[ci])
    && (fill.to > fill.r1 ? ri > fill.r1 && ri <= fill.to : fill.to < fill.r0 && ri >= fill.to && ri < fill.r0);
  const isFillSource = (ri: number, ci: number) => !!fill && ri >= fill.r0 && ri <= fill.r1 && ci >= fill.c0 && ci <= fill.c1;
  const preview = (ri: number, ci: number) => (fill ? fillPreviewText(props, rows, fill, ri, ci, displayText) : '');
  // where the fill handle goes: last cell of the selected block, else the active cell
  const handleAt = fill ? { ri: fill.r1, ci: fill.c1 } : sel ? { ri: sel.r1, ci: sel.c1 } : active;
  const handleRect = (ri: number, ci: number) => (sel ? { ...sel } : { r0: ri, r1: ri, c0: ci, c1: ci });
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
          if (c) {
            const ri = Number(c.dataset.gr), ci = Number(c.dataset.gc);
            setActive({ ri, ci });
            // focusing a cell outside the selected block (Tab, click…) ends that selection
            const r = getRangeRect(e.currentTarget);
            if (r && (ri < r.r0 || ri > r.r1 || ci < r.c0 || ci > r.c1)) clearRange(e.currentTarget);
          }
        }}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActive(null); }}>
        <div className="tbl-row tbl-head">
          <div className="tbl-gutter">
            {rows.length > 0 && (
              <span className={'row-check' + (picked.size === rows.length ? ' on' : picked.size ? ' some' : '')} role="checkbox" aria-checked={picked.size === rows.length}
                title={picked.size ? '取消全選' : '全選'} aria-label="全選"
                onClick={() => (picked.size ? clearBatch() : setPicked(new Set(rows.map((r) => r.id))))}>
                {picked.size === rows.length ? <Icon.check size={11} /> : picked.size ? <span className="row-check-dash" /> : null}
              </span>
            )}
          </div>
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
          <div key={r.id} data-ri={ri} className={'tbl-row' + (picked.has(r.id) ? ' picked' : '') + (dragRow === r.id ? ' dragging' : '') + (dropRow?.id === r.id ? (dropRow.after ? ' drop-after' : ' drop-before') : '')}
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
              <span className={'row-check' + (picked.has(r.id) ? ' on' : '')} role="checkbox" aria-checked={picked.has(r.id)} aria-label="選取這一列"
                title="選取（按住 Shift 可連續選取）" onMouseDown={(e) => e.preventDefault()} onClick={(e) => togglePick(ri, e.shiftKey)}>
                {picked.has(r.id) && <Icon.check size={11} />}
              </span>
            </div>
            {props.map((p, ci) => (
              <div key={p.id} className={'td td-' + p.type + (inFill(ri, ci) ? ' fill-preview' : '') + (isFillSource(ri, ci) ? ' fill-source' : '')} style={{ width: width(p) }} data-gr={ri} data-gc={ci} tabIndex={-1}>
                <PropValue db={db} prop={p} row={r} mode="table" onOpen={p.type === 'title' ? () => openPeek(r.id) : undefined} />
                {inFill(ri, ci) && <span className="fill-ghost-text">{preview(ri, ci)}</span>}
                {handleAt && handleAt.ri === ri && handleAt.ci === ci && (canFill(p) || sel) && (
                  <span className="fill-handle" title="往上或往下拖曳以填入（選取多格時依序延續；按住 Ctrl 只重複不遞增）"
                    onMouseDown={(e) => { const h = fill || handleRect(ri, ci); startFill(e, h.r0, h.r1, h.c0, h.c1); }} />
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
              <div key={p.id} className={'td' + (ci >= fill!.c0 && ci <= fill!.c1 && canFill(p) ? ' fill-preview' : '')} style={{ width: width(p) }}>
                {ci >= fill!.c0 && ci <= fill!.c1 && canFill(p) && <span className="fill-ghost-text">{preview(rows.length + i, ci)}</span>}
                {i === 0 && ci === (fill!.c0 === 0 ? fill!.c1 + 1 : 0) && <span className="fill-new-label">＋ 放開後新增 {extraRows} 列</span>}
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
      {batchRows.length > 0 && !fill && (
        <BatchBar db={db} rows={batchRows} byTicks={picked.size > 0} onDelete={deleteBatch} onClear={clearBatch}
          onClearCells={sel && !picked.size ? () => {
            const changes: { row: Page; prop: Property; text: string }[] = [];
            for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) if (rows[r] && props[c]) changes.push({ row: rows[r], prop: props[c], text: '' });
            writeCells(db, changes, false);
          } : undefined} />
      )}
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
export function CardProps({ db, view, row, exclude }: { db: Database; view: View; row: Page; exclude?: string[] }) {
  const props = visibleProps(db, view).filter((p) => p.type !== 'title' && !exclude?.includes(p.id) && !isEmpty(getValue(row, p)) && !(p.type === 'checkbox' && !getValue(row, p)));
  if (!props.length) return null;
  return (
    <div className="card-props">
      {props.map((p) => <div key={p.id} className="card-prop"><PropValue db={db} prop={p} row={row} mode="card" /></div>)}
    </div>
  );
}

function CardTitle({ row }: { row: Page }) {
  if (!row.icon && !row.title) return null; // untitled: show only the other fields
  return (
    <div className="card-title">
      {row.icon && <PageIcon icon={row.icon} size={14} />}
      {row.title && <span>{row.title}</span>}
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
                  {r.cover && <div className="card-cover" style={coverStyle(r.cover, r.coverPos)} />}
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
          <span className="list-title">{r.title}</span>
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
  if (mode === 'cover') return <div className="gal-preview" style={coverStyle(row.cover, row.coverPos)} />;
  if (row.cover) return <div className="gal-preview" style={coverStyle(row.cover, row.coverPos)} />;
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
