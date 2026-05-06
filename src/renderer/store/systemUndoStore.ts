// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - System Undo Store (Zustand)
// ===========================================================================
// Client-side state management for System-Level Undo.
// Communicates with SystemUndoManager backend via IPC.
// Scoped undo with previews. No silent irreversible actions.
// ===========================================================================

import { create } from 'zustand';

// ===========================================================================
// TYPES (mirrored from main process)
// ===========================================================================

export type OperationType = 
  | 'file-create'
  | 'file-delete'
  | 'file-rename'
  | 'file-move'
  | 'file-modify'
  | 'folder-create'
  | 'folder-delete'
  | 'folder-rename'
  | 'setting-change'
  | 'automation-run'
  | 'intent-change';

export interface OperationTarget {
  path?: string;
  type: 'file' | 'folder' | 'setting' | 'automation' | 'intent';
  name: string;
}

export interface OperationRecord {
  id: string;
  type: OperationType;
  timestamp: number;
  description: string;
  target: OperationTarget;
  undoData: {
    previousPath?: string;
    previousContent?: string;
    backupPath?: string;
    previousValue?: any;
    wasNewlyCreated?: boolean;
  };
  canUndo: boolean;
  undoExpires?: number;
  undoneAt?: number;
  undoError?: string;
  intentId?: string;
  automationId?: string;
  scope: 'user' | 'automation' | 'system';
}

export interface Checkpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  operationIds: string[];
  automatic: boolean;
  snapshot?: {
    openFiles: string[];
    activeIntentId?: string;
  };
}

export interface UndoEffect {
  type: 'restore' | 'delete' | 'revert';
  target: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export interface UndoPreview {
  operationId: string;
  operation: OperationRecord;
  effects: UndoEffect[];
  warnings: string[];
  canProceed: boolean;
  blockedReason?: string;
}

export interface RollbackPlan {
  checkpointId: string;
  checkpoint: Checkpoint;
  operationsToUndo: OperationRecord[];
  estimatedTime: number;
  risks: string[];
  preview: UndoPreview[];
}

// ===========================================================================
// STORE STATE
// ===========================================================================

interface SystemUndoState {
  // Operations
  recentOperations: OperationRecord[];
  undoableOperations: OperationRecord[];
  intentOperations: OperationRecord[];
  
  // Checkpoints
  checkpoints: Checkpoint[];
  
  // Current Preview
  currentPreview: UndoPreview | null;
  currentRollbackPlan: RollbackPlan | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  isPanelOpen: boolean;
  activeTab: 'recent' | 'checkpoints' | 'session';
  selectedOperationId: string | null;
  
  // Confirmation Dialog
  showConfirmDialog: boolean;
  confirmAction: 'undo' | 'rollback' | null;
  
  // Actions - Data Loading
  loadRecentOperations: (limit?: number) => Promise<void>;
  loadUndoableOperations: () => Promise<void>;
  loadIntentOperations: (intentId: string) => Promise<void>;
  loadCheckpoints: () => Promise<void>;
  
  // Actions - Preview
  generateUndoPreview: (operationId: string) => Promise<void>;
  generateRollbackPlan: (checkpointId: string) => Promise<void>;
  clearPreview: () => void;
  
  // Actions - Execute
  executeUndo: (operationId: string) => Promise<boolean>;
  executeRollback: (checkpointId: string) => Promise<boolean>;
  
  // Actions - Checkpoints
  createCheckpoint: (name: string) => Promise<boolean>;
  
