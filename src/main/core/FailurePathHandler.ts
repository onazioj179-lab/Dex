// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Failure Path Finalization
// Phase 69: Graceful Failures
// Every error has a clear message, recovery path, and never crashes
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type RecoveryStrategy = 'retry' | 'fallback' | 'ignore' | 'restart' | 'report' | 'manual';

export interface ErrorDefinition {
  code: string;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  recoveryStrategies: RecoveryStrategy[];
  autoRecover: boolean;
  retryCount: number;
  retryDelay: number;
  fallback?: string;
}

export interface FailureContext {
  operation: string;
  component: string;
  input?: unknown;
  timestamp: number;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export interface FailureRecord {
  id: string;
  code: string;
  severity: ErrorSeverity;
  context: FailureContext;
  message: string;
  userMessage: string;
  recovered: boolean;
  recoveryStrategy?: RecoveryStrategy;
  timestamp: number;
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  message?: string;
  result?: unknown;
}

// ===========================================================================
// ERROR DEFINITIONS - COMPREHENSIVE CATALOG
// ===========================================================================

const ERROR_CATALOG: ErrorDefinition[] = [
  // -- File System Errors --------------------------------------------------
  {
    code: 'FS_NOT_FOUND',
    severity: 'warning',
    message: 'File or directory not found',
    userMessage: 'The file or folder could not be found. It may have been moved or deleted.',
    recoveryStrategies: ['ignore', 'manual'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'FS_PERMISSION_DENIED',
    severity: 'error',
    message: 'Permission denied accessing file',
    userMessage: 'You don\'t have permission to access this file. Try running as administrator.',
    recoveryStrategies: ['manual', 'ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'FS_DISK_FULL',
    severity: 'critical',
    message: 'Disk space exhausted',
    userMessage: 'Your disk is full. Please free up some space and try again.',
    recoveryStrategies: ['manual'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'FS_FILE_IN_USE',
    severity: 'warning',
    message: 'File is in use by another process',
    userMessage: 'This file is being used by another program. Close it and try again.',
    recoveryStrategies: ['retry', 'ignore'],
    autoRecover: true,
    retryCount: 3,
    retryDelay: 1000
  },
  {
    code: 'FS_READ_ERROR',
    severity: 'error',
    message: 'Failed to read file',
    userMessage: 'Could not read the file. It may be corrupted.',
    recoveryStrategies: ['retry', 'ignore'],
    autoRecover: true,
    retryCount: 2,
    retryDelay: 500
  },
  {
    code: 'FS_WRITE_ERROR',
    severity: 'error',
    message: 'Failed to write file',
    userMessage: 'Could not save the file. Check if you have write permissions.',
    recoveryStrategies: ['retry', 'fallback'],
    autoRecover: true,
    retryCount: 2,
    retryDelay: 500,
    fallback: 'Save to temp location'
  },

  // -- Network Errors ------------------------------------------------------
  {
    code: 'NET_OFFLINE',
    severity: 'warning',
    message: 'No internet connection',
    userMessage: 'You appear to be offline. Some features may not work.',
    recoveryStrategies: ['retry', 'ignore'],
    autoRecover: true,
    retryCount: 3,
    retryDelay: 5000
  },
  {
    code: 'NET_TIMEOUT',
    severity: 'warning',
    message: 'Request timed out',
    userMessage: 'The request took too long. Check your connection and try again.',
    recoveryStrategies: ['retry', 'ignore'],
    autoRecover: true,
    retryCount: 2,
    retryDelay: 2000
  },
  {
    code: 'NET_SERVER_ERROR',
    severity: 'error',
    message: 'Server error',
    userMessage: 'The server encountered an error. Please try again later.',
    recoveryStrategies: ['retry', 'report'],
    autoRecover: true,
    retryCount: 2,
    retryDelay: 3000
  },

  // -- Action Errors -------------------------------------------------------
  {
    code: 'ACTION_NOT_FOUND',
    severity: 'warning',
    message: 'Action not found',
    userMessage: 'This action is no longer available.',
    recoveryStrategies: ['ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'ACTION_INVALID_INPUT',
    severity: 'warning',
    message: 'Invalid action input',
    userMessage: 'The action received invalid input. Please check and try again.',
    recoveryStrategies: ['manual', 'ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'ACTION_EXECUTION_FAILED',
    severity: 'error',
    message: 'Action execution failed',
    userMessage: 'The action could not complete. It has been safely cancelled.',
    recoveryStrategies: ['retry', 'ignore'],
    autoRecover: false,
    retryCount: 1,
    retryDelay: 500
  },

  // -- Media Errors --------------------------------------------------------
  {
    code: 'MEDIA_UNSUPPORTED_FORMAT',
    severity: 'warning',
    message: 'Unsupported media format',
    userMessage: 'This file format is not supported.',
    recoveryStrategies: ['ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'MEDIA_CORRUPTED',
    severity: 'error',
    message: 'Media file is corrupted',
    userMessage: 'This file appears to be damaged and cannot be opened.',
    recoveryStrategies: ['ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'MEDIA_TOO_LARGE',
    severity: 'warning',
    message: 'Media file is too large',
    userMessage: 'This file is too large to process. Maximum size is 100MB.',
    recoveryStrategies: ['ignore'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },

  // -- System Errors -------------------------------------------------------
  {
    code: 'SYS_OUT_OF_MEMORY',
    severity: 'critical',
    message: 'Out of memory',
    userMessage: 'Dex is running low on memory. Some operations have been paused.',
    recoveryStrategies: ['restart', 'manual'],
    autoRecover: false,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'SYS_CPU_OVERLOAD',
    severity: 'warning',
    message: 'CPU overload detected',
    userMessage: 'Your system is under heavy load. Performance may be affected.',
    recoveryStrategies: ['ignore'],
    autoRecover: true,
    retryCount: 0,
    retryDelay: 0
  },
  {
    code: 'SYS_PROCESS_CRASH',
    severity: 'critical',
    message: 'Process crashed',
    userMessage: 'An unexpected error occurred. Dex is recovering...',
    recoveryStrategies: ['restart'],
    autoRecover: true,
    retryCount: 1,
    retryDelay: 1000
  },

  // -- Database/Store Errors -----------------------------------------------
  {
    code: 'DB_CONNECTION_FAILED',
    severity: 'error',
    message: 'Database connection failed',
    userMessage: 'Could not access stored data. Retrying...',
    recoveryStrategies: ['retry', 'fallback'],
    autoRecover: true,
    retryCount: 3,
    retryDelay: 1000,
    fallback: 'Use cached data'
  },
  {
    code: 'DB_CORRUPT',
    severity: 'critical',
    message: 'Database corruption detected',
    userMessage: 'Your data may be corrupted. Attempting recovery...',
    recoveryStrategies: ['fallback', 'manual'],
    autoRecover: true,
    retryCount: 0,
    retryDelay: 0,
    fallback: 'Restore from backup'
  },

  // -- Generic Errors ------------------------------------------------------
  {
    code: 'UNKNOWN',
    severity: 'error',
    message: 'Unknown error occurred',
    userMessage: 'Something went wrong. Please try again.',
    recoveryStrategies: ['retry', 'ignore', 'report'],
    autoRecover: false,
    retryCount: 1,
    retryDelay: 500
  }
];

// ===========================================================================
// FAILURE PATH HANDLER
// ===========================================================================

class FailurePathHandlerClass extends EventEmitter {
  private errorCatalog: Map<string, ErrorDefinition> = new Map();
  private failureHistory: FailureRecord[] = [];
  private recoveryHandlers: Map<string, (context: FailureContext) => Promise<RecoveryResult>> = new Map();
  private failureCounter = 0;

  constructor() {
    super();
    this.initializeErrorCatalog();
    this.setupIPC();
    this.setupGlobalHandlers();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private initializeErrorCatalog(): void {
    for (const error of ERROR_CATALOG) {
      this.errorCatalog.set(error.code, error);
    }
    log.info(`[FailurePath] Loaded ${this.errorCatalog.size} error definitions`);
  }

  private setupIPC(): void {
    // Handle failure from renderer
    ipcMain.handle('failure:handle', async (_event, code: string, context: FailureContext) => {
      return this.handleFailure(code, context);
    });

    // Get error info
    ipcMain.handle('failure:info', (_event, code: string) => {
      return this.getErrorInfo(code);
    });

    // Get failure history
    ipcMain.handle('failure:history', () => {
      return this.getHistory();
    });

    // Clear failure history
    ipcMain.handle('failure:clearHistory', () => {
      this.clearHistory();
      return { success: true };
    });

    // Manual recovery
    ipcMain.handle('failure:recover', async (_event, failureId: string, strategy: RecoveryStrategy) => {
      return this.attemptRecovery(failureId, strategy);
    });

    // Report error
    ipcMain.handle('failure:report', async (_event, failureId: string) => {
      return this.reportError(failureId);
    });
  }

  private setupGlobalHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleFailure('SYS_PROCESS_CRASH', {
        operation: 'uncaughtException',
        component: 'main',
        timestamp: Date.now(),
        stack: error.stack,
        metadata: { message: error.message }
      });
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      this.handleFailure('UNKNOWN', {
        operation: 'unhandledRejection',
        component: 'main',
        timestamp: Date.now(),
        metadata: { reason: String(reason) }
      });
    });
  }

  // -------------------------------------------------------------------------
  // FAILURE HANDLING
  // -------------------------------------------------------------------------

  async handleFailure(code: string, context: FailureContext): Promise<FailureRecord> {
    const definition = this.errorCatalog.get(code) || this.errorCatalog.get('UNKNOWN')!;
    
    const record: FailureRecord = {
      id: `fail-${Date.now()}-${++this.failureCounter}`,
      code,
      severity: definition.severity,
      context,
      message: definition.message,
      userMessage: definition.userMessage,
      recovered: false,
      timestamp: Date.now()
    };

    // Log the failure
    this.logFailure(record, definition);

    // Store in history
    this.failureHistory.push(record);
    if (this.failureHistory.length > 500) {
      this.failureHistory.shift();
    }

    // Emit event
    this.emit('failure', record);

    // Attempt auto-recovery if enabled
    if (definition.autoRecover && definition.retryCount > 0) {
      const recoveryResult = await this.autoRecover(record, definition);
      record.recovered = recoveryResult.success;
      record.recoveryStrategy = recoveryResult.strategy;
    }

    // Notify user for significant errors
    if (definition.severity === 'critical' || (definition.severity === 'error' && !record.recovered)) {
      this.notifyUser(record);
    }

    // Broadcast to renderer
    this.broadcastFailure(record);

    return record;
  }

  private logFailure(record: FailureRecord, definition: ErrorDefinition): void {
    const logFn = definition.severity === 'critical' ? log.error :
                  definition.severity === 'error' ? log.error :
                  definition.severity === 'warning' ? log.warn : log.info;

    logFn(`[FailurePath] ${record.code}: ${record.message}`, {
      component: record.context.component,
      operation: record.context.operation
    });

    if (record.context.stack) {
      log.debug(`[FailurePath] Stack:`, record.context.stack);
    }
  }

  // -------------------------------------------------------------------------
  // RECOVERY
  // -------------------------------------------------------------------------

  private async autoRecover(record: FailureRecord, definition: ErrorDefinition): Promise<RecoveryResult> {
    const primaryStrategy = definition.recoveryStrategies[0];

    switch (primaryStrategy) {
      case 'retry':
        return this.retryOperation(record, definition);
      case 'fallback':
        return this.executeFallback(record, definition);
      case 'ignore':
        return { success: true, strategy: 'ignore', message: 'Error safely ignored' };
      default:
        return { success: false, strategy: primaryStrategy };
    }
  }

  private async retryOperation(record: FailureRecord, definition: ErrorDefinition): Promise<RecoveryResult> {
    // Emit retry request for operation handlers to catch
    let attempts = 0;
    
    while (attempts < definition.retryCount) {
      await this.delay(definition.retryDelay);
      attempts++;
      
      // Emit retry event
      const retryResult = await new Promise<boolean>((resolve) => {
        this.emit('retry', record.context, (success: boolean) => resolve(success));
        // Timeout if no handler responds
        setTimeout(() => resolve(false), 5000);
      });

      if (retryResult) {
        log.info(`[FailurePath] Retry successful for ${record.code} (attempt ${attempts})`);
        return { success: true, strategy: 'retry', message: `Recovered after ${attempts} retries` };
      }
    }

    return { success: false, strategy: 'retry', message: `Failed after ${attempts} retries` };
  }

  private async executeFallback(record: FailureRecord, definition: ErrorDefinition): Promise<RecoveryResult> {
    if (!definition.fallback) {
      return { success: false, strategy: 'fallback', message: 'No fallback defined' };
    }

    // Emit fallback event for handlers
    const fallbackResult = await new Promise<boolean>((resolve) => {
      this.emit('fallback', record.context, definition.fallback, (success: boolean) => resolve(success));
      setTimeout(() => resolve(false), 5000);
    });

    return {
      success: fallbackResult,
      strategy: 'fallback',
      message: fallbackResult ? definition.fallback : 'Fallback failed'
    };
  }

  async attemptRecovery(failureId: string, strategy: RecoveryStrategy): Promise<RecoveryResult> {
    const record = this.failureHistory.find(f => f.id === failureId);
    if (!record) {
      return { success: false, strategy, message: 'Failure record not found' };
    }

    const definition = this.errorCatalog.get(record.code) || this.errorCatalog.get('UNKNOWN')!;

    switch (strategy) {
      case 'retry':
        return this.retryOperation(record, definition);
      case 'fallback':
        return this.executeFallback(record, definition);
      case 'ignore':
        record.recovered = true;
        record.recoveryStrategy = 'ignore';
        return { success: true, strategy: 'ignore' };
      case 'restart':
        app.relaunch();
        app.exit(0);
        return { success: true, strategy: 'restart' };
      default:
        return { success: false, strategy, message: 'Unknown strategy' };
    }
  }

  registerRecoveryHandler(code: string, handler: (context: FailureContext) => Promise<RecoveryResult>): void {
    this.recoveryHandlers.set(code, handler);
  }

  // -------------------------------------------------------------------------
  // USER NOTIFICATION
  // -------------------------------------------------------------------------

  private notifyUser(record: FailureRecord): void {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    const definition = this.errorCatalog.get(record.code)!;

    // For critical errors, show dialog
    if (definition.severity === 'critical') {
      dialog.showErrorBox('Error', record.userMessage);
    } else {
      // For regular errors, send to renderer for toast
      window.webContents.send('failure:notify', {
        id: record.id,
        severity: record.severity,
        message: record.userMessage,
        recoverable: definition.recoveryStrategies.length > 0
      });
    }
  }

  private broadcastFailure(record: FailureRecord): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('failure:occurred', record);
      }
    }
  }

  // -------------------------------------------------------------------------
  // REPORTING
  // -------------------------------------------------------------------------

  async reportError(failureId: string): Promise<{ success: boolean }> {
    const record = this.failureHistory.find(f => f.id === failureId);
    if (!record) {
      return { success: false };
    }

    // In production, this would send to error reporting service
    log.info(`[FailurePath] Error reported: ${record.id}`, {
      code: record.code,
      context: record.context,
      timestamp: record.timestamp
    });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // DATA ACCESS
  // -------------------------------------------------------------------------

  getErrorInfo(code: string): ErrorDefinition | null {
    return this.errorCatalog.get(code) || null;
  }

  getHistory(): FailureRecord[] {
    return [...this.failureHistory];
  }

  clearHistory(): void {
    this.failureHistory = [];
  }

  getStatistics(): { total: number; byCode: Record<string, number>; bySeverity: Record<string, number> } {
    const byCode: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const record of this.failureHistory) {
      byCode[record.code] = (byCode[record.code] || 0) + 1;
      bySeverity[record.severity] = (bySeverity[record.severity] || 0) + 1;
    }

    return {
      total: this.failureHistory.length,
      byCode,
      bySeverity
    };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap a function with automatic failure handling
   */
  wrap<T extends unknown[], R>(
    code: string,
    component: string,
    operation: string,
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.handleFailure(code, {
          operation,
          component,
          input: args,
          timestamp: Date.now(),
          stack: error instanceof Error ? error.stack : undefined,
          metadata: { errorMessage: error instanceof Error ? error.message : String(error) }
        });
        throw error;
      }
    };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const FailurePathHandler = new FailurePathHandlerClass();
export default FailurePathHandler;
