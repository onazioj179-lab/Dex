// =============================================================================
// DEX Platform — Phase 3 host: Games launcher
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Mounts the game scanner + launch planner onto the Electron main process.
 * IPC channels:
 *   games:scan          (locOverride?) -> ScanResult
 *   games:list          -> DiscoveredGame[]
 *   games:plan-launch   (gameId, opts?) -> LaunchPlan | null
 *   games:launch        (gameId, opts?) -> { ok, pid? }
 *   games:playtime      -> Record<gameId, PlaytimeRecord>
 */

import { app, ipcMain } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import {
  scanGames,
  type ScanLocations,
  type ScanResult,
  type ScannerFs,
} from '../../shared/games/scanner';
import {
  planLaunch,
  recordSession,
  type DiscoveredGame,
  type LaunchPlan,
  type PlaytimeRecord,
} from '../../shared/games/launcher';

const PLAYTIME_FILE = (): string => path.join(app.getPath('userData'), 'games-playtime.json');

let cachedGames: DiscoveredGame[] | null = null;
let playtimeCache: Record<string, PlaytimeRecord> | null = null;

const fsAdapter: ScannerFs = {
  exists: async (p) => {
    try { await fs.stat(p); return true; } catch { return false; }
  },
  list: async (dir) => {
    try { return await fs.readdir(dir); } catch { return []; }
  },
  readText: async (p) => fs.readFile(p, 'utf8'),
};

/** Best-effort default locations per OS. Real impl reads user prefs. */
function defaultLocations(): ScanLocations {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return {
      steamLibraries: ['C:/Program Files (x86)/Steam'],
      epicManifestsDir: 'C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests',
      gogGamesDir: 'C:/GOG Games',
    };
  }
  if (process.platform === 'darwin') {
    return {
      steamLibraries: [path.join(home, 'Library/Application Support/Steam')],
    };
  }
  return {
    steamLibraries: [path.join(home, '.steam/steam')],
    itchAppsDir: path.join(home, '.config/itch/apps'),
  };
}

function loadPlaytime(): Record<string, PlaytimeRecord> {
  if (playtimeCache) return playtimeCache;
  try {
    const raw = require('fs').readFileSync(PLAYTIME_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') { playtimeCache = parsed as Record<string, PlaytimeRecord>; return playtimeCache; }
  } catch { /* first run */ }
  playtimeCache = {};
  return playtimeCache;
}

function persistPlaytime(): void {
  if (!playtimeCache) return;
  try { require('fs').writeFileSync(PLAYTIME_FILE(), JSON.stringify(playtimeCache, null, 2), 'utf8'); }
  catch (e) { log.warn('[Games] persist playtime failed', e); }
}

export async function scan(loc?: ScanLocations): Promise<ScanResult> {
  const result = await scanGames(loc ?? defaultLocations(), fsAdapter);
  cachedGames = result.games;
  return result;
}

export function getGames(): DiscoveredGame[] {
  return cachedGames ? [...cachedGames] : [];
}

export function planFor(gameId: string, opts?: { overlay?: boolean }): LaunchPlan | null {
  const g = (cachedGames ?? []).find(x => x.id === gameId);
  if (!g) return null;
  return planLaunch(g, opts);
}

export async function launch(gameId: string, opts?: { overlay?: boolean }): Promise<{ ok: boolean; pid?: number; error?: string }> {
  const plan = planFor(gameId, opts);
  if (!plan) return { ok: false, error: 'unknown-game' };
  if (plan.command.length === 0) return { ok: false, error: 'no-command' };
  const [cmd, ...args] = plan.command;
  if (cmd === '__internal:openWebRuntime') {
    // TODO: route to web runtime BrowserWindow.
    return { ok: false, error: 'web-runtime-unimplemented' };
  }
  try {
    const child = spawn(cmd!, args, { cwd: plan.cwd, detached: true, stdio: 'ignore' });
    child.unref();
    const startMs = Date.now();
    child.on('exit', () => {
      const sec = Math.round((Date.now() - startMs) / 1000);
      const pt = loadPlaytime();
      pt[gameId] = recordSession(pt[gameId], gameId, sec, new Date().toISOString());
      playtimeCache = pt;
      persistPlaytime();
    });
    return { ok: true, pid: child.pid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'spawn-failed' };
  }
}

export function getPlaytime(): Record<string, PlaytimeRecord> {
  return { ...loadPlaytime() };
}

export function registerGamesIpc(): void {
  ipcMain.handle('games:scan', (_e, loc?: ScanLocations) => scan(loc));
  ipcMain.handle('games:list', () => getGames());
  ipcMain.handle('games:plan-launch', (_e, id: string, opts?: { overlay?: boolean }) => planFor(id, opts));
  ipcMain.handle('games:launch', (_e, id: string, opts?: { overlay?: boolean }) => launch(id, opts));
  ipcMain.handle('games:playtime', () => getPlaytime());
}
