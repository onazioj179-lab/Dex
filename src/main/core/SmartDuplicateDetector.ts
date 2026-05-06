// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Smart Duplicate Detector
// Smart duplicate detection (suggest-only, never auto-delete)
// Safe, preview-based, user-controlled
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type DuplicateType = 'exact' | 'similar_name' | 'similar_size' | 'similar_content';

export interface DuplicateFile {
  path: string;
  name: string;
  size: number;
  modified: number;
  hash?: string;
  isOriginal: boolean;  // First found in group
}

export interface DuplicateGroup {
  id: string;
  type: DuplicateType;
  files: DuplicateFile[];
  totalSize: number;
  wastedSize: number;   // Size that could be reclaimed
  confidence: number;   // 0-1, how confident we are these are duplicates
}

export interface ScanResult {
  id: string;
  folderPath: string;
  startedAt: number;
  completedAt?: number;
  status: 'scanning' | 'completed' | 'cancelled' | 'error';
  progress: number;     // 0-100
  filesScanned: number;
  duplicateGroups: DuplicateGroup[];
  totalDuplicates: number;
  potentialSavings: number;
  error?: string;
}

export interface ScanConfig {
  includeSubfolders: boolean;
  minFileSize: number;          // Skip files smaller than this
  maxFileSize: number;          // Skip files larger than this
  includeHidden: boolean;
  excludePatterns: string[];
  scanModes: DuplicateType[];   // Which types to detect
  compareContent: boolean;      // Full content comparison (slower)
  quickHashOnly: boolean;       // Only hash first/last chunks
}

// ===========================================================================
// SMART DUPLICATE DETECTOR
// ===========================================================================

class SmartDuplicateDetectorClass extends EventEmitter {
  private activeScan: ScanResult | null = null;
  private cancellationRequested = false;
  private scanIdCounter = 0;
  private groupIdCounter = 0;

  constructor() {
    super();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Start scan
    ipcMain.handle('duplicates:scan', async (_event, folderPath: string, config?: Partial<ScanConfig>) => {
      return this.startScan(folderPath, config);
    });

    // Get scan progress
    ipcMain.handle('duplicates:progress', () => {
      return this.getProgress();
    });

    // Cancel scan
    ipcMain.handle('duplicates:cancel', () => {
      return this.cancelScan();
    });

    // Get results
    ipcMain.handle('duplicates:results', () => {
      return this.getResults();
    });

    // Preview action (what would happen if we keep one file)
    ipcMain.handle('duplicates:preview', (_event, groupId: string, keepPath: string) => {
      return this.previewAction(groupId, keepPath);
    });

    // Remove duplicates (move to trash, keep original)
    ipcMain.handle('duplicates:remove', async (_event, groupId: string, keepPath: string) => {
      return this.removeDuplicates(groupId, keepPath);
    });

    // Quick check if two files are duplicates
    ipcMain.handle('duplicates:compare', async (_event, path1: string, path2: string) => {
      return this.compareFiles(path1, path2);
    });

    // Find duplicates of a specific file
    ipcMain.handle('duplicates:findOf', async (_event, filePath: string, searchFolder: string) => {
      return this.findDuplicatesOf(filePath, searchFolder);
    });
  }

  // -------------------------------------------------------------------------
  // SCANNING
  // -------------------------------------------------------------------------

