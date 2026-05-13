// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Connected component labeling for 4-connected binary images using two-pass
 * union-find. Returns label image (0 = background, 1..N = components) and
 * the count of components.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface CcLabelResult {
  labels: Int32Array;
  count: number;
}

export function connectedComponents4(
  binary: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): CcLabelResult {
  const labels = new Int32Array(width * height);
  const parent: number[] = [0];

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  let next = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 0) continue;
      const left = x > 0 ? labels[idx - 1]! : 0;
      const top = y > 0 ? labels[idx - width]! : 0;
      if (left === 0 && top === 0) {
        labels[idx] = next;
        parent[next] = next;
        next++;
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        labels[idx] = Math.min(left, top);
        union(left, top);
      }
    }
  }

  const remap = new Int32Array(next);
  let count = 0;
  for (let i = 1; i < next; i++) {
    if (find(i) === i) remap[i] = ++count;
  }
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== 0) labels[i] = remap[find(labels[i]!)]!;
  }
  return { labels, count };
}
