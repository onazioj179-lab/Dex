// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Task Queue System
// Phase 19: Queued, not autonomous task automation
// Tasks run only after explicit user start
// ===========================================================================

import { Logger } from '../utils/Logger';
import { EventEmitter } from 'events';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface TaskDefinition {
  id: string;
  name: string;
  description?: string;
  type: string;
  params: Record<string, any>;
  priority: TaskPriority;
  createdAt: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
  startedAt: number;
  completedAt: number;
  duration: number;
}

export interface QueuedTask extends TaskDefinition {
  status: TaskStatus;
  progress: number;
  result?: TaskResult;
  addedToQueueAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

export interface TaskExecutor {
  type: string;
  execute: (params: Record<string, any>, onProgress: (p: number) => void) => Promise<any>;
  validate?: (params: Record<string, any>) => boolean;
  estimateDuration?: (params: Record<string, any>) => number;
}

export interface QueueStatus {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  paused: boolean;
  currentTask: string | null;
}

// ===========================================================================
// TASK QUEUE CLASS
// ===========================================================================

class TaskQueueClass extends EventEmitter {
  private queue: QueuedTask[] = [];
  private executors: Map<string, TaskExecutor> = new Map();
  private isRunning = false;
  private isPaused = false;
  private currentTask: QueuedTask | null = null;
  private abortController: AbortController | null = null;
  private maxConcurrent = 1; // Sequential by default

  constructor() {
    super();
    this.registerBuiltInExecutors();
  }

  // -------------------------------------------------------------------------
  // EXECUTOR REGISTRATION
  // -------------------------------------------------------------------------

  /**
   * Register a task executor
   */
  registerExecutor(executor: TaskExecutor): void {
    this.executors.set(executor.type, executor);
    log.info(`[TaskQueue] Registered executor: ${executor.type}`);
  }

  /**
   * Get available task types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  // -------------------------------------------------------------------------
  // QUEUE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add task to queue
   */
  addTask(definition: Omit<TaskDefinition, 'id' | 'createdAt'>): QueuedTask {
    const executor = this.executors.get(definition.type);
    
    if (!executor) {
      throw new Error(`Unknown task type: ${definition.type}`);
    }

    if (executor.validate && !executor.validate(definition.params)) {
      throw new Error(`Invalid parameters for task type: ${definition.type}`);
    }

    const task: QueuedTask = {
      ...definition,
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: Date.now(),
      status: 'pending',
      progress: 0,
      addedToQueueAt: Date.now(),
      retryCount: 0,
      maxRetries: 0,
    };

    // Insert based on priority
    const insertIndex = this.findInsertIndex(task.priority);
    this.queue.splice(insertIndex, 0, task);

    this.emit('taskAdded', task);
    log.info(`[TaskQueue] Added task: ${task.name} (${task.id})`);

    return task;
  }

  /**
   * Remove task from queue
   */
  removeTask(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId);
    
    if (index === -1) {
      return false;
    }

    const task = this.queue[index];
    
    if (task.status === 'running') {
      log.warn(`[TaskQueue] Cannot remove running task: ${taskId}`);
      return false;
    }

    this.queue.splice(index, 1);
    this.emit('taskRemoved', task);
    log.info(`[TaskQueue] Removed task: ${taskId}`);

    return true;
  }

  /**
   * Reorder task in queue
   */
  reorderTask(taskId: string, newIndex: number): boolean {
    const currentIndex = this.queue.findIndex(t => t.id === taskId);
    
    if (currentIndex === -1) {
      return false;
    }

    const task = this.queue[currentIndex];
    
    if (task.status !== 'pending') {
      log.warn(`[TaskQueue] Can only reorder pending tasks`);
      return false;
    }

    // Remove and reinsert
    this.queue.splice(currentIndex, 1);
    const clampedIndex = Math.max(0, Math.min(newIndex, this.queue.length));
    this.queue.splice(clampedIndex, 0, task);

    this.emit('queueReordered', this.queue);
    return true;
  }

  /**
   * Get all tasks
   */
  getTasks(): QueuedTask[] {
    return [...this.queue];
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): QueuedTask | null {
    return this.queue.find(t => t.id === taskId) ?? null;
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): number {
    const before = this.queue.length;
    this.queue = this.queue.filter(t => t.status !== 'completed' && t.status !== 'failed');
    const removed = before - this.queue.length;
    
    if (removed > 0) {
      this.emit('queueCleared', removed);
      log.info(`[TaskQueue] Cleared ${removed} completed tasks`);
    }
    
    return removed;
  }

