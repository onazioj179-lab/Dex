// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 2: Usage-Aware File System (NON-DESTRUCTIVE)
// ===========================================================================
// Enhance file interaction WITHOUT changing files.
// Track usage frequency, context-based ranking, relationships.
// Files are NEVER moved automatically. Suggestions only.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface FileUsageRecord {
  filePath: string;
  fileName: string;
  fileType: string;
  
  // Usage metrics
  accessCount: number;
  lastAccessedAt: number;
  firstAccessedAt: number;
  totalOpenTime: number;  // Milliseconds file was open
  
  // Context
  accessedInIntents: string[];  // Intent IDs where file was used
  accessTimes: number[];        // Timestamps (last 100)
  
  // Relationships (computed)
  oftenUsedWith: string[];      // File paths often accessed together
}

export interface FileRelationship {
  fileA: string;
  fileB: string;
  coAccessCount: number;        // Times accessed within 5 minutes of each other
  lastCoAccess: number;
  strength: number;             // 0-100 relationship strength
}

export interface FileRanking {
  filePath: string;
  score: number;
  factors: {
    frequency: number;          // Access frequency score
    recency: number;            // Time-decay score
    context: number;            // Context relevance score
    relationship: number;       // Relationship to current work
  };
  explanation: string;          // Why this file ranks here
}

export interface FileGraph {
  nodes: Array<{
    filePath: string;
    label: string;
    size: number;               // Based on usage
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;             // Relationship strength
  }>;
}

export interface UsageSuggestion {
  type: 'recent' | 'related' | 'pattern' | 'context';
  filePath: string;
  reason: string;
  confidence: number;
  timestamp: number;
}

// ===========================================================================
// USAGE TRACKER
// ===========================================================================

class UsageAwareFileSystemClass extends EventEmitter {
  private usageRecords: Map<string, FileUsageRecord> = new Map();
  private relationships: Map<string, FileRelationship> = new Map();
  private recentAccess: Array<{ filePath: string; timestamp: number }> = [];
  private currentOpenFiles: Map<string, number> = new Map();  // filePath -> openTime
  private dataPath: string;
  private isInitialized: boolean = false;
  private saveInterval: NodeJS.Timeout | null = null;

