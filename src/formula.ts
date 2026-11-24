/* Formula engine for database "formula" properties.
   Syntax follows Notion formulas: prop("Name"), + - * / % ^, == != > < >= <=,
   and/or/not (&& || !), cond ? a : b, functions like if(), dateBetween(),
   method calls (prop("Tags").length()), lists [1, 2] and map/filter with `current`.
   Everything is interpreted here; nothing is passed to eval/Function. */
import type { Database, Page, Property } from './types';
import { getState } from './store';
import { DateVal, formatDateValue, hasTime, parseDateValue, toDate, toLocalIso } from './dates';

/* ---------------- values ---------------- */

export class FDate {
  constructor(public start: Date, public end: Date | null = null, public time = true) {}
}
export type FValue = number | string | boolean | FDate | FValue[] | null;

export class FormulaError extends Error {}
const fail = (msg: string): never => { throw new FormulaError(msg); };

/* ---------------- tokenizer ---------------- */

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'end' };

const OPS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '^', '!', '?', ':', '(', ')', ',', '.', '[', ']'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'" || c === '“' || c === '「') {
      const close = c === '“' ? '”' : c === '「' ? '」' : c;
      let s = '';
      i++;
      while (i < src.length && src[i] !== close) {
        if (src[i] === '\\' && i + 1 < src.length) {
          const n = src[i + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else s += src[i++];
      }
      if (i >= src.length) fail('文字缺少結尾的引號');
      i++;
      out.push({ t: 'str', v: s });
      continue;
    }
    const id = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    // full-width characters typed with a Chinese IME (outside of text): （ ） ， ＊ ２ … → ASCII
    const code = c.charCodeAt(0);
    if (code >= 0xff01 && code <= 0xff5e) { src = src.slice(0, i) + String.fromCharCode(code - 0xfee0) + src.slice(i + 1); continue; }
    if (c === '\u3000') { i++; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) fail(`無法辨識的符號「${c}」`);
    out.push({ t: 'op', v: op === '===' ? '==' : op === '!==' ? '!=' : op! });
    i += op!.length;
  }
  out.push({ t: 'end' });
  return out;
}

/* ---------------- parser (precedence climbing) ---------------- */

export type Node =
  | { k: 'lit'; v: FValue }
  | { k: 'list'; items: Node[] }
  | { k: 'id'; name: string }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'tern'; c: Node; a: Node; b: Node };

const BIN: Record<string, [number, boolean]> = {
  '||': [2, false], or: [2, false], '&&': [3, false], and: [3, false],
  '==': [4, false], '!=': [4, false],
  '<': [5, false], '>': [5, false], '<=': [5, false], '>=': [5, false],
  '+': [6, false], '-': [6, false], '*': [7, false], '/': [7, false], '%': [7, false], '^': [8, true],
};

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return (t.t === 'op' || t.t === 'id') && (t as any).v === v; };
  const expect = (v: string) => { if (!isOp(v)) fail(`這裡應該要有「${v}」`); p++; };

  const binOp = (): string | null => {
    const t = peek();
    if (t.t === 'op' && BIN[t.v]) return t.v;
    if (t.t === 'id' && (t.v === 'and' || t.v === 'or')) return t.v;
    return null;
  };

  function expr(minPrec = 0): Node {
    let left = unary();
    for (;;) {
      if (isOp('?') && minPrec <= 1) {
        p++;
        const a = expr(0);
        expect(':');
        const b = expr(1);
        left = { k: 'tern', c: left, a, b };
        continue;
      }
      const op = binOp();
      if (!op) break;
      const [prec, right] = BIN[op];
      if (prec < minPrec) break;
      p++;
      const rhs = expr(right ? prec : prec + 1);
      left = { k: 'bin', op: op === 'and' ? '&&' : op === 'or' ? '||' : op, a: left, b: rhs };
    }
    return left;
  }

  function unary(): Node {
    if (isOp('-')) {
      p++;
      // -2 ^ 2 is -(2 ^ 2), as in math
      return { k: 'un', op: '-', a: expr(8) };
    }
    if (isOp('!') || isOp('not')) {
      p++;
      return { k: 'un', op: '!', a: unary() };
    }
    if (isOp('+')) { p++; return unary(); }
    return postfix(primary());
  }

  function args(): Node[] {
    expect('(');
    const out: Node[] = [];
    if (!isOp(')')) {
      out.push(expr());
      while (isOp(',')) { p++; out.push(expr()); }
    }
    expect(')');
    return out;
  }

  function postfix(n: Node): Node {
    for (;;) {
      if (isOp('.')) {
        p++;
        const t = peek();
        if (t.t !== 'id') fail('「.」後面應該是函式名稱');
        p++;
        const name = (t as any).v as string;
        const rest = isOp('(') ? args() : [];
        n = { k: 'call', name, args: [n, ...rest] };
      } else if (isOp('[')) {
        p++;
        const idx = expr();
        expect(']');
        n = { k: 'call', name: 'at', args: [n, idx] };
      } else return n;
    }
  }

  function primary(): Node {
    const t = peek();
    if (t.t === 'num') { p++; return { k: 'lit', v: t.v }; }
    if (t.t === 'str') { p++; return { k: 'lit', v: t.v }; }
    if (t.t === 'op' && t.v === '(') { p++; const e = expr(); expect(')'); return e; }
    if (t.t === 'op' && t.v === '[') {
      p++;
      const items: Node[] = [];
      if (!isOp(']')) { items.push(expr()); while (isOp(',')) { p++; items.push(expr()); } }
      expect(']');
      return { k: 'list', items };
    }
    if (t.t === 'id') {
      p++;
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (isOp('(')) return { k: 'call', name: t.v, args: args() };
      return { k: 'id', name: t.v };
    }
    if (t.t === 'end') fail('公式不完整');
    return fail(`這裡不應該出現「${(t as any).v}」`);
  }

  if (peek().t === 'end') return { k: 'lit', v: null };
  const n = expr();
  if (peek().t !== 'end') fail(`多出了「${(peek() as any).v}」`);
  return n;
}

