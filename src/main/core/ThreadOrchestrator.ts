// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Thread Orchestrator
// ==========================================================================
// Rules 1-8: Thread Architecture
// 1. Dedicated worker threads for heavy operations (10 workers)
// 2. Main thread: window mgmt, IPC routing, tray, shortcuts only
// 3. Worker heartbeat + health monitoring (5s interval)
// 4. Auto-restart crashed workers (max 3 restarts / 5 min window)
// 5. Message passing with strict schema (<1MB)
// 6. Rate limiting per thread
// 7. CPU throttle check before every dispatch cycle
// 8. Background threads capped at 30% combined CPU
// ==========================================================================

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as log from 'electron-log';
import {
  ThreadMessage,
  ThreadResponse,
  ThreadName,
  THREAD_RATE_LIMITS,
  buildMessage,
  validateMessageSize,
  createRequestId,
} from '../workers/ipc-protocol';

// ---------------------------------------------------------------------------
// Rule 3 & 4: Health monitoring types
// ---------------------------------------------------------------------------

interface HealthRecord {
  lastHeartbeat: number;
  restartCount: number;
  restartTimestamps: number[];
  consecutiveFailures: number;
  avgResponseMs: number;
  responseSamples: number[];
  cpuMicros: number;
  lastCpuCheck: number;
}

const HEARTBEAT_INTERVAL_MS = 5000;       // Rule 3: 5s heartbeat
const HEARTBEAT_TIMEOUT_MS = 15000;       // Rule 3: 15s before considered dead
const MAX_RESTARTS_PER_WINDOW = 3;        // Rule 4: max 3 restarts
const RESTART_WINDOW_MS = 300000;          // Rule 4: per 5 minutes
const MAX_COMBINED_CPU_PERCENT = 30;       // Rule 8: 30% combined CPU cap
const CPU_CHECK_INTERVAL_MS = 10000;        // Rule 7: check every 10s (was 2s)
const RESPONSE_SAMPLE_SIZE = 50;           // Rule 3: rolling average window

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: ReturnType<typeof setTimeout>;
  sentAt: number;
}

interface RateState {
  count: number;
  windowStart: number;
  queue: Array<{ msg: ThreadMessage; resolve: (v: any) => void; reject: (e: any) => void }>;
}

class ManagedThread {
  readonly name: ThreadName;
  worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private rate: RateState = { count: 0, windowStart: Date.now(), queue: [] };
  private limit: number;
  private workerPath: string;
  private started = false;

  // Rule 3 & 4: Health state
  health: HealthRecord = {
    lastHeartbeat: 0,
    restartCount: 0,
    restartTimestamps: [],
    consecutiveFailures: 0,
    avgResponseMs: 0,
    responseSamples: [],
    cpuMicros: 0,
    lastCpuCheck: Date.now(),
  };

  // Rule 8: throttle flag set by orchestrator
  private throttled = false;

  constructor(name: ThreadName, workerPath: string) {
    this.name = name;
    this.workerPath = workerPath;
    this.limit = THREAD_RATE_LIMITS[name];
  }

  start(): void {
    if (this.started) return;
    try {
      this.worker = new Worker(this.workerPath, {
        workerData: { threadName: this.name },
      });
      this.worker.on('message', (msg: ThreadResponse) => this.handleResponse(msg));
      this.worker.on('error', (err: Error) => {
        log.warn(`[Thread:${this.name}] Worker error:`, err.message);
        this.health.consecutiveFailures++;
      });
      this.worker.on('exit', (code: number) => {
        log.info(`[Thread:${this.name}] Exited with code ${code}`);
        this.started = false;
        // Rule 4: Mark for auto-restart (handled by orchestrator health loop)
      });
      this.started = true;
      this.health.lastHeartbeat = Date.now();
      this.health.consecutiveFailures = 0;
      log.info(`[Thread:${this.name}] Started`);
    } catch (err: any) {
      log.warn(`[Thread:${this.name}] Failed to start:`, err.message);
    }
  }

  async stop(): Promise<void> {
    if (!this.worker) return;
    for (const [, req] of this.pending) {
      clearTimeout(req.timeout);
      req.reject(new Error('Thread shutting down'));
    }
    this.pending.clear();
    try {
      await this.worker.terminate();
    } catch {
      // already terminated
    }
    this.worker = null;
    this.started = false;
    log.info(`[Thread:${this.name}] Stopped`);
  }

