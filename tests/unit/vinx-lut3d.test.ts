// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseCube, sampleLut, applyLutToPixels, identityLut } from '../../src/renderer/DEXAPPLICATIONS/vinx/lut3d';

/** Build .cube text from a function over the unit cube (red fastest). */
function cube(size: number, f: (r: number, g: number, b: number) => [number, number, number], extra = ''): string {
  const lines = [`TITLE "Test"`, `LUT_3D_SIZE ${size}`, extra];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const v = f(r / (size - 1), g / (size - 1), b / (size - 1));
    lines.push(v.map((x) => x.toFixed(6)).join(' '));
  }
  return lines.join('\n');
}

describe('.cube parsing', () => {
  it('reads title, size, domain and data in red-fastest order', () => {
    const r = parseCube(`# comment\nTITLE "Warm"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lut.title).toBe('Warm');
    expect(r.lut.size).toBe(2);
    expect([...r.lut.data.slice(3, 6)]).toEqual([1, 0, 0]); // second entry = red axis
  });

  it('refuses 1D LUTs, missing size, wrong counts and junk lines', () => {
    expect(parseCube('LUT_1D_SIZE 1024\n0 0 0')).toMatchObject({ ok: false, error: expect.stringMatching(/1D LUT/) });
    expect(parseCube('0 0 0')).toMatchObject({ ok: false, error: expect.stringMatching(/before LUT_3D_SIZE/) });
    expect(parseCube('LUT_3D_SIZE 2\n0 0 0')).toMatchObject({ ok: false, error: expect.stringMatching(/Expected 8 entries, found 1/) });
    expect(parseCube('LUT_3D_SIZE 2\n0 0 zero')).toMatchObject({ ok: false, error: expect.stringMatching(/Line 2/) });
    expect(parseCube('LUT_3D_SIZE 1')).toMatchObject({ ok: false });
    expect(parseCube('TITLE "x"')).toMatchObject({ ok: false, error: expect.stringMatching(/No LUT_3D_SIZE/) });
    expect(parseCube(cube(2, (r, g, b) => [r, g, b]) + '\n0 0 0')).toMatchObject({ ok: false, error: expect.stringMatching(/More than/) });
  });

  it('uses the file name when there is no TITLE', () => {
    const r = parseCube(cube(2, (r, g, b) => [r, g, b]).replace('TITLE "Test"', ''), 'my-look');
    expect(r.ok && r.lut.title).toBe('my-look');
  });
});

describe('trilinear sampling', () => {
  it('identity returns its input, including between grid points', () => {
    const id = identityLut(5);
    const o = sampleLut(id, 0.123, 0.5, 0.987);
    expect(o[0]).toBeCloseTo(0.123, 6);
    expect(o[1]).toBeCloseTo(0.5, 6);
    expect(o[2]).toBeCloseTo(0.987, 6);
  });

  it('is exact for any affine map (trilinear reproduces linear functions)', () => {
    const r = parseCube(cube(3, (r, g, b) => [0.2 + 0.5 * r, 1 - g, 0.3 * r + 0.3 * g + 0.4 * b]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = sampleLut(r.lut, 0.37, 0.81, 0.12);
    expect(o[0]).toBeCloseTo(0.2 + 0.5 * 0.37, 5);
    expect(o[1]).toBeCloseTo(1 - 0.81, 5);
    expect(o[2]).toBeCloseTo(0.3 * 0.37 + 0.3 * 0.81 + 0.4 * 0.12, 5);
  });

  it('hand-checked midpoint of a 2-point cube is the mean of the 8 corners', () => {
    const r = parseCube(cube(2, (r, g, b) => [r * g * b, r, 0]));
    if (!r.ok) throw new Error(r.error);
    // r*g*b over the corners: only (1,1,1) is 1 → mean 1/8.
    expect(sampleLut(r.lut, 0.5, 0.5, 0.5)[0]).toBeCloseTo(1 / 8, 6);
  });

  it('clamps outside the domain and honours DOMAIN_MAX', () => {
    const r = parseCube(cube(2, (r, g, b) => [r, g, b], 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2'));
    if (!r.ok) throw new Error(r.error);
    expect(sampleLut(r.lut, 1, 1, 1)[0]).toBeCloseTo(0.5, 6); // 1 is half-way through a 0..2 domain
    expect(sampleLut(r.lut, 5, -1, 2)).toEqual([1, 0, 1]);
  });
});

describe('applying to pixels', () => {
  const invert = parseCube(cube(2, (r, g, b) => [1 - r, 1 - g, 1 - b]));
  if (!invert.ok) throw new Error(invert.error);

  it('grades RGB, keeps alpha', () => {
    const px = new Uint8ClampedArray([255, 0, 51, 128, 0, 255, 255, 7]);
    applyLutToPixels(invert.lut, px, 1);
    expect([...px]).toEqual([0, 255, 204, 128, 255, 0, 0, 7]);
  });

  it('intensity mixes original and graded; 0 leaves the frame untouched', () => {
    const px = new Uint8ClampedArray([200, 100, 0, 255]);
    applyLutToPixels(invert.lut, px, 0.5);
    expect([...px]).toEqual([128, 128, 128, 255]);
    const same = new Uint8ClampedArray([10, 20, 30, 40]);
    applyLutToPixels(invert.lut, same, 0);
    expect([...same]).toEqual([10, 20, 30, 40]);
  });
});
