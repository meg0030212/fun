import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Database, Page, PlannerSource, PlannerWidget, Property, SelectOption } from '../../types';
import { addRow, createDatabasePage, getState, makeProp, patchPage, trashPage, updateDb, useStore } from '../../store';
import { navigate, openPeek } from '../../ui';
import { COLORS, uid } from '../../utils';
import { Popover } from '../Popover';
import { DateVal, datePart, daysCovered, formatTime, hasTime, parseDateValue, timePart, toDate, toLocalIso } from '../../dates';
import { addSource, slotsOf, updateEntry, updatePlanner, updateSource } from '../../planner';
import { defaultsFromFilters, filterRows } from '../db/dbutils';
import { useGrid } from '../../gridNav';
import { isImeKey, useImeValue } from '../../ime';
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
  const ime = useImeValue(value, onChange);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, [ime.value]);
  return (
    <textarea
      ref={(el) => { ref.current = el; inputRef?.(el); }}
      className={'auto-text ' + (className || '')}
      rows={1}
      {...ime}
      placeholder={placeholder}
      readOnly={readOnly}
      onKeyDown={onKeyDown}
    />
  );
}

/* ---------------- events from linked sources ---------------- */

export type Ev = { row: Page; d: DateVal; src: PlannerSource; tags: SelectOption[] };

/** visible planner sources this block shows */
export function widgetSources(page: Page, w: PlannerWidget): PlannerSource[] {
  const all = (page.planner?.sources || []).filter((s) => !s.hidden);
  const pick = w.opts?.sourceIds;
  return pick ? all.filter((s) => pick.includes(s.id)) : all;
}

export function sourceDateProp(db: Database | undefined, src: PlannerSource) {
  return db?.properties.find((p) => p.id === src.dateProp && p.type === 'date') || db?.properties.find((p) => p.type === 'date');
}

export function dbTitle(dbId: string): string {
  const s = getState();
  const d = s.dbs[dbId];
  if (!d) return '（已刪除的資料庫）';
  return d.inline ? d.title || '未命名資料庫' : s.pages[d.hostPageId]?.title || '未命名資料庫';
}

export function sourceName(src: PlannerSource): string {
  return src.name?.trim() || dbTitle(src.dbId);
}

/* ---------------- tags ---------------- */

const isTagType = (p: Property) => p.type === 'select' || p.type === 'multi_select';

/** the select / multi-select property a source uses as tags: the chosen one, else the first one its filters don't fix */
export function sourceTagProp(db: Database | undefined, src: PlannerSource): Property | undefined {
  if (!db || src.tagProp === 'none') return undefined;
  const chosen = db.properties.find((p) => p.id === src.tagProp && isTagType(p));
  if (chosen) return chosen;
  const fixed = new Set(src.filters.map((f) => f.propId));
  const free = db.properties.filter((p) => isTagType(p) && !fixed.has(p.id));
  // only a field that sounds like tags / people is picked by itself (not e.g. 優先順序); others are chosen in the source settings
  return free.find((p) => /標籤|标签|tag|label|人員|人员|成員|成员|對象|对象|學長|学长|學姊|學姐|負責|负责|people|person|who/i.test(p.name));
}

function rowTags(row: Page, prop: Property | undefined): SelectOption[] {
  if (!prop) return [];
  const v = row.props?.[prop.id];
  const ids: string[] = Array.isArray(v) ? v : v ? [v] : [];
  return ids.map((id) => prop.options?.find((o) => o.id === id)).filter((o): o is SelectOption => !!o);
}

/** add a tag option to the source's tag property (creating a 「標籤」 property when the database has none) */
export function createTag(pageId: string, src: PlannerSource, name: string): string | null {
  const db = getState().dbs[src.dbId];
  if (!db || !name.trim()) return null;
  name = name.trim();
  const tp = sourceTagProp(db, src);
  const same = tp?.options?.find((o) => o.name === name);
  if (same) return same.id;
  const used = new Set((tp?.options || []).map((o) => o.color));
  const free = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray'].filter((c) => !used.has(c));
  const color = free[0] || COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];
  const opt: SelectOption = { id: uid(), name, color };
  if (tp) {
    updateDb(db.id, (d) => { const x = d.properties.find((y) => y.id === tp.id); if (x) x.options = [...(x.options || []), opt]; });
  } else {
    const names = new Set(db.properties.map((p) => p.name));
    const np = makeProp('select', ['標籤', '行程標籤', '手帳標籤'].find((n) => !names.has(n)) || '手帳標籤 ' + (db.properties.length + 1), { options: [opt] });
    updateDb(db.id, (d) => { d.properties.push(np); });
    updateSource(pageId, src.id, (x) => { x.tagProp = np.id; });
  }
  return opt.id;
}

