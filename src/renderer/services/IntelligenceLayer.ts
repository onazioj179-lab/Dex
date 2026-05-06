// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Intelligence Layer
 * 10A: Focus Session Intelligence (smart suggestions on top of existing FocusSessionSystem)
 * 10B: Context Prediction Store (unified consumer for 4 backend prediction systems)
 * 10C: Smart Recents (merged ranked feed from files, apps, pages, searches)
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const ipc = (channel: string, ...args: any[]) =>
  (window as any).electron?.ipcRenderer?.invoke(channel, ...args).catch(() => null);

// ===========================================================================
// 10A: Focus Session Intelligence
// ===========================================================================

interface FocusInsight {
  id: string;
  type: 'optimal_time' | 'duration_rec' | 'app_suggest' | 'break_reminder' | 'streak_alert' | 'pattern_note';
  title: string;
  description: string;
  confidence: number;
  data?: Record<string, any>;
  timestamp: number;
  dismissed: boolean;
}

interface FocusPattern {
  hour: number;
  dayOfWeek: number;
  avgDuration: number;
  avgScore: number;
  sessionCount: number;
  topApps: string[];
}

interface FocusIntelligenceState {
  insights: FocusInsight[];
  patterns: FocusPattern[];
  optimalHours: number[];
  recommendedDuration: number;
  suggestedGoal: string;
  suggestedApp: string;
  currentStreak: number;
  longestStreak: number;
  weeklyTarget: number;
  weeklyCompleted: number;
  loading: boolean;

  computeInsights: () => Promise<void>;
  loadPatterns: () => Promise<void>;
  dismissInsight: (id: string) => void;
  getOptimalStartTime: () => { hour: number; confidence: number } | null;
  getDurationRecommendation: () => { minutes: number; reason: string };
  getAppSuggestion: () => { app: string; reason: string } | null;
  setWeeklyTarget: (target: number) => void;
}

