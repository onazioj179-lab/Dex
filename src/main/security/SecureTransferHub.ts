// ═══════════════════════════════════════════════════════════════════════════
// DEX - Secure Transfer Hub
// End-to-end encrypted data transfer with quarantine pipeline
// User-approved, fully logged, no automatic transfers
// ═══════════════════════════════════════════════════════════════════════════

import { app, BrowserWindow, dialog } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Store from 'electron-store';
import log from 'electron-log';
import { SecureKeyManager } from './SecureKeyManager';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TransferConfig {
  enabled: boolean;
  requireApproval: boolean;
  autoQuarantine: boolean;
  maxFileSizeMB: number;
  allowedFileTypes: string[];
  blockedFileTypes: string[];
  encryptTransfers: boolean;
  chunkSizeKB: number;
  parallelChunks: number;
  retryAttempts: number;
}

export interface Transfer {
  id: string;
  type: 'send' | 'receive';
  status: TransferStatus;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  sourcePath?: string;
  destinationPath?: string;
  quarantinePath?: string;
  encrypted: boolean;
  progress: number;
  bytesTransferred: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  metadata: TransferMetadata;
}

export type TransferStatus = 
  | 'pending'        // Waiting for approval
  | 'queued'         // Approved, waiting to start
  | 'transferring'   // In progress
  | 'quarantined'    // Received, awaiting validation
  | 'validating'     // Running integrity/security checks
  | 'ready'          // Validated, ready for final move
  | 'completed'      // Successfully finished
  | 'failed'         // Failed
  | 'cancelled';     // Cancelled by user

export interface TransferMetadata {
  sender?: string;
  receiver?: string;
  timestamp: number;
  chunks?: number;
  encryptionKeyId?: string;
  signature?: string;
}

export interface TransferRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  encrypted: boolean;
  sender: string;
}

export interface TransferProgress {
  transferId: string;
  progress: number;
  bytesTransferred: number;
  speed: number; // bytes per second
  eta: number;   // seconds remaining
}

export interface QuarantineResult {
  transferId: string;
  passed: boolean;
  checks: QuarantineCheck[];
}

export interface QuarantineCheck {
  name: string;
  passed: boolean;
  details: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CHUNK_SIZE = 1024; // KB
const MAX_PARALLEL_CHUNKS = 4;
const QUARANTINE_DIR = 'dex-quarantine';

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

const transferStore = new Store<{
  config: TransferConfig;
  transfers: Record<string, Transfer>;
  transferLog: TransferLogEntry[];
}>({
  name: 'dex-transfers',
  defaults: {
    config: {
      enabled: true,
      requireApproval: true,
      autoQuarantine: true,
      maxFileSizeMB: 1024, // 1GB
      allowedFileTypes: [],
      blockedFileTypes: ['.exe', '.bat', '.cmd', '.msi', '.scr', '.pif'],
      encryptTransfers: true,
      chunkSizeKB: DEFAULT_CHUNK_SIZE,
      parallelChunks: MAX_PARALLEL_CHUNKS,
      retryAttempts: 3,
    },
    transfers: {},
    transferLog: [],
  },
});

interface TransferLogEntry {
  timestamp: number;
  transferId: string;
  action: string;
  details: string;
  success: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURE TRANSFER HUB
// ═══════════════════════════════════════════════════════════════════════════

class SecureTransferHubClass {
  private activeTransfers: Map<string, Transfer> = new Map();
  private quarantinePath: string;
  private transferKey: Buffer | null = null;
  private progressCallbacks: Map<string, (progress: TransferProgress) => void> = new Map();

  constructor() {
    this.quarantinePath = path.join(app.getPath('userData'), QUARANTINE_DIR);
    this.ensureQuarantineDir();
  }

