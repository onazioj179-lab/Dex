// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Secure Transfer & Export
// ==========================================================================
// Rules 91-93: Transfer / Export Security Architecture
// 91. Secure temp file handling with auto-cleanup
// 92. Encrypted exports with AES-256-GCM
// 93. Transfer progress verification with hash comparison
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMP_DIR_NAME = 'dex-temp';
const TEMP_MAX_AGE_MS = 3_600_000; // 1 hour
const TEMP_CLEANUP_INTERVAL_MS = 600_000; // 10 minutes
const EXPORT_ALGORITHM = 'aes-256-gcm';
const EXPORT_KEY_LENGTH = 32;
const EXPORT_IV_LENGTH = 16;
const EXPORT_AUTH_TAG_LENGTH = 16;

// ---------------------------------------------------------------------------
// Rule 91: Secure temp file handling
// ---------------------------------------------------------------------------

class SecureTempManager {
  private tempDir: string;
  private trackedFiles = new Set<string>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.tempDir = path.join(app.getPath('temp'), TEMP_DIR_NAME);
  }

  initialize(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Cleanup stale temp files from previous sessions
    this.cleanupStale();

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanupStale(), TEMP_CLEANUP_INTERVAL_MS);
  }

  createTempFile(prefix: string = 'dex', extension: string = '.tmp'): string {
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    const filePath = path.join(this.tempDir, name);
    fs.writeFileSync(filePath, ''); // Create empty file
    this.trackedFiles.add(filePath);
    return filePath;
  }

  createTempDir(prefix: string = 'dex'): string {
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const dirPath = path.join(this.tempDir, name);
    fs.mkdirSync(dirPath, { recursive: true });
    this.trackedFiles.add(dirPath);
    return dirPath;
  }

  releaseTempFile(filePath: string): void {
    this.trackedFiles.delete(filePath);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          // Overwrite with zeros before deleting (secure delete)
          const size = stat.size;
          if (size > 0 && size < 100 * 1024 * 1024) { // Only for files < 100MB
            const zeros = Buffer.alloc(Math.min(size, 4096), 0);
            const fd = fs.openSync(filePath, 'w');
            let written = 0;
            while (written < size) {
              const toWrite = Math.min(zeros.length, size - written);
              fs.writeSync(fd, zeros, 0, toWrite);
              written += toWrite;
            }
            fs.closeSync(fd);
          }
          fs.unlinkSync(filePath);
        }
      }
    } catch (err) {
      log.debug('[SecureTransfer] Rule 91: Failed to securely delete temp file:', err);
    }
  }

  private cleanupStale(): void {
    try {
      if (!fs.existsSync(this.tempDir)) return;
      const now = Date.now();
      const entries = fs.readdirSync(this.tempDir);

      for (const entry of entries) {
        const fullPath = path.join(this.tempDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if ((now - stat.mtimeMs) > TEMP_MAX_AGE_MS) {
            if (stat.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
            this.trackedFiles.delete(fullPath);
          }
        } catch { /* ok, file may have been deleted */ }
      }
    } catch (err) {
      log.debug('[SecureTransfer] Rule 91: Temp cleanup error:', err);
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean all tracked temp files
    for (const filePath of this.trackedFiles) {
      this.releaseTempFile(filePath);
    }
    this.trackedFiles.clear();
  }
}

// ---------------------------------------------------------------------------
// Rule 92: Encrypted exports with AES-256-GCM
// ---------------------------------------------------------------------------

export function encryptExport(data: Buffer, password: string): { encrypted: Buffer; salt: Buffer; iv: Buffer; authTag: Buffer } {
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(password, salt, 100_000, EXPORT_KEY_LENGTH, 'sha512');
  const iv = crypto.randomBytes(EXPORT_IV_LENGTH);

  const cipher = crypto.createCipheriv(EXPORT_ALGORITHM, key, iv, { authTagLength: EXPORT_AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Zero the key
  key.fill(0);

  return { encrypted, salt, iv, authTag };
}

export function decryptExport(encrypted: Buffer, password: string, salt: Buffer, iv: Buffer, authTag: Buffer): Buffer | null {
  try {
    const key = crypto.pbkdf2Sync(password, salt, 100_000, EXPORT_KEY_LENGTH, 'sha512');
    const decipher = crypto.createDecipheriv(EXPORT_ALGORITHM, key, iv, { authTagLength: EXPORT_AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // Zero the key
    key.fill(0);

    return decrypted;
  } catch {
    return null;
  }
}

export function exportToFile(filePath: string, data: Buffer, password: string): boolean {
  try {
    const { encrypted, salt, iv, authTag } = encryptExport(data, password);

    // File format: [4 bytes magic] [32 bytes salt] [16 bytes iv] [16 bytes authTag] [encrypted data]
    const magic = Buffer.from('DEXE'); // DEX Export
    const output = Buffer.concat([magic, salt, iv, authTag, encrypted]);

    fs.writeFileSync(filePath, output);
    log.info(`[SecureTransfer] Rule 92: Encrypted export written (${output.length} bytes)`);
    return true;
  } catch (err) {
    log.error('[SecureTransfer] Rule 92: Export failed:', err);
    return false;
  }
}

export function importFromFile(filePath: string, password: string): Buffer | null {
  try {
    const data = fs.readFileSync(filePath);

    // Verify magic
    const magic = data.subarray(0, 4).toString();
    if (magic !== 'DEXE') {
      log.warn('[SecureTransfer] Rule 92: Invalid export file magic');
      return null;
    }

    const salt = data.subarray(4, 36);
    const iv = data.subarray(36, 52);
    const authTag = data.subarray(52, 68);
    const encrypted = data.subarray(68);

    return decryptExport(encrypted, password, salt, iv, authTag);
  } catch (err) {
    log.error('[SecureTransfer] Rule 92: Import failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rule 93: Transfer progress verification with hash comparison
// ---------------------------------------------------------------------------

export function computeFileHash(filePath: string, algorithm: string = 'sha256'): string | null {
  try {
    const CHUNK = 16 * 1024 * 1024; // 16MB chunks
    const hash = crypto.createHash(algorithm);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(CHUNK);

    let bytesRead: number;
    do {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead));
    } while (bytesRead === CHUNK);

    fs.closeSync(fd);
    return hash.digest('hex');
  } catch {
    return null;
  }
}

export function verifyTransfer(sourcePath: string, destPath: string): { valid: boolean; sourceHash: string; destHash: string } {
  const sourceHash = computeFileHash(sourcePath) || '';
  const destHash = computeFileHash(destPath) || '';
  const valid = sourceHash.length > 0 && sourceHash === destHash;

  if (!valid) {
    log.warn(`[SecureTransfer] Rule 93: Hash mismatch -- source=${sourceHash.slice(0, 12)} dest=${destHash.slice(0, 12)}`);
  }

  return { valid, sourceHash, destHash };
}

// ---------------------------------------------------------------------------
// Composite export
// ---------------------------------------------------------------------------

export const secureTempManager = new SecureTempManager();

export function initializeSecureTransfer(): void {
  secureTempManager.initialize();
}

export function shutdownSecureTransfer(): void {
  secureTempManager.shutdown();
}
