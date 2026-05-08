import { describe, it, expect } from 'vitest';
import {
  resolvePlan,
  limitsFor,
  FREE_LIMITS,
  POWER_LIMITS,
  planLabel,
} from '../../src/shared/plan';
import { createMinuteBudget, createDailyBudget, chargeBudget } from '../../src/shared/uki/tokenBudget';

describe('plan tier resolution', () => {
  it('returns free when creator state is missing', () => {
    expect(resolvePlan(null)).toBe('free');
    expect(resolvePlan(undefined)).toBe('free');
    expect(resolvePlan({})).toBe('free');
  });

  it('returns free when not unlocked', () => {
    expect(resolvePlan({ unlocked: false })).toBe('free');
  });

  it('returns power when unlocked and not expired', () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    expect(resolvePlan({ unlocked: true, expiresAt: future })).toBe('power');
  });

  it('returns free when token expired', () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(resolvePlan({ unlocked: true, expiresAt: past })).toBe('free');
  });

  it('treats null expiresAt as non-expiring while unlocked', () => {
    expect(resolvePlan({ unlocked: true, expiresAt: null })).toBe('power');
  });
});

describe('plan limits', () => {
  it('power tier raises every ceiling above free', () => {
    for (const key of Object.keys(FREE_LIMITS) as Array<keyof typeof FREE_LIMITS>) {
      expect(POWER_LIMITS[key]).toBeGreaterThan(FREE_LIMITS[key]);
    }
  });

  it('limitsFor maps tier to the right table', () => {
    expect(limitsFor('free')).toBe(FREE_LIMITS);
    expect(limitsFor('power')).toBe(POWER_LIMITS);
  });

  it('planLabel is human-readable', () => {
    expect(planLabel('free')).toMatch(/free/i);
    expect(planLabel('power')).toMatch(/power|creator/i);
  });
});

describe('plan-aware token budgets', () => {
  it('power minute budget is wider than free', () => {
    const f = createMinuteBudget('free');
    const p = createMinuteBudget('power');
    expect(p.limit).toBeGreaterThan(f.limit);
    expect(f.windowMs).toBe(60_000);
    expect(p.windowMs).toBe(60_000);
  });

  it('power daily budget rolls over a 24h window', () => {
    const p = createDailyBudget('power');
    expect(p.windowMs).toBe(24 * 60 * 60 * 1000);
  });

  it('charging within free minute budget succeeds', () => {
    let state = createMinuteBudget('free');
    const r = chargeBudget(state, 1000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(FREE_LIMITS.tokensPerMinute - 1000);
  });

  it('overcharging free minute budget fails', () => {
    const state = createMinuteBudget('free');
    const r = chargeBudget(state, FREE_LIMITS.tokensPerMinute + 1);
    expect(r.ok).toBe(false);
  });
});
