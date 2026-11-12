// =============================================================================
// DEX Platform - Scheduled tasks store (UKI background automation)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Persisted list of recurring UKI background tasks (cron / interval). The pure
// scheduling math lives in shared/automation/scheduledTasks; this store owns
// CRUD + persistence, and services/scheduledTaskRunner drives execution against
// SharedTick. Mandate: "automate and work on tasks in the background... rehook
// ourselves to check on tasks."

import { create } from 'zustand';
import {
  type ScheduledTask,
  type ScheduledAction,
  type ScheduleKind,
  initNextRun,
} from '../../shared/automation/scheduledTasks';

const STORAGE_KEY = 'dex-scheduled-tasks';
const MAX_TASKS = 100;
/** Enforced minimum interval so background work can never busy-loop. */
export const MIN_INTERVAL_MS = 60_000;

export interface NewScheduledTask {
  title: string;
  kind: ScheduleKind;
  cron?: string;
  intervalMs?: number;
  /** kind === 'once': fire time (epoch ms). */
  atMs?: number;
  action: ScheduledAction;
  maxAttempts?: number;
  enabled?: boolean;
}

interface ScheduledTasksState {
  tasks: ScheduledTask[];
  addTask: (def: NewScheduledTask, now: number) => string;
  removeTask: (id: string) => void;
  setEnabled: (id: string, enabled: boolean, now: number) => void;
  /** Replace a task's runtime state after a run (from the runner). */
  patchRuntime: (id: string, next: ScheduledTask) => void;
  clearAll: () => void;
}

function isValidTask(t: unknown): t is ScheduledTask {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  return typeof o.id === 'string'
    && typeof o.title === 'string'
    && (o.kind === 'cron' || o.kind === 'interval' || o.kind === 'once')
    && !!o.action && typeof o.action === 'object';
}

function loadTasks(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTask);
  } catch {
    return [];
  }
}

function persist(tasks: ScheduledTask[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { /* storage full */ }
}

let idSeq = 0;
function genId(now: number): string {
  idSeq = (idSeq + 1) % 100000;
  return `sched_${now.toString(36)}_${idSeq.toString(36)}`;
}

export const useScheduledTasksStore = create<ScheduledTasksState>()((set, get) => ({
  tasks: loadTasks(),

  addTask: (def, now) => {
    const id = genId(now);
    const intervalMs = def.kind === 'interval'
      ? Math.max(MIN_INTERVAL_MS, Math.round(def.intervalMs ?? MIN_INTERVAL_MS))
      : undefined;
    const base: ScheduledTask = {
      id,
      title: def.title.trim() || 'Scheduled task',
      kind: def.kind,
      cron: def.kind === 'cron' ? def.cron : undefined,
      intervalMs,
      atMs: def.kind === 'once' ? def.atMs : undefined,
      action: def.action,
      enabled: def.enabled ?? true,
      createdAt: now,
      nextRunAt: null,
      attempt: 0,
      maxAttempts: Math.max(1, def.maxAttempts ?? 3),
      runCount: 0,
    };
    const task = initNextRun(base, now);
    const next = [task, ...get().tasks].slice(0, MAX_TASKS);
    persist(next);
    set({ tasks: next });
    try { window.dispatchEvent(new CustomEvent('dex-scheduled-tasks-changed')); } catch { /* noop */ }
    return id;
  },

  removeTask: (id) => {
    const next = get().tasks.filter(t => t.id !== id);
    persist(next);
    set({ tasks: next });
    try { window.dispatchEvent(new CustomEvent('dex-scheduled-tasks-changed')); } catch { /* noop */ }
  },

  setEnabled: (id, enabled, now) => {
    const next = get().tasks.map(t => t.id === id
      ? initNextRun({ ...t, enabled, attempt: 0 }, now)
      : t);
    persist(next);
    set({ tasks: next });
    try { window.dispatchEvent(new CustomEvent('dex-scheduled-tasks-changed')); } catch { /* noop */ }
  },

  patchRuntime: (id, updated) => {
    const next = get().tasks.map(t => t.id === id ? updated : t);
    persist(next);
    set({ tasks: next });
  },

  clearAll: () => {
    persist([]);
    set({ tasks: [] });
    try { window.dispatchEvent(new CustomEvent('dex-scheduled-tasks-changed')); } catch { /* noop */ }
  },
}));
