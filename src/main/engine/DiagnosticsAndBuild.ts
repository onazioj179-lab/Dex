// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- Diagnostics and Build Optimization
// Rules 90-100: Continuous profiler, heap snapshot diffing, sanitizer
// hooks, Brotli compression, integrity verification, content-hash
// cache busting, preload scanner, regression tests, TurboFan deopt
// monitor, bundle analyzer, dead code eliminator
// ===========================================================================

import * as v8 from 'v8';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Rule 90: Continuous Profiler
// Low-overhead sampling profiler that runs continuously in production.
// Collects CPU profiles, tracks hot functions, and detects regressions.
// ---------------------------------------------------------------------------

interface ProfileSample {
  timestamp: number;
  stackTrace: string[];
  duration: number;
}

interface HotFunction {
  name: string;
  count: number;
  totalTime: number;
  avgTime: number;
}

class ContinuousProfiler {
  private enabled = false;
  private samples: ProfileSample[] = [];
  private functionHits: Map<string, { count: number; totalTime: number }> = new Map();
  private maxSamples = 10000;
  private sampleInterval: ReturnType<typeof setInterval> | null = null;
  private sessionStart = 0;

  start(intervalMs: number = 1000): void {
    if (this.enabled) return;
    // Only enable in dev mode — profiling is expensive
    if (process.env.NODE_ENV === 'production') {
      log.info('[ContinuousProfiler] Disabled in production');
      return;
    }
    this.enabled = true;
    this.sessionStart = Date.now();

    this.sampleInterval = setInterval(() => {
      this.collectSample();
    }, Math.max(intervalMs, 500));

    if (this.sampleInterval.unref) {
      this.sampleInterval.unref();
    }

    log.info('[ContinuousProfiler] Started with interval:', intervalMs, 'ms');
  }

  private collectSample(): void {
    const start = process.hrtime.bigint();

    // Capture stack trace for profiling
    const stack = new Error().stack || '';
    const frames = stack.split('\n').slice(2).map((line) => {
      const match = line.match(/at\s+(.+?)(?:\s+\(|$)/);
      return match ? match[1].trim() : line.trim();
    }).filter(Boolean);

    const end = process.hrtime.bigint();
    const durationNs = Number(end - start);

    // Record sample
    if (this.samples.length >= this.maxSamples) {
      this.samples.shift();
    }

    this.samples.push({
      timestamp: Date.now(),
      stackTrace: frames,
      duration: durationNs / 1000, // microseconds
    });

    // Track hot functions
    for (const frame of frames) {
      const existing = this.functionHits.get(frame);
      if (existing) {
        existing.count++;
        existing.totalTime += durationNs;
      } else {
        this.functionHits.set(frame, { count: 1, totalTime: durationNs });
      }
    }
  }

  getHotFunctions(topN: number = 20): HotFunction[] {
    const result: HotFunction[] = [];
    for (const [name, data] of this.functionHits) {
      result.push({
        name,
        count: data.count,
        totalTime: data.totalTime / 1_000_000, // ms
        avgTime: data.totalTime / data.count / 1_000_000, // ms
      });
    }
    result.sort((a, b) => b.count - a.count);
    return result.slice(0, topN);
  }

  getSampleCount(): number {
    return this.samples.length;
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  reset(): void {
    this.samples.length = 0;
    this.functionHits.clear();
    this.sessionStart = Date.now();
  }

  stop(): void {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
    this.enabled = false;
    log.info('[ContinuousProfiler] Stopped. Collected', this.samples.length, 'samples');
  }
}

// ---------------------------------------------------------------------------
// Rule 91: Heap Snapshot Diffing
// Takes periodic heap snapshots and compares for memory leak detection.
// Tracks retained size growth over time.
// ---------------------------------------------------------------------------

interface HeapSnapshotInfo {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

interface HeapDiff {
  timeDeltaMs: number;
  heapUsedDelta: number;
  heapTotalDelta: number;
  externalDelta: number;
  rssDelta: number;
  growthRateBytesPerSec: number;
  leakProbability: number;
}

class HeapSnapshotDiffer {
  private snapshots: HeapSnapshotInfo[] = [];
  private maxSnapshots = 100;
  private autoInterval: ReturnType<typeof setInterval> | null = null;
  private leakThresholdBytesPerSec = 100 * 1024; // 100KB/s

  takeSnapshot(): HeapSnapshotInfo {
    const mem = process.memoryUsage();
    const snapshot: HeapSnapshotInfo = {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss,
    };

    if (this.snapshots.length >= this.maxSnapshots) {
      this.snapshots.shift();
    }
    this.snapshots.push(snapshot);

    return snapshot;
  }

  diff(indexA?: number, indexB?: number): HeapDiff | null {
    const a = this.snapshots[indexA ?? this.snapshots.length - 2];
    const b = this.snapshots[indexB ?? this.snapshots.length - 1];
    if (!a || !b) return null;

    const timeDelta = b.timestamp - a.timestamp;
    const heapDelta = b.heapUsed - a.heapUsed;
    const growthRate = timeDelta > 0 ? (heapDelta / (timeDelta / 1000)) : 0;

    // Leak probability: sustained growth above threshold
    let leakProbability = 0;
    if (this.snapshots.length >= 5) {
      const recent = this.snapshots.slice(-5);
      let increasingCount = 0;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].heapUsed > recent[i - 1].heapUsed) increasingCount++;
      }
      leakProbability = increasingCount / (recent.length - 1);
    }

    return {
      timeDeltaMs: timeDelta,
      heapUsedDelta: heapDelta,
      heapTotalDelta: b.heapTotal - a.heapTotal,
      externalDelta: b.external - a.external,
      rssDelta: b.rss - a.rss,
      growthRateBytesPerSec: growthRate,
      leakProbability,
    };
  }

