// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Dashboard Widget System
// Phase 41: Customizable dashboard with drag-drop widgets
// ===========================================================================

import log from 'electron-log';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

// ===========================================================================
// TYPES
// ===========================================================================

export type WidgetType = 
  | 'quick-actions'
  | 'recent-files'
  | 'notes-scratchpad'
  | 'active-sessions'
  | 'transfer-status'
  | 'media-preview'
  | 'shortcuts'
  | 'system-status'
  | 'clock'
  | 'calendar'
  | 'weather'
  | 'custom';

export interface WidgetPosition {
  x: number;        // Grid column
  y: number;        // Grid row
  width: number;    // Grid columns span
  height: number;   // Grid rows span
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  position: WidgetPosition;
  settings: Record<string, unknown>;
  visible: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  gridColumns: number;
  gridRows: number;
  cellSize: number;
  gap: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface QuickButton {
  id: string;
  actionId: string;
  label: string;
  icon: string;
  position: number;
  location: 'dashboard' | 'left-dock' | 'right-dock';
  color?: string;
  hotkey?: string;
  createdAt: number;
}

export interface WidgetTemplate {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  maxSize: { width: number; height: number };
  defaultSettings: Record<string, unknown>;
}

// ===========================================================================
// WIDGET TEMPLATES
// ===========================================================================

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    type: 'quick-actions',
    name: 'Quick Actions',
    description: 'Frequently used action buttons',
    icon: 'zap',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 1, height: 1 },
    maxSize: { width: 4, height: 4 },
    defaultSettings: { maxActions: 6, showLabels: true },
  },
  {
    type: 'recent-files',
    name: 'Recent Files',
    description: 'Recently accessed files',
    icon: 'file',
    defaultSize: { width: 2, height: 3 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 6 },
    defaultSettings: { maxFiles: 10, showThumbnails: true },
  },
  {
    type: 'notes-scratchpad',
    name: 'Notes Scratchpad',
    description: 'Quick notes and scratch area',
    icon: 'edit-3',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 6 },
    defaultSettings: { autosave: true, fontSize: 14 },
  },
  {
    type: 'active-sessions',
    name: 'Active Sessions',
    description: 'Current work sessions and timers',
    icon: 'clock',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 2, height: 1 },
    maxSize: { width: 4, height: 4 },
    defaultSettings: { showTimers: true, showDuration: true },
  },
  {
    type: 'transfer-status',
    name: 'Transfer Status',
    description: 'Active file transfers',
    icon: 'upload',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 2, height: 1 },
    maxSize: { width: 4, height: 4 },
    defaultSettings: { showProgress: true, showSpeed: true },
  },
  {
    type: 'media-preview',
    name: 'Media Preview',
    description: 'Preview images, audio, video',
    icon: 'image',
    defaultSize: { width: 3, height: 3 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 6, height: 6 },
    defaultSettings: { autoPlay: false, showControls: true },
  },
  {
    type: 'shortcuts',
    name: 'Shortcuts',
    description: 'Custom shortcuts and links',
    icon: 'link',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 1, height: 1 },
    maxSize: { width: 4, height: 4 },
    defaultSettings: { iconSize: 'medium', layout: 'grid' },
  },
  {
    type: 'system-status',
    name: 'System Status',
    description: 'CPU, memory, and system health',
    icon: 'activity',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 2, height: 1 },
    maxSize: { width: 4, height: 3 },
    defaultSettings: { showCPU: true, showMemory: true, showDisk: false },
  },
  {
    type: 'clock',
    name: 'Clock',
    description: 'Current time and date',
    icon: 'clock',
    defaultSize: { width: 2, height: 1 },
    minSize: { width: 1, height: 1 },
    maxSize: { width: 3, height: 2 },
    defaultSettings: { format: '24h', showDate: true, showSeconds: false },
  },
  {
    type: 'calendar',
    name: 'Calendar',
    description: 'Mini calendar view',
    icon: 'calendar',
    defaultSize: { width: 2, height: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    defaultSettings: { showEvents: true, weekStart: 'monday' },
  },
];

// ===========================================================================
// STORE
// ===========================================================================

