// ═══════════════════════════════════════════════════════════════════════════
// DEX - Execution Optimizer
// Phase 15: Deep Internal Micro-Optimization
// Optimizes hot paths and reduces redundant operations
// ═══════════════════════════════════════════════════════════════════════════

import log from 'electron-log';
import { BrowserWindow, ipcMain } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// IPC BATCHING - Reduce cross-process communication
// ═══════════════════════════════════════════════════════════════════════════

interface BatchedRequest {
  id: string;
  channel: string;
  args: any[];
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

class IPCBatcherClass {
  private pendingRequests: Map<string, BatchedRequest[]> = new Map();
  private flushTimeout: NodeJS.Timeout | null = null;
  private config = {
    batchDelayMs: 16,     // Batch requests within 16ms (one frame)
    maxBatchSize: 50,
  };

  // Batch multiple IPC calls to the same channel
  batch<T>(channel: string, args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: BatchedRequest = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channel,
        args,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      if (!this.pendingRequests.has(channel)) {
        this.pendingRequests.set(channel, []);
      }

      const batch = this.pendingRequests.get(channel)!;
      batch.push(request);

      // Flush immediately if batch is full
      if (batch.length >= this.config.maxBatchSize) {
        this.flushChannel(channel);
      } else {
        this.scheduleFlush();
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flushAll();
    }, this.config.batchDelayMs);
  }

  private async flushChannel(channel: string): Promise<void> {
    const batch = this.pendingRequests.get(channel);
    if (!batch || batch.length === 0) return;

    this.pendingRequests.delete(channel);

    // If all requests have same args, dedupe
    if (this.canDedupe(batch)) {
      try {
        const result = await ipcMain.emit(channel, null, batch[0].args);
        batch.forEach(req => req.resolve(result));
      } catch (error) {
        batch.forEach(req => req.reject(error));
      }
    } else {
      // Process individually but in parallel
      await Promise.all(
        batch.map(async (req) => {
          try {
            const result = await ipcMain.emit(channel, null, req.args);
            req.resolve(result);
          } catch (error) {
            req.reject(error);
          }
        })
      );
    }
  }

  private flushAll(): void {
    for (const channel of this.pendingRequests.keys()) {
      this.flushChannel(channel);
    }
  }

  private canDedupe(batch: BatchedRequest[]): boolean {
    if (batch.length <= 1) return false;
    const firstArgs = JSON.stringify(batch[0].args);
    return batch.every(req => JSON.stringify(req.args) === firstArgs);
  }
}

export const ipcBatcher = new IPCBatcherClass();

// ═══════════════════════════════════════════════════════════════════════════
// STATE COALESCING - Reduce redundant state updates
// ═══════════════════════════════════════════════════════════════════════════

export class StateCoalescer<T> {
  private pendingUpdate: T | null = null;
  private updateTimeout: NodeJS.Timeout | null = null;
  private coalescingMs: number;
  private applyFn: (state: T) => void;

  constructor(applyFn: (state: T) => void, coalescingMs = 16) {
    this.applyFn = applyFn;
    this.coalescingMs = coalescingMs;
  }

  // Schedule a state update
  update(state: T): void {
    this.pendingUpdate = state;

    if (!this.updateTimeout) {
      this.updateTimeout = setTimeout(() => {
        this.flush();
      }, this.coalescingMs);
    }
  }

  // Force immediate flush
  flush(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }

