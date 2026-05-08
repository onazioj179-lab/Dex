// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  Easing,
  resolveEasing,
  clamp,
  lerp,
  sortKeyframes,
  findInterval,
  sampleNumber,
  timelineDuration,
  type TimelineKeyframe,
} from '../../src/shared/timeline';

describe('shared timeline primitives', () => {
  describe('Easing', () => {
    it('linear is identity at endpoints and midpoint', () => {
      expect(Easing.linear(0)).toBe(0);
      expect(Easing.linear(1)).toBe(1);
      expect(Easing.linear(0.5)).toBe(0.5);
    });

    it('eases hit canonical endpoints', () => {
      expect(Easing.easeInQuad(0)).toBe(0);
      expect(Easing.easeInQuad(1)).toBe(1);
      expect(Easing.easeOutQuad(0)).toBe(0);
      expect(Easing.easeOutQuad(1)).toBe(1);
      expect(Easing.easeInOutCubic(0)).toBe(0);
      expect(Easing.easeInOutCubic(1)).toBeCloseTo(1, 6);
      expect(Easing.easeOutExpo(1)).toBe(1);
    });

    it('step jumps from 0 to 1 at t=1', () => {
      expect(Easing.step(0)).toBe(0);
      expect(Easing.step(0.999)).toBe(0);
      expect(Easing.step(1)).toBe(1);
    });
  });

  describe('resolveEasing', () => {
    it('returns linear for unknown / null / undefined', () => {
      expect(resolveEasing()).toBe(Easing.linear);
      expect(resolveEasing(null)).toBe(Easing.linear);
      // @ts-expect-error - exercising fallback
      expect(resolveEasing('not-a-real-easing')).toBe(Easing.linear);
    });
    it('returns the named easing', () => {
      expect(resolveEasing('easeOutCubic')).toBe(Easing.easeOutCubic);
    });
    it('returns the function as-is when given a function', () => {
      const fn = (t: number) => t * 0.5;
      expect(resolveEasing(fn)).toBe(fn);
    });
  });

  describe('clamp / lerp', () => {
    it('clamps to bounds', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(5, 0, 10)).toBe(5);
    });
    it('lerps endpoints exactly', () => {
      expect(lerp(2, 8, 0)).toBe(2);
      expect(lerp(2, 8, 1)).toBe(8);
      expect(lerp(2, 8, 0.5)).toBe(5);
    });
  });

  describe('sortKeyframes', () => {
    it('returns empty for null / undefined / empty', () => {
      expect(sortKeyframes(null)).toEqual([]);
      expect(sortKeyframes(undefined)).toEqual([]);
      expect(sortKeyframes([])).toEqual([]);
    });
    it('returns a sorted copy without mutating input', () => {
      const input: TimelineKeyframe[] = [
        { time: 3, value: 30 },
        { time: 1, value: 10 },
        { time: 2, value: 20 },
      ];
      const out = sortKeyframes(input);
      expect(out.map(k => k.time)).toEqual([1, 2, 3]);
      expect(input.map(k => k.time)).toEqual([3, 1, 2]);
    });
  });

  describe('findInterval', () => {
    const frames: TimelineKeyframe[] = [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
      { time: 2, value: 20 },
      { time: 5, value: 50 },
    ];

    it('returns null for empty timeline', () => {
      expect(findInterval([], 1)).toBeNull();
    });
    it('clamps before first', () => {
      const r = findInterval(frames, -1)!;
      expect(r.prev).toBeNull();
      expect(r.next).toBe(frames[0]);
    });
    it('clamps after last', () => {
      const r = findInterval(frames, 100)!;
      expect(r.prev).toBe(frames[3]);
      expect(r.next).toBeNull();
    });
    it('finds correct surrounding pair via binary search', () => {
      const r = findInterval(frames, 1.5)!;
      expect(r.prev?.time).toBe(1);
      expect(r.next?.time).toBe(2);
      const r2 = findInterval(frames, 4.999)!;
      expect(r2.prev?.time).toBe(2);
      expect(r2.next?.time).toBe(5);
    });
    it('lands exactly on an interior keyframe consistently', () => {
      const r = findInterval(frames, 2)!;
      // Either side is acceptable as long as both are non-null and valid.
      expect(r.prev?.time === 2 || r.next?.time === 2).toBe(true);
    });
  });

  describe('sampleNumber', () => {
    it('returns default for empty timeline', () => {
      expect(sampleNumber([], 5, 42)).toBe(42);
      expect(sampleNumber([], 5)).toBe(0);
    });
    it('clamps to endpoints outside range', () => {
      const f: TimelineKeyframe[] = [
        { time: 0, value: 100 },
        { time: 10, value: 200 },
      ];
      expect(sampleNumber(f, -5)).toBe(100);
      expect(sampleNumber(f, 50)).toBe(200);
    });
    it('linear interpolates between two frames', () => {
      const f: TimelineKeyframe[] = [
        { time: 0, value: 0 },
        { time: 10, value: 100 },
      ];
      expect(sampleNumber(f, 5)).toBe(50);
      expect(sampleNumber(f, 2.5)).toBe(25);
    });
    it('applies the prev keyframe easing', () => {
      const f: TimelineKeyframe[] = [
        { time: 0, value: 0, easing: 'easeInQuad' },
        { time: 1, value: 100 },
      ];
      // easeInQuad(0.5) = 0.25 -> value 25
      expect(sampleNumber(f, 0.5)).toBeCloseTo(25, 6);
    });
    it('handles zero-duration neighbors without dividing by zero', () => {
      const f: TimelineKeyframe[] = [
        { time: 1, value: 10 },
        { time: 1, value: 20 },
      ];
      // Either neighbor's value is acceptable - the contract is just
      // "no NaN, no throw" when two keyframes share the same timestamp.
      const v = sampleNumber(f, 1);
      expect(Number.isFinite(v)).toBe(true);
      expect([10, 20]).toContain(v);
    });
  });

  describe('timelineDuration', () => {
    it('is 0 for empty / single keyframe', () => {
      expect(timelineDuration([])).toBe(0);
      expect(timelineDuration([{ time: 5, value: 1 }])).toBe(0);
    });
    it('is last - first time', () => {
      const f: TimelineKeyframe[] = [
        { time: 2, value: 0 },
        { time: 7, value: 10 },
      ];
      expect(timelineDuration(f)).toBe(5);
    });
  });
});
