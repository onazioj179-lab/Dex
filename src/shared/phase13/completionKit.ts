// =============================================================================
// DEX Platform - Phase 13: Production Completion Kit
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 13 - production completion primitives addressing remaining gap
 * categories from the final refinement brief. All primitives are pure,
 * dependency-free, additive, and individually testable.
 *
 * Subsystems covered:
 *  - TerminalOutputRing       large-output ring buffer with bounded memory
 *  - CommandHistoryStore      persistent command history with dedupe + search
 *  - NexusViewportCuller      level-of-detail + viewport culling for graphs
 *  - MonitoringSampler        decoupled collection/paint with axis hysteresis
 *  - AutosaveCoordinator      throttled autosave with merge of pending writes
 *  - ResumableExportPipeline  staged export with checkpointed resume
 *  - SnapPresetEngine         tiling snap presets per-display
 *  - MultiMonitorMemory       per-display window placement memory
 *  - AppLauncherIndex         fuzzy launcher match with stable ordering
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */

// ---------------------------------------------------------------------------
// TerminalOutputRing
// ---------------------------------------------------------------------------

export interface TerminalLine {
  readonly seq: number;
  readonly text: string;
  readonly stream: 'stdout' | 'stderr';
  readonly atMs: number;
}

export interface TerminalOutputRingOptions {
  readonly maxLines?: number;
  readonly maxBytes?: number;
}

/**
 * Bounded ring buffer for terminal output. Caps both line count and byte
 * total so a runaway process cannot exhaust memory. Lines are dropped from
 * the oldest end first.
 */
export class TerminalOutputRing {
  private readonly maxLines: number;
  private readonly maxBytes: number;
  private buf: TerminalLine[] = [];
  private bytes = 0;
  private nextSeq = 1;
  private droppedCount = 0;

  constructor(opts: TerminalOutputRingOptions = {}) {
    this.maxLines = Math.max(1, opts.maxLines ?? 10_000);
    this.maxBytes = Math.max(1, opts.maxBytes ?? 8 * 1024 * 1024);
  }

  push(text: string, stream: 'stdout' | 'stderr' = 'stdout', atMs = Date.now()): TerminalLine {
    const line: TerminalLine = { seq: this.nextSeq++, text, stream, atMs };
    this.buf.push(line);
    this.bytes += text.length;
    this.evict();
    return line;
  }

  private evict(): void {
    while (this.buf.length > this.maxLines || this.bytes > this.maxBytes) {
      const dropped = this.buf.shift();
      if (!dropped) break;
      this.bytes -= dropped.text.length;
      this.droppedCount += 1;
    }
  }

  size(): number { return this.buf.length; }
  byteSize(): number { return this.bytes; }
  dropped(): number { return this.droppedCount; }

  /** Read a slice by sequence range. Returns lines whose seq is in [fromSeq, toSeq). */
  slice(fromSeq: number, toSeq: number): TerminalLine[] {
    if (toSeq <= fromSeq) return [];
    const out: TerminalLine[] = [];
    for (const l of this.buf) {
      if (l.seq >= fromSeq && l.seq < toSeq) out.push(l);
    }
    return out;
  }

  /** Last N lines, newest last. */
  tail(n: number): TerminalLine[] {
    if (n <= 0) return [];
    return this.buf.slice(Math.max(0, this.buf.length - n));
  }

