// ===========================================================================
// DEX - Stability Core
// Phase 1: Immediate Patch Cycle - Runtime and Crash Fixes
// Makes Dex boringly reliable. No crashes. No data loss. No surprises.
// ===========================================================================

import { EventEmitter } from 'events';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type StabilityEventType =
  | 'runtime-error'
  | 'unhandled-rejection'
  | 'renderer-crash'
  | 'renderer-unresponsive'
  | 'gpu-crash'
  | 'ipc-timeout'
  | 'memory-pressure'
  | 'permission-revoked'
  | 'automation-failure'
  | 'tab-lifecycle-error'
  | 'media-lifecycle-error';

export interface StabilityEvent {
  id: string;
  type: StabilityEventType;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  recovered: boolean;
  recoveryAction?: string;
}

export interface StabilityConfig {
  enabled: boolean;
  maxEventsRetained: number;
  autoRecoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  ipcTimeoutMs: number;
  rendererWatchdogIntervalMs: number;
  memoryPressureThresholdMB: number;
  notifyOnCritical: boolean;
}

export interface StabilityStats {
  totalEvents: number;
  eventsByType: Record<StabilityEventType, number>;
  recoveredEvents: number;
  failedRecoveries: number;
  uptimeMs: number;
  lastEventTime: number | null;
  currentHealth: 'excellent' | 'good' | 'degraded' | 'critical';
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: StabilityConfig = {
  enabled: true,
  maxEventsRetained: 100,
  autoRecoveryEnabled: true,
  maxRecoveryAttempts: 3,
  ipcTimeoutMs: 30000,
  rendererWatchdogIntervalMs: 5000,
  memoryPressureThresholdMB: 300,
  notifyOnCritical: true,
};

// ===========================================================================
// STABILITY CORE CLASS
// ===========================================================================

class StabilityCoreClass extends EventEmitter {
  private config: StabilityConfig;
  private events: StabilityEvent[] = [];
  private recoveryAttempts: Map<string, number> = new Map();
  private startTime: number;
  private isInitialized: boolean = false;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private windowHealthMap: Map<number, { lastPing: number; healthy: boolean }> = new Map();

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.startTime = Date.now();
    this.setMaxListeners(50);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info('[StabilityCore] Initializing Phase 1 stability systems...');

    this.setupGlobalErrorHandlers();
    this.setupIPCErrorHandlers();
    this.startRendererWatchdog();
    this.setupMemoryPressureMonitor();

    this.isInitialized = true;
    log.info('[StabilityCore] Stability systems initialized');
  }

  shutdown(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    this.removeAllListeners();
    log.info('[StabilityCore] Stability systems shut down');
  }

  // -------------------------------------------------------------------------
  // GLOBAL ERROR HANDLERS - Catch ALL runtime errors
  // -------------------------------------------------------------------------

