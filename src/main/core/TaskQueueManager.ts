// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Background Task Queue Manager
// Single path for all background operations: renders, exports, downloads,
// file transfers, backups, thumbnail generation.
// Concurrency based on capability tier. Priority scheduling.
// ==========================================================================
// Rules 84-87: Task Queue Architecture
// 84. Task persistence (survive restarts via DB)
// 85. Task deduplication (same name+app skip if queued)
// 86. Per-task timeouts with configurable limits
// 87. Dead letter queue for permanently failed tasks
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as log from 'electron-log';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'lowest';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskDefinition {
  name: string;
  app: string;
  priority: TaskPriority;
  estimatedDurationMs?: number;
  timeoutMs?: number;         // Rule 86: per-task timeout
  deduplicate?: boolean;      // Rule 85: skip if same name+app already queued
  run: (onProgress: (current: number, total: number) => void) => Promise<any>;
  cancel?: () => void;
}

export interface TaskRecord {
  id: string;
  name: string;
  app: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  progressTotal: number;
  progressPercent: number;
  estimatedDurationMs: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  result: any;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  lowest: 1,
};

class TaskQueueManager {
  private mainWindow: BrowserWindow | null = null;
  private tasks: Map<string, TaskRecord> = new Map();
  private cancelFunctions: Map<string, () => void> = new Map();
  private runFunctions: Map<string, (onProgress: (c: number, t: number) => void) => Promise<any>> = new Map();
  private queue: string[] = [];
  private runningCount = 0;
  private maxConcurrent = 4;
  private capabilityTier = 1;
  private completedCleanupTimers: Map<string, NodeJS.Timeout> = new Map();

  // Rule 86: Per-task timeouts
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private taskTimeoutMs: Map<string, number> = new Map();
  private readonly DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes default

