// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Widget Store - Frontend widget layout management
 * Zustand store with localStorage persistence for home screen widgets.
 * Supports add, remove, move, resize with sensible defaults.
 * Phase 15: layout snapshots via HomeLayoutStore for save/restore/tidy.
 */

import { create } from 'zustand';
import { HomeLayoutStore } from '../../shared/phase15/homeLayoutStore';

export type WidgetType =
  | 'clock'
  | 'calendar'
  | 'recent-files'
  | 'quick-actions'
  | 'system-status'
  | 'notes-scratchpad'
  | 'nexus'
  | 'weather'
  | 'battery'
  | 'storage'
  | 'music-controls'
  | 'daily-tip';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;       // px from left
  y: number;       // px from top
  width: number;   // px
  height: number;  // px
  visible: boolean;
}

export interface WidgetTemplate {
  type: WidgetType;
  title: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  { type: 'clock', title: 'Clock', icon: 'clock', defaultWidth: 200, defaultHeight: 120, minWidth: 140, minHeight: 80 },
  { type: 'calendar', title: 'Calendar', icon: 'calendar', defaultWidth: 260, defaultHeight: 260, minWidth: 200, minHeight: 200 },
  { type: 'recent-files', title: 'Recent Files', icon: 'file', defaultWidth: 260, defaultHeight: 220, minWidth: 200, minHeight: 150 },
  { type: 'quick-actions', title: 'Quick Actions', icon: 'zap', defaultWidth: 240, defaultHeight: 180, minWidth: 180, minHeight: 120 },
  { type: 'system-status', title: 'System Status', icon: 'activity', defaultWidth: 240, defaultHeight: 160, minWidth: 180, minHeight: 100 },
  { type: 'notes-scratchpad', title: 'Notes', icon: 'edit', defaultWidth: 260, defaultHeight: 220, minWidth: 200, minHeight: 150 },
  { type: 'nexus', title: 'Nexus', icon: 'radar', defaultWidth: 280, defaultHeight: 280, minWidth: 200, minHeight: 200 },
  { type: 'weather', title: 'Weather', icon: 'sun', defaultWidth: 220, defaultHeight: 160, minWidth: 160, minHeight: 100 },
  { type: 'battery', title: 'Battery', icon: 'battery', defaultWidth: 200, defaultHeight: 100, minWidth: 140, minHeight: 80 },
  { type: 'storage', title: 'Storage', icon: 'hard-drive', defaultWidth: 240, defaultHeight: 120, minWidth: 180, minHeight: 90 },
  { type: 'music-controls', title: 'Music', icon: 'music', defaultWidth: 280, defaultHeight: 120, minWidth: 220, minHeight: 100 },
  { type: 'daily-tip', title: 'Daily Tip', icon: 'lightbulb', defaultWidth: 260, defaultHeight: 130, minWidth: 200, minHeight: 100 },
];

const STORAGE_KEY = 'dex-home-widgets';

// Empty by default: Home is a clean desktop. Widgets are opt-in (right-click ->
// Add Widget); the user's choices persist in localStorage.
const DEFAULT_WIDGETS: Widget[] = [];

function loadWidgets(): Widget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS;
}

