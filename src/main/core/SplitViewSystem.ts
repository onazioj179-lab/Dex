// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Split View System
// OS-Level window splitting, tiling, and multi-pane layout management
// Supports horizontal/vertical splits, named layouts, keyboard-driven
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type SplitDirection = 'horizontal' | 'vertical';
export type PanePosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface Pane {
  id: string;
  contentType: string;
  contentId?: string;
  title: string;
  icon?: string;
  size: number; // Percentage 0-100
  minSize: number;
  maxSize: number;
  resizable: boolean;
  closable: boolean;
}

export interface SplitNode {
  id: string;
  type: 'split' | 'pane';
  direction?: SplitDirection;
  children?: SplitNode[];
  pane?: Pane;
  size: number; // Percentage of parent
}

export interface Layout {
  id: string;
  name: string;
  description?: string;
  root: SplitNode;
  createdAt: number;
  updatedAt: number;
  isPreset: boolean;
}

export interface SplitViewConfig {
  snapToEdges: boolean;
  snapThreshold: number;
  minPaneSize: number;
  maxPanes: number;
  showDividers: boolean;
  dividerSize: number;
  animationDuration: number;
}

export interface PaneState {
  paneId: string;
  scrollPosition?: { x: number; y: number };
  focusedElement?: string;
  customState?: Record<string, unknown>;
}

// ===========================================================================
// SPLIT VIEW SYSTEM
// ===========================================================================

class SplitViewSystemClass extends EventEmitter {
  private currentLayout: Layout | null = null;
  private savedLayouts: Map<string, Layout> = new Map();
  private paneStates: Map<string, PaneState> = new Map();
  private config: SplitViewConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;

