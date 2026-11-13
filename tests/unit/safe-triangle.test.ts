// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { isAimingAtRect, pointInTriangle } from '../../src/renderer/utils/safeTriangle';

describe('safe triangle (submenu aim)', () => {
  const flyout = { left: 200, right: 380, top: 100, bottom: 300 };

  it('point-in-triangle basics', () => {
    const a = { x: 0, y: 0 }, b = { x: 10, y: 0 }, c = { x: 0, y: 10 };
    expect(pointInTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true);
    expect(pointInTriangle({ x: 9, y: 9 }, a, b, c)).toBe(false);
    expect(pointInTriangle({ x: 5, y: 0 }, a, b, c)).toBe(true); // on an edge
  });

  it('diagonal travel toward a right-hand flyout counts as aiming', () => {
    const apex = { x: 150, y: 110 }; // left the row near its top
    expect(isAimingAtRect(apex, { x: 175, y: 140 }, flyout)).toBe(true);
    expect(isAimingAtRect(apex, { x: 195, y: 280 }, flyout)).toBe(true);
  });

  it('moving straight down the parent menu is not aiming', () => {
    const apex = { x: 150, y: 110 };
    expect(isAimingAtRect(apex, { x: 150, y: 160 }, flyout)).toBe(false);
    expect(isAimingAtRect(apex, { x: 120, y: 140 }, flyout)).toBe(false);
  });

  it('works for a flyout flipped to the left', () => {
    const left = { left: 0, right: 140, top: 100, bottom: 300 };
    const apex = { x: 190, y: 110 };
    expect(isAimingAtRect(apex, { x: 160, y: 150 }, left)).toBe(true);
    expect(isAimingAtRect(apex, { x: 220, y: 150 }, left)).toBe(false);
  });

  it('past the near edge it is aiming only within the flyout span', () => {
    const apex = { x: 150, y: 110 };
    expect(isAimingAtRect(apex, { x: 210, y: 200 }, flyout)).toBe(true);
    expect(isAimingAtRect(apex, { x: 210, y: 400 }, flyout)).toBe(false);
  });
});
