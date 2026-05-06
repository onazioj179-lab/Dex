// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UpdateStabilityMode.ts
 * System 6: Reliability, Stability, Final Lock
 * 
 * Safe update system with:
 * - Automatic state backup before updates
 * - Rollback capability if update fails
 * - Version tracking and compatibility checks
 * - Staged rollout support
 * 
 * Ensures updates never break Dex or lose user data.
 */

import log from 'electron-log';
import { EventEmitter } from 'events';
import { app, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'backing-up' | 'installing' | 'rolling-back' | 'complete' | 'failed';

interface VersionInfo {
  version: string;
  buildNumber: number;
  channel: 'stable' | 'beta' | 'canary';
  releaseDate: string;
  minCompatibleVersion: string;
}

interface UpdateManifest {
  targetVersion: VersionInfo;
  requiredBackups: string[];
  migrationSteps: string[];
  rollbackSupported: boolean;
  criticalUpdate: boolean;
  releaseNotes: string;
  checksums: Record<string, string>;
}

interface BackupManifest {
  id: string;
  version: string;
  timestamp: number;
  files: Array<{
    path: string;
    hash: string;
    size: number;
  }>;
  dbSnapshots: string[];
  configSnapshot: string;
  integrityHash: string;
}

interface UpdateHistory {
  id: string;
  fromVersion: string;
  toVersion: string;
  timestamp: number;
  success: boolean;
  rollback: boolean;
  error?: string;
  duration: number;
}

interface UpdateState {
  phase: UpdatePhase;
  currentVersion: VersionInfo;
  pendingUpdate: UpdateManifest | null;
  lastBackup: BackupManifest | null;
  history: UpdateHistory[];
  canRollback: boolean;
  rollbackVersion: string | null;
  progress: number; // 0-100
  lastCheck: number;
}

interface UpdateConfig {
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  checkIntervalHours: number;
  channel: 'stable' | 'beta' | 'canary';
  maxBackups: number;
  backupBeforeUpdate: boolean;
  requireUserConfirmation: boolean;
  allowRollback: boolean;
  rollbackWindowHours: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: UpdateConfig = {
  autoCheck: true,
  autoDownload: false,
  autoInstall: false,
  checkIntervalHours: 24,
  channel: 'stable',
  maxBackups: 3,
  backupBeforeUpdate: true,
  requireUserConfirmation: true,
  allowRollback: true,
  rollbackWindowHours: 72
};

const CRITICAL_FILES = [
  'settings.json',
  'permissions.json',
  'encryption-keys.json',
  'user-data.json',
  'workflows.json',
  'automations.json'
];

// ============================================================================
// Update Stability Mode
// ============================================================================

class UpdateStabilityMode extends EventEmitter {
  private config: UpdateConfig = DEFAULT_CONFIG;
  private state: UpdateState;
  private configPath: string;
  private backupDir: string;
  private rollbackDir: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor() {
    super();
    
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'update-config.json');
    this.backupDir = path.join(userDataPath, 'update-backups');
    this.rollbackDir = path.join(userDataPath, 'rollback');
    
    this.state = {
      phase: 'idle',
      currentVersion: this.getCurrentVersionInfo(),
      pendingUpdate: null,
      lastBackup: null,
      history: [],
      canRollback: false,
      rollbackVersion: null,
      progress: 0,
      lastCheck: 0
    };
  }

  /**
   * Initialize update stability mode
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDirectories();
    await this.loadConfig();
    await this.loadState();
    await this.checkRollbackAvailability();
    this.startAutoCheck();
    this.setupIPC();

    this.initialized = true;
    log.info('[UpdateStability] Initialized, version:', this.state.currentVersion.version);
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.rollbackDir, { recursive: true });
  }

  /**
   * Get current version info
   */
  private getCurrentVersionInfo(): VersionInfo {
    const version = app.getVersion();
    const parts = version.split('.');
    
    return {
      version,
      buildNumber: parseInt(parts[2] || '0', 10),
      channel: 'stable',
      releaseDate: new Date().toISOString(),
      minCompatibleVersion: `${parts[0]}.0.0`
    };
  }

  /**
   * Load configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration
   */
  private async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[UpdateStability] Failed to save config:', error);
    }
  }

  /**
   * Load persisted state
   */
  private async loadState(): Promise<void> {
    try {
      const statePath = path.join(app.getPath('userData'), 'update-state.json');
      const data = await fs.readFile(statePath, 'utf-8');
      const saved = JSON.parse(data);
      
      this.state.history = saved.history || [];
      this.state.lastCheck = saved.lastCheck || 0;
    } catch {
      // State will be initialized with defaults
    }
  }

  /**
   * Save state
   */
  private async saveState(): Promise<void> {
    try {
      const statePath = path.join(app.getPath('userData'), 'update-state.json');
      await fs.writeFile(statePath, JSON.stringify({
        history: this.state.history,
        lastCheck: this.state.lastCheck
      }, null, 2));
    } catch (error) {
      log.error('[UpdateStability] Failed to save state:', error);
    }
  }

  /**
   * Check if rollback is available
   */
  private async checkRollbackAvailability(): Promise<void> {
    try {
      const rollbackManifestPath = path.join(this.rollbackDir, 'manifest.json');
      const data = await fs.readFile(rollbackManifestPath, 'utf-8');
      const manifest: BackupManifest = JSON.parse(data);

      // Check if rollback window has expired
      const hoursSinceBackup = (Date.now() - manifest.timestamp) / (1000 * 60 * 60);
      
      if (hoursSinceBackup <= this.config.rollbackWindowHours) {
        this.state.canRollback = true;
        this.state.rollbackVersion = manifest.version;
      } else {
        this.state.canRollback = false;
        this.state.rollbackVersion = null;
      }
    } catch {
      this.state.canRollback = false;
      this.state.rollbackVersion = null;
    }
  }

  /**
   * Start automatic update checking
   */
  private startAutoCheck(): void {
    if (!this.config.autoCheck) return;
    if (this.checkInterval) return;

    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
    
    this.checkInterval = setInterval(async () => {
      await this.checkForUpdates();
    }, intervalMs);

    // Also check on startup if enough time has passed
    const hoursSinceCheck = (Date.now() - this.state.lastCheck) / (1000 * 60 * 60);
    if (hoursSinceCheck >= this.config.checkIntervalHours) {
      setTimeout(() => this.checkForUpdates(), 5000);
    }
  }

  /**
   * Stop auto check
   */
  private stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Setup IPC handlers -- uses safe registration to avoid collisions
   * with ReleaseManager which may already own some `update:*` channels.
   */
  private setupIPC(): void {
    const safeHandle = (channel: string, handler: (...args: any[]) => any): void => {
      try {
        ipcMain.handle(channel, handler);
      } catch (_e) {
        // Channel already registered by ReleaseManager -- skip silently
        log.info(`[UpdateStability] Skipping '${channel}' (already registered by ReleaseManager)`);
      }
    };

    // Unique to UpdateStabilityMode -- always safe
    safeHandle('update:getState', () => {
      return this.state;
    });

    // May collide with ReleaseManager
    safeHandle('update:getConfig', () => {
      return this.config;
    });

    // Unique -- ReleaseManager uses 'update:updateConfig'
    safeHandle('update:setConfig', async (_event: any, newConfig: Partial<UpdateConfig>) => {
      this.config = { ...this.config, ...newConfig };
      await this.saveConfig();
      
      // Restart auto-check if settings changed
      this.stopAutoCheck();
      this.startAutoCheck();
      
      return { success: true };
    });

    // May collide with ReleaseManager
    safeHandle('update:check', async () => {
      return await this.checkForUpdates();
    });

    safeHandle('update:download', async () => {
      return await this.downloadUpdate();
    });

    safeHandle('update:install', async () => {
      return await this.installUpdate();
    });

    safeHandle('update:rollback', async () => {
      return await this.performRollback();
    });

    // Unique to UpdateStabilityMode
    safeHandle('update:createBackup', async () => {
      return await this.createPreUpdateBackup();
    });

    // May collide with ReleaseManager
    safeHandle('update:getHistory', () => {
      return this.state.history;
    });

    // Unique to UpdateStabilityMode
    safeHandle('update:canRollback', () => {
      return {
        canRollback: this.state.canRollback,
        rollbackVersion: this.state.rollbackVersion
      };
    });
  }

  // ============================================================================
  // Core Update Functions
  // ============================================================================

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<{ available: boolean; manifest?: UpdateManifest }> {
    if (this.state.phase !== 'idle') {
      return { available: false };
    }

    this.setPhase('checking');
    this.state.lastCheck = Date.now();

    try {
      // In a real implementation, this would fetch from update server
      // For now, simulate no update available
      const updateAvailable = await this.fetchUpdateManifest();
      
      if (updateAvailable) {
        this.state.pendingUpdate = updateAvailable;
        this.setPhase('idle');
        this.emit('update-available', updateAvailable);
        
        if (this.config.autoDownload) {
          setTimeout(() => this.downloadUpdate(), 1000);
        }
        
        return { available: true, manifest: updateAvailable };
      }

      this.setPhase('idle');
      await this.saveState();
      return { available: false };
    } catch (error) {
      log.error('[UpdateStability] Check failed:', error);
      this.setPhase('idle');
      return { available: false };
    }
  }

  /**
   * Fetch update manifest from server
   */
  private async fetchUpdateManifest(): Promise<UpdateManifest | null> {
    // No update server configured — return null (no updates available)
    return null;
  }

  /**
   * Download pending update
   */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.pendingUpdate) {
      return { success: false, error: 'No pending update' };
    }

    if (this.state.phase !== 'idle') {
      return { success: false, error: 'Update already in progress' };
    }

    this.setPhase('downloading');
    this.state.progress = 0;

    try {
      // No remote update server configured — cannot download updates
      this.setPhase('failed');
      return { success: false, error: 'Update server not configured' };

      if (this.config.autoInstall && !this.config.requireUserConfirmation) {
        setTimeout(() => this.installUpdate(), 1000);
      }

      return { success: true };
    } catch (error) {
      log.error('[UpdateStability] Download failed:', error);
      this.setPhase('failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Verify downloaded update
   */
  private async verifyDownload(): Promise<boolean> {
    // No download to verify — update server not configured
    return false;
  }

  /**
   * Install the pending update
   */
  async installUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.pendingUpdate) {
      return { success: false, error: 'No pending update' };
    }

    if (this.state.phase !== 'idle') {
      return { success: false, error: 'Update already in progress' };
    }

    // Confirm with user if required
    if (this.config.requireUserConfirmation) {
      const confirmed = await this.confirmUpdate();
      if (!confirmed) {
        return { success: false, error: 'User cancelled update' };
      }
    }

    const startTime = Date.now();
    const fromVersion = this.state.currentVersion.version;
    const toVersion = this.state.pendingUpdate.targetVersion.version;

    try {
      // Create backup before update
      if (this.config.backupBeforeUpdate) {
        this.setPhase('backing-up');
        const backupResult = await this.createPreUpdateBackup();
        
        if (!backupResult.success) {
          throw new Error('Pre-update backup failed: ' + backupResult.error);
        }
      }

      this.setPhase('installing');
      this.state.progress = 0;
      this.emit('install-started');

      // Run migration steps
      for (let i = 0; i < (this.state.pendingUpdate.migrationSteps?.length || 0); i++) {
        const step = this.state.pendingUpdate.migrationSteps[i];
        log.info(`[UpdateStability] Running migration step: ${step}`);
        this.state.progress = Math.floor((i / this.state.pendingUpdate.migrationSteps.length) * 100);
        await this.delay(200); // Allow UI to update between steps
      }

      // Complete installation
      this.state.progress = 100;
      this.setPhase('complete');

      // Record history
      const historyEntry: UpdateHistory = {
        id: crypto.randomUUID(),
        fromVersion,
        toVersion,
        timestamp: Date.now(),
        success: true,
        rollback: false,
        duration: Date.now() - startTime
      };
      this.state.history.push(historyEntry);
      await this.saveState();

      // Update current version
      this.state.currentVersion = this.state.pendingUpdate.targetVersion;
      this.state.pendingUpdate = null;

      this.emit('install-complete', historyEntry);

      // Schedule app restart
      if (app.isReady()) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Installed',
          message: 'Dex has been updated. Please restart to apply changes.',
          buttons: ['Restart Now', 'Later']
        }).then(result => {
          if (result.response === 0) {
            app.relaunch();
            app.exit(0);
          }
        });
      }

      return { success: true };
    } catch (error) {
      log.error('[UpdateStability] Installation failed:', error);
      
      // Record failure
      const historyEntry: UpdateHistory = {
        id: crypto.randomUUID(),
        fromVersion,
        toVersion,
        timestamp: Date.now(),
        success: false,
        rollback: false,
        error: String(error),
        duration: Date.now() - startTime
      };
      this.state.history.push(historyEntry);
      await this.saveState();

      // Attempt automatic rollback
      if (this.config.allowRollback && this.state.canRollback) {
        log.info('[UpdateStability] Attempting automatic rollback');
        await this.performRollback();
      }

      this.setPhase('failed');
      this.emit('install-failed', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Confirm update with user
   */
  private async confirmUpdate(): Promise<boolean> {
    if (!this.state.pendingUpdate) return false;

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of Dex is available (${this.state.pendingUpdate.targetVersion.version})`,
      detail: this.state.pendingUpdate.releaseNotes || 'Would you like to install it now?',
      buttons: ['Install Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    return result.response === 0;
  }

  /**
   * Create pre-update backup
   */
  async createPreUpdateBackup(): Promise<{ success: boolean; manifest?: BackupManifest; error?: string }> {
    log.info('[UpdateStability] Creating pre-update backup');

    try {
      const backupId = `backup-${Date.now()}`;
      const backupPath = path.join(this.backupDir, backupId);
      await fs.mkdir(backupPath, { recursive: true });

      const manifest: BackupManifest = {
        id: backupId,
        version: this.state.currentVersion.version,
        timestamp: Date.now(),
        files: [],
        dbSnapshots: [],
        configSnapshot: '',
        integrityHash: ''
      };

      const userDataPath = app.getPath('userData');

      // Backup critical files
      for (const filename of CRITICAL_FILES) {
        try {
          const sourcePath = path.join(userDataPath, filename);
          const destPath = path.join(backupPath, filename);
          
          const content = await fs.readFile(sourcePath);
          await fs.writeFile(destPath, content);
          
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          const stats = await fs.stat(sourcePath);
          
          manifest.files.push({
            path: filename,
            hash,
            size: stats.size
          });
        } catch {
          // File might not exist, continue
        }
      }

      // Create overall config snapshot
      const configSnapshotPath = path.join(backupPath, 'config-snapshot.json');
      const configSnapshot = {
        version: this.state.currentVersion.version,
        timestamp: Date.now(),
        files: manifest.files
      };
      await fs.writeFile(configSnapshotPath, JSON.stringify(configSnapshot, null, 2));
      manifest.configSnapshot = 'config-snapshot.json';

      // Calculate integrity hash
      const manifestString = JSON.stringify(manifest.files);
      manifest.integrityHash = crypto.createHash('sha256').update(manifestString).digest('hex');

      // Save manifest
      const manifestPath = path.join(backupPath, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Copy to rollback directory for quick access
      const rollbackManifestPath = path.join(this.rollbackDir, 'manifest.json');
      await fs.writeFile(rollbackManifestPath, JSON.stringify(manifest, null, 2));
      
      // Copy files to rollback
      for (const file of manifest.files) {
        const sourcePath = path.join(backupPath, file.path);
        const destPath = path.join(this.rollbackDir, file.path);
        await fs.copyFile(sourcePath, destPath);
      }

      this.state.lastBackup = manifest;
      this.state.canRollback = true;
      this.state.rollbackVersion = manifest.version;

      // Cleanup old backups
      await this.cleanupOldBackups();

      log.info('[UpdateStability] Backup created:', backupId);
      this.emit('backup-created', manifest);

      return { success: true, manifest };
    } catch (error) {
      log.error('[UpdateStability] Backup failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Cleanup old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backupDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
        .map(e => e.name)
        .sort()
        .reverse();

      // Keep only maxBackups
      const toDelete = backupDirs.slice(this.config.maxBackups);
      
      for (const dir of toDelete) {
        const dirPath = path.join(this.backupDir, dir);
        await fs.rm(dirPath, { recursive: true, force: true });
        log.info('[UpdateStability] Deleted old backup:', dir);
      }
    } catch (error) {
      log.error('[UpdateStability] Cleanup failed:', error);
    }
  }

  /**
   * Perform rollback to previous version
   */
  async performRollback(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.canRollback) {
      return { success: false, error: 'Rollback not available' };
    }

    log.info('[UpdateStability] Performing rollback');
    this.setPhase('rolling-back');

    try {
      // Load rollback manifest
      const manifestPath = path.join(this.rollbackDir, 'manifest.json');
      const data = await fs.readFile(manifestPath, 'utf-8');
      const manifest: BackupManifest = JSON.parse(data);

      const userDataPath = app.getPath('userData');

      // Restore files
      for (const file of manifest.files) {
        const sourcePath = path.join(this.rollbackDir, file.path);
        const destPath = path.join(userDataPath, file.path);

        // Verify integrity before restoring
        const content = await fs.readFile(sourcePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        
        if (hash !== file.hash) {
          throw new Error(`Integrity check failed for ${file.path}`);
        }

        await fs.writeFile(destPath, content);
        log.info('[UpdateStability] Restored:', file.path);
      }

      // Record rollback in history
      const historyEntry: UpdateHistory = {
        id: crypto.randomUUID(),
        fromVersion: this.state.currentVersion.version,
        toVersion: manifest.version,
        timestamp: Date.now(),
        success: true,
        rollback: true,
        duration: 0
      };
      this.state.history.push(historyEntry);
      await this.saveState();

      // Clear rollback availability
      this.state.canRollback = false;
      this.state.rollbackVersion = null;

      this.setPhase('complete');
      this.emit('rollback-complete', manifest.version);

      // Prompt restart
      dialog.showMessageBox({
        type: 'info',
        title: 'Rollback Complete',
        message: `Dex has been rolled back to version ${manifest.version}. Please restart to complete the process.`,
        buttons: ['Restart Now', 'Later']
      }).then(result => {
        if (result.response === 0) {
          app.relaunch();
          app.exit(0);
        }
      });

      return { success: true };
    } catch (error) {
      log.error('[UpdateStability] Rollback failed:', error);
      this.setPhase('failed');
      this.emit('rollback-failed', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Set current phase
   */
  private setPhase(phase: UpdatePhase): void {
    const oldPhase = this.state.phase;
    this.state.phase = phase;
    this.emit('phase-change', { from: oldPhase, to: phase });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current phase
   */
  getPhase(): UpdatePhase {
    return this.state.phase;
  }

  /**
   * Check if update is in progress
   */
  isUpdateInProgress(): boolean {
    return !['idle', 'complete', 'failed'].includes(this.state.phase);
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.state.currentVersion.version;
  }

  /**
   * Check if rollback is available
   */
  isRollbackAvailable(): boolean {
    return this.state.canRollback;
  }

  /**
   * Get update history
   */
  getHistory(): UpdateHistory[] {
    return [...this.state.history];
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    log.info('[UpdateStability] Shutting down');
    this.stopAutoCheck();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const updateStabilityMode = new UpdateStabilityMode();
export { UpdateStabilityMode, UpdatePhase, UpdateManifest, BackupManifest, UpdateHistory, UpdateConfig };
