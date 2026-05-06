// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Background File Watcher
// Phase 38: Event-based, non-intrusive file monitoring
// Pauses under system load, user can disable at any time
// ===========================================================================

import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: fs.Stats;
  timestamp: Date;
}

export interface WatcherConfig {
  path: string;
  recursive: boolean;
  enabled: boolean;
  ignoreDotFiles: boolean;
  ignorePatterns: string[];
  debounceMs: number;
}

export interface WatcherStatus {
  path: string;
  isWatching: boolean;
  eventCount: number;
  lastEvent?: FileChangeEvent;
  startedAt?: Date;
  errors: number;
}

// -----------------------------------------------------------------------------
// File Watcher Service
// -----------------------------------------------------------------------------

export class FileWatcherService extends EventEmitter {
  private static instance: FileWatcherService;
  
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private configs: Map<string, WatcherConfig> = new Map();
  private status: Map<string, WatcherStatus> = new Map();
  private changeBuffer: Map<string, FileChangeEvent[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  private isPaused = false;
  private isEnabled = true;
  private systemLoadThreshold = 0.8;
  
  private constructor() {
    super();
  }
  
  static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }
  
  // -------------------------------------------------------------------------
  // Watch Management
  // -------------------------------------------------------------------------
  
  /**
   * Start watching a directory
   */
  watch(config: Partial<WatcherConfig> & { path: string }): boolean {
    const fullConfig: WatcherConfig = {
      recursive: true,
      enabled: true,
      ignoreDotFiles: true,
      ignorePatterns: [
        'node_modules',
        '.git',
        '__pycache__',
        '*.tmp',
        '*.temp',
        '~$*',
        '.DS_Store',
        'Thumbs.db',
      ],
      debounceMs: 300,
      ...config,
    };
    
    // Validate path exists
    if (!fs.existsSync(fullConfig.path)) {
      log.error(`[FileWatcher] Path does not exist: ${fullConfig.path}`);
      return false;
    }
    
    // Stop existing watcher if any
    this.unwatch(fullConfig.path);
    
    try {
      const watcher = fs.watch(
        fullConfig.path,
        { recursive: fullConfig.recursive },
        (eventType, filename) => {
          this.handleWatchEvent(fullConfig.path, eventType, filename);
        }
      );
      
      watcher.on('error', (error) => {
        this.handleWatchError(fullConfig.path, error);
      });
      
      this.watchers.set(fullConfig.path, watcher);
      this.configs.set(fullConfig.path, fullConfig);
      this.status.set(fullConfig.path, {
        path: fullConfig.path,
        isWatching: true,
        eventCount: 0,
        startedAt: new Date(),
        errors: 0,
      });
      
      log.info(`[FileWatcher] Started watching: ${fullConfig.path}`);
      this.emit('watchStarted', fullConfig.path);
      
      return true;
    } catch (error) {
      log.error(`[FileWatcher] Failed to watch ${fullConfig.path}:`, error);
      return false;
    }
  }
  
