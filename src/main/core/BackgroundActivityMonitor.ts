// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Background Activity Monitor
// Clear status of what Dex is doing
// No hidden processes, one toggle to stop everything
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ActivityType = 
  | 'indexing'
  | 'scanning'
  | 'processing'
  | 'syncing'
  | 'downloading'
  | 'uploading'
  | 'converting'
  | 'analyzing'
  | 'searching'
  | 'background'
  | 'system';

export type ActivityStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Activity {
  id: string;
  type: ActivityType;
  name: string;
  description?: string;
  status: ActivityStatus;
  progress: number; // 0-100, -1 for indeterminate
  startTime: number;
  endTime?: number;
  canCancel: boolean;
  canPause: boolean;
  metadata?: Record<string, unknown>;
}

export interface ActivitySummary {
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  paused: number;
}

export interface BackgroundConfig {
  maxConcurrent: number;
  activityHistoryLimit: number;
  autoClearCompleted: boolean;
  autoClearDelay: number;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: BackgroundConfig = {
  maxConcurrent: 5,
  activityHistoryLimit: 100,
  autoClearCompleted: true,
  autoClearDelay: 30000 // 30 seconds
};

// ===========================================================================
// BACKGROUND ACTIVITY MONITOR
// ===========================================================================

class BackgroundActivityMonitorClass extends EventEmitter {
  private activities: Map<string, Activity> = new Map();
  private activityHistory: Activity[] = [];
  private config: BackgroundConfig;
  private activityCounter = 0;
  private globalPaused = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
    this.startCleanup();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get all activities
    ipcMain.handle('activity:list', () => {
      return this.getActivities();
    });

    // Get activity by ID
    ipcMain.handle('activity:get', (_event, id: string) => {
      return this.getActivity(id);
    });

    // Get summary
    ipcMain.handle('activity:summary', () => {
      return this.getSummary();
    });

    // Cancel activity
    ipcMain.handle('activity:cancel', (_event, id: string) => {
      return this.cancelActivity(id);
    });

    // Pause activity
    ipcMain.handle('activity:pause', (_event, id: string) => {
      return this.pauseActivity(id);
    });

    // Resume activity
    ipcMain.handle('activity:resume', (_event, id: string) => {
      return this.resumeActivity(id);
    });

    // Cancel all
    ipcMain.handle('activity:cancelAll', () => {
      return this.cancelAll();
    });

    // Pause all (global pause)
    ipcMain.handle('activity:pauseAll', () => {
      return this.pauseAll();
    });

    // Resume all
    ipcMain.handle('activity:resumeAll', () => {
      return this.resumeAll();
    });

    // Get global pause status
    ipcMain.handle('activity:isPaused', () => {
      return this.globalPaused;
    });

    // Clear completed
    ipcMain.handle('activity:clearCompleted', () => {
      return this.clearCompleted();
    });

    // Get history
    ipcMain.handle('activity:history', () => {
      return this.getHistory();
    });
  }

