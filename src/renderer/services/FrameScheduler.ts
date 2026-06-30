// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * FrameScheduler — cooperative, frame-budgeted background-task scheduler.
 *
 * The scale problem: DEX keeps every app mounted and UKI can work while the
 * user navigates. If each app + UKI does its background work on raw timers/loops
 * they all pile onto the SAME main thread, and the UI janks. This scheduler is
 * the OS-style fix: callers hand it background work with a priority; it runs
 * that work in small time-sliced bursts, yielding to the browser between slices
 * so input + rendering stay smooth no matter how many apps are open.
 *
 *   - Priority: `user` (visible, responsive) > `normal` > `idle` (deferrable).
 *   - Per-frame TIME BUDGET scaled by the device tier (weaker hardware gets a
 *     smaller slice, so it never blocks the paint). Work that exceeds the budget
 *     is resumed on the next slice — never run-to-completion in one blocking go.
 *   - Lifecycle-aware: a task tagged with an `appId` whose app is `suspended`
 *     (deep background / idle) is deferred until that app resumes, so off-screen
 *     apps consume zero scheduler time. Pairs with AppLifecycle + TierManager.
 *
 * Yielding uses a MessageChannel (runs right after the current task, before the
 * next event-loop turn) — the same primitive React's scheduler uses — so we
 * relinquish the thread frequently instead of hogging it.
 */

import { appLifecycle } from './AppLifecycle';
import { getStoredTier, type DeviceTier } from './TierManager';

export type TaskPriority = 'user' | 'normal' | 'idle';

export interface ScheduleOptions {
  /** Scheduling band. Default `normal`. */
  priority?: TaskPriority;
  /** Owning app; tasks for a `suspended` app are deferred until it resumes. */
  appId?: string;
}

export interface SchedulerTask {
  id: number;
  fn: () => void;
  priority: TaskPriority;
  appId?: string;
}

export const PRIORITY_ORDER: TaskPriority[] = ['user', 'normal', 'idle'];

/** Per-tier per-slice time budget in ms. Weaker hardware yields sooner. */
export const TIER_BUDGET_MS: Record<DeviceTier, number> = { low: 3, mid: 6, high: 9, ultra: 12 };

export interface DrainOptions {
  /** Time budget for this slice, in ms. */
  budgetMs: number;
  /** Monotonic clock (injected for testability). */
  now: () => number;
  /** Whether an app is currently suspended (its tasks should be deferred). */
  isSuspended: (appId: string) => boolean;
  /** Tasks deferred because their app is suspended (mutated in place). */
  deferred: SchedulerTask[];
}

export interface DrainResult {
  /** Number of task functions actually invoked this slice. */
  ran: number;
  /** True if the budget was hit with work still queued (needs another slice). */
  budgetHit: boolean;
}

/**
 * Pure drain step: run queued tasks in priority order until the time budget is
 * spent. Tasks whose app is suspended are moved to `deferred` instead of run.
 * Pure (no globals, injected clock) so the scheduling policy is unit-testable.
 */
export function drainQueues(
  queues: Record<TaskPriority, SchedulerTask[]>,
  opts: DrainOptions,
): DrainResult {
  const start = opts.now();
  let ran = 0;

  // Re-admit any deferred task whose app has resumed (or lost its appId).
  if (opts.deferred.length) {
    const stillSuspended: SchedulerTask[] = [];
    for (const t of opts.deferred) {
      if (t.appId && opts.isSuspended(t.appId)) stillSuspended.push(t);
      else queues[t.priority].push(t);
    }
    opts.deferred.length = 0;
    opts.deferred.push(...stillSuspended);
  }

  for (const p of PRIORITY_ORDER) {
    const q = queues[p];
    while (q.length) {
      if (opts.now() - start >= opts.budgetMs) {
        return { ran, budgetHit: true };
      }
      const t = q.shift()!;
      if (t.appId && opts.isSuspended(t.appId)) {
        opts.deferred.push(t);
        continue;
      }
      try {
        t.fn();
        ran++;
      } catch (err) {
        // A misbehaving task must not stall the whole queue.
        // eslint-disable-next-line no-console
        console.warn('[FrameScheduler] task threw', err);
      }
    }
  }
  return { ran, budgetHit: false };
}

class FrameSchedulerService {
  private queues: Record<TaskPriority, SchedulerTask[]> = { user: [], normal: [], idle: [] };
  private deferred: SchedulerTask[] = [];
  private nextId = 1;
  private scheduled = false;
  private port: MessagePort | null = null;

  constructor() {
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => this.flush();
      this.port = channel.port2;
    }
  }

  /** Queue a unit of background work. Returns an id usable with `cancel`. */
  schedule(fn: () => void, opts: ScheduleOptions = {}): number {
    const task: SchedulerTask = { id: this.nextId++, fn, priority: opts.priority ?? 'normal', appId: opts.appId };
    this.queues[task.priority].push(task);
    this.requestFlush();
    return task.id;
  }

  /** Remove a not-yet-run task. */
  cancel(id: number): void {
    for (const p of PRIORITY_ORDER) {
      const i = this.queues[p].findIndex((t) => t.id === id);
      if (i >= 0) { this.queues[p].splice(i, 1); return; }
    }
    const di = this.deferred.findIndex((t) => t.id === id);
    if (di >= 0) this.deferred.splice(di, 1);
  }

  /** Tasks waiting to run (excludes deferred-by-suspend). */
  pending(): number {
    return this.queues.user.length + this.queues.normal.length + this.queues.idle.length;
  }

  private budgetMs(): number {
    // getStoredTier() can be null before a tier is detected — default to 'mid'.
    return TIER_BUDGET_MS[getStoredTier() ?? 'mid'] ?? 6;
  }

  private requestFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (this.port) this.port.postMessage(null);
    else Promise.resolve().then(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;
    const result = drainQueues(this.queues, {
      budgetMs: this.budgetMs(),
      now: () => performance.now(),
      isSuspended: (appId) => appLifecycle.getPhase(appId) === 'suspended',
      deferred: this.deferred,
    });
    if (result.budgetHit || this.pending() > 0) this.requestFlush();
  }
}

export const frameScheduler = new FrameSchedulerService();
