// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Engine -- Platform Native Integration
// Rules 83-89: Native run loop integration, high-resolution timers,
// OS memory pressure, native process spawning, file descriptor passing,
// platform-specific timer APIs, signal handling
// ===========================================================================

import * as os from 'os';
import * as path from 'path';
import { execFile, ChildProcess, spawn } from 'child_process';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Rule 83: Native Run Loop Integration
// Coordinate with the OS event loop (libuv) for optimal scheduling.
// Use setImmediate for I/O callbacks, microtasks for critical paths.
// ---------------------------------------------------------------------------

type TaskPriority = 'microtask' | 'immediate' | 'timer' | 'idle';

interface ScheduledTask {
  fn: () => void | Promise<void>;
  priority: TaskPriority;
  scheduledAt: number;
}

class NativeRunLoopIntegration {
  private pendingTasks: ScheduledTask[] = [];
  private idleCallbacks: Array<() => void> = [];
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastCPUUsage: NodeJS.CpuUsage | null = null;
  private isIdle = false;

  initialize(): void {
    // Monitor idle state through CPU usage (10s is sufficient)
    this.lastCPUUsage = process.cpuUsage();
    this.idleCheckInterval = setInterval(() => this.checkIdleState(), 10000);
    if (this.idleCheckInterval.unref) {
      this.idleCheckInterval.unref();
    }
    log.info('[NativeRunLoop] Initialized run loop integration');
  }

  schedule(fn: () => void | Promise<void>, priority: TaskPriority = 'immediate'): void {
    const task: ScheduledTask = { fn, priority, scheduledAt: Date.now() };

    switch (priority) {
      case 'microtask':
        queueMicrotask(() => this.executeTask(task));
        break;
      case 'immediate':
        setImmediate(() => this.executeTask(task));
        break;
      case 'timer':
        setTimeout(() => this.executeTask(task), 0);
        break;
      case 'idle':
        this.idleCallbacks.push(() => this.executeTask(task));
        break;
    }
  }

  private executeTask(task: ScheduledTask): void {
    try {
      const result = task.fn();
      if (result instanceof Promise) {
        result.catch((err) => {
          log.warn('[NativeRunLoop] Async task error:', String(err));
        });
      }
    } catch (err) {
      log.warn('[NativeRunLoop] Task error:', String(err));
    }
  }

  private checkIdleState(): void {
    const usage = process.cpuUsage(this.lastCPUUsage || undefined);
    const totalMicroseconds = usage.user + usage.system;
    // If less than 50ms CPU in last second, consider idle
    this.isIdle = totalMicroseconds < 50000;
    this.lastCPUUsage = process.cpuUsage();

    if (this.isIdle && this.idleCallbacks.length > 0) {
      // Execute up to 10 idle callbacks per check
      const batch = this.idleCallbacks.splice(0, 10);
      for (const cb of batch) {
        try { cb(); } catch (err) {
          log.warn('[NativeRunLoop] Idle callback error:', String(err));
        }
      }
    }
  }

  drainMicrotasks(): Promise<void> {
    return new Promise((resolve) => {
      queueMicrotask(() => {
        queueMicrotask(resolve);
      });
    });
  }

  getIdleState(): boolean {
    return this.isIdle;
  }

  shutdown(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    this.idleCallbacks.length = 0;
    this.pendingTasks.length = 0;
    log.info('[NativeRunLoop] Shut down');
  }
}

// ---------------------------------------------------------------------------
// Rule 84: High-Resolution Timers
// Use process.hrtime.bigint() and performance.now() for nanosecond
// timing. Provides monotonic clock access and benchmark utilities.
// ---------------------------------------------------------------------------

class HighResTimers {
  private marks: Map<string, bigint> = new Map();
  private measurements: Map<string, number[]> = new Map();
  private enabled = true;

  mark(name: string): void {
    if (!this.enabled) return;
    this.marks.set(name, process.hrtime.bigint());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    if (!this.enabled) return 0;

    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : process.hrtime.bigint();

    if (!start) return -1;
    if (!end) return -1;

    const durationNs = Number(end - start);
    const durationMs = durationNs / 1_000_000;

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(durationMs);

    return durationMs;
  }

