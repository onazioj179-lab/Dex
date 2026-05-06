// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Encryption Orchestrator
// ==========================================================================
// Main-process encryption coordinator. Manages master key lifecycle,
// per-database key derivation via HKDF, integrity hash storage and
// verification, audit trail logging, and memory zeroing on shutdown.
// Encryption primitives run on the security worker thread; this module
// orchestrates calls and caches derived keys for sub-millisecond access.
// ==========================================================================

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app, ipcMain, BrowserWindow, safeStorage } from 'electron';
import { databaseCluster } from './DatabaseCluster';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MASTER_KEY_LENGTH = 32; // 256 bits
const DERIVED_KEY_SALT = 'dex-hkdf-salt-v1';
const INTEGRITY_ALGORITHM = 'sha256';
const KEY_FILE_NAME = 'dex-master.key';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DerivedKeyEntry {
  key: Buffer;
  derivedAt: number;
}

interface IntegrityResult {
  filePath: string;
  expected: string;
  actual: string;
  valid: boolean;
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// Encryption Orchestrator
// ---------------------------------------------------------------------------

class EncryptionOrchestrator {
  private masterKey: Buffer | null = null;
  private derivedKeys = new Map<string, DerivedKeyEntry>();
  private keyFilePath: string = '';
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  initialize(win: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = win;

    try {
      const userData = app.getPath('userData');
      const secureDir = path.join(userData, 'secure');
      if (!fs.existsSync(secureDir)) {
        fs.mkdirSync(secureDir, { recursive: true, mode: 0o700 });
      }
      this.keyFilePath = path.join(secureDir, KEY_FILE_NAME);
    } catch (err) {
      log.warn('[EncryptionOrchestrator] Secure directory creation failed:', err);
    }

    this.loadOrCreateMasterKey();
    this.registerIPC();
    this.initialized = true;
    log.info('[EncryptionOrchestrator] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Master key management
  // ---------------------------------------------------------------------------

  private loadOrCreateMasterKey(): void {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const encrypted = fs.readFileSync(this.keyFilePath);
        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(encrypted);
          this.masterKey = Buffer.from(decrypted, 'hex');
          log.info('[EncryptionOrchestrator] Master key loaded from OS keychain');
        } else {
          // Fallback: key stored as-is (less secure, but functional)
          this.masterKey = Buffer.from(encrypted.toString('utf8'), 'hex');
          log.warn('[EncryptionOrchestrator] OS encryption unavailable; using fallback key storage');
        }
      } else {
        this.masterKey = crypto.randomBytes(MASTER_KEY_LENGTH);
        this.persistMasterKey();
        log.info('[EncryptionOrchestrator] New master key generated');

        // Record key creation in security audit
        databaseCluster.auditLog('master-key-created', 'encryption', 'New master key generated on first launch', 'info');
        databaseCluster.writeStmt('sec:set-key-meta', 'master-v1', 'master-encryption', 'aes-256-gcm', Date.now(), null);
      }
    } catch (err) {
      log.error('[EncryptionOrchestrator] Master key load/create failed:', err);
      // Generate ephemeral key for this session
      this.masterKey = crypto.randomBytes(MASTER_KEY_LENGTH);
      log.warn('[EncryptionOrchestrator] Using ephemeral master key (will not persist)');
    }
  }

