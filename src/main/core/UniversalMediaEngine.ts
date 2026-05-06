// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Universal Media Engine
// Single unified engine for audio, video, and image rendering
// Hardware acceleration, streaming, graceful degradation
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, nativeImage } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaEngineType = 'audio' | 'video' | 'image';
export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
export type DecodeMode = 'hardware' | 'software' | 'auto';

export interface MediaSource {
  id: string;
  path: string;
  type: MediaEngineType;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  isStreaming: boolean;
  loadedAt: number;
}

export interface StreamChunk {
  id: string;
  sourceId: string;
  offset: number;
  size: number;
  data?: Buffer;
  isLast: boolean;
}

export interface EngineCapabilities {
  hardwareAcceleration: boolean;
  supportedAudioFormats: string[];
  supportedVideoFormats: string[];
  supportedImageFormats: string[];
  maxConcurrentStreams: number;
  supportsHDR: boolean;
  supportsWebM: boolean;
  supportsHEVC: boolean;
}

export interface PlaybackOptions {
  startPosition?: number;
  volume?: number;
  muted?: boolean;
  loop?: boolean;
  playbackRate?: number;
  preferHardwareDecode?: boolean;
}

export interface RenderRequest {
  sourceId: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface RenderResult {
  sourceId: string;
  dataUrl?: string;
  buffer?: Buffer;
  width: number;
  height: number;
  format: string;
}

export interface EngineStats {
  activeSources: number;
  streamingSources: number;
  memoryUsage: number;
  cpuUsage: number;
  gpuUsage: number;
  droppedFrames: number;
  bufferHealth: number;
}

export interface EngineConfig {
  decodeMode: DecodeMode;
  maxMemoryUsage: number; // MB
  streamChunkSize: number; // bytes
  streamBufferSize: number; // chunks
  preloadDuration: number; // seconds
  enableHDR: boolean;
  enableDeinterlace: boolean;
  maxConcurrentLoads: number;
  backgroundPlaybackAllowed: boolean;
}

export interface FormatSupport {
  format: string;
  mimeType: string;
  canDecode: boolean;
  canEncode: boolean;
  hardwareAccelerated: boolean;
}

// ===========================================================================
// FORMAT DEFINITIONS
// ===========================================================================

const AUDIO_FORMATS: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.webm': 'audio/webm',
};

const VIDEO_FORMATS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
};

const IMAGE_FORMATS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.raw': 'image/raw',
};

// Stream threshold: files larger than this are streamed
const STREAM_THRESHOLD = 50 * 1024 * 1024; // 50MB

// ===========================================================================
// UNIVERSAL MEDIA ENGINE
// ===========================================================================

class UniversalMediaEngineClass extends EventEmitter {
  private sources: Map<string, MediaSource> = new Map();
  private streamHandles: Map<string, fs.FileHandle> = new Map();
  private config: EngineConfig;
  private capabilities: EngineCapabilities;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private activeStreams = 0;
  private memoryUsage = 0;
  private loadQueue: string[] = [];
  private isProcessingQueue = false;
  
  // Performance tracking
  private droppedFrames = 0;
  private lastFrameTime = 0;
  private frameCount = 0;

  constructor() {
    super();
    
    this.config = {
      decodeMode: 'auto',
      maxMemoryUsage: 512, // MB
      streamChunkSize: 1024 * 1024, // 1MB
      streamBufferSize: 5,
      preloadDuration: 5, // seconds
      enableHDR: true,
      enableDeinterlace: false,
      maxConcurrentLoads: 3,
      backgroundPlaybackAllowed: false,
    };
    
    this.capabilities = {
      hardwareAcceleration: true,
      supportedAudioFormats: Object.keys(AUDIO_FORMATS),
      supportedVideoFormats: Object.keys(VIDEO_FORMATS),
      supportedImageFormats: Object.keys(IMAGE_FORMATS),
      maxConcurrentStreams: 4,
      supportsHDR: true,
      supportsWebM: true,
      supportsHEVC: false, // Requires license
    };
    
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'media-engine');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await fs.mkdir(path.join(this.dataPath, 'cache'), { recursive: true });
      await this.loadConfig();
      await this.detectCapabilities();
      
