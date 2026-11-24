import type { Database, Filter, Page, Property, PropType, View } from '../../types';
import { formatDateTime, parseISODate } from '../../utils';
import { formatDateValue, startTime } from '../../dates';
import { FDate, formulaValue, toText, dateResultIso } from '../../formula';

export const PROP_TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: '文字' },
  { type: 'number', label: '數字' },
  { type: 'select', label: '選取' },
  { type: 'multi_select', label: '多選' },
  { type: 'status', label: '狀態' },
  { type: 'date', label: '日期' },
  { type: 'checkbox', label: '核取方塊' },
  { type: 'url', label: '網址' },
  { type: 'email', label: '電子郵件' },
  { type: 'phone', label: '電話' },
  { type: 'created_time', label: '建立時間' },
  { type: 'last_edited_time', label: '上次編輯時間' },
  { type: 'formula', label: '公式' },
];

export function propTypeLabel(t: PropType) {
  if (t === 'title') return '標題';
  return PROP_TYPES.find((p) => p.type === t)?.label || t;
}

export function getValue(row: Page, prop: Property): any {
  switch (prop.type) {
    case 'title': return row.title;
    case 'created_time': return row.createdAt;
    case 'last_edited_time': return row.updatedAt;
    case 'formula': {
      const r = formulaValue(row, prop);
      if (!r.ok) return null;
      const v = r.value;
      if (v instanceof FDate) return dateResultIso(v);
      if (typeof v === 'number' && !isFinite(v)) return null;
      return v;
    }
    default: return row.props?.[prop.id];
  }
}

export function isEmpty(v: any): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function optionName(prop: Property, id: string | undefined): string {
  return prop.options?.find((o) => o.id === id)?.name || '';
}

export function displayText(row: Page, prop: Property): string {
  const v = getValue(row, prop);
  if (isEmpty(v)) return '';
  switch (prop.type) {
    case 'select': case 'status': return optionName(prop, v);
    case 'multi_select': return (v as string[]).map((id) => optionName(prop, id)).filter(Boolean).join(', ');
    case 'date': return formatDateValue(v, prop);
    case 'checkbox': return v ? '✓' : '';
    case 'created_time': case 'last_edited_time': return formatDateTime(v);
    case 'number': return formatNumber(v, prop);
    case 'formula':
      if (typeof v === 'number') return formatNumber(v, prop);
      if (typeof v === 'boolean') return v ? '✓' : '';
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return formatDateValue(v, prop);
      return toText(v);
    default: return String(v);
  }
}

