// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Secure Key Manager
// Local-first encryption key management
// Keys never leave the device, OS keychain integration
// ===========================================================================

import { safeStorage } from 'electron';
import * as crypto from 'crypto';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface KeyInfo {
  id: string;
  name: string;
  purpose: KeyPurpose;
  algorithm: string;
  createdAt: number;
  lastUsed: number;
  rotatedAt?: number;
  expiresAt?: number;
}

export type KeyPurpose = 
  | 'master'           // Master encryption key
  | 'data'             // General data encryption
  | 'transfer'         // File transfer encryption
  | 'session'          // Session-specific keys
  | 'signing'          // Digital signatures
  | 'derivation';      // Key derivation base

export interface KeyDerivationParams {
  algorithm: 'pbkdf2' | 'argon2' | 'scrypt';
  iterations?: number;
  memoryKB?: number;
  parallelism?: number;
  salt: Buffer;
}

export interface KeyRotationPolicy {
  enabled: boolean;
  intervalDays: number;
  lastRotation: number;
  autoRotate: boolean;
}

interface StoredKeyMetadata {
  id: string;
  name: string;
  purpose: KeyPurpose;
  algorithm: string;
  createdAt: number;
  lastUsed: number;
  rotatedAt?: number;
  expiresAt?: number;
  saltBase64: string;
  checksumBase64: string;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 310000; // OWASP 2023 minimum for PBKDF2-SHA256
const KEY_CHECKSUM_LENGTH = 8;

// ===========================================================================
// STORE
// ===========================================================================

const keyStore = new Store<{
  keys: Record<string, StoredKeyMetadata>;
  rotationPolicy: KeyRotationPolicy;
  derivationParams: Record<string, KeyDerivationParams>;
}>({
  name: 'dex-keymanager',
  defaults: {
    keys: {},
    rotationPolicy: {
      enabled: true,
      intervalDays: 90,
      lastRotation: 0,
      autoRotate: true,
    },
    derivationParams: {},
  },
});

// ===========================================================================
// KEY MANAGER
// ===========================================================================

class SecureKeyManagerClass {
  // In-memory key cache (cleared on lock)
  private keyCache: Map<string, Buffer> = new Map();
  private isLocked = true;
  private masterKey: Buffer | null = null;

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<boolean> {
    log.info('[KeyManager] Initializing...');

    // Check if OS keychain is available
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[KeyManager] OS safe storage not available');
      return false;
    }

    // Try to auto-unlock with system key
    const autoUnlocked = await this.tryAutoUnlock();
    if (autoUnlocked) {
      log.info('[KeyManager] Auto-unlocked with system key');
    }

    // Auto-rotate keys if policy requires and manager is unlocked
    if (!this.isLocked) {
      await this.checkAutoRotation();
    }

    return true;
  }

  private async checkAutoRotation(): Promise<void> {
    const policy = keyStore.get('rotationPolicy');
    if (!policy.enabled || !policy.autoRotate) return;

    const now = Date.now();
    const intervalMs = policy.intervalDays * 24 * 60 * 60 * 1000;
    if (policy.lastRotation > 0 && (now - policy.lastRotation) < intervalMs) return;

    log.info('[KeyManager] Auto-rotation policy triggered');
    const keys = keyStore.get('keys');
    const activeKeys = Object.entries(keys).filter(([, meta]) => !meta.rotatedAt);

    for (const [keyId] of activeKeys) {
      try {
        await this.rotateKey(keyId);
      } catch (err) {
        log.warn(`[KeyManager] Auto-rotation failed for key ${keyId}:`, err);
      }
    }

    this.updateRotationPolicy({ lastRotation: now });
  }