  private ensureQuarantineDir(): void {
    if (!fs.existsSync(this.quarantinePath)) {
      fs.mkdirSync(this.quarantinePath, { recursive: true });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    log.info('[TransferHub] Initializing secure transfer hub...');

    // Get or create transfer encryption key
    const keyInfo = await SecureKeyManager.generateKey('transfer-key', 'transfer');
    if (keyInfo) {
      this.transferKey = await SecureKeyManager.getKey(keyInfo.id);
    }

    // Load active transfers from store
    const stored = transferStore.get('transfers');
    for (const transfer of Object.values(stored)) {
      if (transfer.status !== 'completed' && transfer.status !== 'failed' && transfer.status !== 'cancelled') {
        this.activeTransfers.set(transfer.id, transfer);
      }
    }

    log.info(`[TransferHub] Loaded ${this.activeTransfers.size} pending transfers`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEND OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  async initiateTransfer(
    filePath: string,
    options?: { encrypt?: boolean; recipient?: string }
  ): Promise<Transfer | null> {
    const config = this.getConfig();
    
    if (!config.enabled) {
      log.warn('[TransferHub] Transfers are disabled');
      return null;
    }

    try {
      // Validate file exists
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Not a file');
      }

      // Check file size
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB > config.maxFileSizeMB) {
        throw new Error(`File too large: ${sizeMB.toFixed(2)}MB > ${config.maxFileSizeMB}MB`);
      }

      // Check file type
      const ext = path.extname(filePath).toLowerCase();
      if (config.blockedFileTypes.includes(ext)) {
        throw new Error(`File type blocked: ${ext}`);
      }

      // Compute checksum
      const checksum = await this.computeChecksum(filePath);

      // Determine MIME type
      const mimeType = this.getMimeType(ext);

      const transfer: Transfer = {
        id: crypto.randomUUID(),
        type: 'send',
        status: config.requireApproval ? 'pending' : 'queued',
        fileName: path.basename(filePath),
        fileSize: stats.size,
        mimeType,
        checksum,
        sourcePath: filePath,
        encrypted: options?.encrypt ?? config.encryptTransfers,
        progress: 0,
        bytesTransferred: 0,
        startedAt: Date.now(),
        metadata: {
          sender: os.hostname(),
          receiver: options?.recipient,
          timestamp: Date.now(),
        },
      };

      this.activeTransfers.set(transfer.id, transfer);
      this.saveTransfer(transfer);
      this.logAction(transfer.id, 'initiate', `Initiated transfer: ${transfer.fileName}`, true);

      log.info(`[TransferHub] Transfer initiated: ${transfer.id}`);
      return transfer;
    } catch (error) {
      log.error('[TransferHub] Failed to initiate transfer:', error);
      return null;
    }
  }

  // Prepare file for transfer (encryption, chunking)
  async prepareTransfer(transferId: string): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.type !== 'send') {
      return false;
    }

    if (transfer.status !== 'queued') {
      log.warn(`[TransferHub] Cannot prepare transfer in status: ${transfer.status}`);
      return false;
    }

    try {
      transfer.status = 'transferring';
      this.saveTransfer(transfer);

      if (transfer.encrypted && this.transferKey) {
        // Encrypt the file for transfer
        await this.encryptFile(transfer);
      }

      this.logAction(transferId, 'prepare', 'Transfer prepared for sending', true);
      return true;
    } catch (error) {
      transfer.status = 'failed';
      transfer.error = (error as Error).message;
      this.saveTransfer(transfer);
      this.logAction(transferId, 'prepare', `Preparation failed: ${transfer.error}`, false);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECEIVE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  async receiveTransferRequest(request: TransferRequest): Promise<Transfer | null> {
    const config = this.getConfig();
    
    if (!config.enabled) {
      log.warn('[TransferHub] Transfers are disabled');
      return null;
    }

    // Check file size
    const sizeMB = request.fileSize / (1024 * 1024);
    if (sizeMB > config.maxFileSizeMB) {
      log.warn(`[TransferHub] Rejecting transfer: file too large`);
      return null;
    }

    // Check file type
    const ext = path.extname(request.fileName).toLowerCase();
    if (config.blockedFileTypes.includes(ext)) {
      log.warn(`[TransferHub] Rejecting transfer: blocked file type ${ext}`);
      return null;
    }

    const quarantineFile = path.join(
      this.quarantinePath, 
      `${crypto.randomUUID()}${ext}`
    );

    const transfer: Transfer = {
      id: crypto.randomUUID(),
      type: 'receive',
      status: config.requireApproval ? 'pending' : 'queued',
      fileName: request.fileName,
      fileSize: request.fileSize,
      mimeType: request.mimeType,
      checksum: request.checksum,
      quarantinePath: quarantineFile,
      encrypted: request.encrypted,
      progress: 0,
      bytesTransferred: 0,
      startedAt: Date.now(),
      metadata: {
        sender: request.sender,
        receiver: os.hostname(),
        timestamp: Date.now(),
      },
    };

    this.activeTransfers.set(transfer.id, transfer);
    this.saveTransfer(transfer);
    this.logAction(transfer.id, 'receive-request', `Received transfer request: ${transfer.fileName}`, true);

    return transfer;
  }

  // Write received chunk to quarantine
  async writeChunk(
    transferId: string,
    chunkIndex: number,
    data: Buffer
  ): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.type !== 'receive') {
      return false;
    }

