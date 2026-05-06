// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Accessibility Manager
// ==========================================================================
// Feature 61: Accessibility Event Listener
// Feature 62: Semantic UI Tree Description
// ==========================================================================

import * as log from 'electron-log';
import { app, BrowserWindow, ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Feature 61: Accessibility Event Listener
// ---------------------------------------------------------------------------

export type AccessibilityEventType =
  | 'focus-changed'
  | 'screen-reader-detected'
  | 'reduce-motion-changed'
  | 'high-contrast-changed'
  | 'zoom-changed'
  | 'keyboard-navigation'
  | 'element-announced'
  | 'live-region-update';

export interface AccessibilityEvent {
  type: AccessibilityEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

class AccessibilityEventListener {
  private listeners: Map<AccessibilityEventType, Array<(evt: AccessibilityEvent) => void>> = new Map();
  private recentEvents: AccessibilityEvent[] = [];
  private maxRecentEvents = 200;
  private screenReaderActive = false;
  private reduceMotion = false;
  private highContrast = false;
  private checkInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    // Check initial accessibility state
    this.checkAccessibilityState();

    // Periodic check for accessibility changes (10 seconds)
    this.checkInterval = setInterval(() => {
      this.checkAccessibilityState();
    }, 10_000);

    // Listen for IPC accessibility events from renderer
    ipcMain.on('accessibility:focus-changed', (_event, data) => {
      this.emit({ type: 'focus-changed', timestamp: Date.now(), data });
    });

    ipcMain.on('accessibility:keyboard-navigation', (_event, data) => {
      this.emit({ type: 'keyboard-navigation', timestamp: Date.now(), data });
    });

    ipcMain.on('accessibility:element-announced', (_event, data) => {
      this.emit({ type: 'element-announced', timestamp: Date.now(), data });
    });

    ipcMain.on('accessibility:live-region-update', (_event, data) => {
      this.emit({ type: 'live-region-update', timestamp: Date.now(), data });
    });

    log.info('[Accessibility] Feature 61: Accessibility event listener initialized');
  }

  private checkAccessibilityState(): void {
    try {
      const wasScreenReaderActive = this.screenReaderActive;
      this.screenReaderActive = app.accessibilitySupportEnabled;

      if (this.screenReaderActive !== wasScreenReaderActive) {
        this.emit({
          type: 'screen-reader-detected',
          timestamp: Date.now(),
          data: { active: this.screenReaderActive },
        });

        // Notify renderers
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.webContents.send('accessibility:screen-reader-state', this.screenReaderActive);
          } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }

    // Check system preferences if available
    try {
      const { systemPreferences } = require('electron');
      if (typeof systemPreferences.getAnimationSettings === 'function') {
        const animSettings = systemPreferences.getAnimationSettings();
        const newReduceMotion = animSettings.prefersReducedMotion || false;
        if (newReduceMotion !== this.reduceMotion) {
          this.reduceMotion = newReduceMotion;
          this.emit({
            type: 'reduce-motion-changed',
            timestamp: Date.now(),
            data: { reduceMotion: this.reduceMotion },
          });
        }
      }
    } catch { /* ok */ }

    try {
      const { nativeTheme } = require('electron');
      const newHighContrast = nativeTheme.shouldUseHighContrastColors || false;
      if (newHighContrast !== this.highContrast) {
        this.highContrast = newHighContrast;
        this.emit({
          type: 'high-contrast-changed',
          timestamp: Date.now(),
          data: { highContrast: this.highContrast },
        });
      }
    } catch { /* ok */ }
  }

  on(type: AccessibilityEventType, callback: (evt: AccessibilityEvent) => void): () => void {
    const existing = this.listeners.get(type) || [];
    existing.push(callback);
    this.listeners.set(type, existing);
    return () => {
      const list = this.listeners.get(type) || [];
      this.listeners.set(type, list.filter(cb => cb !== callback));
    };
  }

  private emit(event: AccessibilityEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents / 2);
    }

    const callbacks = this.listeners.get(event.type) || [];
    for (const cb of callbacks) {
      try { cb(event); } catch { /* ok */ }
    }
  }

  isScreenReaderActive(): boolean {
    return this.screenReaderActive;
  }

  isReduceMotionEnabled(): boolean {
    return this.reduceMotion;
  }

  isHighContrastEnabled(): boolean {
    return this.highContrast;
  }

  getRecentEvents(count: number = 50): AccessibilityEvent[] {
    return this.recentEvents.slice(-count);
  }

  getState(): { screenReader: boolean; reduceMotion: boolean; highContrast: boolean } {
    return {
      screenReader: this.screenReaderActive,
      reduceMotion: this.reduceMotion,
      highContrast: this.highContrast,
    };
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners.clear();
    ipcMain.removeAllListeners('accessibility:focus-changed');
    ipcMain.removeAllListeners('accessibility:keyboard-navigation');
    ipcMain.removeAllListeners('accessibility:element-announced');
    ipcMain.removeAllListeners('accessibility:live-region-update');
  }
}

