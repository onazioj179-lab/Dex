// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AppShell menu schema — menus are DATA, not hand-rolled JSX.
 *
 * An app declares a `MenuGroup[]` (File / Edit / View / Tools / Help-style top
 * buttons). Each group has `MenuSection[]` (caps micro-label + divider), each
 * section has `MenuAction[]` (the clickable rows, with optional nested
 * `children` for submenus). `MenuBar` renders this through the shared
 * `UnifiedDropdown` engine — no per-app menu code, no loose "tools" icon rows.
 *
 * This is the single contract every app's chrome targets: the same shape that
 * lets us move scattered tool buttons into organized dropdowns + submenus
 * across the whole suite.
 */

import type React from 'react';

/** One clickable row in a menu (or a submenu parent when `children` is set). */
export interface MenuAction {
  /** Stable id; also used as the dispatch key for AppShell.onMenuSelect. */
  id: string;
  label: string;
  /** Display-only shortcut hint, e.g. 'Ctrl+L'. */
  shortcut?: string;
  /** DexIcon name for a leading glyph. */
  icon?: string;
  /** Custom leading element (overrides `icon`). */
  iconElement?: React.ReactNode;
  /** Toggle state — renders a leading check and marks aria-checked. */
  checked?: boolean;
  disabled?: boolean;
  /** Destructive styling (red). */
  danger?: boolean;
  /** Per-action handler. Omit to handle centrally via AppShell.onMenuSelect(id). */
  run?: () => void;
  /** Nested submenu. */
  children?: MenuAction[];
}

/** A labelled block of actions inside a group (caps header + trailing divider). */
export interface MenuSection {
  id: string;
  /** Optional caps micro-label shown above the section. */
  label?: string;
  items: MenuAction[];
}

/** One top-bar menu button (File / Edit / View / Tools / Help). */
export interface MenuGroup {
  id: string;
  label: string;
  sections: MenuSection[];
}
