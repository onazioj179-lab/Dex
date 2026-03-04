// ═══════════════════════════════════════════════════════════════════════════
// DEX - Audio Controller
// Phase 67: Audio playback, recording, and management
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioFile {
  id: string;
  name: string;
  path: string;
  duration: number;
  size: number;
  format: string;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
  createdAt: number;
  modifiedAt: number;
  tags: string[];
  projectId?: string;
  waveformData?: number[];
  isRecording?: boolean;
}

export interface AudioFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
}

interface RecordingMeta {
  name: string;
  duration: number;
  format: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio Controller
// ═══════════════════════════════════════════════════════════════════════════

export class AudioController {
  private dataStore: DataStore;
  private logger: Logger;
  private files: AudioFile[] = [];
  private folders: AudioFolder[] = [];
  private recordingsPath: string;
  private watchedPaths: Set<string> = new Set();
  private initialized: boolean = false;

  // Supported audio formats
  private static readonly EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm', '.opus'
  ];

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    this.recordingsPath = path.join(app.getPath('userData'), 'recordings');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('[Audio] Initializing...');

    // Ensure recordings directory exists
    if (!fs.existsSync(this.recordingsPath)) {
      fs.mkdirSync(this.recordingsPath, { recursive: true });
    }

    // Load saved audio data
    await this.loadAudioData();

    // Register IPC handlers
    this.registerHandlers();

    this.initialized = true;
    this.logger.info(`[Audio] Initialized with ${this.files.length} files`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private registerHandlers(): void {
    // Get all audio files
    ipcMain.handle('audio:getFiles', async (_, folderId?: string) => {
      return this.getFiles(folderId);
    });

    // Get folders
    ipcMain.handle('audio:getFolders', async (_, parentPath?: string) => {
      return this.getFolders(parentPath);
    });

    // Get single file
    ipcMain.handle('audio:getFile', async (_, id: string) => {
      return this.files.find(f => f.id === id) || null;
    });

    // Add folder
    ipcMain.handle('audio:addFolder', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Audio Folder',
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        await this.scanFolder(result.filePaths[0]);
        return result.filePaths[0];
      }
      return null;
    });

    // Scan folder
    ipcMain.handle('audio:scan', async (_, folderPath: string) => {
      return this.scanFolder(folderPath);
    });

    // Save recording
    ipcMain.handle('audio:saveRecording', async (_, buffer: Buffer, meta: RecordingMeta) => {
      return this.saveRecording(buffer, meta);
    });

    // Rename file
    ipcMain.handle('audio:rename', async (_, id: string, newName: string) => {
      return this.renameFile(id, newName);
    });

    // Delete file
    ipcMain.handle('audio:delete', async (_, id: string) => {
      return this.deleteFile(id);
    });

    // Add tags
    ipcMain.handle('audio:addTags', async (_, ids: string[], tags: string[]) => {
      return this.addTags(ids, tags);
    });

    // Get waveform data
    ipcMain.handle('audio:getWaveform', async (_, id: string) => {
      return this.getWaveform(id);
    });

    // Link to project
    ipcMain.handle('audio:linkToProject', async (_, id: string, projectId: string) => {
      return this.linkToProject(id, projectId);
    });

