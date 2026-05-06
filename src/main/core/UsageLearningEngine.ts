// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Usage Learning Engine
// Phase 42: Local-only usage pattern learning for self-optimization
// ===========================================================================

import log from 'electron-log';
import { app, powerMonitor } from 'electron';
import Store from 'electron-store';

// ===========================================================================
// TYPES
// ===========================================================================

export interface UsagePattern {
  // Time patterns (24 buckets for hours)
  hourlyActivity: number[];
  
  // Day patterns (7 buckets for days)
  dailyActivity: number[];
  
  // Feature usage frequency
  featureUsage: Record<string, FeatureUsageData>;
  
  // Session patterns
  averageSessionDuration: number;
  sessionsPerDay: number;
  
  // Idle patterns
  typicalIdleStart: number; // Hour of day
  typicalIdleEnd: number;   // Hour of day
  
  // Work patterns
  peakUsageHours: number[];
  lowUsageHours: number[];
}

export interface FeatureUsageData {
  featureId: string;
  usageCount: number;
  lastUsed: number;
  averageDuration: number;
  totalDuration: number;
}

export interface LearningConfig {
  enabled: boolean;
  collectAppUsage: boolean;
  collectFeatureUsage: boolean;
  collectTimePatterns: boolean;
  retentionDays: number;
  minDataPoints: number;
}

export interface UsageEvent {
  type: 'feature_use' | 'session_start' | 'session_end' | 'idle_start' | 'idle_end';
  featureId?: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface PredictionResult {
  isLikelyIdle: boolean;
  isLikelyActive: boolean;
  suggestedActions: string[];
  confidence: number;
}

// ===========================================================================
// STORE
// ===========================================================================

const learningStore = new Store<{
  config: LearningConfig;
  patterns: UsagePattern;
  events: UsageEvent[];
  lastAnalysis: number;
  sessionHistory: Array<{ start: number; end: number; duration: number }>;
}>({
  name: 'usage-learning',
  defaults: {
    config: {
      enabled: true,
      collectAppUsage: true,
      collectFeatureUsage: true,
      collectTimePatterns: true,
      retentionDays: 30,
      minDataPoints: 10,
    },
    patterns: {
      hourlyActivity: new Array(24).fill(0),
      dailyActivity: new Array(7).fill(0),
      featureUsage: {},
      averageSessionDuration: 0,
      sessionsPerDay: 0,
      typicalIdleStart: 23,
      typicalIdleEnd: 7,
      peakUsageHours: [],
      lowUsageHours: [],
    },
    events: [],
    lastAnalysis: 0,
    sessionHistory: [],
  },
});

// ===========================================================================
// USAGE LEARNING ENGINE
// ===========================================================================

class UsageLearningEngine {
  private static instance: UsageLearningEngine;
  private initialized = false;
  private currentSessionStart: number = 0;
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private analysisTimer: NodeJS.Timeout | null = null;
  private isIdle = false;

  private constructor() {}

  static getInstance(): UsageLearningEngine {
    if (!UsageLearningEngine.instance) {
      UsageLearningEngine.instance = new UsageLearningEngine();
    }
    return UsageLearningEngine.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = learningStore.get('config');
    if (!config.enabled) {
      log.info('[UsageLearningEngine] Learning disabled');
      return;
    }

    // Start session tracking
    this.currentSessionStart = Date.now();
    this.recordEvent({ type: 'session_start', timestamp: Date.now() });

    // Listen for system events
    this.setupSystemListeners();

    // Schedule periodic analysis (once per hour, only when idle)
    this.analysisTimer = setInterval(() => {
      if (this.isIdle) {
        this.analyzePatterns();
      }
    }, 60 * 60 * 1000);

    // Clean old data
    this.cleanOldData();

    this.initialized = true;
    log.info('[UsageLearningEngine] Initialized');
  }

  private setupSystemListeners(): void {
    // Track system idle/active states
    powerMonitor.on('suspend', () => {
      this.onSystemSuspend();
    });

    powerMonitor.on('resume', () => {
      this.onSystemResume();
    });

    powerMonitor.on('lock-screen', () => {
      this.onIdleStart();
    });

    powerMonitor.on('unlock-screen', () => {
      this.onIdleEnd();
    });
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // End session
    const duration = Date.now() - this.currentSessionStart;
    this.recordEvent({ type: 'session_end', timestamp: Date.now(), duration });

    // Save session to history
    const history = learningStore.get('sessionHistory');
    history.push({
      start: this.currentSessionStart,
      end: Date.now(),
      duration,
    });
    learningStore.set('sessionHistory', history.slice(-100)); // Keep last 100 sessions

    // Clear timers
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.analysisTimer) clearInterval(this.analysisTimer);

