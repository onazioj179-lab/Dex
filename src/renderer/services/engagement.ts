// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Engagement System -- Achievements, Streaks & Tips
 * Now powered by the 5000-achievement catalog. No emojis -- SVG icons only.
 */

import {
  type UserStats, type Achievement, type AchievementCategory,
  ACHIEVEMENTS, DEFAULT_STATS, CATEGORY_META, RARITY_META,
} from './achievementsCatalog';
import { platform } from '../utils';
import { toLocalDateInput } from '../utils/localDate';

// Re-export types and catalog for backward compatibility
export type { UserStats, Achievement, AchievementCategory };
export { ACHIEVEMENTS, DEFAULT_STATS, CATEGORY_META, RARITY_META };

// === Engagement State ===

export interface EngagementState {
  stats: UserStats;
  unlockedAchievements: string[];
  /** Unlock timestamp (ms) per achievement id -- powers "Recently unlocked". */
  unlockedAt?: Record<string, number>;
  lastTipIndex: number;
  dismissedTips: string[];
  /** Set once the meta-trophy repair has run (see repairMetaUnlocks). */
  metaRepairV1?: boolean;
}

const DEFAULT_STATE: EngagementState = {
  stats: { ...DEFAULT_STATS },
  unlockedAchievements: [],
  unlockedAt: {},
  lastTipIndex: -1,
  dismissedTips: [],
};

// === Tips catalog (icon names, no emojis) ===

const _M = platform.isMac ? '⌘' : 'Ctrl';

export const TIPS: { id: string; text: string; icon: string }[] = [
  { id: 'tip-spotlight', text: `Press ${_M}+K to open Spotlight Search -- find anything instantly!`, icon: 'search' },
  { id: 'tip-cmdpalette', text: `Press ${_M}+Shift+P to open the Command Palette for quick actions.`, icon: 'terminal' },
  { id: 'tip-clipboard', text: `${_M}+Shift+V opens Clipboard History -- access your recent copies.`, icon: 'clipboard' },
  { id: 'tip-vinx', text: 'Try VINX Video Editor (Alt+V) for professional editing right in DEX.', icon: 'film' },
  { id: 'tip-imosion', text: 'Imosion DAW (Alt+I) is a full music production studio -- make beats!', icon: 'music' },
  { id: 'tip-prism', text: 'PRISM Image Editor (Alt+R) handles layers, filters, and batch edits.', icon: 'image' },
  { id: 'tip-flux', text: 'FLUX Motion (Alt+F) creates animations and motion graphics.', icon: 'sparkles' },
  { id: 'tip-pin', text: 'Pin your favorite apps on the Home page for lightning-fast access.', icon: 'pin' },
  { id: 'tip-fullscreen', text: 'Press F11 to toggle fullscreen mode for a distraction-free workspace.', icon: 'maximize' },
  { id: 'tip-launchpad', text: 'Use the dock to launch any app -- just one click away.', icon: 'grid' },
  { id: 'tip-passwords', text: 'Use the Password Generator for strong, unique passwords every time.', icon: 'lock' },
  { id: 'tip-workflows', text: 'Automate repetitive tasks with Workflows -- save hours daily.', icon: 'shuffle' },
  { id: 'tip-cal', text: 'Use Calculator (or type math in Spotlight) for instant answers.', icon: 'calculator' },
  { id: 'tip-forge', text: 'FORGE Encoder batch-converts media files -- drag, drop, done!', icon: 'zap' },
  { id: 'tip-sharing', text: 'Share files instantly with AirDrop-style Transfers.', icon: 'share' },
  { id: 'tip-notes', text: 'Notes supports rich text -- bold, lists, and code blocks.', icon: 'file-text' },
  { id: 'tip-darkmode', text: 'DEX looks stunning in dark mode -- customize in Settings.', icon: 'moon' },
  { id: 'tip-streak', text: 'Use DEX daily to build your streak -- unlock special achievements!', icon: 'flame' },
  { id: 'tip-achievements', text: 'Open the Trophies app to see your progress across 5000 achievements!', icon: 'trophy' },
  { id: 'tip-kanban', text: 'Use Kanban boards to organize projects visually.', icon: 'columns' },
  { id: 'tip-shortcuts', text: 'Learn keyboard shortcuts to speed up your workflow dramatically.', icon: 'terminal' },
  { id: 'tip-gallery', text: 'Gallery organizes all your images with smart categorization.', icon: 'image' },
];

