import React, { useState } from 'react';
import type { Database, Page, Property, PropType, SelectOption, View } from '../../types';
import { setRowProp, patchPage, updateDb, updateView, makeProp } from '../../store';
import { COLORS, COLOR_NAMES, formatDate, formatDateTime, safeUrl, toISODate, uid, parseISODate } from '../../utils';
import { Popover, MenuItem, MenuSep, MenuHeader, Anchor } from '../Popover';
import { askConfirm } from '../../ui';
import { Icon } from '../Icons';
import { formatNumber, getValue, PROP_TYPES, propTypeLabel } from './dbutils';

export function PropIcon({ type, size = 14 }: { type: PropType; size?: number }) {
  const m: Record<PropType, React.ReactNode> = {
    title: <Icon.text size={size} />, text: <Icon.text size={size} />, number: <Icon.hash size={size} />,
    select: <Icon.select size={size} />, multi_select: <Icon.multi size={size} />, status: <Icon.status size={size} />,
    date: <Icon.calendar size={size} />, checkbox: <Icon.checkbox size={size} />, url: <Icon.link size={size} />,
    email: <Icon.at size={size} />, phone: <Icon.phone size={size} />, created_time: <Icon.clock size={size} />,
    last_edited_time: <Icon.clock size={size} />,
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
export function DateEditor({ value, anchor, onChange, onClose }: { value?: string; anchor: Anchor; onChange: (v: string | null) => void; onClose: () => void }) {
  const init = value ? parseISODate(value) || new Date() : new Date();
  const [month, setMonth] = useState(new Date(init.getFullYear(), init.getMonth(), 1));
  const first = new Date(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = toISODate(new Date());
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className="date-editor">
        <input className="input" type="date" value={value || ''} onChange={(e) => onChange(e.target.value || null)} />
        <div className="mini-cal-head">
          <span>{month.getFullYear()}年{month.getMonth() + 1}月</span>
          <span>
            <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon.chevronLeft size={14} /></button>
            <button className="btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon.chevronRight size={14} /></button>
          </span>
        </div>
        <div className="mini-cal">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => <span key={d} className="mini-dow">{d}</span>)}
          {days.map((d) => {
            const iso = toISODate(d);
            return (
              <span key={iso} className={'mini-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (iso === value ? ' sel' : '') + (iso === today ? ' today' : '')}
                onClick={() => { onChange(iso); onClose(); }}>{d.getDate()}</span>
            );
          })}
        </div>
        <div className="date-actions">
          <button className="btn-ghost sm" onClick={() => { onChange(today); onClose(); }}>今天</button>
          <button className="btn-ghost sm" onClick={() => { onChange(null); onClose(); }}>清除</button>
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
      if (ro) return v ? <span className="cell-text">{formatDate(v)}</span> : null;
      return (
        <>
          <div className="cell-text clickable" onClick={(e) => setPop(e.currentTarget as HTMLElement)}>
            {v ? formatDate(v) : mode === 'page' ? <span className="placeholder">空白</span> : ' '}
          </div>
          {pop && <DateEditor value={v} anchor={pop} onChange={(d) => setRowProp(row.id, prop.id, d)} onClose={() => setPop(null)} />}
        </>
      );
    case 'created_time': case 'last_edited_time':
      return <span className="cell-text muted">{formatDateTime(v)}</span>;
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
        {prop.type === 'number' && (
          <div className="menu-row">
            <span className="muted small">數字格式</span>
            <select className="select-sm" value={prop.numberFormat || 'number'} onChange={(e) => updateDb(db.id, (d) => { const p = d.properties.find((x) => x.id === prop.id); if (p) p.numberFormat = e.target.value as any; })}>
              <option value="number">數字</option><option value="comma">千分位</option><option value="percent">百分比</option>
              <option value="dollar">美元</option><option value="twd">新台幣</option>
            </select>
          </div>
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
          }} />
        ))}
      </div>
    </Popover>
  );
}