/* ---------------- helpers ---------------- */

const isList = (v: FValue): v is FValue[] => Array.isArray(v);
const isDate = (v: FValue): v is FDate => v instanceof FDate;

export function truthy(v: FValue): boolean {
  if (v === null || v === false || v === 0 || v === '') return false;
  if (isList(v)) return v.length > 0;
  return true;
}

function num(v: FValue, fn: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v === 'string' && v.trim() && !isNaN(Number(v.replace(/,/g, '')))) return Number(v.replace(/,/g, ''));
  return fail(`${fn} 需要數字，但收到${typeName(v)}`);
}
function str(v: FValue): string { return toText(v); }
function date(v: FValue, fn: string): FDate {
  if (isDate(v)) return v;
  if (typeof v === 'string') { const d = parseDateValue(v); if (d) return fromDateVal(d); }
  if (typeof v === 'number') return new FDate(new Date(v));
  return fail(`${fn} 需要日期，但收到${typeName(v)}`);
}
function list(v: FValue): FValue[] { return isList(v) ? v : v === null ? [] : [v]; }

function typeName(v: FValue): string {
  if (v === null) return '空值';
  if (isList(v)) return '清單';
  if (isDate(v)) return '日期';
  return typeof v === 'number' ? '數字' : typeof v === 'boolean' ? '布林值' : '文字';
}

function fromDateVal(d: DateVal): FDate {
  return new FDate(toDate(d.start), d.end ? toDate(d.end) : null, hasTime(d.start));
}

function round(n: number) { return Math.round(n * 1e10) / 1e10; }