// === Persistence ===

const ENGAGEMENT_KEY = 'dex-engagement-state';

export function loadEngagement(): EngagementState {
  try {
    const raw = localStorage.getItem(ENGAGEMENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state: EngagementState = {
        ...DEFAULT_STATE,
        ...parsed,
        stats: { ...DEFAULT_STATS, ...parsed.stats, appUsageCounts: { ...parsed.stats?.appUsageCounts } },
      };
      // One-time repair (owner-approved 2026-11-14): take back meta trophies the
      // old engine unlocked against its own, lower threshold table.
      if (!state.metaRepairV1) {
        const repaired: EngagementState = { ...repairMetaUnlocks(state), metaRepairV1: true };
        saveEngagement(repaired);
        return repaired;
      }
      return state;
    }
  } catch (e) { console.warn('[DEX]', e); }
  return { ...DEFAULT_STATE, stats: { ...DEFAULT_STATS } };
}

export function saveEngagement(state: EngagementState) {
  try { localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(state)); } catch (e) { console.warn('[DEX]', e); }
}

// === Core Functions ===

/** Called on every DEX session start -- updates streak & session count */
export function recordSessionStart(state: EngagementState): EngagementState {
  const today = toLocalDateInput(new Date());
  const lastActive = state.stats.lastActive;
  const stats = { ...state.stats };
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  stats.totalSessions++;

  // Streak logic
  if (lastActive !== today) {
    const yesterday = toLocalDateInput(new Date(Date.now() - 86400000));
    if (lastActive === yesterday) {
      stats.currentStreak++;
    } else if (lastActive !== today) {
      stats.currentStreak = 1;
    }
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  }
  stats.lastActive = today;

  // Time-of-day tracking
  if (hour >= 0 && hour < 6) stats.nightSessions++;
  if (hour >= 5 && hour < 8) stats.morningSessions++;
  if (hour >= 12 && hour < 13) stats.lunchSessions++;
  if (dayOfWeek === 0 || dayOfWeek === 6) stats.weekendSessions++;

  return { ...state, stats };
}

/** Record that a specific app was used */
export function recordAppUsage(state: EngagementState, appId: string): EngagementState {
  const stats = { ...state.stats };
  const counts = { ...stats.appUsageCounts };
  counts[appId] = (counts[appId] || 0) + 1;
  stats.appUsageCounts = counts;

  if (!stats.appsUsed.includes(appId)) {
    stats.appsUsed = [...stats.appsUsed, appId];
  }
  return { ...state, stats };
}

/** Increment a specific stat counter */
export function incrementStat(
  state: EngagementState,
  key: keyof UserStats,
  amount = 1
): EngagementState {
  const stats = { ...state.stats };
  if (typeof stats[key] === 'number') {
    (stats[key] as number) += amount;
  }
  return { ...state, stats };
}

/** Set a stat to a specific value (for best scores) */
export function setStat(
  state: EngagementState,
  key: keyof UserStats,
  value: number
): EngagementState {
  return { ...state, stats: { ...state.stats, [key]: value } };
}

