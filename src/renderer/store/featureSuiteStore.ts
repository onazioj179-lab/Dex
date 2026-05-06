// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Feature Suite Stores
// Zustand stores for all 38 new subsystems.
// ==========================================================================

import { create } from 'zustand';

// ==========================================================================
// IPC Helper
// ==========================================================================
const invoke = async (channel: string, ...args: any[]): Promise<any> => {
  try {
    return await (window as any).dex?.invoke(channel, ...args);
  } catch (err) {
    console.warn(`[FeatureStore] IPC invoke failed for ${channel}:`, err);
    return null;
  }
};

// ==========================================================================
// 1. SESSION REPLAY STORE
// ==========================================================================
interface SessionReplayState {
  sessions: any[];
  currentActions: any[];
  loading: boolean;
  loadSessions: () => Promise<void>;
  loadSessionActions: (sessionId: string) => Promise<void>;
  getCurrentSession: () => Promise<string | null>;
}

export const useSessionReplayStore = create<SessionReplayState>((set) => ({
  sessions: [],
  currentActions: [],
  loading: false,
  loadSessions: async () => {
    set({ loading: true });
    const data = await invoke('session-replay:getSessions');
    set({ sessions: data || [], loading: false });
  },
  loadSessionActions: async (sessionId) => {
    const data = await invoke('session-replay:getSessionActions', sessionId);
    set({ currentActions: data || [] });
  },
  getCurrentSession: async () => {
    return await invoke('session-replay:getCurrentSession');
  },
}));

// ==========================================================================
// 2. PROJECT LINKER STORE
// ==========================================================================
interface ProjectLinkerState {
  links: any[];
  loading: boolean;
  loadLinks: (app: string, projectId: string) => Promise<void>;
  addLink: (sourceApp: string, sourceId: string, targetApp: string, targetId: string, linkType: string) => Promise<any>;
  removeLink: (id: number) => Promise<void>;
  getLinked: (app: string, projectId: string) => Promise<any[]>;
}

export const useProjectLinkerStore = create<ProjectLinkerState>((set) => ({
  links: [],
  loading: false,
  loadLinks: async (app, projectId) => {
    set({ loading: true });
    const data = await invoke('project-linker:getLinksFor', app, projectId);
    set({ links: data || [], loading: false });
  },
  addLink: async (sourceApp, sourceId, targetApp, targetId, linkType) => {
    return await invoke('project-linker:addLink', sourceApp, sourceId, targetApp, targetId, linkType);
  },
  removeLink: async (id) => {
    await invoke('project-linker:removeLink', id);
    set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
  },
  getLinked: async (app, projectId) => {
    return (await invoke('project-linker:getAllLinks', app, projectId)) || [];
  },
}));

// ==========================================================================
// 3. DAILY BRIEFING STORE
// ==========================================================================
interface DailyBriefingState {
  briefing: any | null;
  shown: boolean;
  loading: boolean;
  loadBriefing: () => Promise<void>;
  dismissBriefing: () => Promise<void>;
}

export const useDailyBriefingStore = create<DailyBriefingState>((set) => ({
  briefing: null,
  shown: false,
  loading: false,
  loadBriefing: async () => {
    set({ loading: true });
    const data = await invoke('daily-briefing:getData');
    set({ briefing: data, shown: !!data, loading: false });
  },
  dismissBriefing: async () => {
    await invoke('daily-briefing:dismiss');
    set({ shown: false });
  },
}));

// ==========================================================================
// 4. RELATIONSHIP GRAPH STORE
// ==========================================================================
interface RelationshipGraphState {
  graphData: any | null;
  loading: boolean;
  loadGraph: (app?: string) => Promise<void>;
  refreshGraph: () => Promise<void>;
  savePositions: (positions: Array<{ nodeId: string; x: number; y: number }>) => Promise<void>;
}

export const useRelationshipGraphStore = create<RelationshipGraphState>((set) => ({
  graphData: null,
  loading: false,
  loadGraph: async (app) => {
    set({ loading: true });
    const data = await invoke('relationship-graph:getCached', app);
    set({ graphData: data, loading: false });
  },
  refreshGraph: async () => {
    const data = await invoke('relationship-graph:compute');
    set({ graphData: data });
  },
  savePositions: async (positions) => {
    for (const pos of positions) {
      await invoke('relationship-graph:saveNodePosition', pos.nodeId, pos.x, pos.y);
    }
  },
}));

// ==========================================================================
// 5. TIME TRACKING STORE
// ==========================================================================
interface TimeTrackingState {
  activeProject: string | null;
  todayTotal: number;
  reports: any[];
  loading: boolean;
  startTracking: (app: string, projectId: string, projectName: string) => Promise<void>;
  stopTracking: () => Promise<void>;
  getActiveSession: () => Promise<any>;
  getDailyReport: (date?: string) => Promise<any>;
  getWeeklyReport: () => Promise<any>;
  getProjectReport: (app: string, projectId: string) => Promise<any>;
  exportReport: (format: string) => Promise<string | null>;
}

export const useTimeTrackingStore = create<TimeTrackingState>((set) => ({
  activeProject: null,
  todayTotal: 0,
  reports: [],
  loading: false,
  startTracking: async (app, projectId, projectName) => {
    await invoke('time-tracking:startTracking', app, projectId, projectName);
    set({ activeProject: projectId });
  },
  stopTracking: async () => {
    await invoke('time-tracking:stopTracking');
    set({ activeProject: null });
  },
  getActiveSession: async () => {
    return await invoke('time-tracking:getTodayTotal');
  },
  getDailyReport: async (date) => {
    return await invoke('time-tracking:getDailyReport', date);
  },
  getWeeklyReport: async () => {
    return await invoke('time-tracking:getWeeklyByApp');
  },
  getProjectReport: async (app, projectId) => {
    return await invoke('time-tracking:getProjectTotal', app, projectId);
  },
  exportReport: async (format) => {
    return await invoke('time-tracking:exportReport', format);
  },
}));

