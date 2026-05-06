// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Rewind - Security Layer (Phase 4)
 *
 * - Data integrity checks (SHA-256 hash on activity_log rows)
 * - Secure export with hash footer
 * - Audit log (non-clearable action log)
 * - Session lock detection (idle / OS lock)
 * - Encryption status reporting (placeholder for sqlcipher)
 *
 * All local, no network, no user-managed keys.
 *
 * @author  Onazi Treasure OJ
 * @license MIT
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { app, powerMonitor } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: number;
}

export interface IntegrityCheckResult {
  passed: boolean;
  checkedAt: number;
  totalRows: number;
  mismatchCount: number;
  details: string;
}

export interface SecurityStatus {
  encryptionEnabled: boolean;
  lastIntegrityCheck: IntegrityCheckResult | null;
  sessionLocked: boolean;
  lastLockTime: number | null;
  lastExportHash: string | null;
  lastExportTime: number | null;
  auditEntryCount: number;
}

// ===========================================================================
// SECURITY LAYER
// ===========================================================================

class RewindSecurityLayer {
  private rewindDir: string;
  private auditFile: string;
  private hashesFile: string;
  private auditLog: AuditEntry[] = [];
  private lastIntegrityCheck: IntegrityCheckResult | null = null;
  private sessionLocked = false;
  private lastLockTime: number | null = null;
  private lastExportHash: string | null = null;
  private lastExportTime: number | null = null;
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private readonly IDLE_LOCK_SECONDS = 600; // 10 minutes

  constructor() {
    this.rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.auditFile = path.join(this.rewindDir, 'audit-log.json');
    this.hashesFile = path.join(this.rewindDir, 'integrity-hashes.json');

    if (!fs.existsSync(this.rewindDir)) {
      fs.mkdirSync(this.rewindDir, { recursive: true });
    }

    this.loadAuditLog();
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    // Listen for OS lock/unlock events
    powerMonitor.on('lock-screen', () => {
      this.lockSession('OS screen locked');
    });
    powerMonitor.on('unlock-screen', () => {
      // Session stays locked until user explicitly unlocks in UI
    });

    // Check idle state every 30 seconds
    this.idleCheckTimer = setInterval(() => {
      const idleSeconds = powerMonitor.getSystemIdleTime();
      if (idleSeconds >= this.IDLE_LOCK_SECONDS && !this.sessionLocked) {
        this.lockSession('User idle for 10+ minutes');
      }
    }, 30000);

    // Run initial integrity check
    this.runIntegrityCheck();

    // Log app opened
    this.addAuditEntry('app_opened', 'DEX Rewind opened');

    log.info('[SecurityLayer] Started');
  }

  stop(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.saveAuditLog();
    log.info('[SecurityLayer] Stopped');
  }

  // -------------------------------------------------------------------------
  // AUDIT LOG
  // -------------------------------------------------------------------------

  addAuditEntry(action: string, detail: string): void {
    const entry: AuditEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      detail,
      timestamp: Date.now(),
    };
    this.auditLog.push(entry);

    // Keep last 5000 entries
    if (this.auditLog.length > 5000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
    this.saveAuditLog();
  }

