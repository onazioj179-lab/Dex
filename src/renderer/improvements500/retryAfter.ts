// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Parser for HTTP Retry-After header values.
 * Accepts either delta-seconds (integer) or HTTP-date (RFC 7231).
 * Returns the number of milliseconds to wait, clamped to >= 0.
 */

export function parseRetryAfter(headerValue: string | null | undefined, now: number = Date.now()): number | null {
  if (headerValue === null || headerValue === undefined) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;
  // delta-seconds form
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return null;
    return Math.max(0, Math.floor(seconds * 1000));
  }
  // HTTP-date form
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, ms - now);
}

/** Apply Retry-After + jitter, capped to `maxMs`. */
export function retryAfterDelay(
  headerValue: string | null | undefined,
  fallbackMs: number,
  maxMs = 60_000,
  jitter = 0.2,
  now: number = Date.now(),
  random: () => number = Math.random,
): number {
  let base = parseRetryAfter(headerValue, now);
  if (base === null) base = fallbackMs;
  const jitterAmt = base * jitter * (random() * 2 - 1);
  return Math.min(maxMs, Math.max(0, Math.floor(base + jitterAmt)));
}
