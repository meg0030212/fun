/* Settings of one linked data source: name, colour, which date / tag field, filters. Used by the
   database calendar view and the planner. */
import React, { useState } from 'react';
import { useStore } from '../store';
import { navigate } from '../ui';
import { COLORS, COLOR_NAMES } from '../utils';
import { dbTitle, Source, sourceTagProp } from '../eventSources';
import { FilterRows } from './db/FilterEditor';
import { Icon } from './Icons';
import { Popover } from './Popover';

export function SourceEditor({ src, anchor, onClose, onChange, onRemove, extra, filtersNote, nameEditable = true }: {
  src: Source; anchor: HTMLElement; onClose: () => void;
  onChange: (fn: (s: Source) => void) => void;
  /** unlink; leave out for a source that cannot be removed */
  onRemove?: () => void;
  /** extra options shown above the buttons */
  extra?: React.ReactNode;
  /** when the filters are set elsewhere, a note shown instead of the filter editor */
  filtersNote?: string;
  nameEditable?: boolean;
}) {
  const db = useStore((s) => s.dbs[src.dbId]);
  const [name, setName] = useState(src.name || '');
  const dateProps = db?.properties.filter((p) => p.type === 'date') || [];
  const saveName = () => nameEditable && name !== (src.name || '') && onChange((x) => { x.name = name.trim() || undefined; });
  const close = () => { saveName(); onClose(); };
  return (
    <Popover anchor={anchor} onClose={close} width={540}>
      <div className="pl-form">
        <div className="pl-src-head">
          <span className="pl-src-dot lg" style={{ background: `var(--c-${src.color})` }} />
          {nameEditable
            ? <input className="input" aria-label="顯示名稱" value={name} placeholder={dbTitle(src.dbId)} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
            : <span className="strong">{dbTitle(src.dbId)}</span>}
        </div>
        <div className="muted small">來源：{dbTitle(src.dbId)}{db && <button className="btn-ghost sm" onClick={() => { close(); navigate(db.hostPageId); }}>開啟資料庫</button>}</div>
        <div className="pl-swatches">
          {COLORS.slice(1).map((c) => (
            <button key={c} className={'pl-swatch' + (src.color === c ? ' on' : '')} title={COLOR_NAMES[c]} aria-label={COLOR_NAMES[c]} style={{ background: `var(--c-${c})` }}
              onClick={() => onChange((x) => { x.color = c; })} />
          ))}
        </div>
        {dateProps.length > 1 && (
          <div className="menu-row" style={{ padding: 0 }}>
            <span className="muted small">依哪個日期顯示</span>
            <select className="select-sm" aria-label="日期欄位" value={src.dateProp || dateProps[0].id} onChange={(e) => onChange((x) => { x.dateProp = e.target.value; })}>
              {dateProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {db && (
          <div className="menu-row" style={{ padding: 0 }}>
            <span className="muted small">標籤（決定行程顏色，也能在行事曆上直接加上）</span>
            <select className="select-sm" aria-label="標籤欄位" value={src.tagProp === 'none' ? 'none' : sourceTagProp(db, src)?.id || 'none'}
              onChange={(e) => onChange((x) => { x.tagProp = e.target.value; })}>
              {db.properties.filter((p) => p.type === 'select' || p.type === 'multi_select').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="none">不使用標籤</option>
            </select>
          </div>
        )}
        <div className="strong small" style={{ marginTop: 4 }}>篩選</div>
        {filtersNote ? <div className="muted small">{filtersNote}</div> : db ? (
          <FilterRows db={db} filters={src.filters} empty="顯示這個資料庫的全部行程。新增條件可以只看部分內容，例如「類別 是 工作」。"
            onChange={(next) => onChange((x) => { x.filters = next as any; })} />
        ) : <div className="muted small">找不到這個資料庫，可能已被刪除。</div>}
        {!filtersNote && src.filters.length > 0 && <div className="muted small">從這裡新增的行程，會自動填入符合篩選的值（例如類別設為「工作」）。</div>}
        {extra}
        <label className="pl-src-opt"><input type="checkbox" checked={!!src.hidden} onChange={(e) => onChange((x) => { x.hidden = e.target.checked; })} /> 暫時隱藏</label>
        <div className="pl-edit-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          {onRemove ? <button className="btn-ghost sm danger" onClick={() => { onRemove(); onClose(); }}><Icon.trash size={13} /> 取消連結</button> : <span />}
          <button className="btn-primary sm" onClick={close}>完成</button>
        </div>
      </div>
    </Popover>
  );
}
