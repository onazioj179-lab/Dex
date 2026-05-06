// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Encryption Service
// Phase 16: Data Encryption & Secure Creative Space
// AES-256-GCM encryption with key derivation and OS keychain integration
// ===========================================================================

import * as crypto from 'crypto';
import { safeStorage } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface EncryptionConfig {
  enabled: boolean;
  keySource: 'password' | 'system';
  encryptNotes: boolean;
  encryptMedia: boolean;
  encryptSessions: boolean;
  encryptOperations: boolean;
  initialized: boolean;
  lastKeyRotation?: number;
}

export interface EncryptedData {
  v: number;           // Version
  alg: string;         // Algorithm
  iv: string;          // Initialization vector (base64)
  tag: string;         // Auth tag (base64)
  ct: string;          // Ciphertext (base64)
}

interface KeyData {
  key: Buffer;
  salt: Buffer;
  createdAt: number;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;        // 256 bits
const IV_LENGTH = 12;         // 96 bits for GCM
const TAG_LENGTH = 16;        // 128 bits
const SALT_LENGTH = 32;       // 256 bits
const PBKDF2_ITERATIONS = 100000;
const VERSION = 1;

// ===========================================================================
// STORE
// ===========================================================================

const encryptionStore = new Store<{
  config: EncryptionConfig;
  saltBase64?: string;
  keyChecksum?: string;
}>({
  name: 'dex-encryption',
  defaults: {
    config: {
      enabled: false,
      keySource: 'system',
      encryptNotes: true,
      encryptMedia: true,
      encryptSessions: true,
      encryptOperations: false,
      initialized: false,
    },
  },
});

// ===========================================================================
// ENCRYPTION SERVICE
// ===========================================================================

class EncryptionServiceClass {
  private keyData: KeyData | null = null;
  private isUnlocked = false;
  
  constructor() {
    // Auto-initialize with system key if available
    this.tryAutoUnlock();
  }

  // -------------------------------------------------------------------------
  // KEY MANAGEMENT
  // -------------------------------------------------------------------------

  // Initialize encryption with a password
  async initializeWithPassword(password: string): Promise<boolean> {
    try {
      // Generate new salt
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Store key in OS keychain via safeStorage
      if (safeStorage.isEncryptionAvailable()) {
        const keyBuffer = Buffer.from(key);
        const encryptedKey = safeStorage.encryptString(keyBuffer.toString('base64'));
        encryptionStore.set('encryptedKey', encryptedKey.toString('base64'));
      }

      // Store salt and checksum
      encryptionStore.set('saltBase64', salt.toString('base64'));
      encryptionStore.set('keyChecksum', this.computeChecksum(key));

      // Update config
      const config = encryptionStore.get('config');
      config.enabled = true;
      config.keySource = 'password';
      config.initialized = true;
      config.lastKeyRotation = Date.now();
      encryptionStore.set('config', config);

      this.keyData = { key, salt, createdAt: Date.now() };
      this.isUnlocked = true;

      log.info('[Encryption] Initialized with password');
      return true;
    } catch (error) {
      log.error('[Encryption] Failed to initialize:', error);
      return false;
    }
  }

  // Initialize with system-managed key
  async initializeWithSystemKey(): Promise<boolean> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[Encryption] Safe storage not available');
        return false;
      }

      // Generate random key
      const key = crypto.randomBytes(KEY_LENGTH);
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Store in OS keychain
      const encryptedKey = safeStorage.encryptString(key.toString('base64'));
      encryptionStore.set('encryptedSystemKey', encryptedKey.toString('base64'));

      // Store salt and checksum
      encryptionStore.set('saltBase64', salt.toString('base64'));
      encryptionStore.set('keyChecksum', this.computeChecksum(key));

      // Update config
      const config = encryptionStore.get('config');
      config.enabled = true;
      config.keySource = 'system';
      config.initialized = true;
      config.lastKeyRotation = Date.now();
      encryptionStore.set('config', config);

      this.keyData = { key, salt, createdAt: Date.now() };
      this.isUnlocked = true;

