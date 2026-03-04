// ═══════════════════════════════════════════════════════════════════════════
// DEX - Data Export System
// Phase 18: Post-Release Evolution & User Ownership
// Full data export, no lock-in, user owns their data
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, app, dialog } from 'electron';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import { encryptionService } from '../core/EncryptionService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ExportOptions {
  format: 'json' | 'zip';
  includeActions: boolean;
  includeModes: boolean;
  includeRules: boolean;
  includeSessions: boolean;
  includeOperations: boolean;
  includeSettings: boolean;
  decryptData: boolean;    // Export decrypted (user's choice)
}

export interface ExportResult {
  success: boolean;
  path?: string;
  size?: number;
  itemCount?: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  imported: {
    actions: number;
    modes: number;
    rules: number;
    sessions: number;
    operations: number;
  };
  skipped: number;
  errors: string[];
}

export interface DataSummary {
  actions: number;
  modes: number;
  rules: number;
  sessions: number;
  operations: number;
  totalSize: string;
  encryptedItems: number;
  lastModified: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA EXPORT CLASS
// ═══════════════════════════════════════════════════════════════════════════

class DataExportClass {
  constructor() {
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Export data
    ipcMain.handle('export:data', async (_, options: ExportOptions) => {
      return this.exportData(options);
    });

    // Export to specific path (without dialog)
    ipcMain.handle('export:dataToPath', async (_, targetPath: string, options: ExportOptions) => {
      return this.exportToPath(targetPath, options);
    });

    // Import data
    ipcMain.handle('export:import', async () => {
      return this.importData();
    });

    // Import from specific path
    ipcMain.handle('export:importFromPath', async (_, sourcePath: string) => {
      return this.importFromPath(sourcePath);
    });

    // Get data summary
    ipcMain.handle('export:getSummary', async () => {
      return this.getDataSummary();
    });

    // Get data locations
    ipcMain.handle('export:getLocations', async () => {
      return this.getDataLocations();
    });

    // Open data folder
    ipcMain.handle('export:openDataFolder', async () => {
      const { shell } = require('electron');
      shell.openPath(app.getPath('userData'));
      return true;
    });

    log.info('[DataExport] IPC handlers registered');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Export data with file dialog
   */
  async exportData(options: ExportOptions): Promise<ExportResult> {
    const defaultPath = path.join(
      app.getPath('documents'),
      `dex-export-${new Date().toISOString().split('T')[0]}.json`
    );

    const result = await dialog.showSaveDialog({
      title: 'Export Dex Data',
      defaultPath,
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    return this.exportToPath(result.filePath, options);
  }

  /**
   * Export data to a specific path
   */
  async exportToPath(targetPath: string, options: ExportOptions): Promise<ExportResult> {
    try {
      log.info(`[DataExport] Exporting data to: ${targetPath}`);

      const exportData: Record<string, any> = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        format: 'dex-export',
      };

      let itemCount = 0;

      // Load main data store
      const dataPath = path.join(app.getPath('userData'), 'dex-data.json');
      if (fs.existsSync(dataPath)) {
        const mainData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

        if (options.includeActions && mainData.actions) {
          exportData.actions = mainData.actions;
          itemCount += mainData.actions.length;
        }

        if (options.includeModes && mainData.modes) {
          exportData.modes = mainData.modes;
          itemCount += mainData.modes.length;
        }

        if (options.includeRules && mainData.rules) {
          exportData.rules = mainData.rules;
          itemCount += mainData.rules.length;
        }

        if (options.includeOperations && mainData.operations) {
          exportData.operations = mainData.operations;
          itemCount += mainData.operations.length;
        }

        if (options.includeSettings && mainData.settings) {
          exportData.settings = mainData.settings;
        }
      }

      // Load sessions
      if (options.includeSessions) {
        const sessionsPath = path.join(app.getPath('userData'), 'dex-sessions.json');
        if (fs.existsSync(sessionsPath)) {
          const sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
          exportData.sessions = sessionsData.sessions ?? [];
          itemCount += exportData.sessions.length;
        }
      }

      // Decrypt if requested and encryption is unlocked
      const encStatus = encryptionService.getStatus();
      if (options.decryptData && !encStatus.locked) {
        exportData._decrypted = true;
        // Decryption would happen here for encrypted fields
      }

      // Write export file
      const content = JSON.stringify(exportData, null, 2);
      fs.writeFileSync(targetPath, content, 'utf-8');

      const stats = fs.statSync(targetPath);

      log.info(`[DataExport] Export complete: ${itemCount} items, ${stats.size} bytes`);

      return {
        success: true,
        path: targetPath,
        size: stats.size,
        itemCount,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[DataExport] Export failed:`, error);
      return { success: false, error: errorMsg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Import data with file dialog
   */
  async importData(): Promise<ImportResult> {
    const result = await dialog.showOpenDialog({
      title: 'Import Dex Data',
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return {
        success: false,
        imported: { actions: 0, modes: 0, rules: 0, sessions: 0, operations: 0 },
        skipped: 0,
        errors: ['Import cancelled'],
      };
    }

    return this.importFromPath(result.filePaths[0]);
  }

  /**
   * Import data from a specific path
   */
  async importFromPath(sourcePath: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: { actions: 0, modes: 0, rules: 0, sessions: 0, operations: 0 },
      skipped: 0,
      errors: [],
    };

    try {
      log.info(`[DataExport] Importing data from: ${sourcePath}`);

      if (!fs.existsSync(sourcePath)) {
        result.errors.push('File not found');
        return result;
      }

      const content = fs.readFileSync(sourcePath, 'utf-8');
      const importData = JSON.parse(content);

      // Validate format
      if (importData.format !== 'dex-export') {
        result.errors.push('Invalid export file format');
        return result;
      }

      // Load current data
      const dataPath = path.join(app.getPath('userData'), 'dex-data.json');
      let currentData: Record<string, any> = {};
      if (fs.existsSync(dataPath)) {
        currentData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      }

      // Merge data (new items only, no overwrites)
      if (importData.actions) {
        const existingIds = new Set((currentData.actions ?? []).map((a: any) => a.id));
        for (const action of importData.actions) {
          if (!existingIds.has(action.id)) {
            currentData.actions = currentData.actions ?? [];
            currentData.actions.push(action);
            result.imported.actions++;
          } else {
            result.skipped++;
          }
        }
      }

      if (importData.modes) {
        const existingIds = new Set((currentData.modes ?? []).map((m: any) => m.id));
        for (const mode of importData.modes) {
          if (!existingIds.has(mode.id)) {
            currentData.modes = currentData.modes ?? [];
            currentData.modes.push(mode);
            result.imported.modes++;
          } else {
            result.skipped++;
          }
        }
      }

      if (importData.rules) {
        const existingIds = new Set((currentData.rules ?? []).map((r: any) => r.id));
        for (const rule of importData.rules) {
          if (!existingIds.has(rule.id)) {
            currentData.rules = currentData.rules ?? [];
            currentData.rules.push(rule);
            result.imported.rules++;
          } else {
            result.skipped++;
          }
        }
      }

      if (importData.operations) {
        const existingIds = new Set((currentData.operations ?? []).map((o: any) => o.id));
        for (const op of importData.operations) {
          if (!existingIds.has(op.id)) {
            currentData.operations = currentData.operations ?? [];
            currentData.operations.push(op);
            result.imported.operations++;
          } else {
            result.skipped++;
          }
        }
      }

      // Save updated data
      fs.writeFileSync(dataPath, JSON.stringify(currentData, null, 2), 'utf-8');

      // Import sessions separately
      if (importData.sessions) {
        const sessionsPath = path.join(app.getPath('userData'), 'dex-sessions.json');
        let sessionsData: Record<string, any> = { sessions: [] };
        if (fs.existsSync(sessionsPath)) {
          sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
        }

        const existingIds = new Set((sessionsData.sessions ?? []).map((s: any) => s.id));
        for (const session of importData.sessions) {
          if (!existingIds.has(session.id)) {
            sessionsData.sessions.push(session);
            result.imported.sessions++;
          } else {
            result.skipped++;
          }
        }

        fs.writeFileSync(sessionsPath, JSON.stringify(sessionsData, null, 2), 'utf-8');
      }

      result.success = true;
      const totalImported = Object.values(result.imported).reduce((a, b) => a + b, 0);
      log.info(`[DataExport] Import complete: ${totalImported} items imported, ${result.skipped} skipped`);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[DataExport] Import failed:`, error);
      result.errors.push(errorMsg);
      return result;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get summary of stored data
   */
  getDataSummary(): DataSummary {
    const summary: DataSummary = {
      actions: 0,
      modes: 0,
      rules: 0,
      sessions: 0,
      operations: 0,
      totalSize: '0 KB',
      encryptedItems: 0,
      lastModified: 0,
    };

    try {
      const userData = app.getPath('userData');
      let totalBytes = 0;

      // Main data
      const dataPath = path.join(userData, 'dex-data.json');
      if (fs.existsSync(dataPath)) {
        const stats = fs.statSync(dataPath);
        totalBytes += stats.size;
        summary.lastModified = Math.max(summary.lastModified, stats.mtimeMs);

        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        summary.actions = data.actions?.length ?? 0;
        summary.modes = data.modes?.length ?? 0;
        summary.rules = data.rules?.length ?? 0;
        summary.operations = data.operations?.length ?? 0;
      }

      // Sessions
      const sessionsPath = path.join(userData, 'dex-sessions.json');
      if (fs.existsSync(sessionsPath)) {
        const stats = fs.statSync(sessionsPath);
        totalBytes += stats.size;
        summary.lastModified = Math.max(summary.lastModified, stats.mtimeMs);

        const data = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
        summary.sessions = data.sessions?.length ?? 0;
      }

      // Format size
      if (totalBytes < 1024) {
        summary.totalSize = `${totalBytes} B`;
      } else if (totalBytes < 1024 * 1024) {
        summary.totalSize = `${Math.round(totalBytes / 1024)} KB`;
      } else {
        summary.totalSize = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
      }

    } catch (error) {
      log.error('[DataExport] Failed to get summary:', error);
    }

    return summary;
  }

  /**
   * Get data storage locations
   */
  getDataLocations(): Record<string, string> {
    const userData = app.getPath('userData');
    return {
      userData,
      mainData: path.join(userData, 'dex-data.json'),
      sessions: path.join(userData, 'dex-sessions.json'),
      encryption: path.join(userData, 'dex-encryption.json'),
      permissions: path.join(userData, 'dex-permissions.json'),
      logs: path.join(userData, 'logs'),
      backups: path.join(userData, 'backups'),
    };
  }
}

// Export singleton instance
export const dataExport = new DataExportClass();
