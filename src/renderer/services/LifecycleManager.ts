// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- App Lifecycle Manager
 * ===========================================================================
 * 
 * System-governed lifecycle management for all sub-apps.
 * Apps do not manage their own lifecycle - the system controls:
 * - Foreground / Background / Suspended / Terminated states
 * - Resource allocation and deallocation
 * - State preservation and restoration
 * - Memory pressure handling
 * 
 * Rules:
 * - Background apps do zero CPU work
 * - Suspended apps keep state only
 * - Resume is instant
 * - Termination is clean and explicit
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePowerService, useSystemEvents } from './SystemServices';

// ===========================================================================
// TYPE DEFINITIONS
// ===========================================================================

/** Detailed app lifecycle state */
export type LifecycleState = 
  | 'initial'      // App registered but never launched
  | 'launching'    // App is loading/initializing
  | 'foreground'   // App is active and visible
  | 'background'   // App is running but not visible
  | 'suspended'    // App state preserved, no CPU
  | 'terminating'  // App is shutting down
  | 'terminated'   // App is fully closed
  | 'crashed';     // App crashed unexpectedly

/** Detailed functional state for UI */
export type FunctionalState =
  | 'initial'           // Not yet started
  | 'loading'           // Real loading in progress
  | 'active'            // Fully operational
  | 'background'        // Running but not focused
  | 'suspended'         // Memory preserved, no activity
  | 'error'             // Recoverable error state
  | 'permission-denied' // Missing required permission
  | 'offline';          // Network required but unavailable

/** App process metadata */
export interface AppProcess {
  instanceId: string;
  appId: string;
  
  // Lifecycle
  lifecycleState: LifecycleState;
  functionalState: FunctionalState;
  
  // Timing
  createdAt: number;
  launchedAt: number | null;
  lastActiveAt: number;
  suspendedAt: number | null;
  terminatedAt: number | null;
  
  // State preservation
  preservedState: Record<string, unknown>;
  stateVersion: number;
  
  // Error tracking
  lastError: {
    code: string;
    message: string;
    timestamp: number;
    recoverable: boolean;
  } | null;
  crashCount: number;
  
  // Navigation
  navigationStack: string[];
  navigationIndex: number;
  currentRoute: string;
  
  // Window
  windowId: string | null;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  isMinimized: boolean;
  isMaximized: boolean;
  
  // Resources
  resourceBudgetId: string | null;
}

/** Lifecycle transition */
export interface LifecycleTransition {
  id: string;
  instanceId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  reason: string;
  timestamp: number;
  duration: number;
}

/** Memory pressure levels */
export type MemoryPressure = 'normal' | 'moderate' | 'critical';

// ===========================================================================
// LIFECYCLE MANAGER STORE
// ===========================================================================

interface LifecycleManagerState {
  // Process registry
  processes: Map<string, AppProcess>;
  
  // Active process tracking
  foregroundProcessId: string | null;
  backgroundProcessIds: Set<string>;
  suspendedProcessIds: Set<string>;
  
  // Memory management
  memoryPressure: MemoryPressure;
  maxProcesses: number;
  
  // Transition history
  transitions: LifecycleTransition[];
  
  // -------------------------------------------------------------------------
  // Process Lifecycle Actions
  // -------------------------------------------------------------------------
  
  /** Create a new app process */
  createProcess: (appId: string, initialRoute?: string) => AppProcess;
  
  /** Launch a process (initial arrow-right launching arrow-right foreground) */
  launchProcess: (instanceId: string) => Promise<boolean>;
  
  /** Bring process to foreground */
  foregroundProcess: (instanceId: string) => void;
  
  /** Send process to background */
  backgroundProcess: (instanceId: string) => void;
  
  /** Suspend process (preserve state, release resources) */
  suspendProcess: (instanceId: string) => void;
  
  /** Resume suspended process */
  resumeProcess: (instanceId: string) => void;
  
  /** Terminate process cleanly */
  terminateProcess: (instanceId: string, reason?: string) => void;
  
  /** Handle crash recovery */
  handleCrash: (instanceId: string, error: AppProcess['lastError']) => void;
  
  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------
  
  /** Update functional state */
  setFunctionalState: (instanceId: string, state: FunctionalState) => void;
  
  /** Save app state for preservation */
  preserveState: (instanceId: string, state: Record<string, unknown>) => void;
  
