// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Universal Core - Shared improvements for all 26 DEX applications
// Provides common functionality, accessibility, performance, and collaboration
// ===========================================================================

import { EventEmitter } from 'events';

// ===========================================================================
// UNIVERSAL TYPES
// ===========================================================================

export interface UniversalConfig {
  accessibility: AccessibilityConfig;
  performance: PerformanceConfig;
  collaboration: CollaborationConfig;
  autosave: AutosaveConfig;
  shortcuts: ShortcutConfig;
  undo: UndoConfig;
  export: ExportConfig;
}

// ===========================================================================
// ACCESSIBILITY
// ===========================================================================

export interface AccessibilityConfig {
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  focusIndicators: boolean;
  colorBlindMode: ColorBlindMode;
  audioDescriptions: boolean;
}

export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'monochromacy';

export class AccessibilityEngine extends EventEmitter {
  private config: AccessibilityConfig = {
    highContrast: false,
    reducedMotion: false,
    largeText: false,
    screenReaderOptimized: false,
    keyboardNavigation: true,
    focusIndicators: true,
    colorBlindMode: 'none',
    audioDescriptions: false
  };

  private announceQueue: string[] = [];
  private focusableElements: HTMLElement[] = [];

  setConfig(config: Partial<AccessibilityConfig>): void {
    this.config = { ...this.config, ...config };
    this.applyConfig();
    this.emit('config:changed', this.config);
  }

  getConfig(): AccessibilityConfig {
    return { ...this.config };
  }

  private applyConfig(): void {
    const root = document.documentElement;
    
    root.classList.toggle('high-contrast', this.config.highContrast);
    root.classList.toggle('reduced-motion', this.config.reducedMotion);
    root.classList.toggle('large-text', this.config.largeText);
    root.classList.toggle(`cb-${this.config.colorBlindMode}`, this.config.colorBlindMode !== 'none');
    
    if (this.config.reducedMotion) {
      root.style.setProperty('--transition-duration', '0ms');
      root.style.setProperty('--animation-duration', '0ms');
    } else {
      root.style.removeProperty('--transition-duration');
      root.style.removeProperty('--animation-duration');
    }
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcer = document.getElementById('a11y-announcer') || this.createAnnouncer();
    announcer.setAttribute('aria-live', priority);
    announcer.textContent = message;
    
    setTimeout(() => { announcer.textContent = ''; }, 1000);
  }

  private createAnnouncer(): HTMLElement {
    const announcer = document.createElement('div');
    announcer.id = 'a11y-announcer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    document.body.appendChild(announcer);
    return announcer;
  }

  trapFocus(container: HTMLElement): () => void {
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handler);
    first?.focus();