      log.info('[MediaEngine] Initialized');
      log.info(`[MediaEngine] Hardware acceleration: ${this.capabilities.hardwareAcceleration}`);
    } catch (error) {
      log.error('[MediaEngine] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Source management
    ipcMain.handle('engine:load', async (_event, filePath: string, options?: PlaybackOptions) => {
      return this.loadSource(filePath, options);
    });

    ipcMain.handle('engine:unload', async (_event, sourceId: string) => {
      return this.unloadSource(sourceId);
    });

    ipcMain.handle('engine:unloadAll', () => this.unloadAll());

    // Streaming
    ipcMain.handle('engine:stream', async (_event, filePath: string) => {
      return this.createStream(filePath);
    });

    ipcMain.handle('engine:readChunk', async (_event, sourceId: string, offset: number, size?: number) => {
      return this.readStreamChunk(sourceId, offset, size);
    });

    ipcMain.handle('engine:closeStream', async (_event, sourceId: string) => {
      return this.closeStream(sourceId);
    });

    // Rendering
    ipcMain.handle('engine:render', async (_event, request: RenderRequest) => {
      return this.renderImage(request);
    });

    ipcMain.handle('engine:thumbnail', async (_event, filePath: string, width?: number, height?: number) => {
      return this.generateThumbnail(filePath, width, height);
    });

    // Format support
    ipcMain.handle('engine:canPlay', (_event, filePath: string) => {
      return this.canPlayFile(filePath);
    });

    ipcMain.handle('engine:getFormat', (_event, filePath: string) => {
      return this.getFormatInfo(filePath);
    });

    ipcMain.handle('engine:getSupportedFormats', () => this.getSupportedFormats());

    // Capabilities
    ipcMain.handle('engine:getCapabilities', () => this.capabilities);
    ipcMain.handle('engine:getStats', () => this.getStats());

    // Configuration
    ipcMain.handle('engine:getConfig', () => this.config);
    ipcMain.handle('engine:updateConfig', async (_event, updates: Partial<EngineConfig>) => {
      return this.updateConfig(updates);
    });
  }

  // -------------------------------------------------------------------------
  // SOURCE LOADING
  // -------------------------------------------------------------------------

  async loadSource(filePath: string, options?: PlaybackOptions): Promise<MediaSource | null> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    
    try {
      // Check if already loaded
      const existingId = this.findSourceByPath(absolutePath);
      if (existingId) {
        return this.sources.get(existingId) || null;
      }
      
      // Check concurrent load limit
      if (this.loadQueue.length >= this.config.maxConcurrentLoads) {
        this.loadQueue.push(absolutePath);
        return null;
      }
      
      const stats = await fs.stat(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const type = this.getMediaType(ext);
      
      if (!type) {
        log.warn(`[MediaEngine] Unsupported format: ${ext}`);
        return null;
      }
      
      const mimeType = this.getMimeType(ext) || 'application/octet-stream';
      const isStreaming = stats.size > STREAM_THRESHOLD;
      
      const source: MediaSource = {
        id: this.generateId(),
        path: absolutePath,
        type,
        mimeType,
        size: stats.size,
        isStreaming,
        loadedAt: Date.now(),
      };
      
      // Get media-specific metadata
      if (type === 'image') {
        const dimensions = await this.getImageDimensions(absolutePath);
        if (dimensions) {
          source.width = dimensions.width;
          source.height = dimensions.height;
        }
      }
      
      // Track memory
      if (!isStreaming) {
        this.memoryUsage += stats.size / (1024 * 1024);
        
        // Check memory limit
        if (this.memoryUsage > this.config.maxMemoryUsage) {
          await this.evictOldestSource();
        }
      }
      
      this.sources.set(source.id, source);
      this.emit('sourceLoaded', source);
      
      log.info(`[MediaEngine] Loaded source: ${source.id} (${type}, ${this.formatBytes(stats.size)})`);
      
      // Process queue
      this.processLoadQueue();
      
      return source;
    } catch (error) {
      log.error(`[MediaEngine] Failed to load source: ${filePath}`, error);
      this.emit('error', { type: 'load', path: filePath, error });
      return null;
    }
  }

  async unloadSource(sourceId: string): Promise<boolean> {
    const source = this.sources.get(sourceId);
    if (!source) return false;
    
    // Close any open stream
    await this.closeStream(sourceId);
    
    // Update memory tracking
    if (!source.isStreaming) {
      this.memoryUsage -= source.size / (1024 * 1024);
      this.memoryUsage = Math.max(0, this.memoryUsage);
    }
    
    this.sources.delete(sourceId);
    this.emit('sourceUnloaded', sourceId);
    
    log.info(`[MediaEngine] Unloaded source: ${sourceId}`);
    return true;
  }

  async unloadAll(): Promise<void> {
    // Close all streams
    for (const sourceId of this.streamHandles.keys()) {
      await this.closeStream(sourceId);
    }
    
    this.sources.clear();
    this.memoryUsage = 0;
    this.loadQueue = [];
    
    this.emit('allUnloaded');
    log.info('[MediaEngine] All sources unloaded');
  }

  private async evictOldestSource(): Promise<void> {
    // Find oldest non-streaming source
    let oldest: MediaSource | null = null;
    let oldestTime = Infinity;
    
    for (const source of this.sources.values()) {
      if (!source.isStreaming && source.loadedAt < oldestTime) {
        oldest = source;
        oldestTime = source.loadedAt;
      }
    }
    
    if (oldest) {
      await this.unloadSource(oldest.id);
      log.info(`[MediaEngine] Evicted source due to memory pressure: ${oldest.id}`);
    }
  }

  private processLoadQueue(): void {
    if (this.isProcessingQueue || this.loadQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    const nextPath = this.loadQueue.shift();
    if (nextPath) {
      this.loadSource(nextPath).finally(() => {
        this.isProcessingQueue = false;
        this.processLoadQueue();
      });
    } else {
      this.isProcessingQueue = false;
    }
  }

  // -------------------------------------------------------------------------
  // STREAMING
  // -------------------------------------------------------------------------

  async createStream(filePath: string): Promise<MediaSource | null> {
    const source = await this.loadSource(filePath);
    if (!source) return null;
    
    if (!source.isStreaming) {
      // File is small enough to load entirely
      return source;
    }
    
    try {
      // Open file handle for streaming
      const handle = await fs.open(filePath, 'r');
      this.streamHandles.set(source.id, handle);
      this.activeStreams++;
      
      this.emit('streamCreated', source.id);
      log.info(`[MediaEngine] Created stream: ${source.id}`);
      
      return source;
    } catch (error) {
      log.error(`[MediaEngine] Failed to create stream: ${filePath}`, error);
      return null;
    }
  }

  async readStreamChunk(sourceId: string, offset: number, size?: number): Promise<StreamChunk | null> {
    const source = this.sources.get(sourceId);
    const handle = this.streamHandles.get(sourceId);
    
    if (!source) {
      log.warn(`[MediaEngine] Source not found: ${sourceId}`);
      return null;
    }
    
    const chunkSize = size || this.config.streamChunkSize;
    const isLast = offset + chunkSize >= source.size;
    const actualSize = isLast ? source.size - offset : chunkSize;
    
    try {
      let data: Buffer;
      
      if (handle) {
        // Streaming read
        data = Buffer.alloc(actualSize);
        await handle.read(data, 0, actualSize, offset);
      } else {
        // Direct read for non-streaming files
        const fullData = await fs.readFile(source.path);
        data = fullData.subarray(offset, offset + actualSize);
      }
      
      return {
        id: this.generateId(),
        sourceId,
        offset,
        size: actualSize,
        data,
        isLast,
      };
    } catch (error) {
      log.error(`[MediaEngine] Failed to read chunk: ${sourceId}`, error);
      return null;
    }
  }

  async closeStream(sourceId: string): Promise<void> {
    const handle = this.streamHandles.get(sourceId);
    
    if (handle) {
      try {
        await handle.close();
      } catch (error) {
        log.error(`[MediaEngine] Failed to close stream: ${sourceId}`, error);
      }
      
      this.streamHandles.delete(sourceId);
      this.activeStreams = Math.max(0, this.activeStreams - 1);
      
      this.emit('streamClosed', sourceId);
      log.info(`[MediaEngine] Closed stream: ${sourceId}`);
    }
  }

  // -------------------------------------------------------------------------
  // IMAGE RENDERING
  // -------------------------------------------------------------------------

  async renderImage(request: RenderRequest): Promise<RenderResult | null> {
    const source = this.sources.get(request.sourceId);
    
    if (!source || source.type !== 'image') {
      log.warn(`[MediaEngine] Invalid image source: ${request.sourceId}`);
      return null;
    }
    
    try {
      const image = nativeImage.createFromPath(source.path);
      
      if (image.isEmpty()) {
        return null;
      }
      
      const originalSize = image.getSize();
      let targetWidth = request.width || originalSize.width;
      let targetHeight = request.height || originalSize.height;
      
      // Maintain aspect ratio
      if (request.width && !request.height) {
        targetHeight = Math.round(originalSize.height * (request.width / originalSize.width));
      } else if (request.height && !request.width) {
        targetWidth = Math.round(originalSize.width * (request.height / originalSize.height));
      }
      
      // Resize if needed
      let finalImage = image;
      if (targetWidth !== originalSize.width || targetHeight !== originalSize.height) {
        finalImage = image.resize({ width: targetWidth, height: targetHeight });
      }
      
      const format = request.format || 'jpeg';
      const quality = request.quality || 85;
      
      let dataUrl: string;
      let buffer: Buffer;
      
      switch (format) {
        case 'png':
          buffer = finalImage.toPNG();
          dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
          break;
        case 'webp':
          // Electron doesn't support webp export, fall back to jpeg
          buffer = finalImage.toJPEG(quality);
          dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          break;
        default:
          buffer = finalImage.toJPEG(quality);
          dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
      
      return {
        sourceId: request.sourceId,
        dataUrl,
        buffer,
        width: targetWidth,
        height: targetHeight,
        format,
      };
    } catch (error) {
      log.error(`[MediaEngine] Failed to render image: ${request.sourceId}`, error);
      return null;
    }
  }

  async generateThumbnail(filePath: string, width = 200, height?: number): Promise<string | null> {
    try {
      const image = nativeImage.createFromPath(filePath);
      
      if (image.isEmpty()) {
        return null;
      }
      
      const originalSize = image.getSize();
      let targetWidth = width;
      let targetHeight = height;
      
      if (!targetHeight) {
        targetHeight = Math.round(originalSize.height * (width / originalSize.width));
      }
      
      const resized = image.resize({ width: targetWidth, height: targetHeight });
      const buffer = resized.toJPEG(75);
      
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (error) {
      log.error(`[MediaEngine] Failed to generate thumbnail: ${filePath}`, error);
      return null;
    }
  }

  private async getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
    try {
      const image = nativeImage.createFromPath(filePath);
      
      if (image.isEmpty()) {
        return null;
      }
      
      return image.getSize();
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // FORMAT DETECTION & SUPPORT
  // -------------------------------------------------------------------------

  canPlayFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.isSupported(ext);
  }

  isSupported(extension: string): boolean {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return (
      ext in AUDIO_FORMATS ||
      ext in VIDEO_FORMATS ||
      ext in IMAGE_FORMATS
    );
  }

  getMediaType(extension: string): MediaEngineType | null {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    
    if (ext in AUDIO_FORMATS) return 'audio';
    if (ext in VIDEO_FORMATS) return 'video';
    if (ext in IMAGE_FORMATS) return 'image';
    
    return null;
  }

  getMimeType(extension: string): string | null {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    
    return AUDIO_FORMATS[ext] || VIDEO_FORMATS[ext] || IMAGE_FORMATS[ext] || null;
  }

  getFormatInfo(filePath: string): FormatSupport | null {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(ext);
    
    if (!mimeType) return null;
    
    const isHardwareAccelerated = this.isHardwareAccelerated(ext);
    
    return {
      format: ext,
      mimeType,
      canDecode: true,
      canEncode: ext in IMAGE_FORMATS,
      hardwareAccelerated: isHardwareAccelerated,
    };
  }

  getSupportedFormats(): { audio: string[]; video: string[]; image: string[] } {
    return {
      audio: Object.keys(AUDIO_FORMATS),
      video: Object.keys(VIDEO_FORMATS),
      image: Object.keys(IMAGE_FORMATS),
    };
  }

  private isHardwareAccelerated(extension: string): boolean {
    // Common formats with hardware decode support
    const hwFormats = [
      '.mp4', '.m4v', '.mov', // H.264
      '.webm', // VP8/VP9
      '.mp3', '.m4a', '.aac', // Audio
    ];
    
    return hwFormats.includes(extension);
  }

  // -------------------------------------------------------------------------
  // CAPABILITIES DETECTION
  // -------------------------------------------------------------------------

  private async detectCapabilities(): Promise<void> {
    // Check for hardware acceleration
    // Note: Actual detection would require more platform-specific checks
    this.capabilities.hardwareAcceleration = true;
    
    // Update supported formats based on platform
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS supports HEVC with hardware decode
      this.capabilities.supportsHEVC = true;
    }
    
    log.info('[MediaEngine] Capabilities detected:', this.capabilities);
  }

  // -------------------------------------------------------------------------
  // STATS & MONITORING
  // -------------------------------------------------------------------------

  getStats(): EngineStats {
    return {
      activeSources: this.sources.size,
      streamingSources: this.activeStreams,
      memoryUsage: this.memoryUsage,
      cpuUsage: 0, // Would need platform-specific measurement
      gpuUsage: 0, // Would need platform-specific measurement
      droppedFrames: this.droppedFrames,
      bufferHealth: 1.0, // 0-1 scale
    };
  }

  reportDroppedFrame(): void {
    this.droppedFrames++;
    this.emit('frameDropped', this.droppedFrames);
    
    if (this.droppedFrames % 10 === 0) {
      log.warn(`[MediaEngine] Dropped frames: ${this.droppedFrames}`);
    }
  }

  resetStats(): void {
    this.droppedFrames = 0;
    this.frameCount = 0;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async loadConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const saved = JSON.parse(data);
      this.config = { ...this.config, ...saved };
    } catch {
      // Use defaults
    }
  }

  async saveConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
  }

  async updateConfig(updates: Partial<EngineConfig>): Promise<EngineConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('configUpdated', this.config);
    return this.config;
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private findSourceByPath(filePath: string): string | null {
    for (const [id, source] of this.sources) {
      if (source.path === filePath) {
        return id;
      }
    }
    return null;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.unloadAll();
    await this.saveConfig();
    log.info('[MediaEngine] Shutdown complete');
  }

  getSource(sourceId: string): MediaSource | null {
    return this.sources.get(sourceId) || null;
  }

  getAllSources(): MediaSource[] {
    return Array.from(this.sources.values());
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const UniversalMediaEngine = new UniversalMediaEngineClass();
export default UniversalMediaEngine;
