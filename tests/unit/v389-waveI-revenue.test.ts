// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave I - revenue plumbing tests

import { describe, it, expect } from 'vitest';
import {
  buildPlanPicker,
  evaluateFeatureGate,
  normaliseReceipt,
  quoteSeats,
  retentionLadder,
  sortReceipts,
  trialCountdown,
  validatePromoFormat,
} from '../../src/shared/license/revenue';

describe('wave I - feature gate (soft paywall)', () => {
  it('trial users get every gate', () => {
    const r = evaluateFeatureGate({
      currentPlanId: 'personal',
      capability: 'commercialUse',
      inTrial: true,
    });
    expect(r.allow).toBe(true);
    expect(r.upgradeTo).toBeNull();
  });

  it('blocks personal from commercialUse and recommends Pro', () => {
    const r = evaluateFeatureGate({
      currentPlanId: 'personal',
      capability: 'commercialUse',
      inTrial: false,
    });
    expect(r.allow).toBe(false);
    expect(r.upgradeTo).toBe('pro');
    expect(r.reason.toLowerCase()).toContain('pro');
  });

  it('allows pro to use liveCollab', () => {
    const r = evaluateFeatureGate({
      currentPlanId: 'pro',
      capability: 'liveCollab',
      inTrial: false,
    });
    expect(r.allow).toBe(true);
  });

  it('only studio unlocks adminConsole', () => {
    const r = evaluateFeatureGate({
      currentPlanId: 'pro',
      capability: 'adminConsole',
      inTrial: false,
    });
    expect(r.upgradeTo).toBe('studio');
  });
});

describe('wave I - plan picker', () => {
  it('returns a card per plan with pro flagged most-popular', () => {
    const cards = buildPlanPicker('personal', 'monthly');
    expect(cards).toHaveLength(5);
    const pro = cards.find((c) => c.plan.id === 'pro')!;
    expect(pro.badge).toBe('most-popular');
  });

  it('marks the current plan', () => {
    const cards = buildPlanPicker('pro', 'monthly');
    expect(cards.find((c) => c.plan.id === 'pro')?.current).toBe(true);
    expect(cards.find((c) => c.plan.id === 'personal')?.current).toBe(false);
  });

  it('formats Personal monthly as $20 / month', () => {
    const cards = buildPlanPicker('free-viewer', 'monthly');
    const personal = cards.find((c) => c.plan.id === 'personal')!;
    expect(personal.headlinePrice).toBe('$20');
    expect(personal.headlineSuffix).toBe(' / month');
  });

  it('formats Studio yearly as per-seat-per-year', () => {
    const cards = buildPlanPicker('free-viewer', 'yearly');
    const studio = cards.find((c) => c.plan.id === 'studio')!;
    expect(studio.headlineSuffix).toContain('seat');
    expect(studio.headlineSuffix).toContain('year');
  });

  it('shows a savings label when both monthly and yearly exist', () => {
    const cards = buildPlanPicker('free-viewer', 'monthly');
    const personal = cards.find((c) => c.plan.id === 'personal')!;
    expect(personal.yearlySavingsLabel).toMatch(/Save \$\d+ \/ yr/);
  });

  it('Free Viewer has the free badge', () => {
    const cards = buildPlanPicker('free-viewer', 'monthly');
    const free = cards.find((c) => c.plan.id === 'free-viewer')!;
    expect(free.badge).toBe('free');
    expect(free.headlinePrice).toBe('Free');
  });
});

describe('wave I - trial countdown', () => {
  it('29 days = fresh', () => {
    expect(trialCountdown(29).tier).toBe('fresh');
  });

  it('10 days = midway', () => {
    expect(trialCountdown(10).tier).toBe('midway');
  });

  it('2 days = soon, with singular at 1', () => {
    expect(trialCountdown(2).tier).toBe('soon');
    expect(trialCountdown(1).label).toBe('1 day left');
    expect(trialCountdown(2).label).toBe('2 days left');
  });

  it('0 = expired', () => {
    expect(trialCountdown(0).tier).toBe('expired');
    expect(trialCountdown(-5).tier).toBe('expired');
  });
});

describe('wave I - per-seat Studio quote', () => {
  it('multiplies seats correctly', () => {
    const q = quoteSeats(5);
    expect(q.seats).toBe(5);
    expect(q.monthlyTotalCents).toBe(5 * 6000); // 5 × $60
    expect(q.yearlyTotalCents).toBe(5 * 59900); // 5 × $599
    expect(q.effectivePerSeatMonthlyCents).toBe(Math.round(59900 / 12));
  });

  it('clamps to at least 1 seat', () => {
    expect(quoteSeats(0).seats).toBe(1);
    expect(quoteSeats(-3).seats).toBe(1);
  });

  it('floors fractional seat counts', () => {
    expect(quoteSeats(3.7).seats).toBe(3);
  });
});

describe('wave I - promo code validation', () => {
  it('rejects empty', () => {
    expect(validatePromoFormat('   ').issue).toBe('empty');
  });

  it('rejects too short', () => {
    expect(validatePromoFormat('AB').issue).toBe('too-short');
  });

  it('rejects too long', () => {
    expect(validatePromoFormat('A'.repeat(33)).issue).toBe('too-long');
  });

  it('rejects bad characters', () => {
    expect(validatePromoFormat('save 20!').issue).toBe('bad-chars');
  });

  it('accepts valid and uppercases', () => {
    const r = validatePromoFormat(' student-2026 ');
    expect(r.ok).toBe(true);
    expect(r.normalised).toBe('STUDENT-2026');
  });
});

describe('wave I - receipts', () => {
  it('normalises a receipt with locale-aware date and currency', () => {
    const r = normaliseReceipt({
      id: 'r1',
      paidAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      amountCents: 17900,
      currency: 'USD',
      planId: 'personal',
      period: 'yearly',
    });
    expect(r.amountLabel).toContain('179');
    expect(r.planLabel).toContain('DEX Personal');
    expect(r.planLabel).toContain('yearly');
    expect(r.paidOnLabel.length).toBeGreaterThan(0);
  });

  it('sorts newest first', () => {
    const list = [
      { id: 'a', paidAt: 100, amountCents: 100, currency: 'USD', planId: 'personal' as const, period: 'monthly' as const },
      { id: 'b', paidAt: 300, amountCents: 100, currency: 'USD', planId: 'personal' as const, period: 'monthly' as const },
      { id: 'c', paidAt: 200, amountCents: 100, currency: 'USD', planId: 'personal' as const, period: 'monthly' as const },
    ];
    expect(sortReceipts(list).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('wave I - cancel retention ladder', () => {
  it('exposes pause → discount → cancel in that order', () => {
    const steps = retentionLadder().map((o) => o.step);
    expect(steps).toEqual(['pause', 'discount', 'cancel']);
  });

  it('every offer has a non-empty action id', () => {
    for (const offer of retentionLadder()) {
      expect(offer.actionId.length).toBeGreaterThan(0);
      expect(offer.title.length).toBeGreaterThan(0);
    }
  });
});