export const useFocusIntelligenceStore = create<FocusIntelligenceState>()(
  devtools((set, get) => ({
    insights: [],
    patterns: [],
    optimalHours: [],
    recommendedDuration: 25,
    suggestedGoal: '',
    suggestedApp: '',
    currentStreak: 0,
    longestStreak: 0,
    weeklyTarget: 5,
    weeklyCompleted: 0,
    loading: false,

    computeInsights: async () => {
      set({ loading: true });
      const insights: FocusInsight[] = [];
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();

      // Load session history
      const sessions: any[] = await ipc('focus:getSessions') || [];
      const recentSessions = sessions.filter(
        (s: any) => s.endTime && Date.now() - s.endTime < 30 * 86400000
      );

      // Build patterns from session history
      const patternMap = new Map<string, FocusPattern>();
      for (const s of recentSessions) {
        const d = new Date(s.startTime);
        const key = `${d.getHours()}-${d.getDay()}`;
        const existing = patternMap.get(key) || {
          hour: d.getHours(),
          dayOfWeek: d.getDay(),
          avgDuration: 0,
          avgScore: 0,
          sessionCount: 0,
          topApps: [],
        };
        existing.sessionCount++;
        existing.avgDuration = (existing.avgDuration * (existing.sessionCount - 1) + s.durationMs) / existing.sessionCount;
        if (s.appsUsed) existing.topApps.push(...s.appsUsed);
        patternMap.set(key, existing);
      }
      const patterns = Array.from(patternMap.values());

      // Find optimal hours (hours with most sessions and longest durations)
      const hourScores: Record<number, { count: number; totalDuration: number }> = {};
      for (const p of patterns) {
        if (!hourScores[p.hour]) hourScores[p.hour] = { count: 0, totalDuration: 0 };
        hourScores[p.hour].count += p.sessionCount;
        hourScores[p.hour].totalDuration += p.avgDuration * p.sessionCount;
      }
      const optimalHours = Object.entries(hourScores)
        .sort(([, a], [, b]) => (b.count * b.totalDuration) - (a.count * a.totalDuration))
        .slice(0, 5)
        .map(([h]) => parseInt(h, 10));

      // Compute recommended duration from average of completed sessions
      const completedSessions = recentSessions.filter((s: any) => s.completed);
      const avgDuration = completedSessions.length > 0
        ? completedSessions.reduce((sum: number, s: any) => sum + s.durationMs, 0) / completedSessions.length
        : 25 * 60000;
      const recommendedMinutes = Math.round(avgDuration / 60000 / 5) * 5;

      // Streak calculation
      const daySet = new Set<string>();
      for (const s of recentSessions) {
        if (s.completed) {
          daySet.add(new Date(s.startTime).toISOString().split('T')[0]);
        }
      }
      const sortedDays = Array.from(daySet).sort().reverse();
      let currentStreak = 0;
      const today = new Date().toISOString().split('T')[0];
      let checkDay = new Date();
      for (let i = 0; i < 365; i++) {
        const ds = checkDay.toISOString().split('T')[0];
        if (daySet.has(ds)) {
          currentStreak++;
        } else if (ds !== today) {
          break;
        } else {
          break;
        }
        checkDay = new Date(checkDay.getTime() - 86400000);
      }
      let longestStreak = 0;
      let streak = 0;
      for (let i = 0; i < sortedDays.length; i++) {
        if (i === 0) { streak = 1; continue; }
        const prev = new Date(sortedDays[i - 1]).getTime();
        const curr = new Date(sortedDays[i]).getTime();
        if (prev - curr === 86400000) {
          streak++;
        } else {
          if (streak > longestStreak) longestStreak = streak;
          streak = 1;
        }
      }
      if (streak > longestStreak) longestStreak = streak;

      // Weekly completed count
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weeklyCompleted = recentSessions.filter(
        (s: any) => s.completed && s.startTime >= weekStart.getTime()
      ).length;

      // Generate insights
      if (optimalHours.includes(hour)) {
        insights.push({
          id: `optimal-${Date.now()}`,
          type: 'optimal_time',
          title: 'Good time to focus',
          description: `You tend to have productive focus sessions around ${hour}:00. Consider starting a session now.`,
          confidence: 0.8,
          timestamp: Date.now(),
          dismissed: false,
        });
      }

      const todayPatterns = patterns.filter(p => p.dayOfWeek === dayOfWeek);
      if (todayPatterns.length > 0) {
        const topApp = getFrequent(todayPatterns.flatMap(p => p.topApps));
        if (topApp) {
          insights.push({
            id: `app-${Date.now()}`,
            type: 'app_suggest',
            title: `Work on ${topApp}`,
            description: `On ${getDayName(dayOfWeek)}, you frequently focus on ${topApp}.`,
            confidence: 0.65,
            data: { app: topApp },
            timestamp: Date.now(),
            dismissed: false,
          });
        }
      }

      if (currentStreak >= 3) {
        insights.push({
          id: `streak-${Date.now()}`,
          type: 'streak_alert',
          title: `${currentStreak}-day focus streak`,
          description: `You have been focusing consistently for ${currentStreak} days. Keep it going.`,
          confidence: 1,
          timestamp: Date.now(),
          dismissed: false,
        });
      }

      if (weeklyCompleted >= get().weeklyTarget) {
        insights.push({
          id: `weekly-${Date.now()}`,
          type: 'pattern_note',
          title: 'Weekly target met',
          description: `You completed ${weeklyCompleted} focus sessions this week, meeting your target of ${get().weeklyTarget}.`,
          confidence: 1,
          timestamp: Date.now(),
          dismissed: false,
        });
      } else if (dayOfWeek >= 4 && weeklyCompleted < get().weeklyTarget * 0.5) {
        insights.push({
          id: `behind-${Date.now()}`,
          type: 'pattern_note',
          title: 'Behind on weekly target',
          description: `${weeklyCompleted} of ${get().weeklyTarget} sessions completed this week. Try fitting in a session today.`,
          confidence: 0.7,
          timestamp: Date.now(),
          dismissed: false,
        });
      }

      // Duration insight
      if (completedSessions.length >= 5 && Math.abs(recommendedMinutes - 25) >= 5) {
        insights.push({
          id: `duration-${Date.now()}`,
          type: 'duration_rec',
          title: `Try ${recommendedMinutes}-minute sessions`,
          description: `Based on your history, ${recommendedMinutes} minutes is your sweet spot for completed sessions.`,
          confidence: Math.min(0.9, 0.5 + completedSessions.length * 0.02),
          timestamp: Date.now(),
          dismissed: false,
        });
      }

      const suggestedGoal = todayPatterns.length > 0 && todayPatterns[0].topApps.length > 0
        ? `Work in ${todayPatterns[0].topApps[0]}`
        : '';

      const suggestedApp = todayPatterns.length > 0
        ? getFrequent(todayPatterns.flatMap(p => p.topApps)) || ''
        : '';

      set({
        insights: insights.filter(i => !i.dismissed),
        patterns,
        optimalHours,
        recommendedDuration: Math.max(5, Math.min(120, recommendedMinutes)),
        suggestedGoal,
        suggestedApp,
        currentStreak,
        longestStreak,
        weeklyCompleted,
        loading: false,
      });
    },

    loadPatterns: async () => {
      await get().computeInsights();
    },

    dismissInsight: (id) => {
      set(s => ({
        insights: s.insights.map(i => i.id === id ? { ...i, dismissed: true } : i),
      }));
    },

    getOptimalStartTime: () => {
      const { optimalHours } = get();
      if (optimalHours.length === 0) return null;
      const now = new Date().getHours();
      const upcoming = optimalHours.filter(h => h >= now).sort((a, b) => a - b);
      const target = upcoming.length > 0 ? upcoming[0] : optimalHours[0];
      return { hour: target, confidence: 0.7 };
    },

    getDurationRecommendation: () => {
      const { recommendedDuration, patterns } = get();
      if (patterns.length < 3) {
        return { minutes: 25, reason: 'Default recommendation. More data needed to personalize.' };
      }
      return {
        minutes: recommendedDuration,
        reason: `Based on ${patterns.reduce((s, p) => s + p.sessionCount, 0)} past sessions.`,
      };
    },

    getAppSuggestion: () => {
      const { suggestedApp, patterns } = get();
      if (!suggestedApp) return null;
      return {
        app: suggestedApp,
        reason: `Frequently used during focus on ${getDayName(new Date().getDay())}.`,
      };
    },

    setWeeklyTarget: (target) => set({ weeklyTarget: target }),
  }), { name: 'dex-focus-intelligence' })
);

