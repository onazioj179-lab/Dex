// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Optimistic Update System
// Phase 69: Faster Feedback Loop
// Immediate UI acknowledgment, deferred heavy work, full reversibility
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type OperationType = 
  | 'file_create' | 'file_delete' | 'file_rename' | 'file_move' | 'file_copy'
  | 'note_create' | 'note_update' | 'note_delete'
  | 'task_create' | 'task_update' | 'task_delete' | 'task_complete'
  | 'action_run' | 'action_stop' | 'action_queue'
  | 'media_play' | 'media_pause' | 'media_seek'
  | 'settings_update'
  | 'transfer_start' | 'transfer_cancel';

export interface OptimisticOperation<T = unknown> {
  id: string;
  type: OperationType;
  optimisticValue: T;
  actualValue?: T;
  status: 'pending' | 'confirmed' | 'failed' | 'rolled-back' | 'cancelled';
  createdAt: number;
  confirmedAt?: number;
  error?: string;
  rollbackData?: T;
  retryCount: number;
  maxRetries: number;
  timeout: number;
}

export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type OperationExecutor<T> = () => Promise<OperationResult<T>>;
export type RollbackExecutor<T> = (rollbackData: T) => Promise<void>;

// ===========================================================================
// OPTIMISTIC UPDATE MANAGER
// ===========================================================================

class OptimisticUpdateManagerClass extends EventEmitter {
  private operations: Map<string, OptimisticOperation> = new Map();
  private executors: Map<string, OperationExecutor<unknown>> = new Map();
  private rollbackExecutors: Map<string, RollbackExecutor<unknown>> = new Map();
  private operationCounter = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Configuration
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly DEFAULT_MAX_RETRIES = 2;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly MAX_OPERATION_AGE = 300000; // 5 minutes

  constructor() {
    super();
    this.setupIPC();
    this.startCleanup();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('optimistic:submit', async (_event, type: OperationType, optimisticValue: unknown, rollbackData?: unknown) => {
      const id = this.createOperation(type, optimisticValue, rollbackData);
      return { id, status: 'pending' };
    });

    ipcMain.handle('optimistic:confirm', async (_event, id: string, actualValue?: unknown) => {
      return this.confirmOperation(id, actualValue);
    });

    ipcMain.handle('optimistic:fail', async (_event, id: string, error: string) => {
      return this.failOperation(id, error);
    });

    ipcMain.handle('optimistic:cancel', async (_event, id: string) => {
      return this.cancelOperation(id);
    });

    ipcMain.handle('optimistic:status', (_event, id: string) => {
      return this.getOperationStatus(id);
    });

    ipcMain.handle('optimistic:pending', () => {
      return this.getPendingOperations();
    });
  }

  // -------------------------------------------------------------------------
  // OPERATION LIFECYCLE
  // -------------------------------------------------------------------------

  /**
   * Create a new optimistic operation
   * Returns immediately with an ID, UI can update optimistically
   */
  createOperation<T>(
    type: OperationType,
    optimisticValue: T,
    rollbackData?: T,
    options?: {
      timeout?: number;
      maxRetries?: number;
    }
  ): string {
    const id = `op-${Date.now()}-${++this.operationCounter}`;
    
    const operation: OptimisticOperation<T> = {
      id,
      type,
      optimisticValue,
      rollbackData,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? this.DEFAULT_MAX_RETRIES,
      timeout: options?.timeout ?? this.DEFAULT_TIMEOUT
    };

    this.operations.set(id, operation);
    
    // Broadcast optimistic update to UI
    this.broadcastOperation(operation, 'created');
    
    log.debug(`[Optimistic] Created operation ${id}: ${type}`);
    
    // Set timeout for automatic failure
    setTimeout(() => {
      const op = this.operations.get(id);
      if (op && op.status === 'pending') {
        this.failOperation(id, 'Operation timed out');
      }
    }, operation.timeout);

    this.emit('operation:created', operation);
    return id;
  }

  /**
   * Execute an optimistic operation with background work
   */
  async executeOptimistic<T>(
    type: OperationType,
    optimisticValue: T,
    executor: OperationExecutor<T>,
    rollback?: RollbackExecutor<T>,
    rollbackData?: T
  ): Promise<{ id: string; promise: Promise<OperationResult<T>> }> {
    const id = this.createOperation(type, optimisticValue, rollbackData);
    
    this.executors.set(id, executor as OperationExecutor<unknown>);
    if (rollback) {
      this.rollbackExecutors.set(id, rollback as RollbackExecutor<unknown>);
    }

    const promise = this.executeInBackground<T>(id);
    
    return { id, promise };
  }

