import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { Page, PlannerWidget } from '../../types';
import { addRow, createDatabasePage, getState, patchPage, useStore } from '../../store';
import { navigate, openPeek } from '../../ui';
import { uid } from '../../utils';
import { DateVal, datePart, daysCovered, formatTime, hasTime, parseDateValue, timePart, toDate, toLocalIso } from '../../dates';
import { slotsOf, updateEntry, updatePlanner } from '../../planner';
import { Editable } from '../Editable';
import { Icon } from '../Icons';
import { PageIcon } from '../EmojiPicker';

export interface WidgetProps {
  page: Page;
  w: PlannerWidget;
  pkey: string;
  prevKey: string;
  days: string[];
  anchor: Date;
  readOnly: boolean;
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const todayIso = () => toLocalIso(new Date(), false);

function useEntry(p: WidgetProps) {
  const data = p.page.planner?.entries[p.pkey]?.[p.w.id] ?? {};
  const set = (fn: (d: any) => any, kind: 'structural' | 'typing' = 'structural') => updateEntry(p.page.id, p.pkey, p.w.id, fn, kind);
  return [data, set] as const;
}

/** textarea that grows with its content */
export function AutoText({ value, onChange, placeholder, readOnly, className, onKeyDown, inputRef }: {
  value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean; className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={(el) => { ref.current = el; inputRef?.(el); }}
      className={'auto-text ' + (className || '')}
      rows={1}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

/* ---------------- events from a database ---------------- */

export function useEvents(dbId: string | undefined, days: string[]) {
  const pages = useStore((s) => s.pages);
  const db = useStore((s) => (dbId ? s.dbs[dbId] : undefined));
  return useMemo(() => {
    if (!db) return [] as { row: Page; d: DateVal }[];
    const prop = db.properties.find((p) => p.type === 'date');
    if (!prop) return [];
    const set = new Set(days);
    const out: { row: Page; d: DateVal }[] = [];
    Object.values(pages).forEach((r) => {
      if (r.rowOf !== db.id || r.trashed) return;
      const d = parseDateValue(r.props?.[prop.id]);
      if (d && daysCovered(d).some((x) => set.has(x))) out.push({ row: r, d });
    });
    return out.sort((a, b) => toDate(a.d.start).getTime() - toDate(b.d.start).getTime());
  }, [pages, db, days]);
}

function EventChip({ ev, day }: { ev: { row: Page; d: DateVal }; day?: string }) {
  const t = hasTime(ev.d.start) && (!day || datePart(ev.d.start) === day) ? timePart(ev.d.start) : '';
  return (
    <div className="pl-event" onClick={() => openPeek(ev.row.id)} title={ev.row.title}>
      {t && <span className="pl-event-time">{t}</span>}
      {ev.row.icon && !/^(https?:|data:)/.test(ev.row.icon) && <span>{ev.row.icon}</span>}
      <span className="pl-event-title">{ev.row.title || '未命名'}</span>
    </div>
  );
}

/** add an event to the widget's database on a given day (optionally at a time) */
export function addEvent(dbId: string, day: string, time?: string) {
  const db = getState().dbs[dbId];
  const prop = db?.properties.find((p) => p.type === 'date');
  if (!db || !prop) return;
  let value = day;
  if (time) {
    const e = toDate(`${day}T${time}`);
    e.setHours(e.getHours() + 1);
    value = `${day}T${time}/${toLocalIso(e, true)}`;
  }
  openPeek(addRow(db.id, { [prop.id]: value }));
}

/* ---------------- notes ---------------- */

export function NotesWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  return (
    <Editable html={data.html || ''} className="pl-notes" placeholder="寫點什麼…" readOnly={p.readOnly}
      onChange={(html) => set(() => ({ html }), 'typing')} />
  );
}

/* ---------------- list (todo / goals) ---------------- */

interface Item { id: string; text: string; done?: boolean }

export function ListWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const items: Item[] = data.items || [];
  const style = p.w.opts?.style || 'check';
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const focus = (id: string, end = true) => setTimeout(() => {
    const el = refs.current[id];
    if (el) { el.focus(); const n = end ? el.value.length : 0; el.setSelectionRange(n, n); }
  }, 0);
  const prevUnfinished: Item[] = ((p.page.planner?.entries[p.prevKey]?.[p.w.id]?.items) || []).filter((i: Item) => !i.done && i.text.trim());

  const setItems = (fn: (list: Item[]) => Item[], kind: 'structural' | 'typing' = 'structural') =>
    set((d) => ({ ...d, items: fn([...(d.items || [])]) }), kind);
  const addAfter = (idx: number) => {
    const it = { id: uid(), text: '' };
    setItems((l) => { l.splice(idx + 1, 0, it); return l; });
    focus(it.id);
  };

  return (
    <div className="pl-list">
      {items.map((it, i) => (
        <div key={it.id} className={'pl-item' + (it.done ? ' done' : '')}>
          {style === 'check' && (
            <span className={'checkbox' + (it.done ? ' on' : '')} onClick={() => !p.readOnly && setItems((l) => l.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}>
              {it.done && <Icon.check size={12} />}
            </span>
          )}
          {style === 'bullet' && <span className="pl-bullet">•</span>}
          {style === 'number' && <span className="pl-num">{i + 1}.</span>}
          <AutoText value={it.text} readOnly={p.readOnly} placeholder={style === 'check' ? '待辦事項' : '輸入內容'}
            inputRef={(el) => (refs.current[it.id] = el)}
            onChange={(v) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, text: v.replace(/\n/g, '') } : x)), 'typing')}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') { e.preventDefault(); addAfter(i); }
              if (e.key === 'Backspace' && !it.text) {
                e.preventDefault();
                setItems((l) => l.filter((x) => x.id !== it.id));
                if (items[i - 1]) focus(items[i - 1].id);
              }
              if (e.key === 'ArrowUp' && items[i - 1]) { e.preventDefault(); focus(items[i - 1].id); }
              if (e.key === 'ArrowDown' && items[i + 1]) { e.preventDefault(); focus(items[i + 1].id); }
            }} />
          {!p.readOnly && <button className="pl-del" title="刪除" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>×</button>}
        </div>
      ))}
      {!p.readOnly && (
        <div className="pl-add" onClick={() => addAfter(items.length - 1)}><Icon.plus size={13} /> 新增</div>
      )}
      {!p.readOnly && style === 'check' && prevUnfinished.length > 0 && !items.some((i) => prevUnfinished.some((x) => x.text === i.text)) && (
        <button className="btn-ghost sm muted pl-carry" onClick={() => setItems((l) => [...l, ...prevUnfinished.map((x) => ({ id: uid(), text: x.text }))])}>
          <Icon.undo size={12} /> 帶入上一期未完成的 {prevUnfinished.length} 項
        </button>
      )}
    </div>
  );
}

