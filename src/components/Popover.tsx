import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type Anchor = DOMRect | { x: number; y: number; width?: number; height?: number } | HTMLElement | null;

function rectOf(a: Anchor): { left: number; top: number; bottom: number; width: number } {
  if (!a) return { left: 0, top: 0, bottom: 0, width: 0 };
  if (a instanceof HTMLElement) {
    const r = a.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
  }
  if ('left' in a) return { left: a.left, top: a.top, bottom: a.bottom, width: a.width };
  return { left: a.x, top: a.y, bottom: a.y + (a.height || 0), width: a.width || 0 };
}

interface Props {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  placement?: 'bottom' | 'top' | 'right';
  className?: string;
  align?: 'left' | 'right';
  noAutoClose?: boolean;
}

export function Popover({ anchor, onClose, children, width, placement = 'bottom', className, align = 'left', noAutoClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = rectOf(anchor);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === 'right' ? r.left + r.width - w : r.left;
    let top = placement === 'top' ? r.top - h - 6 : r.bottom + 4;
    if (placement === 'right') { left = r.left + r.width + 4; top = r.top; }
    if (top + h > window.innerHeight - 8) top = Math.max(8, (placement === 'right' ? window.innerHeight - h - 8 : r.top - h - 4));
    if (top < 8) top = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    setPos({ left, top });
  }, [anchor, align, placement]);

  useEffect(() => {
    if (noAutoClose) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t)) {
        // nested popovers are separate portals; don't close parent if click is in another popover stacked above
        const pops = Array.from(document.querySelectorAll('.popover'));
        const idx = pops.indexOf(ref.current);
        const inLater = pops.slice(idx + 1).some((p) => p.contains(t));
        if (!inLater) closeRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const pops = Array.from(document.querySelectorAll('.popover'));
        if (pops[pops.length - 1] === ref.current) { e.stopPropagation(); closeRef.current(); }
      }
    };
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [noAutoClose]);

  return createPortal(
    <div ref={ref} className={'popover ' + (className || '')}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width, opacity: pos ? 1 : 0 }}
      onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, label, onClick, right, danger, active, onMouseEnter, className }: {
  icon?: React.ReactNode; label: React.ReactNode; onClick?: (e: React.MouseEvent) => void; right?: React.ReactNode;
  danger?: boolean; active?: boolean; onMouseEnter?: (e: React.MouseEvent) => void; className?: string;
}) {
  return (
    <div className={'menu-item' + (danger ? ' danger' : '') + (active ? ' active' : '') + (className ? ' ' + className : '')}
      onClick={onClick} onMouseEnter={onMouseEnter} role="menuitem">
      {icon !== undefined && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{label}</span>
      {right !== undefined && <span className="menu-right">{right}</span>}
    </div>
  );
}

export function MenuSep() { return <div className="menu-sep" />; }
export function MenuHeader({ children }: { children: React.ReactNode }) { return <div className="menu-header">{children}</div>; }

export function Toggle({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return <span className={'toggle-switch' + (on ? ' on' : '')} onClick={(e) => { e.stopPropagation(); onChange?.(!on); }}><span /></span>;
}

export function Modal({ onClose, children, className, width }: { onClose: () => void; children: React.ReactNode; className?: string; width?: number | string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.popover')) { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal ' + (className || '')} style={{ width }}>{children}</div>
    </div>,
    document.body,
  );
}
