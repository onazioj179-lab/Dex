// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- System Services Layer
 * ===========================================================================
 * 
 * OS-level services shared across all sub-apps.
 * Sub-apps consume services; they never reimplement core logic.
 * Services enforce policy, limits, and security boundaries.
 * 
 * Services:
 * - FileService: Filesystem operations with permission enforcement
 * - NetworkService: Network requests with rate limiting
 * - MediaService: Media playback and processing
 * - SearchService: Universal search across all data
 * - SessionService: User session and authentication
 * - PermissionService: Runtime permission enforcement
 * - PowerService: Resource budgets and throttling
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ===========================================================================
// TYPE DEFINITIONS
// ===========================================================================

/** Service health status */
export type ServiceStatus = 'healthy' | 'degraded' | 'offline' | 'error';

/** Resource budget for an app */
export interface ResourceBudget {
  appId: string;
  instanceId: string;
  cpuPercent: number;
  memoryMB: number;
  networkKBps: number;
  ioOpsPerSec: number;
  cpuUsed: number;
  memoryUsed: number;
  networkUsed: number;
  ioOpsUsed: number;
  lastUpdated: number;
  throttled: boolean;
  violations: number;
}

/** File operation request */
export interface FileOperation {
  id: string;
  appId: string;
  instanceId: string;
  operation: 'read' | 'write' | 'delete' | 'list' | 'stat' | 'move' | 'copy';
  path: string;
  targetPath?: string;
  timestamp: number;
  status: 'pending' | 'granted' | 'denied' | 'completed' | 'failed';
  error?: string;
  bytesProcessed?: number;
}

/** Network request */
export interface NetworkRequest {
  id: string;
  appId: string;
  instanceId: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  timestamp: number;
  status: 'pending' | 'granted' | 'denied' | 'completed' | 'failed';
  bytesReceived?: number;
  bytesSent?: number;
  responseCode?: number;
  error?: string;
}

/** Media session */
export interface MediaSession {
  id: string;
  appId: string;
  instanceId: string;
  type: 'audio' | 'video' | 'image';
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
  source: string;
  duration?: number;
  position?: number;
  volume: number;
  muted: boolean;
}

/** Search result */
export interface SearchResult {
  id: string;
  type: 'file' | 'note' | 'task' | 'bookmark' | 'contact' | 'message';
  title: string;
  subtitle?: string;
  path: string;
  appId: string;
  score: number;
  timestamp: number;
}

/** Permission request */
export interface PermissionRequest {
  id: string;
  appId: string;
  instanceId: string;
  permission: string;
  reason?: string;
  timestamp: number;
  status: 'pending' | 'granted' | 'denied';
  grantedAt?: number;
  deniedAt?: number;
  expiresAt?: number;
}

/** System event */
export interface SystemEvent {
  id: string;
  type: 'app_launch' | 'app_close' | 'permission_grant' | 'permission_deny' | 
        'resource_violation' | 'error' | 'crash_recovery' | 'service_status';
  appId?: string;
  instanceId?: string;
  data: Record<string, unknown>;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

// ===========================================================================
// FILE SERVICE
// ===========================================================================

interface FileServiceState {
  status: ServiceStatus;
  operations: FileOperation[];
  accessLog: Array<{
    appId: string;
    path: string;
    operation: string;
    timestamp: number;
  }>;
  
