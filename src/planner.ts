import type { Draft } from 'immer';
import type { Planner, PlannerPeriod, PlannerStyle, PlannerTemplate, PlannerWidget, WidgetType } from './types';
import { getState, makePage, newBlock, update } from './store';
import { uid } from './utils';
import { toLocalIso } from './dates';

/* ---------------- periods ---------------- */

export function periodStart(d: Date, period: PlannerPeriod, weekStart: 0 | 1): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'month') x.setDate(1);
  if (period === 'week') x.setDate(x.getDate() - ((x.getDay() - weekStart + 7) % 7));
  return x;
}

export function periodKey(d: Date, period: PlannerPeriod, weekStart: 0 | 1): string {
  const s = periodStart(d, period, weekStart);
  return period === 'month' ? toLocalIso(s, false).slice(0, 7) : toLocalIso(s, false);
}

export function shiftPeriod(d: Date, period: PlannerPeriod, dir: number): Date {
  const x = new Date(d);
  if (period === 'month') { x.setDate(1); x.setMonth(x.getMonth() + dir); }
  else x.setDate(x.getDate() + (period === 'week' ? 7 : 1) * dir);
  return x;
}

/** every day (YYYY-MM-DD) in the period that contains d */
export function periodDays(d: Date, period: PlannerPeriod, weekStart: 0 | 1): string[] {
  const s = periodStart(d, period, weekStart);
  const n = period === 'day' ? 1 : period === 'week' ? 7 : new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => { const x = new Date(s); x.setDate(s.getDate() + i); return toLocalIso(x, false); });
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];
export function periodLabel(d: Date, period: PlannerPeriod, weekStart: 0 | 1): string {
  const s = periodStart(d, period, weekStart);
  if (period === 'month') return `${s.getFullYear()}年${s.getMonth() + 1}月`;
  if (period === 'day') return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日（${WD[s.getDay()]}）`;
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 – ${e.getMonth() + 1}月${e.getDate()}日`;
}

export const PERIOD_NAMES: Record<PlannerPeriod, string> = { month: '每月', week: '每週', day: '每日' };

/* ---------------- widgets ---------------- */

export const WIDGET_INFO: Record<WidgetType, { label: string; icon: string; desc: string; periods: PlannerPeriod[] }> = {
  month: { label: '月曆', icon: '🗓️', desc: '整個月的格子，每天都能寫字，也可顯示行程資料庫。', periods: ['month'] },
  slots: { label: '時段表', icon: '⏰', desc: '把每天分成上午／下午／晚上、自訂時段或每小時。', periods: ['week', 'day'] },
  list: { label: '清單', icon: '☑️', desc: '待辦事項、目標或重點，可勾選、項目符號或編號。', periods: ['month', 'week', 'day'] },
  schedule: { label: '行程', icon: '📌', desc: '列出資料庫中這段期間的行程，可直接新增。', periods: ['month', 'week', 'day'] },
  habit: { label: '習慣追蹤', icon: '🌱', desc: '每天打勾，追蹤習慣。', periods: ['month', 'week', 'day'] },
  notes: { label: '筆記', icon: '📝', desc: '自由書寫的區塊。', periods: ['month', 'week', 'day'] },
};

export function makeWidget(type: WidgetType, patch: Partial<PlannerWidget> = {}): PlannerWidget {
  const base: PlannerWidget = { id: uid(), type, title: WIDGET_INFO[type].label, w: 4, h: 1 };
  if (type === 'list') base.opts = { style: 'check' };
  if (type === 'slots') base.opts = { slotMode: 'custom', slots: ['上午', '下午', '晚上'].map((label) => ({ id: uid(), label })), startHour: 8, endHour: 20, step: 60 };
  if (type === 'habit') base.opts = { habits: ['運動', '閱讀', '喝水 8 杯'].map((name) => ({ id: uid(), name })) };
  if (type === 'month') { base.w = 8; base.h = 2; }
  if (type === 'slots') base.w = 12;
  if (type === 'habit') base.w = 12;
  return { ...base, ...patch, opts: { ...base.opts, ...patch.opts } };
}

