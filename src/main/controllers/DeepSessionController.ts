// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Deep Session Controller
// Phase 14: Session Continuity & Long-Form Work Comfort
// Remembers where you were, restores state seamlessly
// ===========================================================================

import { ipcMain, app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface DeepSessionState {
  id: string;
  startedAt: number;
  lastActiveAt: number;
  durationMinutes: number;
  
  // Navigation state
  currentPage: string;
  previousPages: string[];
  
  // Context preservation
  contexts: Record<string, PageContext>;
  
  // Active work items
  activeNoteId?: string;
  activeTimerIds: string[];
  activeOperationIds: string[];
  openDrafts: DraftState[];
  
  // UI state
  sidebarCollapsed: boolean;
  pinnedNoteIds: string[];
  splitViewEnabled: boolean;
  splitViewConfig?: SplitViewConfig;
  
  // System snapshot (lightweight)
  systemSnapshot: {
    cpuUsage: number;
    memoryPercent: number;
    batteryLevel?: number;
  };
}

export interface PageContext {
  page: string;
  scrollPosition: number;
  cursorPosition?: { line: number; column: number };
  selection?: { start: number; end: number };
  expandedItems?: string[];
  filterState?: Record<string, any>;
  lastVisited: number;
}

export interface DraftState {
  id: string;
  type: 'note' | 'workflow' | 'action' | 'operation';
  content: string;
  savedAt: number;
  isDirty: boolean;
}

export interface SplitViewConfig {
  leftPane: string;
  rightPane: string;
  splitRatio: number;
}

export interface SessionMetrics {
  totalDuration: number;
  activePages: Record<string, number>;
  notesCreated: number;
  notesEdited: number;
  operationsRun: number;
  focusBreaks: number;
}

// ===========================================================================
// STORE
// ===========================================================================

const store = new Store<{
  deepSession: DeepSessionState | null;
  sessionHistory: Array<{
    id: string;
    startedAt: number;
    endedAt: number;
    durationMinutes: number;
    metrics: SessionMetrics;
  }>;
  preferences: {
    autoRestore: boolean;
    preserveContexts: boolean;
    maxHistoryDays: number;
    compactOnIdle: boolean;
  };
}>({
  name: 'deep-session',
  defaults: {
    deepSession: null,
    sessionHistory: [],
    preferences: {
      autoRestore: true,
      preserveContexts: true,
      maxHistoryDays: 7,
      compactOnIdle: true,
    },
  },
});

// ===========================================================================
// CONTROLLER
// ===========================================================================

class DeepSessionController {
  private session: DeepSessionState | null = null;
  private activityInterval: NodeJS.Timeout | null = null;
  private compactInterval: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private idleThreshold = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Session lifecycle
    ipcMain.handle('deepSession:start', async () => {
      return this.startSession();
    });

    ipcMain.handle('deepSession:restore', async () => {
      return this.restoreSession();
    });

    ipcMain.handle('deepSession:end', async () => {
      return this.endSession();
    });

    ipcMain.handle('deepSession:get', () => {
      return this.session;
    });

    // Context preservation
    ipcMain.handle('deepSession:saveContext', async (_, page: string, context: Partial<PageContext>) => {
      return this.savePageContext(page, context);
    });

    ipcMain.handle('deepSession:getContext', (_, page: string) => {
      return this.getPageContext(page);
    });

    ipcMain.handle('deepSession:navigate', async (_, page: string) => {
      return this.navigateTo(page);
    });

    // Draft management
    ipcMain.handle('deepSession:saveDraft', async (_, draft: Omit<DraftState, 'savedAt'>) => {
      return this.saveDraft(draft);
    });

    ipcMain.handle('deepSession:getDraft', (_, id: string) => {
      return this.getDraft(id);
    });

    ipcMain.handle('deepSession:getDrafts', () => {
      return this.session?.openDrafts || [];
    });

    ipcMain.handle('deepSession:discardDraft', async (_, id: string) => {
      return this.discardDraft(id);
    });

    // Pinned notes
    ipcMain.handle('deepSession:pinNote', async (_, noteId: string) => {
      return this.pinNote(noteId);
    });

    ipcMain.handle('deepSession:unpinNote', async (_, noteId: string) => {
      return this.unpinNote(noteId);
    });

    ipcMain.handle('deepSession:getPinnedNotes', () => {
      return this.session?.pinnedNoteIds || [];
    });

    // Split view
    ipcMain.handle('deepSession:setSplitView', async (_, config: SplitViewConfig | null) => {
      return this.setSplitView(config);
    });

    ipcMain.handle('deepSession:getSplitView', () => {
      return this.session?.splitViewConfig || null;
    });

    // Activity tracking
    ipcMain.handle('deepSession:recordActivity', async () => {
      this.recordActivity();
      return { success: true };
    });

    // Preferences
    ipcMain.handle('deepSession:getPreferences', () => {
      return store.get('preferences');
    });

    ipcMain.handle('deepSession:setPreferences', async (_, prefs: Partial<typeof store.store.preferences>) => {
      const current = store.get('preferences');
      store.set('preferences', { ...current, ...prefs });
      return { success: true };
    });

    // Session history
    ipcMain.handle('deepSession:getHistory', () => {
      return store.get('sessionHistory');
    });

    // Metrics
    ipcMain.handle('deepSession:getMetrics', () => {
      return this.calculateMetrics();
    });

    log.info('DeepSession handlers registered');
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  startSession(): DeepSessionState {
    const now = Date.now();
    
    this.session = {
      id: `session_${now}`,
      startedAt: now,
      lastActiveAt: now,
      durationMinutes: 0,
      currentPage: 'dashboard',
      previousPages: [],
      contexts: {},
      activeTimerIds: [],
      activeOperationIds: [],
      openDrafts: [],
      sidebarCollapsed: false,
      pinnedNoteIds: [],
      splitViewEnabled: false,
      systemSnapshot: {
        cpuUsage: 0,
        memoryPercent: 0,
      },
    };

    this.persistSession();
    this.startActivityTracking();
    
    log.info('Deep session started:', this.session.id);
    return this.session;
  }

  restoreSession(): DeepSessionState | null {
    const prefs = store.get('preferences');
    if (!prefs.autoRestore) return null;

    const saved = store.get('deepSession');
    if (!saved) return null;

    // Check if session is recent (within 24 hours)
    const age = Date.now() - saved.lastActiveAt;
    if (age > 24 * 60 * 60 * 1000) {
      log.info('Previous session too old, starting fresh');
      store.set('deepSession', null);
      return null;
    }

    this.session = {
      ...saved,
      lastActiveAt: Date.now(),
    };

    this.startActivityTracking();
    log.info('Deep session restored:', this.session.id);
    
    return this.session;
  }

  endSession(): { success: boolean; metrics: SessionMetrics } {
    if (!this.session) {
      return { success: false, metrics: this.createEmptyMetrics() };
    }

    const metrics = this.calculateMetrics();
    
    // Archive session
    const history = store.get('sessionHistory');
    history.push({
      id: this.session.id,
      startedAt: this.session.startedAt,
      endedAt: Date.now(),
      durationMinutes: this.session.durationMinutes,
      metrics,
    });

    // Keep only recent history
    const prefs = store.get('preferences');
    const cutoff = Date.now() - prefs.maxHistoryDays * 24 * 60 * 60 * 1000;
    const filtered = history.filter(h => h.endedAt > cutoff);
    store.set('sessionHistory', filtered);

    // Clear current session
    store.set('deepSession', null);
    this.stopActivityTracking();
    
    log.info('Deep session ended:', this.session.id, 'Duration:', this.session.durationMinutes, 'min');
    this.session = null;

    return { success: true, metrics };
  }

  // ===========================================================================
  // CONTEXT PRESERVATION
  // ===========================================================================

  savePageContext(page: string, context: Partial<PageContext>): { success: boolean } {
    if (!this.session) return { success: false };

    const existing = this.session.contexts[page] || {
      page,
      scrollPosition: 0,
      lastVisited: Date.now(),
    };

    this.session.contexts[page] = {
      ...existing,
      ...context,
      lastVisited: Date.now(),
    };

    this.persistSession();
    return { success: true };
  }

  getPageContext(page: string): PageContext | null {
    return this.session?.contexts[page] || null;
  }

  navigateTo(page: string): { success: boolean; context: PageContext | null } {
    if (!this.session) return { success: false, context: null };

    // Save current page to history
    if (this.session.currentPage && this.session.currentPage !== page) {
      this.session.previousPages.push(this.session.currentPage);
      // Keep only last 10 pages
      if (this.session.previousPages.length > 10) {
        this.session.previousPages.shift();
      }
    }

    this.session.currentPage = page;
    this.persistSession();

    return {
      success: true,
      context: this.session.contexts[page] || null,
    };
  }

  // ===========================================================================
  // DRAFT MANAGEMENT
  // ===========================================================================

  saveDraft(draft: Omit<DraftState, 'savedAt'>): { success: boolean } {
    if (!this.session) return { success: false };

    const index = this.session.openDrafts.findIndex(d => d.id === draft.id);
    const fullDraft: DraftState = {
      ...draft,
      savedAt: Date.now(),
    };

    if (index >= 0) {
      this.session.openDrafts[index] = fullDraft;
    } else {
      this.session.openDrafts.push(fullDraft);
    }

    this.persistSession();
    return { success: true };
  }

  getDraft(id: string): DraftState | null {
    return this.session?.openDrafts.find(d => d.id === id) || null;
  }

  discardDraft(id: string): { success: boolean } {
    if (!this.session) return { success: false };

    this.session.openDrafts = this.session.openDrafts.filter(d => d.id !== id);
    this.persistSession();
    return { success: true };
  }

  // ===========================================================================
  // PINNED NOTES
  // ===========================================================================

  pinNote(noteId: string): { success: boolean } {
    if (!this.session) return { success: false };

    if (!this.session.pinnedNoteIds.includes(noteId)) {
      this.session.pinnedNoteIds.push(noteId);
      // Max 5 pinned notes
      if (this.session.pinnedNoteIds.length > 5) {
        this.session.pinnedNoteIds.shift();
      }
      this.persistSession();
    }

    return { success: true };
  }

  unpinNote(noteId: string): { success: boolean } {
    if (!this.session) return { success: false };

    this.session.pinnedNoteIds = this.session.pinnedNoteIds.filter(id => id !== noteId);
    this.persistSession();
    return { success: true };
  }

  // ===========================================================================
  // SPLIT VIEW
  // ===========================================================================

  setSplitView(config: SplitViewConfig | null): { success: boolean } {
    if (!this.session) return { success: false };

    this.session.splitViewEnabled = config !== null;
    this.session.splitViewConfig = config || undefined;
    this.persistSession();
    return { success: true };
  }

  // ===========================================================================
  // ACTIVITY TRACKING
  // ===========================================================================

  recordActivity(): void {
    this.lastActivityTime = Date.now();
    
    if (this.session) {
      this.session.lastActiveAt = Date.now();
      this.session.durationMinutes = Math.floor(
        (Date.now() - this.session.startedAt) / 60000
      );
    }
  }

  private startActivityTracking(): void {
    // Update duration every minute
    this.activityInterval = setInterval(() => {
      if (this.session) {
        this.session.durationMinutes = Math.floor(
          (Date.now() - this.session.startedAt) / 60000
        );
        this.persistSession();
      }
    }, 60000);

    // Compact state when idle
    const prefs = store.get('preferences');
    if (prefs.compactOnIdle) {
      this.compactInterval = setInterval(() => {
        this.compactIfIdle();
      }, 60000);
    }
  }

  private stopActivityTracking(): void {
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
    if (this.compactInterval) {
      clearInterval(this.compactInterval);
      this.compactInterval = null;
    }
  }

  private compactIfIdle(): void {
    const idle = Date.now() - this.lastActivityTime;
    
    if (idle > this.idleThreshold && this.session) {
      // Compact old contexts (keep only recent 5)
      const contexts = Object.entries(this.session.contexts);
      if (contexts.length > 5) {
        const sorted = contexts.sort((a, b) => b[1].lastVisited - a[1].lastVisited);
        this.session.contexts = Object.fromEntries(sorted.slice(0, 5));
      }

      // Compact drafts (remove old non-dirty ones)
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.session.openDrafts = this.session.openDrafts.filter(
        d => d.isDirty || d.savedAt > cutoff
      );

      this.persistSession();
      log.debug('Session state compacted');
    }
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  private persistSession(): void {
    if (this.session) {
      store.set('deepSession', this.session);
    }
  }

  // ===========================================================================
  // METRICS
  // ===========================================================================

  private calculateMetrics(): SessionMetrics {
    if (!this.session) return this.createEmptyMetrics();

    const activePages: Record<string, number> = {};
    for (const [page, context] of Object.entries(this.session.contexts)) {
      activePages[page] = context.lastVisited;
    }

    return {
      totalDuration: this.session.durationMinutes,
      activePages,
      notesCreated: 0, // Would be tracked with events
      notesEdited: 0,
      operationsRun: 0,
      focusBreaks: 0,
    };
  }

  private createEmptyMetrics(): SessionMetrics {
    return {
      totalDuration: 0,
      activePages: {},
      notesCreated: 0,
      notesEdited: 0,
      operationsRun: 0,
      focusBreaks: 0,
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    // Try to restore or start new session
    const restored = this.restoreSession();
    if (!restored) {
      this.startSession();
    }

    log.info('DeepSession controller started');
  }

  stop(): void {
    // Persist final state before shutdown
    if (this.session) {
      this.session.lastActiveAt = Date.now();
      this.persistSession();
    }

    this.stopActivityTracking();
    log.info('DeepSession controller stopped');
  }
}

export const deepSessionController = new DeepSessionController();
