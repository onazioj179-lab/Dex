// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeWindow } from '../../src/renderer/components/VirtualList';

describe('VirtualList.computeWindow', () => {
  it('returns an empty window for an empty list but keeps total height 0', () => {
    const w = computeWindow(0, 400, 40, 0, 6);
    expect(w).toEqual({ start: 0, end: 0, offsetY: 0, totalHeight: 0 });
  });

  it('renders only the viewport + overscan at the top', () => {
    // viewport 400 / row 40 = 10 visible; +6 overscan each side.
    const w = computeWindow(0, 400, 40, 1000, 6);
    expect(w.start).toBe(0);
    expect(w.end).toBe(16); // 0 + 10 + 6
    expect(w.offsetY).toBe(0);
    expect(w.totalHeight).toBe(40000);
  });

  it('windows correctly when scrolled into the middle', () => {
    const w = computeWindow(4000, 400, 40, 1000, 6); // first row = 100
    expect(w.start).toBe(94);  // 100 - 6
    expect(w.end).toBe(116);   // 100 + 10 + 6
    expect(w.offsetY).toBe(94 * 40);
  });

  it('clamps the end to the item count near the bottom', () => {
    const w = computeWindow(39600, 400, 40, 1000, 6); // first ~990
    expect(w.end).toBe(1000);
    expect(w.start).toBeLessThan(1000);
  });

  it('never renders before index 0', () => {
    const w = computeWindow(0, 400, 40, 1000, 20);
    expect(w.start).toBe(0);
  });

  it('degrades to an empty window when the viewport is unmeasured', () => {
    const w = computeWindow(0, 0, 40, 1000, 6);
    expect(w.start).toBe(0);
    expect(w.end).toBe(0);
    expect(w.totalHeight).toBe(40000); // spacer still reserves scroll height
  });
});
