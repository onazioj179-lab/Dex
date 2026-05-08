// =============================================================================
// DEX Platform — Phase 2: Game scanner (host-side, dep-injected)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Discovers installed games by reading storefront manifest directories.
 * Filesystem access is injected to keep the scanner deterministic and
 * unit-testable without touching the real disk.
 */

import { parseSteamManifest, parseEpicManifest, type DiscoveredGame, type GameSource } from './launcher';

export interface ScannerFs {
  /** Returns true if a path exists. */
  exists(p: string): Promise<boolean>;
  /** Lists immediate children (file or dir names). */
  list(dir: string): Promise<string[]>;
  /** Reads a UTF-8 text file. */
  readText(p: string): Promise<string>;
}

export interface ScanLocations {
  steamLibraries?: string[]; // each library has steamapps/appmanifest_*.acf
  epicManifestsDir?: string; // Epic stores .item files
  gogGamesDir?: string;      // each subdir is a GOG game
  itchAppsDir?: string;      // itch.io app dir
}

export interface ScanResult {
  games: DiscoveredGame[];
  errors: { source: GameSource; path: string; reason: string }[];
}

/** Best-effort parse of a Steam .acf file. Only extracts appid + name. */
function parseAcf(text: string): { appid?: string; name?: string } {
  const appMatch = /"appid"\s+"(\d+)"/.exec(text);
  const nameMatch = /"name"\s+"([^"]+)"/.exec(text);
  return {
    appid: appMatch?.[1],
    name: nameMatch?.[1],
  };
}

export async function scanGames(loc: ScanLocations, fs: ScannerFs): Promise<ScanResult> {
  const games: DiscoveredGame[] = [];
  const errors: ScanResult['errors'] = [];

  // Steam
  for (const lib of loc.steamLibraries ?? []) {
    const appsDir = `${lib}/steamapps`;
    if (!(await fs.exists(appsDir))) continue;
    const entries = await fs.list(appsDir);
    for (const name of entries) {
      if (!name.startsWith('appmanifest_') || !name.endsWith('.acf')) continue;
      try {
        const text = await fs.readText(`${appsDir}/${name}`);
        const parsed = parseAcf(text);
        const g = parseSteamManifest({ appid: parsed.appid ?? '', name: parsed.name ?? '' });
        if (g) games.push({ ...g, installPath: appsDir });
        else errors.push({ source: 'steam', path: name, reason: 'invalid-manifest' });
      } catch (e) {
        errors.push({ source: 'steam', path: name, reason: e instanceof Error ? e.message : 'read-failed' });
      }
    }
  }

  // Epic
  if (loc.epicManifestsDir && await fs.exists(loc.epicManifestsDir)) {
    const items = await fs.list(loc.epicManifestsDir);
    for (const name of items) {
      if (!name.endsWith('.item')) continue;
      try {
        const text = await fs.readText(`${loc.epicManifestsDir}/${name}`);
        const json = JSON.parse(text);
        const g = parseEpicManifest(json);
        if (g) games.push(g);
        else errors.push({ source: 'epic', path: name, reason: 'invalid-manifest' });
      } catch (e) {
        errors.push({ source: 'epic', path: name, reason: e instanceof Error ? e.message : 'read-failed' });
      }
    }
  }

  // GOG (subdir = game)
  if (loc.gogGamesDir && await fs.exists(loc.gogGamesDir)) {
    const subs = await fs.list(loc.gogGamesDir);
    for (const sub of subs) {
      games.push({ id: `gog:${sub}`, source: 'gog', title: sub, installPath: `${loc.gogGamesDir}/${sub}` });
    }
  }

  // itch.io (subdir = game)
  if (loc.itchAppsDir && await fs.exists(loc.itchAppsDir)) {
    const subs = await fs.list(loc.itchAppsDir);
    for (const sub of subs) {
      games.push({ id: `itch:${sub}`, source: 'itch', title: sub, installPath: `${loc.itchAppsDir}/${sub}` });
    }
  }

  // Dedupe by id (same game may appear if a library is listed twice)
  const seen = new Map<string, DiscoveredGame>();
  for (const g of games) if (!seen.has(g.id)) seen.set(g.id, g);
  return { games: Array.from(seen.values()), errors };
}
