// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { Counter, Gauge, Histogram, MetricRegistry } from '../../src/shared/metrics';

describe('Counter', () => {
  it('starts at 0 and increments', () => {
    const c = new Counter('test');
    expect(c.value).toBe(0);
    c.inc();
    c.inc(4);
    expect(c.value).toBe(5);
  });

  it('resets', () => {
    const c = new Counter('x');
    c.inc(10);
    c.reset();
    expect(c.value).toBe(0);
  });

  it('snapshot has correct shape', () => {
    const c = new Counter('ev', 'events', { app: 'test' });
    c.inc(3);
    const s = c.snapshot();
    expect(s.kind).toBe('counter');
    expect(s.value).toBe(3);
    expect(s.unit).toBe('events');
    expect(s.tags?.app).toBe('test');
    expect(typeof s.t).toBe('number');
  });
});

describe('Gauge', () => {
  it('reports last set value', () => {
    const g = new Gauge('heap');
    g.set(100);
    g.set(200);
    expect(g.value).toBe(200);
    expect(g.snapshot().value).toBe(200);
  });
});

describe('Histogram', () => {
  it('computes percentiles', () => {
    const h = new Histogram('latency');
    for (let i = 1; i <= 100; i++) h.record(i);
    const s = h.snapshot();
    expect(s.count).toBe(100);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p50).toBeGreaterThanOrEqual(48);
    expect(s.p50).toBeLessThanOrEqual(52);
    expect(s.p95).toBeGreaterThanOrEqual(93);
  });

  it('respects capacity', () => {
    const h = new Histogram('small', 10);
    for (let i = 0; i < 20; i++) h.record(i);
    expect(h.snapshot().count).toBe(10);
  });

  it('empty snapshot has all zeros', () => {
    const s = new Histogram('empty').snapshot();
    expect(s.count).toBe(0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(0);
  });
});

describe('MetricRegistry', () => {
  it('returns same counter on repeated calls', () => {
    const r = new MetricRegistry();
    const c1 = r.counter('x');
    const c2 = r.counter('x');
    expect(c1).toBe(c2);
  });

  it('snapshots includes all metric types', () => {
    const r = new MetricRegistry();
    r.counter('c').inc(1);
    r.gauge('g').set(5);
    r.histogram('h').record(10);
    const snaps = r.snapshots();
    expect(snaps.some(s => s.kind === 'counter')).toBe(true);
    expect(snaps.some(s => s.kind === 'gauge')).toBe(true);
    expect(snaps.some(s => s.kind === 'histogram')).toBe(true);
  });
});