// ---------------------------------------------------------------------------
// Feature 62: Semantic UI Tree Description
// ---------------------------------------------------------------------------

export interface UITreeNode {
  id: string;
  role: string; // e.g. 'button', 'input', 'heading', 'navigation', 'region', 'list', 'listitem'
  label: string;
  description?: string;
  value?: string;
  state: {
    disabled?: boolean;
    expanded?: boolean;
    selected?: boolean;
    checked?: boolean;
    focused?: boolean;
    hidden?: boolean;
  };
  children: UITreeNode[];
  bounds?: { x: number; y: number; width: number; height: number };
  actions?: string[]; // Available actions: 'click', 'focus', 'expand', 'select'
}

export interface UITreeSnapshot {
  timestamp: number;
  windowId: number;
  rootNode: UITreeNode;
  focusedNodeId: string | null;
  nodeCount: number;
}

class SemanticUITree {
  private snapshots: Map<number, UITreeSnapshot> = new Map();
  private registeredTrees: Map<number, UITreeNode> = new Map();

  initialize(): void {
    // Listen for tree updates from renderer
    ipcMain.on('accessibility:tree-update', (_event, data: { windowId: number; tree: UITreeNode }) => {
      this.updateTree(data.windowId, data.tree);
    });

    // Handle tree queries from renderer
    ipcMain.handle('accessibility:get-tree', (_event, windowId: number) => {
      return this.getSnapshot(windowId);
    });

    ipcMain.handle('accessibility:find-node', (_event, data: { windowId: number; query: string }) => {
      return this.findNodes(data.windowId, data.query);
    });

    ipcMain.handle('accessibility:describe-element', (_event, data: { windowId: number; nodeId: string }) => {
      const snapshot = this.snapshots.get(data.windowId);
      if (!snapshot) return null;
      return this.findNodeById(snapshot.rootNode, data.nodeId);
    });

    log.info('[Accessibility] Feature 62: Semantic UI tree initialized');
  }

  updateTree(windowId: number, tree: UITreeNode): void {
    this.registeredTrees.set(windowId, tree);

    const nodeCount = this.countNodes(tree);
    const focusedNode = this.findFocusedNode(tree);

    this.snapshots.set(windowId, {
      timestamp: Date.now(),
      windowId,
      rootNode: tree,
      focusedNodeId: focusedNode?.id || null,
      nodeCount,
    });
  }

  getSnapshot(windowId: number): UITreeSnapshot | null {
    return this.snapshots.get(windowId) || null;
  }

  getDescription(windowId: number): string {
    const snapshot = this.snapshots.get(windowId);
    if (!snapshot) return 'No UI tree available for this window.';

    return this.describeNode(snapshot.rootNode, 0);
  }

  findNodes(windowId: number, query: string): UITreeNode[] {
    const snapshot = this.snapshots.get(windowId);
    if (!snapshot) return [];

    const results: UITreeNode[] = [];
    const lower = query.toLowerCase();
    this.walkTree(snapshot.rootNode, (node) => {
      if (
        node.label.toLowerCase().includes(lower) ||
        node.role.toLowerCase().includes(lower) ||
        (node.description && node.description.toLowerCase().includes(lower))
      ) {
        results.push(node);
      }
    });

    return results;
  }

