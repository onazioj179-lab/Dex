// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX System Profiler - Silent Hardware Detection and Capability Tiering
// Runs on every launch before any inner app initializes.
// No visible indicators, no loading screens, fully background.
// =============================================================================

import log from 'electron-log';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app, screen } from 'electron';
import Store from 'electron-store';
import { NativePower, isNativeAvailable } from '../native/bridge';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type CapabilityTier = 1 | 2 | 3;

export interface HardwareProfile {
  profileId: string;
  firstProfiledAt: number;
  lastProfiledAt: number;
  cpu: CpuProfile;
  memory: MemoryProfile;
  gpu: GpuProfile;
  storage: StorageProfile;
  displays: DisplayProfile[];
  battery: BatteryProfile;
}

export interface CpuProfile {
  model: string;
  physicalCores: number;
  logicalThreads: number;
  baseSpeedMHz: number;
  architecture: string;
  hasTurbo: boolean;
}

export interface MemoryProfile {
  totalBytes: number;
  totalGB: number;
}

export interface GpuProfile {
  renderer: string;
  vendor: string;
  isDedicated: boolean;
}

export interface StorageProfile {
  type: 'ssd' | 'hdd' | 'unknown';
  sequentialReadMBps: number;
}

export interface DisplayProfile {
  id: number;
  width: number;
  height: number;
  refreshRate: number;
  scaleFactor: number;
}

export interface BatteryProfile {
  hasBattery: boolean;
  isPluggedIn: boolean;
  chargePercent: number;
}

export interface SystemState {
  timestamp: number;
  cpuUsagePercent: number;
  ramUsedBytes: number;
  ramUsedPercent: number;
  ramAvailableBytes: number;
  backgroundProcessCount: number;
  thermalState: 'normal' | 'throttling' | 'unknown';
  battery: BatteryProfile;
  capabilityTier: CapabilityTier;
}

export interface FullProfile {
  hardware: HardwareProfile;
  state: SystemState;
}

// -----------------------------------------------------------------------------
// CPU Usage Sampler
// -----------------------------------------------------------------------------

function sampleCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpus1 = os.cpus();
    setTimeout(() => {
      const cpus2 = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < cpus2.length; i++) {
        const c1 = cpus1[i];
        const c2 = cpus2[i];
        if (!c1 || !c2) continue;
        const idle1 = c1.times.idle;
        const idle2 = c2.times.idle;
        const total1 = c1.times.user + c1.times.nice + c1.times.sys + c1.times.idle + c1.times.irq;
        const total2 = c2.times.user + c2.times.nice + c2.times.sys + c2.times.idle + c2.times.irq;
        totalIdle += (idle2 - idle1);
        totalTick += (total2 - total1);
      }
      const usage = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;
      resolve(Math.round(usage * 10) / 10);
    }, 500);
  });
}

// -----------------------------------------------------------------------------
// Storage Speed Benchmark (10MB sequential write/read)
// -----------------------------------------------------------------------------

async function benchmarkStorage(): Promise<{ type: 'ssd' | 'hdd' | 'unknown'; speedMBps: number }> {
  const benchDir = path.join(app.getPath('temp'), 'dex-bench');
  const benchFile = path.join(benchDir, `bench-${Date.now()}.tmp`);
  const bufferSize = 10 * 1024 * 1024; // 10MB
  const buffer = crypto.randomBytes(bufferSize);

  try {
    if (!fs.existsSync(benchDir)) {
      fs.mkdirSync(benchDir, { recursive: true });
    }

    // Write benchmark
    const writeStart = performance.now();
    fs.writeFileSync(benchFile, buffer);
    const writeEnd = performance.now();

    // Read benchmark
    const readStart = performance.now();
    fs.readFileSync(benchFile);
    const readEnd = performance.now();

    // Cleanup
    try { fs.unlinkSync(benchFile); } catch { /* ignore */ }

    const writeMs = writeEnd - writeStart;
    const readMs = readEnd - readStart;
    const readSpeedMBps = (bufferSize / (1024 * 1024)) / (readMs / 1000);
    const avgSpeedMBps = Math.round(readSpeedMBps);

    // SSD typically >100 MB/s sequential, HDD typically 30-150 MB/s
    // Fast SSD/NVMe >500 MB/s
    const type: 'ssd' | 'hdd' | 'unknown' = avgSpeedMBps > 200 ? 'ssd' : avgSpeedMBps < 80 ? 'hdd' : 'unknown';

    return { type, speedMBps: avgSpeedMBps };
  } catch {
    return { type: 'unknown', speedMBps: 0 };
  }
}

// -----------------------------------------------------------------------------
// GPU Detection
// -----------------------------------------------------------------------------

