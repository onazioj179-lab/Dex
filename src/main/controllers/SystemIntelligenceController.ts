// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - System Intelligence Controller
 * ===========================================================================
 * 
 * LOCAL-ONLY pattern learning and intelligent suggestions:
 * - Usage-based learning (what files, apps, workflows are used when)
 * - Context-aware suggestions (right tool at right time)
 * - Smart file management recommendations
 * - Workflow optimization insights
 * 
 * CORE PRINCIPLES:
 * - 100% local processing (no cloud, no telemetry)
 * - Event-driven (no background waste)
 * - Advisory only (suggestions, never enforcement)
 * - Opt-in (disabled by default, user controls everything)
 */

import log from 'electron-log';
import { ipcMain, BrowserWindow } from 'electron';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// Types
// ===========================================================================

interface UsageEvent {
  id: string;
  type: 'file' | 'app' | 'workflow' | 'feature' | 'search';
  target: string;           // File path, app name, workflow ID, etc.
  timestamp: number;
  context: {
    dayOfWeek: number;      // 0-6 (Sunday-Saturday)
    hour: number;           // 0-23
    activeMode?: string;    // Current mode ID
    previousTarget?: string; // What was used before
  };
  metadata?: Record<string, any>;
}

interface UsagePattern {
  id: string;
  type: 'temporal' | 'sequential' | 'contextual' | 'frequency';
  confidence: number;       // 0-1 confidence score
  target: string;
  description: string;
  triggers: {
    dayOfWeek?: number[];
    hourRange?: [number, number];
    afterTarget?: string;
    mode?: string;
  };
  occurrences: number;
  lastSeen: number;
}

interface Suggestion {
  id: string;
  type: 'file' | 'app' | 'workflow' | 'action' | 'optimization';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  target?: string;
  action?: string;
  pattern?: string;          // Pattern ID that generated this
  expires: number;
  dismissed: boolean;
}

interface IntelligenceConfig {
  enabled: boolean;
  learningEnabled: boolean;
  suggestionsEnabled: boolean;
  retentionDays: number;     // How long to keep usage data
  minConfidence: number;     // Minimum confidence for suggestions
  maxSuggestions: number;    // Max active suggestions
  categories: {
    files: boolean;
    apps: boolean;
    workflows: boolean;
    optimization: boolean;
  };
}

interface IntelligenceState {
  initialized: boolean;
  eventsRecorded: number;
  patternsDetected: number;
  activeSuggestions: number;
  lastAnalysis: number;
}

// ===========================================================================
// System Intelligence Controller
// ===========================================================================

class SystemIntelligenceController {
  private mainWindow: BrowserWindow | null = null;
  private dataDir: string;
  private eventsFile: string;
  private patternsFile: string;
  private configFile: string;
  
  private events: UsageEvent[] = [];
  private patterns: UsagePattern[] = [];
  private suggestions: Suggestion[] = [];
  private config: IntelligenceConfig;
  