// ==========================================================================
// 6. GOAL SYSTEM STORE
// ==========================================================================
interface GoalSystemState {
  goals: any[];
  loading: boolean;
  loadGoals: (weekStart?: string) => Promise<void>;
  addGoal: (goalText: string, weekStart?: string) => Promise<any>;
  updateGoal: (id: number, updates: any) => Promise<void>;
  removeGoal: (id: number) => Promise<void>;
  addProgress: (goalId: number, note: string) => Promise<void>;
  computeProgress: (goalId: number) => Promise<void>;
}

export const useGoalSystemStore = create<GoalSystemState>((set) => ({
  goals: [],
  loading: false,
  loadGoals: async (weekStart) => {
    set({ loading: true });
    const data = await invoke('goal-system:getGoalHistory', weekStart);
    set({ goals: data || [], loading: false });
  },
  addGoal: async (goalText, weekStart) => {
    const goal = await invoke('goal-system:setGoal', goalText, weekStart);
    if (goal) set((s) => ({ goals: [...s.goals, goal] }));
    return goal;
  },
  updateGoal: async (id, updates) => {
    await invoke('goal-system:updateProgress', id, updates);
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));
  },
  removeGoal: async (id) => {
    await invoke('goal-system:completeGoal', id);
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
  },
  addProgress: async (goalId, note) => {
    await invoke('goal-system:addProgressNote', goalId, note);
  },
  computeProgress: async (goalId) => {
    await invoke('goal-system:autoCompute', goalId);
  },
}));

// ==========================================================================
// 7. SNAPSHOT COMPARISON STORE
// ==========================================================================
interface SnapshotComparisonState {
  comparison: any | null;
  loading: boolean;
  compareSnapshots: (app: string, snapshotId1: number, snapshotId2: number) => Promise<void>;
  restoreSnapshot: (app: string, snapshotId: number) => Promise<boolean>;
}

export const useSnapshotComparisonStore = create<SnapshotComparisonState>((set) => ({
  comparison: null,
  loading: false,
  compareSnapshots: async (app, snapshotId1, snapshotId2) => {
    set({ loading: true });
    const data = await invoke('snapshot-comparison:compare', app, snapshotId1, snapshotId2);
    set({ comparison: data, loading: false });
  },
  restoreSnapshot: async (app, snapshotId) => {
    return await invoke('snapshot-comparison:restore', app, snapshotId);
  },
}));

// ==========================================================================
// 8. PROJECT HEALTH STORE
// ==========================================================================
interface ProjectHealthState {
  healthData: any[];
  loading: boolean;
  loadHealth: (app?: string) => Promise<void>;
  computeHealth: (app: string, projectId: string, projectName: string, projectData: any) => Promise<any>;
  getHealthForProject: (app: string, projectId: string) => Promise<any>;
}

export const useProjectHealthStore = create<ProjectHealthState>((set) => ({
  healthData: [],
  loading: false,
  loadHealth: async (app) => {
    set({ loading: true });
    const data = await invoke('project-health:getAll', app);
    set({ healthData: data || [], loading: false });
  },
  computeHealth: async (app, projectId, projectName, projectData) => {
    return await invoke('project-health:compute', app, projectId, projectName, projectData);
  },
  getHealthForProject: async (app, projectId) => {
    return await invoke('project-health:get', app, projectId);
  },
}));

// ==========================================================================
// 9. DUPLICATION DETECTOR STORE
// ==========================================================================
interface DuplicationDetectorState {
  groups: any[];
  loading: boolean;
  scan: (app: string) => Promise<void>;
  dismissGroup: (id: number) => Promise<void>;
  getActive: (app?: string) => Promise<any[]>;
}