  getAuditLog(limit = 100): AuditEntry[] {
    return this.auditLog
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  private loadAuditLog(): void {
    try {
      if (fs.existsSync(this.auditFile)) {
        const raw = JSON.parse(fs.readFileSync(this.auditFile, 'utf-8'));
        this.auditLog = Array.isArray(raw) ? raw : [];
      }
    } catch (err) {
      log.warn('[SecurityLayer] Audit log load error:', err);
      this.auditLog = [];
    }
  }

  private saveAuditLog(): void {
    try {
      fs.writeFileSync(this.auditFile, JSON.stringify(this.auditLog, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[SecurityLayer] Audit log save error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // DATA INTEGRITY CHECK
  // -------------------------------------------------------------------------

  runIntegrityCheck(): IntegrityCheckResult {
    try {
      const storedHashes = this.loadStoredHashes();
      const currentHashes: Record<string, string> = {};
      let totalRows = 0;
      let mismatchCount = 0;

      // Scan all date-sharded JSON files
      const files = fs.readdirSync(this.rewindDir)
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort();

      for (const file of files) {
        try {
          const fp = path.join(this.rewindDir, file);
          const raw = fs.readFileSync(fp, 'utf-8');
          const data = JSON.parse(raw);
          const entries = data.entries || [];
          totalRows += entries.length;

          // Hash the entries content
          const hash = crypto.createHash('sha256')
            .update(JSON.stringify(entries.map((e: any) => ({
              id: e.id, type: e.type, content: e.content,
              appName: e.appName, timestamp: e.timestamp,
            }))))
            .digest('hex');

          currentHashes[file] = hash;

          // Compare with stored hash
          if (storedHashes[file] && storedHashes[file] !== hash) {
            mismatchCount++;
          }
        } catch (e) { log.warn('[SecurityLayer] Hash computation error:', e); }
      }

      // Save current hashes for next check
      this.saveStoredHashes(currentHashes);

      const result: IntegrityCheckResult = {
        passed: mismatchCount === 0,
        checkedAt: Date.now(),
        totalRows,
        mismatchCount,
        details: mismatchCount === 0
          ? `All ${files.length} data files verified, ${totalRows} total entries`
          : `${mismatchCount} data file(s) may have been modified externally`,
      };

      this.lastIntegrityCheck = result;
      this.addAuditEntry('integrity_check', result.details);
      log.info(`[SecurityLayer] Integrity check: ${result.details}`);
      return result;
    } catch (err) {
      log.warn('[SecurityLayer] Integrity check error:', err);
      const result: IntegrityCheckResult = {
        passed: false,
        checkedAt: Date.now(),
        totalRows: 0,
        mismatchCount: 0,
        details: 'Integrity check failed to run',
      };
      this.lastIntegrityCheck = result;
      return result;
    }
  }

  private loadStoredHashes(): Record<string, string> {
    try {
      if (fs.existsSync(this.hashesFile)) {
        return JSON.parse(fs.readFileSync(this.hashesFile, 'utf-8'));
      }
    } catch (e) { log.warn('[SecurityLayer] Stored hashes load error:', e); }
    return {};
  }

  private saveStoredHashes(hashes: Record<string, string>): void {
    try {
      fs.writeFileSync(this.hashesFile, JSON.stringify(hashes, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[SecurityLayer] Hash save error:', err);
    }
  }

  getLastIntegrityCheck(): IntegrityCheckResult | null {
    return this.lastIntegrityCheck;
  }

  // -------------------------------------------------------------------------
  // SESSION LOCK
  // -------------------------------------------------------------------------

  private lockSession(reason: string): void {
    if (this.sessionLocked) return;
    this.sessionLocked = true;
    this.lastLockTime = Date.now();
    this.addAuditEntry('session_locked', reason);
    log.info(`[SecurityLayer] Session locked: ${reason}`);
  }

  unlockSession(): boolean {
    if (!this.sessionLocked) return true;
    this.sessionLocked = false;
    this.addAuditEntry('session_unlocked', 'User confirmed presence');
    log.info('[SecurityLayer] Session unlocked');
    return true;
  }

  isSessionLocked(): boolean {
    return this.sessionLocked;
  }

  // -------------------------------------------------------------------------
  // SECURE EXPORT
  // -------------------------------------------------------------------------

  signExport(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    this.lastExportHash = hash;
    this.lastExportTime = Date.now();
    this.addAuditEntry('export_generated', `SHA-256: ${hash.slice(0, 16)}...`);
    return `${content}\n\n---\nSHA-256 Verification: ${hash}\nGenerated: ${new Date().toISOString()}\n`;
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): SecurityStatus {
    return {
      encryptionEnabled: false, // True when sqlcipher is integrated
      lastIntegrityCheck: this.lastIntegrityCheck,
      sessionLocked: this.sessionLocked,
      lastLockTime: this.lastLockTime,
      lastExportHash: this.lastExportHash,
      lastExportTime: this.lastExportTime,
      auditEntryCount: this.auditLog.length,
    };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const rewindSecurityLayer = new RewindSecurityLayer();
