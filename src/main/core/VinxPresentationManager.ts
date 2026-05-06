// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Vinx Presentation Manager (Feature 25)
// Full-screen video presentation player for Vinx exports.
// ==========================================================================

import { ipcMain, BrowserWindow, screen } from 'electron';
import * as log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import { databaseManager } from './DatabaseManager';

interface PresentationEntry {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  video_path: string;
  duration_ms: number;
  last_played: string;
  play_count: number;
  created_at: string;
}

class VinxPresentationManager {
  private mainWindow: BrowserWindow | null = null;
  private presentationWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[VinxPresentation] Vinx presentation manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS vinx_presentations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL DEFAULT 'Vinx',
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        video_path TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        last_played TEXT,
        play_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_vinx_pres_project ON vinx_presentations(project_id);
    `);
  }

  registerPresentation(projectId: string, projectName: string, videoPath: string, durationMs: number = 0): PresentationEntry | null {
    const db = this.getDb();
    if (!db) return null;

    if (!fs.existsSync(videoPath)) {
      log.warn(`[VinxPresentation] Video file not found: ${videoPath}`);
      return null;
    }

    const existing = db.prepare(
      'SELECT id FROM vinx_presentations WHERE project_id = ? AND video_path = ?'
    ).get(projectId, videoPath);

    if (existing) {
      db.prepare(
        'UPDATE vinx_presentations SET project_name = ?, duration_ms = ? WHERE id = ?'
      ).run(projectName, durationMs, existing.id);
      return db.prepare('SELECT * FROM vinx_presentations WHERE id = ?').get(existing.id) as PresentationEntry;
    }

    const result = db.prepare(
      `INSERT INTO vinx_presentations (project_id, project_name, video_path, duration_ms)
       VALUES (?, ?, ?, ?)`
    ).run(projectId, projectName, videoPath, durationMs);

    return db.prepare('SELECT * FROM vinx_presentations WHERE id = ?').get(result.lastInsertRowid) as PresentationEntry;
  }

  getPresentations(projectId?: string): PresentationEntry[] {
    const db = this.getDb();
    if (!db) return [];
    if (projectId) {
      return db.prepare(
        'SELECT * FROM vinx_presentations WHERE project_id = ? ORDER BY created_at DESC'
      ).all(projectId) as PresentationEntry[];
    }
    return db.prepare(
      'SELECT * FROM vinx_presentations ORDER BY last_played DESC NULLS LAST, created_at DESC LIMIT 200'
    ).all() as PresentationEntry[];
  }

  launchPresentation(presentationId: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const entry = db.prepare('SELECT * FROM vinx_presentations WHERE id = ?').get(presentationId) as PresentationEntry | undefined;
    if (!entry) return false;

    if (!fs.existsSync(entry.video_path)) {
      log.warn(`[VinxPresentation] Video file missing: ${entry.video_path}`);
      return false;
    }

    if (this.presentationWindow && !this.presentationWindow.isDestroyed()) {
      this.presentationWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;

    this.presentationWindow = new BrowserWindow({
      width,
      height,
      fullscreen: true,
      frame: false,
      resizable: false,
      backgroundColor: '#000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100vw; height: 100vh; }
video { max-width: 100vw; max-height: 100vh; }
#controls { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; opacity: 0; transition: opacity 0.3s; }
body:hover #controls { opacity: 1; }
button { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #fff; padding: 8px 16px; font-size: 14px; cursor: pointer; border-radius: 4px; }
button:hover { background: rgba(255,255,255,0.3); }
#title { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 16px; font-family: sans-serif; opacity: 0; transition: opacity 0.3s; }
body:hover #title { opacity: 0.8; }
</style>
</head>
<body>
<div id="title">${entry.project_name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
<video id="player" src="file://${entry.video_path.replace(/\\/g, '/')}" autoplay></video>
<div id="controls">
  <button onclick="document.getElementById('player').play()">Play</button>
  <button onclick="document.getElementById('player').pause()">Pause</button>
  <button onclick="document.getElementById('player').currentTime=0">Restart</button>
  <button onclick="window.close()">Close</button>
</div>
<script>
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') window.close();
  if (e.key === ' ') { var v = document.getElementById('player'); v.paused ? v.play() : v.pause(); }
});
</script>
</body>
</html>`;

    this.presentationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    db.prepare('UPDATE vinx_presentations SET last_played = datetime("now"), play_count = play_count + 1 WHERE id = ?').run(presentationId);

    this.presentationWindow.on('closed', () => {
      this.presentationWindow = null;
    });

    log.info(`[VinxPresentation] Launched presentation: ${entry.project_name}`);
    return true;
  }

  closePresentation(): void {
    if (this.presentationWindow && !this.presentationWindow.isDestroyed()) {
      this.presentationWindow.close();
      this.presentationWindow = null;
    }
  }

  removePresentation(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('DELETE FROM vinx_presentations WHERE id = ?').run(id);
    return true;
  }

  private registerIPC(): void {
    ipcMain.handle('vinx-presentation:register', async (_event, projectId: string, projectName: string, videoPath: string, durationMs?: number) => {
      return this.registerPresentation(projectId, projectName, videoPath, durationMs);
    });

    ipcMain.handle('vinx-presentation:list', async (_event, projectId?: string) => {
      return this.getPresentations(projectId);
    });

    ipcMain.handle('vinx-presentation:launch', async (_event, id: number) => {
      return this.launchPresentation(id);
    });

    ipcMain.handle('vinx-presentation:close', async () => {
      this.closePresentation();
    });

    ipcMain.handle('vinx-presentation:remove', async (_event, id: number) => {
      return this.removePresentation(id);
    });
  }
}

export const vinxPresentationManager = new VinxPresentationManager();