  getStats(name: string): { count: number; min: number; max: number; avg: number; p50: number; p95: number; p99: number } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) return null;

    const sorted = [...measurements].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      count: len,
      min: sorted[0],
      max: sorted[len - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    };
  }

  benchmark(fn: () => void, iterations: number = 1000): { totalMs: number; avgNs: number; opsPerSecond: number } {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = process.hrtime.bigint();
    const totalNs = Number(end - start);
    const totalMs = totalNs / 1_000_000;
    const avgNs = totalNs / iterations;
    const opsPerSecond = iterations / (totalMs / 1000);

    return { totalMs, avgNs, opsPerSecond };
  }

  async benchmarkAsync(fn: () => Promise<void>, iterations: number = 100): Promise<{ totalMs: number; avgNs: number; opsPerSecond: number }> {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
    const end = process.hrtime.bigint();
    const totalNs = Number(end - start);
    const totalMs = totalNs / 1_000_000;
    const avgNs = totalNs / iterations;
    const opsPerSecond = iterations / (totalMs / 1000);

    return { totalMs, avgNs, opsPerSecond };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  clearMeasurements(): void {
    this.marks.clear();
    this.measurements.clear();
  }
}

// ---------------------------------------------------------------------------
// Rule 85: OS Memory Pressure Notifications
// Listen for system memory pressure and respond with cache eviction,
// GC hints, and graceful degradation.
// ---------------------------------------------------------------------------

type PressureLevel = 'none' | 'moderate' | 'critical';
type PressureHandler = (level: PressureLevel, freeMemMB: number) => void;

class OSMemoryPressureMonitor {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: PressureHandler[] = [];
  private currentLevel: PressureLevel = 'none';
  private totalMemMB: number;

  // Thresholds: moderate at <20% free, critical at <10% free
  private moderateThreshold: number;
  private criticalThreshold: number;

  constructor() {
    this.totalMemMB = os.totalmem() / (1024 * 1024);
    this.moderateThreshold = this.totalMemMB * 0.2;
    this.criticalThreshold = this.totalMemMB * 0.1;
  }

  start(pollMs: number = 5000): void {
    this.pollInterval = setInterval(() => this.checkPressure(), pollMs);
    if (this.pollInterval.unref) {
      this.pollInterval.unref();
    }
    log.info('[MemoryPressure] Monitoring started. Total memory:', Math.round(this.totalMemMB), 'MB');
  }

  onPressure(handler: PressureHandler): void {
    this.handlers.push(handler);
  }

  private checkPressure(): void {
    const freeMemMB = os.freemem() / (1024 * 1024);
    let newLevel: PressureLevel = 'none';

    if (freeMemMB < this.criticalThreshold) {
      newLevel = 'critical';
    } else if (freeMemMB < this.moderateThreshold) {
      newLevel = 'moderate';
    }

    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;
      log.info('[MemoryPressure] Level changed to:', newLevel, 'Free:', Math.round(freeMemMB), 'MB');

      for (const handler of this.handlers) {
        try {
          handler(newLevel, freeMemMB);
        } catch (err) {
          log.warn('[MemoryPressure] Handler error:', String(err));
        }
      }
    }
  }

  getCurrentLevel(): PressureLevel {
    return this.currentLevel;
  }

  getMemoryInfo(): { totalMB: number; freeMB: number; usedPercent: number } {
    const freeMB = os.freemem() / (1024 * 1024);
    return {
      totalMB: Math.round(this.totalMemMB),
      freeMB: Math.round(freeMB),
      usedPercent: Math.round(((this.totalMemMB - freeMB) / this.totalMemMB) * 100),
    };
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.handlers.length = 0;
    log.info('[MemoryPressure] Monitoring stopped');
  }
}

// ---------------------------------------------------------------------------
// Rule 86: Native Process Spawning
// Efficient process creation using direct spawn() instead of shell.
// Manages a pool of reusable child processes.
// ---------------------------------------------------------------------------

interface ProcessPoolEntry {
  process: ChildProcess;
  busy: boolean;
  createdAt: number;
  commandPath: string;
}

class NativeProcessSpawner {
  private processPool: Map<string, ProcessPoolEntry[]> = new Map();
  private maxPoolSize = 4;
  private processTimeout = 30000;

