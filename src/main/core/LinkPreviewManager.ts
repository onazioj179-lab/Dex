// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Link Preview Manager (Feature 19)
// Fetches URL metadata (og:title, og:description) and caches in SQLite.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { net } from 'electron';

export interface LinkPreview {
  id: number;
  url_hash: string;
  url: string;
  title: string;
  description: string;
  fetched_at: number;
}

class LinkPreviewManager {
  private mainWindow: BrowserWindow | null = null;
  private enabled: boolean = true;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.loadSettings();
    this.registerIPC();
    log.info('[LinkPreview] Link preview manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS link_previews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_hash TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        fetched_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_link_previews_hash ON link_previews(url_hash);
    `);
  }

  private loadSettings(): void {
    const val = databaseManager.getSetting('link_preview_enabled', 'true');
    this.enabled = val !== 'false';
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 32);
  }

  async fetchPreview(url: string): Promise<LinkPreview | null> {
    if (!this.enabled) return null;

    const urlHash = this.hashUrl(url);
    const db = this.getDb();

    if (db) {
      const cached = db.prepare('SELECT * FROM link_previews WHERE url_hash = ?').get(urlHash) as LinkPreview | undefined;
      if (cached) return cached;
    }

    try {
      const html = await this.fetchWithTimeout(url, 3000);
      const title = this.extractMeta(html, 'og:title') || this.extractTitle(html) || '';
      const description = this.extractMeta(html, 'og:description') || '';

      const now = Date.now();
      if (db) {
        db.prepare(
          `INSERT INTO link_previews (url_hash, url, title, description, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(url_hash) DO UPDATE SET title = ?, description = ?, fetched_at = ?`
        ).run(urlHash, url, title, description, now, title, description, now);

        return db.prepare('SELECT * FROM link_previews WHERE url_hash = ?').get(urlHash) as LinkPreview;
      }

      return { id: 0, url_hash: urlHash, url, title, description, fetched_at: now };
    } catch (err) {
      log.warn('[LinkPreview] Fetch error for', url, ':', (err as Error).message);
      return null;
    }
  }

  private fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);

      try {
        const request = net.request(url);
        let data = '';
        const maxBytes = 50000;

        request.on('response', (response) => {
          response.on('data', (chunk) => {
            data += chunk.toString();
            if (data.length > maxBytes) {
              request.abort();
              clearTimeout(timer);
              resolve(data);
            }
          });
          response.on('end', () => {
            clearTimeout(timer);
            resolve(data);
          });
          response.on('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
          });
        });

        request.on('error', (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });

        request.end();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private extractMeta(html: string, property: string): string | null {
    const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];

    const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
    const match2 = html.match(regex2);
    return match2 ? match2[1] : null;
  }

  private extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : null;
  }

  getCached(url: string): LinkPreview | null {
    const db = this.getDb();
    if (!db) return null;
    const urlHash = this.hashUrl(url);
    return db.prepare('SELECT * FROM link_previews WHERE url_hash = ?').get(urlHash) as LinkPreview | null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    databaseManager.setSetting('link_preview_enabled', enabled ? 'true' : 'false');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private registerIPC(): void {
    ipcMain.handle('link-preview:fetch', async (_event, url: string) => {
      return this.fetchPreview(url);
    });

    ipcMain.handle('link-preview:getCached', async (_event, url: string) => {
      return this.getCached(url);
    });

    ipcMain.handle('link-preview:setEnabled', async (_event, enabled: boolean) => {
      this.setEnabled(enabled);
    });

    ipcMain.handle('link-preview:isEnabled', async () => {
      return this.isEnabled();
    });
  }
}

export const linkPreviewManager = new LinkPreviewManager();