/* ---------------- month calendar ---------------- */

export function MonthWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const ws = p.page.planner?.style.weekStart ?? 1;
  const first = new Date(p.anchor.getFullYear(), p.anchor.getMonth(), 1);
  const lead = (first.getDay() - ws + 7) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => toLocalIso(new Date(first.getFullYear(), first.getMonth(), i + 1), false))];
  while (cells.length % 7) cells.push(null);
  const monthDays = useMemo(() => cells.filter(Boolean) as string[], [p.pkey]); // eslint-disable-line
  const events = useEvents(p.w.opts?.dbId, monthDays);
  const today = todayIso();
  return (
    <div className="pl-month">
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="pl-month-dow">{WD[(i + ws) % 7]}</div>)}
      {cells.map((iso, i) => iso ? (
        <div key={iso} className={'pl-month-cell' + (iso === today ? ' today' : '') + ([0, 6].includes(toDate(iso).getDay()) ? ' weekend' : '')}>
          <div className="pl-month-num">
            <span>{toDate(iso).getDate()}</span>
            {p.w.opts?.dbId && !p.readOnly && <button className="pl-mini-add" title="新增行程" onClick={() => addEvent(p.w.opts!.dbId!, iso)}><Icon.plus size={11} /></button>}
          </div>
          {events.filter((e) => daysCovered(e.d).includes(iso)).map((e) => <EventChip key={e.row.id} ev={e} day={iso} />)}
          <AutoText value={data.days?.[iso] || ''} readOnly={p.readOnly} className="pl-cell-text"
            onChange={(v) => set((d) => ({ ...d, days: { ...(d.days || {}), [iso]: v } }), 'typing')} />
        </div>
      ) : <div key={'x' + i} className="pl-month-cell empty" />)}
    </div>
  );
}

/* ---------------- time slots ---------------- */

