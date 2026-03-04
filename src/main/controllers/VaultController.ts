/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX - Secure Vault Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * OS-grade password manager and authenticator backend.
 * End-to-end encrypted, locally stored, zero cloud dependency.
 * 
 * Features:
 * - Password/credential storage with categories
 * - TOTP Authenticator (RFC 6238)
 * - Password generator
 * - Secure notes and attachments
 * - Clipboard auto-clear
 * - Audit for weak/reused passwords
 */

import { ipcMain, BrowserWindow, clipboard, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════════════════

export interface VaultCredential {
  id: string;
  type: 'website' | 'app' | 'custom' | 'note';
  title: string;
  username?: string;
  email?: string;
  password?: string;
  url?: string;
  notes?: string;
  category: VaultCategory;
  tags: string[];
  totpSecret?: string; // Linked 2FA
  attachments?: VaultAttachment[];
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
  passwordStrength?: 'weak' | 'medium' | 'strong';
  favorite: boolean;
}

export interface VaultAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  encryptedData: string;
}

export interface AuthenticatorEntry {
  id: string;
  service: string;
  account: string;
  secret: string;
  issuer?: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: number;
  category: VaultCategory;
  linkedCredentialId?: string;
  createdAt: number;
  icon?: string;
}

export type VaultCategory = 'work' | 'personal' | 'finance' | 'dev' | 'social' | 'custom';

interface VaultData {
  credentials: VaultCredential[];
  authenticators: AuthenticatorEntry[];
  categories: { id: string; name: string; icon?: string }[];
  settings: VaultSettings;
  version: number;
}

