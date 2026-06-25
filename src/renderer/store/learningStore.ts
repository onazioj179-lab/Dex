// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Silent Learning System
// Phase 36: Invisible intelligence, local-only, resettable
// Learns patterns without interrupting flow or changing UI unexpectedly
// ===========================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { rankAppSuggestions, type AppUsageStats } from '../services/suggestionEngine';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface UsagePattern {
  /** Page navigation frequency */
  pageVisits: Record<string, number>;
  /** Time spent on each page (ms) */
  pageTime: Record<string, number>;
  /** Action execution frequency */
  actionFrequency: Record<string, number>;
  /** Search query patterns */
  searchPatterns: string[];
  /** Last active times */
  lastActive: Record<string, number>;
  /** Preferred default focus targets */
  focusPreferences: Record<string, string>;
  /** Per-app launch histogram across the 24 hours of the day (time-of-day affinity) */
  hourly: Record<string, number[]>;
  /** App -> next-app transition counts (workflow pairings / co-occurrence) */
  pairs: Record<string, Record<string, number>>;
}

interface LearningState {
  /** Whether learning is enabled */
  enabled: boolean;
  /** Collected usage patterns */
  patterns: UsagePattern;
  /** Session start time */
  sessionStart: number;
  /** Current page being tracked */
  currentPage: string | null;
  /** Page enter timestamp */
  pageEnterTime: number | null;
  /** Last app the user was on (transient, drives pairing transitions) */
  lastTrackedApp: string | null;
}

interface LearningActions {
  /** Enable/disable learning */
  setEnabled: (enabled: boolean) => void;
  /** Track page visit */
  trackPageVisit: (page: string) => void;
  /** Track leaving a page */
  trackPageLeave: () => void;
  /** Track action execution */
  trackAction: (actionId: string) => void;
  /** Track an app being opened/focused (frequency, recency, hour, pairing) */
  trackAppOpen: (appId: string) => void;
  /** Track search query */
  trackSearch: (query: string) => void;
  /** Get ranked pages by usage */
  getRankedPages: () => string[];
  /** Get ranked actions by frequency */
  getRankedActions: () => string[];
  /** Get learned app suggestions for the launcher (frequency + recency + hour + pairing) */
  getAppSuggestions: (currentAppId: string | null, limit?: number) => string[];
  /** Get search suggestions */
  getSearchSuggestions: (partial: string) => string[];
  /** Reset all learning data */
  reset: () => void;
}

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

const initialPatterns: UsagePattern = {
  pageVisits: {},
  pageTime: {},
  actionFrequency: {},
  searchPatterns: [],
  lastActive: {},
  focusPreferences: {},
  hourly: {},
  pairs: {},
};

