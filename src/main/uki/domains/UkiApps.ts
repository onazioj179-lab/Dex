// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Apps Domain
// Handles app launch, close, and creation commands
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

const APP_LABELS: Record<string, string> = {
  home: 'Home', files: 'Files', notes: 'Notes', browser: 'Browser',
  settings: 'Settings', transfers: 'Transfers', tasks: 'Tasks',
  gallery: 'Gallery', audio: 'Audio', workflows: 'Workflows',
  calendar: 'Calendar', calculator: 'Calculator', passwordgenerator: 'Password Gen',
  videoeditor: 'VINX', imosion: 'Imosion', prism: 'PRISM', flux: 'FLUX',
  forge: 'FORGE', axl: 'AXL', rewind: 'Rewind', kanban: 'Kanban',
  achievements: 'Trophies', recyclebin: 'Trash', weather: 'Weather',
  worldclock: 'World Clock', noisegenerator: 'Noise', markdown: 'Markdown',
  nexus: 'Nexus', stopwatch: 'Stopwatch', unitconverter: 'Converter',
  pomodoro: 'Pomodoro', qrcode: 'QR Code', colorpicker: 'Colors',
};

export function handleLaunch(intent: UkiIntent, win: BrowserWindow): UkiResult {
  const appId = intent.entities.appId as string;
  if (!appId) {
    const raw = (intent.entities.app as string) || (intent.entities.target as string) || '';
    return { success: false, response: `I couldn't find an app called "${raw}". Try saying "help" to see available apps.` };
  }

  const label = APP_LABELS[appId] || appId;
  win.webContents.send('uki:launchApp', appId);
  return { success: true, response: successResponse(`Launching ${label}.`), openApp: appId };
}

export function handleClose(intent: UkiIntent, win: BrowserWindow): UkiResult {
  if (intent.action === 'close-all') {
    win.webContents.send('uki:closeAllApps');
    return { success: true, response: successResponse('Closing all apps.') };
  }

  const appId = intent.entities.appId as string;
  if (!appId) {
    const raw = (intent.entities.app as string) || '';
    return { success: false, response: `I couldn't find an app called "${raw}".` };
  }

  const label = APP_LABELS[appId] || appId;
  win.webContents.send('uki:closeApp', appId);
  return { success: true, response: successResponse(`Closing ${label}.`) };
}

export function handleCreate(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'note': {
      const title = intent.entities.title as string;
      win.webContents.send('uki:navigate', 'notes');
      win.webContents.send('uki:create', { type: 'note', title });
      return { success: true, response: successResponse(title ? `Creating note "${title}".` : 'Creating a new note.') };
    }
    case 'task': {
      const title = intent.entities.title as string;
      win.webContents.send('uki:navigate', 'tasks');
      win.webContents.send('uki:create', { type: 'task', title });
      return { success: true, response: successResponse(title ? `Creating task "${title}".` : 'Creating a new task.') };
    }
    case 'reminder': {
      const text = intent.entities.text as string;
      win.webContents.send('uki:create', { type: 'reminder', text });
      return { success: true, response: successResponse(text ? `Setting reminder: ${text}.` : 'Setting a reminder.') };
    }
    case 'workflow': {
      const name = intent.entities.name as string;
      win.webContents.send('uki:navigate', 'workflows');
      win.webContents.send('uki:create', { type: 'workflow', name });
      return { success: true, response: successResponse(name ? `Creating workflow "${name}".` : 'Creating a new workflow.') };
    }
    default:
      return { success: false, response: errorResponse('I don\'t know how to create that.') };
  }
}
