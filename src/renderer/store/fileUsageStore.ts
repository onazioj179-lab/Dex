// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Usage Store (Zustand)
// ===========================================================================
// Client-side state management for Usage-Aware File System.
// Communicates with UsageAwareFileSystem via IPC.
// No file modifications. Metadata only. Suggestions only.
// ===========================================================================

import { create } from 'zustand';

// ===========================================================================
// TYPES (mirrored from main process)
// ===========================================================================

export interface FileUsageRecord {
  filePath: string;
  fileName: string;
  fileType: string;
  
  accessCount: number;
  lastAccessedAt: number;
  firstAccessedAt: number;
  totalOpenTime: number;
  
  accessedInIntents: string[];
  accessTimes: number[];
  oftenUsedWith: string[];
}

export interface FileRanking {
  filePath: string;
  score: number;
  factors: {
    frequency: number;
    recency: number;
    context: number;
    relationship: number;
  };
  explanation: string;
}

export interface UsageSuggestion {
  type: 'recent' | 'related' | 'pattern' | 'context';
  filePath: string;
  reason: string;
  confidence: number;
  timestamp: number;
}

export interface RelatedFile {
  filePath: string;
  strength: number;
  coAccessCount: number;
}

export interface FileGraphNode {
  filePath: string;
  label: string;
  size: number;
}

export interface FileGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface FileGraph {
  nodes: FileGraphNode[];
  edges: FileGraphEdge[];
}

export interface UsageStats {
  totalFiles: number;
  totalAccesses: number;
  totalRelationships: number;
  topFiles: Array<{ path: string; count: number }>;
  recentFiles: Array<{ path: string; lastAccess: number }>;
}

// ===========================================================================
// STORE STATE
// ===========================================================================

interface FileUsageState {
  // Data
  rankedFiles: FileRanking[];
  suggestions: UsageSuggestion[];
  usageStats: UsageStats | null;
  allRecords: FileUsageRecord[];
  
  // Current context
  currentFilePath: string | null;
  currentIntentId: string | null;
  relatedFiles: RelatedFile[];
  
  // Settings
  isTrackingEnabled: boolean;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  dismissedSuggestions: Set<string>;
  
  // Explanation panel
  explanationFile: FileRanking | null;
  isExplanationOpen: boolean;
  
  // Actions - Data Loading
  loadRankedFiles: (context?: { intentId?: string; currentFile?: string; query?: string }, limit?: number) => Promise<void>;
  loadSuggestions: (context?: { currentFile?: string; intentId?: string }) => Promise<void>;
  loadUsageStats: () => Promise<void>;
  loadAllRecords: () => Promise<void>;
  loadRelatedFiles: (filePath: string, limit?: number) => Promise<void>;
  
  // Actions - Tracking
  recordFileAccess: (filePath: string, intentId?: string) => Promise<void>;
  recordFileClose: (filePath: string) => Promise<void>;
  
  // Actions - Privacy
  clearAllUsageData: () => Promise<boolean>;
  setTrackingEnabled: (enabled: boolean) => void;
  
