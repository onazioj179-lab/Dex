// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Device Interface: External device connectivity
// USB/USB-C device detection, file transfer, and OS-approved device integration
// =============================================================================

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app, shell } from 'electron';

// =============================================================================
// DEVICE TYPES
// =============================================================================

export enum DeviceType {
  USB_STORAGE = 'usb_storage',
  PHONE = 'phone',
  CAMERA = 'camera',
  AUDIO = 'audio',
  HID = 'hid',
  PRINTER = 'printer',
  NETWORK = 'network',
  UNKNOWN = 'unknown',
}

export enum DeviceStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  MOUNTING = 'mounting',
  UNMOUNTING = 'unmounting',
  ERROR = 'error',
  BUSY = 'busy',
}

export enum TransferMode {
  MTP = 'mtp',           // Media Transfer Protocol (phones, cameras)
  MSC = 'msc',           // Mass Storage Class (USB drives)
  PTP = 'ptp',           // Picture Transfer Protocol (cameras)
  NATIVE = 'native',     // Native OS file access
}

export interface ExternalDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  transferMode: TransferMode;
  mountPoint?: string;
  capacity?: number;
  available?: number;
  vendor?: string;
  product?: string;
  serialNumber?: string;
  connectedAt: number;
  lastActivity: number;
}

export interface DeviceFile {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  type: string;
}

// =============================================================================
// DEVICE DETECTION (OS-Level Integration)
// =============================================================================

class DeviceDetector {
  private devices: Map<string, ExternalDevice> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 2000;
  private events = new EventEmitter();
  
  constructor() {
    // Start polling for devices
    this.startPolling();
  }
  
  private startPolling(): void {
    // Initial scan
    this.scanDevices();
    
    // Periodic scan
    this.pollInterval = setInterval(() => {
      this.scanDevices();
    }, this.POLL_INTERVAL_MS);
  }
  
  private async scanDevices(): Promise<void> {
    const detectedDevices = await this.detectDevices();
    const currentIds = new Set(detectedDevices.map(d => d.id));
    
    // Check for disconnected devices
    for (const [id, device] of this.devices) {
      if (!currentIds.has(id)) {
        device.status = DeviceStatus.DISCONNECTED;
        this.events.emit('device:disconnected', device);
        this.devices.delete(id);
      }
    }
    
    // Check for new devices
    for (const device of detectedDevices) {
      if (!this.devices.has(device.id)) {
        this.devices.set(device.id, device);
        this.events.emit('device:connected', device);
      }
    }
  }
  
