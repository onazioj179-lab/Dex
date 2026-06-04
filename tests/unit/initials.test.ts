import { describe, it, expect } from 'vitest';
import { initials, nameHue } from '../../src/shared/format/initials';

describe('initials', () => {
  it('takes first letters of words', () => {
    expect(initials('Onazi Treasure')).toBe('OT');
    expect(initials('Onazi Treasure OJ', 3)).toBe('OTO');
    expect(initials('Onazi Treasure OJ', 2)).toBe('OT');
  });

  it('handles single names', () => {
    expect(initials('madonna')).toBe('MA');
  });

  it('uses the local part of an email', () => {
    expect(initials('onazi@gmail.com')).toBe('ON');
  });

  it('splits on punctuation separators', () => {
    expect(initials('jean-luc picard')).toBe('JL');
  });

  it('falls back to ? for empty', () => {
    expect(initials('   ')).toBe('?');
  });

  it('nameHue is deterministic and in range', () => {
    expect(nameHue('Onazi')).toBe(nameHue('Onazi'));
    expect(nameHue('Onazi')).toBeGreaterThanOrEqual(0);
    expect(nameHue('Onazi')).toBeLessThan(360);
  });
});
