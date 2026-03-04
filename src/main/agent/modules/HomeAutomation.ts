// =============================================================================
// DEX Home Automation Module - Smart Device Control
// Control appliances, security, lighting, and energy management
// =============================================================================

import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as net from 'net';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SmartDevice {
  id: string;
  name: string;
  type: DeviceType;
  protocol: DeviceProtocol;
  address: string;
  port?: number;
  room?: string;
  manufacturer?: string;
  model?: string;
  state: DeviceState;
  capabilities: DeviceCapability[];
  lastSeen: number;
  isOnline: boolean;
}

export type DeviceType = 
  | 'light'
  | 'switch'
  | 'thermostat'
  | 'camera'
  | 'lock'
  | 'sensor'
  | 'appliance'
  | 'speaker'
  | 'tv'
  | 'fan'
  | 'blind'
  | 'garage'
  | 'doorbell'
  | 'vacuum'
  | 'other';

export type DeviceProtocol = 
  | 'mqtt'
  | 'http'
  | 'websocket'
  | 'upnp'
  | 'zigbee'
  | 'zwave'
  | 'bluetooth'
  | 'wifi'
  | 'local';

export interface DeviceState {
  power?: boolean;
  brightness?: number;
  color?: { r: number; g: number; b: number };
  temperature?: number;
  targetTemperature?: number;
  humidity?: number;
  locked?: boolean;
  motion?: boolean;
  open?: boolean;
  battery?: number;
  mode?: string;
  [key: string]: unknown;
}

export type DeviceCapability = 
  | 'power'
  | 'brightness'
  | 'color'
  | 'temperature'
  | 'humidity'
  | 'lock'
  | 'motion'
  | 'camera'
  | 'audio'
  | 'schedule'
  | 'energy';

export interface Room {
  id: string;
  name: string;
  devices: string[];
  icon?: string;
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  actions: SceneAction[];
  icon?: string;
  isActive: boolean;
}

export interface SceneAction {
  deviceId: string;
  state: Partial<DeviceState>;
  delay?: number;
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  trigger: RoutineTrigger;
  conditions?: RoutineCondition[];
  actions: SceneAction[];
  enabled: boolean;
  lastRun?: number;
}

export interface RoutineTrigger {
  type: 'time' | 'sunrise' | 'sunset' | 'device' | 'location' | 'voice';
  config: Record<string, unknown>;
}

export interface RoutineCondition {
  type: 'time' | 'device' | 'weather' | 'presence';
  operator: 'equals' | 'not_equals' | 'greater' | 'less' | 'between';
  value: unknown;
}

export interface EnergyReading {
  deviceId: string;
  timestamp: number;
  power: number; // watts
  energy: number; // kWh
  voltage?: number;
  current?: number;
}

export interface SecurityEvent {
  id: string;
  type: 'motion' | 'door' | 'window' | 'camera' | 'alarm' | 'lock';
  deviceId: string;
  timestamp: number;
  data: Record<string, unknown>;
  acknowledged: boolean;
}

export interface HomeConfig {
  discoveryEnabled: boolean;
  discoveryInterval: number;
  mqttBroker?: string;
  mqttPort?: number;
  securityMode: 'home' | 'away' | 'night' | 'vacation';
  energyTracking: boolean;
  occupancySimulation: boolean;
}

// -----------------------------------------------------------------------------
// Home Automation Manager
// -----------------------------------------------------------------------------

class HomeAutomationManager extends EventEmitter {
  private store: Store;
  private mainWindow: BrowserWindow | null = null;
  private devices: Map<string, SmartDevice> = new Map();
  private rooms: Map<string, Room> = new Map();
  private scenes: Map<string, Scene> = new Map();
  private routines: Map<string, Routine> = new Map();
  private energyReadings: EnergyReading[] = [];
  private securityEvents: SecurityEvent[] = [];
  private config: HomeConfig;
  private discoverySocket: dgram.Socket | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private routineCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();

    this.store = new Store({
      name: 'dex-home-automation',
      defaults: {
        devices: [],
        rooms: [],
        scenes: [],
        routines: [],
        energyHistory: [],
        securityLog: [],
        config: {
          discoveryEnabled: true,
          discoveryInterval: 60000,
          securityMode: 'home',
          energyTracking: true,
          occupancySimulation: false,
        },
      },
    });