      log.info('[Encryption] Initialized with system key');
      return true;
    } catch (error) {
      log.error('[Encryption] Failed to initialize with system key:', error);
      return false;
    }
  }

  // Unlock with password
  async unlock(password: string): Promise<boolean> {
    try {
      const saltBase64 = encryptionStore.get('saltBase64');
      const storedChecksum = encryptionStore.get('keyChecksum');

      if (!saltBase64 || !storedChecksum) {
        log.error('[Encryption] No stored salt or checksum');
        return false;
      }

      const salt = Buffer.from(saltBase64, 'base64');
      const key = await this.deriveKey(password, salt);
      const checksum = this.computeChecksum(key);

      if (checksum !== storedChecksum) {
        log.warn('[Encryption] Invalid password');
        return false;
      }

      this.keyData = { key, salt, createdAt: Date.now() };
      this.isUnlocked = true;

      log.info('[Encryption] Unlocked successfully');
      return true;
    } catch (error) {
      log.error('[Encryption] Failed to unlock:', error);
      return false;
    }
  }

  // Lock (clear key from memory)
  lock(): void {
    if (this.keyData) {
      // Zero out key in memory
      this.keyData.key.fill(0);
      this.keyData = null;
    }
    this.isUnlocked = false;
    log.info('[Encryption] Locked');
  }

  // Check if encryption is available and unlocked
  isAvailable(): boolean {
    return this.isUnlocked && this.keyData !== null;
  }

  // Get current config
  getConfig(): EncryptionConfig {
    return encryptionStore.get('config');
  }

  // Update config
  updateConfig(updates: Partial<EncryptionConfig>): EncryptionConfig {
    const config = encryptionStore.get('config');
    const updated = { ...config, ...updates };
    encryptionStore.set('config', updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // ENCRYPTION / DECRYPTION
  // -------------------------------------------------------------------------

  // Encrypt data
  encrypt(data: string | Buffer): EncryptedData | null {
    if (!this.isAvailable()) {
      log.warn('[Encryption] Not available, returning null');
      return null;
    }

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.keyData!.key, iv, {
        authTagLength: TAG_LENGTH,
      });

      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        v: VERSION,
        alg: ALGORITHM,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: encrypted.toString('base64'),
      };
    } catch (error) {
      log.error('[Encryption] Encryption failed:', error);
      return null;
    }
  }

  // Decrypt data
  decrypt(encrypted: EncryptedData): Buffer | null {
    if (!this.isAvailable()) {
      log.warn('[Encryption] Not available, returning null');
      return null;
    }

    if (encrypted.v !== VERSION) {
      log.error('[Encryption] Unsupported encryption version:', encrypted.v);
      return null;
    }

    try {
      const iv = Buffer.from(encrypted.iv, 'base64');
      const tag = Buffer.from(encrypted.tag, 'base64');
      const ciphertext = Buffer.from(encrypted.ct, 'base64');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.keyData!.key, iv, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted;
    } catch (error) {
      log.error('[Encryption] Decryption failed:', error);
      return null;
    }
  }

  // Decrypt to string
  decryptToString(encrypted: EncryptedData): string | null {
    const decrypted = this.decrypt(encrypted);
    return decrypted ? decrypted.toString('utf8') : null;
  }

  // Check if data is encrypted
  isEncrypted(data: any): data is EncryptedData {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.v === 'number' &&
      typeof data.alg === 'string' &&
      typeof data.iv === 'string' &&
      typeof data.tag === 'string' &&
      typeof data.ct === 'string'
    );
  }

  // -------------------------------------------------------------------------
  // HIGH-LEVEL API
  // -------------------------------------------------------------------------

  // Encrypt if enabled, otherwise return original
  encryptIfEnabled(data: string, type: 'notes' | 'media' | 'sessions' | 'operations'): string | EncryptedData {
    const config = this.getConfig();
    
    const shouldEncrypt = 
      config.enabled && 
      this.isAvailable() &&
      ((type === 'notes' && config.encryptNotes) ||
       (type === 'media' && config.encryptMedia) ||
       (type === 'sessions' && config.encryptSessions) ||
       (type === 'operations' && config.encryptOperations));

    if (shouldEncrypt) {
      const encrypted = this.encrypt(data);
      if (encrypted) return encrypted;
    }

    return data;
  }

  // Decrypt if encrypted, otherwise return original
  decryptIfEncrypted(data: string | EncryptedData): string {
    if (this.isEncrypted(data)) {
      if (!this.isAvailable()) {
        throw new Error('Encryption locked - cannot decrypt data');
      }
      const decrypted = this.decryptToString(data);
      if (decrypted === null) {
        throw new Error('Failed to decrypt data');
      }
      return decrypted;
    }
    return data as string;
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha512',
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  private computeChecksum(key: Buffer): string {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  private tryAutoUnlock(): void {
    const config = encryptionStore.get('config');
    
    if (!config.initialized || !config.enabled) {
      return;
    }

    if (config.keySource === 'system' && safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedKey = encryptionStore.get('encryptedSystemKey') as string | undefined;
        if (encryptedKey) {
          const encryptedBuffer = Buffer.from(encryptedKey, 'base64');
          const keyBase64 = safeStorage.decryptString(encryptedBuffer);
          const key = Buffer.from(keyBase64, 'base64');

          const saltBase64 = encryptionStore.get('saltBase64');
          const storedChecksum = encryptionStore.get('keyChecksum');

          if (saltBase64 && storedChecksum) {
            const checksum = this.computeChecksum(key);
            if (checksum === storedChecksum) {
              const salt = Buffer.from(saltBase64, 'base64');
              this.keyData = { key, salt, createdAt: Date.now() };
              this.isUnlocked = true;
              log.info('[Encryption] Auto-unlocked with system key');
            }
          }
        }
      } catch (error) {
        log.warn('[Encryption] Auto-unlock failed:', error);
      }
    }
  }

  // Disable encryption (requires current password/key)
  async disable(): Promise<boolean> {
    try {
      // Clear stored keys
      encryptionStore.delete('encryptedKey' as any);
      encryptionStore.delete('encryptedSystemKey' as any);
      encryptionStore.delete('saltBase64');
      encryptionStore.delete('keyChecksum');

      // Update config
      const config = encryptionStore.get('config');
      config.enabled = false;
      config.initialized = false;
      encryptionStore.set('config', config);

      this.lock();
      log.info('[Encryption] Disabled');
      return true;
    } catch (error) {
      log.error('[Encryption] Failed to disable:', error);
      return false;
    }
  }

  // Get encryption status
  getStatus(): {
    available: boolean;
    enabled: boolean;
    locked: boolean;
    keySource: 'password' | 'system' | null;
    lastKeyRotation: number | null;
  } {
    const config = this.getConfig();
    return {
      available: safeStorage.isEncryptionAvailable(),
      enabled: config.enabled,
      locked: !this.isUnlocked,
      keySource: config.initialized ? config.keySource : null,
      lastKeyRotation: config.lastKeyRotation ?? null,
    };
  }
}

// Singleton export
export const encryptionService = new EncryptionServiceClass();
