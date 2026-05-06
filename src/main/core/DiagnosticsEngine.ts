// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Diagnostics Engine
// ==========================================================================
// Feature 51: Crash State Capture (snapshot on error)
// Feature 52: Circular Log Buffer (10K entries)
// Feature 53: Performance Sampling on Slowdown
// Feature 54: Diagnostic Packaging (one-click export)
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Feature 51: Crash State Capture
// ---------------------------------------------------------------------------

export interface CrashSnapshot {
  id: string;
  timestamp: number;
  error: string;
  stack: string;
  processId: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  platform: string;
  nodeVersion: string;
  electronVersion: string;
  activeWindows: number;
  recentEvents: string[];
}

class CrashStateCapture {
  private snapshots: CrashSnapshot[] = [];
  private maxSnapshots = 50;
  private recentEvents: string[] = [];
  private snapshotDir = '';

  initialize(): void {
    this.snapshotDir = path.join(app.getPath('userData'), 'crash-snapshots');
    fs.mkdirSync(this.snapshotDir, { recursive: true });

    // Install global error handlers
    process.on('uncaughtException', (err) => {
      this.captureFromError(err, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.captureFromError(err, 'unhandledRejection');
    });

    log.info('[CrashCapture] Feature 51: Crash state capture initialized');
  }

  recordEvent(event: string): void {
    this.recentEvents.push(`${new Date().toISOString()} ${event}`);
    if (this.recentEvents.length > 100) {
      this.recentEvents = this.recentEvents.slice(-50);
    }
  }

  captureFromError(error: Error, source: string): CrashSnapshot {
    const snapshot: CrashSnapshot = {
      id: `crash-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      error: `[${source}] ${error.message}`,
      stack: error.stack || '',
      processId: process.pid,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      platform: `${process.platform} ${process.arch}`,
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'unknown',
      activeWindows: 0,
      recentEvents: [...this.recentEvents.slice(-20)],
    };

    try {
      const { BrowserWindow } = require('electron');
      snapshot.activeWindows = BrowserWindow.getAllWindows().length;
    } catch { /* ok */ }

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots / 2);
    }

    // Persist to disk
    this.persistSnapshot(snapshot);

    log.error(`[CrashCapture] Snapshot captured: ${snapshot.id} - ${snapshot.error}`);
    return snapshot;
  }

  private persistSnapshot(snapshot: CrashSnapshot): void {
    try {
      const filePath = path.join(this.snapshotDir, `${snapshot.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch { /* ok */ }
  }

  getRecentSnapshots(count: number): CrashSnapshot[] {
    return this.snapshots.slice(-count);
  }

  getSnapshot(id: string): CrashSnapshot | null {
    return this.snapshots.find(s => s.id === id) || null;
  }

  clearSnapshots(): void {
    this.snapshots = [];
    try {
      if (fs.existsSync(this.snapshotDir)) {
        const files = fs.readdirSync(this.snapshotDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.snapshotDir, file));
        }
      }
    } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Feature 52: Circular Log Buffer
// ---------------------------------------------------------------------------

export interface LogBufferEntry {
  index: number;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: unknown;
}

const LOG_BUFFER_MAX = 10_000;

class CircularLogBuffer {
  private buffer: LogBufferEntry[] = [];
  private writeIndex = 0;
  private totalEntries = 0;
  private full = false;

  write(level: 'debug' | 'info' | 'warn' | 'error', source: string, message: string, data?: unknown): void {
    const entry: LogBufferEntry = {
      index: this.totalEntries++,
      timestamp: Date.now(),
      level,
      source,
      message,
      data,
    };

    if (this.buffer.length < LOG_BUFFER_MAX) {
      this.buffer.push(entry);
    } else {
      this.buffer[this.writeIndex] = entry;
      this.full = true;
    }

    this.writeIndex = (this.writeIndex + 1) % LOG_BUFFER_MAX;
  }

  getAll(): LogBufferEntry[] {
    if (!this.full) {
      return [...this.buffer];
    }

    // Return in order: from writeIndex to end, then start to writeIndex
    return [
      ...this.buffer.slice(this.writeIndex),
      ...this.buffer.slice(0, this.writeIndex),
    ];
  }

  getRecent(count: number): LogBufferEntry[] {
    const all = this.getAll();
    return all.slice(-count);
  }

  search(query: string): LogBufferEntry[] {
    const lower = query.toLowerCase();
    return this.getAll().filter(e =>
      e.message.toLowerCase().includes(lower) ||
      e.source.toLowerCase().includes(lower)
    );
  }

  getByLevel(level: 'debug' | 'info' | 'warn' | 'error'): LogBufferEntry[] {
    return this.getAll().filter(e => e.level === level);
  }

  getStats(): { totalEntries: number; bufferSize: number; bufferUsed: number; errorCount: number; warnCount: number } {
    const all = this.getAll();
    return {
      totalEntries: this.totalEntries,
      bufferSize: LOG_BUFFER_MAX,
      bufferUsed: this.buffer.length,
      errorCount: all.filter(e => e.level === 'error').length,
      warnCount: all.filter(e => e.level === 'warn').length,
    };
  }

  clear(): void {
    this.buffer = [];
    this.writeIndex = 0;
    this.totalEntries = 0;
    this.full = false;
  }
}

// ---------------------------------------------------------------------------
// Feature 53: Performance Sampling on Slowdown
// ---------------------------------------------------------------------------

interface PerfSample {
  timestamp: number;
  eventLoopLag: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  cpuPercent: number;
  gcPauses: number;
}

const PERF_SAMPLE_INTERVAL_MS = 5000;
const SLOWDOWN_THRESHOLD_MS = 50; // Event loop lag > 50ms = slowdown

class PerformanceSampler {
  private samples: PerfSample[] = [];
  private maxSamples = 1000;
  private sampleInterval: NodeJS.Timeout | null = null;
  private slowdownCallbacks: Array<(sample: PerfSample) => void> = [];
  private lastSampleTime = 0;
  private slowdownCount = 0;

  initialize(): void {
    this.lastSampleTime = Date.now();
    this.sampleInterval = setInterval(() => {
      this.takeSample();
    }, PERF_SAMPLE_INTERVAL_MS);
    log.info('[PerfSampler] Feature 53: Performance sampler initialized');
  }

  private takeSample(): void {
    const now = Date.now();
    const expectedInterval = PERF_SAMPLE_INTERVAL_MS;
    const actualInterval = now - this.lastSampleTime;
    const eventLoopLag = Math.max(0, actualInterval - expectedInterval);
    this.lastSampleTime = now;

    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const sample: PerfSample = {
      timestamp: now,
      eventLoopLag,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      cpuPercent: (cpu.user + cpu.system) / 1000 / actualInterval * 100,
      gcPauses: 0, // Would need V8 profiler for actual GC tracking
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples / 2);
    }

    // Detect slowdown
    if (eventLoopLag > SLOWDOWN_THRESHOLD_MS) {
      this.slowdownCount++;
      circularLogBuffer.write('warn', 'perf-sampler', `Event loop lag: ${eventLoopLag}ms`);

      for (const cb of this.slowdownCallbacks) {
        try { cb(sample); } catch { /* ok */ }
      }

      // Auto-increase sampling frequency during slowdown
      if (this.sampleInterval && eventLoopLag > 200) {
        clearInterval(this.sampleInterval);
        this.sampleInterval = setInterval(() => this.takeSample(), 1000);

        // Restore normal interval after 30 seconds
        setTimeout(() => {
          if (this.sampleInterval) {
            clearInterval(this.sampleInterval);
            this.sampleInterval = setInterval(() => this.takeSample(), PERF_SAMPLE_INTERVAL_MS);
          }
        }, 30_000);
      }
    }
  }

  onSlowdown(callback: (sample: PerfSample) => void): () => void {
    this.slowdownCallbacks.push(callback);
    return () => {
      this.slowdownCallbacks = this.slowdownCallbacks.filter(c => c !== callback);
    };
  }

  getRecentSamples(count: number): PerfSample[] {
    return this.samples.slice(-count);
  }

  getAverages(): { avgLag: number; avgHeapMB: number; avgCpu: number } {
    if (this.samples.length === 0) return { avgLag: 0, avgHeapMB: 0, avgCpu: 0 };

    const recent = this.samples.slice(-60); // Last ~5 minutes
    const avgLag = recent.reduce((sum, s) => sum + s.eventLoopLag, 0) / recent.length;
    const avgHeap = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
    const avgCpu = recent.reduce((sum, s) => sum + s.cpuPercent, 0) / recent.length;

    return {
      avgLag: Math.round(avgLag * 10) / 10,
      avgHeapMB: Math.round(avgHeap / 1024 / 1024),
      avgCpu: Math.round(avgCpu * 10) / 10,
    };
  }

  getSlowdownCount(): number {
    return this.slowdownCount;
  }

  shutdown(): void {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
    this.slowdownCallbacks = [];
  }
}

// ---------------------------------------------------------------------------
// Feature 54: Diagnostic Packaging
// ---------------------------------------------------------------------------

class DiagnosticPackager {
  async createPackage(): Promise<{ filePath: string; sizeBytes: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const packageDir = path.join(app.getPath('userData'), 'diagnostics');
    fs.mkdirSync(packageDir, { recursive: true });
    const packagePath = path.join(packageDir, `dex-diag-${timestamp}.json.gz`);

    const diagnosticData = {
      generatedAt: new Date().toISOString(),
      version: '2.0.1',
      platform: {
        os: `${os.platform()} ${os.release()} ${os.arch()}`,
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        nodeVersion: process.version,
        electronVersion: process.versions.electron || 'unknown',
        uptime: process.uptime(),
      },
      process: {
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      logs: circularLogBuffer.getRecent(500),
      performance: {
        samples: performanceSampler.getRecentSamples(100),
        averages: performanceSampler.getAverages(),
        slowdowns: performanceSampler.getSlowdownCount(),
      },
      crashes: crashCapture.getRecentSnapshots(10),
    };

    const json = JSON.stringify(diagnosticData, null, 2);
    const compressed = zlib.gzipSync(json, { level: 6 });

    await fs.promises.writeFile(packagePath, compressed);

    const sizeBytes = compressed.length;
    log.info(`[DiagnosticPackager] Feature 54: Created diagnostic package: ${packagePath} (${Math.round(sizeBytes / 1024)}KB)`);

    return { filePath: packagePath, sizeBytes };
  }

  async listPackages(): Promise<Array<{ name: string; path: string; sizeBytes: number; createdAt: number }>> {
    const packageDir = path.join(app.getPath('userData'), 'diagnostics');
    if (!fs.existsSync(packageDir)) return [];

    const files = await fs.promises.readdir(packageDir);
    const packages: Array<{ name: string; path: string; sizeBytes: number; createdAt: number }> = [];

    for (const file of files) {
      if (file.startsWith('dex-diag-') && file.endsWith('.json.gz')) {
        const filePath = path.join(packageDir, file);
        const stat = await fs.promises.stat(filePath);
        packages.push({
          name: file,
          path: filePath,
          sizeBytes: stat.size,
          createdAt: stat.birthtimeMs,
        });
      }
    }

    return packages.sort((a, b) => b.createdAt - a.createdAt);
  }

  async cleanupOldPackages(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const packages = await this.listPackages();
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const pkg of packages) {
      if (pkg.createdAt < cutoff) {
        try {
          await fs.promises.unlink(pkg.path);
          cleaned++;
        } catch { /* ok */ }
      }
    }

    return cleaned;
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const crashCapture = new CrashStateCapture();
export const circularLogBuffer = new CircularLogBuffer();
export const performanceSampler = new PerformanceSampler();
export const diagnosticPackager = new DiagnosticPackager();

export function initializeDiagnosticsEngine(): void {
  crashCapture.initialize();
  performanceSampler.initialize();
  log.info('[DiagnosticsEngine] Features 51-54: Diagnostics engine initialized');
}

export function shutdownDiagnosticsEngine(): void {
  performanceSampler.shutdown();
}
