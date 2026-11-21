// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Spatial desktop state. The camera lives here; window geometry stays owned by
// AppManager (its floating-window map) and is mirrored into `windows` so the
// HUD, minimap, window list and groups can read it. AppManager registers a
// `host` so this store can move / focus / minimize real windows.
//
// Camera updates do NOT re-render AppManager: AppManager subscribes outside
// React and writes the world transform straight onto one element.
//

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { isReduceMotion } from '../utils/MotionController';
import {
  type Camera, type Rect, type ArrangeKind, type ZoomLimits, type Guide, type AlignKind,
  DEFAULT_LIMITS, HOME_CAMERA, sanitizeCamera, zoomAt, zoomToAt, panBy, fitRect,
  boundsOf, lerpCamera, easeOutCubic, arrange, viewRect, alignRects, distributeRects, fitZonesToWindows,
  presetZoneRects,
} from '../shell/spatial/spatialMath';

export interface SpatialWindow extends Rect {
  id: string;
  title: string;
  z: number;
  minimized: boolean;
  /** Hidden solely by its collapsed group. */
  groupHidden?: boolean;
}
export interface SpatialGroup { id: string; name: string; color: string; appIds: string[]; collapsed: boolean }

/** What AppManager lets the spatial layer do to real windows. */
export interface SpatialHost {
  focus(id: string): void;
  setBounds(updates: Record<string, Rect>): void;
  setMinimized(id: string, minimized: boolean): void;
  /** Move a window behind every other window. */
  sendToBack(id: string): void;
  /** Live size of the workspace surface in CSS px. */
  measure(): { w: number; h: number };
}

export const GROUP_COLORS = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF9F0A', '#64D2FF', '#8E8E93'];

/** A labelled region of the canvas (Work, Creative, ...). Windows inside move with it. */
export interface SpatialZone extends Rect { id: string; name: string; color: string }
/** A saved camera position. */
export interface SpatialView { id: string; name: string; camera: Camera }

export const PRESET_ZONES = ['Work', 'Creative', 'Development', 'Research', 'Communication', 'Entertainment'];

/** Rebindable spatial shortcuts: action -> KeyboardEvent.code (pressed with Ctrl/Cmd+Alt). */
export type SpatialAction = 'toggle' | 'zoomIn' | 'zoomOut' | 'actualSize' | 'fitAll' | 'focusFront'
  | 'back' | 'minimap' | 'windows' | 'groupInView' | 'saveView';
export const DEFAULT_BINDINGS: Record<SpatialAction, string> = {
  toggle: 'KeyS', zoomIn: 'Equal', zoomOut: 'Minus', actualSize: 'Digit0', fitAll: 'KeyF',
  focusFront: 'Enter', back: 'Backspace', minimap: 'KeyM', windows: 'KeyW', groupInView: 'KeyG', saveView: 'KeyV',
};
export const SPATIAL_ACTION_LABELS: Record<SpatialAction, string> = {
  toggle: 'Turn the spatial desktop on / off', zoomIn: 'Zoom in', zoomOut: 'Zoom out', actualSize: 'Actual size (100%)',
  fitAll: 'Show all windows', focusFront: 'Zoom to the front window', back: 'Previous view', minimap: 'Minimap',
  windows: 'Find a window', groupInView: 'Group the windows in view', saveView: 'Save this view',
};
/** Codes the shell already uses with Ctrl+Alt; they cannot be rebound to. */
export const RESERVED_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backquote', 'BracketLeft', 'BracketRight', 'KeyZ',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);

/** Portable layout file (export / import). */
export interface SpatialLayoutFile {
  kind: 'dex-spatial-layout'; version: 1;
  camera: Camera; layout: Record<string, Rect>; groups: SpatialGroup[]; zones: SpatialZone[]; views: SpatialView[];
}
const HISTORY_MAX = 20;

