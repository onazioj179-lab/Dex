// ═══════════════════════════════════════════════════════════════════════════
// DEX - Transfer Controller
// Phase 12: Data/File/Media Sharing - Explicit, Transparent Transfers
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as net from 'net';
import Store from 'electron-store';
import log from 'electron-log';
import { systemMapController, ActiveTransfer, SystemHealth } from './SystemMapController';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TransferRequest {
  type: 'file' | 'folder' | 'media' | 'session';
  sourcePath: string;
  destinationPath?: string;
  destinationDevice?: string;
  channel: 'local' | 'wifi' | 'bluetooth';
  direction: 'send' | 'receive';
  metadata?: Record<string, any>;
}

export interface TransferProgress {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: ActiveTransfer['status'];
}

export interface TransferPermission {
  id: string;
  type: 'file' | 'folder' | 'media' | 'all';
  channel: 'wifi' | 'bluetooth' | 'all';
  direction: 'send' | 'receive' | 'both';
  scope: 'one-time' | 'session' | 'persistent';
  grantedAt: number;
  expiresAt?: number;
  deviceId?: string;
}

export interface TransferConfig {
  maxConcurrent: number;
  chunkSize: number; // bytes
  throttleOnLoad: boolean;
  autoResume: boolean;
  verifyIntegrity: boolean;
  defaultPort: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

const store = new Store<{
  transferConfig: TransferConfig;
  permissions: TransferPermission[];
  pendingTransfers: TransferRequest[];
}>({
  defaults: {
    transferConfig: {
      maxConcurrent: 2,
      chunkSize: 65536, // 64KB
      throttleOnLoad: true,
      autoResume: false,
      verifyIntegrity: true,
      defaultPort: 47632
    },
    permissions: [],
    pendingTransfers: []
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class TransferController {
  private activeTransfers: Map<string, {
    request: TransferRequest;
    stream?: fs.ReadStream | fs.WriteStream;
    socket?: net.Socket;
    paused: boolean;
    bytesTransferred: number;
    totalBytes: number;
    startTime: number;
  }> = new Map();
  
  private server: net.Server | null = null;
  private isReceiving = false;
  private mainWindow: BrowserWindow | null = null;
  private throttleMultiplier = 1;

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get transfer config
    ipcMain.handle('transfer:getConfig', () => {
      return store.get('transferConfig');
    });

    // Update transfer config
    ipcMain.handle('transfer:setConfig', async (_, config: Partial<TransferConfig>) => {
      const current = store.get('transferConfig');
      store.set('transferConfig', { ...current, ...config });
      return { success: true };
    });

    // Initiate local file copy/move
    ipcMain.handle('transfer:localCopy', async (_, request: TransferRequest) => {
      return await this.initiateLocalTransfer(request, 'copy');
    });

    ipcMain.handle('transfer:localMove', async (_, request: TransferRequest) => {
      return await this.initiateLocalTransfer(request, 'move');
    });

    // Send file over network
    ipcMain.handle('transfer:send', async (_, request: TransferRequest) => {
      return await this.initiateSend(request);
    });

    // Start receiving server
    ipcMain.handle('transfer:startReceiving', async (_, port?: number) => {
      return await this.startReceivingServer(port);
    });

    // Stop receiving server
    ipcMain.handle('transfer:stopReceiving', () => {
      return this.stopReceivingServer();
    });

    // Pause transfer
    ipcMain.handle('transfer:pause', async (_, transferId: string) => {
      return this.pauseTransfer(transferId);
    });

    // Resume transfer
    ipcMain.handle('transfer:resume', async (_, transferId: string) => {
      return this.resumeTransfer(transferId);
    });

    // Cancel transfer
    ipcMain.handle('transfer:cancel', async (_, transferId: string) => {
      return this.cancelTransfer(transferId);
    });

    // Get active transfers
    ipcMain.handle('transfer:getActive', () => {
      return this.getActiveTransfers();
    });

    // Get transfer progress
    ipcMain.handle('transfer:getProgress', (_, transferId: string) => {
      return this.getTransferProgress(transferId);
    });

    // Permission management
    ipcMain.handle('transfer:getPermissions', () => {
      return store.get('permissions');
    });

    ipcMain.handle('transfer:grantPermission', async (_, permission: Omit<TransferPermission, 'id' | 'grantedAt'>) => {
      return this.grantPermission(permission);
    });

    ipcMain.handle('transfer:revokePermission', async (_, permissionId: string) => {
      return this.revokePermission(permissionId);
    });

    ipcMain.handle('transfer:revokeAllPermissions', () => {
      store.set('permissions', []);
      return { success: true };
    });

    // Browse for file/folder
    ipcMain.handle('transfer:browseFile', async () => {
      return await this.browseForFile();
    });

    ipcMain.handle('transfer:browseFolder', async () => {
      return await this.browseForFolder();
    });

    // Get file info
    ipcMain.handle('transfer:getFileInfo', async (_, filePath: string) => {
      return await this.getFileInfo(filePath);
    });

    // Calculate folder size
    ipcMain.handle('transfer:getFolderSize', async (_, folderPath: string) => {
      return await this.getFolderSize(folderPath);
    });

    log.info('Transfer handlers registered');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL TRANSFERS
  // ═══════════════════════════════════════════════════════════════════════════

  async initiateLocalTransfer(
    request: TransferRequest, 
    mode: 'copy' | 'move'
  ): Promise<{ success: boolean; transferId?: string; error?: string }> {
    try {
      // Validate source exists
      const stats = await fsp.stat(request.sourcePath);
      const isDirectory = stats.isDirectory();
      const totalBytes = isDirectory 
        ? await this.calculateFolderSize(request.sourcePath)
        : stats.size;

      // Check system health
      const health = await systemMapController.getSystemHealth();
      const capacity = systemMapController.evaluateTransferCapacity(health, totalBytes);
      
      if (!capacity.canTransfer) {
        return { success: false, error: capacity.reason };
      }

      // Set throttle based on recommendation
      this.throttleMultiplier = capacity.recommendation === 'throttle' ? 0.5 : 1;

      // Create transfer record
      const transfer = systemMapController.addTransfer({
        name: path.basename(request.sourcePath),
        type: isDirectory ? 'folder' : 'file',
        direction: 'send',
        source: request.sourcePath,
        destination: request.destinationPath || '',
        sizeBytes: totalBytes,
        transferredBytes: 0,
        status: 'active',
        startedAt: Date.now()
      });

      // Store transfer state
      this.activeTransfers.set(transfer.id, {
        request,
        paused: false,
        bytesTransferred: 0,
        totalBytes,
        startTime: Date.now()
      });

      // Execute transfer
      if (isDirectory) {
        await this.copyDirectory(
          request.sourcePath, 
          request.destinationPath!, 
          transfer.id,
          mode === 'move'
        );
      } else {
        await this.copyFile(
          request.sourcePath,
          request.destinationPath!,
          transfer.id,
          mode === 'move'
        );
      }

      // Complete transfer
      systemMapController.completeTransfer(transfer.id, 'completed');
      this.activeTransfers.delete(transfer.id);

      return { success: true, transferId: transfer.id };
    } catch (error) {
      log.error('Local transfer failed:', error);
      return { success: false, error: String(error) };
    }
  }

  private async copyFile(
    source: string, 
    destination: string, 
    transferId: string,
    deleteSource = false
  ): Promise<void> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) throw new Error('Transfer not found');

    // Ensure destination directory exists
    await fsp.mkdir(path.dirname(destination), { recursive: true });

    const config = store.get('transferConfig');
    
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(source, { highWaterMark: config.chunkSize });
      const writeStream = fs.createWriteStream(destination);
      
      transfer.stream = readStream;

      readStream.on('data', (chunk) => {
        const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        transfer.bytesTransferred += chunkBuffer.length;
        
        // Throttle if needed
        if (config.throttleOnLoad && this.throttleMultiplier < 1) {
          readStream.pause();
          setTimeout(() => {
            if (!transfer.paused) readStream.resume();
          }, Math.floor(10 / this.throttleMultiplier));
        }

        // Update progress
        this.updateTransferProgress(transferId);
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      
      writeStream.on('finish', async () => {
        if (deleteSource) {
          await fsp.unlink(source);
        }
        resolve();
      });

      readStream.pipe(writeStream);
    });
  }

  private async copyDirectory(
    source: string,
    destination: string,
    transferId: string,
    deleteSource = false
  ): Promise<void> {
    await fsp.mkdir(destination, { recursive: true });
    
    const entries = await fsp.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      
      // Check if paused/cancelled
      const transfer = this.activeTransfers.get(transferId);
      if (!transfer || transfer.paused) {
        throw new Error('Transfer cancelled or paused');
      }
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath, transferId, deleteSource);
      } else {
        await this.copyFile(srcPath, destPath, transferId, deleteSource);
      }
    }

