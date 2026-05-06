// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Automation Stability Guard
// Phase 1: Automation Stability - Prevent duplicates, fix race conditions
// Single execution per event, hard stop on failure
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface AutomationLock {
  automationId: string;
  triggerId: string;
  acquiredAt: number;
  expiresAt: number;
  owner: string;
}

export interface ExecutionContext {
  executionId: string;
  automationId: string;
  triggerId: string;
  startedAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  error?: string;
  hardStopped: boolean;
}

export interface AutomationStabilityConfig {
  lockTimeoutMs: number;
  maxConcurrentExecutions: number;
  deduplicationWindowMs: number;
  hardStopOnFailure: boolean;
  stepTimeoutMs: number;
  maxRetries: number;
}

export interface TriggerEvent {
  id: string;
  automationId: string;
  triggeredAt: number;
  source: string;
  data?: Record<string, unknown>;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: AutomationStabilityConfig = {
  lockTimeoutMs: 60000,           // 1 minute lock timeout
  maxConcurrentExecutions: 5,     // Max 5 automations running at once
  deduplicationWindowMs: 5000,    // Ignore duplicate triggers within 5 seconds
  hardStopOnFailure: true,        // Stop execution on any step failure
  stepTimeoutMs: 30000,           // 30 second step timeout
  maxRetries: 0,                  // No automatic retries by default
};

// ===========================================================================
// AUTOMATION STABILITY GUARD CLASS
// ===========================================================================

class AutomationStabilityGuardClass extends EventEmitter {
  private config: AutomationStabilityConfig;
  private locks: Map<string, AutomationLock> = new Map();
  private executions: Map<string, ExecutionContext> = new Map();
  private recentTriggers: Map<string, TriggerEvent[]> = new Map();
  private isInitialized: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setMaxListeners(50);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.startCleanupTimer();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[AutomationStability] Automation stability guard initialized');
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Hard stop all running executions
    for (const [, context] of this.executions) {
      if (context.status === 'running') {
        this.hardStop(context.executionId, 'System shutdown');
      }
    }

    this.removeAllListeners();
    log.info('[AutomationStability] Automation stability guard shut down');
  }

