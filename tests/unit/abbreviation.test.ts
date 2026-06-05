// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { matchInitials, matchSubsequence, abbreviationScore } from '../../src/shared/search/abbreviation';

describe('abbreviation match', () => {
  it('matches initials in order', () => {
    expect(matchInitials('vsc', 'Visual Studio Code')).toBe(true);
    expect(matchInitials('vc', 'Visual Studio Code')).toBe(true);
    expect(matchInitials('xyz', 'Visual Studio Code')).toBe(false);
    expect(matchInitials('', 'anything')).toBe(true);
  });

  it('matches subsequences', () => {
    expect(matchSubsequence('stng', 'Settings')).toBe(true);
    expect(matchSubsequence('xyz', 'Settings')).toBe(false);
  });

  it('scores initials over subsequence', () => {
    expect(abbreviationScore('vsc', 'Visual Studio Code')).toBe(1);
    expect(abbreviationScore('stng', 'Settings')).toBe(0.6);
    expect(abbreviationScore('zzz', 'Settings')).toBe(0);
  });
});