export const useDuplicationDetectorStore = create<DuplicationDetectorState>((set) => ({
  groups: [],
  loading: false,
  scan: async (app) => {
    set({ loading: true });
    const data = await invoke('duplication-detector:run', app);
    set({ groups: data || [], loading: false });
  },
  dismissGroup: async (id) => {
    await invoke('duplication-detector:dismiss', id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
  getActive: async (app) => {
    return (await invoke('duplication-detector:getGroups', app)) || [];
  },
}));

// ==========================================================================
// 10. KEYBOARD NAVIGATION STORE
// ==========================================================================
interface KeyboardNavState {
  enabled: boolean;
  toggle: () => Promise<void>;
  loadState: () => Promise<void>;
}

export const useKeyboardNavStore = create<KeyboardNavState>((set) => ({
  enabled: false,
  toggle: async () => {
    const result = await invoke('keyboard-nav:toggle');
    set({ enabled: !!result });
  },
  loadState: async () => {
    const state = await invoke('keyboard-nav:getState');
    set({ enabled: !!state });
  },
}));

// ==========================================================================
// 11. PROJECT ARCHIVER STORE
// ==========================================================================
interface ProjectArchiverState {
  archives: any[];
  loading: boolean;
  loadArchives: () => Promise<void>;
  archive: (app: string, projectName: string, projectData: any) => Promise<any>;
  unarchive: (id: number) => Promise<any>;
  getEligible: (app: string) => Promise<any[]>;
}

export const useProjectArchiverStore = create<ProjectArchiverState>((set) => ({
  archives: [],
  loading: false,
  loadArchives: async () => {
    set({ loading: true });
    const data = await invoke('project-archiver:getAll');
    set({ archives: data || [], loading: false });
  },
  archive: async (app, projectName, projectData) => {
    const result = await invoke('project-archiver:archive', app, projectName, projectData);
    if (result) set((s) => ({ archives: [...s.archives, result] }));
    return result;
  },
  unarchive: async (id) => {
    const data = await invoke('project-archiver:unarchive', id);
    set((s) => ({ archives: s.archives.filter((a) => a.id !== id) }));
    return data;
  },
  getEligible: async (app) => {
    return (await invoke('project-archiver:getEligible', app)) || [];
  },
}));

// ==========================================================================
// 12. DAILY NOTE STORE
// ==========================================================================
interface DailyNoteState {
  todayNote: any | null;
  notes: any[];
  loading: boolean;
  loadToday: () => Promise<void>;
  loadNotes: (limit?: number) => Promise<void>;
  updateNote: (id: number, content: string) => Promise<void>;
}

export const useDailyNoteStore = create<DailyNoteState>((set) => ({
  todayNote: null,
  notes: [],
  loading: false,
  loadToday: async () => {
    set({ loading: true });
    const data = await invoke('daily-note:getToday');
    set({ todayNote: data, loading: false });
  },
  loadNotes: async (limit) => {
    const data = await invoke('daily-note:getAll', limit);
    set({ notes: data || [] });
  },
  updateNote: async (id, content) => {
    await invoke('daily-note:updateContent', id, content);
    set((s) => ({
      todayNote: s.todayNote?.id === id ? { ...s.todayNote, content } : s.todayNote,
      notes: s.notes.map((n) => (n.id === id ? { ...n, content } : n)),
    }));
  },
}));

// ==========================================================================
// 13. CONTENT EXPIRY STORE
// ==========================================================================
interface ContentExpiryState {
  items: any[];
  loading: boolean;
  loadItems: (app?: string) => Promise<void>;
  setExpiry: (app: string, itemType: string, itemId: string, itemName: string, expiresAt: string) => Promise<any>;
  removeExpiry: (id: number) => Promise<void>;
}

export const useContentExpiryStore = create<ContentExpiryState>((set) => ({
  items: [],
  loading: false,
  loadItems: async (app) => {
    set({ loading: true });
    const data = await invoke('content-expiry:getAll', app);
    set({ items: data || [], loading: false });
  },
  setExpiry: async (app, itemType, itemId, itemName, expiresAt) => {
    return await invoke('content-expiry:set', app, itemType, itemId, itemName, expiresAt);
  },
  removeExpiry: async (id) => {
    await invoke('content-expiry:remove', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

// ==========================================================================
// 14. SEARCH HISTORY STORE
// ==========================================================================
interface SearchHistoryState {
  history: any[];
  frequentQueries: any[];
  loading: boolean;
  loadHistory: (app?: string) => Promise<void>;
  loadFrequent: () => Promise<void>;
  recordSearch: (app: string, query: string, resultClicked?: string, resultType?: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set) => ({
  history: [],
  frequentQueries: [],
  loading: false,
  loadHistory: async (app) => {
    set({ loading: true });
    const data = await invoke('search-history:get', app);
    set({ history: data || [], loading: false });
  },
  loadFrequent: async () => {
    const data = await invoke('search-history:getFrequent');
    set({ frequentQueries: data || [] });
  },
  recordSearch: async (app, query, resultClicked, resultType) => {
    await invoke('search-history:record', app, query, resultClicked, resultType);
  },
  clearHistory: async () => {
    await invoke('search-history:clear');
    set({ history: [], frequentQueries: [] });
  },
}));

// ==========================================================================
// 15. LIVE COLLABORATION STORE
// ==========================================================================
interface LiveCollaborationState {
  peers: any[];
  loading: boolean;
  loadPeers: () => Promise<void>;
}

export const useLiveCollaborationStore = create<LiveCollaborationState>((set) => ({
  peers: [],
  loading: false,
  loadPeers: async () => {
    set({ loading: true });
    const data = await invoke('live-collaboration:getPeers');
    set({ peers: data || [], loading: false });
  },
}));

// ==========================================================================
// 16. SMART GROUPING STORE
// ==========================================================================
interface SmartGroupingState {
  groups: any[];
  loading: boolean;
  computeGroups: (app: string) => Promise<void>;
  dismissGroup: (id: number) => Promise<void>;
  convertToTag: (id: number) => Promise<void>;
}

export const useSmartGroupingStore = create<SmartGroupingState>((set) => ({
  groups: [],
  loading: false,
  computeGroups: async (app) => {
    set({ loading: true });
    const data = await invoke('smart-grouping:compute', app);
    set({ groups: data || [], loading: false });
  },
  dismissGroup: async (id) => {
    await invoke('smart-grouping:dismiss', id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
  convertToTag: async (id) => {
    await invoke('smart-grouping:convertToTag', id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
}));

// ==========================================================================
// 17. VOICE MEMO STORE
// ==========================================================================
interface VoiceMemoState {
  memos: any[];
  loading: boolean;
  loadMemos: (app: string, parentType?: string, parentId?: string) => Promise<void>;
  saveMemo: (app: string, parentType: string, parentId: string, buffer: ArrayBuffer, durationMs: number) => Promise<any>;
  deleteMemo: (id: number) => Promise<void>;
  transcribe: (id: number) => Promise<string | null>;
}

export const useVoiceMemoStore = create<VoiceMemoState>((set) => ({
  memos: [],
  loading: false,
  loadMemos: async (app, parentType, parentId) => {
    set({ loading: true });
    const data = await invoke('voice-memo:get', app, parentType, parentId);
    set({ memos: data || [], loading: false });
  },
  saveMemo: async (app, parentType, parentId, buffer, durationMs) => {
    return await invoke('voice-memo:save', app, parentType, parentId, buffer, durationMs);
  },
  deleteMemo: async (id) => {
    await invoke('voice-memo:delete', id);
    set((s) => ({ memos: s.memos.filter((m) => m.id !== id) }));
  },
  transcribe: async (id) => {
    return await invoke('voice-memo:transcribe', id);
  },
}));

// ==========================================================================
// 18. PROJECT TIMELINE STORE
// ==========================================================================
interface ProjectTimelineState {
  timeline: any | null;
  loading: boolean;
  loadTimeline: (app: string, projectId: string, startDate?: string, endDate?: string) => Promise<void>;
  getByType: (app: string, projectId: string, eventType: string) => Promise<any[]>;
}

export const useProjectTimelineStore = create<ProjectTimelineState>((set) => ({
  timeline: null,
  loading: false,
  loadTimeline: async (app, projectId, startDate, endDate) => {
    set({ loading: true });
    const data = await invoke('project-timeline:get', app, projectId, startDate, endDate);
    set({ timeline: data, loading: false });
  },
  getByType: async (app, projectId, eventType) => {
    return (await invoke('project-timeline:getByType', app, projectId, eventType)) || [];
  },
}));

// ==========================================================================
// 19. LINK PREVIEW STORE
// ==========================================================================
interface LinkPreviewState {
  previews: Record<string, any>;
  loading: boolean;
  fetchPreview: (url: string) => Promise<any>;
  getCachedPreview: (url: string) => Promise<any>;
}

export const useLinkPreviewStore = create<LinkPreviewState>((set) => ({
  previews: {},
  loading: false,
  fetchPreview: async (url) => {
    set({ loading: true });
    const data = await invoke('link-preview:fetch', url);
    if (data) {
      set((s) => ({ previews: { ...s.previews, [url]: data }, loading: false }));
    } else {
      set({ loading: false });
    }
    return data;
  },
  getCachedPreview: async (url) => {
    return await invoke('link-preview:getCached', url);
  },
}));

// ==========================================================================
// 20. STATISTICS DASHBOARD STORE
// ==========================================================================
interface StatisticsDashboardState {
  stats: any | null;
  loading: boolean;
  loadStats: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

export const useStatisticsDashboardStore = create<StatisticsDashboardState>((set) => ({
  stats: null,
  loading: false,
  loadStats: async () => {
    set({ loading: true });
    const data = await invoke('stats-dashboard:get');
    set({ stats: data, loading: false });
  },
  refreshStats: async () => {
    const data = await invoke('stats-dashboard:refresh');
    set({ stats: data });
  },
}));

// ==========================================================================
// 21. PROJECT EXPORT BUNDLE STORE
// ==========================================================================
interface ProjectExportBundleState {
  exporting: boolean;
  exportBundle: (app: string, projectId: string, projectName: string, projectData: any) => Promise<string | null>;
}

export const useProjectExportBundleStore = create<ProjectExportBundleState>((set) => ({
  exporting: false,
  exportBundle: async (app, projectId, projectName, projectData) => {
    set({ exporting: true });
    const result = await invoke('export-bundle:export', app, projectId, projectName, projectData);
    set({ exporting: false });
    return result;
  },
}));

// ==========================================================================
// 22. FILE WATCHER STORE
// ==========================================================================
interface FileWatcherState {
  watchedFolders: any[];
  loading: boolean;
  loadFolders: () => Promise<void>;
  addFolder: (folderPath: string, fileTypes: string[], importBehavior: string) => Promise<any>;
  removeFolder: (id: number) => Promise<void>;
}

export const useFileWatcherStore = create<FileWatcherState>((set) => ({
  watchedFolders: [],
  loading: false,
  loadFolders: async () => {
    set({ loading: true });
    const data = await invoke('file-watcher:list');
    set({ watchedFolders: data || [], loading: false });
  },
  addFolder: async (folderPath, fileTypes, importBehavior) => {
    const result = await invoke('file-watcher:add', folderPath, fileTypes, importBehavior);
    if (result) set((s) => ({ watchedFolders: [...s.watchedFolders, result] }));
    return result;
  },
  removeFolder: async (id) => {
    await invoke('file-watcher:remove', id);
    set((s) => ({ watchedFolders: s.watchedFolders.filter((f) => f.id !== id) }));
  },
}));

// ==========================================================================
// 23. WORD COUNT STORE
// ==========================================================================
interface WordCountState {
  todayCount: number;
  weekCount: number;
  dailyGoal: number;
  progress: { current: number; goal: number; percentage: number } | null;
  history: any[];
  loading: boolean;
  loadCounts: () => Promise<void>;
  loadHistory: (days?: number) => Promise<void>;
  loadProgress: () => Promise<void>;
  recordDelta: (app: string, oldText: string, newText: string) => Promise<number>;
  setGoal: (goal: number) => Promise<void>;
}

export const useWordCountStore = create<WordCountState>((set) => ({
  todayCount: 0,
  weekCount: 0,
  dailyGoal: 0,
  progress: null,
  history: [],
  loading: false,
  loadCounts: async () => {
    set({ loading: true });
    const [today, week, goal] = await Promise.all([
      invoke('word-count:getToday'),
      invoke('word-count:getWeek'),
      invoke('word-count:getGoal'),
    ]);
    set({ todayCount: today || 0, weekCount: week || 0, dailyGoal: goal || 0, loading: false });
  },
  loadHistory: async (days) => {
    const data = await invoke('word-count:getHistory', days);
    set({ history: data || [] });
  },
  loadProgress: async () => {
    const data = await invoke('word-count:getProgress');
    set({ progress: data });
  },
  recordDelta: async (app, oldText, newText) => {
    return (await invoke('word-count:record', app, oldText, newText)) || 0;
  },
  setGoal: async (goal) => {
    await invoke('word-count:setGoal', goal);
    set({ dailyGoal: goal });
  },
}));

// ==========================================================================
// 24. SMART RENAME STORE
// ==========================================================================
interface SmartRenameState {
  history: any[];
  loading: boolean;
  rename: (app: string, itemType: string, itemId: string, oldName: string, newName: string) => Promise<{ success: boolean; referencesUpdated: number }>;
  loadHistory: (app?: string) => Promise<void>;
}

export const useSmartRenameStore = create<SmartRenameState>((set) => ({
  history: [],
  loading: false,
  rename: async (app, itemType, itemId, oldName, newName) => {
    const result = await invoke('smart-rename:rename', app, itemType, itemId, oldName, newName);
    return result || { success: false, referencesUpdated: 0 };
  },
  loadHistory: async (app) => {
    set({ loading: true });
    const data = await invoke('smart-rename:getHistory', app);
    set({ history: data || [], loading: false });
  },
}));

// ==========================================================================
// 25. VINX PRESENTATION STORE
// ==========================================================================
interface VinxPresentationState {
  presentations: any[];
  loading: boolean;
  loadPresentations: (projectId?: string) => Promise<void>;
  registerPresentation: (projectId: string, projectName: string, videoPath: string, durationMs?: number) => Promise<any>;
  launchPresentation: (id: number) => Promise<boolean>;
  closePresentation: () => Promise<void>;
  removePresentation: (id: number) => Promise<void>;
}

export const useVinxPresentationStore = create<VinxPresentationState>((set) => ({
  presentations: [],
  loading: false,
  loadPresentations: async (projectId) => {
    set({ loading: true });
    const data = await invoke('vinx-presentation:list', projectId);
    set({ presentations: data || [], loading: false });
  },
  registerPresentation: async (projectId, projectName, videoPath, durationMs) => {
    return await invoke('vinx-presentation:register', projectId, projectName, videoPath, durationMs);
  },
  launchPresentation: async (id) => {
    return (await invoke('vinx-presentation:launch', id)) || false;
  },
  closePresentation: async () => {
    await invoke('vinx-presentation:close');
  },
  removePresentation: async (id) => {
    await invoke('vinx-presentation:remove', id);
    set((s) => ({ presentations: s.presentations.filter((p) => p.id !== id) }));
  },
}));

// ==========================================================================
// 26. PROJECT COMPARISON STORE
// ==========================================================================
interface ProjectComparisonState {
  comparison: any | null;
  history: any[];
  loading: boolean;
  compare: (app: string, leftId: string, leftName: string, leftData: any, rightId: string, rightName: string, rightData: any) => Promise<void>;
  compareVersions: (app: string, leftId: string, rightId: string) => Promise<void>;
  loadHistory: (app?: string) => Promise<void>;
}

export const useProjectComparisonStore = create<ProjectComparisonState>((set) => ({
  comparison: null,
  history: [],
  loading: false,
  compare: async (app, leftId, leftName, leftData, rightId, rightName, rightData) => {
    set({ loading: true });
    const data = await invoke('project-comparison:compare', app, leftId, leftName, leftData, rightId, rightName, rightData);
    set({ comparison: data, loading: false });
  },
  compareVersions: async (app, leftId, rightId) => {
    set({ loading: true });
    const data = await invoke('project-comparison:compareVersions', app, leftId, rightId);
    set({ comparison: data, loading: false });
  },
  loadHistory: async (app) => {
    const data = await invoke('project-comparison:getHistory', app);
    set({ history: data || [] });
  },
}));

// ==========================================================================
// 27. CUSTOM DASHBOARD STORE
// ==========================================================================
interface CustomDashboardState {
  layouts: any[];
  activeLayout: any | null;
  widgetTypes: string[];
  loading: boolean;
  loadLayouts: () => Promise<void>;
  loadDefault: () => Promise<void>;
  createLayout: (name: string, widgets?: any[]) => Promise<any>;
  updateLayout: (id: number, updates: any) => Promise<void>;
  setDefault: (id: number) => Promise<void>;
  deleteLayout: (id: number) => Promise<void>;
  addWidget: (layoutId: number, widget: any) => Promise<void>;
  removeWidget: (layoutId: number, widgetId: string) => Promise<void>;
  loadWidgetTypes: () => Promise<void>;
}

export const useCustomDashboardStore = create<CustomDashboardState>((set) => ({
  layouts: [],
  activeLayout: null,
  widgetTypes: [],
  loading: false,
  loadLayouts: async () => {
    set({ loading: true });
    const data = await invoke('dashboard:getLayouts');
    set({ layouts: data || [], loading: false });
  },
  loadDefault: async () => {
    set({ loading: true });
    const data = await invoke('dashboard:getDefault');
    set({ activeLayout: data, loading: false });
  },
  createLayout: async (name, widgets) => {
    const result = await invoke('dashboard:create', name, widgets);
    if (result) set((s) => ({ layouts: [...s.layouts, result] }));
    return result;
  },
  updateLayout: async (id, updates) => {
    const result = await invoke('dashboard:update', id, updates);
    if (result) {
      set((s) => ({
        layouts: s.layouts.map((l) => (l.id === id ? result : l)),
        activeLayout: s.activeLayout?.id === id ? result : s.activeLayout,
      }));
    }
  },
  setDefault: async (id) => {
    await invoke('dashboard:setDefault', id);
  },
  deleteLayout: async (id) => {
    await invoke('dashboard:delete', id);
    set((s) => ({ layouts: s.layouts.filter((l) => l.id !== id) }));
  },
  addWidget: async (layoutId, widget) => {
    const result = await invoke('dashboard:addWidget', layoutId, widget);
    if (result) {
      set((s) => ({
        activeLayout: s.activeLayout?.id === layoutId ? result : s.activeLayout,
      }));
    }
  },
  removeWidget: async (layoutId, widgetId) => {
    const result = await invoke('dashboard:removeWidget', layoutId, widgetId);
    if (result) {
      set((s) => ({
        activeLayout: s.activeLayout?.id === layoutId ? result : s.activeLayout,
      }));
    }
  },
  loadWidgetTypes: async () => {
    const data = await invoke('dashboard:getWidgetTypes');
    set({ widgetTypes: data || [] });
  },
}));

// ==========================================================================
// 28. REMINDER STORE
// ==========================================================================
interface ReminderState {
  reminders: any[];
  upcoming: any[];
  loading: boolean;
  loadReminders: (includeCompleted?: boolean) => Promise<void>;
  loadUpcoming: (hours?: number) => Promise<void>;
  create: (params: any) => Promise<any>;
  snooze: (id: number, minutes: number) => Promise<void>;
  complete: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useReminderStore = create<ReminderState>((set) => ({
  reminders: [],
  upcoming: [],
  loading: false,
  loadReminders: async (includeCompleted) => {
    set({ loading: true });
    const data = await invoke('reminder:getAll', includeCompleted);
    set({ reminders: data || [], loading: false });
  },
  loadUpcoming: async (hours) => {
    const data = await invoke('reminder:getUpcoming', hours);
    set({ upcoming: data || [] });
  },
  create: async (params) => {
    const result = await invoke('reminder:create', params);
    if (result) set((s) => ({ reminders: [...s.reminders, result] }));
    return result;
  },
  snooze: async (id, minutes) => {
    await invoke('reminder:snooze', id, minutes);
  },
  complete: async (id) => {
    await invoke('reminder:complete', id);
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? { ...r, completed: 1 } : r)),
    }));
  },
  remove: async (id) => {
    await invoke('reminder:remove', id);
    set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
  },
}));

// ==========================================================================
// 29. FULL TEXT INDEX STORE
// ==========================================================================
interface FullTextIndexState {
  results: any[];
  stats: any | null;
  loading: boolean;
  search: (query: string, options?: { app?: string; itemType?: string; limit?: number }) => Promise<void>;
  index: (app: string, itemType: string, itemId: string, title: string, body: string) => Promise<void>;
  removeFromIndex: (app: string, itemType: string, itemId: string) => Promise<void>;
  rebuild: () => Promise<number>;
  loadStats: () => Promise<void>;
}

export const useFullTextIndexStore = create<FullTextIndexState>((set) => ({
  results: [],
  stats: null,
  loading: false,
  search: async (query, options) => {
    set({ loading: true });
    const data = await invoke('fts:search', query, options);
    set({ results: data || [], loading: false });
  },
  index: async (app, itemType, itemId, title, body) => {
    await invoke('fts:index', app, itemType, itemId, title, body);
  },
  removeFromIndex: async (app, itemType, itemId) => {
    await invoke('fts:remove', app, itemType, itemId);
  },
  rebuild: async () => {
    return (await invoke('fts:rebuild')) || 0;
  },
  loadStats: async () => {
    const data = await invoke('fts:stats');
    set({ stats: data });
  },
}));

// ==========================================================================
// 30. DEPENDENCIES STORE
// ==========================================================================
interface DependenciesState {
  dependencies: any[];
  dependents: any[];
  loading: boolean;
  loadDependencies: (app: string, sourceId: string) => Promise<void>;
  loadDependents: (app: string, targetId: string) => Promise<void>;
  addDependency: (app: string, sourceId: string, sourceName: string, targetId: string, targetName: string, depType?: string) => Promise<any>;
  removeDependency: (id: number) => Promise<void>;
  getChain: (app: string, sourceId: string) => Promise<string[][]>;
  getTypes: () => Promise<string[]>;
}

export const useDependenciesStore = create<DependenciesState>((set) => ({
  dependencies: [],
  dependents: [],
  loading: false,
  loadDependencies: async (app, sourceId) => {
    set({ loading: true });
    const data = await invoke('dependencies:get', app, sourceId);
    set({ dependencies: data || [], loading: false });
  },
  loadDependents: async (app, targetId) => {
    const data = await invoke('dependencies:getDependents', app, targetId);
    set({ dependents: data || [] });
  },
  addDependency: async (app, sourceId, sourceName, targetId, targetName, depType) => {
    const result = await invoke('dependencies:add', app, sourceId, sourceName, targetId, targetName, depType);
    if (result?.dependency) set((s) => ({ dependencies: [...s.dependencies, result.dependency] }));
    return result;
  },
  removeDependency: async (id) => {
    await invoke('dependencies:remove', id);
    set((s) => ({ dependencies: s.dependencies.filter((d) => d.id !== id) }));
  },
  getChain: async (app, sourceId) => {
    return (await invoke('dependencies:getChain', app, sourceId)) || [];
  },
  getTypes: async () => {
    return (await invoke('dependencies:getTypes')) || [];
  },
}));

// ==========================================================================
// 31. COLOR LABELS STORE
// ==========================================================================
interface ColorLabelsState {
  labels: any[];
  palette: any[];
  loading: boolean;
  loadLabels: (app?: string) => Promise<void>;
  loadPalette: () => Promise<void>;
  setLabel: (app: string, itemType: string, itemId: string, itemName: string, color: string, label?: string) => Promise<any>;
  removeLabel: (app: string, itemType: string, itemId: string) => Promise<void>;
  getLabel: (app: string, itemType: string, itemId: string) => Promise<any>;
  getByColor: (app: string, color: string) => Promise<any[]>;
  getStats: (app?: string) => Promise<any[]>;
  bulkSet: (app: string, itemType: string, itemIds: string[], color: string, label?: string) => Promise<number>;
}

export const useColorLabelsStore = create<ColorLabelsState>((set) => ({
  labels: [],
  palette: [],
  loading: false,
  loadLabels: async (app) => {
    set({ loading: true });
    const data = app ? await invoke('color-labels:getByApp', app) : await invoke('color-labels:getAll');
    set({ labels: data || [], loading: false });
  },
  loadPalette: async () => {
    const data = await invoke('color-labels:getPalette');
    set({ palette: data || [] });
  },
  setLabel: async (app, itemType, itemId, itemName, color, label) => {
    return await invoke('color-labels:set', app, itemType, itemId, itemName, color, label);
  },
  removeLabel: async (app, itemType, itemId) => {
    await invoke('color-labels:remove', app, itemType, itemId);
    set((s) => ({ labels: s.labels.filter((l) => !(l.app === app && l.item_type === itemType && l.item_id === itemId)) }));
  },
  getLabel: async (app, itemType, itemId) => {
    return await invoke('color-labels:get', app, itemType, itemId);
  },
  getByColor: async (app, color) => {
    return (await invoke('color-labels:getByColor', app, color)) || [];
  },
  getStats: async (app) => {
    return (await invoke('color-labels:getStats', app)) || [];
  },
  bulkSet: async (app, itemType, itemIds, color, label) => {
    return (await invoke('color-labels:bulkSet', app, itemType, itemIds, color, label)) || 0;
  },
}));

// ==========================================================================
// 32. READ LATER STORE
// ==========================================================================
interface ReadLaterState {
  items: any[];
  unreadCount: number;
  loading: boolean;
  loadItems: (includeRead?: boolean) => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  add: (params: any) => Promise<any>;
  markRead: (id: number) => Promise<void>;
  markUnread: (id: number) => Promise<void>;
  updateNotes: (id: number, notes: string) => Promise<void>;
  setPriority: (id: number, priority: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  search: (query: string) => Promise<any[]>;
}

export const useReadLaterStore = create<ReadLaterState>((set) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  loadItems: async (includeRead) => {
    set({ loading: true });
    const data = await invoke('read-later:getAll', includeRead);
    set({ items: data || [], loading: false });
  },
  loadUnreadCount: async () => {
    const count = await invoke('read-later:getUnreadCount');
    set({ unreadCount: count || 0 });
  },
  add: async (params) => {
    const result = await invoke('read-later:add', params);
    if (result) set((s) => ({ items: [result, ...s.items], unreadCount: s.unreadCount + 1 }));
    return result;
  },
  markRead: async (id) => {
    await invoke('read-later:markRead', id);
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, read: 1 } : i)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },
  markUnread: async (id) => {
    await invoke('read-later:markUnread', id);
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, read: 0 } : i)),
      unreadCount: s.unreadCount + 1,
    }));
  },
  updateNotes: async (id, notes) => {
    await invoke('read-later:updateNotes', id, notes);
  },
  setPriority: async (id, priority) => {
    await invoke('read-later:setPriority', id, priority);
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, priority } : i)),
    }));
  },
  remove: async (id) => {
    await invoke('read-later:remove', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
  search: async (query) => {
    return (await invoke('read-later:search', query)) || [];
  },
}));

