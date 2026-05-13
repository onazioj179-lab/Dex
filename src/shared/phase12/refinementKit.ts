// =============================================================================
// DEX Platform - Phase 12 RefinementKit
// Final refinement pass primitives: scroll-follow, overlay stack, ring buffer,
// focus owner, viewport clamp, resize predictor, workspace restorer,
// adaptive quality, soak monitor, adaptive input debouncer.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. ScrollFollowController
//    Smart auto-scroll for terminals, logs, chat. User scroll-up pauses
//    follow; scroll back to bottom (within threshold) resumes follow.
// ---------------------------------------------------------------------------
export interface ScrollFollowOptions {
  /** Pixels from bottom that still count as "at bottom" (default 24). */
  bottomThresholdPx?: number;
}

export class ScrollFollowController {
  private following = true;
  private readonly threshold: number;

  constructor(opts: ScrollFollowOptions = {}) {
    this.threshold = Math.max(0, opts.bottomThresholdPx ?? 24);
  }

  /** Call when user scrolls. */
  onUserScroll(scrollTop: number, scrollHeight: number, clientHeight: number): void {
    const distance = Math.max(0, scrollHeight - scrollTop - clientHeight);
    this.following = distance <= this.threshold;
  }

  /** Returns the scrollTop to apply if currently following, else null. */
  applyIfFollowing(scrollHeight: number): number | null {
    return this.following ? scrollHeight : null;
  }

  /** Force follow on (e.g. user clicked "scroll to bottom"). */
  resume(): void { this.following = true; }

  /** Force follow off. */
  pause(): void { this.following = false; }

  isFollowing(): boolean { return this.following; }
}

// ---------------------------------------------------------------------------
// 2. OverlayStack
//    Single source of truth for z-order, focus owner, escape dismissal.
// ---------------------------------------------------------------------------
export type OverlayKind = 'menu' | 'dropdown' | 'modal' | 'toast' | 'tooltip' | 'popover';

export interface OverlayEntry {
  id: string;
  kind: OverlayKind;
  /** Higher z-bias floats above same-kind entries. */
  zBias?: number;
  /** Receives Escape press; return true if handled. */
  onEscape?: () => boolean;
  /** Called when forcibly dismissed by stack (e.g. parent unmount). */
  onDismiss?: () => void;
}

const OVERLAY_BASE_Z: Record<OverlayKind, number> = {
  tooltip: 1000,
  popover: 1100,
  dropdown: 1200,
  menu: 1300,
  modal: 1500,
  toast: 1800,
};

export class OverlayStack {
  private entries: OverlayEntry[] = [];
  private listeners = new Set<(snapshot: ReadonlyArray<OverlayEntry>) => void>();

  push(entry: OverlayEntry): void {
    if (!entry.id) throw new Error('OverlayStack.push: id required');
    if (this.entries.some((e) => e.id === entry.id)) {
      throw new Error(`OverlayStack.push: duplicate id ${entry.id}`);
    }
    this.entries.push(entry);
    this.emit();
  }

  pop(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const [removed] = this.entries.splice(idx, 1);
    try { removed?.onDismiss?.(); } catch { /* isolate */ }
    this.emit();
    return true;
  }

  /** Z-index for an entry, computed from kind base + insertion order + bias. */
  zIndexOf(id: string): number | null {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const e = this.entries[idx]!;
    return OVERLAY_BASE_Z[e.kind] + idx + (e.zBias ?? 0);
  }

  /** Topmost entry, or null. */
  top(): OverlayEntry | null {
    return this.entries.length === 0 ? null : this.entries[this.entries.length - 1]!;
  }

  /**
   * Handle Escape: only the topmost entry gets a chance.
   * If its onEscape returns true, the entry handled it (no pop).
   * Otherwise the topmost entry is popped.
   */
  handleEscape(): boolean {
    const top = this.top();
    if (!top) return false;
    try {
      if (top.onEscape && top.onEscape() === true) return true;
    } catch { /* isolate */ }
    this.pop(top.id);
    return true;
  }

  size(): number { return this.entries.length; }
  list(): ReadonlyArray<OverlayEntry> { return this.entries.slice(); }

