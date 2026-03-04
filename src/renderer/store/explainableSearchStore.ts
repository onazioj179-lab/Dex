// ===========================================================================
// DEX - Explainable Search Store (Zustand)
// ===========================================================================
// Client-side state management for Trustworthy Search.
// Communicates with TrustworthySearch backend via IPC.
// Search must be predictable, explainable, and trusted.
// ===========================================================================

import { create } from 'zustand';

// ===========================================================================
// TYPES (mirrored from main process)
// ===========================================================================

export interface SearchFilters {
  types?: string[];
  dateRange?: {
    start?: number;
    end?: number;
  };
  locations?: string[];
  intents?: string[];
  excludePatterns?: string[];
}

export interface SearchContext {
  activeIntentId?: string;
  currentFile?: string;
  recentFiles?: string[];
}

export interface SearchResultExplanation {
  primaryReason: string;
  factors: Array<{
    name: string;
    contribution: number;
    description: string;
  }>;
  formula: string;
}

export interface SearchResult {
  id: string;
  type: 'file' | 'note' | 'intent' | 'automation' | 'action' | 'setting';
  path?: string;
  title: string;
  description?: string;
  preview?: string;
  score: number;
  explanation: SearchResultExplanation;
  matchedTerms: string[];
  matchLocations: Array<{ start: number; end: number }>;
  lastModified?: number;
}

export interface SearchQuery {
  id: string;
  text: string;
  timestamp: number;
  filters: SearchFilters;
  context?: SearchContext;
}

export interface SearchHistoryEntry {
  id: string;
  query: SearchQuery;
  resultCount: number;
  selectedResultId?: string;
  timestamp: number;
}

export interface ScoringWeights {
  exactMatch: number;
  titleMatch: number;
  contentMatch: number;
  pathMatch: number;
  recency: number;
  frequency: number;
  contextRelevance: number;
  intentMatch: number;
}

export interface AvailableFilters {
  types: string[];
  locations: string[];
  intents: string[];
  datePresets: Array<{ label: string; range: { start: number; end: number } }>;
}

// ===========================================================================
// STORE STATE
// ===========================================================================

interface ExplainableSearchState {
  // Search State
  query: string;
  filters: SearchFilters;
  context: SearchContext;
  
  // Results
  results: SearchResult[];
  totalTime: number;
  explanationSummary: string;
  
  // Selected Result
  selectedResultId: string | null;
  showExplanation: boolean;
  
  // History
  searchHistory: SearchHistoryEntry[];
  showHistory: boolean;
  
  // Available Filters
  availableFilters: AvailableFilters | null;
  scoringWeights: ScoringWeights | null;
  
  // UI State
  isSearching: boolean;
  error: string | null;
  
  // Actions - Search
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  setContext: (context: SearchContext) => void;
  search: () => Promise<void>;
  clearSearch: () => void;
  
  // Actions - Results
  selectResult: (resultId: string) => void;
  openResult: (resultId: string) => Promise<void>;
  toggleExplanation: (resultId: string) => void;
  