function detectGpu(): GpuProfile {
  // Use Electron's GPU info if available
  try {
    const gpuInfo = app.getGPUFeatureStatus();
    // Check for dedicated GPU indicators in feature status
    const hasHwAccel = gpuInfo && (
      gpuInfo.gpu_compositing === 'enabled' ||
      gpuInfo['2d_canvas'] === 'enabled' ||
      gpuInfo.webgl === 'enabled'
    );

    // Try to detect GPU from environment
    const renderer = process.env.GPU_RENDERER || '';
    const vendor = process.env.GPU_VENDOR || '';

    // Heuristic: dedicated GPUs from NVIDIA, AMD, or with "GeForce", "Radeon", "Arc" in name
    const dedicatedKeywords = ['nvidia', 'geforce', 'radeon', 'rx ', 'rtx ', 'gtx ', 'arc a', 'quadro'];
    const isDedicated = dedicatedKeywords.some(kw =>
      renderer.toLowerCase().includes(kw) || vendor.toLowerCase().includes(kw)
    );

    return {
      renderer: renderer || 'unknown',
      vendor: vendor || 'unknown',
      isDedicated,
    };
  } catch {
    return { renderer: 'unknown', vendor: 'unknown', isDedicated: false };
  }
}

// -----------------------------------------------------------------------------
// Display Detection
// -----------------------------------------------------------------------------

function detectDisplays(): DisplayProfile[] {
  try {
    const displays = screen.getAllDisplays();
    return displays.map((d, i) => ({
      id: d.id || i,
      width: d.size.width,
      height: d.size.height,
      refreshRate: (d as any).displayFrequency || d.rotation === 0 ? 60 : 60,
      scaleFactor: d.scaleFactor || 1,
    }));
  } catch {
    return [{ id: 0, width: 1920, height: 1080, refreshRate: 60, scaleFactor: 1 }];
  }
}

// -----------------------------------------------------------------------------
// Battery Detection
// -----------------------------------------------------------------------------

function detectBattery(): BatteryProfile {
  const platform = process.platform;

  // Use native module first (AV-safe, no shell spawning in JS)
  if (isNativeAvailable()) {
    const status = NativePower.getStatus();
    if (status?.batteryPercent != null) {
      return {
        hasBattery: true,
        isPluggedIn: status.batteryCharging ?? false,
        chargePercent: Math.min(100, Math.max(0, status.batteryPercent)),
      };
    }
  }

  if (platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      // Use PowerShell instead of wmic for AV safety
      const output = execSync(
        'powershell -NoProfile -NonInteractive -Command "$b = Get-WmiObject Win32_Battery; if($b){Write-Output \\"$($b.BatteryStatus)|$($b.EstimatedChargeRemaining)\\"}else{Write-Output \\"0|100\\"}"',
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      );
      const parts = output.trim().split('|');
      if (parts.length >= 2) {
        const status = parseInt(parts[0], 10);
        const charge = parseInt(parts[1], 10);
        // BatteryStatus: 1=discharging, 2=AC, 3-5=various charging states
        return {
          hasBattery: true,
          isPluggedIn: status !== 1,
          chargePercent: Math.min(100, Math.max(0, charge)),
        };
      }
    } catch { /* no battery or command failed */ }
  }

  if (platform === 'linux') {
    try {
      const capacityPath = '/sys/class/power_supply/BAT0/capacity';
      const statusPath = '/sys/class/power_supply/BAT0/status';
      if (fs.existsSync(capacityPath)) {
        const capacity = parseInt(fs.readFileSync(capacityPath, 'utf8').trim(), 10);
        const status = fs.readFileSync(statusPath, 'utf8').trim().toLowerCase();
        return {
          hasBattery: true,
          isPluggedIn: status === 'charging' || status === 'full',
          chargePercent: Math.min(100, Math.max(0, capacity)),
        };
      }
    } catch { /* no battery */ }
  }

  if (platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('pmset -g batt', { encoding: 'utf8', timeout: 3000 });
      const percentMatch = output.match(/(\d+)%/);
      const isCharging = output.includes('AC Power') || output.includes('charging');
      if (percentMatch) {
        return {
          hasBattery: true,
          isPluggedIn: isCharging,
          chargePercent: parseInt(percentMatch[1], 10),
        };
      }
    } catch { /* no battery */ }
  }

  return { hasBattery: false, isPluggedIn: true, chargePercent: 100 };
}

// -----------------------------------------------------------------------------
// CPU Turbo Detection
// -----------------------------------------------------------------------------