  subscribe(fn: (snapshot: ReadonlyArray<OverlayEntry>) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    const snap = this.entries.slice();
    for (const fn of this.listeners) {
      try { fn(snap); } catch { /* isolate */ }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. OutputRingBuffer
//    Bounded line buffer for large terminal/log output. O(1) append,
//    O(1) snapshot of last N lines.
// ---------------------------------------------------------------------------
export class OutputRingBuffer {
  private readonly cap: number;
  private buf: string[];
  private head = 0;
  private len = 0;

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('OutputRingBuffer: capacity must be > 0');
    }
    this.cap = Math.floor(capacity);
    this.buf = new Array(this.cap);
  }

  push(line: string): void {
    const idx = (this.head + this.len) % this.cap;
    this.buf[idx] = line;
    if (this.len < this.cap) this.len++;
    else this.head = (this.head + 1) % this.cap;
  }

  pushMany(lines: ReadonlyArray<string>): void {
    for (const l of lines) this.push(l);
  }

  /** All lines in insertion order. */
  toArray(): string[] {
    const out: string[] = new Array(this.len);
    for (let i = 0; i < this.len; i++) {
      out[i] = this.buf[(this.head + i) % this.cap]!;
    }
    return out;
  }

  /** Last N lines (clamped). */
  tail(n: number): string[] {
    const k = Math.max(0, Math.min(n, this.len));
    const out: string[] = new Array(k);
    const start = this.len - k;
    for (let i = 0; i < k; i++) {
      out[i] = this.buf[(this.head + start + i) % this.cap]!;
    }
    return out;
  }

  size(): number { return this.len; }
  capacity(): number { return this.cap; }
  clear(): void { this.head = 0; this.len = 0; }
}

// ---------------------------------------------------------------------------
// 4. FocusOwner
//    Single focus owner across compositor; transitions are atomic.
// ---------------------------------------------------------------------------
export interface FocusChangeEvent {
  previous: string | null;
  current: string | null;
  at: number;
}

export class FocusOwner {
  private owner: string | null = null;
  private listeners = new Set<(e: FocusChangeEvent) => void>();

  current(): string | null { return this.owner; }

  /** Returns true if focus actually moved. */
  set(id: string | null, now = Date.now()): boolean {
    if (id === this.owner) return false;
    const prev = this.owner;
    this.owner = id;
    const evt: FocusChangeEvent = { previous: prev, current: id, at: now };
    for (const fn of this.listeners) {
      try { fn(evt); } catch { /* isolate */ }
    }
    return true;
  }

  /** Clear focus only if id currently owns it. */
  release(id: string, now = Date.now()): boolean {
    if (this.owner !== id) return false;
    return this.set(null, now);
  }

