// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Unit Converter query resolution (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { resolveUnitQuery, UnitLike } from '../../src/shared/format/unitSearch';

// Mirrors the converter's catalog shape (a subset is enough for the logic).
const catalog: Record<string, UnitLike[]> = {
  length: [
    { label: 'Meters', symbol: 'm' },
    { label: 'Kilometers', symbol: 'km' },
    { label: 'Miles', symbol: 'mi' },
  ],
  weight: [
    { label: 'Kilograms', symbol: 'kg' },
    { label: 'Pounds', symbol: 'lb' },
  ],
  temperature: [
    { label: 'Celsius', symbol: '°C' },
    { label: 'Fahrenheit', symbol: '°F' },
  ],
  data: [
    { label: 'Bytes', symbol: 'B' },
    { label: 'Megabytes', symbol: 'MB' },
  ],
  energy: [
    { label: 'Kilowatt-hours', symbol: 'kWh' },
  ],
};

describe('resolveUnitQuery', () => {
  it('returns null for empty or unknown queries', () => {
    expect(resolveUnitQuery(catalog, '')).toBeNull();
    expect(resolveUnitQuery(catalog, '   ')).toBeNull();
    expect(resolveUnitQuery(catalog, 'parsecs')).toBeNull();
  });

  it('matches an exact symbol, case-insensitively', () => {
    expect(resolveUnitQuery(catalog, 'km')).toEqual({ category: 'length', index: 1 });
    expect(resolveUnitQuery(catalog, 'MB')).toEqual({ category: 'data', index: 1 });
    expect(resolveUnitQuery(catalog, 'mb')).toEqual({ category: 'data', index: 1 });
  });

  it('resolves informal aliases to the right unit', () => {
    expect(resolveUnitQuery(catalog, 'pounds')).toEqual({ category: 'weight', index: 1 });
    expect(resolveUnitQuery(catalog, 'kilometre')).toEqual({ category: 'length', index: 1 });
    expect(resolveUnitQuery(catalog, 'celsius')).toEqual({ category: 'temperature', index: 0 });
    expect(resolveUnitQuery(catalog, 'kwh')).toEqual({ category: 'energy', index: 0 });
  });

  it('matches the degree-prefixed temperature symbol', () => {
    expect(resolveUnitQuery(catalog, '°F')).toEqual({ category: 'temperature', index: 1 });
    expect(resolveUnitQuery(catalog, 'f')).toEqual({ category: 'temperature', index: 1 });
  });

  it('falls back to label prefix / substring', () => {
    expect(resolveUnitQuery(catalog, 'mega')).toEqual({ category: 'data', index: 1 });
    expect(resolveUnitQuery(catalog, 'gram')).toEqual({ category: 'weight', index: 0 }); // "Kilograms" contains "gram"
  });
});