  /** Linear search across the buffer. Returns matching lines (case-insensitive). */
  find(query: string, limit = 200): TerminalLine[] {
    if (!query) return [];
    const q = query.toLowerCase();
    const out: TerminalLine[] = [];
    for (const l of this.buf) {
      if (l.text.toLowerCase().includes(q)) {
        out.push(l);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// CommandHistoryStore
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  readonly command: string;
  readonly atMs: number;
  readonly partition: string;
}

export interface CommandHistoryStoreOptions {
  readonly maxPerPartition?: number;
}

/**
 * Per-partition command history with dedupe-on-repeat (collapses adjacent
 * identical entries). Supports prefix and substring search.
 */
export class CommandHistoryStore {
  private readonly maxPerPartition: number;
  private readonly partitions = new Map<string, HistoryEntry[]>();

  constructor(opts: CommandHistoryStoreOptions = {}) {
    this.maxPerPartition = Math.max(1, opts.maxPerPartition ?? 1000);
  }

  record(command: string, partition = 'default', atMs = Date.now()): boolean {
    const trimmed = command.trim();
    if (!trimmed) return false;
    const arr = this.partitions.get(partition) ?? [];
    const last = arr.length > 0 ? arr[arr.length - 1] : undefined;
    if (last && last.command === trimmed) return false;
    arr.push({ command: trimmed, atMs, partition });
    while (arr.length > this.maxPerPartition) arr.shift();
    this.partitions.set(partition, arr);
    return true;
  }

  list(partition = 'default'): HistoryEntry[] {
    return [...(this.partitions.get(partition) ?? [])];
  }

  searchPrefix(prefix: string, partition = 'default', limit = 25): HistoryEntry[] {
    const arr = this.partitions.get(partition) ?? [];
    if (!prefix) return [];
    const out: HistoryEntry[] = [];
    for (let i = arr.length - 1; i >= 0 && out.length < limit; i--) {
      const e = arr[i]!;
      if (e.command.startsWith(prefix)) out.push(e);
    }
    return out;
  }

  searchSubstring(needle: string, partition = 'default', limit = 25): HistoryEntry[] {
    const arr = this.partitions.get(partition) ?? [];
    if (!needle) return [];
    const out: HistoryEntry[] = [];
    const n = needle.toLowerCase();
    for (let i = arr.length - 1; i >= 0 && out.length < limit; i--) {
      const e = arr[i]!;
      if (e.command.toLowerCase().includes(n)) out.push(e);
    }
    return out;
  }

  clear(partition = 'default'): void { this.partitions.delete(partition); }
  partitionCount(): number { return this.partitions.size; }
}

// ---------------------------------------------------------------------------
// NexusViewportCuller
// ---------------------------------------------------------------------------

export interface GraphNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly weight?: number;
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

export interface CullViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Render scale (1 = 100%). Smaller = zoomed out. */
  readonly zoom: number;
}

export interface CullResult {
  readonly visibleNodes: GraphNode[];
  readonly visibleEdges: GraphEdge[];
  readonly tier: 'detail' | 'normal' | 'lowDetail' | 'overview';
  readonly culledNodes: number;
  readonly culledEdges: number;
}

/**
 * Pure level-of-detail + viewport culler for graph rendering.
 * - Picks a quality tier from zoom.
 * - Returns nodes whose center is inside the (padded) viewport.
 * - Returns edges only when both endpoints are visible AND tier is detail/normal.
 */
export function cullGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  viewport: CullViewport,
  padding = 64,
): CullResult {
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('cullGraph: viewport must have positive dimensions');
  }
  const z = viewport.zoom;
  const tier: CullResult['tier'] =
    z >= 1.0 ? 'detail' : z >= 0.6 ? 'normal' : z >= 0.3 ? 'lowDetail' : 'overview';

  const minX = viewport.x - padding;
  const maxX = viewport.x + viewport.width + padding;
  const minY = viewport.y - padding;
  const maxY = viewport.y + viewport.height + padding;

  const visibleSet = new Set<string>();
  const visibleNodes: GraphNode[] = [];
  for (const n of nodes) {
    if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
      visibleNodes.push(n);
      visibleSet.add(n.id);
    }
  }

  let visibleEdges: GraphEdge[] = [];
  if (tier === 'detail' || tier === 'normal') {
    for (const e of edges) {
      if (visibleSet.has(e.from) && visibleSet.has(e.to)) visibleEdges.push(e);
    }
  }

  return {
    visibleNodes,
    visibleEdges,
    tier,
    culledNodes: nodes.length - visibleNodes.length,
    culledEdges: edges.length - visibleEdges.length,
  };
}

