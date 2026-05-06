// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Hardware Reality Detection
// ==========================================================================
// Runs once on every launch in under 200ms during Phase A before any
// window is shown. Produces a complete hardware capability profile that
// is the single source of truth for every quality decision in every system.
// ==========================================================================

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { app, screen } from 'electron';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CapabilityTierName =
  | 'tier-1-premium'
  | 'tier-1'
  | 'tier-2'
  | 'tier-3-standard'
  | 'tier-3-critical';

export type RamTier = 'critical' | 'low' | 'medium' | 'high' | 'abundant';
export type StorageClass = 'slow-hdd' | 'fast-hdd' | 'sata-ssd' | 'nvme-ssd';
export type GpuClass = 'none' | 'intel-integrated' | 'amd-integrated' | 'apple-silicon' | 'discrete-nvidia' | 'discrete-amd' | 'discrete-unknown';
export type CpuVendor = 'intel' | 'amd' | 'apple' | 'qualcomm' | 'unknown';
export type ThermalState = 'cool' | 'warm' | 'hot' | 'critical';
export type BatteryClass = 'desktop' | 'charging' | 'battery-high' | 'battery-mid' | 'battery-low' | 'battery-critical';
export type PowerState = 'ac' | 'battery-above-50' | 'battery-20-50' | 'battery-below-20' | 'battery-below-5';

export interface CpuProfile {
  logicalCores: number;
  physicalCores: number;
  clockSpeedGHz: number;
  architecture: string;
  vendor: CpuVendor;
  model: string;
  hasHyperthreading: boolean;
  hasEfficiencyCores: boolean;
  efficiencyCoreIndices: number[];
  performanceCoreIndices: number[];
  cpuScore: number;
}

export interface RamProfile {
  totalBytes: number;
  totalMB: number;
  availableBytes: number;
  availableMB: number;
  usableMB: number;
  tier: RamTier;
}

export interface StorageProfile {
  readMBps: number;
  writeMBps: number;
  storageClass: StorageClass;
}

export interface GpuProfile {
  gpuClass: GpuClass;
  renderer: string;
  vendor: string;
  estimatedVRAM_MB: number;
  gpuScore: number;
  webgl2Supported: boolean;
}

export interface BatteryProfile {
  hasBattery: boolean;
  isCharging: boolean;
  percent: number;
  batteryClass: BatteryClass;
  powerState: PowerState;
}

export interface DisplayProfile {
  primaryRefreshRate: number;
  primaryDPI: number;
  displayCount: number;
  primaryWidth: number;
  primaryHeight: number;
}

export interface ThermalProfile {
  baselineTemp: number;
  currentTemp: number;
  thermalState: ThermalState;
  cpuUsageProxy: number;
}

export interface HardwareCapabilityProfile {
  cpu: CpuProfile;
  ram: RamProfile;
  storage: StorageProfile;
  gpu: GpuProfile;
  battery: BatteryProfile;
  display: DisplayProfile;
  thermal: ThermalProfile;
  tier: CapabilityTierName;
  tierNumeric: number;
  timestamp: number;
}

export interface MemoryBudgets {
  totalBudgetMB: number;
  mainProcessMB: number;
  innerAppRendererMB: number;
  gameRendererMB: number;
  databaseWorkerMB: number;
  fileTransferWorkerMB: number;
  intelligenceWorkerMB: number;
  analyticsWorkerMB: number;
  securityWorkerMB: number;
  otherWorkersMB: number;
  cacheMB: number;
  osReserveMB: number;
  maxActiveRenderers: number;
  v8HeapLimitMB: number;
  /** SSD spill budget (0 = no spill to disk) */
  ssdSpillMB: number;
  /** Total effective memory including SSD spill */
  effectiveTotalMB: number;
}

