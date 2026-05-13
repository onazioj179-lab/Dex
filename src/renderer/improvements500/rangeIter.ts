// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lazy iteration helpers: `rangeIter`, `enumerate`.
 */

export function* rangeIter(startOrStop: number, stop?: number, step = 1): Generator<number> {
  let start: number;
  let end: number;
  if (stop === undefined) { start = 0; end = startOrStop; } else { start = startOrStop; end = stop; }
  if (step === 0) throw new Error('rangeIter: step must be non-zero');
  if (step > 0) {
    for (let i = start; i < end; i += step) yield i;
  } else {
    for (let i = start; i > end; i += step) yield i;
  }
}

export function rangeArray(startOrStop: number, stop?: number, step = 1): number[] {
  return Array.from(rangeIter(startOrStop, stop, step));
}

export function* enumerate<T>(iter: Iterable<T>, start = 0): Generator<[number, T]> {
  let i = start;
  for (const item of iter) {
    yield [i, item];
    i += 1;
  }
}