interface SpatialState {
  enabled: boolean;
  camera: Camera;
  limits: ZoomLimits;
  history: Camera[];
  minimap: boolean;
  snapGrid: boolean;
  groups: SpatialGroup[];
  /** Last world rect per app, so reopening an app returns it to its place. */
  layout: Record<string, Rect>;
  /** Positions before the last automatic arrangement (one-step undo). */
  undoArrange: Record<string, Rect> | null;
  /** Screen bounds before entering spatial mode (restored on exit). */
  preSpatial: Record<string, Rect> | null;
  zones: SpatialZone[];
  views: SpatialView[];
  /** Windows whose position and size are locked. */
  locked: string[];
  bindings: Record<SpatialAction, string>;
  // runtime only (not persisted)
  /** Alignment guides shown while dragging (world coordinates). */
  guides: Guide[];
  windows: Record<string, SpatialWindow>;
  viewport: { w: number; h: number };
  host: SpatialHost | null;

  setEnabled(on: boolean): void;
  setCamera(cam: Camera, opts?: { remember?: boolean; animate?: boolean }): void;
  zoomAtPoint(sx: number, sy: number, factor: number): void;
  zoomStep(dir: 1 | -1): void;
  setZoom(z: number): void;
  pan(dxScreen: number, dyScreen: number): void;
  fitAll(): void;
  focusWindow(id: string): void;
  back(): void;
  toggleMinimap(): void;
  setSnapGrid(on: boolean): void;
  setWindows(w: Record<string, SpatialWindow>): void;
  setViewport(w: number, h: number): void;
  registerHost(h: SpatialHost | null): void;
  rememberLayout(updates: Record<string, Rect>): void;
  setPreSpatial(b: Record<string, Rect> | null): void;
  arrangeWindows(kind: ArrangeKind, ids?: string[]): void;
  undoArrangement(): void;
  createGroup(name: string, appIds: string[]): string;
  renameGroup(id: string, name: string): void;
  setGroupColor(id: string, color: string): void;
  setGroupCollapsed(id: string, collapsed: boolean): void;
  expandGroupForWindow(id: string): void;
  removeFromGroups(appId: string): void;
  ungroup(id: string): void;
  focusGroup(id: string): void;
  moveGroup(id: string, dxWorld: number, dyWorld: number): void;
  alignWindows(ids: string[], kind: AlignKind): void;
  distributeWindows(ids: string[], axis: 'x' | 'y'): void;
  sendToBack(id: string): void;
  toggleLock(id: string): void;
  setGuides(g: Guide[]): void;
  createZone(name: string, rect?: Rect): string;
  createPresetZones(): void;
  renameZone(id: string, name: string): void;
  setZoneColor(id: string, color: string): void;
  setZoneRect(id: string, rect: Rect): void;
  deleteZone(id: string): void;
  focusZone(id: string): void;
  /** Windows whose centre lies inside a zone. */
  windowsInZone(id: string): string[];
  saveView(name?: string): string;
  goToView(id: string): void;
  renameView(id: string, name: string): void;
  deleteView(id: string): void;
  /** False when the code is reserved by the shell. */
  setBinding(action: SpatialAction, code: string): boolean;
  resetBindings(): void;
  exportLayout(): SpatialLayoutFile;
  /** Returns an error message, or null on success. */
  importLayout(data: unknown): string | null;
}

let anim = 0;
const ANIM_MS = 320; // "major workspace transition" band (280-420ms)