  async startScan(folderPath: string, userConfig?: Partial<ScanConfig>): Promise<ScanResult> {
    if (this.activeScan && this.activeScan.status === 'scanning') {
      throw new Error('Scan already in progress');
    }

    const config: ScanConfig = {
      includeSubfolders: true,
      minFileSize: 1024,            // 1KB
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
      includeHidden: false,
      excludePatterns: ['node_modules', '.git', '*.tmp', 'Thumbs.db', '.DS_Store'],
      scanModes: ['exact', 'similar_name'],
      compareContent: true,
      quickHashOnly: false,
      ...userConfig
    };

    this.cancellationRequested = false;
    
    this.activeScan = {
      id: `scan-${++this.scanIdCounter}-${Date.now()}`,
      folderPath,
      startedAt: Date.now(),
      status: 'scanning',
      progress: 0,
      filesScanned: 0,
      duplicateGroups: [],
      totalDuplicates: 0,
      potentialSavings: 0
    };

    this.emit('scan:started', this.activeScan);

    try {
      // Phase 1: Collect files
      const files = await this.collectFiles(folderPath, config);
      
      if (this.cancellationRequested) {
        this.activeScan.status = 'cancelled';
        return this.activeScan;
      }

      // Phase 2: Group by size (quick pre-filter)
      const sizeGroups = this.groupBySize(files);
      
      // Phase 3: Find duplicates
      const duplicateGroups: DuplicateGroup[] = [];

      for (const mode of config.scanModes) {
        if (this.cancellationRequested) break;
        
        const groups = await this.detectDuplicates(sizeGroups, mode, config);
        duplicateGroups.push(...groups);
      }

      // Deduplicate groups (same files might appear in multiple modes)
      this.activeScan.duplicateGroups = this.deduplicateGroups(duplicateGroups);
      this.activeScan.totalDuplicates = this.activeScan.duplicateGroups.reduce(
        (sum, g) => sum + g.files.length - 1, 0
      );
      this.activeScan.potentialSavings = this.activeScan.duplicateGroups.reduce(
        (sum, g) => sum + g.wastedSize, 0
      );

      this.activeScan.status = this.cancellationRequested ? 'cancelled' : 'completed';
      this.activeScan.completedAt = Date.now();
      
    } catch (error) {
      this.activeScan.status = 'error';
      this.activeScan.error = error instanceof Error ? error.message : 'Unknown error';
      log.error('[Duplicates] Scan failed:', error);
    }

    this.emit('scan:completed', this.activeScan);
    return this.activeScan;
  }

  private async collectFiles(
    folderPath: string, 
    config: ScanConfig,
    collectedFiles: Array<{ path: string; size: number; modified: number }> = []
  ): Promise<Array<{ path: string; size: number; modified: number }>> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (this.cancellationRequested) break;
        
        const fullPath = path.join(folderPath, entry.name);
        
        // Skip hidden files
        if (!config.includeHidden && entry.name.startsWith('.')) continue;
        
        // Skip excluded patterns
        if (config.excludePatterns.some(p => this.matchesPattern(entry.name, p))) {
          continue;
        }

