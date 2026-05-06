// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Error Classification & Recovery System
// Phase 28: Backend Architecture Refinement
// Classify errors, retry safely, rollback partial operations
// ===========================================================================

import { EventEmitter } from 'events';
import log from 'electron-log';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type ErrorCategory = 
  | 'system'      // OS-level errors (disk, memory, permissions)
  | 'network'     // Network/connectivity errors
  | 'data'        // Data corruption or validation errors
  | 'operation'   // Task/operation execution errors
  | 'user'        // User input or action errors
  | 'internal';   // Internal/programming errors

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical' | 'fatal';

export type RecoveryStrategy = 
  | 'retry'       // Retry the operation
  | 'rollback'    // Rollback changes
  | 'skip'        // Skip and continue
  | 'restart'     // Restart subsystem
  | 'abort'       // Abort entire operation
  | 'notify'      // Just notify user
  | 'ignore';     // Ignore (for non-critical)

export interface ClassifiedError {
  id: string;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverable: boolean;
  suggestedStrategy: RecoveryStrategy;
  timestamp: number;
  context: ErrorContext;
  original?: Error;
}

export interface ErrorContext {
  source: string;
  operation?: string;
  input?: any;
  state?: Record<string, any>;
  stack?: string;
  attempts?: number;
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  message?: string;
  resumed?: boolean;
}

export interface RollbackOperation {
  id: string;
  description: string;
  execute: () => Promise<void>;
  createdAt: number;
}

// ===========================================================================
// ERROR CODES
// ===========================================================================

export const ErrorCode = {
  // System errors
  SYSTEM_MEMORY_PRESSURE: { category: 'system' as const, severity: 'critical' as const, recoverable: true },
  SYSTEM_DISK_FULL: { category: 'system' as const, severity: 'critical' as const, recoverable: false },
  SYSTEM_PERMISSION_DENIED: { category: 'system' as const, severity: 'error' as const, recoverable: false },
  SYSTEM_FILE_NOT_FOUND: { category: 'system' as const, severity: 'error' as const, recoverable: false },
  SYSTEM_PROCESS_CRASHED: { category: 'system' as const, severity: 'critical' as const, recoverable: true },
  
  // Network errors
  NETWORK_OFFLINE: { category: 'network' as const, severity: 'warning' as const, recoverable: true },
  NETWORK_TIMEOUT: { category: 'network' as const, severity: 'warning' as const, recoverable: true },
  NETWORK_CONNECTION_REFUSED: { category: 'network' as const, severity: 'error' as const, recoverable: true },
  
  // Data errors
  DATA_CORRUPTION: { category: 'data' as const, severity: 'critical' as const, recoverable: true },
  DATA_VALIDATION_FAILED: { category: 'data' as const, severity: 'error' as const, recoverable: false },
  DATA_LOAD_FAILED: { category: 'data' as const, severity: 'error' as const, recoverable: true },
  DATA_SAVE_FAILED: { category: 'data' as const, severity: 'error' as const, recoverable: true },
  
  // Operation errors
  OPERATION_TIMEOUT: { category: 'operation' as const, severity: 'error' as const, recoverable: true },
  OPERATION_CANCELLED: { category: 'operation' as const, severity: 'info' as const, recoverable: false },
  OPERATION_FAILED: { category: 'operation' as const, severity: 'error' as const, recoverable: true },
  OPERATION_INVALID_STATE: { category: 'operation' as const, severity: 'error' as const, recoverable: false },
  
  // User errors
  USER_INPUT_INVALID: { category: 'user' as const, severity: 'warning' as const, recoverable: false },
  USER_ACTION_DENIED: { category: 'user' as const, severity: 'info' as const, recoverable: false },
  
  // Internal errors
  INTERNAL_ASSERTION: { category: 'internal' as const, severity: 'critical' as const, recoverable: false },
  INTERNAL_UNHANDLED: { category: 'internal' as const, severity: 'critical' as const, recoverable: true },
  INTERNAL_UNKNOWN: { category: 'internal' as const, severity: 'error' as const, recoverable: true },
} as const;

type ErrorCodeKey = keyof typeof ErrorCode;

// ===========================================================================
// ERROR CLASSIFIER CLASS
// ===========================================================================