function detectTurbo(): boolean {
  const cpus = os.cpus();
  if (cpus.length === 0) return false;

  // Check if any core reports speed significantly above the average base
  const speeds = cpus.map(c => c.speed);
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const maxSpeed = Math.max(...speeds);

  // If max speed is >10% above average, turbo is likely active
  if (maxSpeed > avgSpeed * 1.1) return true;

  // Heuristic: modern Intel/AMD CPUs with >= 4 cores usually have turbo
  const model = cpus[0].model.toLowerCase();
  if (model.includes('intel') || model.includes('amd') || model.includes('ryzen')) {
    return cpus.length >= 4;
  }

  return false;
}

// -----------------------------------------------------------------------------
// Background Process Count
// -----------------------------------------------------------------------------

function getBackgroundProcessCount(): number {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const output = execSync('tasklist /NH', { encoding: 'utf8', timeout: 5000, windowsHide: true });
      return output.split('\n').filter((l: string) => l.trim().length > 0).length;
    } else {
      const output = execSync('ps aux | wc -l', { encoding: 'utf8', timeout: 5000 });
      return parseInt(output.trim(), 10) || 0;
    }
  } catch {
    return -1;
  }
}

// -----------------------------------------------------------------------------
// Capability Tier Calculation
// -----------------------------------------------------------------------------

export function calculateTier(hardware: HardwareProfile, state: SystemState): CapabilityTier {
  let score = 0;

  // RAM scoring (max 30 points)
  const ramGB = hardware.memory.totalGB;
  if (ramGB >= 16) score += 30;
  else if (ramGB >= 8) score += 20;
  else score += 5;

  // CPU scoring (max 30 points)
  const cores = hardware.cpu.logicalThreads;
  if (cores >= 8) score += 30;
  else if (cores >= 4) score += 20;
  else score += 5;

  // GPU scoring (max 20 points)
  if (hardware.gpu.isDedicated) score += 20;
  else score += 8;

  // Storage scoring (max 20 points)
  if (hardware.storage.type === 'ssd') score += 20;
  else if (hardware.storage.type === 'unknown') score += 10;
  else score += 5;

  // Dynamic adjustments based on current system state
  // Heavy load degrades effective tier
  if (state.cpuUsagePercent > 80) score -= 15;
  else if (state.cpuUsagePercent > 60) score -= 8;

  if (state.ramUsedPercent > 85) score -= 10;
  else if (state.ramUsedPercent > 70) score -= 5;

  // Battery degradation
  if (!state.battery.isPluggedIn) score -= 10;

  // Background process load
  if (state.backgroundProcessCount > 200) score -= 5;

  // Tier assignment
  if (score >= 70) return 1; // High-end
  if (score >= 40) return 2; // Mid-range
  return 3; // Low-end
}

// -----------------------------------------------------------------------------
// System Profiler Class
// -----------------------------------------------------------------------------

export class SystemProfiler {
  private store: Store;
  private hardwareProfile: HardwareProfile | null = null;
  private currentState: SystemState | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private tierChangeCallbacks: Array<(tier: CapabilityTier, prev: CapabilityTier) => void> = [];
  private batteryChangeCallbacks: Array<(battery: BatteryProfile) => void> = [];

  constructor() {
    this.store = new Store({ name: 'dex-system-profile' });
  }

  // Run full profile -- call before any app initializes
  async profile(): Promise<FullProfile> {
    const startMs = performance.now();

    // CPU usage sampling runs in parallel with other detection
    const [cpuUsage, storageBench] = await Promise.all([
      sampleCpuUsage(),
      this.shouldBenchmarkStorage() ? benchmarkStorage() : this.getCachedStorageBench(),
    ]);

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const battery = detectBattery();

    const cpu: CpuProfile = {
      model: cpus[0]?.model || 'unknown',
      physicalCores: cpus.length,
      logicalThreads: cpus.length,
      baseSpeedMHz: cpus[0]?.speed || 0,
      architecture: os.arch(),
      hasTurbo: detectTurbo(),
    };

    const memory: MemoryProfile = {
      totalBytes: totalMem,
      totalGB: Math.round((totalMem / (1024 * 1024 * 1024)) * 10) / 10,
    };

    const gpu = detectGpu();
    const displays = detectDisplays();

    const existingProfile = this.store.get('hardwareProfile') as HardwareProfile | undefined;

    this.hardwareProfile = {
      profileId: existingProfile?.profileId || crypto.randomBytes(8).toString('hex'),
      firstProfiledAt: existingProfile?.firstProfiledAt || Date.now(),
      lastProfiledAt: Date.now(),
      cpu,
      memory,
      gpu,
      storage: { type: storageBench.type, sequentialReadMBps: storageBench.speedMBps },
      displays,
      battery,
    };

    const usedMem = totalMem - freeMem;
    this.currentState = {
      timestamp: Date.now(),
      cpuUsagePercent: cpuUsage,
      ramUsedBytes: usedMem,
      ramUsedPercent: Math.round((usedMem / totalMem) * 100),
      ramAvailableBytes: freeMem,
      backgroundProcessCount: getBackgroundProcessCount(),
      thermalState: 'normal',
      battery,
      capabilityTier: 2, // placeholder, recalculated below
    };

    this.currentState.capabilityTier = calculateTier(this.hardwareProfile, this.currentState);

    // Persist
    this.store.set('hardwareProfile', this.hardwareProfile);
    this.store.set('lastState', this.currentState);
    this.store.set('lastStorageBench', {
      type: storageBench.type,
      speedMBps: storageBench.speedMBps,
      timestamp: Date.now(),
    });

    const elapsed = Math.round(performance.now() - startMs);
    log.info(
      `[SystemProfiler] Profiled in ${elapsed}ms: Tier ${this.currentState.capabilityTier}, ` +
      `${memory.totalGB}GB RAM, ${cpu.logicalThreads} threads, ` +
      `GPU: ${gpu.isDedicated ? 'dedicated' : 'integrated'}, ` +
      `Storage: ${storageBench.type} (${storageBench.speedMBps} MB/s)`
    );

    return { hardware: this.hardwareProfile, state: this.currentState };
  }

