// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Instant File Preview System
// View files without opening external apps
// Text, code, images, audio, video - no full file load, no lag
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, nativeImage } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type PreviewType = 
  | 'text'
  | 'code'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'markdown'
  | 'json'
  | 'binary'
  | 'unsupported';

export interface PreviewResult {
  path: string;
  name: string;
  type: PreviewType;
  mimeType: string;
  size: number;
  content?: string;
  dataUrl?: string;
  metadata?: PreviewMetadata;
  truncated: boolean;
  error?: string;
}

export interface PreviewMetadata {
  encoding?: string;
  lineCount?: number;
  wordCount?: number;
  width?: number;
  height?: number;
  duration?: number;
  language?: string;
  created?: number;
  modified?: number;
}

export interface PreviewConfig {
  maxTextSize: number;       // Max bytes to load for text
  maxImageSize: number;      // Max bytes for image preview
  maxLines: number;          // Max lines to show
  thumbnailSize: number;     // Thumbnail dimension
  enableSyntaxDetection: boolean;
}

// ===========================================================================
// FILE TYPE MAPPINGS
// ===========================================================================

const EXTENSION_MAP: Record<string, { type: PreviewType; mime: string; language?: string }> = {
  // Text
  '.txt': { type: 'text', mime: 'text/plain' },
  '.log': { type: 'text', mime: 'text/plain' },
  '.csv': { type: 'text', mime: 'text/csv' },
  
  // Markdown
  '.md': { type: 'markdown', mime: 'text/markdown', language: 'markdown' },
  '.mdx': { type: 'markdown', mime: 'text/markdown', language: 'markdown' },
  
  // Code
  '.js': { type: 'code', mime: 'text/javascript', language: 'javascript' },
  '.jsx': { type: 'code', mime: 'text/javascript', language: 'javascript' },
  '.ts': { type: 'code', mime: 'text/typescript', language: 'typescript' },
  '.tsx': { type: 'code', mime: 'text/typescript', language: 'typescript' },
  '.py': { type: 'code', mime: 'text/x-python', language: 'python' },
  '.java': { type: 'code', mime: 'text/x-java', language: 'java' },
  '.c': { type: 'code', mime: 'text/x-c', language: 'c' },
  '.cpp': { type: 'code', mime: 'text/x-c++', language: 'cpp' },
  '.h': { type: 'code', mime: 'text/x-c', language: 'c' },
  '.hpp': { type: 'code', mime: 'text/x-c++', language: 'cpp' },
  '.cs': { type: 'code', mime: 'text/x-csharp', language: 'csharp' },
  '.go': { type: 'code', mime: 'text/x-go', language: 'go' },
  '.rs': { type: 'code', mime: 'text/x-rust', language: 'rust' },
  '.rb': { type: 'code', mime: 'text/x-ruby', language: 'ruby' },
  '.php': { type: 'code', mime: 'text/x-php', language: 'php' },
  '.swift': { type: 'code', mime: 'text/x-swift', language: 'swift' },
  '.kt': { type: 'code', mime: 'text/x-kotlin', language: 'kotlin' },
  '.scala': { type: 'code', mime: 'text/x-scala', language: 'scala' },
  '.sh': { type: 'code', mime: 'text/x-sh', language: 'bash' },
  '.bash': { type: 'code', mime: 'text/x-sh', language: 'bash' },
  '.zsh': { type: 'code', mime: 'text/x-sh', language: 'bash' },
  '.ps1': { type: 'code', mime: 'text/x-powershell', language: 'powershell' },
  '.bat': { type: 'code', mime: 'text/x-batch', language: 'batch' },
  '.cmd': { type: 'code', mime: 'text/x-batch', language: 'batch' },
  '.sql': { type: 'code', mime: 'text/x-sql', language: 'sql' },
  '.html': { type: 'code', mime: 'text/html', language: 'html' },
  '.htm': { type: 'code', mime: 'text/html', language: 'html' },
  '.css': { type: 'code', mime: 'text/css', language: 'css' },
  '.scss': { type: 'code', mime: 'text/x-scss', language: 'scss' },
  '.sass': { type: 'code', mime: 'text/x-sass', language: 'sass' },
  '.less': { type: 'code', mime: 'text/x-less', language: 'less' },
  '.xml': { type: 'code', mime: 'text/xml', language: 'xml' },
  '.yaml': { type: 'code', mime: 'text/yaml', language: 'yaml' },
  '.yml': { type: 'code', mime: 'text/yaml', language: 'yaml' },
  '.toml': { type: 'code', mime: 'text/toml', language: 'toml' },
  '.ini': { type: 'code', mime: 'text/ini', language: 'ini' },
  '.cfg': { type: 'code', mime: 'text/plain', language: 'ini' },
  '.conf': { type: 'code', mime: 'text/plain', language: 'ini' },
  '.dockerfile': { type: 'code', mime: 'text/x-dockerfile', language: 'dockerfile' },
  '.makefile': { type: 'code', mime: 'text/x-makefile', language: 'makefile' },
  '.r': { type: 'code', mime: 'text/x-r', language: 'r' },
  '.lua': { type: 'code', mime: 'text/x-lua', language: 'lua' },
  '.dart': { type: 'code', mime: 'text/x-dart', language: 'dart' },
  '.vue': { type: 'code', mime: 'text/x-vue', language: 'vue' },
  '.svelte': { type: 'code', mime: 'text/x-svelte', language: 'svelte' },
  
  // JSON
  '.json': { type: 'json', mime: 'application/json', language: 'json' },
  '.jsonc': { type: 'json', mime: 'application/json', language: 'json' },
  '.json5': { type: 'json', mime: 'application/json', language: 'json' },
  
  // Images
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.png': { type: 'image', mime: 'image/png' },
  '.gif': { type: 'image', mime: 'image/gif' },
  '.webp': { type: 'image', mime: 'image/webp' },
  '.bmp': { type: 'image', mime: 'image/bmp' },
  '.ico': { type: 'image', mime: 'image/x-icon' },
  '.svg': { type: 'code', mime: 'image/svg+xml', language: 'xml' },
  '.avif': { type: 'image', mime: 'image/avif' },
  
  // Audio
  '.mp3': { type: 'audio', mime: 'audio/mpeg' },
  '.wav': { type: 'audio', mime: 'audio/wav' },
  '.ogg': { type: 'audio', mime: 'audio/ogg' },
  '.flac': { type: 'audio', mime: 'audio/flac' },
  '.aac': { type: 'audio', mime: 'audio/aac' },
  '.m4a': { type: 'audio', mime: 'audio/mp4' },
  '.wma': { type: 'audio', mime: 'audio/x-ms-wma' },
  
  // Video
  '.mp4': { type: 'video', mime: 'video/mp4' },
  '.webm': { type: 'video', mime: 'video/webm' },
  '.mkv': { type: 'video', mime: 'video/x-matroska' },
  '.avi': { type: 'video', mime: 'video/x-msvideo' },
  '.mov': { type: 'video', mime: 'video/quicktime' },
  '.wmv': { type: 'video', mime: 'video/x-ms-wmv' },
  '.flv': { type: 'video', mime: 'video/x-flv' },
  '.m4v': { type: 'video', mime: 'video/mp4' },
  
  // PDF
  '.pdf': { type: 'pdf', mime: 'application/pdf' }
};

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: PreviewConfig = {
  maxTextSize: 512 * 1024,      // 512KB for text preview
  maxImageSize: 10 * 1024 * 1024, // 10MB for images
  maxLines: 500,
  thumbnailSize: 256,
  enableSyntaxDetection: true
};

