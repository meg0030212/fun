import React, { useMemo, useState } from 'react';
import type { Database, View, ViewType } from '../../types';
import { addRow, isTrashed, makeProp, makeView, updateDb, updateView, useStore, getState } from '../../store';
import { openPeek } from '../../ui';
import { uid } from '../../utils';
import { Icon } from '../Icons';
import { Popover, MenuItem, MenuSep, MenuHeader, Toggle } from '../Popover';
import { defaultsFromFilters, opsFor, processRows } from './dbutils';
import { PropIcon, Chip } from './Property';
import { TableView, BoardView, ListView, GalleryView, CalendarView } from './Views';

export const VIEW_TYPES: { type: ViewType; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { type: 'table', label: '表格', icon: Icon.table },
  { type: 'board', label: '看板', icon: Icon.board },
  { type: 'list', label: '清單', icon: Icon.list },
  { type: 'gallery', label: '畫廊', icon: Icon.gallery },
  { type: 'calendar', label: '行事曆', icon: Icon.calendar },
];

export function viewIcon(t: ViewType, size = 14) {
  const V = VIEW_TYPES.find((v) => v.type === t)!.icon;
  return <V size={size} />;
}

export function DatabaseView({ dbId, inline }: { dbId: string; inline?: boolean }) {
  const db = useStore((s) => s.dbs[dbId]);
  const pages = useStore((s) => s.pages);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pop, setPop] = useState<null | { kind: 'filter' | 'sort' | 'settings' | 'addView' | 'viewMenu' | 'newMenu'; anchor: HTMLElement; viewId?: string }>(null);

  const allRows = useMemo(() => Object.values(pages).filter((p) => p.rowOf === dbId && !p.trashed), [pages, dbId]);
  const view = db ? db.views.find((v) => v.id === db.activeView) || db.views[0] : undefined;
  const rows = useMemo(() => (db && view ? processRows(allRows, db, view, search) : []), [allRows, db, view, search]);

  if (!db || !view) return <div className="db-missing">找不到資料庫</div>;
  if (inline && isTrashed(db.hostPageId)) return null;

  const newRow = (extra: Record<string, any> = {}, open = true) => {
    const id = addRow(db.id, { ...defaultsFromFilters(db, view), ...extra });
    if (open) openPeek(id);
    return id;
  };

  return (
    <div className={'db' + (inline ? ' inline' : ' full')} contentEditable={false} suppressContentEditableWarning>
      {inline && (
        <div className="db-title-row">
          <input className="db-title" value={db.title} placeholder="未命名資料庫"
            onChange={(e) => updateDb(db.id, (d) => { d.title = e.target.value; }, 'typing')} />
        </div>
      )}
      <div className="db-bar">
        <div className="db-tabs">
          {db.views.map((v) => (
            <div key={v.id} className={'db-tab' + (v.id === view.id ? ' active' : '')}
              onClick={(e) => {
                if (v.id === view.id) setPop({ kind: 'viewMenu', anchor: e.currentTarget as HTMLElement, viewId: v.id });
                else updateDb(db.id, (d) => { d.activeView = v.id; }, 'silent');
              }}
              onContextMenu={(e) => { e.preventDefault(); setPop({ kind: 'viewMenu', anchor: e.currentTarget as HTMLElement, viewId: v.id }); }}>
              {viewIcon(v.type)}<span>{v.name}</span>
            </div>
          ))}
          <button className="btn-icon" title="新增檢視" onClick={(e) => setPop({ kind: 'addView', anchor: e.currentTarget })}><Icon.plus size={14} /></button>
        </div>
        <div className="db-tools">
          <button className={'btn-ghost sm' + (view.filters.length ? ' accent' : '')} onClick={(e) => setPop({ kind: 'filter', anchor: e.currentTarget })}><Icon.filter size={14} /><span className="hide-sm">篩選</span></button>
          <button className={'btn-ghost sm' + (view.sorts.length ? ' accent' : '')} onClick={(e) => setPop({ kind: 'sort', anchor: e.currentTarget })}><Icon.sort size={14} /><span className="hide-sm">排序</span></button>
          {searchOpen ? (
            <input className="db-search" autoFocus placeholder="輸入以搜尋…" value={search} onChange={(e) => setSearch(e.target.value)}
              onBlur={() => !search && setSearchOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }} />
          ) : (
            <button className="btn-icon" title="搜尋" onClick={() => setSearchOpen(true)}><Icon.search size={14} /></button>
          )}
          <button className="btn-icon" title="檢視設定" onClick={(e) => setPop({ kind: 'settings', anchor: e.currentTarget })}><Icon.more size={16} /></button>
          <div className="btn-split">
            <button className="btn-primary sm" onClick={() => newRow()}>新增</button>
            <button className="btn-primary sm split" onClick={(e) => setPop({ kind: 'newMenu', anchor: e.currentTarget })}><Icon.chevronDown size={12} /></button>
          </div>
        </div>
      </div>

      {(view.filters.length > 0 || view.sorts.length > 0) && (
        <FilterChips db={db} view={view} onOpen={(kind, anchor) => setPop({ kind, anchor })} />
      )}

      <div className="db-body">
        {view.type === 'table' && <TableView db={db} view={view} rows={rows} newRow={newRow} />}
        {view.type === 'board' && <BoardView db={db} view={view} rows={rows} newRow={newRow} />}
        {view.type === 'list' && <ListView db={db} view={view} rows={rows} newRow={newRow} />}
        {view.type === 'gallery' && <GalleryView db={db} view={view} rows={rows} newRow={newRow} />}
        {view.type === 'calendar' && <CalendarView db={db} view={view} rows={rows} newRow={newRow} />}
      </div>

      {pop?.kind === 'filter' && <FilterPopover db={db} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'sort' && <SortPopover db={db} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'settings' && <ViewSettings db={db} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'addView' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={220}>
          <MenuHeader>新增檢視</MenuHeader>
          {VIEW_TYPES.map((t) => (
            <MenuItem key={t.type} icon={<t.icon size={16} />} label={t.label} onClick={() => {
              const v = makeView(t.type, db);
              updateDb(db.id, (d) => { d.views.push(v); d.activeView = v.id; });
              setPop(null);
            }} />
          ))}
        </Popover>
      )}
      {pop?.kind === 'viewMenu' && pop.viewId && (
        <ViewMenu db={db} viewId={pop.viewId} anchor={pop.anchor} onClose={() => setPop(null)} />
      )}
      {pop?.kind === 'newMenu' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={220} align="right">
          <MenuItem icon={<Icon.page />} label="新增空白頁面" onClick={() => { newRow(); setPop(null); }} />
          <MenuItem icon={<Icon.plus />} label="在表格新增一列（不開啟）" onClick={() => { newRow({}, false); setPop(null); }} />
        </Popover>
      )}
    </div>
  );
}

