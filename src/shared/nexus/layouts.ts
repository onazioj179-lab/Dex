// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Nexus Layouts
 * -----------------------------------------------------------------------------
 * Pure layout functions: given an array of nodes and a viewport size, return a
 * map of node id -> {x,y}. Renderers (Canvas2D, WebGL) can pick any of them
 * and animate from current positions to the new target.
 *
 * Ten algorithms, all O(n) or O(n log n), all deterministic for a given seed:
 *   1.  grid          uniform grid, row-major
 *   2.  circle        nodes evenly spaced on a circle
 *   3.  spiral        Vogel sunflower / phyllotaxis
 *   4.  radial        rings by group; each ring evenly spaced
 *   5.  cluster       group-grouped on tile centers; nodes orbit centroid
 *   6.  hex           hexagonal close packing
 *   7.  tree          breadth-first tree from first node, layered down
 *   8.  random        seeded uniform random within viewport
 *   9.  weight-sorted larger weight closer to centre, archimedean spiral
 *   10. timeline      one row per group; nodes ordered by weight along x
 */

// DEX v3.8.5 - Nexus layout algorithms

export interface LayoutNode {
  id: string;
  weight?: number;
  group?: string;
}

export interface LayoutLink {
  source: string;
  target: string;
}

export type LayoutMode =
  | 'grid'
  | 'circle'
  | 'spiral'
  | 'radial'
  | 'cluster'
  | 'hex'
  | 'tree'
  | 'random'
  | 'weight-sorted'
  | 'timeline';

export const LAYOUT_MODES: LayoutMode[] = [
  'grid', 'circle', 'spiral', 'radial', 'cluster',
  'hex', 'tree', 'random', 'weight-sorted', 'timeline',
];

export interface LayoutResult { [id: string]: { x: number; y: number } }

export interface LayoutOptions {
  width: number;
  height: number;
  /** Padding inside the viewport, in CSS pixels. */
  padding?: number;
  /** Optional links, used by tree + radial to find roots / hierarchy. */
  links?: LayoutLink[];
  /** Optional seed for deterministic random/spiral. */
  seed?: number;
}

function pad(opts: LayoutOptions): { w: number; h: number; cx: number; cy: number; p: number } {
  const p = opts.padding ?? 24;
  return {
    w: Math.max(1, opts.width - p * 2),
    h: Math.max(1, opts.height - p * 2),
    cx: opts.width / 2,
    cy: opts.height / 2,
    p,
  };
}

function rng(seed: number): () => number {
  // Mulberry32, fast deterministic PRNG.
  let s = (seed | 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyResult(): LayoutResult { return {}; }

// ---------------------------------------------------------------------------
// 1. grid
// ---------------------------------------------------------------------------
export function layoutGrid(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * (w / h))));
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const out: LayoutResult = {};
  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out[n.id] = { x: p + c * cellW + cellW / 2, y: p + r * cellH + cellH / 2 };
  });
  return out;
}

// ---------------------------------------------------------------------------
// 2. circle
// ---------------------------------------------------------------------------
export function layoutCircle(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, cx, cy } = pad(opts);
  const r = Math.min(w, h) / 2;
  const out: LayoutResult = {};
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    out[n.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return out;
}

