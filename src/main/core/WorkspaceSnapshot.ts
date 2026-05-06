// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Workspace Snapshot System
// Full workspace snapshot and restore (state-based, lightweight)
// Session resume after crash, reboot, or forced quit
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface WindowState {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
}

export interface TabState {
  id: string;
  type: 'file' | 'note' | 'code' | 'media' | 'page';
  path?: string;
  title: string;
  scrollPosition?: number;
  cursorPosition?: { line: number; column: number };
  selection?: { start: number; end: number };
  isActive: boolean;
  isPinned: boolean;
}

export interface PanelState {
  id: string;
  type: 'sidebar' | 'files' | 'preview' | 'terminal' | 'search';
  isVisible: boolean;
  width?: number;
  height?: number;
  collapsed?: boolean;
}

export interface WorkspaceState {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  version: number;
  windows: WindowState[];
  tabs: TabState[];
  panels: PanelState[];
  activePath?: string;
  recentFiles: string[];
  expandedFolders: string[];
  searchHistory: string[];
  customData: Record<string, unknown>;
}

export interface Snapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  state: WorkspaceState;
  isAutoSave: boolean;
  sizeBytes: number;
}

export interface SnapshotConfig {
  maxSnapshots: number;
  autoSaveInterval: number;      // 0 = disabled
  autoSaveOnClose: boolean;
  compressSnapshots: boolean;
  snapshotPath: string;
}

// ===========================================================================
// WORKSPACE SNAPSHOT SYSTEM
// ===========================================================================

class WorkspaceSnapshotClass extends EventEmitter {
  private config: SnapshotConfig;
  private snapshots: Map<string, Snapshot> = new Map();
  private currentState: WorkspaceState | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;
  private snapshotIdCounter = 0;

