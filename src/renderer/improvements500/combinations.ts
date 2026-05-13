// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Combinations and powerset enumeration. `combinations(n, k)` yields
 * all k-element subsets of [0..n). `powerset(items)` yields every
 * subset of `items` (including empty and full set).
 */

export function* combinations(n: number, k: number): Generator<number[], void, void> {
  if (!Number.isInteger(n) || n < 0) throw new Error('combinations: n must be non-negative integer');
  if (!Number.isInteger(k) || k < 0 || k > n) {
    throw new RangeError('combinations: k out of range');
  }
  if (k === 0) {
    yield [];
    return;
  }
  const indices = new Array<number>(k);
  for (let i = 0; i < k; i += 1) indices[i] = i;
  while (true) {
    yield indices.slice();
    let i = k - 1;
    while (i >= 0 && indices[i] === i + n - k) i -= 1;
    if (i < 0) return;
    indices[i] = indices[i]! + 1;
    for (let j = i + 1; j < k; j += 1) indices[j] = indices[j - 1]! + 1;
  }
}

export function* powerset<T>(items: ReadonlyArray<T>): Generator<T[], void, void> {
  const n = items.length;
  if (n > 30) throw new RangeError('powerset: input too large');
  const total = 1 << n;
  for (let mask = 0; mask < total; mask += 1) {
    const subset: T[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) subset.push(items[i]!);
    }
    yield subset;
  }
}