// ==========================================================================
// 33. BULK METADATA STORE
// ==========================================================================
interface BulkMetadataState {
  operationHistory: any[];
  loading: boolean;
  bulkSetColor: (app: string, itemType: string, itemIds: string[], color: string) => Promise<number>;
  bulkAddTag: (app: string, itemIds: string[], tag: string) => Promise<number>;
  bulkRemoveTag: (app: string, itemIds: string[], tag: string) => Promise<number>;
  bulkSetExpiry: (app: string, itemType: string, itemIds: string[], expiresAt: string) => Promise<number>;
  bulkDelete: (app: string, itemType: string, itemIds: string[]) => Promise<number>;
  bulkMoveToReadLater: (app: string, items: Array<{ id: string; title: string }>) => Promise<number>;
  loadHistory: (app?: string) => Promise<void>;
}

export const useBulkMetadataStore = create<BulkMetadataState>((set) => ({
  operationHistory: [],
  loading: false,
  bulkSetColor: async (app, itemType, itemIds, color) => {
    return (await invoke('bulk-metadata:setColor', app, itemType, itemIds, color)) || 0;
  },
  bulkAddTag: async (app, itemIds, tag) => {
    return (await invoke('bulk-metadata:addTag', app, itemIds, tag)) || 0;
  },
  bulkRemoveTag: async (app, itemIds, tag) => {
    return (await invoke('bulk-metadata:removeTag', app, itemIds, tag)) || 0;
  },
  bulkSetExpiry: async (app, itemType, itemIds, expiresAt) => {
    return (await invoke('bulk-metadata:setExpiry', app, itemType, itemIds, expiresAt)) || 0;
  },
  bulkDelete: async (app, itemType, itemIds) => {
    return (await invoke('bulk-metadata:delete', app, itemType, itemIds)) || 0;
  },
  bulkMoveToReadLater: async (app, items) => {
    return (await invoke('bulk-metadata:moveToReadLater', app, items)) || 0;
  },
  loadHistory: async (app) => {
    set({ loading: true });
    const data = await invoke('bulk-metadata:history', app);
    set({ operationHistory: data || [], loading: false });
  },
}));

