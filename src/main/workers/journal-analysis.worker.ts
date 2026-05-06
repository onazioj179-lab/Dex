/**
 * DEX Journal Analysis Worker
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Runs heavy analysis computations off the main thread:
 * - Weekly report generation
 * - Cross-app pattern detection
 * - Usage anomaly detection
 *
 * Communicates with the main process via worker_threads messages.
 */

import { parentPort } from 'worker_threads';

// ---------------------------------------------------------------------------
// Types (duplicated from JournalAnalysisEngine to avoid cross-module deps)
// ---------------------------------------------------------------------------

interface JournalRow {
  id: number;
  app: string;
  action: string;
  detail: string | null;
  timestamp: number;
  session_id: string;
  cleared: number;
}

interface WeeklyReport {
  periodStart: number;
  periodEnd: number;
  generatedAt: number;
  totalEntries: number;
  uniqueApps: number;
  uniqueSessions: number;
  topApps: { app: string; count: number; percentage: number }[];
  topActions: { action: string; count: number }[];
  dailyBreakdown: { date: string; count: number; apps: string[] }[];
  summary: string;
  averageEntriesPerDay: number;
  peakDay: { date: string; count: number } | null;
  quietDay: { date: string; count: number } | null;
}

interface CrossAppPattern {
  id: string;
  apps: string[];
  actions: string[];
  frequency: number;
  lastSeen: number;
  description: string;
  averageGapMs: number;
}

interface UsageAnomaly {
  id: string;
  type: 'spike' | 'drop' | 'new_app' | 'missing_app' | 'unusual_time';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  data: any;
}

// ---------------------------------------------------------------------------
// Weekly Report Builder
// ---------------------------------------------------------------------------

function buildWeeklyReport(
  entries: JournalRow[],
  periodStart: number,
  periodEnd: number
): WeeklyReport {
  const appCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  const sessionSet = new Set<string>();
  const dailyMap = new Map<string, { count: number; apps: Set<string> }>();

  for (const entry of entries) {
    appCounts.set(entry.app, (appCounts.get(entry.app) || 0) + 1);
    actionCounts.set(entry.action, (actionCounts.get(entry.action) || 0) + 1);
    sessionSet.add(entry.session_id);

    const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
    const existing = dailyMap.get(dateStr);
    if (existing) {
      existing.count++;
      existing.apps.add(entry.app);
    } else {
      dailyMap.set(dateStr, { count: 1, apps: new Set([entry.app]) });
    }
  }

  const totalEntries = entries.length;
  const topApps = Array.from(appCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([app, count]) => ({
      app,
      count,
      percentage: totalEntries > 0 ? Math.round((count / totalEntries) * 100) : 0,
    }));

  const topActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([action, count]) => ({ action, count }));

  const dailyBreakdown = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      count: data.count,
      apps: Array.from(data.apps),
    }));

  const dayCount = Math.max(dailyBreakdown.length, 1);
  const averageEntriesPerDay = Math.round(totalEntries / dayCount);

  let peakDay: { date: string; count: number } | null = null;
  let quietDay: { date: string; count: number } | null = null;

  for (const day of dailyBreakdown) {
    if (!peakDay || day.count > peakDay.count) peakDay = { date: day.date, count: day.count };
    if (!quietDay || day.count < quietDay.count) quietDay = { date: day.date, count: day.count };
  }

  const summaryLines: string[] = [];
  summaryLines.push(`Weekly Summary (${new Date(periodStart).toLocaleDateString()} - ${new Date(periodEnd).toLocaleDateString()})`);
  summaryLines.push(`Total activity: ${totalEntries} entries across ${appCounts.size} apps in ${sessionSet.size} sessions.`);
  summaryLines.push(`Average: ${averageEntriesPerDay} entries/day.`);
  if (peakDay) summaryLines.push(`Peak day: ${peakDay.date} with ${peakDay.count} entries.`);
  if (quietDay && quietDay.date !== peakDay?.date) summaryLines.push(`Quietest day: ${quietDay.date} with ${quietDay.count} entries.`);
  if (topApps.length > 0) {
    summaryLines.push(`Top apps: ${topApps.slice(0, 5).map(a => `${a.app} (${a.percentage}%)`).join(', ')}.`);
  }

  return {
    periodStart,
    periodEnd,
    generatedAt: Date.now(),
    totalEntries,
    uniqueApps: appCounts.size,
    uniqueSessions: sessionSet.size,
    topApps,
    topActions,
    dailyBreakdown,
    summary: summaryLines.join('\n'),
    averageEntriesPerDay,
    peakDay,
    quietDay,
  };
}

