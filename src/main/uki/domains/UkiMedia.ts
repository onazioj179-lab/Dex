// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Media Domain
// Handles media playback commands (play, pause, skip, volume)
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse } from '../dialog/UkiResponses';

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'play':
      win.webContents.send('uki:media', { action: 'play' });
      return { success: true, response: successResponse('Playing.') };

    case 'pause':
      win.webContents.send('uki:media', { action: 'pause' });
      return { success: true, response: successResponse('Paused.') };

    case 'next':
      win.webContents.send('uki:media', { action: 'next' });
      return { success: true, response: successResponse('Skipping to next track.') };

    case 'previous':
      win.webContents.send('uki:media', { action: 'previous' });
      return { success: true, response: successResponse('Going to previous track.') };

    case 'volume-up':
      win.webContents.send('uki:media', { action: 'volume-up' });
      return { success: true, response: successResponse('Volume up.') };

    case 'volume-down':
      win.webContents.send('uki:media', { action: 'volume-down' });
      return { success: true, response: successResponse('Volume down.') };

    case 'volume-set': {
      const level = intent.entities.level as number;
      win.webContents.send('uki:media', { action: 'volume-set', level });
      return { success: true, response: successResponse(`Volume set to ${level}%.`) };
    }

    case 'toggle-mute':
      win.webContents.send('uki:media', { action: 'toggle-mute' });
      return { success: true, response: successResponse('Toggled mute.') };

    case 'play-named': {
      const query = intent.entities.query as string;
      win.webContents.send('uki:media', { action: 'play-search', query });
      return { success: true, response: successResponse(`Searching for "${query}".`) };
    }

    default:
      return { success: false, response: 'I don\'t know how to handle that media command.' };
  }
}
