// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentCommandIds, recordRecentCommand, clearRecentCommands, RECENT_MAX,
} from '../../src/renderer/services/recentCommands';

beforeEach(() => localStorage.clear());

describe('recent commands store', () => {
  it('is empty by default', () => {
    expect(getRecentCommandIds()).toEqual([]);
  });

  it('records most-recent-first and de-duplicates', () => {
    recordRecentCommand('a');
    recordRecentCommand('b');
    recordRecentCommand('a'); // re-use moves to front
    expect(getRecentCommandIds()).toEqual(['a', 'b']);
  });

  it('caps the list at RECENT_MAX', () => {
    for (let i = 0; i < 10; i++) recordRecentCommand(`cmd${i}`);
    const ids = getRecentCommandIds();
    expect(ids).toHaveLength(RECENT_MAX);
    expect(ids[0]).toBe('cmd9'); // newest first
    expect(ids).not.toContain('cmd0'); // oldest evicted
  });

  it('ignores empty ids', () => {
    recordRecentCommand('');
    expect(getRecentCommandIds()).toEqual([]);
  });

  it('clears history', () => {
    recordRecentCommand('x');
    clearRecentCommands();
    expect(getRecentCommandIds()).toEqual([]);
  });

  it('tolerates corrupt storage', () => {
    localStorage.setItem('dex-command-palette-recent', 'not-json');
    expect(getRecentCommandIds()).toEqual([]);
  });

  it('filters non-string entries', () => {
    localStorage.setItem('dex-command-palette-recent', JSON.stringify(['ok', 5, null, 'two']));
    expect(getRecentCommandIds()).toEqual(['ok', 'two']);
  });
});
