// ═══════════════════════════════════════════════════════════════════════════
// DEX - System Map Controller
// Phase 12: Native System Integration - Central Hub for System State
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, app } from 'electron';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import si from 'systeminformation';
import Store from 'electron-store';
import { NativeSystem, isNativeAvailable } from '../native/bridge';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemDevice {
  id: string;
  name: string;
  type: 'local' | 'network' | 'bluetooth' | 'usb';
  status: 'online' | 'offline' | 'busy' | 'sleeping';
  lastSeen: number;
  capabilities: string[];
  metadata: Record<string, any>;
}

export interface SystemConnection {
  id: string;
  type: 'wifi' | 'bluetooth' | 'ethernet' | 'cellular';
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  strength?: number; // 0-100
  speed?: number; // Mbps
  secure: boolean;
  metadata: Record<string, any>;
}

export interface SystemStorage {
  id: string;
  name: string;
  type: 'internal' | 'external' | 'network' | 'cloud';
  mount: string;
  totalGB: number;
  usedGB: number;
  availableGB: number;
  percentUsed: number;
  writable: boolean;
}

export interface SystemSession {
  id: string;
  name: string;
  startedAt: number;
  type: 'work' | 'transfer' | 'sync' | 'automation';
  status: 'active' | 'paused' | 'completed' | 'failed';
  progress?: number;
  metadata: Record<string, any>;
}

export interface ActiveTransfer {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'media' | 'session';
  direction: 'send' | 'receive';
  source: string;
  destination: string;
  sizeBytes: number;
  transferredBytes: number;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  speed?: number; // bytes/sec
  eta?: number; // seconds
  error?: string;
}

export interface SystemMap {
  localDevice: SystemDevice;
  devices: SystemDevice[];
  connections: SystemConnection[];
  storage: SystemStorage[];
  sessions: SystemSession[];
  transfers: ActiveTransfer[];
  lastUpdated: number;
}

export interface SystemHealth {
  cpu: { usage: number; temperature?: number; throttled: boolean };
  memory: { usedPercent: number; availableGB: number; pressure: 'low' | 'medium' | 'high' };
  disk: { readSpeed: number; writeSpeed: number; busy: boolean };
  network: { uploadSpeed: number; downloadSpeed: number; latency: number };
  power: { onBattery: boolean; batteryPercent?: number; charging: boolean };
  overall: 'healthy' | 'moderate' | 'stressed' | 'critical';
}

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