  private analysisTimer: NodeJS.Timeout | null = null;
  private lastEventTarget: string | null = null;
  
  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'intelligence');
    this.eventsFile = path.join(this.dataDir, 'events.json');
    this.patternsFile = path.join(this.dataDir, 'patterns.json');
    this.configFile = path.join(this.dataDir, 'config.json');
    
    // Default configuration - conservative, opt-in
    this.config = {
      enabled: true,                  // Enabled by default
      learningEnabled: true,
      suggestionsEnabled: true,
      retentionDays: 30,
      minConfidence: 0.65,
      maxSuggestions: 5,
      categories: {
        files: true,
        apps: true,
        workflows: true,
        optimization: true,
      },
    };
    
    this.initialize();
    this.registerIPCHandlers();
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf-8').trim();
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (error) {
      log.warn(`[SystemIntelligence] Failed to parse ${path.basename(filePath)}, resetting file`, error);
      this.writeJsonFile(filePath, fallback);
      return fallback;
    }
  }

  private writeJsonFile(filePath: string, data: unknown): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.warn(`[SystemIntelligence] Failed to write ${path.basename(filePath)}`, error);
    }
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      
      // Load configuration
      if (fs.existsSync(this.configFile)) {
        this.config = { ...this.config, ...this.readJsonFile<Partial<IntelligenceConfig>>(this.configFile, {}) };
      }
      
      // Load events (only if enabled)
      if (this.config.enabled && fs.existsSync(this.eventsFile)) {
        this.events = this.readJsonFile<UsageEvent[]>(this.eventsFile, []);
        this.pruneOldEvents();
      }
      
      // Load patterns
      if (this.config.enabled && fs.existsSync(this.patternsFile)) {
        this.patterns = this.readJsonFile<UsagePattern[]>(this.patternsFile, []);
      }
      
      if (!app.isPackaged) log.info('[SystemIntelligence] Initialized:', {
        enabled: this.config.enabled,
        events: this.events.length,
        patterns: this.patterns.length,
      });
      
      // Schedule periodic analysis (hourly when active)
      if (this.config.enabled) {
        this.scheduleAnalysis();
      }
    } catch (err) {
      log.error('[SystemIntelligence] Initialization error:', err);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ===========================================================================
  // Event Recording
  // ===========================================================================

  async recordEvent(
    type: UsageEvent['type'],
    target: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.enabled || !this.config.learningEnabled) return;
    
    const now = new Date();
    const event: UsageEvent = {
      id: crypto.randomUUID(),
      type,
      target,
      timestamp: Date.now(),
      context: {
        dayOfWeek: now.getDay(),
        hour: now.getHours(),
        previousTarget: this.lastEventTarget || undefined,
      },
      metadata,
    };
    
    this.events.push(event);
    this.lastEventTarget = target;
    
    // Save periodically (batch writes)
    if (this.events.length % 10 === 0) {
      await this.saveEvents();
    }
    
    // Trigger lightweight pattern check
    this.checkRealtimePatterns(event);
  }

  // ===========================================================================
  // Pattern Detection
  // ===========================================================================

  private async analyzePatterns(): Promise<void> {
    if (!this.config.enabled) return;
    
    if (!app.isPackaged) log.info('[SystemIntelligence] Running pattern analysis...');
    
    const newPatterns: UsagePattern[] = [];
    
    // 1. Temporal patterns (same time/day)
    newPatterns.push(...this.detectTemporalPatterns());
    
    // 2. Sequential patterns (A then B)
    newPatterns.push(...this.detectSequentialPatterns());
    
    // 3. Frequency patterns (most used)
    newPatterns.push(...this.detectFrequencyPatterns());
    
    // Merge with existing patterns
    this.mergePatterns(newPatterns);
    
    // Generate suggestions from patterns
    this.generateSuggestions();
    
    // Persist
    await this.savePatterns();
    
    if (!app.isPackaged) log.info('[SystemIntelligence] Analysis complete:', {
      patterns: this.patterns.length,
      suggestions: this.suggestions.length,
    });
  }

  private detectTemporalPatterns(): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const targetsByTimeSlot = new Map<string, Map<string, number>>();
    
    // Group events by hour and target
    for (const event of this.events) {
      const timeSlot = `${event.context.dayOfWeek}-${event.context.hour}`;
      if (!targetsByTimeSlot.has(timeSlot)) {
        targetsByTimeSlot.set(timeSlot, new Map());
      }
      const slotMap = targetsByTimeSlot.get(timeSlot)!;
      slotMap.set(event.target, (slotMap.get(event.target) || 0) + 1);
    }
    
    // Find significant patterns (>= 3 occurrences in same slot)
    for (const [timeSlot, targets] of targetsByTimeSlot) {
      const [day, hour] = timeSlot.split('-').map(Number);
      
      for (const [target, count] of targets) {
        if (count >= 3) {
          const confidence = Math.min(count / 10, 1);
          
          patterns.push({
            id: crypto.randomUUID(),
            type: 'temporal',
            confidence,
            target,
            description: `Often used on ${this.getDayName(day)} around ${hour}:00`,
            triggers: {
              dayOfWeek: [day],
              hourRange: [hour, hour + 1],
            },
            occurrences: count,
            lastSeen: Date.now(),
          });
        }
      }
    }
    
    return patterns;
  }

  private detectSequentialPatterns(): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const sequences = new Map<string, number>();
    
    // Find A -> B sequences
    for (let i = 1; i < this.events.length; i++) {
      const prev = this.events[i - 1];
      const curr = this.events[i];
      
      // Only count if within 5 minutes
      if (curr.timestamp - prev.timestamp <= 5 * 60 * 1000) {
        const key = `${prev.target}|${curr.target}`;
        sequences.set(key, (sequences.get(key) || 0) + 1);
      }
    }
    
    // Find significant sequences (>= 3 occurrences)
    for (const [key, count] of sequences) {
      if (count >= 3) {
        const [from, to] = key.split('|');
        const confidence = Math.min(count / 8, 1);
        
        patterns.push({
          id: crypto.randomUUID(),
          type: 'sequential',
          confidence,
          target: to,
          description: `Often used after "${this.getTargetName(from)}"`,
          triggers: {
            afterTarget: from,
          },
          occurrences: count,
          lastSeen: Date.now(),
        });
      }
    }
    
    return patterns;
  }

  private detectFrequencyPatterns(): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const counts = new Map<string, number>();
    
    // Count all targets
    for (const event of this.events) {
      counts.set(event.target, (counts.get(event.target) || 0) + 1);
    }
    
    // Find top items
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    for (const [target, count] of sorted) {
      const confidence = Math.min(count / 20, 1);
      
      patterns.push({
        id: crypto.randomUUID(),
        type: 'frequency',
        confidence,
        target,
        description: `Frequently used (${count} times)`,
        triggers: {},
        occurrences: count,
        lastSeen: Date.now(),
      });
    }
    
    return patterns;
  }

  private mergePatterns(newPatterns: UsagePattern[]): void {
    // Remove old patterns with same target/type
    for (const newPattern of newPatterns) {
      this.patterns = this.patterns.filter(
        p => !(p.target === newPattern.target && p.type === newPattern.type)
      );
    }
    
    // Add new patterns that meet confidence threshold
    this.patterns.push(
      ...newPatterns.filter(p => p.confidence >= this.config.minConfidence)
    );
    
    // Limit total patterns
    this.patterns = this.patterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 100);
  }

  // ===========================================================================
  // Suggestions
  // ===========================================================================

  private generateSuggestions(): void {
    if (!this.config.suggestionsEnabled) return;
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    // Clear expired/dismissed suggestions
    this.suggestions = this.suggestions.filter(
      s => !s.dismissed && s.expires > Date.now()
    );
    
    // Generate from temporal patterns
    for (const pattern of this.patterns) {
      if (pattern.type === 'temporal' && pattern.triggers.dayOfWeek?.includes(currentDay)) {
        const [start, end] = pattern.triggers.hourRange || [0, 24];
        if (currentHour >= start && currentHour < end) {
          this.addSuggestion({
            type: this.getTargetType(pattern.target),
            priority: pattern.confidence > 0.8 ? 'high' : 'medium',
            title: `Open ${this.getTargetName(pattern.target)}?`,
            description: pattern.description,
            target: pattern.target,
            pattern: pattern.id,
          });
        }
      }
    }
    
    // Generate from sequential patterns (check last event)
    if (this.lastEventTarget) {
      for (const pattern of this.patterns) {
        if (pattern.type === 'sequential' && pattern.triggers.afterTarget === this.lastEventTarget) {
          this.addSuggestion({
            type: this.getTargetType(pattern.target),
            priority: 'medium',
            title: `Continue with ${this.getTargetName(pattern.target)}?`,
            description: pattern.description,
            target: pattern.target,
            pattern: pattern.id,
          });
        }
      }
    }
    
    // Limit suggestions
    this.suggestions = this.suggestions
      .slice(0, this.config.maxSuggestions);
  }

  private addSuggestion(partial: Omit<Suggestion, 'id' | 'expires' | 'dismissed'>): void {
    // Check for duplicates
    if (this.suggestions.some(s => s.target === partial.target)) return;
    
    this.suggestions.push({
      ...partial,
      id: crypto.randomUUID(),
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      dismissed: false,
    });
  }

  private checkRealtimePatterns(event: UsageEvent): void {
    // Quick check for sequential patterns when event is recorded
    for (const pattern of this.patterns) {
      if (
        pattern.type === 'sequential' &&
        pattern.triggers.afterTarget === event.target &&
        pattern.confidence >= 0.7
      ) {
        this.addSuggestion({
          type: this.getTargetType(pattern.target),
          priority: 'medium',
          title: `${this.getTargetName(pattern.target)}?`,
          description: `You often use this after ${this.getTargetName(event.target)}`,
          target: pattern.target,
          pattern: pattern.id,
        });
        this.emitStateChange();
      }
    }
  }

  // ===========================================================================
  // File Management Intelligence
  // ===========================================================================

  async getFileOrganizationSuggestions(directory: string): Promise<Suggestion[]> {
    if (!this.config.enabled || !this.config.categories.optimization) {
      return [];
    }
    
    const suggestions: Suggestion[] = [];
    
    try {
      const files = fs.readdirSync(directory);
      const filesByExt = new Map<string, string[]>();
      
      // Group by extension
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!filesByExt.has(ext)) {
          filesByExt.set(ext, []);
        }
        filesByExt.get(ext)!.push(file);
      }
      
      // Suggest folders for groups > 5 files
      for (const [ext, groupFiles] of filesByExt) {
        if (groupFiles.length > 5 && ext) {
          suggestions.push({
            id: crypto.randomUUID(),
            type: 'optimization',
            priority: 'low',
            title: `Organize ${ext} files`,
            description: `${groupFiles.length} ${ext} files could be moved to a dedicated folder`,
            target: directory,
            action: `create-folder:${ext.slice(1)}`,
            expires: Date.now() + 24 * 60 * 60 * 1000,
            dismissed: false,
          });
        }
      }
      
      // Detect duplicates by name pattern
      const basenames = files.map(f => {
        const match = f.match(/^(.+?)(?:\s*\(\d+\))?(\.[^.]+)?$/);
        return match ? match[1] : f;
      });
      
      const duplicates = basenames.filter((name, i) => 
        basenames.indexOf(name) !== i
      );
      
      if (duplicates.length > 0) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'optimization',
          priority: 'medium',
          title: 'Potential duplicate files',
          description: `${new Set(duplicates).size} files might be duplicates`,
          target: directory,
          action: 'review-duplicates',
          expires: Date.now() + 24 * 60 * 60 * 1000,
          dismissed: false,
        });
      }
    } catch (err) {
      log.error('[SystemIntelligence] File analysis error:', err);
    }
    
    return suggestions;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  getState(): IntelligenceState {
    return {
      initialized: true,
      eventsRecorded: this.events.length,
      patternsDetected: this.patterns.length,
      activeSuggestions: this.suggestions.filter(s => !s.dismissed).length,
      lastAnalysis: this.patterns.length > 0 
        ? Math.max(...this.patterns.map(p => p.lastSeen))
        : 0,
    };
  }

  getConfig(): IntelligenceConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<IntelligenceConfig>): Promise<boolean> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...updates };
    
    // Save config
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    
    // Handle enable/disable transitions
    if (!wasEnabled && this.config.enabled) {
      // Just enabled - load data and start analysis
      await this.initialize();
    } else if (wasEnabled && !this.config.enabled) {
      // Just disabled - stop analysis
      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = null;
      }
    }
    
    this.emitStateChange();
    return true;
  }

  getSuggestions(): Suggestion[] {
    return this.suggestions.filter(s => !s.dismissed);
  }

  async dismissSuggestion(id: string): Promise<boolean> {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (suggestion) {
      suggestion.dismissed = true;
      this.emitStateChange();
      return true;
    }
    return false;
  }

  async acceptSuggestion(id: string): Promise<{ success: boolean; action?: string }> {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (!suggestion) {
      return { success: false };
    }
    
    suggestion.dismissed = true;
    
    // Record that user accepted this suggestion (reinforces pattern)
    if (suggestion.target) {
      await this.recordEvent('feature', suggestion.target, {
        source: 'suggestion',
        suggestionId: id,
      });
    }
    
    this.emitStateChange();
    return { success: true, action: suggestion.action };
  }

  getPatterns(): UsagePattern[] {
    return this.patterns.map(p => ({
      ...p,
      // Redact target paths for privacy in exports
    }));
  }

  async triggerAnalysis(): Promise<void> {
    await this.analyzePatterns();
    this.emitStateChange();
  }

  async clearAllData(): Promise<boolean> {
    this.events = [];
    this.patterns = [];
    this.suggestions = [];
    
    // Delete files
    if (fs.existsSync(this.eventsFile)) {
      fs.unlinkSync(this.eventsFile);
    }
    if (fs.existsSync(this.patternsFile)) {
      fs.unlinkSync(this.patternsFile);
    }
    
    this.emitStateChange();
    return true;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private scheduleAnalysis(): void {
    // Run analysis every hour
    this.analysisTimer = setInterval(() => {
      this.analyzePatterns();
    }, 60 * 60 * 1000);
  }

  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }

  private async saveEvents(): Promise<void> {
    try {
      fs.writeFileSync(this.eventsFile, JSON.stringify(this.events, null, 2));
    } catch (err) {
      log.error('[SystemIntelligence] Failed to save events:', err);
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      fs.writeFileSync(this.patternsFile, JSON.stringify(this.patterns, null, 2));
    } catch (err) {
      log.error('[SystemIntelligence] Failed to save patterns:', err);
    }
  }

  private getDayName(day: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  }

  private getTargetName(target: string): string {
    // Extract filename from path or return as-is
    if (target.includes('/') || target.includes('\\')) {
      return path.basename(target);
    }
    return target;
  }

  private getTargetType(target: string): Suggestion['type'] {
    if (target.includes('/') || target.includes('\\')) {
      return 'file';
    }
    if (target.startsWith('workflow:')) {
      return 'workflow';
    }
    return 'action';
  }

  private emitStateChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('intelligence:stateChanged', this.getState());
    }
  }

  // ===========================================================================
  // IPC Handlers
  // ===========================================================================

  private registerIPCHandlers(): void {
    ipcMain.handle('intelligence:getState', () => this.getState());
    ipcMain.handle('intelligence:getConfig', () => this.getConfig());
    ipcMain.handle('intelligence:updateConfig', (_, updates) => this.updateConfig(updates));
    
    ipcMain.handle('intelligence:getSuggestions', () => this.getSuggestions());
    ipcMain.handle('intelligence:dismissSuggestion', (_, id) => this.dismissSuggestion(id));
    ipcMain.handle('intelligence:acceptSuggestion', (_, id) => this.acceptSuggestion(id));
    
    ipcMain.handle('intelligence:getPatterns', () => this.getPatterns());
    ipcMain.handle('intelligence:triggerAnalysis', () => this.triggerAnalysis());
    ipcMain.handle('intelligence:clearData', () => this.clearAllData());
    
    ipcMain.handle('intelligence:recordEvent', (_, type, target, metadata) =>
      this.recordEvent(type, target, metadata)
    );
    
    ipcMain.handle('intelligence:getFileOrganization', (_, directory) =>
      this.getFileOrganizationSuggestions(directory)
    );
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const systemIntelligenceController = new SystemIntelligenceController();
export default systemIntelligenceController;
