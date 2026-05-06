// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - True Idle Mode
// Near-zero CPU/GPU when idle
// No background loops, no battery drain
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, powerMonitor } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type IdleState = 'active' | 'idle' | 'deep-idle' | 'suspended';

export interface IdleConfig {
  idleThreshold: number;        // Seconds until idle
  deepIdleThreshold: number;    // Seconds until deep idle
  checkInterval: number;        // How often to check (ms)
  suspendOnBattery: boolean;    // More aggressive on battery
  reducedPolling: boolean;      // Use reduced polling when idle
}

export interface IdleStatus {
  state: IdleState;
  idleTime: number;             // Seconds idle
  lastActivity: number;         // Timestamp
  suppressedTimers: number;     // Number of suppressed background tasks
  powerSource: 'battery' | 'ac' | 'unknown';
}

export interface ManagedTimer {
  id: string;
  name: string;
  interval: number;
  callback: () => void;
  handle: NodeJS.Timeout | null;
  suppressWhenIdle: boolean;
  minIdleInterval?: number;     // Longer interval when idle
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: IdleConfig = {
  idleThreshold: 60,            // 1 minute
  deepIdleThreshold: 300,       // 5 minutes
  checkInterval: 10000,         // 10 seconds
  suspendOnBattery: true,
  reducedPolling: true
};

// ===========================================================================
// TRUE IDLE MODE
// ===========================================================================

class TrueIdleModeClass extends EventEmitter {
  private config: IdleConfig;
  private state: IdleState = 'active';
  private lastActivity: number = Date.now();
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private managedTimers: Map<string, ManagedTimer> = new Map();
  private timerCounter = 0;
  private powerSource: 'battery' | 'ac' | 'unknown' = 'unknown';

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
    this.setupPowerMonitoring();
    this.startIdleCheck();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get idle status
    ipcMain.handle('idle:status', () => {
      return this.getStatus();
    });

    // Report activity
    ipcMain.handle('idle:activity', () => {
      this.recordActivity();
      return { success: true };
    });

    // Get state
    ipcMain.handle('idle:state', () => {
      return this.state;
    });

    // Force state (for testing)
    ipcMain.handle('idle:forceState', (_event, state: IdleState) => {
      this.setState(state);
      return { success: true };
    });

    // Update config
    ipcMain.handle('idle:setConfig', (_event, config: Partial<IdleConfig>) => {
      this.config = { ...this.config, ...config };
      return { success: true };
    });

    // Get managed timers
    ipcMain.handle('idle:timers', () => {
      return this.getTimerInfo();
    });
  }

  // -------------------------------------------------------------------------
  // POWER MONITORING
  // -------------------------------------------------------------------------

  private setupPowerMonitoring(): void {
    // Monitor power source changes
    powerMonitor.on('on-ac', () => {
      this.powerSource = 'ac';
      this.emit('power:changed', 'ac');
      log.debug('[Idle] Switched to AC power');
      
      // Resume more aggressive polling
      if (this.state !== 'active') {
        this.restoreTimers();
      }
    });

    powerMonitor.on('on-battery', () => {
      this.powerSource = 'battery';
      this.emit('power:changed', 'battery');
      log.debug('[Idle] Switched to battery power');
      
      // Be more conservative on battery
      if (this.config.suspendOnBattery && this.state !== 'active') {
        this.suppressTimers();
      }
    });

    // Monitor system idle/resume
    powerMonitor.on('suspend', () => {
      this.setState('suspended');
      this.suspendAllTimers();
    });

    powerMonitor.on('resume', () => {
      this.setState('active');
      this.restoreTimers();
      this.recordActivity();
    });

    powerMonitor.on('lock-screen', () => {
      this.setState('deep-idle');
    });

    powerMonitor.on('unlock-screen', () => {
      this.setState('active');
      this.recordActivity();
    });
  }

  // -------------------------------------------------------------------------
  // IDLE DETECTION
  // -------------------------------------------------------------------------

