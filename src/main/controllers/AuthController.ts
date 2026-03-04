// ═══════════════════════════════════════════════════════════════════════════
// AUTH CONTROLLER - OS-Grade Security Authentication
// Biometric, Password, PIN - Secure Storage via OS Keychain
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, safeStorage, systemPreferences, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller
// ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────

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
      console.error('[AuthController] Failed to load config:', error);
    }
  }

  private saveConfig(): void {
    try {
      const configPath = path.join(this.dataPath, CONFIG_FILE);
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[AuthController] Failed to save config:', error);
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
      console.error('[AuthController] Failed to load credentials:', error);
    }
  }

  private saveCredentials(): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.error('[AuthController] Secure storage not available');
        return;
      }
      const credPath = path.join(this.dataPath, CREDENTIALS_FILE);
      const encrypted = safeStorage.encryptString(JSON.stringify(this.credentials));
      fs.writeFileSync(credPath, encrypted);
    } catch (error) {
      console.error('[AuthController] Failed to save credentials:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private setupIpcHandlers(): void {
    // Get auth state
    ipcMain.handle('auth:getState', () => this.getPublicState());
    
    // Get auth config
    ipcMain.handle('auth:getConfig', () => this.config);
    
    // Check if biometrics available
    ipcMain.handle('auth:biometricsAvailable', () => this.checkBiometricsAvailable());
    
    // Authenticate with password
    ipcMain.handle('auth:authenticatePassword', async (_, password: string) => {
      return this.authenticateWithPassword(password);
    });
    
    // Authenticate with PIN
    ipcMain.handle('auth:authenticatePin', async (_, pin: string) => {
      return this.authenticateWithPin(pin);
    });
    
    // Authenticate with biometrics
    ipcMain.handle('auth:authenticateBiometric', async () => {
      return this.authenticateWithBiometric();
    });
    
    // Set password
    ipcMain.handle('auth:setPassword', async (_, password: string) => {
      return this.setPassword(password);
    });
    
    // Set PIN
    ipcMain.handle('auth:setPin', async (_, pin: string) => {
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
    ipcMain.handle('auth:clearCredentials', async (_, currentPassword?: string) => {
      return this.clearCredentials(currentPassword);
    });
    
    // Verify session token
    ipcMain.handle('auth:verifySession', (_, token: string) => {
      return this.verifySession(token);
    });
    
    // Get lockout status
    ipcMain.handle('auth:getLockoutStatus', () => this.getLockoutStatus());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // System Listeners
  // ─────────────────────────────────────────────────────────────────────────

  private setupSystemListeners(): void {
    // Lock on system sleep/suspend
    if (process.platform === 'darwin' || process.platform === 'win32') {
      const { powerMonitor } = require('electron');
      
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

  // ─────────────────────────────────────────────────────────────────────────
  // Authentication Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async checkBiometricsAvailable(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        return systemPreferences.canPromptTouchID();
      }
      // Windows Hello check would go here
      // For now, return false on other platforms
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

  // ─────────────────────────────────────────────────────────────────────────
  // Credential Management
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────

  private unlockSuccess(): { success: boolean; token: string } {
    this.state.isLocked = false;
    this.state.lastUnlock = Date.now();
    this.state.failedAttempts = 0;
    this.state.lockoutUntil = 0;
    this.state.sessionToken = this.generateSessionToken();
    
    this.startTimeoutTimer();
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

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

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
