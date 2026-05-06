// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// TypeScript type declarations for the dex-cpp native addon.
// Generated from C++ N-API exports in src/native/dex-cpp/src/*.h
// ===========================================================================

export interface BloomStats {
  count: number;
  bits: number;
  hashes: number;
  fillRatio: number;
}

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

// Bloom filter
export function bloomCreate(expectedItems: number, fpRate?: number): { bits: number; hashes: number };
export function bloomInsert(key: string): void;
export function bloomContains(key: string): boolean;
export function bloomClear(): void;
export function bloomStats(): BloomStats;

// Spatial index
export function spatialCreate(): boolean;
export function spatialInsert(id: number, x: number, y: number, z: number, label?: string): void;
export function spatialQuery(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): SpatialPoint[];
export function spatialNearest(x: number, y: number, z: number, k: number): SpatialNearestResult[];
export function spatialClear(): void;
export function spatialCount(): number;

// Hash engine
export function hashFnv1a(input: string): string;
export function hashXx64(input: string): string;
export function hashBatch(inputs: string[]): string[];

// Signal processing
export function signalConvolve(signal: number[] | Float64Array, kernel: number[] | Float64Array): Float64Array;
export function signalNormalize(buffer: number[] | Float64Array): Float64Array;
export function signalRms(buffer: number[] | Float64Array): number;
export function signalPeakDetect(buffer: number[] | Float64Array, threshold: number, minDistance: number): number[];

// Matrix operations (4x4, column-major)
export function mat4Identity(): Float64Array;
export function mat4Multiply(a: number[] | Float64Array, b: number[] | Float64Array): Float64Array;
export function mat4RotateX(angle: number): Float64Array;
export function mat4RotateY(angle: number): Float64Array;
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float64Array;
export function mat4Project(mvp: number[] | Float64Array, x: number, y: number, z: number, viewportW: number, viewportH: number): ProjectResult;

// ---------------------------------------------------------------------------
// Thread pool
// ---------------------------------------------------------------------------
export interface PoolStats {
  threads: number;
  submitted: number;
  completed: number;
  active: number;
}

export function poolCreate(threads?: number): PoolStats;
export function poolStats(): PoolStats;
export function poolDestroy(): void;

// ---------------------------------------------------------------------------
// Memory pool (slab allocator)
// ---------------------------------------------------------------------------
export interface MempoolStats {
  blockSize: number;
  blocksPerSlab: number;
  slabCount: number;
  totalBlocks: number;
  freeBlocks: number;
  utilization: number;
}

export function mempoolCreate(blockSize: number, blocksPerSlab?: number): MempoolStats;
export function mempoolStats(): MempoolStats;
export function mempoolReset(): void;
export function mempoolDestroy(): void;

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------
export interface CacheStats {
  capacity: number;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export function cacheCreate(capacity: number): CacheStats;
export function cacheGet(key: string): string | null;
export function cachePut(key: string, value: string): void;
export function cacheRemove(key: string): boolean;
export function cacheClear(): void;
export function cacheStats(): CacheStats;

// ---------------------------------------------------------------------------
// Scheduler (priority queue with starvation prevention)
// ---------------------------------------------------------------------------
export interface SchedulerTask {
  id: number;
  name: string;
  priority: number;
  deadlineMs: number;
  enqueuedAt: number;
  startedAt: number;
}

export interface SchedulerStats {
  pending: number;
  completed: number;
  starved: number;
}

export function schedulerCreate(): boolean;
export function schedulerEnqueue(name: string, priority: number, deadlineMs?: number): number;
export function schedulerDequeue(): SchedulerTask | null;
export function schedulerStats(): SchedulerStats;
export function schedulerDestroy(): void;

// ---------------------------------------------------------------------------
// I/O engine (ring buffer + CRC32)
// ---------------------------------------------------------------------------
export interface RingStats {
  capacity: number;
  used: number;
  available: number;
  totalRead: number;
  totalWritten: number;
}

export function ringCreate(capacity?: number): { capacity: number };
export function ringWrite(data: Buffer): number;
export function ringRead(maxBytes?: number): Buffer;
export function ringStats(): RingStats;
export function ringReset(): void;
export function ringDestroy(): void;
export function crc32(data: Buffer): number;

// ---------------------------------------------------------------------------
// Profiler (microsecond-precision hierarchical timer)
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

export function profilerCreate(): boolean;
export function profilerBegin(name: string): void;
export function profilerEnd(name: string): number;
export function profilerGet(name: string): ProfilerEntry | null;
export function profilerNames(): string[];
export function profilerClear(): void;
export function profilerDestroy(): void;
