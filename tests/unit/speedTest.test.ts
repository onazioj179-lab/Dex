// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  bytesPerMsToMbps,
  aggregateSamples,
  computeJitter,
  classifySpeed,
} from '../../src/shared/network/speedTest';

describe('speedTest math', () => {
  describe('bytesPerMsToMbps', () => {
    it('converts 1 MB in 1 second to ~8 Mbps', () => {
      const mbps = bytesPerMsToMbps(1_000_000, 1000);
      expect(mbps).toBeGreaterThan(7.9);
      expect(mbps).toBeLessThan(8.1);
    });
    it('returns 0 for non-positive duration', () => {
      expect(bytesPerMsToMbps(1_000_000, 0)).toBe(0);
      expect(bytesPerMsToMbps(1_000_000, -1)).toBe(0);
    });
    it('returns 0 for zero bytes', () => {
      expect(bytesPerMsToMbps(0, 1000)).toBe(0);
    });
  });

  describe('aggregateSamples', () => {
    it('returns 0 for empty input', () => {
      expect(aggregateSamples([])).toBe(0);
    });
    it('drops slowest sample when 3+ samples', () => {
      const fast = { bytes: 1_000_000, durationMs: 100 }; // 80 Mbps
      const slow = { bytes: 1_000_000, durationMs: 10_000 }; // 0.8 Mbps
      const result = aggregateSamples([fast, fast, slow]);
      expect(result).toBeGreaterThan(70); // slow is dropped
    });
    it('keeps both samples when only 2', () => {
      const a = { bytes: 1_000_000, durationMs: 100 };
      const b = { bytes: 1_000_000, durationMs: 200 };
      const result = aggregateSamples([a, b]);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(80);
    });
  });

  describe('computeJitter', () => {
    it('returns 0 for less than 2 samples', () => {
      expect(computeJitter([])).toBe(0);
      expect(computeJitter([10])).toBe(0);
    });
    it('computes mean absolute deviation between consecutive samples', () => {
      // [10, 20, 30] -> diffs 10, 10 -> mean 10
      expect(computeJitter([10, 20, 30])).toBe(10);
      // [10, 12, 10, 14] -> diffs 2, 2, 4 -> mean 8/3 = 2.67
      expect(computeJitter([10, 12, 10, 14])).toBe(2.67);
    });
  });

  describe('classifySpeed', () => {
    it('classifies offline (<1 Mbps)', () => {
      expect(classifySpeed(0)).toBe('offline');
      expect(classifySpeed(0.5)).toBe('offline');
    });
    it('classifies poor (1-10 Mbps)', () => {
      expect(classifySpeed(5)).toBe('poor');
      expect(classifySpeed(9.9)).toBe('poor');
    });
    it('classifies fair (10-25 Mbps)', () => {
      expect(classifySpeed(10)).toBe('fair');
      expect(classifySpeed(24)).toBe('fair');
    });
    it('classifies good (25-100 Mbps)', () => {
      expect(classifySpeed(50)).toBe('good');
      expect(classifySpeed(99)).toBe('good');
    });
    it('classifies excellent (>=100 Mbps)', () => {
      expect(classifySpeed(100)).toBe('excellent');
      expect(classifySpeed(940)).toBe('excellent');
    });
    it('treats NaN/Infinity as offline (non-finite)', () => {
      expect(classifySpeed(NaN)).toBe('offline');
      expect(classifySpeed(Infinity)).toBe('offline');
      expect(classifySpeed(-1)).toBe('offline');
    });
  });
});
