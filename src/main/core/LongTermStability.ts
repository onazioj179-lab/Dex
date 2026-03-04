// =============================================================================
// DEX - Long-Term Stability: Operation guarantees and health monitoring
// Ensures stable operation for 168+ hours (1 week) continuous use
// =============================================================================

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// =============================================================================
// LONG-TERM STABILITY TARGETS
// =============================================================================

export const STABILITY_TARGETS = {
  // Session duration
  MIN_CONTINUOUS_HOURS: 168,        // 1 week minimum
  TARGET_CONTINUOUS_HOURS: 720,     // 30 days target
  
  // Memory stability
  MAX_MEMORY_DRIFT_PER_HOUR: 0.5,   // 0.5 MB per hour max drift
  MEMORY_RESET_THRESHOLD: 450,       // Reset if heap exceeds 450MB
  
  // Error tolerance
  MAX_ERRORS_PER_HOUR: 10,          // Max 10 recoverable errors/hour
  MAX_CRITICAL_ERRORS_PER_DAY: 3,   // Max 3 critical errors/day
  
  // Performance stability
  MAX_FPS_VARIANCE: 5,              // Max 5 FPS variance from target
  MAX_LATENCY_VARIANCE: 2,          // Max 2ms latency variance
  
  // Uptime requirements
  MIN_UPTIME_PERCENT: 99.9,         // 99.9% uptime minimum
};

// =============================================================================
// HEALTH METRICS
// =============================================================================

interface HealthSnapshot {
  timestamp: number;
  heapUsedMB: number;
  cpuPercent: number;
  fps: number;
  errorCount: number;
  criticalErrorCount: number;
  uptimeMs: number;
}

interface StabilityReport {
  sessionStart: number;
  sessionDurationHours: number;
  currentHeapMB: number;
  memoryDriftPerHour: number;
  errorsPerHour: number;
  criticalErrorsToday: number;
  avgFps: number;
  fpsVariance: number;
  uptimePercent: number;
  isStable: boolean;
  issues: string[];
  recommendations: string[];
}

// =============================================================================
// MEMORY GUARDIAN
// =============================================================================

class MemoryGuardian {
  private snapshots: Array<{ timestamp: number; heapMB: number }> = [];
  private readonly MAX_SNAPSHOTS = 168; // 1 per hour for 1 week
  private baselineHeap = 0;
  
  constructor() {
    this.captureBaseline();
  }
  
  private captureBaseline(): void {
    const mem = process.memoryUsage();
    this.baselineHeap = mem.heapUsed / 1024 / 1024;
  }
  
  recordSnapshot(): void {
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    
    this.snapshots.push({
      timestamp: Date.now(),
      heapMB,
    });
    
    // Keep only needed snapshots
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }
  
  getMemoryDriftPerHour(): number {
    if (this.snapshots.length < 2) return 0;
    
    const oldest = this.snapshots[0];
    const newest = this.snapshots[this.snapshots.length - 1];
    
    const hoursElapsed = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
    if (hoursElapsed < 0.1) return 0;
    
    const memoryDiff = newest.heapMB - oldest.heapMB;
    return memoryDiff / hoursElapsed;
  }
  
  isMemoryStable(): boolean {
    const drift = this.getMemoryDriftPerHour();
    return drift < STABILITY_TARGETS.MAX_MEMORY_DRIFT_PER_HOUR;
  }
  
  needsMemoryReset(): boolean {
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    return heapMB > STABILITY_TARGETS.MEMORY_RESET_THRESHOLD;
  }
  
  getStats(): {
    baselineMB: number;
    currentMB: number;
    driftPerHour: number;
    isStable: boolean;
    needsReset: boolean;
  } {
    const mem = process.memoryUsage();
    const currentMB = mem.heapUsed / 1024 / 1024;
    
    return {
      baselineMB: this.baselineHeap,
      currentMB,
      driftPerHour: this.getMemoryDriftPerHour(),
      isStable: this.isMemoryStable(),
      needsReset: this.needsMemoryReset(),
    };
  }
}

// =============================================================================
// ERROR TRACKER
// =============================================================================

class ErrorTracker {
  private errors: Array<{ timestamp: number; critical: boolean; message: string }> = [];
  private readonly RETENTION_HOURS = 24;
  
  recordError(message: string, critical = false): void {
    this.errors.push({
      timestamp: Date.now(),
      critical,
      message,
    });
    
    this.cleanOldErrors();
  }
  
  private cleanOldErrors(): void {
    const cutoff = Date.now() - this.RETENTION_HOURS * 60 * 60 * 1000;
    this.errors = this.errors.filter(e => e.timestamp > cutoff);
  }
  
  getErrorsPerHour(): number {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recentErrors = this.errors.filter(e => e.timestamp > hourAgo);
    return recentErrors.length;
  }
  
  getCriticalErrorsToday(): number {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return this.errors.filter(e => e.timestamp > dayAgo && e.critical).length;
  }
  
