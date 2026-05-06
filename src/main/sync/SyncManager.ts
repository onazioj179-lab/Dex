// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Sync Controller - Multi-Machine Sync & Remote Orchestration
// Sync workflows across devices and trigger remote automations
// ===========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import * as log from 'electron-log';
import Store from 'electron-store';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SyncConfig {
  enabled: boolean;
  deviceId: string;
  deviceName: string;
  syncServer?: string;
  encryptionKey: string;
  autoSync: boolean;
  syncInterval: number; // minutes
  lastSync?: number;
}

interface SyncableItem {
  id: string;
  type: 'workflow' | 'operation' | 'action' | 'script' | 'hotkey';
  name: string;
  data: unknown;
  version: number;
  updatedAt: number;
  syncedAt?: number;
  deviceId: string;
}

interface RemoteDevice {
  id: string;
  name: string;
  platform: string;
  lastSeen: number;
  online: boolean;
  address?: string;
  port?: number;
}

interface SyncPayload {
  deviceId: string;
  deviceName: string;
  items: SyncableItem[];
  timestamp: number;
  signature: string;
}

interface RemoteCommand {
  id: string;
  type: 'run-workflow' | 'run-operation' | 'execute-script' | 'status' | 'sync';
  targetDeviceId: string;
  payload?: unknown;
  timestamp: number;
}

interface SyncConflict {
  itemId: string;
  itemType: string;
  localVersion: SyncableItem;
  remoteVersion: SyncableItem;
  resolution?: 'local' | 'remote' | 'manual';
}

// -----------------------------------------------------------------------------
// Sync Manager
// -----------------------------------------------------------------------------

class SyncManager {
  private configStore: Store;
  private syncStore: Store;
  private deviceStore: Store;
  private mainWindow: BrowserWindow | null = null;
  private syncServer: http.Server | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private pendingConflicts: SyncConflict[] = [];

  constructor() {
    this.configStore = new Store({ name: 'dex-sync-config' });
    this.syncStore = new Store({ name: 'dex-sync-data' });
    this.deviceStore = new Store({ name: 'dex-sync-devices' });
    
    // Initialize device ID if not exists
    if (!this.configStore.get('deviceId')) {
      this.configStore.set('deviceId', this.generateDeviceId());
    }
    if (!this.configStore.get('encryptionKey')) {
      this.configStore.set('encryptionKey', crypto.randomBytes(32).toString('hex'));
    }
  }

  // Generate unique device ID
  private generateDeviceId(): string {
    return `dex-${process.platform}-${crypto.randomBytes(8).toString('hex')}`;
  }

  // Get configuration
  getConfig(): SyncConfig {
    return {
      enabled: this.configStore.get('enabled', false) as boolean,
      deviceId: this.configStore.get('deviceId', '') as string,
      deviceName: this.configStore.get('deviceName', `Dex on ${process.platform}`) as string,
      syncServer: this.configStore.get('syncServer') as string | undefined,
      encryptionKey: this.configStore.get('encryptionKey', '') as string,
      autoSync: this.configStore.get('autoSync', true) as boolean,
      syncInterval: this.configStore.get('syncInterval', 15) as number,
      lastSync: this.configStore.get('lastSync') as number | undefined,
    };
  }

  // Update configuration
  updateConfig(updates: Partial<SyncConfig>): SyncConfig {
    for (const [key, value] of Object.entries(updates)) {
      this.configStore.set(key, value);
    }
    return this.getConfig();
  }

  // Get known devices
  getDevices(): RemoteDevice[] {
    return this.deviceStore.get('devices', []) as RemoteDevice[];
  }

  // Add/update device
  registerDevice(device: RemoteDevice): void {
    const devices = this.getDevices();
    const index = devices.findIndex(d => d.id === device.id);
    
    if (index >= 0) {
      devices[index] = { ...devices[index], ...device, lastSeen: Date.now() };
    } else {
      devices.push({ ...device, lastSeen: Date.now() });
    }
    
    this.deviceStore.set('devices', devices);
  }

  // Remove device
  removeDevice(deviceId: string): void {
    const devices = this.getDevices().filter(d => d.id !== deviceId);
    this.deviceStore.set('devices', devices);
  }

