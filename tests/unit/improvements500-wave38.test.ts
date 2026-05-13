// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  sha1Hex,
  pbkdf2Sha256,
  arithmeticEncode,
  arithmeticDecode,
  parseIso,
  easterDate,
  sobelEdges,
  lanczosResample,
  paletteQuantize,
  ditherFloydSteinberg,
  raycastSphere,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 38', () => {
  it('sha1 known vectors', () => {
    expect(sha1Hex(new Uint8Array(0))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex(new TextEncoder().encode('abc'))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
  });

  it('pbkdf2-sha256 RFC 7914 case 1', () => {
    // P="passwd", S="salt", c=1, dkLen=64
    const dk = pbkdf2Sha256(
      new TextEncoder().encode('passwd'),
      new TextEncoder().encode('salt'),
      1,
      64,
    );
    let hex = '';
    for (let i = 0; i < dk.length; i++) hex += dk[i].toString(16).padStart(2, '0');
    expect(hex.startsWith('55ac046e56e3089fec1691c22544b605')).toBe(true);
  });

  it('arithmetic codec round trip', () => {
    const data = new TextEncoder().encode(
      'the quick brown fox jumps over the lazy dog the quick brown fox',
    );
    const enc = arithmeticEncode(data);
    const dec = arithmeticDecode(enc);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });

  it('parseIso parses date-only and full', () => {
    const d1 = parseIso('2024-01-15');
    expect(d1).not.toBeNull();
    expect(d1!.getFullYear()).toBe(2024);
    const d2 = parseIso('2024-01-15T12:30:45.500Z');
    expect(d2).not.toBeNull();
    expect(d2!.getUTCHours()).toBe(12);
    expect(d2!.getUTCMilliseconds()).toBe(500);
    expect(parseIso('not-a-date')).toBeNull();
  });

  it('easterDate matches known years', () => {
    const e2024 = easterDate(2024);
    expect(e2024.getUTCMonth()).toBe(2); // March
    expect(e2024.getUTCDate()).toBe(31);
    const e2025 = easterDate(2025);
    expect(e2025.getUTCMonth()).toBe(3); // April
    expect(e2025.getUTCDate()).toBe(20);
  });

  it('sobel detects vertical edge', () => {
    const w = 4;
    const h = 4;
    const img = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        img[y * w + x] = x < 2 ? 0 : 1;
      }
    }
    const r = sobelEdges(img, w, h);
    // Edge at x=1..2 should be strong; x=0 and x=3 should be smaller.
    expect(r.magnitude[1 * w + 1]).toBeGreaterThan(r.magnitude[1 * w + 0]);
    expect(r.magnitude[1 * w + 2]).toBeGreaterThan(r.magnitude[1 * w + 3]);
  });

  it('lanczosResample preserves length and bounds', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = lanczosResample(input, 5);
    expect(out.length).toBe(5);
    // Endpoints should be near input endpoints.
    expect(out[0]).toBeGreaterThanOrEqual(-0.5);
    expect(out[4]).toBeLessThanOrEqual(9.5);
  });

  it('paletteQuantize returns k centroids', () => {
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 250, g: 5, b: 5 },
      { r: 0, g: 255, b: 0 },
      { r: 5, g: 250, b: 5 },
      { r: 0, g: 0, b: 255 },
      { r: 5, g: 5, b: 250 },
    ];
    const palette = paletteQuantize(pixels, 3);
    expect(palette.length).toBe(3);
  });

  it('floyd-steinberg dithers grayscale', () => {
    const w = 4;
    const h = 4;
    const img = new Float32Array(w * h).fill(0.5);
    const out = ditherFloydSteinberg(img, w, h);
    // Output is binary 0/255.
    for (let i = 0; i < out.length; i++) {
      expect([0, 255]).toContain(out[i]);
    }
    // Roughly half pixels lit.
    let lit = 0;
    for (let i = 0; i < out.length; i++) if (out[i] === 255) lit++;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(out.length);
  });

  it('raycastSphere detects hit and miss', () => {
    const hit = raycastSphere(
      { x: 0, y: 0, z: -5 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      1,
    );
    expect(hit).not.toBeNull();
    expect(hit!.t1).toBeCloseTo(4, 6);
    expect(hit!.t2).toBeCloseTo(6, 6);
    const miss = raycastSphere(
      { x: 5, y: 5, z: -5 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      1,
    );
    expect(miss).toBeNull();
  });
});
