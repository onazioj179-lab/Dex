// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Review integrity / anti-fake-review engine (DEX Developer Platform — E4).
 * Pure, deterministic scoring (clock + prior records injected) so a burst of
 * fake reviews cannot move an app's public rating. Aggregation counts only
 * `visible` reviews, so flagged/hidden suspicious reviews never affect the
 * average. The main-process ReviewService persists + serves these.
 *
 * Heuristics (each raises a suspicion score 0..1):
 *   - duplicate (same user reviewed this app before)  -> hard hide
 *   - rate-limit (too many reviews from one user fast)
 *   - new-account (account created right before reviewing)
 *   - empty + extreme (1 or 5 stars with no text)
 *   - bulk extreme cluster (many extreme reviews from new accounts on one app)
 *   - near-duplicate body (copy-pasted review text)
 */

export type Rating = 1 | 2 | 3 | 4 | 5;
export type ReviewStatus = 'visible' | 'flagged' | 'hidden';

export interface ReviewRecord {
  id: string;
  packageId: string;
  userId: string;
  rating: Rating;
  title?: string;
  body?: string;
  createdAt: number;
  /** When the reviewing account was created (for new-account suspicion). */
  accountCreatedAt: number;
  status: ReviewStatus;
  integrityScore: number;
}

export interface ReviewSummary {
  count: number;
  avg: number;
  visibleCount: number;
  histogram: Record<Rating, number>;
}

export interface ScoreContext {
  now: number;
  /** All prior reviews (any app) used for cross-checks. */
  prior: ReviewRecord[];
}

export interface IntegritySignal {
  score: number;
  flags: string[];
  status: ReviewStatus;
}

const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;   // < 1 day old = suspicious
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_MAX = 3;                            // > 3 reviews/day from one user
const DUP_BODY_SIM = 0.85;
const HIDE_AT = 0.8;
const FLAG_AT = 0.5;

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
}

/** Jaccard similarity of two review bodies (0..1). */
export function bodySimilarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Score a single review for fake/abuse suspicion. Deterministic. */
export function scoreReview(rec: ReviewRecord, ctx: ScoreContext): IntegritySignal {
  const flags: string[] = [];
  let score = 0;

  const byUser = ctx.prior.filter((p) => p.userId === rec.userId);

  // Hard rule: one review per app per user.
  if (byUser.some((p) => p.packageId === rec.packageId)) {
    return { score: 1, flags: ['duplicate'], status: 'hidden' };
  }

  const recent = byUser.filter((p) => rec.createdAt - p.createdAt < RATE_WINDOW_MS && rec.createdAt >= p.createdAt);
  if (recent.length >= RATE_MAX) { flags.push('rate-limit'); score += 0.6; }

  if (rec.createdAt - rec.accountCreatedAt < NEW_ACCOUNT_MS) { flags.push('new-account'); score += 0.3; }

  const extreme = rec.rating === 1 || rec.rating === 5;
  if (extreme && (!rec.body || rec.body.trim().length < 4)) { flags.push('empty-extreme'); score += 0.25; }

  const pkgPrior = ctx.prior.filter((p) => p.packageId === rec.packageId);
  if (extreme) {
    const cluster = pkgPrior.filter((p) => (p.rating === 1 || p.rating === 5) && (p.createdAt - p.accountCreatedAt < NEW_ACCOUNT_MS));
    if (cluster.length >= 3) { flags.push('bulk-cluster'); score += 0.4; }
  }

  if (rec.body && rec.body.trim()) {
    if (pkgPrior.some((p) => p.body && bodySimilarity(p.body, rec.body!) >= DUP_BODY_SIM)) {
      flags.push('near-duplicate-body');
      score += 0.4;
    }
  }

  score = Math.min(1, score);
  const status: ReviewStatus = score >= HIDE_AT ? 'hidden' : score >= FLAG_AT ? 'flagged' : 'visible';
  return { score, flags, status };
}

/** Aggregate to a public summary — the average uses ONLY visible reviews. */
export function aggregateReviews(records: ReviewRecord[]): ReviewSummary {
  const histogram: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let visibleCount = 0;
  for (const r of records) {
    if (r.status !== 'visible') continue;
    histogram[r.rating] += 1;
    sum += r.rating;
    visibleCount += 1;
  }
  const avg = visibleCount > 0 ? Math.round((sum / visibleCount) * 10) / 10 : 0;
  return { count: records.length, avg, visibleCount, histogram };
}