  private async tryAutoUnlock(): Promise<boolean> {
    try {
      const keys = keyStore.get('keys');
      const masterMeta = Object.values(keys).find(k => k.purpose === 'master');
      
      if (!masterMeta) return false;

      // Try to retrieve master key from OS keychain
      const encryptedKeyBase64 = this.getFromKeychain(`dex-key-${masterMeta.id}`);
      if (!encryptedKeyBase64) return false;

      const key = Buffer.from(encryptedKeyBase64, 'base64');
      
      // Verify checksum
      const checksum = this.computeChecksum(key);
      if (checksum !== masterMeta.checksumBase64) {
        log.warn('[KeyManager] Key checksum mismatch');
        return false;
      }

      this.masterKey = key;
      this.keyCache.set(masterMeta.id, key);
      this.isLocked = false;

      return true;
    } catch (error) {
      log.error('[KeyManager] Auto-unlock failed:', error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // KEY GENERATION
  // -------------------------------------------------------------------------

  // Generate a new key
  async generateKey(
    name: string,
    purpose: KeyPurpose,
    options?: { expiresInDays?: number }
  ): Promise<KeyInfo | null> {
    try {
      const id = crypto.randomUUID();
      const key = crypto.randomBytes(KEY_LENGTH);
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Store in OS keychain
      if (!this.storeInKeychain(`dex-key-${id}`, key.toString('base64'))) {
        log.error('[KeyManager] Failed to store key in keychain');
        return null;
      }

      const metadata: StoredKeyMetadata = {
        id,
        name,
        purpose,
        algorithm: 'aes-256-gcm',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        saltBase64: salt.toString('base64'),
        checksumBase64: this.computeChecksum(key),
        expiresAt: options?.expiresInDays 
          ? Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000 
          : undefined,
      };

      // Save metadata
      const keys = keyStore.get('keys');
      keys[id] = metadata;
      keyStore.set('keys', keys);

      // Cache key
      this.keyCache.set(id, key);

      // Set as master if it's the first master key
      if (purpose === 'master' && !this.masterKey) {
        this.masterKey = key;
        this.isLocked = false;
      }

      log.info(`[KeyManager] Generated key: ${name} (${purpose})`);

      return {
        id,
        name,
        purpose,
        algorithm: metadata.algorithm,
        createdAt: metadata.createdAt,
        lastUsed: metadata.lastUsed,
        expiresAt: metadata.expiresAt,
      };
    } catch (error) {
      log.error('[KeyManager] Key generation failed:', error);
      return null;
    }
  }

  // Generate key from password (PBKDF2)
  async deriveKeyFromPassword(
    password: string,
    name: string,
    purpose: KeyPurpose
  ): Promise<KeyInfo | null> {
    try {
      const id = crypto.randomUUID();
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Derive key using PBKDF2
      const key = await new Promise<Buffer>((resolve, reject) => {
        crypto.pbkdf2(
          password,
          salt,
          PBKDF2_ITERATIONS,
          KEY_LENGTH,
          'sha512',
          (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
          }
        );
      });

      // Store derivation params (not the key itself for password-derived keys)
      const derivationParams: KeyDerivationParams = {
        algorithm: 'pbkdf2',
        iterations: PBKDF2_ITERATIONS,
        salt,
      };
      
      const params = keyStore.get('derivationParams');
      params[id] = derivationParams;
      keyStore.set('derivationParams', params);

      // Store key in keychain
      if (!this.storeInKeychain(`dex-key-${id}`, key.toString('base64'))) {
        return null;
      }

      const metadata: StoredKeyMetadata = {
        id,
        name,
        purpose,
        algorithm: 'pbkdf2-aes-256-gcm',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        saltBase64: salt.toString('base64'),
        checksumBase64: this.computeChecksum(key),
      };

      const keys = keyStore.get('keys');
      keys[id] = metadata;
      keyStore.set('keys', keys);

      this.keyCache.set(id, key);

      if (purpose === 'master') {
        this.masterKey = key;
        this.isLocked = false;
      }

      log.info(`[KeyManager] Derived key from password: ${name}`);

      return {
        id,
        name,
        purpose,
        algorithm: metadata.algorithm,
        createdAt: metadata.createdAt,
        lastUsed: metadata.lastUsed,
      };
    } catch (error) {
      log.error('[KeyManager] Key derivation failed:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // KEY RETRIEVAL
  // -------------------------------------------------------------------------

  async getKey(keyId: string): Promise<Buffer | null> {
    if (this.isLocked) {
      log.warn('[KeyManager] Cannot retrieve key - manager is locked');
      return null;
    }

    // Check cache first
    if (this.keyCache.has(keyId)) {
      this.updateLastUsed(keyId);
      return this.keyCache.get(keyId)!;
    }

    // Try to load from keychain
    try {
      const encryptedKeyBase64 = this.getFromKeychain(`dex-key-${keyId}`);
      if (!encryptedKeyBase64) return null;

      const key = Buffer.from(encryptedKeyBase64, 'base64');

      // Verify checksum
      const keys = keyStore.get('keys');
      const metadata = keys[keyId];
      if (!metadata) return null;

      const checksum = this.computeChecksum(key);
      if (checksum !== metadata.checksumBase64) {
        log.error('[KeyManager] Key checksum verification failed');
        return null;
      }

      // Check expiration
      if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
        log.warn(`[KeyManager] Key ${keyId} has expired`);
        return null;
      }

      this.keyCache.set(keyId, key);
      this.updateLastUsed(keyId);

      return key;
    } catch (error) {
      log.error('[KeyManager] Failed to retrieve key:', error);
      return null;
    }
  }

  getMasterKey(): Buffer | null {
    return this.masterKey;
  }

  private updateLastUsed(keyId: string): void {
    const keys = keyStore.get('keys');
    if (keys[keyId]) {
      keys[keyId].lastUsed = Date.now();
      keyStore.set('keys', keys);
    }
  }

  // -------------------------------------------------------------------------
  // KEY ROTATION
  // -------------------------------------------------------------------------

  async rotateKey(keyId: string): Promise<KeyInfo | null> {
    const keys = keyStore.get('keys');
    const metadata = keys[keyId];
    if (!metadata) return null;

    // Generate new key with same purpose
    const newKeyInfo = await this.generateKey(
      metadata.name,
      metadata.purpose
    );

    if (!newKeyInfo) return null;

    // Mark old key as rotated
    metadata.rotatedAt = Date.now();
    keys[keyId] = metadata;
    keyStore.set('keys', keys);

    // Clear old key from cache
    const oldKey = this.keyCache.get(keyId);
    if (oldKey) {
      oldKey.fill(0); // Zeroize
      this.keyCache.delete(keyId);
    }

    log.info(`[KeyManager] Rotated key ${keyId} -> ${newKeyInfo.id}`);

    return newKeyInfo;
  }

  getRotationPolicy(): KeyRotationPolicy {
    return keyStore.get('rotationPolicy');
  }

  updateRotationPolicy(updates: Partial<KeyRotationPolicy>): KeyRotationPolicy {
    const policy = keyStore.get('rotationPolicy');
    const updated = { ...policy, ...updates };
    keyStore.set('rotationPolicy', updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // KEY DELETION
  // -------------------------------------------------------------------------

  async deleteKey(keyId: string): Promise<boolean> {
    try {
      // Remove from keychain
      this.removeFromKeychain(`dex-key-${keyId}`);

      // Remove from store
      const keys = keyStore.get('keys');
      delete keys[keyId];
      keyStore.set('keys', keys);

      // Clear from cache with zeroization
      const cachedKey = this.keyCache.get(keyId);
      if (cachedKey) {
        cachedKey.fill(0);
        this.keyCache.delete(keyId);
      }

      // Remove derivation params if any
      const params = keyStore.get('derivationParams');
      delete params[keyId];
      keyStore.set('derivationParams', params);

      log.info(`[KeyManager] Deleted key ${keyId}`);
      return true;
    } catch (error) {
      log.error('[KeyManager] Failed to delete key:', error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // LOCK / UNLOCK
  // -------------------------------------------------------------------------

  async unlock(password: string): Promise<boolean> {
    try {
      // Find master key
      const keys = keyStore.get('keys');
      const masterMeta = Object.values(keys).find(k => k.purpose === 'master');
      if (!masterMeta) {
        log.warn('[KeyManager] No master key found');
        return false;
      }

      // Get derivation params
      const params = keyStore.get('derivationParams');
      const derivation = params[masterMeta.id];

      if (derivation) {
        // Re-derive key from password
        const salt = Buffer.from(derivation.salt);
        const iterations = derivation.iterations || PBKDF2_ITERATIONS;

        const key = await new Promise<Buffer>((resolve, reject) => {
          crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, 'sha512', (err, dk) => {
            if (err) reject(err);
            else resolve(dk);
          });
        });

        // Verify checksum
        const checksum = this.computeChecksum(key);
        if (checksum !== masterMeta.checksumBase64) {
          log.warn('[KeyManager] Invalid password');
          return false;
        }

        this.masterKey = key;
        this.keyCache.set(masterMeta.id, key);
      } else {
        // Try keychain
        const encryptedKeyBase64 = this.getFromKeychain(`dex-key-${masterMeta.id}`);
        if (!encryptedKeyBase64) return false;

        this.masterKey = Buffer.from(encryptedKeyBase64, 'base64');
        this.keyCache.set(masterMeta.id, this.masterKey);
      }

      this.isLocked = false;
      log.info('[KeyManager] Unlocked');
      return true;
    } catch (error) {
      log.error('[KeyManager] Unlock failed:', error);
      return false;
    }
  }

  lock(): void {
    // Zeroize all cached keys
    for (const key of this.keyCache.values()) {
      key.fill(0);
    }
    this.keyCache.clear();

    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }

    this.isLocked = true;
    log.info('[KeyManager] Locked - all keys cleared from memory');
  }

  isUnlocked(): boolean {
    return !this.isLocked;
  }

  // -------------------------------------------------------------------------
  // KEY INFO
  // -------------------------------------------------------------------------

  listKeys(): KeyInfo[] {
    const keys = keyStore.get('keys');
    return Object.values(keys).map(meta => ({
      id: meta.id,
      name: meta.name,
      purpose: meta.purpose,
      algorithm: meta.algorithm,
      createdAt: meta.createdAt,
      lastUsed: meta.lastUsed,
      rotatedAt: meta.rotatedAt,
      expiresAt: meta.expiresAt,
    }));
  }

  getKeyInfo(keyId: string): KeyInfo | null {
    const keys = keyStore.get('keys');
    const meta = keys[keyId];
    if (!meta) return null;

    return {
      id: meta.id,
      name: meta.name,
      purpose: meta.purpose,
      algorithm: meta.algorithm,
      createdAt: meta.createdAt,
      lastUsed: meta.lastUsed,
      rotatedAt: meta.rotatedAt,
      expiresAt: meta.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // OS KEYCHAIN HELPERS
  // -------------------------------------------------------------------------

  private storeInKeychain(key: string, value: string): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const encrypted = safeStorage.encryptString(value);
      keyStore.set(`keychain.${key}`, encrypted.toString('base64'));
      return true;
    } catch (error) {
      log.error('[KeyManager] Failed to store in keychain:', error);
      return false;
    }
  }

  private getFromKeychain(key: string): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encryptedBase64 = keyStore.get(`keychain.${key}`) as string | undefined;
      if (!encryptedBase64) return null;
      
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      log.error('[KeyManager] Failed to get from keychain:', error);
      return null;
    }
  }

  private removeFromKeychain(key: string): void {
    try {
      keyStore.delete(`keychain.${key}` as any);
    } catch (error) {
      log.error('[KeyManager] Failed to remove from keychain:', error);
    }
  }

  private computeChecksum(key: Buffer): string {
    return crypto.createHash('sha256')
      .update(key)
      .digest()
      .slice(0, KEY_CHECKSUM_LENGTH)
      .toString('base64');
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const SecureKeyManager = new SecureKeyManagerClass();
export default SecureKeyManager;
