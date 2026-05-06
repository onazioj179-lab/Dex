// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 11: Idle Discipline & Long-Term Health (PERFORMANCE)
// ===========================================================================
// The app MUST be invisible when not in use. Zero idle CPU. Zero memory bloat.
// Long-term stability guarantees. Proactive health monitoring.
// User can rely on Dex being there when needed--and not there when not.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, powerMonitor, BrowserWindow } from 'electron';
import * as os from 'os';
import * as v8 from 'v8';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface HealthMetrics {
  timestamp: number;
  
  // Memory
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
    trend: 'stable' | 'growing' | 'shrinking';
  };
  
  // CPU
  cpu: {
    percentUsed: number;
    idle: boolean;
    trend: 'stable' | 'high' | 'low';
  };
  
  // System
  system: {
    totalMemory: number;
    freeMemory: number;
    uptime: number;
    loadAverage: number[];
  };
  
  // App
  app: {
    windowCount: number;
    uptime: number;
    idleDuration: number;
    lastActivity: number;
  };
}

export interface HealthThresholds {
  memory: {
    warningPercent: number;    // % of heap
    criticalPercent: number;
    maxHeapMB: number;
  };
  cpu: {
    idleThresholdPercent: number;
    highThresholdPercent: number;
  };
  idle: {
    aggressiveModeAfterMs: number;
    deepSleepAfterMs: number;
  };
}

export interface HealthAlert {
  id: string;
  type: 'memory-warning' | 'memory-critical' | 'cpu-high' | 'leak-detected' | 'stability-concern';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  metrics?: Partial<HealthMetrics>;
  acknowledged: boolean;
  autoResolved: boolean;
  resolvedAt?: number;
}

export interface IdleState {
  isIdle: boolean;
  mode: 'active' | 'light-idle' | 'aggressive-idle' | 'deep-sleep';
  idleSince: number;
  idleDuration: number;
  
  // What's suspended
  suspendedServices: string[];
  reducedPolling: boolean;
  gcForced: boolean;
}

export interface HealthReport {
  generatedAt: number;
  period: {
    start: number;
    end: number;
    durationHours: number;
  };
  
  // Summary
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  healthScore: number;  // 0-100
  
  // Memory stats
  memory: {
    averageUsedMB: number;
    peakUsedMB: number;
    leakSuspected: boolean;
    gcEfficiency: number;
  };
  
  // CPU stats
  cpu: {
    averagePercent: number;
    peakPercent: number;
    idlePercent: number;  // % of time truly idle
  };
  
  // Stability
  stability: {
    crashes: number;
    hangs: number;
    errors: number;
    autoRecoveries: number;
  };
  
  // Recommendations
  recommendations: Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

// ===========================================================================
// IDLE DISCIPLINE MANAGER
// ===========================================================================

class IdleDisciplineManagerClass extends EventEmitter {
  private idleState: IdleState;
  private thresholds: HealthThresholds;
  private metricsHistory: HealthMetrics[] = [];
  private alerts: Map<string, HealthAlert> = new Map();
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Monitoring intervals
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private gcInterval: NodeJS.Timeout | null = null;
  
  // Timing
  private readonly HEALTH_CHECK_INTERVAL_MS = 30 * 1000;      // 30 seconds
  private readonly IDLE_CHECK_INTERVAL_MS = 5 * 1000;         // 5 seconds
  private readonly METRICS_RETENTION_COUNT = 1000;
  private readonly GC_INTERVAL_IDLE_MS = 5 * 60 * 1000;       // 5 minutes when idle
  
