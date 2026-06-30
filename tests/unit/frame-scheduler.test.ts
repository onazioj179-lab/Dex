// =============================================================================
// DEX Platform — FrameScheduler policy tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { drainQueues, type SchedulerTask, type TaskPriority } from '../../src/renderer/services/FrameScheduler';

function makeQueues(): Record<TaskPriority, SchedulerTask[]> {
  return { user: [], normal: [], idle: [] };
}
let idCounter = 0;
function task(fn: () => void, priority: TaskPriority, appId?: string): SchedulerTask {
  return { id: ++idCounter, fn, priority, appId };
}

describe('FrameScheduler.drainQueues', () => {
  it('runs tasks in priority order: user > normal > idle', () => {
    const order: string[] = [];
    const q = makeQueues();
    q.idle.push(task(() => order.push('idle'), 'idle'));
    q.user.push(task(() => order.push('user'), 'user'));
    q.normal.push(task(() => order.push('normal'), 'normal'));
    const r = drainQueues(q, { budgetMs: 1000, now: () => 0, isSuspended: () => false, deferred: [] });
    expect(order).toEqual(['user', 'normal', 'idle']);
    expect(r.ran).toBe(3);
    expect(r.budgetHit).toBe(false);
  });

  it('stops at the time budget and leaves the remainder queued (never blocks)', () => {
    let t = 0;
    const order: number[] = [];
    const q = makeQueues();
    // Each task costs 5ms of wall time; an 8ms budget should run ~2 then yield.
    for (let i = 0; i < 5; i++) q.normal.push(task(() => { order.push(i); t += 5; }, 'normal'));
    const r = drainQueues(q, { budgetMs: 8, now: () => t, isSuspended: () => false, deferred: [] });
    expect(r.budgetHit).toBe(true);
    expect(order.length).toBeLessThan(5);
    expect(q.normal.length).toBe(5 - order.length);
  });

  it("defers a suspended app's tasks and re-admits them on resume", () => {
    const ran: string[] = [];
    const q = makeQueues();
    q.normal.push(task(() => ran.push('vinx'), 'normal', 'vinx'));
    q.normal.push(task(() => ran.push('home'), 'normal', 'home'));
    const deferred: SchedulerTask[] = [];

    // vinx suspended -> its task is held; home (not suspended) runs.
    drainQueues(q, { budgetMs: 1000, now: () => 0, isSuspended: (a) => a === 'vinx', deferred });
    expect(ran).toEqual(['home']);
    expect(deferred.length).toBe(1);

    // vinx resumes -> deferred task is re-admitted and runs.
    drainQueues(q, { budgetMs: 1000, now: () => 0, isSuspended: () => false, deferred });
    expect(ran).toEqual(['home', 'vinx']);
    expect(deferred.length).toBe(0);
  });
});
