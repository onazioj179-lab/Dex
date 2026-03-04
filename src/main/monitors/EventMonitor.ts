// ═══════════════════════════════════════════════════════════════════════════
// DEX - Event Monitor
// Watches system state: processes, battery, network, etc.
// ═══════════════════════════════════════════════════════════════════════════

import * as si from 'systeminformation';
import { SystemStatus, ProcessInfo } from '../../shared/types';
import { RuleEngine } from '../engine/RuleEngine';
import { Logger } from '../utils/Logger';
import { NativeSystem, NativeProcesses, isNativeAvailable } from '../native/bridge';

export class EventMonitor {
  private ruleEngine: RuleEngine;
  private logger: Logger;
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private cachedStatus: SystemStatus | null = null;
  private cachedProcesses: ProcessInfo[] = [];
  private previousProcesses: Set<string> = new Set();

  constructor(ruleEngine: RuleEngine, logger: Logger) {
    this.ruleEngine = ruleEngine;
    this.logger = logger;
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Event Monitor started');

    // Monitor every 15 seconds for better performance
    this.monitorInterval = setInterval(() => {
      this.monitor();
    }, 15000);

    // Initial fetch after 5 seconds
    setTimeout(() => this.monitor(), 5000);
  }

  stop(): void {
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.logger.info('Event Monitor stopped');
  }

  async getSystemStatus(): Promise<SystemStatus> {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }
    return this.fetchSystemStatus();
  }

  async getRunningProcesses(): Promise<ProcessInfo[]> {
    if (this.cachedProcesses.length > 0) {
      return this.cachedProcesses;
    }
    return this.fetchRunningProcesses();
  }

  private async monitor(): Promise<void> {
    try {
      const [status, processes] = await Promise.all([
        this.fetchSystemStatus(),
        this.fetchRunningProcesses(),
      ]);

      this.cachedStatus = status;
      this.cachedProcesses = processes;

      // Update rule engine context
      this.ruleEngine.updateContext(status, processes);

      // Detect process changes
      this.detectProcessChanges(processes);
    } catch (error: any) {
      this.logger.error('Monitor error:', error);
    }
  }

  private async fetchSystemStatus(): Promise<SystemStatus> {
    try {
      // Use Rust native module when available (3-10x faster, no subprocess)
      const nativeStats = NativeSystem.getStats();
      if (nativeStats) {
        const nativeNetworks = NativeSystem.getNetworks();
        const hasConnection = nativeNetworks.some(n => n.rxBytes > 0 || n.txBytes > 0);

        return {
          cpu: {
            usage: Math.round(nativeStats.cpuPercent),
            cores: nativeStats.cpuCount,
          },
          memory: {
            total: nativeStats.memoryTotal,
            used: nativeStats.memoryUsed,
            percent: Math.round(nativeStats.memoryPercent),
          },
          battery: {
            percent: Math.round(nativeStats.batteryPercent ?? 100),
            charging: nativeStats.batteryCharging ?? false,
            timeRemaining: nativeStats.batteryTimeLeft ?? null,
            hasBattery: nativeStats.batteryPercent != null,
          },
          network: {
            connected: hasConnection,
            type: hasConnection ? 'connected' : 'disconnected',
          },
          uptime: nativeStats.uptime,
          platform: nativeStats.platform,
        };
      }

      // Fallback to systeminformation
      const [cpu, mem, battery, network, osInfo, time] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.battery(),
        si.networkInterfaces(),
        si.osInfo(),
        si.time(),
      ]);

      const hasConnection = Array.isArray(network) 
        ? network.some((n: any) => n.operstate === 'up' && !n.internal)
        : false;

      return {
        cpu: {
          usage: Math.round(cpu.currentLoad),
          cores: cpu.cpus?.length || 1,
        },
        memory: {
          total: mem.total,
          used: mem.used,
          percent: Math.round((mem.used / mem.total) * 100),
        },
        battery: {
          percent: Math.round(battery.percent),
          charging: battery.isCharging,
          timeRemaining: battery.timeRemaining || null,
          hasBattery: battery.hasBattery,
        },
        network: {
          connected: hasConnection,
          type: hasConnection ? 'connected' : 'disconnected',
        },
        uptime: time.uptime || 0,
        platform: osInfo.platform,
      };
    } catch (error) {
      // Return defaults on error
      return {
        cpu: { usage: 0, cores: 1 },
        memory: { total: 0, used: 0, percent: 0 },
        battery: { percent: 100, charging: false, timeRemaining: null, hasBattery: false },
        network: { connected: true, type: 'unknown' },
        uptime: 0,
        platform: process.platform,
      };
    }
  }

  private async fetchRunningProcesses(): Promise<ProcessInfo[]> {
    try {
      // Use Rust native module when available
      if (isNativeAvailable()) {
        const nativeProcs = NativeProcesses.list(50);
        return nativeProcs.map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: Math.round(p.cpuPercent * 10) / 10,
          memory: Math.round(p.memoryPercent * 10) / 10,
          path: undefined,
        }));
      }

      // Fallback to systeminformation
      const processes = await si.processes();
      
      return processes.list
        .filter(p => p.name && p.cpu !== undefined)
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, 50)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: Math.round((p.cpu || 0) * 10) / 10,
          memory: Math.round((p.mem || 0) * 10) / 10,
          path: p.path || undefined,
        }));
    } catch (error) {
      return [];
    }
  }

  private detectProcessChanges(currentProcesses: ProcessInfo[]): void {
    const currentNames = new Set(currentProcesses.map(p => p.name.toLowerCase()));

    // Detect new processes
    for (const name of currentNames) {
      if (!this.previousProcesses.has(name)) {
        // New process started - could emit event
      }
    }

    // Detect stopped processes
    for (const name of this.previousProcesses) {
      if (!currentNames.has(name)) {
        // Process stopped - could emit event
      }
    }

    this.previousProcesses = currentNames;
  }
}
