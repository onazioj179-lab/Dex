// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Capability Layer: OS-like resource and permission management
// Unified system-level coordination for files, media, workflows, transfers
// =============================================================================

import log from 'electron-log';
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// =============================================================================
// CAPABILITY TYPES
// =============================================================================

export enum CapabilityType {
  FILE_SYSTEM = 'file_system',
  MEDIA_CONTROL = 'media_control',
  WORKFLOW_ENGINE = 'workflow_engine',
  TRANSFER_PROTOCOL = 'transfer_protocol',
  STORAGE_SERVICE = 'storage_service',
  INDEX_SERVICE = 'index_service',
  SEARCH_SERVICE = 'search_service',
  VOICE_SERVICE = 'voice_service',
  DEVICE_INTERFACE = 'device_interface',
  PLUGIN_HOST = 'plugin_host',
}

export enum CapabilityStatus {
  DISABLED = 'disabled',
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  ERROR = 'error',
  DEGRADED = 'degraded',
}

export interface Capability {
  type: CapabilityType;
  name: string;
  version: string;
  status: CapabilityStatus;
  resourceBudget: ResourceBudget;
  lastActivity: number;
  errorCount: number;
}

export interface ResourceBudget {
  cpuPercent: number;
  memoryMB: number;
  diskIOps: number;
  networkKBps: number;
}

// =============================================================================
// FILE SYSTEM CAPABILITY
// =============================================================================

export interface FileOperation {
  id: string;
  type: 'read' | 'write' | 'copy' | 'move' | 'delete' | 'list';
  source: string;
  destination?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  bytesProcessed: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
  error?: string;
}

class FileSystemCapability extends EventEmitter {
  private operations: Map<string, FileOperation> = new Map();
  private operationCounter = 0;
  readonly type = CapabilityType.FILE_SYSTEM;
  status = CapabilityStatus.READY;
  
  // Safe paths (user data, downloads, documents)
  private readonly SAFE_PATHS = new Set([
    app.getPath('userData'),
    app.getPath('downloads'),
    app.getPath('documents'),
    app.getPath('pictures'),
    app.getPath('music'),
    app.getPath('videos'),
    app.getPath('desktop'),
  ]);
  
  private createOperationId(): string {
    return `file-${Date.now()}-${++this.operationCounter}`;
  }
  
