/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX — Inner App Subsystem
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Native OS-grade application framework for inner apps.
 * Apps are first-class citizens with real lifecycle, state, and isolation.
 * 
 * No mocks. No placeholders. No fake states.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — App Definition & State
// ═══════════════════════════════════════════════════════════════════════════

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
  category: 'productivity' | 'media' | 'utility' | 'system' | 'development';
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

// ═══════════════════════════════════════════════════════════════════════════
// APP REGISTRY — Static App Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const APP_REGISTRY: AppDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // System Apps
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'home',
    name: 'Home',
    icon: 'home',
    color: '#ffffff',
    description: 'DEX home dashboard',
    version: '2.0.0',
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'dashboard',
    color: '#3b82f6',
    description: 'System overview and widgets',
    version: '2.0.0',
    permissions: ['filesystem.read', 'system.info'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    color: '#8e8e93',
    description: 'System preferences',
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'system',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Productivity Apps
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'files',
    name: 'Files',
    icon: 'folder',
    color: '#007aff',
    description: 'File manager with AES-256 encryption',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'filesystem.delete'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'productivity',
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: 'note',
    color: '#ffcc00',
    description: 'Rich text notes with encryption',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.read', 'clipboard.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'productivity',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: 'check',
    color: '#34c759',
    description: 'Task management with priorities',
    version: '2.0.0',
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
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'network.fetch'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'productivity',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    icon: 'calendar',
    color: '#ff3b30',
    description: 'Event scheduling and reminders',
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'notifications'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Media Apps
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'gallery',
    name: 'Gallery',
    icon: 'image',
    color: '#ff2d55',
    description: 'Photo and image library',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'media',
  },
  {
    id: 'audio',
    name: 'Music',
    icon: 'music',
    color: '#ff3b30',
    description: 'Audio player and library',
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['filesystem.read'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'media',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Utility Apps
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'power',
    name: 'Power',
    icon: 'power',
    color: '#30d158',
    description: 'Power management and optimization',
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    icon: 'calculator',
    color: '#8e8e93',
    description: 'Scientific calculator',
    version: '2.0.0',
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
    version: '2.0.0',
    permissions: ['clipboard.write'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Development Apps
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'code',
    name: 'Code',
    icon: 'code',
    color: '#af52de',
    description: 'Code editor with syntax highlighting',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'clipboard.read', 'clipboard.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'development',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: 'terminal',
    color: '#8e8e93',
    description: 'Command line interface',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'system.info'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'development',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DEX Creative Suite
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'videoeditor',
    name: 'VINX',
    icon: 'videoeditor',
    color: '#8b5cf6',
    description: 'Professional video editor',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'media',
  },
  {
    id: 'imosion',
    name: 'Imosion',
    icon: 'imosion',
    color: '#f97316',
    description: 'Motion graphics and animation',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'media',
  },
  {
    id: 'prism',
    name: 'PRISM',
    icon: 'prism',
    color: '#06b6d4',
    description: 'Photo editing and enhancement',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'media',
  },
  {
    id: 'flux',
    name: 'FLUX',
    icon: 'flux',
    color: '#3b82f6',
    description: 'Audio production and mixing',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write', 'microphone'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'media',
  },
  {
    id: 'forge',
    name: 'FORGE',
    icon: 'forge',
    color: '#f59e0b',
    description: '3D modeling and design',
    version: '2.0.0',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleton: false,
    supportsMultiWindow: true,
    category: 'media',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DEX Rewind
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'rewind',
    name: 'Rewind',
    icon: 'rewind',
    color: '#0078d4',
    description: 'Activity logger and search — DVR for your desktop day',
    version: '2.0.0',
    permissions: ['filesystem.read', 'clipboard.read', 'system.info'],
    singleton: true,
    supportsMultiWindow: false,
    category: 'utility',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// APP SUBSYSTEM STORE
// ═══════════════════════════════════════════════════════════════════════════

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

      // ─────────────────────────────────────────────────────────────────────
      // App Lifecycle
      // ─────────────────────────────────────────────────────────────────────

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
        if (currentActive) {
          const current = state.instances.get(currentActive);
          if (current) {
            current.state = 'background';
            current.lastActiveAt = now;
          }
        }

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({
          instances: newInstances,
          activeInstanceId: instanceId,
        });

        // Pattern Learning: Record app open (background, no UI)
        try {
          window.electron?.invoke('patterns:recordAppOpen', appId, initialPath).catch(() => {});
        } catch { /* state save failed */ }

        // Record in work session
        if (state.currentWorkSession) {
          state.currentWorkSession.appSequence.push({
            appId,
            instanceId,
            startedAt: now,
            endedAt: null,
            duration: 0,
          });
        }

        return instance;
      },

      closeApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance) return;

        const now = Date.now();
        const duration = now - instance.launchedAt;
        instance.state = 'terminated';

        // Pattern Learning: Record app close with duration (background, no UI)
        try {
          window.electron?.invoke('patterns:recordAppClose', instance.appId, duration).catch(() => {});
        } catch { /* state save failed */ }

        // Update work session
        if (state.currentWorkSession) {
          const appEntry = state.currentWorkSession.appSequence.find(
            e => e.instanceId === instanceId && !e.endedAt
          );
          if (appEntry) {
            appEntry.endedAt = now;
            appEntry.duration = now - appEntry.startedAt;
          }
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
            if (next) next.state = 'active';
          }
        }

        set({
          instances: newInstances,
          activeInstanceId: newActiveId,
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
            current.state = 'background';
          }
        }

        // Activate target
        instance.state = 'active';
        instance.lastActiveAt = now;
        instance.suspendedAt = null;

        // Update work session
        if (state.currentWorkSession) {
          state.currentWorkSession.activeAppId = instance.appId;
        }

        set({
          instances: newInstances,
          activeInstanceId: instanceId,
        });
      },

      suspendApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.state === 'terminated') return;

        instance.state = 'suspended';
        instance.suspendedAt = Date.now();

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
      },

      resumeApp: (instanceId) => {
        const state = get();
        const instance = state.instances.get(instanceId);
        if (!instance || instance.state !== 'suspended') return;

        instance.state = 'background';
        instance.suspendedAt = null;

        const newInstances = new Map(state.instances);
        newInstances.set(instanceId, instance);

        set({ instances: newInstances });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Navigation
      // ─────────────────────────────────────────────────────────────────────

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

      // ─────────────────────────────────────────────────────────────────────
      // State Persistence
      // ─────────────────────────────────────────────────────────────────────

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

      // ─────────────────────────────────────────────────────────────────────
      // Permissions
      // ─────────────────────────────────────────────────────────────────────

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

      // ─────────────────────────────────────────────────────────────────────
      // Intents (App-to-App Communication)
      // ─────────────────────────────────────────────────────────────────────

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

      // ─────────────────────────────────────────────────────────────────────
      // Work Session
      // ─────────────────────────────────────────────────────────────────────

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
          state.currentWorkSession.filesAccessed.push(filePath);
        }
      },

      recordAction: (action) => {
        const state = get();
        if (!state.currentWorkSession) return;

        state.currentWorkSession.actionsPerformed.push(
          `${Date.now()}:${action}`
        );
      },

      // ─────────────────────────────────────────────────────────────────────
      // Utilities
      // ─────────────────────────────────────────────────────────────────────

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
      partialize: (state) => ({
        permissionGrants: state.permissionGrants,
        workSessionHistory: state.workSessionHistory.slice(-10), // Keep last 10 sessions
      }),
      // Custom serialization for Map
      serialize: (state) => JSON.stringify({
        ...state,
        state: {
          ...state.state,
          instances: Array.from(state.state.instances?.entries?.() || []),
        },
      }),
      deserialize: (str) => {
        const data = JSON.parse(str);
        if (data.state?.instances) {
          data.state.instances = new Map(data.state.instances);
        }
        return data;
      },
    }
  )
);

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Convenience accessors
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// IPC BRIDGE — Connect to main process
// ═══════════════════════════════════════════════════════════════════════════

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
};
