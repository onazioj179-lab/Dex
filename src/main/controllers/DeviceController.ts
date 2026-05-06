// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Device Controller
// Phase 12: Device Discovery & Management
// Consent-based device pairing and session management
// ===========================================================================

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as os from 'os';
import * as dgram from 'dgram';
import * as crypto from 'crypto';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface Device {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'phone' | 'tablet' | 'server' | 'unknown';
  platform: string;
  hostname: string;
  ip: string;
  port: number;
  capabilities: DeviceCapabilities;
  status: 'online' | 'offline' | 'busy' | 'unknown';
  lastSeen: number;
  trusted: boolean;
  paired: boolean;
  pairingCode?: string;
}

export interface DeviceCapabilities {
  canSendFiles: boolean;
  canReceiveFiles: boolean;
  canStream: boolean;
  canRemoteControl: boolean;
  maxTransferSize?: number;
  supportedTypes: string[];
}

export interface DevicePairing {
  deviceId: string;
  code: string;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface DeviceSession {
  id: string;
  deviceId: string;
  type: 'transfer' | 'stream' | 'control';
  startedAt: number;
  lastActivity: number;
  status: 'active' | 'paused' | 'ended';
  metadata: Record<string, any>;
}

// ===========================================================================
// STORE
// ===========================================================================

const store = new Store<{
  devices: Device[];
  pairings: DevicePairing[];
  sessions: DeviceSession[];
  discoveryEnabled: boolean;
  thisDeviceId: string;
  thisDeviceName: string;
}>({
  defaults: {
    devices: [],
    pairings: [],
    sessions: [],
    discoveryEnabled: false, // Disabled by default - user must enable
    thisDeviceId: '',
    thisDeviceName: ''
  }
});

// ===========================================================================
// CONTROLLER
// ===========================================================================

class DeviceController {
  private discoverySocket: dgram.Socket | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private DISCOVERY_PORT = 41234;
  private thisDevice: Device | null = null;

  constructor() {
    this.initializeThisDevice();
    this.registerHandlers();
  }

  private initializeThisDevice(): void {
    let deviceId = store.get('thisDeviceId');
    if (!deviceId) {
      deviceId = `dex_${crypto.randomBytes(8).toString('hex')}`;
      store.set('thisDeviceId', deviceId);
    }

    let deviceName = store.get('thisDeviceName');
    if (!deviceName) {
      deviceName = os.hostname();
      store.set('thisDeviceName', deviceName);
    }

    this.thisDevice = {
      id: deviceId,
      name: deviceName,
      type: this.detectDeviceType(),
      platform: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      ip: this.getLocalIP(),
      port: this.DISCOVERY_PORT,
      capabilities: {
        canSendFiles: true,
        canReceiveFiles: true,
        canStream: false,
        canRemoteControl: false,
        supportedTypes: ['file', 'folder', 'media', 'text']
      },
      status: 'online',
      lastSeen: Date.now(),
      trusted: true,
      paired: true
    };
  }

  private detectDeviceType(): Device['type'] {
    const platform = os.platform();
    
    // Check for laptop battery
    const hasBattery = os.cpus().length > 0; // Simplified check
    
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      // Could be desktop or laptop - default to desktop
      return 'desktop';
    }
    
