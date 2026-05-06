// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Connection Controller
// Phase 12: Tunneling & Connection Management
// Manages WiFi, Bluetooth, and Network Connections
// ===========================================================================

import { ipcMain, app } from 'electron';
import * as os from 'os';
import * as net from 'net';
import * as dgram from 'dgram';
import si from 'systeminformation';
import Store from 'electron-store';
import log from 'electron-log';
// Native module available for basic network status; SI kept for WiFi/interface details
import { NativeSystem, isNativeAvailable } from '../native/bridge';

// ===========================================================================
// TYPES
// ===========================================================================

export interface ConnectionChannel {
  id: string;
  type: 'wifi' | 'bluetooth' | 'ethernet' | 'cellular';
  name: string;
  direction: 'send' | 'receive' | 'bidirectional';
  scope: 'files' | 'media' | 'sessions' | 'all';
  status: 'open' | 'closed' | 'error';
  security: 'encrypted' | 'plain' | 'unknown';
  createdAt: number;
  lastUsed?: number;
  bytesTransferred: number;
  metadata: Record<string, any>;
}

export interface NetworkInfo {
  hostname: string;
  localIp: string;
  publicIp?: string;
  networkInterfaces: NetworkInterface[];
  wifiConnected: boolean;
  wifiSSID?: string;
  wifiStrength?: number;
  ethernetConnected: boolean;
  internetAccess: boolean;
}

export interface NetworkInterface {
  name: string;
  type: 'wifi' | 'ethernet' | 'loopback' | 'other';
  ip4: string;
  ip6?: string;
  mac: string;
  speed?: number;
  state: 'up' | 'down';
}

export interface ConnectionPermissions {
  wifiEnabled: boolean;
  bluetoothEnabled: boolean;
  cellularEnabled: boolean;
  allowIncoming: boolean;
  allowOutgoing: boolean;
  trustedDevices: string[];
}

// ===========================================================================
// STORE
// ===========================================================================

const store = new Store<{
  connectionPermissions: ConnectionPermissions;
  activeChannels: ConnectionChannel[];
  channelHistory: ConnectionChannel[];
}>({
  defaults: {
    connectionPermissions: {
      wifiEnabled: true,
      bluetoothEnabled: false, // Disabled by default
      cellularEnabled: false, // Disabled by default
      allowIncoming: false, // Must be explicitly enabled
      allowOutgoing: true,
      trustedDevices: []
    },
    activeChannels: [],
    channelHistory: []
  }
});

// ===========================================================================
// CONTROLLER
// ===========================================================================

class ConnectionController {
  private networkInfo: NetworkInfo | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private discoverySocket: dgram.Socket | null = null;
  private activeChannels: Map<string, ConnectionChannel> = new Map();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get network info
    ipcMain.handle('connection:getNetworkInfo', async () => {
      return await this.getNetworkInfo();
    });

    // Get connection permissions
    ipcMain.handle('connection:getPermissions', () => {
      return store.get('connectionPermissions');
    });

    // Set connection permissions
    ipcMain.handle('connection:setPermissions', async (_, perms: Partial<ConnectionPermissions>) => {
      const current = store.get('connectionPermissions');
      store.set('connectionPermissions', { ...current, ...perms });
      return { success: true };
    });

    // Enable/disable all networking (kill switch)
    ipcMain.handle('connection:setNetworkingEnabled', async (_, enabled: boolean) => {
      const perms = store.get('connectionPermissions');
      store.set('connectionPermissions', {
        ...perms,
        wifiEnabled: enabled,
        bluetoothEnabled: enabled ? perms.bluetoothEnabled : false,
        cellularEnabled: enabled ? perms.cellularEnabled : false,
        allowIncoming: enabled ? perms.allowIncoming : false,
        allowOutgoing: enabled
      });
      
      // Close all channels if disabled
      if (!enabled) {
        this.closeAllChannels();
      }
      
      return { success: true };
    });

    // Get active channels
    ipcMain.handle('connection:getChannels', () => {
      return Array.from(this.activeChannels.values());
    });

