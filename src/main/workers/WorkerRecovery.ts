// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX -- Worker Recovery Registry
 * Tracks all worker threads. On crash: logs, marks crashed,
 * restarts after 500ms, notifies renderers.
 */

import { Worker } from 'worker_threads';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import log from 'electron-log';

interface WorkerEntry {
  id: string;
  scriptPath: string;
  worker: Worker;
  crashCount: number;
  lastCrash: number;
  restarting: boolean;
  workerData?: Record<string, unknown>;
  lastHeartbeat: number;
  missedHeartbeats: number;
}

const registry = new Map<string, WorkerEntry>();
let mainWindow: BrowserWindow | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 4000;
const MAX_MISSED_HEARTBEATS = 3;
const MAX_RESTART_DELAY_MS = 30_000;

function getRestartDelay(crashCount: number): number {
  const base = Math.min(500 * Math.pow(2, crashCount - 1), MAX_RESTART_DELAY_MS);
  const jitter = Math.random() * base * 0.3;
  return Math.round(base + jitter);
}

function notifyRenderers(workerId: string, event: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`worker:${event}`, { workerId, timestamp: Date.now() });
  }
}

function startWorker(entry: WorkerEntry): Worker {
  const worker = new Worker(entry.scriptPath, {
    workerData: entry.workerData,
  });

  entry.lastHeartbeat = Date.now();
  entry.missedHeartbeats = 0;

  worker.on('message', (msg: any) => {
    if (msg && msg.type === '__heartbeat:response') {
      entry.lastHeartbeat = Date.now();
      entry.missedHeartbeats = 0;
    }
    if (msg && msg.type === '__memory-report:response' && msg.payload) {
      log.info(`[WorkerRecovery] Worker "${entry.id}" memory: ${JSON.stringify(msg.payload)}`);
    }
  });

  worker.on('error', (error) => {
    log.error(`[WorkerRecovery] Worker "${entry.id}" crashed:`, error.message);
    entry.crashCount++;
    entry.lastCrash = Date.now();
    entry.restarting = true;

    notifyRenderers(entry.id, 'crashed');

    const delay = getRestartDelay(entry.crashCount);
    log.info(`[WorkerRecovery] Scheduling restart for "${entry.id}" in ${delay}ms (crash #${entry.crashCount})`);
    setTimeout(() => {
      if (!registry.has(entry.id)) return;
      try {
        const newWorker = startWorker(entry);
        entry.worker = newWorker;
        entry.restarting = false;
        notifyRenderers(entry.id, 'restarted');
      } catch (restartErr) {
        log.error(`[WorkerRecovery] Failed to restart worker "${entry.id}":`, restartErr);
        entry.restarting = false;
      }
    }, delay);
  });

  worker.on('exit', (code) => {
    if (code !== 0 && !entry.restarting) {
      log.warn(`[WorkerRecovery] Worker "${entry.id}" exited with code ${code}`);
    }
  });

  return worker;
}

/**
 * Initialize the worker recovery system with a reference to the main window.
 * Starts the heartbeat monitoring loop.
 */
export function initWorkerRecovery(window: BrowserWindow): void {
  mainWindow = window;

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    registry.forEach((entry) => {
      if (entry.restarting) return;

      // Send heartbeat ping
      try {
        entry.worker.postMessage({ type: '__heartbeat', payload: {}, requestId: `hb-${now}`, timestamp: now });
      } catch {
        // Worker may be dead, will be caught by the missed heartbeat logic
      }

      // Check if worker has responded
      const elapsed = now - entry.lastHeartbeat;
      if (elapsed > HEARTBEAT_INTERVAL_MS * 2) {
        entry.missedHeartbeats++;
        if (entry.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
          log.warn(`[WorkerRecovery] Worker "${entry.id}" missed ${entry.missedHeartbeats} heartbeats, restarting`);
          entry.crashCount++;
          entry.lastCrash = now;
          entry.restarting = true;
          notifyRenderers(entry.id, 'crashed');

          try { entry.worker.terminate(); } catch { /* already dead */ }

          const delay = getRestartDelay(entry.crashCount);
          log.info(`[WorkerRecovery] Scheduling heartbeat restart for "${entry.id}" in ${delay}ms`);
          setTimeout(() => {
            if (!registry.has(entry.id)) return;
            try {
              const newWorker = startWorker(entry);
              entry.worker = newWorker;
              entry.restarting = false;
              notifyRenderers(entry.id, 'restarted');
            } catch (restartErr) {
              log.error(`[WorkerRecovery] Failed to restart worker "${entry.id}":`, restartErr);
              entry.restarting = false;
            }
          }, 500);
        }
      }
    });
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Register and start a managed worker thread.
 */
export function registerWorker(
  id: string,
  scriptPath: string,
  workerData?: Record<string, unknown>,
): Worker {
  if (registry.has(id)) {
    const existing = registry.get(id)!;
    return existing.worker;
  }

  const entry: WorkerEntry = {
    id,
    scriptPath,
    worker: null as unknown as Worker,
    crashCount: 0,
    lastCrash: 0,
    restarting: false,
    workerData,
    lastHeartbeat: Date.now(),
    missedHeartbeats: 0,
  };

  entry.worker = startWorker(entry);
  registry.set(id, entry);
  log.info(`[WorkerRecovery] Registered worker "${id}"`);

  return entry.worker;
}

/**
 * Unregister and terminate a worker.
 */
export async function unregisterWorker(id: string): Promise<void> {
  const entry = registry.get(id);
  if (entry) {
    registry.delete(id);
    try { await entry.worker.terminate(); } catch { /* already dead */ }
  }
}

/**
 * Get status of all workers.
 */
export function getWorkerStatus(): Array<{
  id: string;
  crashCount: number;
  lastCrash: number;
  restarting: boolean;
  alive: boolean;
}> {
  const results: Array<{
    id: string;
    crashCount: number;
    lastCrash: number;
    restarting: boolean;
    alive: boolean;
  }> = [];
  registry.forEach((entry) => {
    results.push({
      id: entry.id,
      crashCount: entry.crashCount,
      lastCrash: entry.lastCrash,
      restarting: entry.restarting,
      alive: !entry.restarting,
    });
  });
  return results;
}

/**
 * Get total crash count across all workers in current session.
 */
export function getTotalCrashCount(): number {
  let total = 0;
  registry.forEach((entry) => { total += entry.crashCount; });
  return total;
}

/**
 * Gracefully shut down all worker threads. Sends a shutdown message
 * to each worker and waits up to 3 seconds for them to exit before
 * forcefully terminating.
 */
export async function shutdownAllWorkers(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  const entries = Array.from(registry.values());
  const shutdownPromises = entries.map(async (entry) => {
    try {
      entry.worker.postMessage({ type: '__shutdown', payload: {}, requestId: `shutdown-${Date.now()}`, timestamp: Date.now() });
      await Promise.race([
        new Promise<void>((resolve) => {
          entry.worker.once('exit', () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Worker already dead
    }
    try { await entry.worker.terminate(); } catch { /* already terminated */ }
  });

  await Promise.all(shutdownPromises);
  registry.clear();
  log.info('[WorkerRecovery] All workers shut down');
}

/**
 * Send a memory report request to a specific worker.
 */
export function requestMemoryReport(workerId: string): void {
  const entry = registry.get(workerId);
  if (entry && !entry.restarting) {
    try {
      entry.worker.postMessage({ type: '__memory-report', payload: {}, requestId: `mem-${Date.now()}`, timestamp: Date.now() });
    } catch {
      // Worker may be dead
    }
  }
}
