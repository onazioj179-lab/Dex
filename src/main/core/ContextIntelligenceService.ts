// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Context Intelligence Service
// Phase 69: Pattern Awareness (Non-AI)
// Usage-based ranking, context-aware prioritization, quiet anticipation
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface UsageRecord {
  id: string;
  type: 'action' | 'page' | 'file' | 'search' | 'command';
  timestamp: number;
  context?: string; // Project or workspace context
  duration?: number; // Time spent
}

export interface UsageStats {
  id: string;
  type: string;
  totalUses: number;
  recentUses: number; // Last 7 days
  lastUsed: number;
  averageDuration: number;
  contextFrequency: Map<string, number>;
}

export interface ContextHint {
  type: 'likely_action' | 'recent_file' | 'frequent_search' | 'next_step';
  id: string;
  confidence: number; // 0-1
  reason: string;
}

export interface ProjectContext {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
  lastView: string;
  recentFiles: string[];
  frequentActions: string[];
}

// ===========================================================================
// CONTEXT INTELLIGENCE SERVICE
// ===========================================================================

class ContextIntelligenceServiceClass extends EventEmitter {
  private usageHistory: UsageRecord[] = [];
  private usageStats: Map<string, UsageStats> = new Map();
  private projectContexts: Map<string, ProjectContext> = new Map();
  private currentContext: string | null = null;
  private dataPath: string;
  private saveDebounce: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly MAX_HISTORY = 10000;
  private readonly RECENT_WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly SAVE_DEBOUNCE = 5000; // 5 seconds
  private readonly MIN_CONFIDENCE = 0.3;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'context-intelligence.json');
    this.loadData();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Record usage
    ipcMain.handle('context:recordUsage', (_event, type: string, id: string, duration?: number) => {
      this.recordUsage(type as UsageRecord['type'], id, duration);
      return { success: true };
    });

    // Get ranked items
    ipcMain.handle('context:getRankedActions', (_event, limit?: number) => {
      return this.getRankedActions(limit);
    });

    ipcMain.handle('context:getRankedSearchResults', (_event, results: Array<{ id: string; score: number }>) => {
      return this.rankSearchResults(results);
    });

    // Get suggestions
    ipcMain.handle('context:getSuggestions', () => {
      return this.getSuggestions();
    });

    // Project context
    ipcMain.handle('context:setProject', (_event, projectId: string) => {
      this.setCurrentContext(projectId);
      return { success: true };
    });

    ipcMain.handle('context:getProjectContext', (_event, projectId?: string) => {
      return this.getProjectContext(projectId || this.currentContext || '');
    });

    ipcMain.handle('context:saveViewState', (_event, view: string, state: Record<string, unknown>) => {
      this.saveViewState(view, state);
      return { success: true };
    });

    ipcMain.handle('context:getViewState', (_event, view: string) => {
      return this.getViewState(view);
    });

    // Stats
    ipcMain.handle('context:getStats', () => {
      return this.getPublicStats();
    });
  }

  // -------------------------------------------------------------------------
  // USAGE TRACKING
  // -------------------------------------------------------------------------

  /**
   * Record a usage event
   */
  recordUsage(type: UsageRecord['type'], id: string, duration?: number): void {
    const record: UsageRecord = {
      id,
      type,
      timestamp: Date.now(),
      context: this.currentContext || undefined,
      duration
    };

    this.usageHistory.push(record);
    
    // Trim history if too large
    if (this.usageHistory.length > this.MAX_HISTORY) {
      this.usageHistory = this.usageHistory.slice(-this.MAX_HISTORY);
    }

    // Update stats
    this.updateStats(record);
    
    // Update project context
    if (this.currentContext) {
      this.updateProjectContext(record);
    }

    this.scheduleSave();
    this.emit('usage:recorded', record);
  }

  /**
   * Update usage statistics
   */
  private updateStats(record: UsageRecord): void {
    const key = `${record.type}:${record.id}`;
    let stats = this.usageStats.get(key);

    if (!stats) {
      stats = {
        id: record.id,
        type: record.type,
        totalUses: 0,
        recentUses: 0,
        lastUsed: 0,
        averageDuration: 0,
        contextFrequency: new Map()
      };
      this.usageStats.set(key, stats);
    }

    stats.totalUses++;
    stats.lastUsed = record.timestamp;

    // Update average duration
    if (record.duration) {
      const totalDuration = stats.averageDuration * (stats.totalUses - 1) + record.duration;
      stats.averageDuration = totalDuration / stats.totalUses;
    }

    // Update context frequency
    if (record.context) {
      const freq = stats.contextFrequency.get(record.context) || 0;
      stats.contextFrequency.set(record.context, freq + 1);
    }

    // Recalculate recent uses
    const recentThreshold = Date.now() - this.RECENT_WINDOW;
    stats.recentUses = this.usageHistory.filter(
      r => r.id === record.id && r.type === record.type && r.timestamp > recentThreshold
    ).length;
  }

  // -------------------------------------------------------------------------
  // RANKING
  // -------------------------------------------------------------------------

  /**
   * Get actions ranked by usage
   */
  getRankedActions(limit: number = 10): Array<{ id: string; score: number; reason: string }> {
    const actionStats = Array.from(this.usageStats.values())
      .filter(s => s.type === 'action');

    return this.calculateRanking(actionStats, limit);
  }

  /**
   * Rank search results based on context
   */
  rankSearchResults(results: Array<{ id: string; score: number }>): Array<{ id: string; score: number; boosted: boolean }> {
    return results.map(result => {
      const key = `file:${result.id}`;
      const stats = this.usageStats.get(key);
      
      let boost = 0;
      let boosted = false;

      if (stats) {
        // Boost based on recent usage
        if (stats.recentUses > 0) {
          boost += Math.min(0.2, stats.recentUses * 0.05);
        }

        // Boost based on context match
        if (this.currentContext && stats.contextFrequency.has(this.currentContext)) {
          const contextUses = stats.contextFrequency.get(this.currentContext)!;
          boost += Math.min(0.15, contextUses * 0.03);
        }

        if (boost > 0) {
          boosted = true;
        }
      }

      return {
        id: result.id,
        score: result.score + boost,
        boosted
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate ranking score
   */
  private calculateRanking(
    stats: UsageStats[],
    limit: number
  ): Array<{ id: string; score: number; reason: string }> {
    const now = Date.now();
    
    const scored = stats.map(s => {
      // Base score from total usage
      let score = Math.log10(s.totalUses + 1) * 0.3;
      
      // Recency boost
      const daysSinceUse = (now - s.lastUsed) / (24 * 60 * 60 * 1000);
      score += Math.max(0, 0.3 - daysSinceUse * 0.01);
      
      // Recent frequency boost
      score += Math.min(0.2, s.recentUses * 0.02);
      
      // Context match boost
      if (this.currentContext && s.contextFrequency.has(this.currentContext)) {
        score += 0.2;
      }

      let reason = 'frequently used';
      if (daysSinceUse < 1) reason = 'used recently';
      if (this.currentContext && s.contextFrequency.has(this.currentContext)) {
        reason = 'relevant to current project';
      }

      return { id: s.id, score, reason };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // SUGGESTIONS
  // -------------------------------------------------------------------------

  /**
   * Get quiet suggestions based on patterns
   */
  getSuggestions(): ContextHint[] {
    const hints: ContextHint[] = [];
    const now = Date.now();

    // Likely next action based on time patterns
    const hourOfDay = new Date().getHours();
    const timeBasedActions = this.getTimeBasedPatterns(hourOfDay);
    for (const action of timeBasedActions.slice(0, 2)) {
      if (action.confidence >= this.MIN_CONFIDENCE) {
        hints.push({
          type: 'likely_action',
          id: action.id,
          confidence: action.confidence,
          reason: `Often used at this time`
        });
      }
    }

    // Recent files in current context
    if (this.currentContext) {
      const context = this.projectContexts.get(this.currentContext);
      if (context) {
        for (const file of context.recentFiles.slice(0, 3)) {
          hints.push({
            type: 'recent_file',
            id: file,
            confidence: 0.6,
            reason: 'Recently used in this project'
          });
        }
      }
    }

    // Frequent searches
    const searchStats = Array.from(this.usageStats.values())
      .filter(s => s.type === 'search' && s.recentUses > 2);
    
    for (const search of searchStats.slice(0, 2)) {
      hints.push({
        type: 'frequent_search',
        id: search.id,
        confidence: Math.min(0.8, search.recentUses * 0.1),
        reason: `Searched ${search.recentUses} times recently`
      });
    }

    return hints.filter(h => h.confidence >= this.MIN_CONFIDENCE);
  }

  /**
   * Get time-based usage patterns
   */
  private getTimeBasedPatterns(hour: number): Array<{ id: string; confidence: number }> {
    // Analyze usage history for time patterns
    const hourWindow = 2; // +/- hours
    const relevantRecords = this.usageHistory.filter(r => {
      const recordHour = new Date(r.timestamp).getHours();
      return Math.abs(recordHour - hour) <= hourWindow || 
             Math.abs(recordHour - hour) >= (24 - hourWindow);
    });

    // Count action frequencies
    const actionCounts = new Map<string, number>();
    for (const record of relevantRecords) {
      if (record.type === 'action') {
        actionCounts.set(record.id, (actionCounts.get(record.id) || 0) + 1);
      }
    }

    // Calculate confidence
    const total = relevantRecords.length;
    return Array.from(actionCounts.entries())
      .map(([id, count]) => ({
        id,
        confidence: Math.min(0.9, count / Math.max(total, 10))
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  // -------------------------------------------------------------------------
  // PROJECT CONTEXT
  // -------------------------------------------------------------------------

  /**
   * Set current project context
   */
  setCurrentContext(projectId: string): void {
    this.currentContext = projectId;
    
    if (!this.projectContexts.has(projectId)) {
      this.projectContexts.set(projectId, {
        id: projectId,
        name: projectId,
        path: '',
        lastOpened: Date.now(),
        lastView: 'dashboard',
        recentFiles: [],
        frequentActions: []
      });
    } else {
      const context = this.projectContexts.get(projectId)!;
      context.lastOpened = Date.now();
    }

    this.scheduleSave();
  }

  /**
   * Get project context
   */
  getProjectContext(projectId: string): ProjectContext | null {
    return this.projectContexts.get(projectId) || null;
  }

  /**
   * Update project context from usage
   */
  private updateProjectContext(record: UsageRecord): void {
    if (!record.context) return;
    
    const context = this.projectContexts.get(record.context);
    if (!context) return;

    if (record.type === 'file') {
      // Update recent files
      context.recentFiles = [
        record.id,
        ...context.recentFiles.filter(f => f !== record.id)
      ].slice(0, 20);
    }

    if (record.type === 'action') {
      // Update frequent actions
      const actionIndex = context.frequentActions.indexOf(record.id);
      if (actionIndex > -1) {
        context.frequentActions.splice(actionIndex, 1);
      }
      context.frequentActions.unshift(record.id);
      context.frequentActions = context.frequentActions.slice(0, 10);
    }

    if (record.type === 'page') {
      context.lastView = record.id;
    }
  }

  // -------------------------------------------------------------------------
  // VIEW STATE
  // -------------------------------------------------------------------------

  private viewStates: Map<string, Record<string, unknown>> = new Map();

  /**
   * Save view state for a page
   */
  saveViewState(view: string, state: Record<string, unknown>): void {
    const key = this.currentContext ? `${this.currentContext}:${view}` : view;
    this.viewStates.set(key, state);
    this.scheduleSave();
  }

  /**
   * Get saved view state
   */
  getViewState(view: string): Record<string, unknown> | null {
    const key = this.currentContext ? `${this.currentContext}:${view}` : view;
    return this.viewStates.get(key) || null;
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private loadData(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        
        // Load history (limited)
        this.usageHistory = (data.usageHistory || []).slice(-this.MAX_HISTORY);
        
        // Rebuild stats from history
        for (const record of this.usageHistory) {
          this.updateStats(record);
        }
        
        // Load project contexts
        if (data.projectContexts) {
          for (const [id, context] of Object.entries(data.projectContexts)) {
            this.projectContexts.set(id, context as ProjectContext);
          }
        }

        // Load view states
        if (data.viewStates) {
          for (const [key, state] of Object.entries(data.viewStates)) {
            this.viewStates.set(key, state as Record<string, unknown>);
          }
        }

        log.info(`[ContextIntelligence] Loaded ${this.usageHistory.length} history records`);
      }
    } catch (error) {
      log.error('[ContextIntelligence] Failed to load data:', error);
    }
  }

  private scheduleSave(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }
    this.saveDebounce = setTimeout(() => this.saveData(), this.SAVE_DEBOUNCE);
  }

  private saveData(): void {
    try {
      const data = {
        usageHistory: this.usageHistory.slice(-this.MAX_HISTORY),
        projectContexts: Object.fromEntries(this.projectContexts),
        viewStates: Object.fromEntries(this.viewStates)
      };
      
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
      log.debug('[ContextIntelligence] Data saved');
    } catch (error) {
      log.error('[ContextIntelligence] Failed to save data:', error);
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC STATS
  // -------------------------------------------------------------------------

  getPublicStats(): {
    historySize: number;
    trackedItems: number;
    projectCount: number;
    currentContext: string | null;
  } {
    return {
      historySize: this.usageHistory.length,
      trackedItems: this.usageStats.size,
      projectCount: this.projectContexts.size,
      currentContext: this.currentContext
    };
  }

  /**
   * Clear all data (for privacy)
   */
  clearAll(): void {
    this.usageHistory = [];
    this.usageStats.clear();
    this.projectContexts.clear();
    this.viewStates.clear();
    this.saveData();
    log.info('[ContextIntelligence] All data cleared');
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const ContextIntelligenceService = new ContextIntelligenceServiceClass();
export default ContextIntelligenceService;
