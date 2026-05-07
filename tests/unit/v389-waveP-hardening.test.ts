// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave P - perf hardening tests

import { describe, it, expect } from 'vitest';
import {
  CHUNK_MAX_KB,
  IPC_PAYLOAD_BUDGET_BYTES,
  classifyMemory,
  computeWindow,
  decideImageLoad,
  planChunks,
  trimIpcPayload,
} from '../../src/shared/perf/hardening';

// -------- chunk planner -------------------------------------------

describe('wave P - chunk planner', () => {
  it('puts all critical apps in main', () => {
    const plan = planChunks([
      { id: 'shell', sizeKb: 100, critical: true },
      { id: 'files', sizeKb: 80, critical: true },
      { id: 'forge', sizeKb: 250, critical: false },
    ]);
    expect(plan[0].chunkId).toBe('main');
    expect(plan[0].appIds.sort()).toEqual(['files', 'shell']);
  });

  it('bin-packs non-critical into <= max chunks', () => {
    const plan = planChunks([
      { id: 'shell', sizeKb: 100, critical: true },
      { id: 'a', sizeKb: 300, critical: false },
      { id: 'b', sizeKb: 200, critical: false },
      { id: 'c', sizeKb: 400, critical: false },
    ]);
    const lazy = plan.filter((p) => p.chunkId !== 'main');
    for (const c of lazy) {
      expect(c.totalKb).toBeLessThanOrEqual(CHUNK_MAX_KB);
    }
    const allLazyApps = lazy.flatMap((c) => c.appIds).sort();
    expect(allLazyApps).toEqual(['a', 'b', 'c']);
  });

  it('heaviest app placed first (more flexibility)', () => {
    const plan = planChunks([
      { id: 'a', sizeKb: 100, critical: false },
      { id: 'big', sizeKb: 450, critical: false },
    ]);
    const big = plan.find((c) => c.appIds.includes('big'))!;
    expect(big.appIds[0]).toBe('big');
  });
});

// -------- image lazy-load -----------------------------------------

describe('wave P - image lazy-load', () => {
  it('loads now when in viewport', () => {
    expect(decideImageLoad({ distanceFromViewportPx: 0, scrolling: false, saveData: false })).toBe('load-now');
    expect(decideImageLoad({ distanceFromViewportPx: -100, scrolling: false, saveData: false })).toBe('load-now');
  });

  it('preloads near images when not scrolling', () => {
    expect(decideImageLoad({ distanceFromViewportPx: 200, scrolling: false, saveData: false })).toBe('preload-soon');
  });

  it('defers when actively scrolling', () => {
    expect(decideImageLoad({ distanceFromViewportPx: 200, scrolling: true, saveData: false })).toBe('defer');
  });

  it('saveData reduces preload window', () => {
    expect(decideImageLoad({ distanceFromViewportPx: 300, scrolling: false, saveData: true })).toBe('defer');
    expect(decideImageLoad({ distanceFromViewportPx: 100, scrolling: false, saveData: true })).toBe('preload-soon');
  });

  it('defers far away images', () => {
    expect(decideImageLoad({ distanceFromViewportPx: 9999, scrolling: false, saveData: false })).toBe('defer');
  });
});

// -------- IPC payload trimmer -------------------------------------

describe('wave P - IPC payload trimmer', () => {
  it('passes payloads under budget through unchanged', () => {
    const r = trimIpcPayload({ a: 1, b: 'two' }, ['b'], 1000);
    expect(r.droppedFields).toEqual([]);
    expect(r.payload).toEqual({ a: 1, b: 'two' });
  });

  it('drops optional fields in order until under budget', () => {
    const big = 'x'.repeat(2000);
    const r = trimIpcPayload({ keep: 'small', a: big, b: big }, ['b', 'a'], 100);
    expect(r.droppedFields).toEqual(['b', 'a']);
    expect(r.payload).toEqual({ keep: 'small' });
    expect(r.underBudget).toBe(true);
  });

  it('default budget is 256 KB', () => {
    expect(IPC_PAYLOAD_BUDGET_BYTES).toBe(256 * 1024);
  });

  it('never touches required fields', () => {
    const big = 'x'.repeat(2000);
    const r = trimIpcPayload({ required: big }, [], 100);
    expect(r.payload.required).toBe(big);
    expect(r.underBudget).toBe(false);
  });
});

// -------- virtual window ------------------------------------------

describe('wave P - virtual window', () => {
  it('returns empty window for zero items', () => {
    const w = computeWindow(0, 30, 0, 600);
    expect(w.endIndex - w.startIndex).toBe(0);
    expect(w.padTopPx).toBe(0);
    expect(w.padBottomPx).toBe(0);
  });

  it('clamps negative scrollTop', () => {
    const w = computeWindow(100, 20, -50, 100, 0);
    expect(w.startIndex).toBe(0);
  });

  it('window covers viewport plus overscan', () => {
    const w = computeWindow(1000, 20, 200, 200, 5);
    // First visible = floor(200/20)=10, visible count = ceil(200/20)+1=11
    // start = 10-5=5, end = 10+11+5=26
    expect(w.startIndex).toBe(5);
    expect(w.endIndex).toBe(26);
    expect(w.padTopPx).toBe(5 * 20);
    expect(w.padBottomPx).toBe((1000 - 26) * 20);
  });

  it('caps endIndex at totalItems', () => {
    const w = computeWindow(15, 20, 0, 1000, 0);
    expect(w.endIndex).toBeLessThanOrEqual(15);
  });

  it('throws on non-positive itemHeight', () => {
    expect(() => computeWindow(10, 0, 0, 100)).toThrow();
  });
});

// -------- memory pressure -----------------------------------------

describe('wave P - memory pressure', () => {
  it('low at <50%', () => {
    expect(classifyMemory({ heapUsed: 20, heapLimit: 100 }).pressure).toBe('low');
  });

  it('moderate at 50-75%', () => {
    expect(classifyMemory({ heapUsed: 60, heapLimit: 100 }).pressure).toBe('moderate');
  });

  it('high at 75-90%', () => {
    const r = classifyMemory({ heapUsed: 80, heapLimit: 100 });
    expect(r.pressure).toBe('high');
    expect(r.actions).toContain('pause-prefetch');
  });

  it('critical at >=90%', () => {
    const r = classifyMemory({ heapUsed: 95, heapLimit: 100 });
    expect(r.pressure).toBe('critical');
    expect(r.actions).toContain('hint-gc');
  });

  it('zero limit treated as low', () => {
    expect(classifyMemory({ heapUsed: 100, heapLimit: 0 }).pressure).toBe('low');
  });
});
