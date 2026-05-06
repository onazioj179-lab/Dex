// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Secure Vault System
// Secure vault folders with extra isolation
// End-to-end encryption for all Dex-managed data
// Tamper detection for critical files and configuration
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type VaultStatus = 'locked' | 'unlocked' | 'corrupted' | 'uninitialized';

export interface VaultFile {
  id: string;
  originalName: string;
  encryptedName: string;
  size: number;
  addedAt: number;
  modifiedAt: number;
  hash: string;
  mimeType?: string;
}

export interface Vault {
  id: string;
  name: string;
  path: string;
  status: VaultStatus;
  createdAt: number;
  lastAccessed?: number;
  fileCount: number;
  totalSize: number;
  autoLockMinutes: number;
}

export interface VaultConfig {
  keyDerivationIterations: number;
  encryptionAlgorithm: string;
  hashAlgorithm: string;
  autoLockMinutes: number;
  wipeOnFailedAttempts: number;
}

export interface IntegrityCheck {
  path: string;
  expectedHash: string;
  currentHash?: string;
  status: 'valid' | 'modified' | 'missing' | 'error';
  checkedAt: number;
}

// ===========================================================================
// SECURE VAULT SYSTEM
// ===========================================================================

class SecureVaultSystemClass extends EventEmitter {
  private config: VaultConfig;
  private vaults: Map<string, Vault> = new Map();
  private unlockedVaults: Map<string, { key: Buffer; timer: NodeJS.Timeout }> = new Map();
  private vaultsPath = '';
  private indexPath = '';
  private integrityHashes: Map<string, string> = new Map();
  private failedAttempts: Map<string, number> = new Map();
  private vaultIdCounter = 0;

