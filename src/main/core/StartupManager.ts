// ═══════════════════════════════════════════════════════════════════════════
// DEX - Startup Manager
// Reliable, timeout-protected, recoverable startup sequence
// ═══════════════════════════════════════════════════════════════════════════

import { BrowserWindow, app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { safeMode } from './SafeMode';

export interface StartupConfig {
  stageTimeout: number;
  totalTimeout: number;
  showProgressWindow: boolean;
}

type StageFunction = () => Promise<void>;

interface StageDefinition {
  name: string;
  fn: StageFunction;
  required: boolean;
  safeModeOnly?: boolean;
}

class StartupManager {
  private stages: StageDefinition[] = [];
  private progressWindow: BrowserWindow | null = null;
  private config: StartupConfig = {
    stageTimeout: 10000,
    totalTimeout: 60000,
    showProgressWindow: true
  };
  private startTime: number = 0;
  private aborted = false;

  configure(config: Partial<StartupConfig>): void {
    this.config = { ...this.config, ...config };
  }

  registerStage(name: string, fn: StageFunction, options?: { required?: boolean; safeModeOnly?: boolean }): void {
    this.stages.push({
      name,
      fn,
      required: options?.required ?? false,
      safeModeOnly: options?.safeModeOnly ?? false
    });
  }

  private async showProgressUI(): Promise<void> {
    if (!this.config.showProgressWindow) return;
    
    try {
      this.progressWindow = new BrowserWindow({
        width: 400,
        height: 200,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: rgba(9, 9, 11, 0.95);
              color: #f4f4f5;
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              border-radius: 12px;
              border: 1px solid rgba(255,255,255,0.1);
            }
            .title { font-size: 24px; font-weight: 600; margin-bottom: 16px; }
            .status { font-size: 14px; color: #a1a1aa; margin-bottom: 20px; }
            .progress {
              width: 200px;
              height: 4px;
              background: rgba(255,255,255,0.1);
              border-radius: 2px;
              overflow: hidden;
            }
            .progress-bar {
              height: 100%;
              background: linear-gradient(90deg, #3b82f6, #8b5cf6);
              width: 0%;
              animation: loading 2s ease-in-out infinite;
            }
            @keyframes loading {
              0% { width: 0%; }
              50% { width: 70%; }
              100% { width: 100%; }
            }
            .safe-mode {
              margin-top: 16px;
              padding: 8px 16px;
              background: rgba(234, 179, 8, 0.2);
              color: #fbbf24;
              border-radius: 6px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="title">DEX</div>
          <div class="status" id="status">Starting...</div>
          <div class="progress"><div class="progress-bar"></div></div>
          ${safeMode.isSafeModeEnabled() ? '<div class="safe-mode">Safe Mode</div>' : ''}
        </body>
        </html>
      `;

      await this.progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      this.progressWindow.show();
    } catch (err) {
      console.error('[Startup] Failed to show progress UI:', err);
    }
  }

  private updateProgress(stage: string): void {
    if (this.progressWindow && !this.progressWindow.isDestroyed()) {
      this.progressWindow.webContents.executeJavaScript(
        `document.getElementById('status').textContent = '${stage}';`
      ).catch(() => {});
    }
  }

  private closeProgressUI(): void {
    if (this.progressWindow && !this.progressWindow.isDestroyed()) {
      this.progressWindow.close();
      this.progressWindow = null;
    }
  }

  private async runWithTimeout<T>(fn: () => Promise<T>, timeout: number, name: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Stage '${name}' timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async run(): Promise<{ success: boolean; failedStage?: string; error?: string }> {
    this.startTime = Date.now();
    this.aborted = false;
    
    console.log('========================================');
    console.log('  DEX STARTUP SEQUENCE');
    console.log(`  Safe Mode: ${safeMode.isSafeModeEnabled() ? 'ENABLED' : 'disabled'}`);
    console.log('========================================');
    
    safeMode.markStartupBegin();
    
    // Show progress UI
    await this.showProgressUI();

    // Filter stages based on safe mode
    const stagesToRun = this.stages.filter(stage => {
      if (safeMode.isSafeModeEnabled()) {
        return stage.safeModeOnly !== false; // Run safe mode stages
      }
      return !stage.safeModeOnly; // Run normal stages
    });

    for (const stage of stagesToRun) {
      if (this.aborted) {
        return { success: false, failedStage: stage.name, error: 'Startup aborted' };
      }

      // Check total timeout
      if (Date.now() - this.startTime > this.config.totalTimeout) {
        console.error('[Startup] Total timeout exceeded!');
        safeMode.enableSafeMode('Total startup timeout');
        this.closeProgressUI();
        return { success: false, failedStage: stage.name, error: 'Total startup timeout' };
      }

      this.updateProgress(stage.name);
      safeMode.beginStage(stage.name);

      try {
        await this.runWithTimeout(stage.fn, this.config.stageTimeout, stage.name);
        safeMode.completeStage(stage.name);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        safeMode.failStage(stage.name, errorMsg);

        if (stage.required) {
          console.error(`[Startup] Required stage '${stage.name}' failed:`, errorMsg);
          this.closeProgressUI();
          return { success: false, failedStage: stage.name, error: errorMsg };
        } else {
          console.warn(`[Startup] Optional stage '${stage.name}' failed, continuing:`, errorMsg);
        }
      }
    }

    // Success!
    const totalTime = Date.now() - this.startTime;
    console.log(`[Startup] Complete in ${totalTime}ms`);
    safeMode.markStartupSuccess();
    this.closeProgressUI();
    
    return { success: true };
  }

  abort(): void {
    this.aborted = true;
    this.closeProgressUI();
  }

  // Show error dialog with recovery options
  async showErrorDialog(stage: string, error: string): Promise<'restart' | 'safe-mode' | 'quit'> {
    this.closeProgressUI();
    
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'DEX Startup Failed',
      message: `Failed to start DEX`,
      detail: `Stage: ${stage}\nError: ${error}\n\nWhat would you like to do?`,
      buttons: ['Restart', 'Safe Mode', 'Quit'],
      defaultId: 0,
      cancelId: 2
    });

    switch (result.response) {
      case 0: return 'restart';
      case 1: return 'safe-mode';
      default: return 'quit';
    }
  }

  // Show fallback UI when main window fails
  async showFallbackUI(error: string): Promise<BrowserWindow> {
    const fallbackWindow = new BrowserWindow({
      width: 600,
      height: 400,
      frame: true,
      center: true,
      title: 'DEX - Recovery Mode',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const report = safeMode.getStartupReport();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #09090b;
            color: #f4f4f5;
            padding: 32px;
          }
          h1 { font-size: 24px; margin-bottom: 8px; }
          .subtitle { color: #a1a1aa; margin-bottom: 24px; }
          .error-box {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
          }
          .error-title { color: #ef4444; font-weight: 600; margin-bottom: 8px; }
          .error-msg { font-family: monospace; font-size: 13px; color: #fca5a5; }
          pre {
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            padding: 16px;
            font-size: 12px;
            overflow: auto;
            max-height: 150px;
            margin-bottom: 24px;
          }
          .buttons { display: flex; gap: 12px; }
          button {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }
          .btn-primary { background: #3b82f6; color: white; }
          .btn-secondary { background: rgba(255,255,255,0.1); color: #f4f4f5; }
          button:hover { opacity: 0.9; }
        </style>
      </head>
      <body>
        <h1>DEX Recovery Mode</h1>
        <p class="subtitle">Something went wrong during startup</p>
        
        <div class="error-box">
          <div class="error-title">Error</div>
          <div class="error-msg">${error}</div>
        </div>
        
        <pre>${report}</pre>
        
        <div class="buttons">
          <button class="btn-primary" onclick="window.location.reload()">Restart</button>
          <button class="btn-secondary" onclick="alert('Safe Mode will be enabled on next restart')">Enable Safe Mode</button>
        </div>
      </body>
      </html>
    `;

    await fallbackWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    fallbackWindow.show();
    
    return fallbackWindow;
  }
}

export const startupManager = new StartupManager();
