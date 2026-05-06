// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- System Optimization Wiring
// ==========================================================================
// Connects every optimization system to every inner app and game system.
// Listens for capability tier changes, thermal events, memory pressure,
// and power state changes. Broadcasts adjustments to all subscribed
// systems within 100ms of any trigger event.
// ==========================================================================

import { BrowserWindow, ipcMain } from 'electron';
import * as log from 'electron-log';
import { hardwareDetector, CapabilityTierName, HardwareCapabilityProfile } from './HardwareDetector';
import { memoryBudget, MemoryPressureLevel } from './MemoryBudgetService';
import { workStealingScheduler } from './WorkStealingScheduler';
import { thermalPowerManager, ThermalEvent, PowerEvent } from './ThermalPowerManager';
import { databasePerformanceOptimizer } from './DatabasePerformanceOptimizer';
import { ipcEfficiencyManager } from './IPCEfficiencyManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemOptimizationSnapshot {
  tier: CapabilityTierName;
  tierNumeric: number;
  memoryPressure: MemoryPressureLevel;
  thermalState: string;
  powerState: string;
  gpuPowerMode: string;
  schedulerSnapshot: any;
  ipcMetrics: any;
  dbConfig: any;
  uptime: number;
}

// ---------------------------------------------------------------------------
// Inner App Optimization Directives
// ---------------------------------------------------------------------------

interface AppDirective {
  documentChunkSize: number;
  undoHistoryDepth: number;
  virtualizationBuffer: number;
  thumbnailCacheSize: number;
  previewResolution: string;
  animationDurationScale: number;
  backgroundGenerationRate: number;
  maxVisibleColumns: number;
  particleScale: number;
  writeCoalesceMs: number;
}

function computeDirective(tier: CapabilityTierName, pressure: MemoryPressureLevel, thermalState: string): AppDirective {
  const base: AppDirective = {
    documentChunkSize: 5000,
    undoHistoryDepth: 50,
    virtualizationBuffer: 50,
    thumbnailCacheSize: 500,
    previewResolution: '1080p',
    animationDurationScale: 1,
    backgroundGenerationRate: 1,
    maxVisibleColumns: 20,
    particleScale: 1,
    writeCoalesceMs: 100,
  };

  // Tier adjustments
  switch (tier) {
    case 'tier-3-critical':
      base.documentChunkSize = 1000;
      base.undoHistoryDepth = 10;
      base.virtualizationBuffer = 10;
      base.thumbnailCacheSize = 50;
      base.previewResolution = '360p';
      base.animationDurationScale = 0;
      base.backgroundGenerationRate = 0.1;
      base.maxVisibleColumns = 5;
      base.particleScale = 0;
      base.writeCoalesceMs = 2000;
      break;
    case 'tier-3-standard':
      base.documentChunkSize = 2000;
      base.undoHistoryDepth = 20;
      base.virtualizationBuffer = 20;
      base.thumbnailCacheSize = 100;
      base.previewResolution = '720p';
      base.animationDurationScale = 0.5;
      base.backgroundGenerationRate = 0.3;
      base.maxVisibleColumns = 10;
      base.particleScale = 0.25;
      base.writeCoalesceMs = 500;
      break;
    case 'tier-2':
      base.documentChunkSize = 3000;
      base.undoHistoryDepth = 30;
      base.virtualizationBuffer = 30;
      base.thumbnailCacheSize = 200;
      base.previewResolution = '720p';
      base.animationDurationScale = 0.8;
      base.backgroundGenerationRate = 0.5;
      base.writeCoalesceMs = 200;
      break;
    case 'tier-1':
      base.documentChunkSize = 4000;
      base.undoHistoryDepth = 40;
      break;
    default:
      break;
  }

  // Memory pressure adjustments
  switch (pressure) {
    case 'moderate':
      base.documentChunkSize = Math.min(base.documentChunkSize, 2000);
      base.undoHistoryDepth = Math.min(base.undoHistoryDepth, 10);
      base.thumbnailCacheSize = Math.min(base.thumbnailCacheSize, 100);
      base.backgroundGenerationRate *= 0.5;
      break;
    case 'high':
      base.documentChunkSize = Math.min(base.documentChunkSize, 1000);
      base.undoHistoryDepth = Math.min(base.undoHistoryDepth, 5);
      base.thumbnailCacheSize = 0;
      base.virtualizationBuffer = Math.min(base.virtualizationBuffer, 10);
      base.previewResolution = '360p';
      base.backgroundGenerationRate = 0;
      break;
    case 'critical':
    case 'emergency':
      base.documentChunkSize = 500;
      base.undoHistoryDepth = 3;
      base.thumbnailCacheSize = 0;
      base.virtualizationBuffer = 5;
      base.previewResolution = '360p';
      base.animationDurationScale = 0;
      base.backgroundGenerationRate = 0;
      base.particleScale = 0;
      break;
  }

  // Thermal adjustments
  switch (thermalState) {
    case 'warm':
      base.backgroundGenerationRate *= 0.5;
      base.particleScale *= 0.75;
      break;
    case 'hot':
      base.backgroundGenerationRate = 0;
      base.animationDurationScale *= 0.5;
      base.particleScale *= 0.5;
      break;
    case 'critical':
      base.backgroundGenerationRate = 0;
      base.animationDurationScale = 0;
      base.particleScale = 0;
      break;
  }

  return base;
}

