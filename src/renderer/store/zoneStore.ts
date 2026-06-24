// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX custom snap-zone store (DEX_FEATURE_BACKLOG 01).
 *
 * Persists the user's FancyZones-style zone layouts and which one is "active"
 * (drives drag-to-zone snapping + the expand/cycle keyboard grammar). Layouts
 * are authored in the Zone Editor; this is the persisted zone state the window
 * manager reads. Mirrors the dock store's localStorage + capability:storage IPC
 * backup pattern so layouts survive across sessions and shells.
 */

import { create } from 'zustand';
import { validateZones, type ZoneLayout } from '../../shared/shell/customZones';
import { generateId } from '../../shared/util/id';

const LAYOUTS_KEY = 'dex-zone-layouts';
const ACTIVE_KEY = 'dex-zone-active';
const MAX_LAYOUTS = 50;

interface ZoneState {
  /** User-authored saved layouts. */
  layouts: ZoneLayout[];
  /** Id of the layout driving snapping/expand, or null = default edge snapping. */
  activeLayoutId: string | null;
  saveLayout: (layout: Omit<ZoneLayout, 'id'> & { id?: string }) => string;
  removeLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  setActiveLayout: (id: string | null) => void;
  getActiveLayout: () => ZoneLayout | null;
}

function persist(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value);
    localStorage.setItem(key, json);
    (window as any).electron?.invoke?.('capability:storage:set', key, json)
      .catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

function loadLayouts(): ZoneLayout[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((l): l is ZoneLayout => l && typeof l.id === 'string' && Array.isArray(l.zones))
          .map(l => ({ ...l, zones: validateZones(l.zones) }))
          .filter(l => l.zones.length > 0);
      }
    }
  } catch { /* ignore */ }
  return [];
}

function loadActive(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as string | null) : null;
  } catch { return null; }
}

// Async IPC load — overrides localStorage on startup if the backend has newer data.
async function loadLayoutsAsync(): Promise<ZoneLayout[] | null> {
  try {
    const raw = await (window as any).electron?.invoke?.('capability:storage:get', LAYOUTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((l: any) => l && typeof l.id === 'string' && Array.isArray(l.zones))
          .map((l: ZoneLayout) => ({ ...l, zones: validateZones(l.zones) }))
          .filter((l: ZoneLayout) => l.zones.length > 0);
      }
    }
  } catch { /* fallback to localStorage */ }
  return null;
}

export const useZoneStore = create<ZoneState>((set, get) => {
  // Hydrate from the IPC backend after first paint (matches dock store).
  loadLayoutsAsync().then(l => { if (l) set({ layouts: l }); })
    .catch((e: unknown) => { console.warn('[DEX]', e); });

  return {
    layouts: loadLayouts(),
    activeLayoutId: loadActive(),

    saveLayout: (layout) => {
      const id = layout.id ?? generateId('zone');
      const clean: ZoneLayout = {
        id,
        name: (layout.name || 'Custom Layout').slice(0, 60),
        kind: layout.kind === 'grid' ? 'grid' : 'canvas',
        zones: validateZones(layout.zones),
      };
      if (clean.zones.length === 0) return id;
      set(state => {
        const exists = state.layouts.some(l => l.id === id);
        let layouts = exists
          ? state.layouts.map(l => (l.id === id ? clean : l))
          : [...state.layouts, clean];
        if (layouts.length > MAX_LAYOUTS) layouts = layouts.slice(layouts.length - MAX_LAYOUTS);
        persist(LAYOUTS_KEY, layouts);
        return { layouts };
      });
      return id;
    },

    removeLayout: (id) => {
      set(state => {
        const layouts = state.layouts.filter(l => l.id !== id);
        persist(LAYOUTS_KEY, layouts);
        const activeLayoutId = state.activeLayoutId === id ? null : state.activeLayoutId;
        if (activeLayoutId !== state.activeLayoutId) persist(ACTIVE_KEY, activeLayoutId);
        return { layouts, activeLayoutId };
      });
    },

    renameLayout: (id, name) => {
      set(state => {
        const layouts = state.layouts.map(l => (l.id === id ? { ...l, name: name.slice(0, 60) } : l));
        persist(LAYOUTS_KEY, layouts);
        return { layouts };
      });
    },

    setActiveLayout: (id) => {
      set(state => {
        const activeLayoutId = id && state.layouts.some(l => l.id === id) ? id : null;
        persist(ACTIVE_KEY, activeLayoutId);
        return { activeLayoutId };
      });
    },

    getActiveLayout: () => {
      const { layouts, activeLayoutId } = get();
      return layouts.find(l => l.id === activeLayoutId) ?? null;
    },
  };
});
