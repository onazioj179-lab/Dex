// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

type Entry = {
  id: string;
  type: 'app' | 'clipboard' | 'file' | 'browser' | 'dex' | 'screenshot';
  content: string;
  appName: string;
  timestamp: number;
  metadata: Record<string, any>;
};

type FocusSession = {
  id: string;
  date: string;
  goal: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  focusScore: number;
  distractions: string[];
};

function dayStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayName(index: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index] || 'Unknown';
}

function loadEntries(rewindDir: string, days = 30): Entry[] {
  const result: Entry[] = [];
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(rewindDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();

  for (const file of files) {
    const fp = path.join(rewindDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8')) as { entries: Entry[] };
      for (const entry of data.entries || []) {
        if (entry.timestamp >= cutoff) {
          result.push(entry);
        }
      }
    } catch {
      continue;
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

function loadFocusSessions(rewindDir: string): FocusSession[] {
  const fp = path.join(rewindDir, 'focus-sessions.json');
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8')) as { sessions: FocusSession[] };
    return (raw.sessions || []).sort((a, b) => a.startTs - b.startTs);
  } catch {
    return [];
  }
}

function appDurations(entries: Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  let prev: Entry | null = null;
  for (const entry of entries) {
    if (entry.type !== 'app' && entry.type !== 'browser') continue;
    if (prev) {
      const diff = Math.min(Math.max(entry.timestamp - prev.timestamp, 0), 10 * 60 * 1000);
      map.set(prev.appName || 'Unknown', (map.get(prev.appName || 'Unknown') || 0) + diff);
    }
    prev = entry;
  }
  return map;
}

function buildProductivity(entries: Entry[], sessions: FocusSession[]) {
  const dayActiveMs = new Map<string, number>();
  const dayFiles = new Map<string, number>();
  const dayFocus = new Map<string, number>();

  let prev: Entry | null = null;
  for (const entry of entries) {
    const ds = dayStr(entry.timestamp);
    if (entry.type === 'file') {
      dayFiles.set(ds, (dayFiles.get(ds) || 0) + 1);
    }

    if ((entry.type === 'app' || entry.type === 'browser') && prev) {
      const diff = Math.min(Math.max(entry.timestamp - prev.timestamp, 0), 10 * 60 * 1000);
      dayActiveMs.set(dayStr(prev.timestamp), (dayActiveMs.get(dayStr(prev.timestamp)) || 0) + diff);
    }

    if (entry.type === 'app' || entry.type === 'browser') {
      prev = entry;
    }
  }

  for (const s of sessions) {
    dayFocus.set(s.date, (dayFocus.get(s.date) || 0) + 1);
  }

  const days: { date: string; activeHours: number; filesTouched: number; focusSessions: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const ds = dayStr(d.getTime());
    days.push({
      date: ds,
      activeHours: Number(((dayActiveMs.get(ds) || 0) / 3600000).toFixed(2)),
      filesTouched: dayFiles.get(ds) || 0,
      focusSessions: dayFocus.get(ds) || 0,
    });
  }

  const weekBuckets: number[] = [0, 0, 0, 0];
  const sessionGroups: number[] = [0, 0, 0, 0];
  const recentSessions = sessions.slice(-120);
  for (const s of recentSessions) {
    const wk = Math.max(0, Math.min(3, 3 - Math.floor((Date.now() - s.startTs) / (7 * 24 * 60 * 60 * 1000))));
    weekBuckets[wk] += s.durationMs;
    sessionGroups[wk] += 1;
  }
  const averageSessionTrendWeeks = weekBuckets.map((total, idx) => ({
    weekIndex: idx,
    averageMinutes: sessionGroups[idx] > 0 ? Math.round(total / sessionGroups[idx] / 60000) : 0,
  }));

  const dowMs = new Array(7).fill(0);
  for (const item of days) {
    const dow = new Date(item.date).getDay();
    dowMs[dow] += item.activeHours * 3600000;
  }
  const bestDow = dowMs.indexOf(Math.max(...dowMs));

  let longestStreakMs = 0;
  let currentStreakMs = 0;
  let lastTs = 0;
  for (const entry of entries) {
    if (entry.type !== 'app' && entry.type !== 'browser') continue;
    if (lastTs === 0) {
      currentStreakMs = 0;
      lastTs = entry.timestamp;
      continue;
    }
    const gap = entry.timestamp - lastTs;
    if (gap <= 5 * 60 * 1000) {
      currentStreakMs += gap;
      if (currentStreakMs > longestStreakMs) longestStreakMs = currentStreakMs;
    } else {
      currentStreakMs = 0;
    }
    lastTs = entry.timestamp;
  }

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeek = { activeMs: 0, files: 0, focus: 0 };
  const lastWeek = { activeMs: 0, files: 0, focus: 0 };

  for (const entry of entries) {
    if (entry.timestamp >= weekStart.getTime()) {
      if (entry.type === 'file') thisWeek.files += 1;
    } else if (entry.timestamp >= lastWeekStart.getTime() && entry.timestamp < weekStart.getTime()) {
      if (entry.type === 'file') lastWeek.files += 1;
    }
  }

  for (const day of days) {
    const ts = new Date(day.date).getTime();
    if (ts >= weekStart.getTime()) thisWeek.activeMs += day.activeHours * 3600000;
    if (ts >= lastWeekStart.getTime() && ts < weekStart.getTime()) lastWeek.activeMs += day.activeHours * 3600000;
  }

  for (const s of sessions) {
    if (s.startTs >= weekStart.getTime()) thisWeek.focus += 1;
    if (s.startTs >= lastWeekStart.getTime() && s.startTs < weekStart.getTime()) lastWeek.focus += 1;
  }

  return {
    dailyActiveHours30d: days.map(d => ({ date: d.date, hours: d.activeHours })),
    averageSessionLengthTrend4w: averageSessionTrendWeeks,
    mostProductiveDayOfWeek: weekdayName(bestDow),
    longestUninterruptedFocusStreakMinutes: Math.round(longestStreakMs / 60000),
    weekComparison: {
      thisWeek: {
        activeHours: Number((thisWeek.activeMs / 3600000).toFixed(2)),
        filesTouched: thisWeek.files,
        focusSessionsCompleted: thisWeek.focus,
      },
      lastWeek: {
        activeHours: Number((lastWeek.activeMs / 3600000).toFixed(2)),
        filesTouched: lastWeek.files,
        focusSessionsCompleted: lastWeek.focus,
      },
    },
  };
}

function buildAppUsage(entries: Entry[]) {
  const durations = appDurations(entries);
  const ranked = Array.from(durations.entries())
    .map(([appName, ms]) => ({ appName, totalMinutes: Math.round(ms / 60000) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const top8 = ranked.slice(0, 8);

  const weekdayWeekend = new Map<string, { weekdayMinutes: number; weekendMinutes: number }>();
  let prev: Entry | null = null;
  for (const entry of entries) {
    if (entry.type !== 'app' && entry.type !== 'browser') continue;
    if (prev) {
      const diff = Math.min(Math.max(entry.timestamp - prev.timestamp, 0), 10 * 60 * 1000);
      const dow = new Date(prev.timestamp).getDay();
      const key = prev.appName || 'Unknown';
      const current = weekdayWeekend.get(key) || { weekdayMinutes: 0, weekendMinutes: 0 };
      if (dow === 0 || dow === 6) current.weekendMinutes += diff / 60000;
      else current.weekdayMinutes += diff / 60000;
      weekdayWeekend.set(key, current);
    }
    prev = entry;
  }

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wk1 = new Map<string, number>();
  const wk2 = new Map<string, number>();

  prev = null;
  for (const entry of entries) {
    if (entry.type !== 'app' && entry.type !== 'browser') continue;
    if (prev) {
      const diff = Math.min(Math.max(entry.timestamp - prev.timestamp, 0), 10 * 60 * 1000);
      const app = prev.appName || 'Unknown';
      if (prev.timestamp >= oneWeekAgo) wk2.set(app, (wk2.get(app) || 0) + diff);
      else if (prev.timestamp >= twoWeeksAgo) wk1.set(app, (wk1.get(app) || 0) + diff);
    }
    prev = entry;
  }

  const increasedUsage = Array.from(wk2.entries())
    .map(([appName, ms]) => {
      const prevMs = wk1.get(appName) || 0;
      if (prevMs <= 0 || ms <= prevMs) return null;
      return {
        appName,
        increasePercent: Math.round(((ms - prevMs) / prevMs) * 100),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as Array<{ appName: string; increasePercent: number }>;

  return {
    rankedApps30d: ranked,
    donutTop8: top8,
    weekdayWeekendBreakdown: Array.from(weekdayWeekend.entries()).map(([appName, v]) => ({
      appName,
      weekdayMinutes: Math.round(v.weekdayMinutes),
      weekendMinutes: Math.round(v.weekendMinutes),
    })),
    increasedUsage,
  };
}

function buildPatterns(entries: Entry[], learningData: any) {
  const topSearchQueries = ((learningData?.searchBoosts || []) as Array<any>)
    .sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0))
    .slice(0, 5)
    .map(item => ({
      query: item.query,
      clickedEntryIds: item.clickedEntryIds || [],
      searchCount: item.searchCount || 0,
    }));

  const heatmap = new Array(7).fill(0).map(() => new Array(24).fill(0));
  for (const entry of entries) {
    const d = new Date(entry.timestamp);
    heatmap[d.getDay()][d.getHours()] += 1;
  }

  return {
    sequences: learningData?.sequences || [],
    peakWindow: (learningData?.peakWindows || [])[new Date().getDay()] || null,
    topSearchQueries,
    heatmap,
  };
}

function buildFocusHistory(sessions: FocusSession[]) {
  const sorted = [...sessions].sort((a, b) => a.startTs - b.startTs);
  const trend = sorted.map(s => ({ ts: s.startTs, score: s.focusScore }));

  const withinDays = (days: number) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const subset = sorted.filter(s => s.startTs >= cutoff);
    if (subset.length === 0) return 0;
    return Number((subset.reduce((sum, s) => sum + s.focusScore, 0) / subset.length).toFixed(1));
  };

  const allTime = sorted.length > 0
    ? Number((sorted.reduce((sum, s) => sum + s.focusScore, 0) / sorted.length).toFixed(1))
    : 0;

  const distractions = new Map<string, number>();
  for (const s of sorted) {
    for (const d of s.distractions || []) {
      distractions.set(d, (distractions.get(d) || 0) + 1);
    }
  }

  return {
    sessions: sorted.map(s => ({
      date: s.date,
      goal: s.goal,
      durationMinutes: Math.round(s.durationMs / 60000),
      focusScore: s.focusScore,
      distractionCount: (s.distractions || []).length,
      distractions: s.distractions || [],
    })),
    focusScoreTrend: trend,
    averages: {
      last7Days: withinDays(7),
      last30Days: withinDays(30),
      allTime,
    },
    topDistractions: Array.from(distractions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([appName, count]) => ({ appName, count })),
  };
}

parentPort?.on('message', ({ rewindDir }: { rewindDir: string }) => {
  const entries = loadEntries(rewindDir, 30);
  const sessions = loadFocusSessions(rewindDir);
  const learningPath = path.join(rewindDir, 'learning-data.json');
  const learningData = fs.existsSync(learningPath)
    ? JSON.parse(fs.readFileSync(learningPath, 'utf-8'))
    : {};

  const analytics = {
    computedAt: Date.now(),
    productivity: buildProductivity(entries, sessions),
    appUsage: buildAppUsage(entries),
    patterns: buildPatterns(entries, learningData),
    focusHistory: buildFocusHistory(sessions),
  };

  parentPort?.postMessage(analytics);
});