/** add an event carrying one tag straight to the database (no detail window); span = ["HH:mm", "HH:mm"] */
export function addTaggedEvent(src: PlannerSource, day: string, optId: string, span?: [string, string] | null): string | null {
  const db = getState().dbs[src.dbId];
  const prop = sourceDateProp(db, src);
  const tp = sourceTagProp(db, src);
  if (!db || !prop || !tp) return null;
  const opt = tp.options?.find((o) => o.id === optId);
  const value = span ? `${day}T${span[0]}/${day}T${span[1]}` : day;
  return addRow(db.id, {
    ...defaultsFromFilters(db, { filters: src.filters }),
    [prop.id]: value,
    [tp.id]: tp.type === 'multi_select' ? [optId] : optId,
  }, opt?.name || '');
}

/* ---------------- day slots (上午／下午／晚上…) ---------------- */

type Slot = { id: string; label: string; time?: string };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "13:30-17:30" (also 13：30～17：30, 1330-1730) → minutes */
export function parseSpan(t?: string): [number, number] | null {
  if (!t) return null;
  const m = t.replace(/：/g, ':').match(/^\s*(\d{1,2}):?(\d{2})\s*[-–~～至到]\s*(\d{1,2}):?(\d{2})\s*$/);
  if (!m) return null;
  const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
  return a < b && b <= 24 * 60 ? [a, b] : null;
}

/** usual hours a slot name means, used for events added to it */
const LABEL_TIMES: [RegExp, string][] = [
  [/清晨|早晨|早上|上午|morning|\bam\b/i, '09:00-12:00'],
  [/中午|午餐|noon|lunch/i, '12:00-13:30'],
  [/下午|afternoon|\bpm\b/i, '13:30-17:30'],
  [/傍晚|dusk/i, '17:30-19:00'],
  [/晚上|夜|evening|night/i, '19:00-21:00'],
];

/** evenly share 08:00–20:00 between slots whose name says nothing about time */
function positional(i: number, n: number): [number, number] {
  const step = Math.floor((12 * 60) / Math.max(1, n) / 30) * 30 || 30;
  return [8 * 60 + i * step, 8 * 60 + (i + 1) * step];
}

/** hours given to events added in slot i */
export function slotAddSpan(slots: Slot[], i: number): [number, number] {
  const s = slots[i];
  return parseSpan(s.time) || parseSpan(LABEL_TIMES.find(([re]) => re.test(s.label))?.[1]) || positional(i, slots.length);
}
export const slotAddText = (slots: Slot[], i: number) => slotAddSpan(slots, i).map(hm).join('-');

/** hours whose events land in slot i */
function slotPlaceRange(slots: Slot[], i: number): [number, number] {
  return parseSpan(slots[i].time) || slotRange(slots[i].label) || positional(i, slots.length);
}

export function useSourceEvents(page: Page, w: PlannerWidget, days: string[]): Ev[] {
  const pages = useStore((s) => s.pages);
  const dbs = useStore((s) => s.dbs);
  const sources = widgetSources(page, w);
  const sig = JSON.stringify(sources);
  return useMemo(() => {
    const set = new Set(days);
    const out: Ev[] = [];
    const seen = new Set<string>();
    sources.forEach((src) => {
      const db = dbs[src.dbId];
      const prop = sourceDateProp(db, src);
      const tp = sourceTagProp(db, src);
      if (!db || !prop) return;
      const rows = filterRows(Object.values(pages).filter((r) => r.rowOf === db.id && !r.trashed), db, src.filters);
      rows.forEach((r) => {
        if (seen.has(r.id)) return; // the same row can match two sources of one database
        const d = parseDateValue(r.props?.[prop.id]);
        if (d && daysCovered(d).some((x) => set.has(x))) { out.push({ row: r, d, src, tags: rowTags(r, tp) }); seen.add(r.id); }
      });
    });
    return out.sort((a, b) => toDate(a.d.start).getTime() - toDate(b.d.start).getTime());
  }, [pages, dbs, sig, days]); // eslint-disable-line
}

