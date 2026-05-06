// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Intent Session Store (Zustand)
// ===========================================================================
// Client-side state management for Intent Sessions.
// Communicates with IntentSessionManager via IPC.
// No auto-creation. No guessing. User always controls.
// ===========================================================================

import { create } from 'zustand';

// ===========================================================================
// TYPES (mirrored from main process)
// ===========================================================================

export interface IntentFile {
  id: string;
  path: string;
  name: string;
  type: string;
  addedAt: number;
  lastAccessedAt: number;
  notes?: string;
}

export interface IntentNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export interface IntentMedia {
  id: string;
  path: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'document';
  addedAt: number;
  duration?: number;
  thumbnail?: string;
  transcription?: string;
}

export interface IntentTab {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  favicon?: string;
  snapshot?: string;
}

export interface IntentAutomation {
  id: string;
  name: string;
  description: string;
  workflowId?: string;
  enabled: boolean;
  addedAt: number;
}

export interface IntentContext {
  why: string;
  goal?: string;
  deadline?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  relatedIntents: string[];
}

export interface IntentVersion {
  id: string;
  intentId: string;
  version: number;
  timestamp: number;
  description?: string;
}

export type IntentStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface IntentSession {
  id: string;
  name: string;
  description?: string;
  status: IntentStatus;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  totalActiveTime: number;
  
  files: IntentFile[];
  notes: IntentNote[];
  media: IntentMedia[];
  tabs: IntentTab[];
  automations: IntentAutomation[];
  context: IntentContext;
  
  versionCount: number;
  versions: IntentVersion[];
}

export interface IntentRestorePreview {
  intentId: string;
  intentName: string;
  timestamp: number;
  changes: {
    filesToOpen: IntentFile[];
    tabsToRestore: IntentTab[];
    notesToShow: IntentNote[];
    automationsToEnable: IntentAutomation[];
  };
  warnings: string[];
  missingFiles: string[];
}

export interface IntentSearchResult {
  intent: IntentSession;
  matchType: 'name' | 'content' | 'file' | 'note' | 'tag';
  matchContext: string;
  relevanceScore: number;
}

// ===========================================================================
// STORE STATE
// ===========================================================================

interface IntentSessionState {
  // Data
  intents: IntentSession[];
  activeIntent: IntentSession | null;
  selectedIntentId: string | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  statusFilter: IntentStatus | 'all';
  
  // Create Modal
  isCreateModalOpen: boolean;
  
  // Restore Preview
  restorePreview: IntentRestorePreview | null;
  isRestorePreviewOpen: boolean;
  
  // Actions - Data Loading
  loadIntents: () => Promise<void>;
  refreshActiveIntent: () => Promise<void>;
  
  // Actions - CRUD
  createIntent: (params: {
    name: string;
    description?: string;
    context: {
      why: string;
      goal?: string;
      deadline?: number;
      priority?: IntentContext['priority'];
      tags?: string[];
    };
  }) => Promise<IntentSession | null>;
  
  activateIntent: (intentId: string) => Promise<boolean>;
  pauseIntent: (intentId: string) => Promise<boolean>;
  archiveIntent: (intentId: string) => Promise<boolean>;
  completeIntent: (intentId: string) => Promise<boolean>;
  deleteIntent: (intentId: string) => Promise<boolean>;
  
  // Actions - Content
  addFile: (intentId: string, filePath: string, notes?: string) => Promise<boolean>;
  removeFile: (intentId: string, fileId: string) => Promise<boolean>;
  addNote: (intentId: string, title: string, content: string, tags?: string[]) => Promise<IntentNote | null>;
  updateNote: (intentId: string, noteId: string, updates: { title?: string; content?: string; tags?: string[] }) => Promise<boolean>;
  removeNote: (intentId: string, noteId: string) => Promise<boolean>;
  addTab: (intentId: string, url: string, title: string, favicon?: string) => Promise<boolean>;
  removeTab: (intentId: string, tabId: string) => Promise<boolean>;
  updateContext: (intentId: string, updates: Partial<IntentContext>) => Promise<boolean>;
  
  // Actions - Versioning
  createVersion: (intentId: string, description?: string) => Promise<boolean>;
  getVersionHistory: (intentId: string, limit?: number) => Promise<IntentVersion[]>;
  
  // Actions - Restore
  generateRestorePreview: (intentId: string, versionId?: string) => Promise<IntentRestorePreview | null>;
  applyRestore: (intentId: string) => Promise<boolean>;
  
  // Actions - Search
  searchIntents: (query: string) => Promise<IntentSearchResult[]>;
  
  // Actions - UI
  setSelectedIntentId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: IntentStatus | 'all') => void;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openRestorePreview: (preview: IntentRestorePreview) => void;
  closeRestorePreview: () => void;
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

