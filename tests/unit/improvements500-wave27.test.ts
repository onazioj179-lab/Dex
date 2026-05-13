// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  cordicSinCos,
  atan2Approx,
  sinTable,
  cosTable,
  toQ15,
  fromQ15,
  q15Add,
  q15Mul,
  midiNoteToFreq,
  freqToMidiNote,
  midiNoteName,
  rgbToCmyk,
  cmykToRgb,
  rgbToLab,
  labToRgb,
  gammaEncode,
  gammaDecode,
  simplifyDouglasPeucker,
  greedyColoring,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 27', () => {
  it('cordicSinCos - matches Math.sin/cos within 1e-5', () => {
    for (const t of [0, 0.5, 1, -0.7, Math.PI / 3, -Math.PI / 2, 2.5, -3]) {
      const r = cordicSinCos(t);
      expect(r.sin).toBeCloseTo(Math.sin(t), 4);
      expect(r.cos).toBeCloseTo(Math.cos(t), 4);
    }
  });

  it('atan2Approx - close to Math.atan2', () => {
    for (const [y, x] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0.3, 2], [5, -0.1]]) {
      expect(atan2Approx(y!, x!)).toBeCloseTo(Math.atan2(y!, x!), 2);
    }
    expect(atan2Approx(0, 0)).toBe(0);
  });

  it('sinTable / cosTable - within 1e-3 of Math', () => {
    for (const t of [0, 0.5, 1.5, -2, 4]) {
      expect(sinTable(t)).toBeCloseTo(Math.sin(t), 3);
      expect(cosTable(t)).toBeCloseTo(Math.cos(t), 3);
    }
  });

  it('Q15 fixed-point round-trip and saturation', () => {
    expect(fromQ15(toQ15(0.5))).toBeCloseTo(0.5, 4);
    expect(fromQ15(toQ15(-0.25))).toBeCloseTo(-0.25, 4);
    expect(toQ15(2)).toBe((1 << 15) - 1);
    expect(toQ15(-2)).toBe(-(1 << 15));
    const a = toQ15(0.3);
    const b = toQ15(0.4);
    expect(fromQ15(q15Add(a, b))).toBeCloseTo(0.7, 3);
    expect(fromQ15(q15Mul(a, b))).toBeCloseTo(0.12, 3);
  });

  it('MIDI note <-> freq round-trip', () => {
    expect(midiNoteToFreq(69)).toBeCloseTo(440, 6);
    expect(midiNoteToFreq(60)).toBeCloseTo(261.625, 2);
    expect(freqToMidiNote(440)).toBeCloseTo(69, 6);
    expect(midiNoteName(69)).toBe('A4');
    expect(midiNoteName(60)).toBe('C4');
  });

  it('CMYK <-> RGB round-trip', () => {
    for (const rgb of [{ r: 255, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, { r: 0, g: 0, b: 0 }]) {
      const cmyk = rgbToCmyk(rgb);
      const back = cmykToRgb(cmyk);
      expect(back.r).toBe(rgb.r);
      expect(back.g).toBe(rgb.g);
      expect(back.b).toBe(rgb.b);
    }
  });

  it('Lab <-> RGB round-trip within tolerance', () => {
    for (const rgb of [{ r: 128, g: 64, b: 200 }, { r: 255, g: 128, b: 0 }]) {
      const lab = rgbToLab(rgb);
      const back = labToRgb(lab);
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it('gammaEncode / gammaDecode approx inverse', () => {
    const src = new Uint8Array([0, 64, 128, 192, 255]);
    const enc = gammaEncode(src, 2.2);
    const dec = gammaDecode(enc, 2.2);
    for (let i = 0; i < src.length; i += 1) {
      expect(Math.abs(dec[i]! - src[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('simplifyDouglasPeucker - reduces colinear points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.001 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 5 },
      { x: 5, y: 0 },
    ];
    const out = simplifyDouglasPeucker(pts, 0.1);
    expect(out.length).toBeLessThan(pts.length);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    expect(out).toContainEqual({ x: 4, y: 5 });
  });

  it('greedyColoring - K4 needs 4 colors, properly colors', () => {
    // Complete graph K4
    const k4: number[][] = [
      [1, 2, 3],
      [0, 2, 3],
      [0, 1, 3],
      [0, 1, 2],
    ];
    const r = greedyColoring(k4);
    expect(r.colorsUsed).toBe(4);
    for (let v = 0; v < 4; v += 1) {
      for (const u of k4[v]!) expect(r.color[v]).not.toBe(r.color[u]);
    }
    // Triangle plus pendant - needs 3 colors
    const tri: number[][] = [[1, 2], [0, 2], [0, 1, 3], [2]];
    const r2 = greedyColoring(tri);
    expect(r2.colorsUsed).toBe(3);
  });
});
