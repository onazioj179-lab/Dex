// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Project Export Bundle Manager (Feature 21)
// Packages a project with all related content into a zip bundle.
// ==========================================================================

import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface BundleManifest {
  version: string;
  dexVersion: string;
  createdAt: number;
  project: { app: string; id: string; name: string };
  contents: Array<{ type: string; name: string; path: string }>;
}

class ProjectExportBundleManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[ExportBundle] Project export bundle manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  async createBundle(appName: string, projectId: string, projectName: string, projectData: any): Promise<string | null> {
    if (!this.mainWindow) return null;

    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    const defaultName = `dex-bundle-${safeName}-${dateStr}.zip`;

    const { canceled, filePath } = await dialog.showSaveDialog(this.mainWindow, {
      title: 'Export Project Bundle',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });

    if (canceled || !filePath) return null;

    try {
      const manifest: BundleManifest = {
        version: '1.0',
        dexVersion: '2.0.1',
        createdAt: Date.now(),
        project: { app: appName, id: projectId, name: projectName },
        contents: [],
      };

      const bundleData: Record<string, any> = {};

      bundleData['project/project.json'] = JSON.stringify(projectData, null, 2);
      manifest.contents.push({ type: 'project', name: projectName, path: 'project/project.json' });

      const db = this.getDb();
      if (db) {
        const versions = db.prepare(
          'SELECT * FROM version_history WHERE app = ? AND project_id = ? ORDER BY timestamp DESC'
        ).all(appName, projectId);

        for (let i = 0; i < versions.length; i++) {
          const key = `versions/snapshot_${i}.json`;
          let snapshotData: string;
          try {
            const raw = versions[i].snapshot instanceof Buffer
              ? versions[i].snapshot.toString('utf-8')
              : String(versions[i].snapshot);
            snapshotData = raw;
          } catch {
            snapshotData = '{}';
          }
          bundleData[key] = snapshotData;
          manifest.contents.push({ type: 'version', name: `Snapshot ${i}`, path: key });
        }

        try {
          const links = db.prepare(
            `SELECT * FROM project_links
             WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)`
          ).all(appName, projectId, appName, projectId);

          for (const link of links) {
            const linkedApp = link.source_app === appName && link.source_id === projectId
              ? link.target_app : link.source_app;
            const linkedId = link.source_app === appName && link.source_id === projectId
              ? link.target_id : link.source_id;

            manifest.contents.push({
              type: 'linked-project', name: `${linkedApp}/${linkedId}`,
              path: `links/${linkedApp}_${linkedId}.json`,
            });
            bundleData[`links/${linkedApp}_${linkedId}.json`] = JSON.stringify(link, null, 2);
          }
        } catch { /* project_links may not exist yet */ }

        try {
          const memos = db.prepare(
            'SELECT * FROM voice_memos WHERE app = ? AND parent_id = ?'
          ).all(appName, projectId);

          for (const memo of memos) {
            if (fs.existsSync(memo.filepath)) {
              const memoFilename = path.basename(memo.filepath);
              bundleData[`memos/${memoFilename}`] = fs.readFileSync(memo.filepath);
              manifest.contents.push({ type: 'voice-memo', name: memoFilename, path: `memos/${memoFilename}` });
            }
          }
        } catch { /* voice_memos may not exist yet */ }
      }

      bundleData['manifest.json'] = JSON.stringify(manifest, null, 2);

      const textManifest = manifest.contents.map(c => `${c.type}: ${c.name} (${c.path})`).join('\n');
      bundleData['manifest.txt'] = `DEX Project Bundle\n${projectName}\n${new Date().toISOString()}\n\nContents:\n${textManifest}`;

      const jsonBundle = JSON.stringify(bundleData);
      const compressed = zlib.gzipSync(Buffer.from(jsonBundle, 'utf-8'));
      fs.writeFileSync(filePath, compressed);

      log.info(`[ExportBundle] Bundle created: ${filePath}`);
      return filePath;
    } catch (err) {
      log.error('[ExportBundle] Bundle creation error:', err);
      return null;
    }
  }

  private registerIPC(): void {
    ipcMain.handle('export-bundle:create', async (_event, appName: string, projectId: string, projectName: string, projectData: any) => {
      return this.createBundle(appName, projectId, projectName, projectData);
    });
  }
}

export const projectExportBundleManager = new ProjectExportBundleManager();
