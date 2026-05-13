// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Exponential backoff delay calculator with optional jitter.
 *
 * Pure: returns the next delay in ms; does not sleep itself, so it is
 * trivial to test deterministically (inject `random`).
 */

export interface ExpoBackoffOptions {
  baseMs: number;
  maxMs?: number;
  factor?: number;
  jitter?: 'none' | 'full' | 'equal' | 'decorrelated';
  random?: () => number;
}

export function expoBackoff(attempt: number, opts: ExpoBackoffOptions): number {
  if (!Number.isFinite(opts.baseMs) || opts.baseMs <= 0) {
    throw new Error('expoBackoff: baseMs must be a positive finite number');
  }
  if (!Number.isFinite(attempt) || attempt < 0) {
    throw new Error('expoBackoff: attempt must be a non-negative finite number');
  }
  const maxMs = opts.maxMs ?? Infinity;
  const factor = opts.factor ?? 2;
  const rand = opts.random ?? Math.random;
  const cap = Math.min(opts.baseMs * factor ** attempt, maxMs);
  const jitter = opts.jitter ?? 'full';
  switch (jitter) {
    case 'none': return cap;
    case 'full': return rand() * cap;
    case 'equal': return cap / 2 + rand() * (cap / 2);
    case 'decorrelated': {
      const prev = opts.baseMs * factor ** Math.max(0, attempt - 1);
      return Math.min(maxMs, opts.baseMs + rand() * (prev * 3));
    }
    default: return cap;
  }
}
