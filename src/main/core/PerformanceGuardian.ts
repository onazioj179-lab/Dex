// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Performance Guardian
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// Hard performance budgets, self-monitoring, and drift detection
// ===========================================================================

import log from 'electron-log';
import { app } from 'electron';
import Store from 'electron-store';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PerformanceBudget {
  name: string;
  description: string;
  limit: number;
  unit: string;
  critical: boolean;
  current?: number;
  violations: number;
  lastViolation?: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  cpu: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  uptime: number;
  eventLoopLag: number;
  gcRuns?: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  budget: string;
  current: number;
  limit: number;
  severity: 'warning' | 'critical';
  message: string;
  resolved: boolean;
}

export interface PerformanceReport {
  generatedAt: number;
  uptime: number;
  budgets: PerformanceBudget[];
  alerts: PerformanceAlert[];
  snapshots: PerformanceSnapshot[];
  health: 'excellent' | 'good' | 'degraded' | 'critical';
  recommendations: string[];
}

// ===========================================================================
// PERFORMANCE BUDGETS - MAXIMUM PERFORMANCE MODE
// Full power for instant app loading
// ===========================================================================

const DEFAULT_BUDGETS: Record<string, Omit<PerformanceBudget, 'current' | 'violations' | 'lastViolation'>> = {
  idleCpu: {
    name: 'Idle CPU Usage',
    description: 'CPU usage when no user activity',
    limit: 90,    // 90% idle CPU allowed - no throttling
    unit: '%',
    critical: false,
  },
  activeCpu: {
    name: 'Active CPU Usage',
    description: 'CPU usage during normal operations',
    limit: 100,   // 100% active CPU allowed
    unit: '%',
    critical: false,
  },
  memoryHeap: {
    name: 'Memory Heap',
    description: 'JavaScript heap memory usage',
    limit: 2048,  // 2GB heap
    unit: 'MB',
    critical: false,
  },
  memoryRss: {
    name: 'Total Memory (RSS)',
    description: 'Total resident set size',
    limit: 4096,  // 4GB total RAM
    unit: 'MB',
    critical: false,
  },
  startupTime: {
    name: 'Startup Time',
    description: 'Time from launch to ready',
    limit: 10000, // 10 seconds startup
    unit: 'ms',
    critical: false,
  },
  backgroundTaskDuration: {
    name: 'Background Task Duration',
    description: 'Max time for background operations',
    limit: 10000, // 10 seconds for background tasks
    unit: 'ms',
    critical: false,
  },
  eventLoopLag: {
    name: 'Event Loop Lag',
    description: 'Main thread responsiveness',
    limit: 30000, // 30 seconds lag tolerance - no throttling
    unit: 'ms',
    critical: false,
  },
  memoryGrowthRate: {
    name: 'Memory Growth Rate',
    description: 'Memory increase per hour (leak detection)',
    limit: 500,   // 500MB/hr - generous for apps
    unit: 'MB/hr',
    critical: false,
  },
};

// ===========================================================================
// STORE
// ===========================================================================

const performanceStore = new Store<{
  budgets: Record<string, PerformanceBudget>;
  alerts: PerformanceAlert[];
  snapshots: PerformanceSnapshot[];
  startupTime?: number;
  configVersion?: number;
}>({
  name: 'dex-performance',
  defaults: {
    budgets: Object.fromEntries(
      Object.entries(DEFAULT_BUDGETS).map(([key, budget]) => [
        key,
        { ...budget, violations: 0 },
      ])
    ) as Record<string, PerformanceBudget>,
    alerts: [],
    snapshots: [],
    configVersion: 3,
  },
});

// Force reset budgets if config version changed (to apply new limits)
const CURRENT_CONFIG_VERSION = 4;
if (performanceStore.get('configVersion') !== CURRENT_CONFIG_VERSION) {
  performanceStore.set('budgets', Object.fromEntries(
    Object.entries(DEFAULT_BUDGETS).map(([key, budget]) => [
      key,
      { ...budget, violations: 0 },
    ])
  ) as Record<string, PerformanceBudget>);
  performanceStore.set('alerts', []);
  performanceStore.set('configVersion', CURRENT_CONFIG_VERSION);
}

// ===========================================================================
// PERFORMANCE GUARDIAN CLASS
// ===========================================================================

