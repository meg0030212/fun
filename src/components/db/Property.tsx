import React, { useState } from 'react';
import type { Database, Page, Property, PropType, SelectOption, View } from '../../types';
import { setRowProp, patchPage, updateDb, updateView, makeProp } from '../../store';
import { COLORS, COLOR_NAMES, formatDateTime, safeUrl, uid } from '../../utils';
import { DateVal, datePart, formatDateValue, formatTime, hasTime, parseDateValue, serializeDate, timePart, toDate, toLocalIso } from '../../dates';
import { Popover, MenuItem, MenuSep, MenuHeader, Anchor, Toggle } from '../Popover';
import { askConfirm, setUI } from '../../ui';
import { Icon } from '../Icons';
import { displayText, formatNumber, getValue, PROP_TYPES, propTypeLabel } from './dbutils';
import { formulaValue } from '../../formula';

export function PropIcon({ type, size = 14 }: { type: PropType; size?: number }) {
  const m: Record<PropType, React.ReactNode> = {
    title: <Icon.text size={size} />, text: <Icon.text size={size} />, number: <Icon.hash size={size} />,
    select: <Icon.select size={size} />, multi_select: <Icon.multi size={size} />, status: <Icon.status size={size} />,
    date: <Icon.calendar size={size} />, checkbox: <Icon.checkbox size={size} />, url: <Icon.link size={size} />,
    email: <Icon.at size={size} />, phone: <Icon.phone size={size} />, created_time: <Icon.clock size={size} />,
    last_edited_time: <Icon.clock size={size} />, formula: <span style={{ fontSize: size * 0.95, fontWeight: 600, lineHeight: 1, fontFamily: 'Georgia, serif' }}>Σ</span>,
  };
  return <span className="prop-icon">{m[type]}</span>;
}

export function Chip({ opt, onRemove }: { opt?: SelectOption; onRemove?: () => void }) {
  if (!opt) return null;
  return (
    <span className={'chip tag-' + opt.color}>
      {opt.name}
      {onRemove && <span className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</span>}
    </span>
  );
}

export function StatusChip({ opt }: { opt?: SelectOption }) {
  if (!opt) return null;
  return <span className={'chip status tag-' + opt.color}><span className="dot" />{opt.name}</span>;
}

const randomColor = () => COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];

/* ---------------- select editor ---------------- */
export function SelectEditor({ db, prop, row, anchor, onClose }: { db: Database; prop: Property; row: Page; anchor: Anchor; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [optMenu, setOptMenu] = useState<{ opt: SelectOption; anchor: HTMLElement } | null>(null);
  const multi = prop.type === 'multi_select';
  const value = getValue(row, prop);
  const selectedIds: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
  const options = prop.options || [];
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const exact = options.find((o) => o.name === q.trim());

  const pick = (id: string) => {
    if (multi) {
      const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
      setRowProp(row.id, prop.id, next);
    } else {
      setRowProp(row.id, prop.id, selectedIds[0] === id ? null : id);
      onClose();
    }
    setQ('');
  };
  const create = () => {
    const name = q.trim();
    if (!name) return;
    const opt = { id: uid(), name, color: randomColor() };
    updateDb(db.id, (d) => {
      const p = d.properties.find((x) => x.id === prop.id);
      if (p) p.options = [...(p.options || []), opt];
    });
    if (multi) setRowProp(row.id, prop.id, [...selectedIds, opt.id]);
    else { setRowProp(row.id, prop.id, opt.id); onClose(); }
    setQ('');
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="select-editor-top">
        {selectedIds.map((id) => <Chip key={id} opt={options.find((o) => o.id === id)} onRemove={() => pick(id)} />)}
        <input className="select-editor-input" autoFocus placeholder={selectedIds.length ? '' : '搜尋選項…'} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (exact) pick(exact.id); else if (q.trim()) create(); else if (filtered[0]) pick(filtered[0].id); }
            if (e.key === 'Backspace' && !q && selectedIds.length) pick(selectedIds[selectedIds.length - 1]);
          }} />
      </div>
      <div className="menu-list">
        <MenuHeader>{prop.type === 'status' ? '選擇狀態' : '選擇選項或建立新選項'}</MenuHeader>
        {filtered.map((o) => (
          <div key={o.id} className="menu-item opt-row" onClick={() => pick(o.id)}>
            <span className="menu-icon drag-dots"><Icon.drag size={12} /></span>
            <span className="menu-label">{prop.type === 'status' ? <StatusChip opt={o} /> : <Chip opt={o} />}</span>
            <span className="menu-right opt-more" onClick={(e) => { e.stopPropagation(); setOptMenu({ opt: o, anchor: e.currentTarget as HTMLElement }); }}><Icon.more size={14} /></span>
          </div>
        ))}
        {q.trim() && !exact && (
          <div className="menu-item" onClick={create}>
            <span className="menu-label">建立 <span className={'chip tag-gray'}>{q.trim()}</span></span>
          </div>
        )}
      </div>
      {optMenu && <OptionMenu db={db} prop={prop} opt={optMenu.opt} anchor={optMenu.anchor} onClose={() => setOptMenu(null)} />}
    </Popover>
  );
}