function EventChip({ ev, day, showTime = true, onRemove, onClick }: {
  ev: Ev; day?: string; showTime?: boolean; onRemove?: () => void; onClick?: (e: React.MouseEvent) => boolean | void;
}) {
  const t = showTime && hasTime(ev.d.start) && (!day || datePart(ev.d.start) === day) ? timePart(ev.d.start) : '';
  const tagNames = ev.tags.map((o) => o.name).join('、');
  const label = ev.row.title || tagNames;
  // a tagged event takes its tag's colour, so each person / kind of work is easy to tell apart
  const tag = ev.tags[0];
  const style = tag
    ? { background: `var(--t-${tag.color})`, borderLeftColor: `var(--c-${tag.color === 'default' ? 'gray' : tag.color})` }
    : { background: `var(--b-${ev.src.color})`, borderLeftColor: `var(--c-${ev.src.color})` };
  const timeText = hasTime(ev.d.start) ? timePart(ev.d.start) + (ev.d.end && hasTime(ev.d.end) && datePart(ev.d.end) === datePart(ev.d.start) ? '–' + timePart(ev.d.end) : '') : '';
  return (
    <div className={'pl-event' + (tag ? ' tagged' : '')} data-ev={ev.row.id}
      onClick={(e) => { if (onClick?.(e) === true) return; openPeek(ev.row.id); }}
      title={[timeText, label, tagNames && tagNames !== label ? tagNames : '', sourceName(ev.src)].filter(Boolean).join(' · ')}
      style={style}>
      {t && <span className="pl-event-time">{t}</span>}
      {ev.row.icon && !/^(https?:|data:)/.test(ev.row.icon) && <span>{ev.row.icon}</span>}
      {label && <span className="pl-event-title">{label}</span>}
      {onRemove && <button className="pl-event-x" title="移除" aria-label="移除" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
    </div>
  );
}

/** the source new events go to: the planner default if this block shows it, else the block's first source */
export function targetSource(page: Page, w: PlannerWidget): PlannerSource | undefined {
  const list = widgetSources(page, w);
  return list.find((s) => s.id === page.planner?.addTo) || list[0];
}

/** add an event on a day (optionally at a time); the source's filters pre-fill the row (e.g. 類別 = 工作) */
export function addEvent(src: PlannerSource | undefined, day: string, time?: string, end?: string) {
  if (!src) return;
  const db = getState().dbs[src.dbId];
  const prop = sourceDateProp(db, src);
  if (!db || !prop) return;
  let value = day;
  if (time && end) value = `${day}T${time}/${day}T${end}`;
  else if (time) {
    const e = toDate(`${day}T${time}`);
    e.setHours(e.getHours() + 1);
    value = `${day}T${time}/${toLocalIso(e, true)}`;
  }
  openPeek(addRow(db.id, { ...defaultsFromFilters(db, { filters: src.filters }), [prop.id]: value }));
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
              if (isImeKey(e)) return;
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

type Brush = { srcId: string; optId: string };

/** sources of this block that can hold dated rows */
function useUsableSources(page: Page, w: PlannerWidget) {
  const dbs = useStore((s) => s.dbs);
  return widgetSources(page, w).filter((s) => sourceDateProp(dbs[s.dbId], s)).map((src) => ({ src, tp: sourceTagProp(dbs[src.dbId], src) }));
}

const freshSource = (pageId: string, id: string) => getState().pages[pageId]?.planner?.sources?.find((s) => s.id === id);

/** row of tags above the calendar: pick one, then click time slots to stamp it on */
function TagBar({ page, w, brush, setBrush }: { page: Page; w: PlannerWidget; brush: Brush | null; setBrush: (b: Brush | null) => void }) {
  const usable = useUsableSources(page, w);
  const target = targetSource(page, w);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (!usable.length) return null;
  const create = () => {
    if (!target || !name.trim()) return;
    const id = createTag(page.id, target, name);
    setName('');
    setAdding(false);
    if (id) setBrush({ srcId: target.id, optId: id });
  };
  const current = brush && usable.find((u) => u.src.id === brush.srcId)?.tp?.options?.find((o) => o.id === brush.optId);
  return (
    <div className="pl-tagbar">
      <span className="pl-tagbar-label">快速標籤</span>
      {usable.map(({ src, tp }) => (
        <React.Fragment key={src.id}>
          {usable.length > 1 && (tp?.options?.length || 0) > 0 && <span className="pl-src-dot" title={sourceName(src)} style={{ background: `var(--c-${src.color})` }} />}
          {(tp?.options || []).map((o) => {
            const on = brush?.srcId === src.id && brush.optId === o.id;
            return (
              <button key={o.id} className={`tag tag-${o.color} pl-tag-pill` + (on ? ' on' : '')} aria-pressed={on}
                title={on ? '再按一次結束' : `選取後，點月曆上的時段就會加上「${o.name}」`}
                onClick={() => setBrush(on ? null : { srcId: src.id, optId: o.id })}>{o.name}</button>
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
      {current
        ? <span className="pl-tagbar-hint">點月曆上的時段加上「{current.name}」，再點一次就移除 · 按 Esc 結束</span>
        : usable.some((u) => u.tp?.options?.length) && <span className="pl-tagbar-hint muted">選一個標籤，再點月曆上的時段</span>}
    </div>
  );
}

/** menu from a day / slot "+": add one of the tags there, or a detailed event */
function TagMenu({ page, w, day, slots, si, anchor, onClose }: {
  page: Page; w: PlannerWidget; day: string; slots: Slot[]; si: number | null; anchor: HTMLElement; onClose: () => void;
}) {
  const usable = useUsableSources(page, w);
  const target = targetSource(page, w);
  const [name, setName] = useState('');
  const span = si != null ? slotAddSpan(slots, si) : null;
  const spanStr = span ? [hm(span[0]), hm(span[1])] as [string, string] : null;
  const add = (srcId: string, optId: string) => { const src = freshSource(page.id, srcId); if (src) addTaggedEvent(src, day, optId, spanStr); onClose(); };
  const d = toDate(day);
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <div className="pl-tagmenu">
        <div className="muted small">{d.getMonth() + 1}/{d.getDate()} 週{WD[d.getDay()]}{si != null && ` · ${slots[si].label}（${spanStr!.join('–')}）`}</div>
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
              const id = createTag(page.id, target, name);
              if (id) add(target.id, id);
            }} />
        )}
        {target && (
          <button className="menu-item pl-tagmenu-more" onClick={() => { onClose(); addEvent(target, day, spanStr?.[0], spanStr?.[1]); }}>
            <Icon.plus size={13} /> 其他行程（填寫詳細內容）
          </button>
        )}
      </div>
    </Popover>
  );
}

export function MonthWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const ws = p.page.planner?.style.weekStart ?? 1;
  const first = new Date(p.anchor.getFullYear(), p.anchor.getMonth(), 1);
  const lead = (first.getDay() - ws + 7) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => toLocalIso(new Date(first.getFullYear(), first.getMonth(), i + 1), false))];
  while (cells.length % 7) cells.push(null);
  const monthDays = useMemo(() => cells.filter(Boolean) as string[], [p.pkey]); // eslint-disable-line
  const events = useSourceEvents(p.page, p.w, monthDays);
  const usable = useUsableSources(p.page, p.w);
  const target = targetSource(p.page, p.w);
  const today = todayIso();
  const showTime = !p.w.opts?.hideTime;
  const hasTags = usable.some((u) => u.tp?.options?.length);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [menu, setMenu] = useState<{ day: string; si: number | null; anchor: HTMLElement } | null>(null);
  // optional split of every day into slots such as 上午／下午／晚上
  const daySlots: Slot[] = p.w.opts?.slotMode === 'custom' ? (p.w.opts.slots || []) : [];
  const ns = daySlots.length;
  const ranges = daySlots.map((_, i) => slotPlaceRange(daySlots, i));
  const slotOf = (ev: Ev, iso: string): string | null => {
    if (!ns || !hasTime(ev.d.start) || datePart(ev.d.start) !== iso) return null;
    const [h, m] = timePart(ev.d.start).split(':').map(Number);
    const t = h * 60 + m;
    // the narrowest slot that holds the time (17:30 goes to 傍晚 rather than 下午)
    let best = -1;
    ranges.forEach((r, i) => { if (t >= r[0] && t < r[1] && (best < 0 || r[1] - r[0] < ranges[best][1] - ranges[best][0])) best = i; });
    return best >= 0 ? daySlots[best].id : null;
  };

  useEffect(() => {
    if (!brush) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBrush(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [brush]);

  /** stamping with the chosen tag: add it to the day / slot, or take it off when it is already there */
  const stamp = (iso: string, si: number | null) => {
    if (!brush) return;
    const src = freshSource(p.page.id, brush.srcId);
    if (!src) { setBrush(null); return; }
    const here = events.filter((e) => e.src.id === src.id && e.tags.some((o) => o.id === brush.optId) && daysCovered(e.d).includes(iso)
      && (si == null ? !slotOf(e, iso) || !ns : slotOf(e, iso) === daySlots[si].id));
    if (here.length) { here.forEach((e) => trashPage(e.row.id)); return; }
    const span = si != null ? slotAddSpan(daySlots, si) : null;
    addTaggedEvent(src, iso, brush.optId, span ? [hm(span[0]), hm(span[1])] : null);
  };
  const removable = (e: Ev) => !p.readOnly && e.tags.length > 0;
  const chip = (e: Ev, iso: string) => (
    <EventChip key={e.row.id} ev={e} day={iso} showTime={showTime}
      onRemove={removable(e) ? () => trashPage(e.row.id) : undefined}
      onClick={() => !!brush} />
  );

  const setNote = (key: string, v: string) => set((d) => ({ ...d, days: { ...(d.days || {}), [key]: v } }), 'typing');
  // grid coordinates → note key (slotted: row = week × slots + slot)
  const keyAt = (r: number, c: number): string | null => {
    const week = ns ? Math.floor(r / ns) : r;
    const iso = cells[week * 7 + c];
    if (!iso) return null;
    return ns ? `${iso}|${daySlots[r % ns].id}` : iso;
  };
  const grid = useGrid({
    get: (r, c) => { const k = keyAt(r, c); return k ? data.days?.[k] || '' : ''; },
    apply: (changes) => set((d) => {
      const days = { ...(d.days || {}) };
      changes.forEach(({ r, c, v }) => { const k = keyAt(r, c); if (k) days[k] = v ?? ''; });
      return { ...d, days };
    }),
  });
  const openMenu = (e: React.MouseEvent<HTMLElement>, day: string, si: number | null) => {
    e.stopPropagation();
    if (!hasTags && si == null) { addEvent(target, day); return; } // no tags yet: straight to a detailed event
    setMenu({ day, si, anchor: e.currentTarget });
  };
  return (
    <>
      {!p.readOnly && !p.w.opts?.hideTagBar && <TagBar page={p.page} w={p.w} brush={brush} setBrush={setBrush} />}
      <div className={'pl-month' + (ns ? ' slotted' : '') + (brush ? ' brushing' : '')} data-gwrap={ns ? undefined : '1'} onKeyDown={grid.onKeyDown} onCopy={grid.onCopy} onCut={grid.onCut} onPaste={grid.onPaste}
        style={{ gridTemplateRows: `auto repeat(${cells.length / 7}, minmax(${ns ? 26 + ns * 26 : 84}px, 1fr))` }}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (brush && e.button === 0) {
            if (t.closest('.pl-event-x')) return;
            const cell = t.closest<HTMLElement>('.pl-month-cell[data-iso]');
            if (!cell) return;
            e.preventDefault();
            const slot = t.closest<HTMLElement>('.pl-mslot');
            stamp(cell.dataset.iso!, slot ? Number(slot.dataset.si) : null);
            return;
          }
          grid.onMouseDown(e);
          if (e.defaultPrevented || e.shiftKey) return;
          // clicking anywhere in a day (or slot) puts the caret in its text, after what is written
          if (t.closest('textarea, button, .pl-event')) return;
          const area = t.closest('.pl-mslot, .pl-month-cell') as HTMLElement | null;
          const ta = area?.querySelector('textarea');
          if (ta && !p.readOnly) { e.preventDefault(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        }}>
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="pl-month-dow">{WD[(i + ws) % 7]}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={'x' + i} className="pl-month-cell empty" />;
          const week = Math.floor(i / 7), col = i % 7;
          const dayEvents = events.filter((e) => daysCovered(e.d).includes(iso));
          const loose = dayEvents.filter((e) => !slotOf(e, iso));
          return (
            <div key={iso} data-iso={iso} className={'pl-month-cell' + (iso === today ? ' today' : '') + ([0, 6].includes(toDate(iso).getDay()) ? ' weekend' : '')}
              {...(ns ? {} : { 'data-gr': week, 'data-gc': col })}>
              <div className="pl-month-num">
                <span>{toDate(iso).getDate()}</span>
                {target && !p.readOnly && !ns && <button className="pl-mini-add" title={hasTags ? '加上標籤或行程' : `新增行程到「${sourceName(target)}」`} onClick={(e) => openMenu(e, iso, null)}><Icon.plus size={11} /></button>}
              </div>
              {loose.map((e) => chip(e, iso))}
              {ns ? <div className="pl-mslots">{daySlots.map((s, si) => (
                <div key={s.id} className="pl-mslot" data-si={si} data-gr={week * ns + si} data-gc={col}>
                  <span className="pl-mslot-label">{s.label}</span>
                  <div className="pl-mslot-body">
                    {dayEvents.filter((e) => slotOf(e, iso) === s.id).map((e) => chip(e, iso))}
                    <AutoText value={data.days?.[`${iso}|${s.id}`] || ''} readOnly={p.readOnly} className="pl-cell-text"
                      onChange={(v) => setNote(`${iso}|${s.id}`, v)} />
                  </div>
                  {target && !p.readOnly && <button className="pl-mini-add pl-mslot-add" title={`在${s.label}加上標籤或行程`} onClick={(e) => openMenu(e, iso, si)}><Icon.plus size={11} /></button>}
                </div>
              ))}</div> : (
                <AutoText value={data.days?.[iso] || ''} readOnly={p.readOnly} className="pl-cell-text" onChange={(v) => setNote(iso, v)} />
              )}
            </div>
          );
        })}
      </div>
      {menu && <TagMenu page={p.page} w={p.w} day={menu.day} slots={daySlots} si={menu.si} anchor={menu.anchor} onClose={() => setMenu(null)} />}
    </>
  );
}

