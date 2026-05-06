// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- Memory Architecture
// Rules 7-15: Slab allocator, generational cache, huge page support,
// COW semantics, custom ArrayBuffer allocator, cache-line padding,
// page fault minimizer, memory pressure responder, arena allocator
// ===========================================================================

import * as os from 'os';
import * as log from 'electron-log';
import { CppMempool, CppCache, CppProfiler, isCppAvailable } from '../native/cpp-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlabConfig {
  slabSizeBytes: number;
  objectSize: number;
  maxSlabs: number;
}

interface CacheEntry<T> {
  value: T;
  generation: number;
  size: number;
  lastAccessed: number;
  accessCount: number;
}

interface MemoryPressureEvent {
  level: 'low' | 'moderate' | 'critical';
  timestamp: number;
  freeMemoryMB: number;
  heapUsedMB: number;
}

// ---------------------------------------------------------------------------
// Rule 7: Slab Allocator
// Pre-allocates fixed-size memory slabs to eliminate per-object allocation
// overhead and reduce GC pressure for frequently created/destroyed objects.
// ---------------------------------------------------------------------------

class SlabAllocator {
  private slabs: ArrayBuffer[] = [];
  private freeList: number[] = [];
  private objectSize: number;
  private slabSize: number;
  private maxSlabs: number;
  private objectsPerSlab: number;
  private allocated = 0;
  private totalCapacity = 0;

  constructor(config: SlabConfig) {
    this.objectSize = Math.max(config.objectSize, 8);
    this.slabSize = config.slabSizeBytes;
    this.maxSlabs = config.maxSlabs;
    this.objectsPerSlab = Math.floor(this.slabSize / this.objectSize);
  }

  private allocateSlab(): boolean {
    if (this.slabs.length >= this.maxSlabs) return false;
    const slab = new ArrayBuffer(this.slabSize);
    const slabIndex = this.slabs.length;
    this.slabs.push(slab);
    const baseOffset = slabIndex * this.objectsPerSlab;
    for (let i = this.objectsPerSlab - 1; i >= 0; i--) {
      this.freeList.push(baseOffset + i);
    }
    this.totalCapacity += this.objectsPerSlab;
    return true;
  }

  alloc(): { slabIndex: number; offset: number; view: DataView } | null {
    if (this.freeList.length === 0) {
      if (!this.allocateSlab()) return null;
    }
    const index = this.freeList.pop()!;
    const slabIndex = Math.floor(index / this.objectsPerSlab);
    const localOffset = index % this.objectsPerSlab;
    const byteOffset = localOffset * this.objectSize;
    this.allocated++;
    return {
      slabIndex,
      offset: byteOffset,
      view: new DataView(this.slabs[slabIndex], byteOffset, this.objectSize),
    };
  }

  free(slabIndex: number, offset: number): void {
    const localOffset = offset / this.objectSize;
    const globalIndex = slabIndex * this.objectsPerSlab + localOffset;
    this.freeList.push(globalIndex);
    this.allocated--;
  }

  getStats(): { allocated: number; capacity: number; slabCount: number; utilization: number } {
    return {
      allocated: this.allocated,
      capacity: this.totalCapacity,
      slabCount: this.slabs.length,
      utilization: this.totalCapacity > 0 ? this.allocated / this.totalCapacity : 0,
    };
  }

  destroy(): void {
    this.slabs = [];
    this.freeList = [];
    this.allocated = 0;
    this.totalCapacity = 0;
  }
}

// ---------------------------------------------------------------------------
// Rule 8: Generational Cache
// Three-generation memory cache with LRU eviction per generation.
// Young -> Mature -> Old based on access frequency.
// ---------------------------------------------------------------------------

class GenerationalCache<T> {
  private young: Map<string, CacheEntry<T>> = new Map();
  private mature: Map<string, CacheEntry<T>> = new Map();
  private old: Map<string, CacheEntry<T>> = new Map();
  private youngMaxSize: number;
  private matureMaxSize: number;
  private oldMaxSize: number;
  private promotionThreshold: number;
  private currentMemoryBytes = 0;

