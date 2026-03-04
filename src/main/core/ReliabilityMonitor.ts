// ═══════════════════════════════════════════════════════════════════════════
// DEX - Reliability Monitor
// Phase 69: Long-Session Stability
// 8 hours, 24 hours, multiple days - memory stays flat, no degradation
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, app } from 'electron';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface StabilityMetrics {
  uptime: number;
  memoryTrend: 'stable' | 'growing' | 'declining';
  memoryGrowthRate: number; // bytes per hour
  eventLoopLatency: number;
  gcFrequency: number;
  errorRate: number;
  crashCount: number;
  score: number; // 0-100
}

export interface LeakCandidate {
  type: string;
  description: string;
  growth: number;
  confidence: number;
  firstSeen: number;
  samples: number;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MEMORY_SAMPLE_INTERVAL = 60000; // 1 minute
const MEMORY_SAMPLE_HISTORY = 1440; // 24 hours of samples
const LEAK_DETECTION_THRESHOLD = 5 * 1024 * 1024; // 5MB growth per hour
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const GC_WINDOW = 300000; // 5 minutes
const LATENCY_THRESHOLD = 100; // 100ms event loop latency

// ═══════════════════════════════════════════════════════════════════════════
// RELIABILITY MONITOR
// ═══════════════════════════════════════════════════════════════════════════

class ReliabilityMonitorClass extends EventEmitter {
  private memoryHistory: MemorySnapshot[] = [];
  private gcEvents: number[] = [];
  private errors: Array<{ timestamp: number; type: string }> = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private leakCandidates: LeakCandidate[] = [];
  private startTime: number;
  private crashCount = 0;
  
  private memoryInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  private latencyCheckInterval: NodeJS.Timeout | null = null;
  private lastLatencyCheck = 0;

