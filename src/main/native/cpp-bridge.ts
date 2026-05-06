// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX C++ Native Bridge -- Connects C++ N-API addon to the application
// Loads the compiled .node binary and provides typed wrappers.
// Falls back gracefully if the C++ addon is not compiled.
// ===========================================================================

import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import type {
  DexCppModule,
  BloomStats,
  SpatialPoint,
  SpatialNearestResult,
  ProjectResult,
  PoolStats,
  MempoolStats,
  CacheStats,
  SchedulerTask,
  CppSchedulerStats,
  RingStats,
  ProfilerEntry,
} from './cpp-types';

// -------------------------------------------------------------------------
// Module Loading
// -------------------------------------------------------------------------

let cppModule: DexCppModule | null = null;
let loadAttempted = false;

function loadCppModule(): DexCppModule | null {
  if (loadAttempted) return cppModule;
  loadAttempted = true;

  const candidates = [
    // Dev build (node-gyp output)
    path.join(__dirname, '..', '..', 'native', 'dex-cpp', 'build', 'Release', 'dex_cpp.node'),
    path.join(__dirname, '..', '..', 'native', 'dex-cpp', 'build', 'Debug', 'dex_cpp.node'),
    // Production (bundled in resources)
    path.join(process.resourcesPath || '', 'native', 'dex_cpp.node'),
    // Alternative names
    path.join(__dirname, '..', '..', 'native', 'dex-cpp', 'build', 'Release', 'dex-cpp.node'),
    path.join(process.resourcesPath || '', 'native', 'dex-cpp.node'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(candidate) as DexCppModule;
      log.info(`[CppBridge] Loaded C++ module from: ${candidate}`);
      cppModule = mod;
      return mod;
    } catch {
      // Try next candidate
    }
  }

  log.warn('[CppBridge] C++ native module not found -- using JS fallback');
  return null;
}

// -------------------------------------------------------------------------
// Public Accessors
// -------------------------------------------------------------------------

export function isCppAvailable(): boolean {
  return loadCppModule() !== null;
}

export function getCppModule(): DexCppModule | null {
  return loadCppModule();
}

// -------------------------------------------------------------------------
// Bloom Filter Bridge
// -------------------------------------------------------------------------

export const CppBloom = {
  create(expectedItems: number, fpRate?: number): { bits: number; hashes: number } | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.bloomCreate(expectedItems, fpRate); }
    catch (e) { log.error('[CppBridge] bloomCreate failed:', e); return null; }
  },

  insert(key: string): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.bloomInsert(key); }
    catch (e) { log.error('[CppBridge] bloomInsert failed:', e); }
  },

  contains(key: string): boolean {
    const mod = getCppModule();
    if (!mod) return false;
    try { return mod.bloomContains(key); }
    catch (e) { log.error('[CppBridge] bloomContains failed:', e); return false; }
  },

  clear(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.bloomClear(); }
    catch (e) { log.error('[CppBridge] bloomClear failed:', e); }
  },

  stats(): BloomStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.bloomStats(); }
    catch (e) { log.error('[CppBridge] bloomStats failed:', e); return null; }
  },
};

// -------------------------------------------------------------------------
// Spatial Index Bridge
// -------------------------------------------------------------------------

export const CppSpatial = {
  create(): boolean {
    const mod = getCppModule();
    if (!mod) return false;
    try { return mod.spatialCreate(); }
    catch (e) { log.error('[CppBridge] spatialCreate failed:', e); return false; }
  },

  insert(id: number, x: number, y: number, z: number, label?: string): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.spatialInsert(id, x, y, z, label); }
    catch (e) { log.error('[CppBridge] spatialInsert failed:', e); }
  },

  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): SpatialPoint[] {
    const mod = getCppModule();
    if (!mod) return [];
    try { return mod.spatialQuery(minX, minY, minZ, maxX, maxY, maxZ); }
    catch (e) { log.error('[CppBridge] spatialQuery failed:', e); return []; }
  },

  nearest(x: number, y: number, z: number, k: number): SpatialNearestResult[] {
    const mod = getCppModule();
    if (!mod) return [];
    try { return mod.spatialNearest(x, y, z, k); }
    catch (e) { log.error('[CppBridge] spatialNearest failed:', e); return []; }
  },

  clear(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.spatialClear(); }
    catch (e) { log.error('[CppBridge] spatialClear failed:', e); }
  },

  count(): number {
    const mod = getCppModule();
    if (!mod) return 0;
    try { return mod.spatialCount(); }
    catch (e) { log.error('[CppBridge] spatialCount failed:', e); return 0; }
  },
};

