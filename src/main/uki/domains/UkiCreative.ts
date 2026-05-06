// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Creative Domain
// Handles creative suite commands (new project, effects, render, playback, export)
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

// Creative app ID mapping for natural language
const APP_ALIASES: Record<string, string> = {
  imosion: 'imosion', audio: 'imosion', daw: 'imosion', music: 'imosion', 'audio workstation': 'imosion',
  vinx: 'videoeditor', video: 'videoeditor', 'video editor': 'videoeditor', nle: 'videoeditor',
  flux: 'flux', motion: 'flux', 'motion graphics': 'flux', animation: 'flux',
  prism: 'prism', image: 'prism', 'image editor': 'prism', photo: 'prism',
  forge: 'forge', encoder: 'forge', transcode: 'forge', 'media encoder': 'forge',
  axl: 'axl', cad: 'axl', engineering: 'axl', design: 'axl',
};

function resolveApp(intent: UkiIntent): string | null {
  const raw = ((intent.entities.app as string) || (intent.entities.appId as string) || '').toLowerCase().trim();
  return APP_ALIASES[raw] || raw || null;
}

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  const app = resolveApp(intent);

  switch (intent.action) {
    case 'new-project': {
      if (app) {
        win.webContents.send('uki:launchApp', app);
        win.webContents.send('uki:creative', { action: 'new-project', app });
        return { success: true, response: successResponse(`Creating a new project in ${app}.`) };
      }
      return { success: false, response: 'Which app should I create the project in?' };
    }

    case 'apply-effect': {
      const effect = intent.entities.effect as string;
      win.webContents.send('uki:creative', { action: 'apply-effect', effect, app });
      return { success: true, response: successResponse(`Applying ${effect || 'selected'} effect.`) };
    }

    case 'render':
    case 'export': {
      const format = (intent.entities.format as string) || 'default';
      win.webContents.send('uki:creative', { action: 'export', app, format });
      return { success: true, response: successResponse(`Starting export${format !== 'default' ? ` as ${format}` : ''}.`) };
    }

    case 'play':
    case 'resume': {
      win.webContents.send('uki:creative', { action: 'play', app });
      return { success: true, response: successResponse('Playing.') };
    }

    case 'pause':
    case 'stop': {
      win.webContents.send('uki:creative', { action: 'stop', app });
      return { success: true, response: successResponse('Stopped.') };
    }

    case 'save': {
      win.webContents.send('uki:creative', { action: 'save', app });
      return { success: true, response: successResponse('Saved.') };
    }

    case 'undo':
      win.webContents.send('uki:creative', { action: 'undo', app });
      return { success: true, response: successResponse('Undone.') };

    case 'redo':
      win.webContents.send('uki:creative', { action: 'redo', app });
      return { success: true, response: successResponse('Redone.') };

    case 'zoom-in':
      win.webContents.send('uki:creative', { action: 'zoom-in', app });
      return { success: true, response: successResponse('Zoomed in.') };

    case 'zoom-out':
      win.webContents.send('uki:creative', { action: 'zoom-out', app });
      return { success: true, response: successResponse('Zoomed out.') };

    case 'select-all':
      win.webContents.send('uki:creative', { action: 'select-all', app });
      return { success: true, response: successResponse('Selected all.') };

    case 'open': {
      if (app) {
        win.webContents.send('uki:launchApp', app);
        return { success: true, response: successResponse(`Opening ${app}.`), openApp: app };
      }
      return { success: false, response: 'Which creative app do you want to open?' };
    }

    default:
      return { success: false, response: errorResponse('I don\'t know how to handle that creative command yet.') };
  }
}
