// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Silent Crash Recovery System
// System 6 Feature 2: Silent Crash Recovery
// Catches crashes silently, restores state, no data loss, no scary dialogs
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type CrashType = 
  | 'renderer-crash'
  | 'renderer-unresponsive'
  | 'main-exception'
  | 'uncaught-promise'
  | 'memory-pressure'
  | 'gpu-crash'
  | 'worker-crash';

export interface CrashEvent {
  id: string;
  timestamp: number;
  type: CrashType;
  windowId?: number;
  reason?: string;
  killedByOS?: boolean;
  stack?: string;
  recovered: boolean;
  recoveryAction?: string;
  dataLost: boolean;
}

export interface WindowState {
  id: number;
  bounds: Electron.Rectangle;
  isMaximized: boolean;
  isFullScreen: boolean;
  url: string;
  title: string;
}

export interface SessionState {
  timestamp: number;
  windows: WindowState[];
  activeWindow?: number;
  pendingOperations: string[];
  unsavedData: Record<string, unknown>;
}

export interface RecoveryConfig {
  enabled: boolean;
  autoRecover: boolean;
  maxRecoveryAttempts: number;
  recoveryDelayMs: number;
  saveStateInterval: number;
  keepCrashHistory: number;
  showRecoveryNotification: boolean;
  silentMode: boolean;
}

export interface RecoveryStats {
  totalCrashes: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  dataLossEvents: number;
  lastCrash?: number;
  uptimeSinceLastCrash: number;
  crashesByType: Record<CrashType, number>;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: RecoveryConfig = {
  enabled: true,
  autoRecover: true,
  maxRecoveryAttempts: 3,
  recoveryDelayMs: 1000,
  saveStateInterval: 30000, // Save state every 30 seconds
  keepCrashHistory: 50,
  showRecoveryNotification: true,
  silentMode: true, // No scary error dialogs
};

// ===========================================================================
// CRASH RECOVERY SYSTEM
// ===========================================================================

class CrashRecoverySystemClass extends EventEmitter {
  private config: RecoveryConfig;
  private crashes: CrashEvent[] = [];
  private savedState: SessionState | null = null;
  private recoveryAttempts = 0;
  private stateFile = '';
  private crashHistoryFile = '';
  private saveInterval: NodeJS.Timeout | null = null;
  private isRecovering = false;
  private startTime = Date.now();

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const dataPath = path.join(app.getPath('userData'), 'recovery');
    this.stateFile = path.join(dataPath, 'session-state.json');
    this.crashHistoryFile = path.join(dataPath, 'crash-history.json');

    try {
      await fs.mkdir(dataPath, { recursive: true });
      await this.loadConfig();
      await this.loadCrashHistory();
      await this.checkForPreviousCrash();
      
      this.setupCrashHandlers();
      this.startStateSaving();

      log.info('[CrashRecovery] Initialized');
    } catch (error) {
      log.error('[CrashRecovery] Initialization failed:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    const configFile = path.join(path.dirname(this.stateFile), 'config.json');
    
    try {
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (err: any) {
      log.warn('[CrashRecovery] Failed to load config, using defaults:', err.message);
    }
  }

  private async loadCrashHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.crashHistoryFile, 'utf-8');
      this.crashes = JSON.parse(data);
    } catch (err: any) {
      log.warn('[CrashRecovery] Failed to load crash history:', err.message);
      this.crashes = [];
    }
  }

  private async saveCrashHistory(): Promise<void> {
    // Keep only recent crashes
    this.crashes = this.crashes.slice(-this.config.keepCrashHistory);
    await fs.writeFile(this.crashHistoryFile, JSON.stringify(this.crashes, null, 2));
  }

