/**
 * DEX Window Manager
 * Window snapping, tiling, and split-view management
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'full' | 'center' | 'none';

export interface WindowLayout {
  id: string;
  name: string;
  description: string;
  zones: LayoutZone[];
  icon: string;
}

export interface LayoutZone {
  appId: string | null;
  x: number; // percentage 0-100
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  appId: string;
  zone: SnapZone;
  zIndex: number;
  isMaximized: boolean;
  customBounds?: { x: number; y: number; width: number; height: number };
}

export interface WindowManagerState {
  windows: WindowState[];
  activeLayout: string | null;
  savedLayouts: WindowLayout[];
}

// ============================================================================
// PRESET LAYOUTS
// ============================================================================

export const PRESET_LAYOUTS: WindowLayout[] = [
  {
    id: 'split-half',
    name: 'Split View',
    description: 'Two apps side by side',
    icon: '||',
    zones: [
      { appId: null, x: 0, y: 0, width: 50, height: 100 },
      { appId: null, x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  {
    id: 'split-thirds',
    name: 'Three Columns',
    description: 'Three equal columns',
    icon: '|||',
    zones: [
      { appId: null, x: 0, y: 0, width: 33.33, height: 100 },
      { appId: null, x: 33.33, y: 0, width: 33.34, height: 100 },
      { appId: null, x: 66.67, y: 0, width: 33.33, height: 100 },
    ],
  },
  {
    id: 'main-sidebar',
    name: 'Main + Sidebar',
    description: 'Large main area with sidebar',
    icon: '|.',
    zones: [
      { appId: null, x: 0, y: 0, width: 70, height: 100 },
      { appId: null, x: 70, y: 0, width: 30, height: 100 },
    ],
  },
  {
    id: 'grid-4',
    name: 'Grid (2x2)',
    description: 'Four equal quadrants',
    icon: '##',
    zones: [
      { appId: null, x: 0, y: 0, width: 50, height: 50 },
      { appId: null, x: 50, y: 0, width: 50, height: 50 },
      { appId: null, x: 0, y: 50, width: 50, height: 50 },
      { appId: null, x: 50, y: 50, width: 50, height: 50 },
    ],
  },
  {
    id: 'main-stack',
    name: 'Main + Stack',
    description: 'Main area with two stacked panels',
    icon: '|:',
    zones: [
      { appId: null, x: 0, y: 0, width: 60, height: 100 },
      { appId: null, x: 60, y: 0, width: 40, height: 50 },
      { appId: null, x: 60, y: 50, width: 40, height: 50 },
    ],
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'Single centered window',
    icon: '[ ]',
    zones: [
      { appId: null, x: 10, y: 5, width: 80, height: 90 },
    ],
  },
];

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-window-manager';

export function loadWindowManager(): WindowManagerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { windows: [], activeLayout: null, savedLayouts: [] };
}

export function saveWindowManager(state: WindowManagerState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ============================================================================
// SNAP ZONE CALCULATIONS
// ============================================================================

export function getSnapZoneBounds(zone: SnapZone): { x: number; y: number; width: number; height: number } {
  switch (zone) {
    case 'left': return { x: 0, y: 0, width: 50, height: 100 };
    case 'right': return { x: 50, y: 0, width: 50, height: 100 };
    case 'top-left': return { x: 0, y: 0, width: 50, height: 50 };
    case 'top-right': return { x: 50, y: 0, width: 50, height: 50 };
    case 'bottom-left': return { x: 0, y: 50, width: 50, height: 50 };
    case 'bottom-right': return { x: 50, y: 50, width: 50, height: 50 };
    case 'full': return { x: 0, y: 0, width: 100, height: 100 };
    case 'center': return { x: 15, y: 10, width: 70, height: 80 };
    default: return { x: 0, y: 0, width: 100, height: 100 };
  }
}

export function detectSnapZone(x: number, y: number, containerWidth: number, containerHeight: number): SnapZone {
  const relX = x / containerWidth;
  const relY = y / containerHeight;
  const edgeThreshold = 0.05;

  if (relX < edgeThreshold) {
    if (relY < 0.5) return 'top-left';
    return 'bottom-left';
  }
  if (relX > (1 - edgeThreshold)) {
    if (relY < 0.5) return 'top-right';
    return 'bottom-right';
  }
  if (relX < 0.3) return 'left';
  if (relX > 0.7) return 'right';
  return 'none';
}

// ============================================================================
// WINDOW MANAGER HOOK
// ============================================================================

export function useWindowManager() {
  const [state, setState] = useState<WindowManagerState>(loadWindowManager);

  const snapWindow = useCallback((appId: string, zone: SnapZone) => {
    setState(prev => {
      const windows = prev.windows.filter(w => w.appId !== appId);
      const maxZ = windows.reduce((max, w) => Math.max(max, w.zIndex), 0);
      windows.push({ appId, zone, zIndex: maxZ + 1, isMaximized: zone === 'full' });
      const next = { ...prev, windows };
      saveWindowManager(next);
      return next;
    });
  }, []);

  const unsnap = useCallback((appId: string) => {
    setState(prev => {
      const next = { ...prev, windows: prev.windows.filter(w => w.appId !== appId) };
      saveWindowManager(next);
      return next;
    });
  }, []);

  const applyLayout = useCallback((layoutId: string, appIds: string[]) => {
    const layout = [...PRESET_LAYOUTS, ...state.savedLayouts].find(l => l.id === layoutId);
    if (!layout) return;
    setState(prev => {
      const windows: WindowState[] = layout.zones.map((zone, i) => ({
        appId: appIds[i] || '',
        zone: 'none' as SnapZone,
        zIndex: i + 1,
        isMaximized: false,
        customBounds: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      })).filter(w => w.appId);
      const next = { ...prev, windows, activeLayout: layoutId };
      saveWindowManager(next);
      return next;
    });
  }, [state.savedLayouts]);

  const saveLayout = useCallback((layout: WindowLayout) => {
    setState(prev => {
      const savedLayouts = [...prev.savedLayouts.filter(l => l.id !== layout.id), layout];
      const next = { ...prev, savedLayouts };
      saveWindowManager(next);
      return next;
    });
  }, []);

  const bringToFront = useCallback((appId: string) => {
    setState(prev => {
      const maxZ = prev.windows.reduce((max, w) => Math.max(max, w.zIndex), 0);
      const windows = prev.windows.map(w => w.appId === appId ? { ...w, zIndex: maxZ + 1 } : w);
      return { ...prev, windows };
    });
  }, []);

  return { state, snapWindow, unsnap, applyLayout, saveLayout, bringToFront };
}

// ============================================================================
// LAYOUT PICKER COMPONENT
// ============================================================================

export const LayoutPicker: React.FC<{
  onSelect: (layoutId: string) => void;
  activeLayout?: string | null;
  customLayouts?: WindowLayout[];
}> = memo(({ onSelect, activeLayout, customLayouts }) => {
  const allLayouts = useMemo(() => [...PRESET_LAYOUTS, ...(customLayouts || [])], [customLayouts]);

  return (
    <div style={styles.layoutGrid} role="listbox" aria-label="Window layouts">
      {allLayouts.map(layout => (
        <button
          key={layout.id}
          onClick={() => onSelect(layout.id)}
          style={{ ...styles.layoutCard, ...(activeLayout === layout.id ? styles.layoutCardActive : {}) }}
          role="option"
          aria-selected={activeLayout === layout.id}
          aria-label={`${layout.name}: ${layout.description}`}
          title={layout.description}
        >
          <div style={styles.layoutPreview}>
            {layout.zones.map((zone, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.width}%`,
                  height: `${zone.height}%`,
                  background: activeLayout === layout.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 2,
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
          <span style={styles.layoutName}>{layout.name}</span>
        </button>
      ))}
    </div>
  );
});

LayoutPicker.displayName = 'LayoutPicker';

// ============================================================================
// SNAP ZONE INDICATOR (shows when dragging)
// ============================================================================

export const SnapZoneIndicator: React.FC<{ zone: SnapZone; visible: boolean }> = memo(({ zone, visible }) => {
  if (!visible || zone === 'none') return null;
  const bounds = getSnapZoneBounds(zone);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${bounds.x}%`,
        top: `${bounds.y}%`,
        width: `${bounds.width}%`,
        height: `${bounds.height}%`,
        background: 'rgba(59,130,246,0.15)',
        border: '2px solid rgba(59,130,246,0.4)',
        borderRadius: 12,
        pointerEvents: 'none',
        transition: 'all 0.2s ease',
        zIndex: 99998,
      }}
      aria-hidden="true"
    />
  );
});

SnapZoneIndicator.displayName = 'SnapZoneIndicator';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  layoutGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  layoutCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: 10, borderRadius: 10, border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
    background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.15s',
  },
  layoutCardActive: { background: 'rgba(59,130,246,0.1)', borderColor: '#3b82f6' },
  layoutPreview: { width: 60, height: 40, position: 'relative', borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' },
  layoutName: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)' },
};

export default { useWindowManager, LayoutPicker, SnapZoneIndicator, PRESET_LAYOUTS };
