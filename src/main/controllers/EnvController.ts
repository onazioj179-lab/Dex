// =============================================================================
// DEX Platform - Environment Variables Controller (Tier 5 / 44)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Two surfaces:
//   1. System env (process.env) -- READ-ONLY view. Persistently rewriting OS
//      env is platform-specific and reboot-prone, so we expose it for
//      inspection only (what the app actually sees) rather than silently
//      editing the user's shell profile / registry.
//   2. DEX-managed overlays -- editable key/value sets stored in
//      userData/dex-env.json, scoped 'global' or per-app. These are the vars
//      DEX owns and can inject into processes it launches.
// All handlers are defensive and never throw across IPC.
// =============================================================================

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

interface ManagedEnv {
  global: Record<string, string>;
  apps: Record<string, Record<string, string>>;
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'dex-env.json');
}

function readManaged(): ManagedEnv {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      global: parsed && typeof parsed.global === 'object' ? parsed.global : {},
      apps: parsed && typeof parsed.apps === 'object' ? parsed.apps : {},
    };
  } catch {
    return { global: {}, apps: {} };
  }
}

function writeManaged(data: ManagedEnv): boolean {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    log.warn('[env] write failed:', e);
    return false;
  }
}

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ok(message = ''): { success: true; message: string } { return { success: true, message }; }
function fail(message: string): { success: false; message: string } { return { success: false, message }; }

let registered = false;

export function registerEnvHandlers(): void {
  if (registered) return;
  registered = true;

  // Read-only snapshot of the real process environment.
  ipcMain.handle('env:listSystem', async () => {
    try {
      return Object.entries(process.env)
        .map(([name, value]) => ({ name, value: value ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      log.warn('[env] listSystem failed:', e);
      return [];
    }
  });

  // All DEX-managed overlays (global + per-app).
  ipcMain.handle('env:getManaged', async () => readManaged());

  ipcMain.handle('env:setManaged', async (_e, scope: string, name: string, value: string) => {
    if (typeof name !== 'string' || !VALID_NAME.test(name)) {
      return fail('Invalid name. Use letters, digits, and underscores; cannot start with a digit.');
    }
    if (typeof value !== 'string') return fail('Value must be a string');
    if (typeof scope !== 'string' || !scope) return fail('Invalid scope');
    const data = readManaged();
    if (scope === 'global') {
      data.global[name] = value;
    } else {
      data.apps[scope] = data.apps[scope] || {};
      data.apps[scope][name] = value;
    }
    return writeManaged(data) ? ok('Saved') : fail('Could not persist');
  });

  ipcMain.handle('env:deleteManaged', async (_e, scope: string, name: string) => {
    const data = readManaged();
    if (scope === 'global') {
      delete data.global[name];
    } else if (data.apps[scope]) {
      delete data.apps[scope][name];
      if (Object.keys(data.apps[scope]).length === 0) delete data.apps[scope];
    }
    return writeManaged(data) ? ok('Removed') : fail('Could not persist');
  });

  log.info('[env] handlers registered');
}

export default registerEnvHandlers;
