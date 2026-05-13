// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Time / duration formatting (no Intl deps for hot paths).
 * Used by VINX timeline, Imosion transport, Tasks due dates.
 */

/** "H:MM:SS" or "M:SS" depending on size. */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** "1.23s" / "456ms" / "1.2m" — for perf logs. */
export function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/** "in 3 minutes" / "5 hours ago" */
export function formatRelative(targetMs: number, now = Date.now()): string {
  const diff = targetMs - now;
  const future = diff > 0;
  const abs = Math.abs(diff);
  const units: Array<[string, number]> = [
    ['year', 365 * 24 * 3600 * 1000],
    ['month', 30 * 24 * 3600 * 1000],
    ['day', 24 * 3600 * 1000],
    ['hour', 3600 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];
  for (const [name, n] of units) {
    if (abs >= n) {
      const v = Math.floor(abs / n);
      const word = v === 1 ? name : `${name}s`;
      return future ? `in ${v} ${word}` : `${v} ${word} ago`;
    }
  }
  return 'just now';
}