    // Final analysis
    this.analyzePatterns();

    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // EVENT RECORDING
  // -------------------------------------------------------------------------

  recordActivity(): void {
    const config = learningStore.get('config');
    if (!config.enabled) return;

    this.lastActivityTime = Date.now();
    
    if (this.isIdle) {
      this.onIdleEnd();
    }

    // Record time pattern
    if (config.collectTimePatterns) {
      const now = new Date();
      const patterns = learningStore.get('patterns');
      
      patterns.hourlyActivity[now.getHours()]++;
      patterns.dailyActivity[now.getDay()]++;
      
      learningStore.set('patterns', patterns);
    }

    // Reset idle timer
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.onIdleStart(), 5 * 60 * 1000); // 5 min idle
  }

  recordFeatureUse(featureId: string, duration?: number): void {
    const config = learningStore.get('config');
    if (!config.enabled || !config.collectFeatureUsage) return;

    const patterns = learningStore.get('patterns');
    
    if (!patterns.featureUsage[featureId]) {
      patterns.featureUsage[featureId] = {
        featureId,
        usageCount: 0,
        lastUsed: 0,
        averageDuration: 0,
        totalDuration: 0,
      };
    }

    const feature = patterns.featureUsage[featureId];
    feature.usageCount++;
    feature.lastUsed = Date.now();
    
    if (duration) {
      feature.totalDuration += duration;
      feature.averageDuration = feature.totalDuration / feature.usageCount;
    }

    learningStore.set('patterns', patterns);

    this.recordEvent({
      type: 'feature_use',
      featureId,
      timestamp: Date.now(),
      duration,
    });

    this.recordActivity();
  }

  private recordEvent(event: UsageEvent): void {
    const events = learningStore.get('events');
    events.push(event);
    
    // Keep only recent events (last 1000)
    if (events.length > 1000) {
      events.splice(0, events.length - 1000);
    }
    
    learningStore.set('events', events);
  }

  // -------------------------------------------------------------------------
  // IDLE HANDLING
  // -------------------------------------------------------------------------

  private onIdleStart(): void {
    if (this.isIdle) return;
    
    this.isIdle = true;
    this.recordEvent({ type: 'idle_start', timestamp: Date.now() });
    
    log.info('[UsageLearningEngine] User idle');
  }

  private onIdleEnd(): void {
    if (!this.isIdle) return;
    
    this.isIdle = false;
    this.recordEvent({ type: 'idle_end', timestamp: Date.now() });
    
    log.info('[UsageLearningEngine] User active');
  }

  private onSystemSuspend(): void {
    this.onIdleStart();
  }

  private onSystemResume(): void {
    this.onIdleEnd();
    this.recordActivity();
  }

  // -------------------------------------------------------------------------
  // PATTERN ANALYSIS
  // -------------------------------------------------------------------------

  private analyzePatterns(): void {
    const config = learningStore.get('config');
    if (!config.enabled) return;

    const patterns = learningStore.get('patterns');
    const history = learningStore.get('sessionHistory');

    // Analyze session patterns
    if (history.length >= config.minDataPoints) {
      const recentSessions = history.slice(-30);
      const totalDuration = recentSessions.reduce((sum, s) => sum + s.duration, 0);
      patterns.averageSessionDuration = totalDuration / recentSessions.length;
      patterns.sessionsPerDay = recentSessions.length / 30;
    }

    // Find peak and low usage hours
    const hourlyActivity = patterns.hourlyActivity;
    const maxActivity = Math.max(...hourlyActivity);
    const minActivity = Math.min(...hourlyActivity.filter(a => a > 0));
    
    if (maxActivity > 0) {
      const threshold70 = maxActivity * 0.7;
      const threshold30 = maxActivity * 0.3;

      patterns.peakUsageHours = hourlyActivity
        .map((v, i) => ({ hour: i, activity: v }))
        .filter(h => h.activity >= threshold70)
        .map(h => h.hour);

      patterns.lowUsageHours = hourlyActivity
        .map((v, i) => ({ hour: i, activity: v }))
        .filter(h => h.activity > 0 && h.activity <= threshold30)
        .map(h => h.hour);
    }

    // Find typical idle periods
    const events = learningStore.get('events');
    const idleStarts = events
      .filter(e => e.type === 'idle_start')
      .map(e => new Date(e.timestamp).getHours());
    
    if (idleStarts.length >= config.minDataPoints) {
      // Find most common idle start hour
      const hourCounts = new Array(24).fill(0);
      idleStarts.forEach(h => hourCounts[h]++);
      patterns.typicalIdleStart = hourCounts.indexOf(Math.max(...hourCounts));
    }

    learningStore.set('patterns', patterns);
    learningStore.set('lastAnalysis', Date.now());

    log.info('[UsageLearningEngine] Patterns analyzed');
  }

