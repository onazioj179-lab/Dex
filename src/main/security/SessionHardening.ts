// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Session & Navigation Hardening Layer
// Q1 Foundation & Trust: Harden tab, session, and navigation systems
// Zero tolerance for state corruption or orphaned processes
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, app, webContents } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface TabState {
  id: string;
  windowId: number;
  webContentsId: number;
  url: string;
  title: string;
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  memoryUsage?: number;
  isResponsive: boolean;
  navigationHistory: string[];
  historyIndex: number;
}

export interface SessionSnapshot {
  id: string;
  timestamp: number;
  tabs: TabState[];
  activeTabId: string | null;
  windowBounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
}

export interface NavigationEvent {
  id: string;
  tabId: string;
  timestamp: number;
  type: 'navigate' | 'back' | 'forward' | 'reload' | 'new-tab' | 'close-tab';
  fromUrl?: string;
  toUrl?: string;
  success: boolean;
  errorReason?: string;
  loadTime?: number;
}

export interface SessionHardeningConfig {
  // Tab management
  maxTabs: number;
  tabMemoryLimitMB: number;
  unresponsiveTimeoutMs: number;
  
  // Auto-save
  autoSaveIntervalMs: number;
  maxSnapshots: number;
  
  // Recovery
  enableCrashRecovery: boolean;
  maxRecoveryAttempts: number;
  
  // Navigation
  navigationTimeoutMs: number;
  maxNavigationHistory: number;
}

