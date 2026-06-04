// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * List/copy formatting for UI strings — "a, b and c", "a, b, +3 more". Used in
 * summaries (Home, Nexus, notification grouping, operator briefings). Pure: no
 * DOM, no IO, no locale dependency (deterministic English joins).
 */

/** Join with commas and a trailing "and": [] → "", [a,b,c] → "a, b and c". */
export function joinWithAnd(items: readonly string[], conjunction = 'and'): string {
  const xs = items.filter((s) => s != null && s !== '');
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} ${conjunction} ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')} ${conjunction} ${xs[xs.length - 1]}`;
}

/**
 * Show up to `max` items then "+N more": summarizeList([a,b,c,d,e], 3) →
 * "a, b, c +2 more". `max <= 0` → just the count summary.
 */
export function summarizeList(items: readonly string[], max = 3, moreWord = 'more'): string {
  const xs = items.filter((s) => s != null && s !== '');
  if (xs.length === 0) return '';
  if (max <= 0) return `${xs.length} item${xs.length === 1 ? '' : 's'}`;
  if (xs.length <= max) return xs.join(', ');
  const shown = xs.slice(0, max).join(', ');
  return `${shown} +${xs.length - max} ${moreWord}`;
}

/** "1 file" / "3 files" — count with a pluralized noun. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
