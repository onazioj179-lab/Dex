// ═══════════════════════════════════════════════════════════════════════════
// DEX - Data Controller
// Phase 10/11: User data ownership - Export, Import, Reset, Backup
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, dialog, app, BrowserWindow, shell } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { DataStore } from '../store/DataStore';

const logger = new Logger();
const dataStoreInstance = new DataStore();

interface ExportData {
  version: string;
  exportedAt: string;
  appVersion: string;
  data: {
    notes: any[];
    tasks: any[];
    workflows: any[];
    operations: any[];
    actions: any[];
    settings: Record<string, any>;
    rules: any[];
    timers: any[];
  };
}

interface FolderExportOptions {
  includeNotes: boolean;
  includeTasks: boolean;
  includeWorkflows: boolean;
  includeOperations: boolean;
  includeSettings: boolean;
  includeRules: boolean;
  includeMedia: boolean;
  includeRecordings: boolean;
  format: 'json' | 'markdown' | 'both';
}

class DataController {
  private readonly DATA_VERSION = '1.1';
  private readonly userDataPath: string;
  private readonly mediaPath: string;
  private readonly recordingsPath: string;

  constructor() {
    this.userDataPath = app.getPath('userData');
    this.mediaPath = path.join(this.userDataPath, 'media');
    this.recordingsPath = path.join(this.userDataPath, 'recordings');
    this.registerHandlers();
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.mediaPath, { recursive: true });
      await fs.mkdir(this.recordingsPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create directories', error);
    }
  }

  private registerHandlers(): void {
    // Export all user data
    ipcMain.handle('data:export', async () => {
      return await this.exportData();
    });

    // Import user data
    ipcMain.handle('data:import', async () => {
      return await this.importData();
    });

    // Reset all data
    ipcMain.handle('data:reset', async () => {
      return await this.resetData();
    });

    // Get data statistics
    ipcMain.handle('data:stats', async () => {
      return await this.getDataStats();
    });

    // Export specific collection
    ipcMain.handle('data:exportCollection', async (_, collection: string) => {
      return await this.exportCollection(collection);
    });

    // Export to folder (human-readable)
    ipcMain.handle('data:exportToFolder', async (_, options?: Partial<FolderExportOptions>) => {
      return await this.exportToFolder(options);
    });

    // Import from folder
    ipcMain.handle('data:importFromFolder', async () => {
      return await this.importFromFolder();
    });

    // Create backup
    ipcMain.handle('data:createBackup', async () => {
      return await this.createAutoBackup();
    });

    // List backups
    ipcMain.handle('data:listBackups', async () => {
      return await this.listBackups();
    });

    // Restore from backup
    ipcMain.handle('data:restoreBackup', async (_, backupPath: string) => {
      return await this.restoreFromBackup(backupPath);
    });

    // Open data folder
    ipcMain.handle('data:openFolder', async () => {
      shell.openPath(this.userDataPath);
      return { success: true };
    });

    // Get storage locations
    ipcMain.handle('data:getLocations', async () => {
      return {
        userData: this.userDataPath,
        media: this.mediaPath,
        recordings: this.recordingsPath,
        backups: path.join(this.userDataPath, 'backups')
      };
    });

    logger.info('Data handlers registered');
  }

  async exportData(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Dex Data',
        defaultPath: path.join(app.getPath('documents'), `dex-backup-${this.formatDate()}.json`),
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const exportData: ExportData = {
        version: this.DATA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        data: {
          notes: await dataStoreInstance.get('notes') || [],
          tasks: await dataStoreInstance.get('tasks') || [],
          workflows: await dataStoreInstance.get('workflows') || [],
          operations: await dataStoreInstance.get('operations') || [],
          actions: await dataStoreInstance.get('actions') || [],
          settings: await dataStoreInstance.get('settings') || {},
          rules: await dataStoreInstance.get('rules') || [],
          timers: await dataStoreInstance.get('timers') || [],
        },
      };

      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      
      logger.info('Data exported', { path: filePath });
      return { success: true, path: filePath };
    } catch (error) {
      logger.error('Export failed', error);
      return { success: false, error: String(error) };
    }
  }

  async importData(): Promise<{ success: boolean; imported?: string[]; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Dex Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const fileContent = await fs.readFile(filePaths[0], 'utf-8');
      const importData: ExportData = JSON.parse(fileContent);

      // Validate version
      if (!importData.version || !importData.data) {
        return { success: false, error: 'Invalid backup file format' };
      }

      // Import each collection
      const imported: string[] = [];
      
      if (importData.data.notes?.length) {
        await dataStoreInstance.set('notes', importData.data.notes);
        imported.push(`notes (${importData.data.notes.length})`);
      }
      if (importData.data.tasks?.length) {
        await dataStoreInstance.set('tasks', importData.data.tasks);
        imported.push(`tasks (${importData.data.tasks.length})`);
      }
      if (importData.data.workflows?.length) {
        await dataStoreInstance.set('workflows', importData.data.workflows);
        imported.push(`workflows (${importData.data.workflows.length})`);
      }
      if (importData.data.operations?.length) {
        await dataStoreInstance.set('operations', importData.data.operations);
        imported.push(`operations (${importData.data.operations.length})`);
      }
      if (importData.data.actions?.length) {
        await dataStoreInstance.set('actions', importData.data.actions);
        imported.push(`actions (${importData.data.actions.length})`);
      }
      if (importData.data.rules?.length) {
        await dataStoreInstance.set('rules', importData.data.rules);
        imported.push(`rules (${importData.data.rules.length})`);
      }
      if (importData.data.timers?.length) {
        await dataStoreInstance.set('timers', importData.data.timers);
        imported.push(`timers (${importData.data.timers.length})`);
      }
      if (importData.data.settings && Object.keys(importData.data.settings).length) {
        await dataStoreInstance.set('settings', importData.data.settings);
        imported.push('settings');
      }

      logger.info('Data imported', { imported });
      return { success: true, imported };
    } catch (error) {
      logger.error('Import failed', error);
      return { success: false, error: String(error) };
    }
  }

  async resetData(): Promise<{ success: boolean; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Reset Everything'],
        defaultId: 0,
        cancelId: 0,
        title: 'Reset All Data',
        message: 'Are you sure you want to reset all data?',
        detail: 'This will permanently delete all your notes, tasks, workflows, and settings. This cannot be undone.',
      });

      if (response !== 1) {
        return { success: false, error: 'Cancelled' };
      }

      // Clear all collections
      await dataStoreInstance.set('notes', []);
      await dataStoreInstance.set('tasks', []);
      await dataStoreInstance.set('workflows', []);
      await dataStoreInstance.set('operations', []);
      await dataStoreInstance.set('actions', []);
      await dataStoreInstance.set('rules', []);
      await dataStoreInstance.set('timers', []);
      await dataStoreInstance.set('settings', {});

      logger.info('All data reset');
      return { success: true };
    } catch (error) {
      logger.error('Reset failed', error);
      return { success: false, error: String(error) };
    }
  }

  async getDataStats(): Promise<{
    notes: number;
    tasks: number;
    workflows: number;
    operations: number;
    actions: number;
    rules: number;
    timers: number;
    totalSize: number;
  }> {
    const notes = await dataStoreInstance.get('notes') || [];
    const tasks = await dataStoreInstance.get('tasks') || [];
    const workflows = await dataStoreInstance.get('workflows') || [];
    const operations = await dataStoreInstance.get('operations') || [];
    const actions = await dataStoreInstance.get('actions') || [];
    const rules = await dataStoreInstance.get('rules') || [];
    const timers = await dataStoreInstance.get('timers') || [];

    // Estimate total size
    const all = { notes, tasks, workflows, operations, actions, rules, timers };
    const totalSize = Buffer.byteLength(JSON.stringify(all), 'utf-8');

    return {
      notes: notes.length,
      tasks: tasks.length,
      workflows: workflows.length,
      operations: operations.length,
      actions: actions.length,
      rules: rules.length,
      timers: timers.length,
      totalSize,
    };
  }

  async exportCollection(collection: string): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const data = await dataStoreInstance.get(collection);
      if (!data) {
        return { success: false, error: 'Collection not found' };
      }

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Export ${collection}`,
        defaultPath: path.join(app.getPath('documents'), `dex-${collection}-${this.formatDate()}.json`),
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
        ],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Cancelled' };
      }

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      logger.info('Collection exported', { collection, path: filePath });
      return { success: true, path: filePath };
    } catch (error) {
      logger.error('Collection export failed', error);
      return { success: false, error: String(error) };
    }
  }

  private formatDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private formatTimestamp(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDER-BASED EXPORT (Human-Readable)
  // ═══════════════════════════════════════════════════════════════════════════

  async exportToFolder(options?: Partial<FolderExportOptions>): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const opts: FolderExportOptions = {
        includeNotes: true,
        includeTasks: true,
        includeWorkflows: true,
        includeOperations: true,
        includeSettings: true,
        includeRules: true,
        includeMedia: true,
        includeRecordings: true,
        format: 'both',
        ...options
      };

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Export Folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Export Here'
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const exportDir = path.join(filePaths[0], `dex-export-${this.formatTimestamp()}`);
      await fs.mkdir(exportDir, { recursive: true });

      // Create README
      await this.writeReadme(exportDir);

      // Export notes
      if (opts.includeNotes) {
        const notes = await dataStoreInstance.get('notes') || [];
        await this.exportCollectionToFolder(exportDir, 'notes', notes, opts.format);
      }

      // Export tasks
      if (opts.includeTasks) {
        const tasks = await dataStoreInstance.get('tasks') || [];
        await this.exportCollectionToFolder(exportDir, 'tasks', tasks, opts.format);
      }

      // Export workflows
      if (opts.includeWorkflows) {
        const workflows = await dataStoreInstance.get('workflows') || [];
        await this.exportCollectionToFolder(exportDir, 'workflows', workflows, opts.format);
      }

      // Export operations
      if (opts.includeOperations) {
        const operations = await dataStoreInstance.get('operations') || [];
        await this.exportCollectionToFolder(exportDir, 'operations', operations, opts.format);
      }

      // Export rules
      if (opts.includeRules) {
        const rules = await dataStoreInstance.get('rules') || [];
        await this.exportCollectionToFolder(exportDir, 'rules', rules, opts.format);
      }

      // Export settings
      if (opts.includeSettings) {
        const settings = await dataStoreInstance.get('settings') || {};
        const settingsDir = path.join(exportDir, 'settings');
        await fs.mkdir(settingsDir, { recursive: true });
        await fs.writeFile(
          path.join(settingsDir, 'settings.json'),
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
      }

      // Copy media files
      if (opts.includeMedia && fsSync.existsSync(this.mediaPath)) {
        await this.copyDirectory(this.mediaPath, path.join(exportDir, 'media'));
      }

      // Copy recordings
      if (opts.includeRecordings && fsSync.existsSync(this.recordingsPath)) {
        await this.copyDirectory(this.recordingsPath, path.join(exportDir, 'recordings'));
      }

      // Create manifest
      await this.writeManifest(exportDir, opts);

      logger.info('Data exported to folder', { path: exportDir });
      shell.openPath(exportDir);
      return { success: true, path: exportDir };
    } catch (error) {
      logger.error('Folder export failed', error);
      return { success: false, error: String(error) };
    }
  }

  private async exportCollectionToFolder(
    baseDir: string, 
    name: string, 
    items: any[], 
    format: 'json' | 'markdown' | 'both'
  ): Promise<void> {
    const collectionDir = path.join(baseDir, name);
    await fs.mkdir(collectionDir, { recursive: true });

    // Always write index JSON
    await fs.writeFile(
      path.join(collectionDir, `_${name}.json`),
      JSON.stringify(items, null, 2),
      'utf-8'
    );

    // Write individual files
    for (const item of items) {
      const id = item.id || item.name || `item_${Date.now()}`;
      const safeName = this.sanitizeFilename(String(id));

      if (format === 'json' || format === 'both') {
        await fs.writeFile(
          path.join(collectionDir, `${safeName}.json`),
          JSON.stringify(item, null, 2),
          'utf-8'
        );
      }

      if (format === 'markdown' || format === 'both') {
        const markdown = this.itemToMarkdown(name, item);
        await fs.writeFile(
          path.join(collectionDir, `${safeName}.md`),
          markdown,
          'utf-8'
        );
      }
    }
  }

  private itemToMarkdown(type: string, item: any): string {
    const lines: string[] = [];
    const title = item.title || item.name || item.id || 'Untitled';
    
    lines.push(`# ${title}`);
    lines.push('');
    
    if (item.description) {
      lines.push(item.description);
      lines.push('');
    }
    
    if (item.content) {
      lines.push('## Content');
      lines.push('');
      lines.push(item.content);
      lines.push('');
    }

    if (item.steps && Array.isArray(item.steps)) {
      lines.push('## Steps');
      lines.push('');
      item.steps.forEach((step: any, i: number) => {
        lines.push(`${i + 1}. ${step.name || step.action || JSON.stringify(step)}`);
      });
      lines.push('');
    }

    if (item.trigger) {
      lines.push('## Trigger');
      lines.push('');
      lines.push(`- Type: ${item.trigger.type || 'manual'}`);
      if (item.trigger.shortcut) lines.push(`- Shortcut: ${item.trigger.shortcut}`);
      if (item.trigger.schedule) lines.push(`- Schedule: ${item.trigger.schedule}`);
      lines.push('');
    }

    // Metadata
    lines.push('---');
    lines.push('');
    lines.push(`- Type: ${type}`);
    if (item.id) lines.push(`- ID: ${item.id}`);
    if (item.createdAt) lines.push(`- Created: ${new Date(item.createdAt).toLocaleString()}`);
    if (item.updatedAt) lines.push(`- Updated: ${new Date(item.updatedAt).toLocaleString()}`);
    if (item.tags) lines.push(`- Tags: ${item.tags.join(', ')}`);
    
    return lines.join('\n');
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  private async writeReadme(dir: string): Promise<void> {
    const readme = `# Dex Export

This folder contains your exported Dex data.

## Folder Structure

- **notes/** - Your notes in JSON and Markdown format
- **tasks/** - Your tasks and to-dos
- **workflows/** - Automation workflows
- **operations/** - Saved operations
- **rules/** - Automation rules
- **settings/** - Application settings
- **media/** - Saved media files
- **recordings/** - Voice recordings

## Importing Back to Dex

1. Open Dex
2. Go to Settings → Data → Import from Folder
3. Select this folder

## Manual Editing

JSON files can be edited with any text editor.
Markdown files are human-readable and for reference only.

---
Exported on: ${new Date().toLocaleString()}
`;
    await fs.writeFile(path.join(dir, 'README.md'), readme, 'utf-8');
  }

  private async writeManifest(dir: string, opts: FolderExportOptions): Promise<void> {
    const manifest = {
      version: this.DATA_VERSION,
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      options: opts,
      contents: {
        notes: opts.includeNotes,
        tasks: opts.includeTasks,
        workflows: opts.includeWorkflows,
        operations: opts.includeOperations,
        settings: opts.includeSettings,
        rules: opts.includeRules,
        media: opts.includeMedia,
        recordings: opts.includeRecordings
      }
    };
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDER-BASED IMPORT
  // ═══════════════════════════════════════════════════════════════════════════

  async importFromFolder(): Promise<{ success: boolean; imported?: string[]; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window focused' };
      }

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Dex Export Folder',
        properties: ['openDirectory'],
        buttonLabel: 'Import'
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const importDir = filePaths[0];
      const imported: string[] = [];

      // Check for manifest
      const manifestPath = path.join(importDir, 'manifest.json');
      let manifest: any = null;
      if (fsSync.existsSync(manifestPath)) {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      }

      // Import collections
      const collections = ['notes', 'tasks', 'workflows', 'operations', 'rules'];
      for (const collection of collections) {
        const collectionDir = path.join(importDir, collection);
        if (fsSync.existsSync(collectionDir)) {
          const indexFile = path.join(collectionDir, `_${collection}.json`);
          if (fsSync.existsSync(indexFile)) {
            const data = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
            if (Array.isArray(data) && data.length > 0) {
              await dataStoreInstance.set(collection, data);
              imported.push(`${collection} (${data.length})`);
            }
          }
        }
      }

      // Import settings
      const settingsFile = path.join(importDir, 'settings', 'settings.json');
      if (fsSync.existsSync(settingsFile)) {
        const settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8'));
        await dataStoreInstance.set('settings', settings);
        imported.push('settings');
      }

      // Import media
      const mediaDir = path.join(importDir, 'media');
      if (fsSync.existsSync(mediaDir)) {
        await this.copyDirectory(mediaDir, this.mediaPath);
        imported.push('media');
      }

      // Import recordings
      const recordingsDir = path.join(importDir, 'recordings');
      if (fsSync.existsSync(recordingsDir)) {
        await this.copyDirectory(recordingsDir, this.recordingsPath);
        imported.push('recordings');
      }

      logger.info('Data imported from folder', { imported });
      return { success: true, imported };
    } catch (error) {
      logger.error('Folder import failed', error);
      return { success: false, error: String(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO BACKUP
  // ═══════════════════════════════════════════════════════════════════════════

  async createAutoBackup(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const backupsDir = path.join(this.userDataPath, 'backups');
      await fs.mkdir(backupsDir, { recursive: true });

      const backupFile = path.join(backupsDir, `backup-${this.formatTimestamp()}.json`);
      
      const backupData: ExportData = {
        version: this.DATA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        data: {
          notes: await dataStoreInstance.get('notes') || [],
          tasks: await dataStoreInstance.get('tasks') || [],
          workflows: await dataStoreInstance.get('workflows') || [],
          operations: await dataStoreInstance.get('operations') || [],
          actions: await dataStoreInstance.get('actions') || [],
          settings: await dataStoreInstance.get('settings') || {},
          rules: await dataStoreInstance.get('rules') || [],
          timers: await dataStoreInstance.get('timers') || [],
        },
      };

      await fs.writeFile(backupFile, JSON.stringify(backupData), 'utf-8');
      
      // Clean old backups (keep last 10)
      await this.cleanOldBackups(backupsDir, 10);
      
      logger.info('Auto backup created', { path: backupFile });
      return { success: true, path: backupFile };
    } catch (error) {
      logger.error('Auto backup failed', error);
      return { success: false, error: String(error) };
    }
  }

  async listBackups(): Promise<{ name: string; path: string; date: Date; size: number }[]> {
    try {
      const backupsDir = path.join(this.userDataPath, 'backups');
      if (!fsSync.existsSync(backupsDir)) {
        return [];
      }

      const files = await fs.readdir(backupsDir);
      const backups = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (name) => {
            const filePath = path.join(backupsDir, name);
            const stats = await fs.stat(filePath);
            return {
              name,
              path: filePath,
              date: stats.mtime,
              size: stats.size
            };
          })
      );

      return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('List backups failed', error);
      return [];
    }
  }

  async restoreFromBackup(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (mainWindow) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Cancel', 'Restore'],
          defaultId: 0,
          title: 'Restore from Backup',
          message: 'This will replace all current data with the backup.',
          detail: 'Current data will be lost. Make sure you have a recent backup of your current data.'
        });

        if (response !== 1) {
          return { success: false, error: 'Cancelled' };
        }
      }

      const content = await fs.readFile(backupPath, 'utf-8');
      const backupData: ExportData = JSON.parse(content);

      // Restore all data
      if (backupData.data.notes) await dataStoreInstance.set('notes', backupData.data.notes);
      if (backupData.data.tasks) await dataStoreInstance.set('tasks', backupData.data.tasks);
      if (backupData.data.workflows) await dataStoreInstance.set('workflows', backupData.data.workflows);
      if (backupData.data.operations) await dataStoreInstance.set('operations', backupData.data.operations);
      if (backupData.data.actions) await dataStoreInstance.set('actions', backupData.data.actions);
      if (backupData.data.rules) await dataStoreInstance.set('rules', backupData.data.rules);
      if (backupData.data.timers) await dataStoreInstance.set('timers', backupData.data.timers);
      if (backupData.data.settings) await dataStoreInstance.set('settings', backupData.data.settings);

      logger.info('Restored from backup', { path: backupPath });
      return { success: true };
    } catch (error) {
      logger.error('Restore from backup failed', error);
      return { success: false, error: String(error) };
    }
  }

  private async cleanOldBackups(backupsDir: string, keepCount: number): Promise<void> {
    const files = await fs.readdir(backupsDir);
    const backupFiles = files
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse();

    // Delete old backups
    for (let i = keepCount; i < backupFiles.length; i++) {
      await fs.unlink(path.join(backupsDir, backupFiles[i]));
    }
  }
}

export const dataController = new DataController();
