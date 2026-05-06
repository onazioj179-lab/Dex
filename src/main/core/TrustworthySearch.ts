// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 3: Trustworthy Search (DETERMINISTIC)
// ===========================================================================
// Search must EXPLAIN why a result appears.
// Rank deterministically. Respect intent and sessions.
// If search cannot explain itself, it fails.
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

export interface SearchQuery {
  id: string;
  text: string;
  timestamp: number;
  filters: SearchFilters;
  context?: SearchContext;
}

export interface SearchFilters {
  types?: string[];           // File types to include
  dateRange?: {
    start?: number;
    end?: number;
  };
  locations?: string[];       // Paths to search in
  intents?: string[];         // Intent IDs to scope to
  permissions?: string[];     // Required permissions
  excludePatterns?: string[]; // Patterns to exclude
}

export interface SearchContext {
  activeIntentId?: string;
  currentFile?: string;
  recentFiles?: string[];
  userPreferences?: {
    preferredTypes?: string[];
    priorityLocations?: string[];
  };
}

export interface SearchResultExplanation {
  primaryReason: string;
  factors: Array<{
    name: string;
    contribution: number;  // -100 to 100
    description: string;
  }>;
  formula: string;         // Human-readable scoring formula
}

export interface SearchResult {
  id: string;
  type: 'file' | 'note' | 'intent' | 'automation' | 'action' | 'setting';
  path?: string;
  title: string;
  description?: string;
  preview?: string;
  
  // Scoring
  score: number;
  explanation: SearchResultExplanation;
  
  // Metadata
  matchedTerms: string[];
  matchLocations: Array<{ start: number; end: number }>;
  lastModified?: number;
  permissions?: string[];
}

export interface SearchHistoryEntry {
  id: string;
  query: SearchQuery;
  resultCount: number;
  selectedResultId?: string;
  timestamp: number;
}

export interface SearchSession {
  id: string;
  queries: SearchQuery[];
  startTime: number;
  endTime?: number;
}

// ===========================================================================
// TRUSTWORTHY SEARCH ENGINE
// ===========================================================================

class TrustworthySearchClass extends EventEmitter {
  private searchHistory: SearchHistoryEntry[] = [];
  private searchSessions: Map<string, SearchSession> = new Map();
  private currentSessionId: string | null = null;
  private dataPath: string;
  private isInitialized: boolean = false;

