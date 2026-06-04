// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Score blending (hybrid search ranking). Combines several normalized 0..1
 * signals — lexical, vector/semantic, recency, popularity — into one final score
 * via a weighted average. Pure: no DOM, no IO.
 */

export interface Signal {
  /** Normalized 0..1 score for this signal. */
  score: number;
  /** Relative weight (non-negative). */
  weight: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Weighted average of signals, result clamped to 0..1. 0 when no weight. */
export function combineScores(signals: readonly Signal[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const w = Math.max(0, s.weight);
    weighted += clamp01(s.score) * w;
    totalWeight += w;
  }
  return totalWeight === 0 ? 0 : clamp01(weighted / totalWeight);
}

/** Combine named signals with a weight map (missing weights default to 1). */
export function combineNamed(scores: Record<string, number>, weights: Record<string, number> = {}): number {
  const signals: Signal[] = Object.entries(scores).map(([key, score]) => ({
    score,
    weight: weights[key] ?? 1,
  }));
  return combineScores(signals);
}

/** Apply an exponential recency boost: score blended toward 1 as age→0. */
export function recencyBoost(baseScore: number, ageMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return clamp01(baseScore);
  const decay = Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs); // 1 at age 0 → 0.5 at half-life
  return combineScores([{ score: baseScore, weight: 2 }, { score: decay, weight: 1 }]);
}
