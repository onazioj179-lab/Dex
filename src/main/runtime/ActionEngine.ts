// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Action Engine
// Phase 28: Backend Architecture Refinement
// Step-by-step execution with cancellation, pause, and deterministic ordering
// ===========================================================================

import { EventEmitter } from 'events';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ActionState = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Action {
  id: string;
  type: string;
  name: string;
  params: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
  retryable?: boolean;
  maxRetries?: number;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  output?: any;
  error?: ActionError;
  startedAt: number;
  completedAt: number;
  duration: number;
  retries: number;
}

export interface ActionError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, any>;
}

export interface QueuedAction {
  action: Action;
  state: ActionState;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  progress: number;
  result?: ActionResult;
  retryCount: number;
  abortController: AbortController;
}

export interface ActionExecutor {
  type: string;
  execute: (
    action: Action,
    context: ActionContext
  ) => Promise<any>;
  validate?: (action: Action) => { valid: boolean; error?: string };
  estimateDuration?: (action: Action) => number;
  canRetry?: (error: ActionError) => boolean;
}

export interface ActionContext {
  signal: AbortSignal;
  onProgress: (progress: number) => void;
  checkPause: () => Promise<void>;
  getSharedState: (key: string) => any;
  setSharedState: (key: string, value: any) => void;
}

export interface QueueStatus {
  state: 'idle' | 'running' | 'paused';
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  currentAction: string | null;
}

// ===========================================================================
// ACTION ENGINE CLASS
// ===========================================================================

class ActionEngineClass extends EventEmitter {
  // Queue management
  private queue: QueuedAction[] = [];
  private executors: Map<string, ActionExecutor> = new Map();
  private currentAction: QueuedAction | null = null;
  
  // State
  private engineState: 'idle' | 'running' | 'paused' = 'idle';
  private isPaused = false;
  private pausePromiseResolve: (() => void) | null = null;
  
  // Shared state between actions
  private sharedState: Map<string, any> = new Map();
  
  // Configuration
  private config = {
    maxQueueSize: 100,
    defaultTimeout: 60000,      // 1 minute
    maxRetries: 2,
    retryDelayMs: 1000,
    processIntervalMs: 2000,    // Queue check interval (increased from 500ms for idle efficiency)
  };

  // Processing
  private processInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    if (this.processInterval) return;
    
