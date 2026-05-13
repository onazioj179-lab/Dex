// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Monotone-stack helpers. Useful for next-greater-element problems and
 * the classic largest rectangle in histogram in O(n).
 */

/**
 * For each index i, returns the index of the next greater element to
 * the right, or -1 if none. Uses a strictly decreasing stack.
 */
export function nextGreaterElements(values: ArrayLike<number>): Int32Array {
  const n = values.length;
  const out = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < n; i += 1) {
    while (stack.length > 0 && values[stack[stack.length - 1]!]! < values[i]!) {
      out[stack.pop()!] = i;
    }
    stack.push(i);
  }
  return out;
}

/**
 * Largest rectangle area in a histogram of `heights`. O(n).
 */
export function largestRectangleHistogram(heights: ArrayLike<number>): number {
  const n = heights.length;
  const stack: number[] = [];
  let best = 0;
  for (let i = 0; i <= n; i += 1) {
    const h = i === n ? 0 : heights[i]!;
    while (stack.length > 0 && heights[stack[stack.length - 1]!]! > h) {
      const top = stack.pop()!;
      const width = stack.length === 0 ? i : i - stack[stack.length - 1]! - 1;
      const area = heights[top]! * width;
      if (area > best) best = area;
    }
    stack.push(i);
  }
  return best;
}
