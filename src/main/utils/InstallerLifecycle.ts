// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { app } from 'electron';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import log from 'electron-log';

export type InstallerLifecycleAction = 'install' | 'update' | 'uninstall' | 'obsolete' | 'cleanup-before-uninstall';

const ACTION_BY_ARG: Record<string, InstallerLifecycleAction> = {
  '--squirrel-install': 'install',
  '--squirrel-updated': 'update',
  '--squirrel-uninstall': 'uninstall',
  '--squirrel-obsolete': 'obsolete',
  '--uninstall': 'uninstall',
  '/uninstall': 'uninstall',
  '--remove': 'uninstall',
  '/remove': 'uninstall',
  '--cleanup-before-uninstall': 'cleanup-before-uninstall',
};

const WINDOWS_RUN_VALUE_NAMES = [
  'DEX',
  'Dex',
  'dex',
  'com.onazioj.dex',
  'com.dex.app',
];

function normalizeArg(value: string): string {
  return value.trim().toLowerCase();
}

export function getInstallerLifecycleAction(commandLine: string[] = process.argv): InstallerLifecycleAction | null {
  for (const rawArg of commandLine) {
    const arg = normalizeArg(rawArg);
    const directMatch = ACTION_BY_ARG[arg];
    if (directMatch) return directMatch;

    const splitArg = arg.split('=')[0];
    const splitMatch = ACTION_BY_ARG[splitArg];
    if (splitMatch) return splitMatch;
  }

  return null;
}

export function isUninstallLifecycleAction(action: InstallerLifecycleAction | null): boolean {
  return action === 'uninstall' || action === 'obsolete' || action === 'cleanup-before-uninstall';
}

export function isUninstallLifecycleCommand(commandLine: string[] = process.argv): boolean {
  return isUninstallLifecycleAction(getInstallerLifecycleAction(commandLine));
}

function runHidden(command: string, args: string[]): void {
  try {
    execFileSync(command, args, {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 3000,
    });
  } catch {
    // Missing registry values or access-denied HKLM cleanup are expected on some installs.
  }
}

function deleteRegistryRunValue(root: 'HKCU' | 'HKLM', valueName: string): void {
  runHidden('reg.exe', [
    'delete',
    `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`,
    '/v',
    valueName,
    '/f',
  ]);
}

function removeFileIfPresent(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch (error) {
    log.warn('[InstallerLifecycle] Failed to remove file:', filePath, error);
  }
}

function getWindowsStartupShortcutPaths(): string[] {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const relativeStartupPath = path.join('Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const names = ['DEX.lnk', 'Dex.lnk', 'dex.lnk'];

  return [
    ...names.map(name => path.join(appData, relativeStartupPath, name)),
    ...names.map(name => path.join(programData, relativeStartupPath, name)),
  ];
}

export function cleanupWindowsStartupRegistration(): void {
  if (process.platform !== 'win32') return;

  try {
    app.setLoginItemSettings({
      openAtLogin: false,
      openAsHidden: false,
      path: process.execPath,
      args: [],
    });
  } catch (error) {
    log.warn('[InstallerLifecycle] Failed to clear Electron login item:', error);
  }

  for (const valueName of WINDOWS_RUN_VALUE_NAMES) {
    deleteRegistryRunValue('HKCU', valueName);
    deleteRegistryRunValue('HKLM', valueName);
  }

  for (const shortcutPath of getWindowsStartupShortcutPaths()) {
    removeFileIfPresent(shortcutPath);
  }
}

export function cleanupInstallerLifecycle(action: InstallerLifecycleAction): void {
  if (isUninstallLifecycleAction(action)) {
    log.info(`[InstallerLifecycle] Cleaning uninstall lifecycle state (${action})`);
    cleanupWindowsStartupRegistration();
    return;
  }

  if (process.platform === 'win32') {
    cleanupWindowsStartupRegistration();
  }
}