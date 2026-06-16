// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The ONE renderer-side executor for a DexCommand. Every surface (terminal,
// command palette, UKI) runs commands through this, so behaviour is defined
// once:
//   - App commands launch via the running-apps store (using APP_DEFINITIONS for
//     the launch payload -- no duplicate app metadata).
//   - Action commands dispatch a single `dex-command` window event; AppManager
//     listens and routes the action to its existing handlers (UKI toggle, tile,
//     split, close, nav, ...). One event, one router -- no per-surface action code.
//
// Pure side-effect function; safe to call from any renderer surface.

import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';
import type { DexCommand } from '../../shared/commands/dexCommands';

/** Window event other parts of the shell listen for to run a DEX action. */
export const DEX_COMMAND_EVENT = 'dex-command';

export interface DexCommandEventDetail {
  action: string;
  id: string;
  args?: string[];
}

export function executeDexCommand(cmd: DexCommand, args: string[] = []): void {
  if (cmd.appId) {
    const def = APP_DEFINITIONS[cmd.appId];
    useRunningApps.getState().launchApp({
      id: cmd.appId,
      name: def?.name ?? cmd.appId,
      icon: def?.icon || cmd.appId,
      color: def?.color ?? 'var(--color-accent)',
    });
    return;
  }
  if (cmd.action) {
    window.dispatchEvent(
      new CustomEvent<DexCommandEventDetail>(DEX_COMMAND_EVENT, {
        detail: { action: cmd.action, id: cmd.id, args },
      }),
    );
  }
}
