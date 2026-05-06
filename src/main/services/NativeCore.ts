// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX NativeCore Service
// Unified API wrapping the dex-core Rust addon with full JS fallbacks.
// Every function works without the native module -- Rust just makes it faster.
// ===========================================================================

import { getCoreModule, isCoreAvailable } from '../native/core-loader';
import type { PlatformInfo, PerformanceTier, PressureLevel, MemoryUsage } from '../native/core-types';
import log from 'electron-log';

// -------------------------------------------------------------------------
// Physics Bridge
// -------------------------------------------------------------------------

export const CorePhysics = {
  createSpring(
    stiffness: number,
    damping: number,
    mass: number,
    initial: number,
    target: number,
  ): number {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.physicsCreateSpring(stiffness, damping, mass, initial, target); }
      catch (e) { log.error('[CorePhysics] createSpring native error:', e); }
    }
    return -1; // JS fallback uses its own SpringAnimator
  },

  setTarget(id: number, target: number): void {
    const mod = getCoreModule();
    if (mod && id >= 0) {
      try { mod.physicsSetTarget(id, target); return; }
      catch (e) { log.error('[CorePhysics] setTarget native error:', e); }
    }
  },

  tickAll(dt: number): Float64Array {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.physicsTickAll(dt); }
      catch (e) { log.error('[CorePhysics] tickAll native error:', e); }
    }
    return new Float64Array(0);
  },

  releaseSpring(id: number): void {
    const mod = getCoreModule();
    if (mod && id >= 0) {
      try { mod.physicsReleaseSpring(id); }
      catch (e) { log.error('[CorePhysics] releaseSpring native error:', e); }
    }
  },

  getPosition(id: number): number {
    const mod = getCoreModule();
    if (mod && id >= 0) {
      try { return mod.physicsGetPosition(id); }
      catch (e) { log.error('[CorePhysics] getPosition native error:', e); }
    }
    return 0;
  },

  setValue(id: number, value: number): void {
    const mod = getCoreModule();
    if (mod && id >= 0) {
      try { mod.physicsSetValue(id, value); }
      catch (e) { log.error('[CorePhysics] setValue native error:', e); }
    }
  },
};

// -------------------------------------------------------------------------
// Game Engine Bridge
// -------------------------------------------------------------------------

/**
 * Pure JS A* pathfinding fallback.
 * Returns flattened [x0,y0, x1,y1, ...] path or null if no path exists.
 */
