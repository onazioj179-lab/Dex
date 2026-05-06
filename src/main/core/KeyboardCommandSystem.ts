// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Keyboard Command System
// Everything reachable by keyboard
// Search, actions, navigation - faster than mouse use
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type KeyScope = 'global' | 'app' | 'editor' | 'search' | 'files' | 'media' | 'dialog';

export interface KeyBinding {
  id: string;
  keys: string;           // e.g., 'Ctrl+K', 'Cmd+Shift+P'
  command: string;        // Command to execute
  scope: KeyScope;
  description: string;
  enabled: boolean;
  customizable: boolean;
  args?: unknown[];
}

export interface KeyBindingGroup {
  name: string;
  bindings: KeyBinding[];
}

export interface KeyConfig {
  enableGlobalShortcuts: boolean;
  showKeyHints: boolean;
  chordTimeout: number;    // Time to wait for chord completion
}

// ===========================================================================
// DEFAULT KEY BINDINGS
// ===========================================================================

const DEFAULT_BINDINGS: KeyBinding[] = [
  // -- Global Search -------------------------------------------------------
  { id: 'search.open', keys: 'CommandOrControl+K', command: 'search:open', scope: 'app', description: 'Open search', enabled: true, customizable: true },
  { id: 'search.files', keys: 'CommandOrControl+P', command: 'search:files', scope: 'app', description: 'Search files', enabled: true, customizable: true },
  { id: 'search.commands', keys: 'CommandOrControl+Shift+P', command: 'search:commands', scope: 'app', description: 'Command palette', enabled: true, customizable: true },
  
  // -- Navigation ----------------------------------------------------------
  { id: 'nav.files', keys: 'CommandOrControl+1', command: 'nav:files', scope: 'app', description: 'Go to Files', enabled: true, customizable: true },
  { id: 'nav.notes', keys: 'CommandOrControl+2', command: 'nav:notes', scope: 'app', description: 'Go to Notes', enabled: true, customizable: true },
  { id: 'nav.actions', keys: 'CommandOrControl+3', command: 'nav:actions', scope: 'app', description: 'Go to Actions', enabled: true, customizable: true },
  { id: 'nav.media', keys: 'CommandOrControl+4', command: 'nav:media', scope: 'app', description: 'Go to Media', enabled: true, customizable: true },
  { id: 'nav.settings', keys: 'CommandOrControl+,', command: 'nav:settings', scope: 'app', description: 'Open Settings', enabled: true, customizable: true },
  { id: 'nav.back', keys: 'Alt+Left', command: 'nav:back', scope: 'app', description: 'Go back', enabled: true, customizable: true },
  { id: 'nav.forward', keys: 'Alt+Right', command: 'nav:forward', scope: 'app', description: 'Go forward', enabled: true, customizable: true },
  
  // -- Window --------------------------------------------------------------
  { id: 'window.close', keys: 'CommandOrControl+W', command: 'window:close', scope: 'app', description: 'Close window', enabled: true, customizable: true },
  { id: 'window.minimize', keys: 'CommandOrControl+M', command: 'window:minimize', scope: 'app', description: 'Minimize', enabled: true, customizable: true },
  { id: 'window.fullscreen', keys: 'F11', command: 'window:fullscreen', scope: 'app', description: 'Toggle fullscreen', enabled: true, customizable: true },
  { id: 'window.reload', keys: 'CommandOrControl+R', command: 'window:reload', scope: 'app', description: 'Reload', enabled: true, customizable: true },
  { id: 'window.devtools', keys: 'CommandOrControl+Shift+I', command: 'window:devtools', scope: 'app', description: 'Toggle DevTools', enabled: true, customizable: true },
  
  // -- File Operations -----------------------------------------------------
  { id: 'file.new', keys: 'CommandOrControl+N', command: 'file:new', scope: 'files', description: 'New file', enabled: true, customizable: true },
  { id: 'file.newFolder', keys: 'CommandOrControl+Shift+N', command: 'file:newFolder', scope: 'files', description: 'New folder', enabled: true, customizable: true },
  { id: 'file.open', keys: 'CommandOrControl+O', command: 'file:open', scope: 'files', description: 'Open file', enabled: true, customizable: true },
  { id: 'file.save', keys: 'CommandOrControl+S', command: 'file:save', scope: 'editor', description: 'Save file', enabled: true, customizable: true },
  { id: 'file.saveAs', keys: 'CommandOrControl+Shift+S', command: 'file:saveAs', scope: 'editor', description: 'Save as', enabled: true, customizable: true },
  { id: 'file.delete', keys: 'Delete', command: 'file:delete', scope: 'files', description: 'Delete', enabled: true, customizable: true },
  { id: 'file.rename', keys: 'F2', command: 'file:rename', scope: 'files', description: 'Rename', enabled: true, customizable: true },
  { id: 'file.copy', keys: 'CommandOrControl+C', command: 'file:copy', scope: 'files', description: 'Copy', enabled: true, customizable: true },
  { id: 'file.cut', keys: 'CommandOrControl+X', command: 'file:cut', scope: 'files', description: 'Cut', enabled: true, customizable: true },
  { id: 'file.paste', keys: 'CommandOrControl+V', command: 'file:paste', scope: 'files', description: 'Paste', enabled: true, customizable: true },
  { id: 'file.selectAll', keys: 'CommandOrControl+A', command: 'file:selectAll', scope: 'files', description: 'Select all', enabled: true, customizable: true },
  
  // -- Editor --------------------------------------------------------------
  { id: 'editor.undo', keys: 'CommandOrControl+Z', command: 'editor:undo', scope: 'editor', description: 'Undo', enabled: true, customizable: true },
  { id: 'editor.redo', keys: 'CommandOrControl+Shift+Z', command: 'editor:redo', scope: 'editor', description: 'Redo', enabled: true, customizable: true },
  { id: 'editor.find', keys: 'CommandOrControl+F', command: 'editor:find', scope: 'editor', description: 'Find', enabled: true, customizable: true },
  { id: 'editor.replace', keys: 'CommandOrControl+H', command: 'editor:replace', scope: 'editor', description: 'Replace', enabled: true, customizable: true },
  { id: 'editor.goToLine', keys: 'CommandOrControl+G', command: 'editor:goToLine', scope: 'editor', description: 'Go to line', enabled: true, customizable: true },
  
  // -- Actions -------------------------------------------------------------
  { id: 'action.run', keys: 'CommandOrControl+Enter', command: 'action:run', scope: 'app', description: 'Run action', enabled: true, customizable: true },
  { id: 'action.stop', keys: 'Escape', command: 'action:stop', scope: 'app', description: 'Stop/Cancel', enabled: true, customizable: true },
  
  // -- Media ---------------------------------------------------------------
  { id: 'media.playPause', keys: 'Space', command: 'media:playPause', scope: 'media', description: 'Play/Pause', enabled: true, customizable: true },
  { id: 'media.next', keys: 'CommandOrControl+Right', command: 'media:next', scope: 'media', description: 'Next track', enabled: true, customizable: true },
  { id: 'media.prev', keys: 'CommandOrControl+Left', command: 'media:prev', scope: 'media', description: 'Previous track', enabled: true, customizable: true },
  { id: 'media.volumeUp', keys: 'CommandOrControl+Up', command: 'media:volumeUp', scope: 'media', description: 'Volume up', enabled: true, customizable: true },
  { id: 'media.volumeDown', keys: 'CommandOrControl+Down', command: 'media:volumeDown', scope: 'media', description: 'Volume down', enabled: true, customizable: true },
  { id: 'media.mute', keys: 'CommandOrControl+Shift+M', command: 'media:mute', scope: 'media', description: 'Mute', enabled: true, customizable: true },
  
  // -- Dialog --------------------------------------------------------------
  { id: 'dialog.confirm', keys: 'Enter', command: 'dialog:confirm', scope: 'dialog', description: 'Confirm', enabled: true, customizable: false },
  { id: 'dialog.cancel', keys: 'Escape', command: 'dialog:cancel', scope: 'dialog', description: 'Cancel', enabled: true, customizable: false },
];