function getFrequent(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  let maxItem = '';
  let maxCount = 0;
  for (const [item, count] of Object.entries(counts)) {
    if (count > maxCount) { maxItem = item; maxCount = count; }
  }
  return maxItem || null;
}

function getDayName(d: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d] || '';
}

// ===========================================================================
// 10B: Context Prediction Store
// ===========================================================================

interface PredictedApp {
  id: string;
  name: string;
  confidence: number;
  reason: string;
}

interface SuggestedAction {
  id: string;
  type: string;
  label: string;
  description: string;
  confidence: number;
  actionPayload?: Record<string, any>;
}

interface ContextHint {
  id: string;
  type: 'likely_action' | 'recent_file' | 'frequent_search' | 'next_step';
  label: string;
  confidence: number;
  reason: string;
  data?: Record<string, any>;
}

interface ContextPredictionState {
  predictedNextApp: PredictedApp | null;
  preloadApps: PredictedApp[];
  suggestedActions: SuggestedAction[];
  contextHints: ContextHint[];
  predictedCommands: string[];
  lastRefresh: number;
  autoRefresh: boolean;
  refreshInterval: number;
  loading: boolean;

  refresh: () => Promise<void>;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
  setRefreshInterval: (ms: number) => void;
  dismissAction: (id: string) => void;
  dismissHint: (id: string) => void;
  executeAction: (action: SuggestedAction) => Promise<void>;
  recordFeedback: (id: string, helpful: boolean) => void;
}

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