// ---------------------------------------------------------------------------
// MonitoringSampler
// ---------------------------------------------------------------------------

export interface MonitoringSample {
  readonly tMs: number;
  readonly value: number;
}

export interface MonitoringSamplerOptions {
  readonly capacity?: number;
  /** Hysteresis fraction (0..1) for axis growth/shrink decisions. */
  readonly hysteresis?: number;
}

/**
 * Ring buffer of recent samples plus a stable axis range computed with
 * hysteresis so the y-axis does not jitter on small fluctuations.
 */
export class MonitoringSampler {
  private readonly capacity: number;
  private readonly hysteresis: number;
  private samples: MonitoringSample[] = [];
  private currentMax = 1;

  constructor(opts: MonitoringSamplerOptions = {}) {
    this.capacity = Math.max(2, opts.capacity ?? 240);
    const h = opts.hysteresis ?? 0.2;
    if (h < 0 || h >= 1) throw new Error('MonitoringSampler: hysteresis must be in [0, 1)');
    this.hysteresis = h;
  }

  add(value: number, tMs = Date.now()): void {
    if (!Number.isFinite(value)) throw new Error('MonitoringSampler: value must be finite');
    this.samples.push({ tMs, value });
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  size(): number { return this.samples.length; }
  recent(n: number): MonitoringSample[] {
    if (n <= 0) return [];
    return this.samples.slice(Math.max(0, this.samples.length - n));
  }

  /** Stable max suitable for an axis upper bound. Grows immediately, shrinks lazily. */
  axisMax(): number {
    if (this.samples.length === 0) return this.currentMax;
    let observed = 0;
    for (const s of this.samples) if (s.value > observed) observed = s.value;
    if (observed > this.currentMax) {
      this.currentMax = observed;
    } else if (observed < this.currentMax * (1 - this.hysteresis)) {
      this.currentMax = Math.max(1, observed);
    }
    return this.currentMax;
  }
}

// ---------------------------------------------------------------------------
// AutosaveCoordinator
// ---------------------------------------------------------------------------

export interface AutosaveCoordinatorOptions {
  /** Minimum gap between save flushes, in milliseconds. */
  readonly minIntervalMs: number;
  /** Optional now() injection for tests. */
  readonly now?: () => number;
}

export interface AutosaveResult<T> {
  readonly flushed: boolean;
  readonly state?: T;
  readonly atMs?: number;
}

/**
 * Coalesces rapid-fire save requests into at-most-one flush per interval.
 * The latest pending state always wins. Caller drives the flush via tick().
 */
export class AutosaveCoordinator<T> {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private pending: { state: T } | null = null;
  private lastFlushMs = 0;
  private hasFlushed = false;

  constructor(opts: AutosaveCoordinatorOptions) {
    if (opts.minIntervalMs <= 0) throw new Error('AutosaveCoordinator: minIntervalMs must be > 0');
    this.minIntervalMs = opts.minIntervalMs;
    this.now = opts.now ?? Date.now;
  }

  request(state: T): void { this.pending = { state }; }
  hasPending(): boolean { return this.pending !== null; }

  /** Returns whether a flush should occur and the state to persist. */
  tick(): AutosaveResult<T> {
    if (!this.pending) return { flushed: false };
    const t = this.now();
    if (this.hasFlushed && t - this.lastFlushMs < this.minIntervalMs) {
      return { flushed: false };
    }
    const out: AutosaveResult<T> = { flushed: true, state: this.pending.state, atMs: t };
    this.pending = null;
    this.lastFlushMs = t;
    this.hasFlushed = true;
    return out;
  }