  private setupGlobalErrorHandlers(): void {
    // Catch uncaught exceptions in main process
    process.on('uncaughtException', (error: Error) => {
      this.handleError('runtime-error', error, { source: 'uncaughtException' });
    });

    // Catch unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleError('unhandled-rejection', error, { source: 'unhandledRejection' });
    });

    // Catch renderer process crashes
    app.on('render-process-gone', (event, webContents, details) => {
      this.recordEvent({
        type: 'renderer-crash',
        severity: 'critical',
        message: `Renderer crashed: ${details.reason}`,
        context: {
          reason: details.reason,
          exitCode: details.exitCode,
          webContentsId: webContents?.id,
        },
        recovered: false,
      });
      this.attemptRendererRecovery(webContents);
    });

    // Catch GPU process crashes
    app.on('child-process-gone', (event, details) => {
      if (details.type === 'GPU') {
        this.recordEvent({
          type: 'gpu-crash',
          severity: 'high',
          message: `GPU process crashed: ${details.reason}`,
          context: { ...details },
          recovered: false,
        });
      }
    });

    log.info('[StabilityCore] Global error handlers installed');
  }

  // -------------------------------------------------------------------------
  // IPC ERROR HANDLERS - Prevent IPC-related crashes
  // -------------------------------------------------------------------------

  private setupIPCErrorHandlers(): void {
    // Wrap all IPC handlers with error boundaries
    const originalHandle = ipcMain.handle.bind(ipcMain);
    
    ipcMain.handle = (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => {
      return originalHandle(channel, async (event, ...args) => {
        try {
          return await Promise.race([
            Promise.resolve(listener(event, ...args)),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`IPC timeout: ${channel}`)), this.config.ipcTimeoutMs)
            ),
          ]);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.handleError('ipc-timeout', err, { channel, args: this.sanitizeArgs(args) });
          
          // Return a safe error response instead of crashing
          return {
            success: false,
            error: err.message,
            __stability_error: true,
          };
        }
      });
    };

    log.info('[StabilityCore] IPC error handlers installed');
  }

  // -------------------------------------------------------------------------
  // RENDERER WATCHDOG - Detect unresponsive renderers
  // -------------------------------------------------------------------------

  private startRendererWatchdog(): void {
    if (this.watchdogInterval) return;

    // Register ping handler
    ipcMain.on('stability:ping', (event) => {
      const webContentsId = event.sender.id;
      this.windowHealthMap.set(webContentsId, {
        lastPing: Date.now(),
        healthy: true,
      });
      event.returnValue = { pong: true, timestamp: Date.now() };
    });

    // Monitor for unresponsive renderers
    this.watchdogInterval = setInterval(() => {
      const now = Date.now();
      const threshold = this.config.rendererWatchdogIntervalMs * 3;

      for (const [id, health] of this.windowHealthMap) {
        if (now - health.lastPing > threshold && health.healthy) {
          health.healthy = false;
          this.recordEvent({
            type: 'renderer-unresponsive',
            severity: 'high',
            message: `Renderer ${id} unresponsive`,
            context: { webContentsId: id, lastPing: health.lastPing },
            recovered: false,
          });
        }
      }
    }, this.config.rendererWatchdogIntervalMs);

    log.info('[StabilityCore] Renderer watchdog started');
  }

  // -------------------------------------------------------------------------
  // MEMORY PRESSURE MONITOR
  // -------------------------------------------------------------------------

  private setupMemoryPressureMonitor(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / (1024 * 1024);

      if (heapUsedMB > this.config.memoryPressureThresholdMB) {
        this.recordEvent({
          type: 'memory-pressure',
          severity: heapUsedMB > this.config.memoryPressureThresholdMB * 1.5 ? 'critical' : 'high',
          message: `Memory pressure: ${Math.round(heapUsedMB)}MB heap used`,
          context: {
            heapUsedMB: Math.round(heapUsedMB),
            heapTotalMB: Math.round(memUsage.heapTotal / (1024 * 1024)),
            rssMB: Math.round(memUsage.rss / (1024 * 1024)),
          },
          recovered: false,
        });

        // Trigger garbage collection if available
        if (global.gc) {
          global.gc();
          log.info('[StabilityCore] Forced garbage collection due to memory pressure');
        }
      }
    }, 60000); // Check every minute
  }

  // -------------------------------------------------------------------------
  // ERROR HANDLING & RECOVERY
  // -------------------------------------------------------------------------

  private handleError(
    type: StabilityEventType,
    error: Error,
    context?: Record<string, unknown>
  ): void {
    const event = this.recordEvent({
      type,
      severity: this.classifyErrorSeverity(type, error),
      message: error.message,
      stack: error.stack,
      context,
      recovered: false,
    });

    log.error(`[StabilityCore] ${type}: ${error.message}`, { context, stack: error.stack });

    // Attempt automatic recovery if enabled
    if (this.config.autoRecoveryEnabled) {
      this.attemptRecovery(event);
    }
  }

  private classifyErrorSeverity(type: StabilityEventType, error: Error): StabilityEvent['severity'] {
    // Critical: App may crash or data may be lost
    if (
      type === 'renderer-crash' ||
      type === 'memory-pressure' ||
      error.message.includes('FATAL') ||
      error.message.includes('out of memory')
    ) {
      return 'critical';
    }

    // High: Feature is broken but app continues
    if (
      type === 'renderer-unresponsive' ||
      type === 'gpu-crash' ||
      type === 'automation-failure'
    ) {
      return 'high';
    }

    // Medium: Something went wrong but recoverable
    if (type === 'ipc-timeout' || type === 'permission-revoked') {
      return 'medium';
    }

    return 'low';
  }

  private async attemptRecovery(event: StabilityEvent): Promise<boolean> {
    const attempts = this.recoveryAttempts.get(event.id) || 0;
    
    if (attempts >= this.config.maxRecoveryAttempts) {
      log.warn(`[StabilityCore] Max recovery attempts reached for ${event.type}`);
      return false;
    }

    this.recoveryAttempts.set(event.id, attempts + 1);

    try {
      switch (event.type) {
        case 'renderer-crash':
        case 'renderer-unresponsive':
          await this.recoverRenderer();
          break;
        case 'memory-pressure':
          this.recoverFromMemoryPressure();
          break;
        case 'ipc-timeout':
          // IPC timeouts are already handled by returning safe error
          break;
        default:
          // No specific recovery action
          break;
      }

      event.recovered = true;
      event.recoveryAction = `Attempt ${attempts + 1} succeeded`;
      log.info(`[StabilityCore] Recovery successful for ${event.type}`);
      return true;
    } catch (recoveryError) {
      log.error(`[StabilityCore] Recovery failed for ${event.type}:`, recoveryError);
      return false;
    }
  }

  private async attemptRendererRecovery(webContents: Electron.WebContents | undefined): Promise<void> {
    if (!webContents || webContents.isDestroyed()) {
      // Reload main window if available
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow && !mainWindow.isDestroyed()) {
        log.info('[StabilityCore] Reloading main window after renderer crash');
        mainWindow.reload();
      }
      return;
    }

    try {
      webContents.reload();
      log.info('[StabilityCore] Reloaded crashed renderer');
    } catch (error) {
      log.error('[StabilityCore] Failed to reload renderer:', error);
    }
  }

  private async recoverRenderer(): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isLoading()) {
        try {
          win.webContents.reload();
        } catch (error) {
          log.warn('[StabilityCore] Window in invalid state during recovery:', error);
        }
      }
    }
  }

  private recoverFromMemoryPressure(): void {
    // Emit event for other systems to respond
    this.emit('memory-pressure', { action: 'clear-caches' });
    
    // Force GC if available
    if (global.gc) {
      global.gc();
    }
  }

  // -------------------------------------------------------------------------
  // EVENT RECORDING
  // -------------------------------------------------------------------------

  private recordEvent(
    data: Omit<StabilityEvent, 'id' | 'timestamp'>
  ): StabilityEvent {
    const event: StabilityEvent = {
      id: `se-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...data,
    };

    this.events.push(event);

    // Trim old events
    if (this.events.length > this.config.maxEventsRetained) {
      this.events = this.events.slice(-this.config.maxEventsRetained);
    }

    // Emit event for external listeners
    this.emit('stability-event', event);

    // Notify on critical events
    if (data.severity === 'critical' && this.config.notifyOnCritical) {
      this.notifyCriticalEvent(event);
    }

    return event;
  }

  private notifyCriticalEvent(event: StabilityEvent): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stability:critical-event', {
        type: event.type,
        message: event.message,
        timestamp: event.timestamp,
      });
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  /**
   * Record a tab lifecycle error (attach/detach crashes)
   */
  recordTabLifecycleError(error: Error, context?: Record<string, unknown>): void {
    this.handleError('tab-lifecycle-error', error, context);
  }

  /**
   * Record a media lifecycle error
   */
  recordMediaLifecycleError(error: Error, context?: Record<string, unknown>): void {
    this.handleError('media-lifecycle-error', error, context);
  }

  /**
   * Record an automation failure with hard stop
   */
  recordAutomationFailure(error: Error, automationId: string): void {
    this.handleError('automation-failure', error, { automationId, hardStop: true });
    this.emit('automation-hard-stop', { automationId, reason: error.message });
  }

  /**
   * Record a permission revocation
   */
  recordPermissionRevoked(permission: string, context?: Record<string, unknown>): void {
    this.recordEvent({
      type: 'permission-revoked',
      severity: 'medium',
      message: `Permission revoked: ${permission}`,
      context: { permission, ...context },
      recovered: false,
    });
    this.emit('permission-revoked', { permission });
  }

  /**
   * Get current stability statistics
   */
  getStats(): StabilityStats {
    const eventsByType: Record<string, number> = {};
    let recoveredEvents = 0;
    let failedRecoveries = 0;

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      if (event.recovered) {
        recoveredEvents++;
      } else if (event.severity === 'critical' || event.severity === 'high') {
        failedRecoveries++;
      }
    }

    const recentCritical = this.events.filter(
      e => e.severity === 'critical' && Date.now() - e.timestamp < 3600000
    ).length;

    let currentHealth: StabilityStats['currentHealth'] = 'excellent';
    if (recentCritical > 0) currentHealth = 'critical';
    else if (failedRecoveries > 5) currentHealth = 'degraded';
    else if (failedRecoveries > 0) currentHealth = 'good';

    return {
      totalEvents: this.events.length,
      eventsByType: eventsByType as Record<StabilityEventType, number>,
      recoveredEvents,
      failedRecoveries,
      uptimeMs: Date.now() - this.startTime,
      lastEventTime: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : null,
      currentHealth,
    };
  }

  /**
   * Get recent stability events
   */
  getRecentEvents(count: number = 20): StabilityEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Check if system is stable enough for operations
   */
  isStable(): boolean {
    const stats = this.getStats();
    return stats.currentHealth !== 'critical';
  }

  /**
   * Safe wrapper for async operations - prevents crashes from propagating
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError('runtime-error', err, { context, hasFallback: fallback !== undefined });
      return fallback;
    }
  }

  /**
   * Safe wrapper for sync operations
   */
  safeExecuteSync<T>(
    operation: () => T,
    context: string,
    fallback?: T
  ): T | undefined {
    try {
      return operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError('runtime-error', err, { context, hasFallback: fallback !== undefined });
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private sanitizeArgs(args: unknown[]): unknown[] {
    // Remove sensitive data from logged arguments
    return args.map(arg => {
      if (typeof arg === 'string' && arg.length > 100) {
        return arg.slice(0, 100) + '...';
      }
      if (typeof arg === 'object' && arg !== null) {
        const keys = Object.keys(arg);
        if (keys.some(k => k.toLowerCase().includes('password') || k.toLowerCase().includes('secret'))) {
          return '[REDACTED]';
        }
      }
      return arg;
    });
  }
}

// Singleton instance
export const stabilityCore = new StabilityCoreClass();

// ===========================================================================
// IPC HANDLERS
// ===========================================================================

export function registerStabilityHandlers(): void {
  ipcMain.handle('stability:getStats', () => stabilityCore.getStats());
  ipcMain.handle('stability:getRecentEvents', (_, count?: number) => stabilityCore.getRecentEvents(count));
  ipcMain.handle('stability:isStable', () => stabilityCore.isStable());
}
