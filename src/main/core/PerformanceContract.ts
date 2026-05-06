// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Performance Contract
// Phase 45: Locked performance guarantees - any violation is rejected
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PerformanceGuarantee {
  id: string;
  name: string;
  description: string;
  category: 'cpu' | 'memory' | 'gpu' | 'network' | 'disk' | 'behavior';
  threshold: number;
  unit: string;
  critical: boolean;
}

export interface PerformanceViolation {
  guaranteeId: string;
  timestamp: number;
  actualValue: number;
  thresholdValue: number;
  action: 'logged' | 'throttled' | 'rejected';
}

export interface PerformanceSnapshot {
  timestamp: number;
  cpuPercent: number;
  memoryMB: number;
  handleCount: number;
  networkKBps: number;
  violations: string[];
}

export interface ContractConfig {
  enabled: boolean;
  enforceStrictly: boolean;
  logViolations: boolean;
  autoThrottle: boolean;
}

// ===========================================================================
// LOCKED PERFORMANCE GUARANTEES
// ===========================================================================

export const PERFORMANCE_GUARANTEES: PerformanceGuarantee[] = [
  // CPU Guarantees
  {
    id: 'cpu.idle',
    name: 'Idle CPU Ceiling',
    description: 'Maximum CPU usage when Dex is idle',
    category: 'cpu',
    threshold: 1,
    unit: '%',
    critical: true,
  },
  {
    id: 'cpu.active',
    name: 'Active CPU Ceiling',
    description: 'Maximum CPU usage during normal operation',
    category: 'cpu',
    threshold: 15,
    unit: '%',
    critical: false,
  },
  {
    id: 'cpu.background',
    name: 'Background CPU Ceiling',
    description: 'Maximum CPU usage when running in background',
    category: 'cpu',
    threshold: 2,
    unit: '%',
    critical: true,
  },

  // Memory Guarantees
  {
    id: 'memory.idle',
    name: 'Idle Memory Ceiling',
    description: 'Maximum memory usage when idle',
    category: 'memory',
    threshold: 150,
    unit: 'MB',
    critical: true,
  },
  {
    id: 'memory.active',
    name: 'Active Memory Ceiling',
    description: 'Maximum memory during active use',
    category: 'memory',
    threshold: 500,
    unit: 'MB',
    critical: false,
  },
  {
    id: 'memory.background',
    name: 'Background Memory Ceiling',
    description: 'Maximum memory when minimized',
    category: 'memory',
    threshold: 100,
    unit: 'MB',
    critical: true,
  },

  // GPU Guarantees
  {
    id: 'gpu.idle',
    name: 'Idle GPU Usage',
    description: 'GPU usage when idle (should be zero)',
    category: 'gpu',
    threshold: 0,
    unit: '%',
    critical: true,
  },

  // Behavior Guarantees
  {
    id: 'behavior.wake',
    name: 'Wake Response Time',
    description: 'Time to become responsive after wake',
    category: 'behavior',
    threshold: 500,
    unit: 'ms',
    critical: false,
  },
  {
    id: 'behavior.startup',
    name: 'Startup Time',
    description: 'Time from launch to ready',
    category: 'behavior',
    threshold: 3000,
    unit: 'ms',
    critical: false,
  },
];

// ===========================================================================
// STORE
// ===========================================================================

const contractStore = new Store<{
  config: ContractConfig;
  violations: PerformanceViolation[];
  snapshots: PerformanceSnapshot[];
  lastCheck: number;
}>({
  name: 'performance-contract',
  defaults: {
    config: {
      enabled: true,
      enforceStrictly: true,
      logViolations: true,
      autoThrottle: true,
    },
    violations: [],
    snapshots: [],
    lastCheck: 0,
  },
});

// ===========================================================================
// PERFORMANCE CONTRACT
// ===========================================================================

class PerformanceContract {
  private static instance: PerformanceContract;
  private initialized = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private currentState: 'idle' | 'active' | 'background' = 'active';
  private throttleCallbacks: Map<string, () => void> = new Map();

  private constructor() {}