  isWithinLimits(): boolean {
    return (
      this.getErrorsPerHour() < STABILITY_TARGETS.MAX_ERRORS_PER_HOUR &&
      this.getCriticalErrorsToday() < STABILITY_TARGETS.MAX_CRITICAL_ERRORS_PER_DAY
    );
  }
  
  getRecentErrors(count = 10): Array<{ timestamp: number; critical: boolean; message: string }> {
    return this.errors.slice(-count);
  }
}

// =============================================================================
// PERFORMANCE TRACKER
// =============================================================================

class PerformanceTracker {
  private fpsHistory: number[] = [];
  private latencyHistory: number[] = [];
  private readonly HISTORY_SIZE = 60; // Last 60 samples
  
  recordFps(fps: number): void {
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > this.HISTORY_SIZE) {
      this.fpsHistory.shift();
    }
  }
  
  recordLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.HISTORY_SIZE) {
      this.latencyHistory.shift();
    }
  }
  
  getAverageFps(): number {
    if (this.fpsHistory.length === 0) return 60;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }
  
  getFpsVariance(): number {
    if (this.fpsHistory.length < 2) return 0;
    
    const avg = this.getAverageFps();
    const squaredDiffs = this.fpsHistory.map(fps => Math.pow(fps - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    return Math.sqrt(variance);
  }
  
  getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
  }
  
  getLatencyVariance(): number {
    if (this.latencyHistory.length < 2) return 0;
    
    const avg = this.getAverageLatency();
    const squaredDiffs = this.latencyHistory.map(l => Math.pow(l - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    return Math.sqrt(variance);
  }
  
  isPerformanceStable(): boolean {
    return (
      this.getFpsVariance() < STABILITY_TARGETS.MAX_FPS_VARIANCE &&
      this.getLatencyVariance() < STABILITY_TARGETS.MAX_LATENCY_VARIANCE
    );
  }
}

// =============================================================================
// UPTIME TRACKER
// =============================================================================

class UptimeTracker {
  private sessionStart = Date.now();
  private downtimeMs = 0;
  private lastCheck = Date.now();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 1000;
  
  constructor() {
    this.startTracking();
  }
  
  private startTracking(): void {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastCheck;
      
      // If more than 5 seconds between checks, count as downtime
      if (elapsed > 5000) {
        this.downtimeMs += elapsed - this.CHECK_INTERVAL_MS;
      }
      
      this.lastCheck = now;
    }, this.CHECK_INTERVAL_MS);
  }
  
  recordDowntime(durationMs: number): void {
    this.downtimeMs += durationMs;
  }
  
  getSessionDurationMs(): number {
    return Date.now() - this.sessionStart;
  }
  
  getSessionDurationHours(): number {
    return this.getSessionDurationMs() / (1000 * 60 * 60);
  }
  
  getUptimeMs(): number {
    return this.getSessionDurationMs() - this.downtimeMs;
  }
  
  getUptimePercent(): number {
    const total = this.getSessionDurationMs();
    if (total === 0) return 100;
    return (this.getUptimeMs() / total) * 100;
  }
  
  isUptimeSufficient(): boolean {
    return this.getUptimePercent() >= STABILITY_TARGETS.MIN_UPTIME_PERCENT;
  }
  
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// =============================================================================
// LONG-TERM STABILITY MANAGER
// =============================================================================

export class LongTermStabilityManager extends EventEmitter {
  private memoryGuardian = new MemoryGuardian();
  private errorTracker = new ErrorTracker();
  private performanceTracker = new PerformanceTracker();
  private uptimeTracker = new UptimeTracker();
  
  private healthSnapshots: HealthSnapshot[] = [];
  private snapshotInterval: NodeJS.Timeout | null = null;
  private readonly SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  
  private persistPath: string;
  
  constructor() {
    super();
    this.persistPath = path.join(app.getPath('userData'), 'stability-data.json');
    this.loadPersistedData();
    this.startMonitoring();
  }
  
  private loadPersistedData(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        // Only restore recent snapshots (last 24 hours)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this.healthSnapshots = (parsed.healthSnapshots || [])
          .filter((s: HealthSnapshot) => s.timestamp > cutoff);
      }
    } catch (err) {
      console.error('[LongTermStability] Failed to load persisted data:', err);
    }
  }
  
  private persistData(): void {
    try {
      const data = {
        healthSnapshots: this.healthSnapshots,
        timestamp: Date.now(),
      };
      
      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[LongTermStability] Failed to persist data:', err);
    }
  }
  
  private startMonitoring(): void {
    // Record snapshot every hour
    this.snapshotInterval = setInterval(() => {
      this.recordHealthSnapshot();
      this.memoryGuardian.recordSnapshot();
      this.checkStability();
      this.persistData();
    }, this.SNAPSHOT_INTERVAL_MS);
    
    // Record initial snapshot
    this.recordHealthSnapshot();
  }
  
  private recordHealthSnapshot(): void {
    const mem = process.memoryUsage();
    
    const snapshot: HealthSnapshot = {
      timestamp: Date.now(),
      heapUsedMB: mem.heapUsed / 1024 / 1024,
      cpuPercent: 0, // Would need OS-level monitoring
      fps: this.performanceTracker.getAverageFps(),
      errorCount: this.errorTracker.getErrorsPerHour(),
      criticalErrorCount: this.errorTracker.getCriticalErrorsToday(),
      uptimeMs: this.uptimeTracker.getUptimeMs(),
    };
    
    this.healthSnapshots.push(snapshot);
    
    // Keep only last 168 snapshots (1 week of hourly snapshots)
    if (this.healthSnapshots.length > 168) {
      this.healthSnapshots.shift();
    }
  }
  
  private checkStability(): void {
    const report = this.getStabilityReport();
    
    if (!report.isStable) {
      this.emit('stability:warning', report);
      
      // Check for critical issues
      if (report.memoryDriftPerHour > STABILITY_TARGETS.MAX_MEMORY_DRIFT_PER_HOUR * 2) {
        this.emit('stability:critical', {
          type: 'memory_leak',
          message: 'Severe memory drift detected',
          report,
        });
      }
      
      if (report.criticalErrorsToday >= STABILITY_TARGETS.MAX_CRITICAL_ERRORS_PER_DAY) {
        this.emit('stability:critical', {
          type: 'error_threshold',
          message: 'Critical error threshold reached',
          report,
        });
      }
    }
  }
  
  // Record metrics
  recordError(message: string, critical = false): void {
    this.errorTracker.recordError(message, critical);
    
    if (critical) {
      this.emit('error:critical', { message, timestamp: Date.now() });
    }
  }
  
  recordFps(fps: number): void {
    this.performanceTracker.recordFps(fps);
  }
  
  recordLatency(latencyMs: number): void {
    this.performanceTracker.recordLatency(latencyMs);
  }
  
  recordDowntime(durationMs: number): void {
    this.uptimeTracker.recordDowntime(durationMs);
  }
  
  // Get comprehensive stability report
  getStabilityReport(): StabilityReport {
    const memStats = this.memoryGuardian.getStats();
    const errorsPerHour = this.errorTracker.getErrorsPerHour();
    const criticalErrorsToday = this.errorTracker.getCriticalErrorsToday();
    const avgFps = this.performanceTracker.getAverageFps();
    const fpsVariance = this.performanceTracker.getFpsVariance();
    const uptimePercent = this.uptimeTracker.getUptimePercent();
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check memory
    if (!memStats.isStable) {
      issues.push(`Memory drift: ${memStats.driftPerHour.toFixed(2)} MB/hour`);
      recommendations.push('Investigate potential memory leaks');
    }
    
    if (memStats.needsReset) {
      issues.push(`High memory usage: ${memStats.currentMB.toFixed(0)} MB`);
      recommendations.push('Consider restarting to reset memory');
    }
    
    // Check errors
    if (errorsPerHour >= STABILITY_TARGETS.MAX_ERRORS_PER_HOUR) {
      issues.push(`High error rate: ${errorsPerHour} errors/hour`);
      recommendations.push('Review error logs for patterns');
    }
    
    if (criticalErrorsToday >= STABILITY_TARGETS.MAX_CRITICAL_ERRORS_PER_DAY) {
      issues.push(`Critical errors today: ${criticalErrorsToday}`);
      recommendations.push('Investigate critical error sources');
    }
    
    // Check performance
    if (!this.performanceTracker.isPerformanceStable()) {
      issues.push(`Performance variance: FPS ±${fpsVariance.toFixed(1)}`);
      recommendations.push('Check for performance-heavy operations');
    }
    
    // Check uptime
    if (!this.uptimeTracker.isUptimeSufficient()) {
      issues.push(`Uptime below target: ${uptimePercent.toFixed(2)}%`);
      recommendations.push('Investigate causes of downtime');
    }
    
    const isStable = (
      memStats.isStable &&
      !memStats.needsReset &&
      this.errorTracker.isWithinLimits() &&
      this.performanceTracker.isPerformanceStable() &&
      this.uptimeTracker.isUptimeSufficient()
    );
    
    return {
      sessionStart: this.healthSnapshots[0]?.timestamp || Date.now(),
      sessionDurationHours: this.uptimeTracker.getSessionDurationHours(),
      currentHeapMB: memStats.currentMB,
      memoryDriftPerHour: memStats.driftPerHour,
      errorsPerHour,
      criticalErrorsToday,
      avgFps,
      fpsVariance,
      uptimePercent,
      isStable,
      issues,
      recommendations,
    };
  }
  
  // Get recent health snapshots
  getHealthHistory(): HealthSnapshot[] {
    return [...this.healthSnapshots];
  }
  
  // Get recent errors
  getRecentErrors(count = 10): Array<{ timestamp: number; critical: boolean; message: string }> {
    return this.errorTracker.getRecentErrors(count);
  }
  
  // Shutdown
  shutdown(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    
    this.uptimeTracker.stop();
    this.persistData();
  }
}

// Singleton instance
export const longTermStability = new LongTermStabilityManager();
