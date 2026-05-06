// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - BROWSER App - Core Engine
// Tab management, navigation, and history
// Items 801-825 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 801-805: TAB MANAGEMENT
// =============================================================================

export interface Tab {
  id: string;
  windowId: string;
  url: string;
  title: string;
  favicon?: string;
  status: TabStatus;
  isActive: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  securityState: SecurityState;
  loadProgress: number;
  scrollPosition: { x: number; y: number };
  zoomLevel: number;
  createdAt: number;
  lastAccessed: number;
}

export type TabStatus = 'loading' | 'complete' | 'error' | 'crashed';

export interface SecurityState {
  isSecure: boolean;
  protocol: 'https' | 'http' | 'file' | 'chrome' | 'other';
  certificate?: CertificateInfo;
  mixedContent: boolean;
  httpsUpgraded: boolean;
}

export interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: number;
  validTo: number;
  fingerprint: string;
  isEV: boolean;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
  isCollapsed: boolean;
  createdAt: number;
}

export interface Window {
  id: string;
  tabs: Tab[];
  tabGroups: TabGroup[];
  activeTabId: string;
  bounds: WindowBounds;
  isMaximized: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
  isPrivate: boolean;
  createdAt: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// ITEM 806-810: NAVIGATION ENGINE
// =============================================================================

export interface NavigationEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  transitionType: TransitionType;
  referrer?: string;
  httpStatusCode?: number;
}

export type TransitionType = 
  | 'link' | 'typed' | 'auto_bookmark' | 'auto_subframe'
  | 'manual_subframe' | 'generated' | 'start_page'
  | 'form_submit' | 'reload' | 'keyword' | 'keyword_generated';

export interface NavigationState {
  tabId: string;
  currentIndex: number;
  entries: NavigationEntry[];
  pendingEntry?: NavigationEntry;
}

export interface UrlParseResult {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  isValid: boolean;
  isSearchQuery: boolean;
}

// =============================================================================
// ITEM 811-815: HISTORY
// =============================================================================

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
  firstVisitTime: number;
  typedCount: number;
  favicon?: string;
}

export interface HistoryQuery {
  text?: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
  hostFilter?: string;
}

export interface VisitEntry {
  id: string;
  historyId: string;
  visitTime: number;
  referringVisitId?: string;
  transitionType: TransitionType;
}

// =============================================================================
// ITEM 816-820: SESSION MANAGEMENT
// =============================================================================

export interface Session {
  id: string;
  windows: Window[];
  savedAt: number;
  name?: string;
  isAutoSave: boolean;
}

export interface SessionConfig {
  autoSave: boolean;
  autoSaveInterval: number;
  maxAutoSaves: number;
  restoreOnStartup: 'none' | 'last' | 'specific';
  startupPages: string[];
  crashRecovery: boolean;
}

// =============================================================================
// ITEM 821-825: BROWSER ENGINE
// =============================================================================

export class BrowserEngine {
  private windows: Map<string, Window> = new Map();
  private tabs: Map<string, Tab> = new Map();
  private tabGroups: Map<string, TabGroup> = new Map();
  private history: Map<string, HistoryEntry> = new Map();
  private visits: VisitEntry[] = [];
  private sessions: Map<string, Session> = new Map();
  private navigationStates: Map<string, NavigationState> = new Map();
  private activeWindowId: string = '';
  private config: SessionConfig;
  private listeners: Map<string, Set<(event: BrowserEvent) => void>> = new Map();
  private autoSaveTimer?: ReturnType<typeof setInterval>;
  
  constructor(config?: Partial<SessionConfig>) {
    this.config = {
      autoSave: true,
      autoSaveInterval: 60000,
      maxAutoSaves: 5,
      restoreOnStartup: 'last',
      startupPages: ['about:newtab'],
      crashRecovery: true,
      ...config
    };
    
    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }
  