  /** Force a flush regardless of interval (e.g. on app close). */
  forceFlush(): AutosaveResult<T> {
    if (!this.pending) return { flushed: false };
    const t = this.now();
    const out: AutosaveResult<T> = { flushed: true, state: this.pending.state, atMs: t };
    this.pending = null;
    this.lastFlushMs = t;
    this.hasFlushed = true;
    return out;
  }
}

// ---------------------------------------------------------------------------
// ResumableExportPipeline
// ---------------------------------------------------------------------------

export interface ExportStage<TCtx> {
  readonly id: string;
  readonly run: (ctx: TCtx) => void | Promise<void>;
}

export interface ExportRunResult {
  readonly completed: boolean;
  readonly completedStages: readonly string[];
  readonly failedStage?: string;
  readonly error?: Error;
}

/**
 * Runs export stages sequentially. On failure, records the failed stage so
 * a subsequent run() resumes from there instead of restarting the pipeline.
 */
export class ResumableExportPipeline<TCtx> {
  private readonly stages: readonly ExportStage<TCtx>[];
  private completed = new Set<string>();

  constructor(stages: readonly ExportStage<TCtx>[]) {
    if (stages.length === 0) throw new Error('ResumableExportPipeline: at least one stage required');
    const seen = new Set<string>();
    for (const s of stages) {
      if (!s.id) throw new Error('ResumableExportPipeline: stage id must be non-empty');
      if (seen.has(s.id)) throw new Error(`ResumableExportPipeline: duplicate stage id "${s.id}"`);
      seen.add(s.id);
    }
    this.stages = stages;
  }

  isComplete(stageId: string): boolean { return this.completed.has(stageId); }
  reset(): void { this.completed.clear(); }
  remaining(): string[] { return this.stages.filter((s) => !this.completed.has(s.id)).map((s) => s.id); }

