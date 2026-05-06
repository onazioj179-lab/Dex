// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Power Efficiency Manager
// Phase 42: Battery preservation and power-aware optimization
// ===========================================================================

import log from 'electron-log';
import { powerMonitor, app } from 'electron';
import Store from 'electron-store';
import * as os from 'os';

// ===========================================================================
// TYPES
// ===========================================================================

export type PowerState = 'ac' | 'battery' | 'unknown';
export type EfficiencyMode = 'normal' | 'battery-saver' | 'aggressive-saver' | 'performance';

export interface PowerStatus {
  state: PowerState;
  batteryLevel: number;
  isCharging: boolean;
  timeRemaining: number; // minutes, -1 if unknown
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
}

export interface EfficiencyConfig {
  mode: EfficiencyMode;
  autoSwitchOnBattery: boolean;
  batteryThreshold: number; // Switch to saver below this %
  pauseBackgroundOnBattery: boolean;
  throttleTransfersOnBattery: boolean;
  deferMediaProcessing: boolean;
  reducedAnimations: boolean;
  suspendIndexing: boolean;
}

export interface ResourceLimits {
  maxCpuPercent: number;
  maxMemoryMB: number;
  maxGpuPercent: number;
  networkThrottleKbps: number;
  allowBackgroundTasks: boolean;
  allowIndexing: boolean;
  allowAnimations: boolean;
}

export interface PowerEvent {
  type: 'ac_connect' | 'battery_switch' | 'low_battery' | 'thermal_change' | 'mode_change';
  timestamp: number;
  details: Record<string, unknown>;
}

// ===========================================================================
// EFFICIENCY PRESETS
// ===========================================================================

const EFFICIENCY_PRESETS: Record<EfficiencyMode, ResourceLimits> = {
  performance: {
    maxCpuPercent: 100,
    maxMemoryMB: 2048,
    maxGpuPercent: 100,
    networkThrottleKbps: 0, // No throttle
    allowBackgroundTasks: true,
    allowIndexing: true,
    allowAnimations: true,
  },
  normal: {
    maxCpuPercent: 50,
    maxMemoryMB: 512,
    maxGpuPercent: 50,
    networkThrottleKbps: 0,
    allowBackgroundTasks: true,
    allowIndexing: true,
    allowAnimations: true,
  },
  'battery-saver': {
    maxCpuPercent: 25,
    maxMemoryMB: 256,
    maxGpuPercent: 10,
    networkThrottleKbps: 1024, // 1 Mbps
    allowBackgroundTasks: false,
    allowIndexing: false,
    allowAnimations: false,
  },
  'aggressive-saver': {
    maxCpuPercent: 10,
    maxMemoryMB: 128,
    maxGpuPercent: 0,
    networkThrottleKbps: 512, // 512 Kbps
    allowBackgroundTasks: false,
    allowIndexing: false,
    allowAnimations: false,
  },
};

// ===========================================================================
// STORE
// ===========================================================================

const powerStore = new Store<{
  config: EfficiencyConfig;
  currentLimits: ResourceLimits;
  events: PowerEvent[];
  statistics: {
    timeOnBattery: number;
    timeOnAC: number;
    batteryDrainEvents: number;
    modeChanges: number;
  };
}>({
  name: 'power-efficiency',
  defaults: {
    config: {
      mode: 'normal',
      autoSwitchOnBattery: true,
      batteryThreshold: 20,
      pauseBackgroundOnBattery: true,
      throttleTransfersOnBattery: true,
      deferMediaProcessing: true,
      reducedAnimations: true,
      suspendIndexing: true,
    },
    currentLimits: EFFICIENCY_PRESETS.normal,
    events: [],
    statistics: {
      timeOnBattery: 0,
      timeOnAC: 0,
      batteryDrainEvents: 0,
      modeChanges: 0,
    },
  },
});

// ===========================================================================
// POWER EFFICIENCY MANAGER
// ===========================================================================

class PowerEfficiencyManager {
  private static instance: PowerEfficiencyManager;
  private initialized = false;
  private currentPowerState: PowerState = 'unknown';
  private lastBatteryLevel = 100;
  private powerStateTimer: NodeJS.Timeout | null = null;
  private stateChangeListeners: Set<(limits: ResourceLimits) => void> = new Set();