// ===========================================================================
// KEYBOARD COMMAND SYSTEM
// ===========================================================================

class KeyboardCommandSystemClass extends EventEmitter {
  private bindings: Map<string, KeyBinding> = new Map();
  private keysByAccelerator: Map<string, string> = new Map(); // accelerator -> binding id
  private currentScope: KeyScope = 'app';
  private config: KeyConfig;
  private globalShortcutsRegistered = false;

  constructor() {
    super();
    this.config = {
      enableGlobalShortcuts: true,
      showKeyHints: true,
      chordTimeout: 500
    };
    this.loadDefaultBindings();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get all bindings
    ipcMain.handle('keyboard:bindings', () => {
      return this.getAllBindings();
    });

    // Get bindings by scope
    ipcMain.handle('keyboard:bindingsByScope', (_event, scope: KeyScope) => {
      return this.getBindingsByScope(scope);
    });

    // Get binding for keys
    ipcMain.handle('keyboard:getBinding', (_event, keys: string) => {
      return this.getBindingForKeys(keys);
    });

    // Set custom binding
    ipcMain.handle('keyboard:setBinding', (_event, id: string, keys: string) => {
      return this.setBinding(id, keys);
    });

    // Reset binding to default
    ipcMain.handle('keyboard:resetBinding', (_event, id: string) => {
      return this.resetBinding(id);
    });

    // Reset all bindings
    ipcMain.handle('keyboard:resetAll', () => {
      return this.resetAllBindings();
    });

    // Set current scope
    ipcMain.handle('keyboard:setScope', (_event, scope: KeyScope) => {
      this.setScope(scope);
      return { success: true };
    });

    // Get current scope
    ipcMain.handle('keyboard:getScope', () => {
      return this.currentScope;
    });

    // Check for conflicts
    ipcMain.handle('keyboard:checkConflict', (_event, keys: string, scope: KeyScope) => {
      return this.checkConflict(keys, scope);
    });

    // Get grouped bindings (for UI)
    ipcMain.handle('keyboard:groupedBindings', () => {
      return this.getGroupedBindings();
    });

    // Handle keypress from renderer
    ipcMain.handle('keyboard:handleKey', async (_event, keys: string, scope?: KeyScope) => {
      return this.handleKeyPress(keys, scope);
    });
  }

