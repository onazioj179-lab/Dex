// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Pattern Detection Engine
// Phase 43: Smart opt-in pattern detection - local only, user controlled
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type PatternType = 
  | 'time-of-day'
  | 'feature-frequency'
  | 'workflow-sequence'
  | 'session-duration'
  | 'idle-active';

export interface PatternDetectionConfig {
  enabled: boolean;                    // OFF by default - user must enable
  pausedUntil: number | null;         // Temporary pause
  allowedPatterns: PatternType[];     // Which patterns to detect
  retentionDays: number;              // How long to keep data
  anonymize: boolean;                 // Always true - aggregated signals only
  showSummary: boolean;               // Show plain-language summary
}

export interface DetectedPattern {
  id: string;
  type: PatternType;
  confidence: number;                 // 0-1
  description: string;                // Human-readable
  data: Record<string, unknown>;      // Anonymized, aggregated
  detectedAt: number;
  validUntil: number;
}

export interface TimePattern {
  hour: number;
  dayOfWeek: number;
  activityLevel: number;              // 0-1
  preferredFeatures: string[];
}

export interface WorkflowSequence {
  steps: string[];
  frequency: number;
  avgDuration: number;
  lastSeen: number;
}

export interface PatternSummary {
  totalPatterns: number;
  activePatterns: number;
  mostActiveHours: number[];
  preferredFeatures: string[];
  commonSequences: string[][];
  avgSessionMinutes: number;
  plainLanguage: string;
}

// ===========================================================================
// STORE
// ===========================================================================

const patternStore = new Store<{
  config: PatternDetectionConfig;
  patterns: DetectedPattern[];
  timePatterns: TimePattern[];
  workflowSequences: WorkflowSequence[];
  sessionDurations: number[];
  lastAnalysis: number;
}>({
  name: 'pattern-detection',
  defaults: {
    config: {
      enabled: true,                  // Enabled by default
      pausedUntil: null,
      allowedPatterns: ['time-of-day', 'feature-frequency', 'workflow-sequence', 'session-duration', 'idle-active'],
      retentionDays: 30,
      anonymize: true,                // Always anonymized
      showSummary: true,
    },
    patterns: [],
    timePatterns: [],
    workflowSequences: [],
    sessionDurations: [],
    lastAnalysis: 0,
  },
});

// ===========================================================================
// PATTERN DETECTION ENGINE
// ===========================================================================

class PatternDetectionEngine {
  private static instance: PatternDetectionEngine;
  private initialized = false;
  private currentSessionStart: number = 0;
  private recentFeatures: Array<{ feature: string; timestamp: number }> = [];
  private recentWorkflowSteps: string[] = [];

  private constructor() {}

  static getInstance(): PatternDetectionEngine {
    if (!PatternDetectionEngine.instance) {
      PatternDetectionEngine.instance = new PatternDetectionEngine();
    }
    return PatternDetectionEngine.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.cleanupOldData();
    this.currentSessionStart = Date.now();

    this.initialized = true;
    log.info('[PatternDetectionEngine] Initialized (detection disabled by default)');
  }

