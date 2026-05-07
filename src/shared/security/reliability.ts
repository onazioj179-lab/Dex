// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reliability primitives — wave J.
 *
 * Pure state machines + planners for self-healing surfaces:
 *  - Per-buffer autosave snapshots
 *  - IPC retry with exponential backoff + jitter cap
 *  - Circuit breaker (closed/open/half-open)
 *  - Native module health probe summary
 *  - Disk-full guard
 *  - Crash report queue (local-first, optional upload)
 */

// DEX v3.8.9 wave J - reliability helpers

// -------- autosave snapshots --------------------------------------------

/** Default autosave cadence in ms (60s). */
export const AUTOSAVE_INTERVAL_MS = 60_000 as const;

export interface AutosaveSnapshot<T> {
  /** Buffer id this snapshot belongs to. */
  bufferId: string;
  /** When it was taken (ms epoch). */
  takenAt: number;
  /** Hash so we skip writing identical content. */
  contentHash: string;
  /** The actual payload. */
  payload: T;
}

export interface AutosaveStore<T> {
  /** Most recent snapshot per buffer id. */
  snapshots: Record<string, AutosaveSnapshot<T>>;
}

export function newAutosaveStore<T>(): AutosaveStore<T> {
  return { snapshots: {} };
}

/**
 * Decide whether `bufferId` should snapshot now. Returns true when:
 *  - we have never snapshotted, or
 *  - content hash differs AND >= intervalMs has elapsed, or
 *  - `forceOnBlur` is true and content hash differs
 */
export function shouldSnapshot(
  store: AutosaveStore<unknown>,
  bufferId: string,
  contentHash: string,
  now: number,
  options: { intervalMs?: number; forceOnBlur?: boolean } = {}
): boolean {
  const interval = options.intervalMs ?? AUTOSAVE_INTERVAL_MS;
  const last = store.snapshots[bufferId];
  if (!last) return true;
  if (last.contentHash === contentHash) return false;
  if (options.forceOnBlur) return true;
  return now - last.takenAt >= interval;
}

export function recordSnapshot<T>(
  store: AutosaveStore<T>,
  snap: AutosaveSnapshot<T>
): AutosaveStore<T> {
  return { snapshots: { ...store.snapshots, [snap.bufferId]: snap } };
}

export function readSnapshot<T>(
  store: AutosaveStore<T>,
  bufferId: string
): AutosaveSnapshot<T> | null {
  return store.snapshots[bufferId] ?? null;
}

// -------- IPC retry / backoff -------------------------------------------

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  /** Multiplier applied each attempt. */
  factor: number;
  /** Additional ±jitter as a fraction of the delay (0..1). */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 200,
  maxMs: 10_000,
  factor: 2,
  jitter: 0.2,
};

/**
 * Compute the delay before retry attempt `n` (n=1 = first retry).
 * Pure: takes a `random()` so tests can pin jitter.
 */
export function nextBackoffMs(
  attempt: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
  random: () => number = Math.random
): number {
  if (attempt < 1) return 0;
  const raw = Math.min(policy.maxMs, policy.baseMs * Math.pow(policy.factor, attempt - 1));
  if (policy.jitter <= 0) return raw;
  const jitterMagnitude = raw * policy.jitter;
  // random() in [0,1) → bias to [-1, +1)
  const sign = random() * 2 - 1;
  return Math.max(0, Math.round(raw + sign * jitterMagnitude));
}

// -------- circuit breaker -----------------------------------------------

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreaker {
  state: BreakerState;
  /** Consecutive failures since last close. */
  failures: number;
  /** When the breaker last tripped open (ms epoch). */
  openedAt: number | null;
  failureThreshold: number;
  /** ms before the breaker tries half-open. */
  cooldownMs: number;
}

export function newBreaker(failureThreshold = 5, cooldownMs = 30_000): CircuitBreaker {
  return { state: 'closed', failures: 0, openedAt: null, failureThreshold, cooldownMs };
}

/** Decide whether a call is allowed *right now*. May transition open→half-open. */
export function canCall(breaker: CircuitBreaker, now: number): { allow: boolean; next: CircuitBreaker } {
  if (breaker.state === 'closed') return { allow: true, next: breaker };
  if (breaker.state === 'open') {
    if (breaker.openedAt !== null && now - breaker.openedAt >= breaker.cooldownMs) {
      const half: CircuitBreaker = { ...breaker, state: 'half-open' };
      return { allow: true, next: half };
    }
    return { allow: false, next: breaker };
  }
  // half-open: allow exactly one probe; the result will close or re-open it.
  return { allow: true, next: breaker };
}