export function toText(v: FValue): string {
  if (v === null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(round(v)) : (isNaN(v) ? 'NaN' : v > 0 ? '∞' : '-∞');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (isDate(v)) {
    const s = toLocalIso(v.start, v.time);
    return formatDateValue(v.end ? `${s}/${toLocalIso(v.end, v.time)}` : s);
  }
  if (isList(v)) return v.map(toText).join(', ');
  return v;
}

function equals(a: FValue, b: FValue): boolean {
  if (isDate(a) && isDate(b)) return a.start.getTime() === b.start.getTime();
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (typeof a === 'number' && typeof b === 'string') return String(round(a)) === b;
  if (typeof b === 'number' && typeof a === 'string') return String(round(b)) === a;
  return a === b;
}

function compare(a: FValue, b: FValue, op: string): boolean {
  let x: number | string, y: number | string;
  if (isDate(a) && isDate(b)) { x = a.start.getTime(); y = b.start.getTime(); }
  else if (typeof a === 'string' && typeof b === 'string') { x = a; y = b; }
  else { x = num(a, op); y = num(b, op); }
  return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
}

const UNITS: Record<string, string> = {
  years: 'y', year: 'y', 年: 'y', quarters: 'q', quarter: 'q', 季: 'q', months: 'M', month: 'M', 月: 'M',
  weeks: 'w', week: 'w', 週: 'w', 周: 'w', days: 'd', day: 'd', 天: 'd', 日: 'd',
  hours: 'h', hour: 'h', 小時: 'h', 時: 'h', minutes: 'm', minute: 'm', 分鐘: 'm', 分: 'm', seconds: 's', second: 's', 秒: 's',
};
function unitOf(v: FValue): string {
  const u = UNITS[str(v).trim().toLowerCase()];
  if (!u) fail(`不支援的時間單位「${str(v)}」，可用 years、months、weeks、days、hours、minutes`);
  return u!;
}
function addTo(d: Date, n: number, u: string): Date {
  const x = new Date(d);
  if (u === 'y') x.setFullYear(x.getFullYear() + n);
  else if (u === 'q') x.setMonth(x.getMonth() + 3 * n);
  else if (u === 'M') x.setMonth(x.getMonth() + n);
  else if (u === 'w') x.setDate(x.getDate() + 7 * n);
  else if (u === 'd') x.setDate(x.getDate() + n);
  else if (u === 'h') x.setTime(x.getTime() + n * 3600_000);
  else if (u === 'm') x.setTime(x.getTime() + n * 60_000);
  else x.setTime(x.getTime() + n * 1000);
  return x;
}
function between(a: Date, b: Date, u: string): number {
  const ms = a.getTime() - b.getTime();
  const months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth()) - (a.getDate() < b.getDate() && ms > 0 ? 1 : 0);
  const trunc = (n: number) => (n < 0 ? Math.ceil(n) : Math.floor(n));
  switch (u) {
    case 'y': return trunc(months / 12);
    case 'q': return trunc(months / 3);
    case 'M': return months;
    case 'w': return trunc(ms / (7 * 864e5));
    case 'd': return trunc(ms / 864e5);
    case 'h': return trunc(ms / 3600_000);
    case 'm': return trunc(ms / 60_000);
    default: return trunc(ms / 1000);
  }
}

const WEEKDAY = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
function formatDateWith(d: Date, fmt: string): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const h = d.getHours();
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(2), MMMM: `${d.getMonth() + 1}月`, MM: p2(d.getMonth() + 1), M: String(d.getMonth() + 1),
    DD: p2(d.getDate()), D: String(d.getDate()), dddd: WEEKDAY[d.getDay()], ddd: WEEKDAY[d.getDay()].slice(1), HH: p2(h), H: String(h),
    hh: p2(h % 12 || 12), h: String(h % 12 || 12), mm: p2(d.getMinutes()), m: String(d.getMinutes()), A: h < 12 ? '上午' : '下午', a: h < 12 ? 'am' : 'pm',
  };
  return fmt.replace(/YYYY|YY|MMMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|A|a/g, (k) => map[k]);
}

/* ---------------- evaluation ---------------- */

export interface Ctx {
  row: Page;
  db: Database;
  stack: Set<string>;
  vars: Record<string, FValue>;
}

/** value of a property as a formula value */
export function propValue(ctx: Ctx, prop: Property): FValue {
  const r = ctx.row;
  switch (prop.type) {
    case 'title': return r.title || '';
    case 'text': case 'url': case 'email': case 'phone': return (r.props?.[prop.id] as string) || '';
    case 'number': { const v = r.props?.[prop.id]; return v === undefined || v === null || v === '' ? null : Number(v); }
    case 'checkbox': return !!r.props?.[prop.id];
    case 'select': case 'status': return prop.options?.find((o) => o.id === r.props?.[prop.id])?.name ?? '';
    case 'multi_select': {
      const ids: string[] = Array.isArray(r.props?.[prop.id]) ? r.props![prop.id] : [];
      return ids.map((id) => prop.options?.find((o) => o.id === id)?.name).filter((x): x is string => !!x);
    }
    case 'date': { const d = parseDateValue(r.props?.[prop.id]); return d ? fromDateVal(d) : null; }
    case 'created_time': return new FDate(new Date(r.createdAt));
    case 'last_edited_time': return new FDate(new Date(r.updatedAt));
    case 'formula': {
      if (ctx.stack.has(prop.id)) fail(`公式循環參照了「${prop.name}」`);
      ctx.stack.add(prop.id);
      try { return run(compile(prop.formula || ''), ctx); } finally { ctx.stack.delete(prop.id); }
    }
  }
  return null;
}

type Fn = (a: FValue[], ctx: Ctx) => FValue;
type LazyFn = (a: Node[], ctx: Ctx) => FValue;

