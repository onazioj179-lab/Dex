// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Pattern Learning System
 * Local-only, privacy-first usage pattern learning
 * Runs silently in background - no UI, no toggles
 * Learns user patterns to provide smart suggestions
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ==================== TYPES ====================

interface UsageEvent {
  type: 'app_open' | 'app_close' | 'file_open' | 'tool_use' | 'action';
  target: string;
  context?: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface PatternData {
  // Time-based patterns
  hourlyUsage: Record<number, Record<string, number>>; // hour -> app/tool -> count
  dayOfWeekUsage: Record<number, Record<string, number>>; // 0-6 -> app/tool -> count
  
  // Sequence patterns
  sequences: Record<string, Record<string, number>>; // after X, user often does Y
  
  // Context patterns
  fileTypeToApp: Record<string, Record<string, number>>; // extension -> app -> count
  toolCombinations: Record<string, Record<string, number>>; // tool A often used with tool B
  
  // Frequency
  totalUsage: Record<string, number>; // app/tool -> total count
  recentUsage: string[]; // last 50 items used
  
  // Session patterns
  sessionLengths: number[]; // array of session durations
  averageSessionLength: number;
  
  // Last updated
  lastUpdated: number;
  version: number;
}

interface Suggestion {
  type: 'app' | 'tool' | 'action' | 'file';
  target: string;
  reason: 'time_pattern' | 'sequence' | 'frequent' | 'context';
  confidence: number; // 0-1
  context?: string;
}

// ==================== PATTERN LEARNING ENGINE ====================

class PatternLearningEngine {
  private dataPath: string;
  private patterns: PatternData;
  private currentSession: UsageEvent[] = [];
  private sessionStart: number = Date.now();
  private saveDebounce: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.dataPath = '';
    this.patterns = this.createEmptyPatterns();
  }

