// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Project Timeline Manager (Feature 18)
// Visual timeline of project events with zooming and filtering.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  app: string;
  projectId: string;
  details: any;
}

interface TimelineData {
  events: TimelineEvent[];
  range: { start: string; end: string };
  projectName: string;
}

class ProjectTimelineManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[ProjectTimeline] Project timeline manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  getTimeline(app: string, projectId: string, startDate?: string, endDate?: string): TimelineData {
    const events: TimelineEvent[] = [];
    const db = this.getDb();
    if (!db) return { events, range: { start: '', end: '' }, projectName: '' };

    let projectName = projectId;

    // Gather events from version_history
    try {
      let sql = `SELECT * FROM version_history WHERE app = ? AND (project_name = ? OR id = ?)`;
      const params: any[] = [app, projectId, projectId];
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }
      sql += ' ORDER BY created_at ASC';

      const versions = db.prepare(sql).all(...params) as any[];
      for (const v of versions) {
        projectName = v.project_name || projectName;
        events.push({
          id: `version-${v.id}`,
          type: 'version',
          title: `Version saved: ${v.label || v.project_name || ''}`,
          timestamp: v.created_at,
          app,
          projectId,
          details: { versionId: v.id, label: v.label },
        });
      }
    } catch (_e) { /* table may not exist */ }

    // Gather events from project_links
    try {
      const links = db.prepare(
        `SELECT * FROM project_links WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)
         ORDER BY created_at ASC`
      ).all(app, projectId, app, projectId) as any[];
      for (const link of links) {
        events.push({
          id: `link-${link.id}`,
          type: 'link',
          title: `Linked to ${link.target_app}/${link.target_id}`,
          timestamp: link.created_at,
          app,
          projectId,
          details: link,
        });
      }
    } catch (_e) { /* table may not exist */ }

    // Gather events from color_labels
    try {
      const labels = db.prepare(
        'SELECT * FROM color_labels WHERE app = ? AND item_id = ? ORDER BY created_at ASC'
      ).all(app, projectId) as any[];
      for (const label of labels) {
        events.push({
          id: `label-${label.id}`,
          type: 'label',
          title: `Color label: ${label.color}${label.label ? ' - ' + label.label : ''}`,
          timestamp: label.created_at,
          app,
          projectId,
          details: label,
        });
      }
    } catch (_e) { /* table may not exist */ }

    // Gather events from time_tracking
    try {
      const times = db.prepare(
        'SELECT * FROM time_tracking WHERE app = ? AND project_id = ? ORDER BY timestamp ASC'
      ).all(app, projectId) as any[];
      for (const t of times) {
        const hours = Math.round(t.duration_ms / 3600000 * 10) / 10;
        events.push({
          id: `time-${t.id}`,
          type: 'time',
          title: `Worked ${hours}h on ${t.date}`,
          timestamp: t.timestamp,
          app,
          projectId,
          details: { duration_ms: t.duration_ms, date: t.date },
        });
      }
    } catch (_e) { /* table may not exist */ }

    // Gather events from activity_feed
    try {
      let sql = `SELECT * FROM activity_feed WHERE app = ? AND (
        title LIKE ? OR details LIKE ?
      )`;
      const params: any[] = [app, `%${projectId}%`, `%${projectId}%`];
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }
      sql += ' ORDER BY created_at ASC LIMIT 200';

      const activities = db.prepare(sql).all(...params) as any[];
      for (const a of activities) {
        events.push({
          id: `activity-${a.id}`,
          type: 'activity',
          title: a.title,
          timestamp: a.created_at,
          app,
          projectId,
          details: { eventType: a.event_type },
        });
      }
    } catch (_e) { /* table may not exist */ }

    // Sort all events chronologically
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const range = {
      start: events.length > 0 ? events[0].timestamp : '',
      end: events.length > 0 ? events[events.length - 1].timestamp : '',
    };

    return { events, range, projectName };
  }

  getProjectEvents(app: string, projectId: string, eventType: string, limit: number = 100): TimelineEvent[] {
    const timeline = this.getTimeline(app, projectId);
    const filtered = timeline.events.filter(e => e.type === eventType);
    return filtered.slice(0, limit);
  }

  private registerIPC(): void {
    ipcMain.handle('project-timeline:get', async (_event, app: string, projectId: string, startDate?: string, endDate?: string) => {
      return this.getTimeline(app, projectId, startDate, endDate);
    });

    ipcMain.handle('project-timeline:getByType', async (_event, app: string, projectId: string, eventType: string, limit?: number) => {
      return this.getProjectEvents(app, projectId, eventType, limit);
    });
  }
}

export const projectTimelineManager = new ProjectTimelineManager();