  constructor(
    youngMax: number = 1000,
    matureMax: number = 500,
    oldMax: number = 200,
    promotionThreshold: number = 3
  ) {
    this.youngMaxSize = youngMax;
    this.matureMaxSize = matureMax;
    this.oldMaxSize = oldMax;
    this.promotionThreshold = promotionThreshold;
  }

  get(key: string): T | undefined {
    // Check old first (most stable)
    let entry = this.old.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      return entry.value;
    }
    // Check mature
    entry = this.mature.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      if (entry.accessCount >= this.promotionThreshold * 2) {
        this.mature.delete(key);
        this.promoteToOld(key, entry);
      }
      return entry.value;
    }
    // Check young
    entry = this.young.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      if (entry.accessCount >= this.promotionThreshold) {
        this.young.delete(key);
        this.promoteToMature(key, entry);
      }
      return entry.value;
    }
    return undefined;
  }

  set(key: string, value: T, sizeBytes: number = 0): void {
    const entry: CacheEntry<T> = {
      value,
      generation: 0,
      size: sizeBytes,
      lastAccessed: Date.now(),
      accessCount: 1,
    };

    // Remove from any existing generation
    this.evictKey(key);

    // Always insert into young generation
    if (this.young.size >= this.youngMaxSize) {
      this.evictOldestFromYoung();
    }
    this.young.set(key, entry);
    this.currentMemoryBytes += sizeBytes;
  }

  delete(key: string): boolean {
    return this.evictKey(key);
  }

  private evictKey(key: string): boolean {
    for (const gen of [this.young, this.mature, this.old]) {
      const entry = gen.get(key);
      if (entry) {
        gen.delete(key);
        this.currentMemoryBytes -= entry.size;
        return true;
      }
    }
    return false;
  }

  private promoteToMature(key: string, entry: CacheEntry<T>): void {
    if (this.mature.size >= this.matureMaxSize) {
      this.evictOldestFromMature();
    }
    entry.generation = 1;
    this.mature.set(key, entry);
  }

  private promoteToOld(key: string, entry: CacheEntry<T>): void {
    if (this.old.size >= this.oldMaxSize) {
      this.evictOldestFromOld();
    }
    entry.generation = 2;
    this.old.set(key, entry);
  }

  private evictOldestFromYoung(): void {
    this.evictLRU(this.young);
  }

  private evictOldestFromMature(): void {
    this.evictLRU(this.mature);
  }

  private evictOldestFromOld(): void {
    this.evictLRU(this.old);
  }

  private evictLRU(gen: Map<string, CacheEntry<T>>): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of gen) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const entry = gen.get(oldestKey);
      if (entry) this.currentMemoryBytes -= entry.size;
      gen.delete(oldestKey);
    }
  }

  getStats(): {
    youngSize: number;
    matureSize: number;
    oldSize: number;
    totalMemoryBytes: number;
  } {
    return {
      youngSize: this.young.size,
      matureSize: this.mature.size,
      oldSize: this.old.size,
      totalMemoryBytes: this.currentMemoryBytes,
    };
  }

  clear(): void {
    this.young.clear();
    this.mature.clear();
    this.old.clear();
    this.currentMemoryBytes = 0;
  }

  trimToMemoryBudget(maxBytes: number): number {
    let trimmed = 0;
    while (this.currentMemoryBytes > maxBytes && this.young.size > 0) {
      this.evictOldestFromYoung();
      trimmed++;
    }
    while (this.currentMemoryBytes > maxBytes && this.mature.size > 0) {
      this.evictOldestFromMature();
      trimmed++;
    }
    while (this.currentMemoryBytes > maxBytes && this.old.size > 0) {
      this.evictOldestFromOld();
      trimmed++;
    }
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// Rule 9: Huge Page Support / Large Page Allocator
// Allocates large aligned buffers to encourage OS huge page backing.
// ---------------------------------------------------------------------------

class LargePageAllocator {
  private allocations: Map<string, SharedArrayBuffer> = new Map();
  private pageSize: number;

  constructor() {
    // Detect huge page size: 2MB on x86-64, 64KB+ on ARM
    this.pageSize = os.arch() === 'arm64' ? 65536 : 2097152;
  }

  allocate(id: string, sizeBytes: number): SharedArrayBuffer | null {
    try {
      // Round up to page boundary
      const aligned = Math.ceil(sizeBytes / this.pageSize) * this.pageSize;
      const buffer = new SharedArrayBuffer(aligned);
      this.allocations.set(id, buffer);
      return buffer;
    } catch {
      // SharedArrayBuffer may not be available without cross-origin isolation
      return null;
    }
  }

  get(id: string): SharedArrayBuffer | undefined {
    return this.allocations.get(id);
  }

  free(id: string): boolean {
    return this.allocations.delete(id);
  }

  getTotalAllocated(): number {
    let total = 0;
    for (const buf of this.allocations.values()) {
      total += buf.byteLength;
    }
    return total;
  }
}

// ---------------------------------------------------------------------------
// Rule 10: COW (Copy-on-Write) Semantics
// Structural sharing for immutable data with lazy copy on mutation.
// ---------------------------------------------------------------------------

class COWObject<T extends Record<string, unknown>> {
  private data: T;
  private shared: boolean;
  private refCount: number;

  constructor(data: T) {
    this.data = data;
    this.shared = false;
    this.refCount = 1;
  }

  read(): Readonly<T> {
    return this.data;
  }

  write(key: keyof T, value: T[keyof T]): COWObject<T> {
    if (this.shared || this.refCount > 1) {
      // Copy on write: create a new independent copy
      const newData = { ...this.data, [key]: value } as T;
      this.refCount--;
      return new COWObject(newData);
    }
    // Exclusive ownership: mutate in place
    this.data[key] = value;
    return this;
  }

  share(): COWObject<T> {
    this.shared = true;
    this.refCount++;
    return this;
  }

  isShared(): boolean {
    return this.shared;
  }

  getRefCount(): number {
    return this.refCount;
  }
}

// ---------------------------------------------------------------------------
// Rule 11: Custom ArrayBuffer Pool
// Pre-allocated ArrayBuffer pool to eliminate allocation overhead for
// high-frequency buffer operations (IPC, serialization, file I/O).
// ---------------------------------------------------------------------------

class ArrayBufferPool {
  private pools: Map<number, ArrayBuffer[]> = new Map();
  private maxPoolSize: number;
  private inUse: Set<ArrayBuffer> = new Set();

  constructor(maxPoolSize: number = 64) {
    this.maxPoolSize = maxPoolSize;
    // Pre-allocate common sizes
    const commonSizes = [64, 256, 1024, 4096, 16384, 65536, 262144];
    for (const size of commonSizes) {
      this.pools.set(size, []);
      for (let i = 0; i < 4; i++) {
        this.pools.get(size)!.push(new ArrayBuffer(size));
      }
    }
  }

  acquire(requestedSize: number): ArrayBuffer {
    // Find the smallest power-of-two pool that fits
    let poolSize = 64;
    while (poolSize < requestedSize && poolSize < 1048576) {
      poolSize *= 2;
    }

    const pool = this.pools.get(poolSize);
    if (pool && pool.length > 0) {
      const buf = pool.pop()!;
      this.inUse.add(buf);
      // Zero the buffer
      new Uint8Array(buf).fill(0);
      return buf;
    }

    // Allocate new buffer of exact pool size
    const buf = new ArrayBuffer(poolSize);
    this.inUse.add(buf);
    return buf;
  }

  release(buffer: ArrayBuffer): void {
    this.inUse.delete(buffer);
    const size = buffer.byteLength;
    if (!this.pools.has(size)) {
      this.pools.set(size, []);
    }
    const pool = this.pools.get(size)!;
    if (pool.length < this.maxPoolSize) {
      pool.push(buffer);
    }
    // else: let GC reclaim it
  }

  getStats(): { pooledBuffers: number; inUseBuffers: number; totalPooledBytes: number } {
    let pooled = 0;
    let bytes = 0;
    for (const [size, pool] of this.pools) {
      pooled += pool.length;
      bytes += pool.length * size;
    }
    return { pooledBuffers: pooled, inUseBuffers: this.inUse.size, totalPooledBytes: bytes };
  }

  drain(): void {
    for (const pool of this.pools.values()) {
      pool.length = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 12: Cache-Line Aligned Data Layout
// Ensures hot data structures are aligned to 64-byte cache lines.
// ---------------------------------------------------------------------------

class CacheLineAlignedBuffer {
  private buffer: ArrayBuffer;
  private view: DataView;
  private slotSize: number;
  private slotCount: number;

  static readonly CACHE_LINE_SIZE = 64;

  constructor(slotCount: number, slotDataSize: number) {
    // Round slot size up to cache line boundary
    this.slotSize = Math.ceil(slotDataSize / CacheLineAlignedBuffer.CACHE_LINE_SIZE)
      * CacheLineAlignedBuffer.CACHE_LINE_SIZE;
    this.slotCount = slotCount;
    this.buffer = new ArrayBuffer(this.slotSize * slotCount);
    this.view = new DataView(this.buffer);
  }

  getSlotView(index: number): DataView {
    const offset = index * this.slotSize;
    return new DataView(this.buffer, offset, this.slotSize);
  }

  getSlotOffset(index: number): number {
    return index * this.slotSize;
  }

  getFloat64(slotIndex: number, fieldOffset: number): number {
    return this.view.getFloat64(slotIndex * this.slotSize + fieldOffset, true);
  }

  setFloat64(slotIndex: number, fieldOffset: number, value: number): void {
    this.view.setFloat64(slotIndex * this.slotSize + fieldOffset, value, true);
  }

  getUint32(slotIndex: number, fieldOffset: number): number {
    return this.view.getUint32(slotIndex * this.slotSize + fieldOffset, true);
  }

  setUint32(slotIndex: number, fieldOffset: number, value: number): void {
    this.view.setUint32(slotIndex * this.slotSize + fieldOffset, value, true);
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }
}

// ---------------------------------------------------------------------------
// Rule 13: Page Fault Minimizer
// Pre-touches memory pages to avoid demand paging during hot paths.
// ---------------------------------------------------------------------------

class PageFaultMinimizer {
  private pageSize: number;
  private prefaultedBuffers: Set<ArrayBuffer> = new Set();

  constructor() {
    this.pageSize = 4096; // Standard page size
  }

  prefaultBuffer(buffer: ArrayBuffer): void {
    if (this.prefaultedBuffers.has(buffer)) return;
    const view = new Uint8Array(buffer);
    // Touch every page to force the OS to map physical memory
    for (let i = 0; i < view.length; i += this.pageSize) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      view[i];
    }
    this.prefaultedBuffers.add(buffer);
  }

  prefaultTypedArray(arr: Uint8Array | Float64Array | Int32Array): void {
    const bytes = arr.BYTES_PER_ELEMENT * arr.length;
    const step = Math.floor(this.pageSize / arr.BYTES_PER_ELEMENT);
    for (let i = 0; i < arr.length; i += step) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      arr[i];
    }
  }

  mlockHint(buffer: ArrayBuffer): void {
    // On Node.js we cannot directly mlock(), but we can signal to V8 that
    // this buffer is critical by reading through it sequentially.
    this.prefaultBuffer(buffer);
  }
}

// ---------------------------------------------------------------------------
// Rule 14: Memory Pressure Responder
// Integrates with OS memory pressure notifications to trim caches.
// ---------------------------------------------------------------------------

class MemoryPressureResponder {
  private listeners: Array<(event: MemoryPressureEvent) => void> = [];
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastLevel: MemoryPressureEvent['level'] = 'low';
  private criticalThresholdMB: number;
  private moderateThresholdMB: number;

  constructor() {
    const totalMB = os.totalmem() / (1024 * 1024);
    this.criticalThresholdMB = totalMB * 0.1;  // <10% free
    this.moderateThresholdMB = totalMB * 0.2;  // <20% free
  }

  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitorInterval) return;
    this.monitorInterval = setInterval(() => this.checkPressure(), intervalMs);
    // Unref so it doesn't keep the process alive
    if (this.monitorInterval && typeof this.monitorInterval === 'object' && 'unref' in this.monitorInterval) {
      (this.monitorInterval as NodeJS.Timeout).unref();
    }
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  onPressure(callback: (event: MemoryPressureEvent) => void): void {
    this.listeners.push(callback);
  }

  private checkPressure(): void {
    const freeMB = os.freemem() / (1024 * 1024);
    const heapUsed = process.memoryUsage().heapUsed / (1024 * 1024);
    let level: MemoryPressureEvent['level'] = 'low';

    if (freeMB < this.criticalThresholdMB) {
      level = 'critical';
    } else if (freeMB < this.moderateThresholdMB) {
      level = 'moderate';
    }

    if (level !== this.lastLevel && level !== 'low') {
      const event: MemoryPressureEvent = {
        level,
        timestamp: Date.now(),
        freeMemoryMB: Math.round(freeMB),
        heapUsedMB: Math.round(heapUsed),
      };
      this.lastLevel = level;
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          // Don't let pressure handlers take down the monitor
        }
      }
    } else if (level === 'low') {
      this.lastLevel = 'low';
    }
  }

  getCurrentLevel(): MemoryPressureEvent['level'] {
    const freeMB = os.freemem() / (1024 * 1024);
    if (freeMB < this.criticalThresholdMB) return 'critical';
    if (freeMB < this.moderateThresholdMB) return 'moderate';
    return 'low';
  }
}