class PerformanceGuardianClass {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lagCheckInterval: NodeJS.Timeout | null = null;
  private lastLagCheck = Date.now();
  private initialMemory: number = 0;
  private startTime: number = Date.now();
  private isIdle = true;
  private maxSnapshots = 1000;
  private maxAlerts = 100;

  constructor() {
    this.initialMemory = process.memoryUsage().heapUsed;
  }

  // -------------------------------------------------------------------------
  // MONITORING
  // -------------------------------------------------------------------------

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.monitoringInterval) return;

    log.info(' [PerformanceGuardian] Starting monitoring (4GB RAM mode)');

    // Take snapshots every 120 seconds (was 60) - minimal polling
    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot();
      this.checkBudgets();
    }, 120000);

    // Check event loop lag every 10 seconds (was 5) - minimal polling
    this.lagCheckInterval = setInterval(() => {
      this.checkEventLoopLag();
    }, 10000);

    // Initial snapshot
    this.takeSnapshot();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.lagCheckInterval) {
      clearInterval(this.lagCheckInterval);
      this.lagCheckInterval = null;
    }
    log.info('[PerformanceGuardian] Monitoring stopped');
  }

  /**
   * Take a performance snapshot
   */
  private takeSnapshot(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      cpu: this.calculateCpuPercent(cpuUsage),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
      uptime: process.uptime(),
      eventLoopLag: this.getLastLag(),
    };

    // Store snapshot
    const snapshots = performanceStore.get('snapshots');
    snapshots.push(snapshot);
    
    // Trim old snapshots
    if (snapshots.length > this.maxSnapshots) {
      snapshots.splice(0, snapshots.length - this.maxSnapshots);
    }
    
    performanceStore.set('snapshots', snapshots);
  }

  /**
   * Check all budgets against current values
   */
  private checkBudgets(): void {
    const memUsage = process.memoryUsage();
    const budgets = performanceStore.get('budgets');

    // Update current values
    budgets.memoryHeap.current = Math.round(memUsage.heapUsed / 1024 / 1024);
    budgets.memoryRss.current = Math.round(memUsage.rss / 1024 / 1024);
    budgets.eventLoopLag.current = this.getLastLag();

    // Check CPU (idle vs active)
    const cpuBudget = this.isIdle ? budgets.idleCpu : budgets.activeCpu;
    cpuBudget.current = this.calculateCpuPercent(process.cpuUsage());

    // Check memory growth rate
    const uptimeHours = process.uptime() / 3600;
    if (uptimeHours > 0.1) { // At least 6 minutes
      const memoryGrowthMB = (memUsage.heapUsed - this.initialMemory) / 1024 / 1024;
      budgets.memoryGrowthRate.current = Math.round((memoryGrowthMB / uptimeHours) * 10) / 10;
    }

    // Check each budget
    for (const [key, budget] of Object.entries(budgets)) {
      if (budget.current !== undefined && budget.current > budget.limit) {
        this.recordViolation(key, budget);
      }
    }

    performanceStore.set('budgets', budgets);
  }

  /**
   * Check event loop lag
   */
  private checkEventLoopLag(): void {
    const now = Date.now();
    const expected = this.lastLagCheck + 1000;
    const lag = now - expected;
    this.lastLagCheck = now;

    // Store the lag value
    const budgets = performanceStore.get('budgets');
    budgets.eventLoopLag.current = Math.max(0, lag);
    performanceStore.set('budgets', budgets);
  }

  private lastLag = 0;
  private getLastLag(): number {
    return performanceStore.get('budgets').eventLoopLag.current ?? 0;
  }

  /**
   * Record a budget violation
   */
  private recordViolation(budgetKey: string, budget: PerformanceBudget): void {
    budget.violations++;
    budget.lastViolation = Date.now();

    // Create alert
    const alert: PerformanceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      budget: budget.name,
      current: budget.current!,
      limit: budget.limit,
      severity: budget.critical ? 'critical' : 'warning',
      message: `${budget.name} exceeded: ${budget.current}${budget.unit} (limit: ${budget.limit}${budget.unit})`,
      resolved: false,
    };

    const alerts = performanceStore.get('alerts');
    alerts.push(alert);
    
    if (alerts.length > this.maxAlerts) {
      alerts.splice(0, alerts.length - this.maxAlerts);
    }
    
    performanceStore.set('alerts', alerts);

    // Only log if critical budget
    if (budget.critical) {
      log.warn(`[PerformanceGuardian] Budget violation: ${alert.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get current performance status
   */
  getStatus(): {
    health: 'excellent' | 'good' | 'degraded' | 'critical';
    budgets: PerformanceBudget[];
    recentAlerts: PerformanceAlert[];
    uptime: number;
  } {
    const budgets = Object.values(performanceStore.get('budgets'));
    const alerts = performanceStore.get('alerts');
    const recentAlerts = alerts.slice(-10);

    // Determine health
    let health: 'excellent' | 'good' | 'degraded' | 'critical' = 'excellent';
    
    const unresolvedAlerts = alerts.filter(a => !a.resolved);
    const criticalAlerts = unresolvedAlerts.filter(a => a.severity === 'critical');
    
    if (criticalAlerts.length > 0) {
      health = 'critical';
    } else if (unresolvedAlerts.length > 3) {
      health = 'degraded';
    } else if (unresolvedAlerts.length > 0) {
      health = 'good';
    }

    // Check current values against budgets
    for (const budget of budgets) {
      if (budget.current !== undefined) {
        const ratio = budget.current / budget.limit;
        if (ratio > 1 && budget.critical) {
          health = 'critical';
        } else if (ratio > 0.9 && health === 'excellent') {
          health = 'good';
        }
      }
    }

    return {
      health,
      budgets,
      recentAlerts,
      uptime: process.uptime(),
    };
  }

  /**
   * Get full performance report
   */
  getReport(): PerformanceReport {
    const budgets = Object.values(performanceStore.get('budgets'));
    const alerts = performanceStore.get('alerts');
    const snapshots = performanceStore.get('snapshots').slice(-100);
    const status = this.getStatus();

    const recommendations: string[] = [];

    // Generate recommendations based on status
    for (const budget of budgets) {
      if (budget.current !== undefined && budget.current > budget.limit * 0.8) {
        if (budget.name.includes('Memory')) {
          recommendations.push('Consider closing unused applications to free memory');
        }
        if (budget.name.includes('CPU')) {
          recommendations.push('Reduce active automations or increase rule cooldowns');
        }
      }
    }

    if (status.health === 'critical') {
      recommendations.push('Restart Dex if performance issues persist');
    }

    return {
      generatedAt: Date.now(),
      uptime: process.uptime(),
      budgets,
      alerts,
      snapshots,
      health: status.health,
      recommendations: [...new Set(recommendations)],
    };
  }

  /**
   * Get memory trend over time
   */
  getMemoryTrend(): { timestamp: number; heapMB: number }[] {
    const snapshots = performanceStore.get('snapshots');
    return snapshots.map(s => ({
      timestamp: s.timestamp,
      heapMB: s.memory.heapUsed,
    }));
  }

  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------

  /**
   * Set idle/active state (affects CPU budget)
   */
  setIdleState(idle: boolean): void {
    this.isIdle = idle;
  }

  /**
   * Record startup time
   */
  recordStartupTime(startTime: number): void {
    const duration = Date.now() - startTime;
    performanceStore.set('startupTime', duration);

    const budgets = performanceStore.get('budgets');
    budgets.startupTime.current = duration;
    
    if (duration > budgets.startupTime.limit) {
      this.recordViolation('startupTime', budgets.startupTime);
    }
    
    performanceStore.set('budgets', budgets);
    log.info(`[PerformanceGuardian] Startup time: ${duration}ms`);
  }

  /**
   * Mark an alert as resolved
   */
  resolveAlert(alertId: string): void {
    const alerts = performanceStore.get('alerts');
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      performanceStore.set('alerts', alerts);
    }
  }

  /**
   * Clear old alerts
   */
  clearResolvedAlerts(): void {
    const alerts = performanceStore.get('alerts');
    const unresolved = alerts.filter(a => !a.resolved);
    performanceStore.set('alerts', unresolved);
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    // This is an approximation
    const totalMicros = cpuUsage.user + cpuUsage.system;
    const uptimeMillis = process.uptime() * 1000;
    return Math.min(100, Math.round((totalMicros / 1000 / uptimeMillis) * 100));
  }

  /**
   * Force garbage collection if available (requires --expose-gc flag)
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      log.info('[PerformanceGuardian] Forced garbage collection');
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const performanceGuardian = new PerformanceGuardianClass();
