// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Data Integrity System
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// Corruption detection, recovery, and safe writes
// ===========================================================================

import log from 'electron-log';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export interface IntegrityStatus {
  file: string;
  valid: boolean;
  checksum?: string;
  lastVerified: number;
  errors: string[];
  recoverable: boolean;
}

export interface WriteTransaction {
  id: string;
  file: string;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'writing' | 'verifying' | 'completed' | 'failed' | 'rolled-back';
  backupPath?: string;
}

export interface RecoveryResult {
  success: boolean;
  file: string;
  method: 'backup' | 'rebuild' | 'default';
  message: string;
  dataLoss: boolean;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const CHECKSUM_ALGORITHM = 'sha256';
const BACKUP_EXTENSION = '.backup';
const TEMP_EXTENSION = '.tmp';
const JOURNAL_FILE = 'write-journal.json';

// ===========================================================================
// DATA INTEGRITY CLASS
// ===========================================================================

class DataIntegrityClass {
  private journalPath: string;
  private pendingTransactions: Map<string, WriteTransaction> = new Map();
  private checksums: Map<string, string> = new Map();

  constructor() {
    this.journalPath = path.join(app.getPath('userData'), JOURNAL_FILE);
    this.loadJournal();
    this.recoverInterruptedWrites();
  }

