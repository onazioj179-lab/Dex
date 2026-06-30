// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// How long a finished UKI answer lingers on screen before she drifts to sleep.
//
// A flat timer either yanks long answers away mid-read or leaves trivial ones
// hanging. Instead the linger scales with the answer's length (reading time)
// within sane bounds: short replies clear quickly, a dense paragraph stays up
// long enough to actually finish reading. Kept pure + standalone so it is unit
// testable and so importing it never disables Fast Refresh on the overlay.

export const LINGER_MIN_MS = 9000;
export const LINGER_MAX_MS = 30000;

/** Linger duration in ms for a given response, clamped to [MIN, MAX]. */
export function computeLingerMs(response: string): number {
  // ~200 wpm reading speed -> ~3.3 words/sec; add the base dwell on top.
  const words = response.trim() ? response.trim().split(/\s+/).length : 0;
  const readMs = (words / 3.3) * 1000;
  return Math.min(LINGER_MAX_MS, Math.max(LINGER_MIN_MS, LINGER_MIN_MS + readMs));
}
