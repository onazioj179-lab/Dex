// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Rewind - Silent Learning Engine (Phase 4)
 *
 * Learns from user behavior over time without prompts.
 * - App usage sequence patterns (predict next app)
 * - Peak productivity window detection (best 2h block)
 * - Distraction pattern learning (focus-session analysis)
 * - Search behavior boosting (frequent queries/results)
 *
 * All data in a dedicated SQLite-compatible JSON store.
 * Runs on a background timer so it never blocks the UI thread.
 * Everything stays local. No network, no model downloads.
 *
 * @author  Onazi Treasure OJ
 * @license MIT
 */

import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export interface AppSequencePattern {
  id: string;
  sequence: string[];        // e.g. ['Code', 'Chrome', 'Slack']
  count: number;             // how many times seen
  lastSeen: number;          // timestamp
  learnedAt: number;         // when count first reached 5
  predictedNext: string;     // app likely to follow
}

export interface PeakWindow {
  dayOfWeek: number;         // 0=Sun..6=Sat
  startHour: number;         // 0-22
  endHour: number;           // startHour + 2
  avgEvents: number;         // average events in that window
  updatedAt: number;
}

export interface DistractionPattern {
  appName: string;
  focusSessionAppearances: number;  // how many focus sessions it appeared in
  firstSeen: number;
  lastSeen: number;
  suggested: boolean;        // true once >= 3 appearances
}

export interface SearchBoost {
  query: string;
  clickedEntryIds: string[];
  searchCount: number;
  lastSearched: number;
}

export interface LearningData {
  sequences: AppSequencePattern[];
  peakWindows: PeakWindow[];
  distractions: DistractionPattern[];
  searchBoosts: SearchBoost[];
  lastAnalysisRun: number;
  totalPatternsLearned: number;
}

export interface LearningStatus {
  workerActive: boolean;
  currentTask: string;
  patternsLearned: number;
  lastRunTimestamp: number;
  sequencesTracked: number;
  peakWindowsDetected: number;
  distractionsIdentified: number;
  searchBoostsStored: number;
}

// ===========================================================================
// LEARNING ENGINE
// ===========================================================================

class RewindLearningEngine {
  private dataFile: string;
  private data: LearningData;
  private analysisTimer: NodeJS.Timeout | null = null;
  private workerActive = false;
  private currentTask = 'idle';
  private rewindDir: string;

  // Recent app window buffer for sequence detection
  private recentApps: { name: string; timestamp: number }[] = [];
  private readonly SEQUENCE_LENGTH = 3;
  private readonly MIN_PATTERN_COUNT = 5;
  private readonly ANALYSIS_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

  constructor() {
    this.rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.dataFile = path.join(this.rewindDir, 'learning-data.json');
    this.data = this.loadData();
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    if (this.analysisTimer) return;
    this.workerActive = true;
    this.currentTask = 'idle';

    // Run analysis periodically
    this.analysisTimer = setInterval(() => this.runFullAnalysis(), this.ANALYSIS_INTERVAL_MS);

    // Initial analysis after 30 seconds
    setTimeout(() => this.runFullAnalysis(), 30000);

    log.info('[LearningEngine] Started');
  }

  stop(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    this.workerActive = false;
    this.currentTask = 'stopped';
    this.saveData();
    log.info('[LearningEngine] Stopped');
  }

  // -------------------------------------------------------------------------
  // PUBLIC API -- called by RewindEngine on every event
  // -------------------------------------------------------------------------

  /** Called whenever a new app window is detected */
  recordAppSwitch(appName: string): void {
    if (!appName || appName === 'Unknown') return;

    const now = Date.now();
    // Deduplicate rapid re-fires for same app
    const last = this.recentApps[this.recentApps.length - 1];
    if (last && last.name === appName && now - last.timestamp < 2000) return;

    this.recentApps.push({ name: appName, timestamp: now });

    // Keep only last 50 entries
    if (this.recentApps.length > 50) {
      this.recentApps = this.recentApps.slice(-50);
    }

    // Check for sequence pattern
    this.detectSequence();
  }

  /** Called when a focus session ends with distraction data */
  recordFocusSessionDistractions(distractingApps: string[]): void {
    for (const appName of distractingApps) {
      if (!appName) continue;
      const existing = this.data.distractions.find(
        d => d.appName.toLowerCase() === appName.toLowerCase()
      );
      if (existing) {
        existing.focusSessionAppearances++;
        existing.lastSeen = Date.now();
        if (existing.focusSessionAppearances >= 3 && !existing.suggested) {
          existing.suggested = true;
          log.info(`[LearningEngine] Distraction pattern learned: ${appName}`);
        }
      } else {
        this.data.distractions.push({
          appName,
          focusSessionAppearances: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          suggested: false,
        });
      }
    }
    this.saveData();
  }