  constructor() {
    super();
    this.config = {
      keyDerivationIterations: 100000,
      encryptionAlgorithm: 'aes-256-gcm',
      hashAlgorithm: 'sha256',
      autoLockMinutes: 5,
      wipeOnFailedAttempts: 10
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.vaultsPath = path.join(app.getPath('userData'), 'vaults');
    this.indexPath = path.join(this.vaultsPath, 'vaults.enc');
    
    try {
      await fs.mkdir(this.vaultsPath, { recursive: true });
      await this.loadVaultIndex();
      await this.loadIntegrityHashes();
      log.info(`[SecureVault] Initialized with ${this.vaults.size} vaults`);
    } catch (error) {
      log.error('[SecureVault] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Create vault
    ipcMain.handle('vault:create', async (_event, name: string, password: string) => {
      return this.createVault(name, password);
    });

    // List vaults
    ipcMain.handle('vault:list', () => {
      return this.listVaults();
    });

    // Unlock vault
    ipcMain.handle('vault:unlock', async (_event, vaultId: string, password: string) => {
      return this.unlockVault(vaultId, password);
    });

    // Lock vault
    ipcMain.handle('vault:lock', (_event, vaultId: string) => {
      return this.lockVault(vaultId);
    });

    // Add file to vault
    ipcMain.handle('vault:addFile', async (_event, vaultId: string, filePath: string) => {
      return this.addFileToVault(vaultId, filePath);
    });

    // Get file from vault
    ipcMain.handle('vault:getFile', async (_event, vaultId: string, fileId: string, outputPath: string) => {
      return this.getFileFromVault(vaultId, fileId, outputPath);
    });

    // List vault files
    ipcMain.handle('vault:listFiles', async (_event, vaultId: string) => {
      return this.listVaultFiles(vaultId);
    });

    // Remove file from vault
    ipcMain.handle('vault:removeFile', async (_event, vaultId: string, fileId: string) => {
      return this.removeFileFromVault(vaultId, fileId);
    });

    // Delete vault
    ipcMain.handle('vault:delete', async (_event, vaultId: string, password: string) => {
      return this.deleteVault(vaultId, password);
    });

    // Change vault password
    ipcMain.handle('vault:changePassword', async (_event, vaultId: string, oldPassword: string, newPassword: string) => {
      return this.changeVaultPassword(vaultId, oldPassword, newPassword);
    });

    // Check vault status
    ipcMain.handle('vault:status', (_event, vaultId: string) => {
      return this.getVaultStatus(vaultId);
    });

    // Integrity checks
    ipcMain.handle('vault:checkIntegrity', async (_event, paths: string[]) => {
      return this.checkIntegrity(paths);
    });

    // Register file for integrity monitoring
    ipcMain.handle('vault:registerIntegrity', async (_event, filePath: string) => {
      return this.registerForIntegrity(filePath);
    });
  }

  // -------------------------------------------------------------------------
  // VAULT MANAGEMENT
  // -------------------------------------------------------------------------

  async createVault(name: string, password: string): Promise<Vault> {
    const vaultId = `vault-${++this.vaultIdCounter}-${Date.now()}`;
    const vaultPath = path.join(this.vaultsPath, vaultId);
    
    await fs.mkdir(vaultPath, { recursive: true });

    // Generate salt and derive key
    const salt = crypto.randomBytes(32);
    const key = await this.deriveKey(password, salt);
    
    // Store salt (encrypted with system key)
    const saltPath = path.join(vaultPath, 'salt');
    await fs.writeFile(saltPath, this.encryptWithSystem(salt));

    // Initialize empty file index
    const fileIndex: VaultFile[] = [];
    await this.saveVaultFileIndex(vaultPath, fileIndex, key);

    const vault: Vault = {
      id: vaultId,
      name,
      path: vaultPath,
      status: 'locked',
      createdAt: Date.now(),
      fileCount: 0,
      totalSize: 0,
      autoLockMinutes: this.config.autoLockMinutes
    };

    this.vaults.set(vaultId, vault);
    await this.saveVaultIndex();

    this.emit('vault:created', vault);
    return vault;
  }

  listVaults(): Vault[] {
    return Array.from(this.vaults.values()).map(v => ({
      ...v,
      status: this.unlockedVaults.has(v.id) ? 'unlocked' : v.status
    }));
  }

  async unlockVault(vaultId: string, password: string): Promise<{ success: boolean; error?: string }> {
    const vault = this.vaults.get(vaultId);
    if (!vault) {
      return { success: false, error: 'Vault not found' };
    }

    // Check failed attempts
    const attempts = this.failedAttempts.get(vaultId) || 0;
    if (attempts >= this.config.wipeOnFailedAttempts) {
      return { success: false, error: 'Vault locked due to too many failed attempts' };
    }

    try {
      // Load salt
      const saltPath = path.join(vault.path, 'salt');
      const encryptedSalt = await fs.readFile(saltPath);
      const salt = this.decryptWithSystem(encryptedSalt);

      // Derive key
      const key = await this.deriveKey(password, salt);

      // Try to load file index to verify password
      await this.loadVaultFileIndex(vault.path, key);

      // Success - store key and start auto-lock timer
      const timer = setTimeout(() => {
        this.lockVault(vaultId);
      }, vault.autoLockMinutes * 60 * 1000);

      this.unlockedVaults.set(vaultId, { key, timer });
      this.failedAttempts.delete(vaultId);

      vault.lastAccessed = Date.now();
      await this.saveVaultIndex();

      this.emit('vault:unlocked', vault);
      return { success: true };

    } catch (error) {
      // Increment failed attempts
      this.failedAttempts.set(vaultId, attempts + 1);
      log.warn(`[SecureVault] Failed unlock attempt for ${vaultId} (${attempts + 1}/${this.config.wipeOnFailedAttempts})`);
      return { success: false, error: 'Invalid password' };
    }
  }

  lockVault(vaultId: string): { success: boolean } {
    const unlocked = this.unlockedVaults.get(vaultId);
    if (unlocked) {
      clearTimeout(unlocked.timer);
      // Securely clear key from memory
      unlocked.key.fill(0);
      this.unlockedVaults.delete(vaultId);
      
      this.emit('vault:locked', vaultId);
    }
    return { success: true };
  }

  getVaultStatus(vaultId: string): { status: VaultStatus; isUnlocked: boolean } | null {
    const vault = this.vaults.get(vaultId);
    if (!vault) return null;

    return {
      status: vault.status,
      isUnlocked: this.unlockedVaults.has(vaultId)
    };
  }

  // -------------------------------------------------------------------------
  // FILE OPERATIONS
  // -------------------------------------------------------------------------

  async addFileToVault(vaultId: string, filePath: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const unlocked = this.unlockedVaults.get(vaultId);
    if (!unlocked) {
      return { success: false, error: 'Vault is locked' };
    }

    const vault = this.vaults.get(vaultId)!;

    try {
      // Read and encrypt file
      const fileContent = await fs.readFile(filePath);
      const encrypted = this.encryptData(fileContent, unlocked.key);
      
      // Generate file ID and save
      const fileId = crypto.randomBytes(16).toString('hex');
      const encryptedPath = path.join(vault.path, `${fileId}.enc`);
      await fs.writeFile(encryptedPath, encrypted);

      // Update file index
      const fileIndex = await this.loadVaultFileIndex(vault.path, unlocked.key);
      const stats = await fs.stat(filePath);
      
      const vaultFile: VaultFile = {
        id: fileId,
        originalName: path.basename(filePath),
        encryptedName: `${fileId}.enc`,
        size: stats.size,
        addedAt: Date.now(),
        modifiedAt: stats.mtimeMs,
        hash: crypto.createHash('sha256').update(fileContent).digest('hex')
      };

      fileIndex.push(vaultFile);
      await this.saveVaultFileIndex(vault.path, fileIndex, unlocked.key);

      // Update vault stats
      vault.fileCount = fileIndex.length;
      vault.totalSize = fileIndex.reduce((sum, f) => sum + f.size, 0);
      await this.saveVaultIndex();

      this.emit('vault:fileAdded', { vaultId, file: vaultFile });
      return { success: true, fileId };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async getFileFromVault(vaultId: string, fileId: string, outputPath: string): Promise<{ success: boolean; error?: string }> {
    const unlocked = this.unlockedVaults.get(vaultId);
    if (!unlocked) {
      return { success: false, error: 'Vault is locked' };
    }

    const vault = this.vaults.get(vaultId)!;

    try {
      const encryptedPath = path.join(vault.path, `${fileId}.enc`);
      const encrypted = await fs.readFile(encryptedPath);
      const decrypted = this.decryptData(encrypted, unlocked.key);
      
      await fs.writeFile(outputPath, decrypted);
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async listVaultFiles(vaultId: string): Promise<VaultFile[] | null> {
    const unlocked = this.unlockedVaults.get(vaultId);
    if (!unlocked) return null;

    const vault = this.vaults.get(vaultId)!;
    return this.loadVaultFileIndex(vault.path, unlocked.key);
  }

  async removeFileFromVault(vaultId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
    const unlocked = this.unlockedVaults.get(vaultId);
    if (!unlocked) {
      return { success: false, error: 'Vault is locked' };
    }

    const vault = this.vaults.get(vaultId)!;

    try {
      // Delete encrypted file
      const encryptedPath = path.join(vault.path, `${fileId}.enc`);
      await fs.unlink(encryptedPath);

      // Update file index
      const fileIndex = await this.loadVaultFileIndex(vault.path, unlocked.key);
      const newIndex = fileIndex.filter(f => f.id !== fileId);
      await this.saveVaultFileIndex(vault.path, newIndex, unlocked.key);

      // Update vault stats
      vault.fileCount = newIndex.length;
      vault.totalSize = newIndex.reduce((sum, f) => sum + f.size, 0);
      await this.saveVaultIndex();

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async deleteVault(vaultId: string, password: string): Promise<{ success: boolean; error?: string }> {
    // First verify password
    const unlockResult = await this.unlockVault(vaultId, password);
    if (!unlockResult.success) {
      return unlockResult;
    }

    const vault = this.vaults.get(vaultId)!;

    try {
      // Securely delete all files
      const files = await fs.readdir(vault.path);
      for (const file of files) {
        const filePath = path.join(vault.path, file);
        // Overwrite with random data before deleting
        const stats = await fs.stat(filePath);
        const random = crypto.randomBytes(Math.min(stats.size, 1024 * 1024));
        await fs.writeFile(filePath, random);
        await fs.unlink(filePath);
      }

      await fs.rmdir(vault.path);
      
      this.lockVault(vaultId);
      this.vaults.delete(vaultId);
      await this.saveVaultIndex();

      this.emit('vault:deleted', vaultId);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async changeVaultPassword(vaultId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    // Unlock with old password
    const unlockResult = await this.unlockVault(vaultId, oldPassword);
    if (!unlockResult.success) {
      return unlockResult;
    }

    const vault = this.vaults.get(vaultId)!;
    const oldUnlocked = this.unlockedVaults.get(vaultId)!;

    try {
      // Generate new salt and key
      const newSalt = crypto.randomBytes(32);
      const newKey = await this.deriveKey(newPassword, newSalt);

      // Load file index with old key
      const fileIndex = await this.loadVaultFileIndex(vault.path, oldUnlocked.key);

      // Re-encrypt all files with new key
      for (const file of fileIndex) {
        const encryptedPath = path.join(vault.path, file.encryptedName);
        const encrypted = await fs.readFile(encryptedPath);
        const decrypted = this.decryptData(encrypted, oldUnlocked.key);
        const reEncrypted = this.encryptData(decrypted, newKey);
        await fs.writeFile(encryptedPath, reEncrypted);
      }

      // Save new salt
      const saltPath = path.join(vault.path, 'salt');
      await fs.writeFile(saltPath, this.encryptWithSystem(newSalt));

      // Save file index with new key
      await this.saveVaultFileIndex(vault.path, fileIndex, newKey);

      // Lock and re-unlock with new key
      this.lockVault(vaultId);
      await this.unlockVault(vaultId, newPassword);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  // -------------------------------------------------------------------------
  // ENCRYPTION
  // -------------------------------------------------------------------------

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.config.keyDerivationIterations,
        32,
        'sha512',
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  private encryptData(data: Buffer, key: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Format: iv (16) + authTag (16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decryptData(data: Buffer, key: Buffer): Buffer {
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private encryptWithSystem(data: Buffer): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(data.toString('base64'));
    }
    // Fallback: use app-derived key
    const key = crypto.createHash('sha256').update(app.getPath('userData')).digest();
    return this.encryptData(data, key);
  }

  private decryptWithSystem(data: Buffer): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
      return Buffer.from(safeStorage.decryptString(data), 'base64');
    }
    // Fallback
    const key = crypto.createHash('sha256').update(app.getPath('userData')).digest();
    return this.decryptData(data, key);
  }

  // -------------------------------------------------------------------------
  // INTEGRITY MONITORING
  // -------------------------------------------------------------------------

  async registerForIntegrity(filePath: string): Promise<{ success: boolean; hash?: string }> {
    try {
      const hash = await this.hashFile(filePath);
      this.integrityHashes.set(filePath, hash);
      await this.saveIntegrityHashes();
      return { success: true, hash };
    } catch (error) {
      return { success: false };
    }
  }

  async checkIntegrity(paths: string[]): Promise<IntegrityCheck[]> {
    const results: IntegrityCheck[] = [];

    for (const filePath of paths) {
      const expectedHash = this.integrityHashes.get(filePath);
      const check: IntegrityCheck = {
        path: filePath,
        expectedHash: expectedHash || '',
        checkedAt: Date.now(),
        status: 'valid'
      };

      if (!expectedHash) {
        check.status = 'error';
        results.push(check);
        continue;
      }

      try {
        const currentHash = await this.hashFile(filePath);
        check.currentHash = currentHash;
        
        if (currentHash !== expectedHash) {
          check.status = 'modified';
          this.emit('integrity:violation', check);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          check.status = 'missing';
        } else {
          check.status = 'error';
        }
        this.emit('integrity:violation', check);
      }

      results.push(check);
    }

    return results;
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.config.hashAlgorithm);
      const stream = fsSync.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadVaultIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath);
      const decrypted = this.decryptWithSystem(data);
      const vaults = JSON.parse(decrypted.toString()) as Vault[];
      
      for (const vault of vaults) {
        this.vaults.set(vault.id, vault);
      }
    } catch {
      // No vaults yet
    }
  }

  private async saveVaultIndex(): Promise<void> {
    const vaults = Array.from(this.vaults.values());
    const data = Buffer.from(JSON.stringify(vaults));
    const encrypted = this.encryptWithSystem(data);
    await fs.writeFile(this.indexPath, encrypted);
  }

  private async loadVaultFileIndex(vaultPath: string, key: Buffer): Promise<VaultFile[]> {
    const indexPath = path.join(vaultPath, 'index.enc');
    const encrypted = await fs.readFile(indexPath);
    const decrypted = this.decryptData(encrypted, key);
    return JSON.parse(decrypted.toString());
  }

  private async saveVaultFileIndex(vaultPath: string, files: VaultFile[], key: Buffer): Promise<void> {
    const indexPath = path.join(vaultPath, 'index.enc');
    const data = Buffer.from(JSON.stringify(files));
    const encrypted = this.encryptData(data, key);
    await fs.writeFile(indexPath, encrypted);
  }

  private async loadIntegrityHashes(): Promise<void> {
    try {
      const hashesPath = path.join(this.vaultsPath, 'integrity.json');
      const data = await fs.readFile(hashesPath, 'utf-8');
      const hashes = JSON.parse(data) as Record<string, string>;
      this.integrityHashes = new Map(Object.entries(hashes));
    } catch {
      // No hashes yet
    }
  }

  private async saveIntegrityHashes(): Promise<void> {
    const hashesPath = path.join(this.vaultsPath, 'integrity.json');
    const hashes = Object.fromEntries(this.integrityHashes);
    await fs.writeFile(hashesPath, JSON.stringify(hashes, null, 2));
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    // Lock all vaults
    for (const vaultId of this.unlockedVaults.keys()) {
      this.lockVault(vaultId);
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const SecureVaultSystem = new SecureVaultSystemClass();
export default SecureVaultSystem;
