// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Persistent custom snap zones for the DEX window manager
 * (DEX_FEATURE_BACKLOG 01 · the last open window-management gap).
 *
 * A FancyZones-style model: a `ZoneLayout` is a named set of RELATIVE rectangles
 * (each in [0,1] of the work area) that the user authors in the visual Zone
 * Editor and saves. Two authoring kinds are supported — `grid` (relative cells,
 * non-overlapping) and `canvas` (free-form, may overlap) — but both reduce to the
 * same list of `RelZone`s, so all downstream geometry is one code path.
 *
 * Everything here is PURE geometry (no DOM / React / storage) so it is fully
 * unit-testable; the renderer store persists layouts and AppManager maps the
 * absolute bounds these functions return onto its detached windows. This is the
 * persisted zone state that snap-to-zone, expand-across-zones and
 * cycle-within-zone all build on.
 */

import type { WindowBounds } from './windowLayout';

/** A zone as a relative rectangle within the work area (all values in [0,1]). */
export interface RelZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneLayoutKind = 'grid' | 'canvas';

/** A named, savable set of zones (a FancyZones-style "layout"). */
export interface ZoneLayout {
  id: string;
  name: string;
  kind: ZoneLayoutKind;
  zones: RelZone[];
}

/** Direction for expand-across-zones (keyboard grammar). */
export type ExpandDir = 'left' | 'right' | 'up' | 'down';

interface RelRect { x: number; y: number; w: number; h: number; }

const EPS = 0.001;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Clamp a zone into the unit square with a minimum visible size, so a degenerate
 * or off-canvas zone authored in the editor can never produce a zero/negative or
 * out-of-bounds tile.
 */
export function normalizeZone(z: RelZone, minSize = 0.05): RelZone {
  const x = clamp01(z.x);
  const y = clamp01(z.y);
  const w = Math.min(1 - x, Math.max(minSize, clamp01(z.w)));
  const h = Math.min(1 - y, Math.max(minSize, clamp01(z.h)));
  return { id: z.id, x, y, w, h };
}

/** Drop empty/degenerate zones and normalize the rest. */
export function validateZones(zones: RelZone[], minSize = 0.05): RelZone[] {
  return zones
    .filter(z => Number.isFinite(z.w) && Number.isFinite(z.h) && z.w > 0 && z.h > 0)
    .map(z => normalizeZone(z, minSize));
}

/**
 * Convert a relative rect to absolute window bounds inside `workspace`, inset by
 * `gap` on all sides (so adjacent zones get a 2*gap gutter, matching the tiling
 * engine's feel). Rounds to whole pixels and guards a positive size.
 */
