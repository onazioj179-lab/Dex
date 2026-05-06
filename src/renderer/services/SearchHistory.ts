// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search History & Suggestions (Items 21-30)
 * Smart search history, suggestions, and learning system
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  resultId?: string;
  category?: string;
  count: number;
}

export interface SearchSuggestion {
  text: string;
  type: 'history' | 'trending' | 'correction' | 'completion';
  score: number;
  icon?: string;
}

// ============================================================================
// Fuzzy Search Utilities
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export function stringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - distance) / longer.length;
}

/**
 * Check if query matches target with fuzzy matching
 */
export function fuzzyMatch(query: string, target: string, threshold = 0.6): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  // Exact match or contains
  if (t.includes(q) || q.includes(t)) return true;
  
  // Fuzzy match
  return stringSimilarity(q, t) >= threshold;
}

/**
 * Score a match for ranking
 */
export function scoreMatch(query: string, target: string, category?: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  let score = 0;
  
  // Exact match bonus
  if (t === q) score += 100;
  
  // Starts with bonus
  if (t.startsWith(q)) score += 50;
  
  // Contains bonus
  if (t.includes(q)) score += 25;
  
  // Fuzzy similarity
  score += stringSimilarity(q, t) * 20;
  
  // Category boost for certain categories
  if (category === 'apps') score += 10;
  if (category === 'recent') score += 5;
  
  return score;
}

// ============================================================================
// Search History Store
// ============================================================================

interface SearchHistoryState {
  history: SearchHistoryEntry[];
  maxHistory: number;
  // Actions
  addEntry: (query: string, resultId?: string, category?: string) => void;
  removeEntry: (query: string) => void;
  clearHistory: () => void;
  getRecentQueries: (limit?: number) => string[];
  getSuggestions: (query: string, limit?: number) => SearchSuggestion[];
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      maxHistory: 100,

      addEntry: (query, resultId, category) => {
        if (!query.trim()) return;
        
        set(state => {
          const existing = state.history.find(
            h => h.query.toLowerCase() === query.toLowerCase()
          );

          if (existing) {
            // Update existing entry
            return {
              history: state.history.map(h =>
                h.query.toLowerCase() === query.toLowerCase()
                  ? { ...h, timestamp: Date.now(), count: h.count + 1, resultId, category }
                  : h
              ),
            };
          }

          // Add new entry
          const newHistory = [
            {
              query: query.trim(),
              timestamp: Date.now(),
              resultId,
              category,
              count: 1,
            },
            ...state.history,
          ].slice(0, state.maxHistory);

          return { history: newHistory };
        });
      },

      removeEntry: (query) => {
        set(state => ({
          history: state.history.filter(
            h => h.query.toLowerCase() !== query.toLowerCase()
          ),
        }));
      },

      clearHistory: () => set({ history: [] }),

      getRecentQueries: (limit = 10) => {
        return get()
          .history
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit)
          .map(h => h.query);
      },

      getSuggestions: (query, limit = 8) => {
        if (!query.trim()) {
          // Return recent searches
          return get()
            .history
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(h => ({
              text: h.query,
              type: 'history' as const,
              score: h.count + (Date.now() - h.timestamp) / (1000 * 60 * 60 * 24),
              icon: 'clock',
            }));
        }

        const q = query.toLowerCase();
        const suggestions: SearchSuggestion[] = [];

        // History-based suggestions
        for (const entry of get().history) {
          if (fuzzyMatch(q, entry.query, 0.5)) {
            suggestions.push({
              text: entry.query,
              type: 'history',
              score: scoreMatch(q, entry.query) + entry.count * 5,
              icon: 'clock',
            });
          }
        }

        // Sort by score and limit
        return suggestions
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      },
    }),
    {
      name: 'dex-search-history',
      partialize: (state) => ({ history: state.history }),
    }
  )
);

// ============================================================================
// Spell Correction (Simple)
// ============================================================================

