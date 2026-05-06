// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Global Undo History
// Global undo history across files, actions, and workflows
// Activity replay (chronological, filterable)
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type UndoActionType = 
  | 'file_create' | 'file_delete' | 'file_rename' | 'file_move' | 'file_copy' | 'file_modify'
  | 'folder_create' | 'folder_delete' | 'folder_rename' | 'folder_move'
  | 'note_create' | 'note_delete' | 'note_modify'
  | 'task_create' | 'task_delete' | 'task_complete' | 'task_modify'
  | 'action_run' | 'workflow_run'
  | 'settings_change'
  | 'batch_operation';

export type UndoStatus = 'pending' | 'undone' | 'redone' | 'expired' | 'failed';

export interface UndoEntry {
  id: string;
  type: UndoActionType;
  description: string;
  timestamp: number;
  status: UndoStatus;
  
  // What to store for undo
  undoData: {
    type: 'file_restore' | 'file_delete' | 'file_rename' | 'state_restore' | 'custom';
    originalPath?: string;
    newPath?: string;
    backupPath?: string;
    originalContent?: string;
    originalState?: unknown;
    customHandler?: string;
  };
  
  // Metadata
  affectedPaths: string[];
  canUndo: boolean;
  canRedo: boolean;
  groupId?: string;         // For batch operations
  parentId?: string;        // For nested operations
  expiresAt?: number;       // Auto-cleanup
}

export interface UndoGroup {
  id: string;
  name: string;
  entries: string[];        // Entry IDs
  timestamp: number;
  isComplete: boolean;
}

export interface UndoConfig {
  maxEntries: number;
  maxBackupSizeMB: number;
  backupRetentionHours: number;
  enableFileBackups: boolean;
  backupPath: string;
}

export interface UndoFilter {
  types?: UndoActionType[];
  startTime?: number;
  endTime?: number;
  status?: UndoStatus[];
  paths?: string[];
  limit?: number;
}

// ===========================================================================
// GLOBAL UNDO HISTORY
// ===========================================================================

