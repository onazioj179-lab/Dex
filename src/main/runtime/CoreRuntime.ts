// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Core Runtime Layer
// Phase 28: Backend Architecture Refinement
// App lifecycle, global state, session manager, shutdown/restart handling
// ===========================================================================

import { app, BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type AppState = 
  | 'initializing' 
  | 'ready' 
  | 'running' 
  | 'suspending' 
  | 'suspended'
  | 'resuming'
  | 'shutting-down' 
  | 'restarting';

export type ShutdownReason = 
  | 'user-request' 
  | 'system-shutdown' 
  | 'update'
  | 'error-recovery'
  | 'memory-pressure';

export interface RuntimeConfig {
  gracefulShutdownTimeoutMs: number;
  maxRestartAttempts: number;
  restartDelayMs: number;
  healthCheckIntervalMs: number;
}

export interface SessionInfo {
  id: string;
  startedAt: number;
  lastActivityAt: number;
  state: AppState;
  restartCount: number;
}

export interface ShutdownHook {
  name: string;
  priority: number; // Higher = runs first
  execute: () => Promise<void>;
  timeout?: number;
}

export interface StartupHook {
  name: string;
  priority: number; // Higher = runs first
  execute: () => Promise<void>;
  required: boolean;
}

// ===========================================================================
// CORE RUNTIME CLASS
// ===========================================================================

class CoreRuntimeClass extends EventEmitter {
  private state: AppState = 'initializing';
  private session: SessionInfo;
  private config: RuntimeConfig;
  private shutdownHooks: ShutdownHook[] = [];
  private startupHooks: StartupHook[] = [];
  private isShuttingDown = false;
  private restartRequested = false;
  private mainWindow: BrowserWindow | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Subsystem references (set during initialization)
  private subsystems: Map<string, { stop: () => Promise<void> }> = new Map();

  constructor() {
    super();
    this.config = {
      gracefulShutdownTimeoutMs: 10000,
      maxRestartAttempts: 3,
      restartDelayMs: 1000,
      healthCheckIntervalMs: 30000,
    };

    this.session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      state: 'initializing',
      restartCount: 0,
    };

    this.setupProcessHandlers();
    log.info(`[CoreRuntime] Session started: ${this.session.id}`);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  /**
   * Initialize the runtime - call this before app.whenReady()
   */
  async initialize(): Promise<void> {
    log.info('[CoreRuntime] Initializing...');
    
    // Setup IPC handlers
    this.setupIPC();

    // Run startup hooks in priority order
    const sortedHooks = [...this.startupHooks].sort((a, b) => b.priority - a.priority);
    
    for (const hook of sortedHooks) {
      try {
        log.info(`[CoreRuntime] Running startup hook: ${hook.name}`);
        await Promise.race([
          hook.execute(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Startup hook timeout')), 30000)
          ),
        ]);
      } catch (error) {
        log.error(`[CoreRuntime] Startup hook failed: ${hook.name}`, error);
        if (hook.required) {
          throw new Error(`Required startup hook failed: ${hook.name}`);
        }
      }
    }

    this.setState('ready');
    log.info('[CoreRuntime] Initialization complete');
  }

  /**
   * Start the runtime after window is created
   */
  start(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.setState('running');
    
    // Start health monitoring
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    log.info('[CoreRuntime] Runtime started');
  }

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  getState(): AppState {
    return this.state;
  }

  getSession(): Readonly<SessionInfo> {
    return { ...this.session };
  }

  private setState(newState: AppState): void {
    const oldState = this.state;
    this.state = newState;
    this.session.state = newState;
    this.session.lastActivityAt = Date.now();
    
    log.info(`[CoreRuntime] State: ${oldState} ${newState}`);
    this.emit('stateChange', { oldState, newState });
    
    // Notify renderer
    this.mainWindow?.webContents.send('runtime:stateChange', { oldState, newState });
  }

  recordActivity(): void {
    this.session.lastActivityAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // SUBSYSTEM REGISTRATION
  // -------------------------------------------------------------------------

  /**
   * Register a subsystem for coordinated shutdown
   */
  registerSubsystem(name: string, subsystem: { stop: () => Promise<void> }): void {
    this.subsystems.set(name, subsystem);
    log.info(`[CoreRuntime] Registered subsystem: ${name}`);
  }

  /**
   * Register a startup hook
   */
  registerStartupHook(hook: StartupHook): void {
    this.startupHooks.push(hook);
  }

  /**
   * Register a shutdown hook
   */
  registerShutdownHook(hook: ShutdownHook): void {
    this.shutdownHooks.push(hook);
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN & RESTART
  // -------------------------------------------------------------------------

  /**
   * Request graceful shutdown
   */
  async shutdown(reason: ShutdownReason = 'user-request'): Promise<void> {
    if (this.isShuttingDown) {
      log.warn('[CoreRuntime] Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.setState('shutting-down');
    log.info(`[CoreRuntime] Shutdown requested: ${reason}`);

    const shutdownStart = Date.now();
    const timeout = this.config.gracefulShutdownTimeoutMs;

    try {
      // Run shutdown hooks in priority order
      const sortedHooks = [...this.shutdownHooks].sort((a, b) => b.priority - a.priority);
      
      for (const hook of sortedHooks) {
        const hookTimeout = hook.timeout ?? 5000;
        const remainingTime = timeout - (Date.now() - shutdownStart);
        
        if (remainingTime <= 0) {
          log.warn('[CoreRuntime] Shutdown timeout, forcing exit');
          break;
        }

        try {
          log.info(`[CoreRuntime] Running shutdown hook: ${hook.name}`);
          await Promise.race([
            hook.execute(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Hook timeout')), Math.min(hookTimeout, remainingTime))
            ),
          ]);
        } catch (error) {
          log.error(`[CoreRuntime] Shutdown hook failed: ${hook.name}`, error);
        }
      }

      // Stop all subsystems
      for (const [name, subsystem] of this.subsystems) {
        try {
          log.info(`[CoreRuntime] Stopping subsystem: ${name}`);
          await Promise.race([
            subsystem.stop(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Subsystem stop timeout')), 3000)
            ),
          ]);
        } catch (error) {
          log.error(`[CoreRuntime] Failed to stop subsystem: ${name}`, error);
        }
      }

      // Stop health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      log.info(`[CoreRuntime] Shutdown complete (${Date.now() - shutdownStart}ms)`);
      
      if (this.restartRequested) {
        this.performRestart();
      } else {
        app.quit();
      }

    } catch (error) {
      log.error('[CoreRuntime] Shutdown error, forcing quit', error);
      app.exit(1);
    }
  }

  /**
   * Request app restart
   */
  async restart(reason: string = 'user-request'): Promise<void> {
    if (this.session.restartCount >= this.config.maxRestartAttempts) {
      log.error('[CoreRuntime] Max restart attempts exceeded');
      this.emit('maxRestartsExceeded');
      return;
    }

    log.info(`[CoreRuntime] Restart requested: ${reason}`);
    this.restartRequested = true;
    this.session.restartCount++;
    this.setState('restarting');
    
    await this.shutdown('user-request');
  }

  private performRestart(): void {
    log.info('[CoreRuntime] Performing restart...');
    
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, this.config.restartDelayMs);
  }

  // -------------------------------------------------------------------------
  // SUSPEND & RESUME
  // -------------------------------------------------------------------------

  /**
   * Handle system suspend (sleep/hibernate)
   */
  async suspend(): Promise<void> {
    if (this.state === 'suspended' || this.state === 'suspending') return;
    
    this.setState('suspending');
    log.info('[CoreRuntime] System suspending');
    
    // Pause all subsystems
    this.emit('suspend');
    
    this.setState('suspended');
  }

  /**
   * Handle system resume
   */
  async resume(): Promise<void> {
    if (this.state !== 'suspended') return;
    
    this.setState('resuming');
    log.info('[CoreRuntime] System resuming');
    
    // Resume all subsystems
    this.emit('resume');
    
    this.setState('running');
  }

  // -------------------------------------------------------------------------
  // HEALTH MONITORING
  // -------------------------------------------------------------------------

  private performHealthCheck(): void {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - this.session.startedAt;
    
    // Check for memory issues
    const heapUsedMB = memoryUsage.heapUsed / (1024 * 1024);
    if (heapUsedMB > 400) {
      log.warn(`[CoreRuntime] High memory usage: ${heapUsedMB.toFixed(1)}MB`);
      this.emit('memoryWarning', { heapUsedMB });
      
      // Trigger garbage collection if available
      if (global.gc) {
        log.info('[CoreRuntime] Triggering garbage collection');
        global.gc();
      }
    }

    // Check window responsiveness
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('runtime:healthCheck', {
        timestamp: Date.now(),
        uptime,
        memory: heapUsedMB,
      });
    }

    this.emit('healthCheck', {
      state: this.state,
      uptime,
      memory: memoryUsage,
      session: this.session,
    });
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('runtime:getState', () => this.state);
    ipcMain.handle('runtime:getSession', () => this.getSession());
    ipcMain.handle('runtime:shutdown', async (_, reason?: ShutdownReason) => {
      await this.shutdown(reason);
    });
    ipcMain.handle('runtime:restart', async (_, reason?: string) => {
      await this.restart(reason);
    });
    
    log.info('[CoreRuntime] IPC handlers registered');
  }

  // -------------------------------------------------------------------------
  // PROCESS HANDLERS
  // -------------------------------------------------------------------------

  private setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.error('[CoreRuntime] Uncaught exception:', error);
      this.emit('uncaughtException', error);
      
      // Don't crash on recoverable errors
      if (this.state === 'running') {
        log.info('[CoreRuntime] Attempting recovery from uncaught exception');
      }
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      log.error('[CoreRuntime] Unhandled rejection:', reason);
      this.emit('unhandledRejection', { reason, promise });
    });

    // Handle SIGTERM (graceful shutdown request)
    process.on('SIGTERM', () => {
      log.info('[CoreRuntime] SIGTERM received');
      this.shutdown('system-shutdown');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      log.info('[CoreRuntime] SIGINT received');
      this.shutdown('user-request');
    });
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const coreRuntime = new CoreRuntimeClass();
export default coreRuntime;
