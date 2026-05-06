// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Workflow Intelligence System
// Phase 43: Advisory suggestions - subtle, never auto-run, always dismissible
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type SuggestionType = 
  | 'workflow-shortcut'
  | 'parameter-prefill'
  | 'command-rank'
  | 'timing-optimization'
  | 'sequence-completion';

export interface WorkflowSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  confidence: number;           // 0-1
  actionId?: string;           // What to do if accepted
  parameters?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  dismissed: boolean;
  accepted: boolean;
}

export interface WorkflowIntelligenceConfig {
  enabled: boolean;
  suggestShortcuts: boolean;
  prefillParameters: boolean;
  rankCommands: boolean;
  suggestTiming: boolean;
  maxSuggestions: number;
  minConfidence: number;        // 0-1, only show above this
  subtleMode: boolean;          // Less prominent suggestions
}

export interface CommandRanking {
  commandId: string;
  score: number;
  lastUsed: number;
  useCount: number;
  contextScore: number;
}

export interface ParameterHistory {
  parameterId: string;
  values: Array<{ value: unknown; frequency: number; lastUsed: number }>;
}

// ===========================================================================
// STORE
// ===========================================================================

const intelligenceStore = new Store<{
  config: WorkflowIntelligenceConfig;
  suggestions: WorkflowSuggestion[];
  commandRankings: CommandRanking[];
  parameterHistory: ParameterHistory[];
  dismissedSuggestionTypes: string[];
  stats: {
    suggestionsShown: number;
    suggestionsAccepted: number;
    suggestionsDismissed: number;
  };
}>({
  name: 'workflow-intelligence',
  defaults: {
    config: {
      enabled: true,              // Enabled by default
      suggestShortcuts: true,
      prefillParameters: true,
      rankCommands: true,
      suggestTiming: false,       // Conservative default
      maxSuggestions: 3,
      minConfidence: 0.6,
      subtleMode: true,
    },
    suggestions: [],
    commandRankings: [],
    parameterHistory: [],
    dismissedSuggestionTypes: [],
    stats: {
      suggestionsShown: 0,
      suggestionsAccepted: 0,
      suggestionsDismissed: 0,
    },
  },
});

// ===========================================================================
// WORKFLOW INTELLIGENCE
// ===========================================================================

class WorkflowIntelligence {
  private static instance: WorkflowIntelligence;
  private initialized = false;

  private constructor() {}

