// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Media Workspace
// Phase 41: Universal media handling for documents, images, audio, video
// ===========================================================================

import log from 'electron-log';
import { app, shell, BrowserWindow, dialog, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'unknown';

export interface MediaInfo {
  path: string;
  name: string;
  extension: string;
  type: MediaType;
  size: number;
  mimeType: string;
  metadata: MediaMetadata;
  thumbnail?: string;
  lastAccessed: number;
}

export interface MediaMetadata {
  // Image metadata
  width?: number;
  height?: number;
  colorSpace?: string;
  hasAlpha?: boolean;

  // Audio/Video metadata
  duration?: number;
  bitrate?: number;
  codec?: string;
  channels?: number;
  sampleRate?: number;
  frameRate?: number;

  // Document metadata
  pageCount?: number;
  author?: string;
  title?: string;
  createdDate?: number;

  // Archive metadata
  fileCount?: number;
  compressedSize?: number;
  compressionRatio?: number;
}

export interface PreviewOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  streamLargeFiles?: boolean;
  autoPlay?: boolean;
}

export interface MediaPreviewResult {
  success: boolean;
  type: MediaType;
  path: string;
  dataUrl?: string;
  streamUrl?: string;
  metadata: MediaMetadata;
  error?: string;
}

// ===========================================================================
// MIME TYPE MAPPINGS
// ===========================================================================

const MIME_TYPES: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',

  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',

  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/mp4',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
};

const TYPE_BY_MIME_PREFIX: Record<string, MediaType> = {
  'image/': 'image',
  'audio/': 'audio',
  'video/': 'video',
  'text/': 'document',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats': 'document',
  'application/vnd.ms': 'document',
  'application/json': 'document',
  'application/xml': 'document',
  'application/zip': 'archive',
  'application/x-rar': 'archive',
  'application/x-7z': 'archive',
  'application/x-tar': 'archive',
  'application/gzip': 'archive',
};

// ===========================================================================
// SIZE THRESHOLDS
// ===========================================================================

const SIZE_THRESHOLDS = {
  // Files larger than this are streamed, not fully loaded
  streamThreshold: 50 * 1024 * 1024, // 50MB
  
  // Max file size for thumbnail generation
  thumbnailMaxSize: 100 * 1024 * 1024, // 100MB
  
  // Max dimension for image preview
  previewMaxDimension: 2000,
  
  // Chunk size for streaming
  streamChunkSize: 1024 * 1024, // 1MB
};

// ===========================================================================
// STORE
// ===========================================================================

const mediaStore = new Store<{
  recentMedia: MediaInfo[];
  thumbnailCache: Record<string, string>;
  previewHistory: string[];
  settings: {
    autoPlay: boolean;
    showThumbnails: boolean;
    streamLargeFiles: boolean;
    maxRecentItems: number;
  };
}>({
  name: 'media-workspace',
  defaults: {
    recentMedia: [],
    thumbnailCache: {},
    previewHistory: [],
    settings: {
      autoPlay: false,
      showThumbnails: true,
      streamLargeFiles: true,
      maxRecentItems: 50,
    },
  },
});

// ===========================================================================
// MEDIA WORKSPACE
// ===========================================================================

class MediaWorkspace {
  private static instance: MediaWorkspace;
  private initialized = false;

  private constructor() {}

  static getInstance(): MediaWorkspace {
    if (!MediaWorkspace.instance) {
      MediaWorkspace.instance = new MediaWorkspace();
    }
    return MediaWorkspace.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Clean up old thumbnails periodically
    this.cleanThumbnailCache();

    this.initialized = true;
    log.info('[MediaWorkspace] Initialized');
  }

  // -------------------------------------------------------------------------
  // FILE TYPE DETECTION
  // -------------------------------------------------------------------------

  getMediaType(filePath: string): MediaType {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    for (const [prefix, type] of Object.entries(TYPE_BY_MIME_PREFIX)) {
      if (mimeType.startsWith(prefix) || mimeType === prefix) {
        return type;
      }
    }

    return 'unknown';
  }

  getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  // -------------------------------------------------------------------------
  // FILE INFO
  // -------------------------------------------------------------------------

