// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Which trophies can DEX actually award?
 *
 * The catalog (achievementsCatalog.ts) defines ~200 usage stats and thousands of
 * trophies, but only the stats listed in TRACKED_STATS are ever recorded by a
 * real user action (the `dex-stat-bump` bus, session start, app usage). A
 * trophy that reads any other stat can never unlock, so showing it -- and
 * counting it in "N of M" and the completion ring -- is fake progress.
 *
 * This module probes each trophy's condition/progress closure with a recording
 * Proxy to learn which stats it reads, and keeps only trophies whose every stat
 * is recorded. Meta trophies (points / count / rank / "final" milestones) are
 * kept only when their threshold is reachable from the trackable set.
 *
 * When an app starts recording a new stat, add its key to TRACKED_STATS and the
 * trophies that depend on it appear automatically.
 */

import { ACHIEVEMENTS, CATEGORY_META, DEFAULT_STATS, type Achievement, type AchievementCategory, type UserStats } from './achievementsCatalog';

/**
 * Stats with a real writer. Keep in sync with the `dex-stat-bump` dispatchers,
 * incrementStat callers, and engagement.ts (recordSessionStart/recordAppUsage).
 * tests/unit/achievement-tracking.test.ts greps the source tree to enforce it.
 */
export const TRACKED_STATS: ReadonlySet<string> = new Set<string>([
  // engagement.ts: recordSessionStart / recordAppUsage / defaults
  'totalSessions', 'currentStreak', 'longestStreak', 'lastActive', 'firstLaunch',
  'nightSessions', 'morningSessions', 'lunchSessions', 'weekendSessions',
  'appsUsed', 'appUsageCounts',
  // derived from the unlocked set by the engine
  'achievementPoints', 'achievementsUnlocked',
  // Trophies app
  'achievementsViewed',
  // dex-stat-bump / incrementStat callers in apps
  'animationsCreated', 'audioTracksPlayed', 'axlExports', 'axlImports',
  'bookmarksCreated', 'browserTabsOpened', 'calendarEventsCreated', 'easterEggsFound',
  'filesConverted', 'filesOpened', 'galleryItemsViewed', 'imagesEdited',
  'kanbanCardsCreated', 'musicTracksCreated', 'notesCreated', 'passwordsGenerated',
  'tasksCompleted', 'tasksCreated', 'videosEdited', 'workflowsCreated',
]);

/** Engine-awarded rank trophies and the points each needs (engagement.checkAchievements). */
export const RANK_POINTS: Record<string, number> = {
  'rank-beginner': 50, 'rank-regular': 250, 'rank-pro': 800, 'rank-expert': 2000,
  'rank-legend': 4000, 'rank-champion': 8000, 'rank-transcend': 15000, 'rank-grandmaster': 25000,
  'rank-titan': 50000, 'rank-mythical': 100000, 'rank-celestial': 250000, 'rank-eternal': 500000,
};

/** Engine-awarded "final-<label>-pts" milestones. */
export const FINAL_PTS: Record<string, number> = { '10k': 10000, '25k': 25000, '50k': 50000, '100k': 100000 };

const META_KEYS = new Set(['achievementPoints', 'achievementsUnlocked']);

/** The top-level stat keys a closure reads, probed with low and high values. */
export function statKeysRead(fn: ((s: UserStats) => unknown) | undefined): Set<string> {
  const keys = new Set<string>();
  if (!fn) return keys;
  const high = new Proxy({}, { get: () => 1e12 }) as Record<string, number>;
  const probe = (fill: (k: string) => unknown) => {
    const proxy = new Proxy({} as UserStats, {
      get(_t, k) {
        if (typeof k !== 'string') return undefined;
        keys.add(k);
        return fill(k);
      },
    });
    try { fn(proxy); } catch { /* a closure that throws on probe data reads nothing more */ }
  };
  probe((k) => (DEFAULT_STATS as unknown as Record<string, unknown>)[k] ?? 0);
  probe((k) => {
    const d = (DEFAULT_STATS as unknown as Record<string, unknown>)[k];
    if (Array.isArray(d)) return new Array(1000).fill('');
    if (d && typeof d === 'object') return high;
    if (typeof d === 'string') return d;
    return 1e12;
  });
  return keys;
}