  // Actions - UI
  setCurrentFile: (filePath: string | null) => void;
  setCurrentIntent: (intentId: string | null) => void;
  dismissSuggestion: (filePath: string) => void;
  clearDismissedSuggestions: () => void;
  openExplanation: (ranking: FileRanking) => void;
  closeExplanation: () => void;
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

export const useFileUsageStore = create<FileUsageState>((set, get) => ({
  // Initial State
  rankedFiles: [],
  suggestions: [],
  usageStats: null,
  allRecords: [],
  currentFilePath: null,
  currentIntentId: null,
  relatedFiles: [],
  isTrackingEnabled: true,
  isLoading: false,
  error: null,
  dismissedSuggestions: new Set(),
  explanationFile: null,
  isExplanationOpen: false,

  // -------------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------------

  loadRankedFiles: async (context, limit = 20) => {
    set({ isLoading: true, error: null });
    try {
      const rankedFiles = await ipc.invoke<FileRanking[]>('fileUsage:getRankedFiles', context, limit);
      set({ rankedFiles, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load ranked files',
        isLoading: false 
      });
    }
  },

  loadSuggestions: async (context) => {
    const state = get();
    if (!state.isTrackingEnabled) {
      set({ suggestions: [] });
      return;
    }
    
    set({ isLoading: true, error: null });
    try {
      const fullContext = {
        currentFile: context?.currentFile || state.currentFilePath || undefined,
        intentId: context?.intentId || state.currentIntentId || undefined,
      };
      
      const suggestions = await ipc.invoke<UsageSuggestion[]>('fileUsage:getSuggestions', fullContext);
      
      // Filter out dismissed suggestions
      const filteredSuggestions = suggestions.filter(
        s => !state.dismissedSuggestions.has(s.filePath)
      );
      
      set({ suggestions: filteredSuggestions, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load suggestions',
        isLoading: false 
      });
    }
  },

  loadUsageStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const usageStats = await ipc.invoke<UsageStats>('fileUsage:getStats');
      set({ usageStats, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load usage stats',
        isLoading: false 
      });
    }
  },

  loadAllRecords: async () => {
    set({ isLoading: true, error: null });
    try {
      const allRecords = await ipc.invoke<FileUsageRecord[]>('fileUsage:getAllRecords');
      set({ allRecords, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load records',
        isLoading: false 
      });
    }
  },

  loadRelatedFiles: async (filePath, limit = 10) => {
    set({ isLoading: true, error: null });
    try {
      const relatedFiles = await ipc.invoke<RelatedFile[]>('fileUsage:getRelatedFiles', filePath, limit);
      set({ relatedFiles, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load related files',
        isLoading: false 
      });
    }
  },

  // -------------------------------------------------------------------------
  // TRACKING
  // -------------------------------------------------------------------------

  recordFileAccess: async (filePath, intentId) => {
    const state = get();
    if (!state.isTrackingEnabled) return;
    
    try {
      await ipc.invoke('fileUsage:recordAccess', filePath, intentId);
      set({ currentFilePath: filePath });
      
      // Refresh suggestions after file access - await to prevent race
      await get().loadSuggestions();
    } catch (error) {
      console.error('Failed to record file access:', error);
    }
  },

  recordFileClose: async (filePath) => {
    const state = get();
    if (!state.isTrackingEnabled) return;
    
    try {
      await ipc.invoke('fileUsage:recordClose', filePath);
      
      if (state.currentFilePath === filePath) {
        set({ currentFilePath: null });
      }
    } catch (error) {
      console.error('Failed to record file close:', error);
    }
  },

  // -------------------------------------------------------------------------
  // PRIVACY
  // -------------------------------------------------------------------------

  clearAllUsageData: async () => {
    set({ isLoading: true, error: null });
    try {
      await ipc.invoke('fileUsage:clearAll');
      set({ 
        rankedFiles: [],
        suggestions: [],
        usageStats: null,
        allRecords: [],
        relatedFiles: [],
        dismissedSuggestions: new Set(),
        isLoading: false 
      });
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to clear usage data',
        isLoading: false 
      });
      return false;
    }
  },

  setTrackingEnabled: (enabled) => {
    set({ isTrackingEnabled: enabled });
    
    // If disabled, clear current context
    if (!enabled) {
      set({ 
        suggestions: [],
        currentFilePath: null,
      });
    }
  },

  // -------------------------------------------------------------------------
  // UI ACTIONS
  // -------------------------------------------------------------------------

  setCurrentFile: (filePath) => {
    set({ currentFilePath: filePath });
    
    if (filePath) {
      get().loadRelatedFiles(filePath);
    } else {
      set({ relatedFiles: [] });
    }
  },

  setCurrentIntent: (intentId) => {
    set({ currentIntentId: intentId });
    get().loadSuggestions();
  },

  dismissSuggestion: (filePath) => {
    const state = get();
    const newDismissed = new Set(state.dismissedSuggestions);
    newDismissed.add(filePath);
    
    set({ 
      dismissedSuggestions: newDismissed,
      suggestions: state.suggestions.filter(s => s.filePath !== filePath),
    });
  },

  clearDismissedSuggestions: () => {
    set({ dismissedSuggestions: new Set() });
    get().loadSuggestions();
  },

  openExplanation: (ranking) => {
    set({ explanationFile: ranking, isExplanationOpen: true });
  },

  closeExplanation: () => {
    set({ explanationFile: null, isExplanationOpen: false });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// ===========================================================================
// SELECTORS
// ===========================================================================

export const selectTopRankedFiles = (limit: number = 10) => (state: FileUsageState) => 
  state.rankedFiles.slice(0, limit);

export const selectActiveSuggestions = (state: FileUsageState) => 
  state.suggestions.filter(s => !state.dismissedSuggestions.has(s.filePath));

export const selectSuggestionsByType = (type: UsageSuggestion['type']) => (state: FileUsageState) =>
  state.suggestions.filter(s => s.type === type);
