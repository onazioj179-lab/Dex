// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Process Scheduler and CPU Management
// ==========================================================================
// Feature 5:  QoS Scheduler (4 priority classes)
// Feature 6:  Efficiency-Aware Scheduling (CPU rolling windows)
// Feature 7:  Thermal Awareness (CPU temperature monitoring)
// Feature 8:  Background Suspension (15min idle)
// Feature 9:  Foreground Priority Boosting
// Feature 10: Work Stealing (idle threads pull from busy queues)
// ==========================================================================

import * as os from 'os';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QoSClass = 'user-interactive' | 'user-initiated' | 'utility' | 'background';

export interface ScheduledWork {
  id: string;
  qos: QoSClass;
  fn: () => Promise<void> | void;
  submittedAt: number;
  startedAt: number;
  deadline: number;
  cancelled: boolean;
}

export interface CpuSnapshot {
  timestamp: number;
  usagePercent: number;
  loadAvg1: number;
  thermalState: ThermalState;
}

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';

interface QoSQueueConfig {
  maxConcurrency: number;
  timeSliceMs: number;
  maxQueueDepth: number;
  starvationMs: number;
}

const QOS_CONFIGS: Record<QoSClass, QoSQueueConfig> = {
  'user-interactive': { maxConcurrency: 4, timeSliceMs: 16,   maxQueueDepth: 32,  starvationMs: 500 },
  'user-initiated':   { maxConcurrency: 3, timeSliceMs: 50,   maxQueueDepth: 64,  starvationMs: 2000 },
  'utility':          { maxConcurrency: 2, timeSliceMs: 200,  maxQueueDepth: 128, starvationMs: 10000 },
  'background':       { maxConcurrency: 1, timeSliceMs: 1000, maxQueueDepth: 256, starvationMs: 60000 },
};

// ---------------------------------------------------------------------------
// Feature 5: QoS Scheduler
// ---------------------------------------------------------------------------

class QoSQueue {
  private queue: ScheduledWork[] = [];
  private running = 0;
  private config: QoSQueueConfig;
  readonly qos: QoSClass;

  constructor(qos: QoSClass) {
    this.qos = qos;
    this.config = QOS_CONFIGS[qos];
  }

  enqueue(work: ScheduledWork): boolean {
    if (this.queue.length >= this.config.maxQueueDepth) {
      return false;
    }
    this.queue.push(work);
    return true;
  }

  dequeue(): ScheduledWork | null {
    if (this.queue.length === 0) return null;
    return this.queue.shift()!;
  }

  peek(): ScheduledWork | null {
    return this.queue[0] || null;
  }

  get length(): number { return this.queue.length; }
  get activeCount(): number { return this.running; }
  get maxConcurrency(): number { return this.config.maxConcurrency; }

  hasCapacity(): boolean {
    return this.running < this.config.maxConcurrency;
  }

  markStarted(): void { this.running++; }
  markFinished(): void { this.running = Math.max(0, this.running - 1); }

  getStarvedItems(now: number): ScheduledWork[] {
    return this.queue.filter(w => (now - w.submittedAt) > this.config.starvationMs);
  }

  setThrottledConcurrency(factor: number): void {
    this.config = {
      ...QOS_CONFIGS[this.qos],
      maxConcurrency: Math.max(1, Math.floor(QOS_CONFIGS[this.qos].maxConcurrency * factor)),
    };
  }

  restoreConcurrency(): void {
    this.config = { ...QOS_CONFIGS[this.qos] };
  }
}

// ---------------------------------------------------------------------------
// Feature 6: CPU Rolling Window
// ---------------------------------------------------------------------------

const CPU_SAMPLE_INTERVAL_MS = 2000;
const CPU_WINDOW_SIZE = 30; // 60 seconds of history
const THROTTLE_CPU_THRESHOLD = 0.80;
const UNTHROTTLE_CPU_THRESHOLD = 0.60;

class CpuRollingWindow {
  private samples: CpuSnapshot[] = [];
  private prevCpuTimes: { idle: number; total: number } | null = null;

  sample(): CpuSnapshot {
    const cpus = os.cpus();
    let idleTotal = 0;
    let allTotal = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      idleTotal += t.idle;
      allTotal += t.user + t.nice + t.sys + t.idle + t.irq;
    }

