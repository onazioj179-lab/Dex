// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Event Monitor
// Watches system state: processes, battery, network, etc.
// ===========================================================================

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
  private prevNetTotals: { rx: number; tx: number; ts: number } | null = null;

  constructor(ruleEngine: RuleEngine, logger: Logger) {
    this.ruleEngine = ruleEngine;
    this.logger = logger;
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Event Monitor started');

    // Monitor every 120 seconds — WMI/systeminformation calls are expensive on Windows
    this.monitorInterval = setInterval(() => {
      this.monitor();
    }, 120000);

    // Initial fetch after 5 seconds (let UI render first)
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
    // Always fetch fresh: native getStats is internally cached (5s) and
    // network rx/tx Bps must be sampled at the IPC cadence (~1s) to be useful.
    const fresh = await this.fetchSystemStatus();
    this.cachedStatus = fresh;
    return fresh;
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

        // Compute rx/tx bytes-per-second from cumulative totals.
        let rxBps = 0;
        let txBps = 0;
        const totalRx = nativeNetworks.reduce((s, n) => s + (n.totalRx ?? 0), 0);
        const totalTx = nativeNetworks.reduce((s, n) => s + (n.totalTx ?? 0), 0);
        const now = Date.now();
        if (this.prevNetTotals) {
          const dt = Math.max(0.001, (now - this.prevNetTotals.ts) / 1000);
          rxBps = Math.max(0, (totalRx - this.prevNetTotals.rx) / dt);
          txBps = Math.max(0, (totalTx - this.prevNetTotals.tx) / dt);
        }
        this.prevNetTotals = { rx: totalRx, tx: totalTx, ts: now };

        // Aggregate disk usage across mounted volumes.
        const disks = NativeSystem.getDisks();
        let diskUsed = 0;
        let diskTotal = 0;
        for (const d of disks) { diskUsed += d.used ?? 0; diskTotal += d.total ?? 0; }
        const diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;

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
            rxBps: Math.round(rxBps),
            txBps: Math.round(txBps),
          },
          disk: diskTotal > 0 ? { used: diskUsed, total: diskTotal, percent: diskPercent } : undefined,
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
        this.logger.info(`[EventMonitor] Process started: ${name}`);
      }
    }

    // Detect stopped processes
    for (const name of this.previousProcesses) {
      if (!currentNames.has(name)) {
        this.logger.info(`[EventMonitor] Process stopped: ${name}`);
      }
    }

    this.previousProcesses = currentNames;
  }
}