const LAZY: Record<string, LazyFn> = {
  if: (a, c) => { if (a.length < 2) fail('if 需要 2 或 3 個參數'); return truthy(run(a[0], c)) ? run(a[1], c) : a[2] ? run(a[2], c) : null; },
  ifs: (a, c) => {
    for (let i = 0; i + 1 < a.length; i += 2) if (truthy(run(a[i], c))) return run(a[i + 1], c);
    return a.length % 2 ? run(a[a.length - 1], c) : null;
  },
  and: (a, c) => a.every((x) => truthy(run(x, c))),
  or: (a, c) => a.some((x) => truthy(run(x, c))),
  map: (a, c) => list(run(a[0], c)).map((v, i) => run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } })),
  filter: (a, c) => list(run(a[0], c)).filter((v, i) => truthy(run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } }))),
  find: (a, c) => list(run(a[0], c)).find((v, i) => truthy(run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } }))) ?? null,
  findIndex: (a, c) => list(run(a[0], c)).findIndex((v, i) => truthy(run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } }))),
  some: (a, c) => list(run(a[0], c)).some((v, i) => truthy(run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } }))),
  every: (a, c) => list(run(a[0], c)).every((v, i) => truthy(run(a[1], { ...c, vars: { ...c.vars, current: v, index: i } }))),
  let: (a, c) => {
    const n = a[0];
    if (!n || n.k !== 'id') fail('let 的第一個參數必須是名稱');
    return run(a[2], { ...c, vars: { ...c.vars, [(n as any).name]: run(a[1], c) } });
  },
  prop: (a, c) => {
    const name = str(run(a[0], c));
    const p = c.db.properties.find((x) => x.name === name);
    if (!p) fail(`找不到屬性「${name}」`);
    return propValue(c, p!);
  },
};

const nums = (a: FValue[], fn: string) => a.flatMap((v) => list(v)).filter((v) => v !== null && v !== '').map((v) => num(v, fn));