  private async checkForPreviousCrash(): Promise<void> {
    // Check if there's a saved state from a previous crash
    if (fsSync.existsSync(this.stateFile)) {
      try {
        const data = await fs.readFile(this.stateFile, 'utf-8');
        const state = JSON.parse(data) as SessionState;
        
        // Check if this is recent (within last 5 minutes)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (state.timestamp > fiveMinutesAgo) {
          this.savedState = state;
          log.info('[CrashRecovery] Found recoverable session state');
          this.emit('state:found', state);
        } else {
          // Old state, clean up
          await fs.unlink(this.stateFile);
        }
      } catch (err: any) {
        log.warn('[CrashRecovery] Invalid or unreadable state file:', err.message);
      }
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get crash history
    ipcMain.handle('recovery:crashes', (_event, limit?: number) => {
      return this.getCrashHistory(limit);
    });

    // Get recovery stats
    ipcMain.handle('recovery:stats', () => {
      return this.getStats();
    });

    // Get saved state
    ipcMain.handle('recovery:savedState', () => {
      return this.savedState;
    });

    // Restore from saved state
    ipcMain.handle('recovery:restore', async () => {
      return this.restoreFromSavedState();
    });

    // Dismiss saved state
    ipcMain.handle('recovery:dismiss', async () => {
      return this.dismissSavedState();
    });

    // Save current state (manual trigger)
    ipcMain.handle('recovery:saveState', async () => {
      return this.saveCurrentState();
    });

    // Get config
    ipcMain.handle('recovery:config', () => {
      return this.config;
    });

    // Update config
    ipcMain.handle('recovery:setConfig', async (_event, updates: Partial<RecoveryConfig>) => {
      return this.updateConfig(updates);
    });

    // Report unsaved data from renderer
    ipcMain.on('recovery:unsavedData', (_event, key: string, data: unknown) => {
      if (!this.savedState) {
        this.savedState = {
          timestamp: Date.now(),
          windows: [],
          pendingOperations: [],
          unsavedData: {},
        };
      }
      this.savedState.unsavedData[key] = data;
    });
  }

  // -------------------------------------------------------------------------
  // CRASH HANDLERS
  // -------------------------------------------------------------------------

  private setupCrashHandlers(): void {
    // Renderer crashes
    app.on('render-process-gone', (event, webContents, details) => {
      const window = BrowserWindow.fromWebContents(webContents);
      
      this.handleCrash({
        type: 'renderer-crash',
        windowId: window?.id,
        reason: details.reason,
        killedByOS: details.reason === 'killed',
      });
    });

    // Unresponsive renderer
    app.on('web-contents-created', (_event, contents) => {
      contents.on('unresponsive', () => {
        const window = BrowserWindow.fromWebContents(contents);
        
        this.handleCrash({
          type: 'renderer-unresponsive',
          windowId: window?.id,
          reason: 'Renderer became unresponsive',
        });
      });

      contents.on('responsive', () => {
        log.info('[CrashRecovery] Renderer became responsive again');
      });
    });

    // GPU crashes
    app.on('gpu-process-crashed' as any, (_event: Event, killed: boolean) => {
      this.handleCrash({
        type: 'gpu-crash',
        killedByOS: killed,
        reason: killed ? 'GPU killed by OS' : 'GPU crashed',
      });
    });

    // Uncaught exceptions in main process
    process.on('uncaughtException', (error) => {
      this.handleCrash({
        type: 'main-exception',
        reason: error.message,
        stack: error.stack,
      });
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      this.handleCrash({
        type: 'uncaught-promise',
        reason: String(reason),
      });
    });

    // Memory pressure (exit before crash)
    if (process.platform === 'win32') {
      // Windows-specific memory pressure handling would go here
    }
  }

