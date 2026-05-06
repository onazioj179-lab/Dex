// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Widget System Improvements (Items 61-80)
 * Enhanced widget architecture, data fetching, and layout
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export type WidgetSize = 'small' | 'medium' | 'large' | 'extra-large';

export interface WidgetDimensions {
  cols: number;
  rows: number;
  minWidth: number;
  minHeight: number;
}

export interface WidgetConfig {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: WidgetSize;
  settings: Record<string, unknown>;
  lastUpdated: number;
  refreshInterval: number; // ms, 0 = no auto refresh
  isVisible: boolean;
  isPinned: boolean;
}

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  defaultSettings: Record<string, unknown>;
  refreshable: boolean;
  category: 'productivity' | 'system' | 'media' | 'social' | 'utility' | 'creative';
}

// ============================================================================
// Widget Size Configurations
// ============================================================================

export const WIDGET_SIZES: Record<WidgetSize, WidgetDimensions> = {
  small: { cols: 1, rows: 1, minWidth: 160, minHeight: 160 },
  medium: { cols: 2, rows: 1, minWidth: 340, minHeight: 160 },
  large: { cols: 2, rows: 2, minWidth: 340, minHeight: 340 },
  'extra-large': { cols: 4, rows: 2, minWidth: 700, minHeight: 340 },
};

// ============================================================================
// Built-in Widget Definitions
// ============================================================================

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: 'clock',
    name: 'Clock',
    description: 'Digital or analog clock with world time',
    icon: 'clock',
    sizes: ['small', 'medium'],
    defaultSize: 'small',
    defaultSettings: { format: '12h', showDate: true, timezone: 'local' },
    refreshable: false,
    category: 'utility',
  },
  {
    type: 'weather',
    name: 'Weather',
    description: 'Current weather and forecast',
    icon: 'cloud-sun',
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { location: 'auto', units: 'metric', showForecast: true },
    refreshable: true,
    category: 'utility',
  },
  {
    type: 'calendar',
    name: 'Calendar',
    description: 'Upcoming events and tasks',
    icon: 'calendar',
    sizes: ['medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { showTasks: true, daysAhead: 7 },
    refreshable: true,
    category: 'productivity',
  },
  {
    type: 'notes',
    name: 'Quick Notes',
    description: 'Quick note taking widget',
    icon: 'edit-3',
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { noteId: null },
    refreshable: false,
    category: 'productivity',
  },
  {
    type: 'tasks',
    name: 'Tasks',
    description: 'Todo list and reminders',
    icon: 'check-square',
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { listId: 'default', showCompleted: false },
    refreshable: true,
    category: 'productivity',
  },
  {
    type: 'system-status',
    name: 'System Status',
    description: 'CPU, memory, and storage usage',
    icon: 'activity',
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { showCpu: true, showMemory: true, showStorage: true, showNetwork: true },
    refreshable: true,
    category: 'system',
  },
  {
    type: 'battery',
    name: 'Battery',
    description: 'Battery status and health',
    icon: 'battery',
    sizes: ['small'],
    defaultSize: 'small',
    defaultSettings: { showHealth: true },
    refreshable: true,
    category: 'system',
  },
  {
    type: 'music',
    name: 'Now Playing',
    description: 'Music player controls',
    icon: 'music',
    sizes: ['small', 'medium'],
    defaultSize: 'medium',
    defaultSettings: { showAlbumArt: true },
    refreshable: true,
    category: 'media',
  },
  {
    type: 'photos',
    name: 'Photo Frame',
    description: 'Slideshow of photos',
    icon: 'image',
    sizes: ['medium', 'large', 'extra-large'],
    defaultSize: 'large',
    defaultSettings: { albumId: 'favorites', interval: 30000 },
    refreshable: true,
    category: 'media',
  },
  {
    type: 'shortcuts',
    name: 'App Shortcuts',
    description: 'Quick access to apps',
    icon: 'grid',
    sizes: ['small', 'medium'],
    defaultSize: 'small',
    defaultSettings: { apps: [] },
    refreshable: false,
    category: 'utility',
  },
  {
    type: 'creative-projects',
    name: 'Creative Projects',
    description: 'Recent projects from creative apps',
    icon: 'folder',
    sizes: ['medium', 'large'],
    defaultSize: 'medium',
    defaultSettings: { apps: ['vinx', 'imosion', 'prism', 'flux', 'forge', 'axl'], limit: 6 },
    refreshable: true,
    category: 'creative',
  },
  {
    type: 'quick-actions',
    name: 'Quick Actions',
    description: 'Frequently used actions',
    icon: 'zap',
    sizes: ['small', 'medium'],
    defaultSize: 'small',
    defaultSettings: { actions: [] },
    refreshable: false,
    category: 'utility',
  },
];

// ============================================================================
// Widget Store
// ============================================================================

interface WidgetStore {
  widgets: WidgetConfig[];
  editMode: boolean;
  // Actions
  addWidget: (type: string, position?: { x: number; y: number }) => string;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  moveWidget: (id: string, position: { x: number; y: number }) => void;
  resizeWidget: (id: string, size: WidgetSize) => void;
  toggleEditMode: () => void;
  setEditMode: (enabled: boolean) => void;
  duplicateWidget: (id: string) => string | null;
  resetLayout: () => void;
  exportLayout: () => string;
  importLayout: (json: string) => boolean;
}

