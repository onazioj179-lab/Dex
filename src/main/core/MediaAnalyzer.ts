// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Media Analyzer Service
// Phase 38: Deep media understanding for images, video, and audio
// Local analysis only, no uploads, incremental and cached
// ===========================================================================

import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { app, nativeImage } from 'electron';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ImageAnalysis {
  path: string;
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  hasAlpha: boolean;
  colorDepth: number;
  fileSize: number;
  thumbnail?: string;  // Base64 data URL
  analyzedAt: Date;
}

export interface VideoAnalysis {
  path: string;
  duration: number;     // seconds
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  bitrate: number;
  hasAudio: boolean;
  audioCodec?: string;
  fileSize: number;
  thumbnail?: string;
  analyzedAt: Date;
}

export interface AudioAnalysis {
  path: string;
  duration: number;     // seconds
  codec: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  fileSize: number;
  waveform?: number[];  // Simplified amplitude data
  analyzedAt: Date;
}

export interface DocumentAnalysis {
  path: string;
  pageCount?: number;
  wordCount?: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdDate?: Date;
  modifiedDate?: Date;
  fileSize: number;
  preview?: string;     // First page thumbnail
  analyzedAt: Date;
}

type MediaType = 'image' | 'video' | 'audio' | 'document';

// -----------------------------------------------------------------------------
// Media Analyzer Service
// -----------------------------------------------------------------------------

export class MediaAnalyzerService extends EventEmitter {
  private static instance: MediaAnalyzerService;
  
  private imageCache: Map<string, ImageAnalysis> = new Map();
  private videoCache: Map<string, VideoAnalysis> = new Map();
  private audioCache: Map<string, AudioAnalysis> = new Map();
  private documentCache: Map<string, DocumentAnalysis> = new Map();
  
  private analysisQueue: Array<{ path: string; type: MediaType }> = [];
  private isProcessing = false;
  private thumbnailDir: string;
  
  private constructor() {
    super();
    this.thumbnailDir = path.join(app.getPath('userData'), 'thumbnails');
    this.ensureThumbnailDir();
  }
  
  static getInstance(): MediaAnalyzerService {
    if (!MediaAnalyzerService.instance) {
      MediaAnalyzerService.instance = new MediaAnalyzerService();
    }
    return MediaAnalyzerService.instance;
  }
  
  // -------------------------------------------------------------------------
  // Image Analysis
  // -------------------------------------------------------------------------
  
  async analyzeImage(filePath: string, generateThumbnail = true): Promise<ImageAnalysis | null> {
    // Check cache first
    const cached = this.imageCache.get(filePath);
    if (cached) {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs <= cached.analyzedAt.getTime()) {
        return cached;
      }
    }
    