  /**
   * Stop watching a directory
   */
  unwatch(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(dirPath);
      this.configs.delete(dirPath);
      
      const status = this.status.get(dirPath);
      if (status) {
        status.isWatching = false;
      }
      
      // Clear pending debounce
      const timer = this.debounceTimers.get(dirPath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(dirPath);
      }
      
      log.info(`[FileWatcher] Stopped watching: ${dirPath}`);
      this.emit('watchStopped', dirPath);
    }
  }
  
  /**
   * Stop all watchers
   */
  unwatchAll(): void {
    for (const dirPath of this.watchers.keys()) {
      this.unwatch(dirPath);
    }
  }
  
  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------
  
  private handleWatchEvent(
    basePath: string, 
    eventType: string, 
    filename: string | null
  ): void {
    if (!filename || this.isPaused || !this.isEnabled) return;
    
    const config = this.configs.get(basePath);
    if (!config || !config.enabled) return;
    
    const fullPath = path.join(basePath, filename);
    
    // Check ignore patterns
    if (this.shouldIgnore(filename, config)) return;
    
    // Create event
    const event: FileChangeEvent = {
      type: this.determineEventType(fullPath, eventType),
      path: fullPath,
      timestamp: new Date(),
    };
    
    // Try to get stats
    try {
      if (fs.existsSync(fullPath)) {
        event.stats = fs.statSync(fullPath);
      }
    } catch {
      // File might have been deleted
    }
    
    // Buffer the event
    const buffer = this.changeBuffer.get(basePath) || [];
    buffer.push(event);
    this.changeBuffer.set(basePath, buffer);
    
    // Update status
    const status = this.status.get(basePath);
    if (status) {
      status.eventCount++;
      status.lastEvent = event;
    }
    
    // Debounce emission
    this.debounceEmit(basePath, config.debounceMs);
  }
  
  private determineEventType(
    filePath: string, 
    fsEventType: string
  ): FileChangeEvent['type'] {
    try {
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        return 'unlink';
      }
      
      const stats = fs.statSync(filePath);
      
      if (fsEventType === 'rename') {
        // File was created or deleted
        return stats.isDirectory() ? 'addDir' : 'add';
      }
      
      return 'change';
    } catch {
      return 'unlink';
    }
  }
  
  private debounceEmit(basePath: string, delay: number): void {
    const existing = this.debounceTimers.get(basePath);
    if (existing) {
      clearTimeout(existing);
    }
    
    const timer = setTimeout(() => {
      this.flushBuffer(basePath);
      this.debounceTimers.delete(basePath);
    }, delay);
    
    this.debounceTimers.set(basePath, timer);
  }
  
  private flushBuffer(basePath: string): void {
    const events = this.changeBuffer.get(basePath) || [];
    this.changeBuffer.set(basePath, []);
    
    if (events.length === 0) return;
    
    // Deduplicate events for the same path
    const deduplicated = new Map<string, FileChangeEvent>();
    for (const event of events) {
      deduplicated.set(event.path, event);
    }
    
    const finalEvents = Array.from(deduplicated.values());
    
    // Emit batched event
    this.emit('changes', {
      basePath,
      events: finalEvents,
      count: finalEvents.length,
    });
    
    // Also emit individual events
    for (const event of finalEvents) {
      this.emit('change', event);
    }
  }
  
  private handleWatchError(basePath: string, error: Error): void {
    log.error(`[FileWatcher] Error on ${basePath}:`, error);
    
    const status = this.status.get(basePath);
    if (status) {
      status.errors++;
    }
    
    this.emit('error', { path: basePath, error });
    
    // Try to recover by restarting the watcher
    const config = this.configs.get(basePath);
    if (config && status && status.errors < 5) {
      setTimeout(() => {
        log.info(`[FileWatcher] Attempting to recover watcher for ${basePath}`);
        this.watch(config);
      }, 5000);
    }
  }
  
  private shouldIgnore(filename: string, config: WatcherConfig): boolean {
    // Ignore dot files
    if (config.ignoreDotFiles && filename.startsWith('.')) {
      return true;
    }
    
    // Check ignore patterns
    for (const pattern of config.ignorePatterns) {
      if (this.matchPattern(filename, pattern)) {
        return true;
      }
    }
    
    return false;
  }
  
  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob matching
    if (pattern.startsWith('*')) {
      return filename.endsWith(pattern.slice(1));
    }
    if (pattern.endsWith('*')) {
      return filename.startsWith(pattern.slice(0, -1));
    }
    return filename === pattern || filename.includes(pattern);
  }
  
  // -------------------------------------------------------------------------
  // Pause/Resume
  // -------------------------------------------------------------------------
  
  /**
   * Pause all watchers (e.g., during high system load)
   */
  pause(): void {
    this.isPaused = true;
    log.info('[FileWatcher] Paused all watchers');
    this.emit('paused');
  }
  
  /**
   * Resume all watchers
   */
  resume(): void {
    this.isPaused = false;
    log.info('[FileWatcher] Resumed all watchers');
    this.emit('resumed');
  }
  
  /**
   * Enable/disable the entire service
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    log.info(`[FileWatcher] Service ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('enabledChanged', enabled);
  }
  
  /**
   * Check if service should pause based on system load
   */
  async checkSystemLoad(): Promise<void> {
    try {
      const os = require('os');
      const loadAvg = os.loadavg()[0]; // 1 minute average
      const cpuCount = os.cpus().length;
      const normalizedLoad = loadAvg / cpuCount;
      
      if (normalizedLoad > this.systemLoadThreshold && !this.isPaused) {
        this.pause();
        log.info(`[FileWatcher] Paused due to high system load: ${normalizedLoad.toFixed(2)}`);
      } else if (normalizedLoad <= this.systemLoadThreshold * 0.8 && this.isPaused) {
        this.resume();
        log.info(`[FileWatcher] Resumed after system load normalized: ${normalizedLoad.toFixed(2)}`);
      }
    } catch (error) {
      // Ignore errors in load checking
    }
  }
  
  // -------------------------------------------------------------------------
  // Status & Info
  // -------------------------------------------------------------------------
  
  getStatus(dirPath: string): WatcherStatus | undefined {
    return this.status.get(dirPath);
  }
  
  getAllStatuses(): WatcherStatus[] {
    return Array.from(this.status.values());
  }
  
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }
  
  isWatching(dirPath: string): boolean {
    return this.watchers.has(dirPath);
  }
  
  getConfig(dirPath: string): WatcherConfig | undefined {
    return this.configs.get(dirPath);
  }
  
  getServiceStatus() {
    return {
      isEnabled: this.isEnabled,
      isPaused: this.isPaused,
      watcherCount: this.watchers.size,
      totalEvents: Array.from(this.status.values())
        .reduce((sum, s) => sum + s.eventCount, 0),
      totalErrors: Array.from(this.status.values())
        .reduce((sum, s) => sum + s.errors, 0),
    };
  }
}

// Export singleton
export const fileWatcher = FileWatcherService.getInstance();
export default fileWatcher;
