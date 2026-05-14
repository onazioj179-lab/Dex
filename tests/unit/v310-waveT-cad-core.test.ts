// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX v3.10.0 wave T - cad tests
import { describe, expect, it } from 'vitest';
import {
  aabbIntersect, aggregateBom, autoDimensionExtents, barStiffness, beamDeflection,
  bendAllowance, bucklingCriticalLoad, countDxfEntities, featureVolume, iBeamMomentInertia,
  modalFrequency, postProcessGCode, revolveVolume, solveSketch, thermalExpansion,
  toolpathLength, updateDensity, weldThroat,
} from '../../src/shared/cad';

describe('wave T cad', () => {
  it('horizontal constraint aligns y', () => {
    const out = solveSketch([0, 1, 5, 4], [{ kind: 'fix', a: 0 }, { kind: 'horizontal', a: 0, b: 1 }]);
    expect(out[3]).toBeCloseTo(out[1], 2);
  });
  it('distance constraint enforces length', () => {
    const out = solveSketch([0, 0, 3, 4], [{ kind: 'fix', a: 0 }, { kind: 'distance', a: 0, b: 1, value: 10 }]);
    const d = Math.hypot(out[2], out[3]);
    expect(d).toBeCloseTo(10, 0);
  });
  it('extrude volume linear', () => {
    expect(featureVolume({ kind: 'extrude', profileArea: 5, depth: 4 })).toBe(20);
  });
  it('revolve volume Pappus', () => {
    expect(revolveVolume(1, 1)).toBeCloseTo(2 * Math.PI, 6);
  });
  it('bend allowance K-factor', () => {
    expect(bendAllowance(2, 90, 5, 0.5)).toBeCloseTo((Math.PI/2) * 6, 6);
  });
  it('I-beam moment of inertia positive', () => {
    expect(iBeamMomentInertia(100, 200, 10, 15)).toBeGreaterThan(0);
  });
  it('weld throat = leg/sqrt2', () => {
    expect(weldThroat(10)).toBeCloseTo(7.071, 3);
  });
  it('AABB intersect detection', () => {
    expect(aabbIntersect({min:[0,0],max:[1,1]},{min:[0.5,0.5],max:[2,2]})).toBe(true);
    expect(aabbIntersect({min:[0,0],max:[1,1]},{min:[2,2],max:[3,3]})).toBe(false);
  });
  it('auto-dim extents', () => {
    const e = autoDimensionExtents([[0,0],[10,5]]);
    expect(e.width).toBe(10); expect(e.height).toBe(5);
  });
  it('BOM aggregates duplicates', () => {
    const out = aggregateBom([{partNumber:'A',quantity:2},{partNumber:'A',quantity:3},{partNumber:'B',quantity:1}]);
    expect(out).toEqual([{partNumber:'A',quantity:5},{partNumber:'B',quantity:1}]);
  });
  it('DXF counts entities', () => {
    const dxf = '0\nLINE\n0\nLINE\n0\nCIRCLE\n0\nARC\n0\nLWPOLYLINE\n';
    expect(countDxfEntities(dxf)).toEqual({ lines: 2, circles: 1, arcs: 1, polylines: 1, texts: 0 });
  });
  it('FEA bar stiffness', () => {
    expect(barStiffness(200e9, 0.01, 1)).toBeCloseTo(2e9, -2);
  });
  it('beam deflection cantilever', () => {
    expect(beamDeflection(1000, 1, 200e9, 1e-6)).toBeGreaterThan(0);
  });
  it('buckling Euler load positive', () => {
    expect(bucklingCriticalLoad(200e9, 1e-6, 1)).toBeGreaterThan(0);
  });
  it('modal natural frequency', () => {
    expect(modalFrequency(1000, 1)).toBeGreaterThan(0);
  });
  it('thermal expansion', () => {
    expect(thermalExpansion(1.2e-5, 1, 100)).toBeCloseTo(1.2e-3, 6);
  });
  it('topology density bounded', () => {
    expect(updateDensity(0.5, 0.1, 0.4)).toBeLessThanOrEqual(1);
    expect(updateDensity(0.01, 100, 0.5)).toBeGreaterThanOrEqual(0.01);
  });
  it('CAM toolpath + gcode', () => {
    expect(toolpathLength([[0,0],[3,4]])).toBe(5);
    const g = postProcessGCode([[0,0],[1,1]], 100);
    expect(g).toContain('G1 X1.000 Y1.000');
    expect(g.endsWith('M30')).toBe(true);
  });
});
