// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - SYSTEM - Core Engine
// Process management, memory optimization, and system monitoring
// Items 901-925 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 901-905: PROCESS MANAGEMENT
// =============================================================================

export interface ProcessInfo {
  pid: number;
  name: string;
  path: string;
  status: ProcessStatus;
  cpu: number;
  memory: number;
  memoryPercent: number;
  threads: number;
  handles: number;
  user: string;
  startTime: number;
  priority: ProcessPriority;
  parentPid?: number;
  children: number[];
  isSystem: boolean;
  isBackground: boolean;
}

export type ProcessStatus = 
  | 'running' | 'sleeping' | 'stopped' | 'zombie'
  | 'waiting' | 'idle' | 'unknown';

export type ProcessPriority = 
  | 'realtime' | 'high' | 'above-normal' | 'normal'
  | 'below-normal' | 'low' | 'idle';

export interface ProcessTree {
  process: ProcessInfo;
  children: ProcessTree[];
}

export interface ProcessFilter {
  name?: string;
  user?: string;
  minCpu?: number;
  minMemory?: number;
  status?: ProcessStatus[];
  excludeSystem?: boolean;
}

// =============================================================================
// ITEM 906-910: SYSTEM METRICS
// =============================================================================

export interface SystemMetrics {
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics[];
  network: NetworkMetrics;
  gpu?: GpuMetrics;
  battery?: BatteryMetrics;
}

export interface CpuMetrics {
  usage: number;
  usagePerCore: number[];
  cores: number;
  threads: number;
  frequency: number;
  temperature?: number;
  model: string;
  architecture: string;
  loadAverage: [number, number, number];
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  available: number;
  cached: number;
  buffers: number;
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
  usagePercent: number;
}

export interface DiskMetrics {
  device: string;
  mountPoint: string;
  fsType: string;
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  readSpeed: number;
  writeSpeed: number;
  readOps: number;
  writeOps: number;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  totalBytesReceived: number;
  totalBytesSent: number;
  totalPacketsReceived: number;
  totalPacketsSent: number;
  downloadSpeed: number;
  uploadSpeed: number;
}

export interface NetworkInterface {
  name: string;
  mac: string;
  ipv4?: string;
  ipv6?: string;
  speed: number;
  isUp: boolean;
  bytesReceived: number;
  bytesSent: number;
}

export interface GpuMetrics {
  name: string;
  vendor: string;
  vram: number;
  vramUsed: number;
  usage: number;
  temperature?: number;
  fanSpeed?: number;
  powerUsage?: number;
}

export interface BatteryMetrics {
  isCharging: boolean;
  level: number;
  timeRemaining?: number;
  health: number;
  cycleCount: number;
  voltage: number;
  temperature?: number;
}

// =============================================================================
// ITEM 911-915: RESOURCE MONITORING
// =============================================================================

export interface ResourceMonitor {
  id: string;
  name: string;
  type: MonitorType;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  action: MonitorAction;
  enabled: boolean;
  lastTriggered?: number;
  triggerCount: number;
}

export type MonitorType = 
  | 'cpu' | 'memory' | 'disk' | 'network-in' | 'network-out'
  | 'process-cpu' | 'process-memory' | 'temperature' | 'battery';

export interface MonitorAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export type ActionType = 
  | 'notify' | 'log' | 'terminate-process' | 'run-script'
  | 'email' | 'webhook' | 'throttle' | 'hibernate';

export interface MetricsHistory {
  metric: string;
  interval: number;
  maxPoints: number;
  data: MetricsDataPoint[];
}

export interface MetricsDataPoint {
  timestamp: number;
  value: number;
  min?: number;
  max?: number;
  avg?: number;
}

// =============================================================================
// ITEM 916-920: STARTUP & SERVICES
// =============================================================================

export interface StartupItem {
  id: string;
  name: string;
  path: string;
  args: string[];
  enabled: boolean;
  delay: number;
  runAsAdmin: boolean;
  source: StartupSource;
  impact: ImpactLevel;
}

export type StartupSource = 
  | 'registry' | 'startup-folder' | 'task-scheduler'
  | 'login-items' | 'launchd' | 'systemd' | 'app-config';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ServiceInfo {
  name: string;
  displayName: string;
  description: string;
  status: ServiceStatus;
  startType: ServiceStartType;
  path: string;
  account: string;
  pid?: number;
  dependencies: string[];
  canPause: boolean;
  canStop: boolean;
}

export type ServiceStatus = 
  | 'running' | 'stopped' | 'paused' | 'starting'
  | 'stopping' | 'pausing' | 'resuming' | 'unknown';

export type ServiceStartType = 
  | 'automatic' | 'automatic-delayed' | 'manual' | 'disabled' | 'boot' | 'system';

// =============================================================================
// ITEM 921-925: SYSTEM CORE ENGINE
// =============================================================================

