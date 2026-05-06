// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX - Hotkey/Shortcut Controller
// Global keyboard shortcuts with conflict detection
// =============================================================================

import { ipcMain, app, globalShortcut, BrowserWindow } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HotkeyBinding {
  id: string;
  name: string;
  description?: string;
  shortcut: string;           // e.g., "CommandOrControl+Shift+A"
  action: HotkeyAction;
  enabled: boolean;
  global: boolean;            // Global (works when app not focused) or app-only
  mode?: string;              // Only active in specific mode
  category: HotkeyCategory;
  isDefault: boolean;         // Built-in vs user-defined
  createdAt: number;
  updatedAt: number;
}

export interface HotkeyAction {
  type: 'workflow' | 'operation' | 'mode' | 'page' | 'command' | 'window' | 'custom';
  target: string;
  params?: Record<string, any>;
}

export type HotkeyCategory = 
  | 'navigation'     // Page navigation
  | 'window'         // Window controls
  | 'workflow'       // Workflow triggers
  | 'operation'      // Quick operations
  | 'mode'           // Mode switching
  | 'system'         // System commands
  | 'custom';        // User-defined

export interface ShortcutConflict {
  shortcut: string;
  existingBinding: HotkeyBinding;
  newBinding: Partial<HotkeyBinding>;
}

export interface HotkeyStats {
  totalBindings: number;
  globalBindings: number;
  enabledBindings: number;
  usageStats: Record<string, number>;
}

// -----------------------------------------------------------------------------
// Default Hotkeys
// -----------------------------------------------------------------------------

const DEFAULT_HOTKEYS: Omit<HotkeyBinding, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Navigation
  {
    name: 'Go to Dashboard',
    shortcut: 'CommandOrControl+1',
    action: { type: 'page', target: 'dashboard' },
    enabled: true,
    global: false,
    category: 'navigation',
    isDefault: true,
  },
  {
    name: 'Go to Operations',
    shortcut: 'CommandOrControl+2',
    action: { type: 'page', target: 'operations' },
    enabled: true,
    global: false,
    category: 'navigation',
    isDefault: true,
  },
  {
    name: 'Go to Workflows',
    shortcut: 'CommandOrControl+3',
    action: { type: 'page', target: 'workflows' },
    enabled: true,
    global: false,
    category: 'navigation',
    isDefault: true,
  },
  {
    name: 'Go to Notes',
    shortcut: 'CommandOrControl+4',
    action: { type: 'page', target: 'notes' },
    enabled: true,
    global: false,
    category: 'navigation',
    isDefault: true,
  },
  {
    name: 'Go to Settings',
    shortcut: 'CommandOrControl+,',
    action: { type: 'page', target: 'settings' },
    enabled: true,
    global: false,
    category: 'navigation',
    isDefault: true,
  },
  
  // Window
  {
    name: 'Toggle Dex Window',
    description: 'Show/hide the main window',
    shortcut: 'CommandOrControl+Alt+D',
    action: { type: 'window', target: 'toggle' },
    enabled: true,
    global: true,
    category: 'window',
    isDefault: true,
  },
  {
    name: 'Command Palette',
    shortcut: 'CommandOrControl+Shift+P',
    action: { type: 'command', target: 'command-palette' },
    enabled: true,
    global: false,
    category: 'window',
    isDefault: true,
  },
  {
    name: 'Quick Search',
    shortcut: 'CommandOrControl+K',
    action: { type: 'command', target: 'quick-search' },
    enabled: true,
    global: false,
    category: 'window',
    isDefault: true,
  },
  
  // System
  {
    name: 'Emergency Stop',
    description: 'Stop all running workflows and operations',
    shortcut: 'CommandOrControl+Alt+Q',
    action: { type: 'command', target: 'emergency-stop' },
    enabled: true,
    global: true,
    category: 'system',
    isDefault: true,
  },
  {
    name: 'New Note',
    shortcut: 'CommandOrControl+N',
    action: { type: 'command', target: 'new-note' },
    enabled: true,
    global: false,
    category: 'system',
    isDefault: true,
  },
  {
    name: 'New Workflow',
    shortcut: 'CommandOrControl+Shift+N',
    action: { type: 'command', target: 'new-workflow' },
    enabled: true,
    global: false,
    category: 'system',
    isDefault: true,
  },
];

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