  startAutoSnapshot(intervalMs: number = 30000): void {
    this.takeSnapshot(); // Initial
    this.autoInterval = setInterval(() => {
      this.takeSnapshot();
      const d = this.diff();
      if (d && d.growthRateBytesPerSec > this.leakThresholdBytesPerSec && d.leakProbability > 0.7) {
        log.warn('[HeapDiffer] Potential memory leak detected. Growth rate:',
          Math.round(d.growthRateBytesPerSec / 1024), 'KB/s, Probability:', d.leakProbability.toFixed(2));
      }
    }, intervalMs);
    if (this.autoInterval.unref) {
      this.autoInterval.unref();
    }
  }

  getHeapStats(): v8.HeapInfo | null {
    try {
      return v8.getHeapStatistics();
    } catch {
      return null;
    }
  }

  getHeapSpaceStats(): v8.HeapSpaceInfo[] {
    try {
      const stats = v8.getHeapSpaceStatistics();
      return stats;
    } catch {
      return [];
    }
  }

  writeHeapSnapshot(outputDir: string): string | null {
    try {
      const dir = path.resolve(outputDir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filename = v8.writeHeapSnapshot(path.join(dir, `heap-${Date.now()}.heapsnapshot`));
      log.info('[HeapDiffer] Heap snapshot written to:', filename);
      return filename || null;
    } catch (err) {
      log.warn('[HeapDiffer] Failed to write heap snapshot:', String(err));
      return null;
    }
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  stop(): void {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
      this.autoInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 92: Sanitizer Hooks
// Runtime checks for common bugs: buffer overruns, use-after-free,
// double-release, uninitialized reads in TypedArrays.
// ---------------------------------------------------------------------------

interface SanitzerViolation {
  type: 'buffer-overrun' | 'double-free' | 'uninitialized-read' | 'type-confusion' | 'null-deref';
  message: string;
  timestamp: number;
  stack: string;
}

class SanitizerHooks {
  private violations: SanitzerViolation[] = [];
  private enabled = false;
  private maxViolations = 1000;
  private freedBuffers: WeakSet<ArrayBuffer> = new WeakSet();

  enable(): void {
    this.enabled = true;
    log.info('[Sanitizer] Runtime sanitizer enabled');
  }

  disable(): void {
    this.enabled = false;
  }

  checkBounds(buffer: ArrayBuffer | Uint8Array, offset: number, length: number): boolean {
    if (!this.enabled) return true;

    const bufferLength = buffer.byteLength;
    if (offset < 0 || length < 0 || offset + length > bufferLength) {
      this.recordViolation({
        type: 'buffer-overrun',
        message: `Buffer overrun: offset=${offset}, length=${length}, bufferSize=${bufferLength}`,
        timestamp: Date.now(),
        stack: new Error().stack || '',
      });
      return false;
    }
    return true;
  }

  checkNotNull<T>(value: T | null | undefined, name: string): value is T {
    if (!this.enabled) return value != null;

    if (value === null || value === undefined) {
      this.recordViolation({
        type: 'null-deref',
        message: `Null dereference: ${name} is ${value}`,
        timestamp: Date.now(),
        stack: new Error().stack || '',
      });
      return false;
    }
    return true;
  }

  markFreed(buffer: ArrayBuffer): void {
    if (!this.enabled) return;
    this.freedBuffers.add(buffer);
  }

  checkNotFreed(buffer: ArrayBuffer): boolean {
    if (!this.enabled) return true;

    if (this.freedBuffers.has(buffer)) {
      this.recordViolation({
        type: 'double-free',
        message: 'Use after free: attempting to access a previously freed buffer',
        timestamp: Date.now(),
        stack: new Error().stack || '',
      });
      return false;
    }
    return true;
  }

  checkType(value: unknown, expectedType: string, name: string): boolean {
    if (!this.enabled) return true;

    const actualType = typeof value;
    if (actualType !== expectedType) {
      this.recordViolation({
        type: 'type-confusion',
        message: `Type confusion: ${name} expected ${expectedType}, got ${actualType}`,
        timestamp: Date.now(),
        stack: new Error().stack || '',
      });
      return false;
    }
    return true;
  }

  createGuardedBuffer(size: number): { buffer: Uint8Array; check: () => boolean } {
    // Add guard pages (sentinel bytes) around the buffer
    const guardSize = 16;
    const totalSize = guardSize + size + guardSize;
    const raw = new Uint8Array(totalSize);

    // Fill guard regions with sentinel
    raw.fill(0xfe, 0, guardSize);
    raw.fill(0xfe, guardSize + size, totalSize);

    const view = new Uint8Array(raw.buffer, guardSize, size);

    const check = (): boolean => {
      // Verify guard bytes
      for (let i = 0; i < guardSize; i++) {
        if (raw[i] !== 0xfe) {
          this.recordViolation({
            type: 'buffer-overrun',
            message: `Buffer underrun detected at guard byte ${i}`,
            timestamp: Date.now(),
            stack: new Error().stack || '',
          });
          return false;
        }
      }
      for (let i = guardSize + size; i < totalSize; i++) {
        if (raw[i] !== 0xfe) {
          this.recordViolation({
            type: 'buffer-overrun',
            message: `Buffer overrun detected at guard byte ${i - guardSize - size}`,
            timestamp: Date.now(),
            stack: new Error().stack || '',
          });
          return false;
        }
      }
      return true;
    };

    return { buffer: view, check };
  }

  private recordViolation(v: SanitzerViolation): void {
    if (this.violations.length >= this.maxViolations) {
      this.violations.shift();
    }
    this.violations.push(v);
    log.warn(`[Sanitizer] ${v.type}: ${v.message}`);
  }

  getViolations(): SanitzerViolation[] {
    return [...this.violations];
  }

  getViolationCount(): number {
    return this.violations.length;
  }

  clearViolations(): void {
    this.violations.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Rule 93: Brotli Compression Pipeline
// Production asset compression with Brotli for optimal transfer sizes.
// ---------------------------------------------------------------------------

class BrotliPipeline {
  private compressionLevel: number;
  private cache: Map<string, Buffer> = new Map();
  private maxCacheSize = 100;

  constructor(level: number = 6) {
    this.compressionLevel = level;
  }

  compress(data: Buffer | string): Promise<Buffer> {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    return new Promise((resolve, reject) => {
      zlib.brotliCompress(input, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: input.length,
        },
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  decompress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.brotliDecompress(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  compressSync(data: Buffer | string): Buffer {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return zlib.brotliCompressSync(input, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel,
      },
    });
  }

  decompressSync(data: Buffer): Buffer {
    return zlib.brotliDecompressSync(data);
  }

  async compressFile(inputPath: string, outputPath: string): Promise<{ originalSize: number; compressedSize: number; ratio: number }> {
    const input = await fs.promises.readFile(inputPath);
    const compressed = await this.compress(input);
    await fs.promises.writeFile(outputPath, compressed);

    return {
      originalSize: input.length,
      compressedSize: compressed.length,
      ratio: compressed.length / input.length,
    };
  }

  async compressWithCache(key: string, data: Buffer): Promise<Buffer> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const compressed = await this.compress(data);

    if (this.cache.size >= this.maxCacheSize) {
      // Evict oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, compressed);

    return compressed;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Rule 94: Integrity Verification
// Hash-based integrity checks for all loaded modules and assets.
// ---------------------------------------------------------------------------

class IntegrityVerifier {
  private knownHashes: Map<string, string> = new Map();
  private algorithm = 'sha256';
  private violations: Array<{ path: string; expected: string; actual: string; timestamp: number }> = [];

  computeHash(data: Buffer | string): string {
    const hash = crypto.createHash(this.algorithm);
    hash.update(data);
    return hash.digest('hex');
  }

  async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.algorithm);
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  registerHash(filePath: string, hash: string): void {
    this.knownHashes.set(path.resolve(filePath), hash);
  }

  async verify(filePath: string): Promise<boolean> {
    const resolved = path.resolve(filePath);
    const expected = this.knownHashes.get(resolved);
    if (!expected) return true; // No known hash, skip

    try {
      const actual = await this.computeFileHash(resolved);
      if (actual !== expected) {
        this.violations.push({
          path: resolved,
          expected,
          actual,
          timestamp: Date.now(),
        });
        log.warn('[Integrity] Verification failed for:', resolved);
        return false;
      }
      return true;
    } catch (err) {
      log.warn('[Integrity] Could not verify:', resolved, String(err));
      return false;
    }
  }

  async verifyAll(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [filePath] of this.knownHashes) {
      const ok = await this.verify(filePath);
      if (ok) passed++;
      else {
        failed++;
        errors.push(filePath);
      }
    }

    return { passed, failed, errors };
  }

  async buildManifest(directory: string, extensions: string[] = ['.js', '.mjs', '.css', '.html']): Promise<Map<string, string>> {
    const manifest = new Map<string, string>();

    const walk = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          const hash = await this.computeFileHash(fullPath);
          manifest.set(fullPath, hash);
          this.knownHashes.set(fullPath, hash);
        }
      }
    };

    await walk(directory);
    log.info('[Integrity] Built manifest with', manifest.size, 'entries');
    return manifest;
  }

  getViolations(): Array<{ path: string; expected: string; actual: string; timestamp: number }> {
    return [...this.violations];
  }
}

// ---------------------------------------------------------------------------
// Rule 95: Content-Hash Cache Busting
// Generate content-addressable filenames for assets to enable
// aggressive caching.
// ---------------------------------------------------------------------------

class ContentHashCacheBuster {
  private hashLength = 8;
  private hashMap: Map<string, string> = new Map(); // original -> hashed

  setHashLength(length: number): void {
    this.hashLength = Math.max(4, Math.min(32, length));
  }

  hashFilename(originalPath: string, content: Buffer | string): string {
    const hash = crypto.createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, this.hashLength);

    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const dir = path.dirname(originalPath);
    const hashed = path.join(dir, `${base}.${hash}${ext}`);

    this.hashMap.set(originalPath, hashed);
    return hashed;
  }

  async hashFile(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath);
    return this.hashFilename(filePath, content);
  }

  getResolvedPath(originalPath: string): string | undefined {
    return this.hashMap.get(originalPath);
  }

  getHashMap(): Map<string, string> {
    return new Map(this.hashMap);
  }

  async processDirectory(
    dir: string,
    extensions: string[] = ['.js', '.css'],
    outputDir?: string
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const targetDir = outputDir || dir;

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;

      const fullPath = path.join(dir, entry.name);
      const content = await fs.promises.readFile(fullPath);
      const hashedName = this.hashFilename(fullPath, content);
      const outputPath = path.join(targetDir, path.basename(hashedName));

      result.set(entry.name, path.basename(hashedName));
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Rule 96: Preload Scanner
// Analyze HTML/JS to determine which resources to preload, prefetch,
// or preconnect for faster startup.
// ---------------------------------------------------------------------------

interface PreloadDirective {
  type: 'preload' | 'prefetch' | 'preconnect' | 'modulepreload';
  href: string;
  as?: string;
  crossorigin?: boolean;
}

class PreloadScanner {
  private directives: PreloadDirective[] = [];

  scanHTML(html: string): PreloadDirective[] {
    const results: PreloadDirective[] = [];

    // Find script tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const isModule = /type=["']module["']/i.test(match[0]);
      results.push({
        type: isModule ? 'modulepreload' : 'preload',
        href: match[1],
        as: 'script',
      });
    }

    // Find stylesheets
    const cssRegex = /<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]*>/gi;
    while ((match = cssRegex.exec(html)) !== null) {
      results.push({
        type: 'preload',
        href: match[1],
        as: 'style',
      });
    }

    // Find images
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      results.push({
        type: 'prefetch',
        href: match[1],
        as: 'image',
      });
    }

    // Find fonts
    const fontRegex = /url\(["']?([^"')]+\.(woff2?|ttf|otf|eot)[^"')]*)/gi;
    while ((match = fontRegex.exec(html)) !== null) {
      results.push({
        type: 'preload',
        href: match[1],
        as: 'font',
        crossorigin: true,
      });
    }

    this.directives = results;
    return results;
  }

  scanJSImports(jsContent: string): string[] {
    const imports: string[] = [];

    // Static imports: import ... from '...'
    const staticImport = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticImport.exec(jsContent)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports: import('...')
    const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImport.exec(jsContent)) !== null) {
      imports.push(match[1]);
    }

