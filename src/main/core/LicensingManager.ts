// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { app, ipcMain, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3';

type LicenseTier = 'free' | 'pro' | 'team';

interface LicenseRecord {
  id: number;
  tier: LicenseTier;
  license_key: string | null;
  activated_at: number | null;
  expires_at: number | null;
  machine_id: string | null;
  last_verified: number | null;
  verification_hash: string | null;
  trial_started_at: number | null;
  trial_expires_at: number | null;
  failed_verifications: number;
}

interface TelemetryPayload {
  dex_version: string;
  os_platform: string;
  os_version: string;
  launch_count: number;
  app_sessions: Record<string, number>;
  feature_usage: Record<string, number>;
  period_start: number;
  period_end: number;
}

interface CrashReport {
  id: string;
  dex_version: string;
  os_version: string;
  tier: LicenseTier;
  stack_trace: string;
  performance_entries: any[];
  timestamp: number;
  sent: boolean;
}

interface FeatureFlagConfig {
  [featureName: string]: LicenseTier;
}

const FEATURE_FLAGS_CONFIG: FeatureFlagConfig = {
  'notes.basic': 'free',
  'notes.attachments': 'free',
  'notes.templates': 'free',
  'tasks.basic': 'free',
  'tasks.kanban': 'free',
  'tasks.kanban.unlimited': 'pro',
  'media.library': 'free',
  'media.unlimited_storage': 'pro',
  'automation.basic': 'free',
  'automation.unlimited_rules': 'pro',
  'rewind.basic': 'free',
  'rewind.full': 'pro',
  'rift.game': 'free',
  'vinx.basic': 'free',
  'vinx.full': 'pro',
  'multi_window': 'pro',
  'store.free_items': 'free',
  'store.paid_items': 'pro',
  'developer.console': 'free',
  'developer.extensions': 'free',
  'early_access': 'pro',
  'team.collaboration': 'team',
  'team.admin': 'team',
  'team.priority_support': 'team',
  'analytics.basic': 'free',
  'analytics.advanced': 'pro',
  'export.basic': 'free',
  'export.advanced': 'pro',
  'themes.basic': 'free',
  'themes.custom': 'free',
  'search.basic': 'free',
  'search.advanced': 'pro',
  'voice.memos': 'free',
  'voice.transcription': 'pro',
  'security.encryption': 'free',
  'security.vault': 'free',
  'backup.manual': 'free',
  'backup.automatic': 'free',
  'import.basic': 'free'
};

const FREE_LIMITS = {
  maxStorageBytes: 5 * 1024 * 1024 * 1024,
  maxKanbanBoards: 3,
  maxAutomationRules: 5
};

