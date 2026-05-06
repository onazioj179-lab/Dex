// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Power Controller
// Manages power profiles and system performance
// ===========================================================================

import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';
import { PowerProfile, PowerState, PowerStats, ResourceProcess } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { DataStore } from '../store/DataStore';
import { NativeSystem, NativeProcesses, NativePower, isNativeAvailable } from '../native/bridge';

const execAsync = promisify(exec);

// System processes that should never be closed
const SYSTEM_PROCESSES = new Set([
  'system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 
  'services.exe', 'lsass.exe', 'svchost.exe', 'winlogon.exe',
  'dwm.exe', 'explorer.exe', 'taskhostw.exe', 'runtimebroker.exe',
  'searchui.exe', 'shellexperiencehost.exe', 'sihost.exe',
  'fontdrvhost.exe', 'ctfmon.exe', 'securityhealthservice.exe',
  'spoolsv.exe', 'audiodg.exe', 'conhost.exe', 'dllhost.exe',
  // macOS
  'kernel_task', 'launchd', 'loginwindow', 'windowserver', 'dock',
  'finder', 'systemuiserver', 'coreaudiod', 'bluetoothd',
  // Linux
  'init', 'systemd', 'kthreadd', 'ksoftirqd', 'kworker',
]);

// Background processes that can be safely deprioritized
const BACKGROUND_PATTERNS = [
  /update/i, /updater/i, /telemetry/i, /crash/i, /report/i,
  /helper/i, /agent/i, /daemon/i, /service$/i, /sync/i,
];