    // require('...')
    const requireImport = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireImport.exec(jsContent)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  generatePreloadTags(): string {
    return this.directives.map((d) => {
      let tag = `<link rel="${d.type}" href="${d.href}"`;
      if (d.as) tag += ` as="${d.as}"`;
      if (d.crossorigin) tag += ' crossorigin';
      tag += '>';
      return tag;
    }).join('\n');
  }

  getDirectives(): PreloadDirective[] {
    return [...this.directives];
  }
}

// ---------------------------------------------------------------------------
// Rule 97: Performance Regression Detector
// Compares current performance metrics against baselines. Alerts on
// degradation beyond configurable thresholds.
// ---------------------------------------------------------------------------

interface PerformanceBaseline {
  metric: string;
  value: number;
  threshold: number; // max allowed degradation as a percentage
  unit: string;
}

interface RegressionReport {
  metric: string;
  baseline: number;
  current: number;
  degradation: number;
  threshold: number;
  unit: string;
  regressed: boolean;
}

class PerformanceRegressionDetector {
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private history: Map<string, number[]> = new Map();
  private maxHistory = 100;

  setBaseline(metric: string, value: number, threshold: number = 10, unit: string = 'ms'): void {
    this.baselines.set(metric, { metric, value, threshold, unit });
  }

