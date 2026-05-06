// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 8: Security as a Continuum (LAYERED)
// ===========================================================================
// Don't treat security as a binary lock/unlock.
// Introduce LEVELS OF TRUST. User can raise/lower trust based on context.
// Auto-lock sensitive data when switching intents.
// Biometrics, PIN, password, 2FA handled as OS-level primitives.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, safeStorage, systemPreferences } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type TrustLevel = 
  | 'public'        // No authentication needed
  | 'basic'         // PIN or pattern
  | 'standard'      // Password
  | 'elevated'      // Password + biometric
  | 'maximum';      // Password + biometric + 2FA

export type AuthMethod = 
  | 'password'
  | 'pin'
  | 'biometric'
  | 'hardware-key'
  | '2fa-totp'
  | '2fa-push';

export interface SecurityContext {
  currentTrustLevel: TrustLevel;
  authenticatedMethods: AuthMethod[];
  lastAuthentication: number;
  sessionStart: number;
  
  // Timeouts per trust level
  timeoutAt: Record<TrustLevel, number>;
  
  // Active locks
  activeLocks: SecurityLock[];
}

export interface SecurityLock {
  id: string;
  type: 'vault' | 'file' | 'folder' | 'feature' | 'intent';
  targetId: string;
  targetName: string;
  requiredTrustLevel: TrustLevel;
  lockedAt: number;
  lockedReason?: string;
  
  // Optional time-based unlock
  autoUnlockAt?: number;
}

export interface TrustRequirement {
  resourceType: string;
  resourceId: string;
  requiredLevel: TrustLevel;
  requiredMethods?: AuthMethod[];
  reason: string;
}

export interface AuthenticationAttempt {
  method: AuthMethod;
  timestamp: number;
  success: boolean;
  failureReason?: string;
}

export interface SecurityPolicy {
  // Trust level timeouts (ms)
  trustTimeouts: Record<TrustLevel, number>;
  
  // Auto-lock triggers
  autoLockOnIntentSwitch: boolean;
  autoLockOnIdle: boolean;
  idleTimeoutMs: number;
  
  // Requirements
  requireBiometricForVault: boolean;
  require2FAForExports: boolean;
  
  // Limits
  maxFailedAttempts: number;
  lockoutDurationMs: number;
  
  // Notifications
  notifyOnSecurityChange: boolean;
  notifyOnFailedAttempt: boolean;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: 'auth-success' | 'auth-failure' | 'trust-elevated' | 'trust-lowered' | 
        'lock-added' | 'lock-removed' | 'policy-changed' | 'security-alert';
  description: string;
  metadata?: Record<string, any>;
}

// ===========================================================================
// SECURITY CONTINUUM MANAGER
// ===========================================================================

