// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { ancestorChain, wouldCycle, toParentSpace, fromParentSpace, reparentPosition } from '../../src/renderer/DEXAPPLICATIONS/flux/parenting';

const T = (x: number, y: number, rotationZ = 0, scale = 100) => ({ x, y, rotationZ, scaleX: scale, scaleY: scale, anchorX: 0, anchorY: 0 });

describe('Flux parenting', () => {
  const layers = [
    { id: 'a', transform: T(100, 100) },
    { id: 'b', parent: 'a', transform: T(10, 0) },
    { id: 'c', parent: 'b', transform: T(5, 5) },
    { id: 'loop1', parent: 'loop2', transform: T(0, 0) },
    { id: 'loop2', parent: 'loop1', transform: T(0, 0) },
  ];

  it('builds the chain root first and survives cycles', () => {
    expect(ancestorChain(layers, layers[2]).map(l => l.id)).toEqual(['a', 'b']);
    expect(ancestorChain(layers, layers[3]).map(l => l.id)).toEqual(['loop2']);
  });

  it('refuses parenting that would loop', () => {
    expect(wouldCycle(layers, 'a', 'c')).toBe(true);
    expect(wouldCycle(layers, 'a', 'a')).toBe(true);
    expect(wouldCycle(layers, 'c', 'a')).toBe(false);
  });

  it('parent space maps round-trip with rotation and scale', () => {
    const t = { ...T(200, 50, 90, 200), anchorX: 3, anchorY: 4 };
    const w = toParentSpace({ x: 10, y: 0 }, t);
    expect(w.x).toBeCloseTo(200 + 8, 6);
    expect(w.y).toBeCloseTo(50 + 14, 6);
    const back = fromParentSpace(w, t);
    expect(back.x).toBeCloseTo(10, 6);
    expect(back.y).toBeCloseTo(0, 6);
  });

  it('re-parenting keeps the layer where it was on screen', () => {
    const free = { id: 'f', transform: T(300, 120) };
    const nul = { id: 'n', transform: T(200, 100, 90, 200) };
    const all = [free, nul];
    const t = reparentPosition(all, free, 'n');
    const world = toParentSpace({ x: t.x, y: t.y }, nul.transform);
    expect(world.x).toBeCloseTo(300, 6);
    expect(world.y).toBeCloseTo(120, 6);
    expect(t.rotationZ).toBe(-90);
    expect(t.scaleX).toBe(50);
    const child = { ...free, parent: 'n', transform: { ...free.transform, ...t } };
    const un = reparentPosition([child, nul], child, undefined);
    expect(un.x).toBeCloseTo(300, 6);
    expect(un.y).toBeCloseTo(120, 6);
    expect(un.rotationZ).toBe(0);
    expect(un.scaleX).toBe(100);
  });
});