    this.config = this.store.get('config') as HomeConfig;
    this.loadData();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPCHandlers();
    this.startDiscovery();
    this.startRoutineChecker();
    this.isRunning = true;
    this.emit('initialized');
  }

  private loadData(): void {
    // Load devices
    const storedDevices = this.store.get('devices', []) as SmartDevice[];
    storedDevices.forEach(device => {
      this.devices.set(device.id, device);
    });

    // Load rooms
    const storedRooms = this.store.get('rooms', []) as Room[];
    storedRooms.forEach(room => {
      this.rooms.set(room.id, room);
    });

    // Load scenes
    const storedScenes = this.store.get('scenes', []) as Scene[];
    storedScenes.forEach(scene => {
      this.scenes.set(scene.id, scene);
    });

    // Load routines
    const storedRoutines = this.store.get('routines', []) as Routine[];
    storedRoutines.forEach(routine => {
      this.routines.set(routine.id, routine);
    });

    // Load energy history (last 7 days)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.energyReadings = (this.store.get('energyHistory', []) as EnergyReading[])
      .filter(r => r.timestamp > cutoff);

    // Load security events (last 30 days)
    const securityCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.securityEvents = (this.store.get('securityLog', []) as SecurityEvent[])
      .filter(e => e.timestamp > securityCutoff);
  }

  private saveData(): void {
    this.store.set('devices', Array.from(this.devices.values()));
    this.store.set('rooms', Array.from(this.rooms.values()));
    this.store.set('scenes', Array.from(this.scenes.values()));
    this.store.set('routines', Array.from(this.routines.values()));
    this.store.set('energyHistory', this.energyReadings);
    this.store.set('securityLog', this.securityEvents);
    this.store.set('config', this.config);
  }

  private registerIPCHandlers(): void {
    // Device management
    ipcMain.handle('home:get-devices', async () => this.getDevices());
    ipcMain.handle('home:get-device', async (_, id: string) => this.getDevice(id));
    ipcMain.handle('home:add-device', async (_, device: Partial<SmartDevice>) => this.addDevice(device));
    ipcMain.handle('home:update-device', async (_, id: string, updates: Partial<SmartDevice>) => 
      this.updateDevice(id, updates));
    ipcMain.handle('home:remove-device', async (_, id: string) => this.removeDevice(id));
    ipcMain.handle('home:control-device', async (_, id: string, command: string, params?: unknown) => 
      this.controlDevice(id, command, params));
    ipcMain.handle('home:discover-devices', async () => this.discoverDevices());

    // Room management
    ipcMain.handle('home:get-rooms', async () => this.getRooms());
    ipcMain.handle('home:add-room', async (_, room: Partial<Room>) => this.addRoom(room));
    ipcMain.handle('home:update-room', async (_, id: string, updates: Partial<Room>) => 
      this.updateRoom(id, updates));
    ipcMain.handle('home:remove-room', async (_, id: string) => this.removeRoom(id));
    ipcMain.handle('home:control-room', async (_, id: string, command: string, params?: unknown) => 
      this.controlRoom(id, command, params));

    // Scene management
    ipcMain.handle('home:get-scenes', async () => this.getScenes());
    ipcMain.handle('home:add-scene', async (_, scene: Partial<Scene>) => this.addScene(scene));
    ipcMain.handle('home:update-scene', async (_, id: string, updates: Partial<Scene>) => 
      this.updateScene(id, updates));
    ipcMain.handle('home:remove-scene', async (_, id: string) => this.removeScene(id));
    ipcMain.handle('home:activate-scene', async (_, id: string) => this.activateScene(id));

    // Routine management
    ipcMain.handle('home:get-routines', async () => this.getRoutines());
    ipcMain.handle('home:add-routine', async (_, routine: Partial<Routine>) => this.addRoutine(routine));
    ipcMain.handle('home:update-routine', async (_, id: string, updates: Partial<Routine>) => 
      this.updateRoutine(id, updates));
    ipcMain.handle('home:remove-routine', async (_, id: string) => this.removeRoutine(id));
    ipcMain.handle('home:toggle-routine', async (_, id: string) => this.toggleRoutine(id));
    ipcMain.handle('home:run-routine', async (_, id: string) => this.runRoutine(id));

    // Security
    ipcMain.handle('home:get-security-mode', async () => this.config.securityMode);
    ipcMain.handle('home:set-security-mode', async (_, mode: HomeConfig['securityMode']) => 
      this.setSecurityMode(mode));
    ipcMain.handle('home:get-security-events', async () => this.getSecurityEvents());
    ipcMain.handle('home:acknowledge-event', async (_, id: string) => this.acknowledgeSecurityEvent(id));
    ipcMain.handle('home:get-camera-snapshot', async (_, deviceId: string) => 
      this.getCameraSnapshot(deviceId));

    // Energy
    ipcMain.handle('home:get-energy-usage', async (_, period?: string) => this.getEnergyUsage(period));
    ipcMain.handle('home:get-energy-insights', async () => this.getEnergyInsights());

    // Configuration
    ipcMain.handle('home:get-config', async () => this.config);
    ipcMain.handle('home:update-config', async (_, updates: Partial<HomeConfig>) => 
      this.updateConfig(updates));
  }

  // ---------------------------------------------------------------------------
  // Device Discovery
  // ---------------------------------------------------------------------------

  private startDiscovery(): void {
    if (!this.config.discoveryEnabled) return;

    this.discoverySocket = dgram.createSocket('udp4');
    
    this.discoverySocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        this.handleDiscoveredDevice(data, rinfo.address);
      } catch {
        // Non-JSON response, might be SSDP or other protocol
        this.handleRawDiscovery(msg.toString(), rinfo.address);
      }
    });

    this.discoverySocket.on('error', (err) => {
      this.emit('discovery:error', err);
    });

    this.discoverySocket.bind(() => {
      this.discoverySocket?.setBroadcast(true);
      this.discoverDevices();
    });

    // Periodic discovery
    this.discoveryInterval = setInterval(() => {
      this.discoverDevices();
    }, this.config.discoveryInterval);
  }

  async discoverDevices(): Promise<SmartDevice[]> {
    const discovered: SmartDevice[] = [];

    // Send discovery broadcast
    const discoveryMessage = JSON.stringify({
      type: 'dex_discovery',
      version: '1.0',
      timestamp: Date.now(),
    });

    if (this.discoverySocket) {
      // Broadcast on common ports
      const ports = [9999, 8888, 56700, 41234]; // Common smart device ports
      for (const port of ports) {
        try {
          this.discoverySocket.send(
            discoveryMessage,
            0,
            discoveryMessage.length,
            port,
            '255.255.255.255'
          );
        } catch {
          // Ignore send errors
        }
      }
    }

    // SSDP discovery (UPnP)
    try {
      const ssdpDevices = await this.ssdpDiscover();
      discovered.push(...ssdpDevices);
    } catch {
      // Ignore SSDP errors
    }

    // Update device online status
    const now = Date.now();
    for (const [id, device] of this.devices) {
      if (now - device.lastSeen > 5 * 60 * 1000) {
        device.isOnline = false;
      }
    }

    this.mainWindow?.webContents.send('home:devices-updated', this.getDevices());
    return discovered;
  }

  private async ssdpDiscover(): Promise<SmartDevice[]> {
    return new Promise((resolve) => {
      const devices: SmartDevice[] = [];
      const socket = dgram.createSocket('udp4');

      const ssdpMessage = [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 3',
        'ST: ssdp:all',
        '',
        '',
      ].join('\r\n');

      socket.on('message', (msg, rinfo) => {
        const response = msg.toString();
        if (response.includes('200 OK')) {
          const device = this.parseSSDP(response, rinfo.address);
          if (device) {
            devices.push(device);
          }
        }
      });

      socket.send(ssdpMessage, 1900, '239.255.255.250', () => {
        setTimeout(() => {
          socket.close();
          resolve(devices);
        }, 3000);
      });
    });
  }

  private parseSSDP(response: string, address: string): SmartDevice | null {
    const lines = response.split('\r\n');
    const headers: Record<string, string> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    if (!headers['usn']) return null;

    const id = `ssdp_${headers['usn'].split(':')[1] || address}`;
    const existingDevice = this.devices.get(id);

    if (existingDevice) {
      existingDevice.lastSeen = Date.now();
      existingDevice.isOnline = true;
      return null;
    }

    return {
      id,
      name: headers['server'] || 'Unknown Device',
      type: this.guessDeviceType(headers['st'] || ''),
      protocol: 'upnp',
      address,
      state: {},
      capabilities: [],
      lastSeen: Date.now(),
      isOnline: true,
    };
  }

  private handleDiscoveredDevice(data: Record<string, unknown>, address: string): void {
    const id = (data.id as string) || `device_${address}_${Date.now()}`;
    
    if (this.devices.has(id)) {
      const device = this.devices.get(id)!;
      device.lastSeen = Date.now();
      device.isOnline = true;
      if (data.state) {
        device.state = { ...device.state, ...data.state as DeviceState };
      }
    } else {
      const newDevice: SmartDevice = {
        id,
        name: (data.name as string) || 'Unknown Device',
        type: (data.type as DeviceType) || 'other',
        protocol: (data.protocol as DeviceProtocol) || 'wifi',
        address,
        port: data.port as number | undefined,
        manufacturer: data.manufacturer as string | undefined,
        model: data.model as string | undefined,
        state: (data.state as DeviceState) || {},
        capabilities: (data.capabilities as DeviceCapability[]) || [],
        lastSeen: Date.now(),
        isOnline: true,
      };

      this.devices.set(id, newDevice);
      this.saveData();
      this.emit('device:discovered', newDevice);
      this.mainWindow?.webContents.send('home:device-discovered', newDevice);
    }
  }

  private handleRawDiscovery(data: string, address: string): void {
    // Handle various protocol responses
    if (data.includes('HTTP/1.1')) {
      // Already handled by SSDP
      return;
    }
    // Add more protocol handlers as needed
  }

  private guessDeviceType(serviceType: string): DeviceType {
    const st = serviceType.toLowerCase();
    if (st.includes('light') || st.includes('bulb')) return 'light';
    if (st.includes('switch')) return 'switch';
    if (st.includes('thermostat') || st.includes('hvac')) return 'thermostat';
    if (st.includes('camera')) return 'camera';
    if (st.includes('lock')) return 'lock';
    if (st.includes('sensor')) return 'sensor';
    if (st.includes('speaker') || st.includes('media')) return 'speaker';
    if (st.includes('tv') || st.includes('television')) return 'tv';
    return 'other';
  }

  // ---------------------------------------------------------------------------
  // Device Control
  // ---------------------------------------------------------------------------

  getDevices(): SmartDevice[] {
    return Array.from(this.devices.values());
  }

  getDevice(id: string): SmartDevice | undefined {
    return this.devices.get(id);
  }

  addDevice(deviceData: Partial<SmartDevice>): SmartDevice {
    const id = deviceData.id || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const device: SmartDevice = {
      id,
      name: deviceData.name || 'New Device',
      type: deviceData.type || 'other',
      protocol: deviceData.protocol || 'local',
      address: deviceData.address || '',
      port: deviceData.port,
      room: deviceData.room,
      manufacturer: deviceData.manufacturer,
      model: deviceData.model,
      state: deviceData.state || {},
      capabilities: deviceData.capabilities || [],
      lastSeen: Date.now(),
      isOnline: true,
    };

    this.devices.set(id, device);
    this.saveData();
    this.emit('device:added', device);
    return device;
  }

  updateDevice(id: string, updates: Partial<SmartDevice>): SmartDevice | null {
    const device = this.devices.get(id);
    if (!device) return null;

    Object.assign(device, updates);
    this.saveData();
    this.emit('device:updated', device);
    return device;
  }

  removeDevice(id: string): boolean {
    const result = this.devices.delete(id);
    if (result) {
      // Remove from rooms
      for (const room of this.rooms.values()) {
        room.devices = room.devices.filter(d => d !== id);
      }
      this.saveData();
      this.emit('device:removed', id);
    }
    return result;
  }

  async controlDevice(
    id: string,
    command: string,
    params?: unknown
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    const device = this.devices.get(id);
    if (!device) {
      return { success: false, message: 'Device not found' };
    }

    if (!device.isOnline) {
      return { success: false, message: 'Device is offline' };
    }

    try {
      const result = await this.sendDeviceCommand(device, command, params);
      
      // Update local state
      if (result.success && result.state) {
        device.state = { ...device.state, ...result.state };
        this.saveData();
        this.mainWindow?.webContents.send('home:device-state-changed', { id, state: device.state });
      }

      return result;
    } catch (error) {
      return { success: false, message: `Command failed: ${error}` };
    }
  }

  private async sendDeviceCommand(
    device: SmartDevice,
    command: string,
    params?: unknown
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    // Build command payload
    const payload = JSON.stringify({
      command,
      params,
      timestamp: Date.now(),
    });

    switch (device.protocol) {
      case 'http':
        return this.sendHTTPCommand(device, payload);
      case 'mqtt':
        return this.sendMQTTCommand(device, command, params);
      case 'websocket':
        return this.sendWebSocketCommand(device, payload);
      case 'local':
        return this.handleLocalCommand(device, command, params);
      default:
        return this.sendTCPCommand(device, payload);
    }
  }

  private async sendHTTPCommand(
    device: SmartDevice,
    payload: string
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    return new Promise((resolve) => {
      const url = `http://${device.address}:${device.port || 80}/api/command`;
      
      const http = require('http');
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({
              success: response.success !== false,
              message: response.message || 'Command sent',
              state: response.state,
            });
          } catch {
            resolve({ success: true, message: 'Command sent' });
          }
        });
      });

      req.on('error', (err: Error) => {
        resolve({ success: false, message: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, message: 'Request timeout' });
      });

      req.write(payload);
      req.end();
    });
  }

  private async sendMQTTCommand(
    device: SmartDevice,
    command: string,
    params?: unknown
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    // MQTT would require mqtt library - return simulated success
    const newState: DeviceState = {};
    
    switch (command) {
      case 'power':
        newState.power = params === true || params === 'on';
        break;
      case 'brightness':
        newState.brightness = typeof params === 'number' ? params : 100;
        break;
      case 'temperature':
        newState.targetTemperature = typeof params === 'number' ? params : 72;
        break;
    }

    return {
      success: true,
      message: `${command} command sent via MQTT`,
      state: newState,
    };
  }

  private async sendWebSocketCommand(
    device: SmartDevice,
    payload: string
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    // WebSocket would require ws library - return simulated success
    return {
      success: true,
      message: 'Command sent via WebSocket',
    };
  }

  private async sendTCPCommand(
    device: SmartDevice,
    payload: string
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      let response = '';

      client.connect(device.port || 9999, device.address, () => {
        client.write(payload);
      });

      client.on('data', (data) => {
        response += data.toString();
      });

      client.on('close', () => {
        try {
          const parsed = JSON.parse(response);
          resolve({
            success: parsed.success !== false,
            message: parsed.message || 'Command completed',
            state: parsed.state,
          });
        } catch {
          resolve({ success: true, message: 'Command sent' });
        }
      });

      client.on('error', (err) => {
        resolve({ success: false, message: err.message });
      });

      setTimeout(() => {
        client.destroy();
        resolve({ success: false, message: 'Connection timeout' });
      }, 5000);
    });
  }

  private handleLocalCommand(
    device: SmartDevice,
    command: string,
    params?: unknown
  ): Promise<{ success: boolean; message: string; state?: DeviceState }> {
    // Handle local/simulated devices
    const newState: DeviceState = { ...device.state };

    switch (command) {
      case 'power':
      case 'on':
      case 'off':
        newState.power = command === 'on' || params === true || params === 'on';
        break;
      case 'brightness':
        newState.brightness = Math.max(0, Math.min(100, Number(params) || 100));
        break;
      case 'color':
        if (typeof params === 'object' && params !== null) {
          newState.color = params as { r: number; g: number; b: number };
        }
        break;
      case 'temperature':
        newState.targetTemperature = Math.max(50, Math.min(90, Number(params) || 72));
        break;
      case 'lock':
        newState.locked = params !== false && params !== 'unlock';
        break;
      case 'unlock':
        newState.locked = false;
        break;
      default:
        return Promise.resolve({ success: false, message: `Unknown command: ${command}` });
    }

    return Promise.resolve({
      success: true,
      message: `${device.name} ${command} executed`,
      state: newState,
    });
  }

  // ---------------------------------------------------------------------------
  // Room Control
  // ---------------------------------------------------------------------------

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  addRoom(roomData: Partial<Room>): Room {
    const id = roomData.id || `room_${Date.now()}`;
    const room: Room = {
      id,
      name: roomData.name || 'New Room',
      devices: roomData.devices || [],
      icon: roomData.icon,
    };

    this.rooms.set(id, room);
    this.saveData();
    return room;
  }

  updateRoom(id: string, updates: Partial<Room>): Room | null {
    const room = this.rooms.get(id);
    if (!room) return null;

    Object.assign(room, updates);
    this.saveData();
    return room;
  }

  removeRoom(id: string): boolean {
    const result = this.rooms.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async controlRoom(
    id: string,
    command: string,
    params?: unknown
  ): Promise<{ success: boolean; results: Array<{ deviceId: string; success: boolean }> }> {
    const room = this.rooms.get(id);
    if (!room) {
      return { success: false, results: [] };
    }

    const results: Array<{ deviceId: string; success: boolean }> = [];

    for (const deviceId of room.devices) {
      const result = await this.controlDevice(deviceId, command, params);
      results.push({ deviceId, success: result.success });
    }

    return {
      success: results.every(r => r.success),
      results,
    };
  }

  // ---------------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------------

  getScenes(): Scene[] {
    return Array.from(this.scenes.values());
  }

  addScene(sceneData: Partial<Scene>): Scene {
    const id = sceneData.id || `scene_${Date.now()}`;
    const scene: Scene = {
      id,
      name: sceneData.name || 'New Scene',
      description: sceneData.description,
      actions: sceneData.actions || [],
      icon: sceneData.icon,
      isActive: false,
    };

    this.scenes.set(id, scene);
    this.saveData();
    return scene;
  }

  updateScene(id: string, updates: Partial<Scene>): Scene | null {
    const scene = this.scenes.get(id);
    if (!scene) return null;

    Object.assign(scene, updates);
    this.saveData();
    return scene;
  }

  removeScene(id: string): boolean {
    const result = this.scenes.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async activateScene(id: string): Promise<{ success: boolean; results: Array<{ deviceId: string; success: boolean }> }> {
    const scene = this.scenes.get(id);
    if (!scene) {
      return { success: false, results: [] };
    }

    // Deactivate other scenes
    for (const s of this.scenes.values()) {
      s.isActive = false;
    }
    scene.isActive = true;

    const results: Array<{ deviceId: string; success: boolean }> = [];

    // Execute actions with delays
    for (const action of scene.actions) {
      if (action.delay) {
        await new Promise(resolve => setTimeout(resolve, action.delay));
      }

      for (const [key, value] of Object.entries(action.state)) {
        const result = await this.controlDevice(action.deviceId, key, value);
        results.push({ deviceId: action.deviceId, success: result.success });
      }
    }

    this.saveData();
    this.mainWindow?.webContents.send('home:scene-activated', id);

    return {
      success: results.every(r => r.success),
      results,
    };
  }

  // ---------------------------------------------------------------------------
  // Routines
  // ---------------------------------------------------------------------------

  getRoutines(): Routine[] {
    return Array.from(this.routines.values());
  }

  addRoutine(routineData: Partial<Routine>): Routine {
    const id = routineData.id || `routine_${Date.now()}`;
    const routine: Routine = {
      id,
      name: routineData.name || 'New Routine',
      description: routineData.description,
      trigger: routineData.trigger || { type: 'time', config: {} },
      conditions: routineData.conditions,
      actions: routineData.actions || [],
      enabled: routineData.enabled !== false,
    };

    this.routines.set(id, routine);
    this.saveData();
    return routine;
  }

  updateRoutine(id: string, updates: Partial<Routine>): Routine | null {
    const routine = this.routines.get(id);
    if (!routine) return null;

    Object.assign(routine, updates);
    this.saveData();
    return routine;
  }

  removeRoutine(id: string): boolean {
    const result = this.routines.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  toggleRoutine(id: string): boolean {
    const routine = this.routines.get(id);
    if (!routine) return false;

    routine.enabled = !routine.enabled;
    this.saveData();
    return routine.enabled;
  }

  async runRoutine(id: string): Promise<{ success: boolean; message: string }> {
    const routine = this.routines.get(id);
    if (!routine) {
      return { success: false, message: 'Routine not found' };
    }

    // Check conditions
    if (routine.conditions) {
      for (const condition of routine.conditions) {
        if (!this.evaluateCondition(condition)) {
          return { success: false, message: 'Conditions not met' };
        }
      }
    }

    // Execute actions
    for (const action of routine.actions) {
      if (action.delay) {
        await new Promise(resolve => setTimeout(resolve, action.delay));
      }

      for (const [key, value] of Object.entries(action.state)) {
        await this.controlDevice(action.deviceId, key, value);
      }
    }

    routine.lastRun = Date.now();
    this.saveData();

    this.mainWindow?.webContents.send('home:routine-executed', id);
    return { success: true, message: `Routine "${routine.name}" executed` };
  }

  private startRoutineChecker(): void {
    this.routineCheckInterval = setInterval(() => {
      this.checkRoutineTriggers();
    }, 60000); // Check every minute
  }

  private checkRoutineTriggers(): void {
    const now = new Date();

    for (const routine of this.routines.values()) {
      if (!routine.enabled) continue;

      switch (routine.trigger.type) {
        case 'time':
          const triggerTime = routine.trigger.config.time as string;
          if (triggerTime) {
            const [hours, minutes] = triggerTime.split(':').map(Number);
            if (now.getHours() === hours && now.getMinutes() === minutes) {
              this.runRoutine(routine.id);
            }
          }
          break;

        case 'sunrise':
        case 'sunset':
          // Would need location and sunrise/sunset API
          break;

        case 'device':
          // Device state triggers handled in device state change events
          break;
      }
    }
  }

  private evaluateCondition(condition: RoutineCondition): boolean {
    switch (condition.type) {
      case 'time':
        const now = new Date();
        const currentHour = now.getHours();
        switch (condition.operator) {
          case 'between':
            const [start, end] = condition.value as [number, number];
            return currentHour >= start && currentHour <= end;
          case 'equals':
            return currentHour === condition.value;
          default:
            return true;
        }

      case 'device':
        // Check device state condition
        return true;

      default:
        return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------------

  setSecurityMode(mode: HomeConfig['securityMode']): void {
    this.config.securityMode = mode;
    this.saveData();

    // Execute mode-specific actions
    switch (mode) {
      case 'away':
        if (this.config.occupancySimulation) {
          this.startOccupancySimulation();
        }
        // Lock all doors
        for (const device of this.devices.values()) {
          if (device.type === 'lock') {
            this.controlDevice(device.id, 'lock');
          }
        }
        break;

      case 'home':
        this.stopOccupancySimulation();
        break;

      case 'night':
        // Turn off most lights, lock doors
        for (const device of this.devices.values()) {
          if (device.type === 'light' && device.room !== 'bedroom') {
            this.controlDevice(device.id, 'off');
          }
          if (device.type === 'lock') {
            this.controlDevice(device.id, 'lock');
          }
        }
        break;

      case 'vacation':
        this.startOccupancySimulation();
        // More aggressive security
        break;
    }

    this.mainWindow?.webContents.send('home:security-mode-changed', mode);
    this.emit('security:mode-changed', mode);
  }

  getSecurityEvents(): SecurityEvent[] {
    return this.securityEvents.slice().reverse();
  }

  logSecurityEvent(event: Omit<SecurityEvent, 'id'>): void {
    const fullEvent: SecurityEvent = {
      id: `event_${Date.now()}`,
      ...event,
    };

    this.securityEvents.push(fullEvent);
    this.saveData();

    this.mainWindow?.webContents.send('home:security-event', fullEvent);
    this.emit('security:event', fullEvent);

    // Alert if in away/vacation mode
    if (
      (this.config.securityMode === 'away' || this.config.securityMode === 'vacation') &&
      event.type === 'motion'
    ) {
      this.mainWindow?.webContents.send('home:security-alert', fullEvent);
    }
  }

  acknowledgeSecurityEvent(id: string): boolean {
    const event = this.securityEvents.find(e => e.id === id);
    if (event) {
      event.acknowledged = true;
      this.saveData();
      return true;
    }
    return false;
  }

  async getCameraSnapshot(deviceId: string): Promise<{ success: boolean; data?: string }> {
    const device = this.devices.get(deviceId);
    if (!device || device.type !== 'camera') {
      return { success: false };
    }

    // Would fetch actual camera snapshot
    return {
      success: true,
      data: 'data:image/jpeg;base64,...', // Placeholder
    };
  }

  private occupancyInterval: NodeJS.Timeout | null = null;

  private startOccupancySimulation(): void {
    if (this.occupancyInterval) return;

    this.occupancyInterval = setInterval(() => {
      // Randomly turn lights on/off to simulate occupancy
      const lights = Array.from(this.devices.values()).filter(d => d.type === 'light');
      if (lights.length === 0) return;

      const randomLight = lights[Math.floor(Math.random() * lights.length)];
      const shouldBeOn = Math.random() > 0.5;
      this.controlDevice(randomLight.id, shouldBeOn ? 'on' : 'off');
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  private stopOccupancySimulation(): void {
    if (this.occupancyInterval) {
      clearInterval(this.occupancyInterval);
      this.occupancyInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Energy Management
  // ---------------------------------------------------------------------------

  recordEnergyReading(deviceId: string, power: number, energy: number): void {
    const reading: EnergyReading = {
      deviceId,
      timestamp: Date.now(),
      power,
      energy,
    };

    this.energyReadings.push(reading);

    // Trim old readings
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.energyReadings = this.energyReadings.filter(r => r.timestamp > cutoff);

    this.saveData();
  }

  getEnergyUsage(period?: string): {
    total: number;
    byDevice: Record<string, number>;
    byHour: number[];
    comparison: { current: number; previous: number; change: number };
  } {
    const now = Date.now();
    let cutoff: number;

    switch (period) {
      case 'day':
        cutoff = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        cutoff = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        cutoff = now - 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        cutoff = now - 24 * 60 * 60 * 1000;
    }

    const relevantReadings = this.energyReadings.filter(r => r.timestamp > cutoff);

    // Total energy
    const total = relevantReadings.reduce((sum, r) => sum + r.energy, 0);

    // By device
    const byDevice: Record<string, number> = {};
    for (const reading of relevantReadings) {
      byDevice[reading.deviceId] = (byDevice[reading.deviceId] || 0) + reading.energy;
    }

    // By hour (for last 24 hours)
    const byHour = new Array(24).fill(0);
    const dayReadings = this.energyReadings.filter(r => r.timestamp > now - 24 * 60 * 60 * 1000);
    for (const reading of dayReadings) {
      const hour = new Date(reading.timestamp).getHours();
      byHour[hour] += reading.energy;
    }

    // Comparison with previous period
    const previousCutoff = cutoff - (now - cutoff);
    const previousReadings = this.energyReadings.filter(
      r => r.timestamp > previousCutoff && r.timestamp <= cutoff
    );
    const previousTotal = previousReadings.reduce((sum, r) => sum + r.energy, 0);
    const change = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : 0;

    return {
      total,
      byDevice,
      byHour,
      comparison: {
        current: total,
        previous: previousTotal,
        change,
      },
    };
  }

  getEnergyInsights(): Array<{ type: string; message: string; savings?: number }> {
    const insights: Array<{ type: string; message: string; savings?: number }> = [];
    const usage = this.getEnergyUsage('week');

    // High usage devices
    const deviceEntries = Object.entries(usage.byDevice);
    deviceEntries.sort((a, b) => b[1] - a[1]);

    if (deviceEntries.length > 0) {
      const topDevice = this.devices.get(deviceEntries[0][0]);
      if (topDevice) {
        insights.push({
          type: 'high_usage',
          message: `${topDevice.name} is your highest energy consumer this week`,
          savings: deviceEntries[0][1] * 0.1, // 10% potential savings
        });
      }
    }

    // Peak usage hours
    const peakHour = usage.byHour.indexOf(Math.max(...usage.byHour));
    insights.push({
      type: 'peak_time',
      message: `Your peak energy usage is around ${peakHour}:00`,
    });

    // Usage trend
    if (usage.comparison.change > 10) {
      insights.push({
        type: 'increase',
        message: `Energy usage increased ${usage.comparison.change.toFixed(0)}% compared to last week`,
      });
    } else if (usage.comparison.change < -10) {
      insights.push({
        type: 'decrease',
        message: `Great job! Energy usage decreased ${Math.abs(usage.comparison.change).toFixed(0)}%`,
      });
    }

    return insights;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(updates: Partial<HomeConfig>): HomeConfig {
    this.config = { ...this.config, ...updates };
    this.saveData();

    if ('discoveryEnabled' in updates || 'discoveryInterval' in updates) {
      this.restartDiscovery();
    }

    this.emit('config:updated', this.config);
    return this.config;
  }

  private restartDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    if (this.discoverySocket) {
      this.discoverySocket.close();
      this.discoverySocket = null;
    }
    this.startDiscovery();
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.isRunning = false;

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    if (this.routineCheckInterval) {
      clearInterval(this.routineCheckInterval);
    }
    if (this.occupancyInterval) {
      clearInterval(this.occupancyInterval);
    }
    if (this.discoverySocket) {
      this.discoverySocket.close();
    }

    this.saveData();
    this.emit('shutdown');
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const homeAutomation = new HomeAutomationManager();

export function initializeHomeAutomation(mainWindow: BrowserWindow): void {
  homeAutomation.initialize(mainWindow);
}

export function shutdownHomeAutomation(): void {
  homeAutomation.shutdown();
}
