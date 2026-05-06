// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Intelligence Controller
// Phase 38: Bridge between main process and renderer for file operations
// Secure, permission-based, user-approved actions only
// ===========================================================================

import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileIntelligence, FileMetadata, OrganizationSuggestion } from '../core/FileIntelligence';
import { mediaAnalyzer } from '../core/MediaAnalyzer';
import { fileWatcher, FileChangeEvent } from '../core/FileWatcher';

// -----------------------------------------------------------------------------
// IPC Channel Names
// -----------------------------------------------------------------------------

const CHANNELS = {
  // Authorization
  AUTHORIZE_PATH: 'file-intel:authorize-path',
  REVOKE_PATH: 'file-intel:revoke-path',
  GET_AUTHORIZED_PATHS: 'file-intel:get-authorized-paths',
  
  // Scanning & Analysis
  SCAN_DIRECTORY: 'file-intel:scan-directory',
  ANALYZE_FILE: 'file-intel:analyze-file',
  ANALYZE_MEDIA: 'file-intel:analyze-media',
  
  // Queries
  GET_ALL_FILES: 'file-intel:get-all-files',
  GET_FILE: 'file-intel:get-file',
  SEARCH_FILES: 'file-intel:search-files',
  GET_RECENT_FILES: 'file-intel:get-recent-files',
  GET_FILES_BY_TYPE: 'file-intel:get-files-by-type',
  GET_STATISTICS: 'file-intel:get-statistics',
  
  // Grouping
  GROUP_BY_TYPE: 'file-intel:group-by-type',
  GROUP_BY_DATE: 'file-intel:group-by-date',
  FIND_DUPLICATES: 'file-intel:find-duplicates',
  
  // Organization
  GET_SUGGESTIONS: 'file-intel:get-suggestions',
  APPROVE_SUGGESTION: 'file-intel:approve-suggestion',
  APPLY_SUGGESTION: 'file-intel:apply-suggestion',
  REJECT_SUGGESTION: 'file-intel:reject-suggestion',
  
  // File Operations
  OPEN_FILE: 'file-intel:open-file',
  REVEAL_IN_EXPLORER: 'file-intel:reveal-in-explorer',
  GET_THUMBNAIL: 'file-intel:get-thumbnail',
  
  // Watching
  START_WATCHING: 'file-intel:start-watching',
  STOP_WATCHING: 'file-intel:stop-watching',
  GET_WATCHER_STATUS: 'file-intel:get-watcher-status',
  
  // Events (main -> renderer)
  FILE_CHANGE: 'file-intel:file-change',
  SCAN_PROGRESS: 'file-intel:scan-progress',
  ANALYSIS_COMPLETE: 'file-intel:analysis-complete',
};

// -----------------------------------------------------------------------------
// Controller Class
// -----------------------------------------------------------------------------

export class FileIntelligenceController {
  private static instance: FileIntelligenceController;
  private mainWindow: BrowserWindow | null = null;
  
  private constructor() {
    this.setupIpcHandlers();
    this.setupEventForwarding();
  }
  
  static getInstance(): FileIntelligenceController {
    if (!FileIntelligenceController.instance) {
      FileIntelligenceController.instance = new FileIntelligenceController();
    }
    return FileIntelligenceController.instance;
  }
  
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------
  
  private setupIpcHandlers(): void {
    // Authorization
    ipcMain.handle(CHANNELS.AUTHORIZE_PATH, async (_, dirPath?: string) => {
      if (!dirPath) {
        // Show directory picker
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Choose a folder to give Dex access to',
        });
        
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, reason: 'cancelled' };
        }
        
