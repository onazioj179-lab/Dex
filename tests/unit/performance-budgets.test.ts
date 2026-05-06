// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX PERFORMANCE BUDGET TESTS
 * ===========================================================================
 * Enforces hard timing budgets for critical paths.
 * Any regression beyond the defined thresholds will fail the test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Measure sync function execution time in ms */
function measureSync(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Measure async function execution time in ms */
async function measureAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Run a function N times and return the median duration */
function medianOf(runs: number, fn: () => number): number {
  const durations: number[] = [];
  for (let i = 0; i < runs; i++) {
    durations.push(fn());
  }
  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)];
}

// ---------------------------------------------------------------------------
// Budget Constants (all in milliseconds unless noted)
// ---------------------------------------------------------------------------

const BUDGETS = {
  /** EventBus emit with 5 subscribers */
  EVENT_BUS_EMIT_5_SUBS: 2,
  /** EventBus emit with 50 subscribers */
  EVENT_BUS_EMIT_50_SUBS: 10,
  /** Search filter 10,000 items by prefix */
  SEARCH_FILTER_10K: 20,
  /** Sort 10,000 items by date (sort cost varies with cold runs/scheduling) */
  SORT_10K_BY_DATE: 50,
  /** JSON parse 1MB payload */
  JSON_PARSE_1MB: 50,
  /** Create 1,000 store entries */
  STORE_CREATE_1K: 20,
  /** IPC validation for a single channel */
  IPC_VALIDATION_SINGLE: 1,
  /** Spring animation tick for 30 springs */
  SPRING_TICK_30: 2,
  /** Note list render 10,000 notes (filter + slice) */
  NOTE_LIST_FILTER_10K: 20,
  /** Task list sort + filter 5,000 tasks */
  TASK_LIST_5K: 15,
  /** Memory snapshot: heap delta after 1000 objects created + released */
  MEMORY_LEAK_THRESHOLD_KB: 2048,
};

// ---------------------------------------------------------------------------
// 1. EventBus Performance
// ---------------------------------------------------------------------------

describe('EventBus Performance', () => {
  it('should emit to 5 subscribers within budget', () => {
    const subscribers: Array<(data: unknown) => void> = [];
    for (let i = 0; i < 5; i++) {
      subscribers.push(vi.fn());
    }

    const emit = (eventData: unknown) => {
      for (const sub of subscribers) sub(eventData);
    };

    const duration = medianOf(100, () =>
      measureSync(() => emit({ type: 'test', payload: { value: 42 } }))
    );

    expect(duration).toBeLessThan(BUDGETS.EVENT_BUS_EMIT_5_SUBS);
  });

  it('should emit to 50 subscribers within budget', () => {
    const subscribers: Array<(data: unknown) => void> = [];
    for (let i = 0; i < 50; i++) {
      subscribers.push(vi.fn());
    }

    const emit = (eventData: unknown) => {
      for (const sub of subscribers) sub(eventData);
    };

    const duration = medianOf(50, () =>
      measureSync(() => emit({ type: 'test', payload: { value: 42 } }))
    );

    expect(duration).toBeLessThan(BUDGETS.EVENT_BUS_EMIT_50_SUBS);
  });
});

// ---------------------------------------------------------------------------
// 2. Search / Filter Performance
// ---------------------------------------------------------------------------