const FNS: Record<string, Fn> = {
  // logic & general
  not: ([v]) => !truthy(v),
  empty: ([v]) => !truthy(v),
  equal: ([a, b]) => equals(a, b),
  unequal: ([a, b]) => !equals(a, b),
  // text
  concat: (a) => (a.some(isList) && a.every(isList) ? (a as FValue[][]).flat() : a.map(str).join('')),
  join: (a) => (isList(a[0]) ? (a[0] as FValue[]).map(str).join(a.length > 1 ? str(a[1]) : ', ') : a.slice(1).map(str).join(str(a[0]))),
  length: ([v]) => (isList(v) ? v.length : str(v).length),
  contains: ([t, s]) => (isList(t) ? t.some((x) => equals(x, s)) : str(t).includes(str(s))),
  includes: ([t, s]) => (isList(t) ? t.some((x) => equals(x, s)) : str(t).includes(str(s))),
  replace: ([t, p, r]) => { try { return str(t).replace(new RegExp(str(p)), str(r ?? '')); } catch { return str(t).replace(str(p), str(r ?? '')); } },
  replaceAll: ([t, p, r]) => { try { return str(t).replace(new RegExp(str(p), 'g'), str(r ?? '')); } catch { return str(t).split(str(p)).join(str(r ?? '')); } },
  test: ([t, p]) => { try { return new RegExp(str(p)).test(str(t)); } catch { return fail('test 的規則運算式不正確'); } },
  match: ([t, p]) => { try { return str(t).match(new RegExp(str(p), 'g')) || []; } catch { return fail('match 的規則運算式不正確'); } },
  lower: ([t]) => str(t).toLowerCase(),
  upper: ([t]) => str(t).toUpperCase(),
  trim: ([t]) => str(t).trim(),
  repeat: ([t, n]) => str(t).repeat(Math.max(0, Math.min(1000, num(n, 'repeat')))),
  padStart: ([t, n, ch]) => str(t).padStart(num(n, 'padStart'), ch === undefined ? ' ' : str(ch)),
  padEnd: ([t, n, ch]) => str(t).padEnd(num(n, 'padEnd'), ch === undefined ? ' ' : str(ch)),
  split: ([t, s]) => str(t).split(s === undefined ? '' : str(s)),
  slice: ([t, s, e]) => (isList(t) ? t.slice(num(s, 'slice'), e === undefined ? undefined : num(e, 'slice')) : str(t).slice(num(s, 'slice'), e === undefined ? undefined : num(e, 'slice'))),
  substring: ([t, s, e]) => str(t).substring(num(s, 'substring'), e === undefined ? undefined : num(e, 'substring')),
  startsWith: ([t, s]) => str(t).startsWith(str(s)),
  endsWith: ([t, s]) => str(t).endsWith(str(s)),
  format: ([v]) => str(v),
  toNumber: ([v]) => {
    if (isDate(v)) return v.start.getTime();
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(str(v).replace(/[,\s]/g, ''));
    return str(v).trim() && !isNaN(n) ? n : null;
  },
  // numbers
  add: ([a, b]) => (typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a, 'add') + num(b, 'add')),
  subtract: ([a, b]) => num(a, 'subtract') - num(b, 'subtract'),
  multiply: ([a, b]) => num(a, 'multiply') * num(b, 'multiply'),
  divide: ([a, b]) => num(a, 'divide') / num(b, 'divide'),
  mod: ([a, b]) => num(a, 'mod') % num(b, 'mod'),
  pow: ([a, b]) => Math.pow(num(a, 'pow'), num(b, 'pow')),
  round: ([n, d]) => { const f = Math.pow(10, d === undefined ? 0 : num(d, 'round')); return Math.round(num(n, 'round') * f) / f; },
  floor: ([n]) => Math.floor(num(n, 'floor')),
  ceil: ([n]) => Math.ceil(num(n, 'ceil')),
  abs: ([n]) => Math.abs(num(n, 'abs')),
  sqrt: ([n]) => Math.sqrt(num(n, 'sqrt')),
  cbrt: ([n]) => Math.cbrt(num(n, 'cbrt')),
  exp: ([n]) => Math.exp(num(n, 'exp')),
  ln: ([n]) => Math.log(num(n, 'ln')),
  log10: ([n]) => Math.log10(num(n, 'log10')),
  log2: ([n]) => Math.log2(num(n, 'log2')),
  sign: ([n]) => Math.sign(num(n, 'sign')),
  min: (a) => { const n = nums(a, 'min'); return n.length ? Math.min(...n) : null; },
  max: (a) => { const n = nums(a, 'max'); return n.length ? Math.max(...n) : null; },
  sum: (a) => nums(a, 'sum').reduce((x, y) => x + y, 0),
  mean: (a) => { const n = nums(a, 'mean'); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; },
  average: (a) => { const n = nums(a, 'average'); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; },
  median: (a) => { const n = nums(a, 'median').sort((x, y) => x - y); if (!n.length) return null; const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  // dates
  now: () => new FDate(new Date()),
  today: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return new FDate(d, null, false); },
  dateAdd: ([d, n, u]) => { const x = date(d, 'dateAdd'); const k = unitOf(u); return new FDate(addTo(x.start, num(n, 'dateAdd'), k), x.end ? addTo(x.end, num(n, 'dateAdd'), k) : null, x.time || k === 'h' || k === 'm'); },
  dateSubtract: ([d, n, u]) => { const x = date(d, 'dateSubtract'); const k = unitOf(u); return new FDate(addTo(x.start, -num(n, 'dateSubtract'), k), x.end ? addTo(x.end, -num(n, 'dateSubtract'), k) : null, x.time || k === 'h' || k === 'm'); },
  dateBetween: ([a, b, u]) => between(date(a, 'dateBetween').start, date(b, 'dateBetween').start, unitOf(u)),
  dateRange: ([a, b]) => new FDate(date(a, 'dateRange').start, date(b, 'dateRange').start, date(a, 'dateRange').time),
  dateStart: ([d]) => { const x = date(d, 'dateStart'); return new FDate(x.start, null, x.time); },
  dateEnd: ([d]) => { const x = date(d, 'dateEnd'); return new FDate(x.end || x.start, null, x.time); },
  formatDate: ([d, f]) => formatDateWith(date(d, 'formatDate').start, f === undefined ? 'YYYY/MM/DD' : str(f)),
  parseDate: ([t]) => { const d = parseDateValue(str(t).trim().replace(/\//g, '-').replace(' ', 'T')); return d ? fromDateVal(d) : fail(`無法解析日期「${str(t)}」，請用 2026-11-23 或 2026-11-23T14:30`); },
  year: ([d]) => date(d, 'year').start.getFullYear(),
  month: ([d]) => date(d, 'month').start.getMonth() + 1,
  date: ([d]) => date(d, 'date').start.getDate(),
  day: ([d]) => { const w = date(d, 'day').start.getDay(); return w === 0 ? 7 : w; },
  hour: ([d]) => date(d, 'hour').start.getHours(),
  minute: ([d]) => date(d, 'minute').start.getMinutes(),
  week: ([d]) => {
    const t = new Date(date(d, 'week').start); t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const w1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  },
  timestamp: ([d]) => date(d, 'timestamp').start.getTime(),
  fromTimestamp: ([n]) => new FDate(new Date(num(n, 'fromTimestamp'))),
  // lists
  at: ([l, i]) => { const arr = isList(l) ? l : str(l).split(''); const k = num(i, 'at'); return arr[k < 0 ? arr.length + k : k] ?? null; },
  first: ([l]) => list(l)[0] ?? null,
  last: ([l]) => { const a = list(l); return a[a.length - 1] ?? null; },
  sort: ([l]) => [...list(l)].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : str(x).localeCompare(str(y)))),
  reverse: ([l]) => (isList(l) ? [...l].reverse() : str(l).split('').reverse().join('')),
  unique: ([l]) => list(l).filter((v, i, a) => a.findIndex((x) => equals(x, v)) === i),
  flat: ([l]) => list(l).flat(),
  count: ([l]) => list(l).length,
  id: (_a, c) => c.row.id,
};

