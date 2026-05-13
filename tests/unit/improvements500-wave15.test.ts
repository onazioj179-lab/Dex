// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  radixSort,
  LruWeak,
  aStar,
  simplifyPolyline,
  ulid,
  shannonEntropy,
  MarkovChain,
  rgbToHsv,
  hsvToRgb,
  PriorityScheduler,
  BitSet,
} from '../../src/renderer/improvements500';

describe('radixSort', () => {
  it('sorts uint32 array', () => {
    expect(radixSort([4, 2, 9, 1, 7, 3, 0, 100, 0xffff])).toEqual([0, 1, 2, 3, 4, 7, 9, 100, 0xffff]);
  });
  it('matches Array.sort numeric', () => {
    const data: number[] = [];
    let s = 1;
    for (let i = 0; i < 200; i += 1) { s = (s * 1103515245 + 12345) >>> 0; data.push(s); }
    expect(radixSort(data)).toEqual(data.slice().sort((a, b) => a - b));
  });
  it('rejects negative or non-integer', () => {
    expect(() => radixSort([-1])).toThrow();
    expect(() => radixSort([1.5])).toThrow();
  });
});

describe('LruWeak', () => {
  it('stores and retrieves object values by object key', () => {
    const cache = new LruWeak<object, { v: number }>();
    const k = { id: 1 };
    const v = { v: 42 };
    cache.set(k, v);
    expect(cache.get(k)).toBe(v);
    expect(cache.has(k)).toBe(true);
    cache.delete(k);
    expect(cache.has(k)).toBe(false);
  });
});

describe('aStar', () => {
  it('finds shortest path on a grid', () => {
    type N = { x: number; y: number };
    const blocked = new Set(['1,0', '1,1']);
    const result = aStar<N>({
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 2 },
      key: (n) => `${n.x},${n.y}`,
      neighbors: (n) => {
        const out: N[] = [];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = n.x + dx; const ny = n.y + dy;
          if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue;
          if (blocked.has(`${nx},${ny}`)) continue;
          out.push({ x: nx, y: ny });
        }
        return out;
      },
      cost: () => 1,
      heuristic: (n, g) => Math.abs(n.x - g.x) + Math.abs(n.y - g.y),
    });
    expect(result).not.toBeNull();
    expect(result!.path[0]).toEqual({ x: 0, y: 0 });
    expect(result!.path[result!.path.length - 1]).toEqual({ x: 2, y: 2 });
    expect(result!.cost).toBeGreaterThanOrEqual(4);
  });
  it('returns null when goal unreachable', () => {
    const r = aStar<number>({
      start: 0, goal: 1,
      neighbors: () => [],
      cost: () => 1,
      heuristic: () => 0,
    });
    expect(r).toBeNull();
  });
});

describe('simplifyPolyline', () => {
  it('reduces collinear points', () => {
    const pts = [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0}];
    const r = simplifyPolyline(pts, 0.01);
    expect(r.length).toBe(2);
  });
  it('keeps deviations above tolerance', () => {
    const pts = [{x:0,y:0},{x:5,y:5},{x:10,y:0}];
    const r = simplifyPolyline(pts, 0.5);
    expect(r.length).toBe(3);
  });
});

describe('ulid', () => {
  it('produces 26-char Crockford base32 with deterministic input', () => {
    const id = ulid(0, () => new Uint8Array(10));
    expect(id.length).toBe(26);
    expect(/^[0-9A-HJKMNP-TV-Z]+$/.test(id)).toBe(true);
  });
  it('time-portion sorts lexicographically', () => {
    const a = ulid(1000, () => new Uint8Array(10));
    const b = ulid(2000, () => new Uint8Array(10));
    expect(a < b).toBe(true);
  });
});

describe('shannonEntropy', () => {
  it('zero for uniform input', () => {
    expect(shannonEntropy('aaaaaa')).toBe(0);
  });
  it('one bit for two equally likely symbols', () => {
    expect(shannonEntropy('abab')).toBeCloseTo(1, 5);
  });
  it('roughly two bits for four equally likely symbols', () => {
    expect(shannonEntropy('abcdabcd')).toBeCloseTo(2, 5);
  });
});

describe('MarkovChain', () => {
  it('generates from trained sequence', () => {
    const m = new MarkovChain<string>(1);
    m.train(['a','b','c','d','e','f','g']);
    const seq = m.generate(5);
    expect(seq.length).toBeGreaterThanOrEqual(1);
    expect(seq.length).toBeLessThanOrEqual(5);
  });
  it('rejects bad order', () => {
    expect(() => new MarkovChain(0)).toThrow();
  });
});

describe('hsvColor', () => {
  it('rgb -> hsv -> rgb roundtrip for red', () => {
    const hsv = rgbToHsv({ r: 255, g: 0, b: 0 });
    expect(hsv.h).toBe(0);
    expect(hsv.s).toBe(1);
    expect(hsv.v).toBe(1);
    const rgb = hsvToRgb(hsv);
    expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('green hue is 120', () => {
    const hsv = rgbToHsv({ r: 0, g: 255, b: 0 });
    expect(hsv.h).toBe(120);
  });
  it('grey is zero saturation', () => {
    const hsv = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(hsv.s).toBe(0);
  });
});

describe('PriorityScheduler', () => {
  it('runs higher-priority jobs first', async () => {
    const order: string[] = [];
    const s = new PriorityScheduler();
    const p1 = s.schedule({ priority: 1, run: () => { order.push('low'); return 'L'; } });
    const p2 = s.schedule({ priority: 10, run: () => { order.push('high'); return 'H'; } });
    const p3 = s.schedule({ priority: 5, run: () => { order.push('mid'); return 'M'; } });
    const r = await Promise.all([p1, p2, p3]);
    // First job (low) starts immediately because nothing is queued; then heap orders rest by priority.
    expect(r).toEqual(['L', 'H', 'M']);
    expect(order[0]).toBe('low');
    expect(order[1]).toBe('high');
    expect(order[2]).toBe('mid');
  });
  it('failures do not block others', async () => {
    const s = new PriorityScheduler();
    const p1 = s.schedule({ priority: 1, run: () => { throw new Error('boom'); } });
    const p2 = s.schedule({ priority: 1, run: () => 'ok' });
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('ok');
  });
});

describe('BitSet', () => {
  it('set/has/clear/popcount', () => {
    const b = new BitSet(100);
    expect(b.has(5)).toBe(false);
    b.set(5); b.set(50); b.set(99);
    expect(b.has(5)).toBe(true);
    expect(b.has(50)).toBe(true);
    expect(b.has(99)).toBe(true);
    expect(b.popcount()).toBe(3);
    b.clear(5);
    expect(b.has(5)).toBe(false);
    expect(b.popcount()).toBe(2);
  });
  it('range guards', () => {
    const b = new BitSet(8);
    expect(() => b.set(8)).toThrow();
    expect(() => b.set(-1)).toThrow();
  });
});