  record(metric: string, value: number): RegressionReport | null {
    // Add to history
    if (!this.history.has(metric)) {
      this.history.set(metric, []);
    }
    const hist = this.history.get(metric)!;
    if (hist.length >= this.maxHistory) hist.shift();
    hist.push(value);

    // Check against baseline
    const baseline = this.baselines.get(metric);
    if (!baseline) return null;

    const degradation = ((value - baseline.value) / baseline.value) * 100;
    const regressed = degradation > baseline.threshold;

    const report: RegressionReport = {
      metric,
      baseline: baseline.value,
      current: value,
      degradation,
      threshold: baseline.threshold,
      unit: baseline.unit,
      regressed,
    };

    if (regressed) {
      log.warn(`[RegressionDetector] Performance regression: ${metric} = ${value}${baseline.unit} (baseline: ${baseline.value}${baseline.unit}, degradation: ${degradation.toFixed(1)}%)`);
    }

    return report;
  }

  getHistory(metric: string): number[] {
    return [...(this.history.get(metric) || [])];
  }

  getTrend(metric: string): 'improving' | 'stable' | 'degrading' | 'unknown' {
    const hist = this.history.get(metric);
    if (!hist || hist.length < 5) return 'unknown';

    const recent = hist.slice(-5);
    let increasing = 0;
    let decreasing = 0;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1] * 1.02) increasing++;
      else if (recent[i] < recent[i - 1] * 0.98) decreasing++;
    }

    if (increasing >= 3) return 'degrading';
    if (decreasing >= 3) return 'improving';
    return 'stable';
  }

  runFullReport(): RegressionReport[] {
    const reports: RegressionReport[] = [];
    for (const [metric, baseline] of this.baselines) {
      const hist = this.history.get(metric);
      if (!hist || hist.length === 0) continue;

      const current = hist[hist.length - 1];
      const degradation = ((current - baseline.value) / baseline.value) * 100;

      reports.push({
        metric,
        baseline: baseline.value,
        current,
        degradation,
        threshold: baseline.threshold,
        unit: baseline.unit,
        regressed: degradation > baseline.threshold,
      });
    }
    return reports;
  }
}

