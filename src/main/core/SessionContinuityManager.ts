// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 7: Session & Context Continuity (FULL STATE)
// ===========================================================================
// Dex should snapshot and restore EVERYTHING:
// Tabs, windows, files, scroll positions, sidebar state, terminal state.
// No more "where was I?" User picks up exactly where they left off.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface TabState {
  id: string;
  url?: string;
  title: string;
  filePath?: string;
  scrollPosition?: { x: number; y: number };
  cursorPosition?: { line: number; column: number };
  selection?: { start: number; end: number };
  isActive: boolean;
  isPinned: boolean;
  order: number;
}

export interface WindowState {
  id: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized: boolean;
  isMinimized: boolean;
  isFullScreen: boolean;
  display?: string;  // Which display/monitor
}

export interface SidebarState {
  isOpen: boolean;
  width: number;
  activePanel?: string;
  expandedSections: string[];
  scrollPosition: number;
}

export interface TerminalState {
  id: string;
  name: string;
  cwd: string;
  shellType: string;
  scrollback?: string[];  // Recent command history
  isActive: boolean;
}

export interface PanelState {
  id: string;
  type: string;
  isOpen: boolean;
  height?: number;
  width?: number;
  position?: 'bottom' | 'right' | 'left';
}

export interface UnsavedChange {
  filePath: string;
  content: string;
  originalContent: string;
  lastModified: number;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  
  // Core state
  tabs: TabState[];
  windows: WindowState[];
  sidebar: SidebarState;
  terminals: TerminalState[];
  panels: PanelState[];
  
  // Active context
  activeTabId?: string;
  activeWindowId?: string;
  activeIntentId?: string;
  
  // Unsaved work protection
  unsavedChanges: UnsavedChange[];
  
  // Metadata
  metadata: {
    appVersion: string;
    capturedBy: 'auto' | 'manual' | 'crash-recovery' | 'intent-switch';
    duration?: number;  // How long this session lasted
    fileCount: number;
    hasUnsavedChanges: boolean;
  };
}

export interface SessionRestorePreview {
  snapshot: SessionSnapshot;
  
  // What will be restored
  restoredItems: Array<{
    type: 'tab' | 'window' | 'terminal' | 'unsaved-file';
    description: string;
    canRestore: boolean;
    warningOrError?: string;
  }>;
  
  // Conflicts
  conflicts: Array<{
    type: 'file-modified' | 'file-deleted' | 'tab-exists';
    description: string;
    resolution: 'skip' | 'replace' | 'merge' | 'ask';
  }>;
  
  warnings: string[];
  canProceed: boolean;
}

// ===========================================================================
// SESSION CONTINUITY MANAGER
// ===========================================================================

class SessionContinuityManagerClass extends EventEmitter {
  private snapshots: Map<string, SessionSnapshot> = new Map();
  private currentState: Partial<SessionSnapshot> = {};
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Auto-save settings
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
  private readonly MAX_SNAPSHOTS = 50;
  private readonly MAX_AUTO_SNAPSHOTS = 20;
  