    // Get recordings
    ipcMain.handle('audio:getRecordings', async () => {
      return this.files.filter(f => f.path.startsWith(this.recordingsPath));
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async loadAudioData(): Promise<void> {
    try {
      const data = await this.dataStore.get('audio:files');
      if (data) {
        this.files = data;
      }
      
      const folders = await this.dataStore.get('audio:folders');
      if (folders) {
        this.folders = folders;
      }
    } catch (error) {
      this.logger.error('[Audio] Failed to load data:', error);
    }
  }

  private async saveAudioData(): Promise<void> {
    try {
      await this.dataStore.set('audio:files', this.files);
      await this.dataStore.set('audio:folders', this.folders);
    } catch (error) {
      this.logger.error('[Audio] Failed to save data:', error);
    }
  }

  private getFiles(folderId?: string): AudioFile[] {
    if (folderId) {
      const folder = this.folders.find(f => f.id === folderId);
      if (folder) {
        return this.files.filter(f => f.path.startsWith(folder.path));
      }
    }
    return this.files;
  }

  private getFolders(parentPath?: string): AudioFolder[] {
    if (parentPath) {
      return this.folders.filter(f => path.dirname(f.path) === parentPath);
    }
    return this.folders;
  }

  private async scanFolder(folderPath: string): Promise<number> {
    this.logger.info(`[Audio] Scanning: ${folderPath}`);
    let count = 0;

    try {
      const items = await this.scanDirectory(folderPath, true);
      
      // Merge with existing files
      for (const item of items) {
        const existing = this.files.find(f => f.path === item.path);
        if (!existing) {
          this.files.push(item);
          count++;
        }
      }

      // Add folder to watch list
      this.watchedPaths.add(folderPath);
      
      // Update folder info
      const existingFolder = this.folders.find(f => f.path === folderPath);
      if (existingFolder) {
        existingFolder.itemCount = items.length;
      } else {
        this.folders.push({
          id: `folder-${Date.now()}`,
          name: path.basename(folderPath),
          path: folderPath,
          itemCount: items.length,
        });
      }

      await this.saveAudioData();
      this.logger.info(`[Audio] Scanned ${count} new files`);
      
    } catch (error) {
      this.logger.error('[Audio] Scan failed:', error);
    }

    return count;
  }

  private async scanDirectory(
    dirPath: string, 
    recursive: boolean
  ): Promise<AudioFile[]> {
    const files: AudioFile[] = [];
    const extensions = new Set(AudioController.EXTENSIONS);

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          const subItems = await this.scanDirectory(fullPath, recursive);
          files.push(...subItems);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.has(ext)) {
            const stats = await fs.promises.stat(fullPath);
            
            files.push({
              id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: entry.name,
              path: fullPath,
              duration: 0, // Would need audio processing to get actual duration
              size: stats.size,
              format: ext.substring(1),
              createdAt: stats.birthtime.getTime(),
              modifiedAt: stats.mtime.getTime(),
              tags: [],
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`[Audio] Error scanning ${dirPath}:`, error);
    }

    return files;
  }

  private async saveRecording(buffer: Buffer, meta: RecordingMeta): Promise<AudioFile> {
    const timestamp = Date.now();
    const id = `rec-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    const filename = `${meta.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.${meta.format}`;
    const filePath = path.join(this.recordingsPath, filename);

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    const audioFile: AudioFile = {
      id,
      name: meta.name,
      path: filePath,
      duration: meta.duration,
      size: buffer.length,
      format: meta.format,
      createdAt: timestamp,
      modifiedAt: timestamp,
      tags: ['recording'],
      isRecording: true,
    };

    this.files.push(audioFile);
    await this.saveAudioData();

    this.logger.info(`[Audio] Saved recording: ${filename}`);
    return audioFile;
  }

  private async renameFile(id: string, newName: string): Promise<AudioFile | null> {
    const file = this.files.find(f => f.id === id);
    if (!file) return null;

    const oldPath = file.path;
    const dir = path.dirname(oldPath);
    const ext = path.extname(oldPath);
    const newPath = path.join(dir, newName + ext);

    try {
      await fs.promises.rename(oldPath, newPath);
      file.name = newName;
      file.path = newPath;
      file.modifiedAt = Date.now();
      await this.saveAudioData();
      
      this.logger.info(`[Audio] Renamed: ${oldPath} -> ${newPath}`);
      return file;
    } catch (error) {
      this.logger.error('[Audio] Rename failed:', error);
      return null;
    }
  }

  private async deleteFile(id: string): Promise<boolean> {
    const index = this.files.findIndex(f => f.id === id);
    if (index === -1) return false;

    const file = this.files[index];

    try {
      // Only delete physical file if it's a recording we created
      if (file.path.startsWith(this.recordingsPath)) {
        await fs.promises.unlink(file.path);
      }
      
      this.files.splice(index, 1);
      await this.saveAudioData();
      
      this.logger.info(`[Audio] Deleted: ${file.path}`);
      return true;
    } catch (error) {
      this.logger.error('[Audio] Delete failed:', error);
      return false;
    }
  }

  private async addTags(ids: string[], tags: string[]): Promise<void> {
    for (const id of ids) {
      const file = this.files.find(f => f.id === id);
      if (file) {
        const uniqueTags = new Set([...file.tags, ...tags]);
        file.tags = Array.from(uniqueTags);
      }
    }
    await this.saveAudioData();
  }

  private async getWaveform(id: string): Promise<number[] | null> {
    const file = this.files.find(f => f.id === id);
    if (!file) return null;

    // Return cached waveform if available
    if (file.waveformData && file.waveformData.length > 0) {
      return file.waveformData;
    }

    // Generate waveform from actual audio file
    try {
      const waveform = await this.generateWaveformFromFile(file.path, 100);
      file.waveformData = waveform;
      await this.saveAudioData();
      return waveform;
    } catch (err) {
      this.logger.error('[Audio] Waveform generation failed:', err);
      // Fallback to duration-based estimation
      const samples = 100;
      const waveform = this.generateEstimatedWaveform(file.duration || 0, samples);
      file.waveformData = waveform;
      await this.saveAudioData();
      return waveform;
    }
  }

  private async generateWaveformFromFile(filePath: string, samples: number): Promise<number[]> {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Audio file not found');
    }

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const ext = path.extname(filePath).toLowerCase();
    
    // Read file in chunks and extract amplitude data
    const buffer = fs.readFileSync(filePath);
    const waveform: number[] = [];
    
    // Skip header bytes based on format
    let headerSize = 0;
    if (ext === '.wav') headerSize = 44;
    else if (ext === '.mp3') headerSize = 0; // MP3 frames are self-contained
    else headerSize = 0;
    
    const dataSize = buffer.length - headerSize;
    const chunkSize = Math.floor(dataSize / samples);
    
    for (let i = 0; i < samples; i++) {
      const start = headerSize + (i * chunkSize);
      const end = Math.min(start + chunkSize, buffer.length);
      
      // Calculate RMS amplitude for this chunk
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j += 2) {
        if (j + 1 < buffer.length) {
          // Read as signed 16-bit little-endian
          const sample = buffer.readInt16LE(j);
          sum += sample * sample;
          count++;
        }
      }
      
      const rms = count > 0 ? Math.sqrt(sum / count) / 32768 : 0;
      waveform.push(Math.min(1, Math.max(0.05, rms * 2)));
    }
    
    return waveform;
  }

  private generateEstimatedWaveform(durationMs: number, samples: number): number[] {
    // Generate a realistic-looking waveform based on typical audio patterns
    const waveform: number[] = [];
    const seed = durationMs % 1000;
    
    for (let i = 0; i < samples; i++) {
      const position = i / samples;
      // Combine multiple sine waves for natural look
      const base = 0.3 + Math.sin(position * Math.PI) * 0.2;
      const detail = Math.sin((position * 10 + seed) * Math.PI) * 0.15;
      const noise = (Math.sin(i * 7.3 + seed) * 0.5 + 0.5) * 0.1;
      waveform.push(Math.min(0.95, Math.max(0.1, base + detail + noise)));
    }
    
    return waveform;
  }

  private async linkToProject(id: string, projectId: string): Promise<boolean> {
    const file = this.files.find(f => f.id === id);
    if (!file) return false;

    file.projectId = projectId;
    await this.saveAudioData();
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.saveAudioData();
    this.logger.info('[Audio] Shutdown complete');
  }
}
