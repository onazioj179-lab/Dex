// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * MaintenanceModeLock.ts
 * System 6: Reliability, Stability, Final Lock
 * 
 * THE FINAL LOCK - Enters Dex into maintenance-first mode.
 * 
 * After System 6, no further core systems are added.
 * This module enforces:
 * - Feature freeze (no new features without explicit unlock)
 * - Stability-first operations
 * - Maintenance window scheduling
 * - Self-healing priority
 * - Change control gates
 * 
 * "Make Dex run for days/weeks/years without degradation"
 */

import log from 'electron-log';
import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

type MaintenanceLevel = 'normal' | 'maintenance' | 'frozen' | 'emergency';

interface MaintenanceWindow {
  id: string;
  name: string;
  startHour: number; // 0-23
  endHour: number; // 0-23
  daysOfWeek: number[]; // 0=Sunday, 6=Saturday
  enabled: boolean;
  allowedOperations: string[];
}

interface FeatureGate {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  requiresUnlock: boolean;
  unlockExpiry: number | null; // timestamp when unlock expires
  stability: 'stable' | 'beta' | 'experimental';
}

interface ChangeRecord {
  id: string;
  timestamp: number;
  type: 'config' | 'feature' | 'system' | 'user';
  description: string;
  previousValue: unknown;
  newValue: unknown;
  approved: boolean;
  approvedBy: string | null;
}

interface HealthMetrics {
  uptime: number; // seconds
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  errorRate: number; // errors per hour
  crashCount: number;
  lastStableCheckpoint: number;
  degradationScore: number; // 0-100, lower is better
}

interface MaintenanceState {
  level: MaintenanceLevel;
  enteredAt: number;
  reason: string;
  scheduledExit: number | null;
  manualOverride: boolean;
  healthMetrics: HealthMetrics;
  activeMaintenanceWindow: string | null;
  changeHistory: ChangeRecord[];
  systemAge: number; // days since first run
  lastMajorChange: number;
}

interface MaintenanceConfig {
  enabled: boolean;
  autoEnterMaintenance: boolean;
  maintenanceWindows: MaintenanceWindow[];
  featureGates: FeatureGate[];
  maxUptimeBeforeMaintenanceHours: number;
  degradationThreshold: number;
  errorRateThreshold: number;
  requireApprovalForChanges: boolean;
  changeHistoryRetentionDays: number;
  autoHealEnabled: boolean;
  stabilityCheckIntervalMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: true,
  autoEnterMaintenance: true,
  maintenanceWindows: [
    {
      id: 'default-nightly',
      name: 'Nightly Maintenance',
      startHour: 3,
      endHour: 5,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      allowedOperations: ['cleanup', 'optimize', 'backup', 'health-check']
    }
  ],
  featureGates: [
    {
      id: 'agent-autonomous',
      name: 'Autonomous Agent Operations',
      description: 'Allow agent to perform actions without confirmation',
      enabled: true,
      requiresUnlock: false,
      unlockExpiry: null,
      stability: 'stable'
    },
    {
      id: 'experimental-features',
      name: 'Experimental Features',
      description: 'Enable experimental functionality',
      enabled: false,
      requiresUnlock: true,
      unlockExpiry: null,
      stability: 'experimental'
    }
  ],
  maxUptimeBeforeMaintenanceHours: 168, // 1 week
  degradationThreshold: 30,
  errorRateThreshold: 10,
  requireApprovalForChanges: false,
  changeHistoryRetentionDays: 30,
  autoHealEnabled: true,
  stabilityCheckIntervalMs: 60000 // 1 minute
};

// Operations allowed in each maintenance level
const LEVEL_PERMISSIONS: Record<MaintenanceLevel, string[]> = {
  normal: ['*'], // All operations
  maintenance: ['read', 'backup', 'cleanup', 'optimize', 'health-check', 'user-critical'],
  frozen: ['read', 'emergency-recovery', 'user-critical'],
  emergency: ['emergency-recovery', 'shutdown']
};

// ============================================================================
// Maintenance Mode Lock
// ============================================================================

class MaintenanceModeLock extends EventEmitter {
  private config: MaintenanceConfig = DEFAULT_CONFIG;
  private state: MaintenanceState;
  private configPath: string;
  private statePath: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private windowCheckInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private firstRunTimestamp: number = 0;