  // Actions - History
  loadHistory: (limit?: number) => Promise<void>;
  searchInHistory: (query: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reopenSearch: (historyEntry: SearchHistoryEntry) => void;
  toggleHistoryPanel: () => void;
  
  // Actions - Filters
  loadAvailableFilters: () => Promise<void>;
  loadScoringWeights: () => Promise<void>;
  
  // Actions - UI
  clearError: () => void;
}

// ===========================================================================
// IPC HELPERS
// ===========================================================================

const ipc = {
  invoke: async <T>(channel: string, ...args: any[]): Promise<T> => {
    if (typeof window !== 'undefined' && window.dex?.invoke) {
      return window.dex.invoke(channel, ...args);
    }
    throw new Error('IPC not available');
  },
};

// ===========================================================================
// STORE IMPLEMENTATION
// ===========================================================================

export const useExplainableSearchStore = create<ExplainableSearchState>((set, get) => ({
  // Initial State
  query: '',
  filters: {},
  context: {},
  results: [],
  totalTime: 0,
  explanationSummary: '',
  selectedResultId: null,
  showExplanation: false,
  searchHistory: [],
  showHistory: false,
  availableFilters: null,
  scoringWeights: null,
  isSearching: false,
  error: null,

  // -------------------------------------------------------------------------
  // SEARCH ACTIONS
  // -------------------------------------------------------------------------

  setQuery: (query) => {
    set({ query });
  },

  setFilters: (filters) => {
    set({ filters });
  },

  setContext: (context) => {
    set({ context });
  },

  search: async () => {
    const state = get();
    if (!state.query.trim()) {
      set({ results: [], explanationSummary: '', totalTime: 0 });
      return;
    }

    set({ isSearching: true, error: null });

    try {
      const result = await ipc.invoke<{
        results: SearchResult[];
        query: SearchQuery;
        totalTime: number;
        explanationSummary: string;
      }>('search:execute', state.query, state.filters, state.context);

      set({
        results: result.results,
        totalTime: result.totalTime,
        explanationSummary: result.explanationSummary,
        isSearching: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Search failed',
        isSearching: false,
      });
    }
  },

  clearSearch: () => {
    set({
      query: '',
      results: [],
      explanationSummary: '',
      totalTime: 0,
      selectedResultId: null,
      showExplanation: false,
    });
  },

  // -------------------------------------------------------------------------
  // RESULT ACTIONS
  // -------------------------------------------------------------------------

  selectResult: (resultId) => {
    set({ selectedResultId: resultId });
  },

  openResult: async (resultId) => {
    const state = get();
    const result = state.results.find(r => r.id === resultId);
    if (!result) return;

    try {
      // Record the selection for history
      await ipc.invoke('search:recordSelection', state.query, resultId);

      // Open based on type
      if (result.path) {
        window.dex?.shell?.openPath?.(result.path);
      }
    } catch (error) {
      console.error('Failed to open result:', error);
    }
  },

  toggleExplanation: (resultId) => {
    const state = get();
    if (state.selectedResultId === resultId && state.showExplanation) {
      set({ showExplanation: false });
    } else {
      set({ selectedResultId: resultId, showExplanation: true });
    }
  },

  // -------------------------------------------------------------------------
  // HISTORY ACTIONS
  // -------------------------------------------------------------------------

  loadHistory: async (limit = 50) => {
    try {
      const history = await ipc.invoke<SearchHistoryEntry[]>('search:getHistory', limit);
      set({ searchHistory: history });
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  },

  searchInHistory: async (query) => {
    try {
      const history = await ipc.invoke<SearchHistoryEntry[]>('search:searchHistory', query);
      set({ searchHistory: history });
    } catch (error) {
      console.error('Failed to search history:', error);
    }
  },

  clearHistory: async () => {
    try {
      await ipc.invoke('search:clearHistory');
      set({ searchHistory: [] });
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  },

  reopenSearch: (historyEntry) => {
    set({
      query: historyEntry.query.text,
      filters: historyEntry.query.filters,
      context: historyEntry.query.context || {},
    });
    get().search();
  },

  toggleHistoryPanel: () => {
    const state = get();
    if (!state.showHistory) {
      get().loadHistory();
    }
    set({ showHistory: !state.showHistory });
  },

  // -------------------------------------------------------------------------
  // FILTER ACTIONS
  // -------------------------------------------------------------------------

  loadAvailableFilters: async () => {
    try {
      const filters = await ipc.invoke<AvailableFilters>('search:getAvailableFilters');
      set({ availableFilters: filters });
    } catch (error) {
      console.error('Failed to load available filters:', error);
    }
  },

  loadScoringWeights: async () => {
    try {
      const weights = await ipc.invoke<ScoringWeights>('search:getScoringWeights');
      set({ scoringWeights: weights });
    } catch (error) {
      console.error('Failed to load scoring weights:', error);
    }
  },

  // -------------------------------------------------------------------------
  // UI ACTIONS
  // -------------------------------------------------------------------------

  clearError: () => {
    set({ error: null });
  },
}));

// ===========================================================================
// SELECTORS
// ===========================================================================

export const selectResultById = (id: string) => (state: ExplainableSearchState) =>
  state.results.find(r => r.id === id);

export const selectResultsByType = (type: SearchResult['type']) => (state: ExplainableSearchState) =>
  state.results.filter(r => r.type === type);

export const selectTopResults = (limit: number) => (state: ExplainableSearchState) =>
  state.results.slice(0, limit);