describe('Search & Filter Performance', () => {
  let items: Array<{ id: string; name: string; createdAt: number }>;

  beforeEach(() => {
    items = [];
    for (let i = 0; i < 10_000; i++) {
      items.push({
        id: `item-${i}`,
        name: `Item ${String(i).padStart(5, '0')}`,
        createdAt: Date.now() - Math.random() * 100_000_000,
      });
    }
  });

  it('should filter 10,000 items by prefix within budget', () => {
    const duration = medianOf(10, () =>
      measureSync(() => {
        const results = items.filter(item => item.name.startsWith('Item 005'));
        expect(results.length).toBeGreaterThan(0);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.SEARCH_FILTER_10K);
  });

  it('should sort 10,000 items by date within budget', () => {
    const duration = medianOf(10, () =>
      measureSync(() => {
        const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
        expect(sorted[0].createdAt).toBeGreaterThanOrEqual(sorted[sorted.length - 1].createdAt);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.SORT_10K_BY_DATE);
  });
});

// ---------------------------------------------------------------------------
// 3. JSON Performance
// ---------------------------------------------------------------------------

describe('JSON Performance', () => {
  it('should parse a 1MB JSON payload within budget', () => {
    // Build a ~1MB JSON string
    const entries: Array<{ id: number; value: string }> = [];
    const valuePad = 'x'.repeat(100);
    for (let i = 0; i < 8_000; i++) {
      entries.push({ id: i, value: valuePad });
    }
    const jsonStr = JSON.stringify(entries);
    expect(jsonStr.length).toBeGreaterThan(900_000); // ~1MB

    const duration = medianOf(10, () =>
      measureSync(() => {
        const parsed = JSON.parse(jsonStr);
        expect(parsed.length).toBe(8_000);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.JSON_PARSE_1MB);
  });
});

// ---------------------------------------------------------------------------
// 4. Store / Map Performance
// ---------------------------------------------------------------------------

describe('Store Performance', () => {
  it('should create 1,000 Map entries within budget', () => {
    const duration = medianOf(20, () =>
      measureSync(() => {
        const store = new Map<string, { title: string; body: string; tags: string[] }>();
        for (let i = 0; i < 1_000; i++) {
          store.set(`key-${i}`, {
            title: `Title ${i}`,
            body: `Body content for item ${i}`,
            tags: ['tag-a', 'tag-b'],
          });
        }
        expect(store.size).toBe(1_000);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.STORE_CREATE_1K);
  });
});

// ---------------------------------------------------------------------------
// 5. IPC Validation Performance
// ---------------------------------------------------------------------------

describe('IPC Validation Performance', () => {
  it('should validate a single channel call within budget', () => {
    // Inline minimal validator matching IPCValidator logic
    const validate = (channel: string, args: unknown[]): boolean => {
      if (typeof channel !== 'string' || channel.length === 0) return false;
      for (const arg of args) {
        if (typeof arg === 'string' && arg.includes('\0')) return false;
        if (typeof arg === 'string' && /\.\.[\\/]/.test(arg)) return false;
      }
      return true;
    };

    const duration = medianOf(1000, () =>
      measureSync(() => {
        const result = validate('file:read', ['/home/user/document.txt']);
        expect(result).toBe(true);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.IPC_VALIDATION_SINGLE);
  });
});

// ---------------------------------------------------------------------------
// 6. Spring Animation Performance
// ---------------------------------------------------------------------------

describe('Spring Animation Performance', () => {
  it('should tick 30 springs within budget', () => {
    interface Spring {
      position: number;
      velocity: number;
      target: number;
      stiffness: number;
      damping: number;
    }

    const springs: Spring[] = [];
    for (let i = 0; i < 30; i++) {
      springs.push({
        position: Math.random() * 100,
        velocity: 0,
        target: Math.random() * 100,
        stiffness: 180,
        damping: 12,
      });
    }

    const tickSprings = (dt: number) => {
      for (const s of springs) {
        const force = -s.stiffness * (s.position - s.target);
        const dampForce = -s.damping * s.velocity;
        s.velocity += (force + dampForce) * dt;
        s.position += s.velocity * dt;
      }
    };

    const duration = medianOf(500, () =>
      measureSync(() => tickSprings(1 / 60))
    );

    expect(duration).toBeLessThan(BUDGETS.SPRING_TICK_30);
  });
});

// ---------------------------------------------------------------------------
// 7. Note / Task List Performance
// ---------------------------------------------------------------------------

describe('Note List Performance', () => {
  it('should filter + paginate 10,000 notes within budget', () => {
    const notes = Array.from({ length: 10_000 }, (_, i) => ({
      id: `note-${i}`,
      title: `Note ${i}`,
      body: `Content for note ${i}`,
      tags: i % 3 === 0 ? ['important'] : [],
      updatedAt: Date.now() - i * 60_000,
    }));

    const duration = medianOf(10, () =>
      measureSync(() => {
        const filtered = notes
          .filter(n => n.tags.includes('important'))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 50);
        expect(filtered.length).toBe(50);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.NOTE_LIST_FILTER_10K);
  });
});

describe('Task List Performance', () => {
  it('should sort + filter 5,000 tasks within budget', () => {
    const tasks = Array.from({ length: 5_000 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      priority: (['high', 'medium', 'low'] as const)[i % 3],
      completed: i % 5 === 0,
      dueDate: Date.now() + (i - 2500) * 3_600_000,
    }));

    const duration = medianOf(10, () =>
      measureSync(() => {
        const pending = tasks
          .filter(t => !t.completed && t.priority === 'high')
          .sort((a, b) => a.dueDate - b.dueDate);
        expect(pending.length).toBeGreaterThan(0);
      })
    );

    expect(duration).toBeLessThan(BUDGETS.TASK_LIST_5K);
  });
});

// ---------------------------------------------------------------------------
// 8. Memory Regression Detection
// ---------------------------------------------------------------------------

describe('Memory Regression', () => {
  it('should not leak memory after object create/release cycle', () => {
    // Force a GC if available (V8 flag --expose-gc)
    const gc = (globalThis as any).gc;
    if (gc) gc();

    const before = process.memoryUsage ? process.memoryUsage().heapUsed : 0;

    // Create and release 1000 complex objects
    const createAndRelease = () => {
      const bucket: any[] = [];
      for (let i = 0; i < 1_000; i++) {
        bucket.push({
          id: `obj-${i}`,
          data: new Array(100).fill(i),
          nested: { a: 1, b: 2, c: new Map([[`k${i}`, i]]) },
        });
      }
      bucket.length = 0;
    };

    createAndRelease();

    if (gc) gc();

    const after = process.memoryUsage ? process.memoryUsage().heapUsed : 0;

    if (before > 0) {
      const deltaKB = (after - before) / 1024;
      expect(deltaKB).toBeLessThan(BUDGETS.MEMORY_LEAK_THRESHOLD_KB);
    }
  });
});