// ==========================================================================
// 34. ACTIVITY FEED STORE
// ==========================================================================
interface ActivityFeedState {
  feed: any[];
  todayActivity: any[];
  stats: any | null;
  loading: boolean;
  loadFeed: (options?: { app?: string; eventType?: string; limit?: number; offset?: number }) => Promise<void>;
  loadToday: () => Promise<void>;
  loadStats: () => Promise<void>;
  clearFeed: () => Promise<void>;
}

export const useActivityFeedStore = create<ActivityFeedState>((set) => ({
  feed: [],
  todayActivity: [],
  stats: null,
  loading: false,
  loadFeed: async (options) => {
    set({ loading: true });
    const data = await invoke('activity-feed:get', options);
    set({ feed: data || [], loading: false });
  },
  loadToday: async () => {
    const data = await invoke('activity-feed:getToday');
    set({ todayActivity: data || [] });
  },
  loadStats: async () => {
    const data = await invoke('activity-feed:stats');
    set({ stats: data });
  },
  clearFeed: async () => {
    await invoke('activity-feed:clear');
    set({ feed: [], todayActivity: [], stats: null });
  },
}));

// ==========================================================================
// 35. PROJECT LOCK STORE
// ==========================================================================
interface ProjectLockState {
  lockedProjects: any[];
  loading: boolean;
  loadLocked: (app?: string) => Promise<void>;
  lock: (app: string, projectId: string, projectName: string, reason?: string) => Promise<any>;
  unlock: (app: string, projectId: string) => Promise<void>;
  isLocked: (app: string, projectId: string) => Promise<boolean>;
  toggle: (app: string, projectId: string, projectName: string, reason?: string) => Promise<void>;
  getCount: (app?: string) => Promise<number>;
}