const dashboardStore = new Store<{
  layouts: DashboardLayout[];
  activeLayoutId: string;
  quickButtons: QuickButton[];
  lastModified: number;
}>({
  name: 'dashboard-widgets',
  defaults: {
    layouts: [],
    activeLayoutId: 'default',
    quickButtons: [],
    lastModified: Date.now(),
  },
});

// ===========================================================================
// DASHBOARD WIDGET SYSTEM
// ===========================================================================

class DashboardWidgetSystem {
  private static instance: DashboardWidgetSystem;
  private initialized = false;
  private changeListeners: Set<(layout: DashboardLayout) => void> = new Set();

  private constructor() {}

  static getInstance(): DashboardWidgetSystem {
    if (!DashboardWidgetSystem.instance) {
      DashboardWidgetSystem.instance = new DashboardWidgetSystem();
    }
    return DashboardWidgetSystem.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure default layout exists
    const layouts = dashboardStore.get('layouts');
    if (layouts.length === 0) {
      await this.createDefaultLayout();
    }

    this.initialized = true;
    log.info('[DashboardWidgetSystem] Initialized');
  }

  private async createDefaultLayout(): Promise<DashboardLayout> {
    const defaultLayout: DashboardLayout = {
      id: 'default',
      name: 'Default',
      widgets: [], // Start empty - user decides what to add
      gridColumns: 12,
      gridRows: 8,
      cellSize: 100,
      gap: 16,
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const layouts = [defaultLayout];
    dashboardStore.set('layouts', layouts);
    dashboardStore.set('activeLayoutId', 'default');

    return defaultLayout;
  }

  // -------------------------------------------------------------------------
  // LAYOUT MANAGEMENT
  // -------------------------------------------------------------------------

  getActiveLayout(): DashboardLayout | null {
    const layouts = dashboardStore.get('layouts');
    const activeId = dashboardStore.get('activeLayoutId');
    return layouts.find(l => l.id === activeId) || layouts[0] || null;
  }

  getAllLayouts(): DashboardLayout[] {
    return dashboardStore.get('layouts');
  }

  async createLayout(name: string): Promise<DashboardLayout> {
    const layout: DashboardLayout = {
      id: `layout_${Date.now()}`,
      name,
      widgets: [],
      gridColumns: 12,
      gridRows: 8,
      cellSize: 100,
      gap: 16,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const layouts = dashboardStore.get('layouts');
    layouts.push(layout);
    dashboardStore.set('layouts', layouts);
    dashboardStore.set('lastModified', Date.now());

    return layout;
  }

  async setActiveLayout(layoutId: string): Promise<boolean> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return false;

    dashboardStore.set('activeLayoutId', layoutId);
    this.notifyChange(layout);
    return true;
  }

  async deleteLayout(layoutId: string): Promise<boolean> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    
    if (!layout || layout.isDefault) return false;

    const filtered = layouts.filter(l => l.id !== layoutId);
    dashboardStore.set('layouts', filtered);

    // Switch to default if active was deleted
    if (dashboardStore.get('activeLayoutId') === layoutId) {
      dashboardStore.set('activeLayoutId', 'default');
    }

    return true;
  }