interface VaultSettings {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  passwordGeneratorLength: number;
  passwordGeneratorOptions: {
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
  showPasswordStrength: boolean;
  enableBrowserCapture: boolean;
}

interface VaultState {
  isUnlocked: boolean;
  lastActivity: number;
  clipboardTimer: NodeJS.Timeout | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const VAULT_FILE = 'dex-vault.enc';
const VAULT_VERSION = 1;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const DEFAULT_SETTINGS: VaultSettings = {
  autoLockMinutes: 15,
  clipboardClearSeconds: 30,
  passwordGeneratorLength: 20,
  passwordGeneratorOptions: {
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  },
  showPasswordStrength: true,
  enableBrowserCapture: true,
};

const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', icon: 'briefcase' },
  { id: 'personal', name: 'Personal', icon: 'user' },
  { id: 'finance', name: 'Finance', icon: 'dollar' },
  { id: 'dev', name: 'Development', icon: 'code' },
  { id: 'social', name: 'Social', icon: 'users' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Vault Controller Class
// ═══════════════════════════════════════════════════════════════════════════

export class VaultController {
  private mainWindow: BrowserWindow | null = null;
  private vaultPath: string;
  private masterKey: Buffer | null = null;
  private vaultData: VaultData | null = null;
  private state: VaultState = {
    isUnlocked: false,
    lastActivity: 0,
    clipboardTimer: null,
  };
  private autoLockTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.vaultPath = path.join(app.getPath('userData'), VAULT_FILE);
    this.registerIPCHandlers();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IPC Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  private registerIPCHandlers(): void {
    // Vault state
    ipcMain.handle('vault:getState', () => this.getPublicState());
    ipcMain.handle('vault:isUnlocked', () => this.state.isUnlocked);
    ipcMain.handle('vault:exists', () => this.vaultExists());

    // Vault operations
    ipcMain.handle('vault:create', (_, masterPassword: string) => this.createVault(masterPassword));
    ipcMain.handle('vault:unlock', (_, masterPassword: string) => this.unlockVault(masterPassword));
    ipcMain.handle('vault:lock', () => this.lockVault());
    ipcMain.handle('vault:changeMasterPassword', (_, current: string, newPass: string) => 
      this.changeMasterPassword(current, newPass));

    // Credentials
    ipcMain.handle('vault:getCredentials', () => this.getCredentials());
    ipcMain.handle('vault:getCredential', (_, id: string) => this.getCredential(id));
    ipcMain.handle('vault:addCredential', (_, credential: Partial<VaultCredential>) => 
      this.addCredential(credential));
    ipcMain.handle('vault:updateCredential', (_, id: string, updates: Partial<VaultCredential>) => 
      this.updateCredential(id, updates));
    ipcMain.handle('vault:deleteCredential', (_, id: string) => this.deleteCredential(id));
    ipcMain.handle('vault:searchCredentials', (_, query: string) => this.searchCredentials(query));

    // Authenticator
    ipcMain.handle('vault:getAuthenticators', () => this.getAuthenticators());
    ipcMain.handle('vault:addAuthenticator', (_, entry: Partial<AuthenticatorEntry>) => 
      this.addAuthenticator(entry));
    ipcMain.handle('vault:updateAuthenticator', (_, id: string, updates: Partial<AuthenticatorEntry>) => 
      this.updateAuthenticator(id, updates));
    ipcMain.handle('vault:deleteAuthenticator', (_, id: string) => this.deleteAuthenticator(id));
    ipcMain.handle('vault:generateTOTP', (_, id: string) => this.generateTOTP(id));
    ipcMain.handle('vault:parseOTPUri', (_, uri: string) => this.parseOTPUri(uri));

    // Password generator
    ipcMain.handle('vault:generatePassword', (_, options?: Partial<VaultSettings['passwordGeneratorOptions']>) => 
      this.generatePassword(options));

    // Clipboard
    ipcMain.handle('vault:copyToClipboard', (_, text: string, autoClear?: boolean) => 
      this.copyToClipboard(text, autoClear));

    // Audit
    ipcMain.handle('vault:auditPasswords', () => this.auditPasswords());

    // Settings
    ipcMain.handle('vault:getSettings', () => this.getSettings());
    ipcMain.handle('vault:updateSettings', (_, updates: Partial<VaultSettings>) => 
      this.updateSettings(updates));

    // Export/Import
    ipcMain.handle('vault:export', (_, password: string) => this.exportVault(password));
    ipcMain.handle('vault:import', (_, data: string, password: string) => this.importVault(data, password));

    // Categories
    ipcMain.handle('vault:getCategories', () => this.getCategories());
    ipcMain.handle('vault:addCategory', (_, category: { name: string; icon?: string }) => 
      this.addCategory(category));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Vault Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private vaultExists(): boolean {
    return fs.existsSync(this.vaultPath);
  }

  private async createVault(masterPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.vaultExists()) {
        return { success: false, error: 'Vault already exists' };
      }

      if (masterPassword.length < 8) {
        return { success: false, error: 'Master password must be at least 8 characters' };
      }

      // Derive key from master password
      const salt = crypto.randomBytes(SALT_LENGTH);
      this.masterKey = this.deriveKey(masterPassword, salt);

      // Initialize vault data
      this.vaultData = {
        credentials: [],
        authenticators: [],
        categories: DEFAULT_CATEGORIES,
        settings: DEFAULT_SETTINGS,
        version: VAULT_VERSION,
      };

      // Save encrypted vault
      await this.saveVault(salt);

      this.state.isUnlocked = true;
      this.state.lastActivity = Date.now();
      this.startAutoLockTimer();
      this.notifyStateChange();

      return { success: true };
    } catch (error) {
      console.error('[Vault] Create error:', error);
      return { success: false, error: String(error) };
    }
  }

  private async unlockVault(masterPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.vaultExists()) {
        return { success: false, error: 'Vault does not exist' };
      }

      // Read encrypted vault
      const encryptedData = fs.readFileSync(this.vaultPath);
      
      // Extract salt (first 32 bytes)
      const salt = encryptedData.subarray(0, SALT_LENGTH);
      const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      // Derive key
      this.masterKey = this.deriveKey(masterPassword, salt);

      // Decrypt
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted: string;
      try {
        decrypted = decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
      } catch {
        this.masterKey = null;
        return { success: false, error: 'Invalid master password' };
      }

      this.vaultData = JSON.parse(decrypted);
      this.state.isUnlocked = true;
      this.state.lastActivity = Date.now();
      this.startAutoLockTimer();
      this.notifyStateChange();

      return { success: true };
    } catch (error) {
      console.error('[Vault] Unlock error:', error);
      this.masterKey = null;
      return { success: false, error: 'Failed to unlock vault' };
    }
  }