  private async detectDevices(): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];
    
    // Windows: Check for removable drives
    if (process.platform === 'win32') {
      devices.push(...await this.detectWindowsDevices());
    }
    // macOS: Check for volumes
    else if (process.platform === 'darwin') {
      devices.push(...await this.detectMacDevices());
    }
    // Linux: Check /media and /mnt
    else if (process.platform === 'linux') {
      devices.push(...await this.detectLinuxDevices());
    }
    
    return devices;
  }
  
  private async detectWindowsDevices(): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];
    
    // Check all drive letters
    const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    
    for (const letter of letters) {
      const drivePath = `${letter}:\\`;
      
      try {
        const stat = await fs.promises.stat(drivePath);
        if (stat) {
          // Get drive info
          const device: ExternalDevice = {
            id: `drive-${letter}`,
            name: `Drive ${letter}:`,
            type: DeviceType.USB_STORAGE,
            status: DeviceStatus.CONNECTED,
            transferMode: TransferMode.MSC,
            mountPoint: drivePath,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
          };
          
          // Try to get capacity info
          try {
            const info = await this.getDriveInfo(drivePath);
            device.capacity = info.total;
            device.available = info.available;
          } catch {
            // Ignore capacity errors
          }
          
          devices.push(device);
        }
      } catch {
        // Drive doesn't exist, skip
      }
    }
    
    return devices;
  }
  
  private async detectMacDevices(): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];
    const volumesPath = '/Volumes';
    
    try {
      const volumes = await fs.promises.readdir(volumesPath);
      
      for (const volume of volumes) {
        // Skip system volume
        if (volume === 'Macintosh HD') continue;
        
        const volumePath = path.join(volumesPath, volume);
        
        try {
          const stat = await fs.promises.stat(volumePath);
          
          if (stat.isDirectory()) {
            devices.push({
              id: `volume-${volume}`,
              name: volume,
              type: DeviceType.USB_STORAGE,
              status: DeviceStatus.CONNECTED,
              transferMode: TransferMode.MSC,
              mountPoint: volumePath,
              connectedAt: Date.now(),
              lastActivity: Date.now(),
            });
          }
        } catch {
          // Skip inaccessible volumes
        }
      }
    } catch {
      // Volumes directory not accessible
    }
    
    return devices;
  }
  
  private async detectLinuxDevices(): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];
    const mountPaths = ['/media', '/mnt', `/media/${process.env.USER}`];
    
    for (const mountPath of mountPaths) {
      try {
        const entries = await fs.promises.readdir(mountPath);
        
        for (const entry of entries) {
          const entryPath = path.join(mountPath, entry);
          
          try {
            const stat = await fs.promises.stat(entryPath);
            
            if (stat.isDirectory()) {
              devices.push({
                id: `mount-${entry}`,
                name: entry,
                type: DeviceType.USB_STORAGE,
                status: DeviceStatus.CONNECTED,
                transferMode: TransferMode.MSC,
                mountPoint: entryPath,
                connectedAt: Date.now(),
                lastActivity: Date.now(),
              });
            }
          } catch {
            // Skip inaccessible mounts
          }
        }
      } catch {
        // Mount path doesn't exist or not accessible
      }
    }
    
    return devices;
  }
  
  private async getDriveInfo(drivePath: string): Promise<{ total: number; available: number }> {
    // Simple check using fs
    const stat = await fs.promises.statfs(drivePath);
    return {
      total: stat.blocks * stat.bsize,
      available: stat.bavail * stat.bsize,
    };
  }
  
  on(event: string, callback: (...args: unknown[]) => void): void {
    this.events.on(event, callback);
  }
  
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }
  
  getDevices(): ExternalDevice[] {
    return Array.from(this.devices.values());
  }
  
  getDevice(id: string): ExternalDevice | undefined {
    return this.devices.get(id);
  }
  
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// =============================================================================
// DEVICE FILE BROWSER
// =============================================================================

class DeviceFileBrowser {
  async listFiles(device: ExternalDevice, relativePath = ''): Promise<DeviceFile[]> {
    if (!device.mountPoint) {
      throw new Error('Device has no mount point');
    }
    
    const fullPath = path.join(device.mountPoint, relativePath);
    const files: DeviceFile[] = [];
    
    try {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue;
        
        const entryPath = path.join(fullPath, entry.name);
        
        try {
          const stat = await fs.promises.stat(entryPath);
          
          files.push({
            name: entry.name,
            path: path.join(relativePath, entry.name),
            isDirectory: entry.isDirectory(),
            size: stat.size,
            modified: stat.mtime,
            type: entry.isDirectory() ? 'folder' : this.getFileType(entry.name),
          });
        } catch {
          // Skip files we can't stat
        }
      }
    } catch (err) {
      throw new Error(`Failed to list files: ${err}`);
    }
    