export interface GameQualityDefaults {
  targetFPS: number;
  renderResolutionPercent: number;
  particlePercent: number;
  shadowQuality: 'none' | 'ambient-only' | 'directional' | 'full-dynamic';
  postProcessEffects: string[];
  maxEnemyCount: number;
  audioSampleRate: number;
  useCanvas2DOnly: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_FILE_NAME = 'hardware-profile-cache.json';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_TEST_SIZE = 16 * 1024 * 1024;
const CPU_SCORE_REFERENCE = 8 * 4.0;

// ---------------------------------------------------------------------------
// Memory budgets per tier
// ---------------------------------------------------------------------------

const MEMORY_BUDGETS: Record<CapabilityTierName, MemoryBudgets> = {
  'tier-1-premium': {
    totalBudgetMB: 3072,
    mainProcessMB: 80,
    innerAppRendererMB: 120,
    gameRendererMB: 400,
    databaseWorkerMB: 128,
    fileTransferWorkerMB: 64,
    intelligenceWorkerMB: 64,
    analyticsWorkerMB: 32,
    securityWorkerMB: 32,
    otherWorkersMB: 128,
    cacheMB: 512,
    osReserveMB: 512,
    maxActiveRenderers: 99,
    v8HeapLimitMB: 2048,
    ssdSpillMB: 2048,
    effectiveTotalMB: 5120,
  },
  'tier-1': {
    totalBudgetMB: 2048,
    mainProcessMB: 60,
    innerAppRendererMB: 80,
    gameRendererMB: 300,
    databaseWorkerMB: 96,
    fileTransferWorkerMB: 48,
    intelligenceWorkerMB: 48,
    analyticsWorkerMB: 24,
    securityWorkerMB: 24,
    otherWorkersMB: 96,
    cacheMB: 256,
    osReserveMB: 512,
    maxActiveRenderers: 99,
    v8HeapLimitMB: 1024,
    ssdSpillMB: 2048,
    effectiveTotalMB: 4096,
  },
  'tier-2': {
    totalBudgetMB: 1024,
    mainProcessMB: 48,
    innerAppRendererMB: 60,
    gameRendererMB: 200,
    databaseWorkerMB: 64,
    fileTransferWorkerMB: 32,
    intelligenceWorkerMB: 32,
    analyticsWorkerMB: 16,
    securityWorkerMB: 16,
    otherWorkersMB: 64,
    cacheMB: 128,
    osReserveMB: 512,
    maxActiveRenderers: 99,
    v8HeapLimitMB: 512,
    ssdSpillMB: 1024,
    effectiveTotalMB: 2048,
  },
  'tier-3-standard': {
    totalBudgetMB: 768,
    mainProcessMB: 40,
    innerAppRendererMB: 48,
    gameRendererMB: 150,
    databaseWorkerMB: 48,
    fileTransferWorkerMB: 24,
    intelligenceWorkerMB: 16,
    analyticsWorkerMB: 8,
    securityWorkerMB: 16,
    otherWorkersMB: 48,
    cacheMB: 64,
    osReserveMB: 512,
    maxActiveRenderers: 99,
    v8HeapLimitMB: 256,
    ssdSpillMB: 512,
    effectiveTotalMB: 1280,
  },
  'tier-3-critical': {
    totalBudgetMB: 512,
    mainProcessMB: 32,
    innerAppRendererMB: 48,
    gameRendererMB: 0,
    databaseWorkerMB: 32,
    fileTransferWorkerMB: 0,
    intelligenceWorkerMB: 0,
    analyticsWorkerMB: 0,
    securityWorkerMB: 0,
    otherWorkersMB: 32,
    cacheMB: 32,
    osReserveMB: 512,
    maxActiveRenderers: 1,
    v8HeapLimitMB: 128,
    ssdSpillMB: 0,
    effectiveTotalMB: 512,
  },
};

// ---------------------------------------------------------------------------
// Game quality defaults per tier
// ---------------------------------------------------------------------------

const GAME_QUALITY_DEFAULTS: Record<CapabilityTierName, GameQualityDefaults> = {
  'tier-1-premium': {
    targetFPS: 120,
    renderResolutionPercent: 100,
    particlePercent: 100,
    shadowQuality: 'full-dynamic',
    postProcessEffects: ['bloom', 'chromatic-aberration', 'screen-shake', 'vignette'],
    maxEnemyCount: 20,
    audioSampleRate: 44100,
    useCanvas2DOnly: false,
  },
  'tier-1': {
    targetFPS: 60,
    renderResolutionPercent: 100,
    particlePercent: 75,
    shadowQuality: 'directional',
    postProcessEffects: ['chromatic-aberration', 'screen-shake', 'vignette'],
    maxEnemyCount: 16,
    audioSampleRate: 44100,
    useCanvas2DOnly: false,
  },
  'tier-2': {
    targetFPS: 60,
    renderResolutionPercent: 75,
    particlePercent: 50,
    shadowQuality: 'ambient-only',
    postProcessEffects: ['screen-shake'],
    maxEnemyCount: 12,
    audioSampleRate: 22050,
    useCanvas2DOnly: false,
  },
  'tier-3-standard': {
    targetFPS: 30,
    renderResolutionPercent: 50,
    particlePercent: 25,
    shadowQuality: 'none',
    postProcessEffects: [],
    maxEnemyCount: 8,
    audioSampleRate: 22050,
    useCanvas2DOnly: false,
  },
  'tier-3-critical': {
    targetFPS: 30,
    renderResolutionPercent: 50,
    particlePercent: 0,
    shadowQuality: 'none',
    postProcessEffects: [],
    maxEnemyCount: 6,
    audioSampleRate: 11025,
    useCanvas2DOnly: true,
  },
};

// ---------------------------------------------------------------------------
// SQLite page cache sizes per tier
// ---------------------------------------------------------------------------

const SQLITE_PAGE_CACHE: Record<CapabilityTierName, number> = {
  'tier-1-premium': 8192,
  'tier-1': 4096,
  'tier-2': 2048,
  'tier-3-standard': 1024,
  'tier-3-critical': 256,
};

// ---------------------------------------------------------------------------
// Hardware Detector
// ---------------------------------------------------------------------------

class HardwareDetector {
  private profile: HardwareCapabilityProfile | null = null;
  private cachePath: string = '';
  private listeners: Array<(profile: HardwareCapabilityProfile) => void> = [];
  private thermalBaseline: number = 0;
  private thermalHistory: number[] = [];
  private cpuUsageHistory: number[] = [];