  // Start continuous monitoring (every 30 seconds)
  startMonitoring(): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(async () => {
      await this.updateSystemState();
    }, 30000);
  }

  // Stop monitoring
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // Update system state and recalculate tier
  async updateSystemState(): Promise<SystemState | null> {
    if (!this.hardwareProfile) return null;

    const cpuUsage = await sampleCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const battery = detectBattery();

    const prevTier = this.currentState?.capabilityTier || 2;

    this.currentState = {
      timestamp: Date.now(),
      cpuUsagePercent: cpuUsage,
      ramUsedBytes: usedMem,
      ramUsedPercent: Math.round((usedMem / totalMem) * 100),
      ramAvailableBytes: freeMem,
      backgroundProcessCount: -1, // skip expensive process count in monitoring
      thermalState: cpuUsage > 90 ? 'throttling' : 'normal',
      battery,
      capabilityTier: 2,
    };

    this.currentState.capabilityTier = calculateTier(this.hardwareProfile, this.currentState);

    // Notify on tier change
    if (this.currentState.capabilityTier !== prevTier) {
      log.info(
        `[SystemProfiler] Tier changed: ${prevTier} -> ${this.currentState.capabilityTier} ` +
        `(CPU: ${cpuUsage}%, RAM: ${this.currentState.ramUsedPercent}%)`
      );
      for (const cb of this.tierChangeCallbacks) {
        try { cb(this.currentState.capabilityTier, prevTier); } catch { /* ignore */ }
      }
    }

    // Notify on battery change
    if (this.currentState.battery.isPluggedIn !== battery.isPluggedIn) {
      for (const cb of this.batteryChangeCallbacks) {
        try { cb(battery); } catch { /* ignore */ }
      }
    }

    this.store.set('lastState', this.currentState);
    return this.currentState;
  }

  // Getters
  getTier(): CapabilityTier {
    return this.currentState?.capabilityTier || 2;
  }

  getHardwareProfile(): HardwareProfile | null {
    return this.hardwareProfile;
  }

  getSystemState(): SystemState | null {
    return this.currentState;
  }

  getFullProfile(): FullProfile | null {
    if (!this.hardwareProfile || !this.currentState) return null;
    return { hardware: this.hardwareProfile, state: this.currentState };
  }

  isOnBattery(): boolean {
    return this.currentState?.battery.hasBattery === true && !this.currentState.battery.isPluggedIn;
  }

  getCpuUsage(): number {
    return this.currentState?.cpuUsagePercent || 0;
  }

  getRamUsagePercent(): number {
    return this.currentState?.ramUsedPercent || 0;
  }

  // Callbacks
  onTierChange(cb: (tier: CapabilityTier, prev: CapabilityTier) => void): void {
    this.tierChangeCallbacks.push(cb);
  }

  onBatteryChange(cb: (battery: BatteryProfile) => void): void {
    this.batteryChangeCallbacks.push(cb);
  }

  // Should we re-run storage benchmark? Only once per day
  private shouldBenchmarkStorage(): boolean {
    const cached = this.store.get('lastStorageBench') as { timestamp: number } | undefined;
    if (!cached) return true;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Date.now() - cached.timestamp > oneDayMs;
  }

  private async getCachedStorageBench(): Promise<{ type: 'ssd' | 'hdd' | 'unknown'; speedMBps: number }> {
    const cached = this.store.get('lastStorageBench') as { type: 'ssd' | 'hdd' | 'unknown'; speedMBps: number } | undefined;
    return cached || { type: 'unknown', speedMBps: 0 };
  }
}

// Singleton
export const systemProfiler = new SystemProfiler();