/** Check all achievements against current stats, return newly unlocked ones */
export function checkAchievements(
  state: EngagementState,
  totalPoints?: number,
): { state: EngagementState; newUnlocks: Achievement[] } {
  const newUnlocks: Achievement[] = [];
  // Trophies › "Track progress" off: nothing new unlocks (existing trophies stay).
  try { if (JSON.parse(localStorage.getItem('dex-settings') || '{}').achievementsEnabled === false) return { state, newUnlocks }; } catch { /* storage blocked */ }
  const unlockedSet = new Set(state.unlockedAchievements); // O(1) has() vs O(n) includes()
  let unlocked = [...state.unlockedAchievements];
  const unlockedAt: Record<string, number> = { ...(state.unlockedAt || {}) };
  const now = Date.now();
  const unlockedCount = unlocked.length;
  const pts = totalPoints ?? getTotalPoints(unlocked);
  const derivedStats = { ...state.stats, achievementPoints: pts, achievementsUnlocked: unlockedCount };

  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) continue;

    let passes = false;
    if (ach.id.startsWith('ach-count-') || ach.id.startsWith('points-')) {
      // The catalog's own threshold (the one its description shows). The engine
      // used to keep a second table that disagreed: "Earn 10,000 points"
      // unlocked at 2,500.
      passes = ach.condition(derivedStats);
    } else if (ach.id.startsWith('final-') && ach.id.includes('-unlock')) {
      const num = parseInt(ach.id.replace('final-', '').replace('-unlock', '')) || 0;
      passes = unlockedCount >= num;
    } else if (ach.id.startsWith('final-') && ach.id.includes('-pts')) {
      const label = ach.id.replace('final-', '').replace('-pts', '');
      const ptMap: Record<string, number> = { '10k': 10000, '25k': 25000, '50k': 50000, '100k': 100000 };
      passes = pts >= (ptMap[label] || 999999);
    } else if (ach.id === 'final-all-categories') {
      const cats = Object.keys(CATEGORY_META);
      passes = cats.every(c => ACHIEVEMENTS.filter(a => a.category === c && unlockedSet.has(a.id)).length >= 100);
    } else if (ach.id.startsWith('rank-')) {
      const rank = getUserRank(pts);
      const rankMap: Record<string, string> = {
        'rank-beginner': 'Beginner', 'rank-regular': 'Regular', 'rank-pro': 'Pro',
        'rank-expert': 'Expert', 'rank-legend': 'Legend', 'rank-champion': 'Champion',
        'rank-transcend': 'Transcendent', 'rank-grandmaster': 'Grandmaster',
        'rank-titan': 'Titan', 'rank-mythical': 'Mythical',
        'rank-celestial': 'Celestial', 'rank-eternal': 'Eternal',
      };
      passes = rank.title === rankMap[ach.id] || false;
    } else {
      passes = ach.condition(state.stats);
    }

    if (passes) {
      unlocked.push(ach.id);
      unlockedSet.add(ach.id);
      unlockedAt[ach.id] = now;
      newUnlocks.push(ach);
    }
  }

  return {
    state: { ...state, unlockedAchievements: unlocked, unlockedAt },
    newUnlocks,
  };
}

/** Get today's tip-of-the-day */
export function getTipOfDay(state: EngagementState): { id: string; text: string; icon: string } | null {
  const available = TIPS.filter(t => !state.dismissedTips.includes(t.id));
  if (available.length === 0) return null;

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return available[dayOfYear % available.length];
}

/** Get total points from unlocked achievements */
export function getTotalPoints(unlocked: string[]): number {
  const set = new Set(unlocked);
  return ACHIEVEMENTS.filter(a => set.has(a.id)).reduce((sum, a) => sum + a.points, 0);
}

/** Get user rank based on points -- no emojis, icon names only */
export function getUserRank(points: number): { title: string; icon: string; next: string; pointsNeeded: number; level: number } {
  if (points >= 500000) return { title: 'Eternal',       icon: 'infinity',  next: 'Max rank!',     pointsNeeded: 0, level: 12 };
  if (points >= 250000) return { title: 'Celestial',     icon: 'sparkles',  next: 'Eternal',       pointsNeeded: 500000 - points, level: 11 };
  if (points >= 100000) return { title: 'Mythical',      icon: 'flame',     next: 'Celestial',     pointsNeeded: 250000 - points, level: 10 };
  if (points >= 50000)  return { title: 'Titan',         icon: 'mountain',  next: 'Mythical',      pointsNeeded: 100000 - points, level: 9 };
  if (points >= 25000)  return { title: 'Grandmaster',   icon: 'trophy',    next: 'Titan',         pointsNeeded: 50000 - points, level: 8 };
  if (points >= 15000)  return { title: 'Transcendent',  icon: 'diamond',   next: 'Grandmaster',   pointsNeeded: 25000 - points, level: 7 };
  if (points >= 8000)   return { title: 'Champion',      icon: 'shield',    next: 'Transcendent',  pointsNeeded: 15000 - points, level: 6 };
  if (points >= 4000)   return { title: 'Legend',         icon: 'crown',     next: 'Champion',      pointsNeeded: 8000 - points, level: 5 };
  if (points >= 2000)   return { title: 'Expert',         icon: 'award',     next: 'Legend',         pointsNeeded: 4000 - points, level: 4 };
  if (points >= 800)    return { title: 'Pro',            icon: 'star',      next: 'Expert',         pointsNeeded: 2000 - points, level: 3 };
  if (points >= 250)    return { title: 'Regular',        icon: 'shield',    next: 'Pro',            pointsNeeded: 800 - points, level: 2 };
  if (points >= 50)     return { title: 'Beginner',       icon: 'seedling',  next: 'Regular',        pointsNeeded: 250 - points, level: 1 };
  return { title: 'Newcomer', icon: 'hand-wave', next: 'Beginner', pointsNeeded: 50 - points, level: 0 };
}

