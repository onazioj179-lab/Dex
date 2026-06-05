// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  estimateStringBytes,
  estimateImageBytes,
  estimateBufferBytes,
  estimateJsonBytes,
  estimateBytes,
} from '../../src/shared/creative/sizeEstimators';
import { SnapshotHistory } from '../../src/shared/creative/history';

describe('size estimators', () => {
  it('estimates string bytes as UTF-16', () => {
    expect(estimateStringBytes('')).toBe(0);
    expect(estimateStringBytes('abcd')).toBe(8);
  });

  it('estimates image pixel-buffer bytes (RGBA default)', () => {
    expect(estimateImageBytes({ width: 10, height: 10 })).toBe(400);
    expect(estimateImageBytes({ width: 10, height: 10 }, 1)).toBe(100);
    expect(estimateImageBytes({ width: -5, height: 10 })).toBe(0); // clamps junk dims
  });

  it('estimates typed-array / ArrayBuffer bytes exactly', () => {
    expect(estimateBufferBytes(new Uint8Array(64))).toBe(64);
    expect(estimateBufferBytes(new Float32Array(8))).toBe(32);
    expect(estimateBufferBytes(new ArrayBuffer(16))).toBe(16);
  });

  it('estimates JSON bytes and is safe on cycles', () => {
    expect(estimateJsonBytes({ a: 1 })).toBe(JSON.stringify({ a: 1 }).length * 2);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(estimateJsonBytes(cyclic)).toBe(0);
  });

  describe('estimateBytes dispatcher', () => {
    it('handles primitives and nullish as negligible', () => {
      expect(estimateBytes(null)).toBe(0);
      expect(estimateBytes(undefined)).toBe(0);
      expect(estimateBytes(42)).toBe(0);
      expect(estimateBytes(true)).toBe(0);
    });

    it('routes strings, buffers, and plain objects', () => {
      expect(estimateBytes('hello')).toBe(10);
      expect(estimateBytes(new Uint8Array(20))).toBe(20);
      expect(estimateBytes({ a: 'x' })).toBe(estimateJsonBytes({ a: 'x' }));
    });

    it('prefers the real buffer of an ImageData-like payload', () => {
      const imageData = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
      expect(estimateBytes(imageData)).toBe(64);
    });

    it('falls back to dims when an image-like payload has no buffer', () => {
      expect(estimateBytes({ width: 8, height: 8 })).toBe(8 * 8 * 4);
    });
  });

  it('plugs into SnapshotHistory as a memory budget', () => {
    // Three 16x16 RGBA snapshots = 1024 bytes each; budget holds two.
    const h = new SnapshotHistory<{ width: number; height: number }>({
      maxBytes: 2048,
      sizeOf: estimateBytes,
    });
    h.push({ width: 16, height: 16 });
    h.push({ width: 16, height: 16 });
    h.push({ width: 16, height: 16 });
    expect(h.size()).toBe(2);
    expect(h.bytes()).toBe(2048);
  });
});
