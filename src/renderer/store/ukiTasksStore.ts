// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI background tasks — the assistant's own work ledger.
 *
 * Every multi-step thing UKI does in the background (agent runs that use
 * tools, note enhancement, app automations) is tracked here so the user can
 * see what is pending, running, done, or failed — and so UKI can re-check its
 * own work. A watchdog sweep flags running tasks that stop reporting progress
 * as "stalled" instead of letting them look alive forever.
 *
 * Honesty rules:
 *  - Tasks persisted as running/pending across a reload were interrupted;
 *    they are marked failed on boot, never silently resurrected.
 *  - Long tasks (>8s) notify on completion/failure so background work
 *    surfaces only when it matters.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sharedTick } from '../services/SharedTick';
import { notify } from '../services/notify';

export type UkiTaskStatus = 'pending' | 'running' | 'paused' | 'stalled' | 'done' | 'failed' | 'cancelled';

/** Finished states (never resumed, eligible for 'Clear finished'). */
export const FINISHED_STATUSES: ReadonlySet<UkiTaskStatus> = new Set<UkiTaskStatus>(['done', 'failed', 'cancelled']);
const isFinished = (s: UkiTaskStatus) => FINISHED_STATUSES.has(s);

export interface UkiTaskStep {
  at: number;
  label: string;
}

export interface UkiBackgroundTask {
  id: string;
  title: string;
  /** Who created it: 'uki-agent', an appId, 'automation', ... */
  source: string;
  status: UkiTaskStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  steps: UkiTaskStep[];
  result?: string;
  error?: string;
}

const MAX_TASKS = 50;
const MAX_STEPS = 20;
/** A running task silent for this long is flagged stalled by the watchdog. */
const STALL_MS = 90_000;
/** Tasks that ran at least this long notify on completion/failure. */
const NOTIFY_MIN_RUNTIME_MS = 8_000;

interface UkiTasksState {
  tasks: UkiBackgroundTask[];
  startTask: (title: string, source: string) => string;
  logTaskStep: (id: string, label: string) => void;
  completeTask: (id: string, result?: string) => void;
  failTask: (id: string, error?: string) => void;
  /** Hold a running task before its next step (the runner waits). */
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  /** Stop a task: aborts its in-flight model/tool call and marks it cancelled. */
  cancelTask: (id: string) => void;
  clearFinished: () => void;
  /** Watchdog: flag silent running tasks as stalled (reversible on next step). */
  sweep: () => void;
}

// ---- live control (not persisted) -------------------------------------------
// A runner registers an AbortController for its task; Cancel aborts it so the
// in-flight fetch stops and the loop exits. Pause is cooperative: the runner
// awaits waitWhilePaused() between steps.
const controllers = new Map<string, AbortController>();
const resumeWaiters = new Map<string, Array<() => void>>();

export function registerTaskController(id: string, controller: AbortController): void {
  controllers.set(id, controller);
}

export function releaseTaskController(id: string): void {
  controllers.delete(id);
  resumeWaiters.delete(id);
}

/** True if a live runner can still be paused/cancelled for this task. */
export function isTaskControllable(id: string): boolean {
  return controllers.has(id);
}

function wake(id: string): void {
  const waiters = resumeWaiters.get(id);
  resumeWaiters.delete(id);
  waiters?.forEach((w) => w());
}

/**
 * Resolve when the task is not paused (immediately if it isn't). Resolves early
 * if `signal` aborts, so a paused task can still be cancelled.
 */
export function waitWhilePaused(id: string, signal?: AbortSignal): Promise<void> {
  const task = useUkiTasks.getState().tasks.find((t) => t.id === id);
  if (!task || task.status !== 'paused' || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    resumeWaiters.set(id, [...(resumeWaiters.get(id) ?? []), done]);
    signal?.addEventListener('abort', done, { once: true });
  });
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `ukitask-${Date.now().toString(36)}-${seq}`;
}