export const useProjectLockStore = create<ProjectLockState>((set) => ({
  lockedProjects: [],
  loading: false,
  loadLocked: async (app) => {
    set({ loading: true });
    const data = await invoke('project-lock:getAll', app);
    set({ lockedProjects: data || [], loading: false });
  },
  lock: async (app, projectId, projectName, reason) => {
    const result = await invoke('project-lock:lock', app, projectId, projectName, reason);
    if (result) set((s) => ({ lockedProjects: [...s.lockedProjects, result] }));
    return result;
  },
  unlock: async (app, projectId) => {
    await invoke('project-lock:unlock', app, projectId);
    set((s) => ({
      lockedProjects: s.lockedProjects.filter((l) => !(l.app === app && l.project_id === projectId)),
    }));
  },
  isLocked: async (app, projectId) => {
    return (await invoke('project-lock:isLocked', app, projectId)) || false;
  },
  toggle: async (app, projectId, projectName, reason) => {
    await invoke('project-lock:toggle', app, projectId, projectName, reason);
  },
  getCount: async (app) => {
    return (await invoke('project-lock:getCount', app)) || 0;
  },
}));

// ==========================================================================
// 36. THEME SCHEDULE STORE
// ==========================================================================
interface ThemeScheduleState {
  info: any | null;
  loading: boolean;
  loadInfo: () => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  setTimes: (lightStart: string, darkStart: string) => Promise<void>;
  setLocation: (latitude: number, longitude: number) => Promise<void>;
}

