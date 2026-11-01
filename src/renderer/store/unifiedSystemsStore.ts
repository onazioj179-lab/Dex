// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Unified Systems Stores
// Zustand stores for all new systems: Notifications, Search, Media Library,
// Version History, Task Queue, Recycle Bin, Layouts, Scratchpad, Feedback,
// Batch Operations, Multi Window, Deep Links, Localization.
// ==========================================================================

import { create } from 'zustand';
import {
  type NotificationRecord as PolicyRecord,
  type NotificationPriority,
  sortByPriority,
} from '../../shared/notifications/group';
import { readHubMeta } from '../services/notify';
import { notificationsAllowed } from '../utils/notificationsAllowed';

// ==========================================================================
// IPC Helper
// ==========================================================================
const invoke = async (channel: string, ...args: any[]): Promise<any> => {
  try {
    return await (window as any).dex?.invoke(channel, ...args);
  } catch (err) {
    console.warn(`[Store] IPC invoke failed for ${channel}:`, err);
    return null;
  }
};

// ==========================================================================
// NOTIFICATION CENTER STORE
// ==========================================================================
export interface NotificationRecord {
  id: number;
  app: string;
  title: string;
  body: string;
  action: string | null;
  read: number;
  delivery: string;
  timestamp: number;
  /** Decoded from the persisted `action` _dexMeta envelope (see services/notify). */
  priority: NotificationPriority;
  icon: 'info' | 'success' | 'warning' | 'error';
  /** Grouping key — the _dexMeta.source, falling back to `app`. */
  source: string;
}

/**
 * Decode the priority/icon/source the unified service encoded into the hub
 * `action` JSON. Records that predate the envelope (or come straight from the
 * OS hub) degrade to sensible defaults so nothing throws.
 */
function decodeRecord(raw: any): NotificationRecord {
  const meta = readHubMeta(raw?.action);
  return {
    id: raw?.id,
    app: raw?.app ?? 'System',
    title: raw?.title ?? '',
    body: raw?.body ?? '',
    action: raw?.action ?? null,
    read: typeof raw?.read === 'number' ? raw.read : 0,
    delivery: raw?.delivery ?? 'all',
    timestamp: typeof raw?.timestamp === 'number' ? raw.timestamp : Date.now(),
    priority: meta?.priority ?? 'normal',
    icon: meta?.icon ?? 'info',
    source: meta?.source ?? raw?.app ?? 'System',
  };
}

/** Map a store record to the shared policy shape (group.ts / center.ts). */
function toPolicyRecord(n: NotificationRecord): PolicyRecord {
  return {
    id: String(n.id),
    title: n.title,
    body: n.body,
    source: n.source,
    priority: n.priority,
    ts: n.timestamp,
  };
}

interface NotificationCenterState {
  notifications: NotificationRecord[];
  unreadCount: number;
  panelOpen: boolean;
  doNotDisturb: boolean;
  loading: boolean;
  setPanelOpen: (open: boolean) => void;
  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  sendNotification: (app: string, title: string, body: string, action?: any) => Promise<void>;
  /** Priority-ordered flat list (urgent first, then most recent). */
  getOrdered: () => NotificationRecord[];
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  setDoNotDisturb: (active: boolean) => Promise<void>;
}