const TRIAL_DURATION_DAYS = 30;
const VERIFICATION_INTERVAL_DAYS = 30;
const MAX_FAILED_VERIFICATIONS = 3;
const TELEMETRY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS license (
  id INTEGER PRIMARY KEY,
  tier TEXT DEFAULT 'free',
  license_key TEXT,
  activated_at INTEGER,
  expires_at INTEGER,
  machine_id TEXT,
  last_verified INTEGER,
  verification_hash TEXT,
  trial_started_at INTEGER,
  trial_expires_at INTEGER,
  failed_verifications INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telemetry_settings (
  id INTEGER PRIMARY KEY,
  telemetry_enabled INTEGER DEFAULT 0,
  crash_reporting_enabled INTEGER DEFAULT 0,
  prompt_shown INTEGER DEFAULT 0,
  last_sent_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telemetry_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  key TEXT,
  value INTEGER DEFAULT 0,
  period_start INTEGER,
  period_end INTEGER
);

CREATE TABLE IF NOT EXISTS crash_reports (
  id TEXT PRIMARY KEY,
  dex_version TEXT,
  os_version TEXT,
  tier TEXT,
  stack_trace TEXT,
  performance_entries TEXT,
  timestamp INTEGER,
  sent INTEGER DEFAULT 0,
  user_approved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telemetry_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at INTEGER,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_data_type_key ON telemetry_data(type, key);
CREATE INDEX IF NOT EXISTS idx_crash_reports_timestamp ON crash_reports(timestamp);
`;

export class LicensingManager extends EventEmitter {
  private db: Database.Database | null = null;
  private license: LicenseRecord | null = null;
  private featureFlags: Map<string, boolean> = new Map();
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    try {
      this.mainWindow = mainWindow || null;
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(SCHEMA_SQL);

      this.loadLicense();
      this.checkTrialStatus();
      this.buildFeatureFlags();
      this.initializeTelemetry();
      this.setupIPC();

      this.initialized = true;
      log.info('[LicensingManager] Initialized. Tier:', this.getCurrentTier());
    } catch (err) {
      log.error('[LicensingManager] Initialization failed:', err);
    }
  }

  private loadLicense(): void {
    if (!this.db) return;
    let row = this.db.prepare('SELECT * FROM license WHERE id = 1').get() as LicenseRecord | undefined;
    if (!row) {
      const now = Date.now();
      const trialExpires = now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
      this.db.prepare(`
        INSERT INTO license (id, tier, trial_started_at, trial_expires_at, failed_verifications)
        VALUES (1, 'pro', ?, ?, 0)
      `).run(now, trialExpires);
      row = this.db.prepare('SELECT * FROM license WHERE id = 1').get() as LicenseRecord;
    }
    this.license = row;
  }

  private checkTrialStatus(): void {
    if (!this.license || !this.db) return;
    if (this.license.license_key) return;

    if (this.license.trial_expires_at && Date.now() > this.license.trial_expires_at) {
      this.db.prepare('UPDATE license SET tier = ? WHERE id = 1').run('free');
      this.license.tier = 'free';
      log.info('[LicensingManager] Trial expired, downgraded to free tier');
    }
  }

  private buildFeatureFlags(): void {
    this.featureFlags.clear();
    const currentTier = this.getCurrentTier();
    const tierRank: Record<LicenseTier, number> = { free: 0, pro: 1, team: 2 };
    const currentRank = tierRank[currentTier] || 0;

    for (const [feature, minTier] of Object.entries(FEATURE_FLAGS_CONFIG)) {
      const requiredRank = tierRank[minTier] || 0;
      this.featureFlags.set(feature, currentRank >= requiredRank);
    }
  }

  isFeatureEnabled(featureName: string): boolean {
    const flag = this.featureFlags.get(featureName);
    if (flag === undefined) return true;
    return flag;
  }

  getCurrentTier(): LicenseTier {
    return this.license?.tier || 'free';
  }

  isTrialActive(): boolean {
    if (!this.license) return false;
    if (this.license.license_key) return false;
    if (!this.license.trial_expires_at) return false;
    return Date.now() < this.license.trial_expires_at;
  }

  getTrialDaysRemaining(): number {
    if (!this.license?.trial_expires_at) return 0;
    if (this.license.license_key) return 0;
    const remaining = this.license.trial_expires_at - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }

  getLimits(): typeof FREE_LIMITS | null {
    if (this.getCurrentTier() === 'free') return { ...FREE_LIMITS };
    return null;
  }

  activateLicense(key: string): { success: boolean; error?: string } {
    if (!this.db || !this.license) return { success: false, error: 'System not initialized' };

    const keyPattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
    if (!keyPattern.test(key)) {
      return { success: false, error: 'Invalid license key format. Expected format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' };
    }

    const machineId = this.computeMachineId();
    const verificationHash = this.computeVerificationHash(key, machineId);
    const now = Date.now();

    this.db.prepare(`
      UPDATE license SET
        tier = 'pro',
        license_key = ?,
        activated_at = ?,
        machine_id = ?,
        last_verified = ?,
        verification_hash = ?,
        failed_verifications = 0
      WHERE id = 1
    `).run(key, now, machineId, now, verificationHash);

    this.license.tier = 'pro';
    this.license.license_key = key;
    this.license.activated_at = now;
    this.license.machine_id = machineId;
    this.license.last_verified = now;
    this.license.verification_hash = verificationHash;
    this.license.failed_verifications = 0;

    this.buildFeatureFlags();
    this.emit('license-changed', { tier: 'pro' });

    log.info('[LicensingManager] License activated for machine:', machineId.substring(0, 8) + '...');
    return { success: true };
  }

  deactivateLicense(): boolean {
    if (!this.db || !this.license) return false;

    this.db.prepare(`
      UPDATE license SET
        tier = 'free',
        license_key = NULL,
        activated_at = NULL,
        machine_id = NULL,
        last_verified = NULL,
        verification_hash = NULL,
        failed_verifications = 0
      WHERE id = 1
    `).run();

    this.license.tier = 'free';
    this.license.license_key = null;
    this.buildFeatureFlags();
    this.emit('license-changed', { tier: 'free' });

    return true;
  }

  verifyLicense(): { valid: boolean; error?: string } {
    if (!this.license?.license_key || !this.license.machine_id || !this.license.verification_hash) {
      return { valid: false, error: 'No active license' };
    }

    const currentMachineId = this.computeMachineId();
    const expectedHash = this.computeVerificationHash(this.license.license_key, currentMachineId);

    if (expectedHash !== this.license.verification_hash) {
      return { valid: false, error: 'Machine ID mismatch' };
    }

    return { valid: true };
  }

  private computeMachineId(): string {
    const cpuModel = os.cpus()[0]?.model || 'unknown';
    const totalMem = os.totalmem().toString();
    const platform = os.platform();
    const input = `${cpuModel}|${totalMem}|${platform}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private computeVerificationHash(key: string, machineId: string): string {
    return crypto.createHash('sha256').update(`${key}:${machineId}`).digest('hex');
  }

  private initializeTelemetry(): void {
    if (!this.db) return;
    let settings = this.db.prepare('SELECT * FROM telemetry_settings WHERE id = 1').get() as any;
    if (!settings) {
      this.db.prepare('INSERT INTO telemetry_settings (id) VALUES (1)').run();
    }
  }

  isTelemetryEnabled(): boolean {
    if (!this.db) return false;
    const row = this.db.prepare('SELECT telemetry_enabled FROM telemetry_settings WHERE id = 1').get() as any;
    return row?.telemetry_enabled === 1;
  }

  setTelemetryEnabled(enabled: boolean): void {
    if (!this.db) return;
    this.db.prepare('UPDATE telemetry_settings SET telemetry_enabled = ?, prompt_shown = 1 WHERE id = 1').run(enabled ? 1 : 0);
    if (enabled && !this.telemetryTimer) {
      this.startTelemetryTimer();
    } else if (!enabled && this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  isCrashReportingEnabled(): boolean {
    if (!this.db) return false;
    const row = this.db.prepare('SELECT crash_reporting_enabled FROM telemetry_settings WHERE id = 1').get() as any;
    return row?.crash_reporting_enabled === 1;
  }

  setCrashReportingEnabled(enabled: boolean): void {
    if (!this.db) return;
    this.db.prepare('UPDATE telemetry_settings SET crash_reporting_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
  }

  wasTelemetryPromptShown(): boolean {
    if (!this.db) return false;
    const row = this.db.prepare('SELECT prompt_shown FROM telemetry_settings WHERE id = 1').get() as any;
    return row?.prompt_shown === 1;
  }

  recordTelemetryEvent(type: string, key: string): void {
    if (!this.isTelemetryEnabled() || !this.db) return;
    const now = Date.now();
    const weekStart = now - (now % TELEMETRY_INTERVAL_MS);
    const existing = this.db.prepare('SELECT id, value FROM telemetry_data WHERE type = ? AND key = ? AND period_start = ?').get(type, key, weekStart) as any;
    if (existing) {
      this.db.prepare('UPDATE telemetry_data SET value = value + 1 WHERE id = ?').run(existing.id);
    } else {
      this.db.prepare('INSERT INTO telemetry_data (type, key, value, period_start, period_end) VALUES (?, ?, 1, ?, ?)').run(type, key, weekStart, weekStart + TELEMETRY_INTERVAL_MS);
    }
  }

  private startTelemetryTimer(): void {
    this.telemetryTimer = setInterval(() => {
      this.buildAndLogTelemetryPayload();
    }, TELEMETRY_INTERVAL_MS);
  }

  private buildAndLogTelemetryPayload(): TelemetryPayload | null {
    if (!this.db || !this.isTelemetryEnabled()) return null;

    const now = Date.now();
    const periodStart = now - TELEMETRY_INTERVAL_MS;

    const rows = this.db.prepare('SELECT type, key, value FROM telemetry_data WHERE period_start >= ?').all(periodStart) as any[];

    const appSessions: Record<string, number> = {};
    const featureUsage: Record<string, number> = {};
    let launchCount = 0;

    for (const row of rows) {
      if (row.type === 'app_session') {
        appSessions[row.key] = (appSessions[row.key] || 0) + row.value;
      } else if (row.type === 'feature') {
        featureUsage[row.key] = (featureUsage[row.key] || 0) + row.value;
      } else if (row.type === 'launch') {
        launchCount += row.value;
      }
    }

    const payload: TelemetryPayload = {
      dex_version: app.getVersion(),
      os_platform: os.platform(),
      os_version: os.release(),
      launch_count: launchCount,
      app_sessions: appSessions,
      feature_usage: featureUsage,
      period_start: periodStart,
      period_end: now
    };

    this.db.prepare('INSERT INTO telemetry_log (sent_at, payload) VALUES (?, ?)').run(now, JSON.stringify(payload));
    this.db.prepare('UPDATE telemetry_settings SET last_sent_at = ? WHERE id = 1').run(now);

    return payload;
  }

  getLastTelemetryPayload(): any {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT payload FROM telemetry_log ORDER BY sent_at DESC LIMIT 1').get() as any;
    if (row) {
      try { return JSON.parse(row.payload); } catch (_e) { return null; }
    }
    return null;
  }

  recordCrashReport(stackTrace: string, performanceEntries: any[]): string {
    if (!this.db) return '';
    const id = crypto.randomUUID();
    const report: CrashReport = {
      id,
      dex_version: app.getVersion(),
      os_version: `${os.platform()} ${os.release()}`,
      tier: this.getCurrentTier(),
      stack_trace: stackTrace,
      performance_entries: performanceEntries,
      timestamp: Date.now(),
      sent: false
    };

    this.db.prepare(`
      INSERT INTO crash_reports (id, dex_version, os_version, tier, stack_trace, performance_entries, timestamp, sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, report.dex_version, report.os_version, report.tier, report.stack_trace, JSON.stringify(report.performance_entries), report.timestamp);

    return id;
  }

  getPendingCrashReport(): CrashReport | null {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT * FROM crash_reports WHERE sent = 0 AND user_approved = 0 ORDER BY timestamp DESC LIMIT 1').get() as any;
    if (!row) return null;
    return {
      id: row.id,
      dex_version: row.dex_version,
      os_version: row.os_version,
      tier: row.tier,
      stack_trace: row.stack_trace,
      performance_entries: JSON.parse(row.performance_entries || '[]'),
      timestamp: row.timestamp,
      sent: false
    };
  }

  approveCrashReport(id: string): void {
    if (!this.db) return;
    this.db.prepare('UPDATE crash_reports SET user_approved = 1, sent = 1 WHERE id = ?').run(id);
  }

  declineCrashReport(id: string): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM crash_reports WHERE id = ?').run(id);
  }

  private setupIPC(): void {
    ipcMain.handle('licensing:get-tier', () => this.getCurrentTier());
    ipcMain.handle('licensing:get-license-info', () => {
      if (!this.license) return null;
      return {
        tier: this.license.tier,
        licenseKey: this.license.license_key ? this.license.license_key.substring(0, 5) + '-*****-*****-*****-*****' : null,
        activatedAt: this.license.activated_at,
        expiresAt: this.license.expires_at,
        isTrialActive: this.isTrialActive(),
        trialDaysRemaining: this.getTrialDaysRemaining(),
        limits: this.getLimits()
      };
    });
    ipcMain.handle('licensing:activate', (_e, key: string) => this.activateLicense(key));
    ipcMain.handle('licensing:deactivate', () => this.deactivateLicense());
    ipcMain.handle('licensing:verify', () => this.verifyLicense());
    ipcMain.handle('licensing:is-feature-enabled', (_e, feature: string) => this.isFeatureEnabled(feature));
    ipcMain.handle('licensing:get-feature-flags', () => {
      const flags: Record<string, boolean> = {};
      for (const [k, v] of this.featureFlags) flags[k] = v;
      return flags;
    });
    ipcMain.handle('licensing:get-limits', () => this.getLimits());

    ipcMain.handle('licensing:is-telemetry-enabled', () => this.isTelemetryEnabled());
    ipcMain.handle('licensing:set-telemetry-enabled', (_e, enabled: boolean) => this.setTelemetryEnabled(enabled));
    ipcMain.handle('licensing:is-crash-reporting-enabled', () => this.isCrashReportingEnabled());
    ipcMain.handle('licensing:set-crash-reporting-enabled', (_e, enabled: boolean) => this.setCrashReportingEnabled(enabled));
    ipcMain.handle('licensing:was-telemetry-prompt-shown', () => this.wasTelemetryPromptShown());
    ipcMain.handle('licensing:get-last-telemetry', () => this.getLastTelemetryPayload());
    ipcMain.handle('licensing:get-pending-crash-report', () => this.getPendingCrashReport());
    ipcMain.handle('licensing:approve-crash-report', (_e, id: string) => this.approveCrashReport(id));
    ipcMain.handle('licensing:decline-crash-report', (_e, id: string) => this.declineCrashReport(id));
  }

  destroy(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[LicensingManager] Destroyed');
  }
}

export const licensingManager = new LicensingManager();