  // Time decay constants
  private readonly DECAY_HALF_LIFE_DAYS = 7;
  private readonly RELATIONSHIP_WINDOW_MS = 5 * 60 * 1000;  // 5 minutes
  private readonly MAX_RECENT_ACCESS = 100;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'file-usage');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectory();
    await this.loadData();
    this.registerIPCHandlers();
    this.startPeriodicSave();

    this.isInitialized = true;
    log.info('[UsageAwareFS] Usage-aware file system initialized');
  }

  shutdown(): void {
    // Save open time for any files still open
    for (const [filePath, openTime] of this.currentOpenFiles) {
      this.recordFileClose(filePath);
    }

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    this.saveData();
    this.removeAllListeners();
    log.info('[UsageAwareFS] Usage-aware file system shut down');
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      // Load usage records
      const usagePath = path.join(this.dataPath, 'file-usage.json');
      if (fs.existsSync(usagePath)) {
        const raw = fs.readFileSync(usagePath, 'utf-8').trim();
        if (raw && raw.length > 2) {
          const data = JSON.parse(raw);
          for (const record of data.records || []) {
            this.usageRecords.set(record.filePath, record);
          }
        }
      }

      // Load relationships
      const relPath = path.join(this.dataPath, 'file-relationships.json');
      if (fs.existsSync(relPath)) {
        const rawRel = fs.readFileSync(relPath, 'utf-8').trim();
        if (rawRel && rawRel.length > 2) {
          const data = JSON.parse(rawRel);
          for (const rel of data.relationships || []) {
            const key = this.getRelationshipKey(rel.fileA, rel.fileB);
            this.relationships.set(key, rel);
          }
        }
      }

      if (this.usageRecords.size > 0 || this.relationships.size > 0) {
        log.info(`[UsageAwareFS] Loaded ${this.usageRecords.size} file records, ${this.relationships.size} relationships`);
      }
    } catch (error) {
      log.error('[UsageAwareFS] Failed to load data:', error);
    }
  }

  private saveData(): void {
    try {
      // Save usage records
      const usagePath = path.join(this.dataPath, 'file-usage.json');
      fs.writeFileSync(usagePath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        records: Array.from(this.usageRecords.values()),
      }, null, 2));

      // Save relationships
      const relPath = path.join(this.dataPath, 'file-relationships.json');
      fs.writeFileSync(relPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        relationships: Array.from(this.relationships.values()),
      }, null, 2));
    } catch (error) {
      log.error('[UsageAwareFS] Failed to save data:', error);
    }
  }

  private startPeriodicSave(): void {
    this.saveInterval = setInterval(() => {
      this.saveData();
      this.cleanupOldData();
    }, 5 * 60 * 1000);  // Save every 5 minutes
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (90 * 24 * 60 * 60 * 1000);  // 90 days

    // Clean old records with no recent access
    for (const [path, record] of this.usageRecords) {
      if (record.lastAccessedAt < cutoffTime && record.accessCount < 5) {
        this.usageRecords.delete(path);
      }
    }

    // Clean weak relationships
    for (const [key, rel] of this.relationships) {
      if (rel.lastCoAccess < cutoffTime && rel.strength < 20) {
        this.relationships.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // USAGE TRACKING
  // -------------------------------------------------------------------------

  /**
   * Record file access (open)
   */
  recordFileAccess(filePath: string, intentId?: string): void {
    const normalizedPath = path.normalize(filePath);
    const now = Date.now();

    // Get or create record
    let record = this.usageRecords.get(normalizedPath);
    if (!record) {
      record = {
        filePath: normalizedPath,
        fileName: path.basename(normalizedPath),
        fileType: path.extname(normalizedPath).toLowerCase(),
        accessCount: 0,
        lastAccessedAt: now,
        firstAccessedAt: now,
        totalOpenTime: 0,
        accessedInIntents: [],
        accessTimes: [],
        oftenUsedWith: [],
      };
      this.usageRecords.set(normalizedPath, record);
    }

    // Update record
    record.accessCount++;
    record.lastAccessedAt = now;
    record.accessTimes.push(now);
    if (record.accessTimes.length > this.MAX_RECENT_ACCESS) {
      record.accessTimes = record.accessTimes.slice(-this.MAX_RECENT_ACCESS);
    }

    if (intentId && !record.accessedInIntents.includes(intentId)) {
      record.accessedInIntents.push(intentId);
    }

    // Track file open time
    this.currentOpenFiles.set(normalizedPath, now);

    // Update relationships with recently accessed files
    this.updateRelationships(normalizedPath);

    // Add to recent access
    this.recentAccess.push({ filePath: normalizedPath, timestamp: now });
    if (this.recentAccess.length > this.MAX_RECENT_ACCESS) {
      this.recentAccess.shift();
    }

    this.emit('file-accessed', { filePath: normalizedPath, intentId });
  }

  /**
   * Record file close
   */
  recordFileClose(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    const openTime = this.currentOpenFiles.get(normalizedPath);

    if (openTime) {
      const record = this.usageRecords.get(normalizedPath);
      if (record) {
        record.totalOpenTime += Date.now() - openTime;
      }
      this.currentOpenFiles.delete(normalizedPath);
    }

    this.emit('file-closed', { filePath: normalizedPath });
  }

  /**
   * Update relationships based on recent access
   */
  private updateRelationships(currentFile: string): void {
    const now = Date.now();
    const windowStart = now - this.RELATIONSHIP_WINDOW_MS;

    // Find files accessed within the relationship window
    const recentFiles = this.recentAccess
      .filter(a => a.timestamp >= windowStart && a.filePath !== currentFile)
      .map(a => a.filePath);

    // Update relationships
    for (const recentFile of recentFiles) {
      const key = this.getRelationshipKey(currentFile, recentFile);
      let rel = this.relationships.get(key);

      if (!rel) {
        rel = {
          fileA: currentFile < recentFile ? currentFile : recentFile,
          fileB: currentFile < recentFile ? recentFile : currentFile,
          coAccessCount: 0,
          lastCoAccess: now,
          strength: 0,
        };
        this.relationships.set(key, rel);
      }

      rel.coAccessCount++;
      rel.lastCoAccess = now;
      rel.strength = this.calculateRelationshipStrength(rel);
    }

    // Update the record's oftenUsedWith list
    this.updateOftenUsedWith(currentFile);
  }

  private getRelationshipKey(fileA: string, fileB: string): string {
    return fileA < fileB ? `${fileA}|${fileB}` : `${fileB}|${fileA}`;
  }

  private calculateRelationshipStrength(rel: FileRelationship): number {
    // Factors: co-access count, recency
    const countScore = Math.min(rel.coAccessCount * 5, 50);
    const recencyDays = (Date.now() - rel.lastCoAccess) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 50 - recencyDays * 5);

    return Math.round(countScore + recencyScore);
  }

  private updateOftenUsedWith(filePath: string): void {
    const record = this.usageRecords.get(filePath);
    if (!record) return;

    // Find all relationships involving this file
    const related: Array<{ path: string; strength: number }> = [];

    for (const rel of this.relationships.values()) {
      if (rel.fileA === filePath) {
        related.push({ path: rel.fileB, strength: rel.strength });
      } else if (rel.fileB === filePath) {
        related.push({ path: rel.fileA, strength: rel.strength });
      }
    }

    // Keep top 10 by strength
    record.oftenUsedWith = related
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10)
      .map(r => r.path);
  }

  // -------------------------------------------------------------------------
  // RANKING & SUGGESTIONS
  // -------------------------------------------------------------------------

  /**
   * Get ranked files with explanations
   */
  getRankedFiles(context?: {
    intentId?: string;
    currentFile?: string;
    query?: string;
  }, limit: number = 20): FileRanking[] {
    const rankings: FileRanking[] = [];
    const now = Date.now();

    for (const record of this.usageRecords.values()) {
      // Calculate frequency score
      const frequencyScore = Math.min(record.accessCount * 2, 30);

      // Calculate recency score (time decay)
      const daysSinceAccess = (now - record.lastAccessedAt) / (24 * 60 * 60 * 1000);
      const decayFactor = Math.pow(0.5, daysSinceAccess / this.DECAY_HALF_LIFE_DAYS);
      const recencyScore = decayFactor * 30;

      // Calculate context score
      let contextScore = 0;
      if (context?.intentId && record.accessedInIntents.includes(context.intentId)) {
        contextScore += 20;
      }
      if (context?.query) {
        const queryLower = context.query.toLowerCase();
        if (record.fileName.toLowerCase().includes(queryLower)) {
          contextScore += 15;
        }
      }

      // Calculate relationship score
      let relationshipScore = 0;
      if (context?.currentFile) {
        const key = this.getRelationshipKey(record.filePath, context.currentFile);
        const rel = this.relationships.get(key);
        if (rel) {
          relationshipScore = rel.strength * 0.2;
        }
      }

      const totalScore = frequencyScore + recencyScore + contextScore + relationshipScore;

      // Generate explanation
      const explanation = this.generateRankingExplanation({
        frequencyScore,
        recencyScore,
        contextScore,
        relationshipScore,
        record,
      });

      rankings.push({
        filePath: record.filePath,
        score: totalScore,
        factors: {
          frequency: frequencyScore,
          recency: recencyScore,
          context: contextScore,
          relationship: relationshipScore,
        },
        explanation,
      });
    }

    return rankings
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private generateRankingExplanation(params: {
    frequencyScore: number;
    recencyScore: number;
    contextScore: number;
    relationshipScore: number;
    record: FileUsageRecord;
  }): string {
    const parts: string[] = [];

    if (params.frequencyScore > 20) {
      parts.push(`Accessed ${params.record.accessCount} times`);
    }

    if (params.recencyScore > 20) {
      const hoursAgo = Math.round((Date.now() - params.record.lastAccessedAt) / (60 * 60 * 1000));
      if (hoursAgo < 24) {
        parts.push(`Used ${hoursAgo} hours ago`);
      } else {
        parts.push(`Used ${Math.round(hoursAgo / 24)} days ago`);
      }
    }

    if (params.contextScore > 0) {
      parts.push('Matches current context');
    }

    if (params.relationshipScore > 10) {
      parts.push('Often used with current file');
    }

    return parts.join(' ') || 'General usage';
  }

  /**
   * Get suggestions based on current context
   */
  getSuggestions(context: {
    currentFile?: string;
    intentId?: string;
    timeOfDay?: number;  // Hour 0-23
  }): UsageSuggestion[] {
    const suggestions: UsageSuggestion[] = [];
    const now = Date.now();

    // Related file suggestions
    if (context.currentFile) {
      const record = this.usageRecords.get(context.currentFile);
      if (record && record.oftenUsedWith.length > 0) {
        for (const relatedPath of record.oftenUsedWith.slice(0, 3)) {
          suggestions.push({
            type: 'related',
            filePath: relatedPath,
            reason: `Often used together with ${path.basename(context.currentFile)}`,
            confidence: 0.8,
            timestamp: now,
          });
        }
      }
    }

    // Recent files suggestions
    const recentRankings = this.getRankedFiles(context, 5);
    for (const ranking of recentRankings) {
      if (!suggestions.some(s => s.filePath === ranking.filePath)) {
        suggestions.push({
          type: 'recent',
          filePath: ranking.filePath,
          reason: ranking.explanation,
          confidence: ranking.score / 100,
          timestamp: now,
        });
      }
    }

    // Context-based suggestions
    if (context.intentId) {
      const intentFiles = Array.from(this.usageRecords.values())
        .filter(r => r.accessedInIntents.includes(context.intentId!))
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, 3);

      for (const record of intentFiles) {
        if (!suggestions.some(s => s.filePath === record.filePath)) {
          suggestions.push({
            type: 'context',
            filePath: record.filePath,
            reason: 'Used in current work session',
            confidence: 0.7,
            timestamp: now,
          });
        }
      }
    }

    return suggestions.slice(0, 10);
  }

  /**
   * Get files often used together
   */
  getRelatedFiles(filePath: string, limit: number = 10): Array<{
    filePath: string;
    strength: number;
    coAccessCount: number;
  }> {
    const normalizedPath = path.normalize(filePath);
    const related: Array<{
      filePath: string;
      strength: number;
      coAccessCount: number;
    }> = [];

    for (const rel of this.relationships.values()) {
      if (rel.fileA === normalizedPath) {
        related.push({
          filePath: rel.fileB,
          strength: rel.strength,
          coAccessCount: rel.coAccessCount,
        });
      } else if (rel.fileB === normalizedPath) {
        related.push({
          filePath: rel.fileA,
          strength: rel.strength,
          coAccessCount: rel.coAccessCount,
        });
      }
    }

    return related
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit);
  }

  /**
   * Generate file relationship graph
   */
  getFileGraph(centerFile?: string, depth: number = 2): FileGraph {
    const nodes: Map<string, { filePath: string; label: string; size: number }> = new Map();
    const edges: Array<{ source: string; target: string; weight: number }> = [];

    const addNode = (filePath: string) => {
      if (nodes.has(filePath)) return;
      const record = this.usageRecords.get(filePath);
      nodes.set(filePath, {
        filePath,
        label: path.basename(filePath),
        size: record ? Math.min(record.accessCount * 5, 50) : 10,
      });
    };

    if (centerFile) {
      // Build graph from center file
      const toProcess: Array<{ path: string; depth: number }> = [{ path: centerFile, depth: 0 }];
      const processed = new Set<string>();

      while (toProcess.length > 0) {
        const current = toProcess.shift()!;
        if (processed.has(current.path) || current.depth > depth) continue;
        processed.add(current.path);

        addNode(current.path);

        const related = this.getRelatedFiles(current.path, 5);
        for (const rel of related) {
          addNode(rel.filePath);
          edges.push({
            source: current.path,
            target: rel.filePath,
            weight: rel.strength,
          });

          if (current.depth < depth) {
            toProcess.push({ path: rel.filePath, depth: current.depth + 1 });
          }
        }
      }
    } else {
      // Build graph from top relationships
      const topRelationships = Array.from(this.relationships.values())
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 50);

      for (const rel of topRelationships) {
        addNode(rel.fileA);
        addNode(rel.fileB);
        edges.push({
          source: rel.fileA,
          target: rel.fileB,
          weight: rel.strength,
        });
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get usage record for a file
   */
  getFileUsage(filePath: string): FileUsageRecord | null {
    return this.usageRecords.get(path.normalize(filePath)) || null;
  }

  /**
   * Get all usage records
   */
  getAllUsageRecords(): FileUsageRecord[] {
    return Array.from(this.usageRecords.values());
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalFiles: number;
    totalAccesses: number;
    totalRelationships: number;
    topFiles: Array<{ path: string; count: number }>;
    recentFiles: Array<{ path: string; lastAccess: number }>;
  } {
    const records = Array.from(this.usageRecords.values());

    return {
      totalFiles: records.length,
      totalAccesses: records.reduce((sum, r) => sum + r.accessCount, 0),
      totalRelationships: this.relationships.size,
      topFiles: records
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, 10)
        .map(r => ({ path: r.filePath, count: r.accessCount })),
      recentFiles: records
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, 10)
        .map(r => ({ path: r.filePath, lastAccess: r.lastAccessedAt })),
    };
  }

  /**
   * Clear all usage data (privacy feature)
   */
  clearAllData(): void {
    this.usageRecords.clear();
    this.relationships.clear();
    this.recentAccess = [];
    this.saveData();
    this.emit('data-cleared');
    log.info('[UsageAwareFS] All usage data cleared');
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('fileUsage:recordAccess', (_, filePath, intentId) => {
      this.recordFileAccess(filePath, intentId);
      return { success: true };
    });

    ipcMain.handle('fileUsage:recordClose', (_, filePath) => {
      this.recordFileClose(filePath);
      return { success: true };
    });

    ipcMain.handle('fileUsage:getRankedFiles', (_, context, limit) => 
      this.getRankedFiles(context, limit));

    ipcMain.handle('fileUsage:getSuggestions', (_, context) => 
      this.getSuggestions(context));

    ipcMain.handle('fileUsage:getRelatedFiles', (_, filePath, limit) => 
      this.getRelatedFiles(filePath, limit));

    ipcMain.handle('fileUsage:getFileGraph', (_, centerFile, depth) => 
      this.getFileGraph(centerFile, depth));

    ipcMain.handle('fileUsage:getFileUsage', (_, filePath) => 
      this.getFileUsage(filePath));

    ipcMain.handle('fileUsage:getAllRecords', () => 
      this.getAllUsageRecords());

    ipcMain.handle('fileUsage:getStats', () => 
      this.getUsageStats());

    ipcMain.handle('fileUsage:clearAll', () => {
      this.clearAllData();
      return { success: true };
    });
  }
}

// Singleton instance
export const usageAwareFileSystem = new UsageAwareFileSystemClass();

export async function initializeUsageAwareFileSystem(): Promise<void> {
  return usageAwareFileSystem.initialize();
}

export function shutdownUsageAwareFileSystem(): void {
  usageAwareFileSystem.shutdown();
}
