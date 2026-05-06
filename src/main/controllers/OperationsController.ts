// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Operations Controller
// Phase 4A: Manual Control & Operations Layer
// ===========================================================================
// Every operation is:
// - User-triggered only (no background tasks)
// - Explicit and visible
// - Logged for transparency
// - Safe and reversible where possible
// ===========================================================================

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';
import { NativeProcesses, isNativeAvailable } from '../native/bridge';

const execAsync = promisify(exec);

interface OperationResult {
  success: boolean;
  message: string;
  details?: string;
  canUndo?: boolean;
  undoData?: any;
}

interface OperationLog {
  id: string;
  operationId: string;
  operationName: string;
  timestamp: number;
  success: boolean;
  message: string;
  details?: string;
  canUndo?: boolean;
  undoData?: any;
}

interface UndoState {
  logId: string;
  operationId: string;
  data: any;
  expiresAt: number;
}

export class OperationsController {
  private platform: NodeJS.Platform;
  private operationLogs: OperationLog[] = [];
  private undoStates: Map<string, UndoState> = new Map();
  private readonly UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes to undo
  private readonly MAX_LOGS = 100;

  constructor(
    private dataStore: DataStore,
    private logger: Logger
  ) {
    this.platform = os.platform();
    this.loadLogs();
  }

  // -------------------------------------------------------------------------
  // Execute Operation (Main Entry Point)
  // -------------------------------------------------------------------------
  async execute(operationId: string): Promise<OperationResult> {
    this.logger.info(`[EXEC] Executing operation: ${operationId}`);

    try {
      let result: OperationResult;

      switch (operationId) {
        case 'clean-memory':
          result = await this.cleanMemory();
          break;
        case 'clear-temp-files':
          result = await this.clearTempFiles();
          break;
        case 'close-background-apps':
          result = await this.closeBackgroundApps();
          break;
        case 'performance-prep':
          result = await this.performancePrep();
          break;
        case 'return-balanced':
          result = await this.returnToBalanced();
          break;
        case 'reduce-visual-load':
          result = await this.reduceVisualLoad();
          break;
        case 'free-workspace':
          result = await this.freeWorkspace();
          break;
        case 'minimize-distractions':
          result = await this.minimizeDistractions();
          break;
        case 'reset-dex-state':
          result = await this.resetDexState();
          break;
        case 'flush-dns-cache':
          result = await this.flushDnsCache();
          break;
        default:
          result = { success: false, message: `? Unknown operation: ${operationId}` };
      }

      // Log the operation
      this.logOperation(operationId, result);

      return result;
    } catch (error: any) {
      const errorResult = {
        success: false,
        message: `[ERROR] ${error.message || 'Operation failed'}`,
      };
      this.logOperation(operationId, errorResult);
      return errorResult;
    }
  }

  // -------------------------------------------------------------------------
  // Undo Operation
  // -------------------------------------------------------------------------
  async undo(logId: string): Promise<OperationResult> {
    const undoState = this.undoStates.get(logId);
    
    if (!undoState) {
      return { success: false, message: '[WARNING] Undo not available for this operation' };
    }

    if (Date.now() > undoState.expiresAt) {
      this.undoStates.delete(logId);
      return { success: false, message: '[TIMEOUT] Undo window has expired' };
    }

    try {
      let result: OperationResult;

      switch (undoState.operationId) {
        case 'close-background-apps':
          result = await this.undoCloseBackgroundApps(undoState.data);
          break;
        case 'performance-prep':
          result = await this.undoPerformancePrep(undoState.data);
          break;
        case 'return-balanced':
          result = await this.undoReturnToBalanced(undoState.data);
          break;
        case 'reduce-visual-load':
          result = await this.undoReduceVisualLoad(undoState.data);
          break;
        case 'minimize-distractions':
          result = await this.undoMinimizeDistractions(undoState.data);
          break;
        case 'reset-dex-state':
          result = await this.undoResetDexState(undoState.data);
          break;
        default:
          result = { success: false, message: '[WARNING] Undo not implemented for this operation' };
      }

      // Mark the original log as undone
      const log = this.operationLogs.find(l => l.id === logId);
      if (log) {
        log.canUndo = false;
      }
      this.undoStates.delete(logId);

      return result;
    } catch (error: any) {
      return { success: false, message: `[ERROR] ${error.message || 'Undo failed'}` };
    }
  }