function jsAstar(
  grid: Uint8Array, w: number, h: number,
  sx: number, sy: number, gx: number, gy: number,
): Int32Array | null {
  const key = (x: number, y: number) => y * w + x;
  const start = key(sx, sy);
  const goal = key(gx, gy);

  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();

  gScore.set(start, 0);
  fScore.set(start, Math.abs(gx - sx) + Math.abs(gy - sy));

  // Simple priority queue via sorted array
  const open = [start];
  const closed = new Set<number>();

  while (open.length > 0) {
    // Pop node with lowest fScore
    open.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
    const current = open.shift()!;

    if (current === goal) {
      // Reconstruct path
      const path: number[] = [];
      let node = current;
      while (node !== undefined) {
        path.push(node % w, Math.floor(node / w));
        node = cameFrom.get(node)!;
        if (node === start) { path.push(sx, sy); break; }
      }
      path.reverse();
      // path is [y0,x0, y1,x1, ...] after reverse, swap to [x0,y0, ...]
      const result = new Int32Array(path.length);
      for (let i = 0; i < path.length; i += 2) {
        result[i] = path[i + 1];
        result[i + 1] = path[i];
      }
      return result;
    }

    closed.add(current);
    const cx = current % w;
    const cy = Math.floor(current / w);

    // 4-directional neighbors
    const neighbors = [
      { x: cx - 1, y: cy }, { x: cx + 1, y: cy },
      { x: cx, y: cy - 1 }, { x: cx, y: cy + 1 },
    ];

    for (const { x, y } of neighbors) {
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const nk = key(x, y);
      if (closed.has(nk)) continue;
      if (grid[nk] !== 0) continue; // 0 = walkable

      const tentative = (gScore.get(current) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + Math.abs(gx - x) + Math.abs(gy - y));
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }

  return null; // No path found
}

export const CoreGame = {
  init(capacity: number): void {
    const mod = getCoreModule();
    if (mod) {
      try { mod.gameInit(capacity); return; }
      catch (e) { log.error('[CoreGame] init native error:', e); }
    }
  },

  spawnEntity(x: number, y: number, health: number): number {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.gameSpawnEntity(x, y, health); }
      catch (e) { log.error('[CoreGame] spawnEntity native error:', e); }
    }
    return -1;
  },

  setPlayer(index: number): void {
    const mod = getCoreModule();
    if (mod) {
      try { mod.gameSetPlayer(index); }
      catch (e) { log.error('[CoreGame] setPlayer native error:', e); }
    }
  },

  tick(
    dt: number,
    left: boolean,
    right: boolean,
    up: boolean,
    down: boolean,
    dash: boolean,
  ): void {
    const mod = getCoreModule();
    if (mod) {
      try { mod.gameTick(dt, left, right, up, down, dash); return; }
      catch (e) { log.error('[CoreGame] tick native error:', e); }
    }
  },

  getState(): Float64Array {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.gameGetState(); }
      catch (e) { log.error('[CoreGame] getState native error:', e); }
    }
    return new Float64Array(0);
  },

  astar(
    grid: Uint8Array,
    w: number,
    h: number,
    sx: number,
    sy: number,
    gx: number,
    gy: number,
  ): Int32Array | null {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.gameAstar(grid, w, h, sx, sy, gx, gy); }
      catch (e) { log.error('[CoreGame] astar native error:', e); }
    }
    // JS A* fallback
    return jsAstar(grid, w, h, sx, sy, gx, gy);
  },
};

// -------------------------------------------------------------------------
// Memory Monitoring Bridge
// -------------------------------------------------------------------------

export const CoreMemory = {
  async getPressure(): Promise<PressureLevel> {
    const mod = getCoreModule();
    if (mod) {
      try {
        const level = await mod.memoryGetPressure();
        return level as PressureLevel;
      } catch (e) {
        log.error('[CoreMemory] getPressure native error:', e);
      }
    }
    // JS fallback: always report normal
    return 'normal';
  },

  getUsage(): MemoryUsage {
    const mod = getCoreModule();
    if (mod) {
      try {
        const json = mod.memoryGetUsage();
        return JSON.parse(json) as MemoryUsage;
      } catch (e) {
        log.error('[CoreMemory] getUsage native error:', e);
      }
    }
    // JS fallback using process.memoryUsage
    const mem = process.memoryUsage();
    return {
      rss_bytes: mem.rss,
      virtual_bytes: mem.heapTotal,
    };
  },
};

// -------------------------------------------------------------------------
// Transfer Bridge
// -------------------------------------------------------------------------

export const CoreTransfer = {
  async hashFile(filePath: string): Promise<string> {
    const mod = getCoreModule();
    if (mod) {
      try { return await mod.transferHashFile(filePath); }
      catch (e) { log.error('[CoreTransfer] hashFile native error:', e); }
    }
    // JS fallback: compute SHA-256 using crypto
    const crypto = await import('crypto');
    const fs = await import('fs');
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  },

  compress(data: Buffer): Buffer {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.transferCompress(data); }
      catch (e) { log.error('[CoreTransfer] compress native error:', e); }
    }
    // JS fallback: zlib deflate
    const zlib = require('zlib') as typeof import('zlib');
    return zlib.deflateSync(data);
  },

  decompress(data: Buffer): Buffer {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.transferDecompress(data); }
      catch (e) { log.error('[CoreTransfer] decompress native error:', e); }
    }
    // JS fallback: zlib inflate
    const zlib = require('zlib') as typeof import('zlib');
    return zlib.inflateSync(data);
  },
};

// -------------------------------------------------------------------------
// Search Bridge
// -------------------------------------------------------------------------