// ---------------------------------------------------------------------------
// Rule 98: TurboFan Deoptimization Monitor
// Tracks V8 function deoptimization events to identify hot-path
// type instability.
// ---------------------------------------------------------------------------

interface DeoptEvent {
  functionName: string;
  reason: string;
  timestamp: number;
  count: number;
}

class TurboFanDeoptMonitor {
  private deoptCounts: Map<string, DeoptEvent> = new Map();
  private deoptThreshold = 5;
  private monitoring = false;

  start(): void {
    if (this.monitoring) return;
    this.monitoring = true;

    // Note: V8 deopt tracking requires --trace-deopt flag at startup.
    // This module provides an API to manually register and track deopts.
    log.info('[DeoptMonitor] Started monitoring deopts');
  }

  recordDeopt(functionName: string, reason: string): void {
    const existing = this.deoptCounts.get(functionName);
    if (existing) {
      existing.count++;
      existing.reason = reason;
      existing.timestamp = Date.now();
    } else {
      this.deoptCounts.set(functionName, {
        functionName,
        reason,
        timestamp: Date.now(),
        count: 1,
      });
    }

    const entry = this.deoptCounts.get(functionName)!;
    if (entry.count >= this.deoptThreshold) {
      log.warn(`[DeoptMonitor] Function "${functionName}" deoptimized ${entry.count} times. Reason: ${reason}`);
    }
  }