export const useNotificationCenterStore = create<NotificationCenterState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  panelOpen: false,
  doNotDisturb: false,
  loading: false,

  setPanelOpen: (open) => set({ panelOpen: open }),

  loadNotifications: async () => {
    set({ loading: true });
    const data = await invoke('notification-center:getAll', 200);
    const decoded = Array.isArray(data) ? data.map(decodeRecord) : [];
    set({ notifications: decoded, loading: false });
  },

  loadUnreadCount: async () => {
    const count = await invoke('notification-center:getUnreadCount');
    set({ unreadCount: count || 0 });
  },

  sendNotification: async (app, title, body, action) => {
    await invoke('notification-center:send', { app, title, body, action, osToast: notificationsAllowed() });
    await get().loadUnreadCount();
  },

  getOrdered: () => {
    const { notifications } = get();
    const order = sortByPriority(notifications.map(toPolicyRecord));
    const byId = new Map(notifications.map((n) => [String(n.id), n]));
    return order.map((r) => byId.get(r.id)).filter(Boolean) as NotificationRecord[];
  },

  markRead: async (id) => {
    await invoke('notification-center:markRead', id);
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: 1 } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await invoke('notification-center:markAllRead');
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: 1 })),
      unreadCount: 0,
    }));
  },

  clearAll: async () => {
    await invoke('notification-center:clearAll');
    set({ notifications: [], unreadCount: 0 });
  },

  deleteNotification: async (id) => {
    await invoke('notification-center:delete', id);
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
    await get().loadUnreadCount();
  },

  setDoNotDisturb: async (active) => {
    await invoke('notification-center:setDnd', active);
    set({ doNotDisturb: active });
  },
}));

// ==========================================================================
// GLOBAL SEARCH STORE
// ==========================================================================
export interface SearchResult {
  source: string;
  title: string;
  description: string;
  timestamp: number | null;
  deepLink: string;
  relevance: number;
}

export interface SearchResultGroup {
  source: string;
  results: SearchResult[];
  totalCount: number;
}

