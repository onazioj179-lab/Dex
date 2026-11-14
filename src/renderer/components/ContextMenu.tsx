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

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AIM_GRACE_MS, isAimingAtRect, type Pt } from '../utils/safeTriangle';

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
  // ...and opens upward when a downward one would run off the bottom.
  const [subUp, setSubUp] = useState(false);
  const [subFocus, setSubFocus] = useState(-1);
  const subCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safe triangle: while the pointer travels from an open submenu's row toward
  // its flyout across sibling rows, those siblings don't steal the hover.
  const aimApexRef = useRef<Pt | null>(null);
  const pointerRef = useRef<Pt | null>(null);
  const pendingHoverRef = useRef<(() => void) | null>(null);
  const aimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSubRef = useRef<string | null>(null);
  openSubRef.current = openSub;
  useEffect(() => () => {
    if (aimTimerRef.current) clearTimeout(aimTimerRef.current);
    if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
  }, []);

  /** Run a row hover now, or defer it while the pointer is aiming at the open flyout. */
  const hoverRow = useCallback((rowKey: string, apply: () => void) => {
    const run = () => {
      if (aimTimerRef.current) { clearTimeout(aimTimerRef.current); aimTimerRef.current = null; }
      pendingHoverRef.current = null;
      apply();
    };
    const open = openSubRef.current;
    if (open && open !== rowKey && aimApexRef.current && pointerRef.current) {
      const flyout = menuRef.current?.querySelector<HTMLElement>('[data-ctx-flyout]');
      const rect = flyout?.getBoundingClientRect();
      if (rect && isAimingAtRect(aimApexRef.current, pointerRef.current, rect)) {
        pendingHoverRef.current = () => hoverRow(rowKey, apply);
        if (aimTimerRef.current) clearTimeout(aimTimerRef.current);
        aimTimerRef.current = setTimeout(run, AIM_GRACE_MS);
        return;
      }
    }
    run();
  }, []);
  const [adjustedPos, setAdjustedPos] = useState(position);

  // Layout effect: position before the first paint, so the menu never flashes
  // at the unadjusted spot.
  useLayoutEffect(() => {
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

  // Take focus so screen readers announce the menu; give it back on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    menuRef.current?.focus({ preventScroll: true });
    return () => { try { prev?.focus?.({ preventScroll: true }); } catch { /* element gone */ } };
  }, []);

  // The menu belongs to the moment it was opened: close it if the window loses
  // focus or changes size.
  useEffect(() => {
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => { window.removeEventListener('blur', onClose); window.removeEventListener('resize', onClose); };
  }, [onClose]);

  const placeSubmenu = useCallback((row: HTMLElement) => {
    const r = row.getBoundingClientRect();
    setSubDir(r.right + 176 > window.innerWidth ? 'left' : 'right');
    setSubUp(r.top + 320 > window.innerHeight - 8);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // Use mousedown for instant close — no click-delay
    document.addEventListener('mousedown', handleClick);
    const handleKey = (e: KeyboardEvent) => {
      const actionItems = items.filter(i => !i.divider || i.label);
      const cur = actionItems[focusIdx];
      const sub = cur && openSub !== null && cur.submenu?.length ? cur.submenu : null;
      const step = (list: ContextMenuItem[], from: number, dir: 1 | -1) => {
        let next = from;
        for (let n = 0; n < list.length; n++) {
          next = (next + dir + list.length) % list.length;
          if (!list[next].disabled) return next;
        }
        return from;
      };
      const activate = (item: ContextMenuItem | undefined) => {
        if (!item || item.disabled) return;
        (item.onClick ?? item.onSelect)?.();
        onClose();
      };
      const openFocusedSub = () => {
        const row = menuRef.current?.querySelector<HTMLElement>(`[data-ctx-index="${focusIdx}"]`);
        if (row) placeSubmenu(row);
        setOpenSub(row?.dataset.ctxKey ?? null);
        setSubFocus(cur?.submenu ? step(cur.submenu, -1, 1) : -1);
      };
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          if (sub) { setOpenSub(null); setSubFocus(-1); } else onClose();
          return;
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          if (sub) setSubFocus(i => step(sub, i < 0 && dir === -1 ? 0 : i, dir));
          else { setOpenSub(null); setFocusIdx(i => step(actionItems, i < 0 && dir === -1 ? 0 : i, dir)); }
          return;
        }
        case 'Home':
        case 'End':
          e.preventDefault();
          if (!sub) setFocusIdx(e.key === 'Home' ? step(actionItems, -1, 1) : step(actionItems, actionItems.length, -1));
          return;
        case 'ArrowRight':
          if (!sub && cur?.submenu?.length) { e.preventDefault(); openFocusedSub(); }
          return;
        case 'ArrowLeft':
          if (sub) { e.preventDefault(); setOpenSub(null); setSubFocus(-1); }
          return;
        case 'Enter':
        case ' ':
          if (focusIdx < 0) return;
          e.preventDefault();
          if (sub) activate(sub[subFocus]);
          else if (cur?.submenu?.length) openFocusedSub();
          else activate(cur);
          return;
        default:
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, items, focusIdx, openSub, subFocus, placeSubmenu]);

  let actionIdx = -1;

  // Render through a portal so the menu escapes any parent transform/filter
  // (which would otherwise clip a position:fixed element to its parent).
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      tabIndex={-1}
      className="dex-liquid-glass"
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
        borderRadius: 14,
        boxShadow: 'var(--pg-shadow-popover), 0 0 0 0.5px var(--color-border-subtle), var(--pg-gloss-top)',
        outline: 'none',
        animation: 'ctxFadeIn 0.16s var(--ease-tahoe, cubic-bezier(0.23, 1, 0.32, 1))',
      } as React.CSSProperties}
      onMouseMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
        pendingHoverRef.current?.();
      }}
      onMouseLeave={() => {
        // Pointer left the whole menu (the flyout is inside it): close the submenu shortly.
        if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
        subCloseTimerRef.current = setTimeout(() => setOpenSub(null), 120);
      }}
    >
      <style>{`@keyframes ctxFadeIn { from { opacity:0; transform:scale(0.96) translateY(-2px); } to { opacity:1; transform:scale(1) translateY(0); } }
.dex-ctx-item { background: transparent; transition: background 100ms var(--ease-out, ease-out), color 100ms var(--ease-out, ease-out); }
.dex-ctx-item:hover:not([aria-disabled="true"]), .dex-ctx-item[data-focused="true"]:not([aria-disabled="true"]) { background: var(--color-bg-hover); }
.dex-ctx-item:active:not([aria-disabled="true"]) { background: var(--color-bg-active); }
.dex-ctx-sub { background: transparent; transition: background 100ms var(--ease-out, ease-out), color 100ms var(--ease-out, ease-out); }
.dex-ctx-sub:hover:not([aria-disabled="true"]) { background: var(--color-bg-hover); }`}</style>
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
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? openSub === itemKey : undefined}
              data-focused={isFocused}
              data-ctx-index={curActionIdx}
              data-ctx-key={itemKey}
              tabIndex={-1}
              onMouseEnter={(e) => {
                const row = e.currentTarget as HTMLElement;
                if (subCloseTimerRef.current) { clearTimeout(subCloseTimerRef.current); subCloseTimerRef.current = null; }
                hoverRow(itemKey, () => {
                  setFocusIdx(curActionIdx);
                  if (hasSub) {
                    // Flip the submenu to the left if a rightward one would clip.
                    placeSubmenu(row);
                    setSubFocus(-1);
                    if (openSubRef.current !== itemKey) aimApexRef.current = pointerRef.current;
                    setOpenSub(itemKey);
                  } else {
                    setOpenSub(null);
                  }
                });
              }}
              onMouseMove={(e) => {
                // Keep the triangle's apex at the last point on the open row
                // (not while the pointer is inside the flyout, a descendant).
                if (hasSub && openSubRef.current === itemKey && !(e.target as HTMLElement).closest('[data-ctx-flyout]')) {
                  aimApexRef.current = { x: e.clientX, y: e.clientY };
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
                <div role="menu" aria-label={item.label} data-ctx-flyout="" style={{
                  position: 'absolute',
                  top: subUp ? undefined : -4,
                  bottom: subUp ? -4 : undefined,
                  left: subDir === 'right' ? '100%' : undefined,
                  right: subDir === 'left' ? '100%' : undefined,
                  minWidth: 160, maxWidth: 'min(220px, calc(100vw - 16px))', maxHeight: 320, overflowY: 'auto',
                  padding: '5px 0', borderRadius: 14,
                  // Liquid glass, matching the parent .dex-liquid-glass menu so a
                  // submenu reads as the same material rather than a solid slab.
                  background: 'var(--color-bg-glass-strong, rgba(16,16,20,0.86))',
                  backdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
                  WebkitBackdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--pg-shadow-popover), 0 0 0 0.5px var(--color-border-subtle), var(--pg-gloss-top)',
                }}>
                  {item.submenu!.map((sub, si) => (
                    <div
                      key={sub.id ?? ('sub-' + si)}
                      role="menuitem"
                      aria-disabled={sub.disabled}
                      onClick={(e) => { e.stopPropagation(); if (!sub.disabled) { (sub.onClick ?? sub.onSelect)?.(); onClose(); } }}
                      style={{
                        background: si === subFocus && !sub.disabled ? 'var(--color-accent-light)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        padding: '6px var(--space-3)', margin: '0 4px', borderRadius: 4,
                        fontSize: 13, fontWeight: 500, cursor: sub.disabled ? 'default' : 'pointer',
                        color: sub.danger ? 'var(--color-error, #ff453a)' : sub.disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary, #fff)',
                      }}
                      onMouseEnter={() => setSubFocus(si)}
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