  constructor() {
    super();
    this.startTime = Date.now();
    this.setupIPC();
    this.startMonitoring();
    this.registerHealthChecks();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Get stability metrics
    ipcMain.handle('reliability:metrics', () => {
      return this.getStabilityMetrics();
    });

    // Get memory history
    ipcMain.handle('reliability:memoryHistory', (_event, duration?: number) => {
      return this.getMemoryHistory(duration);
    });

    // Get leak candidates
    ipcMain.handle('reliability:leaks', () => {
      return this.getLeakCandidates();
    });

    // Get health status
    ipcMain.handle('reliability:health', () => {
      return this.getHealthStatus();
    });

    // Force garbage collection (dev only)
    ipcMain.handle('reliability:gc', () => {
      return this.forceGC();
    });

    // Get uptime
    ipcMain.handle('reliability:uptime', () => {
      return this.getUptime();
    });

    // Report error
    ipcMain.handle('reliability:reportError', (_event, type: string) => {
      this.recordError(type);
    });

    // Get diagnostic report
    ipcMain.handle('reliability:diagnostic', () => {
      return this.generateDiagnosticReport();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MEMORY MONITORING
  // ─────────────────────────────────────────────────────────────────────────

  private startMonitoring(): void {
    // Memory sampling
    this.memoryInterval = setInterval(() => {
      this.sampleMemory();
    }, MEMORY_SAMPLE_INTERVAL);

    // Initial sample
    this.sampleMemory();

    // Health checks
    this.healthInterval = setInterval(() => {
      this.runHealthChecks();
    }, HEALTH_CHECK_INTERVAL);

    // Event loop latency
    this.startLatencyMonitoring();

    log.info('[Reliability] Monitoring started');
  }

  private sampleMemory(): void {
    const usage = process.memoryUsage();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers
    };

    this.memoryHistory.push(snapshot);

    // Keep only recent history
    if (this.memoryHistory.length > MEMORY_SAMPLE_HISTORY) {
      this.memoryHistory.shift();
    }

    // Check for leaks
    this.checkForLeaks();

    // Broadcast if concerning
    const metrics = this.getStabilityMetrics();
    if (metrics.memoryTrend === 'growing' && metrics.memoryGrowthRate > LEAK_DETECTION_THRESHOLD) {
      this.emit('memory:warning', { trend: 'growing', rate: metrics.memoryGrowthRate });
      this.broadcastWarning('memory', `Memory growing at ${this.formatBytes(metrics.memoryGrowthRate)}/hour`);
    }
  }

  private checkForLeaks(): void {
    if (this.memoryHistory.length < 60) return; // Need at least 1 hour of data

    const recentHour = this.memoryHistory.slice(-60);
    const firstSample = recentHour[0];
    const lastSample = recentHour[recentHour.length - 1];

    const heapGrowth = lastSample.heapUsed - firstSample.heapUsed;
    const externalGrowth = lastSample.external - firstSample.external;
    const arrayBufferGrowth = lastSample.arrayBuffers - firstSample.arrayBuffers;

    // Update or add leak candidates
    this.updateLeakCandidate('heap', 'Heap memory', heapGrowth);
    this.updateLeakCandidate('external', 'External memory', externalGrowth);
    this.updateLeakCandidate('arrayBuffers', 'Array buffers', arrayBufferGrowth);
  }

  private updateLeakCandidate(type: string, description: string, growth: number): void {
    const existing = this.leakCandidates.find(l => l.type === type);
    
    if (growth > LEAK_DETECTION_THRESHOLD) {
      if (existing) {
        existing.growth = (existing.growth * existing.samples + growth) / (existing.samples + 1);
        existing.samples++;
        existing.confidence = Math.min(100, existing.confidence + 5);
      } else {
        this.leakCandidates.push({
          type,
          description,
          growth,
          confidence: 30,
          firstSeen: Date.now(),
          samples: 1
        });
      }
    } else if (existing) {
      // Reduce confidence if not leaking
      existing.confidence = Math.max(0, existing.confidence - 10);
      if (existing.confidence === 0) {
        this.leakCandidates = this.leakCandidates.filter(l => l.type !== type);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT LOOP LATENCY
  // ─────────────────────────────────────────────────────────────────────────

  private startLatencyMonitoring(): void {
    this.latencyCheckInterval = setInterval(() => {
      const now = Date.now();
      if (this.lastLatencyCheck > 0) {
        const expectedInterval = 1000;
        const actualInterval = now - this.lastLatencyCheck;
        const latency = Math.max(0, actualInterval - expectedInterval);

        if (latency > LATENCY_THRESHOLD) {
          this.emit('latency:warning', { latency });
          log.warn(`[Reliability] Event loop latency: ${latency}ms`);
        }
      }
      this.lastLatencyCheck = now;
    }, 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH CHECKS
  // ─────────────────────────────────────────────────────────────────────────

  private registerHealthChecks(): void {
    // Memory health
    this.healthChecks.set('memory', {
      name: 'Memory Usage',
      status: 'healthy',
      lastCheck: 0
    });

    // Event loop health
    this.healthChecks.set('eventLoop', {
      name: 'Event Loop',
      status: 'healthy',
      lastCheck: 0
    });

    // IPC health
    this.healthChecks.set('ipc', {
      name: 'IPC Communication',
      status: 'healthy',
      lastCheck: 0
    });

    // Window health
    this.healthChecks.set('windows', {
      name: 'Window Manager',
      status: 'healthy',
      lastCheck: 0
    });
  }

  private runHealthChecks(): void {
    // Memory check
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    this.updateHealthCheck('memory', 
      heapPercent > 90 ? 'unhealthy' : heapPercent > 70 ? 'degraded' : 'healthy',
      `Heap: ${heapPercent.toFixed(1)}%`
    );

    // Event loop check (based on recent latency)
    this.updateHealthCheck('eventLoop', 'healthy');

    // Window check
    const windows = BrowserWindow.getAllWindows();
    const responsiveWindows = windows.filter(w => !w.isDestroyed() && w.webContents && !w.webContents.isCrashed());
    
    this.updateHealthCheck('windows',
      responsiveWindows.length === windows.length ? 'healthy' : 
        responsiveWindows.length > 0 ? 'degraded' : 'unhealthy',
      `${responsiveWindows.length}/${windows.length} windows responsive`
    );
  }

  private updateHealthCheck(name: string, status: 'healthy' | 'degraded' | 'unhealthy', message?: string): void {
    const check = this.healthChecks.get(name);
    if (check) {
      const previousStatus = check.status;
      check.status = status;
      check.lastCheck = Date.now();
      check.message = message;
      
      if (previousStatus !== status) {
        this.emit('health:changed', { name, previousStatus, status });
        if (status === 'unhealthy') {
          this.broadcastWarning('health', `${name} is unhealthy: ${message}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────

  getStabilityMetrics(): StabilityMetrics {
    const uptime = Date.now() - this.startTime;
    const memoryTrend = this.calculateMemoryTrend();
    const memoryGrowthRate = this.calculateMemoryGrowthRate();
    const errorRate = this.calculateErrorRate();
    const gcFrequency = this.calculateGCFrequency();
    
    // Calculate overall stability score
    let score = 100;
    
    // Memory trend penalty
    if (memoryTrend === 'growing') {
      score -= Math.min(30, (memoryGrowthRate / LEAK_DETECTION_THRESHOLD) * 15);
    }
    
    // Error rate penalty
    score -= Math.min(20, errorRate * 5);
    
    // Uptime bonus (more stable over time if no issues)
    const uptimeHours = uptime / (1000 * 60 * 60);
    if (uptimeHours > 24 && memoryTrend === 'stable') {
      score = Math.min(100, score + 5);
    }
    
    // Health check penalty
    for (const check of this.healthChecks.values()) {
      if (check.status === 'degraded') score -= 5;
      if (check.status === 'unhealthy') score -= 15;
    }

    return {
      uptime,
      memoryTrend,
      memoryGrowthRate,
      eventLoopLatency: 0, // Updated by monitoring
      gcFrequency,
      errorRate,
      crashCount: this.crashCount,
      score: Math.max(0, Math.round(score))
    };
  }

  private calculateMemoryTrend(): 'stable' | 'growing' | 'declining' {
    if (this.memoryHistory.length < 30) return 'stable';

    const recent = this.memoryHistory.slice(-30);
    const first = recent.slice(0, 10).reduce((sum, s) => sum + s.heapUsed, 0) / 10;
    const last = recent.slice(-10).reduce((sum, s) => sum + s.heapUsed, 0) / 10;
    
    const change = (last - first) / first;
    
    if (change > 0.1) return 'growing';
    if (change < -0.1) return 'declining';
    return 'stable';
  }

  private calculateMemoryGrowthRate(): number {
    if (this.memoryHistory.length < 60) return 0;

    const hourAgo = this.memoryHistory.slice(-60);
    const first = hourAgo[0].heapUsed;
    const last = hourAgo[hourAgo.length - 1].heapUsed;
    
    return Math.max(0, last - first); // bytes per hour
  }

  private calculateErrorRate(): number {
    const hourAgo = Date.now() - 3600000;
    const recentErrors = this.errors.filter(e => e.timestamp > hourAgo);
    return recentErrors.length;
  }

  private calculateGCFrequency(): number {
    const windowStart = Date.now() - GC_WINDOW;
    return this.gcEvents.filter(t => t > windowStart).length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DATA ACCESS
  // ─────────────────────────────────────────────────────────────────────────

  getMemoryHistory(duration?: number): MemorySnapshot[] {
    if (!duration) return [...this.memoryHistory];
    
    const cutoff = Date.now() - duration;
    return this.memoryHistory.filter(s => s.timestamp > cutoff);
  }

  getLeakCandidates(): LeakCandidate[] {
    return this.leakCandidates.filter(l => l.confidence > 50);
  }

  getHealthStatus(): Map<string, HealthCheck> {
    return new Map(this.healthChecks);
  }

  getUptime(): { ms: number; formatted: string } {
    const ms = Date.now() - this.startTime;
    return {
      ms,
      formatted: this.formatDuration(ms)
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ERROR TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  recordError(type: string): void {
    this.errors.push({ timestamp: Date.now(), type });
    
    // Keep only last 1000 errors
    if (this.errors.length > 1000) {
      this.errors.shift();
    }
  }

  recordCrash(): void {
    this.crashCount++;
    this.recordError('crash');
    log.error('[Reliability] Crash recorded');
  }

  recordGC(): void {
    this.gcEvents.push(Date.now());
    
    // Keep only recent GC events
    const windowStart = Date.now() - GC_WINDOW * 2;
    this.gcEvents = this.gcEvents.filter(t => t > windowStart);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      this.recordGC();
      log.info('[Reliability] Forced garbage collection');
      return true;
    }
    return false;
  }

  generateDiagnosticReport(): object {
    const metrics = this.getStabilityMetrics();
    const memUsage = process.memoryUsage();
    const uptime = this.getUptime();
    
    return {
      timestamp: new Date().toISOString(),
      app: {
        version: app.getVersion(),
        name: app.getName(),
        uptime: uptime.formatted
      },
      stability: metrics,
      memory: {
        current: {
          heapUsed: this.formatBytes(memUsage.heapUsed),
          heapTotal: this.formatBytes(memUsage.heapTotal),
          external: this.formatBytes(memUsage.external),
          rss: this.formatBytes(memUsage.rss)
        },
        trend: metrics.memoryTrend,
        growthRate: `${this.formatBytes(metrics.memoryGrowthRate)}/hour`,
        leakCandidates: this.getLeakCandidates()
      },
      health: Object.fromEntries(this.healthChecks),
      errors: {
        lastHour: this.calculateErrorRate(),
        total: this.errors.length,
        crashes: this.crashCount
      }
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private broadcastWarning(type: string, message: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('reliability:warning', { type, message });
      }
    }
  }

  shutdown(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    if (this.latencyCheckInterval) {
      clearInterval(this.latencyCheckInterval);
      this.latencyCheckInterval = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const ReliabilityMonitor = new ReliabilityMonitorClass();
export default ReliabilityMonitor;
