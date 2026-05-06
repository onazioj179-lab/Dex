// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Intelligence Engine
// ==========================================================================
// Feature 46: Naive Bayes Classifier (local, privacy-first)
// Feature 47: Predictive Pre-Warming (anticipate user actions)
// Feature 48: Search Result Ranking (contextual relevance)
// Feature 49: Proactive Resource Preparation
// Feature 50: Usage Pattern Pre-Loading
// ==========================================================================

import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Feature 46: Naive Bayes Classifier
// ---------------------------------------------------------------------------

interface ClassCounts {
  totalDocs: number;
  wordCounts: Map<string, number>;
  totalWords: number;
}

class NaiveBayesClassifier {
  private classes = new Map<string, ClassCounts>();
  private vocabulary = new Set<string>();
  private totalDocs = 0;

  train(text: string, label: string): void {
    const words = this.tokenize(text);

    let classCounts = this.classes.get(label);
    if (!classCounts) {
      classCounts = { totalDocs: 0, wordCounts: new Map(), totalWords: 0 };
      this.classes.set(label, classCounts);
    }

    classCounts.totalDocs++;
    this.totalDocs++;

    for (const word of words) {
      this.vocabulary.add(word);
      classCounts.wordCounts.set(word, (classCounts.wordCounts.get(word) || 0) + 1);
      classCounts.totalWords++;
    }
  }

