// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeTabDropIndex, moveTab, sameOrder, type TabCenter } from '../../src/shared/shell/tabReorder';

// Three tabs centred at 50, 150, 250 (each 100px wide, left-to-right).
const order: TabCenter[] = [
  { id: 'a', center: 50 },
  { id: 'b', center: 150 },
  { id: 'c', center: 250 },
];

describe('tab reorder geometry (ghost drag-to-place)', () => {
  it('keeps index 0 when dragging the first tab and the pointer stays left', () => {
    expect(computeTabDropIndex(order, 'a', 10)).toBe(0);
  });

  it('moves a tab to the end when the pointer is past every other tab', () => {
    expect(computeTabDropIndex(order, 'a', 999)).toBe(2);
  });

  it("ignores the dragged tab's own slot when counting", () => {
    // Dragging 'b'; pointer just left of c's centre -> after a, before c => index 1.
    expect(computeTabDropIndex(order, 'b', 200)).toBe(1);
    // Pointer past c's centre -> after both a and c => index 2.
    expect(computeTabDropIndex(order, 'b', 260)).toBe(2);
  });

  it('drops before the first tab when the pointer is left of everything', () => {
    expect(computeTabDropIndex(order, 'c', 5)).toBe(0);
  });

  it('moveTab relocates an id and clamps out-of-range targets', () => {
    expect(moveTab(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveTab(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveTab(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(moveTab(['a', 'b', 'c'], 'b', -5)).toEqual(['b', 'a', 'c']);
  });

  it('moveTab is a no-op (fresh copy) for an unknown id', () => {
    const src = ['a', 'b'];
    const out = moveTab(src, 'z', 0);
    expect(out).toEqual(['a', 'b']);
    expect(out).not.toBe(src);
  });

  it('sameOrder detects equality and difference', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });

  it('round-trips a full drag: compute index then move', () => {
    // Drag 'a' to where the pointer sits past b (170) -> index 1, landing a between b and c.
    const idx = computeTabDropIndex(order, 'a', 170);
    expect(idx).toBe(1);
    expect(moveTab(['a', 'b', 'c'], 'a', idx)).toEqual(['b', 'a', 'c']);
  });
});
