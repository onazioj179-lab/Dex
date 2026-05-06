// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Adaptive Rendering Engine - Tier-aware quality and FPS management
// Silently adjusts rendering quality based on SystemProfiler capability tier.
// Manages GPU allocation, CPU budgets, and dynamic tier demotion/promotion.
// =============================================================================

import log from 'electron-log';
import { ipcMain, BrowserWindow, app } from 'electron';
import { systemProfiler, CapabilityTier, BatteryProfile } from './SystemProfiler';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RenderingPolicy {
  tier: CapabilityTier;
  effectiveTier: CapabilityTier;
  maxResolutionScale: number;        // 0.75, 1.0
  maxPreviewResolution: number;      // 720, 1080, 2160
  timelineAccuracy: 'frame' | 'keyframe';
  timelineLongClipThresholdMin: number;
  animationsEnabled: boolean;
  maxFps: number;
  imagePreviewScale: number;         // 0.5, 1.0
  imagePreviewDelayMs: number;       // 0, 100
  gpuBudgetPercent: number;
  cpuMaxPercent: number;
  backgroundCpuMaxPercent: number;
  backgroundProcessCpuCapPercent: number;
}

interface TierDemotionState {
  cpuHighStartMs: number;
  cpuLowStartMs: number;
  demoted: boolean;
  demotionReason: string;
}

// -----------------------------------------------------------------------------
// Policy Definitions
// -----------------------------------------------------------------------------

function policyForTier(tier: CapabilityTier): RenderingPolicy {
  switch (tier) {
    case 1:
      return {
        tier: 1,
        effectiveTier: 1,
        maxResolutionScale: 1.0,
        maxPreviewResolution: 2160,
        timelineAccuracy: 'frame',
        timelineLongClipThresholdMin: Infinity,
        animationsEnabled: true,
        maxFps: 0, // unlimited, match display refresh
        imagePreviewScale: 1.0,
        imagePreviewDelayMs: 0,
        gpuBudgetPercent: 80,
        cpuMaxPercent: 90,
        backgroundCpuMaxPercent: 70,
        backgroundProcessCpuCapPercent: 15,
      };
    case 2:
      return {
        tier: 2,
        effectiveTier: 2,
        maxResolutionScale: 1.0,
        maxPreviewResolution: 1080,
        timelineAccuracy: 'frame',
        timelineLongClipThresholdMin: 30,
        animationsEnabled: true,
        maxFps: 60,
        imagePreviewScale: 1.0,
        imagePreviewDelayMs: 100,
        gpuBudgetPercent: 80,
        cpuMaxPercent: 90,
        backgroundCpuMaxPercent: 70,
        backgroundProcessCpuCapPercent: 15,
      };
    case 3:
      return {
        tier: 3,
        effectiveTier: 3,
        maxResolutionScale: 0.75,
        maxPreviewResolution: 720,
        timelineAccuracy: 'keyframe',
        timelineLongClipThresholdMin: 0,
        animationsEnabled: false,
        maxFps: 30,
        imagePreviewScale: 0.5,
        imagePreviewDelayMs: 0,
        gpuBudgetPercent: 60,
        cpuMaxPercent: 85,
        backgroundCpuMaxPercent: 50,
        backgroundProcessCpuCapPercent: 10,
      };
    default:
      return policyForTier(2);
  }
}

// -----------------------------------------------------------------------------
// Adaptive Rendering Engine
// -----------------------------------------------------------------------------

export class AdaptiveRenderingEngine {
  private policy: RenderingPolicy;
  private demotionState: TierDemotionState;
  private mainWindow: BrowserWindow | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private isRenderingActive = false;
  private isExportActive = false;
  private focusedAppId: string = 'home';
  private policyChangeCallbacks: Array<(policy: RenderingPolicy) => void> = [];

  constructor() {
    const tier = systemProfiler.getTier();
    this.policy = policyForTier(tier);
    this.demotionState = {
      cpuHighStartMs: 0,
      cpuLowStartMs: 0,
      demoted: false,
      demotionReason: '',
    };
  }

  // Initialize with window and start monitoring
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIpcHandlers();

    // Listen for tier changes from profiler
    systemProfiler.onTierChange((newTier, prevTier) => {
      this.onBaseTierChange(newTier, prevTier);
    });

    // Listen for battery changes
    systemProfiler.onBatteryChange((battery) => {
      this.onBatteryChange(battery);
    });

    // Start the 30-second monitor loop
    this.startMonitoring();

