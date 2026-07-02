// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Scheduled-task engine (pure, unit-tested). Powers UKI background tasks: work
 * that fires on a recurring cron/interval schedule, re-checks itself on the
 * shared heartbeat, and retries with exponential backoff on failure before
 * waiting for the next scheduled slot.
 *
 * This module owns the SCHEDULING MATH only — no timers, no side effects. The
 * runtime (services/scheduledTaskRunner) drives it against SharedTick and
 * executes the actual actions.
 */

import { parseCron, cronMatches } from './cron';
import { backoffDelay, shouldRetry } from './backoff';

export type ScheduleKind = 'cron' | 'interval';

/** What a scheduled task DOES when it fires (executed by the runner). */
export interface ScheduledAction {
  /** 'reminder' → notify; 'app-action' → run a registered UKI app action. */
  type: 'reminder' | 'app-action';
  /** reminder: the message body. app-action: unused. */
  message?: string;
  /** app-action: the registered action id + JSON args. */
  actionId?: string;
  args?: Record<string, unknown>;
}

export type RunOutcome = 'ok' | 'error';

export interface ScheduledTask {
  id: string;
  title: string;
  kind: ScheduleKind;
  /** Present when kind === 'cron' (5-field expression). */
  cron?: string;
  /** Present when kind === 'interval' (>= 60000ms enforced by the store). */
  intervalMs?: number;
  action: ScheduledAction;
  enabled: boolean;
  createdAt: number;

  // ---- runtime state (managed by applyRunResult / initNextRun) ----
  /** Epoch ms of the next fire; null when unschedulable/disabled. */
  nextRunAt: number | null;
  lastRunAt?: number;
  lastOutcome?: RunOutcome;
  lastError?: string;
  /** Consecutive failures in the CURRENT cycle (reset on success/next slot). */
  attempt: number;
  /** Max attempts per cycle before giving up and waiting for the next slot. */
  maxAttempts: number;
  /** Total successful + failed fires over the task's life. */
  runCount: number;
}

/** Max minutes to scan forward for a cron match (~366 days). */
const CRON_SCAN_LIMIT = 366 * 24 * 60;

/**
 * The next fire time strictly AFTER `from` (epoch ms), or null when the task
 * can't be scheduled. Cron scans minute-by-minute from the next whole minute;
 * interval is simply from + intervalMs.
 */
export function computeNextRun(task: Pick<ScheduledTask, 'kind' | 'cron' | 'intervalMs'>, from: number): number | null {
  if (task.kind === 'interval') {
    const ms = task.intervalMs ?? 0;
    if (ms < 1000) return null;
    return from + ms;
  }
  // cron
  if (!task.cron) return null;
  let spec;
  try { spec = parseCron(task.cron); } catch { return null; }
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // strictly after `from`
  for (let i = 0; i < CRON_SCAN_LIMIT; i++) {
    if (cronMatches(spec, d)) return d.getTime();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/** Initialize (or reschedule) a task's nextRunAt from `now`. */
export function initNextRun(task: ScheduledTask, now: number): ScheduledTask {
  return { ...task, nextRunAt: task.enabled ? computeNextRun(task, now) : null };
}

/** True when a task is enabled and due to fire at `now`. */
export function isDue(task: ScheduledTask, now: number): boolean {
  return task.enabled && task.nextRunAt !== null && now >= task.nextRunAt;
}

/** All tasks due to fire at `now`, soonest-scheduled first. */
export function dueTasks(tasks: readonly ScheduledTask[], now: number): ScheduledTask[] {
  return tasks
    .filter(t => isDue(t, now))
    .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0));
}

export interface RunResultOptions {
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  /** Injectable RNG for jittered backoff (deterministic under test). */
  rng?: () => number;
  jitter?: boolean;
}

/**
 * Fold a run outcome into the task's runtime state:
 *   - success  → attempt resets to 0, schedule the NEXT regular slot.
 *   - failure with retries remaining → attempt++, reschedule soon via backoff.
 *   - failure with no retries left  → attempt resets, wait for the next slot
 *     (the failure is recorded but the task keeps its cadence).
 */
export function applyRunResult(
  task: ScheduledTask,
  now: number,
  outcome: RunOutcome,
  error: string | undefined,
  opts: RunResultOptions = {},
): ScheduledTask {
  const base = {
    ...task,
    lastRunAt: now,
    lastOutcome: outcome,
    lastError: outcome === 'error' ? (error ?? 'unknown error') : undefined,
    runCount: task.runCount + 1,
  };
  if (!task.enabled) return { ...base, nextRunAt: null };

  if (outcome === 'ok') {
    return { ...base, attempt: 0, nextRunAt: computeNextRun(task, now) };
  }

  // failure
  const nextAttempt = task.attempt + 1;
  if (shouldRetry(task.attempt, task.maxAttempts)) {
    const delay = backoffDelay(task.attempt, { baseMs: opts.baseMs, factor: opts.factor, maxMs: opts.maxMs, jitter: opts.jitter, rng: opts.rng });
    return { ...base, attempt: nextAttempt, nextRunAt: now + Math.max(1000, delay) };
  }
  // give up this cycle — resume normal cadence
  return { ...base, attempt: 0, nextRunAt: computeNextRun(task, now) };
}

/** Human-readable summary of a task's schedule (for the UI). */
export function describeSchedule(task: Pick<ScheduledTask, 'kind' | 'cron' | 'intervalMs'>): string {
  if (task.kind === 'interval') {
    const ms = task.intervalMs ?? 0;
    const min = Math.round(ms / 60000);
    if (min < 60) return `every ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `every ${hr} hr`;
    return `every ${Math.round(hr / 24)} d`;
  }
  return task.cron ? `cron: ${task.cron}` : 'cron: (unset)';
}
