/* Quick tags shared by the database calendar and the planner month block:
   a bar of tags to stamp onto days / slots, a per-slot "+" menu, and a tag manager. */
import React, { useEffect, useState } from 'react';
import type { Property, SelectOption } from '../types';
import { trashPage, update, updateDb, useStore } from '../store';
import { COLORS, COLOR_NAMES, uid } from '../utils';
import { isImeKey } from '../ime';
import { toDate } from '../dates';
import { addTaggedRow, Slot, slotAddPair, slotAddText, parseSpan, Source, sourceName } from '../eventSources';
import { Icon } from './Icons';
import { Popover } from './Popover';

const WD = ['日', '一', '二', '三', '四', '五', '六'];

export type Brush = { srcId: string; optId: string };

/** what the tag tools need from their host (calendar view or planner) */
export interface TagCtx {
  /** sources that can hold dated rows, with their tag field */
  usable: { src: Source; tp?: Property }[];
  /** where new tags are created */
  target?: Source;
  /** sources new tags may go to; setTarget('__new') creates a new database for tags */
  targets: Source[];
  setTarget?: (id: string) => void;
  /** the source's latest settings (e.g. after a tag field was created) */
  fresh: (srcId: string) => Source | undefined;
  /** create a tag in the target source; returns the option id */
  createTag: (name: string) => string | null;
  /** word for where events live, used in hints (月曆) */
  where?: string;
}

/** add the chosen tag on a day (in a slot's hours when given) */
export function stampTag(ctx: TagCtx, b: Brush, day: string, span?: [string, string] | null) {
  const src = ctx.fresh(b.srcId);
  return src ? addTaggedRow(src, day, b.optId, span) : null;
}