    if (this.pendingUpdate !== null) {
      this.applyFn(this.pendingUpdate);
      this.pendingUpdate = null;
    }
  }

  dispose(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    this.pendingUpdate = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER BATCH - Batch renderer updates
// ═══════════════════════════════════════════════════════════════════════════

class RenderBatcherClass {
  private pendingUpdates: Map<string, { channel: string; data: any; timestamp: number }> = new Map();
  private batchTimeout: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  
  private config = {
    batchDelayMs: 16,     // One frame
    maxDelayMs: 100,      // Force flush after 100ms
  };

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // Queue an update to be sent to renderer
  send(channel: string, data: any, dedupeKey?: string): void {
    const key = dedupeKey ?? `${channel}-${Date.now()}-${Math.random()}`;
    
    this.pendingUpdates.set(key, {
      channel,
      data,
      timestamp: Date.now(),
    });

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(() => {
      this.flush();
    }, this.config.batchDelayMs);
  }

  flush(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (!this.mainWindow || this.pendingUpdates.size === 0) return;

    // Group updates by channel
    const grouped = new Map<string, any[]>();
    for (const [, update] of this.pendingUpdates) {
      if (!grouped.has(update.channel)) {
        grouped.set(update.channel, []);
      }
      grouped.get(update.channel)!.push(update.data);
    }

    // Send batched updates
    for (const [channel, updates] of grouped) {
      if (updates.length === 1) {
        this.mainWindow.webContents.send(channel, updates[0]);
      } else {
        this.mainWindow.webContents.send(`${channel}:batch`, updates);
      }
    }

    this.pendingUpdates.clear();
  }
}

export const renderBatcher = new RenderBatcherClass();

// ═══════════════════════════════════════════════════════════════════════════
// HOT PATH INSTRUMENTATION - Measure and optimize hot paths
// ═══════════════════════════════════════════════════════════════════════════

interface PathMetrics {
  name: string;
  calls: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  lastMs: number;
}

class HotPathProfilerClass {
  private metrics: Map<string, PathMetrics> = new Map();
  private enabled = process.env.NODE_ENV === 'development';

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  // Wrap a function to measure its execution time
  measure<T extends (...args: any[]) => any>(
    name: string,
    fn: T
  ): T {
    if (!this.enabled) return fn;

    return ((...args: any[]) => {
      const start = performance.now();
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.finally(() => {
          this.record(name, performance.now() - start);
        });
      }

      this.record(name, performance.now() - start);
      return result;
    }) as T;
  }

  // Decorator for methods
  measureMethod(name?: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      const metricName = name ?? `${target.constructor.name}.${propertyKey}`;

      descriptor.value = this.measure(metricName, originalMethod);
      return descriptor;
    };
  }

  // Manual timing
  startTiming(name: string): () => void {
    const start = performance.now();
    return () => {
      this.record(name, performance.now() - start);
    };
  }

  private record(name: string, durationMs: number): void {
    let metrics = this.metrics.get(name);
    
    if (!metrics) {
      metrics = {
        name,
        calls: 0,
        totalMs: 0,
        avgMs: 0,
        maxMs: 0,
        minMs: Infinity,
        lastMs: 0,
      };
      this.metrics.set(name, metrics);
    }

    metrics.calls++;
    metrics.totalMs += durationMs;
    metrics.avgMs = metrics.totalMs / metrics.calls;
    metrics.maxMs = Math.max(metrics.maxMs, durationMs);
    metrics.minMs = Math.min(metrics.minMs, durationMs);
    metrics.lastMs = durationMs;

    // Log slow operations
    if (durationMs > 100) {
      log.warn(`[HotPath] Slow operation: ${name} took ${durationMs.toFixed(2)}ms`);
    }
  }

  getMetrics(): PathMetrics[] {
    return Array.from(this.metrics.values()).sort((a, b) => b.totalMs - a.totalMs);
  }

  getHotPaths(threshold = 10): PathMetrics[] {
    return this.getMetrics().filter(m => m.calls >= threshold);
  }

  reset(): void {
    this.metrics.clear();
  }

  report(): string {
    const metrics = this.getMetrics();
    const lines = [
      '╔════════════════════════════════════════════════════════════════╗',
      '║                     HOT PATH PROFILER REPORT                   ║',
      '╠════════════════════════════════════════════════════════════════╣',
    ];

    for (const m of metrics.slice(0, 20)) {
      lines.push(
        `║ ${m.name.padEnd(30)} │ calls: ${String(m.calls).padStart(6)} │ avg: ${m.avgMs.toFixed(2).padStart(8)}ms ║`
      );
    }

    lines.push('╚════════════════════════════════════════════════════════════════╝');
    return lines.join('\n');
  }
}

export const hotPathProfiler = new HotPathProfilerClass();

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC OPERATIONS - Ensure consistent execution
// ═══════════════════════════════════════════════════════════════════════════

export class DeterministicExecutor {
  private locks: Map<string, Promise<void>> = new Map();
  private queue: Map<string, Array<() => Promise<void>>> = new Map();

  // Execute operations sequentially for a given key
  async executeSequential<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing operation with this key
    const existing = this.locks.get(key);
    if (existing) {
      await existing;
    }

    // Create lock for this operation
    let resolve: () => void;
    const lock = new Promise<void>(r => { resolve = r; });
    this.locks.set(key, lock);

    try {
      return await operation();
    } finally {
      this.locks.delete(key);
      resolve!();
    }
  }

  // Queue operations to run after current one completes
  async queueAfter<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.queue.has(key)) {
        this.queue.set(key, []);
      }

      this.queue.get(key)!.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue(key);
    });
  }

  private async processQueue(key: string): Promise<void> {
    // If already processing, exit
    if (this.locks.has(key)) return;

    const queue = this.queue.get(key);
    if (!queue || queue.length === 0) return;

    const operation = queue.shift()!;
    
    let resolve: () => void;
    const lock = new Promise<void>(r => { resolve = r; });
    this.locks.set(key, lock);

    try {
      await operation();
    } finally {
      this.locks.delete(key);
      resolve!();
      
      // Process next in queue
      if (queue.length > 0) {
        setImmediate(() => this.processQueue(key));
      } else {
        this.queue.delete(key);
      }
    }
  }
}

export const deterministicExecutor = new DeterministicExecutor();
