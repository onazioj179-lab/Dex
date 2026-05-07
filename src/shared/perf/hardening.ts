// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Performance hardening primitives — wave P.
 *
 *  - Bundle-split planner (which app → which chunk)
 *  - Image lazy-load policy (viewport-relative thresholds)
 *  - IPC payload trimmer (drops fields over budget)
 *  - Virtual-scroll consumer adapter (windowed item slice)
 *  - Memory-pressure response policy
 *
 * Pure: no dynamic import, no DOM, no IPC. The image helper takes a
 * `position` instead of an IntersectionObserver for testability.
 */

// DEX v3.8.9 wave P - perf hardening

// -------- bundle split planner -------------------------------------

export interface AppManifestEntry {
  /** App or surface id, e.g. 'forge', 'vinx', 'prism'. */
  id: string;
  /** Estimated raw bundle weight in KB. */
  sizeKb: number;
  /** True when used during the first paint. */
  critical: boolean;
}

export interface ChunkPlan {
  chunkId: string;
  appIds: string[];
  totalKb: number;
}

export const CHUNK_TARGET_KB = 300 as const;
export const CHUNK_MAX_KB = 500 as const;

/**
 * Plan rollup chunks: every critical app goes into the 'main' chunk;
 * non-critical apps are bin-packed into 'lazy-N' chunks of <= CHUNK_MAX_KB.
 * Heaviest first to leave room for fillers.
 */