  // Rule 8: Set throttle state
  setThrottled(throttled: boolean): void {
    this.throttled = throttled;
  }

  isThrottled(): boolean {
    return this.throttled;
  }

  isStarted(): boolean {
    return this.started;
  }

  send(type: string, payload: any, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      // Rule 7: check throttle before dispatch
      if (this.throttled) {
        this.rate.queue.push({ msg: buildMessage(type, payload), resolve, reject });
        return;
      }

      const msg = buildMessage(type, payload);
      // Rule 5: strict schema validation
      if (!validateMessageSize(msg)) {
        reject(new Error(`Message exceeds 1MB limit for thread ${this.name}`));
        return;
      }
      // Rule 6: Rate limiting with queueing
      const now = Date.now();
      if (now - this.rate.windowStart > 1000) {
        this.rate.count = 0;
        this.rate.windowStart = now;
      }
      if (this.rate.count >= this.limit) {
        this.rate.queue.push({ msg, resolve, reject });
        return;
      }
      this.rate.count++;
      this.dispatch(msg, resolve, reject, timeoutMs);
    });
  }

  fire(type: string, payload: any): void {
    if (!this.worker) return;
    // Rule 7: skip if throttled
    if (this.throttled) return;
    const msg = buildMessage(type, payload);
    if (!validateMessageSize(msg)) return;
    const now = Date.now();
    if (now - this.rate.windowStart > 1000) {
      this.rate.count = 0;
      this.rate.windowStart = now;
    }
    if (this.rate.count >= this.limit) {
      this.rate.queue.push({ msg, resolve: () => {}, reject: () => {} });
      return;
    }
    this.rate.count++;
    this.worker.postMessage(msg);
  }

  drainQueue(): void {
    // Rule 7: don't drain when throttled
    if (this.throttled) return;
    const now = Date.now();
    if (now - this.rate.windowStart > 1000) {
      this.rate.count = 0;
      this.rate.windowStart = now;
    }
    while (this.rate.queue.length > 0 && this.rate.count < this.limit) {
      const item = this.rate.queue.shift()!;
      this.rate.count++;
      this.dispatch(item.msg, item.resolve, item.reject, 10000);
    }
  }

  // Rule 3: Heartbeat ping
  sendHeartbeat(): void {
    if (!this.worker || !this.started) return;
    try {
      const msg = buildMessage('__heartbeat', { ts: Date.now() });
      this.worker.postMessage(msg);
    } catch {
      // heartbeat send failed -- health check will catch it
    }
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getQueueLength(): number {
    return this.rate.queue.length;
  }

  private dispatch(msg: ThreadMessage, resolve: (v: any) => void, reject: (e: any) => void, timeoutMs: number): void {
    if (!this.worker) {
      reject(new Error(`Thread ${this.name} is not running`));
      return;
    }
    const timeout = setTimeout(() => {
      this.pending.delete(msg.requestId);
      this.health.consecutiveFailures++;
      reject(new Error(`Timeout waiting for ${this.name}:${msg.type}`));
    }, timeoutMs);
    this.pending.set(msg.requestId, { resolve, reject, timeout, sentAt: Date.now() });
    this.worker.postMessage(msg);
  }

  private handleResponse(resp: ThreadResponse): void {
    // Rule 3: update heartbeat on any message
    this.health.lastHeartbeat = Date.now();

    // Handle heartbeat response
    if (resp.type === '__heartbeat:response') return;

    const req = this.pending.get(resp.requestId);
    if (!req) return;
    clearTimeout(req.timeout);
    this.pending.delete(resp.requestId);

    // Rule 3: track response latency
    const latency = Date.now() - req.sentAt;
    this.health.responseSamples.push(latency);
    if (this.health.responseSamples.length > RESPONSE_SAMPLE_SIZE) {
      this.health.responseSamples.shift();
    }
    this.health.avgResponseMs = this.health.responseSamples.reduce((a, b) => a + b, 0) / this.health.responseSamples.length;

    if (resp.error) {
      this.health.consecutiveFailures++;
      req.reject(new Error(resp.error));
    } else {
      this.health.consecutiveFailures = 0;
      req.resolve(resp.payload);
    }
  }
}

// =========================================================================
// Singleton orchestrator -- Rules 1-8 compliant
// =========================================================================

