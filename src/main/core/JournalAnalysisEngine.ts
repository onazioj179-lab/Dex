/**
 * DEX Journal Analysis Engine
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Runs weekly report generation, cross-app pattern detection, and
 * usage anomaly detection. All heavy computation is delegated to the
 * journal-analysis worker thread. If Ollama is unavailable, summaries
 * fall back to structured plain text.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';
import log from 'electron-log';
import {
  storeAnalysisResult,
  getAnalysisResults,
  getLatestAnalysis,
  getRawEntriesForAnalysis,
  type JournalRow,
  type JournalAnalysisRow,
} from './SystemJournal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyReport {
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

export interface CrossAppPattern {
  id: string;
  apps: string[];
  actions: string[];
  frequency: number;
  lastSeen: number;
  description: string;
  averageGapMs: number;
}

export interface UsageAnomaly {
  id: string;
  type: 'spike' | 'drop' | 'new_app' | 'missing_app' | 'unusual_time';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  data: any;
}

interface WorkerMessage {
  type: 'weekly-report' | 'patterns' | 'anomalies' | 'error';
  payload: any;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let initialized = false;
let mainWindow: BrowserWindow | null = null;
let worker: Worker | null = null;
let weeklyTimer: ReturnType<typeof setInterval> | null = null;
let analysisTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Worker Management
// ---------------------------------------------------------------------------

function getWorkerPath(): string {
  return path.join(__dirname, '..', 'workers', 'journal-analysis.worker.js');
}

function spawnWorker(): Worker | null {
  try {
    const w = new Worker(getWorkerPath());

    w.on('message', (msg: WorkerMessage) => {
      handleWorkerMessage(msg);
    });

    w.on('error', (err) => {
      log.warn('[JournalAnalysis] Worker error:', err.message);
    });

    w.on('exit', (code) => {
      if (code !== 0) {
        log.warn(`[JournalAnalysis] Worker exited with code ${code}`);
      }
      worker = null;
    });

    return w;
  } catch (err) {
    log.warn('[JournalAnalysis] Failed to spawn worker:', err);
    return null;
  }
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  worker = spawnWorker();
  return worker;
}

// ---------------------------------------------------------------------------
// Worker Message Handling
// ---------------------------------------------------------------------------

function handleWorkerMessage(msg: WorkerMessage): void {
  switch (msg.type) {
    case 'weekly-report': {
      const report = msg.payload as WeeklyReport;
      storeAnalysisResult(
        'weekly_report',
        JSON.stringify(report),
        report.periodStart,
        report.periodEnd
      );
      log.info(`[JournalAnalysis] Weekly report stored (${report.totalEntries} entries, ${report.uniqueApps} apps)`);
      break;
    }
    case 'patterns': {
      const patterns = msg.payload as CrossAppPattern[];
      storeAnalysisResult(
        'pattern',
        JSON.stringify({ patterns, detectedAt: Date.now() })
      );
      log.info(`[JournalAnalysis] ${patterns.length} cross-app patterns stored`);
      break;
    }
    case 'anomalies': {
      const anomalies = msg.payload as UsageAnomaly[];
      storeAnalysisResult(
        'anomaly',
        JSON.stringify({ anomalies, detectedAt: Date.now() })
      );
      if (anomalies.length > 0) {
        log.info(`[JournalAnalysis] ${anomalies.length} usage anomalies detected`);
      }
      break;
    }
    case 'error': {
      log.warn('[JournalAnalysis] Worker reported error:', msg.payload);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Analysis Triggers
// ---------------------------------------------------------------------------

function triggerWeeklyReport(): void {
  const w = ensureWorker();
  if (!w) {
    // Fallback: run in-process
    generateWeeklyReportInProcess();
    return;
  }

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const entries = getRawEntriesForAnalysis(weekAgo, now);

  w.postMessage({
    type: 'generate-weekly-report',
    payload: { entries, periodStart: weekAgo, periodEnd: now },
  });
}

function triggerPatternDetection(): void {
  const w = ensureWorker();
  if (!w) {
    detectPatternsInProcess();
    return;
  }

  const now = Date.now();
  const twoWeeksAgo = now - 14 * 86400000;
  const entries = getRawEntriesForAnalysis(twoWeeksAgo, now);

  w.postMessage({
    type: 'detect-patterns',
    payload: { entries },
  });
}

function triggerAnomalyDetection(): void {
  const w = ensureWorker();
  if (!w) {
    detectAnomaliesInProcess();
    return;
  }

  const now = Date.now();
  const monthAgo = now - 30 * 86400000;
  const entries = getRawEntriesForAnalysis(monthAgo, now);

  w.postMessage({
    type: 'detect-anomalies',
    payload: { entries },
  });
}

// ---------------------------------------------------------------------------
// In-Process Fallback (when worker not available)
// ---------------------------------------------------------------------------

function generateWeeklyReportInProcess(): void {
  try {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const entries = getRawEntriesForAnalysis(weekAgo, now);
    const report = buildWeeklyReport(entries, weekAgo, now);
    storeAnalysisResult('weekly_report', JSON.stringify(report), weekAgo, now);
    log.info(`[JournalAnalysis] Weekly report generated in-process (${report.totalEntries} entries)`);
  } catch (err) {
    log.warn('[JournalAnalysis] In-process weekly report failed:', err);
  }
}

function detectPatternsInProcess(): void {
  try {
    const now = Date.now();
    const twoWeeksAgo = now - 14 * 86400000;
    const entries = getRawEntriesForAnalysis(twoWeeksAgo, now);
    const patterns = findCrossAppPatterns(entries);
    storeAnalysisResult('pattern', JSON.stringify({ patterns, detectedAt: now }));
    log.info(`[JournalAnalysis] ${patterns.length} patterns detected in-process`);
  } catch (err) {
    log.warn('[JournalAnalysis] In-process pattern detection failed:', err);
  }
}

function detectAnomaliesInProcess(): void {
  try {
    const now = Date.now();
    const monthAgo = now - 30 * 86400000;
    const entries = getRawEntriesForAnalysis(monthAgo, now);
    const anomalies = findUsageAnomalies(entries);
    storeAnalysisResult('anomaly', JSON.stringify({ anomalies, detectedAt: now }));
    if (anomalies.length > 0) {
      log.info(`[JournalAnalysis] ${anomalies.length} anomalies detected in-process`);
    }
  } catch (err) {
    log.warn('[JournalAnalysis] In-process anomaly detection failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Analysis Algorithms (shared between worker and in-process)
// ---------------------------------------------------------------------------

export function buildWeeklyReport(
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

  // Build plain-text summary (Ollama fallback)
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

export function findCrossAppPatterns(entries: JournalRow[]): CrossAppPattern[] {
  // Detect sequences of app transitions that repeat at least 3 times
  // A pattern is a sequence of 2-4 distinct apps used within 5 minutes of each other

  const patterns: CrossAppPattern[] = [];
  const WINDOW_MS = 5 * 60000; // 5 minutes
  const MIN_OCCURRENCES = 3;
  const sequenceMap = new Map<string, { count: number; timestamps: number[]; gaps: number[] }>();

  // Group entries by session
  const sessionGroups = new Map<string, JournalRow[]>();
  for (const entry of entries) {
    const group = sessionGroups.get(entry.session_id) || [];
    group.push(entry);
    sessionGroups.set(entry.session_id, group);
  }

  // For each session, find app transition sequences
  for (const [_sessionId, sessionEntries] of sessionGroups) {
    const sorted = sessionEntries.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sorted.length - 1; i++) {
      // Build sequences of 2-4 app transitions
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

  // Filter sequences that appear at least MIN_OCCURRENCES times
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
        actions: [], // Actions are too varied to pattern-match reliably
        frequency: data.count,
        lastSeen: Math.max(...data.timestamps),
        description: `${apps.join(' then ')} (${data.count} times, avg ${Math.round(avgGap / 1000)}s between)`,
        averageGapMs: avgGap,
      });
    }
  }

  // Sort by frequency descending
  patterns.sort((a, b) => b.frequency - a.frequency);

  return patterns.slice(0, 50);
}

export function findUsageAnomalies(entries: JournalRow[]): UsageAnomaly[] {
  const anomalies: UsageAnomaly[] = [];
  const now = Date.now();

  // Group entries by day
  const dailyMap = new Map<string, JournalRow[]>();
  for (const entry of entries) {
    const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
    const group = dailyMap.get(dateStr) || [];
    group.push(entry);
    dailyMap.set(dateStr, group);
  }

  const dailyCounts = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  if (dailyCounts.length < 3) return anomalies;

  // Calculate average and standard deviation
  const counts = dailyCounts.map(([_, entries]) => entries.length);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  // Detect spikes and drops (entries > 2 std deviations from mean)
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

  // Detect new apps (appeared only in last 3 days)
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

  // Detect missing apps (was active before but not in last 3 days)
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

  // Detect unusual time activity (entries between midnight and 5am)
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
// Scheduled Analysis
// ---------------------------------------------------------------------------

function shouldRunWeeklyReport(): boolean {
  // Run on Monday's first launch, or if no report in last 7 days
  const latest = getLatestAnalysis('weekly_report');
  if (!latest) return true;

  const weekAgo = Date.now() - 7 * 86400000;
  return latest.created_at < weekAgo;
}

function startAnalysisScheduler(): void {
  // Check for weekly report every 4 hours
  weeklyTimer = setInterval(() => {
    if (shouldRunWeeklyReport()) {
      log.info('[JournalAnalysis] Triggering weekly report generation');
      triggerWeeklyReport();
    }
  }, 4 * 3600000);

  // Run pattern and anomaly detection every 2 hours
  analysisTimer = setInterval(() => {
    triggerPatternDetection();
    // Stagger anomaly detection by 5 minutes
    setTimeout(() => triggerAnomalyDetection(), 5 * 60000);
  }, 2 * 3600000);

  // Initial analysis on startup after delay
  setTimeout(() => {
    if (shouldRunWeeklyReport()) {
      triggerWeeklyReport();
    }
    // Run pattern + anomaly detection 2 min after startup
    setTimeout(() => {
      triggerPatternDetection();
      setTimeout(() => triggerAnomalyDetection(), 60000);
    }, 120000);
  }, 60000);
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Get weekly report
  ipcMain.handle('journal:get-weekly-report', () => {
    const latest = getLatestAnalysis('weekly_report');
    if (!latest) return null;
    try {
      return JSON.parse(latest.data);
    } catch {
      return null;
    }
  });

  // Get all weekly reports (history)
  ipcMain.handle('journal:get-weekly-reports', (_event, limit?: number) => {
    const results = getAnalysisResults('weekly_report', limit || 12);
    return results.map(r => {
      try { return JSON.parse(r.data); } catch { return null; }
    }).filter(Boolean);
  });

  // Get cross-app patterns
  ipcMain.handle('journal:get-patterns', () => {
    const latest = getLatestAnalysis('pattern');
    if (!latest) return [];
    try {
      const data = JSON.parse(latest.data);
      return data.patterns || [];
    } catch {
      return [];
    }
  });

  // Get usage anomalies
  ipcMain.handle('journal:get-anomalies', () => {
    const latest = getLatestAnalysis('anomaly');
    if (!latest) return [];
    try {
      const data = JSON.parse(latest.data);
      return data.anomalies || [];
    } catch {
      return [];
    }
  });

  // Force analysis run
  ipcMain.handle('journal:run-analysis', (_event, type: string) => {
    switch (type) {
      case 'weekly':
        triggerWeeklyReport();
        break;
      case 'patterns':
        triggerPatternDetection();
        break;
      case 'anomalies':
        triggerAnomalyDetection();
        break;
      case 'all':
        triggerWeeklyReport();
        setTimeout(() => triggerPatternDetection(), 5000);
        setTimeout(() => triggerAnomalyDetection(), 10000);
        break;
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Initialize / Shutdown
// ---------------------------------------------------------------------------

export function initializeJournalAnalysis(win: BrowserWindow): void {
  if (initialized) return;
  mainWindow = win;

  try {
    registerIpcHandlers();
    startAnalysisScheduler();
    initialized = true;
    log.info('[JournalAnalysis] Analysis engine initialized');
  } catch (err) {
    log.error('[JournalAnalysis] Initialization failed:', err);
  }
}

export function shutdownJournalAnalysis(): void {
  if (!initialized) return;

  try {
    if (weeklyTimer) { clearInterval(weeklyTimer); weeklyTimer = null; }
    if (analysisTimer) { clearInterval(analysisTimer); analysisTimer = null; }

    if (worker) {
      try { worker.terminate(); } catch (e) { log.warn('[DEX]', e); }
      worker = null;
    }

    initialized = false;
    log.info('[JournalAnalysis] Shutdown complete');
  } catch (err) {
    log.warn('[JournalAnalysis] Shutdown error:', err);
  }
}
