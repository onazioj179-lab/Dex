// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 1: Intent-Aware Work Sessions (FOUNDATIONAL)
// ===========================================================================
// Intent Sessions replace fragile window-based workflows.
// A session captures: files, notes, media, tabs, automations, context.
// No auto-creation. No guessing. User always names and confirms.
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

export interface IntentFile {
  id: string;
  path: string;
  name: string;
  type: string;
  addedAt: number;
  lastAccessedAt: number;
  notes?: string;
}

export interface IntentNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export interface IntentMedia {
  id: string;
  path: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'document';
  addedAt: number;
  duration?: number;
  thumbnail?: string;
  transcription?: string;
}

export interface IntentTab {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  favicon?: string;
  snapshot?: string;
}

export interface IntentAutomation {
  id: string;
  name: string;
  description: string;
  workflowId?: string;
  enabled: boolean;
  addedAt: number;
}

export interface IntentContext {
  why: string;           // Why this work exists
  goal?: string;         // What success looks like
  deadline?: number;     // Optional deadline
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  relatedIntents: string[];  // Links to other intents
}

export interface IntentVersion {
  id: string;
  intentId: string;
  version: number;
  timestamp: number;
  snapshot: IntentSessionSnapshot;
  description?: string;
}

export interface IntentSessionSnapshot {
  files: IntentFile[];
  notes: IntentNote[];
  media: IntentMedia[];
  tabs: IntentTab[];
  automations: IntentAutomation[];
  context: IntentContext;
}

export type IntentStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface IntentSession {
  id: string;
  name: string;
  description?: string;
  status: IntentStatus;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  totalActiveTime: number;  // Time spent in this intent
  
  // Content
  files: IntentFile[];
  notes: IntentNote[];
  media: IntentMedia[];
  tabs: IntentTab[];
  automations: IntentAutomation[];
  context: IntentContext;
  
  // History
  versionCount: number;
  versions: IntentVersion[];
}

export interface IntentRestorePreview {
  intentId: string;
  intentName: string;
  timestamp: number;
  changes: {
    filesToOpen: IntentFile[];
    tabsToRestore: IntentTab[];
    notesToShow: IntentNote[];
    automationsToEnable: IntentAutomation[];
  };
  warnings: string[];
  missingFiles: string[];
}

export interface IntentSearchResult {
  intent: IntentSession;
  matchType: 'name' | 'content' | 'file' | 'note' | 'tag';
  matchContext: string;
  relevanceScore: number;
}

// ===========================================================================
// INTENT SESSION MANAGER
// ===========================================================================