  // Actions
  requestFileOperation: (
    appId: string,
    instanceId: string,
    operation: FileOperation['operation'],
    path: string,
    targetPath?: string
  ) => Promise<FileOperation>;
  getRecentAccess: (appId: string, limit?: number) => FileServiceState['accessLog'];
  clearAccessLog: (appId?: string) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useFileService = create<FileServiceState>((set, get) => ({
  status: 'healthy',
  operations: [],
  accessLog: [],

  requestFileOperation: async (appId, instanceId, operation, path, targetPath) => {
    const op: FileOperation = {
      id: generateId(),
      appId,
      instanceId,
      operation,
      path,
      targetPath,
      timestamp: Date.now(),
      status: 'pending',
    };

    set(state => ({ operations: [...state.operations, op] }));

    // Check permission via PermissionService
    const hasPermission = usePermissionService.getState().checkPermission(
      appId,
      instanceId,
      operation === 'read' || operation === 'list' || operation === 'stat' 
        ? 'filesystem.read' 
        : operation === 'delete' 
          ? 'filesystem.delete' 
          : 'filesystem.write'
    );

    if (!hasPermission) {
      op.status = 'denied';
      op.error = 'Permission denied';
      set(state => ({
        operations: state.operations.map(o => o.id === op.id ? op : o),
      }));
      return op;
    }

    // Check resource budget
    const budget = usePowerService.getState().getBudget(instanceId);
    if (budget?.throttled) {
      op.status = 'denied';
      op.error = 'Resource budget exceeded - throttled';
      set(state => ({
        operations: state.operations.map(o => o.id === op.id ? op : o),
      }));
      return op;
    }

    op.status = 'granted';
    set(state => ({
      operations: state.operations.map(o => o.id === op.id ? op : o),
      accessLog: [...state.accessLog, { appId, path, operation, timestamp: Date.now() }],
    }));

    // Record I/O usage
    usePowerService.getState().recordIO(instanceId);

    return op;
  },

  getRecentAccess: (appId, limit = 50) => {
    return get().accessLog
      .filter(a => a.appId === appId)
      .slice(-limit);
  },

  clearAccessLog: (appId) => {
    if (appId) {
      set(state => ({
        accessLog: state.accessLog.filter(a => a.appId !== appId),
      }));
    } else {
      set({ accessLog: [] });
    }
  },
}));

// ===========================================================================
// NETWORK SERVICE
// ===========================================================================

interface NetworkServiceState {
  status: ServiceStatus;
  isOnline: boolean;
  requests: NetworkRequest[];
  blockedDomains: string[];
  rateLimits: Record<string, { count: number; resetAt: number }>;
  
  // Actions
  requestNetwork: (
    appId: string,
    instanceId: string,
    url: string,
    method: NetworkRequest['method']
  ) => Promise<NetworkRequest>;
  setOnlineStatus: (online: boolean) => void;
  addBlockedDomain: (domain: string) => void;
  removeBlockedDomain: (domain: string) => void;
  getRequestHistory: (appId: string, limit?: number) => NetworkRequest[];
}

export const useNetworkService = create<NetworkServiceState>((set, get) => ({
  status: 'healthy',
  isOnline: true,
  requests: [],
  blockedDomains: [],
  rateLimits: {},

  requestNetwork: async (appId, instanceId, url, method) => {
    const req: NetworkRequest = {
      id: generateId(),
      appId,
      instanceId,
      url,
      method,
      timestamp: Date.now(),
      status: 'pending',
    };

    set(state => ({ requests: [...state.requests, req] }));

    // Check online status
    if (!get().isOnline) {
      req.status = 'denied';
      req.error = 'Network offline';
      set(state => ({
        requests: state.requests.map(r => r.id === req.id ? req : r),
      }));
      return req;
    }

    // Check permission
    const hasPermission = usePermissionService.getState().checkPermission(
      appId,
      instanceId,
      'network.fetch'
    );

    if (!hasPermission) {
      req.status = 'denied';
      req.error = 'Permission denied';
      set(state => ({
        requests: state.requests.map(r => r.id === req.id ? req : r),
      }));
      return req;
    }

    // Check blocked domains
    try {
      const domain = new URL(url).hostname;
      if (get().blockedDomains.includes(domain)) {
        req.status = 'denied';
        req.error = 'Domain blocked';
        set(state => ({
          requests: state.requests.map(r => r.id === req.id ? req : r),
        }));
        return req;
      }
    } catch {
      req.status = 'denied';
      req.error = 'Invalid URL';
      set(state => ({
        requests: state.requests.map(r => r.id === req.id ? req : r),
      }));
      return req;
    }

    // Check rate limit
    const rateKey = `${appId}:${instanceId}`;
    const rateLimit = get().rateLimits[rateKey];
    const now = Date.now();
    
    if (rateLimit && rateLimit.resetAt > now && rateLimit.count >= 100) {
      req.status = 'denied';
      req.error = 'Rate limit exceeded';
      set(state => ({
        requests: state.requests.map(r => r.id === req.id ? req : r),
      }));
      return req;
    }

    // Update rate limit
    set(state => ({
      rateLimits: {
        ...state.rateLimits,
        [rateKey]: {
          count: (rateLimit?.resetAt || 0) > now ? (rateLimit?.count || 0) + 1 : 1,
          resetAt: (rateLimit?.resetAt || 0) > now ? rateLimit.resetAt : now + 60000,
        },
      },
    }));

    // Check resource budget
    const budget = usePowerService.getState().getBudget(instanceId);
    if (budget?.throttled) {
      req.status = 'denied';
      req.error = 'Resource budget exceeded - throttled';
      set(state => ({
        requests: state.requests.map(r => r.id === req.id ? req : r),
      }));
      return req;
    }

    req.status = 'granted';
    set(state => ({
      requests: state.requests.map(r => r.id === req.id ? req : r),
    }));

    return req;
  },

  setOnlineStatus: (online) => {
    set({ isOnline: online, status: online ? 'healthy' : 'offline' });
  },

  addBlockedDomain: (domain) => {
    set(state => ({
      blockedDomains: [...new Set([...state.blockedDomains, domain])],
    }));
  },

  removeBlockedDomain: (domain) => {
    set(state => ({
      blockedDomains: state.blockedDomains.filter(d => d !== domain),
    }));
  },

  getRequestHistory: (appId, limit = 50) => {
    return get().requests
      .filter(r => r.appId === appId)
      .slice(-limit);
  },
}));

// ===========================================================================
// MEDIA SERVICE
// ===========================================================================

interface MediaServiceState {
  status: ServiceStatus;
  sessions: Map<string, MediaSession>;
  activeSession: string | null;
  globalVolume: number;
  globalMuted: boolean;
  