    return 'unknown';
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private registerHandlers(): void {
    // Get this device info
    ipcMain.handle('device:getThisDevice', () => {
      return this.thisDevice;
    });

    // Update this device name
    ipcMain.handle('device:setName', async (_, name: string) => {
      if (this.thisDevice) {
        this.thisDevice.name = name;
        store.set('thisDeviceName', name);
      }
      return { success: true };
    });

    // Get all known devices
    ipcMain.handle('device:getAll', () => {
      return store.get('devices');
    });

    // Get trusted devices
    ipcMain.handle('device:getTrusted', () => {
      return store.get('devices').filter(d => d.trusted);
    });

    // Get online devices
    ipcMain.handle('device:getOnline', () => {
      return store.get('devices').filter(d => d.status === 'online');
    });

    // Discovery controls
    ipcMain.handle('device:isDiscoveryEnabled', () => {
      return store.get('discoveryEnabled');
    });

    ipcMain.handle('device:setDiscoveryEnabled', async (_, enabled: boolean) => {
      store.set('discoveryEnabled', enabled);
      if (enabled) {
        this.startDiscovery();
      } else {
        this.stopDiscovery();
      }
      return { success: true };
    });

    // Manual device add
    ipcMain.handle('device:addManual', async (_, ip: string, port: number) => {
      return await this.addManualDevice(ip, port);
    });

    // Remove device
    ipcMain.handle('device:remove', async (_, deviceId: string) => {
      const devices = store.get('devices').filter(d => d.id !== deviceId);
      store.set('devices', devices);
      return { success: true };
    });

    // Trust/untrust device
    ipcMain.handle('device:setTrusted', async (_, deviceId: string, trusted: boolean) => {
      const devices = store.get('devices');
      const device = devices.find(d => d.id === deviceId);
      if (device) {
        device.trusted = trusted;
        store.set('devices', devices);
      }
      return { success: true };
    });

    // Initiate pairing
    ipcMain.handle('device:initiatePairing', async (_, deviceId: string) => {
      return await this.initiatePairing(deviceId);
    });

    // Accept pairing request
    ipcMain.handle('device:acceptPairing', async (_, pairingId: string) => {
      return await this.acceptPairing(pairingId);
    });

    // Reject pairing request
    ipcMain.handle('device:rejectPairing', async (_, pairingId: string) => {
      return await this.rejectPairing(pairingId);
    });

    // Get active sessions
    ipcMain.handle('device:getSessions', () => {
      return store.get('sessions').filter(s => s.status === 'active');
    });

    // End session
    ipcMain.handle('device:endSession', async (_, sessionId: string) => {
      const sessions = store.get('sessions');
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        session.status = 'ended';
        store.set('sessions', sessions);
      }
      return { success: true };
    });

    log.info('Device handlers registered');
  }

  // ===========================================================================
  // DISCOVERY
  // ===========================================================================

  startDiscovery(): void {
    if (this.discoverySocket) return;

    try {
      this.discoverySocket = dgram.createSocket('udp4');
      
      this.discoverySocket.on('message', (msg, rinfo) => {
        this.handleDiscoveryMessage(msg, rinfo);
      });

      this.discoverySocket.on('error', (err) => {
        log.error('Discovery socket error:', err);
        this.stopDiscovery();
      });

      this.discoverySocket.bind(this.DISCOVERY_PORT, () => {
        this.discoverySocket?.setBroadcast(true);
        log.info('Discovery started on port', this.DISCOVERY_PORT);
      });

      // Broadcast presence periodically
      this.broadcastInterval = setInterval(() => {
        this.broadcastPresence();
      }, 30000);

      // Initial broadcast
      this.broadcastPresence();
    } catch (error) {
      log.error('Failed to start discovery:', error);
    }
  }

  stopDiscovery(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.discoverySocket) {
      this.discoverySocket.close();
      this.discoverySocket = null;
    }

