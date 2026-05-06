// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Files Domain
// Handles file operations (search, create, delete, rename, move)
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'search': {
      const query = (intent.entities.query as string) || '';
      if (!query) return { success: false, response: 'What should I search for?' };
      win.webContents.send('uki:navigate', 'files');
      win.webContents.send('uki:files', { action: 'search', query });
      return { success: true, response: successResponse(`Searching for "${query}".`) };
    }

    case 'create-folder': {
      const name = (intent.entities.name as string) || 'New Folder';
      win.webContents.send('uki:files', { action: 'create-folder', name });
      return { success: true, response: successResponse(`Creating folder "${name}".`) };
    }

    case 'delete': {
      const target = (intent.entities.target as string) || '';
      if (!target) return { success: false, response: 'What should I delete?' };
      win.webContents.send('uki:files', { action: 'delete', target });
      return { success: true, response: successResponse(`Deleting "${target}".`) };
    }

    case 'rename': {
      const from = intent.entities.from as string;
      const to = intent.entities.to as string;
      if (!from || !to) return { success: false, response: 'Please specify what to rename and the new name.' };
      win.webContents.send('uki:files', { action: 'rename', from, to });
      return { success: true, response: successResponse(`Renaming "${from}" to "${to}".`) };
    }

    case 'move': {
      const source = intent.entities.source as string;
      const dest = intent.entities.dest as string;
      const op = (intent.entities.op as string) || 'move';
      if (!source || !dest) return { success: false, response: `Where should I ${op} the file?` };
      win.webContents.send('uki:files', { action: op, source, dest });
      return { success: true, response: successResponse(`${op === 'copy' ? 'Copying' : 'Moving'} "${source}" to "${dest}".`) };
    }

    case 'recent':
      win.webContents.send('uki:navigate', 'files');
      win.webContents.send('uki:files', { action: 'sort-recent' });
      return { success: true, response: successResponse('Showing recent files.') };

    case 'send': {
      const target = intent.entities.target as string;
      win.webContents.send('uki:navigate', 'transfers');
      return { success: true, response: target ? successResponse(`Opening transfers to send to ${target}.`) : successResponse('Opening transfers.') };
    }

    default:
      return { success: false, response: errorResponse('I don\'t know how to do that with files.') };
  }
}