  // Get syncable items from local stores
  private getSyncableItems(): SyncableItem[] {
    const config = this.getConfig();
    const items: SyncableItem[] = [];

    // Workflows
    const workflowStore = new Store({ name: 'dex-workflows' });
    const workflows = workflowStore.get('workflows', []) as Array<{ id: string; name: string; updatedAt?: number }>;
    for (const workflow of workflows) {
      items.push({
        id: workflow.id,
        type: 'workflow',
        name: workflow.name,
        data: workflow,
        version: workflow.updatedAt || Date.now(),
        updatedAt: workflow.updatedAt || Date.now(),
        deviceId: config.deviceId,
      });
    }

    // Operations
    const operationStore = new Store({ name: 'dex-operations' });
    const operations = operationStore.get('operations', []) as Array<{ id: string; name: string; updatedAt?: number }>;
    for (const operation of operations) {
      items.push({
        id: operation.id,
        type: 'operation',
        name: operation.name,
        data: operation,
        version: operation.updatedAt || Date.now(),
        updatedAt: operation.updatedAt || Date.now(),
        deviceId: config.deviceId,
      });
    }

    // Scripts
    const scriptStore = new Store({ name: 'dex-scripts' });
    const scripts = scriptStore.get('scripts', []) as Array<{ id: string; name: string; updatedAt?: number }>;
    for (const script of scripts) {
      items.push({
        id: script.id,
        type: 'script',
        name: script.name,
        data: script,
        version: script.updatedAt || Date.now(),
        updatedAt: script.updatedAt || Date.now(),
        deviceId: config.deviceId,
      });
    }

    return items;
  }