  // Rule 87: Dead letter queue
  private deadLetterQueue: Array<{ task: TaskRecord; reason: string; failedAt: number }> = [];
  private readonly MAX_DEAD_LETTERS = 100;
  private readonly MAX_RETRY_COUNT = 3;
  private taskRetryCount: Map<string, number> = new Map();

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[TaskQueue] Task queue manager initialized');
  }

  setCapabilityTier(tier: number): void {
    this.capabilityTier = tier;
    if (tier === 1) this.maxConcurrent = 4;
    else if (tier === 2) this.maxConcurrent = 2;
    else this.maxConcurrent = 1;
    log.info(`[TaskQueue] Concurrency set to ${this.maxConcurrent} for tier ${tier}`);
  }

  enqueue(definition: TaskDefinition): string {
    // Rule 85: Deduplication -- skip if same name+app already queued/running
    if (definition.deduplicate !== false) {
      for (const existing of this.tasks.values()) {
        if (existing.name === definition.name && existing.app === definition.app &&
            (existing.status === 'queued' || existing.status === 'running')) {
          log.debug(`[TaskQueue] Rule 85: Deduplicated task '${definition.name}' for '${definition.app}'`);
          return existing.id;
        }
      }
    }

    const id = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const record: TaskRecord = {
      id,
      name: definition.name,
      app: definition.app,
      priority: definition.priority,
      status: 'queued',
      progress: 0,
      progressTotal: 100,
      progressPercent: 0,
      estimatedDurationMs: definition.estimatedDurationMs || 0,
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
    };

    this.tasks.set(id, record);
    this.runFunctions.set(id, definition.run);
    if (definition.cancel) {
      this.cancelFunctions.set(id, definition.cancel);
    }

    // Rule 86: Store per-task timeout
    if (definition.timeoutMs) {
      this.taskTimeoutMs.set(id, definition.timeoutMs);
    }

    this.insertSorted(id);
    this.broadcastTaskList();
    this.processQueue();

    return id;
  }

  private insertSorted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const rank = PRIORITY_RANK[task.priority];
    let insertAt = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const queuedTask = this.tasks.get(this.queue[i]);
      if (queuedTask && PRIORITY_RANK[queuedTask.priority] < rank) {
        insertAt = i;
        break;
      }
    }
    this.queue.splice(insertAt, 0, taskId);
  }

  private async processQueue(): Promise<void> {
    while (this.runningCount < this.maxConcurrent && this.queue.length > 0) {
      const taskId = this.queue.shift();
      if (!taskId) break;

      const task = this.tasks.get(taskId);
      const runFn = this.runFunctions.get(taskId);
      if (!task || !runFn) continue;

      task.status = 'running';
      task.startedAt = Date.now();
      this.runningCount++;
      this.broadcastTaskList();

      this.executeTask(taskId, runFn).catch((e: unknown) => { log.warn('[DEX]', e); });
    }
  }

  private async executeTask(taskId: string, runFn: (onProgress: (c: number, t: number) => void) => Promise<any>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Rule 86: Set per-task timeout
    const timeoutMs = this.taskTimeoutMs.get(taskId) || this.DEFAULT_TIMEOUT_MS;
    const timeoutHandle = setTimeout(() => {
      if (task.status === 'running') {
        log.warn(`[TaskQueue] Rule 86: Task '${task.name}' timed out after ${timeoutMs}ms`);
        const cancelFn = this.cancelFunctions.get(taskId);
        if (cancelFn) { try { cancelFn(); } catch { /* ok */ } }
        task.status = 'failed';
        task.error = `Timed out after ${timeoutMs}ms`;
        task.completedAt = Date.now();
      }
    }, timeoutMs);
    this.taskTimeouts.set(taskId, timeoutHandle);

    const onProgress = (current: number, total: number) => {
      task.progress = current;
      task.progressTotal = total;
      task.progressPercent = total > 0 ? Math.round((current / total) * 100) : 0;
      this.broadcastTaskUpdate(task);
    };

    try {
      const result = await runFn(onProgress);
      task.status = 'completed';
      task.completedAt = Date.now();
      task.progress = task.progressTotal;
      task.progressPercent = 100;
      task.result = result;
    } catch (err: any) {
      if (task.status === 'cancelled') {
        // already cancelled
      } else {
        task.status = 'failed';
        task.completedAt = Date.now();
        task.error = err.message || String(err);
      }
    }

    this.runningCount--;
    this.runFunctions.delete(taskId);
    this.broadcastTaskList();

    // Rule 86: Clear timeout
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) { clearTimeout(timeout); this.taskTimeouts.delete(taskId); }
    this.taskTimeoutMs.delete(taskId);

    // Rule 87: Dead letter queue for permanently failed tasks
    if (task.status === 'failed') {
      const retries = (this.taskRetryCount.get(taskId) || 0) + 1;
      this.taskRetryCount.set(taskId, retries);

      if (retries >= this.MAX_RETRY_COUNT) {
        this.deadLetterQueue.push({
          task: { ...task },
          reason: task.error || 'Unknown error',
          failedAt: Date.now(),
        });
        if (this.deadLetterQueue.length > this.MAX_DEAD_LETTERS) {
          this.deadLetterQueue.shift();
        }
        log.warn(`[TaskQueue] Rule 87: Task '${task.name}' moved to dead letter queue after ${retries} retries`);
        this.taskRetryCount.delete(taskId);
      }
    }

    if (task.status === 'completed') {
      const timer = setTimeout(() => {
        this.tasks.delete(taskId);
        this.cancelFunctions.delete(taskId);
        this.completedCleanupTimers.delete(taskId);
        this.broadcastTaskList();
      }, 3000);
      this.completedCleanupTimers.set(taskId, timer);
    }

    this.processQueue();
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'queued') {
      const idx = this.queue.indexOf(taskId);
      if (idx >= 0) this.queue.splice(idx, 1);
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.runFunctions.delete(taskId);
      this.broadcastTaskList();
      return true;
    }

    if (task.status === 'running') {
      const cancelFn = this.cancelFunctions.get(taskId);
      if (cancelFn) {
        try { cancelFn(); } catch { /* ignore */ }
      }
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.broadcastTaskList();
      return true;
    }

    return false;
  }

  retryTask(taskId: string): string | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'failed') return null;

    const runFn = this.runFunctions.get(taskId);
    if (!runFn) return null;

    task.status = 'queued';
    task.error = null;
    task.progress = 0;
    task.progressPercent = 0;
    task.startedAt = null;
    task.completedAt = null;

    this.insertSorted(taskId);
    this.broadcastTaskList();
    this.processQueue();

    return taskId;
  }

  getTask(taskId: string): TaskRecord | null {
    return this.tasks.get(taskId) || null;
  }

  getActiveTasks(): TaskRecord[] {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'running' || t.status === 'queued' || t.status === 'failed'
    );
  }

  getAllTasks(): TaskRecord[] {
    return Array.from(this.tasks.values());
  }

  getRunningCount(): number {
    return this.runningCount;
  }

  shouldYieldForHighPriority(currentPriority: TaskPriority): boolean {
    if (PRIORITY_RANK[currentPriority] >= PRIORITY_RANK['high']) return false;

    for (const id of this.queue) {
      const task = this.tasks.get(id);
      if (task && PRIORITY_RANK[task.priority] > PRIORITY_RANK[currentPriority]) {
        return true;
      }
    }
    return false;
  }

  private broadcastTaskList(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const tasks = this.getActiveTasks();
      this.mainWindow.webContents.send('task-queue:update', tasks);
    }
  }

  private broadcastTaskUpdate(task: TaskRecord): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('task-queue:progress', {
        id: task.id,
        progress: task.progress,
        progressTotal: task.progressTotal,
        progressPercent: task.progressPercent,
      });
    }
  }

  private registerIPC(): void {
    ipcMain.handle('task-queue:enqueue', (_event, name: string, appName: string, priority: TaskPriority) => {
      // Renderer cannot pass functions through IPC, so this creates a stub task
      // that the main-process caller must provide the run function for.
      // Real tasks are enqueued programmatically from other main-process modules.
      const id = this.enqueue({
        name,
        app: appName,
        priority,
        run: async (onProgress) => {
          // Stub - real implementation should be provided by the calling module
          onProgress(100, 100);
        },
      });
      return id;
    });

    ipcMain.handle('task-queue:cancel', (_event, taskId: string) => {
      return this.cancelTask(taskId);
    });

    ipcMain.handle('task-queue:retry', (_event, taskId: string) => {
      return this.retryTask(taskId);
    });

    ipcMain.handle('task-queue:getActive', () => {
      return this.getActiveTasks().map(t => ({
        id: t.id,
        name: t.name,
        app: t.app,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        progressTotal: t.progressTotal,
        progressPercent: t.progressPercent,
        estimatedDurationMs: t.estimatedDurationMs,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        error: t.error,
      }));
    });

    ipcMain.handle('task-queue:getTask', (_event, taskId: string) => {
      const t = this.getTask(taskId);
      if (!t) return null;
      return {
        id: t.id,
        name: t.name,
        app: t.app,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        progressTotal: t.progressTotal,
        progressPercent: t.progressPercent,
        estimatedDurationMs: t.estimatedDurationMs,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        error: t.error,
      };
    });

    ipcMain.handle('task-queue:getRunningCount', () => {
      return this.runningCount;
    });
  }

  shutdown(): void {
    // Rule 86: Clear all task timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();

    for (const timer of this.completedCleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.completedCleanupTimers.clear();

    for (const [id, cancelFn] of this.cancelFunctions) {
      const task = this.tasks.get(id);
      if (task && task.status === 'running') {
        try { cancelFn(); } catch { /* ignore */ }
      }
    }

    // Rule 84: Persist queued (not running) tasks for restart recovery
    this.persistQueuedTasks();

    this.tasks.clear();
    this.queue = [];
    this.runFunctions.clear();
    this.cancelFunctions.clear();
    this.taskRetryCount.clear();
    log.info('[TaskQueue] Shutdown');
  }

  // ---------------------------------------------------------------------------
  // Rule 84: Task persistence (survive restarts)
  // ---------------------------------------------------------------------------

  private persistQueuedTasks(): void {
    try {
      const { databaseCluster } = require('./DatabaseCluster');
      const queuedTasks = Array.from(this.tasks.values())
        .filter(t => t.status === 'queued')
        .map(t => ({
          id: t.id,
          name: t.name,
          app: t.app,
          priority: t.priority,
          estimatedDurationMs: t.estimatedDurationMs,
        }));

      if (queuedTasks.length > 0) {
        databaseCluster.kvSet('core', 'task-queue:persisted', JSON.stringify(queuedTasks));
        log.info(`[TaskQueue] Rule 84: Persisted ${queuedTasks.length} queued tasks`);
      }
    } catch (err) {
      log.warn('[TaskQueue] Rule 84: Failed to persist tasks:', err);
    }
  }

  restorePersistedTasks(): Array<{ id: string; name: string; app: string; priority: TaskPriority }> {
    try {
      const { databaseCluster } = require('./DatabaseCluster');
      const json = databaseCluster.kvGet('core', 'task-queue:persisted');
      if (json) {
        databaseCluster.kvSet('core', 'task-queue:persisted', ''); // Clear after restore
        const tasks = JSON.parse(json);
        log.info(`[TaskQueue] Rule 84: Restored ${tasks.length} persisted tasks`);
        return tasks;
      }
    } catch (err) {
      log.warn('[TaskQueue] Rule 84: Failed to restore tasks:', err);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Rule 87: Dead letter queue access
  // ---------------------------------------------------------------------------

  getDeadLetterQueue(): Array<{ task: TaskRecord; reason: string; failedAt: number }> {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }
}

export const taskQueueManager = new TaskQueueManager();

export function initializeTaskQueue(mainWindow: BrowserWindow): void {
  taskQueueManager.initialize(mainWindow);
}

export function shutdownTaskQueue(): void {
  taskQueueManager.shutdown();
}
