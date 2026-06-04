import { describe, it, expect } from 'vitest';
import { removeDiacritics, normalizeForSearch, looseEquals, looseIncludes } from '../../src/shared/text/diacritics';

describe('diacritics', () => {
  it('strips accents', () => {
    expect(removeDiacritics('café')).toBe('cafe');
    expect(removeDiacritics('naïve')).toBe('naive');
    expect(removeDiacritics('Pokémon')).toBe('Pokemon');
  });

  it('normalizes for search', () => {
    expect(normalizeForSearch('  Café  ')).toBe('cafe');
  });

  it('loose equals / includes', () => {
    expect(looseEquals('café', 'CAFE')).toBe(true);
    expect(looseIncludes('Café Latte', 'cafe')).toBe(true);
    expect(looseIncludes('Tea House', 'cafe')).toBe(false);
  });
});
