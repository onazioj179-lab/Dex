// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave F CAD tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  distance2, distance3, angleBetween,
  polygonArea, polygonPerimeter, polygonCentroid,
  meshVolume, meshSurfaceArea, boundingBox3,
  convertLength,
  toleranceFor, ISO_2768_LINEAR,
  summariseBom,
  drillPattern,
} from '../../src/shared/cad/measurement';

describe('distances + angles', () => {
  it('distance2', () => { expect(distance2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5); });
  it('distance3', () => { expect(distance3({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBe(3); });
  it('angle 90deg', () => {
    expect(angleBetween({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('polygon', () => {
  const square: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  it('area', () => { expect(polygonArea(square)).toBe(4); });
  it('perimeter', () => { expect(polygonPerimeter(square)).toBe(8); });
  it('centroid', () => {
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(1);
    expect(c.y).toBeCloseTo(1);
  });
});

describe('mesh', () => {
  it('volume of unit cube via 12 tris', () => {
    const v = (x: number, y: number, z: number) => ({ x, y, z });
    const tris: Array<[ReturnType<typeof v>, ReturnType<typeof v>, ReturnType<typeof v>]> = [
      [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0)], [v(0, 0, 0), v(1, 1, 0), v(0, 1, 0)],
      [v(0, 0, 1), v(1, 1, 1), v(1, 0, 1)], [v(0, 0, 1), v(0, 1, 1), v(1, 1, 1)],
      [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1)], [v(0, 0, 0), v(0, 1, 1), v(0, 0, 1)],
      [v(1, 0, 0), v(1, 1, 1), v(1, 1, 0)], [v(1, 0, 0), v(1, 0, 1), v(1, 1, 1)],
      [v(0, 0, 0), v(1, 0, 1), v(1, 0, 0)], [v(0, 0, 0), v(0, 0, 1), v(1, 0, 1)],
      [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1)], [v(0, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    ];
    expect(meshVolume(tris)).toBeCloseTo(1, 5);
    expect(meshSurfaceArea(tris)).toBeCloseTo(6, 5);
  });
  it('bbox of points', () => {
    const b = boundingBox3([{ x: 1, y: 2, z: 3 }, { x: -1, y: 0, z: 5 }]);
    expect(b?.min).toEqual({ x: -1, y: 0, z: 3 });
    expect(b?.max).toEqual({ x: 1, y: 2, z: 5 });
  });
  it('bbox empty', () => { expect(boundingBox3([])).toBeNull(); });
});

describe('units', () => {
  it('mm -> in', () => { expect(convertLength(25.4, 'mm', 'in')).toBeCloseTo(1); });
  it('in -> ft', () => { expect(convertLength(12, 'in', 'ft')).toBeCloseTo(1); });
});

describe('tolerance', () => {
  it('ISO 2768 medium 50mm', () => {
    expect(toleranceFor(50, 'medium')).toBe(0.3);
  });
  it('falls back to last bin', () => {
    expect(toleranceFor(99999, 'fine')).toBe(ISO_2768_LINEAR.fine[ISO_2768_LINEAR.fine.length - 1].toleranceMm);
  });
});

describe('BOM', () => {
  it('summarises', () => {
    const s = summariseBom([
      { partNumber: 'A', description: 'x', quantity: 2, unitCost: 5, unitMass: 0.1, material: 'steel' },
      { partNumber: 'B', description: 'y', quantity: 3, unitCost: 1, material: 'steel' },
      { partNumber: 'C', description: 'z', quantity: 1, unitCost: 10, material: 'al' },
    ]);
    expect(s.totalParts).toBe(3);
    expect(s.totalQuantity).toBe(6);
    expect(s.totalCost).toBe(23);
    expect(s.byMaterial.steel.cost).toBe(13);
  });
});

describe('drill pattern', () => {
  it('returns count points on circle', () => {
    const pts = drillPattern(0, 0, 10, 4);
    expect(pts).toHaveLength(4);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10);
  });
  it('zero count', () => { expect(drillPattern(0, 0, 1, 0)).toEqual([]); });
});