    try {
      const filePath = transfer.quarantinePath!;
      
      // Create or append to file
      const flag = chunkIndex === 0 ? 'w' : 'a';
      await fs.promises.writeFile(filePath, data, { flag });

      transfer.bytesTransferred += data.length;
      transfer.progress = Math.round((transfer.bytesTransferred / transfer.fileSize) * 100);
      transfer.status = 'transferring';
      this.saveTransfer(transfer);

      // Emit progress
      this.emitProgress(transfer);

      return true;
    } catch (error) {
      log.error('[TransferHub] Failed to write chunk:', error);
      return false;
    }
  }

  // Complete receive and move to quarantine validation
  async completeReceive(transferId: string): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.type !== 'receive') {
      return false;
    }

    try {
      transfer.status = 'quarantined';
      transfer.progress = 100;
      this.saveTransfer(transfer);
      this.logAction(transferId, 'quarantine', 'File received and quarantined', true);

      // Auto-validate if configured
      const config = this.getConfig();
      if (config.autoQuarantine) {
        setTimeout(() => this.validateQuarantined(transferId), 100);
      }

      return true;
    } catch (error) {
      transfer.status = 'failed';
      transfer.error = (error as Error).message;
      this.saveTransfer(transfer);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUARANTINE & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  async validateQuarantined(transferId: string): Promise<QuarantineResult> {
    const transfer = this.activeTransfers.get(transferId);
    const checks: QuarantineCheck[] = [];

    if (!transfer || transfer.status !== 'quarantined') {
      return {
        transferId,
        passed: false,
        checks: [{ name: 'status', passed: false, details: 'Invalid transfer state' }],
      };
    }

    transfer.status = 'validating';
    this.saveTransfer(transfer);

    try {
      const filePath = transfer.quarantinePath!;

      // Check 1: File exists
      const exists = fs.existsSync(filePath);
      checks.push({
        name: 'existence',
        passed: exists,
        details: exists ? 'File exists in quarantine' : 'File missing from quarantine',
      });

      if (!exists) {
        throw new Error('File missing');
      }

      // Check 2: Size verification
      const stats = await fs.promises.stat(filePath);
      const sizeMatch = stats.size === transfer.fileSize;
      checks.push({
        name: 'size',
        passed: sizeMatch,
        details: sizeMatch 
          ? `Size verified: ${stats.size} bytes` 
          : `Size mismatch: ${stats.size} vs ${transfer.fileSize}`,
      });

      // Check 3: Checksum verification
      const actualChecksum = await this.computeChecksum(filePath);
      const checksumMatch = actualChecksum === transfer.checksum;
      checks.push({
        name: 'integrity',
        passed: checksumMatch,
        details: checksumMatch 
          ? 'Checksum verified' 
          : 'Checksum mismatch - file may be corrupted',
      });

      // Check 4: File type validation (basic)
      const ext = path.extname(transfer.fileName).toLowerCase();
      const config = this.getConfig();
      const typeAllowed = !config.blockedFileTypes.includes(ext);
      checks.push({
        name: 'type',
        passed: typeAllowed,
        details: typeAllowed ? `File type allowed: ${ext}` : `File type blocked: ${ext}`,
      });

      // Check 5: Decrypt if needed
      if (transfer.encrypted && this.transferKey) {
        try {
          await this.decryptFile(transfer);
          checks.push({
            name: 'decryption',
            passed: true,
            details: 'File decrypted successfully',
          });
        } catch (error) {
          checks.push({
            name: 'decryption',
            passed: false,
            details: `Decryption failed: ${(error as Error).message}`,
          });
        }
      }

      const allPassed = checks.every(c => c.passed);
      transfer.status = allPassed ? 'ready' : 'failed';
      if (!allPassed) {
        transfer.error = 'Validation failed';
      }
      this.saveTransfer(transfer);

      this.logAction(
        transferId, 
        'validate', 
        `Validation ${allPassed ? 'passed' : 'failed'}`, 
        allPassed
      );

      return { transferId, passed: allPassed, checks };
    } catch (error) {
      transfer.status = 'failed';
      transfer.error = (error as Error).message;
      this.saveTransfer(transfer);

      return {
        transferId,
        passed: false,
        checks: [...checks, { name: 'error', passed: false, details: (error as Error).message }],
      };
    }
  }

  // Move validated file to final destination
  async approveAndMove(
    transferId: string,
    destinationPath: string
  ): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.status !== 'ready') {
      log.warn('[TransferHub] Cannot approve transfer - not ready');
      return false;
    }

