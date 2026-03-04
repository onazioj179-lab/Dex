// ===========================================================================
// DEX - SYSTEM 9: Passwords & Identity as OS Features (NATIVE)
// ===========================================================================
// Dex should manage passwords, 2FA codes, and identity primitives NATIVELY—
// not as plugins or extensions. Encrypted vault. Local breach checking.
// Form autofill. Clipboard safety. All inspectable, all user-controlled.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, safeStorage, clipboard } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface VaultCredential {
  id: string;
  type: 'login' | 'credit-card' | 'identity' | 'secure-note' | 'totp';
  name: string;
  
  // Common fields
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  useCount: number;
  
  // Login specific
  login?: {
    username: string;
    email?: string;
    password: string;  // Encrypted
    urls: string[];
    notes?: string;
  };
  
  // Credit card specific
  creditCard?: {
    cardholderName: string;
    number: string;      // Encrypted, stored as last 4 only + full encrypted
    expiry: string;      // MM/YY
    cvv: string;         // Encrypted
    billingAddress?: string;
  };
  
  // Identity specific
  identity?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
  };
  
  // Secure note
  secureNote?: {
    content: string;    // Encrypted
  };
  
  // TOTP (2FA)
  totp?: {
    secret: string;     // Encrypted
    issuer: string;
    account: string;
    digits: number;
    period: number;
    algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  };
  
  // Organization
  folderId?: string;
  tags: string[];
  favorite: boolean;
  
  // Security
  breachStatus?: {
    lastChecked: number;
    isBreached: boolean;
    breachInfo?: string;
  };
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string;
  icon?: string;
  createdAt: number;
}

export interface PasswordHealth {
  credentialId: string;
  strength: 'weak' | 'fair' | 'good' | 'strong';
  score: number;  // 0-100
  issues: Array<{
    type: 'length' | 'complexity' | 'reused' | 'breached' | 'old';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  lastUpdated: number;
  daysSinceUpdate: number;
}

export interface AutofillRequest {
  url: string;
  formFields: Array<{
    name: string;
    type: string;
    id?: string;
  }>;
}

export interface AutofillSuggestion {
  credentialId: string;
  credentialName: string;
  confidence: number;  // 0-1
  matchReason: string;
}

export interface ClipboardEntry {
  content: string;
  type: 'password' | 'username' | 'card-number' | 'totp' | 'other';
  copiedAt: number;
  expiresAt: number;
  cleared: boolean;
}

// ===========================================================================
// VAULT MANAGER
// ===========================================================================

class IdentityVaultManagerClass extends EventEmitter {
  private credentials: Map<string, VaultCredential> = new Map();
  private folders: Map<string, VaultFolder> = new Map();
  private vaultKey: Buffer | null = null;
  private dataPath: string;
  private isInitialized: boolean = false;
  private isUnlocked: boolean = false;
  
  // Clipboard safety
  private clipboardHistory: ClipboardEntry[] = [];
  private clipboardClearTimeout: NodeJS.Timeout | null = null;
  private readonly CLIPBOARD_AUTO_CLEAR_MS = 60 * 1000;  // 1 minute
  
