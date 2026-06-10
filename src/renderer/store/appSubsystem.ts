/**
 * ===========================================================================
 * DEX -- Inner App Subsystem
 * ===========================================================================
 *
 * Native OS-grade application framework for inner apps.
 * Apps are first-class citizens with real lifecycle, state, and isolation.
 * No mocks. No placeholders. No fake states.
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { useRunningApps } from './runningApps';

// ===========================================================================
// TYPES -- App Definition & State
// ===========================================================================

/** App lifecycle states */
export type AppState = 'active' | 'background' | 'suspended' | 'terminated';

/** Permission types for apps */
export type AppPermission = 
  | 'filesystem.read'
  | 'filesystem.write'
  | 'filesystem.delete'
  | 'network.fetch'
  | 'network.socket'
  | 'clipboard.read'
  | 'clipboard.write'
  | 'notifications'
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'system.info';

/** App definition - static metadata */
export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  version: string;
  permissions: AppPermission[];
  singleton: boolean; // Can only have one instance
  supportsMultiWindow: boolean;
  category: 'productivity' | 'media' | 'utility' | 'system' | 'development' | 'creative';
}

/** App instance - runtime state */
export interface AppInstance {
  instanceId: string;
  appId: string;
  state: AppState;
  windowId: string | null;
  
  // Navigation state
  navigationStack: string[];
  navigationIndex: number;
  currentPath: string;
  
  // Runtime data
  launchedAt: number;
  lastActiveAt: number;
  suspendedAt: number | null;
  
  // Memory/resource tracking
  memoryUsageMB: number;
  cpuUsagePercent: number;
  
  // State persistence
  savedState: Record<string, unknown>;
  
  // Permissions granted at runtime
  grantedPermissions: AppPermission[];
  revokedPermissions: AppPermission[];
}

/** Intent for app-to-app communication */
export interface AppIntent {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
}

/** Work session tracking */
export interface WorkSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  activeAppId: string;
  appSequence: Array<{
    appId: string;
    instanceId: string;
    startedAt: number;
    endedAt: number | null;
    duration: number;
  }>;
  filesAccessed: string[];
  actionsPerformed: string[];
  taskContext: string | null;
}

// ===========================================================================
// APP REGISTRY -- Static App Definitions
// ===========================================================================

const APP_VERSION = '3.6.0';

