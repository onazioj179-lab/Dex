/**
 * DEX Engagement System -- Achievements, Streaks & Tips
 * Now powered by the 500-achievement catalog. No emojis -- SVG icons only.
 */

import {
  type UserStats, type Achievement, type AchievementCategory,
  ACHIEVEMENTS, DEFAULT_STATS, CATEGORY_META, RARITY_META,
} from './achievementsCatalog';

// Re-export types and catalog for backward compatibility
export type { UserStats, Achievement, AchievementCategory };
export { ACHIEVEMENTS, DEFAULT_STATS, CATEGORY_META, RARITY_META };

// === Engagement State ===

export interface EngagementState {
  stats: UserStats;
  unlockedAchievements: string[];
  lastTipIndex: number;
  dismissedTips: string[];
}

const DEFAULT_STATE: EngagementState = {
  stats: { ...DEFAULT_STATS },
  unlockedAchievements: [],
  lastTipIndex: -1,
  dismissedTips: [],
};

// === Tips catalog (icon names, no emojis) ===

export const TIPS: { id: string; text: string; icon: string }[] = [
  { id: 'tip-spotlight', text: 'Press Ctrl+Space to open Spotlight Search -- find anything instantly!', icon: 'search' },
  { id: 'tip-cmdpalette', text: 'Press Ctrl+Shift+P to open the Command Palette for quick actions.', icon: 'terminal' },
  { id: 'tip-clipboard', text: 'Ctrl+Shift+V opens Clipboard History -- access your recent copies.', icon: 'clipboard' },
  { id: 'tip-vinx', text: 'Try VINX Video Editor (Alt+V) for professional editing right in DEX.', icon: 'film' },
  { id: 'tip-imosion', text: 'Imosion DAW (Alt+I) is a full music production studio -- make beats!', icon: 'music' },
  { id: 'tip-prism', text: 'PRISM Image Editor (Alt+R) handles layers, filters, and batch edits.', icon: 'image' },
  { id: 'tip-flux', text: 'FLUX Motion (Alt+F) creates animations and motion graphics.', icon: 'sparkles' },
  { id: 'tip-rewind', text: 'Rewind acts like a DVR for your computer -- replay your activity!', icon: 'rewind' },
  { id: 'tip-games', text: 'Play brain games in the Games app to sharpen your mind.', icon: 'gamepad' },
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
  { id: 'tip-achievements', text: 'Open the Trophies app to see your progress across 500 achievements!', icon: 'trophy' },
  { id: 'tip-kanban', text: 'Use Kanban boards to organize projects visually.', icon: 'columns' },
  { id: 'tip-rewind2', text: 'Rewind captures snapshots so you can jump back in time.', icon: 'clock' },
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
      return {
        ...DEFAULT_STATE,
        ...parsed,
        stats: { ...DEFAULT_STATS, ...parsed.stats, appUsageCounts: { ...parsed.stats?.appUsageCounts } },
      };
    }
  } catch {}
  return { ...DEFAULT_STATE, stats: { ...DEFAULT_STATS } };
}

export function saveEngagement(state: EngagementState) {
  try { localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(state)); } catch {}
}

// === Core Functions ===

/** Called on every DEX session start -- updates streak & session count */
export function recordSessionStart(state: EngagementState): EngagementState {
  const today = new Date().toISOString().split('T')[0];
  const lastActive = state.stats.lastActive;
  const stats = { ...state.stats };
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  stats.totalSessions++;

  // Streak logic
  if (lastActive !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
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
    (stats as any)[key] = (stats[key] as number) + amount;
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
  let unlocked = [...state.unlockedAchievements];
  const unlockedCount = unlocked.length;
  const pts = totalPoints ?? getTotalPoints(unlocked);

  for (const ach of ACHIEVEMENTS) {
    if (unlocked.includes(ach.id)) continue;

    let passes = false;
    if (ach.id.startsWith('ach-count-')) {
      const idx = parseInt(ach.id.split('-').pop() || '0') - 1;
      const thresholds = [10, 25, 50, 100, 200, 300, 400, 500];
      passes = unlockedCount >= (thresholds[idx] || 999);
    } else if (ach.id.startsWith('points-')) {
      const idx = parseInt(ach.id.split('-').pop() || '0') - 1;
      const thresholds = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
      passes = pts >= (thresholds[idx] || 999999);
    } else if (ach.id.startsWith('rank-')) {
      const rank = getUserRank(pts);
      const rankMap: Record<string, string> = {
        'rank-beginner': 'Beginner', 'rank-regular': 'Regular', 'rank-pro': 'Pro',
        'rank-expert': 'Expert', 'rank-legend': 'Legend', 'rank-transcend': 'Transcendent',
      };
      passes = rank.title === rankMap[ach.id] || false;
    } else {
      passes = ach.condition(state.stats);
    }

    if (passes) {
      unlocked.push(ach.id);
      newUnlocks.push(ach);
    }
  }

  return {
    state: { ...state, unlockedAchievements: unlocked },
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
  return ACHIEVEMENTS.filter(a => unlocked.includes(a.id)).reduce((sum, a) => sum + a.points, 0);
}

/** Get user rank based on points -- no emojis, icon names only */
export function getUserRank(points: number): { title: string; icon: string; next: string; pointsNeeded: number; level: number } {
  if (points >= 5000)  return { title: 'Transcendent', icon: 'diamond',  next: 'Max rank!',    pointsNeeded: 0, level: 6 };
  if (points >= 2000)  return { title: 'Legend',       icon: 'crown',    next: 'Transcendent', pointsNeeded: 5000 - points, level: 5 };
  if (points >= 800)   return { title: 'Expert',       icon: 'award',    next: 'Legend',        pointsNeeded: 2000 - points, level: 4 };
  if (points >= 300)   return { title: 'Pro',          icon: 'star',     next: 'Expert',        pointsNeeded: 800 - points, level: 3 };
  if (points >= 100)   return { title: 'Regular',      icon: 'shield',   next: 'Pro',           pointsNeeded: 300 - points, level: 2 };
  if (points >= 25)    return { title: 'Beginner',     icon: 'seedling', next: 'Regular',       pointsNeeded: 100 - points, level: 1 };
  return { title: 'Newcomer', icon: 'hand-wave', next: 'Beginner', pointsNeeded: 25 - points, level: 0 };
}

/** Get achievement stats summary */
export function getAchievementStats(unlocked: string[]) {
  const points = getTotalPoints(unlocked);
  const rank = getUserRank(points);
  const byCategory: Record<string, { unlocked: number; total: number }> = {};

  for (const cat of Object.keys(CATEGORY_META) as AchievementCategory[]) {
    const total = ACHIEVEMENTS.filter(a => a.category === cat).length;
    const unl = ACHIEVEMENTS.filter(a => a.category === cat && unlocked.includes(a.id)).length;
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