    if (deleteSource) {
      await fsp.rm(source, { recursive: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK TRANSFERS
  // ═══════════════════════════════════════════════════════════════════════════

  async initiateSend(request: TransferRequest): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    try {
      // For now, implement local network transfer via TCP
      if (request.channel !== 'wifi') {
        return { success: false, error: 'Only WiFi transfers are currently supported' };
      }

      const stats = await fsp.stat(request.sourcePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Folder network transfer not yet implemented' };
      }

      // Check permissions
      if (!this.hasPermission('file', 'wifi', 'send', request.destinationDevice)) {
        return { success: false, error: 'Transfer permission required' };
      }

      // Implement actual network transfer here
      // This would connect to a receiving server on another device
      
      return { success: false, error: 'Network transfer pending implementation' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async startReceivingServer(port?: number): Promise<{
    success: boolean;
    port?: number;
    error?: string;
  }> {
    if (this.server) {
      return { success: false, error: 'Server already running' };
    }

    const config = store.get('transferConfig');
    const serverPort = port || config.defaultPort;

    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        this.handleIncomingConnection(socket);
      });

      this.server.on('error', (error) => {
        log.error('Transfer server error:', error);
        resolve({ success: false, error: String(error) });
      });

      this.server.listen(serverPort, () => {
        this.isReceiving = true;
        log.info(`Transfer server listening on port ${serverPort}`);
        resolve({ success: true, port: serverPort });
      });
    });
  }

  stopReceivingServer(): { success: boolean } {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.isReceiving = false;
      log.info('Transfer server stopped');
    }
    return { success: true };
  }

