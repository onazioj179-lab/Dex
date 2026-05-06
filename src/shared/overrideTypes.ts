// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Override Panel Types
// Emergency control system for absolute authority
// =============================================================================

// -----------------------------------------------------------------------------
// OVERRIDE LEVELS
// -----------------------------------------------------------------------------

export type OverrideLevel = 
  | 'normal'      // Standard operation
  | 'elevated'    // Some restrictions active
  | 'lockdown'    // Full system freeze
  | 'emergency';  // Critical state, all stops

// -----------------------------------------------------------------------------
// OVERRIDE ACTIONS
// -----------------------------------------------------------------------------

export type OverrideAction =
  | 'stop_all_workflows'
  | 'freeze_background'
  | 'lock_encrypted_data'
  | 'disable_network'
  | 'clear_active_sessions'
  | 'pause_all_timers'
  | 'emergency_save'
  | 'full_lockdown'
  | 'restore_normal';

export interface OverrideActionDefinition {
  id: OverrideAction;
  label: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reversible: boolean;
  requiresConfirmation: boolean;
  icon: string;
}

// -----------------------------------------------------------------------------
// OVERRIDE STATE
// -----------------------------------------------------------------------------

export interface OverrideState {
  level: OverrideLevel;
  activeSince: number | null;
  
  // Individual controls
  workflowsRunning: boolean;
  backgroundActive: boolean;
  networkEnabled: boolean;
  encryptedDataLocked: boolean;
  timersActive: boolean;
  
  // History
  lastAction: OverrideAction | null;
  lastActionTime: number | null;
  
  // Panel state
  panelVisible: boolean;
  panelLocked: boolean;  // Requires unlock gesture
}

// -----------------------------------------------------------------------------
// OVERRIDE LOG ENTRY
// -----------------------------------------------------------------------------

export interface OverrideLogEntry {
  id: string;
  timestamp: number;
  action: OverrideAction;
  previousLevel: OverrideLevel;
  newLevel: OverrideLevel;
  reason?: string;
  automatic: boolean;  // Was this triggered automatically?
}

// -----------------------------------------------------------------------------
// ACTION DEFINITIONS
// -----------------------------------------------------------------------------

export const OVERRIDE_ACTIONS: Record<OverrideAction, OverrideActionDefinition> = {
  stop_all_workflows: {
    id: 'stop_all_workflows',
    label: 'Stop All Workflows',
    description: 'Immediately halt all running workflows and automations',
    severity: 'medium',
    reversible: false,
    requiresConfirmation: true,
    icon: 'M6 18L18 6M6 6l12 12',
  },
  freeze_background: {
    id: 'freeze_background',
    label: 'Freeze Background',
    description: 'Suspend all background processes and scheduled tasks',
    severity: 'medium',
    reversible: true,
    requiresConfirmation: false,
    icon: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  lock_encrypted_data: {
    id: 'lock_encrypted_data',
    label: 'Lock Encrypted Data',
    description: 'Immediately lock all encrypted vaults and sensitive data',
    severity: 'high',
    reversible: true,
    requiresConfirmation: true,
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  disable_network: {
    id: 'disable_network',
    label: 'Disable Network',
    description: 'Block all network activity from Dex',
    severity: 'high',
    reversible: true,
    requiresConfirmation: true,
    icon: 'M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3',
  },
  clear_active_sessions: {
    id: 'clear_active_sessions',
    label: 'Clear Sessions',
    description: 'End all active work sessions (data is preserved)',
    severity: 'low',
    reversible: false,
    requiresConfirmation: true,
    icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  },
  pause_all_timers: {
    id: 'pause_all_timers',
    label: 'Pause Timers',
    description: 'Pause all running timers and countdowns',
    severity: 'low',
    reversible: true,
    requiresConfirmation: false,
    icon: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  emergency_save: {
    id: 'emergency_save',
    label: 'Emergency Save',
    description: 'Force save all unsaved data immediately',
    severity: 'low',
    reversible: false,
    requiresConfirmation: false,
    icon: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4',
  },
  full_lockdown: {
    id: 'full_lockdown',
    label: 'Full Lockdown',
    description: 'Activate complete system lockdown - all controls engaged',
    severity: 'critical',
    reversible: true,
    requiresConfirmation: true,
    icon: 'M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01',
  },
  restore_normal: {
    id: 'restore_normal',
    label: 'Restore Normal',
    description: 'Return to normal operation - disable all overrides',
    severity: 'low',
    reversible: false,
    requiresConfirmation: true,
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
};

// -----------------------------------------------------------------------------
// INITIAL STATE
// -----------------------------------------------------------------------------

export const INITIAL_OVERRIDE_STATE: OverrideState = {
  level: 'normal',
  activeSince: null,
  workflowsRunning: true,
  backgroundActive: true,
  networkEnabled: true,
  encryptedDataLocked: false,
  timersActive: true,
  lastAction: null,
  lastActionTime: null,
  panelVisible: false,
  panelLocked: true,
};

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

export function getOverrideLevelFromState(state: OverrideState): OverrideLevel {
  const activeOverrides = [
    !state.workflowsRunning,
    !state.backgroundActive,
    !state.networkEnabled,
    state.encryptedDataLocked,
    !state.timersActive,
  ].filter(Boolean).length;

  if (activeOverrides >= 4) return 'emergency';
  if (activeOverrides >= 2) return 'lockdown';
  if (activeOverrides >= 1) return 'elevated';
  return 'normal';
}

export function getLevelColor(level: OverrideLevel): string {
  switch (level) {
    case 'normal': return 'var(--status-success)';
    case 'elevated': return 'var(--status-warning)';
    case 'lockdown': return 'var(--status-error)';
    case 'emergency': return '#ff0000';
    default: return 'var(--text-secondary)';
  }
}

export function getLevelLabel(level: OverrideLevel): string {
  switch (level) {
    case 'normal': return 'Normal';
    case 'elevated': return 'Elevated';
    case 'lockdown': return 'Lockdown';
    case 'emergency': return 'Emergency';
    default: return 'Unknown';
  }
}