export const useContextPredictionStore = create<ContextPredictionState>()(
  devtools((set, get) => ({
    predictedNextApp: null,
    preloadApps: [],
    suggestedActions: [],
    contextHints: [],
    predictedCommands: [],
    lastRefresh: 0,
    autoRefresh: true,
    refreshInterval: 300000,
    loading: false,

    refresh: async () => {
      set({ loading: true });

      const [fullCache, suggestions, rankedActions] = await Promise.all([
        ipc('intelligence:full-cache'),
        ipc('context:getSuggestions'),
        ipc('context:getRankedActions'),
      ]);

      let predictedNextApp: PredictedApp | null = null;
      const preloadApps: PredictedApp[] = [];
      const suggestedActions: SuggestedAction[] = [];
      const contextHints: ContextHint[] = [];
      let predictedCommands: string[] = [];

      // From IntelligenceAPI full cache
      if (fullCache) {
        if (fullCache.predictedNextApp) {
          predictedNextApp = {
            id: fullCache.predictedNextApp,
            name: fullCache.predictedNextApp,
            confidence: 0.7,
            reason: 'Based on usage patterns and time of day',
          };
        }

        if (fullCache.optimalPreloadApps) {
          for (const app of fullCache.optimalPreloadApps) {
            preloadApps.push({
              id: app, name: app, confidence: 0.6,
              reason: 'Frequently used around this time',
            });
          }
        }

        if (fullCache.suggestedActions) {
          for (const action of fullCache.suggestedActions) {
            suggestedActions.push({
              id: action.id || `sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: action.type || 'general',
              label: action.label || action.title || '',
              description: action.description || '',
              confidence: action.confidence || 0.5,
              actionPayload: action.payload,
            });
          }
        }

        if (fullCache.contextHints) {
          for (const hint of fullCache.contextHints) {
            contextHints.push({
              id: hint.id || `ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: hint.type || 'likely_action',
              label: hint.label || hint.reason || '',
              confidence: hint.confidence || 0.5,
              reason: hint.reason || '',
              data: hint.data,
            });
          }
        }

        predictedCommands = fullCache.predictedPluginCommands || [];
      }

      // From ContextIntelligenceService suggestions
      if (suggestions && Array.isArray(suggestions)) {
        for (const s of suggestions) {
          const exists = contextHints.find(h => h.label === (s.label || s.reason));
          if (!exists) {
            contextHints.push({
              id: s.id || `cs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: s.type || 'next_step',
              label: s.label || s.reason || s.description || '',
              confidence: s.confidence || 0.5,
              reason: s.reason || '',
              data: s.data,
            });
          }
        }
      }

      // From ranked actions
      if (rankedActions && Array.isArray(rankedActions)) {
        for (const ra of rankedActions.slice(0, 5)) {
          const exists = suggestedActions.find(a => a.label === (ra.label || ra.action));
          if (!exists) {
            suggestedActions.push({
              id: ra.id || `ra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: ra.type || 'ranked',
              label: ra.label || ra.action || '',
              description: ra.description || `Confidence: ${Math.round((ra.score || ra.confidence || 0) * 100)}%`,
              confidence: ra.score || ra.confidence || 0.5,
              actionPayload: ra.payload,
            });
          }
        }
      }

      // Sort by confidence
      suggestedActions.sort((a, b) => b.confidence - a.confidence);
      contextHints.sort((a, b) => b.confidence - a.confidence);

      set({
        predictedNextApp,
        preloadApps,
        suggestedActions: suggestedActions.slice(0, 8),
        contextHints: contextHints.slice(0, 10),
        predictedCommands: predictedCommands.slice(0, 5),
        lastRefresh: Date.now(),
        loading: false,
      });
    },

    startAutoRefresh: () => {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      set({ autoRefresh: true });
      autoRefreshTimer = setInterval(() => {
        get().refresh();
      }, get().refreshInterval);
      get().refresh();
    },

    stopAutoRefresh: () => {
      set({ autoRefresh: false });
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    },

    setRefreshInterval: (ms) => {
      set({ refreshInterval: ms });
      if (get().autoRefresh) {
        get().stopAutoRefresh();
        get().startAutoRefresh();
      }
    },

    dismissAction: (id) => {
      set(s => ({
        suggestedActions: s.suggestedActions.filter(a => a.id !== id),
      }));
    },

    dismissHint: (id) => {
      set(s => ({
        contextHints: s.contextHints.filter(h => h.id !== id),
      }));
    },

    executeAction: async (action) => {
      if (action.actionPayload?.ipcChannel) {
        await ipc(action.actionPayload.ipcChannel, action.actionPayload.args);
      }
      get().dismissAction(action.id);
      await ipc('intelligence:record-action', action.type, action.label);
    },

    recordFeedback: (id, helpful) => {
      ipc('intelligence:record-feedback', id, helpful);
    },
  }), { name: 'dex-context-prediction' })
);

// ===========================================================================
// 10C: Smart Recents
// ===========================================================================

