// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Central Task Scheduler
// Phase 28: Backend Architecture Refinement
// Priority-based scheduling with backpressure handling
// ===========================================================================

import { EventEmitter } from 'events';
import log from 'electron-log';
import { resourceManager } from './ResourceManager';

// ===========================================================================
// TYPES
// ===========================================================================

export type TaskPriority = 'critical' | 'user' | 'high' | 'normal' | 'low' | 'idle';
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledTask {
  id: string;
  name: string;
  priority: TaskPriority;
  execute: (signal: AbortSignal) => Promise<any>;
  timeout?: number;
  retryable?: boolean;
  maxRetries?: number;
  category?: string;
}

export interface TaskHandle {
  id: string;
  state: TaskState;
  promise: Promise<any>;
  cancel: () => void;
}

interface InternalTask extends ScheduledTask {
  state: TaskState;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  abortController: AbortController;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export interface SchedulerStats {
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  averageWaitTime: number;
  averageExecutionTime: number;
  queueDepth: number;
  runningCount: number;
}

// ===========================================================================
// PRIORITY QUEUE
// ===========================================================================

class PriorityQueue {
  private queues: Map<TaskPriority, InternalTask[]> = new Map();
  private priorityOrder: TaskPriority[] = ['critical', 'user', 'high', 'normal', 'low', 'idle'];

  constructor() {
    for (const priority of this.priorityOrder) {
      this.queues.set(priority, []);
    }
  }

  enqueue(task: InternalTask): void {
    const queue = this.queues.get(task.priority)!;
    queue.push(task);
  }

  dequeue(): InternalTask | null {
    for (const priority of this.priorityOrder) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  peek(): InternalTask | null {
    for (const priority of this.priorityOrder) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  remove(taskId: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  sizeByPriority(): Record<TaskPriority, number> {
    const result = {} as Record<TaskPriority, number>;
    for (const [priority, queue] of this.queues) {
      result[priority] = queue.length;
    }
    return result;
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }
}

// ===========================================================================
// CENTRAL SCHEDULER CLASS
// ===========================================================================

class CentralSchedulerClass extends EventEmitter {
  // Task management
  private queue = new PriorityQueue();
  private running: Map<string, InternalTask> = new Map();
  
  // Statistics
  private stats: SchedulerStats = {
    totalScheduled: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalCancelled: 0,
    averageWaitTime: 0,
    averageExecutionTime: 0,
    queueDepth: 0,
    runningCount: 0,
  };

  // Timing statistics
  private waitTimes: number[] = [];
  private executionTimes: number[] = [];
  private maxStatSamples = 100;
  
  // Configuration
  private config = {
    maxConcurrent: 4,
    maxQueueSize: 200,
    defaultTimeout: 60000,
    maxRetries: 2,
    retryDelayMs: 500,
    processIntervalMs: 1000,   // Increased from 500ms for better performance
    idleCheckIntervalMs: 15000, // Increased from 5000ms
  };

  // State
  private isRunning = false;
  private isPaused = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.setupResourceManagerListeners();
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    // 5s minimum — scheduled tasks don't need sub-second precision
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, Math.max(this.config.processIntervalMs, 5000));
    
    log.info('[Scheduler] Started');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Cancel all running tasks
    for (const [taskId, task] of this.running) {
      task.abortController.abort();
      task.state = 'cancelled';
      task.reject(new Error('Scheduler stopped'));
      log.info(`[Scheduler] Cancelled running task: ${taskId}`);
    }
    this.running.clear();

    // Cancel all queued tasks
    let task: InternalTask | null;
    while ((task = this.queue.dequeue()) !== null) {
      task.state = 'cancelled';
      task.reject(new Error('Scheduler stopped'));
    }

    log.info('[Scheduler] Stopped');
    this.emit('stopped');
  }

  // -------------------------------------------------------------------------
  // SCHEDULING
  // -------------------------------------------------------------------------

  /**
   * Schedule a task for execution
   */
  schedule(task: ScheduledTask): TaskHandle {
    // Check queue size
    if (this.queue.size() >= this.config.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    // Create internal task
    let resolveTask: (value: any) => void;
    let rejectTask: (reason: any) => void;
    
    const promise = new Promise<any>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });

    const internalTask: InternalTask = {
      ...task,
      id: task.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      state: 'pending',
      queuedAt: Date.now(),
      retryCount: 0,
      abortController: new AbortController(),
      resolve: resolveTask!,
      reject: rejectTask!,
    };

    // Add to queue
    this.queue.enqueue(internalTask);
    this.stats.totalScheduled++;
    
    log.debug(`[Scheduler] Scheduled task: ${internalTask.name} (${internalTask.priority})`);
    this.emit('taskScheduled', { id: internalTask.id, name: internalTask.name, priority: internalTask.priority });

    // Return handle
    return {
      id: internalTask.id,
      state: internalTask.state,
      promise,
      cancel: () => this.cancel(internalTask.id),
    };
  }

  /**
   * Schedule a task and wait for result
   */
  async scheduleAndWait<T>(task: ScheduledTask): Promise<T> {
    const handle = this.schedule(task);
    return handle.promise;
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): boolean {
    // Check running tasks
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      runningTask.abortController.abort();
      runningTask.state = 'cancelled';
      this.stats.totalCancelled++;
      log.info(`[Scheduler] Cancelled running task: ${taskId}`);
      return true;
    }

    // Check queue
    if (this.queue.remove(taskId)) {
      this.stats.totalCancelled++;
      log.info(`[Scheduler] Cancelled queued task: ${taskId}`);
      return true;
    }

    return false;
  }

