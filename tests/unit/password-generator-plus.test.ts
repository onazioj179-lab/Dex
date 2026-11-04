// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Password Generator+ core: unbiased indices, class coverage, ambiguous-character
// exclusion, passphrases and honest entropy.

import { describe, it, expect } from 'vitest';
import {
  AMBIGUOUS, CHARSETS, WORDS, generatePassphrase, generatePassword, passwordSpaceBits,
  randomIndex, strengthFor, type RandomSource,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/passwordGen';

const ALL = { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };

/** Deterministic source that replays a fixed sequence. */
function seq(values: number[]): RandomSource {
  let i = 0;
  return n => Uint32Array.from({ length: n }, () => values[i++ % values.length]);
}

describe('randomIndex', () => {
  it('rejects values in the biased tail instead of folding them', () => {
    // n = 3: limit = 4294967295 - (2^32 % 3)... the top value 2^32-1 is rejected.
    const rand = seq([0xffffffff, 7]);
    expect(randomIndex(3, rand)).toBe(7 % 3);
  });
  it('stays in range and covers it', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(randomIndex(6, n => crypto.getRandomValues(new Uint32Array(n))));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('refuses an empty range', () => {
    expect(() => randomIndex(0, seq([1]))).toThrow();
  });
});

describe('generatePassword', () => {
  it('has the requested length and one of every selected class', () => {
    for (let i = 0; i < 200; i++) {
      const { value } = generatePassword({ ...ALL, length: 8 });
      expect(value).toHaveLength(8);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[0-9]/);
      expect([...value].some(c => CHARSETS.symbols.includes(c))).toBe(true);
    }
  });
  it('uses only the selected classes', () => {
    const { value } = generatePassword({ ...ALL, upper: false, symbols: false, length: 64 });
    expect(value).toMatch(/^[a-z0-9]+$/);
  });
  it('can leave out characters that are easy to misread', () => {
    const { value } = generatePassword({ ...ALL, length: 128, excludeAmbiguous: true });
    expect([...value].filter(c => AMBIGUOUS.has(c))).toEqual([]);
  });
  it('clamps the length and refuses an empty selection', () => {
    expect(generatePassword({ ...ALL, length: 2 }).value).toHaveLength(8);
    expect(generatePassword({ ...ALL, length: 999 }).value).toHaveLength(128);
    expect(() => generatePassword({ ...ALL, upper: false, lower: false, digits: false, symbols: false })).toThrow();
  });
  it('reports the real search space', () => {
    // One class only: exactly length * log2(pool).
    expect(passwordSpaceBits(10, ['abcdefghijklmnopqrstuvwxyz'])).toBeCloseTo(10 * Math.log2(26), 6);
    // Requiring every class removes some strings, so it is below the naive bound.
    const pools = Object.values(CHARSETS);
    const naive = 12 * Math.log2(pools.join('').length);
    const bits = passwordSpaceBits(12, pools);
    expect(bits).toBeLessThan(naive);
    expect(bits).toBeGreaterThan(naive - 1);
  });
});

describe('generatePassphrase', () => {
  it('joins the requested number of words', () => {
    const { value, entropyBits } = generatePassphrase({ words: 6, separator: '-', capitalize: false, includeNumber: false });
    const parts = value.split('-');
    expect(parts).toHaveLength(6);
    for (const p of parts) expect(WORDS).toContain(p);
    expect(entropyBits).toBeCloseTo(6 * Math.log2(WORDS.length), 6);
  });
  it('capitalises and adds one digit when asked', () => {
    const { value } = generatePassphrase({ words: 5, separator: ' ', capitalize: true, includeNumber: true });
    const parts = value.split(' ');
    expect(parts.every(p => /^[A-Z]/.test(p))).toBe(true);
    expect(value.match(/[0-9]/g)).toHaveLength(1);
  });
  it('has a large unique word list', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.length).toBeGreaterThanOrEqual(1024);
    expect(WORDS.every(w => /^[a-z]{3,9}$/.test(w))).toBe(true);
  });
});

describe('strengthFor', () => {
  it('maps entropy to four tiers', () => {
    expect(strengthFor(40).label).toBe('Weak');
    expect(strengthFor(60).label).toBe('Fair');
    expect(strengthFor(80).label).toBe('Strong');
    expect(strengthFor(128).label).toBe('Very strong');
  });
});