    try {
      const stats = await fs.promises.stat(filePath);
      const image = nativeImage.createFromPath(filePath);
      
      if (image.isEmpty()) {
        return null;
      }
      
      const size = image.getSize();
      const ext = path.extname(filePath).toLowerCase();
      
      const analysis: ImageAnalysis = {
        path: filePath,
        width: size.width,
        height: size.height,
        aspectRatio: size.width / size.height,
        format: this.getImageFormat(ext),
        hasAlpha: this.hasAlphaChannel(ext),
        colorDepth: 24, // Assume 24-bit for most images
        fileSize: stats.size,
        analyzedAt: new Date(),
      };
      
      // Generate thumbnail
      if (generateThumbnail) {
        analysis.thumbnail = await this.generateImageThumbnail(image, filePath);
      }
      
      this.imageCache.set(filePath, analysis);
      this.emit('imageAnalyzed', analysis);
      
      return analysis;
    } catch (error) {
      log.error(`[MediaAnalyzer] Error analyzing image ${filePath}:`, error);
      return null;
    }
  }
  
  private async generateImageThumbnail(
    image: Electron.NativeImage, 
    originalPath: string
  ): Promise<string | undefined> {
    try {
      const size = image.getSize();
      const maxDim = 200;
      
      let newWidth: number;
      let newHeight: number;
      
      if (size.width > size.height) {
        newWidth = Math.min(size.width, maxDim);
        newHeight = Math.round((newWidth / size.width) * size.height);
      } else {
        newHeight = Math.min(size.height, maxDim);
        newWidth = Math.round((newHeight / size.height) * size.width);
      }
      
      const resized = image.resize({ width: newWidth, height: newHeight });
      const dataUrl = resized.toDataURL();
      
      // Also save to disk for persistence
      const thumbName = this.getThumbnailName(originalPath);
      const thumbPath = path.join(this.thumbnailDir, thumbName);
      await fs.promises.writeFile(thumbPath, resized.toPNG());
      
      return dataUrl;
    } catch (error) {
      log.error('[MediaAnalyzer] Error generating thumbnail:', error);
      return undefined;
    }
  }
  
  private getImageFormat(ext: string): string {
    const formats: Record<string, string> = {
      '.jpg': 'JPEG', '.jpeg': 'JPEG',
      '.png': 'PNG',
      '.gif': 'GIF',
      '.bmp': 'BMP',
      '.webp': 'WebP',
      '.svg': 'SVG',
      '.ico': 'ICO',
      '.tiff': 'TIFF', '.tif': 'TIFF',
      '.heic': 'HEIC', '.heif': 'HEIF',
      '.avif': 'AVIF',
      '.raw': 'RAW',
      '.psd': 'PSD',
    };
    return formats[ext] || 'Unknown';
  }
  
  private hasAlphaChannel(ext: string): boolean {
    return ['.png', '.gif', '.webp', '.svg', '.ico', '.psd'].includes(ext);
  }
  
  // -------------------------------------------------------------------------
  // Video Analysis (Basic - without FFmpeg)
  // -------------------------------------------------------------------------
  
  async analyzeVideo(filePath: string): Promise<VideoAnalysis | null> {
    // Check cache first
    const cached = this.videoCache.get(filePath);
    if (cached) {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs <= cached.analyzedAt.getTime()) {
        return cached;
      }
    }
    
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Basic video analysis without external tools
      // For deep analysis, FFmpeg integration would be needed
      const analysis: VideoAnalysis = {
        path: filePath,
        duration: 0,  // Would need FFmpeg
        width: 0,     // Would need FFmpeg
        height: 0,    // Would need FFmpeg
        frameRate: 0, // Would need FFmpeg
        codec: this.getVideoCodec(ext),
        bitrate: 0,   // Would need FFmpeg
        hasAudio: true, // Assume true
        fileSize: stats.size,
        analyzedAt: new Date(),
      };
      
      // Estimate duration from file size for common formats
      analysis.duration = this.estimateVideoDuration(stats.size, ext);
      
      this.videoCache.set(filePath, analysis);
      this.emit('videoAnalyzed', analysis);
      
      return analysis;
    } catch (error) {
      log.error(`[MediaAnalyzer] Error analyzing video ${filePath}:`, error);
      return null;
    }
  }
  
  private getVideoCodec(ext: string): string {
    const codecs: Record<string, string> = {
      '.mp4': 'H.264/AAC',
      '.mkv': 'Various',
      '.avi': 'Various',
      '.mov': 'ProRes/H.264',
      '.wmv': 'WMV',
      '.flv': 'FLV',
      '.webm': 'VP9/Opus',
      '.m4v': 'H.264',
      '.mpeg': 'MPEG',
      '.3gp': '3GP',
    };
    return codecs[ext] || 'Unknown';
  }
  
  private estimateVideoDuration(fileSize: number, ext: string): number {
    // Very rough estimate based on average bitrates
    const avgBitrates: Record<string, number> = {
      '.mp4': 5_000_000,  // 5 Mbps
      '.mkv': 8_000_000,  // 8 Mbps
      '.avi': 4_000_000,  // 4 Mbps
      '.mov': 10_000_000, // 10 Mbps
      '.webm': 3_000_000, // 3 Mbps
    };
    
    const bitrate = avgBitrates[ext] || 5_000_000;
    return Math.round((fileSize * 8) / bitrate);
  }
  
  // -------------------------------------------------------------------------
  // Audio Analysis (Basic)
  // -------------------------------------------------------------------------
  
  async analyzeAudio(filePath: string): Promise<AudioAnalysis | null> {
    // Check cache first
    const cached = this.audioCache.get(filePath);
    if (cached) {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs <= cached.analyzedAt.getTime()) {
        return cached;
      }
    }
    
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      const analysis: AudioAnalysis = {
        path: filePath,
        duration: this.estimateAudioDuration(stats.size, ext),
        codec: this.getAudioCodec(ext),
        bitrate: this.getTypicalBitrate(ext),
        sampleRate: this.getTypicalSampleRate(ext),
        channels: 2, // Assume stereo
        fileSize: stats.size,
        analyzedAt: new Date(),
      };
      
      // Try to read ID3 tags for MP3 files
      if (ext === '.mp3') {
        const tags = await this.readBasicID3Tags(filePath);
        if (tags) {
          Object.assign(analysis, tags);
        }
      }
      
      this.audioCache.set(filePath, analysis);
      this.emit('audioAnalyzed', analysis);
      
      return analysis;
    } catch (error) {
      log.error(`[MediaAnalyzer] Error analyzing audio ${filePath}:`, error);
      return null;
    }
  }
  
  private getAudioCodec(ext: string): string {
    const codecs: Record<string, string> = {
      '.mp3': 'MP3',
      '.wav': 'PCM',
      '.flac': 'FLAC',
      '.aac': 'AAC',
      '.ogg': 'Vorbis',
      '.wma': 'WMA',
      '.m4a': 'AAC',
      '.opus': 'Opus',
      '.aiff': 'AIFF',
    };
    return codecs[ext] || 'Unknown';
  }
  
  private getTypicalBitrate(ext: string): number {
    const bitrates: Record<string, number> = {
      '.mp3': 320_000,
      '.flac': 1_000_000,
      '.wav': 1_411_000,
      '.aac': 256_000,
      '.ogg': 192_000,
      '.opus': 128_000,
    };
    return bitrates[ext] || 256_000;
  }
  
  private getTypicalSampleRate(ext: string): number {
    const rates: Record<string, number> = {
      '.mp3': 44100,
      '.flac': 96000,
      '.wav': 44100,
      '.aac': 48000,
    };
    return rates[ext] || 44100;
  }
  
  private estimateAudioDuration(fileSize: number, ext: string): number {
    const bitrate = this.getTypicalBitrate(ext);
    return Math.round((fileSize * 8) / bitrate);
  }
  
  private async readBasicID3Tags(filePath: string): Promise<Partial<AudioAnalysis> | null> {
    try {
      const fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(128);
      
      // Read last 128 bytes for ID3v1
      const stats = await fd.stat();
      await fd.read(buffer, 0, 128, stats.size - 128);
      await fd.close();
      
      // Check for TAG header
      if (buffer.toString('ascii', 0, 3) !== 'TAG') {
        return null;
      }
      
      return {
        title: buffer.toString('ascii', 3, 33).replace(/\0/g, '').trim() || undefined,
        artist: buffer.toString('ascii', 33, 63).replace(/\0/g, '').trim() || undefined,
        album: buffer.toString('ascii', 63, 93).replace(/\0/g, '').trim() || undefined,
        year: parseInt(buffer.toString('ascii', 93, 97), 10) || undefined,
      };
    } catch (error) {
      return null;
    }
  }
  
  // -------------------------------------------------------------------------
  // Document Analysis (Basic)
  // -------------------------------------------------------------------------
  
  async analyzeDocument(filePath: string): Promise<DocumentAnalysis | null> {
    // Check cache first
    const cached = this.documentCache.get(filePath);
    if (cached) {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs <= cached.analyzedAt.getTime()) {
        return cached;
      }
    }
    
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      const analysis: DocumentAnalysis = {
        path: filePath,
        fileSize: stats.size,
        analyzedAt: new Date(),
      };
      
      // Text file analysis
      if (['.txt', '.md', '.json', '.xml', '.csv'].includes(ext)) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        analysis.wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
        
        // Estimate pages (250 words per page)
        analysis.pageCount = Math.ceil(analysis.wordCount / 250);
      }
      
      this.documentCache.set(filePath, analysis);
      this.emit('documentAnalyzed', analysis);
      
      return analysis;
    } catch (error) {
      log.error(`[MediaAnalyzer] Error analyzing document ${filePath}:`, error);
      return null;
    }
  }
  
  // -------------------------------------------------------------------------
  // Batch Analysis
  // -------------------------------------------------------------------------
  
  /**
   * Queue files for background analysis
   */
  queueAnalysis(files: Array<{ path: string; type: MediaType }>): void {
    this.analysisQueue.push(...files);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.analysisQueue.length > 0) {
      const item = this.analysisQueue.shift();
      if (!item) break;
      
      try {
        switch (item.type) {
          case 'image':
            await this.analyzeImage(item.path);
            break;
          case 'video':
            await this.analyzeVideo(item.path);
            break;
          case 'audio':
            await this.analyzeAudio(item.path);
            break;
          case 'document':
            await this.analyzeDocument(item.path);
            break;
        }
      } catch (error) {
        log.error(`[MediaAnalyzer] Error processing ${item.path}:`, error);
      }
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isProcessing = false;
    this.emit('queueComplete');
  }
  
  // -------------------------------------------------------------------------
  // Thumbnail Management
  // -------------------------------------------------------------------------
  
  async getThumbnail(filePath: string): Promise<string | null> {
    const thumbName = this.getThumbnailName(filePath);
    const thumbPath = path.join(this.thumbnailDir, thumbName);
    
    try {
      if (fs.existsSync(thumbPath)) {
        const data = await fs.promises.readFile(thumbPath);
        return `data:image/png;base64,${data.toString('base64')}`;
      }
    } catch (error) {
      // Thumbnail doesn't exist
    }
    
    return null;
  }
  
  private getThumbnailName(filePath: string): string {
    const hash = require('crypto')
      .createHash('md5')
      .update(filePath)
      .digest('hex');
    return `${hash}.png`;
  }
  
  private ensureThumbnailDir(): void {
    if (!fs.existsSync(this.thumbnailDir)) {
      fs.mkdirSync(this.thumbnailDir, { recursive: true });
    }
  }
  
  // -------------------------------------------------------------------------
  // Cache Management
  // -------------------------------------------------------------------------
  
  clearCache(): void {
    this.imageCache.clear();
    this.videoCache.clear();
    this.audioCache.clear();
    this.documentCache.clear();
    this.emit('cacheCleared');
  }
  
  getCacheStats() {
    return {
      images: this.imageCache.size,
      videos: this.videoCache.size,
      audio: this.audioCache.size,
      documents: this.documentCache.size,
      total: this.imageCache.size + this.videoCache.size + 
             this.audioCache.size + this.documentCache.size,
    };
  }
}

// Export singleton
export const mediaAnalyzer = MediaAnalyzerService.getInstance();
export default mediaAnalyzer;