    return () => container.removeEventListener('keydown', handler);
  }

  getContrastRatio(color1: string, color2: string): number {
    const lum1 = this.getLuminance(color1);
    const lum2 = this.getLuminance(color2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private getLuminance(hex: string): number {
    const rgb = this.hexToRgb(hex);
    const [r, g, b] = rgb.map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private hexToRgb(hex: string): number[] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  }
}

// ===========================================================================
// PERFORMANCE
// ===========================================================================

export interface PerformanceConfig {
  hardwareAcceleration: boolean;
  lazyLoading: boolean;
  virtualScrolling: boolean;
  workerThreads: boolean;
  cacheSize: number;
  memoryLimit: number;
  gpuRendering: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  memoryUsed: number;
  memoryTotal: number;
  cpuUsage: number;
  gpuUsage: number;
  renderTime: number;
  responseTime: number;
}

export class PerformanceEngine extends EventEmitter {
  private config: PerformanceConfig = {
    hardwareAcceleration: true,
    lazyLoading: true,
    virtualScrolling: true,
    workerThreads: true,
    cacheSize: 512,
    memoryLimit: 4096,
    gpuRendering: true
  };

  private metrics: PerformanceMetrics = {
    fps: 60,
    memoryUsed: 0,
    memoryTotal: 0,
    cpuUsage: 0,
    gpuUsage: 0,
    renderTime: 0,
    responseTime: 0
  };

  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private metricsInterval?: ReturnType<typeof setInterval>;
  private rafId: number = 0;
  private monitoringActive: boolean = false;
  private cache: Map<string, { data: unknown; expires: number }> = new Map();

  startMonitoring(): void {
    if (this.monitoringActive) return;
    this.monitoringActive = true;
    this.lastFrameTime = performance.now();
    
    const measureFrame = () => {
      if (!this.monitoringActive) return;
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      
      this.frameCount++;
      
      if (delta >= 1000) {
        this.metrics.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastFrameTime = now;
      }
      
      this.rafId = requestAnimationFrame(measureFrame);
    };
    
    this.rafId = requestAnimationFrame(measureFrame);
    
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
      this.emit('metrics:updated', this.metrics);
    }, 1000);
  }

  stopMonitoring(): void {
    this.monitoringActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  private updateMetrics(): void {
    if ('memory' in performance) {
      const mem = (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      this.metrics.memoryUsed = Math.round(mem.usedJSHeapSize / 1024 / 1024);
      this.metrics.memoryTotal = Math.round(mem.totalJSHeapSize / 1024 / 1024);
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  cache_set(key: string, data: unknown, ttl: number = 60000): void {
    this.cache.set(key, { data, expires: Date.now() + ttl });
    this.pruneCache();
  }

  cache_get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  cache_clear(): void {
    this.cache.clear();
  }

  private pruneCache(): void {
    if (this.cache.size > this.config.cacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].expires - b[1].expires);
      
      const toRemove = entries.slice(0, Math.floor(this.config.cacheSize * 0.2));
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }

  throttle<T extends (...args: unknown[]) => unknown>(fn: T, wait: number): T {
    let lastCall = 0;
    return ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= wait) {
        lastCall = now;
        return fn(...args);
      }
    }) as T;
  }

  debounce<T extends (...args: unknown[]) => unknown>(fn: T, wait: number): T {
    let timeout: ReturnType<typeof setTimeout>;
    return ((...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    }) as T;
  }

  async measureTime<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.emit('timing', { name, duration });
    }
  }
}

// ===========================================================================
// COLLABORATION
// ===========================================================================

export interface CollaborationConfig {
  realtime: boolean;
  presence: boolean;
  comments: boolean;
  versionHistory: boolean;
  conflictResolution: 'auto' | 'manual';
  syncInterval: number;
}

export interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
  selection?: { start: number; end: number };
  isActive: boolean;
  lastSeen: number;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
  resolved: boolean;
  replies: Comment[];
  position?: { x: number; y: number } | { line: number; char: number };
}

export interface Version {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  timestamp: number;
  snapshot: string;
  description?: string;
}

export class CollaborationEngine extends EventEmitter {
  private config: CollaborationConfig = {
    realtime: true,
    presence: true,
    comments: true,
    versionHistory: true,
    conflictResolution: 'auto',
    syncInterval: 100
  };

  private collaborators: Map<string, Collaborator> = new Map();
  private comments: Map<string, Comment> = new Map();
  private versions: Version[] = [];
  private localUserId: string = '';
  private connected: boolean = false;