  /** Restore preserved state */
  restoreState: (instanceId: string) => Record<string, unknown> | null;
  
  /** Clear preserved state */
  clearPreservedState: (instanceId: string) => void;
  
  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  
  /** Navigate within app */
  navigate: (instanceId: string, route: string) => void;
  
  /** Go back in navigation stack */
  goBack: (instanceId: string) => boolean;
  
  /** Go forward in navigation stack */
  goForward: (instanceId: string) => boolean;
  
  /** Can go back? */
  canGoBack: (instanceId: string) => boolean;
  
  /** Can go forward? */
  canGoForward: (instanceId: string) => boolean;
  
  // -------------------------------------------------------------------------
  // Window Management
  // -------------------------------------------------------------------------
  
  /** Update window bounds */
  updateWindowBounds: (instanceId: string, bounds: AppProcess['windowBounds']) => void;
  
  /** Set minimized state */
  setMinimized: (instanceId: string, minimized: boolean) => void;
  
  /** Set maximized state */
  setMaximized: (instanceId: string, maximized: boolean) => void;
  
  // -------------------------------------------------------------------------
  // Memory Management
  // -------------------------------------------------------------------------
  
  /** Set memory pressure level */
  setMemoryPressure: (level: MemoryPressure) => void;
  
  /** Handle memory pressure (suspend least recently used) */
  handleMemoryPressure: () => void;
  
  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  
  /** Get process by instance ID */
  getProcess: (instanceId: string) => AppProcess | undefined;
  
  /** Get foreground process */
  getForegroundProcess: () => AppProcess | undefined;
  
  /** Get all processes for an app */
  getProcessesByApp: (appId: string) => AppProcess[];
  
  /** Get all active processes */
  getActiveProcesses: () => AppProcess[];
  
  /** Get process count */
  getProcessCount: () => number;
}

import { generateId } from '../../shared/util/id';