/** time range (minutes) a slot name usually means, used to place timed events */
function slotRange(label: string): [number, number] | null {
  const l = label.toLowerCase();
  if (/清晨|早晨|早上|上午|morning|\bam\b/.test(l)) return [0, 12 * 60];
  if (/中午|午餐|noon|lunch/.test(l)) return [11 * 60, 14 * 60];
  if (/下午|afternoon|\bpm\b/.test(l)) return [12 * 60, 18 * 60];
  if (/傍晚|dusk/.test(l)) return [17 * 60, 19 * 60];
  if (/晚上|夜|evening|night/.test(l)) return [18 * 60, 24 * 60];
  return null;
}

/* ---------------- time slots ---------------- */

export function SlotsWidget(p: WidgetProps) {
  const [data, set] = useEntry(p);
  const slots = slotsOf(p.w);
  const hourly = p.w.opts?.slotMode === 'hourly';
  const events = useSourceEvents(p.page, p.w, p.days);
  const target = targetSource(p.page, p.w);
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
  const grid = useGrid({
    get: (r, c) => (slots[r] && p.days[c] ? data.cells?.[`${p.days[c]}|${slots[r].key}`] || '' : ''),
    apply: (changes) => set((x) => {
      const cellsMap = { ...(x.cells || {}) };
      changes.forEach(({ r, c, v }) => { if (slots[r] && p.days[c]) cellsMap[`${p.days[c]}|${slots[r].key}`] = v ?? ''; });
      return { ...x, cells: cellsMap };
    }),
  });
  const single = p.days.length === 1;
  return (
    <div className="pl-slots-wrap">
      <table className={'pl-slots' + (single ? ' single' : '') + (hourly ? ' hourly' : '')} {...grid}>
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
          {target && !hourly && (
            <tr className="pl-ev-row">
              {showLabels && <td className="pl-slot-label">行程</td>}
              {p.days.map((d) => (
                <td key={d}>
                  {events.filter((e) => daysCovered(e.d).includes(d)).map((e) => <EventChip key={e.row.id} ev={e} day={d} showTime={!p.w.opts?.hideTime} />)}
                  {!p.readOnly && <button className="pl-mini-add" title={`新增行程到「${sourceName(target)}」`} onClick={() => addEvent(target, d)}><Icon.plus size={11} /></button>}
                </td>
              ))}
            </tr>
          )}
          {slots.map((s, si) => (
            <tr key={s.key}>
              {showLabels && <td className="pl-slot-label">{hourly ? formatTime(s.label) : s.label}</td>}
              {p.days.map((d, di) => {
                const k = `${d}|${s.key}`;
                return (
                  <td key={d} className={d === today && !single ? 'today' : ''} data-gr={si} data-gc={di}>
                    {hourly && events.filter((e) => inSlot(e, d, s.key)).map((e) => <EventChip key={e.row.id} ev={e} day={d} showTime={!p.w.opts?.hideTime} />)}
                    <AutoText value={data.cells?.[k] || ''} readOnly={p.readOnly} className="pl-cell-text"
                      onChange={(v) => set((x) => ({ ...x, cells: { ...(x.cells || {}), [k]: v } }), 'typing')} />
                    {hourly && target && !p.readOnly && <button className="pl-mini-add" title={`在此時段新增行程到「${sourceName(target)}」`} onClick={() => addEvent(target, d, s.key)}><Icon.plus size={11} /></button>}
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

/* ---------------- schedule (linked sources) ---------------- */

/** pick an existing dated database, or create a new one under the planner page */
export function SourcePicker({ page, onPick, label = '連結資料庫' }: { page: Page; onPick: (dbId: string) => void; label?: string }) {
  const dbs = useStore((s) => s.dbs);
  const pages = useStore((s) => s.pages);
  const options = Object.values(dbs).filter((d) => d.properties.some((p) => p.type === 'date') && !pages[d.hostPageId]?.trashed && !pages[d.hostPageId]?.rowOf);
  return (
    <div className="pl-dbpick">
      <select className="select-sm" value="" aria-label={label} onChange={(e) => { if (e.target.value) onPick(e.target.value); }}>
        <option value="">{label}：選擇有日期欄位的資料庫…</option>
        {options.map((d) => <option key={d.id} value={d.id}>{dbTitle(d.id)}</option>)}
      </select>
      <button className="btn-ghost sm" onClick={() => {
        const pid = createDatabasePage(page.id, 'calendar', false);
        const dbId = getState().pages[pid].dbId!;
        // name the new database after the planner so it is easy to find in the sidebar
        patchPage(pid, { title: `${page.title || '手帳'} · 行程`, icon: '📌' }, 'silent');
        onPick(dbId);
      }}><Icon.plus size={12} /> 建立新的行程資料庫</button>
    </div>
  );
}

/** block settings: which planner sources this block shows */
export function WidgetSourceSelect({ page, w }: { page: Page; w: PlannerWidget }) {
  const sources = page.planner?.sources || [];
  const pick = w.opts?.sourceIds;
  const set = (ids: string[] | undefined) => updatePlanner(page.id, (pl) => {
    const x = pl.widgets.find((y) => y.id === w.id);
    if (x) x.opts = { ...(x.opts || {}), sourceIds: ids };
  });
  if (!sources.length) {
    return <div className="muted small">這本手帳還沒有連結資料。在手帳上方的「資料來源」按「＋ 連結資料」，行程就會出現在月曆、時段表和行程區塊。</div>;
  }
  return (
    <div className="pl-src-select">
      <label className="pl-src-opt"><input type="checkbox" checked={!pick} onChange={(e) => set(e.target.checked ? undefined : sources.map((s) => s.id))} /> 顯示所有資料來源</label>
      {sources.map((s) => (
        <label key={s.id} className={'pl-src-opt' + (!pick ? ' dim' : '')}>
          <input type="checkbox" disabled={!pick} checked={!pick || pick.includes(s.id)}
            onChange={(e) => set(e.target.checked ? [...(pick || []), s.id] : (pick || []).filter((x) => x !== s.id))} />
          <span className="pl-src-dot" style={{ background: `var(--c-${s.color})` }} /> {sourceName(s)}
        </label>
      ))}
    </div>
  );
}

export function ScheduleWidget(p: WidgetProps) {
  const sources = widgetSources(p.page, p.w);
  const events = useSourceEvents(p.page, p.w, p.days);
  const [to, setTo] = React.useState<string>('');
  if (!(p.page.planner?.sources || []).length) {
    return (
      <div className="pl-empty">
        <div className="muted small">行程會從資料庫讀取，和行事曆、表格同步。連結一個有日期欄位的資料庫（之後可在上方「資料來源」加入更多並設定篩選）：</div>
        {!p.readOnly && <SourcePicker page={p.page} onPick={(dbId) => addSource(p.page.id, dbId)} />}
      </div>
    );
  }
  const byDay = new Map<string, Ev[]>();
  events.forEach((e) => {
    const d = p.days.includes(datePart(e.d.start)) ? datePart(e.d.start) : p.days[0];
    byDay.set(d, [...(byDay.get(d) || []), e]);
  });
  const today = todayIso();
  const addDay = p.days.includes(today) ? today : p.days[0];
  const target = sources.find((s) => s.id === to) || targetSource(p.page, p.w);
  return (
    <div className="pl-schedule">
      {!sources.length && <div className="muted small">此區塊的資料來源目前都隱藏了。</div>}
      {sources.length > 0 && events.length === 0 && <div className="muted small" style={{ padding: '4px 2px' }}>這段期間沒有行程。</div>}
      {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => (
        <div key={d} className="pl-sch-day">
          {p.days.length > 1 && <div className={'pl-sch-date' + (d === today ? ' today' : '')}>{toDate(d).getMonth() + 1}/{toDate(d).getDate()} 週{WD[toDate(d).getDay()]}</div>}
          <div className="pl-sch-items">{list.map((e) => <EventChip key={e.row.id} ev={e} day={d} showTime={!p.w.opts?.hideTime} />)}</div>
        </div>
      ))}
      {!p.readOnly && target && (
        <div className="pl-sch-add">
          <div className="pl-add" onClick={() => addEvent(target, addDay)}><Icon.plus size={13} /> 新增行程</div>
          {sources.length > 1 && (
            <select className="select-sm" value={target.id} aria-label="新增到" onChange={(e) => setTo(e.target.value)}>
              {sources.map((s) => <option key={s.id} value={s.id}>到：{sourceName(s)}</option>)}
            </select>
          )}
        </div>
      )}
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
  const grid = useGrid({
    get: (r, c) => (habits[r] && p.days[c] && checks[`${habits[r].id}|${p.days[c]}`] ? '✓' : ''),
    apply: (changes) => !p.readOnly && set((d) => {
      const next = { ...(d.checks || {}) };
      changes.forEach(({ r, c, v }) => {
        if (!habits[r] || !p.days[c]) return;
        next[`${habits[r].id}|${p.days[c]}`] = !!v && !/^(0|false|no|否|×|x)$/i.test(v.trim()) && v.trim() !== '';
      });
      return { ...d, checks: next };
    }),
  });
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
      <table className={'pl-habit' + (p.days.length > 7 ? ' dense' : '')} {...grid}>
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
                {p.days.map((d, di) => {
                  const k = `${h.id}|${d}`;
                  return <td key={d} className={'pl-habit-cell' + (checks[k] ? ' on' : '') + (d === today ? ' today' : '')} onClick={() => toggle(k)}
                    data-gr={habits.indexOf(h)} data-gc={di} tabIndex={0} role="checkbox" aria-checked={!!checks[k]} aria-label={`${h.name} ${d}`}>{checks[k] ? '●' : ''}</td>;
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
