// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Shared Media Library
// Centralized registry of every media file imported into any DEX app.
// Deduplication, thumbnail generation, usage tracking.
// ==========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface MediaRecord {
  id: number;
  filepath: string;
  filename: string;
  type: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  imported_by: string;
  last_used: number;
  use_count: number;
  thumbnail: string | null;
  timestamp: number;
}

export type MediaType = 'video' | 'audio' | 'image' | 'document';
export type MediaSortKey = 'name' | 'date' | 'last_used' | 'most_used';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv']);

class SharedMediaLibrary {
  private mainWindow: BrowserWindow | null = null;
  private thumbnailDir: string = '';
  private thumbnailQueue: Array<{ id: number; filepath: string; type: string }> = [];
  private processingThumbnails = false;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.thumbnailDir = path.join(app.getPath('userData'), 'thumbnails');
    if (!fs.existsSync(this.thumbnailDir)) {
      fs.mkdirSync(this.thumbnailDir, { recursive: true });
    }
    this.registerIPC();
    log.info('[MediaLibrary] Shared media library initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private detectType(filepath: string): MediaType {
    const ext = path.extname(filepath).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    return 'document';
  }

  importFile(filepath: string, importedBy: string): MediaRecord | null {
    const db = this.getDb();
    if (!db) return null;

    const existing = db.prepare('SELECT * FROM media_library WHERE filepath = ?').get(filepath);
    if (existing) {
      db.prepare('UPDATE media_library SET use_count = use_count + 1, last_used = ? WHERE id = ?')
        .run(Date.now(), existing.id);
      return db.prepare('SELECT * FROM media_library WHERE id = ?').get(existing.id);
    }

    if (!fs.existsSync(filepath)) {
      log.warn('[MediaLibrary] File not found:', filepath);
      return null;
    }

    const stat = fs.statSync(filepath);
    const filename = path.basename(filepath);
    const type = this.detectType(filepath);
    const now = Date.now();

    const result = db.prepare(
      `INSERT INTO media_library (filepath, filename, type, size, duration, width, height, imported_by, last_used, use_count, thumbnail, timestamp)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, NULL, ?)`
    ).run(filepath, filename, type, stat.size, importedBy, now, now);

    const record = db.prepare('SELECT * FROM media_library WHERE id = ?').get(result.lastInsertRowid);

    this.thumbnailQueue.push({ id: Number(result.lastInsertRowid), filepath, type });
    this.processThumbnailQueue();

    return record;
  }

  private async processThumbnailQueue(): Promise<void> {
    if (this.processingThumbnails) return;
    this.processingThumbnails = true;

    while (this.thumbnailQueue.length > 0) {
      const item = this.thumbnailQueue.shift();
      if (!item) break;
      try {
        await this.generateThumbnail(item.id, item.filepath, item.type as MediaType);
      } catch (err) {
        log.warn('[MediaLibrary] Thumbnail generation failed for', item.filepath, err);
      }
    }

    this.processingThumbnails = false;
  }