const store = new Store<{
  knownDevices: SystemDevice[];
  transferHistory: ActiveTransfer[];
  sessionHistory: SystemSession[];
}>({
  defaults: {
    knownDevices: [],
    transferHistory: [],
    sessionHistory: []
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class SystemMapController {
  private systemMap: SystemMap;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private mapUpdateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.systemMap = this.createEmptyMap();
    this.registerHandlers();
  }

  private createEmptyMap(): SystemMap {
    return {
      localDevice: this.createLocalDevice(),
      devices: [],
      connections: [],
      storage: [],
      sessions: [],
      transfers: [],
      lastUpdated: Date.now()
    };
  }

  private createLocalDevice(): SystemDevice {
    return {
      id: 'local',
      name: os.hostname(),
      type: 'local',
      status: 'online',
      lastSeen: Date.now(),
      capabilities: ['transfer', 'storage', 'automation', 'media'],
      metadata: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        username: os.userInfo().username
      }
    };
  }

  private registerHandlers(): void {
    // Get full system map
    ipcMain.handle('systemMap:get', async () => {
      await this.refreshSystemMap();
      return this.systemMap;
    });

    // Get system health
    ipcMain.handle('systemMap:getHealth', async () => {
      return await this.getSystemHealth();
    });

    // Get local device info
    ipcMain.handle('systemMap:getLocalDevice', () => {
      return this.systemMap.localDevice;
    });

    // Get all connections
    ipcMain.handle('systemMap:getConnections', async () => {
      await this.refreshConnections();
      return this.systemMap.connections;
    });

    // Get all storage
    ipcMain.handle('systemMap:getStorage', async () => {
      await this.refreshStorage();
      return this.systemMap.storage;
    });

    // Get known devices
    ipcMain.handle('systemMap:getDevices', () => {
      return this.systemMap.devices;
    });

    // Add known device
    ipcMain.handle('systemMap:addDevice', async (_, device: Omit<SystemDevice, 'id'>) => {
      const newDevice: SystemDevice = {
        ...device,
        id: `device_${Date.now()}`
      };
      this.systemMap.devices.push(newDevice);
      const knownDevices = store.get('knownDevices');
      knownDevices.push(newDevice);
      store.set('knownDevices', knownDevices);
      return newDevice;
    });

    // Remove device
    ipcMain.handle('systemMap:removeDevice', async (_, deviceId: string) => {
      this.systemMap.devices = this.systemMap.devices.filter(d => d.id !== deviceId);
      const knownDevices = store.get('knownDevices').filter(d => d.id !== deviceId);
      store.set('knownDevices', knownDevices);
      return { success: true };
    });

    // Get active sessions
    ipcMain.handle('systemMap:getSessions', () => {
      return this.systemMap.sessions;
    });

    // Get active transfers
    ipcMain.handle('systemMap:getTransfers', () => {
      return this.systemMap.transfers;
    });

    // Check if system can handle transfer
    ipcMain.handle('systemMap:canTransfer', async (_, sizeBytes: number) => {
      const health = await this.getSystemHealth();
      return this.evaluateTransferCapacity(health, sizeBytes);
    });

    // Get transfer history
    ipcMain.handle('systemMap:getTransferHistory', (_, limit = 50) => {
      const history = store.get('transferHistory');
      return history.slice(-limit);
    });

    // Clear transfer history
    ipcMain.handle('systemMap:clearTransferHistory', () => {
      store.set('transferHistory', []);
      return { success: true };
    });

    log.info('SystemMap handlers registered');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFRESH METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  async refreshSystemMap(): Promise<void> {
    try {
      await Promise.all([
        this.refreshConnections(),
        this.refreshStorage()
      ]);
      
      // Load known devices
      this.systemMap.devices = store.get('knownDevices');
      this.systemMap.localDevice.lastSeen = Date.now();
      this.systemMap.lastUpdated = Date.now();
    } catch (error) {
      log.error('Failed to refresh system map:', error);
    }
  }

  async refreshConnections(): Promise<void> {
    try {
      const [networkInterfaces, wifiNetworks] = await Promise.all([
        si.networkInterfaces(),
        si.wifiNetworks().catch(() => [])
      ]);

      const connections: SystemConnection[] = [];

      // Add network interfaces
      const interfaces = Array.isArray(networkInterfaces) ? networkInterfaces : [networkInterfaces];
      for (const iface of interfaces) {
        if (iface.operstate === 'up' && !iface.internal) {
          connections.push({
            id: `net_${iface.iface}`,
            type: iface.type === 'wireless' ? 'wifi' : 'ethernet',
            name: iface.iface,
            status: 'connected',
            speed: iface.speed || undefined,
            secure: true,
            metadata: {
              ip4: iface.ip4,
              ip6: iface.ip6,
              mac: iface.mac
            }
          });
        }
      }

      // Add WiFi info if available
      if (Array.isArray(wifiNetworks) && wifiNetworks.length > 0) {
        const current = wifiNetworks.find((w: any) => w.security !== undefined);
        if (current) {
          const existingWifi = connections.find(c => c.type === 'wifi');
          if (existingWifi) {
            existingWifi.name = (current as any).ssid || existingWifi.name;
            existingWifi.strength = (current as any).quality || (current as any).signalLevel;
            existingWifi.secure = (current as any).security !== 'none';
          }
        }
      }

      this.systemMap.connections = connections;
    } catch (error) {
      log.error('Failed to refresh connections:', error);
    }
  }

  async refreshStorage(): Promise<void> {
    try {
      // Use Rust native module when available
      if (isNativeAvailable()) {
        const nativeDisks = NativeSystem.getDisks();
        if (nativeDisks.length > 0) {
          this.systemMap.storage = nativeDisks.map(d => ({
            id: `storage_${d.mount.replace(/[^a-zA-Z0-9]/g, '_')}`,
            name: d.name || d.fsType,
            type: 'internal' as const,
            mount: d.mount,
            totalGB: Math.round((d.total / (1024 * 1024 * 1024)) * 100) / 100,
            usedGB: Math.round((d.used / (1024 * 1024 * 1024)) * 100) / 100,
            availableGB: Math.round((d.available / (1024 * 1024 * 1024)) * 100) / 100,
            percentUsed: Math.round(d.percent * 10) / 10,
            writable: true
          }));
          return;
        }
      }

      // Fallback to systeminformation
      const disks = await si.fsSize();
      
      this.systemMap.storage = disks.map(disk => ({
        id: `storage_${disk.fs.replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: disk.fs,
        type: disk.type?.includes('network') ? 'network' : 'internal',
        mount: disk.mount,
        totalGB: Math.round((disk.size / (1024 * 1024 * 1024)) * 100) / 100,
        usedGB: Math.round((disk.used / (1024 * 1024 * 1024)) * 100) / 100,
        availableGB: Math.round((disk.available / (1024 * 1024 * 1024)) * 100) / 100,
        percentUsed: Math.round(disk.use * 10) / 10,
        writable: !disk.rw || disk.rw === true
      }));
    } catch (error) {
      log.error('Failed to refresh storage:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  async getSystemHealth(): Promise<SystemHealth> {
    try {
      // Use Rust native module for core stats (CPU, memory, battery)
      const nativeStats = NativeSystem.getStats();
      if (nativeStats) {
        const nativeNetworks = NativeSystem.getNetworks();
        const totalUpload = nativeNetworks.reduce((sum, n) => sum + n.txBytes, 0);
        const totalDownload = nativeNetworks.reduce((sum, n) => sum + n.rxBytes, 0);
        const memPressure = nativeStats.memoryPercent > 90 ? 'high' : nativeStats.memoryPercent > 70 ? 'medium' : 'low';

        let overall: SystemHealth['overall'] = 'healthy';
        if (nativeStats.cpuPercent > 90 || nativeStats.memoryPercent > 95) {
          overall = 'critical';
        } else if (nativeStats.cpuPercent > 75 || nativeStats.memoryPercent > 85) {
          overall = 'stressed';
        } else if (nativeStats.cpuPercent > 50 || nativeStats.memoryPercent > 70) {
          overall = 'moderate';
        }

        // Disk I/O still from systeminformation (native doesn't track rates yet)
        let diskIO: any = null;
        try { diskIO = await si.disksIO(); } catch { /* ignore */ }

        return {
          cpu: {
            usage: Math.round(nativeStats.cpuPercent),
            throttled: nativeStats.cpuPercent > 85
          },
          memory: {
            usedPercent: Math.round(nativeStats.memoryPercent),
            availableGB: Math.round((nativeStats.memoryAvailable / (1024 * 1024 * 1024)) * 100) / 100,
            pressure: memPressure
          },
          disk: {
            readSpeed: diskIO?.rIO_sec || 0,
            writeSpeed: diskIO?.wIO_sec || 0,
            busy: (diskIO?.rIO_sec || 0) + (diskIO?.wIO_sec || 0) > 50000000
          },
          network: {
            uploadSpeed: totalUpload,
            downloadSpeed: totalDownload,
            latency: 0
          },
          power: {
            onBattery: nativeStats.batteryPercent != null && !nativeStats.batteryCharging,
            batteryPercent: nativeStats.batteryPercent ?? undefined,
            charging: nativeStats.batteryCharging ?? false
          },
          overall
        };
      }

      // Fallback to systeminformation
      const [cpuLoad, mem, battery, networkStats, diskIO] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.battery(),
        si.networkStats(),
        si.disksIO()
      ]);

      const memPercent = (mem.used / mem.total) * 100;
      const memPressure = memPercent > 90 ? 'high' : memPercent > 70 ? 'medium' : 'low';

      const netStats = Array.isArray(networkStats) ? networkStats : [networkStats];
      const totalUpload = netStats.reduce((sum, n) => sum + (n.tx_sec || 0), 0);
      const totalDownload = netStats.reduce((sum, n) => sum + (n.rx_sec || 0), 0);

      let overall: SystemHealth['overall'] = 'healthy';
      if (cpuLoad.currentLoad > 90 || memPercent > 95) {
        overall = 'critical';
      } else if (cpuLoad.currentLoad > 75 || memPercent > 85) {
        overall = 'stressed';
      } else if (cpuLoad.currentLoad > 50 || memPercent > 70) {
        overall = 'moderate';
      }

      return {
        cpu: {
          usage: Math.round(cpuLoad.currentLoad),
          throttled: cpuLoad.currentLoad > 85
        },
        memory: {
          usedPercent: Math.round(memPercent),
          availableGB: Math.round((mem.available / (1024 * 1024 * 1024)) * 100) / 100,
          pressure: memPressure
        },
        disk: {
          readSpeed: diskIO?.rIO_sec || 0,
          writeSpeed: diskIO?.wIO_sec || 0,
          busy: (diskIO?.rIO_sec || 0) + (diskIO?.wIO_sec || 0) > 50000000
        },
        network: {
          uploadSpeed: Math.round(totalUpload),
          downloadSpeed: Math.round(totalDownload),
          latency: 0
        },
        power: {
          onBattery: battery.hasBattery && !battery.acConnected,
          batteryPercent: battery.hasBattery ? battery.percent : undefined,
          charging: battery.isCharging
        },
        overall
      };
    } catch (error) {
      log.error('Failed to get system health:', error);
      return {
        cpu: { usage: 0, throttled: false },
        memory: { usedPercent: 0, availableGB: 0, pressure: 'low' },
        disk: { readSpeed: 0, writeSpeed: 0, busy: false },
        network: { uploadSpeed: 0, downloadSpeed: 0, latency: 0 },
        power: { onBattery: false, charging: false },
        overall: 'healthy'
      };
    }
  }

  evaluateTransferCapacity(health: SystemHealth, sizeBytes: number): {
    canTransfer: boolean;
    recommendation: 'proceed' | 'wait' | 'throttle';
    reason?: string;
  } {
    // Critical system state - don't transfer
    if (health.overall === 'critical') {
      return {
        canTransfer: false,
        recommendation: 'wait',
        reason: 'System under heavy load. Wait for resources to free up.'
      };
    }

    // Low battery without charging
    if (health.power.onBattery && (health.power.batteryPercent || 100) < 20) {
      return {
        canTransfer: false,
        recommendation: 'wait',
        reason: 'Battery too low. Connect to power source.'
      };
    }

    // Large transfer on stressed system
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeMB > 100 && health.overall === 'stressed') {
      return {
        canTransfer: true,
        recommendation: 'throttle',
        reason: 'System is busy. Transfer will be throttled.'
      };
    }

    // Memory pressure
    if (health.memory.pressure === 'high') {
      return {
        canTransfer: true,
        recommendation: 'throttle',
        reason: 'Memory pressure detected. Transfer will be throttled.'
      };
    }

    return {
      canTransfer: true,
      recommendation: 'proceed'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION & TRANSFER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  addSession(session: Omit<SystemSession, 'id'>): SystemSession {
    const newSession: SystemSession = {
      ...session,
      id: `session_${Date.now()}`
    };
    this.systemMap.sessions.push(newSession);
    return newSession;
  }

  updateSession(sessionId: string, updates: Partial<SystemSession>): void {
    const session = this.systemMap.sessions.find(s => s.id === sessionId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  removeSession(sessionId: string): void {
    const session = this.systemMap.sessions.find(s => s.id === sessionId);
    if (session) {
      // Archive to history
      const history = store.get('sessionHistory');
      history.push({ ...session, status: 'completed' });
      if (history.length > 100) history.shift();
      store.set('sessionHistory', history);
    }
    this.systemMap.sessions = this.systemMap.sessions.filter(s => s.id !== sessionId);
  }

  addTransfer(transfer: Omit<ActiveTransfer, 'id'>): ActiveTransfer {
    const newTransfer: ActiveTransfer = {
      ...transfer,
      id: `transfer_${Date.now()}`
    };
    this.systemMap.transfers.push(newTransfer);
    return newTransfer;
  }

  updateTransfer(transferId: string, updates: Partial<ActiveTransfer>): void {
    const transfer = this.systemMap.transfers.find(t => t.id === transferId);
    if (transfer) {
      Object.assign(transfer, updates);
    }
  }

  completeTransfer(transferId: string, status: 'completed' | 'failed' | 'cancelled', error?: string): void {
    const transfer = this.systemMap.transfers.find(t => t.id === transferId);
    if (transfer) {
      transfer.status = status;
      if (error) transfer.error = error;
      
      // Archive to history
      const history = store.get('transferHistory');
      history.push({ ...transfer });
      if (history.length > 200) history.shift();
      store.set('transferHistory', history);
    }
    this.systemMap.transfers = this.systemMap.transfers.filter(t => t.id !== transferId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  start(): void {
    // Initial refresh
    this.refreshSystemMap();

    // Periodic map updates (every 30 seconds)
    this.mapUpdateInterval = setInterval(() => {
      this.refreshSystemMap();
    }, 30000);

    log.info('SystemMap controller started');
  }

  stop(): void {
    if (this.mapUpdateInterval) {
      clearInterval(this.mapUpdateInterval);
      this.mapUpdateInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    log.info('SystemMap controller stopped');
  }

  getMap(): SystemMap {
    return this.systemMap;
  }
}

export const systemMapController = new SystemMapController();
