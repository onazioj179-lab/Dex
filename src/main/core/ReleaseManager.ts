// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Release & Update Manager
// Safe, non-disruptive update system
// Phase 66: Production readiness
// ===========================================================================

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import {
  computeDowngradeEligibility,
  pruneInstallHistory,
  MAX_INSTALL_HISTORY,
  type DowngradeEligibility,
  type InstallRecord,
  type LicenseTier,
} from '../../shared/update/downgradeWindow';
import { licensingManager } from './LicensingManager';
import { createCodeSigningService } from '../signing/CodeSigning';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface UpdateConfig {
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  checkInterval: number; // hours
  lastCheck: number;
  skipVersion: string | null;
  channel: 'stable' | 'beta';
  remindLaterUntil: number;
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadSize: number;
  isSecurityUpdate: boolean;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CONFIG_FILE = 'update-config.json';
const BACKUP_DIR = 'backups';
const UPDATE_SERVER_CONFIG_FILE = 'update-server.json';
const INSTALL_HISTORY_FILE = 'update-install-history.json';
// MAX_INSTALL_HISTORY is imported from shared/update/downgradeWindow so the
// retention cap (current + 2 prior versions) stays in lockstep with the
// downgrade-eligibility math. See downgradeWindow.ts for the policy.


const DEFAULT_CONFIG: UpdateConfig = {
  autoCheck: true, // Check for updates on startup
  autoDownload: true, // Silent background download so updates land immediately
  autoInstall: true, // Install on quit (never mid-session); rollback stays available
  checkInterval: 4, // Check every 4 hours
  lastCheck: 0,
  skipVersion: null,
  channel: 'stable',
  remindLaterUntil: 0,
};

// -----------------------------------------------------------------------------
// Release Manager Class
// -----------------------------------------------------------------------------

export class ReleaseManager {
  private config: UpdateConfig;
  private status: UpdateStatus;
  private configPath: string;
  private backupPath: string;
  private mainWindow: BrowserWindow | null = null;
  private history: Array<{ timestamp: number; event: string; data?: unknown }> = [];
  private updateServerUrl = '';
  private postUpdateMarkerPath: string;
  private installHistoryPath: string;
  private installHistory: InstallRecord[] = [];
  private downloadedArtifactPath: string | null = null;
  private downloadedArtifactSha256: string | null = null;
  private expectedArtifactSha256: string | null = null;
  private codeSigning = createCodeSigningService();
  private cachePruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, CONFIG_FILE);
    this.backupPath = path.join(userDataPath, BACKUP_DIR);
    this.postUpdateMarkerPath = path.join(userDataPath, 'update-post-install.json');
    this.installHistoryPath = path.join(userDataPath, INSTALL_HISTORY_FILE);

    this.config = this.loadConfig();
    this.installHistory = this.loadInstallHistory();
    this.recordCurrentVersionIfNew();
    this.updateServerUrl = this.loadUpdateServerUrl();
    this.status = {
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progress: 0,
      error: null,
      updateInfo: null,
    };

    this.setupAutoUpdater();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  private loadConfig(): UpdateConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return {
          ...DEFAULT_CONFIG,
          ...JSON.parse(data),
          // autoDownload/autoInstall have no user-facing setting (setPreferences
          // does not expose them), so persisted values are just stale defaults.
          // Pin them to the current policy so existing installs get immediate
          // updates too.
          autoDownload: DEFAULT_CONFIG.autoDownload,
          autoInstall: DEFAULT_CONFIG.autoInstall,
        };
      }
    } catch (error) {
      log.error('[ReleaseManager] Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[ReleaseManager] Failed to save config:', error);
    }
  }

  updateConfig(updates: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  getConfig(): UpdateConfig {
    return { ...this.config };
  }

  // -------------------------------------------------------------------------
  // Install History (for downgrade eligibility)
  // -------------------------------------------------------------------------

  private loadInstallHistory(): InstallRecord[] {
    try {
      if (fs.existsSync(this.installHistoryPath)) {
        const data = fs.readFileSync(this.installHistoryPath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Apply policy on load: drop expired entries, cap retention.
          return pruneInstallHistory(parsed as InstallRecord[]);
        }
      }
    } catch (error) {
      log.error('[ReleaseManager] Failed to load install history:', error);
    }
    return [];
  }

  private saveInstallHistory(): void {
    try {
      this.installHistory = pruneInstallHistory(this.installHistory);
      fs.writeFileSync(
        this.installHistoryPath,
        JSON.stringify(this.installHistory.slice(-MAX_INSTALL_HISTORY), null, 2)
      );
    } catch (error) {
      log.error('[ReleaseManager] Failed to save install history:', error);
    }
  }

  private recordCurrentVersionIfNew(): void {
    const current = app.getVersion();
    const last = this.installHistory[this.installHistory.length - 1];
    if (last && last.version === current) return;
    const record: InstallRecord = {
      version: current,
      fromVersion: last ? last.version : null,
      installedAt: Date.now(),
    };
    this.installHistory.push(record);
    this.saveInstallHistory();
    log.info('[ReleaseManager] Recorded new install:', record);
  }

  getCurrentInstallRecord(): InstallRecord | null {
    return this.installHistory[this.installHistory.length - 1] || null;
  }

  getInstallHistory(): InstallRecord[] {
    return [...this.installHistory];
  }

  /** Returns 'pro' for Pro/Team users, 'free' otherwise. */
  private getLicenseTier(): LicenseTier {
    try {
      const tier = licensingManager.getCurrentTier();
      if (tier === 'pro' || tier === 'team') return tier;
      return 'free';
    } catch {
      return 'free';
    }
  }

  canDowngrade(): DowngradeEligibility {
    return computeDowngradeEligibility(
      this.getCurrentInstallRecord(),
      this.getLicenseTier(),
      Date.now(),
      this.installHistory
    );
  }

  /**
   * Initiates a downgrade for eligible Pro users. Restores the most recent
   * backup of user data and opens the GitHub releases page so the user can
   * download the previous installer. The current binary is not replaced
   * silently — that would be unsafe — but the user data is rolled back so
   * the previous version starts cleanly.
   */
  async downgrade(targetVersion?: string): Promise<{ success: boolean; eligibility: DowngradeEligibility; restoredBackup?: string; error?: string }> {
    const eligibility = this.canDowngrade();
    if (!eligibility.eligible) {
      return { success: false, eligibility, error: eligibility.reason };
    }
    // Validate the requested target sits within the allowed list.
    let target: string | null = eligibility.targetVersion;
    if (targetVersion) {
      if (!eligibility.targetVersions.includes(targetVersion)) {
        return {
          success: false,
          eligibility,
          error: `Version v${targetVersion} is not within the allowed downgrade window. Choose one of: ${eligibility.targetVersions.map((v) => 'v' + v).join(', ') || 'none'}.`,
        };
      }
      target = targetVersion;
    }
    try {
      const backups = this.listBackups();
      const latestBackup = backups[0] || null;
      if (latestBackup) {
        const restored = await this.restoreFromBackup(this.resolveBackupDir(latestBackup));
        if (!restored) {
          return { success: false, eligibility, error: 'Backup restore failed.' };
        }
      }
      const url = target
        ? `https://github.com/onazioj179-lab/Dex/releases/tag/v${target}`
        : 'https://github.com/onazioj179-lab/Dex/releases';
      await shell.openExternal(url);
      this.recordHistory('downgrade-initiated', { targetVersion: target, restoredBackup: latestBackup });
      return { success: true, eligibility, restoredBackup: latestBackup || undefined };
    } catch (error) {
      return { success: false, eligibility, error: (error as Error).message };
    }
  }

  // -------------------------------------------------------------------------
  // Auto Updater Setup
  // -------------------------------------------------------------------------

  private setupAutoUpdater(): void {
    // Configure auto-updater
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false; // We control downloads (config.autoDownload drives them)
    // Install a downloaded update when the app quits — updates land without
    // ever interrupting a session, and one-click rollback remains available.
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstall;
    autoUpdater.allowPrerelease = this.config.channel === 'beta';
    // Feed URL: by default electron-updater reads the `build.publish` block from
    // package.json (GitHub provider for DEX). Only override when an admin has
    // configured a private generic update server via update-server.json.
    if (this.updateServerUrl && this.isHttpsUrl(this.updateServerUrl)) {
      try {
        (autoUpdater as any).setFeedURL({ provider: 'generic', url: this.updateServerUrl });
        log.info('[ReleaseManager] Using generic feed URL override:', this.updateServerUrl);
      } catch (error) {
        log.warn('[ReleaseManager] Feed URL setup failed:', error);
      }
    } else {
      log.info('[ReleaseManager] Using default GitHub provider from package.json publish config');
    }

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      log.info('[ReleaseManager] Checking for updates...');
      this.status.checking = true;
      this.status.error = null;
      this.recordHistory('checking');
      this.notifyRenderer('update:checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('[ReleaseManager] Update available:', info.version);
      this.status.checking = false;
      this.status.available = true;
      this.status.updateInfo = {
        version: info.version,
        releaseDate: info.releaseDate || new Date().toISOString(),
        releaseNotes: typeof info.releaseNotes === 'string' 
          ? info.releaseNotes 
          : 'See changelog for details',
        downloadSize: 0,
        isSecurityUpdate: this.isSecurityUpdate(info.releaseNotes),
      };
      this.recordHistory('available', this.status.updateInfo);
      this.notifyRenderer('update:available', this.status.updateInfo);

      // Auto-download if enabled (but never auto-install)
      if (this.config.autoDownload && !this.isSkippedVersion(info.version)) {
        this.downloadUpdate();
      }
    });

    autoUpdater.on('update-not-available', () => {
      log.info('[ReleaseManager] No update available');
      this.status.checking = false;
      this.status.available = false;
      this.config.lastCheck = Date.now();
      this.saveConfig();
      this.recordHistory('not-available');
      this.notifyRenderer('update:not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.status.downloading = true;
      this.status.progress = progress.percent;
      this.recordHistory('progress', { percent: progress.percent });
      this.notifyRenderer('update:progress', progress);
    });

    autoUpdater.on('update-downloaded', (event: any) => {
      log.info('[ReleaseManager] Update downloaded');
      this.downloadedArtifactPath = this.resolveDownloadedArtifactPath(event);
      this.expectedArtifactSha256 = this.extractExpectedSha256(event);
      this.downloadedArtifactSha256 = null;
      this.status.downloading = false;
      this.status.downloaded = true;
      this.status.progress = 100;
      this.recordHistory('downloaded', {
        ...this.status.updateInfo,
        artifactPath: this.downloadedArtifactPath,
        expectedSha256: this.expectedArtifactSha256,
      });
      this.notifyRenderer('update:downloaded', this.status.updateInfo);
    });

    autoUpdater.on('error', (error) => {
      log.error('[ReleaseManager] Update error:', error);
      this.status.checking = false;
      this.status.downloading = false;
      this.status.error = error.message;
      this.recordHistory('error', { message: error.message });
      this.notifyRenderer('update:error', { message: error.message });
    });
  }

  private recordHistory(event: string, data?: unknown): void {
    this.history.unshift({ timestamp: Date.now(), event, data });
    this.history = this.history.slice(0, 100);
  }

  private isSecurityUpdate(releaseNotes: unknown): boolean {
    if (!releaseNotes) return false;
    let text = '';
    if (typeof releaseNotes === 'string') {
      text = releaseNotes;
    } else if (Array.isArray(releaseNotes)) {
      text = releaseNotes.map((n: any) => n.body || n.note || '').join(' ');
    }
    return text.toLowerCase().includes('security') || 
           text.toLowerCase().includes('vulnerability') ||
           text.toLowerCase().includes('cve-');
  }

  private isSkippedVersion(version: string): boolean {
    return this.config.skipVersion === version;
  }

  private resolveDownloadedArtifactPath(event: any): string | null {
    const candidates = [
      event?.downloadedFile,
      event?.file,
      event?.path,
      event?.files?.[0]?.downloadedFile,
      event?.files?.[0]?.path,
    ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

    const existing = candidates.find(candidate => {
      try {
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });

    return existing || null;
  }

  private extractExpectedSha256(event: any): string | null {
    const candidates = [
      event?.sha256,
      event?.checksum,
      event?.files?.[0]?.sha256,
      event?.releaseInfo?.sha256,
      event?.updateInfo?.sha256,
      event?.updateInfo?.files?.[0]?.sha256,
    ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
    const normalized = candidates.map(candidate => candidate.trim().toLowerCase()).find(candidate => /^[a-f0-9]{64}$/.test(candidate));
    return normalized || null;
  }

  private async sha256File(filePath: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async verifyDownloadedArtifact(): Promise<void> {
    if (!this.downloadedArtifactPath) {
      throw new Error('Downloaded update artifact path unavailable; refusing to install without verification');
    }

    const artifactPath = this.downloadedArtifactPath;
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      throw new Error('Downloaded update artifact is missing; refusing to install');
    }

    const sha256 = await this.sha256File(artifactPath);
    this.downloadedArtifactSha256 = sha256;

    if (this.expectedArtifactSha256 && sha256 !== this.expectedArtifactSha256) {
      this.recordHistory('integrity-failed', {
        artifactPath,
        expectedSha256: this.expectedArtifactSha256,
        actualSha256: sha256,
      });
      throw new Error('Downloaded update failed SHA-256 integrity verification');
    }

    const signature = await this.codeSigning.verifySignature(artifactPath);
    if (!signature.valid) {
      this.recordHistory('signature-failed', {
        artifactPath,
        sha256,
        error: signature.error || 'Invalid signature',
      });
      throw new Error(`Downloaded update signature verification failed: ${signature.error || 'Invalid signature'}`);
    }

    this.recordHistory('artifact-verified', {
      artifactPath,
      sha256,
      signer: signature.signer || null,
      expectedSha256: this.expectedArtifactSha256,
    });
  }

  // -------------------------------------------------------------------------
  // Update Operations
  // -------------------------------------------------------------------------

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.status.checking) {
      return this.getStatus();
    }

    if (Date.now() < (this.config.remindLaterUntil || 0)) {
      return this.getStatus();
    }

    if (this.updateServerUrl && !this.isHttpsUrl(this.updateServerUrl)) {
      this.status.error = 'Update server URL must use HTTPS';
      return this.getStatus();
    }

    // Offline-aware: skip if no network connectivity
    try {
      const { net } = require('electron') as typeof import('electron');
      if (typeof net.isOnline === 'function' && !net.isOnline()) {
        log.info('[ReleaseManager] Offline — skipping update check');
        this.status.checking = false;
        this.status.error = null;
        return this.getStatus();
      }
    } catch { /* net.isOnline not available on older Electron — proceed anyway */ }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('[ReleaseManager] Check failed:', error);
      this.status.error = (error as Error).message;
    }

    return this.getStatus();
  }

  async downloadUpdate(): Promise<boolean> {
    if (!this.status.available || this.status.downloading) {
      return false;
    }

    if (this.updateServerUrl && !this.isHttpsUrl(this.updateServerUrl)) {
      this.status.error = 'Update server URL must use HTTPS';
      return false;
    }

    try {
      this.status.downloading = true;
      this.notifyRenderer('update:downloading');
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      log.error('[ReleaseManager] Download failed:', error);
      this.status.downloading = false;
      this.status.error = (error as Error).message;
      return false;
    }
  }

  async installUpdate(): Promise<void> {
    if (!this.status.downloaded) {
      throw new Error('No update downloaded');
    }

    // Create backup before install
    let backupPath: string | null = null;
    try {
      backupPath = await this.createBackup();
    } catch (error) {
      const continueWithoutBackup = await dialog.showMessageBox(this.mainWindow!, {
        type: 'warning',
        title: 'Backup failed',
        message: 'A backup could not be created before the update.',
        detail: 'Do you want to continue updating without a backup?',
        buttons: ['Continue without backup', 'Cancel update'],
        defaultId: 1,
        cancelId: 1,
      });
      if (continueWithoutBackup.response !== 0) {
        throw new Error('Update cancelled because backup failed');
      }
    }

    // Show confirmation dialog
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: 'Install Update',
      message: `Ready to install version ${this.status.updateInfo?.version}`,
      detail: 'Dex will restart to complete the update. Your settings and data will be preserved.',
      buttons: ['Install & Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      log.info('[ReleaseManager] Installing update...');
      await this.verifyDownloadedArtifact();
      try {
        fs.writeFileSync(this.postUpdateMarkerPath, JSON.stringify({
          targetVersion: this.status.updateInfo?.version || 'unknown',
          backupPath,
          artifactSha256: this.downloadedArtifactSha256,
          timestamp: Date.now(),
        }, null, 2), 'utf-8');
      } catch {
        // Ignore marker write failures
      }
      autoUpdater.quitAndInstall(false, true);
    }
  }

  skipVersion(version?: string): void {
    const targetVersion = version || this.status.updateInfo?.version;
    if (!targetVersion) return;

    this.config.skipVersion = targetVersion;
    this.saveConfig();
    this.status.available = false;
    this.recordHistory('skipped', { version: targetVersion });
    this.notifyRenderer('update:skipped');
  }

  remindMeLater(hours = 24): void {
    this.config.remindLaterUntil = Date.now() + hours * 60 * 60 * 1000;
    this.saveConfig();
    this.notifyRenderer('update:remind-later', { until: this.config.remindLaterUntil });
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  // -------------------------------------------------------------------------
  // Backup & Recovery
  // -------------------------------------------------------------------------

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.backupPath, `backup-${timestamp}`);

    try {
      // Create backup directory
      fs.mkdirSync(backupDir, { recursive: true });

      // Backup config files
      const userDataPath = app.getPath('userData');
      const configFiles = ['config.json', 'preferences.json', 'state.json'];
      
      for (const file of configFiles) {
        const srcPath = path.join(userDataPath, file);
        if (fs.existsSync(srcPath)) {
          const destPath = path.join(backupDir, file);
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Backup databases
      const dbFiles = fs.readdirSync(userDataPath).filter(f => f.endsWith('.db'));
      for (const file of dbFiles) {
        const srcPath = path.join(userDataPath, file);
        const destPath = path.join(backupDir, file);
        fs.copyFileSync(srcPath, destPath);
      }

      log.info('[ReleaseManager] Backup created:', backupDir);
      return backupDir;
    } catch (error) {
      log.error('[ReleaseManager] Backup failed:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupDir: string): Promise<boolean> {
    try {
      const userDataPath = app.getPath('userData');
      const files = fs.readdirSync(backupDir);

      for (const file of files) {
        const srcPath = path.join(backupDir, file);
        const destPath = path.join(userDataPath, file);
        fs.copyFileSync(srcPath, destPath);
      }

      log.info('[ReleaseManager] Restored from backup:', backupDir);
      this.recordHistory('restored', { backupDir });
      return true;
    } catch (error) {
      log.error('[ReleaseManager] Restore failed:', error);
      return false;
    }
  }

  private resolveBackupDir(backupRef: string): string {
    if (path.isAbsolute(backupRef)) {
      return backupRef;
    }
    return path.join(this.backupPath, backupRef);
  }

  async rollback(backupRef?: string): Promise<boolean> {
    const backups = this.listBackups();
    const target = backupRef ?? backups[0];
    if (!target) return false;
    const backupDir = this.resolveBackupDir(target);
    return this.restoreFromBackup(backupDir);
  }

  async deleteBackup(backupRef: string): Promise<boolean> {
    try {
      const backupDir = this.resolveBackupDir(backupRef);
      if (!fs.existsSync(backupDir)) {
        return false;
      }
      fs.rmSync(backupDir, { recursive: true, force: true });
      this.recordHistory('backup-deleted', { backupRef });
      return true;
    } catch (error) {
      log.error('[ReleaseManager] Delete backup failed:', error);
      return false;
    }
  }

  getHistory(): Array<{ timestamp: number; event: string; data?: unknown }> {
    return [...this.history];
  }

  getPreferences(): { autoCheck: boolean; checkInterval: number; lastCheck: number; skippedVersion: string | null; showChangelog: boolean } {
    return {
      autoCheck: this.config.autoCheck,
      checkInterval: this.config.checkInterval,
      lastCheck: this.config.lastCheck,
      skippedVersion: this.config.skipVersion,
      showChangelog: true,
    };
  }

  setPreferences(prefs: Partial<{ autoCheck: boolean; checkInterval: number; skippedVersion: string | null; showChangelog: boolean }>): { success: boolean } {
    this.updateConfig({
      autoCheck: prefs.autoCheck ?? this.config.autoCheck,
      checkInterval: prefs.checkInterval ?? this.config.checkInterval,
      skipVersion: prefs.skippedVersion ?? this.config.skipVersion,
      lastCheck: this.config.lastCheck,
      autoDownload: this.config.autoDownload,
      autoInstall: this.config.autoInstall,
      channel: this.config.channel,
      remindLaterUntil: this.config.remindLaterUntil,
    });
    return { success: true };
  }

  getInfo(): {
    currentVersion: string;
    updateAvailable: boolean;
    latestVersion?: string;
    releaseNotes?: string;
    lastCheck: number;
    skippedVersion: string | null;
    isDownloading: boolean;
    downloadProgress: number;
    remindLaterUntil: number;
    updateServerUrl: string;
  } {
    return {
      currentVersion: app.getVersion(),
      updateAvailable: this.status.available,
      latestVersion: this.status.updateInfo?.version,
      releaseNotes: this.status.updateInfo?.releaseNotes,
      lastCheck: this.config.lastCheck,
      skippedVersion: this.config.skipVersion,
      isDownloading: this.status.downloading,
      downloadProgress: this.status.progress,
      remindLaterUntil: this.config.remindLaterUntil || 0,
      updateServerUrl: this.updateServerUrl,
    };
  }

  async openReleaseNotes(): Promise<{ success: boolean; url: string }> {
    const url = 'https://github.com/onazioj179-lab/Dex/releases';
    await shell.openExternal(url);
    return { success: true, url };
  }

  getChangelog(): { currentVersion: string; changelog: string } {
    return {
      currentVersion: app.getVersion(),
      changelog: this.status.updateInfo?.releaseNotes || 'No changelog available',
    };
  }

  getReleaseNotesForVersion(version: string): { version: string; notes: string } {
    const changelogPath = path.join(process.resourcesPath, 'CHANGELOG.md');
    try {
      const text = fs.readFileSync(changelogPath, 'utf-8');
      const lines = text.split(/\r?\n/);
      let collecting = false;
      const collected: string[] = [];
      for (const line of lines) {
        const normalized = line.trim();
        if (/^#+\s*\d+\.\d+\.\d+/.test(normalized)) {
          if (collecting) break;
          collecting = normalized.includes(version);
          continue;
        }
        if (collecting && normalized.length > 0) {
          collected.push(normalized.replace(/^[-*]\s*/, ''));
        }
      }
      return {
        version,
        notes: collected.join('\n') || 'Release notes unavailable for this version.',
      };
    } catch {
      return {
        version,
        notes: 'Release notes unavailable for this version.',
      };
    }
  }

  listBackups(): string[] {
    try {
      if (!fs.existsSync(this.backupPath)) {
        return [];
      }
      return fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // IPC Setup
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('update:getConfig', () => this.getConfig());
    ipcMain.handle('update:updateConfig', (_e, updates) => {
      this.updateConfig(updates);
      return this.getConfig();
    });
    ipcMain.handle('update:getStatus', () => this.getStatus());
    ipcMain.handle('update:check', () => this.checkForUpdates());
    ipcMain.handle('update:download', () => this.downloadUpdate());
    ipcMain.handle('update:install', () => this.installUpdate());
    ipcMain.handle('update:skip', (_e, version?: string) => this.skipVersion(version));
    ipcMain.handle('update:listBackups', () => this.listBackups());
    ipcMain.handle('update:restore', (_e, backupDir) => this.restoreFromBackup(backupDir));
    ipcMain.handle('update:rollback', (_e, backupRef?: string) => this.rollback(backupRef));
    ipcMain.handle('update:deleteBackup', (_e, backupRef: string) => this.deleteBackup(backupRef));
    ipcMain.handle('update:getHistory', () => this.getHistory());

    ipcMain.handle('updates:check', async () => {
      const status = await this.checkForUpdates();
      return {
        success: !status.error,
        updateAvailable: status.available,
        info: status.updateInfo,
        error: status.error || undefined,
      };
    });
    ipcMain.handle('updates:download', async () => {
      const success = await this.downloadUpdate();
      return success ? { success: true } : { success: false, error: this.status.error || 'No update available or already downloading' };
    });
    ipcMain.handle('updates:install', async () => {
      try {
        await this.installUpdate();
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });
    ipcMain.handle('updates:skip', (_e, version?: string) => {
      this.skipVersion(version);
      return { success: true };
    });
    ipcMain.handle('updates:remindLater', (_e, hours?: number) => {
      this.remindMeLater(typeof hours === 'number' ? hours : 24);
      return { success: true };
    });
    ipcMain.handle('updates:getInfo', () => this.getInfo());
    ipcMain.handle('updates:getPreferences', () => this.getPreferences());
    ipcMain.handle('updates:setPreferences', (_e, prefs) => this.setPreferences(prefs));
    ipcMain.handle('updates:getRollbackHistory', () => this.getHistory().filter(entry => entry.event === 'restored'));
    ipcMain.handle('updates:openReleaseNotes', () => this.openReleaseNotes());
    ipcMain.handle('updates:getChangelog', () => this.getChangelog());
    ipcMain.handle('updates:getReleaseNotesForVersion', (_e, version: string) => this.getReleaseNotesForVersion(version));

    // Pro 30-day downgrade window
    ipcMain.handle('updates:canDowngrade', () => this.canDowngrade());
    ipcMain.handle('updates:downgrade', (_e, target?: string) => this.downgrade(target));
    ipcMain.handle('updates:getInstallHistory', () => this.getInstallHistory());

    // Cache reclaim
    ipcMain.handle('updates:pruneCache', () => this.pruneCache());
  }

  private notifyRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async initialize(): Promise<void> {
    // Check for updates on startup if enabled
    if (this.config.autoCheck) {
      const timeSinceLastCheck = Date.now() - this.config.lastCheck;
      const checkIntervalMs = this.config.checkInterval * 60 * 60 * 1000;
      
      if (timeSinceLastCheck > checkIntervalMs) {
        // Delay check to not slow down startup
        setTimeout(() => {
          this.checkForUpdates();
        }, 10000);
      }
    }

    try {
      if (fs.existsSync(this.postUpdateMarkerPath)) {
        const marker = JSON.parse(fs.readFileSync(this.postUpdateMarkerPath, 'utf-8')) as {
          targetVersion: string;
          backupPath?: string | null;
          timestamp: number;
          crashCount?: number;
        };

        const currentVersion = app.getVersion();
        const updateSucceeded = currentVersion === marker.targetVersion;
        const crashCount = marker.crashCount ?? 0;

        if (updateSucceeded) {
          // Update installed and app launched successfully — clean up
          log.info(`[ReleaseManager] Post-update verification passed: running ${currentVersion}`);
          this.notifyRenderer('update:installed', {
            version: marker.targetVersion,
            backupPath: marker.backupPath || null,
            timestamp: marker.timestamp,
          });
          this.recordHistory('post-update-verified', { version: currentVersion });
          fs.unlinkSync(this.postUpdateMarkerPath);
        } else if (crashCount >= 2 && marker.backupPath) {
          // Two failures after update — offer rollback
          log.error(`[ReleaseManager] Post-update crash detected (${crashCount} failures). Offering rollback.`);
          this.recordHistory('post-update-crash', { targetVersion: marker.targetVersion, crashCount });
          const choice = await dialog.showMessageBox({
            type: 'warning',
            title: 'Update Problem Detected',
            message: `DEX failed to start correctly after updating to ${marker.targetVersion}.`,
            detail: 'Would you like to restore your previous configuration from backup?',
            buttons: ['Restore Backup', 'Continue Anyway'],
            defaultId: 0,
            cancelId: 1,
          });
          if (choice.response === 0) {
            await this.restoreFromBackup(marker.backupPath);
            fs.unlinkSync(this.postUpdateMarkerPath);
            app.relaunch();
            app.exit(0);
            return;
          } else {
            fs.unlinkSync(this.postUpdateMarkerPath);
          }
        } else {
          // Increment crash counter so next failure triggers rollback offer
          log.warn(`[ReleaseManager] Post-update marker found but version mismatch (expected ${marker.targetVersion}, got ${currentVersion}). Crash count: ${crashCount + 1}`);
          fs.writeFileSync(this.postUpdateMarkerPath, JSON.stringify({
            ...marker,
            crashCount: crashCount + 1,
          }, null, 2), 'utf-8');
        }
      }
    } catch (err) {
      log.warn('[ReleaseManager] Post-update verification error:', err);
      try { fs.unlinkSync(this.postUpdateMarkerPath); } catch { /* ignore */ }
    }

    // Reclaim stale installer downloads from tmp/dex-cache. Run once on
    // startup (delayed so we don't block init) and then every 12 hours.
    setTimeout(() => { this.pruneCache(); }, 30_000);
    this.cachePruneTimer = setInterval(() => { this.pruneCache(); }, 12 * 60 * 60 * 1000);
    if (typeof this.cachePruneTimer.unref === 'function') this.cachePruneTimer.unref();

    log.info('[ReleaseManager] Initialized');
  }

  /**
   * Remove stale installer downloads from the temp cache. Anything older
   * than 3 days is removed unconditionally; the currently-downloaded
   * artifact (if any) is preserved regardless of age. Returns the number
   * of bytes freed.
   */
  pruneCache(maxAgeMs: number = 3 * 24 * 60 * 60 * 1000): { freedBytes: number; removed: number } {
    const cachePath = path.join(app.getPath('temp'), 'dex-cache');
    if (!fs.existsSync(cachePath)) return { freedBytes: 0, removed: 0 };

    const protectedPath = this.downloadedArtifactPath
      ? path.resolve(this.downloadedArtifactPath)
      : null;
    const cutoff = Date.now() - maxAgeMs;
    let freedBytes = 0;
    let removed = 0;

    const walk = (dir: string): void => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          // Remove now-empty directories
          try {
            if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
          } catch { /* ignore */ }
          continue;
        }
        if (!entry.isFile()) continue;
        if (protectedPath && path.resolve(full) === protectedPath) continue;
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < cutoff) {
            freedBytes += stat.size;
            fs.unlinkSync(full);
            removed += 1;
          }
        } catch { /* ignore */ }
      }
    };

    walk(cachePath);
    if (removed > 0) {
      log.info(`[ReleaseManager] Cache prune freed ${(freedBytes / 1024 / 1024).toFixed(1)} MB across ${removed} files`);
      this.recordHistory('cache-pruned', { freedBytes, removed });
    }
    return { freedBytes, removed };
  }

  dispose(): void {
    if (this.cachePruneTimer) {
      clearInterval(this.cachePruneTimer);
      this.cachePruneTimer = null;
    }
  }

  private loadUpdateServerUrl(): string {
    const userConfigPath = path.join(app.getPath('userData'), UPDATE_SERVER_CONFIG_FILE);
    // Update server URL -- configure via userData config file when a real server is deployed.
    // Left empty to prevent accidental connections to a non-existent endpoint.
    const fallback = '';

    try {
      if (!fs.existsSync(userConfigPath)) {
        fs.writeFileSync(userConfigPath, JSON.stringify({ url: fallback }, null, 2), 'utf-8');
      }
      const parsed = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8')) as { url?: string };
      return parsed.url || fallback;
    } catch {
      return fallback;
    }
  }

  private isHttpsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

// -----------------------------------------------------------------------------
// Version Info
// -----------------------------------------------------------------------------

export function getVersionInfo(): {
  version: string;
  channel: string;
  buildDate: string;
  electron: string;
  node: string;
  platform: string;
} {
  return {
    version: app.getVersion(),
    channel: 'stable',
    buildDate: new Date().toISOString().split('T')[0],
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  };
}

// -----------------------------------------------------------------------------
// Clean Uninstall Support
// -----------------------------------------------------------------------------

export async function prepareCleanUninstall(): Promise<{
  dataLocation: string;
  configLocation: string;
  cacheLocation: string;
  totalSize: number;
}> {
  const userDataPath = app.getPath('userData');
  const cachePath = path.join(app.getPath('temp'), 'dex-cache');
  
  const getDirectorySize = (dirPath: string): number => {
    let totalSize = 0;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          totalSize += getDirectorySize(filePath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch {
      // Ignore errors
    }
    return totalSize;
  };

  return {
    dataLocation: userDataPath,
    configLocation: userDataPath,
    cacheLocation: cachePath,
    totalSize: getDirectorySize(userDataPath) + getDirectorySize(cachePath),
  };
}

export async function cleanUninstall(removeUserData: boolean = false): Promise<void> {
  const cachePath = path.join(app.getPath('temp'), 'dex-cache');
  
  // Always remove cache
  try {
    fs.rmSync(cachePath, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }

  // Optionally remove user data
  if (removeUserData) {
    const userDataPath = app.getPath('userData');
    try {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }

  log.info('[ReleaseManager] Clean uninstall completed');
}

export default ReleaseManager;