const hotkeyStore = new Store<{
  bindings: Record<string, HotkeyBinding>;
  usageStats: Record<string, number>;
  settings: {
    enabled: boolean;
    showNotifications: boolean;
    allowConflicts: boolean;
  };
}>({
  name: 'dex-hotkeys',
  defaults: {
    bindings: {},
    usageStats: {},
    settings: {
      enabled: true,
      showNotifications: true,
      allowConflicts: false,
    },
  },
});

// -----------------------------------------------------------------------------
// Hotkey Manager
// -----------------------------------------------------------------------------

class HotkeyManager {
  private mainWindow: BrowserWindow | null = null;
  private registeredShortcuts: Set<string> = new Set();
  private shortcutToBinding: Map<string, string> = new Map();

  // Initialize hotkey system
  async initialize(mainWindow: BrowserWindow) {
    log.info('[Hotkeys] Initializing hotkey system...');
    this.mainWindow = mainWindow;
    
    // Setup IPC handlers
    this.setupIpcHandlers();
    
    // Initialize default hotkeys if first run
    this.initializeDefaultHotkeys();
    
    // Register all enabled hotkeys
    this.registerAllHotkeys();
    
    // Setup app-level shortcuts
    this.setupAppShortcuts();
    
    log.info('[Hotkeys] Hotkey system initialized');
  }

  // Shutdown
  shutdown() {
    log.info('[Hotkeys] Shutting down...');
    this.unregisterAllHotkeys();
  }

  // Setup IPC handlers
  private setupIpcHandlers() {
    ipcMain.handle('hotkeys:list', () => this.listBindings());
    ipcMain.handle('hotkeys:get', (_, id: string) => this.getBinding(id));
    ipcMain.handle('hotkeys:create', (_, binding: Omit<HotkeyBinding, 'id' | 'createdAt' | 'updatedAt'>) => {
      return this.createBinding(binding);
    });
    ipcMain.handle('hotkeys:update', (_, id: string, updates: Partial<HotkeyBinding>) => {
      return this.updateBinding(id, updates);
    });
    ipcMain.handle('hotkeys:delete', (_, id: string) => this.deleteBinding(id));
    ipcMain.handle('hotkeys:toggle', (_, id: string, enabled: boolean) => {
      return this.toggleBinding(id, enabled);
    });
    ipcMain.handle('hotkeys:check-conflict', (_, shortcut: string, excludeId?: string) => {
      return this.checkConflict(shortcut, excludeId);
    });
    ipcMain.handle('hotkeys:get-stats', () => this.getStats());
    ipcMain.handle('hotkeys:reset-defaults', () => this.resetToDefaults());
    ipcMain.handle('hotkeys:get-settings', () => hotkeyStore.get('settings'));
    ipcMain.handle('hotkeys:update-settings', (_, settings) => {
      hotkeyStore.set('settings', { ...hotkeyStore.get('settings'), ...settings });
      return hotkeyStore.get('settings');
    });
    ipcMain.handle('hotkeys:record', () => this.startRecording());
  }

  // Initialize default hotkeys
  private initializeDefaultHotkeys() {
    const bindings = hotkeyStore.get('bindings');
    
    // Migrate old conflicting hotkeys
    this.migrateConflictingHotkeys(bindings);
    
    // Check if defaults already exist
    const hasDefaults = Object.values(bindings).some(b => b.isDefault);
    if (hasDefaults) return;
    
    // Add defaults
    const now = Date.now();
    DEFAULT_HOTKEYS.forEach((hotkey, index) => {
      const id = `hotkey-default-${index}`;
      bindings[id] = {
        ...hotkey,
        id,
        createdAt: now,
        updatedAt: now,
      };
    });
    
    hotkeyStore.set('bindings', bindings);
    log.info('[Hotkeys] Initialized default hotkeys');
  }
  
  // Migrate old conflicting shortcuts to new ones
  private migrateConflictingHotkeys(bindings: Record<string, HotkeyBinding>) {
    const migrations: Record<string, string> = {
      'CommandOrControl+Shift+D': 'CommandOrControl+Alt+D',
      'CommandOrControl+Shift+Escape': 'CommandOrControl+Alt+Q',
    };
    
    let migrated = false;
    for (const [id, binding] of Object.entries(bindings)) {
      if (migrations[binding.shortcut]) {
        log.info(`[Hotkeys] Migrating ${binding.shortcut} to ${migrations[binding.shortcut]}`);
        bindings[id] = {
          ...binding,
          shortcut: migrations[binding.shortcut],
          updatedAt: Date.now(),
        };
        migrated = true;
      }
    }
    
    if (migrated) {
      hotkeyStore.set('bindings', bindings);
      log.info('[Hotkeys] Migrated conflicting hotkeys');
    }
  }