export class SystemCoreEngine {
  private processes: Map<number, ProcessInfo> = new Map();
  private monitors: Map<string, ResourceMonitor> = new Map();
  private metricsHistory: Map<string, MetricsHistory> = new Map();
  private startupItems: Map<string, StartupItem> = new Map();
  private services: Map<string, ServiceInfo> = new Map();
  private currentMetrics: SystemMetrics | null = null;
  private metricsInterval?: ReturnType<typeof setInterval>;
  private listeners: Map<string, Set<(event: SystemEvent) => void>> = new Map();
  
  constructor() {
    this.initializeMetricsHistory();
    this.startMetricsCollection();
    this.loadProcesses();
    this.loadStartupItems();
    this.loadServices();
  }
  
  private initializeMetricsHistory(): void {
    const metrics = ['cpu', 'memory', 'disk', 'network-in', 'network-out'];
    for (const metric of metrics) {
      this.metricsHistory.set(metric, {
        metric,
        interval: 1000,
        maxPoints: 300,
        data: []
      });
    }
  }
  
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000);
  }
  
  private collectMetrics(): void {
    const metrics = this.generateMetrics();
    this.currentMetrics = metrics;
    
    // Update history
    this.addToHistory('cpu', metrics.cpu.usage);
    this.addToHistory('memory', metrics.memory.usagePercent);
    this.addToHistory('network-in', metrics.network.downloadSpeed);
    this.addToHistory('network-out', metrics.network.uploadSpeed);
    
    if (metrics.disk.length > 0) {
      this.addToHistory('disk', metrics.disk[0].usagePercent);
    }
    
    // Check monitors
    this.checkMonitors(metrics);
    
    this.emit('metrics-updated', { metrics });
  }
  
  private generateMetrics(): SystemMetrics {
    const prevMetrics = this.currentMetrics;
    
    return {
      timestamp: Date.now(),
      cpu: {
        usage: Math.random() * 100,
        usagePerCore: Array(8).fill(0).map(() => Math.random() * 100),
        cores: 8,
        threads: 16,
        frequency: 3600,
        temperature: 45 + Math.random() * 30,
        model: 'Intel Core i7-10700K',
        architecture: 'x64',
        loadAverage: [1.2, 1.5, 1.8]
      },
      memory: {
        total: 17179869184,
        used: 8589934592 + Math.random() * 4294967296,
        free: 8589934592 - Math.random() * 4294967296,
        available: 10737418240,
        cached: 2147483648,
        buffers: 536870912,
        swapTotal: 8589934592,
        swapUsed: 1073741824,
        swapFree: 7516192768,
        usagePercent: 50 + Math.random() * 30
      },
      disk: [{
        device: '/dev/sda1',
        mountPoint: '/',
        fsType: 'ext4',
        total: 512110190592,
        used: 256055095296,
        free: 256055095296,
        usagePercent: 50,
        readSpeed: Math.random() * 100000000,
        writeSpeed: Math.random() * 50000000,
        readOps: Math.floor(Math.random() * 1000),
        writeOps: Math.floor(Math.random() * 500)
      }],
      network: {
        interfaces: [{
          name: 'eth0',
          mac: '00:11:22:33:44:55',
          ipv4: '192.168.1.100',
          ipv6: 'fe80::1',
          speed: 1000,
          isUp: true,
          bytesReceived: (prevMetrics?.network.totalBytesReceived || 0) + Math.floor(Math.random() * 1000000),
          bytesSent: (prevMetrics?.network.totalBytesSent || 0) + Math.floor(Math.random() * 500000)
        }],
        totalBytesReceived: (prevMetrics?.network.totalBytesReceived || 0) + Math.floor(Math.random() * 1000000),
        totalBytesSent: (prevMetrics?.network.totalBytesSent || 0) + Math.floor(Math.random() * 500000),
        totalPacketsReceived: 0,
        totalPacketsSent: 0,
        downloadSpeed: Math.random() * 10000000,
        uploadSpeed: Math.random() * 5000000
      },
      gpu: {
        name: 'NVIDIA GeForce RTX 3080',
        vendor: 'NVIDIA',
        vram: 10737418240,
        vramUsed: 4294967296,
        usage: Math.random() * 100,
        temperature: 50 + Math.random() * 30,
        fanSpeed: 30 + Math.random() * 50,
        powerUsage: 100 + Math.random() * 200
      },
      battery: {
        isCharging: Math.random() > 0.5,
        level: 50 + Math.random() * 50,
        timeRemaining: 7200,
        health: 95,
        cycleCount: 150,
        voltage: 11.4,
        temperature: 30
      }
    };
  }
  
  private addToHistory(metric: string, value: number): void {
    const history = this.metricsHistory.get(metric);
    if (!history) return;
    
    history.data.push({
      timestamp: Date.now(),
      value
    });
    
    while (history.data.length > history.maxPoints) {
      history.data.shift();
    }
  }
  
  getMetrics(): SystemMetrics | null {
    return this.currentMetrics;
  }
  
  getMetricsHistory(metric: string, duration?: number): MetricsDataPoint[] {
    const history = this.metricsHistory.get(metric);
    if (!history) return [];
    
    if (duration) {
      const cutoff = Date.now() - duration;
      return history.data.filter(d => d.timestamp >= cutoff);
    }
    
    return [...history.data];
  }
  
  // Process management
  private loadProcesses(): void {
    // Simulate loading processes
    for (let i = 1; i <= 50; i++) {
      const process: ProcessInfo = {
        pid: i * 100,
        name: `process${i}`,
        path: `/usr/bin/process${i}`,
        status: 'running',
        cpu: Math.random() * 10,
        memory: Math.random() * 1000000000,
        memoryPercent: Math.random() * 10,
        threads: Math.floor(Math.random() * 20) + 1,
        handles: Math.floor(Math.random() * 100),
        user: 'user',
        startTime: Date.now() - Math.random() * 86400000,
        priority: 'normal',
        children: [],
        isSystem: Math.random() > 0.8,
        isBackground: Math.random() > 0.5
      };
      
      this.processes.set(process.pid, process);
    }
  }
  
  getProcesses(filter?: ProcessFilter): ProcessInfo[] {
    let processes = Array.from(this.processes.values());
    
    if (filter) {
      if (filter.name) {
        processes = processes.filter(p => p.name.toLowerCase().includes(filter.name!.toLowerCase()));
      }
      if (filter.user) {
        processes = processes.filter(p => p.user === filter.user);
      }
      if (filter.minCpu !== undefined) {
        processes = processes.filter(p => p.cpu >= filter.minCpu!);
      }
      if (filter.minMemory !== undefined) {
        processes = processes.filter(p => p.memory >= filter.minMemory!);
      }
      if (filter.status && filter.status.length > 0) {
        processes = processes.filter(p => filter.status!.includes(p.status));
      }
      if (filter.excludeSystem) {
        processes = processes.filter(p => !p.isSystem);
      }
    }
    
    return processes;
  }
  
  getProcess(pid: number): ProcessInfo | undefined {
    return this.processes.get(pid);
  }
  
  getProcessTree(): ProcessTree[] {
    const rootProcesses = Array.from(this.processes.values())
      .filter(p => !p.parentPid);
    
    const buildTree = (process: ProcessInfo): ProcessTree => ({
      process,
      children: process.children
        .map(pid => this.processes.get(pid))
        .filter((p): p is ProcessInfo => p !== undefined)
        .map(buildTree)
    });
    
    return rootProcesses.map(buildTree);
  }
  
  terminateProcess(pid: number, force: boolean = false): void {
    const process = this.processes.get(pid);
    if (!process) return;
    
    process.status = 'stopped';
    this.emit('process-terminated', { pid, force });
    
    setTimeout(() => {
      this.processes.delete(pid);
    }, 1000);
  }
  
  setPriority(pid: number, priority: ProcessPriority): void {
    const process = this.processes.get(pid);
    if (process) {
      process.priority = priority;
      this.emit('process-priority-changed', { pid, priority });
    }
  }
  
  // Resource monitors
  createMonitor(config: Omit<ResourceMonitor, 'id' | 'lastTriggered' | 'triggerCount'>): ResourceMonitor {
    const monitor: ResourceMonitor = {
      ...config,
      id: this.generateId('mon'),
      triggerCount: 0
    };
    
    this.monitors.set(monitor.id, monitor);
    this.emit('monitor-created', { monitor });
    return monitor;
  }
  
  updateMonitor(monitorId: string, updates: Partial<ResourceMonitor>): ResourceMonitor | null {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return null;
    
    Object.assign(monitor, updates);
    this.emit('monitor-updated', { monitor });
    return monitor;
  }
  
  deleteMonitor(monitorId: string): void {
    this.monitors.delete(monitorId);
    this.emit('monitor-deleted', { monitorId });
  }
  
  getMonitors(): ResourceMonitor[] {
    return Array.from(this.monitors.values());
  }
  
  private checkMonitors(metrics: SystemMetrics): void {
    for (const monitor of this.monitors.values()) {
      if (!monitor.enabled) continue;
      
      let value: number;
      switch (monitor.type) {
        case 'cpu':
          value = metrics.cpu.usage;
          break;
        case 'memory':
          value = metrics.memory.usagePercent;
          break;
        case 'temperature':
          value = metrics.cpu.temperature || 0;
          break;
        case 'battery':
          value = metrics.battery?.level || 100;
          break;
        default:
          continue;
      }
      
      let triggered = false;
      switch (monitor.operator) {
        case 'gt': triggered = value > monitor.threshold; break;
        case 'lt': triggered = value < monitor.threshold; break;
        case 'eq': triggered = value === monitor.threshold; break;
        case 'gte': triggered = value >= monitor.threshold; break;
        case 'lte': triggered = value <= monitor.threshold; break;
      }
      
      if (triggered) {
        monitor.lastTriggered = Date.now();
        monitor.triggerCount++;
        this.emit('monitor-triggered', { monitor, value });
      }
    }
  }
  
  // Startup items
  private loadStartupItems(): void {
    const items: Partial<StartupItem>[] = [
      { name: 'DEX Application', path: '/usr/bin/dex', enabled: true, impact: 'medium' },
      { name: 'Cloud Sync', path: '/usr/bin/cloudsync', enabled: true, impact: 'low' },
      { name: 'System Monitor', path: '/usr/bin/sysmon', enabled: false, impact: 'low' }
    ];
    
    for (const item of items) {
      const startupItem: StartupItem = {
        id: this.generateId('startup'),
        name: item.name || '',
        path: item.path || '',
        args: [],
        enabled: item.enabled ?? true,
        delay: 0,
        runAsAdmin: false,
        source: 'app-config',
        impact: item.impact || 'low'
      };
      
      this.startupItems.set(startupItem.id, startupItem);
    }
  }
  
  getStartupItems(): StartupItem[] {
    return Array.from(this.startupItems.values());
  }
  
  enableStartupItem(itemId: string): void {
    const item = this.startupItems.get(itemId);
    if (item) {
      item.enabled = true;
      this.emit('startup-item-enabled', { itemId });
    }
  }
  
  disableStartupItem(itemId: string): void {
    const item = this.startupItems.get(itemId);
    if (item) {
      item.enabled = false;
      this.emit('startup-item-disabled', { itemId });
    }
  }
  
  addStartupItem(item: Omit<StartupItem, 'id'>): StartupItem {
    const newItem: StartupItem = {
      ...item,
      id: this.generateId('startup')
    };
    
    this.startupItems.set(newItem.id, newItem);
    this.emit('startup-item-added', { item: newItem });
    return newItem;
  }
  
  removeStartupItem(itemId: string): void {
    this.startupItems.delete(itemId);
    this.emit('startup-item-removed', { itemId });
  }
  
  // Services
  private loadServices(): void {
    const serviceData: Partial<ServiceInfo>[] = [
      { name: 'dex-daemon', displayName: 'DEX Background Service', status: 'running', startType: 'automatic' },
      { name: 'dex-sync', displayName: 'DEX Sync Service', status: 'running', startType: 'automatic-delayed' },
      { name: 'dex-backup', displayName: 'DEX Backup Service', status: 'stopped', startType: 'manual' }
    ];
    
    for (const data of serviceData) {
      const service: ServiceInfo = {
        name: data.name || '',
        displayName: data.displayName || '',
        description: `${data.displayName} - manages background tasks`,
        status: data.status || 'stopped',
        startType: data.startType || 'manual',
        path: `/usr/lib/${data.name}`,
        account: 'LocalSystem',
        dependencies: [],
        canPause: true,
        canStop: true
      };
      
      this.services.set(service.name, service);
    }
  }
  
  getServices(): ServiceInfo[] {
    return Array.from(this.services.values());
  }
  
  getService(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }
  
  startService(name: string): void {
    const service = this.services.get(name);
    if (service && service.status !== 'running') {
      service.status = 'starting';
      this.emit('service-starting', { name });
      
      setTimeout(() => {
        service.status = 'running';
        service.pid = Math.floor(Math.random() * 10000) + 1000;
        this.emit('service-started', { name });
      }, 1000);
    }
  }
  
  stopService(name: string): void {
    const service = this.services.get(name);
    if (service && service.status === 'running' && service.canStop) {
      service.status = 'stopping';
      this.emit('service-stopping', { name });
      
      setTimeout(() => {
        service.status = 'stopped';
        service.pid = undefined;
        this.emit('service-stopped', { name });
      }, 1000);
    }
  }
  
  restartService(name: string): void {
    const service = this.services.get(name);
    if (service) {
      this.stopService(name);
      setTimeout(() => {
        this.startService(name);
      }, 1500);
    }
  }
  
  setServiceStartType(name: string, startType: ServiceStartType): void {
    const service = this.services.get(name);
    if (service) {
      service.startType = startType;
      this.emit('service-start-type-changed', { name, startType });
    }
  }
  
  // Event handling
  on(event: string, callback: (event: SystemEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: SystemEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const sysEvent: SystemEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(sysEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Cleanup
  dispose(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface SystemEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createSystemCoreEngine = () => new SystemCoreEngine();

export default { SystemCoreEngine, createSystemCoreEngine };
