// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
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
  /**
   * Ordered chain-of-thought trace. Each string is a brief reasoning step
   * UKI took to reach the final response (e.g. "Checked slash commands",
   * "Looked up running app: Notes", "Routed to local AI"). Surfaces in the
   * "Show thinking" panel so the user sees real reasoning, not a stub.
   */
  thoughtSteps?: string[];
}

export interface UkiKnowledgeNode {
  id: string;
  label: string;
  weight: number;
  color: string;
  category: string;
  timestamp: number;
}

/**
 * A single step in UKI's reasoning trail. Captured per intent so the user can
 * "rewind" any prior turn (replay the query, inspect why UKI chose a route)
 * and so the UI can render a transparent thought process instead of a black
 * box. Cap is intentionally small (last 50) to stay cheap on low-end devices.
 */
export interface UkiThoughtStep {
  id: string;
  /** When the step started, ms epoch. */
  timestamp: number;
  /** What the user said / typed. */
  query: string;
  /** UKI's classified intent (open, note, task, find, run, chat, ...). */
  intent: string;
  /** Top candidates considered before settling on `intent`. */
  candidates: { intent: string; score: number }[];
  /** Latency budget UKI took to produce a response, ms. */
  latencyMs: number;
  /** Whether the route succeeded. */
  success: boolean;
  /** Optional short note (e.g. "low-end mode: skipped semantic match"). */
  note?: string;
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

  // Reasoning trail (rewind)
  thoughtTrail: UkiThoughtStep[];

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
  /** Append a reasoning step to the rewindable thought trail. */
  recordThought: (step: UkiThoughtStep) => void;
  /** Wipe the thought trail (privacy / fresh-start). */
  clearThoughtTrail: () => void;
  /**
   * Replay a previous turn: returns the original query so the caller can
   * resubmit it through the existing UKI dispatch path. Returns null when
   * the id is unknown.
   */
  rewindThought: (id: string) => string | null;
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

const MAX_THOUGHTS = 50;

function loadThoughtTrail(): UkiThoughtStep[] {
  try {
    const raw = localStorage.getItem('dex:uki:thoughts');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_THOUGHTS) : [];
  } catch { return []; }
}

function persistThoughtTrail(trail: UkiThoughtStep[]): void {
  try {
    localStorage.setItem('dex:uki:thoughts', JSON.stringify(trail.slice(-MAX_THOUGHTS)));
  } catch { /* ignore */ }
}

export const useUkiStore = create<UkiStoreState>((set, get) => ({
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

  // Rewindable reasoning trail
  thoughtTrail: loadThoughtTrail(),

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

  recordThought: (step) => set((prev) => {
    const next = [...prev.thoughtTrail.slice(-(MAX_THOUGHTS - 1)), step];
    persistThoughtTrail(next);
    return { thoughtTrail: next };
  }),
  clearThoughtTrail: () => {
    persistThoughtTrail([]);
    set({ thoughtTrail: [] });
  },
  rewindThought: (id) => {
    const trail = get().thoughtTrail;
    const found = trail.find((t) => t.id === id);
    return found ? found.query : null;
  },

  setMemoryStats: (stats) => set({ memoryStats: stats }),
  setRecentMemories: (records) => set({ recentMemories: records }),
  setMemorySearchResults: (results, query) => set({ memorySearchResults: results, memorySearchQuery: query, isSearchingMemory: false }),
  setIsSearchingMemory: (v) => set({ isSearchingMemory: v }),
  clearMemorySearch: () => set({ memorySearchResults: [], memorySearchQuery: '', isSearchingMemory: false }),
  togglePanel: () => set(s => ({ showPanel: !s.showPanel })),
}));
