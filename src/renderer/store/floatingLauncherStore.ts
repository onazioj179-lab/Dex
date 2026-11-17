// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Dock store. The Dock is a floating overlay that morphs between a compact
// search icon (collapsed) and the full strip (pinned + running apps + search).
//
// Position is an ANCHOR: the horizontal centre (`cx`) and the top edge (`y`) of
// the 36 px row. Both states share that row, so morphing only changes the width
// around a fixed centre -- the icon grows into the strip in place. `cx < 0`
// means "unset": bottom-centre by default.

import { create } from 'zustand';

const KEY = 'dex-dock-v3';
const LEGACY_KEY = 'dex-floating-launcher-v2';

export interface FloatingLauncherState {
  /** Anchor centre x in px. < 0 = unset (bottom-centre). */
  cx: number;
  /** Anchor top y in px. < 0 = unset (bottom edge). */
  y: number;
  /** Whether the Dock is shown at all. */
  enabled: boolean;
  /** Expanded = the full strip; collapsed = the search icon. Runtime only. */
  expanded: boolean;
  /** Collapse back to the search icon after an idle period. Persisted. */
  autoCollapse: boolean;
  setAnchor: (cx: number, y: number) => void;
  setEnabled: (enabled: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setAutoCollapse: (on: boolean) => void;
}

interface Saved { cx: number; y: number; enabled: boolean; autoCollapse: boolean }

function load(): Saved {
  const d: Saved = { cx: -1, y: -1, enabled: true, autoCollapse: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v.cx === 'number' && typeof v.y === 'number') {
        return { cx: v.cx, y: v.y, enabled: v.enabled !== false, autoCollapse: v.autoCollapse !== false };
      }
    }
    // Carry over "hidden" from the previous bar; its position is re-derived.
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) { const v = JSON.parse(old); if (v && v.enabled === false) d.enabled = false; }
  } catch { /* corrupt / unavailable -> defaults */ }
  return d;
}

function save(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

const persist = (s: FloatingLauncherState) => save({ cx: s.cx, y: s.y, enabled: s.enabled, autoCollapse: s.autoCollapse });

export const useFloatingLauncher = create<FloatingLauncherState>((set, get) => ({
  ...load(),
  expanded: false,
  setAnchor: (cx, y) => { set({ cx, y }); persist(get()); },
  setEnabled: (enabled) => { set({ enabled }); persist(get()); },
  setExpanded: (expanded) => { if (get().expanded !== expanded) set({ expanded }); },
  setAutoCollapse: (autoCollapse) => { set({ autoCollapse }); persist(get()); },
}));

// Always-available recovery: Ctrl/Cmd + Shift + B toggles the Dock even when
// it is hidden (it renders null then). Registered once in this always-imported
// module; also exposed for the palette / Settings.
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
  window.addEventListener('dex-toggle-bar', toggleBar);
}