  // Deterministic scoring weights (transparent to user)
  private readonly SCORING_WEIGHTS = {
    exactMatch: 100,
    titleMatch: 80,
    contentMatch: 50,
    pathMatch: 30,
    recency: 20,
    frequency: 15,
    contextRelevance: 25,
    intentMatch: 40,
  };

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'search');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectory();
    await this.loadHistory();
    this.registerIPCHandlers();
    this.startNewSession();

    this.isInitialized = true;
    log.info('[TrustworthySearch] Trustworthy search engine initialized');
  }

  shutdown(): void {
    this.endCurrentSession();
    this.saveHistory();
    this.removeAllListeners();
    log.info('[TrustworthySearch] Trustworthy search engine shut down');
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadHistory(): Promise<void> {
    try {
      const historyPath = path.join(this.dataPath, 'search-history.json');
      if (fs.existsSync(historyPath)) {
        const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        this.searchHistory = data.history || [];
        // Keep only last 1000 entries
        if (this.searchHistory.length > 1000) {
          this.searchHistory = this.searchHistory.slice(-1000);
        }
      }
    } catch (error) {
      log.error('[TrustworthySearch] Failed to load history:', error);
    }
  }

  private saveHistory(): void {
    try {
      const historyPath = path.join(this.dataPath, 'search-history.json');
      fs.writeFileSync(historyPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        history: this.searchHistory.slice(-1000),
      }, null, 2));
    } catch (error) {
      log.error('[TrustworthySearch] Failed to save history:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SEARCH EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Execute search with full explanation
   */
  async search(
    queryText: string,
    filters: SearchFilters = {},
    context?: SearchContext
  ): Promise<{
    results: SearchResult[];
    query: SearchQuery;
    totalTime: number;
    explanationSummary: string;
  }> {
    const startTime = Date.now();

    const query: SearchQuery = {
      id: crypto.randomUUID(),
      text: queryText.trim(),
      timestamp: Date.now(),
      filters,
      context,
    };

    // Collect all searchable items
    const candidates = await this.collectCandidates(filters, context);

    // Score and rank with explanations
    const scoredResults = this.scoreAndRank(candidates, query);

    // Record in history
    this.recordSearch(query, scoredResults.length);

    const totalTime = Date.now() - startTime;

    // Generate summary explanation
    const explanationSummary = this.generateSearchSummary(query, scoredResults, totalTime);

    return {
      results: scoredResults,
      query,
      totalTime,
      explanationSummary,
    };
  }

  /**
   * Collect searchable candidates based on filters
   */
  private async collectCandidates(
    filters: SearchFilters,
    context?: SearchContext
  ): Promise<Array<{
    type: SearchResult['type'];
    path?: string;
    title: string;
    content?: string;
    lastModified?: number;
    permissions?: string[];
    metadata?: Record<string, any>;
  }>> {
    const candidates: any[] = [];

    // This would integrate with actual data sources
    // For now, return structure for demonstration

    // Files from file system tracking
    // Notes from intent sessions
    // Automations from workflow system
    // etc.

    return candidates;
  }

  /**
   * Score and rank results with full explanations
   */
  private scoreAndRank(
    candidates: any[],
    query: SearchQuery
  ): SearchResult[] {
    const results: SearchResult[] = [];
    const queryTerms = this.tokenize(query.text);

    for (const candidate of candidates) {
      const factors: SearchResultExplanation['factors'] = [];
      let totalScore = 0;

      // Exact match scoring
      const exactMatchScore = this.scoreExactMatch(candidate, query.text);
      if (exactMatchScore > 0) {
        factors.push({
          name: 'Exact Match',
          contribution: exactMatchScore,
          description: `Exact match found in ${candidate.title ? 'title' : 'content'}`,
        });
        totalScore += exactMatchScore;
      }

      // Title match scoring
      const titleScore = this.scoreTitleMatch(candidate.title, queryTerms);
      if (titleScore > 0) {
        factors.push({
          name: 'Title Match',
          contribution: titleScore,
          description: `${queryTerms.filter(t => candidate.title?.toLowerCase().includes(t)).length} of ${queryTerms.length} terms found in title`,
        });
        totalScore += titleScore;
      }

      // Content match scoring
      const contentScore = this.scoreContentMatch(candidate.content, queryTerms);
      if (contentScore > 0) {
        factors.push({
          name: 'Content Match',
          contribution: contentScore,
          description: `Found in content body`,
        });
        totalScore += contentScore;
      }

      // Path match scoring
      const pathScore = this.scorePathMatch(candidate.path, queryTerms);
      if (pathScore > 0) {
        factors.push({
          name: 'Path Match',
          contribution: pathScore,
          description: `File path contains search terms`,
        });
        totalScore += pathScore;
      }

      // Recency scoring
      if (candidate.lastModified) {
        const recencyScore = this.scoreRecency(candidate.lastModified);
        factors.push({
          name: 'Recency',
          contribution: recencyScore,
          description: this.formatRecencyDescription(candidate.lastModified),
        });
        totalScore += recencyScore;
      }

      // Context relevance
      if (query.context) {
        const contextScore = this.scoreContextRelevance(candidate, query.context);
        if (contextScore > 0) {
          factors.push({
            name: 'Context Relevance',
            contribution: contextScore,
            description: 'Matches current work context',
          });
          totalScore += contextScore;
        }
      }

      // Intent match
      if (query.context?.activeIntentId && candidate.metadata?.intentId === query.context.activeIntentId) {
        const intentScore = this.SCORING_WEIGHTS.intentMatch;
        factors.push({
          name: 'Intent Match',
          contribution: intentScore,
          description: 'Part of current intent session',
        });
        totalScore += intentScore;
      }

      // Only include if score > 0
      if (totalScore > 0) {
        const explanation: SearchResultExplanation = {
          primaryReason: factors.length > 0 ? factors[0].description : 'Matched search criteria',
          factors: factors.sort((a, b) => b.contribution - a.contribution),
          formula: this.generateScoringFormula(factors),
        };

        results.push({
          id: crypto.randomUUID(),
          type: candidate.type,
          path: candidate.path,
          title: candidate.title,
          description: candidate.description,
          preview: this.generatePreview(candidate.content, queryTerms),
          score: totalScore,
          explanation,
          matchedTerms: queryTerms.filter(t => 
            candidate.title?.toLowerCase().includes(t) ||
            candidate.content?.toLowerCase().includes(t)
          ),
          matchLocations: this.findMatchLocations(candidate, queryTerms),
          lastModified: candidate.lastModified,
          permissions: candidate.permissions,
        });
      }
    }

    // Sort by score (deterministic)
    return results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker: alphabetical by title
      return a.title.localeCompare(b.title);
    });
  }

  // -------------------------------------------------------------------------
  // SCORING FUNCTIONS (ALL DETERMINISTIC & TRANSPARENT)
  // -------------------------------------------------------------------------

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1)
      .map(t => t.replace(/[^\w]/g, ''));
  }

  private scoreExactMatch(candidate: any, query: string): number {
    const queryLower = query.toLowerCase();
    if (candidate.title?.toLowerCase() === queryLower) {
      return this.SCORING_WEIGHTS.exactMatch;
    }
    if (candidate.path && path.basename(candidate.path).toLowerCase() === queryLower) {
      return this.SCORING_WEIGHTS.exactMatch * 0.8;
    }
    return 0;
  }

  private scoreTitleMatch(title: string | undefined, terms: string[]): number {
    if (!title) return 0;
    const titleLower = title.toLowerCase();
    const matchCount = terms.filter(t => titleLower.includes(t)).length;
    return Math.round((matchCount / terms.length) * this.SCORING_WEIGHTS.titleMatch);
  }

  private scoreContentMatch(content: string | undefined, terms: string[]): number {
    if (!content) return 0;
    const contentLower = content.toLowerCase();
    const matchCount = terms.filter(t => contentLower.includes(t)).length;
    return Math.round((matchCount / terms.length) * this.SCORING_WEIGHTS.contentMatch);
  }

  private scorePathMatch(filePath: string | undefined, terms: string[]): number {
    if (!filePath) return 0;
    const pathLower = filePath.toLowerCase();
    const matchCount = terms.filter(t => pathLower.includes(t)).length;
    return Math.round((matchCount / terms.length) * this.SCORING_WEIGHTS.pathMatch);
  }

  private scoreRecency(lastModified: number): number {
    const daysSince = (Date.now() - lastModified) / (24 * 60 * 60 * 1000);
    if (daysSince < 1) return this.SCORING_WEIGHTS.recency;
    if (daysSince < 7) return Math.round(this.SCORING_WEIGHTS.recency * 0.8);
    if (daysSince < 30) return Math.round(this.SCORING_WEIGHTS.recency * 0.5);
    if (daysSince < 90) return Math.round(this.SCORING_WEIGHTS.recency * 0.2);
    return 0;
  }

  private formatRecencyDescription(lastModified: number): string {
    const daysSince = Math.floor((Date.now() - lastModified) / (24 * 60 * 60 * 1000));
    if (daysSince === 0) return 'Modified today';
    if (daysSince === 1) return 'Modified yesterday';
    if (daysSince < 7) return `Modified ${daysSince} days ago`;
    if (daysSince < 30) return `Modified ${Math.floor(daysSince / 7)} weeks ago`;
    return `Modified ${Math.floor(daysSince / 30)} months ago`;
  }

  private scoreContextRelevance(candidate: any, context: SearchContext): number {
    let score = 0;

    // Recently accessed files get bonus
    if (context.recentFiles?.includes(candidate.path)) {
      score += this.SCORING_WEIGHTS.contextRelevance * 0.5;
    }

    // Preferred types get bonus
    if (context.userPreferences?.preferredTypes?.includes(candidate.type)) {
      score += this.SCORING_WEIGHTS.contextRelevance * 0.3;
    }

    // Priority locations get bonus
    if (candidate.path && context.userPreferences?.priorityLocations) {
      for (const loc of context.userPreferences.priorityLocations) {
        if (candidate.path.startsWith(loc)) {
          score += this.SCORING_WEIGHTS.contextRelevance * 0.4;
          break;
        }
      }
    }

    return Math.round(score);
  }

  private generateScoringFormula(factors: SearchResultExplanation['factors']): string {
    if (factors.length === 0) return 'No scoring factors';
    
    const parts = factors.map(f => `${f.name}(${f.contribution})`);
    const total = factors.reduce((sum, f) => sum + f.contribution, 0);
    return `${parts.join(' + ')} = ${total}`;
  }

  private generatePreview(content: string | undefined, terms: string[]): string | undefined {
    if (!content) return undefined;

    // Find first occurrence of any search term
    const contentLower = content.toLowerCase();
    let firstMatchIndex = -1;

    for (const term of terms) {
      const idx = contentLower.indexOf(term);
      if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
        firstMatchIndex = idx;
      }
    }

    if (firstMatchIndex === -1) {
      return content.substring(0, 150) + (content.length > 150 ? '...' : '');
    }

    // Extract context around first match
    const start = Math.max(0, firstMatchIndex - 50);
    const end = Math.min(content.length, firstMatchIndex + 100);
    let preview = content.substring(start, end);

    if (start > 0) preview = '...' + preview;
    if (end < content.length) preview = preview + '...';

    return preview;
  }

  private findMatchLocations(candidate: any, terms: string[]): Array<{ start: number; end: number }> {
    const locations: Array<{ start: number; end: number }> = [];
    const content = (candidate.content || '').toLowerCase();

    for (const term of terms) {
      let idx = 0;
      while ((idx = content.indexOf(term, idx)) !== -1) {
        locations.push({ start: idx, end: idx + term.length });
        idx++;
      }
    }

    return locations.sort((a, b) => a.start - b.start);
  }

  private generateSearchSummary(
    query: SearchQuery,
    results: SearchResult[],
    timeMs: number
  ): string {
    const parts: string[] = [];
    
    parts.push(`Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query.text}"`);
    parts.push(`in ${timeMs}ms`);

    if (query.filters.types?.length) {
      parts.push(`filtered to ${query.filters.types.join(', ')}`);
    }

    if (query.context?.activeIntentId) {
      parts.push('scoped to current intent');
    }

    if (results.length > 0) {
      const topResult = results[0];
      parts.push(`Top result: "${topResult.title}" (${topResult.explanation.primaryReason})`);
    }

    return parts.join('. ') + '.';
  }

  // -------------------------------------------------------------------------
  // SEARCH HISTORY (NAVIGABLE)
  // -------------------------------------------------------------------------

  private recordSearch(query: SearchQuery, resultCount: number): void {
    const entry: SearchHistoryEntry = {
      id: crypto.randomUUID(),
      query,
      resultCount,
      timestamp: Date.now(),
    };

    this.searchHistory.push(entry);

    // Add to current session
    if (this.currentSessionId) {
      const session = this.searchSessions.get(this.currentSessionId);
      if (session) {
        session.queries.push(query);
      }
    }

    this.emit('search-recorded', entry);
  }

  /**
   * Record which result user selected (for future relevance)
   */
  recordResultSelection(searchId: string, resultId: string): void {
    const entry = this.searchHistory.find(h => h.query.id === searchId);
    if (entry) {
      entry.selectedResultId = resultId;
      this.emit('result-selected', { searchId, resultId });
    }
  }

  /**
   * Get search history
   */
  getSearchHistory(limit: number = 50): SearchHistoryEntry[] {
    return this.searchHistory.slice(-limit).reverse();
  }

  /**
   * Search within history
   */
  searchInHistory(query: string): SearchHistoryEntry[] {
    const queryLower = query.toLowerCase();
    return this.searchHistory
      .filter(h => h.query.text.toLowerCase().includes(queryLower))
      .reverse();
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = [];
    this.saveHistory();
    this.emit('history-cleared');
  }

  // -------------------------------------------------------------------------
  // SEARCH SESSIONS
  // -------------------------------------------------------------------------

  private startNewSession(): void {
    const session: SearchSession = {
      id: crypto.randomUUID(),
      queries: [],
      startTime: Date.now(),
    };
    this.searchSessions.set(session.id, session);
    this.currentSessionId = session.id;
  }

  private endCurrentSession(): void {
    if (this.currentSessionId) {
      const session = this.searchSessions.get(this.currentSessionId);
      if (session) {
        session.endTime = Date.now();
      }
      this.currentSessionId = null;
    }
  }

  /**
   * Get current search session
   */
  getCurrentSession(): SearchSession | null {
    if (!this.currentSessionId) return null;
    return this.searchSessions.get(this.currentSessionId) || null;
  }

  // -------------------------------------------------------------------------
  // CONTEXTUAL FILTERS
  // -------------------------------------------------------------------------

  /**
   * Get available filter options based on current data
   */
  getAvailableFilters(): {
    types: string[];
    locations: string[];
    intents: string[];
    datePresets: Array<{ label: string; range: { start: number; end: number } }>;
  } {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    return {
      types: ['file', 'note', 'intent', 'automation', 'action', 'setting'],
      locations: [], // Would be populated from file system tracking
      intents: [],   // Would be populated from intent manager
      datePresets: [
        { label: 'Today', range: { start: now - day, end: now } },
        { label: 'This week', range: { start: now - 7 * day, end: now } },
        { label: 'This month', range: { start: now - 30 * day, end: now } },
        { label: 'This year', range: { start: now - 365 * day, end: now } },
      ],
    };
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('search:execute', async (_, queryText, filters, context) => 
      this.search(queryText, filters, context));

    ipcMain.handle('search:recordSelection', (_, searchId, resultId) => {
      this.recordResultSelection(searchId, resultId);
      return { success: true };
    });

    ipcMain.handle('search:getHistory', (_, limit) => 
      this.getSearchHistory(limit));

    ipcMain.handle('search:searchHistory', (_, query) => 
      this.searchInHistory(query));

    ipcMain.handle('search:clearHistory', () => {
      this.clearHistory();
      return { success: true };
    });

    ipcMain.handle('search:getCurrentSession', () => 
      this.getCurrentSession());

    ipcMain.handle('search:getAvailableFilters', () => 
      this.getAvailableFilters());

    ipcMain.handle('search:getScoringWeights', () => 
      ({ ...this.SCORING_WEIGHTS }));
  }
}

// Singleton instance
export const trustworthySearch = new TrustworthySearchClass();

export async function initializeTrustworthySearch(): Promise<void> {
  return trustworthySearch.initialize();
}

export function shutdownTrustworthySearch(): void {
  trustworthySearch.shutdown();
}
