// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Adaptive Performance Engine
// ==========================================================================
// Rules 71-75: Adaptive Performance Architecture
// 71. Dynamic capability tier detection based on runtime metrics
// 72. Auto-scale concurrency based on current load
// 73. Predictive resource reservation for anticipated operations
// 74. Gradual performance degradation under sustained load
// 75. Performance mode switching (balanced / performance / battery)
// ==========================================================================

import * as os from 'os';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PerformanceMode = 'balanced' | 'performance' | 'battery';
export type AdaptiveTier = 1 | 2 | 3;

interface RuntimeMetrics {
  cpuPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  cpuCores: number;
  freeMemoryMB: number;
  loadAvg1m: number;
}

interface TierThresholds {
  readonly highTier: { minMemoryMB: number; minCores: number };
  readonly midTier: { minMemoryMB: number; minCores: number };
}

interface PerformanceModeConfig {
  maxConcurrency: number;
  cacheMultiplier: number;
  backgroundTasksEnabled: boolean;
  throttleBackgroundMs: number;
  gcAggressiveness: 'lazy' | 'normal' | 'aggressive';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_THRESHOLDS: TierThresholds = {
  highTier: { minMemoryMB: 16384, minCores: 8 },
  midTier: { minMemoryMB: 8192, minCores: 4 },
};

const MODE_CONFIGS: Record<PerformanceMode, PerformanceModeConfig> = {
  performance: {
    maxConcurrency: 8,
    cacheMultiplier: 2.0,
    backgroundTasksEnabled: true,
    throttleBackgroundMs: 0,
    gcAggressiveness: 'lazy',
  },
  balanced: {
    maxConcurrency: 4,
    cacheMultiplier: 1.0,
    backgroundTasksEnabled: true,
    throttleBackgroundMs: 100,
    gcAggressiveness: 'normal',
  },
  battery: {
    maxConcurrency: 2,
    cacheMultiplier: 0.5,
    backgroundTasksEnabled: false,
    throttleBackgroundMs: 500,
    gcAggressiveness: 'aggressive',
  },
};

const METRIC_SAMPLE_INTERVAL_MS = 10_000; // 10s
const LOAD_HISTORY_SIZE = 30; // 5 minutes of history at 10s intervals
const HIGH_LOAD_THRESHOLD = 0.85;
const LOW_LOAD_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Rule 71: Dynamic capability tier detection
// ---------------------------------------------------------------------------

function detectCapabilityTier(): AdaptiveTier {
  const totalMB = os.totalmem() / (1024 * 1024);
  const cores = os.cpus().length;

  if (totalMB >= TIER_THRESHOLDS.highTier.minMemoryMB && cores >= TIER_THRESHOLDS.highTier.minCores) {
    return 1;
  }
  if (totalMB >= TIER_THRESHOLDS.midTier.minMemoryMB && cores >= TIER_THRESHOLDS.midTier.minCores) {
    return 2;
  }
  return 3;
}

// ---------------------------------------------------------------------------
// Adaptive Performance Engine
// ---------------------------------------------------------------------------

class AdaptivePerformanceEngine {
  private currentTier: AdaptiveTier;
  private currentMode: PerformanceMode = 'balanced';
  private loadHistory: number[] = [];
  private metricInterval: NodeJS.Timeout | null = null;
  private degradationLevel = 0; // 0 = normal, 1-5 = progressively degraded
  private lastCpuUsage = process.cpuUsage();
  private lastCpuCheck = Date.now();
  private reservedMemoryMB = 0;
  private concurrencyOverride: number | null = null;

  constructor() {
    this.currentTier = detectCapabilityTier();
  }

  // Rule 71: Initialize with runtime tier detection
  initialize(): void {
    this.currentTier = detectCapabilityTier();
    log.info(`[AdaptivePerf] Tier ${this.currentTier} | Mode: ${this.currentMode} | Cores: ${os.cpus().length} | RAM: ${Math.round(os.totalmem() / 1024 / 1024)}MB`);

    this.metricInterval = setInterval(() => this.sampleMetrics(), METRIC_SAMPLE_INTERVAL_MS);
    this.sampleMetrics();
  }

