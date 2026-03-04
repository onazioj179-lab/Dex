// ═══════════════════════════════════════════════════════════════════════════
// DEX - Action Controller
// Executes actions with permission checks
// ═══════════════════════════════════════════════════════════════════════════

import { exec, spawn } from 'child_process';
import { shell } from 'electron';
import * as path from 'path';
import { promisify } from 'util';
import { DexAction, ActionType } from '../../shared/types';
import { PermissionManager } from '../security/PermissionManager';
import { Logger } from '../utils/Logger';

const execAsync = promisify(exec);

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

  // ─────────────────────────────────────────────────────────────────────────
  // Action Implementations
  // ─────────────────────────────────────────────────────────────────────────

  private async openApp(action: DexAction): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `start "" "${action.target}"`;
    } else if (platform === 'darwin') {
      command = `open -a "${action.target}"`;
    } else {
      command = action.target;
    }

    await execAsync(command);
    this.logger.success(`Opened app: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async closeApp(action: DexAction): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `taskkill /IM "${action.target}" /F`;
    } else if (platform === 'darwin') {
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
    const pid = parseInt(action.target);
    let command: string;

    if (isNaN(pid)) {
      return await this.closeApp(action);
    }

    if (platform === 'win32') {
      command = `taskkill /PID ${pid} /F`;
    } else {
      command = `kill -9 ${pid}`;
    }

    await execAsync(command);
    this.logger.success(`Killed process: ${pid}`);
    return { success: true, message: `Killed process ${pid}` };
  }

  private async runCommand(action: DexAction): Promise<{ success: boolean; message: string; data?: any }> {
    const { stdout, stderr } = await execAsync(action.target);
    this.logger.success(`Ran command: ${action.target}`);
    return { 
      success: true, 
      message: 'Command executed',
      data: { stdout, stderr }
    };
  }

  private async runScript(action: DexAction): Promise<{ success: boolean; message: string; data?: any }> {
    const ext = path.extname(action.target).toLowerCase();
    const platform = process.platform;
    let command: string;

    if (ext === '.ps1' && platform === 'win32') {
      command = `powershell -ExecutionPolicy Bypass -File "${action.target}"`;
    } else if (ext === '.bat' || ext === '.cmd') {
      command = `"${action.target}"`;
    } else if (ext === '.sh') {
      command = `bash "${action.target}"`;
    } else if (ext === '.py') {
      command = `python "${action.target}"`;
    } else if (ext === '.js') {
      command = `node "${action.target}"`;
    } else {
      command = `"${action.target}"`;
    }

    const { stdout, stderr } = await execAsync(command);
    this.logger.success(`Ran script: ${action.target}`);
    return {
      success: true,
      message: 'Script executed',
      data: { stdout, stderr }
    };
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
    await shell.openExternal(action.target);
    this.logger.success(`Opened URL: ${action.target}`);
    return { success: true, message: `Opened ${action.target}` };
  }

  private async adjustVolume(action: DexAction): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    const target = action.target.toLowerCase();
    let command: string;

    if (platform === 'win32') {
      if (target === 'mute') {
        // Use PowerShell to mute on Windows
        command = `powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`;
      } else if (target === 'unmute') {
        command = `powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`;
      } else {
        const level = parseInt(target);
        if (!isNaN(level)) {
          // Set volume level using nircmd or PowerShell
          command = `powershell -Command "$wshShell = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $wshShell.SendKeys([char]174) }; 1..${Math.round(level / 2)} | ForEach-Object { $wshShell.SendKeys([char]175) }"`;
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
        const level = parseInt(target);
        if (!isNaN(level)) {
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
        const level = parseInt(target);
        if (!isNaN(level)) {
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
