// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Action Controller
// Executes actions with permission checks
// ===========================================================================

import { exec, spawn } from 'child_process';
import { shell } from 'electron';
import * as path from 'path';
import { promisify } from 'util';
import { DexAction, ActionType } from '../../shared/types';
import { PermissionManager } from '../security/PermissionManager';
import { Logger } from '../utils/Logger';
import { NativeProcesses, isNativeAvailable } from '../native/bridge';

const execAsync = promisify(exec);

// Shell-dangerous characters that must never appear in unquoted targets.
// This catches common injection vectors: ; & | ` $ ( ) { } < > \n
const SHELL_METACHAR_RE = /[;&|`$(){}\n\r<>!\\]/;

/** Reject targets containing shell metacharacters. */
function assertSafeTarget(target: string, context: string): void {
  if (!target || typeof target !== 'string') {
    throw new Error(`[ActionController] ${context}: empty target`);
  }
  if (SHELL_METACHAR_RE.test(target)) {
    throw new Error(`[ActionController] ${context}: target contains forbidden characters`);
  }
}

// Action types that are permanently blocked from renderer invocation.
// These give full shell/script execution and are only available via
// internal automation pipelines with governance approval.
const BLOCKED_ACTION_TYPES: ReadonlySet<string> = new Set(['run-command', 'run-script', 'custom']);

export class ActionController {
  private permissionManager: PermissionManager;
  private logger: Logger;

  constructor(permissionManager: PermissionManager, logger: Logger) {
    this.permissionManager = permissionManager;
    this.logger = logger;
  }

  async execute(action: DexAction): Promise<{ success: boolean; message: string; data?: any }> {
    this.logger.info(`Executing action: ${action.name} (${action.type})`);

    try {
      // Block dangerous action types from renderer
      if (BLOCKED_ACTION_TYPES.has(action.type)) {
        this.logger.warn(`Blocked action type: ${action.type}`);
        return { success: false, message: `Action type ${action.type} is disabled for security` };
      }

      // Check permissions first
      const hasPermission = await this.checkPermission(action.type);
      if (!hasPermission) {
        this.logger.warn(`Permission denied for action: ${action.name}`);
        return { success: false, message: `Permission denied for ${action.type}` };
      }

      // Execute based on action type
      switch (action.type) {
        case 'open-app':
          return await this.openApp(action);
        case 'close-app':
          return await this.closeApp(action);
        case 'kill-process':
          return await this.killProcess(action);
        case 'run-command':
          return await this.runCommand(action);
        case 'run-script':
          return await this.runScript(action);
        case 'open-file':
          return await this.openFile(action);
        case 'open-folder':
          return await this.openFolder(action);
        case 'open-url':
          return await this.openUrl(action);
        case 'volume':
          return await this.adjustVolume(action);
        case 'notification':
          return await this.showNotification(action);
        default:
          return { success: false, message: `Unknown action type: ${action.type}` };
      }
    } catch (error: any) {
      this.logger.error(`Action failed: ${action.name}`, error);
      return { success: false, message: error.message };
    }
  }

  private async checkPermission(actionType: ActionType): Promise<boolean> {
    const permissionMap: Record<ActionType, string> = {
      'open-app': 'openApps',
      'close-app': 'closeApps',
      'kill-process': 'closeApps',
      'run-command': 'runCommands',
      'run-script': 'runCommands',
      'open-file': 'fileSystem',
      'open-folder': 'fileSystem',
      'open-url': 'openApps',
      'volume': 'adjustVolume',
      'notification': 'openApps',
      'custom': 'runCommands',
    };

    const permission = permissionMap[actionType];
    return this.permissionManager.hasPermission(permission as any);
  }

  // -------------------------------------------------------------------------
  // Action Implementations
  // -------------------------------------------------------------------------

  private async openApp(action: DexAction): Promise<{ success: boolean; message: string }> {
    assertSafeTarget(action.target, 'openApp');
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `start "" "${action.target}"`;
    } else if (platform === 'darwin') {
      command = `open -a "${action.target}"`;
    } else {
      command = `"${action.target}"`;
    }

    await execAsync(command);
    this.logger.success(`Opened app: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async closeApp(action: DexAction): Promise<{ success: boolean; message: string }> {
    assertSafeTarget(action.target, 'closeApp');
    const platform = process.platform;

    // Use native module (AV-safe) on Windows when available
    if (platform === 'win32' && isNativeAvailable()) {
      const result = NativeProcesses.closeByName(action.target, true);
      if (result.success) {
        this.logger.success(`Closed app: ${action.target}`);
      }
      return result;
    }

    // Fallback for macOS/Linux or when native unavailable
    let command: string;
    if (platform === 'darwin') {
      command = `pkill -x "${action.target}"`;
    } else {
      command = `pkill "${action.target}"`;
    }

    try {
      await execAsync(command);
      this.logger.success(`Closed app: ${action.target}`);
      return { success: true, message: `Closed ${action.target}` };
    } catch (error: any) {
      // Process might not be running, which is fine
      if (error.code === 128 || error.message.includes('not found')) {
        return { success: true, message: `${action.target} was not running` };
      }
      throw error;
    }
  }

  private async killProcess(action: DexAction): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    const pid = parseInt(action.target, 10);

    if (isNaN(pid) || pid <= 0 || String(pid) !== action.target.trim()) {
      // Only allow exact numeric PIDs — no name-based kill from this path
      return { success: false, message: 'kill-process requires a numeric PID' };
    }

    // Use native module (AV-safe) when available
    if (isNativeAvailable()) {
      const result = NativeProcesses.close(pid, true);
      if (result.success) {
        this.logger.success(`Killed process: ${pid}`);
      }
      return result;
    }

    // Fallback for when native is unavailable
    let command: string;
    if (platform === 'win32') {
      // Use PowerShell Stop-Process instead of taskkill for AV safety
      command = `powershell -NoProfile -NonInteractive -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`;
    } else {
      command = `kill -9 ${pid}`;
    }

    await execAsync(command);
    this.logger.success(`Killed process: ${pid}`);
    return { success: true, message: `Killed process ${pid}` };
  }

  private async runCommand(action: DexAction): Promise<{ success: boolean; message: string; data?: any }> {
    // Blocked by BLOCKED_ACTION_TYPES above; this is a second safety net
    return { success: false, message: 'run-command is disabled for security' };
  }

  private async runScript(action: DexAction): Promise<{ success: boolean; message: string; data?: any }> {
    // Blocked by BLOCKED_ACTION_TYPES above; this is a second safety net
    return { success: false, message: 'run-script is disabled for security' };
  }

  private async openFile(action: DexAction): Promise<{ success: boolean; message: string }> {
    await shell.openPath(action.target);
    this.logger.success(`Opened file: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async openFolder(action: DexAction): Promise<{ success: boolean; message: string }> {
    await shell.openPath(action.target);
    this.logger.success(`Opened folder: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async openUrl(action: DexAction): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = new URL(action.target);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, message: `Blocked URL with protocol: ${parsed.protocol}` };
      }
    } catch {
      return { success: false, message: `Invalid URL: ${action.target}` };
    }
    await shell.openExternal(action.target);
    this.logger.success(`Opened URL: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async adjustVolume(action: DexAction): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    const target = action.target.toLowerCase().trim();
    let command: string;

    // Parse and clamp volume level for numeric targets
    const parseLevel = (): number | null => {
      const level = parseInt(target, 10);
      if (isNaN(level)) return null;
      return Math.max(0, Math.min(100, level));
    };

    if (platform === 'win32') {
      if (target === 'mute') {
        command = `powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`;
      } else if (target === 'unmute') {
        command = `powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`;
      } else {
        const level = parseLevel();
        if (level !== null) {
          command = `powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "$wshShell = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $wshShell.SendKeys([char]174) }; 1..${Math.round(level / 2)} | ForEach-Object { $wshShell.SendKeys([char]175) }"`;
        } else {
          return { success: false, message: 'Invalid volume level' };
        }
      }
    } else if (platform === 'darwin') {
      if (target === 'mute') {
        command = 'osascript -e "set volume output muted true"';
      } else if (target === 'unmute') {
        command = 'osascript -e "set volume output muted false"';
      } else {
        const level = parseLevel();
        if (level !== null) {
          command = `osascript -e "set volume output volume ${level}"`;
        } else {
          return { success: false, message: 'Invalid volume level' };
        }
      }
    } else {
      // Linux with pactl
      if (target === 'mute') {
        command = 'pactl set-sink-mute @DEFAULT_SINK@ toggle';
      } else if (target === 'unmute') {
        command = 'pactl set-sink-mute @DEFAULT_SINK@ 0';
      } else {
        const level = parseLevel();
        if (level !== null) {
          command = `pactl set-sink-volume @DEFAULT_SINK@ ${level}%`;
        } else {
          return { success: false, message: 'Invalid volume level' };
        }
      }
    }

    await execAsync(command);
    this.logger.success(`Volume adjusted: ${target}`);
    return { success: true, message: `Volume set to ${target}` };
  }

  private async showNotification(action: DexAction): Promise<{ success: boolean; message: string }> {
    const { Notification } = await import('electron');
    
    new Notification({
      title: 'Dex',
      body: action.target,
    }).show();

    this.logger.info(`Notification shown: ${action.target}`);
    return { success: true, message: 'Notification displayed' };
  }
}
