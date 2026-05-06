// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX -- Update Service
// Lightweight version polling that supplements ReleaseManager.
// Polls a remote VERSION.txt to detect updates between electron-updater checks.
// ===========================================================================

import { app, ipcMain, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { ReleaseManager } from './ReleaseManager';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface VersionCheckResult {
  currentVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  checkedAt: number;
  error: string | null;
}

interface UpdateServiceConfig {
  pollIntervalHours: number;
  enabled: boolean;
  lastPoll: number;
  versionUrl: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CONFIG_FILE = 'update-service.json';

const DEFAULT_CONFIG: UpdateServiceConfig = {
  pollIntervalHours: 4,
  enabled: true,
  lastPoll: 0,
  versionUrl: '',
};

// -----------------------------------------------------------------------------
// Semantic version comparison
// -----------------------------------------------------------------------------

function semverCompare(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// -----------------------------------------------------------------------------
// Update Service
// -----------------------------------------------------------------------------

export class UpdateService {
  private config: UpdateServiceConfig;
  private configPath: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastResult: VersionCheckResult | null = null;
  private releaseManager: ReleaseManager | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, CONFIG_FILE);
    this.config = this.loadConfig();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  private loadConfig(): UpdateServiceConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      log.error('[UpdateService] Config load failed:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[UpdateService] Config save failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // Version Polling
  // -------------------------------------------------------------------------

  private async fetchRemoteVersion(): Promise<string | null> {
    const url = this.config.versionUrl;
    if (!url) return null;

    // Enforce HTTPS
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        log.warn('[UpdateService] Rejecting non-HTTPS version URL');
        return null;
      }
    } catch {
      return null;
    }

    return new Promise<string | null>((resolve) => {
      const request = net.request(url);
      let body = '';
      const timeout = setTimeout(() => {
        request.abort();
        resolve(null);
      }, 10000);

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          clearTimeout(timeout);
          resolve(null);
          return;
        }
        response.on('data', (chunk) => { body += chunk.toString(); });
        response.on('end', () => {
          clearTimeout(timeout);
          const version = body.trim().split('\n')[0].trim();
          if (/^\d+\.\d+\.\d+/.test(version.replace(/^v/, ''))) {
            resolve(version.replace(/^v/, ''));
          } else {
            resolve(null);
          }
        });
      });

      request.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      request.end();
    });
  }

  async checkVersion(): Promise<VersionCheckResult> {
    const currentVersion = app.getVersion();
    let remoteVersion: string | null = null;
    let error: string | null = null;

    try {
      remoteVersion = await this.fetchRemoteVersion();
    } catch (e) {
      error = (e as Error).message;
    }

    const result: VersionCheckResult = {
      currentVersion,
      remoteVersion,
      updateAvailable: remoteVersion !== null && semverCompare(remoteVersion, currentVersion) > 0,
      checkedAt: Date.now(),
      error,
    };

    this.lastResult = result;
    this.config.lastPoll = Date.now();
    this.saveConfig();

    // If update detected, trigger the full electron-updater check
    if (result.updateAvailable && this.releaseManager) {
      log.info(`[UpdateService] Remote version ${remoteVersion} > ${currentVersion}, triggering full check`);
      this.releaseManager.checkForUpdates().catch((e: unknown) => { log.warn('[DEX]', e); });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Polling Lifecycle
  // -------------------------------------------------------------------------

  startPolling(): void {
    if (!this.config.enabled || !this.config.versionUrl) return;
    this.stopPolling();

    const intervalMs = this.config.pollIntervalHours * 60 * 60 * 1000;

    // Initial check if enough time has passed
    const timeSinceLastPoll = Date.now() - this.config.lastPoll;
    if (timeSinceLastPoll >= intervalMs) {
      setTimeout(() => this.checkVersion().catch((e: unknown) => { log.warn('[DEX]', e); }), 15000);
    }

    this.pollTimer = setInterval(() => {
      this.checkVersion().catch((e: unknown) => { log.warn('[DEX]', e); });
    }, intervalMs);

    log.info(`[UpdateService] Polling started (every ${this.config.pollIntervalHours}h)`);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Integration
  // -------------------------------------------------------------------------

  setReleaseManager(manager: ReleaseManager): void {
    this.releaseManager = manager;
  }

  getLastResult(): VersionCheckResult | null {
    return this.lastResult;
  }

  // -------------------------------------------------------------------------
  // IPC
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('update-service:check', () => this.checkVersion());
    ipcMain.handle('update-service:getLastResult', () => this.lastResult);
    ipcMain.handle('update-service:getConfig', () => ({
      pollIntervalHours: this.config.pollIntervalHours,
      enabled: this.config.enabled,
      lastPoll: this.config.lastPoll,
    }));
    ipcMain.handle('update-service:setConfig', (_e, updates: Partial<Pick<UpdateServiceConfig, 'pollIntervalHours' | 'enabled'>>) => {
      if (updates.pollIntervalHours !== undefined) {
        this.config.pollIntervalHours = Math.max(1, Math.min(168, updates.pollIntervalHours));
      }
      if (updates.enabled !== undefined) {
        this.config.enabled = updates.enabled;
        if (updates.enabled) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      }
      this.saveConfig();
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    log.info('[UpdateService] Initialized');
    this.startPolling();
  }

  dispose(): void {
    this.stopPolling();
  }
}
