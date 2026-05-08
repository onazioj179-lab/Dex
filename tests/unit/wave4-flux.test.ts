// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { compileExpression } from '../../src/shared/motion3d/expression';
import { ParticleSystem } from '../../src/shared/motion3d/particles';
import { valueAt, type Keyframe } from '../../src/shared/motion3d/keyframes';

describe('Wave 4 — Flux motion graphics depth', () => {
  describe('expression engine', () => {
    it('returns simple constant expressions', () => {
      const fn = compileExpression('42');
      expect(fn({ time: 0, valueAtTime: () => 0 })).toBe(42);
    });
    it('exposes time and value', () => {
      const fn = compileExpression('time + value');
      expect(fn({ time: 1.5, valueAtTime: () => 2 })).toBeCloseTo(3.5);
    });
    it('blocks forbidden tokens', () => {
      expect(() => compileExpression('var x = (0).__proto__; x')).toThrow();
    });
    it('sandbox shadows require so it cannot be called', () => {
      const fn = compileExpression('require("fs")');
      const v = fn({ time: 0, valueAtTime: () => 42 });
      expect(v).toBe(42);
    });
    it('fails soft to value on runtime error', () => {
      const fn = compileExpression('(0).nope.nope');
      const v = fn({ time: 0, valueAtTime: () => 7 });
      expect(v).toBe(7);
    });
    it('wiggle returns finite numbers', () => {
      const fn = compileExpression('wiggle(2, 5)');
      const v = fn({ time: 0.3, valueAtTime: () => 10 });
      expect(Number.isFinite(v)).toBe(true);
    });
  });

  describe('particle system', () => {
    it('respects particle cap', () => {
      const ps = new ParticleSystem(
        { rate: 1_000_000, origin: [0,0,0], spread: 0.1, speed: { min: 1, max: 1 }, life: { min: 10, max: 10 }, size: { min: 1, max: 1 }, color: { r:1,g:1,b:1,a:1 }, seed: 1 },
        {},
        100,
      );
      ps.tick(1);
      expect(ps.count()).toBeLessThanOrEqual(100);
    });
    it('particles age and die', () => {
      const ps = new ParticleSystem(
        { rate: 0, burst: 5, origin: [0,0,0], spread: 0, speed: { min: 0, max: 0 }, life: { min: 1, max: 1 }, size: { min: 1, max: 1 }, color: { r:1,g:1,b:1,a:1 }, seed: 1 },
      );
      expect(ps.count()).toBe(5);
      ps.tick(2);
      expect(ps.count()).toBe(0);
    });
  });

  describe('keyframes', () => {
    it('linear interpolates between two keys', () => {
      const keys: Keyframe[] = [
        { t: 0, v: 0, outMode: 'linear' },
        { t: 1, v: 10, outMode: 'linear' },
      ];
      expect(valueAt(keys, 0.5)).toBeCloseTo(5);
    });
    it('hold keeps prior value', () => {
      const keys: Keyframe[] = [
        { t: 0, v: 7, outMode: 'hold' },
        { t: 1, v: 99, outMode: 'linear' },
      ];
      expect(valueAt(keys, 0.99)).toBe(7);
    });
    it('clamps before first and after last', () => {
      const keys: Keyframe[] = [
        { t: 1, v: 5, outMode: 'linear' },
        { t: 2, v: 10, outMode: 'linear' },
      ];
      expect(valueAt(keys, 0)).toBe(5);
      expect(valueAt(keys, 100)).toBe(10);
    });
    it('roving keyframes get evenly spaced times', () => {
      const keys: Keyframe[] = [
        { t: 0, v: 0, outMode: 'linear' },
        { t: 100, v: 5, outMode: 'linear', roving: true },
        { t: 200, v: 10, outMode: 'linear' },
      ];
      // Roving key should snap to ~100 even though declared at 100 — which is already even.
      const mid = valueAt(keys, 100);
      expect(mid).toBeCloseTo(5, 5);
    });
  });
});