  // Actions
  createSession: (appId: string, instanceId: string, type: MediaSession['type'], source: string) => MediaSession;
  updateSession: (sessionId: string, updates: Partial<MediaSession>) => void;
  destroySession: (sessionId: string) => void;
  setGlobalVolume: (volume: number) => void;
  setGlobalMuted: (muted: boolean) => void;
  getSession: (sessionId: string) => MediaSession | undefined;
  getSessionsByApp: (appId: string) => MediaSession[];
}

export const useMediaService = create<MediaServiceState>((set, get) => ({
  status: 'healthy',
  sessions: new Map(),
  activeSession: null,
  globalVolume: 1.0,
  globalMuted: false,

  createSession: (appId, instanceId, type, source) => {
    const session: MediaSession = {
      id: generateId(),
      appId,
      instanceId,
      type,
      state: 'idle',
      source,
      volume: 1.0,
      muted: false,
    };

    set(state => {
      const newSessions = new Map(state.sessions);
      newSessions.set(session.id, session);
      return { sessions: newSessions, activeSession: session.id };
    });

    return session;
  },

  updateSession: (sessionId, updates) => {
    set(state => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      
      const newSessions = new Map(state.sessions);
      newSessions.set(sessionId, { ...session, ...updates });
      return { sessions: newSessions };
    });
  },

  destroySession: (sessionId) => {
    set(state => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(sessionId);
      return { 
        sessions: newSessions,
        activeSession: state.activeSession === sessionId ? null : state.activeSession,
      };
    });
  },

  setGlobalVolume: (volume) => {
    set({ globalVolume: Math.max(0, Math.min(1, volume)) });
  },

  setGlobalMuted: (muted) => {
    set({ globalMuted: muted });
  },

  getSession: (sessionId) => {
    return get().sessions.get(sessionId);
  },

  getSessionsByApp: (appId) => {
    return Array.from(get().sessions.values()).filter(s => s.appId === appId);
  },
}));

// ===========================================================================
// SEARCH SERVICE
// ===========================================================================

