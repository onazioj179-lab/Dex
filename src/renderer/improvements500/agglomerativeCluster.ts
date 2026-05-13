// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface AgglomerativeStep {
  a: number;
  b: number;
  distance: number;
}

function eucl(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function agglomerativeCluster(points: ReadonlyArray<ReadonlyArray<number>>): AgglomerativeStep[] {
  const n = points.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = eucl(points[i], points[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  const active = new Uint8Array(n).fill(1);
  const clusterIds = new Int32Array(n);
  for (let i = 0; i < n; i++) clusterIds[i] = i;
  let nextId = n;
  const steps: AgglomerativeStep[] = [];
  for (let iter = 0; iter < n - 1; iter++) {
    let bestI = -1;
    let bestJ = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!active[j]) continue;
        if (dist[i][j] < bestD) {
          bestD = dist[i][j];
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI === -1) break;
    steps.push({ a: clusterIds[bestI], b: clusterIds[bestJ], distance: bestD });
    // single-linkage merge: dist[i][k] = min(dist[i][k], dist[j][k])
    for (let k = 0; k < n; k++) {
      if (k === bestI || k === bestJ || !active[k]) continue;
      const nd = Math.min(dist[bestI][k], dist[bestJ][k]);
      dist[bestI][k] = nd;
      dist[k][bestI] = nd;
    }
    active[bestJ] = 0;
    clusterIds[bestI] = nextId++;
  }
  return steps;
}