// -------------------------------------------------------------------------
// Hash Engine Bridge
// -------------------------------------------------------------------------

export const CppHash = {
  fnv1a(input: string): string | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.hashFnv1a(input); }
    catch (e) { log.error('[CppBridge] hashFnv1a failed:', e); return null; }
  },

  xx64(input: string): string | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.hashXx64(input); }
    catch (e) { log.error('[CppBridge] hashXx64 failed:', e); return null; }
  },

  batch(inputs: string[]): string[] {
    const mod = getCppModule();
    if (!mod) return [];
    try { return mod.hashBatch(inputs); }
    catch (e) { log.error('[CppBridge] hashBatch failed:', e); return []; }
  },
};

// -------------------------------------------------------------------------
// Signal Processing Bridge
// -------------------------------------------------------------------------

export const CppSignal = {
  convolve(signal: Float64Array | number[], kernel: Float64Array | number[]): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.signalConvolve(signal, kernel); }
    catch (e) { log.error('[CppBridge] signalConvolve failed:', e); return null; }
  },

  normalize(buffer: Float64Array | number[]): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.signalNormalize(buffer); }
    catch (e) { log.error('[CppBridge] signalNormalize failed:', e); return null; }
  },

  rms(buffer: Float64Array | number[]): number {
    const mod = getCppModule();
    if (!mod) return 0;
    try { return mod.signalRms(buffer); }
    catch (e) { log.error('[CppBridge] signalRms failed:', e); return 0; }
  },

  peakDetect(buffer: Float64Array | number[], threshold: number, minDistance: number): number[] {
    const mod = getCppModule();
    if (!mod) return [];
    try { return mod.signalPeakDetect(buffer, threshold, minDistance); }
    catch (e) { log.error('[CppBridge] signalPeakDetect failed:', e); return []; }
  },
};

// -------------------------------------------------------------------------
// Matrix Operations Bridge
// -------------------------------------------------------------------------

export const CppMatrix = {
  identity(): Float64Array {
    const mod = getCppModule();
    if (!mod) {
      const m = new Float64Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    }
    try { return mod.mat4Identity(); }
    catch (e) { log.error('[CppBridge] mat4Identity failed:', e); const m = new Float64Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
  },

  multiply(a: Float64Array | number[], b: Float64Array | number[]): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mat4Multiply(a, b); }
    catch (e) { log.error('[CppBridge] mat4Multiply failed:', e); return null; }
  },

  rotateX(angle: number): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mat4RotateX(angle); }
    catch (e) { log.error('[CppBridge] mat4RotateX failed:', e); return null; }
  },

  rotateY(angle: number): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mat4RotateY(angle); }
    catch (e) { log.error('[CppBridge] mat4RotateY failed:', e); return null; }
  },

  perspective(fovY: number, aspect: number, near: number, far: number): Float64Array | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mat4Perspective(fovY, aspect, near, far); }
    catch (e) { log.error('[CppBridge] mat4Perspective failed:', e); return null; }
  },

  project(mvp: Float64Array | number[], x: number, y: number, z: number, viewportW: number, viewportH: number): ProjectResult | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mat4Project(mvp, x, y, z, viewportW, viewportH); }
    catch (e) { log.error('[CppBridge] mat4Project failed:', e); return null; }
  },
};

// -------------------------------------------------------------------------
// Thread Pool Bridge
// -------------------------------------------------------------------------

export const CppPool = {
  create(threads?: number): PoolStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.poolCreate(threads); }
    catch (e) { log.error('[CppBridge] poolCreate failed:', e); return null; }
  },

  stats(): PoolStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.poolStats(); }
    catch (e) { log.error('[CppBridge] poolStats failed:', e); return null; }
  },

  destroy(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.poolDestroy(); }
    catch (e) { log.error('[CppBridge] poolDestroy failed:', e); }
  },
};