const COMMON_CORRECTIONS: Record<string, string> = {
  'setings': 'settings',
  'settngs': 'settings',
  'settigns': 'settings',
  'prefernces': 'preferences',
  'preferecnes': 'preferences',
  'notificatons': 'notifications',
  'notificaitons': 'notifications',
  'calulator': 'calculator',
  'calculater': 'calculator',
  'calender': 'calendar',
  'calandar': 'calendar',
  'mesages': 'messages',
  'messges': 'messages',
  'browswer': 'browser',
  'broswer': 'browser',
  'temrinal': 'terminal',
  'termianl': 'terminal',
  'systme': 'system',
  'sysetm': 'system',
  'netowrk': 'network',
  'netwrok': 'network',
  'dispaly': 'display',
  'dispay': 'display',
  'acount': 'account',
  'accout': 'account',
  'priavcy': 'privacy',
  'privcay': 'privacy',
  'securty': 'security',
  'secruity': 'security',
  'updaes': 'updates',
  'updtes': 'updates',
  'apearance': 'appearance',
  'appearence': 'appearance',
  'backgrond': 'background',
  'backgorund': 'background',
  'volmue': 'volume',
  'volumne': 'volume',
  'brightnes': 'brightness',
  'birghtness': 'brightness',
  'keybord': 'keyboard',
  'keybaord': 'keyboard',
  'moues': 'mouse',
  'mousse': 'mouse',
  'pritn': 'print',
  'pirnt': 'print',
  'exprot': 'export',
  'exprt': 'export',
  'improt': 'import',
  'imprt': 'import',
  'photso': 'photos',
  'phtos': 'photos',
  'vdieo': 'video',
  'viedo': 'video',
  'mucis': 'music',
  'muisc': 'music',
  'edtior': 'editor',
  'editro': 'editor',
  'vinix': 'vinx',
  'vinks': 'vinx',
  'imoison': 'imosion',
  'imosoin': 'imosion',
  'prisim': 'prism',
  'pirism': 'prism',
  'flxu': 'flux',
  'flxux': 'flux',
  'froge': 'forge',
  'forgge': 'forge',
  'axel': 'axl',
  'axxl': 'axl',
};

/**
 * Get spelling correction suggestion
 */
export function getSpellingCorrection(query: string): string | null {
  const q = query.toLowerCase().trim();
  
  // Direct lookup
  if (COMMON_CORRECTIONS[q]) {
    return COMMON_CORRECTIONS[q];
  }

  // Check individual words
  const words = q.split(/\s+/);
  let hasCorrection = false;
  const corrected = words.map(word => {
    if (COMMON_CORRECTIONS[word]) {
      hasCorrection = true;
      return COMMON_CORRECTIONS[word];
    }
    return word;
  });

  return hasCorrection ? corrected.join(' ') : null;
}

// ============================================================================
// Search Completions
// ============================================================================

const COMMON_COMPLETIONS = [
  'settings',
  'display settings',
  'sound settings',
  'network settings',
  'notifications',
  'appearance',
  'privacy',
  'security',
  'updates',
  'about',
  'calculator',
  'calendar',
  'messages',
  'files',
  'browser',
  'terminal',
  'vinx',
  'imosion',
  'prism',
  'flux',
  'forge',
  'axl',
  'uki',
  'nexus',
  'notes',
  'tasks',
  'photos',
  'music',
  'video',
  'wallpaper',
  'theme',
  'dark mode',
  'light mode',
  'volume',
  'brightness',
  'bluetooth',
  'wifi',
  'vpn',
  'battery',
  'storage',
  'memory',
  'cpu',
  'performance',
  'accessibility',
  'keyboard shortcuts',
];

/**
 * Get autocomplete suggestions
 */
export function getCompletions(query: string, limit = 5): string[] {
  if (!query.trim()) return [];
  
  const q = query.toLowerCase();
  
  return COMMON_COMPLETIONS
    .filter(c => c.startsWith(q) && c !== q)
    .slice(0, limit);
}

// ============================================================================
// Voice Search Stub
// ============================================================================
// Voice Search
// ============================================================================

// Type declarations for Web Speech API
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface VoiceSearchState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
}

let recognition: SpeechRecognitionInstance | null = null;

export function isVoiceSearchSupported(): boolean {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function startVoiceSearch(
  onResult: (transcript: string) => void,
  onError: (error: string) => void,
  onEnd: () => void
): void {
  if (!isVoiceSearchSupported()) {
    onError('Voice search is not supported in this browser');
    return;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onError('Speech recognition not available');
    return;
  }
  
  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i])
      .map(result => result[0].transcript)
      .join('');
    onResult(transcript);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    onError(event.error);
  };

  recognition.onend = onEnd;

  recognition.start();
}

export function stopVoiceSearch(): void {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}
