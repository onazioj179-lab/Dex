// ═══════════════════════════════════════════════════════════════════════════
// DEX - Backend Observability System
// Phase 28: Backend Architecture Refinement
// Execution timelines, task durations, queue depth, resource usage
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { ipcMain } from 'electron';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface MetricStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface TimelineEvent {
  id: string;
  name: string;
  category: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  parent?: string;
  children?: string[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface PerformanceSnapshot {
  timestamp: number;
  cpu: {
    user: number;
    system: number;
    percent: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  eventLoop: {
    lag: number;
    utilization: number;
  };
  tasks: {
    queued: number;
    running: number;
    completed: number;
  };
}

export interface SubsystemMetrics {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: Record<string, number>;
  lastUpdated: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVABILITY CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ObservabilityClass extends EventEmitter {
  // Metrics storage
  private metrics: Map<string, Metric[]> = new Map();
  private maxMetricsPerKey = 1000;
  
  // Timeline events
  private timeline: Map<string, TimelineEvent> = new Map();
  private maxTimelineEvents = 500;
  private timelineOrder: string[] = [];
  
  // Performance snapshots
  private snapshots: PerformanceSnapshot[] = [];
  private maxSnapshots = 120; // 2 minutes at 1s intervals
  
  // Subsystem metrics
  private subsystems: Map<string, SubsystemMetrics> = new Map();
  
  // Histogram buckets for common operations
  private histogramBuckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  
  // Intervals
  private snapshotInterval: NodeJS.Timeout | null = null;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();
  
  // Event loop monitoring
  private eventLoopStart = Date.now();
  
  // Persistence
  private metricsPath: string;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.metricsPath = path.join(app.getPath('userData'), 'metrics.json');
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    // Collect snapshots every second
    this.snapshotInterval = setInterval(() => {
      this.collectSnapshot();
    }, 1000);
    
    log.info('[Observability] Started');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    
    // Persist metrics
    this.persistMetrics();
    
    log.info('[Observability] Stopped');
    this.emit('stopped');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record a counter metric (always increments)
   */
  counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: 'counter',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a gauge metric (can go up or down)
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a histogram value (for distribution analysis)
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: 'histogram',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Start a timer and return a stop function
   */
  timer(name: string, labels?: Record<string, string>): () => number {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      this.recordMetric({
        name,
        type: 'timer',
        value: duration,
        labels,
        timestamp: Date.now(),
      });
      return duration;
    };
  }

  /**
   * Measure async operation duration
   */
  async measure<T>(
    name: string,
    operation: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const stop = this.timer(name, labels);
    try {
      return await operation();
    } finally {
      stop();
    }
  }

  private recordMetric(metric: Metric): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }
    
    const metrics = this.metrics.get(metric.name)!;
    metrics.push(metric);
    
    // Limit storage
    while (metrics.length > this.maxMetricsPerKey) {
      metrics.shift();
    }
    
    this.emit('metricRecorded', metric);
  }

  /**
   * Get metrics for a name
   */
  getMetrics(name: string, options?: {
    since?: number;
    limit?: number;
  }): Metric[] {
    let metrics = this.metrics.get(name) ?? [];
    
    if (options?.since) {
      metrics = metrics.filter(m => m.timestamp >= options.since!);
    }
    
    if (options?.limit) {
      metrics = metrics.slice(-options.limit);
    }
    
    return [...metrics];
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Calculate statistics for a metric
   */
  getMetricStats(name: string): MetricStats | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    
    return {
      count,
      min: values[0],
      max: values[count - 1],
      avg: values.reduce((a, b) => a + b, 0) / count,
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TIMELINE EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a timeline event
   */
  startEvent(
    name: string,
    category: string,
    options?: {
      id?: string;
      parent?: string;
      metadata?: Record<string, any>;
    }
  ): string {
    const id = options?.id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const event: TimelineEvent = {
      id,
      name,
      category,
      startTime: Date.now(),
      metadata: options?.metadata,
      parent: options?.parent,
      children: [],
      status: 'running',
    };
    
    this.timeline.set(id, event);
    this.timelineOrder.push(id);
    
    // Link to parent
    if (options?.parent) {
      const parent = this.timeline.get(options.parent);
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(id);
      }
    }
    
    // Cleanup old events
    while (this.timelineOrder.length > this.maxTimelineEvents) {
      const oldId = this.timelineOrder.shift()!;
      this.timeline.delete(oldId);
    }
    
    this.emit('eventStarted', event);
    return id;
  }

  /**
   * End a timeline event
   */
  endEvent(id: string, status: 'completed' | 'failed' | 'cancelled' = 'completed'): void {
    const event = this.timeline.get(id);
    if (!event) return;
    
    event.endTime = Date.now();
    event.duration = event.endTime - event.startTime;
    event.status = status;
    
    // Record as timer metric
    this.recordMetric({
      name: `event.${event.category}.${event.name}`,
      type: 'timer',
      value: event.duration,
      timestamp: event.endTime,
    });
    
    this.emit('eventEnded', event);
  }

  /**
   * Get timeline events
   */
  getTimeline(options?: {
    category?: string;
    since?: number;
    limit?: number;
  }): TimelineEvent[] {
    let events = Array.from(this.timeline.values());
    
    if (options?.category) {
      events = events.filter(e => e.category === options.category);
    }
    
    if (options?.since) {
      events = events.filter(e => e.startTime >= options.since!);
    }
    
    // Sort by start time descending
    events.sort((a, b) => b.startTime - a.startTime);
    
    if (options?.limit) {
      events = events.slice(0, options.limit);
    }
    
    return events;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERFORMANCE SNAPSHOTS
  // ─────────────────────────────────────────────────────────────────────────

  private collectSnapshot(): void {
    const now = Date.now();
    
    // Calculate CPU usage
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    const cpuElapsed = now - this.lastCpuTime;
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000 / cpuElapsed) * 100;
    
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;
    
    // Memory
    const memoryUsage = process.memoryUsage();
    
    // Event loop lag (rough estimate)
    const eventLoopLag = this.measureEventLoopLag();
    
    const snapshot: PerformanceSnapshot = {
      timestamp: now,
      cpu: {
        user: cpuUsage.user / 1000,
        system: cpuUsage.system / 1000,
        percent: Math.min(100, cpuPercent),
      },
      memory: {
        heapUsed: memoryUsage.heapUsed / (1024 * 1024),
        heapTotal: memoryUsage.heapTotal / (1024 * 1024),
        external: memoryUsage.external / (1024 * 1024),
        rss: memoryUsage.rss / (1024 * 1024),
      },
      eventLoop: {
        lag: eventLoopLag,
        utilization: Math.min(100, cpuPercent),
      },
      tasks: {
        queued: 0, // To be filled by scheduler integration
        running: 0,
        completed: 0,
      },
    };
    
    this.snapshots.push(snapshot);
    
    // Limit storage
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    
    // Record as metrics
    this.gauge('cpu.percent', snapshot.cpu.percent);
    this.gauge('memory.heap_used_mb', snapshot.memory.heapUsed);
    this.gauge('memory.rss_mb', snapshot.memory.rss);
    this.gauge('event_loop.lag_ms', snapshot.eventLoop.lag);
    
    this.emit('snapshotCollected', snapshot);
  }

  private measureEventLoopLag(): number {
    const expectedInterval = 1000;
    const now = Date.now();
    const actual = now - this.eventLoopStart;
    this.eventLoopStart = now;
    
    return Math.max(0, actual - expectedInterval);
  }

  /**
   * Get performance snapshots
   */
  getSnapshots(options?: {
    since?: number;
    limit?: number;
  }): PerformanceSnapshot[] {
    let snapshots = [...this.snapshots];
    
    if (options?.since) {
      snapshots = snapshots.filter(s => s.timestamp >= options.since!);
    }
    
    if (options?.limit) {
      snapshots = snapshots.slice(-options.limit);
    }
    
    return snapshots;
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): PerformanceSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBSYSTEM METRICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register subsystem metrics
   */
  registerSubsystem(name: string): void {
    this.subsystems.set(name, {
      name,
      status: 'healthy',
      metrics: {},
      lastUpdated: Date.now(),
    });
  }

  /**
   * Update subsystem metrics
   */
  updateSubsystem(
    name: string,
    metrics: Record<string, number>,
    status?: 'healthy' | 'degraded' | 'unhealthy'
  ): void {
    const subsystem = this.subsystems.get(name);
    if (!subsystem) {
      this.registerSubsystem(name);
    }
    
    const updated = this.subsystems.get(name)!;
    updated.metrics = { ...updated.metrics, ...metrics };
    updated.lastUpdated = Date.now();
    if (status) updated.status = status;
    
    // Record as metrics
    for (const [key, value] of Object.entries(metrics)) {
      this.gauge(`subsystem.${name}.${key}`, value);
    }
  }

  /**
   * Get subsystem metrics
   */
  getSubsystemMetrics(name?: string): SubsystemMetrics[] {
    if (name) {
      const subsystem = this.subsystems.get(name);
      return subsystem ? [subsystem] : [];
    }
    return Array.from(this.subsystems.values());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a performance report
   */
  generateReport(): {
    generatedAt: number;
    uptime: number;
    snapshots: PerformanceSnapshot[];
    subsystems: SubsystemMetrics[];
    topMetrics: Array<{ name: string; stats: MetricStats | null }>;
    recentEvents: TimelineEvent[];
    health: 'excellent' | 'good' | 'degraded' | 'critical';
  } {
    const latestSnapshot = this.getLatestSnapshot();
    
    // Determine overall health
    let health: 'excellent' | 'good' | 'degraded' | 'critical' = 'excellent';
    if (latestSnapshot) {
      if (latestSnapshot.memory.heapUsed > 400 || latestSnapshot.eventLoop.lag > 200) {
        health = 'critical';
      } else if (latestSnapshot.memory.heapUsed > 300 || latestSnapshot.eventLoop.lag > 100) {
        health = 'degraded';
      } else if (latestSnapshot.memory.heapUsed > 200 || latestSnapshot.eventLoop.lag > 50) {
        health = 'good';
      }
    }
    
    // Check subsystem health
    for (const subsystem of this.subsystems.values()) {
      if (subsystem.status === 'unhealthy' && health !== 'critical') {
        health = 'degraded';
      }
    }
    
    return {
      generatedAt: Date.now(),
      uptime: process.uptime() * 1000,
      snapshots: this.getSnapshots({ limit: 60 }),
      subsystems: this.getSubsystemMetrics(),
      topMetrics: this.getMetricNames()
        .slice(0, 10)
        .map(name => ({ name, stats: this.getMetricStats(name) }))
        .filter(m => m.stats !== null),
      recentEvents: this.getTimeline({ limit: 20 }),
      health,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    ipcMain.handle('observability:getSnapshots', (_, options) => 
      this.getSnapshots(options)
    );
    
    ipcMain.handle('observability:getMetrics', (_, name, options) =>
      this.getMetrics(name, options)
    );
    
    ipcMain.handle('observability:getMetricStats', (_, name) =>
      this.getMetricStats(name)
    );
    
    ipcMain.handle('observability:getTimeline', (_, options) =>
      this.getTimeline(options)
    );
    
    ipcMain.handle('observability:getSubsystems', (_, name) =>
      this.getSubsystemMetrics(name)
    );
    
    ipcMain.handle('observability:generateReport', () =>
      this.generateReport()
    );
    
    log.info('[Observability] IPC handlers registered');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  private persistMetrics(): void {
    try {
      // Only persist recent metrics
      const cutoff = Date.now() - 3600000; // Last hour
      const toSave: Record<string, Metric[]> = {};
      
      for (const [name, metrics] of this.metrics) {
        const recent = metrics.filter(m => m.timestamp >= cutoff);
        if (recent.length > 0) {
          toSave[name] = recent;
        }
      }
      
      fs.writeFileSync(this.metricsPath, JSON.stringify(toSave, null, 2));
      log.debug('[Observability] Metrics persisted');
    } catch (e) {
      log.warn('[Observability] Failed to persist metrics:', e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const observability = new ObservabilityClass();
export default observability;
