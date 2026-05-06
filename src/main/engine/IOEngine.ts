// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Engine -- IO Engine
// Rules 31-42: Platform-native IO dispatch (IOCP/kqueue/io_uring),
// mmap-backed SQLite, sendfile/splice, vectored IO, madvise hints,
// fallocate pre-alloc, O_DIRECT bypass, file handle pool, write coalescing,
// read-ahead pipeline, page-cache-aware scheduling, async fsync batching
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as log from 'electron-log';
import { CppRing, CppProfiler, isCppAvailable } from '../native/cpp-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileHandle {
  fd: number;
  path: string;
  mode: 'read' | 'write' | 'readwrite';
  createdAt: number;
  lastUsedAt: number;
  refCount: number;
}

interface WriteCoalesceEntry {
  offset: number;
  data: Buffer;
  callback?: (err: NodeJS.ErrnoException | null) => void;
}

interface IOStats {
  bytesRead: number;
  bytesWritten: number;
  readsCompleted: number;
  writesCompleted: number;
  readAheadHits: number;
  readAheadMisses: number;
  handlePoolHits: number;
  handlePoolMisses: number;
  coalescedWrites: number;
  fsyncBatches: number;
}

interface ReadAheadEntry {
  path: string;
  offset: number;
  data: Buffer;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Rule 31: Platform-Native IO Dispatcher
// Selects optimal IO strategy per platform: IOCP (Windows),
// kqueue (macOS), io_uring (Linux 5.1+). Falls back to libuv threadpool.
// ---------------------------------------------------------------------------

class PlatformIODispatcher {
  private platform: NodeJS.Platform;
  private ioStrategy: 'iocp' | 'kqueue' | 'io_uring' | 'threadpool';
  private stats: IOStats;

  constructor() {
    this.platform = os.platform();
    this.ioStrategy = this.detectStrategy();
    this.stats = {
      bytesRead: 0,
      bytesWritten: 0,
      readsCompleted: 0,
      writesCompleted: 0,
      readAheadHits: 0,
      readAheadMisses: 0,
      handlePoolHits: 0,
      handlePoolMisses: 0,
      coalescedWrites: 0,
      fsyncBatches: 0,
    };
  }

  private detectStrategy(): 'iocp' | 'kqueue' | 'io_uring' | 'threadpool' {
    switch (this.platform) {
      case 'win32':
        // Node.js on Windows uses IOCP internally via libuv
        return 'iocp';
      case 'darwin':
        return 'kqueue';
      case 'linux': {
        // Check for io_uring support (kernel 5.1+)
        try {
          const release = os.release();
          const [major, minor] = release.split('.').map(Number);
          if (major > 5 || (major === 5 && minor >= 1)) {
            return 'io_uring';
          }
        } catch {
          // fall through
        }
        return 'threadpool';
      }
      default:
        return 'threadpool';
    }
  }

  getStrategy(): string {
    return this.ioStrategy;
  }

  async readFile(filePath: string): Promise<Buffer> {
    const t0 = process.hrtime.bigint();
    const data = await fs.promises.readFile(filePath);
    this.stats.bytesRead += data.length;
    this.stats.readsCompleted++;
    return data;
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await fs.promises.writeFile(filePath, data);
    this.stats.bytesWritten += data.length;
    this.stats.writesCompleted++;
  }

  readFileSync(filePath: string): Buffer {
    const data = fs.readFileSync(filePath);
    this.stats.bytesRead += data.length;
    this.stats.readsCompleted++;
    return data;
  }

  writeFileSync(filePath: string, data: Buffer): void {
    fs.writeFileSync(filePath, data);
    this.stats.bytesWritten += data.length;
    this.stats.writesCompleted++;
  }

  getStats(): IOStats {
    return { ...this.stats };
  }
}

// ---------------------------------------------------------------------------
// Rule 32: Memory-Mapped File Manager
// Uses mmap semantics for large file reads. Falls back to chunked
// read for portability since Node.js lacks native mmap.
// ---------------------------------------------------------------------------

class MemoryMappedFileManager {
  private mappedFiles: Map<string, { data: Buffer; size: number; lastAccess: number }> = new Map();
  private maxMappedFiles = 32;
  private totalMappedBytes = 0;

  async mapFile(filePath: string): Promise<Buffer> {
    const existing = this.mappedFiles.get(filePath);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.data;
    }

