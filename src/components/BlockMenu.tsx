import React, { useState } from 'react';
import type { Block, BlockType } from '../types';
import { Popover, MenuItem, MenuSep, MenuHeader } from './Popover';
import { Icon } from './Icons';
import { TURN_INTO, TEXT_TYPES } from '../blockTypes';
import { COLORS, COLOR_NAMES, timeAgo } from '../utils';
import { getState } from '../store';
import { pageLink, toast } from '../ui';
import { recentColors } from '../lastStyle';

export function BlockMenu({ block, pageId, anchor, onClose, onDelete, onDuplicate, onTurnInto, onColor }: {
  block: Block; pageId: string; anchor: HTMLElement; onClose: () => void; onDelete: () => void; onDuplicate: () => void;
  onTurnInto: (t: BlockType) => void; onColor: (c: string) => void;
}) {
  const [sub, setSub] = useState<null | { kind: 'turn' | 'color'; anchor: HTMLElement }>(null);
  const [q, setQ] = useState('');
  const canTurn = TEXT_TYPES.includes(block.type);
  const items = [
    { k: 'delete', label: '刪除', icon: <Icon.trash />, right: 'Del', on: onDelete },
    { k: 'dup', label: '複製', icon: <Icon.duplicate />, right: 'Ctrl+D', on: onDuplicate },
  ].filter((i) => !q || i.label.includes(q));
  const page = getState().pages[pageId];
  return (
    <Popover anchor={anchor} onClose={onClose} width={265}>
      <div className="menu-search"><input className="input" placeholder="搜尋動作…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="menu-list">
        {items.map((i) => <MenuItem key={i.k} icon={i.icon} label={i.label} right={i.right} onClick={i.on} onMouseEnter={() => setSub(null)} />)}
        {canTurn && (!q || '轉換成'.includes(q)) && (
          <MenuItem icon={<Icon.undo />} label="轉換成" right={<Icon.chevronRight size={14} />}
            onMouseEnter={(e) => setSub({ kind: 'turn', anchor: e.currentTarget as HTMLElement })} />
        )}
        <MenuItem icon={<Icon.link />} label="複製區塊連結" onMouseEnter={() => setSub(null)}
          onClick={() => { navigator.clipboard?.writeText(pageLink(pageId) + '#' + block.id); toast('已複製連結'); onClose(); }} />
        <MenuSep />
        {(!q || '顏色'.includes(q)) && (
          <MenuItem icon={<span className="color-a">A</span>} label="顏色" right={<Icon.chevronRight size={14} />}
            onMouseEnter={(e) => setSub({ kind: 'color', anchor: e.currentTarget as HTMLElement })} />
        )}
        <MenuSep />
        <div className="menu-foot">
          上次編輯：{page ? timeAgo(page.updatedAt) : ''}
        </div>
      </div>
      {sub?.kind === 'turn' && (
        <Popover anchor={sub.anchor} placement="right" onClose={() => setSub(null)} width={220}>
          <MenuHeader>轉換成</MenuHeader>
          {TURN_INTO.map((t) => (
            <MenuItem key={t.type} icon={<span className="thumb-sm">{t.thumb}</span>} label={t.label}
              right={block.type === t.type ? <Icon.check size={14} /> : undefined} onClick={() => onTurnInto(t.type)} />
          ))}
        </Popover>
      )}
      {sub?.kind === 'color' && (
        <Popover anchor={sub.anchor} placement="right" onClose={() => setSub(null)} width={220}>
          {recentColors().length > 0 && <>
            <MenuHeader>最近使用</MenuHeader>
            {recentColors().map((c) => (
              <MenuItem key={'r' + c} icon={<span className={'color-a ' + (c.endsWith('_bg') ? 'bgbox bg-' + c.slice(0, -3) : 'c-' + c)}>A</span>}
                label={c.endsWith('_bg') ? COLOR_NAMES[c.slice(0, -3)] + '背景' : COLOR_NAMES[c]} onClick={() => onColor(c)} />
            ))}
          </>}
          <MenuHeader>文字顏色</MenuHeader>
          {COLORS.map((c) => (
            <MenuItem key={c} icon={<span className={'color-a c-' + c}>A</span>} label={COLOR_NAMES[c]}
              right={(block.color || 'default') === c ? <Icon.check size={14} /> : undefined} onClick={() => onColor(c)} />
          ))}
          <MenuHeader>背景顏色</MenuHeader>
          {COLORS.map((c) => (
            <MenuItem key={c + 'bg'} icon={<span className={'color-a bgbox bg-' + c}>A</span>} label={COLOR_NAMES[c] + '背景'}
              right={block.color === c + '_bg' ? <Icon.check size={14} /> : undefined} onClick={() => onColor(c === 'default' ? 'default' : c + '_bg')} />
          ))}
        </Popover>
      )}
    </Popover>
  );
}
