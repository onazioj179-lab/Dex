// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Automation Domain
// Handles workflow execution and scheduling commands
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'run-workflow': {
      const name = (intent.entities.name as string) || '';
      if (!name) return { success: false, response: 'Which workflow should I run?' };
      win.webContents.send('uki:automation', { action: 'run-workflow', name });
      return { success: true, response: successResponse(`Running workflow "${name}".`) };
    }

    case 'schedule': {
      const when = (intent.entities.when as string) || '';
      if (!when) return { success: false, response: 'When should I set the reminder for?' };
      win.webContents.send('uki:automation', { action: 'schedule', when });
      return { success: true, response: successResponse(`Scheduling for ${when}.`) };
    }

    default:
      return { success: false, response: errorResponse('I don\'t know how to handle that automation command.') };
  }
}
