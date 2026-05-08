// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { scanGames, type ScannerFs } from '../../src/shared/games/scanner';

function fakeFs(tree: Record<string, string | string[]>): ScannerFs {
  return {
    exists: async (p) => p in tree,
    list: async (p) => {
      const v = tree[p];
      return Array.isArray(v) ? v : [];
    },
    readText: async (p) => {
      const v = tree[p];
      if (typeof v === 'string') return v;
      throw new Error('not a file: ' + p);
    },
  };
}

describe('Game scanner', () => {
  it('reads steam .acf files', async () => {
    const fs = fakeFs({
      '/lib/steamapps': ['appmanifest_440.acf', 'README.md'],
      '/lib/steamapps/appmanifest_440.acf': '"AppState" {\n"appid"\t"440"\n"name"\t"TF2"\n}',
    });
    const r = await scanGames({ steamLibraries: ['/lib'] }, fs);
    expect(r.games.length).toBe(1);
    expect(r.games[0]!.id).toBe('steam:440');
  });

  it('reads epic .item files', async () => {
    const fs = fakeFs({
      '/epic': ['ABC.item'],
      '/epic/ABC.item': JSON.stringify({ AppName: 'a-fortnite-id', DisplayName: 'Fortnite' }),
    });
    const r = await scanGames({ epicManifestsDir: '/epic' }, fs);
    expect(r.games[0]!.title).toBe('Fortnite');
  });

  it('records errors for malformed files', async () => {
    const fs = fakeFs({
      '/lib/steamapps': ['appmanifest_x.acf'],
      '/lib/steamapps/appmanifest_x.acf': 'totally invalid',
    });
    const r = await scanGames({ steamLibraries: ['/lib'] }, fs);
    expect(r.errors[0]?.reason).toBe('invalid-manifest');
  });

  it('discovers GOG and itch subdirs', async () => {
    const fs = fakeFs({
      '/gog': ['Witcher3', 'Cyberpunk'],
      '/itch': ['cool-game'],
    });
    const r = await scanGames({ gogGamesDir: '/gog', itchAppsDir: '/itch' }, fs);
    expect(r.games.find(g => g.id === 'gog:Witcher3')).toBeDefined();
    expect(r.games.find(g => g.id === 'itch:cool-game')).toBeDefined();
  });

  it('dedupes ids across libraries', async () => {
    const fs = fakeFs({
      '/a/steamapps': ['appmanifest_440.acf'],
      '/a/steamapps/appmanifest_440.acf': '"appid" "440" "name" "TF2"',
      '/b/steamapps': ['appmanifest_440.acf'],
      '/b/steamapps/appmanifest_440.acf': '"appid" "440" "name" "TF2"',
    });
    const r = await scanGames({ steamLibraries: ['/a', '/b'] }, fs);
    expect(r.games.length).toBe(1);
  });
});
