// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * BatteryAwareOperation.ts
 * System 6: Reliability, Stability, Final Lock
 * 
 * Power-aware operation that adapts Dex's behavior based on:
 * - Battery level and charging status
 * - Power source (AC vs battery)
 * - System power mode (balanced, power saver, etc.)
 * 
 * Ensures Dex never kills user's laptop battery unexpectedly.
 */

import { EventEmitter } from 'events';
import { app, ipcMain, powerMonitor } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import log from 'electron-log';
import { NativePower, isNativeAvailable } from '../native/bridge';

// ============================================================================
// Types
// ============================================================================

type PowerSource = 'ac' | 'battery' | 'unknown';
type PowerProfile = 'full' | 'balanced' | 'conservative' | 'minimal' | 'emergency';

interface BatteryStatus {
  level: number; // 0-100
  charging: boolean;
  timeRemaining: number | null; // minutes, null if unknown
  powerSource: PowerSource;
}

interface PowerThresholds {
  emergency: number; // e.g., 10%
  minimal: number; // e.g., 20%
  conservative: number; // e.g., 35%
  balanced: number; // e.g., 50%
}

interface ProfileRestrictions {
  allowBackgroundSync: boolean;
  allowIndexing: boolean;
  allowAgentOperations: boolean;
  allowNotifications: boolean;
  pollingIntervalMultiplier: number; // 1x, 2x, 5x, etc.
  cpuThrottlePercent: number; // 100 = no throttle
  reducedAnimations: boolean;
  pauseNonEssentialTimers: boolean;
  disablePreloading: boolean;
}

interface BatteryConfig {
  enabled: boolean;
  respectSystemPowerMode: boolean;
  thresholds: PowerThresholds;
  checkIntervalMs: number;
  showBatteryWarnings: boolean;
  autoSleepOnCritical: boolean;
  criticalBatteryAction: 'warn' | 'save-and-minimize' | 'emergency-shutdown';
}

interface BatteryState {
  currentStatus: BatteryStatus;
  currentProfile: PowerProfile;
  lastProfileChange: number;
  profileHistory: Array<{
    profile: PowerProfile;
    timestamp: number;
    reason: string;
  }>;
  warningsShown: string[];
  sessionEnergyUsage: number; // estimated mWh
}

interface BatteryEvent {
  type: 'profile-change' | 'low-battery' | 'critical-battery' | 'power-source-change' | 'charging-started' | 'charging-stopped';
  timestamp: number;
  data: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: BatteryConfig = {
  enabled: true,
  respectSystemPowerMode: true,
  thresholds: {
    emergency: 10,
    minimal: 20,
    conservative: 35,
    balanced: 50
  },
  checkIntervalMs: 30000, // 30 seconds
  showBatteryWarnings: true,
  autoSleepOnCritical: false,
  criticalBatteryAction: 'save-and-minimize'
};

const PROFILE_RESTRICTIONS: Record<PowerProfile, ProfileRestrictions> = {
  full: {
    allowBackgroundSync: true,
    allowIndexing: true,
    allowAgentOperations: true,
    allowNotifications: true,
    pollingIntervalMultiplier: 1,
    cpuThrottlePercent: 100,
    reducedAnimations: false,
    pauseNonEssentialTimers: false,
    disablePreloading: false
  },
  balanced: {
    allowBackgroundSync: true,
    allowIndexing: true,
    allowAgentOperations: true,
    allowNotifications: true,
    pollingIntervalMultiplier: 1,
    cpuThrottlePercent: 100,
    reducedAnimations: false,
    pauseNonEssentialTimers: false,
    disablePreloading: false
  },
  conservative: {
    allowBackgroundSync: true,
    allowIndexing: true,
    allowAgentOperations: true,
    allowNotifications: true,
    pollingIntervalMultiplier: 1.5,
    cpuThrottlePercent: 80,
    reducedAnimations: false,
    pauseNonEssentialTimers: false,
    disablePreloading: false
  },
  minimal: {
    allowBackgroundSync: true,
    allowIndexing: false,
    allowAgentOperations: true,
    allowNotifications: true,
    pollingIntervalMultiplier: 2,
    cpuThrottlePercent: 60,
    reducedAnimations: true,
    pauseNonEssentialTimers: false,
    disablePreloading: false
  },
  emergency: {
    allowBackgroundSync: false,
    allowIndexing: false,
    allowAgentOperations: true,
    allowNotifications: true,
    pollingIntervalMultiplier: 3,
    cpuThrottlePercent: 40,
    reducedAnimations: true,
    pauseNonEssentialTimers: true,
    disablePreloading: true
  }
};

// ============================================================================
// Battery Aware Operation
// ============================================================================

class BatteryAwareOperation extends EventEmitter {
  private config: BatteryConfig = DEFAULT_CONFIG;
  private state: BatteryState;
  private configPath: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private eventLog: BatteryEvent[] = [];