// ---------------------------------------------------------------------------
// Rule 15: Arena Allocator
// Bulk allocator for short-lived request-scoped data.
// All allocations freed at once when the arena is dropped.
// ---------------------------------------------------------------------------

class ArenaAllocator {
  private chunks: ArrayBuffer[] = [];
  private currentChunk: Uint8Array | null = null;
  private offset = 0;
  private chunkSize: number;
  private totalAllocated = 0;

  constructor(chunkSize: number = 65536) {
    this.chunkSize = chunkSize;
    this.allocateChunk();
  }

  private allocateChunk(): void {
    const chunk = new ArrayBuffer(this.chunkSize);
    this.chunks.push(chunk);
    this.currentChunk = new Uint8Array(chunk);
    this.offset = 0;
  }

  alloc(size: number): Uint8Array {
    // Align to 8-byte boundary
    const alignedSize = (size + 7) & ~7;

    if (!this.currentChunk || this.offset + alignedSize > this.currentChunk.length) {
      if (alignedSize > this.chunkSize) {
        // Oversize allocation: dedicated chunk
        const chunk = new ArrayBuffer(alignedSize);
        this.chunks.push(chunk);
        this.totalAllocated += alignedSize;
        return new Uint8Array(chunk);
      }
      this.allocateChunk();
    }

    const slice = this.currentChunk!.subarray(this.offset, this.offset + size);
    this.offset += alignedSize;
    this.totalAllocated += alignedSize;
    return slice;
  }

