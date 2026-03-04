// ═══════════════════════════════════════════════════════════════════════════
// DEX - Error Guardrails & Undo System
// Phase 69: Error Reduction
// Clear previews, strong undo, safer defaults, explicit confirmations
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ActionSeverity = 'safe' | 'moderate' | 'destructive' | 'critical';

export interface UndoableAction {
  id: string;
  type: string;
  description: string;
  severity: ActionSeverity;
  timestamp: number;
  data: unknown;
  undoData: unknown;
  canUndo: boolean;
  undone: boolean;
  undoExpiry?: number; // When undo expires
}

export interface ActionPreview {
  type: string;
  description: string;
  severity: ActionSeverity;
  affectedItems: Array<{ type: string; name: string; path?: string }>;
  warnings: string[];
  requiresConfirmation: boolean;
  estimatedDuration?: number;
  canUndo: boolean;
}

export interface GuardrailConfig {
  confirmDestructiveActions: boolean;
  confirmMultiFileOperations: boolean;
  multiFileThreshold: number;
  undoHistorySize: number;
  undoExpiryTime: number;
  autoSaveInterval: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNDO STACK
// ═══════════════════════════════════════════════════════════════════════════

class UndoStack {
  private stack: UndoableAction[] = [];
  private redoStack: UndoableAction[] = [];
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  push(action: UndoableAction): void {
    this.stack.push(action);
    this.redoStack = []; // Clear redo stack on new action
    
    // Trim if too large
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
  }

  pop(): UndoableAction | undefined {
    const action = this.stack.pop();
    if (action) {
      this.redoStack.push(action);
    }
    return action;
  }

  peek(): UndoableAction | undefined {
    return this.stack[this.stack.length - 1];
  }

  popRedo(): UndoableAction | undefined {
    const action = this.redoStack.pop();
    if (action) {
      this.stack.push(action);
    }
    return action;
  }