  // Activity tracking
  private lastActivity: number = Date.now();
  private cpuSamples: number[] = [];
  private memorySnapshots: number[] = [];

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'health');
    this.thresholds = this.defaultThresholds();
    this.idleState = this.defaultIdleState();
    this.setMaxListeners(20);
  }

  private defaultThresholds(): HealthThresholds {
    return {
      memory: {
        warningPercent: 70,
        criticalPercent: 90,
        maxHeapMB: 512,
      },
      cpu: {
        idleThresholdPercent: 2,
        highThresholdPercent: 50,
      },
      idle: {
        aggressiveModeAfterMs: 5 * 60 * 1000,    // 5 minutes
        deepSleepAfterMs: 30 * 60 * 1000,        // 30 minutes
      },
    };
  }

  private defaultIdleState(): IdleState {
    return {
      isIdle: false,
      mode: 'active',
      idleSince: 0,
      idleDuration: 0,
      suspendedServices: [],
      reducedPolling: false,
      gcForced: false,
    };
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    this.registerPowerMonitor();
    this.registerIPCHandlers();
    this.startMonitoring();

    this.isInitialized = true;
    log.info('[IdleDiscipline] Idle discipline manager initialized');
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    this.saveMetrics();
    this.removeAllListeners();
    log.info('[IdleDiscipline] Idle discipline manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private registerPowerMonitor(): void {
    powerMonitor.on('suspend', () => {
      log.info('[IdleDiscipline] System suspending');
      this.enterDeepSleep('system-suspend');
    });

    powerMonitor.on('resume', () => {
      log.info('[IdleDiscipline] System resumed');
      this.wakeUp('system-resume');
    });

    powerMonitor.on('lock-screen', () => {
      log.info('[IdleDiscipline] Screen locked');
      this.enterAggressiveIdle('screen-lock');
    });

    powerMonitor.on('unlock-screen', () => {
      log.info('[IdleDiscipline] Screen unlocked');
      this.wakeUp('screen-unlock');
    });
  }

  private startMonitoring(): void {
    // Health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL_MS);

    // Idle checks
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleState();
    }, this.IDLE_CHECK_INTERVAL_MS);

    // Initial health check
    this.performHealthCheck();
  }

  // -------------------------------------------------------------------------
  // HEALTH MONITORING
  // -------------------------------------------------------------------------

  /**
   * Record user activity (call from input handlers)
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
    
    if (this.idleState.isIdle) {
      this.wakeUp('user-activity');
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    const metrics = this.collectMetrics();
    this.metricsHistory.push(metrics);
    
    // Trim history
    if (this.metricsHistory.length > this.METRICS_RETENTION_COUNT) {
      this.metricsHistory = this.metricsHistory.slice(-this.METRICS_RETENTION_COUNT);
    }

    // Check for issues
    this.checkMemoryHealth(metrics);
    this.checkCPUHealth(metrics);
    this.checkForLeaks();

    this.emit('health-check', metrics);
  }

  private collectMetrics(): HealthMetrics {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const cpuUsage = process.cpuUsage();
    
    // Calculate CPU percentage (rough estimate)
    const cpuPercent = this.calculateCPUPercent(cpuUsage);
    this.cpuSamples.push(cpuPercent);
    if (this.cpuSamples.length > 60) {
      this.cpuSamples.shift();
    }

    // Memory trend
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    this.memorySnapshots.push(heapUsedMB);
    if (this.memorySnapshots.length > 60) {
      this.memorySnapshots.shift();
    }

    const memoryTrend = this.calculateMemoryTrend();
    const cpuTrend = this.calculateCPUTrend();

    return {
      timestamp: Date.now(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        percentUsed: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
        trend: memoryTrend,
      },
      cpu: {
        percentUsed: cpuPercent,
        idle: cpuPercent < this.thresholds.cpu.idleThresholdPercent,
        trend: cpuTrend,
      },
      system: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
      },
      app: {
        windowCount: BrowserWindow.getAllWindows().length,
        uptime: process.uptime(),
        idleDuration: this.idleState.idleDuration,
        lastActivity: this.lastActivity,
      },
    };
  }

  private calculateCPUPercent(cpuUsage: NodeJS.CpuUsage): number {
    // This is a simplified calculation
    const total = cpuUsage.user + cpuUsage.system;
    return Math.min(100, total / 10000);  // Rough approximation
  }

  private calculateMemoryTrend(): 'stable' | 'growing' | 'shrinking' {
    if (this.memorySnapshots.length < 10) return 'stable';
    
    const recent = this.memorySnapshots.slice(-10);
    const older = this.memorySnapshots.slice(-20, -10);
    
    if (older.length < 10) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    
    if (diff > 10) return 'growing';
    if (diff < -10) return 'shrinking';
    return 'stable';
  }

  private calculateCPUTrend(): 'stable' | 'high' | 'low' {
    if (this.cpuSamples.length < 10) return 'stable';
    
    const avg = this.cpuSamples.slice(-10).reduce((a, b) => a + b, 0) / 10;
    
    if (avg > this.thresholds.cpu.highThresholdPercent) return 'high';
    if (avg < this.thresholds.cpu.idleThresholdPercent) return 'low';
    return 'stable';
  }

  private checkMemoryHealth(metrics: HealthMetrics): void {
    const percentUsed = metrics.memory.percentUsed;
    
    if (percentUsed >= this.thresholds.memory.criticalPercent) {
      this.createAlert({
        type: 'memory-critical',
        severity: 'critical',
        message: `Memory usage critical: ${percentUsed.toFixed(1)}%`,
        metrics,
      });
      
      // Force garbage collection
      this.forceGC();
    } else if (percentUsed >= this.thresholds.memory.warningPercent) {
      this.createAlert({
        type: 'memory-warning',
        severity: 'warning',
        message: `Memory usage high: ${percentUsed.toFixed(1)}%`,
        metrics,
      });
    }

    // Check absolute heap size
    const heapMB = metrics.memory.heapUsed / 1024 / 1024;
    if (heapMB > this.thresholds.memory.maxHeapMB) {
      this.createAlert({
        type: 'memory-warning',
        severity: 'warning',
        message: `Heap size exceeds limit: ${heapMB.toFixed(0)}MB`,
        metrics,
      });
    }
  }

  private checkCPUHealth(metrics: HealthMetrics): void {
    if (metrics.cpu.trend === 'high') {
      this.createAlert({
        type: 'cpu-high',
        severity: 'warning',
        message: `CPU usage consistently high: ${metrics.cpu.percentUsed.toFixed(1)}%`,
        metrics,
      });
    }
  }

  private checkForLeaks(): void {
    if (this.memorySnapshots.length < 30) return;
    
    // Check for consistent memory growth over 30 samples
    const first10 = this.memorySnapshots.slice(0, 10);
    const last10 = this.memorySnapshots.slice(-10);
    
    const firstAvg = first10.reduce((a, b) => a + b, 0) / 10;
    const lastAvg = last10.reduce((a, b) => a + b, 0) / 10;
    
    const growthRate = (lastAvg - firstAvg) / firstAvg;
    
    if (growthRate > 0.5) {  // 50% growth
      this.createAlert({
        type: 'leak-detected',
        severity: 'warning',
        message: `Possible memory leak detected: ${(growthRate * 100).toFixed(0)}% growth`,
      });
    }
  }

  private createAlert(params: Omit<HealthAlert, 'id' | 'timestamp' | 'acknowledged' | 'autoResolved'>): void {
    // Check for existing similar alert
    const existing = Array.from(this.alerts.values()).find(
      a => a.type === params.type && !a.acknowledged && !a.autoResolved
    );
    
    if (existing) return;  // Don't duplicate

    const alert: HealthAlert = {
      ...params,
      id: `${params.type}-${Date.now()}`,
      timestamp: Date.now(),
      acknowledged: false,
      autoResolved: false,
    };

    this.alerts.set(alert.id, alert);
    this.emit('health-alert', alert);
    
    log.warn(`[IdleDiscipline] Health alert: ${alert.message}`);
  }

  // -------------------------------------------------------------------------
  // IDLE MANAGEMENT
  // -------------------------------------------------------------------------

  private checkIdleState(): void {
    const now = Date.now();
    const idleDuration = now - this.lastActivity;

    // Update idle duration
    if (this.idleState.isIdle) {
      this.idleState.idleDuration = idleDuration;
    }

    // Check for state transitions
    if (!this.idleState.isIdle && idleDuration > 60 * 1000) {
      // Enter light idle after 1 minute of inactivity
      this.enterLightIdle();
    }

    if (this.idleState.mode === 'light-idle' && 
        idleDuration > this.thresholds.idle.aggressiveModeAfterMs) {
      this.enterAggressiveIdle('timeout');
    }

    if (this.idleState.mode === 'aggressive-idle' && 
        idleDuration > this.thresholds.idle.deepSleepAfterMs) {
      this.enterDeepSleep('timeout');
    }
  }

  private enterLightIdle(): void {
    if (this.idleState.mode === 'active') {
      this.idleState = {
        isIdle: true,
        mode: 'light-idle',
        idleSince: Date.now(),
        idleDuration: 0,
        suspendedServices: [],
        reducedPolling: true,
        gcForced: false,
      };

      this.emit('idle-mode-changed', this.idleState);
      log.debug('[IdleDiscipline] Entered light idle mode');
    }
  }

  private enterAggressiveIdle(reason: string): void {
    this.idleState = {
      isIdle: true,
      mode: 'aggressive-idle',
      idleSince: this.idleState.idleSince || Date.now(),
      idleDuration: Date.now() - (this.idleState.idleSince || Date.now()),
      suspendedServices: ['analytics', 'sync', 'learning'],
      reducedPolling: true,
      gcForced: true,
    };

    // Force GC
    this.forceGC();

    // Start periodic GC when idle
    if (!this.gcInterval) {
      this.gcInterval = setInterval(() => {
        if (this.idleState.isIdle) {
          this.forceGC();
        }
      }, this.GC_INTERVAL_IDLE_MS);
    }

    this.emit('idle-mode-changed', this.idleState);
    log.info(`[IdleDiscipline] Entered aggressive idle mode: ${reason}`);
  }

  private enterDeepSleep(reason: string): void {
    this.idleState = {
      isIdle: true,
      mode: 'deep-sleep',
      idleSince: this.idleState.idleSince || Date.now(),
      idleDuration: Date.now() - (this.idleState.idleSince || Date.now()),
      suspendedServices: ['analytics', 'sync', 'learning', 'search-indexing', 'file-watching'],
      reducedPolling: true,
      gcForced: true,
    };

    // Stop health checks during deep sleep
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.emit('idle-mode-changed', this.idleState);
    log.info(`[IdleDiscipline] Entered deep sleep: ${reason}`);
  }

  private wakeUp(reason: string): void {
    if (!this.idleState.isIdle) return;

    const previousMode = this.idleState.mode;

    this.idleState = {
      isIdle: false,
      mode: 'active',
      idleSince: 0,
      idleDuration: 0,
      suspendedServices: [],
      reducedPolling: false,
      gcForced: false,
    };

    // Stop GC interval
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    // Restart health checks if they were stopped
    if (!this.healthCheckInterval) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, this.HEALTH_CHECK_INTERVAL_MS);
    }

    this.emit('idle-mode-changed', this.idleState);
    log.info(`[IdleDiscipline] Woke up from ${previousMode}: ${reason}`);
  }

  private forceGC(): void {
    if (global.gc) {
      global.gc();
      log.debug('[IdleDiscipline] Forced garbage collection');
    }
  }

  // -------------------------------------------------------------------------
  // HEALTH REPORTS
  // -------------------------------------------------------------------------

  /**
   * Generate health report
   */
  generateHealthReport(hours: number = 24): HealthReport {
    const now = Date.now();
    const startTime = now - (hours * 60 * 60 * 1000);
    
    const relevantMetrics = this.metricsHistory.filter(m => m.timestamp > startTime);
    
    if (relevantMetrics.length === 0) {
      return this.emptyHealthReport(startTime, now);
    }

    // Calculate averages and peaks
    const memoryUsages = relevantMetrics.map(m => m.memory.heapUsed / 1024 / 1024);
    const cpuUsages = relevantMetrics.map(m => m.cpu.percentUsed);
    
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    const peakMemory = Math.max(...memoryUsages);
    const avgCPU = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length;
    const peakCPU = Math.max(...cpuUsages);
    
    // Calculate idle percentage
    const idleMetrics = relevantMetrics.filter(m => m.cpu.idle);
    const idlePercent = (idleMetrics.length / relevantMetrics.length) * 100;

    // Check for leaks
    const leakSuspected = this.memorySnapshots.length > 30 &&
      this.calculateMemoryTrend() === 'growing';

    // Get alerts
    const relevantAlerts = Array.from(this.alerts.values())
      .filter(a => a.timestamp > startTime);
    
    // Calculate health score
    let healthScore = 100;
    if (avgMemory > this.thresholds.memory.maxHeapMB * 0.7) healthScore -= 20;
    if (peakMemory > this.thresholds.memory.maxHeapMB) healthScore -= 15;
    if (avgCPU > this.thresholds.cpu.highThresholdPercent) healthScore -= 15;
    if (leakSuspected) healthScore -= 25;
    if (relevantAlerts.filter(a => a.severity === 'critical').length > 0) healthScore -= 20;
    
    healthScore = Math.max(0, healthScore);

    // Determine overall health
    let overallHealth: HealthReport['overallHealth'];
    if (healthScore >= 80) overallHealth = 'excellent';
    else if (healthScore >= 60) overallHealth = 'good';
    else if (healthScore >= 40) overallHealth = 'fair';
    else overallHealth = 'poor';

    // Generate recommendations
    const recommendations: HealthReport['recommendations'] = [];
    
    if (avgMemory > this.thresholds.memory.maxHeapMB * 0.5) {
      recommendations.push({
        type: 'memory',
        description: 'Consider closing unused tabs or clearing caches',
        priority: avgMemory > this.thresholds.memory.maxHeapMB * 0.7 ? 'high' : 'medium',
      });
    }
    
    if (leakSuspected) {
      recommendations.push({
        type: 'memory',
        description: 'Memory usage trending upward - restart recommended',
        priority: 'high',
      });
    }
    
    if (idlePercent < 30) {
      recommendations.push({
        type: 'performance',
        description: 'App rarely reaching idle state - check for background tasks',
        priority: 'medium',
      });
    }

    return {
      generatedAt: now,
      period: {
        start: startTime,
        end: now,
        durationHours: hours,
      },
      overallHealth,
      healthScore,
      memory: {
        averageUsedMB: avgMemory,
        peakUsedMB: peakMemory,
        leakSuspected,
        gcEfficiency: this.calculateGCEfficiency(relevantMetrics),
      },
      cpu: {
        averagePercent: avgCPU,
        peakPercent: peakCPU,
        idlePercent,
      },
      stability: {
        crashes: 0,
        hangs: 0,
        errors: relevantAlerts.filter(a => a.severity === 'critical').length,
        autoRecoveries: relevantAlerts.filter(a => a.autoResolved).length,
      },
      recommendations,
    };
  }

  /**
   * Compute GC efficiency from metrics: ratio of freed memory to total heap allocation.
   * A high ratio means GC is effectively reclaiming memory.
   */
  private calculateGCEfficiency(metrics: any[]): number {
    if (metrics.length < 2) return 1;

    const heapUsages = metrics.map(m => m.memory.heapUsed / 1024 / 1024);
    const heapTotals = metrics.map(m => m.memory.heapTotal / 1024 / 1024);

    // Average ratio of free heap to total heap 
    let freeRatioSum = 0;
    for (let i = 0; i < heapUsages.length; i++) {
      const total = heapTotals[i] || 1;
      freeRatioSum += 1 - (heapUsages[i] / total);
    }
    const avgFreeRatio = freeRatioSum / heapUsages.length;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, avgFreeRatio));
  }

  private emptyHealthReport(start: number, end: number): HealthReport {
    return {
      generatedAt: end,
      period: { start, end, durationHours: (end - start) / (60 * 60 * 1000) },
      overallHealth: 'good',
      healthScore: 100,
      memory: { averageUsedMB: 0, peakUsedMB: 0, leakSuspected: false, gcEfficiency: 1 },
      cpu: { averagePercent: 0, peakPercent: 0, idlePercent: 100 },
      stability: { crashes: 0, hangs: 0, errors: 0, autoRecoveries: 0 },
      recommendations: [],
    };
  }

  private saveMetrics(): void {
    try {
      const metricsPath = path.join(this.dataPath, 'metrics.json');
      fs.writeFileSync(metricsPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        metrics: this.metricsHistory.slice(-100),  // Keep last 100
      }, null, 2));
    } catch (error) {
      log.error('[IdleDiscipline] Failed to save metrics:', error);
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getIdleState(): IdleState {
    return { ...this.idleState };
  }

  getCurrentMetrics(): HealthMetrics | null {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1] 
      : null;
  }

  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values())
      .filter(a => !a.acknowledged && !a.autoResolved);
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;
    
    alert.acknowledged = true;
    return true;
  }

  getThresholds(): HealthThresholds {
    return { ...this.thresholds };
  }

  updateThresholds(updates: Partial<HealthThresholds>): HealthThresholds {
    this.thresholds = {
      ...this.thresholds,
      ...updates,
      memory: { ...this.thresholds.memory, ...updates.memory },
      cpu: { ...this.thresholds.cpu, ...updates.cpu },
      idle: { ...this.thresholds.idle, ...updates.idle },
    };
    return this.thresholds;
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Activity
    ipcMain.handle('health:recordActivity', () => {
      this.recordActivity();
      return true;
    });

    // Metrics
    ipcMain.handle('health:getCurrentMetrics', () => this.getCurrentMetrics());
    ipcMain.handle('health:getIdleState', () => this.getIdleState());

    // Alerts
    ipcMain.handle('health:getActiveAlerts', () => this.getActiveAlerts());
    ipcMain.handle('health:acknowledgeAlert', (_, alertId) => this.acknowledgeAlert(alertId));

    // Reports
    ipcMain.handle('health:generateReport', (_, hours) => this.generateHealthReport(hours));

    // Thresholds
    ipcMain.handle('health:getThresholds', () => this.getThresholds());
    ipcMain.handle('health:updateThresholds', (_, updates) => this.updateThresholds(updates));

    // Manual controls
    ipcMain.handle('health:forceGC', () => {
      this.forceGC();
      return true;
    });
  }
}

// Singleton instance
export const idleDisciplineManager = new IdleDisciplineManagerClass();

export async function initializeIdleDiscipline(): Promise<void> {
  return idleDisciplineManager.initialize();
}

export function shutdownIdleDiscipline(): void {
  idleDisciplineManager.shutdown();
}