  async duplicateLayout(layoutId: string, newName: string): Promise<DashboardLayout | null> {
    const layouts = dashboardStore.get('layouts');
    const source = layouts.find(l => l.id === layoutId);
    if (!source) return null;

    const duplicate: DashboardLayout = {
      ...source,
      id: `layout_${Date.now()}`,
      name: newName,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      widgets: source.widgets.map(w => ({
        ...w,
        id: `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })),
    };

    layouts.push(duplicate);
    dashboardStore.set('layouts', layouts);

    return duplicate;
  }

  // -------------------------------------------------------------------------
  // WIDGET MANAGEMENT
  // -------------------------------------------------------------------------

  getWidgetTemplates(): WidgetTemplate[] {
    return WIDGET_TEMPLATES;
  }

  async addWidget(
    layoutId: string,
    type: WidgetType,
    position?: Partial<WidgetPosition>,
    settings?: Record<string, unknown>
  ): Promise<WidgetConfig | null> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return null;

    const template = WIDGET_TEMPLATES.find(t => t.type === type);
    if (!template) return null;

    // Find available position if not specified
    const finalPosition = position ? {
      x: position.x ?? 0,
      y: position.y ?? 0,
      width: position.width ?? template.defaultSize.width,
      height: position.height ?? template.defaultSize.height,
    } : this.findAvailablePosition(layout, template.defaultSize);

    const widget: WidgetConfig = {
      id: `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title: template.name,
      position: finalPosition,
      settings: { ...template.defaultSettings, ...settings },
      visible: true,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    layout.widgets.push(widget);
    layout.updatedAt = Date.now();
    dashboardStore.set('layouts', layouts);
    dashboardStore.set('lastModified', Date.now());

    this.notifyChange(layout);
    return widget;
  }

  async updateWidget(
    layoutId: string,
    widgetId: string,
    updates: Partial<WidgetConfig>
  ): Promise<WidgetConfig | null> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return null;

    const widget = layout.widgets.find(w => w.id === widgetId);
    if (!widget) return null;

    // Apply updates
    Object.assign(widget, updates, { updatedAt: Date.now() });
    layout.updatedAt = Date.now();

    dashboardStore.set('layouts', layouts);
    dashboardStore.set('lastModified', Date.now());

    this.notifyChange(layout);
    return widget;
  }

  async moveWidget(
    layoutId: string,
    widgetId: string,
    newPosition: Partial<WidgetPosition>
  ): Promise<boolean> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return false;

    const widget = layout.widgets.find(w => w.id === widgetId);
    if (!widget || widget.locked) return false;

    // Validate position within grid
    const x = Math.max(0, Math.min(newPosition.x ?? widget.position.x, layout.gridColumns - widget.position.width));
    const y = Math.max(0, newPosition.y ?? widget.position.y);

    widget.position.x = x;
    widget.position.y = y;
    widget.updatedAt = Date.now();
    layout.updatedAt = Date.now();

    dashboardStore.set('layouts', layouts);
    this.notifyChange(layout);

    return true;
  }

  async resizeWidget(
    layoutId: string,
    widgetId: string,
    newSize: { width: number; height: number }
  ): Promise<boolean> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return false;

    const widget = layout.widgets.find(w => w.id === widgetId);
    if (!widget || widget.locked) return false;

    const template = WIDGET_TEMPLATES.find(t => t.type === widget.type);
    if (!template) return false;

    // Enforce min/max constraints
    const width = Math.max(
      template.minSize.width,
      Math.min(newSize.width, template.maxSize.width, layout.gridColumns - widget.position.x)
    );
    const height = Math.max(
      template.minSize.height,
      Math.min(newSize.height, template.maxSize.height)
    );

    widget.position.width = width;
    widget.position.height = height;
    widget.updatedAt = Date.now();
    layout.updatedAt = Date.now();

    dashboardStore.set('layouts', layouts);
    this.notifyChange(layout);

    return true;
  }

  async removeWidget(layoutId: string, widgetId: string): Promise<boolean> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return false;

    const index = layout.widgets.findIndex(w => w.id === widgetId);
    if (index === -1) return false;

    layout.widgets.splice(index, 1);
    layout.updatedAt = Date.now();

    dashboardStore.set('layouts', layouts);
    dashboardStore.set('lastModified', Date.now());

    this.notifyChange(layout);
    return true;
  }

