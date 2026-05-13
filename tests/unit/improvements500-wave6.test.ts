// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave 6 tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';

import {
  mulberry32, randomInt, randomChoice, shuffleInPlace,
  encodeBase64, decodeBase64, encodeBase64Url, decodeBase64Url, utf8Encode, utf8Decode,
  uuidv4, isUuid,
  packRects,
  VelocityTracker,
  ClipboardHistory,
  deepEqual,
  deepMerge,
  PriorityQueue,
  clamp, lerp, inverseLerp, smoothstep, modulo, wrap, approxEqual,
} from '../../src/renderer/improvements500';

describe('prng', () => {
  it('mulberry32 is deterministic for the same seed', () => {
    const a = mulberry32(123); const b = mulberry32(123);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('randomInt is in range', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = randomInt(r, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThan(10);
    }
  });
  it('randomChoice picks a member', () => {
    const r = mulberry32(2);
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(randomChoice(r, arr));
  });
  it('shuffleInPlace preserves length and members', () => {
    const r = mulberry32(99);
    const arr = [1, 2, 3, 4, 5];
    const out = shuffleInPlace(r, [...arr]);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual(arr);
  });
});

describe('base64', () => {
  it('roundtrips bytes', () => {
    const data = utf8Encode('hello world');
    const enc = encodeBase64(data);
    expect(enc).toBe('aGVsbG8gd29ybGQ=');
    expect(utf8Decode(decodeBase64(enc))).toBe('hello world');
  });
  it('url variant has no padding and uses - _', () => {
    const enc = encodeBase64Url(utf8Encode('???'));
    expect(enc).not.toContain('=');
    expect(Array.from(decodeBase64Url(enc))).toEqual(Array.from(utf8Encode('???')));
  });
});

describe('uuid', () => {
  it('generates valid v4', () => {
    for (let i = 0; i < 5; i++) expect(isUuid(uuidv4())).toBe(true);
  });
  it('rejects malformed', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('packRects', () => {
  it('places rects that fit', () => {
    const r = packRects([{ width: 50, height: 50 }, { width: 30, height: 30 }, { width: 10, height: 10 }], 100, 100);
    expect(r.placed.length).toBe(3);
    expect(r.unplaced.length).toBe(0);
  });
  it('reports unplaced when bin too small', () => {
    const r = packRects([{ width: 200, height: 200 }], 100, 100);
    expect(r.placed.length).toBe(0);
    expect(r.unplaced).toEqual([0]);
  });
});

describe('VelocityTracker', () => {
  it('measures rightward velocity', () => {
    const v = new VelocityTracker(100);
    v.add(0, 0, 0);
    v.add(50, 0, 50);
    v.add(100, 0, 100);
    const out = v.velocity(100);
    expect(out.vx).toBeCloseTo(1, 1);
    expect(out.vy).toBe(0);
  });
  it('returns zero for single sample', () => {
    const v = new VelocityTracker();
    v.add(0, 0, 0);
    expect(v.velocity(0)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('ClipboardHistory', () => {
  it('caps capacity and dedupes consecutive', () => {
    const h = new ClipboardHistory(3);
    h.push('a', 1); h.push('a', 2); h.push('b', 3); h.push('c', 4); h.push('d', 5);
    expect(h.size()).toBe(3);
    expect(h.list().map((e) => e.text)).toEqual(['d', 'c', 'b']);
  });
  it('remove and clear work', () => {
    const h = new ClipboardHistory();
    const e = h.push('x', 1);
    expect(h.remove(e.id)).toBe(true);
    expect(h.size()).toBe(0);
    h.push('y', 2); h.clear();
    expect(h.size()).toBe(0);
  });
});

describe('deepEqual', () => {
  it('compares nested objects + arrays', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
  it('NaN equals NaN', () => { expect(deepEqual(NaN, NaN)).toBe(true); });
  it('Date and RegExp by value', () => {
    expect(deepEqual(new Date(123), new Date(123))).toBe(true);
    expect(deepEqual(/a/g, /a/g)).toBe(true);
    expect(deepEqual(/a/g, /a/i)).toBe(false);
  });
  it('handles cycles', () => {
    const a: Record<string, unknown> = { x: 1 }; a.self = a;
    const b: Record<string, unknown> = { x: 1 }; b.self = b;
    expect(deepEqual(a, b)).toBe(true);
  });
});

describe('deepMerge', () => {
  it('replaces arrays by default', () => {
    const out = deepMerge({ a: [1, 2], b: { x: 1 } }, { a: [9], b: { y: 2 } as { x?: number; y?: number } });
    expect(out.a).toEqual([9]);
    expect(out.b).toEqual({ x: 1, y: 2 });
  });
  it('concat strategy joins arrays', () => {
    const out = deepMerge({ a: [1, 2] }, { a: [3] }, { arrays: 'concat' });
    expect(out.a).toEqual([1, 2, 3]);
  });
});

describe('PriorityQueue', () => {
  it('pops in ascending priority order', () => {
    const q = new PriorityQueue<string>();
    q.push('low', 5); q.push('high', 1); q.push('mid', 3);
    expect(q.pop()).toBe('high');
    expect(q.pop()).toBe('mid');
    expect(q.pop()).toBe('low');
    expect(q.pop()).toBeUndefined();
  });
  it('peek and size', () => {
    const q = new PriorityQueue<number>();
    q.push(10, 2); q.push(20, 1);
    expect(q.peek()).toBe(20);
    expect(q.size()).toBe(2);
  });
});

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('lerp + inverseLerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
  });
  it('smoothstep edges', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
  it('modulo handles negative', () => {
    expect(modulo(-1, 10)).toBe(9);
    expect(modulo(11, 10)).toBe(1);
  });
  it('wrap around range', () => {
    expect(wrap(370, 0, 360)).toBe(10);
    expect(wrap(-10, 0, 360)).toBe(350);
  });
  it('approxEqual', () => {
    expect(approxEqual(1.0, 1.0 + 1e-9)).toBe(true);
    expect(approxEqual(1.0, 1.1)).toBe(false);
  });
});