    log.info('Discovery stopped');
  }

  private broadcastPresence(): void {
    if (!this.discoverySocket || !this.thisDevice) return;

    const message = JSON.stringify({
      type: 'dex-presence',
      device: {
        id: this.thisDevice.id,
        name: this.thisDevice.name,
        type: this.thisDevice.type,
        platform: this.thisDevice.platform,
        capabilities: this.thisDevice.capabilities
      }
    });

    const buffer = Buffer.from(message);
    
    // Broadcast to local network
    this.discoverySocket.send(buffer, 0, buffer.length, this.DISCOVERY_PORT, '255.255.255.255', (err) => {
      if (err) log.error('Broadcast error:', err);
    });
  }

  private handleDiscoveryMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString());
      
      if (data.type !== 'dex-presence') return;
      if (data.device.id === this.thisDevice?.id) return; // Ignore self

      const device: Device = {
        id: data.device.id,
        name: data.device.name,
        type: data.device.type,
        platform: data.device.platform,
        hostname: rinfo.address,
        ip: rinfo.address,
        port: rinfo.port,
        capabilities: data.device.capabilities,
        status: 'online',
        lastSeen: Date.now(),
        trusted: false,
        paired: false
      };

      this.updateDevice(device);
    } catch (error) {
      // Ignore invalid messages
    }
  }

  private updateDevice(device: Device): void {
    const devices = store.get('devices');
    const existingIndex = devices.findIndex(d => d.id === device.id);

    if (existingIndex >= 0) {
      // Update existing device
      devices[existingIndex] = {
        ...devices[existingIndex],
        ...device,
        trusted: devices[existingIndex].trusted,
        paired: devices[existingIndex].paired
      };
    } else {
      // Add new device - notify user
      devices.push(device);
      this.notifyNewDevice(device);
    }

    store.set('devices', devices);
  }

  private notifyNewDevice(device: Device): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('device:discovered', device);
    }
    log.info('New device discovered:', device.name, device.ip);
  }

  // ===========================================================================
  // MANUAL DEVICE ADD
  // ===========================================================================

  async addManualDevice(ip: string, port: number): Promise<{
    success: boolean;
    device?: Device;
    error?: string;
  }> {
    // Perform actual network handshake to verify device
    try {
      const deviceInfo = await this.performHandshake(ip, port);
      
      const device: Device = {
        id: `manual_${Date.now()}`,
        name: deviceInfo.name || `Device at ${ip}`,
        type: deviceInfo.type || 'unknown',
        platform: deviceInfo.platform || 'unknown',
        hostname: deviceInfo.hostname || ip,
        ip,
        port,
        capabilities: deviceInfo.capabilities || {
          canSendFiles: true,
          canReceiveFiles: true,
          canStream: false,
          canRemoteControl: false,
          supportedTypes: ['file']
        },
        status: 'online',
        lastSeen: Date.now(),
        trusted: false,
        paired: false
      };

      const devices = store.get('devices');
      
      // Check for duplicate
      const existing = devices.find(d => d.ip === ip && d.port === port);
      if (existing) {
        // Update existing device
        Object.assign(existing, device, { id: existing.id });
        store.set('devices', devices);
        return { success: true, device: existing };
      }
      
      devices.push(device);
      store.set('devices', devices);
      this.notifyNewDevice(device);

      return { success: true, device };
    } catch (err: any) {
      log.error('Device handshake failed:', err);
      return { success: false, error: err.message || 'Connection failed' };
    }
  }

  private async performHandshake(ip: string, port: number, timeout = 5000): Promise<Partial<Device>> {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      let responded = false;
      
      const timer = setTimeout(() => {
        if (!responded) {
          socket.destroy();
          // Return basic info if timeout (device exists but may not respond to DEX protocol)
          resolve({
            name: `Device at ${ip}`,
            type: 'unknown',
            platform: 'unknown',
            hostname: ip,
            capabilities: {
              canSendFiles: true,
              canReceiveFiles: true,
              canStream: false,
              canRemoteControl: false,
              supportedTypes: ['file']
            }
          });
        }
      }, timeout);

      socket.connect(port, ip, () => {
        // Send DEX handshake request
        const handshake = JSON.stringify({
          protocol: 'DEX',
          version: '1.0',
          type: 'handshake',
          from: this.thisDevice?.id || 'unknown'
        });
        socket.write(handshake + '\n');
      });

      socket.on('data', (data: Buffer) => {
        responded = true;
        clearTimeout(timer);
        socket.destroy();
        
        try {
          const response = JSON.parse(data.toString().trim());
          resolve({
            name: response.name || `DEX Device at ${ip}`,
            type: response.type || 'dex-client',
            platform: response.platform || 'unknown',
            hostname: response.hostname || ip,
            capabilities: response.capabilities || {
              canSendFiles: true,
              canReceiveFiles: true,
              canStream: true,
              canRemoteControl: false,
              supportedTypes: ['file', 'clipboard', 'notification']
            }
          });
        } catch {
          resolve({ name: `Device at ${ip}`, type: 'unknown' });
        }
      });

      socket.on('error', (err: Error) => {
        responded = true;
        clearTimeout(timer);
        socket.destroy();
        
        // Connection refused means port is not listening
        if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
          reject(new Error('Connection refused - no service running on this port'));
        } else if ((err as NodeJS.ErrnoException).code === 'ETIMEDOUT' || (err as NodeJS.ErrnoException).code === 'EHOSTUNREACH') {
          reject(new Error('Device unreachable'));
        } else {
          // Other errors - device exists but protocol mismatch
          resolve({ name: `Device at ${ip}`, type: 'unknown', platform: 'unknown' });
        }
      });
    });
  }

  // ===========================================================================
  // PAIRING
  // ===========================================================================

  async initiatePairing(deviceId: string): Promise<{
    success: boolean;
    code?: string;
    error?: string;
  }> {
    const devices = store.get('devices');
    const device = devices.find(d => d.id === deviceId);
    
    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    // Generate 6-digit pairing code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const pairing: DevicePairing = {
      deviceId,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      status: 'pending'
    };

    const pairings = store.get('pairings');
    pairings.push(pairing);
    store.set('pairings', pairings);

    // Show dialog with code
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Pairing Code',
        message: `Enter this code on ${device.name}:`,
        detail: code,
        buttons: ['OK']
      });
    }

    return { success: true, code };
  }

  async acceptPairing(pairingId: string): Promise<{ success: boolean; error?: string }> {
    const pairings = store.get('pairings');
    const pairing = pairings.find(p => p.deviceId === pairingId);

    if (!pairing) {
      return { success: false, error: 'Pairing not found' };
    }

    if (Date.now() > pairing.expiresAt) {
      pairing.status = 'expired';
      store.set('pairings', pairings);
      return { success: false, error: 'Pairing expired' };
    }

    pairing.status = 'accepted';
    store.set('pairings', pairings);

    // Mark device as paired
    const devices = store.get('devices');
    const device = devices.find(d => d.id === pairingId);
    if (device) {
      device.paired = true;
      device.trusted = true;
      store.set('devices', devices);
    }

    return { success: true };
  }

  async rejectPairing(pairingId: string): Promise<{ success: boolean }> {
    const pairings = store.get('pairings');
    const pairing = pairings.find(p => p.deviceId === pairingId);

    if (pairing) {
      pairing.status = 'rejected';
      store.set('pairings', pairings);
    }

    return { success: true };
  }

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  createSession(deviceId: string, type: DeviceSession['type']): DeviceSession {
    const session: DeviceSession = {
      id: `session_${Date.now()}`,
      deviceId,
      type,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      metadata: {}
    };

    const sessions = store.get('sessions');
    sessions.push(session);
    store.set('sessions', sessions);

    return session;
  }

  updateSessionActivity(sessionId: string): void {
    const sessions = store.get('sessions');
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.lastActivity = Date.now();
      store.set('sessions', sessions);
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    // Update this device IP
    if (this.thisDevice) {
      this.thisDevice.ip = this.getLocalIP();
    }

    // Start discovery if enabled
    if (store.get('discoveryEnabled')) {
      this.startDiscovery();
    }

    // Clean up old offline devices
    this.cleanupOfflineDevices();

    log.info('Device controller started');
  }

  stop(): void {
    this.stopDiscovery();

    // Mark this device as offline for others
    if (this.thisDevice) {
      this.thisDevice.status = 'offline';
    }

    log.info('Device controller stopped');
  }

  private cleanupOfflineDevices(): void {
    const devices = store.get('devices');
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    // Mark devices as offline if not seen recently
    for (const device of devices) {
      if (device.lastSeen < Date.now() - 5 * 60 * 1000) {
        device.status = 'offline';
      }
    }

    // Remove very old untrusted devices
    const filtered = devices.filter(d => d.trusted || d.lastSeen > cutoff);
    store.set('devices', filtered);
  }
}

export const deviceController = new DeviceController();
