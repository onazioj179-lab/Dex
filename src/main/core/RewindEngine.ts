/**
 * ===========================================================================
 * DEX Rewind Engine - Silent Background Activity Logger
 * ===========================================================================
 *
 * Phase 1: Active windows, clipboard, file events, browser tabs.
 * Phase 2: Screenshots, AI search (Ollama), daily summaries, tray sync.
 * All data is local-only, date-sharded JSON. No cloud, no accounts.
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 */

import { app, ipcMain, clipboard, BrowserWindow, desktopCapturer, shell, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { exec, execFile } from 'child_process';
import Store from 'electron-store';

// Phase 4 imports
import { rewindLearningEngine } from './RewindLearningEngine';
import { rewindSecurityLayer } from './RewindSecurityLayer';
import { rewindDexBridge } from './RewindDexBridge';
import { rewindPhase5Manager } from './RewindPhase5Manager';
import { rewindAnalyticsEngine } from './RewindAnalyticsEngine';
import { rewindPluginManager } from './RewindPluginManager';
import { rewindLogger } from './RewindLogger';

// ===========================================================================
// TYPES
// ===========================================================================

export interface RewindEntry {
  id: string;
  type: 'app' | 'clipboard' | 'file' | 'browser' | 'dex' | 'screenshot';
  content: string;
  appName: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface RewindSettings {
  isRecording: boolean;
  retentionDays: number;
  excludedApps: string[];
  trackClipboard: boolean;
  trackFiles: boolean;
  trackApps: boolean;
  trackBrowser: boolean;
  pollIntervalMs: number;
  // Phase 2
  screenshotsEnabled: boolean;
  screenshotIntervalMin: number;   // 1, 5, or 10
  aiSearchEnabled: boolean;
  aiModel: string;                 // 'llama3' or 'mistral'
}

export interface ScreenshotRecord {
  id: string;
  filepath: string;
  timestamp: number;
  activeApp: string;
}

export interface DailySummaryRecord {
  id: string;
  date: string;
  statsJson: string;
  aiSummary: string | null;
  createdAt: number;
}

interface RewindDayData {
  date: string;
  entries: RewindEntry[];
}

interface ScreenshotDayData {
  date: string;
  screenshots: ScreenshotRecord[];
}

interface SummaryStore {
  summaries: DailySummaryRecord[];
}

// ===========================================================================
// REWIND ENGINE
// ===========================================================================

class RewindEngine {
  private settings: Store<RewindSettings>;
  private rewindDir: string;
  private screenshotsBaseDir: string;
  private summariesFile: string;
  private pollTimer: NodeJS.Timeout | null = null;
  private screenshotTimer: NodeJS.Timeout | null = null;
  private summaryCheckTimer: NodeJS.Timeout | null = null;
  private fileWatchers: fs.FSWatcher[] = [];
  private lastClipHash = '';
  private lastWindowTitle = '';
  private lastActiveApp = 'Unknown';
  private isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private lastSummaryDate = '';
  private ollamaAvailable: boolean | null = null;
  private memoryMonitorTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private componentHealth: Record<string, { lastEventAt: number; errorCount: number; restarts: number }> = {
    windowTracker: { lastEventAt: Date.now(), errorCount: 0, restarts: 0 },
    clipboardMonitor: { lastEventAt: Date.now(), errorCount: 0, restarts: 0 },
    fileWatcher: { lastEventAt: Date.now(), errorCount: 0, restarts: 0 },
    browserReader: { lastEventAt: Date.now(), errorCount: 0, restarts: 0 },
  };
  private activeFocusSession: Record<string, any> | null = null;
  private profileNotificationPreference: 'normal' | 'quiet' | 'silent' = 'normal';
  private focusSessionsFile: string;
  private unhandledHandlersRegistered = false;

  constructor() {
    this.rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.screenshotsBaseDir = path.join(this.rewindDir, 'screenshots');
    this.summariesFile = path.join(this.rewindDir, 'summaries.json');
    this.focusSessionsFile = path.join(this.rewindDir, 'focus-sessions.json');
    this.settings = new Store<RewindSettings>({
      name: 'dex-rewind-settings',
      defaults: {
        isRecording: true,
        retentionDays: 30,
        excludedApps: [],
        trackClipboard: true,
        trackFiles: true,
        trackApps: true,
        trackBrowser: true,
        pollIntervalMs: 5000,
        // Phase 2 defaults -- opt-in only
        screenshotsEnabled: false,
        screenshotIntervalMin: 5,
        aiSearchEnabled: false,
        aiModel: 'llama3',
      },
    });

    // Ensure directories exist
    for (const dir of [this.rewindDir, this.screenshotsBaseDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow;
    log.info('[RewindEngine] Initializing (Phase 2)...');

    this.registerIPC();
    this.pruneOldData();
    this.pruneOldScreenshots();

    if (this.settings.get('isRecording')) {
      this.start();
    }

    // Start summary scheduler (checks once per minute if 6pm has passed)
    this.startSummaryScheduler();

    // Pre-check Ollama availability
    this.checkOllamaAvailability();

    // Phase 4: start subsystems
    rewindLearningEngine.start();
    rewindSecurityLayer.start();
    rewindDexBridge.start();
    rewindAnalyticsEngine.start();
    rewindPluginManager.initialize({
      getRecentActivity: (limit: number) => this.getTimeline(undefined, undefined).slice(0, limit),
      getMainWindow: () => this.mainWindow,
    });

    // Phase 5: crash recovery, backups, profiles, onboarding, storage hardening
    rewindPhase5Manager.initialize({
      getSettings: () => ({
        isRecording: this.settings.get('isRecording'),
        excludedApps: this.settings.get('excludedApps') || [],
        retentionDays: this.settings.get('retentionDays') || 30,
      }),
      applyPartialSettings: (updates) => {
        for (const [key, value] of Object.entries(updates)) {
          this.settings.set(key as any, value as any);
        }
        if ('isRecording' in updates) {
          if (updates.isRecording) this.start(); else this.stop();
        }
      },
      getRecentActiveApps: (minutes) => this.getRecentActiveApps(minutes),
      getCurrentFocusSession: () => this.activeFocusSession,
      restoreFocusSession: (session) => { this.activeFocusSession = session; },
      onProfileActivated: (profile) => {
        this.profileNotificationPreference = profile.notificationPreference;
      },
      onAudit: (action, detail) => rewindSecurityLayer.addAuditEntry(action, detail),
      getRewindFiles: () => this.getRewindDatabaseFiles(),
    });

    this.startMemoryMonitor();
    this.startHealthChecks();
    this.registerUnhandledErrorHandlers();

    log.info('[RewindEngine] Initialized successfully (Phase 5)');
  }

  shutdown(): void {
    log.info('[RewindEngine] Shutting down...');
    this.stop();
    this.fileWatchers.forEach(w => { try { w.close(); } catch (e: any) { log.warn('[RewindEngine] Watcher close error:', e.message); } });
    this.fileWatchers = [];
    if (this.summaryCheckTimer) { clearInterval(this.summaryCheckTimer); this.summaryCheckTimer = null; }
    // Phase 4: stop subsystems
    rewindLearningEngine.stop();
    rewindSecurityLayer.stop();
    rewindDexBridge.stop();
    rewindPhase5Manager.shutdown(true);
    rewindAnalyticsEngine.stop();
    rewindPluginManager.shutdown();
    if (this.memoryMonitorTimer) { clearInterval(this.memoryMonitorTimer); this.memoryMonitorTimer = null; }
    if (this.healthCheckTimer) { clearInterval(this.healthCheckTimer); this.healthCheckTimer = null; }
    log.info('[RewindEngine] Shutdown complete');
  }

  // -------------------------------------------------------------------------
  // START / STOP
  // -------------------------------------------------------------------------

  private start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const interval = this.settings.get('pollIntervalMs') || 5000;
    this.pollTimer = setInterval(() => this.poll(), interval);

    // File watchers
    if (this.settings.get('trackFiles')) {
      this.startFileWatchers();
    }

    // Screenshot timer
    if (this.settings.get('screenshotsEnabled')) {
      this.startScreenshotTimer();
    }

    log.info(`[RewindEngine] Recording started (poll every ${interval}ms)`);
  }

  private stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.screenshotTimer) { clearInterval(this.screenshotTimer); this.screenshotTimer = null; }
    this.fileWatchers.forEach(w => { try { w.close(); } catch (e: any) { log.warn('[RewindEngine] Watcher close error:', e.message); } });
    this.fileWatchers = [];

    log.info('[RewindEngine] Recording stopped');
  }

  // -------------------------------------------------------------------------
  // POLLING LOOP
  // -------------------------------------------------------------------------

  private async poll(): Promise<void> {
    if (!this.settings.get('isRecording')) return;

    try {
      if (this.settings.get('trackApps')) {
        await this.pollActiveWindow();
      }
      if (this.settings.get('trackClipboard')) {
        this.pollClipboard();
      }
    } catch (err) {
      this.markComponentError('windowTracker', err);
      log.warn('[RewindEngine] Poll error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // ACTIVE WINDOW (PowerShell on Windows)
  // -------------------------------------------------------------------------

  private _psScriptPath: string | null = null;

  private getPsScriptPath(): string {
    if (this._psScriptPath && fs.existsSync(this._psScriptPath)) return this._psScriptPath;
    const tmpDir = app.getPath('temp');
    const scriptPath = path.join(tmpDir, 'dex-rewind-poll.ps1');
    const script = [
      'Add-Type @"',
      '  using System;',
      '  using System.Runtime.InteropServices;',
      '  public class Win32 {',
      '    [DllImport("user32.dll")]',
      '    public static extern IntPtr GetForegroundWindow();',
      '    [DllImport("user32.dll", SetLastError=true)]',
      '    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);',
      '    [DllImport("user32.dll")]',
      '    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
      '  }',
      '"@',
      '$h = [Win32]::GetForegroundWindow()',
      '$sb = New-Object System.Text.StringBuilder 256',
      '[Win32]::GetWindowText($h, $sb, 256) | Out-Null',
      '$pid2 = 0',
      '[Win32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null',
      '$proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue',
      '"$($sb.ToString())|$($proc.ProcessName)"',
    ].join('\r\n');
    fs.writeFileSync(scriptPath, script, 'utf-8');
    this._psScriptPath = scriptPath;
    return scriptPath;
  }

  private pollActiveWindow(): Promise<void> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') { resolve(); return; }

      const scriptPath = this.getPsScriptPath();

      // Execute from file to avoid here-string parsing issues
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 4000 }, (err, stdout) => {
        if (err) { this.markComponentError('windowTracker', err); resolve(); return; }

        const line = (stdout || '').trim();
        const [title, procName] = line.split('|');
        if (!title || title === this.lastWindowTitle) { resolve(); return; }

        const excluded = this.settings.get('excludedApps') || [];
        const lowerProc = (procName || '').toLowerCase();
        if (excluded.some(ex => lowerProc.includes(ex.toLowerCase()))) { resolve(); return; }

        this.lastWindowTitle = title;
        this.lastActiveApp = procName || 'Unknown';

        const browserProcesses = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc'];
        const isBrowser = browserProcesses.some(b => lowerProc.includes(b));

        const entry: RewindEntry = {
          id: this.genId(),
          type: isBrowser ? 'browser' : 'app',
          content: title,
          appName: procName || 'Unknown',
          timestamp: Date.now(),
          metadata: { processName: procName },
        };

        this.writeEntry(entry);
        this.markComponentEvent(isBrowser ? 'browserReader' : 'windowTracker');
        rewindPluginManager.emitActivity(entry);

        // Phase 4: feed learning engine and bridge
        rewindLearningEngine.recordAppSwitch(procName || 'Unknown');
        rewindDexBridge.onActivityLogged(procName || 'Unknown', entry.type, title);

        resolve();
      });
    });
  }

  // -------------------------------------------------------------------------
  // CLIPBOARD
  // -------------------------------------------------------------------------

  private pollClipboard(): void {
    try {
      const text = clipboard.readText().trim();
      if (!text || text.length > 10000) return;

      const hash = this.simpleHash(text);
      if (hash === this.lastClipHash) return;
      this.lastClipHash = hash;

      const entry: RewindEntry = {
        id: this.genId(),
        type: 'clipboard',
        content: text.slice(0, 2000),
        appName: 'Clipboard',
        timestamp: Date.now(),
        metadata: { length: text.length, preview: text.slice(0, 100) },
      };

      this.writeEntry(entry);
      this.markComponentEvent('clipboardMonitor');
      rewindPluginManager.emitActivity(entry);

      // Phase 4: clipboard triple-copy detection for Notes integration
      rewindDexBridge.onClipboardEvent(hash, text);
    } catch (err) {
      this.markComponentError('clipboardMonitor', err);
      // clipboard may be locked
    }
  }

  // -------------------------------------------------------------------------
  // FILE WATCHERS
  // -------------------------------------------------------------------------

  private startFileWatchers(): void {
    const dirs = [
      app.getPath('desktop'),
      app.getPath('documents'),
      app.getPath('downloads'),
    ];

    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) continue;

        const watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
          if (!filename || !this.settings.get('isRecording') || !this.settings.get('trackFiles')) return;

          const entry: RewindEntry = {
            id: this.genId(),
            type: 'file',
            content: `${eventType === 'rename' ? 'Created/Deleted' : 'Modified'}: ${filename}`,
            appName: 'File System',
            timestamp: Date.now(),
            metadata: { directory: dir, filename, eventType },
          };

          this.writeEntry(entry);
          this.markComponentEvent('fileWatcher');
          rewindPluginManager.emitActivity(entry);
        });

        this.fileWatchers.push(watcher);
      } catch (err) {
        this.markComponentError('fileWatcher', err);
        log.warn(`[RewindEngine] Cannot watch ${dir}:`, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // DEX INTERNAL EVENTS
  // -------------------------------------------------------------------------

  logDexEvent(appName: string, action: string, details?: Record<string, any>): void {
    if (!this.settings.get('isRecording')) return;

    const entry: RewindEntry = {
      id: this.genId(),
      type: 'dex',
      content: `${appName}: ${action}`,
      appName,
      timestamp: Date.now(),
      metadata: details || {},
    };

    this.writeEntry(entry);
  }

  // ===========================================================================
  // PHASE 2: SCREENSHOT MEMORY
  // ===========================================================================

  private startScreenshotTimer(): void {
    if (this.screenshotTimer) { clearInterval(this.screenshotTimer); }
    const mins = this.settings.get('screenshotIntervalMin') || 5;
    this.screenshotTimer = setInterval(() => this.captureScreenshot(), mins * 60 * 1000);
    log.info(`[RewindEngine] Screenshot timer started (every ${mins}min)`);
  }

  private async captureScreenshot(): Promise<void> {
    try {
      if (!this.settings.get('isRecording') || !this.settings.get('screenshotsEnabled')) return;

      // Check if active app is excluded
      const excluded = this.settings.get('excludedApps') || [];
      if (excluded.some(ex => this.lastActiveApp.toLowerCase().includes(ex.toLowerCase()))) return;

      // Use desktopCapturer to grab the screen
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });

      if (!sources || sources.length === 0) return;

      const thumbnail = sources[0].thumbnail;
      if (thumbnail.isEmpty()) return;

      // Convert to JPEG at 60% quality
      const jpegBuffer = thumbnail.toJPEG(60);

      // Build path: screenshots/YYYY-MM-DD/{timestamp}.jpg
      const dateStr = this.todayStr();
      const dayDir = path.join(this.screenshotsBaseDir, dateStr);
      if (!fs.existsSync(dayDir)) {
        fs.mkdirSync(dayDir, { recursive: true });
      }

      const ts = Date.now();
      const filename = `${ts}.jpg`;
      const filepath = path.join(dayDir, filename);
      fs.writeFileSync(filepath, jpegBuffer);

      // Write screenshot record to day-indexed JSON
      const record: ScreenshotRecord = {
        id: this.genId(),
        filepath,
        timestamp: ts,
        activeApp: this.lastActiveApp,
      };

      this.writeScreenshotRecord(dateStr, record);

      // Also write a timeline entry so it shows in timeline
      const entry: RewindEntry = {
        id: record.id,
        type: 'screenshot',
        content: `Screenshot captured -- ${this.lastActiveApp}`,
        appName: this.lastActiveApp,
        timestamp: ts,
        metadata: { filepath, screenshotId: record.id },
      };
      this.writeEntry(entry);

      log.info(`[RewindEngine] Screenshot captured: ${filename}`);
    } catch (err) {
      log.warn('[RewindEngine] Screenshot capture error:', err);
    }
  }

  private writeScreenshotRecord(dateStr: string, record: ScreenshotRecord): void {
    try {
      const file = path.join(this.screenshotsBaseDir, `${dateStr}-index.json`);
      let data: ScreenshotDayData;
      if (fs.existsSync(file)) {
        data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      } else {
        data = { date: dateStr, screenshots: [] };
      }
      data.screenshots.push(record);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[RewindEngine] Screenshot record write error:', err);
    }
  }

  private getScreenshots(dateStr?: string): ScreenshotRecord[] {
    try {
      const d = dateStr || this.todayStr();
      const file = path.join(this.screenshotsBaseDir, `${d}-index.json`);
      if (!fs.existsSync(file)) return [];
      const data: ScreenshotDayData = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return data.screenshots.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      return [];
    }
  }

  // Read screenshot file as base64 for renderer display
  private getScreenshotData(filepath: string): string | null {
    try {
      if (!fs.existsSync(filepath)) return null;
      const buf = fs.readFileSync(filepath);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch (err) {
      return null;
    }
  }

  private getScreenshotStorageInfo(): { totalSizeBytes: number; totalCount: number } {
    try {
      let totalSize = 0;
      let totalCount = 0;
      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fp = path.join(dir, item.name);
          if (item.isDirectory()) {
            scanDir(fp);
          } else {
            totalSize += fs.statSync(fp).size;
            if (item.name.endsWith('.jpg')) totalCount++;
          }
        }
      };
      scanDir(this.screenshotsBaseDir);
      return { totalSizeBytes: totalSize, totalCount };
    } catch (err) {
      return { totalSizeBytes: 0, totalCount: 0 };
    }
  }

  private pruneOldScreenshots(): void {
    try {
      const retentionDays = this.settings.get('retentionDays') || 30;
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      if (!fs.existsSync(this.screenshotsBaseDir)) return;

      const items = fs.readdirSync(this.screenshotsBaseDir, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) {
          // Remove old index files
          const match = item.name.match(/^(\d{4}-\d{2}-\d{2})-index\.json$/);
          if (match) {
            const fileDate = new Date(match[1]).getTime();
            if (fileDate < cutoff) {
              fs.unlinkSync(path.join(this.screenshotsBaseDir, item.name));
            }
          }
          continue;
        }
        // Check date directories (YYYY-MM-DD)
        const dateMatch = item.name.match(/^(\d{4}-\d{2}-\d{2})$/);
        if (!dateMatch) continue;

        const folderDate = new Date(dateMatch[1]).getTime();
        if (folderDate < cutoff) {
          // Remove entire day folder
          const dayDir = path.join(this.screenshotsBaseDir, item.name);
          const files = fs.readdirSync(dayDir);
          for (const f of files) { fs.unlinkSync(path.join(dayDir, f)); }
          fs.rmdirSync(dayDir);
          log.info(`[RewindEngine] Pruned old screenshots: ${item.name}`);
        }
      }
    } catch (err) {
      log.warn('[RewindEngine] Screenshot prune error:', err);
    }
  }

  // ===========================================================================
  // PHASE 2: SMART DAILY SUMMARY
  // ===========================================================================

  private startSummaryScheduler(): void {
    // Check once per minute if it's 6pm and we haven't generated today's summary
    this.summaryCheckTimer = setInterval(() => {
      try {
        const now = new Date();
        const hour = now.getHours();
        const dateStr = this.todayStr();

        // Trigger at 6pm if not already generated today
        if (hour >= 18 && this.lastSummaryDate !== dateStr) {
          this.lastSummaryDate = dateStr;
          this.generateDailySummary(dateStr);
        }
      } catch (err) {
        log.warn('[RewindEngine] Summary scheduler error:', err);
      }
    }, 60 * 1000);
  }

  private async generateDailySummary(dateStr?: string): Promise<DailySummaryRecord | null> {
    try {
      const d = dateStr || this.todayStr();
      const data = this.readDay(d);
      if (!data || data.entries.length === 0) return null;

      const entries = data.entries;

      // Calculate stats
      const appTime: Record<string, number> = {};
      let lastTs = 0;
      let lastApp = '';
      for (const e of entries.sort((a, b) => a.timestamp - b.timestamp)) {
        if (e.type === 'app' || e.type === 'browser') {
          if (lastApp && lastTs > 0) {
            const dur = Math.min(e.timestamp - lastTs, 600000); // cap at 10min
            appTime[lastApp] = (appTime[lastApp] || 0) + dur;
          }
          lastApp = e.appName;
          lastTs = e.timestamp;
        }
      }

      const totalActiveMs = Object.values(appTime).reduce((s, v) => s + v, 0);
      const topApps = Object.entries(appTime)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000) }));

      const filesTouched = entries.filter(e => e.type === 'file').length;
      const uniqueBrowserTitles = new Set(entries.filter(e => e.type === 'browser').map(e => e.content)).size;
      const clipboardCopies = entries.filter(e => e.type === 'clipboard').length;

      // Most active hour
      const hourCounts: number[] = new Array(24).fill(0);
      for (const e of entries) {
        hourCounts[new Date(e.timestamp).getHours()]++;
      }
      const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));

      const stats = {
        totalActiveMinutes: Math.round(totalActiveMs / 60000),
        topApps,
        filesTouched,
        websitesVisited: uniqueBrowserTitles,
        clipboardCopies,
        mostActiveHour,
        totalEntries: entries.length,
      };

      // Try AI summary if enabled
      let aiSummary: string | null = null;
      if (this.settings.get('aiSearchEnabled')) {
        aiSummary = await this.getAISummary(d, entries, stats);
      }

      const record: DailySummaryRecord = {
        id: this.genId(),
        date: d,
        statsJson: JSON.stringify(stats),
        aiSummary,
        createdAt: Date.now(),
      };

      this.saveDailySummary(record);
      rewindPluginManager.emitSummary(record);
      log.info(`[RewindEngine] Daily summary generated for ${d}`);
      return record;
    } catch (err) {
      log.warn('[RewindEngine] Summary generation error:', err);
      return null;
    }
  }

  private saveDailySummary(record: DailySummaryRecord): void {
    try {
      let store: SummaryStore;
      if (fs.existsSync(this.summariesFile)) {
        store = JSON.parse(fs.readFileSync(this.summariesFile, 'utf-8'));
      } else {
        store = { summaries: [] };
      }
      // Replace existing summary for same date
      store.summaries = store.summaries.filter(s => s.date !== record.date);
      store.summaries.push(record);
      // Keep only last 90 days
      store.summaries = store.summaries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 90);
      fs.writeFileSync(this.summariesFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[RewindEngine] Summary save error:', err);
    }
  }

  private getDailySummary(dateStr?: string): DailySummaryRecord | null {
    try {
      const d = dateStr || this.todayStr();
      if (!fs.existsSync(this.summariesFile)) return null;
      const store: SummaryStore = JSON.parse(fs.readFileSync(this.summariesFile, 'utf-8'));
      return store.summaries.find(s => s.date === d) || null;
    } catch (err) {
      return null;
    }
  }

  private getWeekSummaries(): DailySummaryRecord[] {
    try {
      if (!fs.existsSync(this.summariesFile)) return [];
      const store: SummaryStore = JSON.parse(fs.readFileSync(this.summariesFile, 'utf-8'));
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const cutoff = weekAgo.toISOString().slice(0, 10);
      return store.summaries.filter(s => s.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      return [];
    }
  }

  // ===========================================================================
  // PHASE 2: LOCAL AI SEARCH (Ollama)
  // ===========================================================================

  private async checkOllamaAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        exec('curl -s http://127.0.0.1:11434/api/tags', { timeout: 3000 }, (err, stdout) => {
          if (err) {
            this.ollamaAvailable = false;
            log.info('[RewindEngine] Ollama not available (not running or not installed)');
            resolve(false);
            return;
          }
          try {
            const resp = JSON.parse(stdout);
            if (resp && resp.models) {
              this.ollamaAvailable = true;
              // Check if preferred model is available
              const models = resp.models.map((m: any) => m.name?.split(':')[0]);
              const preferred = this.settings.get('aiModel') || 'llama3';
              if (!models.includes(preferred)) {
                if (models.includes('mistral')) {
                  this.settings.set('aiModel', 'mistral');
                }
              }
              log.info(`[RewindEngine] Ollama available, models: ${models.join(', ')}`);
              resolve(true);
            } else {
              this.ollamaAvailable = false;
              resolve(false);
            }
          } catch (_) {
            this.ollamaAvailable = false;
            resolve(false);
          }
        });
      } catch (_) {
        this.ollamaAvailable = false;
        resolve(false);
      }
    });
  }

  private async aiSearch(query: string, daysBack = 7): Promise<RewindEntry[]> {
    try {
      // Collect recent entries (up to 500)
      const allEntries: RewindEntry[] = [];
      const today = new Date();
      for (let i = 0; i < daysBack && allEntries.length < 500; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = this.formatDateStr(d);
        const data = this.readDay(ds);
        if (data) {
          allEntries.push(...data.entries);
        }
      }

      const context = allEntries.slice(0, 500).map(e => ({
        id: e.id,
        type: e.type,
        content: e.content,
        appName: e.appName,
        timestamp: e.timestamp,
      }));

      const model = this.settings.get('aiModel') || 'llama3';
      const prompt = `You are a personal desktop memory search engine. The user is looking for: ${query}\nHere are recent desktop activities as JSON: ${JSON.stringify(context)}\nReturn only a JSON array of matching entry IDs ordered by relevance. Return nothing else.`;

      const body = JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      });

      return new Promise((resolve) => {
        const postData = Buffer.from(body, 'utf-8');
        exec(`curl -s -X POST http://127.0.0.1:11434/api/generate -H "Content-Type: application/json" -d @-`, {
          timeout: 30000,
        }, (err, stdout) => {
          if (err) {
            log.warn('[RewindEngine] Ollama request error:', err);
            resolve(this.search(query, daysBack)); // fallback
            return;
          }

          try {
            const resp = JSON.parse(stdout);
            const text = resp.response || '';
            // Extract JSON array from response (strip markdown)
            const cleaned = text.replace(/```json?/g, '').replace(/```/g, '').trim();
            const ids: string[] = JSON.parse(cleaned);

            if (!Array.isArray(ids)) {
              resolve(this.search(query, daysBack));
              return;
            }

            // Fetch entries by IDs in order
            const idSet = new Set(ids);
            const entryMap = new Map<string, RewindEntry>();
            for (const e of allEntries) {
              if (idSet.has(e.id)) entryMap.set(e.id, e);
            }

            const results: RewindEntry[] = [];
            for (const id of ids) {
              const e = entryMap.get(id);
              if (e) results.push(e);
            }

            resolve(results.length > 0 ? results.slice(0, 200) : this.search(query, daysBack));
          } catch (_) {
            log.warn('[RewindEngine] Ollama parse error, falling back to keyword search');
            resolve(this.search(query, daysBack));
          }
        }).stdin?.end(body);
      });
    } catch (err) {
      log.warn('[RewindEngine] AI search error:', err);
      return this.search(query, daysBack);
    }
  }

  private async getAISummary(dateStr: string, entries: RewindEntry[], stats: any): Promise<string | null> {
    try {
      if (!this.ollamaAvailable) {
        await this.checkOllamaAvailability();
        if (!this.ollamaAvailable) return null;
      }

      const model = this.settings.get('aiModel') || 'llama3';
      const simplified = entries.slice(0, 300).map(e => `${e.type}: ${e.content}`).join('\n');
      const prompt = `You are summarizing a user's desktop activity for ${dateStr}. Stats: ${JSON.stringify(stats)}. Activity log:\n${simplified}\n\nWrite a single brief paragraph (3-4 sentences) naturally describing what the user worked on today. Be specific about apps and tasks. Return only the paragraph.`;

      const body = JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.3 },
      });

      return new Promise((resolve) => {
        exec(`curl -s -X POST http://127.0.0.1:11434/api/generate -H "Content-Type: application/json" -d @-`, {
          timeout: 30000,
        }, (err, stdout) => {
          if (err) { resolve(null); return; }
          try {
            const resp = JSON.parse(stdout);
            const text = (resp.response || '').trim();
            resolve(text.length > 10 ? text : null);
          } catch (_) {
            resolve(null);
          }
        }).stdin?.end(body);
      });
    } catch (_) {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // STORAGE -- Date-Sharded JSON
  // -------------------------------------------------------------------------

  private getDateFile(ts?: number): string {
    const d = ts ? new Date(ts) : new Date();
    return path.join(this.rewindDir, `${this.formatDateStr(d)}.json`);
  }

  private writeEntry(entry: RewindEntry): void {
    try {
      const file = this.getDateFile(entry.timestamp);
      let data: RewindDayData;

      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        data = JSON.parse(raw);
      } else {
        data = { date: this.formatDateStr(new Date(entry.timestamp)), entries: [] };
      }

      data.entries.push(entry);

      if (data.entries.length > 10000) {
        data.entries = data.entries.slice(-10000);
      }

      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[RewindEngine] Write error:', err);
    }
  }

  private readDay(dateStr: string): RewindDayData | null {
    try {
      const file = path.join(this.rewindDir, `${dateStr}.json`);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      log.warn('[RewindEngine] Read error:', err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // TIMELINE
  // -------------------------------------------------------------------------

  getTimeline(dateStr?: string, filterType?: string): RewindEntry[] {
    const d = dateStr || this.todayStr();
    const data = this.readDay(d);
    if (!data) return [];

    let entries = data.entries;
    if (filterType && filterType !== 'all') {
      entries = entries.filter(e => e.type === filterType);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  // -------------------------------------------------------------------------
  // SEARCH -- Keyword fallback (used when AI not available)
  // -------------------------------------------------------------------------

  search(query: string, daysBack = 7): RewindEntry[] {
    if (!query.trim()) return [];

    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results: RewindEntry[] = [];

    let typeFilter: string | null = null;
    const typeHints: Record<string, string> = {
      copied: 'clipboard', pasted: 'clipboard', clipboard: 'clipboard',
      opened: 'app', switched: 'app', app: 'app', window: 'app',
      file: 'file', created: 'file', modified: 'file', downloaded: 'file',
      browsed: 'browser', visited: 'browser', website: 'browser', tab: 'browser',
      screenshot: 'screenshot', capture: 'screenshot',
      dex: 'dex',
    };
    for (const kw of keywords) {
      if (typeHints[kw]) { typeFilter = typeHints[kw]; break; }
    }

    const today = new Date();
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = this.formatDateStr(d);
      const data = this.readDay(ds);
      if (!data) continue;

      for (const entry of data.entries) {
        if (typeFilter && entry.type !== typeFilter) continue;

        const haystack = `${entry.content} ${entry.appName} ${JSON.stringify(entry.metadata)}`.toLowerCase();
        const match = keywords.every(kw => {
          if (typeHints[kw]) return true;
          return haystack.includes(kw);
        });

        if (match) results.push(entry);
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
  }

  // -------------------------------------------------------------------------
  // DATA MANAGEMENT
  // -------------------------------------------------------------------------

  private pruneOldData(): void {
    try {
      const retentionDays = this.settings.get('retentionDays') || 30;
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const archiveCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const archiveFile = path.join(this.rewindDir, 'activity_log_archive.json');
      const archiveStore: { entries: RewindEntry[] } = fs.existsSync(archiveFile)
        ? JSON.parse(fs.readFileSync(archiveFile, 'utf-8'))
        : { entries: [] };
      const files = fs.readdirSync(this.rewindDir).filter(f => f.endsWith('.json') && !f.includes('summaries'));

      for (const file of files) {
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        if (!dateMatch) continue;

        const fileDate = new Date(dateMatch[1]).getTime();
        if (fileDate < cutoff) {
          const fullPath = path.join(this.rewindDir, file);
          const dayData: RewindDayData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          const toArchive = (dayData.entries || []).filter(e => e.timestamp < archiveCutoff);
          if (toArchive.length > 0) {
            archiveStore.entries.push(...toArchive);
          }
          fs.unlinkSync(fullPath);
          log.info(`[RewindEngine] Pruned old data: ${file} (archived ${toArchive.length} rows)`);
        }
      }
      if (archiveStore.entries.length > 0) {
        fs.writeFileSync(archiveFile, JSON.stringify(archiveStore, null, 2), 'utf-8');
      }
    } catch (err) {
      log.warn('[RewindEngine] Prune error:', err);
    }
  }

  deleteAllData(): void {
    try {
      // Delete activity logs
      const files = fs.readdirSync(this.rewindDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        fs.unlinkSync(path.join(this.rewindDir, file));
      }
      // Delete screenshot folders
      if (fs.existsSync(this.screenshotsBaseDir)) {
        const dirs = fs.readdirSync(this.screenshotsBaseDir, { withFileTypes: true });
        for (const item of dirs) {
          const fp = path.join(this.screenshotsBaseDir, item.name);
          if (item.isDirectory()) {
            const files2 = fs.readdirSync(fp);
            for (const f of files2) { fs.unlinkSync(path.join(fp, f)); }
            fs.rmdirSync(fp);
          } else {
            fs.unlinkSync(fp);
          }
        }
      }
      log.info('[RewindEngine] All data deleted');
      rewindSecurityLayer.addAuditEntry('data_deleted', 'All Rewind data deleted by user');
    } catch (err) {
      log.warn('[RewindEngine] Delete all error:', err);
    }
  }

  getStorageInfo(): { totalFiles: number; totalEntries: number; totalSizeBytes: number; oldestDate: string | null; newestDate: string | null } {
    try {
      const files = fs.readdirSync(this.rewindDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      let totalEntries = 0;
      let totalSizeBytes = 0;

      for (const file of files) {
        const fp = path.join(this.rewindDir, file);
        const stat = fs.statSync(fp);
        totalSizeBytes += stat.size;
        try {
          const data: RewindDayData = JSON.parse(fs.readFileSync(fp, 'utf-8'));
          totalEntries += data.entries.length;
        } catch (e) { log.warn('[RewindEngine] Data file parse error:', e); }
      }

      return {
        totalFiles: files.length,
        totalEntries,
        totalSizeBytes,
        oldestDate: files.length > 0 ? files[0].replace('.json', '') : null,
        newestDate: files.length > 0 ? files[files.length - 1].replace('.json', '') : null,
      };
    } catch (err) {
      return { totalFiles: 0, totalEntries: 0, totalSizeBytes: 0, oldestDate: null, newestDate: null };
    }
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPC(): void {
    // -- Phase 1 handlers --
    ipcMain.handle('rewind:getTimeline', (_e, dateStr?: string, filterType?: string) => {
      return this.getTimeline(dateStr, filterType);
    });

    ipcMain.handle('rewind:search', async (_e, query: string, daysBack?: number) => {
      // Use AI search if enabled and available
      let results: RewindEntry[];
      if (this.settings.get('aiSearchEnabled') && this.ollamaAvailable) {
        results = await this.aiSearch(query, daysBack);
      } else {
        results = this.search(query, daysBack || 7);
      }
      // Phase 4: learn from query and boost results
      rewindLearningEngine.recordSearchQuery(query);
      return rewindLearningEngine.boostSearchResults(query, results);
    });

    ipcMain.handle('rewind:getSettings', () => {
      return this.settings.store;
    });

    ipcMain.handle('rewind:updateSettings', (_e, updates: Partial<RewindSettings>) => {
      for (const [key, value] of Object.entries(updates)) {
        this.settings.set(key as any, value);
      }

      if ('isRecording' in updates) {
        if (updates.isRecording) { this.start(); } else { this.stop(); }
      }

      // Restart screenshot timer if interval changed
      if ('screenshotIntervalMin' in updates || 'screenshotsEnabled' in updates) {
        if (this.screenshotTimer) { clearInterval(this.screenshotTimer); this.screenshotTimer = null; }
        if (this.isRunning && this.settings.get('screenshotsEnabled')) {
          this.startScreenshotTimer();
        }
      }

      // Re-check Ollama if AI search toggled
      if ('aiSearchEnabled' in updates && updates.aiSearchEnabled) {
        this.checkOllamaAvailability();
      }

      rewindSecurityLayer.addAuditEntry('settings_changed', `Updated settings keys: ${Object.keys(updates).join(', ')}`);

      return this.settings.store;
    });

    ipcMain.handle('rewind:toggleRecording', () => {
      const current = this.settings.get('isRecording');
      this.settings.set('isRecording', !current);
      if (!current) { this.start(); } else { this.stop(); }
      rewindSecurityLayer.addAuditEntry(
        current ? 'recording_paused' : 'recording_resumed',
        current ? 'Recording paused by user' : 'Recording resumed by user'
      );
      return !current;
    });

    ipcMain.handle('rewind:deleteAllData', () => {
      this.deleteAllData();
      return true;
    });

    ipcMain.handle('rewind:getStorageInfo', () => {
      return this.getStorageInfo();
    });

    ipcMain.handle('rewind:isRecording', () => {
      return this.settings.get('isRecording');
    });

    ipcMain.handle('rewind:getDaySummary', (_e, dateStr?: string) => {
      const d = dateStr || this.todayStr();
      const data = this.readDay(d);
      if (!data) return { date: d, totalEntries: 0, byType: {}, topApps: [], hours: [] };

      const byType: Record<string, number> = {};
      const appCounts: Record<string, number> = {};
      const hourCounts: number[] = new Array(24).fill(0);

      for (const entry of data.entries) {
        byType[entry.type] = (byType[entry.type] || 0) + 1;
        appCounts[entry.appName] = (appCounts[entry.appName] || 0) + 1;
        hourCounts[new Date(entry.timestamp).getHours()]++;
      }

      const topApps = Object.entries(appCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      return { date: d, totalEntries: data.entries.length, byType, topApps, hours: hourCounts };
    });

    // -- Phase 2 handlers --

    // Screenshots
    ipcMain.handle('rewind:getScreenshots', (_e, dateStr?: string) => {
      return this.getScreenshots(dateStr);
    });

    ipcMain.handle('rewind:getScreenshotData', (_e, filepath: string) => {
      return this.getScreenshotData(filepath);
    });

    ipcMain.handle('rewind:getScreenshotStorageInfo', () => {
      return this.getScreenshotStorageInfo();
    });

    ipcMain.handle('rewind:openScreenshotsFolder', () => {
      try { shell.openPath(this.screenshotsBaseDir); } catch (e) { log.warn('[RewindEngine] openPath failed:', e); }
      return true;
    });

    ipcMain.handle('rewind:captureScreenshotNow', async () => {
      await this.captureScreenshot();
      return true;
    });

    // Smart Summary
    ipcMain.handle('rewind:getSmartSummary', (_e, dateStr?: string) => {
      return this.getDailySummary(dateStr);
    });

    ipcMain.handle('rewind:generateSummaryNow', async (_e, dateStr?: string) => {
      return this.generateDailySummary(dateStr);
    });

    ipcMain.handle('rewind:getWeekSummaries', () => {
      return this.getWeekSummaries();
    });

    ipcMain.handle('rewind:exportSummary', async (_e, dateStr?: string) => {
      const summary = this.getDailySummary(dateStr);
      if (!summary) return null;
      const stats = JSON.parse(summary.statsJson);
      let text = `DEX Rewind Daily Summary -- ${summary.date}\n${'='.repeat(50)}\n\n`;
      if (summary.aiSummary) { text += `${summary.aiSummary}\n\n`; }
      text += `Total Active Time: ${stats.totalActiveMinutes} minutes\n`;
      text += `Total Events: ${stats.totalEntries}\n`;
      text += `Files Touched: ${stats.filesTouched}\n`;
      text += `Websites Visited: ${stats.websitesVisited}\n`;
      text += `Clipboard Copies: ${stats.clipboardCopies}\n`;
      text += `Most Active Hour: ${stats.mostActiveHour}:00\n\n`;
      text += `Top 5 Apps:\n`;
      for (const a of stats.topApps) { text += `  - ${a.name}: ${a.minutes} min\n`; }
      // Phase 4: sign export with SHA-256
      return rewindSecurityLayer.signExport(text);
    });

    // AI Status
    ipcMain.handle('rewind:getAIStatus', async () => {
      await this.checkOllamaAvailability();
      return {
        available: this.ollamaAvailable,
        enabled: this.settings.get('aiSearchEnabled'),
        model: this.settings.get('aiModel'),
      };
    });

    // Username (for profile)
    ipcMain.handle('rewind:getUsername', () => {
      try {
        const os = require('os');
        return os.userInfo().username || 'User';
      } catch {
        return 'User';
      }
    });

    // App version
    ipcMain.handle('rewind:getAppVersion', () => {
      return app.getVersion();
    });

    // -- Phase 4: Learning Engine --

    ipcMain.handle('rewind:getLearningStatus', () => {
      return rewindLearningEngine.getStatus();
    });

    ipcMain.handle('rewind:getLearnedPatterns', () => {
      return rewindLearningEngine.getLearnedPatterns();
    });

    ipcMain.handle('rewind:getPredictedNextApp', () => {
      return rewindLearningEngine.getPredictedNextApp();
    });

    ipcMain.handle('rewind:getPeakWindow', () => {
      return rewindLearningEngine.getPeakWindowForToday();
    });

    ipcMain.handle('rewind:isInPeakWindow', () => {
      return rewindLearningEngine.isInPeakWindow();
    });

    ipcMain.handle('rewind:getSuggestedDistractions', () => {
      return rewindLearningEngine.getSuggestedDistractions();
    });

    ipcMain.handle('rewind:recordSearchClick', (_e, query: string, entryId: string) => {
      rewindLearningEngine.recordSearchClick(query, entryId);
      return true;
    });

    // -- Phase 4: Security Layer --

    ipcMain.handle('rewind:getSecurityStatus', () => {
      return rewindSecurityLayer.getStatus();
    });

    ipcMain.handle('rewind:runIntegrityCheck', () => {
      return rewindSecurityLayer.runIntegrityCheck();
    });

    ipcMain.handle('rewind:getAuditLog', (_e, limit?: number) => {
      return rewindSecurityLayer.getAuditLog(limit || 100);
    });

    ipcMain.handle('rewind:isSessionLocked', () => {
      return rewindSecurityLayer.isSessionLocked();
    });

    ipcMain.handle('rewind:unlockSession', () => {
      return rewindSecurityLayer.unlockSession();
    });

    // -- Phase 4: DEX Bridge --

    ipcMain.handle('rewind:getBridgeStatus', () => {
      return rewindDexBridge.getStatus();
    });

    ipcMain.handle('rewind:isDndActive', () => {
      return rewindDexBridge.isDndActive();
    });

    // -- Phase 4: Combined Backend Status --

    ipcMain.handle('rewind:getBackendStatus', () => {
      const storageInfo = this.getStorageInfo();
      const screenshotInfo = this.getScreenshotStorageInfo();
      const activeProfile = rewindPhase5Manager.getActiveProfile();
      const backup = rewindPhase5Manager.getBackupSettings();
      return {
        recording: this.settings.get('isRecording'),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        storage: storageInfo,
        screenshots: screenshotInfo,
        learning: rewindLearningEngine.getStatus(),
        security: rewindSecurityLayer.getStatus(),
        bridge: rewindDexBridge.getStatus(),
        activeProfile,
        profileNotificationPreference: this.profileNotificationPreference,
        backup,
        selfHealEvents: rewindPhase5Manager.getSelfHealEvents(10),
        analyticsComputedAt: rewindAnalyticsEngine.getSnapshot().computedAt,
        aiStatus: {
          available: this.ollamaAvailable,
          enabled: this.settings.get('aiSearchEnabled'),
          model: this.settings.get('aiModel'),
        },
      };
    });

    ipcMain.handle('rewind:getTodayLogs', async () => {
      return rewindLogger.readTodayLog();
    });

    ipcMain.handle('rewind:openLogsFolder', () => {
      shell.openPath(rewindLogger.openFolderPath()).catch((e: unknown) => { log.warn('[DEX]', e); });
      return true;
    });

    // -- Phase 5: Crash Recovery --
    ipcMain.handle('rewind:getCrashRecoveryStatus', () => rewindPhase5Manager.getCrashRecoveryStatus());
    ipcMain.handle('rewind:restoreCrashedSession', () => rewindPhase5Manager.restoreFromCrashSnapshot());
    ipcMain.handle('rewind:dismissCrashRecovery', () => { rewindPhase5Manager.dismissCrashRecovery(); return true; });

    // -- Phase 5: Focus session snapshot --
    ipcMain.handle('rewind:setFocusSessionState', (_e, state: Record<string, any> | null) => {
      this.activeFocusSession = state;
      return true;
    });
    ipcMain.handle('rewind:getFocusSessionState', () => this.activeFocusSession);

    ipcMain.handle('rewind:startFocusSession', (_e, goalText: string) => {
      const session = {
        id: `fcs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: this.todayStr(),
        goal: (goalText || 'Focus session').trim(),
        startTs: Date.now(),
      };
      this.activeFocusSession = session;
      rewindPluginManager.emitFocusStart(session);
      rewindSecurityLayer.addAuditEntry('focus_started', `Goal: ${session.goal}`);
      rewindDexBridge.onFocusSessionStart(this.lastActiveApp, 30 * 60 * 1000);
      return session;
    });

    ipcMain.handle('rewind:endFocusSession', () => {
      if (!this.activeFocusSession) return null;
      const ended = this.finalizeFocusSession(this.activeFocusSession);
      rewindPluginManager.emitFocusEnd(ended);
      this.activeFocusSession = null;
      rewindSecurityLayer.addAuditEntry('focus_ended', `Goal: ${ended.goal}, score ${ended.focusScore}`);
      return ended;
    });

    ipcMain.handle('rewind:getFocusSessions', () => {
      return this.getFocusSessions();
    });

    // -- Phase 7: Plugins --
    ipcMain.handle('rewind:getPlugins', () => rewindPluginManager.getPlugins());
    ipcMain.handle('rewind:setPluginEnabled', (_e, id: string, enabled: boolean) => rewindPluginManager.setEnabled(id, enabled));
    ipcMain.handle('rewind:reloadPlugins', () => { rewindPluginManager.reloadAll(); return rewindPluginManager.getPlugins(); });
    ipcMain.handle('rewind:openPluginsFolder', () => { rewindPluginManager.openPluginsFolder(); return true; });
    ipcMain.handle('rewind:getPluginCommands', () => rewindPluginManager.getAllPluginCommands());
    ipcMain.handle('rewind:runPluginCommand', (_e, pluginId: string, name: string, payload?: any) => {
      return rewindPluginManager.runPluginCommand(pluginId, name, payload);
    });

    // -- Phase 6: Analytics --
    ipcMain.handle('rewind:getAnalyticsSnapshot', () => {
      return rewindAnalyticsEngine.getSnapshot();
    });

    ipcMain.handle('rewind:recomputeAnalyticsNow', async () => {
      await rewindAnalyticsEngine.computeNow();
      return rewindAnalyticsEngine.getSnapshot();
    });

    // -- Phase 5: Backups --
    ipcMain.handle('rewind:getBackupSettings', () => rewindPhase5Manager.getBackupSettings());
    ipcMain.handle('rewind:setBackupSchedule', (_e, schedule: 'daily' | '3days' | 'weekly') => {
      rewindPhase5Manager.setBackupSchedule(schedule);
      return true;
    });
    ipcMain.handle('rewind:setBackupFolder', (_e, folder: string) => {
      rewindPhase5Manager.setBackupFolder(folder);
      return true;
    });
    ipcMain.handle('rewind:runBackupNow', () => rewindPhase5Manager.createBackupNow());
    ipcMain.handle('rewind:pickBackupFolder', async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths[0]) return null;
      rewindPhase5Manager.setBackupFolder(result.filePaths[0]);
      return result.filePaths[0];
    });
    ipcMain.handle('rewind:restoreBackupFromPicker', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Rewind Backup', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
      const restored = rewindPhase5Manager.restoreBackup(result.filePaths[0]);
      if (restored.ok) {
        app.relaunch();
        app.exit(0);
      }
      return restored;
    });

    // -- Phase 5: Workspace Profiles --
    ipcMain.handle('rewind:getWorkspaceProfiles', () => rewindPhase5Manager.getProfiles());
    ipcMain.handle('rewind:getActiveWorkspaceProfile', () => rewindPhase5Manager.getActiveProfile());
    ipcMain.handle('rewind:saveWorkspaceProfile', (_e, profile: any) => rewindPhase5Manager.saveProfile(profile));
    ipcMain.handle('rewind:deleteWorkspaceProfile', (_e, profileId: string) => rewindPhase5Manager.deleteProfile(profileId));

    // -- Phase 5: First-run onboarding --
    ipcMain.handle('rewind:getOnboardingState', () => ({ completed: rewindPhase5Manager.isOnboardingCompleted() }));
    ipcMain.handle('rewind:skipOnboarding', () => { rewindPhase5Manager.skipOnboarding(); return true; });
    ipcMain.handle('rewind:completeOnboarding', (_e, payload: {
      excludedApps: string[];
      screenshotsEnabled: boolean;
      aiSearchEnabled: boolean;
      autoDelete30Days: boolean;
    }) => {
      rewindPhase5Manager.applyOnboardingSetup(payload);
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // UTILS
  // -------------------------------------------------------------------------

  private todayStr(): string {
    return this.formatDateStr(new Date());
  }

  private formatDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private genId(): string {
    return `rw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return hash.toString(36);
  }

  private getRecentActiveApps(minutes = 15): string[] {
    const now = Date.now();
    const cutoff = now - minutes * 60 * 1000;
    const today = this.readDay(this.todayStr());
    const unique = new Set<string>();
    for (const entry of today?.entries || []) {
      if (entry.timestamp >= cutoff && (entry.type === 'app' || entry.type === 'browser')) {
        unique.add(entry.appName);
      }
    }
    return Array.from(unique);
  }

  private getRewindDatabaseFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(this.rewindDir);
    return files;
  }

  private getFocusSessions(): any[] {
    try {
      if (!fs.existsSync(this.focusSessionsFile)) return [];
      const raw = JSON.parse(fs.readFileSync(this.focusSessionsFile, 'utf-8')) as { sessions: any[] };
      return (raw.sessions || []).sort((a, b) => b.startTs - a.startTs);
    } catch {
      return [];
    }
  }

  private finalizeFocusSession(session: Record<string, any>): any {
    const endTs = Date.now();
    const durationMs = Math.max(0, endTs - (session.startTs || endTs));
    const recentApps = this.getRecentActiveApps(60);
    const suggested = rewindLearningEngine.getSuggestedDistractions().map(v => v.toLowerCase());
    const distractions = recentApps.filter(appName => suggested.some(s => appName.toLowerCase().includes(s))).slice(0, 10);
    const distractionPenalty = Math.min(40, distractions.length * 8);
    const durationBonus = Math.min(30, Math.round(durationMs / 60000 / 2));
    const focusScore = Math.max(0, Math.min(100, 70 + durationBonus - distractionPenalty));

    const completed = {
      id: session.id,
      date: this.todayStr(),
      goal: session.goal || 'Focus session',
      startTs: session.startTs,
      endTs,
      durationMs,
      focusScore,
      distractions,
    };

    try {
      const store = fs.existsSync(this.focusSessionsFile)
        ? (JSON.parse(fs.readFileSync(this.focusSessionsFile, 'utf-8')) as { sessions: any[] })
        : { sessions: [] as any[] };
      store.sessions.push(completed);
      if (store.sessions.length > 5000) {
        store.sessions = store.sessions.slice(-5000);
      }
      fs.writeFileSync(this.focusSessionsFile, JSON.stringify(store, null, 2), 'utf-8');
      rewindLearningEngine.recordFocusSessionDistractions(distractions);
      return completed;
    } catch {
      return completed;
    }
  }

  private startMemoryMonitor(): void {
    if (this.memoryMonitorTimer) clearInterval(this.memoryMonitorTimer);
    this.memoryMonitorTimer = setInterval(() => {
      const mem = process.memoryUsage();
      const rssMb = mem.rss / (1024 * 1024);
      if (rssMb > 300) {
        log.warn(`[RewindEngine] Memory high: ${rssMb.toFixed(1)}MB`);
        if (typeof (global as any).gc === 'function') {
          try { (global as any).gc(); } catch (e) { log.warn('[RewindEngine] GC invocation failed:', e); }
        }
      }
      if (rssMb > 500) {
        this.restartWorker('poll-loop', 'RSS exceeded 500MB');
      }
    }, 60000);
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();
      const staleMs = 5 * 60 * 1000;

      if (this.settings.get('trackApps') && now - this.componentHealth.windowTracker.lastEventAt > staleMs) {
        this.restartWorker('windowTracker', 'No events for 5 minutes');
      }
      if (this.settings.get('trackClipboard') && now - this.componentHealth.clipboardMonitor.lastEventAt > staleMs) {
        this.restartWorker('clipboardMonitor', 'No events for 5 minutes');
      }
      if (this.settings.get('trackFiles') && now - this.componentHealth.fileWatcher.lastEventAt > staleMs) {
        this.restartWorker('fileWatcher', 'No events for 5 minutes');
      }
      if (this.settings.get('trackBrowser') && now - this.componentHealth.browserReader.lastEventAt > staleMs) {
        this.restartWorker('browserReader', 'No events for 5 minutes');
      }
    }, 60000);
  }

  private markComponentEvent(component: 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader'): void {
    this.componentHealth[component].lastEventAt = Date.now();
  }

  private markComponentError(component: 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader', error: any): void {
    this.componentHealth[component].errorCount += 1;
    rewindSecurityLayer.addAuditEntry('logger_component_error', `${component}: ${(error as Error)?.message || 'Unknown error'}`);
    const message = `${component}: ${(error as Error)?.message || 'Unknown error'}`;
    rewindLogger.error('RewindEngine', message);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('rewind:backgroundError', {
        message: 'A background component reported an error and was logged.',
        timestamp: Date.now(),
      });
    }
  }

  private restartWorker(component: 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader' | 'poll-loop', reason: string): void {
    if (component === 'fileWatcher') {
      this.fileWatchers.forEach(w => { try { w.close(); } catch (e) { log.warn('[RewindEngine] Watcher close failed:', e); } });
      this.fileWatchers = [];
      this.startFileWatchers();
    } else {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      const interval = this.settings.get('pollIntervalMs') || 5000;
      this.pollTimer = setInterval(() => this.poll(), interval);
    }

    if (component !== 'poll-loop' && this.componentHealth[component as 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader']) {
      this.componentHealth[component as 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader'].restarts += 1;
      this.componentHealth[component as 'windowTracker' | 'clipboardMonitor' | 'fileWatcher' | 'browserReader'].lastEventAt = Date.now();
    }

    rewindPhase5Manager.recordSelfHeal(component, reason);
    rewindSecurityLayer.addAuditEntry('self_heal_restart', `${component}: ${reason}`);
  }

  private registerUnhandledErrorHandlers(): void {
    if (this.unhandledHandlersRegistered) return;
    this.unhandledHandlersRegistered = true;

    process.on('unhandledRejection', (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      rewindLogger.error('UnhandledRejection', message);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('rewind:backgroundError', {
          message: 'A background error occurred and was logged.',
          timestamp: Date.now(),
        });
      }
    });

    process.on('uncaughtException', (error) => {
      rewindLogger.error('UncaughtException', error.message || 'Unknown error');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('rewind:backgroundError', {
          message: 'A background error occurred and was logged.',
          timestamp: Date.now(),
        });
      }
    });
  }

  // Public getter for tray sync
  getRecordingState(): boolean {
    return this.settings.get('isRecording');
  }

  toggleRecordingState(): boolean {
    const next = !this.settings.get('isRecording');
    this.settings.set('isRecording', next);
    if (next) {
      this.start();
    } else {
      this.stop();
    }
    return next;
  }
}

// ===========================================================================
// MODULE EXPORTS
// ===========================================================================

const rewindEngine = new RewindEngine();

export async function initializeRewind(mainWindow: BrowserWindow): Promise<void> {
  await rewindEngine.initialize(mainWindow);
}

export function shutdownRewind(): void {
  rewindEngine.shutdown();
}

export { rewindEngine };