  // -------------------------------------------------------------------------
  // BINDING MANAGEMENT
  // -------------------------------------------------------------------------

  private loadDefaultBindings(): void {
    for (const binding of DEFAULT_BINDINGS) {
      this.bindings.set(binding.id, { ...binding });
      this.keysByAccelerator.set(this.normalizeAccelerator(binding.keys), binding.id);
    }
    log.info(`[Keyboard] Loaded ${this.bindings.size} key bindings`);
  }

  getAllBindings(): KeyBinding[] {
    return Array.from(this.bindings.values());
  }

  getBindingsByScope(scope: KeyScope): KeyBinding[] {
    return Array.from(this.bindings.values()).filter(b => b.scope === scope || scope === 'app');
  }

  getBindingForKeys(keys: string): KeyBinding | null {
    const normalized = this.normalizeAccelerator(keys);
    const id = this.keysByAccelerator.get(normalized);
    return id ? this.bindings.get(id) || null : null;
  }

  getBindingById(id: string): KeyBinding | null {
    return this.bindings.get(id) || null;
  }

  setBinding(id: string, keys: string): { success: boolean; error?: string } {
    const binding = this.bindings.get(id);
    if (!binding) {
      return { success: false, error: 'Binding not found' };
    }

    if (!binding.customizable) {
      return { success: false, error: 'This binding cannot be customized' };
    }

    // Check for conflicts
    const conflict = this.checkConflict(keys, binding.scope);
    if (conflict && conflict.id !== id) {
      return { success: false, error: `Conflicts with: ${conflict.description}` };
    }

    // Remove old accelerator mapping
    const oldNormalized = this.normalizeAccelerator(binding.keys);
    this.keysByAccelerator.delete(oldNormalized);

    // Update binding
    binding.keys = keys;
    const newNormalized = this.normalizeAccelerator(keys);
    this.keysByAccelerator.set(newNormalized, id);

    // Re-register global shortcuts if needed
    this.updateGlobalShortcuts();

    this.emit('binding:changed', binding);
    return { success: true };
  }

  resetBinding(id: string): { success: boolean } {
    const defaultBinding = DEFAULT_BINDINGS.find(b => b.id === id);
    if (!defaultBinding) {
      return { success: false };
    }

    const binding = this.bindings.get(id);
    if (binding) {
      const oldNormalized = this.normalizeAccelerator(binding.keys);
      this.keysByAccelerator.delete(oldNormalized);
    }

    this.bindings.set(id, { ...defaultBinding });
    this.keysByAccelerator.set(this.normalizeAccelerator(defaultBinding.keys), id);
    this.updateGlobalShortcuts();

    return { success: true };
  }

  resetAllBindings(): { success: boolean } {
    this.bindings.clear();
    this.keysByAccelerator.clear();
    this.loadDefaultBindings();
    this.updateGlobalShortcuts();
    return { success: true };
  }

