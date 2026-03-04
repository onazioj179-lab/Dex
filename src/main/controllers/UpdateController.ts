import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater';
import log from 'electron-log';
import Store from 'electron-store';

interface UpdatePreferences {
  autoCheck: boolean;
  checkInterval: number; // hours
  lastCheck: number;
  skippedVersion: string | null;
  showChangelog: boolean;
}

interface RollbackInfo {
  version: string;
  date: string;
  path: string;
}

const store = new Store<{
  updatePrefs: UpdatePreferences;
  rollbackHistory: RollbackInfo[];
}>({
  defaults: {
    updatePrefs: {
      autoCheck: false, // Manual-first approach - no auto updates
      checkInterval: 24,
      lastCheck: 0,
      skippedVersion: null,
      showChangelog: true
    },
    rollbackHistory: []
  }
});

export class UpdateController {
  private mainWindow: BrowserWindow | null = null;
  private updateAvailable = false;
  private downloadProgress = 0;
  private latestUpdateInfo: ElectronUpdateInfo | null = null;
  private isDownloading = false;
  private checkIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.setupAutoUpdater();
    this.registerHandlers();
  }

  private setupAutoUpdater(): void {
    // Configure electron-updater
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false; // Never auto-download
    autoUpdater.autoInstallOnAppQuit = false; // Don't auto-install
    autoUpdater.allowDowngrade = true; // Allow rollbacks
    
    // Set update feed URL (can be GitHub releases or custom server)
    // autoUpdater.setFeedURL({ provider: 'github', owner: 'dex-app', repo: 'dex' });

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.notifyRenderer('update:checking', {});
    });

    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      log.info('Update available:', info.version);
      this.updateAvailable = true;
      this.latestUpdateInfo = info;
      
      const prefs = store.get('updatePrefs');
      if (prefs.skippedVersion === info.version) {
        log.info('User skipped this version');
        return;
      }

      this.notifyRenderer('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        currentVersion: autoUpdater.currentVersion.version
      });
    });

    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      log.info('No update available. Current version is latest.');
      this.updateAvailable = false;
      this.notifyRenderer('update:not-available', {
        currentVersion: autoUpdater.currentVersion.version
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.downloadProgress = progress.percent;
      this.notifyRenderer('update:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      });
    });

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      log.info('Update downloaded:', info.version);
      this.isDownloading = false;
      
      // Save rollback info before installing
      this.saveRollbackPoint();
      
      this.notifyRenderer('update:downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    });

    autoUpdater.on('error', (error: Error) => {
      log.error('Update error:', error);
      this.isDownloading = false;
      this.notifyRenderer('update:error', {
        message: error.message
      });
    });
  }

  private registerHandlers(): void {
    // Check for updates manually
    ipcMain.handle('updates:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        store.set('updatePrefs.lastCheck', Date.now());
        return { 
          success: true, 
          updateAvailable: this.updateAvailable,
          info: result?.updateInfo 
        };
      } catch (error) {
        log.error('Check for updates failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Download update
    ipcMain.handle('updates:download', async () => {
      if (!this.updateAvailable || this.isDownloading) {
        return { success: false, error: 'No update available or already downloading' };
      }
      
      try {
        this.isDownloading = true;
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        this.isDownloading = false;
        log.error('Download failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Install update (quit and install)
    ipcMain.handle('updates:install', async () => {
      try {
        // Show confirmation dialog
        const result = await dialog.showMessageBox(this.mainWindow!, {
          type: 'question',
          buttons: ['Install Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Install Update',
          message: 'Ready to install update',
          detail: 'Dex will restart to complete the installation. Your data will be preserved.'
        });
        
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
          return { success: true };
        }
        return { success: false, cancelled: true };
      } catch (error) {
        log.error('Install failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Skip this version
    ipcMain.handle('updates:skip', async (_, version: string) => {
      store.set('updatePrefs.skippedVersion', version);
      this.updateAvailable = false;
      return { success: true };
    });

    // Get current version info
    ipcMain.handle('updates:getInfo', async () => {
      const prefs = store.get('updatePrefs');
      return {
        currentVersion: autoUpdater.currentVersion.version,
        updateAvailable: this.updateAvailable,
        latestVersion: this.latestUpdateInfo?.version,
        releaseNotes: this.latestUpdateInfo?.releaseNotes,
        lastCheck: prefs.lastCheck,
        skippedVersion: prefs.skippedVersion,
        isDownloading: this.isDownloading,
        downloadProgress: this.downloadProgress
      };
    });

    // Get update preferences
    ipcMain.handle('updates:getPreferences', async () => {
      return store.get('updatePrefs');
    });

    // Set update preferences
    ipcMain.handle('updates:setPreferences', async (_, prefs: Partial<UpdatePreferences>) => {
      const current = store.get('updatePrefs');
      store.set('updatePrefs', { ...current, ...prefs });
      
      // Restart check interval if changed
      if (prefs.autoCheck !== undefined || prefs.checkInterval !== undefined) {
        this.setupAutoCheck();
      }
      
      return { success: true };
    });

    // Get rollback history
    ipcMain.handle('updates:getRollbackHistory', async () => {
      return store.get('rollbackHistory');
    });

    // Open release notes URL
    ipcMain.handle('updates:openReleaseNotes', async () => {
      const url = `https://github.com/dex-app/dex/releases`;
      await shell.openExternal(url);
      return { success: true };
    });

    // View changelog
    ipcMain.handle('updates:getChangelog', async () => {
      return {
        currentVersion: autoUpdater.currentVersion.version,
        changelog: this.latestUpdateInfo?.releaseNotes || 'No changelog available'
      };
    });
  }

  private setupAutoCheck(): void {
    // Clear existing interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    const prefs = store.get('updatePrefs');
    if (!prefs.autoCheck) return;

    const intervalMs = prefs.checkInterval * 60 * 60 * 1000;
    
    this.checkIntervalId = setInterval(async () => {
      try {
        await autoUpdater.checkForUpdates();
        store.set('updatePrefs.lastCheck', Date.now());
      } catch (error) {
        log.error('Auto update check failed:', error);
      }
    }, intervalMs);
  }

  private saveRollbackPoint(): void {
    const rollbackHistory = store.get('rollbackHistory');
    const currentVersion = autoUpdater.currentVersion.version;
    
    // Only keep last 3 rollback points
    const newHistory: RollbackInfo[] = [
      {
        version: currentVersion,
        date: new Date().toISOString(),
        path: '' // electron-updater manages this internally
      },
      ...rollbackHistory.slice(0, 2)
    ];
    
    store.set('rollbackHistory', newHistory);
  }

  private notifyRenderer(event: string, data: Record<string, unknown>): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // Public method to manually trigger update check
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
      store.set('updatePrefs.lastCheck', Date.now());
    } catch (error) {
      log.error('Manual update check failed:', error);
    }
  }

  getUpdateStatus(): { available: boolean; version?: string } {
    return {
      available: this.updateAvailable,
      version: this.latestUpdateInfo?.version
    };
  }
}

export default new UpdateController();