  // -------------------------------------------------------------------------
  // SAFE WRITE OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Perform a safe atomic write with backup and verification
   */
  async safeWrite(filePath: string, data: string | Buffer): Promise<{ success: boolean; error?: string }> {
    const transaction = this.beginTransaction(filePath);

    try {
      // Step 1: Create backup of existing file
      if (fs.existsSync(filePath)) {
        transaction.backupPath = filePath + BACKUP_EXTENSION;
        await this.copyFile(filePath, transaction.backupPath);
      }

      // Step 2: Write to temp file
      const tempPath = filePath + TEMP_EXTENSION;
      transaction.status = 'writing';
      this.saveJournal();

      await this.writeFile(tempPath, data);

      // Step 3: Verify temp file
      transaction.status = 'verifying';
      this.saveJournal();

      const verified = await this.verifyFile(tempPath, data);
      if (!verified) {
        throw new Error('Write verification failed');
      }

      // Step 4: Atomic rename temp to target
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tempPath, filePath);

      // Step 5: Update checksum
      const checksum = this.calculateChecksum(data);
      this.checksums.set(filePath, checksum);

      // Step 6: Clean up backup (optional - keep for extra safety)
      // if (transaction.backupPath && fs.existsSync(transaction.backupPath)) {
      //   fs.unlinkSync(transaction.backupPath);
      // }

      // Complete transaction
      transaction.status = 'completed';
      transaction.completedAt = Date.now();
      this.pendingTransactions.delete(transaction.id);
      this.saveJournal();

      return { success: true };
    } catch (error) {
      // Rollback on failure
      await this.rollbackTransaction(transaction);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[DataIntegrity] Safe write failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Begin a write transaction
   */
  private beginTransaction(filePath: string): WriteTransaction {
    const transaction: WriteTransaction = {
      id: `tx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      file: filePath,
      startedAt: Date.now(),
      status: 'pending',
    };

    this.pendingTransactions.set(transaction.id, transaction);
    this.saveJournal();

    return transaction;
  }

  /**
   * Rollback a failed transaction
   */
  private async rollbackTransaction(transaction: WriteTransaction): Promise<void> {
    log.info(`[DataIntegrity] Rolling back transaction ${transaction.id}`);

    try {
      // Remove temp file if exists
      const tempPath = transaction.file + TEMP_EXTENSION;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      // Restore from backup if available
      if (transaction.backupPath && fs.existsSync(transaction.backupPath)) {
        if (fs.existsSync(transaction.file)) {
          fs.unlinkSync(transaction.file);
        }
        fs.renameSync(transaction.backupPath, transaction.file);
        log.info(`[DataIntegrity] Restored from backup`);
      }

      transaction.status = 'rolled-back';
    } catch (error) {
      log.error(`[DataIntegrity] Rollback failed:`, error);
    } finally {
      this.pendingTransactions.delete(transaction.id);
      this.saveJournal();
    }
  }

  // -------------------------------------------------------------------------
  // INTEGRITY VERIFICATION
  // -------------------------------------------------------------------------

  /**
   * Verify file integrity
   */
  async verifyIntegrity(filePath: string): Promise<IntegrityStatus> {
    const status: IntegrityStatus = {
      file: filePath,
      valid: false,
      lastVerified: Date.now(),
      errors: [],
      recoverable: false,
    };

    try {
      // Check file exists
      if (!fs.existsSync(filePath)) {
        status.errors.push('File does not exist');
        status.recoverable = fs.existsSync(filePath + BACKUP_EXTENSION);
        return status;
      }

      // Read and parse
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Verify JSON structure
      if (filePath.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch {
          status.errors.push('Invalid JSON structure');
          status.recoverable = fs.existsSync(filePath + BACKUP_EXTENSION);
          return status;
        }
      }

      // Calculate checksum
      status.checksum = this.calculateChecksum(content);

      // Check against stored checksum
      const storedChecksum = this.checksums.get(filePath);
      if (storedChecksum && storedChecksum !== status.checksum) {
        status.errors.push('Checksum mismatch - file may have been modified externally');
        // Not necessarily corrupted, just modified outside Dex
      }

      status.valid = status.errors.length === 0;
      this.checksums.set(filePath, status.checksum);

    } catch (error) {
      status.errors.push(`Read error: ${error instanceof Error ? error.message : 'Unknown'}`);
      status.recoverable = fs.existsSync(filePath + BACKUP_EXTENSION);
    }

    return status;
  }

  /**
   * Verify all data files
   */
  async verifyAllFiles(): Promise<IntegrityStatus[]> {
    const userData = app.getPath('userData');
    const dataFiles = [
      'dex-data.json',
      'dex-sessions.json',
      'dex-encryption.json',
      'dex-permissions.json',
    ];

    const results: IntegrityStatus[] = [];

    for (const file of dataFiles) {
      const filePath = path.join(userData, file);
      if (fs.existsSync(filePath)) {
        const status = await this.verifyIntegrity(filePath);
        results.push(status);
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // RECOVERY
  // -------------------------------------------------------------------------

  /**
   * Attempt to recover a corrupted file
   */
  async recoverFile(filePath: string): Promise<RecoveryResult> {
    log.info(`[DataIntegrity] Attempting to recover: ${filePath}`);

    // Try backup first
    const backupPath = filePath + BACKUP_EXTENSION;
    if (fs.existsSync(backupPath)) {
      try {
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        
        // Verify backup is valid
        if (filePath.endsWith('.json')) {
          JSON.parse(backupContent);
        }

        // Restore from backup
        fs.copyFileSync(backupPath, filePath);
        
        return {
          success: true,
          file: filePath,
          method: 'backup',
          message: 'Restored from backup successfully',
          dataLoss: false,
        };
      } catch {
        log.warn(`[DataIntegrity] Backup also corrupted`);
      }
    }

    // Try to rebuild from defaults
    const defaults = this.getDefaultsForFile(filePath);
    if (defaults) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), 'utf-8');
        
        return {
          success: true,
          file: filePath,
          method: 'default',
          message: 'Reset to defaults (some data may have been lost)',
          dataLoss: true,
        };
      } catch (error) {
        log.error(`[DataIntegrity] Failed to write defaults:`, error);
      }
    }

    return {
      success: false,
      file: filePath,
      method: 'rebuild',
      message: 'Recovery failed - manual intervention may be required',
      dataLoss: true,
    };
  }

  /**
   * Recover from interrupted writes on startup
   */
  private recoverInterruptedWrites(): void {
    const transactions = Array.from(this.pendingTransactions.values());
    
    for (const transaction of transactions) {
      if (transaction.status === 'writing' || transaction.status === 'verifying') {
        log.warn(`[DataIntegrity] Found interrupted write: ${transaction.file}`);
        this.rollbackTransaction(transaction);
      }
    }
  }

  /**
   * Get default data for a file
   */
  private getDefaultsForFile(filePath: string): any {
    const fileName = path.basename(filePath);
    
    const defaults: Record<string, any> = {
      'dex-data.json': {
        actions: [],
        modes: [],
        rules: [],
        operations: [],
        sessions: [],
        settings: {},
        permissions: {
          openApps: true,
          closeApps: false,
          runCommands: false,
          adjustVolume: true,
          fileSystem: true,
          network: true,
        },
      },
      'dex-sessions.json': {
        sessions: [],
        activeSession: null,
      },
    };

    return defaults[fileName] ?? null;
  }

  // -------------------------------------------------------------------------
  // JOURNAL
  // -------------------------------------------------------------------------

  private loadJournal(): void {
    try {
      if (fs.existsSync(this.journalPath)) {
        const data = JSON.parse(fs.readFileSync(this.journalPath, 'utf-8'));
        this.pendingTransactions = new Map(Object.entries(data.transactions ?? {}));
        this.checksums = new Map(Object.entries(data.checksums ?? {}));
      }
    } catch (error) {
      log.error(`[DataIntegrity] Failed to load journal:`, error);
    }
  }

  private saveJournal(): void {
    try {
      const data = {
        transactions: Object.fromEntries(this.pendingTransactions),
        checksums: Object.fromEntries(this.checksums),
      };
      fs.writeFileSync(this.journalPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.error(`[DataIntegrity] Failed to save journal:`, error);
    }
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private calculateChecksum(data: string | Buffer): string {
    return crypto.createHash(CHECKSUM_ALGORITHM).update(data).digest('hex');
  }

  private async copyFile(src: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.copyFile(src, dest, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async writeFile(filePath: string, data: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async verifyFile(filePath: string, expectedData: string | Buffer): Promise<boolean> {
    try {
      const actualData = fs.readFileSync(filePath);
      const expectedChecksum = this.calculateChecksum(expectedData);
      const actualChecksum = this.calculateChecksum(actualData);
      return expectedChecksum === actualChecksum;
    } catch {
      return false;
    }
  }

  /**
   * Create a manual backup
   */
  async createBackup(filePath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(filePath)) return null;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = filePath.replace('.json', `-${timestamp}.backup.json`);
      
      await this.copyFile(filePath, backupPath);
      log.info(`[DataIntegrity] Created backup: ${backupPath}`);
      
      return backupPath;
    } catch (error) {
      log.error(`[DataIntegrity] Backup failed:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const dataIntegrity = new DataIntegrityClass();