    // 5s minimum — actions are event-driven, queue check is fallback
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, Math.max(this.config.processIntervalMs, 5000));
    
    log.info('[ActionEngine] Started');
  }

  async stop(): Promise<void> {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Cancel current action
    if (this.currentAction) {
      this.currentAction.abortController.abort();
    }

    // Clear queue
    this.queue = [];
    this.engineState = 'idle';
    
    log.info('[ActionEngine] Stopped');
  }

  // -------------------------------------------------------------------------
  // EXECUTOR REGISTRATION
  // -------------------------------------------------------------------------

  registerExecutor(executor: ActionExecutor): void {
    this.executors.set(executor.type, executor);
    log.info(`[ActionEngine] Registered executor: ${executor.type}`);
  }

  getAvailableTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  // -------------------------------------------------------------------------
  // QUEUE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add action to queue
   */
  enqueue(action: Action): { queued: boolean; position?: number; error?: string } {
    // Validate queue size
    if (this.queue.length >= this.config.maxQueueSize) {
      return { queued: false, error: 'Queue is full' };
    }

    // Validate action type
    if (!this.executors.has(action.type)) {
      return { queued: false, error: `Unknown action type: ${action.type}` };
    }

    // Validate action params
    const executor = this.executors.get(action.type)!;
    if (executor.validate) {
      const validation = executor.validate(action);
      if (!validation.valid) {
        return { queued: false, error: validation.error };
      }
    }

    // Create queued action
    const queuedAction: QueuedAction = {
      action,
      state: 'queued',
      queuedAt: Date.now(),
      progress: 0,
      retryCount: 0,
      abortController: new AbortController(),
    };

    // Insert based on priority
    const insertIndex = this.findInsertIndex(action.priority);
    this.queue.splice(insertIndex, 0, queuedAction);

    log.info(`[ActionEngine] Enqueued action: ${action.name} (${action.type})`);
    this.emit('actionQueued', { action, position: insertIndex });

    return { queued: true, position: insertIndex };
  }

  /**
   * Execute a single action immediately (bypass queue)
   */
  async executeImmediate(action: Action): Promise<ActionResult> {
    const queuedAction: QueuedAction = {
      action,
      state: 'queued',
      queuedAt: Date.now(),
      progress: 0,
      retryCount: 0,
      abortController: new AbortController(),
    };

    return this.executeAction(queuedAction);
  }

  /**
   * Cancel a queued action
   */
  cancel(actionId: string): boolean {
    // Check current action
    if (this.currentAction?.action.id === actionId) {
      this.currentAction.abortController.abort();
      this.currentAction.state = 'cancelled';
      log.info(`[ActionEngine] Cancelled running action: ${actionId}`);
      return true;
    }

    // Check queue
    const index = this.queue.findIndex(qa => qa.action.id === actionId);
    if (index !== -1) {
      this.queue[index].state = 'cancelled';
      this.queue.splice(index, 1);
      log.info(`[ActionEngine] Cancelled queued action: ${actionId}`);
      this.emit('actionCancelled', { actionId });
      return true;
    }

    return false;
  }

  /**
   * Cancel all actions
   */
  cancelAll(): void {
    if (this.currentAction) {
      this.currentAction.abortController.abort();
    }
    this.queue = [];
    log.info('[ActionEngine] Cancelled all actions');
    this.emit('queueCleared');
  }

  // -------------------------------------------------------------------------
  // PAUSE & RESUME
  // -------------------------------------------------------------------------

  pause(): void {
    if (this.engineState === 'paused') return;
    
    this.isPaused = true;
    this.engineState = 'paused';
    log.info('[ActionEngine] Paused');
    this.emit('paused');
  }

  resume(): void {
    if (this.engineState !== 'paused') return;
    
    this.isPaused = false;
    this.engineState = 'running';
    
    // Resolve pause promise if waiting
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
    
    log.info('[ActionEngine] Resumed');
    this.emit('resumed');
  }

  // -------------------------------------------------------------------------
  // QUEUE PROCESSING
  // -------------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    // Skip if already processing or paused
    if (this.isProcessing || this.isPaused) return;
    
    // Skip if nothing in queue
    if (this.queue.length === 0) {
      if (this.engineState !== 'idle') {
        this.engineState = 'idle';
        this.emit('idle');
      }
      return;
    }

    // Get next queued action
    const nextAction = this.queue.find(qa => qa.state === 'queued');
    if (!nextAction) return;

    this.isProcessing = true;
    this.engineState = 'running';
    this.currentAction = nextAction;
    nextAction.state = 'running';

    try {
      const result = await this.executeAction(nextAction);
      nextAction.result = result;
      nextAction.state = result.success ? 'completed' : 'failed';
      
      // Remove from queue
      const index = this.queue.indexOf(nextAction);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }

      this.emit('actionCompleted', { action: nextAction.action, result });

    } catch (error) {
      log.error(`[ActionEngine] Action failed: ${nextAction.action.name}`, error);
      nextAction.state = 'failed';
      
      const index = this.queue.indexOf(nextAction);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
      
      this.emit('actionFailed', { action: nextAction.action, error });
    }

    this.currentAction = null;
    this.isProcessing = false;
  }

  private async executeAction(queuedAction: QueuedAction): Promise<ActionResult> {
    const { action, abortController } = queuedAction;
    const executor = this.executors.get(action.type)!;
    const timeout = action.timeout ?? this.config.defaultTimeout;
    const maxRetries = action.maxRetries ?? this.config.maxRetries;

    queuedAction.startedAt = Date.now();
    let lastError: ActionError | undefined;
    let retries = 0;

    while (retries <= maxRetries) {
      if (abortController.signal.aborted) {
        return this.createResult(queuedAction, false, undefined, {
          code: 'CANCELLED',
          message: 'Action was cancelled',
          recoverable: false,
        });
      }

      try {
        // Create execution context
        const context: ActionContext = {
          signal: abortController.signal,
          onProgress: (progress) => {
            queuedAction.progress = Math.min(100, Math.max(0, progress));
            this.emit('actionProgress', { actionId: action.id, progress: queuedAction.progress });
          },
          checkPause: async () => {
            if (this.isPaused) {
              await new Promise<void>(resolve => {
                this.pausePromiseResolve = resolve;
              });
            }
          },
          getSharedState: (key) => this.sharedState.get(key),
          setSharedState: (key, value) => this.sharedState.set(key, value),
        };

        // Execute with timeout
        const output = await Promise.race([
          executor.execute(action, context),
          new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error(`Action timed out after ${timeout}ms`));
            }, timeout);
            
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('Action was cancelled'));
            });
          }),
        ]);

        // Success
        return this.createResult(queuedAction, true, output);

      } catch (error) {
        lastError = this.normalizeError(error);
        
        // Check if retryable
        const canRetry = action.retryable !== false && 
          lastError.recoverable &&
          retries < maxRetries &&
          (!executor.canRetry || executor.canRetry(lastError));

        if (canRetry) {
          retries++;
          queuedAction.retryCount = retries;
          log.warn(`[ActionEngine] Retrying action: ${action.name} (attempt ${retries + 1})`);
          await this.delay(this.config.retryDelayMs * retries);
        } else {
          break;
        }
      }
    }

    // Failed after all retries
    return this.createResult(queuedAction, false, undefined, lastError);
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private findInsertIndex(priority: Action['priority']): number {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const targetPriority = priorityOrder[priority];

    for (let i = 0; i < this.queue.length; i++) {
      const queuedPriority = priorityOrder[this.queue[i].action.priority];
      if (queuedPriority > targetPriority) {
        return i;
      }
    }
    return this.queue.length;
  }

  private createResult(
    queuedAction: QueuedAction,
    success: boolean,
    output?: any,
    error?: ActionError
  ): ActionResult {
    const completedAt = Date.now();
    queuedAction.completedAt = completedAt;

    return {
      actionId: queuedAction.action.id,
      success,
      output,
      error,
      startedAt: queuedAction.startedAt!,
      completedAt,
      duration: completedAt - queuedAction.startedAt!,
      retries: queuedAction.retryCount,
    };
  }

  private normalizeError(error: unknown): ActionError {
    if (error instanceof Error) {
      const isTimeout = error.message.includes('timeout') || error.message.includes('timed out');
      const isCancelled = error.message.includes('cancel') || error.message.includes('abort');
      
      return {
        code: isCancelled ? 'CANCELLED' : isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR',
        message: error.message,
        recoverable: !isCancelled && !isTimeout,
        context: { stack: error.stack },
      };
    }
    
    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
      recoverable: true,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): QueueStatus {
    return {
      state: this.engineState,
      total: this.queue.length + (this.currentAction ? 1 : 0),
      pending: this.queue.filter(qa => qa.state === 'queued').length,
      running: this.currentAction ? 1 : 0,
      completed: 0, // Not tracked in queue
      failed: 0,    // Not tracked in queue
      currentAction: this.currentAction?.action.name ?? null,
    };
  }

  getQueue(): ReadonlyArray<QueuedAction> {
    return [...this.queue];
  }

  getSharedStateSnapshot(): Record<string, any> {
    return Object.fromEntries(this.sharedState);
  }

  clearSharedState(): void {
    this.sharedState.clear();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const actionEngine = new ActionEngineClass();
export default actionEngine;
