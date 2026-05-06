// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UKI Scheduler (main process)
 * -----------------------------------------------------------------------------
 * Lightweight cron + event-trigger engine. Runs in the main process so it
 * survives renderer reloads, persists triggers to disk, and forwards firing
 * triggers to the renderer over IPC for ActionBus to handle.
 *
 * Trigger kinds:
 *   - cron-like: `everyMinutes`, `dailyAt: "HH:MM"`, `weekly: { dow, time }`
 *   - event:     `onIdleMs`, `onSystemEvent: 'usb-attach' | 'power-blur'`
 *
 * Storage: <userData>/uki-schedule.json (JSON, last-write-wins).
 */

// DEX v3.8.0 - UKI Scheduler

import { app, ipcMain, BrowserWindow, powerMonitor } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  shouldFireTimeBased,
  type ScheduledTrigger,
  type TriggerSpec,
} from '../../shared/uki/schedulerLogic';

export type { TriggerSpec, ScheduledTrigger } from '../../shared/uki/schedulerLogic';

interface SchedulerState {
  triggers: ScheduledTrigger[];
  version: 1;
}

const STORAGE_FILE = 'uki-schedule.json';
const TICK_INTERVAL_MS = 30_000;

let triggers: ScheduledTrigger[] = [];
let tickTimer: NodeJS.Timeout | null = null;
let lastIdleFireBucket = 0;
let storagePath = '';
let initialized = false;

async function load(): Promise<void> {
  storagePath = path.join(app.getPath('userData'), STORAGE_FILE);
  try {
    const raw = await fs.readFile(storagePath, 'utf8');
    const parsed = JSON.parse(raw) as SchedulerState;
    if (parsed && Array.isArray(parsed.triggers)) {
      triggers = parsed.triggers.filter((t) => typeof t.id === 'string' && typeof t.action === 'string');
    }
  } catch {
    triggers = [];
  }
}

async function persist(): Promise<void> {
  if (!storagePath) return;
  const state: SchedulerState = { triggers, version: 1 };
  await fs.writeFile(storagePath, JSON.stringify(state, null, 2), 'utf8');
}

function broadcastFire(t: ScheduledTrigger): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || !win.webContents) continue;
    win.webContents.send('uki:scheduler:fire', {
      triggerId: t.id, action: t.action, payload: t.payload, label: t.label, ts: Date.now(),
    });
  }
}

function fire(t: ScheduledTrigger): void {
  t.lastFiredAt = Date.now();
  broadcastFire(t);
  void persist();
}

function shouldFireLocal(t: ScheduledTrigger, now: Date): boolean {
  return shouldFireTimeBased(t, now);
}

function tick(): void {
  const now = new Date();
  for (const t of triggers) {
    if (shouldFireLocal(t, now)) fire(t);
  }
  // Idle triggers: powerMonitor.getSystemIdleTime returns seconds.
  try {
    const idleSec = powerMonitor.getSystemIdleTime();
    const idleMs = idleSec * 1000;
    const bucket = Math.floor(idleMs / 60_000);
    if (bucket !== lastIdleFireBucket) {
      lastIdleFireBucket = bucket;
      for (const t of triggers) {
        if (!t.enabled || t.spec.kind !== 'onIdleMs') continue;
        if (idleMs >= t.spec.ms && (Date.now() - (t.lastFiredAt || 0)) > t.spec.ms) {
          fire(t);
        }
      }
    }
  } catch {
    // powerMonitor may be unavailable in headless / test envs.
  }
}

function bindSystemEvents(): void {
  const map: Array<['suspend' | 'resume' | 'lock-screen' | 'unlock-screen', string]> = [
    ['suspend', 'suspend'],
    ['resume', 'resume'],
    ['lock-screen', 'lock-screen'],
    ['unlock-screen', 'unlock-screen'],
  ];
  for (const [evt, name] of map) {
    try {
      powerMonitor.on(evt as never, () => {
        for (const t of triggers) {
          if (t.enabled && t.spec.kind === 'onSystemEvent' && t.spec.event === name) fire(t);
        }
      });
    } catch {
      // Some platforms don't emit every signal.
    }
  }
}

export async function initUkiScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await load();
  bindSystemEvents();
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);

  ipcMain.handle('uki:scheduler:list', () => triggers);

  ipcMain.handle('uki:scheduler:add', async (_e, spec: TriggerSpec, action: string, label: string, payload?: Record<string, unknown>) => {
    const t: ScheduledTrigger = {
      id: randomUUID(), spec, action, label, payload,
      enabled: true, createdAt: Date.now(),
    };
    triggers.push(t);
    await persist();
    return t;
  });

  ipcMain.handle('uki:scheduler:toggle', async (_e, id: string, enabled: boolean) => {
    const t = triggers.find((x) => x.id === id);
    if (!t) return false;
    t.enabled = enabled;
    await persist();
    return true;
  });

  ipcMain.handle('uki:scheduler:remove', async (_e, id: string) => {
    const before = triggers.length;
    triggers = triggers.filter((x) => x.id !== id);
    if (triggers.length !== before) await persist();
    return triggers.length !== before;
  });
}

export async function shutdownUkiScheduler(): Promise<void> {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  initialized = false;
}

/** Test seam. */
export const _internals = {
  shouldFireTimeBased: shouldFireLocal,
  reset: (): void => { triggers = []; lastIdleFireBucket = 0; },
  inject: (t: ScheduledTrigger): void => { triggers.push(t); },
  all: (): ScheduledTrigger[] => triggers,
};