  async run(ctx: TCtx): Promise<ExportRunResult> {
    const ran: string[] = [];
    for (const s of this.stages) {
      if (this.completed.has(s.id)) continue;
      try {
        await s.run(ctx);
        this.completed.add(s.id);
        ran.push(s.id);
      } catch (err) {
        return {
          completed: false,
          completedStages: ran,
          failedStage: s.id,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
    return { completed: true, completedStages: ran };
  }
}

// ---------------------------------------------------------------------------
// SnapPresetEngine
// ---------------------------------------------------------------------------

export type SnapZone =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'maximize'
  | 'centerThird';

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

/** Compute the target rect for a snap zone within a display. */
export function snapZoneRect(zone: SnapZone, display: Rect): Rect {
  if (display.width <= 0 || display.height <= 0) {
    throw new Error('snapZoneRect: display must have positive dimensions');
  }
  const halfW = Math.floor(display.width / 2);
  const halfH = Math.floor(display.height / 2);
  switch (zone) {
    case 'maximize': return display;
    case 'left':     return { x: display.x, y: display.y, width: halfW, height: display.height };
    case 'right':    return { x: display.x + halfW, y: display.y, width: display.width - halfW, height: display.height };
    case 'top':      return { x: display.x, y: display.y, width: display.width, height: halfH };
    case 'bottom':   return { x: display.x, y: display.y + halfH, width: display.width, height: display.height - halfH };
    case 'topLeft':     return { x: display.x, y: display.y, width: halfW, height: halfH };
    case 'topRight':    return { x: display.x + halfW, y: display.y, width: display.width - halfW, height: halfH };
    case 'bottomLeft':  return { x: display.x, y: display.y + halfH, width: halfW, height: display.height - halfH };
    case 'bottomRight': return { x: display.x + halfW, y: display.y + halfH, width: display.width - halfW, height: display.height - halfH };
    case 'centerThird': {
      const w = Math.floor(display.width / 3);
      const h = Math.floor(display.height / 3);
      return { x: display.x + w, y: display.y + h, width: display.width - 2 * w, height: display.height - 2 * h };
    }
  }
}

/** Detect the closest snap zone given pointer position relative to a display. */
export function detectSnapZone(
  pointerX: number,
  pointerY: number,
  display: Rect,
  edgeThreshold = 16,
): SnapZone | null {
  const inLeft = pointerX <= display.x + edgeThreshold;
  const inRight = pointerX >= display.x + display.width - edgeThreshold;
  const inTop = pointerY <= display.y + edgeThreshold;
  const inBottom = pointerY >= display.y + display.height - edgeThreshold;
  if (inTop && inLeft) return 'topLeft';
  if (inTop && inRight) return 'topRight';
  if (inBottom && inLeft) return 'bottomLeft';
  if (inBottom && inRight) return 'bottomRight';
  if (inTop) return 'maximize';
  if (inLeft) return 'left';
  if (inRight) return 'right';
  if (inBottom) return 'bottom';
  return null;
}

// ---------------------------------------------------------------------------
// MultiMonitorMemory
// ---------------------------------------------------------------------------

export interface PlacementRecord { readonly displayId: string; readonly rect: Rect; }

/**
 * Remembers per-window placement keyed by displayId, so when a window
 * returns to a previously seen display its last position is restored.
 */
export class MultiMonitorMemory {
  private readonly map = new Map<string, Map<string, Rect>>();

  remember(windowId: string, displayId: string, rect: Rect): void {
    if (!windowId) throw new Error('MultiMonitorMemory: windowId required');
    if (!displayId) throw new Error('MultiMonitorMemory: displayId required');
    let perWindow = this.map.get(windowId);
    if (!perWindow) { perWindow = new Map(); this.map.set(windowId, perWindow); }
    perWindow.set(displayId, rect);
  }

  recall(windowId: string, displayId: string): Rect | null {
    return this.map.get(windowId)?.get(displayId) ?? null;
  }

  forget(windowId: string): void { this.map.delete(windowId); }
  knownDisplays(windowId: string): string[] { return [...(this.map.get(windowId)?.keys() ?? [])]; }
  windowCount(): number { return this.map.size; }
}

// ---------------------------------------------------------------------------
// AppLauncherIndex
// ---------------------------------------------------------------------------

export interface LauncherItem {
  readonly id: string;
  readonly name: string;
  readonly keywords?: readonly string[];
  /** Recency or boost score from caller. Higher wins ties. */
  readonly boost?: number;
}

export interface LauncherMatch { readonly item: LauncherItem; readonly score: number; }

/**
 * Lightweight launcher index. Scoring favors:
 *  - Exact name match (highest)
 *  - Name prefix
 *  - Token-prefix on any name word
 *  - Substring in name or keywords
 * Ties broken by boost desc, then id asc for stability.
 */
export class AppLauncherIndex {
  private readonly items: LauncherItem[] = [];

  add(item: LauncherItem): void {
    if (!item.id) throw new Error('AppLauncherIndex: id required');
    if (!item.name) throw new Error('AppLauncherIndex: name required');
    if (this.items.some((i) => i.id === item.id)) {
      throw new Error(`AppLauncherIndex: duplicate id "${item.id}"`);
    }
    this.items.push(item);
  }

  remove(id: string): boolean {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  size(): number { return this.items.length; }

  search(query: string, limit = 10): LauncherMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches: LauncherMatch[] = [];
    for (const item of this.items) {
      const score = this.score(item, q);
      if (score > 0) matches.push({ item, score });
    }
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ba = a.item.boost ?? 0;
      const bb = b.item.boost ?? 0;
      if (bb !== ba) return bb - ba;
      return a.item.id.localeCompare(b.item.id);
    });
    return matches.slice(0, Math.max(0, limit));
  }

  private score(item: LauncherItem, q: string): number {
    const name = item.name.toLowerCase();
    if (name === q) return 1000;
    if (name.startsWith(q)) return 700;
    const words = name.split(/\s+/);
    if (words.some((w) => w.startsWith(q))) return 500;
    if (name.includes(q)) return 300;
    if (item.keywords) {
      for (const k of item.keywords) {
        if (k.toLowerCase().includes(q)) return 150;
      }
    }
    return 0;
  }
}
