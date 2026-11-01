// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Canvas boards (whiteboards in folders, IndexedDB-backed) + migration of the
// legacy single localStorage drawing.
//
import { describe, it, expect } from 'vitest';
import {
  type BoardStore, type BoardsIndex, LEGACY_KEY, addBoard, renameBoard, moveBoard, removeBoard,
  groupByFolder, loadIndex, loadBoard,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/canvasBoards';

function memStore(): BoardStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    async get<T>(k: string) { return map.get(k) as T | undefined; },
    async set<T>(k: string, v: T) { map.set(k, structuredClone(v)); },
    async del(k: string) { map.delete(k); },
  };
}
function memLs(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => { m.delete(k); }, has: (k: string) => m.has(k) };
}

describe('board index operations', () => {
  const empty: BoardsIndex = { boards: [], activeId: '' };
  it('adds, renames, files and removes boards', () => {
    let idx = addBoard(empty, 'Ideas', '', 'a', 1);
    idx = addBoard(idx, '  ', 'Work', 'b', 2);
    expect(idx.activeId).toBe('b');
    expect(idx.boards.find(b => b.id === 'b')!.name).toBe('Untitled board');
    idx = renameBoard(idx, 'b', 'Roadmap');
    idx = renameBoard(idx, 'b', '   '); // blank rename ignored
    expect(idx.boards.find(b => b.id === 'b')!.name).toBe('Roadmap');
    idx = moveBoard(idx, 'a', ' Personal ');
    expect(groupByFolder(idx).map(g => g.folder)).toEqual(['Personal', 'Work']);
    idx = removeBoard(idx, 'b');
    expect(idx.activeId).toBe('a');
  });
  it('lists unfiled boards first, then folders alphabetically', () => {
    let idx = addBoard(empty, 'Z', 'Zeta', 'z');
    idx = addBoard(idx, 'Loose', '', 'l');
    idx = addBoard(idx, 'A', 'Alpha', 'x');
    expect(groupByFolder(idx).map(g => g.folder)).toEqual(['', 'Alpha', 'Zeta']);
  });
});

describe('first run / migration', () => {
  const layers = [{ id: 'l1', name: 'Layer 1', visible: true, opacity: 1, data: 'data:image/png;base64,AAAA' }];
  it('moves the legacy localStorage drawing into the first board, then removes the old copy', async () => {
    const store = memStore();
    const ls = memLs({ [LEGACY_KEY]: JSON.stringify({ layers, activeLayerId: 'l1' }) });
    const idx = await loadIndex(store, ls);
    expect(idx.boards).toHaveLength(1);
    expect(idx.boards[0].name).toBe('My canvas');
    expect((await loadBoard(idx.activeId, store))?.layers).toEqual(layers);
    expect(ls.has(LEGACY_KEY)).toBe(false);
  });
  it('keeps the legacy copy when it cannot be parsed', async () => {
    const ls = memLs({ [LEGACY_KEY]: '{broken' });
    await loadIndex(memStore(), ls);
    expect(ls.has(LEGACY_KEY)).toBe(true);
  });
  it('returns the existing index on later runs', async () => {
    const store = memStore();
    const first = await loadIndex(store, memLs());
    const again = await loadIndex(store, memLs());
    expect(again).toEqual(first);
  });
});