    // Sort: folders first, then by name
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    return files;
  }
  
  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const types: Record<string, string> = {
      // Images
      '.jpg': 'image',
      '.jpeg': 'image',
      '.png': 'image',
      '.gif': 'image',
      '.webp': 'image',
      '.svg': 'image',
      '.bmp': 'image',
      '.ico': 'image',
      // Videos
      '.mp4': 'video',
      '.mkv': 'video',
      '.avi': 'video',
      '.mov': 'video',
      '.wmv': 'video',
      '.webm': 'video',
      // Audio
      '.mp3': 'audio',
      '.wav': 'audio',
      '.flac': 'audio',
      '.aac': 'audio',
      '.ogg': 'audio',
      '.m4a': 'audio',
      // Documents
      '.pdf': 'document',
      '.doc': 'document',
      '.docx': 'document',
      '.xls': 'document',
      '.xlsx': 'document',
      '.ppt': 'document',
      '.pptx': 'document',
      '.txt': 'text',
      '.md': 'text',
      // Code
      '.js': 'code',
      '.ts': 'code',
      '.py': 'code',
      '.java': 'code',
      '.c': 'code',
      '.cpp': 'code',
      '.h': 'code',
      '.html': 'code',
      '.css': 'code',
      '.json': 'code',
      // Archives
      '.zip': 'archive',
      '.rar': 'archive',
      '.7z': 'archive',
      '.tar': 'archive',
      '.gz': 'archive',
    };
    
    return types[ext] || 'file';
  }
  
  async getFileInfo(device: ExternalDevice, relativePath: string): Promise<DeviceFile | null> {
    if (!device.mountPoint) return null;
    
    const fullPath = path.join(device.mountPoint, relativePath);
    
    try {
      const stat = await fs.promises.stat(fullPath);
      const name = path.basename(relativePath);
      
      return {
        name,
        path: relativePath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
        type: stat.isDirectory() ? 'folder' : this.getFileType(name),
      };
    } catch {
      return null;
    }
  }
}

// =============================================================================
// DEVICE TRANSFER MANAGER
// =============================================================================

export interface DeviceTransfer {
  id: string;
  deviceId: string;
  direction: 'import' | 'export';
  sourcePath: string;
  destinationPath: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  currentFile: string;
  filesCompleted: number;
  totalFiles: number;
  speed: number;
  startTime: number;
  endTime?: number;
  error?: string;
}

class DeviceTransferManager extends EventEmitter {
  private transfers: Map<string, DeviceTransfer> = new Map();
  private transferCounter = 0;
  private activeTransfers = 0;
  private readonly MAX_CONCURRENT = 2;
  
  private createTransferId(): string {
    return `device-transfer-${Date.now()}-${++this.transferCounter}`;
  }
  
  // Import files from device to local system
  async importFromDevice(
    device: ExternalDevice,
    sourcePaths: string[],
    destinationDir: string
  ): Promise<DeviceTransfer> {
    if (!device.mountPoint) {
      throw new Error('Device has no mount point');
    }
    
    const id = this.createTransferId();
    
    // Calculate total size
    let totalBytes = 0;
    let totalFiles = 0;
    
    for (const sourcePath of sourcePaths) {
      const fullPath = path.join(device.mountPoint, sourcePath);
      const stats = await this.getPathStats(fullPath);
      totalBytes += stats.bytes;
      totalFiles += stats.files;
    }
    
    const transfer: DeviceTransfer = {
      id,
      deviceId: device.id,
      direction: 'import',
      sourcePath: sourcePaths.join(', '),
      destinationPath: destinationDir,
      status: 'pending',
      progress: 0,
      bytesTransferred: 0,
      totalBytes,
      currentFile: '',
      filesCompleted: 0,
      totalFiles,
      speed: 0,
      startTime: Date.now(),
    };
    
    this.transfers.set(id, transfer);
    this.emit('transfer:created', transfer);
    
    // Start transfer
    this.executeTransfer(transfer, device, sourcePaths, destinationDir);
    
    return transfer;
  }
  
