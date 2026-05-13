// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  parseChord,
  matchChord,
  chordToString,
  createFocusVisible,
  perfMark,
  perfMeasure,
  perfTime,
  perfTimeAsync,
  recentMeasures,
  clearMeasures,
  BloomFilter,
  recommendBloomParams,
  kebabCase,
  snakeCase,
  camelCase,
  pascalCase,
  titleCase,
  constantCase,
  levenshtein,
  similarity,
  bestMatch,
  IntervalTree,
  TypedEventEmitter,
  createLazyImageLoader,
  parseRetryAfter,
  retryAfterDelay,
} from '../../src/renderer/improvements500';

describe('keyboardChord', () => {
  it('parses Ctrl+Shift+K', () => {
    const c = parseChord('Ctrl+Shift+K');
    expect(c).toEqual({ ctrl: true, alt: false, shift: true, meta: false, key: 'k' });
  });
  it('aliases Cmd -> meta, Option -> alt', () => {
    expect(parseChord('Cmd+Option+/').meta).toBe(true);
    expect(parseChord('Cmd+Option+/').alt).toBe(true);
  });
  it('matches a KeyboardEvent', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true });
    expect(matchChord(ev, 'Ctrl+Shift+K')).toBe(true);
    expect(matchChord(ev, 'Ctrl+K')).toBe(false);
  });
  it('chordToString round-trips', () => {
    const s = chordToString(parseChord('ctrl+k'));
    expect(s).toBe('Ctrl+K');
  });
  it('rejects empty / unknown tokens', () => {
    expect(() => parseChord('')).toThrow();
    expect(() => parseChord('Foo+K')).toThrow();
  });
});

describe('createFocusVisible', () => {
  it('toggles class on keyboard / pointer', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const ctrl = createFocusVisible({ target: root, className: 'kb' });
    ctrl.start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(root.classList.contains('kb')).toBe(true);
    expect(ctrl.isKeyboardMode()).toBe(true);
    window.dispatchEvent(new MouseEvent('mousedown'));
    expect(root.classList.contains('kb')).toBe(false);
    ctrl.stop();
  });
  it('ignores modifier-only keys', () => {
    const root = document.createElement('div');
    const ctrl = createFocusVisible({ target: root, className: 'kb2' });
    ctrl.start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    expect(root.classList.contains('kb2')).toBe(false);
    ctrl.stop();
  });
});

describe('perfMark', () => {
  it('perfTime records duration', () => {
    clearMeasures();
    perfTime('sync-op', () => { let s = 0; for (let i = 0; i < 100; i += 1) s += i; return s; });
    const recent = recentMeasures();
    expect(recent.find((m) => m.name === 'sync-op')).toBeTruthy();
  });
  it('perfTimeAsync records duration', async () => {
    clearMeasures();
    await perfTimeAsync('async-op', async () => 'ok');
    expect(recentMeasures().some((m) => m.name === 'async-op')).toBe(true);
  });
  it('perfMark + perfMeasure do not throw', () => {
    perfMark('a-start');
    perfMark('a-end');
    expect(() => perfMeasure('a', 'a-start', 'a-end')).not.toThrow();
  });
});

describe('BloomFilter', () => {
  it('reports inserted items as present', () => {
    const bf = new BloomFilter({ bits: 1024, hashes: 4 });
    bf.add('alpha'); bf.add('beta'); bf.add('gamma');
    expect(bf.has('alpha')).toBe(true);
    expect(bf.has('beta')).toBe(true);
    expect(bf.has('gamma')).toBe(true);
    expect(bf.count).toBe(3);
  });
  it('keeps false-positive rate low for sized filter', () => {
    const params = recommendBloomParams(500, 0.01);
    const bf = new BloomFilter(params);
    for (let i = 0; i < 500; i += 1) bf.add(`item-${i}`);
    let fp = 0;
    for (let i = 500; i < 1500; i += 1) {
      if (bf.has(`item-${i}`)) fp += 1;
    }
    expect(fp / 1000).toBeLessThan(0.05);
  });
  it('rejects bad params', () => {
    expect(() => new BloomFilter({ bits: 0, hashes: 1 })).toThrow();
    expect(() => new BloomFilter({ bits: 8, hashes: 0 })).toThrow();
  });
});