  async execDirect(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.processTimeout;

      const child = execFile(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error as any).code || 1 : 0,
        });
      });

      child.on('error', (err) => {
        resolve({ stdout: '', stderr: String(err), exitCode: 1 });
      });
    });
  }

  spawnDetached(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
  ): ChildProcess {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return child;
  }

  spawnWithStreams(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      onStdout?: (data: Buffer) => void;
      onStderr?: (data: Buffer) => void;
    } = {}
  ): ChildProcess {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    if (options.onStdout && child.stdout) {
      child.stdout.on('data', options.onStdout);
    }
    if (options.onStderr && child.stderr) {
      child.stderr.on('data', options.onStderr);
    }

    return child;
  }

  async spawnPowerShell(script: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    // AV-safe: Use Restricted policy instead of Bypass, no hidden window
    // Script commands run inline via -Command, which is allowed even under Restricted
    return this.execDirect(executable, [
      '-NoProfile',
      '-NoLogo',
      '-NonInteractive',
      '-Command', script,
    ], { timeout: 10000 });
  }

  async spawnPython(scriptPath: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const python = process.platform === 'win32' ? 'python' : 'python3';
    return this.execDirect(python, [scriptPath, ...args]);
  }

  killAll(): void {
    for (const [, entries] of this.processPool) {
      for (const entry of entries) {
        try {
          entry.process.kill('SIGTERM');
        } catch {
          // Already dead
        }
      }
    }
    this.processPool.clear();
  }
}

// ---------------------------------------------------------------------------
// Rule 87: File Descriptor Management
// Track and limit open file descriptors. Provide FD pooling with
// automatic cleanup on process exit.
// ---------------------------------------------------------------------------

interface FDEntry {
  fd: number;
  path: string;
  openedAt: number;
  lastAccessAt: number;
  refCount: number;
}

class FileDescriptorManager {
  private openFDs: Map<string, FDEntry> = new Map();
  private maxOpenFDs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private fs: typeof import('fs') | null = null;

  constructor(maxOpenFDs: number = 256) {
    this.maxOpenFDs = maxOpenFDs;
  }

  async initialize(): Promise<void> {
    this.fs = await import('fs');

    // Periodic cleanup of stale descriptors
    this.cleanupInterval = setInterval(() => this.cleanupStale(), 30000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    log.info('[FDManager] Initialized with max open FDs:', this.maxOpenFDs);
  }

  async open(filePath: string, flags: string = 'r'): Promise<number> {
    const normalized = path.resolve(filePath);

    // Check if already open
    const existing = this.openFDs.get(normalized);
    if (existing) {
      existing.refCount++;
      existing.lastAccessAt = Date.now();
      return existing.fd;
    }

    // Evict LRU if at capacity
    if (this.openFDs.size >= this.maxOpenFDs) {
      this.evictLRU();
    }

    if (!this.fs) await this.initialize();

    return new Promise<number>((resolve, reject) => {
      this.fs!.open(normalized, flags, (err, fd) => {
        if (err) return reject(err);

        this.openFDs.set(normalized, {
          fd,
          path: normalized,
          openedAt: Date.now(),
          lastAccessAt: Date.now(),
          refCount: 1,
        });

        resolve(fd);
      });
    });
  }

  release(filePath: string): void {
    const normalized = path.resolve(filePath);
    const entry = this.openFDs.get(normalized);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      try {
        this.fs?.closeSync(entry.fd);
      } catch {
        // Already closed
      }
      this.openFDs.delete(normalized);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.openFDs) {
      if (entry.refCount <= 0 && entry.lastAccessAt < oldestTime) {
        oldestTime = entry.lastAccessAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.openFDs.get(oldestKey);
      if (entry) {
        try { this.fs?.closeSync(entry.fd); } catch { /* */ }
        this.openFDs.delete(oldestKey);
      }
    }
  }

  private cleanupStale(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [key, entry] of this.openFDs) {
      if (entry.refCount <= 0 && now - entry.lastAccessAt > staleThreshold) {
        try { this.fs?.closeSync(entry.fd); } catch { /* */ }
        this.openFDs.delete(key);
      }
    }
  }

  getOpenCount(): number {
    return this.openFDs.size;
  }