    // Open a channel
    ipcMain.handle('connection:openChannel', async (_, config: Omit<ConnectionChannel, 'id' | 'createdAt' | 'bytesTransferred' | 'status'>) => {
      return await this.openChannel(config);
    });

    // Close a channel
    ipcMain.handle('connection:closeChannel', async (_, channelId: string) => {
      return this.closeChannel(channelId);
    });

    // Check if connection type is allowed
    ipcMain.handle('connection:isTypeAllowed', (_, type: 'wifi' | 'bluetooth' | 'cellular') => {
      return this.isConnectionTypeAllowed(type);
    });

    // Add trusted device
    ipcMain.handle('connection:addTrustedDevice', async (_, deviceId: string) => {
      const perms = store.get('connectionPermissions');
      if (!perms.trustedDevices.includes(deviceId)) {
        perms.trustedDevices.push(deviceId);
        store.set('connectionPermissions', perms);
      }
      return { success: true };
    });

    // Remove trusted device
    ipcMain.handle('connection:removeTrustedDevice', async (_, deviceId: string) => {
      const perms = store.get('connectionPermissions');
      perms.trustedDevices = perms.trustedDevices.filter(d => d !== deviceId);
      store.set('connectionPermissions', perms);
      return { success: true };
    });

    // Check if device is trusted
    ipcMain.handle('connection:isDeviceTrusted', (_, deviceId: string) => {
      const perms = store.get('connectionPermissions');
      return perms.trustedDevices.includes(deviceId);
    });

    // Test connection to host
    ipcMain.handle('connection:testConnection', async (_, host: string, port: number) => {
      return await this.testConnection(host, port);
    });

    // Get local IP addresses
    ipcMain.handle('connection:getLocalIPs', () => {
      return this.getLocalIPs();
    });