  // Rule 75: Switch performance mode
  setMode(mode: PerformanceMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.concurrencyOverride = null;
    log.info(`[AdaptivePerf] Mode switched to: ${mode}`);
  }

  getMode(): PerformanceMode {
    return this.currentMode;
  }

  getModeConfig(): PerformanceModeConfig {
    return { ...MODE_CONFIGS[this.currentMode] };
  }

  getTier(): AdaptiveTier {
    return this.currentTier;
  }

  // Rule 72: Auto-scale concurrency
  getEffectiveConcurrency(): number {
    if (this.concurrencyOverride !== null) return this.concurrencyOverride;

    const baseConfig = MODE_CONFIGS[this.currentMode];
    let concurrency = baseConfig.maxConcurrency;

    // Scale down based on tier
    if (this.currentTier === 2) concurrency = Math.max(1, Math.floor(concurrency * 0.75));
    if (this.currentTier === 3) concurrency = Math.max(1, Math.floor(concurrency * 0.5));

    // Scale down based on degradation
    if (this.degradationLevel > 0) {
      concurrency = Math.max(1, concurrency - this.degradationLevel);
    }

    return concurrency;
  }

  // Rule 73: Predictive resource reservation
  reserveMemory(operationName: string, estimatedMB: number): boolean {
    const freeMB = os.freemem() / (1024 * 1024);
    const available = freeMB - this.reservedMemoryMB;

    if (available < estimatedMB * 1.2) { // 20% safety margin
      log.warn(`[AdaptivePerf] Cannot reserve ${estimatedMB}MB for '${operationName}' -- only ${Math.round(available)}MB available`);
      return false;
    }

    this.reservedMemoryMB += estimatedMB;
    log.debug(`[AdaptivePerf] Reserved ${estimatedMB}MB for '${operationName}' (total reserved: ${this.reservedMemoryMB}MB)`);
    return true;
  }

  releaseMemory(estimatedMB: number): void {
    this.reservedMemoryMB = Math.max(0, this.reservedMemoryMB - estimatedMB);
  }

  // Rule 74: Gradual degradation under sustained load
  getDegradationLevel(): number {
    return this.degradationLevel;
  }

  shouldDeferBackgroundWork(): boolean {
    const config = MODE_CONFIGS[this.currentMode];
    if (!config.backgroundTasksEnabled) return true;
    return this.degradationLevel >= 3;
  }

  getBackgroundThrottleMs(): number {
    const config = MODE_CONFIGS[this.currentMode];
    return config.throttleBackgroundMs + (this.degradationLevel * 200);
  }

  // ---------------------------------------------------------------------------
  // Internal: Metric sampling and adaptation
  // ---------------------------------------------------------------------------

  private sampleMetrics(): void {
    const metrics = this.collectMetrics();
    const loadFactor = this.computeLoadFactor(metrics);

    this.loadHistory.push(loadFactor);
    if (this.loadHistory.length > LOAD_HISTORY_SIZE) {
      this.loadHistory.shift();
    }

    // Rule 71: Re-evaluate tier based on runtime metrics
    this.evaluateRuntimeTier(metrics);

    // Rule 74: Adjust degradation
    this.adjustDegradation();

    // Rule 72: Adjust concurrency if sustained heavy load
    this.adjustConcurrency();
  }