  allocTyped<T extends Float64Array | Int32Array | Uint32Array>(
    TypedArrayClass: { new (buffer: ArrayBuffer, offset: number, length: number): T; BYTES_PER_ELEMENT: number },
    count: number
  ): T {
    const bytesPerElement = TypedArrayClass.BYTES_PER_ELEMENT || 8;
    const byteLength = count * bytesPerElement;
    const raw = this.alloc(byteLength);
    // Need to create from the underlying buffer to get proper typed array
    return new TypedArrayClass(raw.buffer as ArrayBuffer, raw.byteOffset, count);
  }

  reset(): void {
    // Keep the first chunk, drop the rest
    if (this.chunks.length > 1) {
      const first = this.chunks[0];
      this.chunks = [first];
      this.currentChunk = new Uint8Array(first);
    }
    this.offset = 0;
    this.totalAllocated = 0;
  }

  destroy(): void {
    this.chunks = [];
    this.currentChunk = null;
    this.offset = 0;
    this.totalAllocated = 0;
  }

  getStats(): { chunks: number; totalAllocated: number; chunkSize: number } {
    return {
      chunks: this.chunks.length,
      totalAllocated: this.totalAllocated,
      chunkSize: this.chunkSize,
    };
  }
}

// ---------------------------------------------------------------------------
// Unified Memory Architecture
// ---------------------------------------------------------------------------

