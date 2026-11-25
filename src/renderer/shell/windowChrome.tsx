// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unified window chrome.
 *
 * STANDARD  the window header (icon, title, window controls) and, below it,
 *           whatever bar the app draws itself.
 * UNIFIED   one header: the app's own menus/toolbar move INTO the window
 *           header, between the app icon and the window controls, so the app
 *           does not spend a second strip on chrome. The empty parts of the
 *           header still drag the window; controls never start a drag.
 *
 * An app opts in by rendering its bar through <WindowToolbar>: in a unified
 * window it is portalled into the header slot, anywhere else (inline app,
 * standard window, tests) it renders where it is, unchanged. AppShell does
 * this automatically.
 */

import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export type WindowMode = 'standard' | 'unified';

/** Below this width the app's controls would not fit beside the window controls. */
export const UNIFIED_MIN_WIDTH = 760;

/**
 * Apps whose chrome fits one header, with the narrowest window that still
 * holds their bar beside the window controls. Small bars (Calculator's mode
 * switch, Terminal's tabs) unify in small windows too. Others stay standard.
 */
const UNIFIED_APPS: Record<string, number> = {
  taskmanager: UNIFIED_MIN_WIDTH, ledger: UNIFIED_MIN_WIDTH, bio: UNIFIED_MIN_WIDTH, health: UNIFIED_MIN_WIDTH,
  security: UNIFIED_MIN_WIDTH, dexcode: UNIFIED_MIN_WIDTH, files: UNIFIED_MIN_WIDTH,
  terminal: 420, calculator: 340, maps: 560,
};

/** The mode for a window of `width` px (unified falls back to standard when narrow, so nothing is clipped). */
export function windowModeFor(appId: string, width = Infinity): WindowMode {
  const min = UNIFIED_APPS[appId.split('~')[0]];
  return min !== undefined && width >= min ? 'unified' : 'standard';
}

/**
 * Full-surface (tab) apps whose small bar moves into the DEX top bar, so the
 * app keeps one row of chrome: nav, the app's controls, status, window
 * controls. Big bars (DexCode, Files) keep their own row there.
 */
const TOPBAR_APPS = new Set(['terminal', 'maps', 'calculator']);

/** The mode for an app shown full-surface (its bar in the DEX top bar, or its own). */
export function topBarModeFor(appId: string): WindowMode {
  return TOPBAR_APPS.has(appId.split('~')[0]) ? 'unified' : 'standard';
}

interface ChromeCtx { mode: WindowMode; slot: HTMLElement | null }
const WindowChromeContext = createContext<ChromeCtx>({ mode: 'standard', slot: null });

export const WindowChromeProvider: React.FC<{ mode: WindowMode; slot: HTMLElement | null; children: React.ReactNode }> = ({ mode, slot, children }) => (
  <WindowChromeContext.Provider value={{ mode, slot }}>{children}</WindowChromeContext.Provider>
);

/** True when this subtree's toolbar lives in the window header. */
export function useUnifiedChrome(): boolean {
  const c = useContext(WindowChromeContext);
  return c.mode === 'unified' && !!c.slot;
}

/**
 * The app's bar. Unified window: rendered into the header slot (children
 * only, no own background or border). Otherwise: `inline` (the app's normal
 * bar) is rendered in place.
 */
export const WindowToolbar: React.FC<{ children: React.ReactNode; inline: (children: React.ReactNode) => React.ReactElement }> = ({ children, inline }) => {
  const c = useContext(WindowChromeContext);
  if (c.mode === 'unified' && c.slot) {
    return createPortal(
      <div data-unified-toolbar="" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, flex: 1, height: '100%', overflow: 'hidden' }}>
        {children}
      </div>,
      c.slot,
    );
  }
  return inline(children);
};

/** Elements inside a window header that must never start a window drag. */
export const NO_DRAG_SELECTOR = 'button, a, input, select, textarea, [role="menuitem"], [role="menubar"] button, [role="tab"], [role="switch"], [contenteditable="true"], [data-no-drag]';
