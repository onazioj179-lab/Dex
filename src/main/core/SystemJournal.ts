/**
 * DEX System Journal - Central Operational Memory Layer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Every inner app writes to the journal through a shared IPC channel.
 * Writes are fire-and-forget -- they never block the calling app.
 * The system_journal table supports soft deletes, millions of rows,
 * date-range / per-app clearing, export in TXT/MD/JSON, and weekly
 * hard-purge of cleared rows older than 7 days.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import { randomUUID } from 'crypto';
import log from 'electron-log';

let Database: any;
try {
  Database = require('better-sqlite3');
} catch {
  log.warn('[SystemJournal] better-sqlite3 not available, using in-memory fallback');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalRow {
  id: number;
  app: string;
  action: string;
  detail: string | null;
  timestamp: number;
  session_id: string;
  cleared: number;
}

export interface JournalSessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  entry_count: number;
}

export interface JournalAnalysisRow {
  id: number;
  type: string;
  data: string;
  created_at: number;
  period_start: number | null;
  period_end: number | null;
}

export interface JournalStats {
  totalEntries: number;
  totalSessions: number;
  totalApps: number;
  todayEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  topApps: { app: string; count: number }[];
}

export interface JournalQueryOptions {
  limit?: number;
  offset?: number;
  after?: number;
  before?: number;
  app?: string;
  sessionId?: string;
  search?: string;
  includeCleared?: boolean;
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

const CURRENT_SESSION_ID = randomUUID();
const SESSION_START_TIME = Date.now();

// ---------------------------------------------------------------------------
// Database Singleton
// ---------------------------------------------------------------------------

let db: any = null;
let initialized = false;
let mainWindow: BrowserWindow | null = null;

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'system-journal.db');
}

function ensureDb(): any {
  if (db) return db;
  if (!Database) {
    throw new Error('better-sqlite3 not available');
  }
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -20000');
  db.pragma('page_size = 4096');
  return db;
}

// ---------------------------------------------------------------------------
// Schema Migrations
// ---------------------------------------------------------------------------

function runMigrations(): void {
  const d = ensureDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS system_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      timestamp INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      cleared INTEGER NOT NULL DEFAULT 0
    )
  `);

  d.exec(`CREATE INDEX IF NOT EXISTS idx_sj_timestamp ON system_journal(timestamp)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_sj_app ON system_journal(app, timestamp)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_sj_session ON system_journal(session_id, timestamp)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_sj_cleared ON system_journal(cleared, timestamp)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_sj_app_action ON system_journal(app, action, timestamp)`);

  d.exec(`
    CREATE TABLE IF NOT EXISTS journal_sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      entry_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  d.exec(`CREATE INDEX IF NOT EXISTS idx_js_started ON journal_sessions(started_at)`);

  d.exec(`
    CREATE TABLE IF NOT EXISTS journal_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      period_start INTEGER,
      period_end INTEGER
    )
  `);

  d.exec(`CREATE INDEX IF NOT EXISTS idx_ja_type ON journal_analysis(type, created_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_ja_period ON journal_analysis(period_start, period_end)`);
}

// ---------------------------------------------------------------------------
// Prepared Statements Cache
// ---------------------------------------------------------------------------

interface PreparedStmts {
  insertEntry: any;
  insertSession: any;
  updateSessionEnd: any;
  incrementSessionCount: any;
  queryAll: any;
  queryByApp: any;
  queryBySession: any;
  search: any;
  softDeleteByRange: any;
  softDeleteByApp: any;
  softDeleteAll: any;
  hardPurge: any;
  countEntries: any;
  countToday: any;
  countSessions: any;
  countApps: any;
  topApps: any;
  oldestTimestamp: any;
  newestTimestamp: any;
  getSession: any;
  listSessions: any;
  insertAnalysis: any;
  getAnalysisByType: any;
  getLatestAnalysis: any;
  distinctApps: any;
  entriesByAppGrouped: any;
}

let stmts: PreparedStmts | null = null;

function prepareStatements(): PreparedStmts {
  if (stmts) return stmts;
  const d = ensureDb();

  stmts = {
    insertEntry: d.prepare(
      `INSERT INTO system_journal (app, action, detail, timestamp, session_id) VALUES (?, ?, ?, ?, ?)`
    ),
    insertSession: d.prepare(
      `INSERT OR IGNORE INTO journal_sessions (id, started_at, entry_count) VALUES (?, ?, 0)`
    ),
    updateSessionEnd: d.prepare(
      `UPDATE journal_sessions SET ended_at = ? WHERE id = ?`
    ),
    incrementSessionCount: d.prepare(
      `UPDATE journal_sessions SET entry_count = entry_count + 1 WHERE id = ?`
    ),
    queryAll: d.prepare(
      `SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
       WHERE cleared = 0 AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ),
    queryByApp: d.prepare(
      `SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
       WHERE cleared = 0 AND app = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ),
    queryBySession: d.prepare(
      `SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
       WHERE cleared = 0 AND session_id = ?
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ),
    search: d.prepare(
      `SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
       WHERE cleared = 0 AND (app LIKE ? OR action LIKE ? OR detail LIKE ?)
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ),
    softDeleteByRange: d.prepare(
      `UPDATE system_journal SET cleared = 1 WHERE cleared = 0 AND timestamp >= ? AND timestamp <= ?`
    ),
    softDeleteByApp: d.prepare(
      `UPDATE system_journal SET cleared = 1 WHERE cleared = 0 AND app = ?`
    ),
    softDeleteAll: d.prepare(
      `UPDATE system_journal SET cleared = 1 WHERE cleared = 0`
    ),
    hardPurge: d.prepare(
      `DELETE FROM system_journal WHERE cleared = 1 AND timestamp < ?`
    ),
    countEntries: d.prepare(
      `SELECT COUNT(*) as count FROM system_journal WHERE cleared = 0`
    ),
    countToday: d.prepare(
      `SELECT COUNT(*) as count FROM system_journal WHERE cleared = 0 AND timestamp >= ?`
    ),
    countSessions: d.prepare(
      `SELECT COUNT(*) as count FROM journal_sessions`
    ),
    countApps: d.prepare(
      `SELECT COUNT(DISTINCT app) as count FROM system_journal WHERE cleared = 0`
    ),
    topApps: d.prepare(
      `SELECT app, COUNT(*) as count FROM system_journal WHERE cleared = 0
       GROUP BY app ORDER BY count DESC LIMIT ?`
    ),
    oldestTimestamp: d.prepare(
      `SELECT MIN(timestamp) as ts FROM system_journal WHERE cleared = 0`
    ),
    newestTimestamp: d.prepare(
      `SELECT MAX(timestamp) as ts FROM system_journal WHERE cleared = 0`
    ),
    getSession: d.prepare(
      `SELECT id, started_at, ended_at, entry_count FROM journal_sessions WHERE id = ?`
    ),
    listSessions: d.prepare(
      `SELECT id, started_at, ended_at, entry_count FROM journal_sessions
       ORDER BY started_at DESC LIMIT ? OFFSET ?`
    ),
    insertAnalysis: d.prepare(
      `INSERT INTO journal_analysis (type, data, created_at, period_start, period_end) VALUES (?, ?, ?, ?, ?)`
    ),
    getAnalysisByType: d.prepare(
      `SELECT id, type, data, created_at, period_start, period_end FROM journal_analysis
       WHERE type = ? ORDER BY created_at DESC LIMIT ?`
    ),
    getLatestAnalysis: d.prepare(
      `SELECT id, type, data, created_at, period_start, period_end FROM journal_analysis
       WHERE type = ? ORDER BY created_at DESC LIMIT 1`
    ),
    distinctApps: d.prepare(
      `SELECT DISTINCT app FROM system_journal WHERE cleared = 0 ORDER BY app`
    ),
    entriesByAppGrouped: d.prepare(
      `SELECT app, COUNT(*) as count, MAX(timestamp) as last_used
       FROM system_journal WHERE cleared = 0
       GROUP BY app ORDER BY count DESC`
    ),
  };

  return stmts;
}

// ---------------------------------------------------------------------------
// Core Write (fire-and-forget)
// ---------------------------------------------------------------------------

function writeEntry(appName: string, action: string, detail?: string | null): void {
  try {
    const s = prepareStatements();
    const now = Date.now();
    s.insertEntry.run(appName, action, detail || null, now, CURRENT_SESSION_ID);
    s.incrementSessionCount.run(CURRENT_SESSION_ID);
  } catch (err) {
    log.warn('[SystemJournal] Write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

function queryEntries(opts: JournalQueryOptions = {}): JournalRow[] {
  const s = prepareStatements();
  const limit = Math.min(opts.limit || 100, 1000);
  const offset = opts.offset || 0;
  const after = opts.after || 0;
  const before = opts.before || Date.now() + 86400000;

  if (opts.search) {
    const term = `%${opts.search}%`;
    return s.search.all(term, term, term, limit, offset) as JournalRow[];
  }

  if (opts.sessionId) {
    return s.queryBySession.all(opts.sessionId, limit, offset) as JournalRow[];
  }

  if (opts.app) {
    return s.queryByApp.all(opts.app, after, before, limit, offset) as JournalRow[];
  }

  return s.queryAll.all(after, before, limit, offset) as JournalRow[];
}

function getDistinctApps(): string[] {
  const s = prepareStatements();
  return (s.distinctApps.all() as { app: string }[]).map(r => r.app);
}

function getAppGroups(): { app: string; count: number; last_used: number }[] {
  const s = prepareStatements();
  return s.entriesByAppGrouped.all() as { app: string; count: number; last_used: number }[];
}

function getSessions(limit: number = 50, offset: number = 0): JournalSessionRow[] {
  const s = prepareStatements();
  return s.listSessions.all(Math.min(limit, 200), offset) as JournalSessionRow[];
}

function getCurrentSession(): JournalSessionRow | null {
  const s = prepareStatements();
  return (s.getSession.get(CURRENT_SESSION_ID) as JournalSessionRow) || null;
}

function getStats(): JournalStats {
  const s = prepareStatements();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const totalEntries = (s.countEntries.get() as { count: number }).count;
  const todayEntries = (s.countToday.get(todayStart.getTime()) as { count: number }).count;
  const totalSessions = (s.countSessions.get() as { count: number }).count;
  const totalApps = (s.countApps.get() as { count: number }).count;
  const oldest = (s.oldestTimestamp.get() as { ts: number | null }).ts;
  const newest = (s.newestTimestamp.get() as { ts: number | null }).ts;
  const topApps = (s.topApps.all(10) as { app: string; count: number }[]);

  return { totalEntries, totalSessions, totalApps, todayEntries, oldestTimestamp: oldest, newestTimestamp: newest, topApps };
}

// ---------------------------------------------------------------------------
// Clear / Manage History
// ---------------------------------------------------------------------------

function clearByDateRange(startTs: number, endTs: number): number {
  const s = prepareStatements();
  const result = s.softDeleteByRange.run(startTs, endTs);
  return result.changes;
}

function clearByApp(appName: string): number {
  const s = prepareStatements();
  const result = s.softDeleteByApp.run(appName);
  return result.changes;
}

function clearAll(): number {
  const s = prepareStatements();
  const result = s.softDeleteAll.run();
  return result.changes;
}

function hardPurgeCleared(olderThanDays: number = 7): number {
  const s = prepareStatements();
  const cutoff = Date.now() - olderThanDays * 86400000;
  const result = s.hardPurge.run(cutoff);
  return result.changes;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function exportEntries(
  format: 'txt' | 'md' | 'json',
  opts: JournalQueryOptions = {}
): string {
  const entries = queryEntries({ ...opts, limit: 50000 });

  if (format === 'json') {
    return JSON.stringify(entries, null, 2);
  }

  if (format === 'md') {
    let md = '# DEX System Journal Export\n\n';
    md += `Exported: ${new Date().toISOString()}\n`;
    md += `Total entries: ${entries.length}\n\n`;
    md += '---\n\n';

    let lastDate = '';
    for (const entry of entries) {
      const dateStr = new Date(entry.timestamp).toLocaleDateString();
      if (dateStr !== lastDate) {
        md += `## ${dateStr}\n\n`;
        lastDate = dateStr;
      }
      const time = new Date(entry.timestamp).toLocaleTimeString();
      md += `- **${time}** | \`${entry.app}\` | ${entry.action}`;
      if (entry.detail) md += ` -- ${entry.detail}`;
      md += '\n';
    }

    return md;
  }

  // Plain text
  let txt = 'DEX System Journal Export\n';
  txt += `Exported: ${new Date().toISOString()}\n`;
  txt += `Total entries: ${entries.length}\n`;
  txt += '='.repeat(60) + '\n\n';

  let lastDate = '';
  for (const entry of entries) {
    const dateStr = new Date(entry.timestamp).toLocaleDateString();
    if (dateStr !== lastDate) {
      txt += `\n--- ${dateStr} ---\n\n`;
      lastDate = dateStr;
    }
    const time = new Date(entry.timestamp).toLocaleTimeString();
    txt += `[${time}] ${entry.app} | ${entry.action}`;
    if (entry.detail) txt += ` -- ${entry.detail}`;
    txt += '\n';
  }

  return txt;
}

// ---------------------------------------------------------------------------
// Analysis Data Access (used by JournalAnalysisEngine)
// ---------------------------------------------------------------------------

export function storeAnalysisResult(
  type: string,
  data: string,
  periodStart?: number,
  periodEnd?: number
): void {
  try {
    const s = prepareStatements();
    s.insertAnalysis.run(type, data, Date.now(), periodStart || null, periodEnd || null);
  } catch (err) {
    log.warn('[SystemJournal] Analysis store failed:', err);
  }
}

export function getAnalysisResults(type: string, limit: number = 10): JournalAnalysisRow[] {
  try {
    const s = prepareStatements();
    return s.getAnalysisByType.all(type, Math.min(limit, 100)) as JournalAnalysisRow[];
  } catch {
    return [];
  }
}

export function getLatestAnalysis(type: string): JournalAnalysisRow | null {
  try {
    const s = prepareStatements();
    return (s.getLatestAnalysis.get(type) as JournalAnalysisRow) || null;
  } catch {
    return null;
  }
}

// Raw query for analysis engine (returns uncleared entries in a date range)
export function getRawEntriesForAnalysis(startTs: number, endTs: number, limit: number = 100000): JournalRow[] {
  try {
    const d = ensureDb();
    return d.prepare(
      `SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
       WHERE cleared = 0 AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC LIMIT ?`
    ).all(startTs, endTs, limit) as JournalRow[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Insights (contextual suggestions)
// ---------------------------------------------------------------------------

interface JournalInsight {
  type: 'unfinished' | 'most_used' | 'session_summary' | 'pattern' | 'suggestion';
  title: string;
  description: string;
  data?: any;
}

function getUnfinishedFromLastSession(): JournalInsight[] {
  try {
    const d = ensureDb();

    // Get the previous session (not current)
    const prevSession = d.prepare(
      `SELECT id, started_at, ended_at, entry_count FROM journal_sessions
       WHERE id != ? ORDER BY started_at DESC LIMIT 1`
    ).get(CURRENT_SESSION_ID) as JournalSessionRow | undefined;

    if (!prevSession) return [];

    // Get entries from previous session that suggest unfinished work
    const incompleteActions = d.prepare(
      `SELECT DISTINCT app, action, detail, timestamp FROM system_journal
       WHERE session_id = ? AND cleared = 0
       AND (action LIKE '%start%' OR action LIKE '%open%' OR action LIKE '%begin%' OR action LIKE '%editing%' OR action LIKE '%creating%')
       ORDER BY timestamp DESC LIMIT 10`
    ).all(prevSession.id) as { app: string; action: string; detail: string | null; timestamp: number }[];

    return incompleteActions.map(row => ({
      type: 'unfinished' as const,
      title: `Unfinished: ${row.app}`,
      description: `${row.action}${row.detail ? ' -- ' + row.detail : ''}`,
      data: { app: row.app, action: row.action, detail: row.detail, timestamp: row.timestamp },
    }));
  } catch {
    return [];
  }
}

function getMostUsedToday(): JournalInsight[] {
  try {
    const d = ensureDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = d.prepare(
      `SELECT app, COUNT(*) as count FROM system_journal
       WHERE cleared = 0 AND timestamp >= ?
       GROUP BY app ORDER BY count DESC LIMIT 10`
    ).all(todayStart.getTime()) as { app: string; count: number }[];

    if (rows.length === 0) return [];

    return [{
      type: 'most_used' as const,
      title: 'Most Used Today',
      description: rows.map(r => `${r.app}: ${r.count}`).join(', '),
      data: rows,
    }];
  } catch {
    return [];
  }
}

function getCurrentSessionSummary(): JournalInsight[] {
  try {
    const d = ensureDb();
    const session = getCurrentSession();
    if (!session) return [];

    const appCounts = d.prepare(
      `SELECT app, COUNT(*) as count FROM system_journal
       WHERE session_id = ? AND cleared = 0
       GROUP BY app ORDER BY count DESC LIMIT 5`
    ).all(CURRENT_SESSION_ID) as { app: string; count: number }[];

    const durationMin = Math.round((Date.now() - session.started_at) / 60000);

    return [{
      type: 'session_summary' as const,
      title: 'Current Session',
      description: `${durationMin} min, ${session.entry_count} entries across ${appCounts.length} apps`,
      data: { duration: durationMin, entryCount: session.entry_count, apps: appCounts },
    }];
  } catch {
    return [];
  }
}

function getInsights(): JournalInsight[] {
  const insights: JournalInsight[] = [];

  insights.push(...getCurrentSessionSummary());
  insights.push(...getMostUsedToday());
  insights.push(...getUnfinishedFromLastSession());

  // Add latest pattern analysis if available
  const latestPattern = getLatestAnalysis('pattern');
  if (latestPattern) {
    try {
      const patternData = JSON.parse(latestPattern.data);
      if (patternData.patterns && patternData.patterns.length > 0) {
        insights.push({
          type: 'pattern',
          title: 'Detected Patterns',
          description: `${patternData.patterns.length} cross-app workflow patterns detected`,
          data: patternData.patterns.slice(0, 5),
        });
      }
    } catch (err) { log.warn('[SystemJournal] Failed to parse pattern insights:', err); }
  }

  // Add latest anomaly if available
  const latestAnomaly = getLatestAnalysis('anomaly');
  if (latestAnomaly) {
    try {
      const anomalyData = JSON.parse(latestAnomaly.data);
      if (anomalyData.anomalies && anomalyData.anomalies.length > 0) {
        insights.push({
          type: 'suggestion',
          title: 'Usage Anomaly',
          description: anomalyData.anomalies[0].description || 'Unusual usage pattern detected',
          data: anomalyData.anomalies.slice(0, 3),
        });
      }
    } catch (err) { log.warn('[SystemJournal] Failed to parse anomaly insights:', err); }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Weekly Hard-Purge Scheduler
// ---------------------------------------------------------------------------

let purgeTimer: ReturnType<typeof setInterval> | null = null;

function startPurgeScheduler(): void {
  // Run hard purge every 6 hours
  purgeTimer = setInterval(() => {
    try {
      const purged = hardPurgeCleared(7);
      if (purged > 0) {
        log.info(`[SystemJournal] Hard-purged ${purged} cleared entries older than 7 days`);
      }
    } catch (err) {
      log.warn('[SystemJournal] Purge scheduler error:', err);
    }
  }, 6 * 3600000);

  // Also run once at startup after a short delay
  setTimeout(() => {
    try {
      const purged = hardPurgeCleared(7);
      if (purged > 0) {
        log.info(`[SystemJournal] Startup purge: removed ${purged} cleared entries`);
      }
    } catch (err) { log.warn('[SystemJournal] Startup purge failed:', err); }
  }, 30000);
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Fire-and-forget write (uses handle so renderer can call, but returns immediately)
  ipcMain.handle('journal:write', (_event, appName: string, action: string, detail?: string) => {
    writeEntry(appName, action, detail);
    return { ok: true };
  });

  // Query entries with pagination
  ipcMain.handle('journal:query', (_event, opts?: JournalQueryOptions) => {
    return queryEntries(opts || {});
  });

  // Query by specific app
  ipcMain.handle('journal:query-by-app', (_event, appName: string, limit?: number, offset?: number) => {
    return queryEntries({ app: appName, limit, offset });
  });

  // Query by session
  ipcMain.handle('journal:query-by-session', (_event, sessionId: string, limit?: number, offset?: number) => {
    return queryEntries({ sessionId, limit, offset });
  });

  // Search
  ipcMain.handle('journal:search', (_event, query: string, limit?: number, offset?: number) => {
    return queryEntries({ search: query, limit, offset });
  });

  // Get all sessions
  ipcMain.handle('journal:get-sessions', (_event, limit?: number, offset?: number) => {
    return getSessions(limit, offset);
  });

  // Get current session
  ipcMain.handle('journal:get-current-session', () => {
    return getCurrentSession();
  });

  // Get distinct apps
  ipcMain.handle('journal:get-apps', () => {
    return getDistinctApps();
  });

  // Get app groups with counts
  ipcMain.handle('journal:get-app-groups', () => {
    return getAppGroups();
  });

  // Get stats
  ipcMain.handle('journal:get-stats', () => {
    return getStats();
  });

  // Clear by date range
  ipcMain.handle('journal:clear-by-date-range', (_event, startTs: number, endTs: number) => {
    const affected = clearByDateRange(startTs, endTs);
    return { ok: true, affected };
  });

  // Clear by app
  ipcMain.handle('journal:clear-by-app', (_event, appName: string) => {
    const affected = clearByApp(appName);
    return { ok: true, affected };
  });

  // Clear all
  ipcMain.handle('journal:clear-all', () => {
    const affected = clearAll();
    return { ok: true, affected };
  });

  // Hard purge cleared entries
  ipcMain.handle('journal:hard-purge', (_event, olderThanDays?: number) => {
    const purged = hardPurgeCleared(olderThanDays);
    return { ok: true, purged };
  });

  // Export
  ipcMain.handle('journal:export', (_event, format: 'txt' | 'md' | 'json', opts?: JournalQueryOptions) => {
    return exportEntries(format, opts);
  });

  // Get insights
  ipcMain.handle('journal:get-insights', () => {
    return getInsights();
  });

  // Get analysis results by type
  ipcMain.handle('journal:get-analysis', (_event, type: string, limit?: number) => {
    return getAnalysisResults(type, limit);
  });

  // Get latest analysis by type
  ipcMain.handle('journal:get-latest-analysis', (_event, type: string) => {
    return getLatestAnalysis(type);
  });

  // Get current session ID
  ipcMain.handle('journal:get-session-id', () => {
    return CURRENT_SESSION_ID;
  });

  // Batch write (for bulk imports or catch-up)
  ipcMain.handle('journal:batch-write', (_event, entries: { app: string; action: string; detail?: string }[]) => {
    if (!Array.isArray(entries)) return { ok: false, error: 'entries must be an array' };
    const d = ensureDb();
    const s = prepareStatements();
    const now = Date.now();

    const batchInsert = d.transaction(() => {
      for (const entry of entries.slice(0, 1000)) {
        s.insertEntry.run(entry.app, entry.action, entry.detail || null, now, CURRENT_SESSION_ID);
      }
      // Update session count in bulk
      const countToAdd = Math.min(entries.length, 1000);
      d.prepare(`UPDATE journal_sessions SET entry_count = entry_count + ? WHERE id = ?`).run(countToAdd, CURRENT_SESSION_ID);
    });

    batchInsert();
    return { ok: true, written: Math.min(entries.length, 1000) };
  });

  // Get entries grouped by date for timeline view
  ipcMain.handle('journal:get-date-groups', (_event, limit?: number) => {
    try {
      const d = ensureDb();
      const rows = d.prepare(
        `SELECT
          date(timestamp / 1000, 'unixepoch', 'localtime') as date_str,
          COUNT(*) as count,
          MIN(timestamp) as first_ts,
          MAX(timestamp) as last_ts
         FROM system_journal
         WHERE cleared = 0
         GROUP BY date_str
         ORDER BY date_str DESC
         LIMIT ?`
      ).all(limit || 30) as { date_str: string; count: number; first_ts: number; last_ts: number }[];
      return rows;
    } catch {
      return [];
    }
  });
}

// ---------------------------------------------------------------------------
// Initialize / Shutdown
// ---------------------------------------------------------------------------

export function initializeSystemJournal(win: BrowserWindow): void {
  if (initialized) return;
  mainWindow = win;

  try {
    ensureDb();
    runMigrations();
    prepareStatements();

    // Register current session
    const s = prepareStatements();
    s.insertSession.run(CURRENT_SESSION_ID, SESSION_START_TIME);

    registerIpcHandlers();
    startPurgeScheduler();

    // Write the boot entry
    writeEntry('DEX', 'session:start', `Session ${CURRENT_SESSION_ID} started`);

    initialized = true;
    log.info(`[SystemJournal] Initialized (session: ${CURRENT_SESSION_ID.slice(0, 8)}...)`);
  } catch (err) {
    log.warn('[SystemJournal] Initialization failed:', (err as Error).message);
    initialized = true; // Don't retry -- prevent re-entrant initialization
  }
}

export function shutdownSystemJournal(): void {
  if (!initialized) return;

  try {
    // Write shutdown entry
    writeEntry('DEX', 'session:end', `Session ${CURRENT_SESSION_ID} ended`);

    // Update session end time
    const s = prepareStatements();
    s.updateSessionEnd.run(Date.now(), CURRENT_SESSION_ID);

    // Stop purge scheduler
    if (purgeTimer) {
      clearInterval(purgeTimer);
      purgeTimer = null;
    }

    // Finalize statements
    stmts = null;

    // Close database
    if (db) {
      try { db.close(); } catch (err) { log.warn('[SystemJournal] DB close error:', err); }
      db = null;
    }

    initialized = false;
    log.info('[SystemJournal] Shutdown complete');
  } catch (err) {
    log.warn('[SystemJournal] Shutdown error:', err);
  }
}

// Export for other modules to write journal entries directly (main process)
export function journalWrite(appName: string, action: string, detail?: string): void {
  if (!initialized) return;
  writeEntry(appName, action, detail);
}

export function getJournalSessionId(): string {
  return CURRENT_SESSION_ID;
}
