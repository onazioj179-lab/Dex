// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Error Recovery System
// Phase 15: Deep Internal Micro-Optimization
// Boundary checks, state consistency, and automatic recovery
// ===========================================================================

import log from 'electron-log';
import { app, dialog, BrowserWindow } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DexError {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, any>;
  stack?: string;
  recoverable: boolean;
  recovered?: boolean;
  recoveryAttempts?: number;
}

export interface RecoveryAction {
  code: string;
  description: string;
  execute: () => Promise<boolean>;
}

type ErrorHandler = (error: DexError) => Promise<boolean>;
type RecoveryStrategy = (error: DexError) => Promise<RecoveryAction | null>;

// ===========================================================================
// ERROR CODES
// ===========================================================================

export const ErrorCodes = {
  // System errors
  SYSTEM_MEMORY_PRESSURE: 'SYSTEM_MEMORY_PRESSURE',
  SYSTEM_DISK_FULL: 'SYSTEM_DISK_FULL',
  SYSTEM_PERMISSION_DENIED: 'SYSTEM_PERMISSION_DENIED',

  // Data errors
  DATA_CORRUPTION: 'DATA_CORRUPTION',
  DATA_LOAD_FAILED: 'DATA_LOAD_FAILED',
  DATA_SAVE_FAILED: 'DATA_SAVE_FAILED',
  DATA_VALIDATION_FAILED: 'DATA_VALIDATION_FAILED',

  // Operation errors
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  OPERATION_FAILED: 'OPERATION_FAILED',

  // IPC errors
  IPC_TIMEOUT: 'IPC_TIMEOUT',
  IPC_FAILED: 'IPC_FAILED',

  // Renderer errors
  RENDERER_CRASH: 'RENDERER_CRASH',
  RENDERER_UNRESPONSIVE: 'RENDERER_UNRESPONSIVE',

  // Python errors
  PYTHON_EXECUTION_FAILED: 'PYTHON_EXECUTION_FAILED',
  PYTHON_TIMEOUT: 'PYTHON_TIMEOUT',

  // Unknown
  UNKNOWN: 'UNKNOWN',
} as const;

// ===========================================================================
// ERROR RECOVERY SYSTEM
// ===========================================================================

class ErrorRecoverySystemClass {
  private errors: DexError[] = [];
  private handlers: Map<string, ErrorHandler[]> = new Map();
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private maxErrors = 100;
  private maxRecoveryAttempts = 3;
  private recoveryInProgress = false;

  constructor() {
    this.registerDefaultStrategies();
    this.setupGlobalHandlers();
  }

  // Register an error handler for a specific code
  registerHandler(code: string, handler: ErrorHandler): void {
    if (!this.handlers.has(code)) {
      this.handlers.set(code, []);
    }
    this.handlers.get(code)!.push(handler);
  }

  // Register a recovery strategy for a specific code
  registerRecoveryStrategy(code: string, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(code, strategy);
  }

  // Report an error
  async report(
    code: string,
    message: string,
    options?: {
      severity?: ErrorSeverity;
      context?: Record<string, any>;
      stack?: string;
      recoverable?: boolean;
    }
  ): Promise<DexError> {
    const error: DexError = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      code,
      message,
      severity: options?.severity ?? this.inferSeverity(code),
      timestamp: Date.now(),
      context: options?.context,
      stack: options?.stack ?? new Error().stack,
      recoverable: options?.recoverable ?? true,
      recoveryAttempts: 0,
    };

    // Add to error list
    this.errors.push(error);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log the error
    this.logError(error);

    // Run handlers
    const handlers = [
      ...(this.handlers.get(code) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(error);
        if (handled) break;
      } catch (e) {
        log.error('[ErrorRecovery] Handler failed:', e);
      }
    }

    // Attempt recovery if recoverable
    if (error.recoverable && !error.recovered) {
      await this.attemptRecovery(error);
    }

    // Notify renderer of critical errors
    if (error.severity === 'critical') {
      this.notifyRenderer(error);
    }

