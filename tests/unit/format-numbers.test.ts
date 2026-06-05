// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { clamp, formatCount, formatPercent, ordinal } from '../../src/shared/format/numbers';

describe('format numbers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('formats compact counts', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1200)).toBe('1.2k');
    expect(formatCount(3_400_000)).toBe('3.4M');
    expect(formatCount(1_000_000_000)).toBe('1.0B');
    expect(formatCount(150_000)).toBe('150k');
    expect(formatCount(-2500)).toBe('-2.5k');
  });

  it('formats percent from ratio or raw', () => {
    expect(formatPercent(0.42)).toBe('42%');
    expect(formatPercent(0.4267, true, 1)).toBe('42.7%');
    expect(formatPercent(80, false)).toBe('80%');
  });

  it('formats English ordinals', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(112)).toBe('112th');
  });
});