  // Validate path is within safe bounds
  isPathSafe(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    
    for (const safePath of this.SAFE_PATHS) {
      if (resolved.startsWith(safePath)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Add a safe path (for user-approved locations)
  addSafePath(newPath: string): void {
    const resolved = path.resolve(newPath);
    this.SAFE_PATHS.add(resolved);
  }
  
  async listDirectory(dirPath: string): Promise<{
    files: Array<{ name: string; isDirectory: boolean; size: number; modified: Date }>;
    error?: string;
  }> {
    if (!this.isPathSafe(dirPath)) {
      return { files: [], error: 'Path not in safe zone' };
    }
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          try {
            const stat = await fs.promises.stat(fullPath);
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: stat.size,
              modified: stat.mtime,
            };
          } catch {
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: 0,
              modified: new Date(),
            };
          }
        })
      );
      return { files };
    } catch (err) {
      return { files: [], error: String(err) };
    }
  }
  
  async copyFile(source: string, destination: string): Promise<FileOperation> {
    const opId = this.createOperationId();
    
    const operation: FileOperation = {
      id: opId,
      type: 'copy',
      source,
      destination,
      status: 'pending',
      progress: 0,
      bytesProcessed: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };
    
    this.operations.set(opId, operation);
    
    // Validate paths
    if (!this.isPathSafe(source) || !this.isPathSafe(destination)) {
      operation.status = 'failed';
      operation.error = 'Path not in safe zone';
      operation.endTime = Date.now();
      return operation;
    }
    
    try {
      operation.status = 'running';
      const stat = await fs.promises.stat(source);
      operation.totalBytes = stat.size;
      
      await fs.promises.copyFile(source, destination);
      
      operation.status = 'completed';
      operation.progress = 100;
      operation.bytesProcessed = operation.totalBytes;
      operation.endTime = Date.now();
      
      this.emit('operation:complete', operation);
    } catch (err) {
      operation.status = 'failed';
      operation.error = String(err);
      operation.endTime = Date.now();
      
      this.emit('operation:error', operation);
    }
    
    return operation;
  }
  
  async moveFile(source: string, destination: string): Promise<FileOperation> {
    const opId = this.createOperationId();
    
    const operation: FileOperation = {
      id: opId,
      type: 'move',
      source,
      destination,
      status: 'pending',
      progress: 0,
      bytesProcessed: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };
    
    this.operations.set(opId, operation);
    
    if (!this.isPathSafe(source) || !this.isPathSafe(destination)) {
      operation.status = 'failed';
      operation.error = 'Path not in safe zone';
      operation.endTime = Date.now();
      return operation;
    }
    
    try {
      operation.status = 'running';
      const stat = await fs.promises.stat(source);
      operation.totalBytes = stat.size;
      
      await fs.promises.rename(source, destination);
      
      operation.status = 'completed';
      operation.progress = 100;
      operation.bytesProcessed = operation.totalBytes;
      operation.endTime = Date.now();
      
      this.emit('operation:complete', operation);
    } catch (err) {
      operation.status = 'failed';
      operation.error = String(err);
      operation.endTime = Date.now();
      
      this.emit('operation:error', operation);
    }
    
    return operation;
  }
  
  async deleteFile(targetPath: string): Promise<FileOperation> {
    const opId = this.createOperationId();
    
    const operation: FileOperation = {
      id: opId,
      type: 'delete',
      source: targetPath,
      status: 'pending',
      progress: 0,
      bytesProcessed: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };
    
    this.operations.set(opId, operation);
    
    if (!this.isPathSafe(targetPath)) {
      operation.status = 'failed';
      operation.error = 'Path not in safe zone';
      operation.endTime = Date.now();
      return operation;
    }
    
    try {
      operation.status = 'running';
      
      // Move to trash instead of permanent delete
      await shell.trashItem(targetPath);
      
      operation.status = 'completed';
      operation.progress = 100;
      operation.endTime = Date.now();
      
      this.emit('operation:complete', operation);
    } catch (err) {
      operation.status = 'failed';
      operation.error = String(err);
      operation.endTime = Date.now();
      
      this.emit('operation:error', operation);
    }
    
    return operation;
  }
  
  getOperations(): FileOperation[] {
    return Array.from(this.operations.values());
  }
  
  getOperation(id: string): FileOperation | undefined {
    return this.operations.get(id);
  }
  
  // Open file with system default app
  async openWithDefault(filePath: string): Promise<boolean> {
    try {
      await shell.openPath(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  // Show file in explorer/finder
  showInFolder(filePath: string): void {
    shell.showItemInFolder(filePath);
  }
}

// =============================================================================
// TRANSFER CAPABILITY
// =============================================================================

export interface Transfer {
  id: string;
  type: 'upload' | 'download' | 'sync';
  source: string;
  destination: string;
  status: 'queued' | 'active' | 'paused' | 'completed' | 'failed';
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  startTime: number;
  endTime?: number;
  error?: string;
}

class TransferCapability extends EventEmitter {
  private transfers: Map<string, Transfer> = new Map();
  private activeTransfers = 0;
  private readonly MAX_CONCURRENT = 3;
  private transferCounter = 0;
  readonly type = CapabilityType.TRANSFER_PROTOCOL;
  status = CapabilityStatus.READY;
  
  private createTransferId(): string {
    return `transfer-${Date.now()}-${++this.transferCounter}`;
  }
  
  queueTransfer(
    type: Transfer['type'],
    source: string,
    destination: string,
    totalBytes: number
  ): Transfer {
    const id = this.createTransferId();
    
    const transfer: Transfer = {
      id,
      type,
      source,
      destination,
      status: 'queued',
      progress: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
    };
    
    this.transfers.set(id, transfer);
    this.emit('transfer:queued', transfer);
    
    // Try to start transfer if we have capacity
    this.processQueue();
    
    return transfer;
  }
  
  private processQueue(): void {
    if (this.activeTransfers >= this.MAX_CONCURRENT) return;
    
    const queued = Array.from(this.transfers.values())
      .filter(t => t.status === 'queued');
    
    for (const transfer of queued) {
      if (this.activeTransfers >= this.MAX_CONCURRENT) break;
      
      transfer.status = 'active';
      this.activeTransfers++;
      this.emit('transfer:started', transfer);
    }
  }
  
  updateProgress(id: string, bytesTransferred: number, speed: number): void {
    const transfer = this.transfers.get(id);
    if (!transfer) return;
    
    transfer.bytesTransferred = bytesTransferred;
    transfer.progress = transfer.totalBytes > 0
      ? (bytesTransferred / transfer.totalBytes) * 100
      : 0;
    transfer.speed = speed;
    transfer.eta = speed > 0
      ? (transfer.totalBytes - bytesTransferred) / speed
      : 0;
    
    this.emit('transfer:progress', transfer);
  }
  
  completeTransfer(id: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer) return;
    
    transfer.status = 'completed';
    transfer.progress = 100;
    transfer.bytesTransferred = transfer.totalBytes;
    transfer.endTime = Date.now();
    this.activeTransfers--;
    
    this.emit('transfer:completed', transfer);
    this.processQueue();
  }
  
  failTransfer(id: string, error: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer) return;
    
    transfer.status = 'failed';
    transfer.error = error;
    transfer.endTime = Date.now();
    this.activeTransfers--;
    
    this.emit('transfer:failed', transfer);
    this.processQueue();
  }
  
  pauseTransfer(id: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status !== 'active') return;
    
    transfer.status = 'paused';
    this.activeTransfers--;
    this.emit('transfer:paused', transfer);
    this.processQueue();
  }
  
  resumeTransfer(id: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status !== 'paused') return;
    
    if (this.activeTransfers < this.MAX_CONCURRENT) {
      transfer.status = 'active';
      this.activeTransfers++;
      this.emit('transfer:resumed', transfer);
    } else {
      transfer.status = 'queued';
      this.emit('transfer:queued', transfer);
    }
  }
  
  cancelTransfer(id: string): void {
    const transfer = this.transfers.get(id);
    if (!transfer) return;
    
    if (transfer.status === 'active') {
      this.activeTransfers--;
    }
    
    this.transfers.delete(id);
    this.emit('transfer:cancelled', transfer);
    this.processQueue();
  }
  
  getTransfers(): Transfer[] {
    return Array.from(this.transfers.values());
  }
  
  getActiveTransfers(): Transfer[] {
    return Array.from(this.transfers.values())
      .filter(t => t.status === 'active');
  }
  
  getStats(): {
    active: number;
    queued: number;
    completed: number;
    failed: number;
    totalBytes: number;
    totalTransferred: number;
  } {
    const all = Array.from(this.transfers.values());
    
    return {
      active: all.filter(t => t.status === 'active').length,
      queued: all.filter(t => t.status === 'queued').length,
      completed: all.filter(t => t.status === 'completed').length,
      failed: all.filter(t => t.status === 'failed').length,
      totalBytes: all.reduce((sum, t) => sum + t.totalBytes, 0),
      totalTransferred: all.reduce((sum, t) => sum + t.bytesTransferred, 0),
    };
  }
}