  /** Called on every search to learn query + clicked result */
  recordSearchQuery(query: string): void {
    if (!query || query.length < 2) return;
    const normalized = query.toLowerCase().trim();
    const existing = this.data.searchBoosts.find(s => s.query === normalized);
    if (existing) {
      existing.searchCount++;
      existing.lastSearched = Date.now();
    } else {
      this.data.searchBoosts.push({
        query: normalized,
        clickedEntryIds: [],
        searchCount: 1,
        lastSearched: Date.now(),
      });
    }
    // Keep only top 200 searches
    this.data.searchBoosts.sort((a, b) => b.searchCount - a.searchCount);
    if (this.data.searchBoosts.length > 200) {
      this.data.searchBoosts = this.data.searchBoosts.slice(0, 200);
    }
    this.saveData();
  }

  /** Called when user clicks a search result */
  recordSearchClick(query: string, entryId: string): void {
    const normalized = query.toLowerCase().trim();
    const existing = this.data.searchBoosts.find(s => s.query === normalized);
    if (existing) {
      if (!existing.clickedEntryIds.includes(entryId)) {
        existing.clickedEntryIds.push(entryId);
        if (existing.clickedEntryIds.length > 20) {
          existing.clickedEntryIds = existing.clickedEntryIds.slice(-20);
        }
      }
      this.saveData();
    }
  }

  /** Boost search results based on learned click patterns */
  boostSearchResults(query: string, results: any[]): any[] {
    if (!results || results.length === 0) return results;
    const normalized = query.toLowerCase().trim();

    // Find matching learned queries
    const boost = this.data.searchBoosts.find(s => {
      return normalized.includes(s.query) || s.query.includes(normalized);
    });

    if (!boost || boost.clickedEntryIds.length === 0) return results;

    // Move previously-clicked results to the top
    const boostedIds = new Set(boost.clickedEntryIds);
    const boosted: any[] = [];
    const rest: any[] = [];
    for (const r of results) {
      if (boostedIds.has(r.id)) {
        boosted.push(r);
      } else {
        rest.push(r);
      }
    }
    return [...boosted, ...rest];
  }

  /** Get predicted next app based on recent sequence */
  getPredictedNextApp(): string | null {
    if (this.recentApps.length < this.SEQUENCE_LENGTH - 1) return null;

    const tail = this.recentApps.slice(-(this.SEQUENCE_LENGTH - 1)).map(a => a.name);

    for (const pattern of this.data.sequences) {
      if (pattern.count < this.MIN_PATTERN_COUNT) continue;
      const patternHead = pattern.sequence.slice(0, this.SEQUENCE_LENGTH - 1);
      if (patternHead.length === tail.length && patternHead.every((v, i) => v === tail[i])) {
        return pattern.predictedNext;
      }
    }
    return null;
  }

  /** Get the peak productivity window for today's day-of-week */
  getPeakWindowForToday(): PeakWindow | null {
    const dow = new Date().getDay();
    return this.data.peakWindows.find(p => p.dayOfWeek === dow) || null;
  }

  /** Check if current time is in the peak window */
  isInPeakWindow(): boolean {
    const peak = this.getPeakWindowForToday();
    if (!peak) return false;
    const hour = new Date().getHours();
    return hour >= peak.startHour && hour < peak.endHour;
  }

  /** Get suggested distractions (apps seen in 3+ focus sessions) */
  getSuggestedDistractions(): string[] {
    return this.data.distractions
      .filter(d => d.suggested)
      .map(d => d.appName);
  }

  /** Get full status for the Status dashboard */
  getStatus(): LearningStatus {
    return {
      workerActive: this.workerActive,
      currentTask: this.currentTask,
      patternsLearned: this.data.totalPatternsLearned,
      lastRunTimestamp: this.data.lastAnalysisRun,
      sequencesTracked: this.data.sequences.length,
      peakWindowsDetected: this.data.peakWindows.length,
      distractionsIdentified: this.data.distractions.filter(d => d.suggested).length,
      searchBoostsStored: this.data.searchBoosts.length,
    };
  }

  /** Get all learned patterns for display */
  getLearnedPatterns(): {
    sequences: AppSequencePattern[];
    peakWindows: PeakWindow[];
    distractions: DistractionPattern[];
  } {
    return {
      sequences: this.data.sequences.filter(s => s.count >= this.MIN_PATTERN_COUNT),
      peakWindows: this.data.peakWindows,
      distractions: this.data.distractions,
    };
  }

  // -------------------------------------------------------------------------
  // SEQUENCE DETECTION
  // -------------------------------------------------------------------------