  private findNodeById(node: UITreeNode, id: string): UITreeNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.findNodeById(child, id);
      if (found) return found;
    }
    return null;
  }

  private findFocusedNode(node: UITreeNode): UITreeNode | null {
    if (node.state.focused) return node;
    for (const child of node.children) {
      const found = this.findFocusedNode(child);
      if (found) return found;
    }
    return null;
  }

  private countNodes(node: UITreeNode): number {
    let count = 1;
    for (const child of node.children) {
      count += this.countNodes(child);
    }
    return count;
  }

  private describeNode(node: UITreeNode, depth: number): string {
    if (node.state.hidden) return '';

    const indent = '  '.repeat(depth);
    let desc = `${indent}[${node.role}] "${node.label}"`;

    if (node.value) desc += ` value="${node.value}"`;
    if (node.state.disabled) desc += ' (disabled)';
    if (node.state.expanded !== undefined) desc += node.state.expanded ? ' (expanded)' : ' (collapsed)';
    if (node.state.selected) desc += ' (selected)';
    if (node.state.checked) desc += ' (checked)';
    if (node.state.focused) desc += ' (focused)';
    if (node.actions && node.actions.length > 0) desc += ` actions=[${node.actions.join(',')}]`;

    desc += '\n';

    for (const child of node.children) {
      desc += this.describeNode(child, depth + 1);
    }

    return desc;
  }

  private walkTree(node: UITreeNode, callback: (node: UITreeNode) => void): void {
    callback(node);
    for (const child of node.children) {
      this.walkTree(child, callback);
    }
  }

  getLandmarks(windowId: number): UITreeNode[] {
    const snapshot = this.snapshots.get(windowId);
    if (!snapshot) return [];

    const landmarks: UITreeNode[] = [];
    const landmarkRoles = ['navigation', 'main', 'banner', 'contentinfo', 'complementary', 'search', 'form', 'region'];

    this.walkTree(snapshot.rootNode, (node) => {
      if (landmarkRoles.includes(node.role)) {
        landmarks.push(node);
      }
    });

    return landmarks;
  }

  getHeadings(windowId: number): UITreeNode[] {
    const snapshot = this.snapshots.get(windowId);
    if (!snapshot) return [];

    const headings: UITreeNode[] = [];
    this.walkTree(snapshot.rootNode, (node) => {
      if (node.role.startsWith('heading')) {
        headings.push(node);
      }
    });

    return headings;
  }

  getInteractiveElements(windowId: number): UITreeNode[] {
    const snapshot = this.snapshots.get(windowId);
    if (!snapshot) return [];

    const interactive: UITreeNode[] = [];
    const interactiveRoles = ['button', 'link', 'input', 'checkbox', 'radio', 'combobox', 'slider', 'textbox', 'menuitem'];

    this.walkTree(snapshot.rootNode, (node) => {
      if (interactiveRoles.includes(node.role) && !node.state.disabled && !node.state.hidden) {
        interactive.push(node);
      }
    });

    return interactive;
  }

  shutdown(): void {
    this.snapshots.clear();
    this.registeredTrees.clear();
    ipcMain.removeAllListeners('accessibility:tree-update');
    ipcMain.removeHandler('accessibility:get-tree');
    ipcMain.removeHandler('accessibility:find-node');
    ipcMain.removeHandler('accessibility:describe-element');
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const accessibilityEvents = new AccessibilityEventListener();
export const semanticUITree = new SemanticUITree();

export function initializeAccessibilityManager(): void {
  accessibilityEvents.initialize();
  semanticUITree.initialize();
  log.info('[AccessibilityManager] Features 61-62: Accessibility manager initialized');
}

export function shutdownAccessibilityManager(): void {
  accessibilityEvents.shutdown();
  semanticUITree.shutdown();
}
