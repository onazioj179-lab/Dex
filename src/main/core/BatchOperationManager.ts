// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Batch Operation Manager
// Multi-item operations across all inner apps.
// Registers as single undoable action in global undo system.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';

export type BatchActionType =
  | 'delete'
  | 'export'
  | 'move'
  | 'markComplete'
  | 'changeDueDate'
  | 'addToTimeline'
  | 'removeFromProject'
  | 'exportClips'
  | 'removeFromLibrary';

export interface BatchItem {
  id: string;
  name: string;
  type: string;
  data: any;
}

export interface BatchOperation {
  id: string;
  app: string;
  action: BatchActionType;
  items: BatchItem[];
  params?: any;
  executed: boolean;
  undoData: any[];
}

class BatchOperationManager {
  private mainWindow: BrowserWindow | null = null;
  private operations: Map<string, BatchOperation> = new Map();

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[BatchOps] Batch operation manager initialized');
  }

  createBatch(app: string, action: BatchActionType, items: BatchItem[], params?: any): string {
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const op: BatchOperation = {
      id,
      app,
      action,
      items,
      params,
      executed: false,
      undoData: [],
    };
    this.operations.set(id, op);
    return id;
  }

  async executeBatch(batchId: string): Promise<{ success: boolean; results: any[] }> {
    const op = this.operations.get(batchId);
    if (!op) return { success: false, results: [] };

    if (op.executed) {
      log.warn('[BatchOps] Batch already executed:', batchId);
      return { success: false, results: [] };
    }

    const results: any[] = [];
    const undoData: any[] = [];

    for (const item of op.items) {
      try {
        const result = await this.executeItemAction(op.app, op.action, item, op.params);
        results.push({ item: item.id, success: true, result });
        undoData.push({ item, result });
      } catch (err: any) {
        results.push({ item: item.id, success: false, error: err.message || String(err) });
        undoData.push({ item, error: err.message });
      }
    }

    op.executed = true;
    op.undoData = undoData;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('batch:completed', {
        batchId,
        app: op.app,
        action: op.action,
        itemCount: op.items.length,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
      });
    }

    log.info(`[BatchOps] Batch ${batchId}: ${op.action} on ${op.items.length} items in ${op.app}`);
    return { success: true, results };
  }

  async undoBatch(batchId: string): Promise<boolean> {
    const op = this.operations.get(batchId);
    if (!op || !op.executed) return false;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('batch:undo', {
        batchId,
        app: op.app,
        action: op.action,
        undoData: op.undoData,
      });
    }

    op.executed = false;
    log.info(`[BatchOps] Undid batch ${batchId}`);
    return true;
  }

  private async executeItemAction(app: string, action: BatchActionType, item: BatchItem, params?: any): Promise<any> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.webContents.executeJavaScript(
        `(function() {
          try {
            var event = new CustomEvent('dex-batch-action', {
              detail: {
                app: ${JSON.stringify(app)},
                action: ${JSON.stringify(action)},
                itemId: ${JSON.stringify(item.id)},
                itemName: ${JSON.stringify(item.name)},
                itemType: ${JSON.stringify(item.type)},
                itemData: ${JSON.stringify(item.data)},
                params: ${JSON.stringify(params || null)}
              }
            });
            window.dispatchEvent(event);
            return { executed: true };
          } catch (err) {
            return { executed: false, error: err.message };
          }
        })()`
      );
    }
    return { executed: false, error: 'No main window' };
  }

  getAvailableActions(app: string): BatchActionType[] {
    const actionsMap: Record<string, BatchActionType[]> = {
      videoeditor: ['addToTimeline', 'removeFromProject', 'exportClips'],
      notes: ['delete', 'export', 'move'],
      tasks: ['markComplete', 'delete', 'changeDueDate'],
      gallery: ['delete', 'export'],
      files: ['delete', 'move', 'export'],
      kanban: ['delete', 'move'],
      media: ['removeFromLibrary'],
    };
    return actionsMap[app] || ['delete'];
  }

  getBatch(batchId: string): BatchOperation | null {
    return this.operations.get(batchId) || null;
  }

  private registerIPC(): void {
    ipcMain.handle('batch:create', (_event, app: string, action: BatchActionType, items: BatchItem[], params?: any) => {
      return this.createBatch(app, action, items, params);
    });

    ipcMain.handle('batch:execute', async (_event, batchId: string) => {
      return this.executeBatch(batchId);
    });

    ipcMain.handle('batch:undo', async (_event, batchId: string) => {
      return this.undoBatch(batchId);
    });

    ipcMain.handle('batch:getActions', (_event, app: string) => {
      return this.getAvailableActions(app);
    });

    ipcMain.handle('batch:get', (_event, batchId: string) => {
      const op = this.getBatch(batchId);
      if (!op) return null;
      return {
        id: op.id,
        app: op.app,
        action: op.action,
        itemCount: op.items.length,
        executed: op.executed,
      };
    });
  }

  shutdown(): void {
    this.operations.clear();
    log.info('[BatchOps] Shutdown');
  }
}

export const batchOperationManager = new BatchOperationManager();

export function initializeBatchOperations(mainWindow: BrowserWindow): void {
  batchOperationManager.initialize(mainWindow);
}

export function shutdownBatchOperations(): void {
  batchOperationManager.shutdown();
}