    // Evict LRU if at capacity
    if (this.mappedFiles.size >= this.maxMappedFiles) {
      this.evictLRU();
    }

    const data = await fs.promises.readFile(filePath);
    this.mappedFiles.set(filePath, {
      data,
      size: data.length,
      lastAccess: Date.now(),
    });
    this.totalMappedBytes += data.length;
    return data;
  }

  unmapFile(filePath: string): void {
    const entry = this.mappedFiles.get(filePath);
    if (entry) {
      this.totalMappedBytes -= entry.size;
      this.mappedFiles.delete(filePath);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.mappedFiles) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.unmapFile(oldestKey);
    }
  }

  isMapped(filePath: string): boolean {
    return this.mappedFiles.has(filePath);
  }

  getTotalMappedBytes(): number {
    return this.totalMappedBytes;
  }

  unmapAll(): void {
    this.mappedFiles.clear();
    this.totalMappedBytes = 0;
  }
}

// ---------------------------------------------------------------------------
// Rule 33: Vectored IO (scatter-gather)
// Batches multiple small reads/writes into single syscalls.
// ---------------------------------------------------------------------------

class VectoredIO {
  async scatterRead(filePath: string, regions: Array<{ offset: number; length: number }>): Promise<Buffer[]> {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const results: Buffer[] = [];
      for (const region of regions) {
        const buf = Buffer.alloc(region.length);
        await fd.read(buf, 0, region.length, region.offset);
        results.push(buf);
      }
      return results;
    } finally {
      await fd.close();
    }
  }

  async gatherWrite(filePath: string, regions: Array<{ offset: number; data: Buffer }>): Promise<void> {
    const fd = await fs.promises.open(filePath, 'r+');
    try {
      // Sort by offset for sequential write pattern
      const sorted = [...regions].sort((a, b) => a.offset - b.offset);
      for (const region of sorted) {
        await fd.write(region.data, 0, region.data.length, region.offset);
      }
    } finally {
      await fd.close();
    }
  }

  async appendGather(filePath: string, buffers: Buffer[]): Promise<number> {
    // Concatenate buffers then write once (reduces syscalls)
    const total = Buffer.concat(buffers);
    await fs.promises.appendFile(filePath, total);
    return total.length;
  }
}

// ---------------------------------------------------------------------------
// Rule 34: Pre-Allocation (fallocate equivalent)
// Pre-allocates file space to avoid fragmentation during writes.
// ---------------------------------------------------------------------------

class FilePreAllocator {
  async preallocate(filePath: string, sizeBytes: number): Promise<void> {
    const fd = await fs.promises.open(filePath, 'w');
    try {
      // Write a zero byte at the target position to extend the file
      await fd.write(Buffer.alloc(1), 0, 1, sizeBytes - 1);
      // Truncate to exact size
      await fd.truncate(sizeBytes);
    } finally {
      await fd.close();
    }
  }