interface SearchServiceState {
  status: ServiceStatus;
  indexedCount: number;
  lastIndexed: number | null;
  recentSearches: string[];
  
  // Actions
  search: (query: string, filters?: { types?: SearchResult['type'][]; appIds?: string[] }) => Promise<SearchResult[]>;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  getIndexStats: () => { count: number; lastIndexed: number | null };
}

export const useSearchService = create<SearchServiceState>((set, get) => ({
  status: 'healthy',
  indexedCount: 0,
  lastIndexed: null,
  recentSearches: [],

  search: async (query, filters) => {
    if (!query.trim()) return [];
    
    // Add to recent searches
    get().addRecentSearch(query);
    
    // Query the main process file search index via IPC
    try {
      const electron = (window as any).electron;
      if (electron?.invoke) {
        const results = await electron.invoke('search:query', query, filters);
        if (Array.isArray(results)) return results;
      }
    } catch {
      // IPC unavailable — fall through to empty results
    }
    
    return [];
  },

  addRecentSearch: (query) => {
    set(state => ({
      recentSearches: [query, ...state.recentSearches.filter(q => q !== query)].slice(0, 20),
    }));
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
  },

  getIndexStats: () => {
    const state = get();
    return { count: state.indexedCount, lastIndexed: state.lastIndexed };
  },
}));

// ===========================================================================
// SESSION SERVICE
// ===========================================================================

interface SessionServiceState {
  status: ServiceStatus;
  sessionId: string | null;
  startedAt: number | null;
  lastActivity: number | null;
  idleTimeout: number;
  isLocked: boolean;
  
  // Actions
  startSession: () => void;
  endSession: () => void;
  recordActivity: () => void;
  lock: () => void;
  unlock: () => void;
  isIdle: () => boolean;
  getSessionDuration: () => number;
}

export const useSessionService = create<SessionServiceState>((set, get) => ({
  status: 'healthy',
  sessionId: null,
  startedAt: null,
  lastActivity: null,
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  isLocked: false,

  startSession: () => {
    const now = Date.now();
    set({
      sessionId: generateId(),
      startedAt: now,
      lastActivity: now,
      isLocked: false,
    });
  },

  endSession: () => {
    set({
      sessionId: null,
      startedAt: null,
      lastActivity: null,
    });
  },

  recordActivity: () => {
    set({ lastActivity: Date.now() });
  },

  lock: () => {
    set({ isLocked: true });
  },

  unlock: () => {
    set({ isLocked: false, lastActivity: Date.now() });
  },

  isIdle: () => {
    const state = get();
    if (!state.lastActivity) return false;
    return Date.now() - state.lastActivity > state.idleTimeout;
  },

  getSessionDuration: () => {
    const state = get();
    if (!state.startedAt) return 0;
    return Date.now() - state.startedAt;
  },
}));

// ===========================================================================
// PERMISSION SERVICE
// ===========================================================================

interface PermissionServiceState {
  status: ServiceStatus;
  requests: PermissionRequest[];
  grants: Record<string, Record<string, PermissionRequest>>;
  denials: Record<string, Record<string, PermissionRequest>>;
  
  // Actions
  requestPermission: (appId: string, instanceId: string, permission: string, reason?: string) => Promise<PermissionRequest>;
  grantPermission: (requestId: string, expiresIn?: number) => void;
  denyPermission: (requestId: string) => void;
  revokePermission: (appId: string, permission: string) => void;
  checkPermission: (appId: string, instanceId: string, permission: string) => boolean;
  getAppPermissions: (appId: string) => string[];
  getPendingRequests: () => PermissionRequest[];
}

