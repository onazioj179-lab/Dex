// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Authentication Hardening Layer
// Q1 Foundation & Trust: Finalize authentication (biometric, PIN, password)
// OS-grade security with zero tolerance for auth bypass
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, safeStorage, systemPreferences, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type AuthMethod = 'none' | 'password' | 'pin' | 'biometric' | 'password+biometric' | 'pin+biometric';
export type AuthEvent = 'lock' | 'unlock' | 'failed-attempt' | 'lockout' | 'session-expired' | 'credential-change';

export interface AuthSecurityConfig {
  // Password requirements
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  
  // PIN requirements
  pinLength: 4 | 6 | 8;
  pinMaxRepeating: number;
  pinNoSequential: boolean;
  
  // Lockout policy
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  progressiveLockout: boolean;
  
  // Session policy
  sessionTimeoutMinutes: number;
  lockOnSleep: boolean;
  lockOnScreenLock: boolean;
  lockOnIdle: boolean;
  idleTimeoutMinutes: number;
  
  // Biometric policy
  biometricFallbackRequired: boolean;
  biometricRevalidateHours: number;
}

export interface AuthAuditEntry {
  id: string;
  timestamp: number;
  event: AuthEvent;
  method: AuthMethod;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  failureReason?: string;
}

export interface SecureSession {
  id: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  authMethod: AuthMethod;
  biometricVerifiedAt?: number;
  isValid: boolean;
}