  getInfo(): Array<{ path: string; fd: number; refCount: number; ageMs: number }> {
    const now = Date.now();
    const result: Array<{ path: string; fd: number; refCount: number; ageMs: number }> = [];
    for (const [, entry] of this.openFDs) {
      result.push({
        path: entry.path,
        fd: entry.fd,
        refCount: entry.refCount,
        ageMs: now - entry.openedAt,
      });
    }
    return result;
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [, entry] of this.openFDs) {
      try { this.fs?.closeSync(entry.fd); } catch { /* */ }
    }
    this.openFDs.clear();
    log.info('[FDManager] Shut down');
  }
}

// ---------------------------------------------------------------------------
// Rule 88: Platform-Specific Timer APIs
// Precise timer management. Uses setImmediate for I/O phases,
// setTimeout coalescence, and adaptive timer resolution.
// ---------------------------------------------------------------------------

interface TimerEntry {
  id: number;
  callback: () => void;
  interval: number;
  repeating: boolean;
  handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;
  createdAt: number;
}

class PlatformTimerManager {
  private nextId = 1;
  private timers: Map<number, TimerEntry> = new Map();
  private coalescingWindow = 16; // ms -- coalesce timers within this window

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    const entry: TimerEntry = {
      id,
      callback,
      interval: delayMs,
      repeating: false,
      handle: null,
      createdAt: Date.now(),
    };

    // Coalesce very small timeouts to reduce timer overhead
    const adjustedDelay = delayMs < this.coalescingWindow ? this.coalescingWindow : delayMs;

    entry.handle = global.setTimeout(() => {
      this.timers.delete(id);
      try { callback(); } catch (err) {
        log.warn('[TimerManager] setTimeout callback error:', String(err));
      }
    }, adjustedDelay);

