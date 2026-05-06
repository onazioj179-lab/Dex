// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Learning Controller
// Phase 7: Adaptive Intelligence (Lightweight, Local-Only)
// ===========================================================================

import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface UsageEvent {
  id: string;
  type: 'operation' | 'action' | 'workflow' | 'note' | 'timer' | 'search' | 'navigation';
  targetId: string;
  targetName: string;
  timestamp: number;
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23
  sessionId?: string;
}

export interface UsagePattern {
  id: string;
  type: 'frequency' | 'sequence' | 'time' | 'combination';
  description: string;
  confidence: number; // 0-1
  occurrences: number;
  lastSeen: number;
  data: Record<string, any>;
}

export interface Suggestion {
  id: string;
  type: 'workflow' | 'shortcut' | 'pin' | 'combination' | 'optimization';
  title: string;
  description: string;
  reason: string;
  confidence: number;
  actionType: string;
  actionData: Record<string, any>;
  createdAt: number;
  dismissed: boolean;
  accepted: boolean;
}

export interface LearningStats {
  totalEvents: number;
  uniqueOperations: number;
  uniqueActions: number;
  topOperations: Array<{ id: string; name: string; count: number }>;
  topActions: Array<{ id: string; name: string; count: number }>;
  peakHours: number[];
  averageSessionMinutes: number;
  patternsDetected: number;
  suggestionsGenerated: number;
  suggestionsAccepted: number;
}

export interface LearningSettings {
  enabled: boolean;
  trackOperations: boolean;
  trackActions: boolean;
  trackNavigation: boolean;
  trackTiming: boolean;
  showSuggestions: boolean;
  minConfidenceForSuggestion: number;
  retentionDays: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_SETTINGS: LearningSettings = {
  enabled: true,
  trackOperations: true,
  trackActions: true,
  trackNavigation: false,
  trackTiming: true,
  showSuggestions: true,
  minConfidenceForSuggestion: 0.7,
  retentionDays: 30,
};

const MAX_EVENTS = 5000; // Keep memory low
const MIN_OCCURRENCES_FOR_PATTERN = 3;
const COMBINATION_WINDOW_MS = 60000; // 1 minute window for combinations

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===========================================================================
// Learning Controller
// ===========================================================================

export class LearningController {
  private dataStore: DataStore;
  private logger: Logger;
  private settings: LearningSettings;
  private events: UsageEvent[] = [];
  private patterns: UsagePattern[] = [];
  private suggestions: Suggestion[] = [];
  private frequencyMap: Map<string, number> = new Map();
  private sequenceBuffer: UsageEvent[] = [];
  private initialized: boolean = false;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load saved data
      const savedSettings = await this.dataStore.get<LearningSettings>('learningSettings');
      if (savedSettings) {
        this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
      }

      const savedEvents = await this.dataStore.get<UsageEvent[]>('learningEvents');
      if (savedEvents) {
        this.events = savedEvents.slice(-MAX_EVENTS);
        this.rebuildFrequencyMap();
      }

      const savedPatterns = await this.dataStore.get<UsagePattern[]>('learningPatterns');
      if (savedPatterns) {
        this.patterns = savedPatterns;
      }

      const savedSuggestions = await this.dataStore.get<Suggestion[]>('learningSuggestions');
      if (savedSuggestions) {
        this.suggestions = savedSuggestions.filter(s => !s.dismissed);
      }

      // Cleanup old events
      await this.cleanupOldData();

      this.initialized = true;
      this.logger.info('Learning Controller initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Learning Controller');
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  getSettings(): LearningSettings {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<LearningSettings>): Promise<LearningSettings> {
    this.settings = { ...this.settings, ...updates };
    await this.dataStore.set('learningSettings', this.settings);
    this.logger.info('Learning settings updated');
    return this.settings;
  }

  async disableLearning(): Promise<void> {
    this.settings.enabled = false;
    await this.dataStore.set('learningSettings', this.settings);
    this.logger.info('Learning disabled');
  }

  async enableLearning(): Promise<void> {
    this.settings.enabled = true;
    await this.dataStore.set('learningSettings', this.settings);
    this.logger.info('Learning enabled');
  }