class IntentSessionManagerClass extends EventEmitter {
  private intents: Map<string, IntentSession> = new Map();
  private activeIntentId: string | null = null;
  private sessionStartTime: number = 0;
  private dataPath: string;
  private versionsPath: string;
  private isInitialized: boolean = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'intents');
    this.versionsPath = path.join(this.dataPath, 'versions');
    this.setMaxListeners(30);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadIntents();
    this.registerIPCHandlers();
    this.startAutoSave();

    this.isInitialized = true;
    log.info('[IntentSessions] Intent Session Manager initialized');
  }

  shutdown(): void {
    // Save active time before shutdown
    if (this.activeIntentId) {
      this.updateActiveTime();
    }

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    this.saveAllIntents();
    this.removeAllListeners();
    log.info('[IntentSessions] Intent Session Manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.versionsPath)) {
      fs.mkdirSync(this.versionsPath, { recursive: true });
    }
  }

  private async loadIntents(): Promise<void> {
    try {
      const indexPath = path.join(this.dataPath, 'intents-index.json');
      if (fs.existsSync(indexPath)) {
        const raw = fs.readFileSync(indexPath, 'utf-8').trim();
        if (raw && raw.length > 2) {
          const data = JSON.parse(raw);
          for (const intent of data.intents || []) {
            this.intents.set(intent.id, intent);
          }
          if (this.intents.size > 0) {
            log.info(`[IntentSessions] Loaded ${this.intents.size} intents`);
          }
        }
      }
    } catch (error) {
      log.error('[IntentSessions] Failed to load intents:', error);
    }
  }

  private saveAllIntents(): void {
    try {
      const indexPath = path.join(this.dataPath, 'intents-index.json');
      const data = {
        version: 1,
        savedAt: Date.now(),
        intents: Array.from(this.intents.values()),
      };
      fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
    } catch (error) {
      log.error('[IntentSessions] Failed to save intents:', error);
    }
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.updateActiveTime();
      this.saveAllIntents();
    }, 60000); // Auto-save every minute
  }

  private updateActiveTime(): void {
    if (this.activeIntentId && this.sessionStartTime > 0) {
      const intent = this.intents.get(this.activeIntentId);
      if (intent) {
        const elapsed = Date.now() - this.sessionStartTime;
        intent.totalActiveTime += elapsed;
        intent.lastActiveAt = Date.now();
        this.sessionStartTime = Date.now();
      }
    }
  }

  // -------------------------------------------------------------------------
  // INTENT CRUD OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Create a new intent session - ALWAYS user-initiated
   */
  createIntent(params: {
    name: string;
    description?: string;
    context: {
      why: string;
      goal?: string;
      deadline?: number;
      priority?: IntentContext['priority'];
      tags?: string[];
    };
  }): IntentSession {
    const now = Date.now();
    
    const intent: IntentSession = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      totalActiveTime: 0,
      
      files: [],
      notes: [],
      media: [],
      tabs: [],
      automations: [],
      
      context: {
        why: params.context.why,
        goal: params.context.goal,
        deadline: params.context.deadline,
        priority: params.context.priority || 'medium',
        tags: params.context.tags || [],
        relatedIntents: [],
      },
      
      versionCount: 0,
      versions: [],
    };

    this.intents.set(intent.id, intent);
    this.emit('intent-created', { intentId: intent.id, name: intent.name });
    this.saveAllIntents();

    log.info(`[IntentSessions] Created intent: ${intent.name} (${intent.id})`);
    return intent;
  }

  /**
   * Start/resume an intent session
   */
  activateIntent(intentId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    if (intent.status === 'archived' || intent.status === 'completed') {
      return { success: false, error: 'Cannot activate archived or completed intent' };
    }

    // Deactivate current intent if any
    if (this.activeIntentId && this.activeIntentId !== intentId) {
      this.deactivateCurrentIntent();
    }

    // Activate new intent
    this.activeIntentId = intentId;
    this.sessionStartTime = Date.now();
    intent.status = 'active';
    intent.lastActiveAt = Date.now();
    intent.updatedAt = Date.now();

    this.emit('intent-activated', { intentId, name: intent.name });
    log.info(`[IntentSessions] Activated intent: ${intent.name}`);

    return { success: true };
  }

  /**
   * Pause current intent (preserves state)
   */
  pauseIntent(intentId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    if (this.activeIntentId === intentId) {
      this.updateActiveTime();
      this.activeIntentId = null;
      this.sessionStartTime = 0;
    }

    intent.status = 'paused';
    intent.updatedAt = Date.now();

    // Create version snapshot when pausing
    this.createVersion(intentId, 'Paused');

    this.emit('intent-paused', { intentId, name: intent.name });
    this.saveAllIntents();

    log.info(`[IntentSessions] Paused intent: ${intent.name}`);
    return { success: true };
  }

  /**
   * Archive intent (long-term storage)
   */
  archiveIntent(intentId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    if (this.activeIntentId === intentId) {
      this.deactivateCurrentIntent();
    }

    intent.status = 'archived';
    intent.updatedAt = Date.now();

    // Create final version snapshot
    this.createVersion(intentId, 'Archived');

    this.emit('intent-archived', { intentId, name: intent.name });
    this.saveAllIntents();

    log.info(`[IntentSessions] Archived intent: ${intent.name}`);
    return { success: true };
  }

  /**
   * Mark intent as completed
   */
  completeIntent(intentId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    if (this.activeIntentId === intentId) {
      this.deactivateCurrentIntent();
    }

    intent.status = 'completed';
    intent.updatedAt = Date.now();

    // Create final version snapshot
    this.createVersion(intentId, 'Completed');

    this.emit('intent-completed', { intentId, name: intent.name });
    this.saveAllIntents();

    log.info(`[IntentSessions] Completed intent: ${intent.name}`);
    return { success: true };
  }

  /**
   * Delete intent permanently
   */
  deleteIntent(intentId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    if (this.activeIntentId === intentId) {
      this.deactivateCurrentIntent();
    }

    // Delete version files
    try {
      const versionFiles = fs.readdirSync(this.versionsPath)
        .filter(f => f.startsWith(intentId));
      for (const file of versionFiles) {
        fs.unlinkSync(path.join(this.versionsPath, file));
      }
    } catch (error) {
      log.warn('[IntentSessions] Failed to delete version files:', error);
    }

    this.intents.delete(intentId);
    this.emit('intent-deleted', { intentId, name: intent.name });
    this.saveAllIntents();

    log.info(`[IntentSessions] Deleted intent: ${intent.name}`);
    return { success: true };
  }

  private deactivateCurrentIntent(): void {
    if (this.activeIntentId) {
      this.updateActiveTime();
      const intent = this.intents.get(this.activeIntentId);
      if (intent && intent.status === 'active') {
        intent.status = 'paused';
      }
      this.emit('intent-deactivated', { intentId: this.activeIntentId });
      this.activeIntentId = null;
      this.sessionStartTime = 0;
    }
  }

  // -------------------------------------------------------------------------
  // CONTENT MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add file to intent
   */
  addFile(intentId: string, filePath: string, notes?: string): { success: boolean; file?: IntentFile; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    // Check for duplicates
    if (intent.files.some(f => f.path === filePath)) {
      return { success: false, error: 'File already in intent' };
    }

    const stats = fs.statSync(filePath);
    const file: IntentFile = {
      id: crypto.randomUUID(),
      path: filePath,
      name: path.basename(filePath),
      type: path.extname(filePath).toLowerCase(),
      addedAt: Date.now(),
      lastAccessedAt: Date.now(),
      notes,
    };

    intent.files.push(file);
    intent.updatedAt = Date.now();

    this.emit('intent-file-added', { intentId, file });
    return { success: true, file };
  }

  /**
   * Remove file from intent
   */
  removeFile(intentId: string, fileId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const index = intent.files.findIndex(f => f.id === fileId);
    if (index === -1) {
      return { success: false, error: 'File not found in intent' };
    }

    intent.files.splice(index, 1);
    intent.updatedAt = Date.now();

    this.emit('intent-file-removed', { intentId, fileId });
    return { success: true };
  }

  /**
   * Add note to intent
   */
  addNote(intentId: string, title: string, content: string, tags?: string[]): { success: boolean; note?: IntentNote; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const note: IntentNote = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: tags || [],
    };

    intent.notes.push(note);
    intent.updatedAt = Date.now();

    this.emit('intent-note-added', { intentId, note });
    return { success: true, note };
  }

  /**
   * Update note
   */
  updateNote(intentId: string, noteId: string, updates: { title?: string; content?: string; tags?: string[] }): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const note = intent.notes.find(n => n.id === noteId);
    if (!note) {
      return { success: false, error: 'Note not found' };
    }

    if (updates.title !== undefined) note.title = updates.title;
    if (updates.content !== undefined) note.content = updates.content;
    if (updates.tags !== undefined) note.tags = updates.tags;
    note.updatedAt = Date.now();
    intent.updatedAt = Date.now();

    this.emit('intent-note-updated', { intentId, noteId });
    return { success: true };
  }

  /**
   * Remove note
   */
  removeNote(intentId: string, noteId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const index = intent.notes.findIndex(n => n.id === noteId);
    if (index === -1) {
      return { success: false, error: 'Note not found' };
    }

    intent.notes.splice(index, 1);
    intent.updatedAt = Date.now();

    this.emit('intent-note-removed', { intentId, noteId });
    return { success: true };
  }

  /**
   * Add tab to intent
   */
  addTab(intentId: string, url: string, title: string, favicon?: string): { success: boolean; tab?: IntentTab; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    // Check for duplicates
    if (intent.tabs.some(t => t.url === url)) {
      return { success: false, error: 'Tab already in intent' };
    }

    const tab: IntentTab = {
      id: crypto.randomUUID(),
      url,
      title,
      addedAt: Date.now(),
      favicon,
    };

    intent.tabs.push(tab);
    intent.updatedAt = Date.now();

    this.emit('intent-tab-added', { intentId, tab });
    return { success: true, tab };
  }

  /**
   * Remove tab
   */
  removeTab(intentId: string, tabId: string): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const index = intent.tabs.findIndex(t => t.id === tabId);
    if (index === -1) {
      return { success: false, error: 'Tab not found' };
    }

    intent.tabs.splice(index, 1);
    intent.updatedAt = Date.now();

    this.emit('intent-tab-removed', { intentId, tabId });
    return { success: true };
  }

  /**
   * Link automation to intent
   */
  addAutomation(intentId: string, name: string, description: string, workflowId?: string): { success: boolean; automation?: IntentAutomation; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const automation: IntentAutomation = {
      id: crypto.randomUUID(),
      name,
      description,
      workflowId,
      enabled: false,  // Default disabled - user must enable
      addedAt: Date.now(),
    };

    intent.automations.push(automation);
    intent.updatedAt = Date.now();

    this.emit('intent-automation-added', { intentId, automation });
    return { success: true, automation };
  }

  /**
   * Toggle automation enabled state
   */
  toggleAutomation(intentId: string, automationId: string, enabled: boolean): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    const automation = intent.automations.find(a => a.id === automationId);
    if (!automation) {
      return { success: false, error: 'Automation not found' };
    }

    automation.enabled = enabled;
    intent.updatedAt = Date.now();

    this.emit('intent-automation-toggled', { intentId, automationId, enabled });
    return { success: true };
  }

  /**
   * Update intent context
   */
  updateContext(intentId: string, updates: Partial<IntentContext>): { success: boolean; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    intent.context = { ...intent.context, ...updates };
    intent.updatedAt = Date.now();

    this.emit('intent-context-updated', { intentId });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // VERSIONING
  // -------------------------------------------------------------------------

  /**
   * Create a version snapshot
   */
  createVersion(intentId: string, description?: string): { success: boolean; version?: IntentVersion; error?: string } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    intent.versionCount++;
    
    const version: IntentVersion = {
      id: crypto.randomUUID(),
      intentId,
      version: intent.versionCount,
      timestamp: Date.now(),
      snapshot: {
        files: [...intent.files],
        notes: [...intent.notes],
        media: [...intent.media],
        tabs: [...intent.tabs],
        automations: [...intent.automations],
        context: { ...intent.context },
      },
      description,
    };

    // Keep only last 50 versions in memory
    if (intent.versions.length >= 50) {
      const removed = intent.versions.shift();
      // Save old version to disk
      if (removed) {
        this.saveVersionToDisk(removed);
      }
    }

    intent.versions.push(version);
    intent.updatedAt = Date.now();

    this.emit('intent-version-created', { intentId, versionId: version.id, versionNumber: version.version });
    return { success: true, version };
  }

  private saveVersionToDisk(version: IntentVersion): void {
    try {
      const filePath = path.join(this.versionsPath, `${version.intentId}-v${version.version}.json`);
      fs.writeFileSync(filePath, JSON.stringify(version, null, 2));
    } catch (error) {
      log.error('[IntentSessions] Failed to save version to disk:', error);
    }
  }

  /**
   * Get version history
   */
  getVersionHistory(intentId: string, limit: number = 20): IntentVersion[] {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return [];
    }

    return intent.versions.slice(-limit).reverse();
  }

  // -------------------------------------------------------------------------
  // RESTORE PREVIEW
  // -------------------------------------------------------------------------

  /**
   * Generate restore preview WITHOUT applying changes
   */
  generateRestorePreview(intentId: string, versionId?: string): IntentRestorePreview | null {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return null;
    }

    let snapshot: IntentSessionSnapshot;
    
    if (versionId) {
      const version = intent.versions.find(v => v.id === versionId);
      if (!version) {
        return null;
      }
      snapshot = version.snapshot;
    } else {
      snapshot = {
        files: intent.files,
        notes: intent.notes,
        media: intent.media,
        tabs: intent.tabs,
        automations: intent.automations,
        context: intent.context,
      };
    }

    const missingFiles: string[] = [];
    const warnings: string[] = [];

    // Check which files still exist
    const validFiles = snapshot.files.filter(f => {
      if (!fs.existsSync(f.path)) {
        missingFiles.push(f.path);
        return false;
      }
      return true;
    });

    // Check for stale tabs
    const staleTabs = snapshot.tabs.filter(t => {
      const ageHours = (Date.now() - t.addedAt) / (1000 * 60 * 60);
      return ageHours > 24;
    });
    if (staleTabs.length > 0) {
      warnings.push(`${staleTabs.length} tabs are older than 24 hours and may be stale`);
    }

    return {
      intentId,
      intentName: intent.name,
      timestamp: Date.now(),
      changes: {
        filesToOpen: validFiles,
        tabsToRestore: snapshot.tabs,
        notesToShow: snapshot.notes,
        automationsToEnable: snapshot.automations.filter(a => a.enabled),
      },
      warnings,
      missingFiles,
    };
  }

  /**
   * Apply restore after preview confirmation
   */
  applyRestore(intentId: string, preview: IntentRestorePreview): { success: boolean; error?: string } {
    // This method is called ONLY after user reviews and confirms the preview
    // The actual restore happens in the UI layer that opens files/tabs
    
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    this.activateIntent(intentId);
    this.emit('intent-restored', { intentId, preview });
    
    log.info(`[IntentSessions] Restored intent: ${intent.name}`);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get all intents
   */
  getAllIntents(): IntentSession[] {
    return Array.from(this.intents.values());
  }

  /**
   * Get intents by status
   */
  getIntentsByStatus(status: IntentStatus): IntentSession[] {
    return Array.from(this.intents.values()).filter(i => i.status === status);
  }

  /**
   * Get active intent
   */
  getActiveIntent(): IntentSession | null {
    if (!this.activeIntentId) return null;
    return this.intents.get(this.activeIntentId) || null;
  }

  /**
   * Get intent by ID
   */
  getIntent(intentId: string): IntentSession | null {
    return this.intents.get(intentId) || null;
  }

  /**
   * Search intents
   */
  searchIntents(query: string): IntentSearchResult[] {
    const results: IntentSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const intent of this.intents.values()) {
      // Search name
      if (intent.name.toLowerCase().includes(queryLower)) {
        results.push({
          intent,
          matchType: 'name',
          matchContext: intent.name,
          relevanceScore: 100,
        });
        continue;
      }

      // Search context
      if (intent.context.why.toLowerCase().includes(queryLower)) {
        results.push({
          intent,
          matchType: 'content',
          matchContext: intent.context.why.substring(0, 100),
          relevanceScore: 80,
        });
        continue;
      }

      // Search tags
      const matchingTag = intent.context.tags.find(t => t.toLowerCase().includes(queryLower));
      if (matchingTag) {
        results.push({
          intent,
          matchType: 'tag',
          matchContext: matchingTag,
          relevanceScore: 70,
        });
        continue;
      }

      // Search files
      const matchingFile = intent.files.find(f => f.name.toLowerCase().includes(queryLower));
      if (matchingFile) {
        results.push({
          intent,
          matchType: 'file',
          matchContext: matchingFile.name,
          relevanceScore: 60,
        });
        continue;
      }

      // Search notes
      const matchingNote = intent.notes.find(n => 
        n.title.toLowerCase().includes(queryLower) || 
        n.content.toLowerCase().includes(queryLower)
      );
      if (matchingNote) {
        results.push({
          intent,
          matchType: 'note',
          matchContext: matchingNote.title,
          relevanceScore: 50,
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get recent intents
   */
  getRecentIntents(limit: number = 10): IntentSession[] {
    return Array.from(this.intents.values())
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, limit);
  }

  /**
   * Get related intents
   */
  getRelatedIntents(intentId: string): IntentSession[] {
    const intent = this.intents.get(intentId);
    if (!intent) return [];

    return intent.context.relatedIntents
      .map(id => this.intents.get(id))
      .filter((i): i is IntentSession => i !== undefined);
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Intent CRUD
    ipcMain.handle('intent:create', (_, params) => this.createIntent(params));
    ipcMain.handle('intent:activate', (_, intentId) => this.activateIntent(intentId));
    ipcMain.handle('intent:pause', (_, intentId) => this.pauseIntent(intentId));
    ipcMain.handle('intent:archive', (_, intentId) => this.archiveIntent(intentId));
    ipcMain.handle('intent:complete', (_, intentId) => this.completeIntent(intentId));
    ipcMain.handle('intent:delete', (_, intentId) => this.deleteIntent(intentId));

    // Content management
    ipcMain.handle('intent:addFile', (_, intentId, filePath, notes) => 
      this.addFile(intentId, filePath, notes));
    ipcMain.handle('intent:removeFile', (_, intentId, fileId) => 
      this.removeFile(intentId, fileId));
    ipcMain.handle('intent:addNote', (_, intentId, title, content, tags) => 
      this.addNote(intentId, title, content, tags));
    ipcMain.handle('intent:updateNote', (_, intentId, noteId, updates) => 
      this.updateNote(intentId, noteId, updates));
    ipcMain.handle('intent:removeNote', (_, intentId, noteId) => 
      this.removeNote(intentId, noteId));
    ipcMain.handle('intent:addTab', (_, intentId, url, title, favicon) => 
      this.addTab(intentId, url, title, favicon));
    ipcMain.handle('intent:removeTab', (_, intentId, tabId) => 
      this.removeTab(intentId, tabId));
    ipcMain.handle('intent:addAutomation', (_, intentId, name, description, workflowId) => 
      this.addAutomation(intentId, name, description, workflowId));
    ipcMain.handle('intent:toggleAutomation', (_, intentId, automationId, enabled) => 
      this.toggleAutomation(intentId, automationId, enabled));
    ipcMain.handle('intent:updateContext', (_, intentId, updates) => 
      this.updateContext(intentId, updates));

    // Versioning
    ipcMain.handle('intent:createVersion', (_, intentId, description) => 
      this.createVersion(intentId, description));
    ipcMain.handle('intent:getVersionHistory', (_, intentId, limit) => 
      this.getVersionHistory(intentId, limit));

    // Restore
    ipcMain.handle('intent:generateRestorePreview', (_, intentId, versionId) => 
      this.generateRestorePreview(intentId, versionId));
    ipcMain.handle('intent:applyRestore', (_, intentId, preview) => 
      this.applyRestore(intentId, preview));

    // Queries
    ipcMain.handle('intent:getAll', () => this.getAllIntents());
    ipcMain.handle('intent:getByStatus', (_, status) => this.getIntentsByStatus(status));
    ipcMain.handle('intent:getActive', () => this.getActiveIntent());
    ipcMain.handle('intent:get', (_, intentId) => this.getIntent(intentId));
    ipcMain.handle('intent:search', (_, query) => this.searchIntents(query));
    ipcMain.handle('intent:getRecent', (_, limit) => this.getRecentIntents(limit));
    ipcMain.handle('intent:getRelated', (_, intentId) => this.getRelatedIntents(intentId));
  }
}

// Singleton instance
export const intentSessionManager = new IntentSessionManagerClass();

// Export initialization function
export async function initializeIntentSessions(): Promise<void> {
  return intentSessionManager.initialize();
}

export function shutdownIntentSessions(): void {
  intentSessionManager.shutdown();
}
