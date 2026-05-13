// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  TokenStream,
  parseCitations,
  stripCitations,
  uniqueRefs,
  ChunkedJsonParser,
  RingBuffer,
  PalmRejection,
  ZoomInertia,
  stepInertia,
  GestureRecognizer,
  InMemoryFsAdapter,
  detectWhiteScreen,
  createMemoryKvCache,
} from '../../src/renderer/improvements500';

describe('TokenStream', () => {
  it('splits on whitespace across chunks', () => {
    const ts = new TokenStream();
    expect(ts.push('hello wor')).toEqual(['hello']);
    expect(ts.push('ld foo ')).toEqual(['world', 'foo']);
    expect(ts.flush()).toEqual([]);
  });
  it('flushes pending tail', () => {
    const ts = new TokenStream();
    ts.push('abc');
    expect(ts.flush()).toEqual(['abc']);
  });
  it('rejects non-global regex', () => {
    expect(() => new TokenStream({ delimiter: /\s/ })).toThrow();
  });
});

describe('citations', () => {
  it('parses numeric, footnote, citekey', () => {
    const cs = parseCitations('Per [1] and [^note] and [@smith2020].');
    expect(cs.map((c) => c.kind)).toEqual(['numeric', 'footnote', 'citekey']);
    expect(cs.map((c) => c.ref)).toEqual(['1', 'note', 'smith2020']);
  });
  it('strips and dedupes', () => {
    expect(stripCitations('a [1] b [1] c')).toBe('a  b  c');
    expect(uniqueRefs(parseCitations('[1] [1] [2]'))).toEqual(['1', '2']);
  });
});

describe('ChunkedJsonParser', () => {
  it('parses split-chunk NDJSON', () => {
    const p = new ChunkedJsonParser<{ x: number }>();
    expect(p.push('{"x":1}\n{"x":')).toEqual([{ x: 1 }]);
    expect(p.push('2}\n')).toEqual([{ x: 2 }]);
    expect(p.flush()).toEqual([]);
  });
  it('reports errors via callback and continues', () => {
    const errs: string[] = [];
    const p = new ChunkedJsonParser({ onError: (line) => errs.push(line) });
    expect(p.push('not-json\n{"a":1}\n')).toEqual([{ a: 1 }]);
    expect(errs).toEqual(['not-json']);
  });
});

describe('RingBuffer', () => {
  it('overwrites oldest at capacity', () => {
    const r = new RingBuffer<number>(3);
    r.push(1); r.push(2); r.push(3);
    expect(r.toArray()).toEqual([1, 2, 3]);
    expect(r.push(4)).toBe(1);
    expect(r.toArray()).toEqual([2, 3, 4]);
    expect(r.shift()).toBe(2);
    expect(r.size).toBe(2);
  });
  it('rejects bad capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(1.5)).toThrow();
  });
});

describe('PalmRejection', () => {
  it('rejects touches while pen active', () => {
    const p = new PalmRejection();
    expect(p.begin({ id: 1, kind: 'pen', x: 100, y: 100, t: 0 })).toBe(true);
    expect(p.begin({ id: 2, kind: 'touch', x: 110, y: 110, t: 5 })).toBe(false);
  });
  it('respects lift grace by proximity', () => {
    const p = new PalmRejection({ liftGraceMs: 200, radiusPx: 50 });
    p.begin({ id: 1, kind: 'pen', x: 100, y: 100, t: 0 });
    p.end({ id: 1, kind: 'pen', x: 100, y: 100, t: 100 });
    expect(p.begin({ id: 2, kind: 'touch', x: 110, y: 110, t: 150 })).toBe(false);
    expect(p.begin({ id: 3, kind: 'touch', x: 100, y: 100, t: 500 })).toBe(true);
  });
  it('allows mouse and far touches', () => {
    const p = new PalmRejection();
    expect(p.begin({ id: 9, kind: 'mouse', x: 0, y: 0, t: 0 })).toBe(true);
    expect(p.begin({ id: 10, kind: 'touch', x: 5000, y: 5000, t: 1 })).toBe(true);
  });
});

describe('ZoomInertia / stepInertia', () => {
  it('decays toward rest', () => {
    const z = new ZoomInertia(1, 5, 0.001);
    z.set(1, 2);
    let prev = Math.abs(2);
    for (let i = 0; i < 300; i += 1) {
      z.step(16);
      const v = Math.abs(z['velocity' as keyof typeof z] as unknown as number);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    expect(z.isResting()).toBe(true);
  });
  it('clamps and zeroes opposing velocity', () => {
    const z = new ZoomInertia(1);
    z.set(0.5, -2);
    z.clampTo(1, 5);
    expect(z.get()).toBe(1);
    z.step(16);
    expect(z.get()).toBe(1);
  });
  it('stepInertia returns same state for dt<=0', () => {
    const s = { value: 5, velocity: 1 };
    expect(stepInertia(s, 0, 4)).toBe(s);
  });
});

describe('GestureRecognizer', () => {
  it('detects tap and double-tap', () => {
    const g = new GestureRecognizer();
    g.begin(10, 10, 0);
    expect(g.end(11, 11, 50)?.kind).toBe('tap');
    g.begin(10, 10, 100);
    expect(g.end(11, 11, 150)?.kind).toBe('doubleTap');
  });
  it('detects long press', () => {
    const g = new GestureRecognizer({ longPressMs: 200 });
    g.begin(10, 10, 0);
    g.move(10, 11, 100);
    expect(g.end(10, 11, 250)?.kind).toBe('longPress');
  });
  it('detects swipe direction', () => {
    const g = new GestureRecognizer({ swipeMinDistancePx: 20 });
    g.begin(0, 0, 0);
    g.move(50, 5, 50);
    const r = g.end(50, 5, 100);
    expect(r?.kind).toBe('swipe');
    expect(r?.direction).toBe('right');
  });
  it('cancel returns cancel result', () => {
    const g = new GestureRecognizer();
    g.begin(0, 0, 0);
    g.cancel();
    expect(g.end(1, 1, 5)?.kind).toBe('cancel');
  });
});

describe('InMemoryFsAdapter', () => {
  it('round-trips entries and lists by prefix', async () => {
    const fs = new InMemoryFsAdapter();
    await fs.write('/a/1', 'one');
    await fs.write('/a/2', 'two');
    await fs.write('/b/3', 'three');
    expect(await fs.read('/a/1')).toBe('one');
    expect(await fs.exists('/missing')).toBe(false);
    expect(await fs.list('/a/')).toEqual(['/a/1', '/a/2']);
    await fs.remove('/a/1');
    expect(await fs.exists('/a/1')).toBe(false);
  });
  it('throws ENOENT-style error on missing read', async () => {
    const fs = new InMemoryFsAdapter();
    await expect(fs.read('/nope')).rejects.toThrow(/ENOENT/);
  });
});

describe('detectWhiteScreen', () => {
  it('reports blank when no root supplied', () => {
    expect(detectWhiteScreen(null).blank).toBe(true);
  });
  it('reports blank for empty container', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const r = detectWhiteScreen(root as unknown as Parameters<typeof detectWhiteScreen>[0]);
    expect(r.blank).toBe(true);
    document.body.removeChild(root);
  });
});

describe('createMemoryKvCache', () => {
  it('round-trips, deletes, clears', async () => {
    const c = createMemoryKvCache();
    await c.set('k', 'v');
    expect(await c.get('k')).toBe('v');
    await c.delete('k');
    expect(await c.get('k')).toBeUndefined();
    await c.set('a', '1');
    await c.clear();
    expect(await c.get('a')).toBeUndefined();
  });
});
