// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Confidence scoring + citation handling for UKI replies.
 */

// DEX v3.8.9 - confidence + citations

export interface ConfidenceInputs {
  /** Average per-token logprob from the model (negative). */
  avgLogprob?: number;
  /** Number of explicit citations in the reply. */
  citationCount: number;
  /** Number of retries the agent made internally. */
  retries: number;
  /** Number of distinct sources cited. */
  distinctSources: number;
}

/** Returns a [0, 1] confidence score. */
export function scoreConfidence(inputs: ConfidenceInputs): number {
  let score = 0.5;
  if (typeof inputs.avgLogprob === 'number') {
    // Map [-3, 0] -> [0, 1].
    const lp = Math.max(-3, Math.min(0, inputs.avgLogprob));
    score = score * 0.5 + ((lp + 3) / 3) * 0.5;
  }
  score += Math.min(0.2, inputs.citationCount * 0.04);
  score += Math.min(0.1, inputs.distinctSources * 0.025);
  score -= Math.min(0.3, inputs.retries * 0.05);
  return Math.max(0, Math.min(1, score));
}

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score < 0.4) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

export interface Citation {
  index: number;       // 1-based, matches `[1]` in body
  title?: string;
  url?: string;
  snippet?: string;
}

/** Pull `[1]`, `[2]`, ... markers from a reply body. */
export function extractCitationIndices(body: string): number[] {
  const found = new Set<number>();
  for (const m of body.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/** Format a Citation for footnote display. */
export function formatCitation(c: Citation): string {
  const head = c.title ?? c.url ?? `Source ${c.index}`;
  const url = c.url ? ` — ${c.url}` : '';
  return `[${c.index}] ${head}${url}`;
}
