// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Enhanced Context Menu
 * Spring-animated context menu with sliding selection highlight,
 * frosted glass backdrop, and edge-aware repositioning.
 */

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  onClick?: () => void;
}

interface EnhancedContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const MENU_MIN_WIDTH = 180;
const ITEM_HEIGHT = 32;
const PADDING = 4;
const EDGE_MARGIN = 16;

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const EnhancedContextMenu: React.FC<EnhancedContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [submenuItem, setSubmenuItem] = useState<{ index: number; items: ContextMenuItem[] } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Edge-aware positioning — useLayoutEffect fires before paint so no position flash
  const [finalPos, setFinalPos] = useState({ x, y });
  useLayoutEffect(() => {
    const menuW = MENU_MIN_WIDTH + PADDING * 2;
    const nonSep = items.filter(i => !i.separator);
    const sepCount = items.filter(i => i.separator).length;
    const menuH = nonSep.length * ITEM_HEIGHT + sepCount * 9 + PADDING * 2;
    let fx = x;
    let fy = y;
    if (fx + menuW > window.innerWidth - EDGE_MARGIN) fx = window.innerWidth - menuW - EDGE_MARGIN;
    if (fy + menuH > window.innerHeight - EDGE_MARGIN) fy = window.innerHeight - menuH - EDGE_MARGIN;
    if (fx < EDGE_MARGIN) fx = EDGE_MARGIN;
    if (fy < EDGE_MARGIN) fy = EDGE_MARGIN;
    setFinalPos({ x: fx, y: fy });
  }, [x, y, items]);

  // Close on click outside or escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    // Delay click listener so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  // Compute selection indicator Y position
  const selectionY = (() => {
    if (hoveredIndex < 0) return -100;
    let y = PADDING;
    for (let i = 0; i < hoveredIndex && i < items.length; i++) {
      y += items[i].separator ? 9 : ITEM_HEIGHT;
    }
    return y;
  })();

  return (
    <>
      {/* Backdrop to catch clicks */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-context-menu)' }} onMouseDown={onClose} />

      <div
        ref={menuRef}
        role="menu"
        aria-label="Context menu"
        style={{
          position: 'fixed',
          left: finalPos.x,
          top: finalPos.y,
          minWidth: MENU_MIN_WIDTH,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          zIndex: 'var(--z-context-menu)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 10,
          padding: PADDING,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 0.5px 0 var(--color-bg-hover)',
          animation: isReduceMotion() ? 'none' : 'contextMenuIn 0.12s ease-out',
          transformOrigin: `${x - finalPos.x}px ${y - finalPos.y}px`,
        }}
      >
        {/* Sliding selection indicator */}
        {hoveredIndex >= 0 && !items[hoveredIndex]?.separator && (
          <div style={{
            position: 'absolute',
            left: PADDING,
            right: PADDING,
            top: selectionY,
            height: ITEM_HEIGHT,
            background: 'var(--color-accent)',
            opacity: 0.12,
            borderRadius: 6,
            transition: isReduceMotion() ? 'none' : 'top 0.08s ease-out',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        )}

        {items.map((item, i) => {
          if (item.separator) {
            return <div key={`sep-${i}`} role="separator" style={{ height: 1, margin: '4px 8px', background: 'var(--color-bg-hover)' }} />;
          }

          const isHovered = hoveredIndex === i;

          return (
            <div
              key={i}
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              tabIndex={item.disabled ? -1 : 0}
              onMouseEnter={() => {
                setHoveredIndex(i);
                if (item.submenu) {
                  setSubmenuItem({ index: i, items: item.submenu });
                } else {
                  setSubmenuItem(null);
                }
              }}
              onClick={() => {
                if (item.disabled || item.submenu) return;
                item.onClick?.();
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!item.disabled && !item.submenu) {
                    item.onClick?.();
                    onClose();
                  }
                }
              }}
              style={{
                height: ITEM_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 14px',
                borderRadius: 6,
                cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.4 : 1,
                position: 'relative',
                zIndex: 1,
                fontSize: 13,
                fontWeight: 400,
                color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
              }}
            >
              {item.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, width: 16 }}>{item.icon}</span>}
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>{item.shortcut}</span>
              )}
              {item.submenu && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><polyline points="2,1 6,4 2,7"/></svg>
              )}
            </div>
          );
        })}

        {/* Submenu */}
        {submenuItem && (
          <EnhancedContextMenu
            x={finalPos.x + MENU_MIN_WIDTH + PADDING}
            y={finalPos.y + submenuItem.index * ITEM_HEIGHT}
            items={submenuItem.items}
            onClose={onClose}
          />
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// HOOK: useEnhancedContextMenu
// ---------------------------------------------------------------------------

export function useEnhancedContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const show = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setState({ x, y, items });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  return { state, show, close };
}

// ---------------------------------------------------------------------------
// COPY CONFIRMATION
// ---------------------------------------------------------------------------

export const CopyConfirmation: React.FC<{ x: number; y: number; visible: boolean }> = ({ x, y, visible }) => {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed',
      left: x - 10,
      top: y - 10,
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: 'rgba(48,209,88,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 'var(--z-context-menu)',
      animation: isReduceMotion() ? 'none' : 'copyConfirm 0.7s ease-out forwards',
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#30d158" strokeWidth="2">
        <polyline points="2,6 5,9 10,3"/>
      </svg>
    </div>
  );
};