  /**
   * Clear all pending tasks
   */
  clearPending(): number {
    const before = this.queue.length;
    this.queue = this.queue.filter(t => t.status !== 'pending');
    const removed = before - this.queue.length;
    
    if (removed > 0) {
      log.info(`[TaskQueue] Cleared ${removed} pending tasks`);
    }
    
    return removed;
  }

  // -------------------------------------------------------------------------
  // EXECUTION CONTROL
  // -------------------------------------------------------------------------

  /**
   * Start queue execution
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('[TaskQueue] Queue is already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.emit('started');
    log.info('[TaskQueue] Queue execution started');

    await this.processQueue();
  }

  /**
   * Pause queue execution
   */
  pause(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.emit('paused');
    log.info('[TaskQueue] Queue execution paused');
  }

  /**
   * Resume queue execution
   */
  async resume(): Promise<void> {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.emit('resumed');
    log.info('[TaskQueue] Queue execution resumed');

    await this.processQueue();
  }

  /**
   * Stop queue execution
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isPaused = false;
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.emit('stopped');
    log.info('[TaskQueue] Queue execution stopped');
  }

  /**
   * Cancel current task
   */
  cancelCurrent(): boolean {
    if (!this.currentTask) {
      return false;
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    this.currentTask.status = 'cancelled';
    this.emit('taskCancelled', this.currentTask);
    log.info(`[TaskQueue] Cancelled task: ${this.currentTask.id}`);

    return true;
  }

  /**
   * Get queue status
   */
  getStatus(): QueueStatus {
    return {
      total: this.queue.length,
      pending: this.queue.filter(t => t.status === 'pending').length,
      running: this.queue.filter(t => t.status === 'running').length,
      completed: this.queue.filter(t => t.status === 'completed').length,
      failed: this.queue.filter(t => t.status === 'failed').length,
      paused: this.isPaused,
      currentTask: this.currentTask?.id ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // QUEUE PROCESSING
  // -------------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    while (this.isRunning && !this.isPaused) {
      const nextTask = this.queue.find(t => t.status === 'pending');
      
      if (!nextTask) {
        log.info('[TaskQueue] No more pending tasks');
        this.isRunning = false;
        this.emit('completed');
        break;
      }

      await this.executeTask(nextTask);
    }
  }

  private async executeTask(task: QueuedTask): Promise<void> {
    const executor = this.executors.get(task.type);
    
    if (!executor) {
      task.status = 'failed';
      task.result = {
        taskId: task.id,
        success: false,
        error: `No executor for task type: ${task.type}`,
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 0,
      };
      this.emit('taskFailed', task);
      return;
    }

    this.currentTask = task;
    this.abortController = new AbortController();
    
    task.status = 'running';
    task.startedAt = Date.now();
    this.emit('taskStarted', task);
    log.info(`[TaskQueue] Executing task: ${task.name} (${task.id})`);

    try {
      const output = await executor.execute(
        task.params,
        (progress) => {
          task.progress = Math.min(100, Math.max(0, progress));
          this.emit('taskProgress', task);
        }
      );

      task.status = 'completed';
      task.progress = 100;
      task.completedAt = Date.now();
      task.result = {
        taskId: task.id,
        success: true,
        output,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        duration: task.completedAt - task.startedAt,
      };

      this.emit('taskCompleted', task);
      log.info(`[TaskQueue] Task completed: ${task.id} (${task.result.duration}ms)`);

    } catch (error) {
      // Task may have been cancelled by another operation
      const currentStatus = task.status as TaskStatus;
      if (currentStatus !== 'cancelled') {
        task.status = 'failed';
        task.completedAt = Date.now();
        task.result = {
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          startedAt: task.startedAt!,
          completedAt: task.completedAt,
          duration: task.completedAt - task.startedAt!,
        };

        this.emit('taskFailed', task);
        log.error(`[TaskQueue] Task failed: ${task.id}`, error);
      }
    } finally {
      this.currentTask = null;
      this.abortController = null;
    }
  }

  private findInsertIndex(priority: TaskPriority): number {
    const priorityOrder: Record<TaskPriority, number> = {
      high: 0,
      normal: 1,
      low: 2,
    };

    const targetPriority = priorityOrder[priority];
    
    // Find first task with lower priority
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].status === 'pending') {
        const taskPriority = priorityOrder[this.queue[i].priority];
        if (taskPriority > targetPriority) {
          return i;
        }
      }
    }

    // Find position after running/completed tasks
    const firstPending = this.queue.findIndex(t => t.status === 'pending');
    return firstPending === -1 ? this.queue.length : firstPending;
  }

  // -------------------------------------------------------------------------
  // BUILT-IN EXECUTORS
  // -------------------------------------------------------------------------

  private registerBuiltInExecutors(): void {
    // Delay executor (for testing/debugging)
    this.registerExecutor({
      type: 'delay',
      execute: async (params, onProgress) => {
        const duration = params.duration ?? 1000;
        const steps = 10;
        const stepDuration = duration / steps;

        for (let i = 0; i < steps; i++) {
          await new Promise(resolve => setTimeout(resolve, stepDuration));
          onProgress(((i + 1) / steps) * 100);
        }

        return { delayed: duration };
      },
      validate: (params) => typeof params.duration === 'number' && params.duration > 0,
    });

    // Log executor
    this.registerExecutor({
      type: 'log',
      execute: async (params, onProgress) => {
        onProgress(50);
        log.info(`[TaskQueue] Log task: ${params.message}`);
        onProgress(100);
        return { logged: params.message };
      },
      validate: (params) => typeof params.message === 'string',
    });

    // Batch executor (runs multiple sub-operations via their registered executors)
    this.registerExecutor({
      type: 'batch',
      execute: async (params, onProgress) => {
        const operations: { type: string; params?: any }[] = params.operations ?? [];
        const results: any[] = [];

        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          const executor = this.executors.get(op.type);
          if (!executor || op.type === 'batch') {
            results.push({ index: i, type: op.type, error: 'Unknown or recursive task type' });
          } else {
            try {
              const result = await executor.execute(op.params ?? {}, (p) => {
                // Scale sub-task progress to overall batch progress
                const baseProgress = (i / operations.length) * 100;
                const subProgress = (p / 100) * (100 / operations.length);
                onProgress(baseProgress + subProgress);
              });
              results.push({ index: i, type: op.type, result });
            } catch (err: any) {
              results.push({ index: i, type: op.type, error: err.message || 'Failed' });
            }
          }
          onProgress(((i + 1) / operations.length) * 100);
        }

        return { results };
      },
    });
  }
}

