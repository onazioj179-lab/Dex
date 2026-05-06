// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Core -- TypeScript Type Definitions for dex-core Rust addon
// Matches the NAPI exports from src/native/dex-core/src/lib.rs
// ===========================================================================

// -------------------------------------------------------------------------
// Physics
// -------------------------------------------------------------------------

export interface SpringHandle {
  id: number;
}

// -------------------------------------------------------------------------
// Memory
// -------------------------------------------------------------------------

export type PressureLevel = 'normal' | 'moderate' | 'high' | 'critical';

export interface MemoryUsage {
  rss_bytes: number;
  virtual_bytes: number;
}

// -------------------------------------------------------------------------
// Platform
// -------------------------------------------------------------------------

export interface PlatformInfo {
  os: string;
  arch: string;
  family: string;
  features: string[];
}

// -------------------------------------------------------------------------
// Scheduler
// -------------------------------------------------------------------------

export interface PerformanceTier {
  tier: 'high' | 'medium' | 'low';
  cores: number;
  recommended_threads: number;
  max_particles: number;
  max_blur_surfaces: number;
  enable_motion_blur: boolean;
}

// -------------------------------------------------------------------------
// Module Interface
// -------------------------------------------------------------------------

export interface DexCoreModule {
  // Physics
  physicsCreateSpring(
    stiffness: number,
    damping: number,
    mass: number,
    initial: number,
    target: number,
  ): number;
  physicsSetTarget(id: number, target: number): void;
  physicsTickAll(dt: number): Float64Array;
  physicsReleaseSpring(id: number): void;
  physicsGetPosition(id: number): number;
  physicsSetValue(id: number, value: number): void;

  // Game
  gameInit(capacity: number): void;
  gameSpawnEntity(x: number, y: number, health: number): number;
  gameSetPlayer(index: number): void;
  gameTick(
    dt: number,
    left: boolean,
    right: boolean,
    up: boolean,
    down: boolean,
    dash: boolean,
  ): void;
  gameGetState(): Float64Array;
  gameAstar(
    grid: Uint8Array,
    w: number,
    h: number,
    sx: number,
    sy: number,
    gx: number,
    gy: number,
  ): Int32Array | null;

  // Memory
  memoryGetPressure(): Promise<string>;
  memoryGetUsage(): string;

  // Transfer
  transferHashFile(path: string): Promise<string>;
  transferCompress(data: Buffer): Buffer;
  transferDecompress(data: Buffer): Buffer;

  // Search
  searchFuzzy(
    query: string,
    candidates: string[],
    limit: number,
  ): Promise<string[]>;

  // Effects
  effectsTickParticles(dt: number): Float64Array;
  effectsSpawnBurst(
    x: number,
    y: number,
    count: number,
    r: number,
    g: number,
    b: number,
  ): void;

  // Scheduler
  schedulerGetCoreCount(): number;
  schedulerGetRecommendedThreads(): number;

  // Platform
  platformGetInfo(): string;

  // Database (Phase 2 -- rusqlite)
  dbOpen(path: string): void;
  dbExecute(sql: string, paramsJson: string): number;
  dbQuery(sql: string, paramsJson: string): string;
  dbClose(): void;

  // Zstd Compression (Phase 3)
  transferCompressZstd(data: Buffer, level?: number): Promise<Buffer>;
  transferDecompressZstd(data: Buffer): Promise<Buffer>;
  transferCompressZstdStream(inputPath: string, outputPath: string, level?: number): Promise<number>;

  // Cryptography (Phase 4 -- ring)
  cryptoEncrypt(data: Buffer, key: Buffer): Buffer;
  cryptoDecrypt(data: Buffer, key: Buffer): Buffer;
  cryptoDeriveKey(password: string, salt: Buffer, iterations: number): Buffer;
  cryptoRandomBytes(len: number): Buffer;

  // Full-Text Search (Phase 5 -- tantivy)
  ftsCreateIndex(path: string): void;
  ftsOpenIndex(path: string): void;
  ftsAddDocument(id: string, title: string, body: string): void;
  ftsCommit(): void;
  ftsSearch(query: string, limit: number): string;
  ftsDeleteDocument(id: string): void;

  // Zero-Copy Networking (Phase 8)
  networkZeroCopyTransfer(sourcePath: string, destHost: string, destPort: number): Promise<number>;

  // Process Supervisor (Phase 9)
  supervisorInit(): void;
  supervisorRegisterProcess(pid: number, name: string): void;
  supervisorHeartbeat(pid: number): void;
  supervisorGetHealth(): string;
  supervisorUnregisterProcess(pid: number): void;

  // Game Engine Enhancements (Phase 10)
  gameSpawnEnemy(x: number, y: number, hp: number, aiType: number): number;
  gameApplyDamage(entity: number, damage: number): void;
  gameGetCollisions(): Int32Array;
  gameSpawnLoot(x: number, y: number, lootType: number): number;

  // Phantom (Phase 11)
  phantomDetectSpeed(path: string): Promise<string>;
  phantomZeroTrace(paths: string[]): number;
  phantomSync(source: string, target: string, key: Buffer): Promise<string>;
}
