// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave G - smoothness primitive tests

import { describe, it, expect } from 'vitest';
import {
  FRAME_BUDGET_MS,
  HOVER_INTENT_MS,
  LONG_TASK_THRESHOLD_MS,
  debouncePlan,
  dequeuePrefetch,
  effectiveAnimationMs,
  enqueuePrefetch,
  forgetScroll,
  hoverEnter,
  hoverLeave,
  hoverTick,
  newHoverIntent,
  newLongTaskBuffer,
  newPrefetchQueue,
  newScrollMemory,
  recallScroll,
  recordTask,
  rememberScroll,
  stepWithBudget,
  summariseTasks,
  throttlePlan,
} from '../../src/shared/perf/smoothness';
import {
  beginMutation,
  commitMutation,
  newOptimisticStore,
  pendingMutations,
  pruneStale,
  readOptimistic,
  rollbackMutation,
} from '../../src/shared/perf/optimistic';

// --------------------- frame budget -----------------------------------------

describe('wave G - stepWithBudget', () => {
  it('processes all items when budget never exhausts', () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    let t = 0;
    const r = stepWithBudget(items, 0, (v) => { seen.push(v); t += 1; }, () => t, FRAME_BUDGET_MS);
    expect(r).toEqual({ nextIndex: 5, done: true });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('yields when budget elapsed and reports next index', () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    // each step adds 6ms, budget 12ms → expect to process 2 then yield (after second step 12ms elapsed)
    let t = 0;
    const r = stepWithBudget(items, 0, (v) => { seen.push(v); t += 6; }, () => t, 12);
    expect(seen).toEqual([1, 2]);
    expect(r.done).toBe(false);
    expect(r.nextIndex).toBe(2);
  });

  it('resumes from given index', () => {
    const items = ['a', 'b', 'c'];
    const seen: string[] = [];
    let t = 0;
    const r = stepWithBudget(items, 1, (v) => { seen.push(v); }, () => t);
    expect(seen).toEqual(['b', 'c']);
    expect(r.done).toBe(true);
  });

  it('handles empty / past-end gracefully', () => {
    expect(stepWithBudget([], 0, () => {}, () => 0)).toEqual({ nextIndex: 0, done: true });
    expect(stepWithBudget([1], 5, () => {}, () => 0)).toEqual({ nextIndex: 1, done: true });
  });
});

// --------------------- debounce / throttle ---------------------------------

describe('wave G - debouncePlan', () => {
  it('fires immediately when never fired before', () => {
    expect(debouncePlan(100, null, 200)).toEqual({ fire: true, nextAllowedMs: 100 });
  });

  it('suppresses fire inside the delay window', () => {
    expect(debouncePlan(150, 100, 200)).toEqual({ fire: false, nextAllowedMs: 300 });
  });

  it('fires once delay has elapsed', () => {
    expect(debouncePlan(400, 100, 200)).toEqual({ fire: true, nextAllowedMs: 400 });
  });
});

describe('wave G - throttlePlan', () => {
  it('fires on the leading edge', () => {
    expect(throttlePlan(0, null, 100)).toEqual({ fire: true, nextAllowedMs: 100 });
  });

  it('drops events inside the interval', () => {
    expect(throttlePlan(50, 0, 100)).toEqual({ fire: false, nextAllowedMs: 100 });
  });

  it('fires the next event after the interval', () => {
    expect(throttlePlan(110, 0, 100)).toEqual({ fire: true, nextAllowedMs: 210 });
  });
});

// --------------------- hover intent ---------------------------------------

describe('wave G - hover intent', () => {
  it('default delay is 80ms', () => {
    expect(HOVER_INTENT_MS).toBe(80);
  });

  it('does not fire on quick sweeps', () => {
    let s = newHoverIntent();
    s = hoverEnter(s, 0);
    let r = hoverTick(s, 50);
    expect(r.fire).toBe(false);
    s = hoverLeave(r.state);
    r = hoverTick(s, 200);
    expect(r.fire).toBe(false);
  });

  it('fires once on intentional dwell', () => {
    let s = newHoverIntent();
    s = hoverEnter(s, 0);
    let r = hoverTick(s, 80);
    expect(r.fire).toBe(true);
    s = r.state;
    // does not fire again
    r = hoverTick(s, 120);
    expect(r.fire).toBe(false);
  });
});

// --------------------- scroll memory --------------------------------------

describe('wave G - scroll memory', () => {
  it('remembers and recalls per-key positions', () => {
    let m = newScrollMemory();
    m = rememberScroll(m, '/files', 240);
    m = rememberScroll(m, '/notes', 12);
    expect(recallScroll(m, '/files')).toBe(240);
    expect(recallScroll(m, '/notes')).toBe(12);
    expect(recallScroll(m, '/missing')).toBe(0);
  });

  it('floors fractional and clamps negative scrollTop', () => {
    let m = newScrollMemory();
    m = rememberScroll(m, '/x', -50);
    expect(recallScroll(m, '/x')).toBe(0);
    m = rememberScroll(m, '/x', 17.9);
    expect(recallScroll(m, '/x')).toBe(17);
  });

  it('forget removes a key', () => {
    let m = rememberScroll(newScrollMemory(), '/a', 99);
    m = forgetScroll(m, '/a');
    expect(recallScroll(m, '/a')).toBe(0);
  });
});

// --------------------- prefetch queue -------------------------------------

