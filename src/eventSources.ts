/* Dated rows gathered from one or more databases ("sources"), shared by the database calendar view
   and the digital planner: tags that colour events, day slots such as 上午／下午／晚上, and quick adds. */
import type { Database, Page, PlannerSource, Property, SelectOption } from './types';
import { addRow, getState, makeProp, updateDb } from './store';
import { DateVal, daysCovered, hasTime, datePart, parseDateValue, timePart, toDate } from './dates';
import { defaultsFromFilters, filterRows } from './components/db/dbutils';
import { COLORS, uid } from './utils';

export type Source = PlannerSource;
export type Ev = { row: Page; d: DateVal; src: Source; tags: SelectOption[] };

export function sourceDateProp(db: Database | undefined, src: Source) {
  return db?.properties.find((p) => p.id === src.dateProp && p.type === 'date') || db?.properties.find((p) => p.type === 'date');
}

export function dbTitle(dbId: string): string {
  const s = getState();
  const d = s.dbs[dbId];
  if (!d) return '（已刪除的資料庫）';
  return d.inline ? d.title || '未命名資料庫' : s.pages[d.hostPageId]?.title || '未命名資料庫';
}

export function sourceName(src: Source): string {
  return src.name?.trim() || dbTitle(src.dbId);
}

/* ---------------- tags ---------------- */

export const isTagType = (p: Property) => p.type === 'select' || p.type === 'multi_select';

/** the select / multi-select property a source uses as tags: the chosen one, else one whose name sounds like tags / people */
export function sourceTagProp(db: Database | undefined, src: Source): Property | undefined {
  if (!db || src.tagProp === 'none') return undefined;
  const chosen = db.properties.find((p) => p.id === src.tagProp && isTagType(p));
  if (chosen) return chosen;
  const fixed = new Set(src.filters.map((f) => f.propId));
  const free = db.properties.filter((p) => isTagType(p) && !fixed.has(p.id));
  // only a field that sounds like tags / people is picked by itself (not e.g. 優先順序); others are chosen in the source settings
  return free.find((p) => /標籤|标签|tag|label|人員|人员|成員|成员|對象|对象|學長|学长|學姊|學姐|負責|负责|people|person|who/i.test(p.name));
}

export function rowTags(row: Page, prop: Property | undefined): SelectOption[] {
  if (!prop) return [];
  const v = row.props?.[prop.id];
  const ids: string[] = Array.isArray(v) ? v : v ? [v] : [];
  return ids.map((id) => prop.options?.find((o) => o.id === id)).filter((o): o is SelectOption => !!o);
}

const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray'];

/** add a tag option to the source's tag property; with none, a 「標籤」 property is created and handed to onNewProp */
export function createTagOption(src: Source, name: string, onNewProp: (propId: string) => void): string | null {
  const db = getState().dbs[src.dbId];
  if (!db || !name.trim()) return null;
  name = name.trim();
  const tp = sourceTagProp(db, src);
  const same = tp?.options?.find((o) => o.name === name);
  if (same) return same.id;
  const used = new Set((tp?.options || []).map((o) => o.color));
  const color = TAG_COLORS.find((c) => !used.has(c)) || COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];
  const opt: SelectOption = { id: uid(), name, color };
  if (tp) {
    updateDb(db.id, (d) => { const x = d.properties.find((y) => y.id === tp.id); if (x) x.options = [...(x.options || []), opt]; });
  } else {
    const names = new Set(db.properties.map((p) => p.name));
    const np = makeProp('select', ['標籤', '行程標籤', '手帳標籤'].find((n) => !names.has(n)) || '手帳標籤 ' + (db.properties.length + 1), { options: [opt] });
    updateDb(db.id, (d) => { d.properties.push(np); });
    onNewProp(np.id);
  }
  return opt.id;
}

/** add a row carrying one tag straight to the database (no detail window); span = ["HH:mm", "HH:mm"] */
export function addTaggedRow(src: Source, day: string, optId: string, span?: [string, string] | null): string | null {
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

/** colours for an event: its tag's colour, else its source's */
export function eventColors(ev: Ev): { bg: string; edge: string } {
  const tag = ev.tags[0];
  if (tag) return { bg: `var(--t-${tag.color})`, edge: `var(--c-${tag.color === 'default' ? 'gray' : tag.color})` };
  return { bg: `var(--b-${ev.src.color})`, edge: `var(--c-${ev.src.color})` };
}

/** rows of the given sources (optionally only those touching `days`); `rowsOf` can supply a source's rows directly */
export function collectEvents(
  pages: Record<string, Page>, dbs: Record<string, Database>, sources: Source[],
  days?: Set<string> | null, rowsOf?: (src: Source) => Page[] | null,
): Ev[] {
  const out: Ev[] = [];
  const seen = new Set<string>();
  sources.forEach((src) => {
    const db = dbs[src.dbId];
    const prop = sourceDateProp(db, src);
    if (!db || !prop) return;
    const tp = sourceTagProp(db, src);
    const rows = rowsOf?.(src) ?? filterRows(Object.values(pages).filter((r) => r.rowOf === db.id && !r.trashed), db, src.filters);
    rows.forEach((r) => {
      if (seen.has(r.id)) return; // the same row can match two sources of one database
      const d = parseDateValue(r.props?.[prop.id]);
      if (d && (!days || daysCovered(d).some((x) => days.has(x)))) { out.push({ row: r, d, src, tags: rowTags(r, tp) }); seen.add(r.id); }
    });
  });
  return out.sort((a, b) => toDate(a.d.start).getTime() - toDate(b.d.start).getTime());
}

/* ---------------- day slots (上午／下午／晚上…) ---------------- */

export type Slot = { id: string; label: string; time?: string };
export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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

/** time range (minutes) a slot name usually means, used to place timed events */
export function slotRange(label: string): [number, number] | null {
  const l = label.toLowerCase();
  if (/清晨|早晨|早上|上午|morning|\bam\b/.test(l)) return [0, 12 * 60];
  if (/中午|午餐|noon|lunch/.test(l)) return [11 * 60, 14 * 60];
  if (/下午|afternoon|\bpm\b/.test(l)) return [12 * 60, 18 * 60];
  if (/傍晚|dusk/.test(l)) return [17 * 60, 19 * 60];
  if (/晚上|夜|evening|night/.test(l)) return [18 * 60, 24 * 60];
  return null;
}

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
export const slotAddPair = (slots: Slot[], i: number) => slotAddSpan(slots, i).map(hm) as [string, string];

/** hours whose events land in slot i */
export function slotPlaceRange(slots: Slot[], i: number): [number, number] {
  return parseSpan(slots[i].time) || slotRange(slots[i].label) || positional(i, slots.length);
}

/** which slot (index) an event of `day` falls in, or -1 (untimed, another day, or outside every slot) */
export function slotIndexOf(slots: Slot[], d: DateVal, day: string): number {
  if (!slots.length || !hasTime(d.start) || datePart(d.start) !== day) return -1;
  const [h, m] = timePart(d.start).split(':').map(Number);
  const t = h * 60 + m;
  // the narrowest slot that holds the time (17:30 goes to 傍晚 rather than 下午)
  let best = -1, width = Infinity;
  slots.forEach((_, i) => {
    const r = slotPlaceRange(slots, i);
    if (t >= r[0] && t < r[1] && r[1] - r[0] < width) { best = i; width = r[1] - r[0]; }
  });
  return best;
}
