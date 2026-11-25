import React, { useEffect, useMemo, useState } from 'react';
import { isImeKey } from '../../ime';
import type { Page, PlannerPeriod, PlannerWidget, WidgetType } from '../../types';
import { askConfirm, setUI, toast } from '../../ui';
import { COLORS, COLOR_NAMES, uid } from '../../utils';
import {
  makeWidget, periodDays, periodKey, periodLabel, PERIOD_NAMES, saveAsTemplate, shiftPeriod, updatePlanner, WIDGET_INFO,
} from '../../planner';
import { Icon } from '../Icons';
import { MenuHeader, MenuItem, MenuSep, Popover } from '../Popover';
import { WIDGETS, WidgetSourceSelect, SourcePicker, sourceName, dbTitle, parseSpan, slotAddText, sourceTagProp } from './Widgets';
import { addSource, migrateWidgetDbLinks, removeSource, updateSource } from '../../planner';
import { useStore } from '../../store';
import { navigate } from '../../ui';
import { describeFilters } from '../db/dbutils';
import { FilterRows } from '../db/FilterEditor';

const WIDTHS: [number, string][] = [[3, '1/4'], [4, '1/3'], [6, '1/2'], [8, '2/3'], [9, '3/4'], [12, '整列']];
const PAPERS: [string, string][] = [['plain', '空白'], ['grid', '方格'], ['dots', '點點'], ['lined', '橫線']];