    let usagePercent = 0;
    if (this.prevCpuTimes) {
      const idleDelta = idleTotal - this.prevCpuTimes.idle;
      const totalDelta = allTotal - this.prevCpuTimes.total;
      usagePercent = totalDelta > 0 ? 1 - (idleDelta / totalDelta) : 0;
    }
    this.prevCpuTimes = { idle: idleTotal, total: allTotal };

    const snapshot: CpuSnapshot = {
      timestamp: Date.now(),
      usagePercent: Math.round(usagePercent * 100) / 100,
      loadAvg1: os.loadavg()[0],
      thermalState: 'nominal', // Updated by thermal monitor
    };

    this.samples.push(snapshot);
    if (this.samples.length > CPU_WINDOW_SIZE) {
      this.samples.shift();
    }
    return snapshot;
  }

  getAverageUsage(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((a, s) => a + s.usagePercent, 0);
    return sum / this.samples.length;
  }

  getPeakUsage(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map(s => s.usagePercent));
  }

  shouldThrottle(): boolean {
    return this.getAverageUsage() > THROTTLE_CPU_THRESHOLD;
  }

  shouldUnthrottle(): boolean {
    return this.getAverageUsage() < UNTHROTTLE_CPU_THRESHOLD;
  }

  getLatest(): CpuSnapshot | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
  }

  getHistory(): CpuSnapshot[] {
    return [...this.samples];
  }
}

// ---------------------------------------------------------------------------
// Feature 7: Thermal Awareness
// ---------------------------------------------------------------------------

const THERMAL_CHECK_INTERVAL_MS = 15_000;
const THERMAL_THRESHOLDS = {
  fair: 70,     // Celsius
  serious: 85,
  critical: 95,
};