  private collectMetrics(): RuntimeMetrics {
    const now = Date.now();
    const elapsed = now - this.lastCpuCheck;
    const cpu = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = now;

    const totalMicros = cpu.user + cpu.system;
    const elapsedMicros = elapsed * 1000;
    const cpuPercent = Math.min(100, (totalMicros / elapsedMicros) * 100);

    const totalMB = os.totalmem() / (1024 * 1024);
    const freeMB = os.freemem() / (1024 * 1024);

    return {
      cpuPercent,
      memoryUsedMB: totalMB - freeMB,
      memoryTotalMB: totalMB,
      cpuCores: os.cpus().length,
      freeMemoryMB: freeMB,
      loadAvg1m: os.loadavg()[0],
    };
  }

  private computeLoadFactor(metrics: RuntimeMetrics): number {
    const cpuLoad = metrics.cpuPercent / 100;
    const memLoad = metrics.memoryUsedMB / metrics.memoryTotalMB;
    return Math.max(cpuLoad, memLoad); // Worst of the two
  }

  private evaluateRuntimeTier(metrics: RuntimeMetrics): void {
    // If system has sustained low free memory, may need to downgrade tier
    if (this.loadHistory.length >= 10) {
      const avg = this.loadHistory.reduce((a, b) => a + b, 0) / this.loadHistory.length;
      const staticTier = detectCapabilityTier();

      if (avg > HIGH_LOAD_THRESHOLD && this.currentTier < 3) {
        // System is overloaded -- downgrade
        this.currentTier = Math.min(3, this.currentTier + 1) as AdaptiveTier;
        log.info(`[AdaptivePerf] Runtime tier downgraded to ${this.currentTier} (avg load: ${avg.toFixed(2)})`);
      } else if (avg < LOW_LOAD_THRESHOLD && this.currentTier > staticTier) {
        // System is underloaded -- restore to static tier
        this.currentTier = staticTier;
        log.info(`[AdaptivePerf] Runtime tier restored to ${this.currentTier} (avg load: ${avg.toFixed(2)})`);
      }
    }
  }

  private adjustDegradation(): void {
    if (this.loadHistory.length < 5) return;

    const recent = this.loadHistory.slice(-5);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    if (avg > 0.9 && this.degradationLevel < 5) {
      this.degradationLevel++;
      log.warn(`[AdaptivePerf] Degradation increased to ${this.degradationLevel} (load: ${avg.toFixed(2)})`);
    } else if (avg < 0.5 && this.degradationLevel > 0) {
      this.degradationLevel = Math.max(0, this.degradationLevel - 1);
      log.info(`[AdaptivePerf] Degradation decreased to ${this.degradationLevel} (load: ${avg.toFixed(2)})`);
    }
  }

  private adjustConcurrency(): void {
    if (this.loadHistory.length < 10) return;

    const recent = this.loadHistory.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const baseConfig = MODE_CONFIGS[this.currentMode];

    if (avg > HIGH_LOAD_THRESHOLD) {
      this.concurrencyOverride = Math.max(1, Math.floor(baseConfig.maxConcurrency * 0.5));
    } else if (avg < LOW_LOAD_THRESHOLD && this.concurrencyOverride !== null) {
      this.concurrencyOverride = null; // Restore default
    }
  }

  // ---------------------------------------------------------------------------
  // Dashboard data
  // ---------------------------------------------------------------------------

  getDashboardData(): Record<string, any> {
    return {
      tier: this.currentTier,
      mode: this.currentMode,
      degradationLevel: this.degradationLevel,
      effectiveConcurrency: this.getEffectiveConcurrency(),
      reservedMemoryMB: this.reservedMemoryMB,
      loadHistory: this.loadHistory.slice(-10),
      shouldDeferBackground: this.shouldDeferBackgroundWork(),
    };
  }

  shutdown(): void {
    if (this.metricInterval) {
      clearInterval(this.metricInterval);
      this.metricInterval = null;
    }
    log.info('[AdaptivePerf] Shutdown');
  }
}

export const adaptivePerformance = new AdaptivePerformanceEngine();

export function initializeAdaptivePerformance(): void {
  adaptivePerformance.initialize();
}

export function shutdownAdaptivePerformance(): void {
  adaptivePerformance.shutdown();
}