    log.info('Connection handlers registered');
  }

  // ===========================================================================
  // NETWORK INFO
  // ===========================================================================

  async getNetworkInfo(): Promise<NetworkInfo> {
    try {
      const [interfaces, wifi, defaultNet] = await Promise.all([
        si.networkInterfaces(),
        si.wifiNetworks().catch(() => []),
        si.networkInterfaceDefault()
      ]);

      const networkInterfaces: NetworkInterface[] = [];
      let localIp = '127.0.0.1';
      let wifiConnected = false;
      let ethernetConnected = false;
      let wifiSSID: string | undefined;
      let wifiStrength: number | undefined;

      const ifaces = Array.isArray(interfaces) ? interfaces : [interfaces];
      
      for (const iface of ifaces) {
        if (iface.internal) continue;

        const type: NetworkInterface['type'] = 
          iface.type === 'wireless' ? 'wifi' :
          iface.type === 'wired' ? 'ethernet' : 'other';

        networkInterfaces.push({
          name: iface.iface,
          type,
          ip4: iface.ip4 || '',
          ip6: iface.ip6 || undefined,
          mac: iface.mac,
          speed: iface.speed || undefined,
          state: iface.operstate === 'up' ? 'up' : 'down'
        });

        if (iface.operstate === 'up' && iface.ip4) {
          if (type === 'wifi') {
            wifiConnected = true;
            localIp = iface.ip4;
          } else if (type === 'ethernet') {
            ethernetConnected = true;
            if (!wifiConnected) localIp = iface.ip4;
          }
        }
      }

      // Get WiFi details
      if (Array.isArray(wifi) && wifi.length > 0) {
        const connected = wifi.find((w: any) => w.signalLevel !== undefined);
        if (connected) {
          wifiSSID = (connected as any).ssid;
          wifiStrength = (connected as any).quality || (connected as any).signalLevel;
        }
      }

      // Check internet access
      const internetAccess = await this.checkInternetAccess();

      this.networkInfo = {
        hostname: os.hostname(),
        localIp,
        networkInterfaces,
        wifiConnected,
        wifiSSID,
        wifiStrength,
        ethernetConnected,
        internetAccess
      };

      return this.networkInfo;
    } catch (error) {
      log.error('Failed to get network info:', error);
      return {
        hostname: os.hostname(),
        localIp: '127.0.0.1',
        networkInterfaces: [],
        wifiConnected: false,
        ethernetConnected: false,
        internetAccess: false
      };
    }
  }

  private async checkInternetAccess(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      // Try to connect to a reliable host
      socket.connect(80, '1.1.1.1');
    });
  }

  getLocalIPs(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          ips.push(info.address);
        }
      }
    }

    return ips;
  }

  // ===========================================================================
  // CHANNEL MANAGEMENT
  // ===========================================================================

  async openChannel(config: Omit<ConnectionChannel, 'id' | 'createdAt' | 'bytesTransferred' | 'status'>): Promise<{
    success: boolean;
    channel?: ConnectionChannel;
    error?: string;
  }> {
    // Check permissions
    if (!this.isConnectionTypeAllowed(config.type)) {
      return { 
        success: false, 
        error: `${config.type} connections are disabled` 
      };
    }

    const perms = store.get('connectionPermissions');
    
    if (config.direction === 'receive' && !perms.allowIncoming) {
      return { success: false, error: 'Incoming connections are disabled' };
    }

    if (config.direction === 'send' && !perms.allowOutgoing) {
      return { success: false, error: 'Outgoing connections are disabled' };
    }

    const channel: ConnectionChannel = {
      ...config,
      id: `channel_${Date.now()}`,
      status: 'open',
      createdAt: Date.now(),
      bytesTransferred: 0
    };

    this.activeChannels.set(channel.id, channel);
    
    log.info('Channel opened:', channel.id, channel.type);
    return { success: true, channel };
  }

  closeChannel(channelId: string): { success: boolean; error?: string } {
    const channel = this.activeChannels.get(channelId);
    if (!channel) {
      return { success: false, error: 'Channel not found' };
    }

    channel.status = 'closed';
    channel.lastUsed = Date.now();

    // Archive to history
    const history = store.get('channelHistory');
    history.push(channel);
    if (history.length > 100) history.shift();
    store.set('channelHistory', history);

    this.activeChannels.delete(channelId);
    
    log.info('Channel closed:', channelId);
    return { success: true };
  }

  closeAllChannels(): void {
    for (const [id] of this.activeChannels) {
      this.closeChannel(id);
    }
  }

  isConnectionTypeAllowed(type: 'wifi' | 'bluetooth' | 'ethernet' | 'cellular'): boolean {
    const perms = store.get('connectionPermissions');
    
    switch (type) {
      case 'wifi':
        return perms.wifiEnabled;
      case 'bluetooth':
        return perms.bluetoothEnabled;
      case 'cellular':
        return perms.cellularEnabled;
      case 'ethernet':
        return perms.wifiEnabled; // Ethernet follows WiFi permission
      default:
        return false;
    }
  }

  updateChannelStats(channelId: string, bytesTransferred: number): void {
    const channel = this.activeChannels.get(channelId);
    if (channel) {
      channel.bytesTransferred += bytesTransferred;
      channel.lastUsed = Date.now();
    }
  }

  // ===========================================================================
  // CONNECTION TESTING
  // ===========================================================================

  async testConnection(host: string, port: number): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const perms = store.get('connectionPermissions');
    if (!perms.allowOutgoing) {
      return { success: false, error: 'Outgoing connections disabled' };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, latency });
      });

      socket.on('error', (error) => {
        socket.destroy();
        resolve({ success: false, error: error.message });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      socket.connect(port, host);
    });
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    // Initial network info fetch
    this.getNetworkInfo();

    // Periodic updates (every 60 seconds)
    this.updateInterval = setInterval(() => {
      this.getNetworkInfo();
    }, 60000);

    log.info('Connection controller started');
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.closeAllChannels();

    if (this.discoverySocket) {
      this.discoverySocket.close();
      this.discoverySocket = null;
    }

    log.info('Connection controller stopped');
  }

  getChannels(): ConnectionChannel[] {
    return Array.from(this.activeChannels.values());
  }
}

export const connectionController = new ConnectionController();
