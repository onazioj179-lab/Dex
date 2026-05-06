// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Project Archiver Manager (Feature 11)
// Compresses inactive projects to archive, keeps searchable metadata.
// ==========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface ArchiveRecord {
  id: number;
  app: string;
  project_name: string;
  archive_path: string;
  original_data: string;
  archived_at: number;
  size: number;
}

class ProjectArchiverManager {
  private mainWindow: BrowserWindow | null = null;
  private archiveDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.archiveDir = path.join(userDataPath, 'archive');
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
    this.createTables();
    this.registerIPC();
    log.info('[ProjectArchiver] Project archiver initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        project_name TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        original_data TEXT NOT NULL,
        archived_at INTEGER NOT NULL,
        size INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_project_archive_app ON project_archive(app);
    `);
  }

  archiveProject(appName: string, projectName: string, projectData: any): ArchiveRecord | null {
    const db = this.getDb();
    if (!db) return null;

    try {
      const jsonStr = JSON.stringify(projectData);
      const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf-8'));
      const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
      const filename = `${appName}_${safeName}_${Date.now()}.dex-archive`;
      const archivePath = path.join(this.archiveDir, filename);

      fs.writeFileSync(archivePath, compressed);

      const size = compressed.length;
      const now = Date.now();

      const result = db.prepare(
        `INSERT INTO project_archive (app, project_name, archive_path, original_data, archived_at, size)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(appName, projectName, archivePath, 'compressed-file', now, size);

      log.info(`[ProjectArchiver] Archived project "${projectName}" from ${appName}`);
      return {
        id: Number(result.lastInsertRowid),
        app: appName, project_name: projectName, archive_path: archivePath,
        original_data: 'compressed-file', archived_at: now, size,
      };
    } catch (err) {
      log.warn('[ProjectArchiver] Archive error:', err);
      return null;
    }
  }

  unarchiveProject(archiveId: number): any {
    const db = this.getDb();
    if (!db) return null;

    try {
      const record = db.prepare('SELECT * FROM project_archive WHERE id = ?').get(archiveId) as ArchiveRecord;
      if (!record) return null;

      if (fs.existsSync(record.archive_path)) {
        const compressed = fs.readFileSync(record.archive_path);
        const decompressed = zlib.inflateSync(compressed);
        const projectData = JSON.parse(decompressed.toString('utf-8'));

        fs.unlinkSync(record.archive_path);
        db.prepare('DELETE FROM project_archive WHERE id = ?').run(archiveId);

        log.info(`[ProjectArchiver] Unarchived project "${record.project_name}"`);
        return { app: record.app, projectName: record.project_name, data: projectData };
      }

      db.prepare('DELETE FROM project_archive WHERE id = ?').run(archiveId);
      return null;
    } catch (err) {
      log.warn('[ProjectArchiver] Unarchive error:', err);
      return null;
    }
  }

  getArchivedProjects(appFilter?: string): ArchiveRecord[] {
    const db = this.getDb();
    if (!db) return [];

    if (appFilter) {
      return db.prepare(
        'SELECT * FROM project_archive WHERE app = ? ORDER BY archived_at DESC'
      ).all(appFilter) as ArchiveRecord[];
    }
    return db.prepare(
      'SELECT * FROM project_archive ORDER BY archived_at DESC'
    ).all() as ArchiveRecord[];
  }

  getEligibleProjects(appName: string, projects: Array<{ id: string; name: string; lastModified: number }>): Array<{ id: string; name: string }> {
    const cutoff = Date.now() - (90 * 86400000);
    return projects.filter(p => p.lastModified < cutoff).map(p => ({ id: p.id, name: p.name }));
  }

  getArchiveDirPath(): string {
    return this.archiveDir;
  }

  private registerIPC(): void {
    ipcMain.handle('project-archiver:archive', async (_event, app: string, projectName: string, projectData: any) => {
      return this.archiveProject(app, projectName, projectData);
    });

    ipcMain.handle('project-archiver:unarchive', async (_event, archiveId: number) => {
      return this.unarchiveProject(archiveId);
    });

    ipcMain.handle('project-archiver:getAll', async (_event, appFilter?: string) => {
      return this.getArchivedProjects(appFilter);
    });

    ipcMain.handle('project-archiver:getEligible', async (_event, appName: string, projects: any[]) => {
      return this.getEligibleProjects(appName, projects);
    });

    ipcMain.handle('project-archiver:getArchiveDir', async () => {
      return this.getArchiveDirPath();
    });
  }
}

export const projectArchiverManager = new ProjectArchiverManager();
