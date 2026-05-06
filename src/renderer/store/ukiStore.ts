// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Store (Zustand)
// Renderer-side state for UKI voice assistant UI
// ===========================================================================

import { create } from 'zustand';

export type UkiUIState = 'dormant' | 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking' | 'error';

interface MemoryStats {
  available: boolean;
  totalRecords: number;
  totalEver: number;
}

interface MemoryRecord {
  id: string;
  record_type: string;
  timestamp: number;
  summary: string;
  app_id: string | null;
  page_id: string | null;
  category: string | null;
  action: string | null;
  success: boolean;
}

export interface UkiConversationTurn {
  id: string;
  userText: string;
  response: string;
  intent: string;
  success: boolean;
  timestamp: number;
  data?: unknown;
}

export interface UkiKnowledgeNode {
  id: string;
  label: string;
  weight: number;
  color: string;
  category: string;
  timestamp: number;
}

interface UkiStoreState {
  state: UkiUIState;
  transcript: string;
  partialTranscript: string;
  response: string;
  audioLevel: number;
  isListening: boolean;
  showTranscript: boolean;
  showPanel: boolean;
  error: string | null;

  // Conversation history (multi-turn)
  conversationHistory: UkiConversationTurn[];

  // Live knowledge nodes for Nexus visualization
  knowledgeNodes: UkiKnowledgeNode[];

  // Memory
  memoryStats: MemoryStats;
  recentMemories: MemoryRecord[];
  memorySearchResults: MemoryRecord[];
  memorySearchQuery: string;
  isSearchingMemory: boolean;

  // Actions
  setState: (s: UkiUIState) => void;
  setTranscript: (t: string) => void;
  setPartialTranscript: (t: string) => void;
  setResponse: (r: string) => void;
  setAudioLevel: (l: number) => void;
  setError: (e: string | null) => void;
  startListening: () => void;
  stopListening: () => void;
  reset: () => void;
  addConversationTurn: (turn: UkiConversationTurn) => void;
  setKnowledgeNodes: (nodes: UkiKnowledgeNode[]) => void;
  setMemoryStats: (stats: MemoryStats) => void;
  setRecentMemories: (records: MemoryRecord[]) => void;
  setMemorySearchResults: (results: MemoryRecord[], query: string) => void;
  setIsSearchingMemory: (v: boolean) => void;
  clearMemorySearch: () => void;
  togglePanel: () => void;
}

// Hydrate conversation history from localStorage (local-only, no network)
function loadPersistedHistory(): UkiConversationTurn[] {
  try {
    const raw = localStorage.getItem('dex:uki:history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch { return []; }
}

function persistHistory(history: UkiConversationTurn[]): void {
  try {
    localStorage.setItem('dex:uki:history', JSON.stringify(history.slice(-30)));
  } catch { /* quota exceeded — silently drop */ }
}

export const useUkiStore = create<UkiStoreState>((set) => ({
  state: 'idle',
  transcript: '',
  partialTranscript: '',
  response: '',
  audioLevel: 0,
  isListening: false,
  showTranscript: false,
  showPanel: false,
  error: null,

  // Conversation history (persisted to localStorage)
  conversationHistory: loadPersistedHistory(),

  // Knowledge nodes for Nexus
  knowledgeNodes: [],

  // Memory
  memoryStats: { available: false, totalRecords: 0, totalEver: 0 },
  recentMemories: [],
  memorySearchResults: [],
  memorySearchQuery: '',
  isSearchingMemory: false,

  setState: (s) => set((prev) => ({
    state: s,
    isListening: s === 'listening',
    showPanel: s === 'listening' || s === 'processing' || s === 'thinking' || s === 'speaking' ? true : prev.showPanel,
  })),
  setTranscript: (t) => set({ transcript: t, showTranscript: true }),
  setPartialTranscript: (t) => set({ partialTranscript: t }),
  setResponse: (r) => set({ response: r, showTranscript: true }),
  setAudioLevel: (l) => set({ audioLevel: l }),
  setError: (e) => set({ error: e, state: e ? 'error' : 'idle' }),

  startListening: () => set({ state: 'listening', isListening: true, transcript: '', partialTranscript: '', response: '', error: null, showTranscript: false, showPanel: true }),
  stopListening: () => set({ state: 'idle', isListening: false, audioLevel: 0 }),
  reset: () => set({ state: 'idle', transcript: '', partialTranscript: '', response: '', audioLevel: 0, isListening: false, showTranscript: false, showPanel: false, error: null }),

  addConversationTurn: (turn) => set((prev) => {
    const next = [...prev.conversationHistory.slice(-29), turn];
    persistHistory(next);
    return { conversationHistory: next };
  }),
  setKnowledgeNodes: (nodes) => set({ knowledgeNodes: nodes }),

  setMemoryStats: (stats) => set({ memoryStats: stats }),
  setRecentMemories: (records) => set({ recentMemories: records }),
  setMemorySearchResults: (results, query) => set({ memorySearchResults: results, memorySearchQuery: query, isSearchingMemory: false }),
  setIsSearchingMemory: (v) => set({ isSearchingMemory: v }),
  clearMemorySearch: () => set({ memorySearchResults: [], memorySearchQuery: '', isSearchingMemory: false }),
  togglePanel: () => set(s => ({ showPanel: !s.showPanel })),
}));
