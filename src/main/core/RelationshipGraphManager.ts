// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Relationship Graph Manager (Feature 4)
// Pre-computes graph data: nodes (apps, projects, tags, tasks, media)
// and edges (links, tags, dependencies, app switches, file usage).
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface GraphNode {
  id: string;
  type: 'app' | 'project' | 'tag' | 'task' | 'media';
  label: string;
  app: string;
  usage: number;
  x: number | null;
  y: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'project-link' | 'tag-assignment' | 'task-dependency' | 'app-switch' | 'file-usage';
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  computed_at: number;
}

class RelationshipGraphManager {
  private mainWindow: BrowserWindow | null = null;
  private capabilityTier: number = 2;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[RelationshipGraph] Graph manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_cache (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data TEXT NOT NULL,
        computed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS graph_node_positions (
        node_id TEXT PRIMARY KEY,
        x REAL NOT NULL,
        y REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  setCapabilityTier(tier: number): void {
    this.capabilityTier = tier;
  }

  computeGraph(): GraphData {
    const db = this.getDb();
    if (!db) {
      return { nodes: [], edges: [], computed_at: Date.now() };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();
    const maxNodes = this.capabilityTier <= 1 ? 200 : 10000;

    const addNode = (id: string, type: GraphNode['type'], label: string, app: string, usage: number): void => {
      if (nodeMap.has(id) || nodeMap.size >= maxNodes) return;
      const pos = db.prepare('SELECT x, y FROM graph_node_positions WHERE node_id = ?').get(id);
      const node: GraphNode = { id, type, label, app, usage, x: pos?.x ?? null, y: pos?.y ?? null };
      nodeMap.set(id, node);
      nodes.push(node);
    };

    try {
      const apps = ['vinx', 'notes', 'tasks', 'kanban', 'prism', 'flux', 'forge', 'imosion', 'calendar'];
      for (const appName of apps) {
        addNode(`app:${appName}`, 'app', appName, appName, 50);
      }

      const links = db.prepare('SELECT * FROM project_links').all();
      for (const link of links) {
        const srcId = `project:${link.source_app}:${link.source_id}`;
        const tgtId = `project:${link.target_app}:${link.target_id}`;
        addNode(srcId, 'project', link.source_id, link.source_app, 10);
        addNode(tgtId, 'project', link.target_id, link.target_app, 10);
        edges.push({
          id: `link:${link.id}`,
          source: srcId,
          target: tgtId,
          type: 'project-link',
          weight: 2,
        });
      }

      const deps = db.prepare('SELECT * FROM dependencies').all();
      for (const dep of deps) {
        const blockerId = `${dep.blocker_type}:${dep.blocker_app}:${dep.blocker_id}`;
        const blockedId = `${dep.blocked_type}:${dep.blocked_app}:${dep.blocked_id}`;
        addNode(blockerId, dep.blocker_type === 'task' ? 'task' : 'project', dep.blocker_id, dep.blocker_app, 5);
        addNode(blockedId, dep.blocked_type === 'task' ? 'task' : 'project', dep.blocked_id, dep.blocked_app, 5);
        edges.push({
          id: `dep:${dep.id}`,
          source: blockerId,
          target: blockedId,
          type: 'task-dependency',
          weight: 3,
        });
      }

      const colorLabels = db.prepare('SELECT DISTINCT item_id, app, item_type FROM color_labels').all();
      for (const cl of colorLabels) {
        const nodeId = `${cl.item_type}:${cl.app}:${cl.item_id}`;
        addNode(nodeId, cl.item_type === 'task' ? 'task' : 'project', cl.item_id, cl.app, 3);
      }

      const mediaItems = db.prepare('SELECT id, filename, type FROM media_library ORDER BY use_count DESC LIMIT 100').all();
      for (const m of mediaItems) {
        addNode(`media:${m.id}`, 'media', m.filename, 'media', m.use_count || 1);
      }
    } catch (err) {
      log.warn('[RelationshipGraph] Error computing graph:', err);
    }

    const graphData: GraphData = { nodes, edges, computed_at: Date.now() };

    try {
      db.prepare(
        `INSERT INTO graph_cache (id, data, computed_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = ?, computed_at = ?`
      ).run(JSON.stringify(graphData), graphData.computed_at, JSON.stringify(graphData), graphData.computed_at);
    } catch { /* non-critical */ }

    return graphData;
  }

  getCachedGraph(): GraphData | null {
    const db = this.getDb();
    if (!db) return null;
    try {
      const row = db.prepare('SELECT data, computed_at FROM graph_cache WHERE id = 1').get();
      if (row) {
        return JSON.parse(row.data);
      }
    } catch { /* fallback */ }
    return null;
  }

  saveNodePosition(nodeId: string, x: number, y: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare(
      `INSERT INTO graph_node_positions (node_id, x, y, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET x = ?, y = ?, updated_at = ?`
    ).run(nodeId, x, y, Date.now(), x, y, Date.now());
  }

  private registerIPC(): void {
    ipcMain.handle('relationship-graph:compute', async () => {
      return this.computeGraph();
    });

    ipcMain.handle('relationship-graph:getCached', async () => {
      return this.getCachedGraph();
    });

    ipcMain.handle('relationship-graph:saveNodePosition', async (_event, nodeId: string, x: number, y: number) => {
      this.saveNodePosition(nodeId, x, y);
    });

    ipcMain.handle('relationship-graph:setTier', async (_event, tier: number) => {
      this.setCapabilityTier(tier);
    });
  }
}

export const relationshipGraphManager = new RelationshipGraphManager();