  private async generateThumbnail(id: number, filepath: string, type: MediaType): Promise<void> {
    const db = this.getDb();
    if (!db) return;

    const hash = crypto.createHash('md5').update(filepath).digest('hex');
    const thumbPath = path.join(this.thumbnailDir, `${hash}.jpg`);

    if (fs.existsSync(thumbPath)) {
      db.prepare('UPDATE media_library SET thumbnail = ? WHERE id = ?').run(thumbPath, id);
      return;
    }

    if (type === 'image') {
      try {
        const sharp = require('sharp');
        await sharp(filepath)
          .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);
        db.prepare('UPDATE media_library SET thumbnail = ? WHERE id = ?').run(thumbPath, id);
      } catch (err) {
        log.warn('[MediaLibrary] Image thumbnail failed:', err);
        try {
          fs.copyFileSync(filepath, thumbPath);
          db.prepare('UPDATE media_library SET thumbnail = ? WHERE id = ?').run(thumbPath, id);
        } catch {
          // no thumbnail available
        }
      }
    } else if (type === 'video') {
      try {
        const { execSync } = require('child_process');
        execSync(
          `ffprobe -v quiet -print_format json -show_format "${filepath}"`,
          { timeout: 5000 }
        );
        const durationOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
          { timeout: 5000 }
        ).toString().trim();
        const duration = parseFloat(durationOutput);
        const seekTo = duration > 0 ? duration * 0.1 : 0;
        execSync(
          `ffmpeg -ss ${seekTo} -i "${filepath}" -vframes 1 -vf scale=200:-1 "${thumbPath}" -y`,
          { timeout: 15000 }
        );
        if (fs.existsSync(thumbPath)) {
          const durationMs = Math.round(duration * 1000);
          db.prepare('UPDATE media_library SET thumbnail = ?, duration = ? WHERE id = ?')
            .run(thumbPath, durationMs, id);
        }
      } catch {
        log.debug('[MediaLibrary] ffmpeg not available for video thumbnail');
      }
    } else if (type === 'audio') {
      try {
        const { execSync } = require('child_process');
        const durationOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
          { timeout: 5000 }
        ).toString().trim();
        const duration = parseFloat(durationOutput);
        const pngPath = thumbPath.replace('.jpg', '.png');
        execSync(
          `ffmpeg -i "${filepath}" -filter_complex "aformat=channel_layouts=mono,showwavespic=s=200x200:colors=#4f8ef7" -frames:v 1 "${pngPath}" -y`,
          { timeout: 15000 }
        );
        if (fs.existsSync(pngPath)) {
          const durationMs = Math.round(duration * 1000);
          db.prepare('UPDATE media_library SET thumbnail = ?, duration = ? WHERE id = ?')
            .run(pngPath, durationMs, id);
        }
      } catch {
        log.debug('[MediaLibrary] ffmpeg not available for audio waveform');
      }
    }
  }

  getAll(typeFilter?: string, sortBy: MediaSortKey = 'date', search?: string): MediaRecord[] {
    const db = this.getDb();
    if (!db) return [];

    let sql = 'SELECT * FROM media_library';
    const conditions: string[] = [];
    const params: any[] = [];

    if (typeFilter && typeFilter !== 'all') {
      conditions.push('type = ?');
      params.push(typeFilter);
    }
    if (search && search.trim()) {
      conditions.push('filename LIKE ?');
      params.push(`%${search.trim()}%`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortMap: Record<string, string> = {
      name: 'filename ASC',
      date: 'timestamp DESC',
      last_used: 'last_used DESC',
      most_used: 'use_count DESC',
    };
    sql += ` ORDER BY ${sortMap[sortBy] || 'timestamp DESC'}`;

    return db.prepare(sql).all(...params);
  }

  getById(id: number): MediaRecord | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare('SELECT * FROM media_library WHERE id = ?').get(id) || null;
  }

  getByFilepath(filepath: string): MediaRecord | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare('SELECT * FROM media_library WHERE filepath = ?').get(filepath) || null;
  }

  removeFromLibrary(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    const record = db.prepare('SELECT thumbnail FROM media_library WHERE id = ?').get(id);
    if (record && record.thumbnail && fs.existsSync(record.thumbnail)) {
      try { fs.unlinkSync(record.thumbnail); } catch { /* ignore */ }
    }
    db.prepare('DELETE FROM media_library WHERE id = ?').run(id);
    return true;
  }

  updateLastUsed(id: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE media_library SET last_used = ?, use_count = use_count + 1 WHERE id = ?')
      .run(Date.now(), id);
  }

  getStats(): { total: number; video: number; audio: number; image: number; document: number; totalSize: number } {
    const db = this.getDb();
    if (!db) return { total: 0, video: 0, audio: 0, image: 0, document: 0, totalSize: 0 };

    const total = db.prepare('SELECT COUNT(*) as c FROM media_library').get().c;
    const video = db.prepare("SELECT COUNT(*) as c FROM media_library WHERE type = 'video'").get().c;
    const audio = db.prepare("SELECT COUNT(*) as c FROM media_library WHERE type = 'audio'").get().c;
    const image = db.prepare("SELECT COUNT(*) as c FROM media_library WHERE type = 'image'").get().c;
    const document = db.prepare("SELECT COUNT(*) as c FROM media_library WHERE type = 'document'").get().c;
    const sizeRow = db.prepare('SELECT COALESCE(SUM(size), 0) as s FROM media_library').get();

    return { total, video, audio, image, document, totalSize: sizeRow.s };
  }

  private registerIPC(): void {
    ipcMain.handle('media-library:import', (_event, filepath: string, importedBy: string) => {
      return this.importFile(filepath, importedBy);
    });

    ipcMain.handle('media-library:getAll', (_event, typeFilter?: string, sortBy?: MediaSortKey, search?: string) => {
      return this.getAll(typeFilter, sortBy, search);
    });

    ipcMain.handle('media-library:getById', (_event, id: number) => {
      return this.getById(id);
    });

    ipcMain.handle('media-library:getByFilepath', (_event, filepath: string) => {
      return this.getByFilepath(filepath);
    });

    ipcMain.handle('media-library:remove', (_event, id: number) => {
      return this.removeFromLibrary(id);
    });

    ipcMain.handle('media-library:updateLastUsed', (_event, id: number) => {
      this.updateLastUsed(id);
      return true;
    });

    ipcMain.handle('media-library:getStats', () => {
      return this.getStats();
    });
  }

  shutdown(): void {
    log.info('[MediaLibrary] Shutdown');
  }
}

export const sharedMediaLibrary = new SharedMediaLibrary();

export function initializeSharedMediaLibrary(mainWindow: BrowserWindow): void {
  sharedMediaLibrary.initialize(mainWindow);
}

export function shutdownSharedMediaLibrary(): void {
  sharedMediaLibrary.shutdown();
}