export function PlannerView({ page, readOnly }: { page: Page; readOnly: boolean }) {
  const pl = page.planner!;
  const [anchor, setAnchor] = useState(() => new Date());
  const [edit, setEdit] = useState(false);
  const [pop, setPop] = useState<null | { kind: 'layout' | 'tpl' | 'add' | 'save' | 'src-add'; anchor: HTMLElement }>(null);
  const [srcEdit, setSrcEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  useEffect(() => { if (!readOnly) migrateWidgetDbLinks(page.id); }, [page.id]); // eslint-disable-line
  const sources = pl.sources || [];
  const dbs = useStore((s) => s.dbs);
  const [settings, setSettings] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const ws = pl.style.weekStart;
  const key = periodKey(anchor, pl.period, ws);
  const prevKey = periodKey(shiftPeriod(anchor, pl.period, -1), pl.period, ws);
  const days = useMemo(() => periodDays(anchor, pl.period, ws), [key, pl.period, ws]); // eslint-disable-line
  const isCurrent = key === periodKey(new Date(), pl.period, ws);
  const canEdit = !readOnly;

  const addWidget = (type: WidgetType) => {
    const w = makeWidget(type);
    updatePlanner(page.id, (p) => { p.widgets.push(w as any); });
    setPop(null);
    setEdit(true);
  };
  const move = (id: string, beforeId: string | null) => updatePlanner(page.id, (p) => {
    const i = p.widgets.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [w] = p.widgets.splice(i, 1);
    const j = beforeId ? p.widgets.findIndex((x) => x.id === beforeId) : -1;
    if (j < 0) p.widgets.push(w); else p.widgets.splice(j, 0, w);
  });

  return (
    <div className={`planner paper-${pl.style.paper}`} style={{ ['--pl-accent' as any]: `var(--c-${pl.style.accent})`, ['--pl-accent-bg' as any]: `var(--b-${pl.style.accent})` }}>
      <div className="pl-bar">
        <div className="pl-nav">
          <button className="btn-icon" title="上一頁" onClick={() => setAnchor(shiftPeriod(anchor, pl.period, -1))}><Icon.chevronLeft size={16} /></button>
          <div className="pl-period">{periodLabel(anchor, pl.period, ws)}</div>
          <button className="btn-icon" title="下一頁" onClick={() => setAnchor(shiftPeriod(anchor, pl.period, 1))}><Icon.chevronRight size={16} /></button>
          {!isCurrent && <button className="btn-ghost sm" onClick={() => setAnchor(new Date())}>回到{pl.period === 'month' ? '本月' : pl.period === 'week' ? '本週' : '今天'}</button>}
          <input className="pl-jump" type="date" title="跳到指定日期" aria-label="跳到指定日期" onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split('-').map(Number); setAnchor(new Date(y, m - 1, d)); } }} />
        </div>
        <span className="spacer" />
        {canEdit && (
          <div className="pl-tools">
            <button className="btn-ghost sm" onClick={(e) => setPop({ kind: 'layout', anchor: e.currentTarget })}><Icon.settings size={14} /> 版面設定</button>
            <button className="btn-ghost sm" onClick={(e) => setPop({ kind: 'tpl', anchor: e.currentTarget })}><Icon.template size={14} /> 模板</button>
            <button className={edit ? 'btn-primary sm' : 'btn-outline sm'} onClick={() => setEdit(!edit)}><Icon.edit size={13} /> {edit ? '完成編輯' : '編輯版面'}</button>
          </div>
        )}
      </div>
      {(sources.length > 0 || canEdit) && (
        <div className="pl-sources">
          <span className="pl-sources-label">資料來源</span>
          {sources.map((s) => (
            <div key={s.id} className={'pl-src-chip' + (s.hidden ? ' off' : '')} style={{ ['--src' as any]: `var(--c-${s.color})`, ['--src-bg' as any]: `var(--b-${s.color})` }}>
              <button className="pl-src-toggle" title={s.hidden ? '顯示這個來源' : '隱藏這個來源'} aria-pressed={!s.hidden}
                onClick={() => updateSource(page.id, s.id, (x) => { x.hidden = !x.hidden; })}>{!s.hidden && <Icon.check size={11} />}</button>
              <button className="pl-src-name" title="設定篩選、顏色" onClick={(e) => canEdit && setSrcEdit({ id: s.id, anchor: e.currentTarget })}>
                {sourceName(s)}
                {s.filters.length > 0 && <span className="pl-src-filter"><Icon.filter size={11} /> {dbs[s.dbId] ? describeFilters(dbs[s.dbId], s.filters) || '篩選' : '篩選'}</span>}
              </button>
            </div>
          ))}
          {canEdit && <button className="btn-ghost sm muted" onClick={(e) => setPop({ kind: 'src-add', anchor: e.currentTarget })}><Icon.plus size={13} /> 連結資料</button>}
          {sources.length === 0 && <span className="muted small">連結你的排程資料庫，行程就會出現在月曆、時段表與行程區塊，並保持同步。</span>}
        </div>
      )}
      {edit && <div className="pl-edit-hint">拖曳區塊標題可以調整順序；用寬度、高度選單調整大小；按 ⚙ 修改內容設定。</div>}

      <div className={'pl-grid' + (edit ? ' editing' : '')}>
        {pl.widgets.map((w) => {
          const Comp = WIDGETS[w.type];
          const accent = w.color || pl.style.accent;
          return (
            <section key={w.id} className={'pl-card' + (drag === w.id ? ' dragging' : '')}
              style={{ gridColumn: `span ${Math.min(12, w.w)}`, gridRow: `span ${w.h}`, ['--w-accent' as any]: `var(--c-${accent})`, ['--w-accent-bg' as any]: `var(--b-${accent})` }}
              onDragOver={(e) => { if (drag && drag !== w.id) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== w.id) move(drag, w.id); setDrag(null); }}>
              <header className="pl-card-head" draggable={edit} onDragStart={(e) => { setDrag(w.id); e.dataTransfer.setData('text/plain', w.id); }} onDragEnd={() => setDrag(null)}>
                {edit && <span className="pl-grip"><Icon.drag size={12} /></span>}
                <span className="pl-card-title">{w.title}</span>
                <span className="spacer" />
                {edit && (
                  <>
                    <select className="pl-size" value={w.w} title="寬度" onChange={(e) => updatePlanner(page.id, (p) => { p.widgets.find((x) => x.id === w.id)!.w = +e.target.value; })}>
                      {WIDTHS.map(([n, l]) => <option key={n} value={n}>寬 {l}</option>)}
                    </select>
                    <select className="pl-size" value={w.h} title="高度" onChange={(e) => updatePlanner(page.id, (p) => { p.widgets.find((x) => x.id === w.id)!.h = +e.target.value; })}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>高 {n}</option>)}
                    </select>
                  </>
                )}
                {canEdit && <button className="btn-icon xs pl-gear" title="區塊設定" onClick={(e) => setSettings({ id: w.id, anchor: e.currentTarget })}><Icon.settings size={13} /></button>}
                {edit && <button className="btn-icon xs" title="移除區塊" onClick={async () => {
                  if (await askConfirm(`移除「${w.title}」區塊？這個區塊在所有頁面寫的內容都會一起隱藏。`, '移除')) updatePlanner(page.id, (p) => { p.widgets = p.widgets.filter((x) => x.id !== w.id); });
                }}><Icon.x size={13} /></button>}
              </header>
              <div className="pl-card-body">
                <Comp page={page} w={w} pkey={key} prevKey={prevKey} days={days} anchor={anchor} readOnly={readOnly} />
              </div>
            </section>
          );
        })}
        {canEdit && (edit || pl.widgets.length === 0) && (
          <button className="pl-add-tile" onClick={(e) => setPop({ kind: 'add', anchor: e.currentTarget })}
            onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag) move(drag, null); setDrag(null); }}>
            <Icon.plus size={18} /> 新增區塊
          </button>
        )}
      </div>

      {pop?.kind === 'add' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={320}>
          <MenuHeader>新增區塊</MenuHeader>
          {(Object.keys(WIDGET_INFO) as WidgetType[]).map((t) => {
            const info = WIDGET_INFO[t];
            const ok = info.periods.includes(pl.period);
            return (
              <div key={t} className={'menu-item pl-add-item' + (ok ? '' : ' disabled')} onClick={() => ok && addWidget(t)} title={ok ? '' : `只適用於${info.periods.map((x) => PERIOD_NAMES[x]).join('、')}手帳`}>
                <span className="pl-add-icon">{info.icon}</span>
                <span className="menu-label"><div>{info.label}</div><div className="muted small pl-add-desc">{ok ? info.desc : `只適用於${info.periods.map((x) => PERIOD_NAMES[x]).join('、')}的手帳`}</div></span>
              </div>
            );
          })}
        </Popover>
      )}

      {pop?.kind === 'layout' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={300} align="right">
          <MenuHeader>每一頁代表</MenuHeader>
          <div className="seg pl-seg">
            {(['month', 'week', 'day'] as PlannerPeriod[]).map((p) => (
              <button key={p} className={pl.period === p ? 'on' : ''} onClick={async () => {
                const bad = pl.widgets.filter((w) => !WIDGET_INFO[w.type].periods.includes(p));
                if (bad.length && !(await askConfirm(`「${bad.map((b) => b.title).join('、')}」不適用於${PERIOD_NAMES[p]}手帳，切換後這些區塊會被移除。確定嗎？`, '切換'))) return;
                updatePlanner(page.id, (x) => { x.period = p; x.widgets = x.widgets.filter((w) => WIDGET_INFO[w.type].periods.includes(p)); });
              }}>{p === 'month' ? '一個月' : p === 'week' ? '一週' : '一天'}</button>
            ))}
          </div>
          <div className="menu-row">
            <span>一週從</span>
            <select className="select-sm" value={ws} onChange={(e) => updatePlanner(page.id, (x) => { x.style.weekStart = +e.target.value as 0 | 1; })}>
              <option value={1}>週一開始</option><option value={0}>週日開始</option>
            </select>
          </div>
          <MenuSep />
          <MenuHeader>紙張</MenuHeader>
          <div className="pl-papers">
            {PAPERS.map(([k, l]) => (
              <button key={k} className={'pl-paper-opt paper-' + k + (pl.style.paper === k ? ' on' : '')} onClick={() => updatePlanner(page.id, (x) => { x.style.paper = k as any; })}>{l}</button>
            ))}
          </div>
          <MenuHeader>主題色</MenuHeader>
          <div className="pl-swatches">
            {COLORS.slice(1).map((c) => (
              <button key={c} className={'pl-swatch' + (pl.style.accent === c ? ' on' : '')} title={COLOR_NAMES[c]} style={{ background: `var(--c-${c})` }}
                onClick={() => updatePlanner(page.id, (x) => { x.style.accent = c; })} />
            ))}
          </div>
        </Popover>
      )}

      {pop?.kind === 'tpl' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={260} align="right">
          <MenuItem icon={<Icon.duplicate />} label="把這個版面存成我的模板…" onClick={(e) => setPop({ kind: 'save', anchor: (e.currentTarget as HTMLElement) })} />
          <MenuItem icon={<Icon.template />} label="改用其他模板…" onClick={() => { setPop(null); setUI({ plannerPick: { mode: 'apply', pageId: page.id } }); }} />
          <MenuSep />
          <div className="menu-foot">模板只保存版面（區塊、大小、設定），不會包含你寫的內容。</div>
        </Popover>
      )}

      {pop?.kind === 'save' && <SaveTemplatePopover page={page} anchor={pop.anchor} onClose={() => setPop(null)} />}

      {pop?.kind === 'src-add' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={320}>
          <div className="pl-form">
            <div className="strong">連結資料</div>
            <div className="muted small">選擇有日期欄位的資料庫（例如你的排程）。連結後可以設定篩選，例如只顯示「類別 是 工作」。</div>
            <SourcePicker page={page} onPick={(dbId) => {
              const id = addSource(page.id, dbId);
              const a = pop.anchor;
              setPop(null);
              setSrcEdit({ id, anchor: a });
            }} />
          </div>
        </Popover>
      )}
      {srcEdit && sources.find((s) => s.id === srcEdit.id) && (
        <SourceEditor page={page} srcId={srcEdit.id} anchor={srcEdit.anchor} onClose={() => setSrcEdit(null)} />
      )}
      {settings && (() => {
        const w = pl.widgets.find((x) => x.id === settings.id);
        return w ? <WidgetSettings page={page} w={w} anchor={settings.anchor} onClose={() => setSettings(null)} /> : null;
      })()}
    </div>
  );
}

