// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Exponential backoff (UKI provider retries, sync, update polling). Computes the
 * delay before retry attempt N with an optional cap and full jitter. Pure: the
 * RNG is injectable so it is deterministic under test.
 */

export interface BackoffOptions {
  /** Delay for attempt 0. Default 500ms. */
  baseMs?: number;
  /** Growth factor per attempt. Default 2. */
  factor?: number;
  /** Maximum delay. Default 30000ms. */
  maxMs?: number;
  /** Apply full jitter (delay in [0, computed]). Default false. */
  jitter?: boolean;
  /** Injectable RNG returning [0,1). Default Math.random. */
  rng?: () => number;
}

/** Delay in ms before retry `attempt` (0-based). */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 500;
  const factor = opts.factor ?? 2;
  const max = opts.maxMs ?? 30_000;
  const n = Math.max(0, Math.floor(attempt));
  const raw = base * Math.pow(factor, n);
  const capped = Math.min(max, raw);
  if (opts.jitter) {
    const rng = opts.rng ?? Math.random;
    return Math.round(capped * rng());
  }
  return Math.round(capped);
}

/** The full backoff schedule for attempts 0..count-1. */
export function backoffSchedule(count: number, opts: BackoffOptions = {}): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(0, count); i++) out.push(backoffDelay(i, opts));
  return out;
}

/** True when another retry is allowed (attempt is below the max). */
export function shouldRetry(attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts - 1;
}