  /**
   * Cancel all tasks in a category
   */
  cancelCategory(category: string): number {
    let cancelled = 0;
    
    // Cancel running tasks
    for (const [taskId, task] of this.running) {
      if (task.category === category) {
        task.abortController.abort();
        task.state = 'cancelled';
        cancelled++;
      }
    }

    // Would need to iterate queue - for now just log
    log.info(`[Scheduler] Cancelled ${cancelled} tasks in category: ${category}`);
    return cancelled;
  }

  // -------------------------------------------------------------------------
  // PAUSE & RESUME
  // -------------------------------------------------------------------------

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    log.info('[Scheduler] Paused');
    this.emit('paused');
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    log.info('[Scheduler] Resumed');
    this.emit('resumed');
  }

  // -------------------------------------------------------------------------
  // QUEUE PROCESSING
  // -------------------------------------------------------------------------

  private processQueue(): void {
    if (this.isPaused) return;
    
    // Check resource pressure
    const concurrency = resourceManager.getRecommendedConcurrency();
    const effectiveConcurrency = Math.min(this.config.maxConcurrent, concurrency);
    
    // Start tasks up to concurrency limit
    while (this.running.size < effectiveConcurrency) {
      const task = this.queue.dequeue();
      if (!task) break;
      
      this.executeTask(task);
    }

    // Update stats
    this.stats.queueDepth = this.queue.size();
    this.stats.runningCount = this.running.size;
  }

  private async executeTask(task: InternalTask): Promise<void> {
    task.state = 'running';
    task.startedAt = Date.now();
    this.running.set(task.id, task);

    // Record wait time
    const waitTime = task.startedAt - task.queuedAt;
    this.recordWaitTime(waitTime);

    log.debug(`[Scheduler] Executing task: ${task.name}`);
    this.emit('taskStarted', { id: task.id, name: task.name });

    const timeout = task.timeout ?? this.config.defaultTimeout;
    const maxRetries = task.maxRetries ?? this.config.maxRetries;

    try {
      // Execute with timeout
      const result = await Promise.race([
        task.execute(task.abortController.signal),
        new Promise((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error(`Task timed out after ${timeout}ms`));
          }, timeout);
          
          task.abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
          });
        }),
      ]);

      // Success
      task.state = 'completed';
      task.completedAt = Date.now();
      this.stats.totalCompleted++;
      
      const executionTime = task.completedAt - task.startedAt;
      this.recordExecutionTime(executionTime);

      log.debug(`[Scheduler] Task completed: ${task.name} (${executionTime}ms)`);
      this.emit('taskCompleted', { id: task.id, name: task.name, duration: executionTime });
      
      task.resolve(result);

    } catch (error) {
      // Check if cancelled
      if (task.abortController.signal.aborted) {
        task.state = 'cancelled';
        task.reject(new Error('Task cancelled'));
        return;
      }

      // Check if retryable
      const canRetry = task.retryable !== false && 
        task.retryCount < maxRetries &&
        !this.isNonRetryableError(error);

      if (canRetry) {
        task.retryCount++;
        task.state = 'pending';
        log.warn(`[Scheduler] Retrying task: ${task.name} (attempt ${task.retryCount + 1})`);
        
        // Re-queue with delay
        setTimeout(() => {
          if (!task.abortController.signal.aborted) {
            this.queue.enqueue(task);
          }
        }, this.config.retryDelayMs * task.retryCount);

      } else {
        // Failed
        task.state = 'failed';
        task.completedAt = Date.now();
        this.stats.totalFailed++;

        log.error(`[Scheduler] Task failed: ${task.name}`, error);
        this.emit('taskFailed', { id: task.id, name: task.name, error });
        
        task.reject(error);
      }
    } finally {
      this.running.delete(task.id);
    }
  }

  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('cancel') || 
             message.includes('abort') ||
             message.includes('permission') ||
             message.includes('not found');
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  private recordWaitTime(time: number): void {
    this.waitTimes.push(time);
    if (this.waitTimes.length > this.maxStatSamples) {
      this.waitTimes.shift();
    }
    this.stats.averageWaitTime = this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;
  }

  private recordExecutionTime(time: number): void {
    this.executionTimes.push(time);
    if (this.executionTimes.length > this.maxStatSamples) {
      this.executionTimes.shift();
    }
    this.stats.averageExecutionTime = this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
  }

  getStats(): SchedulerStats {
    return { ...this.stats };
  }

  getQueueDepthByPriority(): Record<TaskPriority, number> {
    return this.queue.sizeByPriority();
  }

  // -------------------------------------------------------------------------
  // RESOURCE MANAGER INTEGRATION
  // -------------------------------------------------------------------------

  private setupResourceManagerListeners(): void {
    resourceManager.on('pressureChanged', ({ newPressure }) => {
      if (newPressure === 'critical') {
        // Pause on critical pressure
        this.pause();
        log.warn('[Scheduler] Paused due to critical resource pressure');
      } else if (newPressure === 'none' && this.isPaused) {
        // Resume when pressure clears
        this.resume();
      }
    });

    resourceManager.on('systemSuspend', () => {
      this.pause();
    });

    resourceManager.on('systemResume', () => {
      this.resume();
    });
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  setMaxConcurrent(max: number): void {
    this.config.maxConcurrent = Math.max(1, Math.min(10, max));
    log.info(`[Scheduler] Max concurrent set to ${this.config.maxConcurrent}`);
  }

  setMaxQueueSize(max: number): void {
    this.config.maxQueueSize = Math.max(10, Math.min(1000, max));
    log.info(`[Scheduler] Max queue size set to ${this.config.maxQueueSize}`);
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const scheduler = new CentralSchedulerClass();
export default scheduler;
