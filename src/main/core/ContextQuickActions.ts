// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Context Quick Actions
// Context-based quick actions (shown only when relevant)
// Drag-anywhere action execution
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ContextType = 
  | 'file' | 'folder' | 'image' | 'video' | 'audio' | 'document' | 'code'
  | 'text' | 'selection' | 'clipboard' | 'empty' | 'multiple' | 'search';

export type ActionCategory = 'file' | 'edit' | 'view' | 'organize' | 'share' | 'convert' | 'automate';

export interface QuickAction {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ActionCategory;
  contexts: ContextType[];
  extensions?: string[];         // File extensions this applies to
  minItems?: number;             // Minimum selection count
  maxItems?: number;             // Maximum selection count
  shortcut?: string;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  handler: string;               // IPC channel to invoke
}

export interface ActionContext {
  type: ContextType;
  items: ContextItem[];
  clipboard?: string;
  searchQuery?: string;
}

export interface ContextItem {
  path: string;
  name: string;
  type: ContextType;
  extension?: string;
  size?: number;
  isDirectory?: boolean;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  undoId?: string;
}

// ===========================================================================
// DEFAULT QUICK ACTIONS
// ===========================================================================

const DEFAULT_ACTIONS: QuickAction[] = [
  // -- File Actions ---------------------------------------------------------
  {
    id: 'open',
    name: 'Open',
    description: 'Open with default application',
    icon: 'external-link',
    category: 'file',
    contexts: ['file', 'image', 'video', 'audio', 'document', 'code'],
    shortcut: 'Enter',
    handler: 'quickaction:open'
  },
  {
    id: 'preview',
    name: 'Quick Look',
    description: 'Preview without opening',
    icon: 'eye',
    category: 'view',
    contexts: ['file', 'image', 'video', 'audio', 'document', 'code'],
    shortcut: 'Space',
    handler: 'quickaction:preview'
  },
  {
    id: 'rename',
    name: 'Rename',
    description: 'Rename file or folder',
    icon: 'edit-2',
    category: 'file',
    contexts: ['file', 'folder', 'image', 'video', 'audio', 'document', 'code'],
    maxItems: 1,
    shortcut: 'F2',
    handler: 'quickaction:rename'
  },
  {
    id: 'delete',
    name: 'Move to Trash',
    description: 'Move selected items to trash',
    icon: 'trash-2',
    category: 'file',
    contexts: ['file', 'folder', 'image', 'video', 'audio', 'document', 'code', 'multiple'],
    isDestructive: true,
    requiresConfirmation: true,
    shortcut: 'Delete',
    handler: 'quickaction:delete'
  },
  {
    id: 'copy',
    name: 'Copy',
    description: 'Copy to clipboard',
    icon: 'copy',
    category: 'edit',
    contexts: ['file', 'folder', 'text', 'selection', 'multiple'],
    shortcut: 'Ctrl+C',
    handler: 'quickaction:copy'
  },
  {
    id: 'cut',
    name: 'Cut',
    description: 'Cut to clipboard',
    icon: 'scissors',
    category: 'edit',
    contexts: ['file', 'folder', 'text', 'selection', 'multiple'],
    shortcut: 'Ctrl+X',
    handler: 'quickaction:cut'
  },
  {
    id: 'paste',
    name: 'Paste',
    description: 'Paste from clipboard',
    icon: 'clipboard',
    category: 'edit',
    contexts: ['folder', 'empty', 'clipboard'],
    shortcut: 'Ctrl+V',
    handler: 'quickaction:paste'
  },
  {
    id: 'duplicate',
    name: 'Duplicate',
    description: 'Create a copy',
    icon: 'copy',
    category: 'file',
    contexts: ['file', 'folder'],
    maxItems: 1,
    shortcut: 'Ctrl+D',
    handler: 'quickaction:duplicate'
  },
  {
    id: 'newFolder',
    name: 'New Folder',
    description: 'Create new folder here',
    icon: 'folder-plus',
    category: 'file',
    contexts: ['folder', 'empty'],
    shortcut: 'Ctrl+Shift+N',
    handler: 'quickaction:newFolder'
  },

  // -- Organization ---------------------------------------------------------
  {
    id: 'moveTo',
    name: 'Move to...',
    description: 'Move to another location',
    icon: 'move',
    category: 'organize',
    contexts: ['file', 'folder', 'multiple'],
    handler: 'quickaction:moveTo'
  },
  {
    id: 'copyTo',
    name: 'Copy to...',
    description: 'Copy to another location',
    icon: 'copy',
    category: 'organize',
    contexts: ['file', 'folder', 'multiple'],
    handler: 'quickaction:copyTo'
  },
  {
    id: 'compress',
    name: 'Compress',
    description: 'Create ZIP archive',
    icon: 'archive',
    category: 'organize',
    contexts: ['file', 'folder', 'multiple'],
    handler: 'quickaction:compress'
  },
  {
    id: 'extract',
    name: 'Extract',
    description: 'Extract archive contents',
    icon: 'package',
    category: 'organize',
    contexts: ['file'],
    extensions: ['zip', 'rar', '7z', 'tar', 'gz'],
    handler: 'quickaction:extract'
  },

  // -- Image Actions --------------------------------------------------------
  {
    id: 'resizeImage',
    name: 'Resize Image',
    description: 'Resize to specific dimensions',
    icon: 'maximize-2',
    category: 'convert',
    contexts: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
    handler: 'quickaction:resizeImage'
  },
  {
    id: 'convertImage',
    name: 'Convert Format',
    description: 'Convert to different format',
    icon: 'refresh-cw',
    category: 'convert',
    contexts: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'],
    handler: 'quickaction:convertImage'
  },
  {
    id: 'rotateImage',
    name: 'Rotate',
    description: 'Rotate image',
    icon: 'rotate-cw',
    category: 'edit',
    contexts: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'],
    handler: 'quickaction:rotateImage'
  },

  // -- Code Actions ---------------------------------------------------------
  {
    id: 'openInEditor',
    name: 'Edit Code',
    description: 'Open in code editor',
    icon: 'code',
    category: 'edit',
    contexts: ['code'],
    extensions: ['js', 'ts', 'py', 'json', 'html', 'css', 'md', 'txt', 'yaml', 'xml'],
    handler: 'quickaction:openInEditor'
  },
  {
    id: 'formatCode',
    name: 'Format',
    description: 'Auto-format code',
    icon: 'align-left',
    category: 'edit',
    contexts: ['code'],
    extensions: ['js', 'ts', 'json', 'html', 'css', 'py'],
    handler: 'quickaction:formatCode'
  },

  // -- Batch Actions --------------------------------------------------------
  {
    id: 'batchRename',
    name: 'Batch Rename',
    description: 'Rename multiple files',
    icon: 'edit-3',
    category: 'organize',
    contexts: ['multiple'],
    minItems: 2,
    handler: 'quickaction:batchRename'
  },
  {
    id: 'batchOrganize',
    name: 'Organize by Type',
    description: 'Sort into folders by type',
    icon: 'folder',
    category: 'organize',
    contexts: ['multiple'],
    minItems: 2,
    handler: 'quickaction:batchOrganize'
  },

  // -- Share Actions --------------------------------------------------------
  {
    id: 'copyPath',
    name: 'Copy Path',
    description: 'Copy file path to clipboard',
    icon: 'link',
    category: 'share',
    contexts: ['file', 'folder'],
    handler: 'quickaction:copyPath'
  },
  {
    id: 'revealInExplorer',
    name: 'Show in Explorer',
    description: 'Reveal in file explorer',
    icon: 'folder',
    category: 'file',
    contexts: ['file', 'folder'],
    handler: 'quickaction:revealInExplorer'
  },

  // -- Automation -----------------------------------------------------------
  {
    id: 'createAction',
    name: 'Create Action',
    description: 'Create automation from selection',
    icon: 'zap',
    category: 'automate',
    contexts: ['file', 'folder', 'multiple'],
    handler: 'quickaction:createAction'
  },
  {
    id: 'applyRule',
    name: 'Apply Rule',
    description: 'Apply folder rule to selection',
    icon: 'git-merge',
    category: 'automate',
    contexts: ['file', 'multiple'],
    handler: 'quickaction:applyRule'
  }
];