  // -----------------------------------------------------------------------
  // Public interface
  // -----------------------------------------------------------------------

  async detect(): Promise<HardwareCapabilityProfile> {
    this.cachePath = path.join(app.getPath('userData'), CACHE_FILE_NAME);

    const cached = this.loadCache();
    if (cached) {
      this.profile = cached;
      log.info(`[HardwareDetector] Loaded cached profile: ${cached.tier}`);
      return cached;
    }

    const start = Date.now();
    const cpu = this.detectCPU();
    const ram = this.detectRAM();
    const storage = await this.detectStorage();
    const display = this.detectDisplay();
    const battery = await this.detectBattery();
    const gpu: GpuProfile = {
      gpuClass: 'none',
      renderer: '',
      vendor: '',
      estimatedVRAM_MB: 0,
      gpuScore: 0,
      webgl2Supported: false,
    };
    const thermal: ThermalProfile = {
      baselineTemp: 0,
      currentTemp: 0,
      thermalState: 'cool',
      cpuUsageProxy: 0,
    };

    const tier = this.computeTier(cpu, ram, storage, gpu);
    const tierNumeric = this.tierToNumeric(tier);

    this.profile = {
      cpu,
      ram,
      storage,
      gpu,
      battery,
      display,
      thermal,
      tier,
      tierNumeric,
      timestamp: Date.now(),
    };

    this.saveCache(this.profile);
    const elapsed = Date.now() - start;
    log.info(`[HardwareDetector] Detection complete in ${elapsed}ms: ${tier} (score CPU=${cpu.cpuScore}, GPU=${gpu.gpuScore})`);
    return this.profile;
  }