export interface PasswordStrengthResult {
  score: number;  // 0-100
  level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  feedback: string[];
  estimatedCrackTime: string;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_SECURITY_CONFIG: AuthSecurityConfig = {
  // Password requirements (NIST 800-63B aligned)
  minPasswordLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: false,  // NIST recommends against mandatory special chars
  
  // PIN requirements
  pinLength: 6,
  pinMaxRepeating: 2,     // No more than 2 repeating digits
  pinNoSequential: true,  // No sequential patterns like 1234
  
  // Lockout policy
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 5,
  progressiveLockout: true,  // Each lockout doubles duration
  
  // Session policy
  sessionTimeoutMinutes: 30,
  lockOnSleep: true,
  lockOnScreenLock: true,
  lockOnIdle: true,
  idleTimeoutMinutes: 15,
  
  // Biometric policy
  biometricFallbackRequired: true,  // Must have password/PIN backup
  biometricRevalidateHours: 24,     // Re-verify biometric every 24h
};

// Crypto constants
const HASH_ALGORITHM = 'argon2id';  // Would use argon2 in production
const PBKDF2_ITERATIONS = 310000;   // OWASP 2023 recommendation
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;

// ===========================================================================
// AUTH HARDENING CLASS
// ===========================================================================

class AuthHardeningClass extends EventEmitter {
  private config: AuthSecurityConfig;
  private currentSession: SecureSession | null = null;
  private auditLog: AuthAuditEntry[] = [];
  private failedAttempts: number = 0;
  private lockoutUntil: number = 0;
  private lockoutCount: number = 0;
  private lastActivityTime: number = Date.now();
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private dataPath: string;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_SECURITY_CONFIG };
    this.dataPath = path.join(app.getPath('userData'), 'security');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDataDirectory();
    await this.loadConfig();
    await this.loadAuditLog();
    this.setupSystemListeners();
    this.startIdleMonitoring();
    this.startSessionMonitoring();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[AuthHardening] Authentication hardening layer initialized');
  }

  shutdown(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    this.removeAllListeners();
    log.info('[AuthHardening] Authentication hardening layer shut down');
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'auth-hardening-config.json');
      try {
        const data = await fsPromises.readFile(configPath, 'utf-8');
        this.config = { ...DEFAULT_SECURITY_CONFIG, ...JSON.parse(data) };
      } catch { /* file doesn't exist yet, use defaults */ }
    } catch (error) {
      log.error('[AuthHardening] Failed to load config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'auth-hardening-config.json');
      await fsPromises.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[AuthHardening] Failed to save config:', error);
    }
  }

  private async loadAuditLog(): Promise<void> {
    try {
      const auditPath = path.join(this.dataPath, 'auth-audit.json');
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = await fsPromises.readFile(auditPath);
          const decrypted = safeStorage.decryptString(encrypted);
          this.auditLog = JSON.parse(decrypted);
          if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
          }
        } catch { /* file doesn't exist yet */ }
      }
    } catch (error) {
      log.warn('[AuthHardening] Failed to load audit log:', error);
      this.auditLog = [];
    }
  }

  private async saveAuditLog(): Promise<void> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[AuthHardening] Secure storage not available for audit log');
        return;
      }
      const auditPath = path.join(this.dataPath, 'auth-audit.json');
      const encrypted = safeStorage.encryptString(JSON.stringify(this.auditLog));
      await fsPromises.writeFile(auditPath, encrypted);
    } catch (error) {
      log.error('[AuthHardening] Failed to save audit log:', error);
    }
  }

  // -------------------------------------------------------------------------
  // PASSWORD VALIDATION & STRENGTH
  // -------------------------------------------------------------------------

  /**
   * Validate password against security policy
   */
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < this.config.minPasswordLength) {
      errors.push(`Password must be at least ${this.config.minPasswordLength} characters`);
    }

    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.config.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.config.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common patterns
    if (this.isCommonPassword(password)) {
      errors.push('This password is too common. Please choose a stronger password.');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate password strength score
   */
  calculatePasswordStrength(password: string): PasswordStrengthResult {
    let score = 0;
    const feedback: string[] = [];

    // Length scoring (up to 30 points)
    score += Math.min(password.length * 2, 30);

    // Character variety (up to 40 points)
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;

    // Bonus for mixed case usage (up to 10 points)
    const upperCount = (password.match(/[A-Z]/g) || []).length;
    const lowerCount = (password.match(/[a-z]/g) || []).length;
    if (upperCount > 0 && lowerCount > 0) {
      score += Math.min(10, Math.min(upperCount, lowerCount));
    }

    // Penalty for repetition
    const repetitionPenalty = this.calculateRepetitionPenalty(password);
    score = Math.max(0, score - repetitionPenalty);

    // Penalty for common patterns
    if (this.hasCommonPattern(password)) {
      score = Math.max(0, score - 20);
      feedback.push('Avoid common patterns like "123" or "abc"');
    }

    // Generate feedback
    if (password.length < 12) feedback.push('Use at least 12 characters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special characters');

    // Determine level
    let level: PasswordStrengthResult['level'];
    if (score < 20) level = 'weak';
    else if (score < 40) level = 'fair';
    else if (score < 60) level = 'good';
    else if (score < 80) level = 'strong';
    else level = 'excellent';

    // Estimate crack time (simplified)
    const estimatedCrackTime = this.estimateCrackTime(password);

    return { score, level, feedback, estimatedCrackTime };
  }

  private isCommonPassword(password: string): boolean {
    // Top common passwords to check against
    const commonPasswords = [
      'password', '123456', '12345678', 'qwerty', 'abc123',
      'monkey', '1234567', 'letmein', 'trustno1', 'dragon',
      'baseball', 'iloveyou', 'master', 'sunshine', 'ashley',
      'bailey', 'shadow', '123123', '654321', 'superman',
      'qazwsx', 'michael', 'football', 'password1', 'password123',
    ];
    return commonPasswords.includes(password.toLowerCase());
  }

  private hasCommonPattern(password: string): boolean {
    const patterns = [
      /(.)\1{2,}/,           // 3+ repeating characters
      /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i,
      /(?:012|123|234|345|456|567|678|789)/,
      /(?:qwerty|asdf|zxcv)/i,
    ];
    return patterns.some(p => p.test(password));
  }

  private calculateRepetitionPenalty(password: string): number {
    let penalty = 0;
    const charCounts: Record<string, number> = {};
    
    for (const char of password.toLowerCase()) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }

    for (const count of Object.values(charCounts)) {
      if (count > 2) {
        penalty += (count - 2) * 3;
      }
    }

    return penalty;
  }

  private estimateCrackTime(password: string): string {
    // Simplified entropy calculation
    let charsetSize = 0;
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

    const entropy = password.length * Math.log2(charsetSize || 1);
    const guessesPerSecond = 10000000000; // 10 billion (modern GPU)
    const secondsToCrack = Math.pow(2, entropy) / guessesPerSecond;

    if (secondsToCrack < 1) return 'instantly';
    if (secondsToCrack < 60) return 'less than a minute';
    if (secondsToCrack < 3600) return `${Math.round(secondsToCrack / 60)} minutes`;
    if (secondsToCrack < 86400) return `${Math.round(secondsToCrack / 3600)} hours`;
    if (secondsToCrack < 31536000) return `${Math.round(secondsToCrack / 86400)} days`;
    if (secondsToCrack < 31536000 * 100) return `${Math.round(secondsToCrack / 31536000)} years`;
    return 'centuries';
  }

  // -------------------------------------------------------------------------
  // PIN VALIDATION
  // -------------------------------------------------------------------------

  /**
   * Validate PIN against security policy
   */
  validatePIN(pin: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check length
    if (pin.length !== this.config.pinLength) {
      errors.push(`PIN must be exactly ${this.config.pinLength} digits`);
    }

    // Check digits only
    if (!/^\d+$/.test(pin)) {
      errors.push('PIN must contain only digits');
    }

    // Check for repeating digits
    const maxRepeating = this.config.pinMaxRepeating;
    const repeatPattern = new RegExp(`(\\d)\\1{${maxRepeating},}`);
    if (repeatPattern.test(pin)) {
      errors.push(`PIN cannot have more than ${maxRepeating} repeating digits`);
    }

    // Check for sequential patterns
    if (this.config.pinNoSequential && this.hasSequentialPattern(pin)) {
      errors.push('PIN cannot contain sequential patterns (e.g., 1234, 9876)');
    }

    // Check for common PINs
    if (this.isCommonPIN(pin)) {
      errors.push('This PIN is too common. Please choose a different PIN.');
    }

    return { valid: errors.length === 0, errors };
  }

  private hasSequentialPattern(pin: string): boolean {
    for (let i = 0; i < pin.length - 2; i++) {
      const d1 = parseInt(pin[i]);
      const d2 = parseInt(pin[i + 1]);
      const d3 = parseInt(pin[i + 2]);
      
      // Check ascending sequence
      if (d2 === d1 + 1 && d3 === d2 + 1) return true;
      // Check descending sequence
      if (d2 === d1 - 1 && d3 === d2 - 1) return true;
    }
    return false;
  }

  private isCommonPIN(pin: string): boolean {
    const commonPINs = [
      '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
      '1234', '4321', '1212', '2580', '0852', '1998', '2000', '2001', '2002', '2003',
      '000000', '111111', '123456', '654321', '121212', '696969',
    ];
    return commonPINs.includes(pin);
  }

  // -------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Create a new secure session after successful authentication
   */
  createSession(authMethod: AuthMethod): SecureSession {
    const session: SecureSession = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex'),
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.config.sessionTimeoutMinutes * 60 * 1000),
      lastActivityAt: Date.now(),
      authMethod,
      isValid: true,
    };

    if (authMethod.includes('biometric')) {
      session.biometricVerifiedAt = Date.now();
    }

    this.currentSession = session;
    this.failedAttempts = 0;
    this.emit('session-created', { sessionId: session.id, authMethod });

    return session;
  }

  /**
   * Validate and refresh session
   */
  validateSession(token: string): { valid: boolean; reason?: string } {
    if (!this.currentSession) {
      return { valid: false, reason: 'No active session' };
    }

    if (this.currentSession.token !== token) {
      return { valid: false, reason: 'Invalid session token' };
    }

    if (!this.currentSession.isValid) {
      return { valid: false, reason: 'Session invalidated' };
    }

    if (Date.now() > this.currentSession.expiresAt) {
      this.invalidateSession('Session expired');
      return { valid: false, reason: 'Session expired' };
    }

    // Check biometric revalidation
    if (this.currentSession.authMethod.includes('biometric')) {
      const hoursSinceBiometric = (Date.now() - (this.currentSession.biometricVerifiedAt || 0)) / (1000 * 60 * 60);
      if (hoursSinceBiometric > this.config.biometricRevalidateHours) {
        return { valid: false, reason: 'Biometric revalidation required' };
      }
    }

    // Refresh session activity
    this.currentSession.lastActivityAt = Date.now();
    this.lastActivityTime = Date.now();

    return { valid: true };
  }

  /**
   * Invalidate current session
   */
  invalidateSession(reason: string): void {
    if (this.currentSession) {
      this.currentSession.isValid = false;
      this.recordAuditEntry('session-expired', this.currentSession.authMethod, false, reason);
      this.emit('session-invalidated', { sessionId: this.currentSession.id, reason });
      this.currentSession = null;
    }
  }

  // -------------------------------------------------------------------------
  // LOCKOUT MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Check if currently locked out
   */
  isLockedOut(): boolean {
    return Date.now() < this.lockoutUntil;
  }

  /**
   * Get lockout status
   */
  getLockoutStatus(): { lockedOut: boolean; remainingSeconds: number; attemptsMade: number; maxAttempts: number } {
    return {
      lockedOut: this.isLockedOut(),
      remainingSeconds: Math.max(0, Math.ceil((this.lockoutUntil - Date.now()) / 1000)),
      attemptsMade: this.failedAttempts,
      maxAttempts: this.config.maxFailedAttempts,
    };
  }

  /**
   * Record a failed authentication attempt
   */
  recordFailedAttempt(method: AuthMethod, reason: string): void {
    this.failedAttempts++;
    this.recordAuditEntry('failed-attempt', method, false, reason);
    this.emit('failed-attempt', { attemptNumber: this.failedAttempts, reason });

    if (this.failedAttempts >= this.config.maxFailedAttempts) {
      this.triggerLockout();
    }
  }

  /**
   * Trigger account lockout
   */
  private triggerLockout(): void {
    this.lockoutCount++;
    
    // Progressive lockout: double duration each time
    let lockoutMinutes = this.config.lockoutDurationMinutes;
    if (this.config.progressiveLockout) {
      lockoutMinutes = lockoutMinutes * Math.pow(2, this.lockoutCount - 1);
      lockoutMinutes = Math.min(lockoutMinutes, 60); // Cap at 1 hour
    }

    this.lockoutUntil = Date.now() + (lockoutMinutes * 60 * 1000);
    this.recordAuditEntry('lockout', 'none', false, `Lockout #${this.lockoutCount} for ${lockoutMinutes} minutes`);
    this.emit('lockout', { lockoutCount: this.lockoutCount, durationMinutes: lockoutMinutes });

    log.warn(`[AuthHardening] Account locked out for ${lockoutMinutes} minutes (lockout #${this.lockoutCount})`);
  }

  /**
   * Reset failed attempts after successful auth
   */
  resetFailedAttempts(): void {
    this.failedAttempts = 0;
    // Don't reset lockoutCount - that persists until app restart
  }

  // -------------------------------------------------------------------------
  // AUDIT LOGGING
  // -------------------------------------------------------------------------

  /**
   * Record an audit entry
   */
  private recordAuditEntry(event: AuthEvent, method: AuthMethod, success: boolean, reason?: string): void {
    const entry: AuthAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      event,
      method,
      success,
      failureReason: success ? undefined : reason,
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Save async
    this.saveAuditLog().catch((e: unknown) => { log.warn('[DEX]', e); });
  }

  /**
   * Get recent audit entries
   */
  getAuditLog(count: number = 50): AuthAuditEntry[] {
    return this.auditLog.slice(-count);
  }

  // -------------------------------------------------------------------------
  // SYSTEM LISTENERS
  // -------------------------------------------------------------------------

  private setupSystemListeners(): void {
    try {
      const { powerMonitor } = require('electron');

      if (this.config.lockOnSleep) {
        powerMonitor.on('suspend', () => {
          this.invalidateSession('System suspend');
          this.emit('lock-required', { reason: 'system-suspend' });
        });
      }

      if (this.config.lockOnScreenLock) {
        powerMonitor.on('lock-screen', () => {
          this.invalidateSession('Screen locked');
          this.emit('lock-required', { reason: 'screen-lock' });
        });
      }
    } catch (error) {
      log.warn('[AuthHardening] Failed to setup system listeners:', error);
    }
  }

  private startIdleMonitoring(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(() => {
      if (!this.config.lockOnIdle || !this.currentSession) return;

      const idleMinutes = (Date.now() - this.lastActivityTime) / (1000 * 60);
      if (idleMinutes >= this.config.idleTimeoutMinutes) {
        this.invalidateSession('Idle timeout');
        this.emit('lock-required', { reason: 'idle-timeout' });
      }
    }, 30000); // Check every 30 seconds
  }

  private startSessionMonitoring(): void {
    if (this.sessionCheckInterval) return;

    this.sessionCheckInterval = setInterval(() => {
      if (!this.currentSession) return;

      // Check session expiry
      if (Date.now() > this.currentSession.expiresAt) {
        this.invalidateSession('Session expired');
        this.emit('lock-required', { reason: 'session-expired' });
      }
    }, 60000); // Check every minute
  }

  /**
   * Record user activity (extends session)
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.currentSession) {
      this.currentSession.lastActivityAt = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('authHardening:validatePassword', (_, password: string) => 
      this.validatePassword(password));

    ipcMain.handle('authHardening:calculateStrength', (_, password: string) => 
      this.calculatePasswordStrength(password));

    ipcMain.handle('authHardening:validatePIN', (_, pin: string) => 
      this.validatePIN(pin));

    ipcMain.handle('authHardening:getLockoutStatus', () => 
      this.getLockoutStatus());

    ipcMain.handle('authHardening:getAuditLog', (_, count?: number) => 
      this.getAuditLog(count));

    ipcMain.handle('authHardening:getConfig', () => ({ ...this.config }));

    ipcMain.handle('authHardening:updateConfig', async (_, updates: Partial<AuthSecurityConfig>) => {
      this.config = { ...this.config, ...updates };
      await this.saveConfig();
      return { success: true };
    });

    ipcMain.on('authHardening:recordActivity', () => this.recordActivity());
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  /**
   * Get current session info (without sensitive data)
   */
  getCurrentSession(): { active: boolean; expiresIn: number; authMethod?: AuthMethod } | null {
    if (!this.currentSession || !this.currentSession.isValid) {
      return null;
    }

    return {
      active: true,
      expiresIn: Math.max(0, this.currentSession.expiresAt - Date.now()),
      authMethod: this.currentSession.authMethod,
    };
  }

  /**
   * Get security configuration
   */
  getConfig(): AuthSecurityConfig {
    return { ...this.config };
  }

  /**
   * Check if biometrics are available on this system
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        return systemPreferences.canPromptTouchID();
      }
      // Windows Hello check would go here
      return false;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const authHardening = new AuthHardeningClass();

// Export initialization function
export async function initializeAuthHardening(): Promise<void> {
  return authHardening.initialize();
}