function isMetaId(id: string): boolean {
  return id.startsWith('rank-') || id.startsWith('final-') || id.startsWith('points-') || id.startsWith('ach-count-');
}

/** Non-meta trophy: every stat it reads has a real writer. */
function isBaseTrackable(a: Achievement): boolean {
  const keys = statKeysRead(a.condition);
  for (const k of statKeysRead(a.progress)) keys.add(k);
  if (keys.size === 0) return false; // e.g. `condition: () => false` with no engine path
  for (const k of keys) {
    if (META_KEYS.has(k)) return false; // meta-dependent: handled by the meta pass
    if (!TRACKED_STATS.has(k)) return false;
  }
  return true;
}

function computeTrackable(): Set<string> {
  const ids = new Set<string>();
  let points = 0;
  const perCategory: Record<string, number> = {};
  const add = (a: Achievement) => {
    ids.add(a.id);
    points += a.points;
    perCategory[a.category] = (perCategory[a.category] ?? 0) + 1;
  };
  for (const a of ACHIEVEMENTS) if (!isMetaId(a.id) && isBaseTrackable(a)) add(a);

  // Meta trophies: reachable only when the trackable set can earn their threshold.
  // Adding one raises the reachable totals, so iterate to a fixed point.
  const metas = ACHIEVEMENTS.filter(a => !ids.has(a.id));
  for (let pass = 0; pass < 20; pass++) {
    let grew = false;
    for (const a of metas) {
      if (ids.has(a.id)) continue;
      let ok = false;
      if (a.id in RANK_POINTS) ok = points >= RANK_POINTS[a.id];
      else if (/^final-.+-pts$/.test(a.id)) {
        const need = FINAL_PTS[a.id.slice(6, -4)];
        ok = need !== undefined && points >= need;
      } else if (/^final-\d+-unlock$/.test(a.id)) ok = ids.size >= parseInt(a.id.slice(6), 10);
      else if (a.id === 'final-all-categories') ok = (Object.keys(CATEGORY_META)).every(c => (perCategory[c] ?? 0) >= 100);
      else if (a.id.startsWith('points-') || a.id.startsWith('ach-count-')) {
        const keys = statKeysRead(a.progress ?? a.condition);
        const p = a.progress?.({ ...DEFAULT_STATS, achievementPoints: 0, achievementsUnlocked: 0 });
        const onlyMeta = keys.size > 0 && [...keys].every(k => META_KEYS.has(k) || TRACKED_STATS.has(k));
        if (onlyMeta && p) ok = keys.has('achievementPoints') ? points >= p.target : ids.size >= p.target;
      }
      // Anything else here either reads an unrecorded stat, or reads the derived
      // points/count, which the engine only supplies to points-/ach-count- ids.
      if (ok) { add(a); grew = true; }
    }
    if (!grew) break;
  }
  return ids;
}

let cached: Set<string> | null = null;

/** Ids of every trophy DEX can actually award today. */
export function trackableAchievementIds(): ReadonlySet<string> {
  if (!cached) cached = computeTrackable();
  return cached;
}

/** True when DEX records everything this trophy needs. */
export function isAchievementTrackable(a: Achievement): boolean {
  return trackableAchievementIds().has(a.id);
}

/**
 * The trophies to show and count: every trackable one, plus anything already
 * earned (an earned trophy is real history even if its stat lost its writer).
 */
export function visibleAchievements(unlocked: ReadonlySet<string> | readonly string[]): Achievement[] {
  const has = unlocked instanceof Set ? unlocked : new Set(unlocked as readonly string[]);
  const ids = trackableAchievementIds();
  return ACHIEVEMENTS.filter(a => ids.has(a.id) || has.has(a.id));
}

/** Per-category totals over the visible set. */
export function categoryTotals(unlocked: ReadonlySet<string>): Record<AchievementCategory, { got: number; total: number }> {
  const out = {} as Record<AchievementCategory, { got: number; total: number }>;
  for (const c of Object.keys(CATEGORY_META) as AchievementCategory[]) out[c] = { got: 0, total: 0 };
  for (const a of visibleAchievements(unlocked)) {
    const row = out[a.category];
    if (!row) continue;
    row.total++;
    if (unlocked.has(a.id)) row.got++;
  }
  return out;
}

/** Test hook: forget the cached trackable set. */
export function _resetTrackableCache(): void { cached = null; }