export const usePermissionService = create<PermissionServiceState>()(
  persist(
    (set, get) => ({
      status: 'healthy',
      requests: [],
      grants: {},
      denials: {},

      requestPermission: async (appId, instanceId, permission, reason) => {
        const req: PermissionRequest = {
          id: generateId(),
          appId,
          instanceId,
          permission,
          reason,
          timestamp: Date.now(),
          status: 'pending',
        };

        set(state => ({ requests: [...state.requests, req] }));

        // Check if already granted
        const existing = get().grants[appId]?.[permission];
        if (existing && (!existing.expiresAt || existing.expiresAt > Date.now())) {
          req.status = 'granted';
          req.grantedAt = existing.grantedAt;
          set(state => ({
            requests: state.requests.map(r => r.id === req.id ? req : r),
          }));
          return req;
        }

        // Check if previously denied
        const denied = get().denials[appId]?.[permission];
        if (denied && Date.now() - (denied.deniedAt || 0) < 60000) {
          // Recently denied, auto-deny again
          req.status = 'denied';
          req.deniedAt = Date.now();
          set(state => ({
            requests: state.requests.map(r => r.id === req.id ? req : r),
          }));
          return req;
        }

        return req;
      },

      grantPermission: (requestId, expiresIn) => {
        const state = get();
        const req = state.requests.find(r => r.id === requestId);
        if (!req) return;

        const now = Date.now();
        req.status = 'granted';
        req.grantedAt = now;
        if (expiresIn) {
          req.expiresAt = now + expiresIn;
        }

        set(state => ({
          requests: state.requests.map(r => r.id === requestId ? req : r),
          grants: {
            ...state.grants,
            [req.appId]: {
              ...state.grants[req.appId],
              [req.permission]: req,
            },
          },
        }));

        // Log system event
        useSystemEvents.getState().emit({
          type: 'permission_grant',
          appId: req.appId,
          instanceId: req.instanceId,
          data: { permission: req.permission },
          severity: 'info',
        });
      },

      denyPermission: (requestId) => {
        const state = get();
        const req = state.requests.find(r => r.id === requestId);
        if (!req) return;

        req.status = 'denied';
        req.deniedAt = Date.now();

        set(state => ({
          requests: state.requests.map(r => r.id === requestId ? req : r),
          denials: {
            ...state.denials,
            [req.appId]: {
              ...state.denials[req.appId],
              [req.permission]: req,
            },
          },
        }));

        // Log system event
        useSystemEvents.getState().emit({
          type: 'permission_deny',
          appId: req.appId,
          instanceId: req.instanceId,
          data: { permission: req.permission },
          severity: 'warning',
        });
      },

      revokePermission: (appId, permission) => {
        set(state => {
          const newGrants = { ...state.grants };
          if (newGrants[appId]) {
            delete newGrants[appId][permission];
          }
          return { grants: newGrants };
        });
      },

      checkPermission: (appId, instanceId, permission) => {
        const grant = get().grants[appId]?.[permission];
        if (!grant) return false;
        if (grant.expiresAt && grant.expiresAt < Date.now()) return false;
        return true;
      },

      getAppPermissions: (appId) => {
        const grants = get().grants[appId] || {};
        return Object.keys(grants).filter(p => {
          const grant = grants[p];
          return !grant.expiresAt || grant.expiresAt > Date.now();
        });
      },

      getPendingRequests: () => {
        return get().requests.filter(r => r.status === 'pending');
      },
    }),
    {
      name: 'dex-permissions',
      partialize: (state) => ({ grants: state.grants, denials: state.denials }),
    }
  )
);

// ===========================================================================
// POWER SERVICE (Resource Budgets)
// ===========================================================================

interface PowerServiceState {
  status: ServiceStatus;
  budgets: Map<string, ResourceBudget>;
  globalCpuLimit: number;
  globalMemoryLimitMB: number;
  globalNetworkLimitKBps: number;
  throttledApps: Set<string>;
  
  // Actions
  allocateBudget: (appId: string, instanceId: string) => ResourceBudget;
  releaseBudget: (instanceId: string) => void;
  recordCpu: (instanceId: string, percent: number) => void;
  recordMemory: (instanceId: string, mb: number) => void;
  recordNetwork: (instanceId: string, kb: number) => void;
  recordIO: (instanceId: string) => void;
  getBudget: (instanceId: string) => ResourceBudget | undefined;
  isThrottled: (instanceId: string) => boolean;
  checkBudgets: () => void;
  getSystemUsage: () => { cpu: number; memory: number; network: number };
}