export const CoreSearch = {
  async fuzzy(
    query: string,
    candidates: string[],
    limit: number,
  ): Promise<string[]> {
    const mod = getCoreModule();
    if (mod) {
      try { return await mod.searchFuzzy(query, candidates, limit); }
      catch (e) { log.error('[CoreSearch] fuzzy native error:', e); }
    }
    // JS fallback: simple substring filter
    if (!query) return [];
    const lower = query.toLowerCase();
    const scored = candidates
      .map((c, i) => ({ c, i, score: jsFuzzyScore(lower, c.toLowerCase()) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map(x => x.c);
  },
};

function jsFuzzyScore(query: string, candidate: string): number {
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ci = 0; ci < candidate.length && qi < query.length; ci++) {
    if (candidate[ci] === query[qi]) {
      score += 1 + consecutive * 5;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  return qi === query.length ? score : 0;
}

// -------------------------------------------------------------------------
// Effects Bridge
// -------------------------------------------------------------------------

export const CoreEffects = {
  tickParticles(dt: number): Float64Array {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.effectsTickParticles(dt); }
      catch (e) { log.error('[CoreEffects] tickParticles native error:', e); }
    }
    return new Float64Array(0);
  },

  spawnBurst(
    x: number,
    y: number,
    count: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const mod = getCoreModule();
    if (mod) {
      try { mod.effectsSpawnBurst(x, y, count, r, g, b); return; }
      catch (e) { log.error('[CoreEffects] spawnBurst native error:', e); }
    }
    // JS fallback: particles are handled entirely in the renderer VisualEffects system
  },
};

// -------------------------------------------------------------------------
// Scheduler Bridge
// -------------------------------------------------------------------------

export const CoreScheduler = {
  getCoreCount(): number {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.schedulerGetCoreCount(); }
      catch (e) { log.error('[CoreScheduler] getCoreCount native error:', e); }
    }
    const os = require('os') as typeof import('os');
    return os.cpus().length;
  },

  getRecommendedThreads(): number {
    const mod = getCoreModule();
    if (mod) {
      try { return mod.schedulerGetRecommendedThreads(); }
      catch (e) { log.error('[CoreScheduler] getRecommendedThreads native error:', e); }
    }
    const os = require('os') as typeof import('os');
    const cores = os.cpus().length;
    return Math.max(1, cores - 2);
  },

  getPerformanceTier(): PerformanceTier {
    const cores = this.getCoreCount();
    const threads = this.getRecommendedThreads();
    let tier: 'high' | 'medium' | 'low';
    let maxParticles: number;
    let maxBlurSurfaces: number;
    let enableMotionBlur: boolean;

    if (cores >= 8) {
      tier = 'high';
      maxParticles = 200;
      maxBlurSurfaces = 10;
      enableMotionBlur = true;
    } else if (cores >= 4) {
      tier = 'medium';
      maxParticles = 50;
      maxBlurSurfaces = 4;
      enableMotionBlur = false;
    } else {
      tier = 'low';
      maxParticles = 20;
      maxBlurSurfaces = 1;
      enableMotionBlur = false;
    }

    return {
      tier,
      cores,
      recommended_threads: threads,
      max_particles: maxParticles,
      max_blur_surfaces: maxBlurSurfaces,
      enable_motion_blur: enableMotionBlur,
    };
  },
};

// -------------------------------------------------------------------------
// Platform Info Bridge
// -------------------------------------------------------------------------

export const CorePlatform = {
  getInfo(): PlatformInfo {
    const mod = getCoreModule();
    if (mod) {
      try {
        const json = mod.platformGetInfo();
        return JSON.parse(json) as PlatformInfo;
      } catch (e) {
        log.error('[CorePlatform] getInfo native error:', e);
      }
    }
    // JS fallback
    const os = require('os') as typeof import('os');
    return {
      os: os.platform(),
      arch: os.arch(),
      family: os.type(),
      features: [],
    };
  },
};

// -------------------------------------------------------------------------
// Top-level convenience
// -------------------------------------------------------------------------

export function isNativeCoreAvailable(): boolean {
  return isCoreAvailable();
}