export const useLifecycleManager = create<LifecycleManagerState>()(
  persist(
    (set, get) => ({
      processes: new Map(),
      foregroundProcessId: null,
      backgroundProcessIds: new Set(),
      suspendedProcessIds: new Set(),
      memoryPressure: 'normal',
      maxProcesses: 20,
      transitions: [],

      // ---------------------------------------------------------------------
      // Process Lifecycle
      // ---------------------------------------------------------------------

      createProcess: (appId, initialRoute = '/') => {
        const now = Date.now();
        const instanceId = `${appId}-${generateId()}`;
        
        const process: AppProcess = {
          instanceId,
          appId,
          lifecycleState: 'initial',
          functionalState: 'initial',
          createdAt: now,
          launchedAt: null,
          lastActiveAt: now,
          suspendedAt: null,
          terminatedAt: null,
          preservedState: {},
          stateVersion: 0,
          lastError: null,
          crashCount: 0,
          navigationStack: [initialRoute],
          navigationIndex: 0,
          currentRoute: initialRoute,
          windowId: null,
          windowBounds: null,
          isMinimized: false,
          isMaximized: false,
          resourceBudgetId: null,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, process);
          return { processes: newProcesses };
        });

        useSystemEvents.getState().emit({
          type: 'app_launch',
          appId,
          instanceId,
          data: { state: 'created' },
          severity: 'info',
        });

        return process;
      },

      launchProcess: async (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process) return false;

        const now = Date.now();
        
        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: process.lifecycleState,
          toState: 'launching',
          reason: 'User initiated launch',
          timestamp: now,
          duration: 0,
        };

        // Update to launching
        process.lifecycleState = 'launching';
        process.functionalState = 'loading';
        
        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          return { 
            processes: newProcesses,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });

        // Allocate resources
        const budget = usePowerService.getState().allocateBudget(process.appId, instanceId);
        process.resourceBudgetId = budget.instanceId;

        // Complete launch
        const launchDuration = Date.now() - now;
        transition.duration = launchDuration;
        transition.toState = 'foreground';

        process.lifecycleState = 'foreground';
        process.functionalState = 'active';
        process.launchedAt = Date.now();
        process.lastActiveAt = Date.now();

        // Background current foreground
        const currentForeground = state.foregroundProcessId;
        if (currentForeground && currentForeground !== instanceId) {
          get().backgroundProcess(currentForeground);
        }

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          return {
            processes: newProcesses,
            foregroundProcessId: instanceId,
          };
        });

        useSystemEvents.getState().emit({
          type: 'app_launch',
          appId: process.appId,
          instanceId,
          data: { state: 'launched', duration: launchDuration },
          severity: 'info',
        });

        return true;
      },

      foregroundProcess: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.lifecycleState === 'terminated') return;

        const now = Date.now();

        // Background current foreground
        if (state.foregroundProcessId && state.foregroundProcessId !== instanceId) {
          get().backgroundProcess(state.foregroundProcessId);
        }

        // Resume if suspended
        if (process.lifecycleState === 'suspended') {
          process.suspendedAt = null;
          usePowerService.getState().allocateBudget(process.appId, instanceId);
        }

        const previousState = process.lifecycleState;
        process.lifecycleState = 'foreground';
        process.functionalState = 'active';
        process.lastActiveAt = now;

        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: previousState,
          toState: 'foreground',
          reason: 'Brought to foreground',
          timestamp: now,
          duration: 0,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          
          const newBackground = new Set(state.backgroundProcessIds);
          newBackground.delete(instanceId);
          
          const newSuspended = new Set(state.suspendedProcessIds);
          newSuspended.delete(instanceId);

          return {
            processes: newProcesses,
            foregroundProcessId: instanceId,
            backgroundProcessIds: newBackground,
            suspendedProcessIds: newSuspended,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });
      },

      backgroundProcess: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.lifecycleState === 'terminated') return;

        const previousState = process.lifecycleState;
        process.lifecycleState = 'background';
        process.functionalState = 'background';
        process.lastActiveAt = Date.now();

        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: previousState,
          toState: 'background',
          reason: 'Sent to background',
          timestamp: Date.now(),
          duration: 0,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          
          const newBackground = new Set(state.backgroundProcessIds);
          newBackground.add(instanceId);

          return {
            processes: newProcesses,
            foregroundProcessId: state.foregroundProcessId === instanceId 
              ? null 
              : state.foregroundProcessId,
            backgroundProcessIds: newBackground,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });
      },

      suspendProcess: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.lifecycleState === 'terminated') return;

        const now = Date.now();
        const previousState = process.lifecycleState;
        
        process.lifecycleState = 'suspended';
        process.functionalState = 'suspended';
        process.suspendedAt = now;

        // Release resource budget
        usePowerService.getState().releaseBudget(instanceId);
        process.resourceBudgetId = null;

        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: previousState,
          toState: 'suspended',
          reason: 'Memory pressure or user action',
          timestamp: now,
          duration: 0,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          
          const newBackground = new Set(state.backgroundProcessIds);
          newBackground.delete(instanceId);
          
          const newSuspended = new Set(state.suspendedProcessIds);
          newSuspended.add(instanceId);

          return {
            processes: newProcesses,
            foregroundProcessId: state.foregroundProcessId === instanceId 
              ? null 
              : state.foregroundProcessId,
            backgroundProcessIds: newBackground,
            suspendedProcessIds: newSuspended,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });
      },

      resumeProcess: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.lifecycleState !== 'suspended') return;

        const previousState = process.lifecycleState;
        process.lifecycleState = 'background';
        process.functionalState = 'background';
        process.suspendedAt = null;

        // Re-allocate resources
        const budget = usePowerService.getState().allocateBudget(process.appId, instanceId);
        process.resourceBudgetId = budget.instanceId;

        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: previousState,
          toState: 'background',
          reason: 'Resumed from suspension',
          timestamp: Date.now(),
          duration: 0,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process });
          
          const newSuspended = new Set(state.suspendedProcessIds);
          newSuspended.delete(instanceId);
          
          const newBackground = new Set(state.backgroundProcessIds);
          newBackground.add(instanceId);

          return {
            processes: newProcesses,
            suspendedProcessIds: newSuspended,
            backgroundProcessIds: newBackground,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });
      },

      terminateProcess: (instanceId, reason = 'User closed app') => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process) return;

        const now = Date.now();
        const previousState = process.lifecycleState;

        process.lifecycleState = 'terminating';
        process.functionalState = 'initial';

        // Release resources
        usePowerService.getState().releaseBudget(instanceId);
        process.resourceBudgetId = null;

        // Complete termination
        process.lifecycleState = 'terminated';
        process.terminatedAt = now;

        // Record transition
        const transition: LifecycleTransition = {
          id: generateId(),
          instanceId,
          fromState: previousState,
          toState: 'terminated',
          reason,
          timestamp: now,
          duration: 0,
        };

        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.delete(instanceId); // Remove terminated processes
          
          const newBackground = new Set(state.backgroundProcessIds);
          newBackground.delete(instanceId);
          
          const newSuspended = new Set(state.suspendedProcessIds);
          newSuspended.delete(instanceId);

          // Find new foreground if needed
          let newForeground = state.foregroundProcessId;
          if (newForeground === instanceId) {
            const remaining = Array.from(newProcesses.values())
              .filter(p => p.lifecycleState !== 'terminated')
              .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
            newForeground = remaining[0]?.instanceId || null;
            
            if (newForeground) {
              const nextProcess = newProcesses.get(newForeground);
              if (nextProcess) {
                nextProcess.lifecycleState = 'foreground';
                nextProcess.functionalState = 'active';
                newProcesses.set(newForeground, { ...nextProcess });
              }
            }
          }

          return {
            processes: newProcesses,
            foregroundProcessId: newForeground,
            backgroundProcessIds: newBackground,
            suspendedProcessIds: newSuspended,
            transitions: [...state.transitions.slice(-99), transition],
          };
        });

        useSystemEvents.getState().emit({
          type: 'app_close',
          appId: process.appId,
          instanceId,
          data: { reason },
          severity: 'info',
        });
      },

      handleCrash: (instanceId, error) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process) return;

        process.crashCount++;
        process.lastError = error;

        if (process.crashCount >= 3 || !error?.recoverable) {
          // Too many crashes, terminate
          process.lifecycleState = 'crashed';
          get().terminateProcess(instanceId, `Crashed: ${error?.message || 'Unknown error'}`);
          
          useSystemEvents.getState().emit({
            type: 'crash_recovery',
            appId: process.appId,
            instanceId,
            data: { error, crashCount: process.crashCount, action: 'terminated' },
            severity: 'critical',
          });
        } else {
          // Attempt recovery
          process.lifecycleState = 'background';
          process.functionalState = 'error';
          
          set(state => {
            const newProcesses = new Map(state.processes);
            newProcesses.set(instanceId, { ...process });
            return { processes: newProcesses };
          });

          useSystemEvents.getState().emit({
            type: 'crash_recovery',
            appId: process.appId,
            instanceId,
            data: { error, crashCount: process.crashCount, action: 'recovered' },
            severity: 'error',
          });
        }
      },

      // ---------------------------------------------------------------------
      // State Management
      // ---------------------------------------------------------------------

      setFunctionalState: (instanceId, functionalState) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process, functionalState });
          return { processes: newProcesses };
        });
      },

      preserveState: (instanceId, appState) => {
        try {
          set(state => {
            const process = state.processes.get(instanceId);
            if (!process) return state;

            const newProcesses = new Map(state.processes);
            newProcesses.set(instanceId, {
              ...process,
              preservedState: { ...process.preservedState, ...appState },
              stateVersion: process.stateVersion + 1,
            });
            return { processes: newProcesses };
          });
        } catch (err) {
          console.error(`[LifecycleManager] preserveState failed for ${instanceId}:`, err);
        }
      },

      restoreState: (instanceId) => {
        const process = get().processes.get(instanceId);
        return process?.preservedState || null;
      },

      clearPreservedState: (instanceId) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, {
            ...process,
            preservedState: {},
            stateVersion: 0,
          });
          return { processes: newProcesses };
        });
      },

      // ---------------------------------------------------------------------
      // Navigation
      // ---------------------------------------------------------------------

      navigate: (instanceId, route) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newStack = process.navigationStack.slice(0, process.navigationIndex + 1);
          newStack.push(route);

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, {
            ...process,
            navigationStack: newStack,
            navigationIndex: newStack.length - 1,
            currentRoute: route,
          });
          return { processes: newProcesses };
        });
      },

      goBack: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.navigationIndex <= 0) return false;

        const newIndex = process.navigationIndex - 1;
        
        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, {
            ...process,
            navigationIndex: newIndex,
            currentRoute: process.navigationStack[newIndex],
          });
          return { processes: newProcesses };
        });

        return true;
      },

      goForward: (instanceId) => {
        const state = get();
        const process = state.processes.get(instanceId);
        if (!process || process.navigationIndex >= process.navigationStack.length - 1) {
          return false;
        }

        const newIndex = process.navigationIndex + 1;
        
        set(state => {
          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, {
            ...process,
            navigationIndex: newIndex,
            currentRoute: process.navigationStack[newIndex],
          });
          return { processes: newProcesses };
        });

        return true;
      },

      canGoBack: (instanceId) => {
        const process = get().processes.get(instanceId);
        return process ? process.navigationIndex > 0 : false;
      },

      canGoForward: (instanceId) => {
        const process = get().processes.get(instanceId);
        return process 
          ? process.navigationIndex < process.navigationStack.length - 1 
          : false;
      },

      // ---------------------------------------------------------------------
      // Window Management
      // ---------------------------------------------------------------------

      updateWindowBounds: (instanceId, bounds) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process, windowBounds: bounds });
          return { processes: newProcesses };
        });
      },

      setMinimized: (instanceId, minimized) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process, isMinimized: minimized });
          return { processes: newProcesses };
        });

        if (minimized) {
          get().backgroundProcess(instanceId);
        }
      },

      setMaximized: (instanceId, maximized) => {
        set(state => {
          const process = state.processes.get(instanceId);
          if (!process) return state;

          const newProcesses = new Map(state.processes);
          newProcesses.set(instanceId, { ...process, isMaximized: maximized });
          return { processes: newProcesses };
        });
      },

      // ---------------------------------------------------------------------
      // Memory Management
      // ---------------------------------------------------------------------

      setMemoryPressure: (level) => {
        set({ memoryPressure: level });
        
        if (level === 'critical') {
          get().handleMemoryPressure();
        }
      },

      handleMemoryPressure: () => {
        const state = get();
        
        // Sort background processes by last active time
        const toSuspend = Array.from(state.backgroundProcessIds)
          .map(id => state.processes.get(id))
          .filter((p): p is AppProcess => !!p)
          .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

        // Suspend oldest background processes
        const suspendCount = Math.ceil(toSuspend.length / 2);
        toSuspend.slice(0, suspendCount).forEach(process => {
          get().suspendProcess(process.instanceId);
        });
      },

      // ---------------------------------------------------------------------
      // Queries
      // ---------------------------------------------------------------------

      getProcess: (instanceId) => {
        return get().processes.get(instanceId);
      },

      getForegroundProcess: () => {
        const state = get();
        return state.foregroundProcessId 
          ? state.processes.get(state.foregroundProcessId) 
          : undefined;
      },

      getProcessesByApp: (appId) => {
        return Array.from(get().processes.values())
          .filter(p => p.appId === appId && p.lifecycleState !== 'terminated');
      },

      getActiveProcesses: () => {
        return Array.from(get().processes.values())
          .filter(p => p.lifecycleState !== 'terminated');
      },

      getProcessCount: () => {
        return Array.from(get().processes.values())
          .filter(p => p.lifecycleState !== 'terminated')
          .length;
      },
    }),
    {
      name: 'dex-lifecycle',
      partialize: (state) => ({
        // Only persist essential state for quick restore
        processes: Array.from(state.processes.entries()).filter(
          ([, p]) => p.lifecycleState !== 'terminated'
        ),
      }),
      onRehydrateStorage: () => (state) => {
        // Restore processes Map from array
        if (state && Array.isArray(state.processes)) {
          state.processes = new Map(state.processes as [string, AppProcess][]);
        }
      },
    }
  )
);

// ===========================================================================
// CONVENIENCE HOOKS
// ===========================================================================

/** Get the current foreground process */
export const useForegroundProcess = () => {
  return useLifecycleManager(state => {
    if (!state.foregroundProcessId) return null;
    return state.processes.get(state.foregroundProcessId) || null;
  });
};

/** Get all active processes */
export const useActiveProcesses = () => {
  return useLifecycleManager(state => 
    Array.from(state.processes.values())
      .filter(p => p.lifecycleState !== 'terminated')
  );
};

/** Get process by instance ID */
export const useProcess = (instanceId: string) => {
  return useLifecycleManager(state => state.processes.get(instanceId));
};

/** Get memory pressure level */
export const useMemoryPressure = () => {
  return useLifecycleManager(state => state.memoryPressure);
};
