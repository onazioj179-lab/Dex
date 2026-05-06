// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DataEncryption — At-Rest Encryption for DEX Data Store
 * 
 * Provides transparent encryption for all persisted user data.
 * Uses AES-256-GCM with key derivation from machine identity.
 * 
 * Features:
 * - AES-256-GCM authenticated encryption
 * - Machine-derived key (no user password required)
 * - Per-record IV for unique ciphertext
 * - Key rotation support
 * - Backward-compatible with unencrypted data
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, ipcMain } from 'electron';
import { Logger } from '../utils/Logger';

const logger = new Logger();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const HEADER = Buffer.from('DEXENC01'); // 8-byte magic header

interface EncryptionConfig {
  enabled: boolean;
  keyRotationDays: number;
  lastKeyRotation: number;
}

export class DataEncryption {
  private key: Buffer | null = null;
  private configPath: string;
  private saltPath: string;
  private machineIdPath: string;
  private _machineId: string | null = null; // cached stable ID
  private config: EncryptionConfig = {
    enabled: true,
    keyRotationDays: 90,
    lastKeyRotation: Date.now(),
  };

  constructor() {
    const dataDir = path.join(app.getPath('userData'), 'security');
    this.configPath = path.join(dataDir, 'encryption-config.json');
    this.saltPath = path.join(dataDir, '.encryption-salt');
    // Stable machine ID persisted to disk so os.hostname() changes don't
    // invalidate the derived key (and lose access to encrypted data).
    this.machineIdPath = path.join(dataDir, '.machine-id');
  }

  async initialize(): Promise<void> {
    logger.info('[DataEncryption] Initializing at-rest encryption');

    const dir = path.dirname(this.configPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Load or generate salt
    let salt: Buffer;
    try {
      salt = await fs.promises.readFile(this.saltPath);
    } catch {
      salt = crypto.randomBytes(SALT_LENGTH);
      await fs.promises.writeFile(this.saltPath, salt);
    }

    // Derive key from machine identity + salt
    const machineId = this.getMachineIdentity();
    this.key = crypto.pbkdf2Sync(machineId, salt, ITERATIONS, KEY_LENGTH, 'sha512');

    // Load config
    await this.loadConfig();

    // Check key rotation
    if (this.shouldRotateKey()) {
      logger.info('[DataEncryption] Key rotation recommended');
    }

    // Register IPC
    this.registerIPC();

    logger.success('[DataEncryption] At-rest encryption ready');
  }

  // ─── Encryption / Decryption ────────────────────────────────

  encrypt(data: Buffer | string): Buffer {
    if (!this.key) throw new Error('Encryption not initialized');

    const plaintext = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: HEADER(8) + IV(16) + AUTH_TAG(16) + ENCRYPTED_DATA
    return Buffer.concat([HEADER, iv, authTag, encrypted]);
  }

  decrypt(data: Buffer): Buffer {
    if (!this.key) throw new Error('Encryption not initialized');

    // Check header
    if (!data.subarray(0, 8).equals(HEADER)) {
      // Not encrypted — return as-is (backward compatibility)
      return data;
    }

    const iv = data.subarray(8, 8 + IV_LENGTH);
    const authTag = data.subarray(8 + IV_LENGTH, 8 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(8 + IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  encryptString(text: string): string {
    return this.encrypt(text).toString('base64');
  }

  decryptString(base64: string): string {
    const buf = Buffer.from(base64, 'base64');
    return this.decrypt(buf).toString('utf8');
  }

  encryptJSON(obj: unknown): string {
    return this.encryptString(JSON.stringify(obj));
  }

  decryptJSON<T = unknown>(base64: string): T {
    return JSON.parse(this.decryptString(base64));
  }

  /**
   * Check if data appears to be encrypted by us
   */
  isEncrypted(data: Buffer): boolean {
    return data.length >= 8 && data.subarray(0, 8).equals(HEADER);
  }

  // ─── Encrypted File I/O ────────────────────────────────────

  async encryptFile(srcPath: string, destPath?: string): Promise<void> {
    const data = await fs.promises.readFile(srcPath);
    const encrypted = this.encrypt(data);
    await fs.promises.writeFile(destPath || srcPath, encrypted);
  }

  async decryptFile(srcPath: string, destPath?: string): Promise<void> {
    const data = await fs.promises.readFile(srcPath);
    const decrypted = this.decrypt(data);
    await fs.promises.writeFile(destPath || srcPath, decrypted);
  }

  async readEncryptedFile(filePath: string): Promise<Buffer> {
    const data = await fs.promises.readFile(filePath);
    return this.isEncrypted(data) ? this.decrypt(data) : data;
  }

  async writeEncryptedFile(filePath: string, data: Buffer | string): Promise<void> {
    const encrypted = this.encrypt(data);
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, encrypted);
    await fs.promises.rename(tmpPath, filePath);
  }

  // ─── Key Management ─────────────────────────────────────────

  private getMachineIdentity(): string {
    // Return cached identity after first call
    if (this._machineId !== null) return this._machineId;

    // Attempt to read a persisted stable machine ID.
    // On first run the file doesn't exist; we seed it with the current
    // machine characteristics so existing encrypted data keeps working.
    // After that write, hostname/CPU changes no longer affect key derivation.
    try {
      const stored = fs.readFileSync(this.machineIdPath, 'utf8').trim();
      if (stored.length > 0) {
        this._machineId = stored;
        return this._machineId;
      }
    } catch {
      // File doesn't exist yet — first run
    }

    // Generate from current machine characteristics (backward-compatible seed)
    const parts = [
      os.hostname(),
      os.userInfo().username,
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || 'unknown',
      app.getPath('userData'),
    ];
    const identity = parts.join('|');

    // Persist so future runs (after hostname change etc.) still derive the same key
    try {
      fs.writeFileSync(this.machineIdPath, identity, { mode: 0o600 });
    } catch {
      // userData directory may not exist yet — initialize() will create it
    }

    this._machineId = identity;
    return identity;
  }

  private shouldRotateKey(): boolean {
    const daysSinceRotation = (Date.now() - this.config.lastKeyRotation) / (1000 * 60 * 60 * 24);
    return daysSinceRotation > this.config.keyRotationDays;
  }

  // ─── Config ─────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // ─── IPC ────────────────────────────────────────────────────

  private registerIPC(): void {
    ipcMain.handle('encryption:get-status', () => ({
      enabled: this.config.enabled,
      initialized: this.key !== null,
      lastKeyRotation: this.config.lastKeyRotation,
      keyRotationDue: this.shouldRotateKey(),
    }));

    ipcMain.handle('encryption:encrypt-string', (_e, text: string) => {
      return this.encryptString(text);
    });

    ipcMain.handle('encryption:decrypt-string', (_e, base64: string) => {
      try {
        return this.decryptString(base64);
      } catch {
        return null;
      }
    });

    // Synchronous aliases used by Browser.tsx credential storage
    ipcMain.on('security:encrypt', (event, text: string) => {
      try {
        event.returnValue = this.encryptString(text);
      } catch {
        event.returnValue = null;
      }
    });

    ipcMain.on('security:decrypt', (event, encrypted: string) => {
      try {
        event.returnValue = this.decryptString(encrypted);
      } catch {
        event.returnValue = null;
      }
    });
  }

  async shutdown(): Promise<void> {
    // Securely wipe key from memory
    if (this.key) {
      crypto.randomFillSync(this.key);
      this.key = null;
    }
    logger.info('[DataEncryption] Key wiped, shutdown complete');
  }
}