// =============================================================================
// STORAGE SERVICE CAPABILITY
// =============================================================================

interface StorageEntry {
  key: string;
  value: unknown;
  encrypted: boolean;
  created: number;
  modified: number;
  size: number;
}

class StorageServiceCapability {
  private storage: Map<string, StorageEntry> = new Map();
  private persistPath: string;
  readonly type = CapabilityType.STORAGE_SERVICE;
  status = CapabilityStatus.READY;
  
  constructor() {
    this.persistPath = path.join(app.getPath('userData'), 'capability-storage.json');
    this.load();
  }
  
  private load(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf-8');
        const entries = JSON.parse(data) as StorageEntry[];
        for (const entry of entries) {
          this.storage.set(entry.key, entry);
        }
      }
    } catch (err) {
      log.error('[StorageService] Failed to load:', err);
    }
  }
  
  private persist(): void {
    try {
      const entries = Array.from(this.storage.values());
      fs.writeFileSync(this.persistPath, JSON.stringify(entries, null, 2));
    } catch (err) {
      log.error('[StorageService] Failed to persist:', err);
    }
  }
  
  set(key: string, value: unknown, encrypted = false): void {
    const serialized = JSON.stringify(value);
    
    this.storage.set(key, {
      key,
      value,
      encrypted,
      created: this.storage.get(key)?.created || Date.now(),
      modified: Date.now(),
      size: serialized.length,
    });
    
    this.persist();
  }
  
  get<T = unknown>(key: string): T | undefined {
    const entry = this.storage.get(key);
    return entry?.value as T | undefined;
  }
  
  has(key: string): boolean {
    return this.storage.has(key);
  }
  
  delete(key: string): boolean {
    const result = this.storage.delete(key);
    if (result) this.persist();
    return result;
  }
  
  keys(): string[] {
    return Array.from(this.storage.keys());
  }
  
  getStats(): { entryCount: number; totalSize: number } {
    const entries = Array.from(this.storage.values());
    return {
      entryCount: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    };
  }
  
  clear(): void {
    this.storage.clear();
    this.persist();
  }
}

// =============================================================================
// CAPABILITY LAYER (MAIN COORDINATOR)
// =============================================================================

export class CapabilityLayer extends EventEmitter {
  private capabilities: Map<CapabilityType, Capability> = new Map();
  
  // Service instances
  readonly fileSystem = new FileSystemCapability();
  readonly transfer = new TransferCapability();
  readonly storage = new StorageServiceCapability();
  
  constructor() {
    super();
    this.registerCapabilities();
  }
  