class ThreadOrchestrator {
  private threads = new Map<ThreadName, ManagedThread>();
  private drainInterval: ReturnType<typeof setInterval> | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private cpuCheckInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private shuttingDown = false;

  // Rule 8: CPU tracking
  private lastProcessCpu = process.cpuUsage();
  private lastCpuCheckTime = Date.now();
  private combinedCpuPercent = 0;

  initialize(): void {
    if (this.initialized) return;
    const base = path.join(__dirname, 'workers');

    const definitions: Array<[ThreadName, string]> = [
      ['rewind-logger', path.join(base, 'rewind-logger.worker.js')],
      ['learning-engine', path.join(base, 'learning-engine.worker.js')],
      ['analytics', path.join(base, 'analytics.worker.js')],
      ['file-transfer', path.join(base, 'file-transfer.worker.js')],
      ['database-write', path.join(base, 'database-write.worker.js')],
      ['thumbnail', path.join(base, 'thumbnail.worker.js')],
      ['task-queue', path.join(base, 'task-queue.worker.js')],
      ['security', path.join(base, 'security.worker.js')],
      ['plugin-executor', path.join(base, 'plugin-executor.worker.js')],
      ['creative-processing', path.join(base, 'creative-processing.worker.js')],
    ];

    for (const [name, workerPath] of definitions) {
      const mt = new ManagedThread(name, workerPath);
      this.threads.set(name, mt);
    }

    // Drain rate-limited queues every 1s (reduces event loop pressure)
    this.drainInterval = setInterval(() => {
      for (const t of this.threads.values()) {
        t.drainQueue();
      }
    }, 1000);

    // Rule 3: Health monitoring every 5s
    this.healthInterval = setInterval(() => this.healthCheck(), HEARTBEAT_INTERVAL_MS);

    // Rule 7 & 8: CPU throttle check every 2s
    this.cpuCheckInterval = setInterval(() => this.cpuThrottleCheck(), CPU_CHECK_INTERVAL_MS);

    this.initialized = true;
    log.info('[ThreadOrchestrator] Initialized with 10 thread definitions (Rules 1-8 compliant)');
  }

  // -----------------------------------------------------------------------
  // Rule 3: Health check + heartbeat
  // -----------------------------------------------------------------------