  private detectSequence(): void {
    if (this.recentApps.length < this.SEQUENCE_LENGTH + 1) return;

    // Build sequence from recent apps: [A, B, C] -> predict D
    const recent = this.recentApps.slice(-(this.SEQUENCE_LENGTH + 1));
    const seq = recent.slice(0, this.SEQUENCE_LENGTH).map(a => a.name);
    const nextApp = recent[this.SEQUENCE_LENGTH].name;

    // Check if all apps in sequence are different (skip trivial self-loops)
    if (new Set(seq).size < 2) return;

    const seqKey = seq.join('|');
    const existing = this.data.sequences.find(
      s => s.sequence.join('|') === seqKey && s.predictedNext === nextApp
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      if (existing.count === this.MIN_PATTERN_COUNT && !existing.learnedAt) {
        existing.learnedAt = Date.now();
        this.data.totalPatternsLearned++;
        log.info(`[LearningEngine] Sequence pattern learned: ${seqKey} -> ${nextApp}`);
      }
    } else {
      this.data.sequences.push({
        id: `seq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sequence: seq,
        count: 1,
        lastSeen: Date.now(),
        learnedAt: 0,
        predictedNext: nextApp,
      });
    }

    // Keep only the top 500 sequences
    if (this.data.sequences.length > 500) {
      this.data.sequences.sort((a, b) => b.count - a.count);
      this.data.sequences = this.data.sequences.slice(0, 500);
    }
  }

  // -------------------------------------------------------------------------
  // FULL BACKGROUND ANALYSIS
  // -------------------------------------------------------------------------

  private async runFullAnalysis(): Promise<void> {
    if (!this.workerActive) return;

    try {
      // Peak window detection
      this.currentTask = 'analyzing peak productivity';
      await this.analyzePeakWindows();

      // Clean stale data
      this.currentTask = 'cleaning stale patterns';
      this.cleanStaleData();

      this.data.lastAnalysisRun = Date.now();
      this.currentTask = 'idle';
      this.saveData();
    } catch (err) {
      log.warn('[LearningEngine] Analysis error:', err);
      this.currentTask = 'idle';
    }
  }

  private async analyzePeakWindows(): Promise<void> {
    try {
      // Read last 7 days of activity data
      const hourlyActivity: Record<number, number[]> = {};
      for (let dow = 0; dow < 7; dow++) {
        hourlyActivity[dow] = new Array(24).fill(0);
      }

      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = this.formatDateStr(d);
        const dayFile = path.join(this.rewindDir, `${dateStr}.json`);

        if (!fs.existsSync(dayFile)) continue;

        try {
          const raw = JSON.parse(fs.readFileSync(dayFile, 'utf-8'));
          const entries = raw.entries || [];
          const dow = d.getDay();

          for (const entry of entries) {
            const hour = new Date(entry.timestamp).getHours();
            hourlyActivity[dow][hour]++;
          }
        } catch (e) { log.warn('[RewindLearning] Activity analysis error:', e); }
      }

      // Find best 2-hour window per day-of-week
      const newPeakWindows: PeakWindow[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const hours = hourlyActivity[dow];
        let bestStart = 0;
        let bestTotal = 0;

        for (let h = 0; h <= 22; h++) {
          const total = hours[h] + hours[h + 1];
          if (total > bestTotal) {
            bestTotal = total;
            bestStart = h;
          }
        }

        if (bestTotal > 0) {
          newPeakWindows.push({
            dayOfWeek: dow,
            startHour: bestStart,
            endHour: bestStart + 2,
            avgEvents: bestTotal,
            updatedAt: Date.now(),
          });
        }
      }

      this.data.peakWindows = newPeakWindows;
    } catch (err) {
      log.warn('[LearningEngine] Peak window analysis error:', err);
    }
  }

  private cleanStaleData(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Remove sequences not seen in 30 days
    this.data.sequences = this.data.sequences.filter(s => s.lastSeen > thirtyDaysAgo);

    // Remove search boosts not used in 30 days
    this.data.searchBoosts = this.data.searchBoosts.filter(s => s.lastSearched > thirtyDaysAgo);

    // Remove distraction patterns not seen in 30 days
    this.data.distractions = this.data.distractions.filter(d => d.lastSeen > thirtyDaysAgo);
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private loadData(): LearningData {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
        return {
          sequences: raw.sequences || [],
          peakWindows: raw.peakWindows || [],
          distractions: raw.distractions || [],
          searchBoosts: raw.searchBoosts || [],
          lastAnalysisRun: raw.lastAnalysisRun || 0,
          totalPatternsLearned: raw.totalPatternsLearned || 0,
        };
      }
    } catch (err) {
      log.warn('[LearningEngine] Load error, starting fresh:', err);
    }
    return {
      sequences: [],
      peakWindows: [],
      distractions: [],
      searchBoosts: [],
      lastAnalysisRun: 0,
      totalPatternsLearned: 0,
    };
  }

  private saveData(): void {
    try {
      if (!fs.existsSync(path.dirname(this.dataFile))) {
        fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[LearningEngine] Save error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // UTILS
  // -------------------------------------------------------------------------

  private formatDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const rewindLearningEngine = new RewindLearningEngine();
