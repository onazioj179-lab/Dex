// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX C++ Native -- TypeScript Type Definitions
// Types matching C++ N-API exports from src/native/dex-cpp/
// ===========================================================================

// ---------------------------------------------------------------------------
// Bloom Filter
// ---------------------------------------------------------------------------

export interface BloomStats {
  count: number;
  bits: number;
  hashes: number;
  fillRatio: number;
}

// ---------------------------------------------------------------------------
// Spatial Index
// ---------------------------------------------------------------------------

export interface SpatialPoint {
  id: number;
  x: number;
  y: number;
  z: number;
  label: string;
}

export interface SpatialNearestResult extends SpatialPoint {
  dist: number;
}

export interface ProjectResult {
  sx: number;
  sy: number;
  depth: number;
}

// ---------------------------------------------------------------------------
// Thread Pool
// ---------------------------------------------------------------------------

export interface PoolStats {
  threads: number;
  submitted: number;
  completed: number;
  active: number;
}

// ---------------------------------------------------------------------------
// Memory Pool
// ---------------------------------------------------------------------------

export interface MempoolStats {
  blockSize: number;
  blocksPerSlab: number;
  slabCount: number;
  totalBlocks: number;
  freeBlocks: number;
  utilization: number;
}

// ---------------------------------------------------------------------------
// LRU Cache
// ---------------------------------------------------------------------------

export interface CacheStats {
  capacity: number;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface SchedulerTask {
  id: number;
  name: string;
  priority: number;
  deadlineMs: number;
  enqueuedAt: number;
  startedAt: number;
}

export interface CppSchedulerStats {
  pending: number;
  completed: number;
  starved: number;
}

// ---------------------------------------------------------------------------
// I/O Ring Buffer
// ---------------------------------------------------------------------------

export interface RingStats {
  capacity: number;
  used: number;
  available: number;
  totalRead: number;
  totalWritten: number;
}

// ---------------------------------------------------------------------------
// Profiler
// ---------------------------------------------------------------------------

export interface ProfilerEntry {
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
  p99: number;
  stddev: number;
}

// ---------------------------------------------------------------------------
// Full Module Interface
// ---------------------------------------------------------------------------

export interface DexCppModule {
  // Bloom filter
  bloomCreate(expectedItems: number, fpRate?: number): { bits: number; hashes: number };
  bloomInsert(key: string): void;
  bloomContains(key: string): boolean;
  bloomClear(): void;
  bloomStats(): BloomStats;

  // Spatial index
  spatialCreate(): boolean;
  spatialInsert(id: number, x: number, y: number, z: number, label?: string): void;
  spatialQuery(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): SpatialPoint[];
  spatialNearest(x: number, y: number, z: number, k: number): SpatialNearestResult[];
  spatialClear(): void;
  spatialCount(): number;

  // Hash engine
  hashFnv1a(input: string): string;
  hashXx64(input: string): string;
  hashBatch(inputs: string[]): string[];

  // Signal processing
  signalConvolve(signal: Float64Array | number[], kernel: Float64Array | number[]): Float64Array;
  signalNormalize(buffer: Float64Array | number[]): Float64Array;
  signalRms(buffer: Float64Array | number[]): number;
  signalPeakDetect(buffer: Float64Array | number[], threshold: number, minDistance: number): number[];

  // Matrix operations
  mat4Identity(): Float64Array;
  mat4Multiply(a: Float64Array | number[], b: Float64Array | number[]): Float64Array;
  mat4RotateX(angle: number): Float64Array;
  mat4RotateY(angle: number): Float64Array;
  mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float64Array;
  mat4Project(mvp: Float64Array | number[], x: number, y: number, z: number, viewportW: number, viewportH: number): ProjectResult;

  // Thread pool
  poolCreate(threads?: number): PoolStats;
  poolStats(): PoolStats;
  poolDestroy(): void;

  // Memory pool
  mempoolCreate(blockSize: number, blocksPerSlab?: number): MempoolStats;
  mempoolStats(): MempoolStats;
  mempoolReset(): void;
  mempoolDestroy(): void;

  // LRU cache
  cacheCreate(capacity: number): CacheStats;
  cacheGet(key: string): string | null;
  cachePut(key: string, value: string): void;
  cacheRemove(key: string): boolean;
  cacheClear(): void;
  cacheStats(): CacheStats;

  // Scheduler
  schedulerCreate(): boolean;
  schedulerEnqueue(name: string, priority: number, deadlineMs?: number): number;
  schedulerDequeue(): SchedulerTask | null;
  schedulerStats(): CppSchedulerStats;
  schedulerDestroy(): void;

  // I/O ring buffer
  ringCreate(capacity?: number): { capacity: number };
  ringWrite(data: Buffer): number;
  ringRead(maxBytes?: number): Buffer;
  ringStats(): RingStats;
  ringReset(): void;
  ringDestroy(): void;
  crc32(data: Buffer): number;

  // Profiler
  profilerCreate(): boolean;
  profilerBegin(name: string): void;
  profilerEnd(name: string): number;
  profilerGet(name: string): ProfilerEntry | null;
  profilerNames(): string[];
  profilerClear(): void;
  profilerDestroy(): void;
}
