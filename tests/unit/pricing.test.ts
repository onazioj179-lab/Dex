// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.6 - pricing module tests

import { describe, it, expect } from 'vitest';
import {
  PLANS,
  DISCOUNTS,
  TRIAL_DAYS,
  REFUND_DAYS,
  formatPrice,
  yearlySavings,
  getPlan,
  trialRemainingMs,
  isTrialExpired,
  canUse,
  PRICING_PROMISES,
} from '../../src/shared/license/pricing';

describe('Pricing - constants', () => {
  it('30-day trial, 14-day refund', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(REFUND_DAYS).toBe(14);
  });

  it('exposes 5 plans', () => {
    expect(PLANS).toHaveLength(5);
    expect(PLANS.map((p) => p.id)).toEqual(['free-viewer', 'personal', 'family', 'pro', 'studio']);
  });

  it('publishes user-first promises', () => {
    expect(PRICING_PROMISES.length).toBeGreaterThanOrEqual(5);
    // The absolute "no ads" promise was intentionally dropped (free tier may show
    // ads); the current user-first ad promise is "ad-free on every paid plan".
    expect(PRICING_PROMISES.join(' ')).toMatch(/ad-free/i);
  });
});

describe('Pricing - tiers favor the user', () => {
  it('free viewer is genuinely free', () => {
    const plan = getPlan('free-viewer');
    expect(plan.prices.monthly?.cents).toBe(0);
    expect(plan.prices.yearly?.cents).toBe(0);
    expect(plan.capabilities.readOnly).toBe(true);
  });

  it('personal yearly saves at least 25% vs monthly', () => {
    const personal = getPlan('personal');
    expect(yearlySavings(personal)).toBeGreaterThan(0.25);
  });

  it('pro yearly saves at least 20% vs monthly', () => {
    const pro = getPlan('pro');
    expect(yearlySavings(pro)).toBeGreaterThan(0.20);
  });

  it('only pro and studio allow commercial use', () => {
    expect(canUse(getPlan('personal'), 'commercialUse')).toBe(false);
    expect(canUse(getPlan('pro'), 'commercialUse')).toBe(true);
    expect(canUse(getPlan('studio'), 'commercialUse')).toBe(true);
  });

  it('studio carries an SLA, others do not', () => {
    expect(getPlan('studio').capabilities.slaPercent).toBeGreaterThan(99);
    expect(getPlan('personal').capabilities.slaPercent).toBe(0);
  });
});

describe('Pricing - discounts', () => {
  it('students, non-profits, and OSS maintainers all get help', () => {
    const ids = DISCOUNTS.map((d) => d.id);
    expect(ids).toContain('student');
    expect(ids).toContain('nonprofit');
    expect(ids).toContain('oss-maintainer');
  });

  it('OSS maintainer discount makes Pro free', () => {
    const oss = DISCOUNTS.find((d) => d.id === 'oss-maintainer')!;
    expect(oss.percent).toBe(100);
    expect(oss.appliesTo).toEqual(['pro']);
  });
});

describe('Pricing - formatting', () => {
  it('formats whole-dollar prices without cents', () => {
    expect(formatPrice(7900)).toBe('$79');
  });

  it('formats sub-dollar prices with cents', () => {
    expect(formatPrice(499)).toBe('$4.99');
  });

  it('formats zero as Free', () => {
    expect(formatPrice(0)).toBe('Free');
  });
});

describe('Pricing - trial helpers', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  it('counts down 30 days', () => {
    const installed = 1_000_000;
    const remaining = trialRemainingMs(installed, installed + 5 * dayMs);
    expect(Math.round(remaining / dayMs)).toBe(25);
  });

  it('expires after 30 days', () => {
    const installed = 1_000_000;
    expect(isTrialExpired(installed, installed + 30 * dayMs + 1)).toBe(true);
    expect(isTrialExpired(installed, installed + 29 * dayMs)).toBe(false);
  });

  it('rejects unknown plan ids', () => {
    expect(() => getPlan('nope' as never)).toThrow();
  });
});