  // -------------------------------------------------------------------------
  // ACTIVITY MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Register a new activity
   */
  registerActivity(
    type: ActivityType,
    name: string,
    options?: {
      description?: string;
      canCancel?: boolean;
      canPause?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): string {
    const id = `act-${Date.now()}-${++this.activityCounter}`;

    const activity: Activity = {
      id,
      type,
      name,
      description: options?.description,
      status: this.globalPaused ? 'paused' : 'pending',
      progress: 0,
      startTime: Date.now(),
      canCancel: options?.canCancel ?? true,
      canPause: options?.canPause ?? true,
      metadata: options?.metadata
    };

    this.activities.set(id, activity);
    this.broadcastUpdate();
    this.emit('activity:registered', activity);

    log.debug(`[Activity] Registered: ${name} (${id})`);
    return id;
  }

  /**
   * Start an activity
   */
  startActivity(id: string): boolean {
    const activity = this.activities.get(id);
    if (!activity) return false;

    if (this.globalPaused) {
      activity.status = 'paused';
    } else {
      activity.status = 'running';
    }

    this.broadcastUpdate();
    this.emit('activity:started', activity);
    return true;
  }

  /**
   * Update activity progress
   */
  updateProgress(id: string, progress: number, description?: string): boolean {
    const activity = this.activities.get(id);
    if (!activity) return false;

    activity.progress = Math.max(-1, Math.min(100, progress));
    if (description) {
      activity.description = description;
    }

    this.broadcastUpdate();
    return true;
  }

  /**
   * Complete an activity
   */
  completeActivity(id: string, status: 'completed' | 'failed' = 'completed'): boolean {
    const activity = this.activities.get(id);
    if (!activity) return false;

    activity.status = status;
    activity.progress = status === 'completed' ? 100 : activity.progress;
    activity.endTime = Date.now();

    // Move to history
    this.activityHistory.unshift({ ...activity });
    if (this.activityHistory.length > this.config.activityHistoryLimit) {
      this.activityHistory.pop();
    }

    // Auto-clear if enabled
    if (this.config.autoClearCompleted) {
      setTimeout(() => {
        this.activities.delete(id);
        this.broadcastUpdate();
      }, this.config.autoClearDelay);
    }

    this.broadcastUpdate();
    this.emit('activity:completed', activity);

    log.debug(`[Activity] ${status}: ${activity.name} (${id})`);
    return true;
  }

  /**
   * Cancel an activity
   */
  cancelActivity(id: string): { success: boolean; error?: string } {
    const activity = this.activities.get(id);
    if (!activity) {
      return { success: false, error: 'Activity not found' };
    }

    if (!activity.canCancel) {
      return { success: false, error: 'Activity cannot be cancelled' };
    }

    activity.status = 'cancelled';
    activity.endTime = Date.now();

    this.activityHistory.unshift({ ...activity });
    this.activities.delete(id);

    this.broadcastUpdate();
    this.emit('activity:cancelled', activity);

    log.info(`[Activity] Cancelled: ${activity.name} (${id})`);
    return { success: true };
  }

  /**
   * Pause an activity
   */
  pauseActivity(id: string): { success: boolean; error?: string } {
    const activity = this.activities.get(id);
    if (!activity) {
      return { success: false, error: 'Activity not found' };
    }

    if (!activity.canPause) {
      return { success: false, error: 'Activity cannot be paused' };
    }

    if (activity.status !== 'running' && activity.status !== 'pending') {
      return { success: false, error: 'Activity is not running' };
    }

    activity.status = 'paused';
    this.broadcastUpdate();
    this.emit('activity:paused', activity);

    return { success: true };
  }

  /**
   * Resume an activity
   */
  resumeActivity(id: string): { success: boolean; error?: string } {
    const activity = this.activities.get(id);
    if (!activity) {
      return { success: false, error: 'Activity not found' };
    }

    if (activity.status !== 'paused') {
      return { success: false, error: 'Activity is not paused' };
    }

    if (this.globalPaused) {
      return { success: false, error: 'Background activities are globally paused' };
    }

    activity.status = 'running';
    this.broadcastUpdate();
    this.emit('activity:resumed', activity);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // GLOBAL CONTROL
  // -------------------------------------------------------------------------

  /**
   * Cancel all activities
   */
  cancelAll(): { cancelled: number } {
    let cancelled = 0;

    for (const [id, activity] of this.activities) {
      if (activity.canCancel && activity.status !== 'completed' && activity.status !== 'failed') {
        this.cancelActivity(id);
        cancelled++;
      }
    }

    log.info(`[Activity] Cancelled ${cancelled} activities`);
    return { cancelled };
  }

  /**
   * Pause all activities (global pause)
   */
  pauseAll(): { paused: number } {
    this.globalPaused = true;
    let paused = 0;

    for (const activity of this.activities.values()) {
      if (activity.canPause && activity.status === 'running') {
        activity.status = 'paused';
        paused++;
      }
    }

    this.broadcastUpdate();
    this.emit('activity:globalPause', true);

    log.info(`[Activity] Global pause enabled, paused ${paused} activities`);
    return { paused };
  }

  /**
   * Resume all activities
   */
  resumeAll(): { resumed: number } {
    this.globalPaused = false;
    let resumed = 0;

    for (const activity of this.activities.values()) {
      if (activity.status === 'paused') {
        activity.status = 'running';
        resumed++;
      }
    }

    this.broadcastUpdate();
    this.emit('activity:globalPause', false);

    log.info(`[Activity] Global pause disabled, resumed ${resumed} activities`);
    return { resumed };
  }

  /**
   * Clear completed activities
   */
  clearCompleted(): { cleared: number } {
    let cleared = 0;

    for (const [id, activity] of this.activities) {
      if (activity.status === 'completed' || activity.status === 'failed' || activity.status === 'cancelled') {
        this.activities.delete(id);
        cleared++;
      }
    }

    this.broadcastUpdate();
    return { cleared };
  }

  // -------------------------------------------------------------------------
  // DATA ACCESS
  // -------------------------------------------------------------------------

  getActivity(id: string): Activity | null {
    return this.activities.get(id) || null;
  }

  getActivities(): Activity[] {
    return Array.from(this.activities.values());
  }

  getActiveActivities(): Activity[] {
    return Array.from(this.activities.values()).filter(
      a => a.status === 'running' || a.status === 'pending' || a.status === 'paused'
    );
  }

  getSummary(): ActivitySummary {
    const activities = Array.from(this.activities.values());
    
    return {
      total: activities.length,
      running: activities.filter(a => a.status === 'running').length,
      pending: activities.filter(a => a.status === 'pending').length,
      completed: activities.filter(a => a.status === 'completed').length,
      failed: activities.filter(a => a.status === 'failed').length,
      paused: activities.filter(a => a.status === 'paused').length
    };
  }

  getHistory(): Activity[] {
    return [...this.activityHistory];
  }

  isGloballyPaused(): boolean {
    return this.globalPaused;
  }

  // -------------------------------------------------------------------------
  // BROADCASTING
  // -------------------------------------------------------------------------

  private broadcastUpdate(): void {
    const windows = BrowserWindow.getAllWindows();
    const summary = this.getSummary();
    const activities = this.getActivities();

    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('activity:update', {
          summary,
          activities,
          globalPaused: this.globalPaused
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      // Auto-clear old completed activities
      const now = Date.now();
      for (const [id, activity] of this.activities) {
        if (
          (activity.status === 'completed' || activity.status === 'failed' || activity.status === 'cancelled') &&
          activity.endTime &&
          now - activity.endTime > this.config.autoClearDelay * 2
        ) {
          this.activities.delete(id);
        }
      }
    }, 60000); // Every minute
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cancel all running activities
    this.cancelAll();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const BackgroundActivityMonitor = new BackgroundActivityMonitorClass();
export default BackgroundActivityMonitor;
