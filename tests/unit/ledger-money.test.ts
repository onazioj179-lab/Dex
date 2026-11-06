// =============================================================================
// DEX Platform — DEX Ledger money helpers (renderer side)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { minorToDecimalString, parseMoneyInput, formatMoney, currencyDigits, shiftMonth, monthEnd } from '../../src/renderer/DEXAPPLICATIONS/ledger/money';

describe('ledger money (integer minor units, no floats)', () => {
  it('formats minor units exactly', () => {
    expect(minorToDecimalString(123456, 2)).toBe('1234.56');
    expect(minorToDecimalString(-5, 2)).toBe('-0.05');
    expect(minorToDecimalString(1500, 0)).toBe('1500');
    expect(minorToDecimalString(1250, 3)).toBe('1.250');
    // The classic float bug: 0.1 + 0.2 stays exactly 0.30.
    expect(minorToDecimalString(10 + 20, 2)).toBe('0.30');
    expect(minorToDecimalString(Number.MAX_SAFE_INTEGER, 2)).toBe('90071992547409.91');
  });

  it('parses typed amounts for the locale decimal mark', () => {
    expect(parseMoneyInput('12.50', 2, '.')).toEqual({ ok: true, minor: 1250 });
    expect(parseMoneyInput('1,234.56', 2, '.')).toEqual({ ok: true, minor: 123456 });
    expect(parseMoneyInput('1.234,56', 2, ',')).toEqual({ ok: true, minor: 123456 });
    expect(parseMoneyInput('12,50', 2, ',')).toEqual({ ok: true, minor: 1250 });
    expect(parseMoneyInput('1,234', 2, '.')).toEqual({ ok: true, minor: 123400 });
    expect(parseMoneyInput('-€3', 2, '.')).toEqual({ ok: true, minor: -300 });
    expect(parseMoneyInput('(4.20)', 2, '.')).toEqual({ ok: true, minor: -420 });
    expect(parseMoneyInput('1500', 0, '.')).toEqual({ ok: true, minor: 1500 });
    expect(parseMoneyInput('0.1', 2, '.')).toEqual({ ok: true, minor: 10 });
  });

  it('rejects input instead of rounding money', () => {
    expect(parseMoneyInput('1.005', 2, '.').ok).toBe(false);
    expect(parseMoneyInput('1.5', 0, '.').ok).toBe(false);
    expect(parseMoneyInput('', 2, '.').ok).toBe(false);
    expect(parseMoneyInput('abc', 2, '.').ok).toBe(false);
    expect(parseMoneyInput('1-2', 2, '.').ok).toBe(false);
    expect(parseMoneyInput('99999999999999999', 2, '.').ok).toBe(false);
    // Extra zero decimals are not a loss of value.
    expect(parseMoneyInput('2.500', 2, '.')).toEqual({ ok: true, minor: 250 });
  });

  it('uses the configured currency, never a USD default', () => {
    expect(formatMoney(123456, 'EUR', 2)).toMatch(/1.?234/);
    expect(formatMoney(123456, 'EUR', 2)).toMatch(/€|EUR/);
    expect(formatMoney(1500, 'JPY', 0)).toMatch(/1.?500/);
    expect(formatMoney(1500, 'JPY', 0)).not.toMatch(/\$/);
    expect(currencyDigits('KWD')).toBe(3);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('NGN')).toBe(2);
  });

  it('month helpers', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });
});
