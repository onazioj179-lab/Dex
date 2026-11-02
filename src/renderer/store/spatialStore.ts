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
  type Camera, type Rect, type ArrangeKind, type ZoomLimits,
  DEFAULT_LIMITS, HOME_CAMERA, sanitizeCamera, zoomAt, zoomToAt, panBy, fitRect,
  boundsOf, lerpCamera, easeOutCubic, arrange, viewRect,
} from '../shell/spatial/spatialMath';

export interface SpatialWindow extends Rect { id: string; title: string; z: number; minimized: boolean }
export interface SpatialGroup { id: string; name: string; color: string; appIds: string[]; collapsed: boolean }

/** What AppManager lets the spatial layer do to real windows. */
export interface SpatialHost {
  focus(id: string): void;
  setBounds(updates: Record<string, Rect>): void;
  setMinimized(id: string, minimized: boolean): void;
  /** Live size of the workspace surface in CSS px. */
  measure(): { w: number; h: number };
}

export const GROUP_COLORS = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF9F0A', '#64D2FF', '#8E8E93'];
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
  // runtime only (not persisted)
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
  removeFromGroups(appId: string): void;
  ungroup(id: string): void;
  focusGroup(id: string): void;
  moveGroup(id: string, dxWorld: number, dyWorld: number): void;
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
      const groupBounds = (g: SpatialGroup) => boundsOf(g.appIds.map((id) => get().windows[id]).filter(Boolean));

      return {
        enabled: false,
        camera: HOME_CAMERA,
        limits: DEFAULT_LIMITS,
        history: [],
        minimap: true,
        snapGrid: false,
        groups: [],
        layout: {},
        undoArrange: null,
        preSpatial: null,
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
          if (w.minimized) get().host?.setMinimized(id, false);
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
        setWindows: (windows) => set({ windows }),
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
          const g = get().groups.find((x) => x.id === id);
          if (!g) return;
          for (const a of g.appIds) get().host?.setMinimized(a, collapsed);
          set({ groups: get().groups.map((x) => (x.id === id ? { ...x, collapsed } : x)) });
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
      };
    },
    {
      name: 'dex-spatial-v1',
      version: 1,
      storage: debouncedJsonStorage,
      partialize: (s) => ({
        enabled: s.enabled, camera: s.camera, minimap: s.minimap, snapGrid: s.snapGrid,
        groups: s.groups, layout: s.layout, preSpatial: s.preSpatial,
      }),
      // Corrupt or hand-edited state must never break the desktop: repair it.
      merge: (persisted, current) => {
        const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<SpatialState>;
        const okRect = (r: unknown): r is Rect => !!r && typeof r === 'object'
          && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((r as Record<string, number>)[k]));
        const rects = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, r]) => okRect(r))) as Record<string, Rect>;
        return {
          ...current,
          enabled: p.enabled === true,
          camera: sanitizeCamera(p.camera, current.limits),
          minimap: p.minimap !== false,
          snapGrid: p.snapGrid === true,
          groups: Array.isArray(p.groups)
            ? p.groups.filter((g) => g && typeof g.id === 'string' && Array.isArray(g.appIds))
              .map((g) => ({ id: g.id, name: String(g.name || 'Group'), color: String(g.color || GROUP_COLORS[0]), appIds: g.appIds.filter((a) => typeof a === 'string'), collapsed: !!g.collapsed }))
            : [],
          layout: rects(p.layout),
          preSpatial: p.preSpatial ? rects(p.preSpatial) : null,
        };
      },
    },
  ),
);

/** Pointer-delta scale for window drags: screen px -> world px. */
export function spatialDeltaScale(): number {
  const s = useSpatialStore.getState();
  return s.enabled ? 1 / s.camera.z : 1;
}

export const isSpatialEnabled = () => useSpatialStore.getState().enabled;
