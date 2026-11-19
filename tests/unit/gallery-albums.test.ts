// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { addToAlbum, removeFromAlbum, pruneAlbums, loadAlbums } from '../../src/renderer/pages/galleryAlbums';

describe('Gallery user albums', () => {
  it('creates an album on first add, then adds to it by name (case-insensitive) without duplicates', () => {
    const a = addToAlbum([], 'Trip 2026', ['C:/p/1.jpg', 'C:/p/2.jpg'], 1);
    expect(a.added).toBe(2);
    const b = addToAlbum(a.albums, 'trip 2026', ['C:/p/2.jpg', 'C:/p/3.jpg'], 2);
    expect(b.albums).toHaveLength(1);
    expect(b.added).toBe(1);
    expect(b.album.itemIds).toEqual(['C:/p/1.jpg', 'C:/p/2.jpg', 'C:/p/3.jpg']);
  });
  it('removes items from one album only, and prunes items that left the library', () => {
    let al = addToAlbum([], 'A', ['x', 'y'], 1).albums;
    al = addToAlbum(al, 'B', ['x'], 2).albums;
    al = removeFromAlbum(al, al[0].id, ['x']);
    expect(al.map((a) => a.itemIds)).toEqual([['y'], ['x']]);
    const pruned = pruneAlbums(al, new Set(['y']));
    expect(pruned.map((a) => a.itemIds)).toEqual([['y'], []]);
    expect(pruneAlbums(pruned, new Set(['y']))).toBe(pruned); // unchanged → same object
  });
  it('reads stored albums defensively', () => {
    expect(loadAlbums({ getItem: () => 'junk' })).toEqual([]);
    expect(loadAlbums({ getItem: () => JSON.stringify([{ id: 'a', name: 'n', itemIds: [] }, { bad: true }]) })).toHaveLength(1);
  });
});
