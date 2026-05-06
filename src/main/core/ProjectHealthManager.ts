// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Project Health Manager (Feature 8)
// Health scoring system for every project across all inner apps.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export type HealthStatus = 'healthy' | 'needs-attention' | 'at-risk';

export interface ProjectHealth {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  score: number;
  status: HealthStatus;
  signals: HealthSignal[];
  computed_at: number;
}

export interface HealthSignal {
  name: string;
  impact: number;
  description: string;
}

class ProjectHealthManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ProjectHealth] Project health manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 100,
        status TEXT NOT NULL DEFAULT 'healthy',
        signals TEXT NOT NULL DEFAULT '[]',
        computed_at INTEGER NOT NULL,
        UNIQUE(app, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_health_app ON project_health(app);
      CREATE INDEX IF NOT EXISTS idx_project_health_status ON project_health(status);
    `);
  }

  computeHealth(app: string, projectId: string, projectName: string, context: {
    lastModified?: number;
    completionPct?: number;
    hasOverdueTasks?: boolean;
    hasUnsavedChanges?: boolean;
    linkedBlockedProject?: boolean;
    recentExport?: boolean;
    isVinx?: boolean;
  } = {}): ProjectHealth {
    const signals: HealthSignal[] = [];
    let score = 100;
    const now = Date.now();
    const dayMs = 86400000;

    if (context.lastModified) {
      const daysSinceModified = Math.floor((now - context.lastModified) / dayMs);
      if (daysSinceModified > 14) {
        const penalty = Math.min(30, (daysSinceModified - 14) * 2);
        score -= penalty;
        signals.push({ name: 'stale', impact: -penalty, description: `Not modified in ${daysSinceModified} days` });
      }
    }

    if (context.completionPct !== undefined && context.completionPct < 50) {
      const penalty = Math.floor((50 - context.completionPct) / 5);
      score -= penalty;
      signals.push({ name: 'low-completion', impact: -penalty, description: `Completion at ${context.completionPct}%` });
    }

    if (context.hasOverdueTasks) {
      score -= 15;
      signals.push({ name: 'overdue-tasks', impact: -15, description: 'Has overdue linked tasks' });
    }

    if (context.hasUnsavedChanges) {
      score -= 10;
      signals.push({ name: 'unsaved-changes', impact: -10, description: 'Unsaved changes older than 24 hours' });
    }

    if (context.linkedBlockedProject) {
      score -= 10;
      signals.push({ name: 'blocked-link', impact: -10, description: 'A linked project is blocked' });
    }

    if (context.isVinx && !context.recentExport) {
      score -= 10;
      signals.push({ name: 'no-export', impact: -10, description: 'Vinx project not exported recently' });
    }

    score = Math.max(0, Math.min(100, score));
    const status: HealthStatus = score > 75 ? 'healthy' : score >= 50 ? 'needs-attention' : 'at-risk';

    const health: ProjectHealth = {
      id: 0,
      app,
      project_id: projectId,
      project_name: projectName,
      score,
      status,
      signals,
      computed_at: now,
    };

    this.saveHealth(health);
    return health;
  }

  private saveHealth(health: ProjectHealth): void {
    const db = this.getDb();
    if (!db) return;

    try {
      db.prepare(
        `INSERT INTO project_health (app, project_id, project_name, score, status, signals, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(app, project_id) DO UPDATE SET
           project_name = ?, score = ?, status = ?, signals = ?, computed_at = ?`
      ).run(
        health.app, health.project_id, health.project_name,
        health.score, health.status, JSON.stringify(health.signals), health.computed_at,
        health.project_name, health.score, health.status, JSON.stringify(health.signals), health.computed_at
      );
    } catch (err) {
      log.warn('[ProjectHealth] Save error:', err);
    }
  }

  getHealth(app: string, projectId: string): ProjectHealth | null {
    const db = this.getDb();
    if (!db) return null;

    const row = db.prepare(
      'SELECT * FROM project_health WHERE app = ? AND project_id = ?'
    ).get(app, projectId);

    if (!row) return null;
    return {
      ...row,
      signals: JSON.parse(row.signals || '[]'),
    } as ProjectHealth;
  }

  getAllHealth(filter?: HealthStatus): ProjectHealth[] {
    const db = this.getDb();
    if (!db) return [];

    let query = 'SELECT * FROM project_health';
    const params: any[] = [];
    if (filter) {
      query += ' WHERE status = ?';
      params.push(filter);
    }
    query += ' ORDER BY score ASC';

    return db.prepare(query).all(...params).map((row: any) => ({
      ...row,
      signals: JSON.parse(row.signals || '[]'),
    })) as ProjectHealth[];
  }

  getHealthByApp(app: string): ProjectHealth[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM project_health WHERE app = ? ORDER BY score ASC'
    ).all(app).map((row: any) => ({
      ...row,
      signals: JSON.parse(row.signals || '[]'),
    })) as ProjectHealth[];
  }

  private registerIPC(): void {
    ipcMain.handle('project-health:compute', async (_event, app: string, projectId: string, projectName: string, context: any) => {
      return this.computeHealth(app, projectId, projectName, context);
    });

    ipcMain.handle('project-health:get', async (_event, app: string, projectId: string) => {
      return this.getHealth(app, projectId);
    });

    ipcMain.handle('project-health:getAll', async (_event, filter?: HealthStatus) => {
      return this.getAllHealth(filter);
    });

    ipcMain.handle('project-health:getByApp', async (_event, app: string) => {
      return this.getHealthByApp(app);
    });
  }
}

export const projectHealthManager = new ProjectHealthManager();