export const useThemeScheduleStore = create<ThemeScheduleState>((set) => ({
  info: null,
  loading: false,
  loadInfo: async () => {
    set({ loading: true });
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data, loading: false });
  },
  setMode: async (mode) => {
    await invoke('theme-schedule:setMode', mode);
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data });
  },
  setTimes: async (lightStart, darkStart) => {
    await invoke('theme-schedule:setTimes', lightStart, darkStart);
  },
  setLocation: async (latitude, longitude) => {
    await invoke('theme-schedule:setLocation', latitude, longitude);
  },
}));

// ==========================================================================
// 37. NATURAL LANGUAGE TASK STORE
// ==========================================================================
interface NaturalLanguageTaskState {
  parsed: any | null;
  history: any[];
  loading: boolean;
  parseInput: (input: string) => Promise<any>;
  createTask: (input: string) => Promise<any>;
  loadHistory: (limit?: number) => Promise<void>;
}

export const useNaturalLanguageTaskStore = create<NaturalLanguageTaskState>((set) => ({
  parsed: null,
  history: [],
  loading: false,
  parseInput: async (input) => {
    const data = await invoke('nl-task:parse', input);
    set({ parsed: data });
    return data;
  },
  createTask: async (input) => {
    const data = await invoke('nl-task:create', input);
    set({ parsed: data });
    return data;
  },
  loadHistory: async (limit) => {
    const data = await invoke('nl-task:history', limit);
    set({ history: data || [] });
  },
}));

