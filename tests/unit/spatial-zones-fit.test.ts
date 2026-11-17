// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { fitZonesToWindows, alignRects } from '../../src/renderer/shell/spatial/spatialMath';

describe('spatial zones hug their apps', () => {
  const zone = { id: 'z', x: 0, y: 0, w: 2000, h: 1500 };
  it('a zone shrinks/grows to the windows inside it, plus padding', () => {
    const [z] = fitZonesToWindows([zone], [{ x: 100, y: 100, w: 800, h: 600 }, { x: 950, y: 100, w: 400, h: 300 }], 24);
    expect(z).toEqual({ id: 'z', x: 76, y: 76, w: 1298, h: 648 });
  });
  it('empty zones and minimized windows leave the zone alone', () => {
    expect(fitZonesToWindows([zone], [])[0]).toBe(zone);
    expect(fitZonesToWindows([zone], [{ x: 10, y: 10, w: 100, h: 100, minimized: true }])[0]).toBe(zone);
  });
  it('returns the same array when nothing changed', () => {
    const zs = [zone];
    const once = fitZonesToWindows(zs, [{ x: 100, y: 100, w: 800, h: 600 }]);
    expect(fitZonesToWindows(once, [{ x: 100, y: 100, w: 800, h: 600 }])).toBe(once);
  });
});

describe('align: same size as the largest app', () => {
  const items = [{ id: 'a', x: 0, y: 0, w: 800, h: 600 }, { id: 'b', x: 900, y: 50, w: 400, h: 300 }];
  it('same-size copies the largest, positions kept', () => {
    expect(alignRects(items, 'same-size').b).toEqual({ x: 900, y: 50, w: 800, h: 600 });
  });
  it('same-width / same-height change one axis only', () => {
    expect(alignRects(items, 'same-width').b).toEqual({ x: 900, y: 50, w: 800, h: 300 });
    expect(alignRects(items, 'same-height').b).toEqual({ x: 900, y: 50, w: 400, h: 600 });
  });
});