        if (entry.isDirectory()) {
          if (config.includeSubfolders) {
            await this.collectFiles(fullPath, config, collectedFiles);
          }
        } else {
          try {
            const stats = await fs.stat(fullPath);
            
            if (stats.size >= config.minFileSize && stats.size <= config.maxFileSize) {
              collectedFiles.push({
                path: fullPath,
                size: stats.size,
                modified: stats.mtimeMs
              });
              
              this.activeScan!.filesScanned++;
              this.activeScan!.progress = Math.min(50, this.activeScan!.filesScanned / 10);
              
              if (this.activeScan!.filesScanned % 100 === 0) {
                this.emit('scan:progress', this.activeScan);
              }
            }
          } catch { /* Skip inaccessible files */ }
        }
      }
    } catch (error) {
      log.warn(`[Duplicates] Failed to read folder ${folderPath}:`, error);
    }

    return collectedFiles;
  }

  private groupBySize(
    files: Array<{ path: string; size: number; modified: number }>
  ): Map<number, Array<{ path: string; size: number; modified: number }>> {
    const groups = new Map<number, Array<{ path: string; size: number; modified: number }>>();
    
    for (const file of files) {
      if (!groups.has(file.size)) {
        groups.set(file.size, []);
      }
      groups.get(file.size)!.push(file);
    }

    // Remove single-file groups
    for (const [size, group] of groups.entries()) {
      if (group.length < 2) {
        groups.delete(size);
      }
    }

    return groups;
  }

  private async detectDuplicates(
    sizeGroups: Map<number, Array<{ path: string; size: number; modified: number }>>,
    mode: DuplicateType,
    config: ScanConfig
  ): Promise<DuplicateGroup[]> {
    const groups: DuplicateGroup[] = [];
    let processed = 0;
    const total = sizeGroups.size;

    for (const [size, files] of sizeGroups.entries()) {
      if (this.cancellationRequested) break;

      processed++;
      this.activeScan!.progress = 50 + Math.floor((processed / total) * 50);

      if (mode === 'exact' && config.compareContent) {
        // Hash-based exact duplicate detection
        const hashGroups = await this.groupByHash(files, config.quickHashOnly);
        
        for (const [hash, hashFiles] of hashGroups.entries()) {
          if (hashFiles.length >= 2) {
            groups.push(this.createGroup('exact', hashFiles, hash));
          }
        }
      } else if (mode === 'similar_name') {
        // Name-based similarity
        const nameGroups = this.groupBySimilarName(files);
        groups.push(...nameGroups);
      } else if (mode === 'similar_size') {
        // Already grouped by size, just need minimum count
        if (files.length >= 2) {
          groups.push(this.createGroup('similar_size', files));
        }
      }
    }

    return groups;
  }

  private async groupByHash(
    files: Array<{ path: string; size: number; modified: number }>,
    quickOnly: boolean
  ): Promise<Map<string, Array<{ path: string; size: number; modified: number }>>> {
    const hashGroups = new Map<string, Array<{ path: string; size: number; modified: number }>>();

    for (const file of files) {
      if (this.cancellationRequested) break;

      try {
        const hash = quickOnly 
          ? await this.quickHash(file.path)
          : await this.fullHash(file.path);
        
        if (!hashGroups.has(hash)) {
          hashGroups.set(hash, []);
        }
        hashGroups.get(hash)!.push(file);
      } catch { /* Skip unhashable files */ }
    }

    return hashGroups;
  }

  private groupBySimilarName(
    files: Array<{ path: string; size: number; modified: number }>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const used = new Set<string>();

    for (const file of files) {
      if (used.has(file.path)) continue;

      const baseName = this.getBaseName(file.path);
      const similar = files.filter(f => {
        if (f.path === file.path || used.has(f.path)) return false;
        return this.isSimilarName(baseName, this.getBaseName(f.path));
      });

      if (similar.length > 0) {
        const groupFiles = [file, ...similar];
        groupFiles.forEach(f => used.add(f.path));
        groups.push(this.createGroup('similar_name', groupFiles));
      }
    }

    return groups;
  }

  private createGroup(
    type: DuplicateType,
    files: Array<{ path: string; size: number; modified: number }>,
    hash?: string
  ): DuplicateGroup {
    // Sort by modified date, oldest first (likely the "original")
    const sorted = [...files].sort((a, b) => a.modified - b.modified);
    
    const duplicateFiles: DuplicateFile[] = sorted.map((f, i) => ({
      path: f.path,
      name: path.basename(f.path),
      size: f.size,
      modified: f.modified,
      hash,
      isOriginal: i === 0
    }));

    const totalSize = duplicateFiles.reduce((sum, f) => sum + f.size, 0);
    const wastedSize = totalSize - duplicateFiles[0].size;

    return {
      id: `group-${++this.groupIdCounter}`,
      type,
      files: duplicateFiles,
      totalSize,
      wastedSize,
      confidence: type === 'exact' ? 1.0 : type === 'similar_name' ? 0.8 : 0.5
    };
  }

  private deduplicateGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
    // Merge groups that share files, preferring higher confidence
    const fileToGroup = new Map<string, DuplicateGroup>();
    const result: DuplicateGroup[] = [];

    groups.sort((a, b) => b.confidence - a.confidence);

    for (const group of groups) {
      const existingGroup = group.files.find(f => fileToGroup.has(f.path));
      
      if (!existingGroup) {
        result.push(group);
        group.files.forEach(f => fileToGroup.set(f.path, group));
      }
      // Skip groups whose files are already in higher-confidence groups
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // HASHING
  // -------------------------------------------------------------------------

  private async fullHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fsSync.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async quickHash(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const chunkSize = 64 * 1024; // 64KB
    
    const fd = await fs.open(filePath, 'r');
    try {
      const stats = await fd.stat();
      
      // Read first chunk
      const firstChunk = Buffer.alloc(Math.min(chunkSize, stats.size));
      await fd.read(firstChunk, 0, firstChunk.length, 0);
      hash.update(firstChunk);
      
      // Read last chunk if file is big enough
      if (stats.size > chunkSize * 2) {
        const lastChunk = Buffer.alloc(chunkSize);
        await fd.read(lastChunk, 0, chunkSize, stats.size - chunkSize);
        hash.update(lastChunk);
      }
      
      // Include size for uniqueness
      hash.update(stats.size.toString());
      
      return hash.digest('hex');
    } finally {
      await fd.close();
    }
  }

  // -------------------------------------------------------------------------
  // NAME SIMILARITY
  // -------------------------------------------------------------------------

  private getBaseName(filePath: string): string {
    const name = path.basename(filePath, path.extname(filePath));
    // Remove common suffixes like (1), _copy, -backup
    return name.replace(/[-_ ]*(copy|backup|\(\d+\)|\d+)$/i, '').toLowerCase();
  }

  private isSimilarName(name1: string, name2: string): boolean {
    if (name1 === name2) return true;
    
    // Levenshtein distance threshold
    const maxDistance = Math.floor(Math.max(name1.length, name2.length) * 0.2);
    return this.levenshteinDistance(name1, name2) <= maxDistance;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
      return regex.test(name);
    }
    return name.toLowerCase() === pattern.toLowerCase();
  }

  // -------------------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------------------

  previewAction(groupId: string, keepPath: string): {
    keep: DuplicateFile;
    remove: DuplicateFile[];
    spaceSaved: number;
  } | null {
    if (!this.activeScan) return null;
    
    const group = this.activeScan.duplicateGroups.find(g => g.id === groupId);
    if (!group) return null;

    const keep = group.files.find(f => f.path === keepPath);
    if (!keep) return null;

    const remove = group.files.filter(f => f.path !== keepPath);
    const spaceSaved = remove.reduce((sum, f) => sum + f.size, 0);

    return { keep, remove, spaceSaved };
  }

  async removeDuplicates(groupId: string, keepPath: string): Promise<{
    success: boolean;
    removed: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    const preview = this.previewAction(groupId, keepPath);
    if (!preview) {
      return { success: false, removed: [], errors: [{ path: '', error: 'Group not found' }] };
    }

    const removed: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const file of preview.remove) {
      try {
        // Move to trash instead of permanent delete
        await fs.unlink(file.path);
        removed.push(file.path);
      } catch (error) {
        errors.push({
          path: file.path,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update group
    if (this.activeScan) {
      const groupIndex = this.activeScan.duplicateGroups.findIndex(g => g.id === groupId);
      if (groupIndex >= 0 && errors.length === 0) {
        this.activeScan.duplicateGroups.splice(groupIndex, 1);
        this.activeScan.totalDuplicates -= preview.remove.length;
        this.activeScan.potentialSavings -= preview.spaceSaved;
      }
    }

    return {
      success: errors.length === 0,
      removed,
      errors
    };
  }

  async compareFiles(path1: string, path2: string): Promise<{
    areDuplicates: boolean;
    type: DuplicateType | 'none';
    confidence: number;
  }> {
    try {
      const [stats1, stats2] = await Promise.all([
        fs.stat(path1),
        fs.stat(path2)
      ]);

      // Different sizes = not exact duplicates
      if (stats1.size !== stats2.size) {
        // Check name similarity
        if (this.isSimilarName(this.getBaseName(path1), this.getBaseName(path2))) {
          return { areDuplicates: true, type: 'similar_name', confidence: 0.6 };
        }
        return { areDuplicates: false, type: 'none', confidence: 0 };
      }

      // Same size, check hash
      const [hash1, hash2] = await Promise.all([
        this.fullHash(path1),
        this.fullHash(path2)
      ]);

      if (hash1 === hash2) {
        return { areDuplicates: true, type: 'exact', confidence: 1.0 };
      }

      return { areDuplicates: false, type: 'similar_size', confidence: 0.3 };
    } catch {
      return { areDuplicates: false, type: 'none', confidence: 0 };
    }
  }

  async findDuplicatesOf(filePath: string, searchFolder: string): Promise<DuplicateGroup | null> {
    try {
      const targetStats = await fs.stat(filePath);
      const targetHash = await this.fullHash(filePath);
      
      const duplicates: DuplicateFile[] = [{
        path: filePath,
        name: path.basename(filePath),
        size: targetStats.size,
        modified: targetStats.mtimeMs,
        hash: targetHash,
        isOriginal: true
      }];

      // Search for matches
      const files = await this.collectFiles(searchFolder, {
        includeSubfolders: true,
        minFileSize: targetStats.size,
        maxFileSize: targetStats.size,
        includeHidden: false,
        excludePatterns: [],
        scanModes: ['exact'],
        compareContent: true,
        quickHashOnly: false
      }, []);

      for (const file of files) {
        if (file.path === filePath) continue;
        
        const hash = await this.fullHash(file.path);
        if (hash === targetHash) {
          duplicates.push({
            path: file.path,
            name: path.basename(file.path),
            size: file.size,
            modified: file.modified,
            hash,
            isOriginal: false
          });
        }
      }

      if (duplicates.length > 1) {
        return this.createGroup('exact', duplicates.map(d => ({
          path: d.path,
          size: d.size,
          modified: d.modified
        })), targetHash);
      }

      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // CONTROL
  // -------------------------------------------------------------------------

  getProgress(): ScanResult | null {
    return this.activeScan;
  }

  getResults(): ScanResult | null {
    return this.activeScan;
  }

  cancelScan(): { success: boolean } {
    if (this.activeScan && this.activeScan.status === 'scanning') {
      this.cancellationRequested = true;
      return { success: true };
    }
    return { success: false };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const SmartDuplicateDetector = new SmartDuplicateDetectorClass();
export default SmartDuplicateDetector;