export function slotsOf(w: PlannerWidget): { key: string; label: string }[] {
  const o = w.opts || {};
  if (o.slotMode === 'none') return [{ key: 'all', label: '' }];
  if (o.slotMode === 'hourly') {
    const out: { key: string; label: string }[] = [];
    const step = o.step || 60;
    // endHour is exclusive: 8–21 gives 08:00 … 20:00 (the last slot ends at 21:00)
    for (let m = (o.startHour ?? 8) * 60; m < (o.endHour ?? 20) * 60 && out.length < 96; m += step) {
      const k = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out.push({ key: k, label: k });
    }
    return out;
  }
  return (o.slots || []).map((s) => ({ key: s.id, label: s.label }));
}

/* ---------------- templates ---------------- */

const STYLE: PlannerStyle = { paper: 'plain', accent: 'blue', weekStart: 1 };
const W = makeWidget;

export function builtinTemplates(): PlannerTemplate[] {
  return [
    {
      id: 'b-month', builtin: true, name: '月計畫手帳', icon: '📅', period: 'month', style: { ...STYLE, paper: 'dots', accent: 'orange' },
      desc: '月曆搭配本月目標、待辦、行程、備忘與習慣追蹤，像紙本手帳的月計畫頁。',
      widgets: [
        W('month', { title: '本月行事曆', w: 8, h: 2 }),
        W('list', { title: '本月目標', w: 4, h: 1, color: 'orange', opts: { style: 'number' } }),
        W('list', { title: '待辦事項', w: 4, h: 1, color: 'blue' }),
        W('schedule', { title: '重要行程', w: 6, h: 1, color: 'purple' }),
        W('notes', { title: '備忘錄', w: 6, h: 1, color: 'green' }),
        W('habit', { title: '習慣追蹤', w: 12, h: 1, color: 'green' }),
      ],
    },
    {
      id: 'b-week-ampm', builtin: true, name: '週計畫（上午／下午／晚上）', icon: '🗓️', period: 'week', style: { ...STYLE, paper: 'grid' },
      desc: '一週七天，每天分成上午、下午、晚上三個時段，加上本週目標與待辦。',
      widgets: [
        W('slots', { title: '本週時段', w: 12, h: 1 }),
        W('list', { title: '本週目標', w: 4, h: 1, color: 'orange', opts: { style: 'number' } }),
        W('list', { title: '待辦事項', w: 4, h: 1, color: 'blue' }),
        W('notes', { title: '備忘錄', w: 4, h: 1, color: 'green' }),
      ],
    },
    {
      id: 'b-week-hourly', builtin: true, name: '週計畫（每小時）', icon: '⏰', period: 'week', style: { ...STYLE, paper: 'plain', accent: 'purple' },
      desc: '一週七天、早上 8 點到晚上 9 點每小時一格，右側放待辦與目標。',
      widgets: [
        W('slots', { title: '每小時行程', w: 9, h: 3, opts: { slotMode: 'hourly', startHour: 8, endHour: 21, step: 60 } }),
        W('list', { title: '本週目標', w: 3, h: 1, color: 'orange', opts: { style: 'number' } }),
        W('list', { title: '待辦事項', w: 3, h: 1, color: 'blue' }),
        W('notes', { title: '備忘錄', w: 3, h: 1, color: 'green' }),
      ],
    },
    {
      id: 'b-day-hourly', builtin: true, name: '日計畫（每小時）', icon: '☀️', period: 'day', style: { ...STYLE, paper: 'lined', accent: 'yellow' },
      desc: '一天從早上 6 點到晚上 11 點每小時一格，搭配今日三件要事、待辦與習慣。',
      widgets: [
        W('slots', { title: '時間軸', w: 7, h: 3, opts: { slotMode: 'hourly', startHour: 6, endHour: 23, step: 60 } }),
        W('list', { title: '今日三件要事', w: 5, h: 1, color: 'red', opts: { style: 'number' } }),
        W('list', { title: '待辦事項', w: 5, h: 1, color: 'blue' }),
        W('habit', { title: '今日習慣', w: 5, h: 1, color: 'green' }),
      ],
    },
    {
      id: 'b-day-ampm', builtin: true, name: '日計畫（上午／下午／晚上）', icon: '🌤️', period: 'day', style: { ...STYLE, paper: 'dots', accent: 'blue' },
      desc: '一天分成上午、下午、晚上，搭配待辦、筆記與一天的回顧。',
      widgets: [
        W('slots', { title: '今日時段', w: 12, h: 1 }),
        W('list', { title: '待辦事項', w: 6, h: 1, color: 'blue' }),
        W('notes', { title: '今日筆記', w: 6, h: 1, color: 'green' }),
        W('notes', { title: '一天的回顧', w: 12, h: 1, color: 'purple' }),
      ],
    },
  ];
}