  private constructor() {}

  static getInstance(): PowerEfficiencyManager {
    if (!PowerEfficiencyManager.instance) {
      PowerEfficiencyManager.instance = new PowerEfficiencyManager();
    }
    return PowerEfficiencyManager.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set up power monitoring
    this.setupPowerMonitoring();

    // Initial power state check
    await this.updatePowerState();

    // Periodic check (every 5 minutes)
    this.powerStateTimer = setInterval(() => {
      this.updatePowerState();
    }, 5 * 60 * 1000);

    this.initialized = true;
    log.info('[PowerEfficiencyManager] Initialized');
  }

  private setupPowerMonitoring(): void {
    // Listen for power events
    powerMonitor.on('on-ac', () => {
      this.onPowerSourceChange('ac');
    });

    powerMonitor.on('on-battery', () => {
      this.onPowerSourceChange('battery');
    });

    powerMonitor.on('suspend', () => {
      log.info('[PowerEfficiencyManager] System suspending');
    });

    powerMonitor.on('resume', () => {
      log.info('[PowerEfficiencyManager] System resumed');
      this.updatePowerState();
    });

    powerMonitor.on('shutdown', () => {
      this.shutdown();
    });
  }

  async shutdown(): Promise<void> {
    if (this.powerStateTimer) {
      clearInterval(this.powerStateTimer);
    }
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // POWER STATE
  // -------------------------------------------------------------------------

  private async updatePowerState(): Promise<void> {
    const status = await this.getPowerStatus();
    const config = powerStore.get('config');

    // Update statistics
    const stats = powerStore.get('statistics');
    if (status.state === 'battery') {
      stats.timeOnBattery += 5; // Minutes
    } else if (status.state === 'ac') {
      stats.timeOnAC += 5;
    }
    powerStore.set('statistics', stats);

    // Check for low battery
    if (status.batteryLevel < config.batteryThreshold && status.state === 'battery') {
      if (this.lastBatteryLevel >= config.batteryThreshold) {
        this.onLowBattery(status.batteryLevel);
      }
    }

    this.lastBatteryLevel = status.batteryLevel;
    this.currentPowerState = status.state;
  }

  async getPowerStatus(): Promise<PowerStatus> {
    // Use powerMonitor to get system state
    const systemIdleState = powerMonitor.getSystemIdleState(60);
    
    // Determine power source
    // Note: Electron doesn't directly expose battery level on all platforms
    // This is a best-effort approach
    let state: PowerState = 'unknown';
    let batteryLevel = 100;
    let isCharging = true;
    let timeRemaining = -1;

    try {
      // Check if on AC or battery (this works on most platforms)
      // We'll track this via events
      state = this.currentPowerState;

      // On some platforms, we can get battery info via platform-specific means
      // For now, we track state changes via events
    } catch (error) {
      // Silent fail - battery info not available
    }

    return {
      state,
      batteryLevel,
      isCharging: state === 'ac',
      timeRemaining,
      thermalState: 'nominal',
    };
  }

  // -------------------------------------------------------------------------
  // POWER SOURCE CHANGES
  // -------------------------------------------------------------------------

  private onPowerSourceChange(newState: PowerState): void {
    const config = powerStore.get('config');
    const previousState = this.currentPowerState;
    this.currentPowerState = newState;

    this.recordEvent({
      type: newState === 'ac' ? 'ac_connect' : 'battery_switch',
      timestamp: Date.now(),
      details: { previousState, newState },
    });

    log.info(`[PowerEfficiencyManager] Power source: ${newState}`);

    // Auto-switch mode on battery
    if (config.autoSwitchOnBattery) {
      if (newState === 'battery' && config.mode === 'normal') {
        this.setMode('battery-saver');
      } else if (newState === 'ac' && config.mode === 'battery-saver') {
        this.setMode('normal');
      }
    }
  }

  private onLowBattery(level: number): void {
    const config = powerStore.get('config');

    this.recordEvent({
      type: 'low_battery',
      timestamp: Date.now(),
      details: { level },
    });

    const stats = powerStore.get('statistics');
    stats.batteryDrainEvents++;
    powerStore.set('statistics', stats);

    log.info(`[PowerEfficiencyManager] Low battery: ${level}%`);

    // Switch to aggressive saver
    if (config.autoSwitchOnBattery && level < 10) {
      this.setMode('aggressive-saver');
    }
  }

  // -------------------------------------------------------------------------
  // MODE MANAGEMENT
  // -------------------------------------------------------------------------

  getMode(): EfficiencyMode {
    return powerStore.get('config').mode;
  }

  async setMode(mode: EfficiencyMode): Promise<ResourceLimits> {
    const config = powerStore.get('config');
    config.mode = mode;
    powerStore.set('config', config);

    const limits = EFFICIENCY_PRESETS[mode];
    powerStore.set('currentLimits', limits);

    this.recordEvent({
      type: 'mode_change',
      timestamp: Date.now(),
      details: { mode },
    });

    const stats = powerStore.get('statistics');
    stats.modeChanges++;
    powerStore.set('statistics', stats);

    // Notify listeners
    this.notifyLimitsChange(limits);

    log.info(`[PowerEfficiencyManager] Mode set to: ${mode}`);
    return limits;
  }

  getCurrentLimits(): ResourceLimits {
    return powerStore.get('currentLimits');
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): EfficiencyConfig {
    return powerStore.get('config');
  }

  async updateConfig(updates: Partial<EfficiencyConfig>): Promise<EfficiencyConfig> {
    const current = powerStore.get('config');
    const updated = { ...current, ...updates };
    powerStore.set('config', updated);

    // If mode changed, update limits
    if (updates.mode) {
      await this.setMode(updates.mode);
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // RESOURCE CHECKS
  // -------------------------------------------------------------------------

  shouldAllowBackgroundTask(): boolean {
    const limits = powerStore.get('currentLimits');
    return limits.allowBackgroundTasks;
  }

  shouldAllowIndexing(): boolean {
    const limits = powerStore.get('currentLimits');
    return limits.allowIndexing;
  }

  shouldAllowAnimations(): boolean {
    const limits = powerStore.get('currentLimits');
    return limits.allowAnimations;
  }

  getNetworkThrottle(): number {
    const limits = powerStore.get('currentLimits');
    return limits.networkThrottleKbps;
  }

  isOnBattery(): boolean {
    return this.currentPowerState === 'battery';
  }

  // -------------------------------------------------------------------------
  // YIELD REQUEST
  // -------------------------------------------------------------------------

  /**
   * Request Dex to yield resources immediately
   * Call this when system pressure is detected
   */
  async yieldResources(): Promise<void> {
    const config = powerStore.get('config');
    
    if (config.mode !== 'aggressive-saver') {
      await this.setMode('aggressive-saver');
    }

    // Request garbage collection if available
    if (global.gc) {
      global.gc();
    }

    log.info('[PowerEfficiencyManager] Resources yielded');
  }

  // -------------------------------------------------------------------------
  // EVENT RECORDING
  // -------------------------------------------------------------------------

  private recordEvent(event: PowerEvent): void {
    const events = powerStore.get('events');
    events.push(event);
    
    // Keep only last 100 events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
    
    powerStore.set('events', events);
  }

  getEvents(limit: number = 50): PowerEvent[] {
    return powerStore.get('events').slice(-limit);
  }

  // -------------------------------------------------------------------------
  // LISTENERS
  // -------------------------------------------------------------------------

  onLimitsChange(callback: (limits: ResourceLimits) => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  private notifyLimitsChange(limits: ResourceLimits): void {
    this.stateChangeListeners.forEach(cb => cb(limits));
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  getStatistics(): typeof powerStore.store['statistics'] {
    return powerStore.get('statistics');
  }

  async resetStatistics(): Promise<void> {
    powerStore.set('statistics', {
      timeOnBattery: 0,
      timeOnAC: 0,
      batteryDrainEvents: 0,
      modeChanges: 0,
    });
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): {
    powerState: PowerState;
    mode: EfficiencyMode;
    limits: ResourceLimits;
    isInitialized: boolean;
  } {
    return {
      powerState: this.currentPowerState,
      mode: powerStore.get('config').mode,
      limits: powerStore.get('currentLimits'),
      isInitialized: this.initialized,
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const powerEfficiencyManager = PowerEfficiencyManager.getInstance();
export default powerEfficiencyManager;