class ThermalMonitor {
  private currentState: ThermalState = 'nominal';
  private lastTempC = 0;
  private checkInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkThermal();
    }, THERMAL_CHECK_INTERVAL_MS);
    log.info('[ThermalMonitor] Feature 7: Thermal awareness initialized');
  }

  private async checkThermal(): Promise<void> {
    try {
      // Use os.cpus() frequency as a proxy for thermal state
      // systeminformation can provide real temps but may not be available
      const cpus = os.cpus();
      const avgSpeed = cpus.reduce((a, c) => a + c.speed, 0) / cpus.length;
      const maxSpeed = Math.max(...cpus.map(c => c.speed));

      // Estimate thermal state from CPU speed throttling
      const speedRatio = maxSpeed > 0 ? avgSpeed / maxSpeed : 1;
      let estimatedTemp: number;

      if (speedRatio > 0.95) {
        estimatedTemp = 55; // Nominal
      } else if (speedRatio > 0.85) {
        estimatedTemp = 72; // Fair
      } else if (speedRatio > 0.70) {
        estimatedTemp = 87; // Serious
      } else {
        estimatedTemp = 96; // Critical
      }

      // Try systeminformation if available
      try {
        const si = require('systeminformation');
        const cpuTemp = await si.cpuTemperature();
        if (cpuTemp && cpuTemp.main > 0) {
          estimatedTemp = cpuTemp.main;
        }
      } catch {
        // systeminformation may not provide temps on all platforms
      }

      this.lastTempC = estimatedTemp;
      const prevState = this.currentState;

      if (estimatedTemp >= THERMAL_THRESHOLDS.critical) {
        this.currentState = 'critical';
      } else if (estimatedTemp >= THERMAL_THRESHOLDS.serious) {
        this.currentState = 'serious';
      } else if (estimatedTemp >= THERMAL_THRESHOLDS.fair) {
        this.currentState = 'fair';
      } else {
        this.currentState = 'nominal';
      }

      if (this.currentState !== prevState) {
        log.info(`[ThermalMonitor] State changed: ${prevState} -> ${this.currentState} (${estimatedTemp}C)`);
        try {
          const { dexEventBus } = require('./DexEventBus');
          dexEventBus.emit({
            type: 'system-warning',
            source: 'thermal',
            payload: { state: this.currentState, tempC: estimatedTemp },
            timestamp: Date.now(),
            id: `thermal-${Date.now()}`,
          });
        } catch { /* ok */ }
      }
    } catch (err) {
      log.warn('[ThermalMonitor] Check failed:', err);
    }
  }

  getState(): ThermalState {
    return this.currentState;
  }

  getTempC(): number {
    return this.lastTempC;
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 8: Background Suspension
// ---------------------------------------------------------------------------

const SUSPENSION_IDLE_MS = 15 * 60 * 1000; // 15 minutes

interface SuspendedProcess {
  id: string;
  suspendedAt: number;
  reason: string;
}

class BackgroundSuspensionManager {
  private suspendedProcesses = new Map<string, SuspendedProcess>();
  private lastActivityTimestamps = new Map<string, number>();
  private checkInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkSuspension();
    }, 60_000); // Check every minute
    log.info('[BackgroundSuspension] Feature 8: Suspension manager initialized (15min threshold)');
  }

  recordActivity(processId: string): void {
    this.lastActivityTimestamps.set(processId, Date.now());
    if (this.suspendedProcesses.has(processId)) {
      this.resume(processId);
    }
  }

  private checkSuspension(): void {
    const now = Date.now();
    for (const [processId, lastActivity] of this.lastActivityTimestamps) {
      if ((now - lastActivity) >= SUSPENSION_IDLE_MS && !this.suspendedProcesses.has(processId)) {
        this.suspend(processId, 'idle-timeout');
      }
    }
  }

  private suspend(processId: string, reason: string): void {
    this.suspendedProcesses.set(processId, {
      id: processId,
      suspendedAt: Date.now(),
      reason,
    });

    // Notify ThreadOrchestrator to pause the worker if applicable
    try {
      const { threadOrchestrator } = require('./ThreadOrchestrator');
      threadOrchestrator.pauseThread(processId);
    } catch { /* ok */ }

    log.info(`[BackgroundSuspension] Suspended '${processId}' (reason: ${reason})`);
  }

  private resume(processId: string): void {
    const suspended = this.suspendedProcesses.get(processId);
    if (!suspended) return;

    this.suspendedProcesses.delete(processId);
    this.lastActivityTimestamps.set(processId, Date.now());

    try {
      const { threadOrchestrator } = require('./ThreadOrchestrator');
      threadOrchestrator.resumeThread(processId);
    } catch { /* ok */ }

    const duration = Date.now() - suspended.suspendedAt;
    log.info(`[BackgroundSuspension] Resumed '${processId}' after ${Math.round(duration / 1000)}s`);
  }

  isSuspended(processId: string): boolean {
    return this.suspendedProcesses.has(processId);
  }

  getSuspendedList(): SuspendedProcess[] {
    return Array.from(this.suspendedProcesses.values());
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    // Resume all before shutdown
    for (const processId of this.suspendedProcesses.keys()) {
      this.resume(processId);
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 9: Foreground Priority Boosting
// ---------------------------------------------------------------------------

class ForegroundBooster {
  private currentForeground: string | null = null;
  private boostActive = false;

  boost(appId: string): void {
    if (this.currentForeground === appId && this.boostActive) return;

    // Demote previous foreground
    if (this.currentForeground && this.currentForeground !== appId) {
      this.demote(this.currentForeground);
    }

    this.currentForeground = appId;
    this.boostActive = true;

    // Boost: increase concurrency for user-interactive queue
    processScheduler.boostQoS('user-interactive', 2.0);
    processScheduler.boostQoS('user-initiated', 1.5);

    log.info(`[ForegroundBooster] Feature 9: Boosted priority for '${appId}'`);
  }

  private demote(appId: string): void {
    processScheduler.restoreQoS('user-interactive');
    processScheduler.restoreQoS('user-initiated');
    log.info(`[ForegroundBooster] Demoted priority for '${appId}'`);
  }

  getCurrentForeground(): string | null {
    return this.currentForeground;
  }

  isBoostActive(): boolean {
    return this.boostActive;
  }

  clearBoost(): void {
    if (this.currentForeground) {
      this.demote(this.currentForeground);
      this.currentForeground = null;
      this.boostActive = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 10: Work Stealing
// ---------------------------------------------------------------------------

class WorkStealer {
  private stealInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.stealInterval = setInterval(() => {
      this.attemptSteal();
    }, 2000); // Check every 2s
    log.info('[WorkStealer] Feature 10: Work stealing initialized');
  }

  private attemptSteal(): void {
    // Find queues with idle capacity
    const queues = processScheduler.getQueues();
    const idleQueues: QoSClass[] = [];
    const busyQueues: QoSClass[] = [];

    for (const [qos, queue] of queues) {
      if (queue.hasCapacity() && queue.length === 0) {
        idleQueues.push(qos);
      }
      if (queue.length > 2 && !queue.hasCapacity()) {
        busyQueues.push(qos);
      }
    }

    if (idleQueues.length === 0 || busyQueues.length === 0) return;

    // Steal from busiest queue's tail (lowest priority items)
    const busiestQos = busyQueues.sort((a, b) => {
      return (queues.get(b)?.length || 0) - (queues.get(a)?.length || 0);
    })[0];

    const busiestQueue = queues.get(busiestQos);
    if (!busiestQueue || busiestQueue.length <= 1) return;

    // Only steal background/utility work to idle interactive/initiated threads
    const stealableQos: QoSClass[] = ['background', 'utility'];
    if (!stealableQos.includes(busiestQos)) return;

    const stolenWork = busiestQueue.dequeue();
    if (stolenWork) {
      processScheduler.executeWork(stolenWork);
    }
  }

  shutdown(): void {
    if (this.stealInterval) {
      clearInterval(this.stealInterval);
      this.stealInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Main Process Scheduler
// ---------------------------------------------------------------------------

class ProcessScheduler {
  private queues = new Map<QoSClass, QoSQueue>();
  private cpuWindow = new CpuRollingWindow();
  private thermalMonitor = new ThermalMonitor();
  private suspensionManager = new BackgroundSuspensionManager();
  private foregroundBooster = new ForegroundBooster();
  private workStealer = new WorkStealer();
  private cpuSampleInterval: NodeJS.Timeout | null = null;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private workIdCounter = 0;
  private isThrottled = false;

  constructor() {
    const qosClasses: QoSClass[] = ['user-interactive', 'user-initiated', 'utility', 'background'];
    for (const qos of qosClasses) {
      this.queues.set(qos, new QoSQueue(qos));
    }
  }

  initialize(): void {
    // CPU sampling
    this.cpuSampleInterval = setInterval(() => {
      this.cpuWindow.sample();
      this.adjustThrottle();
    }, CPU_SAMPLE_INTERVAL_MS);

    // Scheduler tick (500ms is sufficient for desktop workloads)
    this.schedulerInterval = setInterval(() => {
      this.schedulerTick();
    }, 500);

    this.thermalMonitor.initialize();
    this.suspensionManager.initialize();
    this.workStealer.initialize();

    log.info('[ProcessScheduler] Features 5-10: Process scheduler initialized');
  }

  schedule(qos: QoSClass, fn: () => Promise<void> | void, deadlineMs = 30000): string {
    const id = `work-${++this.workIdCounter}`;
    const work: ScheduledWork = {
      id,
      qos,
      fn,
      submittedAt: Date.now(),
      startedAt: 0,
      deadline: Date.now() + deadlineMs,
      cancelled: false,
    };

    const queue = this.queues.get(qos)!;
    if (!queue.enqueue(work)) {
      log.warn(`[ProcessScheduler] Queue '${qos}' full, work ${id} rejected`);
      return id;
    }

    return id;
  }

  private schedulerTick(): void {
    const priority: QoSClass[] = ['user-interactive', 'user-initiated', 'utility', 'background'];

    for (const qos of priority) {
      const queue = this.queues.get(qos)!;
      while (queue.hasCapacity() && queue.length > 0) {
        const work = queue.dequeue();
        if (work && !work.cancelled) {
          this.executeWork(work);
        }
      }
    }

    // Anti-starvation: promote long-waiting items
    this.handleStarvation();
  }

  executeWork(work: ScheduledWork): void {
    const queue = this.queues.get(work.qos)!;
    queue.markStarted();
    work.startedAt = Date.now();

    const run = async () => {
      try {
        await work.fn();
      } catch (err) {
        log.warn(`[ProcessScheduler] Work ${work.id} failed:`, err);
      } finally {
        queue.markFinished();
      }
    };

    // Use setImmediate for user-interactive, setTimeout for others
    if (work.qos === 'user-interactive') {
      setImmediate(run);
    } else {
      setTimeout(run, 0);
    }
  }

  private handleStarvation(): void {
    const now = Date.now();
    const lowerQueues: QoSClass[] = ['utility', 'background'];

    for (const qos of lowerQueues) {
      const queue = this.queues.get(qos)!;
      const starved = queue.getStarvedItems(now);
      for (const item of starved) {
        // Promote to user-initiated
        const higherQueue = this.queues.get('user-initiated')!;
        if (higherQueue.length < 32) {
          // Remove from current queue and re-enqueue at higher priority
          item.qos = 'user-initiated';
          higherQueue.enqueue(item);
          log.info(`[ProcessScheduler] Anti-starvation: promoted ${item.id} to user-initiated`);
        }
        break; // Only promote one per tick
      }
    }
  }

  private adjustThrottle(): void {
    const thermal = this.thermalMonitor.getState();

    if (thermal === 'critical' || thermal === 'serious') {
      this.throttle(thermal === 'critical' ? 0.25 : 0.5);
      return;
    }

    if (this.cpuWindow.shouldThrottle() && !this.isThrottled) {
      this.throttle(0.5);
    } else if (this.cpuWindow.shouldUnthrottle() && this.isThrottled) {
      this.unthrottle();
    }
  }

  private throttle(factor: number): void {
    this.isThrottled = true;
    for (const [, queue] of this.queues) {
      queue.setThrottledConcurrency(factor);
    }
    log.info(`[ProcessScheduler] Throttled to ${factor * 100}% capacity`);
  }

  private unthrottle(): void {
    this.isThrottled = false;
    for (const [, queue] of this.queues) {
      queue.restoreConcurrency();
    }
    log.info('[ProcessScheduler] Throttle released');
  }

  boostQoS(qos: QoSClass, factor: number): void {
    const queue = this.queues.get(qos);
    if (queue) {
      queue.setThrottledConcurrency(factor);
    }
  }

  restoreQoS(qos: QoSClass): void {
    const queue = this.queues.get(qos);
    if (queue) {
      queue.restoreConcurrency();
    }
  }

  getQueues(): Map<QoSClass, QoSQueue> {
    return this.queues;
  }

  // Public API for Feature 8
  recordProcessActivity(processId: string): void {
    this.suspensionManager.recordActivity(processId);
  }

  // Public API for Feature 9
  setForegroundApp(appId: string): void {
    this.foregroundBooster.boost(appId);
  }

  getStats(): {
    cpuUsage: number;
    cpuPeak: number;
    thermalState: ThermalState;
    isThrottled: boolean;
    queues: Record<string, { length: number; active: number; maxConcurrency: number }>;
    suspended: number;
  } {
    const queueStats: Record<string, { length: number; active: number; maxConcurrency: number }> = {};
    for (const [qos, queue] of this.queues) {
      queueStats[qos] = {
        length: queue.length,
        active: queue.activeCount,
        maxConcurrency: queue.maxConcurrency,
      };
    }

    return {
      cpuUsage: this.cpuWindow.getAverageUsage(),
      cpuPeak: this.cpuWindow.getPeakUsage(),
      thermalState: this.thermalMonitor.getState(),
      isThrottled: this.isThrottled,
      queues: queueStats,
      suspended: this.suspensionManager.getSuspendedList().length,
    };
  }

  getCpuHistory(): CpuSnapshot[] {
    return this.cpuWindow.getHistory();
  }

  shutdown(): void {
    if (this.cpuSampleInterval) {
      clearInterval(this.cpuSampleInterval);
      this.cpuSampleInterval = null;
    }
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.thermalMonitor.shutdown();
    this.suspensionManager.shutdown();
    this.workStealer.shutdown();
    this.foregroundBooster.clearBoost();
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const processScheduler = new ProcessScheduler();

export function initializeProcessScheduler(): void {
  processScheduler.initialize();
}

export function shutdownProcessScheduler(): void {
  processScheduler.shutdown();
}