  // Actions - UI
  openPanel: () => void;
  closePanel: () => void;
  setActiveTab: (tab: 'recent' | 'checkpoints' | 'session') => void;
  selectOperation: (operationId: string | null) => void;
  showConfirm: (action: 'undo' | 'rollback') => void;
  hideConfirm: () => void;
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

export const useSystemUndoStore = create<SystemUndoState>((set, get) => ({
  // Initial State
  recentOperations: [],
  undoableOperations: [],
  intentOperations: [],
  checkpoints: [],
  currentPreview: null,
  currentRollbackPlan: null,
  isLoading: false,
  error: null,
  isPanelOpen: false,
  activeTab: 'recent',
  selectedOperationId: null,
  showConfirmDialog: false,
  confirmAction: null,

  // -------------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------------

  loadRecentOperations: async (limit = 50) => {
    set({ isLoading: true, error: null });
    try {
      const operations = await ipc.invoke<OperationRecord[]>('undo:getRecentOperations', limit);
      set({ recentOperations: operations, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load operations',
        isLoading: false,
      });
    }
  },

  loadUndoableOperations: async () => {
    try {
      const operations = await ipc.invoke<OperationRecord[]>('undo:getUndoableOperations');
      set({ undoableOperations: operations });
    } catch (error) {
      console.error('Failed to load undoable operations:', error);
    }
  },

  loadIntentOperations: async (intentId) => {
    set({ isLoading: true, error: null });
    try {
      const operations = await ipc.invoke<OperationRecord[]>('undo:getIntentOperations', intentId);
      set({ intentOperations: operations, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load intent operations',
        isLoading: false,
      });
    }
  },

  loadCheckpoints: async () => {
    set({ isLoading: true, error: null });
    try {
      const checkpoints = await ipc.invoke<Checkpoint[]>('undo:getAllCheckpoints');
      set({ checkpoints, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load checkpoints',
        isLoading: false,
      });
    }
  },

  // -------------------------------------------------------------------------
  // PREVIEW
  // -------------------------------------------------------------------------

  generateUndoPreview: async (operationId) => {
    set({ isLoading: true, error: null });
    try {
      const preview = await ipc.invoke<UndoPreview>('undo:generatePreview', operationId);
      set({ currentPreview: preview, isLoading: false, selectedOperationId: operationId });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate preview',
        isLoading: false,
      });
    }
  },

  generateRollbackPlan: async (checkpointId) => {
    set({ isLoading: true, error: null });
    try {
      const plan = await ipc.invoke<RollbackPlan>('undo:generateRollbackPlan', checkpointId);
      set({ currentRollbackPlan: plan, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate rollback plan',
        isLoading: false,
      });
    }
  },

  clearPreview: () => {
    set({ currentPreview: null, currentRollbackPlan: null, selectedOperationId: null });
  },

  // -------------------------------------------------------------------------
  // EXECUTE
  // -------------------------------------------------------------------------

  executeUndo: async (operationId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('undo:execute', operationId);
      
      if (result.success) {
        // Refresh operations list
        get().loadRecentOperations();
        get().loadUndoableOperations();
        set({ currentPreview: null, isLoading: false, showConfirmDialog: false });
        return true;
      } else {
        set({ error: result.error || 'Undo failed', isLoading: false });
        return false;
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Undo failed',
        isLoading: false,
      });
      return false;
    }
  },

  executeRollback: async (checkpointId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await ipc.invoke<{ success: boolean; error?: string }>('undo:executeRollback', checkpointId);
      
      if (result.success) {
        // Refresh all data
        get().loadRecentOperations();
        get().loadCheckpoints();
        set({ currentRollbackPlan: null, isLoading: false, showConfirmDialog: false });
        return true;
      } else {
        set({ error: result.error || 'Rollback failed', isLoading: false });
        return false;
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Rollback failed',
        isLoading: false,
      });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // CHECKPOINTS
  // -------------------------------------------------------------------------

  createCheckpoint: async (name) => {
    set({ isLoading: true, error: null });
    try {
      await ipc.invoke('undo:createCheckpoint', name);
      get().loadCheckpoints();
      set({ isLoading: false });
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create checkpoint',
        isLoading: false,
      });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // UI ACTIONS
  // -------------------------------------------------------------------------

  openPanel: () => {
    set({ isPanelOpen: true });
    get().loadRecentOperations();
    get().loadCheckpoints();
  },

  closePanel: () => {
    set({ isPanelOpen: false, currentPreview: null, currentRollbackPlan: null });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab, currentPreview: null, currentRollbackPlan: null });
    
    if (tab === 'checkpoints') {
      get().loadCheckpoints();
    }
  },

  selectOperation: (operationId) => {
    if (operationId) {
      get().generateUndoPreview(operationId);
    } else {
      set({ selectedOperationId: null, currentPreview: null });
    }
  },

  showConfirm: (action) => {
    set({ showConfirmDialog: true, confirmAction: action });
  },

  hideConfirm: () => {
    set({ showConfirmDialog: false, confirmAction: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// ===========================================================================
// SELECTORS
// ===========================================================================

export const selectCanUndo = (state: SystemUndoState) =>
  state.undoableOperations.length > 0;

export const selectLastUndoable = (state: SystemUndoState) =>
  state.undoableOperations[0] || null;

export const selectOperationsByType = (type: OperationType) => (state: SystemUndoState) =>
  state.recentOperations.filter(op => op.type === type);

export const selectOperationById = (id: string) => (state: SystemUndoState) =>
  state.recentOperations.find(op => op.id === id) || null;