// ---------------------------------------------------------------------------
// System Optimization Wiring
// ---------------------------------------------------------------------------

class SystemOptimizationWiring {
  private mainWindow: BrowserWindow | null = null;
  private started = false;
  private startTime = Date.now();
  private currentDirective: AppDirective | null = null;
  private inputActivityInterval: ReturnType<typeof setInterval> | null = null;

  // -----------------------------------------------------------------------
  // Initialize all systems and wire events
  // -----------------------------------------------------------------------

  async initialize(win: BrowserWindow): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.mainWindow = win;

    // Start all optimization subsystems
    memoryBudget.start(win);
    thermalPowerManager.start(win);
    workStealingScheduler.start();
    databasePerformanceOptimizer.start();
    ipcEfficiencyManager.start(win);

    // Adjust scheduler for current tier
    workStealingScheduler.adjustForTier(hardwareDetector.getTier());

    // Wire hardware profile changes
    hardwareDetector.onProfileChange((profile: HardwareCapabilityProfile) => {
      this.onTierChange(profile.tier);
    });

    // Wire memory pressure
    memoryBudget.onPressureChange((level: MemoryPressureLevel) => {
      this.onMemoryPressure(level);
    });

    // Wire thermal
    thermalPowerManager.onThermalChange((event: ThermalEvent) => {
      this.onThermalChange(event);
    });

    // Wire power
    thermalPowerManager.onPowerChange((event: PowerEvent) => {
      this.onPowerChange(event);
    });

    // Wire scheduler idle
    workStealingScheduler.on('idle-start', () => {
      this.broadcastToRenderer('dex:idle-start', {});
    });
    workStealingScheduler.on('idle-end', () => {
      this.broadcastToRenderer('dex:idle-end', {});
    });

    // Wire user input activity from renderer
    ipcMain.on('user:activity', () => {
      workStealingScheduler.recordInput();
    });

    // Register IPC for renderer queries
    this.registerIPC();

    // Compute and broadcast initial directive
    this.recomputeAndBroadcast();

