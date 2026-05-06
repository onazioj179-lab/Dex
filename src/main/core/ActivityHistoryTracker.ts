// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Activity History Tracker
// See what happened, when, what changed
// Undo or review safely
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type HistoryEventType = 
  | 'file:created'
  | 'file:modified'
  | 'file:deleted'
  | 'file:moved'
  | 'file:renamed'
  | 'file:copied'
  | 'note:created'
  | 'note:modified'
  | 'note:deleted'
  | 'action:executed'
  | 'action:created'
  | 'action:modified'
  | 'action:deleted'
  | 'settings:changed'
  | 'search:performed'
  | 'navigation:changed'
  | 'session:started'
  | 'session:ended';

export interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  timestamp: number;
  title: string;
  description?: string;
  target?: string;        // File path, action ID, etc.
  oldValue?: unknown;     // Previous state
  newValue?: unknown;     // New state
  undoable: boolean;
  undoData?: unknown;     // Data needed to undo
  metadata?: Record<string, unknown>;
}

export interface HistoryFilter {
  types?: HistoryEventType[];
  startTime?: number;
  endTime?: number;
  search?: string;
  target?: string;
  undoableOnly?: boolean;
}

export interface HistoryStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  oldestEvent?: number;
  newestEvent?: number;
  undoableCount: number;
}

export interface HistoryConfig {
  maxEvents: number;
  persistHistory: boolean;
  historyFile: string;
  sessionBoundary: boolean;  // Clear history on new session?
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: HistoryConfig = {
  maxEvents: 1000,
  persistHistory: true,
  historyFile: 'activity-history.json',
  sessionBoundary: false
};

// ===========================================================================
// ACTIVITY HISTORY TRACKER
// ===========================================================================

class ActivityHistoryTrackerClass extends EventEmitter {
  private events: HistoryEvent[] = [];
  private config: HistoryConfig;
  private eventCounter = 0;
  private dirty = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
    this.loadHistory();
    this.recordSessionStart();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get all events
    ipcMain.handle('history:list', (_event, filter?: HistoryFilter) => {
      return this.getEvents(filter);
    });

    // Get event by ID
    ipcMain.handle('history:get', (_event, id: string) => {
      return this.getEvent(id);
    });

    // Get stats
    ipcMain.handle('history:stats', () => {
      return this.getStats();
    });

    // Record event (from renderer)
    ipcMain.handle('history:record', (_event, data: Omit<HistoryEvent, 'id' | 'timestamp'>) => {
      return this.recordEvent(data);
    });

    // Undo event
    ipcMain.handle('history:undo', async (_event, id: string) => {
      return this.undoEvent(id);
    });

    // Clear history
    ipcMain.handle('history:clear', (_event, before?: number) => {
      return this.clearHistory(before);
    });

    // Get recent events
    ipcMain.handle('history:recent', (_event, limit?: number) => {
      return this.getRecentEvents(limit);
    });

    // Get events by type
    ipcMain.handle('history:byType', (_event, type: HistoryEventType) => {
      return this.getEventsByType(type);
    });

    // Export history
    ipcMain.handle('history:export', async (_event, filePath: string) => {
      return this.exportHistory(filePath);
    });
  }

  // -------------------------------------------------------------------------
  // EVENT RECORDING
  // -------------------------------------------------------------------------

  /**
   * Record a history event
   */
  recordEvent(data: Omit<HistoryEvent, 'id' | 'timestamp'>): string {
    const id = `hist-${Date.now()}-${++this.eventCounter}`;
    
    const event: HistoryEvent = {
      ...data,
      id,
      timestamp: Date.now()
    };

    this.events.unshift(event);

    // Trim if over limit
    if (this.events.length > this.config.maxEvents) {
      this.events.pop();
    }

    this.markDirty();
    this.broadcastEvent(event);
    this.emit('event:recorded', event);

    log.debug(`[History] Recorded: ${event.type} - ${event.title}`);
    return id;
  }

  /**
   * Convenience methods for common events
   */
  recordFileCreated(filePath: string, metadata?: Record<string, unknown>): string {
    return this.recordEvent({
      type: 'file:created',
      title: `Created ${path.basename(filePath)}`,
      target: filePath,
      undoable: true,
      undoData: { path: filePath },
      metadata
    });
  }

  recordFileModified(filePath: string, oldContent?: unknown, newContent?: unknown): string {
    return this.recordEvent({
      type: 'file:modified',
      title: `Modified ${path.basename(filePath)}`,
      target: filePath,
      oldValue: oldContent,
      newValue: newContent,
      undoable: !!oldContent,
      undoData: oldContent ? { path: filePath, content: oldContent } : undefined
    });
  }

  recordFileDeleted(filePath: string, undoData?: unknown): string {
    return this.recordEvent({
      type: 'file:deleted',
      title: `Deleted ${path.basename(filePath)}`,
      target: filePath,
      undoable: !!undoData,
      undoData
    });
  }

  recordFileMoved(fromPath: string, toPath: string): string {
    return this.recordEvent({
      type: 'file:moved',
      title: `Moved ${path.basename(fromPath)}`,
      description: `From ${fromPath} to ${toPath}`,
      target: toPath,
      oldValue: fromPath,
      newValue: toPath,
      undoable: true,
      undoData: { from: toPath, to: fromPath }
    });
  }

  recordFileRenamed(oldName: string, newName: string, filePath: string): string {
    return this.recordEvent({
      type: 'file:renamed',
      title: `Renamed to ${newName}`,
      description: `From ${oldName}`,
      target: filePath,
      oldValue: oldName,
      newValue: newName,
      undoable: true,
      undoData: { path: filePath, oldName, newName }
    });
  }

