// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  MAX_RECENT_SEARCHES,
} from '../../src/renderer/services/recentSearches';

beforeEach(() => localStorage.clear());

describe('recent searches', () => {
  it('starts empty and records most-recent first', () => {
    expect(getRecentSearches()).toEqual([]);
    addRecentSearch('prism');
    addRecentSearch('research');
    expect(getRecentSearches()).toEqual(['research', 'prism']);
  });

  it('ignores blanks and de-duplicates case-insensitively', () => {
    addRecentSearch('Prism');
    addRecentSearch('   ');
    addRecentSearch('prism'); // moves to front, no dup
    expect(getRecentSearches()).toEqual(['prism']);
  });

  it('caps the list length', () => {
    for (let i = 0; i < MAX_RECENT_SEARCHES + 5; i++) addRecentSearch(`q${i}`);
    const list = getRecentSearches();
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe(`q${MAX_RECENT_SEARCHES + 4}`); // newest
  });

  it('removes (case-insensitive) and clears', () => {
    addRecentSearch('a');
    addRecentSearch('b'); // list is now ['b', 'a']
    expect(removeRecentSearch('A')).toEqual(['b']); // removes 'a'
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });
});
