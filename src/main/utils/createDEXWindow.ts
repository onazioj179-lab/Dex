// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX -- Secure Window Factory
 * All BrowserWindow creation MUST go through this utility.
 * Enforces: show-on-ready, security hardening, preload, sandbox.
 */

import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron';
import * as path from 'path';
import log from 'electron-log';

export interface DEXWindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  x?: number;
  y?: number;
  center?: boolean;
  frame?: boolean;
  transparent?: boolean;
  backgroundColor?: string;
  title?: string;
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover';
  titleBarOverlay?: Electron.TitleBarOverlay | false;
  icon?: string;
  parent?: BrowserWindow;
  modal?: boolean;
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  closable?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  fullscreenable?: boolean;
  webviewTag?: boolean;
  /** Extra webPreferences merged with hardened defaults */
  extraWebPreferences?: Partial<Electron.WebPreferences>;
  /** Called after window is shown via ready-to-show */
  onReady?: (win: BrowserWindow) => void;
  /** Called when window is closed */
  onClosed?: () => void;
}

const DEFAULT_PRELOAD = path.join(__dirname, '..', 'preload.js');

/**
 * Creates a BrowserWindow with enforced security settings.
 * The window is ALWAYS created with show:false and only shown
 * on the ready-to-show event. No exceptions.
 */
export function createDEXWindow(opts: DEXWindowOptions = {}): BrowserWindow {
  // Validate position against available displays
  let x = opts.x;
  let y = opts.y;
  if (x !== undefined && y !== undefined) {
    const displays = screen.getAllDisplays();
    let valid = false;
    for (const display of displays) {
      const db = display.bounds;
      if (x >= db.x - 50 && y >= db.y - 50 && x < db.x + db.width && y < db.y + db.height) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      const primary = screen.getPrimaryDisplay();
      x = primary.bounds.x + 100;
      y = primary.bounds.y + 100;
    }
  }

  const windowOpts: BrowserWindowConstructorOptions = {
    width: opts.width ?? 1280,
    height: opts.height ?? 800,
    minWidth: opts.minWidth ?? 400,
    minHeight: opts.minHeight ?? 300,
    x,
    y,
    center: opts.center ?? (x === undefined),
    show: false, // MANDATORY: never show before ready-to-show
    frame: opts.frame ?? true,
    transparent: opts.transparent ?? false,
    backgroundColor: opts.backgroundColor ?? '#0a0a0f',
    title: opts.title ?? 'DEX',
    titleBarStyle: opts.titleBarStyle,
    titleBarOverlay: opts.titleBarOverlay || undefined,
    icon: opts.icon,
    parent: opts.parent,
    modal: opts.modal ?? false,
    resizable: opts.resizable ?? true,
    maximizable: opts.maximizable ?? true,
    minimizable: opts.minimizable ?? true,
    closable: opts.closable ?? true,
    alwaysOnTop: opts.alwaysOnTop ?? false,
    skipTaskbar: opts.skipTaskbar ?? false,
    fullscreenable: opts.fullscreenable ?? true,
    webPreferences: {
      // -- Hardened defaults --
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: opts.webviewTag ?? false,
      preload: DEFAULT_PRELOAD,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      navigateOnDragDrop: false,
      spellcheck: true,
      disableDialogs: false,
      safeDialogs: true,
      safeDialogsMessage: 'DEX has prevented this page from creating additional dialogs.',
      ...opts.extraWebPreferences,
      // These cannot be overridden
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
    },
  };

  const win = new BrowserWindow(windowOpts);

  // MANDATORY: only show on ready-to-show
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      if (opts.onReady) {
        opts.onReady(win);
      }
      log.info(`[createDEXWindow] Window shown: ${opts.title ?? 'DEX'}`);
    }
  });

  if (opts.onClosed) {
    win.on('closed', opts.onClosed);
  }

  // Prevent navigation to external URLs
  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') {
      event.preventDefault();
      log.warn(`[createDEXWindow] Blocked navigation to: ${url}`);
    }
  });

  // Prevent new window creation from renderer
  win.webContents.setWindowOpenHandler(({ url }) => {
    log.warn(`[createDEXWindow] Blocked window.open: ${url}`);
    return { action: 'deny' };
  });

  return win;
}

/**
 * Loads the standard DEX renderer HTML into a window.
 */
export async function loadDEXRenderer(win: BrowserWindow): Promise<void> {
  const indexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  try {
    await win.loadFile(indexPath);
  } catch (err) {
    log.error('[createDEXWindow] Failed to load renderer:', err);
    // Show inline fallback
    await win.loadURL(`data:text/html,
      <html><body style="background:#0a0a0f;color:#e5e5ea;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
        <div style="text-align:center">
          <h2>DEX failed to load</h2>
          <p style="opacity:0.5">The renderer could not be initialized.</p>
          <button onclick="location.reload()" style="padding:8px 24px;background:#0a84ff;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-top:12px">Retry</button>
        </div>
      </body></html>
    `);
  }
}