function SaveTemplatePopover({ page, anchor, onClose }: { page: Page; anchor: HTMLElement; onClose: () => void }) {
  const [name, setName] = useState(page.title ? `${page.title} 模板` : '我的手帳模板');
  const [desc, setDesc] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} width={300} align="right">
      <div className="pl-form">
        <label className="muted small" htmlFor="tpl-name">模板名稱</label>
        <input id="tpl-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <label className="muted small" htmlFor="tpl-desc">說明（選填）</label>
        <input id="tpl-desc" className="input" value={desc} placeholder="例如：衡鑑排程用的週計畫" onChange={(e) => setDesc(e.target.value)} />
        <button className="btn-primary" disabled={!name.trim()} onClick={() => {
          saveAsTemplate(page.id, name.trim(), page.icon && !/^(https?:|data:)/.test(page.icon) ? page.icon : '📓', desc.trim());
          toast(`已儲存模板「${name.trim()}」`);
          onClose();
        }}>儲存模板</button>
      </div>
    </Popover>
  );
}

function WidgetSettings({ page, w, anchor, onClose }: { page: Page; w: PlannerWidget; anchor: HTMLElement; onClose: () => void }) {
  const [title, setTitle] = useState(w.title);
  const [newItem, setNewItem] = useState('');
  const patch = (fn: (x: PlannerWidget) => void) => updatePlanner(page.id, (p) => { const x = p.widgets.find((y) => y.id === w.id); if (x) { x.opts = x.opts || {}; fn(x as PlannerWidget); } });
  const saveTitle = () => title.trim() && title !== w.title && patch((x) => { x.title = title.trim(); });
  const o = w.opts || {};
  return (
    <Popover anchor={anchor} onClose={() => { saveTitle(); onClose(); }} width={300} align="right">
      <div className="pl-form">
        <label className="muted small" htmlFor="w-title">區塊名稱</label>
        <input id="w-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeKey(e))) { saveTitle(); onClose(); } }} />
        <div className="muted small">顏色</div>
        <div className="pl-swatches">
          <button className={'pl-swatch auto' + (!w.color ? ' on' : '')} title="跟隨主題色" onClick={() => patch((x) => { x.color = undefined; })}>A</button>
          {COLORS.slice(1).map((c) => (
            <button key={c} className={'pl-swatch' + (w.color === c ? ' on' : '')} title={COLOR_NAMES[c]} style={{ background: `var(--c-${c})` }} onClick={() => patch((x) => { x.color = c; })} />
          ))}
        </div>

        {w.type === 'list' && (
          <>
            <div className="muted small">樣式</div>
            <div className="seg pl-seg">
              {([['check', '☑ 勾選'], ['bullet', '• 項目'], ['number', '1. 編號']] as const).map(([k, l]) => (
                <button key={k} className={(o.style || 'check') === k ? 'on' : ''} onClick={() => patch((x) => { x.opts!.style = k; })}>{l}</button>
              ))}
            </div>
          </>
        )}

        {(w.type === 'slots' || w.type === 'month') && (
          <>
            <div className="muted small">每天怎麼分</div>
            <div className="seg pl-seg">
              {(w.type === 'month'
                ? ([['none', '不分時段'], ['custom', '分時段（上午／下午／晚上…）']] as const)
                : ([['custom', '自訂時段'], ['hourly', '每小時'], ['none', '不分時段']] as const)
              ).map(([k, l]) => (
                <button key={k} className={(o.slotMode || (w.type === 'month' ? 'none' : 'custom')) === k ? 'on' : ''} onClick={() => patch((x) => {
                  x.opts!.slotMode = k;
                  if (k === 'custom' && !x.opts!.slots?.length) x.opts!.slots = ['上午', '下午', '晚上'].map((label) => ({ id: uid(), label }));
                })}>{l}</button>
              ))}
            </div>
            {(o.slotMode || (w.type === 'month' ? 'none' : 'custom')) === 'custom' && (
              <div className="pl-edit-list">
                {(o.slots || []).map((s, i) => (
                  <div key={s.id} className="pl-edit-row">
                    <input className="input sm" value={s.label} aria-label="時段名稱" onChange={(e) => patch((x) => { x.opts!.slots![i].label = e.target.value; })} />
                    {w.type === 'month' && (
                      <input className={'input sm pl-slot-time' + (s.time && !parseSpan(s.time) ? ' invalid' : '')} value={s.time || ''} aria-label={`${s.label}的時間`}
                        placeholder={slotAddText(o.slots || [], i)} title="這個時段的時間，例如 13:30-17:30；新增的標籤會用這個時間"
                        onChange={(e) => patch((x) => { x.opts!.slots![i].time = e.target.value || undefined; })} />
                    )}
                    <button className="btn-icon xs" title="上移" disabled={i === 0} onClick={() => patch((x) => { const a = x.opts!.slots!; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
                    <button className="btn-icon xs" title="刪除" onClick={() => patch((x) => { x.opts!.slots = x.opts!.slots!.filter((y) => y.id !== s.id); })}><Icon.x size={12} /></button>
                  </div>
                ))}
                <div className="pl-edit-row">
                  <input className="input sm" placeholder="新增時段，例如：清晨、中午" value={newItem} onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim() && !isImeKey(e)) { patch((x) => { x.opts!.slots = [...(x.opts!.slots || []), { id: uid(), label: newItem.trim() }]; }); setNewItem(''); } }} />
                  <button className="btn-outline sm" disabled={!newItem.trim()} onClick={() => { patch((x) => { x.opts!.slots = [...(x.opts!.slots || []), { id: uid(), label: newItem.trim() }]; }); setNewItem(''); }}>新增</button>
                </div>
              </div>
            )}
            {o.slotMode === 'hourly' && (
              <div className="pl-edit-row">
                <select className="select-sm" value={o.startHour ?? 8} aria-label="開始時間" onChange={(e) => patch((x) => { x.opts!.startHour = +e.target.value; })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
                <span className="muted">到</span>
                <select className="select-sm" value={o.endHour ?? 20} aria-label="結束時間" onChange={(e) => patch((x) => { x.opts!.endHour = +e.target.value; })}>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
                <select className="select-sm" value={o.step || 60} aria-label="間隔" onChange={(e) => patch((x) => { x.opts!.step = +e.target.value as 30 | 60; })}>
                  <option value={60}>每 1 小時</option><option value={30}>每 30 分鐘</option>
                </select>
              </div>
            )}
          </>
        )}

        {(w.type === 'month' || w.type === 'slots' || w.type === 'schedule') && (
          <>
            <div className="muted small">這個區塊顯示的行程</div>
            <WidgetSourceSelect page={page} w={w} />
            <label className="pl-src-opt"><input type="checkbox" checked={!o.hideTime} onChange={(e) => patch((x) => { x.opts!.hideTime = !e.target.checked || undefined; })} /> 顯示行程時間（例如 13:30）</label>
            {w.type === 'month' && (
              <label className="pl-src-opt"><input type="checkbox" checked={!o.hideTagBar} onChange={(e) => patch((x) => { x.opts!.hideTagBar = !e.target.checked || undefined; })} /> 在月曆上方顯示快速標籤列</label>
            )}
          </>
        )}

        {w.type === 'habit' && (
          <div className="pl-edit-list">
            <div className="muted small">要追蹤的習慣</div>
            {(o.habits || []).map((h, i) => (
              <div key={h.id} className="pl-edit-row">
                <input className="input sm" value={h.name} aria-label="習慣名稱" onChange={(e) => patch((x) => { x.opts!.habits![i].name = e.target.value; })} />
                <button className="btn-icon xs" title="刪除" onClick={() => patch((x) => { x.opts!.habits = x.opts!.habits!.filter((y) => y.id !== h.id); })}><Icon.x size={12} /></button>
              </div>
            ))}
            <div className="pl-edit-row">
              <input className="input sm" placeholder="新增習慣" value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim() && !isImeKey(e)) { patch((x) => { x.opts!.habits = [...(x.opts!.habits || []), { id: uid(), name: newItem.trim() }]; }); setNewItem(''); } }} />
              <button className="btn-outline sm" disabled={!newItem.trim()} onClick={() => { patch((x) => { x.opts!.habits = [...(x.opts!.habits || []), { id: uid(), name: newItem.trim() }]; }); setNewItem(''); }}>新增</button>
            </div>
          </div>
        )}
      </div>
    </Popover>
  );
}