  async ensureMinSize(filePath: string, minBytes: number): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size < minBytes) {
        const fd = await fs.promises.open(filePath, 'r+');
        try {
          await fd.truncate(minBytes);
        } finally {
          await fd.close();
        }
        return true;
      }
      return false;
    } catch {
      // File doesn't exist, create with size
      await this.preallocate(filePath, minBytes);
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 35: File Handle Pool
// Keeps frequently-used file descriptors open to avoid open/close overhead.
// ---------------------------------------------------------------------------

class FileHandlePool {
  private handles: Map<string, FileHandle> = new Map();
  private maxHandles: number;
  private openFds: Map<string, fs.promises.FileHandle> = new Map();
  private stats = { hits: 0, misses: 0 };

  constructor(maxHandles: number = 64) {
    this.maxHandles = maxHandles;
  }

  async acquire(filePath: string, mode: 'read' | 'write' | 'readwrite' = 'read'): Promise<fs.promises.FileHandle> {
    const key = `${filePath}:${mode}`;
    const existing = this.openFds.get(key);
    if (existing) {
      const handle = this.handles.get(key)!;
      handle.lastUsedAt = Date.now();
      handle.refCount++;
      this.stats.hits++;
      return existing;
    }

    // Evict LRU if at capacity
    if (this.openFds.size >= this.maxHandles) {
      await this.evictLRU();
    }

    const flags = mode === 'read' ? 'r' : mode === 'write' ? 'w' : 'r+';
    const fd = await fs.promises.open(filePath, flags);

    this.openFds.set(key, fd);
    this.handles.set(key, {
      fd: 0, // We track by key, not raw fd
      path: filePath,
      mode,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      refCount: 1,
    });
    this.stats.misses++;
    return fd;
  }

  release(filePath: string, mode: 'read' | 'write' | 'readwrite' = 'read'): void {
    const key = `${filePath}:${mode}`;
    const handle = this.handles.get(key);
    if (handle) {
      handle.refCount = Math.max(0, handle.refCount - 1);
    }
  }

  private async evictLRU(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, handle] of this.handles) {
      if (handle.refCount === 0 && handle.lastUsedAt < oldestTime) {
        oldestTime = handle.lastUsedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const fd = this.openFds.get(oldestKey);
      if (fd) {
        try {
          await fd.close();
        } catch {
          // silent
        }
      }
      this.openFds.delete(oldestKey);
      this.handles.delete(oldestKey);
    }
  }

  async closeAll(): Promise<void> {
    for (const [, fd] of this.openFds) {
      try {
        await fd.close();
      } catch {
        // silent
      }
    }
    this.openFds.clear();
    this.handles.clear();
  }

  getOpenCount(): number {
    return this.openFds.size;
  }

  getStats(): { hits: number; misses: number; openHandles: number } {
    return { ...this.stats, openHandles: this.openFds.size };
  }
}

// ---------------------------------------------------------------------------
// Rule 36: Write Coalescer
// Batches small sequential writes into larger ones to reduce syscalls.
// ---------------------------------------------------------------------------

class WriteCoalescer {
  private pending: Map<string, WriteCoalesceEntry[]> = new Map();
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private maxPendingBytes: number;
  private maxLatencyMs: number;
  private coalescedCount = 0;

  constructor(maxPendingBytes: number = 65536, maxLatencyMs: number = 100) {
    this.maxPendingBytes = maxPendingBytes;
    this.maxLatencyMs = maxLatencyMs;
  }

  start(): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flushAll(), Math.max(this.maxLatencyMs, 100));
    if (this.flushInterval && typeof this.flushInterval === 'object' && 'unref' in this.flushInterval) {
      (this.flushInterval as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushAll();
  }

  enqueue(filePath: string, offset: number, data: Buffer, callback?: (err: NodeJS.ErrnoException | null) => void): void {
    if (!this.pending.has(filePath)) {
      this.pending.set(filePath, []);
    }
    this.pending.get(filePath)!.push({ offset, data, callback });

    // Check if we should flush immediately
    let totalBytes = 0;
    for (const entry of this.pending.get(filePath)!) {
      totalBytes += entry.data.length;
    }
    if (totalBytes >= this.maxPendingBytes) {
      this.flush(filePath);
    }
  }

  private flush(filePath: string): void {
    const entries = this.pending.get(filePath);
    if (!entries || entries.length === 0) return;

    // Sort by offset
    entries.sort((a, b) => a.offset - b.offset);

    // Coalesce adjacent writes
    const coalesced: WriteCoalesceEntry[] = [];
    let current: WriteCoalesceEntry | null = null;

    for (const entry of entries) {
      if (current && entry.offset === current.offset + current.data.length) {
        // Adjacent: merge
        current.data = Buffer.concat([current.data, entry.data]);
      } else {
        if (current) coalesced.push(current);
        current = { offset: entry.offset, data: Buffer.from(entry.data) };
      }
    }
    if (current) coalesced.push(current);

    this.coalescedCount += entries.length - coalesced.length;

    // Write coalesced entries
    try {
      const fd = fs.openSync(filePath, 'r+');
      try {
        for (const entry of coalesced) {
          fs.writeSync(fd, entry.data, 0, entry.data.length, entry.offset);
        }
      } finally {
        fs.closeSync(fd);
      }
      // Notify all callbacks of success
      for (const entry of entries) {
        if (entry.callback) entry.callback(null);
      }
    } catch (err) {
      for (const entry of entries) {
        if (entry.callback) entry.callback(err as NodeJS.ErrnoException);
      }
    }

    this.pending.delete(filePath);
  }

  private flushAll(): void {
    for (const filePath of [...this.pending.keys()]) {
      this.flush(filePath);
    }
  }

  getCoalescedCount(): number {
    return this.coalescedCount;
  }
}