const CONSTS: Record<string, FValue> = { pi: Math.PI, e: Math.E };

export function run(n: Node, c: Ctx): FValue {
  switch (n.k) {
    case 'lit': return n.v;
    case 'list': return n.items.map((x) => run(x, c));
    case 'id': {
      if (n.name in c.vars) return c.vars[n.name];
      if (n.name in CONSTS) return CONSTS[n.name];
      // bare property names also work: 名稱 or prop("名稱")
      const p = c.db.properties.find((x) => x.name === n.name);
      if (p) return propValue(c, p);
      if (FNS[n.name] || LAZY[n.name]) return fail(`${n.name} 是函式，請加上括號，例如 ${n.name}()`);
      return fail(`不認識「${n.name}」。屬性請寫成 prop("${n.name}")`);
    }
    case 'call': {
      const lazy = LAZY[n.name];
      if (lazy) return lazy(n.args, c);
      const fn = FNS[n.name];
      if (!fn) return fail(`沒有名為「${n.name}」的函式`);
      return fn(n.args.map((a) => run(a, c)), c);
    }
    case 'un': {
      const v = run(n.a, c);
      return n.op === '-' ? -num(v, '-') : !truthy(v);
    }
    case 'tern': return truthy(run(n.c, c)) ? run(n.a, c) : run(n.b, c);
    case 'bin': {
      if (n.op === '&&') return truthy(run(n.a, c)) && truthy(run(n.b, c));
      if (n.op === '||') return truthy(run(n.a, c)) || truthy(run(n.b, c));
      const a = run(n.a, c), b = run(n.b, c);
      switch (n.op) {
        case '+':
          if (typeof a === 'string' || typeof b === 'string') return str(a) + str(b);
          if (isList(a) && isList(b)) return [...a, ...b];
          return num(a, '+') + num(b, '+');
        case '-': return num(a, '-') - num(b, '-');
        case '*': return num(a, '*') * num(b, '*');
        case '/': return num(a, '/') / num(b, '/');
        case '%': return num(a, '%') % num(b, '%');
        case '^': return Math.pow(num(a, '^'), num(b, '^'));
        case '==': return equals(a, b);
        case '!=': return !equals(a, b);
        default: return compare(a, b, n.op);
      }
    }
  }
}

/* ---------------- public API ---------------- */

const cache = new Map<string, Node | FormulaError>();
export function compile(src: string): Node {
  let c = cache.get(src);
  if (!c) {
    try { c = parse(src); } catch (e) { c = e instanceof FormulaError ? e : new FormulaError(String(e)); }
    if (cache.size > 500) cache.clear();
    cache.set(src, c);
  }
  if (c instanceof FormulaError) throw c;
  return c;
}

export type FormulaResult = { ok: true; value: FValue } | { ok: false; error: string };

export function evaluate(src: string, row: Page, db: Database): FormulaResult {
  try {
    return { ok: true, value: run(compile(src), { row, db, stack: new Set(), vars: {} }) };
  } catch (e) {
    return { ok: false, error: e instanceof FormulaError ? e.message : `計算錯誤：${(e as Error)?.message || e}` };
  }
}

/** evaluate a formula property for a database row (uses the row's own database) */
export function formulaValue(row: Page, prop: Property): FormulaResult {
  const db = row.rowOf ? getState().dbs[row.rowOf] : undefined;
  if (!db) return { ok: true, value: null };
  if (!prop.formula?.trim()) return { ok: true, value: null };
  return evaluate(prop.formula, row, db);
}