  connect(userId: string, userName: string): void {
    this.localUserId = userId;
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#9B59B6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    this.collaborators.set(userId, {
      id: userId,
      name: userName,
      color,
      isActive: true,
      lastSeen: Date.now()
    });
    
    this.connected = true;
    this.emit('connected', { userId, userName });
  }

  disconnect(): void {
    this.connected = false;
    this.collaborators.delete(this.localUserId);
    this.emit('disconnected');
  }

  updateCursor(x: number, y: number): void {
    const user = this.collaborators.get(this.localUserId);
    if (user) {
      user.cursor = { x, y };
      user.lastSeen = Date.now();
      this.emit('cursor:updated', { userId: this.localUserId, cursor: user.cursor });
    }
  }

  updateSelection(start: number, end: number): void {
    const user = this.collaborators.get(this.localUserId);
    if (user) {
      user.selection = { start, end };
      this.emit('selection:updated', { userId: this.localUserId, selection: user.selection });
    }
  }

  getCollaborators(): Collaborator[] {
    return Array.from(this.collaborators.values());
  }

  addComment(content: string, position?: Comment['position']): Comment {
    const user = this.collaborators.get(this.localUserId);
    const comment: Comment = {
      id: this.generateId(),
      authorId: this.localUserId,
      authorName: user?.name || 'Unknown',
      content,
      timestamp: Date.now(),
      resolved: false,
      replies: [],
      position
    };
    
    this.comments.set(comment.id, comment);
    this.emit('comment:added', comment);
    return comment;
  }

  replyToComment(commentId: string, content: string): Comment | undefined {
    const parent = this.comments.get(commentId);
    if (!parent) return undefined;
    
    const user = this.collaborators.get(this.localUserId);
    const reply: Comment = {
      id: this.generateId(),
      authorId: this.localUserId,
      authorName: user?.name || 'Unknown',
      content,
      timestamp: Date.now(),
      resolved: false,
      replies: []
    };
    
    parent.replies.push(reply);
    this.emit('comment:replied', { parentId: commentId, reply });
    return reply;
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.get(commentId);
    if (comment) {
      comment.resolved = true;
      this.emit('comment:resolved', commentId);
    }
  }

  getComments(): Comment[] {
    return Array.from(this.comments.values());
  }

  createVersion(name: string, snapshot: string, description?: string): Version {
    const user = this.collaborators.get(this.localUserId);
    const version: Version = {
      id: this.generateId(),
      name,
      authorId: this.localUserId,
      authorName: user?.name || 'Unknown',
      timestamp: Date.now(),
      snapshot,
      description
    };
    
    this.versions.push(version);
    this.emit('version:created', version);
    return version;
  }

  getVersions(): Version[] {
    return [...this.versions];
  }

  restoreVersion(versionId: string): string | undefined {
    const version = this.versions.find(v => v.id === versionId);
    if (version) {
      this.emit('version:restored', version);
      return version.snapshot;
    }
    return undefined;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ===========================================================================
// AUTOSAVE
// ===========================================================================

export interface AutosaveConfig {
  enabled: boolean;
  interval: number;
  maxBackups: number;
  compressBackups: boolean;
  savePath: string;
}

export interface AutosaveEntry {
  id: string;
  timestamp: number;
  data: string;
  checksum: string;
}

export class AutosaveEngine extends EventEmitter {
  private config: AutosaveConfig = {
    enabled: true,
    interval: 30000,
    maxBackups: 10,
    compressBackups: true,
    savePath: ''
  };

  private entries: AutosaveEntry[] = [];
  private saveInterval?: ReturnType<typeof setInterval>;
  private dirty: boolean = false;
  private lastSave: number = 0;
  private currentData: string = '';

  start(): void {
    if (this.saveInterval) return;
    
    this.saveInterval = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, this.config.interval);
    
    this.emit('started');
  }

  stop(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = undefined;
    }
    this.emit('stopped');
  }

  markDirty(): void {
    this.dirty = true;
  }

  setData(data: string): void {
    this.currentData = data;
    this.markDirty();
  }

  save(): void {
    if (!this.currentData) return;

    const entry: AutosaveEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      data: this.currentData,
      checksum: this.calculateChecksum(this.currentData)
    };

    this.entries.push(entry);
    
    while (this.entries.length > this.config.maxBackups) {
      this.entries.shift();
    }

    this.dirty = false;
    this.lastSave = Date.now();
    this.emit('saved', entry);
  }

  getBackups(): AutosaveEntry[] {
    return [...this.entries];
  }

  restore(entryId: string): string | undefined {
    const entry = this.entries.find(e => e.id === entryId);
    if (entry) {
      this.emit('restored', entry);
      return entry.data;
    }
    return undefined;
  }

  getLatest(): AutosaveEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private generateId(): string {
    return `as-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

// ===========================================================================
// KEYBOARD SHORTCUTS
// ===========================================================================

export interface ShortcutConfig {
  enabled: boolean;
  customBindings: Map<string, string>;
}

export interface Shortcut {
  id: string;
  keys: string;
  action: string;
  description: string;
  category: string;
  enabled: boolean;
  global: boolean;
}

export class ShortcutEngine extends EventEmitter {
  private shortcuts: Map<string, Shortcut> = new Map();
  private handlers: Map<string, () => void> = new Map();
  private enabled: boolean = true;
  private paused: boolean = false;

  constructor() {
    super();
    this.registerDefaults();
    this.attachListener();
  }

  private registerDefaults(): void {
    const defaults: Omit<Shortcut, 'id'>[] = [
      // File
      { keys: 'Ctrl+N', action: 'file.new', description: 'New file', category: 'File', enabled: true, global: true },
      { keys: 'Ctrl+O', action: 'file.open', description: 'Open file', category: 'File', enabled: true, global: true },
      { keys: 'Ctrl+S', action: 'file.save', description: 'Save', category: 'File', enabled: true, global: true },
      { keys: 'Ctrl+Shift+S', action: 'file.saveAs', description: 'Save As', category: 'File', enabled: true, global: true },
      { keys: 'Ctrl+W', action: 'file.close', description: 'Close', category: 'File', enabled: true, global: true },
      
      // Edit
      { keys: 'Ctrl+Z', action: 'edit.undo', description: 'Undo', category: 'Edit', enabled: true, global: true },
      { keys: 'Ctrl+Y', action: 'edit.redo', description: 'Redo', category: 'Edit', enabled: true, global: true },
      { keys: 'Ctrl+X', action: 'edit.cut', description: 'Cut', category: 'Edit', enabled: true, global: true },
      { keys: 'Ctrl+C', action: 'edit.copy', description: 'Copy', category: 'Edit', enabled: true, global: true },
      { keys: 'Ctrl+V', action: 'edit.paste', description: 'Paste', category: 'Edit', enabled: true, global: true },
      { keys: 'Ctrl+A', action: 'edit.selectAll', description: 'Select All', category: 'Edit', enabled: true, global: true },
      { keys: 'Delete', action: 'edit.delete', description: 'Delete', category: 'Edit', enabled: true, global: false },
      
      // View
      { keys: 'Ctrl++', action: 'view.zoomIn', description: 'Zoom In', category: 'View', enabled: true, global: true },
      { keys: 'Ctrl+-', action: 'view.zoomOut', description: 'Zoom Out', category: 'View', enabled: true, global: true },
      { keys: 'Ctrl+0', action: 'view.zoomReset', description: 'Reset Zoom', category: 'View', enabled: true, global: true },
      { keys: 'F11', action: 'view.fullscreen', description: 'Fullscreen', category: 'View', enabled: true, global: true },
      
      // Tools
      { keys: 'Ctrl+F', action: 'tools.find', description: 'Find', category: 'Tools', enabled: true, global: true },
      { keys: 'Ctrl+H', action: 'tools.replace', description: 'Replace', category: 'Tools', enabled: true, global: true },
      { keys: 'Ctrl+P', action: 'tools.quickOpen', description: 'Quick Open', category: 'Tools', enabled: true, global: true },
      { keys: 'Ctrl+Shift+P', action: 'tools.commandPalette', description: 'Command Palette', category: 'Tools', enabled: true, global: true },
      
      // UKI
      { keys: 'Ctrl+Space', action: 'uki.activate', description: 'Activate UKI', category: 'UKI', enabled: true, global: true },
      { keys: 'Ctrl+Shift+Space', action: 'uki.voice', description: 'Voice Input', category: 'UKI', enabled: true, global: true }
    ];

    for (const shortcut of defaults) {
      const id = shortcut.action;
      this.shortcuts.set(id, { id, ...shortcut });
    }
  }

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private attachListener(): void {
    if (this.keydownHandler) return; // Already attached
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.enabled || this.paused) return;
      
      const keys = this.getKeyCombo(e);
      
      for (const shortcut of this.shortcuts.values()) {
        if (!shortcut.enabled) continue;
        if (this.normalizeKeys(shortcut.keys) === keys) {
          e.preventDefault();
          this.execute(shortcut.action);
          return;
        }
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  detachListener(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  private getKeyCombo(e: KeyboardEvent): string {
    const parts: string[] = [];
    // On macOS Cmd (metaKey) is the primary modifier; treat it as 'ctrl'
    // so bindings stored as 'Ctrl+N' fire correctly on both platforms.
    const isMac = /Mac|macOS/i.test((navigator as any).userAgentData?.platform || navigator.platform || '');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod) parts.push('ctrl');
    if (!isMac && e.ctrlKey && e.metaKey) parts.push('meta'); // Win/Linux explicit meta
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');

    const key = e.key.toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
      parts.push(key);
    }

    return parts.join('+');
  }

  private normalizeKeys(keys: string): string {
    return keys.toLowerCase().replace(/\s/g, '');
  }

  register(action: string, handler: () => void): void {
    this.handlers.set(action, handler);
  }

  unregister(action: string): void {
    this.handlers.delete(action);
  }

  execute(action: string): void {
    const handler = this.handlers.get(action);
    if (handler) {
      handler();
      this.emit('executed', { action });
    }
  }

  setBinding(action: string, keys: string): void {
    const shortcut = this.shortcuts.get(action);
    if (shortcut) {
      shortcut.keys = keys;
      this.emit('binding:changed', { action, keys });
    }
  }

  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  getByCategory(category: string): Shortcut[] {
    return this.getShortcuts().filter(s => s.category === category);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }
}

// ===========================================================================
// UNDO/REDO
// ===========================================================================

export interface UndoConfig {
  maxHistory: number;
  groupingInterval: number;
}

export interface UndoAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
}

export class UndoEngine extends EventEmitter {
  private config: UndoConfig = {
    maxHistory: 100,
    groupingInterval: 500
  };

  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private groupTimer?: ReturnType<typeof setTimeout>;
  private currentGroup: UndoAction[] = [];

  push(action: Omit<UndoAction, 'id' | 'timestamp'>): void {
    const fullAction: UndoAction = {
      ...action,
      id: this.generateId(),
      timestamp: Date.now()
    };

    // Group rapid changes
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
      this.currentGroup.push(fullAction);
    } else {
      this.currentGroup = [fullAction];
    }

    this.groupTimer = setTimeout(() => {
      this.commitGroup();
      this.groupTimer = undefined;
    }, this.config.groupingInterval);

    this.redoStack = [];
    this.emit('pushed', fullAction);
  }

  private commitGroup(): void {
    if (this.currentGroup.length === 0) return;

    if (this.currentGroup.length === 1) {
      this.undoStack.push(this.currentGroup[0]);
    } else {
      const grouped: UndoAction = {
        id: this.generateId(),
        type: 'group',
        description: `${this.currentGroup.length} changes`,
        timestamp: Date.now(),
        undo: () => {
          for (let i = this.currentGroup.length - 1; i >= 0; i--) {
            this.currentGroup[i].undo();
          }
        },
        redo: () => {
          for (const action of this.currentGroup) {
            action.redo();
          }
        }
      };
      this.undoStack.push(grouped);
    }

    while (this.undoStack.length > this.config.maxHistory) {
      this.undoStack.shift();
    }

    this.currentGroup = [];
    this.emit('committed');
  }

  undo(): boolean {
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
      this.commitGroup();
    }

    const action = this.undoStack.pop();
    if (!action) return false;

    action.undo();
    this.redoStack.push(action);
    this.emit('undone', action);
    return true;
  }

  redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;

    action.redo();
    this.undoStack.push(action);
    this.emit('redone', action);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0 || this.currentGroup.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoDescription(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.description;
  }

  getRedoDescription(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.description;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentGroup = [];
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
      this.groupTimer = undefined;
    }
    this.emit('cleared');
  }

  private generateId(): string {
    return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export interface ExportConfig {
  defaultFormat: string;
  quality: number;
  preserveMetadata: boolean;
  embedColorProfile: boolean;
}

export interface ExportPreset {
  id: string;
  name: string;
  format: string;
  settings: Record<string, unknown>;
  builtIn: boolean;
}

export interface ExportResult {
  success: boolean;
  path?: string;
  size?: number;
  duration?: number;
  error?: string;
}

export class ExportEngine extends EventEmitter {
  private presets: Map<string, ExportPreset> = new Map();
  private queue: Array<{ id: string; config: Record<string, unknown> }> = [];
  private processing: boolean = false;

  constructor() {
    super();
    this.registerDefaultPresets();
  }

  private registerDefaultPresets(): void {
    const defaults: Omit<ExportPreset, 'id'>[] = [
      { name: 'Web (High Quality)', format: 'png', settings: { quality: 90, dpi: 72 }, builtIn: true },
      { name: 'Web (Optimized)', format: 'webp', settings: { quality: 85, dpi: 72 }, builtIn: true },
      { name: 'Print (High Quality)', format: 'tiff', settings: { quality: 100, dpi: 300 }, builtIn: true },
      { name: 'Social Media', format: 'jpg', settings: { quality: 80, dpi: 72 }, builtIn: true },
      { name: 'PDF Document', format: 'pdf', settings: { quality: 100, dpi: 150 }, builtIn: true }
    ];

    for (const preset of defaults) {
      const id = preset.name.toLowerCase().replace(/\s/g, '-');
      this.presets.set(id, { id, ...preset });
    }
  }

  getPresets(): ExportPreset[] {
    return Array.from(this.presets.values());
  }

  getPreset(id: string): ExportPreset | undefined {
    return this.presets.get(id);
  }

  addPreset(preset: Omit<ExportPreset, 'id' | 'builtIn'>): ExportPreset {
    const id = `custom-${Date.now()}`;
    const newPreset: ExportPreset = { id, builtIn: false, ...preset };
    this.presets.set(id, newPreset);
    this.emit('preset:added', newPreset);
    return newPreset;
  }

  removePreset(id: string): boolean {
    const preset = this.presets.get(id);
    if (preset && !preset.builtIn) {
      this.presets.delete(id);
      this.emit('preset:removed', id);
      return true;
    }
    return false;
  }

  async exportFile(
    data: unknown,
    format: string,
    settings: Record<string, unknown>
  ): Promise<ExportResult> {
    const start = Date.now();
    
    this.emit('export:started', { format, settings });

    try {
      // Export logic would go here
      const result: ExportResult = {
        success: true,
        path: `/exports/file.${format}`,
        size: 1024,
        duration: Date.now() - start
      };

      this.emit('export:completed', result);
      return result;
    } catch (error) {
      const result: ExportResult = {
        success: false,
        error: String(error),
        duration: Date.now() - start
      };
      
      this.emit('export:failed', result);
      return result;
    }
  }

  async batchExport(
    items: Array<{ data: unknown; filename: string }>,
    format: string,
    settings: Record<string, unknown>
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];
    
    this.emit('batch:started', { count: items.length });
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = await this.exportFile(item.data, format, settings);
      results.push(result);
      this.emit('batch:progress', { current: i + 1, total: items.length });
    }
    
    this.emit('batch:completed', { results });
    return results;
  }
}

// ===========================================================================
// UNIVERSAL CORE
// ===========================================================================

export class UniversalCore {
  private static instance: UniversalCore;
  
  readonly accessibility: AccessibilityEngine;
  readonly performance: PerformanceEngine;
  readonly collaboration: CollaborationEngine;
  readonly autosave: AutosaveEngine;
  readonly shortcuts: ShortcutEngine;
  readonly undo: UndoEngine;
  readonly exportEngine: ExportEngine;

  private constructor() {
    this.accessibility = new AccessibilityEngine();
    this.performance = new PerformanceEngine();
    this.collaboration = new CollaborationEngine();
    this.autosave = new AutosaveEngine();
    this.shortcuts = new ShortcutEngine();
    this.undo = new UndoEngine();
    this.exportEngine = new ExportEngine();
  }

  static getInstance(): UniversalCore {
    if (!UniversalCore.instance) {
      UniversalCore.instance = new UniversalCore();
    }
    return UniversalCore.instance;
  }

  initialize(): void {
    this.performance.startMonitoring();
    this.autosave.start();
    
    // Register universal shortcuts
    this.shortcuts.register('edit.undo', () => this.undo.undo());
    this.shortcuts.register('edit.redo', () => this.undo.redo());
  }

  shutdown(): void {
    this.performance.stopMonitoring();
    this.autosave.stop();
  }
}

// ===========================================================================
// EXPORTS
// ===========================================================================

export const getUniversalCore = () => UniversalCore.getInstance();

export default {
  UniversalCore,
  getUniversalCore,
  AccessibilityEngine,
  PerformanceEngine,
  CollaborationEngine,
  AutosaveEngine,
  ShortcutEngine,
  UndoEngine,
  ExportEngine
};