  async clearAllData(): Promise<void> {
    this.events = [];
    this.patterns = [];
    this.suggestions = [];
    this.frequencyMap.clear();
    this.sequenceBuffer = [];

    await this.dataStore.set('learningEvents', []);
    await this.dataStore.set('learningPatterns', []);
    await this.dataStore.set('learningSuggestions', []);

    this.logger.info('All learning data cleared');
  }

  // -------------------------------------------------------------------------
  // Event Tracking
  // -------------------------------------------------------------------------

  async trackEvent(
    type: UsageEvent['type'],
    targetId: string,
    targetName: string,
    sessionId?: string
  ): Promise<void> {
    if (!this.settings.enabled) return;

    // Check if tracking is enabled for this type
    if (type === 'operation' && !this.settings.trackOperations) return;
    if (type === 'action' && !this.settings.trackActions) return;
    if (type === 'navigation' && !this.settings.trackNavigation) return;

    const now = new Date();
    const event: UsageEvent = {
      id: generateId(),
      type,
      targetId,
      targetName,
      timestamp: now.getTime(),
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
      sessionId,
    };

    // Add to events
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    // Update frequency map
    const key = `${type}:${targetId}`;
    this.frequencyMap.set(key, (this.frequencyMap.get(key) || 0) + 1);

    // Add to sequence buffer for combination detection
    this.sequenceBuffer.push(event);
    this.trimSequenceBuffer();

    // Analyze patterns periodically (every 10 events)
    if (this.events.length % 10 === 0) {
      await this.analyzePatterns();
    }

    // Save periodically (every 5 events)
    if (this.events.length % 5 === 0) {
      await this.saveData();
    }
  }

  private trimSequenceBuffer(): void {
    const cutoff = Date.now() - COMBINATION_WINDOW_MS;
    this.sequenceBuffer = this.sequenceBuffer.filter(e => e.timestamp > cutoff);
  }

  private rebuildFrequencyMap(): void {
    this.frequencyMap.clear();
    for (const event of this.events) {
      const key = `${event.type}:${event.targetId}`;
      this.frequencyMap.set(key, (this.frequencyMap.get(key) || 0) + 1);
    }
  }

  // -------------------------------------------------------------------------
  // Pattern Analysis
  // -------------------------------------------------------------------------

  private async analyzePatterns(): Promise<void> {
    if (!this.settings.enabled) return;

    try {
      // Detect frequency patterns
      this.detectFrequencyPatterns();

      // Detect combination patterns
      this.detectCombinationPatterns();

      // Detect time patterns
      if (this.settings.trackTiming) {
        this.detectTimePatterns();
      }

      // Generate suggestions from patterns
      await this.generateSuggestions();

    } catch (error) {
      this.logger.error('Pattern analysis failed');
    }
  }

