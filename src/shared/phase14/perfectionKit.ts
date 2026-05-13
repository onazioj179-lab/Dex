// =============================================================================
// DEX Platform - Phase 14 Perfection Kit
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 14 - additive primitives for the final perfection pass.
 * Pure, dependency-free. Designed to be wired into DEX subsystems incrementally.
 *
 * Modules:
 *   VectorMemoryStore      - local-first vector memory with cosine similarity.
 *   WorkflowPredictor      - next-action prediction from observed transitions.
 *   NotificationStack      - bounded, priority-ordered notification queue.
 *   DockLayout             - calm dock placement + reflow with stable order.
 *   BlurQualityTiers       - adaptive blur radius/quality from system pressure.
 *   DragSession            - drag/drop session with cancel + invariants.
 *   HoverIntent            - menu hover-intent (open delay, close grace).
 *   PluginOverloadGuard    - throttles misbehaving plugins by error budget.
 *   AutosaveCoordinator    - per-document debounced save with coalescing.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */

// ----- VectorMemoryStore -------------------------------------------------------

export interface VectorRecord {
  readonly id: string;
  readonly vector: ReadonlyArray<number>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly storedAt: number;
}

export interface VectorQueryResult {
  readonly id: string;
  readonly score: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function dot(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(a: ReadonlyArray<number>): number {
  return Math.sqrt(dot(a, a));
}

export function cosine(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) throw new Error('cosine: dimension mismatch');
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

export class VectorMemoryStore {
  private readonly records = new Map<string, VectorRecord>();
  private readonly dim: number;
  private readonly maxEntries: number;

  constructor(opts: { dimension: number; maxEntries?: number }) {
    if (!Number.isInteger(opts.dimension) || opts.dimension <= 0) {
      throw new Error('VectorMemoryStore: dimension must be positive integer');
    }
    this.dim = opts.dimension;
    this.maxEntries = Math.max(1, opts.maxEntries ?? 10_000);
  }

  add(rec: VectorRecord): void {
    if (!rec.id) throw new Error('VectorMemoryStore.add: id required');
    if (rec.vector.length !== this.dim) {
      throw new Error(`VectorMemoryStore.add: vector dim must be ${this.dim}`);
    }
    if (this.records.has(rec.id)) throw new Error(`VectorMemoryStore.add: duplicate id ${rec.id}`);
    if (this.records.size >= this.maxEntries) this.evictOldest();
    this.records.set(rec.id, rec);
  }

  remove(id: string): boolean {
    return this.records.delete(id);
  }

  size(): number {
    return this.records.size;
  }

  query(vector: ReadonlyArray<number>, topK = 10, minScore = 0): VectorQueryResult[] {
    if (vector.length !== this.dim) throw new Error('VectorMemoryStore.query: dim mismatch');
    if (!Number.isInteger(topK) || topK <= 0) throw new Error('VectorMemoryStore.query: topK must be positive');
    const out: VectorQueryResult[] = [];
    for (const r of this.records.values()) {
      const score = cosine(vector, r.vector);
      if (score >= minScore) out.push({ id: r.id, score, metadata: r.metadata });
    }
    out.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
    return out.slice(0, topK);
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, r] of this.records) {
      if (r.storedAt < oldestAt) {
        oldestAt = r.storedAt;
        oldestId = id;
      }
    }
    if (oldestId !== null) this.records.delete(oldestId);
  }
}

// ----- WorkflowPredictor -------------------------------------------------------

export class WorkflowPredictor {
  private readonly transitions = new Map<string, Map<string, number>>();
  private readonly halfLifeMs: number;
  private readonly counts = new Map<string, number>();

  constructor(opts: { halfLifeMs?: number } = {}) {
    this.halfLifeMs = Math.max(1, opts.halfLifeMs ?? 60 * 60 * 1000);
  }

  observe(prev: string, next: string, _at = Date.now()): void {
    if (!prev || !next) throw new Error('WorkflowPredictor.observe: ids required');
    let m = this.transitions.get(prev);
    if (!m) {
      m = new Map();
      this.transitions.set(prev, m);
    }
    m.set(next, (m.get(next) ?? 0) + 1);
    this.counts.set(prev, (this.counts.get(prev) ?? 0) + 1);
  }

  predict(prev: string, topK = 3): Array<{ next: string; probability: number }> {
    if (!Number.isInteger(topK) || topK <= 0) throw new Error('WorkflowPredictor.predict: topK > 0');
    const m = this.transitions.get(prev);
    if (!m) return [];
    const total = this.counts.get(prev) ?? 0;
    if (total === 0) return [];
    const out = Array.from(m.entries()).map(([next, c]) => ({ next, probability: c / total }));
    out.sort((a, b) => (b.probability - a.probability) || a.next.localeCompare(b.next));
    return out.slice(0, topK);
  }

  reset(): void {
    this.transitions.clear();
    this.counts.clear();
  }
}

// ----- NotificationStack -------------------------------------------------------

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  urgent: 3, high: 2, normal: 1, low: 0,
};

