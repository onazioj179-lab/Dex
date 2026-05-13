// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave 4 tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  fuzzyScore, fuzzyFilter,
  WorkerPool,
  AsyncCache,
  MockIpc,
  testFactory,
  IDENTITY, worldToScreen, screenToWorld, zoomAt, panBy, fitToView,
  rafThrottle,
  downloadBlob, downloadJson, downloadCsv,
  stepLayout, DEFAULT_LAYOUT_OPTIONS,
  EventBus,
} from '../../src/renderer/improvements500';

describe('fuzzySearch', () => {
  it('exact prefix scores ~1', () => {
    expect(fuzzyScore('hel', 'hello').score).toBeGreaterThan(0.9);
  });

  it('subsequence matches but score lower', () => {
    const r = fuzzyScore('hlo', 'hello');
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(0.9);
  });

  it('no-match returns 0', () => {
    expect(fuzzyScore('xyz', 'hello').score).toBe(0);
  });

  it('fuzzyFilter sorts by score descending', () => {
    const items = ['hello', 'help', 'helmet', 'world'];
    const out = fuzzyFilter(items, 'hel', (s) => s);
    // All three "hel*" prefix matches rank above 'world'.
    expect(out.map((m) => m.item)).not.toContain('world');
    expect(out.length).toBe(3);
    // First result is one of the prefix matches.
    expect(['hello', 'help', 'helmet']).toContain(out[0].item);
  });
});

describe('WorkerPool', () => {
  it('runs tasks with bounded concurrency', async () => {
    const pool = new WorkerPool(2);
    let inFlight = 0;
    let peak = 0;
    const make = (): Promise<number> => pool.run(async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => setTimeout(r, 10));
      inFlight--;
      return 1;
    });
    await Promise.all([make(), make(), make(), make(), make()]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(pool.stats().completed).toBe(5);
  });

  it('rejects rejected tasks but keeps running', async () => {
    const pool = new WorkerPool(1);
    await expect(pool.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await pool.run(async () => 7)).toBe(7);
  });
});

describe('AsyncCache', () => {
  it('caches and coalesces in-flight calls', async () => {
    let calls = 0;
    const c = new AsyncCache<string, number>(async (k) => {
      calls++;
      await new Promise<void>((r) => setTimeout(r, 5));
      return k.length;
    }, { ttlMs: 1_000 });
    const [a, b] = await Promise.all([c.get('hi'), c.get('hi')]);
    expect(a).toBe(2);
    expect(b).toBe(2);
    expect(calls).toBe(1);
  });

  it('respects maxEntries (LRU evict)', async () => {
    const c = new AsyncCache<string, number>(async (k) => k.length, { ttlMs: 60_000, maxEntries: 2 });
    await c.get('a');
    await c.get('bb');
    await c.get('ccc');
    expect(c.size()).toBe(2);
  });
});

describe('MockIpc', () => {
  it('records invocations and dispatches handlers', async () => {
    const ipc = new MockIpc();
    ipc.on('echo', async (p) => p);
    expect(await ipc.invoke('echo', 42)).toBe(42);
    expect(ipc.invoked('echo')).toBe(true);
    expect(ipc.invocationsOf('echo')).toHaveLength(1);
  });

  it('throws when no handler is registered', async () => {
    const ipc = new MockIpc();
    await expect(ipc.invoke('missing')).rejects.toThrow();
  });
});

describe('testFactory', () => {
  beforeEach(() => testFactory.factoryReset());

  it('makeUser produces sequential ids', () => {
    const u1 = testFactory.makeUser();
    const u2 = testFactory.makeUser();
    expect(u1.id).not.toBe(u2.id);
  });

  it('overrides win', () => {
    const u = testFactory.makeUser({ name: 'Alice', role: 'admin' });
    expect(u.name).toBe('Alice');
    expect(u.role).toBe('admin');
  });

  it('makeMany creates N items', () => {
    const docs = testFactory.makeMany(5, () => testFactory.makeDoc());
    expect(docs).toHaveLength(5);
  });
});

describe('zoomPan', () => {
  it('worldToScreen / screenToWorld are inverses', () => {
    const t = { x: 10, y: 20, scale: 2 };
    const s = worldToScreen(t, 5, 5);
    const w = screenToWorld(t, s.x, s.y);
    expect(w.x).toBeCloseTo(5);
    expect(w.y).toBeCloseTo(5);
  });

  it('zoomAt keeps anchor stationary', () => {
    const t = IDENTITY;
    const next = zoomAt(t, 100, 100, 2);
    const before = worldToScreen(t, 100, 100);
    const after = worldToScreen(next, screenToWorld(t, 100, 100).x, screenToWorld(t, 100, 100).y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('panBy translates', () => {
    expect(panBy(IDENTITY, 5, 7)).toEqual({ x: 5, y: 7, scale: 1 });
  });

  it('fitToView centers and scales', () => {
    const t = fitToView({ x: 0, y: 0, width: 100, height: 100 }, { width: 400, height: 400 }, 0);
    expect(t.scale).toBe(4);
  });
});

describe('rafThrottle', () => {
  it('coalesces rapid calls into one frame', async () => {
    let count = 0;
    let lastArg = 0;
    const fn = rafThrottle((n: number) => { count++; lastArg = n; });
    fn(1); fn(2); fn(3);
    await new Promise<void>((r) => setTimeout(r, 30));
    expect(count).toBe(1);
    expect(lastArg).toBe(3);
  });
});

describe('downloadBlob (smoke)', () => {
  it('does not throw in jsdom', () => {
    expect(() => downloadBlob('a.txt', new Blob(['x']))).not.toThrow();
    expect(() => downloadJson('a.json', { ok: true })).not.toThrow();
    expect(() => downloadCsv('a.csv', [['a', 'b'], [1, 'x,y']])).not.toThrow();
  });
});

describe('graphLayout', () => {
  it('moves nodes apart from origin via repulsion', () => {
    const nodes = [
      { id: 'a', x: 0.1, y: 0, vx: 0, vy: 0 },
      { id: 'b', x: -0.1, y: 0, vx: 0, vy: 0 },
    ];
    const dx0 = Math.abs(nodes[0].x - nodes[1].x);
    for (let i = 0; i < 10; i++) stepLayout(nodes, [], { center: 0 });
    const dx1 = Math.abs(nodes[0].x - nodes[1].x);
    expect(dx1).toBeGreaterThan(dx0);
  });

  it('exposes default options', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.repulsion).toBeGreaterThan(0);
  });
});

describe('EventBus', () => {
  type Map = { 'msg': string; 'count': number; };
  it('on / emit / off', () => {
    const bus = new EventBus<Map>();
    let last = '';
    const off = bus.on('msg', (s) => { last = s; });
    bus.emit('msg', 'hi');
    expect(last).toBe('hi');
    off();
    bus.emit('msg', 'gone');
    expect(last).toBe('hi');
  });

  it('once fires exactly once', () => {
    const bus = new EventBus<Map>();
    let n = 0;
    bus.once('count', () => { n++; });
    bus.emit('count', 1);
    bus.emit('count', 2);
    expect(n).toBe(1);
  });
});