  private detectFrequencyPatterns(): void {
    // Find most used items
    const sorted = Array.from(this.frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    for (const [key, count] of sorted) {
      if (count < MIN_OCCURRENCES_FOR_PATTERN) continue;

      const [type, targetId] = key.split(':');
      const event = this.events.find(e => e.targetId === targetId);
      if (!event) continue;

      const existingPattern = this.patterns.find(
        p => p.type === 'frequency' && p.data.targetId === targetId
      );

      if (existingPattern) {
        existingPattern.occurrences = count;
        existingPattern.lastSeen = Date.now();
        existingPattern.confidence = Math.min(count / 20, 1);
      } else {
        this.patterns.push({
          id: generateId(),
          type: 'frequency',
          description: `${event.targetName} is used frequently`,
          confidence: Math.min(count / 20, 1),
          occurrences: count,
          lastSeen: Date.now(),
          data: { type, targetId, targetName: event.targetName },
        });
      }
    }
  }

  private detectCombinationPatterns(): void {
    // Look for items used together within the time window
    const combinations: Map<string, { items: string[]; names: string[]; count: number }> = new Map();

    // Group events by time windows
    const windowMs = 120000; // 2 minute windows
    const windows: UsageEvent[][] = [];
    let currentWindow: UsageEvent[] = [];
    let windowStart = 0;

    for (const event of this.events) {
      if (event.timestamp - windowStart > windowMs) {
        if (currentWindow.length > 1) {
          windows.push(currentWindow);
        }
        currentWindow = [event];
        windowStart = event.timestamp;
      } else {
        currentWindow.push(event);
      }
    }
    if (currentWindow.length > 1) {
      windows.push(currentWindow);
    }

    // Count combinations
    for (const window of windows) {
      const uniqueItems = [...new Set(window.map(e => e.targetId))];
      if (uniqueItems.length < 2 || uniqueItems.length > 4) continue;

      const key = uniqueItems.sort().join('+');
      const names = uniqueItems.map(id => {
        const event = window.find(e => e.targetId === id);
        return event?.targetName || id;
      });

      const existing = combinations.get(key);
      if (existing) {
        existing.count++;
      } else {
        combinations.set(key, { items: uniqueItems, names, count: 1 });
      }
    }

    // Create patterns from frequent combinations
    for (const [key, data] of combinations) {
      if (data.count < MIN_OCCURRENCES_FOR_PATTERN) continue;

      const existingPattern = this.patterns.find(
        p => p.type === 'combination' && p.data.key === key
      );

      if (existingPattern) {
        existingPattern.occurrences = data.count;
        existingPattern.lastSeen = Date.now();
        existingPattern.confidence = Math.min(data.count / 10, 1);
      } else {
        this.patterns.push({
          id: generateId(),
          type: 'combination',
          description: `${data.names.join(' + ')} are often used together`,
          confidence: Math.min(data.count / 10, 1),
          occurrences: data.count,
          lastSeen: Date.now(),
          data: { key, items: data.items, names: data.names },
        });
      }
    }
  }

  private detectTimePatterns(): void {
    // Find peak usage hours
    const hourCounts: number[] = new Array(24).fill(0);
    const dayOfWeekCounts: number[] = new Array(7).fill(0);

    for (const event of this.events) {
      hourCounts[event.hourOfDay]++;
      dayOfWeekCounts[event.dayOfWeek]++;
    }

    // Find peak hours (above average)
    const avgHour = this.events.length / 24;
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > avgHour * 1.5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(h => h.hour);

    if (peakHours.length > 0) {
      const existingPattern = this.patterns.find(p => p.type === 'time' && p.data.subtype === 'peakHours');
      
      if (existingPattern) {
        existingPattern.data.hours = peakHours;
        existingPattern.lastSeen = Date.now();
      } else {
        this.patterns.push({
          id: generateId(),
          type: 'time',
          description: `Most active during hours: ${peakHours.join(', ')}`,
          confidence: 0.8,
          occurrences: this.events.length,
          lastSeen: Date.now(),
          data: { subtype: 'peakHours', hours: peakHours },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Suggestion Generation
  // -------------------------------------------------------------------------

  private async generateSuggestions(): Promise<void> {
    if (!this.settings.showSuggestions) return;

    // Generate suggestions from combination patterns
    for (const pattern of this.patterns) {
      if (pattern.type !== 'combination') continue;
      if (pattern.confidence < this.settings.minConfidenceForSuggestion) continue;

      const existingSuggestion = this.suggestions.find(
        s => s.actionData.patternId === pattern.id
      );
      if (existingSuggestion) continue;

      const names = pattern.data.names as string[];
      if (names.length < 2) continue;

      this.suggestions.push({
        id: generateId(),
        type: 'workflow',
        title: `Create "${names.slice(0, 2).join(' + ')}" workflow`,
        description: `You often use ${names.join(', ')} together. Create a combined workflow?`,
        reason: `Used together ${pattern.occurrences} times`,
        confidence: pattern.confidence,
        actionType: 'createWorkflow',
        actionData: {
          patternId: pattern.id,
          items: pattern.data.items,
          names: pattern.data.names,
        },
        createdAt: Date.now(),
        dismissed: false,
        accepted: false,
      });
    }

    // Generate pin suggestions for frequent items
    for (const pattern of this.patterns) {
      if (pattern.type !== 'frequency') continue;
      if (pattern.confidence < 0.8) continue;
      if (pattern.occurrences < 10) continue;

      const existingSuggestion = this.suggestions.find(
        s => s.actionData.targetId === pattern.data.targetId && s.type === 'pin'
      );
      if (existingSuggestion) continue;

      this.suggestions.push({
        id: generateId(),
        type: 'pin',
        title: `Pin "${pattern.data.targetName}"`,
        description: `You use ${pattern.data.targetName} frequently. Pin it for quick access?`,
        reason: `Used ${pattern.occurrences} times`,
        confidence: pattern.confidence,
        actionType: 'pin',
        actionData: {
          targetId: pattern.data.targetId,
          targetName: pattern.data.targetName,
          targetType: pattern.data.type,
        },
        createdAt: Date.now(),
        dismissed: false,
        accepted: false,
      });
    }

    // Keep only recent, non-dismissed suggestions
    this.suggestions = this.suggestions
      .filter(s => !s.dismissed)
      .slice(-20);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getSuggestions(): Suggestion[] {
    if (!this.settings.showSuggestions) return [];
    return this.suggestions
      .filter(s => !s.dismissed && !s.accepted)
      .filter(s => s.confidence >= this.settings.minConfidenceForSuggestion)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  async dismissSuggestion(suggestionId: string): Promise<void> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.dismissed = true;
      await this.saveData();
    }
  }

  async acceptSuggestion(suggestionId: string): Promise<Suggestion | null> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.accepted = true;
      await this.saveData();
      return suggestion;
    }
    return null;
  }

  getPatterns(): UsagePattern[] {
    return this.patterns
      .filter(p => p.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence);
  }

  getStats(): LearningStats {
    const operationCounts: Map<string, { name: string; count: number }> = new Map();
    const actionCounts: Map<string, { name: string; count: number }> = new Map();

    for (const event of this.events) {
      if (event.type === 'operation') {
        const existing = operationCounts.get(event.targetId);
        if (existing) {
          existing.count++;
        } else {
          operationCounts.set(event.targetId, { name: event.targetName, count: 1 });
        }
      } else if (event.type === 'action') {
        const existing = actionCounts.get(event.targetId);
        if (existing) {
          existing.count++;
        } else {
          actionCounts.set(event.targetId, { name: event.targetName, count: 1 });
        }
      }
    }

    const topOperations = Array.from(operationCounts.entries())
      .map(([id, data]) => ({ id, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topActions = Array.from(actionCounts.entries())
      .map(([id, data]) => ({ id, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate peak hours
    const hourCounts: number[] = new Array(24).fill(0);
    for (const event of this.events) {
      hourCounts[event.hourOfDay]++;
    }
    const avgHour = this.events.length / 24;
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > avgHour)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(h => h.hour);

    return {
      totalEvents: this.events.length,
      uniqueOperations: operationCounts.size,
      uniqueActions: actionCounts.size,
      topOperations,
      topActions,
      peakHours,
      averageSessionMinutes: 0, // No session duration tracking configured
      patternsDetected: this.patterns.length,
      suggestionsGenerated: this.suggestions.length,
      suggestionsAccepted: this.suggestions.filter(s => s.accepted).length,
    };
  }

  // -------------------------------------------------------------------------
  // Data Management
  // -------------------------------------------------------------------------

  private async saveData(): Promise<void> {
    try {
      await this.dataStore.set('learningEvents', this.events);
      await this.dataStore.set('learningPatterns', this.patterns);
      await this.dataStore.set('learningSuggestions', this.suggestions);
    } catch (error) {
      this.logger.error('Failed to save learning data');
    }
  }

  private async cleanupOldData(): Promise<void> {
    const cutoff = Date.now() - (this.settings.retentionDays * 24 * 60 * 60 * 1000);

    const beforeCount = this.events.length;
    this.events = this.events.filter(e => e.timestamp > cutoff);

    if (this.events.length < beforeCount) {
      this.rebuildFrequencyMap();
      await this.saveData();
      this.logger.info(`Cleaned up ${beforeCount - this.events.length} old learning events`);
    }
  }
}