  // Export files from local system to device
  async exportToDevice(
    device: ExternalDevice,
    sourcePaths: string[],
    destinationDir: string
  ): Promise<DeviceTransfer> {
    if (!device.mountPoint) {
      throw new Error('Device has no mount point');
    }
    
    const id = this.createTransferId();
    
    // Calculate total size
    let totalBytes = 0;
    let totalFiles = 0;
    
    for (const sourcePath of sourcePaths) {
      const stats = await this.getPathStats(sourcePath);
      totalBytes += stats.bytes;
      totalFiles += stats.files;
    }
    
    const transfer: DeviceTransfer = {
      id,
      deviceId: device.id,
      direction: 'export',
      sourcePath: sourcePaths.join(', '),
      destinationPath: path.join(device.mountPoint, destinationDir),
      status: 'pending',
      progress: 0,
      bytesTransferred: 0,
      totalBytes,
      currentFile: '',
      filesCompleted: 0,
      totalFiles,
      speed: 0,
      startTime: Date.now(),
    };
    
    this.transfers.set(id, transfer);
    this.emit('transfer:created', transfer);
    
    // Start transfer
    this.executeTransfer(transfer, device, sourcePaths, path.join(device.mountPoint, destinationDir));
    
    return transfer;
  }
  
  private async getPathStats(targetPath: string): Promise<{ bytes: number; files: number }> {
    try {
      const stat = await fs.promises.stat(targetPath);
      
      if (stat.isDirectory()) {
        let bytes = 0;
        let files = 0;
        
        const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          
          const entryPath = path.join(targetPath, entry.name);
          const entryStats = await this.getPathStats(entryPath);
          bytes += entryStats.bytes;
          files += entryStats.files;
        }
        
        return { bytes, files };
      } else {
        return { bytes: stat.size, files: 1 };
      }
    } catch {
      return { bytes: 0, files: 0 };
    }
  }
  
  private async executeTransfer(
    transfer: DeviceTransfer,
    device: ExternalDevice,
    sourcePaths: string[],
    destinationDir: string
  ): Promise<void> {
    transfer.status = 'running';
    this.activeTransfers++;
    this.emit('transfer:started', transfer);
    
    const startTime = Date.now();
    let bytesTransferred = 0;
    let filesCompleted = 0;
    
    try {
      // Ensure destination exists
      await fs.promises.mkdir(destinationDir, { recursive: true });
      
      for (const sourcePath of sourcePaths) {
        const fullSourcePath = transfer.direction === 'import'
          ? path.join(device.mountPoint!, sourcePath)
          : sourcePath;
        
        await this.copyPath(
          fullSourcePath,
          destinationDir,
          (file, bytes) => {
            bytesTransferred += bytes;
            transfer.bytesTransferred = bytesTransferred;
            transfer.currentFile = file;
            transfer.progress = transfer.totalBytes > 0
              ? (bytesTransferred / transfer.totalBytes) * 100
              : 0;
            
            const elapsed = (Date.now() - startTime) / 1000;
            transfer.speed = elapsed > 0 ? bytesTransferred / elapsed : 0;
            
            this.emit('transfer:progress', transfer);
          },
          () => {
            filesCompleted++;
            transfer.filesCompleted = filesCompleted;
          }
        );
      }
      
      transfer.status = 'completed';
      transfer.progress = 100;
      transfer.endTime = Date.now();
      this.emit('transfer:completed', transfer);
    } catch (err) {
      transfer.status = 'failed';
      transfer.error = String(err);
      transfer.endTime = Date.now();
      this.emit('transfer:failed', transfer);
    } finally {
      this.activeTransfers--;
    }
  }
  
  private async copyPath(
    sourcePath: string,
    destinationDir: string,
    onProgress: (file: string, bytes: number) => void,
    onFileComplete: () => void
  ): Promise<void> {
    const stat = await fs.promises.stat(sourcePath);
    const baseName = path.basename(sourcePath);
    const destPath = path.join(destinationDir, baseName);
    
    if (stat.isDirectory()) {
      await fs.promises.mkdir(destPath, { recursive: true });
      
      const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        await this.copyPath(
          path.join(sourcePath, entry.name),
          destPath,
          onProgress,
          onFileComplete
        );
      }
    } else {
      // Copy file with progress
      await this.copyFileWithProgress(sourcePath, destPath, onProgress);
      onFileComplete();
    }
  }
  
  private async copyFileWithProgress(
    source: string,
    dest: string,
    onProgress: (file: string, bytes: number) => void
  ): Promise<void> {
    const CHUNK_SIZE = 64 * 1024; // 64KB chunks
    
    const readStream = fs.createReadStream(source, { highWaterMark: CHUNK_SIZE });
    const writeStream = fs.createWriteStream(dest);
    
    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk: Buffer | string) => {
        const size = typeof chunk === 'string' ? chunk.length : chunk.length;
        onProgress(path.basename(source), size);
      });
      
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      
      readStream.pipe(writeStream);
    });
  }
  
  cancelTransfer(id: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status !== 'running') return;
    
    transfer.status = 'cancelled';
    transfer.endTime = Date.now();
    this.emit('transfer:cancelled', transfer);
  }
  
  getTransfers(): DeviceTransfer[] {
    return Array.from(this.transfers.values());
  }
  
  getTransfer(id: string): DeviceTransfer | undefined {
    return this.transfers.get(id);
  }
  
  getDeviceTransfers(deviceId: string): DeviceTransfer[] {
    return Array.from(this.transfers.values())
      .filter(t => t.deviceId === deviceId);
  }
}