    log.info(
      `[AdaptiveRenderer] Initialized: Tier ${this.policy.tier}, ` +
      `maxFps=${this.policy.maxFps || 'unlimited'}, ` +
      `animations=${this.policy.animationsEnabled}, ` +
      `previewRes=${this.policy.maxPreviewResolution}p`
    );
  }

  // Register IPC handlers for renderer to query policy
  private registerIpcHandlers(): void {
    ipcMain.handle('adaptive:getPolicy', () => {
      return this.policy;
    });

    ipcMain.handle('adaptive:setRenderActive', (_, active: boolean) => {
      this.isRenderingActive = active;
      this.recalculatePolicy();
      return this.policy;
    });

    ipcMain.handle('adaptive:setExportActive', (_, active: boolean) => {
      this.isExportActive = active;
      this.recalculatePolicy();
      return this.policy;
    });

    ipcMain.handle('adaptive:setFocusedApp', (_, appId: string) => {
      this.focusedAppId = appId;
      return this.policy;
    });

    ipcMain.handle('adaptive:shouldYieldCpu', () => {
      const cpuUsage = systemProfiler.getCpuUsage();
      return cpuUsage > this.policy.backgroundProcessCpuCapPercent;
    });

    ipcMain.handle('adaptive:getEffectiveTier', () => {
      return this.policy.effectiveTier;
    });

    ipcMain.handle('adaptive:getSystemLoad', () => {
      const state = systemProfiler.getSystemState();
      return {
        cpuPercent: state?.cpuUsagePercent || 0,
        ramPercent: state?.ramUsedPercent || 0,
        tier: this.policy.effectiveTier,
        onBattery: systemProfiler.isOnBattery(),
        renderActive: this.isRenderingActive,
        exportActive: this.isExportActive,
      };
    });
  }

  // Start monitoring CPU/RAM and adjusting tier dynamically
  private startMonitoring(): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(() => {
      this.dynamicAdjustment();
    }, 10000); // Check every 10 seconds for responsive tier changes
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // Dynamic tier demotion/promotion based on real-time load
  private dynamicAdjustment(): void {
    const cpuUsage = systemProfiler.getCpuUsage();
    const now = Date.now();
    const baseTier = systemProfiler.getTier();

    // CPU > 85% for > 10 seconds: demote by one level
    if (cpuUsage > 85) {
      if (this.demotionState.cpuHighStartMs === 0) {
        this.demotionState.cpuHighStartMs = now;
      }
      this.demotionState.cpuLowStartMs = 0;

      if (!this.demotionState.demoted && (now - this.demotionState.cpuHighStartMs > 10000)) {
        this.demote('cpu_high');
      }
    }
    // CPU < 60% for > 20 seconds and not on battery: restore
    else if (cpuUsage < 60) {
      this.demotionState.cpuHighStartMs = 0;
      if (this.demotionState.cpuLowStartMs === 0) {
        this.demotionState.cpuLowStartMs = now;
      }

      if (this.demotionState.demoted &&
          (now - this.demotionState.cpuLowStartMs > 20000) &&
          !systemProfiler.isOnBattery()) {
        this.promote();
      }
    } else {
      // In between thresholds
      this.demotionState.cpuHighStartMs = 0;
      this.demotionState.cpuLowStartMs = 0;
    }

    // Battery demotion: if switched to battery, demote immediately
    // unless actively rendering/exporting
    if (systemProfiler.isOnBattery() &&
        !this.demotionState.demoted &&
        !this.isRenderingActive &&
        !this.isExportActive) {
      this.demote('battery');
    }
  }

  private demote(reason: string): void {
    const baseTier = systemProfiler.getTier();
    const newEffective = Math.min(3, baseTier + 1) as CapabilityTier;
    if (newEffective === this.policy.effectiveTier) return;

    this.demotionState.demoted = true;
    this.demotionState.demotionReason = reason;
    this.applyEffectiveTier(newEffective);

    log.info(
      `[AdaptiveRenderer] Demoted: Tier ${this.policy.tier} -> effective ${newEffective} (${reason})`
    );
  }

  private promote(): void {
    const baseTier = systemProfiler.getTier();
    if (this.policy.effectiveTier === baseTier) return;

    this.demotionState.demoted = false;
    this.demotionState.demotionReason = '';
    this.applyEffectiveTier(baseTier);

    log.info(
      `[AdaptiveRenderer] Promoted: restored to base Tier ${baseTier}`
    );
  }

  private applyEffectiveTier(effective: CapabilityTier): void {
    const base = policyForTier(effective);
    base.tier = systemProfiler.getTier(); // keep real tier
    base.effectiveTier = effective;
    this.policy = base;
    this.broadcastPolicy();
  }

  private onBaseTierChange(newTier: CapabilityTier, _prevTier: CapabilityTier): void {
    this.demotionState = {
      cpuHighStartMs: 0,
      cpuLowStartMs: 0,
      demoted: false,
      demotionReason: '',
    };
    this.policy = policyForTier(newTier);
    this.broadcastPolicy();
  }

  private onBatteryChange(battery: BatteryProfile): void {
    if (!battery.isPluggedIn && !this.demotionState.demoted) {
      if (!this.isRenderingActive && !this.isExportActive) {
        this.demote('battery');
      }
    } else if (battery.isPluggedIn && this.demotionState.demoted &&
               this.demotionState.demotionReason === 'battery') {
      this.promote();
    }
  }

  private recalculatePolicy(): void {
    // Adjust GPU allocation when rendering
    if (this.isRenderingActive || this.isExportActive) {
      this.policy.backgroundCpuMaxPercent = this.policy.effectiveTier === 3 ? 5 : 10;
    } else {
      const base = policyForTier(this.policy.effectiveTier);
      this.policy.backgroundCpuMaxPercent = base.backgroundCpuMaxPercent;
    }
    this.broadcastPolicy();
  }

  // Send policy update to renderer
  private broadcastPolicy(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('adaptive:policyChanged', this.policy);
    }
    for (const cb of this.policyChangeCallbacks) {
      try { cb(this.policy); } catch { /* ignore */ }
    }
  }

  // Public API
  getPolicy(): RenderingPolicy {
    return { ...this.policy };
  }

  onPolicyChange(cb: (policy: RenderingPolicy) => void): void {
    this.policyChangeCallbacks.push(cb);
  }

  shouldBackgroundYield(): boolean {
    const cpuUsage = systemProfiler.getCpuUsage();
    return cpuUsage > this.policy.backgroundProcessCpuCapPercent;
  }
}

// Singleton
export const adaptiveRenderer = new AdaptiveRenderingEngine();