  // -------------------------------------------------------------------------
  // PREDICTIONS
  // -------------------------------------------------------------------------

  predict(): PredictionResult {
    const config = learningStore.get('config');
    const patterns = learningStore.get('patterns');
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // Default result
    const result: PredictionResult = {
      isLikelyIdle: false,
      isLikelyActive: false,
      suggestedActions: [],
      confidence: 0,
    };

    if (!config.enabled) return result;

    // Check if current hour is typically idle
    const isIdleHour = patterns.lowUsageHours.includes(currentHour) ||
      (currentHour >= patterns.typicalIdleStart && currentHour <= 23) ||
      (currentHour >= 0 && currentHour <= patterns.typicalIdleEnd);

    // Check if current hour is typically active
    const isPeakHour = patterns.peakUsageHours.includes(currentHour);

    result.isLikelyIdle = isIdleHour && !this.isIdle;
    result.isLikelyActive = isPeakHour && !this.isIdle;

    // Calculate confidence based on data points
    const totalActivity = patterns.hourlyActivity.reduce((a, b) => a + b, 0);
    result.confidence = Math.min(1, totalActivity / 1000);

    // Generate suggestions (never enforced)
    if (result.isLikelyIdle && result.confidence > 0.5) {
      result.suggestedActions.push('Consider pausing background tasks');
    }
    
    if (isPeakHour && result.confidence > 0.5) {
      result.suggestedActions.push('Peak usage time - keeping resources ready');
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // FEATURE RANKINGS
  // -------------------------------------------------------------------------

  getMostUsedFeatures(limit: number = 10): FeatureUsageData[] {
    const patterns = learningStore.get('patterns');
    return Object.values(patterns.featureUsage)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  getRecentlyUsedFeatures(limit: number = 10): FeatureUsageData[] {
    const patterns = learningStore.get('patterns');
    return Object.values(patterns.featureUsage)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): LearningConfig {
    return learningStore.get('config');
  }

  async updateConfig(updates: Partial<LearningConfig>): Promise<LearningConfig> {
    const current = learningStore.get('config');
    const updated = { ...current, ...updates };
    learningStore.set('config', updated);
    return updated;
  }

  getPatterns(): UsagePattern {
    return learningStore.get('patterns');
  }

  // -------------------------------------------------------------------------
  // DATA MANAGEMENT
  // -------------------------------------------------------------------------

  private cleanOldData(): void {
    const config = learningStore.get('config');
    const cutoff = Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000);

    // Clean old events
    const events = learningStore.get('events').filter(e => e.timestamp > cutoff);
    learningStore.set('events', events);

    // Clean old session history
    const history = learningStore.get('sessionHistory').filter(s => s.end > cutoff);
    learningStore.set('sessionHistory', history);
  }

  async resetAllData(): Promise<void> {
    learningStore.set('patterns', {
      hourlyActivity: new Array(24).fill(0),
      dailyActivity: new Array(7).fill(0),
      featureUsage: {},
      averageSessionDuration: 0,
      sessionsPerDay: 0,
      typicalIdleStart: 23,
      typicalIdleEnd: 7,
      peakUsageHours: [],
      lowUsageHours: [],
    });
    learningStore.set('events', []);
    learningStore.set('sessionHistory', []);
    learningStore.set('lastAnalysis', 0);
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): {
    enabled: boolean;
    isIdle: boolean;
    lastActivity: number;
    sessionDuration: number;
    dataPoints: number;
  } {
    const config = learningStore.get('config');
    const events = learningStore.get('events');

    return {
      enabled: config.enabled,
      isIdle: this.isIdle,
      lastActivity: this.lastActivityTime,
      sessionDuration: Date.now() - this.currentSessionStart,
      dataPoints: events.length,
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const usageLearningEngine = UsageLearningEngine.getInstance();
export default usageLearningEngine;