    try {
      const source = transfer.quarantinePath!;
      
      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Move file
      await fs.promises.rename(source, destinationPath);

      transfer.destinationPath = destinationPath;
      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      this.saveTransfer(transfer);
      this.activeTransfers.delete(transferId);

      this.logAction(transferId, 'complete', `Moved to: ${destinationPath}`, true);
      log.info(`[TransferHub] Transfer completed: ${transfer.fileName}`);

      return true;
    } catch (error) {
      transfer.error = (error as Error).message;
      this.saveTransfer(transfer);
      this.logAction(transferId, 'move', `Failed: ${transfer.error}`, false);
      return false;
    }
  }

  // Reject and delete quarantined file
  async rejectTransfer(transferId: string): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return false;

    try {
      // Delete quarantined file if exists
      if (transfer.quarantinePath && fs.existsSync(transfer.quarantinePath)) {
        await fs.promises.unlink(transfer.quarantinePath);
      }

      transfer.status = 'cancelled';
      this.saveTransfer(transfer);
      this.activeTransfers.delete(transferId);

      this.logAction(transferId, 'reject', 'Transfer rejected and deleted', true);
      return true;
    } catch (error) {
      log.error('[TransferHub] Failed to reject transfer:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVAL
  // ─────────────────────────────────────────────────────────────────────────

  async approveTransfer(transferId: string): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.status !== 'pending') {
      return false;
    }

    transfer.status = 'queued';
    this.saveTransfer(transfer);
    this.logAction(transferId, 'approve', 'Transfer approved', true);

    return true;
  }

  // Request user approval via dialog
  async requestApproval(transfer: Transfer, parentWindow?: BrowserWindow): Promise<boolean> {
    const sizeMB = (transfer.fileSize / (1024 * 1024)).toFixed(2);
    const message = transfer.type === 'receive'
      ? `Accept incoming file?\n\nFile: ${transfer.fileName}\nSize: ${sizeMB} MB\nFrom: ${transfer.metadata.sender || 'Unknown'}`
      : `Send file?\n\nFile: ${transfer.fileName}\nSize: ${sizeMB} MB\nTo: ${transfer.metadata.receiver || 'Unknown'}`;

    const result = await dialog.showMessageBox(parentWindow || BrowserWindow.getFocusedWindow()!, {
      type: 'question',
      buttons: ['Accept', 'Reject'],
      defaultId: 1,
      cancelId: 1,
      title: 'Transfer Request',
      message,
      detail: transfer.encrypted ? 'This transfer is encrypted.' : 'This transfer is not encrypted.',
    });

    const approved = result.response === 0;
    
    if (approved) {
      await this.approveTransfer(transfer.id);
    } else {
      await this.rejectTransfer(transfer.id);
    }

    return approved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ENCRYPTION
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptFile(transfer: Transfer): Promise<void> {
    if (!this.transferKey) throw new Error('No transfer key available');

    const sourcePath = transfer.sourcePath!;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.transferKey, iv);

    const input = fs.createReadStream(sourcePath);
    const encryptedPath = `${sourcePath}.enc`;
    const output = fs.createWriteStream(encryptedPath);

    // Write IV first
    output.write(iv);

    await new Promise<void>((resolve, reject) => {
      input.pipe(cipher).pipe(output);
      output.on('finish', () => {
        // Append auth tag
        fs.appendFileSync(encryptedPath, cipher.getAuthTag());
        resolve();
      });
      output.on('error', reject);
    });

    // Update transfer with encrypted path
    transfer.sourcePath = encryptedPath;
  }

  private async decryptFile(transfer: Transfer): Promise<void> {
    if (!this.transferKey) throw new Error('No transfer key available');

    const encryptedPath = transfer.quarantinePath!;
    const decryptedPath = encryptedPath.replace('.enc', '');

    const fileData = await fs.promises.readFile(encryptedPath);
    
    // Extract IV (first 12 bytes) and auth tag (last 16 bytes)
    const iv = fileData.slice(0, 12);
    const authTag = fileData.slice(-16);
    const encrypted = fileData.slice(12, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.transferKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    await fs.promises.writeFile(decryptedPath, decrypted);

    // Update quarantine path
    transfer.quarantinePath = decryptedPath;
    
    // Remove encrypted file
    await fs.promises.unlink(encryptedPath);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  private async computeChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip',
      '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private emitProgress(transfer: Transfer): void {
    const callback = this.progressCallbacks.get(transfer.id);
    if (callback) {
      const elapsed = Date.now() - transfer.startedAt;
      const speed = transfer.bytesTransferred / (elapsed / 1000);
      const remaining = transfer.fileSize - transfer.bytesTransferred;
      const eta = speed > 0 ? remaining / speed : 0;

      callback({
        transferId: transfer.id,
        progress: transfer.progress,
        bytesTransferred: transfer.bytesTransferred,
        speed,
        eta,
      });
    }
  }

  onProgress(transferId: string, callback: (progress: TransferProgress) => void): void {
    this.progressCallbacks.set(transferId, callback);
  }

  removeProgressCallback(transferId: string): void {
    this.progressCallbacks.delete(transferId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DATA ACCESS
  // ─────────────────────────────────────────────────────────────────────────

  getConfig(): TransferConfig {
    return transferStore.get('config');
  }

  updateConfig(updates: Partial<TransferConfig>): TransferConfig {
    const config = this.getConfig();
    const updated = { ...config, ...updates };
    transferStore.set('config', updated);
    return updated;
  }

  getTransfer(transferId: string): Transfer | null {
    return this.activeTransfers.get(transferId) || null;
  }

  getActiveTransfers(): Transfer[] {
    return Array.from(this.activeTransfers.values());
  }

  getAllTransfers(): Transfer[] {
    return Object.values(transferStore.get('transfers'));
  }

  getTransferLog(limit = 100): TransferLogEntry[] {
    return transferStore.get('transferLog').slice(0, limit);
  }

  private saveTransfer(transfer: Transfer): void {
    this.activeTransfers.set(transfer.id, transfer);
    const transfers = transferStore.get('transfers');
    transfers[transfer.id] = transfer;
    transferStore.set('transfers', transfers);
  }

  private logAction(transferId: string, action: string, details: string, success: boolean): void {
    const entry: TransferLogEntry = {
      timestamp: Date.now(),
      transferId,
      action,
      details,
      success,
    };

    const log = transferStore.get('transferLog');
    log.unshift(entry);
    if (log.length > 1000) log.splice(1000);
    transferStore.set('transferLog', log);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────

  async cleanupQuarantine(olderThanDays = 7): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    try {
      const files = await fs.promises.readdir(this.quarantinePath);
      
      for (const file of files) {
        const filePath = path.join(this.quarantinePath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.mtimeMs < cutoff) {
          await fs.promises.unlink(filePath);
          cleaned++;
        }
      }

      log.info(`[TransferHub] Cleaned ${cleaned} old quarantine files`);
    } catch (error) {
      log.error('[TransferHub] Quarantine cleanup failed:', error);
    }

    return cleaned;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const SecureTransferHub = new SecureTransferHubClass();
export default SecureTransferHub;