  constructor() {
    super();
    
    this.state = {
      currentStatus: {
        level: 100,
        charging: true,
        timeRemaining: null,
        powerSource: 'unknown'
      },
      currentProfile: 'full',
      lastProfileChange: Date.now(),
      profileHistory: [],
      warningsShown: [],
      sessionEnergyUsage: 0
    };
    
    this.configPath = path.join(app.getPath('userData'), 'battery-config.json');
  }

  /**
   * Initialize battery monitoring
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadConfig();
    await this.detectInitialState();
    this.setupPowerMonitor();
    this.startPeriodicCheck();
    this.setupIPC();

    this.initialized = true;
    log.info('[BatteryAware] Initialized with profile:', this.state.currentProfile);
  }

  /**
   * Load configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const saved = JSON.parse(data);
      this.config = { ...DEFAULT_CONFIG, ...saved };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration
   */
  private async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[BatteryAware] Failed to save config:', error);
    }
  }

  /**
   * Detect initial battery state
   */
  private async detectInitialState(): Promise<void> {
    const status = await this.getBatteryStatus();
    this.state.currentStatus = status;
    this.state.currentProfile = this.determineProfile(status);
    this.state.lastProfileChange = Date.now();
  }

  /**
   * Get current battery status
   */
  private async getBatteryStatus(): Promise<BatteryStatus> {
    // Electron's powerMonitor provides some info
    const isOnBattery = !powerMonitor.isOnBatteryPower || powerMonitor.isOnBatteryPower();
    
    // Note: Electron doesn't provide battery level directly on all platforms
    // In a real implementation, you'd use node-powershell on Windows or 
    // system_profiler on macOS
    
    return {
      level: await this.estimateBatteryLevel(),
      charging: !isOnBattery,
      timeRemaining: null,
      powerSource: isOnBattery ? 'battery' : 'ac'
    };
  }

  /**
   * Get battery level using platform-specific system queries.
   */
  private async estimateBatteryLevel(): Promise<number> {
    
    try {
      if (process.platform === 'win32') {
        return await this.getWindowsBatteryLevel();
      } else if (process.platform === 'darwin') {
        return await this.getMacBatteryLevel();
      } else if (process.platform === 'linux') {
        return await this.getLinuxBatteryLevel();
      }
    } catch {
      // If we can't get battery level, assume plugged in
    }
    
    return 100;
  }

  /**
   * Get battery level on Windows
   */
  private async getWindowsBatteryLevel(): Promise<number> {
    // Use native module first (AV-safe, no shell spawning)
    if (isNativeAvailable()) {
      const status = NativePower.getStatus();
      if (status?.batteryPercent != null) {
        return status.batteryPercent;
      }
    }
    
    // Fallback to PowerShell (safer than wmic for AV)
    const { execSync } = require('child_process');
    try {
      const output = execSync('powershell -NoProfile -NonInteractive -Command "(Get-WmiObject Win32_Battery).EstimatedChargeRemaining"', { encoding: 'utf-8', timeout: 5000 });
      const level = parseInt(output.trim(), 10);
      if (!isNaN(level)) return level;
    } catch { /* no battery or command failed */ }
    return 100;
  }

  /**
   * Get battery level on macOS
   */
  private async getMacBatteryLevel(): Promise<number> {
    const { execSync } = require('child_process');
    try {
      const output = execSync('pmset -g batt', { encoding: 'utf-8', timeout: 5000 });
      const match = output.match(/(\d+)%/);
      if (match) return parseInt(match[1], 10);
    } catch { /* no battery or command failed */ }
    return 100;
  }

  /**
   * Get battery level on Linux
   */
  private async getLinuxBatteryLevel(): Promise<number> {
    try {
      const level = await fs.readFile('/sys/class/power_supply/BAT0/capacity', 'utf-8');
      return parseInt(level.trim(), 10);
    } catch {
      return 100;
    }
  }

  /**
   * Determine appropriate power profile based on battery status
   */
  private determineProfile(status: BatteryStatus): PowerProfile {
    // Always full when on AC power
    if (status.powerSource === 'ac' || status.charging) {
      return 'full';
    }

    const { thresholds } = this.config;

    if (status.level <= thresholds.emergency) {
      return 'emergency';
    }

    if (status.level <= thresholds.minimal) {
      return 'minimal';
    }

    if (status.level <= thresholds.conservative) {
      return 'conservative';
    }

    if (status.level <= thresholds.balanced) {
      return 'balanced';
    }

    return 'full';
  }

  /**
   * Setup Electron power monitor events
   */
  private setupPowerMonitor(): void {
    powerMonitor.on('on-ac', () => {
      this.handlePowerSourceChange('ac');
    });

    powerMonitor.on('on-battery', () => {
      this.handlePowerSourceChange('battery');
    });

    powerMonitor.on('suspend', () => {
      this.handleSystemSuspend();
    });

    powerMonitor.on('resume', () => {
      this.handleSystemResume();
    });

    powerMonitor.on('shutdown', () => {
      this.handleSystemShutdown();
    });

    powerMonitor.on('lock-screen', () => {
      this.handleScreenLock();
    });

    powerMonitor.on('unlock-screen', () => {
      this.handleScreenUnlock();
    });
  }

  /**
   * Handle power source change
   */
  private async handlePowerSourceChange(source: PowerSource): Promise<void> {
    log.info('[BatteryAware] Power source changed to:', source);
    
    this.state.currentStatus.powerSource = source;
    this.state.currentStatus.charging = source === 'ac';
    
    this.logEvent({
      type: 'power-source-change',
      timestamp: Date.now(),
      data: { source }
    });

    if (source === 'ac') {
      this.logEvent({
        type: 'charging-started',
        timestamp: Date.now(),
        data: {}
      });
    } else {
      this.logEvent({
        type: 'charging-stopped',
        timestamp: Date.now(),
        data: {}
      });
    }

    await this.updateProfile();
    this.emit('power-source-change', source);
  }

  /**
   * Handle system suspend
   */
  private handleSystemSuspend(): void {
    log.info('[BatteryAware] System suspending');
    this.stopPeriodicCheck();
    this.emit('system-suspend');
  }

  /**
   * Handle system resume
   */
  private async handleSystemResume(): Promise<void> {
    log.info('[BatteryAware] System resuming');
    await this.detectInitialState();
    this.startPeriodicCheck();
    this.emit('system-resume');
  }

  /**
   * Handle system shutdown
   */
  private handleSystemShutdown(): void {
    log.info('[BatteryAware] System shutting down');
    this.emit('system-shutdown');
  }

  /**
   * Handle screen lock
   */
  private handleScreenLock(): void {
    log.debug('[BatteryAware] Screen locked - reducing activity');
    this.emit('screen-lock');
  }

  /**
   * Handle screen unlock
   */
  private handleScreenUnlock(): void {
    log.debug('[BatteryAware] Screen unlocked - resuming normal activity');
    this.emit('screen-unlock');
  }

  /**
   * Start periodic battery check
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(async () => {
      await this.performBatteryCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic check
   */
  private stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Perform periodic battery check
   */
  private async performBatteryCheck(): Promise<void> {
    if (!this.config.enabled) return;

    const previousStatus = { ...this.state.currentStatus };
    const newStatus = await this.getBatteryStatus();
    this.state.currentStatus = newStatus;

    // Check for significant changes
    const levelDrop = previousStatus.level - newStatus.level;
    if (levelDrop >= 5) {
      log.info(`[BatteryAware] Battery dropped ${levelDrop}% (now ${newStatus.level}%)`);
    }

    // Check for low battery warnings
    await this.checkBatteryWarnings(newStatus);

    // Update profile if needed
    await this.updateProfile();
  }

  /**
   * Check and show battery warnings
   */
  private async checkBatteryWarnings(status: BatteryStatus): Promise<void> {
    if (!this.config.showBatteryWarnings) return;
    if (status.charging) return;

    const { thresholds } = this.config;

    // Critical battery warning
    if (status.level <= thresholds.emergency) {
      if (!this.state.warningsShown.includes('critical')) {
        this.state.warningsShown.push('critical');
        this.logEvent({
          type: 'critical-battery',
          timestamp: Date.now(),
          data: { level: status.level }
        });
        this.emit('critical-battery', status);
        await this.handleCriticalBattery();
      }
    }
    // Low battery warning
    else if (status.level <= thresholds.minimal) {
      if (!this.state.warningsShown.includes('low')) {
        this.state.warningsShown.push('low');
        this.logEvent({
          type: 'low-battery',
          timestamp: Date.now(),
          data: { level: status.level }
        });
        this.emit('low-battery', status);
      }
    }

    // Reset warnings when charging
    if (status.charging && this.state.warningsShown.length > 0) {
      this.state.warningsShown = [];
    }
  }

  /**
   * Handle critical battery situation
   */
  private async handleCriticalBattery(): Promise<void> {
    log.warn('[BatteryAware] CRITICAL BATTERY - taking action');

    switch (this.config.criticalBatteryAction) {
      case 'warn':
        // Just emit event, already done above
        break;

      case 'save-and-minimize':
        // Signal other systems to save state
        this.emit('emergency-save-requested');
        // Minimize Dex to reduce power usage
        this.emit('minimize-requested');
        break;

      case 'emergency-shutdown':
        // Signal emergency save then prepare for shutdown
        this.emit('emergency-save-requested');
        this.emit('emergency-shutdown-requested');
        break;
    }
  }

  /**
   * Update power profile based on current status
   */
  private async updateProfile(): Promise<void> {
    const newProfile = this.determineProfile(this.state.currentStatus);

    if (newProfile !== this.state.currentProfile) {
      const oldProfile = this.state.currentProfile;
      this.state.currentProfile = newProfile;
      this.state.lastProfileChange = Date.now();

      this.state.profileHistory.push({
        profile: newProfile,
        timestamp: Date.now(),
        reason: `Battery at ${this.state.currentStatus.level}%, ${this.state.currentStatus.charging ? 'charging' : 'discharging'}`
      });

      // Keep history limited
      if (this.state.profileHistory.length > 100) {
        this.state.profileHistory = this.state.profileHistory.slice(-50);
      }

      this.logEvent({
        type: 'profile-change',
        timestamp: Date.now(),
        data: { from: oldProfile, to: newProfile }
      });

      log.info(`[BatteryAware] Profile changed: ${oldProfile} -> ${newProfile}`);
      this.emit('profile-change', { from: oldProfile, to: newProfile, restrictions: this.getRestrictions() });
    }
  }

  /**
   * Log battery event
   */
  private logEvent(event: BatteryEvent): void {
    this.eventLog.push(event);
    
    // Keep log limited
    if (this.eventLog.length > 500) {
      this.eventLog = this.eventLog.slice(-250);
    }
  }

  /**
   * Setup IPC handlers
   */
  private setupIPC(): void {
    ipcMain.handle('battery:getStatus', () => {
      return this.state.currentStatus;
    });

    ipcMain.handle('battery:getProfile', () => {
      return this.state.currentProfile;
    });

    ipcMain.handle('battery:getRestrictions', () => {
      return this.getRestrictions();
    });

    ipcMain.handle('battery:getConfig', () => {
      return this.config;
    });

    ipcMain.handle('battery:setConfig', async (_event, newConfig: Partial<BatteryConfig>) => {
      this.config = { ...this.config, ...newConfig };
      await this.saveConfig();
      await this.updateProfile();
      return { success: true };
    });

    ipcMain.handle('battery:getState', () => {
      return this.state;
    });

    ipcMain.handle('battery:getEventLog', () => {
      return this.eventLog;
    });

    ipcMain.handle('battery:forceCheck', async () => {
      await this.performBatteryCheck();
      return this.state.currentStatus;
    });

    ipcMain.handle('battery:setProfile', async (_event, profile: PowerProfile) => {
      // Manual profile override
      if (PROFILE_RESTRICTIONS[profile]) {
        this.state.currentProfile = profile;
        this.emit('profile-change', { 
          from: this.state.currentProfile, 
          to: profile, 
          restrictions: this.getRestrictions(),
          manual: true
        });
        return { success: true, profile };
      }
      return { success: false, error: 'Invalid profile' };
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current power profile
   */
  getProfile(): PowerProfile {
    return this.state.currentProfile;
  }

  /**
   * Get current restrictions based on profile
   */
  getRestrictions(): ProfileRestrictions {
    return PROFILE_RESTRICTIONS[this.state.currentProfile];
  }

  /**
   * Check if a specific operation is allowed
   */
  isOperationAllowed(operation: keyof ProfileRestrictions): boolean {
    const restrictions = this.getRestrictions();
    const value = restrictions[operation];
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    return true;
  }

  /**
   * Get polling interval multiplier
   */
  getPollingMultiplier(): number {
    return this.getRestrictions().pollingIntervalMultiplier;
  }

  /**
   * Get CPU throttle percentage
   */
  getCpuThrottle(): number {
    return this.getRestrictions().cpuThrottlePercent;
  }

  /**
   * Check if running on battery
   */
  isOnBattery(): boolean {
    return this.state.currentStatus.powerSource === 'battery';
  }

  /**
   * Get battery level
   */
  getBatteryLevel(): number {
    return this.state.currentStatus.level;
  }

  /**
   * Check if battery is low
   */
  isBatteryLow(): boolean {
    return this.state.currentStatus.level <= this.config.thresholds.minimal;
  }

  /**
   * Check if battery is critical
   */
  isBatteryCritical(): boolean {
    return this.state.currentStatus.level <= this.config.thresholds.emergency;
  }

  /**
   * Get adjusted interval based on power profile
   */
  getAdjustedInterval(baseIntervalMs: number): number {
    return Math.floor(baseIntervalMs * this.getPollingMultiplier());
  }

  /**
   * Should reduce CPU usage
   */
  shouldThrottle(): boolean {
    return this.getCpuThrottle() < 100;
  }

  /**
   * Get recommended delay multiplier for operations
   */
  getOperationDelay(baseDelayMs: number = 0): number {
    const throttle = this.getCpuThrottle();
    if (throttle >= 100) return baseDelayMs;
    
    // Add delay inversely proportional to throttle
    const addedDelay = Math.floor(((100 - throttle) / 100) * 100);
    return baseDelayMs + addedDelay;
  }

  /**
   * Wrap an async operation with battery-aware delays
   */
  async withPowerAwareness<T>(
    operation: () => Promise<T>,
    operationType: 'background' | 'user-initiated' = 'background'
  ): Promise<T | null> {
    // User-initiated operations always proceed
    if (operationType === 'user-initiated') {
      return await operation();
    }

    // Check if background operations are allowed
    if (!this.isOperationAllowed('allowBackgroundSync')) {
      log.debug('[BatteryAware] Background operation blocked due to power profile');
      return null;
    }

    // Add delay based on throttle
    const delay = this.getOperationDelay();
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    return await operation();
  }

  /**
   * Shutdown battery monitoring
   */
  async shutdown(): Promise<void> {
    log.info('[BatteryAware] Shutting down');
    this.stopPeriodicCheck();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const batteryAwareOperation = new BatteryAwareOperation();
export { BatteryAwareOperation, BatteryStatus, PowerProfile, ProfileRestrictions, BatteryConfig };