  async detectGPUFromRenderer(rendererString: string, vendorString: string): Promise<void> {
    if (!this.profile) return;
    const gpu = this.parseGPU(rendererString, vendorString);
    this.profile.gpu = gpu;
    const newTier = this.computeTier(this.profile.cpu, this.profile.ram, this.profile.storage, gpu);
    if (newTier !== this.profile.tier) {
      this.profile.tier = newTier;
      this.profile.tierNumeric = this.tierToNumeric(newTier);
      this.notifyListeners();
    }
    this.saveCache(this.profile);
  }

  getProfile(): HardwareCapabilityProfile | null {
    return this.profile;
  }

  getTier(): CapabilityTierName {
    return this.profile?.tier ?? 'tier-3-standard';
  }

  getTierNumeric(): number {
    return this.profile?.tierNumeric ?? 3;
  }

  getMemoryBudgets(): MemoryBudgets {
    return MEMORY_BUDGETS[this.getTier()];
  }

  getGameQualityDefaults(): GameQualityDefaults {
    return GAME_QUALITY_DEFAULTS[this.getTier()];
  }

  getSQLitePageCache(): number {
    return SQLITE_PAGE_CACHE[this.getTier()];
  }

  onProfileChange(handler: (profile: HardwareCapabilityProfile) => void): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter(h => h !== handler);
    };
  }

  // -----------------------------------------------------------------------
  // Thermal monitoring (called periodically after startup)
  // -----------------------------------------------------------------------

  updateThermal(temperatureC: number): ThermalState {
    if (!this.profile) return 'cool';

    if (this.thermalBaseline === 0 && this.thermalHistory.length < 6) {
      this.thermalHistory.push(temperatureC);
      if (this.thermalHistory.length === 6) {
        this.thermalBaseline = this.thermalHistory.reduce((a, b) => a + b, 0) / this.thermalHistory.length;
      }
      this.profile.thermal.currentTemp = temperatureC;
      return 'cool';
    }

    if (this.thermalBaseline === 0) {
      this.thermalBaseline = temperatureC;
    }

    this.profile.thermal.currentTemp = temperatureC;
    this.profile.thermal.baselineTemp = this.thermalBaseline;

    const delta = temperatureC - this.thermalBaseline;
    let state: ThermalState = 'cool';
    if (temperatureC > 90 || delta > 30) {
      state = 'critical';
    } else if (delta > 20) {
      state = 'hot';
    } else if (delta > 10) {
      state = 'warm';
    }

    if (state !== this.profile.thermal.thermalState) {
      this.profile.thermal.thermalState = state;
      this.notifyListeners();
    }
    return state;
  }

  updateThermalFromCPU(cpuPercent: number): ThermalState {
    if (!this.profile) return 'cool';
    this.cpuUsageHistory.push(cpuPercent);
    if (this.cpuUsageHistory.length > 6) {
      this.cpuUsageHistory.shift();
    }
    this.profile.thermal.cpuUsageProxy = cpuPercent;

    const avg = this.cpuUsageHistory.reduce((a, b) => a + b, 0) / this.cpuUsageHistory.length;
    let state: ThermalState = 'cool';
    if (avg > 90) {
      state = 'critical';
    } else if (avg > 80) {
      state = 'hot';
    } else if (avg > 60) {
      state = 'warm';
    }

    if (state !== this.profile.thermal.thermalState) {
      this.profile.thermal.thermalState = state;
      this.notifyListeners();
    }
    return state;
  }

  // -----------------------------------------------------------------------
  // Battery update (called periodically)
  // -----------------------------------------------------------------------

  updateBattery(isCharging: boolean, percent: number): PowerState {
    if (!this.profile) return 'ac';
    this.profile.battery.isCharging = isCharging;
    this.profile.battery.percent = percent;

    if (!this.profile.battery.hasBattery || isCharging) {
      this.profile.battery.powerState = 'ac';
      this.profile.battery.batteryClass = isCharging ? 'charging' : 'desktop';
    } else if (percent < 5) {
      this.profile.battery.powerState = 'battery-below-5';
      this.profile.battery.batteryClass = 'battery-critical';
    } else if (percent < 20) {
      this.profile.battery.powerState = 'battery-below-20';
      this.profile.battery.batteryClass = 'battery-low';
    } else if (percent < 50) {
      this.profile.battery.powerState = 'battery-20-50';
      this.profile.battery.batteryClass = 'battery-mid';
    } else {
      this.profile.battery.powerState = 'battery-above-50';
      this.profile.battery.batteryClass = 'battery-high';
    }
    return this.profile.battery.powerState;
  }

  // -----------------------------------------------------------------------
  // CPU detection
  // -----------------------------------------------------------------------

  private detectCPU(): CpuProfile {
    const cpus = os.cpus();
    const logicalCores = cpus.length;

    const uniqueModels = new Map<string, number>();
    for (const c of cpus) {
      const key = `${c.model}`;
      uniqueModels.set(key, (uniqueModels.get(key) ?? 0) + 1);
    }

    const speeds = cpus.map(c => c.speed);
    const maxSpeed = Math.max(...speeds);
    const minSpeed = Math.min(...speeds);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

    const hasEfficiencyCores = minSpeed < maxSpeed * 0.7;
    const efficiencyCoreIndices: number[] = [];
    const performanceCoreIndices: number[] = [];
    const speedThreshold = (maxSpeed + minSpeed) / 2;
    for (let i = 0; i < cpus.length; i++) {
      if (hasEfficiencyCores && cpus[i].speed < speedThreshold) {
        efficiencyCoreIndices.push(i);
      } else {
        performanceCoreIndices.push(i);
      }
    }

    const physicalCores = hasEfficiencyCores
      ? Math.ceil(logicalCores / 1.5)
      : Math.ceil(logicalCores / 2);
    const hasHyperthreading = logicalCores > physicalCores;

    const model = cpus[0]?.model ?? '';
    let vendor: CpuVendor = 'unknown';
    const modelLower = model.toLowerCase();
    if (modelLower.includes('intel') || modelLower.includes('core')) {
      vendor = 'intel';
    } else if (modelLower.includes('amd') || modelLower.includes('ryzen') || modelLower.includes('athlon')) {
      vendor = 'amd';
    } else if (modelLower.includes('apple')) {
      vendor = 'apple';
    } else if (modelLower.includes('qualcomm') || modelLower.includes('snapdragon')) {
      vendor = 'qualcomm';
    }

    const clockGHz = avgSpeed / 1000;
    const rawScore = physicalCores * clockGHz;
    const cpuScore = Math.min(100, Math.round((rawScore / CPU_SCORE_REFERENCE) * 100));

    return {
      logicalCores,
      physicalCores,
      clockSpeedGHz: Math.round(clockGHz * 100) / 100,
      architecture: process.arch,
      vendor,
      model,
      hasHyperthreading,
      hasEfficiencyCores,
      efficiencyCoreIndices,
      performanceCoreIndices,
      cpuScore,
    };
  }

  // -----------------------------------------------------------------------
  // RAM detection
  // -----------------------------------------------------------------------

  private detectRAM(): RamProfile {
    const totalBytes = os.totalmem();
    const availableBytes = os.freemem();
    const totalMB = Math.round(totalBytes / (1024 * 1024));
    const availableMB = Math.round(availableBytes / (1024 * 1024));
    const usableMB = Math.max(totalMB - 512, Math.round(totalMB * 0.5));

    let tier: RamTier;
    if (totalMB < 4096) {
      tier = 'critical';
    } else if (totalMB < 8192) {
      tier = 'low';
    } else if (totalMB < 16384) {
      tier = 'medium';
    } else if (totalMB < 32768) {
      tier = 'high';
    } else {
      tier = 'abundant';
    }

    return { totalBytes, totalMB, availableBytes, availableMB, usableMB, tier };
  }

  // -----------------------------------------------------------------------
  // Storage benchmark
  // -----------------------------------------------------------------------

  private async detectStorage(): Promise<StorageProfile> {
    const testPath = path.join(app.getPath('userData'), '.storage-benchmark');
    let readMBps = 200;
    let writeMBps = 150;

    try {
      const buf = Buffer.alloc(STORAGE_TEST_SIZE, 0x55);

      const writeStart = performance.now();
      fs.writeFileSync(testPath, buf);
      const writeEnd = performance.now();
      const writeMs = writeEnd - writeStart;
      writeMBps = Math.round((STORAGE_TEST_SIZE / (1024 * 1024)) / (writeMs / 1000));

      const readStart = performance.now();
      fs.readFileSync(testPath);
      const readEnd = performance.now();
      const readMs = readEnd - readStart;
      readMBps = Math.round((STORAGE_TEST_SIZE / (1024 * 1024)) / (readMs / 1000));

      try { fs.unlinkSync(testPath); } catch (_e) { /* ignore cleanup failure */ }
    } catch (err) {
      log.warn('[HardwareDetector] Storage benchmark failed, using defaults:', err);
    }

    let storageClass: StorageClass;
    if (readMBps < 150) {
      storageClass = 'slow-hdd';
    } else if (readMBps < 400) {
      storageClass = 'fast-hdd';
    } else if (readMBps < 550) {
      storageClass = 'sata-ssd';
    } else {
      storageClass = 'nvme-ssd';
    }

    return { readMBps, writeMBps, storageClass };
  }

  // -----------------------------------------------------------------------
  // GPU detection (from renderer WebGL info)
  // -----------------------------------------------------------------------

  parseGPU(rendererString: string, vendorString: string): GpuProfile {
    const rLower = rendererString.toLowerCase();
    const vLower = vendorString.toLowerCase();
    let gpuClass: GpuClass = 'none';
    let estimatedVRAM = 0;
    let gpuScore = 0;
    let webgl2 = rendererString.length > 0;

    if (rLower.includes('nvidia') || rLower.includes('geforce') || rLower.includes('rtx') || rLower.includes('gtx')) {
      gpuClass = 'discrete-nvidia';
      estimatedVRAM = 2048;
      gpuScore = rLower.includes('rtx') ? 90 : 75;
    } else if (rLower.includes('radeon') || rLower.includes('rx ')) {
      gpuClass = 'discrete-amd';
      estimatedVRAM = 2048;
      gpuScore = 75;
    } else if (rLower.includes('apple')) {
      gpuClass = 'apple-silicon';
      estimatedVRAM = Math.min(4096, Math.round(this.profile?.ram.totalMB ?? 8192) / 4);
      gpuScore = 60;
    } else if (rLower.includes('amd') && !rLower.includes('radeon')) {
      gpuClass = 'amd-integrated';
      estimatedVRAM = 512;
      gpuScore = 50;
    } else if (rLower.includes('intel') || vLower.includes('intel')) {
      gpuClass = 'intel-integrated';
      const ramMB = this.profile?.ram.totalMB ?? 4096;
      estimatedVRAM = ramMB >= 8192 ? 512 : ramMB >= 4096 ? 256 : 128;
      gpuScore = estimatedVRAM >= 256 ? 30 : 10;
    } else if (rendererString.length > 0) {
      gpuClass = 'discrete-unknown';
      estimatedVRAM = 1024;
      gpuScore = 50;
    }

    return {
      gpuClass,
      renderer: rendererString,
      vendor: vendorString,
      estimatedVRAM_MB: estimatedVRAM,
      gpuScore,
      webgl2Supported: webgl2,
    };
  }

  // -----------------------------------------------------------------------
  // Display detection
  // -----------------------------------------------------------------------

  private detectDisplay(): DisplayProfile {
    try {
      const primary = screen.getPrimaryDisplay();
      const all = screen.getAllDisplays();
      return {
        primaryRefreshRate: primary.displayFrequency || 60,
        primaryDPI: primary.scaleFactor || 1,
        displayCount: all.length,
        primaryWidth: primary.size.width,
        primaryHeight: primary.size.height,
      };
    } catch {
      return {
        primaryRefreshRate: 60,
        primaryDPI: 1,
        displayCount: 1,
        primaryWidth: 1920,
        primaryHeight: 1080,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Battery detection
  // -----------------------------------------------------------------------

  private async detectBattery(): Promise<BatteryProfile> {
    const noBattery: BatteryProfile = {
      hasBattery: false,
      isCharging: false,
      percent: 100,
      batteryClass: 'desktop',
      powerState: 'ac',
    };

    try {
      let si: any;
      try {
        si = require('systeminformation');
      } catch {
        return noBattery;
      }
      const bat = await si.battery();
      if (!bat || !bat.hasBattery) return noBattery;

      const isCharging = bat.isCharging;
      const percent = bat.percent;
      let batteryClass: BatteryClass = 'battery-high';
      let powerState: PowerState = 'battery-above-50';

      if (isCharging) {
        batteryClass = percent < 20 ? 'battery-low' : 'charging';
        powerState = 'ac';
      } else if (percent < 5) {
        batteryClass = 'battery-critical';
        powerState = 'battery-below-5';
      } else if (percent < 20) {
        batteryClass = 'battery-low';
        powerState = 'battery-below-20';
      } else if (percent < 50) {
        batteryClass = 'battery-mid';
        powerState = 'battery-20-50';
      }

      return { hasBattery: true, isCharging, percent, batteryClass, powerState };
    } catch {
      return noBattery;
    }
  }

  // -----------------------------------------------------------------------
  // Tier computation
  // -----------------------------------------------------------------------

  private computeTier(cpu: CpuProfile, ram: RamProfile, storage: StorageProfile, gpu: GpuProfile): CapabilityTierName {
    if (cpu.cpuScore <= 15 || ram.tier === 'critical') {
      return 'tier-3-critical';
    }

    const isNVMe = storage.storageClass === 'nvme-ssd';
    const isSSD = storage.storageClass === 'sata-ssd' || isNVMe;
    const hasDiscreteGPU = gpu.gpuClass.startsWith('discrete-') || gpu.gpuClass === 'apple-silicon';
    const ramHighPlus = ram.tier === 'high' || ram.tier === 'abundant';
    const ramMedPlus = ramHighPlus || ram.tier === 'medium';

    if (cpu.cpuScore > 70 && ramHighPlus && isNVMe && hasDiscreteGPU) {
      return 'tier-1-premium';
    }
    if (cpu.cpuScore > 50 && ramMedPlus && isSSD) {
      return 'tier-1';
    }
    if (cpu.cpuScore > 30) {
      return 'tier-2';
    }
    return 'tier-3-standard';
  }

  private tierToNumeric(tier: CapabilityTierName): number {
    switch (tier) {
      case 'tier-1-premium': return 0;
      case 'tier-1': return 1;
      case 'tier-2': return 2;
      case 'tier-3-standard': return 3;
      case 'tier-3-critical': return 4;
    }
  }

  // -----------------------------------------------------------------------
  // Cache
  // -----------------------------------------------------------------------

  private loadCache(): HardwareCapabilityProfile | null {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const data = JSON.parse(raw) as HardwareCapabilityProfile;
      if (Date.now() - data.timestamp > CACHE_MAX_AGE_MS) return null;
      return data;
    } catch {
      return null;
    }
  }

  private saveCache(profile: HardwareCapabilityProfile): void {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(profile), 'utf-8');
    } catch (err) {
      log.warn('[HardwareDetector] Failed to save cache:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Notification
  // -----------------------------------------------------------------------

  private notifyListeners(): void {
    if (!this.profile) return;
    for (const handler of this.listeners) {
      try { handler(this.profile); } catch (e) { log.warn('[HardwareDetector] Listener error:', e); }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const hardwareDetector = new HardwareDetector();
export { MEMORY_BUDGETS, GAME_QUALITY_DEFAULTS, SQLITE_PAGE_CACHE };