export const useSpatialStore = create<SpatialState>()(
  persist(
    (set, get) => {
      const commit = (cam: Camera, remember: boolean) => {
        const s = get();
        const next = sanitizeCamera(cam, s.limits);
        set({
          camera: next,
          history: remember ? [...s.history, s.camera].slice(-HISTORY_MAX) : s.history,
        });
      };
      const animateTo = (target: Camera, remember: boolean) => {
        cancelAnimationFrame(anim);
        const s = get();
        const from = s.camera;
        const to = sanitizeCamera(target, s.limits);
        if (remember) set({ history: [...s.history, from].slice(-HISTORY_MAX) });
        if (isReduceMotion() || typeof requestAnimationFrame === 'undefined') { set({ camera: to }); return; }
        const { w, h } = vp();
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ANIM_MS);
          set({ camera: t >= 1 ? to : lerpCamera(from, to, easeOutCubic(t), w, h) });
          if (t < 1) anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
      };
      // Always use the live surface size: a cached size can be stale (measured
      // before layout, or never updated while the window wasn't rendering).
      const vp = () => {
        const m = get().host?.measure();
        if (m && m.w > 0 && m.h > 0) { get().setViewport(m.w, m.h); return m; }
        return get().viewport;
      };
      const visibleWindows = () => Object.values(get().windows).filter((w) => !w.minimized);
      const groupBounds = (g: SpatialGroup) => boundsOf(g.appIds
        .map(id => get().windows[id])
        .filter(w => w && (!w.minimized || w.groupHidden)));

      return {
        enabled: false,
        camera: HOME_CAMERA,
        limits: DEFAULT_LIMITS,
        history: [],
        minimap: false, // off by default (owner): M or the HUD button shows it
        snapGrid: false,
        groups: [],
        layout: {},
        undoArrange: null,
        preSpatial: null,
        zones: [],
        views: [],
        locked: [],
        bindings: { ...DEFAULT_BINDINGS },
        guides: [],
        windows: {},
        viewport: { w: 1280, h: 720 },
        host: null,

        setEnabled: (on) => set({ enabled: on }),
        setCamera: (cam, opts) => (opts?.animate ? animateTo(cam, !!opts.remember) : commit(cam, !!opts?.remember)),
        zoomAtPoint: (sx, sy, factor) => { cancelAnimationFrame(anim); commit(zoomAt(get().camera, sx, sy, factor, get().limits), false); },
        zoomStep: (dir) => {
          const { camera } = get(); const viewport = vp();
          animateTo(zoomAt(camera, viewport.w / 2, viewport.h / 2, dir > 0 ? 1.25 : 0.8, get().limits), false);
        },
        setZoom: (z) => {
          const { camera } = get(); const viewport = vp();
          animateTo(zoomToAt(camera, viewport.w / 2, viewport.h / 2, z, get().limits), true);
        },
        pan: (dx, dy) => { cancelAnimationFrame(anim); commit(panBy(get().camera, dx, dy), false); },
        fitAll: () => {
          const b = boundsOf(visibleWindows());
          const viewport = vp();
          animateTo(b ? fitRect(b, viewport.w, viewport.h, 48, get().limits) : HOME_CAMERA, true);
        },
        focusWindow: (id) => {
          const w = get().windows[id];
          if (!w) return;
          get().expandGroupForWindow(id);
          if (w.minimized && !w.groupHidden) get().host?.setMinimized(id, false);
          get().host?.focus(id);
          const viewport = vp();
          animateTo(fitRect(w, viewport.w, viewport.h, 32, get().limits), true);
        },
        back: () => {
          const h = get().history;
          if (h.length === 0) return;
          set({ history: h.slice(0, -1) });
          animateTo(h[h.length - 1], false);
        },
        toggleMinimap: () => set({ minimap: !get().minimap }),
        setSnapGrid: (on) => set({ snapGrid: on }),
        // Zones follow their apps: refit on every window sync (no-op when
        // nothing moved, so it costs nothing at rest).
        setWindows: (windows) => {
          const zones = fitZonesToWindows(get().zones, Object.values(windows));
          set(zones === get().zones ? { windows } : { windows, zones });
        },
        setViewport: (w, h) => {
          if (!(w > 0 && h > 0)) return; // ignore pre-layout zero sizes
          const v = get().viewport;
          if (v.w !== w || v.h !== h) set({ viewport: { w, h } });
        },
        registerHost: (host) => set({ host }),
        rememberLayout: (updates) => set({ layout: { ...get().layout, ...updates } }),
        setPreSpatial: (b) => set({ preSpatial: b }),

        arrangeWindows: (kind, ids) => {
          const s = get();
          const wins = (ids ? ids.map((id) => s.windows[id]) : visibleWindows()).filter(Boolean)
            .sort((a, b) => a.y - b.y || a.x - b.x);
          if (wins.length === 0 || !s.host) return;
          const before: Record<string, Rect> = {};
          for (const w of wins) before[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h };
          const view = vp();
          const v = viewRect(s.camera, view.w, view.h);
          const origin = boundsOf(wins) ?? { x: v.x + 40, y: v.y + 40 };
          const next = arrange(kind, wins, { x: Math.round(origin.x), y: Math.round(origin.y) });
          set({ undoArrange: before });
          s.host.setBounds(next);
          get().rememberLayout(next);
          const b = boundsOf(Object.values(next));
          if (b) animateTo(fitRect(b, view.w, view.h, 48, s.limits), true);
        },
        undoArrangement: () => {
          const s = get();
          if (!s.undoArrange || !s.host) return;
          s.host.setBounds(s.undoArrange);
          get().rememberLayout(s.undoArrange);
          set({ undoArrange: null });
        },

        createGroup: (name, appIds) => {
          const id = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const members = [...new Set(appIds)];
          // A window belongs to at most one group.
          const groups = get().groups
            .map((g) => ({ ...g, appIds: g.appIds.filter((a) => !members.includes(a)) }))
            .filter((g) => g.appIds.length > 0);
          const color = GROUP_COLORS[get().groups.length % GROUP_COLORS.length];
          set({ groups: [...groups, { id, name: name.trim() || 'Group', color, appIds: members, collapsed: false }] });
          return id;
        },
        renameGroup: (id, name) => set({ groups: get().groups.map((g) => (g.id === id && name.trim() ? { ...g, name: name.trim() } : g)) }),
        setGroupColor: (id, color) => set({ groups: get().groups.map((g) => (g.id === id ? { ...g, color } : g)) }),
        setGroupCollapsed: (id, collapsed) => {
          const { groups } = get();
          if (!groups.some(g => g.id === id && g.collapsed !== collapsed)) return;
          set({ groups: groups.map(g => g.id === id ? { ...g, collapsed } : g) });
        },
        expandGroupForWindow: (id) => {
          const { groups } = get();
          const containsHiddenWindow = (g: SpatialGroup) => g.collapsed && g.appIds.includes(id);
          if (!groups.some(containsHiddenWindow)) return;
          set({ groups: groups.map(g => containsHiddenWindow(g) ? { ...g, collapsed: false } : g) });
        },
        removeFromGroups: (appId) => set({
          groups: get().groups.map((g) => ({ ...g, appIds: g.appIds.filter((a) => a !== appId) })).filter((g) => g.appIds.length > 0),
        }),
        ungroup: (id) => set({ groups: get().groups.filter((g) => g.id !== id) }),
        focusGroup: (id) => {
          const g = get().groups.find((x) => x.id === id);
          if (!g) return;
          if (g.collapsed) get().setGroupCollapsed(id, false);
          const b = groupBounds(g);
          const viewport = vp();
          if (b) animateTo(fitRect(b, viewport.w, viewport.h, 48, get().limits), true);
        },
        moveGroup: (id, dx, dy) => {
          const s = get();
          const g = s.groups.find((x) => x.id === id);
          if (!g || !s.host) return;
          const updates: Record<string, Rect> = {};
          for (const a of g.appIds) {
            const w = s.windows[a];
            if (w) updates[a] = { x: Math.round(w.x + dx), y: Math.round(w.y + dy), w: w.w, h: w.h };
          }
          s.host.setBounds(updates);
          get().rememberLayout(updates);
        },

        alignWindows: (ids, kind) => {
          const s = get();
          const items = ids.map((id) => s.windows[id]).filter(Boolean);
          if (items.length < 2 || !s.host) return;
          set({ undoArrange: Object.fromEntries(items.map((w) => [w.id, { x: w.x, y: w.y, w: w.w, h: w.h }])) });
          const next = alignRects(items, kind);
          s.host.setBounds(next);
          get().rememberLayout(next);
        },
        distributeWindows: (ids, axis) => {
          const s = get();
          const items = ids.map((id) => s.windows[id]).filter(Boolean);
          if (items.length < 3 || !s.host) return;
          set({ undoArrange: Object.fromEntries(items.map((w) => [w.id, { x: w.x, y: w.y, w: w.w, h: w.h }])) });
          const next = distributeRects(items, axis);
          s.host.setBounds(next);
          get().rememberLayout(next);
        },
        sendToBack: (id) => get().host?.sendToBack(id),
        toggleLock: (id) => {
          const l = get().locked;
          set({ locked: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] });
        },
        setGuides: (g) => { if (g.length || get().guides.length) set({ guides: g }); },

        createZone: (name, rect) => {
          const s = get();
          let r = rect;
          if (!r) {
            const view = vp();
            const v = viewRect(s.camera, view.w, view.h);
            const m = 40 / s.camera.z;
            r = { x: Math.round(v.x + m), y: Math.round(v.y + m), w: Math.round(v.w - 2 * m), h: Math.round(v.h - 2 * m) };
          }
          const id = `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          set({ zones: [...s.zones, { id, name: name.trim() || 'Zone', color: GROUP_COLORS[s.zones.length % GROUP_COLORS.length], ...r }] });
          return id;
        },
        createPresetZones: () => {
          const s = get();
          const existing = new Set(s.zones.map((z) => z.name));
          const names = PRESET_ZONES.filter((n) => !existing.has(n));
          if (!names.length) return;
          const occupied = boundsOf([...Object.values(s.windows), ...s.zones]);
          const origin = occupied ? { x: occupied.x, y: occupied.y + occupied.h + 400 } : { x: 0, y: 0 };
          const rects = presetZoneRects(names.length, origin);
          const zones = names.map((name, i) => ({
            id: `zone-${Date.now().toString(36)}-${i}`, name, color: GROUP_COLORS[(s.zones.length + i) % GROUP_COLORS.length], ...rects[i],
          }));
          set({ zones: [...s.zones, ...zones] });
          const b = boundsOf(zones);
          const view = vp();
          if (b) animateTo(fitRect(b, view.w, view.h, 48, s.limits), true);
        },
        renameZone: (id, name) => set({ zones: get().zones.map((z) => (z.id === id && name.trim() ? { ...z, name: name.trim() } : z)) }),
        setZoneColor: (id, color) => set({ zones: get().zones.map((z) => (z.id === id ? { ...z, color } : z)) }),
        setZoneRect: (id, rect) => set({ zones: get().zones.map((z) => (z.id === id ? { ...z, ...rect } : z)) }),
        deleteZone: (id) => set({ zones: get().zones.filter((z) => z.id !== id) }),
        focusZone: (id) => {
          const z = get().zones.find((x) => x.id === id);
          const view = vp();
          if (z) animateTo(fitRect(z, view.w, view.h, 32, get().limits), true);
        },
        windowsInZone: (id) => {
          const z = get().zones.find((x) => x.id === id);
          if (!z) return [];
          return Object.values(get().windows).filter((w) => {
            const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
            return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
          }).map((w) => w.id);
        },

        saveView: (name) => {
          const s = get();
          const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          set({ views: [...s.views, { id, name: (name || '').trim() || `View ${s.views.length + 1}`, camera: { ...s.camera } }] });
          return id;
        },
        goToView: (id) => { const v = get().views.find((x) => x.id === id); if (v) animateTo(v.camera, true); },
        renameView: (id, name) => set({ views: get().views.map((v) => (v.id === id && name.trim() ? { ...v, name: name.trim() } : v)) }),
        deleteView: (id) => set({ views: get().views.filter((v) => v.id !== id) }),

        setBinding: (action, code) => {
          if (!code || RESERVED_CODES.has(code)) return false;
          const b = { ...get().bindings };
          // One key per action: an action already on this key takes the old key.
          const clash = (Object.keys(b) as SpatialAction[]).find((a) => a !== action && b[a] === code);
          if (clash) b[clash] = b[action];
          b[action] = code;
          set({ bindings: b });
          return true;
        },
        resetBindings: () => set({ bindings: { ...DEFAULT_BINDINGS } }),

        exportLayout: () => {
          const s = get();
          const layout: Record<string, Rect> = { ...s.layout };
          for (const w of Object.values(s.windows)) layout[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h };
          return { kind: 'dex-spatial-layout', version: 1, camera: s.camera, layout, groups: s.groups, zones: s.zones, views: s.views };
        },
        importLayout: (data) => {
          const d = data as Partial<SpatialLayoutFile> | null;
          if (!d || typeof d !== 'object' || d.kind !== 'dex-spatial-layout') return 'This is not a DEX spatial layout file.';
          if (d.version !== 1) return `Unsupported layout version: ${String(d.version)}.`;
          const clean = sanitizeLayoutData(d);
          set({ camera: clean.camera, layout: { ...get().layout, ...clean.layout }, groups: clean.groups, zones: clean.zones, views: clean.views });
          const s = get();
          const open = Object.fromEntries(Object.entries(clean.layout).filter(([id]) => s.windows[id]));
          if (s.host && Object.keys(open).length) s.host.setBounds(open);
          return null;
        },
      };
    },
    {
      name: 'dex-spatial-v1',
      // v2: the minimap is opt-in (it was the always-on square in the corner).
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>;
        return (version < 2 ? { ...p, minimap: false } : p) as unknown as SpatialState;
      },
      storage: debouncedJsonStorage,
      partialize: (s) => ({
        enabled: s.enabled, camera: s.camera, minimap: s.minimap, snapGrid: s.snapGrid,
        groups: s.groups, layout: s.layout, preSpatial: s.preSpatial,
        zones: s.zones, views: s.views, locked: s.locked, bindings: s.bindings,
      }),
      // Corrupt or hand-edited state must never break the desktop: repair it.
      merge: (persisted, current) => {
        const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<SpatialState>;
        const clean = sanitizeLayoutData(p);
        const bindings = { ...DEFAULT_BINDINGS };
        if (p.bindings && typeof p.bindings === 'object') {
          for (const [a, code] of Object.entries(p.bindings)) {
            if (a in bindings && typeof code === 'string' && !RESERVED_CODES.has(code)) bindings[a as SpatialAction] = code;
          }
        }
        return {
          ...current,
          enabled: p.enabled === true,
          camera: sanitizeCamera(p.camera, current.limits),
          // Starts hidden every session; the persisted flag used to bring the
          // box back on each launch.
          minimap: false,
          snapGrid: p.snapGrid === true,
          groups: clean.groups,
          layout: clean.layout,
          preSpatial: p.preSpatial ? rectMap(p.preSpatial) : null,
          zones: clean.zones,
          views: clean.views,
          locked: Array.isArray(p.locked) ? p.locked.filter((x): x is string => typeof x === 'string') : [],
          bindings,
        };
      },
    },
  ),
);

// Persist can validate rectangles synchronously while the store initializes.
function okRect(r: unknown): r is Rect {
  return !!r && typeof r === 'object'
    && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((r as Record<string, number>)[k]));
}
function rectMap(o: unknown): Record<string, Rect> {
  return Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, r]) => okRect(r))) as Record<string, Rect>;
}

/** Validate stored or imported layout data; anything malformed is dropped, never thrown. */
export function sanitizeLayoutData(p: Partial<{ camera: unknown; layout: unknown; groups: unknown; zones: unknown; views: unknown }>) {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Array<Record<string, unknown>>;
  return {
    camera: sanitizeCamera(p.camera),
    layout: rectMap(p.layout),
    groups: arr(p.groups).filter((g) => g && typeof g.id === 'string' && Array.isArray(g.appIds))
      .map((g) => ({ id: g.id as string, name: String(g.name || 'Group'), color: String(g.color || GROUP_COLORS[0]), appIds: (g.appIds as unknown[]).filter((a): a is string => typeof a === 'string'), collapsed: !!g.collapsed })),
    zones: arr(p.zones).filter((z) => z && typeof z.id === 'string' && okRect(z))
      .map((z) => ({ id: z.id as string, name: String(z.name || 'Zone'), color: String(z.color || GROUP_COLORS[0]), x: z.x as number, y: z.y as number, w: Math.max(200, z.w as number), h: Math.max(150, z.h as number) })),
    views: arr(p.views).filter((v) => v && typeof v.id === 'string' && !!v.camera && typeof v.camera === 'object')
      .map((v) => ({ id: v.id as string, name: String(v.name || 'View'), camera: sanitizeCamera(v.camera) })),
  };
}

/** Pointer-delta scale for window drags: screen px -> world px. */
export function spatialDeltaScale(): number {
  const s = useSpatialStore.getState();
  return s.enabled ? 1 / s.camera.z : 1;
}

export const isSpatialEnabled = () => useSpatialStore.getState().enabled;

export const isWindowLocked = (id: string) => useSpatialStore.getState().locked.includes(id);
