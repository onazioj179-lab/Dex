// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Manager Controller
// Phase 19: IPC handlers for file management
// ===========================================================================

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { Logger } from '../utils/Logger';
import { 
  fileManager, 
  FileInfo, 
  FileOperation, 
  ScopeConfig, 
  SortCriteria,
  RenameRule,
  BatchRenamePreview 
} from '../core/FileManager';
import { getFileSearchIndexer } from '../core/FileSearchIndexer';
import { PathValidator } from '../security/PathValidator';

const log = new Logger();

// ===========================================================================
// PATH RESOLVER - Maps folder names to real system paths
// ===========================================================================

function resolveSystemPath(pathOrAlias: string): string {
  // Map special folder names to actual system paths
  const pathAliases: Record<string, () => string> = {
    'desktop': () => app.getPath('desktop'),
    'documents': () => app.getPath('documents'),
    'downloads': () => app.getPath('downloads'),
    'pictures': () => app.getPath('pictures'),
    'music': () => app.getPath('music'),
    'videos': () => app.getPath('videos'),
    'home': () => app.getPath('home'),
  };

  const alias = pathOrAlias.toLowerCase();
  if (pathAliases[alias]) {
    return pathAliases[alias]();
  }

  return pathOrAlias;
}

// ===========================================================================
// FILE MANAGER CONTROLLER
// ===========================================================================

class FileManagerControllerClass {
  private initialized = false;

  /**
   * Initialize IPC handlers
   */
  initialize(): void {
    if (this.initialized) return;

    // -------------------------------------------------------------------------
    // SCOPE MANAGEMENT
    // -------------------------------------------------------------------------

    ipcMain.handle('files:addScope', async (_, folderPath: string, options?: Partial<ScopeConfig>) => {
      return fileManager.addScope(folderPath, options);
    });

    ipcMain.handle('files:addScopeWithDialog', async () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Select folder to index for search',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const folderPath = result.filePaths[0];
      
      // Add to file manager
      const added = fileManager.addScope(folderPath, { recursive: true, readOnly: true });
      
      // Also add to file search indexer
      const fileSearchIndexer = getFileSearchIndexer();
      if (fileSearchIndexer) {
        await fileSearchIndexer.addScope(folderPath);
      }
      
      return added ? folderPath : null;
    });

    ipcMain.handle('files:removeScope', async (_, folderPath: string) => {
      return fileManager.removeScope(folderPath);
    });

    ipcMain.handle('files:getScopes', async () => {
      return fileManager.getScopes();
    });

    ipcMain.handle('files:isInScope', async (_, targetPath: string) => {
      return fileManager.isInScope(targetPath);
    });

    // -------------------------------------------------------------------------
    // FILE LISTING - With smart path resolution
    // -------------------------------------------------------------------------

    ipcMain.handle('files:list', async (_, dirPath: string, sort?: SortCriteria) => {
      try {
        // Resolve aliases like "documents" to actual system paths
        const resolvedPath = resolveSystemPath(dirPath);
        
        // Security: Only auto-scope user document directories, not arbitrary paths
        if (!fileManager.isInScope(resolvedPath)) {
          const homePath = require('os').homedir();
          const safePrefixes = [
            require('path').join(homePath, 'Documents'),
            require('path').join(homePath, 'Desktop'),
            require('path').join(homePath, 'Downloads'),
            require('path').join(homePath, 'Pictures'),
            require('path').join(homePath, 'Music'),
            require('path').join(homePath, 'Videos'),
          ];
          const normalizedPath = require('path').resolve(resolvedPath);
          if (safePrefixes.some(prefix => normalizedPath.startsWith(prefix))) {
            fileManager.addScope(resolvedPath, { recursive: true, readOnly: true });
          }
        }
        
        const files = fileManager.listFiles(resolvedPath, sort);
        
        if (files === null) {
          return { success: false, error: 'Access denied or path not found', path: resolvedPath, files: [] };
        }
        
        // Transform to match renderer expectations
        return {
          success: true,
          path: resolvedPath,
          files: files.map(f => ({
            name: f.name,
            path: f.path,
            isDirectory: f.type === 'directory',
            size: f.size,
            modified: f.modified,
            extension: f.extension,
          })),
        };
      } catch (error) {
        log.error('[FileManagerController] files:list error:', error);
        return { success: false, error: String(error), path: dirPath, files: [] };
      }
    });

    // -------------------------------------------------------------------------
    // FILE OPERATIONS
    // -------------------------------------------------------------------------

    ipcMain.handle('files:rename', async (_, oldPath: string, newName: string) => {
      PathValidator.validatePath(oldPath, { requireExists: true });
      // Sanitize newName to prevent path traversal via filename
      const safeName = require('path').basename(newName);
      return fileManager.renameFile(oldPath, safeName);
    });

