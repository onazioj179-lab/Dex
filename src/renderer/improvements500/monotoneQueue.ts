// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sliding window maximum/minimum via monotone deque. O(n) total.
 */

export function slidingWindowMax(values: ArrayLike<number>, window: number): Float64Array {
  const n = values.length;
  if (window <= 0 || n === 0) return new Float64Array(0);
  const w = Math.min(window, n);
  const out = new Float64Array(n - w + 1);
  const deque: number[] = []; // stores indices, values decreasing
  for (let i = 0; i < n; i += 1) {
    while (deque.length > 0 && deque[0]! <= i - w) deque.shift();
    while (deque.length > 0 && values[deque[deque.length - 1]!]! <= values[i]!) deque.pop();
    deque.push(i);
    if (i >= w - 1) out[i - w + 1] = values[deque[0]!]!;
  }
  return out;
}

export function slidingWindowMin(values: ArrayLike<number>, window: number): Float64Array {
  const n = values.length;
  if (window <= 0 || n === 0) return new Float64Array(0);
  const w = Math.min(window, n);
  const out = new Float64Array(n - w + 1);
  const deque: number[] = []; // values increasing
  for (let i = 0; i < n; i += 1) {
    while (deque.length > 0 && deque[0]! <= i - w) deque.shift();
    while (deque.length > 0 && values[deque[deque.length - 1]!]! >= values[i]!) deque.pop();
    deque.push(i);
    if (i >= w - 1) out[i - w + 1] = values[deque[0]!]!;
  }
  return out;
}