/** "2026-11-23" style string for date results (so date formatting/filters can reuse it) */
export function dateResultIso(v: FDate): string {
  const s = toLocalIso(v.start, v.time);
  return v.end ? `${s}/${toLocalIso(v.end, v.time)}` : s;
}

/* ---------------- reference for the editor ---------------- */

export interface FnDoc { name: string; cat: string; sig: string; desc: string; ex: string }
export const FN_DOCS: FnDoc[] = [
  { cat: '邏輯', name: 'if', sig: 'if(條件, 成立時, 不成立時)', desc: '依條件回傳不同的值。', ex: 'if(prop("完成"), "✅", "⏳")' },
  { cat: '邏輯', name: 'ifs', sig: 'ifs(條件1, 值1, 條件2, 值2, …, 其他)', desc: '依序檢查多個條件，回傳第一個成立的值。', ex: 'ifs(prop("分數") >= 90, "優", prop("分數") >= 60, "及格", "不及格")' },
  { cat: '邏輯', name: 'and', sig: 'a and b、and(a, b, …)', desc: '全部成立才為 true。', ex: 'prop("完成") and prop("已確認")' },
  { cat: '邏輯', name: 'or', sig: 'a or b、or(a, b, …)', desc: '任一成立就為 true。', ex: 'prop("狀態") == "完成" or prop("狀態") == "取消"' },
  { cat: '邏輯', name: 'not', sig: 'not a、not(a)', desc: '反轉 true／false。', ex: 'not prop("完成")' },
  { cat: '邏輯', name: 'empty', sig: 'empty(值)', desc: '值為空白時回傳 true。', ex: 'empty(prop("日期"))' },
  { cat: '屬性', name: 'prop', sig: 'prop("屬性名稱")', desc: '取得此列某個屬性的值。', ex: 'prop("價格") * prop("數量")' },
  { cat: '文字', name: 'concat', sig: 'concat(a, b, …) 或 a + b', desc: '把文字接在一起。', ex: 'prop("名稱") + "（" + prop("狀態") + "）"' },
  { cat: '文字', name: 'length', sig: 'length(文字或清單)', desc: '字數或清單項目數。', ex: 'length(prop("名稱"))' },
  { cat: '文字', name: 'contains', sig: 'contains(文字, 要找的字)', desc: '是否包含某段文字（清單則檢查是否含有此項目）。', ex: 'contains(prop("標籤"), "緊急")' },
  { cat: '文字', name: 'replace', sig: 'replace(文字, 規則, 取代成)', desc: '取代第一個符合的部分（支援規則運算式）。', ex: 'replace(prop("電話"), "-", "")' },
  { cat: '文字', name: 'replaceAll', sig: 'replaceAll(文字, 規則, 取代成)', desc: '取代所有符合的部分。', ex: 'replaceAll(prop("名稱"), " ", "_")' },
  { cat: '文字', name: 'slice', sig: 'slice(文字, 開始, 結束?)', desc: '擷取一段文字或清單。', ex: 'slice(prop("名稱"), 0, 3)' },
  { cat: '文字', name: 'lower', sig: 'lower(文字)／upper(文字)', desc: '轉成小寫／大寫。', ex: 'upper(prop("代碼"))' },
  { cat: '文字', name: 'trim', sig: 'trim(文字)', desc: '去除前後空白。', ex: 'trim(prop("名稱"))' },
  { cat: '文字', name: 'split', sig: 'split(文字, 分隔符號)', desc: '把文字切成清單。', ex: 'split("a,b,c", ",")' },
  { cat: '文字', name: 'join', sig: 'join(清單, 分隔符號)', desc: '把清單接成文字。', ex: 'join(prop("標籤"), "、")' },
  { cat: '文字', name: 'test', sig: 'test(文字, 規則)', desc: '是否符合規則運算式。', ex: 'test(prop("電子郵件"), "@gmail\\\\.com$")' },
  { cat: '文字', name: 'padStart', sig: 'padStart(文字, 長度, 補字)', desc: '在前面補字到指定長度。', ex: 'padStart(format(prop("編號")), 4, "0")' },
  { cat: '文字', name: 'repeat', sig: 'repeat(文字, 次數)', desc: '重複文字，適合做進度條。', ex: 'repeat("★", prop("評分"))' },
  { cat: '文字', name: 'format', sig: 'format(值)', desc: '把任何值轉成文字。', ex: 'format(prop("數量")) + " 件"' },
  { cat: '數字', name: 'round', sig: 'round(數字, 小數位數?)', desc: '四捨五入。', ex: 'round(prop("平均") , 1)' },
  { cat: '數字', name: 'floor', sig: 'floor(數字)／ceil(數字)', desc: '無條件捨去／進位。', ex: 'ceil(prop("時數"))' },
  { cat: '數字', name: 'abs', sig: 'abs(數字)', desc: '絕對值。', ex: 'abs(prop("差額"))' },
  { cat: '數字', name: 'sum', sig: 'sum(a, b, …)', desc: '加總（可放清單）。', ex: 'sum(prop("A"), prop("B"), prop("C"))' },
  { cat: '數字', name: 'mean', sig: 'mean(a, b, …)', desc: '平均值。', ex: 'mean(prop("國文"), prop("數學"))' },
  { cat: '數字', name: 'min', sig: 'min(a, b, …)／max(…)', desc: '最小值／最大值。', ex: 'max(prop("A"), prop("B"))' },
  { cat: '數字', name: 'median', sig: 'median(a, b, …)', desc: '中位數。', ex: 'median([1, 5, 3])' },
  { cat: '數字', name: 'sqrt', sig: 'sqrt(數字)', desc: '平方根；次方請用 ^ 或 pow()。', ex: 'sqrt(prop("面積"))' },
  { cat: '數字', name: 'toNumber', sig: 'toNumber(值)', desc: '把文字轉成數字。', ex: 'toNumber("42") + 1' },
  { cat: '日期', name: 'now', sig: 'now()／today()', desc: '現在時間／今天日期。', ex: 'today()' },
  { cat: '日期', name: 'dateBetween', sig: 'dateBetween(日期1, 日期2, 單位)', desc: '兩個日期相差多少（日期1 − 日期2）。單位：years、months、weeks、days、hours、minutes。', ex: 'dateBetween(prop("截止日期"), today(), "days")' },
  { cat: '日期', name: 'dateAdd', sig: 'dateAdd(日期, 數量, 單位)', desc: '把日期往後加。', ex: 'dateAdd(prop("日期"), 7, "days")' },
  { cat: '日期', name: 'dateSubtract', sig: 'dateSubtract(日期, 數量, 單位)', desc: '把日期往前減。', ex: 'dateSubtract(prop("日期"), 1, "months")' },
  { cat: '日期', name: 'dateStart', sig: 'dateStart(日期)／dateEnd(日期)', desc: '取得日期範圍的開始或結束。', ex: 'dateBetween(dateEnd(prop("日期")), dateStart(prop("日期")), "minutes")' },
  { cat: '日期', name: 'formatDate', sig: 'formatDate(日期, 格式)', desc: '自訂日期文字。格式：YYYY MM DD HH mm dddd(星期) A(上午/下午)。', ex: 'formatDate(prop("日期"), "M/D dddd HH:mm")' },
  { cat: '日期', name: 'year', sig: 'year()、month()、date()、day()、hour()、minute()、week()', desc: '取得年、月、日、星期（1=週一…7=週日）、時、分、週數。', ex: 'month(prop("日期"))' },
  { cat: '日期', name: 'parseDate', sig: 'parseDate(文字)', desc: '把 "2026-11-23" 或 "2026-11-23 14:30" 轉成日期。', ex: 'parseDate("2026-12-25")' },
  { cat: '清單', name: 'map', sig: 'map(清單, 運算)', desc: '對每個項目運算，用 current 代表目前項目、index 代表位置。', ex: 'map(prop("標籤"), "#" + current)' },
  { cat: '清單', name: 'filter', sig: 'filter(清單, 條件)', desc: '保留符合條件的項目。', ex: 'filter(prop("標籤"), current != "完成")' },
  { cat: '清單', name: 'first', sig: 'first(清單)／last(清單)／at(清單, 位置)', desc: '取得第一個／最後一個／指定位置的項目。', ex: 'first(prop("標籤"))' },
  { cat: '清單', name: 'sort', sig: 'sort(清單)／reverse(清單)／unique(清單)', desc: '排序／反轉／去除重複。', ex: 'join(sort(prop("標籤")), ", ")' },
  { cat: '清單', name: 'some', sig: 'some(清單, 條件)／every(清單, 條件)', desc: '是否有任一／全部項目符合。', ex: 'some(prop("標籤"), current == "緊急")' },
  { cat: '進階', name: 'let', sig: 'let(名稱, 值, 運算)', desc: '把中間結果取名後再使用。', ex: 'let(天數, dateBetween(prop("截止日期"), today(), "days"), if(天數 < 0, "已逾期", 天數 + " 天後到期"))' },
];