/** name input that saves when you leave it (IME-safe) */
function TagNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const save = () => { const t = v.trim(); if (t && t !== value) onChange(t); else setV(value); };
  return <input className="input sm" value={v} aria-label="標籤名稱" onChange={(e) => setV(e.target.value)} onBlur={save}
    onKeyDown={(e) => { if (!isImeKey(e) && e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** rename / recolour / delete tags, and choose where new tags are kept */
export function ManageTags({ ctx, anchor, onClose, onDeleted, only, onManageAll }: {
  ctx: TagCtx; anchor: HTMLElement; onClose: () => void; onDeleted: (optId: string) => void;
  /** edit just this one tag (from the tag itself) */
  only?: Brush;
  onManageAll?: () => void;
}) {
  const pages = useStore((s) => s.pages);
  const [confirm, setConfirm] = useState<Brush | null>(null);
  const [colorOf, setColorOf] = useState<string | null>(null);
  const where = ctx.where || '月曆';
  const setOpt = (dbId: string, propId: string, optId: string, fn: (o: SelectOption) => void) =>
    updateDb(dbId, (d) => { const o = d.properties.find((x) => x.id === propId)?.options?.find((x) => x.id === optId); if (o) fn(o); });
  const rowsWith = (dbId: string, propId: string, optId: string) => Object.values(pages).filter((r) => r.rowOf === dbId && !r.trashed
    && (Array.isArray(r.props?.[propId]) ? r.props[propId].includes(optId) : r.props?.[propId] === optId));
  const remove = (dbId: string, propId: string, optId: string, withRows: boolean) => {
    const rows = rowsWith(dbId, propId, optId);
    if (withRows) rows.forEach((r) => trashPage(r.id));
    update((d) => {
      const prop = d.dbs[dbId]?.properties.find((x) => x.id === propId);
      if (prop) prop.options = (prop.options || []).filter((o) => o.id !== optId);
      if (!withRows) rows.forEach((r) => {
        const x = d.pages[r.id];
        if (!x?.props) return;
        const v = x.props[propId];
        x.props[propId] = Array.isArray(v) ? v.filter((id: string) => id !== optId) : null;
      });
    });
    onDeleted(optId);
    setConfirm(null);
    if (only) onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={340}>
      <div className="pl-tagmanage">
        <div className="strong small">{only ? '編輯標籤' : '管理標籤'}</div>
        {ctx.usable.filter(({ src }) => !only || src.id === only.srcId).map(({ src, tp }) => (
          <div key={src.id} className="pl-tagmanage-group">
            {ctx.usable.length > 1 && !only && <div className="pl-tagmenu-src"><span className="pl-src-dot" style={{ background: `var(--c-${src.color})` }} /> {sourceName(src)}{tp && <span className="muted">・{tp.name}</span>}</div>}
            {!(tp?.options || []).length && <div className="muted small">沒有標籤</div>}
            {tp && (tp.options || []).filter((o) => !only || o.id === only.optId).map((o) => {
              const key = src.id + o.id;
              const isConfirm = confirm?.srcId === src.id && confirm.optId === o.id;
              const n = isConfirm ? rowsWith(src.dbId, tp.id, o.id).length : 0;
              return (
                <div key={o.id}>
                  <div className="pl-tagmanage-row">
                    <button className={`pl-color-dot tag-${o.color}`} title="換顏色" aria-label={`${o.name}的顏色`} onClick={() => setColorOf(colorOf === key ? null : key)} />
                    <TagNameInput value={o.name} onChange={(v) => {
                      // events named after the tag follow the new name
                      const rows = rowsWith(src.dbId, tp.id, o.id).filter((r) => r.title === o.name);
                      update((d) => {
                        const x = d.dbs[src.dbId]?.properties.find((y) => y.id === tp.id)?.options?.find((y) => y.id === o.id);
                        if (x) x.name = v;
                        rows.forEach((r) => { if (d.pages[r.id]) d.pages[r.id].title = v; });
                      });
                    }} />
                    <button className="btn-icon xs" title="刪除標籤" aria-label={`刪除${o.name}`} onClick={() => setConfirm({ srcId: src.id, optId: o.id })}><Icon.trash size={13} /></button>
                  </div>
                  {colorOf === key && (
                    <div className="pl-swatches pl-tag-swatches">
                      {COLORS.map((c) => (
                        <button key={c} className={`pl-swatch tag-${c}` + (o.color === c ? ' on' : '')} title={COLOR_NAMES[c]} aria-label={COLOR_NAMES[c]}
                          onClick={() => { setOpt(src.dbId, tp.id, o.id, (x) => { x.color = c; }); setColorOf(null); }} />
                      ))}
                    </div>
                  )}
                  {isConfirm && (
                    <div className="pl-tag-confirm">
                      <div className="small">刪除「{o.name}」？{n > 0 && `${where}上已加上 ${n} 個。`}</div>
                      <div className="pl-edit-row">
                        {n > 0 && <button className="btn-outline sm danger" onClick={() => remove(src.dbId, tp.id, o.id, true)}>連同 {n} 個行程一起刪除</button>}
                        <button className="btn-outline sm" onClick={() => remove(src.dbId, tp.id, o.id, false)}>{n > 0 ? '只刪標籤，保留行程' : '刪除'}</button>
                        <button className="btn-ghost sm" onClick={() => setConfirm(null)}>取消</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {only && onManageAll && <button className="btn-ghost sm muted" style={{ alignSelf: 'flex-start' }} onClick={(e) => { e.stopPropagation(); onClose(); onManageAll(); }}>管理全部標籤…</button>}
        {!only && ctx.setTarget && (
          <>
            <div className="menu-row" style={{ padding: 0, gap: 6 }}>
              <span className="muted small">新標籤存到</span>
              <select className="select-sm" aria-label="新標籤存到" value={ctx.target?.id || ''} onChange={(e) => ctx.setTarget!(e.target.value)}>
                {ctx.targets.map((s) => <option key={s.id} value={s.id}>{sourceName(s)}</option>)}
                <option value="__new">＋ 建立新的資料表</option>
              </select>
            </div>
            <div className="muted small">標籤會存成資料表裡的一列，可以按上方的資料來源開啟資料庫查看。</div>
          </>
        )}
      </div>
    </Popover>
  );
}

/** row of tags: pick one, then click days / slots to stamp it on */
export function TagBar({ ctx, brush, setBrush }: { ctx: TagCtx; brush: Brush | null; setBrush: (b: Brush | null) => void }) {
  const { usable, target } = ctx;
  const where = ctx.where || '月曆';
  const [adding, setAdding] = useState(false);
  const [manage, setManage] = useState<HTMLElement | null>(null);
  const [editOne, setEditOne] = useState<{ anchor: HTMLElement; tag: Brush } | null>(null);
  const [name, setName] = useState('');
  const manageBtn = React.useRef<HTMLButtonElement>(null);
  if (!usable.length) return null;
  const create = () => {
    if (!target || !name.trim()) return;
    const id = ctx.createTag(name);
    setName('');
    setAdding(false);
    if (id) setBrush({ srcId: target.id, optId: id });
  };
  const current = brush && usable.find((u) => u.src.id === brush.srcId)?.tp?.options?.find((o) => o.id === brush.optId);
  const deleted = (id: string) => { if (brush?.optId === id) setBrush(null); };
  return (
    <div className="pl-tagbar">
      <span className="pl-tagbar-label">快速標籤</span>
      {usable.map(({ src, tp }) => (
        <React.Fragment key={src.id}>
          {usable.length > 1 && (tp?.options?.length || 0) > 0 && <span className="pl-src-dot" title={sourceName(src)} style={{ background: `var(--c-${src.color})` }} />}
          {(tp?.options || []).map((o) => {
            const on = brush?.srcId === src.id && brush.optId === o.id;
            return (
              <span key={o.id} className="pl-tag-wrap">
                <button className={`tag tag-${o.color} pl-tag-pill` + (on ? ' on' : '')} aria-pressed={on}
                  title={on ? '再按一次結束（按右鍵可編輯或刪除）' : `選取後，點${where}上的時段就會加上「${o.name}」（按右鍵可編輯或刪除）`}
                  onClick={() => setBrush(on ? null : { srcId: src.id, optId: o.id })}
                  onContextMenu={(e) => { e.preventDefault(); setEditOne({ anchor: e.currentTarget, tag: { srcId: src.id, optId: o.id } }); }}>{o.name}</button>
                <button className="pl-tag-edit" title={`編輯或刪除「${o.name}」`} aria-label={`編輯${o.name}`}
                  onClick={(e) => setEditOne({ anchor: e.currentTarget.previousElementSibling as HTMLElement, tag: { srcId: src.id, optId: o.id } })}>
                  <Icon.more size={12} />
                </button>
              </span>
            );
          })}
        </React.Fragment>
      ))}
      {target && (adding ? (
        <input className="input sm pl-tagbar-input" autoFocus placeholder="標籤名稱，按 Enter" value={name} aria-label="新增標籤"
          onChange={(e) => setName(e.target.value)} onBlur={() => { if (!name.trim()) setAdding(false); }}
          onKeyDown={(e) => {
            if (isImeKey(e)) return;
            if (e.key === 'Enter') { e.preventDefault(); create(); }
            if (e.key === 'Escape') { setName(''); setAdding(false); }
          }} />
      ) : (
        <button className="btn-ghost sm muted" onClick={() => setAdding(true)}><Icon.plus size={12} /> 新增標籤</button>
      ))}
      {(usable.some((u) => u.tp) || ctx.setTarget) && <button ref={manageBtn} className="btn-ghost sm muted pl-tagbar-manage" onClick={(e) => setManage(e.currentTarget)}><Icon.edit size={12} /> 管理標籤</button>}
      {editOne && <ManageTags ctx={ctx} anchor={editOne.anchor} only={editOne.tag} onClose={() => setEditOne(null)} onDeleted={deleted}
        onManageAll={() => manageBtn.current && setManage(manageBtn.current)} />}
      {manage && <ManageTags ctx={ctx} anchor={manage} onClose={() => setManage(null)} onDeleted={deleted} />}
      {current
        ? <span className="pl-tagbar-hint">點{where}上的時段加上「{current.name}」，再點一次就移除 · 按 Esc 結束</span>
        : usable.some((u) => u.tp?.options?.length) && <span className="pl-tagbar-hint muted">選一個標籤，再點{where}上的時段</span>}
    </div>
  );
}

/** menu from a day / slot "+": add one of the tags there, or a detailed event */
export function TagMenu({ ctx, day, slots, si, anchor, onClose, onOther }: {
  ctx: TagCtx; day: string; slots: Slot[]; si: number | null; anchor: HTMLElement; onClose: () => void;
  /** add a detailed event instead (opens its page) */
  onOther?: (day: string, span: [string, string] | null) => void;
}) {
  const { usable, target } = ctx;
  const [name, setName] = useState('');
  const span = si != null ? slotAddPair(slots, si) : null;
  const add = (srcId: string, optId: string) => { stampTag(ctx, { srcId, optId }, day, span); onClose(); };
  const d = toDate(day);
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <div className="pl-tagmenu">
        <div className="muted small">{d.getMonth() + 1}/{d.getDate()} 週{WD[d.getDay()]}{si != null && ` · ${slots[si].label}（${span!.join('–')}）`}</div>
        {usable.map(({ src, tp }) => (
          <div key={src.id} className="pl-tagmenu-group">
            {usable.length > 1 && <div className="pl-tagmenu-src"><span className="pl-src-dot" style={{ background: `var(--c-${src.color})` }} /> {sourceName(src)}</div>}
            {(tp?.options || []).length > 0
              ? <div className="pl-tag-pills">{tp!.options!.map((o) => <button key={o.id} className={`tag tag-${o.color} pl-tag-pill`} onClick={() => add(src.id, o.id)}>{o.name}</button>)}</div>
              : <div className="muted small">還沒有標籤，在下面輸入名稱就能建立。</div>}
          </div>
        ))}
        {target && (
          <input className="input sm" placeholder="新增標籤並加上，按 Enter" value={name} aria-label="新增標籤" autoFocus={!usable.some((u) => u.tp?.options?.length)}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (isImeKey(e) || e.key !== 'Enter' || !name.trim()) return;
              e.preventDefault();
              const id = ctx.createTag(name);
              if (id) add(target.id, id);
            }} />
        )}
        {onOther && (
          <button className="menu-item pl-tagmenu-more" onClick={() => { onClose(); onOther(day, span); }}>
            <Icon.plus size={13} /> 其他行程（填寫詳細內容）
          </button>
        )}
      </div>
    </Popover>
  );
}

/** edit a list of day slots (name + optional hours) */
export function SlotEditor({ slots, onChange, withTime = true }: { slots: Slot[]; onChange: (next: Slot[]) => void; withTime?: boolean }) {
  const [newItem, setNewItem] = useState('');
  const add = () => { if (!newItem.trim()) return; onChange([...slots, { id: uid(), label: newItem.trim() }]); setNewItem(''); };
  const set = (i: number, patch: Partial<Slot>) => onChange(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="pl-edit-list">
      {slots.map((s, i) => (
        <div key={s.id} className="pl-edit-row">
          <input className="input sm" value={s.label} aria-label="時段名稱" onChange={(e) => set(i, { label: e.target.value })} />
          {withTime && (
            <input className={'input sm pl-slot-time' + (s.time && !parseSpan(s.time) ? ' invalid' : '')} value={s.time || ''} aria-label={`${s.label}的時間`}
              placeholder={slotAddText(slots, i)} title="這個時段的時間，例如 13:30-17:30；在這個時段新增的行程會用這個時間"
              onChange={(e) => set(i, { time: e.target.value || undefined })} />
          )}
          <button className="btn-icon xs" title="上移" disabled={i === 0} onClick={() => { const a = [...slots]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }}>↑</button>
          <button className="btn-icon xs" title="刪除" onClick={() => onChange(slots.filter((y) => y.id !== s.id))}><Icon.x size={12} /></button>
        </div>
      ))}
      <div className="pl-edit-row">
        <input className="input sm" placeholder="新增時段，例如：清晨、中午" value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isImeKey(e)) add(); }} />
        <button className="btn-outline sm" disabled={!newItem.trim()} onClick={add}>新增</button>
      </div>
    </div>
  );
}

export const defaultSlots = (): Slot[] => ['上午', '下午', '晚上'].map((label) => ({ id: uid(), label }));
