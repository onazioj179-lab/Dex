// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MenuBar — renders a declarative `MenuGroup[]` as a row of top-bar menu
 * buttons, each backed by the shared `UnifiedDropdown` engine (submenus,
 * keyboard nav, viewport edge-flip all inherited). This is how apps replace
 * loose "tools" icon rows with organized File / Edit / View / Tools menus.
 *
 * Selection dispatch: a `MenuAction` runs its own `run()` if present, then the
 * MenuBar's `onSelect(actionId)` central handler — so an app can wire either
 * per-action callbacks or one switch.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { UnifiedDropdown, type DropdownItem } from '../UnifiedDropdown';
import DexIcon from '../DexIcon';
import { colors, radius, transition } from '../../styles/tokens';
import type { MenuAction, MenuGroup } from './menuTypes';

export interface MenuBarProps {
  groups: MenuGroup[];
  /** Central dispatch — receives the selected action id (after its own run()). */
  onSelect?: (actionId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const CheckGlyph: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 7.5L6 10.5L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function actionIcon(a: MenuAction): React.ReactNode {
  if (a.checked) return <CheckGlyph />;
  if (a.iconElement) return a.iconElement;
  if (a.icon) return <DexIcon name={a.icon} size={16} />;
  return undefined;
}

function toDropdownItem(a: MenuAction): DropdownItem {
  return {
    id: a.id,
    label: a.label,
    shortcut: a.shortcut,
    disabled: a.disabled,
    danger: a.danger,
    icon: actionIcon(a),
    children: a.children?.map(toDropdownItem),
  };
}

/** Flatten a group into UnifiedDropdown items: section headers + dividers + rows. */
function groupToItems(group: MenuGroup): DropdownItem[] {
  const out: DropdownItem[] = [];
  group.sections.forEach((section, i) => {
    if (i > 0) out.push({ id: `${section.id}__div`, label: '', divider: true });
    if (section.label) out.push({ id: `${section.id}__hdr`, label: section.label, header: true });
    section.items.forEach((item) => out.push(toDropdownItem(item)));
  });
  return out;
}

/** Walk all actions (incl. nested children) into an id -> action lookup. */
function indexActions(groups: MenuGroup[]): Map<string, MenuAction> {
  const map = new Map<string, MenuAction>();
  const walk = (actions: MenuAction[]) => {
    for (const a of actions) {
      map.set(a.id, a);
      if (a.children) walk(a.children);
    }
  };
  groups.forEach((g) => g.sections.forEach((s) => walk(s.items)));
  return map;
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
};

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 26,
  padding: '0 10px',
  fontSize: 13,
  fontWeight: 500,
  color: colors.text.secondary,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
  transition: `background ${transition.fast}, color ${transition.fast}`,
  outline: 'none',
  whiteSpace: 'nowrap',
};

const triggerOpenStyle: React.CSSProperties = {
  background: colors.bg.hover,
  color: colors.text.primary,
};

const MenuGroupButton: React.FC<{
  group: MenuGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelectItem: (item: DropdownItem) => void;
}> = ({ group, open, onOpen, onClose, onSelectItem }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const items = useMemo(() => groupToItems(group), [group]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...triggerStyle,
          ...((open || hovered) ? triggerOpenStyle : {}),
        }}
      >
        {group.label}
      </button>
      <UnifiedDropdown
        triggerRef={ref}
        open={open}
        onClose={onClose}
        items={items}
        onSelect={onSelectItem}
        placement="bottom-start"
        ariaLabel={`${group.label} menu`}
      />
    </>
  );
};

export const MenuBar: React.FC<MenuBarProps> = ({ groups, onSelect, className, style }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const actionIndex = useMemo(() => indexActions(groups), [groups]);

  const handleSelect = useCallback((item: DropdownItem) => {
    const action = actionIndex.get(item.id);
    if (!action || action.disabled) return;
    action.run?.();
    onSelect?.(action.id);
  }, [actionIndex, onSelect]);

  return (
    <div className={className} style={{ ...barStyle, ...style }} role="menubar" aria-label="Application menu">
      {groups.map((group) => (
        <MenuGroupButton
          key={group.id}
          group={group}
          open={openId === group.id}
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId((cur) => (cur === group.id ? null : cur))}
          onSelectItem={handleSelect}
        />
      ))}
    </div>
  );
};

export default MenuBar;
