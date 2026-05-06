// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cloud storage quotas
 * -----------------------------------------------------------------------------
 * Free Viewer: 10 GB. Personal / Family / Pro / Studio: 50 GB per seat.
 * Studio admins can pool seats. All numbers in bytes; the UI formats.
 *
 * Pure functions: caller passes the current usage and the plan, gets back
 * a decision. No I/O, no state. The cloud service maintains the actual
 * counters; this module is the rule-book.
 */

// DEX v3.8.8 - cloud storage quota policy

import type { PlanId } from '../license/pricing';

export const ONE_GB = 1024 * 1024 * 1024;

export const QUOTA_BYTES: Record<PlanId, number> = {
  'free-viewer': 10 * ONE_GB,
  personal: 50 * ONE_GB,
  family: 50 * ONE_GB,    // per household, pooled
  pro: 50 * ONE_GB,
  studio: 50 * ONE_GB,    // per seat
};

/** Soft warning at 90% of quota; hard block at 100%. */
export const SOFT_WARN_FRACTION = 0.9;

export interface QuotaState {
  planId: PlanId;
  /** For Studio/Family: total seats included in the pool. Defaults to 1. */
  seats?: number;
  /** Bytes already stored. */
  usedBytes: number;
}

export interface QuotaSnapshot {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  fraction: number;        // 0..1
  warn: boolean;           // true once usage >= 90%
  full: boolean;           // true once usage >= 100%
}

export function quotaFor(state: QuotaState): QuotaSnapshot {
  const seats = Math.max(1, state.seats ?? 1);
  const total = QUOTA_BYTES[state.planId] * seats;
  const used = Math.max(0, state.usedBytes);
  const free = Math.max(0, total - used);
  const fraction = total === 0 ? 1 : used / total;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    fraction,
    warn: fraction >= SOFT_WARN_FRACTION,
    full: fraction >= 1,
  };
}

export interface UploadDecision {
  allowed: boolean;
  reason?: 'over-quota' | 'invalid-size' | 'plan-not-permitted';
  bytesShortBy?: number;
}

export function canUpload(state: QuotaState, addBytes: number): UploadDecision {
  if (!Number.isFinite(addBytes) || addBytes < 0) return { allowed: false, reason: 'invalid-size' };
  const snap = quotaFor(state);
  if (addBytes > snap.freeBytes) {
    return { allowed: false, reason: 'over-quota', bytesShortBy: addBytes - snap.freeBytes };
  }
  return { allowed: true };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < ONE_GB) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / ONE_GB).toFixed(2)} GB`;
}