  // Window management
  createWindow(options?: Partial<Window>): Window {
    const window: Window = {
      id: this.generateId('win'),
      tabs: [],
      tabGroups: [],
      activeTabId: '',
      bounds: { x: 100, y: 100, width: 1280, height: 800 },
      isMaximized: false,
      isMinimized: false,
      isFullscreen: false,
      isPrivate: false,
      createdAt: Date.now(),
      ...options
    };
    
    this.windows.set(window.id, window);
    this.activeWindowId = window.id;
    
    // Create initial tab
    if (window.tabs.length === 0) {
      this.createTab(window.id, this.config.startupPages[0] || 'about:newtab');
    }
    
    this.emit('window-created', { window });
    return window;
  }
  
  closeWindow(windowId: string): void {
    const window = this.windows.get(windowId);
    if (!window) return;
    
    // Close all tabs
    for (const tab of window.tabs) {
      this.tabs.delete(tab.id);
      this.navigationStates.delete(tab.id);
    }
    
    this.windows.delete(windowId);
    
    // Set new active window
    if (this.activeWindowId === windowId) {
      const remaining = Array.from(this.windows.keys());
      this.activeWindowId = remaining[0] || '';
    }
    
    this.emit('window-closed', { windowId });
  }
  
  getWindow(windowId: string): Window | undefined {
    return this.windows.get(windowId);
  }
  
  getActiveWindow(): Window | undefined {
    return this.windows.get(this.activeWindowId);
  }
  
  getAllWindows(): Window[] {
    return Array.from(this.windows.values());
  }
  
  focusWindow(windowId: string): void {
    if (this.windows.has(windowId)) {
      this.activeWindowId = windowId;
      this.emit('window-focused', { windowId });
    }
  }
  
  // Tab management
  createTab(windowId: string, url: string = 'about:newtab', options?: Partial<Tab>): Tab {
    const window = this.windows.get(windowId);
    if (!window) throw new Error('Window not found');
    
    const tab: Tab = {
      id: this.generateId('tab'),
      windowId,
      url,
      title: 'New Tab',
      status: 'loading',
      isActive: false,
      isPinned: false,
      isMuted: false,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      securityState: this.getSecurityState(url),
      loadProgress: 0,
      scrollPosition: { x: 0, y: 0 },
      zoomLevel: 100,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ...options
    };
    
    this.tabs.set(tab.id, tab);
    window.tabs.push(tab);
    
    // Initialize navigation state
    this.navigationStates.set(tab.id, {
      tabId: tab.id,
      currentIndex: 0,
      entries: [{
        id: this.generateId('nav'),
        url,
        title: 'New Tab',
        timestamp: Date.now(),
        transitionType: 'typed'
      }]
    });
    
    this.activateTab(tab.id);
    this.emit('tab-created', { tab });
    
    // Simulate loading
    this.simulateNavigation(tab.id, url);
    
    return tab;
  }
  
  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    const window = this.windows.get(tab.windowId);
    if (!window) return;
    
    const tabIndex = window.tabs.findIndex(t => t.id === tabId);
    window.tabs.splice(tabIndex, 1);
    this.tabs.delete(tabId);
    this.navigationStates.delete(tabId);
    
    // Activate adjacent tab
    if (window.activeTabId === tabId && window.tabs.length > 0) {
      const newIndex = Math.min(tabIndex, window.tabs.length - 1);
      this.activateTab(window.tabs[newIndex].id);
    }
    
    // Close window if no tabs
    if (window.tabs.length === 0) {
      this.closeWindow(window.id);
    }
    
