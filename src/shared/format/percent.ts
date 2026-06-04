// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Percentage helpers (progress bars, analytics deltas, storage meters). Format a
 * 0..1 ratio as a percent string, compute percent change, and clamp. Pure: no
 * DOM, no IO.
 */

/** Format a 0..1 ratio as a percent string ("0.75" → "75%"). */
export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '0%';
  const pct = ratio * 100;
  return `${decimals > 0 ? pct.toFixed(decimals) : Math.round(pct)}%`;
}

/** Percent change from `from` to `to`. 0 when `from` is 0 and `to` is 0; ±Infinity guarded. */
export function percentChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : (to > 0 ? Infinity : -Infinity);
  return ((to - from) / Math.abs(from)) * 100;
}

/** A signed change label ("+12%", "-3%", "0%"). Returns "—" for non-finite. */
export function changeLabel(from: number, to: number, decimals = 0): string {
  const change = percentChange(from, to);
  if (!Number.isFinite(change)) return '—';
  const v = decimals > 0 ? change.toFixed(decimals) : String(Math.round(change));
  return `${change > 0 ? '+' : ''}${v}%`;
}

/** Clamp a percentage into [0, 100]. */
export function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Ratio (0..1) that `value` represents of `total` (0 when total ≤ 0). */
export function ratioOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}
