// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies the password entropy-bits estimate (v6 Track G).

import { describe, it, expect } from 'vitest';
import { passwordEntropyBits } from '../../src/renderer/DEXAPPLICATIONS/standalone/PasswordGenerator';

describe('passwordEntropyBits', () => {
  it('is 0 for empty input', () => {
    expect(passwordEntropyBits('')).toBe(0);
  });
  it('lowercase-only pool is 26 (length * log2 26)', () => {
    expect(passwordEntropyBits('abcd')).toBeCloseTo(4 * Math.log2(26), 6);
  });
  it('all four classes give a 94-symbol pool', () => {
    // 16 chars across lower/upper/digit/symbol -> pool 94 -> ~104.9 bits.
    expect(passwordEntropyBits('Abcd1234!@#$Xyz9')).toBeCloseTo(16 * Math.log2(94), 6);
  });
  it('grows with length for the same pool', () => {
    expect(passwordEntropyBits('aaaaaaaa')).toBeGreaterThan(passwordEntropyBits('aaaa'));
  });
});