    ipcMain.handle('files:move', async (event, sourcePath: string, targetDir: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['Move', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          title: 'Confirm Move',
          message: `Move file to new location?`,
          detail: `From: ${sourcePath}\nTo: ${targetDir}`,
        });
        if (response !== 0) return { success: false, cancelled: true };
      }
      return fileManager.moveFile(sourcePath, targetDir);
    });

    ipcMain.handle('files:copy', async (_, sourcePath: string, targetDir: string) => {
      PathValidator.validatePath(sourcePath, { requireExists: true });
      PathValidator.validatePath(targetDir);
      return fileManager.copyFile(sourcePath, targetDir);
    });

    ipcMain.handle('files:delete', async (event, filePath: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Delete', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Confirm Delete',
          message: `Permanently delete this file?`,
          detail: filePath,
        });
        if (response !== 0) return { success: false, cancelled: true };
      }
      return fileManager.deleteFile(filePath);
    });

    // -------------------------------------------------------------------------
    // SMART SEARCH - Fast recursive search with filters
    // -------------------------------------------------------------------------

    ipcMain.handle('files:search', async (_, options: {
      query: string;
      location?: string;
      extensions?: string[];
      dateAfter?: number;
      dateBefore?: number;
      sizeMin?: number;
      sizeMax?: number;
      limit?: number;
    }) => {
      try {
        const fileSearchIndexer = getFileSearchIndexer();
        if (fileSearchIndexer) {
          // Use indexed search for speed
          const results = fileSearchIndexer.search(options.query, { limit: options.limit || 50 });
          return { success: true, files: results };
        }
        
        // Fallback: Direct search if indexer not available
        return { success: false, error: 'Search indexer not initialized', files: [] };
      } catch (error) {
        log.error('[FileManagerController] files:search error:', error);
        return { success: false, error: String(error), files: [] };
      }
    });

    // -------------------------------------------------------------------------
    // RECENT FILES - Get recently modified files across all scopes
    // -------------------------------------------------------------------------

    ipcMain.removeHandler('files:recent');
    ipcMain.handle('files:recent', async (_, options?: { limit?: number; extensions?: string[] }) => {
      try {
        const limit = options?.limit || 20;
        const extensions = options?.extensions;
        const fileSearchIndexer = getFileSearchIndexer();
        
        if (fileSearchIndexer) {
          // Search with empty query returns all, sorted by date
          const allFiles = fileSearchIndexer.search('', { limit: 1000 });
          
          let filtered = allFiles;
          if (extensions && extensions.length > 0) {
            filtered = allFiles.filter(f => {
              const ext = f.path.substring(f.path.lastIndexOf('.')).toLowerCase();
              return extensions.includes(ext);
            });
          }
          
          // Already sorted by recency from index
          return { success: true, files: filtered.slice(0, limit) };
        }
        
        return { success: false, error: 'Search indexer not initialized', files: [] };
      } catch (error) {
        log.error('[FileManagerController] files:recent error:', error);
        return { success: false, error: String(error), files: [] };
      }
    });

    // -------------------------------------------------------------------------
    // BATCH OPERATIONS
    // -------------------------------------------------------------------------

    ipcMain.handle('files:previewBatchRename', async (_, files: string[], rules: RenameRule[]) => {
      return fileManager.previewBatchRename(files, rules);
    });

    ipcMain.handle('files:executeBatchRename', async (_, files: string[], rules: RenameRule[]) => {
      return fileManager.executeBatchRename(files, rules);
    });

    ipcMain.handle('files:organizeByType', async (_, dirPath: string) => {
      PathValidator.validatePath(dirPath, { requireExists: true });
      return fileManager.organizeByType(dirPath);
    });

    // -------------------------------------------------------------------------
    // UNDO & HISTORY
    // -------------------------------------------------------------------------

    ipcMain.handle('files:undo', async () => {
      return fileManager.undoLastOperation();
    });

    ipcMain.handle('files:getHistory', async () => {
      return fileManager.getHistory();
    });

    ipcMain.handle('files:clearHistory', async () => {
      fileManager.clearHistory();
      return true;
    });

    ipcMain.handle('files:mkdir', async (_, dirPath: string) => {
      if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('Invalid directory path');
      }
      PathValidator.validatePath(dirPath);
      await require('fs').promises.mkdir(dirPath, { recursive: true });
      return true;
    });

    this.initialized = true;
    log.info('[FileManagerController] Initialized');
  }
}

// Singleton export
export const fileManagerController = new FileManagerControllerClass();
