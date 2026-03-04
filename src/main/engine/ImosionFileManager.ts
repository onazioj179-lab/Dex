/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMOSION FILE MANAGER - Project & Audio File Management
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles:
 * - Project autosave and crash recovery
 * - Version history and snapshots
 * - Efficient file I/O for large audio files
 * - Multiple sample rates and bit depths
 * - Stem export and batch rendering
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectMetadata {
  id: string;
  name: string;
  created: string;
  modified: string;
  version: string;
  sampleRate: number;
  tempo: number;
  timeSignature: [number, number];
  duration: number;
  trackCount: number;
  author?: string;
  description?: string;
  tags?: string[];
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  timestamp: string;
  description?: string;
  size: number;
  data: string; // Base64 encoded compressed data
}

export interface VersionHistoryEntry {
  id: string;
  timestamp: string;
  description: string;
  changeType: 'save' | 'autosave' | 'snapshot' | 'import' | 'export';
  filePath: string;
  size: number;
}

export interface AudioFileInfo {
  path: string;
  name: string;
  format: 'wav' | 'mp3' | 'flac' | 'ogg' | 'aiff' | 'midi';
  sampleRate: number;
  bitDepth: number;
  channels: number;
  duration: number;
  size: number;
  peaks?: Float32Array; // Waveform peaks for display
}

export interface ExportSettings {
  format: 'wav' | 'mp3' | 'flac' | 'ogg' | 'aiff';
  sampleRate: number;
  bitDepth: number;
  normalize: boolean;
  dither: boolean;
  trimSilence: boolean;
  splitStems: boolean;
  mp3Quality?: number; // 128-320 kbps
  flacCompression?: number; // 0-8
}

export interface StemExportSettings extends ExportSettings {
  stemNames: string[];
  includeEffects: boolean;
  includeMaster: boolean;
}

export interface BatchRenderJob {
  id: string;
  projectPath: string;
  outputPath: string;
  settings: ExportSettings;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO FILE CACHE - Efficient Memory Management
// ═══════════════════════════════════════════════════════════════════════════

class AudioFileCache {
  private cache: Map<string, { data: Float32Array[]; lastAccess: number; size: number }> = new Map();
  private maxCacheSize = 512 * 1024 * 1024; // 512 MB
  private currentCacheSize = 0;
  
  get(filePath: string): Float32Array[] | null {
    const entry = this.cache.get(filePath);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.data;
    }
    return null;
  }
  
  set(filePath: string, data: Float32Array[]): void {
    const size = data.reduce((sum, ch) => sum + ch.byteLength, 0);
    
    // Evict old entries if needed
    while (this.currentCacheSize + size > this.maxCacheSize && this.cache.size > 0) {
      this.evictOldest();
    }
    
    this.cache.set(filePath, { data, lastAccess: Date.now(), size });
    this.currentCacheSize += size;
  }
  
