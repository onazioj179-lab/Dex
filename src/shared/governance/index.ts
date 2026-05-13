// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Governance constants. Programmatic mirror of `docs/KPI_BASELINES.md`,
 * `docs/RELEASE_RINGS.md`, and `docs/ROLLBACK_POLICY.md`. Code that needs
 * to apply a KPI threshold or a ring policy reads from here so the docs
 * and the runtime cannot drift.
 *
 * Phase 0 (Master Evolution Plan) deliverable. See ADRs 0002 and 0005.
 */

export type ReleaseRing = 'dev' | 'canary' | 'beta' | 'stable';

export const RELEASE_RINGS: readonly ReleaseRing[] = ['dev', 'canary', 'beta', 'stable'] as const;

export interface RingGate {
  /** Crash-free session ratio required over the ring's measurement window. */
  crashFreeRatio: number;
  /** Update rollback success ratio required for promotion. */
  updateRollbackSuccess: number;
  /** Minimum dwell time on the ring before promotion is allowed (ms). */
  minDwellMs: number;
}

export const RING_GATES: Readonly<Record<ReleaseRing, RingGate>> = Object.freeze({
  dev: { crashFreeRatio: 0, updateRollbackSuccess: 0, minDwellMs: 0 },
  canary: { crashFreeRatio: 0.993, updateRollbackSuccess: 0.99, minDwellMs: 24 * 60 * 60_000 },
  beta: { crashFreeRatio: 0.995, updateRollbackSuccess: 0.995, minDwellMs: 72 * 60 * 60_000 },
  stable: { crashFreeRatio: 0.997, updateRollbackSuccess: 0.999, minDwellMs: 7 * 24 * 60 * 60_000 },
});

/** Rolling window for composite-health-score evaluation in the rollback policy. */
export const HEALTH_WINDOW_MS = 5 * 60_000;

/** Number of consecutive critical windows that triggers automatic rollback. */
export const HEALTH_CRITICAL_WINDOWS_FOR_ROLLBACK = 2;

/** Bands for `computeHealthScore` (mirrors the runtime module). */
export const HEALTH_SCORE_BANDS = Object.freeze({
  healthy: 80,
  degraded: 60,
});

/** Memory pressure thresholds for the renderer. */
export const MEMORY_PRESSURE_THRESHOLDS = Object.freeze({
  elevated: 0.7,
  critical: 0.88,
  hysteresis: 0.05,
});

/** Default attention budget for shell notifications. */
export const ATTENTION_BUDGET_DEFAULTS = Object.freeze({
  windowMs: 5 * 60_000,
  maxInterruptions: 5,
});

/** Notification interruption weights consumed by `AttentionBudget`. */
export const NOTIFICATION_WEIGHTS = Object.freeze({
  info: 1,
  warn: 2,
  error: 3,
  critical: 5,
});

export type IpcRateCategory = 'interactive' | 'background' | 'bulk' | 'unbounded';

export interface IpcRateBudget {
  /** Sustained rate in requests per second. `null` for unbounded. */
  ratePerSecond: number | null;
  /** Burst capacity in requests. `null` for unbounded. */
  burst: number | null;
}

export const IPC_RATE_BUDGETS: Readonly<Record<IpcRateCategory, IpcRateBudget>> = Object.freeze({
  interactive: { ratePerSecond: 60, burst: 30 },
  background: { ratePerSecond: 10, burst: 20 },
  bulk: { ratePerSecond: 2, burst: 4 },
  unbounded: { ratePerSecond: null, burst: null },
});

/** KPI baselines. Tightened over time per `docs/KPI_BASELINES.md`. */
export const PERFORMANCE_BASELINES = Object.freeze({
  coldStartMs: 3500,
  warmStartMs: 1600,
  frameP95IdleMs: 14,
  frameP95ActiveMs: 22,
  inputLatencyP95Ms: 55,
  memoryIdleMb: 380,
  memoryP95LongSessionMb: 1400,
});

export const RELIABILITY_BASELINES = Object.freeze({
  crashFreeSessions24h: 0.99,
  deterministicRestoreSuccess: 0.97,
  updateRollbackSuccess: 0.95,
  dataCorruptionPerSession: 1 / 10000,
});

/**
 * Returns whether a release on `ring` may be promoted to the next ring,
 * given an observed crash-free ratio, rollback success ratio, and dwell
 * time so far.
 */
export function canPromote(
  ring: ReleaseRing,
  observed: { crashFreeRatio: number; updateRollbackSuccess: number; dwellMs: number },
): boolean {
  const gate = RING_GATES[ring];
  return (
    observed.crashFreeRatio >= gate.crashFreeRatio &&
    observed.updateRollbackSuccess >= gate.updateRollbackSuccess &&
    observed.dwellMs >= gate.minDwellMs
  );
}

/** Returns the ring immediately downstream of `ring`, or `null` if `stable`. */
export function nextRing(ring: ReleaseRing): ReleaseRing | null {
  const idx = RELEASE_RINGS.indexOf(ring);
  if (idx < 0 || idx === RELEASE_RINGS.length - 1) return null;
  return RELEASE_RINGS[idx + 1] ?? null;
}