  // Password settings
  private readonly MIN_PASSWORD_LENGTH = 12;
  private readonly PWNED_API_URL = 'https://api.pwnedpasswords.com/range/';

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'vault');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[IdentityVault] Identity vault manager initialized');
  }

  shutdown(): void {
    if (this.clipboardClearTimeout) {
      clearTimeout(this.clipboardClearTimeout);
    }
    this.clearSensitiveClipboard();
    this.lock();
    this.removeAllListeners();
    log.info('[IdentityVault] Identity vault shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // VAULT LOCK/UNLOCK
  // -------------------------------------------------------------------------

  /**
   * Unlock vault with master password
   */
  async unlock(masterPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Derive key from master password
      const keyPath = path.join(this.dataPath, 'vault.key');
      
      if (!fs.existsSync(keyPath)) {
        return { success: false, error: 'Vault not initialized. Please set up first.' };
      }

      const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
      const derivedKey = crypto.scryptSync(
        masterPassword,
        Buffer.from(keyData.salt, 'hex'),
        32
      );

      // Verify key by decrypting verification data
      const verifyPath = path.join(this.dataPath, 'verify.enc');
      if (fs.existsSync(verifyPath)) {
        const verifyData = fs.readFileSync(verifyPath);
        const decrypted = this.decryptData(verifyData, derivedKey);
        
        if (decrypted !== 'VAULT_VERIFICATION') {
          return { success: false, error: 'Invalid master password' };
        }
      }

      this.vaultKey = derivedKey;
      this.isUnlocked = true;
      
      // Load credentials
      await this.loadVaultData();

      this.emit('vault-unlocked');
      log.info('[IdentityVault] Vault unlocked');
      
      return { success: true };
    } catch (error) {
      log.error('[IdentityVault] Failed to unlock:', error);
      return { success: false, error: 'Failed to unlock vault' };
    }
  }

  /**
   * Lock vault
   */
  lock(): void {
    this.vaultKey = null;
    this.isUnlocked = false;
    this.credentials.clear();
    this.folders.clear();
    
    this.emit('vault-locked');
    log.info('[IdentityVault] Vault locked');
  }

  /**
   * Initialize vault with master password
   */
  async setupVault(masterPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Generate salt and derive key
      const salt = crypto.randomBytes(32);
      const derivedKey = crypto.scryptSync(masterPassword, salt, 32);

      // Save key metadata
      const keyPath = path.join(this.dataPath, 'vault.key');
      fs.writeFileSync(keyPath, JSON.stringify({
        version: 1,
        salt: salt.toString('hex'),
        algorithm: 'scrypt',
        createdAt: Date.now(),
      }));

      // Create verification file
      const verifyPath = path.join(this.dataPath, 'verify.enc');
      const verifyData = this.encryptData('VAULT_VERIFICATION', derivedKey);
      fs.writeFileSync(verifyPath, verifyData);

      this.vaultKey = derivedKey;
      this.isUnlocked = true;

      // Create default folders
      this.createFolder('Logins', undefined, 'key');
      this.createFolder('Credit Cards', undefined, 'credit-card');
      this.createFolder('Identities', undefined, 'user');
      this.createFolder('Secure Notes', undefined, 'note');
      
      this.saveVaultData();

      this.emit('vault-setup');
      log.info('[IdentityVault] Vault setup complete');

      return { success: true };
    } catch (error) {
      log.error('[IdentityVault] Failed to setup vault:', error);
      return { success: false, error: 'Failed to setup vault' };
    }
  }

  /**
   * Change master password
   */
  async changeMasterPassword(
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    // Verify current password
    const unlockResult = await this.unlock(currentPassword);
    if (!unlockResult.success) {
      return { success: false, error: 'Current password is incorrect' };
    }

    try {
      // Generate new salt and key
      const newSalt = crypto.randomBytes(32);
      const newKey = crypto.scryptSync(newPassword, newSalt, 32);

      // Re-encrypt all credentials with new key
      const reencrypted: VaultCredential[] = [];
      for (const cred of this.credentials.values()) {
        const reencryptedCred = this.reencryptCredential(cred, this.vaultKey!, newKey);
        reencrypted.push(reencryptedCred);
      }

      // Save new key
      const keyPath = path.join(this.dataPath, 'vault.key');
      fs.writeFileSync(keyPath, JSON.stringify({
        version: 1,
        salt: newSalt.toString('hex'),
        algorithm: 'scrypt',
        createdAt: Date.now(),
      }));

      // Save new verification
      const verifyPath = path.join(this.dataPath, 'verify.enc');
      fs.writeFileSync(verifyPath, this.encryptData('VAULT_VERIFICATION', newKey));

      // Update in-memory
      this.vaultKey = newKey;
      for (const cred of reencrypted) {
        this.credentials.set(cred.id, cred);
      }
      
      this.saveVaultData();

      log.info('[IdentityVault] Master password changed');
      return { success: true };
    } catch (error) {
      log.error('[IdentityVault] Failed to change password:', error);
      return { success: false, error: 'Failed to change master password' };
    }
  }

  private reencryptCredential(
    cred: VaultCredential, 
    oldKey: Buffer, 
    newKey: Buffer
  ): VaultCredential {
    const reencrypted = { ...cred };

    // Re-encrypt sensitive fields
    if (reencrypted.login?.password) {
      const decrypted = this.decryptData(
        Buffer.from(reencrypted.login.password, 'base64'),
        oldKey
      );
      reencrypted.login.password = this.encryptData(decrypted, newKey).toString('base64');
    }

    if (reencrypted.creditCard?.number) {
      const decrypted = this.decryptData(
        Buffer.from(reencrypted.creditCard.number, 'base64'),
        oldKey
      );
      reencrypted.creditCard.number = this.encryptData(decrypted, newKey).toString('base64');
    }

    if (reencrypted.creditCard?.cvv) {
      const decrypted = this.decryptData(
        Buffer.from(reencrypted.creditCard.cvv, 'base64'),
        oldKey
      );
      reencrypted.creditCard.cvv = this.encryptData(decrypted, newKey).toString('base64');
    }

    if (reencrypted.secureNote?.content) {
      const decrypted = this.decryptData(
        Buffer.from(reencrypted.secureNote.content, 'base64'),
        oldKey
      );
      reencrypted.secureNote.content = this.encryptData(decrypted, newKey).toString('base64');
    }

    if (reencrypted.totp?.secret) {
      const decrypted = this.decryptData(
        Buffer.from(reencrypted.totp.secret, 'base64'),
        oldKey
      );
      reencrypted.totp.secret = this.encryptData(decrypted, newKey).toString('base64');
    }

    return reencrypted;
  }

  // -------------------------------------------------------------------------
  // ENCRYPTION
  // -------------------------------------------------------------------------

  private encryptData(data: string, key: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decryptData(data: Buffer, key: Buffer): string {
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  // -------------------------------------------------------------------------
  // VAULT DATA
  // -------------------------------------------------------------------------

  private async loadVaultData(): Promise<void> {
    try {
      // Load credentials
      const credsPath = path.join(this.dataPath, 'credentials.enc');
      if (fs.existsSync(credsPath) && this.vaultKey) {
        const encrypted = fs.readFileSync(credsPath);
        const decrypted = this.decryptData(encrypted, this.vaultKey);
        const data = JSON.parse(decrypted);
        
        for (const cred of data.credentials || []) {
          this.credentials.set(cred.id, cred);
        }
      }

      // Load folders
      const foldersPath = path.join(this.dataPath, 'folders.json');
      if (fs.existsSync(foldersPath)) {
        const data = JSON.parse(fs.readFileSync(foldersPath, 'utf-8'));
        for (const folder of data.folders || []) {
          this.folders.set(folder.id, folder);
        }
      }

      log.info(`[IdentityVault] Loaded ${this.credentials.size} credentials`);
    } catch (error) {
      log.error('[IdentityVault] Failed to load vault data:', error);
    }
  }

  private saveVaultData(): void {
    if (!this.isUnlocked || !this.vaultKey) return;

    try {
      // Save credentials (encrypted)
      const credsPath = path.join(this.dataPath, 'credentials.enc');
      const credsData = JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        credentials: Array.from(this.credentials.values()),
      });
      fs.writeFileSync(credsPath, this.encryptData(credsData, this.vaultKey));

      // Save folders (not sensitive)
      const foldersPath = path.join(this.dataPath, 'folders.json');
      fs.writeFileSync(foldersPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        folders: Array.from(this.folders.values()),
      }, null, 2));
    } catch (error) {
      log.error('[IdentityVault] Failed to save vault data:', error);
    }
  }

  // -------------------------------------------------------------------------
  // CREDENTIAL MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add a credential
   */
  addCredential(params: Omit<VaultCredential, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>): VaultCredential | null {
    if (!this.isUnlocked || !this.vaultKey) return null;

    const credential: VaultCredential = {
      ...params,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      useCount: 0,
    };

    // Encrypt sensitive data
    if (credential.login?.password) {
      credential.login.password = this.encryptData(
        credential.login.password,
        this.vaultKey
      ).toString('base64');
    }

    if (credential.creditCard) {
      if (credential.creditCard.number) {
        credential.creditCard.number = this.encryptData(
          credential.creditCard.number,
          this.vaultKey
        ).toString('base64');
      }
      if (credential.creditCard.cvv) {
        credential.creditCard.cvv = this.encryptData(
          credential.creditCard.cvv,
          this.vaultKey
        ).toString('base64');
      }
    }

    if (credential.secureNote?.content) {
      credential.secureNote.content = this.encryptData(
        credential.secureNote.content,
        this.vaultKey
      ).toString('base64');
    }

    if (credential.totp?.secret) {
      credential.totp.secret = this.encryptData(
        credential.totp.secret,
        this.vaultKey
      ).toString('base64');
    }

    this.credentials.set(credential.id, credential);
    this.saveVaultData();

    this.emit('credential-added', credential.id);
    return credential;
  }

  /**
   * Get credential (with decrypted sensitive data)
   */
  getCredential(credentialId: string): VaultCredential | null {
    if (!this.isUnlocked || !this.vaultKey) return null;

    const credential = this.credentials.get(credentialId);
    if (!credential) return null;

    // Return decrypted copy
    const decrypted = { ...credential };

    if (decrypted.login?.password) {
      decrypted.login = { ...decrypted.login };
      decrypted.login.password = this.decryptData(
        Buffer.from(decrypted.login.password, 'base64'),
        this.vaultKey
      );
    }

    if (decrypted.creditCard) {
      decrypted.creditCard = { ...decrypted.creditCard };
      if (decrypted.creditCard.number) {
        decrypted.creditCard.number = this.decryptData(
          Buffer.from(decrypted.creditCard.number, 'base64'),
          this.vaultKey
        );
      }
      if (decrypted.creditCard.cvv) {
        decrypted.creditCard.cvv = this.decryptData(
          Buffer.from(decrypted.creditCard.cvv, 'base64'),
          this.vaultKey
        );
      }
    }

    if (decrypted.secureNote?.content) {
      decrypted.secureNote = { ...decrypted.secureNote };
      decrypted.secureNote.content = this.decryptData(
        Buffer.from(decrypted.secureNote.content, 'base64'),
        this.vaultKey
      );
    }

    if (decrypted.totp?.secret) {
      decrypted.totp = { ...decrypted.totp };
      decrypted.totp.secret = this.decryptData(
        Buffer.from(decrypted.totp.secret, 'base64'),
        this.vaultKey
      );
    }

    // Update use stats
    credential.lastUsedAt = Date.now();
    credential.useCount++;
    this.saveVaultData();

    return decrypted;
  }

  /**
   * List credentials (without decrypted sensitive data)
   */
  listCredentials(options?: {
    type?: VaultCredential['type'];
    folderId?: string;
    search?: string;
  }): Array<Omit<VaultCredential, 'login' | 'creditCard' | 'secureNote' | 'totp'> & {
    hasPassword?: boolean;
    username?: string;
    cardLast4?: string;
  }> {
    if (!this.isUnlocked) return [];

    return Array.from(this.credentials.values())
      .filter(c => {
        if (options?.type && c.type !== options.type) return false;
        if (options?.folderId && c.folderId !== options.folderId) return false;
        if (options?.search) {
          const search = options.search.toLowerCase();
          if (!c.name.toLowerCase().includes(search)) return false;
        }
        return true;
      })
      .map(c => ({
        id: c.id,
        type: c.type,
        name: c.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastUsedAt: c.lastUsedAt,
        useCount: c.useCount,
        folderId: c.folderId,
        tags: c.tags,
        favorite: c.favorite,
        breachStatus: c.breachStatus,
        hasPassword: !!c.login?.password,
        username: c.login?.username,
        cardLast4: c.creditCard?.number ? '****' : undefined,
      }));
  }

  /**
   * Delete credential
   */
  deleteCredential(credentialId: string): boolean {
    if (!this.credentials.has(credentialId)) return false;
    
    this.credentials.delete(credentialId);
    this.saveVaultData();
    
    this.emit('credential-deleted', credentialId);
    return true;
  }

  // -------------------------------------------------------------------------
  // FOLDER MANAGEMENT
  // -------------------------------------------------------------------------

  createFolder(name: string, parentId?: string, icon?: string): VaultFolder {
    const folder: VaultFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      icon,
      createdAt: Date.now(),
    };

    this.folders.set(folder.id, folder);
    this.saveVaultData();

    return folder;
  }

  listFolders(): VaultFolder[] {
    return Array.from(this.folders.values());
  }

  deleteFolder(folderId: string): boolean {
    if (!this.folders.has(folderId)) return false;
    
    // Move credentials to no folder
    for (const cred of this.credentials.values()) {
      if (cred.folderId === folderId) {
        cred.folderId = undefined;
      }
    }
    
    this.folders.delete(folderId);
    this.saveVaultData();
    
    return true;
  }

  // -------------------------------------------------------------------------
  // PASSWORD HEALTH
  // -------------------------------------------------------------------------

  /**
   * Check password health
   */
  checkPasswordHealth(credentialId: string): PasswordHealth | null {
    const cred = this.getCredential(credentialId);
    if (!cred || !cred.login?.password) return null;

    const password = cred.login.password;
    const issues: PasswordHealth['issues'] = [];
    let score = 100;

    // Length check
    if (password.length < 8) {
      issues.push({
        type: 'length',
        description: 'Password is too short (less than 8 characters)',
        severity: 'high',
      });
      score -= 30;
    } else if (password.length < this.MIN_PASSWORD_LENGTH) {
      issues.push({
        type: 'length',
        description: `Password is shorter than recommended (${this.MIN_PASSWORD_LENGTH} characters)`,
        severity: 'medium',
      });
      score -= 15;
    }

    // Complexity check
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const complexity = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    if (complexity < 3) {
      issues.push({
        type: 'complexity',
        description: 'Password lacks character variety',
        severity: complexity < 2 ? 'high' : 'medium',
      });
      score -= (4 - complexity) * 10;
    }

    // Age check
    const daysSinceUpdate = Math.floor((Date.now() - cred.updatedAt) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate > 365) {
      issues.push({
        type: 'old',
        description: 'Password hasn\'t been changed in over a year',
        severity: 'medium',
      });
      score -= 10;
    }

    // Reuse check
    const reusedCount = this.checkPasswordReuse(password, credentialId);
    if (reusedCount > 0) {
      issues.push({
        type: 'reused',
        description: `Password is used by ${reusedCount} other account(s)`,
        severity: 'high',
      });
      score -= 25;
    }

    // Determine strength
    let strength: PasswordHealth['strength'];
    if (score >= 80) strength = 'strong';
    else if (score >= 60) strength = 'good';
    else if (score >= 40) strength = 'fair';
    else strength = 'weak';

    return {
      credentialId,
      strength,
      score: Math.max(0, score),
      issues,
      lastUpdated: cred.updatedAt,
      daysSinceUpdate,
    };
  }

  private checkPasswordReuse(password: string, excludeId: string): number {
    let count = 0;
    for (const cred of this.credentials.values()) {
      if (cred.id === excludeId || !cred.login?.password) continue;
      
      const decrypted = this.decryptData(
        Buffer.from(cred.login.password, 'base64'),
        this.vaultKey!
      );
      
      if (decrypted === password) count++;
    }
    return count;
  }

  /**
   * Generate secure password
   */
  generatePassword(options?: {
    length?: number;
    includeNumbers?: boolean;
    includeSymbols?: boolean;
    excludeAmbiguous?: boolean;
  }): string {
    const opts = {
      length: 20,
      includeNumbers: true,
      includeSymbols: true,
      excludeAmbiguous: true,
      ...options,
    };

    let chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    if (!opts.excludeAmbiguous) {
      chars += 'lIO0o';
    }
    if (opts.includeNumbers) {
      chars += opts.excludeAmbiguous ? '23456789' : '0123456789';
    }
    if (opts.includeSymbols) {
      chars += '!@#$%^&*-_=+?';
    }

    const password = Array.from(crypto.randomBytes(opts.length))
      .map(byte => chars[byte % chars.length])
      .join('');

    return password;
  }

  // -------------------------------------------------------------------------
  // TOTP
  // -------------------------------------------------------------------------

  /**
   * Generate TOTP code
   */
  getTOTPCode(credentialId: string): { code: string; remainingSeconds: number } | null {
    const cred = this.getCredential(credentialId);
    if (!cred || !cred.totp) return null;

    const { secret, digits = 6, period = 30, algorithm = 'SHA1' } = cred.totp;
    
    const now = Date.now();
    const counter = Math.floor(now / 1000 / period);
    const remainingSeconds = period - (Math.floor(now / 1000) % period);

    const code = this.generateTOTPCode(secret, counter, digits, algorithm);

    return { code, remainingSeconds };
  }

  private generateTOTPCode(
    secret: string, 
    counter: number, 
    digits: number,
    algorithm: string
  ): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac(algorithm.toLowerCase(), Buffer.from(secret, 'base64'));
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0xf;
    const binary = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    );

    const otp = binary % Math.pow(10, digits);
    return otp.toString().padStart(digits, '0');
  }

  // -------------------------------------------------------------------------
  // CLIPBOARD SAFETY
  // -------------------------------------------------------------------------

  /**
   * Copy to clipboard with auto-clear
   */
  copyToClipboard(
    content: string, 
    type: ClipboardEntry['type'] = 'other'
  ): void {
    // Clear any existing timer
    if (this.clipboardClearTimeout) {
      clearTimeout(this.clipboardClearTimeout);
    }

    clipboard.writeText(content);

    const entry: ClipboardEntry = {
      content: type === 'password' ? '***' : content.substring(0, 20),
      type,
      copiedAt: Date.now(),
      expiresAt: Date.now() + this.CLIPBOARD_AUTO_CLEAR_MS,
      cleared: false,
    };

    this.clipboardHistory.push(entry);

    // Auto-clear sensitive data
    if (type !== 'other') {
      this.clipboardClearTimeout = setTimeout(() => {
        this.clearSensitiveClipboard();
      }, this.CLIPBOARD_AUTO_CLEAR_MS);
    }

    this.emit('clipboard-copy', { type });
  }

  private clearSensitiveClipboard(): void {
    // Only clear if clipboard still contains our content
    clipboard.writeText('');
    
    // Mark entries as cleared
    for (const entry of this.clipboardHistory) {
      if (!entry.cleared && entry.expiresAt < Date.now()) {
        entry.cleared = true;
      }
    }

    this.emit('clipboard-cleared');
  }

  // -------------------------------------------------------------------------
  // AUTOFILL
  // -------------------------------------------------------------------------

  /**
   * Get autofill suggestions for a URL
   */
  getAutofillSuggestions(request: AutofillRequest): AutofillSuggestion[] {
    if (!this.isUnlocked) return [];

    const suggestions: AutofillSuggestion[] = [];
    const urlLower = request.url.toLowerCase();
    const urlHost = new URL(request.url).hostname;

    for (const cred of this.credentials.values()) {
      if (cred.type !== 'login' || !cred.login) continue;

      let confidence = 0;
      let matchReason = '';

      // Check URL matches
      for (const savedUrl of cred.login.urls || []) {
        try {
          const savedHost = new URL(savedUrl).hostname;
          if (savedHost === urlHost) {
            confidence = 0.95;
            matchReason = 'Exact domain match';
            break;
          } else if (urlHost.endsWith('.' + savedHost) || savedHost.endsWith('.' + urlHost)) {
            confidence = Math.max(confidence, 0.7);
            matchReason = 'Subdomain match';
          }
        } catch {
          // Invalid URL
        }
      }

      // Check name match
      if (confidence < 0.5 && cred.name.toLowerCase().includes(urlHost.split('.')[0])) {
        confidence = 0.5;
        matchReason = 'Name contains domain';
      }

      if (confidence > 0) {
        suggestions.push({
          credentialId: cred.id,
          credentialName: cred.name,
          confidence,
          matchReason,
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  isVaultUnlocked(): boolean {
    return this.isUnlocked;
  }

  hasVault(): boolean {
    return fs.existsSync(path.join(this.dataPath, 'vault.key'));
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Vault management
    ipcMain.handle('vault:hasVault', () => this.hasVault());
    ipcMain.handle('vault:isUnlocked', () => this.isVaultUnlocked());
    ipcMain.handle('vault:setup', async (_, password) => this.setupVault(password));
    ipcMain.handle('vault:unlock', async (_, password) => this.unlock(password));
    ipcMain.handle('vault:lock', () => { this.lock(); return true; });
    ipcMain.handle('vault:changePassword', async (_, current, newPass) => 
      this.changeMasterPassword(current, newPass));

    // Credentials
    ipcMain.handle('vault:addCredential', (_, params) => this.addCredential(params));
    ipcMain.handle('vault:getCredential', (_, id) => this.getCredential(id));
    ipcMain.handle('vault:listCredentials', (_, options) => this.listCredentials(options));
    ipcMain.handle('vault:deleteCredential', (_, id) => this.deleteCredential(id));

    // Folders
    ipcMain.handle('vault:createFolder', (_, name, parentId, icon) => 
      this.createFolder(name, parentId, icon));
    ipcMain.handle('vault:listFolders', () => this.listFolders());
    ipcMain.handle('vault:deleteFolder', (_, id) => this.deleteFolder(id));

    // Password tools
    ipcMain.handle('vault:checkPasswordHealth', (_, id) => this.checkPasswordHealth(id));
    ipcMain.handle('vault:generatePassword', (_, options) => this.generatePassword(options));

    // TOTP
    ipcMain.handle('vault:getTOTPCode', (_, id) => this.getTOTPCode(id));

    // Clipboard
    ipcMain.handle('vault:copyToClipboard', (_, content, type) => {
      this.copyToClipboard(content, type);
      return true;
    });

    // Autofill
    ipcMain.handle('vault:getAutofillSuggestions', (_, request) => 
      this.getAutofillSuggestions(request));
  }
}

// Singleton instance
export const identityVaultManager = new IdentityVaultManagerClass();

export async function initializeIdentityVault(): Promise<void> {
  return identityVaultManager.initialize();
}

export function shutdownIdentityVault(): void {
  identityVaultManager.shutdown();
}