  private createEmptyPatterns(): PatternData {
    return {
      hourlyUsage: {},
      dayOfWeekUsage: {},
      sequences: {},
      fileTypeToApp: {},
      toolCombinations: {},
      totalUsage: {},
      recentUsage: [],
      sessionLengths: [],
      averageSessionLength: 0,
      lastUpdated: Date.now(),
      version: 1,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const userDataPath = app.getPath('userData');
      this.dataPath = path.join(userDataPath, 'pattern-data.json');
      
      // Load existing patterns
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf-8');
        const loaded = JSON.parse(data);
        this.patterns = { ...this.createEmptyPatterns(), ...loaded };
      }
      
      this.sessionStart = Date.now();
      this.initialized = true;
    } catch (e) {
      // Silent fail - pattern learning is optional
      this.patterns = this.createEmptyPatterns();
      this.initialized = true;
    }
  }

  // Record a usage event
  recordEvent(event: Omit<UsageEvent, 'timestamp'>): void {
    if (!this.initialized) return;
    
    const fullEvent: UsageEvent = {
      ...event,
      timestamp: Date.now(),
    };
    
    this.currentSession.push(fullEvent);
    this.updatePatterns(fullEvent);
    this.scheduleSave();
  }

  // Record app open
  recordAppOpen(appId: string, context?: string): void {
    this.recordEvent({ type: 'app_open', target: appId, context });
  }

  // Record app close
  recordAppClose(appId: string, duration?: number): void {
    this.recordEvent({ type: 'app_close', target: appId, duration });
  }

  // Record file open
  recordFileOpen(filePath: string, appId?: string): void {
    const ext = path.extname(filePath).toLowerCase();
    this.recordEvent({ 
      type: 'file_open', 
      target: filePath, 
      context: appId,
      metadata: { extension: ext }
    });
  }

  // Record tool use
  recordToolUse(toolId: string, appId?: string): void {
    this.recordEvent({ type: 'tool_use', target: toolId, context: appId });
  }

  // Record generic action
  recordAction(actionId: string, context?: string): void {
    this.recordEvent({ type: 'action', target: actionId, context });
  }

  private updatePatterns(event: UsageEvent): void {
    const hour = new Date(event.timestamp).getHours();
    const dayOfWeek = new Date(event.timestamp).getDay();
    const target = event.target;

    // Update hourly usage
    if (!this.patterns.hourlyUsage[hour]) {
      this.patterns.hourlyUsage[hour] = {};
    }
    this.patterns.hourlyUsage[hour][target] = (this.patterns.hourlyUsage[hour][target] || 0) + 1;

    // Update day of week usage
    if (!this.patterns.dayOfWeekUsage[dayOfWeek]) {
      this.patterns.dayOfWeekUsage[dayOfWeek] = {};
    }
    this.patterns.dayOfWeekUsage[dayOfWeek][target] = (this.patterns.dayOfWeekUsage[dayOfWeek][target] || 0) + 1;

    // Update sequences (what comes after what)
    if (this.patterns.recentUsage.length > 0) {
      const lastUsed = this.patterns.recentUsage[this.patterns.recentUsage.length - 1];
      if (!this.patterns.sequences[lastUsed]) {
        this.patterns.sequences[lastUsed] = {};
      }
      this.patterns.sequences[lastUsed][target] = (this.patterns.sequences[lastUsed][target] || 0) + 1;
    }

    // Update file type to app mapping
    if (event.type === 'file_open' && event.metadata?.extension && event.context) {
      const ext = event.metadata.extension;
      if (!this.patterns.fileTypeToApp[ext]) {
        this.patterns.fileTypeToApp[ext] = {};
      }
      this.patterns.fileTypeToApp[ext][event.context] = (this.patterns.fileTypeToApp[ext][event.context] || 0) + 1;
    }

    // Update total usage
    this.patterns.totalUsage[target] = (this.patterns.totalUsage[target] || 0) + 1;

    // Update recent usage (keep last 50)
    this.patterns.recentUsage.push(target);
    if (this.patterns.recentUsage.length > 50) {
      this.patterns.recentUsage = this.patterns.recentUsage.slice(-50);
    }

    this.patterns.lastUpdated = Date.now();
  }

  // Get suggestions based on patterns
  getSuggestions(context?: { currentApp?: string; fileExtension?: string; limit?: number }): Suggestion[] {
    if (!this.initialized) return [];
    
    const suggestions: Suggestion[] = [];
    const limit = context?.limit || 5;
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Time-based suggestions
    const hourlyPatterns = this.patterns.hourlyUsage[hour] || {};
    const sortedHourly = Object.entries(hourlyPatterns)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    
    for (const [target, count] of sortedHourly) {
      const totalForTarget = this.patterns.totalUsage[target] || 1;
      const confidence = Math.min(count / totalForTarget, 0.9);
      if (confidence > 0.2) {
        suggestions.push({
          type: 'app',
          target,
          reason: 'time_pattern',
          confidence,
          context: `Often used at ${hour}:00`,
        });
      }
    }

    // Sequence-based suggestions (what usually comes next)
    if (context?.currentApp) {
      const sequencePatterns = this.patterns.sequences[context.currentApp] || {};
      const sortedSequence = Object.entries(sequencePatterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      
      for (const [target, count] of sortedSequence) {
        if (target !== context.currentApp) {
          suggestions.push({
            type: 'app',
            target,
            reason: 'sequence',
            confidence: Math.min(count / 10, 0.8),
            context: `Often used after ${context.currentApp}`,
          });
        }
      }
    }

    // File type suggestions
    if (context?.fileExtension) {
      const appPatterns = this.patterns.fileTypeToApp[context.fileExtension] || {};
      const sortedApps = Object.entries(appPatterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2);
      
      for (const [target, count] of sortedApps) {
        suggestions.push({
          type: 'app',
          target,
          reason: 'context',
          confidence: Math.min(count / 5, 0.9),
          context: `Usually opens ${context.fileExtension} files`,
        });
      }
    }

    // Most frequently used
    const sortedFrequent = Object.entries(this.patterns.totalUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    for (const [target, count] of sortedFrequent) {
      if (!suggestions.find(s => s.target === target)) {
        suggestions.push({
          type: 'app',
          target,
          reason: 'frequent',
          confidence: Math.min(count / 100, 0.7),
          context: `Used ${count} times`,
        });
      }
    }

    // Sort by confidence and deduplicate
    const seen = new Set<string>();
    return suggestions
      .filter(s => {
        if (seen.has(s.target)) return false;
        seen.add(s.target);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  // Get frequently used items
  getFrequentItems(type?: 'app' | 'tool' | 'file', limit = 10): Array<{ id: string; count: number }> {
    return Object.entries(this.patterns.totalUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }));
  }

  // Get recent items
  getRecentItems(limit = 10): string[] {
    return [...this.patterns.recentUsage].reverse().slice(0, limit);
  }

  // End session and record duration
  endSession(): void {
    if (!this.initialized) return;
    
    const duration = Date.now() - this.sessionStart;
    this.patterns.sessionLengths.push(duration);
    
    // Keep last 100 sessions
    if (this.patterns.sessionLengths.length > 100) {
      this.patterns.sessionLengths = this.patterns.sessionLengths.slice(-100);
    }
    
    // Calculate average
    const total = this.patterns.sessionLengths.reduce((a, b) => a + b, 0);
    this.patterns.averageSessionLength = total / this.patterns.sessionLengths.length;
    
    this.savePatterns();
  }

  private scheduleSave(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }
    this.saveDebounce = setTimeout(() => this.savePatterns(), 5000);
  }

  private savePatterns(): void {
    if (!this.initialized || !this.dataPath) return;
    
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.patterns, null, 2));
    } catch (e) {
      // Silent fail
    }
  }

  shutdown(): void {
    this.endSession();
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }
    this.savePatterns();
  }

  // ==================== NEW METHODS ====================

  // Get tool combinations (what tools are often used together)
  getToolCombinations(toolId: string): Array<{ tool: string; count: number }> {
    const combos = this.patterns.toolCombinations[toolId] || {};
    return Object.entries(combos)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));
  }

  // Get day of week patterns (which apps/tools used on which days)
  getDayOfWeekPatterns(): Record<number, Array<{ app: string; count: number }>> {
    const result: Record<number, Array<{ app: string; count: number }>> = {};
    for (let day = 0; day < 7; day++) {
      const dayUsage = this.patterns.dayOfWeekUsage[day] || {};
      result[day] = Object.entries(dayUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([app, count]) => ({ app, count }));
    }
    return result;
  }

  // Get preferred app for a file extension
  getPreferredAppForFile(extension: string): string | null {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const apps = this.patterns.fileTypeToApp[ext.toLowerCase()] || {};
    const sorted = Object.entries(apps).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || null;
  }

  // Get hourly patterns (what's used at each hour)
  getHourlyPatterns(): Record<number, Array<{ app: string; count: number }>> {
    const result: Record<number, Array<{ app: string; count: number }>> = {};
    for (let hour = 0; hour < 24; hour++) {
      const hourUsage = this.patterns.hourlyUsage[hour] || {};
      result[hour] = Object.entries(hourUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([app, count]) => ({ app, count }));
    }
    return result;
  }

  // Get session stats
  getSessionStats(): { average: number; total: number; count: number } {
    return {
      average: this.patterns.averageSessionLength,
      total: this.patterns.sessionLengths.reduce((a, b) => a + b, 0),
      count: this.patterns.sessionLengths.length,
    };
  }

  // Record tool combination (when two tools are used in sequence)
  recordToolCombination(tool1: string, tool2: string, appId?: string): void {
    if (!this.initialized) return;
    
    if (!this.patterns.toolCombinations[tool1]) {
      this.patterns.toolCombinations[tool1] = {};
    }
    this.patterns.toolCombinations[tool1][tool2] = 
      (this.patterns.toolCombinations[tool1][tool2] || 0) + 1;
    
    // Record both directions for symmetric lookup
    if (!this.patterns.toolCombinations[tool2]) {
      this.patterns.toolCombinations[tool2] = {};
    }
    this.patterns.toolCombinations[tool2][tool1] = 
      (this.patterns.toolCombinations[tool2][tool1] || 0) + 1;
    
    this.scheduleSave();
  }

  // Clean old data (keep last 30 days of patterns)
  cleanOldData(): void {
    if (!this.initialized) return;
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    // Keep only recent sessions
    this.patterns.sessionLengths = this.patterns.sessionLengths.slice(-100);
    
    // Keep only recent items in recentUsage
    this.patterns.recentUsage = this.patterns.recentUsage.slice(-50);
    
    // Decay old frequency counts (reduce by 10% each cleanup)
    for (const key in this.patterns.totalUsage) {
      this.patterns.totalUsage[key] = Math.floor(this.patterns.totalUsage[key] * 0.9);
      if (this.patterns.totalUsage[key] < 1) {
        delete this.patterns.totalUsage[key];
      }
    }
    
    this.patterns.lastUpdated = Date.now();
    this.savePatterns();
  }

  // Get all patterns for export/debugging
  getAllPatterns(): PatternData {
    return { ...this.patterns };
  }
}

// ==================== SINGLETON INSTANCE ====================

export const patternLearning = new PatternLearningEngine();

// ==================== INITIALIZATION ====================

export async function initializePatternLearning(): Promise<void> {
  await patternLearning.initialize();
}

export function shutdownPatternLearning(): void {
  patternLearning.shutdown();
}

// ==================== EXPORTS ====================

export type { UsageEvent, PatternData, Suggestion };
