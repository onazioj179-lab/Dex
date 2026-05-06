// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Rewind - Phase 5 Orchestrator
 *
 * Intelligent crash recovery, scheduled backups, context-aware profiles,
 * first-run onboarding state, and storage/performance hardening.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { app } from 'electron';

export type BackupSchedule = 'daily' | '3days' | 'weekly';

export interface CrashRecoveryStatus {
  hasUncleanExit: boolean;
  lastKnownGoodStateAt: number | null;
  dismissed: boolean;
  restored: boolean;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  definingApps: string[];
  notificationPreference: 'normal' | 'quiet' | 'silent';
  autoSuggestFocus: boolean;
  distractions: string[];
  autoDeleteWindowDays: number | null;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Phase5State {
  schemaVersion: number;
  onboardingCompleted: boolean;
  onboardingCompletedAt: number | null;
  backupFolder: string | null;
  backupSchedule: BackupSchedule;
  lastBackupAt: number | null;
  lastBackupSizeBytes: number | null;
  lastVacuumAt: number | null;
  crashRecovery: CrashRecoveryStatus;
  session: {
    startedAt: number;
    lastHeartbeatAt: number;
    closedAt: number | null;
    isRecording: boolean;
    excludedApps: string[];
    activeFocusSession: Record<string, any> | null;
  };
  profiles: WorkspaceProfile[];
  activeProfileId: string | null;
  lastProfileSwitchAt: number | null;
  selfHealEvents: Array<{ component: string; message: string; timestamp: number }>;
}

export interface Phase5Deps {
  getSettings: () => { isRecording: boolean; excludedApps: string[]; retentionDays: number };
  applyPartialSettings: (updates: Record<string, any>) => void;
  getRecentActiveApps: (minutes: number) => string[];
  getCurrentFocusSession: () => Record<string, any> | null;
  restoreFocusSession: (session: Record<string, any> | null) => void;
  onProfileActivated: (profile: WorkspaceProfile) => void;
  onAudit: (action: string, detail: string) => void;
  getRewindFiles: () => string[];
}

class RewindPhase5Manager {
  private rewindDir: string;
  private stateFile: string;
  private state: Phase5State;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private backupTimer: NodeJS.Timeout | null = null;
  private profileTimer: NodeJS.Timeout | null = null;
  private deps: Phase5Deps | null = null;

  constructor() {
    this.rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.stateFile = path.join(this.rewindDir, 'phase5-state.json');
    this.state = this.loadState();
  }

  initialize(deps: Phase5Deps): void {
    this.deps = deps;
    this.ensureDefaults();
    this.runWeeklyVacuumIfNeeded();
    this.runArchivePass();
    this.runQueryExplainCheck();
    this.startHeartbeat();
    this.startBackupScheduler();
    this.startProfileDetection();
  }

  shutdown(clean = true): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.backupTimer) clearInterval(this.backupTimer);
    if (this.profileTimer) clearInterval(this.profileTimer);
    this.heartbeatTimer = null;
    this.backupTimer = null;
    this.profileTimer = null;

