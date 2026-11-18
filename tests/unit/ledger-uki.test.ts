// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { matchByName, signedAmount, validDate } from '../../src/renderer/DEXAPPLICATIONS/ledger/ledgerUki';

const accts = [{ id: 1, name: 'Checking' }, { id: 2, name: 'Savings' }, { id: 3, name: 'Credit Card' }, { id: 4, name: 'Card Rewards' }];

describe('Ledger UKI name matching', () => {
  it('exact, case-insensitive', () => expect(matchByName(accts, 'checking')).toEqual({ item: accts[0] }));
  it('unique prefix', () => expect(matchByName(accts, 'sav')).toEqual({ item: accts[1] }));
  it('ambiguous names are refused with the choices', () => {
    const r = matchByName(accts, 'card');
    expect('error' in r && r.error).toMatch(/Credit Card, Card Rewards/);
  });
  it('unknown names list what exists', () => {
    const r = matchByName(accts, 'Brokerage');
    expect('error' in r && r.error).toMatch(/Checking, Savings/);
  });
});

describe('Ledger UKI amounts and dates', () => {
  it('expense is negative minor units, income positive', () => {
    expect(signedAmount('42.50', 'expense', 2)).toEqual({ minor: -4250 });
    expect(signedAmount('-42.50', 'income', 2)).toEqual({ minor: 4250 });
  });
  it('refuses zero, junk and too many decimals', () => {
    expect('error' in signedAmount('0', 'expense', 2)).toBe(true);
    expect('error' in signedAmount('abc', 'expense', 2)).toBe(true);
    expect('error' in signedAmount('1.234', 'expense', 2)).toBe(true);
  });
  it('dates must be real YYYY-MM-DD', () => {
    expect(validDate('2026-02-28')).toBe(true);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('18/11/2026')).toBe(false);
  });
});
