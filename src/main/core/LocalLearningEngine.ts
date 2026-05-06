// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 6: Local Learning & Reflection (PRIVACY-FIRST)
// ===========================================================================
// Dex should learn the user's patterns and preferences--
// but ALL learning stays LOCAL. No cloud. No leakage.
// Patterns are EXPLAINABLE to the user and deletable.
// User can inspect what Dex has "learned" and reset it anytime.
// ===========================================================================
// Rules 76-80: Intelligence / Learning Architecture
// 76. Confidence scoring with Bayesian-style weight decay
// 77. Pattern decay over time (unused lower confidence)
// 78. Prediction accuracy tracking (predicted vs actual)
// 79. Cold-start heuristics for new users
// 80. Pattern deduplication and merging
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type PatternCategory = 
  | 'work-hours'
  | 'file-preferences'
  | 'app-usage'
  | 'search-habits'
  | 'automation-triggers'
  | 'organization-style'
  | 'focus-patterns';

export interface LearnedPattern {
  id: string;
  category: PatternCategory;
  name: string;
  description: string;  // Human-readable explanation
  
  // When was this learned
  firstObserved: number;
  lastObserved: number;
  observationCount: number;
  
  // Confidence and weight
  confidence: number;  // 0-1
  weight: number;      // How important is this pattern
  
  // The actual pattern data (structured for explainability)
  data: PatternData;
  
  // Evidence (for explainability)
  evidence: PatternEvidence[];
  
  // User control
  userConfirmed: boolean;
  userAdjusted: boolean;
  hidden: boolean;
}

export type PatternData = 
  | WorkHoursPattern
  | FilePreferencePattern
  | AppUsagePattern
  | SearchHabitPattern
  | OrganizationPattern
  | FocusPattern;

export interface WorkHoursPattern {
  type: 'work-hours';
  peakHours: { start: number; end: number }[];  // 24-hour format
  peakDays: number[];  // 0-6 (Sunday-Saturday)
  averageSessionLength: number;  // minutes
}

export interface FilePreferencePattern {
  type: 'file-preferences';
  preferredLocations: Array<{
    path: string;
    purpose: string;
    frequency: number;
  }>;
  commonFileTypes: Array<{
    extension: string;
    frequency: number;
  }>;
}

export interface AppUsagePattern {
  type: 'app-usage';
  commonWorkflows: Array<{
    apps: string[];
    frequency: number;
    context?: string;
  }>;
  appPreferences: Record<string, {
    preferredForTask: string;
    usageCount: number;
  }>;
}

export interface SearchHabitPattern {
  type: 'search-habits';
  commonQueries: Array<{
    pattern: string;
    frequency: number;
  }>;
  preferredFilters: Record<string, number>;  // filter -> usage count
}

export interface OrganizationPattern {
  type: 'organization-style';
  namingConventions: Array<{
    pattern: string;
    examples: string[];
    frequency: number;
  }>;
  folderStructurePreferences: Array<{
    structure: string;
    frequency: number;
  }>;
}

export interface FocusPattern {
  type: 'focus-patterns';
  averageFocusDuration: number;  // minutes
  preferredFocusTimes: { start: number; end: number }[];
  commonDistractions: string[];
}

export interface PatternEvidence {
  timestamp: number;
  type: string;
  description: string;
  data?: any;
}

export interface LearningInsight {
  id: string;
  patternIds: string[];
  insight: string;
  recommendation: string;
  createdAt: number;
  acknowledgedAt?: number;
  dismissedAt?: number;
}

export interface LearningPreferences {
  enabled: boolean;
  categories: Record<PatternCategory, boolean>;
  retentionDays: number;
  minConfidenceToShow: number;
  autoSuggest: boolean;
}

// ===========================================================================
// LOCAL LEARNING ENGINE
// ===========================================================================

class LocalLearningEngineClass extends EventEmitter {
  private patterns: Map<string, LearnedPattern> = new Map();
  private insights: Map<string, LearningInsight> = new Map();
  private preferences: LearningPreferences;
  private observations: PatternEvidence[] = [];
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Limits
  private readonly MAX_PATTERNS = 200;
  private readonly MAX_EVIDENCE_PER_PATTERN = 50;
  private readonly MAX_OBSERVATIONS_BUFFER = 1000;
  private readonly MIN_OBSERVATIONS_FOR_PATTERN = 5;
  private readonly ANALYSIS_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour

  private analysisInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'learning');
    this.preferences = this.defaultPreferences();
    this.setMaxListeners(20);
  }

  private defaultPreferences(): LearningPreferences {
    return {
      enabled: true,
      categories: {
        'work-hours': true,
        'file-preferences': true,
        'app-usage': true,
        'search-habits': true,
        'automation-triggers': true,
        'organization-style': true,
        'focus-patterns': true,
      },
      retentionDays: 90,
      minConfidenceToShow: 0.6,
      autoSuggest: true,
    };
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadData();
    this.registerIPCHandlers();
    this.startAnalysis();

    this.isInitialized = true;
    log.info('[Learning] Local learning engine initialized');
  }

  shutdown(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.saveData();
    this.removeAllListeners();
    log.info('[Learning] Learning engine shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      // Load patterns
      const patternsPath = path.join(this.dataPath, 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const data = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
        for (const pattern of data.patterns || []) {
          this.patterns.set(pattern.id, pattern);
        }
      }

      // Load preferences
      const prefsPath = path.join(this.dataPath, 'preferences.json');
      if (fs.existsSync(prefsPath)) {
        this.preferences = {
          ...this.defaultPreferences(),
          ...JSON.parse(fs.readFileSync(prefsPath, 'utf-8')),
        };
      }

      // Load observations buffer
      const obsPath = path.join(this.dataPath, 'observations.json');
      if (fs.existsSync(obsPath)) {
        const data = JSON.parse(fs.readFileSync(obsPath, 'utf-8'));
        this.observations = data.observations || [];
      }

      log.info(`[Learning] Loaded ${this.patterns.size} patterns`);
    } catch (error) {
      log.error('[Learning] Failed to load data:', error);
    }
  }

  private saveData(): void {
    try {
      // Save patterns
      const patternsPath = path.join(this.dataPath, 'patterns.json');
      fs.writeFileSync(patternsPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        patterns: Array.from(this.patterns.values()),
      }, null, 2));

      // Save preferences
      const prefsPath = path.join(this.dataPath, 'preferences.json');
      fs.writeFileSync(prefsPath, JSON.stringify(this.preferences, null, 2));

      // Save observations (recent only)
      const obsPath = path.join(this.dataPath, 'observations.json');
      fs.writeFileSync(obsPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        observations: this.observations.slice(-this.MAX_OBSERVATIONS_BUFFER),
      }, null, 2));
    } catch (error) {
      log.error('[Learning] Failed to save data:', error);
    }
  }

  private startAnalysis(): void {
    this.analysisInterval = setInterval(() => {
      if (this.preferences.enabled) {
        this.analyzeObservations();
      }
    }, this.ANALYSIS_INTERVAL_MS);
  }

  // -------------------------------------------------------------------------
  // OBSERVATION RECORDING
  // -------------------------------------------------------------------------

  /**
   * Record an observation (called by other systems)
   */
  recordObservation(params: {
    type: string;
    category: PatternCategory;
    description: string;
    data?: any;
  }): void {
    if (!this.preferences.enabled) return;
    if (!this.preferences.categories[params.category]) return;

    const observation: PatternEvidence = {
      timestamp: Date.now(),
      type: params.type,
      description: params.description,
      data: params.data,
    };

    this.observations.push(observation);

    // Trim old observations
    if (this.observations.length > this.MAX_OBSERVATIONS_BUFFER) {
      this.observations = this.observations.slice(-this.MAX_OBSERVATIONS_BUFFER);
    }

    this.emit('observation-recorded', observation);
  }

  // -------------------------------------------------------------------------
  // PATTERN ANALYSIS
  // -------------------------------------------------------------------------

  /**
   * Analyze observations and extract patterns
   */
  private analyzeObservations(): void {
    log.debug('[Learning] Analyzing observations...');

    const now = Date.now();
    const retentionMs = this.preferences.retentionDays * 24 * 60 * 60 * 1000;
    const relevantObservations = this.observations.filter(
      o => now - o.timestamp < retentionMs
    );

    // Analyze by category
    this.analyzeWorkHours(relevantObservations);
    this.analyzeFilePreferences(relevantObservations);
    this.analyzeSearchHabits(relevantObservations);
    this.analyzeOrganization(relevantObservations);

    // Cleanup old patterns
    this.cleanupPatterns();

    // Save
    this.saveData();

    log.debug(`[Learning] Analysis complete. ${this.patterns.size} patterns.`);
  }

  private analyzeWorkHours(observations: PatternEvidence[]): void {
    if (!this.preferences.categories['work-hours']) return;

    const activityByHour: number[] = new Array(24).fill(0);
    const activityByDay: number[] = new Array(7).fill(0);
    const sessionLengths: number[] = [];

    let lastActivity = 0;
    let sessionStart = 0;

    for (const obs of observations.filter(o => o.type === 'activity')) {
      const date = new Date(obs.timestamp);
      activityByHour[date.getHours()]++;
      activityByDay[date.getDay()]++;

      // Track session lengths
      if (lastActivity && obs.timestamp - lastActivity > 30 * 60 * 1000) {
        // New session
        if (sessionStart) {
          sessionLengths.push((lastActivity - sessionStart) / 60000);
        }
        sessionStart = obs.timestamp;
      }
      if (!sessionStart) sessionStart = obs.timestamp;
      lastActivity = obs.timestamp;
    }

    // Find peak hours (above average)
    const avgHourly = activityByHour.reduce((a, b) => a + b, 0) / 24;
    const peakHours: { start: number; end: number }[] = [];
    let peakStart: number | null = null;

    for (let i = 0; i < 24; i++) {
      if (activityByHour[i] > avgHourly * 1.5) {
        if (peakStart === null) peakStart = i;
      } else if (peakStart !== null) {
        peakHours.push({ start: peakStart, end: i - 1 });
        peakStart = null;
      }
    }
    if (peakStart !== null) {
      peakHours.push({ start: peakStart, end: 23 });
    }

    // Find peak days
    const avgDaily = activityByDay.reduce((a, b) => a + b, 0) / 7;
    const peakDays = activityByDay
      .map((count, day) => ({ day, count }))
      .filter(d => d.count > avgDaily)
      .map(d => d.day);

    // Calculate average session length
    const avgSessionLength = sessionLengths.length > 0
      ? sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length
      : 0;

    if (peakHours.length > 0 || peakDays.length > 0) {
      this.updateOrCreatePattern({
        category: 'work-hours',
        name: 'Work Schedule Pattern',
        description: this.describeWorkHours(peakHours, peakDays, avgSessionLength),
        data: {
          type: 'work-hours',
          peakHours,
          peakDays,
          averageSessionLength: avgSessionLength,
        },
        confidence: Math.min(observations.length / 100, 0.95),
      });
    }
  }

  private describeWorkHours(
    peakHours: { start: number; end: number }[],
    peakDays: number[],
    avgSessionLength: number
  ): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    let desc = 'You typically work ';
    
    if (peakHours.length > 0) {
      desc += peakHours.map(h => `${h.start}:00-${h.end}:00`).join(' and ');
    }
    
    if (peakDays.length > 0) {
      desc += ` on ${peakDays.map(d => dayNames[d]).join(', ')}`;
    }
    
    if (avgSessionLength > 0) {
      desc += `. Average session: ${Math.round(avgSessionLength)} minutes`;
    }
    
    return desc;
  }

  private analyzeFilePreferences(observations: PatternEvidence[]): void {
    if (!this.preferences.categories['file-preferences']) return;

    const locationCounts: Map<string, { count: number; purposes: Set<string> }> = new Map();
    const extensionCounts: Map<string, number> = new Map();

    for (const obs of observations.filter(o => o.type === 'file-access' || o.type === 'file-create')) {
      if (obs.data?.path) {
        const dir = path.dirname(obs.data.path);
        const ext = path.extname(obs.data.path).toLowerCase();
        
        // Track locations
        const locData = locationCounts.get(dir) || { count: 0, purposes: new Set() };
        locData.count++;
        if (obs.data.purpose) locData.purposes.add(obs.data.purpose);
        locationCounts.set(dir, locData);
        
        // Track extensions
        if (ext) {
          extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1);
        }
      }
    }

    // Build pattern data
    const preferredLocations = Array.from(locationCounts.entries())
      .map(([path, data]) => ({
        path,
        purpose: Array.from(data.purposes).join(', ') || 'general',
        frequency: data.count,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const commonFileTypes = Array.from(extensionCounts.entries())
      .map(([extension, frequency]) => ({ extension, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    if (preferredLocations.length > 0) {
      this.updateOrCreatePattern({
        category: 'file-preferences',
        name: 'File Location Preferences',
        description: this.describeFilePreferences(preferredLocations, commonFileTypes),
        data: {
          type: 'file-preferences',
          preferredLocations,
          commonFileTypes,
        },
        confidence: Math.min(preferredLocations.reduce((s, l) => s + l.frequency, 0) / 50, 0.9),
      });
    }
  }

  private describeFilePreferences(
    locations: { path: string; purpose: string; frequency: number }[],
    fileTypes: { extension: string; frequency: number }[]
  ): string {
    let desc = 'Your most used folders: ';
    desc += locations.slice(0, 3).map(l => path.basename(l.path)).join(', ');
    
    if (fileTypes.length > 0) {
      desc += `. Common file types: ${fileTypes.slice(0, 5).map(t => t.extension).join(', ')}`;
    }
    
    return desc;
  }

  private analyzeSearchHabits(observations: PatternEvidence[]): void {
    if (!this.preferences.categories['search-habits']) return;

    const queryPatterns: Map<string, number> = new Map();
    const filterUsage: Map<string, number> = new Map();

    for (const obs of observations.filter(o => o.type === 'search')) {
      if (obs.data?.query) {
        // Normalize and count query patterns
        const normalized = obs.data.query.toLowerCase().trim();
        queryPatterns.set(normalized, (queryPatterns.get(normalized) || 0) + 1);
      }
      
      if (obs.data?.filters) {
        for (const filter of Object.keys(obs.data.filters)) {
          filterUsage.set(filter, (filterUsage.get(filter) || 0) + 1);
        }
      }
    }

    const commonQueries = Array.from(queryPatterns.entries())
      .filter(([_, freq]) => freq >= 2)
      .map(([pattern, frequency]) => ({ pattern, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);

    const preferredFilters: Record<string, number> = {};
    for (const [filter, count] of filterUsage) {
      preferredFilters[filter] = count;
    }

    if (commonQueries.length > 0) {
      this.updateOrCreatePattern({
        category: 'search-habits',
        name: 'Search Habits',
        description: this.describeSearchHabits(commonQueries, preferredFilters),
        data: {
          type: 'search-habits',
          commonQueries,
          preferredFilters,
        },
        confidence: Math.min(commonQueries.length / 10, 0.85),
      });
    }
  }

  private describeSearchHabits(
    queries: { pattern: string; frequency: number }[],
    filters: Record<string, number>
  ): string {
    let desc = `You frequently search for: ${queries.slice(0, 5).map(q => `"${q.pattern}"`).join(', ')}`;
    
    const topFilters = Object.entries(filters)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    if (topFilters.length > 0) {
      desc += `. Preferred filters: ${topFilters.map(([f]) => f).join(', ')}`;
    }
    
    return desc;
  }

  private analyzeOrganization(observations: PatternEvidence[]): void {
    if (!this.preferences.categories['organization-style']) return;

    const namingPatterns: Map<string, string[]> = new Map();

    for (const obs of observations.filter(o => o.type === 'file-create' || o.type === 'file-rename')) {
      if (obs.data?.name) {
        const name = obs.data.name;
        
        // Detect patterns (date prefix, camelCase, snake_case, etc.)
        if (/^\d{4}-\d{2}-\d{2}/.test(name)) {
          const examples = namingPatterns.get('date-prefix') || [];
          examples.push(name);
          namingPatterns.set('date-prefix', examples);
        } else if (/^[a-z]+_[a-z]+/.test(name)) {
          const examples = namingPatterns.get('snake_case') || [];
          examples.push(name);
          namingPatterns.set('snake_case', examples);
        } else if (/^[a-z]+[A-Z]/.test(name)) {
          const examples = namingPatterns.get('camelCase') || [];
          examples.push(name);
          namingPatterns.set('camelCase', examples);
        }
      }
    }

    const namingConventions = Array.from(namingPatterns.entries())
      .filter(([_, examples]) => examples.length >= this.MIN_OBSERVATIONS_FOR_PATTERN)
      .map(([pattern, examples]) => ({
        pattern,
        examples: examples.slice(0, 5),
        frequency: examples.length,
      }));

    if (namingConventions.length > 0) {
      this.updateOrCreatePattern({
        category: 'organization-style',
        name: 'File Naming Style',
        description: this.describeOrganization(namingConventions),
        data: {
          type: 'organization-style',
          namingConventions,
          folderStructurePreferences: [],
        },
        confidence: Math.min(namingConventions[0].frequency / 20, 0.8),
      });
    }
  }

  private describeOrganization(
    conventions: { pattern: string; examples: string[]; frequency: number }[]
  ): string {
    const patternNames: Record<string, string> = {
      'date-prefix': 'date prefixes (2024-01-15)',
      'snake_case': 'snake_case naming',
      'camelCase': 'camelCase naming',
    };
    
    return `You tend to use ${conventions.map(c => patternNames[c.pattern] || c.pattern).join(' and ')} for file names`;
  }

  private updateOrCreatePattern(params: {
    category: PatternCategory;
    name: string;
    description: string;
    data: PatternData;
    confidence: number;
  }): void {
    // Find existing pattern
    const existing = Array.from(this.patterns.values()).find(
      p => p.category === params.category && p.name === params.name
    );

    if (existing) {
      existing.lastObserved = Date.now();
      existing.observationCount++;
      existing.confidence = Math.max(existing.confidence, params.confidence);
      existing.description = params.description;
      existing.data = params.data;
      
      // Add evidence
      existing.evidence.push({
        timestamp: Date.now(),
        type: 'analysis-update',
        description: 'Pattern updated from new observations',
      });
      
      if (existing.evidence.length > this.MAX_EVIDENCE_PER_PATTERN) {
        existing.evidence = existing.evidence.slice(-this.MAX_EVIDENCE_PER_PATTERN);
      }
    } else {
      const pattern: LearnedPattern = {
        id: crypto.randomUUID(),
        category: params.category,
        name: params.name,
        description: params.description,
        firstObserved: Date.now(),
        lastObserved: Date.now(),
        observationCount: 1,
        confidence: params.confidence,
        weight: 1,
        data: params.data,
        evidence: [{
          timestamp: Date.now(),
          type: 'pattern-discovered',
          description: 'Pattern first identified',
        }],
        userConfirmed: false,
        userAdjusted: false,
        hidden: false,
      };

      this.patterns.set(pattern.id, pattern);
      this.emit('pattern-discovered', pattern);
    }
  }

  private cleanupPatterns(): void {
    const now = Date.now();
    const retentionMs = this.preferences.retentionDays * 24 * 60 * 60 * 1000;

    // Rule 77: Apply confidence decay before cleanup
    this.applyConfidenceDecay();

    // Rule 80: Merge duplicate patterns
    this.deduplicatePatterns();

    for (const [id, pattern] of this.patterns) {
      // Remove old patterns with low confidence
      if (now - pattern.lastObserved > retentionMs && pattern.confidence < 0.5) {
        if (!pattern.userConfirmed) {
          this.patterns.delete(id);
          this.emit('pattern-removed', id);
        }
      }
    }

    // Limit total patterns
    if (this.patterns.size > this.MAX_PATTERNS) {
      const sorted = Array.from(this.patterns.values())
        .filter(p => !p.userConfirmed)
        .sort((a, b) => a.confidence - b.confidence);
      
      const toRemove = sorted.slice(0, sorted.length - this.MAX_PATTERNS + 10);
      for (const pattern of toRemove) {
        this.patterns.delete(pattern.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 76: Bayesian-style confidence scoring
  // -------------------------------------------------------------------------

  private computeConfidence(observationCount: number, daysSinceFirst: number, userConfirmed: boolean): number {
    // Prior: start at 0.1
    const prior = 0.1;
    // Observation factor: log growth, caps at ~0.7 with 50 observations
    const obsFactor = Math.min(0.7, Math.log(1 + observationCount) / Math.log(51));
    // Time factor: patterns observed longer are more reliable (caps at 0.2 over 30 days)
    const timeFactor = Math.min(0.2, daysSinceFirst / 150);
    // User confirmation bonus
    const confirmBonus = userConfirmed ? 0.15 : 0;

    return Math.min(1.0, prior + obsFactor + timeFactor + confirmBonus);
  }

  // -------------------------------------------------------------------------
  // Rule 77: Pattern decay over time
  // -------------------------------------------------------------------------

  private readonly DECAY_RATE = 0.02; // 2% per day of inactivity
  private readonly MIN_DECAY_CONFIDENCE = 0.05;

  private applyConfidenceDecay(): void {
    const now = Date.now();
    const ONE_DAY = 86_400_000;

    for (const pattern of this.patterns.values()) {
      if (pattern.userConfirmed) continue; // User-confirmed patterns don't decay

      const daysSinceLastObserved = (now - pattern.lastObserved) / ONE_DAY;
      if (daysSinceLastObserved > 1) {
        const decayFactor = Math.pow(1 - this.DECAY_RATE, daysSinceLastObserved);
        pattern.confidence = Math.max(this.MIN_DECAY_CONFIDENCE, pattern.confidence * decayFactor);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 78: Prediction accuracy tracking
  // -------------------------------------------------------------------------

  private predictionLog: Array<{ patternId: string; predicted: any; actual: any; correct: boolean; timestamp: number }> = [];
  private readonly MAX_PREDICTION_LOG = 500;

  recordPrediction(patternId: string, predicted: any, actual: any): void {
    const correct = JSON.stringify(predicted) === JSON.stringify(actual);
    this.predictionLog.push({ patternId, predicted, actual, correct, timestamp: Date.now() });

    if (this.predictionLog.length > this.MAX_PREDICTION_LOG) {
      this.predictionLog = this.predictionLog.slice(-this.MAX_PREDICTION_LOG);
    }

    // Adjust confidence based on prediction accuracy
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      if (correct) {
        pattern.confidence = Math.min(1.0, pattern.confidence + 0.02);
      } else {
        pattern.confidence = Math.max(0.05, pattern.confidence - 0.05);
      }
    }
  }

  getPredictionAccuracy(patternId?: string): { total: number; correct: number; accuracy: number } {
    const relevant = patternId
      ? this.predictionLog.filter(p => p.patternId === patternId)
      : this.predictionLog;

    const correct = relevant.filter(p => p.correct).length;
    return {
      total: relevant.length,
      correct,
      accuracy: relevant.length > 0 ? correct / relevant.length : 0,
    };
  }

  // -------------------------------------------------------------------------
  // Rule 79: Cold-start heuristics for new users
  // -------------------------------------------------------------------------

  applyColdStartDefaults(): void {
    if (this.patterns.size > 0) return; // Not a cold start

    // Sensible defaults for new users
    const defaults: Array<{ category: PatternCategory; name: string; description: string; data: PatternData }> = [
      {
        category: 'work-hours',
        name: 'Default Work Hours',
        description: 'Assumed weekday 9-5 schedule (will learn your actual pattern)',
        data: {
          type: 'work-hours',
          peakHours: [{ start: 9, end: 17 }],
          peakDays: [1, 2, 3, 4, 5], // Mon-Fri
          averageSessionLength: 60,
        },
      },
      {
        category: 'focus-patterns',
        name: 'Default Focus Pattern',
        description: 'Default 25-minute focus sessions (Pomodoro-style)',
        data: {
          type: 'focus-patterns',
          averageFocusDuration: 25,
          preferredFocusTimes: [{ start: 9, end: 12 }, { start: 14, end: 17 }],
          commonDistractions: [],
        },
      },
    ];

    for (const def of defaults) {
      this.updateOrCreatePattern({
        ...def,
        confidence: 0.2, // Low confidence -- will be overridden by actual data
      });
    }

    log.info('[Learning] Rule 79: Applied cold-start defaults for new user');
  }

  // -------------------------------------------------------------------------
  // Rule 80: Pattern deduplication and merging
  // -------------------------------------------------------------------------

  private deduplicatePatterns(): void {
    const byCategoryAndName = new Map<string, LearnedPattern[]>();

    for (const pattern of this.patterns.values()) {
      const key = `${pattern.category}::${pattern.name}`;
      const group = byCategoryAndName.get(key) || [];
      group.push(pattern);
      byCategoryAndName.set(key, group);
    }

    for (const [, group] of byCategoryAndName) {
      if (group.length <= 1) continue;

      // Keep the one with highest confidence
      group.sort((a, b) => b.confidence - a.confidence);
      const keeper = group[0];

      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        // Merge observations
        keeper.observationCount += dup.observationCount;
        keeper.confidence = Math.min(1.0, keeper.confidence + dup.confidence * 0.1);
        keeper.lastObserved = Math.max(keeper.lastObserved, dup.lastObserved);
        keeper.firstObserved = Math.min(keeper.firstObserved, dup.firstObserved);
        // Merge evidence (capped)
        keeper.evidence = [...keeper.evidence, ...dup.evidence]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, this.MAX_EVIDENCE_PER_PATTERN);
        // Remove duplicate
        this.patterns.delete(dup.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PATTERN QUERIES & USER CONTROL
  // -------------------------------------------------------------------------

  /**
   * Get all patterns (with optional filtering)
   */
  getPatterns(options?: {
    category?: PatternCategory;
    minConfidence?: number;
    includeHidden?: boolean;
  }): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => {
        if (options?.category && p.category !== options.category) return false;
        if (options?.minConfidence && p.confidence < options.minConfidence) return false;
        if (!options?.includeHidden && p.hidden) return false;
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get human-readable explanation of a pattern
   */
  explainPattern(patternId: string): string | null {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return null;

    let explanation = `**${pattern.name}**\n\n`;
    explanation += `${pattern.description}\n\n`;
    explanation += `**Confidence:** ${Math.round(pattern.confidence * 100)}%\n`;
    explanation += `**Observed:** ${pattern.observationCount} times\n`;
    explanation += `**First seen:** ${new Date(pattern.firstObserved).toLocaleDateString()}\n`;
    explanation += `**Last seen:** ${new Date(pattern.lastObserved).toLocaleDateString()}\n\n`;
    
    if (pattern.evidence.length > 0) {
      explanation += `**Recent evidence:**\n`;
      for (const ev of pattern.evidence.slice(-5)) {
        explanation += `- ${new Date(ev.timestamp).toLocaleString()}: ${ev.description}\n`;
      }
    }

    return explanation;
  }

  /**
   * User confirms a pattern is accurate
   */
  confirmPattern(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    pattern.userConfirmed = true;
    pattern.confidence = Math.min(pattern.confidence + 0.1, 1);
    this.saveData();

    this.emit('pattern-confirmed', patternId);
    return true;
  }

  /**
   * User hides a pattern
   */
  hidePattern(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    pattern.hidden = true;
    this.saveData();

    this.emit('pattern-hidden', patternId);
    return true;
  }

  /**
   * User deletes a pattern
   */
  deletePattern(patternId: string): boolean {
    if (!this.patterns.has(patternId)) return false;
    
    this.patterns.delete(patternId);
    this.saveData();

    this.emit('pattern-deleted', patternId);
    return true;
  }

  /**
   * Reset all learning (nuclear option)
   */
  resetAllLearning(): void {
    this.patterns.clear();
    this.observations = [];
    this.insights.clear();
    this.saveData();

    this.emit('learning-reset');
    log.info('[Learning] All learning data reset');
  }

  /**
   * Export all learned data (for user inspection)
   */
  exportLearningData(): {
    patterns: LearnedPattern[];
    preferences: LearningPreferences;
    observationCount: number;
    exportedAt: number;
  } {
    return {
      patterns: Array.from(this.patterns.values()),
      preferences: this.preferences,
      observationCount: this.observations.length,
      exportedAt: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // PREFERENCES
  // -------------------------------------------------------------------------

  getPreferences(): LearningPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<LearningPreferences>): LearningPreferences {
    this.preferences = {
      ...this.preferences,
      ...updates,
    };
    this.saveData();
    this.emit('preferences-updated', this.preferences);
    return this.preferences;
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Observation (internal use)
    ipcMain.handle('learning:recordObservation', (_, params) => {
      this.recordObservation(params);
      return true;
    });

    // Pattern queries
    ipcMain.handle('learning:getPatterns', (_, options) => this.getPatterns(options));
    ipcMain.handle('learning:explainPattern', (_, patternId) => this.explainPattern(patternId));

    // User control
    ipcMain.handle('learning:confirmPattern', (_, patternId) => this.confirmPattern(patternId));
    ipcMain.handle('learning:hidePattern', (_, patternId) => this.hidePattern(patternId));
    ipcMain.handle('learning:deletePattern', (_, patternId) => this.deletePattern(patternId));
    ipcMain.handle('learning:resetAll', () => {
      this.resetAllLearning();
      return true;
    });

    // Export
    ipcMain.handle('learning:exportData', () => this.exportLearningData());

    // Preferences
    ipcMain.handle('learning:getPreferences', () => this.getPreferences());
    ipcMain.handle('learning:updatePreferences', (_, updates) => this.updatePreferences(updates));

    // Manual analysis trigger
    ipcMain.handle('learning:analyzeNow', () => {
      this.analyzeObservations();
      return true;
    });
  }
}

// Singleton instance
export const localLearningEngine = new LocalLearningEngineClass();

export async function initializeLocalLearning(): Promise<void> {
  return localLearningEngine.initialize();
}

export function shutdownLocalLearning(): void {
  localLearningEngine.shutdown();
}