export interface TabHealthStatus {
  id: string;
  status: 'healthy' | 'warning' | 'critical' | 'unresponsive';
  memoryUsageMB: number;
  lastResponseTime: number;
  issues: string[];
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_SESSION_CONFIG: SessionHardeningConfig = {
  // Tab management
  maxTabs: 50,
  tabMemoryLimitMB: 512,
  unresponsiveTimeoutMs: 5000,
  
  // Auto-save
  autoSaveIntervalMs: 30000,  // 30 seconds
  maxSnapshots: 10,
  
  // Recovery
  enableCrashRecovery: true,
  maxRecoveryAttempts: 3,
  
  // Navigation
  navigationTimeoutMs: 30000,
  maxNavigationHistory: 100,
};

// ===========================================================================
// SESSION HARDENING CLASS
// ===========================================================================

class SessionHardeningClass extends EventEmitter {
  private config: SessionHardeningConfig;
  private tabs: Map<string, TabState> = new Map();
  private navigationEvents: NavigationEvent[] = [];
  private snapshots: SessionSnapshot[] = [];
  private pendingNavigations: Map<string, { startTime: number; timeout: NodeJS.Timeout }> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private recoveryAttempts: number = 0;
  private dataPath: string;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_SESSION_CONFIG };
    this.dataPath = path.join(app.getPath('userData'), 'session');
    this.setMaxListeners(30);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDataDirectory();
    await this.loadConfig();
    await this.loadSnapshots();
    this.setupWindowTracking();
    this.startHealthMonitoring();
    this.startAutoSave();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[SessionHardening] Session hardening layer initialized');
  }

  shutdown(): void {
    // Save final snapshot before shutdown
    this.captureSnapshot('shutdown').catch((e: unknown) => { log.warn('[DEX]', e); });

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Clear pending navigation timeouts
    for (const nav of this.pendingNavigations.values()) {
      clearTimeout(nav.timeout);
    }
    this.pendingNavigations.clear();

    this.removeAllListeners();
    log.info('[SessionHardening] Session hardening layer shut down');
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'session-hardening-config.json');
      try {
        const data = await fsPromises.readFile(configPath, 'utf-8');
        this.config = { ...DEFAULT_SESSION_CONFIG, ...JSON.parse(data) };
      } catch { /* file doesn't exist yet, use defaults */ }
    } catch (error) {
      log.error('[SessionHardening] Failed to load config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'session-hardening-config.json');
      await fsPromises.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[SessionHardening] Failed to save config:', error);
    }
  }

  private async loadSnapshots(): Promise<void> {
    try {
      const snapshotPath = path.join(this.dataPath, 'session-snapshots.json');
      try {
        const data = (await fsPromises.readFile(snapshotPath, 'utf-8')).trim();
        if (data && data.length > 2) {
          this.snapshots = JSON.parse(data);
        }
      } catch { /* file doesn't exist yet */ }
    } catch (error) {
      log.warn('[SessionHardening] Failed to load snapshots:', error);
      this.snapshots = [];
    }
  }

  private async saveSnapshots(): Promise<void> {
    try {
      const snapshotPath = path.join(this.dataPath, 'session-snapshots.json');
      await fsPromises.writeFile(snapshotPath, JSON.stringify(this.snapshots, null, 2));
    } catch (error) {
      log.error('[SessionHardening] Failed to save snapshots:', error);
    }
  }

  // -------------------------------------------------------------------------
  // TAB MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Register a new tab
   */
  registerTab(tabInfo: {
    id: string;
    windowId: number;
    webContentsId: number;
    url: string;
    title?: string;
  }): { success: boolean; error?: string } {
    // Check tab limit
    if (this.tabs.size >= this.config.maxTabs) {
      return { 
        success: false, 
        error: `Maximum tab limit (${this.config.maxTabs}) reached` 
      };
    }

    const tab: TabState = {
      id: tabInfo.id,
      windowId: tabInfo.windowId,
      webContentsId: tabInfo.webContentsId,
      url: tabInfo.url,
      title: tabInfo.title || 'New Tab',
      isActive: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isResponsive: true,
      navigationHistory: [tabInfo.url],
      historyIndex: 0,
    };

    this.tabs.set(tabInfo.id, tab);
    this.setupTabListeners(tabInfo.webContentsId, tabInfo.id);
    this.emit('tab-registered', { tabId: tabInfo.id });

    this.recordNavigationEvent({
      tabId: tabInfo.id,
      type: 'new-tab',
      toUrl: tabInfo.url,
      success: true,
    });

    return { success: true };
  }

  /**
   * Unregister a tab
   */
  unregisterTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.tabs.delete(tabId);
      this.emit('tab-unregistered', { tabId });

      this.recordNavigationEvent({
        tabId,
        type: 'close-tab',
        fromUrl: tab.url,
        success: true,
      });
    }
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId: string): void {
    for (const [id, tab] of this.tabs) {
      tab.isActive = id === tabId;
      if (id === tabId) {
        tab.lastActiveAt = Date.now();
      }
    }
    this.emit('active-tab-changed', { tabId });
  }

  /**
   * Get tab state
   */
  getTab(tabId: string): TabState | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Get all tabs
   */
  getAllTabs(): TabState[] {
    return Array.from(this.tabs.values());
  }

  /**
   * Setup webContents listeners for a tab
   */
  private setupTabListeners(webContentsId: number, tabId: string): void {
    try {
      const contents = webContents.fromId(webContentsId);
      if (!contents) return;

      contents.on('did-start-navigation', (event, url) => {
        this.handleNavigationStart(tabId, url);
      });

      contents.on('did-finish-load', () => {
        this.handleNavigationComplete(tabId, true);
      });

      contents.on('did-fail-load', (event, errorCode, errorDescription) => {
        this.handleNavigationComplete(tabId, false, errorDescription);
      });

      contents.on('page-title-updated', (event, title) => {
        const tab = this.tabs.get(tabId);
        if (tab) {
          tab.title = title;
        }
      });

      contents.on('unresponsive', () => {
        this.handleUnresponsive(tabId);
      });

      contents.on('responsive', () => {
        this.handleResponsive(tabId);
      });

      contents.on('render-process-gone', (event, details) => {
        this.handleRenderProcessGone(tabId, details);
      });

      contents.on('destroyed', () => {
        this.unregisterTab(tabId);
      });
    } catch (error) {
      log.error(`[SessionHardening] Failed to setup tab listeners for ${tabId}:`, error);
    }
  }

  // -------------------------------------------------------------------------
  // NAVIGATION HANDLING
  // -------------------------------------------------------------------------

  /**
   * Handle navigation start
   */
  private handleNavigationStart(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    const startTime = Date.now();
    const navId = crypto.randomUUID();

    // Set navigation timeout
    const timeout = setTimeout(() => {
      this.handleNavigationTimeout(tabId, url);
    }, this.config.navigationTimeoutMs);

    this.pendingNavigations.set(tabId, { startTime, timeout });
    
    // Update tab URL
    const previousUrl = tab.url;
    tab.url = url;

    // Update navigation history
    if (url !== tab.navigationHistory[tab.historyIndex]) {
      // Truncate forward history if navigating from middle of history
      tab.navigationHistory = tab.navigationHistory.slice(0, tab.historyIndex + 1);
      tab.navigationHistory.push(url);
      tab.historyIndex = tab.navigationHistory.length - 1;

      // Trim history if too long
      if (tab.navigationHistory.length > this.config.maxNavigationHistory) {
        tab.navigationHistory = tab.navigationHistory.slice(-this.config.maxNavigationHistory);
        tab.historyIndex = tab.navigationHistory.length - 1;
      }
    }

    this.emit('navigation-started', { tabId, url, previousUrl });
  }

  /**
   * Handle navigation complete
   */
  private handleNavigationComplete(tabId: string, success: boolean, error?: string): void {
    const pending = this.pendingNavigations.get(tabId);
    if (pending) {
      clearTimeout(pending.timeout);
      const loadTime = Date.now() - pending.startTime;
      this.pendingNavigations.delete(tabId);

      const tab = this.tabs.get(tabId);
      this.recordNavigationEvent({
        tabId,
        type: 'navigate',
        toUrl: tab?.url,
        success,
        errorReason: error,
        loadTime,
      });

      this.emit('navigation-completed', { tabId, success, loadTime, error });
    }
  }

  /**
   * Handle navigation timeout
   */
  private handleNavigationTimeout(tabId: string, url: string): void {
    this.pendingNavigations.delete(tabId);
    
    this.recordNavigationEvent({
      tabId,
      type: 'navigate',
      toUrl: url,
      success: false,
      errorReason: 'Navigation timeout',
    });

    this.emit('navigation-timeout', { tabId, url });
    log.warn(`[SessionHardening] Navigation timeout for tab ${tabId}: ${url}`);
  }

  /**
   * Navigate tab back
   */
  navigateBack(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.historyIndex <= 0) return false;

    tab.historyIndex--;
    const url = tab.navigationHistory[tab.historyIndex];

    this.recordNavigationEvent({
      tabId,
      type: 'back',
      fromUrl: tab.url,
      toUrl: url,
      success: true,
    });

    return true;
  }

  /**
   * Navigate tab forward
   */
  navigateForward(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.historyIndex >= tab.navigationHistory.length - 1) return false;

    tab.historyIndex++;
    const url = tab.navigationHistory[tab.historyIndex];

    this.recordNavigationEvent({
      tabId,
      type: 'forward',
      fromUrl: tab.url,
      toUrl: url,
      success: true,
    });

    return true;
  }

  /**
   * Reload tab
   */
  reloadTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    this.recordNavigationEvent({
      tabId,
      type: 'reload',
      toUrl: tab.url,
      success: true,
    });
  }

  /**
   * Record navigation event
   */
  private recordNavigationEvent(event: Omit<NavigationEvent, 'id' | 'timestamp'>): void {
    const fullEvent: NavigationEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event,
    };

    this.navigationEvents.push(fullEvent);

    // Keep only last 1000 events
    if (this.navigationEvents.length > 1000) {
      this.navigationEvents = this.navigationEvents.slice(-1000);
    }
  }

  // -------------------------------------------------------------------------
  // CRASH & RECOVERY HANDLING
  // -------------------------------------------------------------------------

  /**
   * Handle unresponsive tab
   */
  private handleUnresponsive(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isResponsive = false;
      this.emit('tab-unresponsive', { tabId });
      log.warn(`[SessionHardening] Tab ${tabId} is unresponsive`);
    }
  }

  /**
   * Handle tab becoming responsive again
   */
  private handleResponsive(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isResponsive = true;
      this.emit('tab-responsive', { tabId });
      log.info(`[SessionHardening] Tab ${tabId} is responsive again`);
    }
  }

  /**
   * Handle render process crash
   */
  private handleRenderProcessGone(tabId: string, details: Electron.RenderProcessGoneDetails): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    log.error(`[SessionHardening] Render process gone for tab ${tabId}:`, details);
    this.emit('tab-crashed', { tabId, reason: details.reason });

    if (this.config.enableCrashRecovery && this.recoveryAttempts < this.config.maxRecoveryAttempts) {
      this.attemptTabRecovery(tabId, tab.url);
    }
  }

  /**
   * Attempt to recover a crashed tab
   */
  private attemptTabRecovery(tabId: string, url: string): void {
    this.recoveryAttempts++;
    this.emit('tab-recovery-started', { tabId, url, attempt: this.recoveryAttempts });
    log.info(`[SessionHardening] Attempting tab recovery ${this.recoveryAttempts}/${this.config.maxRecoveryAttempts}`);
    
    // The actual reload would be handled by the caller
    // This just tracks the recovery attempt
  }

  /**
   * Reset recovery counter (call after successful recovery)
   */
  resetRecoveryAttempts(): void {
    this.recoveryAttempts = 0;
  }

  // -------------------------------------------------------------------------
  // SESSION SNAPSHOTS
  // -------------------------------------------------------------------------

  /**
   * Capture session snapshot
   */
  async captureSnapshot(reason: string = 'auto'): Promise<SessionSnapshot | null> {
    try {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      
      if (!mainWindow) return null;

      const bounds = mainWindow.getBounds();
      const isMaximized = mainWindow.isMaximized();

      const snapshot: SessionSnapshot = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        tabs: Array.from(this.tabs.values()).map(tab => ({ ...tab })),
        activeTabId: Array.from(this.tabs.values()).find(t => t.isActive)?.id || null,
        windowBounds: bounds,
        isMaximized,
      };

      this.snapshots.push(snapshot);

      // Keep only the most recent snapshots
      if (this.snapshots.length > this.config.maxSnapshots) {
        this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
      }

      await this.saveSnapshots();
      this.emit('snapshot-captured', { snapshotId: snapshot.id, reason });

      return snapshot;
    } catch (error) {
      log.error('[SessionHardening] Failed to capture snapshot:', error);
      return null;
    }
  }

  /**
   * Get most recent snapshot
   */
  getLatestSnapshot(): SessionSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(): SessionSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Restore from snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<{ success: boolean; error?: string }> {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      return { success: false, error: 'Snapshot not found' };
    }

    // Return snapshot data for the caller to handle actual restoration
    this.emit('restore-requested', { snapshot });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // HEALTH MONITORING
  // -------------------------------------------------------------------------

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 10000);  // Every 10 seconds
  }

  /**
   * Perform health check on all tabs
   */
  private async performHealthCheck(): Promise<void> {
    for (const [tabId, tab] of this.tabs) {
      try {
        const contents = webContents.fromId(tab.webContentsId);
        if (!contents || contents.isDestroyed()) {
          this.unregisterTab(tabId);
          continue;
        }

        // Get memory usage
        const memInfo = await contents.executeJavaScript(`
          performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize
          } : null
        `).catch(() => null);

        if (memInfo) {
          tab.memoryUsage = Math.round(memInfo.usedJSHeapSize / (1024 * 1024));
          
          // Check memory limit
          if (tab.memoryUsage > this.config.tabMemoryLimitMB) {
            this.emit('tab-memory-warning', { 
              tabId, 
              memoryMB: tab.memoryUsage,
              limitMB: this.config.tabMemoryLimitMB 
            });
          }
        }
      } catch (error) {
        // Tab might be in a bad state
        log.warn(`[SessionHardening] Health check failed for tab ${tabId}:`, error);
      }
    }
  }

  /**
   * Get tab health status
   */
  getTabHealth(tabId: string): TabHealthStatus | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    const issues: string[] = [];
    let status: TabHealthStatus['status'] = 'healthy';

    // Check responsiveness
    if (!tab.isResponsive) {
      status = 'unresponsive';
      issues.push('Tab is not responding');
    }

    // Check memory
    const memoryMB = tab.memoryUsage || 0;
    if (memoryMB > this.config.tabMemoryLimitMB) {
      status = status === 'unresponsive' ? 'unresponsive' : 'critical';
      issues.push(`High memory usage (${memoryMB}MB)`);
    } else if (memoryMB > this.config.tabMemoryLimitMB * 0.75) {
      if (status === 'healthy') status = 'warning';
      issues.push(`Elevated memory usage (${memoryMB}MB)`);
    }

    // Check last activity
    const inactiveMinutes = (Date.now() - tab.lastActiveAt) / (1000 * 60);
    if (inactiveMinutes > 30) {
      if (status === 'healthy') status = 'warning';
      issues.push(`Inactive for ${Math.floor(inactiveMinutes)} minutes`);
    }

    return {
      id: tabId,
      status,
      memoryUsageMB: memoryMB,
      lastResponseTime: tab.lastActiveAt,
      issues,
    };
  }

  /**
   * Get health status for all tabs
   */
  getAllTabHealth(): TabHealthStatus[] {
    return Array.from(this.tabs.keys())
      .map(id => this.getTabHealth(id))
      .filter((h): h is TabHealthStatus => h !== null);
  }

  // -------------------------------------------------------------------------
  // AUTO-SAVE
  // -------------------------------------------------------------------------

  private startAutoSave(): void {
    if (this.autoSaveInterval) return;

    this.autoSaveInterval = setInterval(async () => {
      await this.captureSnapshot('auto-save');
    }, this.config.autoSaveIntervalMs);
  }

  // -------------------------------------------------------------------------
  // WINDOW TRACKING
  // -------------------------------------------------------------------------

  private setupWindowTracking(): void {
    app.on('browser-window-created', (_, window) => {
      window.on('close', () => {
        this.captureSnapshot('window-close').catch((e: unknown) => { log.warn('[DEX]', e); });
      });
    });
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('sessionHardening:registerTab', (_, tabInfo) => 
      this.registerTab(tabInfo));

    ipcMain.handle('sessionHardening:unregisterTab', (_, tabId) => {
      this.unregisterTab(tabId);
      return { success: true };
    });

    ipcMain.handle('sessionHardening:setActiveTab', (_, tabId) => {
      this.setActiveTab(tabId);
      return { success: true };
    });

    ipcMain.handle('sessionHardening:getTab', (_, tabId) => 
      this.getTab(tabId));

    ipcMain.handle('sessionHardening:getAllTabs', () => 
      this.getAllTabs());

    ipcMain.handle('sessionHardening:navigateBack', (_, tabId) => 
      this.navigateBack(tabId));

    ipcMain.handle('sessionHardening:navigateForward', (_, tabId) => 
      this.navigateForward(tabId));

    ipcMain.handle('sessionHardening:reloadTab', (_, tabId) => {
      this.reloadTab(tabId);
      return { success: true };
    });

    ipcMain.handle('sessionHardening:captureSnapshot', async (_, reason) => 
      this.captureSnapshot(reason));

    ipcMain.handle('sessionHardening:getLatestSnapshot', () => 
      this.getLatestSnapshot());

    ipcMain.handle('sessionHardening:getAllSnapshots', () => 
      this.getAllSnapshots());

    ipcMain.handle('sessionHardening:restoreFromSnapshot', async (_, snapshotId) => 
      this.restoreFromSnapshot(snapshotId));

    ipcMain.handle('sessionHardening:getTabHealth', (_, tabId) => 
      this.getTabHealth(tabId));

    ipcMain.handle('sessionHardening:getAllTabHealth', () => 
      this.getAllTabHealth());

    ipcMain.handle('sessionHardening:getNavigationHistory', (_, limit?: number) => 
      this.navigationEvents.slice(-(limit || 100)));

    ipcMain.handle('sessionHardening:getConfig', () => ({ ...this.config }));

    ipcMain.handle('sessionHardening:updateConfig', async (_, updates: Partial<SessionHardeningConfig>) => {
      this.config = { ...this.config, ...updates };
      await this.saveConfig();
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  getConfig(): SessionHardeningConfig {
    return { ...this.config };
  }

  getTabCount(): number {
    return this.tabs.size;
  }

  getNavigationEventCount(): number {
    return this.navigationEvents.length;
  }
}

// Singleton instance
export const sessionHardening = new SessionHardeningClass();

// Export initialization function
export async function initializeSessionHardening(): Promise<void> {
  return sessionHardening.initialize();
}
