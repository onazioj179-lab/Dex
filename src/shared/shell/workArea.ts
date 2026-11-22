// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Desktop Work Area Manager (pure). One place that answers "where may a window
// go, and where may the Dock go", from:
//   - the screen (viewport) size and display scale,
//   - the top bar height (it is never covered by windows or the Dock),
//   - the Dock edge and the strip it keeps for itself,
//   - the user's workspace padding,
//   - the smallest size a window may have.
// Everything here is plain numbers in CSS px so it is unit-tested and shared by
// the window manager (drag, resize from every edge, maximize, snap, recovery
// after a display change) and the Dock.

import type { DockEdge } from './dockGeometry';
export type { DockEdge } from './dockGeometry';

export const isHorizontalDockEdge = (edge: DockEdge) => edge === 'top' || edge === 'bottom';

export interface Rect { x: number; y: number; w: number; h: number }

export interface WorkAreaInput {
  /** Viewport (DEX window client area) in CSS px. */
  viewport: { width: number; height: number };
  /** Height of the top bar (title + tab bar), CSS px. Never covered. */
  topBar: number;
  /** devicePixelRatio. Edges are snapped to whole device pixels. */
  scale?: number;
  dock: {
    edge: DockEdge;
    /** Strip the Dock keeps on its edge (0 = it only floats, e.g. hidden in fullscreen). */
    reserve: number;
    /** Gap between the Dock and the screen edge. */
    margin?: number;
  };
  /** User workspace padding around the work area. */
  padding?: number;
  /** Smallest window. On a display smaller than this the work area still has
   *  at least this size, anchored top-left, so windows stay usable. */
  minWindow?: { w: number; h: number };
}

export interface WorkArea {
  /** The whole screen. */
  screen: Rect;
  /** Screen minus the top bar: where shell surfaces may draw. */
  desktop: Rect;
  /** Where ordinary windows may be: desktop minus the Dock strip and padding. */
  windows: Rect;
  /** The longest the Dock may grow along its edge without leaving the desktop. */
  dockMaxLength: number;
  /** The Dock's strip on its edge. */
  dockBand: Rect;
}

const snap = (v: number, scale: number) => Math.round(v * scale) / scale;
const nonNeg = (v: number | undefined, d = 0) => (Number.isFinite(v as number) ? Math.max(0, v as number) : d);

export function computeWorkArea(input: WorkAreaInput): WorkArea {
  const scale = input.scale && input.scale > 0 ? input.scale : 1;
  const W = Math.max(0, input.viewport.width);
  const H = Math.max(0, input.viewport.height);
  const top = Math.min(nonNeg(input.topBar), H);
  const reserve = nonNeg(input.dock.reserve);
  const margin = nonNeg(input.dock.margin, 8);
  const pad = nonNeg(input.padding);
  const minW = Math.max(1, input.minWindow?.w ?? 320);
  const minH = Math.max(1, input.minWindow?.h ?? 220);

  const screen = { x: 0, y: 0, w: W, h: H };
  const desktop = { x: 0, y: top, w: W, h: Math.max(0, H - top) };

  let { x, y, w, h } = desktop;
  let dockBand: Rect;
  if (input.dock.edge === 'bottom') {
    dockBand = { x: 0, y: H - reserve, w: W, h: reserve };
    h -= reserve;
  } else if (input.dock.edge === 'top') {
    dockBand = { x: 0, y: top, w: W, h: reserve };
    y += reserve; h -= reserve;
  } else if (input.dock.edge === 'left') {
    dockBand = { x: 0, y: top, w: reserve, h: desktop.h };
    x += reserve; w -= reserve;
  } else {
    dockBand = { x: W - reserve, y: top, w: reserve, h: desktop.h };
    w -= reserve;
  }
  x += pad; y += pad; w -= pad * 2; h -= pad * 2;

  const windows = {
    x: snap(x, scale),
    y: snap(y, scale),
    w: snap(Math.max(minW, w), scale),
    h: snap(Math.max(minH, h), scale),
  };
  const edgeLength = isHorizontalDockEdge(input.dock.edge) ? W : desktop.h;
  return {
    screen,
    desktop,
    windows,
    dockMaxLength: Math.max(0, Math.floor(edgeLength - margin * 2)),
    dockBand,
  };
}

/** The same work area, in the coordinates of a surface whose top-left is at
 *  `origin` (windows are positioned inside the content surface). */
export function toLocal(r: Rect, origin: { x: number; y: number }): Rect {
  return { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h };
}

/**
 * Place the Dock along its edge: centred on `anchor` (the trigger's centre),
 * `length` long, but never past the desktop. Returns the start offset along
 * the edge (x for bottom, y for left/right) in viewport px.
 */
export function placeDock(area: WorkArea, edge: DockEdge, length: number, anchor: number, margin = 8): { start: number; length: number } {
  const len = Math.min(length, area.dockMaxLength);
  const lo = (isHorizontalDockEdge(edge) ? 0 : area.desktop.y) + margin;
  const hi = (isHorizontalDockEdge(edge) ? area.screen.w : area.desktop.y + area.desktop.h) - margin;
  const start = Math.min(Math.max(anchor - len / 2, lo), Math.max(lo, hi - len));
  return { start, length: len };
}

/**
 * Bring a window back into view after the display or the work area changed:
 * no bigger than the work area (but not below the minimum size), with its title
 * bar fully inside and at least `reveal` px of its width visible.
 */
export function recoverWindow(b: Rect, area: Rect, min: { w: number; h: number } = { w: 260, h: 220 }, reveal = 120): Rect {
  const w = Math.max(Math.min(b.w, area.w), Math.min(min.w, area.w));
  const h = Math.max(Math.min(b.h, area.h), Math.min(min.h, area.h));
  const showW = Math.min(reveal, w);
  const x = Math.min(Math.max(b.x, area.x - (w - showW)), area.x + area.w - showW);
  const y = Math.min(Math.max(b.y, area.y), area.y + area.h - Math.min(40, h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Place the Dock so the trigger (at `triggerOffset` from the Dock's start)
 * stays exactly where the collapsed button is (`anchor`): the Dock grows out of
 * the trigger. If that would cross the screen edge it slides just enough to fit.
 */
export function placeDockAroundTrigger(area: WorkArea, edge: DockEdge, length: number, triggerOffset: number, anchor: number, margin = 8): { start: number; length: number } {
  const len = Math.min(length, area.dockMaxLength);
  const lo = (isHorizontalDockEdge(edge) ? 0 : area.desktop.y) + margin;
  const hi = (isHorizontalDockEdge(edge) ? area.screen.w : area.desktop.y + area.desktop.h) - margin;
  const ideal = anchor - triggerOffset;
  return { start: Math.min(Math.max(ideal, lo), Math.max(lo, hi - len)), length: len };
}
