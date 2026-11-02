// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CreativeMenuBar -- a standardized desktop-style menu bar for the DEX creative
 * suite (Flux, Forge, Vinx, Prism, AXL). Provides a horizontal row of menus
 * (File, Edit, View, ...) where each opens a dropdown that supports:
 *   - icons, keyboard-shortcut hints, checkmarks, danger styling
 *   - separators
 *   - arbitrarily nested submenus (flyouts) with edge-aware flipping
 *
 * The creative suite is deliberately no-glass, so this uses solid surface
 * tokens. Dropdowns render through a portal so they escape app-content clipping.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CreativeMenuItem {
  id?: string;
  label?: string;
  icon?: React.ReactNode;
  /** Right-aligned shortcut hint, e.g. "Ctrl+S". */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Renders a leading checkmark slot when true/false; omit for no slot. */
  checked?: boolean;
  /** Render a horizontal divider instead of an item. */
  separator?: boolean;
  /** Nested submenu items. */
  submenu?: CreativeMenuItem[];
  onSelect?: () => void;
}

export interface CreativeMenu {
  id: string;
  label: string;
  items: CreativeMenuItem[];
  disabled?: boolean;
}

export interface CreativeMenuBarProps {
  menus: CreativeMenu[];
  /** App accent color used for hover/active highlights. */
  accent?: string;
  /** Optional leading content (e.g. app logo) rendered before the menus. */
  leading?: React.ReactNode;
  /** Optional trailing content (e.g. transport / status) pinned to the right. */
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  height?: number;
}

const MENU_WIDTH = 220;

// ---------------------------------------------------------------------------
// Dropdown panel (one level). Recurses for submenus.
// ---------------------------------------------------------------------------
interface PanelProps {
  items: CreativeMenuItem[];
  x: number;
  y: number;
  accent: string;
  onClose: () => void;
  /** Preferred horizontal open direction for nested flyouts. */
  preferLeft?: boolean;
}

const DropdownPanel: React.FC<PanelProps> = ({ items, x, y, accent, onClose, preferLeft }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<{ index: number; rect: DOMRect } | null>(null);

  // Keep the panel fully on-screen: flip horizontally / clamp vertically.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 4) left = Math.max(4, (preferLeft ? x - r.width : window.innerWidth - r.width - 4));
    if (top + r.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - r.height - 4);
    setPos({ left, top });
  }, [x, y, preferLeft, items]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed', left: pos.left, top: pos.top, minWidth: MENU_WIDTH,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 14, padding: 4,
        boxShadow: 'var(--pg-shadow-popover, 0 12px 32px rgba(0,0,0,0.45))',
        zIndex: 'var(--z-modal)' as unknown as number,
        animation: 'dex-panel-in 120ms ease-out',
      }}
      onMouseLeave={() => setOpenSub(null)}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} style={{ height: 1, margin: '4px var(--space-2)', background: 'var(--color-border-subtle)' }} />;
        }
        const hasSub = !!(item.submenu && item.submenu.length);
        const isOpen = openSub?.index === i;
        return (
          <div
            key={item.id || item.label || i}
            role="menuitem"
            aria-disabled={item.disabled}
            aria-haspopup={hasSub || undefined}
            tabIndex={-1}
            onMouseEnter={(e) => { if (hasSub && !item.disabled) setOpenSub({ index: i, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); else setOpenSub(null); }}
            onClick={(e) => {
              if (item.disabled) return;
              if (hasSub) { e.stopPropagation(); setOpenSub({ index: i, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); return; }
              item.onSelect?.();
              onClose();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 'var(--space-2) var(--space-3)', borderRadius: 6, cursor: item.disabled ? 'default' : 'pointer',
              fontSize: 13, lineHeight: 1.4,
              color: item.disabled ? 'var(--color-text-muted)' : item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
              background: isOpen ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent',
              opacity: item.disabled ? 0.5 : 1,
              userSelect: 'none',
            }}
            onMouseOver={(e) => { if (!item.disabled && !isOpen) (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${accent} 14%, transparent)`; }}
            onMouseOut={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {item.checked !== undefined && (
              <span style={{ width: 12, fontSize: 11, color: accent, flexShrink: 0 }}>{item.checked ? '✓' : ''}</span>
            )}
            {item.icon && <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>}
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            {item.shortcut && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 12 }}>{item.shortcut}</span>}
            {hasSub && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>▸</span>}
          </div>
        );
      })}
      {openSub && items[openSub.index]?.submenu && (
        <DropdownPanel
          items={items[openSub.index].submenu!}
          x={openSub.rect.right - 2}
          y={openSub.rect.top - 4}
          accent={accent}
          onClose={onClose}
          preferLeft
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Menu bar
// ---------------------------------------------------------------------------
export const CreativeMenuBar: React.FC<CreativeMenuBarProps> = ({
  menus, accent = 'var(--color-accent)', leading, trailing, style, className, height = 30,
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpenId(null); setAnchor(null); }, []);

  const openMenu = useCallback((menu: CreativeMenu, el: HTMLElement) => {
    if (menu.disabled) return;
    const r = el.getBoundingClientRect();
    setOpenId(menu.id);
    setAnchor({ x: r.left, y: r.bottom + 2 });
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && barRef.current.contains(e.target as Node)) return;
      // Clicks inside a portalled menu are handled by item onClick; treat the
      // rest of the document as "outside".
      const t = e.target as HTMLElement;
      if (t.closest('[role="menu"]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [openId, close]);

  const activeMenu = menus.find(m => m.id === openId) || null;

  return (
    <div
      ref={barRef}
      className={className}
      style={{
        display: 'flex', alignItems: 'center', gap: 2, height,
        padding: '0 6px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)',
        ...style,
      }}
    >
      {leading && <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>{leading}</div>}
      {menus.map((menu) => {
        const isActive = openId === menu.id;
        return (
          <button
            key={menu.id}
            type="button"
            disabled={menu.disabled}
            aria-haspopup="menu"
            aria-expanded={isActive}
            onClick={(e) => { if (isActive) close(); else openMenu(menu, e.currentTarget); }}
            onMouseEnter={(e) => { if (openId && !menu.disabled) openMenu(menu, e.currentTarget); }}
            style={{
              border: 'none', background: isActive ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'transparent',
              color: menu.disabled ? 'var(--color-text-muted)' : isActive ? accent : 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 500, padding: '0 10px', borderRadius: 6,
              cursor: menu.disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit', height: height - 8,
            }}
          >
            {menu.label}
          </button>
        );
      })}
      {trailing && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{trailing}</div>}
      {activeMenu && anchor && createPortal(
        <DropdownPanel items={activeMenu.items} x={anchor.x} y={anchor.y} accent={typeof accent === 'string' ? accent : 'var(--color-accent)'} onClose={close} />,
        document.body,
      )}
    </div>
  );
};

export default CreativeMenuBar;