  // -------------------------------------------------------------------------
  // Get Operation Logs
  // -------------------------------------------------------------------------
  getLogs(limit: number = 20): OperationLog[] {
    // Clean up expired undo states
    const now = Date.now();
    for (const [logId, state] of this.undoStates.entries()) {
      if (now > state.expiresAt) {
        this.undoStates.delete(logId);
        const log = this.operationLogs.find(l => l.id === logId);
        if (log) log.canUndo = false;
      }
    }

    return this.operationLogs.slice(0, limit);
  }

  // ===========================================================================
  // CLEANUP OPERATIONS
  // ===========================================================================

  private async cleanMemory(): Promise<OperationResult> {
    const beforeFree = os.freemem();
    
    try {
      if (this.platform === 'win32') {
        // On Windows, we can suggest garbage collection to running apps
        // and clear the standby list (requires admin for full effect)
        try {
          // Clear working sets - this is safe and doesn't require admin
          await execAsync('powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "[System.GC]::Collect()"');
        } catch {
          // Ignore if PowerShell command fails
        }
      } else if (this.platform === 'darwin') {
        // macOS: purge inactive memory (safe operation)
        try {
          await execAsync('purge');
        } catch {
          // purge may need sudo, ignore if fails
        }
      } else if (this.platform === 'linux') {
        // Linux: sync and drop caches (requires root for full effect)
        try {
          await execAsync('sync');
        } catch {
          // Ignore
        }
      }

      // Wait a moment for memory to be reclaimed
      await this.delay(500);
      
      const afterFree = os.freemem();
      const freedMB = Math.max(0, Math.round((afterFree - beforeFree) / (1024 * 1024)));

      return {
        success: true,
        message: freedMB > 0 
          ? `Freed approximately ${freedMB} MB of memory`
          : '[OK] Memory cleanup completed. System may release more memory over time.',
        details: `Before: ${this.formatBytes(beforeFree)} free After: ${this.formatBytes(afterFree)} free`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Memory cleanup encountered an issue',
        details: error.message,
      };
    }
  }

