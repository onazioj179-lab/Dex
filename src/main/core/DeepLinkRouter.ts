// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Deep Link Router
// Internal URL system: dex://appname/resourcetype/resourceid
// Resolves links from notifications, search, rewind, notes.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';

export interface DeepLinkTarget {
  app: string;
  resourceType: string;
  resourceId: string;
}

export interface DeepLinkResolution {
  found: boolean;
  app: string;
  resourceType: string;
  resourceId: string;
  displayName: string;
}

const VALID_APPS = new Set([
  'home', 'files', 'browser', 'settings', 'transfers', 'dashboard',
  'notes', 'tasks', 'power', 'workflows', 'gallery', 'audio', 'video',
  'vinx', 'videoeditor', 'imosion', 'prism', 'flux', 'forge',
  'calculator', 'calendar', 'passwordgenerator', 'rewind',
  'kanban', 'achievements', 'app', 'automation', 'media',
]);

class DeepLinkRouter {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[DeepLink] Deep link router initialized');
  }

  parseLink(url: string): DeepLinkTarget | null {
    if (!url || !url.startsWith('dex://')) return null;

    const stripped = url.replace('dex://', '');
    const parts = stripped.split('/').filter(p => p.length > 0);

    if (parts.length < 1) return null;

    const app = parts[0].toLowerCase();
    const resourceType = parts.length > 1 ? parts[1] : '';
    const resourceId = parts.length > 2 ? parts.slice(2).join('/') : '';

    return { app, resourceType, resourceId };
  }

  async navigate(url: string): Promise<DeepLinkResolution> {
    const target = this.parseLink(url);
    if (!target) {
      return { found: false, app: '', resourceType: '', resourceId: '', displayName: 'Invalid link' };
    }

    if (!VALID_APPS.has(target.app)) {
      return { found: false, app: target.app, resourceType: target.resourceType, resourceId: target.resourceId, displayName: 'Unknown app' };
    }

    let appId = target.app;
    if (appId === 'vinx') appId = 'videoeditor';
    if (appId === 'app') appId = target.resourceType || 'home';

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('deeplink:navigate', {
        app: appId,
        resourceType: target.resourceType,
        resourceId: target.resourceId,
      });

      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();
    }

    const displayName = await this.resolveDisplayName(target);

    return {
      found: true,
      app: target.app,
      resourceType: target.resourceType,
      resourceId: target.resourceId,
      displayName,
    };
  }

  private async resolveDisplayName(target: DeepLinkTarget): Promise<string> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return `${target.app}/${target.resourceType}/${target.resourceId}`;
    }

    try {
      const name = await this.mainWindow.webContents.executeJavaScript(
        `(function() {
          try {
            var app = "${target.app}";
            var type = "${target.resourceType}";
            var id = "${target.resourceId}";

            if (app === 'notes' && type === 'note') {
              var raw = localStorage.getItem('dex-notes');
              if (raw) {
                var notes = JSON.parse(raw);
                var note = notes.find(function(n) { return n.id === id; });
                if (note) return note.title || 'Untitled Note';
              }
            }
            if (app === 'tasks' && type === 'task') {
              var raw2 = localStorage.getItem('dex-tasks');
              if (raw2) {
                var tasks = JSON.parse(raw2);
                var task = tasks.find(function(t) { return t.id === id; });
                if (task) return task.title || 'Untitled Task';
              }
            }
            return app + '/' + type + (id ? '/' + id : '');
          } catch { return app + '/' + type; }
        })()`
      );
      return name || `${target.app}/${target.resourceType}`;
    } catch {
      return `${target.app}/${target.resourceType}/${target.resourceId}`;
    }
  }

  buildLink(app: string, resourceType: string, resourceId: string): string {
    return `dex://${app}/${resourceType}/${resourceId}`;
  }

  extractLinks(text: string): string[] {
    const regex = /dex:\/\/[a-z0-9\-_]+(?:\/[a-z0-9\-_]+)*(?:\/[a-zA-Z0-9\-_]+)*/g;
    const matches = text.match(regex);
    return matches || [];
  }

  private registerIPC(): void {
    ipcMain.handle('deeplink:navigate', async (_event, url: string) => {
      return this.navigate(url);
    });

    ipcMain.handle('deeplink:parse', (_event, url: string) => {
      return this.parseLink(url);
    });

    ipcMain.handle('deeplink:build', (_event, app: string, resourceType: string, resourceId: string) => {
      return this.buildLink(app, resourceType, resourceId);
    });

    ipcMain.handle('deeplink:extractLinks', (_event, text: string) => {
      return this.extractLinks(text);
    });

    ipcMain.handle('deeplink:resolve', async (_event, url: string) => {
      const target = this.parseLink(url);
      if (!target) return { found: false, displayName: 'Invalid link' };
      const displayName = await this.resolveDisplayName(target);
      return { found: true, displayName, app: target.app, resourceType: target.resourceType, resourceId: target.resourceId };
    });
  }

  shutdown(): void {
    log.info('[DeepLink] Shutdown');
  }
}

export const deepLinkRouter = new DeepLinkRouter();

export function initializeDeepLinks(mainWindow: BrowserWindow): void {
  deepLinkRouter.initialize(mainWindow);
}

export function shutdownDeepLinks(): void {
  deepLinkRouter.shutdown();
}