class ErrorClassifierClass extends EventEmitter {
  // Error history
  private errors: ClassifiedError[] = [];
  private maxErrors = 500;
  
  // Rollback stack
  private rollbackStack: Map<string, RollbackOperation[]> = new Map();
  
  // Recovery handlers
  private recoveryHandlers: Map<string, (error: ClassifiedError) => Promise<RecoveryResult>> = new Map();
  
  // Error patterns for classification
  private patterns: Array<{
    pattern: RegExp;
    code: ErrorCodeKey;
  }> = [
    { pattern: /ENOSPC|disk full|no space/i, code: 'SYSTEM_DISK_FULL' },
    { pattern: /EACCES|EPERM|permission denied/i, code: 'SYSTEM_PERMISSION_DENIED' },
    { pattern: /ENOENT|not found|does not exist/i, code: 'SYSTEM_FILE_NOT_FOUND' },
    { pattern: /ECONNREFUSED|connection refused/i, code: 'NETWORK_CONNECTION_REFUSED' },
    { pattern: /ETIMEDOUT|timeout|timed out/i, code: 'OPERATION_TIMEOUT' },
    { pattern: /ENETUNREACH|ENOTFOUND|network/i, code: 'NETWORK_OFFLINE' },
    { pattern: /cancel|abort/i, code: 'OPERATION_CANCELLED' },
    { pattern: /invalid|validation/i, code: 'DATA_VALIDATION_FAILED' },
    { pattern: /corrupt|malformed/i, code: 'DATA_CORRUPTION' },
    { pattern: /memory|heap|OOM/i, code: 'SYSTEM_MEMORY_PRESSURE' },
  ];