let widgetIdCounter = 0;

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      widgets: [],
      editMode: false,

      addWidget: (type, position) => {
        const definition = WIDGET_DEFINITIONS.find(d => d.type === type);
        if (!definition) return '';

        const id = `widget_${Date.now()}_${++widgetIdCounter}`;
        const newWidget: WidgetConfig = {
          id,
          type,
          position: position ?? { x: 0, y: 0 },
          size: definition.defaultSize,
          settings: { ...definition.defaultSettings },
          lastUpdated: Date.now(),
          refreshInterval: definition.refreshable ? 60000 : 0,
          isVisible: true,
          isPinned: false,
        };

        set(state => ({ widgets: [...state.widgets, newWidget] }));
        return id;
      },

      removeWidget: (id) => {
        set(state => ({
          widgets: state.widgets.filter(w => w.id !== id),
        }));
      },

      updateWidget: (id, updates) => {
        set(state => ({
          widgets: state.widgets.map(w =>
            w.id === id ? { ...w, ...updates, lastUpdated: Date.now() } : w
          ),
        }));
      },

      moveWidget: (id, position) => {
        set(state => ({
          widgets: state.widgets.map(w =>
            w.id === id ? { ...w, position } : w
          ),
        }));
      },

      resizeWidget: (id, size) => {
        const widget = get().widgets.find(w => w.id === id);
        if (!widget) return;

        const definition = WIDGET_DEFINITIONS.find(d => d.type === widget.type);
        if (!definition || !definition.sizes.includes(size)) return;

        set(state => ({
          widgets: state.widgets.map(w =>
            w.id === id ? { ...w, size } : w
          ),
        }));
      },

      toggleEditMode: () => set(state => ({ editMode: !state.editMode })),
      setEditMode: (enabled) => set({ editMode: enabled }),

      duplicateWidget: (id) => {
        const widget = get().widgets.find(w => w.id === id);
        if (!widget) return null;

        const newId = `widget_${Date.now()}_${++widgetIdCounter}`;
        const newWidget: WidgetConfig = {
          ...widget,
          id: newId,
          position: {
            x: widget.position.x + 20,
            y: widget.position.y + 20,
          },
        };

        set(state => ({ widgets: [...state.widgets, newWidget] }));
        return newId;
      },

      resetLayout: () => set({ widgets: [], editMode: false }),

      exportLayout: () => {
        return JSON.stringify(get().widgets);
      },

      importLayout: (json) => {
        try {
          const widgets = JSON.parse(json) as WidgetConfig[];
          if (!Array.isArray(widgets)) return false;
          set({ widgets });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'dex-widgets',
      partialize: (state) => ({ widgets: state.widgets }),
    }
  )
);

// ============================================================================
// Widget Data Fetching Hook
// ============================================================================

interface UseWidgetDataOptions<T> {
  fetcher: () => Promise<T>;
  refreshInterval?: number;
  enabled?: boolean;
}

interface UseWidgetDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  lastUpdated: number | null;
}

export function useWidgetData<T>(
  options: UseWidgetDataOptions<T>
): UseWidgetDataResult<T> {
  const { fetcher, refreshInterval = 0, enabled = true } = options;
  
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetcherRef.current();
      setData(result);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      refresh();
    }
  }, [enabled, refresh]);

  // Auto refresh
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  return { data, isLoading, error, refresh, lastUpdated };
}

// ============================================================================
// Widget Grid Layout Helpers
// ============================================================================

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateGridPosition(
  widgets: WidgetConfig[],
  newSize: WidgetSize,
  gridCols: number = 6
): { x: number; y: number } {
  const dimensions = WIDGET_SIZES[newSize];
  const occupied = new Set<string>();

  // Mark occupied cells
  for (const widget of widgets) {
    const size = WIDGET_SIZES[widget.size];
    for (let x = widget.position.x; x < widget.position.x + size.cols; x++) {
      for (let y = widget.position.y; y < widget.position.y + size.rows; y++) {
        occupied.add(`${x},${y}`);
      }
    }
  }

  // Find first available position
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x <= gridCols - dimensions.cols; x++) {
      let fits = true;
      for (let dx = 0; dx < dimensions.cols && fits; dx++) {
        for (let dy = 0; dy < dimensions.rows && fits; dy++) {
          if (occupied.has(`${x + dx},${y + dy}`)) {
            fits = false;
          }
        }
      }
      if (fits) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: 0 };
}

export function checkCollision(
  widget: WidgetConfig,
  widgets: WidgetConfig[]
): boolean {
  const size = WIDGET_SIZES[widget.size];
  const widgetCells = new Set<string>();

  for (let x = widget.position.x; x < widget.position.x + size.cols; x++) {
    for (let y = widget.position.y; y < widget.position.y + size.rows; y++) {
      widgetCells.add(`${x},${y}`);
    }
  }

  for (const other of widgets) {
    if (other.id === widget.id) continue;
    
    const otherSize = WIDGET_SIZES[other.size];
    for (let x = other.position.x; x < other.position.x + otherSize.cols; x++) {
      for (let y = other.position.y; y < other.position.y + otherSize.rows; y++) {
        if (widgetCells.has(`${x},${y}`)) {
          return true;
        }
      }
    }
  }

  return false;
}

// ============================================================================
// Widget Animation Helpers
// ============================================================================

export function getWidgetEnterAnimation(index: number): React.CSSProperties {
  return {
    animation: `widgetEnter 0.3s ease-out ${index * 0.05}s both`,
  };
}

export function getWidgetExitAnimation(): React.CSSProperties {
  return {
    animation: 'widgetExit 0.2s ease-in forwards',
  };
}

// CSS keyframes should be defined in global styles:
// @keyframes widgetEnter { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
// @keyframes widgetExit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