  private startIdleCheck(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleState();
    }, this.config.checkInterval);
  }

  private checkIdleState(): void {
    const idleTime = powerMonitor.getSystemIdleTime();
    const previousState = this.state;

    if (idleTime >= this.config.deepIdleThreshold) {
      this.setState('deep-idle');
    } else if (idleTime >= this.config.idleThreshold) {
      this.setState('idle');
    } else {
      this.setState('active');
    }

    // Log state changes
    if (previousState !== this.state) {
      log.debug(`[Idle] State changed: ${previousState} -> ${this.state}`);
    }
  }

  private setState(newState: IdleState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;

    // Handle state transitions
    if (newState === 'active') {
      this.restoreTimers();
    } else if (newState === 'idle') {
      if (this.config.reducedPolling) {
        this.reduceTimers();
      }
    } else if (newState === 'deep-idle' || newState === 'suspended') {
      this.suppressTimers();
    }

    this.emit('state:changed', { previous: previousState, current: newState });
    this.broadcastState();
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
    if (this.state !== 'active') {
      this.setState('active');
    }
  }

  // -------------------------------------------------------------------------
  // TIMER MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Register a managed timer that respects idle state
   */
  registerTimer(
    name: string,
    callback: () => void,
    interval: number,
    options?: {
      suppressWhenIdle?: boolean;
      minIdleInterval?: number;
    }
  ): string {
    const id = `timer-${Date.now()}-${++this.timerCounter}`;

    const timer: ManagedTimer = {
      id,
      name,
      interval,
      callback,
      handle: null,
      suppressWhenIdle: options?.suppressWhenIdle ?? true,
      minIdleInterval: options?.minIdleInterval
    };

    this.managedTimers.set(id, timer);
    this.startTimer(timer);

    log.debug(`[Idle] Registered timer: ${name} (${interval}ms)`);
    return id;
  }

  /**
   * Unregister a managed timer
   */
  unregisterTimer(id: string): boolean {
    const timer = this.managedTimers.get(id);
    if (!timer) return false;

    this.stopTimer(timer);
    this.managedTimers.delete(id);
    return true;
  }

  private startTimer(timer: ManagedTimer): void {
    if (timer.handle) {
      clearInterval(timer.handle);
    }

    // Determine interval based on state
    let interval = timer.interval;
    if (this.state === 'idle' && timer.minIdleInterval) {
      interval = timer.minIdleInterval;
    }

    timer.handle = setInterval(timer.callback, interval);
  }

  private stopTimer(timer: ManagedTimer): void {
    if (timer.handle) {
      clearInterval(timer.handle);
      timer.handle = null;
    }
  }

  private suppressTimers(): void {
    let suppressed = 0;
    for (const timer of this.managedTimers.values()) {
      if (timer.suppressWhenIdle && timer.handle) {
        this.stopTimer(timer);
        suppressed++;
      }
    }
    if (suppressed > 0) {
      log.debug(`[Idle] Suppressed ${suppressed} timers`);
    }
  }

  private reduceTimers(): void {
    for (const timer of this.managedTimers.values()) {
      if (timer.minIdleInterval && timer.handle) {
        // Restart with reduced interval
        this.startTimer(timer);
      }
    }
  }

  private restoreTimers(): void {
    let restored = 0;
    for (const timer of this.managedTimers.values()) {
      if (!timer.handle) {
        this.startTimer(timer);
        restored++;
      }
    }
    if (restored > 0) {
      log.debug(`[Idle] Restored ${restored} timers`);
    }
  }

  private suspendAllTimers(): void {
    for (const timer of this.managedTimers.values()) {
      this.stopTimer(timer);
    }
    log.debug('[Idle] Suspended all timers');
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): IdleStatus {
    const idleTime = powerMonitor.getSystemIdleTime();
    const suppressedTimers = Array.from(this.managedTimers.values())
      .filter(t => t.suppressWhenIdle && !t.handle).length;

    return {
      state: this.state,
      idleTime,
      lastActivity: this.lastActivity,
      suppressedTimers,
      powerSource: this.powerSource
    };
  }

  getState(): IdleState {
    return this.state;
  }

  getTimerInfo(): Array<{ id: string; name: string; running: boolean; interval: number }> {
    return Array.from(this.managedTimers.values()).map(t => ({
      id: t.id,
      name: t.name,
      running: !!t.handle,
      interval: t.interval
    }));
  }

  // -------------------------------------------------------------------------
  // BROADCASTING
  // -------------------------------------------------------------------------

  private broadcastState(): void {
    const status = this.getStatus();
    const windows = BrowserWindow.getAllWindows();

    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('idle:stateChanged', status);
      }
    }
  }

  // -------------------------------------------------------------------------
  // CONVENIENCE: IDLE-AWARE OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Execute callback only if not in deep idle
   */
  executeIfActive(callback: () => void): boolean {
    if (this.state === 'deep-idle' || this.state === 'suspended') {
      return false;
    }
    callback();
    return true;
  }

  /**
   * Schedule work for when user returns
   */
  scheduleOnResume(callback: () => void): void {
    const handler = () => {
      callback();
      this.off('state:changed', checkHandler);
    };

    const checkHandler = ({ current }: { current: IdleState }) => {
      if (current === 'active') {
        handler();
      }
    };

    if (this.state === 'active') {
      callback();
    } else {
      this.on('state:changed', checkHandler);
    }
  }

  /**
   * Defer work until idle
   */
  scheduleOnIdle(callback: () => void): void {
    const handler = () => {
      callback();
      this.off('state:changed', checkHandler);
    };

    const checkHandler = ({ current }: { current: IdleState }) => {
      if (current === 'idle' || current === 'deep-idle') {
        handler();
      }
    };

    if (this.state === 'idle' || this.state === 'deep-idle') {
      callback();
    } else {
      this.on('state:changed', checkHandler);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Stop all managed timers
    for (const timer of this.managedTimers.values()) {
      this.stopTimer(timer);
    }
    this.managedTimers.clear();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const TrueIdleMode = new TrueIdleModeClass();
export default TrueIdleMode;
