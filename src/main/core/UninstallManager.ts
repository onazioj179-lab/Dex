// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { app, ipcMain, dialog, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log';
import { cleanupWindowsStartupRegistration } from '../utils/InstallerLifecycle';

type DataOption = 'keep' | 'remove_all';

interface UninstallPlan {
  platform: string;
  dataDirectories: string[];
  configDirectories: string[];
  cacheDirectories: string[];
  registryKeys?: string[];
  totalSizeBytes: number;
}

interface UninstallResult {
  success: boolean;
  removedPaths: string[];
  errors: string[];
}

function getDirectorySize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          size += getDirectorySize(fullPath);
        } else {
          size += fs.statSync(fullPath).size;
        }
      } catch (_err) {
        // Skip inaccessible entries
      }
    }
  } catch (_err) {
    // Skip inaccessible directories
  }
  return size;
}

function getDataDirectories(): string[] {
  const dirs = new Set<string>();
  const platform = process.platform;

  try {
    dirs.add(app.getPath('userData'));
  } catch {
    // App path may be unavailable in test harnesses.
  }

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    for (const appName of ['DEX', 'Dex', 'dex']) {
      dirs.add(path.join(appData, appName));
      dirs.add(path.join(localAppData, appName));
    }
  } else if (platform === 'darwin') {
    dirs.add(path.join(os.homedir(), 'Library', 'Application Support', 'DEX'));
  } else {
    dirs.add(path.join(os.homedir(), '.config', 'DEX'));
    dirs.add(path.join(os.homedir(), '.local', 'share', 'DEX'));
  }

  return Array.from(dirs).filter(dirPath => fs.existsSync(dirPath));
}

function getCacheDirectories(): string[] {
  const dirs = new Set<string>();
  const platform = process.platform;

  try {
    dirs.add(app.getPath('sessionData'));
  } catch {
    // sessionData can be unavailable in older Electron/test contexts.
  }

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    for (const appName of ['DEX', 'Dex', 'dex']) {
      dirs.add(path.join(localAppData, appName, 'Cache'));
      dirs.add(path.join(localAppData, appName, 'Code Cache'));
      dirs.add(path.join(localAppData, appName, 'GPUCache'));
    }
  } else if (platform === 'darwin') {
    dirs.add(path.join(os.homedir(), 'Library', 'Caches', 'DEX'));
    dirs.add(path.join(os.homedir(), 'Library', 'Caches', 'com.dex.app'));
  } else {
    dirs.add(path.join(os.homedir(), '.cache', 'DEX'));
  }

  return Array.from(dirs).filter(dirPath => fs.existsSync(dirPath));
}

function getConfigDirectories(): string[] {
  const dirs: string[] = [];
  const platform = process.platform;

  if (platform === 'darwin') {
    dirs.push(path.join(os.homedir(), 'Library', 'Preferences', 'com.dex.app.plist'));
    dirs.push(path.join(os.homedir(), 'Library', 'Saved Application State', 'com.dex.app.savedState'));
  } else if (platform === 'linux') {
    dirs.push(path.join(os.homedir(), '.config', 'DEX'));
  }

  return dirs.filter(d => fs.existsSync(d));
}

function removeDirectoryRecursive(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
    return true;
  } catch (err) {
    log.error(`[Uninstaller] Failed to remove: ${dirPath}`, err);
    return false;
  }
}

function removeFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return true;
  } catch (err) {
    log.error(`[Uninstaller] Failed to remove file: ${filePath}`, err);
    return false;
  }
}

export class UninstallManager {
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    this.mainWindow = mainWindow || null;
    this.setupIPC();
    this.initialized = true;
    log.info('[UninstallManager] Initialized');
  }

  getPlan(): UninstallPlan {
    const dataDirectories = getDataDirectories();
    const cacheDirectories = getCacheDirectories();
    const configDirectories = getConfigDirectories();

    let totalSize = 0;
    for (const dir of [...dataDirectories, ...cacheDirectories, ...configDirectories]) {
      if (fs.existsSync(dir)) {
        const stat = fs.statSync(dir);
        if (stat.isDirectory()) {
          totalSize += getDirectorySize(dir);
        } else {
          totalSize += stat.size;
        }
      }
    }

    const plan: UninstallPlan = {
      platform: process.platform,
      dataDirectories,
      configDirectories,
      cacheDirectories,
      totalSizeBytes: totalSize
    };

    if (process.platform === 'win32') {
      plan.registryKeys = [
        'HKCU\\Software\\DEX',
        'HKLM\\Software\\DEX'
      ];
    }

    return plan;
  }

  async executeUninstall(dataOption: DataOption): Promise<UninstallResult> {
    const removedPaths: string[] = [];
    const errors: string[] = [];

    try {
      cleanupWindowsStartupRegistration();
      if (process.platform === 'win32') {
        removedPaths.push('Windows startup registration');
      }
    } catch (error) {
      errors.push(`Failed to clear startup registration: ${(error as Error).message}`);
    }

    const cacheDirectories = getCacheDirectories();
    for (const dir of cacheDirectories) {
      if (removeDirectoryRecursive(dir)) {
        removedPaths.push(dir);
      } else {
        errors.push(`Failed to remove cache: ${dir}`);
      }
    }

    if (dataOption === 'remove_all') {
      const dataDirectories = getDataDirectories();
      for (const dir of dataDirectories) {
        if (removeDirectoryRecursive(dir)) {
          removedPaths.push(dir);
        } else {
          errors.push(`Failed to remove data: ${dir}`);
        }
      }

      const configDirectories = getConfigDirectories();
      for (const filePath of configDirectories) {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            if (removeDirectoryRecursive(filePath)) {
              removedPaths.push(filePath);
            } else {
              errors.push(`Failed to remove config: ${filePath}`);
            }
          } else {
            if (removeFile(filePath)) {
              removedPaths.push(filePath);
            } else {
              errors.push(`Failed to remove config file: ${filePath}`);
            }
          }
        }
      }
    }

    log.info(
      `[UninstallManager] Uninstall complete. Removed: ${removedPaths.length} paths. ` +
      `Errors: ${errors.length}. Data option: ${dataOption}`
    );

    return {
      success: errors.length === 0,
      removedPaths,
      errors
    };
  }

  verifyUninstall(): { clean: boolean; remainingPaths: string[] } {
    const remainingPaths: string[] = [];
    const allDirs = [
      ...getDataDirectories(),
      ...getCacheDirectories(),
      ...getConfigDirectories()
    ];

    for (const dir of allDirs) {
      if (fs.existsSync(dir)) {
        remainingPaths.push(dir);
      }
    }

    return {
      clean: remainingPaths.length === 0,
      remainingPaths
    };
  }

  private setupIPC(): void {
    ipcMain.handle('uninstall:get-plan', () => this.getPlan());
    ipcMain.handle('uninstall:execute', async (_e, dataOption: DataOption, confirmText: string) => {
      if (confirmText !== 'confirm') {
        return { success: false, removedPaths: [], errors: ['Confirmation text did not match'] };
      }
      return this.executeUninstall(dataOption);
    });
    ipcMain.handle('uninstall:verify', () => this.verifyUninstall());
  }

  destroy(): void {
    this.mainWindow = null;
    this.initialized = false;
    log.info('[UninstallManager] Destroyed');
  }
}

export const uninstallManager = new UninstallManager();