function capTasks(tasks: UkiBackgroundTask[]): UkiBackgroundTask[] {
  if (tasks.length <= MAX_TASKS) return tasks;
  // Drop oldest finished first; active tasks are never evicted.
  const finished = tasks.filter(t => isFinished(t.status));
  const active = tasks.filter(t => !isFinished(t.status));
  const keepFinished = finished.slice(Math.max(0, finished.length - (MAX_TASKS - active.length)));
  return [...active, ...keepFinished].sort((a, b) => a.createdAt - b.createdAt);
}

function finishNotify(task: UkiBackgroundTask, ok: boolean): void {
  const runtime = (task.finishedAt ?? Date.now()) - task.createdAt;
  if (runtime < NOTIFY_MIN_RUNTIME_MS) return;
  void notify({
    title: ok ? 'Background task finished' : 'Background task failed',
    body: task.title,
    source: 'UKI',
  });
}

export const useUkiTasks = create<UkiTasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

      startTask: (title, source) => {
        const id = nextId();
        const now = Date.now();
        const task: UkiBackgroundTask = {
          id,
          title: title.slice(0, 120),
          source,
          status: 'running',
          createdAt: now,
          updatedAt: now,
          steps: [],
        };
        set(s => ({ tasks: capTasks([...s.tasks, task]) }));
        return id;
      },

      logTaskStep: (id, label) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id
            ? {
                ...t,
                // A stalled task that reports progress again is running again
                status: t.status === 'stalled' ? 'running' : t.status,
                updatedAt: now,
                steps: [...t.steps, { at: now, label: label.slice(0, 160) }].slice(-MAX_STEPS),
              }
            : t),
        }));
      },

      completeTask: (id, result) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id && t.status !== 'cancelled'
            ? { ...t, status: 'done' as const, updatedAt: now, finishedAt: now, result: result?.slice(0, 400) }
            : t),
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task && task.status === 'done') finishNotify(task, true);
      },

      failTask: (id, error) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id && t.status !== 'cancelled'
            ? { ...t, status: 'failed' as const, updatedAt: now, finishedAt: now, error: error?.slice(0, 400) }
            : t),
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task && task.status === 'failed') finishNotify(task, false);
      },

      pauseTask: (id) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id && (t.status === 'running' || t.status === 'stalled')
            ? { ...t, status: 'paused' as const, updatedAt: now, steps: [...t.steps, { at: now, label: 'Paused by you' }].slice(-MAX_STEPS) }
            : t),
        }));
      },

      resumeTask: (id) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id && t.status === 'paused'
            ? { ...t, status: 'running' as const, updatedAt: now, steps: [...t.steps, { at: now, label: 'Resumed' }].slice(-MAX_STEPS) }
            : t),
        }));
        wake(id);
      },

      cancelTask: (id) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id && !isFinished(t.status)
            ? { ...t, status: 'cancelled' as const, updatedAt: now, finishedAt: now, error: 'Cancelled by you' }
            : t),
        }));
        controllers.get(id)?.abort();
        wake(id);
      },

      clearFinished: () => {
        set(s => ({ tasks: s.tasks.filter(t => !isFinished(t.status)) }));
      },

      sweep: () => {
        const now = Date.now();
        const hasStalling = get().tasks.some(
          t => t.status === 'running' && now - t.updatedAt > STALL_MS
        );
        if (!hasStalling) return;
        set(s => ({
          tasks: s.tasks.map(t =>
            t.status === 'running' && now - t.updatedAt > STALL_MS
              ? { ...t, status: 'stalled' as const }
              : t),
        }));
      },
    }),
    {
      name: 'dex-uki-tasks',
      // Interrupted work is failed work: never resurrect running/pending tasks.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const now = Date.now();
        state.tasks = state.tasks.map(t =>
          t.status === 'running' || t.status === 'pending' || t.status === 'stalled' || t.status === 'paused'
            ? { ...t, status: 'failed' as const, finishedAt: t.finishedAt ?? now, error: t.error ?? 'Interrupted by app restart' }
            : t);
      },
    }
  )
);

// Watchdog: re-check background tasks on the shared ticker (no extra timers).
if (typeof window !== 'undefined') {
  sharedTick.subscribe('uki-task-watchdog', () => useUkiTasks.getState().sweep(), 15_000);
}
