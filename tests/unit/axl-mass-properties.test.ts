// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies AXL's accurate mass-properties math (v6 Track G) without rendering:
// exact mesh volume/area/centroid (divergence theorem) + closed-form primitives.

import { describe, it, expect } from 'vitest';
import { meshMassProperties, primitiveMassProperties } from '../../src/renderer/DEXAPPLICATIONS/axl/axlMassProperties';

// Unit cube [0,1]^3, 8 verts, 12 triangles, consistent OUTWARD winding.
const CUBE_POS = [
  0, 0, 0, // 0
  1, 0, 0, // 1
  1, 1, 0, // 2
  0, 1, 0, // 3
  0, 0, 1, // 4
  1, 0, 1, // 5
  1, 1, 1, // 6
  0, 1, 1, // 7
];
const CUBE_IDX = [
  0, 3, 2, 0, 2, 1, // -Z
  4, 5, 6, 4, 6, 7, // +Z
  0, 1, 5, 0, 5, 4, // -Y
  3, 7, 6, 3, 6, 2, // +Y
  0, 4, 7, 0, 7, 3, // -X
  1, 2, 6, 1, 6, 5, // +X
];

describe('meshMassProperties (closed triangle mesh)', () => {
  it('computes a unit cube exactly (volume 1, area 6, centroid at center)', () => {
    const m = meshMassProperties(CUBE_POS, CUBE_IDX, 1);
    expect(m.volume).toBeCloseTo(1, 9);
    expect(m.surfaceArea).toBeCloseTo(6, 9);
    expect(m.centroid[0]).toBeCloseTo(0.5, 9);
    expect(m.centroid[1]).toBeCloseTo(0.5, 9);
    expect(m.centroid[2]).toBeCloseTo(0.5, 9);
    expect(m.mass).toBeCloseTo(1, 9);
  });

  it('scales mass by density and volume by size', () => {
    // Same cube, density 2700 (aluminium-ish, units arbitrary) -> mass 2700.
    expect(meshMassProperties(CUBE_POS, CUBE_IDX, 2700).mass).toBeCloseTo(2700, 6);
  });

  it('surface area is winding-independent (always positive sum)', () => {
    // Reverse every triangle's winding -> volume sign flips but |volume| + area hold.
    const flipped = [];
    for (let t = 0; t < CUBE_IDX.length; t += 3) flipped.push(CUBE_IDX[t], CUBE_IDX[t + 2], CUBE_IDX[t + 1]);
    const m = meshMassProperties(CUBE_POS, flipped, 1);
    expect(m.volume).toBeCloseTo(1, 9);
    expect(m.surfaceArea).toBeCloseTo(6, 9);
  });
});

describe('primitiveMassProperties (closed-form)', () => {
  it('box', () => {
    const m = primitiveMassProperties('box', { width: 2, height: 3, depth: 4 }, 1)!;
    expect(m.volume).toBeCloseTo(24, 9);
    expect(m.surfaceArea).toBeCloseTo(52, 9);
  });
  it('cylinder', () => {
    const m = primitiveMassProperties('cylinder', { radius: 1, height: 2 })!;
    expect(m.volume).toBeCloseTo(2 * Math.PI, 9);
    expect(m.surfaceArea).toBeCloseTo(2 * Math.PI * (1 + 2), 9);
  });
  it('sphere', () => {
    const m = primitiveMassProperties('sphere', { radius: 2 })!;
    expect(m.volume).toBeCloseTo((4 / 3) * Math.PI * 8, 9);
    expect(m.surfaceArea).toBeCloseTo(4 * Math.PI * 4, 9);
  });
  it('cone has COM a quarter-height above the base', () => {
    const m = primitiveMassProperties('cone', { radius: 3, height: 4 })!;
    expect(m.volume).toBeCloseTo((1 / 3) * Math.PI * 9 * 4, 9);
    expect(m.surfaceArea).toBeCloseTo(Math.PI * 3 * (3 + 5), 9); // slant = 5
    expect(m.centroid[1]).toBeCloseTo(1, 9); // h/4
  });
  it('torus', () => {
    const m = primitiveMassProperties('torus', { radius: 5, tubeRadius: 1 })!;
    expect(m.volume).toBeCloseTo(2 * Math.PI * Math.PI * 1 * 5, 9);
  });
  it('tube (hollow cylinder)', () => {
    const m = primitiveMassProperties('tube', { radius: 2, innerRadius: 1, height: 5 })!;
    expect(m.volume).toBeCloseTo(Math.PI * 3 * 5, 9);
  });
  it('returns null for unknown kind or degenerate volume', () => {
    expect(primitiveMassProperties('mystery' as never, {})).toBeNull();
    expect(primitiveMassProperties('box', { width: 0, height: 3, depth: 4 })).toBeNull();
  });
});