// ---------------------------------------------------------------------------
// Cross-App Pattern Detection
// ---------------------------------------------------------------------------

function findCrossAppPatterns(entries: JournalRow[]): CrossAppPattern[] {
  const patterns: CrossAppPattern[] = [];
  const WINDOW_MS = 5 * 60000;
  const MIN_OCCURRENCES = 3;
  const sequenceMap = new Map<string, { count: number; timestamps: number[]; gaps: number[] }>();

  const sessionGroups = new Map<string, JournalRow[]>();
  for (const entry of entries) {
    const group = sessionGroups.get(entry.session_id) || [];
    group.push(entry);
    sessionGroups.set(entry.session_id, group);
  }

  for (const [_sessionId, sessionEntries] of sessionGroups) {
    const sorted = sessionEntries.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sorted.length - 1; i++) {
      const windowEnd = sorted[i].timestamp + WINDOW_MS;
      const windowApps: string[] = [sorted[i].app];
      const windowTimes: number[] = [sorted[i].timestamp];

      for (let j = i + 1; j < sorted.length && sorted[j].timestamp <= windowEnd; j++) {
        if (sorted[j].app !== windowApps[windowApps.length - 1]) {
          windowApps.push(sorted[j].app);
          windowTimes.push(sorted[j].timestamp);
          if (windowApps.length >= 4) break;
        }
      }

      if (windowApps.length >= 2) {
        const key = windowApps.join('->');
        const existing = sequenceMap.get(key) || { count: 0, timestamps: [], gaps: [] };
        existing.count++;
        existing.timestamps.push(sorted[i].timestamp);
        if (windowTimes.length >= 2) {
          existing.gaps.push(windowTimes[windowTimes.length - 1] - windowTimes[0]);
        }
        sequenceMap.set(key, existing);
      }
    }
  }

  let patternId = 0;
  for (const [key, data] of sequenceMap) {
    if (data.count >= MIN_OCCURRENCES) {
      const apps = key.split('->');
      const avgGap = data.gaps.length > 0
        ? Math.round(data.gaps.reduce((a, b) => a + b, 0) / data.gaps.length)
        : 0;

      patterns.push({
        id: `pattern-${patternId++}`,
        apps,
        actions: [],
        frequency: data.count,
        lastSeen: Math.max(...data.timestamps),
        description: `${apps.join(' then ')} (${data.count} times, avg ${Math.round(avgGap / 1000)}s between)`,
        averageGapMs: avgGap,
      });
    }
  }

  patterns.sort((a, b) => b.frequency - a.frequency);
  return patterns.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Usage Anomaly Detection
// ---------------------------------------------------------------------------

