// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 10: Media as Work (PIPELINES)
// ===========================================================================
// Screenshots, recordings, transcripts, and media pipelines should be
// first-class work artifacts. Tied to intents. Searchable. Referenceable.
// Media isn't separate--it's part of the work record.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, desktopCapturer, screen, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaType = 
  | 'screenshot'
  | 'screen-recording'
  | 'audio-recording'
  | 'transcript'
  | 'annotation'
  | 'clip';

export interface MediaArtifact {
  id: string;
  type: MediaType;
  name: string;
  description?: string;
  
  // File info
  filePath: string;
  fileSize: number;
  mimeType: string;
  duration?: number;  // For recordings, in seconds
  dimensions?: { width: number; height: number };
  
  // Timestamps
  createdAt: number;
  capturedAt: number;
  
  // Context binding
  intentId?: string;
  sessionId?: string;
  relatedFiles: string[];
  relatedArtifacts: string[];
  
  // Metadata
  tags: string[];
  annotations: MediaAnnotation[];
  
  // Processing
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  transcript?: string;  // For audio/video
  ocrText?: string;     // For screenshots
  
  // Thumbnail
  thumbnailPath?: string;
}

export interface MediaAnnotation {
  id: string;
  type: 'text' | 'highlight' | 'arrow' | 'rectangle' | 'freehand';
  content?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  timestamp?: number;  // For video annotations, time in seconds
  color?: string;
  createdAt: number;
}

export interface CaptureOptions {
  type: 'screenshot' | 'region' | 'window' | 'fullscreen';
  sourceId?: string;  // For specific window/screen
  region?: { x: number; y: number; width: number; height: number };
  includeAnnotationTools?: boolean;
  bindToIntent?: string;
}

export interface RecordingOptions {
  type: 'screen' | 'audio' | 'screen-audio';
  sourceId?: string;
  quality: 'low' | 'medium' | 'high';
  maxDuration?: number;  // Max recording duration in seconds
  bindToIntent?: string;
}

export interface RecordingState {
  isRecording: boolean;
  type?: RecordingOptions['type'];
  startedAt?: number;
  duration: number;
  artifactId?: string;
}

export interface MediaPipeline {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  
  // Trigger
  trigger: {
    type: 'manual' | 'scheduled' | 'shortcut' | 'intent-start' | 'intent-end';
    schedule?: string;
    shortcut?: string;
  };
  
  // Capture config
  capture: CaptureOptions | RecordingOptions;
  
  // Processing
  processing: {
    generateThumbnail: boolean;
    extractText: boolean;  // OCR or transcription
    autoTag: boolean;
  };
  
  // Output
  output: {
    saveLocation: string;
    namingPattern: string;  // e.g., "{intent}-{date}-{time}"
    maxRetentionDays?: number;
  };
}

// ===========================================================================
// MEDIA WORK MANAGER
// ===========================================================================

