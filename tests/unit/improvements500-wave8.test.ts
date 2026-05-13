// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  throttle,
  debounceFn,
  memoize,
  parseSemver,
  compareSemverStrings,
  semverSatisfiesGte,
  stringifyQuery,
  parseQuery,
  parseSafeUrl,
  isHttpUrl,
  mean,
  median,
  variance,
  stddev,
  percentile,
  minMax,
  histogram,
  sturgesBinCount,
  linearScale,
  logScale,
  niceTicks,
  measureText,
  truncateToWidth,
  Typewriter,
} from '../../src/renderer/improvements500';

describe('throttle / debounceFn', () => {
  it('throttle leading-edge fires immediately and then suppresses', async () => {
    const spy = vi.fn();
    const t = throttle(spy, 50);
    t('a'); t('b'); t('c');
    expect(spy).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(spy).toHaveBeenCalledTimes(2); // trailing
    t.cancel();
  });
  it('debounceFn coalesces calls', async () => {
    const spy = vi.fn();
    const d = debounceFn(spy, 30);
    d(1); d(2); d(3);
    expect(spy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 60));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(3);
  });
  it('debounceFn flush invokes pending immediately', () => {
    const spy = vi.fn();
    const d = debounceFn(spy, 100);
    d('x');
    d.flush();
    expect(spy).toHaveBeenCalledWith('x');
  });
});

describe('memoize', () => {
  it('caches by stringified args', () => {
    const spy = vi.fn((n: number) => n * 2);
    const m = memoize(spy);
    expect(m(3)).toBe(6);
    expect(m(3)).toBe(6);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(m.size()).toBe(1);
  });
  it('honours max with FIFO eviction', () => {
    const spy = vi.fn((n: number) => n);
    const m = memoize(spy, { max: 2 });
    m(1); m(2); m(3);
    expect(m.size()).toBe(2);
    m(1); // recomputed
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

describe('semver', () => {
  it('parses and compares', () => {
    expect(parseSemver('1.2.3')?.minor).toBe(2);
    expect(parseSemver('not-a-version')).toBeNull();
    expect(compareSemverStrings('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemverStrings('2.0.0', '1.99.99')).toBe(1);
  });
  it('prerelease is less than no-prerelease', () => {
    expect(compareSemverStrings('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemverStrings('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
  });
  it('semverSatisfiesGte', () => {
    expect(semverSatisfiesGte('2.1.0', '2.0.0')).toBe(true);
    expect(semverSatisfiesGte('1.9.9', '2.0.0')).toBe(false);
  });
});

describe('queryString', () => {
  it('round-trips simple values', () => {
    const s = stringifyQuery({ a: '1', b: 'two words', c: 3 });
    expect(s).toBe('a=1&b=two%20words&c=3');
    expect(parseQuery(s)).toEqual({ a: '1', b: 'two words', c: '3' });
  });
  it('handles repeated keys as array', () => {
    expect(parseQuery('x=1&x=2&x=3').x).toEqual(['1', '2', '3']);
  });
  it('strips leading question mark', () => {
    expect(parseQuery('?a=1')).toEqual({ a: '1' });
  });
  it('arrays in stringify expand to repeated keys', () => {
    expect(stringifyQuery({ tag: ['a', 'b'] })).toBe('tag=a&tag=b');
  });
});

describe('urlSafe', () => {
  it('rejects javascript and data URIs', () => {
    expect(parseSafeUrl('javascript:alert(1)')).toBeNull();
    expect(parseSafeUrl('data:text/html,<script>')).toBeNull();
  });
  it('accepts http(s)', () => {
    const u = parseSafeUrl('https://example.com/x?y=1#z');
    expect(u?.host).toBe('example.com');
    expect(isHttpUrl('http://x')).toBe(true);
    expect(isHttpUrl('ftp://x')).toBe(false);
  });
  it('respects allowSchemes override', () => {
    expect(parseSafeUrl('data:text/plain,hi', { allowSchemes: ['data:'] })?.protocol).toBe('data:');
  });
});

describe('statsBasic', () => {
  it('mean / median / variance / stddev', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 5);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 5);
  });
  it('percentile interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
  it('handles empties without throwing', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(minMax([]).max).toBeNaN();
  });
});

describe('histogram', () => {
  it('produces bins of correct count', () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { bins: 5 });
    expect(bins.length).toBe(5);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(10);
  });
  it('sturgesBinCount monotonic', () => {
    expect(sturgesBinCount(1)).toBe(1);
    expect(sturgesBinCount(100)).toBeGreaterThanOrEqual(7);
  });
  it('flat data returns single bin', () => {
    const bins = histogram([5, 5, 5]);
    expect(bins.length).toBe(1);
    expect(bins[0].count).toBe(3);
  });
});

describe('chartScale', () => {
  it('linearScale maps endpoints', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s.toRange(0)).toBe(0);
    expect(s.toRange(10)).toBe(100);
    expect(s.toDomain(50)).toBe(5);
  });
  it('logScale rejects non-positive domain', () => {
    expect(() => logScale([0, 10], [0, 100])).toThrow();
  });
  it('niceTicks produces aligned values', () => {
    const t = niceTicks(0, 100, 5);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(100);
  });
});

describe('textMetrics', () => {
  it('measureText returns positive width for non-empty input', () => {
    const m = measureText('hello', 16);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
  });
  it('truncateToWidth ellipsis on overflow', () => {
    const out = truncateToWidth('this is a long sentence', 16, 1);
    expect(out.endsWith('\u2026')).toBe(true);
  });
});

describe('Typewriter', () => {
  it('emits progressive prefixes and finishes', async () => {
    const frames: string[] = [];
    const tw = new Typewriter((s) => frames.push(s), { msPerChar: 5 });
    tw.start('hi');
    await new Promise((r) => setTimeout(r, 50));
    expect(frames[0]).toBe('');
    expect(frames[frames.length - 1]).toBe('hi');
  });
  it('finish jumps to end', () => {
    const frames: string[] = [];
    const tw = new Typewriter((s) => frames.push(s), { msPerChar: 1000 });
    tw.start('abc');
    tw.finish();
    expect(frames[frames.length - 1]).toBe('abc');
  });
});