  private startCleanupTimer(): void {
    // Clean up expired locks and old triggers every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
      this.cleanupOldTriggers();
    }, 30000);
  }

  // -------------------------------------------------------------------------
  // DUPLICATE PREVENTION
  // -------------------------------------------------------------------------

  /**
   * Check if a trigger is a duplicate (same automation triggered recently)
   */
  isDuplicateTrigger(automationId: string, triggerId: string): boolean {
    const key = automationId;
    const recentList = this.recentTriggers.get(key) || [];
    const now = Date.now();

    // Check for recent identical triggers
    const isDuplicate = recentList.some(
      t => t.id === triggerId && (now - t.triggeredAt) < this.config.deduplicationWindowMs
    );

    if (isDuplicate) {
      log.warn(`[AutomationStability] Duplicate trigger blocked: ${automationId} (${triggerId})`);
      this.emit('duplicate-blocked', { automationId, triggerId });
    }

    return isDuplicate;
  }

  /**
   * Record a trigger event
   */
  recordTrigger(automationId: string, triggerId: string, source: string, data?: Record<string, unknown>): TriggerEvent {
    const trigger: TriggerEvent = {
      id: `trig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      automationId,
      triggeredAt: Date.now(),
      source,
      data,
    };

    const key = automationId;
    const recentList = this.recentTriggers.get(key) || [];
    recentList.push(trigger);
    this.recentTriggers.set(key, recentList);

    return trigger;
  }

  private cleanupOldTriggers(): void {
    const now = Date.now();
    const maxAge = this.config.deduplicationWindowMs * 2;

    for (const [key, triggers] of this.recentTriggers) {
      const filtered = triggers.filter(t => (now - t.triggeredAt) < maxAge);
      if (filtered.length === 0) {
        this.recentTriggers.delete(key);
      } else {
        this.recentTriggers.set(key, filtered);
      }
    }
  }

  // -------------------------------------------------------------------------
  // EXECUTION LOCKING (Race Condition Prevention)
  // -------------------------------------------------------------------------

  /**
   * Acquire an exclusive lock for an automation execution
   */
  acquireLock(automationId: string, triggerId: string, owner: string): AutomationLock | null {
    const lockKey = automationId;

    // Check if lock already exists
    const existingLock = this.locks.get(lockKey);
    if (existingLock && Date.now() < existingLock.expiresAt) {
      log.warn(`[AutomationStability] Lock denied for ${automationId} - held by ${existingLock.owner}`);
      this.emit('lock-denied', { automationId, triggerId, existingOwner: existingLock.owner });
      return null;
    }

    // Check concurrent execution limit
    const runningCount = Array.from(this.executions.values())
      .filter(e => e.status === 'running').length;
    
    if (runningCount >= this.config.maxConcurrentExecutions) {
      log.warn(`[AutomationStability] Max concurrent executions reached (${runningCount}/${this.config.maxConcurrentExecutions})`);
      this.emit('execution-limit-reached', { automationId, runningCount });
      return null;
    }

    // Create lock
    const lock: AutomationLock = {
      automationId,
      triggerId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + this.config.lockTimeoutMs,
      owner,
    };

    this.locks.set(lockKey, lock);
    log.info(`[AutomationStability] Lock acquired for ${automationId} by ${owner}`);

    return lock;
  }

  /**
   * Release an execution lock
   */
  releaseLock(automationId: string, owner: string): boolean {
    const lockKey = automationId;
    const lock = this.locks.get(lockKey);

    if (!lock) {
      return false;
    }

    if (lock.owner !== owner) {
      log.warn(`[AutomationStability] Lock release denied - owner mismatch`);
      return false;
    }

    this.locks.delete(lockKey);
    log.info(`[AutomationStability] Lock released for ${automationId}`);
    return true;
  }

  private cleanupExpiredLocks(): void {
    const now = Date.now();
    
    for (const [key, lock] of this.locks) {
      if (now > lock.expiresAt) {
        log.warn(`[AutomationStability] Lock expired for ${lock.automationId}`);
        this.locks.delete(key);
        this.emit('lock-expired', { automationId: lock.automationId });
      }
    }
  }

  // -------------------------------------------------------------------------
  // EXECUTION CONTEXT MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Start a new execution context
   */
  startExecution(
    automationId: string,
    triggerId: string,
    totalSteps: number
  ): ExecutionContext | null {
    // Check for duplicates
    if (this.isDuplicateTrigger(automationId, triggerId)) {
      return null;
    }

    // Record the trigger
    this.recordTrigger(automationId, triggerId, 'manual');

    // Acquire lock
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lock = this.acquireLock(automationId, triggerId, executionId);

    if (!lock) {
      return null;
    }

    // Create execution context
    const context: ExecutionContext = {
      executionId,
      automationId,
      triggerId,
      startedAt: Date.now(),
      status: 'running',
      currentStep: 0,
      totalSteps,
      hardStopped: false,
    };

    this.executions.set(executionId, context);
    this.emit('execution-started', { context });

    return context;
  }

  /**
   * Update execution progress
   */
  updateProgress(executionId: string, currentStep: number): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    context.currentStep = currentStep;
    this.emit('execution-progress', { executionId, currentStep, totalSteps: context.totalSteps });
  }

  /**
   * Complete an execution successfully
   */
  completeExecution(executionId: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    context.status = 'completed';
    this.releaseLock(context.automationId, executionId);
    this.emit('execution-completed', { context });

    log.info(`[AutomationStability] Execution completed: ${executionId}`);
  }

  /**
   * Fail an execution with hard stop
   */
  failExecution(executionId: string, error: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    context.status = 'failed';
    context.error = error;

    if (this.config.hardStopOnFailure) {
      context.hardStopped = true;
      log.error(`[AutomationStability] Hard stop on failure: ${executionId} - ${error}`);
    }

    this.releaseLock(context.automationId, executionId);
    this.emit('execution-failed', { context, error });
  }

  /**
   * Hard stop an execution immediately
   */
  hardStop(executionId: string, reason: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    context.status = 'cancelled';
    context.error = `Hard stop: ${reason}`;
    context.hardStopped = true;

    this.releaseLock(context.automationId, executionId);
    this.emit('execution-hard-stopped', { context, reason });

    // Notify renderer
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('automation:hard-stopped', {
          executionId,
          automationId: context.automationId,
          reason,
        });
      }
    }

    log.warn(`[AutomationStability] Hard stop: ${executionId} - ${reason}`);
  }

  /**
   * Hard stop all running executions for an automation
   */
  hardStopAll(automationId: string, reason: string): void {
    for (const [executionId, context] of this.executions) {
      if (context.automationId === automationId && context.status === 'running') {
        this.hardStop(executionId, reason);
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP EXECUTION WRAPPER
  // -------------------------------------------------------------------------

  /**
   * Execute a step with timeout and error handling
   */
  async executeStep<T>(
    executionId: string,
    stepIndex: number,
    stepName: string,
    operation: () => Promise<T>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const context = this.executions.get(executionId);
    
    if (!context || context.hardStopped) {
      return { success: false, error: 'Execution stopped or not found' };
    }

    if (context.status !== 'running') {
      return { success: false, error: `Invalid execution status: ${context.status}` };
    }

    this.updateProgress(executionId, stepIndex);
    this.emit('step-started', { executionId, stepIndex, stepName });

    try {
      // Execute with timeout
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Step timeout: ${stepName}`)), this.config.stepTimeoutMs)
        ),
      ]);

      this.emit('step-completed', { executionId, stepIndex, stepName });
      return { success: true, result };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emit('step-failed', { executionId, stepIndex, stepName, error: errorMessage });
      
      if (this.config.hardStopOnFailure) {
        this.failExecution(executionId, `Step ${stepIndex} (${stepName}) failed: ${errorMessage}`);
      }

      return { success: false, error: errorMessage };
    }
  }

  // -------------------------------------------------------------------------
  // QUERY METHODS
  // -------------------------------------------------------------------------

  /**
   * Get execution context by ID
   */
  getExecution(executionId: string): ExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all running executions
   */
  getRunningExecutions(): ExecutionContext[] {
    return Array.from(this.executions.values())
      .filter(e => e.status === 'running');
  }

  /**
   * Get executions for an automation
   */
  getExecutionsForAutomation(automationId: string): ExecutionContext[] {
    return Array.from(this.executions.values())
      .filter(e => e.automationId === automationId);
  }

  /**
   * Check if an automation is currently running
   */
  isRunning(automationId: string): boolean {
    return Array.from(this.executions.values())
      .some(e => e.automationId === automationId && e.status === 'running');
  }

  /**
   * Get stability statistics
   */
  getStats(): {
    runningCount: number;
    completedCount: number;
    failedCount: number;
    hardStoppedCount: number;
    activeLocks: number;
    blockedDuplicates: number;
  } {
    const executions = Array.from(this.executions.values());

    return {
      runningCount: executions.filter(e => e.status === 'running').length,
      completedCount: executions.filter(e => e.status === 'completed').length,
      failedCount: executions.filter(e => e.status === 'failed').length,
      hardStoppedCount: executions.filter(e => e.hardStopped).length,
      activeLocks: this.locks.size,
      blockedDuplicates: 0, // Could track this if needed
    };
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('automation:stability:isRunning', (_, automationId: string) => {
      return this.isRunning(automationId);
    });

    ipcMain.handle('automation:stability:getRunning', () => {
      return this.getRunningExecutions();
    });

    ipcMain.handle('automation:stability:hardStop', (_, executionId: string, reason: string) => {
      this.hardStop(executionId, reason);
      return { success: true };
    });

    ipcMain.handle('automation:stability:hardStopAll', (_, automationId: string, reason: string) => {
      this.hardStopAll(automationId, reason);
      return { success: true };
    });

    ipcMain.handle('automation:stability:getStats', () => {
      return this.getStats();
    });
  }
}

// Singleton instance
export const automationStabilityGuard = new AutomationStabilityGuardClass();

// Export initialization function
export function initializeAutomationStability(): Promise<void> {
  return automationStabilityGuard.initialize();
}