  constructor() {
    super();
    this.config = {
      maxSnapshots: 20,
      autoSaveInterval: 60000,  // 1 minute
      autoSaveOnClose: true,
      compressSnapshots: false,
      snapshotPath: ''
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.config.snapshotPath = path.join(app.getPath('userData'), 'snapshots');
    
    try {
      await fs.mkdir(this.config.snapshotPath, { recursive: true });
      await this.loadSnapshots();
      this.startAutoSave();
      log.info(`[Snapshot] Initialized with ${this.snapshots.size} snapshots`);
    } catch (error) {
      log.error('[Snapshot] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Create snapshot
    ipcMain.handle('snapshot:create', async (_event, name: string, description?: string) => {
      return this.createSnapshot(name, description);
    });

    // List snapshots
    ipcMain.handle('snapshot:list', () => {
      return this.listSnapshots();
    });

    // Get snapshot
    ipcMain.handle('snapshot:get', (_event, id: string) => {
      return this.getSnapshot(id);
    });

    // Restore snapshot
    ipcMain.handle('snapshot:restore', async (_event, id: string) => {
      return this.restoreSnapshot(id);
    });

    // Delete snapshot
    ipcMain.handle('snapshot:delete', async (_event, id: string) => {
      return this.deleteSnapshot(id);
    });

    // Update current state from renderer
    ipcMain.handle('snapshot:updateState', (_event, partialState: Partial<WorkspaceState>) => {
      this.updateCurrentState(partialState);
      return { success: true };
    });

    // Get current state
    ipcMain.handle('snapshot:currentState', () => {
      return this.currentState;
    });

    // Get last session (for crash recovery)
    ipcMain.handle('snapshot:lastSession', () => {
      return this.getLastSession();
    });

    // Configure
    ipcMain.handle('snapshot:configure', (_event, config: Partial<SnapshotConfig>) => {
      this.configure(config);
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  updateCurrentState(partialState: Partial<WorkspaceState>): void {
    if (!this.currentState) {
      this.currentState = this.createEmptyState();
    }

    this.currentState = {
      ...this.currentState,
      ...partialState,
      modifiedAt: Date.now()
    };
    this.isDirty = true;
    this.emit('state:updated', this.currentState);
  }

  getCurrentState(): WorkspaceState | null {
    return this.currentState;
  }

  private createEmptyState(): WorkspaceState {
    return {
      id: this.generateId(),
      name: 'Default',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      version: 1,
      windows: [],
      tabs: [],
      panels: [],
      recentFiles: [],
      expandedFolders: [],
      searchHistory: [],
      customData: {}
    };
  }

  // -------------------------------------------------------------------------
  // SNAPSHOT OPERATIONS
  // -------------------------------------------------------------------------

  async createSnapshot(name: string, description?: string, isAutoSave = false): Promise<Snapshot> {
    const state = this.currentState || this.createEmptyState();
    const stateJson = JSON.stringify(state);
    
    const snapshot: Snapshot = {
      id: this.generateId(),
      name,
      description,
      createdAt: Date.now(),
      state: JSON.parse(stateJson), // Deep copy
      isAutoSave,
      sizeBytes: stateJson.length
    };

    this.snapshots.set(snapshot.id, snapshot);
    await this.saveSnapshotToDisk(snapshot);
    await this.enforceSnapshotLimit();
    
    this.emit('snapshot:created', snapshot);
    log.info(`[Snapshot] Created: ${name} (${snapshot.id})`);
    
    return snapshot;
  }

  listSnapshots(): Snapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getSnapshot(id: string): Snapshot | null {
    return this.snapshots.get(id) || null;
  }

  async restoreSnapshot(id: string): Promise<{ success: boolean; error?: string }> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      return { success: false, error: 'Snapshot not found' };
    }

    try {
      // Save current state before restore
      if (this.currentState && this.isDirty) {
        await this.createSnapshot('Pre-Restore Backup', 'Auto-saved before restore', true);
      }

      // Restore state
      this.currentState = JSON.parse(JSON.stringify(snapshot.state));
      this.isDirty = false;

      // Notify renderer to apply state
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('snapshot:restored', this.currentState);
        }
      }

      this.emit('snapshot:restored', snapshot);
      log.info(`[Snapshot] Restored: ${snapshot.name}`);
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('[Snapshot] Restore failed:', error);
      return { success: false, error: errorMsg };
    }
  }

  async deleteSnapshot(id: string): Promise<{ success: boolean }> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      return { success: false };
    }

    this.snapshots.delete(id);
    
    try {
      const filePath = path.join(this.config.snapshotPath, `${id}.json`);
      await fs.unlink(filePath);
    } catch { /* File may not exist */ }

    this.emit('snapshot:deleted', id);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SESSION RECOVERY
  // -------------------------------------------------------------------------

  getLastSession(): Snapshot | null {
    const snapshots = this.listSnapshots();
    return snapshots.find(s => s.isAutoSave) || snapshots[0] || null;
  }

  async saveSessionState(): Promise<void> {
    if (!this.currentState || !this.isDirty) return;

    try {
      await this.createSnapshot('Auto-Save', 'Session auto-save', true);
      this.isDirty = false;
    } catch (error) {
      log.error('[Snapshot] Session save failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // AUTO-SAVE
  // -------------------------------------------------------------------------

  private startAutoSave(): void {
    if (this.config.autoSaveInterval <= 0) return;
    
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveSessionState();
      }
    }, this.config.autoSaveInterval);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadSnapshots(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.snapshotPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.config.snapshotPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const snapshot = JSON.parse(content) as Snapshot;
          this.snapshots.set(snapshot.id, snapshot);
        } catch (error) {
          log.warn(`[Snapshot] Failed to load ${file}:`, error);
        }
      }
    } catch (error) {
      log.warn('[Snapshot] Failed to load snapshots:', error);
    }
  }

  private async saveSnapshotToDisk(snapshot: Snapshot): Promise<void> {
    const filePath = path.join(this.config.snapshotPath, `${snapshot.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  }

  private async enforceSnapshotLimit(): Promise<void> {
    const snapshots = this.listSnapshots();
    const autoSaves = snapshots.filter(s => s.isAutoSave);
    const manualSaves = snapshots.filter(s => !s.isAutoSave);

    // Keep max auto-saves (half of limit)
    const maxAutoSaves = Math.floor(this.config.maxSnapshots / 2);
    if (autoSaves.length > maxAutoSaves) {
      const toDelete = autoSaves.slice(maxAutoSaves);
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }

    // Keep max manual saves
    const maxManualSaves = this.config.maxSnapshots - maxAutoSaves;
    if (manualSaves.length > maxManualSaves) {
      const toDelete = manualSaves.slice(maxManualSaves);
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  configure(config: Partial<SnapshotConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.autoSaveInterval !== undefined) {
      this.startAutoSave();
    }
  }

  // -------------------------------------------------------------------------
  // CAPTURE WINDOW STATE
  // -------------------------------------------------------------------------

  captureWindowStates(): WindowState[] {
    const windows = BrowserWindow.getAllWindows();
    return windows.map(win => ({
      id: win.id.toString(),
      bounds: win.getBounds(),
      isMaximized: win.isMaximized(),
      isMinimized: win.isMinimized(),
      isFullscreen: win.isFullScreen()
    }));
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `snap-${++this.snapshotIdCounter}-${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.stopAutoSave();
    
    if (this.config.autoSaveOnClose && this.isDirty) {
      await this.saveSessionState();
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const WorkspaceSnapshot = new WorkspaceSnapshotClass();
export default WorkspaceSnapshot;
