// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { app, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface UserProfile {
  username: string;
  dataDirectory: string;
  isFirstRun: boolean;
  createdAt: number;
}

export class MultiUserManager extends EventEmitter {
  private currentUser: UserProfile | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const username = this.detectUsername();
      const dataDir = this.getUserDataDirectory(username);

      this.ensureDirectoryStructure(dataDir);

      const isFirstRun = !fs.existsSync(path.join(dataDir, '.dex-initialized'));

      this.currentUser = {
        username,
        dataDirectory: dataDir,
        isFirstRun,
        createdAt: Date.now()
      };

      if (isFirstRun) {
        fs.writeFileSync(path.join(dataDir, '.dex-initialized'), String(Date.now()), 'utf-8');
      }

      app.setPath('userData', dataDir);

      this.setupIPC();
      this.initialized = true;
      log.info('[MultiUserManager] Initialized for user:', username, 'at', dataDir);
    } catch (err) {
      log.error('[MultiUserManager] Initialization failed:', err);
    }
  }

  private detectUsername(): string {
    const platform = process.platform;
    let username = '';

    if (platform === 'win32') {
      username = process.env.USERNAME || '';
    } else {
      username = process.env.USER || '';
    }

    if (!username) {
      username = os.userInfo().username || 'default';
    }

    return username.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  }

  private getUserDataDirectory(username: string): string {
    const platform = process.platform;

    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'DEX', 'users', username);
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'DEX', 'users', username);
    } else {
      const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(configDir, 'DEX', 'users', username);
    }
  }

  private getSharedGamesDirectory(): string {
    const platform = process.platform;

    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'DEX', 'shared', 'games');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'DEX', 'shared', 'games');
    } else {
      const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(configDir, 'DEX', 'shared', 'games');
    }
  }

  private ensureDirectoryStructure(baseDir: string): void {
    const dirs = [
      baseDir,
      path.join(baseDir, 'databases'),
      path.join(baseDir, 'settings'),
      path.join(baseDir, 'cache'),
      path.join(baseDir, 'exports'),
      path.join(baseDir, 'backups'),
      path.join(baseDir, 'media'),
      path.join(baseDir, 'attachments'),
      path.join(baseDir, 'saves'),
      path.join(baseDir, 'plugins'),
      path.join(baseDir, 'themes'),
      path.join(baseDir, 'logs'),
      path.join(baseDir, 'temp')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const sharedGames = this.getSharedGamesDirectory();
    if (!fs.existsSync(sharedGames)) {
      fs.mkdirSync(sharedGames, { recursive: true });
    }
  }

  getUsername(): string {
    return this.currentUser?.username || 'default';
  }

  getDataDirectory(): string {
    return this.currentUser?.dataDirectory || app.getPath('userData');
  }

  isFirstRun(): boolean {
    return this.currentUser?.isFirstRun || false;
  }

  getSharedDirectory(): string {
    return this.getSharedGamesDirectory();
  }

  getDatabasePath(dbName: string): string {
    return path.join(this.getDataDirectory(), 'databases', dbName);
  }

  getSettingsPath(fileName: string): string {
    return path.join(this.getDataDirectory(), 'settings', fileName);
  }

  getCachePath(fileName: string): string {
    return path.join(this.getDataDirectory(), 'cache', fileName);
  }

  getBackupPath(): string {
    return path.join(this.getDataDirectory(), 'backups');
  }

  getExportPath(): string {
    return path.join(this.getDataDirectory(), 'exports');
  }

  getMediaPath(): string {
    return path.join(this.getDataDirectory(), 'media');
  }

  getKeychainServiceName(): string {
    return `DEX-${this.getUsername()}`;
  }

  private setupIPC(): void {
    ipcMain.handle('multiuser:get-username', () => {
      return this.getUsername();
    });

    ipcMain.handle('multiuser:get-data-directory', () => {
      return this.getDataDirectory();
    });

    ipcMain.handle('multiuser:is-first-run', () => {
      return this.isFirstRun();
    });

    ipcMain.handle('multiuser:get-profile', () => {
      return this.currentUser ? {
        username: this.currentUser.username,
        dataDirectory: this.currentUser.dataDirectory,
        isFirstRun: this.currentUser.isFirstRun
      } : null;
    });
  }

  destroy(): void {
    this.currentUser = null;
    this.initialized = false;
    log.info('[MultiUserManager] Destroyed');
  }
}

export const multiUserManager = new MultiUserManager();