    this.emit('tab-closed', { tabId });
  }
  
  activateTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    const window = this.windows.get(tab.windowId);
    if (!window) return;
    
    // Deactivate current active tab
    for (const t of window.tabs) {
      t.isActive = false;
    }
    
    tab.isActive = true;
    tab.lastAccessed = Date.now();
    window.activeTabId = tabId;
    
    this.emit('tab-activated', { tabId });
  }
  
  moveTab(tabId: string, targetWindowId: string, index: number): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    const sourceWindow = this.windows.get(tab.windowId);
    const targetWindow = this.windows.get(targetWindowId);
    if (!sourceWindow || !targetWindow) return;
    
    // Remove from source
    const sourceIndex = sourceWindow.tabs.findIndex(t => t.id === tabId);
    sourceWindow.tabs.splice(sourceIndex, 1);
    
    // Add to target
    tab.windowId = targetWindowId;
    targetWindow.tabs.splice(index, 0, tab);
    
    this.emit('tab-moved', { tabId, sourceWindowId: sourceWindow.id, targetWindowId, index });
  }
  
  pinTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isPinned = true;
      this.emit('tab-pinned', { tabId });
    }
  }
  
  unpinTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isPinned = false;
      this.emit('tab-unpinned', { tabId });
    }
  }
  
  muteTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isMuted = true;
      this.emit('tab-muted', { tabId });
    }
  }
  
  unmuteTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isMuted = false;
      this.emit('tab-unmuted', { tabId });
    }
  }
  
  duplicateTab(tabId: string): Tab | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    
    return this.createTab(tab.windowId, tab.url);
  }
  
  getTab(tabId: string): Tab | undefined {
    return this.tabs.get(tabId);
  }
  
  getAllTabs(): Tab[] {
    return Array.from(this.tabs.values());
  }
  
  // Tab groups
  createTabGroup(windowId: string, name: string, tabIds: string[], color?: string): TabGroup {
    const group: TabGroup = {
      id: this.generateId('group'),
      name,
      color: color || this.getRandomColor(),
      tabIds,
      isCollapsed: false,
      createdAt: Date.now()
    };
    
    this.tabGroups.set(group.id, group);
    
    const window = this.windows.get(windowId);
    if (window) {
      window.tabGroups.push(group);
    }
    
    this.emit('tab-group-created', { group });
    return group;
  }
  
  addTabToGroup(tabId: string, groupId: string): void {
    const group = this.tabGroups.get(groupId);
    if (group && !group.tabIds.includes(tabId)) {
      group.tabIds.push(tabId);
      this.emit('tab-added-to-group', { tabId, groupId });
    }
  }
  
  removeTabFromGroup(tabId: string, groupId: string): void {
    const group = this.tabGroups.get(groupId);
    if (group) {
      group.tabIds = group.tabIds.filter(id => id !== tabId);
      this.emit('tab-removed-from-group', { tabId, groupId });
    }
  }
  
  deleteTabGroup(groupId: string): void {
    this.tabGroups.delete(groupId);
    
    for (const window of this.windows.values()) {
      window.tabGroups = window.tabGroups.filter(g => g.id !== groupId);
    }
    
    this.emit('tab-group-deleted', { groupId });
  }
  
  // Navigation
  navigate(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    const parsedUrl = this.parseUrl(url);
    const finalUrl = parsedUrl.isSearchQuery 
      ? `https://www.google.com/search?q=${encodeURIComponent(url)}`
      : parsedUrl.isValid ? url : `https://${url}`;
    
    tab.url = finalUrl;
    tab.status = 'loading';
    tab.isLoading = true;
    tab.loadProgress = 0;
    tab.securityState = this.getSecurityState(finalUrl);
    
    // Update navigation state
    const navState = this.navigationStates.get(tabId);
    if (navState) {
      // Truncate forward history
      navState.entries = navState.entries.slice(0, navState.currentIndex + 1);
      
      navState.entries.push({
        id: this.generateId('nav'),
        url: finalUrl,
        title: tab.title,
        timestamp: Date.now(),
        transitionType: 'typed'
      });
      navState.currentIndex = navState.entries.length - 1;
      
      tab.canGoBack = navState.currentIndex > 0;
      tab.canGoForward = false;
    }
    
    this.addToHistory(finalUrl, tab.title);
    this.emit('navigation-started', { tabId, url: finalUrl });
    
    this.simulateNavigation(tabId, finalUrl);
  }
  
  goBack(tabId: string): void {
    const navState = this.navigationStates.get(tabId);
    if (!navState || navState.currentIndex <= 0) return;
    
    navState.currentIndex--;
    const entry = navState.entries[navState.currentIndex];
    
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.url = entry.url;
      tab.canGoBack = navState.currentIndex > 0;
      tab.canGoForward = true;
      
      this.simulateNavigation(tabId, entry.url);
    }
    
    this.emit('navigation-back', { tabId, url: entry.url });
  }
  
  goForward(tabId: string): void {
    const navState = this.navigationStates.get(tabId);
    if (!navState || navState.currentIndex >= navState.entries.length - 1) return;
    
    navState.currentIndex++;
    const entry = navState.entries[navState.currentIndex];
    
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.url = entry.url;
      tab.canGoBack = true;
      tab.canGoForward = navState.currentIndex < navState.entries.length - 1;
      
      this.simulateNavigation(tabId, entry.url);
    }
    
    this.emit('navigation-forward', { tabId, url: entry.url });
  }
  
  reload(tabId: string, bypassCache: boolean = false): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    tab.status = 'loading';
    tab.isLoading = true;
    tab.loadProgress = 0;
    
    this.emit('tab-reloading', { tabId, bypassCache });
    this.simulateNavigation(tabId, tab.url);
  }
  
  stop(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isLoading = false;
      this.emit('navigation-stopped', { tabId });
    }
  }
  
  private simulateNavigation(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    
    // Simulate loading progress
    const progressInterval = setInterval(() => {
      if (tab.loadProgress < 90) {
        tab.loadProgress += Math.random() * 30;
        this.emit('load-progress', { tabId, progress: tab.loadProgress });
      }
    }, 100);
    
    // Simulate load complete
    setTimeout(() => {
      clearInterval(progressInterval);
      tab.loadProgress = 100;
      tab.status = 'complete';
      tab.isLoading = false;
      tab.title = this.getTitleFromUrl(url);
      
      this.emit('navigation-completed', { tabId, url });
    }, Math.random() * 500 + 200);
  }
  
  parseUrl(input: string): UrlParseResult {
    const result: UrlParseResult = {
      protocol: '',
      hostname: '',
      port: '',
      pathname: '',
      search: '',
      hash: '',
      origin: '',
      isValid: false,
      isSearchQuery: false
    };
    
    // Check if it's a search query
    if (!input.includes('.') && !input.startsWith('http') && !input.startsWith('file')) {
      result.isSearchQuery = true;
      return result;
    }
    
    try {
      const url = new URL(input.startsWith('http') ? input : `https://${input}`);
      result.protocol = url.protocol.replace(':', '');
      result.hostname = url.hostname;
      result.port = url.port;
      result.pathname = url.pathname;
      result.search = url.search;
      result.hash = url.hash;
      result.origin = url.origin;
      result.isValid = true;
    } catch {
      // Invalid URL
    }
    
    return result;
  }
  
  private getTitleFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }
  
  private getSecurityState(url: string): SecurityState {
    const parsed = this.parseUrl(url);
    return {
      isSecure: parsed.protocol === 'https',
      protocol: parsed.protocol as SecurityState['protocol'],
      mixedContent: false,
      httpsUpgraded: false
    };
  }
  
  // History
  addToHistory(url: string, title: string): void {
    const existing = Array.from(this.history.values()).find(h => h.url === url);
    
    if (existing) {
      existing.visitCount++;
      existing.lastVisitTime = Date.now();
      existing.title = title;
    } else {
      const entry: HistoryEntry = {
        id: this.generateId('hist'),
        url,
        title,
        visitCount: 1,
        lastVisitTime: Date.now(),
        firstVisitTime: Date.now(),
        typedCount: 1
      };
      this.history.set(entry.id, entry);
    }
    
    // Add visit
    this.visits.push({
      id: this.generateId('visit'),
      historyId: existing?.id || Array.from(this.history.values()).pop()!.id,
      visitTime: Date.now(),
      transitionType: 'typed'
    });
    
    this.emit('history-updated', { url, title });
  }
  
  searchHistory(query: HistoryQuery): HistoryEntry[] {
    let results = Array.from(this.history.values());
    
    if (query.text) {
      const text = query.text.toLowerCase();
      results = results.filter(h => 
        h.url.toLowerCase().includes(text) || 
        h.title.toLowerCase().includes(text)
      );
    }
    
    if (query.startTime) {
      results = results.filter(h => h.lastVisitTime >= query.startTime!);
    }
    
    if (query.endTime) {
      results = results.filter(h => h.lastVisitTime <= query.endTime!);
    }
    
    if (query.hostFilter) {
      results = results.filter(h => {
        try {
          return new URL(h.url).hostname === query.hostFilter;
        } catch {
          return false;
        }
      });
    }
    
    results.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    
    if (query.maxResults) {
      results = results.slice(0, query.maxResults);
    }
    
    return results;
  }
  
  deleteHistoryEntry(historyId: string): void {
    this.history.delete(historyId);
    this.visits = this.visits.filter(v => v.historyId !== historyId);
    this.emit('history-deleted', { historyId });
  }
  
  clearHistory(startTime?: number, endTime?: number): void {
    if (startTime || endTime) {
      for (const [id, entry] of this.history) {
        if ((!startTime || entry.lastVisitTime >= startTime) &&
            (!endTime || entry.lastVisitTime <= endTime)) {
          this.history.delete(id);
        }
      }
    } else {
      this.history.clear();
      this.visits = [];
    }
    
    this.emit('history-cleared', { startTime, endTime });
  }
  
  getHistory(): HistoryEntry[] {
    return Array.from(this.history.values())
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  }
  
  // Session management
  saveSession(name?: string): Session {
    const session: Session = {
      id: this.generateId('session'),
      windows: Array.from(this.windows.values()).map(w => ({
        ...w,
        tabs: [...w.tabs],
        tabGroups: [...w.tabGroups]
      })),
      savedAt: Date.now(),
      name,
      isAutoSave: !name
    };
    
    this.sessions.set(session.id, session);
    
    // Clean up old auto-saves
    const autoSaves = Array.from(this.sessions.values())
      .filter(s => s.isAutoSave)
      .sort((a, b) => b.savedAt - a.savedAt);
    
    while (autoSaves.length > this.config.maxAutoSaves) {
      const oldest = autoSaves.pop()!;
      this.sessions.delete(oldest.id);
    }
    
    this.emit('session-saved', { session });
    return session;
  }
  
  restoreSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Close current windows
    for (const windowId of this.windows.keys()) {
      this.closeWindow(windowId);
    }
    
    // Restore windows and tabs
    for (const window of session.windows) {
      const newWindow = this.createWindow({
        bounds: window.bounds,
        isPrivate: window.isPrivate
      });
      
      // Remove initial tab
      if (newWindow.tabs.length > 0) {
        this.closeTab(newWindow.tabs[0].id);
      }
      
      for (const tab of window.tabs) {
        this.createTab(newWindow.id, tab.url, {
          isPinned: tab.isPinned,
          isMuted: tab.isMuted
        });
      }
    }
    
    this.emit('session-restored', { sessionId });
  }
  
  getSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.emit('session-deleted', { sessionId });
  }
  
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      this.saveSession();
    }, this.config.autoSaveInterval);
  }
  
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
  }
  
  // Zoom
  setZoom(tabId: string, level: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.zoomLevel = Math.max(25, Math.min(500, level));
      this.emit('zoom-changed', { tabId, level: tab.zoomLevel });
    }
  }
  
  zoomIn(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.setZoom(tabId, tab.zoomLevel + 10);
    }
  }
  
  zoomOut(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.setZoom(tabId, tab.zoomLevel - 10);
    }
  }
  
  resetZoom(tabId: string): void {
    this.setZoom(tabId, 100);
  }
  
  // Event handling
  on(event: string, callback: (event: BrowserEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: BrowserEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const browserEvent: BrowserEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(browserEvent));
    }
  }
  
  // Utilities
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private getRandomColor(): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // Cleanup
  dispose(): void {
    this.stopAutoSave();
    this.saveSession();
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface BrowserEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createBrowserEngine = (config?: Partial<SessionConfig>) => new BrowserEngine(config);

export default { BrowserEngine, createBrowserEngine };