export const usePowerService = create<PowerServiceState>((set, get) => ({
  status: 'healthy',
  budgets: new Map(),
  globalCpuLimit: 80, // 80% total
  globalMemoryLimitMB: 2048,
  globalNetworkLimitKBps: 10240, // 10 MB/s
  throttledApps: new Set(),

  allocateBudget: (appId, instanceId) => {
    const budget: ResourceBudget = {
      appId,
      instanceId,
      cpuPercent: 25, // Per-app limits
      memoryMB: 256,
      networkKBps: 2048,
      ioOpsPerSec: 100,
      cpuUsed: 0,
      memoryUsed: 0,
      networkUsed: 0,
      ioOpsUsed: 0,
      lastUpdated: Date.now(),
      throttled: false,
      violations: 0,
    };

    set(state => {
      const newBudgets = new Map(state.budgets);
      newBudgets.set(instanceId, budget);
      return { budgets: newBudgets };
    });

    return budget;
  },

  releaseBudget: (instanceId) => {
    set(state => {
      const newBudgets = new Map(state.budgets);
      newBudgets.delete(instanceId);
      const newThrottled = new Set(state.throttledApps);
      newThrottled.delete(instanceId);
      return { budgets: newBudgets, throttledApps: newThrottled };
    });
  },

  recordCpu: (instanceId, percent) => {
    set(state => {
      const budget = state.budgets.get(instanceId);
      if (!budget) return state;

      budget.cpuUsed = percent;
      budget.lastUpdated = Date.now();

      if (percent > budget.cpuPercent) {
        budget.violations++;
        if (budget.violations >= 3) {
          budget.throttled = true;
          const newThrottled = new Set(state.throttledApps);
          newThrottled.add(instanceId);
          
          useSystemEvents.getState().emit({
            type: 'resource_violation',
            instanceId,
            data: { resource: 'cpu', used: percent, limit: budget.cpuPercent },
            severity: 'warning',
          });
          
          return { budgets: new Map(state.budgets), throttledApps: newThrottled };
        }
      }

      return { budgets: new Map(state.budgets) };
    });
  },

  recordMemory: (instanceId, mb) => {
    set(state => {
      const budget = state.budgets.get(instanceId);
      if (!budget) return state;

      budget.memoryUsed = mb;
      budget.lastUpdated = Date.now();

      if (mb > budget.memoryMB) {
        budget.violations++;
        if (budget.violations >= 3) {
          budget.throttled = true;
          const newThrottled = new Set(state.throttledApps);
          newThrottled.add(instanceId);
          
          useSystemEvents.getState().emit({
            type: 'resource_violation',
            instanceId,
            data: { resource: 'memory', used: mb, limit: budget.memoryMB },
            severity: 'warning',
          });
          
          return { budgets: new Map(state.budgets), throttledApps: newThrottled };
        }
      }

      return { budgets: new Map(state.budgets) };
    });
  },

  recordNetwork: (instanceId, kb) => {
    set(state => {
      const budget = state.budgets.get(instanceId);
      if (!budget) return state;

      budget.networkUsed += kb;
      budget.lastUpdated = Date.now();

      return { budgets: new Map(state.budgets) };
    });
  },

  recordIO: (instanceId) => {
    set(state => {
      const budget = state.budgets.get(instanceId);
      if (!budget) return state;

      budget.ioOpsUsed++;
      budget.lastUpdated = Date.now();

      return { budgets: new Map(state.budgets) };
    });
  },

  getBudget: (instanceId) => {
    return get().budgets.get(instanceId);
  },

  isThrottled: (instanceId) => {
    return get().throttledApps.has(instanceId);
  },

  checkBudgets: () => {
    const state = get();
    let totalCpu = 0;
    let totalMemory = 0;

    state.budgets.forEach(budget => {
      totalCpu += budget.cpuUsed;
      totalMemory += budget.memoryUsed;
    });

    if (totalCpu > state.globalCpuLimit || totalMemory > state.globalMemoryLimitMB) {
      set({ status: 'degraded' });
    } else {
      set({ status: 'healthy' });
    }
  },

  getSystemUsage: () => {
    const state = get();
    let cpu = 0;
    let memory = 0;
    let network = 0;

    state.budgets.forEach(budget => {
      cpu += budget.cpuUsed;
      memory += budget.memoryUsed;
      network += budget.networkUsed;
    });

    return { cpu, memory, network };
  },
}));

