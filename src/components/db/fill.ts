/* Excel-style fill: copy one cell's value into neighbouring rows, creating rows past the end. */
import type { Database, Page, Property } from '../../types';
import { getState, makePage, newBlock, update } from '../../store';
import { moveDate, parseDateValue, serializeDate, toDate, toLocalIso, hasTime } from '../../dates';
import { defaultsFromFilters } from './dbutils';

/** value for the k-th cell away from the source (k may be negative when filling upwards) */
export function seriesValue(prop: Property, v: any, k: number, copyOnly: boolean): any {
  if (v === undefined || v === null) return v;
  if (copyOnly) return JSON.parse(JSON.stringify(v));
  if (prop.type === 'date') {
    const d = parseDateValue(v);
    if (!d) return v;
    const s = toDate(d.start);
    s.setDate(s.getDate() + k);
    return serializeDate(moveDate(d, toLocalIso(s, hasTime(d.start))));
  }
  if (prop.type === 'title' || prop.type === 'text') {
    // "第1週" → "第2週", "Room 09" → "Room 10"
    const m = /^(.*?)(\d+)(\D*)$/.exec(String(v));
    if (!m) return v;
    const n = Math.max(0, Number(m[2]) + k);
    return m[1] + String(n).padStart(m[2].length, '0') + m[3];
  }
  return JSON.parse(JSON.stringify(v));
}

const readOnlyTypes = new Set(['created_time', 'last_edited_time', 'formula']);

export function canFill(prop: Property) { return !readOnlyTypes.has(prop.type); }

/**
 * fill the value of `source` (row) for `prop` into `targets` (existing rows, in order away from the
 * source) and into `extra` brand-new rows appended after them.
 */
export function applyFill(db: Database, prop: Property, source: Page, targets: Page[], dir: 1 | -1, extra: number, copyOnly: boolean, filters: { filters: any[] }) {
  const value = prop.type === 'title' ? source.title : source.props?.[prop.id];
  const rowsOfDb = Object.values(getState().pages).filter((p) => p.rowOf === db.id);
  let sort = rowsOfDb.length ? Math.max(...rowsOfDb.map((r) => r.sort)) + 1 : 0;
  const base = defaultsFromFilters(db, filters);
  update((d) => {
    const now = Date.now();
    targets.forEach((t, i) => {
      const row = d.pages[t.id];
      if (!row) return;
      const v = seriesValue(prop, value, (i + 1) * dir, copyOnly);
      if (prop.type === 'title') row.title = v ?? '';
      else { row.props = row.props || {}; row.props[prop.id] = v; }
      row.updatedAt = now;
    });
    for (let i = 0; i < extra; i++) {
      const k = targets.length + i + 1;
      const v = seriesValue(prop, value, k, copyOnly);
      const props: Record<string, any> = { ...base };
      let title = '';
      if (prop.type === 'title') title = v ?? ''; else props[prop.id] = v;
      const p = makePage({ rowOf: db.id, title, props, sort: sort++, blocks: [newBlock()] });
      d.pages[p.id] = p;
    }
  });
}