function SourceEditor({ page, srcId, anchor, onClose }: { page: Page; srcId: string; anchor: HTMLElement; onClose: () => void }) {
  const src = page.planner?.sources?.find((s) => s.id === srcId);
  const db = useStore((s) => (src ? s.dbs[src.dbId] : undefined));
  const [name, setName] = useState(src?.name || '');
  if (!src) return null;
  const dateProps = db?.properties.filter((p) => p.type === 'date') || [];
  const isDefault = page.planner?.addTo === src.id;
  const saveName = () => name !== (src.name || '') && updateSource(page.id, src.id, (x) => { x.name = name.trim() || undefined; });
  return (
    <Popover anchor={anchor} onClose={() => { saveName(); onClose(); }} width={540}>
      <div className="pl-form">
        <div className="pl-src-head">
          <span className="pl-src-dot lg" style={{ background: `var(--c-${src.color})` }} />
          <input className="input" aria-label="顯示名稱" value={name} placeholder={dbTitle(src.dbId)} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        </div>
        <div className="muted small">來源：{dbTitle(src.dbId)}{db && <button className="btn-ghost sm" onClick={() => { saveName(); onClose(); navigate(db.hostPageId); }}>開啟資料庫</button>}</div>
        <div className="pl-swatches">
          {COLORS.slice(1).map((c) => (
            <button key={c} className={'pl-swatch' + (src.color === c ? ' on' : '')} title={COLOR_NAMES[c]} style={{ background: `var(--c-${c})` }}
              onClick={() => updateSource(page.id, src.id, (x) => { x.color = c; })} />
          ))}
        </div>
        {dateProps.length > 1 && (
          <div className="menu-row" style={{ padding: 0 }}>
            <span className="muted small">依哪個日期放到手帳上</span>
            <select className="select-sm" value={src.dateProp || dateProps[0].id} onChange={(e) => updateSource(page.id, src.id, (x) => { x.dateProp = e.target.value; })}>
              {dateProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {db && (
          <div className="menu-row" style={{ padding: 0 }}>
            <span className="muted small">標籤（決定行程顏色，也能在月曆上直接加上）</span>
            <select className="select-sm" aria-label="標籤欄位" value={src.tagProp === 'none' ? 'none' : sourceTagProp(db, src)?.id || 'none'}
              onChange={(e) => updateSource(page.id, src.id, (x) => { x.tagProp = e.target.value; })}>
              {db.properties.filter((p) => p.type === 'select' || p.type === 'multi_select').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="none">不使用標籤</option>
            </select>
          </div>
        )}
        <div className="strong small" style={{ marginTop: 4 }}>篩選</div>
        {db ? (
          <FilterRows db={db} filters={src.filters} empty="顯示這個資料庫的全部行程。新增條件可以只看部分內容，例如「類別 是 工作」。"
            onChange={(next) => updateSource(page.id, src.id, (x) => { x.filters = next as any; })} />
        ) : <div className="muted small">找不到這個資料庫，可能已被刪除。</div>}
        {src.filters.length > 0 && <div className="muted small">從這本手帳新增的行程，會自動填入符合篩選的值（例如類別設為「工作」）。</div>}
        <label className="pl-src-opt"><input type="checkbox" checked={isDefault} onChange={(e) => updatePlanner(page.id, (p) => { p.addTo = e.target.checked ? src.id : p.sources?.find((s) => s.id !== src.id)?.id; })} /> 在手帳上新增行程時，預設加到這裡</label>
        <label className="pl-src-opt"><input type="checkbox" checked={!!src.hidden} onChange={(e) => updateSource(page.id, src.id, (x) => { x.hidden = e.target.checked; })} /> 暫時隱藏</label>
        <div className="pl-edit-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <button className="btn-ghost sm danger" onClick={() => { removeSource(page.id, src.id); onClose(); }}><Icon.trash size={13} /> 取消連結</button>
          <button className="btn-primary sm" onClick={() => { saveName(); onClose(); }}>完成</button>
        </div>
      </div>
    </Popover>
  );
}
