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

/* ---------------- write plain text into cells (paste / clear) ---------------- */
import { COLORS, uid } from '../../utils';
import { parseTypedDate } from '../../dates';
import { parseAnyDate } from '../../importNotion';

const randomColor = () => COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];

/** set many cells from text in one undo step; text null clears. Unknown option names become new options. */
export function writeCells(db: Database, cells: { row: Page; prop: Property; text: string | null }[], roc: boolean) {
  update((d) => {
    const ddb = d.dbs[db.id];
    if (!ddb) return;
    const now = Date.now();
    cells.forEach(({ row, prop, text }) => {
      const r = d.pages[row.id];
      const p = ddb.properties.find((x) => x.id === prop.id);
      if (!r || !p || readOnlyTypes.has(p.type)) return;
      const t = text === null ? '' : text.trim();
      r.updatedAt = now;
      if (p.type === 'title') { r.title = t; return; }
      r.props = r.props || {};
      const set = (v: any) => { if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete r.props![p.id]; else r.props![p.id] = v; };
      if (!t) { set(null); return; }
      const option = (name: string) => {
        let o = p.options?.find((x) => x.name === name);
        if (!o) { o = { id: uid(), name, color: randomColor() }; p.options = [...(p.options || []), o]; }
        return o.id;
      };
      switch (p.type) {
        case 'number': { const n = Number(t.replace(/[,\s$%]|NT\$/g, '')); set(isNaN(n) ? null : n); break; }
        case 'checkbox': set(/^(✓|✔|v|y|yes|true|是|1|x)$/i.test(t) ? true : null); break;
        case 'select': case 'status': set(option(t)); break;
        case 'multi_select': set(t.split(/\s*[,，、]\s*/).filter(Boolean).map(option)); break;
        case 'date': set(parseAnyDate(t) || parseTypedDate(t, roc)); break;
        default: set(t);
      }
    });
  });
}

/* ---------------- fill from a selected block (several rows / columns) ---------------- */

const cellValue = (row: Page, prop: Property) => (prop.type === 'title' ? row.title : row.props?.[prop.id]);

/**
 * value for the row at offset t from the first source row (t may be past the end or negative).
 * Several source cells with a steady step (numbers, dates, 第1週…) continue the series;
 * otherwise the source cells repeat in order. Ctrl (copyOnly) always repeats.
 */
export function seriesFrom(prop: Property, vals: any[], t: number, copyOnly: boolean): any {
  const n = vals.length;
  if (!n) return undefined;
  const cycle = () => { const v = vals[((t % n) + n) % n]; return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)); };
  if (copyOnly) return cycle();
  if (n === 1) return seriesValue(prop, vals[0], t, false);
  const steady = (xs: number[]) => { const d = xs[1] - xs[0]; return xs.every((x, i) => i === 0 || x - xs[i - 1] === d) ? d : null; };
  if (prop.type === 'number' && vals.every((v) => typeof v === 'number')) {
    const d = steady(vals as number[]);
    if (d !== null) return Math.round(((vals[0] as number) + d * t) * 1e10) / 1e10;
  }
  if (prop.type === 'date') {
    const ds = vals.map((v) => parseDateValue(v));
    if (ds.every(Boolean)) {
      const days = ds.map((d) => Math.round(toDate(d!.start.slice(0, 10)).getTime() / 864e5));
      const step = steady(days);
      if (step !== null) {
        const s = toDate(ds[0]!.start);
        s.setDate(s.getDate() + step * t);
        return serializeDate(moveDate(ds[0]!, toLocalIso(s, hasTime(ds[0]!.start))));
      }
    }
  }
  if (prop.type === 'title' || prop.type === 'text') {
    const ms = vals.map((v) => /^(.*?)(\d+)(\D*)$/.exec(String(v ?? '')));
    if (ms.every(Boolean) && ms.every((m) => m![1] === ms[0]![1] && m![3] === ms[0]![3])) {
      const step = steady(ms.map((m) => Number(m![2])));
      if (step !== null) {
        const num = Math.max(0, Number(ms[0]![2]) + step * t);
        return ms[0]![1] + String(num).padStart(ms[0]![2].length, '0') + ms[0]![3];
      }
    }
  }
  return cycle();
}

export interface FillRect { r0: number; r1: number; c0: number; c1: number; to: number }

/** fill rows above/below the selected block (and create rows past the end), one undo step */
export function applyFillRange(db: Database, props: Property[], rows: Page[], f: FillRect, copyOnly: boolean, filters: { filters: any[] }) {
  if (f.to >= f.r0 && f.to <= f.r1) return;
  const cols = props.slice(f.c0, f.c1 + 1).filter(canFill);
  const src = (prop: Property) => rows.slice(f.r0, f.r1 + 1).map((r) => cellValue(r, prop));
  const targets: number[] = [];
  if (f.to > f.r1) for (let i = f.r1 + 1; i <= f.to; i++) targets.push(i); else for (let i = f.to; i < f.r0; i++) targets.push(i);
  const rowsOfDb = Object.values(getState().pages).filter((p) => p.rowOf === db.id);
  let sort = rowsOfDb.length ? Math.max(...rowsOfDb.map((r) => r.sort)) + 1 : 0;
  const base = defaultsFromFilters(db, filters);
  const sources = new Map(cols.map((p) => [p.id, src(p)]));
  update((d) => {
    const now = Date.now();
    targets.forEach((ri) => {
      const t = ri - f.r0;
      if (ri < rows.length) {
        const row = d.pages[rows[ri].id];
        if (!row) return;
        cols.forEach((p) => {
          const v = seriesFrom(p, sources.get(p.id)!, t, copyOnly);
          if (p.type === 'title') row.title = v ?? '';
          else { row.props = row.props || {}; if (v === undefined || v === null || v === '') delete row.props[p.id]; else row.props[p.id] = v; }
        });
        row.updatedAt = now;
      } else {
        const props: Record<string, any> = { ...base };
        let title = '';
        cols.forEach((p) => {
          const v = seriesFrom(p, sources.get(p.id)!, t, copyOnly);
          if (p.type === 'title') title = v ?? ''; else if (v !== undefined && v !== null && v !== '') props[p.id] = v;
        });
        const pg = makePage({ rowOf: db.id, title, props, sort: sort++, blocks: [newBlock()] });
        d.pages[pg.id] = pg;
      }
    });
  });
}

/** preview text for a cell that the fill would write */
export function fillPreviewText(props: Property[], rows: Page[], f: FillRect, ri: number, ci: number, display: (row: Page, prop: Property) => string): string {
  const prop = props[ci];
  if (!prop || !canFill(prop)) return '';
  const vals = rows.slice(f.r0, f.r1 + 1).map((r) => cellValue(r, prop));
  const v = seriesFrom(prop, vals, ri - f.r0, false);
  const like = rows[f.r0];
  const fake = { ...like, title: prop.type === 'title' ? v ?? '' : like.title, props: { ...(like.props || {}), [prop.id]: v } } as Page;
  return display(fake, prop);
}