// =============================================================================
// DEVICE INTERFACE (MAIN EXPORT)
// =============================================================================

export class DeviceInterface extends EventEmitter {
  readonly detector = new DeviceDetector();
  readonly browser = new DeviceFileBrowser();
  readonly transferManager = new DeviceTransferManager();
  
  constructor() {
    super();
    
    // Forward events
    this.detector.on('device:connected', (device) => this.emit('device:connected', device));
    this.detector.on('device:disconnected', (device) => this.emit('device:disconnected', device));
    
    this.transferManager.on('transfer:created', (t) => this.emit('transfer:created', t));
    this.transferManager.on('transfer:started', (t) => this.emit('transfer:started', t));
    this.transferManager.on('transfer:progress', (t) => this.emit('transfer:progress', t));
    this.transferManager.on('transfer:completed', (t) => this.emit('transfer:completed', t));
    this.transferManager.on('transfer:failed', (t) => this.emit('transfer:failed', t));
    this.transferManager.on('transfer:cancelled', (t) => this.emit('transfer:cancelled', t));
  }
  
  // Quick access methods
  getDevices(): ExternalDevice[] {
    return this.detector.getDevices();
  }
  
  getDevice(id: string): ExternalDevice | undefined {
    return this.detector.getDevice(id);
  }
  
  async listFiles(deviceId: string, relativePath = ''): Promise<DeviceFile[]> {
    const device = this.detector.getDevice(deviceId);
    if (!device) throw new Error('Device not found');
    return this.browser.listFiles(device, relativePath);
  }
  
  async importFiles(deviceId: string, sourcePaths: string[], destinationDir?: string): Promise<DeviceTransfer> {
    const device = this.detector.getDevice(deviceId);
    if (!device) throw new Error('Device not found');
    
    const dest = destinationDir || app.getPath('downloads');
    return this.transferManager.importFromDevice(device, sourcePaths, dest);
  }
  
  async exportFiles(deviceId: string, sourcePaths: string[], destinationDir: string): Promise<DeviceTransfer> {
    const device = this.detector.getDevice(deviceId);
    if (!device) throw new Error('Device not found');
    
    return this.transferManager.exportToDevice(device, sourcePaths, destinationDir);
  }
  
  // Safely eject device (show in OS)
  async safelyEject(deviceId: string): Promise<boolean> {
    const device = this.detector.getDevice(deviceId);
    if (!device || !device.mountPoint) return false;
    
    // Show the mount point in file manager (user can eject from there)
    shell.showItemInFolder(device.mountPoint);
    return true;
  }
  
  shutdown(): void {
    this.detector.stop();
  }
}

// Singleton instance
export const deviceInterface = new DeviceInterface();
