// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// AUTH CONTROLLER - OS-Grade Security Authentication
// Biometric, Password, PIN - Secure Storage via OS Keychain
// ===========================================================================

import log from 'electron-log';
import { ipcMain, safeStorage, systemPreferences, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { IPCCrypto } from '../security/IPCCrypto';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AuthConfig {
  enabled: boolean;
  method: 'none' | 'biometric' | 'password' | 'pin' | 'biometric+password' | 'biometric+pin';
  pinLength: 4 | 6;
  lockOnSleep: boolean;
  lockOnMinimize: boolean;
  timeoutMinutes: number; // 0 = never
  requireOnLaunch: boolean;
  requireOnResume: boolean;
  maxAttempts: number;
  lockoutMinutes: number;
}

interface AuthState {
  isLocked: boolean;
  lastUnlock: number;
  failedAttempts: number;
  lockoutUntil: number;
  sessionToken: string | null;
}

interface StoredCredentials {
  passwordHash: string | null;
  passwordSalt: string | null;
  pinHash: string | null;
  pinSalt: string | null;
  biometricEnabled: boolean;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_CONFIG: AuthConfig = {
  enabled: false,
  method: 'none',
  pinLength: 4,
  lockOnSleep: true,
  lockOnMinimize: false,
  timeoutMinutes: 5,
  requireOnLaunch: true,
  requireOnResume: true,
  maxAttempts: 5,
  lockoutMinutes: 5,
};

const CONFIG_FILE = 'auth-config.json';
const CREDENTIALS_FILE = 'auth-credentials.enc';
const SESSION_TOKEN_LENGTH = 32;
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

// -----------------------------------------------------------------------------
// Auth Controller
// -----------------------------------------------------------------------------

export class AuthController {
  private config: AuthConfig = { ...DEFAULT_CONFIG };
  private state: AuthState = {
    isLocked: true,
    lastUnlock: 0,
    failedAttempts: 0,
    lockoutUntil: 0,
    sessionToken: null,
  };
  private credentials: StoredCredentials = {
    passwordHash: null,
    passwordSalt: null,
    pinHash: null,
    pinSalt: null,
    biometricEnabled: false,
  };
  private dataPath: string;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'security');
    this.ensureDataDirectory();
    this.loadConfig();
    this.loadCredentials();
    this.setupIpcHandlers();
    this.setupSystemListeners();
    
    // If auth not enabled, unlock immediately
    if (!this.config.enabled) {
      this.state.isLocked = false;
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private loadConfig(): void {
    try {
      const configPath = path.join(this.dataPath, CONFIG_FILE);
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      log.error('[AuthController] Failed to load config:', error);
    }
  }

  private saveConfig(): void {
    try {
      const configPath = path.join(this.dataPath, CONFIG_FILE);
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[AuthController] Failed to save config:', error);
    }
  }

  private loadCredentials(): void {
    try {
      const credPath = path.join(this.dataPath, CREDENTIALS_FILE);
      if (fs.existsSync(credPath) && safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(credPath);
        const decrypted = safeStorage.decryptString(encrypted);
        this.credentials = JSON.parse(decrypted);
      }
    } catch (error) {
      log.error('[AuthController] Failed to load credentials:', error);
    }
  }

  private saveCredentials(): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        log.error('[AuthController] Secure storage not available');
        return;
      }
      const credPath = path.join(this.dataPath, CREDENTIALS_FILE);
      const encrypted = safeStorage.encryptString(JSON.stringify(this.credentials));
      fs.writeFileSync(credPath, encrypted);
    } catch (error) {
      log.error('[AuthController] Failed to save credentials:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  private setupIpcHandlers(): void {
    // Get auth state
    ipcMain.handle('auth:getState', () => this.getPublicState());
    
    // Get auth config
    ipcMain.handle('auth:getConfig', () => this.config);
    
    // Check if biometrics available
    ipcMain.handle('auth:biometricsAvailable', () => this.checkBiometricsAvailable());
    
    // Authenticate with password
    ipcMain.handle('auth:authenticatePassword', async (_, sealed: any) => {
      const password = IPCCrypto.open(sealed);
      return this.authenticateWithPassword(password);
    });
    
    // Authenticate with PIN
    ipcMain.handle('auth:authenticatePin', async (_, sealed: any) => {
      const pin = IPCCrypto.open(sealed);
      return this.authenticateWithPin(pin);
    });
    
    // Authenticate with biometrics
    ipcMain.handle('auth:authenticateBiometric', async () => {
      return this.authenticateWithBiometric();
    });
    
    // Set password
    ipcMain.handle('auth:setPassword', async (_, sealed: any) => {
      const password = IPCCrypto.open(sealed);
      return this.setPassword(password);
    });
    
    // Set PIN
    ipcMain.handle('auth:setPin', async (_, sealed: any) => {
      const pin = IPCCrypto.open(sealed);
      return this.setPin(pin);
    });
    
    // Enable biometrics
    ipcMain.handle('auth:enableBiometric', async () => {
      return this.enableBiometric();
    });
    
    // Update config
    ipcMain.handle('auth:updateConfig', async (_, updates: Partial<AuthConfig>) => {
      return this.updateConfig(updates);
    });
    
    // Lock app
    ipcMain.handle('auth:lock', () => this.lock());
    
    // Clear credentials (requires re-auth)
    ipcMain.handle('auth:clearCredentials', async (_, sealed?: any) => {
      const currentPassword = sealed ? IPCCrypto.open(sealed) : undefined;
      return this.clearCredentials(currentPassword);
    });
    
    // Verify session token
    ipcMain.handle('auth:verifySession', (_, sealed: any) => {
      const token = IPCCrypto.open(sealed);
      return this.verifySession(token);
    });
    
    // Get lockout status
    ipcMain.handle('auth:getLockoutStatus', () => this.getLockoutStatus());

    // Change password (requires current password)
    ipcMain.handle('auth:changePassword', async (_, sealed: any) => {
      const json = IPCCrypto.open(sealed);
      const { currentPassword, newPassword } = JSON.parse(json) as { currentPassword: string; newPassword: string };
      return this.changePassword(currentPassword, newPassword);
    });

    // Change PIN (requires current PIN)
    ipcMain.handle('auth:changePin', async (_, sealed: any) => {
      const json = IPCCrypto.open(sealed);
      const { currentPin, newPin } = JSON.parse(json) as { currentPin: string; newPin: string };
      return this.changePin(currentPin, newPin);
    });

    // Generate recovery codes
    ipcMain.handle('auth:generateRecoveryCodes', async () => {
      return this.generateRecoveryCodes();
    });

    // Authenticate with recovery code
    ipcMain.handle('auth:authenticateRecovery', async (_, sealed: any) => {
      const code = IPCCrypto.open(sealed);
      return this.authenticateWithRecoveryCode(code);
    });

    // Get idle warning status
    ipcMain.handle('auth:getIdleWarning', () => this.getIdleWarningStatus());
  }

  // -------------------------------------------------------------------------
  // System Listeners
  // -------------------------------------------------------------------------

  private setupSystemListeners(): void {
    // Lock on system sleep/suspend
    if (process.platform === 'darwin' || process.platform === 'win32') {
      // powerMonitor is only usable once the Electron app is ready; guard so the
      // singleton can be constructed in non-Electron contexts (tests, tooling).
      const { powerMonitor } = require('electron');
      if (!powerMonitor || typeof powerMonitor.on !== 'function') return;

      powerMonitor.on('suspend', () => {
        if (this.config.enabled && this.config.lockOnSleep) {
          this.lock();
        }
      });

      powerMonitor.on('lock-screen', () => {
        if (this.config.enabled && this.config.lockOnSleep) {
          this.lock();
        }
      });
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    
    // Lock on minimize if configured
    window.on('minimize', () => {
      if (this.config.enabled && this.config.lockOnMinimize) {
        this.lock();
      }
    });
    
    // Lock on hide
    window.on('hide', () => {
      if (this.config.enabled && this.config.lockOnMinimize) {
        this.lock();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Authentication Methods
  // -------------------------------------------------------------------------

  private async checkBiometricsAvailable(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        return systemPreferences.canPromptTouchID();
      }
      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          const result = execSync(
            'powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "[bool](Get-WmiObject -Namespace root/CIMV2/Security/MicrosoftTpm -Class Win32_Tpm -ErrorAction SilentlyContinue) -or (dsregcmd /status 2>$null | Select-String NgcSet | Select-String YES)"',
            { encoding: 'utf8', timeout: 5000, windowsHide: true }
          ).trim();
          return result === 'True';
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async authenticateWithBiometric(): Promise<{ success: boolean; error?: string; token?: string }> {
    if (this.isLockedOut()) {
      return { success: false, error: 'Too many failed attempts. Please wait.' };
    }

    if (!this.credentials.biometricEnabled) {
      return { success: false, error: 'Biometric authentication not set up.' };
    }

    try {
      if (process.platform === 'darwin') {
        await systemPreferences.promptTouchID('authenticate to unlock DEX');
        return this.unlockSuccess();
      }
      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          execSync(
            'powershell -NoProfile -NoLogo -NonInteractive -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]; $r = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync(\"Unlock DEX\").GetAwaiter().GetResult(); if($r -ne [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified){exit 1}"',
            { encoding: 'utf8', timeout: 30000, windowsHide: true }
          );
          return this.unlockSuccess();
        } catch {
          this.recordFailedAttempt();
          return { success: false, error: 'Windows Hello authentication failed.' };
        }
      }
      return { success: false, error: 'Biometric authentication not supported on this platform.' };
    } catch (error: any) {
      this.recordFailedAttempt();
      return { success: false, error: 'Biometric authentication failed.' };
    }
  }

  private async authenticateWithPassword(password: string): Promise<{ success: boolean; error?: string; token?: string }> {
    if (this.isLockedOut()) {
      const status = this.getLockoutStatus();
      return { success: false, error: `Locked out. Try again in ${status.remainingMinutes} minutes.` };
    }

    if (!this.credentials.passwordHash || !this.credentials.passwordSalt) {
      return { success: false, error: 'Password not set up.' };
    }

    const hash = await this.hashPassword(password, this.credentials.passwordSalt);
    
    if (hash === this.credentials.passwordHash) {
      return this.unlockSuccess();
    }

    this.recordFailedAttempt();
    return { success: false, error: 'Incorrect password.' };
  }

  private async authenticateWithPin(pin: string): Promise<{ success: boolean; error?: string; token?: string }> {
    if (this.isLockedOut()) {
      const status = this.getLockoutStatus();
      return { success: false, error: `Locked out. Try again in ${status.remainingMinutes} minutes.` };
    }

    if (!this.credentials.pinHash || !this.credentials.pinSalt) {
      return { success: false, error: 'PIN not set up.' };
    }

    // Validate PIN format
    if (!/^\d{4,6}$/.test(pin)) {
      this.recordFailedAttempt();
      return { success: false, error: 'Invalid PIN format.' };
    }

    const hash = await this.hashPassword(pin, this.credentials.pinSalt);
    
    if (hash === this.credentials.pinHash) {
      return this.unlockSuccess();
    }

    this.recordFailedAttempt();
    return { success: false, error: 'Incorrect PIN.' };
  }

  // -------------------------------------------------------------------------
  // Credential Management
  // -------------------------------------------------------------------------

  private async setPassword(password: string): Promise<{ success: boolean; error?: string }> {
    // Validate password strength
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = await this.hashPassword(password, salt);
      
      this.credentials.passwordHash = hash;
      this.credentials.passwordSalt = salt;
      this.saveCredentials();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to set password.' };
    }
  }

  private async setPin(pin: string): Promise<{ success: boolean; error?: string }> {
    // Validate PIN
    if (!/^\d{4,6}$/.test(pin)) {
      return { success: false, error: 'PIN must be 4-6 digits.' };
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = await this.hashPassword(pin, salt);
      
      this.credentials.pinHash = hash;
      this.credentials.pinSalt = salt;
      this.config.pinLength = pin.length as 4 | 6;
      this.saveCredentials();
      this.saveConfig();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to set PIN.' };
    }
  }

  private async enableBiometric(): Promise<{ success: boolean; error?: string }> {
    try {
      const available = await this.checkBiometricsAvailable();
      if (!available) {
        return { success: false, error: 'Biometric authentication not available on this device.' };
      }

      // Verify biometrics work before enabling
      if (process.platform === 'darwin') {
        await systemPreferences.promptTouchID('enable biometric authentication for DEX');
      } else if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(
          'powershell -NoProfile -NoLogo -NonInteractive -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]; $r = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync(\"Enable biometric authentication for DEX\").GetAwaiter().GetResult(); if($r -ne [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified){exit 1}"',
          { encoding: 'utf8', timeout: 30000, windowsHide: true }
        );
      }

      this.credentials.biometricEnabled = true;
      this.saveCredentials();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to enable biometric authentication.' };
    }
  }

  private async clearCredentials(currentPassword?: string): Promise<{ success: boolean; error?: string }> {
    // If password is set, require it to clear
    if (this.credentials.passwordHash && currentPassword) {
      const authResult = await this.authenticateWithPassword(currentPassword);
      if (!authResult.success) {
        return { success: false, error: 'Current password is incorrect.' };
      }
    }

    this.credentials = {
      passwordHash: null,
      passwordSalt: null,
      pinHash: null,
      pinSalt: null,
      biometricEnabled: false,
    };
    this.config.enabled = false;
    this.config.method = 'none';
    this.state.isLocked = false;
    
    this.saveCredentials();
    this.saveConfig();
    this.notifyStateChange();
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Password/PIN Change with Verification
  // -------------------------------------------------------------------------

  private async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!this.credentials.passwordHash || !this.credentials.passwordSalt) {
      return { success: false, error: 'No password is currently set.' };
    }

    // Verify current password
    const currentHash = await this.hashPassword(currentPassword, this.credentials.passwordSalt);
    if (currentHash !== this.credentials.passwordHash) {
      this.recordFailedAttempt();
      return { success: false, error: 'Current password is incorrect.' };
    }

    // Validate new password
    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters.' };
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = await this.hashPassword(newPassword, salt);
      this.credentials.passwordHash = hash;
      this.credentials.passwordSalt = salt;
      this.saveCredentials();
      this.notifyStateChange();
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to change password.' };
    }
  }

  private async changePin(currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    if (!this.credentials.pinHash || !this.credentials.pinSalt) {
      return { success: false, error: 'No PIN is currently set.' };
    }

    // Verify current PIN
    const currentHash = await this.hashPassword(currentPin, this.credentials.pinSalt);
    if (currentHash !== this.credentials.pinHash) {
      this.recordFailedAttempt();
      return { success: false, error: 'Current PIN is incorrect.' };
    }

    // Validate new PIN
    if (!/^\d{4,8}$/.test(newPin)) {
      return { success: false, error: 'PIN must be 4-8 digits.' };
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = await this.hashPassword(newPin, salt);
      this.credentials.pinHash = hash;
      this.credentials.pinSalt = salt;
      this.config.pinLength = newPin.length as 4 | 6;
      this.saveCredentials();
      this.saveConfig();
      this.notifyStateChange();
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to change PIN.' };
    }
  }

  // -------------------------------------------------------------------------
  // Recovery Codes
  // -------------------------------------------------------------------------

  private recoveryCodes: string[] = [];
  private recoveryCodesUsed: Set<string> = new Set();

  private generateRecoveryCodes(): { success: boolean; codes?: string[] } {
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    this.recoveryCodes = codes;
    this.recoveryCodesUsed.clear();

    // Store hashes of recovery codes securely
    try {
      const hashes = codes.map(c => crypto.createHash('sha256').update(c).digest('hex'));
      const recoveryPath = path.join(this.dataPath, 'recovery-codes.enc');
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(hashes));
        fs.writeFileSync(recoveryPath, encrypted);
      }
    } catch (error) {
      log.error('[AuthController] Failed to save recovery codes:', error);
    }

    return { success: true, codes };
  }

  private async authenticateWithRecoveryCode(code: string): Promise<{ success: boolean; error?: string; token?: string }> {
    if (this.isLockedOut()) {
      return { success: false, error: 'Too many failed attempts. Please wait.' };
    }

    try {
      const recoveryPath = path.join(this.dataPath, 'recovery-codes.enc');
      if (!fs.existsSync(recoveryPath) || !safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'No recovery codes found.' };
      }

      const encrypted = fs.readFileSync(recoveryPath);
      const hashes: string[] = JSON.parse(safeStorage.decryptString(encrypted));
      const codeHash = crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');

      const idx = hashes.indexOf(codeHash);
      if (idx === -1) {
        this.recordFailedAttempt();
        return { success: false, error: 'Invalid recovery code.' };
      }

      // Mark code as used (remove from valid set)
      hashes.splice(idx, 1);
      const updatedEncrypted = safeStorage.encryptString(JSON.stringify(hashes));
      fs.writeFileSync(recoveryPath, updatedEncrypted);

      return this.unlockSuccess();
    } catch {
      return { success: false, error: 'Recovery authentication failed.' };
    }
  }

  // -------------------------------------------------------------------------
  // Idle Warning
  // -------------------------------------------------------------------------

  private idleWarningEmitted = false;

  private getIdleWarningStatus(): { warningActive: boolean; secondsUntilLock: number } {
    if (!this.config.enabled || this.state.isLocked || this.config.timeoutMinutes <= 0) {
      return { warningActive: false, secondsUntilLock: 0 };
    }
    const elapsed = Date.now() - this.state.lastUnlock;
    const timeoutMs = this.config.timeoutMinutes * 60 * 1000;
    const warningThresholdMs = timeoutMs - 60000; // Warn 60s before lock
    const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));

    if (elapsed >= warningThresholdMs && elapsed < timeoutMs) {
      return { warningActive: true, secondsUntilLock: remaining };
    }
    return { warningActive: false, secondsUntilLock: remaining };
  }

  // Override startTimeoutTimer to emit idle warning
  private startTimeoutTimerWithWarning(): void {
    this.clearTimeoutTimer();
    this.idleWarningEmitted = false;

    if (this.config.timeoutMinutes > 0) {
      const warningMs = Math.max(0, (this.config.timeoutMinutes * 60 * 1000) - 60000);

      // Emit warning 60s before lock
      if (warningMs > 0) {
        setTimeout(() => {
          if (!this.state.isLocked && this.config.enabled && !this.idleWarningEmitted) {
            this.idleWarningEmitted = true;
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('auth:idleWarning', {
                secondsUntilLock: 60,
              });
            }
          }
        }, warningMs);
      }

      this.timeoutTimer = setTimeout(() => {
        if (this.config.enabled) {
          this.lock();
        }
      }, this.config.timeoutMinutes * 60 * 1000);
    }
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  private unlockSuccess(): { success: boolean; token: string } {
    this.state.isLocked = false;
    this.state.lastUnlock = Date.now();
    this.state.failedAttempts = 0;
    this.state.lockoutUntil = 0;
    this.state.sessionToken = this.generateSessionToken();
    
    this.startTimeoutTimerWithWarning();
    this.notifyStateChange();
    
    return { success: true, token: this.state.sessionToken };
  }

  private lock(): void {
    this.state.isLocked = true;
    this.state.sessionToken = null;
    this.clearTimeoutTimer();
    this.notifyStateChange();
  }

  private isLockedOut(): boolean {
    if (this.state.lockoutUntil === 0) return false;
    if (Date.now() >= this.state.lockoutUntil) {
      this.state.lockoutUntil = 0;
      this.state.failedAttempts = 0;
      return false;
    }
    return true;
  }

  private recordFailedAttempt(): void {
    this.state.failedAttempts++;
    
    if (this.state.failedAttempts >= this.config.maxAttempts) {
      this.state.lockoutUntil = Date.now() + (this.config.lockoutMinutes * 60 * 1000);
      this.notifyStateChange();
    }
  }

  private getLockoutStatus(): { isLockedOut: boolean; remainingMinutes: number; attemptsRemaining: number } {
    const isLockedOut = this.isLockedOut();
    const remainingMinutes = isLockedOut 
      ? Math.ceil((this.state.lockoutUntil - Date.now()) / 60000) 
      : 0;
    const attemptsRemaining = Math.max(0, this.config.maxAttempts - this.state.failedAttempts);
    
    return { isLockedOut, remainingMinutes, attemptsRemaining };
  }

  private startTimeoutTimer(): void {
    this.clearTimeoutTimer();
    
    if (this.config.timeoutMinutes > 0) {
      this.timeoutTimer = setTimeout(() => {
        if (this.config.enabled) {
          this.lock();
        }
      }, this.config.timeoutMinutes * 60 * 1000);
    }
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  resetActivityTimer(): void {
    if (!this.state.isLocked && this.config.enabled) {
      this.startTimeoutTimer();
    }
  }

  private updateConfig(updates: Partial<AuthConfig>): { success: boolean } {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    
    // If enabling auth, lock immediately if not already
    if (updates.enabled === true && !this.state.isLocked) {
      // Don't lock immediately, let them set up credentials first
    }
    
    // If disabling auth, unlock
    if (updates.enabled === false) {
      this.state.isLocked = false;
      this.notifyStateChange();
    }
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
  }

  private verifySession(token: string): boolean {
    return this.state.sessionToken === token && !this.state.isLocked;
  }

  private getPublicState(): {
    isLocked: boolean;
    isEnabled: boolean;
    method: string;
    hasPassword: boolean;
    hasPin: boolean;
    hasBiometric: boolean;
    lockoutStatus: {
      isLockedOut: boolean;
      remainingMinutes: number;
      attemptsRemaining: number;
    };
  } {
    return {
      isLocked: this.state.isLocked,
      isEnabled: this.config.enabled,
      method: this.config.method,
      hasPassword: !!this.credentials.passwordHash,
      hasPin: !!this.credentials.pinHash,
      hasBiometric: this.credentials.biometricEnabled,
      lockoutStatus: this.getLockoutStatus(),
    };
  }

  private notifyStateChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auth:stateChanged', this.getPublicState());
    }
  }

  // Public access for initial state check
  isAuthRequired(): boolean {
    return this.config.enabled && this.config.requireOnLaunch;
  }

  isLocked(): boolean {
    return this.state.isLocked;
  }
}

// Singleton instance
export const authController = new AuthController();

export function getAuthController(): AuthController {
  return authController;
}

export default AuthController;