  /**
   * Execute the actual work in background
   */
  private async executeInBackground<T>(id: string): Promise<OperationResult<T>> {
    const operation = this.operations.get(id);
    if (!operation) {
      return { success: false, error: 'Operation not found' };
    }

    const executor = this.executors.get(id) as OperationExecutor<T> | undefined;
    if (!executor) {
      return { success: false, error: 'No executor registered' };
    }

    try {
      const result = await executor();
      
      if (result.success) {
        this.confirmOperation(id, result.data);
        return result;
      } else {
        this.failOperation(id, result.error || 'Operation failed');
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.failOperation(id, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Confirm an operation succeeded
   */
  confirmOperation<T>(id: string, actualValue?: T): boolean {
    const operation = this.operations.get(id);
    if (!operation) {
      log.warn(`[Optimistic] Cannot confirm unknown operation: ${id}`);
      return false;
    }

    if (operation.status !== 'pending') {
      log.warn(`[Optimistic] Cannot confirm operation ${id} in status ${operation.status}`);
      return false;
    }

    operation.status = 'confirmed';
    operation.confirmedAt = Date.now();
    operation.actualValue = actualValue;

    // Broadcast confirmation
    this.broadcastOperation(operation, 'confirmed');
    
    log.debug(`[Optimistic] Confirmed operation ${id}`);
    this.emit('operation:confirmed', operation);
    
    // Cleanup executors
    this.executors.delete(id);
    this.rollbackExecutors.delete(id);
    
    return true;
  }

  /**
   * Fail an operation and trigger rollback
   */
  async failOperation(id: string, error: string): Promise<boolean> {
    const operation = this.operations.get(id);
    if (!operation) {
      return false;
    }

    if (operation.status !== 'pending') {
      return false;
    }

    // Check if we should retry
    if (operation.retryCount < operation.maxRetries) {
      operation.retryCount++;
      log.info(`[Optimistic] Retrying operation ${id} (attempt ${operation.retryCount})`);
      
      const executor = this.executors.get(id);
      if (executor) {
        this.executeInBackground(id);
        return true;
      }
    }

    operation.status = 'failed';
    operation.error = error;
    operation.confirmedAt = Date.now();

    // Execute rollback if available
    await this.executeRollback(operation);

    // Broadcast failure
    this.broadcastOperation(operation, 'failed');
    
    log.warn(`[Optimistic] Failed operation ${id}: ${error}`);
    this.emit('operation:failed', operation);
    
    // Cleanup
    this.executors.delete(id);
    this.rollbackExecutors.delete(id);
    
    return true;
  }

  /**
   * Cancel a pending operation
   */
  async cancelOperation(id: string): Promise<boolean> {
    const operation = this.operations.get(id);
    if (!operation) {
      return false;
    }

    if (operation.status !== 'pending') {
      return false;
    }

    operation.status = 'cancelled';
    operation.confirmedAt = Date.now();

    // Execute rollback
    await this.executeRollback(operation);

    // Broadcast cancellation
    this.broadcastOperation(operation, 'cancelled');
    
    log.debug(`[Optimistic] Cancelled operation ${id}`);
    this.emit('operation:cancelled', operation);
    
    // Cleanup
    this.executors.delete(id);
    this.rollbackExecutors.delete(id);
    
    return true;
  }

  /**
   * Execute rollback for an operation
   */
  private async executeRollback(operation: OptimisticOperation): Promise<void> {
    const rollbackExecutor = this.rollbackExecutors.get(operation.id);
    if (!rollbackExecutor || !operation.rollbackData) {
      return;
    }

    try {
      await rollbackExecutor(operation.rollbackData);
      operation.status = 'rolled-back';
      log.debug(`[Optimistic] Rolled back operation ${operation.id}`);
    } catch (error) {
      log.error(`[Optimistic] Rollback failed for ${operation.id}:`, error);
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get operation status
   */
  getOperationStatus(id: string): OptimisticOperation | null {
    return this.operations.get(id) || null;
  }

  /**
   * Get all pending operations
   */
  getPendingOperations(): OptimisticOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.status === 'pending');
  }

  /**
   * Get operations by type
   */
  getOperationsByType(type: OperationType): OptimisticOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.type === type);
  }

  /**
   * Check if any operations are pending for a resource
   */
  hasPendingOperations(type?: OperationType): boolean {
    for (const op of this.operations.values()) {
      if (op.status === 'pending') {
        if (!type || op.type === type) {
          return true;
        }
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // BROADCAST
  // -------------------------------------------------------------------------

  private broadcastOperation(operation: OptimisticOperation, event: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(`optimistic:${event}`, {
          id: operation.id,
          type: operation.type,
          status: operation.status,
          optimisticValue: operation.optimisticValue,
          actualValue: operation.actualValue,
          error: operation.error
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, op] of this.operations) {
      // Remove old completed/failed operations
      if (op.status !== 'pending' && op.confirmedAt) {
        if (now - op.confirmedAt > this.MAX_OPERATION_AGE) {
          toDelete.push(id);
        }
      }
    }

    for (const id of toDelete) {
      this.operations.delete(id);
      this.executors.delete(id);
      this.rollbackExecutors.delete(id);
    }

    if (toDelete.length > 0) {
      log.debug(`[Optimistic] Cleaned up ${toDelete.length} old operations`);
    }
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): {
    total: number;
    pending: number;
    confirmed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = {
      total: this.operations.size,
      pending: 0,
      confirmed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const op of this.operations.values()) {
      switch (op.status) {
        case 'pending': stats.pending++; break;
        case 'confirmed': stats.confirmed++; break;
        case 'failed': stats.failed++; break;
        case 'cancelled': stats.cancelled++; break;
      }
    }

    return stats;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const OptimisticUpdateManager = new OptimisticUpdateManagerClass();
export default OptimisticUpdateManager;