function FilterChips({ db, view, onOpen }: { db: Database; view: View; onOpen: (k: 'filter' | 'sort', a: HTMLElement) => void }) {
  return (
    <div className="filter-chips">
      {view.sorts.length > 0 && (
        <button className="fchip" onClick={(e) => onOpen('sort', e.currentTarget)}>
          <Icon.sort size={12} /> {view.sorts.length === 1 ? (db.properties.find((p) => p.id === view.sorts[0].propId)?.name || '') : `${view.sorts.length} 個排序`}
          <Icon.chevronDown size={11} />
        </button>
      )}
      {view.sorts.length > 0 && view.filters.length > 0 && <span className="fchip-sep" />}
      {view.filters.map((f) => {
        const p = db.properties.find((x) => x.id === f.propId);
        if (!p) return null;
        const op = opsFor(p.type).find((o) => o.op === f.op);
        let val = f.value ?? '';
        if ((p.type === 'select' || p.type === 'status' || p.type === 'multi_select') && f.value) val = p.options?.find((o) => o.id === f.value)?.name || '';
        return (
          <button key={f.id} className="fchip" onClick={(e) => onOpen('filter', e.currentTarget)}>
            <PropIcon type={p.type} size={12} /> {p.name}: {op?.label} {op?.noValue ? '' : val}
            <Icon.chevronDown size={11} />
          </button>
        );
      })}
      <button className="fchip ghost" onClick={(e) => onOpen('filter', e.currentTarget)}><Icon.plus size={12} /> 新增篩選</button>
    </div>
  );
}