  private setupIPC(): void {
    ipcMain.handle('patterns:getConfig', () => this.getConfig());
    ipcMain.handle('patterns:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('patterns:enable', () => this.enable());
    ipcMain.handle('patterns:disable', () => this.disable());
    ipcMain.handle('patterns:pause', (_, hours) => this.pause(hours));
    ipcMain.handle('patterns:resume', () => this.resume());
    ipcMain.handle('patterns:reset', () => this.reset());
    ipcMain.handle('patterns:getSummary', () => this.getSummary());
    ipcMain.handle('patterns:getPatterns', () => this.getPatterns());
  }

  async shutdown(): Promise<void> {
    if (this.isEnabled()) {
      this.recordSessionEnd();
    }
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // ENABLE/DISABLE (EXPLICIT USER CONTROL)
  // -------------------------------------------------------------------------

  isEnabled(): boolean {
    const config = patternStore.get('config');
    if (!config.enabled) return false;
    if (config.pausedUntil && Date.now() < config.pausedUntil) return false;
    return true;
  }

  async enable(): Promise<boolean> {
    const config = patternStore.get('config');
    config.enabled = true;
    config.pausedUntil = null;
    patternStore.set('config', config);
    log.info('[PatternDetectionEngine] Enabled by user');
    return true;
  }

  async disable(): Promise<boolean> {
    const config = patternStore.get('config');
    config.enabled = false;
    patternStore.set('config', config);
    log.info('[PatternDetectionEngine] Disabled by user');
    return true;
  }

  async pause(hours: number): Promise<boolean> {
    const config = patternStore.get('config');
    config.pausedUntil = Date.now() + (hours * 60 * 60 * 1000);
    patternStore.set('config', config);
    log.info(`[PatternDetectionEngine] Paused for ${hours} hours`);
    return true;
  }

  async resume(): Promise<boolean> {
    const config = patternStore.get('config');
    config.pausedUntil = null;
    patternStore.set('config', config);
    return true;
  }

  async reset(): Promise<boolean> {
    patternStore.set('patterns', []);
    patternStore.set('timePatterns', []);
    patternStore.set('workflowSequences', []);
    patternStore.set('sessionDurations', []);
    patternStore.set('lastAnalysis', 0);
    this.recentFeatures = [];
    this.recentWorkflowSteps = [];
    log.info('[PatternDetectionEngine] All patterns reset');
    return true;
  }

  // -------------------------------------------------------------------------
  // DATA COLLECTION (ONLY WHEN ENABLED)
  // -------------------------------------------------------------------------

  recordFeatureUse(featureId: string): void {
    if (!this.isEnabled()) return;
    
    const config = patternStore.get('config');
    if (!config.allowedPatterns.includes('feature-frequency')) return;

    this.recentFeatures.push({
      feature: featureId,
      timestamp: Date.now(),
    });

    // Keep only last 1000 entries
    if (this.recentFeatures.length > 1000) {
      this.recentFeatures = this.recentFeatures.slice(-1000);
    }
  }

  recordWorkflowStep(stepId: string): void {
    if (!this.isEnabled()) return;

    const config = patternStore.get('config');
    if (!config.allowedPatterns.includes('workflow-sequence')) return;

    this.recentWorkflowSteps.push(stepId);
    
    // Keep only last 50 steps
    if (this.recentWorkflowSteps.length > 50) {
      this.recentWorkflowSteps = this.recentWorkflowSteps.slice(-50);
    }

    // Detect sequences
    this.detectWorkflowSequence();
  }

  recordActivitySignal(): void {
    if (!this.isEnabled()) return;

    const config = patternStore.get('config');
    if (!config.allowedPatterns.includes('time-of-day')) return;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Update time patterns
    const timePatterns = patternStore.get('timePatterns');
    let pattern = timePatterns.find(p => p.hour === hour && p.dayOfWeek === dayOfWeek);
    
    if (!pattern) {
      pattern = { hour, dayOfWeek, activityLevel: 0, preferredFeatures: [] };
      timePatterns.push(pattern);
    }

    pattern.activityLevel = Math.min(1, pattern.activityLevel + 0.01);
    patternStore.set('timePatterns', timePatterns);
  }

  private recordSessionEnd(): void {
    if (!this.isEnabled()) return;

    const config = patternStore.get('config');
    if (!config.allowedPatterns.includes('session-duration')) return;

    const duration = Date.now() - this.currentSessionStart;
    const durations = patternStore.get('sessionDurations');
    durations.push(duration);

    // Keep only last 100 sessions
    if (durations.length > 100) {
      durations.splice(0, durations.length - 100);
    }
    patternStore.set('sessionDurations', durations);
  }

  // -------------------------------------------------------------------------
  // PATTERN DETECTION
  // -------------------------------------------------------------------------

  private detectWorkflowSequence(): void {
    if (this.recentWorkflowSteps.length < 3) return;

    const sequences = patternStore.get('workflowSequences');
    const recentSteps = this.recentWorkflowSteps.slice(-5);

    // Check if this sequence already exists
    const existing = sequences.find(s => 
      s.steps.length === recentSteps.length &&
      s.steps.every((step, i) => step === recentSteps[i])
    );

    if (existing) {
      existing.frequency++;
      existing.lastSeen = Date.now();
    } else {
      sequences.push({
        steps: [...recentSteps],
        frequency: 1,
        avgDuration: 0,
        lastSeen: Date.now(),
      });
    }

    // Keep only top 50 sequences
    sequences.sort((a, b) => b.frequency - a.frequency);
    patternStore.set('workflowSequences', sequences.slice(0, 50));
  }

  async analyzePatterns(): Promise<DetectedPattern[]> {
    if (!this.isEnabled()) return [];

    const patterns: DetectedPattern[] = [];
    const config = patternStore.get('config');

    // Analyze time patterns
    if (config.allowedPatterns.includes('time-of-day')) {
      const timePatterns = patternStore.get('timePatterns');
      const activeHours = timePatterns
        .filter(p => p.activityLevel > 0.5)
        .map(p => p.hour);

      if (activeHours.length > 0) {
        patterns.push({
          id: `time_${Date.now()}`,
          type: 'time-of-day',
          confidence: 0.7,
          description: `Most active during hours: ${[...new Set(activeHours)].join(', ')}`,
          data: { activeHours: [...new Set(activeHours)] },
          detectedAt: Date.now(),
          validUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
      }
    }

    // Analyze feature frequency
    if (config.allowedPatterns.includes('feature-frequency')) {
      const featureCounts: Record<string, number> = {};
      for (const entry of this.recentFeatures) {
        featureCounts[entry.feature] = (featureCounts[entry.feature] || 0) + 1;
      }

      const topFeatures = Object.entries(featureCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([f]) => f);

      if (topFeatures.length > 0) {
        patterns.push({
          id: `freq_${Date.now()}`,
          type: 'feature-frequency',
          confidence: 0.8,
          description: `Most used features: ${topFeatures.join(', ')}`,
          data: { topFeatures },
          detectedAt: Date.now(),
          validUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
      }
    }

    // Store detected patterns
    patternStore.set('patterns', patterns);
    patternStore.set('lastAnalysis', Date.now());

    return patterns;
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): PatternDetectionConfig {
    return patternStore.get('config');
  }

  async updateConfig(updates: Partial<PatternDetectionConfig>): Promise<PatternDetectionConfig> {
    const config = patternStore.get('config');
    const updated = { ...config, ...updates, anonymize: true }; // Always anonymize
    patternStore.set('config', updated);
    return updated;
  }

  getPatterns(): DetectedPattern[] {
    if (!this.isEnabled()) return [];
    return patternStore.get('patterns');
  }

  getSummary(): PatternSummary {
    const config = patternStore.get('config');
    const patterns = patternStore.get('patterns');
    const timePatterns = patternStore.get('timePatterns');
    const sequences = patternStore.get('workflowSequences');
    const durations = patternStore.get('sessionDurations');

    // Calculate most active hours
    const activeHours = timePatterns
      .filter(p => p.activityLevel > 0.3)
      .sort((a, b) => b.activityLevel - a.activityLevel)
      .slice(0, 5)
      .map(p => p.hour);

    // Get preferred features from recent usage
    const featureCounts: Record<string, number> = {};
    for (const entry of this.recentFeatures) {
      featureCounts[entry.feature] = (featureCounts[entry.feature] || 0) + 1;
    }
    const preferredFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([f]) => f);

    // Get common sequences
    const commonSequences = sequences
      .filter(s => s.frequency > 2)
      .slice(0, 3)
      .map(s => s.steps);

    // Calculate average session duration
    const avgSessionMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const avgSessionMinutes = Math.round(avgSessionMs / 60000);

    // Generate plain language summary
    let plainLanguage = 'Pattern detection is ';
    if (!config.enabled) {
      plainLanguage += 'disabled. Enable it in Settings to learn your usage patterns.';
    } else if (patterns.length === 0) {
      plainLanguage += 'enabled but still learning. Use Dex normally and patterns will emerge.';
    } else {
      const parts: string[] = [];
      if (activeHours.length > 0) {
        parts.push(`you're most active around ${activeHours[0]}:00`);
      }
      if (preferredFeatures.length > 0) {
        parts.push(`you frequently use ${preferredFeatures[0]}`);
      }
      if (avgSessionMinutes > 0) {
        parts.push(`your average session is ${avgSessionMinutes} minutes`);
      }
      plainLanguage = parts.length > 0
        ? `Dex has learned: ${parts.join(', ')}.`
        : 'Dex is learning your patterns.';
    }

    return {
      totalPatterns: patterns.length,
      activePatterns: patterns.filter(p => p.validUntil > Date.now()).length,
      mostActiveHours: activeHours,
      preferredFeatures,
      commonSequences,
      avgSessionMinutes,
      plainLanguage,
    };
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private cleanupOldData(): void {
    const config = patternStore.get('config');
    const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    // Clean old patterns
    const patterns = patternStore.get('patterns');
    patternStore.set('patterns', patterns.filter(p => p.detectedAt > cutoff));

    // Clean old sequences
    const sequences = patternStore.get('workflowSequences');
    patternStore.set('workflowSequences', sequences.filter(s => s.lastSeen > cutoff));

    // Decay time patterns
    const timePatterns = patternStore.get('timePatterns');
    for (const pattern of timePatterns) {
      pattern.activityLevel *= 0.95; // Gradual decay
    }
    patternStore.set('timePatterns', timePatterns.filter(p => p.activityLevel > 0.01));
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const patternDetectionEngine = PatternDetectionEngine.getInstance();
export default patternDetectionEngine;