// ===========================================================================
// CONTEXT QUICK ACTIONS
// ===========================================================================

class ContextQuickActionsClass extends EventEmitter {
  private actions: Map<string, QuickAction> = new Map();
  private customActions: Map<string, QuickAction> = new Map();

  constructor() {
    super();
    this.loadDefaultActions();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private loadDefaultActions(): void {
    for (const action of DEFAULT_ACTIONS) {
      this.actions.set(action.id, action);
    }
    log.info(`[QuickActions] Loaded ${this.actions.size} default actions`);
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get actions for context
    ipcMain.handle('quickactions:forContext', (_event, context: ActionContext) => {
      return this.getActionsForContext(context);
    });

    // Get all actions
    ipcMain.handle('quickactions:all', () => {
      return this.getAllActions();
    });

    // Execute action
    ipcMain.handle('quickactions:execute', async (_event, actionId: string, context: ActionContext) => {
      return this.executeAction(actionId, context);
    });

    // Register custom action
    ipcMain.handle('quickactions:register', (_event, action: QuickAction) => {
      return this.registerAction(action);
    });

    // Unregister custom action
    ipcMain.handle('quickactions:unregister', (_event, actionId: string) => {
      return this.unregisterAction(actionId);
    });

    // Get action by shortcut
    ipcMain.handle('quickactions:byShortcut', (_event, shortcut: string, context: ActionContext) => {
      return this.getActionByShortcut(shortcut, context);
    });
  }

  // -------------------------------------------------------------------------
  // CONTEXT MATCHING
  // -------------------------------------------------------------------------

  getActionsForContext(context: ActionContext): QuickAction[] {
    const allActions = [...this.actions.values(), ...this.customActions.values()];
    
    return allActions.filter(action => {
      // Check context type match
      if (!action.contexts.includes(context.type)) {
        // Check for 'multiple' context
        if (context.items.length > 1 && !action.contexts.includes('multiple')) {
          return false;
        }
        if (context.items.length <= 1) {
          return false;
        }
      }

      // Check item count constraints
      if (action.minItems && context.items.length < action.minItems) {
        return false;
      }
      if (action.maxItems && context.items.length > action.maxItems) {
        return false;
      }

      // Check file extension constraints
      if (action.extensions && action.extensions.length > 0) {
        const hasMatchingExtension = context.items.some(item => {
          const ext = item.extension?.toLowerCase() || path.extname(item.path).slice(1).toLowerCase();
          return action.extensions!.includes(ext);
        });
        if (!hasMatchingExtension) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort by relevance
      const aScore = this.getActionRelevance(a, context);
      const bScore = this.getActionRelevance(b, context);
      return bScore - aScore;
    });
  }

  private getActionRelevance(action: QuickAction, context: ActionContext): number {
    let score = 0;

    // Exact context match
    if (action.contexts.includes(context.type)) {
      score += 10;
    }

    // Extension match
    if (action.extensions && context.items.length > 0) {
      const ext = context.items[0].extension?.toLowerCase();
      if (ext && action.extensions.includes(ext)) {
        score += 5;
      }
    }

    // Has shortcut (commonly used)
    if (action.shortcut) {
      score += 3;
    }

    // Primary actions (file category)
    if (action.category === 'file') {
      score += 2;
    }

    return score;
  }

  getAllActions(): QuickAction[] {
    return [...this.actions.values(), ...this.customActions.values()];
  }

  getActionByShortcut(shortcut: string, context: ActionContext): QuickAction | null {
    const normalizedShortcut = shortcut.toLowerCase();
    const contextActions = this.getActionsForContext(context);
    
    return contextActions.find(a => 
      a.shortcut?.toLowerCase() === normalizedShortcut
    ) || null;
  }

  // -------------------------------------------------------------------------
  // ACTION EXECUTION
  // -------------------------------------------------------------------------

  async executeAction(actionId: string, context: ActionContext): Promise<ActionResult> {
    const action = this.actions.get(actionId) || this.customActions.get(actionId);
    
    if (!action) {
      return { success: false, message: 'Action not found' };
    }

    // Notify renderer to handle the action
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('quickaction:execute', {
          action,
          context
        });
      }
    }

    this.emit('action:executed', { action, context });
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // CUSTOM ACTIONS
  // -------------------------------------------------------------------------

  registerAction(action: QuickAction): { success: boolean; error?: string } {
    if (this.actions.has(action.id)) {
      return { success: false, error: 'Cannot override built-in action' };
    }

    this.customActions.set(action.id, action);
    this.emit('action:registered', action);
    
    return { success: true };
  }

  unregisterAction(actionId: string): { success: boolean } {
    if (this.actions.has(actionId)) {
      return { success: false }; // Cannot remove built-in
    }

    const removed = this.customActions.delete(actionId);
    if (removed) {
      this.emit('action:unregistered', actionId);
    }
    
    return { success: removed };
  }

  // -------------------------------------------------------------------------
  // CONTEXT DETECTION
  // -------------------------------------------------------------------------

  detectContextType(items: ContextItem[]): ContextType {
    if (items.length === 0) return 'empty';
    if (items.length > 1) return 'multiple';

    const item = items[0];
    if (item.isDirectory) return 'folder';

    const ext = (item.extension || path.extname(item.path).slice(1)).toLowerCase();

    // Image
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff'].includes(ext)) {
      return 'image';
    }

    // Video
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) {
      return 'video';
    }

    // Audio
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(ext)) {
      return 'audio';
    }

    // Code
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'].includes(ext)) {
      return 'code';
    }

    // Document
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf'].includes(ext)) {
      return 'document';
    }

    // Text-like
    if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'html', 'css', 'csv', 'log', 'ini', 'cfg'].includes(ext)) {
      return 'code';
    }

    return 'file';
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const ContextQuickActions = new ContextQuickActionsClass();
export default ContextQuickActions;