  private persistMasterKey(): void {
    if (!this.masterKey) return;
    try {
      const hex = this.masterKey.toString('hex');
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(hex);
        fs.writeFileSync(this.keyFilePath, encrypted, { mode: 0o600 });
      } else {
        fs.writeFileSync(this.keyFilePath, hex, { mode: 0o600 });
      }
    } catch (err) {
      log.error('[EncryptionOrchestrator] Failed to persist master key:', err);
    }
  }

  rotateMasterKey(): void {
    const oldKey = this.masterKey;
    this.masterKey = crypto.randomBytes(MASTER_KEY_LENGTH);
    this.derivedKeys.clear();
    this.persistMasterKey();

    // Zero old key
    if (oldKey) {
      oldKey.fill(0);
    }

    databaseCluster.auditLog('master-key-rotated', 'encryption', 'Master key rotated', 'info');
    databaseCluster.writeStmt('sec:set-key-meta', 'master-v1', 'master-encryption', 'aes-256-gcm', Date.now(), Date.now());
    log.info('[EncryptionOrchestrator] Master key rotated');
  }

  // ---------------------------------------------------------------------------
  // Key derivation (HKDF, cached for sub-millisecond repeated access)
  // ---------------------------------------------------------------------------

  deriveKey(purpose: string): Buffer {
    const cached = this.derivedKeys.get(purpose);
    if (cached) return cached.key;

    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    const derived = crypto.hkdfSync(
      'sha256',
      this.masterKey,
      Buffer.from(DERIVED_KEY_SALT, 'utf8'),
      Buffer.from(purpose, 'utf8'),
      MASTER_KEY_LENGTH
    );

    const keyBuffer = Buffer.from(derived);
    this.derivedKeys.set(purpose, { key: keyBuffer, derivedAt: Date.now() });
    return keyBuffer;
  }

  deriveDatabaseKey(dbName: string): Buffer {
    return this.deriveKey(`db:${dbName}`);
  }

  // ---------------------------------------------------------------------------
  // Encrypt / Decrypt
  // ---------------------------------------------------------------------------

  encrypt(data: Buffer, purpose: string): Buffer {
    const key = this.deriveKey(purpose);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: [IV (16)] [AuthTag (16)] [Ciphertext (...)]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  decrypt(data: Buffer, purpose: string): Buffer {
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid encrypted data: too short');
    }
    const key = this.deriveKey(purpose);
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  encryptString(plaintext: string, purpose: string): string {
    const encrypted = this.encrypt(Buffer.from(plaintext, 'utf8'), purpose);
    return encrypted.toString('base64');
  }

  decryptString(ciphertext: string, purpose: string): string {
    const data = Buffer.from(ciphertext, 'base64');
    const decrypted = this.decrypt(data, purpose);
    return decrypted.toString('utf8');
  }

  // ---------------------------------------------------------------------------
  // File integrity
  // ---------------------------------------------------------------------------

  computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash(INTEGRITY_ALGORITHM).update(content).digest('hex');
  }

  storeFileHash(filePath: string): void {
    const hash = this.computeFileHash(filePath);
    databaseCluster.writeStmt('sec:set-hash', filePath, hash, INTEGRITY_ALGORITHM, Date.now());
  }

  verifyFileHash(filePath: string): IntegrityResult {
    const actual = this.computeFileHash(filePath);
    const row = databaseCluster.runStmt('sec:get-hash', filePath) as { hash: string; algorithm: string; verified_at: number } | undefined;
    const expected = row?.hash ?? '';
    const valid = expected !== '' && actual === expected;

    // Update verified_at timestamp
    if (valid) {
      databaseCluster.writeStmt('sec:set-hash', filePath, actual, INTEGRITY_ALGORITHM, Date.now());
    }

    return { filePath, expected, actual, valid, checkedAt: Date.now() };
  }

  verifyAllStoredHashes(): IntegrityResult[] {
    const results: IntegrityResult[] = [];
    const rows = databaseCluster.allStmt('sec:all-hashes') as Array<{ file_path: string; hash: string; verified_at: number }>;

    for (const row of rows) {
      try {
        if (!fs.existsSync(row.file_path)) {
          results.push({
            filePath: row.file_path,
            expected: row.hash,
            actual: '',
            valid: false,
            checkedAt: Date.now(),
          });
          continue;
        }
        results.push(this.verifyFileHash(row.file_path));
      } catch {
        results.push({
          filePath: row.file_path,
          expected: row.hash,
          actual: 'ERROR',
          valid: false,
          checkedAt: Date.now(),
        });
      }
    }

    // Audit if any failures
    const failures = results.filter(r => !r.valid);
    if (failures.length > 0) {
      databaseCluster.auditLog(
        'integrity-check-failures',
        'encryption',
        `${failures.length} of ${results.length} files failed integrity check`,
        failures.length > 5 ? 'critical' : 'warn'
      );
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Data hashing
  // ---------------------------------------------------------------------------

  hashData(data: string | Buffer): string {
    return crypto.createHash(INTEGRITY_ALGORITHM).update(data).digest('hex');
  }

  hashDataHMAC(data: string | Buffer, purpose: string): string {
    const key = this.deriveKey(purpose);
    return crypto.createHmac(INTEGRITY_ALGORITHM, key).update(data).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // IPC handlers
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('encryption:encrypt-string', (_e, plaintext: string, purpose: string) => {
      try {
        return { success: true, data: this.encryptString(plaintext, purpose) };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('encryption:decrypt-string', (_e, ciphertext: string, purpose: string) => {
      try {
        return { success: true, data: this.decryptString(ciphertext, purpose) };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('encryption:hash', (_e, data: string) => {
      return this.hashData(data);
    });

    ipcMain.handle('encryption:verify-file', (_e, filePath: string) => {
      try {
        return this.verifyFileHash(filePath);
      } catch (err: any) {
        return { filePath, expected: '', actual: '', valid: false, checkedAt: Date.now(), error: err.message };
      }
    });

    ipcMain.handle('encryption:verify-all', () => {
      return this.verifyAllStoredHashes();
    });

    ipcMain.handle('encryption:store-file-hash', (_e, filePath: string) => {
      try {
        this.storeFileHash(filePath);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('encryption:status', () => {
      return {
        initialized: this.initialized,
        hasMasterKey: this.masterKey !== null,
        derivedKeyCount: this.derivedKeys.size,
        osEncryptionAvailable: safeStorage.isEncryptionAvailable(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    // Zero all derived keys
    for (const [, entry] of this.derivedKeys) {
      entry.key.fill(0);
    }
    this.derivedKeys.clear();

    // Zero master key
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }

    this.initialized = false;
    log.info('[EncryptionOrchestrator] Shutdown complete, all keys zeroed');
  }
}

export const encryptionOrchestrator = new EncryptionOrchestrator();

export function initializeEncryptionOrchestrator(win: BrowserWindow): void {
  encryptionOrchestrator.initialize(win);
}

export function shutdownEncryptionOrchestrator(): void {
  encryptionOrchestrator.shutdown();
}