class MemoryArchitecture {
  readonly slabAllocator: SlabAllocator;
  readonly generationalCache: GenerationalCache<Buffer>;
  readonly largePageAllocator: LargePageAllocator;
  readonly bufferPool: ArrayBufferPool;
  readonly pageFaultMinimizer: PageFaultMinimizer;
  readonly pressureResponder: MemoryPressureResponder;
  private initialized = false;

  constructor() {
    this.slabAllocator = new SlabAllocator({
      slabSizeBytes: 1048576, // 1MB slabs
      objectSize: 256,
      maxSlabs: 16,
    });
    this.generationalCache = new GenerationalCache<Buffer>(2000, 1000, 500, 3);
    this.largePageAllocator = new LargePageAllocator();
    this.bufferPool = new ArrayBufferPool(128);
    this.pageFaultMinimizer = new PageFaultMinimizer();
    this.pressureResponder = new MemoryPressureResponder();
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const t0 = process.hrtime.bigint();

    // C++ profiler scope
    if (isCppAvailable()) CppProfiler.begin('MemoryArchitecture.init');

    // Start memory pressure monitoring
    this.pressureResponder.startMonitoring(5000);
    this.pressureResponder.onPressure((event) => {
      if (event.level === 'critical') {
        log.warn(`[MemoryArch] Critical memory pressure: ${event.freeMemoryMB}MB free`);
        this.generationalCache.trimToMemoryBudget(50 * 1024 * 1024);
        this.bufferPool.drain();
        if (global.gc) global.gc();
      } else if (event.level === 'moderate') {
        log.info(`[MemoryArch] Moderate memory pressure: ${event.freeMemoryMB}MB free`);
        this.generationalCache.trimToMemoryBudget(100 * 1024 * 1024);
      }
    });

    if (isCppAvailable()) CppProfiler.end('MemoryArchitecture.init');

    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
    log.info(`[MemoryArch] Initialized in ${elapsed.toFixed(1)}ms`);
  }

