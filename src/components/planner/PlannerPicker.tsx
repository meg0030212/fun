import React, { useMemo, useState } from 'react';
import type { PlannerPeriod, PlannerTemplate } from '../../types';
import { setBlocks, useStore } from '../../store';
import { askConfirm, navigate, setUI, toast, useUI } from '../../ui';
import { applyTemplate, blankTemplate, builtinTemplates, createPlannerPage, deleteTemplate, PERIOD_NAMES, WIDGET_INFO } from '../../planner';
import { Modal } from '../Popover';
import { Icon } from '../Icons';

export type PlannerPick =
  | { mode: 'new'; parentId: string | null; replaceBlock?: { pageId: string; blockId: string } }
  | { mode: 'apply'; pageId: string };

function LayoutPreview({ t }: { t: PlannerTemplate }) {
  if (!t.widgets.length) return <div className="pl-preview empty">從空白開始，之後按「編輯版面 → 新增區塊」自由組合。</div>;
  return (
    <div className={`pl-preview paper-${t.style.paper}`}>
      {t.widgets.map((w) => (
        <div key={w.id} className="pl-preview-box" style={{ gridColumn: `span ${w.w}`, gridRow: `span ${w.h}`, borderTopColor: `var(--c-${w.color || t.style.accent})` }}>
          <span>{WIDGET_INFO[w.type].icon}</span> {w.title}
        </div>
      ))}
    </div>
  );
}

export function PlannerPickerHost() {
  const req = useUI((u) => u.plannerPick) as PlannerPick | null;
  if (!req) return null;
  return <PlannerPicker req={req} />;
}

function PlannerPicker({ req }: { req: PlannerPick }) {
  const custom = useStore((s) => s.plannerTemplates) || [];
  const builtins = useMemo(builtinTemplates, []);
  const [blankPeriod, setBlankPeriod] = useState<PlannerPeriod>('month');
  const blank = blankTemplate(blankPeriod);
  const all = [...custom, ...builtins, blank];
  const [selId, setSelId] = useState<string>(custom[0]?.id || builtins[0].id);
  const sel = all.find((t) => t.id === selId) || (selId.startsWith('blank') ? blank : builtins[0]);
  const close = () => setUI({ plannerPick: null });

  const use = async () => {
    if (req.mode === 'apply') {
      if (!(await askConfirm('套用新模板會更換版面。原本區塊寫的內容會被隱藏（不會刪除，切回原本的版面不會恢復）。確定嗎？', '套用模板'))) return;
      applyTemplate(req.pageId, sel);
      toast(`已套用「${sel.name}」`);
      close();
      return;
    }
    const parent = req.replaceBlock?.pageId ?? req.parentId;
    const id = createPlannerPage(sel, parent, !req.replaceBlock);
    if (req.replaceBlock) {
      const { pageId, blockId } = req.replaceBlock;
      setBlocks(pageId, (bs) => { const b = bs.find((x) => x.id === blockId); if (b) { b.type = 'page'; b.pageId = id; b.html = ''; } });
    }
    close();
    navigate(id);
  };

  const Item = ({ t }: { t: PlannerTemplate }) => (
    <div className={'sb-item' + (sel.id === t.id ? ' active' : '')} onClick={() => setSelId(t.id)}>
      <span className="sb-icon">{t.icon}</span>
      <span className="sb-label">{t.name}</span>
      {!t.builtin && (
        <button className="btn-icon xs" title="刪除模板" onClick={async (e) => {
          e.stopPropagation();
          if (await askConfirm(`刪除模板「${t.name}」？已用此模板建立的手帳不受影響。`, '刪除')) { deleteTemplate(t.id); setSelId(builtins[0].id); }
        }}><Icon.trash size={13} /></button>
      )}
    </div>
  );

  return (
    <Modal onClose={close} width={860} className="templates-modal planner-picker">
      <div className="templates">
        <div className="tpl-list">
          <div className="strong" style={{ padding: '4px 8px 10px' }}>{req.mode === 'apply' ? '改用其他模板' : '新增電子手帳'}</div>
          {custom.length > 0 && <div className="menu-header">我的模板</div>}
          {custom.map((t) => <Item key={t.id} t={t} />)}
          <div className="menu-header">內建模板</div>
          {builtins.map((t) => <Item key={t.id} t={t} />)}
          <div className="menu-header">自己組合</div>
          <Item t={blank} />
          {custom.length === 0 && <div className="muted small" style={{ padding: '10px 8px' }}>做好喜歡的版面後，在手帳右上角「模板 → 把這個版面存成我的模板」，就會出現在這裡。</div>}
        </div>
        <div className="tpl-preview pl-tpl-preview">
          <div className="pl-tpl-head">
            <span style={{ fontSize: 34 }}>{sel.icon}</span>
            <div>
              <h2>{sel.name}</h2>
              <div className="muted small">{PERIOD_NAMES[sel.period]}一頁 · {sel.widgets.length} 個區塊</div>
            </div>
          </div>
          {sel.desc && <p className="muted">{sel.desc}</p>}
          {sel.id.startsWith('blank') && (
            <div className="seg pl-seg" style={{ marginBottom: 12 }}>
              {(['month', 'week', 'day'] as PlannerPeriod[]).map((p) => (
                <button key={p} className={blankPeriod === p ? 'on' : ''} onClick={() => setBlankPeriod(p)}>每頁一{p === 'month' ? '個月' : p === 'week' ? '週' : '天'}</button>
              ))}
            </div>
          )}
          <LayoutPreview t={sel} />
          <div className="pl-tpl-actions">
            <button className="btn-outline" onClick={close}>取消</button>
            <button className="btn-primary" onClick={() => void use()}>{req.mode === 'apply' ? '套用這個模板' : '使用這個模板'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
