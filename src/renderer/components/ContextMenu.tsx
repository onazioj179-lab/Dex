// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ContextMenu - Shared right-click context menu component for DEX.
 * Supports icons, shortcut hints, dividers, disabled items, danger styling, submenus.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  id?: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  dividerAfter?: boolean;
  submenu?: ContextMenuItem[];
  onClick?: () => void;
  onSelect?: () => void;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: ContextMenuPosition;
  onClose: () => void;
}

export function useContextMenu() {
  const [menuState, setMenuState] = useState<{ items: ContextMenuItem[]; position: ContextMenuPosition } | null>(null);

  const show = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ items, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const close = useCallback(() => setMenuState(null), []);

  return { menuState, show, close };
}

const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const subCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setAdjustedPos({ x, y });
  }, [position]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // Use mousedown for instant close — no click-delay
    document.addEventListener('mousedown', handleClick);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const actionItems = items.filter(i => !i.divider || i.label);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx(prev => {
          let next = prev + 1;
          while (next < actionItems.length && actionItems[next].disabled) next++;
          return next < actionItems.length ? next : prev;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx(prev => {
          let next = prev - 1;
          while (next >= 0 && actionItems[next].disabled) next--;
          return next >= 0 ? next : prev;
        });
      } else if (e.key === 'Enter' && focusIdx >= 0) {
        e.preventDefault();
        const item = actionItems[focusIdx];
        if (item && !item.disabled) {
          (item.onClick ?? item.onSelect)?.();
          onClose();
        }
      }
    };
    // Use mousedown for instant close — no click-delay
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, items, focusIdx]);

  let actionIdx = -1;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 'var(--z-context-menu)' as any,
        minWidth: 180,
        maxWidth: 280,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        padding: '5px 0',
        borderRadius: 12,
        background: 'rgba(28,28,32,0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.06), inset 0 0.5px 0 rgba(255,255,255,0.08)',
        animation: 'ctxFadeIn 0.15s cubic-bezier(0.23, 1, 0.32, 1)',
      } as React.CSSProperties}
    >
      <style>{`@keyframes ctxFadeIn { from { opacity:0; transform:scale(0.96) translateY(-2px); } to { opacity:1; transform:scale(1) translateY(0); } }
.dex-ctx-item { background: transparent; transition: all 0.1s ease; }
.dex-ctx-item:hover:not([aria-disabled="true"]) { background: rgba(10,132,255,0.18); }
.dex-ctx-item:active:not([aria-disabled="true"]) { background: rgba(10,132,255,0.25); }
.dex-ctx-sub { background: transparent; transition: all 0.1s ease; }
.dex-ctx-sub:hover:not([aria-disabled="true"]) { background: rgba(10,132,255,0.18); }`}</style>
      {items.map((item, i) => {
        if (item.divider && !item.label) {
          return <div key={item.id ?? ('div-' + i)} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 8px' }} />;
        }

        const curActionIdx = ++actionIdx;
        const isFocused = curActionIdx === focusIdx;
        const hasSub = item.submenu && item.submenu.length > 0;
        const itemKey = item.id ?? ('item-' + i);

        return (
          <React.Fragment key={itemKey}>
            <div
              role="menuitem"
              aria-disabled={item.disabled}
              tabIndex={-1}
              onMouseEnter={() => {
                setFocusIdx(curActionIdx);
                if (hasSub) {
                  if (subCloseTimerRef.current) { clearTimeout(subCloseTimerRef.current); subCloseTimerRef.current = null; }
                  setOpenSub(itemKey);
                }
              }}
              onMouseLeave={() => {
                if (hasSub) {
                  subCloseTimerRef.current = setTimeout(() => setOpenSub(null), 120);
                }
              }}
              onClick={() => {
                if (item.disabled) return;
                if (hasSub) return;
                (item.onClick ?? item.onSelect)?.();
                onClose();
              }}
              className="dex-ctx-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                margin: '0 4px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: item.disabled ? 'default' : 'pointer',
                color: item.danger ? 'var(--color-error, #ff453a)' : item.disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary, #fff)',
                transition: 'background 0.08s ease',
                position: 'relative',
              }}
            >
              {item.icon && (
                <span style={{ display: 'flex', alignItems: 'center', width: 16, justifyContent: 'center', opacity: 0.7, flexShrink: 0 }}>
                  {item.icon}
                </span>
              )}
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: '"SF Mono", monospace', marginLeft: 12, flexShrink: 0 }}>
                  {item.shortcut}
                </span>
              )}
              {hasSub && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{String.fromCharCode(9656)}</span>
              )}
              {hasSub && openSub === itemKey && (
                <div style={{
                  position: 'absolute', left: '100%', top: -4,
                  minWidth: 160, maxHeight: 320, overflowY: 'auto',
                  padding: '5px 0', borderRadius: 10,
                  background: 'rgba(30,30,34,0.98)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                }}>
                  {item.submenu!.map((sub, si) => (
                    <div
                      key={sub.id ?? ('sub-' + si)}
                      role="menuitem"
                      onClick={() => { if (!sub.disabled) { (sub.onClick ?? sub.onSelect)?.(); onClose(); } }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px', margin: '0 4px', borderRadius: 6,
                        fontSize: 13, fontWeight: 500, cursor: sub.disabled ? 'default' : 'pointer',
                        color: sub.danger ? 'var(--color-error, #ff453a)' : sub.disabled ? 'var(--color-text-tertiary)' : '#fff',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(10,132,255,0.2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {sub.icon && <span style={{ display: 'flex', width: 16, justifyContent: 'center', opacity: 0.7 }}>{sub.icon}</span>}
                      <span style={{ flex: 1 }}>{sub.label}</span>
                      {sub.shortcut && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{sub.shortcut}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {item.dividerAfter && <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 8px' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ContextMenu;