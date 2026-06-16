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
import { createPortal } from 'react-dom';

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
  // Submenu opens rightward by default, but flips left when the parent item is
  // close to the right screen edge so the submenu never overflows off-screen.
  const [subDir, setSubDir] = useState<'right' | 'left'>('right');
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
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, items, focusIdx]);

  let actionIdx = -1;

  // Render through a portal so the menu escapes any parent transform/filter
  // (which would otherwise clip a position:fixed element to its parent).
  return createPortal(
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
        maxWidth: 'min(280px, calc(100vw - 16px))',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        padding: '5px 0',
        borderRadius: 10,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--pg-shadow-popover), 0 0 0 0.5px var(--color-border-subtle), var(--pg-gloss-top)',
        animation: 'ctxFadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
      } as React.CSSProperties}
    >
      <style>{`@keyframes ctxFadeIn { from { opacity:0; transform:scale(0.96) translateY(-2px); } to { opacity:1; transform:scale(1) translateY(0); } }
.dex-ctx-item { background: transparent; transition: all 0.1s ease; }
.dex-ctx-item:hover:not([aria-disabled="true"]) { background: var(--color-accent-light); }
.dex-ctx-item:active:not([aria-disabled="true"]) { background: var(--color-accent-muted, var(--color-accent-light)); }
.dex-ctx-sub { background: transparent; transition: all 0.1s ease; }
.dex-ctx-sub:hover:not([aria-disabled="true"]) { background: var(--color-accent-light); }`}</style>
      {items.map((item, i) => {
        if (item.divider && !item.label) {
          return <div key={item.id ?? ('div-' + i)} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px var(--space-2)' }} />;
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
              onMouseEnter={(e) => {
                setFocusIdx(curActionIdx);
                if (hasSub) {
                  if (subCloseTimerRef.current) { clearTimeout(subCloseTimerRef.current); subCloseTimerRef.current = null; }
                  // Flip the submenu to the left if a rightward one would clip.
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setSubDir(r.right + 176 > window.innerWidth ? 'left' : 'right');
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
                gap: 'var(--space-2)',
                padding: '6px var(--space-3)',
                margin: '0 4px',
                borderRadius: 4,
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
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: '"SF Mono", monospace', marginLeft: 'var(--space-3)', flexShrink: 0 }}>
                  {item.shortcut}
                </span>
              )}
              {hasSub && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{String.fromCharCode(9656)}</span>
              )}
              {hasSub && openSub === itemKey && (
                <div style={{
                  position: 'absolute', top: -4,
                  left: subDir === 'right' ? '100%' : undefined,
                  right: subDir === 'left' ? '100%' : undefined,
                  minWidth: 160, maxWidth: 'min(220px, calc(100vw - 16px))', maxHeight: 320, overflowY: 'auto',
                  padding: '5px 0', borderRadius: 8,
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--pg-shadow-panel)',
                }}>
                  {item.submenu!.map((sub, si) => (
                    <div
                      key={sub.id ?? ('sub-' + si)}
                      role="menuitem"
                      onClick={() => { if (!sub.disabled) { (sub.onClick ?? sub.onSelect)?.(); onClose(); } }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        padding: '6px var(--space-3)', margin: '0 4px', borderRadius: 4,
                        fontSize: 13, fontWeight: 500, cursor: sub.disabled ? 'default' : 'pointer',
                        color: sub.danger ? 'var(--color-error, #ff453a)' : sub.disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary, #fff)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-light)')}
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
            {item.dividerAfter && <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px var(--space-2)' }} />}
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
};

export default ContextMenu;