  constructor() {
    super();
    
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'maintenance-config.json');
    this.statePath = path.join(userDataPath, 'maintenance-state.json');
    
    this.state = {
      level: 'normal',
      enteredAt: Date.now(),
      reason: 'Initial state',
      scheduledExit: null,
      manualOverride: false,
      healthMetrics: {
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: 0,
        crashCount: 0,
        lastStableCheckpoint: Date.now(),
        degradationScore: 0
      },
      activeMaintenanceWindow: null,
      changeHistory: [],
      systemAge: 0,
      lastMajorChange: Date.now()
    };
  }

  /**
   * Initialize maintenance mode lock
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadConfig();
    await this.loadState();
    await this.loadFirstRunTimestamp();
    this.startStabilityMonitoring();
    this.startWindowMonitoring();
    this.setupIPC();

    this.initialized = true;
    log.info('[MaintenanceLock] Initialized at level:', this.state.level);
    log.info('[MaintenanceLock] System age:', this.state.systemAge, 'days');
  }

  /**
   * Load configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
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
      log.error('[MaintenanceLock] Failed to save config:', error);
    }
  }

  /**
   * Load persisted state
   */
  private async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      const saved = JSON.parse(data);
      this.state = {
        ...this.state,
        ...saved,
        // Reset runtime metrics
        healthMetrics: {
          ...this.state.healthMetrics,
          uptime: 0
        }
      };
    } catch {
      // State initialized with defaults
    }
  }

  /**
   * Save state
   */
  private async saveState(): Promise<void> {
    try {
      await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      log.error('[MaintenanceLock] Failed to save state:', error);
    }
  }

  /**
   * Load first run timestamp for system age calculation
   */
  private async loadFirstRunTimestamp(): Promise<void> {
    const firstRunPath = path.join(app.getPath('userData'), '.first-run');
    
    try {
      const data = await fs.readFile(firstRunPath, 'utf-8');
      this.firstRunTimestamp = parseInt(data, 10);
    } catch {
      // First run
      this.firstRunTimestamp = Date.now();
      await fs.writeFile(firstRunPath, String(this.firstRunTimestamp));
    }

    // Calculate system age in days
    this.state.systemAge = Math.floor((Date.now() - this.firstRunTimestamp) / (1000 * 60 * 60 * 24));
  }

  /**
   * Start stability monitoring
   */
  private startStabilityMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(async () => {
      await this.performStabilityCheck();
    }, this.config.stabilityCheckIntervalMs);

    // Initial check
    setTimeout(() => this.performStabilityCheck(), 5000);
  }

  /**
   * Start maintenance window monitoring
   */
  private startWindowMonitoring(): void {
    if (this.windowCheckInterval) return;

    this.windowCheckInterval = setInterval(() => {
      this.checkMaintenanceWindows();
    }, 60000); // Check every minute

    // Initial check
    this.checkMaintenanceWindows();
  }

  /**
   * Perform stability check
   */
  private async performStabilityCheck(): Promise<void> {
    // Update uptime
    this.state.healthMetrics.uptime = Math.floor((Date.now() - this.state.enteredAt) / 1000);

    // Update memory usage
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    this.state.healthMetrics.memoryUsage = Math.round((memUsage.heapUsed / totalMem) * 100);

    // Calculate degradation score
    this.state.healthMetrics.degradationScore = this.calculateDegradationScore();

    // Check if we should auto-enter maintenance
    if (this.config.autoEnterMaintenance) {
      const uptimeHours = this.state.healthMetrics.uptime / 3600;
      
      if (uptimeHours >= this.config.maxUptimeBeforeMaintenanceHours && this.state.level === 'normal') {
        await this.enterMaintenance('Auto-maintenance after extended uptime');
      }

      if (this.state.healthMetrics.degradationScore >= this.config.degradationThreshold && this.state.level === 'normal') {
        await this.enterMaintenance('Degradation threshold exceeded');
      }

      if (this.state.healthMetrics.errorRate >= this.config.errorRateThreshold && this.state.level === 'normal') {
        await this.enterMaintenance('Error rate threshold exceeded');
      }
    }

    // Auto-heal if enabled and needed
    if (this.config.autoHealEnabled && this.state.healthMetrics.degradationScore > 20) {
      await this.performAutoHeal();
    }

    // Create stable checkpoint if healthy
    if (this.state.healthMetrics.degradationScore < 10) {
      this.state.healthMetrics.lastStableCheckpoint = Date.now();
    }

    this.emit('stability-check', this.state.healthMetrics);
  }

  /**
   * Calculate degradation score
   */
  private calculateDegradationScore(): number {
    let score = 0;

    // Memory contribution (0-30 points)
    if (this.state.healthMetrics.memoryUsage > 80) score += 30;
    else if (this.state.healthMetrics.memoryUsage > 60) score += 15;
    else if (this.state.healthMetrics.memoryUsage > 40) score += 5;

    // Error rate contribution (0-40 points)
    score += Math.min(40, this.state.healthMetrics.errorRate * 4);

    // Crash count contribution (0-20 points)
    score += Math.min(20, this.state.healthMetrics.crashCount * 5);

    // Uptime penalty (0-10 points) - longer uptime increases chance of issues
    const uptimeHours = this.state.healthMetrics.uptime / 3600;
    score += Math.min(10, Math.floor(uptimeHours / 24));

    return Math.min(100, score);
  }

  /**
   * Perform auto-healing operations
   */
  private async performAutoHeal(): Promise<void> {
    log.info('[MaintenanceLock] Performing auto-heal');
    
    // Request garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear any cached data
    this.emit('auto-heal-request', {
      clearCaches: true,
      compactData: true,
      resetTimers: true
    });
  }

  /**
   * Check maintenance windows
   */
  private checkMaintenanceWindows(): void {
    if (!this.config.enabled) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    for (const window of this.config.maintenanceWindows) {
      if (!window.enabled) continue;

      const inWindow = window.daysOfWeek.includes(currentDay) &&
                       currentHour >= window.startHour &&
                       currentHour < window.endHour;

      if (inWindow && this.state.activeMaintenanceWindow !== window.id) {
        // Enter maintenance window
        this.state.activeMaintenanceWindow = window.id;
        this.emit('maintenance-window-enter', window);
        log.info(`[MaintenanceLock] Entered maintenance window: ${window.name}`);
      } else if (!inWindow && this.state.activeMaintenanceWindow === window.id) {
        // Exit maintenance window
        this.state.activeMaintenanceWindow = null;
        this.emit('maintenance-window-exit', window);
        log.info(`[MaintenanceLock] Exited maintenance window: ${window.name}`);
      }
    }
  }

  /**
   * Setup IPC handlers
   */
  private setupIPC(): void {
    ipcMain.handle('maintenance:getLevel', () => {
      return this.state.level;
    });

    ipcMain.handle('maintenance:getState', () => {
      return this.state;
    });

    ipcMain.handle('maintenance:getConfig', () => {
      return this.config;
    });

    ipcMain.handle('maintenance:setConfig', async (_event, newConfig: Partial<MaintenanceConfig>) => {
      const change = this.recordChange('config', 'Configuration updated', this.config, newConfig);
      this.config = { ...this.config, ...newConfig };
      await this.saveConfig();
      return { success: true, changeId: change.id };
    });

    ipcMain.handle('maintenance:enter', async (_event, reason: string) => {
      return await this.enterMaintenance(reason);
    });

    ipcMain.handle('maintenance:exit', async () => {
      return await this.exitMaintenance();
    });

    ipcMain.handle('maintenance:freeze', async (_event, reason: string) => {
      return await this.freeze(reason);
    });

    ipcMain.handle('maintenance:emergency', async (_event, reason: string) => {
      return await this.emergencyMode(reason);
    });

    ipcMain.handle('maintenance:isOperationAllowed', (_event, operation: string) => {
      return this.isOperationAllowed(operation);
    });

    ipcMain.handle('maintenance:getFeatureGates', () => {
      return this.config.featureGates;
    });

    ipcMain.handle('maintenance:setFeatureGate', async (_event, gateId: string, enabled: boolean) => {
      return await this.setFeatureGate(gateId, enabled);
    });

    ipcMain.handle('maintenance:unlockFeature', async (_event, gateId: string, durationHours: number) => {
      return await this.temporaryUnlock(gateId, durationHours);
    });

    ipcMain.handle('maintenance:getChangeHistory', () => {
      return this.state.changeHistory;
    });

    ipcMain.handle('maintenance:getHealthMetrics', () => {
      return this.state.healthMetrics;
    });

    ipcMain.handle('maintenance:reportError', () => {
      this.reportError();
    });

    ipcMain.handle('maintenance:reportCrash', () => {
      this.reportCrash();
    });
  }

  // ============================================================================
  // Core Functions
  // ============================================================================

  /**
   * Enter maintenance mode
   */
  async enterMaintenance(reason: string): Promise<{ success: boolean }> {
    if (this.state.level === 'emergency') {
      return { success: false };
    }

    const previousLevel = this.state.level;
    this.state.level = 'maintenance';
    this.state.enteredAt = Date.now();
    this.state.reason = reason;

    this.recordChange('system', `Entered maintenance mode: ${reason}`, previousLevel, 'maintenance');
    await this.saveState();

    log.info(`[MaintenanceLock] Entered maintenance mode: ${reason}`);
    this.emit('level-change', { from: previousLevel, to: 'maintenance', reason });

    return { success: true };
  }

  /**
   * Exit maintenance mode
   */
  async exitMaintenance(): Promise<{ success: boolean }> {
    if (this.state.level === 'emergency') {
      return { success: false };
    }

    if (this.state.level !== 'maintenance' && this.state.level !== 'frozen') {
      return { success: false };
    }

    const previousLevel = this.state.level;
    this.state.level = 'normal';
    this.state.reason = 'Exited maintenance mode';
    this.state.scheduledExit = null;

    this.recordChange('system', 'Exited maintenance mode', previousLevel, 'normal');
    await this.saveState();

    log.info('[MaintenanceLock] Exited maintenance mode');
    this.emit('level-change', { from: previousLevel, to: 'normal', reason: 'Manual exit' });

    return { success: true };
  }

  /**
   * Freeze system (no changes allowed)
   */
  async freeze(reason: string): Promise<{ success: boolean }> {
    const previousLevel = this.state.level;
    this.state.level = 'frozen';
    this.state.enteredAt = Date.now();
    this.state.reason = reason;

    this.recordChange('system', `System frozen: ${reason}`, previousLevel, 'frozen');
    await this.saveState();

    log.info(`[MaintenanceLock] System frozen: ${reason}`);
    this.emit('level-change', { from: previousLevel, to: 'frozen', reason });

    return { success: true };
  }

  /**
   * Enter emergency mode
   */
  async emergencyMode(reason: string): Promise<{ success: boolean }> {
    const previousLevel = this.state.level;
    this.state.level = 'emergency';
    this.state.enteredAt = Date.now();
    this.state.reason = reason;
    this.state.manualOverride = true;

    this.recordChange('system', `EMERGENCY: ${reason}`, previousLevel, 'emergency');
    await this.saveState();

    log.info(`[MaintenanceLock] EMERGENCY MODE: ${reason}`);
    this.emit('level-change', { from: previousLevel, to: 'emergency', reason });
    this.emit('emergency', reason);

    return { success: true };
  }

  /**
   * Check if an operation is allowed at current level
   */
  isOperationAllowed(operation: string): boolean {
    const allowed = LEVEL_PERMISSIONS[this.state.level];
    
    if (allowed.includes('*')) {
      return true;
    }

    return allowed.includes(operation);
  }

  /**
   * Set feature gate
   */
  async setFeatureGate(gateId: string, enabled: boolean): Promise<{ success: boolean }> {
    const gate = this.config.featureGates.find(g => g.id === gateId);
    
    if (!gate) {
      return { success: false };
    }

    if (gate.requiresUnlock && enabled && !gate.unlockExpiry) {
      return { success: false }; // Requires temporary unlock first
    }

    const previousValue = gate.enabled;
    gate.enabled = enabled;

    this.recordChange('feature', `Feature gate ${gateId} set to ${enabled}`, previousValue, enabled);
    await this.saveConfig();

    this.emit('feature-gate-change', { gateId, enabled });

    return { success: true };
  }

  /**
   * Temporarily unlock a feature
   */
  async temporaryUnlock(gateId: string, durationHours: number): Promise<{ success: boolean; expiresAt: number }> {
    const gate = this.config.featureGates.find(g => g.id === gateId);
    
    if (!gate) {
      return { success: false, expiresAt: 0 };
    }

    const expiresAt = Date.now() + (durationHours * 60 * 60 * 1000);
    gate.unlockExpiry = expiresAt;
    gate.enabled = true;

    this.recordChange('feature', `Feature ${gateId} temporarily unlocked for ${durationHours}h`, false, true);
    await this.saveConfig();

    // Schedule auto-lock
    setTimeout(async () => {
      if (gate.unlockExpiry === expiresAt) {
        gate.enabled = false;
        gate.unlockExpiry = null;
        await this.saveConfig();
        this.emit('feature-gate-expired', { gateId });
      }
    }, durationHours * 60 * 60 * 1000);

    this.emit('feature-unlocked', { gateId, expiresAt });

    return { success: true, expiresAt };
  }

  /**
   * Record a change
   */
  private recordChange(
    type: ChangeRecord['type'],
    description: string,
    previousValue: unknown,
    newValue: unknown
  ): ChangeRecord {
    const record: ChangeRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      description,
      previousValue,
      newValue,
      approved: !this.config.requireApprovalForChanges,
      approvedBy: this.config.requireApprovalForChanges ? null : 'system'
    };

    this.state.changeHistory.push(record);

    // Cleanup old history
    const cutoff = Date.now() - (this.config.changeHistoryRetentionDays * 24 * 60 * 60 * 1000);
    this.state.changeHistory = this.state.changeHistory.filter(r => r.timestamp >= cutoff);

    if (type === 'system' || type === 'feature') {
      this.state.lastMajorChange = Date.now();
    }

    return record;
  }

  /**
   * Report an error (for rate tracking)
   */
  reportError(): void {
    // Simple rolling average - not perfect but functional
    this.state.healthMetrics.errorRate = 
      (this.state.healthMetrics.errorRate * 0.9) + 0.1;
  }

  /**
   * Report a crash (for stability tracking)
   */
  reportCrash(): void {
    this.state.healthMetrics.crashCount++;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current maintenance level
   */
  getLevel(): MaintenanceLevel {
    return this.state.level;
  }

  /**
   * Check if system is in a restricted mode
   */
  isRestricted(): boolean {
    return this.state.level !== 'normal';
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(gateId: string): boolean {
    const gate = this.config.featureGates.find(g => g.id === gateId);
    
    if (!gate) {
      return true; // Unknown gates are allowed
    }

    // Check if temporary unlock expired
    if (gate.unlockExpiry && Date.now() > gate.unlockExpiry) {
      gate.enabled = false;
      gate.unlockExpiry = null;
    }

    return gate.enabled;
  }

  /**
   * Get health metrics
   */
  getHealthMetrics(): HealthMetrics {
    return { ...this.state.healthMetrics };
  }

  /**
   * Get degradation score
   */
  getDegradationScore(): number {
    return this.state.healthMetrics.degradationScore;
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    return this.state.healthMetrics.degradationScore < this.config.degradationThreshold;
  }

  /**
   * Get system age in days
   */
  getSystemAge(): number {
    return this.state.systemAge;
  }

  /**
   * Check if in maintenance window
   */
  isInMaintenanceWindow(): boolean {
    return this.state.activeMaintenanceWindow !== null;
  }

  /**
   * Request operation approval
   */
  async requestApproval(operation: string, description: string): Promise<boolean> {
    // If not requiring approval, auto-approve
    if (!this.config.requireApprovalForChanges) {
      return true;
    }

    // Check if operation is allowed at current level
    if (!this.isOperationAllowed(operation)) {
      return false;
    }

    // In a full implementation, this would prompt the user
    // For now, auto-approve if operation is allowed
    this.recordChange('system', `Operation approved: ${description}`, null, operation);
    return true;
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    log.info('[MaintenanceLock] Shutting down');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.windowCheckInterval) {
      clearInterval(this.windowCheckInterval);
      this.windowCheckInterval = null;
    }

    await this.saveState();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const maintenanceModeLock = new MaintenanceModeLock();
export { MaintenanceModeLock, MaintenanceLevel, MaintenanceWindow, FeatureGate, HealthMetrics, ChangeRecord };
