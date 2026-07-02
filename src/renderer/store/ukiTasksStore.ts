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

export type UkiTaskStatus = 'pending' | 'running' | 'stalled' | 'done' | 'failed';

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
  clearFinished: () => void;
  /** Watchdog: flag silent running tasks as stalled (reversible on next step). */
  sweep: () => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `ukitask-${Date.now().toString(36)}-${seq}`;
}

function capTasks(tasks: UkiBackgroundTask[]): UkiBackgroundTask[] {
  if (tasks.length <= MAX_TASKS) return tasks;
  // Drop oldest finished first; active tasks are never evicted.
  const finished = tasks.filter(t => t.status === 'done' || t.status === 'failed');
  const active = tasks.filter(t => t.status !== 'done' && t.status !== 'failed');
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
          tasks: s.tasks.map(t => t.id === id
            ? { ...t, status: 'done' as const, updatedAt: now, finishedAt: now, result: result?.slice(0, 400) }
            : t),
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task) finishNotify(task, true);
      },

      failTask: (id, error) => {
        const now = Date.now();
        set(s => ({
          tasks: s.tasks.map(t => t.id === id
            ? { ...t, status: 'failed' as const, updatedAt: now, finishedAt: now, error: error?.slice(0, 400) }
            : t),
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task) finishNotify(task, false);
      },

      clearFinished: () => {
        set(s => ({ tasks: s.tasks.filter(t => t.status !== 'done' && t.status !== 'failed') }));
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
          t.status === 'running' || t.status === 'pending' || t.status === 'stalled'
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