  private findAvailablePosition(
    layout: DashboardLayout,
    size: { width: number; height: number }
  ): WidgetPosition {
    // Simple placement: find first row with space
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x <= layout.gridColumns - size.width; x++) {
        if (!this.isPositionOccupied(layout, x, y, size.width, size.height)) {
          return { x, y, width: size.width, height: size.height };
        }
      }
    }
    // Fallback: place at origin (will overlap)
    return { x: 0, y: 0, width: size.width, height: size.height };
  }

  private isPositionOccupied(
    layout: DashboardLayout,
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    return layout.widgets.some(widget => {
      const wx = widget.position.x;
      const wy = widget.position.y;
      const ww = widget.position.width;
      const wh = widget.position.height;

      return !(x + width <= wx || x >= wx + ww || y + height <= wy || y >= wy + wh);
    });
  }

  // -------------------------------------------------------------------------
  // QUICK BUTTONS
  // -------------------------------------------------------------------------

  getQuickButtons(location?: QuickButton['location']): QuickButton[] {
    const buttons = dashboardStore.get('quickButtons');
    if (location) {
      return buttons.filter(b => b.location === location).sort((a, b) => a.position - b.position);
    }
    return buttons.sort((a, b) => a.position - b.position);
  }

  async addQuickButton(
    actionId: string,
    label: string,
    icon: string,
    location: QuickButton['location'] = 'dashboard'
  ): Promise<QuickButton> {
    const buttons = dashboardStore.get('quickButtons');
    
    // Check if already exists
    const existing = buttons.find(b => b.actionId === actionId && b.location === location);
    if (existing) return existing;

    const locationButtons = buttons.filter(b => b.location === location);
    const maxPosition = locationButtons.length > 0 
      ? Math.max(...locationButtons.map(b => b.position)) 
      : -1;

    const button: QuickButton = {
      id: `qb_${Date.now()}`,
      actionId,
      label,
      icon,
      position: maxPosition + 1,
      location,
      createdAt: Date.now(),
    };

    buttons.push(button);
    dashboardStore.set('quickButtons', buttons);
    dashboardStore.set('lastModified', Date.now());

    return button;
  }

  async updateQuickButton(buttonId: string, updates: Partial<QuickButton>): Promise<QuickButton | null> {
    const buttons = dashboardStore.get('quickButtons');
    const button = buttons.find(b => b.id === buttonId);
    if (!button) return null;

    Object.assign(button, updates);
    dashboardStore.set('quickButtons', buttons);

    return button;
  }

  async removeQuickButton(buttonId: string): Promise<boolean> {
    const buttons = dashboardStore.get('quickButtons');
    const index = buttons.findIndex(b => b.id === buttonId);
    if (index === -1) return false;

    buttons.splice(index, 1);
    dashboardStore.set('quickButtons', buttons);
    dashboardStore.set('lastModified', Date.now());

    return true;
  }

  async reorderQuickButtons(location: QuickButton['location'], orderedIds: string[]): Promise<boolean> {
    const buttons = dashboardStore.get('quickButtons');
    
    orderedIds.forEach((id, index) => {
      const button = buttons.find(b => b.id === id && b.location === location);
      if (button) {
        button.position = index;
      }
    });

    dashboardStore.set('quickButtons', buttons);
    return true;
  }

  // -------------------------------------------------------------------------
  // CHANGE NOTIFICATIONS
  // -------------------------------------------------------------------------

  onLayoutChange(callback: (layout: DashboardLayout) => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  private notifyChange(layout: DashboardLayout): void {
    this.changeListeners.forEach(cb => cb(layout));
  }

  // -------------------------------------------------------------------------
  // EXPORT / IMPORT
  // -------------------------------------------------------------------------

  async exportLayout(layoutId: string): Promise<string | null> {
    const layouts = dashboardStore.get('layouts');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return null;

    return JSON.stringify(layout, null, 2);
  }

  async importLayout(json: string): Promise<DashboardLayout | null> {
    try {
      const imported = JSON.parse(json) as DashboardLayout;
      
      // Generate new IDs
      imported.id = `layout_${Date.now()}`;
      imported.isDefault = false;
      imported.createdAt = Date.now();
      imported.updatedAt = Date.now();
      imported.widgets = imported.widgets.map(w => ({
        ...w,
        id: `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      }));

      const layouts = dashboardStore.get('layouts');
      layouts.push(imported);
      dashboardStore.set('layouts', layouts);

      return imported;
    } catch (error) {
      log.error('[DashboardWidgetSystem] Import failed:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // RESET
  // -------------------------------------------------------------------------

  async resetToDefault(): Promise<void> {
    dashboardStore.set('layouts', []);
    dashboardStore.set('quickButtons', []);
    await this.createDefaultLayout();
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const dashboardWidgetSystem = DashboardWidgetSystem.getInstance();
export default dashboardWidgetSystem;
