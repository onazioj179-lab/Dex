// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies the WCAG contrast-ratio math added to ColorPicker (v6 Track G).

import { describe, it, expect } from 'vitest';
import { contrastRatio } from '../../src/renderer/DEXAPPLICATIONS/standalone/ColorPicker';

describe('contrastRatio (WCAG 2.x)', () => {
  it('black on white is the maximum 21:1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });
  it('a color against itself is 1:1', () => {
    expect(contrastRatio('#3366CC', '#3366CC')).toBeCloseTo(1, 6);
  });
  it('is symmetric (order does not matter)', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 9);
  });
  it('mid-grey #767676 passes AA (>=4.5) on white but not AAA (>=7)', () => {
    const r = contrastRatio('#767676', '#FFFFFF');
    expect(r).toBeGreaterThanOrEqual(4.5);
    expect(r).toBeLessThan(7);
  });
});