function findUsageAnomalies(entries: JournalRow[]): UsageAnomaly[] {
  const anomalies: UsageAnomaly[] = [];
  const now = Date.now();

  const dailyMap = new Map<string, JournalRow[]>();
  for (const entry of entries) {
    const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
    const group = dailyMap.get(dateStr) || [];
    group.push(entry);
    dailyMap.set(dateStr, group);
  }

  const dailyCounts = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (dailyCounts.length < 3) return anomalies;

  const counts = dailyCounts.map(([_, entries]) => entries.length);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  let anomalyId = 0;
  for (const [date, dayEntries] of dailyCounts) {
    const count = dayEntries.length;
    const zScore = stdDev > 0 ? (count - mean) / stdDev : 0;

    if (zScore > 2) {
      anomalies.push({
        id: `anomaly-${anomalyId++}`,
        type: 'spike',
        severity: zScore > 3 ? 'high' : 'medium',
        description: `Unusually high activity on ${date}: ${count} entries (avg: ${Math.round(mean)})`,
        detectedAt: now,
        data: { date, count, mean: Math.round(mean), zScore: Math.round(zScore * 10) / 10 },
      });
    } else if (zScore < -2) {
      anomalies.push({
        id: `anomaly-${anomalyId++}`,
        type: 'drop',
        severity: zScore < -3 ? 'high' : 'medium',
        description: `Unusually low activity on ${date}: ${count} entries (avg: ${Math.round(mean)})`,
        detectedAt: now,
        data: { date, count, mean: Math.round(mean), zScore: Math.round(zScore * 10) / 10 },
      });
    }
  }

  const recentThreshold = now - 3 * 86400000;
  const olderThreshold = now - 14 * 86400000;

  const recentApps = new Set<string>();
  const olderApps = new Set<string>();

  for (const entry of entries) {
    if (entry.timestamp >= recentThreshold) {
      recentApps.add(entry.app);
    } else if (entry.timestamp < recentThreshold && entry.timestamp >= olderThreshold) {
      olderApps.add(entry.app);
    }
  }

  for (const app of recentApps) {
    if (!olderApps.has(app) && app !== 'DEX') {
      anomalies.push({
        id: `anomaly-${anomalyId++}`,
        type: 'new_app',
        severity: 'low',
        description: `New app detected in the last 3 days: ${app}`,
        detectedAt: now,
        data: { app },
      });
    }
  }

  for (const app of olderApps) {
    if (!recentApps.has(app) && app !== 'DEX') {
      anomalies.push({
        id: `anomaly-${anomalyId++}`,
        type: 'missing_app',
        severity: 'low',
        description: `${app} was active previously but not in the last 3 days`,
        detectedAt: now,
        data: { app },
      });
    }
  }

  const lateNightEntries = entries.filter(e => {
    const hour = new Date(e.timestamp).getHours();
    return hour >= 0 && hour < 5;
  });

  if (lateNightEntries.length > 0) {
    const lateNightDays = new Set(lateNightEntries.map(e => new Date(e.timestamp).toISOString().slice(0, 10)));
    const totalDays = dailyCounts.length;
    const lateNightRatio = lateNightDays.size / totalDays;

    if (lateNightRatio > 0.3) {
      anomalies.push({
        id: `anomaly-${anomalyId++}`,
        type: 'unusual_time',
        severity: 'medium',
        description: `Late night activity detected (12am-5am) on ${lateNightDays.size} of ${totalDays} days`,
        detectedAt: now,
        data: { lateNightDays: lateNightDays.size, totalDays, ratio: Math.round(lateNightRatio * 100) },
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

if (parentPort) {
  parentPort.on('message', (msg: { type: string; payload: any }) => {
    try {
      switch (msg.type) {
        case 'generate-weekly-report': {
          const { entries, periodStart, periodEnd } = msg.payload;
          const report = buildWeeklyReport(entries, periodStart, periodEnd);
          parentPort!.postMessage({ type: 'weekly-report', payload: report });
          break;
        }
        case 'detect-patterns': {
          const patterns = findCrossAppPatterns(msg.payload.entries);
          parentPort!.postMessage({ type: 'patterns', payload: patterns });
          break;
        }
        case 'detect-anomalies': {
          const anomalies = findUsageAnomalies(msg.payload.entries);
          parentPort!.postMessage({ type: 'anomalies', payload: anomalies });
          break;
        }
        default: {
          parentPort!.postMessage({ type: 'error', payload: `Unknown message type: ${msg.type}` });
          break;
        }
      }
    } catch (err: any) {
      parentPort!.postMessage({ type: 'error', payload: err.message || String(err) });
    }
  });
}