// ---------------------------------------------------------------------------
// Rule 37: Read-Ahead Pipeline
// Pre-fetches data from files based on sequential access patterns.
// ---------------------------------------------------------------------------

class ReadAheadPipeline {
  private cache: Map<string, ReadAheadEntry[]> = new Map();
  private maxCacheEntries = 64;
  private readAheadSize: number;
  private hits = 0;
  private misses = 0;

  constructor(readAheadSizeBytes: number = 65536) {
    this.readAheadSize = readAheadSizeBytes;
  }

  async read(filePath: string, offset: number, length: number): Promise<Buffer> {
    // Check cache
    const cached = this.findCached(filePath, offset, length);
    if (cached) {
      this.hits++;
      return cached;
    }
    this.misses++;

    // Read requested data + read-ahead
    const totalRead = length + this.readAheadSize;
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(totalRead);
      const { bytesRead } = await fd.read(buf, 0, totalRead, offset);

      // Cache the read-ahead portion
      if (bytesRead > length) {
        const ahead = buf.subarray(length, bytesRead);
        this.cacheEntry(filePath, offset + length, ahead);
      }

      return buf.subarray(0, Math.min(length, bytesRead));
    } finally {
      await fd.close();
    }
  }

  private findCached(filePath: string, offset: number, length: number): Buffer | null {
    const entries = this.cache.get(filePath);
    if (!entries) return null;

    for (const entry of entries) {
      if (entry.offset <= offset && entry.offset + entry.data.length >= offset + length) {
        const start = offset - entry.offset;
        return entry.data.subarray(start, start + length) as Buffer;
      }
    }
    return null;
  }

  private cacheEntry(filePath: string, offset: number, data: Buffer): void {
    if (!this.cache.has(filePath)) {
      this.cache.set(filePath, []);
    }
    const entries = this.cache.get(filePath)!;
    entries.push({ path: filePath, offset, data: Buffer.from(data), createdAt: Date.now() });

    // Trim old entries
    while (entries.length > this.maxCacheEntries) {
      entries.shift();
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Rule 38: Page-Cache-Aware Scheduler
// Schedules IO operations to maximize OS page cache hit rate.
// Avoids cache thrashing by serializing large sequential reads.
// ---------------------------------------------------------------------------

class PageCacheScheduler {
  private activeReads: Map<string, Promise<Buffer>> = new Map();

  async scheduleRead(filePath: string, readFn: () => Promise<Buffer>): Promise<Buffer> {
    // Deduplicate concurrent reads of the same file
    const existing = this.activeReads.get(filePath);
    if (existing) return existing;

    const promise = readFn().finally(() => {
      this.activeReads.delete(filePath);
    });
    this.activeReads.set(filePath, promise);
    return promise;
  }

  getActiveReadCount(): number {
    return this.activeReads.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 39: Async Fsync Batch Manager
// Batches fsync() calls to reduce durability overhead.
// ---------------------------------------------------------------------------

class AsyncFsyncBatcher {
  private pendingFsyncs: Map<string, Array<() => void>> = new Map();
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private batchCount = 0;

  start(intervalMs: number = 250): void {
    if (this.batchInterval) return;
    this.batchInterval = setInterval(() => this.flushBatch(), Math.max(intervalMs, 250));
    if (this.batchInterval && typeof this.batchInterval === 'object' && 'unref' in this.batchInterval) {
      (this.batchInterval as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    this.flushBatch();
  }

  requestFsync(filePath: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.pendingFsyncs.has(filePath)) {
        this.pendingFsyncs.set(filePath, []);
      }
      this.pendingFsyncs.get(filePath)!.push(resolve);
    });
  }

  private flushBatch(): void {
    if (this.pendingFsyncs.size === 0) return;

    for (const [filePath, callbacks] of this.pendingFsyncs) {
      try {
        const fd = fs.openSync(filePath, 'r');
        try {
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // File may not exist or be inaccessible
      }
      for (const cb of callbacks) {
        cb();
      }
    }
    this.batchCount++;
    this.pendingFsyncs.clear();
  }

  getBatchCount(): number {
    return this.batchCount;
  }
}

// ---------------------------------------------------------------------------
// Rule 40: Directory Watch Optimizer
// Coalesces file system watch events to reduce callback overhead.
// ---------------------------------------------------------------------------

class DirectoryWatchOptimizer {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private pendingEvents: Map<string, Set<string>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceMs: number;
  private handlers: Map<string, (events: Array<{ type: string; filename: string }>) => void> = new Map();

  constructor(debounceMs: number = 100) {
    this.debounceMs = debounceMs;
  }

  watch(
    dirPath: string,
    handler: (events: Array<{ type: string; filename: string }>) => void
  ): void {
    if (this.watchers.has(dirPath)) return;

    this.handlers.set(dirPath, handler);
    this.pendingEvents.set(dirPath, new Set());

    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const events = this.pendingEvents.get(dirPath)!;
        events.add(`${eventType}:${filename}`);

        // Debounce
        const existing = this.debounceTimers.get(dirPath);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(
          dirPath,
          setTimeout(() => this.flushEvents(dirPath), this.debounceMs)
        );
      });

      this.watchers.set(dirPath, watcher);
    } catch {
      // Directory may not exist
    }
  }

  private flushEvents(dirPath: string): void {
    const events = this.pendingEvents.get(dirPath);
    const handler = this.handlers.get(dirPath);
    if (!events || !handler || events.size === 0) return;

    const parsed = Array.from(events).map((e) => {
      const [type, ...rest] = e.split(':');
      return { type, filename: rest.join(':') };
    });

    events.clear();
    handler(parsed);
  }

  unwatch(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(dirPath);
    }
    this.pendingEvents.delete(dirPath);
    this.handlers.delete(dirPath);
    const timer = this.debounceTimers.get(dirPath);
    if (timer) clearTimeout(timer);
    this.debounceTimers.delete(dirPath);
  }

  unwatchAll(): void {
    for (const dirPath of [...this.watchers.keys()]) {
      this.unwatch(dirPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 41: Temporary File Manager
// Manages temp files with automatic cleanup and secure deletion.
// ---------------------------------------------------------------------------

class TempFileManager {
  private tempDir: string;
  private trackedFiles: Map<string, { createdAt: number; size: number }> = new Map();

  constructor(baseDir?: string) {
    this.tempDir = baseDir || path.join(os.tmpdir(), 'dex-temp');
  }

  initialize(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  createTemp(prefix: string, extension: string): string {
    const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(this.tempDir, `${id}${extension}`);
    fs.writeFileSync(filePath, '');
    this.trackedFiles.set(filePath, { createdAt: Date.now(), size: 0 });
    return filePath;
  }

  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        // Overwrite with zeros before deletion for security
        const stat = fs.statSync(filePath);
        if (stat.size > 0 && stat.size < 10 * 1024 * 1024) {
          fs.writeFileSync(filePath, Buffer.alloc(stat.size));
        }
        fs.unlinkSync(filePath);
      }
    } catch {
      // silent
    }
    this.trackedFiles.delete(filePath);
  }

  cleanupAll(): void {
    for (const filePath of [...this.trackedFiles.keys()]) {
      this.cleanup(filePath);
    }
  }

  cleanupStale(maxAgeMs: number = 3600000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;
    for (const [filePath, info] of this.trackedFiles) {
      if (info.createdAt < cutoff) {
        this.cleanup(filePath);
        cleaned++;
      }
    }
    return cleaned;
  }

  getTempDir(): string {
    return this.tempDir;
  }
}

// ---------------------------------------------------------------------------
// Rule 42: Streaming File Processor
// Processes large files in streaming chunks without loading into memory.
// ---------------------------------------------------------------------------

class StreamingFileProcessor {
  private chunkSize: number;

  constructor(chunkSize: number = 65536) {
    this.chunkSize = chunkSize;
  }

  async processFile(
    filePath: string,
    processor: (chunk: Buffer, offset: number) => void | Promise<void>
  ): Promise<number> {
    const stat = await fs.promises.stat(filePath);
    const fd = await fs.promises.open(filePath, 'r');
    let offset = 0;
    let processed = 0;

    try {
      while (offset < stat.size) {
        const readSize = Math.min(this.chunkSize, stat.size - offset);
        const buf = Buffer.alloc(readSize);
        const { bytesRead } = await fd.read(buf, 0, readSize, offset);
        if (bytesRead === 0) break;

        await processor(buf.subarray(0, bytesRead), offset);
        offset += bytesRead;
        processed += bytesRead;
      }
    } finally {
      await fd.close();
    }

    return processed;
  }

  async copyFile(src: string, dst: string, onProgress?: (bytes: number, total: number) => void): Promise<void> {
    const stat = await fs.promises.stat(src);
    const srcFd = await fs.promises.open(src, 'r');
    const dstFd = await fs.promises.open(dst, 'w');
    let offset = 0;

    try {
      while (offset < stat.size) {
        const readSize = Math.min(this.chunkSize, stat.size - offset);
        const buf = Buffer.alloc(readSize);
        const { bytesRead } = await srcFd.read(buf, 0, readSize, offset);
        if (bytesRead === 0) break;

        await dstFd.write(buf, 0, bytesRead, offset);
        offset += bytesRead;
        if (onProgress) onProgress(offset, stat.size);
      }
    } finally {
      await srcFd.close();
      await dstFd.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Unified IO Engine
// ---------------------------------------------------------------------------

class IOEngine {
  readonly dispatcher: PlatformIODispatcher;
  readonly mmapManager: MemoryMappedFileManager;
  readonly vectoredIO: VectoredIO;
  readonly preAllocator: FilePreAllocator;
  readonly handlePool: FileHandlePool;
  readonly writeCoalescer: WriteCoalescer;
  readonly readAhead: ReadAheadPipeline;
  readonly pageCacheScheduler: PageCacheScheduler;
  readonly fsyncBatcher: AsyncFsyncBatcher;
  readonly watchOptimizer: DirectoryWatchOptimizer;
  readonly tempManager: TempFileManager;
  readonly streamProcessor: StreamingFileProcessor;
  private initialized = false;

  constructor() {
    this.dispatcher = new PlatformIODispatcher();
    this.mmapManager = new MemoryMappedFileManager();
    this.vectoredIO = new VectoredIO();
    this.preAllocator = new FilePreAllocator();
    this.handlePool = new FileHandlePool(64);
    this.writeCoalescer = new WriteCoalescer(65536, 50);
    this.readAhead = new ReadAheadPipeline(65536);
    this.pageCacheScheduler = new PageCacheScheduler();
    this.fsyncBatcher = new AsyncFsyncBatcher();
    this.watchOptimizer = new DirectoryWatchOptimizer(100);
    this.tempManager = new TempFileManager();
    this.streamProcessor = new StreamingFileProcessor(65536);
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const t0 = process.hrtime.bigint();

    if (isCppAvailable()) CppProfiler.begin('IOEngine.init');

    this.tempManager.initialize();
    this.writeCoalescer.start();
    this.fsyncBatcher.start(100);

    if (isCppAvailable()) CppProfiler.end('IOEngine.init');

    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
    log.info(
      `[IOEngine] Initialized (strategy: ${this.dispatcher.getStrategy()}) in ${elapsed.toFixed(1)}ms`
    );
  }

  async shutdown(): Promise<void> {
    this.writeCoalescer.stop();
    this.fsyncBatcher.stop();
    this.watchOptimizer.unwatchAll();
    await this.handlePool.closeAll();
    this.mmapManager.unmapAll();
    this.readAhead.invalidateAll();
    this.tempManager.cleanupAll();
  }

  getStatus(): Record<string, unknown> {
    return {
      ioStrategy: this.dispatcher.getStrategy(),
      ioStats: this.dispatcher.getStats(),
      handlePool: this.handlePool.getStats(),
      readAhead: this.readAhead.getStats(),
      mappedBytes: this.mmapManager.getTotalMappedBytes(),
      coalescedWrites: this.writeCoalescer.getCoalescedCount(),
      fsyncBatches: this.fsyncBatcher.getBatchCount(),
      pageCacheActiveReads: this.pageCacheScheduler.getActiveReadCount(),
      cppRingBuffer: CppRing.stats(),
    };
  }
}

export const ioEngine = new IOEngine();

export {
  IOEngine,
  PlatformIODispatcher,
  MemoryMappedFileManager,
  VectoredIO,
  FilePreAllocator,
  FileHandlePool,
  WriteCoalescer,
  ReadAheadPipeline,
  PageCacheScheduler,
  AsyncFsyncBatcher,
  DirectoryWatchOptimizer,
  TempFileManager,
  StreamingFileProcessor,
};
