// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Window state keeper — persists the main window's bounds and maximized state
 * across launches (Recovery Level 2). Saved bounds are validated against the
 * displays present at startup so a detached monitor can never strand the
 * window off-screen; invalid or missing state falls back to the default
 * centered layout. Plain-JSON file in userData, following the ReleaseManager
 * config pattern.
 */

import { app, screen, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = 'window-state.json';

export interface PersistedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

/**
 * Load the last saved window state, or null when none exists or the saved
 * bounds are no longer meaningfully visible on any current display.
 */
export function loadWindowState(): PersistedWindowState | null {
  try {
    const p = statePath();
    if (!fs.existsSync(p)) return null;
    const s = JSON.parse(fs.readFileSync(p, 'utf-8')) as PersistedWindowState;
    if (
      typeof s.x !== 'number' || typeof s.y !== 'number' ||
      typeof s.width !== 'number' || typeof s.height !== 'number' ||
      s.width < 200 || s.height < 200
    ) {
      return null;
    }
    // Require a usable overlap with some display's work area: enough of the
    // title bar must remain reachable to drag the window back.
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return (
        s.x < a.x + a.width - 80 &&
        s.x + s.width > a.x + 80 &&
        s.y >= a.y - 16 &&
        s.y < a.y + a.height - 80
      );
    });
    if (!visible) return null;
    return { ...s, maximized: s.maximized === true };
  } catch {
    return null;
  }
}

/**
 * Track a window's bounds and maximized state, saving (debounced) on change
 * and flushing on close.
 */
export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    try {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const maximized = win.isMaximized();
      // While maximized, persist the normal (restored) bounds so unmaximize
      // after relaunch lands where the user left the window.
      const bounds = maximized ? win.getNormalBounds() : win.getBounds();
      const state: PersistedWindowState = { ...bounds, maximized };
      fs.writeFileSync(statePath(), JSON.stringify(state));
    } catch {
      // best-effort persistence; never interfere with the window itself
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 500);
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', () => {
    if (timer) clearTimeout(timer);
    save();
  });
}