export function recordSuccess(breaker: CircuitBreaker): CircuitBreaker {
  return { ...breaker, state: 'closed', failures: 0, openedAt: null };
}

export function recordFailure(breaker: CircuitBreaker, now: number): CircuitBreaker {
  if (breaker.state === 'half-open') {
    return { ...breaker, state: 'open', openedAt: now };
  }
  const failures = breaker.failures + 1;
  if (failures >= breaker.failureThreshold) {
    return { ...breaker, state: 'open', failures, openedAt: now };
  }
  return { ...breaker, failures };
}

// -------- native module health summary -----------------------------------

export interface NativeModuleProbe {
  name: string;
  /** Loaded version string from the .node binding. */
  version: string;
  /** Expected version from package.json. */
  expected: string;
  /** Did require() succeed? */
  loaded: boolean;
  /** Optional error message. */
  error?: string;
}

export type NativeModuleStatus = 'ok' | 'mismatch' | 'failed' | 'missing';

export interface NativeModuleHealth {
  name: string;
  status: NativeModuleStatus;
  /** Suggested next step the user can take. */
  suggestion: string;
}

export function summariseNativeHealth(probes: readonly NativeModuleProbe[]): NativeModuleHealth[] {
  return probes.map((p) => {
    if (!p.loaded) {
      return {
        name: p.name,
        status: p.error ? 'failed' : 'missing',
        suggestion: 'Run npm rebuild and restart DEX.',
      };
    }
    if (p.version !== p.expected) {
      return {
        name: p.name,
        status: 'mismatch',
        suggestion: `Rebuild: expected ${p.expected}, found ${p.version}.`,
      };
    }
    return { name: p.name, status: 'ok', suggestion: 'Healthy.' };
  });
}

// -------- disk-full guard ----------------------------------------------

export const DISK_WARN_THRESHOLD_BYTES = 200 * 1024 * 1024; // 200 MB
export const DISK_BLOCK_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB

export type DiskState = 'ok' | 'warn' | 'block';

export interface DiskGuardResult {
  state: DiskState;
  freeBytes: number;
  message: string;
}

/** Decide whether a write should proceed. Pure. */
export function checkDisk(freeBytes: number): DiskGuardResult {
  if (freeBytes < DISK_BLOCK_THRESHOLD_BYTES) {
    return {
      state: 'block',
      freeBytes,
      message: 'Disk almost full — DEX paused writes to protect your data.',
    };
  }
  if (freeBytes < DISK_WARN_THRESHOLD_BYTES) {
    return {
      state: 'warn',
      freeBytes,
      message: 'Disk space is low — free up space soon.',
    };
  }
  return { state: 'ok', freeBytes, message: 'Disk space OK.' };
}

// -------- crash report queue -------------------------------------------

export interface CrashReport {
  id: string;
  /** ms epoch */
  occurredAt: number;
  /** Coarse category. */
  kind: 'render' | 'main' | 'native' | 'unhandled-rejection';
  /** Sanitised message (PII already stripped by caller). */
  message: string;
  /** Truncated stack. */
  stack?: string;
  /** App version at crash. */
  appVersion: string;
  /** Whether the user has opted into upload. */
  uploadConsent: boolean;
  /** Whether we have already uploaded this report. */
  uploaded: boolean;
}

export interface CrashQueue {
  reports: CrashReport[];
  /** Hard cap so the queue cannot grow unbounded. */
  capacity: number;
}

export const CRASH_QUEUE_CAPACITY = 50 as const;

export function newCrashQueue(capacity: number = CRASH_QUEUE_CAPACITY): CrashQueue {
  return { reports: [], capacity: Math.max(1, capacity) };
}

export function enqueueCrash(queue: CrashQueue, report: CrashReport): CrashQueue {
  // Dedup by id.
  if (queue.reports.some((r) => r.id === report.id)) return queue;
  const next = [...queue.reports, report];
  if (next.length > queue.capacity) next.splice(0, next.length - queue.capacity);
  return { reports: next, capacity: queue.capacity };
}

/** Reports that may be uploaded (opt-in) and have not been yet. */
export function pendingUploads(queue: CrashQueue): CrashReport[] {
  return queue.reports.filter((r) => r.uploadConsent && !r.uploaded);
}

export function markUploaded(queue: CrashQueue, id: string): CrashQueue {
  return {
    ...queue,
    reports: queue.reports.map((r) => (r.id === id ? { ...r, uploaded: true } : r)),
  };
}