  checkConflict(keys: string, scope: KeyScope): KeyBinding | null {
    const normalized = this.normalizeAccelerator(keys);
    const id = this.keysByAccelerator.get(normalized);
    
    if (!id) return null;
    
    const binding = this.bindings.get(id);
    if (!binding) return null;

    // Check if scopes overlap
    if (binding.scope === 'app' || scope === 'app' || binding.scope === scope) {
      return binding;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // SCOPE MANAGEMENT
  // -------------------------------------------------------------------------

  setScope(scope: KeyScope): void {
    this.currentScope = scope;
    this.emit('scope:changed', scope);
  }

  getScope(): KeyScope {
    return this.currentScope;
  }

  // -------------------------------------------------------------------------
  // KEY HANDLING
  // -------------------------------------------------------------------------

  async handleKeyPress(keys: string, scope?: KeyScope): Promise<{ handled: boolean; command?: string }> {
    const effectiveScope = scope || this.currentScope;
    const normalized = this.normalizeAccelerator(keys);
    
    // Find matching binding
    const id = this.keysByAccelerator.get(normalized);
    if (!id) {
      return { handled: false };
    }

    const binding = this.bindings.get(id);
    if (!binding || !binding.enabled) {
      return { handled: false };
    }

    // Check scope
    if (binding.scope !== 'app' && binding.scope !== effectiveScope) {
      return { handled: false };
    }

    // Execute command
    this.executeCommand(binding);
    return { handled: true, command: binding.command };
  }

  private executeCommand(binding: KeyBinding): void {
    const windows = BrowserWindow.getAllWindows();
    
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('keyboard:command', {
          command: binding.command,
          args: binding.args,
          binding
        });
      }
    }

    this.emit('command:executed', binding);
  }

  // -------------------------------------------------------------------------
  // GLOBAL SHORTCUTS
  // -------------------------------------------------------------------------

  registerGlobalShortcuts(): void {
    if (this.globalShortcutsRegistered || !this.config.enableGlobalShortcuts) return;

    const globalBindings = Array.from(this.bindings.values())
      .filter(b => b.scope === 'global' && b.enabled);

    for (const binding of globalBindings) {
      try {
        const success = globalShortcut.register(binding.keys, () => {
          this.executeCommand(binding);
        });
        if (success) {
          log.debug(`[Keyboard] Registered global shortcut: ${binding.keys}`);
        }
      } catch (error) {
        log.warn(`[Keyboard] Failed to register ${binding.keys}:`, error);
      }
    }

    this.globalShortcutsRegistered = true;
  }

  unregisterGlobalShortcuts(): void {
    globalShortcut.unregisterAll();
    this.globalShortcutsRegistered = false;
  }

  private updateGlobalShortcuts(): void {
    this.unregisterGlobalShortcuts();
    this.registerGlobalShortcuts();
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private normalizeAccelerator(keys: string): string {
    return keys
      .toLowerCase()
      .replace(/\s+/g, '')
      .split('+')
      .sort()
      .join('+');
  }

  getGroupedBindings(): KeyBindingGroup[] {
    const groups: Map<string, KeyBinding[]> = new Map();
    
    for (const binding of this.bindings.values()) {
      const groupName = this.getGroupName(binding.scope);
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(binding);
    }

    return Array.from(groups.entries()).map(([name, bindings]) => ({
      name,
      bindings: bindings.sort((a, b) => a.description.localeCompare(b.description))
    }));
  }

  private getGroupName(scope: KeyScope): string {
    const names: Record<KeyScope, string> = {
      global: 'Global',
      app: 'Application',
      editor: 'Editor',
      search: 'Search',
      files: 'Files',
      media: 'Media',
      dialog: 'Dialogs'
    };
    return names[scope] || scope;
  }

  /**
   * Get display string for key combination
   */
  formatKeys(keys: string): string {
    return keys
      .replace('CommandOrControl', process.platform === 'darwin' ? '' : 'Ctrl')
      .replace('Command', '')
      .replace('Control', 'Ctrl')
      .replace('Alt', process.platform === 'darwin' ? '' : 'Alt')
      .replace('Shift', process.platform === 'darwin' ? '' : 'Shift')
      .replace('Enter', '')
      .replace('Escape', 'Esc')
      .replace('ArrowUp', '')
      .replace('ArrowDown', '')
      .replace('ArrowLeft', '')
      .replace('ArrowRight', '');
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    this.unregisterGlobalShortcuts();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const KeyboardCommandSystem = new KeyboardCommandSystemClass();
export default KeyboardCommandSystem;
