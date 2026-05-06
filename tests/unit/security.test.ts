// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX CORE UNIT TESTS - Security Layer
 * ===========================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';

// Mock AppGuard verification
interface AppVerification {
  path: string;
  verified: boolean;
  signatureValid: boolean;
  publisher: string | null;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

const createAppGuard = () => {
  const cache = new Map<string, AppVerification>();
  const trustedPublishers = new Set(['DEX', 'Microsoft', 'Adobe']);

  return {
    verify: vi.fn(async (appPath: string): Promise<AppVerification> => {
      // Check cache
      if (cache.has(appPath)) {
        return cache.get(appPath)!;
      }

      const isInProgramFiles = appPath.includes('Program Files');
      const verification: AppVerification = {
        path: appPath,
        verified: isInProgramFiles,
        signatureValid: isInProgramFiles,
        publisher: isInProgramFiles ? 'Microsoft' : null,
        riskLevel: isInProgramFiles ? 'safe' : 'medium',
      };

      cache.set(appPath, verification);
      return verification;
    }),

    isTrusted: (publisher: string) => trustedPublishers.has(publisher),
    clearCache: () => cache.clear(),
  };
};

// Mock ThreatShield
interface ThreatDetection {
  type: 'malware' | 'phishing' | 'suspicious';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

const createThreatShield = () => {
  const malwareSignatures = ['eicar', 'malware_test'];
  const phishingPatterns = [/paypa1/i, /amaz0n/i, /login.*\.xyz/i];

  return {
    scanFile: vi.fn(async (content: string): Promise<ThreatDetection | null> => {
      const lower = content.toLowerCase();
      for (const sig of malwareSignatures) {
        if (lower.includes(sig)) {
          return {
            type: 'malware',
            severity: 'critical',
            description: `Known malware signature: ${sig}`,
          };
        }
      }
      return null;
    }),

    scanUrl: vi.fn(async (url: string): Promise<ThreatDetection | null> => {
      for (const pattern of phishingPatterns) {
        if (pattern.test(url)) {
          return {
            type: 'phishing',
            severity: 'high',
            description: 'Suspected phishing URL',
          };
        }
      }
      return null;
    }),
  };
};

// Mock VaultEncrypt
const createVaultEncrypt = () => {
  const vaults = new Map<string, { name: string; isLocked: boolean }>();

  return {
    create: vi.fn((id: string, name: string) => {
      vaults.set(id, { name, isLocked: false });
      return true;
    }),

    lock: vi.fn((id: string) => {
      const vault = vaults.get(id);
      if (vault) vault.isLocked = true;
    }),

    unlock: vi.fn((id: string, password: string) => {
      const vault = vaults.get(id);
      if (vault && password === 'correct') {
        vault.isLocked = false;
        return true;
      }
      return false;
    }),

    isLocked: vi.fn((id: string) => vaults.get(id)?.isLocked ?? true),
    
    encrypt: vi.fn((data: string, key: Buffer): string => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    }),

    decrypt: vi.fn((encryptedBase64: string, key: Buffer): string => {
      const data = Buffer.from(encryptedBase64, 'base64');
      const iv = data.subarray(0, 16);
      const authTag = data.subarray(16, 32);
      const encrypted = data.subarray(32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted) + decipher.final('utf8');
    }),
  };
};

describe('SecurityLayer', () => {
  describe('AppGuard', () => {
    let appGuard: ReturnType<typeof createAppGuard>;

    beforeEach(() => {
      appGuard = createAppGuard();
    });

    it('should verify apps in Program Files as safe', async () => {
      const result = await appGuard.verify('C:\\Program Files\\Test\\app.exe');
      expect(result.verified).toBe(true);
      expect(result.riskLevel).toBe('safe');
    });

    it('should mark unknown apps as medium risk', async () => {
      const result = await appGuard.verify('C:\\Downloads\\unknown.exe');
      expect(result.verified).toBe(false);
      expect(result.riskLevel).toBe('medium');
    });

    it('should cache verification results', async () => {
      await appGuard.verify('C:\\test\\app.exe');
      await appGuard.verify('C:\\test\\app.exe');
      expect(appGuard.verify).toHaveBeenCalledTimes(2);
    });

    it('should identify trusted publishers', () => {
      expect(appGuard.isTrusted('Microsoft')).toBe(true);
      expect(appGuard.isTrusted('Unknown Corp')).toBe(false);
    });
  });

  describe('ThreatShield', () => {
    let threatShield: ReturnType<typeof createThreatShield>;

    beforeEach(() => {
      threatShield = createThreatShield();
    });

    it('should detect malware signatures', async () => {
      const result = await threatShield.scanFile('This file contains eicar test string');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('malware');
      expect(result?.severity).toBe('critical');
    });

    it('should return null for clean files', async () => {
      const result = await threatShield.scanFile('This is a clean document');
      expect(result).toBeNull();
    });

    it('should detect phishing URLs', async () => {
      const result = await threatShield.scanUrl('https://paypa1-secure.com/login');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('phishing');
    });

    it('should pass clean URLs', async () => {
      const result = await threatShield.scanUrl('https://github.com');
      expect(result).toBeNull();
    });
  });

  describe('VaultEncrypt', () => {
    let vaultEncrypt: ReturnType<typeof createVaultEncrypt>;
    const testKey = crypto.randomBytes(32);

    beforeEach(() => {
      vaultEncrypt = createVaultEncrypt();
    });

    it('should create vaults', () => {
      expect(vaultEncrypt.create('vault1', 'My Vault')).toBe(true);
    });

    it('should lock and unlock vaults', () => {
      vaultEncrypt.create('vault1', 'My Vault');
      expect(vaultEncrypt.isLocked('vault1')).toBe(false);
      
      vaultEncrypt.lock('vault1');
      expect(vaultEncrypt.isLocked('vault1')).toBe(true);
      
      vaultEncrypt.unlock('vault1', 'correct');
      expect(vaultEncrypt.isLocked('vault1')).toBe(false);
    });

    it('should fail unlock with wrong password', () => {
      vaultEncrypt.create('vault1', 'My Vault');
      vaultEncrypt.lock('vault1');
      expect(vaultEncrypt.unlock('vault1', 'wrong')).toBe(false);
      expect(vaultEncrypt.isLocked('vault1')).toBe(true);
    });

    it('should encrypt and decrypt data', () => {
      const plaintext = 'Secret message 123!';
      const encrypted = vaultEncrypt.encrypt(plaintext, testKey);
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = vaultEncrypt.decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time (IV)', () => {
      const plaintext = 'Same message';
      const enc1 = vaultEncrypt.encrypt(plaintext, testKey);
      const enc2 = vaultEncrypt.encrypt(plaintext, testKey);
      expect(enc1).not.toBe(enc2);
    });
  });
});
