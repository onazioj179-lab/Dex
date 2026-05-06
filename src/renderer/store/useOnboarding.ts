// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 23: Onboarding & First-Run Experience
// Ambient, non-intrusive discovery system
// ===========================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';

// Features that can show one-time hints
export type DiscoverableFeature = 
  | 'notes-create'
  | 'workflow-run'
  | 'search-used'
  | 'smart-search'
  | 'timer-start'
  | 'action-execute'
  | 'power-profile'
  | 'settings-theme';

interface OnboardingState {
  // First run detection
  isFirstRun: boolean;
  hasCompletedFirstAction: boolean;
  firstActionType: 'note' | 'search' | null;
  
  // Feature discovery (one-time hints)
  discoveredFeatures: DiscoverableFeature[];
  
  // Dismissed hints (user explicitly closed)
  dismissedHints: string[];
  
  // Actions
  markFirstRunComplete: () => void;
  completeFirstAction: (type: 'note' | 'search') => void;
  markFeatureDiscovered: (feature: DiscoverableFeature) => void;
  dismissHint: (hintId: string) => void;
  
  // Queries
  shouldShowHint: (feature: DiscoverableFeature) => boolean;
  isFeatureNew: (feature: DiscoverableFeature) => boolean;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      isFirstRun: true,
      hasCompletedFirstAction: false,
      firstActionType: null,
      discoveredFeatures: [],
      dismissedHints: [],
      
      markFirstRunComplete: () => set({ isFirstRun: false }),
      
      completeFirstAction: (type) => set({ 
        hasCompletedFirstAction: true, 
        firstActionType: type,
        isFirstRun: false,
      }),
      
      markFeatureDiscovered: (feature) => set((state) => ({
        discoveredFeatures: state.discoveredFeatures.includes(feature)
          ? state.discoveredFeatures
          : [...state.discoveredFeatures, feature],
      })),
      
      dismissHint: (hintId) => set((state) => ({
        dismissedHints: state.dismissedHints.includes(hintId)
          ? state.dismissedHints
          : [...state.dismissedHints, hintId],
      })),
      
      shouldShowHint: (feature) => {
        const state = get();
        return !state.discoveredFeatures.includes(feature) && 
               !state.dismissedHints.includes(feature);
      },
      
      isFeatureNew: (feature) => {
        const state = get();
        return !state.discoveredFeatures.includes(feature);
      },
    }),
    {
      name: 'dex-onboarding',
      storage: debouncedJsonStorage,
      version: 1,
    }
  )
);

// ===========================================================================
// HINT CONTENT - One line, calm, helpful
// ===========================================================================

export const hintContent: Record<DiscoverableFeature, string> = {
  'notes-create': 'Notes are saved locally and sync-ready',
  'workflow-run': 'Workflows run steps in sequence automatically',
  'search-used': 'Search finds notes, actions, and settings instantly',
  'smart-search': 'Search finds everything: notes, actions, workflows. Try typing "clean" or "focus".',
  'timer-start': 'Timers continue in the background',
  'action-execute': 'Actions run system commands safely',
  'power-profile': 'Profiles adjust system performance automatically',
  'settings-theme': 'Your preferences are stored locally',
};

// ===========================================================================
// EMPTY STATE CONTENT - Purpose + one action
// ===========================================================================

export const emptyStateContent = {
  notes: {
    purpose: 'Quick notes that stay local and searchable',
    action: 'Create your first note',
    actionKey: 'new-note',
  },
  workflows: {
    purpose: 'Automate multi-step tasks',
    action: 'Create a workflow',
    actionKey: 'new-workflow',
  },
  tasks: {
    purpose: 'Track running apps and background work',
    action: 'No active tasks right now',
    actionKey: null,
  },
  timers: {
    purpose: 'Focus timers and reminders',
    action: 'Start a timer',
    actionKey: 'new-timer',
  },
  actions: {
    purpose: 'Reusable system commands',
    action: 'Create an action',
    actionKey: 'new-action',
  },
  operations: {
    purpose: 'Quick system operations',
    action: 'Operations are ready to use',
    actionKey: null,
  },
  transfers: {
    purpose: 'File transfers and sync status',
    action: 'Start a transfer',
    actionKey: 'new-transfer',
  },
};

// ===========================================================================
// TRUST INDICATORS - Subtle, honest
// ===========================================================================

export const trustIndicators = {
  localOnly: 'Stored locally only',
  encrypted: 'Encrypted at rest',
  noNetwork: 'No network required',
  backgroundSafe: 'Runs silently in background',
  noTracking: 'No analytics or tracking',
};