const initialState: LearningState = {
  enabled: true,
  patterns: initialPatterns,
  sessionStart: Date.now(),
  currentPage: null,
  pageEnterTime: null,
  lastTrackedApp: null,
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useLearningStore = create<LearningState & LearningActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setEnabled: (enabled) => set({ enabled }),

      trackPageVisit: (page) => {
        const state = get();
        if (!state.enabled) return;

        // Track leaving previous page
        if (state.currentPage && state.pageEnterTime) {
          const timeSpent = Date.now() - state.pageEnterTime;
          set((s) => ({
            patterns: {
              ...s.patterns,
              pageTime: {
                ...s.patterns.pageTime,
                [s.currentPage!]: (s.patterns.pageTime[s.currentPage!] || 0) + timeSpent,
              },
            },
          }));
        }

        // Track new page visit
        set((s) => ({
          currentPage: page,
          pageEnterTime: Date.now(),
          patterns: {
            ...s.patterns,
            pageVisits: {
              ...s.patterns.pageVisits,
              [page]: (s.patterns.pageVisits[page] || 0) + 1,
            },
            lastActive: {
              ...s.patterns.lastActive,
              [page]: Date.now(),
            },
          },
        }));
      },

      trackPageLeave: () => {
        const state = get();
        if (!state.enabled || !state.currentPage || !state.pageEnterTime) return;

        // Capture currentPage before setting to null to avoid stale closure
        const page = state.currentPage;
        const timeSpent = Date.now() - state.pageEnterTime;
        set((s) => ({
          currentPage: null,
          pageEnterTime: null,
          patterns: {
            ...s.patterns,
            pageTime: {
              ...s.patterns.pageTime,
              [page]: (s.patterns.pageTime[page] || 0) + timeSpent,
            },
          },
        }));
      },

      trackAction: (actionId) => {
        const state = get();
        if (!state.enabled) return;

        set((s) => ({
          patterns: {
            ...s.patterns,
            actionFrequency: {
              ...s.patterns.actionFrequency,
              [actionId]: (s.patterns.actionFrequency[actionId] || 0) + 1,
            },
          },
        }));
      },

      trackAppOpen: (appId) => {
        const state = get();
        if (!state.enabled || !appId || appId === 'home') return;

        const now = Date.now();
        const hour = new Date(now).getHours();
        const prev = state.lastTrackedApp;

        set((s) => {
          // Time-of-day histogram: clone the app's 24-slot array, bump the hour.
          const prevHourly = s.patterns.hourly[appId] ?? new Array(24).fill(0);
          const hourly = prevHourly.slice();
          hourly[hour] = (hourly[hour] || 0) + 1;

          // Pairing transition: previous app -> this app (skip self + 'home').
          let pairs = s.patterns.pairs;
          if (prev && prev !== appId && prev !== 'home') {
            const from = { ...(pairs[prev] ?? {}) };
            from[appId] = (from[appId] || 0) + 1;
            pairs = { ...pairs, [prev]: from };
          }

          return {
            lastTrackedApp: appId,
            patterns: {
              ...s.patterns,
              pageVisits: {
                ...s.patterns.pageVisits,
                [appId]: (s.patterns.pageVisits[appId] || 0) + 1,
              },
              lastActive: { ...s.patterns.lastActive, [appId]: now },
              hourly: { ...s.patterns.hourly, [appId]: hourly },
              pairs,
            },
          };
        });
      },

      trackSearch: (query) => {
        const state = get();
        if (!state.enabled || !query.trim()) return;

        const normalized = query.toLowerCase().trim();
        set((s) => {
          // Keep only last 50 unique searches
          const patterns = [...s.patterns.searchPatterns];
          const existing = patterns.indexOf(normalized);
          if (existing !== -1) {
            patterns.splice(existing, 1);
          }
          patterns.unshift(normalized);
          if (patterns.length > 50) {
            patterns.pop();
          }
          return {
            patterns: {
              ...s.patterns,
              searchPatterns: patterns,
            },
          };
        });
      },

      getRankedPages: () => {
        const { patterns } = get();
        return Object.entries(patterns.pageVisits)
          .sort(([, a], [, b]) => b - a)
          .map(([page]) => page);
      },

      getRankedActions: () => {
        const { patterns } = get();
        return Object.entries(patterns.actionFrequency)
          .sort(([, a], [, b]) => b - a)
          .map(([action]) => action);
      },

      getAppSuggestions: (currentAppId, limit = 5) => {
        const { patterns } = get();
        const stats: AppUsageStats = {
          visits: patterns.pageVisits,
          lastActive: patterns.lastActive,
          hourly: patterns.hourly,
          pairs: patterns.pairs,
        };
        return rankAppSuggestions(stats, currentAppId ?? null)
          .slice(0, limit)
          .map((r) => r.appId);
      },

      getSearchSuggestions: (partial) => {
        const { patterns } = get();
        if (!partial.trim()) return patterns.searchPatterns.slice(0, 5);
        
        const normalized = partial.toLowerCase().trim();
        return patterns.searchPatterns
          .filter((s) => s.includes(normalized))
          .slice(0, 5);
      },

      reset: () => set({ patterns: initialPatterns, lastTrackedApp: null }),
    }),
    {
      name: 'dex-learning',
      storage: debouncedJsonStorage,
      version: 2,
      // v1 -> v2 added `hourly` and `pairs`. Backfill them so older persisted
      // data hydrates cleanly instead of leaving the new fields undefined.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<LearningState>;
        if (version < 2 && state.patterns) {
          state.patterns = {
            ...initialPatterns,
            ...state.patterns,
            hourly: state.patterns.hourly ?? {},
            pairs: state.patterns.pairs ?? {},
          };
        }
        return state as LearningState & LearningActions;
      },
      partialize: (state) => ({
        enabled: state.enabled,
        patterns: state.patterns,
      }),
    }
  )
);

// -----------------------------------------------------------------------------
// Hooks for silent integration
// -----------------------------------------------------------------------------

/** Hook to track page visits - call on navigation */
export const usePageTracking = (page: string) => {
  const trackPageVisit = useLearningStore((s) => s.trackPageVisit);
  const trackPageLeave = useLearningStore((s) => s.trackPageLeave);

  // Track on mount
  React.useEffect(() => {
    trackPageVisit(page);
    return () => trackPageLeave();
  }, [page, trackPageVisit, trackPageLeave]);
};

/** Hook to get search boost for ranking */
export const useSearchRanking = () => {
  const patterns = useLearningStore((s) => s.patterns);
  
  return React.useCallback((itemId: string, baseScore: number) => {
    // Boost score based on usage frequency
    const visits = patterns.pageVisits[itemId] || 0;
    const actions = patterns.actionFrequency[itemId] || 0;
    const recency = patterns.lastActive[itemId] || 0;
    
    // Calculate boost (max 20% boost)
    const frequencyBoost = Math.min(visits * 0.02, 0.1);
    const actionBoost = Math.min(actions * 0.01, 0.05);
    const recencyBoost = recency > Date.now() - 86400000 ? 0.05 : 0; // 24h recency
    
    return baseScore * (1 + frequencyBoost + actionBoost + recencyBoost);
  }, [patterns]);
};

// Need React import for hooks
import React from 'react';

export default useLearningStore;