export function OptionMenu({ db, prop, opt, anchor, onClose }: { db: Database; prop: Property; opt: SelectOption; anchor: Anchor; onClose: () => void }) {
  const [name, setName] = useState(opt.name);
  const save = (patch: Partial<SelectOption>) => updateDb(db.id, (d) => {
    const p = d.properties.find((x) => x.id === prop.id);
    const o = p?.options?.find((x) => x.id === opt.id);
    if (o) Object.assign(o, patch);
  });
  return (
    <Popover anchor={anchor} onClose={onClose} width={220} placement="right">
      <div className="menu-search">
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== opt.name && save({ name: name.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') { if (name.trim()) save({ name: name.trim() }); onClose(); } }} />
      </div>
      <MenuItem icon={<Icon.trash />} label="刪除" danger onClick={() => {
        updateDb(db.id, (d) => {
          const p = d.properties.find((x) => x.id === prop.id);
          if (p) p.options = (p.options || []).filter((x) => x.id !== opt.id);
        });
        onClose();
      }} />
      <MenuSep />
      <MenuHeader>顏色</MenuHeader>
      {COLORS.map((c) => (
        <MenuItem key={c} icon={<span className={'color-swatch tag-' + c} />} label={COLOR_NAMES[c]}
          right={opt.color === c ? <Icon.check size={14} /> : undefined} onClick={() => save({ color: c })} />
      ))}
    </Popover>
  );
}

/* ---------------- date editor ---------------- */
const DEFAULT_QUICK = ['09:00', '12:00', '14:00', '18:00', '20:00'];

export function DateEditor({ value, prop, dbId, anchor, onChange, onClose }: {
  value?: string; prop?: Property; dbId?: string; anchor: Anchor; onChange: (v: string | null) => void; onClose: () => void;
}) {
  const [editQuick, setEditQuick] = useState(false);
  const [qs, setQs] = useState('09:00');
  const [qe, setQe] = useState('');
  const quick = prop?.quickTimes ?? DEFAULT_QUICK;
  const saveQuick = (list: string[] | undefined) => {
    if (!dbId || !prop) return;
    updateDb(dbId, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.quickTimes = list; });
  };
  const quickLabel = (q: string) => {
    const [a, b] = q.split('-');
    return b ? `${formatTime(a, prop?.timeFormat)}–${formatTime(b, prop?.timeFormat)}` : formatTime(a, prop?.timeFormat);
  };
  const parsed = parseDateValue(value);
  const [val, setVal] = useState<DateVal | null>(parsed);
  const [withEnd, setWithEnd] = useState(!!parsed?.end);
  const [withTime, setWithTime] = useState(hasTime(parsed?.start));
  const [editing, setEditing] = useState<'start' | 'end'>('start');
  const init = parsed ? toDate(parsed.start) : new Date();
  const [month, setMonth] = useState(new Date(init.getFullYear(), init.getMonth(), 1));
  const now = new Date();
  const defaultTime = `${String(Math.min(23, now.getHours() + 1)).padStart(2, '0')}:00`;

  const commit = (next: DateVal | null) => {
    setVal(next);
    onChange(serializeDate(next));
  };
  const point = (day: string, time: string) => (withTime ? `${day}T${time || defaultTime}` : day);

  const pickDay = (day: string) => {
    if (!val) { commit({ start: point(day, ''), end: withEnd ? point(day, '') : undefined }); setEditing(withEnd ? 'end' : 'start'); return; }
    if (withEnd && editing === 'end') {
      let start = val.start, end = point(day, timePart(val.end || val.start));
      if (toDate(end) < toDate(start)) [start, end] = [end, point(datePart(val.start), timePart(val.start))];
      commit({ start, end });
      setEditing('start');
    } else {
      const start = point(day, timePart(val.start));
      let end = val.end;
      if (withEnd && end && toDate(end) < toDate(start)) end = point(day, timePart(end));
      commit({ start, end: withEnd ? end || start : undefined });
      if (withEnd) setEditing('end');
    }
  };

  const setTimeOf = (which: 'start' | 'end', t: string) => {
    if (!val || !t) return;
    const base = which === 'start' ? val.start : (val.end || val.start);
    const next = { ...val, [which]: `${datePart(base)}T${t}` } as DateVal;
    if (next.end && toDate(next.end) < toDate(next.start)) next.end = next.start;
    commit(next);
  };

  const toggleTime = (on: boolean) => {
    setWithTime(on);
    if (!val) return;
    const conv = (s: string) => (on ? (hasTime(s) ? s : `${datePart(s)}T${defaultTime}`) : datePart(s));
    let end = val.end ? conv(val.end) : undefined;
    if (on && end && datePart(end) === datePart(val.start) && timePart(end) <= timePart(conv(val.start))) {
      const e = toDate(conv(val.start)); e.setHours(e.getHours() + 1); end = toLocalIso(e, true);
    }
    commit({ start: conv(val.start), end });
  };

  const toggleEnd = (on: boolean) => {
    setWithEnd(on);
    if (!val) return;
    if (on) {
      let end = val.start;
      if (hasTime(val.start)) { const e = toDate(val.start); e.setHours(e.getHours() + 1); end = toLocalIso(e, true); }
      commit({ start: val.start, end });
      setEditing('end');
    } else { commit({ start: val.start }); setEditing('start'); }
  };

  const first = new Date(month);
  const startCell = new Date(first);
  startCell.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(startCell); d.setDate(startCell.getDate() + i); return toLocalIso(d, false); });
  const today = toLocalIso(new Date(), false);
  const s0 = val ? datePart(val.start) : '';
  const e0 = val?.end ? datePart(val.end) : s0;

  const field = (which: 'start' | 'end') => {
    const v = which === 'start' ? val?.start : val?.end;
    return (
      <div className={'date-field' + (editing === which && withEnd ? ' active' : '')} onClick={() => setEditing(which)}>
        <input className="input sm" type="date" value={v ? datePart(v) : ''}
          onChange={(e) => { if (!e.target.value) return; setEditing(which); if (which === 'start') pickDay(e.target.value); else { const t = val?.end ? timePart(val.end) : ''; commit({ start: val?.start || point(e.target.value, ''), end: point(e.target.value, t) }); } }} />
        {withTime && (
          <input className="input sm time" type="time" step={300} value={v ? timePart(v) : ''} onChange={(e) => setTimeOf(which, e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={290}>
      <div className="date-editor">
        <div className="date-fields">
          {field('start')}
          {withEnd && <div className="date-arrow">→</div>}
          {withEnd && field('end')}
        </div>
        <div className="mini-cal-head">
          <span>{month.getFullYear()}年{month.getMonth() + 1}月</span>
          <span>
            <button className="btn-ghost sm" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>今天</button>
            <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon.chevronLeft size={14} /></button>
            <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon.chevronRight size={14} /></button>
          </span>
        </div>
        <div className="mini-cal">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => <span key={d} className="mini-dow">{d}</span>)}
          {days.map((iso) => {
            const inRange = !!val && withEnd && iso > s0 && iso < e0;
            const edge = !!val && (iso === s0 || (withEnd && iso === e0));
            return (
              <span key={iso} className={'mini-day' + (toDate(iso).getMonth() !== month.getMonth() ? ' other' : '') + (edge ? ' sel' : '') + (inRange ? ' range' : '') + (iso === today ? ' today' : '')}
                onClick={() => pickDay(iso)}>{toDate(iso).getDate()}</span>
            );
          })}
        </div>
        <div className="date-toggles">
          <div className="menu-row" onClick={() => toggleEnd(!withEnd)}><span>結束日期</span><Toggle on={withEnd} /></div>
          <div className="menu-row" onClick={() => toggleTime(!withTime)}><span>包含時間</span><Toggle on={withTime} /></div>
          {withTime && (
            <div className="quick-times">
              {quick.map((q) => (
                <button key={q} className={'btn-chip' + (editQuick ? ' editing' : '')} onClick={() => {
                  if (editQuick) { saveQuick(quick.filter((x) => x !== q)); return; }
                  const [a, b] = q.split('-');
                  const day = val ? datePart(val.start) : today;
                  if (b) {
                    // a slot sets both start and end on the same day
                    commit({ start: `${day}T${a}`, end: `${day}T${b}` });
                    setWithEnd(true);
                    setEditing('start');
                    return;
                  }
                  if (!val) { commit({ start: `${day}T${a}` }); return; }
                  setTimeOf(withEnd && editing === 'end' ? 'end' : 'start', a);
                }}>{quickLabel(q)}{editQuick && <span className="chip-x">×</span>}</button>
              ))}
              {dbId && !editQuick && <button className="btn-ghost sm muted" title="自訂時間快捷" onClick={() => setEditQuick(true)}><Icon.edit size={12} /> 編輯</button>}
            </div>
          )}
          {withTime && editQuick && (
            <div className="quick-edit">
              <div className="muted small">點上方的時間可刪除。新增單一時間，或填入結束時間建立時段：</div>
              <div className="quick-edit-row">
                <input className="input sm time" type="time" step={300} value={qs} onChange={(e) => setQs(e.target.value)} aria-label="開始時間" />
                <span className="muted">–</span>
                <input className="input sm time" type="time" step={300} value={qe} onChange={(e) => setQe(e.target.value)} aria-label="結束時間（選填）" />
                <button className="btn-primary sm" disabled={!qs} onClick={() => {
                  const item = qe && qe > qs ? `${qs}-${qe}` : qs;
                  if (!quick.includes(item)) saveQuick([...quick, item].sort());
                  setQe('');
                }}>新增</button>
              </div>
              {qe && qe <= qs && <div className="small danger-text">結束時間需晚於開始時間，將只新增開始時間。</div>}
              <div className="quick-edit-row">
                <button className="btn-ghost sm muted" onClick={() => saveQuick(undefined)}>恢復預設</button>
                <span className="spacer" />
                <button className="btn-outline sm" onClick={() => setEditQuick(false)}>完成</button>
              </div>
            </div>
          )}
        </div>
        <div className="date-preview muted small">{val ? formatDateValue(serializeDate(val), prop) : '尚未選擇日期'}</div>
        <div className="date-actions">
          <button className="btn-ghost sm" onClick={() => { const t = withTime ? `${today}T${timePart(val?.start || '') || defaultTime}` : today; commit({ start: t }); setWithEnd(false); }}>設為今天</button>
          <button className="btn-ghost sm" onClick={() => { commit(null); setWithEnd(false); setWithTime(false); onClose(); }}>清除</button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------------- property value ---------------- */
export function PropValue({ db, prop, row, mode, onOpen }: {
  db: Database; prop: Property; row: Page; mode: 'table' | 'page' | 'card'; onOpen?: () => void;
}) {
  const [pop, setPop] = useState<HTMLElement | null>(null);
  const v = getValue(row, prop);
  const ro = mode === 'card';

  switch (prop.type) {
    case 'title':
      if (mode === 'card') return <span className="cell-title">{row.title || '未命名'}</span>;
      return (
        <div className="cell-title-wrap">
          {row.icon && <span className="cell-icon">{/^(https?:|data:)/.test(row.icon) ? <img src={row.icon} alt="" /> : row.icon}</span>}
          <input className="cell-input title" value={row.title} placeholder="未命名"
            onChange={(e) => patchPage(row.id, { title: e.target.value }, 'typing')}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          {onOpen && <button className="open-btn" onClick={onOpen}><Icon.expand size={12} /> 開啟</button>}
        </div>
      );
    case 'text': case 'url': case 'email': case 'phone':
      if (ro) {
        if (!v) return null;
        return <span className={'cell-text' + (prop.type !== 'text' ? ' link' : '')}>{v}</span>;
      }
      return (
        <div className="cell-text-wrap">
          <input className={'cell-input' + (prop.type !== 'text' && v ? ' link' : '')} value={v || ''} placeholder={mode === 'page' ? '空白' : ''}
            type={prop.type === 'email' ? 'email' : prop.type === 'phone' ? 'tel' : 'text'}
            onChange={(e) => setRowProp(row.id, prop.id, e.target.value, 'typing')} />
          {v && prop.type !== 'text' && (
            <a className="cell-link-btn" target="_blank" rel="noopener noreferrer"
              href={prop.type === 'email' ? 'mailto:' + v : prop.type === 'phone' ? 'tel:' + v : safeUrl(v)}><Icon.arrowUpRight size={12} /></a>
          )}
        </div>
      );
    case 'number':
      if (ro) return v === undefined || v === '' ? null : <span className="cell-text">{formatNumber(v, prop)}</span>;
      return <NumberInput value={v} prop={prop} placeholder={mode === 'page' ? '空白' : ''} onChange={(n) => setRowProp(row.id, prop.id, n)} />;
    case 'checkbox':
      return (
        <span className={'checkbox' + (v ? ' on' : '')} onClick={(e) => { e.stopPropagation(); setRowProp(row.id, prop.id, !v); }}>
          {v && <Icon.check size={12} />}
        </span>
      );
    case 'select': case 'status': case 'multi_select': {
      const ids: string[] = prop.type === 'multi_select' ? (Array.isArray(v) ? v : []) : v ? [v] : [];
      const chips = ids.map((id) => {
        const o = prop.options?.find((x) => x.id === id);
        return prop.type === 'status' ? <StatusChip key={id} opt={o} /> : <Chip key={id} opt={o} />;
      });
      if (ro) return <span className="cell-chips">{chips}</span>;
      return (
        <>
          <div className="cell-chips clickable" onClick={(e) => setPop(e.currentTarget as HTMLElement)}>
            {chips.length ? chips : mode === 'page' ? <span className="placeholder">空白</span> : null}
          </div>
          {pop && <SelectEditor db={db} prop={prop} row={row} anchor={pop} onClose={() => setPop(null)} />}
        </>
      );
    }
    case 'date':
      if (ro) return v ? <span className="cell-text">{formatDateValue(v, prop)}</span> : null;
      return (
        <>
          <div className="cell-text clickable" onClick={(e) => setPop(e.currentTarget as HTMLElement)}>
            {v ? formatDateValue(v, prop) : mode === 'page' ? <span className="placeholder">空白</span> : ' '}
          </div>
          {pop && <DateEditor value={v} prop={prop} dbId={db.id} anchor={pop} onChange={(d) => setRowProp(row.id, prop.id, d)} onClose={() => setPop(null)} />}
        </>
      );
    case 'created_time': case 'last_edited_time':
      return <span className="cell-text muted">{formatDateTime(v)}</span>;
    case 'formula': {
      const r = formulaValue(row, prop);
      const open = () => setUI({ formulaEdit: { dbId: db.id, propId: prop.id, rowId: row.id } });
      if (!prop.formula?.trim()) {
        return ro ? null : <span className="cell-text placeholder clickable" onClick={open}>設定公式…</span>;
      }
      if (!r.ok) return <span className="cell-text formula-error" title={r.error} onClick={ro ? undefined : open}>⚠ 錯誤</span>;
      if (typeof r.value === 'boolean') return <span className={'checkbox readonly' + (r.value ? ' on' : '')}>{r.value && <Icon.check size={12} />}</span>;
      const text = displayText(row, prop);
      if (ro && !text) return null;
      return <span className={'cell-text formula-val' + (typeof r.value === 'number' ? ' num' : '')} title={text}>{text}</span>;
    }
  }
  return null;
}

function NumberInput({ value, prop, onChange, placeholder }: { value: any; prop: Property; onChange: (v: number | null) => void; placeholder?: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <input className="cell-input num" placeholder={placeholder}
      value={editing ?? (value === undefined || value === null ? '' : formatNumber(value, prop))}
      onFocus={() => setEditing(value === undefined || value === null ? '' : String(value))}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={() => {
        if (editing !== null) {
          const t = editing.replace(/[,%$NT\s]/g, '');
          onChange(t === '' || isNaN(Number(t)) ? null : Number(t));
        }
        setEditing(null);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/* ---------------- property header menu ---------------- */
export function PropertyMenu({ db, view, prop, anchor, onClose }: { db: Database; view?: View; prop: Property; anchor: Anchor; onClose: () => void }) {
  const [name, setName] = useState(prop.name);
  const [typeMenu, setTypeMenu] = useState<HTMLElement | null>(null);
  const [newOpt, setNewOpt] = useState('');
  const [optMenu, setOptMenu] = useState<{ opt: SelectOption; anchor: HTMLElement } | null>(null);
  const saveName = () => name.trim() && name !== prop.name && updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.name = name.trim(); });
  const isSel = prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status';

  const setType = (t: PropType) => {
    updateDb(db.id, (d) => {
      const p = d.properties.find((x) => x.id === prop.id);
      if (!p) return;
      p.type = t;
      if ((t === 'select' || t === 'multi_select' || t === 'status') && !p.options) p.options = makeProp(t, '').options;
    });
    setTypeMenu(null);
    if (t === 'formula') { onClose(); setUI({ formulaEdit: { dbId: db.id, propId: prop.id } }); }
  };

  return (
    <Popover anchor={anchor} onClose={() => { saveName(); onClose(); }} width={260}>
      <div className="menu-search">
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') { saveName(); onClose(); } }} />
      </div>
      <div className="menu-list">
        {prop.type !== 'title' && (
          <MenuItem icon={<PropIcon type={prop.type} />} label="類型" right={<>{propTypeLabel(prop.type)} <Icon.chevronRight size={12} /></>}
            onClick={(e) => setTypeMenu(e.currentTarget as HTMLElement)} />
        )}
        {prop.type === 'formula' && (
          <MenuItem icon={<PropIcon type="formula" />} label="編輯公式" right={<Icon.chevronRight size={12} />}
            onClick={() => { saveName(); onClose(); setUI({ formulaEdit: { dbId: db.id, propId: prop.id } }); }} />
        )}
        {(prop.type === 'number' || prop.type === 'formula') && (
          <div className="menu-row">
            <span className="muted small">數字格式</span>
            <select className="select-sm" value={prop.numberFormat || 'number'} onChange={(e) => updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.numberFormat = e.target.value as any; })}>
              <option value="number">數字</option><option value="comma">千分位</option><option value="percent">百分比</option>
              <option value="dollar">美元</option><option value="twd">新台幣</option>
            </select>
          </div>
        )}
        {prop.type === 'date' && (
          <>
            <div className="menu-row">
              <span className="muted small">日期格式</span>
              <select className="select-sm" value={prop.dateFormat || 'full'} onChange={(e) => updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.dateFormat = e.target.value as any; })}>
                <option value="full">2026年11月23日</option><option value="short">11月23日（一）</option>
                <option value="slash">2026/11/23</option><option value="iso">2026-11-23</option><option value="relative">相對（今天、明天）</option>
              </select>
            </div>
            <div className="menu-row">
              <span className="muted small">時間格式</span>
              <select className="select-sm" value={prop.timeFormat || '24h'} onChange={(e) => updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.timeFormat = e.target.value as any; })}>
                <option value="24h">24 小時制（14:30）</option><option value="12h">12 小時制（下午 2:30）</option>
              </select>
            </div>
          </>
        )}
        {isSel && (
          <>
            <MenuSep />
            <MenuHeader>選項</MenuHeader>
            {(prop.options || []).map((o) => (
              <div key={o.id} className="menu-item" onClick={(e) => setOptMenu({ opt: o, anchor: e.currentTarget as HTMLElement })}>
                <span className="menu-label">{prop.type === 'status' ? <StatusChip opt={o} /> : <Chip opt={o} />}</span>
                <span className="menu-right"><Icon.chevronRight size={12} /></span>
              </div>
            ))}
            <div className="menu-search">
              <input className="input" placeholder="+ 新增選項" value={newOpt} onChange={(e) => setNewOpt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newOpt.trim()) {
                    const opt = { id: uid(), name: newOpt.trim(), color: randomColor() };
                    updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.options = [...(p.options || []), opt]; });
                    setNewOpt('');
                  }
                }} />
            </div>
          </>
        )}
        <MenuSep />
        {view && <>
          <MenuItem icon={<Icon.sort />} label="遞增排序" onClick={() => { updateView(db.id, view.id, (v) => { v.sorts = [{ propId: prop.id, dir: 'asc' }]; }); onClose(); }} />
          <MenuItem icon={<Icon.sort />} label="遞減排序" onClick={() => { updateView(db.id, view.id, (v) => { v.sorts = [{ propId: prop.id, dir: 'desc' }]; }); onClose(); }} />
          <MenuItem icon={<Icon.filter />} label="篩選" onClick={() => {
            updateView(db.id, view.id, (v) => { v.filters.push({ id: uid(), propId: prop.id, op: prop.type === 'checkbox' ? 'checked' : prop.type === 'multi_select' ? 'has' : prop.type === 'number' ? 'eq' : prop.type === 'select' || prop.type === 'status' || prop.type === 'date' ? 'is' : 'contains' }); });
            onClose();
          }} />
          {prop.type !== 'title' && <MenuItem icon={<Icon.eyeOff />} label="在此檢視中隱藏" onClick={() => { updateView(db.id, view.id, (v) => { v.hidden.push(prop.id); }); onClose(); }} />}
        </>}
        {prop.type !== 'title' && <>
          <MenuItem icon={<Icon.duplicate />} label="複製屬性" onClick={() => {
            updateDb(db.id, (d) => { const i = d.properties.findIndex((x) => x.id === prop.id); d.properties.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(prop)), id: uid(), name: prop.name + ' (副本)' }); });
            onClose();
          }} />
          <MenuItem icon={<Icon.trash />} label="刪除屬性" danger onClick={async () => {
            onClose();
            if (!(await askConfirm(`確定要刪除屬性「${prop.name}」嗎？所有資料列中的此欄位值都會被移除。`, '刪除屬性'))) return;
            updateDb(db.id, (d) => {
              d.properties = d.properties.filter((x) => x.id !== prop.id);
              d.views.forEach((v) => {
                v.filters = v.filters.filter((f) => f.propId !== prop.id);
                v.sorts = v.sorts.filter((f) => f.propId !== prop.id);
                if (v.groupBy === prop.id) v.groupBy = undefined;
                if (v.dateProp === prop.id) v.dateProp = undefined;
              });
            });
            onClose();
          }} />
        </>}
      </div>
      {typeMenu && (
        <Popover anchor={typeMenu} placement="right" onClose={() => setTypeMenu(null)} width={220}>
          <MenuHeader>屬性類型</MenuHeader>
          {PROP_TYPES.map((t) => (
            <MenuItem key={t.type} icon={<PropIcon type={t.type} />} label={t.label} right={prop.type === t.type ? <Icon.check size={14} /> : undefined} onClick={() => setType(t.type)} />
          ))}
        </Popover>
      )}
      {optMenu && <OptionMenu db={db} prop={prop} opt={(prop.options || []).find((o) => o.id === optMenu.opt.id) || optMenu.opt} anchor={optMenu.anchor} onClose={() => setOptMenu(null)} />}
    </Popover>
  );
}

export function AddPropertyMenu({ db, anchor, onClose, onAdded }: { db: Database; anchor: Anchor; onClose: () => void; onAdded?: (id: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <div className="menu-search">
        <input className="input" placeholder="屬性名稱" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <MenuHeader>類型</MenuHeader>
      <div className="menu-list">
        {PROP_TYPES.map((t) => (
          <MenuItem key={t.type} icon={<PropIcon type={t.type} />} label={t.label} onClick={() => {
            const p = makeProp(t.type, name.trim() || t.label);
            updateDb(db.id, (d) => { d.properties.push(p); });
            onAdded?.(p.id);
            onClose();
            if (t.type === 'formula') setUI({ formulaEdit: { dbId: db.id, propId: p.id } });
          }} />
        ))}
      </div>
    </Popover>
  );
}
