// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Floating Launcher position store. The launcher is "The DEX Bar" -- a single
// draggable command bar the user can place ANYWHERE on screen (not a
// content-width dock that shifts as apps open/close). Its position persists
// across restarts. `x < 0` means "unset" -> the bar resolves a sensible default
// placement (bottom-centre) at render time.
//
// KEY is v2: the v6 redesign changed the launcher from a vertical orb stack to a
// horizontal bar, so a fresh default placement is wanted rather than a stale
// orb-anchor coordinate.

import { create } from 'zustand';

const KEY = 'dex-floating-launcher-v2';

export interface FloatingLauncherState {
  /** Top-left x in px. < 0 = unset (use default corner). */
  x: number;
  /** Top-left y in px. < 0 = unset. */
  y: number;
  /** Whether the floating launcher is shown. */
  enabled: boolean;
  setPosition: (x: number, y: number) => void;
  setEnabled: (enabled: boolean) => void;
  /**
   * Px the bar takes from the bottom of the viewport when it sits docked at the
   * bottom edge (0 when folded, floating elsewhere, hidden or disabled). The
   * window manager subtracts it from the work area so maximized / tiled apps
   * stop above the bar instead of sliding under it. Runtime only, not saved.
   */
  reserveBottom: number;
  setReserveBottom: (px: number) => void;
  /** Folded = the bar collapsed into a single search orb. Persisted. */
  folded: boolean;
  setFolded: (folded: boolean) => void;
}

const FOLD_KEY = 'dex-bar-folded';
function loadFolded(): boolean {
  try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; }
}

function load(): { x: number; y: number; enabled: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v.x === 'number' && typeof v.y === 'number') {
        return { x: v.x, y: v.y, enabled: v.enabled !== false };
      }
    }
  } catch { /* corrupt / unavailable -> defaults */ }
  return { x: -1, y: -1, enabled: true };
}

function save(s: { x: number; y: number; enabled: boolean }): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

export const useFloatingLauncher = create<FloatingLauncherState>((set, get) => ({
  ...load(),
  setPosition: (x, y) => { set({ x, y }); const s = get(); save({ x: s.x, y: s.y, enabled: s.enabled }); },
  setEnabled: (enabled) => { set({ enabled }); const s = get(); save({ x: s.x, y: s.y, enabled: s.enabled }); },
  reserveBottom: 0,
  setReserveBottom: (px) => {
    const v = Math.max(0, Math.round(px));
    if (v !== get().reserveBottom) set({ reserveBottom: v });
  },
  folded: loadFolded(),
  setFolded: (folded) => {
    set({ folded });
    try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch { /* quota */ }
  },
}));

// Always-available recovery: a global shortcut toggles the DEX Bar even when it
// is hidden (the bar renders null when disabled, so it can't host its own
// re-show control). Lives in the store module -- which is always imported -- so
// the listener survives with the bar hidden. Ctrl/Cmd + Shift + B. Also exposed
// on window for the command palette / Settings to call. Guarded against the
// HMR / double-import re-register.
if (typeof window !== 'undefined' && !(window as { __dexBarToggleWired?: boolean }).__dexBarToggleWired) {
  (window as { __dexBarToggleWired?: boolean }).__dexBarToggleWired = true;
  const toggleBar = () => {
    const s = useFloatingLauncher.getState();
    s.setEnabled(!s.enabled);
  };
  (window as unknown as { dexToggleBar?: () => void }).dexToggleBar = toggleBar;
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
      e.preventDefault();
      toggleBar();
    }
  });
  // Let any UI dispatch a re-show without importing the store.
  window.addEventListener('dex-toggle-bar', toggleBar);
}
