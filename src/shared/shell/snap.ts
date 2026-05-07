// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave G v4.0.1 - Shell window snap layouts, hot corners, multi-monitor zones.

export interface Rect { x: number; y: number; width: number; height: number }
export interface Display { id: string; bounds: Rect; workArea: Rect; scaleFactor: number }
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Edge = 'top' | 'bottom' | 'left' | 'right';

export type SnapPreset =
  | 'left-half' | 'right-half' | 'top-half' | 'bottom-half'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'left-third' | 'center-third' | 'right-third'
  | 'left-two-thirds' | 'right-two-thirds'
  | 'maximize' | 'center' | 'reset';

export function applySnap(workArea: Rect, preset: SnapPreset, originalSize?: { width: number; height: number }): Rect {
  const { x, y, width: w, height: h } = workArea;
  const half = (a: number) => Math.floor(a / 2);
  const third = (a: number) => Math.floor(a / 3);
  switch (preset) {
    case 'left-half': return { x, y, width: half(w), height: h };
    case 'right-half': return { x: x + half(w), y, width: w - half(w), height: h };
    case 'top-half': return { x, y, width: w, height: half(h) };
    case 'bottom-half': return { x, y: y + half(h), width: w, height: h - half(h) };
    case 'top-left': return { x, y, width: half(w), height: half(h) };
    case 'top-right': return { x: x + half(w), y, width: w - half(w), height: half(h) };
    case 'bottom-left': return { x, y: y + half(h), width: half(w), height: h - half(h) };
    case 'bottom-right': return { x: x + half(w), y: y + half(h), width: w - half(w), height: h - half(h) };
    case 'left-third': return { x, y, width: third(w), height: h };
    case 'center-third': return { x: x + third(w), y, width: third(w), height: h };
    case 'right-third': return { x: x + 2 * third(w), y, width: w - 2 * third(w), height: h };
    case 'left-two-thirds': return { x, y, width: 2 * third(w), height: h };
    case 'right-two-thirds': return { x: x + third(w), y, width: w - third(w), height: h };
    case 'maximize': return { x, y, width: w, height: h };
    case 'center': {
      const ow = originalSize?.width ?? Math.floor(w * 0.7);
      const oh = originalSize?.height ?? Math.floor(h * 0.7);
      return { x: x + Math.floor((w - ow) / 2), y: y + Math.floor((h - oh) / 2), width: ow, height: oh };
    }
    case 'reset': {
      const ow = originalSize?.width ?? Math.floor(w * 0.6);
      const oh = originalSize?.height ?? Math.floor(h * 0.6);
      return { x: x + Math.floor((w - ow) / 2), y: y + Math.floor((h - oh) / 2), width: ow, height: oh };
    }
  }
}

export function findDisplayContaining(displays: ReadonlyArray<Display>, point: { x: number; y: number }): Display | null {
  for (const d of displays) {
    if (point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width &&
        point.y >= d.bounds.y && point.y < d.bounds.y + d.bounds.height) return d;
  }
  return displays[0] ?? null;
}

export function detectHotCorner(point: { x: number; y: number }, display: Display, threshold: number = 4): Corner | null {
  const wa = display.workArea;
  const nearLeft = point.x - wa.x <= threshold;
  const nearRight = wa.x + wa.width - point.x <= threshold;
  const nearTop = point.y - wa.y <= threshold;
  const nearBottom = wa.y + wa.height - point.y <= threshold;
  if (nearTop && nearLeft) return 'top-left';
  if (nearTop && nearRight) return 'top-right';
  if (nearBottom && nearLeft) return 'bottom-left';
  if (nearBottom && nearRight) return 'bottom-right';
  return null;
}

export function detectSnapEdge(point: { x: number; y: number }, display: Display, threshold: number = 8): Edge | null {
  const wa = display.workArea;
  if (point.x - wa.x <= threshold) return 'left';
  if (wa.x + wa.width - point.x <= threshold) return 'right';
  if (point.y - wa.y <= threshold) return 'top';
  if (wa.y + wa.height - point.y <= threshold) return 'bottom';
  return null;
}

export function snapPresetForEdge(edge: Edge): SnapPreset {
  switch (edge) {
    case 'left': return 'left-half';
    case 'right': return 'right-half';
    case 'top': return 'maximize';
    case 'bottom': return 'bottom-half';
  }
}

export function snapPresetForCorner(corner: Corner): SnapPreset {
  return corner;
}

// ---------- Window stack / focus ring ----------

export interface WindowEntry { id: string; appId: string; zIndex: number; minimized: boolean; focused: boolean; lastFocusedAt: number }

export function nextFocusedWindow(stack: ReadonlyArray<WindowEntry>, direction: 'forward' | 'backward'): WindowEntry | null {
  const visible = stack.filter(w => !w.minimized).sort((a, b) =>
    direction === 'forward' ? b.lastFocusedAt - a.lastFocusedAt : a.lastFocusedAt - b.lastFocusedAt,
  );
  if (visible.length === 0) return null;
  const idx = visible.findIndex(w => w.focused);
  if (idx === -1) return visible[0];
  return visible[(idx + 1) % visible.length];
}

export function bringToFront(stack: ReadonlyArray<WindowEntry>, id: string, now: number): WindowEntry[] {
  const maxZ = stack.reduce((m, w) => Math.max(m, w.zIndex), 0);
  return stack.map(w => w.id === id
    ? { ...w, zIndex: maxZ + 1, focused: true, lastFocusedAt: now }
    : { ...w, focused: false });
}

// ---------- Spaces / virtual desktops ----------

export interface Space { id: string; name: string; windows: string[] }

export function moveWindowToSpace(spaces: ReadonlyArray<Space>, windowId: string, spaceId: string): Space[] {
  return spaces.map(s => {
    if (s.windows.includes(windowId) && s.id !== spaceId) return { ...s, windows: s.windows.filter(w => w !== windowId) };
    if (s.id === spaceId && !s.windows.includes(windowId)) return { ...s, windows: [...s.windows, windowId] };
    return s;
  });
}
