// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  newBudgetState, charge, checkBudget, wouldExceed, remaining,
} from '../../src/shared/uki/budget';

describe('UKI budget guard (#010/#011/#021)', () => {
  it('charges dimensions and detects the one that exceeds', () => {
    const budget = { maxCostUsd: 1, maxTokens: 1500, maxLatencyMs: 500 };
    let s = charge(newBudgetState(), { costUsd: 0.5, tokens: 1000, latencyMs: 200 });
    expect(checkBudget(s, budget).ok).toBe(true);
    s = charge(s, { costUsd: 0.6 });
    const chk = checkBudget(s, budget);
    expect(chk.ok).toBe(false);
    expect(chk.exceeded).toEqual(['cost']);
  });

  it('predicts overflow with wouldExceed before charging', () => {
    const s = charge(newBudgetState(), { tokens: 1400 });
    expect(wouldExceed(s, { maxTokens: 1500 }, { tokens: 50 })).toBe(false);
    expect(wouldExceed(s, { maxTokens: 1500 }, { tokens: 200 })).toBe(true);
  });

  it('reports remaining headroom (Infinity when uncapped)', () => {
    const s = charge(newBudgetState(), { costUsd: 0.3 });
    const r = remaining(s, { maxCostUsd: 1 });
    expect(r.costUsd).toBeCloseTo(0.7, 5);
    expect(r.tokens).toBe(Infinity);
  });
});