  // Crash recovery
  private crashRecoveryPath: string;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'sessions');
    this.crashRecoveryPath = path.join(this.dataPath, 'crash-recovery.json');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadSnapshots();
    await this.checkCrashRecovery();
    this.registerIPCHandlers();
    this.startAutoSave();

    this.isInitialized = true;
    log.info('[SessionContinuity] Session continuity manager initialized');
  }

  shutdown(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Take final snapshot for next launch
    this.captureSnapshot('Last Session', 'auto');
    this.saveCrashRecovery();
    
    this.removeAllListeners();
    log.info('[SessionContinuity] Session continuity manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadSnapshots(): Promise<void> {
    try {
      const indexPath = path.join(this.dataPath, 'index.json');
      if (fs.existsSync(indexPath)) {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const snapshotMeta of data.snapshots || []) {
          const snapshotPath = path.join(this.dataPath, `${snapshotMeta.id}.json`);
          if (fs.existsSync(snapshotPath)) {
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
            this.snapshots.set(snapshot.id, snapshot);
          }
        }
      }
      log.info(`[SessionContinuity] Loaded ${this.snapshots.size} session snapshots`);
    } catch (error) {
      log.error('[SessionContinuity] Failed to load snapshots:', error);
    }
  }

  private saveSnapshotIndex(): void {
    try {
      const indexPath = path.join(this.dataPath, 'index.json');
      const index = Array.from(this.snapshots.values()).map(s => ({
        id: s.id,
        name: s.name,
        timestamp: s.timestamp,
        capturedBy: s.metadata.capturedBy,
      }));
      fs.writeFileSync(indexPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        snapshots: index,
      }, null, 2));
    } catch (error) {
      log.error('[SessionContinuity] Failed to save index:', error);
    }
  }

  private saveSnapshot(snapshot: SessionSnapshot): void {
    try {
      const snapshotPath = path.join(this.dataPath, `${snapshot.id}.json`);
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
      this.saveSnapshotIndex();
    } catch (error) {
      log.error('[SessionContinuity] Failed to save snapshot:', error);
    }
  }

  private async checkCrashRecovery(): Promise<void> {
    if (fs.existsSync(this.crashRecoveryPath)) {
      try {
        const recovery = JSON.parse(fs.readFileSync(this.crashRecoveryPath, 'utf-8'));
        if (recovery.timestamp && recovery.state) {
          // Create a recovery snapshot
          const snapshot: SessionSnapshot = {
            id: crypto.randomUUID(),
            name: 'Crash Recovery',
            description: 'Session recovered after unexpected close',
            timestamp: recovery.timestamp,
            ...recovery.state,
            metadata: {
              appVersion: app.getVersion(),
              capturedBy: 'crash-recovery',
              fileCount: recovery.state.tabs?.length || 0,
              hasUnsavedChanges: recovery.state.unsavedChanges?.length > 0,
            },
          };
          
          this.snapshots.set(snapshot.id, snapshot);
          this.saveSnapshot(snapshot);
          
          log.info('[SessionContinuity] Crash recovery data found and saved');
          this.emit('crash-recovery-available', snapshot);
        }
      } catch (error) {
        log.warn('[SessionContinuity] Failed to process crash recovery:', error);
      }
      
      // Remove crash recovery file
      fs.unlinkSync(this.crashRecoveryPath);
    }
  }

  private saveCrashRecovery(): void {
    try {
      const state = this.getCurrentState();
      fs.writeFileSync(this.crashRecoveryPath, JSON.stringify({
        timestamp: Date.now(),
        state,
      }, null, 2));
    } catch (error) {
      log.warn('[SessionContinuity] Failed to save crash recovery:', error);
    }
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.captureSnapshot('Auto Save', 'auto');
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  // -------------------------------------------------------------------------
  // STATE TRACKING
  // -------------------------------------------------------------------------

  /**
   * Update current tab state
   */
  updateTabState(tabs: TabState[]): void {
    this.currentState.tabs = tabs;
    this.emit('state-updated', { type: 'tabs', data: tabs });
  }

  /**
   * Update window state
   */
  updateWindowState(windows: WindowState[]): void {
    this.currentState.windows = windows;
    this.emit('state-updated', { type: 'windows', data: windows });
  }

  /**
   * Update sidebar state
   */
  updateSidebarState(sidebar: SidebarState): void {
    this.currentState.sidebar = sidebar;
    this.emit('state-updated', { type: 'sidebar', data: sidebar });
  }

  /**
   * Update terminal state
   */
  updateTerminalState(terminals: TerminalState[]): void {
    this.currentState.terminals = terminals;
    this.emit('state-updated', { type: 'terminals', data: terminals });
  }

  /**
   * Update panel state
   */
  updatePanelState(panels: PanelState[]): void {
    this.currentState.panels = panels;
    this.emit('state-updated', { type: 'panels', data: panels });
  }

  /**
   * Track unsaved changes
   */
  trackUnsavedChange(change: UnsavedChange): void {
    if (!this.currentState.unsavedChanges) {
      this.currentState.unsavedChanges = [];
    }
    
    // Update or add
    const existingIndex = this.currentState.unsavedChanges.findIndex(
      c => c.filePath === change.filePath
    );
    
    if (existingIndex >= 0) {
      this.currentState.unsavedChanges[existingIndex] = change;
    } else {
      this.currentState.unsavedChanges.push(change);
    }
  }

  /**
   * Clear unsaved change tracking for a file
   */
  clearUnsavedChange(filePath: string): void {
    if (this.currentState.unsavedChanges) {
      this.currentState.unsavedChanges = this.currentState.unsavedChanges.filter(
        c => c.filePath !== filePath
      );
    }
  }

  /**
   * Set active context
   */
  setActiveContext(params: {
    activeTabId?: string;
    activeWindowId?: string;
    activeIntentId?: string;
  }): void {
    if (params.activeTabId) this.currentState.activeTabId = params.activeTabId;
    if (params.activeWindowId) this.currentState.activeWindowId = params.activeWindowId;
    if (params.activeIntentId) this.currentState.activeIntentId = params.activeIntentId;
  }

  /**
   * Get current state (for crash recovery)
   */
  private getCurrentState(): Partial<SessionSnapshot> {
    return {
      tabs: this.currentState.tabs || [],
      windows: this.currentState.windows || [],
      sidebar: this.currentState.sidebar,
      terminals: this.currentState.terminals || [],
      panels: this.currentState.panels || [],
      activeTabId: this.currentState.activeTabId,
      activeWindowId: this.currentState.activeWindowId,
      activeIntentId: this.currentState.activeIntentId,
      unsavedChanges: this.currentState.unsavedChanges || [],
    };
  }

  // -------------------------------------------------------------------------
  // SNAPSHOT CAPTURE
  // -------------------------------------------------------------------------

  /**
   * Capture a session snapshot
   */
  captureSnapshot(
    name: string,
    capturedBy: SessionSnapshot['metadata']['capturedBy'] = 'manual',
    description?: string
  ): SessionSnapshot {
    const state = this.getCurrentState();
    
    const snapshot: SessionSnapshot = {
      id: crypto.randomUUID(),
      name,
      description,
      timestamp: Date.now(),
      tabs: state.tabs || [],
      windows: state.windows || [],
      sidebar: state.sidebar || {
        isOpen: true,
        width: 300,
        expandedSections: [],
        scrollPosition: 0,
      },
      terminals: state.terminals || [],
      panels: state.panels || [],
      activeTabId: state.activeTabId,
      activeWindowId: state.activeWindowId,
      activeIntentId: state.activeIntentId,
      unsavedChanges: state.unsavedChanges || [],
      metadata: {
        appVersion: app.getVersion(),
        capturedBy,
        fileCount: (state.tabs || []).filter(t => t.filePath).length,
        hasUnsavedChanges: (state.unsavedChanges || []).length > 0,
      },
    };

    this.snapshots.set(snapshot.id, snapshot);
    this.saveSnapshot(snapshot);
    this.cleanupOldSnapshots();

    this.emit('snapshot-captured', snapshot);
    log.info(`[SessionContinuity] Captured snapshot: ${name}`);

    return snapshot;
  }

  private cleanupOldSnapshots(): void {
    // Group by type
    const auto = Array.from(this.snapshots.values())
      .filter(s => s.metadata.capturedBy === 'auto')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const manual = Array.from(this.snapshots.values())
      .filter(s => s.metadata.capturedBy === 'manual')
      .sort((a, b) => b.timestamp - a.timestamp);

    // Clean auto snapshots
    if (auto.length > this.MAX_AUTO_SNAPSHOTS) {
      for (const snapshot of auto.slice(this.MAX_AUTO_SNAPSHOTS)) {
        this.deleteSnapshotFile(snapshot.id);
        this.snapshots.delete(snapshot.id);
      }
    }

    // Clean if total exceeds max
    if (this.snapshots.size > this.MAX_SNAPSHOTS) {
      const all = Array.from(this.snapshots.values())
        .filter(s => s.metadata.capturedBy === 'auto')  // Only auto-delete auto snapshots
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const toRemove = this.snapshots.size - this.MAX_SNAPSHOTS;
      for (let i = 0; i < toRemove && i < all.length; i++) {
        this.deleteSnapshotFile(all[i].id);
        this.snapshots.delete(all[i].id);
      }
    }

    this.saveSnapshotIndex();
  }

  private deleteSnapshotFile(snapshotId: string): void {
    const snapshotPath = path.join(this.dataPath, `${snapshotId}.json`);
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  }

  // -------------------------------------------------------------------------
  // SNAPSHOT RESTORE
  // -------------------------------------------------------------------------

  /**
   * Generate restore preview
   */
  generateRestorePreview(snapshotId: string): SessionRestorePreview | null {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return null;

    const restoredItems: SessionRestorePreview['restoredItems'] = [];
    const conflicts: SessionRestorePreview['conflicts'] = [];
    const warnings: string[] = [];

    // Check tabs
    for (const tab of snapshot.tabs) {
      if (tab.filePath) {
        const exists = fs.existsSync(tab.filePath);
        restoredItems.push({
          type: 'tab',
          description: `Open ${path.basename(tab.filePath)}`,
          canRestore: exists,
          warningOrError: exists ? undefined : 'File no longer exists',
        });

        if (!exists) {
          warnings.push(`File not found: ${tab.filePath}`);
        }
      } else if (tab.url) {
        restoredItems.push({
          type: 'tab',
          description: `Open ${tab.title || tab.url}`,
          canRestore: true,
        });
      }
    }

    // Check terminals
    for (const terminal of snapshot.terminals) {
      restoredItems.push({
        type: 'terminal',
        description: `Restore terminal: ${terminal.name || terminal.shellType}`,
        canRestore: true,
      });
    }

    // Check unsaved changes
    for (const unsaved of snapshot.unsavedChanges) {
      const exists = fs.existsSync(unsaved.filePath);
      if (exists) {
        const currentContent = fs.readFileSync(unsaved.filePath, 'utf-8');
        if (currentContent !== unsaved.originalContent) {
          conflicts.push({
            type: 'file-modified',
            description: `${path.basename(unsaved.filePath)} has been modified since snapshot`,
            resolution: 'ask',
          });
        }
      }
      
      restoredItems.push({
        type: 'unsaved-file',
        description: `Restore unsaved changes in ${path.basename(unsaved.filePath)}`,
        canRestore: true,
      });
    }

    // Check snapshot age
    const ageHours = (Date.now() - snapshot.timestamp) / (1000 * 60 * 60);
    if (ageHours > 24) {
      warnings.push(`This snapshot is ${Math.round(ageHours)} hours old`);
    }

    return {
      snapshot,
      restoredItems,
      conflicts,
      warnings,
      canProceed: restoredItems.some(r => r.canRestore),
    };
  }

  /**
   * Restore a session snapshot
   */
  async restoreSnapshot(
    snapshotId: string,
    options: {
      restoreTabs?: boolean;
      restoreWindows?: boolean;
      restoreTerminals?: boolean;
      restoreUnsavedChanges?: boolean;
      conflictResolution?: 'skip' | 'replace' | 'merge';
    } = {}
  ): Promise<{
    success: boolean;
    restoredCount: number;
    skippedCount: number;
    errors: string[];
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return { success: false, restoredCount: 0, skippedCount: 0, errors: ['Snapshot not found'] };
    }

    const opts = {
      restoreTabs: true,
      restoreWindows: true,
      restoreTerminals: true,
      restoreUnsavedChanges: true,
      conflictResolution: 'ask' as const,
      ...options,
    };

    let restoredCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Emit restore events (actual restoration is done by renderer/other systems)
    if (opts.restoreTabs) {
      for (const tab of snapshot.tabs) {
        try {
          if (tab.filePath && !fs.existsSync(tab.filePath)) {
            skippedCount++;
            continue;
          }
          this.emit('restore-tab', tab);
          restoredCount++;
        } catch (error) {
          errors.push(`Failed to restore tab: ${tab.title}`);
        }
      }
    }

    if (opts.restoreWindows) {
      for (const window of snapshot.windows) {
        this.emit('restore-window', window);
        restoredCount++;
      }
    }

    if (opts.restoreTerminals) {
      for (const terminal of snapshot.terminals) {
        this.emit('restore-terminal', terminal);
        restoredCount++;
      }
    }

    if (opts.restoreUnsavedChanges) {
      for (const unsaved of snapshot.unsavedChanges) {
        this.emit('restore-unsaved-change', {
          ...unsaved,
          conflictResolution: opts.conflictResolution,
        });
        restoredCount++;
      }
    }

    // Restore sidebar and panels
    if (snapshot.sidebar) {
      this.emit('restore-sidebar', snapshot.sidebar);
    }

    if (snapshot.panels) {
      for (const panel of snapshot.panels) {
        this.emit('restore-panel', panel);
      }
    }

    // Set active context
    this.emit('restore-active-context', {
      activeTabId: snapshot.activeTabId,
      activeWindowId: snapshot.activeWindowId,
      activeIntentId: snapshot.activeIntentId,
    });

    log.info(`[SessionContinuity] Restored snapshot: ${snapshot.name} (${restoredCount} items)`);

    return {
      success: errors.length === 0,
      restoredCount,
      skippedCount,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get all snapshots (sorted by timestamp)
   */
  getAllSnapshots(): SessionSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): SessionSnapshot | null {
    return this.snapshots.get(snapshotId) || null;
  }

  /**
   * Get recent auto snapshots
   */
  getAutoSnapshots(limit: number = 10): SessionSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter(s => s.metadata.capturedBy === 'auto')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get manual snapshots
   */
  getManualSnapshots(): SessionSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter(s => s.metadata.capturedBy === 'manual')
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(snapshotId: string): boolean {
    if (!this.snapshots.has(snapshotId)) return false;
    
    this.deleteSnapshotFile(snapshotId);
    this.snapshots.delete(snapshotId);
    this.saveSnapshotIndex();

    this.emit('snapshot-deleted', snapshotId);
    return true;
  }

  /**
   * Rename a snapshot
   */
  renameSnapshot(snapshotId: string, newName: string): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;

    snapshot.name = newName;
    this.saveSnapshot(snapshot);
    
    return true;
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // State updates
    ipcMain.handle('session:updateTabs', (_, tabs) => {
      this.updateTabState(tabs);
      return true;
    });
    
    ipcMain.handle('session:updateWindows', (_, windows) => {
      this.updateWindowState(windows);
      return true;
    });
    
    ipcMain.handle('session:updateSidebar', (_, sidebar) => {
      this.updateSidebarState(sidebar);
      return true;
    });
    
    ipcMain.handle('session:updateTerminals', (_, terminals) => {
      this.updateTerminalState(terminals);
      return true;
    });
    
    ipcMain.handle('session:updatePanels', (_, panels) => {
      this.updatePanelState(panels);
      return true;
    });
    
    ipcMain.handle('session:trackUnsavedChange', (_, change) => {
      this.trackUnsavedChange(change);
      return true;
    });
    
    ipcMain.handle('session:clearUnsavedChange', (_, filePath) => {
      this.clearUnsavedChange(filePath);
      return true;
    });
    
    ipcMain.handle('session:setActiveContext', (_, context) => {
      this.setActiveContext(context);
      return true;
    });

    // Snapshot operations
    ipcMain.handle('session:captureSnapshot', (_, name, description) => 
      this.captureSnapshot(name, 'manual', description));
    
    ipcMain.handle('session:generateRestorePreview', (_, snapshotId) => 
      this.generateRestorePreview(snapshotId));
    
    ipcMain.handle('session:restoreSnapshot', async (_, snapshotId, options) => 
      this.restoreSnapshot(snapshotId, options));

    // Queries
    ipcMain.handle('session:getAllSnapshots', () => this.getAllSnapshots());
    ipcMain.handle('session:getSnapshot', (_, snapshotId) => this.getSnapshot(snapshotId));
    ipcMain.handle('session:getAutoSnapshots', (_, limit) => this.getAutoSnapshots(limit));
    ipcMain.handle('session:getManualSnapshots', () => this.getManualSnapshots());
    
    // Management
    ipcMain.handle('session:deleteSnapshot', (_, snapshotId) => this.deleteSnapshot(snapshotId));
    ipcMain.handle('session:renameSnapshot', (_, snapshotId, newName) => 
      this.renameSnapshot(snapshotId, newName));
  }
}

// Singleton instance
export const sessionContinuityManager = new SessionContinuityManagerClass();

export async function initializeSessionContinuity(): Promise<void> {
  return sessionContinuityManager.initialize();
}

export function shutdownSessionContinuity(): void {
  sessionContinuityManager.shutdown();
}