// ==========================================================================
// 38. PERSONAL CHANGELOG STORE
// ==========================================================================
interface PersonalChangelogState {
  entries: any[];
  summary: any | null;
  categories: string[];
  loading: boolean;
  loadEntries: (options?: any) => Promise<void>;
  addEntry: (date: string, category: string, title: string, details?: string, app?: string) => Promise<any>;
  removeEntry: (id: number) => Promise<void>;
  generateFromActivity: (startDate: string, endDate: string) => Promise<number>;
  loadSummary: (startDate: string, endDate: string) => Promise<void>;
  renderMarkdown: (startDate: string, endDate: string) => Promise<string>;
  exportChangelog: (startDate: string, endDate: string) => Promise<string | null>;
  loadCategories: () => Promise<void>;
}

export const usePersonalChangelogStore = create<PersonalChangelogState>((set) => ({
  entries: [],
  summary: null,
  categories: [],
  loading: false,
  loadEntries: async (options) => {
    set({ loading: true });
    const data = await invoke('changelog:get', options);
    set({ entries: data || [], loading: false });
  },
  addEntry: async (date, category, title, details, app) => {
    const result = await invoke('changelog:add', date, category, title, details, app);
    if (result) set((s) => ({ entries: [result, ...s.entries] }));
    return result;
  },
  removeEntry: async (id) => {
    await invoke('changelog:remove', id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
  generateFromActivity: async (startDate, endDate) => {
    return (await invoke('changelog:generate', startDate, endDate)) || 0;
  },
  loadSummary: async (startDate, endDate) => {
    const data = await invoke('changelog:getSummary', startDate, endDate);
    set({ summary: data });
  },
  renderMarkdown: async (startDate, endDate) => {
    return (await invoke('changelog:renderMarkdown', startDate, endDate)) || '';
  },
  exportChangelog: async (startDate, endDate) => {
    return await invoke('changelog:export', startDate, endDate);
  },
  loadCategories: async () => {
    const data = await invoke('changelog:getCategories');
    set({ categories: data || [] });
  },
}));
