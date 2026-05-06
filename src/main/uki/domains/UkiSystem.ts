// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI System Domain
// Handles system commands (screenshot, lock, battery, settings toggles)
// ===========================================================================

import { BrowserWindow, app } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'screenshot':
      win.webContents.send('uki:system', { action: 'screenshot' });
      return { success: true, response: successResponse('Taking a screenshot.') };

    case 'lock':
      win.webContents.send('uki:system', { action: 'lock' });
      return { success: true, response: successResponse('Locking the screen.') };

    case 'battery':
      win.webContents.send('uki:system', { action: 'battery' });
      return { success: true, response: 'Checking battery status...' };

    case 'restart':
      // Relaunch the app
      app.relaunch();
      app.quit();
      return { success: true, response: 'Restarting DEX...' };

    case 'minimize':
      win.minimize();
      return { success: true, response: successResponse('Window minimized.') };

    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize();
        return { success: true, response: successResponse('Window restored.') };
      }
      win.maximize();
      return { success: true, response: successResponse('Window maximized.') };

    // Settings toggles
    case 'toggle-dark':
      win.webContents.send('uki:settings', { action: 'toggle-dark' });
      return { success: true, response: successResponse('Toggling dark mode.') };

    case 'toggle-dock':
      win.webContents.send('uki:settings', { action: 'toggle-dock' });
      return { success: true, response: successResponse('Toggling dock visibility.') };

    case 'wallpaper': {
      const value = intent.entities.value as string;
      win.webContents.send('uki:settings', { action: 'wallpaper', value });
      return { success: true, response: successResponse(`Changing wallpaper to "${value}".`) };
    }

    default:
      return { success: false, response: errorResponse('I don\'t know how to do that system action.') };
  }
}
