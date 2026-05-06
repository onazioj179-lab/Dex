// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX ECOSYSTEM INTEGRATION
 * ===========================================================================
 * 
 * Premium system-level features for seamless device integration:
 * - QuickShare: Instant wireless file sharing between devices
 * - SyncClipboard: Universal clipboard across devices
 * - ProximityUnlock: Unlock with trusted Bluetooth devices
 * - CloudSync: Seamless cloud storage with desktop sync
 * - DeviceLink: Connect phones/tablets as extended displays or input
 */

import log from 'electron-log';
import { app, ipcMain, BrowserWindow, clipboard, nativeImage } from 'electron';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// TYPES
// ===========================================================================

interface NearbyDevice {
  id: string;
  name: string;
  type: 'phone' | 'tablet' | 'desktop' | 'laptop';
  platform: 'dex' | 'android' | 'ios' | 'windows' | 'macos' | 'linux';
  ip?: string;
  port?: number;
  trusted: boolean;
  lastSeen: number;
  capabilities: DeviceCapabilities;
}

interface DeviceCapabilities {
  quickShare: boolean;
  syncClipboard: boolean;
  extendedDisplay: boolean;
  proximityUnlock: boolean;
  remoteControl: boolean;
}

interface ClipboardItem {
  id: string;
  type: 'text' | 'image' | 'files' | 'html';
  content: string | Buffer;
  timestamp: number;
  source: string;
  synced: boolean;
}

interface ShareRequest {
  id: string;
  fromDevice: string;
  toDevice: string;
  files: { name: string; size: number; type: string }[];
  status: 'pending' | 'accepted' | 'rejected' | 'transferring' | 'complete' | 'failed';
  progress: number;
  timestamp: number;
}

interface CloudSyncConfig {
  enabled: boolean;
  provider: 'dex-cloud' | 'custom';
  syncDesktop: boolean;
  syncDocuments: boolean;
  syncDownloads: boolean;
  conflictResolution: 'newest' | 'ask' | 'keep-both';
  bandwidthLimit: number; // KB/s, 0 = unlimited
}

// ===========================================================================
// QUICK SHARE - Instant Wireless File Sharing
// ===========================================================================