// ---------------------------------------------------------------------------
// 3. spiral (Vogel phyllotaxis)
// ---------------------------------------------------------------------------
export function layoutSpiral(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, cx, cy } = pad(opts);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const scale = Math.min(w, h) / (2 * Math.sqrt(nodes.length));
  const out: LayoutResult = {};
  nodes.forEach((n, i) => {
    const r = scale * Math.sqrt(i + 0.5);
    const a = i * goldenAngle;
    out[n.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return out;
}

// ---------------------------------------------------------------------------
// 4. radial (groups -> concentric rings)
// ---------------------------------------------------------------------------
export function layoutRadial(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, cx, cy } = pad(opts);
  const groups = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    const g = n.group || '_';
    const list = groups.get(g) || [];
    list.push(n);
    groups.set(g, list);
  }
  const groupNames = Array.from(groups.keys());
  const maxR = Math.min(w, h) / 2;
  const ringStep = groupNames.length > 0 ? maxR / groupNames.length : maxR;
  const out: LayoutResult = {};
  groupNames.forEach((g, gi) => {
    const list = groups.get(g)!;
    const radius = ringStep * (gi + 1);
    list.forEach((n, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      out[n.id] = { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 5. cluster (group tiles)
// ---------------------------------------------------------------------------
export function layoutCluster(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const groups = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    const g = n.group || '_';
    const list = groups.get(g) || [];
    list.push(n);
    groups.set(g, list);
  }
  const names = Array.from(groups.keys());
  const cols = Math.max(1, Math.ceil(Math.sqrt(names.length)));
  const rows = Math.max(1, Math.ceil(names.length / cols));
  const tileW = w / cols;
  const tileH = h / rows;
  const out: LayoutResult = {};
  names.forEach((g, gi) => {
    const list = groups.get(g)!;
    const r = Math.floor(gi / cols);
    const c = gi % cols;
    const ccx = p + c * tileW + tileW / 2;
    const ccy = p + r * tileH + tileH / 2;
    const radius = Math.min(tileW, tileH) / 2.4;
    list.forEach((n, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      out[n.id] = { x: ccx + Math.cos(a) * radius, y: ccy + Math.sin(a) * radius };
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 6. hex (hexagonal close packing)
// ---------------------------------------------------------------------------
export function layoutHex(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * (w / h))));
  const cellW = w / cols;
  const cellH = cellW * Math.sqrt(3) / 2;
  const out: LayoutResult = {};
  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const xOffset = (r % 2 === 0) ? 0 : cellW / 2;
    out[n.id] = { x: p + c * cellW + xOffset + cellW / 2, y: p + r * cellH + cellH / 2 };
  });
  return out;
}

// ---------------------------------------------------------------------------
// 7. tree (BFS from first node)
// ---------------------------------------------------------------------------
export function layoutTree(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const links = opts.links || [];
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    const a = adj.get(l.source); if (a && !a.includes(l.target)) a.push(l.target);
    const b = adj.get(l.target); if (b && !b.includes(l.source)) b.push(l.source);
  }
  const depth = new Map<string, number>();
  const queue: string[] = [];
  const root = nodes[0].id;
  depth.set(root, 0);
  queue.push(root);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depth.get(cur)!;
    for (const next of adj.get(cur) || []) {
      if (!depth.has(next)) { depth.set(next, d + 1); queue.push(next); }
    }
  }
  // Disconnected nodes get max depth + 1
  let maxD = 0;
  for (const d of depth.values()) maxD = Math.max(maxD, d);
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, maxD + 1);
  // Layer counts
  const layers = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const list = layers.get(d) || [];
    list.push(id);
    layers.set(d, list);
  }
  const totalLayers = Math.max(...layers.keys()) + 1;
  const layerH = h / totalLayers;
  const out: LayoutResult = {};
  for (const [d, ids] of layers) {
    const layerW = w / Math.max(1, ids.length);
    ids.forEach((id, i) => {
      out[id] = { x: p + i * layerW + layerW / 2, y: p + d * layerH + layerH / 2 };
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 8. random (seeded)
// ---------------------------------------------------------------------------
export function layoutRandom(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const r = rng(opts.seed ?? 1);
  const out: LayoutResult = {};
  for (const n of nodes) out[n.id] = { x: p + r() * w, y: p + r() * h };
  return out;
}

// ---------------------------------------------------------------------------
// 9. weight-sorted (heaviest at centre, archimedean spiral outward)
// ---------------------------------------------------------------------------
export function layoutWeightSorted(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, cx, cy } = pad(opts);
  const sorted = nodes.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const scale = Math.min(w, h) / (2 * Math.sqrt(sorted.length));
  const out: LayoutResult = {};
  sorted.forEach((n, i) => {
    const r = scale * Math.sqrt(i);
    const a = i * 0.7;
    out[n.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return out;
}

// ---------------------------------------------------------------------------
// 10. timeline (rows by group, x by weight)
// ---------------------------------------------------------------------------
export function layoutTimeline(nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  if (nodes.length === 0) return emptyResult();
  const { w, h, p } = pad(opts);
  const groups = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    const g = n.group || '_';
    const list = groups.get(g) || [];
    list.push(n);
    groups.set(g, list);
  }
  const names = Array.from(groups.keys());
  const rowH = h / Math.max(1, names.length);
  const out: LayoutResult = {};
  names.forEach((g, gi) => {
    const list = groups.get(g)!.slice().sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
    list.forEach((n, i) => {
      const x = list.length === 1 ? p + w / 2 : p + (i / (list.length - 1)) * w;
      out[n.id] = { x, y: p + gi * rowH + rowH / 2 };
    });
  });
  return out;
}

const REGISTRY: Record<LayoutMode, (n: LayoutNode[], o: LayoutOptions) => LayoutResult> = {
  grid: layoutGrid,
  circle: layoutCircle,
  spiral: layoutSpiral,
  radial: layoutRadial,
  cluster: layoutCluster,
  hex: layoutHex,
  tree: layoutTree,
  random: layoutRandom,
  'weight-sorted': layoutWeightSorted,
  timeline: layoutTimeline,
};

/** Compute a layout by name. Throws on unknown mode. */
export function computeLayout(mode: LayoutMode, nodes: LayoutNode[], opts: LayoutOptions): LayoutResult {
  const fn = REGISTRY[mode];
  if (!fn) throw new Error(`unknown layout mode: ${mode}`);
  return fn(nodes, opts);
}
