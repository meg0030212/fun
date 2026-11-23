/* Date property values are stored as strings so older data keeps working:
   "2026-11-23"                     a day
   "2026-11-23T14:30"               a day with a time
   "2026-11-23T09:00/2026-11-23T10:30"  a range (either side may omit the time) */
import type { Property } from './types';

export interface DateVal { start: string; end?: string }
export type DateFormat = 'full' | 'short' | 'slash' | 'iso' | 'relative';
export type TimeFormat = '24h' | '12h';

const RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

export function parseDateValue(v: any): DateVal | null {
  if (typeof v !== 'string' || !v) return null;
  const [a, b] = v.split('/');
  if (!RE.test(a)) return null;
  return b && RE.test(b) ? { start: a, end: b } : { start: a };
}

export function serializeDate(d: DateVal | null): string | null {
  if (!d || !d.start) return null;
  return d.end ? `${d.start}/${d.end}` : d.start;
}

export function hasTime(s?: string) { return !!s && s.includes('T'); }
export function datePart(s: string) { return s.slice(0, 10); }
export function timePart(s: string) { return hasTime(s) ? s.slice(11, 16) : ''; }

export function toDate(s: string): Date {
  const m = RE.exec(s)!;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

const pad = (n: number) => String(n).padStart(2, '0');
export function toLocalIso(d: Date, withTime: boolean) {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

/** timestamp of the start, for sorting */
export function startTime(v: any): number | null {
  const d = parseDateValue(v);
  return d ? toDate(d.start).getTime() : null;
}

/** end timestamp; a timed value without an end lasts one hour, a day lasts the whole day */
export function endTime(d: DateVal): number {
  if (d.end) {
    const e = toDate(d.end);
    if (!hasTime(d.end)) e.setDate(e.getDate() + 1);
    return e.getTime();
  }
  const s = toDate(d.start);
  if (hasTime(d.start)) return s.getTime() + 3600_000;
  s.setDate(s.getDate() + 1);
  return s.getTime();
}

export function formatTime(t: string, fmt: TimeFormat = '24h'): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (fmt === '24h') return `${pad(h)}:${pad(m)}`;
  const ap = h < 12 ? '上午' : '下午';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${pad(m)}`;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDay(day: string, fmt: DateFormat = 'full'): string {
  const d = toDate(day);
  const y = d.getFullYear(), mo = d.getMonth() + 1, da = d.getDate();
  switch (fmt) {
    case 'short': return `${mo}月${da}日（${WEEK[d.getDay()]}）`;
    case 'slash': return `${y}/${pad(mo)}/${pad(da)}`;
    case 'iso': return `${y}-${pad(mo)}-${pad(da)}`;
    case 'relative': {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((new Date(y, mo - 1, da).getTime() - today.getTime()) / 864e5);
      const names: Record<string, string> = { '-2': '前天', '-1': '昨天', '0': '今天', '1': '明天', '2': '後天' };
      if (names[String(diff)]) return names[String(diff)];
      if (diff > 0 && diff < 7) return `${diff} 天後`;
      if (diff < 0 && diff > -7) return `${-diff} 天前`;
      return `${y}年${mo}月${da}日`;
    }
    default: return `${y}年${mo}月${da}日`;
  }
}

export function formatPoint(s: string, prop?: Pick<Property, 'dateFormat' | 'timeFormat'>): string {
  const day = formatDay(datePart(s), prop?.dateFormat);
  return hasTime(s) ? `${day} ${formatTime(timePart(s), prop?.timeFormat)}` : day;
}

export function formatDateValue(v: any, prop?: Pick<Property, 'dateFormat' | 'timeFormat'>): string {
  const d = parseDateValue(v);
  if (!d) return typeof v === 'string' ? v : '';
  if (!d.end) return formatPoint(d.start, prop);
  // same day range with times: "11月23日 09:00 → 10:30"
  if (datePart(d.start) === datePart(d.end) && hasTime(d.start) && hasTime(d.end)) {
    return `${formatPoint(d.start, prop)} → ${formatTime(timePart(d.end), prop?.timeFormat)}`;
  }
  return `${formatPoint(d.start, prop)} → ${formatPoint(d.end, prop)}`;
}

/** every local day (YYYY-MM-DD) the value covers */
export function daysCovered(d: DateVal): string[] {
  const out: string[] = [];
  const s = toDate(datePart(d.start));
  const e = d.end ? toDate(datePart(d.end)) : s;
  const cur = new Date(s);
  let guard = 0;
  while (cur.getTime() <= e.getTime() && guard++ < 370) {
    out.push(toLocalIso(cur, false));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** shift a value so it starts at newStart, keeping its duration and time-of-day style */
export function moveDate(d: DateVal, newStart: string): DateVal {
  // dropping on a day keeps the original time; dropping on a time slot sets it
  const ns = hasTime(newStart) ? newStart : (hasTime(d.start) ? `${newStart}T${timePart(d.start)}` : newStart);
  if (!d.end) return { start: ns };
  const shift = toDate(ns).getTime() - toDate(d.start).getTime();
  const e = new Date(toDate(d.end).getTime() + shift);
  return { start: ns, end: toLocalIso(e, hasTime(d.end) || hasTime(ns)) };
}
