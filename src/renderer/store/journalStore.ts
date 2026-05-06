/**
 * DEX Journal Store - Zustand state for the System Journal UI
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEntry {
  id: number;
  app: string;
  action: string;
  detail: string | null;
  timestamp: number;
  session_id: string;
  cleared: number;
}

export interface JournalSession {
  id: string;
  started_at: number;
  ended_at: number | null;
  entry_count: number;
}

export interface JournalStats {
  totalEntries: number;
  totalSessions: number;
  totalApps: number;
  todayEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  topApps: { app: string; count: number }[];
}

export interface JournalInsight {
  type: 'unfinished' | 'most_used' | 'session_summary' | 'pattern' | 'suggestion';
  title: string;
  description: string;
  data?: any;
}

export interface WeeklyReport {
  periodStart: number;
  periodEnd: number;
  generatedAt: number;
  totalEntries: number;
  uniqueApps: number;
  uniqueSessions: number;
  topApps: { app: string; count: number; percentage: number }[];
  topActions: { action: string; count: number }[];
  dailyBreakdown: { date: string; count: number; apps: string[] }[];
  summary: string;
  averageEntriesPerDay: number;
  peakDay: { date: string; count: number } | null;
  quietDay: { date: string; count: number } | null;
}

export interface CrossAppPattern {
  id: string;
  apps: string[];
  actions: string[];
  frequency: number;
  lastSeen: number;
  description: string;
  averageGapMs: number;
}

export interface UsageAnomaly {
  id: string;
  type: 'spike' | 'drop' | 'new_app' | 'missing_app' | 'unusual_time';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  data: any;
}

export interface AppGroup {
  app: string;
  count: number;
  last_used: number;
}

export interface DateGroup {
  date_str: string;
  count: number;
  first_ts: number;
  last_ts: number;
}

export type JournalViewMode = 'timeline' | 'by-app' | 'by-session';

// ---------------------------------------------------------------------------
// IPC Bridge
// ---------------------------------------------------------------------------

const dex = (window as any).dex;

async function ipcInvoke(channel: string, ...args: any[]): Promise<any> {
  try {
    if (dex?.electron?.invoke) {
      return await dex.electron.invoke(channel, ...args);
    }
    return null;
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[journalStore] IPC ${channel} failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store Definition
// ---------------------------------------------------------------------------

interface JournalStoreState {
  // View state
  mode: JournalViewMode;
  searchQuery: string;
  selectedApp: string | null;
  selectedSession: string | null;

  // Data
  entries: JournalEntry[];
  sessions: JournalSession[];
  apps: string[];
  appGroups: AppGroup[];
  dateGroups: DateGroup[];
  stats: JournalStats | null;
  currentSessionId: string | null;

  // Insights
  insights: JournalInsight[];
  weeklyReport: WeeklyReport | null;
  patterns: CrossAppPattern[];
  anomalies: UsageAnomaly[];

  // Pagination
  page: number;
  pageSize: number;
  hasMore: boolean;

  // Loading states
  loading: boolean;
  insightsLoading: boolean;
  analysisLoading: boolean;

  // Manage history
  clearInProgress: boolean;
  exportInProgress: boolean;

  // Actions
  setMode: (mode: JournalViewMode) => void;
  setSearchQuery: (query: string) => void;
  setSelectedApp: (app: string | null) => void;
  setSelectedSession: (sessionId: string | null) => void;
  setPage: (page: number) => void;

  // Data loading
  loadEntries: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadApps: () => Promise<void>;
  loadAppGroups: () => Promise<void>;
  loadDateGroups: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadCurrentSessionId: () => Promise<void>;
  search: (query: string) => Promise<void>;

  // Insights
  loadInsights: () => Promise<void>;
  loadWeeklyReport: () => Promise<void>;
  loadPatterns: () => Promise<void>;
  loadAnomalies: () => Promise<void>;

  // Manage history
  clearByDateRange: (startTs: number, endTs: number) => Promise<{ ok: boolean; affected: number }>;
  clearByApp: (app: string) => Promise<{ ok: boolean; affected: number }>;
  clearAll: () => Promise<{ ok: boolean; affected: number }>;
  hardPurge: () => Promise<{ ok: boolean; purged: number }>;
  exportJournal: (format: 'txt' | 'md' | 'json') => Promise<string | null>;

  // Analysis
  runAnalysis: (type: string) => Promise<void>;

  // Journal write (for apps to use)
  writeEntry: (app: string, action: string, detail?: string) => Promise<void>;

  // Full refresh
  refresh: () => Promise<void>;
}

export const useJournalStore = create<JournalStoreState>((set, get) => ({
  // Initial state
  mode: 'timeline',
  searchQuery: '',
  selectedApp: null,
  selectedSession: null,
  entries: [],
  sessions: [],
  apps: [],
  appGroups: [],
  dateGroups: [],
  stats: null,
  currentSessionId: null,
  insights: [],
  weeklyReport: null,
  patterns: [],
  anomalies: [],
  page: 0,
  pageSize: 100,
  hasMore: true,
  loading: false,
  insightsLoading: false,
  analysisLoading: false,
  clearInProgress: false,
  exportInProgress: false,

  // View actions
  setMode: (mode) => {
    set({ mode, entries: [], page: 0, hasMore: true });
    get().loadEntries();
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedApp: (app) => {
    set({ selectedApp: app, entries: [], page: 0, hasMore: true });
    get().loadEntries();
  },
  setSelectedSession: (sessionId) => {
    set({ selectedSession: sessionId, entries: [], page: 0, hasMore: true });
    get().loadEntries();
  },
  setPage: (page) => set({ page }),

  // Load entries based on current mode and filters
  loadEntries: async () => {
    const state = get();
    set({ loading: true });

    const limit = state.pageSize;
    const offset = state.page * state.pageSize;

    let result: JournalEntry[] | null = null;

    if (state.searchQuery) {
      result = await ipcInvoke('journal:search', state.searchQuery, limit, offset);
    } else if (state.mode === 'by-app' && state.selectedApp) {
      result = await ipcInvoke('journal:query-by-app', state.selectedApp, limit, offset);
    } else if (state.mode === 'by-session' && state.selectedSession) {
      result = await ipcInvoke('journal:query-by-session', state.selectedSession, limit, offset);
    } else {
      result = await ipcInvoke('journal:query', { limit, offset });
    }

    const entries = result || [];
    set({
      entries,
      hasMore: entries.length >= limit,
      loading: false,
    });
  },

  // Load more (append) - with atomic flag to prevent race condition
  loadMore: async () => {
    const state = get();
    // Use a simple check - only allow one loadMore at a time
    if (state.loading || !state.hasMore) return;

    const nextPage = state.page + 1;
    set({ loading: true, page: nextPage });

    const limit = state.pageSize;
    const offset = nextPage * state.pageSize;

    let result: JournalEntry[] | null = null;

    if (state.searchQuery) {
      result = await ipcInvoke('journal:search', state.searchQuery, limit, offset);
    } else if (state.mode === 'by-app' && state.selectedApp) {
      result = await ipcInvoke('journal:query-by-app', state.selectedApp, limit, offset);
    } else if (state.mode === 'by-session' && state.selectedSession) {
      result = await ipcInvoke('journal:query-by-session', state.selectedSession, limit, offset);
    } else {
      result = await ipcInvoke('journal:query', { limit, offset });
    }

    const newEntries = result || [];
    set({
      entries: [...state.entries, ...newEntries],
      hasMore: newEntries.length >= limit,
      loading: false,
    });
  },

  loadSessions: async () => {
    const result = await ipcInvoke('journal:get-sessions', 50, 0);
    set({ sessions: result || [] });
  },

  loadApps: async () => {
    const result = await ipcInvoke('journal:get-apps');
    set({ apps: result || [] });
  },

  loadAppGroups: async () => {
    const result = await ipcInvoke('journal:get-app-groups');
    set({ appGroups: result || [] });
  },

  loadDateGroups: async () => {
    const result = await ipcInvoke('journal:get-date-groups', 30);
    set({ dateGroups: result || [] });
  },

  loadStats: async () => {
    const result = await ipcInvoke('journal:get-stats');
    set({ stats: result || null });
  },

  loadCurrentSessionId: async () => {
    const result = await ipcInvoke('journal:get-session-id');
    set({ currentSessionId: result || null });
  },

  search: async (query) => {
    set({ searchQuery: query, page: 0, hasMore: true, loading: true });
    const result = await ipcInvoke('journal:search', query, get().pageSize, 0);
    set({ entries: result || [], hasMore: (result || []).length >= get().pageSize, loading: false });
  },

  // Insights
  loadInsights: async () => {
    set({ insightsLoading: true });
    const result = await ipcInvoke('journal:get-insights');
    set({ insights: result || [], insightsLoading: false });
  },

  loadWeeklyReport: async () => {
    set({ analysisLoading: true });
    const result = await ipcInvoke('journal:get-weekly-report');
    set({ weeklyReport: result || null, analysisLoading: false });
  },

  loadPatterns: async () => {
    const result = await ipcInvoke('journal:get-patterns');
    set({ patterns: result || [] });
  },

  loadAnomalies: async () => {
    const result = await ipcInvoke('journal:get-anomalies');
    set({ anomalies: result || [] });
  },

  // Manage history
  clearByDateRange: async (startTs, endTs) => {
    set({ clearInProgress: true });
    const result = await ipcInvoke('journal:clear-by-date-range', startTs, endTs);
    set({ clearInProgress: false });
    if (result?.ok) get().refresh();
    return result || { ok: false, affected: 0 };
  },

  clearByApp: async (app) => {
    set({ clearInProgress: true });
    const result = await ipcInvoke('journal:clear-by-app', app);
    set({ clearInProgress: false });
    if (result?.ok) get().refresh();
    return result || { ok: false, affected: 0 };
  },

  clearAll: async () => {
    set({ clearInProgress: true });
    const result = await ipcInvoke('journal:clear-all');
    set({ clearInProgress: false });
    if (result?.ok) get().refresh();
    return result || { ok: false, affected: 0 };
  },

  hardPurge: async () => {
    const result = await ipcInvoke('journal:hard-purge', 7);
    return result || { ok: false, purged: 0 };
  },

  exportJournal: async (format) => {
    set({ exportInProgress: true });
    const result = await ipcInvoke('journal:export', format);
    set({ exportInProgress: false });
    return result || null;
  },

  // Analysis
  runAnalysis: async (type) => {
    set({ analysisLoading: true });
    await ipcInvoke('journal:run-analysis', type);
    // Wait a bit for worker to finish, then reload
    setTimeout(async () => {
      await get().loadWeeklyReport();
      await get().loadPatterns();
      await get().loadAnomalies();
      set({ analysisLoading: false });
    }, 3000);
  },

  // Write entry
  writeEntry: async (app, action, detail) => {
    await ipcInvoke('journal:write', app, action, detail);
  },

  // Full refresh
  refresh: async () => {
    const state = get();
    set({ page: 0, hasMore: true });
    await Promise.all([
      state.loadEntries(),
      state.loadStats(),
      state.loadApps(),
      state.loadAppGroups(),
      state.loadDateGroups(),
      state.loadSessions(),
      state.loadInsights(),
    ]);
  },
}));
