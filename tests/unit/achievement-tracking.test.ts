// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENTS } from '../../src/renderer/services/achievementsCatalog';
import {
  TRACKED_STATS, statKeysRead, trackableAchievementIds, visibleAchievements, categoryTotals,
} from '../../src/renderer/services/achievementTracking';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('achievement tracking', () => {
  it('probes the stats a closure reads', () => {
    const keys = statKeysRead((s) => s.notesCreated >= 10 && s.appsUsed.includes('notes'));
    expect([...keys].sort()).toEqual(['appsUsed', 'notesCreated']);
  });

  it('probes past short-circuits', () => {
    const keys = statKeysRead((s) => s.tasksCompleted > 5 && s.totalMinutes > 100);
    expect(keys.has('totalMinutes')).toBe(true);
  });

  it('keeps only trophies whose stats are recorded', () => {
    const ids = trackableAchievementIds();
    expect(ids.size).toBeGreaterThan(50);
    expect(ids.size).toBeLessThan(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      if (!ids.has(a.id) || /^(rank|final|points|ach-count)-/.test(a.id)) continue;
      for (const k of statKeysRead(a.condition)) expect(TRACKED_STATS.has(k), `${a.id} reads ${k}`).toBe(true);
    }
  });

  it('drops trophies that read an unrecorded stat', () => {
    const ids = trackableAchievementIds();
    const untracked = ACHIEVEMENTS.filter(a => [...statKeysRead(a.condition)].some(k => k === 'totalMinutes'));
    expect(untracked.length).toBeGreaterThan(0);
    for (const a of untracked) expect(ids.has(a.id)).toBe(false);
  });

  it('meta milestones are only kept when reachable', () => {
    const ids = trackableAchievementIds();
    if (ids.has('final-5000-unlock')) expect(ids.size).toBeGreaterThanOrEqual(5000);
    if (ids.has('rank-eternal')) {
      const pts = ACHIEVEMENTS.filter(a => ids.has(a.id)).reduce((n, a) => n + a.points, 0);
      expect(pts).toBeGreaterThanOrEqual(500000);
    }
  });

  it('always shows earned trophies, even untrackable ones', () => {
    const untracked = ACHIEVEMENTS.find(a => !trackableAchievementIds().has(a.id))!;
    const vis = visibleAchievements(new Set([untracked.id]));
    expect(vis.some(a => a.id === untracked.id)).toBe(true);
    const totals = categoryTotals(new Set([untracked.id]));
    expect(totals[untracked.category].got).toBe(1);
  });

  it('every stat-bump key in the app is listed as tracked', () => {
    const root = join(__dirname, '../../src/renderer');
    const bumped = new Set<string>();
    for (const f of walk(root)) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/dex-stat-bump', \{ detail: \{ key: '([a-zA-Z]+)'/g)) bumped.add(m[1]);
      for (const m of src.matchAll(/incrementStat\([a-zA-Z]+, '([a-zA-Z]+)'/g)) bumped.add(m[1]);
    }
    for (const k of bumped) expect(TRACKED_STATS.has(k), k).toBe(true);
    for (const k of TRACKED_STATS) {
      if (['totalSessions', 'currentStreak', 'longestStreak', 'lastActive', 'firstLaunch', 'nightSessions', 'morningSessions',
        'lunchSessions', 'weekendSessions', 'appsUsed', 'appUsageCounts', 'achievementPoints', 'achievementsUnlocked', 'achievementsViewed'].includes(k)) continue;
      expect(bumped.has(k), `${k} has no writer`).toBe(true);
    }
  });
});

import { CHALLENGE_POOL, isChallengeTrackable, recordChallengeProgress, replaceUntrackable, rollNewDay, type DailyChallengeState } from '../../src/renderer/services/dailyChallenges';

function emptyDay(): DailyChallengeState {
  return { date: '2000-01-01', challenges: [], completedToday: [], totalXP: 0, longestStreak: 0, currentStreak: 0, lastCompletionDate: '', history: [] };
}

describe('daily challenges', () => {
  it('only rolls challenges DEX can advance', () => {
    for (let i = 0; i < 25; i++) {
      const day = rollNewDay(emptyDay());
      expect(day.challenges.length).toBe(3);
      for (const c of day.challenges) expect(isChallengeTrackable(c), c.id).toBe(true);
    }
  });

  it('count challenges advance from the bare target the app reports', () => {
    const launch = CHALLENGE_POOL.find(c => c.condition.target === 'app:launch')!;
    const state = { ...emptyDay(), challenges: [{ ...launch, progress: 0, completed: false }] };
    const { state: next } = recordChallengeProgress(state, 'action_count', 'app:launch', 1);
    expect(next.challenges[0].progress).toBe(1);
  });

  it('swaps untrackable leftovers for trackable ones and keeps progress', () => {
    const dead = CHALLENGE_POOL.find(c => !isChallengeTrackable(c))!;
    const live = CHALLENGE_POOL.find(c => isChallengeTrackable(c))!;
    const state = { ...emptyDay(), challenges: [{ ...dead, progress: 0, completed: false }, { ...live, progress: 1, completed: false }] };
    const next = replaceUntrackable(state);
    expect(next.challenges.length).toBe(2);
    expect(next.challenges.every(isChallengeTrackable)).toBe(true);
    expect(next.challenges.find(c => c.id === live.id)?.progress).toBe(1);
  });
});
