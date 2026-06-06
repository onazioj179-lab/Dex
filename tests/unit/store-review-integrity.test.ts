// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  scoreReview, aggregateReviews, bodySimilarity,
  type ReviewRecord, type ScoreContext,
} from '../../src/shared/store/reviewIntegrity';

let idc = 0;
function rec(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'r' + (idc++), packageId: 'dex.app.x', userId: 'u1', rating: 5,
    body: 'great app really useful', createdAt: 1_000_000, accountCreatedAt: 0,
    status: 'visible', integrityScore: 0, ...over,
  };
}
const ctx = (prior: ReviewRecord[] = [], now = 2_000_000): ScoreContext => ({ now, prior });
const DAY = 24 * 60 * 60 * 1000;

describe('review integrity (#E4 anti-fake)', () => {
  it('passes a normal review from an established account', () => {
    const s = scoreReview(rec({ accountCreatedAt: 1_000_000 - 100 * DAY }), ctx());
    expect(s.status).toBe('visible');
    expect(s.flags).not.toContain('new-account');
  });

  it('hard-hides a duplicate review of the same app by the same user', () => {
    const prior = [rec({ userId: 'u1', packageId: 'dex.app.x' })];
    const s = scoreReview(rec({ userId: 'u1', packageId: 'dex.app.x' }), ctx(prior));
    expect(s.flags).toContain('duplicate');
    expect(s.status).toBe('hidden');
  });

  it('flags rate-limited users (too many reviews fast)', () => {
    const prior = ['a', 'b', 'c'].map(pkg => rec({ userId: 'spam', packageId: pkg, createdAt: 1_500_000, accountCreatedAt: 0 }));
    const s = scoreReview(rec({ userId: 'spam', packageId: 'dex.app.x', createdAt: 1_600_000, accountCreatedAt: 0 }), ctx(prior, 1_600_000));
    expect(s.flags).toContain('rate-limit');
  });

  it('raises suspicion for a brand-new account', () => {
    const s = scoreReview(rec({ createdAt: 1_000_000, accountCreatedAt: 1_000_000 - 1000 }), ctx());
    expect(s.flags).toContain('new-account');
  });

  it('detects a bulk extreme-rating cluster from new accounts', () => {
    const prior = [0, 1, 2, 3].map(i => rec({ id: 'c' + i, userId: 'bot' + i, rating: 1, body: '', createdAt: 1_000_000, accountCreatedAt: 1_000_000 - 1000 }));
    const s = scoreReview(rec({ userId: 'bot9', rating: 1, body: '', createdAt: 1_000_000, accountCreatedAt: 1_000_000 - 1000 }), ctx(prior));
    expect(s.flags).toContain('bulk-cluster');
    expect(s.status).not.toBe('visible'); // flagged or hidden, never counted
  });

  it('catches copy-pasted (near-duplicate) review bodies', () => {
    const prior = [rec({ userId: 'a', body: 'this app is amazing and totally great wow' })];
    const s = scoreReview(rec({ userId: 'b', body: 'this app is amazing and totally great wow' }), ctx(prior));
    expect(s.flags).toContain('near-duplicate-body');
  });

  it('aggregate uses ONLY visible reviews — fake bursts excluded from the average', () => {
    const records: ReviewRecord[] = [
      rec({ rating: 5, status: 'visible' }),
      rec({ rating: 3, status: 'visible' }),
      rec({ rating: 1, status: 'hidden' }),
      rec({ rating: 1, status: 'flagged' }),
    ];
    const sum = aggregateReviews(records);
    expect(sum.count).toBe(4);
    expect(sum.visibleCount).toBe(2);
    expect(sum.avg).toBe(4); // (5+3)/2 — not dragged down by the fake 1-stars
    expect(sum.histogram[5]).toBe(1);
  });

  it('bodySimilarity is 1 for identical text, low for different', () => {
    expect(bodySimilarity('hello world', 'hello world')).toBe(1);
    expect(bodySimilarity('alpha beta', 'gamma delta')).toBeLessThan(0.2);
  });
});
