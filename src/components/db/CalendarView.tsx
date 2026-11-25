/* Database calendar view (month / week). Besides its own rows it can show other linked databases,
   each with a colour and its own filters; days can be split into slots (上午／下午／晚上), times can be
   hidden, and tags can be stamped onto days and slots. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Database, Page, Property, View } from '../../types';
import { createDatabasePage, getState, makeProp, patchPage, setRowProp, trashPage, updateDb, updateView, useStore } from '../../store';
import { openPeek } from '../../ui';
import { monthLabel } from '../../utils';
import { DateVal, datePart, daysCovered, endTime, formatTime, hasTime, moveDate, parseDateValue, serializeDate, timePart, toDate, toLocalIso } from '../../dates';
import {
  collectEvents, createTagOption, dbTitle, Ev, eventColors, rowTags, Slot, slotAddPair, slotIndexOf, Source, sourceDateProp, sourceName, sourceTagProp,
} from '../../eventSources';
import { Brush, defaultSlots, SlotEditor, stampTag, TagBar, TagCtx, TagMenu } from '../TagTools';
import { SourceEditor } from '../SourceEditor';
import { Icon } from '../Icons';
import { Popover } from '../Popover';
import { PageIcon } from '../EmojiPicker';
import { describeFilters, getValue, isEmpty } from './dbutils';
import { CardProps } from './Views';

interface VP {
  db: Database;
  view: View;
  rows: Page[];
  newRow: (extra?: Record<string, any>, open?: boolean) => string;
}

const HOUR_PX = 44;
const SOURCE_COLORS = ['blue', 'red', 'green', 'purple', 'orange', 'pink', 'yellow', 'brown', 'gray'];

function weekStart(d: Date) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; }

/** an event on the calendar, with the property its date lives in */
type Item = Ev & { prop: Property };

/** this database's own rows, as a source */
function selfSource(db: Database, view: View): Source {
  const prop = db.properties.find((p) => p.id === view.dateProp);
  return {
    id: 'self', dbId: db.id, color: view.calSelf?.color || 'blue', filters: view.filters,
    tagProp: view.calSelf?.tagProp, hidden: view.calSelf?.hidden, dateProp: prop?.type === 'date' ? prop.id : undefined,
  };
}

