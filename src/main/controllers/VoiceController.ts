// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Voice Controller
// Phase 7B: Voice Notes (Local Recording & Storage)
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface VoiceNote {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  duration: number; // seconds
  size: number; // bytes
  format: 'webm' | 'wav' | 'mp3';
  transcription?: string;
  sessionId?: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VoiceSettings {
  audioFormat: 'webm' | 'wav';
  maxDurationMinutes: number;
  autoSaveInterval: number; // seconds
  storageFolder: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

function generateId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  audioFormat: 'webm',
  maxDurationMinutes: 30,
  autoSaveInterval: 30,
  storageFolder: 'voice-notes',
};

// ===========================================================================
// Voice Controller
// ===========================================================================

export class VoiceController {
  private dataStore: DataStore;
  private logger: Logger;
  private settings: VoiceSettings;
  private voiceNotes: VoiceNote[] = [];
  private storagePath: string;
  private initialized: boolean = false;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    this.settings = { ...DEFAULT_SETTINGS };
    this.storagePath = path.join(app.getPath('userData'), 'voice-notes');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure storage directory exists
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }

      // Load settings
      const savedSettings = await this.dataStore.get<VoiceSettings>('voiceSettings');
      if (savedSettings) {
        this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
      }

      // Load voice notes metadata
      const savedNotes = await this.dataStore.get<VoiceNote[]>('voiceNotes');
      if (savedNotes) {
        this.voiceNotes = savedNotes;
        // Verify files still exist
        this.voiceNotes = this.voiceNotes.filter(note => {
          if (fs.existsSync(note.filePath)) {
            return true;
          }
          this.logger.warn(`Voice note file missing: ${note.filePath}`);
          return false;
        });
      }

      this.initialized = true;
      this.logger.info('Voice Controller initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Voice Controller');
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  getSettings(): VoiceSettings {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<VoiceSettings>): Promise<VoiceSettings> {
    this.settings = { ...this.settings, ...updates };
    await this.dataStore.set('voiceSettings', this.settings);
    return this.settings;
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  // -------------------------------------------------------------------------
  // Voice Note CRUD
  // -------------------------------------------------------------------------

  async getAll(): Promise<VoiceNote[]> {
    return this.voiceNotes.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getById(id: string): Promise<VoiceNote | null> {
    return this.voiceNotes.find(n => n.id === id) || null;
  }

  async save(audioData: Buffer, metadata: Partial<VoiceNote>): Promise<VoiceNote> {
    const id = metadata.id || generateId();
    const now = Date.now();
    const format = metadata.format || this.settings.audioFormat;
    const fileName = `${id}.${format}`;
    const filePath = path.join(this.storagePath, fileName);

    // Write audio file
    fs.writeFileSync(filePath, audioData);

    // Get file stats
    const stats = fs.statSync(filePath);

    // Create or update voice note
    const existingIndex = this.voiceNotes.findIndex(n => n.id === id);
    
    const voiceNote: VoiceNote = {
      id,
      title: metadata.title || `Recording ${new Date(now).toLocaleString()}`,
      fileName,
      filePath,
      duration: metadata.duration || 0,
      size: stats.size,
      format,
      transcription: metadata.transcription,
      sessionId: metadata.sessionId,
      tags: metadata.tags || [],
      pinned: metadata.pinned || false,
      createdAt: existingIndex >= 0 ? this.voiceNotes[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.voiceNotes[existingIndex] = voiceNote;
    } else {
      this.voiceNotes.push(voiceNote);
    }

    await this.saveData();
    this.logger.info(`Voice note saved: ${voiceNote.title}`);

    return voiceNote;
  }

  async updateMetadata(id: string, updates: Partial<VoiceNote>): Promise<VoiceNote | null> {
    const index = this.voiceNotes.findIndex(n => n.id === id);
    if (index === -1) return null;

    const voiceNote = this.voiceNotes[index];
    this.voiceNotes[index] = {
      ...voiceNote,
      ...updates,
      id: voiceNote.id, // Prevent ID change
      filePath: voiceNote.filePath, // Prevent path change
      updatedAt: Date.now(),
    };

    await this.saveData();
    return this.voiceNotes[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.voiceNotes.findIndex(n => n.id === id);
    if (index === -1) return false;

    const voiceNote = this.voiceNotes[index];

    // Delete file
    try {
      if (fs.existsSync(voiceNote.filePath)) {
        fs.unlinkSync(voiceNote.filePath);
      }
    } catch (error) {
      this.logger.error(`Failed to delete voice file: ${voiceNote.filePath}`);
    }

    // Remove from array
    this.voiceNotes.splice(index, 1);
    await this.saveData();

    this.logger.info(`Voice note deleted: ${voiceNote.title}`);
    return true;
  }

  async togglePin(id: string): Promise<VoiceNote | null> {
    const voiceNote = this.voiceNotes.find(n => n.id === id);
    if (!voiceNote) return null;

    voiceNote.pinned = !voiceNote.pinned;
    voiceNote.updatedAt = Date.now();
    await this.saveData();

    return voiceNote;
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  async getAudioData(id: string): Promise<Buffer | null> {
    const voiceNote = this.voiceNotes.find(n => n.id === id);
    if (!voiceNote) return null;

    try {
      return fs.readFileSync(voiceNote.filePath);
    } catch (error) {
      this.logger.error(`Failed to read voice file: ${voiceNote.filePath}`);
      return null;
    }
  }

  async getAudioPath(id: string): Promise<string | null> {
    const voiceNote = this.voiceNotes.find(n => n.id === id);
    return voiceNote?.filePath || null;
  }

  // -------------------------------------------------------------------------
  // Search & Filter
  // -------------------------------------------------------------------------

  async search(query: string): Promise<VoiceNote[]> {
    const queryLower = query.toLowerCase();
    return this.voiceNotes.filter(note => 
      note.title.toLowerCase().includes(queryLower) ||
      note.transcription?.toLowerCase().includes(queryLower) ||
      note.tags.some(t => t.toLowerCase().includes(queryLower))
    );
  }

  async getBySession(sessionId: string): Promise<VoiceNote[]> {
    return this.voiceNotes.filter(n => n.sessionId === sessionId);
  }

  async getPinned(): Promise<VoiceNote[]> {
    return this.voiceNotes.filter(n => n.pinned);
  }

  async getRecent(limit: number = 10): Promise<VoiceNote[]> {
    return this.voiceNotes
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): { count: number; totalDuration: number; totalSize: number } {
    return {
      count: this.voiceNotes.length,
      totalDuration: this.voiceNotes.reduce((sum, n) => sum + n.duration, 0),
      totalSize: this.voiceNotes.reduce((sum, n) => sum + n.size, 0),
    };
  }

  // -------------------------------------------------------------------------
  // Data Management
  // -------------------------------------------------------------------------

  private async saveData(): Promise<void> {
    await this.dataStore.set('voiceNotes', this.voiceNotes);
  }

  async cleanup(maxAgedays: number = 90): Promise<number> {
    const cutoff = Date.now() - (maxAgedays * 24 * 60 * 60 * 1000);
    const toDelete = this.voiceNotes.filter(n => !n.pinned && n.createdAt < cutoff);
    
    for (const note of toDelete) {
      await this.delete(note.id);
    }

    return toDelete.length;
  }
}
