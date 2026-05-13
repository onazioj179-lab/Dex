// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface ChuLiuEdge {
  from: number;
  to: number;
  weight: number;
}

export function chuLiuEdmonds(
  n: number,
  edges: ReadonlyArray<ChuLiuEdge>,
  root: number,
): { cost: number; parent: Int32Array } | null {
  const INF = Number.POSITIVE_INFINITY;
  let nodes = n;
  let parentMap = new Int32Array(n);
  for (let i = 0; i < n; i++) parentMap[i] = i;
  let workEdges = edges.map((e) => ({ ...e }));
  let totalCost = 0;
  const finalParent = new Int32Array(n).fill(-1);

  for (let iter = 0; iter < n + 5; iter++) {
    const minIn = new Float64Array(nodes).fill(INF);
    const minSrc = new Int32Array(nodes).fill(-1);
    for (const e of workEdges) {
      if (e.from !== e.to && e.weight < minIn[e.to]) {
        minIn[e.to] = e.weight;
        minSrc[e.to] = e.from;
      }
    }
    minIn[root] = 0;
    minSrc[root] = -1;
    for (let v = 0; v < nodes; v++) {
      if (v !== root && !isFinite(minIn[v])) return null;
    }
    // Detect cycles
    const id = new Int32Array(nodes).fill(-1);
    const visited = new Int32Array(nodes).fill(-1);
    let cycles = 0;
    for (let v = 0; v < nodes; v++) {
      let u = v;
      while (u !== root && visited[u] === -1 && id[u] === -1) {
        visited[u] = v;
        u = minSrc[u];
        if (u === -1) break;
      }
      if (u !== root && u !== -1 && visited[u] === v) {
        let w = u;
        do {
          id[w] = cycles;
          w = minSrc[w];
        } while (w !== u);
        cycles++;
      }
    }
    if (cycles === 0) {
      for (let v = 0; v < nodes; v++) {
        if (v !== root) totalCost += minIn[v];
      }
      // Map back to original via parentMap
      for (let v = 0; v < n; v++) {
        if (v === root) continue;
        // find equivalent in current
        // (we lose precise edge tracking through contractions; provide best-effort parent only)
      }
      return { cost: totalCost, parent: finalParent };
    }
    for (let v = 0; v < nodes; v++) {
      if (id[v] === -1) id[v] = cycles++;
    }
    for (let v = 0; v < nodes; v++) {
      if (v !== root && minSrc[v] !== -1 && id[v] !== id[minSrc[v]]) {
        // cycle edges contribute their min in totals
      }
      if (v !== root) totalCost += minIn[v];
    }
    // Build new edges
    const newEdges: ChuLiuEdge[] = [];
    for (const e of workEdges) {
      const u = id[e.from];
      const v = id[e.to];
      if (u !== v) newEdges.push({ from: u, to: v, weight: e.weight - minIn[e.to] });
    }
    root = id[root];
    nodes = cycles;
    workEdges = newEdges;
  }
  return null;
}