export function SlotsWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const slots = slotsOf(p.w);
  const hourly = p.w.opts?.slotMode === 'hourly';
  const events = useEvents(p.w.opts?.dbId, p.days);
  const today = todayIso();
  const step = p.w.opts?.step || 60;
  const inSlot = (ev: { d: DateVal }, day: string, key: string) => {
    if (!hasTime(ev.d.start) || datePart(ev.d.start) !== day) return false;
    const [h, m] = timePart(ev.d.start).split(':').map(Number);
    const [sh, sm] = key.split(':').map(Number);
    const t = h * 60 + m, s = sh * 60 + sm;
    return t >= s && t < s + step;
  };
  const showLabels = slots.some((s) => s.label);
  const single = p.days.length === 1;
  return (
    <div className="pl-slots-wrap">
      <table className={'pl-slots' + (single ? ' single' : '') + (hourly ? ' hourly' : '')}>
        {!single && (
          <thead>
            <tr>
              {showLabels && <th className="pl-slot-label" />}
              {p.days.map((d) => {
                const x = toDate(d);
                return <th key={d} className={d === today ? 'today' : ''}><span className="pl-dow">週{WD[x.getDay()]}</span> <span className="pl-date">{x.getMonth() + 1}/{x.getDate()}</span></th>;
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {p.w.opts?.dbId && !hourly && (
            <tr className="pl-ev-row">
              {showLabels && <td className="pl-slot-label">行程</td>}
              {p.days.map((d) => (
                <td key={d}>
                  {events.filter((e) => daysCovered(e.d).includes(d)).map((e) => <EventChip key={e.row.id} ev={e} day={d} />)}
                  {!p.readOnly && <button className="pl-mini-add" title="新增行程" onClick={() => addEvent(p.w.opts!.dbId!, d)}><Icon.plus size={11} /></button>}
                </td>
              ))}
            </tr>
          )}
          {slots.map((s) => (
            <tr key={s.key}>
              {showLabels && <td className="pl-slot-label">{hourly ? formatTime(s.label) : s.label}</td>}
              {p.days.map((d) => {
                const k = `${d}|${s.key}`;
                return (
                  <td key={d} className={d === today && !single ? 'today' : ''}>
                    {hourly && events.filter((e) => inSlot(e, d, s.key)).map((e) => <EventChip key={e.row.id} ev={e} day={d} />)}
                    <AutoText value={data.cells?.[k] || ''} readOnly={p.readOnly} className="pl-cell-text"
                      onChange={(v) => set((x) => ({ ...x, cells: { ...(x.cells || {}), [k]: v } }), 'typing')} />
                    {hourly && p.w.opts?.dbId && !p.readOnly && <button className="pl-mini-add" title="在此時段新增行程" onClick={() => addEvent(p.w.opts!.dbId!, d, s.key)}><Icon.plus size={11} /></button>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- schedule (database) ---------------- */

export function DbPicker({ page, w, onPicked }: { page: Page; w: PlannerWidget; onPicked?: () => void }) {
  const dbs = useStore((s) => s.dbs);
  const pages = useStore((s) => s.pages);
  const options = Object.values(dbs).filter((d) => d.properties.some((p) => p.type === 'date') && !pages[d.hostPageId]?.trashed);
  const setDb = (dbId: string | undefined) => updatePlanner(page.id, (pl) => {
    const x = pl.widgets.find((y) => y.id === w.id);
    if (x) x.opts = { ...(x.opts || {}), dbId };
  });
  const titleOf = (dbId: string) => { const d = dbs[dbId]; return d.inline ? d.title || '未命名資料庫' : pages[d.hostPageId]?.title || '未命名資料庫'; };
  return (
    <div className="pl-dbpick">
      <select className="select-sm" value={w.opts?.dbId || ''} onChange={(e) => { setDb(e.target.value || undefined); onPicked?.(); }}>
        <option value="">（不連結資料庫）</option>
        {options.map((d) => <option key={d.id} value={d.id}>{titleOf(d.id)}</option>)}
      </select>
      <button className="btn-ghost sm" onClick={() => {
        const pid = createDatabasePage(page.id, 'calendar', false);
        const dbId = getState().pages[pid].dbId!;
        // name the new database after the widget so it is easy to find in the sidebar
        patchPage(pid, { title: `${page.title || '手帳'} · ${w.title}`, icon: '📌' }, 'silent');
        setDb(dbId);
        onPicked?.();
      }}><Icon.plus size={12} /> 建立新的行程資料庫</button>
    </div>
  );
}

export function ScheduleWidget(p: WidgetProps) {
  const dbId = p.w.opts?.dbId;
  const db = useStore((s) => (dbId ? s.dbs[dbId] : undefined));
  const events = useEvents(dbId, p.days);
  if (!dbId || !db) {
    return (
      <div className="pl-empty">
        <div className="muted small">行程會從資料庫讀取，和行事曆、表格同步。請選擇一個有日期欄位的資料庫：</div>
        {!p.readOnly && <DbPicker page={p.page} w={p.w} />}
      </div>
    );
  }
  const byDay = new Map<string, { row: Page; d: DateVal }[]>();
  events.forEach((e) => {
    const d = p.days.includes(datePart(e.d.start)) ? datePart(e.d.start) : p.days[0];
    byDay.set(d, [...(byDay.get(d) || []), e]);
  });
  const today = todayIso();
  const addDay = p.days.includes(today) ? today : p.days[0];
  return (
    <div className="pl-schedule">
      {events.length === 0 && <div className="muted small" style={{ padding: '4px 2px' }}>這段期間沒有行程。</div>}
      {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => (
        <div key={d} className="pl-sch-day">
          {p.days.length > 1 && <div className={'pl-sch-date' + (d === today ? ' today' : '')}>{toDate(d).getMonth() + 1}/{toDate(d).getDate()} 週{WD[toDate(d).getDay()]}</div>}
          <div className="pl-sch-items">{list.map((e) => <EventChip key={e.row.id} ev={e} day={d} />)}</div>
        </div>
      ))}
      {!p.readOnly && <div className="pl-add" onClick={() => addEvent(dbId, addDay)}><Icon.plus size={13} /> 新增行程</div>}
      <div className="pl-sch-src muted small" onClick={() => navigate(db.hostPageId)}>
        <PageIcon icon={getState().pages[db.hostPageId]?.icon} size={12} /> 來源：{db.inline ? db.title || '未命名資料庫' : getState().pages[db.hostPageId]?.title || '未命名資料庫'}
      </div>
    </div>
  );
}

/* ---------------- habit tracker ---------------- */

export function HabitWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const habits = p.w.opts?.habits || [];
  const checks: Record<string, boolean> = data.checks || {};
  const today = todayIso();
  const toggle = (k: string) => !p.readOnly && set((d) => ({ ...d, checks: { ...(d.checks || {}), [k]: !d.checks?.[k] } }));
  if (!habits.length) return <div className="muted small pl-empty">在區塊設定（⚙）中新增要追蹤的習慣。</div>;
  if (p.days.length === 1) {
    const d = p.days[0];
    return (
      <div className="pl-list">
        {habits.map((h) => (
          <div key={h.id} className={'pl-item' + (checks[`${h.id}|${d}`] ? ' done-soft' : '')}>
            <span className={'checkbox' + (checks[`${h.id}|${d}`] ? ' on' : '')} onClick={() => toggle(`${h.id}|${d}`)}>{checks[`${h.id}|${d}`] && <Icon.check size={12} />}</span>
            <span className="pl-habit-name">{h.name}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="pl-habit-wrap">
      <table className={'pl-habit' + (p.days.length > 7 ? ' dense' : '')}>
        <thead>
          <tr>
            <th className="pl-habit-name" />
            {p.days.map((d) => <th key={d} className={d === today ? 'today' : ''} title={d}>{p.days.length > 7 ? toDate(d).getDate() : `週${WD[toDate(d).getDay()]}`}</th>)}
            <th className="pl-habit-count">達成</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => {
            const n = p.days.filter((d) => checks[`${h.id}|${d}`]).length;
            return (
              <tr key={h.id}>
                <td className="pl-habit-name">{h.name}</td>
                {p.days.map((d) => {
                  const k = `${h.id}|${d}`;
                  return <td key={d} className={'pl-habit-cell' + (checks[k] ? ' on' : '') + (d === today ? ' today' : '')} onClick={() => toggle(k)}>{checks[k] ? '●' : ''}</td>;
                })}
                <td className="pl-habit-count">{n}/{p.days.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const WIDGETS: Record<PlannerWidget['type'], (p: WidgetProps) => React.ReactElement | null> = {
  notes: NotesWidget, list: ListWidget, month: MonthWidget, slots: SlotsWidget, schedule: ScheduleWidget, habit: HabitWidget,
};
