// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Navigation Domain
// Handles page navigation commands
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse } from '../dialog/UkiResponses';

const PAGE_LABELS: Record<string, string> = {
  home: 'Home', files: 'Files', notes: 'Notes', browser: 'Browser',
  settings: 'Settings', transfers: 'Transfers', tasks: 'Tasks',
  gallery: 'Gallery', audio: 'Audio', workflows: 'Workflows',
};

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  const pageId = (intent.entities.pageId as string) || (intent.entities.target as string);

  switch (intent.action) {
    case 'go-home':
      win.webContents.send('uki:navigate', 'home');
      return { success: true, response: successResponse('Navigating to Home.') };

    case 'go-back':
      win.webContents.send('uki:navigate-back');
      return { success: true, response: successResponse('Going back.') };

    case 'navigate': {
      if (!pageId) {
        return { success: false, response: 'Where would you like to go?' };
      }
      const label = PAGE_LABELS[pageId] || pageId;
      win.webContents.send('uki:navigate', pageId);
      return { success: true, response: successResponse(`Opening ${label}.`) };
    }

    default:
      return { success: false, response: `I don't know how to navigate to that.` };
  }
}