describe('wave G - prefetch queue', () => {
  it('dequeues highest-priority first', () => {
    let q = newPrefetchQueue<string>();
    q = enqueuePrefetch(q, { id: 'a', payload: 'A', priority: 1 });
    q = enqueuePrefetch(q, { id: 'b', payload: 'B', priority: 5 });
    q = enqueuePrefetch(q, { id: 'c', payload: 'C', priority: 3 });
    const r = dequeuePrefetch(q);
    expect(r.task?.id).toBe('b');
    expect(r.rest.tasks).toHaveLength(2);
  });

  it('returns null on empty', () => {
    expect(dequeuePrefetch(newPrefetchQueue()).task).toBeNull();
  });

  it('updates existing task by id without duplicating', () => {
    let q = newPrefetchQueue<string>();
    q = enqueuePrefetch(q, { id: 'a', payload: 'A', priority: 1 });
    q = enqueuePrefetch(q, { id: 'a', payload: 'A2', priority: 9 });
    expect(q.tasks).toHaveLength(1);
    const r = dequeuePrefetch(q);
    expect(r.task?.payload).toBe('A2');
    expect(r.task?.priority).toBe(9);
  });
});

// --------------------- long-task buffer ----------------------------------

describe('wave G - long-task buffer', () => {
  it('drops tasks under the threshold', () => {
    const b = recordTask(newLongTaskBuffer(), {
      startedAt: 0,
      durationMs: 10,
      label: 'cheap',
    });
    expect(b.entries).toHaveLength(0);
  });

  it('records tasks at or over the threshold', () => {
    const b = recordTask(newLongTaskBuffer(), {
      startedAt: 0,
      durationMs: LONG_TASK_THRESHOLD_MS,
      label: 'render',
    });
    expect(b.entries).toHaveLength(1);
  });

  it('trims to capacity (FIFO)', () => {
    let b = newLongTaskBuffer(2);
    b = recordTask(b, { startedAt: 1, durationMs: 100, label: 'a' });
    b = recordTask(b, { startedAt: 2, durationMs: 100, label: 'b' });
    b = recordTask(b, { startedAt: 3, durationMs: 100, label: 'c' });
    expect(b.entries.map((e) => e.label)).toEqual(['b', 'c']);
  });

  it('summarises by label, sorted by total duration desc', () => {
    let b = newLongTaskBuffer();
    b = recordTask(b, { startedAt: 1, durationMs: 100, label: 'render' });
    b = recordTask(b, { startedAt: 2, durationMs: 60, label: 'render' });
    b = recordTask(b, { startedAt: 3, durationMs: 200, label: 'scan' });
    const s = summariseTasks(b);
    expect(s[0]).toEqual({ label: 'scan', count: 1, totalMs: 200, maxMs: 200 });
    expect(s[1]).toEqual({ label: 'render', count: 2, totalMs: 160, maxMs: 100 });
  });
});

// --------------------- reduced motion -------------------------------------

describe('wave G - reduced motion', () => {
  it('returns the requested duration when motion is allowed', () => {
    expect(effectiveAnimationMs(200, false)).toBe(200);
  });

  it('collapses to 0 when reduced motion is on', () => {
    expect(effectiveAnimationMs(200, true)).toBe(0);
  });

  it('honours the opacity-only fallback', () => {
    expect(effectiveAnimationMs(200, true, 80)).toBe(80);
  });
});

// --------------------- optimistic store -----------------------------------

describe('wave G - optimistic mutations', () => {
  it('shows new value immediately on begin', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'note-1', 'hello', 0);
    expect(readOptimistic(s, 'note-1')).toBe('hello');
    expect(pendingMutations(s)).toHaveLength(1);
  });

  it('commit clears the rollback snapshot', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'n', 'v1', 0);
    s = commitMutation(s, 'n');
    expect(s.entries.n.status).toBe('committed');
    expect(s.entries.n.previous).toBeNull();
    expect(pendingMutations(s)).toHaveLength(0);
  });

  it('commit accepts a server-side override value', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'n', 'local', 0);
    s = commitMutation(s, 'n', 'server');
    expect(readOptimistic(s, 'n')).toBe('server');
  });

  it('rollback restores previous value', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'n', 'old', 0);
    s = commitMutation(s, 'n');
    s = beginMutation(s, 'n', 'new', 100);
    s = rollbackMutation(s, 'n', 'oops');
    expect(readOptimistic(s, 'n')).toBe('old');
    expect(s.entries.n.status).toBe('rolled-back');
    expect(s.entries.n.error).toBe('oops');
  });

  it('rollback of a created entry drops it', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'n', 'first', 0);
    s = rollbackMutation(s, 'n', 'fail');
    expect(readOptimistic(s, 'n')).toBeNull();
  });

  it('pruneStale removes pending entries past the staleness window', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'a', 'A', 0);
    s = beginMutation(s, 'b', 'B', 1000);
    const r = pruneStale(s, 2500, 2000);
    expect(r.pruned).toEqual(['a']);
    expect(r.store.entries.a).toBeUndefined();
    expect(r.store.entries.b).toBeDefined();
  });

  it('pruneStale ignores committed entries even when old', () => {
    let s = newOptimisticStore<string>();
    s = beginMutation(s, 'a', 'A', 0);
    s = commitMutation(s, 'a');
    const r = pruneStale(s, 999_999, 1);
    expect(r.pruned).toEqual([]);
    expect(r.store.entries.a).toBeDefined();
  });
});