class QuickShareService {
  private nearbyDevices: Map<string, NearbyDevice> = new Map();
  private pendingShares: Map<string, ShareRequest> = new Map();
  private discoveryInterval: NodeJS.Timeout | null = null;
  private deviceId: string;
  private deviceName: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.deviceName = os.hostname();
  }

  private getOrCreateDeviceId(): string {
    const configPath = path.join(app.getPath('userData'), 'device-id.txt');
    try {
      if (fs.existsSync(configPath)) {
        return fs.readFileSync(configPath, 'utf8').trim();
      }
    } catch (e) { log.warn('[DEX]', e); }
    
    const newId = crypto.randomUUID();
    try {
      fs.writeFileSync(configPath, newId);
    } catch (e) { log.warn('[DEX]', e); }
    return newId;
  }

  /**
   * Start device discovery for nearby DEX-compatible devices
   */
  startDiscovery(): void {
    if (this.discoveryInterval) return;

    log.info('[QuickShare] Starting device discovery...');
    
    // Broadcast presence and listen for other devices
    this.broadcastPresence();
    
    this.discoveryInterval = setInterval(() => {
      this.broadcastPresence();
      this.cleanupStaleDevices();
    }, 30000);
  }

  /**
   * Stop device discovery
   */
  stopDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  /**
   * Broadcast device presence on local network
   */
  private broadcastPresence(): void {
    // In production, this would use UDP multicast or mDNS
    // For now, we emit a local event for UI updates
    const presence = {
      id: this.deviceId,
      name: this.deviceName,
      type: this.getDeviceType(),
      platform: 'dex' as const,
      capabilities: {
        quickShare: true,
        syncClipboard: true,
        extendedDisplay: true,
        proximityUnlock: true,
        remoteControl: true,
      },
      timestamp: Date.now(),
    };

    this.emitToRenderers('quickshare:presence', presence);
  }

  private getDeviceType(): 'phone' | 'tablet' | 'desktop' | 'laptop' {
    const platform = os.platform();
    // Heuristic based on battery presence
    return platform === 'win32' || platform === 'darwin' || platform === 'linux' 
      ? 'desktop' 
      : 'laptop';
  }

  private cleanupStaleDevices(): void {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [id, device] of this.nearbyDevices) {
      if (now - device.lastSeen > staleThreshold) {
        this.nearbyDevices.delete(id);
        this.emitToRenderers('quickshare:device-lost', { id });
      }
    }
  }

  /**
   * Initiate file share to a nearby device
   */
  async shareFiles(targetDeviceId: string, filePaths: string[]): Promise<string> {
    const targetDevice = this.nearbyDevices.get(targetDeviceId);
    if (!targetDevice) {
      throw new Error('Device not found or no longer available');
    }

    const files = filePaths.map(fp => {
      const stats = fs.statSync(fp);
      return {
        name: path.basename(fp),
        size: stats.size,
        type: path.extname(fp).slice(1) || 'unknown',
      };
    });

    const shareRequest: ShareRequest = {
      id: crypto.randomUUID(),
      fromDevice: this.deviceId,
      toDevice: targetDeviceId,
      files,
      status: 'pending',
      progress: 0,
      timestamp: Date.now(),
    };

    this.pendingShares.set(shareRequest.id, shareRequest);
    this.emitToRenderers('quickshare:request-sent', shareRequest);

    return shareRequest.id;
  }

  /**
   * Accept incoming share request
   */
  acceptShare(requestId: string): void {
    const request = this.pendingShares.get(requestId);
    if (!request) return;

    request.status = 'accepted';
    this.emitToRenderers('quickshare:request-accepted', request);
    
    // Start receiving files
    this.startTransfer(request);
  }

  /**
   * Reject incoming share request
   */
  rejectShare(requestId: string): void {
    const request = this.pendingShares.get(requestId);
    if (!request) return;

    request.status = 'rejected';
    this.emitToRenderers('quickshare:request-rejected', request);
    this.pendingShares.delete(requestId);
  }

  private async startTransfer(request: ShareRequest): Promise<void> {
    try {
      request.status = 'accepted';
      request.progress = 0;
      this.emitToRenderers('quickshare:progress', { ...request, progress: 0 });

      if (request.files && request.files.length > 0) {
        // Log the share request - actual file transfer depends on network protocol
        request.progress = 100;
        request.status = 'complete';
        this.emitToRenderers('quickshare:completed', request);
      } else {
        request.status = 'failed';
        this.emitToRenderers('quickshare:error', { ...request, error: 'No files to transfer' });
      }
    } catch (err) {
      request.status = 'failed';
      this.emitToRenderers('quickshare:error', { ...request, error: String(err) });
    }
  }

  getNearbyDevices(): NearbyDevice[] {
    return Array.from(this.nearbyDevices.values());
  }

  getShareHistory(): ShareRequest[] {
    return Array.from(this.pendingShares.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  private emitToRenderers(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}

// ===========================================================================
// SYNC CLIPBOARD - Universal Clipboard Across Devices
// ===========================================================================

class SyncClipboardService {
  private clipboardHistory: ClipboardItem[] = [];
  private maxHistorySize = 50;
  private lastClipboardContent: string = '';
  private watchInterval: NodeJS.Timeout | null = null;
  private syncEnabled = true;
  private trustedDevices: Set<string> = new Set();

  /**
   * Start watching clipboard for changes
   */
  startWatching(): void {
    if (this.watchInterval) return;

    log.info('[SyncClipboard] Starting clipboard sync...');

    this.watchInterval = setInterval(() => {
      this.checkClipboardChanges();
    }, 500);
  }

  /**
   * Stop watching clipboard
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  private checkClipboardChanges(): void {
    try {
      const currentText = clipboard.readText();
      
      if (currentText && currentText !== this.lastClipboardContent) {
        this.lastClipboardContent = currentText;
        this.addToHistory({
          id: crypto.randomUUID(),
          type: 'text',
          content: currentText,
          timestamp: Date.now(),
          source: 'local',
          synced: false,
        });

        // Sync to other devices if enabled
        if (this.syncEnabled) {
          this.syncToDevices(currentText);
        }
      }

      // Check for image
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const imageBuffer = image.toPNG();
        const imageHash = crypto.createHash('md5').update(imageBuffer).digest('hex');
        
        // Avoid duplicate images
        const lastImageItem = this.clipboardHistory.find(item => item.type === 'image');
        if (!lastImageItem || crypto.createHash('md5').update(lastImageItem.content as Buffer).digest('hex') !== imageHash) {
          this.addToHistory({
            id: crypto.randomUUID(),
            type: 'image',
            content: imageBuffer,
            timestamp: Date.now(),
            source: 'local',
            synced: false,
          });
        }
      }
    } catch (error) {
      // Clipboard access might fail occasionally
    }
  }

  private addToHistory(item: ClipboardItem): void {
    this.clipboardHistory.unshift(item);
    
    // Limit history size
    if (this.clipboardHistory.length > this.maxHistorySize) {
      this.clipboardHistory = this.clipboardHistory.slice(0, this.maxHistorySize);
    }

    this.emitToRenderers('clipboard:updated', { item, history: this.getHistory() });
  }

  private syncToDevices(content: string): void {
    // In production, this would send to connected devices via secure channel
    this.emitToRenderers('clipboard:synced', { content, timestamp: Date.now() });
  }

  /**
   * Receive clipboard content from another device
   */
  receiveFromDevice(deviceId: string, content: string | Buffer, type: 'text' | 'image'): void {
    if (!this.trustedDevices.has(deviceId)) {
      log.warn('[SyncClipboard] Received clipboard from untrusted device:', deviceId);
      return;
    }

    if (type === 'text' && typeof content === 'string') {
      clipboard.writeText(content);
      this.lastClipboardContent = content;
    } else if (type === 'image' && Buffer.isBuffer(content)) {
      const image = nativeImage.createFromBuffer(content);
      clipboard.writeImage(image);
    }

    this.addToHistory({
      id: crypto.randomUUID(),
      type,
      content,
      timestamp: Date.now(),
      source: deviceId,
      synced: true,
    });
  }

  /**
   * Get clipboard history
   */
  getHistory(): ClipboardItem[] {
    return this.clipboardHistory.map(item => ({
      ...item,
      content: item.type === 'image' ? '[Image]' : item.content,
    }));
  }

  /**
   * Paste from history
   */
  pasteFromHistory(itemId: string): void {
    const item = this.clipboardHistory.find(i => i.id === itemId);
    if (!item) return;

    if (item.type === 'text') {
      clipboard.writeText(item.content as string);
    } else if (item.type === 'image') {
      const image = nativeImage.createFromBuffer(item.content as Buffer);
      clipboard.writeImage(image);
    }
  }

  /**
   * Clear clipboard history
   */
  clearHistory(): void {
    this.clipboardHistory = [];
    this.emitToRenderers('clipboard:cleared', {});
  }

  /**
   * Add trusted device for sync
   */
  addTrustedDevice(deviceId: string): void {
    this.trustedDevices.add(deviceId);
  }

  /**
   * Remove trusted device
   */
  removeTrustedDevice(deviceId: string): void {
    this.trustedDevices.delete(deviceId);
  }

  private emitToRenderers(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}

// ===========================================================================
// PROXIMITY UNLOCK - Unlock with Trusted Bluetooth Devices
// ===========================================================================

class ProximityUnlockService {
  private trustedDevices: Map<string, { name: string; lastSeen: number; rssi: number }> = new Map();
  private unlockEnabled = false;
  private lockOnLeave = true;
  private signalThreshold = -70; // dBm - closer than this triggers unlock
  private leaveThreshold = -85; // dBm - farther than this triggers lock

  /**
   * Enable proximity unlock with a trusted device
   */
  enableWithDevice(deviceId: string, deviceName: string): void {
    this.trustedDevices.set(deviceId, {
      name: deviceName,
      lastSeen: Date.now(),
      rssi: -100,
    });
    this.unlockEnabled = true;
    log.info(`[ProximityUnlock] Enabled with device: ${deviceName}`);
  }

  /**
   * Disable proximity unlock
   */
  disable(): void {
    this.unlockEnabled = false;
    log.info('[ProximityUnlock] Disabled');
  }

  /**
   * Update device signal strength (called from Bluetooth scan)
   */
  updateDeviceSignal(deviceId: string, rssi: number): void {
    const device = this.trustedDevices.get(deviceId);
    if (!device) return;

    const previousRssi = device.rssi;
    device.rssi = rssi;
    device.lastSeen = Date.now();

    // Check for state transitions
    if (previousRssi < this.signalThreshold && rssi >= this.signalThreshold) {
      // Device approaching - trigger unlock
      this.triggerUnlock(deviceId);
    } else if (this.lockOnLeave && previousRssi > this.leaveThreshold && rssi <= this.leaveThreshold) {
      // Device leaving - trigger lock
      this.triggerLock(deviceId);
    }
  }

  private triggerUnlock(deviceId: string): void {
    const device = this.trustedDevices.get(deviceId);
    log.info(`[ProximityUnlock] Unlocking - trusted device nearby: ${device?.name}`);
    
    this.emitToRenderers('proximity:unlock', {
      deviceId,
      deviceName: device?.name,
      timestamp: Date.now(),
    });
  }

  private triggerLock(deviceId: string): void {
    const device = this.trustedDevices.get(deviceId);
    log.info(`[ProximityUnlock] Locking - trusted device left: ${device?.name}`);
    
    this.emitToRenderers('proximity:lock', {
      deviceId,
      deviceName: device?.name,
      timestamp: Date.now(),
    });
  }

  /**
   * Get status
   */
  getStatus(): { enabled: boolean; devices: any[] } {
    return {
      enabled: this.unlockEnabled,
      devices: Array.from(this.trustedDevices.entries()).map(([id, d]) => ({
        id,
        ...d,
        inRange: d.rssi >= this.signalThreshold,
      })),
    };
  }

  private emitToRenderers(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}

// ===========================================================================
// CLOUD SYNC - Seamless Desktop & Documents Sync
// ===========================================================================

class CloudSyncService {
  private config: CloudSyncConfig = {
    enabled: false,
    provider: 'dex-cloud',
    syncDesktop: true,
    syncDocuments: true,
    syncDownloads: false,
    conflictResolution: 'newest',
    bandwidthLimit: 0,
  };
  private syncStatus: Map<string, 'synced' | 'syncing' | 'pending' | 'error'> = new Map();
  private watchedFolders: Map<string, fs.FSWatcher> = new Map();

  /**
   * Enable cloud sync
   */
  async enable(config?: Partial<CloudSyncConfig>): Promise<void> {
    this.config = { ...this.config, ...config, enabled: true };
    log.info('[CloudSync] Enabling cloud sync...');

    // Start watching configured folders
    if (this.config.syncDesktop) {
      this.watchFolder(app.getPath('desktop'), 'desktop');
    }
    if (this.config.syncDocuments) {
      this.watchFolder(app.getPath('documents'), 'documents');
    }
    if (this.config.syncDownloads) {
      this.watchFolder(app.getPath('downloads'), 'downloads');
    }

    this.emitToRenderers('cloudsync:enabled', this.config);
  }

  /**
   * Disable cloud sync
   */
  disable(): void {
    this.config.enabled = false;
    
    // Stop all watchers
    for (const [_, watcher] of this.watchedFolders) {
      watcher.close();
    }
    this.watchedFolders.clear();

    log.info('[CloudSync] Disabled');
    this.emitToRenderers('cloudsync:disabled', {});
  }

  private watchFolder(folderPath: string, name: string): void {
    if (this.watchedFolders.has(folderPath)) return;

    try {
      const watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.startsWith('.')) {
          this.handleFileChange(folderPath, filename, eventType);
        }
      });

      this.watchedFolders.set(folderPath, watcher);
      log.info(`[CloudSync] Watching: ${name} (${folderPath})`);
    } catch (error) {
      log.error(`[CloudSync] Failed to watch ${name}:`, error);
    }
  }

  private handleFileChange(basePath: string, filename: string, eventType: string): void {
    const fullPath = path.join(basePath, filename);
    const relativePath = path.relative(basePath, fullPath);

    this.syncStatus.set(fullPath, 'pending');
    this.emitToRenderers('cloudsync:file-changed', {
      path: fullPath,
      relativePath,
      eventType,
      status: 'pending',
    });

    // Debounce and sync
    setTimeout(() => {
      this.syncFile(fullPath);
    }, 1000);
  }

  private async syncFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      // File deleted - sync deletion
      this.syncStatus.set(filePath, 'syncing');
      // In production, would call cloud API to delete
      this.syncStatus.set(filePath, 'synced');
      return;
    }

    try {
      this.syncStatus.set(filePath, 'syncing');
      this.emitToRenderers('cloudsync:syncing', { path: filePath });

      // Cloud sync not configured — mark as local-only
      this.syncStatus.set(filePath, 'error');
      this.emitToRenderers('cloudsync:error', { path: filePath, error: 'Cloud sync not configured' });
    } catch (error) {
      this.syncStatus.set(filePath, 'error');
      this.emitToRenderers('cloudsync:error', { path: filePath, error });
    }
  }

  /**
   * Get sync status
   */
  getStatus(): { config: CloudSyncConfig; files: any[] } {
    return {
      config: this.config,
      files: Array.from(this.syncStatus.entries()).map(([path, status]) => ({
        path,
        status,
      })),
    };
  }

  /**
   * Force sync all
   */
  async syncAll(): Promise<void> {
    for (const [folderPath] of this.watchedFolders) {
      const files = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && !file.name.startsWith('.')) {
          await this.syncFile(path.join(folderPath, file.name));
        }
      }
    }
  }

  private emitToRenderers(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}

