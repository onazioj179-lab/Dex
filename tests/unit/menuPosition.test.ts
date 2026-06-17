// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { clampMenuToViewport } from '../../src/renderer/utils/menuPosition';

const VP = { width: 1000, height: 800 };
const MENU = { width: 200, height: 300 };

describe('clampMenuToViewport', () => {
  it('leaves a menu that fits at the cursor where it is', () => {
    expect(clampMenuToViewport({ x: 100, y: 100 }, MENU, VP)).toEqual({ left: 100, top: 100 });
  });

  it('shifts left so the right edge stays inside the margin near the right edge', () => {
    // cursor near right edge -> left = width - margin - menuW
    const { left } = clampMenuToViewport({ x: 980, y: 100 }, MENU, VP, { margin: 8 });
    expect(left).toBe(1000 - 8 - 200); // 792
    expect(left + MENU.width).toBeLessThanOrEqual(VP.width - 8);
  });

  it('shifts up so the bottom edge stays inside the margin near the bottom edge', () => {
    const { top } = clampMenuToViewport({ x: 100, y: 790 }, MENU, VP, { margin: 8 });
    expect(top).toBe(800 - 8 - 300); // 492
    expect(top + MENU.height).toBeLessThanOrEqual(VP.height - 8);
  });

  it('clamps both axes at once in the bottom-right corner', () => {
    const p = clampMenuToViewport({ x: 999, y: 799 }, MENU, VP, { margin: 8 });
    expect(p).toEqual({ left: 792, top: 492 });
  });

  it('never positions before the margin (cursor at/over the top-left edge)', () => {
    expect(clampMenuToViewport({ x: 0, y: 0 }, MENU, VP, { margin: 8 })).toEqual({ left: 8, top: 8 });
    expect(clampMenuToViewport({ x: -50, y: 2 }, MENU, VP, { margin: 8 })).toEqual({ left: 8, top: 8 });
  });

  it('pins to the margin when the menu is larger than the viewport', () => {
    const huge = { width: 2000, height: 2000 };
    expect(clampMenuToViewport({ x: 500, y: 400 }, huge, VP, { margin: 8 })).toEqual({ left: 8, top: 8 });
  });

  it('honors a custom margin', () => {
    const { left } = clampMenuToViewport({ x: 980, y: 10 }, MENU, VP, { margin: 20 });
    expect(left).toBe(1000 - 20 - 200); // 780
  });

  it('defaults the margin to 8 when unspecified', () => {
    const { top } = clampMenuToViewport({ x: 10, y: 790 }, MENU, VP);
    expect(top).toBe(800 - 8 - 300);
  });
});
