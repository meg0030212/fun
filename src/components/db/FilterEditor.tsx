import React from 'react';
import type { Database, Filter } from '../../types';
import { uid } from '../../utils';
import { Icon } from '../Icons';
import { opsFor } from './dbutils';

/** editable list of filter conditions (combined with AND), used by views and planner sources */
export function FilterRows({ db, filters, onChange, empty = '此檢視尚無篩選條件' }: {
  db: Database; filters: Filter[]; onChange: (next: Filter[]) => void; empty?: string;
}) {
  const set = (id: string, patch: Partial<Filter>) => onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const add = () => {
    // start with a select/status property when there is one: that is what people filter by most
    const p = db.properties.find((x) => x.type === 'select' || x.type === 'status' || x.type === 'multi_select') || db.properties[0];
    onChange([...filters, { id: uid(), propId: p.id, op: opsFor(p.type)[0].op }]);
  };
  return (
    <div className="fs-pop">
      {filters.length === 0 && <div className="muted small" style={{ padding: '6px 4px' }}>{empty}</div>}
      {filters.map((f, i) => {
        const p = db.properties.find((x) => x.id === f.propId) || db.properties[0];
        const ops = opsFor(p.type);
        const op = ops.find((o) => o.op === f.op) || ops[0];
        return (
          <div key={f.id} className="fs-row">
            <span className="fs-where">{i === 0 ? '條件' : '且'}</span>
            <select className="select-sm" value={p.id} aria-label="屬性" onChange={(e) => {
              const np = db.properties.find((x) => x.id === e.target.value)!;
              set(f.id, { propId: np.id, op: opsFor(np.type)[0].op, value: undefined });
            }}>
              {db.properties.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
            </select>
            <select className="select-sm" value={op.op} aria-label="條件" onChange={(e) => set(f.id, { op: e.target.value })}>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {!op.noValue && (
              (p.type === 'select' || p.type === 'status' || p.type === 'multi_select') ? (
                <select className="select-sm grow" value={f.value || ''} aria-label="值" onChange={(e) => set(f.id, { value: e.target.value })}>
                  <option value="">選擇選項…</option>
                  {(p.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <input className="input sm grow" aria-label="值" type={p.type === 'number' ? 'number' : ['date', 'created_time', 'last_edited_time'].includes(p.type) ? 'date' : 'text'}
                  placeholder="輸入值…" value={f.value ?? ''} onChange={(e) => set(f.id, { value: e.target.value })} />
              )
            )}
            {op.noValue && <span className="grow" />}
            <button className="btn-icon" title="移除條件" onClick={() => onChange(filters.filter((x) => x.id !== f.id))}><Icon.x size={14} /></button>
          </div>
        );
      })}
      <div className="fs-actions">
        <button className="btn-ghost sm" onClick={add}><Icon.plus size={14} /> 新增篩選條件</button>
        {filters.length > 0 && <button className="btn-ghost sm danger" onClick={() => onChange([])}><Icon.trash size={14} /> 清除全部</button>}
      </div>
    </div>
  );
}