class MediaWorkManagerClass extends EventEmitter {
  private artifacts: Map<string, MediaArtifact> = new Map();
  private pipelines: Map<string, MediaPipeline> = new Map();
  private recordingState: RecordingState = { isRecording: false, duration: 0 };
  private mediaPath: string;
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Recording
  private activeRecorder: any = null;  // MediaRecorder
  private recordingChunks: Blob[] = [];
  private recordingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'media');
    this.mediaPath = path.join(this.dataPath, 'files');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadData();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[MediaWork] Media work manager initialized');
  }

  shutdown(): void {
    if (this.recordingState.isRecording) {
      this.stopRecording();
    }
    this.saveData();
    this.removeAllListeners();
    log.info('[MediaWork] Media work manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.mediaPath)) {
      fs.mkdirSync(this.mediaPath, { recursive: true });
    }
    
    // Thumbnails directory
    const thumbsPath = path.join(this.dataPath, 'thumbnails');
    if (!fs.existsSync(thumbsPath)) {
      fs.mkdirSync(thumbsPath, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      // Load artifacts index
      const indexPath = path.join(this.dataPath, 'artifacts.json');
      if (fs.existsSync(indexPath)) {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const artifact of data.artifacts || []) {
          // Verify file exists
          if (fs.existsSync(artifact.filePath)) {
            this.artifacts.set(artifact.id, artifact);
          }
        }
      }

      // Load pipelines
      const pipelinesPath = path.join(this.dataPath, 'pipelines.json');
      if (fs.existsSync(pipelinesPath)) {
        const data = JSON.parse(fs.readFileSync(pipelinesPath, 'utf-8'));
        for (const pipeline of data.pipelines || []) {
          this.pipelines.set(pipeline.id, pipeline);
        }
      }

      log.info(`[MediaWork] Loaded ${this.artifacts.size} media artifacts`);
    } catch (error) {
      log.error('[MediaWork] Failed to load data:', error);
    }
  }

  private saveData(): void {
    try {
      // Save artifacts index
      const indexPath = path.join(this.dataPath, 'artifacts.json');
      fs.writeFileSync(indexPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        artifacts: Array.from(this.artifacts.values()),
      }, null, 2));

      // Save pipelines
      const pipelinesPath = path.join(this.dataPath, 'pipelines.json');
      fs.writeFileSync(pipelinesPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        pipelines: Array.from(this.pipelines.values()),
      }, null, 2));
    } catch (error) {
      log.error('[MediaWork] Failed to save data:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SCREENSHOT CAPTURE
  // -------------------------------------------------------------------------

  /**
   * Capture a screenshot
   */
  async captureScreenshot(options: CaptureOptions): Promise<MediaArtifact | null> {
    try {
      let imageData: Buffer;
      let dimensions: { width: number; height: number };

      switch (options.type) {
        case 'fullscreen':
          const result = await this.captureFullScreen(options.sourceId);
          imageData = result.data;
          dimensions = result.dimensions;
          break;
          
        case 'window':
          const windowResult = await this.captureWindow(options.sourceId);
          imageData = windowResult.data;
          dimensions = windowResult.dimensions;
          break;
          
        case 'region':
          if (!options.region) {
            throw new Error('Region not specified');
          }
          const regionResult = await this.captureRegion(options.region);
          imageData = regionResult.data;
          dimensions = regionResult.dimensions;
          break;
          
        default:
          const defaultResult = await this.captureFullScreen();
          imageData = defaultResult.data;
          dimensions = defaultResult.dimensions;
      }

      // Save to file
      const timestamp = Date.now();
      const filename = `screenshot-${timestamp}.png`;
      const filePath = path.join(this.mediaPath, filename);
      fs.writeFileSync(filePath, imageData);

      // Create artifact
      const artifact: MediaArtifact = {
        id: crypto.randomUUID(),
        type: 'screenshot',
        name: `Screenshot ${new Date(timestamp).toLocaleString()}`,
        filePath,
        fileSize: imageData.length,
        mimeType: 'image/png',
        dimensions,
        createdAt: timestamp,
        capturedAt: timestamp,
        intentId: options.bindToIntent,
        relatedFiles: [],
        relatedArtifacts: [],
        tags: [],
        annotations: [],
        processingStatus: 'pending',
      };

      this.artifacts.set(artifact.id, artifact);
      
      // Generate thumbnail
      await this.generateThumbnail(artifact);
      
      // Process for OCR (async)
      this.processForOCR(artifact.id);
      
      this.saveData();
      this.emit('screenshot-captured', artifact);
      
      log.info(`[MediaWork] Screenshot captured: ${artifact.id}`);
      return artifact;
    } catch (error) {
      log.error('[MediaWork] Screenshot capture failed:', error);
      return null;
    }
  }

  private async captureFullScreen(sourceId?: string): Promise<{ data: Buffer; dimensions: { width: number; height: number } }> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    const source = sourceId 
      ? sources.find(s => s.id === sourceId) 
      : sources[0];

    if (!source) {
      throw new Error('No screen source found');
    }

    const thumbnail = source.thumbnail;
    const data = thumbnail.toPNG();
    const size = thumbnail.getSize();

    return {
      data,
      dimensions: { width: size.width, height: size.height },
    };
  }

  private async captureWindow(sourceId?: string): Promise<{ data: Buffer; dimensions: { width: number; height: number } }> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    const source = sourceId 
      ? sources.find(s => s.id === sourceId) 
      : sources[0];

    if (!source) {
      throw new Error('No window source found');
    }

    const thumbnail = source.thumbnail;
    const data = thumbnail.toPNG();
    const size = thumbnail.getSize();

    return {
      data,
      dimensions: { width: size.width, height: size.height },
    };
  }

  private async captureRegion(
    region: { x: number; y: number; width: number; height: number }
  ): Promise<{ data: Buffer; dimensions: { width: number; height: number } }> {
    // Capture full screen first, then crop
    const fullScreen = await this.captureFullScreen();
    
    // In a real implementation, we'd crop the image
    // For now, return full screen
    return {
      data: fullScreen.data,
      dimensions: { width: region.width, height: region.height },
    };
  }

  /**
   * Get available capture sources
   */
  async getCaptureSources(): Promise<Array<{
    id: string;
    name: string;
    type: 'screen' | 'window';
    thumbnail?: string;
  }>> {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
    });

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen') ? 'screen' as const : 'window' as const,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  }

  // -------------------------------------------------------------------------
  // RECORDING
  // -------------------------------------------------------------------------

  /**
   * Start recording
   */
  async startRecording(options: RecordingOptions): Promise<{ success: boolean; error?: string }> {
    if (this.recordingState.isRecording) {
      return { success: false, error: 'Recording already in progress' };
    }

    try {
      const timestamp = Date.now();
      const artifactId = crypto.randomUUID();
      
      // Create artifact placeholder
      const artifact: MediaArtifact = {
        id: artifactId,
        type: options.type === 'audio' ? 'audio-recording' : 'screen-recording',
        name: `Recording ${new Date(timestamp).toLocaleString()}`,
        filePath: path.join(this.mediaPath, `recording-${timestamp}.webm`),
        fileSize: 0,
        mimeType: options.type === 'audio' ? 'audio/webm' : 'video/webm',
        createdAt: timestamp,
        capturedAt: timestamp,
        intentId: options.bindToIntent,
        relatedFiles: [],
        relatedArtifacts: [],
        tags: [],
        annotations: [],
        processingStatus: 'pending',
      };

      this.artifacts.set(artifactId, artifact);

      // Update recording state
      this.recordingState = {
        isRecording: true,
        type: options.type,
        startedAt: timestamp,
        duration: 0,
        artifactId,
      };

      // Start duration timer
      this.recordingTimer = setInterval(() => {
        this.recordingState.duration++;
        this.emit('recording-progress', {
          duration: this.recordingState.duration,
          artifactId,
        });

        // Check max duration
        if (options.maxDuration && this.recordingState.duration >= options.maxDuration) {
          this.stopRecording();
        }
      }, 1000);

      this.emit('recording-started', { artifactId, type: options.type });
      log.info(`[MediaWork] Recording started: ${artifactId}`);

      return { success: true };
    } catch (error) {
      log.error('[MediaWork] Failed to start recording:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<MediaArtifact | null> {
    if (!this.recordingState.isRecording || !this.recordingState.artifactId) {
      return null;
    }

    try {
      // Stop timer
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      const artifact = this.artifacts.get(this.recordingState.artifactId);
      if (artifact) {
        artifact.duration = this.recordingState.duration;
        artifact.processingStatus = 'completed';
        
        // In a real implementation, we'd finalize the recording file here
        // and update the file size
        
        this.saveData();
        this.emit('recording-stopped', artifact);
      }

      // Reset state
      const result = artifact || null;
      this.recordingState = { isRecording: false, duration: 0 };

      log.info(`[MediaWork] Recording stopped`);
      return result;
    } catch (error) {
      log.error('[MediaWork] Failed to stop recording:', error);
      this.recordingState = { isRecording: false, duration: 0 };
      return null;
    }
  }

  /**
   * Get recording state
   */
  getRecordingState(): RecordingState {
    return { ...this.recordingState };
  }

  // -------------------------------------------------------------------------
  // PROCESSING
  // -------------------------------------------------------------------------

  private async generateThumbnail(artifact: MediaArtifact): Promise<void> {
    try {
      if (artifact.type === 'screenshot') {
        // For screenshots, create a smaller version
        const thumbPath = path.join(this.dataPath, 'thumbnails', `${artifact.id}.png`);
        
        // In a real implementation, we'd resize the image
        // For now, just copy it
        fs.copyFileSync(artifact.filePath, thumbPath);
        
        artifact.thumbnailPath = thumbPath;
      }
    } catch (error) {
      log.warn('[MediaWork] Failed to generate thumbnail:', error);
    }
  }

  private async processForOCR(artifactId: string): Promise<void> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact || artifact.type !== 'screenshot') return;

    try {
      artifact.processingStatus = 'processing';
      
      // In a real implementation, we'd run OCR here
      // For now, mark as completed
      artifact.processingStatus = 'completed';
      artifact.ocrText = '';  // Would contain extracted text
      
      this.saveData();
      this.emit('processing-completed', { artifactId, type: 'ocr' });
    } catch (error) {
      artifact.processingStatus = 'failed';
      log.error('[MediaWork] OCR processing failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // ANNOTATION
  // -------------------------------------------------------------------------

  /**
   * Add annotation to artifact
   */
  addAnnotation(artifactId: string, annotation: Omit<MediaAnnotation, 'id' | 'createdAt'>): MediaAnnotation | null {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;

    const newAnnotation: MediaAnnotation = {
      ...annotation,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    artifact.annotations.push(newAnnotation);
    this.saveData();

    this.emit('annotation-added', { artifactId, annotation: newAnnotation });
    return newAnnotation;
  }

  /**
   * Remove annotation
   */
  removeAnnotation(artifactId: string, annotationId: string): boolean {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return false;

    const index = artifact.annotations.findIndex(a => a.id === annotationId);
    if (index === -1) return false;

    artifact.annotations.splice(index, 1);
    this.saveData();

    this.emit('annotation-removed', { artifactId, annotationId });
    return true;
  }

  // -------------------------------------------------------------------------
  // ARTIFACT MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Get artifact by ID
   */
  getArtifact(artifactId: string): MediaArtifact | null {
    return this.artifacts.get(artifactId) || null;
  }

  /**
   * List artifacts
   */
  listArtifacts(options?: {
    type?: MediaType;
    intentId?: string;
    tags?: string[];
    search?: string;
    limit?: number;
  }): MediaArtifact[] {
    let results = Array.from(this.artifacts.values());

    if (options?.type) {
      results = results.filter(a => a.type === options.type);
    }

    if (options?.intentId) {
      results = results.filter(a => a.intentId === options.intentId);
    }

    if (options?.tags && options.tags.length > 0) {
      results = results.filter(a => 
        options.tags!.some(tag => a.tags.includes(tag))
      );
    }

    if (options?.search) {
      const search = options.search.toLowerCase();
      results = results.filter(a =>
        a.name.toLowerCase().includes(search) ||
        a.description?.toLowerCase().includes(search) ||
        a.ocrText?.toLowerCase().includes(search) ||
        a.transcript?.toLowerCase().includes(search)
      );
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Update artifact metadata
   */
  updateArtifact(artifactId: string, updates: {
    name?: string;
    description?: string;
    tags?: string[];
    intentId?: string;
  }): MediaArtifact | null {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;

    if (updates.name) artifact.name = updates.name;
    if (updates.description !== undefined) artifact.description = updates.description;
    if (updates.tags) artifact.tags = updates.tags;
    if (updates.intentId !== undefined) artifact.intentId = updates.intentId;

    this.saveData();
    this.emit('artifact-updated', artifact);
    return artifact;
  }

  /**
   * Delete artifact
   */
  deleteArtifact(artifactId: string): boolean {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return false;

    // Delete file
    if (fs.existsSync(artifact.filePath)) {
      fs.unlinkSync(artifact.filePath);
    }

    // Delete thumbnail
    if (artifact.thumbnailPath && fs.existsSync(artifact.thumbnailPath)) {
      fs.unlinkSync(artifact.thumbnailPath);
    }

    this.artifacts.delete(artifactId);
    this.saveData();

    this.emit('artifact-deleted', artifactId);
    return true;
  }

  /**
   * Link artifact to another artifact
   */
  linkArtifacts(artifactId: string, relatedArtifactId: string): boolean {
    const artifact = this.artifacts.get(artifactId);
    const related = this.artifacts.get(relatedArtifactId);
    
    if (!artifact || !related) return false;

    if (!artifact.relatedArtifacts.includes(relatedArtifactId)) {
      artifact.relatedArtifacts.push(relatedArtifactId);
    }
    if (!related.relatedArtifacts.includes(artifactId)) {
      related.relatedArtifacts.push(artifactId);
    }

    this.saveData();
    return true;
  }

  // -------------------------------------------------------------------------
  // PIPELINES
  // -------------------------------------------------------------------------

  /**
   * Create a media pipeline
   */
  createPipeline(params: Omit<MediaPipeline, 'id'>): MediaPipeline {
    const pipeline: MediaPipeline = {
      ...params,
      id: crypto.randomUUID(),
    };

    this.pipelines.set(pipeline.id, pipeline);
    this.saveData();

    this.emit('pipeline-created', pipeline);
    return pipeline;
  }

  /**
   * Get all pipelines
   */
  listPipelines(): MediaPipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Execute a pipeline
   */
  async executePipeline(pipelineId: string): Promise<MediaArtifact | null> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || !pipeline.enabled) return null;

    // Execute based on capture type
    if ('type' in pipeline.capture) {
      if (pipeline.capture.type === 'screen' || 
          pipeline.capture.type === 'audio' || 
          pipeline.capture.type === 'screen-audio') {
        // This is a recording pipeline
        await this.startRecording(pipeline.capture as RecordingOptions);
        return null;  // Recording continues asynchronously
      } else {
        // This is a capture pipeline
        return this.captureScreenshot(pipeline.capture as CaptureOptions);
      }
    }

    return null;
  }

  /**
   * Delete pipeline
   */
  deletePipeline(pipelineId: string): boolean {
    if (!this.pipelines.has(pipelineId)) return false;
    
    this.pipelines.delete(pipelineId);
    this.saveData();

    this.emit('pipeline-deleted', pipelineId);
    return true;
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Capture sources
    ipcMain.handle('media:getCaptureSources', () => this.getCaptureSources());

    // Screenshots
    ipcMain.handle('media:captureScreenshot', async (_, options) => 
      this.captureScreenshot(options));

    // Recording
    ipcMain.handle('media:startRecording', async (_, options) => 
      this.startRecording(options));
    ipcMain.handle('media:stopRecording', () => this.stopRecording());
    ipcMain.handle('media:getRecordingState', () => this.getRecordingState());

    // Artifacts
    ipcMain.handle('media:getArtifact', (_, id) => this.getArtifact(id));
    ipcMain.handle('media:listArtifacts', (_, options) => this.listArtifacts(options));
    ipcMain.handle('media:updateArtifact', (_, id, updates) => 
      this.updateArtifact(id, updates));
    ipcMain.handle('media:deleteArtifact', (_, id) => this.deleteArtifact(id));
    ipcMain.handle('media:linkArtifacts', (_, id, relatedId) => 
      this.linkArtifacts(id, relatedId));

    // Annotations
    ipcMain.handle('media:addAnnotation', (_, artifactId, annotation) => 
      this.addAnnotation(artifactId, annotation));
    ipcMain.handle('media:removeAnnotation', (_, artifactId, annotationId) => 
      this.removeAnnotation(artifactId, annotationId));

    // Pipelines
    ipcMain.handle('media:createPipeline', (_, params) => this.createPipeline(params));
    ipcMain.handle('media:listPipelines', () => this.listPipelines());
    ipcMain.handle('media:executePipeline', (_, id) => this.executePipeline(id));
    ipcMain.handle('media:deletePipeline', (_, id) => this.deletePipeline(id));
  }
}

// Singleton instance
export const mediaWorkManager = new MediaWorkManagerClass();

export async function initializeMediaWork(): Promise<void> {
  return mediaWorkManager.initialize();
}

export function shutdownMediaWork(): void {
  mediaWorkManager.shutdown();
}