export function CalendarView({ db, view, rows, newRow }: VP) {
  const mode = view.calMode || 'month';
  const [anchor, setAnchor] = useState(() => new Date());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pop, setPop] = useState<null | { kind: 'settings' | 'link'; anchor: HTMLElement }>(null);
  const [srcEdit, setSrcEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [menu, setMenu] = useState<{ day: string; si: number | null; anchor: HTMLElement } | null>(null);
  const pages = useStore((s) => s.pages);
  const dbs = useStore((s) => s.dbs);
  const prop = db.properties.find((p) => p.id === view.dateProp);
  const gridRef = useRef<HTMLDivElement>(null);

  // scroll the week grid to the morning on open
  useEffect(() => {
    if (mode === 'week' && gridRef.current) gridRef.current.scrollTop = HOUR_PX * 7.5;
  }, [mode]);
  useEffect(() => {
    if (!brush) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBrush(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [brush]);

  const self = selfSource(db, view);
  const links = view.calLinks || [];
  const all = [self, ...links];
  const multi = links.length > 0;
  const showTime = !view.calHideTime;
  const slots: Slot[] = view.calSlotMode === 'custom' ? view.calSlots || [] : [];
  const ns = mode === 'month' ? slots.length : 0;

  /* ---------- items ---------- */
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (prop && !self.hidden) {
      const tp = sourceTagProp(db, self);
      rows.forEach((r) => {
        const v = getValue(r, prop);
        if (isEmpty(v)) return;
        const d = typeof v === 'number' ? { start: toLocalIso(new Date(v), true) } : parseDateValue(v);
        if (d) out.push({ row: r, d, src: self, tags: rowTags(r, tp), prop });
      });
    }
    const seen = new Set(out.map((x) => x.row.id));
    collectEvents(pages, dbs, links.filter((l) => !l.hidden)).forEach((ev) => {
      if (seen.has(ev.row.id)) return;
      seen.add(ev.row.id);
      out.push({ ...ev, prop: sourceDateProp(dbs[ev.src.dbId], ev.src)! });
    });
    return out.sort((a, b) => toDate(a.d.start).getTime() - toDate(b.d.start).getTime());
  }, [rows, pages, dbs, prop, JSON.stringify(all)]); // eslint-disable-line

  /* ---------- sources ---------- */
  const setLinks = (fn: (l: Source[]) => Source[]) => updateView(db.id, view.id, (v) => { v.calLinks = fn((v.calLinks || []) as Source[]) as any; });
  const changeSource = (id: string, fn: (s: Source) => void) => {
    if (id === 'self') {
      const c: Source = { ...self, filters: [...self.filters] };
      fn(c);
      updateView(db.id, view.id, (v) => {
        v.calSelf = { color: c.color, hidden: c.hidden || undefined, tagProp: c.tagProp };
        if (c.dateProp && c.dateProp !== v.dateProp) v.dateProp = c.dateProp;
      });
    } else updateView(db.id, view.id, (v) => { const s = v.calLinks?.find((x) => x.id === id); if (s) fn(s as Source); });
  };
  const addLink = (dbId: string, patch: Partial<Source> = {}): string => {
    const used = new Set(all.map((s) => s.color));
    const src: Source = { id: Math.random().toString(36).slice(2, 10), dbId, color: SOURCE_COLORS.find((c) => !used.has(c)) || 'gray', filters: [], ...patch };
    setLinks((l) => [...l, src]);
    return src.id;
  };
  const removeLink = (id: string) => updateView(db.id, view.id, (v) => {
    v.calLinks = (v.calLinks || []).filter((x) => x.id !== id);
    if (v.calTagTo === id) v.calTagTo = undefined;
  });
  const hostParent = getState().pages[db.hostPageId]?.parentId ?? null;
  const newDatabase = (title: string, icon: string, viewType: 'table' | 'calendar') => {
    const pid = createDatabasePage(hostParent, viewType, false);
    patchPage(pid, { title, icon }, 'silent');
    return getState().pages[pid].dbId!;
  };

  /* ---------- quick tags ---------- */
  const tagSources = all.filter((s) => !s.hidden && sourceDateProp(dbs[s.dbId], s));
  const tagTarget = tagSources.find((s) => s.id === view.calTagTo) || tagSources.find((s) => s.id === 'self') || tagSources[0];
  const freshSrc = (id: string): Source | undefined => {
    const d = getState().dbs[db.id];
    const v = d?.views.find((x) => x.id === view.id);
    if (!d || !v) return undefined;
    return id === 'self' ? selfSource(d, v) : v.calLinks?.find((x) => x.id === id);
  };
  const ctx: TagCtx = {
    usable: tagSources.map((src) => ({ src, tp: sourceTagProp(dbs[src.dbId], src) })),
    target: tagTarget,
    targets: tagSources,
    setTarget: (id) => {
      if (id === '__new') {
        const dbId = newDatabase(`${dbTitle(db.id)} · 時段標籤`, '🏷️', 'table');
        const lid = addLink(dbId, { name: '時段標籤' });
        updateView(db.id, view.id, (v) => { v.calTagTo = lid; });
      } else updateView(db.id, view.id, (v) => { v.calTagTo = id; });
    },
    fresh: freshSrc,
    createTag: (name) => tagTarget ? createTagOption(tagTarget, name, (pid) => changeSource(tagTarget.id, (x) => { x.tagProp = pid; })) : null,
    where: '行事曆',
  };
  const hasTags = ctx.usable.some((u) => u.tp?.options?.length);

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
  const canEdit = (it: Item) => it.prop.type === 'date';
  const today = toLocalIso(new Date(), false);

  const byDay = new Map<string, Item[]>();
  items.forEach((it) => daysCovered(it.d).forEach((day) => byDay.set(day, [...(byDay.get(day) || []), it])));
  const noDate = self.hidden ? 0 : rows.length - items.filter((x) => x.src.id === 'self').length;

  /* ---------- actions ---------- */
  const spanValue = (day: string, span: [string, string]) => `${day}T${span[0]}/${day}T${span[1]}`;
  /** a new row of this database on a day (in a slot's hours when given), opened for details */
  const addDetailed = (day: string, span?: [string, string] | null) => editable && newRow({ [prop.id]: span ? spanValue(day, span) : day });

  const dropAt = (target: string, si?: number | null) => {
    const it = items.find((x) => x.row.id === drag);
    if (!drag || !it || !canEdit(it)) { setDrag(null); setOver(null); return; }
    let next: DateVal;
    if (si != null && slots[si]) { const sp = slotAddPair(slots, si); next = { start: `${target}T${sp[0]}`, end: `${target}T${sp[1]}` }; }
    else next = moveDate(it.d, target);
    setRowProp(drag, it.prop.id, serializeDate(next));
    setDrag(null);
    setOver(null);
  };

  /** stamping with the chosen tag: add it to the day / slot, or take it off when it is already there */
  const stamp = (iso: string, si: number | null) => {
    if (!brush) return;
    const here = (byDay.get(iso) || []).filter((e) => e.src.id === brush.srcId && e.tags.some((o) => o.id === brush.optId)
      && (si == null ? slotIndexOf(slots, e.d, iso) < 0 : slotIndexOf(slots, e.d, iso) === si));
    if (here.length) { here.forEach((e) => trashPage(e.row.id)); return; }
    stampTag(ctx, brush, iso, si != null ? slotAddPair(slots, si) : null);
  };
  const openMenu = (e: React.MouseEvent<HTMLElement>, day: string, si: number | null) => {
    e.stopPropagation();
    if (!hasTags) { addDetailed(day, si != null ? slotAddPair(slots, si) : null); return; } // no tags yet: straight to a detailed event
    setMenu({ day, si, anchor: e.currentTarget });
  };

  const step = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (mode === 'month') d.setMonth(d.getMonth() + dir, 1); else d.setDate(d.getDate() + dir * 7);
    setAnchor(d);
  };

  const colored = (it: Item) => multi || it.tags.length > 0;
  const itemLabel = (it: Item) => it.row.title || it.tags.map((o) => o.name).join('、');
  const tip = (it: Item) => [itemLabel(it), multi ? sourceName(it.src) : ''].filter(Boolean).join(' · ');

  /* ---------- header, sources, tags ---------- */
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
      <button className="btn-ghost sm" title="行事曆設定：資料庫、時間、時段" onClick={(e) => setPop({ kind: 'settings', anchor: e.currentTarget })}><Icon.settings size={14} /><span className="hide-sm">設定</span></button>
      <div className="seg">
        <button className={mode === 'month' ? 'on' : ''} onClick={() => updateView(db.id, view.id, (v) => { v.calMode = 'month'; })}>月</button>
        <button className={mode === 'week' ? 'on' : ''} onClick={() => updateView(db.id, view.id, (v) => { v.calMode = 'week'; })}>週</button>
      </div>
      <button className="btn-icon" title={mode === 'month' ? '上個月' : '上一週'} onClick={() => step(-1)}><Icon.chevronLeft size={14} /></button>
      <button className="btn-ghost sm" onClick={() => setAnchor(new Date())}>今天</button>
      <button className="btn-icon" title={mode === 'month' ? '下個月' : '下一週'} onClick={() => step(1)}><Icon.chevronRight size={14} /></button>
    </div>
  );

  const sourceBar = (
    <div className="pl-sources cal-sources">
      <span className="pl-sources-label">資料庫</span>
      {all.map((s) => (
        <div key={s.id} className={'pl-src-chip' + (s.hidden ? ' off' : '')} style={{ ['--src' as any]: `var(--c-${s.color})`, ['--src-bg' as any]: `var(--b-${s.color})` }}>
          <button className="pl-src-toggle" title={s.hidden ? '顯示' : '隱藏'} aria-pressed={!s.hidden} aria-label={`顯示${sourceName(s)}`}
            onClick={() => changeSource(s.id, (x) => { x.hidden = !x.hidden; })}>{!s.hidden && <Icon.check size={11} />}</button>
          <button className="pl-src-name" title="設定顏色、篩選、標籤" onClick={(e) => setSrcEdit({ id: s.id, anchor: e.currentTarget })}>
            {s.id === 'self' ? dbTitle(db.id) : sourceName(s)}
            {s.id !== 'self' && s.filters.length > 0 && <span className="pl-src-filter"><Icon.filter size={11} /> {dbs[s.dbId] ? describeFilters(dbs[s.dbId], s.filters) || '篩選' : '篩選'}</span>}
          </button>
        </div>
      ))}
      <button className="btn-ghost sm muted" onClick={(e) => setPop({ kind: 'link', anchor: e.currentTarget })}><Icon.plus size={13} /> 連結其他資料庫</button>
    </div>
  );

  const linkable = Object.values(dbs).filter((d) => d.id !== db.id && !links.some((l) => l.dbId === d.id) && d.properties.some((p) => p.type === 'date')
    && !pages[d.hostPageId]?.trashed && !pages[d.hostPageId]?.rowOf);
  const editSrc = srcEdit && all.find((s) => s.id === srcEdit.id);

  const popovers = (
    <>
      {pop?.kind === 'link' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={320}>
          <div className="pl-form">
            <div className="strong">連結其他資料庫</div>
            <div className="muted small">選擇有日期欄位的資料庫，它的行程會用不同顏色一起顯示在這個行事曆上。每個資料庫都可以設定篩選，例如只看「類別 是 工作」。</div>
            <select className="select-sm" value="" aria-label="選擇資料庫" onChange={(e) => {
              if (!e.target.value) return;
              const id = addLink(e.target.value);
              const a = pop.anchor; setPop(null); setSrcEdit({ id, anchor: a });
            }}>
              <option value="">選擇資料庫…</option>
              {linkable.map((d) => <option key={d.id} value={d.id}>{dbTitle(d.id)}</option>)}
            </select>
            <button className="btn-ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
              const dbId = newDatabase('新的行程資料庫', '📌', 'calendar');
              const id = addLink(dbId);
              const a = pop.anchor; setPop(null); setSrcEdit({ id, anchor: a });
            }}><Icon.plus size={12} /> 建立新的資料庫並連結</button>
          </div>
        </Popover>
      )}
      {pop?.kind === 'settings' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={340} align="right">
          <div className="pl-form">
            <div className="strong">行事曆設定</div>
            <label className="pl-src-opt"><input type="checkbox" checked={showTime} onChange={(e) => updateView(db.id, view.id, (v) => { v.calHideTime = !e.target.checked || undefined; })} /> 顯示行程時間（例如 13:30）</label>
            <label className="pl-src-opt"><input type="checkbox" checked={!view.calHideTagBar} onChange={(e) => updateView(db.id, view.id, (v) => { v.calHideTagBar = !e.target.checked || undefined; })} /> 顯示快速標籤列</label>
            <div className="muted small">每天怎麼分（月檢視）</div>
            <div className="seg pl-seg">
              {([['none', '不分時段'], ['custom', '分時段（上午／下午／晚上…）']] as const).map(([k, l]) => (
                <button key={k} className={(view.calSlotMode || 'none') === k ? 'on' : ''} onClick={() => updateView(db.id, view.id, (v) => {
                  v.calSlotMode = k;
                  if (k === 'custom' && !v.calSlots?.length) v.calSlots = defaultSlots();
                })}>{l}</button>
              ))}
            </div>
            {view.calSlotMode === 'custom' && (
              <SlotEditor slots={view.calSlots || []} onChange={(next) => updateView(db.id, view.id, (v) => { v.calSlots = next; })} />
            )}
            <div className="muted small">要連結其他資料庫，或選擇顯示哪些資料庫，請用行事曆上方的「資料庫」列。</div>
          </div>
        </Popover>
      )}
      {editSrc && srcEdit && (
        <SourceEditor src={editSrc} anchor={srcEdit.anchor} onClose={() => setSrcEdit(null)}
          onChange={(fn) => changeSource(editSrc.id, fn)}
          onRemove={editSrc.id === 'self' ? undefined : () => removeLink(editSrc.id)}
          nameEditable={editSrc.id !== 'self'}
          filtersNote={editSrc.id === 'self' ? '這個資料庫自己的篩選，請用上方工具列的「篩選」。' : undefined} />
      )}
      {menu && <TagMenu ctx={ctx} day={menu.day} slots={slots} si={menu.si} anchor={menu.anchor} onClose={() => setMenu(null)}
        onOther={editable ? (day, span) => addDetailed(day, span) : undefined} />}
    </>
  );

  const top = (
    <>
      {header}
      {sourceBar}
      {!view.calHideTagBar && <TagBar ctx={ctx} brush={brush} setBrush={setBrush} />}
    </>
  );

  /* ---------- week ---------- */
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
      <div className={'calendar week' + (brush ? ' brushing' : '')}>
        {top}
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
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(day); } }}
              onDrop={(e) => { e.preventDefault(); dropAt(day); }}
              onMouseDown={(e) => { if (brush && e.button === 0 && !(e.target as HTMLElement).closest('.cal-item')) { e.preventDefault(); stamp(day, null); } }}
              onDoubleClick={() => !brush && addDetailed(day)}>
              {allDay(day).map((it) => {
                const c = eventColors(it);
                return (
                  <div key={it.row.id} className={'cal-item' + (colored(it) ? ' colored' : '')} draggable={canEdit(it) && !brush} title={tip(it)}
                    style={colored(it) ? { background: c.bg, borderLeftColor: c.edge } : undefined}
                    onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => { if (brush) stamp(day, null); else openPeek(it.row.id); }}>
                    <div className="card-title">{it.row.icon && <PageIcon icon={it.row.icon} size={12} />}<span>{itemLabel(it)}</span></div>
                  </div>
                );
              })}
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
              const t = (s.getHours() + s.getMinutes() / 60) * HOUR_PX;
              const h = Math.max(HOUR_PX / 2, ((e.getTime() - s.getTime()) / 3600_000) * HOUR_PX);
              let c = cols.findIndex((end) => end <= t);
              if (c < 0) { c = cols.length; cols.push(0); }
              cols[c] = t + h;
              return { it, top: t, h, c };
            });
            const n = Math.max(1, cols.length);
            return (
              <div key={day} className={'wk-col' + (day === today ? ' today' : '') + (over?.startsWith(day + 'T') ? ' over' : '')}
                style={{ height: HOUR_PX * 24 }}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(`${day}T${slotFromY(e.currentTarget, e.clientY)}`); } }}
                onDrop={(e) => { e.preventDefault(); dropAt(`${day}T${slotFromY(e.currentTarget, e.clientY)}`); }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.wk-event')) return;
                  const t = slotFromY(e.currentTarget, e.clientY);
                  const end = toDate(`${day}T${t}`); end.setHours(end.getHours() + 1);
                  if (brush) { stampTag(ctx, brush, day, [t, toLocalIso(end, true).slice(11, 16)]); return; }
                  if (!editable) return;
                  newRow({ [prop.id]: serializeDate({ start: `${day}T${t}`, end: toLocalIso(end, true) }) });
                }}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="wk-line" style={{ top: h * HOUR_PX }} />)}
                {day === today && <div className="wk-now" style={{ top: nowTop }} />}
                {over?.startsWith(day + 'T') && <div className="wk-drop" style={{ top: (+over.slice(11, 13) + +over.slice(14, 16) / 60) * HOUR_PX }} />}
                {placed.map(({ it, top: t, h, c }) => {
                  const col = eventColors(it);
                  return (
                    <div key={it.row.id} className={'wk-event' + (colored(it) ? ' colored' : '')} draggable={canEdit(it) && !brush} title={tip(it)}
                      style={{ top: t, height: h - 2, left: `calc(${(c / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, ...(colored(it) ? { background: col.bg, borderLeftColor: col.edge } : {}) }}
                      onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => { if (brush && it.tags.some((o) => o.id === brush.optId)) trashPage(it.row.id); else if (!brush) openPeek(it.row.id); }}>
                      <div className="wk-ev-title">{it.row.icon && !/^(https?:|data:)/.test(it.row.icon) ? it.row.icon + ' ' : ''}{itemLabel(it)}</div>
                      {showTime && <div className="wk-ev-time">{formatTime(timePart(it.d.start), it.prop.timeFormat)}{it.d.end ? ` – ${formatTime(timePart(it.d.end), it.prop.timeFormat)}` : ''}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {popovers}
      </div>
    );
  }

  /* ---------- month ---------- */
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(month);
  start.setDate(1 - month.getDay());
  const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });

  const card = (it: Item, iso: string, inSlot: boolean) => {
    const multiDay = !!it.d.end && datePart(it.d.start) !== datePart(it.d.end);
    const t = showTime && hasTime(it.d.start) && datePart(it.d.start) === iso ? formatTime(timePart(it.d.start), it.prop.timeFormat) : '';
    const c = eventColors(it);
    return (
      <div key={it.row.id} className={'cal-item' + (multiDay ? ' multi' : '') + (multiDay && datePart(it.d.start) !== iso ? ' cont' : '') + (colored(it) ? ' colored' : '')}
        draggable={canEdit(it) && !brush} title={tip(it)} data-ev={it.row.id}
        style={colored(it) ? { background: c.bg, borderLeftColor: c.edge } : undefined}
        onDragStart={(e) => { setDrag(it.row.id); e.dataTransfer.setData('text/plain', it.row.id); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onClick={() => { if (!brush) openPeek(it.row.id); }}>
        <div className="card-title">
          {t && <span className="cal-time">{t}</span>}
          {it.row.icon && <PageIcon icon={it.row.icon} size={12} />}
          {itemLabel(it) && <span>{itemLabel(it)}</span>}
        </div>
        {!multiDay && !inSlot && it.src.id === 'self' && <CardProps db={db} view={view} row={it.row} exclude={[prop.id]} />}
        {it.tags.length > 0 && canEdit(it) && <button className="pl-event-x" title="移除" aria-label="移除" onClick={(e) => { e.stopPropagation(); trashPage(it.row.id); }}>×</button>}
      </div>
    );
  };

  return (
    <div className="calendar">
      {top}
      <div className={'cal-grid' + (ns ? ' slotted' : '') + (brush ? ' brushing' : '')}
        onMouseDown={(e) => {
          if (!brush || e.button !== 0) return;
          const t = e.target as HTMLElement;
          if (t.closest('.pl-event-x')) return;
          const cell = t.closest<HTMLElement>('.cal-day[data-iso]');
          if (!cell) return;
          e.preventDefault();
          const slot = t.closest<HTMLElement>('.cal-slot');
          stamp(cell.dataset.iso!, slot ? Number(slot.dataset.si) : null);
        }}>
        {['週日', '週一', '週二', '週三', '週四', '週五', '週六'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((d) => {
          const iso = toLocalIso(d, false);
          const list = byDay.get(iso) || [];
          const loose = ns ? list.filter((it) => slotIndexOf(slots, it.d, iso) < 0) : list;
          return (
            <div key={iso} data-iso={iso} className={'cal-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (over === iso ? ' over' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')}
              onDragOver={(e) => { if (drag) { e.preventDefault(); if (!(e.target as HTMLElement).closest('.cal-slot')) setOver(iso); } }}
              onDrop={(e) => { if ((e.target as HTMLElement).closest('.cal-slot')) return; e.preventDefault(); dropAt(iso); }}>
              <div className="cal-day-head">
                {editable && <button className="cal-add btn-icon sm" title={hasTags ? '加上標籤或行程' : '新增'} onClick={(e) => openMenu(e, iso, null)}><Icon.plus size={12} /></button>}
                <span className={'cal-num' + (iso === today ? ' today' : '')}>{d.getDate() === 1 ? `${d.getMonth() + 1}月${d.getDate()}日` : d.getDate()}</span>
              </div>
              {loose.map((it) => card(it, iso, false))}
              {ns > 0 && (
                <div className="cal-slots">
                  {slots.map((s, si) => (
                    <div key={s.id} className={'cal-slot' + (over === `${iso}|${si}` ? ' over' : '')} data-si={si}
                      onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(`${iso}|${si}`); } }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropAt(iso, si); }}>
                      <span className="cal-slot-label">{s.label}</span>
                      <div className="cal-slot-body">{list.filter((it) => slotIndexOf(slots, it.d, iso) === si).map((it) => card(it, iso, true))}</div>
                      {editable && <button className="cal-slot-add" title={`在${s.label}新增`} aria-label={`在${s.label}新增`} onClick={(e) => openMenu(e, iso, si)}><Icon.plus size={11} /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {popovers}
    </div>
  );
}
