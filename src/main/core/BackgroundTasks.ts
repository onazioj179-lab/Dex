// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Background Task Controller
// Phase 15: Deep Internal Micro-Optimization
// Manages background work with idle callbacks and interruptibility
// ===========================================================================

import log from 'electron-log';
import { ipcMain, powerMonitor } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

export interface BackgroundTask {
  id: string;
  name: string;
  priority: TaskPriority;
  execute: () => Promise<void> | void;
  onCancel?: () => void;
  maxDurationMs?: number;
  interruptible?: boolean;
}

interface QueuedTask extends BackgroundTask {
  queuedAt: number;
  attempts: number;
}

interface RunningTask {
  task: QueuedTask;
  startedAt: number;
  controller: AbortController;
}

// ===========================================================================
// BACKGROUND TASK CONTROLLER
// ===========================================================================

class BackgroundTaskControllerClass {
  private queue: QueuedTask[] = [];
  private running: Map<string, RunningTask> = new Map();
  private paused = false;
  private isSystemIdle = false;
  private lastUserInput = Date.now();
  private processInterval: NodeJS.Timeout | null = null;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  
  // Configuration - OPTIMIZED FOR NEAR-ZERO IDLE CPU
  private config = {
    maxConcurrent: 1,                  // Reduced from 2 - single task at a time
    userInputGracePeriodMs: 1000,      // Increased from 500 - longer pause after input
    idleThresholdMs: 5000,             // System considered idle after 5s
    maxQueueSize: 50,                  // Reduced from 100
    defaultMaxDurationMs: 5000,        // Reduced from 30s to 5s
    processIntervalMs: 1000,           // Reduced frequency: was 500ms, now 1000ms
    idleCheckIntervalMs: 15000,        // Reduced frequency: was 5000ms, now 15000ms
  };

  constructor() {
    this.setupSystemMonitoring();
  }

  private setupSystemMonitoring(): void {
    // Monitor power state
    powerMonitor.on('suspend', () => {
      log.info('[BackgroundTasks] System suspending, pausing all tasks');
      this.pauseAll();
    });

    powerMonitor.on('resume', () => {
      log.info('[BackgroundTasks] System resumed, resuming tasks');
      this.resumeAll();
    });

    powerMonitor.on('on-battery', () => {
      log.info('[BackgroundTasks] On battery, reducing concurrency');
      this.config.maxConcurrent = 1;
    });

    powerMonitor.on('on-ac', () => {
      log.info('[BackgroundTasks] On AC power, normal concurrency');
      this.config.maxConcurrent = 2;
    });
  }

  start(): void {
    if (this.processInterval) return;

    // Process queue at 5s intervals — sufficient for background work, saves CPU
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, Math.max(this.config.processIntervalMs, 5000));

    this.idleCheckInterval = setInterval(() => {
      this.updateIdleState();
    }, Math.max(this.config.idleCheckIntervalMs, 30000));

    // Expose status to renderer via IPC
    ipcMain.handle('background-tasks:status', () => this.getStatus());