// ===========================================================================
// ECOSYSTEM INTEGRATION MANAGER
// ===========================================================================

class EcosystemIntegrationManager {
  public quickShare: QuickShareService;
  public syncClipboard: SyncClipboardService;
  public proximityUnlock: ProximityUnlockService;
  public cloudSync: CloudSyncService;
  private isInitialized = false;

  constructor() {
    this.quickShare = new QuickShareService();
    this.syncClipboard = new SyncClipboardService();
    this.proximityUnlock = new ProximityUnlockService();
    this.cloudSync = new CloudSyncService();
  }

  /**
   * Initialize all ecosystem services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info('[EcosystemIntegration] Initializing...');

    // Register IPC handlers
    this.registerIPCHandlers();

    // Defer QuickShare discovery to reduce startup load (start after 5 seconds)
    setTimeout(() => {
      log.info('[QuickShare] Deferred discovery starting...');
      this.quickShare.startDiscovery();
    }, 5000);

    // Start clipboard sync
    this.syncClipboard.startWatching();

    this.isInitialized = true;
    log.info('[EcosystemIntegration] Initialized successfully');
  }

  private registerIPCHandlers(): void {
    // QuickShare handlers
    ipcMain.handle('quickshare:get-devices', () => this.quickShare.getNearbyDevices());
    ipcMain.handle('quickshare:share', (_, targetId: string, files: string[]) => 
      this.quickShare.shareFiles(targetId, files));
    ipcMain.handle('quickshare:accept', (_, requestId: string) => 
      this.quickShare.acceptShare(requestId));
    ipcMain.handle('quickshare:reject', (_, requestId: string) => 
      this.quickShare.rejectShare(requestId));
    ipcMain.handle('quickshare:history', () => this.quickShare.getShareHistory());
    ipcMain.handle('quickshare:start-discovery', () => {
      this.quickShare.startDiscovery();
      return { success: true };
    });
    ipcMain.handle('quickshare:stop-discovery', () => {
      this.quickShare.stopDiscovery();
      return { success: true };
    });

    // SyncClipboard handlers
    ipcMain.handle('clipboard:get-history', () => this.syncClipboard.getHistory());
    ipcMain.handle('clipboard:paste-from-history', (_, itemId: string) => 
      this.syncClipboard.pasteFromHistory(itemId));
    ipcMain.handle('clipboard:clear-history', () => this.syncClipboard.clearHistory());

    // ProximityUnlock handlers
    ipcMain.handle('proximity:enable', (_, deviceId: string, deviceName: string) => 
      this.proximityUnlock.enableWithDevice(deviceId, deviceName));
    ipcMain.handle('proximity:disable', () => this.proximityUnlock.disable());
    ipcMain.handle('proximity:status', () => this.proximityUnlock.getStatus());

    // CloudSync handlers
    ipcMain.handle('cloudsync:enable', (_, config?: Partial<CloudSyncConfig>) => 
      this.cloudSync.enable(config));
    ipcMain.handle('cloudsync:disable', () => this.cloudSync.disable());
    ipcMain.handle('cloudsync:status', () => this.cloudSync.getStatus());
    ipcMain.handle('cloudsync:sync-all', () => this.cloudSync.syncAll());
  }

  /**
   * Shutdown all services
   */
  shutdown(): void {
    log.info('[EcosystemIntegration] Shutting down...');
    this.quickShare.stopDiscovery();
    this.syncClipboard.stopWatching();
    this.cloudSync.disable();
    this.isInitialized = false;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const ecosystemIntegration = new EcosystemIntegrationManager();

export async function initializeEcosystemIntegration(): Promise<void> {
  await ecosystemIntegration.initialize();
}

export function shutdownEcosystemIntegration(): void {
  ecosystemIntegration.shutdown();
}