        dirPath = result.filePaths[0];
      }
      
      const authorized = fileIntelligence.authorizePath(dirPath);
      return { 
        success: authorized, 
        path: dirPath,
        reason: authorized ? null : 'forbidden_system_path',
      };
    });
    
    ipcMain.handle(CHANNELS.REVOKE_PATH, async (_, dirPath: string) => {
      fileIntelligence.revokePath(dirPath);
      fileWatcher.unwatch(dirPath);
      return { success: true };
    });
    
    ipcMain.handle(CHANNELS.GET_AUTHORIZED_PATHS, async () => {
      return fileIntelligence.getAuthorizedPaths();
    });
    
    // Scanning & Analysis
    ipcMain.handle(CHANNELS.SCAN_DIRECTORY, async (_, dirPath: string, options?: { recursive?: boolean; maxFiles?: number }) => {
      try {
        const files = await fileIntelligence.scanDirectory(dirPath, options);
        return { success: true, files, count: files.length };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });
    
    ipcMain.handle(CHANNELS.ANALYZE_FILE, async (_, filePath: string, deep?: boolean) => {
      const metadata = await fileIntelligence.analyzeFile(filePath, deep);
      return metadata;
    });
    
    ipcMain.handle(CHANNELS.ANALYZE_MEDIA, async (_, filePath: string, type: 'image' | 'video' | 'audio' | 'document') => {
      switch (type) {
        case 'image':
          return await mediaAnalyzer.analyzeImage(filePath);
        case 'video':
          return await mediaAnalyzer.analyzeVideo(filePath);
        case 'audio':
          return await mediaAnalyzer.analyzeAudio(filePath);
        case 'document':
          return await mediaAnalyzer.analyzeDocument(filePath);
        default:
          return null;
      }
    });
    
    // Queries
    ipcMain.handle(CHANNELS.GET_ALL_FILES, async () => {
      return fileIntelligence.getAllFiles();
    });
    
    ipcMain.handle(CHANNELS.GET_FILE, async (_, id: string) => {
      return fileIntelligence.getFile(id);
    });
    
    ipcMain.handle(CHANNELS.SEARCH_FILES, async (_, query: string) => {
      return fileIntelligence.searchFiles(query);
    });
    
    ipcMain.handle(CHANNELS.GET_RECENT_FILES, async (_, limit?: number) => {
      return fileIntelligence.getRecentFiles(limit);
    });
    
    ipcMain.handle(CHANNELS.GET_FILES_BY_TYPE, async (_, type: string) => {
      return fileIntelligence.getFilesByType(type as any);
    });
    
    ipcMain.handle(CHANNELS.GET_STATISTICS, async () => {
      return fileIntelligence.getStatistics();
    });
    
    // Grouping
    ipcMain.handle(CHANNELS.GROUP_BY_TYPE, async () => {
      return fileIntelligence.groupByType();
    });
    
    ipcMain.handle(CHANNELS.GROUP_BY_DATE, async (_, granularity?: 'day' | 'week' | 'month') => {
      return fileIntelligence.groupByDate(granularity);
    });
    
    ipcMain.handle(CHANNELS.FIND_DUPLICATES, async () => {
      const duplicates = fileIntelligence.findDuplicates();
      // Convert Map to array for IPC
      const result: Array<{ hash: string; files: FileMetadata[] }> = [];
      for (const [hash, files] of duplicates) {
        result.push({ hash, files });
      }
      return result;
    });
    
    // Organization
    ipcMain.handle(CHANNELS.GET_SUGGESTIONS, async () => {
      return fileIntelligence.generateSuggestions();
    });
    
    ipcMain.handle(CHANNELS.APPROVE_SUGGESTION, async (_, suggestionId: string) => {
      // Mark as approved - actual application requires explicit action
      return { success: true, id: suggestionId };
    });
    
    ipcMain.handle(CHANNELS.APPLY_SUGGESTION, async (_, suggestion: OrganizationSuggestion) => {
      // Show confirmation dialog
      const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Apply', 'Cancel'],
        defaultId: 1,
        title: 'Apply Organization Suggestion',
        message: suggestion.description,
        detail: `This will affect ${suggestion.files.length} file(s). This action can be undone.`,
      });
      
      if (result.response !== 0) {
        return { success: false, reason: 'cancelled' };
      }
      
      // Apply the suggestion based on type
      // For now, just return success - actual implementation would perform the operations
      return { success: true, applied: true };
    });
    
    ipcMain.handle(CHANNELS.REJECT_SUGGESTION, async (_, suggestionId: string) => {
      return { success: true, id: suggestionId };
    });
    
    // File Operations
    ipcMain.handle(CHANNELS.OPEN_FILE, async (_, filePath: string) => {
      try {
        await shell.openPath(filePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });
    
    ipcMain.handle(CHANNELS.REVEAL_IN_EXPLORER, async (_, filePath: string) => {
      shell.showItemInFolder(filePath);
      return { success: true };
    });
    
    ipcMain.handle(CHANNELS.GET_THUMBNAIL, async (_, filePath: string) => {
      return await mediaAnalyzer.getThumbnail(filePath);
    });
    
    // Watching
    ipcMain.handle(CHANNELS.START_WATCHING, async (_, dirPath: string, options?: { recursive?: boolean }) => {
      const success = fileWatcher.watch({ path: dirPath, ...options });
      return { success };
    });
    
    ipcMain.handle(CHANNELS.STOP_WATCHING, async (_, dirPath: string) => {
      fileWatcher.unwatch(dirPath);
      return { success: true };
    });
    
    ipcMain.handle(CHANNELS.GET_WATCHER_STATUS, async () => {
      return {
        service: fileWatcher.getServiceStatus(),
        watchers: fileWatcher.getAllStatuses(),
      };
    });
  }
  
  // -------------------------------------------------------------------------
  // Event Forwarding (Main -> Renderer)
  // -------------------------------------------------------------------------
  
  private setupEventForwarding(): void {
    // Forward file watcher events to renderer
    fileWatcher.on('change', (event: FileChangeEvent) => {
      this.sendToRenderer(CHANNELS.FILE_CHANGE, event);
    });
    
    fileWatcher.on('changes', (batch: { basePath: string; events: FileChangeEvent[]; count: number }) => {
      this.sendToRenderer(CHANNELS.FILE_CHANGE, batch);
    });
    
    // Forward scan progress
    fileIntelligence.on('scanStarted', (path: string) => {
      this.sendToRenderer(CHANNELS.SCAN_PROGRESS, { status: 'started', path });
    });
    
    fileIntelligence.on('scanCompleted', (data: { path: string; count: number }) => {
      this.sendToRenderer(CHANNELS.SCAN_PROGRESS, { status: 'completed', ...data });
    });
    
    // Forward analysis completion
    fileIntelligence.on('fileAnalyzed', (metadata: FileMetadata) => {
      this.sendToRenderer(CHANNELS.ANALYSIS_COMPLETE, metadata);
    });
    
    mediaAnalyzer.on('imageAnalyzed', (analysis: any) => {
      this.sendToRenderer(CHANNELS.ANALYSIS_COMPLETE, { type: 'image', ...analysis });
    });
  }
  
  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// -----------------------------------------------------------------------------
// Initialize Controller
// -----------------------------------------------------------------------------

export const fileIntelligenceController = FileIntelligenceController.getInstance();

export function initFileIntelligenceController(mainWindow: BrowserWindow): void {
  fileIntelligenceController.setMainWindow(mainWindow);
}

export default fileIntelligenceController;