function relToBounds(r: RelRect, workspace: WindowBounds, gap: number): WindowBounds {
  const x = workspace.x + r.x * workspace.w + gap;
  const y = workspace.y + r.y * workspace.h + gap;
  const w = Math.max(1, r.w * workspace.w - gap * 2);
  const h = Math.max(1, r.h * workspace.h - gap * 2);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Absolute bounds for one zone. */
export function zoneToBounds(zone: RelZone, workspace: WindowBounds, gap = 6): WindowBounds {
  return relToBounds(zone, workspace, gap);
}

/** Absolute bounds for every zone in a layout (parallel to `layout.zones`). */
export function layoutBounds(layout: ZoneLayout, workspace: WindowBounds, gap = 6): WindowBounds[] {
  return layout.zones.map(z => relToBounds(z, workspace, gap));
}

/** Center of a zone in absolute pixels. */
function zoneCenter(z: RelZone, ws: WindowBounds): { cx: number; cy: number } {
  return { cx: ws.x + (z.x + z.w / 2) * ws.w, cy: ws.y + (z.y + z.h / 2) * ws.h };
}

/**
 * Hit-test a point against a layout, returning the zone under it (the LAST match
 * wins, so a free-form zone drawn on top of another is selected). Tests the raw
 * relative rect (no gap inset) so the whole work area is covered with no dead
 * gutters — this is what drag-to-zone snapping uses.
 */
export function zoneAtPoint(
  layout: ZoneLayout,
  workspace: WindowBounds,
  px: number,
  py: number,
): RelZone | null {
  const rx = workspace.w > 0 ? (px - workspace.x) / workspace.w : 0;
  const ry = workspace.h > 0 ? (py - workspace.y) / workspace.h : 0;
  let hit: RelZone | null = null;
  for (const z of layout.zones) {
    if (rx >= z.x && rx <= z.x + z.w && ry >= z.y && ry <= z.y + z.h) hit = z;
  }
  return hit;
}

/**
 * Which zones a window currently occupies: those whose center lies inside the
 * window rect (small tolerance). A window snapped to one zone covers exactly it;
 * a window expanded across a union of zones covers all of them.
 */
export function coveredZoneIds(
  rect: WindowBounds,
  layout: ZoneLayout,
  workspace: WindowBounds,
  tolerance = 4,
): string[] {
  const out: string[] = [];
  for (const z of layout.zones) {
    const { cx, cy } = zoneCenter(z, workspace);
    if (
      cx >= rect.x - tolerance &&
      cx <= rect.x + rect.w + tolerance &&
      cy >= rect.y - tolerance &&
      cy <= rect.y + rect.h + tolerance
    ) {
      out.push(z.id);
    }
  }
  return out;
}

function unionRel(zones: RelZone[]): RelRect {
  const x = Math.min(...zones.map(z => z.x));
  const y = Math.min(...zones.map(z => z.y));
  const x2 = Math.max(...zones.map(z => z.x + z.w));
  const y2 = Math.max(...zones.map(z => z.y + z.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Overlap length of two 1-D intervals [a0,a1] and [b0,b1] (>=0). */
function overlap1D(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Expand-across-zones (FancyZones keyboard grammar): grow the focused window from
 * the zone(s) it currently covers to also include the adjacent zone(s) in `dir`,
 * returning the bounding union as absolute bounds.
 *
 * - If the window covers no zone yet, it snaps to the nearest single zone first
 *   (so the first keypress "enters" the zone grid).
 * - If there is no further zone in `dir`, returns null (nothing to expand into).
 *
 * Neighbours are the nearest band of not-yet-covered zones whose leading edge sits
 * past the covered union's edge in `dir` and which overlap the union on the
 * perpendicular axis — so expansion follows the visible layout, not index order.
 */
export function expandAcross(
  rect: WindowBounds,
  layout: ZoneLayout,
  workspace: WindowBounds,
  dir: ExpandDir,
  gap = 6,
): WindowBounds | null {
  if (layout.zones.length === 0) return null;
  const coveredIds = new Set(coveredZoneIds(rect, layout, workspace));
  let covered = layout.zones.filter(z => coveredIds.has(z.id));

  if (covered.length === 0) {
    // Not in the grid yet — snap to the zone whose center is nearest the window.
    const rcx = rect.x + rect.w / 2;
    const rcy = rect.y + rect.h / 2;
    let best: RelZone | null = null;
    let bestD = Infinity;
    for (const z of layout.zones) {
      const { cx, cy } = zoneCenter(z, workspace);
      const d = (cx - rcx) ** 2 + (cy - rcy) ** 2;
      if (d < bestD) { bestD = d; best = z; }
    }
    return best ? relToBounds(best, workspace, gap) : null;
  }

  const u = unionRel(covered);
  const horizontal = dir === 'left' || dir === 'right';

  const candidates = layout.zones.filter(z => {
    if (coveredIds.has(z.id)) return false;
    // Perpendicular overlap with the covered union.
    const perp = horizontal
      ? overlap1D(z.y, z.y + z.h, u.y, u.y + u.h)
      : overlap1D(z.x, z.x + z.w, u.x, u.x + u.w);
    if (perp <= EPS) return false;
    // Lies past the covered edge in `dir`.
    switch (dir) {
      case 'right': return z.x >= u.x + u.w - EPS;
      case 'left': return z.x + z.w <= u.x + EPS;
      case 'down': return z.y >= u.y + u.h - EPS;
      case 'up': return z.y + z.h <= u.y + EPS;
    }
  });
  if (candidates.length === 0) return null;

  // Edge of the nearest band in `dir`.
  const edge = (z: RelZone): number => {
    switch (dir) {
      case 'right': return z.x;
      case 'left': return -(z.x + z.w);
      case 'down': return z.y;
      case 'up': return -(z.y + z.h);
    }
  };
  const nearest = Math.min(...candidates.map(edge));
  const band = candidates.filter(z => Math.abs(edge(z) - nearest) <= EPS);

  const next = [...covered, ...band];
  return relToBounds(unionRel(next), workspace, gap);
}

/** A uniform cols x rows grid of relative zones, row-major. */
export function gridZones(cols: number, rows: number): RelZone[] {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const out: RelZone[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      out.push({ id: `g${row}-${col}`, x: col / c, y: row / r, w: 1 / c, h: 1 / r });
    }
  }
  return out;
}

/**
 * Built-in starter layouts for the Zone Editor — common FancyZones templates the
 * user can load and tweak. Pure data; the editor clones these before editing.
 */
export function builtinZoneLayouts(): ZoneLayout[] {
  const grid = (id: string, name: string, cols: number, rows: number): ZoneLayout =>
    ({ id, name, kind: 'grid', zones: gridZones(cols, rows) });
  return [
    grid('builtin-2col', 'Two Columns', 2, 1),
    grid('builtin-3col', 'Three Columns', 3, 1),
    grid('builtin-2x2', 'Quad Grid', 2, 2),
    grid('builtin-3x2', '3 x 2 Grid', 3, 2),
    {
      id: 'builtin-master',
      name: 'Master + Stack',
      kind: 'canvas',
      zones: [
        { id: 'm0', x: 0, y: 0, w: 0.62, h: 1 },
        { id: 'm1', x: 0.62, y: 0, w: 0.38, h: 0.5 },
        { id: 'm2', x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
      ],
    },
    {
      id: 'builtin-priority',
      name: 'Priority (wide center)',
      kind: 'canvas',
      zones: [
        { id: 'p0', x: 0, y: 0, w: 0.25, h: 1 },
        { id: 'p1', x: 0.25, y: 0, w: 0.5, h: 1 },
        { id: 'p2', x: 0.75, y: 0, w: 0.25, h: 1 },
      ],
    },
  ];
}