  static getInstance(): WorkflowIntelligence {
    if (!WorkflowIntelligence.instance) {
      WorkflowIntelligence.instance = new WorkflowIntelligence();
    }
    return WorkflowIntelligence.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.cleanupExpiredSuggestions();

    this.initialized = true;
    log.info('[WorkflowIntelligence] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('intelligence:getConfig', () => this.getConfig());
    ipcMain.handle('intelligence:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('intelligence:getSuggestions', () => this.getSuggestions());
    ipcMain.handle('intelligence:dismissSuggestion', (_, id) => this.dismissSuggestion(id));
    ipcMain.handle('intelligence:acceptSuggestion', (_, id) => this.acceptSuggestion(id));
    ipcMain.handle('intelligence:getCommandRankings', () => this.getCommandRankings());
    ipcMain.handle('intelligence:getPrefill', (_, parameterId) => this.getPrefill(parameterId));
    ipcMain.handle('intelligence:getStats', () => this.getStats());
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): WorkflowIntelligenceConfig {
    return intelligenceStore.get('config');
  }

  async updateConfig(updates: Partial<WorkflowIntelligenceConfig>): Promise<WorkflowIntelligenceConfig> {
    const config = intelligenceStore.get('config');
    const updated = { ...config, ...updates };
    intelligenceStore.set('config', updated);
    return updated;
  }

  isEnabled(): boolean {
    return intelligenceStore.get('config').enabled;
  }

  // -------------------------------------------------------------------------
  // LEARNING (ONLY WHEN ENABLED)
  // -------------------------------------------------------------------------

  recordCommandUse(commandId: string, context?: Record<string, unknown>): void {
    if (!this.isEnabled()) return;

    const rankings = intelligenceStore.get('commandRankings');
    let ranking = rankings.find(r => r.commandId === commandId);

    if (!ranking) {
      ranking = { commandId, score: 0, lastUsed: 0, useCount: 0, contextScore: 0 };
      rankings.push(ranking);
    }

    ranking.useCount++;
    ranking.lastUsed = Date.now();
    ranking.score = this.calculateCommandScore(ranking);

    // Update context score based on time of day, etc.
    if (context) {
      ranking.contextScore = this.calculateContextScore(context);
    }

    // Sort by score
    rankings.sort((a, b) => b.score - a.score);

    // Keep top 100
    intelligenceStore.set('commandRankings', rankings.slice(0, 100));
  }

  recordParameterUse(parameterId: string, value: unknown): void {
    if (!this.isEnabled()) return;

    const history = intelligenceStore.get('parameterHistory');
    let param = history.find(p => p.parameterId === parameterId);

    if (!param) {
      param = { parameterId, values: [] };
      history.push(param);
    }

    // Find or add value
    const existing = param.values.find(v => JSON.stringify(v.value) === JSON.stringify(value));
    if (existing) {
      existing.frequency++;
      existing.lastUsed = Date.now();
    } else {
      param.values.push({ value, frequency: 1, lastUsed: Date.now() });
    }

    // Sort by frequency and keep top 10
    param.values.sort((a, b) => b.frequency - a.frequency);
    param.values = param.values.slice(0, 10);

    intelligenceStore.set('parameterHistory', history);
  }

  private calculateCommandScore(ranking: CommandRanking): number {
    const recencyWeight = 0.3;
    const frequencyWeight = 0.5;
    const contextWeight = 0.2;

    // Recency score (decays over 7 days)
    const daysSinceUse = (Date.now() - ranking.lastUsed) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - (daysSinceUse / 7));

    // Frequency score (logarithmic)
    const frequencyScore = Math.min(1, Math.log10(ranking.useCount + 1) / 2);

    return (
      recencyScore * recencyWeight +
      frequencyScore * frequencyWeight +
      ranking.contextScore * contextWeight
    );
  }

  private calculateContextScore(context: Record<string, unknown>): number {
    // Simple context scoring based on time of day
    const hour = new Date().getHours();
    const isWorkHours = hour >= 9 && hour <= 17;
    return isWorkHours ? 0.8 : 0.5;
  }

  // -------------------------------------------------------------------------
  // SUGGESTIONS (ADVISORY ONLY)
  // -------------------------------------------------------------------------

  async generateSuggestions(): Promise<WorkflowSuggestion[]> {
    if (!this.isEnabled()) return [];

    const config = intelligenceStore.get('config');
    const suggestions: WorkflowSuggestion[] = [];

    // Shortcut suggestions
    if (config.suggestShortcuts) {
      const shortcutSuggestions = await this.generateShortcutSuggestions();
      suggestions.push(...shortcutSuggestions);
    }

    // Filter by confidence
    const filtered = suggestions.filter(s => s.confidence >= config.minConfidence);

    // Limit count
    const limited = filtered.slice(0, config.maxSuggestions);

    // Store and return
    intelligenceStore.set('suggestions', limited);
    
    // Update stats
    const stats = intelligenceStore.get('stats');
    stats.suggestionsShown += limited.length;
    intelligenceStore.set('stats', stats);

    return limited;
  }

  private async generateShortcutSuggestions(): Promise<WorkflowSuggestion[]> {
    const rankings = intelligenceStore.get('commandRankings');
    const suggestions: WorkflowSuggestion[] = [];

    // Suggest shortcuts for frequently used commands
    const topCommands = rankings.filter(r => r.useCount >= 5).slice(0, 3);

    for (const cmd of topCommands) {
      suggestions.push({
        id: `shortcut_${cmd.commandId}_${Date.now()}`,
        type: 'workflow-shortcut',
        title: `Quick access: ${cmd.commandId}`,
        description: `You've used this ${cmd.useCount} times. Add to quick buttons?`,
        confidence: Math.min(0.9, 0.5 + (cmd.useCount / 20)),
        actionId: 'add-quick-button',
        parameters: { commandId: cmd.commandId },
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        dismissed: false,
        accepted: false,
      });
    }

    return suggestions;
  }

  getSuggestions(): WorkflowSuggestion[] {
    if (!this.isEnabled()) return [];
    return intelligenceStore.get('suggestions').filter(s => !s.dismissed && !s.accepted);
  }

  async dismissSuggestion(suggestionId: string): Promise<boolean> {
    const suggestions = intelligenceStore.get('suggestions');
    const suggestion = suggestions.find(s => s.id === suggestionId);
    
    if (!suggestion) return false;

    suggestion.dismissed = true;
    intelligenceStore.set('suggestions', suggestions);

    // Update stats
    const stats = intelligenceStore.get('stats');
    stats.suggestionsDismissed++;
    intelligenceStore.set('stats', stats);

    return true;
  }

  async acceptSuggestion(suggestionId: string): Promise<WorkflowSuggestion | null> {
    const suggestions = intelligenceStore.get('suggestions');
    const suggestion = suggestions.find(s => s.id === suggestionId);
    
    if (!suggestion) return null;

    suggestion.accepted = true;
    intelligenceStore.set('suggestions', suggestions);

    // Update stats
    const stats = intelligenceStore.get('stats');
    stats.suggestionsAccepted++;
    intelligenceStore.set('stats', stats);

    return suggestion;
  }

  // -------------------------------------------------------------------------
  // COMMAND RANKING
  // -------------------------------------------------------------------------

  getCommandRankings(limit: number = 20): CommandRanking[] {
    if (!this.isEnabled()) return [];
    return intelligenceStore.get('commandRankings').slice(0, limit);
  }

  rankSearchResults<T extends { id: string }>(results: T[]): T[] {
    if (!this.isEnabled()) return results;

    const config = intelligenceStore.get('config');
    if (!config.rankCommands) return results;

    const rankings = intelligenceStore.get('commandRankings');
    const rankingMap = new Map(rankings.map(r => [r.commandId, r.score]));

    return [...results].sort((a, b) => {
      const scoreA = rankingMap.get(a.id) || 0;
      const scoreB = rankingMap.get(b.id) || 0;
      return scoreB - scoreA;
    });
  }

  // -------------------------------------------------------------------------
  // PARAMETER PREFILL
  // -------------------------------------------------------------------------

  getPrefill(parameterId: string): unknown | null {
    if (!this.isEnabled()) return null;

    const config = intelligenceStore.get('config');
    if (!config.prefillParameters) return null;

    const history = intelligenceStore.get('parameterHistory');
    const param = history.find(p => p.parameterId === parameterId);

    if (!param || param.values.length === 0) return null;

    // Return most frequent value
    return param.values[0].value;
  }

  getPrefillOptions(parameterId: string): unknown[] {
    if (!this.isEnabled()) return [];

    const history = intelligenceStore.get('parameterHistory');
    const param = history.find(p => p.parameterId === parameterId);

    if (!param) return [];

    return param.values.map(v => v.value);
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): { suggestionsShown: number; suggestionsAccepted: number; suggestionsDismissed: number; acceptRate: number } {
    const stats = intelligenceStore.get('stats');
    const acceptRate = stats.suggestionsShown > 0
      ? stats.suggestionsAccepted / stats.suggestionsShown
      : 0;

    return { ...stats, acceptRate };
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private cleanupExpiredSuggestions(): void {
    const suggestions = intelligenceStore.get('suggestions');
    const now = Date.now();
    intelligenceStore.set('suggestions', suggestions.filter(s => s.expiresAt > now));
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const workflowIntelligence = WorkflowIntelligence.getInstance();
export default workflowIntelligence;