  canUndo(): boolean {
    const action = this.peek();
    return !!action && action.canUndo && !action.undone;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getHistory(): UndoableAction[] {
    return [...this.stack];
  }

  clear(): void {
    this.stack = [];
    this.redoStack = [];
  }

  pruneExpired(): number {
    const now = Date.now();
    const before = this.stack.length;
    
    this.stack = this.stack.filter(action => {
      if (action.undoExpiry && action.undoExpiry < now) {
        return false;
      }
      return true;
    });
    
    return before - this.stack.length;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR GUARDRAILS CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ErrorGuardrailsClass extends EventEmitter {
  private undoStacks: Map<string, UndoStack> = new Map(); // Per-domain undo stacks
  private globalStack: UndoStack;
  private actionCounter = 0;
  private config: GuardrailConfig;

  // Default severity thresholds
  private readonly SEVERITY_THRESHOLDS = {
    multiFile: 5,
    largeDeletion: 1024 * 1024 * 10, // 10MB
    manyItems: 20
  };

  constructor() {
    super();
    
    this.config = {
      confirmDestructiveActions: true,
      confirmMultiFileOperations: true,
      multiFileThreshold: 5,
      undoHistorySize: 50,
      undoExpiryTime: 30 * 60 * 1000, // 30 minutes
      autoSaveInterval: 60000
    };
    
    this.globalStack = new UndoStack(this.config.undoHistorySize);
    this.setupIPC();
    this.startPruning();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Preview an action before execution
    ipcMain.handle('guardrails:preview', (_event, actionType: string, data: unknown) => {
      return this.previewAction(actionType, data);
    });

    // Check if confirmation is needed
    ipcMain.handle('guardrails:needsConfirmation', (_event, actionType: string, data: unknown) => {
      return this.needsConfirmation(actionType, data);
    });

    // Show confirmation dialog
    ipcMain.handle('guardrails:confirm', async (_event, preview: ActionPreview) => {
      return this.showConfirmation(preview);
    });

    // Register undoable action
    ipcMain.handle('guardrails:registerUndo', (_event, action: Omit<UndoableAction, 'id' | 'timestamp'>) => {
      return this.registerUndoable(action);
    });

    // Undo last action
    ipcMain.handle('guardrails:undo', async (_event, domain?: string) => {
      return this.undo(domain);
    });

    // Redo last undone action
    ipcMain.handle('guardrails:redo', async (_event, domain?: string) => {
      return this.redo(domain);
    });

    // Get undo status
    ipcMain.handle('guardrails:undoStatus', (_event, domain?: string) => {
      return this.getUndoStatus(domain);
    });

    // Get undo history
    ipcMain.handle('guardrails:history', (_event, domain?: string) => {
      return this.getHistory(domain);
    });

    // Update config
    ipcMain.handle('guardrails:setConfig', (_event, config: Partial<GuardrailConfig>) => {
      this.updateConfig(config);
      return { success: true };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION PREVIEW
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a preview of what an action will do
   */
  previewAction(actionType: string, data: unknown): ActionPreview {
    const preview: ActionPreview = {
      type: actionType,
      description: this.getActionDescription(actionType, data),
      severity: this.calculateSeverity(actionType, data),
      affectedItems: this.getAffectedItems(actionType, data),
      warnings: this.generateWarnings(actionType, data),
      requiresConfirmation: false,
      canUndo: this.canActionBeUndone(actionType)
    };

    // Determine if confirmation is needed
    preview.requiresConfirmation = this.needsConfirmation(actionType, data);

    return preview;
  }

  /**
   * Calculate action severity
   */
  private calculateSeverity(actionType: string, data: unknown): ActionSeverity {
    const d = data as Record<string, unknown>;

    // Critical actions
    if (actionType.includes('delete') && d.permanent) return 'critical';
    if (actionType === 'clear_all') return 'critical';
    if (actionType === 'factory_reset') return 'critical';

    // Destructive actions
    if (actionType.includes('delete')) return 'destructive';
    if (actionType.includes('remove')) return 'destructive';
    if (actionType === 'overwrite') return 'destructive';

    // Moderate actions
    if (actionType.includes('rename')) return 'moderate';
    if (actionType.includes('move')) return 'moderate';
    if (actionType.includes('update')) return 'moderate';

    // Multi-item operations
    if (Array.isArray(d.items) && d.items.length > this.SEVERITY_THRESHOLDS.multiFile) {
      return 'moderate';
    }

    return 'safe';
  }

  /**
   * Get description of action
   */
  private getActionDescription(actionType: string, data: unknown): string {
    const d = data as Record<string, unknown>;
    
    const descriptions: Record<string, string> = {
      file_delete: `Delete ${d.name || 'file'}`,
      file_rename: `Rename ${d.oldName || 'file'} to ${d.newName || 'new name'}`,
      file_move: `Move ${d.name || 'file'} to ${d.destination || 'destination'}`,
      note_delete: `Delete note "${d.title || 'Untitled'}"`,
      task_delete: `Delete task "${d.title || 'Untitled'}"`,
      action_delete: `Delete action "${d.name || 'Untitled'}"`,
      batch_delete: `Delete ${Array.isArray(d.items) ? d.items.length : 'multiple'} items`,
      clear_history: 'Clear all history',
      reset_settings: 'Reset settings to defaults'
    };

    return descriptions[actionType] || `Perform ${actionType}`;
  }

  /**
   * Get items affected by action
   */
  private getAffectedItems(actionType: string, data: unknown): Array<{ type: string; name: string; path?: string }> {
    const d = data as Record<string, unknown>;
    const items: Array<{ type: string; name: string; path?: string }> = [];

    if (Array.isArray(d.items)) {
      for (const item of d.items) {
        items.push({
          type: (item as Record<string, unknown>).type as string || 'item',
          name: (item as Record<string, unknown>).name as string || 'Untitled',
          path: (item as Record<string, unknown>).path as string
        });
      }
    } else if (d.name || d.path) {
      items.push({
        type: actionType.split('_')[0] || 'item',
        name: d.name as string || 'Untitled',
        path: d.path as string
      });
    }

    return items;
  }

  /**
   * Generate warnings for an action
   */
  private generateWarnings(actionType: string, data: unknown): string[] {
    const warnings: string[] = [];
    const d = data as Record<string, unknown>;

    // Multi-item warnings
    if (Array.isArray(d.items)) {
      if (d.items.length > this.SEVERITY_THRESHOLDS.manyItems) {
        warnings.push(`This will affect ${d.items.length} items`);
      }
    }

    // Destructive warnings
    if (actionType.includes('delete')) {
      if (d.permanent) {
        warnings.push('This action cannot be undone');
      } else {
        warnings.push('Items will be moved to trash');
      }
    }

    // Size warnings
    if (typeof d.size === 'number' && d.size > this.SEVERITY_THRESHOLDS.largeDeletion) {
      const sizeMB = Math.round(d.size / (1024 * 1024));
      warnings.push(`This will delete ${sizeMB}MB of data`);
    }

    // System file warning
    if (d.isSystem) {
      warnings.push('This affects system files');
    }

    return warnings;
  }

  /**
   * Check if action can be undone
   */
  private canActionBeUndone(actionType: string): boolean {
    const nonUndoable = [
      'permanent_delete',
      'clear_all',
      'factory_reset',
      'send_message',
      'publish'
    ];
    return !nonUndoable.includes(actionType);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRMATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if action needs confirmation
   */
  needsConfirmation(actionType: string, data: unknown): boolean {
    const severity = this.calculateSeverity(actionType, data);
    const d = data as Record<string, unknown>;

    // Always confirm critical actions
    if (severity === 'critical') return true;

    // Confirm destructive if enabled
    if (severity === 'destructive' && this.config.confirmDestructiveActions) {
      return true;
    }

    // Confirm multi-file operations if enabled
    if (this.config.confirmMultiFileOperations && Array.isArray(d.items)) {
      if (d.items.length >= this.config.multiFileThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Show confirmation dialog
   */
  async showConfirmation(preview: ActionPreview): Promise<boolean> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return false;

    const buttons = preview.severity === 'critical'
      ? ['Cancel', 'Confirm (Permanent)']
      : ['Cancel', 'Confirm'];

    const message = preview.warnings.length > 0
      ? `${preview.description}\n\n[!] ${preview.warnings.join('\n[!] ')}`
      : preview.description;

    const result = await dialog.showMessageBox(window, {
      type: preview.severity === 'critical' ? 'warning' : 'question',
      title: 'Confirm Action',
      message: preview.description,
      detail: preview.warnings.join('\n'),
      buttons,
      defaultId: 0,
      cancelId: 0
    });

    return result.response === 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UNDO/REDO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register an undoable action
   */
  registerUndoable(action: Omit<UndoableAction, 'id' | 'timestamp'>): string {
    const id = `undo-${Date.now()}-${++this.actionCounter}`;
    
    const undoable: UndoableAction = {
      ...action,
      id,
      timestamp: Date.now(),
      undone: false,
      undoExpiry: action.canUndo ? Date.now() + this.config.undoExpiryTime : undefined
    };

    // Add to global stack
    this.globalStack.push(undoable);

    // Add to domain stack if applicable
    const domain = action.type.split('_')[0];
    if (!this.undoStacks.has(domain)) {
      this.undoStacks.set(domain, new UndoStack(this.config.undoHistorySize));
    }
    this.undoStacks.get(domain)!.push(undoable);

    this.broadcastUndoStatus();
    this.emit('action:registered', undoable);

    log.debug(`[Guardrails] Registered undoable: ${id} (${action.type})`);
    return id;
  }

  /**
   * Undo the last action
   */
  async undo(domain?: string): Promise<{ success: boolean; action?: UndoableAction; error?: string }> {
    const stack = domain ? this.undoStacks.get(domain) : this.globalStack;
    
    if (!stack || !stack.canUndo()) {
      return { success: false, error: 'Nothing to undo' };
    }

    const action = stack.pop();
    if (!action) {
      return { success: false, error: 'Nothing to undo' };
    }

    // Check if expired
    if (action.undoExpiry && action.undoExpiry < Date.now()) {
      return { success: false, error: 'Undo expired' };
    }

    try {
      // Emit event for handler to perform actual undo
      this.emit('undo:execute', action);
      action.undone = true;
      
      this.broadcastUndoStatus();
      log.info(`[Guardrails] Undone: ${action.id} (${action.type})`);
      
      return { success: true, action };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Undo failed';
      log.error(`[Guardrails] Undo failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Redo the last undone action
   */
  async redo(domain?: string): Promise<{ success: boolean; action?: UndoableAction; error?: string }> {
    const stack = domain ? this.undoStacks.get(domain) : this.globalStack;
    
    if (!stack || !stack.canRedo()) {
      return { success: false, error: 'Nothing to redo' };
    }

    const action = stack.popRedo();
    if (!action) {
      return { success: false, error: 'Nothing to redo' };
    }

    try {
      // Emit event for handler to perform actual redo
      this.emit('redo:execute', action);
      action.undone = false;
      
      this.broadcastUndoStatus();
      log.info(`[Guardrails] Redone: ${action.id} (${action.type})`);
      
      return { success: true, action };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Redo failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get undo/redo status
   */
  getUndoStatus(domain?: string): { canUndo: boolean; canRedo: boolean; lastAction?: string } {
    const stack = domain ? this.undoStacks.get(domain) : this.globalStack;
    
    if (!stack) {
      return { canUndo: false, canRedo: false };
    }

    const lastAction = stack.peek();
    
    return {
      canUndo: stack.canUndo(),
      canRedo: stack.canRedo(),
      lastAction: lastAction?.description
    };
  }

  /**
   * Get undo history
   */
  getHistory(domain?: string): UndoableAction[] {
    const stack = domain ? this.undoStacks.get(domain) : this.globalStack;
    return stack?.getHistory() || [];
  }

  /**
   * Broadcast undo status to renderer
   */
  private broadcastUndoStatus(): void {
    const status = this.getUndoStatus();
    const windows = BrowserWindow.getAllWindows();
    
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('guardrails:undoStatus', status);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  updateConfig(config: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update stack sizes if changed
    if (config.undoHistorySize) {
      this.globalStack = new UndoStack(config.undoHistorySize);
    }

    log.debug('[Guardrails] Config updated:', this.config);
  }

  getConfig(): GuardrailConfig {
    return { ...this.config };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAINTENANCE
  // ─────────────────────────────────────────────────────────────────────────

  private pruneInterval: NodeJS.Timeout | null = null;

  private startPruning(): void {
    this.pruneInterval = setInterval(() => {
      const pruned = this.globalStack.pruneExpired();
      for (const stack of this.undoStacks.values()) {
        pruned + stack.pruneExpired();
      }
      if (pruned > 0) {
        log.debug(`[Guardrails] Pruned ${pruned} expired undo actions`);
        this.broadcastUndoStatus();
      }
    }, 60000); // Every minute
  }

  shutdown(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const ErrorGuardrails = new ErrorGuardrailsClass();
export default ErrorGuardrails;
