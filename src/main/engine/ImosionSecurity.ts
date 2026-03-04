/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMOSION SECURITY - Encryption, Integrity & DRM
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles:
 * - Project file encryption (AES-256-GCM)
 * - Content integrity verification (SHA-256)
 * - License/DRM management
 * - Secure storage for credentials
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface EncryptionOptions {
  algorithm: 'aes-256-gcm' | 'aes-256-cbc';
  keyDerivation: 'pbkdf2' | 'scrypt' | 'argon2';
  iterations?: number;
}

export interface EncryptedData {
  algorithm: string;
  iv: string;
  authTag?: string;
  salt: string;
  data: string;
  version: number;
}

export interface IntegrityCheckResult {
  valid: boolean;
  expectedHash?: string;
  actualHash?: string;
  error?: string;
}

export interface License {
  id: string;
  type: 'free' | 'personal' | 'professional' | 'studio';
  email: string;
  issuedAt: string;
  expiresAt?: string;
  features: string[];
  machineId: string;
  signature: string;
}

export interface SecureStorageEntry {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY DERIVATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

class KeyDerivation {
  static async deriveKey(
    password: string,
    salt: Buffer,
    method: 'pbkdf2' | 'scrypt' | 'argon2',
    keyLength: number = 32
  ): Promise<Buffer> {
    switch (method) {
      case 'pbkdf2':
        return new Promise((resolve, reject) => {
          crypto.pbkdf2(password, salt, 100000, keyLength, 'sha256', (err, key) => {
            if (err) reject(err);
            else resolve(key);
          });
        });
        
      case 'scrypt':
        return new Promise((resolve, reject) => {
          crypto.scrypt(password, salt, keyLength, { N: 16384, r: 8, p: 1 }, (err, key) => {
            if (err) reject(err);
            else resolve(key);
          });
        });
        
      case 'argon2':
        // Argon2 requires external library, fallback to scrypt
        return this.deriveKey(password, salt, 'scrypt', keyLength);
        
      default:
        throw new Error(`Unknown key derivation method: ${method}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class EncryptionEngine {
  private defaultOptions: EncryptionOptions = {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'scrypt',
    iterations: 100000
  };
  
  async encrypt(
    data: Buffer | string,
    password: string,
    options?: Partial<EncryptionOptions>
  ): Promise<EncryptedData> {
    const opts = { ...this.defaultOptions, ...options };
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    
    // Generate salt and IV
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(opts.algorithm === 'aes-256-gcm' ? 12 : 16);
    
    // Derive key
    const key = await KeyDerivation.deriveKey(password, salt, opts.keyDerivation);
    
    // Encrypt
    if (opts.algorithm === 'aes-256-gcm') {
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      return {
        algorithm: opts.algorithm,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        data: encrypted.toString('base64'),
        version: 1
      };
    } else {
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
      
      return {
        algorithm: opts.algorithm,
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        data: encrypted.toString('base64'),
        version: 1
      };
    }
  }
  
  async decrypt(encryptedData: EncryptedData, password: string): Promise<Buffer> {
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const data = Buffer.from(encryptedData.data, 'base64');
    
    // Derive key (assume scrypt for v1)
    const key = await KeyDerivation.deriveKey(password, salt, 'scrypt');
    
    if (encryptedData.algorithm === 'aes-256-gcm') {
      if (!encryptedData.authTag) {
        throw new Error('Missing auth tag for GCM mode');
      }
      
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      return Buffer.concat([decipher.update(data), decipher.final()]);
    } else {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([decipher.update(data), decipher.final()]);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRITY CHECKER
// ═══════════════════════════════════════════════════════════════════════════

class IntegrityChecker {
  computeHash(data: Buffer | string, algorithm: string = 'sha256'): string {
    const hash = crypto.createHash(algorithm);
    hash.update(typeof data === 'string' ? Buffer.from(data) : data);
    return hash.digest('hex');
  }
  
  async computeFileHash(filePath: string, algorithm: string = 'sha256'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  verify(data: Buffer | string, expectedHash: string, algorithm: string = 'sha256'): IntegrityCheckResult {
    const actualHash = this.computeHash(data, algorithm);
    
    return {
      valid: actualHash === expectedHash,
      expectedHash,
      actualHash
    };
  }
  
  async verifyFile(filePath: string, expectedHash: string, algorithm: string = 'sha256'): Promise<IntegrityCheckResult> {
    try {
      const actualHash = await this.computeFileHash(filePath, algorithm);
      
      return {
        valid: actualHash === expectedHash,
        expectedHash,
        actualHash
      };
    } catch (error: any) {
      return {
        valid: false,
        expectedHash,
        error: error?.message
      };
    }
  }
  
  createHMAC(data: Buffer | string, key: string): string {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(typeof data === 'string' ? Buffer.from(data) : data);
    return hmac.digest('hex');
  }
  
  verifyHMAC(data: Buffer | string, expectedHMAC: string, key: string): boolean {
    const actualHMAC = this.createHMAC(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(actualHMAC, 'hex'),
      Buffer.from(expectedHMAC, 'hex')
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LICENSE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class LicenseManager {
  private publicKey: string;
  private currentLicense: License | null = null;
  
  constructor() {
    // Public key for license verification (in real implementation, this would be embedded)
    this.publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3QWJB5D5K2D3k0Y9J7
...placeholder for actual public key...
-----END PUBLIC KEY-----`;
  }
  
  getMachineId(): string {
    // Generate a unique machine ID based on hardware info
    const data = [
      process.platform,
      process.arch,
      require('os').hostname(),
      require('os').cpus()[0]?.model || 'unknown'
    ].join('|');
    
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }
  
  async validateLicense(license: License): Promise<{ valid: boolean; reason?: string }> {
    // Check expiration
    if (license.expiresAt) {
      const expiry = new Date(license.expiresAt);
      if (expiry < new Date()) {
        return { valid: false, reason: 'License has expired' };
      }
    }
    
    // Check machine ID
    const machineId = this.getMachineId();
    if (license.machineId !== machineId) {
      return { valid: false, reason: 'License is for a different machine' };
    }
    
    // Verify signature (simplified - real implementation would use RSA)
    const dataToSign = [
      license.id,
      license.type,
      license.email,
      license.issuedAt,
      license.expiresAt || '',
      license.machineId
    ].join('|');
    
    const expectedSignature = crypto
      .createHash('sha256')
      .update(dataToSign + 'imosion-secret')
      .digest('hex');
    
    if (license.signature !== expectedSignature) {
      return { valid: false, reason: 'Invalid license signature' };
    }
    
    this.currentLicense = license;
    return { valid: true };
  }
  
  getCurrentLicense(): License | null {
    return this.currentLicense;
  }
  
  hasFeature(feature: string): boolean {
    if (!this.currentLicense) return false;
    return this.currentLicense.features.includes(feature);
  }
  
  getLicenseType(): string {
    return this.currentLicense?.type || 'free';
  }
  
  generateTrialLicense(): License {
    const machineId = this.getMachineId();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    
    const dataToSign = [
      `trial-${Date.now()}`,
      'personal',
      'trial@imosion.app',
      issuedAt,
      expiresAt,
      machineId
    ].join('|');
    
    return {
      id: `trial-${Date.now()}`,
      type: 'personal',
      email: 'trial@imosion.app',
      issuedAt,
      expiresAt,
      features: ['basic-effects', 'basic-instruments', 'export-wav'],
      machineId,
      signature: crypto
        .createHash('sha256')
        .update(dataToSign + 'imosion-secret')
        .digest('hex')
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

class SecureStorage {
  private storagePath: string;
  private encryptionEngine: EncryptionEngine;
  private masterKey: string;
  
  constructor() {
    const userDataPath = app?.getPath?.('userData') || './data';
    this.storagePath = path.join(userDataPath, 'imosion', 'secure-storage.dat');
    this.encryptionEngine = new EncryptionEngine();
    
    // Derive master key from machine-specific data
    this.masterKey = this.deriveMasterKey();
    
    this.ensureStorageExists();
  }
  
  private deriveMasterKey(): string {
    const data = [
      process.platform,
      require('os').hostname(),
      'imosion-secure-storage'
    ].join('|');
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  private ensureStorageExists(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(this.storagePath)) {
      this.saveStorage({});
    }
  }
  
  private async loadStorage(): Promise<Record<string, SecureStorageEntry>> {
    try {
      const encrypted = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
      const decrypted = await this.encryptionEngine.decrypt(encrypted, this.masterKey);
      return JSON.parse(decrypted.toString('utf-8'));
    } catch {
      return {};
    }
  }
  
  private async saveStorage(data: Record<string, SecureStorageEntry>): Promise<void> {
    const encrypted = await this.encryptionEngine.encrypt(
      JSON.stringify(data),
      this.masterKey
    );
    fs.writeFileSync(this.storagePath, JSON.stringify(encrypted));
  }
  
  async set(key: string, value: string): Promise<void> {
    const storage = await this.loadStorage();
    const now = new Date().toISOString();
    
    storage[key] = {
      key,
      value,
      createdAt: storage[key]?.createdAt || now,
      updatedAt: now
    };
    
    await this.saveStorage(storage);
  }
  
  async get(key: string): Promise<string | null> {
    const storage = await this.loadStorage();
    return storage[key]?.value || null;
  }
  
  async delete(key: string): Promise<void> {
    const storage = await this.loadStorage();
    delete storage[key];
    await this.saveStorage(storage);
  }
  
  async has(key: string): Promise<boolean> {
    const storage = await this.loadStorage();
    return key in storage;
  }
  
  async clear(): Promise<void> {
    await this.saveStorage({});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SECURITY CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ImosionSecurity extends EventEmitter {
  private encryptionEngine: EncryptionEngine;
  private integrityChecker: IntegrityChecker;
  private licenseManager: LicenseManager;
  private secureStorage: SecureStorage;
  
  constructor() {
    super();
    
    this.encryptionEngine = new EncryptionEngine();
    this.integrityChecker = new IntegrityChecker();
    this.licenseManager = new LicenseManager();
    this.secureStorage = new SecureStorage();
    
    console.log('[ImosionSecurity] Initialized');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Encryption
  // ─────────────────────────────────────────────────────────────────────────
  
  async encryptProject(projectData: any, password: string): Promise<EncryptedData> {
    const json = JSON.stringify(projectData);
    return this.encryptionEngine.encrypt(json, password);
  }
  
  async decryptProject(encryptedData: EncryptedData, password: string): Promise<any> {
    const decrypted = await this.encryptionEngine.decrypt(encryptedData, password);
    return JSON.parse(decrypted.toString('utf-8'));
  }
  
  async encryptFile(inputPath: string, outputPath: string, password: string): Promise<void> {
    const data = await fs.promises.readFile(inputPath);
    const encrypted = await this.encryptionEngine.encrypt(data, password);
    await fs.promises.writeFile(outputPath, JSON.stringify(encrypted));
  }
  
  async decryptFile(inputPath: string, outputPath: string, password: string): Promise<void> {
    const encryptedJson = await fs.promises.readFile(inputPath, 'utf-8');
    const encryptedData = JSON.parse(encryptedJson);
    const decrypted = await this.encryptionEngine.decrypt(encryptedData, password);
    await fs.promises.writeFile(outputPath, decrypted);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Integrity
  // ─────────────────────────────────────────────────────────────────────────
  
  computeProjectHash(projectData: any): string {
    return this.integrityChecker.computeHash(JSON.stringify(projectData));
  }
  
  verifyProjectIntegrity(projectData: any, expectedHash: string): IntegrityCheckResult {
    return this.integrityChecker.verify(JSON.stringify(projectData), expectedHash);
  }
  
  async computeFileHash(filePath: string): Promise<string> {
    return this.integrityChecker.computeFileHash(filePath);
  }
  
  async verifyFileIntegrity(filePath: string, expectedHash: string): Promise<IntegrityCheckResult> {
    return this.integrityChecker.verifyFile(filePath, expectedHash);
  }
  
  signData(data: string, secret: string): string {
    return this.integrityChecker.createHMAC(data, secret);
  }
  
  verifySignature(data: string, signature: string, secret: string): boolean {
    return this.integrityChecker.verifyHMAC(data, signature, secret);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // License
  // ─────────────────────────────────────────────────────────────────────────
  
  async validateLicense(license: License): Promise<{ valid: boolean; reason?: string }> {
    const result = await this.licenseManager.validateLicense(license);
    
    if (result.valid) {
      this.emit('licenseValidated', license);
    } else {
      this.emit('licenseInvalid', result.reason);
    }
    
    return result;
  }
  
  getCurrentLicense(): License | null {
    return this.licenseManager.getCurrentLicense();
  }
  
  hasFeature(feature: string): boolean {
    return this.licenseManager.hasFeature(feature);
  }
  
  getLicenseType(): string {
    return this.licenseManager.getLicenseType();
  }
  
  getMachineId(): string {
    return this.licenseManager.getMachineId();
  }
  
  generateTrialLicense(): License {
    return this.licenseManager.generateTrialLicense();
  }
  
  async activateTrial(): Promise<License> {
    const trial = this.generateTrialLicense();
    await this.validateLicense(trial);
    return trial;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Secure Storage
  // ─────────────────────────────────────────────────────────────────────────
  
  async storeCredential(key: string, value: string): Promise<void> {
    await this.secureStorage.set(key, value);
  }
  
  async getCredential(key: string): Promise<string | null> {
    return this.secureStorage.get(key);
  }
  
  async deleteCredential(key: string): Promise<void> {
    await this.secureStorage.delete(key);
  }
  
  async hasCredential(key: string): Promise<boolean> {
    return this.secureStorage.has(key);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────
  
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
  
  generatePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const bytes = crypto.randomBytes(length);
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }
    
    return password;
  }
  
  hashPassword(password: string): { hash: string; salt: string } {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
    return { hash, salt };
  }
  
  verifyPassword(password: string, hash: string, salt: string): boolean {
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  
  dispose(): void {
    this.removeAllListeners();
    console.log('[ImosionSecurity] Disposed');
  }
}

// Export singleton
let securityInstance: ImosionSecurity | null = null;

export function getSecurity(): ImosionSecurity {
  if (!securityInstance) {
    securityInstance = new ImosionSecurity();
  }
  return securityInstance;
}

export default ImosionSecurity;
