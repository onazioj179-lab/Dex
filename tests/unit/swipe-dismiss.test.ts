// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { releaseVelocity, rubberBand, shouldDismiss } from '../../src/renderer/utils/swipeDismiss';

describe('swipe to dismiss', () => {
  const W = 360;

  it('a long drag dismisses even when released slowly', () => {
    const slow = [{ x: 0, t: 0 }, { x: 150, t: 1000 }, { x: 150, t: 1200 }];
    expect(shouldDismiss(150, slow, W)).toBe(true);
  });

  it('a short quick flick dismisses', () => {
    const flick = [{ x: 0, t: 0 }, { x: 30, t: 40 }, { x: 60, t: 80 }];
    expect(releaseVelocity(flick)).toBeCloseTo(0.75);
    expect(shouldDismiss(60, flick, W)).toBe(true);
  });

  it('a short slow drag springs back', () => {
    const slow = [{ x: 0, t: 0 }, { x: 60, t: 600 }];
    expect(shouldDismiss(60, slow, W)).toBe(false);
  });

  it('a fast tap-jitter never dismisses', () => {
    expect(shouldDismiss(10, [{ x: 0, t: 0 }, { x: 10, t: 5 }], W)).toBe(false);
  });

  it('only the end of the gesture sets the release speed', () => {
    // Fast at first, then held still: no flick.
    const held = [{ x: 0, t: 0 }, { x: 80, t: 50 }, { x: 80, t: 400 }];
    expect(releaseVelocity(held)).toBe(0);
    expect(shouldDismiss(80, held, W)).toBe(false);
  });

  it('pulling the wrong way rubber-bands and never passes the cap', () => {
    expect(rubberBand(50)).toBe(50);
    expect(rubberBand(-10)).toBeLessThan(0);
    expect(Math.abs(rubberBand(-10))).toBeLessThan(10);
    expect(Math.abs(rubberBand(-10000))).toBeLessThan(24);
  });
});