  private registerCapabilities(): void {
    // Register file system capability
    this.capabilities.set(CapabilityType.FILE_SYSTEM, {
      type: CapabilityType.FILE_SYSTEM,
      name: 'File System',
      version: '1.0.0',
      status: CapabilityStatus.READY,
      resourceBudget: { cpuPercent: 5, memoryMB: 50, diskIOps: 100, networkKBps: 0 },
      lastActivity: Date.now(),
      errorCount: 0,
    });
    
    // Register transfer capability
    this.capabilities.set(CapabilityType.TRANSFER_PROTOCOL, {
      type: CapabilityType.TRANSFER_PROTOCOL,
      name: 'Transfer Protocol',
      version: '1.0.0',
      status: CapabilityStatus.READY,
      resourceBudget: { cpuPercent: 10, memoryMB: 100, diskIOps: 200, networkKBps: 10000 },
      lastActivity: Date.now(),
      errorCount: 0,
    });
    
    // Register storage service
    this.capabilities.set(CapabilityType.STORAGE_SERVICE, {
      type: CapabilityType.STORAGE_SERVICE,
      name: 'Storage Service',
      version: '1.0.0',
      status: CapabilityStatus.READY,
      resourceBudget: { cpuPercent: 2, memoryMB: 30, diskIOps: 50, networkKBps: 0 },
      lastActivity: Date.now(),
      errorCount: 0,
    });
    
    // Pre-register future capabilities as disabled
    const futureCapabilities: Array<{ type: CapabilityType; name: string }> = [
      { type: CapabilityType.MEDIA_CONTROL, name: 'Media Control' },
      { type: CapabilityType.WORKFLOW_ENGINE, name: 'Workflow Engine' },
      { type: CapabilityType.INDEX_SERVICE, name: 'Index Service' },
      { type: CapabilityType.SEARCH_SERVICE, name: 'Search Service' },
      { type: CapabilityType.VOICE_SERVICE, name: 'Voice Service' },
      { type: CapabilityType.DEVICE_INTERFACE, name: 'Device Interface' },
      { type: CapabilityType.PLUGIN_HOST, name: 'Plugin Host' },
    ];
    
    for (const { type, name } of futureCapabilities) {
      this.capabilities.set(type, {
        type,
        name,
        version: '0.0.0',
        status: CapabilityStatus.DISABLED,
        resourceBudget: { cpuPercent: 0, memoryMB: 0, diskIOps: 0, networkKBps: 0 },
        lastActivity: 0,
        errorCount: 0,
      });
    }
  }
  
  getCapability(type: CapabilityType): Capability | undefined {
    return this.capabilities.get(type);
  }
  
  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }
  
  getActiveCapabilities(): Capability[] {
    return Array.from(this.capabilities.values())
      .filter(c => c.status === CapabilityStatus.READY || c.status === CapabilityStatus.BUSY);
  }
  
  getCapabilityStatus(type: CapabilityType): CapabilityStatus {
    return this.capabilities.get(type)?.status || CapabilityStatus.DISABLED;
  }
  
  updateCapabilityStatus(type: CapabilityType, status: CapabilityStatus): void {
    const capability = this.capabilities.get(type);
    if (capability) {
      capability.status = status;
      capability.lastActivity = Date.now();
      this.emit('capability:statusChanged', { type, status });
    }
  }
  
  recordCapabilityError(type: CapabilityType): void {
    const capability = this.capabilities.get(type);
    if (capability) {
      capability.errorCount++;
      capability.lastActivity = Date.now();
      
      // Degrade capability if too many errors
      if (capability.errorCount > 10) {
        capability.status = CapabilityStatus.DEGRADED;
        this.emit('capability:degraded', { type });
      }
    }
  }
  
  getSystemStatus(): {
    totalCapabilities: number;
    activeCapabilities: number;
    degradedCapabilities: number;
    totalResourceBudget: ResourceBudget;
  } {
    const all = Array.from(this.capabilities.values());
    const active = all.filter(c => c.status === CapabilityStatus.READY || c.status === CapabilityStatus.BUSY);
    const degraded = all.filter(c => c.status === CapabilityStatus.DEGRADED);
    
    const totalBudget = active.reduce(
      (sum, c) => ({
        cpuPercent: sum.cpuPercent + c.resourceBudget.cpuPercent,
        memoryMB: sum.memoryMB + c.resourceBudget.memoryMB,
        diskIOps: sum.diskIOps + c.resourceBudget.diskIOps,
        networkKBps: sum.networkKBps + c.resourceBudget.networkKBps,
      }),
      { cpuPercent: 0, memoryMB: 0, diskIOps: 0, networkKBps: 0 }
    );
    
    return {
      totalCapabilities: all.length,
      activeCapabilities: active.length,
      degradedCapabilities: degraded.length,
      totalResourceBudget: totalBudget,
    };
  }
}

// Singleton instance
export const capabilityLayer = new CapabilityLayer();