    log.info('[BackgroundTasks] Controller started (optimized for low CPU)');
  }

  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Cancel all running tasks
    for (const [id] of this.running) {
      this.cancel(id);
    }
    this.queue = [];

    log.info('[BackgroundTasks] Controller stopped');
  }

  // Record user input to defer background work
  recordUserInput(): void {
    this.lastUserInput = Date.now();
    this.isSystemIdle = false;
  }

  // Queue a task
  schedule(task: BackgroundTask): string {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove lowest priority task from queue
      const lowestPriorityIndex = this.findLowestPriorityIndex();
      if (lowestPriorityIndex !== -1) {
        const removed = this.queue.splice(lowestPriorityIndex, 1)[0];
        removed.onCancel?.();
        log.debug(`[BackgroundTasks] Dropped task ${removed.id} due to queue full`);
      }
    }

    const queuedTask: QueuedTask = {
      ...task,
      queuedAt: Date.now(),
      attempts: 0,
      maxDurationMs: task.maxDurationMs ?? this.config.defaultMaxDurationMs,
      interruptible: task.interruptible ?? true,
    };

    // Insert based on priority
    const insertIndex = this.findInsertIndex(task.priority);
    this.queue.splice(insertIndex, 0, queuedTask);

    log.debug(`[BackgroundTasks] Scheduled task ${task.id} (${task.priority})`);
    return task.id;
  }

  // Cancel a queued or running task
  cancel(taskId: string): boolean {
    // Check running tasks first
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      runningTask.controller.abort();
      runningTask.task.onCancel?.();
      this.running.delete(taskId);
      log.debug(`[BackgroundTasks] Cancelled running task ${taskId}`);
      return true;
    }

    // Check queue
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.onCancel?.();
      log.debug(`[BackgroundTasks] Cancelled queued task ${taskId}`);
      return true;
    }

    return false;
  }

  // Pause all task processing
  pauseAll(): void {
    this.paused = true;
    
    // Interrupt interruptible running tasks
    for (const [id, runningTask] of this.running) {
      if (runningTask.task.interruptible) {
        runningTask.controller.abort();
        // Re-queue the task
        this.queue.unshift(runningTask.task);
        this.running.delete(id);
      }
    }

    log.info('[BackgroundTasks] Paused all tasks');
  }

  // Resume task processing
  resumeAll(): void {
    this.paused = false;
    log.info('[BackgroundTasks] Resumed tasks');
  }

  // Execute a task immediately (blocking)
  async executeNow(task: BackgroundTask): Promise<void> {
    const start = Date.now();
    try {
      await Promise.race([
        task.execute(),
        this.timeout(task.maxDurationMs ?? this.config.defaultMaxDurationMs),
      ]);
      log.debug(`[BackgroundTasks] Immediate task ${task.id} completed in ${Date.now() - start}ms`);
    } catch (error) {
      log.error(`[BackgroundTasks] Immediate task ${task.id} failed:`, error);
      throw error;
    }
  }

  // Get queue status
  getStatus(): { queued: number; running: number; paused: boolean; idle: boolean } {
    return {
      queued: this.queue.length,
      running: this.running.size,
      paused: this.paused,
      idle: this.isSystemIdle,
    };
  }

  private async processQueue(): Promise<void> {
    if (this.paused) return;

    // Don't start new tasks during user input
    const timeSinceInput = Date.now() - this.lastUserInput;
    if (timeSinceInput < this.config.userInputGracePeriodMs) {
      return;
    }

    // Check ResourceGovernor throttle level
    try {
      const { resourceGovernor } = require('./ResourceGovernor');
      if (resourceGovernor.shouldDeferWork()) {
        return; // Defer work when system is under pressure
      }
      // Use ResourceGovernor's concurrency limit
      const maxConcurrent = Math.min(this.config.maxConcurrent, resourceGovernor.getMaxConcurrency());
      if (this.running.size >= maxConcurrent) {
        return;
      }
    } catch {
      // ResourceGovernor not available, use default limits
      if (this.running.size >= this.config.maxConcurrent) {
        return;
      }
    }

    // Find next eligible task
    const task = this.getNextTask();
    if (!task) return;

    // Start the task
    await this.startTask(task);
  }

  private getNextTask(): QueuedTask | undefined {
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      
      // Idle-priority tasks only run when system is idle
      if (task.priority === 'idle' && !this.isSystemIdle) {
        continue;
      }

      // Task is eligible
      this.queue.splice(i, 1);
      return task;
    }

    return undefined;
  }

  private async startTask(task: QueuedTask): Promise<void> {
    const controller = new AbortController();
    const runningTask: RunningTask = {
      task,
      startedAt: Date.now(),
      controller,
    };

    this.running.set(task.id, runningTask);
    task.attempts++;

    log.debug(`[BackgroundTasks] Starting task ${task.id} (attempt ${task.attempts})`);

    try {
      await Promise.race([
        task.execute(),
        this.timeout(task.maxDurationMs!, controller.signal),
      ]);

      log.debug(`[BackgroundTasks] Task ${task.id} completed in ${Date.now() - runningTask.startedAt}ms`);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        log.debug(`[BackgroundTasks] Task ${task.id} was aborted`);
      } else {
        log.error(`[BackgroundTasks] Task ${task.id} failed:`, error);
      }
    } finally {
      this.running.delete(task.id);
    }
  }

  private timeout(ms: number, signal?: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, ms);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
    });
  }

  private updateIdleState(): void {
    const timeSinceInput = Date.now() - this.lastUserInput;
    const wasIdle = this.isSystemIdle;
    this.isSystemIdle = timeSinceInput >= this.config.idleThresholdMs;

    if (!wasIdle && this.isSystemIdle) {
      log.debug('[BackgroundTasks] System is now idle');
    }
  }

  private findInsertIndex(priority: TaskPriority): number {
    const priorityOrder: TaskPriority[] = ['critical', 'high', 'normal', 'low', 'idle'];
    const targetPriorityIndex = priorityOrder.indexOf(priority);

    for (let i = 0; i < this.queue.length; i++) {
      const taskPriorityIndex = priorityOrder.indexOf(this.queue[i].priority);
      if (taskPriorityIndex > targetPriorityIndex) {
        return i;
      }
    }

    return this.queue.length;
  }

  private findLowestPriorityIndex(): number {
    const priorityOrder: TaskPriority[] = ['critical', 'high', 'normal', 'low', 'idle'];
    let lowestIndex = -1;
    let lowestPriority = -1;

    for (let i = 0; i < this.queue.length; i++) {
      const priorityIndex = priorityOrder.indexOf(this.queue[i].priority);
      if (priorityIndex > lowestPriority) {
        lowestPriority = priorityIndex;
        lowestIndex = i;
      }
    }

    return lowestIndex;
  }
}

// Singleton export
export const backgroundTasks = new BackgroundTaskControllerClass();

// ===========================================================================
// IDLE CALLBACK - Run work during idle periods
// ===========================================================================

export function scheduleIdleWork(
  work: () => void | Promise<void>,
  options?: { timeout?: number; name?: string }
): string {
  const id = `idle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  backgroundTasks.schedule({
    id,
    name: options?.name ?? 'Idle work',
    priority: 'idle',
    execute: work,
    maxDurationMs: options?.timeout ?? 5000,
    interruptible: true,
  });

  return id;
}

// ===========================================================================
// BATCH PROCESSOR - Process items in batches with yielding
// ===========================================================================

export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void> | void,
  options?: {
    batchSize?: number;
    yieldAfterMs?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<void> {
  const { batchSize = 10, yieldAfterMs = 16, onProgress } = options ?? {};
  let processed = 0;
  let batchStart = Date.now();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    for (const item of batch) {
      await processor(item);
      processed++;

      // Yield to main thread if we've been processing too long
      if (Date.now() - batchStart > yieldAfterMs) {
        await new Promise(resolve => setImmediate(resolve));
        batchStart = Date.now();
      }
    }

    onProgress?.(processed, items.length);
  }
}