class SecurityContinuumManagerClass extends EventEmitter {
  private context: SecurityContext;
  private policy: SecurityPolicy;
  private events: SecurityEvent[] = [];
  private failedAttempts: AuthenticationAttempt[] = [];
  private locks: Map<string, SecurityLock> = new Map();
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Monitoring
  private trustCheckInterval: NodeJS.Timeout | null = null;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  
  // Limits
  private readonly MAX_EVENTS = 1000;
  private readonly CHECK_INTERVAL_MS = 30 * 1000;  // 30 seconds

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'security');
    this.context = this.defaultContext();
    this.policy = this.defaultPolicy();
    this.setMaxListeners(20);
  }

  private defaultContext(): SecurityContext {
    return {
      currentTrustLevel: 'public',
      authenticatedMethods: [],
      lastAuthentication: 0,
      sessionStart: Date.now(),
      timeoutAt: {
        'public': Infinity,
        'basic': Date.now() + (4 * 60 * 60 * 1000),
        'standard': Date.now() + (2 * 60 * 60 * 1000),
        'elevated': Date.now() + (30 * 60 * 1000),
        'maximum': Date.now() + (10 * 60 * 1000),
      },
      activeLocks: [],
    };
  }

  private defaultPolicy(): SecurityPolicy {
    return {
      trustTimeouts: {
        'public': Infinity,
        'basic': 4 * 60 * 60 * 1000,      // 4 hours
        'standard': 2 * 60 * 60 * 1000,   // 2 hours
        'elevated': 30 * 60 * 1000,        // 30 minutes
        'maximum': 10 * 60 * 1000,         // 10 minutes
      },
      autoLockOnIntentSwitch: true,
      autoLockOnIdle: true,
      idleTimeoutMs: 15 * 60 * 1000,       // 15 minutes
      requireBiometricForVault: true,
      require2FAForExports: false,
      maxFailedAttempts: 5,
      lockoutDurationMs: 5 * 60 * 1000,    // 5 minutes
      notifyOnSecurityChange: true,
      notifyOnFailedAttempt: true,
    };
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadData();
    this.registerIPCHandlers();
    this.startMonitoring();

    this.isInitialized = true;
    log.info('[SecurityContinuum] Security continuum manager initialized');
  }

  shutdown(): void {
    if (this.trustCheckInterval) {
      clearInterval(this.trustCheckInterval);
      this.trustCheckInterval = null;
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    this.saveData();
    this.removeAllListeners();
    log.info('[SecurityContinuum] Security manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      // Load policy
      const policyPath = path.join(this.dataPath, 'policy.json');
      if (fs.existsSync(policyPath)) {
        this.policy = {
          ...this.defaultPolicy(),
          ...JSON.parse(fs.readFileSync(policyPath, 'utf-8')),
        };
      }

      // Load locks
      const locksPath = path.join(this.dataPath, 'locks.json');
      if (fs.existsSync(locksPath)) {
        const data = JSON.parse(fs.readFileSync(locksPath, 'utf-8'));
        for (const lock of data.locks || []) {
          this.locks.set(lock.id, lock);
        }
      }

      // Start fresh context each session
      this.context = this.defaultContext();
      
      log.info(`[SecurityContinuum] Loaded security policy and ${this.locks.size} locks`);
    } catch (error) {
      log.error('[SecurityContinuum] Failed to load data:', error);
    }
  }

  private saveData(): void {
    try {
      // Save policy
      const policyPath = path.join(this.dataPath, 'policy.json');
      fs.writeFileSync(policyPath, JSON.stringify(this.policy, null, 2));

      // Save locks
      const locksPath = path.join(this.dataPath, 'locks.json');
      fs.writeFileSync(locksPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        locks: Array.from(this.locks.values()),
      }, null, 2));

      // Save events (recent only)
      const eventsPath = path.join(this.dataPath, 'events.json');
      fs.writeFileSync(eventsPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        events: this.events.slice(-this.MAX_EVENTS),
      }, null, 2));
    } catch (error) {
      log.error('[SecurityContinuum] Failed to save data:', error);
    }
  }

  private startMonitoring(): void {
    // Check trust timeouts
    this.trustCheckInterval = setInterval(() => {
      this.checkTrustTimeouts();
    }, this.CHECK_INTERVAL_MS);

    // Check idle
    this.idleCheckInterval = setInterval(() => {
      if (this.policy.autoLockOnIdle) {
        this.checkIdleTimeout();
      }
    }, this.CHECK_INTERVAL_MS);
  }

  private checkTrustTimeouts(): void {
    const now = Date.now();
    const currentTimeout = this.context.timeoutAt[this.context.currentTrustLevel];
    
    if (currentTimeout && now > currentTimeout) {
      this.lowerTrust('Trust level timed out');
    }
  }

  private checkIdleTimeout(): void {
    const now = Date.now();
    const idleDuration = now - this.lastActivity;
    
    if (idleDuration > this.policy.idleTimeoutMs) {
      if (this.context.currentTrustLevel !== 'public') {
        this.setTrustLevel('public', 'Idle timeout');
        this.recordEvent('trust-lowered', 'Trust lowered due to inactivity');
      }
    }
  }

  /**
   * Record user activity (call this from input handlers)
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
  }

  // -------------------------------------------------------------------------
  // TRUST LEVEL MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Get current trust level
   */
  getCurrentTrustLevel(): TrustLevel {
    return this.context.currentTrustLevel;
  }

  /**
   * Get security context
   */
  getSecurityContext(): SecurityContext {
    return { ...this.context };
  }

  /**
   * Check if current trust level meets requirement
   */
  meetsTrustRequirement(required: TrustLevel): boolean {
    const levels: TrustLevel[] = ['public', 'basic', 'standard', 'elevated', 'maximum'];
    const currentIndex = levels.indexOf(this.context.currentTrustLevel);
    const requiredIndex = levels.indexOf(required);
    return currentIndex >= requiredIndex;
  }

  /**
   * Attempt to elevate trust level
   */
  async elevateTrust(params: {
    targetLevel: TrustLevel;
    method: AuthMethod;
    credential?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { targetLevel, method, credential } = params;

    // Check for lockout
    if (this.isLockedOut()) {
      return { success: false, error: 'Too many failed attempts. Please wait.' };
    }

    // Verify the authentication method
    const authResult = await this.verifyAuthentication(method, credential);
    
    if (!authResult.success) {
      this.recordFailedAttempt(method, authResult.error || 'Verification failed');
      return { success: false, error: authResult.error };
    }

    // Update context
    if (!this.context.authenticatedMethods.includes(method)) {
      this.context.authenticatedMethods.push(method);
    }

    // Set the new trust level
    this.setTrustLevel(targetLevel, `Authenticated via ${method}`);
    this.context.lastAuthentication = Date.now();

    this.recordEvent('trust-elevated', `Trust elevated to ${targetLevel} via ${method}`);
    this.emit('trust-elevated', { level: targetLevel, method });

    return { success: true };
  }

  private async verifyAuthentication(
    method: AuthMethod, 
    credential?: string
  ): Promise<{ success: boolean; error?: string }> {
    switch (method) {
      case 'password':
        return this.verifyPassword(credential);
      case 'pin':
        return this.verifyPIN(credential);
      case 'biometric':
        return this.verifyBiometric();
      case '2fa-totp':
        return this.verify2FA(credential);
      default:
        return { success: false, error: `Unknown method: ${method}` };
    }
  }

  private async verifyPassword(password?: string): Promise<{ success: boolean; error?: string }> {
    if (!password) {
      return { success: false, error: 'Password required' };
    }

    try {
      // Load stored password hash
      const hashPath = path.join(this.dataPath, 'auth.enc');
      if (!fs.existsSync(hashPath)) {
        return { success: false, error: 'No password configured' };
      }

      const stored = safeStorage.decryptString(fs.readFileSync(hashPath));
      const storedData = JSON.parse(stored);
      
      // Verify
      const hash = crypto.scryptSync(password, storedData.salt, 64).toString('hex');
      if (hash === storedData.hash) {
        return { success: true };
      }
      return { success: false, error: 'Invalid password' };
    } catch (error) {
      return { success: false, error: 'Password verification failed' };
    }
  }

  private async verifyPIN(pin?: string): Promise<{ success: boolean; error?: string }> {
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return { success: false, error: 'Invalid PIN format' };
    }

    try {
      const pinPath = path.join(this.dataPath, 'pin.enc');
      if (!fs.existsSync(pinPath)) {
        return { success: false, error: 'No PIN configured' };
      }

      const stored = safeStorage.decryptString(fs.readFileSync(pinPath));
      if (pin === stored) {
        return { success: true };
      }
      return { success: false, error: 'Invalid PIN' };
    } catch (error) {
      return { success: false, error: 'PIN verification failed' };
    }
  }

  private async verifyBiometric(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if biometrics available
      const canPrompt = systemPreferences.canPromptTouchID?.();
      if (!canPrompt) {
        return { success: false, error: 'Biometric authentication not available' };
      }

      // Prompt for biometric
      await (systemPreferences as any).promptTouchID?.('Authenticate to Dex');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Biometric verification failed' };
    }
  }

  private async verify2FA(code?: string): Promise<{ success: boolean; error?: string }> {
    if (!code || !/^\d{6}$/.test(code)) {
      return { success: false, error: 'Invalid 2FA code format' };
    }

    try {
      // Load 2FA secret
      const secretPath = path.join(this.dataPath, '2fa.enc');
      if (!fs.existsSync(secretPath)) {
        return { success: false, error: 'No 2FA configured' };
      }

      const secret = safeStorage.decryptString(fs.readFileSync(secretPath));
      
      // Verify TOTP (simplified - in production use a proper TOTP library)
      const expected = this.generateTOTP(secret);
      if (code === expected) {
        return { success: true };
      }
      return { success: false, error: 'Invalid 2FA code' };
    } catch (error) {
      return { success: false, error: '2FA verification failed' };
    }
  }

  private generateTOTP(secret: string): string {
    // Simplified TOTP - in production use a proper library
    const time = Math.floor(Date.now() / 30000);
    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(Buffer.from(time.toString()));
    const hash = hmac.digest('hex');
    const offset = parseInt(hash.slice(-1), 16);
    const otp = (parseInt(hash.slice(offset * 2, offset * 2 + 8), 16) & 0x7fffffff) % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Lower trust level
   */
  lowerTrust(reason?: string): void {
    const levels: TrustLevel[] = ['public', 'basic', 'standard', 'elevated', 'maximum'];
    const currentIndex = levels.indexOf(this.context.currentTrustLevel);
    
    if (currentIndex > 0) {
      const newLevel = levels[currentIndex - 1];
      this.setTrustLevel(newLevel, reason || 'Trust lowered');
      this.recordEvent('trust-lowered', `Trust lowered to ${newLevel}: ${reason}`);
      this.emit('trust-lowered', { level: newLevel, reason });
    }
  }

  /**
   * Lock to public (full de-authentication)
   */
  lockToPublic(reason?: string): void {
    this.context.authenticatedMethods = [];
    this.setTrustLevel('public', reason || 'Locked');
    this.recordEvent('trust-lowered', `Locked to public: ${reason}`);
    this.emit('locked', { reason });
  }

  private setTrustLevel(level: TrustLevel, reason: string): void {
    this.context.currentTrustLevel = level;
    this.context.timeoutAt[level] = Date.now() + this.policy.trustTimeouts[level];
    
    log.info(`[SecurityContinuum] Trust level set to ${level}: ${reason}`);
  }

  // -------------------------------------------------------------------------
  // LOCKS
  // -------------------------------------------------------------------------

  /**
   * Add a security lock
   */
  addLock(params: {
    type: SecurityLock['type'];
    targetId: string;
    targetName: string;
    requiredTrustLevel: TrustLevel;
    reason?: string;
    autoUnlockAfterMs?: number;
  }): SecurityLock {
    const lock: SecurityLock = {
      id: crypto.randomUUID(),
      type: params.type,
      targetId: params.targetId,
      targetName: params.targetName,
      requiredTrustLevel: params.requiredTrustLevel,
      lockedAt: Date.now(),
      lockedReason: params.reason,
      autoUnlockAt: params.autoUnlockAfterMs 
        ? Date.now() + params.autoUnlockAfterMs 
        : undefined,
    };

    this.locks.set(lock.id, lock);
    this.context.activeLocks.push(lock);
    this.saveData();

    this.recordEvent('lock-added', `Lock added: ${params.targetName}`);
    this.emit('lock-added', lock);

    return lock;
  }

  /**
   * Remove a lock (if trust level sufficient)
   */
  removeLock(lockId: string): { success: boolean; error?: string } {
    const lock = this.locks.get(lockId);
    if (!lock) {
      return { success: false, error: 'Lock not found' };
    }

    if (!this.meetsTrustRequirement(lock.requiredTrustLevel)) {
      return { 
        success: false, 
        error: `Requires ${lock.requiredTrustLevel} trust level` 
      };
    }

    this.locks.delete(lockId);
    this.context.activeLocks = this.context.activeLocks.filter(l => l.id !== lockId);
    this.saveData();

    this.recordEvent('lock-removed', `Lock removed: ${lock.targetName}`);
    this.emit('lock-removed', lockId);

    return { success: true };
  }

  /**
   * Check if a resource is locked
   */
  isLocked(targetId: string): SecurityLock | null {
    const lock = Array.from(this.locks.values()).find(l => l.targetId === targetId);
    
    if (lock) {
      // Check auto-unlock
      if (lock.autoUnlockAt && Date.now() > lock.autoUnlockAt) {
        this.locks.delete(lock.id);
        this.context.activeLocks = this.context.activeLocks.filter(l => l.id !== lock.id);
        return null;
      }
      return lock;
    }
    return null;
  }

  /**
   * Check access to a resource
   */
  checkAccess(targetId: string): { 
    allowed: boolean; 
    lock?: SecurityLock;
    requiredLevel?: TrustLevel;
  } {
    const lock = this.isLocked(targetId);
    
    if (!lock) {
      return { allowed: true };
    }

    if (this.meetsTrustRequirement(lock.requiredTrustLevel)) {
      return { allowed: true, lock };
    }

    return { 
      allowed: false, 
      lock, 
      requiredLevel: lock.requiredTrustLevel 
    };
  }

  /**
   * Get all active locks
   */
  getActiveLocks(): SecurityLock[] {
    return Array.from(this.locks.values());
  }

  // -------------------------------------------------------------------------
  // LOCKOUT HANDLING
  // -------------------------------------------------------------------------

  private recordFailedAttempt(method: AuthMethod, reason: string): void {
    this.failedAttempts.push({
      method,
      timestamp: Date.now(),
      success: false,
      failureReason: reason,
    });

    // Keep only recent attempts
    const cutoff = Date.now() - this.policy.lockoutDurationMs;
    this.failedAttempts = this.failedAttempts.filter(a => a.timestamp > cutoff);

    this.recordEvent('auth-failure', `Authentication failed: ${reason}`);
    this.emit('auth-failure', { method, reason });

    if (this.policy.notifyOnFailedAttempt) {
      this.emit('security-notification', {
        type: 'warning',
        title: 'Authentication Failed',
        message: reason,
      });
    }
  }

  private isLockedOut(): boolean {
    const cutoff = Date.now() - this.policy.lockoutDurationMs;
    const recentFailures = this.failedAttempts.filter(a => a.timestamp > cutoff);
    return recentFailures.length >= this.policy.maxFailedAttempts;
  }

  getLockoutStatus(): { 
    isLockedOut: boolean; 
    attemptsRemaining: number;
    lockoutEndsAt?: number;
  } {
    const cutoff = Date.now() - this.policy.lockoutDurationMs;
    const recentFailures = this.failedAttempts.filter(a => a.timestamp > cutoff);
    
    const isLockedOut = recentFailures.length >= this.policy.maxFailedAttempts;
    const attemptsRemaining = Math.max(0, this.policy.maxFailedAttempts - recentFailures.length);
    
    let lockoutEndsAt: number | undefined;
    if (isLockedOut && recentFailures.length > 0) {
      lockoutEndsAt = recentFailures[0].timestamp + this.policy.lockoutDurationMs;
    }

    return { isLockedOut, attemptsRemaining, lockoutEndsAt };
  }

  // -------------------------------------------------------------------------
  // INTENT INTEGRATION
  // -------------------------------------------------------------------------

  /**
   * Handle intent switch (auto-lock sensitive data)
   */
  handleIntentSwitch(fromIntentId: string, toIntentId: string): void {
    if (!this.policy.autoLockOnIntentSwitch) return;

    // Lock all resources associated with the previous intent
    const intentLocks = Array.from(this.locks.values())
      .filter(l => l.type === 'intent' && l.targetId === fromIntentId);

    // Re-lock any sensitive resources
    for (const lock of intentLocks) {
      // Reset the lock timeout
      lock.lockedAt = Date.now();
    }

    // Lower trust if elevated
    if (this.context.currentTrustLevel !== 'public' && 
        this.context.currentTrustLevel !== 'basic') {
      this.lowerTrust('Intent switch');
    }

    this.emit('intent-switch-security', { fromIntentId, toIntentId });
    log.info(`[SecurityContinuum] Security adjusted for intent switch`);
  }

  // -------------------------------------------------------------------------
  // POLICY MANAGEMENT
  // -------------------------------------------------------------------------

  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<SecurityPolicy>): SecurityPolicy {
    this.policy = { ...this.policy, ...updates };
    this.saveData();
    
    this.recordEvent('policy-changed', 'Security policy updated');
    this.emit('policy-updated', this.policy);
    
    return this.policy;
  }

  // -------------------------------------------------------------------------
  // EVENT LOGGING
  // -------------------------------------------------------------------------

  private recordEvent(type: SecurityEvent['type'], description: string, metadata?: any): void {
    const event: SecurityEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      description,
      metadata,
    };

    this.events.push(event);
    
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }
  }

  getSecurityEvents(limit: number = 50): SecurityEvent[] {
    return this.events.slice(-limit).reverse();
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Trust level
    ipcMain.handle('security:getTrustLevel', () => this.getCurrentTrustLevel());
    ipcMain.handle('security:getContext', () => this.getSecurityContext());
    ipcMain.handle('security:meetsTrustRequirement', (_, level) => this.meetsTrustRequirement(level));
    
    // Authentication
    ipcMain.handle('security:elevateTrust', async (_, params) => this.elevateTrust(params));
    ipcMain.handle('security:lowerTrust', (_, reason) => {
      this.lowerTrust(reason);
      return true;
    });
    ipcMain.handle('security:lockToPublic', (_, reason) => {
      this.lockToPublic(reason);
      return true;
    });
    
    // Activity tracking
    ipcMain.handle('security:recordActivity', () => {
      this.recordActivity();
      return true;
    });
    
    // Locks
    ipcMain.handle('security:addLock', (_, params) => this.addLock(params));
    ipcMain.handle('security:removeLock', (_, lockId) => this.removeLock(lockId));
    ipcMain.handle('security:checkAccess', (_, targetId) => this.checkAccess(targetId));
    ipcMain.handle('security:getActiveLocks', () => this.getActiveLocks());
    
    // Lockout
    ipcMain.handle('security:getLockoutStatus', () => this.getLockoutStatus());
    
    // Intent integration
    ipcMain.handle('security:handleIntentSwitch', (_, from, to) => {
      this.handleIntentSwitch(from, to);
      return true;
    });
    
    // Policy
    ipcMain.handle('security:getPolicy', () => this.getPolicy());
    ipcMain.handle('security:updatePolicy', (_, updates) => this.updatePolicy(updates));
    
    // Events
    ipcMain.handle('security:getEvents', (_, limit) => this.getSecurityEvents(limit));
  }
}

// Singleton instance
export const securityContinuumManager = new SecurityContinuumManagerClass();

export async function initializeSecurityContinuum(): Promise<void> {
  return securityContinuumManager.initialize();
}

export function shutdownSecurityContinuum(): void {
  securityContinuumManager.shutdown();
}