  // List all bindings
  listBindings(): HotkeyBinding[] {
    return Object.values(hotkeyStore.get('bindings'));
  }

  // Get single binding
  getBinding(id: string): HotkeyBinding | undefined {
    return hotkeyStore.get(`bindings.${id}`);
  }

  // Create binding
  createBinding(binding: Omit<HotkeyBinding, 'id' | 'createdAt' | 'updatedAt'>): HotkeyBinding {
    // Check for conflicts
    const conflict = this.checkConflict(binding.shortcut);
    if (conflict && !hotkeyStore.get('settings').allowConflicts) {
      throw new Error(`Shortcut conflict: ${binding.shortcut} is already used by "${conflict.name}"`);
    }
    
    const id = `hotkey-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const newBinding: HotkeyBinding = {
      ...binding,
      id,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    
    hotkeyStore.set(`bindings.${id}`, newBinding);
    
    if (newBinding.enabled) {
      this.registerHotkey(newBinding);
    }
    
    log.info(`[Hotkeys] Created binding: ${newBinding.name} (${newBinding.shortcut})`);
    return newBinding;
  }

  // Update binding
  updateBinding(id: string, updates: Partial<HotkeyBinding>): HotkeyBinding | null {
    const binding = this.getBinding(id);
    if (!binding) return null;
    
    // If shortcut changed, check for conflicts
    if (updates.shortcut && updates.shortcut !== binding.shortcut) {
      const conflict = this.checkConflict(updates.shortcut, id);
      if (conflict && !hotkeyStore.get('settings').allowConflicts) {
        throw new Error(`Shortcut conflict: ${updates.shortcut} is already used by "${conflict.name}"`);
      }
    }
    
    // Unregister old shortcut
    this.unregisterHotkey(binding);
    
    const updatedBinding: HotkeyBinding = {
      ...binding,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now(),
    };
    
    hotkeyStore.set(`bindings.${id}`, updatedBinding);
    
    // Register new shortcut if enabled
    if (updatedBinding.enabled) {
      this.registerHotkey(updatedBinding);
    }
    
    log.info(`[Hotkeys] Updated binding: ${updatedBinding.name}`);
    return updatedBinding;
  }

  // Delete binding
  deleteBinding(id: string): boolean {
    const binding = this.getBinding(id);
    if (!binding) return false;
    
    // Unregister shortcut
    this.unregisterHotkey(binding);
    
    // Remove from store
    const bindings = hotkeyStore.get('bindings');
    delete bindings[id];
    hotkeyStore.set('bindings', bindings);
    
    log.info(`[Hotkeys] Deleted binding: ${binding.name}`);
    return true;
  }

  // Toggle binding
  toggleBinding(id: string, enabled: boolean): HotkeyBinding | null {
    return this.updateBinding(id, { enabled });
  }

  // Check for conflicts
  checkConflict(shortcut: string, excludeId?: string): HotkeyBinding | null {
    const bindings = this.listBindings();
    
    for (const binding of bindings) {
      if (excludeId && binding.id === excludeId) continue;
      if (binding.shortcut.toLowerCase() === shortcut.toLowerCase()) {
        return binding;
      }
    }
    
    return null;
  }

  // Get stats
  getStats(): HotkeyStats {
    const bindings = this.listBindings();
    
    return {
      totalBindings: bindings.length,
      globalBindings: bindings.filter(b => b.global).length,
      enabledBindings: bindings.filter(b => b.enabled).length,
      usageStats: hotkeyStore.get('usageStats'),
    };
  }

  // Reset to defaults
  resetToDefaults() {
    // Unregister all
    this.unregisterAllHotkeys();
    
    // Clear bindings
    hotkeyStore.set('bindings', {});
    
    // Re-initialize defaults
    this.initializeDefaultHotkeys();
    
    // Register defaults
    this.registerAllHotkeys();
    
    log.info('[Hotkeys] Reset to defaults');
    return this.listBindings();
  }

  // Register all hotkeys
  private registerAllHotkeys() {
    const bindings = this.listBindings().filter(b => b.enabled);
    
    for (const binding of bindings) {
      this.registerHotkey(binding);
    }
    
    log.info(`[Hotkeys] Registered ${this.registeredShortcuts.size} hotkeys`);
  }

  // Unregister all hotkeys
  private unregisterAllHotkeys() {
    for (const shortcut of this.registeredShortcuts) {
      try {
        globalShortcut.unregister(shortcut);
      } catch (e) {
        // Ignore
      }
    }
    
    this.registeredShortcuts.clear();
    this.shortcutToBinding.clear();
  }

  // Register single hotkey
  private registerHotkey(binding: HotkeyBinding) {
    if (!binding.enabled) return;
    
    // Only register global shortcuts with globalShortcut API
    if (binding.global) {
      try {
        const success = globalShortcut.register(binding.shortcut, () => {
          this.executeHotkey(binding);
        });
        
        if (success) {
          this.registeredShortcuts.add(binding.shortcut);
          this.shortcutToBinding.set(binding.shortcut, binding.id);
          log.info(`[Hotkeys] Registered global: ${binding.shortcut}`);
        } else {
          log.warn(`[Hotkeys] Failed to register: ${binding.shortcut}`);
        }
      } catch (error) {
        log.error(`[Hotkeys] Error registering ${binding.shortcut}:`, error);
      }
    }
    
    // App-only shortcuts are handled via IPC from renderer
  }

  // Unregister single hotkey
  private unregisterHotkey(binding: HotkeyBinding) {
    if (binding.global && this.registeredShortcuts.has(binding.shortcut)) {
      try {
        globalShortcut.unregister(binding.shortcut);
        this.registeredShortcuts.delete(binding.shortcut);
        this.shortcutToBinding.delete(binding.shortcut);
      } catch (e) {
        // Ignore
      }
    }
  }

  // Execute hotkey action
  private async executeHotkey(binding: HotkeyBinding) {
    log.info(`[Hotkeys] Executing: ${binding.name}`);
    
    // Update usage stats
    const stats = hotkeyStore.get('usageStats');
    stats[binding.id] = (stats[binding.id] || 0) + 1;
    hotkeyStore.set('usageStats', stats);
    
    const { action } = binding;
    
    switch (action.type) {
      case 'window':
        this.handleWindowAction(action.target);
        break;
      
      case 'page':
        this.mainWindow?.webContents.send('hotkey:navigate', action.target);
        break;
      
      case 'command':
        this.mainWindow?.webContents.send('hotkey:command', action.target, action.params);
        break;
      
      case 'workflow':
        this.mainWindow?.webContents.send('hotkey:workflow', action.target);
        break;
      
      case 'operation':
        this.mainWindow?.webContents.send('hotkey:operation', action.target);
        break;
      
      case 'mode':
        this.mainWindow?.webContents.send('hotkey:mode', action.target);
        break;
      
      default:
        this.mainWindow?.webContents.send('hotkey:custom', action);
    }
    
    // Show notification if enabled
    if (hotkeyStore.get('settings').showNotifications) {
      this.mainWindow?.webContents.send('hotkey:executed', {
        name: binding.name,
        shortcut: binding.shortcut,
      });
    }
  }

  // Handle window actions
  private handleWindowAction(target: string) {
    if (!this.mainWindow) return;
    
    switch (target) {
      case 'toggle':
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
        break;
      
      case 'show':
        this.mainWindow.show();
        this.mainWindow.focus();
        break;
      
      case 'hide':
        this.mainWindow.hide();
        break;
      
      case 'minimize':
        this.mainWindow.minimize();
        break;
      
      case 'maximize':
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
        break;
    }
  }

  // Setup app-level shortcuts (always active when app is focused)
  private setupAppShortcuts() {
    // Handle app-level shortcuts from renderer
    ipcMain.on('hotkey:app-shortcut', (_, shortcut: string) => {
      const bindingId = this.shortcutToBinding.get(shortcut);
      if (bindingId) {
        const binding = this.getBinding(bindingId);
        if (binding && binding.enabled && !binding.global) {
          this.executeHotkey(binding);
        }
      }
    });
  }

  // Start recording a shortcut
  private startRecording(): Promise<string> {
    return new Promise((resolve) => {
      // Send to renderer to capture keys
      this.mainWindow?.webContents.send('hotkey:start-recording');
      
      // Listen for recorded shortcut
      const handler = (_: any, shortcut: string) => {
        ipcMain.removeListener('hotkey:recorded', handler);
        resolve(shortcut);
      };
      
      ipcMain.once('hotkey:recorded', handler);
    });
  }
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const hotkeyManager = new HotkeyManager();

export async function initializeHotkeys(mainWindow: BrowserWindow) {
  await hotkeyManager.initialize(mainWindow);
}

export function shutdownHotkeys() {
  hotkeyManager.shutdown();
}