export function formatNumber(v: any, prop: Property): string {
  const n = Number(v);
  if (v === '' || v === undefined || isNaN(n)) return '';
  switch (prop.numberFormat) {
    case 'percent': return `${(n * 100).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}%`;
    case 'dollar': return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'twd': return `NT$${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
    case 'comma': return n.toLocaleString('zh-TW');
    default: return String(n);
  }
}

export const FILTER_OPS: Record<string, { op: string; label: string; noValue?: boolean }[]> = {
  text: [
    { op: 'contains', label: '包含' }, { op: 'not_contains', label: '不包含' },
    { op: 'is', label: '是' }, { op: 'is_not', label: '不是' },
    { op: 'starts', label: '開頭是' }, { op: 'ends', label: '結尾是' },
    { op: 'empty', label: '為空', noValue: true }, { op: 'not_empty', label: '不為空', noValue: true },
  ],
  number: [
    { op: 'eq', label: '=' }, { op: 'neq', label: '≠' }, { op: 'gt', label: '>' }, { op: 'lt', label: '<' },
    { op: 'gte', label: '≥' }, { op: 'lte', label: '≤' },
    { op: 'empty', label: '為空', noValue: true }, { op: 'not_empty', label: '不為空', noValue: true },
  ],
  select: [
    { op: 'is', label: '是' }, { op: 'is_not', label: '不是' },
    { op: 'empty', label: '為空', noValue: true }, { op: 'not_empty', label: '不為空', noValue: true },
  ],
  multi_select: [
    { op: 'has', label: '包含' }, { op: 'not_has', label: '不包含' },
    { op: 'empty', label: '為空', noValue: true }, { op: 'not_empty', label: '不為空', noValue: true },
  ],
  checkbox: [{ op: 'checked', label: '已勾選', noValue: true }, { op: 'unchecked', label: '未勾選', noValue: true }],
  date: [
    { op: 'is', label: '是' }, { op: 'before', label: '早於' }, { op: 'after', label: '晚於' },
    { op: 'past_week', label: '過去一週', noValue: true }, { op: 'next_week', label: '未來一週', noValue: true },
    { op: 'empty', label: '為空', noValue: true }, { op: 'not_empty', label: '不為空', noValue: true },
  ],
};

export function opsFor(t: PropType) {
  if (t === 'number') return FILTER_OPS.number;
  if (t === 'select' || t === 'status') return FILTER_OPS.select;
  if (t === 'multi_select') return FILTER_OPS.multi_select;
  if (t === 'checkbox') return FILTER_OPS.checkbox;
  if (t === 'date' || t === 'created_time' || t === 'last_edited_time') return FILTER_OPS.date;
  return FILTER_OPS.text;
}

function dayNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : parseISODate(v);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function matchFilter(row: Page, f: Filter, prop: Property): boolean {
  const v = getValue(row, prop);
  if (f.op === 'empty') return prop.type === 'checkbox' ? !v : isEmpty(v);
  if (f.op === 'not_empty') return !isEmpty(v);
  const fv = f.value;
  switch (prop.type) {
    case 'number': {
      if (fv === undefined || fv === '') return true;
      const a = Number(v), b = Number(fv);
      if (isEmpty(v)) return false;
      return { eq: a === b, neq: a !== b, gt: a > b, lt: a < b, gte: a >= b, lte: a <= b }[f.op as 'eq'] ?? true;
    }
    case 'select': case 'status':
      if (!fv) return true;
      return f.op === 'is' ? v === fv : v !== fv;
    case 'multi_select': {
      if (!fv) return true;
      const has = Array.isArray(v) && v.includes(fv);
      return f.op === 'has' ? has : !has;
    }
    case 'checkbox': return f.op === 'checked' ? !!v : !v;
    case 'date': case 'created_time': case 'last_edited_time': {
      const d = dayNum(v);
      const today = dayNum(Date.now())!;
      if (f.op === 'past_week') return d !== null && d <= today && d >= today - 7 * 864e5;
      if (f.op === 'next_week') return d !== null && d >= today && d <= today + 7 * 864e5;
      const t = dayNum(fv);
      if (t === null) return true;
      if (d === null) return false;
      return f.op === 'is' ? d === t : f.op === 'before' ? d < t : d > t;
    }
    default: {
      const s = (prop.type === 'formula' ? displayText(row, prop) : String(v ?? '')).toLowerCase();
      const q = String(fv ?? '').toLowerCase();
      if (!q) return true;
      switch (f.op) {
        case 'contains': return s.includes(q);
        case 'not_contains': return !s.includes(q);
        case 'is': return s === q;
        case 'is_not': return s !== q;
        case 'starts': return s.startsWith(q);
        case 'ends': return s.endsWith(q);
      }
      return true;
    }
  }
}

function sortKey(row: Page, prop: Property): any {
  const v = getValue(row, prop);
  if (isEmpty(v)) return null;
  switch (prop.type) {
    case 'number': return Number(v);
    case 'select': case 'status': return prop.options?.findIndex((o) => o.id === v) ?? 0;
    case 'multi_select': return (v as string[]).map((id) => optionName(prop, id)).join(',');
    case 'checkbox': return v ? 1 : 0;
    case 'date': return startTime(v);
    case 'formula':
      if (typeof v === 'number' || typeof v === 'boolean') return Number(v);
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return startTime(v);
      return toText(v).toLowerCase();
    default: return typeof v === 'string' ? v.toLowerCase() : v;
  }
}

export function processRows(rows: Page[], db: Database, view: View, search: string): Page[] {
  let out = rows.slice().sort((a, b) => a.sort - b.sort);
  view.filters.forEach((f) => {
    const prop = db.properties.find((p) => p.id === f.propId);
    if (prop) out = out.filter((r) => matchFilter(r, f, prop));
  });
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter((r) => db.properties.some((p) => displayText(r, p).toLowerCase().includes(q)));
  }
  if (view.sorts.length) {
    out.sort((a, b) => {
      for (const s of view.sorts) {
        const prop = db.properties.find((p) => p.id === s.propId);
        if (!prop) continue;
        const x = sortKey(a, prop), y = sortKey(b, prop);
        if (x === y) continue;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = x < y ? -1 : 1;
        return s.dir === 'asc' ? c : -c;
      }
      return a.sort - b.sort;
    });
  }
  return out;
}

/** default props for a new row given the view's filters */
export function defaultsFromFilters(db: Database, view: View): Record<string, any> {
  const out: Record<string, any> = {};
  view.filters.forEach((f) => {
    const prop = db.properties.find((p) => p.id === f.propId);
    if (!prop || prop.type === 'title') return;
    if ((prop.type === 'select' || prop.type === 'status') && f.op === 'is' && f.value) out[prop.id] = f.value;
    if (prop.type === 'multi_select' && f.op === 'has' && f.value) out[prop.id] = [f.value];
    if (prop.type === 'checkbox') out[prop.id] = f.op === 'checked';
    if (prop.type === 'date' && f.op === 'is' && f.value) out[prop.id] = f.value;
  });
  return out;
}

export const CALCS: Record<string, { label: string; types?: PropType[] }> = {
  none: { label: '無' },
  count: { label: '全部計數' },
  count_values: { label: '值計數' },
  empty: { label: '空白計數' },
  not_empty: { label: '非空白計數' },
  percent_empty: { label: '空白百分比' },
  percent_not_empty: { label: '非空白百分比' },
  sum: { label: '總和', types: ['number', 'formula'] },
  avg: { label: '平均', types: ['number', 'formula'] },
  min: { label: '最小值', types: ['number', 'formula'] },
  max: { label: '最大值', types: ['number', 'formula'] },
  checked: { label: '已勾選', types: ['checkbox'] },
  percent_checked: { label: '已勾選百分比', types: ['checkbox'] },
};

export function calculate(kind: string, rows: Page[], prop: Property): string {
  const vals = rows.map((r) => getValue(r, prop));
  const nonEmpty = vals.filter((v) => (prop.type === 'checkbox' ? !!v : !isEmpty(v)));
  const nums = vals.filter((v) => !isEmpty(v) && !isNaN(Number(v))).map(Number);
  const pct = (n: number) => rows.length ? `${Math.round((n / rows.length) * 100)}%` : '0%';
  switch (kind) {
    case 'count': return String(rows.length);
    case 'count_values': return String(nonEmpty.length);
    case 'empty': return String(rows.length - nonEmpty.length);
    case 'not_empty': return String(nonEmpty.length);
    case 'percent_empty': return pct(rows.length - nonEmpty.length);
    case 'percent_not_empty': return pct(nonEmpty.length);
    case 'sum': return formatNumber(nums.reduce((a, b) => a + b, 0), prop);
    case 'avg': return nums.length ? formatNumber(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100, prop) : '';
    case 'min': return nums.length ? formatNumber(Math.min(...nums), prop) : '';
    case 'max': return nums.length ? formatNumber(Math.max(...nums), prop) : '';
    case 'checked': return String(vals.filter(Boolean).length);
    case 'percent_checked': return pct(vals.filter(Boolean).length);
    default: return '';
  }
}

export function visibleProps(db: Database, view: View): Property[] {
  return db.properties.filter((p) => p.type === 'title' || !view.hidden.includes(p.id));
}
