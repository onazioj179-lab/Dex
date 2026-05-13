// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * `zip`, `unzip`, `zipLongest` for parallel iteration over multiple arrays.
 */

/** Stops at the shortest input. */
export function zip<T>(...arrs: ReadonlyArray<readonly T[]>): T[][] {
  if (arrs.length === 0) return [];
  const len = Math.min(...arrs.map((a) => a.length));
  const out: T[][] = [];
  for (let i = 0; i < len; i += 1) {
    out.push(arrs.map((a) => a[i]!));
  }
  return out;
}

/** Pads shorter inputs with the supplied filler value. */
export function zipLongest<T>(fill: T, ...arrs: readonly T[][]): T[][] {
  if (arrs.length === 0) return [];
  const len = Math.max(...arrs.map((a) => a.length));
  const out: T[][] = [];
  for (let i = 0; i < len; i += 1) {
    out.push(arrs.map((a) => (i < a.length ? a[i]! : fill)));
  }
  return out;
}

/** Inverse of zip: splits an array of tuples into per-position arrays. */
export function unzip<T>(tuples: ReadonlyArray<readonly T[]>): T[][] {
  if (tuples.length === 0) return [];
  const cols = Math.max(...tuples.map((t) => t.length));
  const out: T[][] = Array.from({ length: cols }, () => []);
  for (const tup of tuples) {
    for (let c = 0; c < cols; c += 1) {
      if (c < tup.length) out[c]!.push(tup[c]!);
    }
  }
  return out;
}