  subscribe(fn: (e: FocusChangeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

// ---------------------------------------------------------------------------
// 5. Viewport clamp + resize predictor
//    Keep windows visible across monitor changes; predict snap target.
// ---------------------------------------------------------------------------
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Viewport { x: number; y: number; width: number; height: number; }

/**
 * Clamp a rect so a minimum amount stays inside the viewport.
 * minVisiblePx ensures the title bar / handle never goes fully off-screen.
 */
export function clampToViewport(rect: Rect, vp: Viewport, minVisiblePx = 32): Rect {
  const w = Math.max(1, Math.min(rect.width, vp.width));
  const h = Math.max(1, Math.min(rect.height, vp.height));
  const minX = vp.x + minVisiblePx - w;
  const maxX = vp.x + vp.width - minVisiblePx;
  const minY = vp.y;
  const maxY = vp.y + vp.height - minVisiblePx;
  const x = Math.max(minX, Math.min(rect.x, maxX));
  const y = Math.max(minY, Math.min(rect.y, maxY));
  return { x, y, width: w, height: h };
}

export type SnapTarget = 'left' | 'right' | 'top' | 'bottom' | 'maximize' | null;

/**
 * Predict snap target from pointer position relative to viewport edges.
 * Edge zone width defaults to 4% of viewport width.
 */
export function predictSnapTarget(
  pointer: { x: number; y: number },
  vp: Viewport,
  edgePxOverride?: number,
): SnapTarget {
  const edge = edgePxOverride ?? Math.max(8, Math.floor(vp.width * 0.04));
  const nearTop = pointer.y - vp.y <= edge;
  const nearLeft = pointer.x - vp.x <= edge;
  const nearRight = vp.x + vp.width - pointer.x <= edge;
  const nearBottom = vp.y + vp.height - pointer.y <= edge;
  if (nearTop) return 'maximize';
  if (nearLeft && !nearRight) return 'left';
  if (nearRight && !nearLeft) return 'right';
  if (nearBottom) return 'bottom';
  return null;
}

// ---------------------------------------------------------------------------
// 6. WorkspaceRestorer
//    Restore window topology safely. Stale entries (process gone) are
//    quarantined rather than crashing the restore.
// ---------------------------------------------------------------------------
export interface PersistedWindow {
  id: string;
  appId: string;
  rect: Rect;
  workspaceId: string;
  z: number;
}

export interface RestoreInput {
  windows: ReadonlyArray<PersistedWindow>;
  /** Returns true if appId is currently launchable. */
  appAvailable: (appId: string) => boolean;
  viewport: Viewport;
}

export interface RestoreResult {
  restored: PersistedWindow[];
  quarantined: { window: PersistedWindow; reason: 'app-missing' | 'invalid-rect' }[];
}

export function restoreWorkspace(input: RestoreInput): RestoreResult {
  const restored: PersistedWindow[] = [];
  const quarantined: RestoreResult['quarantined'] = [];
  for (const w of input.windows) {
    if (!input.appAvailable(w.appId)) {
      quarantined.push({ window: w, reason: 'app-missing' });
      continue;
    }
    if (
      !Number.isFinite(w.rect.width) || !Number.isFinite(w.rect.height) ||
      w.rect.width <= 0 || w.rect.height <= 0
    ) {
      quarantined.push({ window: w, reason: 'invalid-rect' });
      continue;
    }
    const clamped = clampToViewport(w.rect, input.viewport);
    restored.push({ ...w, rect: clamped });
  }
  // Stable z-order by original z then id
  restored.sort((a, b) => (a.z - b.z) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { restored, quarantined };
}

// ---------------------------------------------------------------------------
// 7. AdaptiveQualityProfile
//    Hysteresis-based quality tier selection; avoids flicker between tiers.
// ---------------------------------------------------------------------------
export type QualityTier = 'ultra' | 'high' | 'balanced' | 'eco';

export interface QualitySignals {
  frameTimeP95Ms: number;
  gpuPressure: 'low' | 'medium' | 'high' | 'critical';
  batterySaver?: boolean;
  thermalThrottling?: boolean;
}

const TIER_ORDER: QualityTier[] = ['ultra', 'high', 'balanced', 'eco'];

function rawTier(s: QualitySignals): QualityTier {
  if (s.batterySaver || s.thermalThrottling) return 'eco';
  if (s.gpuPressure === 'critical' || s.frameTimeP95Ms >= 33) return 'eco';
  if (s.gpuPressure === 'high' || s.frameTimeP95Ms >= 22) return 'balanced';
  if (s.gpuPressure === 'medium' || s.frameTimeP95Ms >= 14) return 'high';
  return 'ultra';
}

export class AdaptiveQualityProfile {
  private current: QualityTier;
  private stable = 0;
  /** Frames at the candidate tier before switching. */
  private readonly hysteresisFrames: number;

  constructor(initial: QualityTier = 'high', hysteresisFrames = 6) {
    this.current = initial;
    this.hysteresisFrames = Math.max(1, Math.floor(hysteresisFrames));
  }

  get(): QualityTier { return this.current; }

  /** Feed a fresh signal sample; returns the tier in effect after the update. */
  update(s: QualitySignals): QualityTier {
    const candidate = rawTier(s);
    if (candidate === this.current) {
      this.stable = 0;
      return this.current;
    }
    // Drops to lower quality apply immediately (safety); upgrades wait.
    const candIdx = TIER_ORDER.indexOf(candidate);
    const curIdx = TIER_ORDER.indexOf(this.current);
    if (candIdx > curIdx) {
      this.current = candidate;
      this.stable = 0;
      return this.current;
    }
    this.stable++;
    if (this.stable >= this.hysteresisFrames) {
      this.current = candidate;
      this.stable = 0;
    }
    return this.current;
  }
}

// ---------------------------------------------------------------------------
// 8. SoakMonitor
//    Track long-session metrics; flag memory drift, frame-time creep.
// ---------------------------------------------------------------------------
export interface SoakSample {
  at: number;
  memoryMb: number;
  frameTimeMs: number;
}

export interface SoakIssue {
  code: 'memory-drift' | 'frametime-creep';
  detail: string;
}

export interface SoakReport {
  samples: number;
  durationMs: number;
  issues: SoakIssue[];
  healthy: boolean;
}

export class SoakMonitor {
  private readonly maxSamples: number;
  private samples: SoakSample[] = [];

  constructor(maxSamples = 720 /* 1h at 5s cadence */) {
    this.maxSamples = Math.max(2, Math.floor(maxSamples));
  }

  record(sample: SoakSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  size(): number { return this.samples.length; }
  clear(): void { this.samples = []; }

  /**
   * @param memDriftThresholdMb absolute MB rise from first to last sample
   * @param frameCreepThresholdMs ms rise in median frametime between halves
   */
  report(memDriftThresholdMb = 64, frameCreepThresholdMs = 4): SoakReport {
    const issues: SoakIssue[] = [];
    const n = this.samples.length;
    if (n < 2) {
      return { samples: n, durationMs: 0, issues: [], healthy: true };
    }
    const first = this.samples[0]!;
    const last = this.samples[n - 1]!;
    const memRise = last.memoryMb - first.memoryMb;
    if (memRise >= memDriftThresholdMb) {
      issues.push({ code: 'memory-drift', detail: `+${memRise.toFixed(1)}MB over ${n} samples` });
    }
    const half = Math.floor(n / 2);
    const med = (arr: SoakSample[]): number => {
      const xs = arr.map((s) => s.frameTimeMs).sort((a, b) => a - b);
      const m = Math.floor(xs.length / 2);
      return xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2;
    };
    const m1 = med(this.samples.slice(0, half));
    const m2 = med(this.samples.slice(half));
    if (m2 - m1 >= frameCreepThresholdMs) {
      issues.push({ code: 'frametime-creep', detail: `median ${m1.toFixed(1)}ms -> ${m2.toFixed(1)}ms` });
    }
    return {
      samples: n,
      durationMs: last.at - first.at,
      issues,
      healthy: issues.length === 0,
    };
  }
}

// ---------------------------------------------------------------------------
// 9. AdaptiveDebouncer
//    Debounce with adaptive window: fast queries respond faster as user idles.
// ---------------------------------------------------------------------------
export interface DebouncerOptions {
  /** Minimum quiet time before firing (ms). */
  minMs?: number;
  /** Maximum quiet time before forcing a fire (ms). */
  maxMs?: number;
  /** Schedule fn (defaults to setTimeout). */
  schedule?: (cb: () => void, ms: number) => unknown;
  /** Cancel fn (defaults to clearTimeout). */
  cancel?: (handle: unknown) => void;
}

export class AdaptiveDebouncer<T> {
  private handle: unknown = null;
  private firstScheduledAt = 0;
  private lastValue: T | undefined;
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly sched: (cb: () => void, ms: number) => unknown;
  private readonly cancelFn: (handle: unknown) => void;

  constructor(private readonly fire: (value: T) => void, opts: DebouncerOptions = {}) {
    this.minMs = Math.max(0, opts.minMs ?? 80);
    this.maxMs = Math.max(this.minMs, opts.maxMs ?? 240);
    this.sched = opts.schedule ?? ((cb, ms) => setTimeout(cb, ms));
    this.cancelFn = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  push(value: T, now = Date.now()): void {
    this.lastValue = value;
    if (this.handle == null) this.firstScheduledAt = now;
    if (this.handle != null) this.cancelFn(this.handle);
    const elapsed = now - this.firstScheduledAt;
    const remaining = Math.max(this.minMs, Math.min(this.maxMs - elapsed, this.maxMs));
    this.handle = this.sched(() => this.flushInternal(), remaining);
  }

  flush(): void {
    if (this.handle != null) this.cancelFn(this.handle);
    this.flushInternal();
  }

  cancel(): void {
    if (this.handle != null) this.cancelFn(this.handle);
    this.handle = null;
    this.lastValue = undefined;
  }

  private flushInternal(): void {
    this.handle = null;
    if (this.lastValue !== undefined) {
      const v = this.lastValue;
      this.lastValue = undefined;
      try { this.fire(v); } catch { /* isolate */ }
    }
  }
}