export const APP_REGISTRY: AppDefinition[] = [
  // -------------------------------------------------------------------------
  // System Apps
  // -------------------------------------------------------------------------
  {
    id: 'home',
    name: 'Home',
    icon: 'home',
    color: 'var(--color-text-primary)',
    description: 'DEX home desktop',
    version: APP_VERSION,
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },

  {
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    color: 'var(--color-text-tertiary)',
    description: 'System preferences',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'system.info'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },
  {
    id: 'search',
    name: 'Search',
    icon: 'search',
    color: '#007aff',
    description: 'Universal search across all apps',
    version: APP_VERSION,
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },
  
  // -------------------------------------------------------------------------
  // Productivity Apps
  // -------------------------------------------------------------------------
  {
    id: 'files',
    name: 'Files',
    icon: 'folder',
    color: '#007aff',
    description: 'File manager with built-in protection',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'filesystem.delete'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'productivity',
  },
  {
    id: 'uki',
    name: 'uki',
    icon: 'sparkle',
    color: 'var(--color-accent)',
    description: 'AI assistant with persistent conversation history',
    version: APP_VERSION,
    permissions: ['network.fetch', 'clipboard.read', 'clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: 'note',
    color: '#ffcc00',
    description: 'Rich text notes with secure storage',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.read', 'clipboard.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'productivity',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: 'check',
    color: 'var(--color-success)',
    description: 'Task management with priorities',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'notifications'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
  {
    id: 'browser',
    name: 'Browser',
    icon: 'globe',
    color: '#5856d6',
    description: 'Secure browsing with tracking protection',
    version: APP_VERSION,
    permissions: ['network.fetch', 'network.socket', 'clipboard.read', 'clipboard.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'productivity',
  },
  {
    id: 'transfers',
    name: 'Share',
    icon: 'share',
    color: '#10b981',
    description: 'File transfers and sharing',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'network.fetch'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    icon: 'calendar',
    color: 'var(--color-error)',
    description: 'Event scheduling and reminders',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'notifications'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
  {
    id: 'workflows',
    name: 'Workflows',
    icon: 'workflow',
    color: '#ff9500',
    description: 'Automation workflows',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'notifications'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  
  // -------------------------------------------------------------------------
  // Media Apps
  // -------------------------------------------------------------------------
  {
    id: 'gallery',
    name: 'Gallery',
    icon: 'image',
    color: '#ff2d55',
    description: 'Photo and image library',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'media',
  },
  {
    id: 'audio',
    name: 'Music',
    icon: 'music',
    color: 'var(--color-error)',
    description: 'Audio player and library',
    version: APP_VERSION,
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'media',
  },
  {
    id: 'video',
    name: 'Video',
    icon: 'video',
    color: '#af52de',
    description: 'Video player and library',
    version: APP_VERSION,
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'media',
  },
  
  // -------------------------------------------------------------------------
  // Utility Apps
  // -------------------------------------------------------------------------
  {
    id: 'power',
    name: 'Power',
    icon: 'power',
    color: 'var(--color-success)',
    description: 'Power management and optimization',
    version: APP_VERSION,
    permissions: ['system.info'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  {
    id: 'vault',
    name: 'Vault',
    icon: 'lock',
    color: '#007aff',
    description: 'Secure password and secrets vault',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    icon: 'calculator',
    color: 'var(--color-text-tertiary)',
    description: 'Scientific calculator',
    version: APP_VERSION,
    permissions: ['clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  {
    id: 'passwordgenerator',
    name: 'Password Gen',
    icon: 'lock',
    color: '#007aff',
    description: 'Secure password generator',
    version: APP_VERSION,
    permissions: ['clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  
  // -------------------------------------------------------------------------
  // Development Apps
  // -------------------------------------------------------------------------
  {
    id: 'code',
    name: 'Code',
    icon: 'code',
    color: '#af52de',
    description: 'Code editor with syntax highlighting',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.read', 'clipboard.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'development',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: 'terminal',
    color: 'var(--color-text-tertiary)',
    description: 'Command line interface',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'system.info'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'development',
  },
  
  // -------------------------------------------------------------------------
  // DEX Creative Suite
  // -------------------------------------------------------------------------
  {
    id: 'videoeditor',
    name: 'VINX',
    icon: 'videoeditor',
    color: '#8b5cf6',
    description: 'Professional video editor',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  {
    id: 'imosion',
    name: 'Imosion',
    icon: 'imosion',
    color: '#f97316',
    description: 'Professional audio workstation and DAW',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  {
    id: 'prism',
    name: 'PRISM',
    icon: 'prism',
    color: '#06b6d4',
    description: 'Professional photo editing and enhancement',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  {
    id: 'flux',
    name: 'FLUX',
    icon: 'flux',
    color: '#3b82f6',
    description: 'Motion graphics and visual effects',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write', 'microphone'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  {
    id: 'forge',
    name: 'FORGE',
    icon: 'forge',
    color: '#f59e0b',
    description: 'Batch media encoding and conversion',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  
  // -------------------------------------------------------------------------
  // AXL Engineering
  // -------------------------------------------------------------------------
  {
    id: 'axl',
    name: 'AXL',
    icon: 'axl',
    color: 'var(--color-accent)',
    description: 'Professional CAD & engineering design studio',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'creative',
  },
  
  // -------------------------------------------------------------------------
  // DEX Rewind
  // -------------------------------------------------------------------------
  {
    id: 'rewind',
    name: 'Rewind',
    icon: 'rewind',
    color: '#0078d4',
    description: 'Activity logger and search -- DVR for your desktop day',
    version: APP_VERSION,
    permissions: ['filesystem.read', 'clipboard.read', 'system.info'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  
  // -------------------------------------------------------------------------
  // Collab Hub
  // -------------------------------------------------------------------------
  {
    id: 'collabhub',
    name: 'Collab Hub',
    icon: 'collabhub',
    color: '#5e5ce6',
    description: 'Real-time collaboration for creative projects with sharing, chat, and checkpoints',
    version: '3.6.0',
    permissions: ['network.fetch', 'network.socket', 'notifications'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
];

APP_REGISTRY.forEach(app => {
  app.version = APP_VERSION;
});

// ===========================================================================
// APP SUBSYSTEM STORE
// ===========================================================================

interface AppSubsystemState {
  // Active app instances
  instances: Map<string, AppInstance>;
  
  // Currently focused app
  activeInstanceId: string | null;
  
  // App-to-app intents
  pendingIntents: AppIntent[];
  
  // Work session tracking
  currentWorkSession: WorkSession | null;
  workSessionHistory: WorkSession[];
  
  // Permission grants (persisted)
  permissionGrants: Record<string, AppPermission[]>;
  
  // Performance budgets
  totalMemoryLimitMB: number;
  totalCpuLimitPercent: number;
  
  // Actions
  launchApp: (appId: string, initialPath?: string, windowId?: string) => AppInstance | null;
  closeApp: (instanceId: string) => void;
  focusApp: (instanceId: string) => void;
  suspendApp: (instanceId: string) => void;
  resumeApp: (instanceId: string) => void;
  
  // Navigation
  navigateInApp: (instanceId: string, path: string) => void;
  goBackInApp: (instanceId: string) => boolean;
  goForwardInApp: (instanceId: string) => boolean;
  
  // State persistence
  saveAppState: (instanceId: string, state: Record<string, unknown>) => void;
  getAppState: (instanceId: string) => Record<string, unknown> | null;
  
  // Permissions
  requestPermission: (instanceId: string, permission: AppPermission) => boolean;
  revokePermission: (instanceId: string, permission: AppPermission) => void;
  hasPermission: (instanceId: string, permission: AppPermission) => boolean;
  
  // Intents
  sendIntent: (sourceInstanceId: string, targetAppId: string, action: string, data: Record<string, unknown>) => string;
  acceptIntent: (intentId: string) => void;
  rejectIntent: (intentId: string) => void;
  
  // Work session
  startWorkSession: () => void;
  endWorkSession: () => void;
  recordFileAccess: (filePath: string) => void;
  recordAction: (action: string) => void;
  
  // Utilities
  getAppDefinition: (appId: string) => AppDefinition | undefined;
  getInstancesByAppId: (appId: string) => AppInstance[];
  getActiveInstance: () => AppInstance | null;
  getAllActiveInstances: () => AppInstance[];
}

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useAppSubsystem = create<AppSubsystemState>()(
  persist(
    (set, get) => ({
      instances: new Map(),
      activeInstanceId: null,
      pendingIntents: [],
      currentWorkSession: null,
      workSessionHistory: [],
      permissionGrants: {},
      totalMemoryLimitMB: 512,
      totalCpuLimitPercent: 50,

      // ---------------------------------------------------------------------
      // App Lifecycle
      // ---------------------------------------------------------------------

      launchApp: (appId, initialPath = '/', windowId: string | null = null) => {
        const definition = APP_REGISTRY.find(a => a.id === appId);
        if (!definition) {
          return null;
        }

        const state = get();
        
        // Check singleton constraint
        if (definition.singleton) {
          const existing = Array.from(state.instances.values())
            .find(i => i.appId === appId && i.state !== 'terminated');
          if (existing) {
            // Focus existing instance instead
            get().focusApp(existing.instanceId);
            return existing;
          }
        }

        const instanceId = `${appId}-${generateId()}`;
        const now = Date.now();

        const instance: AppInstance = {
          instanceId,
          appId,
          state: 'active',
          windowId,
          navigationStack: [initialPath],
          navigationIndex: 0,
          currentPath: initialPath,
          launchedAt: now,
          lastActiveAt: now,
          suspendedAt: null,
          memoryUsageMB: 0,
          cpuUsagePercent: 0,
          savedState: {},
          grantedPermissions: [...definition.permissions], // Auto-grant declared permissions
          revokedPermissions: [],
        };

        // Suspend currently active app
        const currentActive = state.activeInstanceId;
        const newInstances = new Map(state.instances);
        if (currentActive) {
          const current = newInstances.get(currentActive);
          if (current) {
            newInstances.set(currentActive, { ...current, state: 'background', lastActiveAt: now });
          }
        }

        newInstances.set(instanceId, instance);

        // Record in work session
        const newSession = state.currentWorkSession ? {
          ...state.currentWorkSession,
          appSequence: [...state.currentWorkSession.appSequence, {
            appId,
            instanceId,
            startedAt: now,
            endedAt: null,
            duration: 0,
          }],
        } : null;

        set({
          instances: newInstances,
          activeInstanceId: instanceId,
          ...(newSession ? { currentWorkSession: newSession } : {}),
        });

        return instance;
      },

      closeApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return;

        const now = Date.now();
        const duration = now - instance.launchedAt;

        // Pattern Learning: Record app close with duration (background, no UI)
        try {
          window.electron?.invoke('patterns:recordAppClose', instance.appId, duration).catch((e: unknown) => { console.warn('[DEX]', e); });
        } catch { /* state save failed */ }

        // Update work session immutably
        let newSession = state.currentWorkSession;
        if (newSession) {
          newSession = {
            ...newSession,
            appSequence: newSession.appSequence.map(e =>
              e.instanceId === instanceId && !e.endedAt
                ? { ...e, endedAt: now, duration: now - e.startedAt }
                : e
            ),
          };
        }

        // Remove from instances
        const newInstances = new Map(state.instances);
        newInstances.delete(instanceId);

        // If this was active, find another to focus
        let newActiveId = state.activeInstanceId;
        if (state.activeInstanceId === instanceId) {
          const remaining = Array.from(newInstances.values())
            .filter(i => i.state !== 'terminated')
            .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
          newActiveId = remaining[0]?.instanceId || null;
          if (newActiveId) {
            const next = newInstances.get(newActiveId);
            if (next) newInstances.set(newActiveId, { ...next, state: 'active' });
          }
        }

        set({
          instances: newInstances,
          activeInstanceId: newActiveId,
          ...(newSession ? { currentWorkSession: newSession } : {}),
        });
      },

      focusApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.state === 'terminated') return;

        const now = Date.now();
        const newInstances = new Map(state.instances);

        // Background current active
        if (state.activeInstanceId && state.activeInstanceId !== instanceId) {
          const current = newInstances.get(state.activeInstanceId);
          if (current) {
            newInstances.set(state.activeInstanceId, { ...current, state: 'background' });
          }
        }

        // Activate target
        newInstances.set(instanceId, { ...instance, state: 'active', lastActiveAt: now, suspendedAt: null });

        // Update work session immutably
        let newSession = state.currentWorkSession;
        if (newSession) {
          newSession = { ...newSession, activeAppId: instance.appId };
        }

        set({
          instances: newInstances,
          activeInstanceId: instanceId,
          ...(newSession ? { currentWorkSession: newSession } : {}),
        });
      },

      suspendApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.state === 'terminated') return;

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, { ...instance, state: 'suspended', suspendedAt: Date.now() });

        set({ instances: newInstances });
      },

      resumeApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.state !== 'suspended') return;

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, { ...instance, state: 'background', suspendedAt: null });

        set({ instances: newInstances });
      },

      // ---------------------------------------------------------------------
      // Navigation
      // ---------------------------------------------------------------------

      navigateInApp: (instanceId, path) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return;

        // Truncate forward history
        instance.navigationStack = instance.navigationStack.slice(0, instance.navigationIndex + 1);
        instance.navigationStack.push(path);
        instance.navigationIndex = instance.navigationStack.length - 1;
        instance.currentPath = path;

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
      },

      goBackInApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.navigationIndex <= 0) return false;

        instance.navigationIndex--;
        instance.currentPath = instance.navigationStack[instance.navigationIndex];

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
        return true;
      },

      goForwardInApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.navigationIndex >= instance.navigationStack.length - 1) return false;

        instance.navigationIndex++;
        instance.currentPath = instance.navigationStack[instance.navigationIndex];

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
        return true;
      },

      // ---------------------------------------------------------------------
      // State Persistence
      // ---------------------------------------------------------------------

      saveAppState: (instanceId, appState) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return;

        instance.savedState = { ...instance.savedState, ...appState };

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
      },

      getAppState: (instanceId) => {
        const instance = get().instances.get(instanceId);
        return instance?.savedState || null;
      },

      // ---------------------------------------------------------------------
      // Permissions
      // ---------------------------------------------------------------------

      requestPermission: (instanceId, permission) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return false;

        const definition = APP_REGISTRY.find(a => a.id === instance.appId);
        if (!definition?.permissions.includes(permission)) {
          return false;
        }

        if (instance.revokedPermissions.includes(permission)) {
          return false; // User explicitly revoked
        }

        if (!instance.grantedPermissions.includes(permission)) {
          instance.grantedPermissions.push(permission);
          const newInstances = new Map(state.instances);
          newInstances.set(instanceId, instance);
          set({ instances: newInstances });
        }

        return true;
      },

      revokePermission: (instanceId, permission) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return;

        instance.grantedPermissions = instance.grantedPermissions.filter(p => p !== permission);
        if (!instance.revokedPermissions.includes(permission)) {
          instance.revokedPermissions.push(permission);
        }

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
      },

      hasPermission: (instanceId, permission) => {
        const instance = get().instances.get(instanceId);
        return instance?.grantedPermissions.includes(permission) ?? false;
      },

      // ---------------------------------------------------------------------
      // Intents (App-to-App Communication)
      // ---------------------------------------------------------------------

      sendIntent: (sourceInstanceId, targetAppId, action, data) => {
        const state = get();
        const sourceInstance = state.instances.get(sourceInstanceId);
        if (!sourceInstance) {
          return '';
        }

        const intentId = `intent-${generateId()}`;
        const intent: AppIntent = {
          id: intentId,
          sourceAppId: sourceInstance.appId,
          targetAppId,
          action,
          data,
          timestamp: Date.now(),
          status: 'pending',
        };

        set({
          pendingIntents: [...state.pendingIntents, intent],
        });

        return intentId;
      },

      acceptIntent: (intentId) => {
        const state = get();
        const intents = state.pendingIntents.map(i =>
          i.id === intentId ? { ...i, status: 'accepted' as const } : i
        );
        set({ pendingIntents: intents });
      },

      rejectIntent: (intentId) => {
        const state = get();
        const intents = state.pendingIntents.map(i =>
          i.id === intentId ? { ...i, status: 'rejected' as const } : i
        );
        set({ pendingIntents: intents });
      },

      // ---------------------------------------------------------------------
      // Work Session
      // ---------------------------------------------------------------------

      startWorkSession: () => {
        const state = get();
        if (state.currentWorkSession) return; // Already active

        const session: WorkSession = {
          id: `session-${generateId()}`,
          startedAt: Date.now(),
          endedAt: null,
          activeAppId: state.activeInstanceId ? 
            state.instances.get(state.activeInstanceId)?.appId || '' : '',
          appSequence: [],
          filesAccessed: [],
          actionsPerformed: [],
          taskContext: null,
        };

        set({ currentWorkSession: session });
      },

      endWorkSession: () => {
        const state = get();
        if (!state.currentWorkSession) return;

        const session = {
          ...state.currentWorkSession,
          endedAt: Date.now(),
        };

        // Close out any open app entries
        session.appSequence = session.appSequence.map(entry => {
          if (!entry.endedAt) {
            return {
              ...entry,
              endedAt: Date.now(),
              duration: Date.now() - entry.startedAt,
            };
          }
          return entry;
        });

        set({
          currentWorkSession: null,
          workSessionHistory: [...state.workSessionHistory.slice(-99), session],
        });
      },

      recordFileAccess: (filePath) => {
        const state = get();
        if (!state.currentWorkSession) return;

        if (!state.currentWorkSession.filesAccessed.includes(filePath)) {
          set({
            currentWorkSession: {
              ...state.currentWorkSession,
              filesAccessed: [...state.currentWorkSession.filesAccessed, filePath],
            },
          });
        }
      },

      recordAction: (action) => {
        const state = get();
        if (!state.currentWorkSession) return;

        set({
          currentWorkSession: {
            ...state.currentWorkSession,
            actionsPerformed: [...state.currentWorkSession.actionsPerformed, `${Date.now()}:${action}`],
          },
        });
      },

      // ---------------------------------------------------------------------
      // Utilities
      // ---------------------------------------------------------------------

      getAppDefinition: (appId) => APP_REGISTRY.find(a => a.id === appId),

      getInstancesByAppId: (appId) => {
        return Array.from(get().instances.values())
          .filter(i => i.appId === appId && i.state !== 'terminated');
      },

      getActiveInstance: () => {
        const state = get();
        if (!state.activeInstanceId) return null;
        return state.instances.get(state.activeInstanceId) || null;
      },

      getAllActiveInstances: () => {
        return Array.from(get().instances.values())
          .filter(i => i.state !== 'terminated');
      },
    }),
    {
      name: 'dex-app-subsystem',
      storage: debouncedJsonStorage,
      partialize: (state) => ({
        permissionGrants: state.permissionGrants,
        workSessionHistory: state.workSessionHistory.slice(-10), // Keep last 10 sessions
      } as any),
    }
  )
);

// ===========================================================================
// HOOKS -- Convenience accessors
// ===========================================================================

export const useActiveApp = () => {
  const activeInstanceId = useAppSubsystem(s => s.activeInstanceId);
  const instances = useAppSubsystem(s => s.instances);
  return activeInstanceId ? instances.get(activeInstanceId) || null : null;
};

export const useAppInstances = () => {
  const instances = useAppSubsystem(s => s.instances);
  return Array.from(instances.values()).filter(i => i.state !== 'terminated');
};

export const useAppDefinitions = () => APP_REGISTRY;

export const useWorkSession = () => useAppSubsystem(s => s.currentWorkSession);

// ===========================================================================
// IPC BRIDGE -- Connect to main process
// ===========================================================================

export const initAppSubsystemIPC = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    window.electronAPI?.onAppEvent?.((event: string, data: unknown) => {
      const { launchApp, closeApp, focusApp } = useAppSubsystem.getState();
      const d = data as Record<string, any>;
      
      switch (event) {
        case 'app:launch':
          launchApp(d?.appId, d?.path, d?.windowId);
          break;
        case 'app:close':
          closeApp(d?.instanceId);
          break;
        case 'app:focus':
          focusApp(d?.instanceId);
          break;
      }
    });
  }
  
  // ===========================================================================
  // SYNC BRIDGE -- Keep useAppSubsystem in sync with useRunningApps (item 85)
  // useRunningApps is the source of truth for the dock / AppManager UI.
  // useAppSubsystem is the deeper OS-like lifecycle layer.
  // Subscribe to each and keep them consistent.
  // ===========================================================================
  try {
    // When RunningApps changes, reflect into AppSubsystem
    useRunningApps.subscribe((state: any, prev: any) => {
      if (state.currentAppId !== prev.currentAppId) {
        const sub = useAppSubsystem.getState();
        // Find instance matching the new current app
        for (const [id, inst] of sub.instances.entries()) {
          if ((inst as any).appId === state.currentAppId && (inst as any).state !== 'terminated') {
            sub.focusApp(id);
            break;
          }
        }
      }
    });
    
    // When AppSubsystem launches/closes, reflect into RunningApps
    useAppSubsystem.subscribe((state, prev) => {
      if (state.instances !== prev.instances) {
        const running = useRunningApps.getState();
        const alive = Array.from(state.instances.values()).filter((i: any) => i.state !== 'terminated');
        for (const inst of alive) {
          if (!running.runningApps.some((a: any) => a.id === (inst as any).appId)) {
            const def = APP_REGISTRY.find(d => d.id === (inst as any).appId);
            if (def) {
              running.launchApp({ id: def.id, name: def.name, icon: def.icon, color: 'var(--color-accent)' });
            }
          }
        }
      }
    });
  } catch {
    // sync bridge optional — ignore if import fails
  }
};