describe('caseConvert', () => {
  it('converts between cases', () => {
    expect(kebabCase('FooBarBaz')).toBe('foo-bar-baz');
    expect(snakeCase('foo bar baz')).toBe('foo_bar_baz');
    expect(camelCase('foo-bar-baz')).toBe('fooBarBaz');
    expect(pascalCase('foo bar')).toBe('FooBar');
    expect(titleCase('foo_bar')).toBe('Foo Bar');
    expect(constantCase('fooBar')).toBe('FOO_BAR');
  });
  it('handles ALLCAPS runs', () => {
    expect(kebabCase('XMLParser')).toBe('xml-parser');
  });
});

describe('levenshtein', () => {
  it('classic distance examples', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('similarity is bounded [0,1]', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', 'xyz')).toBeCloseTo(0, 5);
  });
  it('bestMatch picks closest', () => {
    const m = bestMatch('cat', ['car', 'dog', 'bat']);
    expect(m).not.toBeNull();
    expect(['car', 'bat']).toContain(m!.value);
  });
});

describe('IntervalTree', () => {
  it('queries point membership', () => {
    const t = new IntervalTree<string>([
      { start: 0, end: 10, value: 'A' },
      { start: 5, end: 15, value: 'B' },
      { start: 20, end: 30, value: 'C' },
    ]);
    const hits = t.queryPoint(7).map((i) => i.value).sort();
    expect(hits).toEqual(['A', 'B']);
    expect(t.queryPoint(25)[0].value).toBe('C');
    expect(t.queryPoint(100)).toEqual([]);
  });
  it('queries ranges', () => {
    const t = new IntervalTree<number>([
      { start: 0, end: 10, value: 1 },
      { start: 12, end: 20, value: 2 },
    ]);
    const r = t.queryRange(8, 13).map((i) => i.value).sort();
    expect(r).toEqual([1, 2]);
  });
  it('rejects bad intervals', () => {
    expect(() => new IntervalTree([{ start: 5, end: 5, value: 1 }])).toThrow();
  });
});

describe('TypedEventEmitter', () => {
  interface Events { ping: number; msg: string; }
  it('emits typed payloads and supports off/once', () => {
    const e = new TypedEventEmitter<Events>();
    const seen: number[] = [];
    const off = e.on('ping', (n) => seen.push(n));
    e.emit('ping', 1);
    e.emit('ping', 2);
    off();
    e.emit('ping', 3);
    expect(seen).toEqual([1, 2]);
    let onceN = 0;
    e.once('ping', (n) => { onceN = n; });
    e.emit('ping', 99);
    e.emit('ping', 100);
    expect(onceN).toBe(99);
    expect(e.listenerCount('ping')).toBe(0);
  });
  it('rogue listener does not break siblings', () => {
    const e = new TypedEventEmitter<Events>();
    let ok = 0;
    e.on('msg', () => { throw new Error('boom'); });
    e.on('msg', () => { ok += 1; });
    e.emit('msg', 'x');
    expect(ok).toBe(1);
  });
});

describe('lazyImage', () => {
  it('falls back to immediate load when IO unavailable', () => {
    const orig = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = undefined;
    const loader = createLazyImageLoader();
    const img = document.createElement('img');
    img.setAttribute('data-src', 'https://example.com/foo.png');
    loader.observe(img);
    expect(img.src).toBe('https://example.com/foo.png');
    expect(img.getAttribute('data-src')).toBeNull();
    (globalThis as any).IntersectionObserver = orig;
  });
});

describe('retryAfter', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    expect(parseRetryAfter('0')).toBe(0);
  });
  it('parses HTTP-date', () => {
    const now = Date.parse('2025-01-01T00:00:00Z');
    expect(parseRetryAfter('Wed, 01 Jan 2025 00:00:30 GMT', now)).toBe(30_000);
  });
  it('returns null for garbage / null input', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('not-a-date')).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
  });
  it('retryAfterDelay clamps to maxMs and uses fallback', () => {
    const random = () => 0.5; // jitter contribution = 0
    const d = retryAfterDelay('1000', 5_000, 60_000, 0.2, 0, random);
    expect(d).toBe(60_000);
    const fb = retryAfterDelay(null, 7_500, 60_000, 0, 0, random);
    expect(fb).toBe(7_500);
  });
});