class GlobalUndoHistoryClass extends EventEmitter {
  private config: UndoConfig;
  private entries: Map<string, UndoEntry> = new Map();
  private groups: Map<string, UndoGroup> = new Map();
  private undoStack: string[] = [];   // Entry IDs in order
  private redoStack: string[] = [];
  private entryIdCounter = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = {
      maxEntries: 500,
      maxBackupSizeMB: 100,
      backupRetentionHours: 24,
      enableFileBackups: true,
      backupPath: ''
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.config.backupPath = path.join(app.getPath('userData'), 'undo-backups');
    
    try {
      await fs.mkdir(this.config.backupPath, { recursive: true });
      this.startCleanupTimer();
      log.info('[GlobalUndo] Initialized');
    } catch (error) {
      log.error('[GlobalUndo] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Record action
    ipcMain.handle('undo:record', async (_event, type: UndoActionType, description: string, undoData: UndoEntry['undoData'], affectedPaths: string[]) => {
      return this.recordAction(type, description, undoData, affectedPaths);
    });

    // Undo last action
    ipcMain.handle('undo:undo', async () => {
      return this.undo();
    });

    // Redo last undone action
    ipcMain.handle('undo:redo', async () => {
      return this.redo();
    });

    // Undo specific entry
    ipcMain.handle('undo:undoEntry', async (_event, entryId: string) => {
      return this.undoEntry(entryId);
    });

    // Get history
    ipcMain.handle('undo:history', (_event, filter?: UndoFilter) => {
      return this.getHistory(filter);
    });

    // Get undo/redo status
    ipcMain.handle('undo:status', () => {
      return this.getStatus();
    });

    // Clear history
    ipcMain.handle('undo:clear', async () => {
      return this.clearHistory();
    });

    // Start group
    ipcMain.handle('undo:startGroup', (_event, name: string) => {
      return this.startGroup(name);
    });

    // End group
    ipcMain.handle('undo:endGroup', (_event, groupId: string) => {
      return this.endGroup(groupId);
    });

    // Get activity timeline
    ipcMain.handle('undo:timeline', (_event, filter?: UndoFilter) => {
      return this.getTimeline(filter);
    });
  }

  // -------------------------------------------------------------------------
  // RECORDING
  // -------------------------------------------------------------------------

  async recordAction(
    type: UndoActionType,
    description: string,
    undoData: UndoEntry['undoData'],
    affectedPaths: string[] = []
  ): Promise<UndoEntry> {
    const entry: UndoEntry = {
      id: this.generateId(),
      type,
      description,
      timestamp: Date.now(),
      status: 'pending',
      undoData,
      affectedPaths,
      canUndo: true,
      canRedo: false,
      expiresAt: Date.now() + (this.config.backupRetentionHours * 60 * 60 * 1000)
    };

    // Backup file if needed
    if (this.config.enableFileBackups && undoData.originalPath) {
      await this.createBackup(entry);
    }

    this.entries.set(entry.id, entry);
    this.undoStack.push(entry.id);
    this.redoStack = []; // Clear redo stack on new action

    await this.enforceLimit();
    
    this.emit('action:recorded', entry);
    this.notifyRenderers();
    
    return entry;
  }

  // Convenience methods for common actions
  async recordFileCreate(filePath: string): Promise<UndoEntry> {
    return this.recordAction('file_create', `Created ${path.basename(filePath)}`, {
      type: 'file_delete',
      originalPath: filePath
    }, [filePath]);
  }

  async recordFileDelete(filePath: string, content?: string): Promise<UndoEntry> {
    return this.recordAction('file_delete', `Deleted ${path.basename(filePath)}`, {
      type: 'file_restore',
      originalPath: filePath,
      originalContent: content
    }, [filePath]);
  }

  async recordFileRename(oldPath: string, newPath: string): Promise<UndoEntry> {
    return this.recordAction('file_rename', `Renamed ${path.basename(oldPath)} ${path.basename(newPath)}`, {
      type: 'file_rename',
      originalPath: oldPath,
      newPath: newPath
    }, [oldPath, newPath]);
  }

  async recordFileModify(filePath: string, originalContent: string): Promise<UndoEntry> {
    return this.recordAction('file_modify', `Modified ${path.basename(filePath)}`, {
      type: 'file_restore',
      originalPath: filePath,
      originalContent
    }, [filePath]);
  }

  // -------------------------------------------------------------------------
  // UNDO / REDO
  // -------------------------------------------------------------------------

  async undo(): Promise<{ success: boolean; entry?: UndoEntry; error?: string }> {
    if (this.undoStack.length === 0) {
      return { success: false, error: 'Nothing to undo' };
    }

    const entryId = this.undoStack.pop()!;
    return this.undoEntry(entryId);
  }

  async undoEntry(entryId: string): Promise<{ success: boolean; entry?: UndoEntry; error?: string }> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }

    if (!entry.canUndo) {
      return { success: false, error: 'Cannot undo this action' };
    }

    try {
      await this.executeUndo(entry);
      
      entry.status = 'undone';
      entry.canUndo = false;
      entry.canRedo = true;
      
      // Remove from undo stack if present
      const undoIndex = this.undoStack.indexOf(entryId);
      if (undoIndex >= 0) {
        this.undoStack.splice(undoIndex, 1);
      }
      
      this.redoStack.push(entryId);
      
      this.emit('action:undone', entry);
      this.notifyRenderers();
      
      return { success: true, entry };
    } catch (error) {
      entry.status = 'failed';
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[GlobalUndo] Undo failed for ${entryId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async redo(): Promise<{ success: boolean; entry?: UndoEntry; error?: string }> {
    if (this.redoStack.length === 0) {
      return { success: false, error: 'Nothing to redo' };
    }

    const entryId = this.redoStack.pop()!;
    const entry = this.entries.get(entryId);
    
    if (!entry || !entry.canRedo) {
      return { success: false, error: 'Cannot redo this action' };
    }

    try {
      await this.executeRedo(entry);
      
      entry.status = 'redone';
      entry.canUndo = true;
      entry.canRedo = false;
      
      this.undoStack.push(entryId);
      
      this.emit('action:redone', entry);
      this.notifyRenderers();
      
      return { success: true, entry };
    } catch (error) {
      entry.status = 'failed';
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[GlobalUndo] Redo failed for ${entryId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  private async executeUndo(entry: UndoEntry): Promise<void> {
    const { undoData } = entry;

    switch (undoData.type) {
      case 'file_restore':
        if (undoData.originalPath && undoData.backupPath) {
          await fs.copyFile(undoData.backupPath, undoData.originalPath);
        } else if (undoData.originalPath && undoData.originalContent) {
          await fs.writeFile(undoData.originalPath, undoData.originalContent);
        }
        break;

      case 'file_delete':
        if (undoData.originalPath) {
          await fs.unlink(undoData.originalPath);
        }
        break;

      case 'file_rename':
        if (undoData.newPath && undoData.originalPath) {
          await fs.rename(undoData.newPath, undoData.originalPath);
        }
        break;

      case 'state_restore':
        // Emit for renderer to handle
        this.emit('state:restore', undoData.originalState);
        break;

      case 'custom':
        this.emit('custom:undo', entry);
        break;
    }
  }

  private async executeRedo(entry: UndoEntry): Promise<void> {
    const { undoData } = entry;

    switch (undoData.type) {
      case 'file_restore':
        // Re-modify the file (restore original change)
        if (undoData.originalPath && undoData.backupPath) {
          // Create new backup of current state
          const content = await fs.readFile(undoData.originalPath);
          await fs.writeFile(undoData.backupPath + '.redo', content);
        }
        break;

      case 'file_delete':
        // Re-create the file
        if (undoData.originalPath && entry.undoData.originalContent) {
          // File was restored by undo, would need original content to redo create
          // This is a limitation - we'd need to track more state
        }
        break;

      case 'file_rename':
        if (undoData.originalPath && undoData.newPath) {
          await fs.rename(undoData.originalPath, undoData.newPath);
        }
        break;

      case 'state_restore':
        this.emit('state:redo', undoData.originalState);
        break;

      case 'custom':
        this.emit('custom:redo', entry);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // BACKUP MANAGEMENT
  // -------------------------------------------------------------------------

  private async createBackup(entry: UndoEntry): Promise<void> {
    if (!entry.undoData.originalPath) return;

    try {
      const backupPath = path.join(this.config.backupPath, `${entry.id}.backup`);
      await fs.copyFile(entry.undoData.originalPath, backupPath);
      entry.undoData.backupPath = backupPath;
    } catch (error) {
      // File might not exist yet (for create operations)
      log.debug(`[GlobalUndo] No backup needed for ${entry.id}:`, error);
    }
  }

  // -------------------------------------------------------------------------
  // GROUPS (Batch Operations)
  // -------------------------------------------------------------------------

  startGroup(name: string): UndoGroup {
    const group: UndoGroup = {
      id: `group-${Date.now()}`,
      name,
      entries: [],
      timestamp: Date.now(),
      isComplete: false
    };
    this.groups.set(group.id, group);
    return group;
  }

  endGroup(groupId: string): UndoGroup | null {
    const group = this.groups.get(groupId);
    if (group) {
      group.isComplete = true;
    }
    return group || null;
  }

  // -------------------------------------------------------------------------
  // HISTORY & TIMELINE
  // -------------------------------------------------------------------------

  getHistory(filter?: UndoFilter): UndoEntry[] {
    let entries = Array.from(this.entries.values());

    if (filter) {
      if (filter.types?.length) {
        entries = entries.filter(e => filter.types!.includes(e.type));
      }
      if (filter.startTime) {
        entries = entries.filter(e => e.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        entries = entries.filter(e => e.timestamp <= filter.endTime!);
      }
      if (filter.status?.length) {
        entries = entries.filter(e => filter.status!.includes(e.status));
      }
      if (filter.paths?.length) {
        entries = entries.filter(e => 
          e.affectedPaths.some(p => filter.paths!.some(fp => p.includes(fp)))
        );
      }
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  getTimeline(filter?: UndoFilter): Array<{
    timestamp: number;
    hour: string;
    entries: UndoEntry[];
  }> {
    const entries = this.getHistory(filter);
    const timeline: Map<string, UndoEntry[]> = new Map();

    for (const entry of entries) {
      const date = new Date(entry.timestamp);
      const hourKey = `${date.toDateString()} ${date.getHours()}:00`;
      
      if (!timeline.has(hourKey)) {
        timeline.set(hourKey, []);
      }
      timeline.get(hourKey)!.push(entry);
    }

    return Array.from(timeline.entries()).map(([hour, entries]) => ({
      timestamp: entries[0].timestamp,
      hour,
      entries
    }));
  }

  getStatus(): {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
    nextUndo?: { id: string; description: string };
    nextRedo?: { id: string; description: string };
  } {
    const nextUndoId = this.undoStack[this.undoStack.length - 1];
    const nextRedoId = this.redoStack[this.redoStack.length - 1];
    const nextUndo = nextUndoId ? this.entries.get(nextUndoId) : undefined;
    const nextRedo = nextRedoId ? this.entries.get(nextRedoId) : undefined;

    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      nextUndo: nextUndo ? { id: nextUndo.id, description: nextUndo.description } : undefined,
      nextRedo: nextRedo ? { id: nextRedo.id, description: nextRedo.description } : undefined
    };
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  async clearHistory(): Promise<{ success: boolean }> {
    // Delete all backups
    try {
      const files = await fs.readdir(this.config.backupPath);
      for (const file of files) {
        await fs.unlink(path.join(this.config.backupPath, file));
      }
    } catch { /* ignore */ }

    this.entries.clear();
    this.groups.clear();
    this.undoStack = [];
    this.redoStack = [];

    this.notifyRenderers();
    return { success: true };
  }

  private async enforceLimit(): Promise<void> {
    while (this.entries.size > this.config.maxEntries) {
      // Remove oldest entry
      const oldest = Array.from(this.entries.values())
        .sort((a, b) => a.timestamp - b.timestamp)[0];
      
      if (oldest) {
        await this.removeEntry(oldest.id);
      }
    }
  }

  private async removeEntry(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;

    // Delete backup
    if (entry.undoData.backupPath) {
      try {
        await fs.unlink(entry.undoData.backupPath);
      } catch { /* ignore */ }
    }

    this.entries.delete(id);
    
    // Remove from stacks
    this.undoStack = this.undoStack.filter(i => i !== id);
    this.redoStack = this.redoStack.filter(i => i !== id);
  }

  private startCleanupTimer(): void {
    // Cleanup expired entries every hour
    this.cleanupTimer = setInterval(async () => {
      const now = Date.now();
      const expired = Array.from(this.entries.values())
        .filter(e => e.expiresAt && e.expiresAt < now);
      
      for (const entry of expired) {
        await this.removeEntry(entry.id);
      }
    }, 60 * 60 * 1000);
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `undo-${++this.entryIdCounter}-${Date.now()}`;
  }

  private notifyRenderers(): void {
    const status = this.getStatus();
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('undo:statusChanged', status);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const GlobalUndoHistory = new GlobalUndoHistoryClass();
export default GlobalUndoHistory;