    return error;
  }

  // Attempt to recover from an error
  async attemptRecovery(error: DexError): Promise<boolean> {
    if (this.recoveryInProgress) {
      log.debug('[ErrorRecovery] Recovery already in progress, skipping');
      return false;
    }

    if ((error.recoveryAttempts ?? 0) >= this.maxRecoveryAttempts) {
      log.warn(`[ErrorRecovery] Max recovery attempts reached for ${error.code}`);
      return false;
    }

    this.recoveryInProgress = true;
    error.recoveryAttempts = (error.recoveryAttempts ?? 0) + 1;

    try {
      const strategy = this.recoveryStrategies.get(error.code);
      if (!strategy) {
        log.debug(`[ErrorRecovery] No recovery strategy for ${error.code}`);
        return false;
      }

      const action = await strategy(error);
      if (!action) {
        log.debug(`[ErrorRecovery] Strategy returned no action for ${error.code}`);
        return false;
      }

      log.info(`[ErrorRecovery] Attempting: ${action.description}`);
      const success = await action.execute();

      if (success) {
        error.recovered = true;
        log.info(`[ErrorRecovery] Successfully recovered from ${error.code}`);
      } else {
        log.warn(`[ErrorRecovery] Recovery failed for ${error.code}`);
      }

      return success;
    } catch (e) {
      log.error('[ErrorRecovery] Recovery attempt failed:', e);
      return false;
    } finally {
      this.recoveryInProgress = false;
    }
  }

  // Get recent errors
  getErrors(options?: {
    severity?: ErrorSeverity;
    since?: number;
    limit?: number;
  }): DexError[] {
    let errors = [...this.errors];

    if (options?.severity) {
      errors = errors.filter(e => e.severity === options.severity);
    }

    if (options?.since !== undefined) {
      const since = options.since;
      errors = errors.filter(e => e.timestamp >= since);
    }

    errors.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      errors = errors.slice(0, options.limit);
    }

    return errors;
  }

  // Clear resolved errors
  clearResolved(): number {
    const before = this.errors.length;
    this.errors = this.errors.filter(e => !e.recovered);
    return before - this.errors.length;
  }

  // Check system health based on recent errors
  checkHealth(): {
    healthy: boolean;
    recentErrorCount: number;
    criticalCount: number;
    unresolvedCount: number;
  } {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentErrors = this.errors.filter(e => e.timestamp >= fiveMinutesAgo);
    const criticalErrors = recentErrors.filter(e => e.severity === 'critical');
    const unresolvedErrors = this.errors.filter(e => !e.recovered);

    return {
      healthy: criticalErrors.length === 0 && unresolvedErrors.length < 5,
      recentErrorCount: recentErrors.length,
      criticalCount: criticalErrors.length,
      unresolvedCount: unresolvedErrors.length,
    };
  }

  private registerDefaultStrategies(): void {
    // Memory pressure recovery
    this.registerRecoveryStrategy(ErrorCodes.SYSTEM_MEMORY_PRESSURE, async () => ({
      code: 'CLEAR_CACHES',
      description: 'Clearing caches to free memory',
      execute: async () => {
        const { memoryManager } = await import('./MemoryManager');
        memoryManager.pruneAll();
        memoryManager.forceGC();
        return true;
      },
    }));

    // Data corruption recovery
    this.registerRecoveryStrategy(ErrorCodes.DATA_CORRUPTION, async (error) => ({
      code: 'RESTORE_BACKUP',
      description: 'Attempting to restore from backup',
      execute: async () => {
        // Log and notify - actual backup restoration requires user consent
        log.warn('[ErrorRecovery] Data corruption detected, backup restoration recommended');
        return false; // Manual intervention required
      },
    }));

    // Renderer crash recovery
    this.registerRecoveryStrategy(ErrorCodes.RENDERER_CRASH, async () => ({
      code: 'RELOAD_RENDERER',
      description: 'Reloading renderer process',
      execute: async () => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.reload();
          return true;
        }
        return false;
      },
    }));

    // Operation timeout recovery
    this.registerRecoveryStrategy(ErrorCodes.OPERATION_TIMEOUT, async (error) => ({
      code: 'CANCEL_OPERATION',
      description: 'Cancelling timed out operation',
      execute: async () => {
        // The operation should already be cancelled by timeout
        return true;
      },
    }));

    // Python execution failure recovery
    this.registerRecoveryStrategy(ErrorCodes.PYTHON_EXECUTION_FAILED, async () => ({
      code: 'KILL_PYTHON',
      description: 'Terminating Python processes',
      execute: async () => {
        const { pythonExecutor } = await import('./PythonExecutor');
        pythonExecutor.killAll();
        return true;
      },
    }));
  }

  private setupGlobalHandlers(): void {
    // Catch unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      this.report(ErrorCodes.UNKNOWN, `Unhandled rejection: ${reason?.message ?? reason}`, {
        severity: 'high',
        stack: reason?.stack,
        recoverable: false,
      });
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.report(ErrorCodes.UNKNOWN, `Uncaught exception: ${error.message}`, {
        severity: 'critical',
        stack: error.stack,
        recoverable: false,
      });
    });

    // Monitor renderer process
    app.on('render-process-gone', (event, webContents, details) => {
      this.report(ErrorCodes.RENDERER_CRASH, `Renderer process gone: ${details.reason}`, {
        severity: 'critical',
        context: { reason: details.reason, exitCode: details.exitCode },
        recoverable: true,
      });
    });

    // Monitor renderer unresponsiveness
    app.on('browser-window-created', (event, window) => {
      window.webContents.on('unresponsive', () => {
        this.report(ErrorCodes.RENDERER_UNRESPONSIVE, 'Renderer became unresponsive', {
          severity: 'high',
          recoverable: true,
        });
      });
    });
  }

  private inferSeverity(code: string): ErrorSeverity {
    if (code.includes('CRITICAL') || code === ErrorCodes.RENDERER_CRASH || code === ErrorCodes.DATA_CORRUPTION) {
      return 'critical';
    }
    if (code.includes('FAILED') || code === ErrorCodes.RENDERER_UNRESPONSIVE) {
      return 'high';
    }
    if (code.includes('TIMEOUT') || code.includes('CANCELLED')) {
      return 'medium';
    }
    return 'low';
  }

  private logError(error: DexError): void {
    const logFn = error.severity === 'critical' || error.severity === 'high' 
      ? log.error 
      : error.severity === 'medium' 
        ? log.warn 
        : log.info;

    logFn(`[Error:${error.code}] ${error.message}`, {
      severity: error.severity,
      context: error.context,
    });
  }

  private notifyRenderer(error: DexError): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('error:critical', {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
      });
    }
  }
}