  private handleIncomingConnection(socket: net.Socket): void {
    // Handle incoming file transfer
    // This would implement the receive protocol
    log.info('Incoming transfer connection from:', socket.remoteAddress);
    
    // For security, require explicit acceptance
    // This would emit an event to the UI for user approval
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFER CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  pauseTransfer(transferId: string): { success: boolean; error?: string } {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    transfer.paused = true;
    if (transfer.stream && 'pause' in transfer.stream) {
      (transfer.stream as fs.ReadStream).pause();
    }
    
    systemMapController.updateTransfer(transferId, { status: 'paused' });
    return { success: true };
  }

  resumeTransfer(transferId: string): { success: boolean; error?: string } {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    transfer.paused = false;
    if (transfer.stream && 'resume' in transfer.stream) {
      (transfer.stream as fs.ReadStream).resume();
    }
    
    systemMapController.updateTransfer(transferId, { status: 'active' });
    return { success: true };
  }

  cancelTransfer(transferId: string): { success: boolean; error?: string } {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    transfer.paused = true;
    if (transfer.stream) {
      transfer.stream.destroy();
    }
    if (transfer.socket) {
      transfer.socket.destroy();
    }

    systemMapController.completeTransfer(transferId, 'cancelled');
    this.activeTransfers.delete(transferId);
    
    return { success: true };
  }

  getActiveTransfers(): TransferProgress[] {
    const transfers: TransferProgress[] = [];
    
    for (const [id, transfer] of this.activeTransfers) {
      const elapsed = (Date.now() - transfer.startTime) / 1000;
      const speed = elapsed > 0 ? transfer.bytesTransferred / elapsed : 0;
      const remaining = transfer.totalBytes - transfer.bytesTransferred;
      const eta = speed > 0 ? remaining / speed : 0;

      transfers.push({
        transferId: id,
        bytesTransferred: transfer.bytesTransferred,
        totalBytes: transfer.totalBytes,
        percent: Math.round((transfer.bytesTransferred / transfer.totalBytes) * 100),
        speed: Math.round(speed),
        eta: Math.round(eta),
        status: transfer.paused ? 'paused' : 'active'
      });
    }

    return transfers;
  }

  getTransferProgress(transferId: string): TransferProgress | null {
    const transfers = this.getActiveTransfers();
    return transfers.find(t => t.transferId === transferId) || null;
  }

  private updateTransferProgress(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return;

    const elapsed = (Date.now() - transfer.startTime) / 1000;
    const speed = elapsed > 0 ? transfer.bytesTransferred / elapsed : 0;
    const remaining = transfer.totalBytes - transfer.bytesTransferred;

    systemMapController.updateTransfer(transferId, {
      transferredBytes: transfer.bytesTransferred,
      speed: Math.round(speed),
      eta: speed > 0 ? Math.round(remaining / speed) : undefined
    });

    // Emit progress to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('transfer:progress', {
        transferId,
        bytesTransferred: transfer.bytesTransferred,
        totalBytes: transfer.totalBytes,
        percent: Math.round((transfer.bytesTransferred / transfer.totalBytes) * 100),
        speed: Math.round(speed)
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  grantPermission(permission: Omit<TransferPermission, 'id' | 'grantedAt'>): TransferPermission {
    const newPermission: TransferPermission = {
      ...permission,
      id: `perm_${Date.now()}`,
      grantedAt: Date.now()
    };

    if (permission.scope === 'one-time') {
      newPermission.expiresAt = Date.now() + 300000; // 5 minutes
    } else if (permission.scope === 'session') {
      newPermission.expiresAt = Date.now() + 86400000; // 24 hours
    }

    const permissions = store.get('permissions');
    permissions.push(newPermission);
    store.set('permissions', permissions);

    return newPermission;
  }

  revokePermission(permissionId: string): { success: boolean } {
    const permissions = store.get('permissions').filter(p => p.id !== permissionId);
    store.set('permissions', permissions);
    return { success: true };
  }

  hasPermission(
    type: TransferPermission['type'],
    channel: TransferPermission['channel'],
    direction: 'send' | 'receive',
    deviceId?: string
  ): boolean {
    const permissions = store.get('permissions');
    const now = Date.now();

    return permissions.some(p => {
      // Check expiration
      if (p.expiresAt && p.expiresAt < now) return false;

      // Check type match
      if (p.type !== 'all' && p.type !== type) return false;

      // Check channel match
      if (p.channel !== 'all' && p.channel !== channel) return false;

      // Check direction match
      if (p.direction !== 'both' && p.direction !== direction) return false;

      // Check device match (if specified)
      if (p.deviceId && deviceId && p.deviceId !== deviceId) return false;

      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  async browseForFile(): Promise<{ path?: string; name?: string; size?: number }> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return {};

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      title: 'Select File to Transfer'
    });

    if (result.canceled || result.filePaths.length === 0) return {};

    const filePath = result.filePaths[0];
    const stats = await fsp.stat(filePath);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size
    };
  }

  async browseForFolder(): Promise<{ path?: string; name?: string; size?: number }> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return {};

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Folder to Transfer'
    });

    if (result.canceled || result.filePaths.length === 0) return {};

    const folderPath = result.filePaths[0];
    const size = await this.calculateFolderSize(folderPath);

    return {
      path: folderPath,
      name: path.basename(folderPath),
      size
    };
  }

  async getFileInfo(filePath: string): Promise<{
    name: string;
    size: number;
    type: string;
    modified: Date;
    isDirectory: boolean;
  } | null> {
    try {
      const stats = await fsp.stat(filePath);
      return {
        name: path.basename(filePath),
        size: stats.size,
        type: path.extname(filePath).toLowerCase().slice(1) || 'unknown',
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    } catch {
      return null;
    }
  }

  async getFolderSize(folderPath: string): Promise<{ size: number; fileCount: number }> {
    const size = await this.calculateFolderSize(folderPath);
    const count = await this.countFiles(folderPath);
    return { size, fileCount: count };
  }

  private async calculateFolderSize(folderPath: string): Promise<number> {
    let totalSize = 0;
    const entries = await fsp.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await this.calculateFolderSize(entryPath);
      } else {
        const stats = await fsp.stat(entryPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  private async countFiles(folderPath: string): Promise<number> {
    let count = 0;
    const entries = await fsp.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await this.countFiles(path.join(folderPath, entry.name));
      } else {
        count++;
      }
    }

    return count;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  shutdown(): void {
    // Cancel all active transfers
    for (const [id] of this.activeTransfers) {
      this.cancelTransfer(id);
    }
    
    // Stop server
    this.stopReceivingServer();
  }
}

export const transferController = new TransferController();
