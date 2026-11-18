// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseOutline, mergeOutlineSlides } from '../../src/renderer/DEXAPPLICATIONS/standalone/presentationDeck';

describe('outline import', () => {
  it('titles start slides; indented or bulleted lines are bullets', () => {
    expect(parseOutline('Q3 review\n- Revenue up\n  Two launches\n\n# Next steps\n* Hire')).toEqual([
      { title: 'Q3 review', bullets: ['Revenue up', 'Two launches'] },
      { title: 'Next steps', bullets: ['Hire'] },
    ]);
    expect(parseOutline('  \n\n')).toEqual([]);
  });
  it('appends to a deck with work in it; replaces only the untouched starter', () => {
    const starter = (s: string) => s === 'starter';
    expect(mergeOutlineSlides(['starter'], ['a', 'b'], starter)).toEqual({ slides: ['a', 'b'], firstNew: 0, replaced: true });
    expect(mergeOutlineSlides(['mine'], ['a'], starter)).toEqual({ slides: ['mine', 'a'], firstNew: 1, replaced: false });
    expect(mergeOutlineSlides(['starter', 'mine'], ['a'], starter).slides).toEqual(['starter', 'mine', 'a']);
  });
});