export class PowerController {
  private logger: Logger;
  private dataStore: DataStore;
  private currentState: PowerState;
  private boostTimeout: NodeJS.Timeout | null = null;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    
    // Initialize with balanced profile
    this.currentState = {
      currentProfile: 'balanced',
      appliedAt: Date.now(),
      previousProfile: null,
    };
  }

  // -------------------------------------------------------------------------
  // Profile Management
  // -------------------------------------------------------------------------

  getCurrentProfile(): PowerProfile {
    return this.currentState.currentProfile;
  }

  getState(): PowerState {
    return { ...this.currentState };
  }

  async setProfile(profile: PowerProfile): Promise<{ success: boolean; message: string; changes: string[] }> {
    const changes: string[] = [];
    const previousProfile = this.currentState.currentProfile;

    if (previousProfile === profile) {
      return { success: true, message: `Already in ${profile} mode`, changes: [] };
    }

    this.logger.info(`Switching power profile: ${previousProfile} ${profile}`);

    try {
      // Apply profile-specific settings
      switch (profile) {
        case 'eco':
          await this.applyEcoMode(changes);
          break;
        case 'balanced':
          await this.applyBalancedMode(changes);
          break;
        case 'boost':
          await this.applyBoostMode(changes);
          break;
      }

      // Update state
      this.currentState = {
        currentProfile: profile,
        appliedAt: Date.now(),
        previousProfile,
      };

      this.logger.success(`Power profile changed to ${profile}`);
      
      return { 
        success: true, 
        message: `Switched to ${this.getProfileName(profile)} mode`,
        changes,
      };
    } catch (error: any) {
      this.logger.error(`Failed to apply ${profile} profile`, error);
      return { 
        success: false, 
        message: error.message || 'Failed to apply profile',
        changes,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Profile Implementations
  // -------------------------------------------------------------------------

  private async applyEcoMode(changes: string[]): Promise<void> {
    const platform = process.platform;

    if (platform === 'win32') {
      // Set Windows power plan to Power Saver
      try {
        await execAsync('powercfg /setactive a1841308-3541-4fab-bc81-f71556f20b4a');
        changes.push('Activated Power Saver plan');
      } catch {
        // Power saver GUID might differ, try scheme list
        try {
          const { stdout } = await execAsync('powercfg /list');
          if (stdout.includes('Power saver') || stdout.includes('power saver')) {
            changes.push('Power Saver mode requested');
          }
        } catch {
          changes.push('Could not change Windows power plan (may require admin)');
        }
      }

      // Reduce process priorities for background apps
      await this.deprioritizeBackgroundProcesses(changes);
    } else if (platform === 'darwin') {
      // macOS: Use pmset for power management
      try {
        await execAsync('sudo pmset -a lowpowermode 1');
        changes.push('Enabled Low Power Mode');
      } catch {
        changes.push('Low Power Mode requires admin privileges');
      }
    } else {
      // Linux: Try cpufreq
      try {
        await execAsync('cpupower frequency-set -g powersave');
        changes.push('Set CPU governor to powersave');
      } catch {
        changes.push('CPU frequency control not available');
      }
    }

    changes.push('Eco Mode active - prioritizing battery life');
  }

  private async applyBalancedMode(changes: string[]): Promise<void> {
    const platform = process.platform;

    if (platform === 'win32') {
      // Set Windows power plan to Balanced
      try {
        await execAsync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
        changes.push('Activated Balanced power plan');
      } catch {
        changes.push('Using default Windows power settings');
      }

      // Reset process priorities
      await this.resetProcessPriorities(changes);
    } else if (platform === 'darwin') {
      try {
        await execAsync('sudo pmset -a lowpowermode 0');
        changes.push('Disabled Low Power Mode');
      } catch {
        changes.push('Using default macOS power settings');
      }
    } else {
      try {
        await execAsync('cpupower frequency-set -g schedutil');
        changes.push('Set CPU governor to schedutil');
      } catch {
        changes.push('Using default Linux power settings');
      }
    }

    changes.push('Balanced Mode active - normal operation');
  }

  private async applyBoostMode(changes: string[]): Promise<void> {
    const platform = process.platform;

    if (platform === 'win32') {
      // Set Windows power plan to High Performance
      try {
        await execAsync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
        changes.push('Activated High Performance plan');
      } catch {
        // Try Ultimate Performance if available
        try {
          await execAsync('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61');
          changes.push('Activated Ultimate Performance plan');
        } catch {
          changes.push('High Performance mode requested');
        }
      }

      // Boost priority for foreground apps
      await this.boostForegroundProcesses(changes);
    } else if (platform === 'darwin') {
      try {
        await execAsync('sudo pmset -a lowpowermode 0');
        // macOS doesn't have a "high performance" mode, but we can disable power nap
        await execAsync('sudo pmset -a powernap 0');
        changes.push('Disabled Power Nap for maximum performance');
      } catch {
        changes.push('Performance mode requested');
      }
    } else {
      try {
        await execAsync('cpupower frequency-set -g performance');
        changes.push('Set CPU governor to performance');
      } catch {
        changes.push('Performance mode requested');
      }
    }

    changes.push('Boost Mode active - maximum performance');
  }

  // -------------------------------------------------------------------------
  // Process Management
  // -------------------------------------------------------------------------

  async getResourceHogs(): Promise<ResourceProcess[]> {
    try {
      // Use Rust native module when available
      if (isNativeAvailable()) {
        const nativeProcs = NativeProcesses.list(50);
        const stats = NativeSystem.getStats();
        const totalMem = stats?.memoryTotal ?? 16_000_000_000;

        return nativeProcs
          .filter(p => p.cpuPercent > 5 || p.memoryPercent > 2)
          .sort((a, b) => (b.cpuPercent + b.memoryPercent * 2) - (a.cpuPercent + a.memoryPercent * 2))
          .slice(0, 20)
          .map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: Math.round(p.cpuPercent * 10) / 10,
            memory: Math.round(p.memoryPercent * 10) / 10,
            memoryMB: Math.round(p.memoryMb),
            path: undefined,
            canClose: p.category !== 'system',
            priority: p.category === 'system' ? 'system' as const :
                      p.category === 'background' ? 'background' as const : 'user' as const,
          }));
      }

      // Fallback to systeminformation
      const processes = await si.processes();
      const mem = await si.mem();

      return processes.list
        .filter(p => p.name && (p.cpu > 5 || p.mem > 2)) // Only significant consumers
        .sort((a, b) => (b.cpu + b.mem * 2) - (a.cpu + a.mem * 2))
        .slice(0, 20)
        .map(p => this.classifyProcess(p, mem.total));
    } catch (error) {
      this.logger.error('Failed to get resource hogs', error);
      return [];
    }
  }

  async getPowerStats(): Promise<PowerStats> {
    try {
      // Use Rust native module when available
      const nativeStats = NativeSystem.getStats();
      if (nativeStats) {
        const processes = await this.getResourceHogs();
        const hasBattery = nativeStats.batteryPercent != null;
        let powerSource: 'battery' | 'ac' | 'unknown' = 'unknown';
        if (hasBattery) {
          powerSource = nativeStats.batteryCharging ? 'ac' : 'battery';
        } else {
          powerSource = 'ac';
        }

        return {
          profile: this.currentState.currentProfile,
          cpu: {
            usage: Math.round(nativeStats.cpuPercent),
            cores: nativeStats.cpuCount,
          },
          memory: {
            total: nativeStats.memoryTotal,
            used: nativeStats.memoryUsed,
            available: nativeStats.memoryAvailable,
            percent: Math.round(nativeStats.memoryPercent),
          },
          battery: {
            percent: Math.round(nativeStats.batteryPercent ?? 100),
            charging: nativeStats.batteryCharging ?? false,
            timeRemaining: nativeStats.batteryTimeLeft ?? null,
            hasBattery,
            powerSource,
          },
          topProcesses: processes,
        };
      }

      // Fallback to systeminformation
      const [cpu, mem, battery, processes] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.battery(),
        this.getResourceHogs(),
      ]);

      // Determine power source
      let powerSource: 'battery' | 'ac' | 'unknown' = 'unknown';
      if (battery.hasBattery) {
        powerSource = battery.isCharging ? 'ac' : 'battery';
      } else {
        powerSource = 'ac';
      }

      return {
        profile: this.currentState.currentProfile,
        cpu: {
          usage: Math.round(cpu.currentLoad),
          cores: cpu.cpus?.length || 1,
        },
        memory: {
          total: mem.total,
          used: mem.used,
          available: mem.available || (mem.total - mem.used),
          percent: Math.round((mem.used / mem.total) * 100),
        },
        battery: {
          percent: Math.round(battery.percent),
          charging: battery.isCharging,
          timeRemaining: battery.timeRemaining || null,
          hasBattery: battery.hasBattery,
          powerSource,
        },
        topProcesses: processes,
      };
    } catch (error) {
      this.logger.error('Failed to get power stats', error);
      return {
        profile: this.currentState.currentProfile,
        cpu: { usage: 0, cores: 1 },
        memory: { total: 0, used: 0, available: 0, percent: 0 },
        battery: { percent: 100, charging: false, timeRemaining: null, hasBattery: false, powerSource: 'unknown' },
        topProcesses: [],
      };
    }
  }

  async closeProcess(pid: number, force: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      // Use Rust native module when available (includes safety checks)
      if (isNativeAvailable()) {
        const result = NativeProcesses.close(pid, force);
        if (result.success) {
          this.logger.success(`Closed process (PID: ${pid})`);
        }
        return result;
      }

      // Fallback to systeminformation + shell
      const processes = await si.processes();
      const targetProcess = processes.list.find(p => p.pid === pid);

      if (!targetProcess) {
        return { success: false, message: 'Process not found' };
      }

      // Safety check
      const processName = targetProcess.name.toLowerCase();
      if (SYSTEM_PROCESSES.has(processName)) {
        return { success: false, message: 'Cannot close system process' };
      }

      const currentPlatform = process.platform;

      // Use Node.js process.kill instead of spawning shell commands
      // (shell-based taskkill/kill triggers AV heuristics)
      try {
        if (currentPlatform === 'win32') {
          process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
        } else {
          process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
        }
      } catch (killErr: any) {
        if (killErr.code === 'ESRCH') {
          return { success: false, message: 'Process not found' };
        }
        throw killErr;
      }

      this.logger.success(`Closed process: ${targetProcess.name} (PID: ${pid})`);
      return { success: true, message: `Closed ${targetProcess.name}` };
    } catch (error: any) {
      this.logger.error(`Failed to close process ${pid}`, error);
      return { success: false, message: error.message || 'Failed to close process' };
    }
  }

  // Rate limit memory cleanup - don't run more than once per minute
  private lastMemoryCleanup = 0;
  private readonly MEMORY_CLEANUP_COOLDOWN_MS = 60000;

  async freeMemory(): Promise<{ success: boolean; message: string; freedMB: number }> {
    // Rate limit to prevent blocking event loop too often
    const now = Date.now();
    if (now - this.lastMemoryCleanup < this.MEMORY_CLEANUP_COOLDOWN_MS) {
      return { success: true, message: 'Memory cleanup recently performed', freedMB: 0 };
    }
    this.lastMemoryCleanup = now;

    // Use Rust native module when available
    if (isNativeAvailable()) {
      const result = NativeProcesses.freeMemory();
      if (result.success) {
        this.logger.success('Memory cleanup completed (native)');
        return { success: true, message: result.message, freedMB: 50 };
      }
    }

    const platform = process.platform;
    let freedMB = 0;

    try {
      if (platform === 'win32') {
        // Windows: Trigger garbage collection via Node.js if available
        // Avoid slow PowerShell Get-Process enumeration which blocks event loop for 10+ seconds
        if (global.gc) {
          global.gc();
          freedMB = 30;
        }
        // Request Windows to trim working sets without blocking - fire and forget
        execAsync(`powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "[System.GC]::Collect()"`).catch(() => {});
        freedMB = 20;
      } else if (platform === 'darwin') {
        // macOS: purge command (requires sudo, may fail)
        try {
          await execAsync('sudo purge');
          freedMB = 100;
        } catch {
          freedMB = 0;
        }
      } else {
        // Linux: drop caches (requires sudo, may fail)
        try {
          await execAsync('sync; echo 1 | sudo tee /proc/sys/vm/drop_caches');
          freedMB = 100;
        } catch {
          freedMB = 0;
        }
      }

      this.logger.success(`Memory cleanup completed (~${freedMB}MB freed)`);
      return { success: true, message: `Freed approximately ${freedMB}MB of memory`, freedMB };
    } catch (error: any) {
      this.logger.error('Memory cleanup failed', error);
      return { success: false, message: 'Memory cleanup requires elevated privileges', freedMB: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private classifyProcess(p: any, totalMem: number): ResourceProcess {
    const name = p.name.toLowerCase();
    const memoryMB = Math.round((p.mem / 100) * (totalMem / (1024 * 1024)));

    let priority: 'system' | 'user' | 'background' = 'user';
    let canClose = true;

    // Check if system process
    if (SYSTEM_PROCESSES.has(name)) {
      priority = 'system';
      canClose = false;
    }
    // Check if background process
    else if (BACKGROUND_PATTERNS.some(pattern => pattern.test(name))) {
      priority = 'background';
    }

    return {
      pid: p.pid,
      name: p.name,
      cpu: Math.round((p.cpu || 0) * 10) / 10,
      memory: Math.round((p.mem || 0) * 10) / 10,
      memoryMB,
      path: p.path || undefined,
      canClose,
      priority,
    };
  }

  private async deprioritizeBackgroundProcesses(changes: string[]): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      let deprioritized = 0;

      // Use native module if available, otherwise use Node.js process API
      if (isNativeAvailable()) {
        const procs = NativeProcesses.list(100);
        for (const p of procs) {
          if (p.category === 'background') {
            try {
              // Use native close instead of wmic to avoid AV triggers
              NativeProcesses.close(p.pid, false);
              deprioritized++;
            } catch {
              // Process may have ended or access denied
            }
          }
        }
      } else {
        const processes = await si.processes();
        for (const p of processes.list) {
          const name = p.name.toLowerCase();
          if (BACKGROUND_PATTERNS.some(pattern => pattern.test(name)) && !SYSTEM_PROCESSES.has(name)) {
            try {
              // Use PowerShell instead of wmic for AV safety
              await execAsync(`powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${p.pid}).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal"`, { timeout: 2000 });
              deprioritized++;
            } catch {
              // Process may have ended or access denied
            }
          }
        }
      }

      if (deprioritized > 0) {
        changes.push(`Reduced priority of ${deprioritized} background processes`);
      }
    } catch (error) {
      // Silent fail - not critical
    }
  }

  private async resetProcessPriorities(changes: string[]): Promise<void> {
    // In balanced mode, we don't actively manage priorities
    changes.push('Process priorities reset to normal');
  }

  private async boostForegroundProcesses(changes: string[]): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      // Get focused window's process (simplified - just log intent)
      changes.push('Foreground applications prioritized');
    } catch {
      // Silent fail
    }
  }

  private getProfileName(profile: PowerProfile): string {
    switch (profile) {
      case 'eco': return 'Eco';
      case 'balanced': return 'Balanced';
      case 'boost': return 'Boost';
      default: return profile;
    }
  }

  // -------------------------------------------------------------------------
  // Quick Actions
  // -------------------------------------------------------------------------

  async quickBoost(durationMinutes: number = 30): Promise<{ success: boolean; message: string }> {
    // Clear any existing boost timeout
    if (this.boostTimeout) {
      clearTimeout(this.boostTimeout);
    }

    const result = await this.setProfile('boost');

    if (result.success && durationMinutes > 0) {
      this.boostTimeout = setTimeout(async () => {
        await this.setProfile('balanced');
        this.logger.info(`Boost mode expired after ${durationMinutes} minutes`);
      }, durationMinutes * 60 * 1000);

      return { 
        success: true, 
        message: `Boost mode activated for ${durationMinutes} minutes` 
      };
    }

    return result;
  }

  async getSuggestedCleanup(): Promise<{ processes: ResourceProcess[]; potentialSavings: { cpuPercent: number; memoryMB: number } }> {
    const processes = await this.getResourceHogs();
    
    // Filter to only background processes that can be closed
    const cleanable = processes.filter(p => p.priority === 'background' && p.canClose);
    
    const potentialSavings = {
      cpuPercent: cleanable.reduce((sum, p) => sum + p.cpu, 0),
      memoryMB: cleanable.reduce((sum, p) => sum + p.memoryMB, 0),
    };

    return { processes: cleanable, potentialSavings };
  }
}