function saveWidgets(widgets: Widget[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Phase 15 HomeLayoutStore bridge — persist/restore named layout snapshots
// so users can save Home widget arrangements (e.g. "Focus", "Studio") and
// jump back to them. All I/O goes through localStorage; no network involved.
// ---------------------------------------------------------------------------

const LAYOUT_SNAPSHOT_KEY = 'dex-home-layout-snapshots';

function buildHomeLayoutStore(widgets: Widget[]): HomeLayoutStore {
  const store = new HomeLayoutStore({ maxSnapshots: 10 });
  const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const H = typeof window !== 'undefined' ? window.innerHeight : 1080;
  for (const w of widgets) {
    store.upsert({
      id: w.id,
      kind: 'custom',
      sourceId: w.type,
      x: W > 0 ? Math.max(0, Math.min(1, w.x / W)) : 0,
      y: H > 0 ? Math.max(0, Math.min(1, w.y / H)) : 0,
      w: W > 0 ? Math.max(0.05, Math.min(1, w.width / W)) : 0.15,
      h: H > 0 ? Math.max(0.05, Math.min(1, w.height / H)) : 0.15,
      pinned: false,
      z: 0,
    });
  }
  // Hydrate saved snapshots from localStorage.
  try {
    const raw = localStorage.getItem(LAYOUT_SNAPSHOT_KEY);
    if (raw) {
      const hydrated = HomeLayoutStore.deserialize(raw);
      for (const s of hydrated.snapshots_()) {
        store.snapshot(s.label, s.savedAt);
      }
    }
  } catch { /* ignore */ }
  return store;
}

/**
 * Save a named Home layout snapshot so it can be restored later.
 * `widgets` is the current widget array from the store.
 */
export function saveHomeLayoutSnapshot(widgets: Widget[], label: string): void {
  try {
    const ls = buildHomeLayoutStore(widgets);
    ls.snapshot(label);
    localStorage.setItem(LAYOUT_SNAPSHOT_KEY, ls.serialize());
  } catch { /* never throw */ }
}

/**
 * List saved Home layout snapshot labels.
 */
export function listHomeLayoutSnapshots(): string[] {
  try {
    const raw = localStorage.getItem(LAYOUT_SNAPSHOT_KEY);
    if (!raw) return [];
    return HomeLayoutStore.deserialize(raw).snapshots_().map(s => s.label ?? '');
  } catch { return []; }
}

interface WidgetStoreState {
  widgets: Widget[];
  /** Whether the "Add widget" picker overlay is open. Widgets are always
   *  directly draggable/resizable on hover, so there is no global edit mode --
   *  this is the only piece of widget UI that needs a shared open/closed flag. */
  pickerOpen: boolean;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  moveWidget: (id: string, x: number, y: number) => void;
  resizeWidget: (id: string, width: number, height: number) => void;
  setPickerOpen: (v: boolean) => void;
  /** Save a named Home layout snapshot (Phase 15). */
  snapshotLayout: (label?: string) => void;
}

export const useWidgetStore = create<WidgetStoreState>((set, get) => ({
  widgets: loadWidgets(),
  pickerOpen: false,

  addWidget: (type) => {
    const template = WIDGET_TEMPLATES.find(t => t.type === type);
    if (!template) return;
    const widgets = get().widgets;
    // Place at an offset position based on how many widgets exist
    const offset = widgets.length * 20;
    const newWidget: Widget = {
      id: `w_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      title: template.title,
      x: 40 + offset,
      y: 120 + offset,
      width: template.defaultWidth,
      height: template.defaultHeight,
      visible: true,
    };
    const next = [...widgets, newWidget];
    saveWidgets(next);
    set({ widgets: next });
  },

  removeWidget: (id) => {
    const next = get().widgets.filter(w => w.id !== id);
    saveWidgets(next);
    set({ widgets: next });
  },

  moveWidget: (id, x, y) => {
    const next = get().widgets.map(w => w.id === id ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w);
    saveWidgets(next);
    set({ widgets: next });
  },

  resizeWidget: (id, width, height) => {
    const next = get().widgets.map(w => {
      if (w.id !== id) return w;
      const template = WIDGET_TEMPLATES.find(t => t.type === w.type);
      const minW = template?.minWidth ?? 120;
      const minH = template?.minHeight ?? 80;
      return { ...w, width: Math.max(minW, width), height: Math.max(minH, height) };
    });
    saveWidgets(next);
    set({ widgets: next });
  },

  setPickerOpen: (v) => set({ pickerOpen: v }),

  snapshotLayout: (label = 'snapshot') => {
    saveHomeLayoutSnapshot(get().widgets, label);
  },
}));