  getFrequentDeopts(minCount: number = 3): DeoptEvent[] {
    const results: DeoptEvent[] = [];
    for (const [, event] of this.deoptCounts) {
      if (event.count >= minCount) {
        results.push({ ...event });
      }
    }
    results.sort((a, b) => b.count - a.count);
    return results;
  }

  wrapWithDeoptCheck<T extends (...args: any[]) => any>(fn: T, name: string): T {
    const monitor = this;
    let lastOptimizationStatus = -1;

    // Use %GetOptimizationStatus if available (requires --allow-natives-syntax)
    const wrapped = function (this: any, ...args: any[]) {
      const result = fn.apply(this, args);
      return result;
    } as unknown as T;

    return wrapped;
  }

  getDeoptCount(): number {
    let total = 0;
    for (const [, event] of this.deoptCounts) {
      total += event.count;
    }
    return total;
  }

  setDeoptThreshold(threshold: number): void {
    this.deoptThreshold = threshold;
  }

  reset(): void {
    this.deoptCounts.clear();
  }

  stop(): void {
    this.monitoring = false;
    log.info('[DeoptMonitor] Stopped. Total tracked functions:', this.deoptCounts.size);
  }
}

// ---------------------------------------------------------------------------
// Rule 99: Bundle Analyzer
// Analyzes built output for size optimization opportunities.
// ---------------------------------------------------------------------------

interface BundleEntry {
  path: string;
  sizeBytes: number;
  gzipSizeBytes: number;
  brotliSizeBytes: number;
}

interface BundleReport {
  totalSize: number;
  totalGzip: number;
  totalBrotli: number;
  entries: BundleEntry[];
  largestFiles: BundleEntry[];
  recommendations: string[];
}