// -------------------------------------------------------------------------
// Memory Pool Bridge
// -------------------------------------------------------------------------

export const CppMempool = {
  create(blockSize: number, blocksPerSlab?: number): MempoolStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mempoolCreate(blockSize, blocksPerSlab); }
    catch (e) { log.error('[CppBridge] mempoolCreate failed:', e); return null; }
  },

  stats(): MempoolStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.mempoolStats(); }
    catch (e) { log.error('[CppBridge] mempoolStats failed:', e); return null; }
  },

  reset(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.mempoolReset(); }
    catch (e) { log.error('[CppBridge] mempoolReset failed:', e); }
  },

  destroy(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.mempoolDestroy(); }
    catch (e) { log.error('[CppBridge] mempoolDestroy failed:', e); }
  },
};

// -------------------------------------------------------------------------
// LRU Cache Bridge
// -------------------------------------------------------------------------

export const CppCache = {
  create(capacity: number): CacheStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.cacheCreate(capacity); }
    catch (e) { log.error('[CppBridge] cacheCreate failed:', e); return null; }
  },

  get(key: string): string | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.cacheGet(key); }
    catch (e) { log.error('[CppBridge] cacheGet failed:', e); return null; }
  },

  put(key: string, value: string): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.cachePut(key, value); }
    catch (e) { log.error('[CppBridge] cachePut failed:', e); }
  },

  remove(key: string): boolean {
    const mod = getCppModule();
    if (!mod) return false;
    try { return mod.cacheRemove(key); }
    catch (e) { log.error('[CppBridge] cacheRemove failed:', e); return false; }
  },

  clear(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.cacheClear(); }
    catch (e) { log.error('[CppBridge] cacheClear failed:', e); }
  },

  stats(): CacheStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.cacheStats(); }
    catch (e) { log.error('[CppBridge] cacheStats failed:', e); return null; }
  },
};

// -------------------------------------------------------------------------
// Scheduler Bridge
// -------------------------------------------------------------------------

export const CppScheduler = {
  create(): boolean {
    const mod = getCppModule();
    if (!mod) return false;
    try { return mod.schedulerCreate(); }
    catch (e) { log.error('[CppBridge] schedulerCreate failed:', e); return false; }
  },

  enqueue(name: string, priority: number, deadlineMs?: number): number {
    const mod = getCppModule();
    if (!mod) return -1;
    try { return mod.schedulerEnqueue(name, priority, deadlineMs); }
    catch (e) { log.error('[CppBridge] schedulerEnqueue failed:', e); return -1; }
  },

  dequeue(): SchedulerTask | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.schedulerDequeue(); }
    catch (e) { log.error('[CppBridge] schedulerDequeue failed:', e); return null; }
  },

  stats(): CppSchedulerStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.schedulerStats(); }
    catch (e) { log.error('[CppBridge] schedulerStats failed:', e); return null; }
  },

  destroy(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.schedulerDestroy(); }
    catch (e) { log.error('[CppBridge] schedulerDestroy failed:', e); }
  },
};

// -------------------------------------------------------------------------
// I/O Ring Buffer Bridge
// -------------------------------------------------------------------------

export const CppRing = {
  create(capacity?: number): { capacity: number } | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.ringCreate(capacity); }
    catch (e) { log.error('[CppBridge] ringCreate failed:', e); return null; }
  },

  write(data: Buffer): number {
    const mod = getCppModule();
    if (!mod) return 0;
    try { return mod.ringWrite(data); }
    catch (e) { log.error('[CppBridge] ringWrite failed:', e); return 0; }
  },

  read(maxBytes?: number): Buffer {
    const mod = getCppModule();
    if (!mod) return Buffer.alloc(0);
    try { return mod.ringRead(maxBytes); }
    catch (e) { log.error('[CppBridge] ringRead failed:', e); return Buffer.alloc(0); }
  },

  stats(): RingStats | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.ringStats(); }
    catch (e) { log.error('[CppBridge] ringStats failed:', e); return null; }
  },

  reset(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.ringReset(); }
    catch (e) { log.error('[CppBridge] ringReset failed:', e); }
  },

  destroy(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.ringDestroy(); }
    catch (e) { log.error('[CppBridge] ringDestroy failed:', e); }
  },

  crc32(data: Buffer): number {
    const mod = getCppModule();
    if (!mod) return 0;
    try { return mod.crc32(data); }
    catch (e) { log.error('[CppBridge] crc32 failed:', e); return 0; }
  },
};

