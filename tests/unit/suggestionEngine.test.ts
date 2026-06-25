// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  rankAppSuggestions,
  type AppUsageStats,
} from '../../src/renderer/services/suggestionEngine';

const NOW = 1_700_000_000_000; // fixed reference so tests are deterministic
const HOUR = 60 * 60 * 1000;

function emptyStats(): AppUsageStats {
  return { visits: {}, lastActive: {}, hourly: {}, pairs: {} };
}

describe('rankAppSuggestions', () => {
  it('returns nothing when there is no data', () => {
    expect(rankAppSuggestions(emptyStats(), null, { now: NOW })).toEqual([]);
  });

  it('always excludes home and the current app', () => {
    const stats = emptyStats();
    stats.visits = { home: 50, notes: 5, files: 3 };
    const ranked = rankAppSuggestions(stats, 'notes', { now: NOW });
    const ids = ranked.map((r) => r.appId);
    expect(ids).not.toContain('home');
    expect(ids).not.toContain('notes');
    expect(ids).toContain('files');
  });

  it('ranks more-frequently-used apps higher', () => {
    const stats = emptyStats();
    stats.visits = { notes: 20, files: 2 };
    const ranked = rankAppSuggestions(stats, null, { now: NOW });
    expect(ranked[0].appId).toBe('notes');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('rewards recency: same frequency, more-recent app wins', () => {
    const stats = emptyStats();
    stats.visits = { a: 5, b: 5 };
    stats.lastActive = { a: NOW - 1 * HOUR, b: NOW - 60 * 24 * HOUR };
    const ranked = rankAppSuggestions(stats, null, { now: NOW });
    expect(ranked[0].appId).toBe('a');
  });

  it('rewards time-of-day affinity at the current hour', () => {
    const hour = new Date(NOW).getHours();
    const stats = emptyStats();
    stats.visits = { morning: 10, anytime: 10 };
    // `morning` clusters entirely at the current hour; `anytime` is spread flat.
    const clustered = new Array(24).fill(0);
    clustered[hour] = 10;
    const flat = new Array(24).fill(10);
    stats.hourly = { morning: clustered, anytime: flat };
    const ranked = rankAppSuggestions(stats, null, { now: NOW, recencyWeight: 0 });
    expect(ranked[0].appId).toBe('morning');
  });

  it('boosts the app that usually follows the current app (pairing)', () => {
    const stats = emptyStats();
    // Both equally frequent overall, but `terminal` almost always follows `code`.
    stats.visits = { terminal: 10, browser: 10 };
    stats.pairs = { code: { terminal: 9, browser: 1 } };
    const ranked = rankAppSuggestions(stats, 'code', { now: NOW });
    expect(ranked[0].appId).toBe('terminal');
  });

  it('is deterministic and stable on ties (alphabetical fallback)', () => {
    const stats = emptyStats();
    stats.visits = { zeta: 5, alpha: 5 };
    const ranked = rankAppSuggestions(stats, null, { now: NOW });
    expect(ranked.map((r) => r.appId)).toEqual(['alpha', 'zeta']);
  });

  it('honours an explicit exclude list', () => {
    const stats = emptyStats();
    stats.visits = { a: 5, b: 5, c: 5 };
    const ranked = rankAppSuggestions(stats, null, { now: NOW, exclude: ['b'] });
    expect(ranked.map((r) => r.appId)).not.toContain('b');
  });
});
