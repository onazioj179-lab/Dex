// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { formatPercent, percentChange, changeLabel, clampPercent, ratioOf } from '../../src/shared/format/percent';

describe('percent', () => {
  it('formats ratios', () => {
    expect(formatPercent(0.75)).toBe('75%');
    expect(formatPercent(0.1234, 1)).toBe('12.3%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });

  it('computes percent change', () => {
    expect(percentChange(100, 150)).toBe(50);
    expect(percentChange(100, 50)).toBe(-50);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(0, 5)).toBe(Infinity);
  });

  it('formats change labels', () => {
    expect(changeLabel(100, 150)).toBe('+50%');
    expect(changeLabel(100, 50)).toBe('-50%');
    expect(changeLabel(100, 100)).toBe('0%');
    expect(changeLabel(0, 5)).toBe('—');
  });

  it('clamps and computes ratios', () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(ratioOf(50, 200)).toBe(0.25);
    expect(ratioOf(5, 0)).toBe(0);
  });
});