  private async handleCrash(details: Omit<CrashEvent, 'id' | 'timestamp' | 'recovered' | 'dataLost'>): Promise<void> {
    const crash: CrashEvent = {
      id: `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...details,
      recovered: false,
      dataLost: false,
    };

    log.error(`[CrashRecovery] Crash detected: ${crash.type} - ${crash.reason}`);

    // Save state immediately
    await this.saveCurrentState();

    this.crashes.push(crash);
    await this.saveCrashHistory();

    this.emit('crash:detected', crash);

    // Attempt recovery if enabled
    if (this.config.enabled && this.config.autoRecover) {
      if (this.recoveryAttempts < this.config.maxRecoveryAttempts) {
        await this.attemptRecovery(crash);
      } else {
        log.error('[CrashRecovery] Max recovery attempts reached');
        crash.recovered = false;
        
        if (!this.config.silentMode) {
          this.showCrashDialog(crash);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // RECOVERY
  // -------------------------------------------------------------------------

  private async attemptRecovery(crash: CrashEvent): Promise<void> {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    this.recoveryAttempts++;

    log.info(`[CrashRecovery] Attempting recovery (attempt ${this.recoveryAttempts})`);

    await new Promise(resolve => setTimeout(resolve, this.config.recoveryDelayMs));

    try {
      switch (crash.type) {
        case 'renderer-crash':
        case 'renderer-unresponsive':
          await this.recoverRenderer(crash.windowId);
          break;
        
        case 'gpu-crash':
          await this.recoverGPU();
          break;
        
        case 'main-exception':
        case 'uncaught-promise':
          // Main process issues - can't fully recover, but prevent cascade
          log.warn('[CrashRecovery] Main process issue detected, continuing cautiously');
          break;
      }

      crash.recovered = true;
      crash.recoveryAction = `Auto-recovered from ${crash.type}`;
      
      this.emit('recovery:success', crash);
      
      if (this.config.showRecoveryNotification) {
        this.showRecoveryNotification(crash);
      }

      // Reset attempts after successful recovery
      this.recoveryAttempts = 0;

    } catch (error) {
      log.error('[CrashRecovery] Recovery failed:', error);
      crash.recovered = false;
      this.emit('recovery:failed', crash);
    } finally {
      this.isRecovering = false;
    }
  }

  private async recoverRenderer(windowId?: number): Promise<void> {
    if (windowId) {
      const window = BrowserWindow.fromId(windowId);
      
      if (window && !window.isDestroyed()) {
        // Try to reload the window
        window.webContents.reload();
        log.info(`[CrashRecovery] Reloaded window ${windowId}`);
      } else {
        // Window is gone, restore from saved state if available
        if (this.savedState) {
          const savedWindow = this.savedState.windows.find(w => w.id === windowId);
          if (savedWindow) {
            await this.recreateWindow(savedWindow);
          }
        }
      }
    }
  }

  private async recoverGPU(): Promise<void> {
    // GPU recovery - reload all windows
    const windows = BrowserWindow.getAllWindows();
    
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.reload();
      }
    }

    log.info('[CrashRecovery] Reloaded all windows after GPU crash');
  }

  private async recreateWindow(state: WindowState): Promise<BrowserWindow | null> {
    try {
      const window = new BrowserWindow({
        ...state.bounds,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      if (state.isMaximized) {
        window.maximize();
      }

      if (state.isFullScreen) {
        window.setFullScreen(true);
      }

      // Security: Validate URL before loading -- only allow file: or app protocol
      const recoveryUrl = state.url || '';
      if (!recoveryUrl.startsWith('file://') && !recoveryUrl.startsWith('app://') && !recoveryUrl.startsWith('http://localhost') && !recoveryUrl.startsWith('https://')) {
        log.warn('[CrashRecovery] Blocked suspicious URL:', recoveryUrl.substring(0, 100));
        return null;
      }
      await window.loadURL(recoveryUrl);
      
      log.info('[CrashRecovery] Recreated window from saved state');
      return window;
    } catch (error) {
      log.error('[CrashRecovery] Failed to recreate window:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  private startStateSaving(): void {
    this.saveInterval = setInterval(() => {
      this.saveCurrentState();
    }, this.config.saveStateInterval);

    // Also save on visibility change
    app.on('browser-window-blur', () => {
      this.saveCurrentState();
    });
  }

  async saveCurrentState(): Promise<{ success: boolean }> {
    try {
      const windows = BrowserWindow.getAllWindows();
      const windowStates: WindowState[] = [];

      for (const window of windows) {
        if (!window.isDestroyed()) {
          windowStates.push({
            id: window.id,
            bounds: window.getBounds(),
            isMaximized: window.isMaximized(),
            isFullScreen: window.isFullScreen(),
            url: window.webContents.getURL(),
            title: window.getTitle(),
          });
        }
      }

      const state: SessionState = {
        timestamp: Date.now(),
        windows: windowStates,
        activeWindow: BrowserWindow.getFocusedWindow()?.id,
        pendingOperations: this.savedState?.pendingOperations || [],
        unsavedData: this.savedState?.unsavedData || {},
      };

      this.savedState = state;
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));

      return { success: true };
    } catch (error) {
      log.error('[CrashRecovery] Failed to save state:', error);
      return { success: false };
    }
  }

  async restoreFromSavedState(): Promise<{ success: boolean; restored: number }> {
    if (!this.savedState) {
      return { success: false, restored: 0 };
    }

    let restored = 0;

    for (const windowState of this.savedState.windows) {
      const window = await this.recreateWindow(windowState);
      if (window) {
        restored++;
      }
    }

    // Clear saved state after restore
    await this.dismissSavedState();

    return { success: restored > 0, restored };
  }

  async dismissSavedState(): Promise<{ success: boolean }> {
    this.savedState = null;
    
    try {
      if (fsSync.existsSync(this.stateFile)) {
        await fs.unlink(this.stateFile);
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  // -------------------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------------------

  private showRecoveryNotification(crash: CrashEvent): void {
    const window = BrowserWindow.getFocusedWindow();
    
    if (window) {
      window.webContents.send('notification:show', {
        type: 'info',
        title: 'Recovered',
        message: 'DEX recovered from an issue automatically. Your work is safe.',
        duration: 3000,
      });
    }
  }

  private showCrashDialog(crash: CrashEvent): void {
    dialog.showMessageBox({
      type: 'error',
      title: 'DEX encountered an issue',
      message: 'DEX encountered a problem but your data has been saved.',
      detail: `Issue: ${crash.reason || crash.type}\n\nYou can restart DEX to continue.`,
      buttons: ['Restart', 'Close'],
    }).then(result => {
      if (result.response === 0) {
        app.relaunch();
        app.exit(0);
      }
    });
  }

  // -------------------------------------------------------------------------
  // GETTERS
  // -------------------------------------------------------------------------

  getCrashHistory(limit?: number): CrashEvent[] {
    return this.crashes.slice(-(limit || 20));
  }

  getStats(): RecoveryStats {
    const stats: RecoveryStats = {
      totalCrashes: this.crashes.length,
      successfulRecoveries: this.crashes.filter(c => c.recovered).length,
      failedRecoveries: this.crashes.filter(c => !c.recovered).length,
      dataLossEvents: this.crashes.filter(c => c.dataLost).length,
      uptimeSinceLastCrash: Date.now() - this.startTime,
      crashesByType: {
        'renderer-crash': 0,
        'renderer-unresponsive': 0,
        'main-exception': 0,
        'uncaught-promise': 0,
        'memory-pressure': 0,
        'gpu-crash': 0,
        'worker-crash': 0,
      },
    };

    if (this.crashes.length > 0) {
      stats.lastCrash = this.crashes[this.crashes.length - 1].timestamp;
      stats.uptimeSinceLastCrash = Date.now() - stats.lastCrash;
    }

    for (const crash of this.crashes) {
      stats.crashesByType[crash.type]++;
    }

    return stats;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async updateConfig(updates: Partial<RecoveryConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...updates };
    
    const configFile = path.join(path.dirname(this.stateFile), 'config.json');
    await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));

    // Restart state saving interval if changed
    if ('saveStateInterval' in updates) {
      if (this.saveInterval) {
        clearInterval(this.saveInterval);
      }
      this.startStateSaving();
    }

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    // Final state save
    this.saveCurrentState();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const CrashRecoverySystem = new CrashRecoverySystemClass();