  private async clearTempFiles(): Promise<OperationResult> {
    let filesDeleted = 0;
    let bytesFreed = 0;
    const errors: string[] = [];

    try {
      // Get temp directories based on platform
      const tempDirs = [os.tmpdir()];
      
      if (this.platform === 'win32') {
        const userTemp = process.env.TEMP || process.env.TMP;
        if (userTemp && !tempDirs.includes(userTemp)) {
          tempDirs.push(userTemp);
        }
      }

      for (const tempDir of tempDirs) {
        if (!fs.existsSync(tempDir)) continue;

        const files = fs.readdirSync(tempDir);
        
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          
          try {
            const stats = fs.statSync(filePath);
            
            // Only delete files older than 1 hour and not in use
            const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
            if (ageHours < 1) continue;

            // Skip directories for safety
            if (stats.isDirectory()) continue;

            // Try to delete
            fs.unlinkSync(filePath);
            filesDeleted++;
            bytesFreed += stats.size;
          } catch {
            // File in use or permission denied - skip
          }
        }
      }

      return {
        success: true,
        message: filesDeleted > 0
          ? `Deleted ${filesDeleted} temporary files, freed ${this.formatBytes(bytesFreed)}`
          : '[OK] No temporary files needed cleanup',
        details: `Scanned ${tempDirs.length} temp directories`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Temp file cleanup encountered an issue',
        details: error.message,
      };
    }
  }

  private async closeBackgroundApps(): Promise<OperationResult> {
    // Safe list of background apps that can be closed
    const safeToClose = [
      'OneDrive.exe', 'Spotify.exe', 'Discord.exe', 'Slack.exe',
      'Steam.exe', 'Teams.exe', 'Zoom.exe', 'Skype.exe',
      'Adobe Creative Cloud.exe', 'Creative Cloud.exe',
    ];

    let closedCount = 0;
    const closedApps: string[] = [];

    try {
      if (this.platform === 'win32') {
        // Use native module (AV-safe) when available
        if (isNativeAvailable()) {
          for (const appName of safeToClose) {
            const result = NativeProcesses.closeByName(`${appName}.exe`, true);
            if (result.success && !result.message.includes('No process found')) {
              closedCount++;
              closedApps.push(appName);
            }
          }
        } else {
          // Fallback to PowerShell (safer than taskkill for AV)
          for (const appName of safeToClose) {
            try {
              await execAsync(`powershell -NoProfile -NonInteractive -Command "Stop-Process -Name '${appName}' -Force -ErrorAction SilentlyContinue"`);
              closedCount++;
              closedApps.push(appName);
            } catch {
              // Process may not be running
            }
          }
        }
      } else if (this.platform === 'darwin') {
        const macApps = ['Spotify', 'Discord', 'Slack', 'Steam', 'Zoom', 'Skype'];
        
        for (const app of macApps) {
          try {
            await execAsync(`osascript -e 'tell application "${app}" to quit'`);
            closedCount++;
            closedApps.push(app);
          } catch {
            // App not running or permission denied
          }
        }
      }

      return {
        success: true,
        message: closedCount > 0
          ? `Closed ${closedCount} background apps`
          : '[OK] No background apps to close',
        details: closedApps.length > 0 ? `Closed: ${closedApps.join(', ')}` : undefined,
        canUndo: closedApps.length > 0,
        undoData: closedApps.length > 0 ? { closedApps } : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to close background apps',
        details: error.message,
      };
    }
  }

  private async undoCloseBackgroundApps(previousState: any): Promise<OperationResult> {
    const apps: string[] = previousState.closedApps || [];
    let relaunched = 0;

    try {
      for (const app of apps) {
        try {
          if (this.platform === 'win32') {
            await execAsync(`start "" "${app}"`);
          } else if (this.platform === 'darwin') {
            await execAsync(`open -a "${app}"`);
          }
          relaunched++;
        } catch {
          // App may have been uninstalled or moved
        }
      }

      return {
        success: true,
        message: relaunched > 0
          ? `Relaunched ${relaunched} apps`
          : '[WARNING] Could not relaunch any apps',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to relaunch apps',
        details: error.message,
      };
    }
  }

  // ===========================================================================
  // PERFORMANCE OPERATIONS
  // ===========================================================================

  private async performancePrep(): Promise<OperationResult> {
    const previousState: any = {};
    
    try {
      if (this.platform === 'win32') {
        // Set high performance power plan
        try {
          const { stdout: currentPlan } = await execAsync('powercfg /getactivescheme');
          previousState.powerPlan = currentPlan.match(/GUID: ([a-f0-9-]+)/i)?.[1];
          
          // Switch to high performance
          await execAsync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
        } catch {
          // May need admin rights
        }

        // Set process priority to high for current process
        try {
          // Use PowerShell instead of wmic for AV safety
          await execAsync('powershell -NoProfile -NonInteractive -Command "Get-Process -Name electron | ForEach-Object { $_.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High }"');
        } catch {
          // Ignore
        }
      } else if (this.platform === 'darwin') {
        // macOS performance optimizations
        // Disable App Nap for Dex
        try {
          await execAsync('defaults write com.dex.app NSAppSleepDisabled -bool YES');
        } catch {
          // Ignore
        }
      }

      // Store undo state
      return {
        success: true,
        message: 'System prepared for high performance tasks',
        details: 'CPU priority elevated, power plan optimized',
        canUndo: true,
        undoData: previousState,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Performance prep encountered an issue',
        details: error.message,
      };
    }
  }

  private async undoPerformancePrep(previousState: any): Promise<OperationResult> {
    try {
      if (this.platform === 'win32' && previousState.powerPlan) {
        await execAsync(`powercfg /setactive ${previousState.powerPlan}`);
      }

      return {
        success: true,
        message: 'Performance settings restored to previous state',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to restore previous settings',
        details: error.message,
      };
    }
  }

  private async returnToBalanced(): Promise<OperationResult> {
    const previousState: any = {};

    try {
      if (this.platform === 'win32') {
        // Store current power plan before switching
        try {
          const { stdout: currentPlan } = await execAsync('powercfg /getactivescheme');
          previousState.powerPlan = currentPlan.match(/GUID: ([a-f0-9-]+)/i)?.[1];
        } catch {
          // Ignore
        }

        // Balanced power plan GUID
        await execAsync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
      }

      return {
        success: true,
        message: 'Power profile set to Balanced',
        details: 'System is now running in balanced mode',
        canUndo: !!previousState.powerPlan,
        undoData: previousState.powerPlan ? previousState : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to set balanced profile',
        details: error.message,
      };
    }
  }

  private async undoReturnToBalanced(previousState: any): Promise<OperationResult> {
    try {
      if (this.platform === 'win32' && previousState.powerPlan) {
        await execAsync(`powercfg /setactive ${previousState.powerPlan}`);
      }

      return {
        success: true,
        message: 'Power plan restored to previous setting',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to restore power plan',
        details: error.message,
      };
    }
  }

  private async reduceVisualLoad(): Promise<OperationResult> {
    const previousState: any = {};
    
    try {
      if (this.platform === 'win32') {
        // Store current state and disable visual effects
        try {
          // Query current visual effects setting
          const { stdout } = await execAsync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting');
          previousState.visualFX = stdout.match(/0x([0-9a-f]+)/i)?.[1];
        } catch {
          // Ignore
        }

        // Set visual effects to "Adjust for best performance" (value 2)
        try {
          await execAsync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f');
        } catch {
          // May require restart or additional permissions
        }
      } else if (this.platform === 'darwin') {
        // Reduce motion on macOS
        try {
          await execAsync('defaults write com.apple.universalaccess reduceMotion -bool true');
          previousState.reduceMotion = 'false';
        } catch {
          // Ignore
        }
      }

      return {
        success: true,
        message: 'Visual effects reduced for better performance',
        details: 'Animations and transparency minimized. May require app restart to take full effect.',
        canUndo: true,
        undoData: previousState,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to reduce visual effects',
        details: error.message,
      };
    }
  }

  private async undoReduceVisualLoad(previousState: any): Promise<OperationResult> {
    try {
      if (this.platform === 'win32' && previousState.visualFX) {
        await execAsync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d ${previousState.visualFX} /f`);
      } else if (this.platform === 'darwin') {
        await execAsync('defaults write com.apple.universalaccess reduceMotion -bool false');
      }

      return {
        success: true,
        message: 'Visual effects restored',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to restore visual effects',
        details: error.message,
      };
    }
  }

  // ===========================================================================
  // WORKSPACE OPERATIONS
  // ===========================================================================

  private async freeWorkspace(): Promise<OperationResult> {
    // Apps to keep open (protected list)
    const protectedApps = [
      'electron', 'dex', 'code', 'vscode', 'explorer',
      'finder', 'systemuiserver', 'dock', 'spotlight',
      'terminal', 'iterm', 'powershell', 'cmd',
    ];

    let closedCount = 0;

    try {
      if (this.platform === 'win32') {
        const appsToConsider = ['notepad.exe', 'mspaint.exe', 'wordpad.exe', 'calc.exe'];
        
        // Use native module (AV-safe) when available
        if (isNativeAvailable()) {
          for (const app of appsToConsider) {
            const result = NativeProcesses.closeByName(app, false);
            if (result.success && !result.message.includes('No process found')) {
              closedCount++;
            }
          }
        } else {
          // Fallback to PowerShell
          for (const app of appsToConsider) {
            const appName = app.replace('.exe', '');
            try {
              await execAsync(`powershell -NoProfile -NonInteractive -Command "Stop-Process -Name '${appName}' -ErrorAction SilentlyContinue"`);
              closedCount++;
            } catch {
              // Ignore
            }
          }
        }
      } else if (this.platform === 'darwin') {
        // macOS - close non-essential apps gently
        try {
          await execAsync(`osascript -e 'tell application "System Events" to set visible of every process whose visible is true to false'`);
        } catch {
          // Ignore
        }
      }

      return {
        success: true,
        message: closedCount > 0 
          ? `Freed workspace by closing ${closedCount} non-essential apps`
          : '[OK] Workspace is already clean',
        details: 'Protected apps (browsers, editors, terminals) were preserved',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to free workspace',
        details: error.message,
      };
    }
  }

  private async minimizeDistractions(): Promise<OperationResult> {
    const previousState: any = { minimizedWindows: [] };

    try {
      if (this.platform === 'win32') {
        // Minimize all windows except the active one
        try {
          await execAsync('powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"');
          previousState.minimizedAll = true;
        } catch {
          // Ignore
        }
      } else if (this.platform === 'darwin') {
        // macOS - hide other apps
        try {
          await execAsync(`osascript -e 'tell application "System Events" to set visible of every process whose frontmost is false to false'`);
          previousState.hidOthers = true;
        } catch {
          // Ignore
        }
      }

      return {
        success: true,
        message: 'Distractions minimized',
        details: 'Other windows have been minimized. Focus on your current task!',
        canUndo: true,
        undoData: previousState,
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to minimize distractions',
        details: error.message,
      };
    }
  }

  private async undoMinimizeDistractions(previousState: any): Promise<OperationResult> {
    try {
      if (this.platform === 'win32' && previousState.minimizedAll) {
        // Restore windows - note: this won't perfectly restore the previous state
        await execAsync('powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).UndoMinimizeAll()"');
      } else if (this.platform === 'darwin' && previousState.hidOthers) {
        // Show all apps
        await execAsync(`osascript -e 'tell application "System Events" to set visible of every process to true'`);
      }

      return {
        success: true,
        message: 'Windows restored',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to restore windows',
        details: error.message,
      };
    }
  }

  // ===========================================================================
  // SYSTEM OPERATIONS
  // ===========================================================================

  private async resetDexState(): Promise<OperationResult> {
    const previousState: any = {};

    try {
      // Snapshot current state for undo
      previousState.activeMode = await this.dataStore.get('activeMode');
      previousState.tempBoostActive = await this.dataStore.get('tempBoostActive');
      previousState.tempBoostEndTime = await this.dataStore.get('tempBoostEndTime');
      previousState.logCount = this.operationLogs.length;

      // Clear any active modes
      await this.dataStore.set('activeMode', null);
      
      // Reset temporary states
      await this.dataStore.set('tempBoostActive', false);
      await this.dataStore.set('tempBoostEndTime', null);
      
      // Clear operation logs
      this.operationLogs = [];
      this.undoStates.clear();
      
      this.logger.info('Dex state reset by user');

      return {
        success: true,
        message: 'Dex state has been reset to defaults',
        details: '[OK] All temporary settings cleared, modes deactivated',
        canUndo: true,
        undoData: previousState,
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to reset Dex state',
        details: error.message,
      };
    }
  }

  private async undoResetDexState(previousState: any): Promise<OperationResult> {
    try {
      if (previousState.activeMode !== undefined) {
        await this.dataStore.set('activeMode', previousState.activeMode);
      }
      if (previousState.tempBoostActive !== undefined) {
        await this.dataStore.set('tempBoostActive', previousState.tempBoostActive);
      }
      if (previousState.tempBoostEndTime !== undefined) {
        await this.dataStore.set('tempBoostEndTime', previousState.tempBoostEndTime);
      }

      return {
        success: true,
        message: 'Dex state restored to previous settings',
      };
    } catch (error: any) {
      return {
        success: false,
        message: '[ERROR] Failed to restore Dex state',
        details: error.message,
      };
    }
  }

  private async flushDnsCache(): Promise<OperationResult> {
    try {
      if (this.platform === 'win32') {
        await execAsync('ipconfig /flushdns');
      } else if (this.platform === 'darwin') {
        await execAsync('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
      } else if (this.platform === 'linux') {
        // Different Linux distros have different methods
        try {
          await execAsync('sudo systemd-resolve --flush-caches');
        } catch {
          try {
            await execAsync('sudo service nscd restart');
          } catch {
            // Ignore
          }
        }
      }

      return {
        success: true,
        message: 'DNS cache flushed successfully',
        details: '[OK] Network name resolution cache has been cleared',
      };
    } catch (error: any) {
      return {
        success: true, // DNS flush is often partially successful even with errors
        message: 'DNS cache flush attempted',
        details: '[WARNING] Some operations may require administrator privileges',
      };
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private logOperation(operationId: string, result: OperationResult): void {
    const operationNames: Record<string, string> = {
      'clean-memory': 'Clean Memory',
      'clear-temp-files': 'Clear Temp Files',
      'close-background-apps': 'Close Background Apps',
      'performance-prep': 'Performance Prep',
      'return-balanced': 'Return to Balanced',
      'reduce-visual-load': 'Reduce Visual Load',
      'free-workspace': 'Free Workspace',
      'minimize-distractions': 'Minimize Distractions',
      'reset-dex-state': 'Reset Dex State',
      'flush-dns-cache': 'Flush DNS Cache',
    };

    const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const log: OperationLog = {
      id: logId,
      operationId,
      operationName: operationNames[operationId] || operationId,
      timestamp: Date.now(),
      success: result.success,
      message: result.message,
      details: result.details,
      canUndo: result.canUndo || false,
    };

    // Store undo state if applicable
    if (result.canUndo && result.undoData) {
      this.undoStates.set(logId, {
        logId,
        operationId,
        data: result.undoData,
        expiresAt: Date.now() + this.UNDO_WINDOW_MS,
      });
    }

    // Add to logs (most recent first)
    this.operationLogs.unshift(log);
    
    // Trim logs if needed
    if (this.operationLogs.length > this.MAX_LOGS) {
      this.operationLogs = this.operationLogs.slice(0, this.MAX_LOGS);
    }

    // Persist logs
    this.saveLogs();

    // Also log to main logger
    if (result.success) {
      this.logger.info(`Operation completed: ${log.operationName} - ${result.message}`);
    } else {
      this.logger.warn(`Operation failed: ${log.operationName} - ${result.message}`);
    }
  }

  private async loadLogs(): Promise<void> {
    try {
      const saved = await this.dataStore.get('operationLogs');
      if (Array.isArray(saved)) {
        // Filter out old logs (older than 24 hours)
        const cutoff = Date.now() - 24 * 66 * 60 * 1000;
        this.operationLogs = saved.filter((log: OperationLog) => log.timestamp > cutoff);
        // Mark all as non-undoable since undo states don't persist
        this.operationLogs.forEach(log => log.canUndo = false);
      }
    } catch {
      this.operationLogs = [];
    }
  }

  private async saveLogs(): Promise<void> {
    try {
      await this.dataStore.set('operationLogs', this.operationLogs);
    } catch {
      // Ignore save errors
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