interface GlobalSearchState {
  query: string;
  results: SearchResultGroup[];
  searching: boolean;
  isOpen: boolean;
  expandedSources: Set<string>;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  setOpen: (open: boolean) => void;
  toggleSourceExpansion: (source: string) => void;
  clearResults: () => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>((set, get) => ({
  query: '',
  results: [],
  searching: false,
  isOpen: false,
  expandedSources: new Set(),

  setQuery: (query) => set({ query }),

  search: async (query) => {
    if (!query || query.trim().length === 0) {
      set({ results: [], searching: false });
      return;
    }
    set({ searching: true, query });
    const groups = await invoke('global-search:query', query);
    set({ results: groups || [], searching: false });
  },

  setOpen: (open) => {
    set({ isOpen: open });
    if (!open) set({ query: '', results: [], searching: false, expandedSources: new Set() });
  },

  toggleSourceExpansion: (source) => {
    set((s) => {
      const next = new Set(s.expandedSources);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return { expandedSources: next };
    });
  },

  clearResults: () => set({ results: [], query: '', searching: false }),
}));

// ==========================================================================
// MEDIA LIBRARY STORE
// ==========================================================================
export interface MediaRecord {
  id: number;
  filepath: string;
  filename: string;
  type: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  imported_by: string;
  last_used: number;
  use_count: number;
  thumbnail: string | null;
  timestamp: number;
}

interface MediaLibraryState {
  items: MediaRecord[];
  typeFilter: string;
  sortBy: string;
  searchQuery: string;
  loading: boolean;
  panelOpen: boolean;
  stats: { total: number; video: number; audio: number; image: number; document: number; totalSize: number };
  setTypeFilter: (f: string) => void;
  setSortBy: (s: string) => void;
  setSearchQuery: (q: string) => void;
  setPanelOpen: (open: boolean) => void;
  loadItems: () => Promise<void>;
  loadStats: () => Promise<void>;
  importFile: (filepath: string, importedBy: string) => Promise<MediaRecord | null>;
  removeItem: (id: number) => Promise<void>;
}

export const useMediaLibraryStore = create<MediaLibraryState>((set, get) => ({
  items: [],
  typeFilter: 'all',
  sortBy: 'date',
  searchQuery: '',
  loading: false,
  panelOpen: false,
  stats: { total: 0, video: 0, audio: 0, image: 0, document: 0, totalSize: 0 },

  setTypeFilter: (f) => { set({ typeFilter: f }); get().loadItems(); },
  setSortBy: (s) => { set({ sortBy: s }); get().loadItems(); },
  setSearchQuery: (q) => { set({ searchQuery: q }); get().loadItems(); },
  setPanelOpen: (open) => set({ panelOpen: open }),

  loadItems: async () => {
    set({ loading: true });
    const { typeFilter, sortBy, searchQuery } = get();
    const data = await invoke('media-library:getAll', typeFilter, sortBy, searchQuery || undefined);
    set({ items: data || [], loading: false });
  },

  loadStats: async () => {
    const stats = await invoke('media-library:getStats');
    if (stats) set({ stats });
  },

  importFile: async (filepath, importedBy) => {
    const record = await invoke('media-library:import', filepath, importedBy);
    if (record) await get().loadItems();
    return record;
  },

  removeItem: async (id) => {
    await invoke('media-library:remove', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    await get().loadStats();
  },
}));

// ==========================================================================
// VERSION HISTORY STORE
// ==========================================================================
export interface VersionRecord {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  size: number;
  timestamp: number;
  auto_saved: number;
}

interface VersionHistoryState {
  versions: VersionRecord[];
  loading: boolean;
  panelOpen: boolean;
  currentApp: string;
  currentProjectId: string;
  setPanelOpen: (open: boolean) => void;
  loadVersions: (app: string, projectId: string) => Promise<void>;
  saveVersion: (app: string, projectId: string, name: string, state: any, autoSaved: boolean) => Promise<number>;
  restoreVersion: (versionId: number, currentState: any) => Promise<any>;
  deleteVersion: (versionId: number) => Promise<void>;
  markDirty: (app: string, projectId: string) => Promise<void>;
}

export const useVersionHistoryStore = create<VersionHistoryState>((set, get) => ({
  versions: [],
  loading: false,
  panelOpen: false,
  currentApp: '',
  currentProjectId: '',

  setPanelOpen: (open) => set({ panelOpen: open }),

  loadVersions: async (app, projectId) => {
    set({ loading: true, currentApp: app, currentProjectId: projectId });
    const data = await invoke('version-history:getVersions', app, projectId);
    set({ versions: data || [], loading: false });
  },

  saveVersion: async (app, projectId, name, state, autoSaved) => {
    const id = await invoke('version-history:save', app, projectId, name, state, autoSaved);
    if (get().currentApp === app && get().currentProjectId === projectId) {
      await get().loadVersions(app, projectId);
    }
    return id;
  },

  restoreVersion: async (versionId, currentState) => {
    const { currentApp, currentProjectId } = get();
    const result = await invoke('version-history:restore', currentApp, currentProjectId, versionId, currentState);
    if (result) await get().loadVersions(currentApp, currentProjectId);
    return result;
  },

  deleteVersion: async (versionId) => {
    await invoke('version-history:delete', versionId);
    set((s) => ({ versions: s.versions.filter((v) => v.id !== versionId) }));
  },

  markDirty: async (app, projectId) => {
    await invoke('version-history:markDirty', app, projectId);
  },
}));

// ==========================================================================
// TASK QUEUE STORE
// ==========================================================================
export interface TaskRecord {
  id: string;
  name: string;
  app: string;
  priority: string;
  status: string;
  progress: number;
  progressTotal: number;
  progressPercent: number;
  estimatedDurationMs: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

interface TaskQueueState {
  tasks: TaskRecord[];
  visible: boolean;
  selectedTaskId: string | null;
  setSelectedTask: (id: string | null) => void;
  loadTasks: () => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  updateTasks: (tasks: TaskRecord[]) => void;
  updateProgress: (id: string, progress: number, total: number, percent: number) => void;
}

export const useTaskQueueStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  visible: false,
  selectedTaskId: null,

  setSelectedTask: (id) => set({ selectedTaskId: id }),

  loadTasks: async () => {
    const data = await invoke('task-queue:getActive');
    const tasks = data || [];
    set({ tasks, visible: tasks.length > 0 });
  },

  cancelTask: async (id) => {
    await invoke('task-queue:cancel', id);
    await get().loadTasks();
  },

  retryTask: async (id) => {
    await invoke('task-queue:retry', id);
    await get().loadTasks();
  },

  updateTasks: (tasks) => set({ tasks, visible: tasks.length > 0 }),

  updateProgress: (id, progress, total, percent) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, progress, progressTotal: total, progressPercent: percent } : t
      ),
    }));
  },
}));