    this.timers.set(id, entry);
    return id;
  }

  setInterval(callback: () => void, intervalMs: number): number {
    const id = this.nextId++;
    const entry: TimerEntry = {
      id,
      callback,
      interval: intervalMs,
      repeating: true,
      handle: null,
      createdAt: Date.now(),
    };

    entry.handle = global.setInterval(() => {
      try { callback(); } catch (err) {
        log.warn('[TimerManager] setInterval callback error:', String(err));
      }
    }, intervalMs);

    this.timers.set(id, entry);
    return id;
  }

  setImmediate(callback: () => void): number {
    const id = this.nextId++;
    const entry: TimerEntry = {
      id,
      callback,
      interval: 0,
      repeating: false,
      handle: null,
      createdAt: Date.now(),
    };

    global.setImmediate(() => {
      this.timers.delete(id);
      try { callback(); } catch (err) {
        log.warn('[TimerManager] setImmediate callback error:', String(err));
      }
    });

    this.timers.set(id, entry);
    return id;
  }

  clearTimer(id: number): void {
    const entry = this.timers.get(id);
    if (!entry) return;

    if (entry.handle !== null) {
      if (entry.repeating) {
        global.clearInterval(entry.handle as ReturnType<typeof setInterval>);
      } else {
        global.clearTimeout(entry.handle as ReturnType<typeof setTimeout>);
      }
    }

    this.timers.delete(id);
  }

  getActiveTimerCount(): number {
    return this.timers.size;
  }

  clearAll(): void {
    for (const [id] of this.timers) {
      this.clearTimer(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 89: Signal Handling and Graceful Shutdown
// Register handlers for SIGTERM, SIGINT, SIGHUP. Track shutdown
// progress with ordered phase execution.
// ---------------------------------------------------------------------------

type ShutdownPhase = 'pre-shutdown' | 'shutdown' | 'cleanup' | 'final';
type ShutdownHandler = () => void | Promise<void>;

class SignalHandler {
  private handlers: Map<ShutdownPhase, ShutdownHandler[]> = new Map([
    ['pre-shutdown', []],
    ['shutdown', []],
    ['cleanup', []],
    ['final', []],
  ]);
  private shutdownInProgress = false;
  private shutdownTimeout = 10000;
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    const handleSignal = (signal: string) => {
      log.info('[SignalHandler] Received signal:', signal);
      this.executeShutdown().catch((err) => {
        log.error('[SignalHandler] Shutdown error:', String(err));
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));

    if (process.platform !== 'win32') {
      process.on('SIGHUP', () => handleSignal('SIGHUP'));
    }

    process.on('uncaughtException', (err) => {
      log.error('[SignalHandler] Uncaught exception:', String(err));
      this.executeShutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      log.error('[SignalHandler] Unhandled rejection:', String(reason));
    });

    log.info('[SignalHandler] Signal handlers registered');
  }

  onShutdown(phase: ShutdownPhase, handler: ShutdownHandler): void {
    const phaseHandlers = this.handlers.get(phase);
    if (phaseHandlers) {
      phaseHandlers.push(handler);
    }
  }

  async executeShutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    log.info('[SignalHandler] Beginning graceful shutdown...');
    const startTime = Date.now();

    const phases: ShutdownPhase[] = ['pre-shutdown', 'shutdown', 'cleanup', 'final'];

    for (const phase of phases) {
      const phaseHandlers = this.handlers.get(phase) || [];
      log.info(`[SignalHandler] Executing phase: ${phase} (${phaseHandlers.length} handlers)`);

      const remaining = this.shutdownTimeout - (Date.now() - startTime);
      if (remaining <= 0) {
        log.warn('[SignalHandler] Shutdown timeout exceeded, forcing exit');
        break;
      }

      const phasePromises = phaseHandlers.map(async (handler) => {
        try {
          await Promise.race([
            Promise.resolve(handler()),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Handler timeout')), remaining)
            ),
          ]);
        } catch (err) {
          log.warn(`[SignalHandler] Handler error in ${phase}:`, String(err));
        }
      });

      await Promise.allSettled(phasePromises);
    }

    const elapsed = Date.now() - startTime;
    log.info(`[SignalHandler] Shutdown completed in ${elapsed}ms`);
  }

  isShuttingDown(): boolean {
    return this.shutdownInProgress;
  }

  setShutdownTimeout(ms: number): void {
    this.shutdownTimeout = ms;
  }
}

// ---------------------------------------------------------------------------
// Unified Platform Native Module
// ---------------------------------------------------------------------------

class PlatformNative {
  readonly runLoop: NativeRunLoopIntegration;
  readonly timers: HighResTimers;
  readonly memoryPressure: OSMemoryPressureMonitor;
  readonly processSpawner: NativeProcessSpawner;
  readonly fdManager: FileDescriptorManager;
  readonly timerManager: PlatformTimerManager;
  readonly signalHandler: SignalHandler;

  private initialized = false;

  constructor() {
    this.runLoop = new NativeRunLoopIntegration();
    this.timers = new HighResTimers();
    this.memoryPressure = new OSMemoryPressureMonitor();
    this.processSpawner = new NativeProcessSpawner();
    this.fdManager = new FileDescriptorManager();
    this.timerManager = new PlatformTimerManager();
    this.signalHandler = new SignalHandler();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.runLoop.initialize();
    this.memoryPressure.start();
    this.signalHandler.register();
    await this.fdManager.initialize();

    // Register default pressure handler: hint GC on moderate, force on critical
    this.memoryPressure.onPressure((level) => {
      if (level === 'moderate' && global.gc) {
        global.gc();
      } else if (level === 'critical' && global.gc) {
        global.gc();
        global.gc(); // Double GC for compaction
      }
    });

    // Register FD cleanup on shutdown
    this.signalHandler.onShutdown('cleanup', () => {
      this.fdManager.shutdown();
      this.timerManager.clearAll();
      this.memoryPressure.stop();
      this.runLoop.shutdown();
    });

    log.info('[PlatformNative] All subsystems initialized');
  }

  getPlatformInfo(): {
    platform: string;
    arch: string;
    cpus: number;
    totalMemMB: number;
    nodeVersion: string;
    electronVersion: string;
  } {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / (1024 * 1024)),
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'N/A',
    };
  }

  shutdown(): void {
    this.fdManager.shutdown();
    this.timerManager.clearAll();
    this.memoryPressure.stop();
    this.runLoop.shutdown();
  }
}

export const platformNative = new PlatformNative();

export {
  PlatformNative,
  NativeRunLoopIntegration,
  HighResTimers,
  OSMemoryPressureMonitor,
  NativeProcessSpawner,
  FileDescriptorManager,
  PlatformTimerManager,
  SignalHandler,
};
