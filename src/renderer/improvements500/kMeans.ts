// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface KMeansOptions {
  k: number;
  iterations?: number;
  tolerance?: number;
  seed?: number;
}

export interface KMeansResult {
  centroids: number[][];
  labels: Int32Array;
  iterations: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distSquared(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

export function kMeans(points: ReadonlyArray<ReadonlyArray<number>>, opts: KMeansOptions): KMeansResult {
  const n = points.length;
  const k = opts.k;
  const dims = points[0]?.length ?? 0;
  const iters = opts.iterations ?? 100;
  const tol = opts.tolerance ?? 1e-6;
  const rand = mulberry32(opts.seed ?? 1);
  const centroids: number[][] = [];
  const seen = new Set<number>();
  while (centroids.length < k && seen.size < n) {
    const idx = Math.floor(rand() * n);
    if (seen.has(idx)) continue;
    seen.add(idx);
    centroids.push(points[idx].slice());
  }
  while (centroids.length < k) centroids.push(new Array(dims).fill(0));
  const labels = new Int32Array(n);
  let iter = 0;
  for (; iter < iters; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distSquared(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[i] = best;
    }
    const sums: number[][] = Array.from({ length: k }, () => new Array(dims).fill(0));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let d = 0; d < dims; d++) sums[c][d] += points[i][d];
    }
    let shift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let d = 0; d < dims; d++) {
        const m = sums[c][d] / counts[c];
        const diff = m - centroids[c][d];
        shift += diff * diff;
        centroids[c][d] = m;
      }
    }
    if (shift < tol) {
      iter++;
      break;
    }
  }
  return { centroids, labels, iterations: iter };
}