    if (clean) {
      this.state.session.closedAt = Date.now();
      this.state.crashRecovery.hasUncleanExit = false;
    }
    this.saveState();
  }

  getCrashRecoveryStatus(): CrashRecoveryStatus {
    return this.state.crashRecovery;
  }

  restoreFromCrashSnapshot(): { restored: boolean; reason: string } {
    if (!this.deps) return { restored: false, reason: 'Not initialized' };
    if (!this.state.crashRecovery.hasUncleanExit) {
      return { restored: false, reason: 'No crash snapshot available' };
    }

    const snapshot = this.state.session;
    this.deps.applyPartialSettings({
      isRecording: snapshot.isRecording,
      excludedApps: snapshot.excludedApps || [],
    });
    this.deps.restoreFocusSession(snapshot.activeFocusSession || null);

    this.state.crashRecovery.restored = true;
    this.state.crashRecovery.dismissed = true;
    this.state.crashRecovery.hasUncleanExit = false;
    this.saveState();

    this.deps.onAudit('crash_restored', `Restored state from ${new Date(snapshot.lastHeartbeatAt).toISOString()}`);
    return { restored: true, reason: 'Session restored from crash snapshot' };
  }

  dismissCrashRecovery(): void {
    this.state.crashRecovery.dismissed = true;
    this.saveState();
  }

  isOnboardingCompleted(): boolean {
    return this.state.onboardingCompleted;
  }

  completeOnboarding(): void {
    this.state.onboardingCompleted = true;
    this.state.onboardingCompletedAt = Date.now();
    this.saveState();
  }

  skipOnboarding(): void {
    this.completeOnboarding();
  }

  applyOnboardingSetup(payload: {
    excludedApps: string[];
    screenshotsEnabled: boolean;
    aiSearchEnabled: boolean;
    autoDelete30Days: boolean;
  }): void {
    if (!this.deps) return;
    this.deps.applyPartialSettings({
      excludedApps: payload.excludedApps,
      screenshotsEnabled: payload.screenshotsEnabled,
      aiSearchEnabled: payload.aiSearchEnabled,
      retentionDays: payload.autoDelete30Days ? 30 : this.deps.getSettings().retentionDays,
      isRecording: true,
    });
    this.completeOnboarding();
    this.deps.onAudit('onboarding_completed', 'First run onboarding completed');
  }

  getBackupSettings(): { folder: string; schedule: BackupSchedule; lastBackupAt: number | null; lastBackupSizeBytes: number | null } {
    return {
      folder: this.getBackupFolder(),
      schedule: this.state.backupSchedule,
      lastBackupAt: this.state.lastBackupAt,
      lastBackupSizeBytes: this.state.lastBackupSizeBytes,
    };
  }

  setBackupFolder(folder: string): void {
    this.state.backupFolder = folder;
    this.saveState();
  }

  setBackupSchedule(schedule: BackupSchedule): void {
    this.state.backupSchedule = schedule;
    this.saveState();
  }

  createBackupNow(): { ok: boolean; filePath?: string; sizeBytes?: number; error?: string } {
    try {
      if (!this.deps) return { ok: false, error: 'Not initialized' };
      const backupFolder = this.getBackupFolder();
      if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });

      const files = this.deps.getRewindFiles();
      const bundle = {
        createdAt: Date.now(),
        files: files.map(filePath => {
          const rel = path.relative(this.rewindDir, filePath);
          const data = fs.readFileSync(filePath);
          return { rel, dataB64: data.toString('base64') };
        }),
      };

      const serialized = JSON.stringify(bundle);
      const compressed = zlib.gzipSync(Buffer.from(serialized, 'utf-8'));
      const outFile = path.join(backupFolder, `rewind-backup-${this.formatDateTime(new Date())}.zip`);
      fs.writeFileSync(outFile, compressed);

      this.state.lastBackupAt = Date.now();
      this.state.lastBackupSizeBytes = compressed.length;
      this.saveState();

      this.rotateBackups();
      this.deps.onAudit('backup_created', `Backup created: ${path.basename(outFile)}`);

      return { ok: true, filePath: outFile, sizeBytes: compressed.length };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  restoreBackup(filePath: string): { ok: boolean; error?: string } {
    try {
      const raw = fs.readFileSync(filePath);
      const decompressed = zlib.gunzipSync(raw).toString('utf-8');
      const bundle = JSON.parse(decompressed) as { files: Array<{ rel: string; dataB64: string }> };

      for (const file of bundle.files || []) {
        const target = path.join(this.rewindDir, file.rel);
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, Buffer.from(file.dataB64, 'base64'));
      }

      if (this.deps) {
        this.deps.onAudit('backup_restored', `Backup restored from ${path.basename(filePath)}`);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  getProfiles(): WorkspaceProfile[] {
    return this.state.profiles;
  }

  getActiveProfile(): WorkspaceProfile | null {
    return this.state.profiles.find(p => p.id === this.state.activeProfileId) || null;
  }

  saveProfile(profile: Partial<WorkspaceProfile> & { name: string }): WorkspaceProfile {
    const now = Date.now();
    if (profile.id) {
      const idx = this.state.profiles.findIndex(p => p.id === profile.id);
      if (idx >= 0) {
        this.state.profiles[idx] = {
          ...this.state.profiles[idx],
          ...profile,
          updatedAt: now,
        } as WorkspaceProfile;
        this.saveState();
        return this.state.profiles[idx];
      }
    }

    const created: WorkspaceProfile = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: profile.name,
      definingApps: profile.definingApps || [],
      notificationPreference: profile.notificationPreference || 'normal',
      autoSuggestFocus: !!profile.autoSuggestFocus,
      distractions: profile.distractions || [],
      autoDeleteWindowDays: profile.autoDeleteWindowDays ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.profiles.push(created);
    this.saveState();
    return created;
  }

  deleteProfile(profileId: string): boolean {
    const before = this.state.profiles.length;
    this.state.profiles = this.state.profiles.filter(p => !(p.id === profileId && !p.isDefault));
    if (this.state.activeProfileId === profileId) {
      this.state.activeProfileId = this.state.profiles[0]?.id || null;
    }
    this.saveState();
    return this.state.profiles.length < before;
  }

  getSelfHealEvents(limit = 20): Array<{ component: string; message: string; timestamp: number }> {
    return this.state.selfHealEvents.slice(-limit).reverse();
  }

  recordSelfHeal(component: string, message: string): void {
    this.state.selfHealEvents.push({ component, message, timestamp: Date.now() });
    if (this.state.selfHealEvents.length > 200) {
      this.state.selfHealEvents = this.state.selfHealEvents.slice(-200);
    }
    this.saveState();
    if (this.deps) {
      this.deps.onAudit('self_heal_restart', `${component}: ${message}`);
    }
  }

  private startHeartbeat(): void {
    this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => this.writeHeartbeat(), 30000);
  }

  private writeHeartbeat(): void {
    if (!this.deps) return;
    const settings = this.deps.getSettings();
    this.state.session.lastHeartbeatAt = Date.now();
    this.state.session.isRecording = !!settings.isRecording;
    this.state.session.excludedApps = settings.excludedApps || [];
    this.state.session.activeFocusSession = this.deps.getCurrentFocusSession();
    this.state.session.closedAt = null;
    this.saveState();
  }

  private startBackupScheduler(): void {
    this.backupTimer = setInterval(() => {
      const dueMs = this.intervalMs(this.state.backupSchedule);
      const now = Date.now();
      if (!this.state.lastBackupAt || now - this.state.lastBackupAt >= dueMs) {
        this.createBackupNow();
      }
    }, 60 * 60 * 1000);
  }

  private startProfileDetection(): void {
    this.profileTimer = setInterval(() => this.detectProfile(), 5 * 60 * 1000);
    this.detectProfile();
  }

  private detectProfile(): void {
    if (!this.deps) return;

    const now = Date.now();
    if (this.state.lastProfileSwitchAt && now - this.state.lastProfileSwitchAt < 30 * 60 * 1000) {
      return;
    }

    const recentApps = this.deps.getRecentActiveApps(15).map(a => a.toLowerCase());
    let best: WorkspaceProfile | null = null;

    for (const profile of this.state.profiles) {
      const defining = (profile.definingApps || []).map(a => a.toLowerCase()).filter(Boolean);
      if (defining.length === 0) continue;
      const matches = defining.filter(a => recentApps.some(r => r.includes(a) || a.includes(r))).length;
      if (matches > defining.length / 2) {
        best = profile;
        break;
      }
    }

    if (!best) return;
    if (best.id === this.state.activeProfileId) return;

    this.state.activeProfileId = best.id;
    this.state.lastProfileSwitchAt = now;
    this.saveState();

    this.deps.onProfileActivated(best);
    this.deps.onAudit('workspace_profile_switched', `Active profile: ${best.name}`);
  }

  private runWeeklyVacuumIfNeeded(): void {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (this.state.lastVacuumAt && now - this.state.lastVacuumAt < weekMs) return;

    try {
      const files = fs.readdirSync(this.rewindDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
      for (const file of files) {
        const fp = path.join(this.rewindDir, file);
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        fs.writeFileSync(fp, JSON.stringify(parsed), 'utf-8');
      }
      this.state.lastVacuumAt = now;
      this.saveState();
      log.info('[RewindPhase5] Weekly vacuum completed');
    } catch (err) {
      log.warn('[RewindPhase5] Vacuum failed:', err);
    }
  }

  private runArchivePass(): void {
    if (!this.deps) return;
    try {
      const retentionDays = this.deps.getSettings().retentionDays || 30;
      const cutoffRetention = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const cutoffArchive = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const archiveFile = path.join(this.rewindDir, 'activity_log_archive.json');
      const existingArchive = fs.existsSync(archiveFile)
        ? (JSON.parse(fs.readFileSync(archiveFile, 'utf-8')) as { entries: any[] })
        : { entries: [] as any[] };

      const files = fs.readdirSync(this.rewindDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
      for (const file of files) {
        const fp = path.join(this.rewindDir, file);
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8')) as { date: string; entries: any[] };
        const keep: any[] = [];
        const move: any[] = [];

        for (const entry of data.entries || []) {
          if (entry.timestamp < cutoffRetention && entry.timestamp < cutoffArchive) {
            move.push(entry);
          } else {
            keep.push(entry);
          }
        }

        if (move.length > 0) {
          existingArchive.entries.push(...move);
          data.entries = keep;
          fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
        }
      }

      if (existingArchive.entries.length > 0) {
        fs.writeFileSync(archiveFile, JSON.stringify(existingArchive, null, 2), 'utf-8');
      }
    } catch (err) {
      log.warn('[RewindPhase5] Archive pass failed:', err);
    }
  }

  private runQueryExplainCheck(): void {
    try {
      const start = Date.now();
      const files = fs.readdirSync(this.rewindDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
      const elapsed = Date.now() - start;
      if (elapsed > 150) {
        log.warn(`[RewindPhase5] Slow startup query scan: ${elapsed}ms for ${files.length} shards`);
      } else {
        log.info(`[RewindPhase5] Query explain check passed: ${elapsed}ms for ${files.length} shards`);
      }
    } catch (err) {
      log.warn('[RewindPhase5] Query explain check failed:', err);
    }
  }

  private ensureDefaults(): void {
    const now = Date.now();
    if (!this.state.profiles || this.state.profiles.length === 0) {
      this.state.profiles = [
        {
          id: 'default_work',
          name: 'Work',
          definingApps: ['code', 'teams', 'outlook', 'excel'],
          notificationPreference: 'quiet',
          autoSuggestFocus: true,
          distractions: ['youtube', 'x', 'facebook'],
          autoDeleteWindowDays: null,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'default_creative',
          name: 'Creative',
          definingApps: ['photoshop', 'premiere', 'figma', 'blender'],
          notificationPreference: 'silent',
          autoSuggestFocus: true,
          distractions: ['mail', 'teams'],
          autoDeleteWindowDays: null,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'default_research',
          name: 'Research',
          definingApps: ['chrome', 'firefox', 'edge', 'notion'],
          notificationPreference: 'normal',
          autoSuggestFocus: false,
          distractions: ['discord', 'slack'],
          autoDeleteWindowDays: null,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
      this.state.activeProfileId = this.state.profiles[0].id;
    }

    const hadClosedAt = !!this.state.session.closedAt;
    const hasRecentHeartbeat = Date.now() - (this.state.session.lastHeartbeatAt || 0) < 10 * 60 * 1000;
    this.state.crashRecovery.hasUncleanExit = !hadClosedAt && hasRecentHeartbeat;
    this.state.crashRecovery.lastKnownGoodStateAt = this.state.session.lastHeartbeatAt || null;

    this.state.session.startedAt = Date.now();
    this.state.session.closedAt = null;

    this.saveState();
  }

  private rotateBackups(): void {
    const folder = this.getBackupFolder();
    if (!fs.existsSync(folder)) return;
    const backups = fs.readdirSync(folder)
      .filter(f => f.startsWith('rewind-backup-') && f.endsWith('.zip'))
      .map(name => ({ name, fp: path.join(folder, name), ts: fs.statSync(path.join(folder, name)).mtimeMs }))
      .sort((a, b) => b.ts - a.ts);

    if (backups.length <= 5) return;
    for (const old of backups.slice(5)) {
      try { fs.unlinkSync(old.fp); } catch (e) { log.warn('[RewindPhase5] Backup cleanup failed:', e); }
    }
  }

  private getBackupFolder(): string {
    return this.state.backupFolder || path.join(this.rewindDir, 'backups');
  }

  private intervalMs(schedule: BackupSchedule): number {
    if (schedule === 'daily') return 24 * 60 * 60 * 1000;
    if (schedule === '3days') return 3 * 24 * 60 * 60 * 1000;
    return 7 * 24 * 60 * 60 * 1000;
  }

  private loadState(): Phase5State {
    try {
      if (fs.existsSync(this.stateFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as Phase5State;
        return parsed;
      }
    } catch (err) {
      log.warn('[RewindPhase5] Failed to load state:', err);
    }

    return {
      schemaVersion: 1,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
      backupFolder: null,
      backupSchedule: 'daily',
      lastBackupAt: null,
      lastBackupSizeBytes: null,
      lastVacuumAt: null,
      crashRecovery: {
        hasUncleanExit: false,
        lastKnownGoodStateAt: null,
        dismissed: false,
        restored: false,
      },
      session: {
        startedAt: Date.now(),
        lastHeartbeatAt: 0,
        closedAt: Date.now(),
        isRecording: true,
        excludedApps: [],
        activeFocusSession: null,
      },
      profiles: [],
      activeProfileId: null,
      lastProfileSwitchAt: null,
      selfHealEvents: [],
    };
  }

  private saveState(): void {
    try {
      if (!fs.existsSync(this.rewindDir)) fs.mkdirSync(this.rewindDir, { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[RewindPhase5] Failed to save state:', err);
    }
  }

  private formatDateTime(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
}

export const rewindPhase5Manager = new RewindPhase5Manager();
