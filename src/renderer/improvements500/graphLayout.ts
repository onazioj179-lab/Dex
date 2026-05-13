// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Force-directed graph layout step (T5-006/007 UKI graph).
 *
 * Pure simulation — call `stepLayout(nodes, edges, opts)` once per frame.
 * Nodes carry `x, y, vx, vy`; positions converge to a stable layout.
 */

export interface LayoutNode { id: string; x: number; y: number; vx: number; vy: number; }
export interface LayoutEdge { source: string; target: string; }

export interface LayoutOptions {
  /** Repulsion strength between any two nodes. */
  repulsion: number;
  /** Spring constant pulling connected nodes together. */
  spring: number;
  /** Resting length of edges. */
  springLength: number;
  /** Velocity damping per step (0..1). */
  damping: number;
  /** Centering force pulling toward (0, 0). */
  center: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  repulsion: 800,
  spring: 0.05,
  springLength: 100,
  damping: 0.85,
  center: 0.005,
};

export function stepLayout(nodes: LayoutNode[], edges: readonly LayoutEdge[], opts: Partial<LayoutOptions> = {}): void {
  const o = { ...DEFAULT_LAYOUT_OPTIONS, ...opts };
  const byId = new Map<string, LayoutNode>();
  for (const n of nodes) byId.set(n.id, n);

  // Repulsion (n^2 — fine for graphs up to ~500 nodes).
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 0.01;
      const d = Math.sqrt(d2);
      const f = o.repulsion / d2;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
  }

  // Spring along edges.
  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const force = (d - o.springLength) * o.spring;
    const fx = (dx / d) * force;
    const fy = (dy / d) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  // Center + damping + integrate.
  for (const n of nodes) {
    n.vx -= n.x * o.center;
    n.vy -= n.y * o.center;
    n.vx *= o.damping;
    n.vy *= o.damping;
    n.x += n.vx;
    n.y += n.vy;
  }
}