  private lockVault(): void {
    this.vaultData = null;
    this.masterKey = null;
    this.state.isUnlocked = false;
    this.stopAutoLockTimer();
    this.clearClipboardTimer();
    this.notifyStateChange();
  }

  private async changeMasterPassword(
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.state.isUnlocked || !this.vaultData) {
        return { success: false, error: 'Vault is locked' };
      }

      if (newPassword.length < 8) {
        return { success: false, error: 'New password must be at least 8 characters' };
      }

      // Verify current password by re-unlocking
      const verifyResult = await this.unlockVault(currentPassword);
      if (!verifyResult.success) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Generate new salt and key
      const salt = crypto.randomBytes(SALT_LENGTH);
      this.masterKey = this.deriveKey(newPassword, salt);

      // Re-save with new encryption
      await this.saveVault(salt);

      return { success: true };
    } catch (error) {
      console.error('[Vault] Change password error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Encryption Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, KEY_DERIVATION_ITERATIONS, 32, 'sha512');
  }

  private async saveVault(salt?: Buffer): Promise<void> {
    if (!this.masterKey || !this.vaultData) {
      throw new Error('Vault not unlocked');
    }

    // If no salt provided, read existing salt from file
    if (!salt && this.vaultExists()) {
      const existingData = fs.readFileSync(this.vaultPath);
      salt = existingData.subarray(0, SALT_LENGTH);
    }

    if (!salt) {
      throw new Error('No salt available');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.masterKey, iv);
    
    const plaintext = JSON.stringify(this.vaultData);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: salt (32) + iv (16) + authTag (16) + ciphertext
    const encryptedData = Buffer.concat([salt, iv, authTag, ciphertext]);
    
    fs.writeFileSync(this.vaultPath, encryptedData);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Credential Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private getCredentials(): VaultCredential[] {
    if (!this.state.isUnlocked || !this.vaultData) return [];
    this.updateActivity();
    // Return without sensitive data for list view
    return this.vaultData.credentials.map(c => ({
      ...c,
      password: undefined, // Don't expose password in list
    }));
  }

  private getCredential(id: string): VaultCredential | null {
    if (!this.state.isUnlocked || !this.vaultData) return null;
    this.updateActivity();
    return this.vaultData.credentials.find(c => c.id === id) || null;
  }

  private async addCredential(credential: Partial<VaultCredential>): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const id = crypto.randomUUID();
      const now = Date.now();

      const newCredential: VaultCredential = {
        id,
        type: credential.type || 'website',
        title: credential.title || 'Untitled',
        username: credential.username,
        email: credential.email,
        password: credential.password,
        url: credential.url,
        notes: credential.notes,
        category: credential.category || 'personal',
        tags: credential.tags || [],
        totpSecret: credential.totpSecret,
        attachments: credential.attachments,
        createdAt: now,
        updatedAt: now,
        passwordStrength: credential.password ? this.assessPasswordStrength(credential.password) : undefined,
        favorite: credential.favorite || false,
      };

      this.vaultData.credentials.push(newCredential);
      await this.saveVault();
      this.updateActivity();

      return { success: true, id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async updateCredential(
    id: string, 
    updates: Partial<VaultCredential>
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const index = this.vaultData.credentials.findIndex(c => c.id === id);
      if (index === -1) {
        return { success: false, error: 'Credential not found' };
      }

      const updated: VaultCredential = {
        ...this.vaultData.credentials[index],
        ...updates,
        id, // Preserve ID
        updatedAt: Date.now(),
      };

      // Re-assess password strength if password changed
      if (updates.password) {
        updated.passwordStrength = this.assessPasswordStrength(updates.password);
      }

      this.vaultData.credentials[index] = updated;
      await this.saveVault();
      this.updateActivity();

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async deleteCredential(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const index = this.vaultData.credentials.findIndex(c => c.id === id);
      if (index === -1) {
        return { success: false, error: 'Credential not found' };
      }

      this.vaultData.credentials.splice(index, 1);
      await this.saveVault();
      this.updateActivity();

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private searchCredentials(query: string): VaultCredential[] {
    if (!this.state.isUnlocked || !this.vaultData) return [];
    this.updateActivity();

    const lowerQuery = query.toLowerCase();
    return this.vaultData.credentials
      .filter(c => 
        c.title.toLowerCase().includes(lowerQuery) ||
        c.username?.toLowerCase().includes(lowerQuery) ||
        c.email?.toLowerCase().includes(lowerQuery) ||
        c.url?.toLowerCase().includes(lowerQuery) ||
        c.tags.some(t => t.toLowerCase().includes(lowerQuery))
      )
      .map(c => ({ ...c, password: undefined }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Authenticator (TOTP) Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private getAuthenticators(): AuthenticatorEntry[] {
    if (!this.state.isUnlocked || !this.vaultData) return [];
    this.updateActivity();
    // Don't expose secrets in list
    return this.vaultData.authenticators.map(a => ({
      ...a,
      secret: '', // Hide secret
    }));
  }

  private async addAuthenticator(entry: Partial<AuthenticatorEntry>): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    if (!entry.secret) {
      return { success: false, error: 'Secret is required' };
    }

    try {
      const id = crypto.randomUUID();
      
      const newEntry: AuthenticatorEntry = {
        id,
        service: entry.service || 'Unknown Service',
        account: entry.account || '',
        secret: entry.secret.replace(/\s/g, '').toUpperCase(),
        issuer: entry.issuer,
        algorithm: entry.algorithm || 'SHA1',
        digits: entry.digits || 6,
        period: entry.period || 30,
        category: entry.category || 'personal',
        linkedCredentialId: entry.linkedCredentialId,
        createdAt: Date.now(),
        icon: entry.icon,
      };

      // Validate secret by generating a code
      try {
        this.generateTOTPFromSecret(newEntry.secret, newEntry.algorithm, newEntry.digits, newEntry.period);
      } catch {
        return { success: false, error: 'Invalid secret key' };
      }

      this.vaultData.authenticators.push(newEntry);
      await this.saveVault();
      this.updateActivity();

      return { success: true, id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async updateAuthenticator(
    id: string, 
    updates: Partial<AuthenticatorEntry>
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const index = this.vaultData.authenticators.findIndex(a => a.id === id);
      if (index === -1) {
        return { success: false, error: 'Authenticator not found' };
      }

      this.vaultData.authenticators[index] = {
        ...this.vaultData.authenticators[index],
        ...updates,
        id, // Preserve ID
      };

      await this.saveVault();
      this.updateActivity();

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async deleteAuthenticator(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const index = this.vaultData.authenticators.findIndex(a => a.id === id);
      if (index === -1) {
        return { success: false, error: 'Authenticator not found' };
      }

      this.vaultData.authenticators.splice(index, 1);
      await this.saveVault();
      this.updateActivity();

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private generateTOTP(id: string): { code: string; remainingSeconds: number } | null {
    if (!this.state.isUnlocked || !this.vaultData) return null;
    
    const entry = this.vaultData.authenticators.find(a => a.id === id);
    if (!entry) return null;

    this.updateActivity();
    
    const code = this.generateTOTPFromSecret(entry.secret, entry.algorithm, entry.digits, entry.period);
    const remainingSeconds = entry.period - (Math.floor(Date.now() / 1000) % entry.period);
    
    return { code, remainingSeconds };
  }

  private generateTOTPFromSecret(
    secret: string, 
    algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1',
    digits: 6 | 8 = 6,
    period: number = 30
  ): string {
    // Decode base32 secret
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of secret.toUpperCase()) {
      if (char === '=') continue;
      const index = base32Chars.indexOf(char);
      if (index === -1) throw new Error('Invalid base32 character');
      bits += index.toString(2).padStart(5, '0');
    }
    
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    const key = Buffer.from(bytes);

    // Calculate time counter
    const counter = Math.floor(Date.now() / 1000 / period);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    // Generate HMAC
    const hmacAlg = algorithm.toLowerCase().replace('sha', 'sha');
    const hmac = crypto.createHmac(hmacAlg, key).update(counterBuffer).digest();

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % Math.pow(10, digits);

    return code.toString().padStart(digits, '0');
  }

  private parseOTPUri(uri: string): Partial<AuthenticatorEntry> | null {
    try {
      // Parse otpauth://totp/Label?secret=XXX&issuer=YYY
      const url = new URL(uri);
      if (url.protocol !== 'otpauth:') return null;

      const type = url.hostname; // 'totp' or 'hotp'
      if (type !== 'totp') return null;

      const label = decodeURIComponent(url.pathname.substring(1));
      const [issuer, account] = label.includes(':') 
        ? label.split(':', 2) 
        : ['', label];

      return {
        service: url.searchParams.get('issuer') || issuer || 'Unknown',
        account: account || label,
        secret: url.searchParams.get('secret') || '',
        issuer: url.searchParams.get('issuer') || issuer,
        algorithm: (url.searchParams.get('algorithm')?.toUpperCase() || 'SHA1') as 'SHA1' | 'SHA256' | 'SHA512',
        digits: (parseInt(url.searchParams.get('digits') || '6') || 6) as 6 | 8,
        period: parseInt(url.searchParams.get('period') || '30') || 30,
      };
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Password Generator & Audit
  // ═══════════════════════════════════════════════════════════════════════════

  private generatePassword(options?: Partial<VaultSettings['passwordGeneratorOptions']>): string {
    const settings = this.vaultData?.settings || DEFAULT_SETTINGS;
    const opts = { ...settings.passwordGeneratorOptions, ...options };
    const length = settings.passwordGeneratorLength;

    let charset = '';
    if (opts.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (opts.lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (opts.numbers) charset += '0123456789';
    if (opts.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';

    const randomBytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  private assessPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
    let score = 0;

    // Length
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character variety
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Common patterns (reduce score)
    if (/^[a-zA-Z]+$/.test(password)) score--;
    if (/^[0-9]+$/.test(password)) score--;
    if (/(.)\1{2,}/.test(password)) score--; // Repeated chars

    if (score <= 3) return 'weak';
    if (score <= 5) return 'medium';
    return 'strong';
  }

  private auditPasswords(): {
    weak: VaultCredential[];
    reused: { password: string; credentials: VaultCredential[] }[];
    old: VaultCredential[];
  } {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { weak: [], reused: [], old: [] };
    }

    this.updateActivity();

    const weak = this.vaultData.credentials.filter(c => c.passwordStrength === 'weak');
    
    // Find reused passwords
    const passwordMap = new Map<string, VaultCredential[]>();
    for (const cred of this.vaultData.credentials) {
      if (cred.password) {
        const hash = crypto.createHash('sha256').update(cred.password).digest('hex');
        const existing = passwordMap.get(hash) || [];
        existing.push(cred);
        passwordMap.set(hash, existing);
      }
    }
    const reused = Array.from(passwordMap.entries())
      .filter(([_, creds]) => creds.length > 1)
      .map(([_, credentials]) => ({
        password: '[hidden]',
        credentials: credentials.map(c => ({ ...c, password: undefined })),
      }));

    // Old passwords (not updated in 180 days)
    const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
    const old = this.vaultData.credentials
      .filter(c => c.updatedAt < sixMonthsAgo)
      .map(c => ({ ...c, password: undefined }));

    return { weak, reused, old };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Clipboard Management
  // ═══════════════════════════════════════════════════════════════════════════

  private copyToClipboard(text: string, autoClear: boolean = true): void {
    clipboard.writeText(text);
    this.updateActivity();

    if (autoClear) {
      this.clearClipboardTimer();
      const clearSeconds = this.vaultData?.settings.clipboardClearSeconds || DEFAULT_SETTINGS.clipboardClearSeconds;
      
      this.state.clipboardTimer = setTimeout(() => {
        // Only clear if clipboard still has our text
        if (clipboard.readText() === text) {
          clipboard.clear();
        }
        this.state.clipboardTimer = null;
      }, clearSeconds * 1000);
    }
  }

  private clearClipboardTimer(): void {
    if (this.state.clipboardTimer) {
      clearTimeout(this.state.clipboardTimer);
      this.state.clipboardTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Settings & Categories
  // ═══════════════════════════════════════════════════════════════════════════

  private getSettings(): VaultSettings {
    return this.vaultData?.settings || DEFAULT_SETTINGS;
  }

  private async updateSettings(updates: Partial<VaultSettings>): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      this.vaultData.settings = {
        ...this.vaultData.settings,
        ...updates,
      };

      await this.saveVault();

      // Restart auto-lock timer if timeout changed
      if (updates.autoLockMinutes !== undefined) {
        this.startAutoLockTimer();
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private getCategories(): { id: string; name: string; icon?: string }[] {
    return this.vaultData?.categories || DEFAULT_CATEGORIES;
  }

  private async addCategory(category: { name: string; icon?: string }): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.state.isUnlocked || !this.vaultData) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      const id = category.name.toLowerCase().replace(/\s+/g, '-');
      
      if (this.vaultData.categories.some(c => c.id === id)) {
        return { success: false, error: 'Category already exists' };
      }

      this.vaultData.categories.push({ id, ...category });
      await this.saveVault();

      return { success: true, id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Export/Import
  // ═══════════════════════════════════════════════════════════════════════════

  private exportVault(exportPassword: string): string | null {
    if (!this.state.isUnlocked || !this.vaultData) return null;

    this.updateActivity();

    // Encrypt export with separate password
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(exportPassword, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const plaintext = JSON.stringify(this.vaultData);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combine and encode as base64
    const exportData = Buffer.concat([salt, iv, authTag, ciphertext]);
    return exportData.toString('base64');
  }

  private async importVault(data: string, importPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const buffer = Buffer.from(data, 'base64');
      
      const salt = buffer.subarray(0, SALT_LENGTH);
      const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      const key = this.deriveKey(importPassword, salt);
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted: string;
      try {
        decrypted = decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
      } catch {
        return { success: false, error: 'Invalid export password' };
      }

      const importedData = JSON.parse(decrypted) as VaultData;

      // Merge with existing vault if unlocked, or create new
      if (this.state.isUnlocked && this.vaultData) {
        // Merge credentials (avoid duplicates by URL + username)
        for (const cred of importedData.credentials) {
          const exists = this.vaultData.credentials.some(
            c => c.url === cred.url && c.username === cred.username
          );
          if (!exists) {
            this.vaultData.credentials.push({ ...cred, id: crypto.randomUUID() });
          }
        }

        // Merge authenticators (avoid duplicates by service + account)
        for (const auth of importedData.authenticators) {
          const exists = this.vaultData.authenticators.some(
            a => a.service === auth.service && a.account === auth.account
          );
          if (!exists) {
            this.vaultData.authenticators.push({ ...auth, id: crypto.randomUUID() });
          }
        }

        await this.saveVault();
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-Lock & Activity
  // ═══════════════════════════════════════════════════════════════════════════

  private updateActivity(): void {
    this.state.lastActivity = Date.now();
    this.startAutoLockTimer();
  }

  private startAutoLockTimer(): void {
    this.stopAutoLockTimer();

    const timeoutMinutes = this.vaultData?.settings.autoLockMinutes || DEFAULT_SETTINGS.autoLockMinutes;
    if (timeoutMinutes <= 0) return;

    this.autoLockTimer = setTimeout(() => {
      this.lockVault();
    }, timeoutMinutes * 60 * 1000);
  }

  private stopAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════════════════════

  private getPublicState(): {
    isUnlocked: boolean;
    credentialCount: number;
    authenticatorCount: number;
    vaultExists: boolean;
  } {
    return {
      isUnlocked: this.state.isUnlocked,
      credentialCount: this.vaultData?.credentials.length || 0,
      authenticatorCount: this.vaultData?.authenticators.length || 0,
      vaultExists: this.vaultExists(),
    };
  }

  private notifyStateChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('vault:stateChanged', this.getPublicState());
    }
  }
}

// Singleton instance
export const vaultController = new VaultController();

export default VaultController;
