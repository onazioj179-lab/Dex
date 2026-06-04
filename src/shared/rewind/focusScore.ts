// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Focus scoring (Rewind analytics / Home insight). Derives a 0–100 focus score
 * from a sequence of app-activity events: fewer app switches and longer dwell on
 * a primary app → higher focus. Pure: no DOM, no IO.
 */

export interface FocusEvent {
  ts: number;
  appId: string;
}

export interface FocusResult {
  score: number;        // 0..100
  switches: number;     // app changes
  primaryAppId: string; // most-used app
  primaryShare: number; // 0..1 fraction of events on the primary app
}

/** Compute a focus score from a (time-ordered or unordered) event stream. */
export function focusScore(events: readonly FocusEvent[]): FocusResult {
  if (events.length === 0) {
    return { score: 0, switches: 0, primaryAppId: '', primaryShare: 0 };
  }
  const sorted = [...events].sort((a, b) => a.ts - b.ts);

  // App switches and per-app counts.
  let switches = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    counts.set(sorted[i].appId, (counts.get(sorted[i].appId) ?? 0) + 1);
    if (i > 0 && sorted[i].appId !== sorted[i - 1].appId) switches++;
  }

  let primaryAppId = sorted[0].appId;
  let primaryCount = 0;
  counts.forEach((n, id) => { if (n > primaryCount) { primaryCount = n; primaryAppId = id; } });
  const primaryShare = primaryCount / sorted.length;

  // Switch rate: 0 (no switches) → 1 (switch every step).
  const switchRate = sorted.length > 1 ? switches / (sorted.length - 1) : 0;

  // Blend: low switch rate and high primary share both raise focus.
  const score = Math.round(100 * (0.6 * (1 - switchRate) + 0.4 * primaryShare));

  return { score: Math.max(0, Math.min(100, score)), switches, primaryAppId, primaryShare };
}