export interface Notification {
  readonly id: string;
  readonly priority: NotificationPriority;
  readonly createdAt: number;
  readonly title: string;
  readonly body?: string;
  readonly ttlMs?: number;
}

export class NotificationStack {
  private readonly items = new Map<string, Notification>();
  private readonly maxVisible: number;

  constructor(opts: { maxVisible?: number } = {}) {
    this.maxVisible = Math.max(1, opts.maxVisible ?? 5);
  }

  push(n: Notification): void {
    if (!n.id) throw new Error('NotificationStack.push: id required');
    if (!n.title) throw new Error('NotificationStack.push: title required');
    this.items.set(n.id, n);
  }

  dismiss(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  visible(now: number): Notification[] {
    const alive: Notification[] = [];
    for (const n of this.items.values()) {
      if (n.ttlMs === undefined || n.createdAt + n.ttlMs > now) alive.push(n);
    }
    alive.sort((a, b) => {
      const r = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (r !== 0) return r;
      return b.createdAt - a.createdAt;
    });
    return alive.slice(0, this.maxVisible);
  }

  count(): number {
    return this.items.size;
  }

  pruneExpired(now: number): number {
    let removed = 0;
    for (const [id, n] of this.items) {
      if (n.ttlMs !== undefined && n.createdAt + n.ttlMs <= now) {
        this.items.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

// ----- DockLayout --------------------------------------------------------------

export interface DockItem {
  readonly id: string;
  readonly pinned?: boolean;
  readonly running?: boolean;
}

export interface DockSlot {
  readonly id: string;
  readonly x: number;
  readonly width: number;
}

export function layoutDock(
  items: ReadonlyArray<DockItem>,
  opts: { iconSize: number; gap: number; viewportWidth: number },
): DockSlot[] {
  if (opts.iconSize <= 0) throw new Error('layoutDock: iconSize > 0');
  if (opts.gap < 0) throw new Error('layoutDock: gap >= 0');
  if (opts.viewportWidth <= 0) throw new Error('layoutDock: viewportWidth > 0');
  // Pinned first, then running-only, in stable order.
  const pinned = items.filter((i) => i.pinned);
  const runningOnly = items.filter((i) => !i.pinned && i.running);
  const ordered = [...pinned, ...runningOnly];
  if (ordered.length === 0) return [];
  const totalWidth = ordered.length * opts.iconSize + Math.max(0, ordered.length - 1) * opts.gap;
  const startX = Math.max(opts.gap, Math.floor((opts.viewportWidth - totalWidth) / 2));
  const slots: DockSlot[] = [];
  let x = startX;
  for (const item of ordered) {
    slots.push({ id: item.id, x, width: opts.iconSize });
    x += opts.iconSize + opts.gap;
  }
  return slots;
}

// ----- BlurQualityTiers --------------------------------------------------------

export type BlurTier = 'off' | 'eco' | 'standard' | 'high';

export interface BlurInput {
  readonly gpuPressure: 'low' | 'medium' | 'high' | 'critical';
  readonly batterySaver?: boolean;
  readonly thermalThrottling?: boolean;
  readonly userPreference?: BlurTier;
}

export function selectBlurTier(input: BlurInput): { tier: BlurTier; radiusPx: number } {
  if (input.userPreference === 'off') return { tier: 'off', radiusPx: 0 };
  if (input.batterySaver || input.thermalThrottling) return { tier: 'eco', radiusPx: 6 };
  if (input.gpuPressure === 'critical') return { tier: 'off', radiusPx: 0 };
  if (input.gpuPressure === 'high') return { tier: 'eco', radiusPx: 6 };
  if (input.gpuPressure === 'medium') return { tier: 'standard', radiusPx: 12 };
  return { tier: input.userPreference === 'eco' ? 'eco' : 'high', radiusPx: input.userPreference === 'eco' ? 6 : 24 };
}

// ----- DragSession -------------------------------------------------------------

export interface DragPayload {
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export class DragSession {
  private active: { id: string; payload: DragPayload; startedAt: number } | null = null;

  start(id: string, payload: DragPayload, at = Date.now()): void {
    if (this.active) throw new Error('DragSession.start: session already active');
    if (!id) throw new Error('DragSession.start: id required');
    if (!payload.kind) throw new Error('DragSession.start: payload.kind required');
    this.active = { id, payload, startedAt: at };
  }

  current(): { id: string; payload: DragPayload; startedAt: number } | null {
    return this.active;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  drop(targetId: string): { id: string; targetId: string; payload: DragPayload } | null {
    if (!this.active) return null;
    const r = { id: this.active.id, targetId, payload: this.active.payload };
    this.active = null;
    return r;
  }

  cancel(): boolean {
    if (!this.active) return false;
    this.active = null;
    return true;
  }
}

// ----- HoverIntent -------------------------------------------------------------

export interface HoverIntentOptions {
  readonly openDelayMs: number;
  readonly closeGraceMs: number;
}

export class HoverIntent {
  private state: 'closed' | 'pending-open' | 'open' | 'pending-close' = 'closed';
  private lastChangeAt = 0;

  constructor(private readonly opts: HoverIntentOptions) {
    if (opts.openDelayMs < 0 || opts.closeGraceMs < 0) {
      throw new Error('HoverIntent: delays must be >= 0');
    }
  }

  enter(at: number): void {
    if (this.state === 'open' || this.state === 'pending-open') return;
    this.state = 'pending-open';
    this.lastChangeAt = at;
  }

  leave(at: number): void {
    if (this.state === 'closed' || this.state === 'pending-close') return;
    this.state = 'pending-close';
    this.lastChangeAt = at;
  }

  tick(at: number): 'closed' | 'open' {
    if (this.state === 'pending-open' && at - this.lastChangeAt >= this.opts.openDelayMs) {
      this.state = 'open';
    } else if (this.state === 'pending-close' && at - this.lastChangeAt >= this.opts.closeGraceMs) {
      this.state = 'closed';
    }
    return this.state === 'open' || this.state === 'pending-close' ? 'open' : 'closed';
  }

  reset(): void {
    this.state = 'closed';
    this.lastChangeAt = 0;
  }
}

// ----- PluginOverloadGuard -----------------------------------------------------

export interface PluginGuardConfig {
  readonly maxErrorsPerWindow: number;
  readonly windowMs: number;
  readonly cooldownMs: number;
}

interface GuardEntry {
  errorTimestamps: number[];
  cooldownUntil: number;
}

export class PluginOverloadGuard {
  private readonly entries = new Map<string, GuardEntry>();
  constructor(private readonly cfg: PluginGuardConfig) {
    if (cfg.maxErrorsPerWindow <= 0 || cfg.windowMs <= 0 || cfg.cooldownMs <= 0) {
      throw new Error('PluginOverloadGuard: positive numbers required');
    }
  }

  reportError(pluginId: string, at: number): { throttled: boolean; cooldownUntil: number } {
    const e = this.getOrCreate(pluginId);
    e.errorTimestamps.push(at);
    const cutoff = at - this.cfg.windowMs;
    e.errorTimestamps = e.errorTimestamps.filter((t) => t >= cutoff);
    if (e.errorTimestamps.length >= this.cfg.maxErrorsPerWindow) {
      e.cooldownUntil = at + this.cfg.cooldownMs;
      e.errorTimestamps.length = 0;
      return { throttled: true, cooldownUntil: e.cooldownUntil };
    }
    return { throttled: false, cooldownUntil: e.cooldownUntil };
  }

  isThrottled(pluginId: string, at: number): boolean {
    const e = this.entries.get(pluginId);
    if (!e) return false;
    return at < e.cooldownUntil;
  }

  reset(pluginId: string): void {
    this.entries.delete(pluginId);
  }

  private getOrCreate(id: string): GuardEntry {
    let e = this.entries.get(id);
    if (!e) {
      e = { errorTimestamps: [], cooldownUntil: 0 };
      this.entries.set(id, e);
    }
    return e;
  }
}

// ----- AutosaveCoordinator -----------------------------------------------------

export interface AutosaveOptions {
  readonly debounceMs: number;
  readonly maxDelayMs: number;
}

interface DocState {
  pendingAt: number;
  firstPendingAt: number;
  lastSavedAt: number;
  dirty: boolean;
}

export class AutosaveCoordinator {
  private readonly docs = new Map<string, DocState>();

  constructor(private readonly opts: AutosaveOptions) {
    if (opts.debounceMs <= 0 || opts.maxDelayMs <= 0) {
      throw new Error('AutosaveCoordinator: positive numbers required');
    }
    if (opts.maxDelayMs < opts.debounceMs) {
      throw new Error('AutosaveCoordinator: maxDelayMs must be >= debounceMs');
    }
  }

  markDirty(docId: string, at: number): void {
    if (!docId) throw new Error('AutosaveCoordinator.markDirty: docId required');
    let d = this.docs.get(docId);
    if (!d) {
      d = { pendingAt: at, firstPendingAt: at, lastSavedAt: 0, dirty: true };
      this.docs.set(docId, d);
      return;
    }
    d.pendingAt = at;
    if (!d.dirty) d.firstPendingAt = at;
    d.dirty = true;
  }

  shouldSave(docId: string, now: number): boolean {
    const d = this.docs.get(docId);
    if (!d || !d.dirty) return false;
    const sinceLastEdit = now - d.pendingAt;
    const sinceFirstPending = now - d.firstPendingAt;
    return sinceLastEdit >= this.opts.debounceMs || sinceFirstPending >= this.opts.maxDelayMs;
  }

  markSaved(docId: string, at: number): void {
    const d = this.docs.get(docId);
    if (!d) return;
    d.dirty = false;
    d.lastSavedAt = at;
  }

  isDirty(docId: string): boolean {
    return this.docs.get(docId)?.dirty ?? false;
  }

  pendingDocs(now: number): string[] {
    const out: string[] = [];
    for (const [id] of this.docs) {
      if (this.shouldSave(id, now)) out.push(id);
    }
    out.sort();
    return out;
  }
}