function FilterPopover({ db, view, anchor, onClose }: { db: Database; view: View; anchor: HTMLElement; onClose: () => void }) {
  const add = () => {
    const p = db.properties[0];
    updateView(db.id, view.id, (v) => { v.filters.push({ id: uid(), propId: p.id, op: opsFor(p.type)[0].op }); });
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={520}>
      <div className="fs-pop">
        {view.filters.length === 0 && <div className="muted small" style={{ padding: '6px 4px' }}>此檢視尚無篩選條件</div>}
        {view.filters.map((f, i) => {
          const p = db.properties.find((x) => x.id === f.propId) || db.properties[0];
          const ops = opsFor(p.type);
          const op = ops.find((o) => o.op === f.op) || ops[0];
          return (
            <div key={f.id} className="fs-row">
              <span className="fs-where">{i === 0 ? '條件' : '且'}</span>
              <select className="select-sm" value={p.id} onChange={(e) => {
                const np = db.properties.find((x) => x.id === e.target.value)!;
                updateView(db.id, view.id, (v) => { const ff = v.filters.find((x) => x.id === f.id)!; ff.propId = np.id; ff.op = opsFor(np.type)[0].op; ff.value = undefined; });
              }}>
                {db.properties.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
              </select>
              <select className="select-sm" value={op.op} onChange={(e) => updateView(db.id, view.id, (v) => { v.filters.find((x) => x.id === f.id)!.op = e.target.value; })}>
                {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
              </select>
              {!op.noValue && (
                (p.type === 'select' || p.type === 'status' || p.type === 'multi_select') ? (
                  <select className="select-sm grow" value={f.value || ''} onChange={(e) => updateView(db.id, view.id, (v) => { v.filters.find((x) => x.id === f.id)!.value = e.target.value; })}>
                    <option value="">選擇選項…</option>
                    {(p.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <input className="input sm grow" type={p.type === 'number' ? 'number' : ['date', 'created_time', 'last_edited_time'].includes(p.type) ? 'date' : 'text'}
                    placeholder="輸入值…" value={f.value ?? ''}
                    onChange={(e) => updateView(db.id, view.id, (v) => { v.filters.find((x) => x.id === f.id)!.value = e.target.value; })} />
                )
              )}
              {op.noValue && <span className="grow" />}
              <button className="btn-icon" onClick={() => updateView(db.id, view.id, (v) => { v.filters = v.filters.filter((x) => x.id !== f.id); })}><Icon.x size={14} /></button>
            </div>
          );
        })}
        <div className="fs-actions">
          <button className="btn-ghost sm" onClick={add}><Icon.plus size={14} /> 新增篩選條件</button>
          {view.filters.length > 0 && <button className="btn-ghost sm danger" onClick={() => updateView(db.id, view.id, (v) => { v.filters = []; })}><Icon.trash size={14} /> 清除全部</button>}
        </div>
      </div>
    </Popover>
  );
}

function SortPopover({ db, view, anchor, onClose }: { db: Database; view: View; anchor: HTMLElement; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={380}>
      <div className="fs-pop">
        {view.sorts.length === 0 && <div className="muted small" style={{ padding: '6px 4px' }}>此檢視尚無排序</div>}
        {view.sorts.map((s, i) => (
          <div key={i} className="fs-row">
            <select className="select-sm grow" value={s.propId} onChange={(e) => updateView(db.id, view.id, (v) => { v.sorts[i].propId = e.target.value; })}>
              {db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="select-sm" value={s.dir} onChange={(e) => updateView(db.id, view.id, (v) => { v.sorts[i].dir = e.target.value as 'asc' | 'desc'; })}>
              <option value="asc">遞增</option><option value="desc">遞減</option>
            </select>
            <button className="btn-icon" onClick={() => updateView(db.id, view.id, (v) => { v.sorts.splice(i, 1); })}><Icon.x size={14} /></button>
          </div>
        ))}
        <div className="fs-actions">
          <button className="btn-ghost sm" onClick={() => updateView(db.id, view.id, (v) => {
            const used = new Set(v.sorts.map((x) => x.propId));
            const p = db.properties.find((x) => !used.has(x.id)) || db.properties[0];
            v.sorts.push({ propId: p.id, dir: 'asc' });
          })}><Icon.plus size={14} /> 新增排序</button>
          {view.sorts.length > 0 && <button className="btn-ghost sm danger" onClick={() => updateView(db.id, view.id, (v) => { v.sorts = []; })}><Icon.trash size={14} /> 刪除排序</button>}
        </div>
      </div>
    </Popover>
  );
}

function ViewMenu({ db, viewId, anchor, onClose }: { db: Database; viewId: string; anchor: HTMLElement; onClose: () => void }) {
  const view = db.views.find((v) => v.id === viewId)!;
  const [name, setName] = useState(view.name);
  const save = () => name.trim() && updateView(db.id, viewId, (v) => { v.name = name.trim(); });
  return (
    <Popover anchor={anchor} onClose={() => { save(); onClose(); }} width={240}>
      <div className="menu-search">
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { save(); onClose(); } }} />
      </div>
      <MenuHeader>版面配置</MenuHeader>
      {VIEW_TYPES.map((t) => (
        <MenuItem key={t.type} icon={<t.icon size={16} />} label={t.label} right={view.type === t.type ? <Icon.check size={14} /> : undefined}
          onClick={() => updateView(db.id, viewId, (v) => {
            v.type = t.type;
            const tmp = makeView(t.type, db);
            if (t.type === 'board' && !v.groupBy) v.groupBy = tmp.groupBy;
            if (t.type === 'calendar' && !v.dateProp) v.dateProp = tmp.dateProp;
            if (t.type === 'gallery' && !v.cardPreview) v.cardPreview = 'content';
          })} />
      ))}
      <MenuSep />
      <MenuItem icon={<Icon.duplicate />} label="複製檢視" onClick={() => {
        const copy = { ...JSON.parse(JSON.stringify(view)), id: uid(), name: view.name + ' (副本)' };
        updateDb(db.id, (d) => { d.views.push(copy); d.activeView = copy.id; });
        onClose();
      }} />
      {db.views.length > 1 && (
        <MenuItem icon={<Icon.trash />} label="刪除檢視" danger onClick={() => {
          updateDb(db.id, (d) => { d.views = d.views.filter((v) => v.id !== viewId); if (d.activeView === viewId) d.activeView = d.views[0].id; });
          onClose();
        }} />
      )}
    </Popover>
  );
}

function ViewSettings({ db, view, anchor, onClose }: { db: Database; view: View; anchor: HTMLElement; onClose: () => void }) {
  const groupable = db.properties.filter((p) => p.type === 'select' || p.type === 'status');
  const dates = db.properties.filter((p) => p.type === 'date' || p.type === 'created_time' || p.type === 'last_edited_time');
  const rowsCount = Object.values(getState().pages).filter((p) => p.rowOf === db.id && !p.trashed).length;
  return (
    <Popover anchor={anchor} onClose={onClose} width={290} align="right">
      <MenuHeader>檢視選項 · {view.name}</MenuHeader>
      <div className="menu-row">
        <span>版面配置</span>
        <select className="select-sm" value={view.type} onChange={(e) => updateView(db.id, view.id, (v) => {
          v.type = e.target.value as ViewType;
          const tmp = makeView(v.type, db);
          if (v.type === 'board' && !v.groupBy) v.groupBy = tmp.groupBy;
          if (v.type === 'calendar' && !v.dateProp) v.dateProp = tmp.dateProp;
        })}>
          {VIEW_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </div>
      {view.type === 'board' && (
        <div className="menu-row">
          <span>分組依據</span>
          <select className="select-sm" value={view.groupBy || ''} onChange={(e) => {
            if (e.target.value === '__new') {
              const p = makeProp('status', '狀態');
              updateDb(db.id, (d) => { d.properties.push(p); const v = d.views.find((x) => x.id === view.id)!; v.groupBy = p.id; });
            } else updateView(db.id, view.id, (v) => { v.groupBy = e.target.value || undefined; });
          }}>
            <option value="">無</option>
            {groupable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new">+ 新增狀態屬性</option>
          </select>
        </div>
      )}
      {view.type === 'calendar' && (
        <div className="menu-row">
          <span>依日期顯示</span>
          <select className="select-sm" value={view.dateProp || ''} onChange={(e) => updateView(db.id, view.id, (v) => { v.dateProp = e.target.value || undefined; })}>
            <option value="">無</option>
            {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      {view.type === 'gallery' && (
        <div className="menu-row">
          <span>卡片預覽</span>
          <select className="select-sm" value={view.cardPreview || 'content'} onChange={(e) => updateView(db.id, view.id, (v) => { v.cardPreview = e.target.value as any; })}>
            <option value="none">無</option><option value="cover">頁面封面</option><option value="content">頁面內容</option>
          </select>
        </div>
      )}
      <MenuSep />
      <MenuHeader>屬性</MenuHeader>
      <div className="menu-list">
        {db.properties.map((p) => (
          <div key={p.id} className="menu-item">
            <span className="menu-icon"><PropIcon type={p.type} /></span>
            <span className="menu-label">{p.name}</span>
            <span className="menu-right">
              {p.type === 'title' ? <span className="muted small">必要</span> : (
                <Toggle on={!view.hidden.includes(p.id)} onChange={(on) => updateView(db.id, view.id, (v) => {
                  v.hidden = on ? v.hidden.filter((x) => x !== p.id) : [...v.hidden, p.id];
                })} />
              )}
            </span>
          </div>
        ))}
      </div>
      <MenuSep />
      <div className="menu-foot">共 {rowsCount} 筆資料 · {db.views.length} 個檢視</div>
    </Popover>
  );
}

export { Chip };