  // Persistence
  private errorLogPath: string;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.errorLogPath = path.join(app.getPath('userData'), 'errors.json');
    this.loadErrorHistory();
    this.registerDefaultHandlers();
  }

  // -------------------------------------------------------------------------
  // ERROR CLASSIFICATION
  // -------------------------------------------------------------------------

  /**
   * Classify an error
   */
  classify(
    error: Error | string,
    context: Partial<ErrorContext> = {}
  ): ClassifiedError {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Find matching code
    let code: ErrorCodeKey = 'INTERNAL_UNKNOWN';
    for (const { pattern, code: matchCode } of this.patterns) {
      if (pattern.test(errorMessage)) {
        code = matchCode;
        break;
      }
    }

    const definition = ErrorCode[code];
    
    const classified: ClassifiedError = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      code,
      message: errorMessage,
      category: definition.category,
      severity: definition.severity,
      recoverable: definition.recoverable,
      suggestedStrategy: this.suggestStrategy(code, definition.recoverable),
      timestamp: Date.now(),
      context: {
        source: context.source ?? 'unknown',
        operation: context.operation,
        input: context.input,
        state: context.state,
        stack: errorStack ?? context.stack,
        attempts: context.attempts ?? 1,
      },
      original: error instanceof Error ? error : undefined,
    };

    return classified;
  }

  /**
   * Report and handle an error
   */
  async report(
    error: Error | string,
    context: Partial<ErrorContext> = {}
  ): Promise<ClassifiedError> {
    const classified = this.classify(error, context);
    
    // Log the error
    this.logError(classified);
    
    // Add to history
    this.errors.push(classified);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Emit event
    this.emit('error', classified);

    // Persist
    this.saveErrorHistory();

    return classified;
  }

  /**
   * Report and attempt recovery
   */
  async reportAndRecover(
    error: Error | string,
    context: Partial<ErrorContext> = {}
  ): Promise<{ error: ClassifiedError; recovery: RecoveryResult }> {
    const classified = await this.report(error, context);
    const recovery = await this.recover(classified);
    return { error: classified, recovery };
  }

  // -------------------------------------------------------------------------
  // RECOVERY
  // -------------------------------------------------------------------------

  /**
   * Attempt recovery for an error
   */
  async recover(error: ClassifiedError): Promise<RecoveryResult> {
    if (!error.recoverable) {
      return {
        success: false,
        strategy: 'abort',
        message: 'Error is not recoverable',
      };
    }

    // Check for custom handler
    const handler = this.recoveryHandlers.get(error.code);
    if (handler) {
      try {
        const result = await handler(error);
        this.emit('recoveryAttempted', { error, result });
        return result;
      } catch (e) {
        log.error('[ErrorClassifier] Recovery handler failed:', e);
      }
    }

    // Default recovery based on strategy
    return this.executeDefaultRecovery(error);
  }

  /**
   * Register a custom recovery handler
   */
  registerRecoveryHandler(
    code: string,
    handler: (error: ClassifiedError) => Promise<RecoveryResult>
  ): void {
    this.recoveryHandlers.set(code, handler);
    log.info(`[ErrorClassifier] Registered recovery handler: ${code}`);
  }

  private async executeDefaultRecovery(error: ClassifiedError): Promise<RecoveryResult> {
    const strategy = error.suggestedStrategy;
    
    switch (strategy) {
      case 'retry':
        return {
          success: error.context.attempts! < 3,
          strategy,
          message: 'Retry suggested',
          resumed: false,
        };

      case 'rollback':
        const rolled = await this.rollback(error.context.operation);
        return {
          success: rolled,
          strategy,
          message: rolled ? 'Rollback completed' : 'Rollback failed',
        };

      case 'skip':
        return {
          success: true,
          strategy,
          message: 'Skipped and continuing',
          resumed: true,
        };

      case 'notify':
        this.emit('userNotification', {
          title: 'Error Occurred',
          message: error.message,
          severity: error.severity,
        });
        return {
          success: true,
          strategy,
          message: 'User notified',
        };

      case 'ignore':
        return {
          success: true,
          strategy,
          message: 'Error ignored',
        };

      default:
        return {
          success: false,
          strategy: 'abort',
          message: 'No recovery available',
        };
    }
  }

  private suggestStrategy(code: ErrorCodeKey, recoverable: boolean): RecoveryStrategy {
    if (!recoverable) return 'notify';
    
    // Suggest based on error code
    switch (code) {
      case 'NETWORK_OFFLINE':
      case 'NETWORK_TIMEOUT':
      case 'NETWORK_CONNECTION_REFUSED':
        return 'retry';
      
      case 'DATA_CORRUPTION':
      case 'DATA_SAVE_FAILED':
        return 'rollback';
      
      case 'OPERATION_TIMEOUT':
      case 'OPERATION_FAILED':
        return 'retry';
      
      case 'SYSTEM_MEMORY_PRESSURE':
        return 'skip';
      
      case 'USER_INPUT_INVALID':
        return 'notify';
      
      default:
        return 'notify';
    }
  }

  // -------------------------------------------------------------------------
  // ROLLBACK MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Register a rollback operation
   */
  registerRollback(operationId: string, rollback: Omit<RollbackOperation, 'createdAt'>): void {
    if (!this.rollbackStack.has(operationId)) {
      this.rollbackStack.set(operationId, []);
    }
    
    this.rollbackStack.get(operationId)!.push({
      ...rollback,
      createdAt: Date.now(),
    });
    
    log.debug(`[ErrorClassifier] Registered rollback for ${operationId}: ${rollback.description}`);
  }

  /**
   * Execute rollback for an operation
   */
  async rollback(operationId?: string): Promise<boolean> {
    if (!operationId) return false;
    
    const rollbacks = this.rollbackStack.get(operationId);
    if (!rollbacks || rollbacks.length === 0) {
      log.warn(`[ErrorClassifier] No rollbacks registered for: ${operationId}`);
      return false;
    }

    log.info(`[ErrorClassifier] Rolling back operation: ${operationId}`);
    
    // Execute in reverse order
    const toExecute = [...rollbacks].reverse();
    let allSuccess = true;
    
    for (const rb of toExecute) {
      try {
        log.info(`[ErrorClassifier] Executing rollback: ${rb.description}`);
        await rb.execute();
      } catch (error) {
        log.error(`[ErrorClassifier] Rollback failed: ${rb.description}`, error);
        allSuccess = false;
      }
    }

    // Clear rollback stack for this operation
    this.rollbackStack.delete(operationId);
    
    this.emit('rollbackCompleted', { operationId, success: allSuccess });
    return allSuccess;
  }

  /**
   * Clear rollback stack (commit changes)
   */
  commitOperation(operationId: string): void {
    this.rollbackStack.delete(operationId);
    log.debug(`[ErrorClassifier] Committed operation: ${operationId}`);
  }

  // -------------------------------------------------------------------------
  // ERROR HISTORY
  // -------------------------------------------------------------------------

  /**
   * Get recent errors
   */
  getErrors(options?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: number;
    limit?: number;
  }): ClassifiedError[] {
    let filtered = [...this.errors];
    
    if (options?.category) {
      filtered = filtered.filter(e => e.category === options.category);
    }
    if (options?.severity) {
      filtered = filtered.filter(e => e.severity === options.severity);
    }
    if (options?.since) {
      const since = options.since;
      filtered = filtered.filter(e => e.timestamp >= since);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errors = [];
    this.saveErrorHistory();
    log.info('[ErrorClassifier] Error history cleared');
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  getStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recentCount: number;
  } {
    const byCategory: Record<ErrorCategory, number> = {
      system: 0, network: 0, data: 0, operation: 0, user: 0, internal: 0
    };
    const bySeverity: Record<ErrorSeverity, number> = {
      debug: 0, info: 0, warning: 0, error: 0, critical: 0, fatal: 0
    };
    
    const hourAgo = Date.now() - 3600000;
    let recentCount = 0;
    
    for (const error of this.errors) {
      byCategory[error.category]++;
      bySeverity[error.severity]++;
      if (error.timestamp >= hourAgo) recentCount++;
    }
    
    return {
      total: this.errors.length,
      byCategory,
      bySeverity,
      recentCount,
    };
  }

  // -------------------------------------------------------------------------
  // LOGGING & PERSISTENCE
  // -------------------------------------------------------------------------

  private logError(error: ClassifiedError): void {
    const logFn = {
      debug: log.debug,
      info: log.info,
      warning: log.warn,
      error: log.error,
      critical: log.error,
      fatal: log.error,
    }[error.severity];
    
    logFn(`[Error:${error.code}] ${error.message}`, {
      id: error.id,
      category: error.category,
      source: error.context.source,
      operation: error.context.operation,
    });
  }

  private loadErrorHistory(): void {
    try {
      fsPromises.readFile(this.errorLogPath, 'utf-8').then(data => {
        const parsed = JSON.parse(data);
        const dayAgo = Date.now() - 86400000;
        this.errors = (parsed.errors ?? []).filter(
          (e: ClassifiedError) => e.timestamp >= dayAgo
        );
      }).catch(() => { /* file doesn't exist yet */ });
    } catch (e) {
      log.warn('[ErrorClassifier] Failed to load error history:', e);
      this.errors = [];
    }
  }

  private saveErrorHistory(): void {
    try {
      fsPromises.writeFile(
        this.errorLogPath,
        JSON.stringify({ errors: this.errors }, null, 2)
      ).catch(e => {
        log.warn('[ErrorClassifier] Failed to save error history:', e);
      });
    } catch (e) {
      log.warn('[ErrorClassifier] Failed to save error history:', e);
    }
  }

  // -------------------------------------------------------------------------
  // DEFAULT HANDLERS
  // -------------------------------------------------------------------------

  private registerDefaultHandlers(): void {
    // Memory pressure handler
    this.registerRecoveryHandler('SYSTEM_MEMORY_PRESSURE', async (error) => {
      log.info('[ErrorClassifier] Handling memory pressure');
      
      // Try to free memory
      if (global.gc) {
        global.gc();
      }
      
      return {
        success: true,
        strategy: 'skip',
        message: 'Triggered garbage collection',
      };
    });

    // Network offline handler
    this.registerRecoveryHandler('NETWORK_OFFLINE', async (error) => {
      // Check if we're back online
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      
      return {
        success: online,
        strategy: 'retry',
        message: online ? 'Network restored' : 'Still offline',
      };
    });

    // Data corruption handler
    this.registerRecoveryHandler('DATA_CORRUPTION', async (error) => {
      log.info('[ErrorClassifier] Handling data corruption');
      
      return {
        success: false,
        strategy: 'rollback',
        message: 'Data corruption detected, rollback suggested',
      };
    });
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const errorClassifier = new ErrorClassifierClass();
export default errorClassifier;
