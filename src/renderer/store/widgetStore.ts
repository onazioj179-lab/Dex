// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Widget Store - Frontend widget layout management
 * Zustand store with localStorage persistence for home screen widgets.
 * Supports add, remove, move, resize with sensible defaults.
 */

import { create } from 'zustand';

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
  | 'music-controls';

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
];

const STORAGE_KEY = 'dex-home-widgets';

function loadWidgets(): Widget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

function saveWidgets(widgets: Widget[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch { /* ignore */ }
}

interface WidgetStoreState {
  widgets: Widget[];
  editMode: boolean;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  moveWidget: (id: string, x: number, y: number) => void;
  resizeWidget: (id: string, width: number, height: number) => void;
  toggleEditMode: () => void;
  setEditMode: (v: boolean) => void;
}

export const useWidgetStore = create<WidgetStoreState>((set, get) => ({
  widgets: loadWidgets(),
  editMode: false,

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

  toggleEditMode: () => set(s => ({ editMode: !s.editMode })),
  setEditMode: (v) => set({ editMode: v }),
}));