// -------------------------------------------------------------------------
// Profiler Bridge
// -------------------------------------------------------------------------

export const CppProfiler = {
  create(): boolean {
    const mod = getCppModule();
    if (!mod) return false;
    try { return mod.profilerCreate(); }
    catch (e) { log.error('[CppBridge] profilerCreate failed:', e); return false; }
  },

  begin(name: string): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.profilerBegin(name); }
    catch (e) { log.error('[CppBridge] profilerBegin failed:', e); }
  },

  end(name: string): number {
    const mod = getCppModule();
    if (!mod) return 0;
    try { return mod.profilerEnd(name); }
    catch (e) { log.error('[CppBridge] profilerEnd failed:', e); return 0; }
  },

  get(name: string): ProfilerEntry | null {
    const mod = getCppModule();
    if (!mod) return null;
    try { return mod.profilerGet(name); }
    catch (e) { log.error('[CppBridge] profilerGet failed:', e); return null; }
  },

  names(): string[] {
    const mod = getCppModule();
    if (!mod) return [];
    try { return mod.profilerNames(); }
    catch (e) { log.error('[CppBridge] profilerNames failed:', e); return []; }
  },

  clear(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.profilerClear(); }
    catch (e) { log.error('[CppBridge] profilerClear failed:', e); }
  },

  destroy(): void {
    const mod = getCppModule();
    if (!mod) return;
    try { mod.profilerDestroy(); }
    catch (e) { log.error('[CppBridge] profilerDestroy failed:', e); }
  },
};

// -------------------------------------------------------------------------
// Aggregate Initialization
// -------------------------------------------------------------------------

export function initCppSubsystems(): boolean {
  if (!isCppAvailable()) {
    log.warn('[CppBridge] C++ module not available -- all subsystems will use JS fallback');
    return false;
  }

  let ok = true;

  // Thread pool (use all cores minus 1 for main thread)
  const threads = Math.max(1, require('os').cpus().length - 1);
  if (!CppPool.create(threads)) ok = false;

  // Memory pool (64B blocks for small allocations)
  if (!CppMempool.create(64, 4096)) ok = false;

  // LRU cache (10k entries for metadata cache)
  if (!CppCache.create(10000)) ok = false;

  // Scheduler
  if (!CppScheduler.create()) ok = false;

  // Ring buffer (1MB for IO coalescing)
  if (!CppRing.create(1024 * 1024)) ok = false;

  // Profiler
  if (!CppProfiler.create()) ok = false;

  // Bloom filter (100k items, 0.01 FP rate for file search index)
  if (!CppBloom.create(100000, 0.01)) ok = false;

  // Spatial index
  if (!CppSpatial.create()) ok = false;

  if (ok) {
    log.info('[CppBridge] All C++ subsystems initialized');
  } else {
    log.warn('[CppBridge] Some C++ subsystems failed to initialize');
  }

  return ok;
}

export function shutdownCppSubsystems(): void {
  if (!isCppAvailable()) return;

  CppPool.destroy();
  CppMempool.destroy();
  CppScheduler.destroy();
  CppRing.destroy();
  CppProfiler.destroy();

  log.info('[CppBridge] All C++ subsystems shut down');
}

// -------------------------------------------------------------------------
// Re-export types
// -------------------------------------------------------------------------

export type {
  DexCppModule,
  BloomStats,
  SpatialPoint,
  SpatialNearestResult,
  ProjectResult,
  PoolStats,
  MempoolStats,
  CacheStats,
  SchedulerTask,
  CppSchedulerStats,
  RingStats,
  ProfilerEntry,
} from './cpp-types';