// ===========================================================================
// SYSTEM EVENTS
// ===========================================================================

interface SystemEventsState {
  events: SystemEvent[];
  maxEvents: number;
  subscribers: Set<(event: SystemEvent) => void>;
  
  // Actions
  emit: (event: Omit<SystemEvent, 'id' | 'timestamp'>) => void;
  subscribe: (callback: (event: SystemEvent) => void) => () => void;
  getEvents: (filters?: { types?: SystemEvent['type'][]; severity?: SystemEvent['severity'][] }) => SystemEvent[];
  clearEvents: () => void;
}

export const useSystemEvents = create<SystemEventsState>((set, get) => ({
  events: [],
  maxEvents: 1000,
  subscribers: new Set(),

  emit: (eventData) => {
    const event: SystemEvent = {
      ...eventData,
      id: generateId(),
      timestamp: Date.now(),
    };

    set(state => ({
      events: [...state.events.slice(-(state.maxEvents - 1)), event],
    }));

    // Notify subscribers
    get().subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (_err) {
        // Subscriber error silently ignored - don't pollute console
      }
    });

    // Track critical events for debugging (accessible via window.__DEX_CRITICAL_EVENTS__)
    if (event.severity === 'critical') {
      if (typeof window !== 'undefined') {
        const events = (window.__DEX_CRITICAL_EVENTS__ as unknown as any[]) || [];
        events.push(event);
        (window as any).__DEX_CRITICAL_EVENTS__ = events;
      }
    }
  },

  subscribe: (callback) => {
    set(state => {
      const newSubscribers = new Set(state.subscribers);
      newSubscribers.add(callback);
      return { subscribers: newSubscribers };
    });

    return () => {
      set(state => {
        const newSubscribers = new Set(state.subscribers);
        newSubscribers.delete(callback);
        return { subscribers: newSubscribers };
      });
    };
  },

  getEvents: (filters) => {
    let events = get().events;
    
    if (filters?.types) {
      events = events.filter(e => filters.types!.includes(e.type));
    }
    if (filters?.severity) {
      events = events.filter(e => filters.severity!.includes(e.severity));
    }

    return events;
  },

  clearEvents: () => {
    set({ events: [] });
  },
}));

// ===========================================================================
// SYSTEM SERVICES AGGREGATE
// ===========================================================================

export interface SystemServicesStatus {
  file: ServiceStatus;
  network: ServiceStatus;
  media: ServiceStatus;
  search: ServiceStatus;
  session: ServiceStatus;
  permission: ServiceStatus;
  power: ServiceStatus;
  overall: ServiceStatus;
}

export const getSystemServicesStatus = (): SystemServicesStatus => {
  const statuses = {
    file: useFileService.getState().status,
    network: useNetworkService.getState().status,
    media: useMediaService.getState().status,
    search: useSearchService.getState().status,
    session: useSessionService.getState().status,
    permission: usePermissionService.getState().status,
    power: usePowerService.getState().status,
  };

  // Calculate overall status
  const statusValues = Object.values(statuses);
  let overall: ServiceStatus = 'healthy';
  
  if (statusValues.includes('error')) {
    overall = 'error';
  } else if (statusValues.includes('offline')) {
    overall = 'degraded';
  } else if (statusValues.includes('degraded')) {
    overall = 'degraded';
  }

  return { ...statuses, overall };
};

// Initialize network status listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useNetworkService.getState().setOnlineStatus(true);
  });
  
  window.addEventListener('offline', () => {
    useNetworkService.getState().setOnlineStatus(false);
  });
}