  remove(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      this.currentCacheSize -= entry.size;
      this.cache.delete(filePath);
    }
  }
  
  private evictOldest(): void {
    let oldestPath: string | null = null;
    let oldestTime = Infinity;
    
    for (const [path, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestPath = path;
      }
    }
    
    if (oldestPath) {
      this.remove(oldestPath);
    }
  }
  
  clear(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }
  
  getStats(): { entries: number; size: number; maxSize: number } {
    return {
      entries: this.cache.size,
      size: this.currentCacheSize,
      maxSize: this.maxCacheSize
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVEFORM GENERATOR - Peak Extraction for Display
// ═══════════════════════════════════════════════════════════════════════════

class WaveformGenerator {
  /**
   * Generate waveform peaks for display
   * Uses multi-resolution for efficient zooming
   */
  generatePeaks(audioData: Float32Array, targetPoints: number): Float32Array {
    const peaks = new Float32Array(targetPoints);
    const samplesPerPeak = Math.ceil(audioData.length / targetPoints);
    
    for (let i = 0; i < targetPoints; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, audioData.length);
      
      let maxPeak = 0;
      for (let j = start; j < end; j++) {
        maxPeak = Math.max(maxPeak, Math.abs(audioData[j]));
      }
      peaks[i] = maxPeak;
    }
    
    return peaks;
  }
  
  /**
   * Generate multi-resolution peaks for efficient display at any zoom level
   */
  generateMultiResolutionPeaks(audioData: Float32Array): Map<number, Float32Array> {
    const resolutions = new Map<number, Float32Array>();
    
    // Generate peaks at different resolutions: 256, 512, 1024, 2048, 4096, 8192
    const levels = [256, 512, 1024, 2048, 4096, 8192];
    
    for (const level of levels) {
      if (audioData.length >= level) {
        resolutions.set(level, this.generatePeaks(audioData, level));
      }
    }
    
    return resolutions;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FILE MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ImosionFileManager extends EventEmitter {
  private projectsDir: string;
  private autosaveDir: string;
  private tempDir: string;
  private cacheDir: string;
  
  private audioCache: AudioFileCache;
  private waveformGenerator: WaveformGenerator;
  
  private currentProject: ProjectMetadata | null = null;
  private currentProjectPath: string | null = null;
  private versionHistory: VersionHistoryEntry[] = [];
  private snapshots: Map<string, ProjectSnapshot> = new Map();
  
  private autosaveInterval: NodeJS.Timeout | null = null;
  private autosaveEnabled = true;
  private autosaveIntervalMs = 60000; // 1 minute
  private maxAutosaves = 10;
  private maxVersionHistory = 50;
  
  private batchRenderQueue: BatchRenderJob[] = [];
  private isRendering = false;
  
  constructor() {
    super();
    
    const userDataPath = app?.getPath?.('userData') || './data';
    this.projectsDir = path.join(userDataPath, 'imosion', 'projects');
    this.autosaveDir = path.join(userDataPath, 'imosion', 'autosave');
    this.tempDir = path.join(userDataPath, 'imosion', 'temp');
    this.cacheDir = path.join(userDataPath, 'imosion', 'cache');
    
    this.audioCache = new AudioFileCache();
    this.waveformGenerator = new WaveformGenerator();
    
    this.initDirectories();
    
    console.log('[ImosionFileManager] Initialized:', {
      projectsDir: this.projectsDir,
      autosaveEnabled: this.autosaveEnabled
    });
  }
  
  private initDirectories(): void {
    const dirs = [this.projectsDir, this.autosaveDir, this.tempDir, this.cacheDir];
    
    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (error) {
        console.error(`[ImosionFileManager] Failed to create directory: ${dir}`, error);
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Project Management
  // ─────────────────────────────────────────────────────────────────────────
  
  async createProject(name: string, settings?: Partial<ProjectMetadata>): Promise<ProjectMetadata> {
    const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const project: ProjectMetadata = {
      id,
      name,
      created: now,
      modified: now,
      version: '1.0.0',
      sampleRate: settings?.sampleRate || 48000,
      tempo: settings?.tempo || 120,
      timeSignature: settings?.timeSignature || [4, 4],
      duration: 0,
      trackCount: 0,
      author: settings?.author,
      description: settings?.description,
      tags: settings?.tags || []
    };
    
    this.currentProject = project;
    this.versionHistory = [];
    this.snapshots.clear();
    
    this.startAutosave();
    this.emit('projectCreated', project);
    
    return project;
  }
  
  async openProject(filePath: string): Promise<ProjectMetadata> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const projectData = JSON.parse(data);
      
      this.currentProject = projectData.metadata;
      this.currentProjectPath = filePath;
      this.versionHistory = projectData.versionHistory || [];
      
      // Load snapshots
      this.snapshots.clear();
      if (projectData.snapshots) {
        for (const snapshot of projectData.snapshots) {
          this.snapshots.set(snapshot.id, snapshot);
        }
      }
      
      this.startAutosave();
      this.emit('projectOpened', this.currentProject);
      
      return this.currentProject!;
    } catch (error) {
      console.error('[ImosionFileManager] Failed to open project:', error);
      throw error;
    }
  }
  
  async saveProject(filePath?: string, projectData?: any): Promise<string> {
    if (!this.currentProject) {
      throw new Error('No project is currently open');
    }
    
    const savePath = filePath || this.currentProjectPath || 
      path.join(this.projectsDir, `${this.currentProject.name}.imosion`);
    
    this.currentProject.modified = new Date().toISOString();
    
    const saveData = {
      metadata: this.currentProject,
      versionHistory: this.versionHistory,
      snapshots: Array.from(this.snapshots.values()),
      projectData: projectData || {}
    };
    
    try {
      await fs.promises.writeFile(savePath, JSON.stringify(saveData, null, 2));
      this.currentProjectPath = savePath;
      
      // Add to version history
      this.addVersionHistoryEntry('save', savePath, 'Project saved');
      
      this.emit('projectSaved', { path: savePath, project: this.currentProject });
      return savePath;
    } catch (error) {
      console.error('[ImosionFileManager] Failed to save project:', error);
      throw error;
    }
  }
  
  async closeProject(): Promise<void> {
    this.stopAutosave();
    
    const project = this.currentProject;
    this.currentProject = null;
    this.currentProjectPath = null;
    this.versionHistory = [];
    this.snapshots.clear();
    
    this.emit('projectClosed', project);
  }
  
  getCurrentProject(): ProjectMetadata | null {
    return this.currentProject;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Autosave & Recovery
  // ─────────────────────────────────────────────────────────────────────────
  
  startAutosave(): void {
    if (!this.autosaveEnabled || this.autosaveInterval) return;
    
    this.autosaveInterval = setInterval(() => {
      this.performAutosave();
    }, this.autosaveIntervalMs);
    
    console.log('[ImosionFileManager] Autosave started');
  }
  
  stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
      console.log('[ImosionFileManager] Autosave stopped');
    }
  }
  
  private async performAutosave(): Promise<void> {
    if (!this.currentProject) return;
    
    const autosavePath = path.join(
      this.autosaveDir,
      `${this.currentProject.id}_${Date.now()}.autosave`
    );
    
    try {
      const saveData = {
        metadata: this.currentProject,
        timestamp: new Date().toISOString(),
        projectData: {} // Would include actual project data
      };
      
      await fs.promises.writeFile(autosavePath, JSON.stringify(saveData));
      this.addVersionHistoryEntry('autosave', autosavePath, 'Autosave');
      
      // Clean up old autosaves
      await this.cleanupOldAutosaves();
      
      this.emit('autosaved', { path: autosavePath, project: this.currentProject });
    } catch (error) {
      console.error('[ImosionFileManager] Autosave failed:', error);
      this.emit('autosaveFailed', error);
    }
  }
  
  private async cleanupOldAutosaves(): Promise<void> {
    if (!this.currentProject) return;
    
    try {
      const files = await fs.promises.readdir(this.autosaveDir);
      const autosaves = files
        .filter(f => f.startsWith(this.currentProject!.id) && f.endsWith('.autosave'))
        .map(f => ({
          name: f,
          path: path.join(this.autosaveDir, f),
          time: parseInt(f.split('_')[1]) || 0
        }))
        .sort((a, b) => b.time - a.time);
      
      // Remove excess autosaves
      for (let i = this.maxAutosaves; i < autosaves.length; i++) {
        await fs.promises.unlink(autosaves[i].path);
      }
    } catch (error) {
      console.error('[ImosionFileManager] Cleanup failed:', error);
    }
  }
  
  async getRecoverableProjects(): Promise<{ path: string; metadata: ProjectMetadata; timestamp: string }[]> {
    const recoverable: { path: string; metadata: ProjectMetadata; timestamp: string }[] = [];
    
    try {
      const files = await fs.promises.readdir(this.autosaveDir);
      
      for (const file of files) {
        if (file.endsWith('.autosave')) {
          try {
            const filePath = path.join(this.autosaveDir, file);
            const data = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            
            recoverable.push({
              path: filePath,
              metadata: parsed.metadata,
              timestamp: parsed.timestamp
            });
          } catch {
            // Skip invalid files
          }
        }
      }
      
      return recoverable.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('[ImosionFileManager] Failed to get recoverable projects:', error);
      return [];
    }
  }
  
  async recoverProject(autosavePath: string): Promise<ProjectMetadata> {
    try {
      const data = await fs.promises.readFile(autosavePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      this.currentProject = parsed.metadata;
      this.currentProjectPath = null; // Force "Save As" for recovered projects
      
      this.startAutosave();
      this.emit('projectRecovered', this.currentProject);
      
      return this.currentProject!;
    } catch (error) {
      console.error('[ImosionFileManager] Failed to recover project:', error);
      throw error;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Version History & Snapshots
  // ─────────────────────────────────────────────────────────────────────────
  
  private addVersionHistoryEntry(
    changeType: VersionHistoryEntry['changeType'],
    filePath: string,
    description: string
  ): void {
    const entry: VersionHistoryEntry = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      description,
      changeType,
      filePath,
      size: 0 // Would calculate actual size
    };
    
    this.versionHistory.unshift(entry);
    
    // Trim history if too long
    if (this.versionHistory.length > this.maxVersionHistory) {
      this.versionHistory = this.versionHistory.slice(0, this.maxVersionHistory);
    }
    
    this.emit('versionHistoryUpdated', this.versionHistory);
  }
  
  async createSnapshot(name: string, description?: string): Promise<ProjectSnapshot> {
    if (!this.currentProject) {
      throw new Error('No project is currently open');
    }
    
    const snapshot: ProjectSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      timestamp: new Date().toISOString(),
      description,
      size: 0,
      data: '' // Would include compressed project data
    };
    
    this.snapshots.set(snapshot.id, snapshot);
    this.emit('snapshotCreated', snapshot);
    
    return snapshot;
  }
  
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }
    
    // Create a backup before restoring
    await this.createSnapshot('Pre-restore backup', `Backup before restoring "${snapshot.name}"`);
    
    // Would restore actual project data here
    
    this.emit('snapshotRestored', snapshot);
  }
  
  async deleteSnapshot(snapshotId: string): Promise<void> {
    this.snapshots.delete(snapshotId);
    this.emit('snapshotDeleted', snapshotId);
  }
  
  getVersionHistory(): VersionHistoryEntry[] {
    return [...this.versionHistory];
  }
  
  getSnapshots(): ProjectSnapshot[] {
    return Array.from(this.snapshots.values());
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Audio File Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  async loadAudioFile(filePath: string): Promise<AudioFileInfo> {
    // Check cache first
    const cached = this.audioCache.get(filePath);
    
    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    // Would use native audio decoder in real implementation
    const info: AudioFileInfo = {
      path: filePath,
      name: path.basename(filePath),
      format: ext as any || 'wav',
      sampleRate: 48000,
      bitDepth: 24,
      channels: 2,
      duration: 0,
      size: stats.size
    };
    
    this.emit('audioFileLoaded', info);
    return info;
  }
  
  async getWaveformPeaks(filePath: string, resolution: number = 1024): Promise<Float32Array> {
    // Would load and process actual audio file
    // For now, return mock data
    const peaks = new Float32Array(resolution);
    for (let i = 0; i < resolution; i++) {
      peaks[i] = Math.random() * 0.8;
    }
    return peaks;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Export Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  async exportAudio(outputPath: string, settings: ExportSettings, audioData?: Float32Array[]): Promise<string> {
    if (!this.currentProject) {
      throw new Error('No project is currently open');
    }
    
    this.emit('exportStarted', { path: outputPath, settings });
    
    try {
      // Would perform actual audio export in real implementation
      // This includes:
      // - Bouncing all tracks
      // - Applying normalization
      // - Applying dithering
      // - Encoding to target format
      
      await this.simulateExport(outputPath, settings);
      
      this.addVersionHistoryEntry('export', outputPath, `Exported to ${settings.format.toUpperCase()}`);
      this.emit('exportCompleted', { path: outputPath, settings });
      
      return outputPath;
    } catch (error) {
      this.emit('exportFailed', { error, settings });
      throw error;
    }
  }
  
  async exportStems(outputDir: string, settings: StemExportSettings): Promise<string[]> {
    if (!this.currentProject) {
      throw new Error('No project is currently open');
    }
    
    const exportedFiles: string[] = [];
    
    this.emit('stemExportStarted', { dir: outputDir, settings });
    
    try {
      // Export each stem
      for (let i = 0; i < settings.stemNames.length; i++) {
        const stemName = settings.stemNames[i];
        const stemPath = path.join(outputDir, `${stemName}.${settings.format}`);
        
        this.emit('stemExportProgress', {
          current: i + 1,
          total: settings.stemNames.length,
          stemName
        });
        
        await this.simulateExport(stemPath, settings);
        exportedFiles.push(stemPath);
      }
      
      // Export master if requested
      if (settings.includeMaster) {
        const masterPath = path.join(outputDir, `Master.${settings.format}`);
        await this.simulateExport(masterPath, settings);
        exportedFiles.push(masterPath);
      }
      
      this.emit('stemExportCompleted', { files: exportedFiles, settings });
      return exportedFiles;
    } catch (error) {
      this.emit('stemExportFailed', { error, settings });
      throw error;
    }
  }
  
  private async simulateExport(outputPath: string, settings: ExportSettings): Promise<void> {
    // Simulate export time based on settings
    const delay = Math.random() * 1000 + 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Create empty file as placeholder
    try {
      await fs.promises.writeFile(outputPath, '');
    } catch {
      // Ignore if can't write
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Batch Rendering
  // ─────────────────────────────────────────────────────────────────────────
  
  addBatchRenderJob(projectPath: string, outputPath: string, settings: ExportSettings): string {
    const job: BatchRenderJob = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectPath,
      outputPath,
      settings,
      status: 'pending',
      progress: 0
    };
    
    this.batchRenderQueue.push(job);
    this.emit('batchJobAdded', job);
    
    // Start processing if not already running
    if (!this.isRendering) {
      this.processBatchQueue();
    }
    
    return job.id;
  }
  
  private async processBatchQueue(): Promise<void> {
    if (this.isRendering || this.batchRenderQueue.length === 0) return;
    
    this.isRendering = true;
    
    while (this.batchRenderQueue.length > 0) {
      const job = this.batchRenderQueue.find(j => j.status === 'pending');
      if (!job) break;
      
      job.status = 'processing';
      this.emit('batchJobStarted', job);
      
      try {
        // Simulate progress updates
        for (let progress = 0; progress <= 100; progress += 10) {
          job.progress = progress;
          this.emit('batchJobProgress', job);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        job.status = 'completed';
        this.emit('batchJobCompleted', job);
      } catch (error: any) {
        job.status = 'failed';
        job.error = error?.message || 'Unknown error';
        this.emit('batchJobFailed', job);
      }
    }
    
    this.isRendering = false;
    this.emit('batchQueueCompleted');
  }
  
  cancelBatchJob(jobId: string): void {
    const index = this.batchRenderQueue.findIndex(j => j.id === jobId);
    if (index !== -1) {
      this.batchRenderQueue.splice(index, 1);
      this.emit('batchJobCancelled', jobId);
    }
  }
  
  getBatchRenderQueue(): BatchRenderJob[] {
    return [...this.batchRenderQueue];
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────
  
  setAutosaveEnabled(enabled: boolean): void {
    this.autosaveEnabled = enabled;
    if (enabled && this.currentProject) {
      this.startAutosave();
    } else {
      this.stopAutosave();
    }
  }
  
  setAutosaveInterval(intervalMs: number): void {
    this.autosaveIntervalMs = Math.max(10000, intervalMs); // Min 10 seconds
    if (this.autosaveInterval) {
      this.stopAutosave();
      this.startAutosave();
    }
  }
  
  getCacheStats(): { entries: number; size: number; maxSize: number } {
    return this.audioCache.getStats();
  }
  
  clearCache(): void {
    this.audioCache.clear();
    this.emit('cacheCleared');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  
  async dispose(): Promise<void> {
    this.stopAutosave();
    this.audioCache.clear();
    this.removeAllListeners();
    console.log('[ImosionFileManager] Disposed');
  }
}

// Export singleton
let fileManagerInstance: ImosionFileManager | null = null;

export function getFileManager(): ImosionFileManager {
  if (!fileManagerInstance) {
    fileManagerInstance = new ImosionFileManager();
  }
  return fileManagerInstance;
}

export default ImosionFileManager;
