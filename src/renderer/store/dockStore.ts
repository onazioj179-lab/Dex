// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Morphing Dock preferences and live state, and the inputs the Desktop Work
// Area Manager reads from it. Pinned apps and their order live in the pin
// registry (services/appPinning); this store is only the Dock's own layout.

import { create } from 'zustand';
import { normalizeDockAlign, normalizeDockEdge, type DockAlign, type DockEdge } from '../../shared/shell/dockGeometry';

const KEY = 'dex-dock-prefs-v1';

/** Icon tile and the Dock's thickness around it. */
export const DOCK_TILE = 40;
export const DOCK_PAD = 6;
export const DOCK_THICKNESS = DOCK_TILE + DOCK_PAD * 2; // 52
export const DOCK_MARGIN = 8;
/** Strip windows leave free for the Dock on its edge. */
export const DOCK_RESERVE = DOCK_THICKNESS + DOCK_MARGIN * 2 - 4; // 64

export type DockStyle = 'morphing' | 'classic';

export interface DockPrefs {
  /** 'morphing' = the Morphing Dock; 'classic' = the floating DEX Bar. */
  style: DockStyle;
  edge: DockEdge;
  align: DockAlign;
  /** Collapse back to the search button after launching, on Escape, when the
   *  pointer leaves, or on a click elsewhere. Off = it stays open. */
  autoCollapse: boolean;
  /** Last open/closed state (kept when auto-collapse is off). */
  expanded: boolean;
  /** Extra space around the window area, px (0-48). */
  workspacePadding: number;
  /** Free placement: the folded Dock's centre as a fraction of the screen
   *  (0-1). null = docked to an edge (edge/align). */
  free: { x: number; y: number } | null;
}

export const DEFAULT_DOCK_PREFS: DockPrefs = {
  style: 'morphing',
  edge: 'bottom',
  align: 'center',
  // Owner (2026-11-17): the Dock folds to its search button when idle by
  // default, so it never sits on top of an app's own bottom controls.
  autoCollapse: true,
  expanded: false,
  workspacePadding: 0,
  free: null,
};

export function sanitizeDockPrefs(v: unknown): DockPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<DockPrefs> & { acV2?: boolean };
  // Prefs saved before the auto-collapse default changed (no acV2 mark) take
  // the new default once; after that the user's own choice sticks.
  const migrate = !o.acV2;
  return {
    style: o.style === 'classic' ? 'classic' : 'morphing',
    edge: normalizeDockEdge(o.edge),
    align: normalizeDockAlign(o.align),
    autoCollapse: migrate ? true : o.autoCollapse === true,
    expanded: migrate ? false : o.expanded !== false,
    workspacePadding: Math.max(0, Math.min(48, Math.round(Number(o.workspacePadding) || 0))),
    free: sanitizeFree(o.free),
  };
}

function sanitizeFree(v: unknown): DockPrefs['free'] {
  if (!v || typeof v !== 'object') return null;
  const { x, y } = v as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

function load(): DockPrefs {
  try { return sanitizeDockPrefs(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...DEFAULT_DOCK_PREFS }; }
}

interface DockState extends DockPrefs {
  /** A fullscreen window is in front: the Dock steps aside and keeps no strip. */
  hiddenForFullscreen: boolean;
  setPrefs: (patch: Partial<DockPrefs>) => void;
  setExpanded: (expanded: boolean) => void;
  setHiddenForFullscreen: (hidden: boolean) => void;
}

function persist(s: DockPrefs): void {
  const { style, edge, align, autoCollapse, expanded, workspacePadding, free } = s;
  try { localStorage.setItem(KEY, JSON.stringify({ style, edge, align, autoCollapse, expanded, workspacePadding, free, acV2: true })); } catch { /* storage full */ }
}

export const useDockStore = create<DockState>((set, get) => ({
  ...load(),
  hiddenForFullscreen: false,
  setPrefs: (patch) => {
    set(sanitizeDockPrefs({ ...get(), ...patch, acV2: true }));
    persist(get());
  },
  setExpanded: (expanded) => {
    if (get().expanded === expanded) return;
    set({ expanded });
    persist(get());
  },
  setHiddenForFullscreen: (hiddenForFullscreen) => set({ hiddenForFullscreen }),
}));

/** Strip the Dock keeps on its edge right now (0 when it does not occupy one). */
export function dockReserve(s: Pick<DockState, 'style' | 'hiddenForFullscreen'>): number {
  return s.style === 'morphing' && !s.hiddenForFullscreen ? DOCK_RESERVE : 0;
}

// Exposed like __dexRunningApps, for UKI and tooling (read prefs, move the Dock).
if (typeof window !== 'undefined') {
  (window as unknown as { __dexDockStore?: typeof useDockStore }).__dexDockStore = useDockStore;
}