  recordActionExecuted(actionId: string, actionName: string, result?: unknown): string {
    return this.recordEvent({
      type: 'action:executed',
      title: `Executed ${actionName}`,
      target: actionId,
      newValue: result,
      undoable: false
    });
  }

  recordSettingsChanged(key: string, oldValue: unknown, newValue: unknown): string {
    return this.recordEvent({
      type: 'settings:changed',
      title: `Changed ${key}`,
      target: key,
      oldValue,
      newValue,
      undoable: true,
      undoData: { key, value: oldValue }
    });
  }

  recordSearchPerformed(query: string, resultCount: number): string {
    return this.recordEvent({
      type: 'search:performed',
      title: `Searched "${query}"`,
      description: `${resultCount} results`,
      target: query,
      undoable: false,
      metadata: { resultCount }
    });
  }

  recordNavigation(from: string, to: string): string {
    return this.recordEvent({
      type: 'navigation:changed',
      title: `Navigated to ${to}`,
      oldValue: from,
      newValue: to,
      undoable: false
    });
  }

  private recordSessionStart(): void {
    this.recordEvent({
      type: 'session:started',
      title: 'Session started',
      undoable: false
    });
  }

  // -------------------------------------------------------------------------
  // UNDO
  // -------------------------------------------------------------------------

  async undoEvent(id: string): Promise<{ success: boolean; error?: string }> {
    const event = this.events.find(e => e.id === id);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    if (!event.undoable || !event.undoData) {
      return { success: false, error: 'Event cannot be undone' };
    }

    try {
      // Emit undo request for handlers to process
      this.emit('undo:request', event);

      // Record the undo action
      this.recordEvent({
        type: event.type,
        title: `Undid: ${event.title}`,
        target: event.target,
        oldValue: event.newValue,
        newValue: event.oldValue,
        undoable: false
      });

      log.info(`[History] Undid event: ${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Undo failed' };
    }
  }

  // -------------------------------------------------------------------------
  // DATA ACCESS
  // -------------------------------------------------------------------------

  getEvent(id: string): HistoryEvent | null {
    return this.events.find(e => e.id === id) || null;
  }

  getEvents(filter?: HistoryFilter): HistoryEvent[] {
    let results = [...this.events];

    if (!filter) return results;

    if (filter.types && filter.types.length > 0) {
      results = results.filter(e => filter.types!.includes(e.type));
    }

    if (filter.startTime) {
      results = results.filter(e => e.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      results = results.filter(e => e.timestamp <= filter.endTime!);
    }

    if (filter.search) {
      const search = filter.search.toLowerCase();
      results = results.filter(e => 
        e.title.toLowerCase().includes(search) ||
        e.description?.toLowerCase().includes(search) ||
        e.target?.toLowerCase().includes(search)
      );
    }

    if (filter.target) {
      results = results.filter(e => e.target === filter.target);
    }

    if (filter.undoableOnly) {
      results = results.filter(e => e.undoable);
    }

    return results;
  }

  getRecentEvents(limit: number = 20): HistoryEvent[] {
    return this.events.slice(0, limit);
  }

  getEventsByType(type: HistoryEventType): HistoryEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getStats(): HistoryStats {
    const eventsByType: Record<string, number> = {};
    let undoableCount = 0;

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      if (event.undoable) undoableCount++;
    }

    return {
      totalEvents: this.events.length,
      eventsByType,
      oldestEvent: this.events[this.events.length - 1]?.timestamp,
      newestEvent: this.events[0]?.timestamp,
      undoableCount
    };
  }

  // -------------------------------------------------------------------------
  // CLEAR & EXPORT
  // -------------------------------------------------------------------------

  clearHistory(before?: number): { cleared: number } {
    const initialCount = this.events.length;

    if (before) {
      this.events = this.events.filter(e => e.timestamp >= before);
    } else {
      this.events = [];
    }

    const cleared = initialCount - this.events.length;
    this.markDirty();

    log.info(`[History] Cleared ${cleared} events`);
    return { cleared };
  }

  async exportHistory(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = JSON.stringify(this.events, null, 2);
      await fs.writeFile(filePath, data, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadHistory(): Promise<void> {
    if (!this.config.persistHistory) return;

    try {
      const historyPath = path.join(app.getPath('userData'), this.config.historyFile);
      const data = await fs.readFile(historyPath, 'utf8');
      this.events = JSON.parse(data);
      log.info(`[History] Loaded ${this.events.length} events from disk`);
    } catch {
      // File doesn't exist or is invalid - start fresh
      this.events = [];
    }
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return;

    this.saveTimeout = setTimeout(() => {
      this.saveHistory();
      this.saveTimeout = null;
    }, 5000); // Save after 5 seconds of inactivity
  }

  private async saveHistory(): Promise<void> {
    if (!this.config.persistHistory || !this.dirty) return;

    try {
      const historyPath = path.join(app.getPath('userData'), this.config.historyFile);
      const data = JSON.stringify(this.events.slice(0, this.config.maxEvents));
      await fs.writeFile(historyPath, data, 'utf8');
      this.dirty = false;
    } catch (error) {
      log.error('[History] Failed to save:', error);
    }
  }

  // -------------------------------------------------------------------------
  // BROADCASTING
  // -------------------------------------------------------------------------

  private broadcastEvent(event: HistoryEvent): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('history:event', event);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.recordEvent({
      type: 'session:ended',
      title: 'Session ended',
      undoable: false
    });

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    await this.saveHistory();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const ActivityHistoryTracker = new ActivityHistoryTrackerClass();
export default ActivityHistoryTracker;