export function planChunks(manifest: readonly AppManifestEntry[]): ChunkPlan[] {
  const main: ChunkPlan = { chunkId: 'main', appIds: [], totalKb: 0 };
  const lazy: ChunkPlan[] = [];
  for (const m of manifest) {
    if (m.critical) {
      main.appIds.push(m.id);
      main.totalKb += m.sizeKb;
    }
  }
  const nonCritical = manifest
    .filter((m) => !m.critical)
    .slice()
    .sort((a, b) => b.sizeKb - a.sizeKb);
  for (const m of nonCritical) {
    let placed = false;
    for (const c of lazy) {
      if (c.totalKb + m.sizeKb <= CHUNK_MAX_KB) {
        c.appIds.push(m.id);
        c.totalKb += m.sizeKb;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lazy.push({ chunkId: `lazy-${lazy.length + 1}`, appIds: [m.id], totalKb: m.sizeKb });
    }
  }
  return [main, ...lazy];
}

// -------- image lazy-load policy -----------------------------------

export type ImageLoadDecision = 'load-now' | 'preload-soon' | 'defer';

export interface LazyImageInput {
  /** Distance from the viewport in CSS pixels (negative = inside viewport). */
  distanceFromViewportPx: number;
  /** True when the user is actively scrolling. */
  scrolling: boolean;
  /** True when the network is metered (e.g. cellular). */
  saveData: boolean;
}

/**
 * Decide whether to load an image now, preload it soon, or defer.
 *  - Inside viewport → load-now
 *  - Within 400px (or 200px when saveData) → preload-soon (unless scrolling)
 *  - Otherwise → defer
 */
export function decideImageLoad(input: LazyImageInput): ImageLoadDecision {
  if (input.distanceFromViewportPx <= 0) return 'load-now';
  const preloadBudget = input.saveData ? 200 : 400;
  if (input.distanceFromViewportPx <= preloadBudget && !input.scrolling) return 'preload-soon';
  return 'defer';
}

// -------- IPC payload trimmer -------------------------------------

export const IPC_PAYLOAD_BUDGET_BYTES = 256 * 1024; // 256 KB

export interface TrimResult<T> {
  payload: T;
  /** Field names that were trimmed (empty when within budget). */
  droppedFields: string[];
  estimatedBytes: number;
  underBudget: boolean;
}

function approxBytes(value: unknown): number {
  // UTF-16 string approx: 2 bytes per char + JSON quoting overhead.
  return JSON.stringify(value ?? null).length;
}

/**
 * Trim large optional fields from an IPC payload to fit under
 * `budgetBytes`. `optionalFields` are dropped in order until under
 * budget. Required fields are never touched.
 */
export function trimIpcPayload<T extends Record<string, unknown>>(
  payload: T,
  optionalFields: readonly (keyof T)[],
  budgetBytes: number = IPC_PAYLOAD_BUDGET_BYTES
): TrimResult<T> {
  let working: Record<string, unknown> = { ...payload };
  let bytes = approxBytes(working);
  const dropped: string[] = [];
  for (const field of optionalFields) {
    if (bytes <= budgetBytes) break;
    if (working[field as string] === undefined) continue;
    const { [field as string]: _omit, ...rest } = working;
    void _omit;
    working = rest;
    dropped.push(field as string);
    bytes = approxBytes(working);
  }
  return {
    payload: working as T,
    droppedFields: dropped,
    estimatedBytes: bytes,
    underBudget: bytes <= budgetBytes,
  };
}

// -------- virtual scroll adapter -----------------------------------

export interface VirtualWindow {
  /** Inclusive start index. */
  startIndex: number;
  /** Exclusive end index. */
  endIndex: number;
  /** Top padding in px. */
  padTopPx: number;
  /** Bottom padding in px. */
  padBottomPx: number;
}

/**
 * Compute the visible window for a scrollable list with fixed-height
 * items.
 *
 * @param totalItems  Total list length
 * @param itemHeight  Pixel height of each item (must be > 0)
 * @param scrollTop   Current scrollTop in px
 * @param viewportPx  Viewport height in px
 * @param overscan    Extra items rendered above/below for smoothness (>= 0)
 */
export function computeWindow(
  totalItems: number,
  itemHeight: number,
  scrollTop: number,
  viewportPx: number,
  overscan: number = 4
): VirtualWindow {
  if (itemHeight <= 0) throw new RangeError('itemHeight must be > 0');
  if (totalItems <= 0) {
    return { startIndex: 0, endIndex: 0, padTopPx: 0, padBottomPx: 0 };
  }
  const safeScroll = Math.max(0, scrollTop);
  const firstVisible = Math.floor(safeScroll / itemHeight);
  const visibleCount = Math.ceil(viewportPx / itemHeight) + 1;
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(totalItems, firstVisible + visibleCount + overscan);
  const padTopPx = startIndex * itemHeight;
  const padBottomPx = (totalItems - endIndex) * itemHeight;
  return { startIndex, endIndex, padTopPx, padBottomPx };
}

// -------- memory-pressure policy ----------------------------------

export type MemoryPressure = 'low' | 'moderate' | 'high' | 'critical';

export interface MemorySnapshot {
  /** Heap used in bytes. */
  heapUsed: number;
  /** Heap limit in bytes. */
  heapLimit: number;
}

export interface MemoryAction {
  pressure: MemoryPressure;
  /** Recommended actions, in order. */
  actions: string[];
}

/**
 * Classify pressure and propose mitigations.
 *  - <50%  → low: nothing to do
 *  - 50-75 → moderate: drop image cache LRU tail
 *  - 75-90 → high: drop background tabs, pause prefetch
 *  - >=90  → critical: hard-evict, force GC hint
 */
export function classifyMemory(snap: MemorySnapshot): MemoryAction {
  if (snap.heapLimit <= 0) return { pressure: 'low', actions: [] };
  const ratio = snap.heapUsed / snap.heapLimit;
  if (ratio >= 0.9) {
    return {
      pressure: 'critical',
      actions: ['evict-all-caches', 'hint-gc', 'pause-prefetch', 'warn-user'],
    };
  }
  if (ratio >= 0.75) {
    return {
      pressure: 'high',
      actions: ['evict-background-tabs', 'pause-prefetch', 'shrink-image-cache'],
    };
  }
  if (ratio >= 0.5) {
    return {
      pressure: 'moderate',
      actions: ['shrink-image-cache'],
    };
  }
  return { pressure: 'low', actions: [] };
}