export const useIntentSessionStore = create<IntentSessionState>((set, get) => ({
  // Initial State
  intents: [],
  activeIntent: null,
  selectedIntentId: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  statusFilter: 'all',
  isCreateModalOpen: false,
  restorePreview: null,
  isRestorePreviewOpen: false,

  // -------------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------------

  loadIntents: async () => {
    set({ isLoading: true, error: null });
    try {
      const [intents, activeIntent] = await Promise.all([
        ipc.invoke<IntentSession[]>('intent:getAll'),
        ipc.invoke<IntentSession | null>('intent:getActive'),
      ]);
      set({ intents, activeIntent, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load intents',
        isLoading: false 
      });
    }
  },

  refreshActiveIntent: async () => {
    try {
      const activeIntent = await ipc.invoke<IntentSession | null>('intent:getActive');
      set({ activeIntent });
    } catch (error) {
      console.error('Failed to refresh active intent:', error);
    }
  },

  // -------------------------------------------------------------------------
  // CRUD OPERATIONS
  // -------------------------------------------------------------------------

  createIntent: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const intent = await ipc.invoke<IntentSession>('intent:create', params);
      if (intent) {
        set(state => ({
          intents: [...state.intents, intent],
          isLoading: false,
          isCreateModalOpen: false,
        }));
        return intent;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create intent',
        isLoading: false 
      });
      return null;
    }
  },

  activateIntent: async (intentId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('intent:activate', intentId);
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to activate intent' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to activate intent' });
      return false;
    }
  },

  pauseIntent: async (intentId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('intent:pause', intentId);
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to pause intent' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to pause intent' });
      return false;
    }
  },

  archiveIntent: async (intentId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('intent:archive', intentId);
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to archive intent' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to archive intent' });
      return false;
    }
  },

  completeIntent: async (intentId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('intent:complete', intentId);
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to complete intent' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to complete intent' });
      return false;
    }
  },

  deleteIntent: async (intentId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('intent:delete', intentId);
      if (result.success) {
        set(state => ({
          intents: state.intents.filter(i => i.id !== intentId),
          selectedIntentId: state.selectedIntentId === intentId ? null : state.selectedIntentId,
        }));
        return true;
      }
      set({ error: result.error || 'Failed to delete intent' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete intent' });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // CONTENT MANAGEMENT
  // -------------------------------------------------------------------------

  addFile: async (intentId, filePath, notes) => {
    try {
      const result = await ipc.invoke<{ success: boolean; file?: IntentFile; error?: string }>(
        'intent:addFile', intentId, filePath, notes
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to add file' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add file' });
      return false;
    }
  },

  removeFile: async (intentId, fileId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:removeFile', intentId, fileId
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to remove file' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to remove file' });
      return false;
    }
  },

  addNote: async (intentId, title, content, tags) => {
    try {
      const result = await ipc.invoke<{ success: boolean; note?: IntentNote; error?: string }>(
        'intent:addNote', intentId, title, content, tags
      );
      if (result.success && result.note) {
        await get().loadIntents();
        return result.note;
      }
      set({ error: result.error || 'Failed to add note' });
      return null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add note' });
      return null;
    }
  },

  updateNote: async (intentId, noteId, updates) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:updateNote', intentId, noteId, updates
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to update note' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update note' });
      return false;
    }
  },

  removeNote: async (intentId, noteId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:removeNote', intentId, noteId
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to remove note' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to remove note' });
      return false;
    }
  },

  addTab: async (intentId, url, title, favicon) => {
    try {
      const result = await ipc.invoke<{ success: boolean; tab?: IntentTab; error?: string }>(
        'intent:addTab', intentId, url, title, favicon
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to add tab' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add tab' });
      return false;
    }
  },

  removeTab: async (intentId, tabId) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:removeTab', intentId, tabId
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to remove tab' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to remove tab' });
      return false;
    }
  },

  updateContext: async (intentId, updates) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:updateContext', intentId, updates
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to update context' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update context' });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // VERSIONING
  // -------------------------------------------------------------------------

  createVersion: async (intentId, description) => {
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:createVersion', intentId, description
      );
      if (result.success) {
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to create version' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create version' });
      return false;
    }
  },

  getVersionHistory: async (intentId, limit = 20) => {
    try {
      return await ipc.invoke<IntentVersion[]>('intent:getVersionHistory', intentId, limit);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to get version history' });
      return [];
    }
  },

  // -------------------------------------------------------------------------
  // RESTORE
  // -------------------------------------------------------------------------

  generateRestorePreview: async (intentId, versionId) => {
    try {
      const preview = await ipc.invoke<IntentRestorePreview | null>(
        'intent:generateRestorePreview', intentId, versionId
      );
      if (preview) {
        set({ restorePreview: preview, isRestorePreviewOpen: true });
      }
      return preview;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to generate restore preview' });
      return null;
    }
  },

  applyRestore: async (intentId) => {
    const { restorePreview } = get();
    if (!restorePreview) {
      set({ error: 'No restore preview available' });
      return false;
    }
    
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(
        'intent:applyRestore', intentId, restorePreview
      );
      if (result.success) {
        set({ restorePreview: null, isRestorePreviewOpen: false });
        await get().loadIntents();
        return true;
      }
      set({ error: result.error || 'Failed to apply restore' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to apply restore' });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // SEARCH
  // -------------------------------------------------------------------------

  searchIntents: async (query) => {
    try {
      return await ipc.invoke<IntentSearchResult[]>('intent:search', query);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  },

  // -------------------------------------------------------------------------
  // UI ACTIONS
  // -------------------------------------------------------------------------

  setSelectedIntentId: (id) => set({ selectedIntentId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),
  openRestorePreview: (preview) => set({ restorePreview: preview, isRestorePreviewOpen: true }),
  closeRestorePreview: () => set({ restorePreview: null, isRestorePreviewOpen: false }),
  clearError: () => set({ error: null }),
}));

// ===========================================================================
// SELECTORS (for performance)
// ===========================================================================

export const selectFilteredIntents = (state: IntentSessionState) => {
  let filtered = state.intents;
  
  // Filter by status
  if (state.statusFilter !== 'all') {
    filtered = filtered.filter(i => i.status === state.statusFilter);
  }
  
  // Filter by search query
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(i => 
      i.name.toLowerCase().includes(query) ||
      i.description?.toLowerCase().includes(query) ||
      i.context.why.toLowerCase().includes(query) ||
      i.context.tags.some(t => t.toLowerCase().includes(query))
    );
  }
  
  // Sort by last active
  return filtered.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
};

export const selectIntentById = (state: IntentSessionState, id: string) => {
  return state.intents.find(i => i.id === id) || null;
};
