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
}));