// ===========================================================================
// INSTANT FILE PREVIEW
// ===========================================================================

class InstantFilePreviewClass extends EventEmitter {
  private config: PreviewConfig;
  private previewCache: Map<string, { result: PreviewResult; timestamp: number }> = new Map();
  private cacheMaxAge = 30000; // 30 seconds

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
    this.startCacheCleanup();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get file preview
    ipcMain.handle('preview:file', async (_event, filePath: string) => {
      return this.getPreview(filePath);
    });

    // Get file type info
    ipcMain.handle('preview:type', (_event, filePath: string) => {
      return this.getFileType(filePath);
    });

    // Check if file is previewable
    ipcMain.handle('preview:canPreview', (_event, filePath: string) => {
      return this.canPreview(filePath);
    });

    // Get thumbnail
    ipcMain.handle('preview:thumbnail', async (_event, filePath: string, size?: number) => {
      return this.getThumbnail(filePath, size);
    });

    // Clear cache
    ipcMain.handle('preview:clearCache', () => {
      this.previewCache.clear();
      return { success: true };
    });

    // Update config
    ipcMain.handle('preview:setConfig', (_event, config: Partial<PreviewConfig>) => {
      this.config = { ...this.config, ...config };
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // MAIN PREVIEW
  // -------------------------------------------------------------------------

  async getPreview(filePath: string): Promise<PreviewResult> {
    // Check cache
    const cached = this.previewCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.result;
    }

    const startTime = Date.now();
    
    try {
      // Get file info
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      const typeInfo = EXTENSION_MAP[ext] || { type: 'binary' as PreviewType, mime: 'application/octet-stream' };

      const result: PreviewResult = {
        path: filePath,
        name,
        type: typeInfo.type,
        mimeType: typeInfo.mime,
        size: stats.size,
        truncated: false,
        metadata: {
          created: stats.birthtimeMs,
          modified: stats.mtimeMs,
          language: typeInfo.language
        }
      };

      // Generate preview based on type
      switch (typeInfo.type) {
        case 'text':
        case 'code':
        case 'markdown':
        case 'json':
          await this.generateTextPreview(result, stats.size);
          break;

        case 'image':
          await this.generateImagePreview(result, stats.size);
          break;

        case 'audio':
        case 'video':
          await this.generateMediaPreview(result);
          break;

        case 'pdf':
          result.content = '[PDF Document]';
          break;

        default:
          result.type = 'unsupported';
          result.content = `Binary file (${this.formatBytes(stats.size)})`;
      }

      // Cache result
      this.previewCache.set(filePath, { result, timestamp: Date.now() });

      const duration = Date.now() - startTime;
      log.debug(`[Preview] Generated preview for ${name} in ${duration}ms`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Preview failed';
      log.error(`[Preview] Failed to preview ${filePath}:`, error);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        type: 'unsupported',
        mimeType: 'application/octet-stream',
        size: 0,
        truncated: false,
        error: errorMessage
      };
    }
  }

  // -------------------------------------------------------------------------
  // TEXT PREVIEW
  // -------------------------------------------------------------------------

  private async generateTextPreview(result: PreviewResult, fileSize: number): Promise<void> {
    const bytesToRead = Math.min(fileSize, this.config.maxTextSize);
    
    // Read partial file
    const fd = await fs.open(result.path, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      await fd.read(buffer, 0, bytesToRead, 0);
      
      // Detect encoding (simple UTF-8 check)
      let content = buffer.toString('utf8');
      
      // Check for binary content
      if (this.isBinaryContent(buffer)) {
        result.type = 'binary';
        result.content = `Binary file (${this.formatBytes(fileSize)})`;
        return;
      }

      // Truncate to max lines
      const lines = content.split('\n');
      if (lines.length > this.config.maxLines) {
        content = lines.slice(0, this.config.maxLines).join('\n');
        result.truncated = true;
      }

      result.truncated = result.truncated || fileSize > bytesToRead;
      result.content = content;
      result.metadata = {
        ...result.metadata,
        encoding: 'utf8',
        lineCount: lines.length,
        wordCount: content.split(/\s+/).filter(w => w.length > 0).length
      };
    } finally {
      await fd.close();
    }
  }

  private isBinaryContent(buffer: Buffer): boolean {
    // Check first 8KB for null bytes
    const checkSize = Math.min(buffer.length, 8192);
    for (let i = 0; i < checkSize; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // IMAGE PREVIEW
  // -------------------------------------------------------------------------

  private async generateImagePreview(result: PreviewResult, fileSize: number): Promise<void> {
    if (fileSize > this.config.maxImageSize) {
      result.content = `Image too large for preview (${this.formatBytes(fileSize)})`;
      result.truncated = true;
      return;
    }

    try {
      const imageBuffer = await fs.readFile(result.path);
      const image = nativeImage.createFromBuffer(imageBuffer);
      
      if (image.isEmpty()) {
        result.error = 'Failed to load image';
        return;
      }

      const size = image.getSize();
      result.metadata = {
        ...result.metadata,
        width: size.width,
        height: size.height
      };

      // Create thumbnail if large
      let previewImage = image;
      if (size.width > this.config.thumbnailSize || size.height > this.config.thumbnailSize) {
        previewImage = image.resize({
          width: this.config.thumbnailSize,
          height: this.config.thumbnailSize,
          quality: 'good'
        });
      }

      // Convert to data URL
      result.dataUrl = previewImage.toDataURL();
    } catch (error) {
      result.error = 'Failed to process image';
    }
  }

  // -------------------------------------------------------------------------
  // MEDIA PREVIEW
  // -------------------------------------------------------------------------

  private async generateMediaPreview(result: PreviewResult): Promise<void> {
    // For audio/video, we just provide the file URL for the renderer to handle
    result.dataUrl = `file://${result.path.replace(/\\/g, '/')}`;
    result.content = result.type === 'audio' ? 'Audio file' : 'Video file';
  }

  // -------------------------------------------------------------------------
  // THUMBNAIL
  // -------------------------------------------------------------------------

  async getThumbnail(filePath: string, size?: number): Promise<{ dataUrl?: string; error?: string }> {
    const thumbnailSize = size || this.config.thumbnailSize;
    const ext = path.extname(filePath).toLowerCase();
    const typeInfo = EXTENSION_MAP[ext];

    if (!typeInfo || typeInfo.type !== 'image') {
      return { error: 'Not an image file' };
    }

    try {
      const imageBuffer = await fs.readFile(filePath);
      const image = nativeImage.createFromBuffer(imageBuffer);
      
      if (image.isEmpty()) {
        return { error: 'Failed to load image' };
      }

      const thumbnail = image.resize({
        width: thumbnailSize,
        height: thumbnailSize,
        quality: 'good'
      });

      return { dataUrl: thumbnail.toDataURL() };
    } catch (error) {
      return { error: 'Failed to generate thumbnail' };
    }
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  getFileType(filePath: string): { type: PreviewType; mime: string; language?: string } {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] || { type: 'binary', mime: 'application/octet-stream' };
  }

  canPreview(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const typeInfo = EXTENSION_MAP[ext];
    return !!typeInfo && typeInfo.type !== 'binary';
  }

  getSupportedExtensions(): string[] {
    return Object.keys(EXTENSION_MAP);
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // -------------------------------------------------------------------------
  // CACHE MANAGEMENT
  // -------------------------------------------------------------------------

  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  private startCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.previewCache) {
        if (now - value.timestamp > this.cacheMaxAge) {
          this.previewCache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  shutdown(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.previewCache.clear();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const InstantFilePreview = new InstantFilePreviewClass();
export default InstantFilePreview;