  async getMediaInfo(filePath: string): Promise<MediaInfo | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) return null;

      const ext = path.extname(filePath).toLowerCase();
      const type = this.getMediaType(filePath);
      const mimeType = this.getMimeType(filePath);

      const info: MediaInfo = {
        path: filePath,
        name: path.basename(filePath),
        extension: ext,
        type,
        size: stats.size,
        mimeType,
        metadata: await this.extractMetadata(filePath, type, stats.size),
        lastAccessed: Date.now(),
      };

      // Add to recent
      this.addToRecent(info);

      return info;
    } catch (error) {
      log.error('[MediaWorkspace] Failed to get media info:', error);
      return null;
    }
  }

  private async extractMetadata(
    filePath: string,
    type: MediaType,
    size: number
  ): Promise<MediaMetadata> {
    const metadata: MediaMetadata = {};

    try {
      switch (type) {
        case 'image':
          // Use Electron's nativeImage for basic image info
          if (size < SIZE_THRESHOLDS.thumbnailMaxSize) {
            const image = nativeImage.createFromPath(filePath);
            if (!image.isEmpty()) {
              const imageSize = image.getSize();
              metadata.width = imageSize.width;
              metadata.height = imageSize.height;
            }
          }
          break;

        case 'document':
          // Basic document metadata
          const ext = path.extname(filePath).toLowerCase();
          if (ext === '.txt' || ext === '.md' || ext === '.json') {
            // Text files - could count lines
            const content = await fs.promises.readFile(filePath, 'utf-8');
            metadata.pageCount = Math.ceil(content.length / 3000); // Rough estimate
          }
          break;

        // Audio/Video metadata would require additional libraries
        // We keep it safe and use OS-native players
      }
    } catch (error) {
      // Metadata extraction is optional, don't fail
    }

    return metadata;
  }

  // -------------------------------------------------------------------------
  // PREVIEW GENERATION
  // -------------------------------------------------------------------------

  async preview(
    filePath: string,
    options: PreviewOptions = {}
  ): Promise<MediaPreviewResult> {
    const {
      maxWidth = 800,
      maxHeight = 600,
      quality = 80,
      streamLargeFiles = true,
    } = options;

    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        return {
          success: false,
          type: 'unknown',
          path: filePath,
          metadata: {},
          error: 'Not a file',
        };
      }

      const type = this.getMediaType(filePath);
      const info = await this.getMediaInfo(filePath);
      const metadata = info?.metadata || {};

      // Large file handling
      const shouldStream = streamLargeFiles && stats.size > SIZE_THRESHOLDS.streamThreshold;

      switch (type) {
        case 'image':
          return this.previewImage(filePath, maxWidth, maxHeight, quality, metadata);

        case 'video':
        case 'audio':
          // Use file:// protocol for media - let Chromium handle codecs
          return {
            success: true,
            type,
            path: filePath,
            streamUrl: `file://${filePath}`,
            metadata,
          };

        case 'document':
          return this.previewDocument(filePath, metadata);

        case 'archive':
          return {
            success: true,
            type,
            path: filePath,
            metadata,
          };

        default:
          return {
            success: false,
            type,
            path: filePath,
            metadata,
            error: 'Unsupported media type',
          };
      }
    } catch (error) {
      return {
        success: false,
        type: 'unknown',
        path: filePath,
        metadata: {},
        error: (error as Error).message,
      };
    }
  }

  private async previewImage(
    filePath: string,
    maxWidth: number,
    maxHeight: number,
    quality: number,
    metadata: MediaMetadata
  ): Promise<MediaPreviewResult> {
    try {
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) {
        return {
          success: false,
          type: 'image',
          path: filePath,
          metadata,
          error: 'Failed to load image',
        };
      }

      const size = image.getSize();
      
      // Resize if needed
      let resized = image;
      if (size.width > maxWidth || size.height > maxHeight) {
        const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
        resized = image.resize({
          width: Math.round(size.width * scale),
          height: Math.round(size.height * scale),
          quality: 'good',
        });
      }

      const dataUrl = resized.toDataURL();

      return {
        success: true,
        type: 'image',
        path: filePath,
        dataUrl,
        metadata: {
          ...metadata,
          width: size.width,
          height: size.height,
        },
      };
    } catch (error) {
      return {
        success: false,
        type: 'image',
        path: filePath,
        metadata,
        error: (error as Error).message,
      };
    }
  }

  private async previewDocument(
    filePath: string,
    metadata: MediaMetadata
  ): Promise<MediaPreviewResult> {
    const ext = path.extname(filePath).toLowerCase();

    // Text-based documents can be read directly
    if (['.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts'].includes(ext)) {
      try {
        // Only read first 100KB for preview
        const handle = await fs.promises.open(filePath, 'r');
        const buffer = Buffer.alloc(100 * 1024);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        await handle.close();

        const content = buffer.toString('utf-8', 0, bytesRead);

        return {
          success: true,
          type: 'document',
          path: filePath,
          dataUrl: `data:text/plain;base64,${Buffer.from(content).toString('base64')}`,
          metadata,
        };
      } catch (error) {
        // Fall through to default
      }
    }

    // For PDFs and Office docs, use system viewer
    return {
      success: true,
      type: 'document',
      path: filePath,
      metadata,
    };
  }

  // -------------------------------------------------------------------------
  // THUMBNAIL GENERATION
  // -------------------------------------------------------------------------

  async getThumbnail(filePath: string, size: number = 128): Promise<string | null> {
    const type = this.getMediaType(filePath);
    if (type !== 'image') return null;

    // Check cache
    const cacheKey = `${filePath}_${size}`;
    const cache = mediaStore.get('thumbnailCache');
    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size > SIZE_THRESHOLDS.thumbnailMaxSize) {
        return null; // Too large
      }

      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) return null;

      const thumbnail = image.resize({
        width: size,
        height: size,
        quality: 'good',
      });

      const dataUrl = thumbnail.toDataURL();

      // Cache it
      cache[cacheKey] = dataUrl;
      mediaStore.set('thumbnailCache', cache);

      return dataUrl;
    } catch (error) {
      return null;
    }
  }

  private cleanThumbnailCache(): void {
    // Limit cache size
    const cache = mediaStore.get('thumbnailCache');
    const keys = Object.keys(cache);
    
    if (keys.length > 200) {
      // Remove oldest half
      const toRemove = keys.slice(0, 100);
      toRemove.forEach(key => delete cache[key]);
      mediaStore.set('thumbnailCache', cache);
    }
  }

  // -------------------------------------------------------------------------
  // OPEN WITH SYSTEM
  // -------------------------------------------------------------------------

  async openWithSystem(filePath: string): Promise<boolean> {
    try {
      await shell.openPath(filePath);
      return true;
    } catch (error) {
      log.error('[MediaWorkspace] Failed to open file:', error);
      return false;
    }
  }

  async revealInExplorer(filePath: string): Promise<boolean> {
    try {
      shell.showItemInFolder(filePath);
      return true;
    } catch (error) {
      log.error('[MediaWorkspace] Failed to reveal file:', error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // RECENT MEDIA
  // -------------------------------------------------------------------------

  private addToRecent(info: MediaInfo): void {
    const recent = mediaStore.get('recentMedia');
    const settings = mediaStore.get('settings');

    // Remove if already exists
    const filtered = recent.filter(r => r.path !== info.path);
    
    // Add to front
    filtered.unshift(info);

    // Limit size
    const trimmed = filtered.slice(0, settings.maxRecentItems);

    mediaStore.set('recentMedia', trimmed);
  }

  getRecentMedia(limit?: number): MediaInfo[] {
    const recent = mediaStore.get('recentMedia');
    return limit ? recent.slice(0, limit) : recent;
  }

  async clearRecentMedia(): Promise<void> {
    mediaStore.set('recentMedia', []);
  }

  // -------------------------------------------------------------------------
  // SETTINGS
  // -------------------------------------------------------------------------

  getSettings(): typeof mediaStore.store['settings'] {
    return mediaStore.get('settings');
  }

  async updateSettings(updates: Partial<typeof mediaStore.store['settings']>): Promise<void> {
    const current = mediaStore.get('settings');
    mediaStore.set('settings', { ...current, ...updates });
  }

  // -------------------------------------------------------------------------
  // SUPPORTED FORMATS
  // -------------------------------------------------------------------------

  getSupportedFormats(): Record<MediaType, string[]> {
    const formats: Record<MediaType, string[]> = {
      image: [],
      video: [],
      audio: [],
      document: [],
      archive: [],
      unknown: [],
    };

    for (const [ext, mime] of Object.entries(MIME_TYPES)) {
      const type = this.getMediaType(`file${ext}`);
      if (type !== 'unknown') {
        formats[type].push(ext);
      }
    }

    return formats;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const mediaWorkspace = MediaWorkspace.getInstance();
export default mediaWorkspace;