export function blankTemplate(period: PlannerPeriod): PlannerTemplate {
  return { id: 'blank-' + period, builtin: true, name: '空白手帳', icon: '📓', period, style: { ...STYLE }, widgets: [], desc: '從空白開始，自己加入區塊。' };
}

/** fresh copies of the widgets with new ids */
function cloneWidgets(ws: PlannerWidget[]): PlannerWidget[] {
  return ws.map((w) => ({ ...JSON.parse(JSON.stringify(w)), id: uid() }));
}

export function createPlannerPage(t: PlannerTemplate, parentId: string | null, addLinkInParent = true): string {
  const siblings = Object.values(getState().pages).filter((p) => p.parentId === parentId && !p.rowOf);
  const page = makePage({
    title: t.builtin ? t.name : t.name, icon: t.icon, parentId, blocks: [],
    sort: siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 1 : 0,
    planner: { period: t.period, widgets: cloneWidgets(t.widgets), style: { ...t.style }, entries: {} },
  });
  update((d) => {
    d.pages[page.id] = page;
    if (addLinkInParent && parentId && d.pages[parentId]) d.pages[parentId].blocks.push(newBlock('page', { pageId: page.id }));
  });
  return page.id;
}

/* ---------------- updates ---------------- */

export function updatePlanner(pageId: string, fn: (p: Draft<Planner>) => void, kind: 'structural' | 'typing' | 'silent' = 'structural') {
  update((d) => {
    const pl = d.pages[pageId]?.planner;
    if (pl) fn(pl);
  }, kind);
}

export function updateEntry(pageId: string, key: string, widgetId: string, fn: (data: any) => any, kind: 'structural' | 'typing' = 'structural') {
  updatePlanner(pageId, (pl) => {
    pl.entries[key] = pl.entries[key] || {};
    const cur = pl.entries[key][widgetId] ?? {};
    const r = fn(cur);
    if (r !== undefined) pl.entries[key][widgetId] = r;
    else pl.entries[key][widgetId] = cur;
  }, kind);
}

export function saveAsTemplate(pageId: string, name: string, icon: string, desc: string): string {
  const pl = getState().pages[pageId]?.planner;
  if (!pl) return '';
  const t: PlannerTemplate = { id: uid(), name, icon, desc, period: pl.period, style: { ...pl.style }, widgets: JSON.parse(JSON.stringify(pl.widgets)) };
  update((d) => { d.plannerTemplates = [...(d.plannerTemplates || []), t]; });
  return t.id;
}

export function deleteTemplate(id: string) {
  update((d) => { d.plannerTemplates = (d.plannerTemplates || []).filter((t) => t.id !== id); });
}

export function applyTemplate(pageId: string, t: PlannerTemplate) {
  updatePlanner(pageId, (pl) => {
    pl.period = t.period;
    pl.style = { ...t.style };
    pl.widgets = cloneWidgets(t.widgets) as any;
  });
}
