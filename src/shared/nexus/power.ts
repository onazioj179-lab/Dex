// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus power features — wave M.
 *
 * Pure UI-less primitives for the knowledge-graph workspace:
 *  - Time scrubber state machine (play/pause/seek with snap)
 *  - Multi-select state with shift/ctrl semantics
 *  - Saved-views store (named camera + filter snapshots)
 *  - Minimap projection (world → minimap rect)
 *  - Exporters that produce string payloads (PNG hint, SVG, JSON)
 *
 * No DOM, no canvas, no React. Tests verify deterministic outputs.
 */

// DEX v3.8.9 wave M - nexus power

// -------- time scrubber --------------------------------------------

export interface TimeScrubber {
  /** Inclusive lower bound (ms epoch). */
  startMs: number;
  /** Inclusive upper bound (ms epoch). */
  endMs: number;
  /** Current scrub position. Always within [startMs, endMs]. */
  cursorMs: number;
  /** True while playing forward at `playbackRate`. */
  playing: boolean;
  /** Seconds of timeline per real second (1 = realtime). */
  playbackRate: number;
  /** Snap step in ms (0 = no snap). */
  snapMs: number;
}

export function newScrubber(startMs: number, endMs: number, snapMs: number = 0): TimeScrubber {
  if (endMs < startMs) throw new RangeError('endMs must be >= startMs');
  return { startMs, endMs, cursorMs: startMs, playing: false, playbackRate: 1, snapMs: Math.max(0, snapMs) };
}

function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function seek(scrubber: TimeScrubber, target: number): TimeScrubber {
  const snapped = snap(target, scrubber.snapMs);
  const cursorMs = Math.max(scrubber.startMs, Math.min(scrubber.endMs, snapped));
  return { ...scrubber, cursorMs };
}

export function play(scrubber: TimeScrubber, rate: number = 1): TimeScrubber {
  return { ...scrubber, playing: true, playbackRate: Math.max(0.1, rate) };
}

export function pause(scrubber: TimeScrubber): TimeScrubber {
  return { ...scrubber, playing: false };
}

/** Advance the cursor by `realDtMs` of wall-clock time. */
export function tick(scrubber: TimeScrubber, realDtMs: number): TimeScrubber {
  if (!scrubber.playing) return scrubber;
  const next = scrubber.cursorMs + realDtMs * scrubber.playbackRate;
  if (next >= scrubber.endMs) {
    return { ...scrubber, cursorMs: scrubber.endMs, playing: false };
  }
  return { ...scrubber, cursorMs: snap(next, scrubber.snapMs) };
}

/** Normalised position in [0,1] for a progress bar. */
export function scrubberProgress(scrubber: TimeScrubber): number {
  const range = scrubber.endMs - scrubber.startMs;
  if (range <= 0) return 0;
  return (scrubber.cursorMs - scrubber.startMs) / range;
}

// -------- multi-select ---------------------------------------------

export type SelectionGesture = 'replace' | 'toggle' | 'range-extend';

export interface MultiSelect {
  /** Currently selected ids. */
  selected: Set<string>;
  /** Anchor id for shift-extend. */
  anchor: string | null;
}

export function newSelection(): MultiSelect {
  return { selected: new Set(), anchor: null };
}

/**
 * Apply a selection gesture.
 *  - `replace` (plain click): single select, set anchor
 *  - `toggle` (ctrl/cmd click): add/remove just this id, update anchor
 *  - `range-extend` (shift click): select inclusive range from anchor
 *    using `ordered` as the visible ordering. Keeps anchor.
 */
export function applySelection(
  state: MultiSelect,
  gesture: SelectionGesture,
  id: string,
  ordered: readonly string[] = []
): MultiSelect {
  if (gesture === 'replace') {
    return { selected: new Set([id]), anchor: id };
  }
  if (gesture === 'toggle') {
    const next = new Set(state.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selected: next, anchor: id };
  }
  // range-extend
  const anchor = state.anchor ?? id;
  const a = ordered.indexOf(anchor);
  const b = ordered.indexOf(id);
  if (a === -1 || b === -1) {
    return { selected: new Set([id]), anchor };
  }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const range = ordered.slice(lo, hi + 1);
  return { selected: new Set(range), anchor };
}

export function selectionSize(state: MultiSelect): number {
  return state.selected.size;
}

// -------- saved views ---------------------------------------------

export interface SavedView {
  id: string;
  name: string;
  /** Camera position {x,y,z}. */
  camera: { x: number; y: number; z: number };
  /** Active filter chips. */
  filters: string[];
  /** ms epoch */
  createdAt: number;
}

export interface SavedViewStore {
  views: SavedView[];
}

export const SAVED_VIEW_LIMIT = 25 as const;

export function newSavedViewStore(): SavedViewStore {
  return { views: [] };
}

export function saveView(store: SavedViewStore, view: SavedView): SavedViewStore {
  // Replace by id if exists, otherwise append.
  const existing = store.views.findIndex((v) => v.id === view.id);
  let views: SavedView[];
  if (existing >= 0) {
    views = store.views.map((v, i) => (i === existing ? view : v));
  } else {
    views = [...store.views, view];
  }
  if (views.length > SAVED_VIEW_LIMIT) views.splice(0, views.length - SAVED_VIEW_LIMIT);
  return { views };
}

export function deleteView(store: SavedViewStore, id: string): SavedViewStore {
  return { views: store.views.filter((v) => v.id !== id) };
}

/** Names sorted alphabetically (case-insensitive) for menus. */
export function listViewNames(store: SavedViewStore): string[] {
  return store.views.map((v) => v.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// -------- minimap projection --------------------------------------

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MinimapRect {
  width: number;
  height: number;
}

/**
 * Project a world point into minimap pixel coordinates.
 * Returns null if the world rect is degenerate or the point is outside.
 */
export function projectToMinimap(
  point: { x: number; y: number },
  world: WorldRect,
  map: MinimapRect
): { x: number; y: number } | null {
  const w = world.maxX - world.minX;
  const h = world.maxY - world.minY;
  if (w <= 0 || h <= 0) return null;
  if (point.x < world.minX || point.x > world.maxX) return null;
  if (point.y < world.minY || point.y > world.maxY) return null;
  return {
    x: ((point.x - world.minX) / w) * map.width,
    y: ((point.y - world.minY) / h) * map.height,
  };
}

// -------- exporters -----------------------------------------------

export interface NexusExportNode {
  id: string;
  label: string;
  x: number;
  y: number;
  category: string;
}

export interface NexusExportEdge {
  from: string;
  to: string;
  weight?: number;
}

export interface NexusGraph {
  nodes: readonly NexusExportNode[];
  edges: readonly NexusExportEdge[];
}

/** JSON export — stable shape for snapshots. */
export function exportJSON(graph: NexusGraph): string {
  return JSON.stringify({
    schema: 'dex-nexus-v1',
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, x: n.x, y: n.y, category: n.category })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight ?? 1 })),
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** SVG export with circle nodes and straight edges. Pure string output. */
export function exportSVG(graph: NexusGraph, width: number, height: number): string {
  const nodes = graph.nodes
    .map(
      (n) =>
        `<g><circle cx="${n.x}" cy="${n.y}" r="6" /><text x="${n.x + 8}" y="${n.y + 4}">${escapeXml(n.label)}</text></g>`
    )
    .join('');
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges
    .map((e) => {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) return '';
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${e.weight ?? 1}" />`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edges}${nodes}</svg>`;
}