const RANK_POINTS: Record<string, number> = {
  'rank-beginner': 50, 'rank-regular': 250, 'rank-pro': 800, 'rank-expert': 2000,
  'rank-legend': 4000, 'rank-champion': 8000, 'rank-transcend': 15000, 'rank-grandmaster': 25000,
  'rank-titan': 50000, 'rank-mythical': 100000, 'rank-celestial': 250000, 'rank-eternal': 500000,
};
const FINAL_PTS: Record<string, number> = { '10k': 10000, '25k': 25000, '50k': 50000, '100k': 100000 };

/**
 * Drop meta trophies (points tiers, trophy-count tiers, rank and "final" point /
 * count milestones) that the current points and unlock count don't earn. Runs to
 * a fixed point, because taking one back lowers the points that earned others.
 * Non-meta trophies are never touched.
 */
export function repairMetaUnlocks(state: EngagementState): EngagementState {
  let unlocked = [...state.unlockedAchievements];
  const byId = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
  for (let pass = 0; pass < 50; pass++) {
    const pts = getTotalPoints(unlocked);
    const count = unlocked.length;
    const derived = { ...state.stats, achievementPoints: pts, achievementsUnlocked: count };
    const next = unlocked.filter(id => {
      if (id.startsWith('points-') || id.startsWith('ach-count-')) {
        const a = byId.get(id);
        return a ? a.condition(derived) : true;
      }
      if (id in RANK_POINTS) return pts >= RANK_POINTS[id];
      if (id.startsWith('final-') && id.endsWith('-pts')) {
        const need = FINAL_PTS[id.replace('final-', '').replace('-pts', '')];
        return need === undefined || pts >= need;
      }
      if (id.startsWith('final-') && id.endsWith('-unlock')) {
        const need = parseInt(id.replace('final-', '').replace('-unlock', ''), 10) || 0;
        return count >= need;
      }
      return true;
    });
    if (next.length === unlocked.length) break;
    unlocked = next;
  }
  if (unlocked.length === state.unlockedAchievements.length) return state;
  const keep = new Set(unlocked);
  const unlockedAt = Object.fromEntries(Object.entries(state.unlockedAt || {}).filter(([id]) => keep.has(id)));
  return { ...state, unlockedAchievements: unlocked, unlockedAt };
}

/** Get achievement stats summary */
export function getAchievementStats(unlocked: string[]) {
  const set = new Set(unlocked);
  const points = getTotalPoints(unlocked);
  const rank = getUserRank(points);
  const byCategory: Record<string, { unlocked: number; total: number }> = {};

  for (const cat of Object.keys(CATEGORY_META) as AchievementCategory[]) {
    const total = ACHIEVEMENTS.filter(a => a.category === cat).length;
    const unl = ACHIEVEMENTS.filter(a => a.category === cat && set.has(a.id)).length;
    byCategory[cat] = { unlocked: unl, total };
  }

  return {
    totalUnlocked: unlocked.length,
    totalAchievements: ACHIEVEMENTS.length,
    points,
    rank,
    byCategory,
    completionPercent: Math.round((unlocked.length / ACHIEVEMENTS.length) * 100),
  };
}