// Singleton export
export const errorRecovery = new ErrorRecoverySystemClass();

// ===========================================================================
// VALIDATION UTILITIES
// ===========================================================================

export function validateNotNull<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Validation failed: ${name} is null or undefined`);
  }
  return value;
}

export function validateString(value: any, name: string, options?: {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}): string {
  if (typeof value !== 'string') {
    throw new Error(`Validation failed: ${name} must be a string`);
  }
  if (options?.minLength && value.length < options.minLength) {
    throw new Error(`Validation failed: ${name} must be at least ${options.minLength} characters`);
  }
  if (options?.maxLength && value.length > options.maxLength) {
    throw new Error(`Validation failed: ${name} must be at most ${options.maxLength} characters`);
  }
  if (options?.pattern && !options.pattern.test(value)) {
    throw new Error(`Validation failed: ${name} does not match required pattern`);
  }
  return value;
}

export function validateNumber(value: any, name: string, options?: {
  min?: number;
  max?: number;
  integer?: boolean;
}): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Validation failed: ${name} must be a number`);
  }
  if (options?.min !== undefined && value < options.min) {
    throw new Error(`Validation failed: ${name} must be at least ${options.min}`);
  }
  if (options?.max !== undefined && value > options.max) {
    throw new Error(`Validation failed: ${name} must be at most ${options.max}`);
  }
  if (options?.integer && !Number.isInteger(value)) {
    throw new Error(`Validation failed: ${name} must be an integer`);
  }
  return value;
}

export function validateArray<T>(value: any, name: string, options?: {
  minLength?: number;
  maxLength?: number;
  validator?: (item: any, index: number) => T;
}): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Validation failed: ${name} must be an array`);
  }
  if (options?.minLength && value.length < options.minLength) {
    throw new Error(`Validation failed: ${name} must have at least ${options.minLength} items`);
  }
  if (options?.maxLength && value.length > options.maxLength) {
    throw new Error(`Validation failed: ${name} must have at most ${options.maxLength} items`);
  }
  if (options?.validator) {
    return value.map((item, index) => options.validator!(item, index));
  }
  return value;
}

// ===========================================================================
// SAFE EXECUTION WRAPPER
// ===========================================================================

export async function safeExecute<T>(
  operation: () => Promise<T>,
  options: {
    errorCode?: string;
    fallback?: T;
    rethrow?: boolean;
    context?: Record<string, any>;
  } = {}
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error: any) {
    await errorRecovery.report(
      options.errorCode ?? ErrorCodes.OPERATION_FAILED,
      error.message,
      {
        stack: error.stack,
        context: options.context,
      }
    );

    if (options.rethrow) {
      throw error;
    }

    return options.fallback;
  }
}

export function safeExecuteSync<T>(
  operation: () => T,
  options: {
    errorCode?: string;
    fallback?: T;
    rethrow?: boolean;
    context?: Record<string, any>;
  } = {}
): T | undefined {
  try {
    return operation();
  } catch (error: any) {
    errorRecovery.report(
      options.errorCode ?? ErrorCodes.OPERATION_FAILED,
      error.message,
      {
        stack: error.stack,
        context: options.context,
      }
    );

    if (options.rethrow) {
      throw error;
    }

    return options.fallback;
  }
}