interface SmartRecentItem {
  id: string;
  type: 'file' | 'app' | 'page' | 'search' | 'note' | 'task' | 'project';
  title: string;
  subtitle: string;
  path?: string;
  icon?: string;
  score: number;
  lastAccessed: number;
  accessCount: number;
  contextRelevance: number;
  timeRelevance: number;
  tags: string[];
}

interface SmartRecentsState {
  items: SmartRecentItem[];
  pinnedItems: string[];
  maxItems: number;
  loading: boolean;
  filterType: string;
  searchQuery: string;
  timeWeight: number;
  frequencyWeight: number;
  contextWeight: number;

  loadRecents: () => Promise<void>;
  pinItem: (id: string) => void;
  unpinItem: (id: string) => void;
  removeItem: (id: string) => void;
  setFilterType: (type: string) => void;
  setSearchQuery: (query: string) => void;
  setWeights: (time: number, freq: number, ctx: number) => void;
  getFilteredItems: () => SmartRecentItem[];
  recordAccess: (type: string, id: string, title: string, path?: string) => void;
}

export const useSmartRecentsStore = create<SmartRecentsState>()(
  persist(
    devtools((set, get) => ({
      items: [],
      pinnedItems: [],
      maxItems: 100,
      loading: false,
      filterType: '',
      searchQuery: '',
      timeWeight: 0.35,
      frequencyWeight: 0.35,
      contextWeight: 0.3,

      loadRecents: async () => {
        set({ loading: true });
        const items: SmartRecentItem[] = [];
        const seen = new Set<string>();
        const now = Date.now();

        // Gather from multiple sources in parallel
        const [
          rankedActions,
          contextSuggestions,
          fileHistory,
          searchHistory,
          rewindRecent,
        ] = await Promise.all([
          ipc('context:getRankedActions'),
          ipc('context:getSuggestions'),
          ipc('files:getRecent', 50),
          ipc('search:getHistory', 20),
          ipc('rewind:query', {
            startDate: now - 7 * 86400000,
            endDate: now,
            limit: 50,
            types: ['app', 'file', 'note', 'task'],
          }),
        ]);

        // Recent files
        if (fileHistory && Array.isArray(fileHistory)) {
          for (const f of fileHistory) {
            const id = `file-${f.path || f.name}`;
            if (seen.has(id)) continue;
            seen.add(id);

            const timeDelta = now - (f.lastAccessed || f.timestamp || now);
            const timeScore = Math.max(0, 1 - timeDelta / (7 * 86400000));
            const freqScore = Math.min(1, (f.accessCount || f.frequency || 1) / 20);

            items.push({
              id,
              type: 'file',
              title: f.name || f.path?.split(/[\\/]/).pop() || 'Unknown',
              subtitle: f.path || '',
              path: f.path,
              score: 0,
              lastAccessed: f.lastAccessed || f.timestamp || now,
              accessCount: f.accessCount || f.frequency || 1,
              contextRelevance: f.contextScore || 0.5,
              timeRelevance: timeScore,
              tags: f.tags || [],
            });
          }
        }

        // Rewind entries as recents
        if (rewindRecent && Array.isArray(rewindRecent)) {
          for (const entry of rewindRecent) {
            const id = `${entry.type}-${entry.id || entry.content}`;
            if (seen.has(id)) continue;
            seen.add(id);

            const timeDelta = now - entry.timestamp;
            const timeScore = Math.max(0, 1 - timeDelta / (7 * 86400000));

            items.push({
              id,
              type: entry.type === 'app' ? 'app'
                : entry.type === 'note' ? 'note'
                : entry.type === 'task' ? 'task'
                : 'file',
              title: entry.content || entry.appName || '',
              subtitle: entry.appName || entry.type,
              path: entry.metadata?.path,
              score: 0,
              lastAccessed: entry.timestamp,
              accessCount: 1,
              contextRelevance: 0.5,
              timeRelevance: timeScore,
              tags: [],
            });
          }
        }

        // Search history
        if (searchHistory && Array.isArray(searchHistory)) {
          for (const q of searchHistory) {
            const id = `search-${q.query || q}`;
            if (seen.has(id)) continue;
            seen.add(id);
            items.push({
              id,
              type: 'search',
              title: typeof q === 'string' ? q : q.query || '',
              subtitle: 'Search',
              score: 0,
              lastAccessed: typeof q === 'string' ? now : q.timestamp || now,
              accessCount: typeof q === 'string' ? 1 : q.count || 1,
              contextRelevance: 0.4,
              timeRelevance: 0.5,
              tags: [],
            });
          }
        }

        // Context suggestions as recents
        if (contextSuggestions && Array.isArray(contextSuggestions)) {
          for (const s of contextSuggestions) {
            if (s.type === 'recent_file' && s.data?.path) {
              const id = `ctx-${s.data.path}`;
              if (seen.has(id)) continue;
              seen.add(id);
              items.push({
                id,
                type: 'file',
                title: s.label || s.data.path.split(/[\\/]/).pop() || '',
                subtitle: s.reason || '',
                path: s.data.path,
                score: 0,
                lastAccessed: now,
                accessCount: 1,
                contextRelevance: s.confidence || 0.7,
                timeRelevance: 0.6,
                tags: [],
              });
            }
          }
        }

        // Score all items
        const { timeWeight, frequencyWeight, contextWeight } = get();
        const maxAccess = Math.max(1, ...items.map(i => i.accessCount));

        for (const item of items) {
          const tDelta = now - item.lastAccessed;
          const timeScore = Math.max(0, 1 - tDelta / (7 * 86400000));
          const freqScore = item.accessCount / maxAccess;
          const ctxScore = item.contextRelevance;

          item.timeRelevance = timeScore;
          item.score = timeWeight * timeScore + frequencyWeight * freqScore + contextWeight * ctxScore;
        }

        // Sort: pinned first, then by score
        const pinned = new Set(get().pinnedItems);
        items.sort((a, b) => {
          const ap = pinned.has(a.id) ? 1 : 0;
          const bp = pinned.has(b.id) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return b.score - a.score;
        });

        set({
          items: items.slice(0, get().maxItems),
          loading: false,
        });
      },

      pinItem: (id) => set(s => ({
        pinnedItems: s.pinnedItems.includes(id) ? s.pinnedItems : [...s.pinnedItems, id],
      })),

      unpinItem: (id) => set(s => ({
        pinnedItems: s.pinnedItems.filter(p => p !== id),
      })),

      removeItem: (id) => set(s => ({
        items: s.items.filter(i => i.id !== id),
        pinnedItems: s.pinnedItems.filter(p => p !== id),
      })),

      setFilterType: (type) => set({ filterType: type }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      setWeights: (time, freq, ctx) => {
        const total = time + freq + ctx;
        set({
          timeWeight: time / total,
          frequencyWeight: freq / total,
          contextWeight: ctx / total,
        });
      },

      getFilteredItems: () => {
        const { items, filterType, searchQuery, pinnedItems } = get();
        let filtered = items;
        if (filterType) filtered = filtered.filter(i => i.type === filterType);
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(i =>
            i.title.toLowerCase().includes(q) ||
            i.subtitle.toLowerCase().includes(q) ||
            i.tags.some(t => t.toLowerCase().includes(q))
          );
        }
        const pinSet = new Set(pinnedItems);
        return filtered.sort((a, b) => {
          const ap = pinSet.has(a.id) ? 1 : 0;
          const bp = pinSet.has(b.id) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return b.score - a.score;
        });
      },

      recordAccess: (type, id, title, path) => {
        set(s => {
          const existing = s.items.find(i => i.id === `${type}-${id}`);
          if (existing) {
            return {
              items: s.items.map(i =>
                i.id === existing.id
                  ? { ...i, accessCount: i.accessCount + 1, lastAccessed: Date.now() }
                  : i
              ),
            };
          }
          const newItem: SmartRecentItem = {
            id: `${type}-${id}`,
            type: type as SmartRecentItem['type'],
            title,
            subtitle: path || type,
            path,
            score: 1,
            lastAccessed: Date.now(),
            accessCount: 1,
            contextRelevance: 0.5,
            timeRelevance: 1,
            tags: [],
          };
          return { items: [newItem, ...s.items].slice(0, s.maxItems) };
        });
        ipc('context:recordUsage', type, id, title);
      },
    }), { name: 'dex-context-prediction' }),
    {
      name: 'dex-smart-recents',
      partialize: (s) => ({
        pinnedItems: s.pinnedItems,
        timeWeight: s.timeWeight,
        frequencyWeight: s.frequencyWeight,
        contextWeight: s.contextWeight,
      }),
    }
  )
);
