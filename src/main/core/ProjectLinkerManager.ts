// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Project Linker (Feature 2)
// Cross-app project linking system for explicit relationships between work.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export type LinkType = 'related' | 'depends-on' | 'produced-by' | 'referenced-by';

export interface ProjectLink {
  id: number;
  source_app: string;
  source_id: string;
  target_app: string;
  target_id: string;
  link_type: LinkType;
  created: number;
}

class ProjectLinkerManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ProjectLinker] Project linker initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_app TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_app TEXT NOT NULL,
        target_id TEXT NOT NULL,
        link_type TEXT NOT NULL DEFAULT 'related',
        created INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_links_source ON project_links(source_app, source_id);
      CREATE INDEX IF NOT EXISTS idx_project_links_target ON project_links(target_app, target_id);
    `);
  }

  addLink(sourceApp: string, sourceId: string, targetApp: string, targetId: string, linkType: LinkType): number {
    const db = this.getDb();
    if (!db) return -1;

    const existing = db.prepare(
      `SELECT id FROM project_links
       WHERE source_app = ? AND source_id = ? AND target_app = ? AND target_id = ? AND link_type = ?`
    ).get(sourceApp, sourceId, targetApp, targetId, linkType);
    if (existing) return existing.id;

    const result = db.prepare(
      `INSERT INTO project_links (source_app, source_id, target_app, target_id, link_type, created)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sourceApp, sourceId, targetApp, targetId, linkType, Date.now());

    if (this.mainWindow) {
      this.mainWindow.webContents.send('project-links:changed', { sourceApp, sourceId });
    }
    return Number(result.lastInsertRowid);
  }

  removeLink(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const link = db.prepare('SELECT * FROM project_links WHERE id = ?').get(id);
    db.prepare('DELETE FROM project_links WHERE id = ?').run(id);
    if (this.mainWindow && link) {
      this.mainWindow.webContents.send('project-links:changed', { sourceApp: link.source_app, sourceId: link.source_id });
    }
    return true;
  }

  getLinksFor(app: string, projectId: string): ProjectLink[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      `SELECT * FROM project_links
       WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)
       ORDER BY created DESC`
    ).all(app, projectId, app, projectId) as ProjectLink[];
  }

  getAllLinks(): ProjectLink[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM project_links ORDER BY created DESC').all() as ProjectLink[];
  }

  removeLinksForProject(app: string, projectId: string): number {
    const db = this.getDb();
    if (!db) return 0;

    const result = db.prepare(
      `DELETE FROM project_links
       WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)`
    ).run(app, projectId, app, projectId);
    return result.changes;
  }

  getLinkTypes(): string[] {
    return ['related', 'depends-on', 'produced-by', 'referenced-by'];
  }

  private registerIPC(): void {
    ipcMain.handle('project-linker:addLink', async (_event, sourceApp: string, sourceId: string, targetApp: string, targetId: string, linkType: LinkType) => {
      return this.addLink(sourceApp, sourceId, targetApp, targetId, linkType);
    });

    ipcMain.handle('project-linker:removeLink', async (_event, id: number) => {
      return this.removeLink(id);
    });

    ipcMain.handle('project-linker:getLinksFor', async (_event, app: string, projectId: string) => {
      return this.getLinksFor(app, projectId);
    });

    ipcMain.handle('project-linker:getAllLinks', async () => {
      return this.getAllLinks();
    });

    ipcMain.handle('project-linker:getLinkTypes', async () => {
      return this.getLinkTypes();
    });

    ipcMain.handle('project-linker:removeLinksForProject', async (_event, app: string, projectId: string) => {
      return this.removeLinksForProject(app, projectId);
    });
  }
}

export const projectLinkerManager = new ProjectLinkerManager();