  // Encrypt data for sync
  private encrypt(data: string): string {
    const config = this.getConfig();
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(config.encryptionKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  // Decrypt data from sync
  private decrypt(encrypted: string): string {
    const config = this.getConfig();
    const [ivHex, authTagHex, data] = encrypted.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(config.encryptionKey, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Generate sync payload
  private createSyncPayload(): SyncPayload {
    const config = this.getConfig();
    const items = this.getSyncableItems();
    const timestamp = Date.now();
    
    const payload: SyncPayload = {
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      items,
      timestamp,
      signature: '',
    };
    
    // Sign payload
    const hmac = crypto.createHmac('sha256', config.encryptionKey);
    hmac.update(JSON.stringify({ ...payload, signature: undefined }));
    payload.signature = hmac.digest('hex');
    
    return payload;
  }

  // Verify sync payload signature
  private verifySyncPayload(payload: SyncPayload): boolean {
    const config = this.getConfig();
    const hmac = crypto.createHmac('sha256', config.encryptionKey);
    hmac.update(JSON.stringify({ ...payload, signature: undefined }));
    const computed = hmac.digest('hex');
    if (!payload.signature || computed.length !== payload.signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(payload.signature));
  }

  // Merge remote items with local
  private mergeItems(remoteItems: SyncableItem[]): { merged: number; conflicts: SyncConflict[] } {
    const config = this.getConfig();
    const localItems = this.getSyncableItems();
    const conflicts: SyncConflict[] = [];
    let merged = 0;

    const storeMap: Record<string, Store> = {
      workflow: new Store({ name: 'dex-workflows' }),
      operation: new Store({ name: 'dex-operations' }),
      script: new Store({ name: 'dex-scripts' }),
    };

    for (const remoteItem of remoteItems) {
      // Skip items from this device
      if (remoteItem.deviceId === config.deviceId) continue;

      const localItem = localItems.find(
        l => l.id === remoteItem.id && l.type === remoteItem.type
      );

      if (!localItem) {
        // New item - add it
        const store = storeMap[remoteItem.type];
        if (store) {
          const key = `${remoteItem.type}s`;
          const existing = store.get(key, []) as unknown[];
          existing.push(remoteItem.data);
          store.set(key, existing);
          merged++;
        }
      } else if (remoteItem.version > localItem.version) {
        // Remote is newer - update local
        const store = storeMap[remoteItem.type];
        if (store) {
          const key = `${remoteItem.type}s`;
          const existing = store.get(key, []) as Array<{ id: string }>;
          const index = existing.findIndex(e => e.id === remoteItem.id);
          if (index >= 0) {
            existing[index] = remoteItem.data as { id: string };
            store.set(key, existing);
            merged++;
          }
        }
      } else if (remoteItem.version !== localItem.version) {
        // Conflict - versions differ
        conflicts.push({
          itemId: remoteItem.id,
          itemType: remoteItem.type,
          localVersion: localItem,
          remoteVersion: remoteItem,
        });
      }
    }

    return { merged, conflicts };
  }

  // Perform sync with peer or server
  async sync(targetAddress?: string): Promise<{
    success: boolean;
    merged: number;
    conflicts: number;
    error?: string;
  }> {
    const config = this.getConfig();
    
    if (!config.enabled) {
      return { success: false, merged: 0, conflicts: 0, error: 'Sync is disabled' };
    }

    try {
      const payload = this.createSyncPayload();
      const encrypted = this.encrypt(JSON.stringify(payload));

      const target = targetAddress || config.syncServer;
      if (!target) {
        return { success: false, merged: 0, conflicts: 0, error: 'No sync target' };
      }

      // Send sync request
      const response = await this.sendSyncRequest(target, encrypted);
      
      if (!response.success) {
        return { success: false, merged: 0, conflicts: 0, error: response.error };
      }

      // Decrypt and verify response
      const decrypted = this.decrypt(response.data);
      const remotePayload = JSON.parse(decrypted) as SyncPayload;
      
      if (!this.verifySyncPayload(remotePayload)) {
        return { success: false, merged: 0, conflicts: 0, error: 'Invalid signature' };
      }

      // Merge items
      const { merged, conflicts } = this.mergeItems(remotePayload.items);
      this.pendingConflicts = conflicts;

      // Update last sync time
      this.configStore.set('lastSync', Date.now());

      // Register remote device
      this.registerDevice({
        id: remotePayload.deviceId,
        name: remotePayload.deviceName,
        platform: 'unknown',
        lastSeen: Date.now(),
        online: true,
      });

      return { success: true, merged, conflicts: conflicts.length };
    } catch (error) {
      return {
        success: false,
        merged: 0,
        conflicts: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Send sync HTTP request
  private sendSyncRequest(target: string, data: string): Promise<{
    success: boolean;
    data: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      try {
        const url = new URL(target);
        const client = url.protocol === 'https:' ? https : http;

        const request = client.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Dex-Sync': '1',
          },
          timeout: 30000,
        }, (response) => {
          let responseData = '';
          response.on('data', chunk => { responseData += chunk; });
          response.on('end', () => {
            if (response.statusCode === 200) {
              resolve({ success: true, data: responseData });
            } else {
              resolve({ success: false, data: '', error: `HTTP ${response.statusCode}` });
            }
          });
        });

        request.on('error', (err) => {
          resolve({ success: false, data: '', error: err.message });
        });

        request.write(data);
        request.end();
      } catch (error) {
        resolve({
          success: false,
          data: '',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  // Send remote command
  async sendCommand(deviceId: string, command: Omit<RemoteCommand, 'id' | 'timestamp'>): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
  }> {
    const devices = this.getDevices();
    const device = devices.find(d => d.id === deviceId);
    
    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    if (!device.address) {
      return { success: false, error: 'Device address unknown' };
    }

    const fullCommand: RemoteCommand = {
      ...command,
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now(),
    };

    const config = this.getConfig();
    const encrypted = this.encrypt(JSON.stringify(fullCommand));

    try {
      const response = await this.sendSyncRequest(
        `http://${device.address}:${device.port || 45679}/command`,
        encrypted
      );

      if (response.success) {
        const result = JSON.parse(this.decrypt(response.data));
        return { success: true, result };
      }

      return { success: false, error: response.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Start local sync server
  startSyncServer(port: number = 45679): void {
    if (this.syncServer) return;

    const config = this.getConfig();

    this.syncServer = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      let body = '';
      let bodySize = 0;
      const MAX_BODY = 5_242_880; // 5MB for sync payloads
      req.on('data', chunk => {
        bodySize += chunk.length;
        if (bodySize > MAX_BODY) { req.destroy(); return; }
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const isCommand = req.url === '/command';
          
          if (isCommand) {
            // Handle remote command
            const decrypted = this.decrypt(body);
            const command = JSON.parse(decrypted) as RemoteCommand;
            const result = await this.handleRemoteCommand(command);
            const encrypted = this.encrypt(JSON.stringify(result));
            
            res.writeHead(200);
            res.end(encrypted);
          } else {
            // Handle sync request
            const decrypted = this.decrypt(body);
            const remotePayload = JSON.parse(decrypted) as SyncPayload;
            
            if (!this.verifySyncPayload(remotePayload)) {
              res.writeHead(401);
              res.end('Invalid signature');
              return;
            }

            // Merge and respond with local data
            this.mergeItems(remotePayload.items);
            this.registerDevice({
              id: remotePayload.deviceId,
              name: remotePayload.deviceName,
              platform: 'unknown',
              lastSeen: Date.now(),
              online: true,
            });

            const responsePayload = this.createSyncPayload();
            const encrypted = this.encrypt(JSON.stringify(responsePayload));
            
            res.writeHead(200);
            res.end(encrypted);
          }
        } catch (error) {
          res.writeHead(500);
          res.end('Sync error');
        }
      });
    });

    this.syncServer.listen(port, () => {
      log.info(`[SyncManager] Sync server running on port ${port}`);
    });
  }

  // Stop sync server
  stopSyncServer(): void {
    if (this.syncServer) {
      this.syncServer.close();
      this.syncServer = null;
    }
  }

  // Handle remote command
  private async handleRemoteCommand(command: RemoteCommand): Promise<unknown> {
    switch (command.type) {
      case 'run-workflow': {
        const payload = command.payload as { workflowId?: string } | undefined;
        if (!payload?.workflowId) return { success: false, error: 'Missing workflowId' };
        try {
          // Use existing IPC handler to execute workflow
          const fakeEvent = { sender: this.mainWindow?.webContents } as any;
          const result = await ipcMain.listeners('workflow:execute').length > 0
            ? await new Promise((resolve) => {
                ipcMain.emit('workflow:execute', fakeEvent, payload.workflowId);
                resolve({ started: true });
              })
            : { started: false, error: 'No workflow handler registered' };
          return { success: true, message: 'Workflow started', result };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }
      
      case 'run-operation': {
        const payload = command.payload as { operationId?: string } | undefined;
        if (!payload?.operationId) return { success: false, error: 'Missing operationId' };
        log.info(`[SyncManager] Remote operation requested: ${payload.operationId}`);
        return { success: true, message: 'Operation queued', operationId: payload.operationId };
      }
      
      case 'execute-script': {
        const payload = command.payload as { scriptId?: string } | undefined;
        if (!payload?.scriptId) return { success: false, error: 'Missing scriptId' };
        log.info(`[SyncManager] Remote script execution requested: ${payload.scriptId}`);
        return { success: true, message: 'Script queued', scriptId: payload.scriptId };
      }
      
      case 'status':
        return {
          success: true,
          status: {
            platform: process.platform,
            uptime: process.uptime(),
            deviceId: this.getConfig().deviceId,
          },
        };
      
      case 'sync':
        const result = await this.sync();
        return { success: true, syncResult: result };
      
      default:
        return { success: false, error: 'Unknown command' };
    }
  }

  // Start auto-sync
  startAutoSync(): void {
    const config = this.getConfig();
    
    if (!config.autoSync || !config.enabled) return;

    this.stopAutoSync();
    
    this.syncInterval = setInterval(() => {
      this.sync().catch(console.error);
    }, config.syncInterval * 60 * 1000);
  }

  // Stop auto-sync
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Get pending conflicts
  getPendingConflicts(): SyncConflict[] {
    return this.pendingConflicts;
  }

  // Resolve conflict
  resolveConflict(itemId: string, resolution: 'local' | 'remote'): boolean {
    const index = this.pendingConflicts.findIndex(c => c.itemId === itemId);
    if (index === -1) return false;

    const conflict = this.pendingConflicts[index];
    
    if (resolution === 'remote') {
      // Apply remote version
      const storeMap: Record<string, Store> = {
        workflow: new Store({ name: 'dex-workflows' }),
        operation: new Store({ name: 'dex-operations' }),
        script: new Store({ name: 'dex-scripts' }),
      };

      const store = storeMap[conflict.itemType];
      if (store) {
        const key = `${conflict.itemType}s`;
        const existing = store.get(key, []) as Array<{ id: string }>;
        const itemIndex = existing.findIndex(e => e.id === itemId);
        if (itemIndex >= 0) {
          existing[itemIndex] = conflict.remoteVersion.data as { id: string };
          store.set(key, existing);
        }
      }
    }

    // Remove from pending
    this.pendingConflicts.splice(index, 1);
    return true;
  }

  // Initialize
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    
    const config = this.getConfig();
    
    if (config.enabled) {
      this.startSyncServer();
      this.startAutoSync();
    }
  }

  // Shutdown
  shutdown(): void {
    this.stopAutoSync();
    this.stopSyncServer();
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const syncManager = new SyncManager();

export function initializeSync(mainWindow: BrowserWindow): void {
  syncManager.initialize(mainWindow);

  // IPC handlers
  ipcMain.handle('sync:get-config', () => syncManager.getConfig());
  ipcMain.handle('sync:update-config', (_, updates) => syncManager.updateConfig(updates));
  ipcMain.handle('sync:get-devices', () => syncManager.getDevices());
  ipcMain.handle('sync:remove-device', (_, deviceId) => syncManager.removeDevice(deviceId));
  ipcMain.handle('sync:perform', (_, target) => syncManager.sync(target));
  ipcMain.handle('sync:send-command', (_, deviceId, command) => syncManager.sendCommand(deviceId, command));
  ipcMain.handle('sync:get-conflicts', () => syncManager.getPendingConflicts());
  ipcMain.handle('sync:resolve-conflict', (_, itemId, resolution) => syncManager.resolveConflict(itemId, resolution));
  ipcMain.handle('sync:start-server', (_, port) => syncManager.startSyncServer(port));
  ipcMain.handle('sync:stop-server', () => syncManager.stopSyncServer());
}

export function shutdownSync(): void {
  syncManager.shutdown();
}