  private healthCheck(): void {
    if (this.shuttingDown) return;
    const now = Date.now();

    for (const [name, thread] of this.threads) {
      if (!thread.isStarted()) continue;

      // Send heartbeat ping
      thread.sendHeartbeat();

      // Check if worker is responsive
      const timeSinceHeartbeat = now - thread.health.lastHeartbeat;
      if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        log.warn(`[ThreadOrchestrator] Thread ${name} unresponsive (${timeSinceHeartbeat}ms since last heartbeat)`);
        this.handleUnresponsiveThread(name, thread);
        continue;
      }

      // Rule 4: Auto-restart exited workers
      if (!thread.worker && thread.health.lastHeartbeat > 0) {
        this.autoRestart(name, thread);
      }
    }
  }

  // Rule 4: Auto-restart with max 3/5min window
  private autoRestart(name: ThreadName, thread: ManagedThread): void {
    if (this.shuttingDown) return;
    const now = Date.now();

    // Prune old restart timestamps outside the window
    thread.health.restartTimestamps = thread.health.restartTimestamps.filter(
      ts => now - ts < RESTART_WINDOW_MS
    );

    if (thread.health.restartTimestamps.length >= MAX_RESTARTS_PER_WINDOW) {
      log.error(`[ThreadOrchestrator] Thread ${name} exceeded max restarts (${MAX_RESTARTS_PER_WINDOW}/${RESTART_WINDOW_MS / 60000}min) -- disabled`);
      return;
    }

    log.info(`[ThreadOrchestrator] Auto-restarting thread ${name} (restart #${thread.health.restartCount + 1})`);
    thread.health.restartCount++;
    thread.health.restartTimestamps.push(now);
    thread.start();
  }

  private async handleUnresponsiveThread(name: ThreadName, thread: ManagedThread): Promise<void> {
    log.warn(`[ThreadOrchestrator] Terminating unresponsive thread ${name}`);
    await thread.stop();
    this.autoRestart(name, thread);
  }

  // -----------------------------------------------------------------------
  // Rule 7 & 8: CPU throttle check
  // -----------------------------------------------------------------------

  private cpuThrottleCheck(): void {
    const now = Date.now();
    const elapsed = now - this.lastCpuCheckTime;
    if (elapsed < 100) return;

    const cpu = process.cpuUsage(this.lastProcessCpu);
    this.lastProcessCpu = process.cpuUsage();
    this.lastCpuCheckTime = now;

    const totalMicros = cpu.user + cpu.system;
    const elapsedMicros = elapsed * 1000;
    this.combinedCpuPercent = Math.min(100, (totalMicros / elapsedMicros) * 100);

    // Rule 8: Throttle background threads if combined CPU > 30%
    const shouldThrottle = this.combinedCpuPercent > MAX_COMBINED_CPU_PERCENT;

    // Background threads: analytics, learning-engine, thumbnail, rewind-logger
    const backgroundThreads: ThreadName[] = ['analytics', 'learning-engine', 'thumbnail', 'rewind-logger'];
    for (const name of backgroundThreads) {
      const t = this.threads.get(name);
      if (t) t.setThrottled(shouldThrottle);
    }

    if (shouldThrottle) {
      log.debug(`[ThreadOrchestrator] CPU ${this.combinedCpuPercent.toFixed(1)}% > ${MAX_COMBINED_CPU_PERCENT}% -- background threads throttled`);
    }
  }

  startThread(name: ThreadName): void {
    const t = this.threads.get(name);
    if (t) t.start();
  }

  startAll(): void {
    for (const t of this.threads.values()) {
      t.start();
    }
  }

  async stopThread(name: ThreadName): Promise<void> {
    const t = this.threads.get(name);
    if (t) await t.stop();
  }

  async stopAll(): Promise<void> {
    this.shuttingDown = true;
    if (this.drainInterval) {
      clearInterval(this.drainInterval);
      this.drainInterval = null;
    }
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
      this.cpuCheckInterval = null;
    }
    const stops = Array.from(this.threads.values()).map(t => t.stop());
    await Promise.allSettled(stops);
    log.info('[ThreadOrchestrator] All threads stopped');
  }

  send(thread: ThreadName, type: string, payload: any, timeoutMs?: number): Promise<any> {
    const t = this.threads.get(thread);
    if (!t) return Promise.reject(new Error(`Unknown thread: ${thread}`));
    return t.send(type, payload, timeoutMs);
  }

  fire(thread: ThreadName, type: string, payload: any): void {
    const t = this.threads.get(thread);
    if (t) t.fire(type, payload);
  }

  getThread(name: ThreadName): ManagedThread | undefined {
    return this.threads.get(name);
  }

  isRunning(name: ThreadName): boolean {
    const t = this.threads.get(name);
    return t?.worker !== null && t?.worker !== undefined;
  }

  getStatus(): Record<ThreadName, boolean> {
    const result: Partial<Record<ThreadName, boolean>> = {};
    for (const [name, t] of this.threads) {
      result[name] = t.worker !== null;
    }
    return result as Record<ThreadName, boolean>;
  }

  // Rule 3: Get comprehensive health report
  getHealthReport(): Record<ThreadName, {
    running: boolean;
    lastHeartbeatAgo: number;
    avgResponseMs: number;
    restartCount: number;
    consecutiveFailures: number;
    pendingRequests: number;
    queueLength: number;
    throttled: boolean;
  }> {
    const now = Date.now();
    const report: Record<string, any> = {};
    for (const [name, t] of this.threads) {
      report[name] = {
        running: t.worker !== null,
        lastHeartbeatAgo: t.health.lastHeartbeat > 0 ? now - t.health.lastHeartbeat : -1,
        avgResponseMs: Math.round(t.health.avgResponseMs * 10) / 10,
        restartCount: t.health.restartCount,
        consecutiveFailures: t.health.consecutiveFailures,
        pendingRequests: t.getPendingCount(),
        queueLength: t.getQueueLength(),
        throttled: t.isThrottled(),
      };
    }
    return report as Record<ThreadName, any>;
  }

  getCombinedCpuPercent(): number {
    return this.combinedCpuPercent;
  }
}

export const threadOrchestrator = new ThreadOrchestrator();

export function getThreadOrchestrator(): ThreadOrchestrator {
  return threadOrchestrator;
}

export function initializeThreadOrchestrator(): void {
  threadOrchestrator.initialize();
}

export async function shutdownThreadOrchestrator(): Promise<void> {
  await threadOrchestrator.stopAll();
}
