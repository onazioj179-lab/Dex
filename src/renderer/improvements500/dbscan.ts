// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface DbscanOptions {
  eps: number;
  minPoints: number;
}

function distance(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function dbscan(points: ReadonlyArray<ReadonlyArray<number>>, opts: DbscanOptions): Int32Array {
  const n = points.length;
  const labels = new Int32Array(n).fill(-1); // -1 = noise/unvisited later mapped
  const visited = new Uint8Array(n);
  let cluster = 0;
  const region = (idx: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (distance(points[idx], points[i]) <= opts.eps) out.push(i);
    }
    return out;
  };
  for (let p = 0; p < n; p++) {
    if (visited[p]) continue;
    visited[p] = 1;
    const neigh = region(p);
    if (neigh.length < opts.minPoints) {
      labels[p] = -1;
      continue;
    }
    labels[p] = cluster;
    const queue = [...neigh];
    while (queue.length > 0) {
      const q = queue.shift()!;
      if (!visited[q]) {
        visited[q] = 1;
        const qn = region(q);
        if (qn.length >= opts.minPoints) {
          for (const x of qn) queue.push(x);
        }
      }
      if (labels[q] === -1) labels[q] = cluster;
    }
    cluster++;
  }
  return labels;
}
