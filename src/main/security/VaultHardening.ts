// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Vault Security Hardening Layer
// Q1 Foundation & Trust: Finalize vault, password manager, authenticator
// Bank-grade encryption with zero-knowledge architecture
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, safeStorage, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface VaultSecurityConfig {
  // Encryption settings
  encryptionAlgorithm: 'aes-256-gcm';
  keyDerivationIterations: number;
  keyLength: number;
  saltLength: number;
  
  // Access policy
  autoLockMinutes: number;
  maxDecryptAttempts: number;
  clipboardClearSeconds: number;
  
  // Audit settings
  logAllAccess: boolean;
  retainAuditDays: number;
  
  // Backup settings
  autoBackupEnabled: boolean;
  backupEncrypted: boolean;
  maxBackupCount: number;
}

export interface VaultAccessEntry {
  id: string;
  timestamp: number;
  action: 'view' | 'copy' | 'create' | 'update' | 'delete' | 'export' | 'unlock' | 'lock';
  itemId?: string;
  itemType: 'credential' | 'authenticator' | 'note' | 'vault';
  success: boolean;
  failureReason?: string;
}

export interface CredentialHealth {
  id: string;
  name: string;
  issues: CredentialIssue[];
  score: number;  // 0-100
  lastChecked: number;
}

export interface CredentialIssue {
  type: 'weak-password' | 'reused-password' | 'old-password' | 'breached' | 'no-2fa' | 'http-url';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export interface VaultHealthReport {
  totalCredentials: number;
  totalAuthenticators: number;
  securityScore: number;
  issues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  credentialHealth: CredentialHealth[];
  recommendations: string[];
  lastAudit: number;
}

export interface BreachCheckResult {
  breached: boolean;
  breachCount: number;
  lastBreachDate?: string;
  sources?: string[];
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_VAULT_SECURITY_CONFIG: VaultSecurityConfig = {
  // Encryption settings (OWASP aligned)
  encryptionAlgorithm: 'aes-256-gcm',
  keyDerivationIterations: 310000,  // OWASP 2023 recommendation for PBKDF2-SHA256
  keyLength: 32,                     // 256 bits
  saltLength: 32,                    // 256 bits
  
  // Access policy
  autoLockMinutes: 15,
  maxDecryptAttempts: 5,
  clipboardClearSeconds: 30,
  
  // Audit settings
  logAllAccess: true,
  retainAuditDays: 90,
  
  // Backup settings
  autoBackupEnabled: true,
  backupEncrypted: true,
  maxBackupCount: 5,
};

// Password age threshold (90 days)
const PASSWORD_AGE_THRESHOLD_DAYS = 90;

// ===========================================================================
// VAULT HARDENING CLASS
// ===========================================================================

class VaultHardeningClass extends EventEmitter {
  private config: VaultSecurityConfig;
  private accessLog: VaultAccessEntry[] = [];
  private derivedKeyCache: Map<string, { key: Buffer; expires: number }> = new Map();
  private clipboardClearTimers: Map<string, NodeJS.Timeout> = new Map();
  private passwordHashes: Map<string, string> = new Map();  // For reuse detection
  private dataPath: string;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_VAULT_SECURITY_CONFIG };
    this.dataPath = path.join(app.getPath('userData'), 'vault-security');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDataDirectory();
    await this.loadConfig();
    await this.loadAccessLog();
    this.startMaintenanceTasks();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[VaultHardening] Vault security hardening layer initialized');
  }

  shutdown(): void {
    // Clear all clipboard timers
    for (const timer of this.clipboardClearTimers.values()) {
      clearTimeout(timer);
    }
    this.clipboardClearTimers.clear();
    
    // Clear derived key cache
    this.derivedKeyCache.clear();
    
    this.removeAllListeners();
    log.info('[VaultHardening] Vault security hardening layer shut down');
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'vault-hardening-config.json');
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        this.config = { ...DEFAULT_VAULT_SECURITY_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      log.error('[VaultHardening] Failed to load config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'vault-hardening-config.json');
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[VaultHardening] Failed to save config:', error);
    }
  }

  private async loadAccessLog(): Promise<void> {
    try {
      const logPath = path.join(this.dataPath, 'vault-access.json');
      if (fs.existsSync(logPath) && safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(logPath);
        const decrypted = safeStorage.decryptString(encrypted);
        this.accessLog = JSON.parse(decrypted);
        
        // Prune old entries
        const cutoff = Date.now() - (this.config.retainAuditDays * 24 * 60 * 60 * 1000);
        this.accessLog = this.accessLog.filter(e => e.timestamp > cutoff);
      }
    } catch (error) {
      log.warn('[VaultHardening] Failed to load access log:', error);
      this.accessLog = [];
    }
  }