// Singleton export
export const taskQueue = new TaskQueueClass();

// ===========================================================================
// TASK CHAIN BUILDER
// ===========================================================================

export class TaskChainBuilder {
  private tasks: Omit<TaskDefinition, 'id' | 'createdAt'>[] = [];

  /**
   * Add a task to the chain
   */
  add(
    type: string,
    name: string,
    params: Record<string, any>,
    options: { priority?: TaskPriority; description?: string } = {}
  ): TaskChainBuilder {
    this.tasks.push({
      type,
      name,
      params,
      priority: options.priority ?? 'normal',
      description: options.description,
    });
    return this;
  }

  /**
   * Add delay between tasks
   */
  delay(ms: number): TaskChainBuilder {
    return this.add('delay', `Wait ${ms}ms`, { duration: ms });
  }

  /**
   * Add log message
   */
  log(message: string): TaskChainBuilder {
    return this.add('log', 'Log', { message });
  }

  /**
   * Queue all tasks
   */
  queue(): QueuedTask[] {
    const queued: QueuedTask[] = [];
    
    for (const task of this.tasks) {
      try {
        queued.push(taskQueue.addTask(task));
      } catch (error) {
        log.error(`[TaskChainBuilder] Failed to queue task: ${task.name}`, error);
      }
    }

    return queued;
  }

  /**
   * Queue and start execution
   */
  async execute(): Promise<QueuedTask[]> {
    const queued = this.queue();
    await taskQueue.start();
    return queued;
  }

  /**
   * Get preview of tasks
   */
  preview(): Omit<TaskDefinition, 'id' | 'createdAt'>[] {
    return [...this.tasks];
  }

  /**
   * Clear the chain
   */
  clear(): TaskChainBuilder {
    this.tasks = [];
    return this;
  }
}
