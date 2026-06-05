// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { suggestionScore, suggest } from '../../src/shared/search/autocomplete';

describe('autocomplete', () => {
  it('scores prefix/equal/substring/abbreviation', () => {
    expect(suggestionScore('settings', 'Settings')).toBe(1);
    expect(suggestionScore('set', 'Settings')).toBe(0.95);
    expect(suggestionScore('tting', 'Settings')).toBe(0.8); // substring
    expect(suggestionScore('vsc', 'Visual Studio Code')).toBeCloseTo(0.85, 6); // initials
    expect(suggestionScore('', 'Settings')).toBe(0);
  });

  it('ranks suggestions and filters weak matches', () => {
    const out = suggest('set', ['Settings', 'Files', 'Storage']);
    expect(out[0].value).toBe('Settings');
    expect(out.map((s) => s.value)).not.toContain('Files');
  });

  it('empty query returns leading candidates', () => {
    const out = suggest('', ['a', 'b', 'c'], { limit: 2 });
    expect(out.map((s) => s.value)).toEqual(['a', 'b']);
  });
});