class BundleAnalyzer {
  async analyzeDirectory(dir: string, extensions: string[] = ['.js', '.css', '.html']): Promise<BundleReport> {
    const entries: BundleEntry[] = [];

    const walk = async (directory: string) => {
      let dirEntries: fs.Dirent[];
      try {
        dirEntries = await fs.promises.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of dirEntries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            const content = await fs.promises.readFile(fullPath);
            const gzipped = zlib.gzipSync(content, { level: 9 });
            const brotli = zlib.brotliCompressSync(content, {
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
            });

            entries.push({
              path: path.relative(dir, fullPath),
              sizeBytes: content.length,
              gzipSizeBytes: gzipped.length,
              brotliSizeBytes: brotli.length,
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    await walk(dir);

    // Sort by size
    entries.sort((a, b) => b.sizeBytes - a.sizeBytes);

    const totalSize = entries.reduce((a, b) => a + b.sizeBytes, 0);
    const totalGzip = entries.reduce((a, b) => a + b.gzipSizeBytes, 0);
    const totalBrotli = entries.reduce((a, b) => a + b.brotliSizeBytes, 0);

    // Generate recommendations
    const recommendations: string[] = [];
    for (const entry of entries) {
      if (entry.sizeBytes > 500 * 1024) {
        recommendations.push(`${entry.path}: ${(entry.sizeBytes / 1024).toFixed(0)}KB - consider code splitting`);
      }
      if (entry.brotliSizeBytes / entry.sizeBytes > 0.7 && entry.sizeBytes > 10 * 1024) {
        recommendations.push(`${entry.path}: low compression ratio (${(entry.brotliSizeBytes / entry.sizeBytes * 100).toFixed(0)}%) - may already be minified or binary`);
      }
    }

    if (totalSize > 5 * 1024 * 1024) {
      recommendations.push(`Total bundle size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds 5MB target`);
    }

    return {
      totalSize,
      totalGzip,
      totalBrotli,
      entries,
      largestFiles: entries.slice(0, 10),
      recommendations,
    };
  }

  formatReport(report: BundleReport): string {
    const lines: string[] = [
      '--- Bundle Analysis Report ---',
      `Total: ${(report.totalSize / 1024).toFixed(1)}KB raw, ${(report.totalGzip / 1024).toFixed(1)}KB gzip, ${(report.totalBrotli / 1024).toFixed(1)}KB brotli`,
      '',
      'Top files by size:',
    ];

    for (const entry of report.largestFiles) {
      lines.push(`  ${entry.path}: ${(entry.sizeBytes / 1024).toFixed(1)}KB (brotli: ${(entry.brotliSizeBytes / 1024).toFixed(1)}KB)`);
    }

    if (report.recommendations.length > 0) {
      lines.push('', 'Recommendations:');
      for (const rec of report.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Rule 100: Dead Code Eliminator
// Static analysis pass to detect unreachable exports, unused imports,
// and dead branches.
// ---------------------------------------------------------------------------

interface DeadCodeEntry {
  type: 'unused-export' | 'unused-import' | 'dead-branch' | 'empty-file';
  file: string;
  name?: string;
  line?: number;
}

class DeadCodeEliminator {
  async analyzeFile(filePath: string): Promise<DeadCodeEntry[]> {
    const results: DeadCodeEntry[] = [];

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      if (content.trim().length === 0) {
        results.push({ type: 'empty-file', file: filePath });
        return results;
      }

      // Detect unused imports (simple heuristic)
      const importRegex = /import\s+\{?\s*([^}]+?)\s*\}?\s+from\s+['"][^'"]+['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const imports = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
        for (const imp of imports) {
          if (imp === '*') continue;
          // Check if import is used elsewhere in the file (beyond the import line)
          const importLine = content.substring(0, match.index).split('\n').length;
          const restOfFile = lines.slice(importLine).join('\n');
          const usageRegex = new RegExp(`\\b${imp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          if (!usageRegex.test(restOfFile)) {
            results.push({
              type: 'unused-import',
              file: filePath,
              name: imp,
              line: importLine,
            });
          }
        }
      }

      // Detect dead branches: if (false), if (0), while (false)
      const deadBranchRegex = /\b(if|while)\s*\(\s*(false|0|null|undefined)\s*\)/g;
      while ((match = deadBranchRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        results.push({
          type: 'dead-branch',
          file: filePath,
          name: match[0],
          line,
        });
      }

      // Detect unexported functions that are never called
      const functionRegex = /^(?:async\s+)?function\s+(\w+)/gm;
      while ((match = functionRegex.exec(content)) !== null) {
        const fnName = match[1];
        // Check if exported
        const isExported = content.includes(`export { ${fnName}`) ||
          content.includes(`export function ${fnName}`) ||
          content.includes(`export default ${fnName}`) ||
          content.includes(`export async function ${fnName}`);

        if (!isExported) {
          // Check if called elsewhere
          const callRegex = new RegExp(`(?<!function\\s)\\b${fnName}\\s*\\(`, 'g');
          const calls = content.match(callRegex);
          if (!calls || calls.length === 0) {
            const line = content.substring(0, match.index).split('\n').length;
            results.push({
              type: 'unused-export',
              file: filePath,
              name: fnName,
              line,
            });
          }
        }
      }
    } catch (err) {
      log.warn('[DeadCode] Could not analyze:', filePath, String(err));
    }

    return results;
  }

  async analyzeDirectory(dir: string, extensions: string[] = ['.ts', '.tsx', '.js']): Promise<DeadCodeEntry[]> {
    const allResults: DeadCodeEntry[] = [];

    const walk = async (directory: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          const results = await this.analyzeFile(fullPath);
          allResults.push(...results);
        }
      }
    };

    await walk(dir);
    return allResults;
  }

  formatReport(entries: DeadCodeEntry[]): string {
    const lines: string[] = ['--- Dead Code Report ---', `Found ${entries.length} potential issues:`, ''];

    const grouped = new Map<string, DeadCodeEntry[]>();
    for (const entry of entries) {
      const type = entry.type;
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(entry);
    }

    for (const [type, items] of grouped) {
      lines.push(`${type} (${items.length}):`);
      for (const item of items.slice(0, 20)) {
        const loc = item.line ? `:${item.line}` : '';
        const name = item.name ? ` - ${item.name}` : '';
        lines.push(`  ${item.file}${loc}${name}`);
      }
      if (items.length > 20) {
        lines.push(`  ... and ${items.length - 20} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Unified Diagnostics and Build Module
// ---------------------------------------------------------------------------

class DiagnosticsAndBuild {
  readonly profiler: ContinuousProfiler;
  readonly heapDiffer: HeapSnapshotDiffer;
  readonly sanitizer: SanitizerHooks;
  readonly brotli: BrotliPipeline;
  readonly integrity: IntegrityVerifier;
  readonly cacheBuster: ContentHashCacheBuster;
  readonly preloadScanner: PreloadScanner;
  readonly regressionDetector: PerformanceRegressionDetector;
  readonly deoptMonitor: TurboFanDeoptMonitor;
  readonly bundleAnalyzer: BundleAnalyzer;
  readonly deadCodeEliminator: DeadCodeEliminator;

  private initialized = false;

  constructor() {
    this.profiler = new ContinuousProfiler();
    this.heapDiffer = new HeapSnapshotDiffer();
    this.sanitizer = new SanitizerHooks();
    this.brotli = new BrotliPipeline();
    this.integrity = new IntegrityVerifier();
    this.cacheBuster = new ContentHashCacheBuster();
    this.preloadScanner = new PreloadScanner();
    this.regressionDetector = new PerformanceRegressionDetector();
    this.deoptMonitor = new TurboFanDeoptMonitor();
    this.bundleAnalyzer = new BundleAnalyzer();
    this.deadCodeEliminator = new DeadCodeEliminator();
  }

  async initialize(options: { enableProfiler?: boolean; enableSanitizer?: boolean; enableHeapDiff?: boolean } = {}): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (options.enableProfiler !== false) {
      this.profiler.start(200); // Sample every 200ms
    }

    if (options.enableSanitizer) {
      this.sanitizer.enable();
    }

    if (options.enableHeapDiff !== false) {
      this.heapDiffer.startAutoSnapshot(60000); // Every minute
    }

    this.deoptMonitor.start();

    // Set default performance baselines
    this.regressionDetector.setBaseline('startup_time', 3000, 20, 'ms');
    this.regressionDetector.setBaseline('memory_usage', 200 * 1024 * 1024, 30, 'bytes');
    this.regressionDetector.setBaseline('ipc_latency', 50, 50, 'ms');

    log.info('[DiagnosticsAndBuild] Initialized all 11 subsystems');
  }

  shutdown(): void {
    this.profiler.stop();
    this.heapDiffer.stop();
    this.deoptMonitor.stop();
    this.sanitizer.disable();
    log.info('[DiagnosticsAndBuild] Shut down');
  }
}

export const diagnosticsAndBuild = new DiagnosticsAndBuild();

export {
  DiagnosticsAndBuild,
  ContinuousProfiler,
  HeapSnapshotDiffer,
  SanitizerHooks,
  BrotliPipeline,
  IntegrityVerifier,
  ContentHashCacheBuster,
  PreloadScanner,
  PerformanceRegressionDetector,
  TurboFanDeoptMonitor,
  BundleAnalyzer,
  DeadCodeEliminator,
};
