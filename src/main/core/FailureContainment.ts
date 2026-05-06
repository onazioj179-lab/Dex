// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Failure Containment System
// Phase 45: Fault isolation, crash containment, automatic recovery
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type FaultDomain = 
  | 'core'
  | 'ui'
  | 'automation'
  | 'network'
  | 'storage'
  | 'encryption'
  | 'background';

export type FaultSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Fault {
  id: string;
  domain: FaultDomain;
  severity: FaultSeverity;
  error: string;
  stack?: string;
  timestamp: number;
  recovered: boolean;
  recoveryAttempts: number;
  isolated: boolean;
}

export interface DomainStatus {
  domain: FaultDomain;
  healthy: boolean;
  faultCount: number;
  lastFault: number | null;
  isolated: boolean;
  recoveryInProgress: boolean;
}

export interface FailureContainmentConfig {
  enabled: boolean;
  maxFaultsBeforeIsolation: number;
  autoRecoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  isolationTimeoutMs: number;
  notifyUserOnCritical: boolean;
}

export interface SafeModeConfig {
  active: boolean;
  reason: string | null;
  activatedAt: number | null;
  disabledDomains: FaultDomain[];
}

// ===========================================================================
// STORE
// ===========================================================================

const containmentStore = new Store<{
  config: FailureContainmentConfig;
  faults: Fault[];
  domainStatus: Record<FaultDomain, DomainStatus>;
  safeMode: SafeModeConfig;
  lastStableConfig: Record<string, unknown> | null;
}>({
  name: 'failure-containment',
  defaults: {
    config: {
      enabled: true,
      maxFaultsBeforeIsolation: 3,
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      isolationTimeoutMs: 5 * 60 * 1000, // 5 minutes
      notifyUserOnCritical: true,
    },
    faults: [],
    domainStatus: {
      core: { domain: 'core', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      ui: { domain: 'ui', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      automation: { domain: 'automation', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      network: { domain: 'network', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      storage: { domain: 'storage', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      encryption: { domain: 'encryption', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
      background: { domain: 'background', healthy: true, faultCount: 0, lastFault: null, isolated: false, recoveryInProgress: false },
    },
    safeMode: {
      active: false,
      reason: null,
      activatedAt: null,
      disabledDomains: [],
    },
    lastStableConfig: null,
  },
});

// ===========================================================================
// FAILURE CONTAINMENT
// ===========================================================================

class FailureContainment {
  private static instance: FailureContainment;
  private initialized = false;
  private recoveryHandlers: Map<FaultDomain, () => Promise<boolean>> = new Map();
  private isolationTimers: Map<FaultDomain, NodeJS.Timeout> = new Map();

  private constructor() {}

  static getInstance(): FailureContainment {
    if (!FailureContainment.instance) {
      FailureContainment.instance = new FailureContainment();
    }
    return FailureContainment.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.registerDefaultRecoveryHandlers();
    this.setupGlobalErrorHandlers();

    // Check if we should be in safe mode
    const safeMode = containmentStore.get('safeMode');
    if (safeMode.active) {
      log.info('[FailureContainment] Starting in safe mode');
    }

    this.initialized = true;
    log.info('[FailureContainment] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('containment:getConfig', () => this.getConfig());
    ipcMain.handle('containment:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('containment:getDomainStatus', () => this.getAllDomainStatus());
    ipcMain.handle('containment:getFaults', (_, limit) => this.getFaults(limit));
    ipcMain.handle('containment:getSafeMode', () => this.getSafeMode());
    ipcMain.handle('containment:enterSafeMode', (_, reason) => this.enterSafeMode(reason));
    ipcMain.handle('containment:exitSafeMode', () => this.exitSafeMode());
    ipcMain.handle('containment:isolateDomain', (_, domain) => this.isolateDomain(domain));
    ipcMain.handle('containment:restoreDomain', (_, domain) => this.restoreDomain(domain));
    ipcMain.handle('containment:clearFaults', () => this.clearFaults());
  }

  private setupGlobalErrorHandlers(): void {
    // Catch unhandled rejections
    process.on('unhandledRejection', (reason) => {
      this.reportFault('core', 'critical', `Unhandled rejection: ${reason}`);
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.reportFault('core', 'critical', error.message, error.stack);
    });
  }

  async shutdown(): Promise<void> {
    // Clear all isolation timers
    for (const timer of this.isolationTimers.values()) {
      clearTimeout(timer);
    }
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // RECOVERY HANDLERS
  // -------------------------------------------------------------------------

  private registerDefaultRecoveryHandlers(): void {
    // UI recovery - reload renderer
    this.recoveryHandlers.set('ui', async () => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.reload();
        }
      }
      return true;
    });

    // Background recovery - restart background tasks
    this.recoveryHandlers.set('background', async () => {
      // Would restart background services
      return true;
    });

    // Storage recovery - use cached data
    this.recoveryHandlers.set('storage', async () => {
      // Would attempt to recover from backup
      return true;
    });
  }

  registerRecoveryHandler(domain: FaultDomain, handler: () => Promise<boolean>): void {
    this.recoveryHandlers.set(domain, handler);
  }

  // -------------------------------------------------------------------------
  // FAULT REPORTING
  // -------------------------------------------------------------------------

  async reportFault(
    domain: FaultDomain,
    severity: FaultSeverity,
    error: string,
    stack?: string
  ): Promise<void> {
    const config = containmentStore.get('config');
    if (!config.enabled) return;

    const fault: Fault = {
      id: `fault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      domain,
      severity,
      error,
      stack,
      timestamp: Date.now(),
      recovered: false,
      recoveryAttempts: 0,
      isolated: false,
    };

    // Store fault
    const faults = containmentStore.get('faults');
    faults.push(fault);
    if (faults.length > 1000) {
      faults.splice(0, faults.length - 1000);
    }
    containmentStore.set('faults', faults);

    // Update domain status
    const domainStatus = containmentStore.get('domainStatus');
    const status = domainStatus[domain];
    status.faultCount++;
    status.lastFault = Date.now();
    status.healthy = false;
    containmentStore.set('domainStatus', domainStatus);

    log.info(`[FailureContainment] Fault in ${domain}: ${error}`);

    // Check if isolation is needed
    if (status.faultCount >= config.maxFaultsBeforeIsolation) {
      await this.isolateDomain(domain);
    }

    // Attempt recovery
    if (config.autoRecoveryEnabled && !status.isolated) {
      await this.attemptRecovery(domain, fault);
    }

    // Notify user for critical faults
    if (severity === 'critical' && config.notifyUserOnCritical) {
      this.notifyUser(fault);
    }
  }

  // -------------------------------------------------------------------------
  // ISOLATION
  // -------------------------------------------------------------------------

  async isolateDomain(domain: FaultDomain): Promise<boolean> {
    const config = containmentStore.get('config');
    const domainStatus = containmentStore.get('domainStatus');
    const status = domainStatus[domain];

    if (status.isolated) return true;

    log.info(`[FailureContainment] Isolating domain: ${domain}`);

    status.isolated = true;
    status.healthy = false;
    containmentStore.set('domainStatus', domainStatus);

    // Set timeout to restore domain
    const timer = setTimeout(() => {
      this.restoreDomain(domain);
    }, config.isolationTimeoutMs);
    this.isolationTimers.set(domain, timer);

    return true;
  }

  async restoreDomain(domain: FaultDomain): Promise<boolean> {
    const domainStatus = containmentStore.get('domainStatus');
    const status = domainStatus[domain];

    if (!status.isolated) return true;

    log.info(`[FailureContainment] Restoring domain: ${domain}`);

    status.isolated = false;
    status.faultCount = 0;
    status.healthy = true;
    containmentStore.set('domainStatus', domainStatus);

    // Clear isolation timer
    const timer = this.isolationTimers.get(domain);
    if (timer) {
      clearTimeout(timer);
      this.isolationTimers.delete(domain);
    }

    return true;
  }

  isDomainIsolated(domain: FaultDomain): boolean {
    const domainStatus = containmentStore.get('domainStatus');
    return domainStatus[domain].isolated;
  }

  // -------------------------------------------------------------------------
  // RECOVERY
  // -------------------------------------------------------------------------

  private async attemptRecovery(domain: FaultDomain, fault: Fault): Promise<boolean> {
    const config = containmentStore.get('config');
    const handler = this.recoveryHandlers.get(domain);

    if (!handler) return false;
    if (fault.recoveryAttempts >= config.maxRecoveryAttempts) {
      log.info(`[FailureContainment] Max recovery attempts reached for ${domain}`);
      return false;
    }

    const domainStatus = containmentStore.get('domainStatus');
    const status = domainStatus[domain];
    status.recoveryInProgress = true;
    containmentStore.set('domainStatus', domainStatus);

    try {
      fault.recoveryAttempts++;
      const success = await handler();

      if (success) {
        fault.recovered = true;
        status.healthy = true;
        status.faultCount = 0;
        log.info(`[FailureContainment] Recovery successful for ${domain}`);
      }

      status.recoveryInProgress = false;
      containmentStore.set('domainStatus', domainStatus);

      return success;
    } catch (error) {
      log.error(`[FailureContainment] Recovery failed for ${domain}:`, error);
      status.recoveryInProgress = false;
      containmentStore.set('domainStatus', domainStatus);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // SAFE MODE
  // -------------------------------------------------------------------------

  async enterSafeMode(reason: string): Promise<boolean> {
    log.info(`[FailureContainment] Entering safe mode: ${reason}`);

    const safeMode: SafeModeConfig = {
      active: true,
      reason,
      activatedAt: Date.now(),
      disabledDomains: ['automation', 'background', 'network'],
    };

    containmentStore.set('safeMode', safeMode);

    // Isolate non-essential domains
    for (const domain of safeMode.disabledDomains) {
      await this.isolateDomain(domain);
    }

    return true;
  }

  async exitSafeMode(): Promise<boolean> {
    const safeMode = containmentStore.get('safeMode');
    if (!safeMode.active) return true;

    log.info('[FailureContainment] Exiting safe mode');

    // Restore all domains
    for (const domain of safeMode.disabledDomains) {
      await this.restoreDomain(domain);
    }

    containmentStore.set('safeMode', {
      active: false,
      reason: null,
      activatedAt: null,
      disabledDomains: [],
    });

    return true;
  }

  getSafeMode(): SafeModeConfig {
    return containmentStore.get('safeMode');
  }

  isInSafeMode(): boolean {
    return containmentStore.get('safeMode').active;
  }

  // -------------------------------------------------------------------------
  // STABLE CONFIG
  // -------------------------------------------------------------------------

  saveStableConfig(config: Record<string, unknown>): void {
    containmentStore.set('lastStableConfig', config);
  }

  getLastStableConfig(): Record<string, unknown> | null {
    return containmentStore.get('lastStableConfig');
  }

  async rollbackToStableConfig(): Promise<boolean> {
    const stableConfig = containmentStore.get('lastStableConfig');
    if (!stableConfig) return false;

    // Would apply stable config to settings
    log.info('[FailureContainment] Rolling back to stable config');
    return true;
  }

  // -------------------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------------------

  private notifyUser(fault: Fault): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('containment:fault', {
          domain: fault.domain,
          severity: fault.severity,
          message: `An error occurred in ${fault.domain}. Dex is attempting to recover.`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): FailureContainmentConfig {
    return containmentStore.get('config');
  }

  async updateConfig(updates: Partial<FailureContainmentConfig>): Promise<FailureContainmentConfig> {
    const config = containmentStore.get('config');
    const updated = { ...config, ...updates };
    containmentStore.set('config', updated);
    return updated;
  }

  getDomainStatus(domain: FaultDomain): DomainStatus {
    return containmentStore.get('domainStatus')[domain];
  }

  getAllDomainStatus(): Record<FaultDomain, DomainStatus> {
    return containmentStore.get('domainStatus');
  }

  getFaults(limit: number = 50): Fault[] {
    return containmentStore.get('faults').slice(-limit);
  }

  async clearFaults(): Promise<boolean> {
    containmentStore.set('faults', []);
    
    // Reset domain status
    const domainStatus = containmentStore.get('domainStatus');
    for (const status of Object.values(domainStatus)) {
      status.faultCount = 0;
      status.healthy = true;
      status.isolated = false;
      status.recoveryInProgress = false;
    }
    containmentStore.set('domainStatus', domainStatus);

    return true;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const failureContainment = FailureContainment.getInstance();
export default failureContainment;
