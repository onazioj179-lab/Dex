// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pure windowing math for virtualizing long lists. No DOM, no React,
 * no closure state. Consumers compute the visible range each scroll
 * frame and render only those rows. Includes overscan support.
 */

// DEX v3.8.9 wave F - virtualization helpers

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  /** Pixel offset of the first visible row (start padding). */
  offsetTop: number;
  /** Total scrollable height for sizing the spacer below the rows. */
  totalHeight: number;
}

export interface FixedRangeOptions {
  /** Total number of items in the list. */
  itemCount: number;
  /** Constant height of every row in CSS pixels. */
  itemHeight: number;
  /** Visible viewport height in CSS pixels. */
  viewportHeight: number;
  /** Current scrollTop. */
  scrollTop: number;
  /** Extra rows rendered above + below for smoother scrolling. */
  overscan?: number;
}

/**
 * Compute the visible window for a fixed-height list.
 * Returns an empty range when `itemCount === 0`.
 */
export function computeFixedRange(opts: FixedRangeOptions): VisibleRange {
  const overscan = Math.max(0, Math.floor(opts.overscan ?? 4));
  const itemHeight = Math.max(1, opts.itemHeight);
  const totalHeight = Math.max(0, opts.itemCount * itemHeight);
  if (opts.itemCount === 0) {
    return { startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 };
  }
  const viewportHeight = Math.max(0, opts.viewportHeight);
  const scrollTop = Math.max(0, Math.min(totalHeight, opts.scrollTop));
  const firstVisible = Math.floor(scrollTop / itemHeight);
  const lastVisible = Math.floor((scrollTop + viewportHeight) / itemHeight);
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(opts.itemCount - 1, lastVisible + overscan);
  const offsetTop = startIndex * itemHeight;
  return { startIndex, endIndex, offsetTop, totalHeight };
}

export interface VariableRangeOptions {
  /** Per-index height (must be the same length as the list). */
  itemHeights: number[];
  viewportHeight: number;
  scrollTop: number;
  overscan?: number;
}

/**
 * Variable-height windowing using a prefix-sum scan. O(n) per call; for
 * very large lists callers should cache the prefix array externally.
 */
export function computeVariableRange(opts: VariableRangeOptions): VisibleRange {
  const overscan = Math.max(0, Math.floor(opts.overscan ?? 4));
  const heights = opts.itemHeights;
  if (heights.length === 0) {
    return { startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 };
  }
  // Compute prefix-sum offsets.
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i += 1) {
    offsets[i + 1] = offsets[i] + Math.max(1, heights[i]);
  }
  const totalHeight = offsets[heights.length];
  const scrollTop = Math.max(0, Math.min(totalHeight, opts.scrollTop));
  const viewportEnd = scrollTop + Math.max(0, opts.viewportHeight);
  // First visible = largest i where offsets[i] <= scrollTop.
  // = lowerBound(offsets, scrollTop+1, 1) - 1, clamped >= 0.
  const firstVisible = Math.max(0, lowerBound(offsets, scrollTop + 1, 1) - 1);
  // Last visible = largest i where offsets[i] < viewportEnd.
  // = lowerBound(offsets, viewportEnd, 1) - 1, clamped >= firstVisible.
  let lastVisible = lowerBound(offsets, viewportEnd, 1) - 1;
  if (lastVisible < firstVisible) lastVisible = firstVisible;
  if (lastVisible >= heights.length) lastVisible = heights.length - 1;
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(heights.length - 1, lastVisible + overscan);
  const offsetTop = offsets[startIndex];
  return { startIndex, endIndex, offsetTop, totalHeight };
}

function lowerBound(arr: number[], target: number, fromIndex: number): number {
  let lo = fromIndex; let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Compute the scrollTop needed to bring an index into view. Honors
 * align: 'start' | 'center' | 'end' | 'auto'.
 */
export function scrollToIndex(opts: {
  index: number;
  itemHeight: number;
  viewportHeight: number;
  currentScrollTop: number;
  align?: 'start' | 'center' | 'end' | 'auto';
}): number {
  const top = Math.max(0, opts.index) * opts.itemHeight;
  const bottom = top + opts.itemHeight;
  switch (opts.align ?? 'auto') {
    case 'start': return top;
    case 'end': return Math.max(0, bottom - opts.viewportHeight);
    case 'center': return Math.max(0, top - (opts.viewportHeight - opts.itemHeight) / 2);
    case 'auto': {
      if (top < opts.currentScrollTop) return top;
      if (bottom > opts.currentScrollTop + opts.viewportHeight) {
        return Math.max(0, bottom - opts.viewportHeight);
      }
      return opts.currentScrollTop;
    }
  }
}