    log.info('[SystemWiring] All optimization systems wired');
  }

  shutdown(): void {
    memoryBudget.stop();
    thermalPowerManager.stop();
    workStealingScheduler.stop();
    databasePerformanceOptimizer.stop();
    ipcEfficiencyManager.stop();
    if (this.inputActivityInterval) clearInterval(this.inputActivityInterval);
    this.started = false;
    log.info('[SystemWiring] Shutdown complete');
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  private onTierChange(tier: CapabilityTierName): void {
    log.info(`[SystemWiring] Tier changed to ${tier}`);
    workStealingScheduler.adjustForTier(tier);
    this.recomputeAndBroadcast();
    this.broadcastToRenderer('dex:capability-tier-changed', {
      tier,
      tierNumeric: hardwareDetector.getTierNumeric(),
      budgets: hardwareDetector.getMemoryBudgets(),
      gameDefaults: hardwareDetector.getGameQualityDefaults(),
    });
  }

  private onMemoryPressure(level: MemoryPressureLevel): void {
    log.info(`[SystemWiring] Memory pressure: ${level}`);

    if (level === 'high' || level === 'critical' || level === 'emergency') {
      workStealingScheduler.setBackgroundPaused(true);
    } else {
      workStealingScheduler.setBackgroundPaused(false);
    }

    this.recomputeAndBroadcast();
    this.broadcastToRenderer('dex:memory-pressure', {
      level,
      snapshot: memoryBudget.getSnapshot(),
    });
  }

  private onThermalChange(event: ThermalEvent): void {
    log.info(`[SystemWiring] Thermal: ${event.state}`);

    const isThrottled = event.state === 'hot' || event.state === 'critical';
    workStealingScheduler.setThermalThrottled(isThrottled);

    if (event.state === 'hot') {
      workStealingScheduler.setUtilityMaxThreads(1);
    } else if (event.state === 'critical') {
      workStealingScheduler.setUtilityMaxThreads(0);
    } else {
      workStealingScheduler.setUtilityMaxThreads(2);
    }

    this.recomputeAndBroadcast();
  }

  private onPowerChange(event: PowerEvent): void {
    log.info(`[SystemWiring] Power: ${event.state}`);

    if (event.state === 'battery-below-20' || event.state === 'battery-below-5') {
      workStealingScheduler.setBackgroundPaused(true);
    } else if (event.state === 'ac') {
      workStealingScheduler.setBackgroundPaused(false);
    }

    // Adjust DB write coalescing on battery
    if (event.state !== 'ac') {
      databasePerformanceOptimizer.setWriteCoalesceMs(
        event.state === 'battery-above-50' ? 500 : 1000
      );
    } else {
      databasePerformanceOptimizer.setWriteCoalesceMs(
        databasePerformanceOptimizer.getConfig().writeCoalesceMs
      );
    }

    this.recomputeAndBroadcast();
  }

  // -----------------------------------------------------------------------
  // Recompute and broadcast directives
  // -----------------------------------------------------------------------

  private recomputeAndBroadcast(): void {
    const tier = hardwareDetector.getTier();
    const pressure = memoryBudget.getPressureLevel();
    const thermal = thermalPowerManager.getSnapshot().thermal.state;

    const directive = computeDirective(tier, pressure, thermal);
    this.currentDirective = directive;

    this.broadcastToRenderer('dex:app-directive', directive);
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  getSnapshot(): SystemOptimizationSnapshot {
    return {
      tier: hardwareDetector.getTier(),
      tierNumeric: hardwareDetector.getTierNumeric(),
      memoryPressure: memoryBudget.getPressureLevel(),
      thermalState: thermalPowerManager.getSnapshot().thermal.state,
      powerState: thermalPowerManager.getSnapshot().power.state,
      gpuPowerMode: thermalPowerManager.getSnapshot().gpuPowerMode,
      schedulerSnapshot: workStealingScheduler.getSnapshot(),
      ipcMetrics: ipcEfficiencyManager.getMetrics(),
      dbConfig: databasePerformanceOptimizer.getConfig(),
      uptime: Date.now() - this.startTime,
    };
  }

  // -----------------------------------------------------------------------
  // IPC
  // -----------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('optimization:getSnapshot', async () => this.getSnapshot());
    ipcMain.handle('optimization:getDirective', async () => this.currentDirective);
    ipcMain.handle('optimization:getTier', async () => ({
      tier: hardwareDetector.getTier(),
      tierNumeric: hardwareDetector.getTierNumeric(),
    }));
    ipcMain.handle('optimization:getProfile', async () => hardwareDetector.getProfile());
    ipcMain.handle('optimization:getMemoryBudgets', async () => hardwareDetector.getMemoryBudgets());
    ipcMain.handle('optimization:getGameDefaults', async () => hardwareDetector.getGameQualityDefaults());

    // Renderer reports GPU info after WebGL init
    ipcMain.on('optimization:reportGPU', async (_, data: { renderer: string; vendor: string }) => {
      await hardwareDetector.detectGPUFromRenderer(data.renderer, data.vendor);
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private broadcastToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const systemOptimizationWiring = new SystemOptimizationWiring();