  private async saveAccessLog(): Promise<void> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[VaultHardening] Secure storage not available for access log');
        return;
      }
      const logPath = path.join(this.dataPath, 'vault-access.json');
      const encrypted = safeStorage.encryptString(JSON.stringify(this.accessLog));
      fs.writeFileSync(logPath, encrypted);
    } catch (error) {
      log.error('[VaultHardening] Failed to save access log:', error);
    }
  }

  // -------------------------------------------------------------------------
  // ENCRYPTION HARDENING
  // -------------------------------------------------------------------------

  /**
   * Derive encryption key from master password using PBKDF2
   */
  deriveKey(masterPassword: string, salt: Buffer): Buffer {
    // Check cache first
    const cacheKey = `${crypto.createHash('sha256').update(masterPassword).digest('hex')}:${salt.toString('hex')}`;
    const cached = this.derivedKeyCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.key;
    }

    const key = crypto.pbkdf2Sync(
      masterPassword,
      salt,
      this.config.keyDerivationIterations,
      this.config.keyLength,
      'sha256'
    );

    // Cache for 5 minutes
    this.derivedKeyCache.set(cacheKey, {
      key,
      expires: Date.now() + (5 * 60 * 1000),
    });

    return key;
  }

  /**
   * Generate cryptographically secure salt
   */
  generateSalt(): Buffer {
    return crypto.randomBytes(this.config.saltLength);
  }

  /**
   * Generate cryptographically secure IV for AES-GCM
   */
  generateIV(): Buffer {
    return crypto.randomBytes(12);  // 96 bits for AES-GCM
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
    const iv = this.generateIV();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(ciphertext: string, key: Buffer, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }

  /**
   * Secure password comparison (constant-time)
   */
  secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    
    if (bufA.length !== bufB.length) {
      // Still do comparison to maintain constant time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // -------------------------------------------------------------------------
  // PASSWORD ANALYSIS
  // -------------------------------------------------------------------------

  /**
   * Analyze password for reuse across credentials
   */
  checkPasswordReuse(password: string, credentialId: string): { reused: boolean; matchingIds: string[] } {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const matchingIds: string[] = [];

    for (const [id, existingHash] of this.passwordHashes) {
      if (id !== credentialId && existingHash === hash) {
        matchingIds.push(id);
      }
    }

    // Update hash map
    this.passwordHashes.set(credentialId, hash);

    return {
      reused: matchingIds.length > 0,
      matchingIds,
    };
  }

  /**
   * Register password hash for reuse detection
   */
  registerPasswordHash(credentialId: string, password: string): void {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    this.passwordHashes.set(credentialId, hash);
  }

  /**
   * Remove password hash when credential is deleted
   */
  removePasswordHash(credentialId: string): void {
    this.passwordHashes.delete(credentialId);
  }

  /**
   * Check password against known breaches (local bloom filter or k-anonymity API)
   * This is a placeholder - in production, use Have I Been Pwned k-anonymity API
   */
  async checkPasswordBreach(password: string): Promise<BreachCheckResult> {
    // Use Have I Been Pwned k-anonymity API (sends only first 5 chars of SHA-1 hash)
    const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1Hash.substring(0, 5);
    const suffix = sha1Hash.substring(5);

    try {
      const https = await import('https');
      const responseText = await new Promise<string>((resolve, reject) => {
        const req = https.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'User-Agent': 'DEX-PasswordCheck' }
        }, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
      });

      // Search for our suffix in the response
      const lines = responseText.split('\n');
      for (const line of lines) {
        const [hashSuffix, count] = line.trim().split(':');
        if (hashSuffix === suffix) {
          return {
            breached: true,
            breachCount: parseInt(count, 10) || 1,
            sources: ['Have I Been Pwned'],
          };
        }
      }

      return { breached: false, breachCount: 0 };
    } catch {
      // Network error — fall back to common password check
      const commonBreached = [
        'password', '123456', '12345678', 'qwerty', 'abc123',
        'password1', 'password123', 'admin', 'letmein', 'welcome',
      ];

      if (commonBreached.includes(password.toLowerCase())) {
        return {
          breached: true,
          breachCount: 0,
          sources: ['Common password list (offline check)'],
        };
      }

      return { breached: false, breachCount: 0 };
    }
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(options: {
    length?: number;
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
    excludeSimilar?: boolean;
    excludeAmbiguous?: boolean;
  } = {}): string {
    const {
      length = 20,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
      excludeSimilar = true,
      excludeAmbiguous = true,
    } = options;

    let chars = '';
    const uppercaseChars = excludeSimilar ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseChars = excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = excludeSimilar ? '23456789' : '0123456789';
    const symbolChars = excludeAmbiguous ? '!@#$%^&*-_=+' : '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (uppercase) chars += uppercaseChars;
    if (lowercase) chars += lowercaseChars;
    if (numbers) chars += numberChars;
    if (symbols) chars += symbolChars;

    if (!chars) chars = lowercaseChars + numberChars;

    // Generate password using crypto.randomBytes for true randomness
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i] % chars.length];
    }

    // Ensure at least one of each required character type
    const requirements: { chars: string; flag: boolean }[] = [
      { chars: uppercaseChars, flag: uppercase },
      { chars: lowercaseChars, flag: lowercase },
      { chars: numberChars, flag: numbers },
      { chars: symbolChars, flag: symbols },
    ];

    for (const req of requirements) {
      if (req.flag && !password.split('').some(c => req.chars.includes(c))) {
        const pos = crypto.randomBytes(1)[0] % length;
        const charIdx = crypto.randomBytes(1)[0] % req.chars.length;
        password = password.substring(0, pos) + req.chars[charIdx] + password.substring(pos + 1);
      }
    }

    return password;
  }

  // -------------------------------------------------------------------------
  // CREDENTIAL HEALTH ANALYSIS
  // -------------------------------------------------------------------------

  /**
   * Analyze credential health and generate issues
   */
  async analyzeCredential(credential: {
    id: string;
    name: string;
    username?: string;
    password?: string;
    url?: string;
    createdAt: number;
    updatedAt: number;
    has2FA?: boolean;
  }): Promise<CredentialHealth> {
    const issues: CredentialIssue[] = [];
    let score = 100;

    // Check password strength
    if (credential.password) {
      const strengthScore = this.calculatePasswordStrengthScore(credential.password);
      if (strengthScore < 40) {
        issues.push({
          type: 'weak-password',
          severity: strengthScore < 20 ? 'critical' : 'high',
          description: 'Password is weak and easily guessable',
          recommendation: 'Generate a new strong password with at least 16 characters',
        });
        score -= strengthScore < 20 ? 30 : 20;
      }

      // Check password reuse
      const reuseCheck = this.checkPasswordReuse(credential.password, credential.id);
      if (reuseCheck.reused) {
        issues.push({
          type: 'reused-password',
          severity: 'high',
          description: `Password is reused across ${reuseCheck.matchingIds.length} other accounts`,
          recommendation: 'Use a unique password for each account',
        });
        score -= 20;
      }

      // Check password age
      const passwordAgeDays = (Date.now() - credential.updatedAt) / (1000 * 60 * 60 * 24);
      if (passwordAgeDays > PASSWORD_AGE_THRESHOLD_DAYS) {
        issues.push({
          type: 'old-password',
          severity: 'medium',
          description: `Password has not been changed in ${Math.floor(passwordAgeDays)} days`,
          recommendation: 'Consider updating your password periodically',
        });
        score -= 10;
      }

      // Check for breach
      const breachCheck = await this.checkPasswordBreach(credential.password);
      if (breachCheck.breached) {
        issues.push({
          type: 'breached',
          severity: 'critical',
          description: `Password found in ${breachCheck.breachCount.toLocaleString()} data breaches`,
          recommendation: 'Change this password immediately',
        });
        score -= 40;
      }
    }

    // Check for 2FA
    if (!credential.has2FA) {
      issues.push({
        type: 'no-2fa',
        severity: 'medium',
        description: 'Two-factor authentication is not enabled',
        recommendation: 'Enable 2FA for additional security',
      });
      score -= 10;
    }

    // Check URL security
    if (credential.url && credential.url.startsWith('http://')) {
      issues.push({
        type: 'http-url',
        severity: 'medium',
        description: 'Website uses insecure HTTP connection',
        recommendation: 'Update to HTTPS URL if available',
      });
      score -= 10;
    }

    return {
      id: credential.id,
      name: credential.name,
      issues,
      score: Math.max(0, score),
      lastChecked: Date.now(),
    };
  }

  /**
   * Calculate password strength score (0-100)
   */
  private calculatePasswordStrengthScore(password: string): number {
    let score = 0;

    // Length scoring
    score += Math.min(password.length * 3, 30);

    // Character variety
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 15;

    // Bonus for length > 16
    if (password.length > 16) score += 15;
    if (password.length > 24) score += 10;

    return Math.min(100, score);
  }

  /**
   * Generate vault health report
   */
  async generateHealthReport(credentials: Array<{
    id: string;
    name: string;
    username?: string;
    password?: string;
    url?: string;
    createdAt: number;
    updatedAt: number;
    has2FA?: boolean;
  }>, authenticatorCount: number): Promise<VaultHealthReport> {
    const credentialHealth: CredentialHealth[] = [];
    const issues = { critical: 0, high: 0, medium: 0, low: 0 };
    const recommendations: Set<string> = new Set();

    for (const cred of credentials) {
      const health = await this.analyzeCredential(cred);
      credentialHealth.push(health);

      for (const issue of health.issues) {
        issues[issue.severity]++;
        recommendations.add(issue.recommendation);
      }
    }

    // Calculate overall score
    const avgScore = credentialHealth.length > 0
      ? credentialHealth.reduce((sum, h) => sum + h.score, 0) / credentialHealth.length
      : 100;

    // Adjust for issue severity
    const severityPenalty = (issues.critical * 15) + (issues.high * 10) + (issues.medium * 5) + (issues.low * 2);
    const securityScore = Math.max(0, Math.min(100, avgScore - severityPenalty / credentials.length));

    return {
      totalCredentials: credentials.length,
      totalAuthenticators: authenticatorCount,
      securityScore: Math.round(securityScore),
      issues,
      credentialHealth,
      recommendations: Array.from(recommendations),
      lastAudit: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // ACCESS LOGGING
  // -------------------------------------------------------------------------

  /**
   * Log vault access
   */
  logAccess(entry: Omit<VaultAccessEntry, 'id' | 'timestamp'>): void {
    if (!this.config.logAllAccess) return;

    const fullEntry: VaultAccessEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    };

    this.accessLog.push(fullEntry);
    this.emit('access', fullEntry);

    // Prune old entries
    const cutoff = Date.now() - (this.config.retainAuditDays * 24 * 60 * 60 * 1000);
    this.accessLog = this.accessLog.filter(e => e.timestamp > cutoff);

    // Save async
    this.saveAccessLog().catch((e: unknown) => { log.warn('[DEX]', e); });
  }

  /**
   * Get access history
   */
  getAccessHistory(filters?: {
    itemId?: string;
    action?: VaultAccessEntry['action'];
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): VaultAccessEntry[] {
    let entries = [...this.accessLog];

    if (filters?.itemId) {
      entries = entries.filter(e => e.itemId === filters.itemId);
    }
    if (filters?.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    if (filters?.startTime) {
      entries = entries.filter(e => e.timestamp >= filters.startTime!);
    }
    if (filters?.endTime) {
      entries = entries.filter(e => e.timestamp <= filters.endTime!);
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (filters?.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  // -------------------------------------------------------------------------
  // CLIPBOARD SECURITY
  // -------------------------------------------------------------------------

  /**
   * Schedule clipboard clear after copying sensitive data
   */
  scheduleClipboardClear(clipboardId: string): void {
    // Clear any existing timer
    const existingTimer = this.clipboardClearTimers.get(clipboardId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      try {
        const { clipboard } = require('electron');
        clipboard.clear();
        this.clipboardClearTimers.delete(clipboardId);
        this.emit('clipboard-cleared', { clipboardId });
        log.debug('[VaultHardening] Clipboard cleared for security');
      } catch (error) {
        log.error('[VaultHardening] Failed to clear clipboard:', error);
      }
    }, this.config.clipboardClearSeconds * 1000);

    this.clipboardClearTimers.set(clipboardId, timer);
  }

  /**
   * Force clear clipboard immediately
   */
  clearClipboardNow(): void {
    try {
      const { clipboard } = require('electron');
      clipboard.clear();
      
      // Clear all scheduled timers
      for (const timer of this.clipboardClearTimers.values()) {
        clearTimeout(timer);
      }
      this.clipboardClearTimers.clear();
      
      this.emit('clipboard-cleared', { forced: true });
    } catch (error) {
      log.error('[VaultHardening] Failed to clear clipboard:', error);
    }
  }

  // -------------------------------------------------------------------------
  // BACKUP SECURITY
  // -------------------------------------------------------------------------

  /**
   * Create encrypted backup of vault data
   */
  async createEncryptedBackup(vaultData: string, backupPassword: string): Promise<{ 
    success: boolean; 
    backupPath?: string; 
    error?: string 
  }> {
    try {
      const backupDir = path.join(this.dataPath, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `vault-backup-${timestamp}.dexbackup`);

      // Encrypt backup
      const salt = this.generateSalt();
      const key = this.deriveKey(backupPassword, salt);
      const encrypted = this.encrypt(vaultData, key);

      const backupPackage = {
        version: 1,
        createdAt: Date.now(),
        salt: salt.toString('base64'),
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        data: encrypted.ciphertext,
      };

      fs.writeFileSync(backupPath, JSON.stringify(backupPackage, null, 2));

      // Prune old backups
      await this.pruneOldBackups(backupDir);

      this.logAccess({
        action: 'export',
        itemType: 'vault',
        success: true,
      });

      return { success: true, backupPath };
    } catch (error) {
      log.error('[VaultHardening] Backup creation failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Restore from encrypted backup
   */
  async restoreFromBackup(backupPath: string, backupPassword: string): Promise<{
    success: boolean;
    data?: string;
    error?: string;
  }> {
    try {
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      const backupPackage = JSON.parse(backupContent);

      if (!backupPackage.version || !backupPackage.salt || !backupPackage.data) {
        return { success: false, error: 'Invalid backup format' };
      }

      const salt = Buffer.from(backupPackage.salt, 'base64');
      const key = this.deriveKey(backupPassword, salt);

      try {
        const decrypted = this.decrypt(
          backupPackage.data,
          key,
          backupPackage.iv,
          backupPackage.authTag
        );

        return { success: true, data: decrypted };
      } catch {
        return { success: false, error: 'Incorrect backup password' };
      }
    } catch (error) {
      log.error('[VaultHardening] Backup restore failed:', error);
      return { success: false, error: String(error) };
    }
  }

  private async pruneOldBackups(backupDir: string): Promise<void> {
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.dexbackup'))
        .map(f => ({
          name: f,
          path: path.join(backupDir, f),
          mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Keep only the most recent backups
      const toDelete = files.slice(this.config.maxBackupCount);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        log.debug(`[VaultHardening] Pruned old backup: ${file.name}`);
      }
    } catch (error) {
      log.error('[VaultHardening] Failed to prune backups:', error);
    }
  }

  // -------------------------------------------------------------------------
  // MAINTENANCE
  // -------------------------------------------------------------------------

  private startMaintenanceTasks(): void {
    // Clean up expired derived keys every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.derivedKeyCache) {
        if (value.expires < now) {
          this.derivedKeyCache.delete(key);
        }
      }
    }, 60000);
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('vaultHardening:generatePassword', (_, options) => 
      this.generateSecurePassword(options));

    ipcMain.handle('vaultHardening:analyzeCredential', async (_, credential) => 
      this.analyzeCredential(credential));

    ipcMain.handle('vaultHardening:generateHealthReport', async (_, credentials, authenticatorCount) => 
      this.generateHealthReport(credentials, authenticatorCount));

    ipcMain.handle('vaultHardening:checkPasswordBreach', async (_, password) => 
      this.checkPasswordBreach(password));

    ipcMain.handle('vaultHardening:getAccessHistory', (_, filters) => 
      this.getAccessHistory(filters));

    ipcMain.handle('vaultHardening:createBackup', async (_, vaultData, password) => 
      this.createEncryptedBackup(vaultData, password));

    ipcMain.handle('vaultHardening:restoreBackup', async (_, backupPath, password) => 
      this.restoreFromBackup(backupPath, password));

    ipcMain.handle('vaultHardening:getConfig', () => ({ ...this.config }));

    ipcMain.handle('vaultHardening:updateConfig', async (_, updates: Partial<VaultSecurityConfig>) => {
      this.config = { ...this.config, ...updates };
      await this.saveConfig();
      return { success: true };
    });

    ipcMain.on('vaultHardening:scheduleClipboardClear', (_, clipboardId) => 
      this.scheduleClipboardClear(clipboardId));

    ipcMain.on('vaultHardening:clearClipboardNow', () => 
      this.clearClipboardNow());

    ipcMain.on('vaultHardening:logAccess', (_, entry) => 
      this.logAccess(entry));
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  getConfig(): VaultSecurityConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const vaultHardening = new VaultHardeningClass();

// Export initialization function
export async function initializeVaultHardening(): Promise<void> {
  return vaultHardening.initialize();
}