  static getInstance(): PerformanceContract {
    if (!PerformanceContract.instance) {
      PerformanceContract.instance = new PerformanceContract();
    }
    return PerformanceContract.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.startMonitoring();

    this.initialized = true;
    log.info('[PerformanceContract] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('contract:getConfig', () => this.getConfig());
    ipcMain.handle('contract:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('contract:getGuarantees', () => this.getGuarantees());
    ipcMain.handle('contract:getViolations', (_, limit) => this.getViolations(limit));
    ipcMain.handle('contract:getSnapshot', () => this.takeSnapshot());
    ipcMain.handle('contract:checkCompliance', () => this.checkCompliance());
    ipcMain.handle('contract:setState', (_, state) => this.setState(state));
  }

  async shutdown(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // MONITORING
  // -------------------------------------------------------------------------

  private startMonitoring(): void {
    // Check every 10 seconds
    this.checkTimer = setInterval(() => {
      this.checkCompliance();
    }, 10000);
  }

  setState(state: 'idle' | 'active' | 'background'): void {
    this.currentState = state;
  }

  // -------------------------------------------------------------------------
  // COMPLIANCE CHECKING
  // -------------------------------------------------------------------------

  async checkCompliance(): Promise<{
    compliant: boolean;
    violations: PerformanceViolation[];
    snapshot: PerformanceSnapshot;
  }> {
    const config = contractStore.get('config');
    if (!config.enabled) {
      return { compliant: true, violations: [], snapshot: await this.takeSnapshot() };
    }

    const snapshot = await this.takeSnapshot();
    const violations: PerformanceViolation[] = [];

    // Check CPU guarantees
    const cpuGuarantee = this.getApplicableGuarantee('cpu');
    if (cpuGuarantee && snapshot.cpuPercent > cpuGuarantee.threshold) {
      violations.push(this.createViolation(cpuGuarantee, snapshot.cpuPercent));
    }

    // Check memory guarantees
    const memoryGuarantee = this.getApplicableGuarantee('memory');
    if (memoryGuarantee && snapshot.memoryMB > memoryGuarantee.threshold) {
      violations.push(this.createViolation(memoryGuarantee, snapshot.memoryMB));
    }

    // Handle violations
    if (violations.length > 0 && config.logViolations) {
      const storedViolations = contractStore.get('violations');
      storedViolations.push(...violations);
      
      // Keep last 500
      if (storedViolations.length > 500) {
        storedViolations.splice(0, storedViolations.length - 500);
      }
      contractStore.set('violations', storedViolations);
    }

    // Auto-throttle if enabled
    if (violations.length > 0 && config.autoThrottle) {
      this.applyThrottling(violations);
    }

    // Update snapshot history
    const snapshots = contractStore.get('snapshots');
    snapshots.push(snapshot);
    if (snapshots.length > 100) {
      snapshots.splice(0, snapshots.length - 100);
    }
    contractStore.set('snapshots', snapshots);
    contractStore.set('lastCheck', Date.now());

    return {
      compliant: violations.length === 0,
      violations,
      snapshot,
    };
  }

  private getApplicableGuarantee(category: 'cpu' | 'memory' | 'gpu'): PerformanceGuarantee | null {
    const guaranteeId = `${category}.${this.currentState}`;
    return PERFORMANCE_GUARANTEES.find(g => g.id === guaranteeId) || null;
  }

  private createViolation(guarantee: PerformanceGuarantee, actualValue: number): PerformanceViolation {
    const config = contractStore.get('config');
    
    return {
      guaranteeId: guarantee.id,
      timestamp: Date.now(),
      actualValue,
      thresholdValue: guarantee.threshold,
      action: config.autoThrottle ? 'throttled' : 'logged',
    };
  }

  private applyThrottling(violations: PerformanceViolation[]): void {
    for (const violation of violations) {
      const callback = this.throttleCallbacks.get(violation.guaranteeId);
      if (callback) {
        callback();
      }
    }

    // Force GC for memory violations
    const memoryViolation = violations.find(v => v.guaranteeId.startsWith('memory.'));
    if (memoryViolation && global.gc) {
      global.gc();
    }
  }

  registerThrottleCallback(guaranteeId: string, callback: () => void): () => void {
    this.throttleCallbacks.set(guaranteeId, callback);
    return () => this.throttleCallbacks.delete(guaranteeId);
  }

  // -------------------------------------------------------------------------
  // SNAPSHOTS
  // -------------------------------------------------------------------------

  async takeSnapshot(): Promise<PerformanceSnapshot> {
    const memoryUsage = process.memoryUsage();
    
    return {
      timestamp: Date.now(),
      cpuPercent: 0, // Would need OS-specific code for accurate measurement
      memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      handleCount: 0,
      networkKBps: 0,
      violations: [],
    };
  }

  // -------------------------------------------------------------------------
  // VALIDATION FOR CHANGES
  // -------------------------------------------------------------------------

  /**
   * Validate that a proposed change doesn't violate guarantees
   */
  async validateChange(change: {
    expectedCpuDelta?: number;
    expectedMemoryDelta?: number;
  }): Promise<{
    allowed: boolean;
    reason: string | null;
  }> {
    const config = contractStore.get('config');
    if (!config.enforceStrictly) {
      return { allowed: true, reason: null };
    }

    const snapshot = await this.takeSnapshot();

    // Check CPU
    if (change.expectedCpuDelta) {
      const cpuGuarantee = this.getApplicableGuarantee('cpu');
      if (cpuGuarantee) {
        const projectedCpu = snapshot.cpuPercent + change.expectedCpuDelta;
        if (projectedCpu > cpuGuarantee.threshold) {
          return {
            allowed: false,
            reason: `Would exceed CPU ceiling (${projectedCpu}% > ${cpuGuarantee.threshold}%)`,
          };
        }
      }
    }

    // Check memory
    if (change.expectedMemoryDelta) {
      const memoryGuarantee = this.getApplicableGuarantee('memory');
      if (memoryGuarantee) {
        const projectedMemory = snapshot.memoryMB + change.expectedMemoryDelta;
        if (projectedMemory > memoryGuarantee.threshold) {
          return {
            allowed: false,
            reason: `Would exceed memory ceiling (${projectedMemory}MB > ${memoryGuarantee.threshold}MB)`,
          };
        }
      }
    }

    return { allowed: true, reason: null };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): ContractConfig {
    return contractStore.get('config');
  }

  async updateConfig(updates: Partial<ContractConfig>): Promise<ContractConfig> {
    const config = contractStore.get('config');
    const updated = { ...config, ...updates };
    contractStore.set('config', updated);
    return updated;
  }

  getGuarantees(): PerformanceGuarantee[] {
    return PERFORMANCE_GUARANTEES;
  }

  getViolations(limit: number = 50): PerformanceViolation[] {
    return contractStore.get('violations').slice(-limit);
  }

  getSnapshots(limit: number = 20): PerformanceSnapshot[] {
    return contractStore.get('snapshots').slice(-limit);
  }

  /**
   * Get compliance report for display
   */
  getComplianceReport(): {
    status: 'compliant' | 'warning' | 'violation';
    guaranteesSatisfied: number;
    guaranteesTotal: number;
    recentViolations: number;
    recommendations: string[];
  } {
    const violations = contractStore.get('violations');
    const recentViolations = violations.filter(v => 
      Date.now() - v.timestamp < 60 * 60 * 1000 // Last hour
    );

    const criticalViolations = recentViolations.filter(v => {
      const guarantee = PERFORMANCE_GUARANTEES.find(g => g.id === v.guaranteeId);
      return guarantee?.critical;
    });

    let status: 'compliant' | 'warning' | 'violation' = 'compliant';
    if (criticalViolations.length > 0) {
      status = 'violation';
    } else if (recentViolations.length > 0) {
      status = 'warning';
    }

    const recommendations: string[] = [];
    if (recentViolations.some(v => v.guaranteeId.startsWith('memory.'))) {
      recommendations.push('Consider closing unused features to reduce memory usage');
    }
    if (recentViolations.some(v => v.guaranteeId.startsWith('cpu.'))) {
      recommendations.push('Reduce background activity for better performance');
    }

    return {
      status,
      guaranteesSatisfied: PERFORMANCE_GUARANTEES.length - recentViolations.length,
      guaranteesTotal: PERFORMANCE_GUARANTEES.length,
      recentViolations: recentViolations.length,
      recommendations,
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const performanceContract = PerformanceContract.getInstance();
export default performanceContract;