// ==========================================================================
// RECYCLE BIN STORE
// ==========================================================================
export interface RecycleBinItem {
  id: number;
  app: string;
  item_type: string;
  item_name: string;
  item_data: string;
  original_location: string;
  deleted_at: number;
  expires_at: number;
}

interface RecycleBinState {
  items: RecycleBinItem[];
  count: number;
  appFilter: string;
  loading: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setAppFilter: (f: string) => void;
  loadItems: () => Promise<void>;
  loadCount: () => Promise<void>;
  restoreItem: (id: number) => Promise<any>;
  permanentlyDelete: (id: number) => Promise<void>;
  emptyAll: () => Promise<void>;
  deleteItem: (app: string, itemType: string, itemName: string, itemData: any, originalLocation?: string) => Promise<number>;
}

export const useRecycleBinStore = create<RecycleBinState>((set, get) => ({
  items: [],
  count: 0,
  appFilter: 'all',
  loading: false,
  panelOpen: false,

  setPanelOpen: (open) => set({ panelOpen: open }),
  setAppFilter: (f) => { set({ appFilter: f }); get().loadItems(); },

  loadItems: async () => {
    set({ loading: true });
    const filter = get().appFilter === 'all' ? undefined : get().appFilter;
    const data = await invoke('recycle-bin:getAll', filter);
    set({ items: data || [], loading: false });
  },

  loadCount: async () => {
    const count = await invoke('recycle-bin:getCount');
    set({ count: count || 0 });
  },

  restoreItem: async (id) => {
    const result = await invoke('recycle-bin:restore', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    await get().loadCount();
    return result;
  },

  permanentlyDelete: async (id) => {
    await invoke('recycle-bin:permanentlyDelete', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    await get().loadCount();
  },

  emptyAll: async () => {
    await invoke('recycle-bin:emptyAll');
    set({ items: [], count: 0 });
  },

  deleteItem: async (app, itemType, itemName, itemData, originalLocation) => {
    const id = await invoke('recycle-bin:delete', app, itemType, itemName, itemData, originalLocation || '');
    await get().loadCount();
    return id;
  },
}));

// ==========================================================================
// WORKSPACE LAYOUTS STORE
// ==========================================================================
interface LayoutInfo {
  id: number;
  name: string;
  builtIn: boolean;
  createdAt: number;
}

interface WorkspaceLayoutState {
  layouts: LayoutInfo[];
  panelOpen: boolean;
  loading: boolean;
  setPanelOpen: (open: boolean) => void;
  loadLayouts: () => Promise<void>;
  saveCurrentAs: (name: string) => Promise<number>;
  applyLayout: (name: string) => Promise<void>;
  deleteLayout: (name: string) => Promise<void>;
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>((set, get) => ({
  layouts: [],
  panelOpen: false,
  loading: false,

  setPanelOpen: (open) => set({ panelOpen: open }),

  loadLayouts: async () => {
    set({ loading: true });
    const data = await invoke('layout:getAll');
    set({ layouts: data || [], loading: false });
  },

  saveCurrentAs: async (name) => {
    const id = await invoke('layout:saveCurrentAs', name);
    await get().loadLayouts();
    return id;
  },

  applyLayout: async (name) => {
    await invoke('layout:apply', name);
  },

  deleteLayout: async (name) => {
    await invoke('layout:delete', name);
    set((s) => ({ layouts: s.layouts.filter((l) => l.name !== name) }));
  },
}));

// ==========================================================================
// SCRATCHPAD STORE
// ==========================================================================
interface ScratchpadState {
  content: string;
  isOpen: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setContent: (content: string) => void;
  loadState: () => Promise<void>;
  savePosition: (x: number, y: number, w: number, h: number) => Promise<void>;
  clearContent: () => Promise<void>;
  sendToNotes: () => Promise<{ content: string } | null>;
}

export const useScratchpadStore = create<ScratchpadState>((set, get) => ({
  content: '',
  isOpen: false,
  position: { x: -1, y: -1 },
  size: { width: 400, height: 300 },

  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  setContent: (content) => {
    set({ content });
    invoke('scratchpad:updateContent', content);
  },

  loadState: async () => {
    const state = await invoke('scratchpad:getState');
    if (state) {
      set({
        content: state.content || '',
        position: { x: state.positionX, y: state.positionY },
        size: { width: state.width, height: state.height },
      });
    }
  },

  savePosition: async (x, y, w, h) => {
    set({ position: { x, y }, size: { width: w, height: h } });
    await invoke('scratchpad:updatePosition', x, y, w, h);
  },

  clearContent: async () => {
    await invoke('scratchpad:clear');
    set({ content: '' });
  },

  sendToNotes: async () => {
    const result = await invoke('scratchpad:sendToNotes');
    if (result) set({ content: '' });
    return result;
  },
}));

// ==========================================================================
// FEEDBACK STORE
// ==========================================================================
interface FeedbackState {
  panelOpen: boolean;
  reportType: 'bug' | 'feature' | 'general';
  description: string;
  includeSystemInfo: boolean;
  submitting: boolean;
  submitted: boolean;
  savedPath: string;
  systemInfoPreview: any;
  showSystemInfo: boolean;
  setPanelOpen: (open: boolean) => void;
  setReportType: (type: 'bug' | 'feature' | 'general') => void;
  setDescription: (desc: string) => void;
  setIncludeSystemInfo: (include: boolean) => void;
  setShowSystemInfo: (show: boolean) => void;
  submit: () => Promise<void>;
  loadSystemInfoPreview: () => Promise<void>;
  reset: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  panelOpen: false,
  reportType: 'bug',
  description: '',
  includeSystemInfo: true,
  submitting: false,
  submitted: false,
  savedPath: '',
  systemInfoPreview: null,
  showSystemInfo: false,

  setPanelOpen: (open) => { set({ panelOpen: open }); if (open) get().reset(); },
  setReportType: (type) => set({ reportType: type }),
  setDescription: (desc) => set({ description: desc }),
  setIncludeSystemInfo: (include) => set({ includeSystemInfo: include }),
  setShowSystemInfo: (show) => set({ showSystemInfo: show }),

  submit: async () => {
    const { reportType, description, includeSystemInfo } = get();
    if (!description.trim()) return;
    set({ submitting: true });
    const result = await invoke('feedback:submit', reportType, description, includeSystemInfo);
    set({ submitting: false, submitted: true, savedPath: result?.filePath || '' });
  },

  loadSystemInfoPreview: async () => {
    const info = await invoke('feedback:getSystemInfoPreview');
    set({ systemInfoPreview: info });
  },

  reset: () => set({
    reportType: 'bug',
    description: '',
    includeSystemInfo: true,
    submitting: false,
    submitted: false,
    savedPath: '',
    systemInfoPreview: null,
    showSystemInfo: false,
  }),
}));

// ==========================================================================
// LOCALIZATION STORE
// ==========================================================================
interface LocalizationState {
  language: string;
  strings: Record<string, string>;
  loaded: boolean;
  loadStrings: () => Promise<void>;
  setLanguage: (lang: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const useLocalizationStore = create<LocalizationState>((set, get) => ({
  language: 'en',
  strings: {},
  loaded: false,

  loadStrings: async () => {
    const lang = await invoke('localization:getLanguage');
    const strings = await invoke('localization:getAllStrings');
    set({ language: lang || 'en', strings: strings || {}, loaded: true });
  },

  setLanguage: async (lang) => {
    await invoke('localization:setLanguage', lang);
    const strings = await invoke('localization:getAllStrings');
    set({ language: lang, strings: strings || {} });
  },

  t: (key, params) => {
    let value = get().strings[key];
    if (!value) return key;
    if (params) {
      for (const [pk, pv] of Object.entries(params)) {
        value = value.replace(`{${pk}}`, String(pv));
      }
    }
    return value;
  },
}));

// ==========================================================================
// BATCH OPERATIONS STORE
// ==========================================================================
interface BatchState {
  selectedItems: Map<string, any>;
  selectionApp: string;
  batchBarVisible: boolean;
  availableActions: string[];
  selectItem: (id: string, data: any) => void;
  deselectItem: (id: string) => void;
  toggleItem: (id: string, data: any) => void;
  selectRange: (items: Array<{ id: string; data: any }>) => void;
  selectAll: (items: Array<{ id: string; data: any }>) => void;
  clearSelection: () => void;
  setSelectionApp: (app: string) => void;
  loadAvailableActions: (app: string) => Promise<void>;
  executeBatch: (action: string, params?: any) => Promise<any>;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  selectedItems: new Map(),
  selectionApp: '',
  batchBarVisible: false,
  availableActions: [],

  selectItem: (id, data) => {
    set((s) => {
      const next = new Map(s.selectedItems);
      next.set(id, data);
      return { selectedItems: next, batchBarVisible: next.size > 0 };
    });
  },

  deselectItem: (id) => {
    set((s) => {
      const next = new Map(s.selectedItems);
      next.delete(id);
      return { selectedItems: next, batchBarVisible: next.size > 0 };
    });
  },

  toggleItem: (id, data) => {
    const { selectedItems } = get();
    if (selectedItems.has(id)) get().deselectItem(id);
    else get().selectItem(id, data);
  },

  selectRange: (items) => {
    set(() => {
      const next = new Map<string, any>();
      for (const item of items) next.set(item.id, item.data);
      return { selectedItems: next, batchBarVisible: next.size > 0 };
    });
  },

  selectAll: (items) => {
    set(() => {
      const next = new Map<string, any>();
      for (const item of items) next.set(item.id, item.data);
      return { selectedItems: next, batchBarVisible: next.size > 0 };
    });
  },

  clearSelection: () => set({ selectedItems: new Map(), batchBarVisible: false }),

  setSelectionApp: (app) => {
    set({ selectionApp: app });
    get().loadAvailableActions(app);
  },

  loadAvailableActions: async (app) => {
    const actions = await invoke('batch:getActions', app);
    set({ availableActions: actions || [] });
  },

  executeBatch: async (action, params) => {
    const { selectedItems, selectionApp } = get();
    const items = Array.from(selectedItems.entries()).map(([id, data]) => ({
      id,
      name: data?.name || data?.title || id,
      type: data?.type || 'item',
      data,
    }));
    const batchId = await invoke('batch:create', selectionApp, action, items, params);
    if (batchId) {
      const result = await invoke('batch:execute', batchId);
      get().clearSelection();
      return result;
    }
    return null;
  },
}));

// ==========================================================================
// MULTI WINDOW STORE
// ==========================================================================
interface MultiWindowState {
  detachedApps: string[];
  loadDetachedApps: () => Promise<void>;
  detachApp: (appId: string) => Promise<boolean>;
  reattachApp: (appId: string) => Promise<boolean>;
  isDetached: (appId: string) => boolean;
}

export const useMultiWindowStore = create<MultiWindowState>((set, get) => ({
  detachedApps: [],

  loadDetachedApps: async () => {
    const apps = await invoke('multiwindow:getDetachedApps');
    set({ detachedApps: apps || [] });
  },

  detachApp: async (appId) => {
    const result = await invoke('multiwindow:detach', appId);
    if (result) {
      set((s) => ({ detachedApps: [...s.detachedApps, appId] }));
    }
    return result;
  },

  reattachApp: async (appId) => {
    const result = await invoke('multiwindow:reattach', appId);
    if (result) {
      set((s) => ({ detachedApps: s.detachedApps.filter((a) => a !== appId) }));
    }
    return result;
  },

  isDetached: (appId) => get().detachedApps.includes(appId),
}));