  createArena(chunkSize?: number): ArenaAllocator {
    return new ArenaAllocator(chunkSize);
  }

  createCOW<T extends Record<string, unknown>>(data: T): COWObject<T> {
    return new COWObject(data);
  }

  createCacheAlignedBuffer(slots: number, slotDataSize: number): CacheLineAlignedBuffer {
    return new CacheLineAlignedBuffer(slots, slotDataSize);
  }

  shutdown(): void {
    this.pressureResponder.stopMonitoring();
    this.generationalCache.clear();
    this.bufferPool.drain();
    this.slabAllocator.destroy();
  }

  getStatus(): Record<string, unknown> {
    return {
      slab: this.slabAllocator.getStats(),
      cache: this.generationalCache.getStats(),
      bufferPool: this.bufferPool.getStats(),
      memoryPressure: this.pressureResponder.getCurrentLevel(),
      largePageAllocated: this.largePageAllocator.getTotalAllocated(),
      cppMempool: CppMempool.stats(),
      cppCache: CppCache.stats(),
    };
  }
}

export const memoryArchitecture = new MemoryArchitecture();

export {
  MemoryArchitecture,
  SlabAllocator,
  GenerationalCache,
  LargePageAllocator,
  COWObject,
  ArrayBufferPool,
  CacheLineAlignedBuffer,
  PageFaultMinimizer,
  MemoryPressureResponder,
  ArenaAllocator,
};