  // Preset layouts
  private readonly PRESET_LAYOUTS: Omit<Layout, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'single',
      name: 'Single Pane',
      description: 'Full screen single view',
      isPreset: true,
      root: {
        id: 'root',
        type: 'pane',
        size: 100,
        pane: {
          id: 'main',
          contentType: 'empty',
          title: 'Main',
          size: 100,
          minSize: 100,
          maxSize: 100,
          resizable: false,
          closable: false,
        },
      },
    },
    {
      id: 'split-horizontal',
      name: 'Side by Side',
      description: 'Two panes side by side',
      isPreset: true,
      root: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        size: 100,
        children: [
          {
            id: 'left',
            type: 'pane',
            size: 50,
            pane: {
              id: 'left-pane',
              contentType: 'empty',
              title: 'Left',
              size: 50,
              minSize: 20,
              maxSize: 80,
              resizable: true,
              closable: true,
            },
          },
          {
            id: 'right',
            type: 'pane',
            size: 50,
            pane: {
              id: 'right-pane',
              contentType: 'empty',
              title: 'Right',
              size: 50,
              minSize: 20,
              maxSize: 80,
              resizable: true,
              closable: true,
            },
          },
        ],
      },
    },
    {
      id: 'split-vertical',
      name: 'Stacked',
      description: 'Two panes stacked vertically',
      isPreset: true,
      root: {
        id: 'root',
        type: 'split',
        direction: 'vertical',
        size: 100,
        children: [
          {
            id: 'top',
            type: 'pane',
            size: 50,
            pane: {
              id: 'top-pane',
              contentType: 'empty',
              title: 'Top',
              size: 50,
              minSize: 20,
              maxSize: 80,
              resizable: true,
              closable: true,
            },
          },
          {
            id: 'bottom',
            type: 'pane',
            size: 50,
            pane: {
              id: 'bottom-pane',
              contentType: 'empty',
              title: 'Bottom',
              size: 50,
              minSize: 20,
              maxSize: 80,
              resizable: true,
              closable: true,
            },
          },
        ],
      },
    },
    {
      id: 'three-columns',
      name: 'Three Columns',
      description: 'Three equal columns',
      isPreset: true,
      root: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        size: 100,
        children: [
          {
            id: 'col1',
            type: 'pane',
            size: 33.33,
            pane: {
              id: 'col1-pane',
              contentType: 'empty',
              title: 'Column 1',
              size: 33.33,
              minSize: 15,
              maxSize: 70,
              resizable: true,
              closable: true,
            },
          },
          {
            id: 'col2',
            type: 'pane',
            size: 33.33,
            pane: {
              id: 'col2-pane',
              contentType: 'empty',
              title: 'Column 2',
              size: 33.33,
              minSize: 15,
              maxSize: 70,
              resizable: true,
              closable: true,
            },
          },
          {
            id: 'col3',
            type: 'pane',
            size: 33.34,
            pane: {
              id: 'col3-pane',
              contentType: 'empty',
              title: 'Column 3',
              size: 33.34,
              minSize: 15,
              maxSize: 70,
              resizable: true,
              closable: true,
            },
          },
        ],
      },
    },
    {
      id: 'main-sidebar',
      name: 'Main + Sidebar',
      description: 'Large main pane with narrow sidebar',
      isPreset: true,
      root: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        size: 100,
        children: [
          {
            id: 'main',
            type: 'pane',
            size: 70,
            pane: {
              id: 'main-pane',
              contentType: 'empty',
              title: 'Main',
              size: 70,
              minSize: 50,
              maxSize: 85,
              resizable: true,
              closable: false,
            },
          },
          {
            id: 'sidebar',
            type: 'pane',
            size: 30,
            pane: {
              id: 'sidebar-pane',
              contentType: 'empty',
              title: 'Sidebar',
              size: 30,
              minSize: 15,
              maxSize: 50,
              resizable: true,
              closable: true,
            },
          },
        ],
      },
    },
    {
      id: 'quadrant',
      name: 'Four Quadrants',
      description: 'Four equal panes in a grid',
      isPreset: true,
      root: {
        id: 'root',
        type: 'split',
        direction: 'vertical',
        size: 100,
        children: [
          {
            id: 'top-row',
            type: 'split',
            direction: 'horizontal',
            size: 50,
            children: [
              {
                id: 'tl',
                type: 'pane',
                size: 50,
                pane: {
                  id: 'tl-pane',
                  contentType: 'empty',
                  title: 'Top Left',
                  size: 50,
                  minSize: 20,
                  maxSize: 80,
                  resizable: true,
                  closable: true,
                },
              },
              {
                id: 'tr',
                type: 'pane',
                size: 50,
                pane: {
                  id: 'tr-pane',
                  contentType: 'empty',
                  title: 'Top Right',
                  size: 50,
                  minSize: 20,
                  maxSize: 80,
                  resizable: true,
                  closable: true,
                },
              },
            ],
          },
          {
            id: 'bottom-row',
            type: 'split',
            direction: 'horizontal',
            size: 50,
            children: [
              {
                id: 'bl',
                type: 'pane',
                size: 50,
                pane: {
                  id: 'bl-pane',
                  contentType: 'empty',
                  title: 'Bottom Left',
                  size: 50,
                  minSize: 20,
                  maxSize: 80,
                  resizable: true,
                  closable: true,
                },
              },
              {
                id: 'br',
                type: 'pane',
                size: 50,
                pane: {
                  id: 'br-pane',
                  contentType: 'empty',
                  title: 'Bottom Right',
                  size: 50,
                  minSize: 20,
                  maxSize: 80,
                  resizable: true,
                  closable: true,
                },
              },
            ],
          },
        ],
      },
    },
  ];

  constructor() {
    super();
    this.config = {
      snapToEdges: true,
      snapThreshold: 50,
      minPaneSize: 10,
      maxPanes: 8,
      showDividers: true,
      dividerSize: 4,
      animationDuration: 200,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'splitview');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadLayouts();
      await this.loadConfig();
      
      // Initialize with single pane layout if none
      if (!this.currentLayout) {
        this.applyPresetLayout('single');
      }
      
      log.info(`[SplitView] Initialized with ${this.savedLayouts.size} layouts`);
    } catch (error) {
      log.error('[SplitView] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get current layout
    ipcMain.handle('splitview:current', () => this.currentLayout);

    // Get all layouts
    ipcMain.handle('splitview:layouts', () => this.getAllLayouts());

    // Get presets
    ipcMain.handle('splitview:presets', () => this.getPresetLayouts());

    // Apply preset layout
    ipcMain.handle('splitview:applyPreset', (_event, presetId: string) => {
      return this.applyPresetLayout(presetId);
    });

    // Apply saved layout
    ipcMain.handle('splitview:apply', (_event, layoutId: string) => {
      return this.applyLayout(layoutId);
    });

    // Save current layout
    ipcMain.handle('splitview:save', async (_event, name: string, description?: string) => {
      return this.saveCurrentLayout(name, description);
    });

    // Delete layout
    ipcMain.handle('splitview:delete', async (_event, layoutId: string) => {
      return this.deleteLayout(layoutId);
    });

    // Split pane
    ipcMain.handle('splitview:split', (_event, paneId: string, direction: SplitDirection) => {
      return this.splitPane(paneId, direction);
    });

    // Close pane
    ipcMain.handle('splitview:closePane', (_event, paneId: string) => {
      return this.closePane(paneId);
    });

    // Resize pane
    ipcMain.handle('splitview:resize', (_event, paneId: string, size: number) => {
      return this.resizePane(paneId, size);
    });

    // Set pane content
    ipcMain.handle('splitview:setContent', (_event, paneId: string, contentType: string, contentId?: string) => {
      return this.setPaneContent(paneId, contentType, contentId);
    });

    // Swap panes
    ipcMain.handle('splitview:swap', (_event, paneId1: string, paneId2: string) => {
      return this.swapPanes(paneId1, paneId2);
    });

    // Focus pane
    ipcMain.handle('splitview:focus', (_event, paneId: string) => {
      return this.focusPane(paneId);
    });

    // Get pane by position
    ipcMain.handle('splitview:paneAt', (_event, position: PanePosition) => {
      return this.getPaneAtPosition(position);
    });

    // Toggle maximize
    ipcMain.handle('splitview:maximize', (_event, paneId: string) => {
      return this.toggleMaximize(paneId);
    });

    // Save pane state
    ipcMain.handle('splitview:savePaneState', (_event, state: PaneState) => {
      return this.savePaneState(state);
    });

    // Get pane state
    ipcMain.handle('splitview:getPaneState', (_event, paneId: string) => {
      return this.getPaneState(paneId);
    });

    // Config
    ipcMain.handle('splitview:config', () => this.config);
    ipcMain.handle('splitview:setConfig', async (_event, config: Partial<SplitViewConfig>) => {
      return this.setConfig(config);
    });

    // Reset to single pane
    ipcMain.handle('splitview:reset', () => {
      return this.applyPresetLayout('single');
    });
  }

  // -------------------------------------------------------------------------
  // LAYOUT MANAGEMENT
  // -------------------------------------------------------------------------

  getAllLayouts(): Layout[] {
    const presets = this.getPresetLayouts();
    const saved = Array.from(this.savedLayouts.values());
    return [...presets, ...saved];
  }

  getPresetLayouts(): Layout[] {
    const now = Date.now();
    return this.PRESET_LAYOUTS.map(preset => ({
      ...preset,
      createdAt: now,
      updatedAt: now,
    }));
  }

  applyPresetLayout(presetId: string): { success: boolean; error?: string } {
    const preset = this.PRESET_LAYOUTS.find(p => p.id === presetId);
    if (!preset) {
      return { success: false, error: 'Preset not found' };
    }

    const now = Date.now();
    this.currentLayout = {
      ...preset,
      createdAt: now,
      updatedAt: now,
    };

    this.notifyLayoutChange();
    return { success: true };
  }

  applyLayout(layoutId: string): { success: boolean; error?: string } {
    const layout = this.savedLayouts.get(layoutId);
    if (!layout) {
      return { success: false, error: 'Layout not found' };
    }

    this.currentLayout = { ...layout, updatedAt: Date.now() };
    this.notifyLayoutChange();
    return { success: true };
  }

  async saveCurrentLayout(name: string, description?: string): Promise<{ success: boolean; layoutId?: string }> {
    if (!this.currentLayout) {
      return { success: false };
    }

    const layoutId = `layout-${++this.idCounter}-${Date.now()}`;
    const layout: Layout = {
      ...this.currentLayout,
      id: layoutId,
      name,
      description,
      isPreset: false,
      updatedAt: Date.now(),
    };

    this.savedLayouts.set(layoutId, layout);
    await this.saveLayouts();

    return { success: true, layoutId };
  }

  async deleteLayout(layoutId: string): Promise<{ success: boolean }> {
    if (this.savedLayouts.delete(layoutId)) {
      await this.saveLayouts();
      return { success: true };
    }
    return { success: false };
  }

  // -------------------------------------------------------------------------
  // PANE OPERATIONS
  // -------------------------------------------------------------------------

  splitPane(paneId: string, direction: SplitDirection): { success: boolean; newPaneId?: string } {
    if (!this.currentLayout) return { success: false };

    // Count existing panes
    const paneCount = this.countPanes(this.currentLayout.root);
    if (paneCount >= this.config.maxPanes) {
      return { success: false };
    }

    const result = this.findAndSplitPane(this.currentLayout.root, paneId, direction);
    if (result.success) {
      this.currentLayout.updatedAt = Date.now();
      this.notifyLayoutChange();
    }
    return result;
  }

  private findAndSplitPane(node: SplitNode, paneId: string, direction: SplitDirection): { success: boolean; newPaneId?: string } {
    if (node.type === 'pane' && node.pane?.id === paneId) {
      // Convert this pane node to a split node
      const newPaneId = `pane-${++this.idCounter}-${Date.now()}`;
      const originalPane = node.pane;
      
      // Transform the node
      node.type = 'split';
      node.direction = direction;
      node.children = [
        {
          id: `node-${this.idCounter++}`,
          type: 'pane',
          size: 50,
          pane: {
            ...originalPane,
            size: 50,
          },
        },
        {
          id: `node-${this.idCounter++}`,
          type: 'pane',
          size: 50,
          pane: {
            id: newPaneId,
            contentType: 'empty',
            title: 'New Pane',
            size: 50,
            minSize: this.config.minPaneSize,
            maxSize: 100 - this.config.minPaneSize,
            resizable: true,
            closable: true,
          },
        },
      ];
      delete node.pane;

      return { success: true, newPaneId };
    }

    if (node.children) {
      for (const child of node.children) {
        const result = this.findAndSplitPane(child, paneId, direction);
        if (result.success) return result;
      }
    }

    return { success: false };
  }

  closePane(paneId: string): { success: boolean } {
    if (!this.currentLayout) return { success: false };

    // Can't close if only one pane
    if (this.countPanes(this.currentLayout.root) <= 1) {
      return { success: false };
    }

    const result = this.findAndClosePane(this.currentLayout.root, null, paneId);
    if (result) {
      this.currentLayout.updatedAt = Date.now();
      this.normalizeLayout(this.currentLayout.root);
      this.notifyLayoutChange();
      return { success: true };
    }
    return { success: false };
  }

  private findAndClosePane(node: SplitNode, parent: SplitNode | null, paneId: string): boolean {
    if (node.type === 'pane' && node.pane?.id === paneId) {
      // Remove from parent
      if (parent?.children) {
        const index = parent.children.indexOf(node);
        if (index > -1) {
          parent.children.splice(index, 1);
          
          // If parent only has one child now, merge up
          if (parent.children.length === 1) {
            const remaining = parent.children[0];
            parent.type = remaining.type;
            parent.pane = remaining.pane;
            parent.direction = remaining.direction;
            parent.children = remaining.children;
          } else {
            // Redistribute sizes
            const totalSize = parent.children.reduce((sum, c) => sum + c.size, 0);
            parent.children.forEach(c => {
              c.size = (c.size / totalSize) * 100;
              if (c.pane) c.pane.size = c.size;
            });
          }
          return true;
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.findAndClosePane(child, node, paneId)) {
          return true;
        }
      }
    }

    return false;
  }

  resizePane(paneId: string, newSize: number): { success: boolean } {
    if (!this.currentLayout) return { success: false };

    const result = this.findAndResizePane(this.currentLayout.root, paneId, newSize);
    if (result) {
      this.currentLayout.updatedAt = Date.now();
      this.notifyLayoutChange();
      return { success: true };
    }
    return { success: false };
  }

  private findAndResizePane(node: SplitNode, paneId: string, newSize: number): boolean {
    if (node.type === 'pane' && node.pane?.id === paneId) {
      const clampedSize = Math.max(
        node.pane.minSize,
        Math.min(node.pane.maxSize, newSize)
      );
      node.size = clampedSize;
      node.pane.size = clampedSize;
      return true;
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (this.findPaneInNode(child, paneId)) {
          const clampedSize = Math.max(this.config.minPaneSize, Math.min(100 - this.config.minPaneSize, newSize));
          const oldSize = child.size;
          const diff = clampedSize - oldSize;
          
          // Adjust adjacent sibling
          if (i < node.children.length - 1) {
            node.children[i + 1].size -= diff;
          } else if (i > 0) {
            node.children[i - 1].size -= diff;
          }
          
          child.size = clampedSize;
          if (child.pane) child.pane.size = clampedSize;
          return true;
        }
        
        if (this.findAndResizePane(child, paneId, newSize)) {
          return true;
        }
      }
    }

    return false;
  }

  setPaneContent(paneId: string, contentType: string, contentId?: string): { success: boolean } {
    if (!this.currentLayout) return { success: false };

    const pane = this.findPane(this.currentLayout.root, paneId);
    if (pane) {
      pane.contentType = contentType;
      pane.contentId = contentId;
      this.currentLayout.updatedAt = Date.now();
      this.notifyLayoutChange();
      return { success: true };
    }
    return { success: false };
  }

  swapPanes(paneId1: string, paneId2: string): { success: boolean } {
    if (!this.currentLayout) return { success: false };

    const pane1 = this.findPane(this.currentLayout.root, paneId1);
    const pane2 = this.findPane(this.currentLayout.root, paneId2);

    if (pane1 && pane2) {
      // Swap content
      const tempContent = { type: pane1.contentType, id: pane1.contentId, title: pane1.title };
      pane1.contentType = pane2.contentType;
      pane1.contentId = pane2.contentId;
      pane1.title = pane2.title;
      pane2.contentType = tempContent.type;
      pane2.contentId = tempContent.id;
      pane2.title = tempContent.title;

      this.currentLayout.updatedAt = Date.now();
      this.notifyLayoutChange();
      return { success: true };
    }
    return { success: false };
  }

  focusPane(paneId: string): { success: boolean } {
    this.notifyRenderer('splitview:focus', { paneId });
    this.emit('pane:focused', paneId);
    return { success: true };
  }

  getPaneAtPosition(position: PanePosition): Pane | null {
    if (!this.currentLayout) return null;
    return this.findPaneAtPosition(this.currentLayout.root, position);
  }

  private findPaneAtPosition(node: SplitNode, position: PanePosition): Pane | null {
    if (position === 'center' && node.type === 'pane') {
      return node.pane || null;
    }

    if (node.type === 'split' && node.children?.length) {
      if (node.direction === 'horizontal') {
        if (position === 'left') {
          return this.getFirstPane(node.children[0]);
        } else if (position === 'right') {
          return this.getFirstPane(node.children[node.children.length - 1]);
        }
      } else if (node.direction === 'vertical') {
        if (position === 'top') {
          return this.getFirstPane(node.children[0]);
        } else if (position === 'bottom') {
          return this.getFirstPane(node.children[node.children.length - 1]);
        }
      }
    }

    return null;
  }

  private maximizedPaneId: string | null = null;

  toggleMaximize(paneId: string): { success: boolean; maximized: boolean } {
    if (this.maximizedPaneId === paneId) {
      this.maximizedPaneId = null;
      this.notifyRenderer('splitview:maximized', { paneId: null });
      return { success: true, maximized: false };
    } else {
      this.maximizedPaneId = paneId;
      this.notifyRenderer('splitview:maximized', { paneId });
      return { success: true, maximized: true };
    }
  }

  // -------------------------------------------------------------------------
  // PANE STATE
  // -------------------------------------------------------------------------

  savePaneState(state: PaneState): { success: boolean } {
    this.paneStates.set(state.paneId, state);
    return { success: true };
  }

  getPaneState(paneId: string): PaneState | null {
    return this.paneStates.get(paneId) || null;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async setConfig(config: Partial<SplitViewConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    this.notifyRenderer('splitview:configChanged', this.config);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private findPane(node: SplitNode, paneId: string): Pane | null {
    if (node.type === 'pane' && node.pane?.id === paneId) {
      return node.pane;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = this.findPane(child, paneId);
        if (found) return found;
      }
    }
    return null;
  }

  private findPaneInNode(node: SplitNode, paneId: string): boolean {
    if (node.type === 'pane' && node.pane?.id === paneId) {
      return true;
    }
    if (node.children) {
      return node.children.some(child => this.findPaneInNode(child, paneId));
    }
    return false;
  }

  private getFirstPane(node: SplitNode): Pane | null {
    if (node.type === 'pane') {
      return node.pane || null;
    }
    if (node.children?.length) {
      return this.getFirstPane(node.children[0]);
    }
    return null;
  }

  private countPanes(node: SplitNode): number {
    if (node.type === 'pane') return 1;
    if (node.children) {
      return node.children.reduce((sum, child) => sum + this.countPanes(child), 0);
    }
    return 0;
  }

  private normalizeLayout(node: SplitNode): void {
    if (node.children) {
      // Ensure sizes sum to 100
      const total = node.children.reduce((sum, c) => sum + c.size, 0);
      if (Math.abs(total - 100) > 0.1) {
        node.children.forEach(c => {
          c.size = (c.size / total) * 100;
          if (c.pane) c.pane.size = c.size;
        });
      }
      // Recurse
      node.children.forEach(child => this.normalizeLayout(child));
    }
  }

  private notifyLayoutChange(): void {
    this.notifyRenderer('splitview:changed', this.currentLayout);
    this.emit('layout:changed', this.currentLayout);
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadLayouts(): Promise<void> {
    try {
      const layoutsFile = path.join(this.dataPath, 'layouts.json');
      const data = await fs.readFile(layoutsFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      if (parsed.layouts) {
        for (const layout of parsed.layouts) {
          this.savedLayouts.set(layout.id, layout);
        }
      }
      if (parsed.currentLayout) {
        this.currentLayout = parsed.currentLayout;
      }
    } catch {
      // No saved layouts
    }
  }

  private async saveLayouts(): Promise<void> {
    try {
      const layoutsFile = path.join(this.dataPath, 'layouts.json');
      const data = {
        layouts: Array.from(this.savedLayouts.values()),
        currentLayout: this.currentLayout,
      };
      await fs.writeFile(layoutsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      log.error('[SplitView] Failed to save layouts:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configFile = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configFile = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[SplitView] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.saveLayouts();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const SplitViewSystem = new SplitViewSystemClass();
export default SplitViewSystem;
