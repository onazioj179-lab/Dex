// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 34: Override Panel Store
// Emergency control system state management
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  OverrideState,
  OverrideAction,
  OverrideLevel,
  OverrideLogEntry,
} from '../../shared/overrideTypes';
import { 
  INITIAL_OVERRIDE_STATE, 
  getOverrideLevelFromState,
  OVERRIDE_ACTIONS 
} from '../../shared/overrideTypes';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

interface OverrideStore extends OverrideState {
  // Log
  log: OverrideLogEntry[];
  
  // Panel controls
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  unlockPanel: () => void;
  lockPanel: () => void;
  
  // Override actions
  executeAction: (action: OverrideAction, reason?: string) => void;
  
  // Individual controls
  setWorkflowsRunning: (running: boolean) => void;
  setBackgroundActive: (active: boolean) => void;
  setNetworkEnabled: (enabled: boolean) => void;
  setEncryptedDataLocked: (locked: boolean) => void;
  setTimersActive: (active: boolean) => void;
  
  // Quick actions
  stopAllWorkflows: () => void;
  freezeBackground: () => void;
  lockEncryptedData: () => void;
  disableNetwork: () => void;
  pauseAllTimers: () => void;
  emergencySave: () => void;
  fullLockdown: () => void;
  restoreNormal: () => void;
  
  // Status
  getLevel: () => OverrideLevel;
  isElevated: () => boolean;
  isLockdown: () => boolean;
  isEmergency: () => boolean;
  
  // Log queries
  getRecentLog: (limit?: number) => OverrideLogEntry[];
  clearLog: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

export const useOverridePanel = create<OverrideStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...INITIAL_OVERRIDE_STATE,
      log: [],

      // ─────────────────────────────────────────────────────────────────────
      // Panel controls
      // ─────────────────────────────────────────────────────────────────────

      showPanel: () => set({ panelVisible: true }),
      hidePanel: () => set({ panelVisible: false }),
      togglePanel: () => set(state => ({ panelVisible: !state.panelVisible })),
      unlockPanel: () => set({ panelLocked: false }),
      lockPanel: () => set({ panelLocked: true }),

      // ─────────────────────────────────────────────────────────────────────
      // Execute action
      // ─────────────────────────────────────────────────────────────────────

      executeAction: (action, reason) => {
        const state = get();
        const previousLevel = state.level;
        const now = Date.now();

        // Create log entry
        const logEntry: OverrideLogEntry = {
          id: generateId(),
          timestamp: now,
          action,
          previousLevel,
          newLevel: previousLevel, // Will be updated
          reason,
          automatic: false,
        };

        // Execute based on action
        switch (action) {
          case 'stop_all_workflows':
            set({ workflowsRunning: false });
            break;
          case 'freeze_background':
            set({ backgroundActive: false });
            break;
          case 'lock_encrypted_data':
            set({ encryptedDataLocked: true });
            break;
          case 'disable_network':
            set({ networkEnabled: false });
            break;
          case 'pause_all_timers':
            set({ timersActive: false });
            break;
          case 'emergency_save':
            // Trigger save via IPC
            window.dex?.session?.save?.();
            break;
          case 'full_lockdown':
            set({
              workflowsRunning: false,
              backgroundActive: false,
              networkEnabled: false,
              encryptedDataLocked: true,
              timersActive: false,
            });
            break;
          case 'restore_normal':
            set({
              workflowsRunning: true,
              backgroundActive: true,
              networkEnabled: true,
              encryptedDataLocked: false,
              timersActive: true,
            });
            break;
          case 'clear_active_sessions':
            // Clear sessions via IPC
            window.dex?.session?.clear?.();
            break;
        }

        // Update level and log
        const newState = get();
        const newLevel = getOverrideLevelFromState(newState);
        logEntry.newLevel = newLevel;

        set({
          level: newLevel,
          activeSince: newLevel !== 'normal' ? (state.activeSince || now) : null,
          lastAction: action,
          lastActionTime: now,
          log: [...state.log, logEntry],
        });

        // Notify main process
        window.dex?.override?.execute?.(action, reason);
      },

      // ─────────────────────────────────────────────────────────────────────
      // Individual controls
      // ─────────────────────────────────────────────────────────────────────

      setWorkflowsRunning: (running) => {
        set({ workflowsRunning: running });
        const newLevel = getOverrideLevelFromState(get());
        set({ level: newLevel });
      },

      setBackgroundActive: (active) => {
        set({ backgroundActive: active });
        const newLevel = getOverrideLevelFromState(get());
        set({ level: newLevel });
      },

      setNetworkEnabled: (enabled) => {
        set({ networkEnabled: enabled });
        const newLevel = getOverrideLevelFromState(get());
        set({ level: newLevel });
      },

      setEncryptedDataLocked: (locked) => {
        set({ encryptedDataLocked: locked });
        const newLevel = getOverrideLevelFromState(get());
        set({ level: newLevel });
      },

      setTimersActive: (active) => {
        set({ timersActive: active });
        const newLevel = getOverrideLevelFromState(get());
        set({ level: newLevel });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Quick actions
      // ─────────────────────────────────────────────────────────────────────

      stopAllWorkflows: () => get().executeAction('stop_all_workflows'),
      freezeBackground: () => get().executeAction('freeze_background'),
      lockEncryptedData: () => get().executeAction('lock_encrypted_data'),
      disableNetwork: () => get().executeAction('disable_network'),
      pauseAllTimers: () => get().executeAction('pause_all_timers'),
      emergencySave: () => get().executeAction('emergency_save'),
      fullLockdown: () => get().executeAction('full_lockdown'),
      restoreNormal: () => get().executeAction('restore_normal'),

      // ─────────────────────────────────────────────────────────────────────
      // Status queries
      // ─────────────────────────────────────────────────────────────────────

      getLevel: () => get().level,
      isElevated: () => get().level !== 'normal',
      isLockdown: () => get().level === 'lockdown' || get().level === 'emergency',
      isEmergency: () => get().level === 'emergency',

      // ─────────────────────────────────────────────────────────────────────
      // Log queries
      // ─────────────────────────────────────────────────────────────────────

      getRecentLog: (limit = 50) => {
        return get().log.slice(-limit).reverse();
      },

      clearLog: () => set({ log: [] }),
    }),
    {
      name: 'dex-override-panel',
      partialize: (state) => ({
        level: state.level,
        activeSince: state.activeSince,
        workflowsRunning: state.workflowsRunning,
        backgroundActive: state.backgroundActive,
        networkEnabled: state.networkEnabled,
        encryptedDataLocked: state.encryptedDataLocked,
        timersActive: state.timersActive,
        lastAction: state.lastAction,
        lastActionTime: state.lastActionTime,
        log: state.log.slice(-100), // Keep last 100 entries
      }),
    }
  )
);