  classify(text: string): { label: string; confidence: number; scores: Record<string, number> } {
    const words = this.tokenize(text);
    const scores: Record<string, number> = {};
    const vocabSize = this.vocabulary.size;

    for (const [label, classCounts] of this.classes) {
      // Prior probability P(class)
      let logProb = Math.log(classCounts.totalDocs / this.totalDocs);

      // Likelihood P(word|class) for each word with Laplace smoothing
      for (const word of words) {
        const wordCount = classCounts.wordCounts.get(word) || 0;
        const probability = (wordCount + 1) / (classCounts.totalWords + vocabSize);
        logProb += Math.log(probability);
      }

      scores[label] = logProb;
    }

    // Find highest scoring class
    let bestLabel = '';
    let bestScore = -Infinity;
    for (const [label, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    // Convert log-probs to confidence using softmax
    const maxScore = Math.max(...Object.values(scores));
    const expSum = Object.values(scores).reduce((sum, s) => sum + Math.exp(s - maxScore), 0);
    const confidence = Math.exp(bestScore - maxScore) / expSum;

    return { label: bestLabel, confidence: Math.round(confidence * 100) / 100, scores };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  getClassLabels(): string[] {
    return Array.from(this.classes.keys());
  }

  getStats(): { classes: number; vocabulary: number; totalDocs: number } {
    return {
      classes: this.classes.size,
      vocabulary: this.vocabulary.size,
      totalDocs: this.totalDocs,
    };
  }

  serialize(): string {
    const data: Record<string, { totalDocs: number; wordCounts: Record<string, number>; totalWords: number }> = {};
    for (const [label, counts] of this.classes) {
      data[label] = {
        totalDocs: counts.totalDocs,
        wordCounts: Object.fromEntries(counts.wordCounts),
        totalWords: counts.totalWords,
      };
    }
    return JSON.stringify({
      classes: data,
      vocabulary: Array.from(this.vocabulary),
      totalDocs: this.totalDocs,
    });
  }

  deserialize(json: string): void {
    const data = JSON.parse(json);
    this.totalDocs = data.totalDocs;
    this.vocabulary = new Set(data.vocabulary);

    for (const [label, counts] of Object.entries(data.classes) as any) {
      this.classes.set(label, {
        totalDocs: counts.totalDocs,
        wordCounts: new Map(Object.entries(counts.wordCounts)),
        totalWords: counts.totalWords,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 47: Predictive Pre-Warming
// ---------------------------------------------------------------------------

interface TransitionRecord {
  from: string;
  to: string;
  count: number;
  avgDwellMs: number;
}

class PredictivePreWarmer {
  private transitions = new Map<string, TransitionRecord[]>();
  private currentState = '';
  private stateEnteredAt = 0;
  private preWarmCallbacks = new Map<string, () => void>();
  private preWarmedStates = new Set<string>();

  recordTransition(from: string, to: string): void {
    const key = from;
    const existing = this.transitions.get(key) || [];

    const record = existing.find(t => t.to === to);
    if (record) {
      record.count++;
      if (this.stateEnteredAt > 0) {
        const dwellMs = Date.now() - this.stateEnteredAt;
        record.avgDwellMs = (record.avgDwellMs * (record.count - 1) + dwellMs) / record.count;
      }
    } else {
      existing.push({
        from,
        to,
        count: 1,
        avgDwellMs: this.stateEnteredAt > 0 ? Date.now() - this.stateEnteredAt : 5000,
      });
    }

    this.transitions.set(key, existing);
    this.currentState = to;
    this.stateEnteredAt = Date.now();

    // Pre-warm predicted next states
    this.preWarmPredicted(to);
  }

  registerPreWarmCallback(state: string, callback: () => void): void {
    this.preWarmCallbacks.set(state, callback);
  }

  private preWarmPredicted(currentState: string): void {
    const transitions = this.transitions.get(currentState);
    if (!transitions) return;

    // Sort by count descending
    const sorted = [...transitions].sort((a, b) => b.count - a.count);

    // Pre-warm top 2 predicted states
    for (const prediction of sorted.slice(0, 2)) {
      if (prediction.count >= 2 && !this.preWarmedStates.has(prediction.to)) {
        const callback = this.preWarmCallbacks.get(prediction.to);
        if (callback) {
          try {
            callback();
            this.preWarmedStates.add(prediction.to);
            log.info(`[PreWarm] Pre-warmed '${prediction.to}' (probability: ${this.getProbability(currentState, prediction.to)}%)`);
          } catch { /* ok */ }
        }
      }
    }

    // Clear pre-warm cache periodically
    if (this.preWarmedStates.size > 20) {
      this.preWarmedStates.clear();
    }
  }

  getPredictions(state: string, topN: number = 3): Array<{ state: string; probability: number }> {
    const transitions = this.transitions.get(state);
    if (!transitions) return [];

    const totalCount = transitions.reduce((sum, t) => sum + t.count, 0);
    return transitions
      .sort((a, b) => b.count - a.count)
      .slice(0, topN)
      .map(t => ({
        state: t.to,
        probability: Math.round((t.count / totalCount) * 100),
      }));
  }

  private getProbability(from: string, to: string): number {
    const transitions = this.transitions.get(from);
    if (!transitions) return 0;

    const totalCount = transitions.reduce((sum, t) => sum + t.count, 0);
    const target = transitions.find(t => t.to === to);
    if (!target) return 0;

    return Math.round((target.count / totalCount) * 100);
  }

  getStats(): { uniqueStates: number; totalTransitions: number } {
    let totalTransitions = 0;
    for (const [, records] of this.transitions) {
      totalTransitions += records.reduce((sum, r) => sum + r.count, 0);
    }
    return {
      uniqueStates: this.transitions.size,
      totalTransitions,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 48: Search Result Ranking
// ---------------------------------------------------------------------------

interface RankingSignal {
  name: string;
  weight: number;
  value: number;
}

export interface RankedResult {
  id: string;
  score: number;
  signals: RankingSignal[];
  originalIndex: number;
}

class SearchResultRanker {
  private userPreferences = new Map<string, number>(); // item -> click weight
  private recentlyAccessed = new Map<string, number>(); // item -> timestamp
  private frequencyMap = new Map<string, number>(); // item -> access count

  recordClick(itemId: string): void {
    this.userPreferences.set(itemId, (this.userPreferences.get(itemId) || 0) + 1);
    this.recentlyAccessed.set(itemId, Date.now());
    this.frequencyMap.set(itemId, (this.frequencyMap.get(itemId) || 0) + 1);
  }

  rank(results: Array<{ id: string; textScore: number }>): RankedResult[] {
    const now = Date.now();
    const maxFreq = Math.max(1, ...Array.from(this.frequencyMap.values()));
    const maxTextScore = Math.max(1, ...results.map(r => r.textScore));

    return results.map((result, idx) => {
      const signals: RankingSignal[] = [];

      // Text relevance (normalized 0-1)
      const textRelevance = result.textScore / maxTextScore;
      signals.push({ name: 'text-relevance', weight: 0.5, value: textRelevance });

      // Frequency (normalized 0-1)
      const freq = (this.frequencyMap.get(result.id) || 0) / maxFreq;
      signals.push({ name: 'frequency', weight: 0.25, value: freq });

      // Recency (decays over 24 hours)
      const lastAccessed = this.recentlyAccessed.get(result.id);
      const recency = lastAccessed ? Math.max(0, 1 - (now - lastAccessed) / (24 * 60 * 60 * 1000)) : 0;
      signals.push({ name: 'recency', weight: 0.15, value: recency });

      // User preference (click-through weight)
      const prefWeight = this.userPreferences.get(result.id) || 0;
      const normalizedPref = Math.min(1, prefWeight / 10);
      signals.push({ name: 'user-preference', weight: 0.1, value: normalizedPref });

      // Weighted sum
      const score = signals.reduce((sum, s) => sum + s.weight * s.value, 0);

      return { id: result.id, score, signals, originalIndex: idx };
    }).sort((a, b) => b.score - a.score);
  }

  getStats(): { trackedItems: number; totalClicks: number } {
    return {
      trackedItems: this.frequencyMap.size,
      totalClicks: Array.from(this.frequencyMap.values()).reduce((a, b) => a + b, 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 49: Proactive Resource Preparation
// ---------------------------------------------------------------------------

interface ResourceHint {
  type: 'file' | 'data' | 'module' | 'connection';
  target: string;
  priority: number;
  preparedAt: number;
  usedAt: number;
}

class ProactiveResourcePreparation {
  private hints = new Map<string, ResourceHint>();
  private preparationCallbacks = new Map<string, () => Promise<void>>();
  private prepEnabled = true;

  registerPreparation(type: string, callback: () => Promise<void>): void {
    this.preparationCallbacks.set(type, callback);
  }

  async hint(type: 'file' | 'data' | 'module' | 'connection', target: string, priority: number = 0): Promise<void> {
    if (!this.prepEnabled) return;

    const key = `${type}:${target}`;
    if (this.hints.has(key)) return; // Already prepared

    this.hints.set(key, {
      type,
      target,
      priority,
      preparedAt: Date.now(),
      usedAt: 0,
    });

    const callback = this.preparationCallbacks.get(type);
    if (callback) {
      try {
        await callback();
      } catch { /* ok */ }
    }
  }

  markUsed(type: string, target: string): void {
    const key = `${type}:${target}`;
    const hint = this.hints.get(key);
    if (hint) {
      hint.usedAt = Date.now();
    }
  }

  setEnabled(enabled: boolean): void {
    this.prepEnabled = enabled;
    if (!enabled) this.hints.clear();
  }

  getHitRate(): number {
    const hints = Array.from(this.hints.values());
    if (hints.length === 0) return 0;
    const used = hints.filter(h => h.usedAt > 0).length;
    return used / hints.length;
  }

  getStats(): { totalHints: number; usedHints: number; hitRate: number } {
    const total = this.hints.size;
    const used = Array.from(this.hints.values()).filter(h => h.usedAt > 0).length;
    return {
      totalHints: total,
      usedHints: used,
      hitRate: total > 0 ? Math.round((used / total) * 100) / 100 : 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 50: Usage Pattern Pre-Loading
// ---------------------------------------------------------------------------

interface UsageSession {
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23
  actions: string[];
  filesAccessed: string[];
  timestamp: number;
}

class UsagePatternPreLoader {
  private sessions: UsageSession[] = [];
  private currentSession: UsageSession | null = null;
  private maxSessions = 1000;
  private preLoadCallbacks = new Map<string, (targets: string[]) => void>();

  initialize(): void {
    this.startNewSession();

    // Pre-load based on historical patterns every 5 minutes
    setInterval(() => {
      this.predictAndPreLoad();
    }, 5 * 60 * 1000);

    log.info('[UsagePatternPreLoad] Feature 50: Usage pattern pre-loader initialized');
  }

  private startNewSession(): void {
    const now = new Date();
    this.currentSession = {
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
      actions: [],
      filesAccessed: [],
      timestamp: Date.now(),
    };
  }

  recordAction(action: string): void {
    if (!this.currentSession) this.startNewSession();
    this.currentSession!.actions.push(action);

    // Roll session every 30 minutes
    if (this.currentSession!.actions.length > 500) {
      this.endSession();
      this.startNewSession();
    }
  }

  recordFileAccess(filePath: string): void {
    if (!this.currentSession) this.startNewSession();
    this.currentSession!.filesAccessed.push(filePath);
  }

  registerPreLoadCallback(type: string, callback: (targets: string[]) => void): void {
    this.preLoadCallbacks.set(type, callback);
  }

  private endSession(): void {
    if (this.currentSession) {
      this.sessions.push(this.currentSession);
      if (this.sessions.length > this.maxSessions) {
        this.sessions = this.sessions.slice(-this.maxSessions / 2);
      }
    }
  }

  private predictAndPreLoad(): void {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hourOfDay = now.getHours();

    // Find similar past sessions
    const similar = this.sessions.filter(s =>
      s.dayOfWeek === dayOfWeek &&
      Math.abs(s.hourOfDay - hourOfDay) <= 1
    );

    if (similar.length < 3) return; // Not enough data

    // Aggregate most common actions and files
    const actionCounts = new Map<string, number>();
    const fileCounts = new Map<string, number>();

    for (const session of similar) {
      for (const action of session.actions) {
        actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
      }
      for (const file of session.filesAccessed) {
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
      }
    }

    // Pre-load top files
    const topFiles = Array.from(fileCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => file);

    const fileCallback = this.preLoadCallbacks.get('files');
    if (fileCallback && topFiles.length > 0) {
      try { fileCallback(topFiles); } catch { /* ok */ }
    }

    // Pre-load top actions
    const topActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action]) => action);

    const actionCallback = this.preLoadCallbacks.get('actions');
    if (actionCallback && topActions.length > 0) {
      try { actionCallback(topActions); } catch { /* ok */ }
    }
  }

  getPatterns(): {
    dayOfWeek: number;
    hourOfDay: number;
    topActions: string[];
    topFiles: string[];
  }[] {
    const patterns: Map<string, { actions: Map<string, number>; files: Map<string, number>; count: number }> = new Map();

    for (const session of this.sessions) {
      const key = `${session.dayOfWeek}-${session.hourOfDay}`;
      let p = patterns.get(key);
      if (!p) {
        p = { actions: new Map(), files: new Map(), count: 0 };
        patterns.set(key, p);
      }
      p.count++;
      for (const a of session.actions) p.actions.set(a, (p.actions.get(a) || 0) + 1);
      for (const f of session.filesAccessed) p.files.set(f, (p.files.get(f) || 0) + 1);
    }

    return Array.from(patterns.entries()).map(([key, p]) => {
      const [day, hour] = key.split('-').map(Number);
      return {
        dayOfWeek: day,
        hourOfDay: hour,
        topActions: Array.from(p.actions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a),
        topFiles: Array.from(p.files.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f]) => f),
      };
    });
  }

  getStats(): { totalSessions: number; patternsDetected: number } {
    const patterns = new Set<string>();
    for (const s of this.sessions) {
      patterns.add(`${s.dayOfWeek}-${s.hourOfDay}`);
    }
    return {
      totalSessions: this.sessions.length,
      patternsDetected: patterns.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const bayesClassifier = new NaiveBayesClassifier();
export const predictivePreWarmer = new PredictivePreWarmer();
export const searchRanker = new SearchResultRanker();
export const proactivePrep = new ProactiveResourcePreparation();
export const usagePreLoader = new UsagePatternPreLoader();

export function initializeIntelligenceEngine(): void {
  usagePreLoader.initialize();
  log.info('[IntelligenceEngine] Features 46-50: Intelligence engine initialized');
}

export function shutdownIntelligenceEngine(): void {
  // Stateless singletons, no cleanup needed
  log.info('[IntelligenceEngine] Shutdown complete');
}
